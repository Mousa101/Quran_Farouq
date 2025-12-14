from fastapi import FastAPI, APIRouter, HTTPException, Depends, status
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import uuid
from pathlib import Path
from typing import List, Optional
from datetime import datetime, timezone, timedelta

from pydantic import BaseModel as PydanticBaseModel
from models import (
    UserCreate, UserLogin, User, UserResponse, 
    GroupCreate, Group,
    TrackingSheetCreate, TrackingSheet, TrackingSheetData,
    RecitationCreate, Recitation,
    AttendanceCreate, Attendance,
    ActivityCreate, Activity,
    NotificationCreate, Notification,
    StudentScore, WeeklyRanking,
    StudentProfileUpdate, StudentCreate, QURAN_JUZ
)

class BaseModel(PydanticBaseModel):
    pass
from auth import (
    get_password_hash, verify_password, create_access_token,
    get_current_user, security
)
from image_analysis import analyze_tracking_sheet

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app
app = FastAPI(title="Hafiz - Quran Memorization App")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ============== REGISTRATION CODES ==============

class RegistrationCodeCreate(BaseModel):
    role: str  # sheikh or admin
    
class RegistrationCodeResponse(BaseModel):
    code: str
    role: str
    created_at: str
    used: bool

@api_router.post("/auth/generate-code")
async def generate_registration_code(data: RegistrationCodeCreate, current_user: dict = Depends(get_current_user)):
    """Generate registration code for sheikh/admin (admin only)"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="فقط المدير يمكنه إنشاء أكواد التسجيل")
    
    if data.role not in ["sheikh", "admin"]:
        raise HTTPException(status_code=400, detail="الدور يجب أن يكون sheikh أو admin")
    
    # Generate 6-digit code
    import random
    code = ''.join([str(random.randint(0, 9)) for _ in range(6)])
    
    # Save code
    code_doc = {
        "id": str(uuid.uuid4()),
        "code": code,
        "role": data.role,
        "created_by": current_user["user_id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "used": False,
        "used_by": None
    }
    await db.registration_codes.insert_one(code_doc)
    
    return {"code": code, "role": data.role, "message": f"تم إنشاء كود تسجيل {data.role}"}

@api_router.get("/auth/codes")
async def get_registration_codes(current_user: dict = Depends(get_current_user)):
    """Get all registration codes (admin only)"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    codes = await db.registration_codes.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return codes

@api_router.delete("/auth/codes/{code}")
async def delete_registration_code(code: str, current_user: dict = Depends(get_current_user)):
    """Delete a registration code (admin only)"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    result = await db.registration_codes.delete_one({"code": code, "used": False})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="الكود غير موجود أو مستخدم")
    
    return {"message": "تم حذف الكود"}

# ============== AUTH ROUTES ==============

class UserCreateWithCode(BaseModel):
    email: str
    name: str
    password: str
    role: str
    registration_code: Optional[str] = None

@api_router.post("/auth/register")
async def register(user_data: UserCreateWithCode):
    # Check if email exists
    existing = await db.users.find_one({"email": user_data.email})
    if existing:
        raise HTTPException(status_code=400, detail="البريد الإلكتروني مسجل مسبقاً")
    
    # Validate role and registration code
    if user_data.role in ["sheikh", "admin"]:
        # Check if this is the first admin (allow without code)
        admin_count = await db.users.count_documents({"role": "admin"})
        is_first_admin = user_data.role == "admin" and admin_count == 0
        
        if not is_first_admin:
            if not user_data.registration_code or user_data.registration_code.strip() == "":
                raise HTTPException(status_code=400, detail="كود التسجيل مطلوب للشيخ والمدير")
            
            # Verify code
            code_doc = await db.registration_codes.find_one({
                "code": user_data.registration_code,
                "role": user_data.role,
                "used": False
            })
            
            if not code_doc:
                raise HTTPException(status_code=400, detail="كود التسجيل غير صحيح أو مستخدم")
    
    # Create user
    user = User(
        email=user_data.email,
        name=user_data.name,
        role=user_data.role
    )
    
    user_dict = user.model_dump()
    user_dict["password_hash"] = get_password_hash(user_data.password)
    user_dict["created_at"] = user_dict["created_at"].isoformat()
    
    await db.users.insert_one(user_dict)
    
    # Mark code as used if sheikh/admin (and code was provided)
    if user_data.role in ["sheikh", "admin"] and user_data.registration_code:
        await db.registration_codes.update_one(
            {"code": user_data.registration_code},
            {"$set": {"used": True, "used_by": user.id, "used_at": datetime.now(timezone.utc).isoformat()}}
        )
    
    # Create token
    token = create_access_token({
        "user_id": user.id,
        "email": user.email,
        "name": user.name,
        "role": user.role
    })
    
    return {
        "token": token,
        "user": UserResponse(
            id=user.id,
            email=user.email,
            name=user.name,
            role=user.role,
            group_id=user.group_id
        )
    }

@api_router.post("/auth/login")
async def login(credentials: UserLogin):
    user = await db.users.find_one({"email": credentials.email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="بيانات الدخول غير صحيحة")
    
    if not verify_password(credentials.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="بيانات الدخول غير صحيحة")
    
    token = create_access_token({
        "user_id": user["id"],
        "email": user["email"],
        "name": user["name"],
        "role": user["role"]
    })
    
    return {
        "token": token,
        "user": UserResponse(
            id=user["id"],
            email=user["email"],
            name=user["name"],
            role=user["role"],
            group_id=user.get("group_id")
        )
    }

@api_router.get("/auth/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    user = await db.users.find_one({"id": current_user["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="المستخدم غير موجود")
    return UserResponse(
        id=user["id"],
        email=user["email"],
        name=user["name"],
        role=user["role"],
        group_id=user.get("group_id")
    )

# ============== GROUP ROUTES ==============

@api_router.post("/groups")
async def create_group(group_data: GroupCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["sheikh", "admin"]:
        raise HTTPException(status_code=403, detail="غير مصرح لك بإنشاء مجموعة")
    
    group = Group(
        name=group_data.name,
        description=group_data.description,
        sheikh_id=current_user["user_id"]
    )
    
    group_dict = group.model_dump()
    group_dict["created_at"] = group_dict["created_at"].isoformat()
    
    await db.groups.insert_one(group_dict)
    
    return {"message": "تم إنشاء المجموعة بنجاح", "group_id": group.id}

@api_router.get("/groups")
async def get_groups(current_user: dict = Depends(get_current_user)):
    if current_user["role"] == "admin":
        groups = await db.groups.find({}, {"_id": 0}).to_list(100)
    elif current_user["role"] == "sheikh":
        groups = await db.groups.find({"sheikh_id": current_user["user_id"]}, {"_id": 0}).to_list(100)
    else:
        user = await db.users.find_one({"id": current_user["user_id"]}, {"_id": 0})
        if user and user.get("group_id"):
            groups = await db.groups.find({"id": user["group_id"]}, {"_id": 0}).to_list(1)
        else:
            groups = []
    return groups

class AddStudentRequest(BaseModel):
    student_id: str

@api_router.post("/groups/{group_id}/add-student")
async def add_student_to_group(group_id: str, request: AddStudentRequest, current_user: dict = Depends(get_current_user)):
    student_id = request.student_id
    if current_user["role"] not in ["sheikh", "admin"]:
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    # Verify group exists and belongs to sheikh
    group = await db.groups.find_one({"id": group_id}, {"_id": 0})
    if not group:
        raise HTTPException(status_code=404, detail="المجموعة غير موجودة")
    
    if current_user["role"] == "sheikh" and group["sheikh_id"] != current_user["user_id"]:
        raise HTTPException(status_code=403, detail="غير مصرح لك بإدارة هذه المجموعة")
    
    # Update student
    result = await db.users.update_one(
        {"id": student_id, "role": "student"},
        {"$set": {"group_id": group_id}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="الطالب غير موجود")
    
    return {"message": "تم إضافة الطالب للمجموعة بنجاح"}

@api_router.get("/groups/{group_id}/students")
async def get_group_students(group_id: str, current_user: dict = Depends(get_current_user)):
    students = await db.users.find(
        {"group_id": group_id, "role": "student"},
        {"_id": 0, "password_hash": 0}
    ).to_list(100)
    return students

# ============== TRACKING SHEET ROUTES ==============

@api_router.post("/tracking-sheets")
async def create_tracking_sheet(sheet_data: TrackingSheetCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "sheikh":
        raise HTTPException(status_code=403, detail="فقط الشيخ يمكنه رفع ورقة المتابعة")
    
    # Analyze image with AI
    analysis_result = await analyze_tracking_sheet(sheet_data.image_base64)
    
    sheet = TrackingSheet(
        student_id=sheet_data.student_id,
        sheikh_id=current_user["user_id"],
        week_start=sheet_data.week_start,
        data=TrackingSheetData(**analysis_result)
    )
    
    sheet_dict = sheet.model_dump()
    sheet_dict["created_at"] = sheet_dict["created_at"].isoformat()
    
    await db.tracking_sheets.insert_one(sheet_dict)
    
    # Create notification for student
    await create_notification_internal(
        sheet_data.student_id,
        "ورقة متابعة جديدة",
        f"تم رفع ورقة المتابعة للأسبوع {sheet_data.week_start}",
        "info"
    )
    
    # Award points based on tracking data
    tracking_points = 0
    tracking_points += analysis_result["prayers_count"]  # 1 point per prayer
    tracking_points += analysis_result["quran_sitting_minutes"] // 10  # 1 point per 10 minutes
    tracking_points += analysis_result["family_recitation_count"] * 3  # 3 points per family recitation
    
    if tracking_points > 0:
        await add_points(
            sheet_data.student_id,
            tracking_points,
            "tracking",
            f"ورقة متابعة أسبوع {sheet_data.week_start}"
        )
    
    # Check for badges
    total_tracking = await db.tracking_sheets.find({"student_id": sheet_data.student_id}, {"_id": 0}).to_list(1000)
    total_prayers = sum(t["data"]["prayers_count"] for t in total_tracking)
    total_quran_time = sum(t["data"]["quran_sitting_minutes"] for t in total_tracking)
    
    if total_prayers >= 100:
        await award_badge(sheet_data.student_id, "prayer_keeper")
    if total_quran_time >= 1000:
        await award_badge(sheet_data.student_id, "quran_lover")
    
    return {
        "message": "تم رفع ورقة المتابعة وتحليلها بنجاح",
        "sheet_id": sheet.id,
        "analysis": analysis_result,
        "points_earned": tracking_points
    }

@api_router.get("/tracking-sheets")
async def get_tracking_sheets(
    student_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    query = {}
    if current_user["role"] == "student":
        query["student_id"] = current_user["user_id"]
    elif current_user["role"] == "sheikh":
        query["sheikh_id"] = current_user["user_id"]
        if student_id:
            query["student_id"] = student_id
    elif student_id:
        query["student_id"] = student_id
    
    sheets = await db.tracking_sheets.find(query, {"_id": 0}).to_list(100)
    return sheets

# ============== RECITATION ROUTES ==============

@api_router.post("/recitations")
async def create_recitation(recitation_data: RecitationCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "sheikh":
        raise HTTPException(status_code=403, detail="فقط الشيخ يمكنه تسجيل التسميع")
    
    recitation = Recitation(
        student_id=recitation_data.student_id,
        sheikh_id=current_user["user_id"],
        surah_name=recitation_data.surah_name,
        verses_from=recitation_data.verses_from,
        verses_to=recitation_data.verses_to,
        quality_score=recitation_data.quality_score,
        mistakes_count=recitation_data.mistakes_count,
        notes=recitation_data.notes
    )
    
    recitation_dict = recitation.model_dump()
    recitation_dict["created_at"] = recitation_dict["created_at"].isoformat()
    
    await db.recitations.insert_one(recitation_dict)
    
    # Notify student
    await create_notification_internal(
        recitation_data.student_id,
        "تسميع جديد",
        f"تم تسجيل تسميعك لسورة {recitation_data.surah_name} - درجة: {recitation_data.quality_score}/10",
        "success" if recitation_data.quality_score >= 7 else "info"
    )
    
    # Award points based on quality
    points = recitation_data.quality_score * 2  # 2-20 points based on score
    if recitation_data.quality_score == 10:
        points += 10  # Bonus for perfect score
        await award_badge(recitation_data.student_id, "excellent_reciter")
    
    await add_points(
        recitation_data.student_id,
        points,
        "recitation",
        f"تسميع سورة {recitation_data.surah_name} - درجة {recitation_data.quality_score}/10"
    )
    
    # Check if first recitation
    recitation_count = await db.recitations.count_documents({"student_id": recitation_data.student_id})
    if recitation_count == 1:
        await award_badge(recitation_data.student_id, "first_recitation")
    
    return {"message": "تم تسجيل التسميع بنجاح", "recitation_id": recitation.id, "points_earned": points}

@api_router.get("/recitations")
async def get_recitations(
    student_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    query = {}
    if current_user["role"] == "student":
        query["student_id"] = current_user["user_id"]
    elif current_user["role"] == "sheikh":
        query["sheikh_id"] = current_user["user_id"]
        if student_id:
            query["student_id"] = student_id
    elif student_id:
        query["student_id"] = student_id
    
    recitations = await db.recitations.find(query, {"_id": 0}).to_list(100)
    return recitations

# ============== ATTENDANCE ROUTES ==============

@api_router.post("/attendance")
async def mark_attendance(attendance_data: AttendanceCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "sheikh":
        raise HTTPException(status_code=403, detail="فقط الشيخ يمكنه تسجيل الحضور")
    
    # Get student's group
    student = await db.users.find_one({"id": attendance_data.student_id}, {"_id": 0})
    if not student:
        raise HTTPException(status_code=404, detail="الطالب غير موجود")
    
    # Check if attendance already recorded
    existing = await db.attendance.find_one({
        "student_id": attendance_data.student_id,
        "date": attendance_data.date
    })
    
    if existing:
        # Update existing
        await db.attendance.update_one(
            {"id": existing["id"]},
            {"$set": {"status": attendance_data.status}}
        )
        return {"message": "تم تحديث الحضور"}
    
    attendance = Attendance(
        student_id=attendance_data.student_id,
        sheikh_id=current_user["user_id"],
        group_id=student.get("group_id") or "",
        date=attendance_data.date,
        status=attendance_data.status
    )
    
    attendance_dict = attendance.model_dump()
    attendance_dict["created_at"] = attendance_dict["created_at"].isoformat()
    
    await db.attendance.insert_one(attendance_dict)
    
    # Award points for attendance
    if attendance_data.status == "present":
        points = 10
        await add_points(
            attendance_data.student_id,
            points,
            "attendance",
            f"حضور يوم {attendance_data.date}"
        )
        
        # Check if first attendance
        attendance_count = await db.attendance.count_documents({
            "student_id": attendance_data.student_id,
            "status": "present"
        })
        if attendance_count == 1:
            await award_badge(attendance_data.student_id, "first_attendance")
        elif attendance_count >= 7:
            await award_badge(attendance_data.student_id, "week_streak")
        elif attendance_count >= 30:
            await award_badge(attendance_data.student_id, "month_streak")
    
    return {"message": "تم تسجيل الحضور بنجاح", "attendance_id": attendance.id}

@api_router.get("/attendance")
async def get_attendance(
    student_id: Optional[str] = None,
    date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    query = {}
    if current_user["role"] == "student":
        query["student_id"] = current_user["user_id"]
    elif current_user["role"] == "sheikh":
        query["sheikh_id"] = current_user["user_id"]
        if student_id:
            query["student_id"] = student_id
    elif student_id:
        query["student_id"] = student_id
    
    if date:
        query["date"] = date
    
    attendance = await db.attendance.find(query, {"_id": 0}).to_list(1000)
    return attendance

# ============== ACTIVITIES ROUTES ==============

@api_router.post("/activities")
async def create_activity(activity_data: ActivityCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="فقط المدير يمكنه إنشاء الأنشطة")
    
    activity = Activity(
        title=activity_data.title,
        description=activity_data.description,
        date=activity_data.date,
        time=activity_data.time,
        location=activity_data.location,
        created_by=current_user["user_id"]
    )
    
    activity_dict = activity.model_dump()
    activity_dict["created_at"] = activity_dict["created_at"].isoformat()
    
    await db.activities.insert_one(activity_dict)
    
    # Notify all users
    users = await db.users.find({}, {"_id": 0, "id": 1}).to_list(1000)
    for user in users:
        await create_notification_internal(
            user["id"],
            "نشاط جديد",
            f"{activity_data.title} - {activity_data.date}",
            "info"
        )
    
    return {"message": "تم إنشاء النشاط بنجاح", "activity_id": activity.id}

@api_router.get("/activities")
async def get_activities(current_user: dict = Depends(get_current_user)):
    activities = await db.activities.find({}, {"_id": 0}).to_list(100)
    return activities

@api_router.delete("/activities/{activity_id}")
async def delete_activity(activity_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="فقط المدير يمكنه حذف الأنشطة")
    
    result = await db.activities.delete_one({"id": activity_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="النشاط غير موجود")
    
    return {"message": "تم حذف النشاط بنجاح"}

# ============== NOTIFICATIONS ROUTES ==============

async def create_notification_internal(user_id: str, title: str, message: str, type: str = "info"):
    notification = Notification(
        user_id=user_id,
        title=title,
        message=message,
        type=type
    )
    
    notification_dict = notification.model_dump()
    notification_dict["created_at"] = notification_dict["created_at"].isoformat()
    
    await db.notifications.insert_one(notification_dict)

@api_router.get("/notifications")
async def get_notifications(current_user: dict = Depends(get_current_user)):
    notifications = await db.notifications.find(
        {"user_id": current_user["user_id"]},
        {"_id": 0}
    ).sort("created_at", -1).to_list(50)
    return notifications

@api_router.put("/notifications/{notification_id}/read")
async def mark_notification_read(notification_id: str, current_user: dict = Depends(get_current_user)):
    await db.notifications.update_one(
        {"id": notification_id, "user_id": current_user["user_id"]},
        {"$set": {"is_read": True}}
    )
    return {"message": "تم"}

@api_router.put("/notifications/read-all")
async def mark_all_notifications_read(current_user: dict = Depends(get_current_user)):
    await db.notifications.update_many(
        {"user_id": current_user["user_id"]},
        {"$set": {"is_read": True}}
    )
    return {"message": "تم تحديث جميع الإشعارات"}

# ============== RANKINGS/INCENTIVES ROUTES ==============

@api_router.get("/rankings/weekly")
async def get_weekly_rankings(
    week_start: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    # Calculate scores for all students
    students = await db.users.find({"role": "student"}, {"_id": 0}).to_list(1000)
    
    scores = []
    for student in students:
        # Get tracking sheets
        tracking = await db.tracking_sheets.find(
            {"student_id": student["id"]},
            {"_id": 0}
        ).to_list(100)
        
        tracking_score = sum(
            (t["data"]["prayers_count"] * 0.3 + 
             t["data"]["quran_sitting_minutes"] * 0.1 +
             t["data"]["family_recitation_count"] * 2)
            for t in tracking
        ) / max(len(tracking), 1)
        
        # Get recitations
        recitations = await db.recitations.find(
            {"student_id": student["id"]},
            {"_id": 0}
        ).to_list(100)
        
        recitation_score = sum(r["quality_score"] for r in recitations) / max(len(recitations), 1) * 10
        
        # Get attendance
        attendance = await db.attendance.find(
            {"student_id": student["id"]},
            {"_id": 0}
        ).to_list(1000)
        
        present_count = sum(1 for a in attendance if a["status"] == "present")
        attendance_score = (present_count / max(len(attendance), 1)) * 100
        
        total = tracking_score * 0.4 + recitation_score * 0.4 + attendance_score * 0.2
        
        scores.append(StudentScore(
            student_id=student["id"],
            student_name=student["name"],
            tracking_score=round(tracking_score, 2),
            recitation_score=round(recitation_score, 2),
            attendance_score=round(attendance_score, 2),
            total_score=round(total, 2)
        ))
    
    # Sort and assign ranks
    scores.sort(key=lambda x: x.total_score, reverse=True)
    
    for i, score in enumerate(scores):
        if i == 0:
            score.rank = "gold"
        elif i == 1:
            score.rank = "silver"
        elif i == 2:
            score.rank = "bronze"
        else:
            score.rank = "participant"
    
    return {
        "scores": [s.model_dump() for s in scores],
        "gold": scores[0].model_dump() if len(scores) > 0 else None,
        "silver": scores[1].model_dump() if len(scores) > 1 else None,
        "bronze": scores[2].model_dump() if len(scores) > 2 else None
    }

# ============== STATISTICS ROUTES ==============

@api_router.get("/statistics/student/{student_id}")
async def get_student_statistics(student_id: str, current_user: dict = Depends(get_current_user)):
    # Verify access
    if current_user["role"] == "student" and current_user["user_id"] != student_id:
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    # Get all data
    tracking = await db.tracking_sheets.find({"student_id": student_id}, {"_id": 0}).to_list(100)
    recitations = await db.recitations.find({"student_id": student_id}, {"_id": 0}).to_list(100)
    attendance = await db.attendance.find({"student_id": student_id}, {"_id": 0}).to_list(1000)
    
    total_prayers = sum(t["data"]["prayers_count"] for t in tracking)
    total_quran_time = sum(t["data"]["quran_sitting_minutes"] for t in tracking)
    total_family_recitation = sum(t["data"]["family_recitation_count"] for t in tracking)
    
    avg_recitation_score = sum(r["quality_score"] for r in recitations) / max(len(recitations), 1)
    total_verses = sum(r["verses_to"] - r["verses_from"] + 1 for r in recitations)
    
    present_count = sum(1 for a in attendance if a["status"] == "present")
    absent_count = sum(1 for a in attendance if a["status"] == "absent")
    
    return {
        "tracking": {
            "total_prayers": total_prayers,
            "total_quran_time": total_quran_time,
            "total_family_recitation": total_family_recitation,
            "sheets_count": len(tracking)
        },
        "recitation": {
            "average_score": round(avg_recitation_score, 2),
            "total_verses": total_verses,
            "recitations_count": len(recitations)
        },
        "attendance": {
            "present": present_count,
            "absent": absent_count,
            "total": len(attendance),
            "percentage": round(present_count / max(len(attendance), 1) * 100, 2)
        }
    }

@api_router.get("/statistics/overview")
async def get_overview_statistics(current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "sheikh"]:
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    total_students = await db.users.count_documents({"role": "student"})
    total_sheikhs = await db.users.count_documents({"role": "sheikh"})
    total_groups = await db.groups.count_documents({})
    total_activities = await db.activities.count_documents({})
    
    return {
        "total_students": total_students,
        "total_sheikhs": total_sheikhs,
        "total_groups": total_groups,
        "total_activities": total_activities
    }

# ============== USERS MANAGEMENT ==============

@api_router.get("/users")
async def get_users(role: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "sheikh"]:
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    query = {}
    if role:
        query["role"] = role
    
    if current_user["role"] == "sheikh":
        # Sheikh can only see students in their groups
        groups = await db.groups.find({"sheikh_id": current_user["user_id"]}, {"_id": 0, "id": 1}).to_list(100)
        group_ids = [g["id"] for g in groups]
        query["$or"] = [
            {"group_id": {"$in": group_ids}},
            {"role": "student", "group_id": None}
        ]
    
    users = await db.users.find(query, {"_id": 0, "password_hash": 0}).to_list(1000)
    return users

@api_router.get("/")
async def root():
    return {"message": "مرحباً بكم في مركز الفاروق القرآني"}

# ============== POINTS & BADGES SYSTEM ==============

# Define available badges
BADGES = [
    {"id": "first_attendance", "name": "أول حضور", "description": "حضرت أول حلقة", "icon": "🌟", "points_required": 0, "category": "attendance"},
    {"id": "week_streak", "name": "أسبوع متواصل", "description": "حضرت أسبوع كامل", "icon": "🔥", "points_required": 70, "category": "attendance"},
    {"id": "month_streak", "name": "شهر متواصل", "description": "حضرت شهر كامل", "icon": "💎", "points_required": 300, "category": "attendance"},
    {"id": "first_recitation", "name": "أول تسميع", "description": "أتممت أول تسميع", "icon": "📖", "points_required": 0, "category": "recitation"},
    {"id": "excellent_reciter", "name": "متميز في التسميع", "description": "حصلت على 10/10 في التسميع", "icon": "⭐", "points_required": 100, "category": "recitation"},
    {"id": "quran_lover", "name": "محب القرآن", "description": "جلست 1000 دقيقة مع القرآن", "icon": "❤️", "points_required": 500, "category": "tracking"},
    {"id": "prayer_keeper", "name": "محافظ على الصلاة", "description": "أديت 100 صلاة", "icon": "🕌", "points_required": 200, "category": "tracking"},
    {"id": "gold_winner", "name": "فائز ذهبي", "description": "حصلت على المركز الأول", "icon": "🥇", "points_required": 0, "category": "special"},
    {"id": "silver_winner", "name": "فائز فضي", "description": "حصلت على المركز الثاني", "icon": "🥈", "points_required": 0, "category": "special"},
    {"id": "bronze_winner", "name": "فائز برونزي", "description": "حصلت على المركز الثالث", "icon": "🥉", "points_required": 0, "category": "special"},
    {"id": "100_points", "name": "100 نقطة", "description": "وصلت إلى 100 نقطة", "icon": "💯", "points_required": 100, "category": "special"},
    {"id": "500_points", "name": "500 نقطة", "description": "وصلت إلى 500 نقطة", "icon": "🏆", "points_required": 500, "category": "special"},
    {"id": "1000_points", "name": "1000 نقطة", "description": "وصلت إلى 1000 نقطة", "icon": "👑", "points_required": 1000, "category": "special"},
]

def calculate_level(total_points: int) -> int:
    """Calculate level based on total points"""
    if total_points < 100:
        return 1
    elif total_points < 300:
        return 2
    elif total_points < 600:
        return 3
    elif total_points < 1000:
        return 4
    elif total_points < 1500:
        return 5
    elif total_points < 2500:
        return 6
    elif total_points < 4000:
        return 7
    elif total_points < 6000:
        return 8
    elif total_points < 9000:
        return 9
    else:
        return 10

async def add_points(student_id: str, points: int, category: str, description: str):
    """Add points to a student and check for new badges"""
    # Get or create student points record
    student_points = await db.student_points.find_one({"student_id": student_id}, {"_id": 0})
    
    if not student_points:
        student_points = {
            "id": str(uuid.uuid4()),
            "student_id": student_id,
            "total_points": 0,
            "attendance_points": 0,
            "recitation_points": 0,
            "tracking_points": 0,
            "badges": [],
            "level": 1,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        await db.student_points.insert_one(student_points)
    
    # Update points
    category_field = f"{category}_points" if category in ["attendance", "recitation", "tracking"] else "total_points"
    
    update_dict = {
        "total_points": student_points["total_points"] + points,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    if category in ["attendance", "recitation", "tracking"]:
        update_dict[category_field] = student_points.get(category_field, 0) + points
    
    # Calculate new level
    new_level = calculate_level(update_dict["total_points"])
    update_dict["level"] = new_level
    
    await db.student_points.update_one(
        {"student_id": student_id},
        {"$set": update_dict}
    )
    
    # Record transaction
    transaction = {
        "id": str(uuid.uuid4()),
        "student_id": student_id,
        "points": points,
        "category": category,
        "description": description,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.points_transactions.insert_one(transaction)
    
    # Check for new badges
    new_badges = await check_and_award_badges(student_id, update_dict["total_points"])
    
    # Notify if level up
    if new_level > student_points.get("level", 1):
        await create_notification_internal(
            student_id,
            "ترقية مستوى! 🎉",
            f"مبارك! وصلت للمستوى {new_level}",
            "success"
        )
    
    return {"points_added": points, "total_points": update_dict["total_points"], "level": new_level, "new_badges": new_badges}

async def check_and_award_badges(student_id: str, total_points: int) -> list:
    """Check and award badges based on points and achievements"""
    student_points = await db.student_points.find_one({"student_id": student_id}, {"_id": 0})
    current_badges = student_points.get("badges", [])
    new_badges = []
    
    # Check points-based badges
    for badge in BADGES:
        if badge["id"] not in current_badges and badge["points_required"] > 0:
            if total_points >= badge["points_required"]:
                current_badges.append(badge["id"])
                new_badges.append(badge)
                await create_notification_internal(
                    student_id,
                    f"شارة جديدة! {badge['icon']}",
                    f"حصلت على شارة: {badge['name']}",
                    "success"
                )
    
    if new_badges:
        await db.student_points.update_one(
            {"student_id": student_id},
            {"$set": {"badges": current_badges}}
        )
    
    return new_badges

async def award_badge(student_id: str, badge_id: str):
    """Award a specific badge to a student"""
    student_points = await db.student_points.find_one({"student_id": student_id}, {"_id": 0})
    
    if not student_points:
        student_points = {
            "id": str(uuid.uuid4()),
            "student_id": student_id,
            "total_points": 0,
            "attendance_points": 0,
            "recitation_points": 0,
            "tracking_points": 0,
            "badges": [],
            "level": 1,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        await db.student_points.insert_one(student_points)
    
    current_badges = student_points.get("badges", [])
    
    if badge_id not in current_badges:
        current_badges.append(badge_id)
        await db.student_points.update_one(
            {"student_id": student_id},
            {"$set": {"badges": current_badges}}
        )
        
        badge = next((b for b in BADGES if b["id"] == badge_id), None)
        if badge:
            await create_notification_internal(
                student_id,
                f"شارة جديدة! {badge['icon']}",
                f"حصلت على شارة: {badge['name']}",
                "success"
            )

@api_router.get("/points/my-points")
async def get_my_points(current_user: dict = Depends(get_current_user)):
    """Get current user's points and badges"""
    student_points = await db.student_points.find_one(
        {"student_id": current_user["user_id"]}, 
        {"_id": 0}
    )
    
    if not student_points:
        student_points = {
            "total_points": 0,
            "attendance_points": 0,
            "recitation_points": 0,
            "tracking_points": 0,
            "badges": [],
            "level": 1
        }
    
    # Get badge details
    badge_details = [b for b in BADGES if b["id"] in student_points.get("badges", [])]
    
    return {
        **student_points,
        "badge_details": badge_details,
        "next_level_points": get_next_level_points(student_points.get("level", 1))
    }

def get_next_level_points(current_level: int) -> int:
    """Get points needed for next level"""
    level_thresholds = {1: 100, 2: 300, 3: 600, 4: 1000, 5: 1500, 6: 2500, 7: 4000, 8: 6000, 9: 9000, 10: 999999}
    return level_thresholds.get(current_level, 999999)

@api_router.get("/points/student/{student_id}")
async def get_student_points(student_id: str, current_user: dict = Depends(get_current_user)):
    """Get a specific student's points (for sheikh/admin)"""
    if current_user["role"] not in ["sheikh", "admin"] and current_user["user_id"] != student_id:
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    student_points = await db.student_points.find_one(
        {"student_id": student_id}, 
        {"_id": 0}
    )
    
    if not student_points:
        student_points = {
            "total_points": 0,
            "attendance_points": 0,
            "recitation_points": 0,
            "tracking_points": 0,
            "badges": [],
            "level": 1
        }
    
    badge_details = [b for b in BADGES if b["id"] in student_points.get("badges", [])]
    
    return {
        **student_points,
        "badge_details": badge_details
    }

@api_router.get("/points/transactions")
async def get_my_transactions(current_user: dict = Depends(get_current_user)):
    """Get point transactions history"""
    transactions = await db.points_transactions.find(
        {"student_id": current_user["user_id"]},
        {"_id": 0}
    ).sort("created_at", -1).to_list(50)
    return transactions

@api_router.get("/points/leaderboard")
async def get_points_leaderboard(current_user: dict = Depends(get_current_user)):
    """Get top students by points"""
    leaderboard = await db.student_points.find(
        {},
        {"_id": 0}
    ).sort("total_points", -1).to_list(20)
    
    # Add student names
    for entry in leaderboard:
        student = await db.users.find_one({"id": entry["student_id"]}, {"_id": 0, "name": 1})
        entry["student_name"] = student["name"] if student else "غير معروف"
    
    return leaderboard

@api_router.get("/badges/all")
async def get_all_badges(current_user: dict = Depends(get_current_user)):
    """Get all available badges"""
    return BADGES

@api_router.post("/points/award-bonus")
async def award_bonus_points(
    student_id: str,
    points: int,
    reason: str,
    current_user: dict = Depends(get_current_user)
):
    """Award bonus points to a student (admin/sheikh only)"""
    if current_user["role"] not in ["admin", "sheikh"]:
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    result = await add_points(student_id, points, "bonus", reason)
    
    await create_notification_internal(
        student_id,
        "نقاط إضافية! 🎁",
        f"حصلت على {points} نقطة: {reason}",
        "success"
    )
    
    return {"message": "تم منح النقاط بنجاح", **result}

# Include the router
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
