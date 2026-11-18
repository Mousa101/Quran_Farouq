// صلاحيات المدير المساعد (role = admin + is_assistant). المدير الرئيسي وباقي الأدوار لا تُقيَّد هنا.
// المفاتيح مطابقة لـ ASSISTANT_SECTIONS في backend/server.py — والخادم هو اللي بيفرض المنع فعليًا.

export const OWNER = 'owner'; // للمدير الرئيسي فقط

// المقطع الأول من مسار الصفحة → الصلاحية المطلوبة من المدير المساعد
export const ROUTE_PERMS = {
  'sheikh-management': 'sheikhs',
  'student-management': 'students',
  'pending-students': 'students',
  'bulk-operations': 'students',
  student: 'students',
  'student-record': 'students',
  'group-management': 'groups',
  'groups-overview': 'groups',
  'parent-contacts': 'students',
  attendance: 'attendance',
  recitations: 'recitations',
  'recitations-old': 'recitations',
  statistics: 'statistics',
  'student-stats': 'statistics',
  'admin-rankings': 'statistics',
  'admin-analytics': 'statistics',
  'points-manager': 'points',
  'struggling-students': 'struggling',
  fees: 'fees',
  homework: 'homework',
  exams: 'exams',
  'online-exams': 'exams',
  curriculum: 'curriculum',
  schedule: 'schedule',
  'tracking-settings': 'tracking',
  tracking: 'tracking',
  announcements: 'announcements',
  activities: 'activities',
  'audit-log': 'audit',
  'chat-monitor': 'chat',
  competitions: 'competitions',
  users: OWNER,
  'registration-codes': OWNER,
  'admin-accounts': OWNER,
  tasks: OWNER,
  meetings: OWNER,
  documents: OWNER,
  'display-settings': OWNER,
  'technical-supervision': OWNER,
};

export const isAssistant = (user) => user?.role === 'admin' && !!user?.is_assistant;

// هل يملك المستخدم هذه الصلاحية؟ (غير المدير المساعد: نعم دائمًا — دوره هو اللي بيحكم)
export const can = (user, perm) => {
  if (!isAssistant(user) || !perm) return true;
  if (perm === OWNER) return false;
  return (user.permissions || []).includes(perm);
};

export const canOpenRoute = (user, pathname) =>
  can(user, ROUTE_PERMS[(pathname || '').split('/')[1]]);
