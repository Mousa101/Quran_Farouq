import { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import {
  AlertTriangle, ShieldCheck, Calendar, User, Bot, FileText, Filter
} from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// ألوان حسب شدّة الإنذار
const SEVERITY_STYLES = {
  high: { badge: 'bg-red-500/20 text-red-400', border: 'border-red-500/30', bg: 'bg-red-500/10' },
  medium: { badge: 'bg-amber-500/20 text-amber-400', border: 'border-amber-500/30', bg: 'bg-amber-500/10' },
  low: { badge: 'bg-slate-500/20 text-slate-400', border: 'border-slate-500/30', bg: 'bg-slate-500/10' },
};

const DEFAULT_STYLE = { badge: 'bg-orange-500/20 text-orange-400', border: 'border-orange-500/30', bg: 'bg-orange-500/10' };

const MyWarnings = () => {
  const { user } = useAuth();
  const { isDark } = useTheme();
  const [warnings, setWarnings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('all');

  useEffect(() => {
    if (!user?.id) return;
    fetchWarnings();
  }, [user?.id]); // eslint-disable-line

  const fetchWarnings = async () => {
    try {
      const res = await axios.get(`${API}/students/${user.id}/warnings`);
      setWarnings(res.data || []);
    } catch (error) {
      console.error('Error fetching warnings:', error);
      setWarnings([]);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? dateStr : d.toLocaleDateString('ar-EG', {
      year: 'numeric', month: 'long', day: 'numeric'
    });
  };

  // أنواع الإنذارات الموجودة فعليًا (للفلترة)
  const availableTypes = [...new Set(warnings.map((w) => w.type_label).filter(Boolean))];
  const filtered = typeFilter === 'all'
    ? warnings
    : warnings.filter((w) => w.type_label === typeFilter);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6 animate-fadeIn">
      {/* Header */}
      <div className={`p-4 md:p-6 rounded-xl ${isDark ? 'glass-card border border-white/10' : 'bg-white border border-slate-200 shadow-sm'}`}>
        <h1 className={`text-lg md:text-2xl font-bold flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
          <AlertTriangle className="w-6 h-6 text-orange-400" />
          الإنذارات
        </h1>
        <p className={`text-sm mt-1 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
          سجل كامل بكل الإنذارات الصادرة بحقك وتفاصيلها
        </p>
      </div>

      {/* ملخص */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4">
        <Card className={isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'}>
          <CardContent className="p-4 text-center">
            <AlertTriangle className="w-7 h-7 mx-auto text-orange-400 mb-2" />
            <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>إجمالي الإنذارات</p>
            <p className={`text-xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{warnings.length}</p>
          </CardContent>
        </Card>
        <Card className={isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'}>
          <CardContent className="p-4 text-center">
            <AlertTriangle className="w-7 h-7 mx-auto text-red-400 mb-2" />
            <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>شديدة</p>
            <p className="text-xl font-bold text-red-400">
              {warnings.filter((w) => w.severity === 'high').length}
            </p>
          </CardContent>
        </Card>
        <Card className={isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'}>
          <CardContent className="p-4 text-center">
            <Bot className="w-7 h-7 mx-auto text-blue-400 mb-2" />
            <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>تلقائية</p>
            <p className="text-xl font-bold text-blue-400">
              {warnings.filter((w) => w.auto_generated).length}
            </p>
          </CardContent>
        </Card>
        <Card className={isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'}>
          <CardContent className="p-4 text-center">
            <User className="w-7 h-7 mx-auto text-purple-400 mb-2" />
            <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>من الإدارة</p>
            <p className="text-xl font-bold text-purple-400">
              {warnings.filter((w) => !w.auto_generated).length}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* فلترة بالنوع */}
      {availableTypes.length > 1 && (
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className={`w-4 h-4 ${isDark ? 'text-slate-400' : 'text-slate-500'}`} />
          <button
            onClick={() => setTypeFilter('all')}
            className={`px-3 py-1 rounded-lg text-xs transition-colors ${
              typeFilter === 'all'
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                : isDark ? 'bg-slate-800 text-slate-400 border border-white/10' : 'bg-slate-100 text-slate-600 border border-slate-200'
            }`}
          >
            الكل ({warnings.length})
          </button>
          {availableTypes.map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`px-3 py-1 rounded-lg text-xs transition-colors ${
                typeFilter === t
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                  : isDark ? 'bg-slate-800 text-slate-400 border border-white/10' : 'bg-slate-100 text-slate-600 border border-slate-200'
              }`}
            >
              {t} ({warnings.filter((w) => w.type_label === t).length})
            </button>
          ))}
        </div>
      )}

      {/* سجل الإنذارات */}
      <Card className={isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'}>
        <CardHeader>
          <CardTitle className={`flex items-center gap-2 text-base ${isDark ? 'text-white' : 'text-slate-900'}`}>
            <FileText className="w-5 h-5 text-orange-400" />
            سجل الإنذارات ({filtered.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <div className="text-center py-10">
              <ShieldCheck className="w-14 h-14 mx-auto text-emerald-400 mb-3" />
              <p className={`font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                {warnings.length === 0 ? 'ما عندك أي إنذار — أحسنت!' : 'لا توجد إنذارات بهذا النوع'}
              </p>
              {warnings.length === 0 && (
                <p className={`text-sm mt-1 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                  حافظ على الحضور والتسميع المنتظم.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((w, index) => {
                const style = SEVERITY_STYLES[w.severity] || DEFAULT_STYLE;
                return (
                  <div key={w.id || index} className={`p-4 rounded-xl border ${style.border} ${style.bg}`}>
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className={`${style.badge} text-xs`}>
                          <AlertTriangle className="w-3 h-3 ml-1" />
                          {w.type_label || 'إنذار'}
                        </Badge>
                        {w.severity_label && (
                          <Badge className={`${style.badge} text-[10px]`}>{w.severity_label}</Badge>
                        )}
                        {w.auto_generated && (
                          <Badge className="bg-blue-500/20 text-blue-400 text-[10px]">
                            <Bot className="w-3 h-3 ml-1" />
                            تلقائي
                          </Badge>
                        )}
                      </div>
                      <span className={`text-xs flex items-center gap-1 ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                        <Calendar className="w-3 h-3" />
                        {formatDate(w.display_date)}
                      </span>
                    </div>

                    <p className={`text-sm mt-3 ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                      {w.message}
                    </p>

                    <div className={`flex items-center gap-1 mt-3 text-xs ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                      <User className="w-3 h-3" />
                      صادر عن: {w.issued_by || 'الإدارة'}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default MyWarnings;
