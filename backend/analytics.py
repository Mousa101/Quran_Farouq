"""F4 — طبقة تجميع بيانات التحليلات.

مصدر موحّد يحوّل البيانات الخام (الحضور، التسميع) إلى سلاسل زمنية أسبوعية جاهزة،
لتقرأ منها كل الرسوم البيانية بدل أن يحسب كلٌّ منها بطريقته (سبب ظهور الأرقام القديمة).
الأسبوع يبدأ يوم السبت (نفس اصطلاح بقية النظام).
"""
from datetime import datetime, timedelta


def week_start_of(date_str):
    """يرجع تاريخ بداية الأسبوع (السبت) بصيغة 'YYYY-MM-DD' لأي تاريخ نصّي، أو None إن كان غير صالح."""
    if not date_str:
        return None
    try:
        d = datetime.strptime(str(date_str)[:10], "%Y-%m-%d").date()
    except (ValueError, TypeError):
        return None
    # weekday(): الاثنين=0 ... الأحد=6، والسبت=5. عدد الأيام منذ آخر سبت:
    days_since_saturday = (d.weekday() - 5) % 7
    return (d - timedelta(days=days_since_saturday)).strftime("%Y-%m-%d")


async def build_center_timeseries(db, term_id=None, group_id=None, attendance_points=10, group_ids=None):
    """يبني سلسلة زمنية أسبوعية على مستوى المركز (أو مجموعة/فصل محدّد، أو مجموعات مشرف).

    group_ids: قائمة مجموعات (تُستخدم لحصر المشرف بمجموعاته). group_id: مجموعة واحدة.
    يرجع: {"weeks": [...], "totals": {...}}
    """
    # تحديد نطاق المجموعات: قائمة group_ids لها الأولوية، وإلا group_id المفرد
    scope_group_ids = None
    if group_ids is not None:
        scope_group_ids = list(group_ids)
    elif group_id:
        scope_group_ids = [group_id]

    # نحصر التسميع بطلاب هذه المجموعات (التسميع لا يحمل group_id، بخلاف الحضور)
    student_ids = None
    if scope_group_ids is not None:
        students = await db.users.find(
            {"group_id": {"$in": scope_group_ids}, "role": "student"}, {"_id": 0, "id": 1}
        ).to_list(5000)
        student_ids = [s["id"] for s in students]

    weeks = {}

    def bucket(ws):
        if ws not in weeks:
            weeks[ws] = {
                "week_start": ws,
                "attendance_present": 0,
                "attendance_total": 0,
                "recitations": 0,
                "new_pages": 0,
                "review_pages": 0,
                "points": 0,
            }
        return weeks[ws]

    # ---- الحضور ----
    att_query = {}
    if term_id:
        att_query["term_id"] = term_id
    if scope_group_ids is not None:
        att_query["group_id"] = {"$in": scope_group_ids}
    attendance = await db.attendance.find(
        att_query, {"_id": 0, "date": 1, "status": 1}
    ).to_list(50000)
    for a in attendance:
        ws = week_start_of(a.get("date"))
        if not ws:
            continue
        b = bucket(ws)
        b["attendance_total"] += 1
        if a.get("status") == "present":
            b["attendance_present"] += 1
            b["points"] += attendance_points

    # ---- التسميع ----
    rec_query = {"did_not_recite": {"$ne": True}}
    if term_id:
        rec_query["term_id"] = term_id
    if student_ids is not None:
        rec_query["student_id"] = {"$in": student_ids}
    recitations = await db.recitations.find(
        rec_query,
        {"_id": 0, "record_date": 1, "new_pages": 1, "review_pages": 1, "points_earned": 1},
    ).to_list(50000)
    for r in recitations:
        ws = week_start_of(r.get("record_date"))
        if not ws:
            continue
        b = bucket(ws)
        b["recitations"] += 1
        b["new_pages"] += r.get("new_pages", 0) or 0
        b["review_pages"] += r.get("review_pages", 0) or 0
        b["points"] += r.get("points_earned", 0) or 0

    ordered = [weeks[k] for k in sorted(weeks.keys())]
    totals = {
        "attendance_present": sum(w["attendance_present"] for w in ordered),
        "attendance_total": sum(w["attendance_total"] for w in ordered),
        "recitations": sum(w["recitations"] for w in ordered),
        "new_pages": sum(w["new_pages"] for w in ordered),
        "review_pages": sum(w["review_pages"] for w in ordered),
        "points": sum(w["points"] for w in ordered),
        "weeks_count": len(ordered),
    }
    return {"weeks": ordered, "totals": totals}
