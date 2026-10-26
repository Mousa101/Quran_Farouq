import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { useTheme } from '../context/ThemeContext';
import { FolderOpen, Trophy, Star, BookOpen, ChevronLeft } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// ملف الإشراف الفني: يجمع ثلاثة ملفات — المسابقة السنوية، الحافظ الصغير، التلاوة والتجويد
const TechnicalSupervision = () => {
  const { isDark } = useTheme();
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    axios.get(`${API}/supervision/summary`).then((r) => setSummary(r.data)).catch(() => {});
  }, []);

  const card = isDark ? 'glass-card border border-white/10' : 'bg-white border border-slate-200 shadow-sm';
  const title = isDark ? 'text-white' : 'text-slate-900';
  const muted = isDark ? 'text-slate-400' : 'text-slate-600';

  const files = [
    {
      to: '/annual-competition', icon: Trophy, color: 'amber', label: 'ملف المسابقة السنوية',
      hint: summary ? `${summary.annual_competition.total} مشارك في ${summary.annual_competition.years} سنة` : '',
    },
    {
      to: '/technical-supervision/young-hafiz', icon: Star, color: 'cyan', label: 'ملف الحافظ الصغير',
      hint: summary
        ? `${summary.young_hafiz} مسجَّل — الشرط: ${summary.young_hafiz_rule.min_juz} أجزاء فأكثر و${summary.young_hafiz_rule.max_grade} فما دون`
        : '',
    },
    {
      to: '/technical-supervision/tajweed', icon: BookOpen, color: 'emerald', label: 'ملف التلاوة والتجويد',
      hint: summary ? `${summary.tajweed} مسجَّل في ${summary.tajweed_levels.filter((l) => l.count).length} مستوى` : '',
    },
  ];
  const tones = {
    amber: 'bg-amber-500/20 text-amber-400',
    cyan: 'bg-cyan-500/20 text-cyan-400',
    emerald: 'bg-emerald-500/20 text-emerald-400',
  };

  return (
    <div className="space-y-6 animate-fadeIn" data-testid="technical-supervision-page">
      <div className={`p-5 rounded-xl ${card}`}>
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-emerald-500/20 flex items-center justify-center">
            <FolderOpen className="w-6 h-6 text-emerald-400" />
          </div>
          <div>
            <h1 className={`text-lg md:text-xl font-bold ${title}`}>ملف الإشراف الفني</h1>
            <p className={`text-sm ${muted}`}>المسابقة السنوية، الحافظ الصغير، التلاوة والتجويد — لطلاب المركز ومن خارجه</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {files.map(({ to, icon: Icon, color, label, hint }) => (
          <Link key={to} to={to} className={`p-5 rounded-xl transition-all hover:border-emerald-500/50 ${card}`}>
            <div className="flex items-center justify-between">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${tones[color]}`}>
                <Icon className="w-6 h-6" />
              </div>
              <ChevronLeft className={`w-5 h-5 ${muted}`} />
            </div>
            <p className={`mt-4 font-bold ${title}`}>{label}</p>
            <p className={`mt-1 text-sm ${muted}`}>{hint}</p>
          </Link>
        ))}
      </div>
    </div>
  );
};

export default TechnicalSupervision;
