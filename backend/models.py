from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import Optional, List
from datetime import datetime, timezone
import uuid

# User Models
class UserBase(BaseModel):
    email: EmailStr
    name: str
    role: str = Field(..., pattern="^(student|sheikh|admin)$")

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
    is_active: bool = True

class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    role: str
    group_id: Optional[str] = None

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

# Recitation Models
class RecitationCreate(BaseModel):
    student_id: str
    surah_name: str
    verses_from: int
    verses_to: int
    quality_score: int = Field(..., ge=1, le=10)
    mistakes_count: int = 0
    notes: Optional[str] = None

class Recitation(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    student_id: str
    sheikh_id: str
    surah_name: str
    verses_from: int
    verses_to: int
    quality_score: int
    mistakes_count: int
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# Attendance Models
class AttendanceCreate(BaseModel):
    student_id: str
    date: str
    status: str = Field(..., pattern="^(present|absent|excused)$")

class Attendance(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    student_id: str
    sheikh_id: str
    group_id: str
    date: str
    status: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

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
