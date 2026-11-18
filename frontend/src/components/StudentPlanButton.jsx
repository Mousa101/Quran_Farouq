import { useMemo, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';
import MemorizationPlanDialog from './MemorizationPlanDialog';
import { ClipboardList, Loader2, Pencil, Target, BookOpen } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const DIRECTION = { desc: 'تنازلي (من الناس إلى البقرة)', asc: 'تصاعدي (من البقرة إلى الناس)', custom: 'ترتيب مخصص' };

// أيقونة «خطة الطالب»: تعرض خطة الحفظ للطالب والمشرف والمدير (قراءة)،
// والمشرف/المدير يقدر يعدّلها مباشرة من نفس النافذة.
const StudentPlanButton = ({ student: studentProp, className = '', size = 'sm', label = 'خطة الطالب' }) => {
  const { user } = useAuth();
  // كائن ثابت حتى لا تعيد نافذة التعديل تحميل الخطة مع كل رسم
  const student = useMemo(() => studentProp, [studentProp?.id, studentProp?.name]);
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [plan, setPlan] = useState(null);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const canEdit = user?.role === 'admin' || user?.role === 'sheikh';

  const load = async () => {
    if (!student?.id) return;
    setLoading(true);
    try {
      const [p, h] = await Promise.all([
        axios.get(`${API}/students/${student.id}/memorization-plan`).catch(() => ({ data: null })),
        axios.get(`${API}/students/${student.id}/hifz-status`).catch(() => ({ data: null })),
      ]);
      setPlan(p.data && p.data.student_id ? p.data : null);
      setStatus(h.data);
    } finally {
      setLoading(false);
    }
  };

  const show = () => { setOpen(true); load(); };
  const Row = ({ k, v }) => (
    <div className="flex justify-between gap-3 py-1.5 border-b border-slate-500/15 text-sm">
      <span className="text-slate-400">{k}</span><span className="font-medium text-right">{v}</span>
    </div>
  );

  return (
    <>
      <Button type="button" variant="outline" size={size} onClick={show} className={`gap-1 ${className}`} title="خطة الطالب" data-testid="student-plan-btn">
        <ClipboardList className="w-4 h-4 text-emerald-500" />{label}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><ClipboardList className="w-5 h-5 text-emerald-500" />خطة الطالب{student?.name ? ` — ${student.name}` : ''}</DialogTitle>
          </DialogHeader>
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-emerald-500" /></div>
          ) : !plan ? (
            <p className="text-center text-slate-400 py-6">لم تُحدَّد خطة حفظ لهذا الطالب بعد.</p>
          ) : (
            <div data-testid="student-plan-view">
              <Row k="مقدار الحفظ في كل تسميع" v={`${plan.pages_per_session || 1} صفحة`} />
              <Row k="ترتيب الأجزاء" v={DIRECTION[plan.direction] || plan.direction} />
              {plan.direction === 'custom' && plan.juz_order?.length > 0 && <Row k="الأجزاء بالترتيب" v={plan.juz_order.join(' ← ')} />}
              <Row k="المراجعة المقترحة" v={plan.review_pages ? `${plan.review_pages} صفحة` : '—'} />
              <Row k="الهدف" v={plan.target_pages ? `${plan.target_pages} صفحة${plan.target_date ? ` حتى ${plan.target_date}` : ''}` : '—'} />
              {plan.start_date && <Row k="بداية الخطة" v={plan.start_date} />}
              {plan.notes && <Row k="ملاحظات" v={plan.notes} />}
            </div>
          )}
          {status && (
            <div className="mt-2 space-y-1 text-sm">
              {status.current && (
                <p className="flex items-center gap-1"><BookOpen className="w-4 h-4 text-emerald-500" />
                  الجزء الحالي {status.current.juz}: {status.current.done}/{status.current.total} صفحة</p>
              )}
              {status.suggestion && <p className="text-slate-400">التسميع القادم: صفحة {status.suggestion.page_from} – {status.suggestion.page_to}</p>}
              {status.plan_status && (
                <p className={`flex items-center gap-1 ${status.plan_status.status === 'behind' ? 'text-red-400' : 'text-emerald-500'}`}>
                  <Target className="w-4 h-4" />{status.plan_status.label} ({status.plan_status.done}/{status.plan_status.target})
                </p>
              )}
            </div>
          )}
          <DialogFooter className="gap-2">
            {canEdit && (
              <Button onClick={() => { setOpen(false); setEditOpen(true); }} className="bg-emerald-600 hover:bg-emerald-700" data-testid="student-plan-edit">
                <Pencil className="w-4 h-4 ml-1" />{plan ? 'تعديل الخطة' : 'إنشاء خطة'}
              </Button>
            )}
            <Button variant="ghost" onClick={() => setOpen(false)}>إغلاق</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {canEdit && (
        <MemorizationPlanDialog student={student} open={editOpen} onOpenChange={setEditOpen} onSaved={show} />
      )}
    </>
  );
};

export default StudentPlanButton;
