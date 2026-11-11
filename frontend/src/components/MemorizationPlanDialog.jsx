import { useState, useEffect } from 'react';
import axios from 'axios';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { toast } from 'sonner';
import { ClipboardList, Loader2 } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const EMPTY = { direction: 'desc', juz_order: [], pages_per_session: 1, review_pages: 0, target_pages: '', target_date: '', start_date: '', notes: '' };

// خطة حفظ الطالب: مقدار كل تسميع، اتجاه الانتقال بين الأجزاء، الهدف وتاريخه، والمراجعة المقترحة
const MemorizationPlanDialog = ({ student, open, onOpenChange, onSaved }) => {
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exists, setExists] = useState(false);

  useEffect(() => {
    if (!open || !student) return;
    setLoading(true);
    axios.get(`${API}/students/${student.id}/memorization-plan`)
      .then((r) => {
        const p = r.data || {};
        setExists(!!p.student_id);
        setForm({
          direction: p.direction || 'desc',
          juz_order: p.juz_order || [],
          pages_per_session: p.pages_per_session || 1,
          review_pages: p.review_pages || 0,
          target_pages: p.target_pages || '',
          target_date: p.target_date || '',
          start_date: p.start_date || '',
          notes: p.notes || '',
        });
      })
      .catch(() => setForm(EMPTY))
      .finally(() => setLoading(false));
  }, [open, student]);

  const num = (v) => (v === '' || v === null ? null : parseInt(v, 10));

  // الترتيب المخصص: النقر يضيف الجزء لآخر القائمة أو يزيله، والأسهم تغيّر ترتيبه
  const toggleJuz = (j) => setForm((f) => ({
    ...f, juz_order: f.juz_order.includes(j) ? f.juz_order.filter((x) => x !== j) : [...f.juz_order, j],
  }));
  const moveJuz = (idx, delta) => setForm((f) => {
    const arr = [...f.juz_order];
    const to = idx + delta;
    if (to < 0 || to >= arr.length) return f;
    [arr[idx], arr[to]] = [arr[to], arr[idx]];
    return { ...f, juz_order: arr };
  });

  const save = async () => {
    if (form.direction === 'custom' && form.juz_order.length === 0) { toast.error('اختر الأجزاء التي سيحفظها الطالب'); return; }
    setSaving(true);
    try {
      await axios.put(`${API}/students/${student.id}/memorization-plan`, {
        direction: form.direction,
        juz_order: form.direction === 'custom' ? form.juz_order : [],
        pages_per_session: num(form.pages_per_session) || 1,
        review_pages: num(form.review_pages) || 0,
        target_pages: num(form.target_pages),
        target_date: form.target_date || null,
        start_date: form.start_date || null,
        notes: form.notes,
      });
      toast.success('تم حفظ خطة الحفظ');
      onOpenChange(false);
      onSaved?.();
    } catch (e) { toast.error(e.response?.data?.detail || 'فشل في حفظ الخطة'); } finally { setSaving(false); }
  };

  const field = 'bg-slate-800 border-slate-700 text-white';
  const reviewHint = (() => {
    const n = num(form.review_pages) || 0;
    if (!n) return 'بلا مراجعة مقترحة';
    const juz = Math.floor(n / 20);
    const rest = n % 20;
    return [juz ? `${juz} جزء كامل` : '', rest ? `${rest} صفحة` : ''].filter(Boolean).join(' + ') + ' في كل تسميع';
  })();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-900 border-slate-700 max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-emerald-400" />
            خطة حفظ {student?.name}
          </DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-emerald-400" /></div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-slate-300">الحفظ في كل تسميع (صفحات)</Label>
                <Input type="number" min="1" max="20" value={form.pages_per_session}
                  onChange={(e) => setForm({ ...form, pages_per_session: e.target.value })} className={field} />
              </div>
              <div className="space-y-1">
                <Label className="text-slate-300">ترتيب الأجزاء</Label>
                <select value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value })}
                  className="w-full h-10 rounded-md px-2 bg-slate-800 border border-slate-700 text-white text-sm">
                  <option value="desc">تنازلي: من جزء عمّ (30 ← 29 ← 28)</option>
                  <option value="asc">تصاعدي: من البقرة (1 → 2 → 3)</option>
                  <option value="custom">أجزاء مختارة بترتيب مخصص</option>
                </select>
              </div>
            </div>

            {form.direction === 'custom' && (
              <div className="p-3 rounded-lg bg-slate-800/50 border border-emerald-500/30 space-y-3">
                <p className="text-sm text-slate-300">اضغط الأجزاء بالترتيب الذي سيحفظها به الطالب:</p>
                <div className="grid grid-cols-10 gap-1">
                  {Array.from({ length: 30 }, (_, i) => i + 1).map((j) => {
                    const pos = form.juz_order.indexOf(j);
                    return (
                      <button key={j} type="button" onClick={() => toggleJuz(j)} title={pos >= 0 ? `الترتيب ${pos + 1} — اضغط للإزالة` : 'إضافة'}
                        className={`relative h-8 rounded text-sm ${pos >= 0 ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>
                        {j}
                        {pos >= 0 && <span className="absolute -top-1.5 -left-1 text-[10px] bg-amber-400 text-slate-900 rounded-full w-4 h-4 leading-4">{pos + 1}</span>}
                      </button>
                    );
                  })}
                </div>
                {form.juz_order.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="text-xs text-slate-400">الترتيب:</span>
                    {form.juz_order.map((j, i) => (
                      <span key={j} className="flex items-center gap-0.5 text-xs bg-emerald-500/20 text-emerald-200 rounded-full px-1">
                        <button type="button" aria-label="تقديم" onClick={() => moveJuz(i, -1)} disabled={i === 0} className="px-1 disabled:opacity-30">‹</button>
                        {i + 1}. الجزء {j}
                        <button type="button" aria-label="تأخير" onClick={() => moveJuz(i, 1)} disabled={i === form.juz_order.length - 1} className="px-1 disabled:opacity-30">›</button>
                      </span>
                    ))}
                  </div>
                ) : <p className="text-xs text-amber-300">لم تُختر أجزاء بعد</p>}
                <p className="text-xs text-slate-500">عند إتمام جزء ينتقل الاقتراح إلى أول جزء غير محفوظ في هذه القائمة.</p>
              </div>
            )}

            <div className="space-y-1">
              <Label className="text-slate-300">المراجعة في كل تسميع (صفحات — 20 = جزء)</Label>
              <Input type="number" min="0" max="200" value={form.review_pages}
                onChange={(e) => setForm({ ...form, review_pages: e.target.value })} className={field} />
              <p className="text-xs text-slate-500">{reviewHint} — يقترح النظام أقدم الأجزاء المحفوظة مراجعةً.</p>
            </div>

            <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700 space-y-3">
              <p className="text-sm text-slate-300 font-bold">الهدف (اختياري)</p>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <Label className="text-slate-400 text-xs">صفحات حفظ جديد</Label>
                  <Input type="number" min="1" placeholder="مثال: 60" value={form.target_pages}
                    onChange={(e) => setForm({ ...form, target_pages: e.target.value })} className={field} />
                </div>
                <div className="space-y-1">
                  <Label className="text-slate-400 text-xs">من تاريخ</Label>
                  <Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} className={field} />
                </div>
                <div className="space-y-1">
                  <Label className="text-slate-400 text-xs">حتى تاريخ</Label>
                  <Input type="date" value={form.target_date} onChange={(e) => setForm({ ...form, target_date: e.target.value })} className={field} />
                </div>
              </div>
              <p className="text-xs text-slate-500">مع الهدف والتاريخ يُظهر النظام إن كان الطالب متقدمًا أو متأخرًا عن خطته. بدون «من تاريخ» تبدأ الخطة من اليوم.</p>
            </div>

            <div className="space-y-1">
              <Label className="text-slate-300">ملاحظات الخطة</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={field}
                placeholder="مثال: التركيز على التثبيت قبل الانتقال" />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-slate-400">إلغاء</Button>
          <Button onClick={save} disabled={saving || loading} className="bg-emerald-500 hover:bg-emerald-600">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : (exists ? 'حفظ التعديلات' : 'إنشاء الخطة')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default MemorizationPlanDialog;
