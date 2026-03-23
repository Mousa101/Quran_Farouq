from fastapi import FastAPI, APIRouter, HTTPException, Depends, status
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import uuid
import io
from pathlib import Path
from typing import List, Optional
from datetime import datetime, timezone, timedelta
import xlsxwriter

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
    InitialAssessment, StudentSelfUpdate, SheikhUpdateStudent,
    StudentRegistrationRequest, ActivationRequest,
    CurriculumCreate, Curriculum, CurriculumEntryCreate, CurriculumEntry,
    ScheduleCreate, Schedule, ScheduleSlotCreate, ScheduleSlot,
    FeeCreate, Fee,
    HomeworkCreate, Homework, HomeworkSubmission,
    AdminExamCreate, AdminExam,
    TajweedExamCreate, TajweedExam,
    WEEKLY_BADGES, WeeklyBadge, BadgeTypeCreate, BadgeAssign, BadgeRemove,
    OnlineExamCreate, OnlineExam, ExamSubmissionCreate, ExamSubmission, ExamQuestion,
    Term, TermArchive, AuditLog,
    calculate_pages_from_juz, PAGES_PER_JUZ, TOTAL_QURAN_PAGES
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

# Health endpoint for Kubernetes health checks (must be at root level)
@app.get("/health")
async def health_check():
    return {"status": "healthy"}

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Health endpoint on API router
@api_router.get("/health")
async def api_health_check():
    return {"status": "healthy"}

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ============== HELPER FUNCTIONS ==============

async def get_active_term_id() -> Optional[str]:
    """الحصول على معرف الفصل النشط"""
    term = await db.terms.find_one({"is_active": True}, {"id": 1})
    return term["id"] if term else None

async def create_audit_log(actor_id: str, actor_role: str, target_student_id: str, 
                          field_changed: str, old_value: str, new_value: str):
    """إنشاء سجل تدقيق للتغييرات"""
    log = AuditLog(
        actor_id=actor_id,
        actor_role=actor_role,
        target_student_id=target_student_id,
        field_changed=field_changed,
        old_value=old_value,
        new_value=new_value
    )
    log_dict = log.model_dump()
    log_dict["timestamp"] = log_dict["timestamp"].isoformat()
    await db.audit_logs.insert_one(log_dict)

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
    valid_levels = ["تلاوة عامة", "تمهيدية", "متوسطة", "متقدمة", "إجازة", "اتقان", "سند غيبي", "روايات أخرى"]
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
    
    # Calculate percentage of Quran (600 pages total = 30 juz * 20 pages)
    progress_percentage = round((total_pages / TOTAL_QURAN_PAGES) * 100, 1)
    
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
    - أذكار بعد الصلاة: 7 نقاط
    - الجلوس مع القرآن: 7 نقاط
    - صلاة الضحى: 7 نقاط
    - التسميع للأهل: 7 نقاط
    - ساعات الدراسة: 7 نقاط
    - الوتر: 7 نقاط
    - السنن: 7 نقاط
    - قيام الليل: 8 نقاط (إذا قام ليلة واحدة = 8 نقاط كاملة)
    - الصيام: 8 نقاط (إذا صام يوم واحد = 8 نقاط كاملة)
    المجموع: 35+7+7+7+7+7+7+7+8+8 = 100 نقطة
    """
    prayers = min(data.get("prayers_count", 0), 35)  # Max 35
    adhkar = min(data.get("adhkar_after_prayer", 0), 7)  # Max 7
    quran = min(data.get("quran_sitting_days", 0), 7)  # Max 7
    duha = min(data.get("duha_prayers", 0), 7)  # Max 7
    family = min(data.get("family_recitation", 0), 7)  # Max 7
    study = min(data.get("study_hours", 0), 7)  # Max 7
    witr = min(data.get("witr_prayers_days", 0), 7)  # Max 7
    sunnah = min(data.get("sunnah_prayers", 0), 7)  # Max 7
    # قيام الليل: إذا قام ليلة واحدة = 8 نقاط كاملة
    night = 8 if data.get("night_prayer", 0) >= 1 else 0
    # الصيام: إذا صام يوم واحد = 8 نقاط كاملة
    fasting = 8 if data.get("fasting", 0) >= 1 else 0
    
    total = min(prayers + adhkar + quran + duha + family + study + witr + sunnah + night + fasting, 100)
    
    return {
        "prayers_points": prayers,
        "adhkar_points": adhkar,
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
    
    # Calculate points - تضمين جميع الحقول بما فيها صلاة الضحى
    points_breakdown = calculate_tracking_points({
        "prayers_count": data.prayers_count,
        "adhkar_after_prayer": data.adhkar_after_prayer,
        "quran_sitting_days": data.quran_sitting_days,
        "duha_prayers": data.duha_prayers,  # تم إضافة صلاة الضحى
        "family_recitation": data.family_recitation,
        "study_hours": data.study_hours,
        "witr_prayers_days": data.witr_prayers_days,
        "sunnah_prayers": data.sunnah_prayers,
        "night_prayer": data.night_prayer,
        "fasting": data.fasting
    })
    
    sheet_data = TrackingSheetData(
        prayers_count=min(data.prayers_count, 35),
        adhkar_after_prayer=min(data.adhkar_after_prayer, 7),
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
    adhkar_after_prayer: int = 0  # أذكار بعد الصلاة (0-7)
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
    
    # التحقق من وقت التسليم
    submission_settings = await db.settings.find_one({"key": "tracking_submission"}, {"_id": 0})
    is_within_submission_window = True
    submission_message = ""
    
    if submission_settings and submission_settings.get("submission_enabled", False):
        # الأيام
        day_numbers = {
            "saturday": 5, "sunday": 6, "monday": 0,
            "tuesday": 1, "wednesday": 2, "thursday": 3, "friday": 4
        }
        
        now = datetime.now(timezone.utc)
        current_day = now.weekday()
        current_time = now.hour * 60 + now.minute
        
        start_day = day_numbers.get(submission_settings.get("submission_start_day", "friday"), 4)
        end_day = day_numbers.get(submission_settings.get("submission_end_day", "saturday"), 5)
        
        start_time_str = submission_settings.get("submission_start_time", "21:00")
        end_time_str = submission_settings.get("submission_end_time", "08:50")
        
        start_parts = start_time_str.split(":")
        start_time = int(start_parts[0]) * 60 + int(start_parts[1])
        
        end_parts = end_time_str.split(":")
        end_time = int(end_parts[0]) * 60 + int(end_parts[1])
        
        is_within_submission_window = False
        
        if start_day == end_day:
            is_within_submission_window = current_day == start_day and start_time <= current_time <= end_time
        elif start_day < end_day:
            if current_day == start_day and current_time >= start_time:
                is_within_submission_window = True
            elif current_day == end_day and current_time <= end_time:
                is_within_submission_window = True
            elif start_day < current_day < end_day:
                is_within_submission_window = True
        else:
            if current_day == start_day and current_time >= start_time:
                is_within_submission_window = True
            elif current_day == end_day and current_time <= end_time:
                is_within_submission_window = True
            elif current_day > start_day or current_day < end_day:
                is_within_submission_window = True
        
        if not is_within_submission_window:
            submission_message = "تم حفظ الورقة بدون نقاط (خارج وقت التسليم)"
    
    # الحصول على بداية الأسبوع الحالي (السبت)
    current_week_start = get_current_week_start()
    
    # السماح بتعبئة ورقة الأسبوع الحالي أو استخدام التاريخ المرسل مع التحقق من صحته
    week_start_to_use = data.week_start if data.week_start else current_week_start
    
    # التحقق من أن التاريخ المرسل صحيح (يجب أن يكون يوم سبت)
    try:
        from datetime import datetime as dt
        date_obj = dt.strptime(week_start_to_use, '%Y-%m-%d')
        # السبت = 5 في Python
        if date_obj.weekday() != 5:
            # إذا لم يكن سبت، استخدم السبت الحالي
            week_start_to_use = current_week_start
    except:
        week_start_to_use = current_week_start
    
    # التحقق من عدم وجود ورقة سابقة لنفس الأسبوع (مرة واحدة فقط)
    existing = await db.tracking_sheets.find_one({
        "student_id": current_user["user_id"],
        "week_start": week_start_to_use
    })
    
    # حساب النقاط - صفر إذا كان خارج وقت التسليم
    points_breakdown = calculate_tracking_points({
        "prayers_count": data.prayers_count,
        "adhkar_after_prayer": data.adhkar_after_prayer,
        "quran_sitting_days": data.quran_sitting_days,
        "duha_prayers": data.duha_prayers,
        "family_recitation": data.family_recitation,
        "study_hours": data.study_hours,
        "witr_prayers_days": data.witr_prayers_days,
        "sunnah_prayers": data.sunnah_prayers,
        "night_prayer": data.night_prayer,
        "fasting": data.fasting
    })
    
    # إذا كان خارج وقت التسليم، لا تُمنح نقاط
    actual_points = points_breakdown["total_points"] if is_within_submission_window else 0
    
    sheet_data_dict = {
        "prayers_count": min(data.prayers_count, 35),
        "adhkar_after_prayer": min(data.adhkar_after_prayer, 7),
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
                "points_earned": actual_points,
                "submitted_by_student": True,
                "submitted_outside_window": not is_within_submission_window
            }}
        )
        
        # فحص ومنح شارة العابد (فقط إذا كان في وقت التسليم)
        if is_within_submission_window:
            await check_worshipper_badge(current_user["user_id"], actual_points)
        
        return {
            "message": submission_message if submission_message else "تم تحديث ورقة المتابعة بنجاح",
            "points_earned": actual_points,
            "week_start": week_start_to_use,
            "submitted_outside_window": not is_within_submission_window
        }
    
    # إنشاء ورقة جديدة
    sheet_data = TrackingSheetData(
        prayers_count=min(data.prayers_count, 35),
        adhkar_after_prayer=min(data.adhkar_after_prayer, 7),
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
        week_start=week_start_to_use,
        data=sheet_data,
        points_earned=actual_points
    )
    
    sheet_dict = sheet.model_dump()
    sheet_dict["created_at"] = sheet_dict["created_at"].isoformat()
    sheet_dict["submitted_by_student"] = True
    sheet_dict["submitted_outside_window"] = not is_within_submission_window
    
    await db.tracking_sheets.insert_one(sheet_dict)
    
    # منح النقاط فقط إذا كان في وقت التسليم (مع الحد الأقصى 1000)
    points_to_add = 0
    if is_within_submission_window and actual_points > 0:
        student_points = await db.student_points.find_one({"student_id": current_user["user_id"]})
        current_total = student_points.get("total_points", 0) if student_points else 0
        points_to_add = min(actual_points, 1000 - current_total)
        
        if points_to_add > 0:
            await add_points(
                current_user["user_id"],
                points_to_add,
                "tracking",
                f"ورقة متابعة أسبوع {week_start_to_use}"
            )
        
        # فحص ومنح شارة العابد
        await check_worshipper_badge(current_user["user_id"], actual_points)
    
    return {
        "message": submission_message if submission_message else "تم حفظ ورقة المتابعة بنجاح",
        "sheet_id": sheet.id,
        "points_earned": points_to_add,
        "week_start": week_start_to_use,
        "submitted_outside_window": not is_within_submission_window
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

class TrackingSheetUpdate(BaseModel):
    """تعديل ورقة المتابعة من المعلم"""
    prayers_count: Optional[int] = None
    adhkar_after_prayer: Optional[int] = None
    quran_sitting_days: Optional[int] = None
    duha_prayers: Optional[int] = None
    family_recitation: Optional[int] = None
    study_hours: Optional[int] = None
    witr_prayers_days: Optional[int] = None
    sunnah_prayers: Optional[int] = None
    night_prayer: Optional[int] = None
    fasting: Optional[int] = None
    notes: Optional[str] = None

@api_router.put("/tracking-sheets/{sheet_id}")
async def update_tracking_sheet(sheet_id: str, data: TrackingSheetUpdate, current_user: dict = Depends(get_current_user)):
    """تعديل ورقة متابعة (للشيخ فقط)"""
    if current_user["role"] != "sheikh":
        raise HTTPException(status_code=403, detail="فقط الشيخ يمكنه تعديل ورقة المتابعة")
    
    # Get existing sheet
    sheet = await db.tracking_sheets.find_one({"id": sheet_id})
    if not sheet:
        raise HTTPException(status_code=404, detail="ورقة المتابعة غير موجودة")
    
    # Verify sheikh owns this sheet
    if sheet.get("sheikh_id") and sheet.get("sheikh_id") != current_user["user_id"]:
        raise HTTPException(status_code=403, detail="لا يمكنك تعديل ورقة متابعة لشيخ آخر")
    
    # Get old points
    old_points = sheet.get("points_earned", 0)
    
    # Build update data
    sheet_data = sheet.get("data", {})
    
    if data.prayers_count is not None:
        sheet_data["prayers_count"] = min(data.prayers_count, 35)
    if data.adhkar_after_prayer is not None:
        sheet_data["adhkar_after_prayer"] = min(data.adhkar_after_prayer, 7)
    if data.quran_sitting_days is not None:
        sheet_data["quran_sitting_days"] = min(data.quran_sitting_days, 7)
    if data.duha_prayers is not None:
        sheet_data["duha_prayers"] = min(data.duha_prayers, 7)
    if data.family_recitation is not None:
        sheet_data["family_recitation"] = min(data.family_recitation, 7)
    if data.study_hours is not None:
        sheet_data["study_hours"] = min(data.study_hours, 7)
    if data.witr_prayers_days is not None:
        sheet_data["witr_prayers_days"] = min(data.witr_prayers_days, 7)
    if data.sunnah_prayers is not None:
        sheet_data["sunnah_prayers"] = min(data.sunnah_prayers, 7)
    if data.night_prayer is not None:
        sheet_data["night_prayer"] = min(data.night_prayer, 1)
    if data.fasting is not None:
        sheet_data["fasting"] = min(data.fasting, 1)
    if data.notes is not None:
        sheet_data["notes"] = data.notes
    
    # Calculate new points
    points_breakdown = calculate_tracking_points(sheet_data)
    new_points = points_breakdown["total_points"]
    
    # Update sheet
    await db.tracking_sheets.update_one(
        {"id": sheet_id},
        {"$set": {
            "data": sheet_data,
            "points_earned": new_points,
            "sheikh_id": current_user["user_id"]  # Update sheikh_id if empty
        }}
    )
    
    # Adjust student points
    points_diff = new_points - old_points
    if points_diff != 0:
        student_id = sheet.get("student_id")
        if student_id:
            student_points = await db.student_points.find_one({"student_id": student_id})
            current_total = student_points.get("total_points", 0) if student_points else 0
            new_total = max(0, min(1000, current_total + points_diff))  # Ensure between 0 and 1000
            
            await db.student_points.update_one(
                {"student_id": student_id},
                {"$set": {"total_points": new_total}},
                upsert=True
            )
    
    return {
        "message": "تم تحديث ورقة المتابعة بنجاح",
        "old_points": old_points,
        "new_points": new_points,
        "points_diff": points_diff
    }

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
        "sunnah_prayers": 0,
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
            "sunnah_prayers": data.get("sunnah_prayers", 0),
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
        "sunnah_prayers": sum(s["data"].get("sunnah_prayers", 0) for s in semester_sheets if s.get("data")),
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
        "max_weekly_points": 100,  # الحد الأقصى للنقاط الأسبوعية
        "categories": {
            "prayers": {"max_weekly": 35, "label": "الصلوات"},
            "quran_sitting": {"max_weekly": 7, "label": "الجلوس مع القرآن"},
            "duha_prayers": {"max_weekly": 7, "label": "صلاة الضحى"},
            "family_recitation": {"max_weekly": 7, "label": "التسميع للأهل"},
            "study_hours": {"max_weekly": 7, "label": "ساعات الدراسة"},
            "witr": {"max_weekly": 7, "label": "الوتر"},
            "sunnah_prayers": {"max_weekly": 7, "label": "السنن"},
            "night_prayer": {"max_weekly": 1, "label": "قيام الليل"},
            "fasting": {"max_weekly": 1, "label": "الصيام"}
        }
    }

# ============== RECITATION ROUTES ==============

@api_router.post("/recitations")
async def create_recitation(recitation_data: RecitationCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "sheikh":
        raise HTTPException(status_code=403, detail="فقط الشيخ يمكنه تسجيل التسميع")
    
    # الحصول على الفصل النشط
    active_term_id = await get_active_term_id()
    
    # تحديد التاريخ - إذا لم يُحدد يستخدم التاريخ الحالي
    if recitation_data.date:
        try:
            # تحويل التاريخ المحدد إلى datetime
            recitation_date = datetime.strptime(recitation_data.date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
            record_date = recitation_data.date
        except ValueError:
            recitation_date = datetime.now(timezone.utc)
            record_date = recitation_date.strftime("%Y-%m-%d")
    else:
        recitation_date = datetime.now(timezone.utc)
        record_date = recitation_date.strftime("%Y-%m-%d")
    
    # حساب عدد صفحات الحفظ الجديد
    new_pages = 0
    if recitation_data.page_from is not None and recitation_data.page_to is not None:
        new_pages = max(0, recitation_data.page_to - recitation_data.page_from + 1)
    elif recitation_data.new_pages:
        new_pages = recitation_data.new_pages
    elif recitation_data.pages_count:
        new_pages = recitation_data.pages_count
    
    # حساب عدد صفحات المراجعة
    review_pages = recitation_data.review_pages or 0
    if recitation_data.review_juz and len(recitation_data.review_juz) > 0:
        review_pages += len(recitation_data.review_juz) * PAGES_PER_JUZ
    if recitation_data.partial_review_pages:
        review_pages += recitation_data.partial_review_pages
    
    # إذا لم يسمع - لا يُسجل التسميع ولا نقاط
    if recitation_data.did_not_recite:
        recitation = Recitation(
            student_id=recitation_data.student_id,
            sheikh_id=current_user["user_id"],
            term_id=active_term_id,
            recitation_type="did_not_recite",
            record_date=record_date,
            new_pages=0,
            review_pages=0,
            did_not_recite=True,
            passed_minimum=False,
            passed_review_minimum=False,
            notes=recitation_data.notes or "لم يسمع",
            points_earned=0
        )
        
        recitation_dict = recitation.model_dump()
        recitation_dict["created_at"] = recitation_date.isoformat()
        await db.recitations.insert_one(recitation_dict)
        
        return {"message": "تم تسجيل عدم التسميع", "recitation_id": recitation.id, "points_earned": 0}
    
    # النقاط فقط إذا اجتاز الحد الأدنى - 20 نقطة
    passed = recitation_data.passed_minimum or recitation_data.passed_review_minimum
    points = 20 if passed else 0
    
    description_parts = []
    
    # تحقق إذا كان حفظ جديد (سواء combined أو new_memorization)
    has_new = recitation_data.recitation_type in ["new_memorization", "combined"] and recitation_data.has_new_memorization
    # تحقق إذا كان مراجعة (سواء combined أو review)
    has_review = recitation_data.recitation_type in ["review", "combined"] and recitation_data.has_review
    
    # للتوافق مع النظام القديم
    if recitation_data.recitation_type == "new_memorization" and not hasattr(recitation_data, 'has_new_memorization'):
        has_new = True
    if recitation_data.recitation_type == "review" and not hasattr(recitation_data, 'has_review'):
        has_review = True
    
    if has_new or recitation_data.recitation_type == "new_memorization":
        # Build description - بدون التقييم
        juz_text = f"الجزء {recitation_data.juz_number}" if recitation_data.juz_number else ""
        page_range = f"من صفحة {recitation_data.page_from} إلى {recitation_data.page_to}" if recitation_data.page_from and recitation_data.page_to else f"{new_pages} صفحة"
        error_text = f"- الأخطاء: {recitation_data.error_count}" if recitation_data.error_count else ""
        pass_text = "✓ اجتاز" if recitation_data.passed_minimum else "✗ لم يجتز"
        
        description_parts.append(f"حفظ جديد: {juz_text} {page_range} {error_text} {pass_text}".strip())
    
    if has_review or recitation_data.recitation_type == "review":
        # مراجعة
        review_parts = []
        if recitation_data.review_juz and len(recitation_data.review_juz) > 0:
            juz_list = ", ".join([str(j) for j in sorted(recitation_data.review_juz)])
            review_parts.append(f"الأجزاء {juz_list}")
        
        if recitation_data.partial_review_pages and recitation_data.partial_review_pages > 0:
            partial_juz = recitation_data.partial_review_juz or ""
            if partial_juz:
                review_parts.append(f"{recitation_data.partial_review_pages} صفحات من جزء {partial_juz}")
            else:
                review_parts.append(f"{recitation_data.partial_review_pages} صفحات")
        
        pass_text = "✓ اجتاز" if recitation_data.passed_review_minimum else "✗ لم يجتز"
        if review_parts:
            description_parts.append(f"مراجعة: {' و '.join(review_parts)} {pass_text}")
    
    description = " | ".join(description_parts) if description_parts else "تسميع"
    
    recitation = Recitation(
        student_id=recitation_data.student_id,
        sheikh_id=current_user["user_id"],
        term_id=active_term_id,
        recitation_type=recitation_data.recitation_type,
        record_date=record_date,
        # New fields
        juz_number=recitation_data.juz_number,
        page_from=recitation_data.page_from,
        page_to=recitation_data.page_to,
        new_pages=new_pages,
        review_pages=review_pages,
        error_count=recitation_data.error_count,
        partial_review_juz=recitation_data.partial_review_juz,
        partial_review_pages=recitation_data.partial_review_pages,
        # Existing fields
        passed_minimum=recitation_data.passed_minimum,
        review_juz=recitation_data.review_juz,
        passed_review_minimum=recitation_data.passed_review_minimum,
        has_new_memorization=recitation_data.has_new_memorization,
        has_review=recitation_data.has_review,
        did_not_recite=recitation_data.did_not_recite,
        notes=recitation_data.notes,
        points_earned=points,
        # Legacy
        pages_count=recitation_data.pages_count,
        review_type=recitation_data.review_type
    )
    
    recitation_dict = recitation.model_dump()
    recitation_dict["created_at"] = recitation_date.isoformat()
    
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
    
    return {"message": "تم تسجيل التسميع بنجاح", "recitation_id": recitation.id, "points_earned": points, "new_pages": new_pages, "review_pages": review_pages}

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
    date: Optional[str] = None,
    term_id: Optional[str] = None,
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
    
    # فلترة حسب التاريخ
    if date:
        # البحث عن التسميعات في نفس اليوم
        query["$expr"] = {
            "$eq": [
                {"$substr": ["$created_at", 0, 10]},
                date
            ]
        }
    
    # تصفية حسب الفصل - إذا لم يُحدد، استخدم الفصل النشط
    if term_id:
        query["term_id"] = term_id
    elif not date:  # إذا لم يكن هناك تاريخ محدد
        active_term_id = await get_active_term_id()
        if active_term_id:
            query["$or"] = [
                {"term_id": active_term_id},
                {"term_id": None},
                {"term_id": {"$exists": False}}
            ]
    
    recitations = await db.recitations.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
    return recitations

# حذف تسميع (للمعلم)
@api_router.delete("/recitations/{recitation_id}")
async def delete_recitation(recitation_id: str, current_user: dict = Depends(get_current_user)):
    """حذف تسميع - للمعلم فقط"""
    if current_user["role"] not in ["sheikh", "admin"]:
        raise HTTPException(status_code=403, detail="غير مصرح لك بحذف التسميع")
    
    # البحث عن التسميع
    recitation = await db.recitations.find_one({"id": recitation_id})
    if not recitation:
        raise HTTPException(status_code=404, detail="التسميع غير موجود")
    
    # التحقق من أن المعلم هو من سجل التسميع
    if current_user["role"] == "sheikh" and recitation.get("sheikh_id") != current_user["user_id"]:
        raise HTTPException(status_code=403, detail="لا يمكنك حذف تسميع سجله معلم آخر")
    
    # خصم النقاط من الطالب
    points_earned = recitation.get("points_earned", 0)
    if points_earned > 0:
        student_id = recitation.get("student_id")
        await db.student_points.update_one(
            {"student_id": student_id},
            {"$inc": {"total_points": -points_earned, "recitation_points": -points_earned}}
        )
    
    # حذف التسميع
    await db.recitations.delete_one({"id": recitation_id})
    
    return {"message": "تم حذف التسميع بنجاح", "points_deducted": points_earned}

# Get Quran Juz list
@api_router.get("/quran/juz")
async def get_quran_juz(current_user: dict = Depends(get_current_user)):
    return [{"number": i+1, "name": QURAN_JUZ[i]} for i in range(30)]

# ============== ATTENDANCE ROUTES ==============

@api_router.post("/attendance")
async def mark_attendance(attendance_data: AttendanceCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "sheikh":
        raise HTTPException(status_code=403, detail="فقط الشيخ يمكنه تسجيل الحضور")
    
    # الحصول على الفصل النشط
    active_term_id = await get_active_term_id()
    
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
        term_id=active_term_id,
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
    term_id: Optional[str] = None,
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
    
    # تصفية حسب الفصل - إذا لم يُحدد، استخدم الفصل النشط
    if term_id:
        query["term_id"] = term_id
    else:
        active_term_id = await get_active_term_id()
        if active_term_id:
            # عرض سجلات الفصل النشط فقط أو السجلات القديمة (بدون term_id)
            query["$or"] = [
                {"term_id": active_term_id},
                {"term_id": None},
                {"term_id": {"$exists": False}}
            ]
    
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

@api_router.get("/rankings/group")
async def get_group_rankings(
    current_user: dict = Depends(get_current_user)
):
    """Get rankings for current student within their group only"""
    if current_user["role"] != "student":
        raise HTTPException(status_code=403, detail="هذا الترتيب للطلاب فقط")
    
    # Get current student's group
    student = await db.users.find_one({"id": current_user["user_id"]}, {"_id": 0})
    if not student or not student.get("group_id"):
        return {"scores": [], "my_rank": None, "total_in_group": 0}
    
    group_id = student["group_id"]
    
    # Get all students in the same group
    group_students = await db.users.find(
        {"role": "student", "group_id": group_id},
        {"_id": 0}
    ).to_list(1000)
    
    scores = []
    for s in group_students:
        # Get student points
        points_record = await db.student_points.find_one({"student_id": s["id"]}, {"_id": 0})
        total_points = points_record.get("total_points", 0) if points_record else 0
        
        # Get attendance
        attendance = await db.attendance.find({"student_id": s["id"]}, {"_id": 0}).to_list(1000)
        present_count = sum(1 for a in attendance if a["status"] == "present")
        attendance_rate = (present_count / max(len(attendance), 1)) * 100
        
        # Get recitations count - عدد الأيام التي سمع فيها (يُحسب يوم واحد فقط)
        recitations = await db.recitations.find({"student_id": s["id"]}, {"_id": 0}).to_list(100)
        # حساب عدد الأيام الفريدة التي تم التسميع فيها
        recitation_days = set()
        passed_days = set()
        for r in recitations:
            if not r.get("did_not_recite"):
                # استخراج التاريخ من created_at
                created_at = r.get("created_at", "")
                if created_at:
                    day = created_at[:10] if isinstance(created_at, str) else created_at.strftime("%Y-%m-%d")
                    recitation_days.add(day)
                    if r.get("passed_minimum") or r.get("passed_review_minimum"):
                        passed_days.add(day)
        
        recitation_count = len(recitation_days)  # عدد أيام التسميع
        passed_count = len(passed_days)  # عدد أيام الاجتياز
        
        scores.append({
            "student_id": s["id"],
            "student_name": s["name"],
            "total_points": total_points,
            "attendance_rate": round(attendance_rate, 1),
            "recitation_count": recitation_count
        })
    
    # Sort by total points
    scores.sort(key=lambda x: x["total_points"], reverse=True)
    
    # Assign ranks
    for i, score in enumerate(scores):
        if i == 0:
            score["rank"] = "gold"
        elif i == 1:
            score["rank"] = "silver"
        elif i == 2:
            score["rank"] = "bronze"
        else:
            score["rank"] = "participant"
        score["position"] = i + 1
    
    # Find current student's rank
    my_rank = next((s for s in scores if s["student_id"] == current_user["user_id"]), None)
    
    return {
        "scores": scores,
        "my_rank": my_rank,
        "total_in_group": len(scores),
        "gold": scores[0] if len(scores) > 0 else None,
        "silver": scores[1] if len(scores) > 1 else None,
        "bronze": scores[2] if len(scores) > 2 else None
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
    points_data = await db.student_points.find_one({"student_id": student_id}, {"_id": 0})
    
    # Tracking stats
    total_prayers = sum(t["data"].get("prayers_count", 0) for t in tracking)
    total_quran_time = sum(t["data"].get("quran_sitting_minutes", 0) for t in tracking)
    total_family_recitation = sum(t["data"].get("family_recitation_count", 0) for t in tracking)
    
    # Detailed tracking breakdown
    total_adhkar = sum(t["data"].get("adhkar_after_prayer", 0) for t in tracking)
    total_sunnah = sum(t["data"].get("sunnah_prayers", 0) for t in tracking)
    total_witr = sum(t["data"].get("witr_prayer", 0) for t in tracking)
    total_duha = sum(t["data"].get("duha_prayer", 0) for t in tracking)
    
    # New recitation calculations - حساب على أساس الأيام
    total_new_pages = sum(r.get("pages_count", 0) or 0 for r in recitations if r.get("recitation_type") == "new_memorization")
    total_review_pages = sum(r.get("review_pages", 0) or 0 for r in recitations if r.get("review_type") == "pages")
    total_recitation_points = sum(r.get("points_earned", 0) for r in recitations)
    
    # حساب أيام التسميع الفريدة (يُحسب يوم واحد فقط حتى لو سمع أكثر من مرة)
    recitation_days = set()
    passed_days = set()
    did_not_recite_days = set()
    
    for r in recitations:
        created_at = r.get("created_at", "")
        if created_at:
            day = created_at[:10] if isinstance(created_at, str) else created_at.strftime("%Y-%m-%d")
            
            if r.get("did_not_recite"):
                # يوم "لم يسمّع"
                did_not_recite_days.add(day)
            else:
                # يوم تسميع فعلي
                recitation_days.add(day)
                if r.get("passed_minimum") or r.get("passed_review_minimum"):
                    passed_days.add(day)
    
    # عدد أيام التسميع الفعلي (بدون "لم يسمّع")
    recitation_days_count = len(recitation_days)
    # عدد أيام "لم يسمّع"
    did_not_recite_days_count = len(did_not_recite_days)
    # إجمالي الأيام (للحساب)
    total_days_count = recitation_days_count + did_not_recite_days_count
    # عدد أيام الاجتياز
    passed_days_count = len(passed_days)
    
    # نسبة التسميع = أيام التسميع الفعلي / إجمالي الأيام (تسميع + لم يسمّع)
    recitation_rate = round((recitation_days_count / max(total_days_count, 1)) * 100, 1)
    
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
            "percentage": round((total_memorized / TOTAL_QURAN_PAGES) * 100, 1)
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
            "passed_days": passed_days_count,  # عدد أيام الاجتياز
            "recitation_days": recitation_days_count,  # عدد أيام التسميع الفعلي
            "did_not_recite_days": did_not_recite_days_count,  # عدد أيام "لم يسمّع"
            "total_days": total_days_count,  # إجمالي الأيام
            "total_points": total_recitation_points,
            "recitations_count": len([r for r in recitations if not r.get("did_not_recite")]),  # إجمالي التسميعات
            "did_not_recite_count": len([r for r in recitations if r.get("did_not_recite")]),  # عدد مرات عدم التسميع
            "recitation_rate": recitation_rate  # نسبة التسميع = أيام التسميع / إجمالي الأيام
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
        "total_points": points_data.get("total_points", 0) if points_data else 0
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
    
    # الاسم
    if data.name is not None and data.name.strip():
        update_data["name"] = data.name.strip()
    
    # أرقام الهواتف
    if data.student_phone is not None:
        update_data["student_phone"] = data.student_phone
    if data.father_phone is not None:
        update_data["father_phone"] = data.father_phone
    if data.mother_phone is not None:
        update_data["mother_phone"] = data.mother_phone
    
    # الصورة الشخصية
    if data.profile_image is not None:
        update_data["profile_image"] = data.profile_image
    
    # تاريخ الميلاد
    if data.birth_date is not None:
        update_data["birth_date"] = data.birth_date
    
    # بيانات المدرسة
    if data.school_name is not None:
        update_data["school_name"] = data.school_name
    if data.school_grade is not None:
        update_data["school_grade"] = data.school_grade
    if data.school_average is not None:
        update_data["school_average"] = data.school_average
    
    # المسجد
    if data.mosque_name is not None:
        update_data["mosque_name"] = data.mosque_name
    
    if not update_data:
        raise HTTPException(status_code=400, detail="لم يتم تقديم أي بيانات للتحديث")
    
    try:
        await db.users.update_one({"id": student_id}, {"$set": update_data})
        return {"message": "تم تحديث بياناتك بنجاح", "updated_fields": list(update_data.keys())}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"فشل في تحديث البيانات: {str(e)}")

# نموذج تعديل بيانات الطالب من المعلم
class SheikhUpdateStudent(BaseModel):
    """الحقول المسموح للمعلم بتعديلها"""
    name: Optional[str] = None
    student_phone: Optional[str] = None
    father_phone: Optional[str] = None
    mother_phone: Optional[str] = None
    birth_date: Optional[str] = None
    school_name: Optional[str] = None
    school_grade: Optional[str] = None
    school_average: Optional[str] = None
    mosque_name: Optional[str] = None
    group_id: Optional[str] = None
    tajweed_level: Optional[str] = None

# REMOVED: Duplicate endpoint - using version at line 6052 with audit log and sheikh-only RBAC
# تم نقل هذه الوظيفة إلى endpoint جديد مع سجل التدقيق

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
    """Change student's group (Admin only) - البيانات تنتقل تلقائياً مع الطالب"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="فقط المدير يمكنه نقل الطالب")
    
    # Check if student exists
    student = await db.users.find_one({"id": student_id, "role": "student"})
    if not student:
        raise HTTPException(status_code=404, detail="الطالب غير موجود")
    
    old_group_id = student.get("group_id")
    
    # Check if group exists (if not empty)
    new_sheikh_id = None
    if group_id:
        group = await db.groups.find_one({"id": group_id})
        if not group:
            raise HTTPException(status_code=404, detail="المجموعة غير موجودة")
        new_sheikh_id = group.get("sheikh_id")
    
    # Update student's group
    new_group_id = group_id if group_id else None
    await db.users.update_one({"id": student_id}, {"$set": {"group_id": new_group_id}})
    
    # Update sheikh_id in tracking sheets for new group's sheikh
    if new_sheikh_id:
        await db.tracking_sheets.update_many(
            {"student_id": student_id},
            {"$set": {"sheikh_id": new_sheikh_id}}
        )
        
        # Update recitations sheikh_id
        await db.recitations.update_many(
            {"student_id": student_id},
            {"$set": {"sheikh_id": new_sheikh_id}}
        )
    
    # Create notification for student
    await create_notification_internal(
        student_id,
        "تم نقلك إلى مجموعة جديدة",
        "تم نقلك إلى مجموعة أخرى. جميع بياناتك السابقة (التسميعات، ورق المتابعة، الحضور) محفوظة.",
        "info"
    )
    
    return {"message": "تم نقل الطالب مع جميع بياناته بنجاح"}

# نموذج لإضافة طالب من المدير أو المعلم (بدون كود التسجيل)
class AdminCreateStudent(BaseModel):
    email: str
    name: str
    password: str
    role: str = "student"
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
    group_id: Optional[str] = None

@api_router.post("/admin/students")
async def admin_create_student(data: AdminCreateStudent, current_user: dict = Depends(get_current_user)):
    """Create a new student (Admin or Sheikh)"""
    if current_user["role"] not in ["admin", "sheikh"]:
        raise HTTPException(status_code=403, detail="غير مصرح لك بإضافة طالب")
    
    # Validate data
    if not data.email or not data.name or not data.password:
        raise HTTPException(status_code=400, detail="الاسم والبريد الإلكتروني وكلمة المرور مطلوبة")
    
    if len(data.password) < 4:
        raise HTTPException(status_code=400, detail="كلمة المرور يجب أن تكون 4 أحرف على الأقل")
    
    # Check if email exists
    existing = await db.users.find_one({"email": data.email})
    if existing:
        raise HTTPException(status_code=400, detail="البريد الإلكتروني مسجل مسبقاً")
    
    try:
        # Create student
        user = User(
            email=data.email,
            name=data.name,
            role="student",
            mosque_name=data.mosque_name,
            school_name=data.school_name,
            school_grade=data.school_grade,
            birth_date=data.birth_date,
            profile_image=data.profile_image,
            student_phone=data.student_phone,
            father_phone=data.father_phone,
            mother_phone=data.mother_phone,
            is_active=True,
            is_activated=True
        )
        
        user_dict = user.model_dump()
        user_dict["password_hash"] = get_password_hash(data.password)
        user_dict["created_at"] = user_dict["created_at"].isoformat()
        user_dict["registration_date"] = user_dict["registration_date"].isoformat()
        
        # إذا كان المعلم هو من أضاف الطالب، نضيفه لمجموعته
        if current_user["role"] == "sheikh" and data.group_id:
            # التحقق من أن المجموعة تابعة للمعلم
            group = await db.groups.find_one({"id": data.group_id, "sheikh_id": current_user["user_id"]})
            if group:
                user_dict["group_id"] = data.group_id
        elif data.group_id:
            user_dict["group_id"] = data.group_id
        
        await db.users.insert_one(user_dict)
        
        # إنشاء سجل النقاط
        await db.student_points.insert_one({
            "student_id": user.id,
            "total_points": 0,
            "attendance_points": 0,
            "recitation_points": 0,
            "tracking_points": 0,
            "bonus_points": 0,
            "level": 1
        })
        
        return {
            "message": "تم إضافة الطالب بنجاح",
            "student_id": user.id,
            "student_name": user.name
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"فشل في إضافة الطالب: {str(e)}")

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
    else:
          # Ensure all point fields exist
          student_points.setdefault("attendance_points", 0)
          student_points.setdefault("recitation_points", 0)
          student_points.setdefault("tracking_points", 0)
          student_points.setdefault("interaction_points", 0)
          student_points.setdefault("admin_bonus_points", 0)
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

# ===== ACTIVE STUDENT BONUS =====
class ActiveStudentBonus(BaseModel):
    student_id: str
    reason: Optional[str] = "طالب متفاعل"

@api_router.post("/students/active-bonus")
async def grant_active_student_bonus(data: ActiveStudentBonus, current_user: dict = Depends(get_current_user)):
    """منح نقاط الطالب المتفاعل (للشيخ فقط) - 10 نقاط"""
    if current_user["role"] != "sheikh":
        raise HTTPException(status_code=403, detail="فقط المعلم يمكنه منح هذه النقاط")
    
    # Verify student exists
    student = await db.users.find_one({"id": data.student_id, "role": "student"})
    if not student:
        raise HTTPException(status_code=404, detail="الطالب غير موجود")
    
    # Check if student is in sheikh's groups
    groups = await db.groups.find({"sheikh_id": current_user["user_id"]}).to_list(100)
    group_ids = [g["id"] for g in groups]
    if student.get("group_id") not in group_ids:
        raise HTTPException(status_code=403, detail="الطالب ليس في مجموعاتك")
    
    # Check if bonus already given today
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    existing = await db.active_bonuses.find_one({
        "student_id": data.student_id,
        "date": today
    })
    if existing:
        raise HTTPException(status_code=400, detail="تم منح النقاط لهذا الطالب اليوم")
    
    # Save the bonus record
    bonus_record = {
        "id": str(uuid.uuid4()),
        "student_id": data.student_id,
        "sheikh_id": current_user["user_id"],
        "reason": data.reason,
        "points": 10,
        "date": today,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.active_bonuses.insert_one(bonus_record)
    
    # Add points
    await add_points(data.student_id, 10, "active_bonus", data.reason)
    
    # Notify student
    await create_notification_internal(
        data.student_id,
        "🌟 مبارك!",
        f"حصلت على 10 نقاط كطالب متفاعل من الشيخ {current_user.get('name', 'المعلم')}",
        "success"
    )
    
    return {
        "message": "تم منح نقاط الطالب المتفاعل بنجاح",
        "student_name": student.get("name"),
        "points": 10
    }

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
        total_recitations = len([r for r in recitations if not r.get("did_not_recite")])
        total_pages = sum(r.get("page_to", 0) - r.get("page_from", 0) + 1 for r in recitations if r.get("page_from") and r.get("page_to") and not r.get("did_not_recite"))
        
        # حساب نسبة التسميع
        recitation_days = set()
        did_not_recite_days = set()
        for r in recitations:
            created_at = r.get("created_at", "")
            if created_at:
                day = created_at[:10] if isinstance(created_at, str) else created_at.strftime("%Y-%m-%d")
                if r.get("did_not_recite"):
                    did_not_recite_days.add(day)
                else:
                    recitation_days.add(day)
        
        total_recitation_days = len(recitation_days) + len(did_not_recite_days)
        recitation_rate = round((len(recitation_days) / max(total_recitation_days, 1)) * 100, 1)
        did_not_recite_count = len([r for r in recitations if r.get("did_not_recite")])
        
        # Get tracking sheets total points - مجموع نقاط ورق المتابعة
        tracking_sheets = await db.tracking_sheets.find({"student_id": student["id"]}, {"_id": 0}).to_list(100)
        tracking_points_total = sum(sheet.get("points_earned", 0) for sheet in tracking_sheets)
        tracking_sheets_count = len(tracking_sheets)
        
        # Get group name
        group = next((g for g in groups if g["id"] == student.get("group_id")), None)
        
        # حساب النسب المئوية
        # الحد الأقصى للنقاط 1000
        points_percentage = round((total_points / 1000) * 100, 1) if total_points > 0 else 0
        # نسبة ورق المتابعة: افتراض 100 نقطة أسبوعياً كحد أقصى لكل ورقة
        tracking_percentage = round((tracking_points_total / (tracking_sheets_count * 100)) * 100, 1) if tracking_sheets_count > 0 else 0
        
        rankings.append({
            "student_id": student["id"],
            "student_name": student["name"],
            "group_id": student.get("group_id"),
            "group_name": group["name"] if group else "بدون مجموعة",
            "total_points": total_points,
            "points_percentage": points_percentage,  # نسبة النقاط من 1000
            "attendance_rate": attendance_rate,
            "recitation_rate": recitation_rate,  # نسبة التسميع
            "total_recitations": total_recitations,
            "did_not_recite_count": did_not_recite_count,  # عدد مرات "لم يسمّع"
            "total_pages": total_pages,
            "tracking_points": tracking_points_total,  # مجموع نقاط ورق المتابعة
            "tracking_percentage": tracking_percentage,  # نسبة ورق المتابعة
            "tracking_sheets_count": tracking_sheets_count,  # عدد ورق المتابعة
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
    
    # Validation
    if not data.student_id:
        raise HTTPException(status_code=400, detail="يجب تحديد الطالب")
    if not data.amount or data.amount <= 0:
        raise HTTPException(status_code=400, detail="المبلغ يجب أن يكون أكبر من صفر")
    
    # Verify student exists
    student = await db.users.find_one({"id": data.student_id, "role": "student"})
    if not student:
        raise HTTPException(status_code=404, detail="الطالب غير موجود")
    
    try:
        fee = Fee(
            student_id=data.student_id,
            fee_type=data.fee_type or "subscription",
            amount=data.amount,
            description=data.description,
            due_date=data.due_date,
            month=data.month,
            year=data.year,
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
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"فشل في إضافة الرسوم: {str(e)}")

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

# ============== BADGES & INTERACTION SYSTEM ==============

class InteractionGrantCreate(BaseModel):
    student_id: str
    notes: Optional[str] = None

@api_router.post("/badges/interaction")
async def grant_interaction_badge(data: InteractionGrantCreate, current_user: dict = Depends(get_current_user)):
    """منح شارة المتفاعل ونقاط التفاعل - للمعلم فقط"""
    if current_user["role"] != "sheikh":
        raise HTTPException(status_code=403, detail="فقط المعلم يمكنه منح شارة التفاعل")
    
    week_start = get_current_week_start()
    
    # التحقق من عدم منح التفاعل مسبقاً لهذا الأسبوع
    existing = await db.interaction_grants.find_one({
        "student_id": data.student_id,
        "sheikh_id": current_user["user_id"],
        "week_start": week_start
    })
    
    if existing:
        raise HTTPException(status_code=400, detail="تم منح نقاط التفاعل لهذا الطالب هذا الأسبوع مسبقاً")
    
    # إنشاء سجل التفاعل
    interaction = {
        "id": str(uuid.uuid4()),
        "student_id": data.student_id,
        "sheikh_id": current_user["user_id"],
        "points": 10,
        "week_start": week_start,
        "notes": data.notes,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.interaction_grants.insert_one(interaction)
    
    # منح الشارة
    await grant_badge_to_student(data.student_id, "interactive", current_user["user_id"])
    
    # منح النقاط (مع الحد الأقصى 1000)
    student_points = await db.student_points.find_one({"student_id": data.student_id})
    current_total = student_points.get("total_points", 0) if student_points else 0
    points_to_add = min(10, 1000 - current_total)
    
    if points_to_add > 0:
        await add_points(data.student_id, points_to_add, "interaction", "نقاط تفاعل من المعلم")
        await db.student_points.update_one(
            {"student_id": data.student_id},
            {"$inc": {"interaction_points": points_to_add}},
            upsert=True
        )
    
    # إشعار الطالب
    await create_notification_internal(
        data.student_id,
        "🌟 شارة المتفاعل",
        f"حصلت على شارة المتفاعل و{points_to_add} نقطة من المعلم!",
        "success"
    )
    
    return {"message": "تم منح شارة التفاعل بنجاح", "points_added": points_to_add}

class AdminBonusCreate(BaseModel):
    student_id: str
    reason: Optional[str] = None

@api_router.post("/badges/admin-bonus")
async def grant_admin_bonus(data: AdminBonusCreate, current_user: dict = Depends(get_current_user)):
    """منح النقاط الإدارية للتميز - للمدير فقط (50 نقطة مرة واحدة في الأسبوع)"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="فقط المدير يمكنه منح النقاط الإدارية")
    
    week_start = get_current_week_start()
    
    # التحقق من عدم منح النقاط الإدارية مسبقاً لهذا الأسبوع
    existing = await db.admin_bonus_grants.find_one({
        "student_id": data.student_id,
        "week_start": week_start
    })
    
    if existing:
        raise HTTPException(status_code=400, detail="تم منح النقاط الإدارية لهذا الطالب هذا الأسبوع مسبقاً")
    
    # إنشاء سجل النقاط الإدارية
    bonus = {
        "id": str(uuid.uuid4()),
        "student_id": data.student_id,
        "admin_id": current_user["user_id"],
        "points": 50,
        "week_start": week_start,
        "reason": data.reason,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.admin_bonus_grants.insert_one(bonus)
    
    # منح النقاط (مع الحد الأقصى 1000)
    student_points = await db.student_points.find_one({"student_id": data.student_id})
    current_total = student_points.get("total_points", 0) if student_points else 0
    points_to_add = min(50, 1000 - current_total)
    
    if points_to_add > 0:
        await add_points(data.student_id, points_to_add, "admin_bonus", data.reason or "نقاط إدارية للتميز")
        await db.student_points.update_one(
            {"student_id": data.student_id},
            {"$inc": {"admin_bonus_points": points_to_add}},
            upsert=True
        )
    
    # إشعار الطالب
    await create_notification_internal(
        data.student_id,
        "🏆 نقاط التميز",
        f"حصلت على {points_to_add} نقطة إدارية للتميز من المدير!",
        "success"
    )
    
    return {"message": "تم منح النقاط الإدارية بنجاح", "points_added": points_to_add}

@api_router.get("/badges/student/{student_id}")
async def get_student_badges(student_id: str, current_user: dict = Depends(get_current_user)):
    """الحصول على شارات الطالب للأسبوع الحالي"""
    week_start = get_current_week_start()
    
    badges = await db.weekly_badges.find({
        "student_id": student_id,
        "week_start": week_start
    }, {"_id": 0}).to_list(10)
    
    # الحصول على إجمالي عدد الشارات
    student_points = await db.student_points.find_one({"student_id": student_id})
    total_badges_count = student_points.get("badges_count", 0) if student_points else 0
    
    return {
        "current_week_badges": badges,
        "total_badges_count": total_badges_count,
        "week_start": week_start
    }

@api_router.get("/badges/available")
async def get_available_badges():
    """الحصول على قائمة الشارات المتاحة"""
    from models import WEEKLY_BADGES
    return list(WEEKLY_BADGES.values())

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

# نموذج تسليم الواجب مع الملف
class HomeworkSubmitRequest(BaseModel):
    notes: Optional[str] = None
    file_base64: Optional[str] = None  # الملف بصيغة base64
    file_name: Optional[str] = None
    file_type: Optional[str] = None  # image, pdf, doc

@api_router.post("/homework/{homework_id}/submit")
async def submit_homework(homework_id: str, data: HomeworkSubmitRequest, current_user: dict = Depends(get_current_user)):
    """Submit homework with optional file attachment (Student)"""
    if current_user["role"] != "student":
        raise HTTPException(status_code=403, detail="فقط الطلاب يمكنهم تسليم الواجبات")
    
    # Check if homework exists
    homework = await db.homework.find_one({"id": homework_id}, {"_id": 0})
    if not homework:
        raise HTTPException(status_code=404, detail="الواجب غير موجود")
    
    # Find student's submission
    submission = await db.homework_submissions.find_one({
        "homework_id": homework_id,
        "student_id": current_user["user_id"]
    })
    
    if not submission:
        raise HTTPException(status_code=404, detail="لم يتم تخصيص هذا الواجب لك")
    
    if submission.get("status") == "graded":
        raise HTTPException(status_code=400, detail="تم تقييم هذا الواجب مسبقاً")
    
    # Update submission
    update_data = {
        "status": "submitted",
        "submission_notes": data.notes,
        "submitted_at": datetime.now(timezone.utc).isoformat()
    }
    
    # Handle file upload
    if data.file_base64:
        update_data["file_base64"] = data.file_base64
        update_data["file_name"] = data.file_name
        update_data["file_type"] = data.file_type
    
    await db.homework_submissions.update_one(
        {"id": submission["id"]},
        {"$set": update_data}
    )
    
    return {"message": "تم تسليم الواجب بنجاح"}

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
    
    # حساب الدرجة تلقائياً من 100
    # كل تنبيه = -0.5، كل خطأ = -2، كل خطأ تجويد = -0.5
    calculated_grade = 100.0
    calculated_grade -= data.warning_count * 0.5  # التنبيهات
    calculated_grade -= data.error_count * 2.0     # الأخطاء
    calculated_grade -= data.tajweed_errors * 0.5  # أخطاء التجويد
    calculated_grade = max(0, calculated_grade)    # لا تنزل تحت الصفر
    
    # استخدم الدرجة المحسوبة إذا لم يتم إدخال درجة يدوياً
    final_grade = data.grade if data.grade is not None else calculated_grade
    
    exam = AdminExam(
        student_id=data.student_id,
        exam_type=data.exam_type,
        juz_numbers=data.juz_numbers,  # أجزاء متعددة
        juz_number=data.juz_number,    # للتوافق
        surah_name=data.surah_name,
        page_from=data.page_from,
        page_to=data.page_to,
        warning_count=data.warning_count,
        error_count=data.error_count,
        tajweed_errors=data.tajweed_errors,
        pronunciation_errors=data.pronunciation_errors,
        memorization_errors=data.memorization_errors,
        result=data.result,
        grade=final_grade,
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
    juz_text = ""
    if data.juz_numbers:
        juz_text = f" - الأجزاء: {', '.join(map(str, data.juz_numbers))}"
    elif data.juz_number:
        juz_text = f" - الجزء {data.juz_number}"
    
    await create_notification_internal(
        data.student_id,
        f"نتيجة {exam_type_text}",
        f"النتيجة: {result_text} - الدرجة: {final_grade:.1f}%{juz_text}",
        "success" if data.result == "pass" else "warning"
    )
    
    return {"message": "تم إضافة الامتحان بنجاح", "exam_id": exam.id, "grade": final_grade}

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

# ============== TRACKING SHEET SETTINGS (SUBMISSION WINDOW) ==============

class TrackingSettingsUpdate(BaseModel):
    """إعدادات مواعيد تسليم ورق المتابعة"""
    submission_enabled: Optional[bool] = None
    submission_start_day: Optional[str] = None  # friday, saturday, sunday, etc.
    submission_start_time: Optional[str] = None  # HH:MM format (e.g., "21:00")
    submission_end_day: Optional[str] = None
    submission_end_time: Optional[str] = None  # HH:MM format (e.g., "08:50")

@api_router.get("/settings/tracking-submission")
async def get_tracking_submission_settings(current_user: dict = Depends(get_current_user)):
    """الحصول على إعدادات مواعيد تسليم ورق المتابعة"""
    if current_user["role"] not in ["admin", "sheikh"]:
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    settings = await db.settings.find_one({"key": "tracking_submission"}, {"_id": 0})
    
    if not settings:
        # الإعدادات الافتراضية
        default_settings = {
            "key": "tracking_submission",
            "submission_enabled": True,
            "submission_start_day": "friday",
            "submission_start_time": "21:00",
            "submission_end_day": "saturday",
            "submission_end_time": "08:50",
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.settings.insert_one(default_settings)
        return default_settings
    
    return settings

@api_router.put("/settings/tracking-submission")
async def update_tracking_submission_settings(data: TrackingSettingsUpdate, current_user: dict = Depends(get_current_user)):
    """تحديث إعدادات مواعيد تسليم ورق المتابعة (المدير والمعلم)"""
    if current_user["role"] not in ["admin", "sheikh"]:
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    # الأيام المسموحة
    valid_days = ["saturday", "sunday", "monday", "tuesday", "wednesday", "thursday", "friday"]
    
    update_data = {"updated_at": datetime.now(timezone.utc).isoformat()}
    
    if data.submission_enabled is not None:
        update_data["submission_enabled"] = data.submission_enabled
    
    if data.submission_start_day is not None:
        if data.submission_start_day.lower() not in valid_days:
            raise HTTPException(status_code=400, detail="يوم البداية غير صحيح")
        update_data["submission_start_day"] = data.submission_start_day.lower()
    
    if data.submission_start_time is not None:
        # التحقق من صيغة الوقت
        try:
            parts = data.submission_start_time.split(":")
            hour = int(parts[0])
            minute = int(parts[1]) if len(parts) > 1 else 0
            if hour < 0 or hour > 23 or minute < 0 or minute > 59:
                raise ValueError()
            update_data["submission_start_time"] = f"{hour:02d}:{minute:02d}"
        except:
            raise HTTPException(status_code=400, detail="صيغة وقت البداية غير صحيحة (استخدم HH:MM)")
    
    if data.submission_end_day is not None:
        if data.submission_end_day.lower() not in valid_days:
            raise HTTPException(status_code=400, detail="يوم النهاية غير صحيح")
        update_data["submission_end_day"] = data.submission_end_day.lower()
    
    if data.submission_end_time is not None:
        try:
            parts = data.submission_end_time.split(":")
            hour = int(parts[0])
            minute = int(parts[1]) if len(parts) > 1 else 0
            if hour < 0 or hour > 23 or minute < 0 or minute > 59:
                raise ValueError()
            update_data["submission_end_time"] = f"{hour:02d}:{minute:02d}"
        except:
            raise HTTPException(status_code=400, detail="صيغة وقت النهاية غير صحيحة (استخدم HH:MM)")
    
    # تحديث أو إنشاء الإعدادات
    result = await db.settings.update_one(
        {"key": "tracking_submission"},
        {"$set": update_data},
        upsert=True
    )
    
    # إرجاع الإعدادات المحدثة
    settings = await db.settings.find_one({"key": "tracking_submission"}, {"_id": 0})
    
    return {
        "message": "تم تحديث إعدادات مواعيد التسليم بنجاح",
        "settings": settings
    }

@api_router.get("/settings/tracking-submission/check")
async def check_tracking_submission_window(current_user: dict = Depends(get_current_user)):
    """فحص هل يمكن تسليم ورق المتابعة الآن"""
    settings = await db.settings.find_one({"key": "tracking_submission"}, {"_id": 0})
    
    if not settings or not settings.get("submission_enabled", True):
        return {
            "can_submit": True,
            "message": "التسليم مفتوح دائماً",
            "settings": settings
        }
    
    # الأيام بالعربية
    day_names = {
        "saturday": "السبت",
        "sunday": "الأحد",
        "monday": "الاثنين",
        "tuesday": "الثلاثاء",
        "wednesday": "الأربعاء",
        "thursday": "الخميس",
        "friday": "الجمعة"
    }
    
    day_numbers = {
        "saturday": 5,
        "sunday": 6,
        "monday": 0,
        "tuesday": 1,
        "wednesday": 2,
        "thursday": 3,
        "friday": 4
    }
    
    now = datetime.now(timezone.utc)
    current_day = now.weekday()
    current_time = now.hour * 60 + now.minute  # بالدقائق
    
    start_day = day_numbers.get(settings.get("submission_start_day", "friday"), 4)
    end_day = day_numbers.get(settings.get("submission_end_day", "saturday"), 5)
    
    start_time_str = settings.get("submission_start_time", "21:00")
    end_time_str = settings.get("submission_end_time", "08:50")
    
    start_parts = start_time_str.split(":")
    start_time = int(start_parts[0]) * 60 + int(start_parts[1])
    
    end_parts = end_time_str.split(":")
    end_time = int(end_parts[0]) * 60 + int(end_parts[1])
    
    can_submit = False
    
    # فحص الفترة (قد تمتد لأكثر من يوم)
    if start_day == end_day:
        # نفس اليوم
        can_submit = current_day == start_day and start_time <= current_time <= end_time
    elif start_day < end_day:
        # فترة عادية
        if current_day == start_day and current_time >= start_time:
            can_submit = True
        elif current_day == end_day and current_time <= end_time:
            can_submit = True
        elif start_day < current_day < end_day:
            can_submit = True
    else:
        # فترة تمتد عبر نهاية الأسبوع
        if current_day == start_day and current_time >= start_time:
            can_submit = True
        elif current_day == end_day and current_time <= end_time:
            can_submit = True
        elif current_day > start_day or current_day < end_day:
            can_submit = True
    
    start_day_name = day_names.get(settings.get("submission_start_day", "friday"), "الجمعة")
    end_day_name = day_names.get(settings.get("submission_end_day", "saturday"), "السبت")
    
    if can_submit:
        message = f"التسليم مفتوح حتى {end_day_name} {end_time_str}"
    else:
        message = f"التسليم متاح من {start_day_name} {start_time_str} إلى {end_day_name} {end_time_str}"
    
    return {
        "can_submit": can_submit,
        "message": message,
        "settings": {
            "start_day": settings.get("submission_start_day"),
            "start_time": start_time_str,
            "end_day": settings.get("submission_end_day"),
            "end_time": end_time_str
        }
    }


# ============== TERM MANAGEMENT SYSTEM ==============

class TermCreateRequest(BaseModel):
    name: str  # اسم الفصل

@api_router.get("/terms")
async def get_terms(current_user: dict = Depends(get_current_user)):
    """Get all terms (Admin and Sheikh can view)"""
    if current_user["role"] not in ["admin", "sheikh"]:
        raise HTTPException(status_code=403, detail="غير مصرح لك بالوصول للفصول الدراسية")
    
    terms = await db.terms.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return terms

@api_router.get("/terms/active")
async def get_active_term(current_user: dict = Depends(get_current_user)):
    """Get the currently active term"""
    term = await db.terms.find_one({"is_active": True}, {"_id": 0})
    if not term:
        # إنشاء فصل افتراضي إذا لم يوجد
        now = datetime.now(timezone.utc)
        default_term = Term(
            name=f"الفصل الأول {now.year}",
            start_date=now.isoformat(),
            is_active=True,
            created_by="system"
        )
        term_dict = default_term.model_dump()
        term_dict["created_at"] = term_dict["created_at"].isoformat()
        await db.terms.insert_one(term_dict)
        return term_dict
    return term

@api_router.post("/terms/close-and-start-new")
async def close_term_and_start_new(data: TermCreateRequest, current_user: dict = Depends(get_current_user)):
    """
    إغلاق الفصل الحالي وبدء فصل جديد (Admin only)
    1. أرشفة بيانات جميع الطلاب
    2. تصفير بيانات الفصل الحالي
    3. إنشاء فصل جديد
    """
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="فقط المدير يمكنه إغلاق الفصل")
    
    if not data.name or not data.name.strip():
        raise HTTPException(status_code=400, detail="يجب إدخال اسم الفصل الجديد")
    
    try:
        # 1. جلب الفصل الحالي النشط
        current_term = await db.terms.find_one({"is_active": True})
        if not current_term:
            # إنشاء فصل افتراضي إذا لم يوجد
            current_term = {
                "id": str(uuid.uuid4()),
                "name": "فصل سابق",
                "is_active": True
            }
        
        term_id = current_term.get("id", str(uuid.uuid4()))
        term_name = current_term.get("name", "فصل سابق")
        
        # 2. جلب جميع الطلاب
        students = await db.users.find({"role": "student"}, {"_id": 0}).to_list(10000)
        
        # 3. أرشفة بيانات كل طالب
        archives = []
        for student in students:
            student_id = student["id"]
            
            # جلب بيانات النقاط
            points_data = await db.student_points.find_one({"student_id": student_id}, {"_id": 0})
            
            # حساب إحصائيات الحضور للفصل
            attendance_stats = await db.attendance.aggregate([
                {"$match": {"student_id": student_id}},
                {"$group": {
                    "_id": None,
                    "total": {"$sum": 1},
                    "present": {"$sum": {"$cond": [{"$eq": ["$status", "present"]}, 1, 0]}},
                    "absent": {"$sum": {"$cond": [{"$eq": ["$status", "absent"]}, 1, 0]}}
                }}
            ]).to_list(1)
            
            att_total = attendance_stats[0]["total"] if attendance_stats else 0
            att_present = attendance_stats[0]["present"] if attendance_stats else 0
            att_absent = attendance_stats[0]["absent"] if attendance_stats else 0
            
            # حساب عدد التسميعات
            recitation_count = await db.recitations.count_documents({
                "student_id": student_id,
                "did_not_recite": {"$ne": True}
            })
            
            # حساب عدد ورق المتابعة
            follow_up_count = await db.tracking_sheets.count_documents({"student_id": student_id})
            
            # إنشاء سجل الأرشيف
            archive = TermArchive(
                term_id=term_id,
                term_name=term_name,
                student_id=student_id,
                student_name=student.get("name", ""),
                current_term_points=points_data.get("total_points", 0) if points_data else 0,
                follow_up_count=follow_up_count,
                recitation_count=recitation_count,
                attendance_total=att_total,
                attendance_present=att_present,
                attendance_absent=att_absent,
                tracking_points=points_data.get("tracking_points", 0) if points_data else 0,
                recitation_points=points_data.get("recitation_points", 0) if points_data else 0,
                bonus_points=points_data.get("bonus_points", 0) if points_data else 0
            )
            
            archive_dict = archive.model_dump()
            archive_dict["archived_at"] = archive_dict["archived_at"].isoformat()
            archives.append(archive_dict)
        
        # 4. حفظ الأرشيف دفعة واحدة
        if archives:
            await db.term_archives.insert_many(archives)
        
        # ─────────────────────────────────────────────
        # 5. أرشفة سجلات الحضور كاملةً ثم حذفها
        # ─────────────────────────────────────────────
            all_attendance = await db.attendance.find({}, {"_id": 0}).to_list(100000)
        if all_attendance:
            for rec in all_attendance:
                rec["term_id"] = term_id
                rec["term_name"] = term_name
            await db.attendance_archives.insert_many(all_attendance)
        await db.attendance.delete_many({})

        # ─────────────────────────────────────────────
        # 6. أرشفة سجلات التسميع كاملةً ثم حذفها
        # ─────────────────────────────────────────────
        all_recitations = await db.recitations.find({}, {"_id": 0}).to_list(100000)
        if all_recitations:
            for rec in all_recitations:
                rec["term_id"] = term_id
                rec["term_name"] = term_name
            await db.recitations_archives.insert_many(all_recitations)
        await db.recitations.delete_many({})
        # 7. تصفير نقاط الطلاب
        await db.student_points.update_many(
            {},
            {"$set": {
                "total_points": 0,
                "current_term_points": 0,
                "attendance_points": 0,
                "recitation_points": 0,
                "tracking_points": 0,
                "bonus_points": 0,
                "interaction_points": 0,
                "admin_bonus_points": 0
            }}
        )
        # 6. إغلاق الفصل الحالي
        now = datetime.now(timezone.utc)
        await db.terms.update_many(
            {"is_active": True},
            {"$set": {"is_active": False, "end_date": now.isoformat()}}
        )
        
        # 7. إنشاء الفصل الجديد
        new_term = Term(
            name=data.name.strip(),
            start_date=now.isoformat(),
            is_active=True,
            created_by=current_user["user_id"]
        )
        
        new_term_dict = new_term.model_dump()
        new_term_dict["created_at"] = new_term_dict["created_at"].isoformat()
        await db.terms.insert_one(new_term_dict)
        
        # 8. إشعار جميع الطلاب
        for student in students:
            await create_notification_internal(
                student["id"],
                "بداية فصل دراسي جديد",
                f"تم بدء الفصل الجديد: {data.name}. تم أرشفة بياناتك السابقة.",
                "info"
            )
        
        return {
            "message": f"تم إغلاق الفصل السابق وبدء الفصل الجديد: {data.name}",
            "new_term_id": new_term.id,
            "archived_students_count": len(archives),
            "archived_attendance_count": len(all_attendance),
            "archived_recitations_count": len(all_recitations),
            "previous_term_name": term_name
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"فشل في إغلاق الفصل: {str(e)}")

# API إعادة تعيين الفصل (POST /admin/terms/reset) - نفس وظيفة close-and-start-new
@api_router.post("/admin/terms/reset")
async def admin_reset_term(data: TermCreateRequest, current_user: dict = Depends(get_current_user)):
    """
    إعادة تعيين الفصل - للمدير فقط
    يقوم بـ:
    1. أرشفة بيانات الفصل الحالي
    2. تصفير جميع النقاط والعدادات
    3. إنشاء فصل جديد
    البيانات القديمة تبقى محفوظة ويمكن الاستعلام عنها
    """
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="فقط المدير يمكنه إعادة تعيين الفصل")
    
    if not data.name or not data.name.strip():
        raise HTTPException(status_code=400, detail="يرجى إدخال اسم الفصل الجديد")
    
    try:
        # 1. الحصول على الفصل الحالي
        current_term = await db.terms.find_one({"is_active": True}, {"_id": 0})
        term_id = current_term["id"] if current_term else "no_term"
        term_name = current_term["name"] if current_term else "بدون فصل"
        
        # 2. جلب جميع الطلاب
        students = await db.users.find({"role": "student"}, {"_id": 0, "id": 1, "name": 1}).to_list(10000)
        
        # 3. أرشفة بيانات كل طالب للفصل الحالي فقط (حسب term_id)
        archives = []
        for student in students:
            student_id = student["id"]
            
            # جلب نقاط الطالب
            points_data = await db.student_points.find_one({"student_id": student_id}, {"_id": 0})
            
            # جلب الحضور للفصل الحالي فقط
            att_query = {"student_id": student_id}
            if current_term:
                att_query["term_id"] = term_id
            
            att_present = await db.attendance.count_documents({**att_query, "status": "present"})
            att_absent = await db.attendance.count_documents({**att_query, "status": "absent"})
            att_total = att_present + att_absent
            
            # جلب التسميعات للفصل الحالي فقط
            rec_query = {"student_id": student_id, "did_not_recite": {"$ne": True}}
            if current_term:
                rec_query["term_id"] = term_id
            recitation_count = await db.recitations.count_documents(rec_query)
            
            # حساب عدد ورق المتابعة للفصل الحالي فقط
            track_query = {"student_id": student_id}
            if current_term:
                track_query["term_id"] = term_id
            follow_up_count = await db.tracking_sheets.count_documents(track_query)
            
            # إنشاء سجل الأرشيف
            archive = TermArchive(
                term_id=term_id,
                term_name=term_name,
                student_id=student_id,
                student_name=student.get("name", ""),
                current_term_points=points_data.get("total_points", 0) if points_data else 0,
                follow_up_count=follow_up_count,
                recitation_count=recitation_count,
                attendance_total=att_total,
                attendance_present=att_present,
                attendance_absent=att_absent,
                tracking_points=points_data.get("tracking_points", 0) if points_data else 0,
                recitation_points=points_data.get("recitation_points", 0) if points_data else 0,
                bonus_points=points_data.get("bonus_points", 0) if points_data else 0
            )
            
            archive_dict = archive.model_dump()
            archive_dict["archived_at"] = archive_dict["archived_at"].isoformat()
            archives.append(archive_dict)
        
        # 4. حفظ الأرشيف دفعة واحدة
        if archives:
            await db.term_archives.insert_many(archives)
        
        # 5. تصفير جميع نقاط الطلاب (Bulk Update)
        await db.student_points.update_many(
            {},
            {
                "$set": {
                    "total_points": 0,
                    "current_term_points": 0,
                    "attendance_points": 0,
                    "recitation_points": 0,
                    "tracking_points": 0,
                    "bonus_points": 0,
                    "interaction_points": 0,
                    "admin_bonus_points": 0
                }
            }
        )
        
        # 6. إغلاق الفصل الحالي
        now = datetime.now(timezone.utc)
        await db.terms.update_many(
            {"is_active": True},
            {"$set": {"is_active": False, "end_date": now.isoformat()}}
        )
        
        # 7. إنشاء الفصل الجديد
        new_term = Term(
            name=data.name.strip(),
            start_date=now.isoformat(),
            is_active=True,
            created_by=current_user["user_id"]
        )
        
        new_term_dict = new_term.model_dump()
        new_term_dict["created_at"] = new_term_dict["created_at"].isoformat()
        await db.terms.insert_one(new_term_dict)
        
        # 8. إشعار جميع الطلاب
        for student in students:
            await create_notification_internal(
                student["id"],
                "بداية فصل دراسي جديد",
                f"تم بدء الفصل الجديد: {data.name}. تم أرشفة بياناتك السابقة وتصفير النقاط.",
                "info"
            )
        
        return {
            "message": f"تم إعادة تعيين الفصل بنجاح. الفصل الجديد: {data.name}",
            "new_term_id": new_term.id,
            "archived_students_count": len(archives),
            "previous_term_name": term_name
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"فشل في إعادة تعيين الفصل: {str(e)}")

@api_router.get("/terms/archive")
async def get_term_archives(term_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    """Get archived term data (Admin only)"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="فقط المدير يمكنه الوصول للأرشيف")
    
    query = {}
    if term_id:
        query["term_id"] = term_id
    
    archives = await db.term_archives.find(query, {"_id": 0}).sort("archived_at", -1).to_list(10000)
    return archives

@api_router.get("/terms/archive/student/{student_id}")
async def get_student_term_history(student_id: str, current_user: dict = Depends(get_current_user)):
    """Get a student's historical term data"""
    if current_user["role"] not in ["admin", "sheikh"]:
        if current_user["role"] == "student" and current_user["user_id"] != student_id:
            raise HTTPException(status_code=403, detail="لا يمكنك الوصول لسجلات طالب آخر")
    
    archives = await db.term_archives.find(
        {"student_id": student_id}, 
        {"_id": 0}
    ).sort("archived_at", -1).to_list(100)
    
    return archives

# جلب سجلات فصل معين (الحضور والتسميعات المؤرشفة)
@api_router.get("/terms/{term_id}/records")
async def get_term_records(term_id: str, student_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    """جلب سجلات فصل معين - الحضور والتسميعات المؤرشفة"""
    if current_user["role"] not in ["admin", "sheikh"]:
        if current_user["role"] == "student":
            student_id = current_user["user_id"]
        else:
            raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    # التحقق من وجود الفصل
    term = await db.terms.find_one({"id": term_id}, {"_id": 0})
    if not term:
        raise HTTPException(status_code=404, detail="الفصل غير موجود")
    
    # بناء الاستعلام
    query = {"term_id": term_id}
    if student_id:
        query["student_id"] = student_id
    
    # جلب الحضور المؤرشف
    attendance_archived = await db.attendance_archives.find(query, {"_id": 0}).to_list(10000)
    # جلب الحضور الحالي للفصل (إذا كان نشطاً)
    attendance_current = await db.attendance.find(query, {"_id": 0}).to_list(10000)
    
    # جلب التسميعات المؤرشفة
    recitations_archived = await db.recitations_archives.find(query, {"_id": 0}).to_list(10000)
    # جلب التسميعات الحالية للفصل
    recitations_current = await db.recitations.find(query, {"_id": 0}).to_list(10000)
    
    # جلب أرشيف الطلاب للفصل
    archive_query = {"term_id": term_id}
    if student_id:
        archive_query["student_id"] = student_id
    student_archives = await db.term_archives.find(archive_query, {"_id": 0}).to_list(1000)
    
    return {
        "term": term,
        "attendance": attendance_archived + attendance_current,
        "recitations": recitations_archived + recitations_current,
        "student_archives": student_archives
    }

# تفعيل فصل للعرض فقط (بدون تغيير الفصل النشط الفعلي)
@api_router.post("/terms/{term_id}/view")
async def set_viewing_term(term_id: str, current_user: dict = Depends(get_current_user)):
    """تحديد فصل للعرض - هذا لا يغير الفصل النشط الفعلي"""
    if current_user["role"] not in ["admin", "sheikh"]:
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    # التحقق من وجود الفصل
    term = await db.terms.find_one({"id": term_id}, {"_id": 0})
    if not term:
        raise HTTPException(status_code=404, detail="الفصل غير موجود")
    
    return {
        "message": f"يمكنك الآن عرض سجلات الفصل: {term['name']}",
        "term": term,
        "term_id": term_id
    }

# ============== BADGE MANAGEMENT ROUTES ==============

@api_router.post("/badges/types")
async def create_badge_type(data: BadgeTypeCreate, current_user: dict = Depends(get_current_user)):
    """إنشاء نوع شارة جديد - المدير فقط"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="فقط المدير يمكنه إنشاء أنواع الشارات")
    
    # التحقق من عدم وجود شارة بنفس المعرف
    existing = await db.badge_types.find_one({"id": data.id})
    if existing:
        raise HTTPException(status_code=400, detail="يوجد نوع شارة بهذا المعرف")
    
    badge_dict = data.model_dump()
    badge_dict["created_by"] = current_user["user_id"]
    badge_dict["created_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.badge_types.insert_one(badge_dict)
    
    return {"message": f"تم إنشاء نوع الشارة: {data.name}"}

@api_router.get("/badges/types")
async def get_badge_types(current_user: dict = Depends(get_current_user)):
    """جلب جميع أنواع الشارات"""
    badge_types = await db.badge_types.find({}, {"_id": 0}).to_list(1000)
    # إضافة الشارات الأسبوعية الافتراضية
    weekly_badges = [
        {"id": k, "name": v["name"], "description": v["description"], "icon": v["icon"], "category": v["category"]}
        for k, v in WEEKLY_BADGES.items()
    ]
    return badge_types + weekly_badges

@api_router.post("/badges/assign")
async def assign_badge(data: BadgeAssign, current_user: dict = Depends(get_current_user)):
    """تعيين شارة لطالب - الشيخ فقط"""
    if current_user["role"] != "sheikh":
        raise HTTPException(status_code=403, detail="فقط الشيخ يمكنه تعيين الشارات للطلاب")
    
    # التحقق من وجود الطالب
    student = await db.users.find_one({"id": data.student_id, "role": "student"})
    if not student:
        raise HTTPException(status_code=404, detail="الطالب غير موجود")
    
    # التحقق من أن الشارة موجودة
    badge_info = WEEKLY_BADGES.get(data.badge_id)
    if not badge_info:
        badge_info = await db.badge_types.find_one({"id": data.badge_id}, {"_id": 0})
    
    if not badge_info:
        raise HTTPException(status_code=404, detail="الشارة غير موجودة")
    
    # الحصول على بداية الأسبوع الحالي
    today = datetime.now(timezone.utc)
    week_start = (today - timedelta(days=today.weekday())).strftime("%Y-%m-%d")
    
    # التحقق من عدم وجود نفس الشارة للطالب في هذا الأسبوع
    existing = await db.weekly_badges.find_one({
        "student_id": data.student_id,
        "badge_id": data.badge_id,
        "week_start": week_start
    })
    
    if existing:
        raise HTTPException(status_code=400, detail="الطالب حاصل على هذه الشارة هذا الأسبوع")
    
    # إنشاء سجل الشارة
    badge_record = WeeklyBadge(
        student_id=data.student_id,
        badge_id=data.badge_id,
        badge_name=badge_info.get("name", badge_info["name"]) if isinstance(badge_info, dict) else badge_info.name,
        badge_icon=badge_info.get("icon", "🏅") if isinstance(badge_info, dict) else badge_info.icon,
        week_start=week_start,
        granted_by=current_user["user_id"]
    )
    
    badge_dict = badge_record.model_dump()
    badge_dict["granted_at"] = badge_dict["granted_at"].isoformat()
    
    await db.weekly_badges.insert_one(badge_dict)
    
    # تحديث شارات الطالب
    await db.student_points.update_one(
        {"student_id": data.student_id},
        {
            "$addToSet": {"weekly_badges": data.badge_id},
            "$inc": {"badges_count": 1}
        },
        upsert=True
    )
    
    # إشعار الطالب
    badge_name = badge_info.get("name", "") if isinstance(badge_info, dict) else badge_info.name
    await create_notification_internal(
        data.student_id,
        "شارة جديدة 🎖️",
        f"تهانينا! حصلت على شارة: {badge_name}",
        "success"
    )
    
    return {"message": f"تم تعيين شارة {badge_name} للطالب"}

@api_router.delete("/badges/remove")
async def remove_badge(data: BadgeRemove, current_user: dict = Depends(get_current_user)):
    """إزالة شارة من طالب - الشيخ فقط"""
    if current_user["role"] != "sheikh":
        raise HTTPException(status_code=403, detail="فقط الشيخ يمكنه إزالة الشارات من الطلاب")
    
    # البحث عن الشارة وحذفها
    result = await db.weekly_badges.delete_one({
        "student_id": data.student_id,
        "badge_id": data.badge_id
    })
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="الشارة غير موجودة للطالب")
    
    # تحديث شارات الطالب
    await db.student_points.update_one(
        {"student_id": data.student_id},
        {
            "$pull": {"weekly_badges": data.badge_id},
            "$inc": {"badges_count": -1}
        }
    )
    
    # سجل التدقيق
    await create_audit_log(
        actor_id=current_user["user_id"],
        actor_role=current_user["role"],
        target_student_id=data.student_id,
        field_changed="badge_removed",
        old_value=data.badge_id,
        new_value=data.reason or ""
    )
    
    return {"message": "تم إزالة الشارة من الطالب"}

# ============== SHEIKH UPDATE STUDENT ROUTES ==============

@api_router.put("/sheikh/students/{student_id}")
async def sheikh_update_student(student_id: str, data: SheikhUpdateStudent, current_user: dict = Depends(get_current_user)):
    """تعديل بيانات الطالب - الشيخ فقط"""
    if current_user["role"] != "sheikh":
        raise HTTPException(status_code=403, detail="فقط الشيخ يمكنه تعديل بيانات الطلاب")
    
    # التحقق من وجود الطالب
    student = await db.users.find_one({"id": student_id, "role": "student"}, {"_id": 0})
    if not student:
        raise HTTPException(status_code=404, detail="الطالب غير موجود")
    
    update_data = data.model_dump(exclude_unset=True)
    
    if not update_data:
        return {"message": "لا توجد بيانات للتحديث"}
    
    # إنشاء سجلات التدقيق
    for field, new_value in update_data.items():
        old_value = str(student.get(field, ""))
        await create_audit_log(
            actor_id=current_user["user_id"],
            actor_role=current_user["role"],
            target_student_id=student_id,
            field_changed=field,
            old_value=old_value,
            new_value=str(new_value) if new_value is not None else ""
        )
    
    # تحديث البيانات
    await db.users.update_one(
        {"id": student_id},
        {"$set": update_data}
    )
    
    return {"message": "تم تحديث بيانات الطالب بنجاح"}

@api_router.get("/audit-logs")
async def get_audit_logs(student_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    """جلب سجلات التدقيق - المدير فقط"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="فقط المدير يمكنه الوصول لسجلات التدقيق")
    
    query = {}
    if student_id:
        query["target_student_id"] = student_id
    
    logs = await db.audit_logs.find(query, {"_id": 0}).sort("timestamp", -1).limit(500).to_list(500)
    return logs

# ============== STUDENT TASMEE HISTORY ==============

@api_router.get("/students/{student_id}/tasmee-history")
async def get_student_tasmee_history(student_id: str, term_id: Optional[str] = None, all_terms: bool = False, current_user: dict = Depends(get_current_user)):
    """جلب سجل التسميع للطالب"""
    # التحقق من الصلاحيات
    if current_user["role"] == "student" and current_user["user_id"] != student_id:
        raise HTTPException(status_code=403, detail="لا يمكنك الوصول لسجلات طالب آخر")
    
    query = {"student_id": student_id}
    
    # تصفية حسب الفصل
    if term_id:
        query["term_id"] = term_id
    elif not all_terms:
        # الفصل النشط أو السجلات القديمة (بدون term_id)
        active_term_id = await get_active_term_id()
        if active_term_id:
            query["$or"] = [
                {"term_id": active_term_id},
                {"term_id": None},
                {"term_id": {"$exists": False}}
            ]
    
    recitations = await db.recitations.find(query, {"_id": 0}).sort([("record_date", -1), ("created_at", -1)]).to_list(1000)
    
    # تحويل البيانات لتنسيق الجدول المطلوب
    history = []
    for rec in recitations:
        history.append({
            "id": rec.get("id"),
            "date": rec.get("record_date", rec.get("created_at", "")[:10]),
            "new_pages": rec.get("new_pages", rec.get("pages_count", 0) or 0),
            "review_pages": rec.get("review_pages", rec.get("partial_review_pages", 0) or 0),
            "juz_number": rec.get("juz_number"),
            "passed": rec.get("passed_minimum") or rec.get("passed_review_minimum"),
            "did_not_recite": rec.get("did_not_recite", False),
            "notes": rec.get("notes")
        })
    
    return history


# ============== EXCEL EXPORT ROUTES ==============

@api_router.get("/export/students")
async def export_all_students_excel(term_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    """تحميل بيانات جميع الطلاب على شكل ملف Excel"""
    if current_user["role"] not in ["admin", "sheikh"]:
        raise HTTPException(status_code=403, detail="غير مصرح لك بتحميل البيانات")
    
    # جلب الفصل
    if term_id:
        term = await db.terms.find_one({"id": term_id}, {"_id": 0})
    else:
        term = await db.terms.find_one({"is_active": True}, {"_id": 0})
    
    term_name = term["name"] if term else "جميع الفصول"
    term_id_filter = term["id"] if term else None
    
    # جلب جميع الطلاب
    students = await db.users.find({"role": "student"}, {"_id": 0}).to_list(1000)
    
    # إنشاء ملف Excel
    output = io.BytesIO()
    workbook = xlsxwriter.Workbook(output, {'in_memory': True})
    
    # تنسيقات
    header_format = workbook.add_format({
        'bold': True, 'bg_color': '#1e3a5f', 'font_color': 'white',
        'border': 1, 'align': 'center', 'valign': 'vcenter', 'font_size': 12
    })
    cell_format = workbook.add_format({
        'border': 1, 'align': 'center', 'valign': 'vcenter', 'font_size': 11
    })
    title_format = workbook.add_format({
        'bold': True, 'font_size': 16, 'align': 'center', 'valign': 'vcenter',
        'bg_color': '#0d9488', 'font_color': 'white'
    })
    success_format = workbook.add_format({
        'border': 1, 'align': 'center', 'bg_color': '#d1fae5', 'font_color': '#065f46'
    })
    warning_format = workbook.add_format({
        'border': 1, 'align': 'center', 'bg_color': '#fef3c7', 'font_color': '#92400e'
    })
    danger_format = workbook.add_format({
        'border': 1, 'align': 'center', 'bg_color': '#fee2e2', 'font_color': '#991b1b'
    })
    
    # ورقة الملخص العام
    summary_sheet = workbook.add_worksheet('الملخص العام')
    summary_sheet.right_to_left()
    
    # العنوان
    summary_sheet.merge_range('A1:L1', f'نادي الحفاظ - {term_name}', title_format)
    summary_sheet.merge_range('A2:L2', f'تاريخ التصدير: {datetime.now().strftime("%Y-%m-%d")}', cell_format)
    
    # رؤوس الأعمدة
    headers = ['#', 'اسم الطالب', 'المجموعة', 'النقاط', 'الحضور', 'الغياب', 'نسبة الحضور', 
               'عدد التسميعات', 'نسبة التسميع', 'ورق المتابعة', 'الشارات', 'ملاحظات']
    
    for col, header in enumerate(headers):
        summary_sheet.write(3, col, header, header_format)
    
    summary_sheet.set_column('A:A', 5)
    summary_sheet.set_column('B:B', 25)
    summary_sheet.set_column('C:C', 15)
    summary_sheet.set_column('D:K', 12)
    summary_sheet.set_column('L:L', 30)
    
    row = 4
    for idx, student in enumerate(students, 1):
        student_id = student["id"]
        
        # جلب نقاط الطالب
        points = await db.student_points.find_one({"student_id": student_id}, {"_id": 0})
        total_points = points.get("total_points", 0) if points else 0
        
        # جلب الحضور
        att_query = {"student_id": student_id}
        if term_id_filter:
            att_query["$or"] = [{"term_id": term_id_filter}, {"term_id": None}, {"term_id": {"$exists": False}}]
        
        present_count = await db.attendance.count_documents({**att_query, "status": "present"})
        absent_count = await db.attendance.count_documents({**att_query, "status": "absent"})
        total_attendance = present_count + absent_count
        attendance_rate = round((present_count / total_attendance * 100), 1) if total_attendance > 0 else 0
        
        # جلب التسميعات
        rec_query = {"student_id": student_id, "did_not_recite": {"$ne": True}}
        if term_id_filter:
            rec_query["$or"] = [{"term_id": term_id_filter}, {"term_id": None}, {"term_id": {"$exists": False}}]
        
        recitation_count = await db.recitations.count_documents(rec_query)
        did_not_recite_count = await db.recitations.count_documents({
            "student_id": student_id, "did_not_recite": True,
            "$or": [{"term_id": term_id_filter}, {"term_id": None}, {"term_id": {"$exists": False}}] if term_id_filter else []
        } if term_id_filter else {"student_id": student_id, "did_not_recite": True})
        
        total_recitation_days = recitation_count + did_not_recite_count
        recitation_rate = round((recitation_count / total_recitation_days * 100), 1) if total_recitation_days > 0 else 0
        
        # جلب ورق المتابعة
        track_query = {"student_id": student_id}
        if term_id_filter:
            track_query["$or"] = [{"term_id": term_id_filter}, {"term_id": None}, {"term_id": {"$exists": False}}]
        tracking_count = await db.tracking_sheets.count_documents(track_query)
        
        # جلب الشارات
        badges_count = points.get("badges_count", 0) if points else 0
        
        # جلب المجموعة
        group_name = ""
        if student.get("group_id"):
            group = await db.groups.find_one({"id": student["group_id"]}, {"_id": 0, "name": 1})
            group_name = group["name"] if group else ""
        
        # كتابة الصف
        summary_sheet.write(row, 0, idx, cell_format)
        summary_sheet.write(row, 1, student.get("name", ""), cell_format)
        summary_sheet.write(row, 2, group_name, cell_format)
        summary_sheet.write(row, 3, total_points, cell_format)
        summary_sheet.write(row, 4, present_count, success_format if present_count > 0 else cell_format)
        summary_sheet.write(row, 5, absent_count, danger_format if absent_count > 0 else cell_format)
        summary_sheet.write(row, 6, f"{attendance_rate}%", success_format if attendance_rate >= 80 else (warning_format if attendance_rate >= 60 else danger_format))
        summary_sheet.write(row, 7, recitation_count, cell_format)
        summary_sheet.write(row, 8, f"{recitation_rate}%", success_format if recitation_rate >= 80 else (warning_format if recitation_rate >= 60 else danger_format))
        summary_sheet.write(row, 9, tracking_count, cell_format)
        summary_sheet.write(row, 10, badges_count, cell_format)
        summary_sheet.write(row, 11, "", cell_format)
        
        row += 1
    
    # إنشاء ورقة لكل طالب
    used_names = set()
    for idx, student in enumerate(students, 1):
        student_id = student["id"]
        base_name = student.get("name", "طالب")[:28]  # Excel يحد اسم الورقة بـ 31 حرف
        
        # جعل الاسم فريداً
        student_name = base_name
        counter = 1
        while student_name in used_names:
            student_name = f"{base_name}_{counter}"
            counter += 1
        used_names.add(student_name)
        
        # إنشاء ورقة الطالب
        try:
            student_sheet = workbook.add_worksheet(student_name)
        except:
            # في حالة فشل الإنشاء، استخدم رقم الطالب
            student_sheet = workbook.add_worksheet(f"طالب_{idx}")
        
        student_sheet.right_to_left()
        
        # معلومات الطالب
        student_sheet.merge_range('A1:F1', f'سجل الطالب: {student.get("name", "")}', title_format)
        student_sheet.write('A3', 'الاسم:', header_format)
        student_sheet.write('B3', student.get("name", ""), cell_format)
        student_sheet.write('C3', 'المجموعة:', header_format)
        
        group_name = ""
        if student.get("group_id"):
            group = await db.groups.find_one({"id": student["group_id"]}, {"_id": 0, "name": 1})
            group_name = group["name"] if group else ""
        student_sheet.write('D3', group_name, cell_format)
        
        student_sheet.write('A4', 'هاتف الطالب:', header_format)
        student_sheet.write('B4', student.get("student_phone", ""), cell_format)
        student_sheet.write('C4', 'هاتف الأب:', header_format)
        student_sheet.write('D4', student.get("father_phone", ""), cell_format)
        
        # جدول الحضور
        student_sheet.merge_range('A6:F6', 'سجل الحضور', title_format)
        att_headers = ['#', 'التاريخ', 'الحالة', 'سبب العذر']
        for col, h in enumerate(att_headers):
            student_sheet.write(6, col, h, header_format)
        
        att_query = {"student_id": student_id}
        if term_id_filter:
            att_query["$or"] = [{"term_id": term_id_filter}, {"term_id": None}, {"term_id": {"$exists": False}}]
        
        attendances = await db.attendance.find(att_query, {"_id": 0}).sort("date", -1).to_list(100)
        
        att_row = 7
        for i, att in enumerate(attendances, 1):
            student_sheet.write(att_row, 0, i, cell_format)
            student_sheet.write(att_row, 1, att.get("date", ""), cell_format)
            status = att.get("status", "")
            status_text = "حاضر" if status == "present" else ("غائب" if status == "absent" else "معذور")
            fmt = success_format if status == "present" else (danger_format if status == "absent" else warning_format)
            student_sheet.write(att_row, 2, status_text, fmt)
            student_sheet.write(att_row, 3, att.get("excuse_reason", ""), cell_format)
            att_row += 1
        
        # جدول التسميعات
        rec_start_row = att_row + 2
        student_sheet.merge_range(rec_start_row, 0, rec_start_row, 5, 'سجل التسميع', title_format)
        rec_headers = ['#', 'التاريخ', 'حفظ جديد', 'مراجعة', 'الحالة', 'ملاحظات']
        for col, h in enumerate(rec_headers):
            student_sheet.write(rec_start_row + 1, col, h, header_format)
        
        rec_query = {"student_id": student_id}
        if term_id_filter:
            rec_query["$or"] = [{"term_id": term_id_filter}, {"term_id": None}, {"term_id": {"$exists": False}}]
        
        recitations = await db.recitations.find(rec_query, {"_id": 0}).sort([("record_date", -1), ("created_at", -1)]).to_list(100)
        
        rec_row = rec_start_row + 2
        for i, rec in enumerate(recitations, 1):
            student_sheet.write(rec_row, 0, i, cell_format)
            student_sheet.write(rec_row, 1, rec.get("record_date", rec.get("created_at", "")[:10]), cell_format)
            student_sheet.write(rec_row, 2, rec.get("new_pages", 0) or 0, cell_format)
            student_sheet.write(rec_row, 3, rec.get("review_pages", 0) or 0, cell_format)
            
            if rec.get("did_not_recite"):
                status_text = "لم يسمع"
                fmt = danger_format
            elif rec.get("passed_minimum") or rec.get("passed_review_minimum"):
                status_text = "اجتاز"
                fmt = success_format
            else:
                status_text = "لم يجتز"
                fmt = warning_format
            
            student_sheet.write(rec_row, 4, status_text, fmt)
            student_sheet.write(rec_row, 5, rec.get("notes", ""), cell_format)
            rec_row += 1
        
        # ضبط عرض الأعمدة
        student_sheet.set_column('A:A', 5)
        student_sheet.set_column('B:B', 15)
        student_sheet.set_column('C:C', 12)
        student_sheet.set_column('D:D', 12)
        student_sheet.set_column('E:E', 12)
        student_sheet.set_column('F:F', 25)
    
    workbook.close()
    output.seek(0)
    
    # إنشاء اسم ملف آمن (ASCII فقط)
    filename = f"hafiz_tracker_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@api_router.get("/export/term/{term_id}")
async def export_term_archive_excel(term_id: str, current_user: dict = Depends(get_current_user)):
    """تحميل أرشيف فصل معين على شكل ملف Excel"""
    if current_user["role"] not in ["admin", "sheikh"]:
        raise HTTPException(status_code=403, detail="غير مصرح لك بتحميل البيانات")
    
    # جلب الفصل
    term = await db.terms.find_one({"id": term_id}, {"_id": 0})
    if not term:
        raise HTTPException(status_code=404, detail="الفصل غير موجود")
    
    term_name = term["name"]
    
    # جلب أرشيف الفصل
    archives = await db.term_archives.find({"term_id": term_id}, {"_id": 0}).to_list(1000)
    
    # إنشاء ملف Excel
    output = io.BytesIO()
    workbook = xlsxwriter.Workbook(output, {'in_memory': True})
    
    # تنسيقات
    header_format = workbook.add_format({
        'bold': True, 'bg_color': '#1e3a5f', 'font_color': 'white',
        'border': 1, 'align': 'center', 'valign': 'vcenter', 'font_size': 12
    })
    cell_format = workbook.add_format({
        'border': 1, 'align': 'center', 'valign': 'vcenter', 'font_size': 11
    })
    title_format = workbook.add_format({
        'bold': True, 'font_size': 16, 'align': 'center', 'valign': 'vcenter',
        'bg_color': '#0d9488', 'font_color': 'white'
    })
    
    # ورقة الأرشيف
    sheet = workbook.add_worksheet('أرشيف الفصل')
    sheet.right_to_left()
    
    # العنوان
    sheet.merge_range('A1:L1', f'أرشيف الفصل: {term_name}', title_format)
    sheet.merge_range('A2:L2', f'تاريخ التصدير: {datetime.now().strftime("%Y-%m-%d")}', cell_format)
    
    # رؤوس الأعمدة
    headers = ['#', 'اسم الطالب', 'النقاط', 'الحضور', 'الغياب', 'نسبة الحضور',
               'التسميعات', 'ورق المتابعة', 'نقاط التسميع', 'نقاط المتابعة', 'نقاط إضافية', 'تاريخ الأرشفة']
    
    for col, header in enumerate(headers):
        sheet.write(3, col, header, header_format)
    
    sheet.set_column('A:A', 5)
    sheet.set_column('B:B', 25)
    sheet.set_column('C:L', 12)
    
    row = 4
    for idx, archive in enumerate(archives, 1):
        total_att = archive.get("attendance_present", 0) + archive.get("attendance_absent", 0)
        att_rate = round((archive.get("attendance_present", 0) / total_att * 100), 1) if total_att > 0 else 0
        
        sheet.write(row, 0, idx, cell_format)
        sheet.write(row, 1, archive.get("student_name", ""), cell_format)
        sheet.write(row, 2, archive.get("current_term_points", 0), cell_format)
        sheet.write(row, 3, archive.get("attendance_present", 0), cell_format)
        sheet.write(row, 4, archive.get("attendance_absent", 0), cell_format)
        sheet.write(row, 5, f"{att_rate}%", cell_format)
        sheet.write(row, 6, archive.get("recitation_count", 0), cell_format)
        sheet.write(row, 7, archive.get("follow_up_count", 0), cell_format)
        sheet.write(row, 8, archive.get("recitation_points", 0), cell_format)
        sheet.write(row, 9, archive.get("tracking_points", 0), cell_format)
        sheet.write(row, 10, archive.get("bonus_points", 0), cell_format)
        
        archived_at = archive.get("archived_at", "")
        if isinstance(archived_at, str):
            archived_at = archived_at[:10]
        sheet.write(row, 11, archived_at, cell_format)
        
        row += 1
    
    workbook.close()
    output.seek(0)
    
    filename = f"hafiz_archive_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@api_router.get("/export/student/{student_id}")
async def export_student_excel(student_id: str, term_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    """تحميل بيانات طالب واحد على شكل ملف Excel"""
    # التحقق من الصلاحيات
    if current_user["role"] == "student" and current_user["user_id"] != student_id:
        raise HTTPException(status_code=403, detail="لا يمكنك تحميل بيانات طالب آخر")
    
    # جلب الطالب
    student = await db.users.find_one({"id": student_id, "role": "student"}, {"_id": 0})
    if not student:
        raise HTTPException(status_code=404, detail="الطالب غير موجود")
    
    # جلب الفصل
    if term_id:
        term = await db.terms.find_one({"id": term_id}, {"_id": 0})
    else:
        term = await db.terms.find_one({"is_active": True}, {"_id": 0})
    
    term_name = term["name"] if term else "جميع الفصول"
    term_id_filter = term["id"] if term else None
    
    # إنشاء ملف Excel
    output = io.BytesIO()
    workbook = xlsxwriter.Workbook(output, {'in_memory': True})
    
    # تنسيقات
    header_format = workbook.add_format({
        'bold': True, 'bg_color': '#1e3a5f', 'font_color': 'white',
        'border': 1, 'align': 'center', 'valign': 'vcenter', 'font_size': 12
    })
    cell_format = workbook.add_format({
        'border': 1, 'align': 'center', 'valign': 'vcenter', 'font_size': 11
    })
    title_format = workbook.add_format({
        'bold': True, 'font_size': 16, 'align': 'center', 'valign': 'vcenter',
        'bg_color': '#0d9488', 'font_color': 'white'
    })
    success_format = workbook.add_format({
        'border': 1, 'align': 'center', 'bg_color': '#d1fae5', 'font_color': '#065f46'
    })
    warning_format = workbook.add_format({
        'border': 1, 'align': 'center', 'bg_color': '#fef3c7', 'font_color': '#92400e'
    })
    danger_format = workbook.add_format({
        'border': 1, 'align': 'center', 'bg_color': '#fee2e2', 'font_color': '#991b1b'
    })
    
    # ورقة الطالب
    sheet = workbook.add_worksheet('سجل الطالب')
    sheet.right_to_left()
    
    # معلومات الطالب
    sheet.merge_range('A1:F1', f'سجل الطالب: {student.get("name", "")} - {term_name}', title_format)
    
    sheet.write('A3', 'الاسم:', header_format)
    sheet.write('B3', student.get("name", ""), cell_format)
    sheet.write('C3', 'البريد:', header_format)
    sheet.write('D3', student.get("email", ""), cell_format)
    
    sheet.write('A4', 'هاتف الطالب:', header_format)
    sheet.write('B4', student.get("student_phone", ""), cell_format)
    sheet.write('C4', 'هاتف الأب:', header_format)
    sheet.write('D4', student.get("father_phone", ""), cell_format)
    
    group_name = ""
    if student.get("group_id"):
        group = await db.groups.find_one({"id": student["group_id"]}, {"_id": 0, "name": 1})
        group_name = group["name"] if group else ""
    
    sheet.write('A5', 'المجموعة:', header_format)
    sheet.write('B5', group_name, cell_format)
    
    # جدول الحضور
    sheet.merge_range('A7:D7', 'سجل الحضور', title_format)
    att_headers = ['#', 'التاريخ', 'الحالة', 'سبب العذر']
    for col, h in enumerate(att_headers):
        sheet.write(7, col, h, header_format)
    
    att_query = {"student_id": student_id}
    if term_id_filter:
        att_query["$or"] = [{"term_id": term_id_filter}, {"term_id": None}, {"term_id": {"$exists": False}}]
    
    attendances = await db.attendance.find(att_query, {"_id": 0}).sort("date", -1).to_list(500)
    
    att_row = 8
    for i, att in enumerate(attendances, 1):
        sheet.write(att_row, 0, i, cell_format)
        sheet.write(att_row, 1, att.get("date", ""), cell_format)
        status = att.get("status", "")
        status_text = "حاضر" if status == "present" else ("غائب" if status == "absent" else "معذور")
        fmt = success_format if status == "present" else (danger_format if status == "absent" else warning_format)
        sheet.write(att_row, 2, status_text, fmt)
        sheet.write(att_row, 3, att.get("excuse_reason", ""), cell_format)
        att_row += 1
    
    # جدول التسميعات
    rec_start_row = att_row + 2
    sheet.merge_range(rec_start_row, 0, rec_start_row, 5, 'سجل التسميع', title_format)
    rec_headers = ['#', 'التاريخ', 'حفظ جديد', 'مراجعة', 'الحالة', 'ملاحظات']
    for col, h in enumerate(rec_headers):
        sheet.write(rec_start_row + 1, col, h, header_format)
    
    rec_query = {"student_id": student_id}
    if term_id_filter:
        rec_query["$or"] = [{"term_id": term_id_filter}, {"term_id": None}, {"term_id": {"$exists": False}}]
    
    recitations = await db.recitations.find(rec_query, {"_id": 0}).sort([("record_date", -1), ("created_at", -1)]).to_list(500)
    
    rec_row = rec_start_row + 2
    for i, rec in enumerate(recitations, 1):
        sheet.write(rec_row, 0, i, cell_format)
        sheet.write(rec_row, 1, rec.get("record_date", rec.get("created_at", "")[:10]), cell_format)
        sheet.write(rec_row, 2, rec.get("new_pages", 0) or 0, cell_format)
        sheet.write(rec_row, 3, rec.get("review_pages", 0) or 0, cell_format)
        
        if rec.get("did_not_recite"):
            status_text = "لم يسمع"
            fmt = danger_format
        elif rec.get("passed_minimum") or rec.get("passed_review_minimum"):
            status_text = "اجتاز"
            fmt = success_format
        else:
            status_text = "لم يجتز"
            fmt = warning_format
        
        sheet.write(rec_row, 4, status_text, fmt)
        sheet.write(rec_row, 5, rec.get("notes", ""), cell_format)
        rec_row += 1
    
    # ضبط عرض الأعمدة
    sheet.set_column('A:A', 5)
    sheet.set_column('B:B', 15)
    sheet.set_column('C:C', 15)
    sheet.set_column('D:D', 15)
    sheet.set_column('E:E', 12)
    sheet.set_column('F:F', 30)
    
    workbook.close()
    output.seek(0)
    
    filename = f"hafiz_student_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


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
