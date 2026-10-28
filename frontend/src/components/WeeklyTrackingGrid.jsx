import { Checkbox } from './ui/checkbox';
import { useTheme } from '../context/ThemeContext';
import {
  PRAYERS, WEEK_DAYS, QURAN_SITTING_MIN_MINUTES, SITTING_POINTS_PER_DAY,
  normalizeDaily, dateOfWeekDay, dailyTotals, formatMinutes,
} from '../lib/trackingWeek';

// مدة الجلوس مع القرآن: ساعات : دقائق
const DurationInput = ({ minutes, onChange, isDark }) => {
  const h = Math.floor((minutes || 0) / 60);
  const m = (minutes || 0) % 60;
  const cls = `w-11 h-10 text-base sm:w-9 sm:h-8 sm:text-sm text-center rounded-md border ${isDark ? 'bg-slate-700 border-white/10 text-white' : 'bg-white border-slate-300'}`;
  const digits = (v, max) => Math.min(parseInt(v.replace(/[^0-9]/g, ''), 10) || 0, max);
  return (
    <div dir="ltr" className="inline-flex items-center gap-0.5">
      <input
        type="text" inputMode="numeric" aria-label="الساعات" placeholder="0"
        value={h === 0 ? '' : h}
        onChange={(e) => onChange(digits(e.target.value, 24) * 60 + m)}
        className={cls}
      />
      <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>:</span>
      <input
        type="text" inputMode="numeric" aria-label="الدقائق" placeholder="00"
        value={m === 0 ? '' : m}
        onChange={(e) => onChange(Math.min(h * 60 + digits(e.target.value, 59), 24 * 60))}
        className={cls}
      />
    </div>
  );
};

/**
 * ورقة المتابعة الإيمانية بنفس شكل الورقة المطبوعة:
 * اليوم | الفجر | الظهر | العصر | المغرب | العشاء | الجلوس مع القرآن
 * كل صلاة = نقطة، والجلوس ساعتين فأكثر في اليوم = 5 نقاط.
 */
const WeeklyTrackingGrid = ({ daily, onChange, weekStart, readOnly = false }) => {
  const { isDark } = useTheme();
  const rows = normalizeDaily(daily);
  const totals = dailyTotals(rows);

  const update = (i, patch) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const dayDate = (i) => {
    if (!weekStart) return '';
    const d = dateOfWeekDay(weekStart, i);
    return `${d.getDate()}/${d.getMonth() + 1}`;
  };

  const th = `p-2 text-xs font-bold whitespace-nowrap ${isDark ? 'text-slate-300' : 'text-slate-700'}`;
  const cell = `p-1.5 text-center border-t ${isDark ? 'border-white/5' : 'border-slate-200'}`;

  return (
    <div className={`rounded-xl border overflow-hidden ${isDark ? 'border-white/10 bg-slate-800/40' : 'border-slate-200 bg-white'}`}>
      {/* الجوال: بطاقة لكل يوم بأزرار كبيرة سهلة اللمس */}
      <div className="sm:hidden divide-y divide-slate-500/20">
        {rows.map((r, i) => {
          const sat = (r.quran_minutes || 0) >= QURAN_SITTING_MIN_MINUTES;
          return (
            <div key={WEEK_DAYS[i]} className="p-2.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className={`font-bold text-sm ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  {WEEK_DAYS[i]}
                  {weekStart && <span className={`mr-1.5 text-[11px] font-normal ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{dayDate(i)}</span>}
                </span>
                <span className="text-[11px] text-emerald-400">{PRAYERS.filter((p) => r[p.key]).length}/5</span>
              </div>
              <div className="grid grid-cols-5 gap-1">
                {PRAYERS.map((p) => {
                  const on = !!r[p.key];
                  return (
                    <button
                      key={p.key}
                      type="button"
                      disabled={readOnly}
                      aria-pressed={on}
                      onClick={() => update(i, { [p.key]: !on })}
                      className={`h-11 rounded-lg border text-[11px] font-medium flex flex-col items-center justify-center gap-0.5 transition-colors ${
                        on
                          ? 'bg-emerald-500 border-emerald-500 text-white'
                          : isDark ? 'bg-slate-800 border-white/10 text-slate-300' : 'bg-slate-50 border-slate-300 text-slate-700'
                      }`}
                    >
                      <span className="text-sm leading-none">{on ? '✓' : '○'}</span>
                      {p.label}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>📖 الجلوس مع القرآن (ساعة:دقيقة)</span>
                <div className="flex items-center gap-1.5">
                  {readOnly ? (
                    <span dir="ltr" className={`text-sm ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{r.quran_minutes ? formatMinutes(r.quran_minutes) : '—'}</span>
                  ) : (
                    <DurationInput minutes={r.quran_minutes} onChange={(m) => update(i, { quran_minutes: m })} isDark={isDark} />
                  )}
                  <span className={`text-[10px] font-bold w-6 ${sat ? 'text-blue-400' : 'invisible'}`}>+{SITTING_POINTS_PER_DAY}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* الشاشات الأكبر: جدول بنفس شكل الورقة المطبوعة */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-sm text-center">
          <thead className={isDark ? 'bg-purple-500/10' : 'bg-purple-50'}>
            <tr>
              <th className={`${th} text-right`}>اليوم</th>
              {PRAYERS.map((p) => <th key={p.key} className={th}>{p.label}</th>)}
              <th className={th}>الجلوس مع القرآن</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const sat = (r.quran_minutes || 0) >= QURAN_SITTING_MIN_MINUTES;
              return (
                <tr key={WEEK_DAYS[i]}>
                  <td className={`${cell} text-right whitespace-nowrap`}>
                    <span className={`font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>{WEEK_DAYS[i]}</span>
                    {weekStart && <span className={`block text-[10px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{dayDate(i)}</span>}
                  </td>
                  {PRAYERS.map((p) => (
                    <td key={p.key} className={cell}>
                      <Checkbox
                        checked={!!r[p.key]}
                        disabled={readOnly}
                        onCheckedChange={(v) => update(i, { [p.key]: v === true })}
                        aria-label={`${p.label} — ${WEEK_DAYS[i]}`}
                        className="h-5 w-5 border-emerald-500 data-[state=checked]:bg-emerald-500 data-[state=checked]:text-white disabled:opacity-100"
                      />
                    </td>
                  ))}
                  <td className={cell}>
                    <div className="flex items-center justify-center gap-1.5">
                      {readOnly ? (
                        <span dir="ltr" className={isDark ? 'text-slate-200' : 'text-slate-800'}>{r.quran_minutes ? formatMinutes(r.quran_minutes) : '—'}</span>
                      ) : (
                        <DurationInput minutes={r.quran_minutes} onChange={(m) => update(i, { quran_minutes: m })} isDark={isDark} />
                      )}
                      <span className={`text-[10px] font-bold w-6 ${sat ? 'text-blue-400' : 'invisible'}`}>+{SITTING_POINTS_PER_DAY}</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className={`flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs border-t ${isDark ? 'border-white/10 text-slate-400' : 'border-slate-200 text-slate-500'}`}>
        <span>
          🕌 الصلوات: <strong className="text-emerald-400">{totals.prayers}/35</strong>
          {' · '}📖 أيام الجلوس: <strong className="text-blue-400">{totals.sittingDays}/7</strong>
          {' '}(<span dir="ltr">{formatMinutes(totals.quranMinutes)}</span> ساعة)
        </span>
        <span>كل صلاة = نقطة · الجلوس ساعتين فأكثر = {SITTING_POINTS_PER_DAY} نقاط</span>
      </div>
    </div>
  );
};

export default WeeklyTrackingGrid;
