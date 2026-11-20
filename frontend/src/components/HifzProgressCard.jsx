import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { BookOpen, Target, CheckCircle2, AlertTriangle } from 'lucide-react';
import { formatDate as fmtDate } from '../lib/utils';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// عدّاد الحفظ الحي: إجمالي الصفحات، الجزء الحالي وما تبقّى منه، الأجزاء المكتملة، وحالة الخطة.
// يتحدّث تلقائيًا كل دقيقة وعند العودة إلى الصفحة، فيظهر أثر كل تسميع جديد.
const HifzProgressCard = ({ studentId }) => {
  const [h, setH] = useState(null);

  const load = useCallback(() => {
    if (!studentId) return;
    axios.get(`${API}/students/${studentId}/hifz-status`).then((r) => setH(r.data)).catch(() => {});
  }, [studentId]);

  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    const onFocus = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onFocus);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onFocus); };
  }, [load]);

  if (!h) return null;
  const cur = h.current;
  const curPct = cur ? Math.round((cur.done / cur.total) * 100) : 0;
  const ps = h.plan_status;
  const planPct = ps ? Math.min(100, Math.round((ps.done / ps.target) * 100)) : 0;
  const expectedPct = ps ? Math.min(100, Math.round((ps.expected / ps.target) * 100)) : 0;

  return (
    <div className="p-4 rounded-xl bg-slate-800/50 border border-emerald-500/20 space-y-4" data-testid="hifz-progress-card">
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="p-2 rounded-lg bg-emerald-500/10">
          <p className="text-2xl font-bold text-emerald-400">{h.totals.total_pages}</p>
          <p className="text-xs text-slate-400">صفحة محفوظة</p>
        </div>
        <div className="p-2 rounded-lg bg-blue-500/10">
          <p className="text-2xl font-bold text-blue-400">{h.totals.juz_count}</p>
          <p className="text-xs text-slate-400">جزء مكتمل</p>
        </div>
        <div className="p-2 rounded-lg bg-amber-500/10">
          <p className="text-2xl font-bold text-amber-400">{h.totals.percentage}%</p>
          <p className="text-xs text-slate-400">من القرآن</p>
        </div>
      </div>

      {cur && (
        <div>
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="text-slate-200 flex items-center gap-1"><BookOpen className="w-4 h-4 text-emerald-400" />الجزء الحالي: {cur.juz}</span>
            <span className="text-slate-400">{cur.done} / {cur.total} صفحة — متبقٍّ {cur.remaining}</span>
          </div>
          <div className="h-3 bg-slate-700 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500 transition-all" style={{ width: `${curPct}%` }} />
          </div>
          {h.suggestion && (
            <p className="text-xs text-slate-400 mt-1">التسميع القادم: من صفحة {h.suggestion.page_from} إلى {h.suggestion.page_to}</p>
          )}
        </div>
      )}

      {h.completed_juz?.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-xs text-slate-400 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />أجزاء أتممتها:</span>
          {h.completed_juz.map((j) => <span key={j} className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300">{j}</span>)}
        </div>
      )}

      {ps && (
        <div>
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="text-slate-200 flex items-center gap-1"><Target className="w-4 h-4 text-amber-400" />هدف الخطة</span>
            <span className={ps.status === 'behind' ? 'text-red-400' : 'text-emerald-400'}>
              {ps.status === 'behind' && <AlertTriangle className="w-3.5 h-3.5 inline ml-1" />}{ps.label}
            </span>
          </div>
          <div className="relative h-3 bg-slate-700 rounded-full overflow-hidden">
            <div className={`h-full transition-all ${ps.status === 'behind' ? 'bg-red-500' : 'bg-amber-400'}`} style={{ width: `${planPct}%` }} />
            <div className="absolute top-0 h-full w-0.5 bg-white/70" style={{ right: `${expectedPct}%` }} title="المتوقع حتى اليوم" />
          </div>
          <p className="text-xs text-slate-400 mt-1">{ps.done} من {ps.target} صفحة حتى {fmtDate(ps.target_date)} — المتوقع حتى اليوم {ps.expected}</p>
        </div>
      )}
    </div>
  );
};

export default HifzProgressCard;
