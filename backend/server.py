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
    StudentProfileUpdate, StudentCreate, QURAN_JUZ,
    InitialAssessment, StudentSelfUpdate
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
    """Generate registration code for sheikh/admin/student (admin only)"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="فقط المدير يمكنه إنشاء أكواد التسجيل")
    
    if data.role not in ["sheikh", "admin", "student"]:
        raise HTTPException(status_code=400, detail="الدور يجب أن يكون sheikh أو admin أو student")
    
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
    
    role_names = {"student": "طالب", "sheikh": "شيخ", "admin": "مدير"}
    return {"code": code, "role": data.role, "message": f"تم إنشاء كود تسجيل {role_names.get(data.role, data.role)}"}

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
    registration_code: str  # Required for all roles
    # Phone numbers
    student_phone: Optional[str] = None
    father_phone: Optional[str] = None
    mother_phone: Optional[str] = None
    # Student fields
    mosque_name: Optional[str] = None
    school_name: Optional[str] = None
    school_grade: Optional[str] = None
    birth_date: Optional[str] = None
    profile_image: Optional[str] = None

@api_router.post("/auth/register")
async def register(user_data: UserCreateWithCode):
    # Check if email exists
    existing = await db.users.find_one({"email": user_data.email})
    if existing:
        raise HTTPException(status_code=400, detail="البريد الإلكتروني مسجل مسبقاً")
    
    # Check if this is the first admin (allow without code)
    admin_count = await db.users.count_documents({"role": "admin"})
    is_first_admin = user_data.role == "admin" and admin_count == 0
    
    if not is_first_admin:
        # All roles require registration code
        if not user_data.registration_code or user_data.registration_code.strip() == "":
            raise HTTPException(status_code=400, detail="كود التسجيل مطلوب")
        
        # Verify code
        code_doc = await db.registration_codes.find_one({
            "code": user_data.registration_code,
            "role": user_data.role,
            "used": False
        })
        
        if not code_doc:
            raise HTTPException(status_code=400, detail="كود التسجيل غير صحيح أو مستخدم أو لا يتطابق مع الدور")
    
    # Create user with all fields
    user = User(
        email=user_data.email,
        name=user_data.name,
        role=user_data.role,
        student_phone=user_data.student_phone,
        father_phone=user_data.father_phone,
        mother_phone=user_data.mother_phone,
        mosque_name=user_data.mosque_name,
        school_name=user_data.school_name,
        school_grade=user_data.school_grade,
        birth_date=user_data.birth_date,
        profile_image=user_data.profile_image
    )
    
    user_dict = user.model_dump()
    user_dict["password_hash"] = get_password_hash(user_data.password)
    user_dict["created_at"] = user_dict["created_at"].isoformat()
    user_dict["registration_date"] = user_dict["registration_date"].isoformat()
    
    await db.users.insert_one(user_dict)
    
    # Mark code as used (and code was provided)
    if user_data.registration_code:
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

class GroupCreateAdmin(BaseModel):
    name: str
    description: Optional[str] = None
    sheikh_id: str

class GroupUpdateAdmin(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    sheikh_id: Optional[str] = None

@api_router.post("/groups")
async def create_group(group_data: GroupCreateAdmin, current_user: dict = Depends(get_current_user)):
    """Create a new group (Admin only)"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="فقط المدير يمكنه إنشاء مجموعة")
    
    # Verify sheikh exists
    sheikh = await db.users.find_one({"id": group_data.sheikh_id, "role": "sheikh"})
    if not sheikh:
        raise HTTPException(status_code=404, detail="الشيخ غير موجود")
    
    group = Group(
        name=group_data.name,
        description=group_data.description,
        sheikh_id=group_data.sheikh_id
    )
    
    group_dict = group.model_dump()
    group_dict["created_at"] = group_dict["created_at"].isoformat()
    
    await db.groups.insert_one(group_dict)
    
    return {"message": "تم إنشاء المجموعة بنجاح", "group_id": group.id}

@api_router.get("/groups")
async def get_groups(current_user: dict = Depends(get_current_user)):
    if current_user["role"] == "admin":
        groups = await db.groups.find({}, {"_id": 0}).to_list(100)
        # Add sheikh name to each group
        for group in groups:
            sheikh = await db.users.find_one({"id": group.get("sheikh_id")}, {"_id": 0, "name": 1})
            group["sheikh_name"] = sheikh["name"] if sheikh else "غير معين"
            # Count students
            student_count = await db.users.count_documents({"group_id": group["id"], "role": "student"})
            group["student_count"] = student_count
    elif current_user["role"] == "sheikh":
        groups = await db.groups.find({"sheikh_id": current_user["user_id"]}, {"_id": 0}).to_list(100)
        for group in groups:
            student_count = await db.users.count_documents({"group_id": group["id"], "role": "student"})
            group["student_count"] = student_count
    else:
        user = await db.users.find_one({"id": current_user["user_id"]}, {"_id": 0})
        if user and user.get("group_id"):
            groups = await db.groups.find({"id": user["group_id"]}, {"_id": 0}).to_list(1)
        else:
            groups = []
    return groups

@api_router.put("/groups/{group_id}")
async def update_group(group_id: str, data: GroupUpdateAdmin, current_user: dict = Depends(get_current_user)):
    """Update a group (Admin only)"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="فقط المدير يمكنه تعديل المجموعة")
    
    group = await db.groups.find_one({"id": group_id})
    if not group:
        raise HTTPException(status_code=404, detail="المجموعة غير موجودة")
    
    update_data = {}
    if data.name is not None:
        update_data["name"] = data.name
    if data.description is not None:
        update_data["description"] = data.description
    if data.sheikh_id is not None:
        # Verify sheikh exists
        sheikh = await db.users.find_one({"id": data.sheikh_id, "role": "sheikh"})
        if not sheikh:
            raise HTTPException(status_code=404, detail="الشيخ غير موجود")
        update_data["sheikh_id"] = data.sheikh_id
    
    if update_data:
        await db.groups.update_one({"id": group_id}, {"$set": update_data})
    
    return {"message": "تم تحديث المجموعة بنجاح"}

@api_router.delete("/groups/{group_id}")
async def delete_group(group_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a group (Admin only)"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="فقط المدير يمكنه حذف المجموعة")
    
    group = await db.groups.find_one({"id": group_id})
    if not group:
        raise HTTPException(status_code=404, detail="المجموعة غير موجودة")
    
    # Remove group_id from all students in this group
    await db.users.update_many(
        {"group_id": group_id},
        {"$set": {"group_id": None}}
    )
    
    # Delete the group
    await db.groups.delete_one({"id": group_id})
    
    return {"message": "تم حذف المجموعة بنجاح"}

class AddStudentRequest(BaseModel):
    student_id: str

@api_router.post("/groups/{group_id}/add-student")
async def add_student_to_group(group_id: str, request: AddStudentRequest, current_user: dict = Depends(get_current_user)):
    """Add student to group (Admin only)"""
    student_id = request.student_id
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="فقط المدير يمكنه إضافة طالب للمجموعة")
    
    # Verify group exists
    group = await db.groups.find_one({"id": group_id}, {"_id": 0})
    if not group:
        raise HTTPException(status_code=404, detail="المجموعة غير موجودة")
    
    # Update student
    result = await db.users.update_one(
        {"id": student_id, "role": "student"},
        {"$set": {"group_id": group_id}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="الطالب غير موجود")
    
    return {"message": "تم إضافة الطالب للمجموعة بنجاح"}

@api_router.post("/groups/{group_id}/remove-student")
async def remove_student_from_group(group_id: str, request: AddStudentRequest, current_user: dict = Depends(get_current_user)):
    """Remove student from group (Admin only)"""
    student_id = request.student_id
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="فقط المدير يمكنه إزالة طالب من المجموعة")
    
    # Update student
    result = await db.users.update_one(
        {"id": student_id, "role": "student", "group_id": group_id},
        {"$set": {"group_id": None}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="الطالب غير موجود في هذه المجموعة")
    
    return {"message": "تم إزالة الطالب من المجموعة بنجاح"}

@api_router.get("/groups/{group_id}/students")
async def get_group_students(group_id: str, current_user: dict = Depends(get_current_user)):
    students = await db.users.find(
        {"group_id": group_id, "role": "student"},
        {"_id": 0, "password_hash": 0}
    ).to_list(100)
    return students

@api_router.get("/sheikhs")
async def get_all_sheikhs(current_user: dict = Depends(get_current_user)):
    """Get all sheikhs (Admin only)"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    sheikhs = await db.users.find(
        {"role": "sheikh"},
        {"_id": 0, "password_hash": 0}
    ).to_list(100)
    return sheikhs

# ============== INITIAL ASSESSMENT ROUTES ==============

@api_router.post("/students/{student_id}/initial-assessment")
async def submit_initial_assessment(student_id: str, data: InitialAssessment, current_user: dict = Depends(get_current_user)):
    """Submit initial assessment for a new student (Sheikh only)"""
    if current_user["role"] != "sheikh":
        raise HTTPException(status_code=403, detail="فقط الشيخ يمكنه تقييم الطالب")
    
    # Get student
    student = await db.users.find_one({"id": student_id, "role": "student"})
    if not student:
        raise HTTPException(status_code=404, detail="الطالب غير موجود")
    
    # Check if student is in sheikh's group
    group = await db.groups.find_one({"sheikh_id": current_user["user_id"]})
    if not group or student.get("group_id") != group["id"]:
        raise HTTPException(status_code=403, detail="الطالب ليس في مجموعتك")
    
    # Validate tajweed level
    valid_levels = ["تمهيدية", "متوسطة", "متقدمة"]
    if data.tajweed_level not in valid_levels:
        raise HTTPException(status_code=400, detail="مستوى التجويد غير صحيح")
    
    # Update student with initial assessment
    update_data = {
        "previous_memorization_juz": data.previous_memorization_juz,
        "previous_memorization_pages": data.previous_memorization_pages,
        "tajweed_level": data.tajweed_level,
        "initial_assessment_done": True
    }
    
    await db.users.update_one({"id": student_id}, {"$set": update_data})
    
    # Calculate total pages from previous memorization
    # Each juz has 20 pages
    total_previous_pages = len(data.previous_memorization_juz) * 20 + data.previous_memorization_pages
    
    # Create a notification for the student
    await create_notification_internal(
        student_id,
        "تم تقييمك الأولي",
        f"تم تسجيل حفظك السابق: {len(data.previous_memorization_juz)} جزء و {data.previous_memorization_pages} صفحة. مستوى التجويد: {data.tajweed_level}",
        "success"
    )
    
    # Also notify admin
    admins = await db.users.find({"role": "admin"}, {"_id": 0, "id": 1}).to_list(10)
    for admin in admins:
        await create_notification_internal(
            admin["id"],
            f"تقييم أولي للطالب {student['name']}",
            f"الحفظ السابق: {len(data.previous_memorization_juz)} جزء و {data.previous_memorization_pages} صفحة. التجويد: {data.tajweed_level}",
            "info"
        )
    
    return {
        "message": "تم تسجيل التقييم الأولي بنجاح",
        "total_previous_pages": total_previous_pages
    }

@api_router.get("/students/{student_id}/progress")
async def get_student_progress(student_id: str, current_user: dict = Depends(get_current_user)):
    """Get student's total memorization progress (old + new)"""
    # Verify access
    if current_user["role"] == "student" and current_user["user_id"] != student_id:
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    # Get student
    student = await db.users.find_one({"id": student_id, "role": "student"}, {"_id": 0, "password_hash": 0})
    if not student:
        raise HTTPException(status_code=404, detail="الطالب غير موجود")
    
    # Previous memorization (from initial assessment)
    previous_juz = student.get("previous_memorization_juz") or []
    previous_pages = student.get("previous_memorization_pages") or 0
    previous_total_pages = len(previous_juz) * 20 + previous_pages
    
    # New memorization (from recitations)
    recitations = await db.recitations.find(
        {"student_id": student_id, "recitation_type": "new_memorization"},
        {"_id": 0}
    ).to_list(1000)
    
    new_total_pages = 0
    for rec in recitations:
        if rec.get("page_from") and rec.get("page_to"):
            new_total_pages += rec["page_to"] - rec["page_from"] + 1
        elif rec.get("pages_count"):
            new_total_pages += rec["pages_count"]
    
    # Calculate total progress
    total_pages = previous_total_pages + new_total_pages
    total_juz = total_pages // 20
    remaining_pages = total_pages % 20
    
    # Calculate percentage of Quran (604 pages total)
    progress_percentage = round((total_pages / 604) * 100, 1)
    
    return {
        "student_name": student.get("name"),
        "tajweed_level": student.get("tajweed_level"),
        "initial_assessment_done": student.get("initial_assessment_done", False),
        "previous_memorization": {
            "juz": previous_juz,
            "juz_count": len(previous_juz),
            "additional_pages": previous_pages,
            "total_pages": previous_total_pages
        },
        "new_memorization": {
            "total_pages": new_total_pages,
            "recitation_count": len(recitations)
        },
        "total_progress": {
            "total_pages": total_pages,
            "total_juz": total_juz,
            "remaining_pages": remaining_pages,
            "percentage": progress_percentage,
            "description": f"{total_juz} جزء و {remaining_pages} صفحة ({progress_percentage}% من القرآن)"
        }
    }

@api_router.get("/students/pending-assessment")
async def get_students_pending_assessment(current_user: dict = Depends(get_current_user)):
    """Get students in sheikh's group who haven't been assessed yet"""
    if current_user["role"] != "sheikh":
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    # Get sheikh's group
    group = await db.groups.find_one({"sheikh_id": current_user["user_id"]})
    if not group:
        return []
    
    # Get students without initial assessment
    students = await db.users.find(
        {
            "group_id": group["id"],
            "role": "student",
            "initial_assessment_done": {"$ne": True}
        },
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
    
    # Calculate points based on new system
    points = 0
    description = ""
    
    if recitation_data.recitation_type == "new_memorization":
        # حفظ جديد - النظام الجديد مع المدى والتقييم
        pages_count = 1
        if recitation_data.page_from and recitation_data.page_to:
            pages_count = recitation_data.page_to - recitation_data.page_from + 1
        elif recitation_data.pages_count:
            pages_count = recitation_data.pages_count
        
        # Base points for memorization
        base_points = pages_count * 5
        
        # Bonus for rating (if rating >= 7, bonus points)
        rating_bonus = 0
        if recitation_data.rating:
            if recitation_data.rating >= 9:
                rating_bonus = pages_count * 10  # Excellent
            elif recitation_data.rating >= 7:
                rating_bonus = pages_count * 5  # Good
            elif recitation_data.rating >= 5:
                rating_bonus = pages_count * 2  # Average
        
        # Penalty for errors (reduce points)
        error_penalty = 0
        if recitation_data.error_count:
            error_penalty = min(recitation_data.error_count * 2, base_points // 2)  # Max 50% penalty
        
        # Bonus for passing minimum
        pass_bonus = pages_count * 5 if recitation_data.passed_minimum else 0
        
        points = base_points + rating_bonus + pass_bonus - error_penalty
        points = max(points, 1)  # Minimum 1 point
        
        # Build description
        juz_text = f"الجزء {recitation_data.juz_number}" if recitation_data.juz_number else ""
        page_range = f"من صفحة {recitation_data.page_from} إلى {recitation_data.page_to}" if recitation_data.page_from and recitation_data.page_to else f"{pages_count} صفحة"
        rating_text = f"- التقييم: {recitation_data.rating}/10" if recitation_data.rating else ""
        error_text = f"- الأخطاء: {recitation_data.error_count}" if recitation_data.error_count else ""
        pass_text = "✓ اجتاز" if recitation_data.passed_minimum else ""
        
        description = f"حفظ جديد: {juz_text} {page_range} {rating_text} {error_text} {pass_text}".strip()
    else:
        # مراجعة - النظام الجديد (أجزاء كاملة + صفحات جزئية)
        juz_points = 0
        partial_points = 0
        
        # Points for complete juz review
        if recitation_data.review_juz:
            juz_count = len(recitation_data.review_juz)
            if recitation_data.passed_review_minimum:
                juz_points = juz_count * 50  # 50 نقطة لكل جزء
            else:
                juz_points = juz_count * 15
        
        # Points for partial juz (pages)
        if recitation_data.partial_review_pages and recitation_data.partial_review_pages > 0:
            if recitation_data.passed_review_minimum:
                partial_points = recitation_data.partial_review_pages * 10
            else:
                partial_points = recitation_data.partial_review_pages * 3
        
        # Legacy support
        if not recitation_data.review_juz and recitation_data.review_type == "pages":
            if recitation_data.passed_review_minimum:
                partial_points = (recitation_data.review_pages or 1) * 10
            else:
                partial_points = (recitation_data.review_pages or 1) * 3
        
        points = juz_points + partial_points
        
        # Build description
        desc_parts = []
        if recitation_data.review_juz and len(recitation_data.review_juz) > 0:
            juz_list = ", ".join([str(j) for j in sorted(recitation_data.review_juz)])
            desc_parts.append(f"مراجعة الأجزاء {juz_list}")
        
        if recitation_data.partial_review_pages and recitation_data.partial_review_pages > 0:
            partial_juz = recitation_data.partial_review_juz or ""
            if partial_juz:
                desc_parts.append(f"و {recitation_data.partial_review_pages} صفحات من جزء {partial_juz}")
            else:
                desc_parts.append(f"و {recitation_data.partial_review_pages} صفحات")
        
        if recitation_data.passed_review_minimum:
            desc_parts.append("✓ اجتاز")
        
        description = " ".join(desc_parts) if desc_parts else "مراجعة"
    
    recitation = Recitation(
        student_id=recitation_data.student_id,
        sheikh_id=current_user["user_id"],
        recitation_type=recitation_data.recitation_type,
        # New fields
        juz_number=recitation_data.juz_number,
        page_from=recitation_data.page_from,
        page_to=recitation_data.page_to,
        rating=recitation_data.rating,
        error_count=recitation_data.error_count,
        partial_review_juz=recitation_data.partial_review_juz,
        partial_review_pages=recitation_data.partial_review_pages,
        # Existing fields
        passed_minimum=recitation_data.passed_minimum,
        review_juz=recitation_data.review_juz,
        passed_review_minimum=recitation_data.passed_review_minimum,
        notes=recitation_data.notes,
        points_earned=points,
        # Legacy
        pages_count=recitation_data.pages_count,
        review_type=recitation_data.review_type,
        review_pages=recitation_data.review_pages
    )
    
    recitation_dict = recitation.model_dump()
    recitation_dict["created_at"] = recitation_dict["created_at"].isoformat()
    
    await db.recitations.insert_one(recitation_dict)
    
    # Notify student
    await create_notification_internal(
        recitation_data.student_id,
        "تسميع جديد",
        description,
        "success" if (recitation_data.passed_minimum or recitation_data.passed_review_minimum) else "info"
    )
    
    # Award points
    if points > 0:
        await add_points(
            recitation_data.student_id,
            points,
            "recitation",
            description
        )
    
    # Check if first recitation
    recitation_count = await db.recitations.count_documents({"student_id": recitation_data.student_id})
    if recitation_count == 1:
        await award_badge(recitation_data.student_id, "first_recitation")
    
    return {"message": "تم تسجيل التسميع بنجاح", "recitation_id": recitation.id, "points_earned": points}

class RecitationUpdate(BaseModel):
    recitation_type: Optional[str] = None
    # New memorization fields
    juz_number: Optional[int] = None
    page_from: Optional[int] = None
    page_to: Optional[int] = None
    rating: Optional[int] = None
    error_count: Optional[int] = None
    passed_minimum: Optional[bool] = None
    # Review fields
    review_juz: Optional[List[int]] = None
    partial_review_juz: Optional[int] = None
    partial_review_pages: Optional[int] = None
    passed_review_minimum: Optional[bool] = None
    notes: Optional[str] = None
    # Legacy
    pages_count: Optional[int] = None
    review_type: Optional[str] = None
    review_pages: Optional[int] = None

@api_router.put("/recitations/{recitation_id}")
async def update_recitation(recitation_id: str, data: RecitationUpdate, current_user: dict = Depends(get_current_user)):
    """Update a recitation (Sheikh only - must be the one who recorded it)"""
    if current_user["role"] not in ["sheikh", "admin"]:
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    # Get existing recitation
    recitation = await db.recitations.find_one({"id": recitation_id})
    if not recitation:
        raise HTTPException(status_code=404, detail="التسميع غير موجود")
    
    # Check permission - sheikh can only edit their own recitations
    if current_user["role"] == "sheikh" and recitation.get("sheikh_id") != current_user["user_id"]:
        raise HTTPException(status_code=403, detail="لا يمكنك تعديل تسميع مسجل من شيخ آخر")
    
    # Calculate old points
    old_points = recitation.get("points_earned", 0)
    
    # Update fields
    update_data = {}
    for field in ["recitation_type", "juz_number", "page_from", "page_to", "rating", 
                  "error_count", "passed_minimum", "review_juz", "partial_review_juz",
                  "partial_review_pages", "passed_review_minimum", "notes",
                  "pages_count", "review_type", "review_pages"]:
        value = getattr(data, field, None)
        if value is not None:
            update_data[field] = value
    
    # Calculate new points
    merged = {**recitation, **update_data}
    new_points = 0
    
    if merged.get("recitation_type") == "new_memorization":
        # Calculate pages
        pages_count = 1
        if merged.get("page_from") and merged.get("page_to"):
            pages_count = merged["page_to"] - merged["page_from"] + 1
        elif merged.get("pages_count"):
            pages_count = merged["pages_count"]
        
        base_points = pages_count * 5
        rating_bonus = 0
        if merged.get("rating"):
            if merged["rating"] >= 9:
                rating_bonus = pages_count * 10
            elif merged["rating"] >= 7:
                rating_bonus = pages_count * 5
            elif merged["rating"] >= 5:
                rating_bonus = pages_count * 2
        
        error_penalty = 0
        if merged.get("error_count"):
            error_penalty = min(merged["error_count"] * 2, base_points // 2)
        
        pass_bonus = pages_count * 5 if merged.get("passed_minimum") else 0
        new_points = max(base_points + rating_bonus + pass_bonus - error_penalty, 1)
    else:
        # Review
        juz_points = 0
        if merged.get("review_juz"):
            juz_count = len(merged["review_juz"])
            juz_points = juz_count * 50 if merged.get("passed_review_minimum") else juz_count * 15
        
        partial_points = 0
        if merged.get("partial_review_pages") and merged["partial_review_pages"] > 0:
            partial_points = merged["partial_review_pages"] * 10 if merged.get("passed_review_minimum") else merged["partial_review_pages"] * 3
        
        # Legacy support
        if not merged.get("review_juz") and merged.get("review_type") == "pages":
            partial_points = (merged.get("review_pages") or 1) * 10 if merged.get("passed_review_minimum") else (merged.get("review_pages") or 1) * 3
        
        new_points = juz_points + partial_points
    
    update_data["points_earned"] = new_points
    
    await db.recitations.update_one({"id": recitation_id}, {"$set": update_data})
    
    # Update student points (difference)
    points_diff = new_points - old_points
    if points_diff != 0:
        await db.student_points.update_one(
            {"student_id": recitation["student_id"]},
            {"$inc": {"total_points": points_diff}},
            upsert=True
        )
    
    return {"message": "تم تحديث التسميع بنجاح", "points_earned": new_points}

@api_router.delete("/recitations/{recitation_id}")
async def delete_recitation(recitation_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a recitation (Sheikh only - must be the one who recorded it)"""
    if current_user["role"] not in ["sheikh", "admin"]:
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    # Get existing recitation
    recitation = await db.recitations.find_one({"id": recitation_id})
    if not recitation:
        raise HTTPException(status_code=404, detail="التسميع غير موجود")
    
    # Check permission
    if current_user["role"] == "sheikh" and recitation.get("sheikh_id") != current_user["user_id"]:
        raise HTTPException(status_code=403, detail="لا يمكنك حذف تسميع مسجل من شيخ آخر")
    
    # Deduct points from student
    points = recitation.get("points_earned", 0)
    if points > 0:
        await db.student_points.update_one(
            {"student_id": recitation["student_id"]},
            {"$inc": {"total_points": -points}},
            upsert=True
        )
    
    # Delete recitation
    await db.recitations.delete_one({"id": recitation_id})
    
    return {"message": "تم حذف التسميع بنجاح"}

@api_router.get("/recitations/{recitation_id}")
async def get_recitation(recitation_id: str, current_user: dict = Depends(get_current_user)):
    """Get a single recitation"""
    recitation = await db.recitations.find_one({"id": recitation_id}, {"_id": 0})
    if not recitation:
        raise HTTPException(status_code=404, detail="التسميع غير موجود")
    return recitation

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
    
    recitations = await db.recitations.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
    return recitations

# Get Quran Juz list
@api_router.get("/quran/juz")
async def get_quran_juz(current_user: dict = Depends(get_current_user)):
    return [{"number": i+1, "name": QURAN_JUZ[i]} for i in range(30)]

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
        update_data = {"status": attendance_data.status}
        if attendance_data.excuse_reason:
            update_data["excuse_reason"] = attendance_data.excuse_reason
        await db.attendance.update_one(
            {"id": existing["id"]},
            {"$set": update_data}
        )
        return {"message": "تم تحديث الحضور"}
    
    attendance = Attendance(
        student_id=attendance_data.student_id,
        sheikh_id=current_user["user_id"],
        group_id=student.get("group_id") or "",
        date=attendance_data.date,
        status=attendance_data.status,
        excuse_reason=attendance_data.excuse_reason
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
    
    # New recitation calculations
    total_new_pages = sum(r.get("pages_count", 0) or 0 for r in recitations if r.get("recitation_type") == "new_memorization")
    total_review_pages = sum(r.get("review_pages", 0) or 0 for r in recitations if r.get("review_type") == "pages")
    passed_count = sum(1 for r in recitations if r.get("passed_minimum") or r.get("passed_review_minimum"))
    total_points = sum(r.get("points_earned", 0) for r in recitations)
    
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
            "total_new_pages": total_new_pages,
            "total_review_pages": total_review_pages,
            "passed_count": passed_count,
            "total_points": total_points,
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

# ============== STUDENT PROFILE & MANAGEMENT ==============

# IMPORTANT: These /students/me routes must come BEFORE /students/{student_id} routes
# to avoid "me" being treated as a student_id parameter

@api_router.get("/students/me/profile")
async def get_my_profile(current_user: dict = Depends(get_current_user)):
    """Get own profile data (Student only)"""
    if current_user["role"] != "student":
        raise HTTPException(status_code=403, detail="هذه الخدمة للطلاب فقط")
    
    student_id = current_user["user_id"]
    
    # Get student info
    student = await db.users.find_one({"id": student_id}, {"_id": 0, "password_hash": 0})
    if not student:
        raise HTTPException(status_code=404, detail="الطالب غير موجود")
    
    return student

@api_router.put("/students/me/profile")
async def update_my_profile(data: StudentSelfUpdate, current_user: dict = Depends(get_current_user)):
    """Update own profile (Student only - limited fields)"""
    if current_user["role"] != "student":
        raise HTTPException(status_code=403, detail="هذه الخدمة للطلاب فقط")
    
    student_id = current_user["user_id"]
    
    # Check if student exists
    student = await db.users.find_one({"id": student_id, "role": "student"})
    if not student:
        raise HTTPException(status_code=404, detail="الطالب غير موجود")
    
    # Build update dict - only allowed fields for student
    update_data = {}
    if data.student_phone is not None:
        update_data["student_phone"] = data.student_phone
    if data.profile_image is not None:
        update_data["profile_image"] = data.profile_image
    if data.school_name is not None:
        update_data["school_name"] = data.school_name
    if data.school_grade is not None:
        update_data["school_grade"] = data.school_grade
    if data.school_average is not None:
        update_data["school_average"] = data.school_average
    
    if update_data:
        await db.users.update_one({"id": student_id}, {"$set": update_data})
    
    return {"message": "تم تحديث بياناتك بنجاح"}

@api_router.get("/students/{student_id}/profile")
async def get_student_profile(student_id: str, current_user: dict = Depends(get_current_user)):
    """Get complete student profile with all records"""
    # Verify access
    if current_user["role"] == "student" and current_user["user_id"] != student_id:
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    # Get student info
    student = await db.users.find_one({"id": student_id, "role": "student"}, {"_id": 0, "password_hash": 0})
    if not student:
        raise HTTPException(status_code=404, detail="الطالب غير موجود")
    
    # Get group info
    group = None
    if student.get("group_id"):
        group = await db.groups.find_one({"id": student["group_id"]}, {"_id": 0})
    
    # Get points
    points_data = await db.student_points.find_one({"student_id": student_id}, {"_id": 0})
    if not points_data:
        points_data = {"total_points": 0, "level": 1, "badges": []}
    
    # Get badge details
    badge_details = [b for b in BADGES if b["id"] in points_data.get("badges", [])]
    points_data["badge_details"] = badge_details
    
    # Get attendance records (last 30 days)
    attendance = await db.attendance.find(
        {"student_id": student_id},
        {"_id": 0}
    ).sort("date", -1).to_list(100)
    
    # Get recitation records
    recitations = await db.recitations.find(
        {"student_id": student_id},
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    
    # Get tracking sheets
    tracking_sheets = await db.tracking_sheets.find(
        {"student_id": student_id},
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    
    # Get warnings
    warnings = await db.warnings.find(
        {"student_id": student_id},
        {"_id": 0}
    ).sort("created_at", -1).to_list(50)
    
    # Calculate attendance summary
    present_count = sum(1 for a in attendance if a["status"] == "present")
    absent_count = sum(1 for a in attendance if a["status"] == "absent")
    excused_count = sum(1 for a in attendance if a["status"] == "excused")
    
    # Calculate recitation summary
    total_new_pages = sum(r.get("pages_count", 0) or 0 for r in recitations if r.get("recitation_type") == "new_memorization")
    total_review_pages = sum(r.get("review_pages", 0) or 0 for r in recitations if r.get("review_type") == "pages")
    total_review_juz = sum(len(r.get("review_juz", []) or []) for r in recitations if r.get("review_type") == "juz")
    
    return {
        "student": student,
        "group": group,
        "points": points_data,
        "attendance_summary": {
            "present": present_count,
            "absent": absent_count,
            "excused": excused_count,
            "total": len(attendance),
            "percentage": round(present_count / max(len(attendance), 1) * 100, 2)
        },
        "recitation_summary": {
            "total_new_pages": total_new_pages,
            "total_review_pages": total_review_pages,
            "total_review_juz": total_review_juz,
            "total_recitations": len(recitations)
        },
        "attendance_records": attendance,
        "recitation_records": recitations,
        "tracking_sheets": tracking_sheets,
        "warnings": warnings
    }

@api_router.put("/students/{student_id}")
async def update_student(student_id: str, data: StudentProfileUpdate, current_user: dict = Depends(get_current_user)):
    """Update student profile (Admin only)"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="فقط المدير يمكنه تعديل بيانات الطالب")
    
    # Check if student exists
    student = await db.users.find_one({"id": student_id, "role": "student"})
    if not student:
        raise HTTPException(status_code=404, detail="الطالب غير موجود")
    
    # Build update dict
    update_data = {}
    if data.name is not None:
        update_data["name"] = data.name
    if data.mosque_name is not None:
        update_data["mosque_name"] = data.mosque_name
    if data.school_name is not None:
        update_data["school_name"] = data.school_name
    if data.school_grade is not None:
        update_data["school_grade"] = data.school_grade
    if data.birth_date is not None:
        update_data["birth_date"] = data.birth_date
    if data.profile_image is not None:
        update_data["profile_image"] = data.profile_image
    if data.group_id is not None:
        update_data["group_id"] = data.group_id
    
    if update_data:
        await db.users.update_one({"id": student_id}, {"$set": update_data})
    
    return {"message": "تم تحديث بيانات الطالب بنجاح"}

@api_router.delete("/students/{student_id}")
async def delete_student(student_id: str, current_user: dict = Depends(get_current_user)):
    """Delete student (Admin only)"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="فقط المدير يمكنه حذف الطالب")
    
    # Check if student exists
    student = await db.users.find_one({"id": student_id, "role": "student"})
    if not student:
        raise HTTPException(status_code=404, detail="الطالب غير موجود")
    
    # Delete student and all related data
    await db.users.delete_one({"id": student_id})
    await db.attendance.delete_many({"student_id": student_id})
    await db.recitations.delete_many({"student_id": student_id})
    await db.tracking_sheets.delete_many({"student_id": student_id})
    await db.student_points.delete_many({"student_id": student_id})
    await db.points_transactions.delete_many({"student_id": student_id})
    await db.notifications.delete_many({"user_id": student_id})
    
    return {"message": "تم حذف الطالب وجميع بياناته بنجاح"}

@api_router.post("/students/{student_id}/change-group")
async def change_student_group(student_id: str, group_id: str, current_user: dict = Depends(get_current_user)):
    """Change student's group (Admin only)"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="فقط المدير يمكنه نقل الطالب")
    
    # Check if student exists
    student = await db.users.find_one({"id": student_id, "role": "student"})
    if not student:
        raise HTTPException(status_code=404, detail="الطالب غير موجود")
    
    # Check if group exists (if not empty)
    if group_id:
        group = await db.groups.find_one({"id": group_id})
        if not group:
            raise HTTPException(status_code=404, detail="المجموعة غير موجودة")
    
    # Update student's group
    new_group_id = group_id if group_id else None
    await db.users.update_one({"id": student_id}, {"$set": {"group_id": new_group_id}})
    
    return {"message": "تم نقل الطالب بنجاح"}

@api_router.post("/admin/students")
async def admin_create_student(data: UserCreateWithCode, current_user: dict = Depends(get_current_user)):
    """Create a new student (Admin only)"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="فقط المدير يمكنه إضافة طالب")
    
    # Check if email exists
    existing = await db.users.find_one({"email": data.email})
    if existing:
        raise HTTPException(status_code=400, detail="البريد الإلكتروني مسجل مسبقاً")
    
    # Create student
    user = User(
        email=data.email,
        name=data.name,
        role="student",
        mosque_name=data.mosque_name,
        school_name=data.school_name,
        school_grade=data.school_grade,
        birth_date=data.birth_date,
        profile_image=data.profile_image
    )
    
    user_dict = user.model_dump()
    user_dict["password_hash"] = get_password_hash(data.password)
    user_dict["created_at"] = user_dict["created_at"].isoformat()
    
    await db.users.insert_one(user_dict)
    
    return {"message": "تم إضافة الطالب بنجاح", "student_id": user.id}

# ============== WARNING SYSTEM ==============

class WarningCreate(BaseModel):
    student_id: str
    type: str  # absence, no_recitation, behavior
    message: str

@api_router.post("/admin/warnings")
async def issue_warning(data: WarningCreate, current_user: dict = Depends(get_current_user)):
    """Issue a warning to a student (Admin only)"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="فقط المدير يمكنه إصدار الإنذارات")
    
    # Check if student exists
    student = await db.users.find_one({"id": data.student_id, "role": "student"})
    if not student:
        raise HTTPException(status_code=404, detail="الطالب غير موجود")
    
    warning_type_names = {
        "absence": "غياب متكرر",
        "no_recitation": "عدم التسميع",
        "behavior": "سلوك سلبي"
    }
    
    warning = {
        "id": str(uuid.uuid4()),
        "student_id": data.student_id,
        "admin_id": current_user["user_id"],
        "type": data.type,
        "message": data.message,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.warnings.insert_one(warning)
    
    # Send notification to student
    await create_notification_internal(
        data.student_id,
        f"⚠️ إنذار: {warning_type_names.get(data.type, 'إنذار')}",
        data.message,
        "warning"
    )
    
    return {"message": "تم إصدار الإنذار بنجاح", "warning_id": warning["id"]}

@api_router.get("/admin/warnings")
async def get_all_warnings(
    student_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get all warnings (Admin only)"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    query = {}
    if student_id:
        query["student_id"] = student_id
    
    warnings = await db.warnings.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
    return warnings

@api_router.get("/students/{student_id}/warnings")
async def get_student_warnings(student_id: str, current_user: dict = Depends(get_current_user)):
    """Get warnings for a specific student"""
    # Verify access
    if current_user["role"] == "student" and current_user["user_id"] != student_id:
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    warnings = await db.warnings.find(
        {"student_id": student_id},
        {"_id": 0}
    ).sort("created_at", -1).to_list(50)
    return warnings

@api_router.delete("/admin/warnings/{warning_id}")
async def delete_warning(warning_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a warning (Admin only)"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="فقط المدير يمكنه حذف الإنذارات")
    
    result = await db.warnings.delete_one({"id": warning_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="الإنذار غير موجود")
    
    return {"message": "تم حذف الإنذار بنجاح"}

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
