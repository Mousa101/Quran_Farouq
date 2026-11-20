import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { useTheme } from '../context/ThemeContext';
import { CalendarCheck, UserCheck, BookOpen, FileText, ChevronLeft, CheckCircle2, AlertTriangle, UserPlus } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// لوحة «اليوم» المختصرة: هل سُجّل الحضور والتسميع لكل مجموعة، ومن لم يُسجَّل بعد،
// مع تنبيهات سريعة (طلبات تسجيل، مشرفون متأخرون). التفاصيل الكاملة في «نظرة عامة على المجموعات».
const DashboardToday = ({ pendingStudents = 0, lateSheikhs = 0, onLateClick }) => {
  const { isDark } = useTheme();
  const [d, setD] = useState(null);

  useEffect(() => {
    axios.get(`${API}/reports/groups-overview`).then((r) => setD(r.data)).catch(() => setD(false));
  }, []);

  const muted = isDark ? 'text-slate-400' : 'text-slate-500';
  const strong = isDark ? 'text-white' : 'text-slate-900';
  const box = isDark ? 'bg-white/5 border-white/10' : 'bg-slate-50 border-slate-200';
  const t = d?.totals || {};
  const pending = (d?.groups || []).filter((g) => g.status === 'none' || g.status === 'partial');

  const Tile = ({ icon: Icon, color, label, value }) => (
    <div className={`rounded-lg border p-2.5 ${box}`}>
      <div className={`flex items-center gap-1.5 text-[11px] ${muted}`}><Icon className={`w-3.5 h-3.5 ${color}`} />{label}</div>
      <div className={`text-lg font-bold leading-tight mt-0.5 ${strong}`}>{value}</div>
    </div>
  );

  const alerts = [
    pendingStudents > 0 && { to: '/pending-students', icon: UserPlus, text: `${pendingStudents} طلب تسجيل بانتظار الموافقة` },
    lateSheikhs > 0 && { to: '#late-sheikhs', onClick: onLateClick, icon: AlertTriangle, text: `${lateSheikhs} مجموعة متأخرة في تسجيل الحضور` },
  ].filter(Boolean);

  return (
    <div className={`rounded-xl border p-3 md:p-4 ${isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200 shadow-sm'}`} data-testid="dashboard-today">
      <div className="flex items-center justify-between mb-3">
        <h2 className={`flex items-center gap-2 font-bold ${strong}`}>
          <CalendarCheck className="w-5 h-5 text-emerald-500" />
          اليوم{d?.day_name ? ` — ${d.day_name}` : ''}
          {d && !d.is_lesson_day && <span className="text-[11px] font-normal text-amber-500">(ليس يوم دوام)</span>}
        </h2>
        <Link to="/groups-overview" className="text-xs text-emerald-500 flex items-center gap-0.5 hover:underline">
          التفاصيل <ChevronLeft className="w-3.5 h-3.5" />
        </Link>
      </div>

      {d === null ? (
        <div className={`h-16 rounded-lg animate-pulse ${isDark ? 'bg-white/5' : 'bg-slate-100'}`} />
      ) : d === false ? null : (
        <>
          <div className={`grid gap-2 ${d.is_saturday ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-3'}`}>
            <Tile icon={CheckCircle2} color="text-emerald-500" label="مجموعات سُجّلت" value={`${t.groups_done || 0}/${t.groups || 0}`} />
            <Tile icon={UserCheck} color="text-blue-500" label="حضروا" value={`${t.present || 0}/${t.students || 0}`} />
            <Tile icon={BookOpen} color="text-purple-500" label="سمّعوا" value={t.recited || 0} />
            {d.is_saturday && <Tile icon={FileText} color="text-amber-500" label="ورقة المتابعة" value={`${t.tracking_sheets || 0}/${t.students || 0}`} />}
          </div>

          {d.is_lesson_day && pending.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className={`text-xs ${muted}`}>لم يكتمل التسجيل:</span>
              {pending.slice(0, 8).map((g) => (
                <Link key={g.group_id} to="/groups-overview"
                  className={`text-[11px] px-2 py-0.5 rounded-full ${g.status === 'none' ? 'bg-red-500/15 text-red-500' : 'bg-amber-500/15 text-amber-500'}`}>
                  {g.group_name}
                </Link>
              ))}
              {pending.length > 8 && <span className={`text-[11px] ${muted}`}>+{pending.length - 8}</span>}
            </div>
          )}
        </>
      )}

      {alerts.length > 0 && (
        <div className="mt-3 flex flex-col gap-1.5">
          {alerts.map((a) => {
            const inner = <><a.icon className="w-3.5 h-3.5" />{a.text}<ChevronLeft className="w-3.5 h-3.5 mr-auto" /></>;
            const cls = 'text-xs flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 bg-amber-500/10 text-amber-600 hover:bg-amber-500/20';
            return a.to.startsWith('#')
              ? <button key={a.to} type="button" className={cls} onClick={() => a.onClick?.()} data-alert={a.to}>{inner}</button>
              : <Link key={a.to} to={a.to} className={cls}>{inner}</Link>;
          })}
        </div>
      )}
    </div>
  );
};

export default DashboardToday;
