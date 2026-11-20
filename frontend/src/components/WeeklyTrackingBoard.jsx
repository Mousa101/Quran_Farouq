import { useState, useEffect } from 'react';
import axios from 'axios';
import { useTheme } from '../context/ThemeContext';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs';
import { ClipboardList, ChevronRight, ChevronLeft, Loader2 } from 'lucide-react';
import StudentLink from './StudentLink';
import { formatDate as fmtDate } from '../lib/utils';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// إزاحة تاريخ YYYY-MM-DD بعدد أيام (بتوقيت UTC حتى ما ينزاح اليوم)
const shiftDate = (iso, days) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

// ورق المتابعة الأسبوعي بالأرقام — تبويب للمجموعات وتبويب للطلاب (لوحة المدير)
const WeeklyTrackingBoard = () => {
  const { isDark } = useTheme();
  const [weekStart, setWeekStart] = useState(null); // null = الأسبوع الحالي
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [groupId, setGroupId] = useState('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const fetchWeek = async () => {
      setLoading(true);
      try {
        const res = await axios.get(`${API}/admin/tracking-weekly`, {
          params: weekStart ? { week_start: weekStart } : {},
        });
        setData(res.data);
      } catch (error) {
        console.error('Error fetching weekly tracking:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchWeek();
  }, [weekStart]);

  const summary = data?.summary || {};
  const groups = data?.groups || [];
  const students = (data?.students || []).filter((s) =>
    (groupId === 'all' || s.group_id === groupId) &&
    (!search.trim() || s.student_name?.toLowerCase().includes(search.trim().toLowerCase()))
  );

  const th = `px-3 py-2 text-right text-xs font-medium whitespace-nowrap ${isDark ? 'text-slate-400' : 'text-slate-600'}`;
  const td = `px-3 py-2 text-sm whitespace-nowrap ${isDark ? 'text-slate-200' : 'text-slate-800'}`;
  const row = `border-b ${isDark ? 'border-white/5 hover:bg-white/5' : 'border-slate-100 hover:bg-slate-50'}`;
  const muted = isDark ? 'text-slate-500' : 'text-slate-400';

  const tiles = [
    { label: 'سلّموا الورقة', value: `${summary.submitted_count ?? 0} / ${summary.students_count ?? 0}`, color: 'text-emerald-400' },
    { label: 'مجموع الصلوات', value: summary.prayers_total ?? 0, color: 'text-blue-400' },
    { label: 'مجموع الجلوس مع القرآن', value: summary.sitting_total ?? 0, color: 'text-purple-400' },
    { label: 'مجموع النقاط', value: `${summary.points_total ?? 0} / ${summary.max_total ?? 0}`, color: 'text-amber-400' },
  ];

  return (
    <Card className={isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'}>
      <CardHeader className="p-3 md:p-6">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className={`flex items-center gap-2 text-sm md:text-base ${isDark ? 'text-white' : 'text-slate-900'}`}>
            <ClipboardList className="w-4 h-4 md:w-5 md:h-5 text-purple-400" />
            ورق المتابعة الأسبوعي
          </CardTitle>
          {/* التنقّل بين الأسابيع (السبت→الجمعة) */}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-slate-400 hover:text-emerald-400"
              onClick={() => data && setWeekStart(shiftDate(data.week_start, -7))}
              disabled={loading || !data}
              title="الأسبوع السابق"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
            <span className={`text-xs ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
              {data ? `${fmtDate(data.week_start)} — ${fmtDate(data.week_end)}` : '...'}
              {data?.is_current_week && <span className="text-emerald-400 mr-1">(الحالي)</span>}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-slate-400 hover:text-emerald-400"
              onClick={() => data && setWeekStart(shiftDate(data.week_start, 7))}
              disabled={loading || !data || data.is_current_week}
              title="الأسبوع التالي"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-3 md:p-6 pt-0">
        {loading && !data ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-emerald-400" />
          </div>
        ) : !data ? (
          <p className={`text-center py-4 text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>تعذّر تحميل ورق المتابعة</p>
        ) : (
          <div className={loading ? 'opacity-60' : ''}>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
              {tiles.map((t) => (
                <div key={t.label} className={`p-3 rounded-xl text-center border ${isDark ? 'bg-slate-800/40 border-white/10' : 'bg-slate-50 border-slate-200'}`}>
                  <p className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>{t.label}</p>
                  <p className={`text-lg font-bold ${t.color}`}>{t.value}</p>
                </div>
              ))}
            </div>

            <Tabs defaultValue="groups" dir="rtl">
              <TabsList className={isDark ? 'bg-slate-800' : 'bg-slate-100'}>
                <TabsTrigger value="groups">المجموعات ({groups.length})</TabsTrigger>
                <TabsTrigger value="students">الطلاب ({data.students.length})</TabsTrigger>
              </TabsList>

              <TabsContent value="groups">
                {groups.length === 0 ? (
                  <p className={`text-center py-4 text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>لا توجد مجموعات</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className={`border-b ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
                          <th className={th}>المجموعة</th>
                          <th className={th}>المشرف</th>
                          <th className={th}>سلّموا</th>
                          <th className={th}>الصلوات</th>
                          <th className={th}>الجلوس</th>
                          <th className={th}>بنود إضافية</th>
                          <th className={th}>النقاط</th>
                          <th className={th}>متوسط الطالب</th>
                        </tr>
                      </thead>
                      <tbody>
                        {groups.map((g) => (
                          <tr key={g.group_id} className={row}>
                            <td className={`${td} font-medium`}>{g.group_name}</td>
                            <td className={td}>{g.sheikh_name}</td>
                            <td className={td}>{g.submitted_count} <span className={muted}>/ {g.students_count}</span></td>
                            <td className={td}>{g.prayers_total}</td>
                            <td className={td}>{g.sitting_total}</td>
                            <td className={td}>{g.custom_total}</td>
                            <td className={`${td} font-bold text-emerald-400`}>{g.points_total} <span className={`font-normal ${muted}`}>/ {g.max_total}</span></td>
                            <td className={td}>{g.avg_points}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="students">
                <div className="flex flex-wrap gap-2 mb-3">
                  <Select value={groupId} onValueChange={setGroupId}>
                    <SelectTrigger className={`h-9 w-48 text-sm ${isDark ? 'bg-slate-800 border-slate-700 text-white' : ''}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">كل المجموعات</SelectItem>
                      {groups.map((g) => (
                        <SelectItem key={g.group_id} value={g.group_id}>{g.group_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="بحث باسم الطالب..."
                    className={`h-9 w-48 text-sm ${isDark ? 'bg-slate-800 border-slate-700 text-white' : ''}`}
                  />
                </div>
                {students.length === 0 ? (
                  <p className={`text-center py-4 text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>لا يوجد طلاب</p>
                ) : (
                  <div className="overflow-auto max-h-[28rem]">
                    <table className="w-full">
                      <thead>
                        <tr className={`border-b ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
                          <th className={th}>الطالب</th>
                          <th className={th}>المجموعة</th>
                          <th className={th}>الصلوات</th>
                          <th className={th}>الجلوس</th>
                          <th className={th}>بنود إضافية</th>
                          <th className={th}>النقاط</th>
                        </tr>
                      </thead>
                      <tbody>
                        {students.map((s) => (
                          <tr key={s.student_id} className={row}>
                            <td className={td}>
                              <StudentLink studentId={s.student_id} name={s.student_name} className={`font-medium ${isDark ? 'text-white' : 'text-slate-900'}`} />
                            </td>
                            <td className={td}>{s.group_name}</td>
                            {s.submitted ? (
                              <>
                                <td className={td}>{s.prayers}</td>
                                <td className={td}>{s.sitting}</td>
                                <td className={td}>{s.custom}</td>
                                <td className={`${td} font-bold text-emerald-400`}>{s.points} <span className={`font-normal ${muted}`}>/ {s.max_points}</span></td>
                              </>
                            ) : (
                              <td className={td} colSpan={4}>
                                <span className="text-xs px-2 py-1 rounded-full bg-amber-500/20 text-amber-400">لم يسلّم الورقة</span>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default WeeklyTrackingBoard;
