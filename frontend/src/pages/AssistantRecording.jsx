import { useEffect, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Navigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { UserCog, Loader2, BookOpen, Check, X } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const today = () => new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 10);
const EMPTY_REC = { did_recite: true, has_new: true, juz_number: '', page_from: '', page_to: '', new_pages: '', passed_minimum: true,
  has_review: false, review_pages: '', passed_review_minimum: true, notes: '' };
const ATT = { present: 'حاضر', absent: 'غائب', excused: 'معذور' };

// صفحة «مساعد المشرف»: طالب عيّنه المشرف/المدير يسجّل الحضور و/أو التسميع لطلاب مجموعته.
// كل ما يسجّله يُنسب لمشرف المجموعة ويظهر عنده.
const AssistantRecording = () => {
  const { isDark } = useTheme();
  const [date, setDate] = useState(today());
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(null);
  const [recFor, setRecFor] = useState(null);
  const [rec, setRec] = useState(EMPTY_REC);
  const [saving, setSaving] = useState(false);

  const load = async (d = date) => {
    try {
      const r = await axios.get(`${API}/assistant/me`, { params: { date: d } });
      setData(r.data);
    } catch { setData({ enabled: false }); }
  };
  useEffect(() => { load(date); }, [date]); // eslint-disable-line

  if (data && !data.enabled) return <Navigate to="/dashboard" replace />;

  const canAtt = data?.permissions?.includes('attendance');
  const canRec = data?.permissions?.includes('recitations');
  const muted = isDark ? 'text-slate-400' : 'text-slate-500';
  const strong = isDark ? 'text-white' : 'text-slate-900';

  const mark = async (sid, status) => {
    setBusy(sid + status);
    try {
      await axios.post(`${API}/attendance`, { student_id: sid, date, status });
      await load();
    } catch (e) { toast.error(e.response?.data?.detail || 'فشل التسجيل'); }
    finally { setBusy(null); }
  };

  const num = (v) => (v === '' || v === null ? null : parseInt(v, 10));
  const saveRec = async () => {
    setSaving(true);
    try {
      const body = { student_id: recFor.id, date, recitation_type: 'combined', notes: rec.notes || null };
      if (!rec.did_recite) {
        Object.assign(body, { did_not_recite: true });
      } else {
        if (!rec.has_new && !rec.has_review) { toast.error('اختر الحفظ الجديد أو المراجعة'); setSaving(false); return; }
        Object.assign(body, {
          has_new_memorization: rec.has_new,
          juz_number: rec.has_new ? num(rec.juz_number) : null,
          page_from: rec.has_new ? num(rec.page_from) : null,
          page_to: rec.has_new ? num(rec.page_to) : null,
          new_pages: rec.has_new ? (num(rec.new_pages) || 0) : 0,
          passed_minimum: rec.has_new && rec.passed_minimum,
          has_review: rec.has_review,
          review_pages: rec.has_review ? (num(rec.review_pages) || 0) : 0,
          passed_review_minimum: rec.has_review && rec.passed_review_minimum,
        });
      }
      await axios.post(`${API}/recitations`, body);
      toast.success('تم تسجيل التسميع — يظهر عند المشرف');
      setRecFor(null);
      await load();
    } catch (e) { toast.error(e.response?.data?.detail || 'فشل تسجيل التسميع'); }
    finally { setSaving(false); }
  };

  const Toggle = ({ on, onClick, children }) => (
    <Button type="button" size="sm" variant={on ? 'default' : 'outline'} onClick={onClick} className={on ? 'bg-emerald-600 hover:bg-emerald-700' : ''}>{children}</Button>
  );

  return (
    <div className="space-y-4" dir="rtl" data-testid="assistant-page">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className={`text-2xl font-bold flex items-center gap-2 ${strong}`}><UserCog className="w-6 h-6 text-emerald-500" />مساعد المشرف</h1>
          <p className={`text-sm ${muted}`}>{data?.group?.name || ''} — ما تسجّله يُحفظ باسم مشرف المجموعة</p>
        </div>
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
      </div>

      {!data ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-emerald-500" /></div>
      ) : (
        <Card className={isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'}>
          <CardContent className="p-0 divide-y divide-slate-500/15">
            {data.students.map((s) => (
              <div key={s.id} className="p-3 flex flex-wrap items-center justify-between gap-2" data-testid={`assist-row-${s.id}`}>
                <div className="min-w-0">
                  <p className={`font-medium ${strong}`}>{s.name}{s.is_me && <span className={`text-xs mr-1 ${muted}`}>(أنت)</span>}</p>
                  <p className={`text-xs ${muted}`}>
                    الحضور: {s.attendance ? ATT[s.attendance] || s.attendance : 'لم يُسجَّل'} ·
                    {' '}التسميع: {!s.recitation_recorded ? 'لم يُسجَّل' : s.recited ? `سمّع (جديد ${s.new_pages} ص، مراجعة ${s.review_pages} ص)` : 'لم يسمّع'}
                  </p>
                </div>
                {!s.is_me && (
                  <div className="flex flex-wrap gap-1">
                    {canAtt && ['present', 'absent', 'excused'].map((st) => (
                      <Button key={st} size="sm" variant={s.attendance === st ? 'default' : 'outline'} disabled={!!busy}
                        onClick={() => mark(s.id, st)}
                        className={s.attendance === st ? (st === 'present' ? 'bg-emerald-600' : st === 'absent' ? 'bg-red-600' : 'bg-amber-600') : ''}
                        data-testid={`assist-${st}-${s.id}`}>
                        {busy === s.id + st ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : ATT[st]}
                      </Button>
                    ))}
                    {canRec && (
                      <Button size="sm" variant="outline" className="text-purple-500" onClick={() => { setRecFor(s); setRec(EMPTY_REC); }} data-testid={`assist-rec-${s.id}`}>
                        <BookOpen className="w-3.5 h-3.5 ml-1" />تسميع
                      </Button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Dialog open={!!recFor} onOpenChange={(o) => !o && setRecFor(null)}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader><DialogTitle>تسميع {recFor?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Toggle on={rec.did_recite} onClick={() => setRec({ ...rec, did_recite: true })}><Check className="w-4 h-4 ml-1" />سمّع</Toggle>
              <Toggle on={!rec.did_recite} onClick={() => setRec({ ...rec, did_recite: false })}><X className="w-4 h-4 ml-1" />لم يسمّع</Toggle>
            </div>
            {rec.did_recite && (
              <>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={rec.has_new} onChange={(e) => setRec({ ...rec, has_new: e.target.checked })} />حفظ جديد</label>
                {rec.has_new && (
                  <div className="grid grid-cols-3 gap-2">
                    <div><Label className="text-xs">الجزء</Label><Input type="number" min="1" max="30" value={rec.juz_number} onChange={(e) => setRec({ ...rec, juz_number: e.target.value })} /></div>
                    <div><Label className="text-xs">من صفحة</Label><Input type="number" value={rec.page_from} onChange={(e) => setRec({ ...rec, page_from: e.target.value })} /></div>
                    <div><Label className="text-xs">إلى صفحة</Label><Input type="number" value={rec.page_to} onChange={(e) => setRec({ ...rec, page_to: e.target.value })} /></div>
                    <label className="col-span-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={rec.passed_minimum} onChange={(e) => setRec({ ...rec, passed_minimum: e.target.checked })} />اجتاز الحفظ الجديد</label>
                  </div>
                )}
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={rec.has_review} onChange={(e) => setRec({ ...rec, has_review: e.target.checked })} />مراجعة</label>
                {rec.has_review && (
                  <div className="grid grid-cols-2 gap-2 items-end">
                    <div><Label className="text-xs">صفحات المراجعة</Label><Input type="number" value={rec.review_pages} onChange={(e) => setRec({ ...rec, review_pages: e.target.value })} /></div>
                    <label className="flex items-center gap-2 text-sm pb-2"><input type="checkbox" checked={rec.passed_review_minimum} onChange={(e) => setRec({ ...rec, passed_review_minimum: e.target.checked })} />اجتاز المراجعة</label>
                  </div>
                )}
              </>
            )}
            <div><Label className="text-xs">ملاحظات</Label><Input value={rec.notes} onChange={(e) => setRec({ ...rec, notes: e.target.value })} /></div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setRecFor(null)}>إلغاء</Button>
            <Button onClick={saveRec} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700" data-testid="assist-rec-save">
              {saving && <Loader2 className="w-4 h-4 ml-1 animate-spin" />}حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AssistantRecording;
