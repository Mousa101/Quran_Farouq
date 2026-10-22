import { useState, useEffect } from 'react';
import axios from 'axios';
import { Wifi, GraduationCap, BookUser } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import StudentLink from './StudentLink';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// المتصلون الآن (طلاب ومشرفون) — يتحدّث كل 30 ثانية. يظهر في لوحة المدير.
const OnlineUsers = () => {
  const { isDark } = useTheme();
  const [data, setData] = useState({ students: [], sheikhs: [] });

  useEffect(() => {
    const load = () => axios.get(`${API}/admin/online-users`).then((r) => setData(r.data)).catch(() => {});
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  const total = data.students.length + data.sheikhs.length;
  const muted = isDark ? 'text-slate-400' : 'text-slate-500';

  const column = (title, Icon, color, people, isStudent) => (
    <div>
      <p className={`text-sm font-bold mb-2 flex items-center gap-1.5 ${color}`}>
        <Icon className="w-4 h-4" />
        {title} ({people.length})
      </p>
      {people.length === 0 ? (
        <p className={`text-xs ${muted}`}>لا يوجد متصلون</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {people.map((p) => (
            <span key={p.id} className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs ${isDark ? 'bg-slate-800 text-slate-200' : 'bg-slate-100 text-slate-700'}`}
              title={p.group_name || ''}>
              <span className="w-2 h-2 rounded-full bg-green-500" />
              {isStudent ? <StudentLink studentId={p.id} name={p.name} /> : p.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className={`p-4 rounded-xl border ${isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200 shadow-sm'}`}>
      <p className={`font-bold mb-3 flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
        <Wifi className="w-5 h-5 text-green-500" />
        المتصلون الآن
        <span className={`text-xs font-normal ${muted}`}>({total})</span>
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {column('المشرفون', BookUser, 'text-blue-400', data.sheikhs, false)}
        {column('الطلاب', GraduationCap, 'text-emerald-400', data.students, true)}
      </div>
    </div>
  );
};

export default OnlineUsers;
