import { useState, useEffect } from 'react';
import axios from 'axios';
import { useTheme } from '../context/ThemeContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend
} from 'recharts';
import { BarChart3, UserCheck, BookOpen, TrendingUp, Trophy, AlertTriangle, ClipboardList, Layers } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// T1 + T5 - تحليلات المشرف (مقصورة على مجموعاته)
const SheikhAnalytics = () => {
  const { isDark } = useTheme();
  const [groups, setGroups] = useState([]);
  const [groupId, setGroupId] = useState('all');
  const [series, setSeries] = useState({ weeks: [], totals: {} });
  const [struggling, setStruggling] = useState(0);
  const [juz, setJuz] = useState(null);
  const [assign, setAssign] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get(`${API}/groups`).then((r) => setGroups(r.data || [])).catch(() => {});
  }, []);

  useEffect(() => { fetchAll(); /* eslint-disable-next-line */ }, [groupId]);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const gq = groupId !== 'all' ? `?group_id=${groupId}` : '';
      const [ts, st, jz, asg] = await Promise.all([
        axios.get(`${API}/analytics/timeseries${gq}`),
        axios.get(`${API}/reports/struggling-students${gq}`),
        axios.get(`${API}/reports/juz-classification${gq}`),
        axios.get(`${API}/sheikh/assignment-stats`),
      ]);
      setSeries(ts.data || { weeks: [], totals: {} });
      setStruggling(st.data?.count || 0);
      setJuz(jz.data || null);
      setAssign(asg.data || null);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const totals = series.totals || {};
  const chartData = (series.weeks || []).map((w) => ({ ...w, label: w.week_start ? w.week_start.slice(5) : '' }));
  const axisColor = isDark ? '#94a3b8' : '#475569';
  const gridColor = isDark ? 'rgba(148,163,184,0.15)' : 'rgba(100,116,139,0.15)';
  const tip = { backgroundColor: isDark ? '#0f172a' : '#fff', border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : '#e2e8f0'}`, borderRadius: 8, color: isDark ? '#fff' : '#0f172a' };

  const stat = (icon, label, value, color) => (
    <Card className={isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'}>
      <CardContent className="p-4 text-center">{icon}<p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>{label}</p><p className={`text-2xl font-bold ${color}`}>{value ?? 0}</p></CardContent>
    </Card>
  );
  const chartCard = (title, icon, child) => (
    <Card className={isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'}>
      <CardHeader className="pb-2"><CardTitle className={`text-base flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>{icon}{title}</CardTitle></CardHeader>
      <CardContent>{(series.weeks || []).length === 0 ? <p className={`text-center py-12 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>لا توجد بيانات كافية</p> : <ResponsiveContainer width="100%" height={240}>{child}</ResponsiveContainer>}</CardContent>
    </Card>
  );

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className={`p-6 rounded-xl ${isDark ? 'glass-card border border-white/10' : 'bg-white border border-slate-200 shadow-sm'}`}>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center"><BarChart3 className="w-6 h-6 text-emerald-400" /></div>
            <div>
              <h1 className={`text-xl md:text-2xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>تحليلاتي</h1>
              <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>اتجاهات مجموعاتي · الطلاب المتعثّرون · الواجبات والاختبارات</p>
            </div>
          </div>
          <select value={groupId} onChange={(e) => setGroupId(e.target.value)} className={`p-2 rounded-lg border text-sm ${isDark ? 'bg-slate-800 border-white/10 text-white' : 'bg-white border-slate-300'}`}>
            <option value="all">كل مجموعاتي</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {stat(<UserCheck className="w-8 h-8 mx-auto text-emerald-400 mb-2" />, 'إجمالي الحضور', totals.attendance_present, 'text-emerald-400')}
            {stat(<BookOpen className="w-8 h-8 mx-auto text-blue-400 mb-2" />, 'عدد التسميعات', totals.recitations, 'text-blue-400')}
            {stat(<TrendingUp className="w-8 h-8 mx-auto text-purple-400 mb-2" />, 'الصفحات المحفوظة', totals.new_pages, 'text-purple-400')}
            {stat(<AlertTriangle className="w-8 h-8 mx-auto text-amber-400 mb-2" />, 'طلاب متعثّرون', struggling, 'text-amber-400')}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {chartCard('الحضور أسبوعيًا', <UserCheck className="w-4 h-4 text-emerald-400" />, (
              <AreaChart data={chartData}><CartesianGrid strokeDasharray="3 3" stroke={gridColor} /><XAxis dataKey="label" stroke={axisColor} fontSize={12} /><YAxis stroke={axisColor} fontSize={12} allowDecimals={false} /><Tooltip contentStyle={tip} /><Area type="monotone" dataKey="attendance_present" name="حضور" stroke="#10b981" fill="#10b981" fillOpacity={0.2} /></AreaChart>
            ))}
            {chartCard('الصفحات المحفوظة أسبوعيًا', <TrendingUp className="w-4 h-4 text-purple-400" />, (
              <BarChart data={chartData}><CartesianGrid strokeDasharray="3 3" stroke={gridColor} /><XAxis dataKey="label" stroke={axisColor} fontSize={12} /><YAxis stroke={axisColor} fontSize={12} allowDecimals={false} /><Tooltip contentStyle={tip} /><Legend /><Bar dataKey="new_pages" name="حفظ جديد" fill="#8b5cf6" radius={[4, 4, 0, 0]} /><Bar dataKey="review_pages" name="مراجعة" fill="#3b82f6" radius={[4, 4, 0, 0]} /></BarChart>
            ))}
            {chartCard('التسميعات أسبوعيًا', <BookOpen className="w-4 h-4 text-blue-400" />, (
              <LineChart data={chartData}><CartesianGrid strokeDasharray="3 3" stroke={gridColor} /><XAxis dataKey="label" stroke={axisColor} fontSize={12} /><YAxis stroke={axisColor} fontSize={12} allowDecimals={false} /><Tooltip contentStyle={tip} /><Line type="monotone" dataKey="recitations" name="تسميعات" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} /></LineChart>
            ))}
            {juz && (
              <Card className={isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'}>
                <CardHeader className="pb-2"><CardTitle className={`text-base flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}><Layers className="w-4 h-4 text-purple-400" />تصنيف الأجزاء</CardTitle></CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <div className="text-center p-2 rounded-lg bg-emerald-500/10"><p className="text-xs text-slate-400">قوية</p><p className="text-lg font-bold text-emerald-400">{juz.totals.strong}</p></div>
                    <div className="text-center p-2 rounded-lg bg-red-500/10"><p className="text-xs text-slate-400">ضعيفة</p><p className="text-lg font-bold text-red-400">{juz.totals.weak}</p></div>
                  </div>
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={juz.by_juz}><CartesianGrid strokeDasharray="3 3" stroke={gridColor} /><XAxis dataKey="juz" stroke={axisColor} fontSize={9} /><YAxis stroke={axisColor} fontSize={11} allowDecimals={false} /><Tooltip contentStyle={tip} /><Bar dataKey="strong" name="قوي" fill="#10b981" /><Bar dataKey="weak" name="ضعيف" fill="#ef4444" /></BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}
          </div>

          {/* T5 - مؤشرات الواجبات والاختبارات */}
          {assign && (
            <Card className={isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'}>
              <CardHeader className="pb-2"><CardTitle className={`text-base flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}><ClipboardList className="w-4 h-4 text-blue-400" />الواجبات والاختبارات</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="text-center p-3 rounded-lg bg-blue-500/10"><p className="text-xs text-slate-400">نسبة تسليم الواجبات</p><p className="text-lg font-bold text-blue-400">{assign.homework.submission_rate}%</p><p className="text-xs text-slate-500">{assign.homework.submitted}/{assign.homework.total_assigned}</p></div>
                  <div className="text-center p-3 rounded-lg bg-emerald-500/10"><p className="text-xs text-slate-400">متوسط درجات الواجبات</p><p className="text-lg font-bold text-emerald-400">{assign.homework.avg_grade}</p></div>
                  <div className="text-center p-3 rounded-lg bg-purple-500/10"><p className="text-xs text-slate-400">متوسط درجات الاختبارات</p><p className="text-lg font-bold text-purple-400">{assign.exams.avg_score}%</p><p className="text-xs text-slate-500">{assign.exams.attempts} محاولة</p></div>
                  <div className="text-center p-3 rounded-lg bg-amber-500/10"><p className="text-xs text-slate-400">نسبة النجاح</p><p className="text-lg font-bold text-amber-400">{assign.exams.pass_rate}%</p></div>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
};

export default SheikhAnalytics;
