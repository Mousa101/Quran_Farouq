from fastapi import FastAPI, APIRouter, HTTPException, Depends, status
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
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
    StudentScore, WeeklyRanking
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

# ============== AUTH ROUTES ==============

@api_router.post("/auth/register")
async def register(user_data: UserCreate):
    # Check if email exists
    existing = await db.users.find_one({"email": user_data.email})
    if existing:
        raise HTTPException(status_code=400, detail="البريد الإلكتروني مسجل مسبقاً")
    
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
    
    return {
        "message": "تم رفع ورقة المتابعة وتحليلها بنجاح",
        "sheet_id": sheet.id,
        "analysis": analysis_result
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
    
    return {"message": "تم تسجيل التسميع بنجاح", "recitation_id": recitation.id}

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
        group_id=student.get("group_id", ""),
        date=attendance_data.date,
        status=attendance_data.status
    )
    
    attendance_dict = attendance.model_dump()
    attendance_dict["created_at"] = attendance_dict["created_at"].isoformat()
    
    await db.attendance.insert_one(attendance_dict)
    
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
    return {"message": "مرحباً بكم في تطبيق حافظ"}

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
