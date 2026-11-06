import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { useTheme } from '../context/ThemeContext';
import { ClipboardCheck, AlertTriangle, Clock, CalendarDays } from 'lucide-react';
import { formatDate as fmtDate } from '../lib/utils';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// بطاقة المهام في لوحة المدير (كل المهام + الاجتماع القادم) ولوحة المشرف (مهامه فقط)
const TasksSummaryCard = ({ role }) => {
  const { isDark } = useTheme();
  const [s, setS] = useState(null);

  useEffect(() => {
    axios.get(`${API}/tasks/summary`).then((r) => setS(r.data)).catch(() => {});
  }, []);

  // المشرف بلا مهام مفتوحة لا يحتاج البطاقة
  if (!s || (role === 'sheikh' && s.open === 0)) return null;

  const to = role === 'admin' ? '/tasks' : '/my-tasks';
  const muted = isDark ? 'text-slate-400' : 'text-slate-500';
  const item = (Icon, cls, label, value) => (
    <span className={`flex items-center gap-1 text-sm ${muted}`}>
      <Icon className={`w-4 h-4 ${cls}`} />{label}: <b className={isDark ? 'text-white' : 'text-slate-900'}>{value}</b>
    </span>
  );

  return (
    <Link to={to} className={`block p-4 rounded-xl transition hover:ring-1 hover:ring-emerald-500/50 ${isDark ? 'glass-card border border-white/10' : 'bg-white border border-slate-200 shadow-sm'}`}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className={`font-bold flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
          <ClipboardCheck className="w-5 h-5 text-emerald-400" />{role === 'admin' ? 'المهام والاجتماعات' : 'مهامي من الإدارة'}
        </p>
        <div className="flex items-center gap-4 flex-wrap">
          {item(ClipboardCheck, 'text-blue-400', 'مفتوحة', s.open)}
          {s.overdue > 0 && item(AlertTriangle, 'text-red-400', 'متأخرة', s.overdue)}
          {s.due_today > 0 && item(Clock, 'text-amber-400', 'اليوم', s.due_today)}
          {role === 'admin' && s.next_meeting && (
            <span className={`flex items-center gap-1 text-sm ${muted}`}>
              <CalendarDays className="w-4 h-4 text-emerald-400" />الاجتماع القادم: {s.next_meeting.title} — {fmtDate(s.next_meeting.date, { short: true })}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
};

export default TasksSummaryCard;
