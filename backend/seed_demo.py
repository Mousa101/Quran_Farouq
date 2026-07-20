"""Seed a full demo: admin + teacher (sheikh) + group + 4 students (activated, linked)."""
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from pymongo import MongoClient
from passlib.context import CryptContext

load_dotenv(Path(__file__).parent / ".env")
pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")
client = MongoClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]

now = datetime.now(timezone.utc).isoformat()


def base_user(email, password, name, role):
    return {
        "id": str(uuid.uuid4()),
        "email": email,
        "name": name,
        "role": role,
        "password_hash": pwd.hash(password),
        "is_active": True,
        "is_activated": True,
        "created_at": now,
        "registration_date": now,
        "points": 0,
    }


# --- Admin ---
admin = base_user("admin@faruq.com", "admin123", "مدير النظام", "admin")
db.users.update_one({"email": admin["email"]}, {"$set": admin}, upsert=True)
admin = db.users.find_one({"email": admin["email"]})

# --- Teacher (sheikh) ---
teacher = base_user("teacher@faruq.com", "teacher123", "المشرف عبد الله", "sheikh")
teacher["mosque_name"] = "مسجد الفالوجة"
db.users.update_one({"email": teacher["email"]}, {"$set": teacher}, upsert=True)
teacher = db.users.find_one({"email": teacher["email"]})

# --- Group owned by the teacher ---
group = db.groups.find_one({"sheikh_id": teacher["id"]})
if not group:
    group = {
        "id": str(uuid.uuid4()),
        "name": "حلقة الفاروق",
        "description": "حلقة تجريبية",
        "sheikh_id": teacher["id"],
        "created_at": now,
    }
    db.groups.insert_one(group)

# --- 4 students in that group ---
students = [
    ("student1@faruq.com", "student123", "أحمد محمد", "الصف السادس", "مسجد الفالوجة"),
    ("student2@faruq.com", "student123", "يوسف خالد", "الصف الثامن", "مسجد المغيرة (الاستقلال)"),
    ("student3@faruq.com", "student123", "عمر سامي", "الصف الرابع", "مسجد صقر شنك"),
    ("student4@faruq.com", "student123", "زيد ناصر", "الصف العاشر", "مسجد السنجوقية"),
]
for email, pw, name, grade, mosque in students:
    doc = base_user(email, pw, name, "student")
    doc["group_id"] = group["id"]
    doc["school_grade"] = grade
    doc["mosque_name"] = mosque
    doc["initial_assessment_done"] = False
    db.users.update_one({"email": email}, {"$set": doc}, upsert=True)

print("Seed complete.")
print("  admin   -> admin@faruq.com   / admin123")
print("  teacher -> teacher@faruq.com / teacher123  (group: %s)" % group["name"])
for email, pw, name, grade, _ in students:
    print("  student -> %-20s / %s   (%s, %s)" % (email, pw, name, grade))
print("Users in DB:", db.users.count_documents({}))
client.close()
