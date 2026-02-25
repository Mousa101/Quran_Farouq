# حافظ - تطبيق تتبع حفظ القرآن
## Product Requirements Document

### المشكلة الأصلية
تطبيق لإدارة ومتابعة طلاب تحفيظ القرآن الكريم في المراكز القرآنية. يشمل نظام للطلاب، المعلمين (الشيوخ)، والمدراء.

### الميزات الأساسية

#### 1. إدارة المستخدمين
- تسجيل الطلاب والشيوخ والمدراء
- نظام أكواد التسجيل
- تفعيل الحسابات

#### 2. نظام التسميع
- تسجيل التسميع اليومي (حفظ جديد/مراجعة)
- تتبع الصفحات والأجزاء
- حساب نسبة التسميع
- جدول سجل التسميع (التاريخ | حفظ جديد | مراجعة | الحالة) ✅

#### 3. ورقة المتابعة الإيمانية (100 نقطة/أسبوع)
- تتبع الصلوات والأذكار
- الوتر والسنن وقيام الليل
- الصيام والجلوس مع القرآن

#### 4. نظام الحضور والغياب
- تسجيل الحضور اليومي
- حساب نسبة الحضور

#### 5. نظام النقاط والشارات
- نقاط الحضور (10 نقاط/يوم)
- نقاط التسميع (20 نقطة/تسميع)
- نقاط ورقة المتابعة (100 نقطة/أسبوع)
- شارات أسبوعية (العابد، الملتزم، الحافظ، المتفاعل)

#### 6. نظام إدارة الفصول الدراسية ✅
- إغلاق الفصل الحالي وأرشفة البيانات
- تصفير جميع نقاط الطلاب إلى 0
- بدء فصل جديد أو اختيار فصل سابق
- جدول الفصول الدراسية في لوحة التحكم
- `term_id` لعزل البيانات حسب الفصل

---

## ما تم تنفيذه

### الجلسة الحالية (25 فبراير 2026 - التحديثات الهيكلية)

#### P0 - تم الإنجاز:
1. **نظام إعادة تعيين الفصول (Term-Based Reset):**
   - `POST /api/admin/terms/reset` - إعادة تعيين الفصل (المدير فقط)
   - إضافة `term_id` للجداول: attendance, recitations, tracking_sheets
   - البيانات القديمة تبقى محفوظة ويمكن الاستعلام عنها
   - فهارس لتحسين الأداء

2. **هيكل سجل التسميع (Tasmee History):**
   - حقول جديدة: `new_pages`, `review_pages`, `record_date`, `term_id`
   - `GET /api/students/{id}/tasmee-history` - جلب سجل التسميع
   - جدول في صفحة الطالب: التاريخ | حفظ جديد | مراجعة | الحالة

3. **صلاحيات الشارات (Badge RBAC):**
   - المدير: ينشئ أنواع الشارات فقط (`POST /api/badges/types`)
   - الشيخ: يعين/يزيل الشارات (`POST /api/badges/assign`, `DELETE /api/badges/remove`)
   - المدير لا يستطيع تعيين شارات (403)

4. **صلاحيات تعديل الطالب للشيخ:**
   - `PUT /api/sheikh/students/{id}` - الشيخ فقط
   - جدول `audit_logs` لتتبع التغييرات
   - `GET /api/audit-logs` - المدير فقط

5. **إصلاح حساب الصفحات:**
   - 1 جزء = 20 صفحة (ثابت `PAGES_PER_JUZ`)
   - إجمالي القرآن = 600 صفحة (ثابت `TOTAL_QURAN_PAGES`)
   - دالة مساعدة `calculate_pages_from_juz()`

#### P1 - تم سابقاً:
- جدول إحصائيات الطالب
- نظام إغلاق الفصل في واجهة المدير

---

## Backlog (المهام المتبقية)

### P1 - الأولوية العالية:
1. نظام إدارة الرسوم المالية

### P2 - الأولوية المتوسطة:
1. نظام رفع ملفات الواجبات
2. تحسين تجربة المستخدم في الهاتف

---

## البنية التقنية

### Backend
- FastAPI + Motor (Async MongoDB)
- JWT Authentication
- Pydantic Models
- RBAC (Role-Based Access Control)

### Frontend
- React + Tailwind CSS
- Shadcn/UI Components
- Axios للطلبات

### Database Collections
- `users` - المستخدمين
- `groups` - المجموعات
- `tracking_sheets` - ورق المتابعة (+ term_id)
- `recitations` - التسميعات (+ term_id, record_date, new_pages, review_pages)
- `attendance` - الحضور (+ term_id)
- `terms` - الفصول الدراسية
- `term_archives` - أرشيف الفصول
- `student_points` - نقاط الطلاب
- `badge_types` - أنواع الشارات
- `weekly_badges` - شارات الطلاب
- `audit_logs` - سجلات التدقيق

### Database Indexes
- `attendance.term_id`
- `recitations.term_id`
- `recitations.student_id, record_date`
- `tracking_sheets.term_id`
- `audit_logs.target_student_id, timestamp`
- `badge_types.id` (unique)

---

## ملفات مرجعية مهمة
- `/app/backend/server.py` - الخادم الرئيسي
- `/app/backend/models.py` - النماذج (+ AuditLog, SheikhUpdateStudent, BadgeAssign/Remove)
- `/app/frontend/src/pages/AdminDashboard.jsx` - لوحة تحكم المدير
- `/app/frontend/src/pages/StudentDashboard.jsx` - لوحة تحكم الطالب (+ جدول سجل التسميع)
- `/app/frontend/src/pages/RecitationsNew.jsx` - صفحة التسميع

---

## نتائج الاختبار
- **تاريخ آخر اختبار:** 25 فبراير 2026
- **Backend:** 100% (28/28 اختبار)
- **Frontend:** 100%
- **ملف التقرير:** `/app/test_reports/iteration_4.json`

### APIs الجديدة:
| API | الصلاحية | الوظيفة |
|-----|----------|---------|
| `POST /api/admin/terms/reset` | admin | إعادة تعيين الفصل |
| `POST /api/badges/types` | admin | إنشاء نوع شارة |
| `POST /api/badges/assign` | sheikh | تعيين شارة لطالب |
| `DELETE /api/badges/remove` | sheikh | إزالة شارة من طالب |
| `PUT /api/sheikh/students/{id}` | sheikh | تعديل بيانات الطالب |
| `GET /api/students/{id}/tasmee-history` | all | سجل التسميع |
| `GET /api/audit-logs` | admin | سجلات التدقيق |
