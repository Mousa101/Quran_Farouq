from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import Optional, List
from datetime import datetime, timezone, date
import uuid

# ============== HELPER FUNCTIONS ==============

def calculate_pages_from_juz(juz_count: int) -> int:
    """حساب عدد الصفحات من عدد الأجزاء - 1 جزء = 20 صفحة"""
    return juz_count * 20

PAGES_PER_JUZ = 20  # ثابت: عدد الصفحات في كل جزء
TOTAL_JUZ = 30
TOTAL_QURAN_PAGES = TOTAL_JUZ * PAGES_PER_JUZ  # 600 صفحة

# ============== TERM MANAGEMENT MODELS ==============

class Term(BaseModel):
    """نموذج الفصل الدراسي"""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str  # اسم الفصل مثل "الفصل الأول 2026"
    start_date: str
    end_date: Optional[str] = None
    is_active: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    created_by: str  # Admin ID

class TermArchive(BaseModel):
    """أرشيف بيانات الطلاب للفصل المنتهي"""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    term_id: str
    term_name: str
    student_id: str
    student_name: str
    # بيانات الفصل
    current_term_points: int = 0
    follow_up_count: int = 0
    recitation_count: int = 0
    attendance_total: int = 0
    attendance_present: int = 0
    attendance_absent: int = 0
    # تفاصيل إضافية
    tracking_points: int = 0
    recitation_points: int = 0
    bonus_points: int = 0
    archived_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# ============== AUDIT LOG MODEL ==============

class AuditLog(BaseModel):
    """سجل التدقيق للتغييرات"""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    actor_id: str  # من قام بالتغيير
    actor_role: str  # دور من قام بالتغيير
    target_student_id: str  # الطالب المستهدف
    field_changed: str  # الحقل الذي تغير
    old_value: Optional[str] = None
    new_value: Optional[str] = None
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# User Models - Updated with new fields
class UserBase(BaseModel):
    email: EmailStr
    name: str
    role: str = Field(..., pattern="^(student|sheikh|admin)$")

# Student Registration Request (before activation)
class StudentRegistrationRequest(BaseModel):
    email: EmailStr
    password: str
    name: str
    confirm_password: str
    role: str = "student"  # student, sheikh, admin
    # Phone numbers
    student_phone: Optional[str] = None
    father_phone: Optional[str] = None
    mother_phone: Optional[str] = None
    # Other student fields
    mosque_name: Optional[str] = None
    school_name: Optional[str] = None
    school_grade: Optional[str] = None  # الصف الدراسي
    school_average: Optional[str] = None
    birth_date: Optional[str] = None
    join_date: Optional[str] = None  # تاريخ الإلتحاق
    profile_image: Optional[str] = None
    # Sheikh/Admin specific
    specialization: Optional[str] = None  # تخصص الشيخ
    experience_years: Optional[int] = None  # سنوات الخبرة

# Activation request
class ActivationRequest(BaseModel):
    email: EmailStr
    activation_code: str

class StudentCreate(BaseModel):
    email: EmailStr
    password: str
    name: str
    role: str = "student"
    registration_code: str  # Required for students now
    # Phone numbers
    student_phone: Optional[str] = None
    father_phone: Optional[str] = None
    mother_phone: Optional[str] = None
    # Other student fields
    mosque_name: Optional[str] = None
    school_name: Optional[str] = None
    school_grade: Optional[str] = None
    birth_date: Optional[str] = None
    profile_image: Optional[str] = None

class UserCreate(UserBase):
    password: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class User(UserBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    group_id: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    registration_date: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    is_active: bool = False  # Changed to False - needs activation
    is_activated: bool = False  # New field for activation status
    activation_code: Optional[str] = None  # Code for activation
    # Phone numbers
    student_phone: Optional[str] = None
    father_phone: Optional[str] = None
    mother_phone: Optional[str] = None
    # Student fields
    mosque_name: Optional[str] = None
    school_name: Optional[str] = None
    school_grade: Optional[str] = None  # الصف الدراسي
    school_average: Optional[str] = None  # معدل الطالب
    birth_date: Optional[str] = None
    join_date: Optional[str] = None  # تاريخ الإلتحاق
    profile_image: Optional[str] = None
    # Progress tracking (for students)
    previous_memorization_juz: Optional[List[int]] = None  # الحفظ القديم
    previous_memorization_pages: Optional[int] = None
    tajweed_level: Optional[str] = None  # تمهيدية, متوسطة, متقدمة
    initial_assessment_done: bool = False  # هل تم التقييم الأولي

class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    role: str
    group_id: Optional[str] = None
    is_activated: bool = False
    student_phone: Optional[str] = None
    father_phone: Optional[str] = None
    mother_phone: Optional[str] = None
    mosque_name: Optional[str] = None
    school_name: Optional[str] = None
    school_grade: Optional[str] = None
    school_average: Optional[str] = None  # معدل الطالب
    birth_date: Optional[str] = None
    profile_image: Optional[str] = None
    registration_date: Optional[str] = None
    previous_memorization_juz: Optional[List[int]] = None
    previous_memorization_pages: Optional[int] = None
    tajweed_level: Optional[str] = None
    initial_assessment_done: bool = False

# Student Profile Update (Admin only)
class StudentProfileUpdate(BaseModel):
    name: Optional[str] = None
    student_phone: Optional[str] = None
    father_phone: Optional[str] = None
    mother_phone: Optional[str] = None
    mosque_name: Optional[str] = None
    school_name: Optional[str] = None
    school_grade: Optional[str] = None
    birth_date: Optional[str] = None
    profile_image: Optional[str] = None
    group_id: Optional[str] = None

# Initial Assessment by Sheikh
class InitialAssessment(BaseModel):
    student_id: str
    previous_memorization_juz: List[int] = []  # أرقام الأجزاء المحفوظة سابقاً
    previous_memorization_pages: int = 0  # صفحات إضافية
    tajweed_level: str  # تمهيدية, متوسطة, متقدمة
    notes: Optional[str] = None

# Group Models
class GroupCreate(BaseModel):
    name: str
    description: Optional[str] = None

class Group(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: Optional[str] = None
    sheikh_id: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# Tracking Sheet Models - Updated with detailed tracking
class TrackingSheetData(BaseModel):
    """
    ورقة المتابعة - المجموع 100 نقطة:
    - الصلوات: 35 نقطة (5 صلوات × 7 أيام)
    - أذكار بعد الصلاة: 7 نقاط (جديد)
    - الجلوس مع القرآن: 7 نقاط
    - صلاة الضحى: 7 نقاط
    - التسميع للأهل: 7 نقاط
    - ساعات الدراسة: 7 نقاط
    - الوتر: 7 نقاط
    - السنن: 7 نقاط
    - قيام الليل: 8 نقاط (إذا أتم يوم واحد = 8 نقاط كاملة)
    - الصيام: 8 نقاط (إذا أتم يوم واحد = 8 نقاط كاملة)
    المجموع: 35+7+7+7+7+7+7+7+8+8 = 100
    """
    # الصلوات - 35 نقطة كحد أقصى
    prayers_count: int = 0  # عدد الصلوات (0-35)
    # أذكار بعد الصلاة - 7 نقاط كحد أقصى (جديد)
    adhkar_after_prayer: int = 0  # عدد أيام الأذكار (0-7)
    # الجلوس مع القرآن - 7 نقاط كحد أقصى
    quran_sitting_days: int = 0  # عدد أيام الجلوس مع القرآن (0-7)
    # صلاة الضحى - 7 نقاط كحد أقصى
    duha_prayers: int = 0  # عدد أيام صلاة الضحى (0-7)
    # التسميع للأهل - 7 نقاط كحد أقصى
    family_recitation: int = 0  # عدد أيام التسميع للأهل (0-7)
    # ساعات الدراسة - 7 نقاط كحد أقصى
    study_hours: int = 0  # عدد أيام الدراسة (0-7)
    # الوتر - 7 نقاط كحد أقصى
    witr_prayers_days: int = 0  # عدد أيام صلاة الوتر (0-7)
    # السنن - 7 نقاط كحد أقصى
    sunnah_prayers: int = 0  # عدد أيام السنن (0-7)
    # قيام الليل - 8 نقاط (إذا أتم يوم = 8 نقاط)
    night_prayer: int = 0  # قيام الليل في الأسبوع (0-1)
    # الصيام - 8 نقاط (إذا أتم يوم = 8 نقاط)
    fasting: int = 0  # صيام في الأسبوع (0-1)
    # ملاحظات
    notes: Optional[str] = None
    # Legacy fields (للتوافق مع البيانات القديمة)
    adhkar_count: int = 0
    sunnah_prayers_days: int = 0
    quran_sitting_minutes: int = 0
    family_recitation_count: int = 0

class TrackingSheetCreate(BaseModel):
    student_id: str
    week_start: str
    image_base64: Optional[str] = None  # Optional now

class TrackingSheetManualCreate(BaseModel):
    """إدخال يدوي لورقة المتابعة"""
    student_id: str
    week_start: str
    prayers_count: int = 0  # الصلوات (0-35)
    adhkar_after_prayer: int = 0  # أذكار بعد الصلاة (0-7)
    quran_sitting_days: int = 0  # الجلوس مع القرآن (0-7)
    duha_prayers: int = 0  # صلاة الضحى (0-7)
    family_recitation: int = 0  # التسميع للأهل (0-7)
    study_hours: int = 0  # ساعات الدراسة (0-7)
    witr_prayers_days: int = 0  # الوتر (0-7)
    sunnah_prayers: int = 0  # السنن (0-7)
    night_prayer: int = 0  # قيام الليل (0-1)
    fasting: int = 0  # الصيام (0-1)
    notes: Optional[str] = None

class TrackingSheet(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    student_id: str
    sheikh_id: str
    week_start: str
    image_url: Optional[str] = None
    data: TrackingSheetData
    points_earned: int = 0  # النقاط المكتسبة
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# NEW Recitation Models - Updated with ranges and ratings
class RecitationCreate(BaseModel):
    student_id: str
    recitation_type: str = "combined"  # "new_memorization", "review", or "combined" (حفظ ومراجعة معاً)
    date: Optional[str] = None  # التاريخ المحدد (YYYY-MM-DD) - إذا لم يحدد يستخدم التاريخ الحالي
    # For new memorization - with range
    juz_number: Optional[int] = None  # رقم الجزء (1-30)
    page_from: Optional[int] = None  # من صفحة
    page_to: Optional[int] = None  # إلى صفحة
    new_pages: int = 0  # عدد صفحات الحفظ الجديد
    error_count: Optional[int] = None  # عدد الأخطاء
    passed_minimum: bool = False  # اجتاز الحد الأدنى
    did_not_recite: bool = False  # لم يسمع - لا يُحسب التسميع
    # For review - combined juz and pages
    review_juz: Optional[List[int]] = None  # أرقام الأجزاء المراجعة كاملة
    review_pages: int = 0  # عدد صفحات المراجعة
    partial_review_juz: Optional[int] = None  # جزء المراجعة الجزئية
    partial_review_pages: Optional[int] = None  # عدد صفحات المراجعة الجزئية
    passed_review_minimum: bool = False  # اجتاز الحد الأدنى للمراجعة
    # Combined fields - حفظ جديد ومراجعة معاً
    has_new_memorization: bool = False  # هل يوجد حفظ جديد
    has_review: bool = False  # هل يوجد مراجعة
    notes: Optional[str] = None
    # Legacy fields (for backward compatibility)
    pages_count: Optional[int] = None
    review_type: Optional[str] = None

class Recitation(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    student_id: str
    sheikh_id: str
    term_id: Optional[str] = None  # معرف الفصل الدراسي
    recitation_type: str
    record_date: str = Field(default_factory=lambda: datetime.now(timezone.utc).strftime("%Y-%m-%d"))  # تاريخ السجل
    # New memorization fields
    juz_number: Optional[int] = None
    page_from: Optional[int] = None
    page_to: Optional[int] = None
    new_pages: int = 0  # عدد صفحات الحفظ الجديد
    error_count: Optional[int] = None
    passed_minimum: bool = False
    did_not_recite: bool = False  # لم يسمع
    # Review fields
    review_juz: Optional[List[int]] = None
    review_pages: int = 0  # عدد صفحات المراجعة
    partial_review_juz: Optional[int] = None
    partial_review_pages: Optional[int] = None
    passed_review_minimum: bool = False
    # Combined fields
    has_new_memorization: bool = False
    has_review: bool = False
    notes: Optional[str] = None
    points_earned: int = 0  # 20 نقطة لكل تسميع (فقط إذا اجتاز)
    # Legacy fields
    pages_count: Optional[int] = None
    review_type: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# Attendance Models
class AttendanceCreate(BaseModel):
    student_id: str
    date: str
    status: str = Field(..., pattern="^(present|absent|excused)$")
    excuse_reason: Optional[str] = None  # سبب العذر

class Attendance(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    student_id: str
    sheikh_id: str
    group_id: str
    term_id: Optional[str] = None  # معرف الفصل الدراسي
    date: str
    status: str
    excuse_reason: Optional[str] = None  # سبب العذر
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# Student Self Update Model
class StudentSelfUpdate(BaseModel):
    """الحقول المسموح للطالب بتعديلها"""
    name: Optional[str] = None  # الاسم
    student_phone: Optional[str] = None  # رقم هاتف الطالب
    father_phone: Optional[str] = None  # رقم هاتف الأب
    mother_phone: Optional[str] = None  # رقم هاتف الأم
    profile_image: Optional[str] = None  # الصورة الشخصية
    birth_date: Optional[str] = None  # تاريخ الميلاد
    school_name: Optional[str] = None  # اسم المدرسة
    school_grade: Optional[str] = None  # الصف الدراسي
    school_average: Optional[str] = None  # المعدل الدراسي
    mosque_name: Optional[str] = None  # اسم المسجد

# Sheikh Update Student Model - ما يمكن للشيخ تعديله
class SheikhUpdateStudent(BaseModel):
    """الحقول المسموح للشيخ بتعديلها - لا يشمل email أو role أو id"""
    # بيانات شخصية
    name: Optional[str] = None
    student_phone: Optional[str] = None
    father_phone: Optional[str] = None
    mother_phone: Optional[str] = None
    profile_image: Optional[str] = None
    birth_date: Optional[str] = None
    school_name: Optional[str] = None
    school_grade: Optional[str] = None
    school_average: Optional[str] = None
    mosque_name: Optional[str] = None
    join_date: Optional[str] = None
    # التقييم الأولي
    initial_assessment_done: Optional[bool] = None
    previous_memorization_juz: Optional[List[int]] = None
    previous_memorization_pages: Optional[int] = None
    tajweed_level: Optional[str] = None

# Activity Models
class ActivityCreate(BaseModel):
    title: str
    description: str
    date: str
    time: str
    location: Optional[str] = None

class Activity(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    description: str
    date: str
    time: str
    location: Optional[str] = None
    created_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# Notification Models
class NotificationCreate(BaseModel):
    user_id: str
    title: str
    message: str
    type: str = "info"

class Notification(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    title: str
    message: str
    type: str = "info"
    is_read: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# Incentive/Ranking Models
class StudentScore(BaseModel):
    student_id: str
    student_name: str
    tracking_score: float = 0
    recitation_score: float = 0
    attendance_score: float = 0
    total_score: float = 0
    rank: str = "bronze"

class WeeklyRanking(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    week_start: str
    week_end: str
    gold_student_id: Optional[str] = None
    silver_student_id: Optional[str] = None
    bronze_student_id: Optional[str] = None
    scores: List[StudentScore] = []
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# Points & Badges System - Updated
WEEKLY_BADGES = {
    "worshipper": {
        "id": "worshipper",
        "name": "العابد",
        "description": "إتمام ورق المتابعة بنسبة 90% أو أكثر",
        "icon": "🏅",
        "category": "tracking"
    },
    "interactive": {
        "id": "interactive",
        "name": "المتفاعل",
        "description": "يمنحها المعلم للطالب المتفاعل",
        "icon": "⭐",
        "category": "interaction"
    },
    "committed": {
        "id": "committed",
        "name": "الملتزم",
        "description": "الالتزام بحضور كل الدروس",
        "icon": "📅",
        "category": "attendance"
    },
    "memorizer": {
        "id": "memorizer",
        "name": "الحافظ",
        "description": "التسميع في كل درس",
        "icon": "📖",
        "category": "recitation"
    }
}

class Badge(BaseModel):
    id: str
    name: str
    description: str
    icon: str
    points_required: int = 0
    category: str  # attendance, recitation, tracking, interaction, special

class WeeklyBadge(BaseModel):
    """شارة أسبوعية للطالب"""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    student_id: str
    badge_id: str  # worshipper, interactive, committed, memorizer
    badge_name: str
    badge_icon: str
    week_start: str  # بداية الأسبوع
    granted_by: Optional[str] = None  # من منحها (sheikh_id or system)
    granted_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class InteractionGrant(BaseModel):
    """منح نقاط التفاعل من المعلم"""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    student_id: str
    sheikh_id: str
    points: int = 10
    week_start: str
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class AdminBonusGrant(BaseModel):
    """منح نقاط إدارية للتميز من المدير"""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    student_id: str
    admin_id: str
    points: int = 50
    week_start: str
    reason: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class StudentPoints(BaseModel):
    """
    نظام النقاط - الحد الأقصى في الفصل: 1000 نقطة
    - ورقة المتابعة: 100 نقطة/أسبوع
    - كل تسميع: 10 نقاط
    - كل يوم حضور: 10 نقاط
    - تفاعل من المعلم: 10 نقاط
    - نقاط إدارية للتميز: 50 نقطة/أسبوع (من المدير)
    """
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    student_id: str
    total_points: int = 0  # الحد الأقصى 1000
    attendance_points: int = 0  # نقاط الحضور
    recitation_points: int = 0  # نقاط التسميع
    tracking_points: int = 0  # نقاط ورق المتابعة
    interaction_points: int = 0  # نقاط التفاعل من المعلم
    admin_bonus_points: int = 0  # نقاط إدارية للتميز
    weekly_badges: List[str] = []  # شارات الأسبوع الحالي
    badges_count: int = 0  # عدد الشارات المكتسبة (إجمالي)
    level: int = 1
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class PointsTransaction(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    student_id: str
    points: int
    category: str  # attendance, recitation, tracking, bonus
    description: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# ============== CURRICULUM & SCHEDULE MODELS ==============

# Curriculum Entry (Manual Entry)
class CurriculumEntryCreate(BaseModel):
    title: str  # العنوان
    date: str  # التاريخ
    topic: str  # الموضوع
    goal: str  # الهدف
    references: Optional[str] = None  # المراجع
    results: Optional[str] = None  # النتائج

class CurriculumEntry(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    curriculum_id: str  # Reference to parent curriculum
    title: str
    date: str
    topic: str
    goal: str
    references: Optional[str] = None
    results: Optional[str] = None
    order: int = 0  # For sorting
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# Main Curriculum Model
class CurriculumCreate(BaseModel):
    name: str  # اسم المنهج
    description: Optional[str] = None
    type: str = "manual"  # "manual" or "pdf"
    pdf_url: Optional[str] = None  # URL for PDF file

class Curriculum(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: Optional[str] = None
    type: str = "manual"  # "manual" or "pdf"
    pdf_url: Optional[str] = None
    pdf_filename: Optional[str] = None
    created_by: str  # Admin ID
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# Schedule Models
class ScheduleSlotCreate(BaseModel):
    day: str  # السبت، الأحد، etc.
    start_time: str  # وقت البداية HH:MM
    end_time: str  # وقت النهاية HH:MM
    subject: str  # الدرس/الموضوع
    description: Optional[str] = None
    group_id: Optional[str] = None  # Optional: specific group

class ScheduleSlot(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    schedule_id: str  # Reference to parent schedule
    day: str
    start_time: str
    end_time: str
    subject: str
    description: Optional[str] = None
    group_id: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ScheduleCreate(BaseModel):
    name: str  # اسم الجدول/الفصل
    description: Optional[str] = None
    start_date: str  # تاريخ بداية الفصل
    end_date: str  # تاريخ نهاية الفصل
    lesson_days: List[str] = []  # أيام الدروس: ["السبت", "الأحد", ...]

class Schedule(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: Optional[str] = None
    start_date: str
    end_date: str
    lesson_days: List[str] = []  # أيام الدروس
    is_active: bool = True
    created_by: str  # Admin ID
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# ============== FINANCIAL FEES MODELS ==============

class FeeCreate(BaseModel):
    student_id: str
    fee_type: str  # "subscription" (اشتراك), "umrah" (عمرة), "activity" (نشاط)
    amount: float
    description: Optional[str] = None
    due_date: Optional[str] = None
    month: Optional[int] = None  # الشهر (1-12)
    year: Optional[int] = None  # السنة

class Fee(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    student_id: str
    fee_type: str
    amount: float
    description: Optional[str] = None
    due_date: Optional[str] = None
    month: Optional[int] = None
    year: Optional[int] = None
    is_paid: bool = False
    paid_date: Optional[str] = None
    created_by: str  # Admin ID
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# ============== HOMEWORK/ASSIGNMENTS MODELS ==============

class HomeworkCreate(BaseModel):
    title: str
    description: str
    due_date: str
    group_id: Optional[str] = None  # If None, for all students
    student_ids: Optional[List[str]] = None  # Specific students

class Homework(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    description: str
    due_date: str
    group_id: Optional[str] = None
    student_ids: Optional[List[str]] = None
    created_by: str
    created_by_role: str  # "admin" or "sheikh"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class HomeworkSubmission(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    homework_id: str
    student_id: str
    status: str = "pending"  # "pending", "submitted", "graded"
    submission_notes: Optional[str] = None
    # حقول رفع الملفات
    file_url: Optional[str] = None  # رابط الملف المرفوع
    file_name: Optional[str] = None  # اسم الملف
    file_type: Optional[str] = None  # نوع الملف (image, pdf, etc.)
    file_base64: Optional[str] = None  # الملف بصيغة base64
    grade: Optional[int] = None
    feedback: Optional[str] = None
    submitted_at: Optional[datetime] = None
    graded_at: Optional[datetime] = None
    graded_by: Optional[str] = None

# ============== ADMINISTRATIVE EXAMS (مفاصل إدارية) ==============

class AdminExamCreate(BaseModel):
    student_id: str
    exam_type: str  # "quran" (مفصل قرآن), "tajweed" (تجويد)
    juz_numbers: Optional[List[int]] = None  # أرقام الأجزاء (متعددة)
    surah_name: Optional[str] = None
    page_from: Optional[int] = None
    page_to: Optional[int] = None
    # Results - التقييم من 100
    # كل تنبيه = -0.5، كل خطأ = -2، كل خطأ تجويد = -0.5
    warning_count: int = 0  # عدد التنبيهات (-0.5 لكل تنبيه)
    error_count: int = 0  # عدد الأخطاء (-2 لكل خطأ)
    tajweed_errors: int = 0  # أخطاء التجويد (-0.5 لكل خطأ)
    pronunciation_errors: int = 0  # أخطاء النطق (للتوافق)
    memorization_errors: int = 0  # أخطاء الحفظ (للتوافق)
    result: str = "pending"  # "pass" (ناجح), "fail" (راسب), "pending"
    grade: Optional[float] = None  # 0-100 (يحسب تلقائياً)
    notes: Optional[str] = None
    # Legacy field
    juz_number: Optional[int] = None

class AdminExam(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    student_id: str
    exam_type: str
    juz_numbers: Optional[List[int]] = None  # أرقام الأجزاء (متعددة)
    juz_number: Optional[int] = None  # Legacy
    surah_name: Optional[str] = None
    page_from: Optional[int] = None
    page_to: Optional[int] = None
    # Results
    warning_count: int = 0
    error_count: int = 0
    tajweed_errors: int = 0
    pronunciation_errors: int = 0
    memorization_errors: int = 0
    result: str = "pending"
    grade: Optional[float] = None
    notes: Optional[str] = None
    examiner_id: str  # Sheikh or Admin who conducted exam
    exam_date: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# ============== TAJWEED EXAMS ==============

class TajweedExamCreate(BaseModel):
    student_id: str
    topic: str  # موضوع الامتحان (أحكام النون الساكنة، المدود، etc.)
    questions_count: int = 10
    correct_answers: int = 0
    practical_score: int = 0  # الاختبار العملي (0-100)
    theoretical_score: int = 0  # الاختبار النظري (0-100)
    result: str = "pending"  # "pass", "fail", "pending"
    notes: Optional[str] = None

class TajweedExam(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    student_id: str
    topic: str
    questions_count: int = 10
    correct_answers: int = 0
    practical_score: int = 0
    theoretical_score: int = 0
    final_score: int = 0
    result: str = "pending"
    notes: Optional[str] = None
    examiner_id: str
    exam_date: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# Quran Juz names for reference
QURAN_JUZ = [
    "الجزء الأول", "الجزء الثاني", "الجزء الثالث", "الجزء الرابع", "الجزء الخامس",
    "الجزء السادس", "الجزء السابع", "الجزء الثامن", "الجزء التاسع", "الجزء العاشر",
    "الجزء الحادي عشر", "الجزء الثاني عشر", "الجزء الثالث عشر", "الجزء الرابع عشر", "الجزء الخامس عشر",
    "الجزء السادس عشر", "الجزء السابع عشر", "الجزء الثامن عشر", "الجزء التاسع عشر", "الجزء العشرون",
    "الجزء الحادي والعشرون", "الجزء الثاني والعشرون", "الجزء الثالث والعشرون", "الجزء الرابع والعشرون", "الجزء الخامس والعشرون",
    "الجزء السادس والعشرون", "الجزء السابع والعشرون", "الجزء الثامن والعشرون", "الجزء التاسع والعشرون", "الجزء الثلاثون (جزء عم)"
]

# ============== ONLINE EXAMS (امتحانات إلكترونية) ==============

class ExamQuestion(BaseModel):
    """سؤال في الامتحان الإلكتروني"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    question_text: str  # نص السؤال
    options: List[str]  # الخيارات (4 خيارات)
    correct_answer: int  # فهرس الإجابة الصحيحة (0-3)
    points: int = 1  # نقاط السؤال

class OnlineExamCreate(BaseModel):
    """إنشاء امتحان إلكتروني جديد"""
    title: str  # عنوان الامتحان
    description: Optional[str] = None  # وصف الامتحان
    category: str = "general"  # تصنيف: quran, tajweed, general, islamic
    target_groups: List[str] = []  # المجموعات المستهدفة (فارغ = الكل)
    questions: List[ExamQuestion]  # أسئلة الامتحان
    duration_minutes: int = 30  # مدة الامتحان بالدقائق
    passing_score: int = 60  # درجة النجاح %
    start_date: Optional[str] = None  # تاريخ بداية الامتحان
    end_date: Optional[str] = None  # تاريخ نهاية الامتحان
    is_active: bool = True  # هل الامتحان فعال

class OnlineExam(BaseModel):
    """الامتحان الإلكتروني"""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    description: Optional[str] = None
    category: str = "general"
    target_groups: List[str] = []
    questions: List[dict]  # أسئلة الامتحان (بدون الإجابات الصحيحة للطالب)
    questions_with_answers: List[dict]  # أسئلة مع الإجابات (للمعلم)
    duration_minutes: int = 30
    passing_score: int = 60
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    is_active: bool = True
    total_points: int = 0
    created_by: str  # معرف المنشئ (شيخ/مدير)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ExamSubmissionCreate(BaseModel):
    """تقديم إجابات الامتحان"""
    exam_id: str
    answers: List[int]  # قائمة فهارس الإجابات المختارة

class ExamSubmission(BaseModel):
    """نتيجة تقديم الامتحان"""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    exam_id: str
    student_id: str
    answers: List[int]
    correct_count: int = 0
    total_questions: int = 0
    score: int = 0  # النسبة المئوية
    points_earned: int = 0
    passed: bool = False
    time_taken_minutes: int = 0
    submitted_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
