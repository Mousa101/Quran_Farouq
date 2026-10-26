import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { useTheme } from '../context/ThemeContext';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Trash2, Edit, Search, ArrowRight, Star, BookOpen, Link2, Loader2, UserPlus, CheckCircle } from 'lucide-react';
import StudentLink from '../components/StudentLink';
import { SCHOOL_GRADES } from '../lib/constants';
import { formatDate } from '../lib/utils';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const TAJWEED_LEVELS = ['تلاوة عامة', 'تمهيدية', 'متوسطة', 'متقدمة', 'إجازة', 'اتقان', 'سند غيبي', 'روايات أخرى'];

const KINDS = {
  young_hafiz: { label: 'ملف الحافظ الصغير', icon: Star, tone: 'bg-cyan-500/20 text-cyan-400' },
  tajweed: { label: 'ملف التلاوة والتجويد', icon: BookOpen, tone: 'bg-emerald-500/20 text-emerald-400' },
};

const emptyRecord = (kind, level = '') => ({
  kind, full_name: '', level, obtained_date: '', place: '', birth_date: '', school_grade: '',
  phone: '', juz_count: '', student_id: null, notes: '',
});

// سجلات الإشراف الفني لنوع واحد: الحافظ الصغير (مع قائمة المؤهَّلين) أو التلاوة والتجويد (حسب المستوى)
const SupervisionFile = ({ kind }) => {
  const { isDark } = useTheme();
  const meta = KINDS[kind];
  const [level, setLevel] = useState(null);          // التجويد: المستوى المفتوح
  const [tab, setTab] = useState('records');          // الحافظ الصغير: records | eligible
  const [rows, setRows] = useState([]);
  const [levelCounts, setLevelCounts] = useState({});
  const [eligible, setEligible] = useState({ rows: [], min_juz: 3, max_grade: 'الصف الخامس' });
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState(null);
  const [busy, setBusy] = useState(false);

  const card = isDark ? 'glass-card border border-white/10' : 'bg-white border border-slate-200 shadow-sm';
  const title = isDark ? 'text-white' : 'text-slate-900';
  const muted = isDark ? 'text-slate-400' : 'text-slate-600';
  const field = isDark ? 'bg-slate-800 border-slate-700 text-white' : '';
  const outline = isDark ? 'border-slate-700' : '';
  const isTajweed = kind === 'tajweed';
  const showList = !isTajweed || level;

  const load = async () => {
    try {
      if (isTajweed) {
        const sum = await axios.get(`${API}/supervision/summary`);
        setLevelCounts(Object.fromEntries(sum.data.tajweed_levels.map((l) => [l.level, l.count])));
      }
      if (showList) {
        const res = await axios.get(`${API}/supervision/records`, { params: { kind, level: level || undefined } });
        setRows(res.data);
      }
      if (!isTajweed) {
        const el = await axios.get(`${API}/supervision/young-hafiz/eligible`);
        setEligible(el.data);
      }
    } catch (e) {
      toast.error('تعذّر تحميل السجلات');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [kind, level]);

  const save = async () => {
    const d = dialog;
    if (!d.full_name.trim()) { toast.error('الاسم مطلوب'); return; }
    const body = { ...d, juz_count: d.juz_count === '' ? null : Number(d.juz_count) };
    delete body.id;
    setBusy(true);
    try {
      if (d.id) await axios.put(`${API}/supervision/records/${d.id}`, body);
      else await axios.post(`${API}/supervision/records`, body);
      toast.success(d.id ? 'تم تعديل السجل' : 'تمت إضافة السجل');
      setDialog(null);
      await load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'تعذّر الحفظ');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (r) => {
    try {
      await axios.delete(`${API}/supervision/records/${r.id}`);
      toast.success('تم حذف السجل');
      await load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'تعذّر الحذف');
    }
  };

  const editRow = (r) => setDialog({
    ...emptyRecord(kind), ...Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v ?? ''])),
    student_id: r.student_id || null,
  });

  const addFromEligible = (s) => {
    setDialog({
      ...emptyRecord(kind), full_name: s.name, student_id: s.student_id, school_grade: s.school_grade || '',
      birth_date: s.birth_date || '', phone: s.phone || '', juz_count: s.memorized_juz,
    });
  };

  const needle = search.trim();
  const shown = needle ? rows.filter((r) => r.full_name.includes(needle) || (r.place || '').includes(needle)) : rows;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn" data-testid={`supervision-${kind}-page`}>
      {/* الرأس */}
      <div className={`p-5 rounded-xl ${card}`}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${meta.tone}`}>
              <meta.icon className="w-6 h-6" />
            </div>
            <div>
              <h1 className={`text-lg md:text-xl font-bold ${title}`}>{meta.label}{level ? ` — ${level}` : ''}</h1>
              <p className={`text-sm ${muted}`}>
                {isTajweed
                  ? (level ? 'من حصل على هذا المستوى: الاسم الرباعي، تاريخ الحصول عليه ومكانه' : 'اختر المستوى لعرض من حصل عليه أو لإضافة سجل')
                  : `الشرط: حفظ ${eligible.min_juz} أجزاء على الأقل و${eligible.max_grade} فما دون`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {isTajweed && level ? (
              <Button variant="outline" onClick={() => { setSearch(''); setLevel(null); }} className={outline}>
                <ArrowRight className="w-4 h-4 ml-1" />كل المستويات
              </Button>
            ) : (
              <Link to="/technical-supervision">
                <Button variant="outline" className={outline}><ArrowRight className="w-4 h-4 ml-1" />ملف الإشراف الفني</Button>
              </Link>
            )}
            {showList && (
              <Button onClick={() => setDialog(emptyRecord(kind, level || ''))} className="bg-emerald-500 hover:bg-emerald-600" data-testid="add-record-btn">
                <Plus className="w-4 h-4 ml-1" />إضافة سجل
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* التجويد: بطاقات المستويات */}
      {isTajweed && !level && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {TAJWEED_LEVELS.map((lvl) => (
            <button key={lvl} type="button" onClick={() => setLevel(lvl)}
              className={`p-5 rounded-xl text-right transition-all hover:border-emerald-500/50 ${card}`}
              data-testid={`level-card-${lvl}`}>
              <BookOpen className="w-7 h-7 text-emerald-400" />
              <p className={`mt-3 font-bold ${title}`}>{lvl}</p>
              <p className={`text-sm ${muted}`}>{levelCounts[lvl] || 0} مسجَّل</p>
            </button>
          ))}
        </div>
      )}

      {/* الحافظ الصغير: تبويب السجل / المؤهَّلون */}
      {!isTajweed && (
        <div className="flex gap-2">
          <Button size="sm" variant={tab === 'records' ? 'default' : 'outline'} onClick={() => setTab('records')}
            className={tab === 'records' ? 'bg-cyan-600 hover:bg-cyan-700' : outline}>
            السجل ({rows.length})
          </Button>
          <Button size="sm" variant={tab === 'eligible' ? 'default' : 'outline'} onClick={() => setTab('eligible')}
            className={tab === 'eligible' ? 'bg-cyan-600 hover:bg-cyan-700' : outline}>
            المؤهَّلون من طلاب المركز ({eligible.rows.length})
          </Button>
        </div>
      )}

      {/* المؤهَّلون */}
      {!isTajweed && tab === 'eligible' && (
        <Card className={card}>
          <CardContent className="p-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className={`${muted} border-b ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
                  <th className="p-2 text-right">#</th>
                  <th className="p-2 text-right">الطالب</th>
                  <th className="p-2 text-right">المجموعة</th>
                  <th className="p-2 text-right">الصف</th>
                  <th className="p-2 text-center">المحفوظ (جزء)</th>
                  <th className="p-2" />
                </tr>
              </thead>
              <tbody>
                {eligible.rows.length === 0 && (
                  <tr><td colSpan={6} className={`text-center py-8 ${muted}`}>لا يوجد طلاب يحقّقون الشرط حاليًا</td></tr>
                )}
                {eligible.rows.map((s, i) => (
                  <tr key={s.student_id} className={`border-b ${isDark ? 'border-white/5' : 'border-slate-100'}`}>
                    <td className={`p-2 ${muted}`}>{i + 1}</td>
                    <td className={`p-2 font-medium ${title}`}><StudentLink studentId={s.student_id} name={s.name} className={title} /></td>
                    <td className={`p-2 ${muted}`}>{s.group_name || '—'}</td>
                    <td className={`p-2 ${muted}`}>{s.school_grade}</td>
                    <td className={`p-2 text-center font-bold ${title}`}>{s.memorized_juz}</td>
                    <td className="p-2 text-left">
                      {s.recorded ? (
                        <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30"><CheckCircle className="w-3 h-3 ml-1" />في السجل</Badge>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => addFromEligible(s)} className={outline}>
                          <UserPlus className="w-4 h-4 ml-1" />إضافة إلى السجل
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* السجلات */}
      {showList && (isTajweed || tab === 'records') && (
        <Card className={card}>
          <CardContent className="p-4 space-y-4">
            <div className="relative w-full sm:w-64">
              <Search className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث بالاسم أو المكان" className={`pr-8 ${field}`} />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className={`${muted} border-b ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
                    <th className="p-2 text-right">#</th>
                    <th className="p-2 text-right">الاسم الرباعي</th>
                    {!isTajweed && <th className="p-2 text-center">الأجزاء</th>}
                    {!isTajweed && <th className="p-2 text-right">المستوى</th>}
                    <th className="p-2 text-right">تاريخ الحصول</th>
                    <th className="p-2 text-right">المكان</th>
                    <th className="p-2 text-right">الصف</th>
                    <th className="p-2 text-right">الربط</th>
                    <th className="p-2 text-right">ملاحظات</th>
                    <th className="p-2" />
                  </tr>
                </thead>
                <tbody>
                  {shown.length === 0 && (
                    <tr><td colSpan={10} className={`text-center py-8 ${muted}`}>لا توجد سجلات</td></tr>
                  )}
                  {shown.map((r, i) => (
                    <tr key={r.id} className={`border-b ${isDark ? 'border-white/5' : 'border-slate-100'}`}>
                      <td className={`p-2 ${muted}`}>{i + 1}</td>
                      <td className={`p-2 font-medium ${title}`}>
                        {r.linked ? <StudentLink studentId={r.student_id} name={r.full_name} className={title} /> : r.full_name}
                      </td>
                      {!isTajweed && <td className={`p-2 text-center font-bold ${title}`}>{r.juz_count ?? '—'}</td>}
                      {!isTajweed && <td className={`p-2 ${title}`}>{r.level || '—'}</td>}
                      <td className={`p-2 ${muted}`}>{r.obtained_date ? formatDate(r.obtained_date) : '—'}</td>
                      <td className={`p-2 ${muted}`}>{r.place || '—'}</td>
                      <td className={`p-2 ${muted}`}>{r.school_grade || '—'}</td>
                      <td className="p-2">
                        {r.linked ? (
                          <span className="flex items-center gap-1 text-xs text-sky-400"><Link2 className="w-3 h-3" />{r.group_name || 'طالب في المركز'}</span>
                        ) : (
                          <span className={`text-xs ${muted}`}>من خارج المركز</span>
                        )}
                      </td>
                      <td className={`p-2 text-xs ${muted}`}>{r.notes || ''}</td>
                      <td className="p-2">
                        <div className="flex gap-1 justify-end">
                          <Button size="sm" variant="ghost" className="text-blue-400" title="تعديل" onClick={() => editRow(r)}>
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button size="sm" variant="ghost" className="text-red-400" title="حذف" onClick={() => remove(r)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* إضافة/تعديل سجل */}
      <Dialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className={`max-w-lg max-h-[90vh] overflow-y-auto ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white'}`}>
          <DialogHeader>
            <DialogTitle className={title}>{dialog?.id ? 'تعديل سجل' : `إضافة سجل — ${meta.label.replace('ملف ', '')}`}</DialogTitle>
          </DialogHeader>
          {dialog && (
            <div className="grid grid-cols-2 gap-3 mt-2">
              <div className="col-span-2">
                <Label className={muted}>الاسم الرباعي *</Label>
                <Input value={dialog.full_name} onChange={(e) => setDialog({ ...dialog, full_name: e.target.value })} className={field} />
                <p className="text-xs text-slate-500 mt-1">يُربط تلقائيًا بحساب الطالب إذا تطابق الاسم، ويمكن تسجيل أشخاص من خارج المركز.</p>
              </div>
              {isTajweed ? (
                <div className="col-span-2">
                  <Label className={muted}>المستوى</Label>
                  <select value={dialog.level} onChange={(e) => setDialog({ ...dialog, level: e.target.value })}
                    className={`w-full h-10 px-3 rounded-md border ${isDark ? 'bg-slate-800 border-slate-700 text-white' : 'border-slate-300'}`}>
                    <option value="">— اختر —</option>
                    {TAJWEED_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
              ) : (
                <>
                  <div>
                    <Label className={muted}>عدد الأجزاء المحفوظة</Label>
                    <Input type="number" min="0" max="30" step="0.5" value={dialog.juz_count} dir="ltr"
                      onChange={(e) => setDialog({ ...dialog, juz_count: e.target.value })} className={field} />
                  </div>
                  <div>
                    <Label className={muted}>المستوى / الفئة</Label>
                    <Input value={dialog.level} onChange={(e) => setDialog({ ...dialog, level: e.target.value })} className={field} placeholder="مثال: 3 أجزاء" />
                  </div>
                </>
              )}
              <div>
                <Label className={muted}>تاريخ الحصول عليها</Label>
                <Input type="date" value={dialog.obtained_date} onChange={(e) => setDialog({ ...dialog, obtained_date: e.target.value })} className={field} dir="ltr" />
              </div>
              <div>
                <Label className={muted}>مكان الحصول عليها</Label>
                <Input value={dialog.place} onChange={(e) => setDialog({ ...dialog, place: e.target.value })} className={field} placeholder="مدرسة، دورة، مركز..." />
              </div>
              <div>
                <Label className={muted}>تاريخ الميلاد</Label>
                <Input type="date" value={dialog.birth_date} onChange={(e) => setDialog({ ...dialog, birth_date: e.target.value })} className={field} dir="ltr" />
              </div>
              <div>
                <Label className={muted}>الصف</Label>
                <select value={dialog.school_grade} onChange={(e) => setDialog({ ...dialog, school_grade: e.target.value })}
                  className={`w-full h-10 px-3 rounded-md border ${isDark ? 'bg-slate-800 border-slate-700 text-white' : 'border-slate-300'}`}>
                  <option value="">—</option>
                  {SCHOOL_GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <Label className={muted}>الهاتف</Label>
                <Input value={dialog.phone} onChange={(e) => setDialog({ ...dialog, phone: e.target.value })} className={field} dir="ltr" />
              </div>
              <div className="col-span-2">
                <Label className={muted}>ملاحظات</Label>
                <Input value={dialog.notes} onChange={(e) => setDialog({ ...dialog, notes: e.target.value })} className={field} />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 mt-4">
            <Button variant="outline" onClick={() => setDialog(null)} className={outline}>إلغاء</Button>
            <Button onClick={save} disabled={busy} className="bg-emerald-500 hover:bg-emerald-600">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'حفظ'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SupervisionFile;
