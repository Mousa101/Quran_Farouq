import { useState, useEffect } from 'react';
import axios from 'axios';
import { useTheme } from '../context/ThemeContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, AreaChart, Area
} from 'recharts';
import { TrendingUp, UserCheck, BookOpen, Trophy, BarChart3, Users, DollarSign, FileDown, Layers } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// A1/A2/A3/A5/A7 - لوحة تحليلات المدير مع مرشّح موحّد (الفصل/المجموعة)
const AdminAnalytics = () => {
  const { isDark } = useTheme();
  const [terms, setTerms] = useState([]);
  const [groups, setGroups] = useState([]);
  const [termId, setTermId] = useState('all');
  const [groupId, setGroupId] = useState('all');
  const [series, setSeries] = useState({ weeks: [], totals: {} });
  const [teachers, setTeachers] = useState([]);
  const [financial, setFinancial] = useState(null);
  const [juz, setJuz] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState('avg_points');

  useEffect(() => {
    const init = async () => {
      try {
        const [termsRes, groupsRes, activeRes] = await Promise.all([
          axios.get(`${API}/terms`),
          axios.get(`${API}/groups`),
          axios.get(`${API}/terms/active`).catch(() => ({ data: null })),
        ]);
        setTerms(termsRes.data || []);
        setGroups(groupsRes.data || []);
        setTermId(activeRes.data?.id || 'all');
      } catch (e) { console.error(e); setTermId('all'); }
    };
    init();
  }, []);

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line
  }, [termId, groupId]);

  const q = () => {
    const p = new URLSearchParams();
    if (termId !== 'all') p.append('term_id', termId);
    if (groupId !== 'all') p.append('group_id', groupId);
    return p.toString();
  };

  const fetchAll = async () => {
    setLoading(true);
    try {
      const termQ = termId !== 'all' ? `?term_id=${termId}` : '';
      const [ts, tch, fin, jz] = await Promise.all([
        axios.get(`${API}/analytics/timeseries?${q()}`),
        axios.get(`${API}/reports/teachers${termQ}`),
        axios.get(`${API}/reports/financial`),
        axios.get(`${API}/reports/juz-classification${groupId !== 'all' ? `?group_id=${groupId}` : ''}`),
      ]);
      setSeries(ts.data || { weeks: [], totals: {} });
      setTeachers(tch.data?.teachers || []);
      setFinancial(fin.data || null);
      setJuz(jz.data || null);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const download = async (url, name) => {
    try {
      const res = await axios.get(`${API}${url}`, { responseType: 'blob' });
      const link = document.createElement('a');
      link.href = window.URL.createObjectURL(new Blob([res.data]));
      link.download = name;
      link.click();
    } catch (e) { console.error(e); }
  };

  const totals = series.totals || {};
  const chartData = (series.weeks || []).map((w) => ({ ...w, label: w.week_start ? w.week_start.slice(5) : '' }));
  const axisColor = isDark ? '#94a3b8' : '#475569';
  const gridColor = isDark ? 'rgba(148,163,184,0.15)' : 'rgba(100,116,139,0.15)';
  const tip = { backgroundColor: isDark ? '#0f172a' : '#fff', border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : '#e2e8f0'}`, borderRadius: 8, color: isDark ? '#fff' : '#0f172a' };

  const sortedTeachers = [...teachers].sort((a, b) => (b[sortKey] || 0) - (a[sortKey] || 0));

  const stat = (icon, label, value, color) => (
    <Card className={isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'}>
      <CardContent className="p-4 text-center">
        {icon}
        <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>{label}</p>
        <p className={`text-2xl font-bold ${color}`}>{value ?? 0}</p>
      </CardContent>
    </Card>
  );

  const chartCard = (title, icon, child) => (
    <Card className={isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'}>
      <CardHeader className="pb-2"><CardTitle className={`text-base flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>{icon}{title}</CardTitle></CardHeader>
      <CardContent>
        {(series.weeks || []).length === 0 ? <p className={`text-center py-12 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>لا توجد بيانات كافية</p>
          : <ResponsiveContainer width="100%" height={240}>{child}</ResponsiveContainer>}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header + unified filter (A7) */}
      <div className={`p-6 rounded-xl ${isDark ? 'glass-card border border-white/10' : 'bg-white border border-slate-200 shadow-sm'}`}>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center"><BarChart3 className="w-6 h-6 text-emerald-400" /></div>
            <div>
              <h1 className={`text-xl md:text-2xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>التحليلات والتقارير</h1>
              <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>اتجاهات زمنية · مقارنة المشرفين · مالية · تصنيف الأجزاء</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <select value={termId} onChange={(e) => setTermId(e.target.value)} className={`p-2 rounded-lg border text-sm ${isDark ? 'bg-slate-800 border-white/10 text-white' : 'bg-white border-slate-300'}`}>
              <option value="all">كل الفصول</option>
              {terms.map((t) => <option key={t.id} value={t.id}>{t.name}{t.is_active ? ' (نشط)' : ''}</option>)}
            </select>
            <select value={groupId} onChange={(e) => setGroupId(e.target.value)} className={`p-2 rounded-lg border text-sm ${isDark ? 'bg-slate-800 border-white/10 text-white' : 'bg-white border-slate-300'}`}>
              <option value="all">كل المجموعات</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <>
          {/* A1 - totals + time series */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {stat(<UserCheck className="w-8 h-8 mx-auto text-emerald-400 mb-2" />, 'إجمالي الحضور', totals.attendance_present, 'text-emerald-400')}
            {stat(<BookOpen className="w-8 h-8 mx-auto text-blue-400 mb-2" />, 'عدد التسميعات', totals.recitations, 'text-blue-400')}
            {stat(<TrendingUp className="w-8 h-8 mx-auto text-purple-400 mb-2" />, 'الصفحات المحفوظة', totals.new_pages, 'text-purple-400')}
            {stat(<Trophy className="w-8 h-8 mx-auto text-amber-400 mb-2" />, 'النقاط المكتسبة', totals.points, 'text-amber-400')}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {chartCard('الحضور أسبوعيًا', <UserCheck className="w-4 h-4 text-emerald-400" />, (
              <AreaChart data={chartData}><CartesianGrid strokeDasharray="3 3" stroke={gridColor} /><XAxis dataKey="label" stroke={axisColor} fontSize={12} /><YAxis stroke={axisColor} fontSize={12} allowDecimals={false} /><Tooltip contentStyle={tip} /><Area type="monotone" dataKey="attendance_present" name="حضور" stroke="#10b981" fill="#10b981" fillOpacity={0.2} /></AreaChart>
            ))}
            {chartCard('الصفحات المحفوظة أسبوعيًا (سرعة الحفظ)', <TrendingUp className="w-4 h-4 text-purple-400" />, (
              <BarChart data={chartData}><CartesianGrid strokeDasharray="3 3" stroke={gridColor} /><XAxis dataKey="label" stroke={axisColor} fontSize={12} /><YAxis stroke={axisColor} fontSize={12} allowDecimals={false} /><Tooltip contentStyle={tip} /><Legend /><Bar dataKey="new_pages" name="حفظ جديد" fill="#8b5cf6" radius={[4, 4, 0, 0]} /><Bar dataKey="review_pages" name="مراجعة" fill="#3b82f6" radius={[4, 4, 0, 0]} /></BarChart>
            ))}
            {chartCard('النقاط المكتسبة أسبوعيًا', <Trophy className="w-4 h-4 text-amber-400" />, (
              <LineChart data={chartData}><CartesianGrid strokeDasharray="3 3" stroke={gridColor} /><XAxis dataKey="label" stroke={axisColor} fontSize={12} /><YAxis stroke={axisColor} fontSize={12} allowDecimals={false} /><Tooltip contentStyle={tip} /><Line type="monotone" dataKey="points" name="نقاط" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} /></LineChart>
            ))}
            {chartCard('التسميعات أسبوعيًا', <BookOpen className="w-4 h-4 text-blue-400" />, (
              <BarChart data={chartData}><CartesianGrid strokeDasharray="3 3" stroke={gridColor} /><XAxis dataKey="label" stroke={axisColor} fontSize={12} /><YAxis stroke={axisColor} fontSize={12} allowDecimals={false} /><Tooltip contentStyle={tip} /><Bar dataKey="recitations" name="تسميعات" fill="#3b82f6" radius={[4, 4, 0, 0]} /></BarChart>
            ))}
          </div>

          {/* A2 - teacher comparison */}
          <Card className={isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className={`text-base flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}><Users className="w-4 h-4 text-emerald-400" />مقارنة أداء المشرفين</CardTitle>
                <div className="flex items-center gap-2">
                  <select value={sortKey} onChange={(e) => setSortKey(e.target.value)} className={`p-1.5 rounded-lg border text-xs ${isDark ? 'bg-slate-800 border-white/10 text-white' : 'bg-white border-slate-300'}`}>
                    <option value="avg_points">ترتيب: متوسط النقاط</option>
                    <option value="attendance_rate">ترتيب: الحضور</option>
                    <option value="pages">ترتيب: الصفحات</option>
                    <option value="tracking_rate">ترتيب: تسليم المتابعة</option>
                  </select>
                  <Button size="sm" variant="outline" onClick={() => download(`/export/teachers${termId !== 'all' ? `?term_id=${termId}` : ''}`, 'teachers.xlsx')} className={isDark ? 'border-white/10 text-white hover:bg-white/5' : ''}><FileDown className="w-4 h-4 ml-1" />تصدير</Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {sortedTeachers.length === 0 ? <p className={`text-center py-6 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>لا يوجد مشرفون</p> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-right">
                    <thead><tr className={isDark ? 'text-slate-400' : 'text-slate-600'}>
                      <th className="p-2">#</th><th className="p-2">المشرف</th><th className="p-2">الطلاب</th><th className="p-2">الحضور</th><th className="p-2">التسميعات</th><th className="p-2">الصفحات</th><th className="p-2">متوسط النقاط</th><th className="p-2">تسليم المتابعة</th>
                    </tr></thead>
                    <tbody>
                      {sortedTeachers.map((t, i) => (
                        <tr key={t.id} className={`border-t ${isDark ? 'border-white/5' : 'border-slate-100'}`}>
                          <td className="p-2">{i + 1}</td>
                          <td className={`p-2 font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>{t.name}</td>
                          <td className="p-2">{t.students}</td>
                          <td className="p-2">{t.attendance_rate}%</td>
                          <td className="p-2">{t.recitations}</td>
                          <td className="p-2">{t.pages}</td>
                          <td className="p-2 text-amber-400 font-bold">{t.avg_points}</td>
                          <td className="p-2">{t.tracking_rate}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* A5 - financial analytics */}
          {financial && (
            <Card className={isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <CardTitle className={`text-base flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}><DollarSign className="w-4 h-4 text-emerald-400" />التحليلات المالية</CardTitle>
                  <Button size="sm" variant="outline" onClick={() => download('/export/groups-financial', 'financial.xlsx')} className={isDark ? 'border-white/10 text-white hover:bg-white/5' : ''}><FileDown className="w-4 h-4 ml-1" />تصدير</Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  <div className="text-center p-3 rounded-lg bg-blue-500/10"><p className="text-xs text-slate-400">الإجمالي</p><p className="text-lg font-bold text-blue-400">{financial.totals.total.toFixed(0)}</p></div>
                  <div className="text-center p-3 rounded-lg bg-emerald-500/10"><p className="text-xs text-slate-400">المحصّل</p><p className="text-lg font-bold text-emerald-400">{financial.totals.paid.toFixed(0)}</p></div>
                  <div className="text-center p-3 rounded-lg bg-amber-500/10"><p className="text-xs text-slate-400">المتبقّي</p><p className="text-lg font-bold text-amber-400">{(financial.totals.due + financial.totals.pending).toFixed(0)}</p></div>
                  <div className="text-center p-3 rounded-lg bg-purple-500/10"><p className="text-xs text-slate-400">نسبة التحصيل</p><p className="text-lg font-bold text-purple-400">{financial.totals.collection_rate}%</p></div>
                </div>
                <div className="space-y-2">
                  {financial.by_group.map((g) => (
                    <div key={g.group_id || 'none'} className={`p-2 rounded-lg ${isDark ? 'bg-slate-800/50' : 'bg-slate-50'}`}>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className={isDark ? 'text-white' : 'text-slate-900'}>{g.group_name}</span>
                        <span className="text-slate-400">{g.paid.toFixed(0)} / {g.total.toFixed(0)} · {g.collection_rate}%</span>
                      </div>
                      <div className={`h-2 rounded-full ${isDark ? 'bg-slate-700' : 'bg-slate-200'}`}><div className="h-2 rounded-full bg-emerald-500" style={{ width: `${g.collection_rate}%` }} /></div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* A3 - juz classification */}
          {juz && (
            <Card className={isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'}>
              <CardHeader className="pb-2"><CardTitle className={`text-base flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}><Layers className="w-4 h-4 text-purple-400" />تصنيف الأجزاء (من التقييم المبدئي · {juz.assessed_students}/{juz.total_students} مُقيَّم)</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="text-center p-3 rounded-lg bg-emerald-500/10"><p className="text-xs text-slate-400">أجزاء قوية</p><p className="text-lg font-bold text-emerald-400">{juz.totals.strong}</p></div>
                  <div className="text-center p-3 rounded-lg bg-red-500/10"><p className="text-xs text-slate-400">أجزاء ضعيفة</p><p className="text-lg font-bold text-red-400">{juz.totals.weak}</p></div>
                  <div className="text-center p-3 rounded-lg bg-amber-500/10"><p className="text-xs text-slate-400">الاختبار الإداري</p><p className="text-lg font-bold text-amber-400">{juz.totals.administrative}</p></div>
                </div>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={juz.by_juz}><CartesianGrid strokeDasharray="3 3" stroke={gridColor} /><XAxis dataKey="juz" stroke={axisColor} fontSize={10} /><YAxis stroke={axisColor} fontSize={12} allowDecimals={false} /><Tooltip contentStyle={tip} /><Legend /><Bar dataKey="strong" name="قوي" fill="#10b981" /><Bar dataKey="weak" name="ضعيف" fill="#ef4444" /></BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
};

export default AdminAnalytics;
