from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import Optional, List
from datetime import datetime, timezone
import uuid

# User Models - Updated with new fields
class UserBase(BaseModel):
    email: EmailStr
    name: str
    role: str = Field(..., pattern="^(student|sheikh|admin)$")

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
    is_active: bool = True
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
    student_phone: Optional[str] = None
    father_phone: Optional[str] = None
    mother_phone: Optional[str] = None
    mosque_name: Optional[str] = None
    school_name: Optional[str] = None
    school_grade: Optional[str] = None
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

# Tracking Sheet Models
class TrackingSheetData(BaseModel):
    prayers_count: int = 0
    quran_sitting_minutes: int = 0
    family_recitation_count: int = 0
    notes: Optional[str] = None

class TrackingSheetCreate(BaseModel):
    student_id: str
    week_start: str
    image_base64: str

class TrackingSheet(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    student_id: str
    sheikh_id: str
    week_start: str
    image_url: Optional[str] = None
    data: TrackingSheetData
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# NEW Recitation Models - Updated with ranges and ratings
class RecitationCreate(BaseModel):
    student_id: str
    recitation_type: str  # "new_memorization" or "review"
    # For new memorization - with range
    juz_number: Optional[int] = None  # رقم الجزء (1-30)
    page_from: Optional[int] = None  # من صفحة
    page_to: Optional[int] = None  # إلى صفحة
    rating: Optional[int] = None  # تقييم من 10
    error_count: Optional[int] = None  # عدد الأخطاء
    passed_minimum: bool = False  # اجتاز الحد الأدنى
    # For review - combined juz and pages
    review_juz: Optional[List[int]] = None  # أرقام الأجزاء المراجعة كاملة
    partial_review_juz: Optional[int] = None  # جزء المراجعة الجزئية
    partial_review_pages: Optional[int] = None  # عدد صفحات المراجعة الجزئية
    passed_review_minimum: bool = False  # اجتاز الحد الأدنى للمراجعة
    notes: Optional[str] = None
    # Legacy fields (for backward compatibility)
    pages_count: Optional[int] = None
    review_type: Optional[str] = None
    review_pages: Optional[int] = None

class Recitation(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    student_id: str
    sheikh_id: str
    recitation_type: str
    # New memorization fields
    juz_number: Optional[int] = None
    page_from: Optional[int] = None
    page_to: Optional[int] = None
    rating: Optional[int] = None
    error_count: Optional[int] = None
    passed_minimum: bool = False
    # Review fields
    review_juz: Optional[List[int]] = None
    partial_review_juz: Optional[int] = None
    partial_review_pages: Optional[int] = None
    passed_review_minimum: bool = False
    notes: Optional[str] = None
    points_earned: int = 0
    # Legacy fields
    pages_count: Optional[int] = None
    review_type: Optional[str] = None
    review_pages: Optional[int] = None
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
    date: str
    status: str
    excuse_reason: Optional[str] = None  # سبب العذر
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# Student Self Update Model
class StudentSelfUpdate(BaseModel):
    student_phone: Optional[str] = None
    profile_image: Optional[str] = None
    registration_date: Optional[str] = None
    school_name: Optional[str] = None
    school_grade: Optional[str] = None
    school_average: Optional[str] = None  # معدل الطالب

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

# Points & Badges System
class Badge(BaseModel):
    id: str
    name: str
    description: str
    icon: str
    points_required: int
    category: str  # attendance, recitation, tracking, special

class StudentPoints(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    student_id: str
    total_points: int = 0
    attendance_points: int = 0
    recitation_points: int = 0
    tracking_points: int = 0
    badges: List[str] = []  # List of badge IDs
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

# Quran Juz names for reference
QURAN_JUZ = [
    "الجزء الأول", "الجزء الثاني", "الجزء الثالث", "الجزء الرابع", "الجزء الخامس",
    "الجزء السادس", "الجزء السابع", "الجزء الثامن", "الجزء التاسع", "الجزء العاشر",
    "الجزء الحادي عشر", "الجزء الثاني عشر", "الجزء الثالث عشر", "الجزء الرابع عشر", "الجزء الخامس عشر",
    "الجزء السادس عشر", "الجزء السابع عشر", "الجزء الثامن عشر", "الجزء التاسع عشر", "الجزء العشرون",
    "الجزء الحادي والعشرون", "الجزء الثاني والعشرون", "الجزء الثالث والعشرون", "الجزء الرابع والعشرون", "الجزء الخامس والعشرون",
    "الجزء السادس والعشرون", "الجزء السابع والعشرون", "الجزء الثامن والعشرون", "الجزء التاسع والعشرون", "الجزء الثلاثون (جزء عم)"
]
