import { useState, useEffect } from 'react';
import axios from 'axios';
import { useTheme } from '../context/ThemeContext';
import { Megaphone, X } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const KEY = 'dismissed_announcements';

// N1 - شريط الإعلانات في اللوحة
const AnnouncementBanner = () => {
  const { isDark } = useTheme();
  const [items, setItems] = useState([]);
  const [dismissed, setDismissed] = useState(() => {
    try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
  });

  useEffect(() => {
    axios.get(`${API}/announcements`).then((r) => setItems(r.data || [])).catch(() => {});
  }, []);

  const dismiss = (id) => {
    const next = [...dismissed, id];
    setDismissed(next);
    localStorage.setItem(KEY, JSON.stringify(next));
  };

  const visible = items.filter((a) => !dismissed.includes(a.id)).slice(0, 3);
  if (visible.length === 0) return null;

  return (
    <div className="space-y-2 mb-4">
      {visible.map((a) => (
        <div key={a.id} className={`p-3 rounded-xl flex items-start gap-3 border ${isDark ? 'bg-amber-500/10 border-amber-500/30' : 'bg-amber-50 border-amber-200'}`}>
          <Megaphone className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className={`font-bold text-sm ${isDark ? 'text-amber-300' : 'text-amber-800'}`}>{a.title}</p>
            <p className={`text-sm ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{a.message}</p>
            {a.created_by_name && <p className={`text-xs mt-1 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>— {a.created_by_name}</p>}
          </div>
          <button onClick={() => dismiss(a.id)} className={`p-1 rounded ${isDark ? 'hover:bg-white/10 text-slate-400' : 'hover:bg-slate-200 text-slate-500'}`} aria-label="إخفاء">
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
};

export default AnnouncementBanner;
