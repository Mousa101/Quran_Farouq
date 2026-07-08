"""Seed sample group + students so the dashboards aren't empty.

Idempotent: safe to run multiple times. Run AFTER seed_accounts.py.
"""
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from pymongo import MongoClient
from passlib.context import CryptContext

load_dotenv(Path(__file__).parent / ".env")
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

client = MongoClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]


def now_iso():
    return datetime.now(timezone.utc).isoformat()


# --- 1. Find the teacher (sheikh) created by seed_accounts.py ---
teacher = db.users.find_one({"email": "teacher@faruq.com", "role": "sheikh"})
if not teacher:
    raise SystemExit("Teacher account not found. Run seed_accounts.py first.")
sheikh_id = teacher["id"]

# --- 2. Create (or reuse) a group owned by that teacher ---
GROUP_NAME = "مجموعة الفجر"
group = db.groups.find_one({"name": GROUP_NAME, "sheikh_id": sheikh_id})
if not group:
    group_id = str(uuid.uuid4())
    db.groups.insert_one({
        "id": group_id,
        "name": GROUP_NAME,
        "description": "مجموعة تجريبية لحفظ القرآن الكريم",
        "sheikh_id": sheikh_id,
        "created_at": now_iso(),
    })
    print(f"  created group '{GROUP_NAME}' -> {group_id}")
else:
    group_id = group["id"]
    print(f"  reused group '{GROUP_NAME}' -> {group_id}")

# --- 3. Sample students (all activated, attached to the group) ---
SAMPLE_STUDENTS = [
    {"email": "ahmad@faruq.com", "name": "أحمد محمد", "school_grade": "السادس", "points": 120},
    {"email": "yusuf@faruq.com", "name": "يوسف خالد", "school_grade": "الخامس", "points": 85},
    {"email": "omar@faruq.com", "name": "عمر علي", "school_grade": "السابع", "points": 60},
    {"email": "bilal@faruq.com", "name": "بلال سعيد", "school_grade": "الرابع", "points": 40},
]

for s in SAMPLE_STUDENTS:
    doc = {
        "id": str(uuid.uuid4()),
        "email": s["email"],
        "name": s["name"],
        "role": "student",
        "password_hash": pwd_context.hash("student123"),
        "is_active": True,
        "is_activated": True,
        "group_id": group_id,
        "school_grade": s["school_grade"],
        "school_name": "مدرسة الفاروق",
        "points": s["points"],
        "initial_assessment_done": False,
        "created_at": now_iso(),
        "registration_date": now_iso(),
    }
    db.users.update_one(
        {"email": s["email"]},
        {"$set": doc, "$setOnInsert": {}},
        upsert=True,
    )
    print(f"  student {s['email']} / student123  (group: {GROUP_NAME})")

# --- 4. Attach the original demo student to the same group too ---
db.users.update_one(
    {"email": "student@faruq.com", "role": "student"},
    {"$set": {"group_id": group_id}},
)
print("  attached student@faruq.com to the group")

print(f"\nDone. Groups: {db.groups.count_documents({})}, "
      f"Students: {db.users.count_documents({'role': 'student'})}")
client.close()
