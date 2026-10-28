import { useState, useEffect } from 'react';
import axios from 'axios';
import { useTheme } from '../context/ThemeContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';
import { Table2, FileDown, ArrowUpNarrowWide, ArrowDownWideNarrow } from 'lucide-react';
import { SCHOOL_GRADES } from '../lib/constants';
import { formatDate as fmtDate } from '../lib/utils';
import { PRAYERS, formatMinutes } from '../lib/trackingWeek';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// الفلتر الثاني: حقول الترتيب/الإحصائيات
const SORT_FIELDS = [
  { key: 'name', label: 'الاسم' },
  { key: 'total_memorization', label: 'الحفظ الكلي' },
  { key: 'new_memorization', label: 'الحفظ الجديد' },
  { key: 'review', label: 'المراجعة' },
  { key: 'attendance', label: 'أيام الحضور' },
  { key: 'tracking', label: 'عدد أوراق المتابعة' },
  { key: 'tracking_prayers', label: 'الصلوات (المجموع)' },
  ...PRAYERS.map((p) => ({ key: `tracking_${p.key}`, label: `صلاة ${p.label}` })),
  { key: 'tracking_sitting', label: 'الجلوس مع القرآن (أيام)' },
  { key: 'tracking_quran_minutes', label: 'ساعات الجلوس مع القرآن' },
  { key: 'age', label: 'العمر' },
  { key: 'grade', label: 'الصف' },
  { key: 'average', label: 'المعدل' },
  { key: 'admin_tested_juz', label: 'المختبَرة إداريًا (المفصل الإداري)' },
  { key: 'annual_score', label: 'علامة المسابقة السنوية' },
];

// مدى احتساب أعمدة ورق المتابعة
const TRACKING_PERIODS = [
  { key: 'week', label: 'الأسبوع' },
  { key: 'month', label: 'الشهر' },
  { key: 'term', label: 'الفصل' },
];

// فلتر المشاركة في المسابقات (من التقييم الأولي)
const COMPETITION_FILTERS = [
  { key: 'all', label: 'الكل' },
  { key: 'annual', label: '🏆 المسابقة السنوية' },
  { key: 'young', label: '⭐ الحافظ الصغير' },
  { key: 'any', label: 'أي مسابقة' },
  { key: 'none', label: 'بدون مشاركة' },
];

const StudentStats = () => {
  const { isDark } = useTheme();
  const [groups, setGroups] = useState([]);
  const [groupId, setGroupId] = useState('all');   // الفلتر الأول: المجموعة
  const [studentId, setStudentId] = useState('all'); // الفلتر الأول: الطالب
  const [gradeFilter, setGradeFilter] = useState('all'); // #4 فلتر الصف
  const [minAverage, setMinAverage] = useState(''); // فلتر: المعدل من (الحد الأدنى)
  const [sortBy, setSortBy] = useState('total_memorization'); // الفلتر الثاني
  const [order, setOrder] = useState('desc');       // الفلتر الثالث
  const [trackingPeriod, setTrackingPeriod] = useState('term'); // مدى أعمدة ورق المتابعة
  const [competition, setCompetition] = useState('all'); // فلتر المسابقات
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get(`${API}/groups`).then((r) => setGroups(r.data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    fetchRows();
    // eslint-disable-next-line
  }, [groupId, sortBy, order, trackingPeriod, competition]);

  const params = (withStudent) => {
    const p = new URLSearchParams();
    if (groupId !== 'all') p.append('group_id', groupId);
    if (withStudent && studentId !== 'all') p.append('student_id', studentId);
    p.append('sort_by', sortBy);
    p.append('order', order);
    p.append('tracking_period', trackingPeriod);
    if (competition !== 'all') p.append('competition', competition);
    return p.toString();
  };

  const fetchRows = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/reports/student-stats?${params(false)}`);
      setRows(res.data.rows || []);
    } catch (e) {
      console.error(e);
      toast.error('فشل في تحميل الجدول');
    } finally {
      setLoading(false);
    }
  };

  const onGroupChange = (v) => { setGroupId(v); setStudentId('all'); };

  const downloadExcel = async () => {
    try {
      const res = await axios.get(`${API}/export/student-stats?${params(true)}`, { responseType: 'blob' });
      const link = document.createElement('a');
      link.href = window.URL.createObjectURL(new Blob([res.data]));
      link.download = 'احصائيات_الطلاب.xlsx';
      link.click();
      toast.success('تم تحميل الملف');
    } catch (e) { toast.error('فشل في التحميل'); }
  };

  const displayed = rows
    .filter((r) => studentId === 'all' || r.student_id === studentId)
    .filter((r) => gradeFilter === 'all' || (r.grade || '') === gradeFilter)
    .filter((r) => minAverage === '' || (r.average != null && r.average >= parseFloat(minAverage)));

  const th = 'p-2 whitespace-nowrap';
  const activeCol = (k) => (sortBy === k ? (isDark ? 'text-emerald-400' : 'text-emerald-600') : '');

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className={`p-6 rounded-xl ${isDark ? 'glass-card border border-white/10' : 'bg-white border border-slate-200 shadow-sm'}`}>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center"><Table2 className="w-6 h-6 text-emerald-400" /></div>
          <div>
            <h1 className={`text-xl md:text-2xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>جدول إحصائيات الطلاب</h1>
            <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>تصفية حسب المجموعة والطالب · ترتيب حسب أي إحصائية · تصدير Excel</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <Card className={isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'}>
        <CardContent className="p-4 flex flex-wrap items-end gap-4">
          {/* الفلتر الأول: المجموعة + الطالب */}
          <div>
            <label className={`block text-xs mb-1 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>المجموعة</label>
            <select value={groupId} onChange={(e) => onGroupChange(e.target.value)} className={`p-2 rounded-lg border text-sm ${isDark ? 'bg-slate-800 border-white/10 text-white' : 'bg-white border-slate-300'}`}>
              <option value="all">كل المجموعات</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
          <div>
            <label className={`block text-xs mb-1 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>الطالب</label>
            <select value={studentId} onChange={(e) => setStudentId(e.target.value)} className={`p-2 rounded-lg border text-sm ${isDark ? 'bg-slate-800 border-white/10 text-white' : 'bg-white border-slate-300'}`}>
              <option value="all">كل الطلاب</option>
              {rows.map((r) => <option key={r.student_id} value={r.student_id}>{r.name}</option>)}
            </select>
          </div>
          {/* #4 فلتر الصف */}
          <div>
            <label className={`block text-xs mb-1 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>الصف</label>
            <select value={gradeFilter} onChange={(e) => setGradeFilter(e.target.value)} className={`p-2 rounded-lg border text-sm ${isDark ? 'bg-slate-800 border-white/10 text-white' : 'bg-white border-slate-300'}`}>
              <option value="all">كل الصفوف</option>
              {SCHOOL_GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          {/* فلتر المعدل (الحد الأدنى) */}
          <div>
            <label className={`block text-xs mb-1 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>المعدل من (%)</label>
            <input
              type="text" inputMode="numeric" placeholder="مثال: 85"
              value={minAverage}
              onChange={(e) => setMinAverage(e.target.value.replace(/[^0-9.]/g, ''))}
              className={`p-2 rounded-lg border text-sm w-24 ${isDark ? 'bg-slate-800 border-white/10 text-white' : 'bg-white border-slate-300'}`}
            />
          </div>
          {/* الفلتر الثاني: الترتيب حسب */}
          <div>
            <label className={`block text-xs mb-1 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>الترتيب حسب</label>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className={`p-2 rounded-lg border text-sm ${isDark ? 'bg-slate-800 border-white/10 text-white' : 'bg-white border-slate-300'}`}>
              {SORT_FIELDS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
            </select>
          </div>
          {/* فلتر المسابقات */}
          <div>
            <label className={`block text-xs mb-1 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>المسابقات</label>
            <select
              value={competition}
              onChange={(e) => setCompetition(e.target.value)}
              className={`p-2 rounded-lg border text-sm ${isDark ? 'bg-slate-800 border-white/10 text-white' : 'bg-white border-slate-300'}`}
            >
              {COMPETITION_FILTERS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </div>
          {/* مدى أعمدة ورق المتابعة */}
          <div>
            <label className={`block text-xs mb-1 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>ورق المتابعة خلال</label>
            <div className={`inline-flex rounded-lg border overflow-hidden ${isDark ? 'border-white/10' : 'border-slate-300'}`}>
              {TRACKING_PERIODS.map((p) => (
                <button
                  key={p.key}
                  onClick={() => setTrackingPeriod(p.key)}
                  className={`px-3 py-2 text-sm transition-colors ${
                    trackingPeriod === p.key
                      ? 'bg-emerald-600 text-white'
                      : isDark ? 'bg-slate-800 text-slate-300 hover:bg-white/5' : 'bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          {/* الفلتر الثالث: تصاعدي/تنازلي */}
          <div>
            <label className={`block text-xs mb-1 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>الاتجاه</label>
            <Button variant="outline" onClick={() => setOrder(order === 'asc' ? 'desc' : 'asc')} className={isDark ? 'border-white/10 text-white hover:bg-white/5' : ''}>
              {order === 'asc' ? <><ArrowUpNarrowWide className="w-4 h-4 ml-1" />تصاعدي</> : <><ArrowDownWideNarrow className="w-4 h-4 ml-1" />تنازلي</>}
            </Button>
          </div>
          <div className="mr-auto">
            <Button onClick={downloadExcel} className="bg-emerald-600 hover:bg-emerald-700"><FileDown className="w-4 h-4 ml-1" />تحميل Excel</Button>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className={isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'}>
        <CardHeader className="pb-2"><CardTitle className={`text-base ${isDark ? 'text-white' : 'text-slate-900'}`}>{displayed.length} طالب</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center h-32"><div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" /></div>
          ) : displayed.length === 0 ? (
            <p className={`text-center py-8 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>لا توجد بيانات</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-right">
                <thead>
                  <tr className={isDark ? 'text-slate-400' : 'text-slate-600'}>
                    <th className={th}>#</th>
                    <th className={th}>الطالب</th>
                    <th className={th}>المجموعة</th>
                    <th className={`${th} ${activeCol('total_memorization')}`}>الحفظ الكلي</th>
                    <th className={`${th} ${activeCol('new_memorization')}`}>الحفظ الجديد</th>
                    <th className={`${th} ${activeCol('review')}`}>المراجعة</th>
                    <th className={`${th} ${activeCol('attendance')}`}>أيام الحضور</th>
                    <th className={`${th} ${activeCol('tracking')}`}>أوراق المتابعة</th>
                    <th className={`${th} ${activeCol('tracking_prayers')}`}>🕌 الصلوات</th>
                    {PRAYERS.map((p) => (
                      <th key={p.key} className={`${th} ${activeCol(`tracking_${p.key}`)}`}>{p.label}</th>
                    ))}
                    <th className={`${th} ${activeCol('tracking_sitting')}`}>📖 أيام الجلوس</th>
                    <th className={`${th} ${activeCol('tracking_quran_minutes')}`}>📖 ساعات الجلوس</th>
                    <th className={th}>آخر ورقة</th>
                    <th className={th}>🏆 المسابقات</th>
                    <th className={`${th} ${activeCol('admin_tested_juz')}`}>المختبَرة إداريًا</th>
                    <th className={`${th} ${activeCol('annual_score')}`}>علامة المسابقة السنوية</th>
                    <th className={`${th} ${activeCol('age')}`}>العمر</th>
                    <th className={`${th} ${activeCol('grade')}`}>الصف</th>
                    <th className={`${th} ${activeCol('average')}`}>المعدل</th>
                  </tr>
                </thead>
                <tbody>
                  {displayed.map((r, i) => (
                    <tr key={r.student_id} className={`border-t ${isDark ? 'border-white/5' : 'border-slate-100'}`}>
                      <td className="p-2">{i + 1}</td>
                      <td className={`p-2 font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>{r.name}</td>
                      <td className="p-2">{r.group_name}</td>
                      <td className={`p-2 ${activeCol('total_memorization')}`}>{r.total_memorization}</td>
                      <td className={`p-2 ${activeCol('new_memorization')}`}>{r.new_memorization}</td>
                      <td className={`p-2 ${activeCol('review')}`}>{r.review}</td>
                      <td className={`p-2 ${activeCol('attendance')}`}>{r.attendance} يوم</td>
                      <td className={`p-2 ${activeCol('tracking')}`}>{r.tracking}</td>
                      <td className={`p-2 ${activeCol('tracking_prayers')}`}>{r.tracking_prayers ?? 0}</td>
                      {PRAYERS.map((p) => (
                        <td key={p.key} className={`p-2 ${activeCol(`tracking_${p.key}`)}`}>{r[`tracking_${p.key}`] ?? 0}</td>
                      ))}
                      <td className={`p-2 ${activeCol('tracking_sitting')}`}>{r.tracking_sitting ?? 0}</td>
                      <td dir="ltr" className={`p-2 text-right ${activeCol('tracking_quran_minutes')}`}>{formatMinutes(r.tracking_quran_minutes)}</td>
                      <td className="p-2">
                        {r.last_sheet?.week_start ? (
                          <span className={isDark ? 'text-slate-300' : 'text-slate-700'}>{fmtDate(r.last_sheet.week_start)}</span>
                        ) : (
                          <span className={isDark ? 'text-slate-600' : 'text-slate-400'}>لم يسلّم</span>
                        )}
                      </td>
                      <td className="p-2">
                        {(r.annual_competition || r.young_hafiz) ? (
                          <div className="flex flex-col gap-0.5">
                            {r.annual_competition && (
                              <span className="text-[11px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 whitespace-nowrap"
                                    title={`المسابقة السنوية — أجزاء: ${(r.annual_competition_juz || []).join('، ')}`}>
                                🏆 سنوية ({(r.annual_competition_juz || []).length})
                              </span>
                            )}
                            {r.young_hafiz && (
                              <span className="text-[11px] px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-400 whitespace-nowrap"
                                    title={`الحافظ الصغير — أجزاء: ${(r.young_hafiz_juz || []).join('، ')}`}>
                                ⭐ الحافظ الصغير ({(r.young_hafiz_juz || []).length})
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className={isDark ? 'text-slate-600' : 'text-slate-400'}>—</span>
                        )}
                      </td>
                      <td className={`p-2 ${activeCol('admin_tested_juz')}`}>{r.admin_tested_juz ? `${r.admin_tested_juz} جزء` : '—'}</td>
                      <td className={`p-2 ${activeCol('annual_score')}`} title={r.annual_year ? `سنة ${r.annual_year}` : undefined}>{r.annual_score ?? '—'}</td>
                      <td className={`p-2 ${activeCol('age')}`}>{r.age ?? '—'}</td>
                      <td className={`p-2 ${activeCol('grade')}`}>{r.grade || '—'}</td>
                      <td className={`p-2 ${activeCol('average')}`}>{r.average != null ? `${r.average}%` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className={`text-xs mt-3 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                الأرقام بالصفحات (الحفظ الكلي/الجديد/المراجعة).
                {' '}أعمدة ورق المتابعة (الأوراق/الصلوات/كل صلاة/الجلوس) محسوبة خلال{' '}
                <strong>{TRACKING_PERIODS.find((p) => p.key === trackingPeriod)?.label}</strong>؛
                يعرض عمود «آخر ورقة» أسبوع آخر ورقة مُسلَّمة بغضّ النظر عن المدة.
                {' '}أعمدة كل صلاة وساعات الجلوس تُحسب من الجدول اليومي (الأوراق القديمة المسجّلة بالأعداد تدخل في المجموع فقط).
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default StudentStats;
