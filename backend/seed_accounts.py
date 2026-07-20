"""Seed three static accounts (admin / teacher / student) for local use."""
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

ACCOUNTS = [
    {"email": "admin@faruq.com", "password": "admin123", "name": "مدير النظام", "role": "admin"},
    {"email": "teacher@faruq.com", "password": "teacher123", "name": "المشرف المشرف", "role": "sheikh"},
    {"email": "student@faruq.com", "password": "student123", "name": "الطالب التجريبي", "role": "student"},
]

for acc in ACCOUNTS:
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": str(uuid.uuid4()),
        "email": acc["email"],
        "name": acc["name"],
        "role": acc["role"],
        "password_hash": pwd_context.hash(acc["password"]),
        "is_active": True,
        "is_activated": True,
        "created_at": now,
        "registration_date": now,
        "points": 0,
    }
    db.users.update_one(
        {"email": acc["email"]},
        {"$set": doc},
        upsert=True,
    )
    print(f"  seeded {acc['role']:8} -> {acc['email']} / {acc['password']}")

print("Done. Users in DB:", db.users.count_documents({}))
client.close()
