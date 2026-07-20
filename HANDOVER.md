# وثيقة التسليم — Quran Farouq (مركز الفاروق القرآني)

> اقرأ هذا الملف أول شي عند بدء محادثة جديدة لمتابعة العمل.
> آخر تحديث: بعد commit `e96620e`.

---

## 1) نظرة عامة

تطبيق إدارة حلقات تحفيظ قرآن. ثلاثة أدوار: **مدير (admin)**، **مشرف (sheikh)**، **طالب (student)**.

- **Repo:** https://github.com/Mousa101/Quran_Farouq.git — الفرع `main` (كل الكومِتات مباشرة على main، بدون PRs).
- **الواجهة:** React (CRA + craco) في `frontend/` — RTL عربي، Tailwind، shadcn/ui، lucide icons، recharts، sonner (toasts).
- **الخادم:** FastAPI + MongoDB (motor) في `backend/server.py` (~8500 سطر، ملف واحد) + `backend/models.py`.
- **JSON بصيغة snake_case** (الواجهة تعتمد عليها — لا تحوّلها لـ camelCase).

> ⚠️ **مهم:** قيمة الدور الداخلية للمشرف تبقى `"sheikh"` في الكود وقاعدة البيانات. فقط **النص المعروض** بالعربي صار «مشرف» (كان «شيخ/معلم»). لا تغيّر `role == "sheikh"` أو `pattern="^(student|sheikh|admin)$"`.

---

## 2) التشغيل المحلي (خطوة بخطوة)

الجهاز **ما عليه MongoDB مثبّت** ولا Docker/WSL. نشغّل Mongo عبر `mongodb-memory-server` (بينزّل mongod حقيقي ويشغّله). كل شي مُجهّز مسبقًا (venv + node_modules + `.env` + بيانات).

**البيانات محفوظة في:**
`C:\Users\USER\AppData\Local\Temp\claude\C--Users-USER\f41a7e7c-640a-49d0-a78e-08626946e24d\scratchpad\mongo\data`
(مسار الجلسة القديمة — لا يتغيّر. الـ launcher `start-mongo.js` بنفس المجلد.)

**التشغيل (3 عمليات بالخلفية بالترتيب):**

```bash
# 1) MongoDB على المنفذ 27017 (انتظر "MONGO_READY")
cd "/c/Users/USER/AppData/Local/Temp/claude/C--Users-USER/f41a7e7c-640a-49d0-a78e-08626946e24d/scratchpad/mongo"
node start-mongo.js > mongo.log 2>&1 &

# 2) الخادم على :8001
cd "C:/Users/USER/Quran_Farouq/backend"
PYTHONIOENCODING=utf-8 PYTHONUTF8=1 ./.venv/Scripts/python.exe -m uvicorn server:app --host 0.0.0.0 --port 8001 > /tmp/backend.log 2>&1 &

# 3) الواجهة على :3000
cd "C:/Users/USER/Quran_Farouq/frontend"
BROWSER=none PORT=3000 npm start > /tmp/frontend.log 2>&1 &
```

- الترتيب مهم: Mongo أولًا. الخدمات الثلاث بالخلفية لا تعيش بين الجلسات — أعِد تشغيلها كل جلسة.
- **الواجهة:** http://localhost:3000

**تفاصيل بيئة مهمة (تعثّرت فيها سابقًا):**
- Python 3.14 + Node 24. venv في `backend/.venv`.
- **`bcrypt==4.0.1` مثبّت عمدًا** — الإصدارات الأحدث تكسر `passlib` (وتكسر تسجيل الدخول). لا ترفعه.
- `frontend/node_modules` مثبّتة بـ **`npm install --legacy-peer-deps`** (تعارض react-day-picker). إذا احتجت إعادة التثبيت استخدم نفس الفلاغ.
- عند تشغيل سكربتات Python فيها طباعة عربية استخدم `PYTHONUTF8=1` (console الويندوز cp1252 يكسر بدونها — لكن هذا لا يؤثر على عمليات قاعدة البيانات).
- الملفات `.env` (backend/frontend) موجودة ومتجاهلة في git (`.gitignore`) — فيها `MONGO_URL`, `DB_NAME`, `JWT_SECRET`, و`REACT_APP_BACKEND_URL=http://localhost:8001`.
- **فحص سريع بدون بناء كامل:** الواجهة تُفحَص بـ `npx esbuild@0.21.5 <file.jsx> --log-level=warning`؛ الخادم بـ `python -m py_compile server.py models.py`. (لا يوجد build كامل سريع.)

**حسابات الدخول (seed):**
| الدور | البريد | كلمة المرور |
|------|--------|-------------|
| مدير | admin@faruq.com | admin123 |
| مشرف | teacher@faruq.com | teacher123 |
| طالب 1–4 | student1..4@faruq.com | student123 |

- إعادة توليد الحسابات: `backend/.venv/Scripts/python.exe backend/seed_demo.py` (ينشئ مدير + مشرف + مجموعة «حلقة الفاروق» + 4 طلاب مربوطين).

---

## 3) خريطة معمارية سريعة

**Backend (`backend/server.py`):** 190+ endpoint تحت `/api`. نقاط مفتاحية:
- المصادقة: `auth.py` (JWT، `SECRET_KEY` له افتراضي)، `get_current_user`, `ensure_role(user, roles, detail)`.
- الفهارس: `_ensure_indexes` (startup) — `DB_INDEXES` dict. **أي مجموعة/حقل جديد يُستعلَم عليه: ضِف له فهرس هنا** (المشروع كان بلا فهارس = بطيء).
- النقاط: `recompute_student_points(student_id)` = المصدر الموثوق (يعيد البناء من الخام: حضور + تسميع + متابعة). استخدمه بعد أي تعديل يؤثر على النقاط بدل الزيادة اليدوية.
- الصفحات/الأجزاء: `pages_for_juz_list(juz)` (جزء عمّ=24، الباقي=20، المجموع 604). `student_memorized_prev_juz(student)` = اتحاد (السابق ∪ القوي ∪ الضعيف).
- التسميع→صفحات: `_new_pages_of(r)` (يشمل نوع `combined` وحقل `new_pages`).
- ورق المتابعة: ورقة واحدة لكل (student_id + week_start). `calculate_tracking_points` = صلوات(35) + جلوس(35) + بنود المعلم المخصّصة (`tracking_items`, لكل بند `icon`+`max_points`).
- الأسبوع يبدأ **السبت** (`get_current_week_start`).
- أيام الدوام/التسميع مقيّدة بأيام الجدول النشط: `ensure_lesson_day(date, label)` (يسمح بالكل إن لم تُضبط الأيام).

**Frontend:**
- `App.js`: كل المسارات + `Layout` (Sidebar + `<TopBar/>` + المحتوى + `<ChatWidget/>`) + `ProtectedRoute allow={[...]}`.
- `context/AuthContext.jsx`: التوكن في **sessionStorage** (جلسة مستقلة لكل تبويب) + localStorage للتذكّر. `?login=new` يبدأ جلسة نظيفة. متوفّر: `login, register, logout, openAnotherAccount`.
- `lib/constants.js`: `MOSQUES`, `MOSQUE_OTHER`, `SCHOOL_GRADES` (قوائم موحّدة).
- مكوّنات مشتركة: `StudentLink` (اسم الطالب قابل للنقر→`/student/:id`)، `TopBar` (اسم الحساب+جرس إشعارات)، `ChatWidget` (زر محادثة عائم للطالب/المشرف).

---

## 4) ما تم إنجازه (مسجّل بالتفصيل في `EDITS_SUMMARY.md`)

كل دفعة موثّقة في `EDITS_SUMMARY.md` (بالعربي). ملخّص أعلى مستوى:
- **دفعة 10 بنود:** حذف طلبات التسجيل، صفحات الجزء (604)، إزالة اختبار المفصّل + ربط القوي/الضعيف بالمحفوظ، توحيد الصف/المسجد (dropdowns)، ربط الجدول بأيام الدوام، إدخال نصّي للأخطاء والمتابعة، انعكاس التسميع، توحيد ورق المتابعة.
- **دفعة 2:** حسابات متعددة بتبويبات، تقييد القوي/الضعيف ضمن المحفوظ، إصلاح انعكاس التسميع في «تقدمي»، انعكاس بدء الفصل الجديد.
- **دفعة 3:** ربط ورق المتابعة معلم↔طالب (عرض جماعي)، `StudentLink`، دليل نقاط ديناميكي بالرموز، المدير يرى/يدير بنود المعلم، زر إظهار كلمة المرور.
- **الأداء:** فهارس عند الإقلاع + إصلاح N+1 في `/rankings/group` و`/rankings/weekly`.
- **تعديل البيانات:** المدير يعدّل كل بيانات الطلاب والمشرفين؛ المشرف يعدّل كل الطلاب (`PUT /students/{id}`, `PUT /admin/sheikhs/{id}`, `PUT /sheikh/students/{id}`) + حوارات تعديل في `StudentProfile` و`SheikhManagement`.
- **إحصائيات:** فلتر+عمود المعدّل (موحّد بـ `parse_average` ويُعرض بـ %)، وعمود «أيام الحضور» بدل النسبة.
- **دفعة الواجهة الأخيرة:** لوجو جديد بخلفية بيضاء + favicon + عنوان الصفحة، استبدال شيخ/معلم→مشرف، شريط علوي، محادثة طالب↔مشرف + صفحة مراقبة للمدير (`/chat-monitor`)، دمج الإحصائيات في `/statistics` (تبويبات)، بطاقات الرئيسية مربوطة بصفحاتها، بطاقتا الأسبوع صارتا «متوسط حضور/صفحات الأسبوع» + مدى التاريخ، إصلاح الشريط العلوي (صار in-flow بدل sticky overlay).

**نقاط نهاية المحادثة (chat):** `POST /chat/send`, `GET /chat/messages?student_id=`, `GET /chat/conversations`, `GET /chat/unread-count`. مجموعة `chat_messages`.

---

## 5) أمور معلّقة / اعرفها

- **الاختبار:** لا يوجد اختبار آلي شامل يُشغّل بسهولة. التحقق يتم بـ py_compile + esbuild + اختبار E2E يدوي عبر urllib + فحص بصري بالمتصفح. لا تدّعي أن شيئًا يعمل دون تجربته.
- **بيانات ديمو:** اسم المشرف في قاعدة البيانات الحالية قد يكون «الشيخ عبد الله» (قيمة بيانات قديمة). تشغيل `seed_demo.py` يصلحها لـ«المشرف عبد الله».
- **البنود الأساسية (صلوات 35 + جلوس 35) ثابتة** في `calculate_tracking_points`؛ فقط بنود المعلم الإضافية قابلة للتخصيص. المستخدم قد يطلب لاحقًا جعل الأساس قابلًا للتعديل.
- **اختبار المفصّل (ExamsManagement):** وحدة «امتحانات المفصّل» بقيت كما هي بطلب المستخدم (أُزيل فقط حقل `mufassal_test_juz` من التقييم).
- **الاستضافة الحيّة (Emergent):** كانت بطيئة — أُضيفت الفهارس لتحسين الأداء (الفهارس تُبنى تلقائيًا عند إقلاع الخادم على الإنتاج).
- **overlap الشريط العلوي على الموبايل:** ~1px فقط (طبيعي بسبب `pt-16`) — غير محسوس.

---

## 6) أعراف العمل

- **كل تعديل: نفّذ → افحص (py_compile/esbuild) → جرّب (E2E/متصفح) → وثّق في `EDITS_SUMMARY.md`.**
- لا ترفع أسرارًا: `.env`, `.venv`, `node_modules` متجاهلة. تحقّق قبل كل commit.
- لا تكوميت تغييرات `yarn.lock` الناتجة عن npm (مجرد نهايات أسطر — أرجعها بـ `git checkout -- frontend/yarn.lock`).
- رسائل الكومِت بالإنجليزي + سطر `Co-Authored-By`. الرفع مباشرة على `main`.
- المستخدم يكتب بالعامية الفلسطينية؛ الردود والواجهة بالعربي.
