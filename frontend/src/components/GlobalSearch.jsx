import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { NAV_ITEMS } from '../lib/navItems';
import { canOpenRoute } from '../lib/permissions';
import { Search, GraduationCap, UsersRound, LayoutGrid, X } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// كلمات إضافية تساعد في الوصول للخدمات بأسماء بديلة
const EXTRA_FEATURES = [
  { to: '/fees', label: 'الرسوم المالية', keywords: 'رسوم دفع مالية اشتراك مستحقات' },
  { to: '/statistics', label: 'إحصائيات الطلاب', keywords: 'احصائيات تقارير جدول' },
  { to: '/tracking-settings', label: 'إعدادات ورق المتابعة', keywords: 'ورقة متابعة بنود' },
  { to: '/points-manager', label: 'إدارة النقاط', keywords: 'نقاط تصفير خصم تجميد' },
  { to: '/admin-rankings', label: 'ترتيب الطلاب', keywords: 'ترتيب أوائل' },
  { to: '/admin-analytics', label: 'التحليلات', keywords: 'تحليل رسوم بيانية' },
  { to: '/dashboard', label: 'الفصول الدراسية', keywords: 'فصل دراسي حذف الفصل إغلاق الفصل' },
];

// تطبيع عربي بسيط: يوحّد الهمزات والتاء المربوطة والألف المقصورة ويحذف التشكيل
const norm = (s) => (s || '').toString().toLowerCase()
  .replace(/[ً-ْـ]/g, '')
  .replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').trim();

// شريط بحث عام للمدير: يصل مباشرة لمجموعة أو طالب أو خدمة/ميزة في الموقع.
const GlobalSearch = () => {
  const { user } = useAuth();
  const { isDark } = useTheme();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [focused, setFocused] = useState(false);
  const [students, setStudents] = useState([]);
  const [groups, setGroups] = useState([]);
  const [active, setActive] = useState(0);
  const boxRef = useRef(null);

  useEffect(() => {
    axios.get(`${API}/users?role=student`).then((r) => setStudents(Array.isArray(r.data) ? r.data : (r.data?.users || []))).catch(() => {});
    axios.get(`${API}/groups`).then((r) => setGroups(r.data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    const onDoc = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setFocused(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const features = useMemo(() => {
    const seen = new Set();
    return [...(NAV_ITEMS.admin || []), ...EXTRA_FEATURES]
      .filter((f) => canOpenRoute(user, f.to))
      .filter((f) => { const k = f.to + f.label; if (seen.has(k)) return false; seen.add(k); return true; });
  }, [user]);

  const results = useMemo(() => {
    const n = norm(q);
    if (!n) return [];
    const groupName = Object.fromEntries(groups.map((g) => [g.id, g.name]));
    const out = [];
    groups.filter((g) => norm(g.name).includes(n)).slice(0, 5).forEach((g) => out.push({
      type: 'group', key: `g-${g.id}`, label: g.name,
      sub: `${g.sheikh_names?.join('، ') || g.sheikh_name || ''}`.trim() || 'مجموعة',
      go: () => navigate(`/groups-overview`),
    }));
    students.filter((s) => norm(s.name).includes(n) || norm(s.email).includes(n)).slice(0, 8).forEach((s) => out.push({
      type: 'student', key: `s-${s.id}`, label: s.name,
      sub: groupName[s.group_id] || 'بدون مجموعة',
      go: () => navigate(`/student/${s.id}`),
    }));
    features.filter((f) => norm(f.label).includes(n) || norm(f.keywords).includes(n)).slice(0, 6).forEach((f) => out.push({
      type: 'feature', key: `f-${f.to}-${f.label}`, label: f.label, sub: 'خدمة / صفحة',
      go: () => navigate(f.to),
    }));
    return out;
  }, [q, groups, students, features, navigate]);

  useEffect(() => { setActive(0); }, [q]);

  const pick = (r) => { r.go(); setQ(''); setFocused(false); };
  const onKey = (e) => {
    if (!results.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => (a + 1) % results.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (a - 1 + results.length) % results.length); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(results[active]); }
    else if (e.key === 'Escape') setFocused(false);
  };

  const ICON = { student: GraduationCap, group: UsersRound, feature: LayoutGrid };
  const TYPE = { student: 'طالب', group: 'مجموعة', feature: 'خدمة' };

  return (
    <div ref={boxRef} className="relative w-full" dir="rtl" data-testid="global-search">
      <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${isDark ? 'bg-slate-800/60 border-white/10' : 'bg-white border-slate-200 shadow-sm'}`}>
        <Search className="w-5 h-5 text-emerald-500 shrink-0" />
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setFocused(true); }}
          onFocus={() => setFocused(true)}
          onKeyDown={onKey}
          placeholder="ابحث عن مجموعة، طالب، أو خدمة..."
          className={`flex-1 bg-transparent outline-none text-sm ${isDark ? 'text-white placeholder:text-slate-500' : 'text-slate-900 placeholder:text-slate-400'}`}
          data-testid="global-search-input"
        />
        {q && <button type="button" onClick={() => setQ('')} className="text-slate-400"><X className="w-4 h-4" /></button>}
      </div>
      {focused && q.trim() && (
        <div className={`absolute z-50 mt-1 w-full rounded-xl border overflow-hidden max-h-96 overflow-y-auto ${isDark ? 'bg-slate-900 border-white/10' : 'bg-white border-slate-200 shadow-lg'}`}>
          {results.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">لا توجد نتائج</p>
          ) : results.map((r, i) => {
            const Icon = ICON[r.type];
            return (
              <button key={r.key} type="button" onMouseEnter={() => setActive(i)} onClick={() => pick(r)}
                className={`w-full flex items-center gap-3 px-3 py-2 text-right ${i === active ? (isDark ? 'bg-emerald-500/15' : 'bg-emerald-50') : ''}`}
                data-testid={`search-result-${r.type}`}>
                <Icon className="w-4 h-4 text-emerald-500 shrink-0" />
                <span className="flex-1 min-w-0">
                  <span className={`block text-sm truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>{r.label}</span>
                  <span className="block text-xs text-slate-400 truncate">{r.sub}</span>
                </span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${isDark ? 'bg-white/10 text-slate-300' : 'bg-slate-100 text-slate-600'}`}>{TYPE[r.type]}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default GlobalSearch;
