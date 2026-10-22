import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { Bell } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { defaultAvatar } from '../lib/avatar';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const ROLE_LABEL = { admin: 'مدير', sheikh: 'مشرف', student: 'طالب' };

// #5 — شريط علوي في كل الصفحات: زر الإشعارات + اسم الحساب
const TopBar = () => {
  const { user, uiSettings } = useAuth();
  // المدير قد يوقف الإشعارات للمشرفين أو الطلاب من «إعدادات العرض»
  const notificationsOn = user?.role === 'admin' || uiSettings?.notifications?.[user?.role]?.enabled !== false;
  const { isDark } = useTheme();
  const [unread, setUnread] = useState(0);

  const fetchUnread = async () => {
    try {
      const res = await axios.get(`${API}/notifications`);
      setUnread((res.data || []).filter((n) => !n.is_read).length);
    } catch (e) { /* ignore */ }
  };

  useEffect(() => {
    if (!user || !notificationsOn) return;
    fetchUnread();
    const t = setInterval(fetchUnread, 30000); // تحديث كل 30 ثانية
    return () => clearInterval(t);
  }, [user, notificationsOn]); // eslint-disable-line

  // نبضة «متصل الآن» كل دقيقة ما دامت الصفحة مفتوحة
  useEffect(() => {
    if (!user) return;
    const ping = () => axios.post(`${API}/presence/ping`).catch(() => {});
    ping();
    const t = setInterval(ping, 60000);
    return () => clearInterval(t);
  }, [user]);

  if (!user) return null;

  return (
    <div className={`mb-4 md:mb-6 px-3 md:px-4 py-2.5 flex items-center justify-between rounded-xl border ${isDark ? 'bg-slate-900/70 border-white/10' : 'bg-white border-slate-200'}`}>
      {/* اسم الحساب + الدور */}
      <div className="flex items-center gap-2 min-w-0">
        {user.role === 'admin' ? (
          <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 font-bold flex-shrink-0">
            {user.name?.charAt(0) || '؟'}
          </div>
        ) : (
          <img src={defaultAvatar(user.role)} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
        )}
        <div className="min-w-0">
          <p className={`text-sm font-bold truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>{user.name}</p>
          <p className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{ROLE_LABEL[user.role] || user.role}</p>
        </div>
      </div>

      {/* زر الإشعارات */}
      {notificationsOn && (
      <Link
        to="/notifications"
        title="الإشعارات"
        className={`relative p-2 rounded-lg transition-colors ${isDark ? 'hover:bg-white/10 text-slate-300' : 'hover:bg-slate-100 text-slate-600'}`}
        onClick={() => setTimeout(fetchUnread, 800)}
      >
        <Bell className="w-5 h-5" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -left-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </Link>
      )}
    </div>
  );
};

export default TopBar;
