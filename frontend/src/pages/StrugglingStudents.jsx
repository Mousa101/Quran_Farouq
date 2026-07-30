import { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { toast } from 'sonner';
import {
  AlertTriangle, BellRing, Users, Save, BookOpen, Hand, BookMarked,
  UserCheck, Layers, Settings2, Loader2, ChevronDown, ChevronUp
} from 'lucide-react';
import StudentLink from '../components/StudentLink';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// أقسام التعثّر — تطابق STRUGGLING_CATEGORIES في الخادم
const CATEGORIES = [
  { key: 'recitation', label: 'التسميع', icon: BookOpen, color: 'blue' },
  { key: 'prayers', label: 'الصلوات', icon: Hand, color: 'emerald' },
  { key: 'sitting', label: 'الجلوس مع القرآن', icon: BookMarked, color: 'purple' },
  { key: 'attendance', label: 'الحضور', icon: UserCheck, color: 'amber' },
  { key: 'all', label: 'متعثّر في كل شيء', icon: Layers, color: 'red' },
];

const PERIODS = [
  { key: 'week', label: 'الأسبوع' },
  { key: 'month', label: 'الشهر' },
  { key: 'term', label: 'الفصل' },
];

// حقول ضبط المقاييس
const CRITERIA_FIELDS = [
  { key: 'recitation_days', label: 'أيام الانقطاع عن التسميع', hint: 'متعثّر إذا مرّ هذا العدد من الأيام بلا تسميع', min: 1, max: 365 },
  { key: 'prayers_min', label: 'الحد الأدنى للصلوات', hint: 'مجموع الصلوات في ورق المتابعة خلال المدة', min: 0, max: 1000 },
  { key: 'sitting_min', label: 'الحد الأدنى للجلوس مع القرآن', hint: 'مجموع أيام الجلوس خلال المدة', min: 0, max: 1000 },
  { key: 'attendance_min_rate', label: 'الحد الأدنى لنسبة الحضور %', hint: 'نسبة الحضور خلال المدة', min: 0, max: 100 },
];

const StrugglingStudents = () => {
  const { user } = useAuth();
  const { isDark } = useTheme();
  const isAdmin = user?.role === 'admin';

  const [groups, setGroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState('all');
  const [category, setCategory] = useState('recitation');
  const [period, setPeriod] = useState('week');
  const [report, setReport] = useState({ students: [], count: 0, default_days: 2 });
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(new Set());

  // ضبط المقاييس (المدير فقط)
  const [showCriteria, setShowCriteria] = useState(false);
  const [criteria, setCriteria] = useState({});
  const [savingCriteria, setSavingCriteria] = useState(false);

  useEffect(() => {
    fetchGroups();
    fetchCriteria();
  }, []);

  useEffect(() => {
    fetchReport();
    fetchCounts();
    // eslint-disable-next-line
  }, [selectedGroup, category, period]);

  const fetchGroups = async () => {
    try {
      const res = await axios.get(`${API}/groups`);
      setGroups(res.data || []);
    } catch (error) {
      console.error('Error loading groups:', error);
    }
  };

  const fetchCriteria = async () => {
    try {
      const res = await axios.get(`${API}/settings/struggling-criteria`);
      setCriteria(res.data || {});
    } catch (error) {
      console.error('Error loading criteria:', error);
    }
  };

  const params = () => {
    const p = new URLSearchParams();
    if (selectedGroup !== 'all') p.append('group_id', selectedGroup);
    p.append('category', category);
    p.append('period', period);
    return p.toString();
  };

  const fetchReport = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/reports/struggling-students?${params()}`);
      setReport(res.data || { students: [], count: 0 });
      setSelected(new Set());
    } catch (error) {
      console.error('Error loading report:', error);
      toast.error('فشل في تحميل التقرير');
    } finally {
      setLoading(false);
    }
  };

  const fetchCounts = async () => {
    try {
      const p = new URLSearchParams();
      if (selectedGroup !== 'all') p.append('group_id', selectedGroup);
      p.append('period', period);
      const res = await axios.get(`${API}/reports/struggling-students/summary?${p.toString()}`);
      setCounts(res.data?.counts || {});
    } catch (error) {
      console.error('Error loading summary:', error);
    }
  };

  const saveCriteria = async () => {
    const payload = {};
    for (const f of CRITERIA_FIELDS) {
      const v = parseInt(criteria[f.key], 10);
      if (isNaN(v) || v < f.min || v > f.max) {
        toast.error(`${f.label}: القيمة يجب أن تكون بين ${f.min} و ${f.max}`);
        return;
      }
      payload[f.key] = v;
    }
    setSavingCriteria(true);
    try {
      const res = await axios.put(`${API}/settings/struggling-criteria`, payload);
      setCriteria(res.data.criteria);
      toast.success('تم حفظ مقاييس التعثّر');
      fetchReport();
      fetchCounts();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في حفظ المقاييس');
    } finally {
      setSavingCriteria(false);
    }
  };

  const toggleSelect = (id) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  const toggleSelectAll = () => {
    if (selected.size === report.students.length) setSelected(new Set());
    else setSelected(new Set(report.students.map((s) => s.student_id)));
  };

  const sendAlerts = async (ids) => {
    if (!ids.length) { toast.error('لم يتم اختيار أي طالب'); return; }
    try {
      const res = await axios.post(`${API}/reports/struggling-students/alert`, {
        student_ids: ids, category,
      });
      toast.success(res.data.message || 'تم إرسال التنبيهات');
      setSelected(new Set());
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في إرسال التنبيهات');
    }
  };

  const activeCat = CATEGORIES.find((c) => c.key === category);

  // القيمة المميّزة لكل طالب حسب القسم المعروض
  const metricFor = (s) => {
    if (category === 'recitation') {
      return s.days_since === null || s.days_since === undefined
        ? { text: 'لم يسمّع مطلقًا', tone: 'bg-red-500/20 text-red-400' }
        : { text: `${s.days_since} يوم بلا تسميع`, tone: 'bg-amber-500/20 text-amber-400' };
    }
    if (category === 'prayers') return { text: `${s.prayers} صلاة`, tone: 'bg-emerald-500/20 text-emerald-400' };
    if (category === 'sitting') return { text: `${s.sitting} يوم جلوس`, tone: 'bg-purple-500/20 text-purple-400' };
    if (category === 'attendance') return { text: `${s.attendance_rate}% حضور`, tone: 'bg-amber-500/20 text-amber-400' };
    return { text: `${s.failed_count}/4 أقسام`, tone: 'bg-red-500/20 text-red-400' };
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className={`p-4 md:p-6 rounded-xl ${isDark ? 'glass-card border border-white/10' : 'bg-white border border-slate-200 shadow-sm'}`}>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-amber-400" />
            </div>
            <div>
              <h1 className={`text-xl md:text-2xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                الطلاب المتعثّرون
              </h1>
              <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                فلترة حسب قسم التعثّر — والمقاييس يحدّدها المدير
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={selectedGroup}
              onChange={(e) => setSelectedGroup(e.target.value)}
              className={`p-2 rounded-lg border text-sm ${isDark ? 'bg-slate-800 border-white/10 text-white' : 'bg-white border-slate-300'}`}
            >
              <option value="all">كل المجموعات</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>

            <div className={`inline-flex rounded-lg border overflow-hidden ${isDark ? 'border-white/10' : 'border-slate-300'}`}>
              {PERIODS.map((p) => (
                <button
                  key={p.key}
                  onClick={() => setPeriod(p.key)}
                  className={`px-3 py-2 text-sm transition-colors ${
                    period === p.key
                      ? 'bg-amber-600 text-white'
                      : isDark ? 'bg-slate-800 text-slate-300 hover:bg-white/5' : 'bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {isAdmin && (
              <Button
                variant="outline"
                onClick={() => setShowCriteria(!showCriteria)}
                className={isDark ? 'border-white/10 text-white hover:bg-white/5' : ''}
              >
                <Settings2 className="w-4 h-4 ml-1" />
                مقاييس التعثّر
                {showCriteria ? <ChevronUp className="w-4 h-4 mr-1" /> : <ChevronDown className="w-4 h-4 mr-1" />}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ضبط المقاييس — المدير فقط */}
      {isAdmin && showCriteria && (
        <Card className={`${isDark ? 'glass-card' : 'bg-white'} border-amber-500/30`}>
          <CardHeader>
            <CardTitle className={`flex items-center gap-2 text-base ${isDark ? 'text-white' : 'text-slate-900'}`}>
              <Settings2 className="w-5 h-5 text-amber-400" />
              مقاييس تحديد الطالب المتعثّر
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
              الصلوات والجلوس والحضور تُقاس خلال <strong>{PERIODS.find((p) => p.key === period)?.label}</strong> (حسب الفلتر فوق).
              أما التسميع فبعدد الأيام منذ آخر تسميع.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {CRITERIA_FIELDS.map((f) => (
                <div key={f.key} className="space-y-1">
                  <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>{f.label}</Label>
                  <Input
                    type="number"
                    min={f.min}
                    max={f.max}
                    value={criteria[f.key] ?? ''}
                    onChange={(e) => setCriteria({ ...criteria, [f.key]: e.target.value })}
                    className={isDark ? 'bg-slate-800 border-slate-700 text-white' : ''}
                  />
                  <p className="text-slate-500 text-xs">{f.hint}</p>
                </div>
              ))}
            </div>
            <Button onClick={saveCriteria} disabled={savingCriteria} className="bg-amber-600 hover:bg-amber-700">
              {savingCriteria ? <Loader2 className="w-4 h-4 ml-1 animate-spin" /> : <Save className="w-4 h-4 ml-1" />}
              حفظ المقاييس
            </Button>
          </CardContent>
        </Card>
      )}

      {/* تبويبات الأقسام */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {CATEGORIES.map((c) => {
          const Icon = c.icon;
          const isActive = category === c.key;
          return (
            <button
              key={c.key}
              onClick={() => setCategory(c.key)}
              className={`p-3 rounded-xl border text-center transition-colors ${
                isActive
                  ? 'bg-amber-500/20 border-amber-500/50'
                  : isDark ? 'bg-slate-800/40 border-white/10 hover:bg-white/5' : 'bg-white border-slate-200 hover:bg-slate-50'
              }`}
            >
              <Icon className={`w-5 h-5 mx-auto mb-1 ${isActive ? 'text-amber-400' : isDark ? 'text-slate-400' : 'text-slate-500'}`} />
              <p className={`text-xs font-medium ${isActive ? 'text-amber-400' : isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                {c.label}
              </p>
              <p className={`text-lg font-bold ${isActive ? 'text-amber-400' : isDark ? 'text-white' : 'text-slate-900'}`}>
                {counts[c.key] ?? '—'}
              </p>
            </button>
          );
        })}
      </div>

      {/* ملخّص + إجراءات */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <Card className={`${isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'} flex-1 min-w-[220px]`}>
          <CardContent className="p-4 flex items-center gap-3">
            <Users className="w-8 h-8 text-amber-400" />
            <div>
              <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                متعثّرون في: {activeCat?.label}
              </p>
              <p className="text-2xl font-bold text-amber-400">{report.count}</p>
            </div>
          </CardContent>
        </Card>
        {report.students.length > 0 && (
          <Button onClick={() => sendAlerts([...selected])} disabled={selected.size === 0} className="bg-amber-600 hover:bg-amber-700">
            <BellRing className="w-4 h-4 ml-1" /> إرسال تنبيه للمحدّدين ({selected.size})
          </Button>
        )}
      </div>

      {/* القائمة */}
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : report.students.length === 0 ? (
        <Card className={isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'}>
          <CardContent className="p-12 text-center">
            <p className={isDark ? 'text-slate-400' : 'text-slate-600'}>
              ما في طلاب متعثّرين في {activeCat?.label} 🎉
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className={isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'}>
          <CardHeader className="pb-2">
            <CardTitle className={`text-base flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
              <label className="flex items-center gap-2 cursor-pointer text-sm font-normal">
                <input
                  type="checkbox"
                  checked={selected.size === report.students.length && report.students.length > 0}
                  onChange={toggleSelectAll}
                />
                تحديد الكل
              </label>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {report.students.map((s) => {
                const m = metricFor(s);
                return (
                  <div key={s.student_id} className={`p-3 rounded-lg flex items-center justify-between gap-3 flex-wrap ${isDark ? 'bg-slate-800/50' : 'bg-slate-50'}`}>
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <input type="checkbox" checked={selected.has(s.student_id)} onChange={() => toggleSelect(s.student_id)} />
                      <div className="min-w-0">
                        <StudentLink studentId={s.student_id} name={s.name} className={`font-medium text-sm ${isDark ? 'text-white' : 'text-slate-900'}`} />
                        <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                          {s.group_name} · آخر تسميع: {s.last_recitation || '—'}
                        </p>
                        {/* أسباب التعثّر */}
                        <div className="flex items-center gap-1 mt-1 flex-wrap">
                          {s.reasons?.map((r) => (
                            <span key={r} className={`text-[10px] px-1.5 py-0.5 rounded ${isDark ? 'bg-red-500/15 text-red-300' : 'bg-red-50 text-red-600'}`}>
                              {r}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`text-xs px-2 py-1 rounded-full ${m.tone}`}>{m.text}</span>
                      <Button size="sm" variant="ghost" onClick={() => sendAlerts([s.student_id])} className="text-amber-400 hover:bg-amber-500/10" title="إرسال تنبيه">
                        <BellRing className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default StrugglingStudents;
