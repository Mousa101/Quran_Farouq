import { useState, useEffect, useRef } from 'react';
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
import {
  FolderOpen, Plus, Upload, Download, Trash2, Edit, Search, ArrowRight, Trophy, Link2, FileSpreadsheet, Loader2,
} from 'lucide-react';
import StudentLink from '../components/StudentLink';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const LEVEL_SUGGESTIONS = ['جزء واحد', '3 أجزاء', '5 أجزاء', '10 أجزاء', '15 جزءًا', '20 جزءًا', '25 جزءًا', 'القرآن كاملًا'];

const STATUS_FILTERS = [
  { id: '', label: 'الكل' },
  { id: 'passed', label: 'ناجح' },
  { id: 'failed', label: 'راسب' },
  { id: 'pending', label: 'بلا نتيجة' },
];

const emptyRow = { student_name: '', level: '', score: '', passed: 'auto', notes: '' };

// ملف المسابقة السنوية: السنوات ← كشف كل سنة (الاسم، المستوى، العلامة، النتيجة) مع تصفية واستيراد وتصدير
const AnnualCompetition = () => {
  const { isDark } = useTheme();
  const [years, setYears] = useState([]);
  const [year, setYear] = useState(null);
  const [data, setData] = useState({ rows: [], pass_mark: 70 });
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [rowDialog, setRowDialog] = useState(null); // { id?, ...fields }
  const [yearDialog, setYearDialog] = useState(false);
  const [newYear, setNewYear] = useState({ year: new Date().getFullYear(), pass_mark: 70 });
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importReplace, setImportReplace] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  const card = isDark ? 'glass-card border border-white/10' : 'bg-white border border-slate-200 shadow-sm';
  const title = isDark ? 'text-white' : 'text-slate-900';
  const muted = isDark ? 'text-slate-400' : 'text-slate-600';
  const field = isDark ? 'bg-slate-800 border-slate-700 text-white' : '';

  const loadYears = async () => {
    try {
      const res = await axios.get(`${API}/annual-competition/years`);
      setYears(res.data);
    } catch (e) {
      toast.error('تعذّر تحميل السنوات');
    } finally {
      setLoading(false);
    }
  };

  const loadYear = async (y = year) => {
    if (!y) return;
    try {
      const res = await axios.get(`${API}/annual-competition`, { params: { year: y, status: status || undefined } });
      setData(res.data);
    } catch (e) {
      toast.error('تعذّر تحميل كشف السنة');
    }
  };

  useEffect(() => { loadYears(); }, []);
  useEffect(() => { loadYear(); }, [year, status]);

  const refresh = async () => { await Promise.all([loadYears(), loadYear()]); };

  const download = async (url, name) => {
    try {
      const res = await axios.get(`${API}${url}`, { responseType: 'blob' });
      const link = document.createElement('a');
      link.href = window.URL.createObjectURL(new Blob([res.data]));
      link.download = name;
      link.click();
    } catch (e) {
      toast.error('تعذّر تنزيل الملف');
    }
  };

  const saveYear = async () => {
    setBusy(true);
    try {
      await axios.post(`${API}/annual-competition/years`, { year: Number(newYear.year), pass_mark: Number(newYear.pass_mark) });
      toast.success(`تم حفظ سنة ${newYear.year}`);
      setYearDialog(false);
      await loadYears();
      setYear(Number(newYear.year));
    } catch (e) {
      toast.error(e.response?.data?.detail || 'تعذّر حفظ السنة');
    } finally {
      setBusy(false);
    }
  };

  const saveRow = async () => {
    const r = rowDialog;
    if (!r.student_name.trim()) { toast.error('اسم الطالب مطلوب'); return; }
    const body = {
      year,
      student_name: r.student_name,
      level: r.level || null,
      score: r.score === '' ? null : Number(r.score),
      passed: r.passed === 'auto' ? null : r.passed === 'passed',
      notes: r.notes || null,
    };
    setBusy(true);
    try {
      if (r.id) await axios.put(`${API}/annual-competition/${r.id}`, body);
      else await axios.post(`${API}/annual-competition`, body);
      toast.success(r.id ? 'تم تعديل السجل' : 'تمت إضافة المشارك');
      setRowDialog(null);
      await refresh();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'تعذّر الحفظ');
    } finally {
      setBusy(false);
    }
  };

  const deleteRow = async (row) => {
    try {
      await axios.delete(`${API}/annual-competition/${row.id}`);
      toast.success('تم حذف السجل');
      await refresh();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'تعذّر الحذف');
    }
  };

  const runImport = async () => {
    if (!importFile) { toast.error('اختر ملف Excel أولًا'); return; }
    const form = new FormData();
    form.append('file', importFile);
    setBusy(true);
    try {
      const res = await axios.post(`${API}/annual-competition/import`, form, {
        params: { year, replace: importReplace },
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success(res.data.message);
      setImportOpen(false);
      setImportFile(null);
      await refresh();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'تعذّر الاستيراد');
    } finally {
      setBusy(false);
    }
  };

  const yearInfo = years.find((y) => y.year === year);
  const needle = search.trim();
  const rows = needle ? data.rows.filter((r) => r.student_name.includes(needle)) : data.rows;

  const resultBadge = (passed) => {
    if (passed === true) return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">ناجح</Badge>;
    if (passed === false) return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">راسب</Badge>;
    return <Badge className="bg-slate-500/20 text-slate-400 border-slate-500/30">—</Badge>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn" data-testid="annual-competition-page">
      {/* الرأس */}
      <div className={`p-5 rounded-xl ${card}`}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-amber-500/20 flex items-center justify-center">
              <FolderOpen className="w-6 h-6 text-amber-400" />
            </div>
            <div>
              <h1 className={`text-lg md:text-xl font-bold ${title}`}>
                ملف المسابقة السنوية{year ? ` — ${year}` : ''}
              </h1>
              <p className={`text-sm ${muted}`}>
                {year ? `علامة النجاح ${data.pass_mark}` : 'اختر سنة لعرض أسماء المشاركين ونتائجهم'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {year ? (
              <>
                <Button variant="outline" onClick={() => setYear(null)} className={isDark ? 'border-slate-700' : ''}>
                  <ArrowRight className="w-4 h-4 ml-1" />كل السنوات
                </Button>
                <Button onClick={() => setRowDialog({ ...emptyRow })} className="bg-emerald-500 hover:bg-emerald-600" data-testid="add-participant-btn">
                  <Plus className="w-4 h-4 ml-1" />إضافة مشارك
                </Button>
                <Button variant="outline" onClick={() => setImportOpen(true)} className={isDark ? 'border-slate-700' : ''} data-testid="import-btn">
                  <Upload className="w-4 h-4 ml-1" />استيراد كشف
                </Button>
                <Button variant="outline" onClick={() => download(`/annual-competition/export?year=${year}${status ? `&status=${status}` : ''}`, `annual_competition_${year}.xlsx`)} className={isDark ? 'border-slate-700' : ''}>
                  <Download className="w-4 h-4 ml-1" />تصدير
                </Button>
              </>
            ) : (
              <>
                <Link to="/technical-supervision">
                  <Button variant="outline" className={isDark ? 'border-slate-700' : ''}>
                    <ArrowRight className="w-4 h-4 ml-1" />ملف الإشراف الفني
                  </Button>
                </Link>
                <Button onClick={() => setYearDialog(true)} className="bg-emerald-500 hover:bg-emerald-600" data-testid="add-year-btn">
                  <Plus className="w-4 h-4 ml-1" />إضافة سنة
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* السنوات */}
      {!year && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {years.length === 0 && (
            <p className={`col-span-full text-center py-10 ${muted}`}>لا توجد سنوات بعد — أضف سنة ثم استورد كشفها أو أضف المشاركين</p>
          )}
          {years.map((y) => (
            <button
              key={y.year}
              type="button"
              onClick={() => { setStatus(''); setSearch(''); setYear(y.year); }}
              className={`p-5 rounded-xl text-right transition-all hover:border-amber-500/50 ${card}`}
              data-testid={`year-card-${y.year}`}
            >
              <div className="flex items-center justify-between">
                <FolderOpen className="w-8 h-8 text-amber-400" />
                <span className={`text-2xl font-bold ${title}`}>{y.year}</span>
              </div>
              <p className={`mt-3 text-sm ${muted}`}>{y.total} مشارك</p>
              <div className="flex gap-2 mt-2 text-xs">
                <span className="text-emerald-400">ناجح {y.passed}</span>
                <span className="text-red-400">راسب {y.failed}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* كشف السنة */}
      {year && (
        <Card className={card}>
          <CardContent className="p-4 space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                {STATUS_FILTERS.map((f) => (
                  <Button
                    key={f.id || 'all'}
                    size="sm"
                    variant={status === f.id ? 'default' : 'outline'}
                    onClick={() => setStatus(f.id)}
                    className={status === f.id ? 'bg-amber-500 hover:bg-amber-600 text-slate-900' : (isDark ? 'border-slate-700' : '')}
                    data-testid={`status-filter-${f.id || 'all'}`}
                  >
                    {f.label}
                    {yearInfo && f.id === '' && <span className="mr-1 opacity-70">({yearInfo.total})</span>}
                    {yearInfo && f.id === 'passed' && <span className="mr-1 opacity-70">({yearInfo.passed})</span>}
                    {yearInfo && f.id === 'failed' && <span className="mr-1 opacity-70">({yearInfo.failed})</span>}
                  </Button>
                ))}
              </div>
              <div className="relative w-full sm:w-64">
                <Search className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث بالاسم" className={`pr-8 ${field}`} />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className={`${muted} border-b ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
                    <th className="p-2 text-right">#</th>
                    <th className="p-2 text-right">اسم الطالب</th>
                    <th className="p-2 text-right">المستوى</th>
                    <th className="p-2 text-center">العلامة</th>
                    <th className="p-2 text-center">النتيجة</th>
                    <th className="p-2 text-right">الربط بالتقييم</th>
                    <th className="p-2 text-right">ملاحظات</th>
                    <th className="p-2" />
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && (
                    <tr><td colSpan={8} className={`text-center py-8 ${muted}`}>لا توجد أسماء</td></tr>
                  )}
                  {rows.map((r, i) => (
                    <tr key={r.id} className={`border-b ${isDark ? 'border-white/5' : 'border-slate-100'}`} data-testid={`participant-row-${r.id}`}>
                      <td className={`p-2 ${muted}`}>{i + 1}</td>
                      <td className={`p-2 font-medium ${title}`}>
                        {r.linked ? <StudentLink studentId={r.student_id} name={r.student_name} className={title} /> : r.student_name}
                      </td>
                      <td className={`p-2 ${title}`}>{r.level || '—'}</td>
                      <td className={`p-2 text-center font-bold ${title}`}>{r.score ?? '—'}</td>
                      <td className="p-2 text-center">{resultBadge(r.passed)}</td>
                      <td className="p-2">
                        {r.linked ? (
                          <span className="flex items-center gap-1 text-xs text-sky-400">
                            <Link2 className="w-3 h-3" />
                            {r.group_name || 'بدون مجموعة'}
                            {r.assessment_competition_juz?.length > 0 && ` · أجزاء التقييم: ${r.assessment_competition_juz.join('، ')}`}
                          </span>
                        ) : (
                          <span className={`text-xs ${muted}`}>غير مرتبط بحساب</span>
                        )}
                      </td>
                      <td className={`p-2 text-xs ${muted}`}>{r.notes || ''}</td>
                      <td className="p-2">
                        <div className="flex gap-1 justify-end">
                          <Button size="sm" variant="ghost" className="text-blue-400" title="تعديل"
                            onClick={() => setRowDialog({
                              id: r.id, student_name: r.student_name, level: r.level || '', score: r.score ?? '',
                              passed: r.passed === true ? 'passed' : r.passed === false ? 'failed' : 'auto', notes: r.notes || '',
                            })}>
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button size="sm" variant="ghost" className="text-red-400" title="حذف" onClick={() => deleteRow(r)}>
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

      {/* إضافة سنة */}
      <Dialog open={yearDialog} onOpenChange={setYearDialog}>
        <DialogContent className={isDark ? 'bg-slate-900 border-slate-700' : 'bg-white'}>
          <DialogHeader>
            <DialogTitle className={`flex items-center gap-2 ${title}`}><Trophy className="w-5 h-5 text-amber-400" />إضافة سنة</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 mt-2">
            <div>
              <Label className={muted}>السنة</Label>
              <Input type="number" value={newYear.year} onChange={(e) => setNewYear({ ...newYear, year: e.target.value })} className={field} dir="ltr" />
            </div>
            <div>
              <Label className={muted}>علامة النجاح</Label>
              <Input type="number" min="0" max="100" value={newYear.pass_mark} onChange={(e) => setNewYear({ ...newYear, pass_mark: e.target.value })} className={field} dir="ltr" />
            </div>
          </div>
          <DialogFooter className="gap-2 mt-4">
            <Button variant="outline" onClick={() => setYearDialog(false)} className={isDark ? 'border-slate-700' : ''}>إلغاء</Button>
            <Button onClick={saveYear} disabled={busy} className="bg-emerald-500 hover:bg-emerald-600">حفظ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* إضافة/تعديل مشارك */}
      <Dialog open={!!rowDialog} onOpenChange={(o) => !o && setRowDialog(null)}>
        <DialogContent className={`max-w-lg ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white'}`}>
          <DialogHeader>
            <DialogTitle className={title}>{rowDialog?.id ? 'تعديل مشارك' : `إضافة مشارك — ${year}`}</DialogTitle>
          </DialogHeader>
          {rowDialog && (
            <div className="grid grid-cols-2 gap-3 mt-2">
              <div className="col-span-2">
                <Label className={muted}>اسم الطالب *</Label>
                <Input value={rowDialog.student_name} onChange={(e) => setRowDialog({ ...rowDialog, student_name: e.target.value })} className={field} />
                <p className="text-xs text-slate-500 mt-1">يُربط تلقائيًا بحساب الطالب إذا تطابق الاسم.</p>
              </div>
              <div>
                <Label className={muted}>المستوى</Label>
                <Input list="annual-levels" value={rowDialog.level} onChange={(e) => setRowDialog({ ...rowDialog, level: e.target.value })} className={field} placeholder="مثال: 5 أجزاء" />
                <datalist id="annual-levels">{LEVEL_SUGGESTIONS.map((l) => <option key={l} value={l} />)}</datalist>
              </div>
              <div>
                <Label className={muted}>العلامة (من 100)</Label>
                <Input type="number" min="0" max="100" value={rowDialog.score} onChange={(e) => setRowDialog({ ...rowDialog, score: e.target.value })} className={field} dir="ltr" />
              </div>
              <div className="col-span-2">
                <Label className={muted}>النتيجة</Label>
                <select
                  value={rowDialog.passed}
                  onChange={(e) => setRowDialog({ ...rowDialog, passed: e.target.value })}
                  className={`w-full h-10 px-3 rounded-md border ${isDark ? 'bg-slate-800 border-slate-700 text-white' : 'border-slate-300'}`}
                >
                  <option value="auto">تلقائيًا حسب علامة النجاح ({data.pass_mark})</option>
                  <option value="passed">ناجح</option>
                  <option value="failed">راسب</option>
                </select>
              </div>
              <div className="col-span-2">
                <Label className={muted}>ملاحظات</Label>
                <Input value={rowDialog.notes} onChange={(e) => setRowDialog({ ...rowDialog, notes: e.target.value })} className={field} />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 mt-4">
            <Button variant="outline" onClick={() => setRowDialog(null)} className={isDark ? 'border-slate-700' : ''}>إلغاء</Button>
            <Button onClick={saveRow} disabled={busy} className="bg-emerald-500 hover:bg-emerald-600">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'حفظ'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* استيراد كشف */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className={`max-w-lg ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white'}`}>
          <DialogHeader>
            <DialogTitle className={`flex items-center gap-2 ${title}`}><FileSpreadsheet className="w-5 h-5 text-emerald-400" />استيراد كشف سنة {year}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2 text-sm">
            <p className={muted}>
              ملف Excel (xlsx) فيه الأعمدة: <b>الاسم</b>، المستوى، العلامة، النتيجة (ناجح/راسب)، ملاحظات. عمود الاسم وحده إلزامي، وإذا لم تُكتب النتيجة تُحسب من العلامة.
            </p>
            <Button variant="outline" size="sm" onClick={() => download('/annual-competition/template', 'annual_competition_template.xlsx')} className={isDark ? 'border-slate-700' : ''}>
              <Download className="w-4 h-4 ml-1" />تنزيل نموذج فارغ
            </Button>
            <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={(e) => setImportFile(e.target.files?.[0] || null)} />
            <Button variant="outline" onClick={() => fileRef.current?.click()} className={`w-full ${isDark ? 'border-slate-700' : ''}`}>
              <Upload className="w-4 h-4 ml-1" />{importFile ? importFile.name : 'اختيار الملف'}
            </Button>
            <label className={`flex items-center gap-2 ${muted}`}>
              <input type="checkbox" checked={importReplace} onChange={(e) => setImportReplace(e.target.checked)} />
              استبدال كشف السنة الحالي بالكامل (وإلا يُحدَّث الموجود ويُضاف الجديد)
            </label>
          </div>
          <DialogFooter className="gap-2 mt-4">
            <Button variant="outline" onClick={() => setImportOpen(false)} className={isDark ? 'border-slate-700' : ''}>إلغاء</Button>
            <Button onClick={runImport} disabled={busy || !importFile} className="bg-emerald-500 hover:bg-emerald-600">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'استيراد'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AnnualCompetition;
