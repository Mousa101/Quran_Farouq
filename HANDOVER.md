# وثيقة التسليم — Quran Farouq (مركز الفاروق القرآني)

> اقرأ هذا الملف أول شي عند بدء محادثة جديدة لمتابعة العمل.
> آخر تحديث: 2026-07-25 — بعد commit `9a79892` + مراجعة كود شاملة + **دفعتَي تعديلات (7 + 7 بنود)** موثّقتين في `EDITS_SUMMARY.md`.
> **الجديد:** القسم 7 (حالة شجرة العمل) والقسم 8 (قائمة الإصلاحات حسب الأولوية — **لسّا كلها مفتوحة**).

> ℹ️ **تغييرات مهمة للمعمارية بعد الدفعات الثلاث:**
> - **بنود المتابعة صار إلها نطاقان:** حقل `is_global` — بند المدير بدون `sheikh_id` عام للجميع، وبند المشرف خاص بطلابه. `get_tracking_items_for_sheikh()` بترجّع الاتنين معًا.
> - **جدول الإحصائيات صار فيه `tracking_period`** (week/month/term) وأعمدة `tracking_prayers` و`tracking_sitting` و`last_sheet`.
> - **endpoint جديد:** `GET /tracking-sheets/last-per-student` — آخر ورقة لكل طالب بما فيهم اللي ما سلّموا.
> - **المحادثة صارت ثلاثية:** غرفة كل طالب فيها الطالب + مشرفه + **المدير (يكتب مش بس يقرأ)**، وزيادة محادثات ثنائية `kind: "admin_sheikh"`. علامات القراءة صارت `read_by_student/sheikh/admin`.
> - **الرسوم:** `fees_config` (مبلغ شهري افتراضي + توليد تلقائي) و`GET /admin/fees/overview` (جدول طالب × 12 شهر). الطالب الجديد بيتولّدله 12 شهر تلقائيًا.
> - **التعثّر:** `struggling_criteria` (4 مقاييس يضبطها المدير) و`/reports/struggling-students?category=&period=`.
> - ⚠️ **النقاط اليدوية صارت مبنية من سجلّها:** مجموعة `points_adjustments` (إضافة/خصم/تجميد) و`recompute_student_points` بيبني منها `manual_points` و`frozen_points`. **لا تعدّل هالحقول يدويًا في `student_points`** — أضف/احذف من `points_adjustments` وخلّي recompute يشتغل. `available_points = total_points − frozen_points`.
> - **سجل النقاط** `GET /points/ledger/{id}` مبني من الخام مباشرةً (مش من `points_transactions` اللي بينمسح عند الأرشفة).
> - **المدير صار يقدر يسجّل تسميع وحضور** — `POST /recitations` و`/attendance` و`/attendance/bulk` صاروا `["sheikh","admin"]`. المدير بيسجّل **نيابةً عن مشرف مجموعة الطالب** عبر `resolve_recording_sheikh_id()` — فلا تعتمد على أن `sheikh_id` في السجل = من ضغط الزر.
> - **نقل الطالب صار بثلاثة أوضاع** (`with_data` / `keep_old` / `fresh_start`). `fresh_start` بيأرشف ويصفّر عبر `archive_and_reset_student()`. الحقل القديم `move_data` لسّا مدعوم.
> - **بطاقتا لوحة المدير صارتا نِسَبًا مئوية** — `week_attendance_avg` و`week_pages_avg` **أُزيلا**؛ استخدم `week_attendance_rate` و`week_recitation_rate` و`week_groups`.
> - **مجموعات أرشيف جديدة:** `tracking_sheets_archives` (+ حقلا `archived_at` و`archive_reason` في كل مجموعات الأرشيف).

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

---

## 7) حالة شجرة العمل الحالية (غير مكوميت) ⚠️

آخر commit = `9a79892`. **كل الشغل الجديد لسّا غير مكوميت** — التعديلات اليدوية السابقة + دفعة الـ 7 بنود فوقها.

**الحالة:** الخادم يعدّي `py_compile`، والواجهة تُصرَّف بـ **`Compiled successfully` بدون تحذيرات**، و**35/35 اختبار E2E ناجح**.

**الملفات المعدّلة:**

| الملف | المحتوى |
|------|---------|
| `backend/server.py` | البنود 1، 3، 4، 6، 7 + تحسين endpoint الإنذارات + فهرس `admin_bonus_grants` + إصلاح N+1 في `dashboard-stats` |
| `frontend/src/pages/AdminDashboard.jsx` | تعديلات المستخدم اليدوية + قائمة الطلاب مع «إظهار المزيد» وأزرار التنزيل + عرض أداء المشرفين + شريط الوصول السريع |
| `frontend/src/pages/MyWarnings.jsx` | **ملف جديد** — تبويب إنذارات الطالب |
| `frontend/src/pages/SheikhManagement.jsx` | حوار «إضافة مشرف» + المسجد يدوي |
| `frontend/src/pages/TrackingSettings.jsx` | كرت إعدادات نقاط التميز |
| `frontend/src/pages/StudentManagement.jsx` | قراءة إعدادات التميز بدل 50 الثابتة |
| `frontend/src/pages/SheikhEditProfile.jsx`، `Register.jsx` | المسجد يدوي للمشرف |
| `frontend/src/pages/StudentDashboard.jsx`، `components/Sidebar.jsx`، `App.js` | ربط تبويب الإنذارات |
| `frontend/src/pages/FeesManagement.jsx`، `BulkOperations.jsx` | تعديلات المستخدم اليدوية (إعادة ترتيب + نصوص) |

**ملاحظتان بسيطتان باقيتان من التعديلات اليدوية:**
- `Sidebar.jsx`: أسطر فاضية ومسافات بادئة غير منتظمة في قائمة المدير — تجميلي.
- `AdminDashboard.jsx`: بطاقة «طلبات التسجيل» عنوان بلا رقم (`summary.total_points` معلّق عمدًا) — لو بدك رقم، استخدم `summary.pending_students`.

**تم إصلاحه:** حوار «تحميل Excel» رجع قابل للوصول عبر شريط الوصول السريع، ونص إشعار نقاط التميز أُعيدت صياغته (كان فيه مسافتان).

---

## 8) قائمة الإصلاحات حسب الأولوية (من مراجعة 2026-07-25)

### 🔴 أمان — عالي

1. **تفعيل الحساب قابل للتخمين (brute force) → تصعيد صلاحيات لمدير.**
   `POST /auth/register` (سطر 329) بيسمح للمستخدم يختار `role` بنفسه وضمنها `"admin"` (والواجهة `Register.jsx:47-51` بتعرض الخيار فعليًا). الحماية الوحيدة هي كود تفعيل **6 أرقام**. لكن `POST /auth/activate` (سطر 396):
   - ما فيه أي حدّ لعدد المحاولات ولا rate limiting ولا قفل للحساب،
   - وبيرجّع **توكن JWT جاهز** فورًا عند نجاح التفعيل.

   يعني: أي شخص من برّا بقدر يسجّل حساب `admin` ويجرّب مليون كود لحتى يفتح حساب مدير كامل.
   **الإصلاح:** عدّاد محاولات + قفل بعد ~5 محاولات، وrate limit على `/auth/activate` و`/auth/login`، وطوّل الكود (8+ خانات alphanumeric).

2. **كود التفعيل مولَّد بـ `random` مش `secrets`.** سطر 346-347: `random.randint` (Mersenne Twister — مو تشفيري).
   **الإصلاح:** `secrets.randbelow` أو `secrets.token_hex`.

3. **مفتاح JWT له قيمة افتراضية مكشوفة.** `backend/auth.py:9` — `os.environ.get("JWT_SECRET", "hafiz-quran-secret-key-2024")`. الريبو عام على GitHub؛ إذا الإنتاج ما ضابط `JWT_SECRET` بيقدر أي حدا يزوّر توكن مدير.
   **الإصلاح:** ارفع استثناء عند الإقلاع إذا `JWT_SECRET` مش مضبوط (بدون fallback).

4. **`get_current_user` ما بتتحقق من قاعدة البيانات.** `auth.py:47-50` بترجّع حمولة الـ JWT كما هي. يعني مستخدم محذوف أو دوره تغيّر بيضلّ شغّال لحدّ **24 ساعة**.
   **الإصلاح:** جيب المستخدم من `db.users` وتحقّق من `is_active`/`role` الحالي.

5. **`/auth/register-with-code` فيه باب «أول مدير».** سطر 226-227: إذا `admin_count == 0` بينعمل مدير بلا كود. لو انحذف آخر مدير، الباب بيفتح للعالم.
   **الإصلاح:** اربطه بمتغيّر بيئة `ALLOW_BOOTSTRAP_ADMIN` ينطفي بالإنتاج.

### 🟠 أمان — متوسط

6. **CORS مفتوح.** `server.py:8438-8444` — `allow_origins=os.environ.get('CORS_ORIGINS','*')` مع `allow_credentials=True`. التطبيق بيستخدم Bearer من sessionStorage (مش كوكيز) فالخطر محدود، بس لازم يتضبط `CORS_ORIGINS` بالإنتاج على الدومين بالضبط.

7. **تعداد المستخدمين (user enumeration).** `/auth/activate` بيفرّق بالردود: 404 «البريد غير مسجل» / 400 «مفعل بالفعل» / 400 «كود غير صحيح».
   **الإصلاح:** رسالة موحّدة.

8. **ما في حدّ أدنى لكلمة المرور.** `models.py:89` `password: str` بدون تحقّق. حسابات الديمو `admin123` تدلّ على الواقع.
   **الإصلاح:** `Field(min_length=8)` + منع كلمات المرور الشائعة.

9. **`users.email` بلا فهرس فريد (unique).** `DB_INDEXES["users"]` فيه `[("email", 1)]` عادي. فحص «الإيميل موجود» ثم `insert_one` مش عملية ذرّية → ممكن حسابين بنفس الإيميل تحت التزامن، و`find_one({"email": ...})` بالدخول بترجّع واحد عشوائي منهم.
   **الإصلاح:** `unique=True` على `email` + التقاط `DuplicateKeyError`.

### 🟡 جودة / صيانة

10. **`server.py` = 8448 سطر و193 endpoint بملف واحد.** أكبر عائق أمام أي تطوير. اقتراح: تقسيم لـ routers حسب المجال (`auth`, `students`, `recitations`, `tracking`, `fees`, `exams`, `chat`, `reports`) مع إبقاء نفس المسارات — تغيير ميكانيكي وآمن، بس لازم يصير على دفعة لحاله بدون تغييرات وظيفية معه.

11. **`except:` عارية (4 مواضع).** بتبلع حتى `KeyboardInterrupt`/`SystemExit`. بدّلها بـ `except ValueError:` أو `except Exception:` حسب السياق.

12. **`@app.on_event("startup")` مهجور** في FastAPI الحديث → بدّله بـ `lifespan` قبل ما يوصل FastAPI 1.0.

13. **`.gitignore` مبعثر:** 16 كتلة مكرّرة من `-e` + `# Environment files` + `*.env` (ناتجة عن `echo -e` متكرّر)، وأسطر صريحة لملفات `node_modules/.cache/*.pack`. القواعد شغّالة (تأكّدنا: **ما في ولا ملف حسّاس متتبَّع** — 167 ملف متتبَّع، الريبو 6.3 MB) بس الملف بدّه تنظيف.

14. **ما في اختبارات آلية تُشغَّل بسهولة** (مذكور بالقسم 5). أي إصلاح أمان من فوق لازم يجي معه اختبار يدوي موثّق على الأقل.

### ✅ اللي طلع سليم

- **تغطية الصلاحيات ممتازة:** من 193 endpoint، الوحيدة بلا `current_user` هي العامة فعلًا (`/health`, `/`, `/auth/*`, `/badges/available`).
- **ما في `to_list(None)`** — يعني ما في استعلامات بلا حدّ.
- **الفهارس شاملة** — 38 مجموعة مفهرسة بـ `DB_INDEXES`.
- **ما في أسرار متتبَّعة بـ git** (لا `.env` ولا `.venv` ولا `node_modules`).
- الملفات المعدّلة كلها بتعدّي `py_compile` و`esbuild` بدون أخطاء.
