import { useState } from 'react';
import { useTheme } from '../context/ThemeContext';
import { Table2, Trophy, BarChart3 } from 'lucide-react';
import StudentStats from './StudentStats';
import AdminRankings from './AdminRankings';
import AdminAnalytics from './AdminAnalytics';

// #2 — دمج كل إحصائيات الطلاب في صفحة واحدة (تبويبات) لتبسيط الاستخدام
const TABS = [
  { key: 'table', label: 'جدول الإحصائيات', icon: Table2 },
  { key: 'rankings', label: 'الترتيب', icon: Trophy },
  { key: 'analytics', label: 'التحليلات والتقارير', icon: BarChart3 },
];

const StatisticsHub = () => {
  const { isDark } = useTheme();
  const [tab, setTab] = useState('table');

  return (
    <div className="space-y-4 animate-fadeIn">
      <div>
        <h1 className={`text-xl md:text-2xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>إحصائيات الطلاب</h1>
        <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>كل إحصائيات وتقارير وترتيب الطلاب في مكان واحد</p>
      </div>

      {/* التبويبات */}
      <div className={`flex flex-wrap gap-1 p-1 rounded-xl ${isDark ? 'bg-slate-800/50' : 'bg-slate-100'}`}>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === t.key
                ? 'bg-emerald-600 text-white'
                : (isDark ? 'text-slate-300 hover:bg-white/5' : 'text-slate-600 hover:bg-white')
            }`}
          >
            <t.icon className="w-4 h-4" />{t.label}
          </button>
        ))}
      </div>

      {/* المحتوى — يُحمّل التبويب النشط فقط */}
      <div>
        {tab === 'table' && <StudentStats />}
        {tab === 'rankings' && <AdminRankings />}
        {tab === 'analytics' && <AdminAnalytics />}
      </div>
    </div>
  );
};

export default StatisticsHub;
