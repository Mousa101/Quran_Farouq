import { useState, useEffect } from 'react';
import axios from 'axios';
import { useTheme } from '../context/ThemeContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { toast } from 'sonner';
import { Trophy, Plus, Trash2, Edit, Award, ChevronDown, ChevronUp, Download, Filter } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// معايير المسابقة القابلة للتخصيص (A8)
const CRITERIA_META = [
  { key: 'age', label: 'الفئة العمرية', fields: [{ name: 'min_age', label: 'أدنى عمر' }, { name: 'max_age', label: 'أقصى عمر' }] },
  { key: 'memorized', label: 'الأجزاء المحفوظة', fields: [{ name: 'min_juz', label: 'أدنى أجزاء' }] },
  { key: 'weak', label: 'الأجزاء الضعيفة', fields: [{ name: 'max_weak', label: 'أقصى ضعيف' }] },
  { key: 'accuracy', label: 'دقة التسميع', fields: [{ name: 'max_avg_errors', label: 'أقصى متوسط أخطاء' }] },
  { key: 'attendance', label: 'نسبة الحضور %', fields: [{ name: 'min_rate', label: 'أدنى نسبة %' }] },
  { key: 'points', label: 'مجموع النقاط', fields: [{ name: 'min_points', label: 'أدنى نقاط' }] },
  { key: 'tests', label: 'اجتياز الاختبارات', fields: [] },
];

const PRESETS = {
  young_hafiz: {
    age: { enabled: true, required: true, weight: 2, min_age: 8, max_age: 12 },
    memorized: { enabled: true, required: true, weight: 2, min_juz: 3 },
    weak: { enabled: true, required: false, weight: 1, max_weak: 0 },
    accuracy: { enabled: true, required: false, weight: 1, max_avg_errors: 2 },
    attendance: { enabled: true, required: false, weight: 1, min_rate: 70 },
    tests: { enabled: true, required: false, weight: 1 },
  },
  annual: {
    memorized: { enabled: true, required: true, weight: 3, min_juz: 5 },
    weak: { enabled: true, required: false, weight: 1, max_weak: 0 },
    accuracy: { enabled: true, required: false, weight: 2, max_avg_errors: 1 },
    attendance: { enabled: true, required: false, weight: 1, min_rate: 70 },
    points: { enabled: true, required: false, weight: 1, min_points: 100 },
    tests: { enabled: true, required: false, weight: 1 },
  },
  custom: {},
};

const emptyForm = () => ({ name: '', type: 'young_hafiz', category: '', criteria: JSON.parse(JSON.stringify(PRESETS.young_hafiz)) });

const CompetitionsAnalysis = () => {
  const { isDark } = useTheme();
  const [competitions, setCompetitions] = useState([]);
  const [groups, setGroups] = useState([]);
  const [selected, setSelected] = useState(null);
  const [result, setResult] = useState(null);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [expanded, setExpanded] = useState(null);
  const [eligibleOnly, setEligibleOnly] = useState(false);
  const [groupFilter, setGroupFilter] = useState('all');

  useEffect(() => {
    fetchCompetitions();
    axios.get(`${API}/groups`).then((r) => setGroups(r.data || [])).catch(() => {});
  }, []);

  const fetchCompetitions = async () => {
    try {
      const res = await axios.get(`${API}/competitions`);
      setCompetitions(res.data || []);
    } catch (error) {
      console.error(error);
    }
  };

  const openCreate = () => {
    setEditId(null);
    setForm(emptyForm());
    setDialogOpen(true);
  };

  const openEdit = (comp) => {
    setEditId(comp.id);
    setForm({ name: comp.name, type: comp.type, category: comp.category || '', criteria: comp.criteria || {} });
    setDialogOpen(true);
  };

  const onTypeChange = (type) => {
    setForm((f) => ({ ...f, type, criteria: JSON.parse(JSON.stringify(PRESETS[type] || {})) }));
  };

  const setCrit = (key, field, value) => {
    setForm((f) => {
      const criteria = { ...f.criteria };
      criteria[key] = { ...(criteria[key] || {}), [field]: value };
      return { ...f, criteria };
    });
  };

  const saveCompetition = async () => {
    if (!form.name.trim()) { toast.error('أدخل اسم المسابقة'); return; }
    const enabledCount = Object.values(form.criteria).filter((c) => c?.enabled).length;
    if (enabledCount === 0) { toast.error('فعّل معيارًا واحدًا على الأقل'); return; }
    try {
      const payload = { name: form.name, type: form.type, category: form.category || null, criteria: form.criteria };
      if (editId) await axios.put(`${API}/competitions/${editId}`, payload);
      else await axios.post(`${API}/competitions`, payload);
      toast.success(editId ? 'تم تحديث المسابقة' : 'تم إنشاء المسابقة');
      setDialogOpen(false);
      fetchCompetitions();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في الحفظ');
    }
  };

  const deleteCompetition = async (id) => {
    if (!window.confirm('حذف هذه المسابقة؟')) return;
    try {
      await axios.delete(`${API}/competitions/${id}`);
      toast.success('تم الحذف');
      if (selected?.id === id) { setSelected(null); setResult(null); }
      fetchCompetitions();
    } catch (error) {
      toast.error('فشل في الحذف');
    }
  };

  const viewCandidates = async (comp) => {
    setSelected(comp);
    setResult(null);
    setExpanded(null);
    setLoadingCandidates(true);
    try {
      const params = groupFilter !== 'all' ? `?group_id=${groupFilter}` : '';
      const res = await axios.get(`${API}/competitions/${comp.id}/candidates${params}`);
      setResult(res.data);
    } catch (error) {
      toast.error('فشل في تحميل المرشّحين');
    } finally {
      setLoadingCandidates(false);
    }
  };

  useEffect(() => {
    if (selected) viewCandidates(selected);
    // eslint-disable-next-line
  }, [groupFilter]);

  const exportCsv = () => {
    if (!result?.candidates?.length) return;
    const rows = [['#', 'الطالب', 'المجموعة', 'نسبة التطابق', 'مؤهل', 'العمر', 'الأجزاء المحفوظة', 'الأجزاء الضعيفة', 'نسبة الحضور', 'النقاط']];
    filteredCandidates.forEach((c, i) => rows.push([
      i + 1, c.name, c.group_name, `${c.match}%`, c.eligible ? 'نعم' : 'لا',
      c.metrics.age ?? '', c.metrics.memorized_juz, c.metrics.weak_count, `${c.metrics.attendance_rate}%`, c.metrics.points,
    ]));
    const csv = '﻿' + rows.map((r) => r.map((x) => `"${x}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `مرشحو_${selected.name}.csv`;
    link.click();
  };

  const filteredCandidates = (result?.candidates || []).filter((c) => !eligibleOnly || c.eligible);

  const matchColor = (m) => (m >= 80 ? 'text-emerald-400' : m >= 50 ? 'text-amber-400' : 'text-red-400');
  const barColor = (m) => (m >= 80 ? 'bg-emerald-500' : m >= 50 ? 'bg-amber-500' : 'bg-red-500');

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className={`p-6 rounded-xl ${isDark ? 'glass-card border border-white/10' : 'bg-white border border-slate-200 shadow-sm'}`}>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center">
              <Trophy className="w-6 h-6 text-amber-400" />
            </div>
            <div>
              <h1 className={`text-xl md:text-2xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>مرشّحو المسابقات القرآنية</h1>
              <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>معايير قابلة للتخصيص وترتيب المرشّحين بنسبة تطابق</p>
            </div>
          </div>
          <Button onClick={openCreate} className="bg-amber-600 hover:bg-amber-700">
            <Plus className="w-4 h-4 ml-1" /> مسابقة جديدة
          </Button>
        </div>
      </div>

      {/* Competitions list */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {competitions.length === 0 && (
          <p className={`col-span-full text-center py-8 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>لا توجد مسابقات — أنشئ واحدة للبدء</p>
        )}
        {competitions.map((comp) => (
          <Card key={comp.id} className={`${isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'} ${selected?.id === comp.id ? 'ring-2 ring-amber-500/50' : ''}`}>
            <CardHeader className="pb-2">
              <CardTitle className={`text-base flex items-center justify-between ${isDark ? 'text-white' : 'text-slate-900'}`}>
                <span className="flex items-center gap-2"><Award className="w-4 h-4 text-amber-400" />{comp.name}</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className={`text-xs mb-3 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                {comp.type === 'young_hafiz' ? 'الحافظ الصغير' : comp.type === 'annual' ? 'المسابقة السنوية' : 'مخصّصة'}
                {comp.category ? ` · ${comp.category}` : ''}
                {' · '}{Object.values(comp.criteria || {}).filter((c) => c?.enabled).length} معيار
              </p>
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={() => viewCandidates(comp)} className="bg-emerald-600 hover:bg-emerald-700 flex-1">عرض المرشّحين</Button>
                <Button size="sm" variant="ghost" onClick={() => openEdit(comp)} className="text-blue-400 hover:bg-blue-500/10"><Edit className="w-4 h-4" /></Button>
                <Button size="sm" variant="ghost" onClick={() => deleteCompetition(comp.id)} className="text-red-400 hover:bg-red-500/10"><Trash2 className="w-4 h-4" /></Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Candidates */}
      {selected && (
        <Card className={isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'}>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <CardTitle className={`text-lg ${isDark ? 'text-white' : 'text-slate-900'}`}>
                مرشّحو: {selected.name}
                {result && <span className="text-sm font-normal text-slate-400 mr-2">({result.eligible_count} مؤهل من {result.count})</span>}
              </CardTitle>
              <div className="flex items-center gap-2 flex-wrap">
                <select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)} className={`p-2 rounded-lg border text-sm ${isDark ? 'bg-slate-800 border-white/10 text-white' : 'bg-white border-slate-300'}`}>
                  <option value="all">كل المجموعات</option>
                  {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
                <Button size="sm" variant="outline" onClick={() => setEligibleOnly(!eligibleOnly)} className={`${eligibleOnly ? 'bg-emerald-500/20 text-emerald-400' : ''} ${isDark ? 'border-white/10' : ''}`}>
                  <Filter className="w-4 h-4 ml-1" /> {eligibleOnly ? 'المؤهلون فقط' : 'الكل'}
                </Button>
                <Button size="sm" variant="outline" onClick={exportCsv} className={isDark ? 'border-white/10 text-white hover:bg-white/5' : ''}>
                  <Download className="w-4 h-4 ml-1" /> تصدير CSV
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loadingCandidates ? (
              <div className="flex items-center justify-center h-32"><div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" /></div>
            ) : filteredCandidates.length === 0 ? (
              <p className={`text-center py-8 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>لا يوجد مرشّحون مطابقون</p>
            ) : (
              <div className="space-y-2">
                {filteredCandidates.map((c, i) => (
                  <div key={c.student_id} className={`rounded-lg ${isDark ? 'bg-slate-800/50' : 'bg-slate-50'}`}>
                    <div className="p-3 flex items-center gap-3">
                      <span className={`w-7 h-7 flex items-center justify-center rounded-full text-sm font-bold ${i < 3 ? 'bg-amber-500/20 text-amber-400' : isDark ? 'bg-slate-700 text-slate-400' : 'bg-slate-200 text-slate-600'}`}>{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className={`font-medium text-sm ${isDark ? 'text-white' : 'text-slate-900'}`}>{c.name}</p>
                          {c.eligible
                            ? <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400">مؤهل</span>
                            : <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-400">غير مؤهل</span>}
                        </div>
                        <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{c.group_name}</p>
                      </div>
                      <div className="w-32 hidden sm:block">
                        <div className={`h-2 rounded-full ${isDark ? 'bg-slate-700' : 'bg-slate-200'}`}>
                          <div className={`h-2 rounded-full ${barColor(c.match)}`} style={{ width: `${c.match}%` }} />
                        </div>
                      </div>
                      <span className={`text-lg font-bold w-16 text-left ${matchColor(c.match)}`}>{c.match}%</span>
                      <Button size="sm" variant="ghost" onClick={() => setExpanded(expanded === c.student_id ? null : c.student_id)}>
                        {expanded === c.student_id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </Button>
                    </div>
                    {expanded === c.student_id && (
                      <div className={`px-4 pb-3 border-t ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
                        <p className={`text-xs font-semibold mt-2 mb-2 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>لماذا هذا الطالب:</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {c.breakdown.map((b) => (
                            <div key={b.key} className={`flex items-center justify-between text-xs p-2 rounded ${b.met ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
                              <span className={isDark ? 'text-slate-300' : 'text-slate-700'}>{b.label} <span className="text-slate-500">(وزن {b.weight})</span></span>
                              <span className={b.met ? 'text-emerald-400' : 'text-red-400'}>{b.value} / {b.target} {b.met ? '✓' : '✗'}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Create/Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className={`${isDark ? 'bg-slate-900 border-white/10' : 'bg-white'} max-w-2xl max-h-[90vh] overflow-y-auto`}>
          <DialogHeader>
            <DialogTitle className={isDark ? 'text-white' : 'text-slate-900'}>{editId ? 'تعديل المسابقة' : 'مسابقة جديدة'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>اسم المسابقة</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={isDark ? 'bg-slate-800 border-white/10 text-white' : ''} />
              </div>
              <div>
                <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>النوع</Label>
                <select value={form.type} onChange={(e) => onTypeChange(e.target.value)} className={`w-full p-2 rounded-md border ${isDark ? 'bg-slate-800 border-white/10 text-white' : 'bg-white border-slate-300'}`}>
                  <option value="young_hafiz">الحافظ الصغير</option>
                  <option value="annual">المسابقة السنوية</option>
                  <option value="custom">مخصّصة</option>
                </select>
              </div>
            </div>
            {form.type === 'annual' && (
              <div>
                <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>الفئة (مثال: 5 أجزاء)</Label>
                <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={isDark ? 'bg-slate-800 border-white/10 text-white' : ''} />
              </div>
            )}

            <div className="space-y-2">
              <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>المعايير (فعّل، حدّد الحدود والأوزان)</Label>
              {CRITERIA_META.map((meta) => {
                const c = form.criteria[meta.key] || {};
                return (
                  <div key={meta.key} className={`p-3 rounded-lg border ${isDark ? 'border-white/10 bg-slate-800/40' : 'border-slate-200 bg-slate-50'}`}>
                    <div className="flex items-center gap-3 flex-wrap">
                      <label className="flex items-center gap-2 cursor-pointer min-w-[130px]">
                        <input type="checkbox" checked={!!c.enabled} onChange={(e) => setCrit(meta.key, 'enabled', e.target.checked)} />
                        <span className={`text-sm font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>{meta.label}</span>
                      </label>
                      {c.enabled && (
                        <>
                          {meta.fields.map((fld) => (
                            <div key={fld.name} className="flex items-center gap-1">
                              <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>{fld.label}</span>
                              <Input type="number" value={c[fld.name] ?? ''} onChange={(e) => setCrit(meta.key, fld.name, e.target.value === '' ? null : parseFloat(e.target.value))} className={`w-20 h-8 ${isDark ? 'bg-slate-800 border-white/10 text-white' : ''}`} />
                            </div>
                          ))}
                          <div className="flex items-center gap-1">
                            <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>الوزن</span>
                            <Input type="number" min="1" value={c.weight ?? 1} onChange={(e) => setCrit(meta.key, 'weight', parseFloat(e.target.value) || 1)} className={`w-16 h-8 ${isDark ? 'bg-slate-800 border-white/10 text-white' : ''}`} />
                          </div>
                          <label className="flex items-center gap-1 cursor-pointer">
                            <input type="checkbox" checked={!!c.required} onChange={(e) => setCrit(meta.key, 'required', e.target.checked)} />
                            <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>إلزامي</span>
                          </label>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <DialogFooter>
            <Button onClick={saveCompetition} className="bg-amber-600 hover:bg-amber-700">{editId ? 'حفظ التعديلات' : 'إنشاء'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CompetitionsAnalysis;
