"""بيانات تجريبية لتجربة الإضافات الجديدة (محليًا فقط).

ينشئ (أو يحدّث إن وُجد):
  1) مجموعة «مجموعة النور (تجريبية)» بمشرفين: المشرف عبد الله (رئيسي) + «المشرف المساعد التجريبي»
  2) 5 طلاب تجريبيين demo1..demo5@faruq.com (كلمة المرور student123)
     — demo1 «مساعد المشرف» بصلاحيتَي الحضور والتسميع
  3) حضور وتسميع (جديد + مراجعة) لليوم سجّلها الطالب المساعد عبر الـ API
  4) ورقة متابعة لثلاثة طلاب هذا الأسبوع + سجلّا تواصل مع الأهل
  5) فصل مغلق تجريبي (لتجربة الحذف النهائي) + مستند تجريبي (لتجربة البحث)

التشغيل: الخادم يعمل على :8001 ثم
  .venv/Scripts/python.exe seed_features_demo.py
"""
import json
import os
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

from dotenv import load_dotenv
from passlib.context import CryptContext
from pymongo import MongoClient

load_dotenv(Path(__file__).parent / ".env")
pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")
db = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
API = os.environ.get("SEED_API", "http://127.0.0.1:8001/api")
now = datetime.now(timezone.utc)
jo_today = (now + timedelta(hours=3)).date()
week_start = (jo_today - timedelta(days=(jo_today.weekday() + 2) % 7)).isoformat()


def call(method, path, body=None, token=None):
    req = urllib.request.Request(API + path, method=method,
                                 data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json",
                                          **({"Authorization": "Bearer " + token} if token else {})})
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read() or b"null")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"null")


def upsert_user(email, name, role, password, **extra):
    doc = {"email": email, "name": name, "role": role, "password_hash": pwd.hash(password),
           "is_active": True, "is_activated": True, "registration_date": now.isoformat(), **extra}
    existing = db.users.find_one({"email": email}, {"_id": 0, "id": 1})
    if existing:
        db.users.update_one({"email": email}, {"$set": doc})
        return existing["id"]
    doc.update(id=str(uuid.uuid4()), created_at=now.isoformat(), points=0)
    db.users.insert_one(doc)
    return doc["id"]


def login(email, password):
    st, r = call("POST", "/auth/login", {"email": email, "password": password})
    assert st == 200, f"login {email}: {st} {r}"
    return r.get("access_token") or r.get("token")


teacher = db.users.find_one({"email": "teacher@faruq.com"}, {"_id": 0, "id": 1})
assert teacher, "شغّل seed_demo.py أولًا (لا يوجد teacher@faruq.com)"
sheikh2 = upsert_user("sheikh2@faruq.com", "المشرف المساعد التجريبي", "sheikh", "teacher123")

group = db.groups.find_one({"name": "مجموعة النور (تجريبية)"}, {"_id": 0, "id": 1})
gid = group["id"] if group else str(uuid.uuid4())
db.groups.update_one({"id": gid}, {"$set": {
    "id": gid, "name": "مجموعة النور (تجريبية)", "description": "بيانات تجريبية للإضافات الجديدة",
    "sheikh_id": teacher["id"], "sheikh_ids": [teacher["id"], sheikh2], "created_at": now.isoformat()}}, upsert=True)

names = ["حمزة التجريبي", "معاذ التجريبي", "أنس التجريبي", "سعد التجريبي", "طارق التجريبي"]
ids = []
for i, n in enumerate(names, 1):
    ids.append(upsert_user(f"demo{i}@faruq.com", n, "student", "student123", group_id=gid,
                           father_phone=f"079000000{i}", initial_assessment_done=True,
                           is_group_assistant=(i == 1),
                           assistant_permissions=["attendance", "recitations"] if i == 1 else []))
print("✓ المجموعة والطلاب:", len(ids))

# الحضور والتسميع — يسجّلها الطالب المساعد demo1 (تُنسب لمشرف المجموعة)
tok = login("demo1@faruq.com", "student123")
day = jo_today.isoformat()
for back in range(0, 7):
    d = (jo_today - timedelta(days=back)).isoformat()
    st, r = call("POST", "/attendance", {"student_id": ids[1], "date": d, "status": "present"}, tok)
    if st == 200:
        day = d
        break
print("✓ يوم التسجيل:", day)
statuses = ["present", "present", "absent", "present"]
for sid, stt in zip(ids[1:], statuses):
    call("POST", "/attendance", {"student_id": sid, "date": day, "status": stt}, tok)
recs = [
    (ids[1], dict(has_new_memorization=True, juz_number=30, page_from=582, page_to=583, passed_minimum=True,
                  has_review=True, review_pages=5, passed_review_minimum=True)),
    (ids[2], dict(has_new_memorization=True, juz_number=29, page_from=562, page_to=562, passed_minimum=True)),
    (ids[4], dict(has_review=True, review_pages=10, passed_review_minimum=False)),
]
for sid, extra in recs:
    st, r = call("POST", "/recitations", {"student_id": sid, "date": day, "recitation_type": "combined", **extra}, tok)
    print("  تسميع", st, (r or {}).get("detail", "ok") if st != 200 else "ok")
call("POST", "/recitations", {"student_id": ids[3], "date": day, "did_not_recite": True}, tok)
st, r = call("POST", "/attendance", {"student_id": ids[0], "date": day, "status": "present"}, tok)
print("✓ المساعد لا يسجّل لنفسه:", st)

# ورقة متابعة هذا الأسبوع لثلاثة طلاب
for sid in ids[:3]:
    db.tracking_sheets.update_one({"student_id": sid, "week_start": week_start}, {"$set": {
        "id": str(uuid.uuid4()), "student_id": sid, "sheikh_id": teacher["id"], "week_start": week_start,
        "data": {"prayers_count": 30, "quran_sitting_days": 5}, "points_earned": 55,
        "submitted_by_student": True, "created_at": now.isoformat()}}, upsert=True)
print("✓ ورق المتابعة:", week_start)

# تواصل مع الأهل (عبر المدير)
atok = login("admin@faruq.com", "admin123")
call("POST", "/parent-contacts", {"student_id": ids[0], "contacted": True, "method": "اتصال",
                                  "notes": "تم إبلاغ ولي الأمر بتعيين ابنه مساعدًا للمشرف."}, atok)
call("POST", "/parent-contacts", {"student_id": ids[2], "contacted": False, "method": "واتساب",
                                  "notes": "لم يتم الرد — نعيد المحاولة."}, atok)
print("✓ ملف التواصل")

# فصل مغلق تجريبي + مستند تجريبي
if not db.terms.find_one({"name": "فصل تجريبي للحذف"}):
    db.terms.insert_one({"id": str(uuid.uuid4()), "name": "فصل تجريبي للحذف", "is_active": False,
                         "start_date": "2026-01-01T00:00:00+00:00", "end_date": "2026-03-01T00:00:00+00:00",
                         "created_by": "seed", "created_at": "2026-01-01T00:00:00+00:00"})
if not db.documents.find_one({"title": "مستند تجريبي — خطة الحلقات"}):
    db.documents.insert_one({"id": str(uuid.uuid4()), "title": "مستند تجريبي — خطة الحلقات",
                             "html": "<h1>خطة الحلقات</h1><p>مراجعة جزء عمّ يوم السبت مع مجموعة النور.</p>",
                             "filename": None, "size": 0, "created_by": "seed",
                             "created_at": now.isoformat(), "updated_at": now.isoformat()})
print("✓ فصل مغلق + مستند")

print("\nحسابات التجربة: demo1@faruq.com (مساعد المشرف) … demo5@faruq.com — كلمة المرور student123")
print("المشرف المساعد: sheikh2@faruq.com / teacher123")
