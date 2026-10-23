// لكل نوع حساب رابط دخول وتسجيل مستقل (بلا أزرار اختيار في الصفحات):
// /admin/login · /teacher/login · /student/login  و  /admin/register · /teacher/register · /student/register
export const ROLE_SLUGS = { admin: 'admin', sheikh: 'teacher', student: 'student' };

const LAST_ROLE_KEY = 'last_login_role';

export const loginPathFor = (role) => `/${ROLE_SLUGS[role] || 'student'}/login`;
export const registerPathFor = (role) => `/${ROLE_SLUGS[role] || 'student'}/register`;

// نتذكّر دور آخر دخول لنعيد المستخدم إلى صفحة دخوله هو عند الخروج أو انتهاء الجلسة
export const rememberLoginRole = (role) => {
  try { localStorage.setItem(LAST_ROLE_KEY, role); } catch (e) { /* التخزين غير متاح */ }
};

export const lastLoginPath = () => {
  let role = null;
  try { role = localStorage.getItem(LAST_ROLE_KEY); } catch (e) { /* التخزين غير متاح */ }
  return loginPathFor(role);
};
