import {
  LayoutDashboard, Users, Trophy, Calendar, Bell, BookOpen, UserCheck, FileText, UsersRound, Star,
  GraduationCap, ClipboardList, UserCog, UserPlus, BookMarked, CalendarDays, TrendingUp, DollarSign,
  BookText, Award, Settings, BarChart3, AlertTriangle, Shield, Table2, Megaphone, MessageSquare,
  BookUser, SlidersHorizontal, FolderOpen,
} from 'lucide-react';

// روابط القائمة الجانبية لكل دور. المدير يتحكم في إظهار روابط المشرف والطالب
// من صفحة «إعدادات العرض» (الرئيسية لا تُخفى).
export const NAV_ITEMS = {
  admin: [
    { to: '/dashboard', icon: LayoutDashboard, label: 'الرئيسية' },
    { to: '/sheikh-management', icon: BookUser, label: 'إدارة المشرفين' },
    { to: '/student-management', icon: GraduationCap, label: 'إدارة الطلاب' },
    { to: '/group-management', icon: UsersRound, label: 'إدارة المجموعات' },
    { to: '/pending-students', icon: UserPlus, label: 'طلبات التسجيل' },
    { to: '/attendance', icon: UserCheck, label: 'تسجيل الحضور' },
    { to: '/recitations', icon: BookOpen, label: 'تسجيل التسميع' },
    { to: '/statistics', icon: Table2, label: 'إحصائيات الطلاب' },
    { to: '/points-manager', icon: Star, label: 'إدارة النقاط' },
    { to: '/struggling-students', icon: AlertTriangle, label: 'الطلاب المتعثّرون' },
    { to: '/fees', icon: DollarSign, label: 'الرسوم المالية' },
    { to: '/homework', icon: BookText, label: 'الواجبات' },
    { to: '/exams', icon: Award, label: 'الاختبارات' },
    { to: '/curriculum', icon: BookMarked, label: 'إدارة المنهج' },
    { to: '/schedule', icon: CalendarDays, label: 'إدارة الجداول' },
    { to: '/tracking-settings', icon: Settings, label: 'إعدادات ورق المتابعة' },
    { to: '/announcements', icon: Megaphone, label: 'الإعلانات' },
    { to: '/activities', icon: Calendar, label: 'الأنشطة' },
    { to: '/users', icon: Users, label: 'المستخدمون' },
    { to: '/display-settings', icon: SlidersHorizontal, label: 'إعدادات العرض' },
    { to: '/audit-log', icon: Shield, label: 'سجل العمليات' },
    { to: '/chat-monitor', icon: MessageSquare, label: 'إدارة المحادثات' },
    { to: '/notifications', icon: Bell, label: 'الإشعارات' },
    { to: '/competitions', icon: Trophy, label: 'مرشّحو المسابقات' },
    { to: '/technical-supervision', icon: FolderOpen, label: 'ملف الإشراف الفني' },
  ],
  sheikh: [
    { to: '/dashboard', icon: LayoutDashboard, label: 'الرئيسية' },
    { to: '/groups', icon: UsersRound, label: 'مجموعاتي' },
    { to: '/initial-assessment', icon: ClipboardList, label: 'تقييم الطلاب الجدد' },
    { to: '/attendance', icon: UserCheck, label: 'الحضور' },
    { to: '/tracking', icon: FileText, label: 'ورق المتابعة' },
    { to: '/recitations', icon: BookOpen, label: 'التسميع' },
    { to: '/homework', icon: BookText, label: 'الواجبات' },
    { to: '/exams', icon: Award, label: 'الاختبارات' },
    { to: '/sheikh-rankings', icon: TrendingUp, label: 'ترتيب طلابي' },
    { to: '/sheikh-analytics', icon: BarChart3, label: 'تحليلاتي' },
    { to: '/sheikh-message', icon: MessageSquare, label: 'مراسلة الطلاب' },
    { to: '/student-stats', icon: Table2, label: 'إحصائيات الطلاب' },
    { to: '/points-manager', icon: Star, label: 'إدارة النقاط' },
    { to: '/struggling-students', icon: AlertTriangle, label: 'الطلاب المتعثّرون' },
    { to: '/tracking-settings', icon: Settings, label: 'إعدادات ورق المتابعة' },
    { to: '/curriculum', icon: BookMarked, label: 'عرض المنهج' },
    { to: '/schedule', icon: CalendarDays, label: 'الجدول الدراسي' },
    { to: '/sheikh-edit-profile', icon: UserCog, label: 'تعديل بياناتي' },
    { to: '/notifications', icon: Bell, label: 'الإشعارات' },
  ],
  student: [
    { to: '/dashboard', icon: LayoutDashboard, label: 'الرئيسية' },
    { to: '/my-progress', icon: Trophy, label: 'تقدّمي' },
    { to: '/my-points', icon: Star, label: 'نقاطي' },
    { to: '/student-tracking', icon: FileText, label: 'ورق المتابعة' },
    { to: '/my-warnings', icon: AlertTriangle, label: 'الإنذارات' },
    { to: '/fees', icon: DollarSign, label: 'المستحقات المالية' },
    { to: '/homework', icon: BookText, label: 'واجباتي' },
    { to: '/exams', icon: Award, label: 'اختباراتي' },
    { to: '/edit-profile', icon: UserCog, label: 'تعديل بياناتي' },
    { to: '/notifications', icon: Bell, label: 'الإشعارات' },
  ],
};

// الروابط المخفية للدور الحالي (من إعدادات المدير + الإشعارات عند إيقافها)
export const hiddenPathsFor = (role, uiSettings) => {
  if (!uiSettings || role === 'admin') return [];
  const hidden = [...(uiSettings.hidden_nav?.[role] || [])];
  if (uiSettings.notifications?.[role]?.enabled === false) hidden.push('/notifications');
  return hidden.filter((p) => p !== '/dashboard');
};

export const navItemsFor = (role, uiSettings) => {
  const items = NAV_ITEMS[role] || NAV_ITEMS.student;
  const hidden = hiddenPathsFor(role, uiSettings);
  return items.filter((i) => !hidden.includes(i.to));
};
