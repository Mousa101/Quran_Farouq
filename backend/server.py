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
from typing import List, Optional, Dict, Any
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
    StudentProfileUpdate, AdminSheikhUpdate, StudentCreate, QURAN_JUZ,
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
    calculate_pages_from_juz, PAGES_PER_JUZ, TOTAL_QURAN_PAGES,
    pages_for_juz, pages_for_juz_list, JUZ_AMMA_NUMBER, JUZ_AMMA_PAGES
)

class BaseModel(PydanticBaseModel):
    pass
from auth import (
    get_password_hash, verify_password, create_access_token,
    get_current_user, security, ensure_role
)
from image_analysis import analyze_tracking_sheet
from analytics import build_center_timeseries

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

# #6 — ربط الجدول بالفصل الحالي وتحديد أيام تسجيل الدوام والتسميع
ARABIC_WEEKDAYS = ["الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت", "الأحد"]
# Python weekday(): الاثنين=0 ... الأحد=6

def arabic_weekday_of(date_str: str) -> Optional[str]:
    """اسم اليوم بالعربي من تاريخ YYYY-MM-DD."""
    try:
        d = datetime.strptime(str(date_str)[:10], "%Y-%m-%d").date()
    except (ValueError, TypeError):
        return None
    return ARABIC_WEEKDAYS[d.weekday()]

async def get_active_lesson_days() -> List[str]:
    """أيام الدروس المعتمدة من الجدول النشط (المرتبط بالفصل الحالي).
    ترجع قائمة فارغة عند عدم وجود جدول/أيام (أي: لا قيود)."""
    schedule = await db.schedules.find_one({"is_active": True}, {"_id": 0, "id": 1, "lesson_days": 1})
    if not schedule:
        return []
    days = list(schedule.get("lesson_days") or [])
    if not days:
        # اشتقاق الأيام من فترات الجدول إن لم تُحدَّد صراحةً
        slots = await db.schedule_slots.find(
            {"schedule_id": schedule["id"]}, {"_id": 0, "day": 1}
        ).to_list(500)
        days = list({s.get("day") for s in slots if s.get("day")})
    return [d for d in days if d]

async def ensure_lesson_day(date_str: str, action_label: str):
    """يرفض التسجيل إذا كان اليوم خارج أيام الدروس المحدّدة في الجدول (إن وُجدت)."""
    lesson_days = await get_active_lesson_days()
    if not lesson_days:
        return  # لا جدول/أيام محددة => لا قيود
    day_name = arabic_weekday_of(date_str)
    if day_name and day_name not in lesson_days:
        raise HTTPException(
            status_code=400,
            detail=f"لا يمكن تسجيل {action_label} يوم {day_name} — أيام الدوام حسب الجدول: {'، '.join(lesson_days)}"
        )

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
    ensure_role(current_user, "admin", "فقط المدير يمكنه إنشاء رموز التسجيل")
    
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
    
    role_names = {"student": "طالب", "sheikh": "مشرف", "admin": "مدير"}
    return {"code": code, "role": data.role, "message": f"تم إنشاء رمز تسجيل {role_names.get(data.role, data.role)}"}

@api_router.get("/auth/codes")
async def get_registration_codes(current_user: dict = Depends(get_current_user)):
    """Get all registration codes (admin only)"""
    ensure_role(current_user, "admin", "غير مصرح لك")
    
    codes = await db.registration_codes.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return codes

@api_router.delete("/auth/codes/{code}")
async def delete_registration_code(code: str, current_user: dict = Depends(get_current_user)):
    """Delete a registration code (admin only)"""
    ensure_role(current_user, "admin", "غير مصرح لك")
    
    result = await db.registration_codes.delete_one({"code": code, "used": False})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="الرمز غير موجود أو مستخدم")
    
    return {"message": "تم حذف الرمز"}

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
            raise HTTPException(status_code=400, detail="رمز التسجيل مطلوب")
        
        # Verify code
        code_doc = await db.registration_codes.find_one({
            "code": user_data.registration_code,
            "role": user_data.role,
            "used": False
        })
        
        if not code_doc:
            raise HTTPException(status_code=400, detail="رمز التسجيل غير صحيح أو مستخدم أو لا يتطابق مع الدور")
    
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

LOGIN_ROLE_LABELS = {"admin": "مدير", "sheikh": "مشرف", "student": "طالب"}

# لكل نوع حساب رابط دخول مستقل: /auth/admin/login، /auth/teacher/login، /auth/student/login
# كل رابط يرفض حسابات الأدوار الأخرى (يُفحص الدور بعد التحقق من كلمة المرور حتى لا يُكشف وجود الحساب).
@api_router.post("/auth/admin/login")
async def admin_login(credentials: UserLogin):
    return await _login(credentials, "admin")

@api_router.post("/auth/teacher/login")
async def teacher_login(credentials: UserLogin):
    return await _login(credentials, "sheikh")

@api_router.post("/auth/student/login")
async def student_login(credentials: UserLogin):
    return await _login(credentials, "student")

# الرابط العام القديم — يبقى للتوافق مع الاختبارات والنسخ القديمة من الواجهة
@api_router.post("/auth/login")
async def login(credentials: UserLogin):
    return await _login(credentials)

async def _login(credentials: UserLogin, role: Optional[str] = None):
    user = await db.users.find_one({"email": credentials.email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="بيانات الدخول غير صحيحة")

    if not verify_password(credentials.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="بيانات الدخول غير صحيحة")

    if role and user.get("role") != role:
        raise HTTPException(
            status_code=403,
            detail=f"هذا ليس حساب {LOGIN_ROLE_LABELS[role]} — استخدم رابط الدخول الخاص بحسابك"
        )

    # Check if student account is activated
    if user.get("role") == "student" and not user.get("is_activated", True):
        raise HTTPException(
            status_code=403, 
            detail="حسابك غير مفعّل بعد. يرجى إدخال رمز التفعيل من الإدارة"
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
    
    role_name = "طالب" if role == "student" else ("مشرف" if role == "sheikh" else "مدير")
    
    return {
        "message": f"تم تسجيل بياناتك كـ{role_name} بنجاح. حسابك غير مفعل حالياً.",
        "detail": "يرجى التواصل مع إدارة المركز للحصول على رمز التفعيل",
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
        raise HTTPException(status_code=400, detail="رمز التفعيل غير صحيح")
    
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
    ensure_role(current_user, "admin", "فقط المدير يمكنه الوصول")
    
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
    ensure_role(current_user, "admin", "فقط المدير يمكنه إعادة تعيين كلمة المرور")
    
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
        "تمت إعادة تعيين كلمة المرور الخاصة بك من قبل الإدارة. يرجى تسجيل الدخول بكلمة المرور الجديدة.",
        "warning"
    )

    await log_admin_action(current_user, "password_reset", "user", user["id"], user.get("name"),
                           f"إعادة تعيين كلمة المرور ({user.get('role')})")

    return {"message": f"تمت إعادة تعيين كلمة المرور للمستخدم {user['name']} بنجاح"}

# ============== ADMIN: SHEIKH MANAGEMENT ==============

@api_router.get("/admin/sheikhs")
async def get_all_sheikhs(current_user: dict = Depends(get_current_user)):
    """Get all sheikhs with their details - Admin only"""
    ensure_role(current_user, "admin", "فقط المدير يمكنه الوصول")
    
    # Get all sheikhs
    sheikhs = await db.users.find(
        {"role": "sheikh"},
        {"_id": 0, "password_hash": 0, "activation_code": 0}
    ).to_list(100)
    
    # Add group info and student count for each sheikh
    for sheikh in sheikhs:
        groups = await db.groups.find({"sheikh_ids": sheikh["id"]}, {"_id": 0}).to_list(20)
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
    ensure_role(current_user, "admin", "فقط المدير يمكنه الوصول")
    
    # Get sheikh
    sheikh = await db.users.find_one(
        {"id": sheikh_id, "role": "sheikh"},
        {"_id": 0, "password_hash": 0, "activation_code": 0}
    )
    
    if not sheikh:
        raise HTTPException(status_code=404, detail="المشرف غير موجود")
    
    # Get sheikh's groups
    groups = await db.groups.find({"sheikh_ids": sheikh_id}, {"_id": 0}).to_list(20)
    
    # Get students for each group with detailed info
    groups_with_students = []
    total_students = 0
    total_points = 0
    
    for group in groups:
        students = await db.users.find(
            {"role": "student", "group_id": group["id"]},
            {"_id": 0, "password_hash": 0, "activation_code": 0}
        ).to_list(50)

        # النقاط من المصدر الموثوق student_points (وليس حقل users.points القديم)
        sids = [s["id"] for s in students]
        pts_docs = await db.student_points.find(
            {"student_id": {"$in": sids}}, {"_id": 0, "student_id": 1, "total_points": 1}
        ).to_list(500)
        pts_map = {p["student_id"]: p.get("total_points", 0) for p in pts_docs}
        for student in students:
            student["points"] = pts_map.get(student["id"], 0)

        group["students"] = students
        group["students_count"] = len(students)
        total_students += len(students)
        total_points += sum(pts_map.values())

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
    ensure_role(current_user, "admin", "فقط المدير يمكنه حذف المشرف")
    
    # Get sheikh
    sheikh = await db.users.find_one({"id": sheikh_id, "role": "sheikh"})
    if not sheikh:
        raise HTTPException(status_code=404, detail="المشرف غير موجود")
    
    # Check if sheikh has groups
    groups = await db.groups.find({"sheikh_ids": sheikh_id}, {"_id": 0}).to_list(20)
    
    if groups:
        # Remove sheikh from groups (don't delete the groups); the next sheikh becomes primary
        for g in groups:
            rest = [i for i in group_sheikh_ids(g) if i != sheikh_id]
            await db.groups.update_one(
                {"id": g["id"]},
                {"$set": {"sheikh_id": rest[0] if rest else None, "sheikh_ids": rest}}
            )
    
    # Delete sheikh
    await db.users.delete_one({"id": sheikh_id})

    await log_admin_action(current_user, "user_delete", "sheikh", sheikh_id, sheikh.get("name"),
                           f"حذف مشرف — مجموعات متأثرة: {len(groups)}")

    return {
        "message": f"تم حذف المشرف {sheikh['name']} بنجاح",
        "groups_affected": len(groups)
    }

@api_router.get("/admin/pending-registrations")
async def get_pending_registrations(current_user: dict = Depends(get_current_user)):
    """Get all pending registrations (students, sheikhs, admins) - Admin only"""
    ensure_role(current_user, "admin", "فقط المدير يمكنه الوصول")
    
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

@api_router.delete("/admin/pending-registrations/{user_id}")
async def reject_pending_registration(user_id: str, current_user: dict = Depends(get_current_user)):
    """#1 — رفض/حذف طلب تسجيل معلّق (أي دور) قبل التفعيل - المدير فقط."""
    ensure_role(current_user, "admin", "فقط المدير يمكنه حذف طلبات التسجيل")

    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="الطلب غير موجود")
    if user.get("is_activated", True):
        # حساب مفعّل بالفعل — لا يُحذف من هنا (يُستخدم حذف الطالب/المشرف المخصّص)
        raise HTTPException(status_code=400, detail="هذا الحساب مفعّل — استخدم حذف الطالب/المشرف")

    # حذف الطلب المعلّق وأي بيانات مرتبطة (نادراً ما توجد قبل التفعيل)
    await db.users.delete_one({"id": user_id})
    await db.notifications.delete_many({"user_id": user_id})

    await log_admin_action(current_user, "user_delete", user.get("role") or "user", user_id,
                           user.get("name"), "رفض/حذف طلب تسجيل معلّق")

    return {"message": "تم حذف طلب التسجيل بنجاح"}

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
    sheikh_id: Optional[str] = None
    sheikh_ids: Optional[List[str]] = None  # عدة مشرفين؛ الأول هو المشرف الرئيسي

class GroupUpdateAdmin(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    sheikh_id: Optional[str] = None
    sheikh_ids: Optional[List[str]] = None


def group_sheikh_ids(group: Optional[dict]) -> List[str]:
    """كل مشرفي المجموعة، والمشرف الرئيسي (sheikh_id) أولًا."""
    if not group:
        return []
    ids = [i for i in (group.get("sheikh_ids") or []) if i]
    primary = group.get("sheikh_id")
    if primary and primary not in ids:
        ids.insert(0, primary)
    return ids


async def group_sheikh_names_str(group: Optional[dict]) -> str:
    """أسماء كل مشرفي المجموعة مفصولة بفاصلة (للعرض)."""
    ids = group_sheikh_ids(group)
    if not ids:
        return "غير معين"
    names = {u["id"]: u.get("name") for u in await db.users.find({"id": {"$in": ids}}, {"_id": 0, "id": 1, "name": 1}).to_list(50)}
    return "، ".join(names[i] for i in ids if names.get(i)) or "غير معين"


async def _validated_sheikh_ids(sheikh_id: Optional[str], sheikh_ids: Optional[List[str]]) -> List[str]:
    """يوحّد sheikh_id/sheikh_ids في قائمة بلا تكرار، ويتحقق أن كلهم مشرفون."""
    ids = []
    for i in ([sheikh_id] if sheikh_id else []) + list(sheikh_ids or []):
        if i and i not in ids:
            ids.append(i)
    if not ids:
        raise HTTPException(status_code=400, detail="يرجى اختيار مشرف واحد على الأقل للمجموعة")
    found = await db.users.count_documents({"id": {"$in": ids}, "role": "sheikh"})
    if found != len(ids):
        raise HTTPException(status_code=404, detail="أحد المشرفين المختارين غير موجود")
    return ids

@api_router.post("/groups")
async def create_group(group_data: GroupCreateAdmin, current_user: dict = Depends(get_current_user)):
    """Create a new group (Admin only)"""
    ensure_role(current_user, "admin", "فقط المدير يمكنه إنشاء مجموعة")
    
    # Verify sheikhs exist (the first one is the primary)
    ids = await _validated_sheikh_ids(
        None if group_data.sheikh_ids else group_data.sheikh_id, group_data.sheikh_ids)

    group = Group(
        name=group_data.name,
        description=group_data.description,
        sheikh_id=ids[0],
        sheikh_ids=ids
    )
    
    group_dict = group.model_dump()
    group_dict["created_at"] = group_dict["created_at"].isoformat()
    
    await db.groups.insert_one(group_dict)
    
    return {"message": "تم إنشاء المجموعة بنجاح", "group_id": group.id}

@api_router.get("/groups")
async def get_groups(current_user: dict = Depends(get_current_user)):
    if current_user["role"] == "admin":
        groups = await db.groups.find({}, {"_id": 0}).to_list(100)
        # Add sheikh names to each group
        sheikh_names = {u["id"]: u.get("name") for u in await db.users.find(
            {"role": "sheikh"}, {"_id": 0, "id": 1, "name": 1}).to_list(1000)}
        for group in groups:
            group["sheikh_ids"] = [i for i in group_sheikh_ids(group) if i in sheikh_names]
            group["sheikh_names"] = [sheikh_names[i] for i in group["sheikh_ids"]]
            group["sheikh_name"] = "، ".join(group["sheikh_names"]) or "غير معين"
            # Count students
            student_count = await db.users.count_documents({"group_id": group["id"], "role": "student"})
            group["student_count"] = student_count
    elif current_user["role"] == "sheikh":
        groups = await db.groups.find({"sheikh_ids": current_user["user_id"]}, {"_id": 0}).to_list(100)
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
    ensure_role(current_user, "admin", "فقط المدير يمكنه تعديل المجموعة")
    
    group = await db.groups.find_one({"id": group_id})
    if not group:
        raise HTTPException(status_code=404, detail="المجموعة غير موجودة")
    
    update_data = {}
    if data.name is not None:
        update_data["name"] = data.name
    if data.description is not None:
        update_data["description"] = data.description
    if data.sheikh_ids is not None:
        ids = await _validated_sheikh_ids(None, data.sheikh_ids)
        update_data["sheikh_id"] = ids[0]
        update_data["sheikh_ids"] = ids
    elif data.sheikh_id is not None:
        # Changing only the primary keeps the other sheikhs
        ids = await _validated_sheikh_ids(data.sheikh_id, group_sheikh_ids(group))
        update_data["sheikh_id"] = ids[0]
        update_data["sheikh_ids"] = ids

    if update_data:
        await db.groups.update_one({"id": group_id}, {"$set": update_data})
    
    return {"message": "تم تحديث المجموعة بنجاح"}

@api_router.delete("/groups/{group_id}")
async def delete_group(group_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a group (Admin only)"""
    ensure_role(current_user, "admin", "فقط المدير يمكنه حذف المجموعة")
    
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
    ensure_role(current_user, "admin", "فقط المدير يمكنه إضافة طالب للمجموعة")
    
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
    
    return {"message": "تمت إضافة الطالب للمجموعة بنجاح"}

@api_router.post("/groups/{group_id}/remove-student")
async def remove_student_from_group(group_id: str, request: AddStudentRequest, current_user: dict = Depends(get_current_user)):
    """Remove student from group (Admin only)"""
    student_id = request.student_id
    ensure_role(current_user, "admin", "فقط المدير يمكنه إزالة طالب من المجموعة")
    
    # Update student
    result = await db.users.update_one(
        {"id": student_id, "role": "student", "group_id": group_id},
        {"$set": {"group_id": None}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="الطالب غير موجود في هذه المجموعة")
    
    return {"message": "تمت إزالة الطالب من المجموعة بنجاح"}

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
    ensure_role(current_user, "admin", "غير مصرح لك")
    
    sheikhs = await db.users.find(
        {"role": "sheikh"},
        {"_id": 0, "password_hash": 0}
    ).to_list(100)
    return sheikhs

# ============== INITIAL ASSESSMENT ROUTES ==============

@api_router.post("/students/{student_id}/initial-assessment")
async def submit_initial_assessment(student_id: str, data: InitialAssessment, current_user: dict = Depends(get_current_user)):
    """Submit initial assessment for a new student (Sheikh only)"""
    ensure_role(current_user, "sheikh", "فقط المشرف يمكنه تقييم الطالب")
    
    # Get student
    student = await db.users.find_one({"id": student_id, "role": "student"})
    if not student:
        raise HTTPException(status_code=404, detail="الطالب غير موجود")
    
    # الطالب يجب أن يكون ضمن **أي** من مجموعات المشرف
    # (كان `find_one` بيجيب مجموعة واحدة فقط، فالمشرف صاحب أكثر من مجموعة
    #  ما كان يقدر يقيّم إلا طلاب مجموعة واحدة منها)
    gids = await _sheikh_group_ids(current_user["user_id"])
    if student.get("group_id") not in gids:
        raise HTTPException(status_code=403, detail="الطالب ليس في مجموعتك")
    
    # Validate tajweed level
    valid_levels = ["تلاوة عامة", "تمهيدية", "متوسطة", "متقدمة", "إجازة", "اتقان", "سند غيبي", "روايات أخرى"]
    if data.tajweed_level not in valid_levels:
        raise HTTPException(status_code=400, detail="مستوى التجويد غير صحيح")

    # الاختبارات الإدارية تكون بمضاعفات 5 (عدد الأجزاء/الصفحات المختبَرة)
    if len(data.administrative_test_juz) % 5 != 0:
        raise HTTPException(status_code=400, detail="عدد الأجزاء المختبَرة إدارياً يجب أن يكون من مضاعفات 5 (5، 10، 15، ...)")

    # التحقق أن الأجزاء القوية/الضعيفة/المختبَرة من ضمن الأجزاء المحفوظة (منع تسجيل خاطئ)
    memorized_set = set(data.previous_memorization_juz or [])
    for label, juz_field in (("القوية", data.strong_juz), ("الضعيفة", data.weak_juz),
                             ("المختبَرة إدارياً", data.administrative_test_juz)):
        outside = sorted(set(juz_field or []) - memorized_set)
        if outside:
            raise HTTPException(
                status_code=400,
                detail=f"لا يمكن تسجيل أجزاء {label} خارج الأجزاء المحفوظة: {'، '.join(str(j) for j in outside)}. اختر الأجزاء المحفوظة أولاً."
            )
    # جزء لا يكون قوياً وضعيفاً معاً
    both = sorted(set(data.strong_juz or []) & set(data.weak_juz or []))
    if both:
        raise HTTPException(
            status_code=400,
            detail=f"الأجزاء التالية مسجّلة قوية وضعيفة معاً: {'، '.join(str(j) for j in both)}. اختر واحدة فقط."
        )

    # المسابقات: لا تُسجَّل أجزاء لمسابقة غير مُحدَّدة، ولا تُترك مُحدَّدة بلا أجزاء
    annual_juz = sorted(set(data.annual_competition_juz or [])) if data.annual_competition else []
    young_juz = sorted(set(data.young_hafiz_juz or [])) if data.young_hafiz else []
    for flag, juz, label in ((data.annual_competition, annual_juz, "المسابقة السنوية"),
                             (data.young_hafiz, young_juz, "الحافظ الصغير")):
        if flag and not juz:
            raise HTTPException(status_code=400, detail=f"حدّد الأجزاء التي شارك فيها الطالب في {label}")
        for j in juz:
            if not 1 <= j <= 30:
                raise HTTPException(status_code=400, detail=f"رقم جزء غير صحيح في {label}: {j}")

    now_iso = datetime.now(timezone.utc).isoformat()
    active_term_id = await get_active_term_id()
    prev_count = student.get("assessment_count") or 0

    # Update student with the latest assessment snapshot
    update_data = {
        "previous_memorization_juz": data.previous_memorization_juz,
        "previous_memorization_pages": data.previous_memorization_pages,
        "tajweed_level": data.tajweed_level,
        "weak_juz": data.weak_juz,
        "strong_juz": data.strong_juz,
        "administrative_test_juz": data.administrative_test_juz,
        "annual_competition": bool(data.annual_competition),
        "annual_competition_juz": annual_juz,
        "young_hafiz": bool(data.young_hafiz),
        "young_hafiz_juz": young_juz,
        "initial_assessment_done": True,
        "last_assessment_date": now_iso,
        "assessment_count": prev_count + 1
    }

    await db.users.update_one({"id": student_id}, {"$set": update_data})

    # Keep a dated history record of every assessment (re-evaluation timeline)
    assessment_record = {
        "id": str(uuid.uuid4()),
        "student_id": student_id,
        "student_name": student.get("name"),
        "sheikh_id": current_user["user_id"],
        "term_id": active_term_id,
        "date": now_iso,
        "previous_memorization_juz": data.previous_memorization_juz,
        "previous_memorization_pages": data.previous_memorization_pages,
        "tajweed_level": data.tajweed_level,
        "weak_juz": data.weak_juz,
        "strong_juz": data.strong_juz,
        "administrative_test_juz": data.administrative_test_juz,
        "annual_competition": bool(data.annual_competition),
        "annual_competition_juz": annual_juz,
        "young_hafiz": bool(data.young_hafiz),
        "young_hafiz_juz": young_juz,
        "notes": data.notes,
        "is_reassessment": prev_count > 0
    }
    await db.assessments.insert_one(assessment_record)
    
    # Calculate total pages from previous memorization
    # كل جزء 20 صفحة ما عدا جزء عمّ = 24 — والأجزاء المحفوظة تشمل القوية والضعيفة (#3)
    memorized_prev = memorized_juz_union(data.previous_memorization_juz, data.strong_juz, data.weak_juz)
    total_previous_pages = pages_for_juz_list(memorized_prev) + data.previous_memorization_pages
    
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
    
    # Previous memorization (from initial assessment) — يشمل القوية والضعيفة (#3)
    previous_juz = sorted(student_memorized_prev_juz(student))
    previous_pages = student.get("previous_memorization_pages") or 0
    previous_total_pages = pages_for_juz_list(previous_juz) + previous_pages
    
    # New memorization (from recitations) — كل التسميعات (بما فيها "combined") عدا "لم يسمّع"  (#8)
    recitations = await db.recitations.find(
        {"student_id": student_id, "did_not_recite": {"$ne": True}},
        {"_id": 0}
    ).to_list(100000)

    new_total_pages = sum(_new_pages_of(rec) for rec in recitations)
    review_total_pages = sum(rec.get("review_pages", 0) or 0 for rec in recitations)

    # Calculate total progress
    total_pages = previous_total_pages + new_total_pages
    total_juz = total_pages // 20
    remaining_pages = total_pages % 20
    
    # Calculate percentage of Quran (604 pages total = 29 juz * 20 + جزء عمّ 24)
    progress_percentage = round((total_pages / TOTAL_QURAN_PAGES) * 100, 1)
    
    return {
        "student_name": student.get("name"),
        "tajweed_level": student.get("tajweed_level"),
        "initial_assessment_done": student.get("initial_assessment_done", False),
        "weak_juz": student.get("weak_juz") or [],
        "strong_juz": student.get("strong_juz") or [],
        "administrative_test_juz": student.get("administrative_test_juz") or [],
        "annual_competition": bool(student.get("annual_competition")),
        "annual_competition_juz": student.get("annual_competition_juz") or [],
        "young_hafiz": bool(student.get("young_hafiz")),
        "young_hafiz_juz": student.get("young_hafiz_juz") or [],
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
        "review": {
            "total_pages": review_total_pages
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
    ensure_role(current_user, "sheikh", "غير مصرح لك")
    
    # Get sheikh's groups
    group_ids = await _sheikh_group_ids(current_user["user_id"])
    if not group_ids:
        return []

    # Get students without initial assessment
    students = await db.users.find(
        {
            "group_id": {"$in": group_ids},
            "role": "student",
            "initial_assessment_done": {"$ne": True}
        },
        {"_id": 0, "password_hash": 0}
    ).to_list(100)

    return students

@api_router.get("/students/{student_id}/assessments")
async def get_student_assessments(student_id: str, current_user: dict = Depends(get_current_user)):
    """Get the full assessment history (timeline) of a student.
    Accessible by the student themselves, sheikhs, and admins."""
    if current_user["role"] == "student" and current_user["user_id"] != student_id:
        raise HTTPException(status_code=403, detail="غير مصرح لك")

    assessments = await db.assessments.find(
        {"student_id": student_id},
        {"_id": 0}
    ).sort("date", -1).to_list(200)

    return assessments

# ============== POINTS CONFIG (F2 - مصدر واحد لقيم النقاط) ==============
# المصدر الوحيد لقيم النقاط في النظام. أي منطق يمنح نقاطًا يجب أن يقرأ من هنا،
# وواجهة "نظام النقاط" في لوحة المدير تعرض هذه القيم عبر /api/config/points.
ATTENDANCE_POINTS = 10          # نقاط كل يوم حضور
RECITATION_PASS_POINTS = 20     # نقاط كل تسميع ناجح (اجتاز الحد الأدنى)
TRACKING_PRAYERS_MAX = 35       # الحد الأقصى لنقاط الصلوات في ورقة المتابعة
TRACKING_SITTING_MAX = 35       # الحد الأقصى لنقاط الجلوس مع القرآن
SITTING_DAYS_MAX = 7            # الجلوس مع القرآن يُسجَّل بالأيام (0-7)، وكل يوم = TRACKING_SITTING_MAX / 7 نقطة
TRACKING_BASE_MAX = TRACKING_PRAYERS_MAX + TRACKING_SITTING_MAX  # 70 - الأساس الأسبوعي لورقة المتابعة
WEEKLY_TRACKING_MAX = TRACKING_BASE_MAX  # الإجمالي الأسبوعي الأساسي لورقة المتابعة (قبل بنود المشرف المخصصة)


@api_router.get("/config/points")
async def get_points_config(current_user: dict = Depends(get_current_user)):
    """قيم نظام النقاط من مصدر واحد (F2) — تستهلكها لوحة المدير وأي تحليلات لاحقة."""
    return {
        "attendance_points": ATTENDANCE_POINTS,
        "recitation_pass_points": RECITATION_PASS_POINTS,
        "tracking_prayers_max": TRACKING_PRAYERS_MAX,
        "tracking_sitting_max": TRACKING_SITTING_MAX,
        "tracking_base_max": TRACKING_BASE_MAX,
        "weekly_tracking_max": WEEKLY_TRACKING_MAX,
    }


# N2 - لوحة تعديل النقاط والقواعد: تعديل قيم F2 وحفظها دون تغيير الكود
def apply_points_config(cfg: dict):
    """يطبّق قيم النقاط على متغيّرات F2 (تُقرأ عند كل عملية) ويعيد حساب المشتقّات."""
    global ATTENDANCE_POINTS, RECITATION_PASS_POINTS, TRACKING_PRAYERS_MAX
    global TRACKING_SITTING_MAX, TRACKING_BASE_MAX, WEEKLY_TRACKING_MAX
    if cfg.get("attendance_points") is not None:
        ATTENDANCE_POINTS = int(cfg["attendance_points"])
    if cfg.get("recitation_pass_points") is not None:
        RECITATION_PASS_POINTS = int(cfg["recitation_pass_points"])
    if cfg.get("tracking_prayers_max") is not None:
        TRACKING_PRAYERS_MAX = int(cfg["tracking_prayers_max"])
    if cfg.get("tracking_sitting_max") is not None:
        TRACKING_SITTING_MAX = int(cfg["tracking_sitting_max"])
    TRACKING_BASE_MAX = TRACKING_PRAYERS_MAX + TRACKING_SITTING_MAX
    WEEKLY_TRACKING_MAX = TRACKING_BASE_MAX


def sitting_days(value) -> int:
    """عدد أيام الجلوس مع القرآن (0-7)."""
    return min(max(int(value or 0), 0), SITTING_DAYS_MAX)


def sitting_points(days) -> int:
    """نقاط الجلوس مع القرآن من عدد الأيام: 7 أيام = TRACKING_SITTING_MAX."""
    return round(sitting_days(days) * TRACKING_SITTING_MAX / SITTING_DAYS_MAX)


@app.on_event("startup")
async def _load_points_config():
    """تحميل قيم النقاط المخصّصة من قاعدة البيانات عند الإقلاع (N2)."""
    try:
        doc = await db.settings.find_one({"key": "points_config"}, {"_id": 0})
        if doc and doc.get("value"):
            apply_points_config(doc["value"])
    except Exception as e:
        logger.error(f"load points config failed: {e}")


# فهارس قاعدة البيانات — أهم إصلاح للأداء: بدونها كل استعلام يمسح المجموعة كاملةً (full scan).
# لا يغيّر أي وظيفة؛ فقط يسرّع القراءات. آمن للتكرار (create_index لا يعيد الإنشاء إن وُجد).
DB_INDEXES = {
    "users": [[("id", 1)], [("email", 1)], [("role", 1)], [("group_id", 1)], [("role", 1), ("last_seen", 1)],
              [("role", 1), ("group_id", 1)], [("is_activated", 1)]],
    "recitations": [[("student_id", 1)], [("sheikh_id", 1)], [("term_id", 1)],
                    [("student_id", 1), ("record_date", -1)],
                    [("student_id", 1), ("did_not_recite", 1)]],
    "recitations_archives": [[("student_id", 1)], [("term_id", 1)]],
    "attendance": [[("student_id", 1)], [("term_id", 1)], [("group_id", 1)],
                   [("student_id", 1), ("date", 1)], [("status", 1)]],
    "attendance_archives": [[("student_id", 1)], [("term_id", 1)]],
    "tracking_sheets": [[("student_id", 1)], [("sheikh_id", 1)],
                        [("student_id", 1), ("week_start", 1)]],
    "tracking_sheets_archives": [[("student_id", 1)], [("term_id", 1)]],
    "tracking_items": [[("sheikh_id", 1)], [("is_global", 1)]],
    "student_points": [[("student_id", 1)]],
    "points_transactions": [[("student_id", 1)]],
    "points_adjustments": [[("student_id", 1)], [("student_id", 1), ("type", 1)],
                           [("type", 1), ("active", 1)], [("created_at", -1)]],
    "points_adjustments_archives": [[("student_id", 1)]],
    "groups": [[("id", 1)], [("sheikh_id", 1)], [("sheikh_ids", 1)]],
    "notifications": [[("user_id", 1)], [("user_id", 1), ("created_at", -1)]],
    "terms": [[("id", 1)], [("is_active", 1)]],
    "term_archives": [[("student_id", 1)], [("term_id", 1)]],
    "assessments": [[("student_id", 1)], [("term_id", 1)]],
    "homework": [[("id", 1)]],
    "homework_submissions": [[("homework_id", 1)], [("student_id", 1)]],
    "admin_exams": [[("student_id", 1)]],
    "tajweed_exams": [[("student_id", 1)]],
    "online_exams": [[("id", 1)]],
    "exam_submissions": [[("exam_id", 1)], [("student_id", 1)]],
    "activities": [[("id", 1)]],
    "announcements": [[("id", 1)]],
    "audit_logs": [[("action", 1)], [("created_at", -1)]],
    "warnings": [[("student_id", 1)], [("student_id", 1), ("created_at", -1)]],
    "admin_bonus_grants": [[("student_id", 1)], [("student_id", 1), ("created_at", -1)]],
    "curriculum": [[("id", 1)]],
    "curriculum_entries": [[("curriculum_id", 1)]],
    "schedules": [[("id", 1)], [("is_active", 1)]],
    "schedule_slots": [[("schedule_id", 1)]],
    "registration_codes": [[("code", 1)]],
    "competitions": [[("id", 1)]],
    "weekly_badges": [[("student_id", 1)]],
    "badge_types": [[("id", 1)]],
    "settings": [[("key", 1)]],
    "chat_messages": [[("student_id", 1), ("created_at", 1)], [("sheikh_id", 1)],
                      [("student_id", 1), ("sheikh_id", 1)],
                      [("kind", 1), ("sheikh_id", 1), ("created_at", 1)]],
    "annual_competition": [[("year", 1)], [("student_id", 1)], [("id", 1)]],
    "supervision_records": [[("kind", 1), ("level", 1)], [("id", 1)], [("student_id", 1)]],
    "annual_competition_years": [[("year", 1)]],
    "fees": [[("student_id", 1)], [("year", 1), ("month", 1)],
             [("student_id", 1), ("year", 1), ("month", 1)]],
}


@app.on_event("startup")
async def _ensure_indexes():
    """إنشاء الفهارس عند الإقلاع (يُنفَّذ مرة واحدة فعليًا؛ آمن للتكرار)."""
    for collection, indexes in DB_INDEXES.items():
        for keys in indexes:
            try:
                await db[collection].create_index(keys, background=True)
            except Exception as e:
                logger.warning(f"index {collection}{keys} failed: {e}")
    logger.info("Database indexes ensured.")
    await _backfill_group_sheikh_ids()
    await _migrate_sitting_to_days()
    await _cleanup_irrelevant_student_notifications()


async def _backfill_group_sheikh_ids():
    """المجموعات القديمة لها sheikh_id فقط — نملأ sheikh_ids منه لتعمل استعلامات تعدد المشرفين."""
    try:
        async for g in db.groups.find({"sheikh_ids": {"$exists": False}}, {"_id": 0, "id": 1, "sheikh_id": 1}):
            await db.groups.update_one({"id": g["id"]}, {"$set": {"sheikh_ids": group_sheikh_ids(g)}})
    except Exception as e:
        logger.error(f"backfill group sheikh_ids failed: {e}")


async def _migrate_sitting_to_days():
    """الجلوس مع القرآن كان يُسجَّل بالنقاط (0-35) وصار بالأيام (0-7).
    القيم القديمة الأكبر من 7 تُحوَّل إلى أيام (÷5). نقاط الأوراق المحفوظة لا تتغيّر. آمن للتكرار."""
    try:
        async for s in db.tracking_sheets.find({"data.quran_sitting_days": {"$gt": SITTING_DAYS_MAX}},
                                               {"_id": 0, "id": 1, "data.quran_sitting_days": 1}):
            days = sitting_days(round(int(s["data"]["quran_sitting_days"]) / 5))
            await db.tracking_sheets.update_one({"id": s["id"]}, {"$set": {"data.quran_sitting_days": days}})
    except Exception as e:
        logger.error(f"migrate sitting to days failed: {e}")


# عناوين إشعارات إدارية لا تخصّ الطالب — تُحذف من صناديق الطلاب
IRRELEVANT_STUDENT_NOTIFICATION_TITLES = [
    "بداية فصل دراسي جديد",
    "بداية فصل جديد",
    "إنشاء فصل جديد",
]


async def _cleanup_irrelevant_student_notifications():
    """حذف الإشعارات الإدارية القديمة (بداية/إنشاء فصل) من صناديق الطلاب.
    آمن للتكرار — بعد أول تشغيل ما بيضل إشي يُحذف."""
    try:
        student_ids = [s["id"] for s in await db.users.find(
            {"role": "student"}, {"_id": 0, "id": 1}
        ).to_list(100000)]
        if not student_ids:
            return
        result = await db.notifications.delete_many({
            "user_id": {"$in": student_ids},
            "title": {"$in": IRRELEVANT_STUDENT_NOTIFICATION_TITLES},
        })
        if result.deleted_count:
            logger.info(f"Removed {result.deleted_count} irrelevant student notifications.")
    except Exception as e:
        logger.warning(f"notification cleanup failed: {e}")


class PointsConfigUpdate(BaseModel):
    attendance_points: Optional[int] = None
    recitation_pass_points: Optional[int] = None
    tracking_prayers_max: Optional[int] = None
    tracking_sitting_max: Optional[int] = None


@api_router.put("/admin/config/points")
async def update_points_config(data: PointsConfigUpdate, current_user: dict = Depends(get_current_user)):
    """N2 — تعديل قيم نظام النقاط وحفظها (المدير)."""
    ensure_role(current_user, "admin", "فقط المدير يمكنه تعديل نظام النقاط")
    cfg = {k: v for k, v in data.model_dump().items() if v is not None}
    for k, v in cfg.items():
        if v < 0:
            raise HTTPException(status_code=400, detail="القيم يجب أن تكون صفرًا أو أكثر")
    apply_points_config(cfg)
    # القيم الفعّالة الكاملة بعد التطبيق
    effective = {
        "attendance_points": ATTENDANCE_POINTS,
        "recitation_pass_points": RECITATION_PASS_POINTS,
        "tracking_prayers_max": TRACKING_PRAYERS_MAX,
        "tracking_sitting_max": TRACKING_SITTING_MAX,
    }
    await db.settings.update_one({"key": "points_config"}, {"$set": {"value": effective}}, upsert=True)
    return {"message": "تم تحديث نظام النقاط", "config": {**effective,
            "tracking_base_max": TRACKING_BASE_MAX, "weekly_tracking_max": WEEKLY_TRACKING_MAX}}


@api_router.get("/analytics/timeseries")
async def analytics_timeseries(term_id: Optional[str] = None, group_id: Optional[str] = None,
                               current_user: dict = Depends(get_current_user)):
    """F4 — سلسلة زمنية أسبوعية موحّدة (حضور/تسميع/صفحات/نقاط) للمدير والمشرف.
    أساس رسوم المرحلة الأولى (A1/A3). المشرف يقتصر على مجموعاته."""
    ensure_role(current_user, ["admin", "sheikh"], "غير مصرح لك بعرض التحليلات")
    # T1: المشرف مقصور على مجموعاته (لا يرى بيانات المركز كاملةً)
    if current_user["role"] == "sheikh":
        gids = await _sheikh_group_ids(current_user["user_id"])
        if group_id:
            if group_id not in gids:
                raise HTTPException(status_code=403, detail="لا يمكنك عرض تحليلات مجموعة ليست لك")
            return await build_center_timeseries(db, term_id=term_id, group_ids=[group_id], attendance_points=ATTENDANCE_POINTS)
        return await build_center_timeseries(db, term_id=term_id, group_ids=gids, attendance_points=ATTENDANCE_POINTS)
    return await build_center_timeseries(
        db, term_id=term_id, group_id=group_id, attendance_points=ATTENDANCE_POINTS
    )


# ============== A4 - تقرير الطلاب المتعثّرين ==============
STRUGGLING_DEFAULT_DAYS = 2  # المدة الافتراضية قبل اعتبار الطالب متعثّرًا في التسميع

# أقسام التعثّر ومقاييسها الافتراضية (المدير يقدر يعدّلها من الإعدادات)
STRUGGLING_CRITERIA_DEFAULTS = {
    "recitation_days": STRUGGLING_DEFAULT_DAYS,  # متعثّر إن مرّ هذا العدد من الأيام بلا تسميع
    "prayers_min": 25,        # الحد الأدنى لعدد الصلوات في ورق المتابعة خلال المدة
    "sitting_min": 20,        # الحد الأدنى لأيام الجلوس مع القرآن خلال المدة
    "attendance_min_rate": 70,  # الحد الأدنى لنسبة الحضور % خلال المدة
}

STRUGGLING_CATEGORIES = ("recitation", "prayers", "sitting", "attendance", "all")

STRUGGLING_CATEGORY_LABELS = {
    "recitation": "التسميع",
    "prayers": "الصلوات",
    "sitting": "الجلوس مع القرآن",
    "attendance": "الحضور",
}


async def get_struggling_criteria() -> dict:
    """مقاييس التعثّر من الإعدادات مع قيم افتراضية آمنة."""
    doc = await db.settings.find_one({"key": "struggling_criteria"}, {"_id": 0}) or {}
    out = {}
    for k, default in STRUGGLING_CRITERIA_DEFAULTS.items():
        try:
            val = int(doc.get(k, default))
        except (TypeError, ValueError):
            val = default
        out[k] = max(0, val)
    # نسبة الحضور لا تتجاوز 100
    out["attendance_min_rate"] = min(out["attendance_min_rate"], 100)
    return out


class StrugglingCriteriaUpdate(BaseModel):
    recitation_days: Optional[int] = None
    prayers_min: Optional[int] = None
    sitting_min: Optional[int] = None
    attendance_min_rate: Optional[int] = None


@api_router.get("/settings/struggling-criteria")
async def get_struggling_criteria_settings(current_user: dict = Depends(get_current_user)):
    """مقاييس تحديد الطالب المتعثّر في كل قسم."""
    ensure_role(current_user, ["admin", "sheikh"], "غير مصرح لك")
    return await get_struggling_criteria()


@api_router.put("/settings/struggling-criteria")
async def update_struggling_criteria_settings(data: StrugglingCriteriaUpdate,
                                              current_user: dict = Depends(get_current_user)):
    """تعديل مقاييس التعثّر (المدير فقط)."""
    ensure_role(current_user, "admin", "فقط المدير يمكنه تعديل مقاييس التعثّر")

    update = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if data.recitation_days is not None:
        if not 1 <= data.recitation_days <= 365:
            raise HTTPException(status_code=400, detail="مدة انقطاع التسميع يجب أن تكون بين 1 و 365 يوم")
        update["recitation_days"] = int(data.recitation_days)
    if data.prayers_min is not None:
        if not 0 <= data.prayers_min <= 1000:
            raise HTTPException(status_code=400, detail="حد الصلوات يجب أن يكون بين 0 و 1000")
        update["prayers_min"] = int(data.prayers_min)
    if data.sitting_min is not None:
        if not 0 <= data.sitting_min <= 1000:
            raise HTTPException(status_code=400, detail="حد الجلوس مع القرآن يجب أن يكون بين 0 و 1000")
        update["sitting_min"] = int(data.sitting_min)
    if data.attendance_min_rate is not None:
        if not 0 <= data.attendance_min_rate <= 100:
            raise HTTPException(status_code=400, detail="نسبة الحضور يجب أن تكون بين 0 و 100")
        update["attendance_min_rate"] = int(data.attendance_min_rate)

    await db.settings.update_one({"key": "struggling_criteria"}, {"$set": update}, upsert=True)
    return {"message": "تم تحديث مقاييس التعثّر", "criteria": await get_struggling_criteria()}


async def _sheikh_group_ids(sheikh_id):
    groups = await db.groups.find({"sheikh_ids": sheikh_id}, {"_id": 0, "id": 1}).to_list(1000)
    return [g["id"] for g in groups]


@api_router.get("/reports/struggling-students")
async def struggling_students_report(days: Optional[int] = None, group_id: Optional[str] = None,
                                     term_id: Optional[str] = None,
                                     category: str = "recitation",
                                     period: str = "week",
                                     current_user: dict = Depends(get_current_user)):
    """A4 — الطلاب المتعثّرون حسب القسم المطلوب.
    category: recitation | prayers | sitting | attendance | all
    period: week | month | term — مدى قياس الصلوات/الجلوس/الحضور (التسميع دائمًا بالأيام).
    المدير يرى الجميع، والمشرف مجموعاته فقط."""
    ensure_role(current_user, ["admin", "sheikh"], "غير مصرح لك بعرض هذا التقرير")

    if category not in STRUGGLING_CATEGORIES:
        category = "recitation"
    if period not in ("week", "month", "term"):
        period = "week"

    criteria = await get_struggling_criteria()

    user_query = {"role": "student"}
    if current_user["role"] == "sheikh":
        gids = await _sheikh_group_ids(current_user["user_id"])
        if group_id and group_id in gids:
            user_query["group_id"] = group_id
        else:
            user_query["group_id"] = {"$in": gids}
    elif group_id:
        user_query["group_id"] = group_id

    students = await db.users.find(
        user_query, {"_id": 0, "id": 1, "name": 1, "group_id": 1}
    ).to_list(5000)
    sids = [s["id"] for s in students]

    # أسماء المجموعات ومدد التنبيه (دفعة واحدة — بدون N+1)
    groups = await db.groups.find({}, {"_id": 0, "id": 1, "name": 1, "recitation_alert_days": 1}).to_list(3000)
    group_info = {g["id"]: {"name": g["name"], "days": g.get("recitation_alert_days") or criteria["recitation_days"]}
                  for g in groups}

    today = datetime.now(timezone.utc).date()
    p_from, p_to = _tracking_period_bounds(period)

    # ── آخر تسميع لكل طالب ──
    rq = {"student_id": {"$in": sids}, "did_not_recite": {"$ne": True}}
    if term_id:
        rq["term_id"] = term_id
    recs = await db.recitations.find(rq, {"_id": 0, "student_id": 1, "record_date": 1}).to_list(200000)
    last_rec = {}
    for r in recs:
        rd = r.get("record_date") or ""
        if rd > last_rec.get(r["student_id"], ""):
            last_rec[r["student_id"]] = rd

    # ── ورق المتابعة ضمن المدة (صلوات + جلوس) ──
    sheets = await db.tracking_sheets.find(
        {"student_id": {"$in": sids}}, {"_id": 0, "student_id": 1, "week_start": 1, "data": 1}
    ).to_list(200000)
    prayers_by, sitting_by, sheets_by = {}, {}, {}
    for sh in sheets:
        ws = sh.get("week_start") or ""
        if p_from and not (p_from <= ws <= p_to):
            continue
        sid = sh["student_id"]
        pr, si = _sheet_prayers_sitting(sh)
        prayers_by[sid] = prayers_by.get(sid, 0) + pr
        sitting_by[sid] = sitting_by.get(sid, 0) + si
        sheets_by[sid] = sheets_by.get(sid, 0) + 1

    # ── الحضور ضمن المدة ──
    aq = {"student_id": {"$in": sids}}
    if p_from:
        aq["date"] = {"$gte": p_from, "$lte": p_to}
    elif term_id:
        aq["term_id"] = term_id
    atts = await db.attendance.find(aq, {"_id": 0, "student_id": 1, "status": 1}).to_list(200000)
    att_present, att_total = {}, {}
    for a in atts:
        sid = a["student_id"]
        att_total[sid] = att_total.get(sid, 0) + 1
        if a.get("status") == "present":
            att_present[sid] = att_present.get(sid, 0) + 1

    results = []
    for s in students:
        sid = s["id"]
        gid = s.get("group_id")
        ginfo = group_info.get(gid, {"name": "بدون مجموعة", "days": criteria["recitation_days"]})
        rec_threshold = days if days is not None else ginfo["days"]

        # التسميع: كم يوم مرّ بلا تسميع
        last_date = last_rec.get(sid) or None
        days_since = None
        if last_date:
            try:
                days_since = (today - datetime.strptime(str(last_date)[:10], "%Y-%m-%d").date()).days
            except (ValueError, TypeError):
                last_date, days_since = None, None

        prayers = prayers_by.get(sid, 0)
        sitting = sitting_by.get(sid, 0)
        present = att_present.get(sid, 0)
        total_att = att_total.get(sid, 0)
        att_rate = round(present / total_att * 100, 1) if total_att else 0.0

        # فحص كل قسم
        fails = {
            "recitation": days_since is None or days_since >= rec_threshold,
            "prayers": prayers < criteria["prayers_min"],
            "sitting": sitting < criteria["sitting_min"],
            "attendance": att_rate < criteria["attendance_min_rate"],
        }

        if category == "all":
            # متعثّر في كل شيء = فاشل في الأقسام الأربعة
            matched = all(fails.values())
        else:
            matched = fails[category]
        if not matched:
            continue

        reasons = [STRUGGLING_CATEGORY_LABELS[k] for k, v in fails.items() if v]
        results.append({
            "student_id": sid,
            "name": s["name"],
            "group_id": gid,
            "group_name": ginfo["name"],
            # التسميع
            "last_recitation": last_date,
            "days_since": days_since,
            "threshold": rec_threshold,
            # ورق المتابعة والحضور ضمن المدة
            "prayers": prayers,
            "sitting": sitting,
            "sheets_count": sheets_by.get(sid, 0),
            "attendance_rate": att_rate,
            "attendance_present": present,
            "attendance_total": total_att,
            # ملخّص
            "failed_categories": [k for k, v in fails.items() if v],
            "reasons": reasons,
            "failed_count": sum(1 for v in fails.values() if v),
        })

    # الترتيب: حسب القسم المطلوب (الأسوأ أولًا)
    if category == "recitation":
        results.sort(key=lambda r: (10 ** 9 if r["days_since"] is None else r["days_since"]), reverse=True)
    elif category == "prayers":
        results.sort(key=lambda r: r["prayers"])
    elif category == "sitting":
        results.sort(key=lambda r: r["sitting"])
    elif category == "attendance":
        results.sort(key=lambda r: r["attendance_rate"])
    else:  # all — الأكثر تعثّرًا ثم الأطول انقطاعًا
        results.sort(key=lambda r: (r["failed_count"],
                                    10 ** 9 if r["days_since"] is None else r["days_since"]), reverse=True)

    return {
        "default_days": STRUGGLING_DEFAULT_DAYS,
        "criteria": criteria,
        "category": category,
        "period": period,
        "period_label": TRACKING_PERIOD_LABELS.get(period, period),
        "count": len(results),
        "students": results,
    }


@api_router.get("/reports/struggling-students/summary")
async def struggling_students_summary(group_id: Optional[str] = None, period: str = "week",
                                      current_user: dict = Depends(get_current_user)):
    """عدد المتعثّرين في كل قسم — لعرض التبويبات بأعدادها."""
    ensure_role(current_user, ["admin", "sheikh"], "غير مصرح لك")
    counts = {}
    for cat in STRUGGLING_CATEGORIES:
        rep = await struggling_students_report(
            group_id=group_id, category=cat, period=period, current_user=current_user
        )
        counts[cat] = rep["count"]
    return {"period": period, "counts": counts, "criteria": await get_struggling_criteria()}


class GroupAlertDays(BaseModel):
    days: int


@api_router.put("/groups/{group_id}/alert-days")
async def set_group_alert_days(group_id: str, data: GroupAlertDays,
                               current_user: dict = Depends(get_current_user)):
    """A4 — تعديل مدة تنبيه الانقطاع لمجموعة. المشرف لمجموعاته فقط، والمدير لأي مجموعة."""
    ensure_role(current_user, ["admin", "sheikh"], "غير مصرح لك")
    if data.days < 1:
        raise HTTPException(status_code=400, detail="المدة يجب أن تكون يومًا واحدًا على الأقل")
    group = await db.groups.find_one({"id": group_id}, {"_id": 0})
    if not group:
        raise HTTPException(status_code=404, detail="المجموعة غير موجودة")
    if current_user["role"] == "sheikh" and current_user["user_id"] not in group_sheikh_ids(group):
        raise HTTPException(status_code=403, detail="لا يمكنك تعديل مجموعة ليست لك")
    await db.groups.update_one({"id": group_id}, {"$set": {"recitation_alert_days": data.days}})
    return {"message": f"تم ضبط مدة التنبيه على {data.days} يوم"}


class StrugglingAlertRequest(BaseModel):
    student_ids: List[str]
    message: Optional[str] = None
    category: Optional[str] = None  # recitation | prayers | sitting | attendance | all


# نص التنبيه الافتراضي لكل قسم من أقسام التعثّر
STRUGGLING_ALERT_TEXTS = {
    "recitation": ("تنبيه: انقطاع عن التسميع",
                   "لم يُسجَّل لك تسميع منذ عدة أيام. يرجى الحضور والتسميع لمشرفك."),
    "prayers": ("تنبيه: تقصير في الصلوات",
                "عدد الصلوات المسجّلة في ورقة متابعتك أقل من المطلوب. حافظ على صلواتك."),
    "sitting": ("تنبيه: الجلوس مع القرآن",
                "أيام الجلوس مع القرآن أقل من المطلوب. خصّص وقتًا يوميًا لكتاب الله."),
    "attendance": ("تنبيه: ضعف الحضور",
                   "نسبة حضورك أقل من الحد المطلوب. يرجى الالتزام بالحضور."),
    "all": ("تنبيه: تعثّر عام",
            "لاحظنا تراجعًا في التسميع والصلوات والجلوس مع القرآن والحضور. يرجى المتابعة مع مشرفك."),
}


@api_router.post("/reports/struggling-students/alert")
async def send_struggling_alerts(data: StrugglingAlertRequest,
                                 current_user: dict = Depends(get_current_user)):
    """A4 — إرسال تنبيه للطلاب المتعثّرين (نص افتراضي حسب قسم التعثّر)."""
    ensure_role(current_user, ["admin", "sheikh"], "غير مصرح لك بإرسال التنبيهات")
    allowed = None
    if current_user["role"] == "sheikh":
        gids = await _sheikh_group_ids(current_user["user_id"])
        allowed_docs = await db.users.find(
            {"role": "student", "group_id": {"$in": gids}}, {"_id": 0, "id": 1}
        ).to_list(3000)
        allowed = {d["id"] for d in allowed_docs}

    cat = data.category if data.category in STRUGGLING_ALERT_TEXTS else "recitation"
    title, default_body = STRUGGLING_ALERT_TEXTS[cat]

    sent = 0
    for sid in data.student_ids:
        if allowed is not None and sid not in allowed:
            continue
        await create_notification_internal(
            sid,
            title,
            data.message or default_body,
            "warning",
        )
        sent += 1
    return {"message": f"تم إرسال {sent} تنبيه", "count": sent}


# ============== المشرفون المتأخرون في تسجيل الحضور ==============
LATE_ATTENDANCE_DEFAULT_DAYS = 2


@api_router.get("/reports/late-sheikhs")
async def late_sheikhs_report(days: int = LATE_ATTENDANCE_DEFAULT_DAYS,
                              current_user: dict = Depends(get_current_user)):
    """المشرفون اللي ما سجّلوا حضور لطلابهم من (days) يوم أو أكثر (المدير فقط)."""
    ensure_role(current_user, "admin", "فقط المدير يمكنه عرض هذا التقرير")
    days = max(1, min(365, days))

    sheikhs = await db.users.find({"role": "sheikh"}, {"_id": 0, "id": 1, "name": 1, "email": 1}).to_list(500)
    groups = await db.groups.find({}, {"_id": 0, "id": 1, "name": 1, "sheikh_id": 1, "sheikh_ids": 1}).to_list(3000)
    students = await db.users.find({"role": "student"}, {"_id": 0, "id": 1, "group_id": 1}).to_list(5000)

    group_sheikh = {g["id"]: g.get("sheikh_id") for g in groups}
    student_sheikh = {s["id"]: group_sheikh.get(s.get("group_id")) for s in students}

    # آخر تاريخ حضور مسجَّل لكل مشرف (عبر طلابه)
    atts = await db.attendance.find({}, {"_id": 0, "student_id": 1, "date": 1}).to_list(200000)
    last_by_sheikh = {}
    for a in atts:
        shid = student_sheikh.get(a["student_id"])
        if not shid:
            continue
        d = a.get("date") or ""
        if d > last_by_sheikh.get(shid, ""):
            last_by_sheikh[shid] = d

    today = datetime.now(timezone.utc).date()
    rows = []
    for sh in sheikhs:
        sh_groups = [g for g in groups if sh["id"] in group_sheikh_ids(g)]
        sh_group_ids = {g["id"] for g in sh_groups}
        students_count = sum(1 for s in students if s.get("group_id") in sh_group_ids)
        last_date = last_by_sheikh.get(sh["id"]) or None

        days_since = None
        if last_date:
            try:
                days_since = (today - datetime.strptime(str(last_date)[:10], "%Y-%m-%d").date()).days
            except (ValueError, TypeError):
                last_date, days_since = None, None

        # المشرف بلا طلاب ما بينحسب متأخّر
        if students_count == 0:
            continue
        if days_since is not None and days_since < days:
            continue

        rows.append({
            "sheikh_id": sh["id"],
            "sheikh_name": sh["name"],
            "email": sh.get("email", ""),
            "groups": [g["name"] for g in sh_groups],
            "students_count": students_count,
            "last_attendance": last_date,
            "days_since": days_since,
        })

    rows.sort(key=lambda r: (10 ** 9 if r["days_since"] is None else r["days_since"]), reverse=True)
    return {"days": days, "count": len(rows), "sheikhs": rows}


class LateSheikhAlertRequest(BaseModel):
    sheikh_ids: List[str]
    message: Optional[str] = None


@api_router.post("/reports/late-sheikhs/alert")
async def alert_late_sheikhs(data: LateSheikhAlertRequest,
                             current_user: dict = Depends(get_current_user)):
    """إرسال تنبيه للمشرفين المتأخرين في تسجيل الحضور (المدير فقط)."""
    ensure_role(current_user, "admin", "فقط المدير يمكنه إرسال هذا التنبيه")
    sent = 0
    for shid in data.sheikh_ids:
        await create_notification_internal(
            shid,
            "تنبيه: تأخّر في تسجيل الحضور",
            data.message or "لم يُسجَّل حضور لطلابك منذ عدة أيام. يرجى تسجيل الحضور في أقرب وقت.",
            "warning",
        )
        sent += 1
    await log_admin_action(current_user, "alert", "sheikh", None, None,
                           f"تنبيه تأخّر تسجيل الحضور لـ {sent} مشرف")
    return {"message": f"تم إرسال {sent} تنبيه", "count": sent}


# ============== A8 - تحليل مرشّحي المسابقات القرآنية ==============
# المدير يعرّف مسابقة بمعايير قابلة للتخصيص (حدود + أوزان)، والنظام يرتّب المرشّحين
# بنسبة تطابق لكل طالب مع تفصيل "لماذا هذا الطالب".

class CompetitionCreate(BaseModel):
    name: str
    type: str = "custom"          # young_hafiz | annual | custom
    category: Optional[str] = None  # للمسابقة السنوية: مثل "5 أجزاء"
    criteria: Dict[str, Any] = {}   # {age|memorized|weak|accuracy|attendance|points|tests: {enabled, required, weight, ...}}


CRITERION_LABELS = {
    "age": "الفئة العمرية",
    "memorized": "الأجزاء المحفوظة",
    "weak": "الأجزاء الضعيفة",
    "accuracy": "دقة التسميع",
    "attendance": "نسبة الحضور",
    "points": "مجموع النقاط",
    "tests": "اجتياز الاختبارات",
}


def _age_from_birthdate(bd):
    if not bd:
        return None
    try:
        d = datetime.strptime(str(bd)[:10], "%Y-%m-%d").date()
    except (ValueError, TypeError):
        return None
    today = datetime.now(timezone.utc).date()
    return today.year - d.year - ((today.month, today.day) < (d.month, d.day))


def memorized_juz_union(*juz_lists):
    """#3 — مجموعة الأجزاء المحفوظة = اتحاد (الحفظ السابق + القوية + الضعيفة).
    أي جزء يُسجَّل قوياً أو ضعيفاً يُحتسب ضمن الأجزاء المحفوظة."""
    result = set()
    for lst in juz_lists:
        for j in (lst or []):
            result.add(j)
    return result


def student_memorized_prev_juz(student):
    """أجزاء الحفظ السابق للطالب متضمّنةً القوية والضعيفة (#3)."""
    return memorized_juz_union(
        student.get("previous_memorization_juz"),
        student.get("strong_juz"),
        student.get("weak_juz"),
    )


def compute_student_metrics(student, recitations, attendance, points):
    """يحسب مقاييس الطالب المستخدمة في معايير المسابقة."""
    prev_juz = student_memorized_prev_juz(student)
    prev_pages = student.get("previous_memorization_pages") or 0
    previous_total = pages_for_juz_list(prev_juz) + prev_pages

    new_pages = 0
    errors, err_count = 0, 0
    for r in recitations:
        if r.get("did_not_recite"):
            continue
        np_ = r.get("new_pages") or 0
        if not np_ and r.get("recitation_type") == "new_memorization":
            np_ = r.get("pages_count") or 0
        new_pages += np_ or 0
        ec = r.get("error_count")
        if ec is not None:
            errors += ec
            err_count += 1

    memorized_pages = previous_total + new_pages
    memorized_juz = round(memorized_pages / PAGES_PER_JUZ, 1)
    avg_errors = round(errors / err_count, 2) if err_count else None

    present = sum(1 for a in attendance if a.get("status") == "present")
    total_att = len(attendance)
    attendance_rate = round(present / total_att * 100, 1) if total_att else 0.0

    weak_count = len(student.get("weak_juz") or [])
    tests_passed = bool(student.get("administrative_test_juz"))

    return {
        "age": _age_from_birthdate(student.get("birth_date")),
        "memorized_juz": memorized_juz,
        "memorized_pages": memorized_pages,
        "weak_count": weak_count,
        "avg_errors": avg_errors,
        "attendance_rate": attendance_rate,
        "points": points or 0,
        "tests_passed": tests_passed,
    }


def score_student(criteria, m):
    """يرجع (match%, eligible, breakdown) وفق معايير المسابقة."""
    total_w = 0.0
    earned = 0.0
    eligible = True
    breakdown = []

    def add(key, sub, value, target, cfg):
        nonlocal total_w, earned, eligible
        w = float(cfg.get("weight", 1) or 0)
        if w <= 0:
            w = 1.0
        sub = max(0.0, min(1.0, sub))
        total_w += w
        earned += w * sub
        met = sub >= 0.999
        if cfg.get("required") and not met:
            eligible = False
        breakdown.append({
            "key": key, "label": CRITERION_LABELS.get(key, key),
            "value": value, "target": target, "met": met,
            "weight": w, "sub": round(sub, 2),
        })

    c = criteria.get("age")
    if c and c.get("enabled"):
        age = m["age"]
        lo, hi = c.get("min_age"), c.get("max_age")
        ok = age is not None and (lo is None or age >= lo) and (hi is None or age <= hi)
        add("age", 1.0 if ok else 0.0, age, f"{lo or '-'}–{hi or '-'} سنة", c)

    c = criteria.get("memorized")
    if c and c.get("enabled"):
        target = c.get("min_juz") or 0
        val = m["memorized_juz"]
        sub = 1.0 if (not target or val >= target) else (val / target if target else 1.0)
        add("memorized", sub, f"{val} جزء", f"{target} جزء فأكثر", c)

    c = criteria.get("weak")
    if c and c.get("enabled"):
        mx = c.get("max_weak", 0) or 0
        val = m["weak_count"]
        sub = 1.0 if val <= mx else max(0.0, 1 - (val - mx) * 0.2)
        add("weak", sub, f"{val} جزء", f"{mx} كحد أقصى", c)

    c = criteria.get("accuracy")
    if c and c.get("enabled"):
        mx = c.get("max_avg_errors")
        val = m["avg_errors"]
        if val is None:
            sub = 0.0
        elif mx is None or mx <= 0:
            sub = 1.0 if val == 0 else max(0.0, 1 - val * 0.2)
        else:
            sub = 1.0 if val <= mx else max(0.0, 1 - (val - mx) * 0.2)
        add("accuracy", sub, "لا بيانات" if val is None else f"{val} خطأ/تسميع", f"{mx if mx is not None else 0} كحد أقصى", c)

    c = criteria.get("attendance")
    if c and c.get("enabled"):
        mn = c.get("min_rate") or 0
        val = m["attendance_rate"]
        sub = 1.0 if (not mn or val >= mn) else val / mn
        add("attendance", sub, f"{val}%", f"{mn}% فأكثر", c)

    c = criteria.get("points")
    if c and c.get("enabled"):
        mn = c.get("min_points") or 0
        val = m["points"]
        sub = 1.0 if (not mn or val >= mn) else val / mn
        add("points", sub, f"{val} نقطة", f"{mn} نقطة فأكثر", c)

    c = criteria.get("tests")
    if c and c.get("enabled"):
        val = m["tests_passed"]
        add("tests", 1.0 if val else 0.0, "اجتاز" if val else "لم يجتز", "مطلوب", c)

    match = round(100 * earned / total_w, 1) if total_w > 0 else 0.0
    return match, eligible, breakdown


async def compute_candidates(competition, group_id=None, term_id=None):
    criteria = competition.get("criteria", {})
    uq = {"role": "student"}
    if group_id:
        uq["group_id"] = group_id
    students = await db.users.find(uq, {"_id": 0, "password_hash": 0}).to_list(3000)
    sids = [s["id"] for s in students]
    if not sids:
        return []

    rq = {"student_id": {"$in": sids}}
    if term_id:
        rq["term_id"] = term_id
    recs = await db.recitations.find(rq, {
        "_id": 0, "student_id": 1, "pages_count": 1, "recitation_type": 1,
        "error_count": 1, "did_not_recite": 1, "new_pages": 1,
    }).to_list(200000)

    aq = {"student_id": {"$in": sids}}
    if term_id:
        aq["term_id"] = term_id
    atts = await db.attendance.find(aq, {"_id": 0, "student_id": 1, "status": 1}).to_list(200000)
    pts = await db.student_points.find({"student_id": {"$in": sids}}, {"_id": 0, "student_id": 1, "total_points": 1}).to_list(200000)

    rec_by, att_by, pts_by = {}, {}, {}
    for r in recs:
        rec_by.setdefault(r["student_id"], []).append(r)
    for a in atts:
        att_by.setdefault(a["student_id"], []).append(a)
    for p in pts:
        pts_by[p["student_id"]] = p.get("total_points", 0)

    group_names = {}
    candidates = []
    for s in students:
        m = compute_student_metrics(s, rec_by.get(s["id"], []), att_by.get(s["id"], []), pts_by.get(s["id"], 0))
        match, eligible, breakdown = score_student(criteria, m)
        gid = s.get("group_id")
        if gid and gid not in group_names:
            g = await db.groups.find_one({"id": gid}, {"_id": 0, "name": 1})
            group_names[gid] = g["name"] if g else ""
        candidates.append({
            "student_id": s["id"], "name": s.get("name"),
            "group_id": gid, "group_name": group_names.get(gid, ""),
            "match": match, "eligible": eligible,
            "metrics": m, "breakdown": breakdown,
        })

    candidates.sort(key=lambda c: (c["eligible"], c["match"]), reverse=True)
    return candidates


@api_router.post("/competitions")
async def create_competition(data: CompetitionCreate, current_user: dict = Depends(get_current_user)):
    ensure_role(current_user, "admin", "فقط المدير يمكنه إنشاء مسابقة")
    comp = {
        "id": str(uuid.uuid4()),
        "name": data.name,
        "type": data.type,
        "category": data.category,
        "criteria": data.criteria or {},
        "created_by": current_user["user_id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.competitions.insert_one(comp)
    return {"message": "تم إنشاء المسابقة", "id": comp["id"]}


@api_router.get("/competitions")
async def list_competitions(current_user: dict = Depends(get_current_user)):
    ensure_role(current_user, "admin", "غير مصرح لك")
    return await db.competitions.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)


@api_router.get("/competitions/{comp_id}")
async def get_competition(comp_id: str, current_user: dict = Depends(get_current_user)):
    ensure_role(current_user, "admin", "غير مصرح لك")
    comp = await db.competitions.find_one({"id": comp_id}, {"_id": 0})
    if not comp:
        raise HTTPException(status_code=404, detail="المسابقة غير موجودة")
    return comp


@api_router.put("/competitions/{comp_id}")
async def update_competition(comp_id: str, data: CompetitionCreate, current_user: dict = Depends(get_current_user)):
    ensure_role(current_user, "admin", "فقط المدير يمكنه تعديل المسابقة")
    result = await db.competitions.update_one(
        {"id": comp_id},
        {"$set": {"name": data.name, "type": data.type, "category": data.category, "criteria": data.criteria or {}}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="المسابقة غير موجودة")
    return {"message": "تم تحديث المسابقة"}


@api_router.delete("/competitions/{comp_id}")
async def delete_competition(comp_id: str, current_user: dict = Depends(get_current_user)):
    ensure_role(current_user, "admin", "فقط المدير يمكنه حذف المسابقة")
    result = await db.competitions.delete_one({"id": comp_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="المسابقة غير موجودة")
    return {"message": "تم حذف المسابقة"}


@api_router.get("/competitions/{comp_id}/candidates")
async def competition_candidates(comp_id: str, group_id: Optional[str] = None,
                                 term_id: Optional[str] = None,
                                 current_user: dict = Depends(get_current_user)):
    ensure_role(current_user, "admin", "غير مصرح لك")
    comp = await db.competitions.find_one({"id": comp_id}, {"_id": 0})
    if not comp:
        raise HTTPException(status_code=404, detail="المسابقة غير موجودة")
    candidates = await compute_candidates(comp, group_id=group_id, term_id=term_id)
    return {
        "competition": {"id": comp["id"], "name": comp["name"], "type": comp["type"], "category": comp.get("category")},
        "count": len(candidates),
        "eligible_count": sum(1 for c in candidates if c["eligible"]),
        "candidates": candidates,
    }


# ============== A2 - مقارنة أداء المشرفين ==============
def _new_pages_of(r):
    np_ = r.get("new_pages") or 0
    if not np_ and r.get("recitation_type") == "new_memorization":
        np_ = r.get("pages_count") or 0
    return np_ or 0


@api_router.get("/reports/teachers")
async def teachers_report(term_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    """A2 — مؤشرات أداء لكل مشرف: عدد طلابه، نسبة الحضور، التسميعات، الصفحات، متوسط النقاط، نسبة تسليم المتابعة."""
    ensure_role(current_user, "admin", "غير مصرح لك")
    sheikhs = await db.users.find({"role": "sheikh"}, {"_id": 0, "id": 1, "name": 1}).to_list(1000)
    groups = await db.groups.find({}, {"_id": 0, "id": 1, "sheikh_id": 1}).to_list(3000)
    students = await db.users.find({"role": "student"}, {"_id": 0, "id": 1, "group_id": 1}).to_list(5000)
    sids = [s["id"] for s in students]

    group_sheikh = {g["id"]: g.get("sheikh_id") for g in groups}
    student_sheikh = {s["id"]: group_sheikh.get(s.get("group_id")) for s in students}

    att_q = {"student_id": {"$in": sids}}
    rec_q = {"student_id": {"$in": sids}, "did_not_recite": {"$ne": True}}
    track_q = {"student_id": {"$in": sids}}
    if term_id:
        att_q["term_id"] = rec_q["term_id"] = track_q["term_id"] = term_id
    atts = await db.attendance.find(att_q, {"_id": 0, "student_id": 1, "status": 1}).to_list(200000)
    recs = await db.recitations.find(rec_q, {"_id": 0, "student_id": 1, "new_pages": 1, "pages_count": 1, "recitation_type": 1}).to_list(200000)
    pts = await db.student_points.find({"student_id": {"$in": sids}}, {"_id": 0, "student_id": 1, "total_points": 1}).to_list(200000)
    tracks = await db.tracking_sheets.find(track_q, {"_id": 0, "student_id": 1}).to_list(200000)

    agg = {sh["id"]: {"id": sh["id"], "name": sh["name"], "students": 0, "present": 0, "att_total": 0,
                      "recitations": 0, "pages": 0, "points_sum": 0, "points_n": 0, "tracked": set()} for sh in sheikhs}
    for s in students:
        sh = student_sheikh.get(s["id"])
        if sh in agg:
            agg[sh]["students"] += 1
    for a in atts:
        sh = student_sheikh.get(a["student_id"])
        if sh in agg:
            agg[sh]["att_total"] += 1
            if a.get("status") == "present":
                agg[sh]["present"] += 1
    for r in recs:
        sh = student_sheikh.get(r["student_id"])
        if sh in agg:
            agg[sh]["recitations"] += 1
            agg[sh]["pages"] += _new_pages_of(r)
    for p in pts:
        sh = student_sheikh.get(p["student_id"])
        if sh in agg:
            agg[sh]["points_sum"] += p.get("total_points", 0)
            agg[sh]["points_n"] += 1
    for t in tracks:
        sh = student_sheikh.get(t["student_id"])
        if sh in agg:
            agg[sh]["tracked"].add(t["student_id"])

    result = []
    for a in agg.values():
        result.append({
            "id": a["id"], "name": a["name"], "students": a["students"],
            "attendance_rate": round(a["present"] / a["att_total"] * 100, 1) if a["att_total"] else 0,
            "recitations": a["recitations"], "pages": a["pages"],
            "avg_points": round(a["points_sum"] / a["points_n"], 1) if a["points_n"] else 0,
            "tracking_rate": round(len(a["tracked"]) / a["students"] * 100, 1) if a["students"] else 0,
        })
    result.sort(key=lambda x: x["avg_points"], reverse=True)
    return {"teachers": result}


# ============== A5 - التحليلات المالية ==============
@api_router.get("/reports/financial")
async def financial_report(current_user: dict = Depends(get_current_user)):
    """A5 — المحصّل مقابل المتبقّي إجمالًا ولكل مجموعة، مع نسبة التحصيل."""
    ensure_role(current_user, "admin", "غير مصرح لك")
    fees = await db.fees.find({}, {"_id": 0}).to_list(50000)
    students = await db.users.find({"role": "student"}, {"_id": 0, "id": 1, "group_id": 1}).to_list(5000)
    student_group = {s["id"]: s.get("group_id") for s in students}
    groups = await db.groups.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(3000)
    group_name = {g["id"]: g["name"] for g in groups}

    total = paid = due = pending = 0.0
    per_group = {}
    for f in fees:
        st = compute_fee_status(f)
        amt = f.get("amount") or 0
        total += amt
        if st == "paid":
            paid += amt
        elif st == "due":
            due += amt
        else:
            pending += amt
        gid = student_group.get(f["student_id"])
        g = per_group.setdefault(gid, {"group_id": gid, "group_name": group_name.get(gid, "بدون مجموعة"),
                                        "total": 0.0, "paid": 0.0, "outstanding": 0.0})
        g["total"] += amt
        if st == "paid":
            g["paid"] += amt
        else:
            g["outstanding"] += amt

    by_group = list(per_group.values())
    for g in by_group:
        g["collection_rate"] = round(g["paid"] / g["total"] * 100, 1) if g["total"] else 0
    by_group.sort(key=lambda x: x["collection_rate"])
    return {
        "totals": {"total": total, "paid": paid, "due": due, "pending": pending,
                   "collection_rate": round(paid / total * 100, 1) if total else 0},
        "by_group": by_group,
    }


# ============== A3 - تصنيف الأجزاء (القوية/الضعيفة/الاختبارات) ==============
@api_router.get("/reports/juz-classification")
async def juz_classification_report(group_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    """A3 — تجميع تصنيف الأجزاء المسجّل في التقييم المبدئي على مستوى المركز/المجموعة."""
    ensure_role(current_user, ["admin", "sheikh"], "غير مصرح لك")
    uq = {"role": "student"}
    if current_user["role"] == "sheikh":
        gids = await _sheikh_group_ids(current_user["user_id"])
        uq["group_id"] = group_id if (group_id and group_id in gids) else {"$in": gids}
    elif group_id:
        uq["group_id"] = group_id
    students = await db.users.find(
        uq, {"_id": 0, "weak_juz": 1, "strong_juz": 1, "administrative_test_juz": 1}
    ).to_list(5000)

    totals = {"strong": 0, "weak": 0, "administrative": 0}
    weak_by_juz = {j: 0 for j in range(1, 31)}
    strong_by_juz = {j: 0 for j in range(1, 31)}
    assessed = 0
    for s in students:
        wk = s.get("weak_juz") or []
        stg = s.get("strong_juz") or []
        if wk or stg or s.get("administrative_test_juz"):
            assessed += 1
        totals["weak"] += len(wk)
        totals["strong"] += len(stg)
        totals["administrative"] += len(s.get("administrative_test_juz") or [])
        for j in wk:
            if isinstance(j, int) and 1 <= j <= 30:
                weak_by_juz[j] += 1
        for j in stg:
            if isinstance(j, int) and 1 <= j <= 30:
                strong_by_juz[j] += 1

    return {
        "assessed_students": assessed,
        "total_students": len(students),
        "totals": totals,
        "by_juz": [{"juz": j, "weak": weak_by_juz[j], "strong": strong_by_juz[j]} for j in range(1, 31)],
    }


# ============== جدول إحصائيات الطلاب (فلاتر + ترتيب + تصدير) ==============
STUDENT_STATS_NUMERIC = {"total_memorization", "new_memorization", "review", "attendance", "tracking",
                         "tracking_prayers", "tracking_sitting", "age", "average",
                         "admin_tested_juz", "annual_score"}


def parse_average(val):
    """توحيد المعدّل: يستخرج الرقم من '95%' أو '95' أو '95.5%' → 95.0، والفارغ → None.
    يسمح بعرض موحّد مع % في الإحصائيات مهما كانت طريقة الإدخال."""
    if val is None:
        return None
    s = str(val).strip().replace("%", "").replace("٪", "").strip()
    if not s:
        return None
    try:
        num = float(s)
    except ValueError:
        return None
    return int(num) if num == int(num) else round(num, 1)

# #4 — الترتيب المعتمد للصفوف (عشان الترتيب في التقارير يكون منطقياً لا أبجدياً)
SCHOOL_GRADES_ORDER = [
    "الصف الأول", "الصف الثاني", "الصف الثالث", "الصف الرابع", "الصف الخامس",
    "الصف السادس", "الصف السابع", "الصف الثامن", "الصف التاسع", "الصف العاشر",
    "الصف الحادي عشر", "الصف الثاني عشر",
]
def _grade_sort_key(grade_value):
    g = (grade_value or "").strip()
    try:
        return (0, SCHOOL_GRADES_ORDER.index(g))
    except ValueError:
        return (1, g)  # القيم خارج القائمة تُرتَّب بعد المعروفة


def _tracking_period_bounds(period: str):
    """حدود المدة الزمنية لورق المتابعة: أسبوع / شهر / فصل (الفصل = بلا حدّ زمني).
    يرجع (from_date, to_date) بصيغة YYYY-MM-DD أو (None, None) للفصل."""
    if period == "week":
        ws = get_current_week_start()
        we = (datetime.strptime(ws, "%Y-%m-%d") + timedelta(days=6)).strftime("%Y-%m-%d")
        return ws, we
    if period == "month":
        today = datetime.now(timezone.utc).date()
        first = today.replace(day=1)
        # آخر يوم في الشهر
        nxt = (first + timedelta(days=32)).replace(day=1)
        last = nxt - timedelta(days=1)
        return first.isoformat(), last.isoformat()
    return None, None  # term / all


def _summarize_last_sheet(sheets: list) -> Optional[dict]:
    """ملخّص آخر ورقة متابعة مُسلَّمة من قائمة أوراق (الأحدث حسب `week_start`)."""
    if not sheets:
        return None
    latest = max(sheets, key=lambda s: (s.get("week_start") or "", str(s.get("created_at") or "")))
    prayers, sitting = _sheet_prayers_sitting(latest)
    return {
        "week_start": latest.get("week_start"),
        "points_earned": latest.get("points_earned") or 0,
        "prayers_count": prayers,
        "quran_sitting_days": sitting,
        "created_at": str(latest.get("created_at") or ""),
        "submitted_by_student": bool(latest.get("submitted_by_student")),
    }


def _sheet_prayers_sitting(sheet: dict) -> tuple:
    """عدد الصلوات وعدد أيام الجلوس مع القرآن من ورقة متابعة (مع الحدّ الأقصى)."""
    d = sheet.get("data") or {}
    prayers = min(int(d.get("prayers_count") or 0), TRACKING_PRAYERS_MAX)
    sitting = sitting_days(d.get("quran_sitting_days"))
    return prayers, sitting


async def _build_student_stats(current_user, group_id=None, student_id=None,
                               term_id=None, sort_by="name", order="asc",
                               tracking_period="term", competition=None):
    uq = {"role": "student"}
    # فلتر المسابقة: annual | young | any | none
    if competition == "annual":
        uq["annual_competition"] = True
    elif competition == "young":
        uq["young_hafiz"] = True
    elif competition == "any":
        uq["$or"] = [{"annual_competition": True}, {"young_hafiz": True}]
    elif competition == "none":
        uq["annual_competition"] = {"$ne": True}
        uq["young_hafiz"] = {"$ne": True}
    if current_user["role"] == "sheikh":
        gids = await _sheikh_group_ids(current_user["user_id"])
        uq["group_id"] = group_id if (group_id and group_id in gids) else {"$in": gids}
    elif group_id:
        uq["group_id"] = group_id
    if student_id:
        uq["id"] = student_id

    students = await db.users.find(uq, {
        "_id": 0, "id": 1, "name": 1, "group_id": 1, "birth_date": 1, "school_grade": 1,
        "school_average": 1, "strong_juz": 1, "weak_juz": 1,
        "previous_memorization_juz": 1, "previous_memorization_pages": 1,
        "annual_competition": 1, "annual_competition_juz": 1,
        "young_hafiz": 1, "young_hafiz_juz": 1, "administrative_test_juz": 1,
    }).to_list(5000)
    sids = [s["id"] for s in students]

    # علامة الطالب في المسابقة السنوية (أحدث سنة شارك فيها) من كشوف ملف المسابقة السنوية
    annual_by = {}
    async for a in db.annual_competition.find({"student_id": {"$in": sids}},
                                              {"_id": 0, "student_id": 1, "year": 1, "score": 1}):
        prev_a = annual_by.get(a["student_id"])
        if a.get("score") is not None and (not prev_a or (a.get("year") or 0) > (prev_a.get("year") or 0)):
            annual_by[a["student_id"]] = a

    recs = await db.recitations.find(
        {"student_id": {"$in": sids}, "did_not_recite": {"$ne": True}},
        {"_id": 0, "student_id": 1, "new_pages": 1, "pages_count": 1, "recitation_type": 1, "review_pages": 1, "term_id": 1},
    ).to_list(200000)
    att_q = {"student_id": {"$in": sids}}
    track_q = {"student_id": {"$in": sids}}
    if term_id:
        att_q["term_id"] = track_q["term_id"] = term_id
    atts = await db.attendance.find(att_q, {"_id": 0, "student_id": 1, "status": 1}).to_list(200000)
    tracks = await db.tracking_sheets.find(
        track_q,
        {"_id": 0, "student_id": 1, "week_start": 1, "data": 1, "points_earned": 1, "created_at": 1},
    ).to_list(200000)

    rec_by, att_by = {}, {}
    for r in recs:
        rec_by.setdefault(r["student_id"], []).append(r)
    for a in atts:
        att_by.setdefault(a["student_id"], []).append(a)

    # ورق المتابعة: العدد + تفصيل الصلوات/الجلوس ضمن المدة المطلوبة + آخر ورقة مُسلَّمة
    p_from, p_to = _tracking_period_bounds(tracking_period)
    track_by, prayers_by, sitting_by, last_sheet_by = {}, {}, {}, {}
    for t in tracks:
        sid = t["student_id"]
        ws = t.get("week_start") or ""
        # آخر ورقة مُسلَّمة (بغضّ النظر عن فلتر المدة)
        prev = last_sheet_by.get(sid)
        if not prev or ws > (prev.get("week_start") or ""):
            pr, si = _sheet_prayers_sitting(t)
            last_sheet_by[sid] = {
                "week_start": ws,
                "points_earned": t.get("points_earned") or 0,
                "prayers_count": pr,
                "quran_sitting_days": si,
                "created_at": str(t.get("created_at") or ""),
            }
        # ضمن المدة المطلوبة
        if p_from and not (p_from <= ws <= p_to):
            continue
        track_by[sid] = track_by.get(sid, 0) + 1
        pr, si = _sheet_prayers_sitting(t)
        prayers_by[sid] = prayers_by.get(sid, 0) + pr
        sitting_by[sid] = sitting_by.get(sid, 0) + si

    group_names = {}
    rows = []
    for s in students:
        gid = s.get("group_id")
        if gid and gid not in group_names:
            g = await db.groups.find_one({"id": gid}, {"_id": 0, "name": 1})
            group_names[gid] = g["name"] if g else ""
        prev = pages_for_juz_list(student_memorized_prev_juz(s)) + (s.get("previous_memorization_pages") or 0)
        srecs = rec_by.get(s["id"], [])
        total_new_all = sum(_new_pages_of(r) for r in srecs)
        scoped = srecs if not term_id else [r for r in srecs if r.get("term_id") == term_id]
        new_pages = sum(_new_pages_of(r) for r in scoped)
        review_pages = sum((r.get("review_pages") or 0) for r in scoped)
        satts = att_by.get(s["id"], [])
        present = sum(1 for a in satts if a.get("status") == "present")
        age = _age_from_birthdate(s.get("birth_date"))
        rows.append({
            "student_id": s["id"], "name": s.get("name") or "", "group_name": group_names.get(gid, ""),
            "total_memorization": prev + total_new_all,
            "new_memorization": new_pages,
            "review": review_pages,
            "attendance": present,  # عدد أيام حضور الطالب خلال الفصل (بدل النسبة)
            "tracking": track_by.get(s["id"], 0),
            # تقسيم ورق المتابعة: الصلوات + الجلوس مع القرآن ضمن المدة المختارة
            "tracking_prayers": prayers_by.get(s["id"], 0),
            "tracking_sitting": sitting_by.get(s["id"], 0),
            "last_sheet": last_sheet_by.get(s["id"]),
            # المشاركة في المسابقات (من التقييم الأولي)
            "annual_competition": bool(s.get("annual_competition")),
            "annual_competition_juz": s.get("annual_competition_juz") or [],
            "young_hafiz": bool(s.get("young_hafiz")),
            "young_hafiz_juz": s.get("young_hafiz_juz") or [],
            # الأجزاء المختبَرة إداريًا (المفصل الإداري) من التقييم الأولي
            "admin_tested_juz": len(s.get("administrative_test_juz") or []),
            "annual_score": (annual_by.get(s["id"]) or {}).get("score"),
            "annual_year": (annual_by.get(s["id"]) or {}).get("year"),
            "age": age,
            "grade": s.get("school_grade") or "",
            "average": parse_average(s.get("school_average")),  # المعدّل الموحّد (رقم)
        })

    sort_by = sort_by if sort_by in (STUDENT_STATS_NUMERIC | {"name", "grade"}) else "name"
    reverse = (order == "desc")
    if sort_by in STUDENT_STATS_NUMERIC:
        # القيم الفارغة تبقى في الآخر دائماً (تصاعدي أو تنازلي)
        filled = [r for r in rows if r.get(sort_by) is not None]
        empty = [r for r in rows if r.get(sort_by) is None]
        filled.sort(key=lambda r: r[sort_by], reverse=reverse)
        rows = filled + empty
    elif sort_by == "grade":
        rows.sort(key=lambda r: _grade_sort_key(r.get("grade")), reverse=reverse)
    else:
        rows.sort(key=lambda r: (r.get(sort_by) or "").strip(), reverse=reverse)
    return rows


@api_router.get("/reports/student-stats")
async def student_stats_report(group_id: Optional[str] = None, student_id: Optional[str] = None,
                               term_id: Optional[str] = None, sort_by: str = "name", order: str = "asc",
                               tracking_period: str = "term",
                               competition: Optional[str] = None,
                               current_user: dict = Depends(get_current_user)):
    """جدول إحصائيات الطلاب: الحفظ الكلي/الجديد/المراجعة، الحضور، ورق المتابعة (صلوات + جلوس)، العمر، الصف.
    tracking_period: week | month | term — يحدّد مدى احتساب أعمدة المتابعة.
    competition: annual | young | any | none — تصفية حسب المشاركة في المسابقات."""
    ensure_role(current_user, ["admin", "sheikh"], "غير مصرح لك")
    if tracking_period not in ("week", "month", "term"):
        tracking_period = "term"
    if competition not in ("annual", "young", "any", "none"):
        competition = None
    rows = await _build_student_stats(current_user, group_id, student_id, term_id, sort_by, order,
                                      tracking_period, competition)
    return {"count": len(rows), "sort_by": sort_by, "order": order,
            "tracking_period": tracking_period, "competition": competition, "rows": rows}


TRACKING_PERIOD_LABELS = {"week": "الأسبوع الحالي", "month": "الشهر الحالي", "term": "الفصل"}


@api_router.get("/export/student-stats")
async def export_student_stats_excel(group_id: Optional[str] = None, student_id: Optional[str] = None,
                                     term_id: Optional[str] = None, sort_by: str = "name", order: str = "asc",
                                     tracking_period: str = "term",
                                     competition: Optional[str] = None,
                                     current_user: dict = Depends(get_current_user)):
    """تصدير جدول إحصائيات الطلاب إلى Excel (بنفس الفلاتر والترتيب)."""
    ensure_role(current_user, ["admin", "sheikh"], "غير مصرح لك")
    if tracking_period not in ("week", "month", "term"):
        tracking_period = "term"
    if competition not in ("annual", "young", "any", "none"):
        competition = None
    rows = await _build_student_stats(current_user, group_id, student_id, term_id, sort_by, order,
                                      tracking_period, competition)
    period_label = TRACKING_PERIOD_LABELS[tracking_period]
    output = io.BytesIO()
    wb = xlsxwriter.Workbook(output, {'in_memory': True})
    title_f = wb.add_format({'bold': True, 'font_size': 15, 'align': 'center', 'bg_color': '#0d9488', 'font_color': 'white'})
    head_f = wb.add_format({'bold': True, 'bg_color': '#1e3a5f', 'font_color': 'white', 'border': 1, 'align': 'center', 'valign': 'vcenter'})
    cell_f = wb.add_format({'border': 1, 'align': 'center'})
    sh = wb.add_worksheet('إحصائيات الطلاب')
    sh.right_to_left()
    sh.merge_range('A1:R1', f'جدول إحصائيات الطلاب — ورق المتابعة حسب: {period_label}', title_f)
    headers = ['#', 'الطالب', 'المجموعة', 'الحفظ الكلي (ص)', 'الحفظ الجديد (ص)', 'المراجعة (ص)',
               'أيام الحضور', 'أوراق المتابعة', 'الصلوات', 'الجلوس مع القرآن', 'آخر ورقة',
               'المسابقة السنوية', 'الحافظ الصغير',
               'العمر', 'الصف', 'المعدل %', 'المختبَرة إداريًا (جزء)', 'علامة المسابقة السنوية']
    for c, h in enumerate(headers):
        sh.write(2, c, h, head_f)
    sh.set_column('A:A', 5); sh.set_column('B:B', 22); sh.set_column('C:C', 16)
    sh.set_column('D:J', 14); sh.set_column('K:K', 14); sh.set_column('L:M', 18); sh.set_column('N:P', 12); sh.set_column('Q:R', 18)
    for i, r in enumerate(rows, 1):
        row = i + 2
        last = r.get("last_sheet") or {}
        sh.write(row, 0, i, cell_f)
        sh.write(row, 1, r["name"], cell_f)
        sh.write(row, 2, r["group_name"], cell_f)
        sh.write(row, 3, r["total_memorization"], cell_f)
        sh.write(row, 4, r["new_memorization"], cell_f)
        sh.write(row, 5, r["review"], cell_f)
        sh.write(row, 6, r["attendance"], cell_f)
        sh.write(row, 7, r["tracking"], cell_f)
        sh.write(row, 8, r.get("tracking_prayers", 0), cell_f)
        sh.write(row, 9, r.get("tracking_sitting", 0), cell_f)
        sh.write(row, 10, last.get("week_start") or "لم يسلّم", cell_f)
        sh.write(row, 11, "، ".join(str(j) for j in r.get("annual_competition_juz") or []) or "—", cell_f)
        sh.write(row, 12, "، ".join(str(j) for j in r.get("young_hafiz_juz") or []) or "—", cell_f)
        sh.write(row, 13, r["age"] if r["age"] is not None else "", cell_f)
        sh.write(row, 14, r["grade"], cell_f)
        sh.write(row, 15, f"{r['average']}%" if r.get("average") is not None else "", cell_f)
        sh.write(row, 16, r.get("admin_tested_juz", 0), cell_f)
        sh.write(row, 17, r["annual_score"] if r.get("annual_score") is not None else "", cell_f)
    wb.close()
    return _xlsx_response(output, f"student_stats_{datetime.now().strftime('%Y%m%d')}.xlsx")


# ============== A6 - تصدير تقارير المشرفين والمجموعات ==============
def _xlsx_response(output, filename):
    output.seek(0)
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@api_router.get("/export/teachers")
async def export_teachers_excel(term_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    """A6 — تصدير مقارنة أداء المشرفين إلى Excel."""
    ensure_role(current_user, "admin", "غير مصرح لك")
    data = await teachers_report(term_id=term_id, current_user=current_user)
    output = io.BytesIO()
    wb = xlsxwriter.Workbook(output, {'in_memory': True})
    title_f = wb.add_format({'bold': True, 'font_size': 15, 'align': 'center', 'bg_color': '#0d9488', 'font_color': 'white'})
    head_f = wb.add_format({'bold': True, 'bg_color': '#1e3a5f', 'font_color': 'white', 'border': 1, 'align': 'center'})
    cell_f = wb.add_format({'border': 1, 'align': 'center'})
    sh = wb.add_worksheet('مقارنة المشرفين')
    sh.right_to_left()
    sh.merge_range('A1:G1', 'مقارنة أداء المشرفين', title_f)
    headers = ['#', 'المشرف', 'عدد الطلاب', 'نسبة الحضور %', 'التسميعات', 'الصفحات', 'متوسط النقاط']
    for c, h in enumerate(headers):
        sh.write(2, c, h, head_f)
    sh.set_column('A:A', 5); sh.set_column('B:B', 24); sh.set_column('C:G', 14)
    for i, t in enumerate(data["teachers"], 1):
        r = i + 2
        sh.write(r, 0, i, cell_f)
        sh.write(r, 1, t["name"], cell_f)
        sh.write(r, 2, t["students"], cell_f)
        sh.write(r, 3, t["attendance_rate"], cell_f)
        sh.write(r, 4, t["recitations"], cell_f)
        sh.write(r, 5, t["pages"], cell_f)
        sh.write(r, 6, t["avg_points"], cell_f)
    wb.close()
    return _xlsx_response(output, f"teachers_report_{datetime.now().strftime('%Y%m%d')}.xlsx")


@api_router.get("/export/groups-financial")
async def export_groups_financial_excel(current_user: dict = Depends(get_current_user)):
    """A6 — تصدير التحليل المالي لكل مجموعة إلى Excel."""
    ensure_role(current_user, "admin", "غير مصرح لك")
    data = await financial_report(current_user=current_user)
    output = io.BytesIO()
    wb = xlsxwriter.Workbook(output, {'in_memory': True})
    title_f = wb.add_format({'bold': True, 'font_size': 15, 'align': 'center', 'bg_color': '#0d9488', 'font_color': 'white'})
    head_f = wb.add_format({'bold': True, 'bg_color': '#1e3a5f', 'font_color': 'white', 'border': 1, 'align': 'center'})
    cell_f = wb.add_format({'border': 1, 'align': 'center'})
    money_f = wb.add_format({'border': 1, 'align': 'center', 'num_format': '#,##0.00'})
    sh = wb.add_worksheet('التحليل المالي')
    sh.right_to_left()
    sh.merge_range('A1:F1', 'التحليل المالي لكل مجموعة', title_f)
    t = data["totals"]
    sh.merge_range('A2:F2', f"الإجمالي: {t['total']:.2f}  |  المحصّل: {t['paid']:.2f}  |  المتبقّي: {t['due'] + t['pending']:.2f}  |  نسبة التحصيل: {t['collection_rate']}%", cell_f)
    headers = ['#', 'المجموعة', 'الإجمالي', 'المحصّل', 'المتبقّي', 'نسبة التحصيل %']
    for c, h in enumerate(headers):
        sh.write(3, c, h, head_f)
    sh.set_column('A:A', 5); sh.set_column('B:B', 24); sh.set_column('C:F', 15)
    for i, g in enumerate(data["by_group"], 1):
        r = i + 3
        sh.write(r, 0, i, cell_f)
        sh.write(r, 1, g["group_name"], cell_f)
        sh.write_number(r, 2, g["total"], money_f)
        sh.write_number(r, 3, g["paid"], money_f)
        sh.write_number(r, 4, g["outstanding"], money_f)
        sh.write(r, 5, g["collection_rate"], cell_f)
    wb.close()
    return _xlsx_response(output, f"groups_financial_{datetime.now().strftime('%Y%m%d')}.xlsx")


# ============== TRACKING SHEET ROUTES ==============

def calculate_tracking_points(data: dict, custom_items: list = None) -> dict:
    """
    حساب نقاط ورقة المتابعة - الأساس 70 نقطة:
    - الصلوات: 35 نقطة
    - الجلوس مع القرآن: 35 نقطة (عدد الأيام 0-7 × 5)
    بالإضافة إلى بنود مخصصة يضيفها المشرف (كل بند بحده الأقصى من النقاط).
    custom_items: [{"id", "name", "max_points"}], والقيم في data["custom_values"] = {item_id: value}
    """
    prayers = min(data.get("prayers_count", 0), TRACKING_PRAYERS_MAX)
    sitting = sitting_points(data.get("quran_sitting_days", 0))

    custom_total = 0
    custom_points = {}
    custom_values = data.get("custom_values") or {}
    for item in (custom_items or []):
        raw = custom_values.get(item["id"], 0) or 0
        pts = min(max(int(raw), 0), int(item.get("max_points", 0)))
        custom_points[item["id"]] = pts
        custom_total += pts

    total = prayers + sitting + custom_total

    return {
        "prayers_points": prayers,
        "quran_points": sitting,
        # بنود ملغاة (للتوافق مع البيانات القديمة)
        "adhkar_points": 0,
        "duha_points": 0,
        "family_points": 0,
        "study_points": 0,
        "witr_points": 0,
        "sunnah_points": 0,
        "night_prayer_points": 0,
        "fasting_points": 0,
        "custom_points": custom_points,
        "total_points": total
    }

def get_current_week_start():
    """الحصول على بداية الأسبوع الحالي (السبت) بتوقيت الأردن (UTC+3)"""
    from datetime import timedelta
    today = (datetime.now(timezone.utc) + timedelta(hours=3)).date()
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

async def check_worshipper_badge(student_id: str, tracking_points: int, max_points: int = TRACKING_BASE_MAX):
    """فحص ومنح شارة العابد (90% أو أكثر من ورقة المتابعة)"""
    if max_points > 0 and tracking_points >= 0.9 * max_points:
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
    """إدخال ورقة متابعة يدوياً (للمشرف)"""
    ensure_role(current_user, "sheikh", "فقط المشرف يمكنه إدخال ورقة المتابعة")

    # بنود المشرف المخصّصة (#3) — تُحسب وتُخزَّن مثل تسجيل الطالب
    manual_custom_items = await get_tracking_items_for_sheikh(current_user["user_id"])
    manual_custom_values = data.custom_values or {}

    # Calculate points - تضمين جميع الحقول بما فيها صلاة الضحى والبنود المخصّصة
    points_breakdown = calculate_tracking_points({
        "prayers_count": data.prayers_count,
        "adhkar_after_prayer": data.adhkar_after_prayer,
        "quran_sitting_days": data.quran_sitting_days,
        "duha_prayers": data.duha_prayers,  # تمت إضافة صلاة الضحى
        "family_recitation": data.family_recitation,
        "study_hours": data.study_hours,
        "witr_prayers_days": data.witr_prayers_days,
        "sunnah_prayers": data.sunnah_prayers,
        "night_prayer": data.night_prayer,
        "fasting": data.fasting,
        "custom_values": manual_custom_values
    }, manual_custom_items)

    sheet_data = TrackingSheetData(
        prayers_count=min(data.prayers_count, 35),
        adhkar_after_prayer=min(data.adhkar_after_prayer, 7),
        quran_sitting_days=sitting_days(data.quran_sitting_days),
        duha_prayers=min(data.duha_prayers, 7),
        family_recitation=min(data.family_recitation, 7),
        study_hours=min(data.study_hours, 7),
        witr_prayers_days=min(data.witr_prayers_days, 7),
        sunnah_prayers=min(data.sunnah_prayers, 7),
        night_prayer=min(data.night_prayer, 1),
        fasting=min(data.fasting, 1),
        notes=data.notes,
        custom_values=points_breakdown.get("custom_points", {})
    )
    
    # #10 — ورقة واحدة لكل (طالب + أسبوع): إن وُجدت ورقة (من الطالب أو سابقة) نُحدّثها بدل إنشاء نسخة ثانية
    existing = await db.tracking_sheets.find_one({"student_id": data.student_id, "week_start": data.week_start})
    new_data_dict = sheet_data.model_dump()
    if existing:
        old_data = existing.get("data") or {}
        # حافظ على بنود الطالب المخصّصة إن لم يُدخلها المشرف
        if old_data.get("custom_values") and not new_data_dict.get("custom_values"):
            new_data_dict["custom_values"] = old_data.get("custom_values")
        await db.tracking_sheets.update_one(
            {"id": existing["id"]},
            {"$set": {
                "data": new_data_dict,
                "points_earned": points_breakdown["total_points"],
                "sheikh_id": current_user["user_id"],
                "updated_by_sheikh": True,
                "submitted_outside_window": False,
            }}
        )
        sheet_id = existing["id"]
    else:
        sheet = TrackingSheet(
            student_id=data.student_id,
            sheikh_id=current_user["user_id"],
            week_start=data.week_start,
            data=sheet_data,
            points_earned=points_breakdown["total_points"]
        )
        sheet_dict = sheet.model_dump()
        sheet_dict["created_at"] = sheet_dict["created_at"].isoformat()
        sheet_dict["updated_by_sheikh"] = True
        await db.tracking_sheets.insert_one(sheet_dict)
        sheet_id = sheet.id

    # إعادة احتساب النقاط من الخام (يمنع الازدواج عند تسجيل الطالب والمشرف لنفس الأسبوع)
    await recompute_student_points(data.student_id)

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
        "sheet_id": sheet_id,
        "points_breakdown": points_breakdown
    }

@api_router.post("/tracking-sheets")
async def create_tracking_sheet(sheet_data: TrackingSheetCreate, current_user: dict = Depends(get_current_user)):
    ensure_role(current_user, "sheikh", "فقط المشرف يمكنه رفع ورقة المتابعة")
    
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
        quran_sitting_days=sitting_days(analysis_result.get("quran_sitting_days", 0)),
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
    adhkar_after_prayer: int = 0  # أذكار بعد الصلاة (0-7) [ملغى]
    quran_sitting_days: int = 0  # أيام الجلوس مع القرآن (0-7)
    duha_prayers: int = 0  # صلاة الضحى (0-7)
    family_recitation: int = 0  # التسميع للأهل (0-7)
    study_hours: int = 0  # ساعات الدراسة (0-7)
    witr_prayers_days: int = 0  # الوتر (0-7)
    sunnah_prayers: int = 0  # السنن (0-7)
    night_prayer: int = 0  # قيام الليل (0-1) = 8 نقاط
    fasting: int = 0  # الصيام (0-1) = 8 نقاط
    notes: Optional[str] = None
    custom_values: Optional[dict] = None  # {item_id: value} للبنود المخصصة من المشرف


# ============== CUSTOM TRACKING ITEMS (بنود المشرف المخصصة) ==============

class TrackingItemCreate(BaseModel):
    name: str
    max_points: int
    icon: Optional[str] = "⭐"          # رمز البند (emoji) — يظهر في الدليل والتسجيل
    sheikh_id: Optional[str] = None    # يحدّده المدير لتعيين البند لمشرف معيّن (المشرف يستخدم نفسه)

async def get_sheikh_id_for_student(student_id: str) -> Optional[str]:
    """إيجاد مشرف الطالب عبر مجموعته"""
    student = await db.users.find_one({"id": student_id}, {"group_id": 1, "_id": 0})
    if not student or not student.get("group_id"):
        return None
    group = await db.groups.find_one({"id": student["group_id"]}, {"sheikh_id": 1, "_id": 0})
    return group.get("sheikh_id") if group else None

async def resolve_recording_sheikh_id(current_user: dict, student_id: str) -> str:
    """المشرف الذي يُنسب إليه السجل عند تسجيل تسميع/حضور.
    المشرف يسجّل باسمه؛ المدير يسجّل نيابةً عن مشرف مجموعة الطالب
    (وإن لم يكن للطالب مجموعة/مشرف، يُنسب السجل للمدير نفسه)."""
    if current_user["role"] == "sheikh":
        return current_user["user_id"]
    return await get_sheikh_id_for_student(student_id) or current_user["user_id"]


async def auto_generate_fees_for_new_student(student_id: str, created_by: str) -> int:
    """توليد رسوم السنة الحالية لطالب جديد — إن كان التوليد التلقائي مُفعَّلًا.
    آمن للفشل: خطأ هنا ما بيكسر إنشاء الطالب."""
    try:
        cfg = await get_fees_config()
        if not cfg["auto_generate"]:
            return 0
        year = datetime.now(timezone.utc).year
        return await generate_year_fees_for_students(
            [student_id], year, cfg["monthly_amount"], cfg["fee_type"], created_by
        )
    except Exception as e:
        logger.warning(f"auto fee generation failed for {student_id}: {e}")
        return 0


async def get_tracking_items_for_sheikh(sheikh_id: str) -> list:
    """بنود المتابعة الفعّالة لمشرف: البنود العامة (اللي أضافها المدير للجميع) + بنود المشرف نفسه."""
    scope = [{"is_global": True}]
    if sheikh_id:
        scope.append({"sheikh_id": sheikh_id})
    return await db.tracking_items.find(
        {"$or": scope, "active": {"$ne": False}}, {"_id": 0}
    ).sort("created_at", 1).to_list(100)

@api_router.post("/tracking-items")
async def create_tracking_item(data: TrackingItemCreate, current_user: dict = Depends(get_current_user)):
    """إضافة بند متابعة مخصص.
    - المشرف: البند خاص بطلابه (والمدير يقدر يشوفه).
    - المدير بدون تحديد مشرف: **بند عام** يظهر عند كل المشرفين وطلابهم.
    - المدير مع تحديد مشرف: بند خاص بذلك المشرف."""
    ensure_role(current_user, ["sheikh", "admin"], "فقط المشرف أو المدير يمكنه إضافة بنود المتابعة")
    if not data.name.strip():
        raise HTTPException(status_code=400, detail="اسم البند مطلوب")
    if data.max_points <= 0:
        raise HTTPException(status_code=400, detail="نقاط البند يجب أن تكون أكبر من صفر")

    if current_user["role"] == "sheikh":
        target_sheikh, is_global = current_user["user_id"], False
    else:
        target_sheikh = data.sheikh_id or None
        is_global = target_sheikh is None

    item = {
        "id": str(uuid.uuid4()),
        "sheikh_id": target_sheikh,
        "is_global": is_global,
        "name": data.name.strip(),
        "max_points": int(data.max_points),
        "icon": (data.icon or "⭐").strip() or "⭐",
        "active": True,
        "created_by": current_user["user_id"],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.tracking_items.insert_one(dict(item))
    return item

@api_router.get("/tracking-items")
async def list_tracking_items(sheikh_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    """بنود المتابعة — الكل يرى البنود العامة، بالإضافة إلى:
    المشرف بنوده، الطالب بنود مشرفه، المدير بنود المشرف المحدّد عبر sheikh_id
    (وبدون sheikh_id يرى البنود العامة فقط)."""
    if current_user["role"] == "sheikh":
        target = current_user["user_id"]
    elif current_user["role"] == "student":
        target = await get_sheikh_id_for_student(current_user["user_id"])
    else:  # admin
        target = sheikh_id  # #4 — المدير يمرّر معرّف المشرف ليرى بنوده
    return await get_tracking_items_for_sheikh(target)

@api_router.delete("/tracking-items/{item_id}")
async def delete_tracking_item(item_id: str, current_user: dict = Depends(get_current_user)):
    """حذف بند متابعة مخصص (المشرف صاحبه، أو المدير)"""
    ensure_role(current_user, ["sheikh", "admin"], "غير مصرح لك")
    q = {"id": item_id} if current_user["role"] == "admin" else {"id": item_id, "sheikh_id": current_user["user_id"]}
    res = await db.tracking_items.delete_one(q)
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="البند غير موجود")
    return {"message": "تم حذف البند"}

@api_router.post("/tracking-sheets/student")
async def create_tracking_sheet_student(data: StudentTrackingCreate, current_user: dict = Depends(get_current_user)):
    """تعبئة ورقة المتابعة من حساب الطالب - مرة واحدة في الأسبوع"""
    ensure_role(current_user, "student", "هذا الخيار متاح للطلاب فقط")
    
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
            # الإعداد يحدّد: نستقبلها بدون نقاط، أو نرفضها أصلًا
            if not submission_settings.get("allow_late_submission", True):
                raise HTTPException(
                    status_code=400,
                    detail=f"التسليم مغلق حاليًا. الوقت المسموح من {submission_settings.get('submission_start_day_ar', '')} "
                           f"{start_time_str} إلى {end_time_str}."
                )
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
    
    # البنود المخصصة من مشرف الطالب
    sheikh_id = await get_sheikh_id_for_student(current_user["user_id"])
    custom_items = await get_tracking_items_for_sheikh(sheikh_id)
    custom_values = data.custom_values or {}

    # #10 — ورقة واحدة لكل (طالب + أسبوع): ادمج فوق بيانات الورقة الموجودة (قد تكون من المشرف)
    #        حتى لا يمسح تسجيل الطالب تسجيل المشرف والعكس.
    merged_data = dict((existing or {}).get("data") or {})
    merged_data["prayers_count"] = min(data.prayers_count, 35)
    merged_data["quran_sitting_days"] = sitting_days(data.quran_sitting_days)
    if data.notes is not None:
        merged_data["notes"] = data.notes

    # حساب النقاط من الحقول المدموجة + بنود المشرف المخصّصة
    points_input = dict(merged_data)
    points_input["custom_values"] = custom_values or merged_data.get("custom_values") or {}
    points_breakdown = calculate_tracking_points(points_input, custom_items)
    merged_data["custom_values"] = points_breakdown.get("custom_points", {})

    # النقاط تُمنح داخل وقت التسليم، أو إذا كان المشرف قد عبّأ الورقة (تسجيل المشرف معتمد)
    teacher_filled = bool(existing and existing.get("sheikh_id"))
    actual_points = points_breakdown["total_points"] if (is_within_submission_window or teacher_filled) else 0

    if existing:
        await db.tracking_sheets.update_one(
            {"id": existing["id"]},
            {"$set": {
                "data": merged_data,
                "points_earned": actual_points,
                "submitted_by_student": True,
                "submitted_outside_window": not is_within_submission_window,
            }}
        )
        sheet_id = existing["id"]
    else:
        sheet = TrackingSheet(
            student_id=current_user["user_id"],
            sheikh_id="",  # بدون مشرف - مقدم من الطالب
            week_start=week_start_to_use,
            data=TrackingSheetData(**{k: v for k, v in merged_data.items() if k in TrackingSheetData.model_fields}),
            points_earned=actual_points
        )
        sheet_dict = sheet.model_dump()
        sheet_dict["created_at"] = sheet_dict["created_at"].isoformat()
        sheet_dict["submitted_by_student"] = True
        sheet_dict["submitted_outside_window"] = not is_within_submission_window
        await db.tracking_sheets.insert_one(sheet_dict)
        sheet_id = sheet.id

    # إعادة احتساب النقاط من الخام (مصدر موثوق واحد، يمنع الازدواج بين المشرف والطالب)
    await recompute_student_points(current_user["user_id"])

    # فحص ومنح شارة العابد
    if actual_points > 0:
        await check_worshipper_badge(current_user["user_id"], actual_points)

    return {
        "message": submission_message if submission_message else "تم حفظ ورقة المتابعة بنجاح",
        "sheet_id": sheet_id,
        "points_earned": actual_points,
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
        # #1 — المشرف يرى كل أوراق طلابه بغضّ النظر عمّن سجّلها (الطالب أو المشرف)
        gids = await _sheikh_group_ids(current_user["user_id"])
        student_ids = [u["id"] for u in await db.users.find(
            {"role": "student", "group_id": {"$in": gids}}, {"_id": 0, "id": 1}
        ).to_list(10000)]
        if student_id:
            query["student_id"] = student_id if student_id in student_ids else "__none__"
        else:
            query["student_id"] = {"$in": student_ids}
    elif student_id:
        query["student_id"] = student_id

    sheets = await db.tracking_sheets.find(query, {"_id": 0}).sort("week_start", -1).to_list(1000)
    return sheets

@api_router.get("/tracking-sheets/last-per-student")
async def last_tracking_sheet_per_student(
    group_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """آخر ورقة متابعة مُسلَّمة لكل طالب — يشمل الطلاب اللي ما سلّموا ولا ورقة.
    المشرف يرى طلاب مجموعاته؛ المدير يرى الكل (أو مجموعة محدّدة)."""
    ensure_role(current_user, ["sheikh", "admin"], "غير مصرح لك")

    uq = {"role": "student"}
    if current_user["role"] == "sheikh":
        gids = await _sheikh_group_ids(current_user["user_id"])
        uq["group_id"] = group_id if (group_id and group_id in gids) else {"$in": gids}
    elif group_id:
        uq["group_id"] = group_id

    students = await db.users.find(uq, {"_id": 0, "id": 1, "name": 1, "group_id": 1}).to_list(5000)
    sids = [s["id"] for s in students]

    sheets = await db.tracking_sheets.find(
        {"student_id": {"$in": sids}},
        {"_id": 0, "student_id": 1, "week_start": 1, "data": 1, "points_earned": 1,
         "created_at": 1, "submitted_by_student": 1},
    ).to_list(200000)

    by_student = {}
    for sh in sheets:
        by_student.setdefault(sh["student_id"], []).append(sh)

    group_names = {g["id"]: g["name"] for g in
                   await db.groups.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(3000)}

    rows = []
    for s in students:
        rows.append({
            "student_id": s["id"],
            "student_name": s.get("name") or "",
            "group_name": group_names.get(s.get("group_id"), "بدون مجموعة"),
            "last_sheet": _summarize_last_sheet(by_student.get(s["id"], [])),
        })
    # اللي ما سلّموا بالآخر، والباقي بالأحدث أولًا
    rows.sort(key=lambda r: (r["last_sheet"] is None, -_week_sort_key(r["last_sheet"])))
    return rows


def _week_sort_key(last_sheet) -> int:
    """مفتاح ترتيب رقمي من `week_start` (YYYY-MM-DD → YYYYMMDD)."""
    if not last_sheet or not last_sheet.get("week_start"):
        return 0
    try:
        return int(last_sheet["week_start"].replace("-", ""))
    except (ValueError, AttributeError):
        return 0


class TrackingSheetUpdate(BaseModel):
    """تعديل ورقة المتابعة من المشرف"""
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
    """تعديل ورقة متابعة (للمشرف فقط)"""
    ensure_role(current_user, "sheikh", "فقط المشرف يمكنه تعديل ورقة المتابعة")
    
    # Get existing sheet
    sheet = await db.tracking_sheets.find_one({"id": sheet_id})
    if not sheet:
        raise HTTPException(status_code=404, detail="ورقة المتابعة غير موجودة")
    
    # Verify sheikh owns this sheet (or shares the student's group)
    if sheet.get("sheikh_id") and sheet.get("sheikh_id") != current_user["user_id"]:
        stu = await db.users.find_one({"id": sheet.get("student_id")}, {"_id": 0, "group_id": 1})
        if not stu or stu.get("group_id") not in await _sheikh_group_ids(current_user["user_id"]):
            raise HTTPException(status_code=403, detail="لا يمكنك تعديل ورقة متابعة لمشرف آخر")
    
    # Get old points
    old_points = sheet.get("points_earned", 0)
    
    # Build update data
    sheet_data = sheet.get("data", {})
    
    if data.prayers_count is not None:
        sheet_data["prayers_count"] = min(data.prayers_count, 35)
    if data.adhkar_after_prayer is not None:
        sheet_data["adhkar_after_prayer"] = min(data.adhkar_after_prayer, 7)
    if data.quran_sitting_days is not None:
        sheet_data["quran_sitting_days"] = sitting_days(data.quran_sitting_days)
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
    
    # Calculate new points (with the student's custom items so they're not dropped)
    edit_student_id = sheet.get("student_id")
    edit_sheikh_id = await get_sheikh_id_for_student(edit_student_id) if edit_student_id else None
    edit_custom_items = await get_tracking_items_for_sheikh(edit_sheikh_id)
    points_breakdown = calculate_tracking_points(sheet_data, edit_custom_items)
    sheet_data["custom_values"] = points_breakdown.get("custom_points", sheet_data.get("custom_values", {}))
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
    
    # إعادة احتساب نقاط الطالب من الخام (مصدر موثوق واحد — يمنع الانحراف)
    points_diff = new_points - old_points
    if sheet.get("student_id"):
        await recompute_student_points(sheet["student_id"])

    return {
        "message": "تم تحديث ورقة المتابعة بنجاح",
        "old_points": old_points,
        "new_points": new_points,
        "points_diff": points_diff
    }

@api_router.get("/tracking-sheets/stats/{student_id}")
async def get_tracking_stats(student_id: str, current_user: dict = Depends(get_current_user)):
    """الحصول على إحصائيات ورقة المتابعة - الأسبوع الحالي والمجموع الفصلي"""
    
    today = datetime.now(timezone.utc)
    # الأسبوع يبدأ السبت — نفس بداية الأسبوع التي تُحفظ بها الأوراق
    current_week_start = get_current_week_start()
    
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
        "max_weekly_points": TRACKING_BASE_MAX,  # الأساس الأسبوعي (70) — بنود المشرف تُضاف فوقه
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
    ensure_role(current_user, ["sheikh", "admin"], "فقط المشرف أو المدير يمكنه تسجيل التسميع")

    # المدير يسجّل نيابةً عن مشرف مجموعة الطالب
    recording_sheikh_id = await resolve_recording_sheikh_id(current_user, recitation_data.student_id)

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

    # #6 — التحقق أن اليوم من أيام التسميع حسب الجدول المرتبط بالفصل الحالي
    await ensure_lesson_day(record_date, "التسميع")

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
        review_pages += pages_for_juz_list(recitation_data.review_juz)
    if recitation_data.partial_review_pages:
        review_pages += recitation_data.partial_review_pages
    
    # إذا لم يسمع - لا يُسجل التسميع ولا نقاط
    if recitation_data.did_not_recite:
        recitation = Recitation(
            student_id=recitation_data.student_id,
            sheikh_id=recording_sheikh_id,
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
    
    # النقاط فقط إذا اجتاز الحد الأدنى (RECITATION_PASS_POINTS)
    passed = recitation_data.passed_minimum or recitation_data.passed_review_minimum
    points = RECITATION_PASS_POINTS if passed else 0
    
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
        sheikh_id=recording_sheikh_id,
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
    ensure_role(current_user, ["sheikh", "admin"], "غير مصرح لك")
    
    # Get existing recitation
    recitation = await db.recitations.find_one({"id": recitation_id})
    if not recitation:
        raise HTTPException(status_code=404, detail="التسميع غير موجود")
    
    # Check permission - sheikh can only edit their own recitations
    if current_user["role"] == "sheikh" and recitation.get("sheikh_id") != current_user["user_id"]:
        raise HTTPException(status_code=403, detail="لا يمكنك تعديل تسميع مسجل من مشرف آخر")
    
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
    ensure_role(current_user, ["sheikh", "admin"], "غير مصرح لك")
    
    # Get existing recitation
    recitation = await db.recitations.find_one({"id": recitation_id})
    if not recitation:
        raise HTTPException(status_code=404, detail="التسميع غير موجود")
    
    # Check permission
    if current_user["role"] == "sheikh" and recitation.get("sheikh_id") != current_user["user_id"]:
        raise HTTPException(status_code=403, detail="لا يمكنك حذف تسميع مسجل من مشرف آخر")
    
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
    
    # تصفية حسب التاريخ
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

# حذف تسميع (للمشرف)
@api_router.delete("/recitations/{recitation_id}")
async def delete_recitation(recitation_id: str, current_user: dict = Depends(get_current_user)):
    """حذف تسميع - للمشرف فقط"""
    ensure_role(current_user, ["sheikh", "admin"], "غير مصرح لك بحذف التسميع")
    
    # البحث عن التسميع
    recitation = await db.recitations.find_one({"id": recitation_id})
    if not recitation:
        raise HTTPException(status_code=404, detail="التسميع غير موجود")
    
    # التحقق من أن المشرف هو من سجل التسميع
    if current_user["role"] == "sheikh" and recitation.get("sheikh_id") != current_user["user_id"]:
        raise HTTPException(status_code=403, detail="لا يمكنك حذف تسميع سجله مشرف آخر")
    
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
    ensure_role(current_user, ["sheikh", "admin"], "فقط المشرف أو المدير يمكنه تسجيل الحضور")

    # #6 — التحقق أن اليوم من أيام الدوام حسب الجدول المرتبط بالفصل الحالي
    await ensure_lesson_day(attendance_data.date, "الدوام")

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
        # نقاط الحضور تتبع الحالة: تُسحب عند التراجع عن "حاضر" وتُمنح عند التحويل إليه
        if (existing.get("status") == "present") != (attendance_data.status == "present"):
            await recompute_student_points(attendance_data.student_id)
        return {"message": "تم تحديث الحضور"}
    
    attendance = Attendance(
        student_id=attendance_data.student_id,
        # المدير يسجّل نيابةً عن مشرف مجموعة الطالب
        sheikh_id=await resolve_recording_sheikh_id(current_user, attendance_data.student_id),
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
        points = ATTENDANCE_POINTS
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


# ============== T2 - تسجيل حضور جماعي بنقرة واحدة ==============
class BulkAttendanceRecord(BaseModel):
    student_id: str
    status: str
    excuse_reason: Optional[str] = None


class BulkAttendanceRequest(BaseModel):
    date: str
    records: List[BulkAttendanceRecord]


@api_router.post("/attendance/bulk")
async def bulk_attendance(data: BulkAttendanceRequest, current_user: dict = Depends(get_current_user)):
    """T2 — تسجيل حضور مجموعة كاملة دفعةً واحدة (حاضر افتراضيًا مع استثناء الغائبين)."""
    ensure_role(current_user, ["sheikh", "admin"], "فقط المشرف أو المدير يمكنه تسجيل الحضور")
    # #6 — تحقق مرة واحدة من أن اليوم من أيام الدوام حسب الجدول
    await ensure_lesson_day(data.date, "الدوام")
    count = 0
    for rec in data.records:
        if rec.status not in ("present", "absent", "excused"):
            continue
        await mark_attendance(
            AttendanceCreate(student_id=rec.student_id, date=data.date, status=rec.status, excuse_reason=rec.excuse_reason),
            current_user,
        )
        count += 1
    return {"message": f"تم تسجيل حضور {count} طالب", "count": count}


# T3 - قيم ذكية للتسميع من آخر جلسة
@api_router.get("/students/{student_id}/last-recitation")
async def last_recitation_hint(student_id: str, current_user: dict = Depends(get_current_user)):
    """T3 — يرجع آخر تسميع للطالب لاقتراح صفحة البداية تلقائيًا."""
    ensure_role(current_user, ["sheikh", "admin"], "غير مصرح لك")
    last = await db.recitations.find(
        {"student_id": student_id, "did_not_recite": {"$ne": True}},
        {"_id": 0, "page_to": 1, "juz_number": 1, "record_date": 1, "new_pages": 1},
    ).sort("record_date", -1).limit(1).to_list(1)
    if not last:
        return {"has_previous": False, "suggested_from_page": None, "last_juz": None}
    l = last[0]
    pt = l.get("page_to")
    return {
        "has_previous": True,
        "last_page_to": pt,
        "last_juz": l.get("juz_number"),
        "last_date": l.get("record_date"),
        "suggested_from_page": (pt + 1) if isinstance(pt, int) else None,
    }


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
    ensure_role(current_user, "admin", "فقط المدير يمكنه إنشاء الأنشطة")
    
    if activity_data.required_fee is not None and activity_data.required_fee < 0:
        raise HTTPException(status_code=400, detail="الرسوم يجب أن تكون صفرًا أو أكثر")
    if activity_data.required_points is not None and activity_data.required_points < 0:
        raise HTTPException(status_code=400, detail="النقاط المطلوبة يجب أن تكون صفرًا أو أكثر")
    if activity_data.end_time and activity_data.time and activity_data.end_time < activity_data.time:
        raise HTTPException(status_code=400, detail="وقت النهاية يجب أن يكون بعد وقت البداية")

    activity = Activity(
        title=activity_data.title,
        description=activity_data.description,
        date=activity_data.date,
        time=activity_data.time,
        end_time=activity_data.end_time,
        location=activity_data.location,
        required_fee=activity_data.required_fee,
        required_points=activity_data.required_points,
        created_by=current_user["user_id"]
    )

    activity_dict = activity.model_dump()
    activity_dict["created_at"] = activity_dict["created_at"].isoformat()

    await db.activities.insert_one(activity_dict)

    # إشعار الطلاب والمشرفين (المدير ما بيحتاج إشعارًا بنشاط أنشأه بنفسه)
    users = await db.users.find({"role": {"$in": ["student", "sheikh"]}}, {"_id": 0, "id": 1}).to_list(10000)
    time_txt = activity_data.time + (f" – {activity_data.end_time}" if activity_data.end_time else "")
    req = []
    if activity_data.required_fee:
        req.append(f"رسوم {activity_data.required_fee}")
    if activity_data.required_points:
        req.append(f"{activity_data.required_points} نقطة")
    req_txt = f" · المطلوب: {' أو '.join(req)}" if req else ""
    for user in users:
        await create_notification_internal(
            user["id"],
            "نشاط جديد",
            f"{activity_data.title} — {activity_data.date} {time_txt}{req_txt}",
            "info"
        )

    return {"message": "تم إنشاء النشاط بنجاح", "activity_id": activity.id}

@api_router.get("/activities")
async def get_activities(current_user: dict = Depends(get_current_user)):
    activities = await db.activities.find({}, {"_id": 0}).to_list(100)
    return activities

@api_router.delete("/activities/{activity_id}")
async def delete_activity(activity_id: str, current_user: dict = Depends(get_current_user)):
    ensure_role(current_user, "admin", "فقط المدير يمكنه حذف الأنشطة")
    
    result = await db.activities.delete_one({"id": activity_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="النشاط غير موجود")
    
    return {"message": "تم حذف النشاط بنجاح"}

# ============== NOTIFICATIONS ROUTES ==============

async def create_notification_internal(user_id: str, title: str, message: str, type: str = "info",
                                       category: str = "system"):
    """category: system (التسميع والحضور والنقاط...) / announcement (الإعلانات والرسائل الجماعية) / chat."""
    notification = Notification(
        user_id=user_id,
        title=title,
        message=message,
        type=type
    )
    
    notification_dict = notification.model_dump()
    notification_dict["created_at"] = notification_dict["created_at"].isoformat()
    notification_dict["category"] = category

    await db.notifications.insert_one(notification_dict)


# ============== N3 - سجل عمليات المدير (Audit Log) ==============
async def log_admin_action(admin: dict, action: str, target_type: str = None,
                           target_id: str = None, target_name: str = None, details: str = None):
    """تسجيل عملية حساسة قام بها المدير (تصفير فصل، إعادة تعيين كلمة مرور، حذف، إنذار...)."""
    try:
        await db.audit_logs.insert_one({
            "id": str(uuid.uuid4()),
            "admin_id": admin.get("user_id"),
            "admin_name": admin.get("name"),
            "action": action,
            "target_type": target_type,
            "target_id": target_id,
            "target_name": target_name,
            "details": details,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    except Exception as e:
        logger.error(f"audit log failed: {e}")


@api_router.get("/admin/audit-logs")
async def get_audit_logs(action: Optional[str] = None, limit: int = 200,
                         current_user: dict = Depends(get_current_user)):
    """N3 — عرض سجل عمليات المدير مع إمكانية التصفية حسب نوع العملية."""
    ensure_role(current_user, "admin", "غير مصرح لك")
    query = {}
    if action:
        query["action"] = action
    logs = await db.audit_logs.find(query, {"_id": 0}).sort("created_at", -1).to_list(min(limit, 1000))
    return {"count": len(logs), "logs": logs}


# ============== N1 - الإعلانات (المدير -> المشرفون) ==============
class AnnouncementCreate(BaseModel):
    title: str
    message: str
    audience: str = "sheikhs"  # sheikhs | students | all


# جمهور كل إعلان → أدوار المستقبِلين
ANNOUNCEMENT_AUDIENCES = {
    "sheikhs": ["sheikh"],
    "students": ["student"],
    "all": ["sheikh", "student"],
}


@api_router.post("/announcements")
async def create_announcement(data: AnnouncementCreate, current_user: dict = Depends(get_current_user)):
    """N1 — المدير يبثّ إعلانًا للمشرفين (أو الكل): يُحفظ للشريط ويُرسَل كإشعار."""
    ensure_role(current_user, "admin", "فقط المدير يمكنه بثّ الإعلانات")
    if not data.title.strip() or not data.message.strip():
        raise HTTPException(status_code=400, detail="العنوان والنص مطلوبان")
    audience = data.audience if data.audience in ANNOUNCEMENT_AUDIENCES else "sheikhs"
    ann = {
        "id": str(uuid.uuid4()),
        "title": data.title.strip(),
        "message": data.message.strip(),
        "audience": audience,
        "created_by": current_user["user_id"],
        "created_by_name": current_user.get("name"),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.announcements.insert_one(ann)

    # إرسال إشعار للجمهور المستهدف
    role_filter = {"role": {"$in": ANNOUNCEMENT_AUDIENCES[audience]}}
    targets = await db.users.find(role_filter, {"_id": 0, "id": 1}).to_list(10000)
    for u in targets:
        await create_notification_internal(u["id"], f"📢 {data.title.strip()}", data.message.strip(), "info", "announcement")

    return {"message": "تم بثّ الإعلان", "id": ann["id"], "recipients": len(targets)}


@api_router.get("/announcements")
async def get_announcements(current_user: dict = Depends(get_current_user)):
    """قائمة الإعلانات: المدير يرى الكل، والمشرف/الطالب يرى ما يخصّه (للشريط)."""
    role = current_user["role"]
    if role == "admin":
        query = {}
    elif role == "sheikh":
        query = {"audience": {"$in": ["sheikhs", "all"]}}
    else:
        query = {"audience": {"$in": ["students", "all"]}}
    anns = await db.announcements.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
    return anns


@api_router.delete("/announcements/{ann_id}")
async def delete_announcement(ann_id: str, current_user: dict = Depends(get_current_user)):
    ensure_role(current_user, "admin", "فقط المدير يمكنه حذف الإعلان")
    result = await db.announcements.delete_one({"id": ann_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="الإعلان غير موجود")
    return {"message": "تم حذف الإعلان"}


# ============== إعدادات العرض (يتحكم بها المدير) ==============
# hidden_nav: روابط القائمة الجانبية المخفية لكل دور (المشرف/الطالب).
# notifications: إظهار الإشعارات لكل دور، ولكل فئة (النظام / الإعلانات / المحادثة).
NOTIFICATION_CATEGORIES = ("system", "announcement", "chat")
UI_ROLES = ("sheikh", "student")


def _default_ui_settings() -> dict:
    return {
        "hidden_nav": {r: [] for r in UI_ROLES},
        "notifications": {r: {"enabled": True, **{c: True for c in NOTIFICATION_CATEGORIES}} for r in UI_ROLES},
    }


async def get_ui_settings() -> dict:
    doc = await db.settings.find_one({"key": "ui_settings"}, {"_id": 0}) or {}
    out = _default_ui_settings()
    for r in UI_ROLES:
        hidden = (doc.get("hidden_nav") or {}).get(r)
        if isinstance(hidden, list):
            out["hidden_nav"][r] = [str(x) for x in hidden]
        notif = (doc.get("notifications") or {}).get(r) or {}
        for k in ("enabled", *NOTIFICATION_CATEGORIES):
            if k in notif:
                out["notifications"][r][k] = bool(notif[k])
    return out


class UiSettingsUpdate(BaseModel):
    hidden_nav: Optional[Dict[str, List[str]]] = None
    notifications: Optional[Dict[str, Dict[str, bool]]] = None


@api_router.get("/ui-settings")
async def read_ui_settings(current_user: dict = Depends(get_current_user)):
    return await get_ui_settings()


@api_router.put("/admin/ui-settings")
async def update_ui_settings(data: UiSettingsUpdate, current_user: dict = Depends(get_current_user)):
    ensure_role(current_user, "admin", "فقط المدير يمكنه تعديل إعدادات العرض")
    current = await get_ui_settings()
    if data.hidden_nav is not None:
        for r in UI_ROLES:
            if r in data.hidden_nav:
                current["hidden_nav"][r] = [p for p in data.hidden_nav[r] if p != "/dashboard"]
    if data.notifications is not None:
        for r in UI_ROLES:
            for k, v in (data.notifications.get(r) or {}).items():
                if k in ("enabled", *NOTIFICATION_CATEGORIES):
                    current["notifications"][r][k] = bool(v)
    await db.settings.update_one({"key": "ui_settings"}, {"$set": current}, upsert=True)
    await log_admin_action(current_user, "ui_settings", details="تعديل إعدادات العرض والإشعارات")
    return {"message": "تم حفظ إعدادات العرض", "settings": current}


def _notification_category(n: dict) -> str:
    """الإشعارات القديمة بلا فئة: تُستنتج من العنوان."""
    if n.get("category") in NOTIFICATION_CATEGORIES:
        return n["category"]
    title = n.get("title") or ""
    if title.startswith("رسالة من الطالب") or title.startswith("رسالة من الإدارة")             or title.startswith("رسالة من المشرف") or title == "رسالة من مشرفك":
        return "chat"
    if title.startswith("📢") or title.startswith("رسالة من مشرفك:"):
        return "announcement"
    return "system"


@api_router.get("/notifications")
async def get_notifications(current_user: dict = Depends(get_current_user)):
    role = current_user["role"]
    prefs = (await get_ui_settings())["notifications"].get(role) if role in UI_ROLES else None
    if prefs and not prefs["enabled"]:
        return []
    notifications = await db.notifications.find(
        {"user_id": current_user["user_id"]},
        {"_id": 0}
    ).sort("created_at", -1).to_list(200 if prefs else 50)
    if prefs:
        notifications = [n for n in notifications if prefs.get(_notification_category(n), True)][:50]
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
    
    # جلب دفعة واحدة بدل 3 استعلامات لكل طالب (إصلاح N+1)
    sids = [s["id"] for s in students]
    trk_by, rec_by, att_by = {}, {}, {}
    for t in await db.tracking_sheets.find({"student_id": {"$in": sids}}, {"_id": 0}).to_list(100000):
        trk_by.setdefault(t["student_id"], []).append(t)
    for r in await db.recitations.find({"student_id": {"$in": sids}}, {"_id": 0}).to_list(100000):
        rec_by.setdefault(r["student_id"], []).append(r)
    for a in await db.attendance.find({"student_id": {"$in": sids}}, {"_id": 0, "student_id": 1, "status": 1}).to_list(100000):
        att_by.setdefault(a["student_id"], []).append(a)

    scores = []
    for student in students:
        tracking = trk_by.get(student["id"], [])

        tracking_score = sum(
            (t["data"]["prayers_count"] * 0.3 +
             t["data"]["quran_sitting_minutes"] * 0.1 +
             t["data"]["family_recitation_count"] * 2)
            for t in tracking
        ) / max(len(tracking), 1)

        recitations = rec_by.get(student["id"], [])

        # Calculate recitation score from rating or points
        recitation_score = 0
        if recitations:
            total_rating = sum(r.get("rating", 0) or 0 for r in recitations if r.get("rating"))
            rated_count = sum(1 for r in recitations if r.get("rating"))
            if rated_count > 0:
                recitation_score = (total_rating / rated_count) * 10  # Scale to 100

        attendance = att_by.get(student["id"], [])

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
    ensure_role(current_user, "student", "هذا الترتيب للطلاب فقط")
    
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
    
    # جلب دفعة واحدة بدل استعلام لكل طالب (إصلاح N+1: من 3×عدد الطلاب استعلام إلى 3 استعلامات)
    sids = [s["id"] for s in group_students]
    pts_rows = await db.student_points.find({"student_id": {"$in": sids}}, {"_id": 0, "student_id": 1, "total_points": 1}).to_list(10000)
    pts_by = {p["student_id"]: p.get("total_points", 0) for p in pts_rows}
    att_rows = await db.attendance.find({"student_id": {"$in": sids}}, {"_id": 0, "student_id": 1, "status": 1}).to_list(100000)
    att_by = {}
    for a in att_rows:
        att_by.setdefault(a["student_id"], []).append(a)
    rec_rows = await db.recitations.find({"student_id": {"$in": sids}}, {"_id": 0, "student_id": 1, "did_not_recite": 1, "created_at": 1, "passed_minimum": 1, "passed_review_minimum": 1}).to_list(100000)
    rec_by = {}
    for r in rec_rows:
        rec_by.setdefault(r["student_id"], []).append(r)

    scores = []
    for s in group_students:
        total_points = pts_by.get(s["id"], 0)

        attendance = att_by.get(s["id"], [])
        present_count = sum(1 for a in attendance if a["status"] == "present")
        attendance_rate = (present_count / max(len(attendance), 1)) * 100

        recitations = rec_by.get(s["id"], [])
        recitation_days = set()
        passed_days = set()
        for r in recitations:
            if not r.get("did_not_recite"):
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
    recitations = await db.recitations.find({"student_id": student_id}, {"_id": 0}).to_list(100000)
    attendance = await db.attendance.find({"student_id": student_id}, {"_id": 0}).to_list(1000)
    warnings = await db.warnings.find({"student_id": student_id}, {"_id": 0}).to_list(100)
    points_data = await db.student_points.find_one({"student_id": student_id}, {"_id": 0})
    
    # Tracking stats
    total_prayers = sum(t["data"].get("prayers_count", 0) for t in tracking)
    total_quran_time = sum(t["data"].get("quran_sitting_minutes", 0) for t in tracking)
    total_family_recitation = sum(t["data"].get("family_recitation_count", 0) for t in tracking)

    # تقسيم ورق المتابعة (صلوات / جلوس مع القرآن) حسب المدة + آخر ورقة مُسلَّمة
    tracking_split = {}
    for period in ("week", "month", "term"):
        p_from, p_to = _tracking_period_bounds(period)
        scoped = [t for t in tracking
                  if not p_from or (p_from <= (t.get("week_start") or "") <= p_to)]
        pr = si = 0
        for t in scoped:
            a, b = _sheet_prayers_sitting(t)
            pr += a
            si += b
        tracking_split[period] = {"sheets": len(scoped), "prayers": pr, "sitting": si}

    last_tracking_sheet = _summarize_last_sheet(tracking)
    
    # Detailed tracking breakdown
    total_adhkar = sum(t["data"].get("adhkar_after_prayer", 0) for t in tracking)
    total_sunnah = sum(t["data"].get("sunnah_prayers", 0) for t in tracking)
    total_witr = sum(t["data"].get("witr_prayer", 0) for t in tracking)
    total_duha = sum(t["data"].get("duha_prayer", 0) for t in tracking)
    
    # New recitation calculations — كل التسميعات (بما فيها "combined") تُحتسب في الحفظ الجديد والمراجعة (#8)
    total_new_pages = sum(_new_pages_of(r) for r in recitations)
    total_review_pages = sum(r.get("review_pages", 0) or 0 for r in recitations)
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
    
    # Calculate total memorization (previous + new) — الأجزاء المحفوظة تشمل القوية والضعيفة (#3)
    previous_juz = sorted(student_memorized_prev_juz(student))
    previous_pages = student.get("previous_memorization_pages") or 0
    total_previous = pages_for_juz_list(previous_juz) + previous_pages
    total_memorized = total_previous + total_new_pages
    
    # حساب بيانات ورقة المتابعة - الأسبوعية والفصلية
    today = datetime.now(timezone.utc)
    # الأسبوع يبدأ السبت — نفس بداية الأسبوع التي تُحفظ بها الأوراق
    current_week_start = get_current_week_start()
    
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
            "initial_assessment_done": student.get("initial_assessment_done", False),
            "annual_competition": student.get("annual_competition", False),
            "annual_competition_juz": student.get("annual_competition_juz") or [],
            "young_hafiz": student.get("young_hafiz", False),
            "young_hafiz_juz": student.get("young_hafiz_juz") or []
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
            "sheets_count": len(tracking),
            # تقسيم الصلوات/الجلوس حسب المدة (أسبوع/شهر/فصل) + آخر ورقة مُسلَّمة
            "split": tracking_split,
            "last_sheet": last_tracking_sheet,
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
            "recitation_rate": recitation_rate,  # نسبة التسميع = أيام التسميع / إجمالي الأيام
            # أسماء مختصرة تقرأها صفحة "تقدمي" (إصلاح عدم انعكاس التسميع)
            "total": len([r for r in recitations if not r.get("did_not_recite")]),  # مرات التسميع
            "new_memorization": total_new_pages,  # صفحات الحفظ الجديد
            "review": total_review_pages,  # صفحات المراجعة
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
    ensure_role(current_user, ["admin", "sheikh"], "غير مصرح لك")
    
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
    ensure_role(current_user, ["admin", "sheikh"], "غير مصرح لك")
    
    query = {}
    if role:
        query["role"] = role
    
    if current_user["role"] == "sheikh":
        # Sheikh can only see students in their groups
        groups = await db.groups.find({"sheikh_ids": current_user["user_id"]}, {"_id": 0, "id": 1}).to_list(100)
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
    ensure_role(current_user, "student", "هذه الخدمة للطلاب فقط")
    
    student_id = current_user["user_id"]
    
    # Get student info
    student = await db.users.find_one({"id": student_id}, {"_id": 0, "password_hash": 0})
    if not student:
        raise HTTPException(status_code=404, detail="الطالب غير موجود")
    
    return student

@api_router.put("/students/me/profile")
async def update_my_profile(data: StudentSelfUpdate, current_user: dict = Depends(get_current_user)):
    """Update own profile (Student only - limited fields)"""
    ensure_role(current_user, "student", "هذه الخدمة للطلاب فقط")
    
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

# نموذج تعديل بيانات الطالب من المشرف
class SheikhUpdateStudent(BaseModel):
    """الحقول المسموح للمشرف بتعديلها"""
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

    # آخر ورقة متابعة مُسلَّمة (الأحدث حسب أسبوعها)
    last_tracking_sheet = _summarize_last_sheet(tracking_sheets)

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
        "last_tracking_sheet": last_tracking_sheet,
        "warnings": warnings
    }

@api_router.put("/students/{student_id}")
async def update_student(student_id: str, data: StudentProfileUpdate, current_user: dict = Depends(get_current_user)):
    """Update student profile (Admin only)"""
    ensure_role(current_user, "admin", "فقط المدير يمكنه تعديل بيانات الطالب")
    
    # Check if student exists
    student = await db.users.find_one({"id": student_id, "role": "student"})
    if not student:
        raise HTTPException(status_code=404, detail="الطالب غير موجود")
    
    # المدير يعدّل كل البيانات الشخصية للطالب (كل الحقول المُرسَلة فقط)
    update_data = data.model_dump(exclude_unset=True)
    # حقول لا يجوز تعديلها من هنا (حماية)
    for protected in ("id", "email", "role", "password", "password_hash"):
        update_data.pop(protected, None)

    if update_data:
        await db.users.update_one({"id": student_id}, {"$set": update_data})

    return {"message": "تم تحديث بيانات الطالب بنجاح"}

@api_router.put("/admin/sheikhs/{sheikh_id}")
async def admin_update_sheikh(sheikh_id: str, data: AdminSheikhUpdate, current_user: dict = Depends(get_current_user)):
    """تعديل البيانات الشخصية للمشرف — المدير فقط."""
    ensure_role(current_user, "admin", "فقط المدير يمكنه تعديل بيانات المشرف")

    sheikh = await db.users.find_one({"id": sheikh_id, "role": "sheikh"})
    if not sheikh:
        raise HTTPException(status_code=404, detail="المشرف غير موجود")

    update_data = data.model_dump(exclude_unset=True)
    for protected in ("id", "email", "role", "password", "password_hash"):
        update_data.pop(protected, None)

    if update_data:
        await db.users.update_one({"id": sheikh_id}, {"$set": update_data})
        await log_admin_action(current_user, "user_update", "sheikh", sheikh_id, sheikh.get("name"),
                               "تعديل بيانات المشرف: " + "، ".join(update_data.keys()))

    return {"message": "تم تحديث بيانات المشرف بنجاح"}

@api_router.delete("/students/{student_id}")
async def delete_student(student_id: str, current_user: dict = Depends(get_current_user)):
    """Delete student (Admin only)"""
    ensure_role(current_user, "admin", "فقط المدير يمكنه حذف الطالب")
    
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
    await db.points_adjustments.delete_many({"student_id": student_id})
    await db.notifications.delete_many({"user_id": student_id})

    await log_admin_action(current_user, "user_delete", "student", student_id, student.get("name"),
                           "حذف طالب وجميع بياناته")

    return {"message": "تم حذف الطالب وجميع بياناته بنجاح"}

@api_router.post("/students/{student_id}/change-group")
async def change_student_group(student_id: str, group_id: str, move_data: bool = True,
                               mode: Optional[str] = None,
                               current_user: dict = Depends(get_current_user)):
    """نقل طالب لمجموعة (المدير فقط).
    mode: with_data (نقل البيانات لمشرف المجموعة الجديدة) | keep_old (تبقى مع القديم) |
    fresh_start (أرشفة البيانات وتصفيرها ليبدأ من جديد). `move_data` مدعوم للتوافق الخلفي."""
    ensure_role(current_user, "admin", "فقط المدير يمكنه نقل الطالب")

    effective_mode = mode or ("with_data" if move_data else "keep_old")
    if effective_mode not in TRANSFER_MODES:
        raise HTTPException(status_code=400, detail="وضع النقل غير صحيح")

    # Check if student exists
    student = await db.users.find_one({"id": student_id, "role": "student"})
    if not student:
        raise HTTPException(status_code=404, detail="الطالب غير موجود")

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

    archived = None
    if effective_mode == "with_data" and new_sheikh_id:
        # نقل السجلات لمشرف المجموعة الجديدة
        await db.tracking_sheets.update_many(
            {"student_id": student_id},
            {"$set": {"sheikh_id": new_sheikh_id}}
        )
        await db.recitations.update_many(
            {"student_id": student_id},
            {"$set": {"sheikh_id": new_sheikh_id}}
        )
    elif effective_mode == "fresh_start":
        archived = await archive_and_reset_student(student_id, "نقل لمجموعة جديدة (بدء بيانات جديدة)")
        await log_admin_action(
            current_user, "transfer_fresh_start", "student", student_id, student.get("name"),
            f"أرشفة وتصفير: {archived['recitations']} تسميع، {archived['attendance']} حضور، "
            f"{archived['tracking_sheets']} ورقة متابعة"
        )

    # Create notification for student
    await create_notification_internal(
        student_id, "تم نقلك إلى مجموعة جديدة", TRANSFER_NOTES[effective_mode], "info"
    )

    return {
        "message": "تم نقل الطالب بنجاح",
        "mode": effective_mode,
        "archived": archived,
    }


# ============== N4 - العمليات الجماعية ==============
class BulkIdsRequest(BaseModel):
    user_ids: List[str]


class BulkGroupRequest(BaseModel):
    student_ids: List[str]
    group_id: Optional[str] = None
    move_data: bool = True  # (قديم — للتوافق الخلفي) يُترجم إلى with_data / keep_old
    mode: Optional[str] = None  # with_data | keep_old | fresh_start


class BulkNotifyRequest(BaseModel):
    user_ids: List[str]
    title: str
    message: str


@api_router.post("/admin/bulk/activate")
async def bulk_activate(data: BulkIdsRequest, current_user: dict = Depends(get_current_user)):
    """N4 — اعتماد/تفعيل عدة حسابات معلّقة دفعةً واحدة."""
    ensure_role(current_user, "admin", "غير مصرح لك")
    result = await db.users.update_many(
        {"id": {"$in": data.user_ids}},
        {"$set": {"is_activated": True, "is_active": True, "activation_code": None}},
    )
    for uid in data.user_ids:
        await create_notification_internal(uid, "تم تفعيل حسابك", "تم اعتماد حسابك من الإدارة. يمكنك استخدام النظام الآن.", "success")

    # توليد رسوم السنة للطلاب الذين تم اعتمادهم للتو
    activated_students = await db.users.find(
        {"id": {"$in": data.user_ids}, "role": "student"}, {"_id": 0, "id": 1}
    ).to_list(10000)
    fees_created = 0
    for s in activated_students:
        fees_created += await auto_generate_fees_for_new_student(s["id"], current_user["user_id"])

    return {"message": f"تم تفعيل {result.modified_count} حساب", "count": result.modified_count,
            "fees_created": fees_created}


# أوضاع نقل الطالب بين المجموعات
TRANSFER_MODES = ("with_data", "keep_old", "fresh_start")

TRANSFER_NOTES = {
    "with_data": "تم نقلك إلى مجموعة أخرى مع الحفاظ على جميع بياناتك.",
    "keep_old": "تم نقلك إلى مجموعة أخرى (بياناتك السابقة تبقى مع مجموعتك القديمة).",
    "fresh_start": "تم نقلك إلى مجموعة أخرى وبدأت بصفحة جديدة — بياناتك السابقة مؤرشفة لدى الإدارة.",
}


async def archive_and_reset_student(student_id: str, reason: str = "نقل لمجموعة جديدة") -> dict:
    """أرشفة بيانات الطالب (تسميع/حضور/متابعة) ثم تصفيرها ليبدأ من الصفر.
    البيانات تنتقل لمجموعات الأرشيف ولا تُحذف — قابلة للاسترجاع."""
    now_iso = datetime.now(timezone.utc).isoformat()
    active_term_id = await get_active_term_id()

    counts = {"recitations": 0, "attendance": 0, "tracking_sheets": 0, "points_adjustments": 0}

    # 1) التسميع
    recs = await db.recitations.find({"student_id": student_id}, {"_id": 0}).to_list(100000)
    if recs:
        for r in recs:
            r["archived_at"] = now_iso
            r["archive_reason"] = reason
            r.setdefault("term_id", active_term_id)
        await db.recitations_archives.insert_many(recs)
        await db.recitations.delete_many({"student_id": student_id})
        counts["recitations"] = len(recs)

    # 2) الحضور
    atts = await db.attendance.find({"student_id": student_id}, {"_id": 0}).to_list(100000)
    if atts:
        for a in atts:
            a["archived_at"] = now_iso
            a["archive_reason"] = reason
            a.setdefault("term_id", active_term_id)
        await db.attendance_archives.insert_many(atts)
        await db.attendance.delete_many({"student_id": student_id})
        counts["attendance"] = len(atts)

    # 3) ورق المتابعة
    sheets = await db.tracking_sheets.find({"student_id": student_id}, {"_id": 0}).to_list(100000)
    if sheets:
        for s in sheets:
            s["archived_at"] = now_iso
            s["archive_reason"] = reason
            s.setdefault("term_id", active_term_id)
        await db.tracking_sheets_archives.insert_many(sheets)
        await db.tracking_sheets.delete_many({"student_id": student_id})
        counts["tracking_sheets"] = len(sheets)

    # 4) أرشفة التعديلات اليدوية على النقاط ثم إزالتها (وإلا رجّعها recompute)
    adjustments = await db.points_adjustments.find({"student_id": student_id}, {"_id": 0}).to_list(100000)
    if adjustments:
        for a in adjustments:
            a["archived_at"] = now_iso
            a["archive_reason"] = reason
        await db.points_adjustments_archives.insert_many(adjustments)
        await db.points_adjustments.delete_many({"student_id": student_id})
        counts["points_adjustments"] = len(adjustments)

    # 5) تصفير النقاط
    await db.student_points.update_one(
        {"student_id": student_id},
        {"$set": {
            "total_points": 0, "current_term_points": 0, "attendance_points": 0,
            "recitation_points": 0, "tracking_points": 0, "bonus_points": 0,
            "interaction_points": 0, "admin_bonus_points": 0,
            "manual_points": 0, "frozen_points": 0, "available_points": 0,
        }},
        upsert=True,
    )
    await db.points_transactions.delete_many({"student_id": student_id})

    return counts


@api_router.post("/admin/bulk/change-group")
async def bulk_change_group(data: BulkGroupRequest, current_user: dict = Depends(get_current_user)):
    """N4 — نقل عدة طلاب إلى مجموعة واحدة دفعةً واحدة.
    الأوضاع: with_data (نقل البيانات للمشرف الجديد) / keep_old (تبقى مع القديم) /
    fresh_start (أرشفة البيانات وتصفيرها ليبدأ الطالب من جديد)."""
    ensure_role(current_user, "admin", "غير مصرح لك")

    # وضع النقل — مع دعم الحقل القديم move_data للتوافق الخلفي
    mode = data.mode or ("with_data" if data.move_data else "keep_old")
    if mode not in TRANSFER_MODES:
        raise HTTPException(status_code=400, detail="وضع النقل غير صحيح")

    new_sheikh_id = None
    if data.group_id:
        group = await db.groups.find_one({"id": data.group_id}, {"_id": 0, "sheikh_id": 1})
        if not group:
            raise HTTPException(status_code=404, detail="المجموعة غير موجودة")
        new_sheikh_id = group.get("sheikh_id")

    result = await db.users.update_many(
        {"id": {"$in": data.student_ids}, "role": "student"},
        {"$set": {"group_id": data.group_id}},
    )

    archived_totals = {"recitations": 0, "attendance": 0, "tracking_sheets": 0}

    if mode == "with_data" and new_sheikh_id:
        # نقل السجلات لمشرف المجموعة الجديدة
        await db.tracking_sheets.update_many({"student_id": {"$in": data.student_ids}}, {"$set": {"sheikh_id": new_sheikh_id}})
        await db.recitations.update_many({"student_id": {"$in": data.student_ids}}, {"$set": {"sheikh_id": new_sheikh_id}})
    elif mode == "fresh_start":
        # أرشفة ثم تصفير لكل طالب
        for sid in data.student_ids:
            c = await archive_and_reset_student(sid, "نقل لمجموعة جديدة (بدء بيانات جديدة)")
            for k in archived_totals:
                archived_totals[k] += c[k]

    note = TRANSFER_NOTES[mode]
    for sid in data.student_ids:
        await create_notification_internal(sid, "تم نقلك إلى مجموعة جديدة", note, "info")

    if mode == "fresh_start":
        await log_admin_action(
            current_user, "transfer_fresh_start", "student", None, None,
            f"نقل {result.modified_count} طالب مع أرشفة وتصفير — "
            f"{archived_totals['recitations']} تسميع، {archived_totals['attendance']} حضور، "
            f"{archived_totals['tracking_sheets']} ورقة متابعة"
        )

    return {
        "message": f"تم نقل {result.modified_count} طالب",
        "count": result.modified_count,
        "mode": mode,
        "archived": archived_totals if mode == "fresh_start" else None,
    }


@api_router.post("/admin/bulk/notify")
async def bulk_notify(data: BulkNotifyRequest, current_user: dict = Depends(get_current_user)):
    """N4 — إرسال إشعار جماعي لعدة مستخدمين."""
    ensure_role(current_user, "admin", "غير مصرح لك")
    if not data.title.strip() or not data.message.strip():
        raise HTTPException(status_code=400, detail="العنوان والنص مطلوبان")
    for uid in data.user_ids:
        await create_notification_internal(uid, data.title.strip(), data.message.strip(), "info", "announcement")
    return {"message": f"تم إرسال {len(data.user_ids)} إشعار", "count": len(data.user_ids)}


# ============== T4 - مراسلة المشرف لطلابه ==============
class SheikhMessageRequest(BaseModel):
    title: str
    message: str
    group_id: Optional[str] = None  # مجموعة محددة، أو كل طلاب المشرف


@api_router.post("/sheikh/message")
async def sheikh_message_students(data: SheikhMessageRequest, current_user: dict = Depends(get_current_user)):
    """T4 — المشرف يرسل رسالة (إشعار) لطلابه (مجموعة محددة أو كل مجموعاته)."""
    ensure_role(current_user, "sheikh", "هذه الخدمة للمشرفين")
    if not data.title.strip() or not data.message.strip():
        raise HTTPException(status_code=400, detail="العنوان والنص مطلوبان")
    gids = await _sheikh_group_ids(current_user["user_id"])
    if data.group_id:
        if data.group_id not in gids:
            raise HTTPException(status_code=403, detail="هذه المجموعة ليست لك")
        target_gids = [data.group_id]
    else:
        target_gids = gids
    students = await db.users.find({"role": "student", "group_id": {"$in": target_gids}}, {"_id": 0, "id": 1}).to_list(5000)
    title = f"رسالة من مشرفك: {data.title.strip()}"
    for s in students:
        await create_notification_internal(s["id"], title, data.message.strip(), "info", "announcement")
    return {"message": f"تم إرسال الرسالة إلى {len(students)} طالب", "count": len(students)}


# ============== المحادثات ==============
# نوعان من المحادثات:
#  1) محادثة الطالب: غرفة ثلاثية — الطالب + مشرفه + المدير. الثلاثة يقرأون ويكتبون.
#  2) محادثة مدير↔مشرف: ثنائية مباشرة.
# الرسائل كلها في `chat_messages`؛ الرسائل القديمة (طالب↔مشرف) تبقى شغّالة
# لأن `student_id` موجود فيها والغرفة الثلاثية مبنية على نفس المفتاح.

class ChatSendRequest(BaseModel):
    text: str
    student_id: Optional[str] = None  # لمحادثة الطالب (الطالب يستخدم نفسه تلقائيًا)
    sheikh_id: Optional[str] = None   # لمحادثة المدير↔المشرف المباشرة


async def _student_room(current_user: dict, student_id_param: Optional[str]):
    """يحدّد (student_id, sheikh_id) لغرفة الطالب الثلاثية حسب دور المستخدم."""
    role = current_user["role"]
    if role == "student":
        sid = current_user["user_id"]
        return sid, await get_sheikh_id_for_student(sid)
    if role == "sheikh":
        if not student_id_param:
            return None, None
        gids = await _sheikh_group_ids(current_user["user_id"])
        stu = await db.users.find_one({"id": student_id_param, "role": "student"}, {"_id": 0, "group_id": 1})
        if not stu or stu.get("group_id") not in gids:
            raise HTTPException(status_code=403, detail="هذا الطالب ليس ضمن مجموعاتك")
        return student_id_param, current_user["user_id"]
    if role == "admin" and student_id_param:
        return student_id_param, await get_sheikh_id_for_student(student_id_param)
    return None, None


def _read_flag(role: str) -> str:
    return {"student": "read_by_student", "sheikh": "read_by_sheikh", "admin": "read_by_admin"}[role]


@api_router.post("/chat/send")
async def chat_send(data: ChatSendRequest, current_user: dict = Depends(get_current_user)):
    """إرسال رسالة. المدير يقدر يكتب في غرفة أي طالب، أو يفتح محادثة مباشرة مع مشرف."""
    ensure_role(current_user, ["student", "sheikh", "admin"], "غير مصرح لك")
    text = data.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="النص مطلوب")

    role = current_user["role"]
    now = datetime.now(timezone.utc).isoformat()
    sender_name = current_user.get("name") or ""

    # ── محادثة مدير↔مشرف المباشرة ──
    if data.sheikh_id and not data.student_id and role in ("admin", "sheikh"):
        target_sheikh = data.sheikh_id if role == "admin" else current_user["user_id"]
        sh = await db.users.find_one({"id": target_sheikh, "role": "sheikh"}, {"_id": 0, "id": 1, "name": 1})
        if not sh:
            raise HTTPException(status_code=404, detail="المشرف غير موجود")
        msg = {
            "id": str(uuid.uuid4()),
            "kind": "admin_sheikh",
            "student_id": None,
            "sheikh_id": target_sheikh,
            "sender_role": role,
            "sender_id": current_user["user_id"],
            "sender_name": sender_name,
            "text": text,
            "created_at": now,
            "read_by_sheikh": role == "sheikh",
            "read_by_admin": role == "admin",
        }
        await db.chat_messages.insert_one(dict(msg))
        if role == "admin":
            await create_notification_internal(target_sheikh, "رسالة من الإدارة", text[:80], "info", "chat")
        else:
            for adm in await db.users.find({"role": "admin"}, {"_id": 0, "id": 1}).to_list(100):
                await create_notification_internal(adm["id"], f"رسالة من المشرف {sender_name}", text[:80], "info", "chat")
        msg.pop("_id", None)
        return {"message": "تم الإرسال", "chat": msg}

    # ── غرفة الطالب الثلاثية ──
    sid, shid = await _student_room(current_user, data.student_id)
    if not sid:
        raise HTTPException(status_code=400, detail="لا يمكن تحديد المحادثة")

    msg = {
        "id": str(uuid.uuid4()),
        "kind": "student_room",
        "student_id": sid,
        "sheikh_id": shid,
        "sender_role": role,
        "sender_id": current_user["user_id"],
        "sender_name": sender_name,
        "text": text,
        "created_at": now,
        "read_by_student": role == "student",
        "read_by_sheikh": role == "sheikh",
        "read_by_admin": role == "admin",
    }
    await db.chat_messages.insert_one(dict(msg))

    # إشعار لبقية أطراف الغرفة
    stu = await db.users.find_one({"id": sid}, {"_id": 0, "name": 1})
    stu_name = (stu or {}).get("name", "")
    if role == "student":
        if shid:
            await create_notification_internal(shid, f"رسالة من الطالب {stu_name}", text[:80], "info", "chat")
        for adm in await db.users.find({"role": "admin"}, {"_id": 0, "id": 1}).to_list(100):
            await create_notification_internal(adm["id"], f"رسالة من الطالب {stu_name}", text[:80], "info", "chat")
    elif role == "sheikh":
        await create_notification_internal(sid, "رسالة من مشرفك", text[:80], "info", "chat")
        for adm in await db.users.find({"role": "admin"}, {"_id": 0, "id": 1}).to_list(100):
            await create_notification_internal(adm["id"], f"رسالة من المشرف {sender_name} (محادثة {stu_name})", text[:80], "info", "chat")
    else:  # admin
        await create_notification_internal(sid, "رسالة من الإدارة", text[:80], "info", "chat")
        if shid:
            await create_notification_internal(shid, f"رسالة من الإدارة (محادثة {stu_name})", text[:80], "info", "chat")

    msg.pop("_id", None)
    return {"message": "تم الإرسال", "chat": msg}


@api_router.get("/chat/messages")
async def chat_messages(student_id: Optional[str] = None, sheikh_id: Optional[str] = None,
                        current_user: dict = Depends(get_current_user)):
    """رسائل محادثة. مع `sheikh_id` وبدون `student_id` = محادثة مدير↔مشرف؛
    غير ذلك = غرفة الطالب الثلاثية."""
    ensure_role(current_user, ["student", "sheikh", "admin"], "غير مصرح لك")
    role = current_user["role"]

    # محادثة مدير↔مشرف
    if sheikh_id and not student_id and role in ("admin", "sheikh"):
        target = sheikh_id if role == "admin" else current_user["user_id"]
        q = {"kind": "admin_sheikh", "sheikh_id": target}
        msgs = await db.chat_messages.find(q, {"_id": 0}).sort("created_at", 1).to_list(2000)
        await db.chat_messages.update_many(
            {**q, _read_flag(role): {"$ne": True}}, {"$set": {_read_flag(role): True}}
        )
        return {"messages": msgs, "student_id": None, "sheikh_id": target, "kind": "admin_sheikh"}

    # غرفة الطالب
    sid, shid = await _student_room(current_user, student_id)
    if not sid:
        return {"messages": [], "student_id": None, "sheikh_id": None, "kind": "student_room"}

    # كل رسائل الطالب (بما فيها القديمة اللي بلا kind)
    q = {"student_id": sid, "kind": {"$ne": "admin_sheikh"}}
    msgs = await db.chat_messages.find(q, {"_id": 0}).sort("created_at", 1).to_list(2000)
    await db.chat_messages.update_many(
        {**q, _read_flag(role): {"$ne": True}}, {"$set": {_read_flag(role): True}}
    )
    return {"messages": msgs, "student_id": sid, "sheikh_id": shid, "kind": "student_room"}


@api_router.get("/chat/conversations")
async def chat_conversations(current_user: dict = Depends(get_current_user)):
    """قائمة المحادثات. المشرف: طلابه + محادثته مع الإدارة.
    المدير: كل غرف الطلاب + محادثة مع كل مشرف."""
    ensure_role(current_user, ["sheikh", "admin"], "غير مصرح لك")
    role = current_user["role"]
    flag = _read_flag(role)

    if role == "sheikh":
        gids = await _sheikh_group_ids(current_user["user_id"])
        students = await db.users.find(
            {"role": "student", "group_id": {"$in": gids}}, {"_id": 0, "id": 1, "name": 1}
        ).to_list(5000)
    else:
        students = await db.users.find(
            {"role": "student"}, {"_id": 0, "id": 1, "name": 1, "group_id": 1}
        ).to_list(10000)
    sids = [s["id"] for s in students]

    # كل رسائل غرف الطلاب دفعة واحدة (بدون N+1)
    msgs = await db.chat_messages.find(
        {"student_id": {"$in": sids}, "kind": {"$ne": "admin_sheikh"}},
        {"_id": 0, "student_id": 1, "text": 1, "created_at": 1, "sender_role": 1, flag: 1},
    ).to_list(200000)

    last_by, unread_by = {}, {}
    for m in msgs:
        sid = m["student_id"]
        if m.get("created_at", "") > (last_by.get(sid, {}).get("created_at") or ""):
            last_by[sid] = m
        # غير المقروء = رسائل الآخرين اللي ما قرأها هذا الدور
        if m.get("sender_role") != role and not m.get(flag):
            unread_by[sid] = unread_by.get(sid, 0) + 1

    convos = []
    for s in students:
        last = last_by.get(s["id"])
        if role == "admin" and not last:
            continue  # المدير يرى الغرف اللي فيها رسائل فقط
        convos.append({
            "type": "student_room",
            "student_id": s["id"],
            "student_name": s["name"],
            "last_text": (last or {}).get("text", ""),
            "last_at": (last or {}).get("created_at"),
            "unread": unread_by.get(s["id"], 0),
        })

    # محادثات مدير↔مشرف
    if role == "admin":
        sheikhs = await db.users.find({"role": "sheikh"}, {"_id": 0, "id": 1, "name": 1}).to_list(500)
    else:
        sheikhs = [{"id": current_user["user_id"], "name": "الإدارة"}]

    sh_ids = [s["id"] for s in sheikhs]
    sh_msgs = await db.chat_messages.find(
        {"kind": "admin_sheikh", "sheikh_id": {"$in": sh_ids}},
        {"_id": 0, "sheikh_id": 1, "text": 1, "created_at": 1, "sender_role": 1, flag: 1},
    ).to_list(100000)

    sh_last, sh_unread = {}, {}
    for m in sh_msgs:
        k = m["sheikh_id"]
        if m.get("created_at", "") > (sh_last.get(k, {}).get("created_at") or ""):
            sh_last[k] = m
        if m.get("sender_role") != role and not m.get(flag):
            sh_unread[k] = sh_unread.get(k, 0) + 1

    for sh in sheikhs:
        last = sh_last.get(sh["id"])
        convos.append({
            "type": "admin_sheikh",
            "sheikh_id": sh["id"],
            "sheikh_name": sh["name"] if role == "admin" else "الإدارة",
            "last_text": (last or {}).get("text", ""),
            "last_at": (last or {}).get("created_at"),
            "unread": sh_unread.get(sh["id"], 0),
        })

    convos.sort(key=lambda c: (c["last_at"] or ""), reverse=True)
    return {"conversations": convos}


@api_router.get("/chat/unread-count")
async def chat_unread_count(current_user: dict = Depends(get_current_user)):
    """عدد الرسائل غير المقروءة للمستخدم (للزر العائم)."""
    role = current_user["role"]
    uid = current_user["user_id"]
    flag = _read_flag(role)

    if role == "student":
        n = await db.chat_messages.count_documents({
            "student_id": uid, "kind": {"$ne": "admin_sheikh"},
            "sender_role": {"$ne": "student"}, flag: {"$ne": True},
        })
    elif role == "sheikh":
        gids = await _sheikh_group_ids(uid)
        sids = [u["id"] for u in await db.users.find(
            {"role": "student", "group_id": {"$in": gids}}, {"_id": 0, "id": 1}
        ).to_list(10000)]
        n = await db.chat_messages.count_documents({
            "$or": [
                {"student_id": {"$in": sids}, "kind": {"$ne": "admin_sheikh"}},
                {"kind": "admin_sheikh", "sheikh_id": uid},
            ],
            "sender_role": {"$ne": "sheikh"}, flag: {"$ne": True},
        })
    else:  # admin
        n = await db.chat_messages.count_documents({
            "sender_role": {"$ne": "admin"}, flag: {"$ne": True},
        })
    return {"unread": n}


@api_router.delete("/chat/messages/{message_id}")
async def chat_delete_message(message_id: str, current_user: dict = Depends(get_current_user)):
    """المدير يحذف رسالة واحدة من أي محادثة."""
    ensure_role(current_user, "admin", "فقط المدير يمكنه حذف الرسائل")
    msg = await db.chat_messages.find_one({"id": message_id}, {"_id": 0, "id": 1, "text": 1})
    if not msg:
        raise HTTPException(status_code=404, detail="الرسالة غير موجودة")
    await db.chat_messages.delete_one({"id": message_id})
    await log_admin_action(current_user, "chat_delete", "chat_message", message_id,
                           details=f"حذف رسالة: {(msg.get('text') or '')[:60]}")
    return {"message": "تم حذف الرسالة"}


@api_router.delete("/chat/conversation")
async def chat_delete_conversation(student_id: Optional[str] = None, sheikh_id: Optional[str] = None,
                                   current_user: dict = Depends(get_current_user)):
    """المدير يحذف محادثة كاملة: غرفة طالب (`student_id`) أو محادثة الإدارة مع مشرف (`sheikh_id`)."""
    ensure_role(current_user, "admin", "فقط المدير يمكنه حذف المحادثات")
    if student_id:
        q = {"student_id": student_id, "kind": {"$ne": "admin_sheikh"}}
        target = await db.users.find_one({"id": student_id}, {"_id": 0, "name": 1})
    elif sheikh_id:
        q = {"kind": "admin_sheikh", "sheikh_id": sheikh_id}
        target = await db.users.find_one({"id": sheikh_id}, {"_id": 0, "name": 1})
    else:
        raise HTTPException(status_code=400, detail="يجب تحديد المحادثة")
    res = await db.chat_messages.delete_many(q)
    await log_admin_action(current_user, "chat_delete", "chat", student_id or sheikh_id,
                           (target or {}).get("name"), f"حذف محادثة كاملة ({res.deleted_count} رسالة)")
    return {"message": f"تم حذف المحادثة ({res.deleted_count} رسالة)", "deleted": res.deleted_count}


# ============== المتصلون الآن ==============
# كل واجهة مفتوحة ترسل نبضة كل دقيقة؛ المستخدم «متصل» إذا وصلت نبضته خلال آخر دقيقتين.
ONLINE_WINDOW_SECONDS = 120


@api_router.post("/presence/ping")
async def presence_ping(current_user: dict = Depends(get_current_user)):
    await db.users.update_one({"id": current_user["user_id"]},
                              {"$set": {"last_seen": datetime.now(timezone.utc).isoformat()}})
    return {"ok": True}


@api_router.post("/presence/offline")
async def presence_offline(current_user: dict = Depends(get_current_user)):
    await db.users.update_one({"id": current_user["user_id"]}, {"$set": {"last_seen": None}})
    return {"ok": True}


@api_router.get("/admin/online-users")
async def online_users(current_user: dict = Depends(get_current_user)):
    """الطلاب والمشرفون المتصلون الآن (للمدير)."""
    ensure_role(current_user, "admin", "فقط المدير يمكنه عرض المتصلين")
    since = (datetime.now(timezone.utc) - timedelta(seconds=ONLINE_WINDOW_SECONDS)).isoformat()
    users = await db.users.find(
        {"role": {"$in": ["student", "sheikh"]}, "last_seen": {"$gte": since}},
        {"_id": 0, "id": 1, "name": 1, "role": 1, "group_id": 1, "last_seen": 1},
    ).sort("name", 1).to_list(2000)
    gids = list({u["group_id"] for u in users if u.get("group_id")})
    groups = {g["id"]: g["name"] for g in await db.groups.find({"id": {"$in": gids}}, {"_id": 0, "id": 1, "name": 1}).to_list(500)}
    for u in users:
        u["group_name"] = groups.get(u.get("group_id"))
    return {
        "students": [u for u in users if u["role"] == "student"],
        "sheikhs": [u for u in users if u["role"] == "sheikh"],
    }


# ============== T5 - مؤشرات الواجبات والاختبارات للمشرف ==============
@api_router.get("/sheikh/assignment-stats")
async def sheikh_assignment_stats(current_user: dict = Depends(get_current_user)):
    """T5 — نِسَب تسليم الواجبات والاختبارات ومتوسط الدرجات لمجموعات المشرف."""
    ensure_role(current_user, ["sheikh", "admin"], "غير مصرح لك")

    hw_query = {} if current_user["role"] == "admin" else {"created_by": current_user["user_id"]}
    homeworks = await db.homework.find(hw_query, {"_id": 0, "id": 1, "title": 1}).to_list(1000)
    hw_ids = [h["id"] for h in homeworks]
    subs = await db.homework_submissions.find({"homework_id": {"$in": hw_ids}}, {"_id": 0, "status": 1, "grade": 1}).to_list(100000)
    total_sub = len(subs)
    submitted = sum(1 for s in subs if s.get("status") in ("submitted", "graded"))
    graded = [s for s in subs if s.get("status") == "graded" and s.get("grade") is not None]
    hw_avg = round(sum(s["grade"] for s in graded) / len(graded), 1) if graded else 0

    ex_query = {} if current_user["role"] == "admin" else {"created_by": current_user["user_id"]}
    exams = await db.online_exams.find(ex_query, {"_id": 0, "id": 1}).to_list(1000)
    ex_ids = [e["id"] for e in exams]
    ex_subs = await db.exam_submissions.find({"exam_id": {"$in": ex_ids}}, {"_id": 0, "score": 1, "passed": 1}).to_list(100000)
    ex_count = len(ex_subs)
    ex_avg = round(sum(s.get("score", 0) for s in ex_subs) / ex_count, 1) if ex_count else 0
    ex_pass = round(sum(1 for s in ex_subs if s.get("passed")) / ex_count * 100, 1) if ex_count else 0

    return {
        "homework": {
            "count": len(homeworks),
            "total_assigned": total_sub,
            "submitted": submitted,
            "submission_rate": round(submitted / total_sub * 100, 1) if total_sub else 0,
            "graded": len(graded),
            "avg_grade": hw_avg,
        },
        "exams": {
            "count": len(exams),
            "attempts": ex_count,
            "avg_score": ex_avg,
            "pass_rate": ex_pass,
        },
    }


# نموذج لإضافة طالب من المدير أو المشرف (بدون كود التسجيل)
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
    ensure_role(current_user, ["admin", "sheikh"], "غير مصرح لك بإضافة طالب")
    
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
        
        # إذا كان المشرف هو من أضاف الطالب، نضيفه لمجموعته
        if current_user["role"] == "sheikh" and data.group_id:
            # التحقق من أن المجموعة تابعة للمشرف
            group = await db.groups.find_one({"id": data.group_id, "sheikh_ids": current_user["user_id"]})
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

        # توليد رسوم السنة الحالية تلقائيًا (إن كان مُفعَّلًا في الإعدادات)
        fees_created = await auto_generate_fees_for_new_student(user.id, current_user["user_id"])

        return {
            "message": "تمت إضافة الطالب بنجاح",
            "student_id": user.id,
            "student_name": user.name,
            "fees_created": fees_created
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"فشل في إضافة الطالب: {str(e)}")

class AdminCreateSheikh(BaseModel):
    email: str
    name: str
    password: str
    student_phone: Optional[str] = None   # هاتف المشرف (نفس الحقل المستخدم في نماذج المشرف)
    mosque_name: Optional[str] = None      # يُكتب يدويًا
    birth_date: Optional[str] = None
    specialization: Optional[str] = None
    experience_years: Optional[int] = None
    profile_image: Optional[str] = None
    group_id: Optional[str] = None         # ربط اختياري بمجموعة موجودة


@api_router.post("/admin/sheikhs")
async def admin_create_sheikh(data: AdminCreateSheikh, current_user: dict = Depends(get_current_user)):
    """إضافة مشرف جديد (المدير فقط) — الحساب مفعّل مباشرة."""
    ensure_role(current_user, "admin", "فقط المدير يمكنه إضافة مشرف")

    if not data.email or not data.name or not data.password:
        raise HTTPException(status_code=400, detail="الاسم والبريد الإلكتروني وكلمة المرور مطلوبة")

    if len(data.password) < 4:
        raise HTTPException(status_code=400, detail="كلمة المرور يجب أن تكون 4 أحرف على الأقل")

    existing = await db.users.find_one({"email": data.email})
    if existing:
        raise HTTPException(status_code=400, detail="البريد الإلكتروني مسجل مسبقاً")

    # التحقق من المجموعة قبل الإنشاء (إن اختيرت)
    group = None
    if data.group_id:
        group = await db.groups.find_one({"id": data.group_id}, {"_id": 0, "id": 1, "name": 1})
        if not group:
            raise HTTPException(status_code=404, detail="المجموعة غير موجودة")

    user = User(
        email=data.email,
        name=data.name,
        role="sheikh",
        mosque_name=data.mosque_name,
        birth_date=data.birth_date,
        profile_image=data.profile_image,
        student_phone=data.student_phone,
        is_active=True,
        is_activated=True
    )

    user_dict = user.model_dump()
    user_dict["password_hash"] = get_password_hash(data.password)
    user_dict["created_at"] = user_dict["created_at"].isoformat()
    user_dict["registration_date"] = user_dict["registration_date"].isoformat()
    user_dict["specialization"] = data.specialization
    user_dict["experience_years"] = data.experience_years

    await db.users.insert_one(user_dict)

    # إسناد المجموعة للمشرف الجديد إن اختيرت
    if group:
        await db.groups.update_one({"id": group["id"]}, {"$set": {"sheikh_id": user.id}})

    await log_admin_action(current_user, "create", "sheikh", user.id, user.name,
                           f"إضافة مشرف جديد{' وإسناد مجموعة ' + group['name'] if group else ''}")

    return {
        "message": "تمت إضافة المشرف بنجاح",
        "sheikh_id": user.id,
        "sheikh_name": user.name
    }


# ============== WARNING SYSTEM ==============

class WarningCreate(BaseModel):
    student_id: str
    type: str  # absence, no_recitation, behavior
    message: str

@api_router.post("/admin/warnings")
async def issue_warning(data: WarningCreate, current_user: dict = Depends(get_current_user)):
    """Issue a warning to a student (Admin only)"""
    ensure_role(current_user, "admin", "فقط المدير يمكنه إصدار الإنذارات")
    
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

    await log_admin_action(current_user, "warning", "student", data.student_id, student.get("name"),
                           f"إنذار: {warning_type_names.get(data.type, data.type)}")

    return {"message": "تم إصدار الإنذار بنجاح", "warning_id": warning["id"]}

@api_router.get("/admin/warnings")
async def get_all_warnings(
    student_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get all warnings (Admin only)"""
    ensure_role(current_user, "admin", "غير مصرح لك")
    
    query = {}
    if student_id:
        query["student_id"] = student_id
    
    warnings = await db.warnings.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
    return warnings

# تسميات أنواع الإنذارات — تشمل الصيغة الإنجليزية (إنذار المدير) والعربية (الإنذار التلقائي)
WARNING_TYPE_LABELS = {
    "absence": "غياب متكرر",
    "غياب": "غياب متكرر",
    "no_recitation": "عدم التسميع",
    "behavior": "سلوك سلبي",
}

WARNING_SEVERITY_LABELS = {"low": "خفيف", "medium": "متوسط", "high": "شديد"}


@api_router.get("/students/{student_id}/warnings")
async def get_student_warnings(student_id: str, current_user: dict = Depends(get_current_user)):
    """سجل إنذارات الطالب مع التفاصيل (النوع، الشدّة، مصدر الإنذار، التاريخ)."""
    # Verify access
    if current_user["role"] == "student" and current_user["user_id"] != student_id:
        raise HTTPException(status_code=403, detail="غير مصرح لك")

    warnings = await db.warnings.find(
        {"student_id": student_id},
        {"_id": 0}
    ).sort("created_at", -1).to_list(200)

    # أسماء مُصدري الإنذارات (دفعة واحدة — بدون N+1)
    issuer_ids = {w.get("admin_id") or w.get("sheikh_id") for w in warnings}
    issuer_ids.discard(None)
    issuer_names = {}
    if issuer_ids:
        issuer_names = {
            u["id"]: u.get("name", "")
            for u in await db.users.find(
                {"id": {"$in": list(issuer_ids)}}, {"_id": 0, "id": 1, "name": 1}
            ).to_list(500)
        }

    for w in warnings:
        raw_type = w.get("type", "")
        w["type_label"] = WARNING_TYPE_LABELS.get(raw_type, raw_type or "إنذار")
        w["severity_label"] = WARNING_SEVERITY_LABELS.get(w.get("severity"), "")
        issuer_id = w.get("admin_id") or w.get("sheikh_id")
        if w.get("auto_generated"):
            w["issued_by"] = "تلقائي (النظام)"
        else:
            w["issued_by"] = issuer_names.get(issuer_id, "الإدارة")
        # تاريخ موحّد للعرض
        w["display_date"] = w.get("date") or str(w.get("created_at") or "")[:10]

    return warnings

@api_router.delete("/admin/warnings/{warning_id}")
async def delete_warning(warning_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a warning (Admin only)"""
    ensure_role(current_user, "admin", "فقط المدير يمكنه حذف الإنذارات")
    
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
        "total_points": student_points.get("total_points", 0) + points,
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


async def sum_manual_adjustments(student_id: str) -> dict:
    """مجاميع تعديلات النقاط اليدوية من سجلّها (المصدر الموثوق).
    manual = الإضافات الخارجية ناقص الخصومات. frozen = مجموع التجميدات السارية."""
    adjustments = await db.points_adjustments.find(
        {"student_id": student_id}, {"_id": 0, "type": 1, "points": 1, "active": 1}
    ).to_list(100000)

    manual = frozen = 0
    for a in adjustments:
        pts = int(a.get("points") or 0)
        if a["type"] == "bonus":
            manual += pts
        elif a["type"] == "deduction":
            manual -= pts
        elif a["type"] == "freeze" and a.get("active"):
            frozen += pts
    return {"manual_points": manual, "frozen_points": frozen}


async def recompute_student_points(student_id: str) -> dict:
    """يعيد بناء نقاط الطالب من البيانات الخام (حضور + تسميع + متابعة) — مصدر موثوق واحد.
    التعديلات اليدوية والتجميد يُبنَيان من `points_adjustments` فما بيضيعوا مع إعادة الاحتساب.
    يحافظ على نقاط التفاعل والإداري (غير مشتقّة من الخام)."""
    present = await db.attendance.count_documents({"student_id": student_id, "status": "present"})
    attendance_points = present * ATTENDANCE_POINTS

    recs = await db.recitations.find(
        {"student_id": student_id, "did_not_recite": {"$ne": True}}, {"_id": 0, "points_earned": 1}
    ).to_list(100000)
    recitation_points = sum(r.get("points_earned", 0) or 0 for r in recs)

    tracks = await db.tracking_sheets.find({"student_id": student_id}, {"_id": 0, "points_earned": 1}).to_list(100000)
    tracking_points = sum(t.get("points_earned", 0) or 0 for t in tracks)

    existing = await db.student_points.find_one({"student_id": student_id}, {"_id": 0}) or {}
    interaction = existing.get("interaction_points", 0) or 0
    admin_bonus = existing.get("admin_bonus_points", 0) or 0

    adj = await sum_manual_adjustments(student_id)
    manual = adj["manual_points"]
    frozen = adj["frozen_points"]

    # الرصيد لا ينزل تحت الصفر مهما بلغت الخصومات
    total = max(0, attendance_points + recitation_points + tracking_points + interaction + admin_bonus + manual)
    available = max(0, total - frozen)

    await db.student_points.update_one(
        {"student_id": student_id},
        {"$set": {
            "student_id": student_id,
            "total_points": total,
            "attendance_points": attendance_points,
            "recitation_points": recitation_points,
            "tracking_points": tracking_points,
            "interaction_points": interaction,
            "admin_bonus_points": admin_bonus,
            "manual_points": manual,
            "frozen_points": frozen,
            "available_points": available,
            "level": calculate_level(total),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }, "$setOnInsert": {"id": str(uuid.uuid4()), "badges": []}},
        upsert=True,
    )
    return {"student_id": student_id, "total_points": total,
            "attendance_points": attendance_points, "recitation_points": recitation_points,
            "tracking_points": tracking_points, "manual_points": manual,
            "frozen_points": frozen, "available_points": available}


# ============== إدارة النقاط: إضافة خارجية / خصم / تجميد + السجل ==============
ADJUSTMENT_TYPES = ("bonus", "deduction", "freeze")

ADJUSTMENT_LABELS = {
    "bonus": "نقاط إضافية",
    "deduction": "خصم نقاط",
    "freeze": "تجميد نقاط",
}

# صيغة الفعل لرسالة النجاح (اللافتة وحدها بتطلع ركيكة: «تم نقاط إضافية»)
ADJUSTMENT_DONE_TEXTS = {
    "bonus": "تمت إضافة النقاط بنجاح",
    "deduction": "تم خصم النقاط بنجاح",
    "freeze": "تم تجميد النقاط بنجاح",
}

# تسميات مصادر النقاط في السجل
LEDGER_SOURCE_LABELS = {
    "attendance": "حضور",
    "recitation": "تسميع",
    "tracking": "ورقة متابعة",
    "admin_bonus": "نقاط تميز",
    "bonus": "نقاط إضافية (يدوي)",
    "deduction": "خصم (يدوي)",
    "freeze": "تجميد",
}


async def assert_can_manage_student_points(current_user: dict, student_id: str):
    """المدير لأي طالب؛ المشرف لطلاب مجموعاته فقط."""
    ensure_role(current_user, ["admin", "sheikh"], "غير مصرح لك بإدارة النقاط")
    student = await db.users.find_one({"id": student_id, "role": "student"}, {"_id": 0, "id": 1, "name": 1, "group_id": 1})
    if not student:
        raise HTTPException(status_code=404, detail="الطالب غير موجود")
    if current_user["role"] == "sheikh":
        gids = await _sheikh_group_ids(current_user["user_id"])
        if student.get("group_id") not in gids:
            raise HTTPException(status_code=403, detail="هذا الطالب ليس ضمن مجموعاتك")
    return student


class PointsAdjustRequest(BaseModel):
    student_id: str
    type: str          # bonus | deduction | freeze
    points: int        # المقدار (موجب دائمًا)
    reason: Optional[str] = None


@api_router.post("/points/adjust")
async def adjust_points(data: PointsAdjustRequest, current_user: dict = Depends(get_current_user)):
    """إضافة نقاط خارجية أو خصمها أو تجميد مبلغ منها (المدير لأي طالب، المشرف لطلابه)."""
    student = await assert_can_manage_student_points(current_user, data.student_id)

    if data.type not in ADJUSTMENT_TYPES:
        raise HTTPException(status_code=400, detail="نوع التعديل غير صحيح")
    if data.points <= 0:
        raise HTTPException(status_code=400, detail="المقدار يجب أن يكون أكبر من صفر")
    if data.points > 10000:
        raise HTTPException(status_code=400, detail="المقدار كبير جدًا (الحد 10000)")

    points_doc = await db.student_points.find_one({"student_id": data.student_id}, {"_id": 0}) or {}
    current_total = points_doc.get("total_points", 0) or 0
    current_frozen = points_doc.get("frozen_points", 0) or 0

    # لا يمكن خصم أو تجميد أكثر من المتاح فعلًا
    if data.type == "deduction" and data.points > current_total:
        raise HTTPException(
            status_code=400,
            detail=f"لا يمكن خصم {data.points} نقطة — رصيد الطالب {current_total} فقط"
        )
    if data.type == "freeze":
        available = max(0, current_total - current_frozen)
        if data.points > available:
            raise HTTPException(
                status_code=400,
                detail=f"لا يمكن تجميد {data.points} نقطة — المتاح {available} فقط"
            )

    now = datetime.now(timezone.utc).isoformat()
    adjustment = {
        "id": str(uuid.uuid4()),
        "student_id": data.student_id,
        "student_name": student.get("name", ""),
        "type": data.type,
        "points": int(data.points),
        "reason": (data.reason or "").strip() or None,
        "created_by": current_user["user_id"],
        "created_by_name": current_user.get("name", ""),
        "created_by_role": current_user["role"],
        "created_at": now,
        # التجميد يبقى ساريًا لحدّ ما يُفَك
        "active": True if data.type == "freeze" else None,
        "released_at": None,
        "released_by": None,
    }
    await db.points_adjustments.insert_one(dict(adjustment))

    result = await recompute_student_points(data.student_id)

    # إشعار الطالب
    reason_txt = adjustment["reason"]
    if data.type == "bonus":
        title, body = "⭐ نقاط إضافية", f"حصلت على {data.points} نقطة إضافية"
    elif data.type == "deduction":
        title, body = "⚠️ خصم نقاط", f"تم خصم {data.points} نقطة من رصيدك"
    else:
        title, body = "🔒 تجميد نقاط", f"تم تجميد {data.points} نقطة من رصيدك مؤقتًا"
    if reason_txt:
        body += f" — السبب: {reason_txt}"
    await create_notification_internal(data.student_id, title, body, "info" if data.type == "bonus" else "warning")

    if current_user["role"] == "admin":
        await log_admin_action(current_user, f"points_{data.type}", "student", data.student_id,
                               student.get("name"), f"{ADJUSTMENT_LABELS[data.type]}: {data.points} — {reason_txt or 'بدون سبب'}")

    adjustment.pop("_id", None)
    return {"message": ADJUSTMENT_DONE_TEXTS[data.type], "adjustment": adjustment, "points": result}


@api_router.post("/points/freeze/{adjustment_id}/release")
async def release_freeze(adjustment_id: str, current_user: dict = Depends(get_current_user)):
    """فكّ تجميد سارٍ — النقاط بترجع للرصيد المتاح."""
    adj = await db.points_adjustments.find_one({"id": adjustment_id, "type": "freeze"}, {"_id": 0})
    if not adj:
        raise HTTPException(status_code=404, detail="التجميد غير موجود")
    if not adj.get("active"):
        raise HTTPException(status_code=400, detail="هذا التجميد مفكوك أصلًا")

    await assert_can_manage_student_points(current_user, adj["student_id"])

    await db.points_adjustments.update_one(
        {"id": adjustment_id},
        {"$set": {"active": False,
                  "released_at": datetime.now(timezone.utc).isoformat(),
                  "released_by": current_user["user_id"]}},
    )
    result = await recompute_student_points(adj["student_id"])
    await create_notification_internal(
        adj["student_id"], "🔓 فكّ تجميد النقاط",
        f"تم فكّ تجميد {adj['points']} نقطة — عادت إلى رصيدك المتاح.", "success"
    )
    return {"message": f"تم فكّ تجميد {adj['points']} نقطة", "points": result}


@api_router.delete("/points/adjustments/{adjustment_id}")
async def delete_adjustment(adjustment_id: str, current_user: dict = Depends(get_current_user)):
    """حذف تعديل يدوي (تراجع عن إضافة/خصم/تجميد)."""
    adj = await db.points_adjustments.find_one({"id": adjustment_id}, {"_id": 0})
    if not adj:
        raise HTTPException(status_code=404, detail="التعديل غير موجود")
    await assert_can_manage_student_points(current_user, adj["student_id"])

    await db.points_adjustments.delete_one({"id": adjustment_id})
    result = await recompute_student_points(adj["student_id"])
    return {"message": "تم حذف التعديل وإعادة احتساب النقاط", "points": result}


@api_router.get("/points/ledger/{student_id}")
async def points_ledger(student_id: str, source: Optional[str] = None,
                        current_user: dict = Depends(get_current_user)):
    """سجل نقاط الطالب — مبني من البيانات الخام مباشرةً (مش من جدول الحركات)
    فبيضل دقيق حتى بعد إعادة الاحتساب أو الأرشفة.
    الطالب يرى سجلّه، والمشرف طلابه، والمدير الجميع."""
    if current_user["role"] == "student":
        if current_user["user_id"] != student_id:
            raise HTTPException(status_code=403, detail="غير مصرح لك")
        student = await db.users.find_one({"id": student_id}, {"_id": 0, "id": 1, "name": 1, "group_id": 1})
    else:
        student = await assert_can_manage_student_points(current_user, student_id)

    entries = []

    # 1) الحضور
    atts = await db.attendance.find(
        {"student_id": student_id, "status": "present"}, {"_id": 0, "date": 1}
    ).to_list(100000)
    for a in atts:
        entries.append({
            "source": "attendance", "points": ATTENDANCE_POINTS,
            "date": a.get("date"), "description": f"حضور يوم {a.get('date')}",
        })

    # 2) التسميع
    recs = await db.recitations.find(
        {"student_id": student_id, "did_not_recite": {"$ne": True}},
        {"_id": 0, "record_date": 1, "points_earned": 1, "new_pages": 1, "review_pages": 1},
    ).to_list(100000)
    for r in recs:
        pts = r.get("points_earned", 0) or 0
        if pts:
            entries.append({
                "source": "recitation", "points": pts, "date": r.get("record_date"),
                "description": f"تسميع — {r.get('new_pages') or 0} صفحة حفظ، {r.get('review_pages') or 0} مراجعة",
            })

    # 3) ورق المتابعة
    sheets = await db.tracking_sheets.find(
        {"student_id": student_id}, {"_id": 0, "week_start": 1, "points_earned": 1}
    ).to_list(100000)
    for s in sheets:
        pts = s.get("points_earned", 0) or 0
        if pts:
            entries.append({
                "source": "tracking", "points": pts, "date": s.get("week_start"),
                "description": f"ورقة متابعة أسبوع {s.get('week_start')}",
            })

    # 4) نقاط التميز
    bonuses = await db.admin_bonus_grants.find(
        {"student_id": student_id}, {"_id": 0, "points": 1, "reason": 1, "created_at": 1}
    ).to_list(10000)
    for b in bonuses:
        entries.append({
            "source": "admin_bonus", "points": b.get("points", 0) or 0,
            "date": str(b.get("created_at") or "")[:10],
            "description": "نقاط تميز" + (f" — {b['reason']}" if b.get("reason") else ""),
        })

    # 5) التعديلات اليدوية (إضافة / خصم / تجميد)
    adjustments = await db.points_adjustments.find(
        {"student_id": student_id}, {"_id": 0}
    ).to_list(10000)
    for a in adjustments:
        pts = int(a.get("points") or 0)
        signed = -pts if a["type"] == "deduction" else pts
        desc = ADJUSTMENT_LABELS[a["type"]]
        if a.get("reason"):
            desc += f" — {a['reason']}"
        by = a.get("created_by_name") or ("المدير" if a.get("created_by_role") == "admin" else "المشرف")
        entries.append({
            "source": a["type"], "points": signed,
            "date": str(a.get("created_at") or "")[:10],
            "description": desc,
            "by": by,
            "adjustment_id": a["id"],
            "active": a.get("active"),
            "released_at": a.get("released_at"),
            # التجميد ما بيغيّر الرصيد الكلي — بس بيحجز منه
            "affects_total": a["type"] != "freeze",
        })

    if source and source != "all":
        entries = [e for e in entries if e["source"] == source]

    entries.sort(key=lambda e: (e.get("date") or ""), reverse=True)

    # ملخّص لكل مصدر
    by_source = {}
    for e in entries:
        if e.get("affects_total") is False:
            continue
        by_source[e["source"]] = by_source.get(e["source"], 0) + e["points"]

    points_doc = await db.student_points.find_one({"student_id": student_id}, {"_id": 0}) or {}
    active_freezes = [a for a in adjustments if a["type"] == "freeze" and a.get("active")]

    return {
        "student_id": student_id,
        "student_name": (student or {}).get("name", ""),
        "entries": entries,
        "count": len(entries),
        "by_source": by_source,
        "source_labels": LEDGER_SOURCE_LABELS,
        "totals": {
            "total_points": points_doc.get("total_points", 0) or 0,
            "available_points": points_doc.get("available_points",
                                               points_doc.get("total_points", 0) or 0),
            "frozen_points": points_doc.get("frozen_points", 0) or 0,
            "manual_points": points_doc.get("manual_points", 0) or 0,
            "level": points_doc.get("level", 1),
        },
        "active_freezes": [
            {"id": f["id"], "points": f["points"], "reason": f.get("reason"),
             "created_at": f.get("created_at"), "by": f.get("created_by_name")}
            for f in active_freezes
        ],
    }


@api_router.get("/points/overview")
async def points_overview(group_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    """قائمة الطلاب بأرصدتهم — للوحة إدارة النقاط (المدير للكل، المشرف لطلابه)."""
    ensure_role(current_user, ["admin", "sheikh"], "غير مصرح لك")

    uq = {"role": "student"}
    if current_user["role"] == "sheikh":
        gids = await _sheikh_group_ids(current_user["user_id"])
        uq["group_id"] = group_id if (group_id and group_id in gids) else {"$in": gids}
    elif group_id:
        uq["group_id"] = group_id

    students = await db.users.find(uq, {"_id": 0, "id": 1, "name": 1, "group_id": 1}).to_list(10000)
    sids = [s["id"] for s in students]

    points_docs = {p["student_id"]: p for p in await db.student_points.find(
        {"student_id": {"$in": sids}}, {"_id": 0}
    ).to_list(10000)}
    group_names = {g["id"]: g["name"] for g in
                   await db.groups.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(3000)}

    # عدد التعديلات اليدوية والتجميدات السارية لكل طالب
    adjustments = await db.points_adjustments.find(
        {"student_id": {"$in": sids}}, {"_id": 0, "student_id": 1, "type": 1, "active": 1}
    ).to_list(100000)
    adj_count, freeze_count = {}, {}
    for a in adjustments:
        adj_count[a["student_id"]] = adj_count.get(a["student_id"], 0) + 1
        if a["type"] == "freeze" and a.get("active"):
            freeze_count[a["student_id"]] = freeze_count.get(a["student_id"], 0) + 1

    rows = []
    for s in students:
        p = points_docs.get(s["id"], {})
        total = p.get("total_points", 0) or 0
        frozen = p.get("frozen_points", 0) or 0
        rows.append({
            "student_id": s["id"],
            "student_name": s.get("name", ""),
            "group_name": group_names.get(s.get("group_id"), "بدون مجموعة"),
            "total_points": total,
            "frozen_points": frozen,
            "available_points": p.get("available_points", max(0, total - frozen)),
            "manual_points": p.get("manual_points", 0) or 0,
            "attendance_points": p.get("attendance_points", 0) or 0,
            "recitation_points": p.get("recitation_points", 0) or 0,
            "tracking_points": p.get("tracking_points", 0) or 0,
            "level": p.get("level", 1),
            "adjustments_count": adj_count.get(s["id"], 0),
            "active_freezes": freeze_count.get(s["id"], 0),
        })

    rows.sort(key=lambda r: r["total_points"], reverse=True)
    return {"count": len(rows), "students": rows}


@api_router.post("/admin/recompute-points")
async def recompute_all_points(current_user: dict = Depends(get_current_user)):
    """أرقام موثوقة (F2): إعادة احتساب نقاط جميع الطلاب من البيانات الخام لتوحيد كل اللوحات والتقارير."""
    ensure_role(current_user, "admin", "غير مصرح لك")
    students = await db.users.find({"role": "student"}, {"_id": 0, "id": 1}).to_list(10000)
    total = 0
    for s in students:
        r = await recompute_student_points(s["id"])
        total += r["total_points"]
    await log_admin_action(current_user, "recompute_points", "system", None, None,
                           f"إعادة احتساب نقاط {len(students)} طالب")
    return {"message": f"تمت إعادة احتساب نقاط {len(students)} طالب", "students": len(students), "grand_total": total}


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
    ensure_role(current_user, ["admin", "sheikh"], "غير مصرح لك")
    
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
    ensure_role(current_user, "admin", "فقط المدير يمكنه إدارة المنهج")
    
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
    ensure_role(current_user, ["admin", "sheikh"], "غير مصرح لك")
    
    curricula = await db.curriculum.find({}, {"_id": 0}).sort("created_at", -1).to_list(50)
    
    # Get entries count for each curriculum
    for c in curricula:
        entries_count = await db.curriculum_entries.count_documents({"curriculum_id": c["id"]})
        c["entries_count"] = entries_count
    
    return curricula

@api_router.get("/curriculum/{curriculum_id}")
async def get_curriculum(curriculum_id: str, current_user: dict = Depends(get_current_user)):
    """Get curriculum with entries"""
    ensure_role(current_user, ["admin", "sheikh"], "غير مصرح لك")
    
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
    ensure_role(current_user, "admin", "فقط المدير يمكنه تعديل المنهج")
    
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
    ensure_role(current_user, "admin", "فقط المدير يمكنه حذف المنهج")
    
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
    ensure_role(current_user, "admin", "فقط المدير يمكنه إضافة خطط للمنهج")
    
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
    
    return {"message": "تمت إضافة الخطة بنجاح", "entry_id": entry.id}

@api_router.put("/curriculum/entries/{entry_id}")
async def update_curriculum_entry(entry_id: str, data: CurriculumEntryCreate, current_user: dict = Depends(get_current_user)):
    """Update curriculum entry (Admin only)"""
    ensure_role(current_user, "admin", "فقط المدير يمكنه تعديل الخطط")
    
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
    ensure_role(current_user, "admin", "فقط المدير يمكنه حذف الخطط")
    
    result = await db.curriculum_entries.delete_one({"id": entry_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="الخطة غير موجودة")
    
    return {"message": "تم حذف الخطة بنجاح"}

# ============== SCHEDULE MANAGEMENT (Admin) ==============

@api_router.post("/schedule")
async def create_schedule(data: ScheduleCreate, current_user: dict = Depends(get_current_user)):
    """Create a new schedule (Admin only)"""
    ensure_role(current_user, "admin", "فقط المدير يمكنه إدارة الجداول")
    
    # #6 — الجدول مرتبط بالفصل النشط، ويحفظ أيام الدروس التي تحدّد أيام الدوام/التسميع
    active_term_id = await get_active_term_id()
    schedule = Schedule(
        name=data.name,
        description=data.description,
        start_date=data.start_date,
        end_date=data.end_date,
        lesson_days=data.lesson_days or [],
        term_id=active_term_id,
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
    ensure_role(current_user, ["admin", "sheikh"], "غير مصرح لك")
    
    schedules = await db.schedules.find({}, {"_id": 0}).sort("created_at", -1).to_list(50)
    
    # Get slots count for each schedule
    for s in schedules:
        slots_count = await db.schedule_slots.count_documents({"schedule_id": s["id"]})
        s["slots_count"] = slots_count
    
    return schedules

@api_router.get("/schedule/active")
async def get_active_schedule(current_user: dict = Depends(get_current_user)):
    """Get the active schedule with all slots"""
    ensure_role(current_user, ["admin", "sheikh"], "غير مصرح لك")
    
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

@api_router.get("/schedule/lesson-days")
async def get_schedule_lesson_days(current_user: dict = Depends(get_current_user)):
    """#6 — أيام الدوام/التسميع المعتمدة من الجدول النشط المرتبط بالفصل الحالي.
    تُستخدم في واجهات تسجيل الحضور والتسميع لتقييد الأيام."""
    ensure_role(current_user, ["admin", "sheikh"], "غير مصرح لك")
    lesson_days = await get_active_lesson_days()
    term_id = await get_active_term_id()
    term = await db.terms.find_one({"id": term_id}, {"_id": 0, "name": 1}) if term_id else None
    return {
        "lesson_days": lesson_days,
        "restricted": bool(lesson_days),
        "term_id": term_id,
        "term_name": term.get("name") if term else None,
    }

@api_router.get("/schedule/{schedule_id}")
async def get_schedule(schedule_id: str, current_user: dict = Depends(get_current_user)):
    """Get schedule with slots"""
    ensure_role(current_user, ["admin", "sheikh"], "غير مصرح لك")
    
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
    ensure_role(current_user, "admin", "فقط المدير يمكنه تعديل الجدول")
    
    schedule = await db.schedules.find_one({"id": schedule_id})
    if not schedule:
        raise HTTPException(status_code=404, detail="الجدول غير موجود")
    
    update_data = {
        "name": data.name,
        "description": data.description,
        "start_date": data.start_date,
        "end_date": data.end_date,
        "lesson_days": data.lesson_days or [],  # #6 — أيام الدوام/التسميع
        "updated_at": datetime.now(timezone.utc).isoformat()
    }

    await db.schedules.update_one({"id": schedule_id}, {"$set": update_data})
    return {"message": "تم تحديث الجدول بنجاح"}

@api_router.put("/schedule/{schedule_id}/activate")
async def activate_schedule(schedule_id: str, current_user: dict = Depends(get_current_user)):
    """Set schedule as active (Admin only)"""
    ensure_role(current_user, "admin", "فقط المدير يمكنه تفعيل الجدول")
    
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
    ensure_role(current_user, "admin", "فقط المدير يمكنه حذف الجدول")
    
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
    """منح نقاط الطالب المتفاعل (للمشرف فقط) - 10 نقاط"""
    ensure_role(current_user, "sheikh", "فقط المشرف يمكنه منح هذه النقاط")
    
    # Verify student exists
    student = await db.users.find_one({"id": data.student_id, "role": "student"})
    if not student:
        raise HTTPException(status_code=404, detail="الطالب غير موجود")
    
    # Check if student is in sheikh's groups
    groups = await db.groups.find({"sheikh_ids": current_user["user_id"]}).to_list(100)
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
        f"حصلت على 10 نقاط كطالب متفاعل من المشرف {current_user.get('name', 'المشرف')}",
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
    ensure_role(current_user, "admin", "فقط المدير يمكنه إضافة حصص للجدول")
    
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
        period_name=(data.period_name or "").strip() or None,
        description=data.description,
        group_id=data.group_id
    )
    
    slot_dict = slot.model_dump()
    slot_dict["created_at"] = slot_dict["created_at"].isoformat()
    
    await db.schedule_slots.insert_one(slot_dict)
    
    return {"message": "تمت إضافة الحصة بنجاح", "slot_id": slot.id}

@api_router.put("/schedule/slots/{slot_id}")
async def update_schedule_slot(slot_id: str, data: ScheduleSlotCreate, current_user: dict = Depends(get_current_user)):
    """Update schedule slot (Admin only)"""
    ensure_role(current_user, "admin", "فقط المدير يمكنه تعديل الحصص")
    
    result = await db.schedule_slots.update_one(
        {"id": slot_id},
        {"$set": {
            "day": data.day,
            "start_time": data.start_time,
            "end_time": data.end_time,
            "subject": data.subject,
            "period_name": (data.period_name or "").strip() or None,
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
    ensure_role(current_user, "admin", "فقط المدير يمكنه حذف الحصص")
    
    result = await db.schedule_slots.delete_one({"id": slot_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="الحصة غير موجودة")
    
    return {"message": "تم حذف الحصة بنجاح"}

# ============== RANKINGS & STATISTICS ==============

@api_router.get("/rankings/sheikh-students")
async def get_sheikh_students_ranking(current_user: dict = Depends(get_current_user)):
    """Get ranking of students in sheikh's groups"""
    ensure_role(current_user, "sheikh", "فقط للمشرفين")
    
    # Get sheikh's groups
    groups = await db.groups.find({"sheikh_ids": current_user["user_id"]}, {"_id": 0}).to_list(20)
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
    ensure_role(current_user, "admin", "فقط المدير يمكنه الوصول")
    
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
            
            # Get sheikh names (all sheikhs of the group)
            
            group_rankings.append({
                "group_id": group["id"],
                "group_name": group["name"],
                "sheikh_name": await group_sheikh_names_str(group),
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
    ensure_role(current_user, "admin", "فقط المدير يمكنه الوصول")
    
    # Basic counts
    total_students = await db.users.count_documents({"role": "student", "is_active": True})
    total_sheikhs = await db.users.count_documents({"role": "sheikh"})
    total_groups = await db.groups.count_documents({})
    pending_students = await db.users.count_documents({"role": "student", "is_active": False})
    
    # Calculate total points
    all_points = await db.student_points.find({}, {"_id": 0, "total_points": 1}).to_list(1000)
    total_points = sum(p.get("total_points", 0) for p in all_points)
    
    # Attendance stats (this week — الأسبوع يبدأ السبت)
    week_start = get_current_week_start()  # السبت
    week_end = (datetime.strptime(week_start, "%Y-%m-%d") + timedelta(days=6)).strftime("%Y-%m-%d")

    week_attendance = await db.attendance.count_documents({
        "date": {"$gte": week_start, "$lte": week_end}, "status": "present"
    })

    # Recitation stats
    total_recitations = await db.recitations.count_documents({})
    week_recitations = await db.recitations.find(
        {"record_date": {"$gte": week_start, "$lte": week_end}}, {"_id": 0}
    ).to_list(100000)
    week_pages = sum(_new_pages_of(r) for r in week_recitations)  # يشمل combined + new_pages

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
        
        group_stats.append({
            "group_id": group["id"],
            "group_name": group["name"],
            "sheikh_name": await group_sheikh_names_str(group),
            "student_count": len(students),
            "total_points": group_points
        })
    
    group_stats.sort(key=lambda x: x["total_points"], reverse=True)
    
    # قائمة الطلاب كاملةً (مرتّبة بالنقاط) — بدون N+1
    students = await db.users.find(
        {"role": "student", "is_active": True},
        {"_id": 0, "id": 1, "name": 1, "group_id": 1}
    ).to_list(5000)
    student_ids_all = [s["id"] for s in students]

    points_map = {
        p["student_id"]: p.get("total_points", 0)
        for p in await db.student_points.find(
            {"student_id": {"$in": student_ids_all}},
            {"_id": 0, "student_id": 1, "total_points": 1}
        ).to_list(5000)
    }
    group_name_map = {g["id"]: g["name"] for g in groups}

    all_students = [{
        "student_id": s["id"],
        "student_name": s["name"],
        "group_id": s.get("group_id"),
        "group_name": group_name_map.get(s.get("group_id"), "بدون مجموعة"),
        "total_points": points_map.get(s["id"], 0),
    } for s in students]
    all_students.sort(key=lambda x: x["total_points"], reverse=True)
    top_students = all_students

    # ── إحصائيات المشرفين: كل مشرف لحاله مع مجموعاته ونسبتَي التسميع والحضور خلال الفصل ──
    active_term = await db.terms.find_one({"is_active": True}, {"_id": 0, "id": 1, "name": 1})
    term_filter_id = active_term["id"] if active_term else None

    def _term_scoped(q: dict) -> dict:
        """قصر الاستعلام على الفصل النشط (مع تضمين السجلات بلا term_id)."""
        if term_filter_id:
            q["$or"] = [{"term_id": term_filter_id}, {"term_id": None}, {"term_id": {"$exists": False}}]
        return q

    atts = await db.attendance.find(
        _term_scoped({"student_id": {"$in": student_ids_all}}),
        {"_id": 0, "student_id": 1, "status": 1}
    ).to_list(200000)
    recs = await db.recitations.find(
        _term_scoped({"student_id": {"$in": student_ids_all}}),
        {"_id": 0, "student_id": 1, "did_not_recite": 1}
    ).to_list(200000)

    student_group = {s["id"]: s.get("group_id") for s in students}
    per_group = {g["id"]: {"present": 0, "att_total": 0, "recited": 0, "rec_total": 0, "students": 0}
                 for g in groups}

    for s in students:
        gid = s.get("group_id")
        if gid in per_group:
            per_group[gid]["students"] += 1
    for a in atts:
        gid = student_group.get(a["student_id"])
        if gid in per_group:
            per_group[gid]["att_total"] += 1
            if a.get("status") == "present":
                per_group[gid]["present"] += 1
    for r in recs:
        gid = student_group.get(r["student_id"])
        if gid in per_group:
            per_group[gid]["rec_total"] += 1
            if not r.get("did_not_recite"):
                per_group[gid]["recited"] += 1

    def _rate(n: int, d: int) -> float:
        return round(n / d * 100, 1) if d else 0.0

    sheikhs = await db.users.find(
        {"role": "sheikh"}, {"_id": 0, "id": 1, "name": 1, "email": 1}
    ).to_list(500)

    empty_stat = {"present": 0, "att_total": 0, "recited": 0, "rec_total": 0, "students": 0}
    sheikh_stats = []
    for sheikh in sheikhs:
        sheikh_groups = [g for g in groups if sheikh["id"] in group_sheikh_ids(g)]
        group_rows = []
        t_present = t_att = t_recited = t_rec = t_students = 0

        for g in sheikh_groups:
            st = per_group.get(g["id"], empty_stat)
            group_rows.append({
                "group_id": g["id"],
                "group_name": g["name"],
                "students_count": st["students"],
                "attendance_rate": _rate(st["present"], st["att_total"]),
                "recitation_rate": _rate(st["recited"], st["rec_total"]),
            })
            t_present += st["present"]
            t_att += st["att_total"]
            t_recited += st["recited"]
            t_rec += st["rec_total"]
            t_students += st["students"]

        sheikh_stats.append({
            "sheikh_id": sheikh["id"],
            "sheikh_name": sheikh["name"],
            "email": sheikh.get("email", ""),
            "groups_count": len(sheikh_groups),
            "students_count": t_students,
            "recitations_count": t_rec,
            "attendance_rate": _rate(t_present, t_att),
            "recitation_rate": _rate(t_recited, t_rec),
            "groups": group_rows,
        })

    sheikh_stats.sort(key=lambda x: x["recitation_rate"], reverse=True)

    # ── نِسَب هذا الأسبوع (مئوية) + تفريع لكل مجموعة ──
    sheikh_name_map = {s["id"]: s["name"] for s in sheikhs}

    week_atts = await db.attendance.find(
        {"student_id": {"$in": student_ids_all}, "date": {"$gte": week_start, "$lte": week_end}},
        {"_id": 0, "student_id": 1, "status": 1}
    ).to_list(200000)
    week_recs = await db.recitations.find(
        {"student_id": {"$in": student_ids_all}, "record_date": {"$gte": week_start, "$lte": week_end}},
        {"_id": 0, "student_id": 1, "did_not_recite": 1}
    ).to_list(200000)

    week_per_group = {g["id"]: {"present": 0, "att_total": 0, "recited": 0, "rec_total": 0, "students": 0}
                      for g in groups}
    for s in students:
        gid = s.get("group_id")
        if gid in week_per_group:
            week_per_group[gid]["students"] += 1
    for a in week_atts:
        gid = student_group.get(a["student_id"])
        if gid in week_per_group:
            week_per_group[gid]["att_total"] += 1
            if a.get("status") == "present":
                week_per_group[gid]["present"] += 1
    for r in week_recs:
        gid = student_group.get(r["student_id"])
        if gid in week_per_group:
            week_per_group[gid]["rec_total"] += 1
            if not r.get("did_not_recite"):
                week_per_group[gid]["recited"] += 1

    week_groups = []
    for g in groups:
        st = week_per_group.get(g["id"], empty_stat)
        week_groups.append({
            "group_id": g["id"],
            "group_name": g["name"],
            "sheikh_name": "، ".join(sheikh_name_map[i] for i in group_sheikh_ids(g) if i in sheikh_name_map) or "غير معين",
            "students_count": st["students"],
            "attendance_rate": _rate(st["present"], st["att_total"]),
            "recitation_rate": _rate(st["recited"], st["rec_total"]),
            "attendance_records": st["att_total"],
            "recitation_records": st["rec_total"],
        })
    week_groups.sort(key=lambda x: x["attendance_rate"], reverse=True)

    # الإجماليات الأسبوعية كنسب مئوية
    week_present_total = sum(1 for a in week_atts if a.get("status") == "present")
    week_att_records = len(week_atts)
    week_recited_total = sum(1 for r in week_recs if not r.get("did_not_recite"))
    week_rec_records = len(week_recs)

    week_attendance_rate = _rate(week_present_total, week_att_records)
    week_recitation_rate = _rate(week_recited_total, week_rec_records)

    return {
        "summary": {
            "total_students": total_students,
            "total_sheikhs": total_sheikhs,
            "total_groups": total_groups,
            "pending_students": pending_students,
            "total_points": total_points,
            "week_attendance": week_attendance,
            "total_recitations": total_recitations,
            "week_pages": week_pages,
            # نِسَب الأسبوع المئوية + مدى الأسبوع (للبطاقتين)
            "week_attendance_rate": week_attendance_rate,
            "week_recitation_rate": week_recitation_rate,
            "week_attendance_records": week_att_records,
            "week_recitation_records": week_rec_records,
            "week_start": week_start,
            "week_end": week_end,
        },
        # مجموع نقاط كل المجموعات (مش أول 5 فقط)
        "total_groups_points": sum(g["total_points"] for g in group_stats),
        "top_groups": group_stats[:5],
        "top_students": top_students[:10],
        "all_students": all_students,
        "week_groups": week_groups,
        "active_term_name": active_term["name"] if active_term else None,
        "sheikhs": sheikh_stats
    }

@api_router.get("/admin/sheikh/{sheikh_id}")
async def get_sheikh_details(sheikh_id: str, current_user: dict = Depends(get_current_user)):
    """Get detailed information about a sheikh (Admin only)"""
    ensure_role(current_user, "admin", "فقط المدير يمكنه الوصول")
    
    sheikh = await db.users.find_one({"id": sheikh_id, "role": "sheikh"}, {"_id": 0, "password_hash": 0})
    if not sheikh:
        raise HTTPException(status_code=404, detail="المشرف غير موجود")
    
    # Get sheikh's groups
    groups = await db.groups.find({"sheikh_ids": sheikh_id}, {"_id": 0}).to_list(20)
    
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
    ensure_role(current_user, "admin", "فقط المدير يمكنه الوصول")
    
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

def compute_fee_status(fee: dict) -> str:
    """تحديد حالة الرسوم:
    - مدفوع (paid): إذا تم الدفع
    - يحترم تغيير المدير اليدوي إن وُجد (status_overridden)
    - تلقائياً: الأشهر السابقة = مستحق (due)، الشهر الحالي/القادم = قائم (pending)
    """
    if fee.get("is_paid") or fee.get("status") == "paid":
        return "paid"
    if fee.get("status_overridden"):
        return fee.get("status") or "pending"
    now = datetime.now(timezone.utc)
    fy, fm = fee.get("year"), fee.get("month")
    if fy and fm:
        return "due" if (fy, fm) < (now.year, now.month) else "pending"
    # احتياطي: الاعتماد على تاريخ الاستحقاق عند غياب الشهر/السنة
    due = fee.get("due_date")
    if due:
        try:
            if datetime.fromisoformat(str(due)).date() < now.date():
                return "due"
        except (ValueError, TypeError):
            pass
    return "pending"


@api_router.post("/fees")
async def create_fee(data: FeeCreate, current_user: dict = Depends(get_current_user)):
    """Create a fee for a student (Admin only)"""
    ensure_role(current_user, "admin", "فقط المدير يمكنه إضافة الرسوم")
    
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
            f"تمت إضافة {fee_types.get(data.fee_type, data.fee_type)} بمبلغ {data.amount}",
            "warning"
        )
        
        return {"message": "تمت إضافة الرسوم بنجاح", "fee_id": fee.id}
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
    
    fees = await db.fees.find(query, {"_id": 0}).sort("created_at", -1).to_list(100000)

    # أسماء الطلاب دفعة واحدة (بدون N+1) + الحالة المحسوبة
    sids = list({f["student_id"] for f in fees})
    names = {u["id"]: u.get("name", "") for u in await db.users.find(
        {"id": {"$in": sids}}, {"_id": 0, "id": 1, "name": 1}
    ).to_list(10000)} if sids else {}

    for fee in fees:
        fee["student_name"] = names.get(fee["student_id"], "غير معروف")
        fee["status"] = compute_fee_status(fee)

    return fees

@api_router.get("/fees/student/{student_id}")
async def get_student_fees(student_id: str, current_user: dict = Depends(get_current_user)):
    """Get fees for a specific student"""
    if current_user["role"] == "student" and current_user["user_id"] != student_id:
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    
    fees = await db.fees.find({"student_id": student_id}, {"_id": 0}).sort("created_at", -1).to_list(100)

    for f in fees:
        f["status"] = compute_fee_status(f)

    total_due = sum(f["amount"] for f in fees if f["status"] == "due")
    total_paid = sum(f["amount"] for f in fees if f["status"] == "paid")
    total_pending = sum(f["amount"] for f in fees if f["status"] == "pending")

    return {
        "fees": fees,
        "summary": {
            "total_due": total_due,
            "total_paid": total_paid,
            "total_pending": total_pending,
            "pending_count": len([f for f in fees if f["status"] != "paid"])
        }
    }

# ============== إعدادات الرسوم + التوليد الشهري التلقائي ==============
FEES_DEFAULTS = {"monthly_amount": 5.0, "fee_type": "subscription", "auto_generate": True}

ARABIC_MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
                 "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"]


async def get_fees_config() -> dict:
    """إعدادات الرسوم: القيمة الشهرية الافتراضية + هل يُولَّد تلقائيًا للطلاب الجدد."""
    doc = await db.settings.find_one({"key": "fees_config"}, {"_id": 0}) or {}
    try:
        amount = float(doc.get("monthly_amount", FEES_DEFAULTS["monthly_amount"]))
    except (TypeError, ValueError):
        amount = FEES_DEFAULTS["monthly_amount"]
    return {
        "monthly_amount": max(0.0, amount),
        "fee_type": doc.get("fee_type") or FEES_DEFAULTS["fee_type"],
        "auto_generate": bool(doc.get("auto_generate", FEES_DEFAULTS["auto_generate"])),
    }


class FeesConfigUpdate(BaseModel):
    monthly_amount: Optional[float] = None
    fee_type: Optional[str] = None
    auto_generate: Optional[bool] = None


@api_router.get("/settings/fees")
async def get_fees_settings(current_user: dict = Depends(get_current_user)):
    """إعدادات الرسوم الشهرية (المدير فقط)."""
    ensure_role(current_user, "admin", "فقط المدير يمكنه الوصول")
    return await get_fees_config()


@api_router.put("/settings/fees")
async def update_fees_settings(data: FeesConfigUpdate, current_user: dict = Depends(get_current_user)):
    """تعديل إعدادات الرسوم (المدير فقط)."""
    ensure_role(current_user, "admin", "فقط المدير يمكنه تعديل إعدادات الرسوم")
    update = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if data.monthly_amount is not None:
        if data.monthly_amount < 0 or data.monthly_amount > 100000:
            raise HTTPException(status_code=400, detail="المبلغ الشهري يجب أن يكون بين 0 و 100000")
        update["monthly_amount"] = float(data.monthly_amount)
    if data.fee_type is not None:
        if data.fee_type not in ("subscription", "umrah", "activity"):
            raise HTTPException(status_code=400, detail="نوع الرسوم غير صحيح")
        update["fee_type"] = data.fee_type
    if data.auto_generate is not None:
        update["auto_generate"] = bool(data.auto_generate)
    await db.settings.update_one({"key": "fees_config"}, {"$set": update}, upsert=True)
    return {"message": "تم تحديث إعدادات الرسوم", "settings": await get_fees_config()}


async def generate_year_fees_for_students(student_ids: List[str], year: int,
                                          amount: float, fee_type: str, created_by: str) -> int:
    """توليد رسوم 12 شهرًا لكل طالب — بدون تكرار ما هو موجود أصلًا."""
    if not student_ids:
        return 0

    existing = await db.fees.find(
        {"student_id": {"$in": student_ids}, "year": year, "fee_type": fee_type},
        {"_id": 0, "student_id": 1, "month": 1},
    ).to_list(200000)
    have = {(e["student_id"], e.get("month")) for e in existing}

    now_iso = datetime.now(timezone.utc).isoformat()
    docs = []
    for sid in student_ids:
        for month in range(1, 13):
            if (sid, month) in have:
                continue
            docs.append({
                "id": str(uuid.uuid4()),
                "student_id": sid,
                "fee_type": fee_type,
                "amount": float(amount),
                "description": f"اشتراك شهر {ARABIC_MONTHS[month - 1]} {year}",
                "due_date": f"{year}-{month:02d}-01",
                "month": month,
                "year": year,
                "is_paid": False,
                "status": "pending",
                "status_overridden": False,
                "auto_generated": True,
                "created_by": created_by,
                "created_at": now_iso,
            })

    if docs:
        await db.fees.insert_many(docs)
    return len(docs)


class GenerateFeesRequest(BaseModel):
    year: Optional[int] = None
    amount: Optional[float] = None
    student_ids: Optional[List[str]] = None  # افتراضيًا كل الطلاب


@api_router.post("/admin/fees/generate-year")
async def generate_year_fees(data: GenerateFeesRequest, current_user: dict = Depends(get_current_user)):
    """توليد رسوم 12 شهرًا لكل الطلاب (أو المحدّدين) بالقيمة الافتراضية.
    آمن للتكرار — ما بيكرّر شهرًا موجودًا."""
    ensure_role(current_user, "admin", "فقط المدير يمكنه توليد الرسوم")

    cfg = await get_fees_config()
    year = data.year or datetime.now(timezone.utc).year
    if not 2000 <= year <= 2100:
        raise HTTPException(status_code=400, detail="السنة غير صحيحة")
    amount = cfg["monthly_amount"] if data.amount is None else float(data.amount)
    if amount < 0:
        raise HTTPException(status_code=400, detail="المبلغ يجب أن يكون صفرًا أو أكثر")

    if data.student_ids:
        sids = data.student_ids
    else:
        sids = [s["id"] for s in await db.users.find(
            {"role": "student"}, {"_id": 0, "id": 1}
        ).to_list(10000)]

    created = await generate_year_fees_for_students(sids, year, amount, cfg["fee_type"], current_user["user_id"])
    await log_admin_action(current_user, "generate_fees", "fees", None, None,
                           f"توليد {created} رسم لسنة {year} بقيمة {amount} لـ {len(sids)} طالب")
    return {
        "message": f"تم توليد {created} رسم شهري لسنة {year}",
        "created": created, "year": year, "amount": amount, "students": len(sids),
    }


class MonthAmountUpdate(BaseModel):
    year: int
    month: int
    amount: float
    student_ids: Optional[List[str]] = None  # افتراضيًا كل الطلاب


@api_router.put("/admin/fees/month-amount")
async def update_month_amount(data: MonthAmountUpdate, current_user: dict = Depends(get_current_user)):
    """تعديل مبلغ شهر معيّن (لكل الطلاب أو المحدّدين) — لا يمسّ الأشهر المدفوعة."""
    ensure_role(current_user, "admin", "فقط المدير يمكنه تعديل الرسوم")
    if not 1 <= data.month <= 12:
        raise HTTPException(status_code=400, detail="الشهر يجب أن يكون بين 1 و 12")
    if data.amount < 0:
        raise HTTPException(status_code=400, detail="المبلغ يجب أن يكون صفرًا أو أكثر")

    q = {"year": data.year, "month": data.month, "is_paid": {"$ne": True}}
    if data.student_ids:
        q["student_id"] = {"$in": data.student_ids}

    res = await db.fees.update_many(q, {"$set": {"amount": float(data.amount)}})
    return {
        "message": f"تم تعديل مبلغ شهر {ARABIC_MONTHS[data.month - 1]} {data.year} لـ {res.modified_count} طالب",
        "modified": res.modified_count,
    }


@api_router.get("/admin/fees/overview")
async def fees_overview(year: Optional[int] = None, group_id: Optional[str] = None,
                        current_user: dict = Depends(get_current_user)):
    """نظرة شاملة على الرسوم: صف لكل طالب فيه 12 شهر + إجماليّاته، مع ملخّص عام.
    مبنيّة باستعلامات مجمّعة (بدون N+1)."""
    ensure_role(current_user, "admin", "فقط المدير يمكنه الوصول")
    year = year or datetime.now(timezone.utc).year

    uq = {"role": "student"}
    if group_id:
        uq["group_id"] = group_id
    students = await db.users.find(uq, {"_id": 0, "id": 1, "name": 1, "group_id": 1}).to_list(10000)
    sids = [s["id"] for s in students]

    group_names = {g["id"]: g["name"] for g in
                   await db.groups.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(3000)}

    fees = await db.fees.find(
        {"student_id": {"$in": sids}, "year": year}, {"_id": 0}
    ).to_list(200000)

    by_student = {}
    for f in fees:
        f["status"] = compute_fee_status(f)
        by_student.setdefault(f["student_id"], []).append(f)

    rows = []
    totals = {"total": 0.0, "paid": 0.0, "due": 0.0, "pending": 0.0}
    for s in students:
        sfees = by_student.get(s["id"], [])
        months = {}
        st_total = st_paid = st_due = st_pending = 0.0
        for f in sfees:
            m = f.get("month")
            amt = float(f.get("amount") or 0)
            st_total += amt
            if f["status"] == "paid":
                st_paid += amt
            elif f["status"] == "due":
                st_due += amt
            else:
                st_pending += amt
            if m:
                months[str(m)] = {"fee_id": f["id"], "amount": amt, "status": f["status"]}

        rows.append({
            "student_id": s["id"],
            "student_name": s.get("name") or "",
            "group_name": group_names.get(s.get("group_id"), "بدون مجموعة"),
            "months": months,
            "total": round(st_total, 2),
            "paid": round(st_paid, 2),
            "due": round(st_due, 2),
            "pending": round(st_pending, 2),
            "outstanding": round(st_due + st_pending, 2),  # المتبقّي = مستحق + قائم
            "months_generated": len(months),
        })
        totals["total"] += st_total
        totals["paid"] += st_paid
        totals["due"] += st_due
        totals["pending"] += st_pending

    # الأكثر تخلّفًا عن الدفع أولًا
    rows.sort(key=lambda r: r["due"], reverse=True)

    totals = {k: round(v, 2) for k, v in totals.items()}
    totals["outstanding"] = round(totals["due"] + totals["pending"], 2)
    totals["collection_rate"] = round(totals["paid"] / totals["total"] * 100, 1) if totals["total"] else 0.0

    return {
        "year": year,
        "months": ARABIC_MONTHS,
        "config": await get_fees_config(),
        "summary": totals,
        "students_count": len(rows),
        "rows": rows,
    }


class BulkFeeStatusRequest(BaseModel):
    fee_ids: List[str]
    status: str  # pending | due | paid


@api_router.put("/admin/fees/bulk-status")
async def bulk_fee_status(data: BulkFeeStatusRequest, current_user: dict = Depends(get_current_user)):
    """تغيير حالة عدة رسوم دفعةً واحدة (المدير فقط)."""
    ensure_role(current_user, "admin", "فقط المدير يمكنه تغيير حالة الرسوم")
    if data.status not in ("pending", "due", "paid"):
        raise HTTPException(status_code=400, detail="حالة غير صحيحة")

    update = {"status": data.status, "status_overridden": True}
    if data.status == "paid":
        update["is_paid"] = True
        update["paid_date"] = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    else:
        update["is_paid"] = False
        update["paid_date"] = None

    res = await db.fees.update_many({"id": {"$in": data.fee_ids}}, {"$set": update})
    return {"message": f"تم تحديث {res.modified_count} رسم", "modified": res.modified_count}


@api_router.put("/fees/{fee_id}/pay")
async def mark_fee_paid(fee_id: str, current_user: dict = Depends(get_current_user)):
    """Mark a fee as paid (Admin only)"""
    ensure_role(current_user, "admin", "فقط المدير يمكنه تأكيد الدفع")

    result = await db.fees.update_one(
        {"id": fee_id},
        {"$set": {
            "is_paid": True,
            "paid_date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            "status": "paid",
            "status_overridden": True
        }}
    )

    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="الرسوم غير موجودة")

    return {"message": "تم تأكيد الدفع بنجاح"}


class FeeStatusUpdate(BaseModel):
    status: str  # "pending" (قائم), "due" (مستحق), "paid" (مدفوع)


@api_router.put("/fees/{fee_id}/status")
async def update_fee_status(fee_id: str, data: FeeStatusUpdate, current_user: dict = Depends(get_current_user)):
    """تغيير حالة الرسوم يدوياً من قبل المدير (قائم / مستحق / مدفوع)"""
    ensure_role(current_user, "admin", "فقط المدير يمكنه تغيير حالة الرسوم")

    valid = {"pending", "due", "paid"}
    if data.status not in valid:
        raise HTTPException(status_code=400, detail="حالة غير صحيحة")

    update = {"status": data.status, "status_overridden": True}
    if data.status == "paid":
        update["is_paid"] = True
        update["paid_date"] = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    else:
        update["is_paid"] = False
        update["paid_date"] = None

    result = await db.fees.update_one({"id": fee_id}, {"$set": update})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="الرسوم غير موجودة")

    status_labels = {"pending": "قائم", "due": "مستحق", "paid": "مدفوع"}
    return {"message": f"تم تحديث الحالة إلى: {status_labels[data.status]}"}

@api_router.delete("/fees/{fee_id}")
async def delete_fee(fee_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a fee (Admin only)"""
    ensure_role(current_user, "admin", "فقط المدير يمكنه حذف الرسوم")
    
    result = await db.fees.delete_one({"id": fee_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="الرسوم غير موجودة")

    return {"message": "تم حذف الرسوم بنجاح"}


@api_router.get("/export/fees")
async def export_fees_excel(year: Optional[int] = None, current_user: dict = Depends(get_current_user)):
    """تحميل تقرير الرسوم المالية على شكل ملف Excel (المدير فقط)"""
    ensure_role(current_user, "admin", "فقط المدير يمكنه تحميل التقرير المالي")

    arabic_months = ['', 'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
                     'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']
    fee_type_labels = {"subscription": "رسوم اشتراك", "umrah": "عمرة", "activity": "نشاط"}
    status_labels = {"pending": "قائم", "due": "مستحق", "paid": "مدفوع"}

    fees = await db.fees.find({}, {"_id": 0}).to_list(2000)
    if year:
        fees = [f for f in fees if (f.get("year") or 0) == year]
    # ترتيب حسب الشهر ثم تاريخ الإنشاء
    fees.sort(key=lambda f: (f.get("month") or 0, f.get("created_at") or ""))

    # أسماء الطلاب والمجموعات
    student_cache = {}
    for f in fees:
        f["status"] = compute_fee_status(f)
        sid = f["student_id"]
        if sid not in student_cache:
            stu = await db.users.find_one({"id": sid}, {"_id": 0, "name": 1, "group_id": 1})
            gname = ""
            if stu and stu.get("group_id"):
                g = await db.groups.find_one({"id": stu["group_id"]}, {"_id": 0, "name": 1})
                gname = g["name"] if g else ""
            student_cache[sid] = {"name": stu["name"] if stu else "غير معروف", "group": gname}

    output = io.BytesIO()
    workbook = xlsxwriter.Workbook(output, {'in_memory': True})
    title_format = workbook.add_format({'bold': True, 'font_size': 16, 'align': 'center',
                                        'valign': 'vcenter', 'bg_color': '#0d9488', 'font_color': 'white'})
    header_format = workbook.add_format({'bold': True, 'bg_color': '#1e3a5f', 'font_color': 'white',
                                         'border': 1, 'align': 'center', 'valign': 'vcenter', 'font_size': 12})
    cell_format = workbook.add_format({'border': 1, 'align': 'center', 'valign': 'vcenter', 'font_size': 11})
    money_format = workbook.add_format({'border': 1, 'align': 'center', 'valign': 'vcenter',
                                        'font_size': 11, 'num_format': '#,##0.00'})
    paid_format = workbook.add_format({'border': 1, 'align': 'center', 'bg_color': '#d1fae5', 'font_color': '#065f46'})
    due_format = workbook.add_format({'border': 1, 'align': 'center', 'bg_color': '#fef3c7', 'font_color': '#92400e'})
    pending_format = workbook.add_format({'border': 1, 'align': 'center', 'bg_color': '#e2e8f0', 'font_color': '#334155'})
    status_fmt = {"paid": paid_format, "due": due_format, "pending": pending_format}

    sheet = workbook.add_worksheet('الرسوم المالية')
    sheet.right_to_left()
    title_year = f" - {year}" if year else ""
    sheet.merge_range('A1:I1', f'التقرير المالي{title_year}', title_format)
    sheet.merge_range('A2:I2', f'تاريخ التصدير: {datetime.now().strftime("%Y-%m-%d")}', cell_format)

    headers = ['#', 'اسم الطالب', 'المجموعة', 'الشهر', 'السنة', 'نوع الرسوم', 'المبلغ', 'الحالة', 'تاريخ الدفع']
    for col, h in enumerate(headers):
        sheet.write(3, col, h, header_format)
    sheet.set_column('A:A', 5)
    sheet.set_column('B:B', 25)
    sheet.set_column('C:C', 18)
    sheet.set_column('D:I', 13)

    total = paid_total = due_total = pending_total = 0.0
    row = 4
    for idx, f in enumerate(fees, 1):
        amount = f.get("amount") or 0
        st = f["status"]
        total += amount
        if st == "paid":
            paid_total += amount
        elif st == "due":
            due_total += amount
        else:
            pending_total += amount
        info = student_cache.get(f["student_id"], {"name": "غير معروف", "group": ""})
        sheet.write(row, 0, idx, cell_format)
        sheet.write(row, 1, info["name"], cell_format)
        sheet.write(row, 2, info["group"], cell_format)
        sheet.write(row, 3, arabic_months[f["month"]] if f.get("month") else "", cell_format)
        sheet.write(row, 4, f.get("year") or "", cell_format)
        sheet.write(row, 5, fee_type_labels.get(f.get("fee_type"), f.get("fee_type") or ""), cell_format)
        sheet.write_number(row, 6, amount, money_format)
        sheet.write(row, 7, status_labels.get(st, st), status_fmt.get(st, cell_format))
        sheet.write(row, 8, f.get("paid_date") or "", cell_format)
        row += 1

    # ملخص
    row += 1
    summary_label = workbook.add_format({'bold': True, 'align': 'center', 'border': 1, 'bg_color': '#f1f5f9'})
    sheet.write(row, 5, 'الإجمالي', summary_label); sheet.write_number(row, 6, total, money_format); row += 1
    sheet.write(row, 5, 'مدفوع', summary_label); sheet.write_number(row, 6, paid_total, paid_format); row += 1
    sheet.write(row, 5, 'مستحق', summary_label); sheet.write_number(row, 6, due_total, due_format); row += 1
    sheet.write(row, 5, 'قائم', summary_label); sheet.write_number(row, 6, pending_total, pending_format)

    workbook.close()
    output.seek(0)
    filename = f"financial_report_{year or 'all'}_{datetime.now().strftime('%Y%m%d')}.xlsx"
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

# ============== BADGES & INTERACTION SYSTEM ==============

class InteractionGrantCreate(BaseModel):
    student_id: str
    notes: Optional[str] = None

@api_router.post("/badges/interaction")
async def grant_interaction_badge(data: InteractionGrantCreate, current_user: dict = Depends(get_current_user)):
    """منح شارة المتفاعل ونقاط التفاعل - للمشرف فقط"""
    ensure_role(current_user, "sheikh", "فقط المشرف يمكنه منح شارة التفاعل")
    
    week_start = get_current_week_start()
    
    # التحقق من عدم منح التفاعل مسبقاً لهذا الأسبوع
    existing = await db.interaction_grants.find_one({
        "student_id": data.student_id,
        "sheikh_id": current_user["user_id"],
        "week_start": week_start
    })
    
    if existing:
        raise HTTPException(status_code=400, detail="تم منح نقاط التفاعل لهذا الطالب هذا الأسبوع مسبقاً")

    # الحد الأعلى: لا يتجاوز عدد المتفاعلين 50% من عدد طلاب المجموعة في الأسبوع
    student = await db.users.find_one({"id": data.student_id, "role": "student"})
    if not student:
        raise HTTPException(status_code=404, detail="الطالب غير موجود")
    group_id = student.get("group_id")
    if group_id:
        group_students = await db.users.find(
            {"group_id": group_id, "role": "student"}, {"id": 1, "_id": 0}
        ).to_list(1000)
        group_ids = [s["id"] for s in group_students]
        group_size = len(group_ids)
        max_allowed = max(1, group_size // 2)  # نصف المجموعة (بحد أدنى طالب واحد)
        granted_this_week = await db.interaction_grants.count_documents({
            "student_id": {"$in": group_ids},
            "week_start": week_start
        })
        if granted_this_week >= max_allowed:
            raise HTTPException(
                status_code=400,
                detail=f"تم الوصول للحد الأعلى لنقاط التفاعل هذا الأسبوع (50% من المجموعة = {max_allowed} طالب)"
            )

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
        await add_points(data.student_id, points_to_add, "interaction", "نقاط تفاعل من المشرف")
        await db.student_points.update_one(
            {"student_id": data.student_id},
            {"$inc": {"interaction_points": points_to_add}},
            upsert=True
        )
    
    # إشعار الطالب
    await create_notification_internal(
        data.student_id,
        "🌟 شارة المتفاعل",
        f"حصلت على شارة المتفاعل و{points_to_add} نقطة من المشرف!",
        "success"
    )
    
    return {"message": "تم منح شارة التفاعل بنجاح", "points_added": points_to_add}

class AdminBonusCreate(BaseModel):
    student_id: str
    reason: Optional[str] = None
    points: Optional[int] = None  # تجاوز اختياري لمقدار النقاط الافتراضي


# ---- إعدادات نقاط التميز (المقدار + كل كم يوم) ----
EXCELLENCE_DEFAULTS = {"points": 50, "period_days": 7}


async def get_excellence_config() -> dict:
    """إعدادات نقاط التميز من مجموعة settings (مع قيم افتراضية آمنة)."""
    doc = await db.settings.find_one({"key": "excellence_points"}, {"_id": 0}) or {}
    points = doc.get("points", EXCELLENCE_DEFAULTS["points"])
    period_days = doc.get("period_days", EXCELLENCE_DEFAULTS["period_days"])
    try:
        points = max(1, min(1000, int(points)))
    except (TypeError, ValueError):
        points = EXCELLENCE_DEFAULTS["points"]
    try:
        period_days = max(0, min(365, int(period_days)))  # 0 = بدون تقييد
    except (TypeError, ValueError):
        period_days = EXCELLENCE_DEFAULTS["period_days"]
    return {"points": points, "period_days": period_days}


@api_router.post("/badges/admin-bonus")
async def grant_admin_bonus(data: AdminBonusCreate, current_user: dict = Depends(get_current_user)):
    """منح نقاط التميز - للمدير فقط. المقدار والمدة من إعدادات `excellence_points`."""
    ensure_role(current_user, "admin", "فقط المدير يمكنه منح النقاط الإدارية")

    cfg = await get_excellence_config()
    period_days = cfg["period_days"]

    # مقدار النقاط: تجاوز المدير إن وُجد، وإلا الإعداد العام
    points_value = cfg["points"]
    if data.points is not None:
        try:
            points_value = max(1, min(1000, int(data.points)))
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="مقدار النقاط غير صحيح")

    now = datetime.now(timezone.utc)
    week_start = get_current_week_start()

    # التحقق من المدة: هل مُنِح الطالب نقاط تميز خلال آخر period_days يوم؟
    if period_days > 0:
        cutoff = (now - timedelta(days=period_days)).isoformat()
        existing = await db.admin_bonus_grants.find_one({
            "student_id": data.student_id,
            "created_at": {"$gte": cutoff}
        })
        if existing:
            raise HTTPException(
                status_code=400,
                detail=f"تم منح نقاط التميز لهذا الطالب خلال آخر {period_days} يوم"
            )

    # إنشاء سجل النقاط الإدارية
    bonus = {
        "id": str(uuid.uuid4()),
        "student_id": data.student_id,
        "admin_id": current_user["user_id"],
        "points": points_value,
        "week_start": week_start,
        "reason": data.reason,
        "created_at": now.isoformat()
    }

    await db.admin_bonus_grants.insert_one(bonus)

    # منح النقاط (مع الحد الأقصى 1000)
    student_points = await db.student_points.find_one({"student_id": data.student_id})
    current_total = student_points.get("total_points", 0) if student_points else 0
    points_to_add = min(points_value, 1000 - current_total)

    if points_to_add > 0:
        await add_points(data.student_id, points_to_add, "admin_bonus", data.reason or "نقاط إدارية للتميز")
        await db.student_points.update_one(
            {"student_id": data.student_id},
            {"$inc": {"admin_bonus_points": points_to_add}},
            upsert=True
        )

    # إشعار الطالب — مع سبب المنح إن كُتِب
    reason_txt = (data.reason or "").strip()
    msg = f"حصلت على {points_to_add} نقطة تميز"
    if reason_txt:
        msg += f" — السبب: {reason_txt}"
    await create_notification_internal(
        data.student_id,
        "🏆 نقاط التميز",
        msg,
        "success"
    )

    return {"message": "تم منح نقاط التميز بنجاح", "points_added": points_to_add}

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
    ensure_role(current_user, ["admin", "sheikh"], "غير مصرح لك")
    
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
            groups = await db.groups.find({"sheikh_ids": current_user["user_id"]}, {"_id": 0, "id": 1}).to_list(20)
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
            f"تمت إضافة واجب: {data.title} - موعد التسليم: {data.due_date}",
            "info"
        )
    
    return {"message": "تمت إضافة الواجب بنجاح", "homework_id": homework.id}

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
    ensure_role(current_user, ["admin", "sheikh"], "غير مصرح لك")
    
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
    ensure_role(current_user, "student", "فقط الطلاب يمكنهم تسليم الواجبات")
    
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
    ensure_role(current_user, ["admin", "sheikh"], "غير مصرح لك")
    
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
    ensure_role(current_user, ["admin", "sheikh"], "غير مصرح لك")
    
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
    ensure_role(current_user, ["admin", "sheikh"], "غير مصرح لك")
    
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
    exam_type_text = "مفصل قرآن" if data.exam_type == "quran" else "اختبار تجويد"
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
    
    return {"message": "تمت إضافة الاختبار بنجاح", "exam_id": exam.id, "grade": final_grade}

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
    ensure_role(current_user, ["admin", "sheikh"], "غير مصرح لك")
    
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
        raise HTTPException(status_code=404, detail="الاختبار غير موجود")
    
    return {"message": "تم تحديث الاختبار بنجاح"}

@api_router.delete("/admin-exams/{exam_id}")
async def delete_admin_exam(exam_id: str, current_user: dict = Depends(get_current_user)):
    """Delete an exam"""
    ensure_role(current_user, ["admin", "sheikh"], "غير مصرح لك")
    
    result = await db.admin_exams.delete_one({"id": exam_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="الاختبار غير موجود")
    
    return {"message": "تم حذف الاختبار بنجاح"}

# ============== TAJWEED EXAMS ==============

@api_router.post("/tajweed-exams")
async def create_tajweed_exam(data: TajweedExamCreate, current_user: dict = Depends(get_current_user)):
    """Create a tajweed exam"""
    ensure_role(current_user, ["admin", "sheikh"], "غير مصرح لك")
    
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
        "نتيجة اختبار التجويد",
        f"موضوع: {data.topic} - النتيجة: {result_text} - الدرجة: {final_score}%",
        "success" if data.result == "pass" else "warning"
    )
    
    return {"message": "تمت إضافة اختبار التجويد بنجاح", "exam_id": exam.id}

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
    ensure_role(current_user, ["admin", "sheikh"], "غير مصرح لك")
    
    result = await db.tajweed_exams.delete_one({"id": exam_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="الاختبار غير موجود")
    
    return {"message": "تم حذف الاختبار بنجاح"}

# ============== ONLINE EXAMS (اختبارات إلكترونية) ==============

@api_router.post("/online-exams")
async def create_online_exam(data: OnlineExamCreate, current_user: dict = Depends(get_current_user)):
    """إنشاء اختبار إلكتروني جديد (للمشرف/المدير)"""
    ensure_role(current_user, ["admin", "sheikh"], "غير مصرح لك بإنشاء اختبارات")
    
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
    
    # إنشاء نسخة كاملة من الأسئلة (للمشرفين)
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
        "message": "تم إنشاء الاختبار بنجاح",
        "exam_id": exam.id,
        "total_questions": len(data.questions),
        "total_points": total_points
    }

@api_router.get("/online-exams")
async def get_online_exams(current_user: dict = Depends(get_current_user)):
    """الحصول على قائمة الاختبارات الإلكترونية"""
    query = {}
    
    if current_user["role"] == "student":
        # للطلاب: الاختبارات الفعالة فقط
        query["is_active"] = True
        # يمكن تصفية حسب المجموعة لاحقاً
    
    exams = await db.online_exams.find(query, {"_id": 0, "questions_with_answers": 0}).sort("created_at", -1).to_list(100)
    
    # إضافة معلومات إضافية
    for exam in exams:
        # الحصول على اسم المنشئ
        creator = await db.users.find_one({"id": exam.get("created_by")}, {"_id": 0, "name": 1})
        exam["creator_name"] = creator["name"] if creator else "غير معروف"
        
        # التحقق إذا كان الطالب قد أكمل الاختبار
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
    """الحصول على تفاصيل اختبار معين"""
    exam = await db.online_exams.find_one({"id": exam_id}, {"_id": 0})
    
    if not exam:
        raise HTTPException(status_code=404, detail="الاختبار غير موجود")
    
    # للطلاب: إخفاء الإجابات الصحيحة
    if current_user["role"] == "student":
        exam.pop("questions_with_answers", None)
        
        # التحقق إذا كان قد أكمل الاختبار
        submission = await db.exam_submissions.find_one({
            "exam_id": exam_id,
            "student_id": current_user["user_id"]
        }, {"_id": 0})
        
        if submission:
            exam["already_submitted"] = True
            exam["my_submission"] = submission
    else:
        # للمشرفين: إظهار الإجابات الصحيحة
        exam["questions"] = exam.get("questions_with_answers", exam.get("questions"))
    
    return exam

@api_router.post("/online-exams/{exam_id}/submit")
async def submit_online_exam(exam_id: str, data: ExamSubmissionCreate, current_user: dict = Depends(get_current_user)):
    """تقديم إجابات الاختبار (للطالب)"""
    ensure_role(current_user, "student", "فقط الطلاب يمكنهم تقديم الاختبارات")
    
    # التحقق من وجود الاختبار
    exam = await db.online_exams.find_one({"id": exam_id}, {"_id": 0})
    if not exam:
        raise HTTPException(status_code=404, detail="الاختبار غير موجود")
    
    # التحقق من عدم تقديم الاختبار سابقاً
    existing = await db.exam_submissions.find_one({
        "exam_id": exam_id,
        "student_id": current_user["user_id"]
    })
    if existing:
        raise HTTPException(status_code=400, detail="لقد قدمت هذا الاختبار سابقاً")
    
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
        f"اختبار: {exam.get('title')} - الدرجة: {score}%"
    )
    
    # إرسال إشعار
    result_text = "ناجح ✅" if passed else "راسب ❌"
    await create_notification_internal(
        current_user["user_id"],
        f"نتيجة الاختبار: {exam.get('title')}",
        f"النتيجة: {result_text} - الدرجة: {score}% - الإجابات الصحيحة: {correct_count}/{total_questions}",
        "success" if passed else "warning"
    )
    
    return {
        "message": "تم تقديم الاختبار بنجاح",
        "score": score,
        "correct_count": correct_count,
        "total_questions": total_questions,
        "points_earned": points_earned,
        "passed": passed,
        "passing_score": exam.get("passing_score", 60)
    }

@api_router.get("/online-exams/{exam_id}/results")
async def get_exam_results(exam_id: str, current_user: dict = Depends(get_current_user)):
    """الحصول على نتائج الاختبار (للمشرف/المدير)"""
    ensure_role(current_user, ["admin", "sheikh"], "غير مصرح لك")
    
    # التحقق من وجود الاختبار
    exam = await db.online_exams.find_one({"id": exam_id}, {"_id": 0})
    if not exam:
        raise HTTPException(status_code=404, detail="الاختبار غير موجود")
    
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
    """حذف اختبار إلكتروني"""
    ensure_role(current_user, ["admin", "sheikh"], "غير مصرح لك")
    
    result = await db.online_exams.delete_one({"id": exam_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="الاختبار غير موجود")
    
    # حذف جميع التقديمات المرتبطة
    await db.exam_submissions.delete_many({"exam_id": exam_id})
    
    return {"message": "تم حذف الاختبار بنجاح"}

@api_router.put("/online-exams/{exam_id}/toggle-active")
async def toggle_exam_active(exam_id: str, current_user: dict = Depends(get_current_user)):
    """تفعيل/إلغاء تفعيل اختبار"""
    ensure_role(current_user, ["admin", "sheikh"], "غير مصرح لك")
    
    exam = await db.online_exams.find_one({"id": exam_id})
    if not exam:
        raise HTTPException(status_code=404, detail="الاختبار غير موجود")
    
    new_status = not exam.get("is_active", True)
    await db.online_exams.update_one({"id": exam_id}, {"$set": {"is_active": new_status}})
    
    return {"message": f"تم {'تفعيل' if new_status else 'إلغاء تفعيل'} الاختبار", "is_active": new_status}

@api_router.post("/curriculum/{curriculum_id}/upload-pdf")
async def upload_curriculum_pdf(curriculum_id: str, file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    """Upload PDF file for curriculum (Admin only)"""
    ensure_role(current_user, "admin", "فقط المدير يمكنه رفع الملفات")
    
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
    allow_late_submission: Optional[bool] = None  # استقبال المتأخرة بدون نقاط

@api_router.get("/settings/tracking-submission")
async def get_tracking_submission_settings(current_user: dict = Depends(get_current_user)):
    """الحصول على إعدادات مواعيد تسليم ورق المتابعة"""
    ensure_role(current_user, ["admin", "sheikh"], "غير مصرح لك")
    
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
            # استقبال الورقة المتأخرة بدون احتساب نقاط (إن أُطفئ تُرفض تمامًا)
            "allow_late_submission": True,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.settings.insert_one(default_settings)
        return default_settings

    # الإعدادات القديمة ما فيها هذا المفتاح — الافتراضي: نستقبل المتأخرة بلا نقاط
    settings.setdefault("allow_late_submission", True)
    return settings

@api_router.put("/settings/tracking-submission")
async def update_tracking_submission_settings(data: TrackingSettingsUpdate, current_user: dict = Depends(get_current_user)):
    """تحديث إعدادات مواعيد تسليم ورق المتابعة (المدير والمشرف)"""
    ensure_role(current_user, ["admin", "sheikh"], "غير مصرح لك")
    
    # الأيام المسموحة
    valid_days = ["saturday", "sunday", "monday", "tuesday", "wednesday", "thursday", "friday"]
    
    update_data = {"updated_at": datetime.now(timezone.utc).isoformat()}
    
    if data.submission_enabled is not None:
        update_data["submission_enabled"] = data.submission_enabled

    if data.allow_late_submission is not None:
        update_data["allow_late_submission"] = bool(data.allow_late_submission)
    
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

class ExcellenceSettingsUpdate(BaseModel):
    points: Optional[int] = None
    period_days: Optional[int] = None


@api_router.get("/settings/excellence-points")
async def get_excellence_points_settings(current_user: dict = Depends(get_current_user)):
    """إعدادات نقاط التميز: المقدار + كل كم يوم يُسمح بالمنح (0 = بدون تقييد)."""
    ensure_role(current_user, ["admin", "sheikh"], "غير مصرح لك")
    return await get_excellence_config()


@api_router.put("/settings/excellence-points")
async def update_excellence_points_settings(data: ExcellenceSettingsUpdate,
                                            current_user: dict = Depends(get_current_user)):
    """تحديث إعدادات نقاط التميز (المدير فقط)."""
    ensure_role(current_user, "admin", "فقط المدير يمكنه تعديل إعدادات نقاط التميز")

    update_data = {"updated_at": datetime.now(timezone.utc).isoformat()}

    if data.points is not None:
        if data.points < 1 or data.points > 1000:
            raise HTTPException(status_code=400, detail="مقدار النقاط يجب أن يكون بين 1 و 1000")
        update_data["points"] = int(data.points)

    if data.period_days is not None:
        if data.period_days < 0 or data.period_days > 365:
            raise HTTPException(status_code=400, detail="المدة يجب أن تكون بين 0 و 365 يوم (0 = بدون تقييد)")
        update_data["period_days"] = int(data.period_days)

    await db.settings.update_one(
        {"key": "excellence_points"},
        {"$set": update_data},
        upsert=True
    )

    return {"message": "تم تحديث إعدادات نقاط التميز بنجاح", "settings": await get_excellence_config()}


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
    name: str  # اسم الفصل الجديد
    confirm_name: Optional[str] = None  # N5: تأكيد بكتابة اسم الفصل الحالي قبل التصفير

@api_router.get("/terms")
async def get_terms(current_user: dict = Depends(get_current_user)):
    """Get all terms (Admin and Sheikh can view)"""
    ensure_role(current_user, ["admin", "sheikh"], "غير مصرح لك بالوصول للفصول الدراسية")
    
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
    ensure_role(current_user, "admin", "فقط المدير يمكنه إغلاق الفصل")
    
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

        # N5: تأكيد بكتابة اسم الفصل الحالي بالضبط قبل التصفير (حماية من الخطأ)
        if current_term.get("name") and (data.confirm_name or "").strip() != current_term["name"].strip():
            raise HTTPException(status_code=400,
                                detail=f"للتأكيد، اكتب اسم الفصل الحالي بالضبط: «{current_term['name']}»")

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
        
        # 8. (أُزيل) إشعار الطلاب ببداية فصل جديد — عملية إدارية لا تخصّ الطالب.
        #    يُسجَّل في سجل العمليات للمدير فقط.

        await log_admin_action(current_user, "term_reset", "term", term_id, term_name,
                               f"إغلاق الفصل وبدء «{data.name}» — أُرشِف {len(archives)} طالب")

        return {
            "message": f"تم إغلاق الفصل السابق وبدء الفصل الجديد: {data.name}",
            "new_term_id": new_term.id,
            "archived_students_count": len(archives),
            "archived_attendance_count": len(all_attendance),
            "archived_recitations_count": len(all_recitations),
            "previous_term_name": term_name
        }

    except HTTPException:
        raise
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
    ensure_role(current_user, "admin", "فقط المدير يمكنه إعادة تعيين الفصل")
    
    if not data.name or not data.name.strip():
        raise HTTPException(status_code=400, detail="يرجى إدخال اسم الفصل الجديد")
    
    try:
        # 1. الحصول على الفصل الحالي
        current_term = await db.terms.find_one({"is_active": True}, {"_id": 0})
        term_id = current_term["id"] if current_term else "no_term"
        term_name = current_term["name"] if current_term else "بدون فصل"

        # N5: تأكيد بكتابة اسم الفصل الحالي بالضبط قبل التصفير (حماية من الخطأ)
        if current_term and current_term.get("name") and (data.confirm_name or "").strip() != current_term["name"].strip():
            raise HTTPException(status_code=400,
                                detail=f"للتأكيد، اكتب اسم الفصل الحالي بالضبط: «{current_term['name']}»")

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
        
        # 8. (أُزيل) إشعار الطلاب ببداية فصل جديد — عملية إدارية لا تخصّ الطالب.
        #    يُسجَّل في سجل العمليات للمدير فقط.

        await log_admin_action(current_user, "term_reset", "term", term_id, term_name,
                               f"إعادة تعيين الفصل وبدء «{data.name}» — أُرشِف {len(archives)} طالب")

        return {
            "message": f"تمت إعادة تعيين الفصل بنجاح. الفصل الجديد: {data.name}",
            "new_term_id": new_term.id,
            "archived_students_count": len(archives),
            "previous_term_name": term_name
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"فشل في إعادة تعيين الفصل: {str(e)}")

@api_router.get("/terms/archive")
async def get_term_archives(term_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    """Get archived term data (Admin only)"""
    ensure_role(current_user, "admin", "فقط المدير يمكنه الوصول للأرشيف")
    
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
    ensure_role(current_user, ["admin", "sheikh"], "غير مصرح لك")
    
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
    ensure_role(current_user, "admin", "فقط المدير يمكنه إنشاء أنواع الشارات")
    
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
    """تعيين شارة لطالب - المشرف فقط"""
    ensure_role(current_user, "sheikh", "فقط المشرف يمكنه تعيين الشارات للطلاب")
    
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
    """إزالة شارة من طالب - المشرف فقط"""
    ensure_role(current_user, "sheikh", "فقط المشرف يمكنه إزالة الشارات من الطلاب")
    
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
    
    return {"message": "تمت إزالة الشارة من الطالب"}

# ============== SHEIKH UPDATE STUDENT ROUTES ==============

@api_router.put("/sheikh/students/{student_id}")
async def sheikh_update_student(student_id: str, data: SheikhUpdateStudent, current_user: dict = Depends(get_current_user)):
    """تعديل بيانات الطالب - المشرف فقط"""
    ensure_role(current_user, "sheikh", "فقط المشرف يمكنه تعديل بيانات الطلاب")
    
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
    ensure_role(current_user, "admin", "فقط المدير يمكنه الوصول لسجلات التدقيق")
    
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
    ensure_role(current_user, ["admin", "sheikh"], "غير مصرح لك بتحميل البيانات")
    
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
    ensure_role(current_user, ["admin", "sheikh"], "غير مصرح لك بتحميل البيانات")
    
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


ARABIC_WEEKDAYS = ["الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت", "الأحد"]


def _weekday_ar(date_str: str) -> str:
    """اسم اليوم بالعربي من تاريخ YYYY-MM-DD."""
    try:
        return ARABIC_WEEKDAYS[datetime.strptime(date_str[:10], "%Y-%m-%d").weekday()]
    except (ValueError, TypeError, IndexError):
        return ""


def _recitation_summary_ar(rec: dict) -> str:
    """وصف نصّي لما سمّعه الطالب في اليوم (حفظ جديد + مراجعة)."""
    if rec.get("did_not_recite"):
        return "لم يسمّع"

    parts = []

    # الحفظ الجديد
    juz = rec.get("juz_number")
    p_from, p_to = rec.get("page_from"), rec.get("page_to")
    new_pages = rec.get("new_pages") or 0
    if juz and p_from and p_to:
        parts.append(f"حفظ: جزء {juz} — صفحات {p_from}-{p_to}")
    elif juz and new_pages:
        parts.append(f"حفظ: جزء {juz} — {new_pages} صفحة")
    elif new_pages:
        parts.append(f"حفظ: {new_pages} صفحة")

    # المراجعة
    review_juz = rec.get("review_juz") or []
    if review_juz:
        parts.append("مراجعة: أجزاء " + "، ".join(str(j) for j in review_juz))
    partial_juz = rec.get("partial_review_juz")
    partial_pages = rec.get("partial_review_pages") or 0
    if partial_juz:
        parts.append(f"مراجعة جزئية: جزء {partial_juz}" + (f" ({partial_pages} صفحة)" if partial_pages else ""))
    elif not review_juz and (rec.get("review_pages") or 0):
        parts.append(f"مراجعة: {rec.get('review_pages')} صفحة")

    # احتياط للسجلات القديمة
    if not parts and (rec.get("pages_count") or 0):
        parts.append(f"{rec.get('pages_count')} صفحة")

    return " + ".join(parts) if parts else "—"


@api_router.get("/export/student-recitations/{student_id}")
async def export_student_recitations_excel(
    student_id: str,
    scope: str = "current",
    current_user: dict = Depends(get_current_user)
):
    """تنزيل سجل تسميع طالب واحد (اليوم + التاريخ + التسميع).
    scope=current → الفصل الحالي فقط، scope=all → كل الفصول (مع الأرشيف)."""
    if current_user["role"] == "student" and current_user["user_id"] != student_id:
        raise HTTPException(status_code=403, detail="لا يمكنك تحميل بيانات طالب آخر")

    student = await db.users.find_one({"id": student_id, "role": "student"}, {"_id": 0})
    if not student:
        raise HTTPException(status_code=404, detail="الطالب غير موجود")

    all_terms = scope == "all"
    active_term = await db.terms.find_one({"is_active": True}, {"_id": 0})

    # سجلات الفصل الحالي
    rec_query = {"student_id": student_id}
    if not all_terms and active_term:
        rec_query["$or"] = [
            {"term_id": active_term["id"]},
            {"term_id": None},
            {"term_id": {"$exists": False}},
        ]
    recitations = await db.recitations.find(rec_query, {"_id": 0}).to_list(20000)

    # الأرشيف عند طلب كل الفصول
    if all_terms:
        archived = await db.recitations_archives.find(
            {"student_id": student_id}, {"_id": 0}
        ).to_list(20000)
        recitations.extend(archived)

    recitations.sort(key=lambda r: (r.get("record_date") or "", str(r.get("created_at") or "")), reverse=True)

    scope_label = "جميع الفصول" if all_terms else (active_term["name"] if active_term else "الفصل الحالي")

    # أسماء الفصول (لعمود الفصل عند تصدير الكل)
    term_names = {}
    if all_terms:
        for t in await db.terms.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(500):
            term_names[t["id"]] = t["name"]

    group_name = ""
    if student.get("group_id"):
        group = await db.groups.find_one({"id": student["group_id"]}, {"_id": 0, "name": 1})
        group_name = group["name"] if group else ""

    output = io.BytesIO()
    workbook = xlsxwriter.Workbook(output, {'in_memory': True})

    title_format = workbook.add_format({
        'bold': True, 'font_size': 16, 'align': 'center', 'valign': 'vcenter',
        'bg_color': '#0d9488', 'font_color': 'white'
    })
    header_format = workbook.add_format({
        'bold': True, 'bg_color': '#1e3a5f', 'font_color': 'white',
        'border': 1, 'align': 'center', 'valign': 'vcenter', 'font_size': 12
    })
    cell_format = workbook.add_format({
        'border': 1, 'align': 'center', 'valign': 'vcenter', 'font_size': 11
    })
    text_format = workbook.add_format({
        'border': 1, 'align': 'right', 'valign': 'vcenter', 'font_size': 11
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

    sheet = workbook.add_worksheet('سجل التسميع')
    sheet.right_to_left()

    last_col = 6 if all_terms else 5
    sheet.merge_range(0, 0, 0, last_col, f'سجل تسميع: {student.get("name", "")} — {scope_label}', title_format)

    sheet.write(2, 0, 'الاسم:', header_format)
    sheet.write(2, 1, student.get("name", ""), cell_format)
    sheet.write(2, 2, 'المجموعة:', header_format)
    sheet.write(2, 3, group_name, cell_format)
    sheet.write(2, 4, 'عدد السجلات:', header_format)
    sheet.write(2, 5, len(recitations), cell_format)

    headers = ['#', 'اليوم', 'التاريخ', 'التسميع', 'الحالة', 'ملاحظات']
    if all_terms:
        headers.append('الفصل')
    for col, h in enumerate(headers):
        sheet.write(4, col, h, header_format)

    row = 5
    for i, rec in enumerate(recitations, 1):
        date_str = rec.get("record_date") or str(rec.get("created_at") or "")[:10]
        sheet.write(row, 0, i, cell_format)
        sheet.write(row, 1, _weekday_ar(date_str), cell_format)
        sheet.write(row, 2, date_str, cell_format)
        sheet.write(row, 3, _recitation_summary_ar(rec), text_format)

        if rec.get("did_not_recite"):
            status_text, fmt = "لم يسمّع", danger_format
        elif rec.get("passed_minimum") or rec.get("passed_review_minimum"):
            status_text, fmt = "اجتاز", success_format
        else:
            status_text, fmt = "لم يجتز", warning_format
        sheet.write(row, 4, status_text, fmt)
        sheet.write(row, 5, rec.get("notes", "") or "", text_format)

        if all_terms:
            tname = rec.get("term_name") or term_names.get(rec.get("term_id"), "")
            sheet.write(row, 6, tname, cell_format)
        row += 1

    if not recitations:
        sheet.merge_range(5, 0, 5, last_col, 'لا توجد سجلات تسميع', cell_format)

    sheet.set_column('A:A', 5)
    sheet.set_column('B:B', 12)
    sheet.set_column('C:C', 14)
    sheet.set_column('D:D', 45)
    sheet.set_column('E:E', 12)
    sheet.set_column('F:F', 30)
    sheet.set_column('G:G', 18)

    workbook.close()
    output.seek(0)

    filename = f"recitations_{student_id[:8]}_{'all' if all_terms else 'current'}_{datetime.now().strftime('%Y%m%d')}.xlsx"

    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


# ============== ملف المسابقة السنوية (أرشيف النتائج حسب السنة) ==============
# كل صف = مشاركة طالب في المسابقة السنوية لسنة معيّنة: الاسم، المستوى، العلامة، النتيجة.
# يُربط الصف بحساب الطالب (student_id) عند تطابق الاسم، فيظهر في صفحة الطالب بجانب تقييمه.

ANNUAL_DEFAULT_PASS_MARK = 70.0


class AnnualCompetitionRow(BaseModel):
    year: int
    student_name: str
    level: Optional[str] = None          # مثال: 5 أجزاء، 10 أجزاء، القرآن كاملًا
    score: Optional[float] = None        # العلامة من 100
    passed: Optional[bool] = None        # إن لم تُحدَّد تُحسب من العلامة وعلامة النجاح
    student_id: Optional[str] = None
    notes: Optional[str] = None


class AnnualCompetitionImport(BaseModel):
    year: int
    pass_mark: Optional[float] = None
    rows: List[AnnualCompetitionRow] = []


def _norm_ar_name(name: str) -> str:
    """توحيد كتابة الاسم للمطابقة: الهمزات، التاء المربوطة، الألف المقصورة، والمسافات."""
    s = (name or "").strip()
    for a, b in (("أ", "ا"), ("إ", "ا"), ("آ", "ا"), ("ة", "ه"), ("ى", "ي"), ("ـ", "")):
        s = s.replace(a, b)
    return " ".join(s.split())


async def _annual_pass_mark(year: int) -> float:
    doc = await db.annual_competition_years.find_one({"year": year}, {"_id": 0, "pass_mark": 1})
    return float(doc["pass_mark"]) if doc and doc.get("pass_mark") is not None else ANNUAL_DEFAULT_PASS_MARK


async def _annual_row_doc(row: AnnualCompetitionRow, pass_mark: float, students_by_name: dict) -> dict:
    name = " ".join((row.student_name or "").split())
    if not name:
        raise HTTPException(status_code=400, detail="اسم الطالب مطلوب")
    if row.score is not None and not (0 <= row.score <= 100):
        raise HTTPException(status_code=400, detail=f"العلامة يجب أن تكون بين 0 و100 ({name})")
    student_id = row.student_id or students_by_name.get(_norm_ar_name(name))
    passed = row.passed
    if passed is None and row.score is not None:
        passed = row.score >= pass_mark
    return {
        "year": row.year,
        "student_name": name,
        "student_id": student_id,
        "level": (row.level or "").strip() or None,
        "score": row.score,
        "passed": passed,
        "notes": (row.notes or "").strip() or None,
    }


async def _students_by_norm_name() -> dict:
    students = await db.users.find({"role": "student"}, {"_id": 0, "id": 1, "name": 1}).to_list(10000)
    return {_norm_ar_name(s.get("name")): s["id"] for s in students if s.get("name")}


@api_router.get("/annual-competition/years")
async def annual_competition_years(current_user: dict = Depends(get_current_user)):
    """السنوات المسجّلة مع عدد المشاركين والناجحين في كل سنة."""
    ensure_role(current_user, "admin", "فقط المدير يمكنه الوصول")
    agg = await db.annual_competition.aggregate([
        {"$group": {"_id": "$year", "total": {"$sum": 1},
                    "passed": {"$sum": {"$cond": [{"$eq": ["$passed", True]}, 1, 0]}},
                    "failed": {"$sum": {"$cond": [{"$eq": ["$passed", False]}, 1, 0]}}}},
    ]).to_list(200)
    years = {a["_id"]: {"year": a["_id"], "total": a["total"], "passed": a["passed"], "failed": a["failed"]} for a in agg}
    async for y in db.annual_competition_years.find({}, {"_id": 0}):
        years.setdefault(y["year"], {"year": y["year"], "total": 0, "passed": 0, "failed": 0})
        years[y["year"]]["pass_mark"] = y.get("pass_mark")
    for y in years.values():
        y.setdefault("pass_mark", None)
        if y["pass_mark"] is None:
            y["pass_mark"] = ANNUAL_DEFAULT_PASS_MARK
    return sorted(years.values(), key=lambda y: y["year"], reverse=True)


class AnnualYearRequest(BaseModel):
    year: int
    pass_mark: Optional[float] = None


@api_router.post("/annual-competition/years")
async def annual_competition_add_year(data: AnnualYearRequest, current_user: dict = Depends(get_current_user)):
    """إضافة سنة جديدة (أو تعديل علامة النجاح لسنة موجودة)."""
    ensure_role(current_user, "admin", "فقط المدير يمكنه الإضافة")
    if not (2000 <= data.year <= 2100):
        raise HTTPException(status_code=400, detail="السنة غير صحيحة")
    pass_mark = data.pass_mark if data.pass_mark is not None else ANNUAL_DEFAULT_PASS_MARK
    if not (0 <= pass_mark <= 100):
        raise HTTPException(status_code=400, detail="علامة النجاح يجب أن تكون بين 0 و100")
    await db.annual_competition_years.update_one(
        {"year": data.year}, {"$set": {"year": data.year, "pass_mark": pass_mark}}, upsert=True)
    return {"message": f"تم حفظ سنة {data.year}", "year": data.year, "pass_mark": pass_mark}


@api_router.get("/annual-competition")
async def annual_competition_list(year: int, status: Optional[str] = None, search: Optional[str] = None,
                                  current_user: dict = Depends(get_current_user)):
    """المشاركون في سنة معيّنة. status: passed | failed | pending."""
    ensure_role(current_user, "admin", "فقط المدير يمكنه الوصول")
    q = {"year": year}
    if status == "passed":
        q["passed"] = True
    elif status == "failed":
        q["passed"] = False
    elif status == "pending":
        q["passed"] = None
    rows = await db.annual_competition.find(q, {"_id": 0}).sort([("score", -1), ("student_name", 1)]).to_list(5000)
    if search:
        needle = _norm_ar_name(search)
        rows = [r for r in rows if needle in _norm_ar_name(r.get("student_name"))]
    # الربط بتقييم الطالب الحالي: أجزاء المسابقة السنوية المسجّلة في تقييمه، ومجموعته
    sids = [r["student_id"] for r in rows if r.get("student_id")]
    students = {s["id"]: s for s in await db.users.find(
        {"id": {"$in": sids}},
        {"_id": 0, "id": 1, "group_id": 1, "annual_competition": 1, "annual_competition_juz": 1, "tajweed_level": 1}
    ).to_list(5000)}
    groups = {g["id"]: g["name"] for g in await db.groups.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(3000)}
    for r in rows:
        s = students.get(r.get("student_id"))
        r["linked"] = bool(s)
        r["group_name"] = groups.get(s.get("group_id")) if s else None
        r["assessment_competition_juz"] = (s.get("annual_competition_juz") or []) if s and s.get("annual_competition") else []
        r["tajweed_level"] = s.get("tajweed_level") if s else None
    return {"year": year, "pass_mark": await _annual_pass_mark(year), "rows": rows}


@api_router.post("/annual-competition")
async def annual_competition_add(data: AnnualCompetitionRow, current_user: dict = Depends(get_current_user)):
    ensure_role(current_user, "admin", "فقط المدير يمكنه الإضافة")
    doc = await _annual_row_doc(data, await _annual_pass_mark(data.year), await _students_by_norm_name())
    doc["id"] = str(uuid.uuid4())
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    await db.annual_competition.insert_one(dict(doc))
    await db.annual_competition_years.update_one(
        {"year": data.year}, {"$setOnInsert": {"year": data.year, "pass_mark": ANNUAL_DEFAULT_PASS_MARK}}, upsert=True)
    return {"message": "تمت إضافة المشارك", "row": doc}


@api_router.put("/annual-competition/{row_id}")
async def annual_competition_update(row_id: str, data: AnnualCompetitionRow, current_user: dict = Depends(get_current_user)):
    ensure_role(current_user, "admin", "فقط المدير يمكنه التعديل")
    if not await db.annual_competition.find_one({"id": row_id}):
        raise HTTPException(status_code=404, detail="السجل غير موجود")
    doc = await _annual_row_doc(data, await _annual_pass_mark(data.year), await _students_by_norm_name())
    await db.annual_competition.update_one({"id": row_id}, {"$set": doc})
    return {"message": "تم تعديل السجل"}


@api_router.delete("/annual-competition/{row_id}")
async def annual_competition_delete(row_id: str, current_user: dict = Depends(get_current_user)):
    ensure_role(current_user, "admin", "فقط المدير يمكنه الحذف")
    result = await db.annual_competition.delete_one({"id": row_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="السجل غير موجود")
    return {"message": "تم حذف السجل"}


# أسماء الأعمدة المقبولة في ملف الاستيراد (Excel)
ANNUAL_IMPORT_HEADERS = {
    "student_name": ("الاسم", "اسم الطالب", "الطالب", "name"),
    "level": ("المستوى", "المستوي", "الفئة", "level"),
    "score": ("العلامة", "العلامه", "الدرجة", "الدرجه", "score", "mark"),
    "result": ("النتيجة", "النتيجه", "الحالة", "result"),
    "notes": ("ملاحظات", "ملاحظة", "notes"),
}


def _parse_annual_xlsx(content: bytes) -> List[dict]:
    """يقرأ أول ورقة: يبحث عن صف العناوين في أول 10 صفوف ثم يقرأ البيانات تحته."""
    import openpyxl
    try:
        wb = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=True)
    except Exception:
        raise HTTPException(status_code=400, detail="تعذّرت قراءة الملف — يجب أن يكون ملف Excel بصيغة xlsx")
    ws = wb.worksheets[0]
    all_rows = list(ws.iter_rows(values_only=True))
    header_idx, cols = None, {}
    for i, row in enumerate(all_rows[:10]):
        found = {}
        for c, val in enumerate(row):
            label = _norm_ar_name(str(val or "")).lower()
            for key, names in ANNUAL_IMPORT_HEADERS.items():
                if key not in found and label in {_norm_ar_name(n).lower() for n in names}:
                    found[key] = c
        if "student_name" in found:
            header_idx, cols = i, found
            break
    if header_idx is None:
        raise HTTPException(status_code=400, detail="لم يُعثر على عمود «الاسم» في أول عشرة صفوف من الملف")

    def cell(row, key):
        c = cols.get(key)
        return row[c] if c is not None and c < len(row) else None

    out = []
    for row in all_rows[header_idx + 1:]:
        name = str(cell(row, "student_name") or "").strip()
        if not name:
            continue
        score = cell(row, "score")
        try:
            score = float(str(score).replace("%", "").strip()) if score not in (None, "") else None
        except ValueError:
            score = None
        result = _norm_ar_name(str(cell(row, "result") or ""))
        passed = True if result in ("ناجح", "ناجحه", "نجح", "pass", "passed") else \
            False if result in ("راسب", "راسبه", "رسب", "fail", "failed") else None
        level = cell(row, "level")
        notes = cell(row, "notes")
        out.append({"student_name": name, "level": str(level).strip() if level not in (None, "") else None,
                    "score": score, "passed": passed, "notes": str(notes).strip() if notes not in (None, "") else None})
    return out


@api_router.post("/annual-competition/import")
async def annual_competition_import(year: int, pass_mark: Optional[float] = None, replace: bool = False,
                                    file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    """استيراد كشف سنة من ملف Excel (أعمدة: الاسم، المستوى، العلامة، النتيجة، ملاحظات).
    replace=true يحذف كشف السنة القديم أولًا؛ وإلا يُحدَّث الطالب الموجود بالاسم نفسه ويُضاف الجديد."""
    ensure_role(current_user, "admin", "فقط المدير يمكنه الاستيراد")
    if not (2000 <= year <= 2100):
        raise HTTPException(status_code=400, detail="السنة غير صحيحة")
    parsed = _parse_annual_xlsx(await file.read())
    if not parsed:
        raise HTTPException(status_code=400, detail="الملف لا يحتوي على أسماء")

    if pass_mark is not None:
        await db.annual_competition_years.update_one(
            {"year": year}, {"$set": {"year": year, "pass_mark": pass_mark}}, upsert=True)
    else:
        await db.annual_competition_years.update_one(
            {"year": year}, {"$setOnInsert": {"year": year, "pass_mark": ANNUAL_DEFAULT_PASS_MARK}}, upsert=True)
    mark = await _annual_pass_mark(year)
    by_name = await _students_by_norm_name()

    if replace:
        await db.annual_competition.delete_many({"year": year})
    existing = {_norm_ar_name(r["student_name"]): r["id"] for r in await db.annual_competition.find(
        {"year": year}, {"_id": 0, "id": 1, "student_name": 1}).to_list(5000)}

    added = updated = linked = 0
    now = datetime.now(timezone.utc).isoformat()
    for p in parsed:
        doc = await _annual_row_doc(AnnualCompetitionRow(year=year, **p), mark, by_name)
        linked += 1 if doc["student_id"] else 0
        key = _norm_ar_name(doc["student_name"])
        if key in existing:
            await db.annual_competition.update_one({"id": existing[key]}, {"$set": doc})
            updated += 1
        else:
            doc["id"] = str(uuid.uuid4())
            doc["created_at"] = now
            await db.annual_competition.insert_one(dict(doc))
            existing[key] = doc["id"]
            added += 1

    await log_admin_action(current_user, "annual_competition_import", "annual_competition", str(year), str(year),
                           f"استيراد كشف المسابقة السنوية {year}: {added} جديد، {updated} مُحدَّث، {linked} مرتبط بحساب طالب")
    return {"message": f"تم الاستيراد: {added} جديد، {updated} مُحدَّث، {linked} مرتبط بحساب طالب",
            "added": added, "updated": updated, "linked": linked, "total": len(parsed)}


@api_router.get("/annual-competition/template")
async def annual_competition_template(current_user: dict = Depends(get_current_user)):
    """نموذج Excel فارغ بالأعمدة المطلوبة للاستيراد."""
    ensure_role(current_user, "admin", "فقط المدير يمكنه الوصول")
    output = io.BytesIO()
    wb = xlsxwriter.Workbook(output, {'in_memory': True})
    head_f = wb.add_format({'bold': True, 'bg_color': '#1e3a5f', 'font_color': 'white', 'border': 1, 'align': 'center'})
    sh = wb.add_worksheet('كشف المسابقة')
    sh.right_to_left()
    for c, h in enumerate(['الاسم', 'المستوى', 'العلامة', 'النتيجة', 'ملاحظات']):
        sh.write(0, c, h, head_f)
    sh.write_row(1, 0, ['محمد أحمد علي', '5 أجزاء', 85, 'ناجح', ''])
    sh.set_column('A:A', 26); sh.set_column('B:E', 14)
    wb.close()
    return _xlsx_response(output, "annual_competition_template.xlsx")


@api_router.get("/annual-competition/export")
async def annual_competition_export(year: int, status: Optional[str] = None,
                                    current_user: dict = Depends(get_current_user)):
    ensure_role(current_user, "admin", "فقط المدير يمكنه التصدير")
    data = await annual_competition_list(year, status, None, current_user)
    output = io.BytesIO()
    wb = xlsxwriter.Workbook(output, {'in_memory': True})
    title_f = wb.add_format({'bold': True, 'font_size': 15, 'align': 'center', 'bg_color': '#0d9488', 'font_color': 'white'})
    head_f = wb.add_format({'bold': True, 'bg_color': '#1e3a5f', 'font_color': 'white', 'border': 1, 'align': 'center'})
    cell_f = wb.add_format({'border': 1, 'align': 'center'})
    sh = wb.add_worksheet(f'المسابقة {year}')
    sh.right_to_left()
    sh.merge_range('A1:G1', f'كشف المسابقة السنوية {year} — علامة النجاح {data["pass_mark"]:g}', title_f)
    for c, h in enumerate(['#', 'الاسم', 'المستوى', 'العلامة', 'النتيجة', 'المجموعة', 'ملاحظات']):
        sh.write(2, c, h, head_f)
    for i, r in enumerate(data["rows"], 1):
        result = "ناجح" if r.get("passed") is True else "راسب" if r.get("passed") is False else "—"
        sh.write_row(i + 2, 0, [i, r["student_name"], r.get("level") or "", r.get("score") if r.get("score") is not None else "",
                                result, r.get("group_name") or "", r.get("notes") or ""], cell_f)
    sh.set_column('A:A', 5); sh.set_column('B:B', 26); sh.set_column('C:G', 14)
    wb.close()
    return _xlsx_response(output, f"annual_competition_{year}.xlsx")


@api_router.get("/students/{student_id}/annual-competition")
async def student_annual_competition(student_id: str, current_user: dict = Depends(get_current_user)):
    """سجل الطالب في المسابقة السنوية عبر السنوات (يظهر في صفحة الطالب)."""
    ensure_role(current_user, ["admin", "sheikh", "student"], "غير مصرح لك")
    if current_user["role"] == "student" and current_user["user_id"] != student_id:
        raise HTTPException(status_code=403, detail="غير مصرح لك")
    return await db.annual_competition.find({"student_id": student_id}, {"_id": 0}).sort("year", -1).to_list(100)



# ============== ملف الإشراف الفني: الحافظ الصغير + التلاوة والتجويد ==============
# المسابقة السنوية لها ملفها الخاص (annual_competition). هنا سجلّان بنفس الشكل:
# كل سجل لشخص (طالب في المركز أو من خارجه) مع ما حصل عليه، وتاريخه، ومكانه.

SUPERVISION_KINDS = {"young_hafiz": "الحافظ الصغير", "tajweed": "التلاوة والتجويد"}
TAJWEED_LEVELS = ["تلاوة عامة", "تمهيدية", "متوسطة", "متقدمة", "إجازة", "اتقان", "سند غيبي", "روايات أخرى"]
YOUNG_HAFIZ_MIN_JUZ = 3                 # حفظ 3 أجزاء على الأقل
YOUNG_HAFIZ_MAX_GRADE = "الصف الخامس"   # الصف الخامس فما دون


class SupervisionRecord(BaseModel):
    kind: str                               # young_hafiz | tajweed
    full_name: str                          # الاسم الرباعي
    level: Optional[str] = None             # التجويد: المستوى · الحافظ الصغير: المستوى/الفئة
    obtained_date: Optional[str] = None     # تاريخ الحصول عليها (YYYY-MM-DD)
    place: Optional[str] = None             # مكان الحصول عليها: مدرسة، دورة، مركز...
    birth_date: Optional[str] = None
    school_grade: Optional[str] = None
    phone: Optional[str] = None
    juz_count: Optional[float] = None       # الحافظ الصغير: عدد الأجزاء المحفوظة
    student_id: Optional[str] = None        # يُربط تلقائيًا بحساب الطالب إن تطابق الاسم
    notes: Optional[str] = None


def _young_hafiz_grade_ok(grade: Optional[str]) -> bool:
    try:
        return SCHOOL_GRADES_ORDER.index((grade or "").strip()) <= SCHOOL_GRADES_ORDER.index(YOUNG_HAFIZ_MAX_GRADE)
    except ValueError:
        return False


async def _supervision_doc(data: SupervisionRecord) -> dict:
    if data.kind not in SUPERVISION_KINDS:
        raise HTTPException(status_code=400, detail="نوع السجل غير معروف")
    name = " ".join((data.full_name or "").split())
    if not name:
        raise HTTPException(status_code=400, detail="الاسم مطلوب")
    if data.kind == "tajweed" and data.level and data.level not in TAJWEED_LEVELS:
        raise HTTPException(status_code=400, detail="مستوى التجويد غير معروف")
    student_id = data.student_id or (await _students_by_norm_name()).get(_norm_ar_name(name))
    return {
        "kind": data.kind,
        "full_name": name,
        "level": (data.level or "").strip() or None,
        "obtained_date": data.obtained_date or None,
        "place": (data.place or "").strip() or None,
        "birth_date": data.birth_date or None,
        "school_grade": data.school_grade or None,
        "phone": (data.phone or "").strip() or None,
        "juz_count": data.juz_count,
        "student_id": student_id,
        "notes": (data.notes or "").strip() or None,
    }


@api_router.get("/supervision/summary")
async def supervision_summary(current_user: dict = Depends(get_current_user)):
    """أعداد ملفات الإشراف الفني (لبطاقات الصفحة الرئيسية للملف)."""
    ensure_role(current_user, "admin", "فقط المدير يمكنه الوصول")
    by_level = {lvl: 0 for lvl in TAJWEED_LEVELS}
    counts = {"young_hafiz": 0, "tajweed": 0}
    async for r in db.supervision_records.find({}, {"_id": 0, "kind": 1, "level": 1}):
        counts[r["kind"]] = counts.get(r["kind"], 0) + 1
        if r["kind"] == "tajweed" and r.get("level") in by_level:
            by_level[r["level"]] += 1
    return {
        "young_hafiz": counts["young_hafiz"],
        "tajweed": counts["tajweed"],
        "tajweed_levels": [{"level": k, "count": v} for k, v in by_level.items()],
        "annual_competition": {
            "total": await db.annual_competition.count_documents({}),
            "years": len(await db.annual_competition.distinct("year")),
        },
        "young_hafiz_rule": {"min_juz": YOUNG_HAFIZ_MIN_JUZ, "max_grade": YOUNG_HAFIZ_MAX_GRADE},
    }


@api_router.get("/supervision/records")
async def supervision_records(kind: str, level: Optional[str] = None,
                              current_user: dict = Depends(get_current_user)):
    ensure_role(current_user, "admin", "فقط المدير يمكنه الوصول")
    if kind not in SUPERVISION_KINDS:
        raise HTTPException(status_code=400, detail="نوع السجل غير معروف")
    q = {"kind": kind}
    if level:
        q["level"] = level
    rows = await db.supervision_records.find(q, {"_id": 0}).sort([("obtained_date", -1), ("full_name", 1)]).to_list(5000)
    groups = {g["id"]: g["name"] for g in await db.groups.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(3000)}
    sids = [r["student_id"] for r in rows if r.get("student_id")]
    students = {s["id"]: s for s in await db.users.find({"id": {"$in": sids}}, {"_id": 0, "id": 1, "group_id": 1}).to_list(5000)}
    for r in rows:
        st = students.get(r.get("student_id"))
        r["linked"] = bool(st)
        r["group_name"] = groups.get(st.get("group_id")) if st else None
    return rows


@api_router.post("/supervision/records")
async def supervision_record_add(data: SupervisionRecord, current_user: dict = Depends(get_current_user)):
    ensure_role(current_user, "admin", "فقط المدير يمكنه الإضافة")
    doc = await _supervision_doc(data)
    doc["id"] = str(uuid.uuid4())
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    doc["created_by"] = current_user["user_id"]
    await db.supervision_records.insert_one(dict(doc))
    await log_admin_action(current_user, "create", "supervision_record", doc["id"], doc["full_name"],
                           f"إضافة سجل {SUPERVISION_KINDS[doc['kind']]}")
    return doc


@api_router.put("/supervision/records/{record_id}")
async def supervision_record_update(record_id: str, data: SupervisionRecord, current_user: dict = Depends(get_current_user)):
    ensure_role(current_user, "admin", "فقط المدير يمكنه التعديل")
    if not await db.supervision_records.find_one({"id": record_id}):
        raise HTTPException(status_code=404, detail="السجل غير موجود")
    doc = await _supervision_doc(data)
    await db.supervision_records.update_one({"id": record_id}, {"$set": doc})
    return {"message": "تم تعديل السجل"}


@api_router.delete("/supervision/records/{record_id}")
async def supervision_record_delete(record_id: str, current_user: dict = Depends(get_current_user)):
    ensure_role(current_user, "admin", "فقط المدير يمكنه الحذف")
    rec = await db.supervision_records.find_one({"id": record_id}, {"_id": 0, "full_name": 1, "kind": 1})
    if not rec:
        raise HTTPException(status_code=404, detail="السجل غير موجود")
    await db.supervision_records.delete_one({"id": record_id})
    await log_admin_action(current_user, "delete", "supervision_record", record_id, rec["full_name"],
                           f"حذف سجل {SUPERVISION_KINDS.get(rec['kind'], '')}")
    return {"message": "تم حذف السجل"}


@api_router.get("/supervision/young-hafiz/eligible")
async def young_hafiz_eligible(current_user: dict = Depends(get_current_user)):
    """طلاب المركز المؤهَّلون للحافظ الصغير: حفظ 3 أجزاء فأكثر + الصف الخامس فما دون."""
    ensure_role(current_user, "admin", "فقط المدير يمكنه الوصول")
    students = await db.users.find({"role": "student"}, {
        "_id": 0, "id": 1, "name": 1, "group_id": 1, "school_grade": 1, "birth_date": 1, "phone": 1,
        "previous_memorization_juz": 1, "previous_memorization_pages": 1, "strong_juz": 1, "weak_juz": 1,
    }).to_list(10000)
    students = [s for s in students if _young_hafiz_grade_ok(s.get("school_grade"))]
    sids = [s["id"] for s in students]
    new_pages_by = {}
    async for r in db.recitations.find({"student_id": {"$in": sids}, "did_not_recite": {"$ne": True}},
                                       {"_id": 0, "student_id": 1, "new_pages": 1, "pages_count": 1, "recitation_type": 1}):
        new_pages_by[r["student_id"]] = new_pages_by.get(r["student_id"], 0) + _new_pages_of(r)
    recorded = set(await db.supervision_records.distinct("student_id", {"kind": "young_hafiz"}))
    groups = {g["id"]: g["name"] for g in await db.groups.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(3000)}
    rows = []
    for s in students:
        pages = (pages_for_juz_list(student_memorized_prev_juz(s)) + (s.get("previous_memorization_pages") or 0)
                 + new_pages_by.get(s["id"], 0))
        juz = round(pages / PAGES_PER_JUZ, 1)
        if juz < YOUNG_HAFIZ_MIN_JUZ:
            continue
        rows.append({
            "student_id": s["id"], "name": s.get("name") or "", "group_name": groups.get(s.get("group_id"), ""),
            "school_grade": s.get("school_grade"), "birth_date": s.get("birth_date"), "phone": s.get("phone"),
            "memorized_juz": juz, "recorded": s["id"] in recorded,
        })
    rows.sort(key=lambda r: (-r["memorized_juz"], r["name"]))
    return {"min_juz": YOUNG_HAFIZ_MIN_JUZ, "max_grade": YOUNG_HAFIZ_MAX_GRADE, "rows": rows}

# TEMPORARY — full database backup for migrating off the old host. Remove after migration.
@api_router.get("/admin/full-backup")
async def full_database_backup(current_user: dict = Depends(get_current_user)):
    """نسخة احتياطية كاملة لكل المجموعات (للمدير فقط)"""
    ensure_role(current_user, "admin", "فقط المدير يمكنه الوصول")
    from bson import json_util
    backup = {}
    for name in await db.list_collection_names():
        backup[name] = await db[name].find().to_list(None)
    return StreamingResponse(
        io.BytesIO(json_util.dumps(backup, ensure_ascii=False).encode("utf-8")),
        media_type="application/json",
        headers={"Content-Disposition": f"attachment; filename=full_backup_{datetime.now().strftime('%Y%m%d')}.json"}
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
