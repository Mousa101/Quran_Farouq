// تسميات وألوان المهام والاجتماعات (صفحة المدير «المهام والاجتماعات» وصفحة المشرف «مهامي»)
export const TASK_STATUS = {
  todo: { label: 'لم تبدأ', cls: 'bg-slate-500/20 text-slate-400' },
  in_progress: { label: 'قيد التنفيذ', cls: 'bg-blue-500/20 text-blue-400' },
  done: { label: 'منجزة', cls: 'bg-emerald-500/20 text-emerald-400' },
};

export const TASK_PRIORITY = {
  high: { label: 'عالية', cls: 'bg-red-500/20 text-red-400' },
  normal: { label: 'عادية', cls: 'bg-amber-500/20 text-amber-400' },
  low: { label: 'منخفضة', cls: 'bg-slate-500/20 text-slate-400' },
};

export const MEETING_TYPE = {
  sheikhs: 'اجتماع المشرفين',
  management: 'اجتماع إداري',
  parents: 'أولياء الأمور',
  other: 'أخرى',
};

export const MEETING_STATUS = {
  scheduled: { label: 'مجدول', cls: 'bg-blue-500/20 text-blue-400' },
  held: { label: 'انعقد', cls: 'bg-emerald-500/20 text-emerald-400' },
  cancelled: { label: 'أُلغي', cls: 'bg-red-500/20 text-red-400' },
};
