import { useEffect, useState } from 'react';
import axios from 'axios';
import { useTheme } from '../context/ThemeContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import StudentLink from '../components/StudentLink';
import { formatDate as fmtDate } from '../lib/utils';
import {
  LayoutGrid, Loader2, UserCheck, BookOpen, FileText, ChevronDown, ChevronUp, CheckCircle2, AlertCircle, XCircle, RefreshCw,
} from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const jordanToday = () => new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 10);

const STATUS = {
  done: { label: 'تم التسجيل', cls: 'bg-emerald-500/15 text-emerald-500', Icon: CheckCircle2 },
  partial: { label: 'تسجيل جزئي', cls: 'bg-amber-500/15 text-amber-500', Icon: AlertCircle },
  none: { label: 'لم يُسجَّل بعد', cls: 'bg-red-500/15 text-red-500', Icon: XCircle },
  empty: { label: 'بلا طلاب', cls: 'bg-slate-500/15 text-slate-400', Icon: AlertCircle },
};

const ATT_LABEL = { present: 'حاضر', absent: 'غائب', excused: 'معذور', late: 'متأخر' };

// نظرة عامة على المجموعات: الحضور والتسميع لكل مجموعة في يوم محدد، ومن سجّل.
// تسجيل المشرف أو مساعده أو المدير يكفي للمجموعة. يوم السبت تظهر ورقة المتابعة.
const GroupsOverview = () => {
  const { isDark } = useTheme();
  const [date, setDate] = useState(jordanToday());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState({});

  const load = async (d = date) => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/reports/groups-overview`, { params: { date: d } });
      setData(res.data);
    } catch (e) {
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(date); }, [date]);

  const muted = isDark ? 'text-slate-400' : 'text-slate-600';
  const strong = isDark ? 'text-white' : 'text-slate-900';
  const cardCls = isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200';
  const t = data?.totals || {};

  const Stat = ({ icon: Icon, label, value, color }) => (
    <div className={`rounded-xl p-3 border ${isDark ? 'border-white/10 bg-white/5' : 'border-slate-200 bg-slate-50'}`}>
      <div className={`flex items-center gap-2 text-xs ${muted}`}><Icon className={`w-4 h-4 ${color}`} />{label}</div>
      <div className={`text-xl font-bold mt-1 ${strong}`}>{value}</div>
    </div>
  );

  return (
    <div className="space-y-4" dir="rtl" data-testid="groups-overview-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className={`text-2xl font-bold flex items-center gap-2 ${strong}`}>
          <LayoutGrid className="w-6 h-6 text-emerald-500" />
          نظرة عامة على المجموعات
        </h1>
        <div className="flex items-center gap-2">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" data-testid="overview-date" />
          <Button variant="outline" size="sm" onClick={() => setDate(jordanToday())}>اليوم</Button>
          <Button variant="ghost" size="icon" onClick={() => load()} title="تحديث"><RefreshCw className="w-4 h-4" /></Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-emerald-500" /></div>
      ) : !data ? (
        <p className={`text-center py-10 ${muted}`}>تعذّر تحميل البيانات</p>
      ) : (
        <>
          <p className={`text-sm ${muted}`}>
            يوم {data.day_name || ''} {fmtDate(data.date)}
            {!data.is_lesson_day && <span className="text-amber-500 mr-2">— ليس من أيام الدوام حسب الجدول</span>}
            {data.is_saturday && <span className="text-emerald-500 mr-2">— دوام السبت: تظهر ورقة المتابعة</span>}
          </p>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Stat icon={LayoutGrid} label="مجموعات سُجّلت بالكامل" value={`${t.groups_done || 0} / ${t.groups || 0}`} color="text-emerald-500" />
            <Stat icon={XCircle} label="مجموعات لم تُسجَّل" value={t.groups_none || 0} color="text-red-500" />
            <Stat icon={UserCheck} label="الحضور" value={`${t.present || 0} / ${t.students || 0}`} color="text-blue-500" />
            <Stat icon={BookOpen} label="سمّعوا" value={t.recited || 0} color="text-purple-500" />
            {<Stat icon={FileText} label="سلّموا ورقة المتابعة" value={`${t.tracking_sheets || 0} / ${t.students || 0}`} color="text-amber-500" />}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {data.groups.map((g) => {
              const st = STATUS[g.status] || STATUS.none;
              const isOpen = open[g.group_id] !== false; // الطلاب ظاهرون افتراضيًا
              return (
                <Card key={g.group_id} className={cardCls} data-testid={`overview-group-${g.group_id}`}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <CardTitle className={`text-lg ${strong}`}>{g.group_name}</CardTitle>
                        <p className={`text-xs mt-1 ${muted}`}>
                          {[...g.sheikhs.map((s, i) => `${s.name}${i === 0 ? '' : ' (مساعد)'}`), ...(g.assistants || []).map((a) => `${a.name} (طالب مساعد)`)].join('، ') || 'بلا مشرف'} · {g.students_count} طالب
                        </p>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded-full flex items-center gap-1 whitespace-nowrap ${st.cls}`}>
                        <st.Icon className="w-3.5 h-3.5" />{st.label}
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className={`rounded-lg p-2 ${isDark ? 'bg-blue-500/10' : 'bg-blue-50'}`}>
                        <div className="text-xs text-blue-500 flex items-center justify-center gap-1"><UserCheck className="w-3.5 h-3.5" />الحضور</div>
                        <div className={`font-bold ${strong}`}>{g.present} / {g.students_count}</div>
                        <div className={`text-[11px] ${muted}`}>غائب {g.absent} · معذور {g.excused}</div>
                      </div>
                      <div className={`rounded-lg p-2 ${isDark ? 'bg-purple-500/10' : 'bg-purple-50'}`}>
                        <div className="text-xs text-purple-500 flex items-center justify-center gap-1"><BookOpen className="w-3.5 h-3.5" />التسميع</div>
                        <div className={`font-bold ${strong}`}>{g.recited} / {g.students_count}</div>
                        <div className={`text-[11px] ${muted}`}>لم يسمّع {g.not_recited}</div>
                      </div>
                      <div className={`rounded-lg p-2 ${isDark ? 'bg-amber-500/10' : 'bg-amber-50'}`}>
                        <div className="text-xs text-amber-500 flex items-center justify-center gap-1"><FileText className="w-3.5 h-3.5" />ورقة المتابعة</div>
                        <div className={`font-bold ${strong}`}>{g.tracking_sheets} / {g.students_count}</div>
                        <div className={`text-[11px] ${muted}`}>هذا الأسبوع</div>
                      </div>
                    </div>
                    <p className={`text-xs ${muted}`}>
                      سجّل: {g.recorded_by.length ? g.recorded_by.map((u) => `${u.name}${u.role ? ` (${u.role})` : ''}`).join('، ') : '—'}
                    </p>
                    {g.students_count > 0 && (
                      <button type="button" onClick={() => setOpen((o) => ({ ...o, [g.group_id]: !isOpen }))}
                        className="text-xs text-emerald-500 flex items-center gap-1">
                        {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        {isOpen ? 'إخفاء الطلاب' : 'عرض الطلاب'}
                      </button>
                    )}
                    {isOpen && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className={`border-b ${isDark ? 'border-white/10' : 'border-slate-200'} ${muted}`}>
                              <th className="py-1 text-right font-medium">الطالب</th>
                              <th className="py-1 text-right font-medium">الحضور</th>
                              <th className="py-1 text-right font-medium">التسميع</th>
                              <th className="py-1 text-right font-medium">الجديد</th>
                              <th className="py-1 text-right font-medium">المراجعة</th>
                              <th className="py-1 text-right font-medium">ورقة المتابعة</th>
                            </tr>
                          </thead>
                          <tbody>
                            {g.students.map((s) => (
                              <tr key={s.student_id} className={`border-b align-top ${isDark ? 'border-white/5' : 'border-slate-100'}`}>
                                <td className="py-1.5"><StudentLink studentId={s.student_id} name={s.name} /></td>
                                <td className={`py-1.5 whitespace-nowrap ${s.attendance === 'present' ? 'text-emerald-500' : s.attendance ? 'text-red-400' : muted}`}>
                                  {s.attendance ? (ATT_LABEL[s.attendance] || s.attendance) : 'لم يُسجَّل'}
                                </td>
                                <td className={`py-1.5 whitespace-nowrap ${s.recited ? 'text-emerald-500' : 'text-red-400'}`}>
                                  {s.recited ? 'سمّع' : 'لم يسمّع'}
                                </td>
                                <td className={`py-1.5 whitespace-nowrap ${muted}`}>
                                  {s.new_pages ? `${s.new_pages} ص${s.new_juz?.length ? ` · ج ${s.new_juz.join('، ')}` : ''}` : '—'}
                                </td>
                                <td className={`py-1.5 whitespace-nowrap ${muted}`}>
                                  {s.review_pages ? `${s.review_pages} ص${s.review_juz?.length ? ` · ج ${s.review_juz.join('، ')}` : ''}` : '—'}
                                </td>
                                <td className={`py-1.5 whitespace-nowrap ${s.sheet ? 'text-emerald-500' : 'text-red-400'}`}>
                                  {s.sheet ? 'سلّم' : 'لم يسلّم'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
          {data.groups.length === 0 && <p className={`text-center py-10 ${muted}`}>لا توجد مجموعات</p>}
        </>
      )}
    </div>
  );
};

export default GroupsOverview;
