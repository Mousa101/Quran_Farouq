import { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { toast } from 'sonner';
import { AlertTriangle, BellRing, Clock, Users, Save } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// A4 - تقرير الطلاب المتعثّرين: من مرّ عليه أيام دون تسميع
const StrugglingStudents = () => {
  const { user } = useAuth();
  const { isDark } = useTheme();
  const isSheikh = user?.role === 'sheikh';

  const [groups, setGroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState('all');
  const [daysOverride, setDaysOverride] = useState('');
  const [report, setReport] = useState({ students: [], count: 0, default_days: 2 });
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(new Set());
  const [thresholdInput, setThresholdInput] = useState('');

  useEffect(() => {
    fetchGroups();
  }, []);

  useEffect(() => {
    fetchReport();
  }, [selectedGroup]);

  const fetchGroups = async () => {
    try {
      const res = await axios.get(`${API}/groups`);
      setGroups(res.data || []);
    } catch (error) {
      console.error('Error loading groups:', error);
    }
  };

  const fetchReport = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedGroup !== 'all') params.append('group_id', selectedGroup);
      if (daysOverride) params.append('days', daysOverride);
      const res = await axios.get(`${API}/reports/struggling-students?${params.toString()}`);
      setReport(res.data || { students: [], count: 0, default_days: 2 });
      setSelected(new Set());
    } catch (error) {
      console.error('Error loading report:', error);
      toast.error('فشل في تحميل التقرير');
    } finally {
      setLoading(false);
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
      const res = await axios.post(`${API}/reports/struggling-students/alert`, { student_ids: ids });
      toast.success(res.data.message || 'تم إرسال التنبيهات');
      setSelected(new Set());
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في إرسال التنبيهات');
    }
  };

  const saveThreshold = async () => {
    if (selectedGroup === 'all') { toast.error('اختر مجموعة أولاً'); return; }
    const d = parseInt(thresholdInput);
    if (!d || d < 1) { toast.error('أدخل عدد أيام صحيح'); return; }
    try {
      await axios.put(`${API}/groups/${selectedGroup}/alert-days`, { days: d });
      toast.success(`تم ضبط مدة التنبيه على ${d} يوم`);
      setThresholdInput('');
      fetchReport();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في حفظ المدة');
    }
  };

  const daysBadge = (s) => {
    if (s.days_since === null || s.days_since === undefined) {
      return <span className="text-xs px-2 py-1 rounded-full bg-red-500/20 text-red-400">لم يسمّع مطلقًا</span>;
    }
    return <span className="text-xs px-2 py-1 rounded-full bg-amber-500/20 text-amber-400">{s.days_since} يوم</span>;
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className={`p-6 rounded-xl ${isDark ? 'glass-card border border-white/10' : 'bg-white border border-slate-200 shadow-sm'}`}>
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
                طلاب مرّ عليهم أيام دون تسجيل تسميع
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <select
              value={selectedGroup}
              onChange={(e) => setSelectedGroup(e.target.value)}
              className={`p-2 rounded-lg border ${isDark ? 'bg-slate-800 border-white/10 text-white' : 'bg-white border-slate-300'}`}
            >
              <option value="all">كل المجموعات</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min="1"
                placeholder={`المدة (افتراضي ${report.default_days})`}
                value={daysOverride}
                onChange={(e) => setDaysOverride(e.target.value)}
                className={`w-40 ${isDark ? 'bg-slate-800 border-white/10 text-white' : ''}`}
              />
              <Button onClick={fetchReport} variant="outline" className={isDark ? 'border-white/10 text-white hover:bg-white/5' : ''}>
                <Clock className="w-4 h-4 ml-1" /> تطبيق
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Threshold editor (per group) */}
      {selectedGroup !== 'all' && (
        <Card className={isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'}>
          <CardContent className="p-4 flex items-center gap-3 flex-wrap">
            <span className={`text-sm ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
              مدة التنبيه لهذه المجموعة (بالأيام):
            </span>
            <Input
              type="number"
              min="1"
              placeholder="مثال: 2"
              value={thresholdInput}
              onChange={(e) => setThresholdInput(e.target.value)}
              className={`w-28 ${isDark ? 'bg-slate-800 border-white/10 text-white' : ''}`}
            />
            <Button onClick={saveThreshold} className="bg-emerald-600 hover:bg-emerald-700">
              <Save className="w-4 h-4 ml-1" /> حفظ المدة
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Summary + bulk actions */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <Card className={`${isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'} flex-1 min-w-[200px]`}>
          <CardContent className="p-4 flex items-center gap-3">
            <Users className="w-8 h-8 text-amber-400" />
            <div>
              <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>عدد المتعثّرين</p>
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

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : report.students.length === 0 ? (
        <Card className={isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'}>
          <CardContent className="p-12 text-center">
            <p className={isDark ? 'text-slate-400' : 'text-slate-600'}>لا يوجد طلاب متعثّرون 🎉</p>
          </CardContent>
        </Card>
      ) : (
        <Card className={isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'}>
          <CardHeader className="pb-2">
            <CardTitle className={`text-base flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
              <label className="flex items-center gap-2 cursor-pointer text-sm font-normal">
                <input type="checkbox" checked={selected.size === report.students.length && report.students.length > 0} onChange={toggleSelectAll} />
                تحديد الكل
              </label>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {report.students.map((s) => (
                <div key={s.student_id} className={`p-3 rounded-lg flex items-center justify-between gap-3 ${isDark ? 'bg-slate-800/50' : 'bg-slate-50'}`}>
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <input type="checkbox" checked={selected.has(s.student_id)} onChange={() => toggleSelect(s.student_id)} />
                    <div className="min-w-0">
                      <p className={`font-medium text-sm ${isDark ? 'text-white' : 'text-slate-900'}`}>{s.name}</p>
                      <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        {s.group_name} · آخر تسميع: {s.last_recitation || '—'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {daysBadge(s)}
                    <Button size="sm" variant="ghost" onClick={() => sendAlerts([s.student_id])} className="text-amber-400 hover:bg-amber-500/10">
                      <BellRing className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default StrugglingStudents;
