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
    TrackingSheetCreate, TrackingSheet, TrackingSheetData, TrackingSheetManualCreate,
    RecitationCreate, Recitation,
    AttendanceCreate, Attendance,
    ActivityCreate, Activity,
    NotificationCreate, Notification,
    StudentScore, WeeklyRanking,
    StudentProfileUpdate, StudentCreate, QURAN_JUZ,
    InitialAssessment, StudentSelfUpdate,
    StudentRegistrationRequest, ActivationRequest,
    CurriculumCreate, Curriculum, CurriculumEntryCreate, CurriculumEntry,
    ScheduleCreate, Schedule, ScheduleSlotCreate, ScheduleSlot,
    FeeCreate, Fee,
    HomeworkCreate, Homework, HomeworkSubmission,
    AdminExamCreate, AdminExam,
    TajweedExamCreate, TajweedExam,
    OnlineExamCreate, OnlineExam, ExamSubmissionCreate, ExamSubmission, ExamQuestion
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

@api_router.post("/auth/register-with-code")
async def register_with_code(user_data: UserCreateWithCode):
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
    
    # Check if student account is activated
    if user.get("role") == "student" and not user.get("is_activated", True):
        raise HTTPException(
            status_code=403, 
            detail="حسابك غير مفعل بعد. يرجى إدخال كود التفعيل من الإدارة"
        )
    
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
            group_id=user.get("group_id"),
            is_activated=user.get("is_activated", True)
        )
    }

# ============== NEW USER REGISTRATION FLOW ==============

@api_router.post("/auth/register")
async def user_register(data: StudentRegistrationRequest):
    """Universal registration - creates pending account needing activation for all roles"""
    # Validate passwords match
    if data.password != data.confirm_password:
        raise HTTPException(status_code=400, detail="كلمات المرور غير متطابقة")
    
    # Check if email exists
    existing = await db.users.find_one({"email": data.email})
    if existing:
        raise HTTPException(status_code=400, detail="البريد الإلكتروني مسجل مسبقاً")
    
    # Validate role
    valid_roles = ["student", "sheikh", "admin"]
    role = data.role if data.role in valid_roles else "student"
    
    # Generate activation code (6 digits)
    import random
    activation_code = ''.join([str(random.randint(0, 9)) for _ in range(6)])
    
    # Create user (not activated)
    user_dict = {
        "id": str(uuid.uuid4()),
        "email": data.email,
        "name": data.name,
        "role": role,
        "is_active": False,
        "is_activated": False,
        "activation_code": activation_code,
        "student_phone": data.student_phone,
        "father_phone": data.father_phone,
        "mother_phone": data.mother_phone,
        "mosque_name": data.mosque_name,
        "school_name": data.school_name,
        "school_grade": data.school_grade,
        "birth_date": data.birth_date,
        "join_date": data.join_date,
        "profile_image": data.profile_image,
        "password_hash": get_password_hash(data.password),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "registration_date": datetime.now(timezone.utc).isoformat(),
        "points": 0
    }
    
    # Add sheikh/admin specific fields
    if role in ["sheikh", "admin"]:
        user_dict["specialization"] = data.specialization
        user_dict["experience_years"] = data.experience_years
    
    await db.users.insert_one(user_dict)
    
    role_name = "طالب" if role == "student" else ("معلم" if role == "sheikh" else "مدير")
    
    return {
        "message": f"تم تسجيل بياناتك كـ{role_name} بنجاح. حسابك غير مفعل حالياً.",
        "detail": "يرجى التواصل مع إدارة المركز للحصول على كود التفعيل",
        "email": data.email,
        "role": role
    }

# Keep old endpoint for backwards compatibility
@api_router.post("/auth/student-register")
async def student_register(data: StudentRegistrationRequest):
    """Student registration - creates pending account needing activation"""
    data.role = "student"
    return await user_register(data)

@api_router.post("/auth/activate")
async def activate_account(data: ActivationRequest):
    """Activate student account with code"""
    user = await db.users.find_one({"email": data.email}, {"_id": 0})
    
    if not user:
        raise HTTPException(status_code=404, detail="البريد الإلكتروني غير مسجل")
    
    if user.get("is_activated", True):
        raise HTTPException(status_code=400, detail="الحساب مفعل بالفعل")
    
    if user.get("activation_code") != data.activation_code:
        raise HTTPException(status_code=400, detail="كود التفعيل غير صحيح")
    
    # Activate the account
    await db.users.update_one(
        {"email": data.email},
        {"$set": {"is_activated": True, "is_active": True, "activation_code": None}}
    )
    
    # Create token for auto-login
    token = create_access_token({
        "user_id": user["id"],
        "email": user["email"],
        "name": user["name"],
        "role": user["role"]
    })
    
    return {
        "message": "تم تفعيل حسابك بنجاح!",
        "token": token,
        "user": UserResponse(
            id=user["id"],
            email=user["email"],
            name=user["name"],
            role=user["role"],
            group_id=user.get("group_id"),
            is_activated=True
        )
    }

@api_router.get("/admin/pending-students")
async def get_pending_students(current_user: dict = Depends(get_current_user)):
    """Get students pending activation (Admin only)"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="فقط المدير يمكنه الوصول")
    
    pending = await db.users.find(
        {"role": "student", "is_activated": False},
        {"_id": 0, "password_hash": 0}
    ).to_list(100)
    
    return pending

# ============== ADMIN: PASSWORD RESET ==============

class PasswordResetRequest(BaseModel):
    email: str
    new_password: str

@api_router.post("/admin/reset-password")
async def admin_reset_password(data: PasswordResetRequest, current_user: dict = Depends(get_current_user)):
    """Reset user password - Admin only"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="فقط المدير يمكنه إعادة تعيين كلمة المرور")
    
    # Find user
    user = await db.users.find_one({"email": data.email})
    if not user:
        raise HTTPException(status_code=404, detail="المستخدم غير موجود")
    
    # Validate new password
    if len(data.new_password) < 6:
        raise HTTPException(status_code=400, detail="كلمة المرور يجب أن تكون 6 أحرف على الأقل")
    
    # Update password
    new_hash = get_password_hash(data.new_password)
    await db.users.update_one(
        {"email": data.email},
        {"$set": {"password_hash": new_hash}}
    )
    
    # Notify user
    await create_notification_internal(
        user["id"],
        "تم تغيير كلمة المرور",
        "تم إعادة تعيين كلمة المرور الخاصة بك من قبل الإدارة. يرجى تسجيل الدخول بكلمة المرور الجديدة.",
        "warning"
    )
    
    return {"message": f"تم إعادة تعيين كلمة المرور للمستخدم {user['name']} بنجاح"}

# ============== ADMIN: SHEIKH MANAGEMENT ==============

@api_router.get("/admin/sheikhs")
async def get_all_sheikhs(current_user: dict = Depends(get_current_user)):
    """Get all sheikhs with their details - Admin only"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="فقط المدير يمكنه الوصول")
    
    # Get all sheikhs
    sheikhs = await db.users.find(
        {"role": "sheikh"},
        {"_id": 0, "password_hash": 0, "activation_code": 0}
    ).to_list(100)
    
    # Add group info and student count for each sheikh
    for sheikh in sheikhs:
        groups = await db.groups.find({"sheikh_id": sheikh["id"]}, {"_id": 0}).to_list(20)
        sheikh["groups"] = groups
        sheikh["groups_count"] = len(groups)
        
        # Count students in sheikh's groups
        group_ids = [g["id"] for g in groups]
        students_count = await db.users.count_documents({"role": "student", "group_id": {"$in": group_ids}})
        sheikh["students_count"] = students_count
    
    return sheikhs

@api_router.get("/admin/sheikh/{sheikh_id}")
async def get_sheikh_details(sheikh_id: str, current_user: dict = Depends(get_current_user)):
    """Get detailed info about a specific sheikh - Admin only"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="فقط المدير يمكنه الوصول")
    
    # Get sheikh
    sheikh = await db.users.find_one(
        {"id": sheikh_id, "role": "sheikh"},
        {"_id": 0, "password_hash": 0, "activation_code": 0}
    )
    
    if not sheikh:
        raise HTTPException(status_code=404, detail="المعلم غير موجود")
    
    # Get sheikh's groups
    groups = await db.groups.find({"sheikh_id": sheikh_id}, {"_id": 0}).to_list(20)
    
    # Get students for each group with detailed info
    groups_with_students = []
    total_students = 0
    total_points = 0
    
    for group in groups:
        students = await db.users.find(
            {"role": "student", "group_id": group["id"]},
            {"_id": 0, "password_hash": 0, "activation_code": 0}
        ).to_list(50)
        
        group["students"] = students
        group["students_count"] = len(students)
        total_students += len(students)
        
        for student in students:
            total_points += student.get("points", 0)
        
        groups_with_students.append(group)
    
    # Get sheikh's activity stats
    recitations_count = await db.recitations.count_documents({"sheikh_id": sheikh_id})
    attendance_count = await db.attendance.count_documents({"sheikh_id": sheikh_id})
    
    return {
        "sheikh": sheikh,
        "groups": groups_with_students,
        "stats": {
            "total_groups": len(groups),
            "total_students": total_students,
            "total_points": total_points,
            "recitations_given": recitations_count,
            "attendance_records": attendance_count
        }
    }

@api_router.delete("/admin/sheikh/{sheikh_id}")
async def delete_sheikh(sheikh_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a sheikh - Admin only"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="فقط المدير يمكنه حذف المعلم")
    
    # Get sheikh
    sheikh = await db.users.find_one({"id": sheikh_id, "role": "sheikh"})
    if not sheikh:
        raise HTTPException(status_code=404, detail="المعلم غير موجود")
    
    # Check if sheikh has groups
    groups = await db.groups.find({"sheikh_id": sheikh_id}, {"_id": 0}).to_list(20)
    
    if groups:
        # Option: Remove sheikh from groups (don't delete the groups)
        await db.groups.update_many(
            {"sheikh_id": sheikh_id},
            {"$set": {"sheikh_id": None}}
        )
    
    # Delete sheikh
    await db.users.delete_one({"id": sheikh_id})
    
    return {
        "message": f"تم حذف المعلم {sheikh['name']} بنجاح",
        "groups_affected": len(groups)
    }

@api_router.get("/admin/pending-registrations")
async def get_pending_registrations(current_user: dict = Depends(get_current_user)):
    """Get all pending registrations (students, sheikhs, admins) - Admin only"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="فقط المدير يمكنه الوصول")
    
    pending = await db.users.find(
        {"is_activated": False},
        {"_id": 0, "password_hash": 0}
    ).to_list(100)
    
    # Group by role
    students = [u for u in pending if u.get("role") == "student"]
    sheikhs = [u for u in pending if u.get("role") == "sheikh"]
    admins = [u for u in pending if u.get("role") == "admin"]
    
    return {
        "students": students,
        "sheikhs": sheikhs,
        "admins": admins,
        "total": len(pending)
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

# ============== USER PROFILE UPDATE ==============

class UserProfileUpdate(BaseModel):
    name: Optional[str] = None
    student_phone: Optional[str] = None
    father_phone: Optional[str] = None
    mother_phone: Optional[str] = None
    mosque_name: Optional[str] = None
    school_name: Optional[str] = None
    school_grade: Optional[str] = None
    school_average: Optional[str] = None
    birth_date: Optional[str] = None
    join_date: Optional[str] = None
    profile_image: Optional[str] = None
    specialization: Optional[str] = None
    experience_years: Optional[int] = None

@api_router.put("/users/me")
async def update_my_profile(data: UserProfileUpdate, current_user: dict = Depends(get_current_user)):
    """Update current user's profile"""
    user = await db.users.find_one({"id": current_user["user_id"]})
    if not user:
        raise HTTPException(status_code=404, detail="المستخدم غير موجود")
    
    # Build update dict with only provided fields
    update_data = {}
    if data.name is not None:
        update_data["name"] = data.name
    if data.student_phone is not None:
        update_data["student_phone"] = data.student_phone
    if data.father_phone is not None:
        update_data["father_phone"] = data.father_phone
    if data.mother_phone is not None:
        update_data["mother_phone"] = data.mother_phone
    if data.mosque_name is not None:
        update_data["mosque_name"] = data.mosque_name
    if data.school_name is not None:
        update_data["school_name"] = data.school_name
    if data.school_grade is not None:
        update_data["school_grade"] = data.school_grade
    if data.school_average is not None:
        update_data["school_average"] = data.school_average
    if data.birth_date is not None:
        update_data["birth_date"] = data.birth_date
    if data.join_date is not None:
        update_data["join_date"] = data.join_date
    if data.profile_image is not None:
        update_data["profile_image"] = data.profile_image
    if data.specialization is not None:
        update_data["specialization"] = data.specialization
    if data.experience_years is not None:
        update_data["experience_years"] = data.experience_years
    
    if update_data:
        await db.users.update_one(
            {"id": current_user["user_id"]},
            {"$set": update_data}
        )
    
    return {"message": "تم تحديث البيانات بنجاح"}

@api_router.get("/users/me/full")
async def get_my_full_profile(current_user: dict = Depends(get_current_user)):
    """Get current user's full profile data"""
    user = await db.users.find_one(
        {"id": current_user["user_id"]},
        {"_id": 0, "password_hash": 0, "activation_code": 0}
    )
    if not user:
        raise HTTPException(status_code=404, detail="المستخدم غير موجود")
    return user

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

def calculate_tracking_points(data: dict) -> dict:
    """
    حساب نقاط ورقة المتابعة - المجموع 100 نقطة:
    - الصلوات: 35 نقطة (5 صلوات × 7 أيام)
    - الجلوس مع القرآن: 7 نقاط
    - صلاة الضحى: 7 نقاط
    - التسميع للأهل: 7 نقاط
    - ساعات الدراسة: 7 نقاط
    - الوتر: 7 نقاط
    - السنن: 7 نقاط
    - قيام الليل: 8 نقاط (إذا أتم يوم = 8 نقاط كاملة)
    - الصيام: 8 نقاط (إذا أتم يوم = 8 نقاط كاملة)
    المجموع: 100 نقطة كحد أقصى
    """
    prayers = min(data.get("prayers_count", 0), 35)  # Max 35
    quran = min(data.get("quran_sitting_days", 0), 7)  # Max 7
    duha = min(data.get("duha_prayers", 0), 7)  # Max 7
    family = min(data.get("family_recitation", 0), 7)  # Max 7
    study = min(data.get("study_hours", 0), 7)  # Max 7
    witr = min(data.get("witr_prayers_days", 0), 7)  # Max 7
    sunnah = min(data.get("sunnah_prayers", 0), 7)  # Max 7 (جديد)
    # قيام الليل: إذا أتم يوم واحد = 8 نقاط كاملة
    night = 8 if data.get("night_prayer", 0) >= 1 else 0
    # الصيام: إذا أتم يوم واحد = 8 نقاط كاملة
    fasting = 8 if data.get("fasting", 0) >= 1 else 0
    
    total = min(prayers + quran + duha + family + study + witr + sunnah + night + fasting, 100)
    
    return {
        "prayers_points": prayers,
        "quran_points": quran,
        "duha_points": duha,
        "family_points": family,
        "study_points": study,
        "witr_points": witr,
        "sunnah_points": sunnah,
        "night_prayer_points": night,
        "fasting_points": fasting,
        "total_points": total
    }

def get_current_week_start():
    """الحصول على بداية الأسبوع الحالي (السبت)"""
    from datetime import timedelta
    today = datetime.now(timezone.utc).date()
    # السبت = 5 في Python (Monday = 0)
    days_since_saturday = (today.weekday() + 2) % 7
    saturday = today - timedelta(days=days_since_saturday)
    return saturday.isoformat()

async def check_and_reset_weekly_badges():
    """فحص وإعادة تعيين الشارات في بداية كل أسبوع"""
    current_week = get_current_week_start()
    # تحديث جميع الطلاب - إعادة تعيين الشارات الأسبوعية
    await db.student_points.update_many(
        {"last_badge_week": {"$ne": current_week}},
        {"$set": {"weekly_badges": [], "last_badge_week": current_week}}
    )

async def grant_badge_to_student(student_id: str, badge_id: str, granted_by: str = "system"):
    """منح شارة للطالب"""
    from models import WEEKLY_BADGES, WeeklyBadge
    
    if badge_id not in WEEKLY_BADGES:
        return False
    
    badge_info = WEEKLY_BADGES[badge_id]
    week_start = get_current_week_start()
    
    # التحقق من عدم وجود نفس الشارة لهذا الأسبوع
    existing = await db.weekly_badges.find_one({
        "student_id": student_id,
        "badge_id": badge_id,
        "week_start": week_start
    })
    
    if existing:
        return False
    
    # إنشاء الشارة
    badge = WeeklyBadge(
        student_id=student_id,
        badge_id=badge_id,
        badge_name=badge_info["name"],
        badge_icon=badge_info["icon"],
        week_start=week_start,
        granted_by=granted_by
    )
    
    badge_dict = badge.model_dump()
    badge_dict["granted_at"] = badge_dict["granted_at"].isoformat()
    await db.weekly_badges.insert_one(badge_dict)
    
    # تحديث عداد الشارات للطالب
    await db.student_points.update_one(
        {"student_id": student_id},
        {
            "$addToSet": {"weekly_badges": badge_id},
            "$inc": {"badges_count": 1}
        },
        upsert=True
    )
    
    return True

async def check_worshipper_badge(student_id: str, tracking_points: int):
    """فحص ومنح شارة العابد (90% أو أكثر من ورق المتابعة)"""
    if tracking_points >= 90:  # 90% من 100 نقطة
        await grant_badge_to_student(student_id, "worshipper", "system")

async def check_committed_badge(student_id: str):
    """فحص ومنح شارة الملتزم (حضور كل الدروس)"""
    # الحصول على الجدول النشط
    schedule = await db.schedules.find_one({"is_active": True})
    if not schedule or not schedule.get("lesson_days"):
        return
    
    week_start = get_current_week_start()
    # حساب عدد أيام الدروس في الأسبوع
    expected_days = len(schedule.get("lesson_days", []))
    
    # حساب الحضور الفعلي
    attendance_count = await db.attendance.count_documents({
        "student_id": student_id,
        "status": "present",
        "date": {"$gte": week_start}
    })
    
    if attendance_count >= expected_days:
        await grant_badge_to_student(student_id, "committed", "system")

async def check_memorizer_badge(student_id: str):
    """فحص ومنح شارة الحافظ (تسميع في كل درس)"""
    schedule = await db.schedules.find_one({"is_active": True})
    if not schedule or not schedule.get("lesson_days"):
        return
    
    week_start = get_current_week_start()
    expected_days = len(schedule.get("lesson_days", []))
    
    # حساب عدد التسميعات
    recitation_count = await db.recitations.count_documents({
        "student_id": student_id,
        "created_at": {"$gte": week_start}
    })
    
    if recitation_count >= expected_days:
        await grant_badge_to_student(student_id, "memorizer", "system")

@api_router.post("/tracking-sheets/manual")
async def create_tracking_sheet_manual(data: TrackingSheetManualCreate, current_user: dict = Depends(get_current_user)):
    """إدخال ورقة متابعة يدوياً (للشيخ)"""
    if current_user["role"] != "sheikh":
        raise HTTPException(status_code=403, detail="فقط الشيخ يمكنه إدخال ورقة المتابعة")
    
    # Calculate points
    points_breakdown = calculate_tracking_points({
        "prayers_count": data.prayers_count,
        "quran_sitting_days": data.quran_sitting_days,
        "duha_prayers": data.duha_prayers,
        "family_recitation": data.family_recitation,
        "study_hours": data.study_hours,
        "witr_prayers_days": data.witr_prayers_days,
        "sunnah_prayers": data.sunnah_prayers,
        "night_prayer": data.night_prayer,
        "fasting": data.fasting
    })
    
    sheet_data = TrackingSheetData(
        prayers_count=min(data.prayers_count, 35),
        quran_sitting_days=min(data.quran_sitting_days, 7),
        duha_prayers=min(data.duha_prayers, 7),
        family_recitation=min(data.family_recitation, 7),
        study_hours=min(data.study_hours, 7),
        witr_prayers_days=min(data.witr_prayers_days, 7),
        sunnah_prayers=min(data.sunnah_prayers, 7),
        night_prayer=min(data.night_prayer, 1),
        fasting=min(data.fasting, 1),
        notes=data.notes
    )
    
    sheet = TrackingSheet(
        student_id=data.student_id,
        sheikh_id=current_user["user_id"],
        week_start=data.week_start,
        data=sheet_data,
        points_earned=points_breakdown["total_points"]
    )
    
    sheet_dict = sheet.model_dump()
    sheet_dict["created_at"] = sheet_dict["created_at"].isoformat()
    
    await db.tracking_sheets.insert_one(sheet_dict)
    
    # Award points
    if points_breakdown["total_points"] > 0:
        await add_points(
            data.student_id,
            points_breakdown["total_points"],
            "tracking",
            f"ورقة متابعة أسبوع {data.week_start}"
        )
    
    # Notify student
    await create_notification_internal(
        data.student_id,
        "ورقة متابعة جديدة",
        f"تم تسجيل ورقة المتابعة للأسبوع {data.week_start} - حصلت على {points_breakdown['total_points']} نقطة",
        "success"
    )
    
    # Check for badges
    total_tracking = await db.tracking_sheets.find({"student_id": data.student_id}, {"_id": 0}).to_list(1000)
    total_prayers = sum(t["data"].get("prayers_count", 0) for t in total_tracking)
    
    if total_prayers >= 100:
        await award_badge(data.student_id, "prayer_keeper")
    
    return {
        "message": "تم إدخال ورقة المتابعة بنجاح",
        "sheet_id": sheet.id,
        "points_breakdown": points_breakdown
    }

@api_router.post("/tracking-sheets")
async def create_tracking_sheet(sheet_data: TrackingSheetCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "sheikh":
        raise HTTPException(status_code=403, detail="فقط الشيخ يمكنه رفع ورقة المتابعة")
    
    # If image provided, analyze it using AI to count checkmarks
    if sheet_data.image_base64:
        analysis_result = await analyze_tracking_sheet(sheet_data.image_base64)
        logger.info(f"تحليل صورة ورقة المتابعة: {analysis_result}")
    else:
        analysis_result = {
            "prayers_count": 0,
            "quran_sitting_days": 0,
            "duha_prayers": 0,
            "family_recitation": 0,
            "study_hours": 0,
            "witr_prayers_days": 0,
            "sunnah_prayers": 0,
            "night_prayer": 0,
            "fasting": 0
        }
    
    # Calculate points using new system
    points_breakdown = calculate_tracking_points(analysis_result)
    
    # Create sheet data with new fields
    sheet_data_obj = TrackingSheetData(
        prayers_count=analysis_result.get("prayers_count", 0),
        quran_sitting_days=analysis_result.get("quran_sitting_days", 0),
        duha_prayers=analysis_result.get("duha_prayers", 0),
        family_recitation=analysis_result.get("family_recitation", 0),
        study_hours=analysis_result.get("study_hours", 0),
        witr_prayers_days=analysis_result.get("witr_prayers_days", 0),
        sunnah_prayers=analysis_result.get("sunnah_prayers", 0),
        night_prayer=analysis_result.get("night_prayer", 0),
        fasting=analysis_result.get("fasting", 0),
        notes=analysis_result.get("notes", "")
    )
    
    sheet = TrackingSheet(
        student_id=sheet_data.student_id,
        sheikh_id=current_user["user_id"],
        week_start=sheet_data.week_start,
        data=sheet_data_obj,
        points_earned=points_breakdown["total_points"]
    )
    
    sheet_dict = sheet.model_dump()
    sheet_dict["created_at"] = sheet_dict["created_at"].isoformat()
    
    await db.tracking_sheets.insert_one(sheet_dict)
    
    # Create notification for student
    await create_notification_internal(
        sheet_data.student_id,
        "ورقة متابعة جديدة",
        f"تم رفع ورقة المتابعة للأسبوع {sheet_data.week_start} - حصلت على {points_breakdown['total_points']} نقطة",
        "info"
    )
    
    # Award points
    if points_breakdown["total_points"] > 0:
        await add_points(
            sheet_data.student_id,
            points_breakdown["total_points"],
            "tracking",
            f"ورقة متابعة أسبوع {sheet_data.week_start}"
        )
    
    # Check for badges
    total_tracking = await db.tracking_sheets.find({"student_id": sheet_data.student_id}, {"_id": 0}).to_list(1000)
    total_prayers = sum(t["data"].get("prayers_count", 0) for t in total_tracking)
    
    if total_prayers >= 100:
        await award_badge(sheet_data.student_id, "prayer_keeper")
    
    return {
        "message": "تم رفع ورقة المتابعة بنجاح",
        "sheet_id": sheet.id,
        "analysis": analysis_result,
        "points_breakdown": points_breakdown
    }

# Endpoint للطالب لتعبئة ورقة المتابعة
class StudentTrackingCreate(BaseModel):
    """ورقة المتابعة للطالب - الأسبوع يبدأ وينتهي السبت"""
    week_start: str  # تاريخ بداية الأسبوع (السبت)
    prayers_count: int = 0  # الصلوات (0-35)
    quran_sitting_days: int = 0  # الجلوس مع القرآن (0-7)
    duha_prayers: int = 0  # صلاة الضحى (0-7)
    family_recitation: int = 0  # التسميع للأهل (0-7)
    study_hours: int = 0  # ساعات الدراسة (0-7)
    witr_prayers_days: int = 0  # الوتر (0-7)
    sunnah_prayers: int = 0  # السنن (0-7)
    night_prayer: int = 0  # قيام الليل (0-1) = 8 نقاط
    fasting: int = 0  # الصيام (0-1) = 8 نقاط
    notes: Optional[str] = None

@api_router.post("/tracking-sheets/student")
async def create_tracking_sheet_student(data: StudentTrackingCreate, current_user: dict = Depends(get_current_user)):
    """تعبئة ورقة المتابعة من حساب الطالب - مرة واحدة في الأسبوع"""
    if current_user["role"] != "student":
        raise HTTPException(status_code=403, detail="هذا الخيار متاح للطلاب فقط")
    
    # الحصول على بداية الأسبوع الحالي (السبت)
    current_week_start = get_current_week_start()
    
    # التحقق من أن التاريخ هو بداية الأسبوع الحالي
    if data.week_start != current_week_start:
        raise HTTPException(status_code=400, detail=f"يمكنك فقط تعبئة ورقة الأسبوع الحالي. بداية الأسبوع: {current_week_start}")
    
    # التحقق من عدم وجود ورقة سابقة لنفس الأسبوع (مرة واحدة فقط)
    existing = await db.tracking_sheets.find_one({
        "student_id": current_user["user_id"],
        "week_start": data.week_start
    })
    
    # حساب النقاط
    points_breakdown = calculate_tracking_points({
        "prayers_count": data.prayers_count,
        "quran_sitting_days": data.quran_sitting_days,
        "duha_prayers": data.duha_prayers,
        "family_recitation": data.family_recitation,
        "study_hours": data.study_hours,
        "witr_prayers_days": data.witr_prayers_days,
        "sunnah_prayers": data.sunnah_prayers,
        "night_prayer": data.night_prayer,
        "fasting": data.fasting
    })
    
    sheet_data_dict = {
        "prayers_count": min(data.prayers_count, 35),
        "quran_sitting_days": min(data.quran_sitting_days, 7),
        "duha_prayers": min(data.duha_prayers, 7),
        "family_recitation": min(data.family_recitation, 7),
        "study_hours": min(data.study_hours, 7),
        "witr_prayers_days": min(data.witr_prayers_days, 7),
        "sunnah_prayers": min(data.sunnah_prayers, 7),
        "night_prayer": min(data.night_prayer, 1),
        "fasting": min(data.fasting, 1),
        "notes": data.notes
    }
    
    if existing:
        # تحديث الورقة الموجودة
        await db.tracking_sheets.update_one(
            {"id": existing["id"]},
            {"$set": {
                "data": sheet_data_dict,
                "points_earned": points_breakdown["total_points"],
                "submitted_by_student": True
            }}
        )
        
        # فحص ومنح شارة العابد
        await check_worshipper_badge(current_user["user_id"], points_breakdown["total_points"])
        
        return {
            "message": "تم تحديث ورقة المتابعة بنجاح",
            "points_earned": points_breakdown["total_points"]
        }
    
    # إنشاء ورقة جديدة
    sheet_data = TrackingSheetData(
        prayers_count=min(data.prayers_count, 35),
        quran_sitting_days=min(data.quran_sitting_days, 7),
        duha_prayers=min(data.duha_prayers, 7),
        family_recitation=min(data.family_recitation, 7),
        study_hours=min(data.study_hours, 7),
        witr_prayers_days=min(data.witr_prayers_days, 7),
        sunnah_prayers=min(data.sunnah_prayers, 7),
        night_prayer=min(data.night_prayer, 1),
        fasting=min(data.fasting, 1),
        notes=data.notes
    )
    
    sheet = TrackingSheet(
        student_id=current_user["user_id"],
        sheikh_id="",  # بدون شيخ - مقدم من الطالب
        week_start=data.week_start,
        data=sheet_data,
        points_earned=points_breakdown["total_points"]
    )
    
    sheet_dict = sheet.model_dump()
    sheet_dict["created_at"] = sheet_dict["created_at"].isoformat()
    sheet_dict["submitted_by_student"] = True
    
    await db.tracking_sheets.insert_one(sheet_dict)
    
    # منح النقاط (مع الحد الأقصى 1000)
    student_points = await db.student_points.find_one({"student_id": current_user["user_id"]})
    current_total = student_points.get("total_points", 0) if student_points else 0
    points_to_add = min(points_breakdown["total_points"], 1000 - current_total)
    
    if points_to_add > 0:
        await add_points(
            current_user["user_id"],
            points_to_add,
            "tracking",
            f"ورقة متابعة أسبوع {data.week_start}"
        )
    
    # فحص ومنح شارة العابد
    await check_worshipper_badge(current_user["user_id"], points_breakdown["total_points"])
    
    return {
        "message": "تم حفظ ورقة المتابعة بنجاح",
        "sheet_id": sheet.id,
        "points_earned": points_to_add
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

@api_router.get("/tracking-sheets/stats/{student_id}")
async def get_tracking_stats(student_id: str, current_user: dict = Depends(get_current_user)):
    """الحصول على إحصائيات ورقة المتابعة - الأسبوع الحالي والمجموع الفصلي"""
    
    # Get current week start (Sunday)
    today = datetime.now(timezone.utc)
    days_since_sunday = today.weekday() + 1 if today.weekday() != 6 else 0
    current_week_start = (today - timedelta(days=days_since_sunday)).strftime('%Y-%m-%d')
    
    # Get current semester start (assume semester is 4 months)
    # For simplicity, use the beginning of the current semester period
    month = today.month
    if month <= 4:
        semester_start = f"{today.year}-01-01"
    elif month <= 8:
        semester_start = f"{today.year}-05-01"
    else:
        semester_start = f"{today.year}-09-01"
    
    # Get all tracking sheets for this student
    all_sheets = await db.tracking_sheets.find(
        {"student_id": student_id}, 
        {"_id": 0}
    ).to_list(1000)
    
    # Filter for current week
    current_week_sheet = None
    for sheet in all_sheets:
        if sheet.get("week_start") == current_week_start:
            current_week_sheet = sheet
            break
    
    # Calculate weekly totals (from current week sheet)
    weekly_data = {
        "prayers": 0,
        "quran_sitting": 0,
        "duha_prayers": 0,
        "family_recitation": 0,
        "study_hours": 0,
        "witr": 0,
        "night_prayer": 0,
        "fasting": 0,
        "total_points": 0
    }
    
    if current_week_sheet and current_week_sheet.get("data"):
        data = current_week_sheet["data"]
        weekly_data = {
            "prayers": data.get("prayers_count", 0),
            "quran_sitting": data.get("quran_sitting_days", 0),
            "duha_prayers": data.get("duha_prayers", 0),
            "family_recitation": data.get("family_recitation", 0),
            "study_hours": data.get("study_hours", 0),
            "witr": data.get("witr_prayers_days", 0),
            "night_prayer": data.get("night_prayer", 0),
            "fasting": data.get("fasting", 0),
            "total_points": current_week_sheet.get("points_earned", 0)
        }
    
    # Calculate semester totals
    semester_sheets = [s for s in all_sheets if s.get("week_start", "") >= semester_start]
    
    semester_data = {
        "prayers": sum(s["data"].get("prayers_count", 0) for s in semester_sheets if s.get("data")),
        "quran_sitting": sum(s["data"].get("quran_sitting_days", 0) for s in semester_sheets if s.get("data")),
        "duha_prayers": sum(s["data"].get("duha_prayers", 0) for s in semester_sheets if s.get("data")),
        "family_recitation": sum(s["data"].get("family_recitation", 0) for s in semester_sheets if s.get("data")),
        "study_hours": sum(s["data"].get("study_hours", 0) for s in semester_sheets if s.get("data")),
        "witr": sum(s["data"].get("witr_prayers_days", 0) for s in semester_sheets if s.get("data")),
        "night_prayer": sum(s["data"].get("night_prayer", 0) for s in semester_sheets if s.get("data")),
        "fasting": sum(s["data"].get("fasting", 0) for s in semester_sheets if s.get("data")),
        "total_points": sum(s.get("points_earned", 0) for s in semester_sheets),
        "weeks_count": len(semester_sheets)
    }
    
    return {
        "current_week_start": current_week_start,
        "semester_start": semester_start,
        "weekly": weekly_data,
        "semester": semester_data,
        "max_weekly_points": 72,  # الحد الأقصى للنقاط الأسبوعية
        "categories": {
            "prayers": {"max_weekly": 35, "label": "الصلوات"},
            "quran_sitting": {"max_weekly": 7, "label": "الجلوس مع القرآن"},
            "duha_prayers": {"max_weekly": 7, "label": "صلاة الضحى"},
            "family_recitation": {"max_weekly": 7, "label": "التسميع للأهل"},
            "study_hours": {"max_weekly": 7, "label": "ساعات الدراسة"},
            "witr": {"max_weekly": 7, "label": "الوتر"},
            "night_prayer": {"max_weekly": 1, "label": "قيام الليل"},
            "fasting": {"max_weekly": 1, "label": "الصيام"}
        }
    }

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
    
    # ========== إنذار تلقائي عند تجاوز 3 أيام غياب بدون عذر ==========
    elif attendance_data.status == "absent" and not attendance_data.excuse_reason:
        # حساب عدد أيام الغياب بدون عذر
        unexcused_absences = await db.attendance.count_documents({
            "student_id": attendance_data.student_id,
            "status": "absent",
            "$or": [
                {"excuse_reason": None},
                {"excuse_reason": ""},
                {"excuse_reason": {"$exists": False}}
            ]
        })
        
        # إذا تجاوز 3 أيام غياب بدون عذر، إنشاء إنذار تلقائي
        if unexcused_absences >= 3:
            # التحقق من عدم وجود إنذار سابق لنفس السبب في نفس الشهر
            current_month_start = datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            existing_warning = await db.warnings.find_one({
                "student_id": attendance_data.student_id,
                "type": "غياب",
                "created_at": {"$gte": current_month_start.isoformat()}
            })
            
            if not existing_warning:
                # إنشاء إنذار جديد
                warning_doc = {
                    "id": str(uuid.uuid4()),
                    "student_id": attendance_data.student_id,
                    "sheikh_id": current_user["user_id"],
                    "type": "غياب",
                    "message": f"تم تجاوز الحد المسموح من الغياب بدون عذر ({unexcused_absences} أيام)",
                    "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
                    "severity": "high" if unexcused_absences >= 5 else "medium",
                    "auto_generated": True,
                    "created_at": datetime.now(timezone.utc).isoformat()
                }
                await db.warnings.insert_one(warning_doc)
                
                # إرسال إشعار للطالب
                await create_notification_internal(
                    attendance_data.student_id,
                    "⚠️ إنذار غياب",
                    f"لقد تجاوزت الحد المسموح من الغياب بدون عذر ({unexcused_absences} أيام). يرجى الالتزام بالحضور.",
                    "warning"
                )
                
                # إرسال إشعار لولي الأمر (إذا كان هناك رقم هاتف)
                if student.get("father_phone") or student.get("mother_phone"):
                    logger.info(f"إنذار غياب تلقائي للطالب {student.get('name')} - {unexcused_absences} أيام غياب")
                
                return {
                    "message": "تم تسجيل الغياب مع إصدار إنذار تلقائي",
                    "attendance_id": attendance.id,
                    "warning_issued": True,
                    "unexcused_absences": unexcused_absences
                }
    
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
        
        # Calculate recitation score from rating or points
        recitation_score = 0
        if recitations:
            total_rating = sum(r.get("rating", 0) or 0 for r in recitations if r.get("rating"))
            rated_count = sum(1 for r in recitations if r.get("rating"))
            if rated_count > 0:
                recitation_score = (total_rating / rated_count) * 10  # Scale to 100
        
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
    
    # Get student data
    student = await db.users.find_one({"id": student_id}, {"_id": 0, "password_hash": 0})
    
    # Get all data
    tracking = await db.tracking_sheets.find({"student_id": student_id}, {"_id": 0}).to_list(100)
    recitations = await db.recitations.find({"student_id": student_id}, {"_id": 0}).to_list(100)
    attendance = await db.attendance.find({"student_id": student_id}, {"_id": 0}).to_list(1000)
    warnings = await db.warnings.find({"student_id": student_id}, {"_id": 0}).to_list(100)
    
    # Tracking stats
    total_prayers = sum(t["data"].get("prayers_count", 0) for t in tracking)
    total_quran_time = sum(t["data"].get("quran_sitting_minutes", 0) for t in tracking)
    total_family_recitation = sum(t["data"].get("family_recitation_count", 0) for t in tracking)
    
    # Detailed tracking breakdown
    total_adhkar = sum(t["data"].get("adhkar_after_prayer", 0) for t in tracking)
    total_sunnah = sum(t["data"].get("sunnah_prayers", 0) for t in tracking)
    total_witr = sum(t["data"].get("witr_prayer", 0) for t in tracking)
    total_duha = sum(t["data"].get("duha_prayer", 0) for t in tracking)
    
    # New recitation calculations
    total_new_pages = sum(r.get("pages_count", 0) or 0 for r in recitations if r.get("recitation_type") == "new_memorization")
    total_review_pages = sum(r.get("review_pages", 0) or 0 for r in recitations if r.get("review_type") == "pages")
    passed_count = sum(1 for r in recitations if r.get("passed_minimum") or r.get("passed_review_minimum"))
    total_recitation_points = sum(r.get("points_earned", 0) for r in recitations)
    avg_rating = sum(r.get("rating", 0) or 0 for r in recitations if r.get("rating")) / max(len([r for r in recitations if r.get("rating")]), 1)
    
    present_count = sum(1 for a in attendance if a["status"] == "present")
    absent_count = sum(1 for a in attendance if a["status"] == "absent")
    excused_count = sum(1 for a in attendance if a["status"] == "excused")
    
    # Calculate total memorization (previous + new)
    previous_juz = student.get("previous_memorization_juz") or []
    previous_pages = student.get("previous_memorization_pages") or 0
    total_previous = (len(previous_juz) * 20) + previous_pages
    total_memorized = total_previous + total_new_pages
    
    # حساب بيانات ورقة المتابعة - الأسبوعية والفصلية
    today = datetime.now(timezone.utc)
    days_since_sunday = today.weekday() + 1 if today.weekday() != 6 else 0
    current_week_start = (today - timedelta(days=days_since_sunday)).strftime('%Y-%m-%d')
    
    # حساب بداية الفصل
    month = today.month
    if month <= 4:
        semester_start = f"{today.year}-01-01"
    elif month <= 8:
        semester_start = f"{today.year}-05-01"
    else:
        semester_start = f"{today.year}-09-01"
    
    # البحث عن ورقة الأسبوع الحالي
    current_week_sheet = None
    for sheet in tracking:
        if sheet.get("week_start") == current_week_start:
            current_week_sheet = sheet
            break
    
    # البيانات الأسبوعية
    weekly_data = {
        "prayers": 0,
        "quran_sitting": 0,
        "duha_prayers": 0,
        "family_recitation": 0,
        "study_hours": 0,
        "witr": 0,
        "night_prayer": 0,
        "fasting": 0,
        "total_points": 0
    }
    
    if current_week_sheet and current_week_sheet.get("data"):
        data = current_week_sheet["data"]
        weekly_data = {
            "prayers": data.get("prayers_count", 0),
            "quran_sitting": data.get("quran_sitting_days", 0),
            "duha_prayers": data.get("duha_prayers", 0),
            "family_recitation": data.get("family_recitation", 0),
            "study_hours": data.get("study_hours", 0),
            "witr": data.get("witr_prayers_days", 0),
            "night_prayer": data.get("night_prayer", 0),
            "fasting": data.get("fasting", 0),
            "total_points": current_week_sheet.get("points_earned", 0)
        }
    
    # البيانات الفصلية
    semester_sheets = [s for s in tracking if s.get("week_start", "") >= semester_start]
    semester_data = {
        "prayers": sum(s["data"].get("prayers_count", 0) for s in semester_sheets if s.get("data")),
        "quran_sitting": sum(s["data"].get("quran_sitting_days", 0) for s in semester_sheets if s.get("data")),
        "duha_prayers": sum(s["data"].get("duha_prayers", 0) for s in semester_sheets if s.get("data")),
        "family_recitation": sum(s["data"].get("family_recitation", 0) for s in semester_sheets if s.get("data")),
        "study_hours": sum(s["data"].get("study_hours", 0) for s in semester_sheets if s.get("data")),
        "witr": sum(s["data"].get("witr_prayers_days", 0) for s in semester_sheets if s.get("data")),
        "night_prayer": sum(s["data"].get("night_prayer", 0) for s in semester_sheets if s.get("data")),
        "fasting": sum(s["data"].get("fasting", 0) for s in semester_sheets if s.get("data")),
        "total_points": sum(s.get("points_earned", 0) for s in semester_sheets),
        "weeks_count": len(semester_sheets)
    }
    
    return {
        "student": {
            "name": student.get("name"),
            "email": student.get("email"),
            "profile_image": student.get("profile_image"),
            "school_name": student.get("school_name"),
            "school_grade": student.get("school_grade"),
            "school_average": student.get("school_average"),
            "mosque_name": student.get("mosque_name"),
            "tajweed_level": student.get("tajweed_level"),
            "student_phone": student.get("student_phone"),
            "father_phone": student.get("father_phone"),
            "mother_phone": student.get("mother_phone"),
            "birth_date": student.get("birth_date"),
            "join_date": student.get("join_date"),
            "registration_date": student.get("registration_date"),
            "group_id": student.get("group_id"),
            "initial_assessment_done": student.get("initial_assessment_done", False)
        },
        "memorization": {
            "previous_juz": previous_juz,
            "previous_pages": previous_pages,
            "total_previous": total_previous,
            "new_pages": total_new_pages,
            "total_memorized": total_memorized,
            "percentage": round((total_memorized / 604) * 100, 1)
        },
        "tracking": {
            "weekly": weekly_data,
            "semester": semester_data,
            "total_prayers": total_prayers,
            "total_quran_time": total_quran_time,
            "total_family_recitation": total_family_recitation,
            "sheets_count": len(tracking)
        },
        "recitation": {
            "total_new_pages": total_new_pages,
            "total_review_pages": total_review_pages,
            "passed_count": passed_count,
            "total_points": total_recitation_points,
            "recitations_count": len(recitations),
            "average_rating": round(avg_rating, 1)
        },
        "attendance": {
            "present": present_count,
            "absent": absent_count,
            "excused": excused_count,
            "total": len(attendance),
            "percentage": round(present_count / max(len(attendance), 1) * 100, 1)
        },
        "warnings": {
            "count": len(warnings),
            "list": warnings[-5:]  # Last 5 warnings
        },
        "total_points": student.get("points", 0)
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

# ============== CURRICULUM MANAGEMENT (Admin) ==============

@api_router.post("/curriculum")
async def create_curriculum(data: CurriculumCreate, current_user: dict = Depends(get_current_user)):
    """Create a new curriculum (Admin only)"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="فقط المدير يمكنه إدارة المنهج")
    
    curriculum = Curriculum(
        name=data.name,
        description=data.description,
        type=data.type,
        pdf_url=data.pdf_url,
        created_by=current_user["user_id"]
    )
    
    curriculum_dict = curriculum.model_dump()
    curriculum_dict["created_at"] = curriculum_dict["created_at"].isoformat()
    curriculum_dict["updated_at"] = curriculum_dict["updated_at"].isoformat()
    
    await db.curriculum.insert_one(curriculum_dict)
    
    return {"message": "تم إنشاء المنهج بنجاح", "curriculum_id": curriculum.id}

@api_router.get("/curriculum")
async def get_all_curriculum(current_user: dict = Depends(get_current_user)):
    """Get all curriculum (Admin, Sheikh)"""
    if current_user["role"] not in ["admin", "sheikh"]:
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    curricula = await db.curriculum.find({}, {"_id": 0}).sort("created_at", -1).to_list(50)
    
    # Get entries count for each curriculum
    for c in curricula:
        entries_count = await db.curriculum_entries.count_documents({"curriculum_id": c["id"]})
        c["entries_count"] = entries_count
    
    return curricula

@api_router.get("/curriculum/{curriculum_id}")
async def get_curriculum(curriculum_id: str, current_user: dict = Depends(get_current_user)):
    """Get curriculum with entries"""
    if current_user["role"] not in ["admin", "sheikh"]:
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    curriculum = await db.curriculum.find_one({"id": curriculum_id}, {"_id": 0})
    if not curriculum:
        raise HTTPException(status_code=404, detail="المنهج غير موجود")
    
    # Get all entries
    entries = await db.curriculum_entries.find(
        {"curriculum_id": curriculum_id},
        {"_id": 0}
    ).sort("order", 1).to_list(200)
    
    curriculum["entries"] = entries
    return curriculum

@api_router.put("/curriculum/{curriculum_id}")
async def update_curriculum(curriculum_id: str, data: CurriculumCreate, current_user: dict = Depends(get_current_user)):
    """Update curriculum (Admin only)"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="فقط المدير يمكنه تعديل المنهج")
    
    curriculum = await db.curriculum.find_one({"id": curriculum_id})
    if not curriculum:
        raise HTTPException(status_code=404, detail="المنهج غير موجود")
    
    update_data = {
        "name": data.name,
        "description": data.description,
        "type": data.type,
        "pdf_url": data.pdf_url,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.curriculum.update_one({"id": curriculum_id}, {"$set": update_data})
    return {"message": "تم تحديث المنهج بنجاح"}

@api_router.delete("/curriculum/{curriculum_id}")
async def delete_curriculum(curriculum_id: str, current_user: dict = Depends(get_current_user)):
    """Delete curriculum (Admin only)"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="فقط المدير يمكنه حذف المنهج")
    
    result = await db.curriculum.delete_one({"id": curriculum_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="المنهج غير موجود")
    
    # Delete all entries
    await db.curriculum_entries.delete_many({"curriculum_id": curriculum_id})
    
    return {"message": "تم حذف المنهج بنجاح"}

# Curriculum Entries
@api_router.post("/curriculum/{curriculum_id}/entries")
async def add_curriculum_entry(curriculum_id: str, data: CurriculumEntryCreate, current_user: dict = Depends(get_current_user)):
    """Add entry to curriculum (Admin only)"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="فقط المدير يمكنه إضافة خطط للمنهج")
    
    # Verify curriculum exists
    curriculum = await db.curriculum.find_one({"id": curriculum_id})
    if not curriculum:
        raise HTTPException(status_code=404, detail="المنهج غير موجود")
    
    # Get current max order
    last_entry = await db.curriculum_entries.find_one(
        {"curriculum_id": curriculum_id},
        sort=[("order", -1)]
    )
    next_order = (last_entry["order"] + 1) if last_entry else 0
    
    entry = CurriculumEntry(
        curriculum_id=curriculum_id,
        title=data.title,
        date=data.date,
        topic=data.topic,
        goal=data.goal,
        references=data.references,
        results=data.results,
        order=next_order
    )
    
    entry_dict = entry.model_dump()
    entry_dict["created_at"] = entry_dict["created_at"].isoformat()
    
    await db.curriculum_entries.insert_one(entry_dict)
    
    return {"message": "تم إضافة الخطة بنجاح", "entry_id": entry.id}

@api_router.put("/curriculum/entries/{entry_id}")
async def update_curriculum_entry(entry_id: str, data: CurriculumEntryCreate, current_user: dict = Depends(get_current_user)):
    """Update curriculum entry (Admin only)"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="فقط المدير يمكنه تعديل الخطط")
    
    result = await db.curriculum_entries.update_one(
        {"id": entry_id},
        {"$set": {
            "title": data.title,
            "date": data.date,
            "topic": data.topic,
            "goal": data.goal,
            "references": data.references,
            "results": data.results
        }}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="الخطة غير موجودة")
    
    return {"message": "تم تحديث الخطة بنجاح"}

@api_router.delete("/curriculum/entries/{entry_id}")
async def delete_curriculum_entry(entry_id: str, current_user: dict = Depends(get_current_user)):
    """Delete curriculum entry (Admin only)"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="فقط المدير يمكنه حذف الخطط")
    
    result = await db.curriculum_entries.delete_one({"id": entry_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="الخطة غير موجودة")
    
    return {"message": "تم حذف الخطة بنجاح"}

# ============== SCHEDULE MANAGEMENT (Admin) ==============

@api_router.post("/schedule")
async def create_schedule(data: ScheduleCreate, current_user: dict = Depends(get_current_user)):
    """Create a new schedule (Admin only)"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="فقط المدير يمكنه إدارة الجداول")
    
    schedule = Schedule(
        name=data.name,
        description=data.description,
        start_date=data.start_date,
        end_date=data.end_date,
        created_by=current_user["user_id"]
    )
    
    schedule_dict = schedule.model_dump()
    schedule_dict["created_at"] = schedule_dict["created_at"].isoformat()
    schedule_dict["updated_at"] = schedule_dict["updated_at"].isoformat()
    
    await db.schedules.insert_one(schedule_dict)
    
    return {"message": "تم إنشاء الجدول بنجاح", "schedule_id": schedule.id}

@api_router.get("/schedule")
async def get_all_schedules(current_user: dict = Depends(get_current_user)):
    """Get all schedules (Admin, Sheikh)"""
    if current_user["role"] not in ["admin", "sheikh"]:
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    schedules = await db.schedules.find({}, {"_id": 0}).sort("created_at", -1).to_list(50)
    
    # Get slots count for each schedule
    for s in schedules:
        slots_count = await db.schedule_slots.count_documents({"schedule_id": s["id"]})
        s["slots_count"] = slots_count
    
    return schedules

@api_router.get("/schedule/active")
async def get_active_schedule(current_user: dict = Depends(get_current_user)):
    """Get the active schedule with all slots"""
    if current_user["role"] not in ["admin", "sheikh"]:
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    schedule = await db.schedules.find_one({"is_active": True}, {"_id": 0})
    if not schedule:
        return None
    
    # Get all slots
    slots = await db.schedule_slots.find(
        {"schedule_id": schedule["id"]},
        {"_id": 0}
    ).to_list(200)
    
    schedule["slots"] = slots
    return schedule

@api_router.get("/schedule/{schedule_id}")
async def get_schedule(schedule_id: str, current_user: dict = Depends(get_current_user)):
    """Get schedule with slots"""
    if current_user["role"] not in ["admin", "sheikh"]:
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    schedule = await db.schedules.find_one({"id": schedule_id}, {"_id": 0})
    if not schedule:
        raise HTTPException(status_code=404, detail="الجدول غير موجود")
    
    # Get all slots
    slots = await db.schedule_slots.find(
        {"schedule_id": schedule_id},
        {"_id": 0}
    ).to_list(200)
    
    schedule["slots"] = slots
    return schedule

@api_router.put("/schedule/{schedule_id}")
async def update_schedule(schedule_id: str, data: ScheduleCreate, current_user: dict = Depends(get_current_user)):
    """Update schedule (Admin only)"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="فقط المدير يمكنه تعديل الجدول")
    
    schedule = await db.schedules.find_one({"id": schedule_id})
    if not schedule:
        raise HTTPException(status_code=404, detail="الجدول غير موجود")
    
    update_data = {
        "name": data.name,
        "description": data.description,
        "start_date": data.start_date,
        "end_date": data.end_date,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.schedules.update_one({"id": schedule_id}, {"$set": update_data})
    return {"message": "تم تحديث الجدول بنجاح"}

@api_router.put("/schedule/{schedule_id}/activate")
async def activate_schedule(schedule_id: str, current_user: dict = Depends(get_current_user)):
    """Set schedule as active (Admin only)"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="فقط المدير يمكنه تفعيل الجدول")
    
    # Deactivate all schedules
    await db.schedules.update_many({}, {"$set": {"is_active": False}})
    
    # Activate selected schedule
    result = await db.schedules.update_one(
        {"id": schedule_id},
        {"$set": {"is_active": True}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="الجدول غير موجود")
    
    return {"message": "تم تفعيل الجدول بنجاح"}

@api_router.delete("/schedule/{schedule_id}")
async def delete_schedule(schedule_id: str, current_user: dict = Depends(get_current_user)):
    """Delete schedule (Admin only)"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="فقط المدير يمكنه حذف الجدول")
    
    result = await db.schedules.delete_one({"id": schedule_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="الجدول غير موجود")
    
    # Delete all slots
    await db.schedule_slots.delete_many({"schedule_id": schedule_id})
    
    return {"message": "تم حذف الجدول بنجاح"}

# Schedule Slots
@api_router.post("/schedule/{schedule_id}/slots")
async def add_schedule_slot(schedule_id: str, data: ScheduleSlotCreate, current_user: dict = Depends(get_current_user)):
    """Add slot to schedule (Admin only)"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="فقط المدير يمكنه إضافة حصص للجدول")
    
    # Verify schedule exists
    schedule = await db.schedules.find_one({"id": schedule_id})
    if not schedule:
        raise HTTPException(status_code=404, detail="الجدول غير موجود")
    
    slot = ScheduleSlot(
        schedule_id=schedule_id,
        day=data.day,
        start_time=data.start_time,
        end_time=data.end_time,
        subject=data.subject,
        description=data.description,
        group_id=data.group_id
    )
    
    slot_dict = slot.model_dump()
    slot_dict["created_at"] = slot_dict["created_at"].isoformat()
    
    await db.schedule_slots.insert_one(slot_dict)
    
    return {"message": "تم إضافة الحصة بنجاح", "slot_id": slot.id}

@api_router.put("/schedule/slots/{slot_id}")
async def update_schedule_slot(slot_id: str, data: ScheduleSlotCreate, current_user: dict = Depends(get_current_user)):
    """Update schedule slot (Admin only)"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="فقط المدير يمكنه تعديل الحصص")
    
    result = await db.schedule_slots.update_one(
        {"id": slot_id},
        {"$set": {
            "day": data.day,
            "start_time": data.start_time,
            "end_time": data.end_time,
            "subject": data.subject,
            "description": data.description,
            "group_id": data.group_id
        }}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="الحصة غير موجودة")
    
    return {"message": "تم تحديث الحصة بنجاح"}

@api_router.delete("/schedule/slots/{slot_id}")
async def delete_schedule_slot(slot_id: str, current_user: dict = Depends(get_current_user)):
    """Delete schedule slot (Admin only)"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="فقط المدير يمكنه حذف الحصص")
    
    result = await db.schedule_slots.delete_one({"id": slot_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="الحصة غير موجودة")
    
    return {"message": "تم حذف الحصة بنجاح"}

# ============== RANKINGS & STATISTICS ==============

@api_router.get("/rankings/sheikh-students")
async def get_sheikh_students_ranking(current_user: dict = Depends(get_current_user)):
    """Get ranking of students in sheikh's groups"""
    if current_user["role"] != "sheikh":
        raise HTTPException(status_code=403, detail="فقط للمشايخ")
    
    # Get sheikh's groups
    groups = await db.groups.find({"sheikh_id": current_user["user_id"]}, {"_id": 0}).to_list(20)
    group_ids = [g["id"] for g in groups]
    
    if not group_ids:
        return {"students": [], "groups": []}
    
    # Get all students in these groups
    students = await db.users.find(
        {"group_id": {"$in": group_ids}, "role": "student"},
        {"_id": 0, "password_hash": 0}
    ).to_list(500)
    
    rankings = []
    for student in students:
        # Get points
        points_data = await db.student_points.find_one({"student_id": student["id"]}, {"_id": 0})
        total_points = points_data.get("total_points", 0) if points_data else 0
        
        # Get attendance stats
        total_attendance = await db.attendance.count_documents({"student_id": student["id"]})
        present_attendance = await db.attendance.count_documents({"student_id": student["id"], "status": "present"})
        attendance_rate = round((present_attendance / total_attendance * 100), 1) if total_attendance > 0 else 0
        
        # Get recitation stats
        recitations = await db.recitations.find({"student_id": student["id"]}, {"_id": 0}).to_list(1000)
        total_recitations = len(recitations)
        total_pages = sum(r.get("page_to", 0) - r.get("page_from", 0) + 1 for r in recitations if r.get("page_from") and r.get("page_to"))
        
        # Get group name
        group = next((g for g in groups if g["id"] == student.get("group_id")), None)
        
        rankings.append({
            "student_id": student["id"],
            "student_name": student["name"],
            "group_id": student.get("group_id"),
            "group_name": group["name"] if group else "بدون مجموعة",
            "total_points": total_points,
            "attendance_rate": attendance_rate,
            "total_recitations": total_recitations,
            "total_pages": total_pages,
            "level": points_data.get("level", 1) if points_data else 1
        })
    
    # Sort by points
    rankings.sort(key=lambda x: x["total_points"], reverse=True)
    
    # Add rank position
    for i, r in enumerate(rankings):
        r["rank"] = i + 1
    
    return {"students": rankings, "groups": groups}

@api_router.get("/rankings/admin")
async def get_admin_rankings(
    filter_type: str = "groups",  # groups, students, attendance, recitations
    current_user: dict = Depends(get_current_user)
):
    """Get rankings for admin with different filters"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="فقط المدير يمكنه الوصول")
    
    if filter_type == "groups":
        # Get all groups with their stats
        groups = await db.groups.find({}, {"_id": 0}).to_list(100)
        
        group_rankings = []
        for group in groups:
            # Get students in group
            students = await db.users.find(
                {"group_id": group["id"], "role": "student"},
                {"_id": 0, "id": 1}
            ).to_list(500)
            student_ids = [s["id"] for s in students]
            
            # Get total points for group
            points_data = await db.student_points.find(
                {"student_id": {"$in": student_ids}},
                {"_id": 0, "total_points": 1}
            ).to_list(500)
            total_points = sum(p.get("total_points", 0) for p in points_data)
            avg_points = round(total_points / len(students), 1) if students else 0
            
            # Get attendance rate
            total_attendance = await db.attendance.count_documents({"student_id": {"$in": student_ids}})
            present_attendance = await db.attendance.count_documents({"student_id": {"$in": student_ids}, "status": "present"})
            attendance_rate = round((present_attendance / total_attendance * 100), 1) if total_attendance > 0 else 0
            
            # Get sheikh name
            sheikh = await db.users.find_one({"id": group.get("sheikh_id")}, {"_id": 0, "name": 1})
            
            group_rankings.append({
                "group_id": group["id"],
                "group_name": group["name"],
                "sheikh_name": sheikh["name"] if sheikh else "غير معين",
                "student_count": len(students),
                "total_points": total_points,
                "avg_points": avg_points,
                "attendance_rate": attendance_rate
            })
        
        # Sort by total points
        group_rankings.sort(key=lambda x: x["total_points"], reverse=True)
        
        for i, g in enumerate(group_rankings):
            g["rank"] = i + 1
        
        return {"type": "groups", "data": group_rankings}
    
    elif filter_type == "students":
        # Get all students with points
        students = await db.users.find(
            {"role": "student"},
            {"_id": 0, "password_hash": 0}
        ).to_list(1000)
        
        student_rankings = []
        for student in students:
            points_data = await db.student_points.find_one({"student_id": student["id"]}, {"_id": 0})
            total_points = points_data.get("total_points", 0) if points_data else 0
            
            # Get group name
            group = await db.groups.find_one({"id": student.get("group_id")}, {"_id": 0, "name": 1})
            
            student_rankings.append({
                "student_id": student["id"],
                "student_name": student["name"],
                "group_name": group["name"] if group else "بدون مجموعة",
                "total_points": total_points,
                "level": points_data.get("level", 1) if points_data else 1
            })
        
        student_rankings.sort(key=lambda x: x["total_points"], reverse=True)
        
        for i, s in enumerate(student_rankings):
            s["rank"] = i + 1
        
        return {"type": "students", "data": student_rankings}
    
    elif filter_type == "attendance":
        # Get all students sorted by attendance rate
        students = await db.users.find(
            {"role": "student"},
            {"_id": 0, "id": 1, "name": 1, "group_id": 1}
        ).to_list(1000)
        
        attendance_rankings = []
        for student in students:
            total = await db.attendance.count_documents({"student_id": student["id"]})
            present = await db.attendance.count_documents({"student_id": student["id"], "status": "present"})
            excused = await db.attendance.count_documents({"student_id": student["id"], "status": "excused"})
            absent = await db.attendance.count_documents({"student_id": student["id"], "status": "absent"})
            rate = round((present / total * 100), 1) if total > 0 else 0
            
            group = await db.groups.find_one({"id": student.get("group_id")}, {"_id": 0, "name": 1})
            
            attendance_rankings.append({
                "student_id": student["id"],
                "student_name": student["name"],
                "group_name": group["name"] if group else "بدون مجموعة",
                "total_days": total,
                "present_days": present,
                "excused_days": excused,
                "absent_days": absent,
                "attendance_rate": rate
            })
        
        attendance_rankings.sort(key=lambda x: x["attendance_rate"], reverse=True)
        
        for i, a in enumerate(attendance_rankings):
            a["rank"] = i + 1
        
        return {"type": "attendance", "data": attendance_rankings}
    
    elif filter_type == "recitations":
        # Get all students sorted by recitation performance
        students = await db.users.find(
            {"role": "student"},
            {"_id": 0, "id": 1, "name": 1, "group_id": 1}
        ).to_list(1000)
        
        recitation_rankings = []
        for student in students:
            recitations = await db.recitations.find(
                {"student_id": student["id"]},
                {"_id": 0}
            ).to_list(1000)
            
            total_recitations = len(recitations)
            new_memorization = len([r for r in recitations if r.get("recitation_type") == "new_memorization"])
            reviews = len([r for r in recitations if r.get("recitation_type") == "review"])
            total_pages = sum(r.get("page_to", 0) - r.get("page_from", 0) + 1 for r in recitations if r.get("page_from") and r.get("page_to"))
            total_points = sum(r.get("points_earned", 0) for r in recitations)
            
            group = await db.groups.find_one({"id": student.get("group_id")}, {"_id": 0, "name": 1})
            
            recitation_rankings.append({
                "student_id": student["id"],
                "student_name": student["name"],
                "group_name": group["name"] if group else "بدون مجموعة",
                "total_recitations": total_recitations,
                "new_memorization": new_memorization,
                "reviews": reviews,
                "total_pages": total_pages,
                "total_points": total_points
            })
        
        recitation_rankings.sort(key=lambda x: x["total_pages"], reverse=True)
        
        for i, r in enumerate(recitation_rankings):
            r["rank"] = i + 1
        
        return {"type": "recitations", "data": recitation_rankings}
    
    return {"type": filter_type, "data": []}

# ============== PDF UPLOAD FOR CURRICULUM ==============

from fastapi import File, UploadFile
import base64

# ============== ADMIN COMPREHENSIVE STATISTICS ==============

@api_router.get("/admin/dashboard-stats")
async def get_admin_dashboard_stats(current_user: dict = Depends(get_current_user)):
    """Get comprehensive statistics for admin dashboard"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="فقط المدير يمكنه الوصول")
    
    # Basic counts
    total_students = await db.users.count_documents({"role": "student", "is_active": True})
    total_sheikhs = await db.users.count_documents({"role": "sheikh"})
    total_groups = await db.groups.count_documents({})
    pending_students = await db.users.count_documents({"role": "student", "is_active": False})
    
    # Calculate total points
    all_points = await db.student_points.find({}, {"_id": 0, "total_points": 1}).to_list(1000)
    total_points = sum(p.get("total_points", 0) for p in all_points)
    
    # Attendance stats (this week)
    today = datetime.now(timezone.utc)
    week_start = (today - timedelta(days=today.weekday())).strftime("%Y-%m-%d")
    
    week_attendance = await db.attendance.count_documents({"date": {"$gte": week_start}, "status": "present"})
    
    # Recitation stats
    total_recitations = await db.recitations.count_documents({})
    week_recitations = await db.recitations.find({"created_at": {"$gte": week_start}}, {"_id": 0}).to_list(1000)
    week_pages = sum(
        (r.get("page_to", 0) - r.get("page_from", 0) + 1) 
        for r in week_recitations 
        if r.get("page_from") and r.get("page_to")
    )
    
    # Top groups by points
    groups = await db.groups.find({}, {"_id": 0}).to_list(100)
    group_stats = []
    for group in groups:
        students = await db.users.find(
            {"group_id": group["id"], "role": "student"},
            {"_id": 0, "id": 1}
        ).to_list(500)
        student_ids = [s["id"] for s in students]
        
        points_data = await db.student_points.find(
            {"student_id": {"$in": student_ids}},
            {"_id": 0, "total_points": 1}
        ).to_list(500)
        group_points = sum(p.get("total_points", 0) for p in points_data)
        
        sheikh = await db.users.find_one({"id": group.get("sheikh_id")}, {"_id": 0, "name": 1})
        
        group_stats.append({
            "group_id": group["id"],
            "group_name": group["name"],
            "sheikh_name": sheikh["name"] if sheikh else "غير معين",
            "student_count": len(students),
            "total_points": group_points
        })
    
    group_stats.sort(key=lambda x: x["total_points"], reverse=True)
    
    # Top students
    students = await db.users.find(
        {"role": "student", "is_active": True},
        {"_id": 0, "id": 1, "name": 1, "group_id": 1}
    ).to_list(1000)
    
    top_students = []
    for student in students:
        points_data = await db.student_points.find_one({"student_id": student["id"]}, {"_id": 0})
        total = points_data.get("total_points", 0) if points_data else 0
        
        group = await db.groups.find_one({"id": student.get("group_id")}, {"_id": 0, "name": 1})
        
        top_students.append({
            "student_id": student["id"],
            "student_name": student["name"],
            "group_name": group["name"] if group else "بدون مجموعة",
            "total_points": total
        })
    
    top_students.sort(key=lambda x: x["total_points"], reverse=True)
    
    # Sheikhs list with stats
    sheikhs = await db.users.find({"role": "sheikh"}, {"_id": 0, "password_hash": 0}).to_list(100)
    sheikh_stats = []
    for sheikh in sheikhs:
        sheikh_groups = await db.groups.find({"sheikh_id": sheikh["id"]}, {"_id": 0}).to_list(20)
        group_ids = [g["id"] for g in sheikh_groups]
        
        students_count = await db.users.count_documents({"group_id": {"$in": group_ids}, "role": "student"})
        recitations_count = await db.recitations.count_documents({"sheikh_id": sheikh["id"]})
        
        sheikh_stats.append({
            "sheikh_id": sheikh["id"],
            "sheikh_name": sheikh["name"],
            "email": sheikh["email"],
            "groups_count": len(sheikh_groups),
            "students_count": students_count,
            "recitations_count": recitations_count
        })
    
    return {
        "summary": {
            "total_students": total_students,
            "total_sheikhs": total_sheikhs,
            "total_groups": total_groups,
            "pending_students": pending_students,
            "total_points": total_points,
            "week_attendance": week_attendance,
            "total_recitations": total_recitations,
            "week_pages": week_pages
        },
        "top_groups": group_stats[:5],
        "top_students": top_students[:10],
        "sheikhs": sheikh_stats
    }

@api_router.get("/admin/sheikh/{sheikh_id}")
async def get_sheikh_details(sheikh_id: str, current_user: dict = Depends(get_current_user)):
    """Get detailed information about a sheikh (Admin only)"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="فقط المدير يمكنه الوصول")
    
    sheikh = await db.users.find_one({"id": sheikh_id, "role": "sheikh"}, {"_id": 0, "password_hash": 0})
    if not sheikh:
        raise HTTPException(status_code=404, detail="الشيخ غير موجود")
    
    # Get sheikh's groups
    groups = await db.groups.find({"sheikh_id": sheikh_id}, {"_id": 0}).to_list(20)
    
    # Get all students in these groups
    group_ids = [g["id"] for g in groups]
    students = await db.users.find(
        {"group_id": {"$in": group_ids}, "role": "student"},
        {"_id": 0, "password_hash": 0}
    ).to_list(500)
    
    # Get recitation and attendance stats
    total_recitations = await db.recitations.count_documents({"sheikh_id": sheikh_id})
    total_attendance = await db.attendance.count_documents({"sheikh_id": sheikh_id})
    
    return {
        "sheikh": sheikh,
        "groups": groups,
        "students": students,
        "stats": {
            "groups_count": len(groups),
            "students_count": len(students),
            "total_recitations": total_recitations,
            "total_attendance_records": total_attendance
        }
    }

@api_router.get("/admin/student/{student_id}")
async def get_student_full_details(student_id: str, current_user: dict = Depends(get_current_user)):
    """Get full details about a student (Admin only)"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="فقط المدير يمكنه الوصول")
    
    student = await db.users.find_one({"id": student_id, "role": "student"}, {"_id": 0, "password_hash": 0})
    if not student:
        raise HTTPException(status_code=404, detail="الطالب غير موجود")
    
    # Get group
    group = await db.groups.find_one({"id": student.get("group_id")}, {"_id": 0})
    
    # Get sheikh
    sheikh = await db.users.find_one({"id": group.get("sheikh_id")}, {"_id": 0, "name": 1, "email": 1}) if group else None
    
    # Get all recitations
    recitations = await db.recitations.find({"student_id": student_id}, {"_id": 0}).sort("created_at", -1).to_list(100)
    
    # Get all attendance
    attendance = await db.attendance.find({"student_id": student_id}, {"_id": 0}).sort("date", -1).to_list(100)
    
    # Get tracking sheets
    tracking_sheets = await db.tracking_sheets.find({"student_id": student_id}, {"_id": 0}).sort("created_at", -1).to_list(50)
    
    # Get points breakdown
    points_data = await db.student_points.find_one({"student_id": student_id}, {"_id": 0})
    
    # Get warnings
    warnings = await db.warnings.find({"student_id": student_id}, {"_id": 0}).to_list(50)
    
    return {
        "student": student,
        "group": group,
        "sheikh": sheikh,
        "recitations": recitations,
        "attendance": attendance,
        "tracking_sheets": tracking_sheets,
        "points": points_data,
        "warnings": warnings
    }

# ============== FINANCIAL FEES ==============

@api_router.post("/fees")
async def create_fee(data: FeeCreate, current_user: dict = Depends(get_current_user)):
    """Create a fee for a student (Admin only)"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="فقط المدير يمكنه إضافة الرسوم")
    
    # Verify student exists
    student = await db.users.find_one({"id": data.student_id, "role": "student"})
    if not student:
        raise HTTPException(status_code=404, detail="الطالب غير موجود")
    
    fee = Fee(
        student_id=data.student_id,
        fee_type=data.fee_type,
        amount=data.amount,
        description=data.description,
        due_date=data.due_date,
        created_by=current_user["user_id"]
    )
    
    fee_dict = fee.model_dump()
    fee_dict["created_at"] = fee_dict["created_at"].isoformat()
    
    await db.fees.insert_one(fee_dict)
    
    # Notify student
    fee_types = {"subscription": "رسوم اشتراك", "umrah": "عمرة", "activity": "نشاط"}
    await create_notification_internal(
        data.student_id,
        "رسوم مالية جديدة",
        f"تم إضافة {fee_types.get(data.fee_type, data.fee_type)} بمبلغ {data.amount}",
        "warning"
    )
    
    return {"message": "تم إضافة الرسوم بنجاح", "fee_id": fee.id}

@api_router.get("/fees")
async def get_fees(student_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    """Get fees - Admin sees all, Student sees their own"""
    query = {}
    if current_user["role"] == "student":
        query["student_id"] = current_user["user_id"]
    elif student_id:
        query["student_id"] = student_id
    
    fees = await db.fees.find(query, {"_id": 0}).sort("created_at", -1).to_list(200)
    
    # Add student names
    for fee in fees:
        student = await db.users.find_one({"id": fee["student_id"]}, {"_id": 0, "name": 1})
        fee["student_name"] = student["name"] if student else "غير معروف"
    
    return fees

@api_router.get("/fees/student/{student_id}")
async def get_student_fees(student_id: str, current_user: dict = Depends(get_current_user)):
    """Get fees for a specific student"""
    if current_user["role"] == "student" and current_user["user_id"] != student_id:
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    fees = await db.fees.find({"student_id": student_id}, {"_id": 0}).sort("created_at", -1).to_list(100)
    
    total_due = sum(f["amount"] for f in fees if not f.get("is_paid"))
    total_paid = sum(f["amount"] for f in fees if f.get("is_paid"))
    
    return {
        "fees": fees,
        "summary": {
            "total_due": total_due,
            "total_paid": total_paid,
            "pending_count": len([f for f in fees if not f.get("is_paid")])
        }
    }

@api_router.put("/fees/{fee_id}/pay")
async def mark_fee_paid(fee_id: str, current_user: dict = Depends(get_current_user)):
    """Mark a fee as paid (Admin only)"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="فقط المدير يمكنه تأكيد الدفع")
    
    result = await db.fees.update_one(
        {"id": fee_id},
        {"$set": {
            "is_paid": True,
            "paid_date": datetime.now(timezone.utc).strftime("%Y-%m-%d")
        }}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="الرسوم غير موجودة")
    
    return {"message": "تم تأكيد الدفع بنجاح"}

@api_router.delete("/fees/{fee_id}")
async def delete_fee(fee_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a fee (Admin only)"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="فقط المدير يمكنه حذف الرسوم")
    
    result = await db.fees.delete_one({"id": fee_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="الرسوم غير موجودة")
    
    return {"message": "تم حذف الرسوم بنجاح"}

# ============== HOMEWORK/ASSIGNMENTS ==============

@api_router.post("/homework")
async def create_homework(data: HomeworkCreate, current_user: dict = Depends(get_current_user)):
    """Create homework (Admin or Sheikh)"""
    if current_user["role"] not in ["admin", "sheikh"]:
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    homework = Homework(
        title=data.title,
        description=data.description,
        due_date=data.due_date,
        group_id=data.group_id,
        student_ids=data.student_ids,
        created_by=current_user["user_id"],
        created_by_role=current_user["role"]
    )
    
    homework_dict = homework.model_dump()
    homework_dict["created_at"] = homework_dict["created_at"].isoformat()
    
    await db.homework.insert_one(homework_dict)
    
    # Create submissions for students
    target_students = []
    if data.student_ids:
        target_students = data.student_ids
    elif data.group_id:
        students = await db.users.find({"group_id": data.group_id, "role": "student"}, {"_id": 0, "id": 1}).to_list(500)
        target_students = [s["id"] for s in students]
    else:
        # All students (for sheikh, only their groups)
        if current_user["role"] == "sheikh":
            groups = await db.groups.find({"sheikh_id": current_user["user_id"]}, {"_id": 0, "id": 1}).to_list(20)
            group_ids = [g["id"] for g in groups]
            students = await db.users.find({"group_id": {"$in": group_ids}, "role": "student"}, {"_id": 0, "id": 1}).to_list(500)
            target_students = [s["id"] for s in students]
    
    # Create submission records and notify
    for student_id in target_students:
        submission = HomeworkSubmission(
            homework_id=homework.id,
            student_id=student_id
        )
        sub_dict = submission.model_dump()
        if sub_dict.get("submitted_at"):
            sub_dict["submitted_at"] = sub_dict["submitted_at"].isoformat()
        if sub_dict.get("graded_at"):
            sub_dict["graded_at"] = sub_dict["graded_at"].isoformat()
        await db.homework_submissions.insert_one(sub_dict)
        
        await create_notification_internal(
            student_id,
            "واجب جديد",
            f"تم إضافة واجب: {data.title} - موعد التسليم: {data.due_date}",
            "info"
        )
    
    return {"message": "تم إضافة الواجب بنجاح", "homework_id": homework.id}

@api_router.get("/homework")
async def get_homework(current_user: dict = Depends(get_current_user)):
    """Get homework based on role"""
    if current_user["role"] == "student":
        # Get student's submissions with homework details
        submissions = await db.homework_submissions.find(
            {"student_id": current_user["user_id"]},
            {"_id": 0}
        ).to_list(100)
        
        result = []
        for sub in submissions:
            homework = await db.homework.find_one({"id": sub["homework_id"]}, {"_id": 0})
            if homework:
                result.append({**homework, "submission": sub})
        
        return sorted(result, key=lambda x: x.get("due_date", ""), reverse=True)
    
    elif current_user["role"] == "sheikh":
        homework = await db.homework.find(
            {"created_by": current_user["user_id"]},
            {"_id": 0}
        ).sort("created_at", -1).to_list(100)
        return homework
    
    else:  # Admin
        homework = await db.homework.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
        return homework

@api_router.get("/homework/{homework_id}/submissions")
async def get_homework_submissions(homework_id: str, current_user: dict = Depends(get_current_user)):
    """Get submissions for a homework (Admin/Sheikh)"""
    if current_user["role"] not in ["admin", "sheikh"]:
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    submissions = await db.homework_submissions.find({"homework_id": homework_id}, {"_id": 0}).to_list(500)
    
    # Add student names
    for sub in submissions:
        student = await db.users.find_one({"id": sub["student_id"]}, {"_id": 0, "name": 1})
        sub["student_name"] = student["name"] if student else "غير معروف"
    
    return submissions

@api_router.put("/homework/submissions/{submission_id}/grade")
async def grade_homework(submission_id: str, grade: int, feedback: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    """Grade a homework submission"""
    if current_user["role"] not in ["admin", "sheikh"]:
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    result = await db.homework_submissions.update_one(
        {"id": submission_id},
        {"$set": {
            "status": "graded",
            "grade": grade,
            "feedback": feedback,
            "graded_at": datetime.now(timezone.utc).isoformat(),
            "graded_by": current_user["user_id"]
        }}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="التسليم غير موجود")
    
    return {"message": "تم تقييم الواجب بنجاح"}

@api_router.delete("/homework/{homework_id}")
async def delete_homework(homework_id: str, current_user: dict = Depends(get_current_user)):
    """Delete homework"""
    if current_user["role"] not in ["admin", "sheikh"]:
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    # Check ownership for sheikh
    if current_user["role"] == "sheikh":
        homework = await db.homework.find_one({"id": homework_id})
        if homework and homework.get("created_by") != current_user["user_id"]:
            raise HTTPException(status_code=403, detail="لا يمكنك حذف واجب لم تقم بإنشائه")
    
    await db.homework.delete_one({"id": homework_id})
    await db.homework_submissions.delete_many({"homework_id": homework_id})
    
    return {"message": "تم حذف الواجب بنجاح"}

# ============== ADMINISTRATIVE EXAMS (مفاصل إدارية) ==============

@api_router.post("/admin-exams")
async def create_admin_exam(data: AdminExamCreate, current_user: dict = Depends(get_current_user)):
    """Create an administrative exam (Admin/Sheikh)"""
    if current_user["role"] not in ["admin", "sheikh"]:
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    # Verify student
    student = await db.users.find_one({"id": data.student_id, "role": "student"})
    if not student:
        raise HTTPException(status_code=404, detail="الطالب غير موجود")
    
    exam = AdminExam(
        student_id=data.student_id,
        exam_type=data.exam_type,
        juz_number=data.juz_number,
        surah_name=data.surah_name,
        page_from=data.page_from,
        page_to=data.page_to,
        error_count=data.error_count,
        warning_count=data.warning_count,
        tajweed_errors=data.tajweed_errors,
        pronunciation_errors=data.pronunciation_errors,
        memorization_errors=data.memorization_errors,
        result=data.result,
        grade=data.grade,
        notes=data.notes,
        examiner_id=current_user["user_id"],
        exam_date=datetime.now(timezone.utc).strftime("%Y-%m-%d")
    )
    
    exam_dict = exam.model_dump()
    exam_dict["created_at"] = exam_dict["created_at"].isoformat()
    
    await db.admin_exams.insert_one(exam_dict)
    
    # Notify student
    result_text = "ناجح ✅" if data.result == "pass" else "راسب ❌" if data.result == "fail" else "قيد المراجعة"
    exam_type_text = "مفصل قرآن" if data.exam_type == "quran" else "امتحان تجويد"
    await create_notification_internal(
        data.student_id,
        f"نتيجة {exam_type_text}",
        f"النتيجة: {result_text} - الدرجة: {data.grade or 0}%",
        "success" if data.result == "pass" else "warning"
    )
    
    return {"message": "تم إضافة الامتحان بنجاح", "exam_id": exam.id}

@api_router.get("/admin-exams")
async def get_admin_exams(student_id: Optional[str] = None, exam_type: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    """Get administrative exams"""
    query = {}
    
    if current_user["role"] == "student":
        query["student_id"] = current_user["user_id"]
    elif student_id:
        query["student_id"] = student_id
    
    if exam_type:
        query["exam_type"] = exam_type
    
    exams = await db.admin_exams.find(query, {"_id": 0}).sort("created_at", -1).to_list(200)
    
    # Add names
    for exam in exams:
        student = await db.users.find_one({"id": exam["student_id"]}, {"_id": 0, "name": 1})
        examiner = await db.users.find_one({"id": exam["examiner_id"]}, {"_id": 0, "name": 1})
        exam["student_name"] = student["name"] if student else "غير معروف"
        exam["examiner_name"] = examiner["name"] if examiner else "غير معروف"
    
    return exams

@api_router.get("/admin-exams/student/{student_id}")
async def get_student_exams(student_id: str, current_user: dict = Depends(get_current_user)):
    """Get all exams for a student with summary"""
    if current_user["role"] == "student" and current_user["user_id"] != student_id:
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    exams = await db.admin_exams.find({"student_id": student_id}, {"_id": 0}).sort("created_at", -1).to_list(100)
    
    quran_exams = [e for e in exams if e["exam_type"] == "quran"]
    tajweed_exams = [e for e in exams if e["exam_type"] == "tajweed"]
    
    return {
        "exams": exams,
        "summary": {
            "total_quran_exams": len(quran_exams),
            "passed_quran": len([e for e in quran_exams if e["result"] == "pass"]),
            "failed_quran": len([e for e in quran_exams if e["result"] == "fail"]),
            "total_tajweed_exams": len(tajweed_exams),
            "passed_tajweed": len([e for e in tajweed_exams if e["result"] == "pass"]),
            "failed_tajweed": len([e for e in tajweed_exams if e["result"] == "fail"])
        }
    }

@api_router.put("/admin-exams/{exam_id}")
async def update_admin_exam(exam_id: str, data: AdminExamCreate, current_user: dict = Depends(get_current_user)):
    """Update an exam"""
    if current_user["role"] not in ["admin", "sheikh"]:
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    update_data = {
        "error_count": data.error_count,
        "warning_count": data.warning_count,
        "tajweed_errors": data.tajweed_errors,
        "pronunciation_errors": data.pronunciation_errors,
        "memorization_errors": data.memorization_errors,
        "result": data.result,
        "grade": data.grade,
        "notes": data.notes
    }
    
    result = await db.admin_exams.update_one({"id": exam_id}, {"$set": update_data})
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="الامتحان غير موجود")
    
    return {"message": "تم تحديث الامتحان بنجاح"}

@api_router.delete("/admin-exams/{exam_id}")
async def delete_admin_exam(exam_id: str, current_user: dict = Depends(get_current_user)):
    """Delete an exam"""
    if current_user["role"] not in ["admin", "sheikh"]:
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    result = await db.admin_exams.delete_one({"id": exam_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="الامتحان غير موجود")
    
    return {"message": "تم حذف الامتحان بنجاح"}

# ============== TAJWEED EXAMS ==============

@api_router.post("/tajweed-exams")
async def create_tajweed_exam(data: TajweedExamCreate, current_user: dict = Depends(get_current_user)):
    """Create a tajweed exam"""
    if current_user["role"] not in ["admin", "sheikh"]:
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    # Calculate final score
    final_score = (data.practical_score + data.theoretical_score) // 2
    
    exam = TajweedExam(
        student_id=data.student_id,
        topic=data.topic,
        questions_count=data.questions_count,
        correct_answers=data.correct_answers,
        practical_score=data.practical_score,
        theoretical_score=data.theoretical_score,
        final_score=final_score,
        result=data.result,
        notes=data.notes,
        examiner_id=current_user["user_id"],
        exam_date=datetime.now(timezone.utc).strftime("%Y-%m-%d")
    )
    
    exam_dict = exam.model_dump()
    exam_dict["created_at"] = exam_dict["created_at"].isoformat()
    
    await db.tajweed_exams.insert_one(exam_dict)
    
    # Notify
    result_text = "ناجح ✅" if data.result == "pass" else "راسب ❌"
    await create_notification_internal(
        data.student_id,
        "نتيجة امتحان التجويد",
        f"موضوع: {data.topic} - النتيجة: {result_text} - الدرجة: {final_score}%",
        "success" if data.result == "pass" else "warning"
    )
    
    return {"message": "تم إضافة امتحان التجويد بنجاح", "exam_id": exam.id}

@api_router.get("/tajweed-exams")
async def get_tajweed_exams(student_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    """Get tajweed exams"""
    query = {}
    
    if current_user["role"] == "student":
        query["student_id"] = current_user["user_id"]
    elif student_id:
        query["student_id"] = student_id
    
    exams = await db.tajweed_exams.find(query, {"_id": 0}).sort("created_at", -1).to_list(200)
    
    for exam in exams:
        student = await db.users.find_one({"id": exam["student_id"]}, {"_id": 0, "name": 1})
        exam["student_name"] = student["name"] if student else "غير معروف"
    
    return exams

@api_router.delete("/tajweed-exams/{exam_id}")
async def delete_tajweed_exam(exam_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a tajweed exam"""
    if current_user["role"] not in ["admin", "sheikh"]:
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    result = await db.tajweed_exams.delete_one({"id": exam_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="الامتحان غير موجود")
    
    return {"message": "تم حذف الامتحان بنجاح"}

# ============== ONLINE EXAMS (امتحانات إلكترونية) ==============

@api_router.post("/online-exams")
async def create_online_exam(data: OnlineExamCreate, current_user: dict = Depends(get_current_user)):
    """إنشاء امتحان إلكتروني جديد (للمعلم/المدير)"""
    if current_user["role"] not in ["admin", "sheikh"]:
        raise HTTPException(status_code=403, detail="غير مصرح لك بإنشاء امتحانات")
    
    if len(data.questions) == 0:
        raise HTTPException(status_code=400, detail="يجب إضافة سؤال واحد على الأقل")
    
    # حساب إجمالي النقاط
    total_points = sum(q.points for q in data.questions)
    
    # إنشاء نسخة من الأسئلة بدون الإجابات الصحيحة (للطلاب)
    questions_for_students = [
        {
            "id": q.id,
            "question_text": q.question_text,
            "options": q.options,
            "points": q.points
        }
        for q in data.questions
    ]
    
    # إنشاء نسخة كاملة من الأسئلة (للمعلمين)
    questions_with_answers = [q.model_dump() for q in data.questions]
    
    exam = OnlineExam(
        title=data.title,
        description=data.description,
        category=data.category,
        target_groups=data.target_groups,
        questions=questions_for_students,
        questions_with_answers=questions_with_answers,
        duration_minutes=data.duration_minutes,
        passing_score=data.passing_score,
        start_date=data.start_date,
        end_date=data.end_date,
        is_active=data.is_active,
        total_points=total_points,
        created_by=current_user["user_id"]
    )
    
    exam_dict = exam.model_dump()
    exam_dict["created_at"] = exam_dict["created_at"].isoformat()
    
    await db.online_exams.insert_one(exam_dict)
    
    return {
        "message": "تم إنشاء الامتحان بنجاح",
        "exam_id": exam.id,
        "total_questions": len(data.questions),
        "total_points": total_points
    }

@api_router.get("/online-exams")
async def get_online_exams(current_user: dict = Depends(get_current_user)):
    """الحصول على قائمة الامتحانات الإلكترونية"""
    query = {}
    
    if current_user["role"] == "student":
        # للطلاب: الامتحانات الفعالة فقط
        query["is_active"] = True
        # يمكن تصفية حسب المجموعة لاحقاً
    
    exams = await db.online_exams.find(query, {"_id": 0, "questions_with_answers": 0}).sort("created_at", -1).to_list(100)
    
    # إضافة معلومات إضافية
    for exam in exams:
        # الحصول على اسم المنشئ
        creator = await db.users.find_one({"id": exam.get("created_by")}, {"_id": 0, "name": 1})
        exam["creator_name"] = creator["name"] if creator else "غير معروف"
        
        # التحقق إذا كان الطالب قد أكمل الامتحان
        if current_user["role"] == "student":
            submission = await db.exam_submissions.find_one({
                "exam_id": exam["id"],
                "student_id": current_user["user_id"]
            }, {"_id": 0})
            exam["completed"] = submission is not None
            exam["my_score"] = submission.get("score") if submission else None
            exam["passed"] = submission.get("passed") if submission else None
    
    return exams

@api_router.get("/online-exams/{exam_id}")
async def get_online_exam(exam_id: str, current_user: dict = Depends(get_current_user)):
    """الحصول على تفاصيل امتحان معين"""
    exam = await db.online_exams.find_one({"id": exam_id}, {"_id": 0})
    
    if not exam:
        raise HTTPException(status_code=404, detail="الامتحان غير موجود")
    
    # للطلاب: إخفاء الإجابات الصحيحة
    if current_user["role"] == "student":
        exam.pop("questions_with_answers", None)
        
        # التحقق إذا كان قد أكمل الامتحان
        submission = await db.exam_submissions.find_one({
            "exam_id": exam_id,
            "student_id": current_user["user_id"]
        }, {"_id": 0})
        
        if submission:
            exam["already_submitted"] = True
            exam["my_submission"] = submission
    else:
        # للمعلمين: إظهار الإجابات الصحيحة
        exam["questions"] = exam.get("questions_with_answers", exam.get("questions"))
    
    return exam

@api_router.post("/online-exams/{exam_id}/submit")
async def submit_online_exam(exam_id: str, data: ExamSubmissionCreate, current_user: dict = Depends(get_current_user)):
    """تقديم إجابات الامتحان (للطالب)"""
    if current_user["role"] != "student":
        raise HTTPException(status_code=403, detail="فقط الطلاب يمكنهم تقديم الامتحانات")
    
    # التحقق من وجود الامتحان
    exam = await db.online_exams.find_one({"id": exam_id}, {"_id": 0})
    if not exam:
        raise HTTPException(status_code=404, detail="الامتحان غير موجود")
    
    # التحقق من عدم تقديم الامتحان سابقاً
    existing = await db.exam_submissions.find_one({
        "exam_id": exam_id,
        "student_id": current_user["user_id"]
    })
    if existing:
        raise HTTPException(status_code=400, detail="لقد قدمت هذا الامتحان سابقاً")
    
    # حساب النتيجة
    questions = exam.get("questions_with_answers", [])
    correct_count = 0
    points_earned = 0
    total_questions = len(questions)
    
    for i, q in enumerate(questions):
        if i < len(data.answers):
            if data.answers[i] == q.get("correct_answer"):
                correct_count += 1
                points_earned += q.get("points", 1)
    
    # حساب النسبة المئوية
    total_points = exam.get("total_points", total_questions)
    score = int((points_earned / total_points) * 100) if total_points > 0 else 0
    passed = score >= exam.get("passing_score", 60)
    
    # إنشاء سجل التقديم
    submission = ExamSubmission(
        exam_id=exam_id,
        student_id=current_user["user_id"],
        answers=data.answers,
        correct_count=correct_count,
        total_questions=total_questions,
        score=score,
        points_earned=points_earned,
        passed=passed
    )
    
    submission_dict = submission.model_dump()
    submission_dict["submitted_at"] = submission_dict["submitted_at"].isoformat()
    
    await db.exam_submissions.insert_one(submission_dict)
    
    # منح نقاط للطالب
    await add_points(
        current_user["user_id"],
        points_earned,
        "online_exam",
        f"امتحان: {exam.get('title')} - الدرجة: {score}%"
    )
    
    # إرسال إشعار
    result_text = "ناجح ✅" if passed else "راسب ❌"
    await create_notification_internal(
        current_user["user_id"],
        f"نتيجة الامتحان: {exam.get('title')}",
        f"النتيجة: {result_text} - الدرجة: {score}% - الإجابات الصحيحة: {correct_count}/{total_questions}",
        "success" if passed else "warning"
    )
    
    return {
        "message": "تم تقديم الامتحان بنجاح",
        "score": score,
        "correct_count": correct_count,
        "total_questions": total_questions,
        "points_earned": points_earned,
        "passed": passed,
        "passing_score": exam.get("passing_score", 60)
    }

@api_router.get("/online-exams/{exam_id}/results")
async def get_exam_results(exam_id: str, current_user: dict = Depends(get_current_user)):
    """الحصول على نتائج الامتحان (للمعلم/المدير)"""
    if current_user["role"] not in ["admin", "sheikh"]:
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    # التحقق من وجود الامتحان
    exam = await db.online_exams.find_one({"id": exam_id}, {"_id": 0})
    if not exam:
        raise HTTPException(status_code=404, detail="الامتحان غير موجود")
    
    # الحصول على جميع التقديمات
    submissions = await db.exam_submissions.find({"exam_id": exam_id}, {"_id": 0}).to_list(1000)
    
    # إضافة أسماء الطلاب
    for sub in submissions:
        student = await db.users.find_one({"id": sub["student_id"]}, {"_id": 0, "name": 1})
        sub["student_name"] = student["name"] if student else "غير معروف"
    
    # حساب الإحصائيات
    total_submissions = len(submissions)
    passed_count = sum(1 for s in submissions if s.get("passed"))
    avg_score = sum(s.get("score", 0) for s in submissions) / max(total_submissions, 1)
    
    return {
        "exam": {
            "id": exam["id"],
            "title": exam.get("title"),
            "total_questions": len(exam.get("questions", [])),
            "passing_score": exam.get("passing_score", 60)
        },
        "statistics": {
            "total_submissions": total_submissions,
            "passed_count": passed_count,
            "failed_count": total_submissions - passed_count,
            "pass_rate": int((passed_count / max(total_submissions, 1)) * 100),
            "average_score": round(avg_score, 1)
        },
        "submissions": sorted(submissions, key=lambda x: x.get("score", 0), reverse=True)
    }

@api_router.delete("/online-exams/{exam_id}")
async def delete_online_exam(exam_id: str, current_user: dict = Depends(get_current_user)):
    """حذف امتحان إلكتروني"""
    if current_user["role"] not in ["admin", "sheikh"]:
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    result = await db.online_exams.delete_one({"id": exam_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="الامتحان غير موجود")
    
    # حذف جميع التقديمات المرتبطة
    await db.exam_submissions.delete_many({"exam_id": exam_id})
    
    return {"message": "تم حذف الامتحان بنجاح"}

@api_router.put("/online-exams/{exam_id}/toggle-active")
async def toggle_exam_active(exam_id: str, current_user: dict = Depends(get_current_user)):
    """تفعيل/إلغاء تفعيل امتحان"""
    if current_user["role"] not in ["admin", "sheikh"]:
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    exam = await db.online_exams.find_one({"id": exam_id})
    if not exam:
        raise HTTPException(status_code=404, detail="الامتحان غير موجود")
    
    new_status = not exam.get("is_active", True)
    await db.online_exams.update_one({"id": exam_id}, {"$set": {"is_active": new_status}})
    
    return {"message": f"تم {'تفعيل' if new_status else 'إلغاء تفعيل'} الامتحان", "is_active": new_status}

@api_router.post("/curriculum/{curriculum_id}/upload-pdf")
async def upload_curriculum_pdf(curriculum_id: str, file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    """Upload PDF file for curriculum (Admin only)"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="فقط المدير يمكنه رفع الملفات")
    
    # Verify curriculum exists
    curriculum = await db.curriculum.find_one({"id": curriculum_id})
    if not curriculum:
        raise HTTPException(status_code=404, detail="المنهج غير موجود")
    
    # Validate file type
    if not file.filename.endswith('.pdf'):
        raise HTTPException(status_code=400, detail="يجب أن يكون الملف بصيغة PDF")
    
    # Read and encode file
    content = await file.read()
    encoded = base64.b64encode(content).decode('utf-8')
    
    # Update curriculum with PDF data
    await db.curriculum.update_one(
        {"id": curriculum_id},
        {"$set": {
            "pdf_url": f"data:application/pdf;base64,{encoded}",
            "pdf_filename": file.filename,
            "type": "pdf",
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return {"message": "تم رفع الملف بنجاح", "filename": file.filename}

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
