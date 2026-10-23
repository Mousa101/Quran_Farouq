import { useState } from 'react';
import { Copy, Check, GraduationCap, BookOpen, Shield, Link2 } from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from '../context/ThemeContext';

// روابط التسجيل والدخول المنفصلة: يرسل المدير لكل فئة رابطها الخاص
const LINKS = [
  { path: '/register/student', label: 'رابط تسجيل الطلاب', icon: GraduationCap, color: 'text-emerald-400' },
  { path: '/register/teacher', label: 'رابط تسجيل المشرفين', icon: BookOpen, color: 'text-blue-400' },
  { path: '/register/admin', label: 'رابط تسجيل المدراء', icon: Shield, color: 'text-purple-400' },
  { path: '/login/student', label: 'رابط دخول الطلاب', icon: GraduationCap, color: 'text-emerald-400' },
  { path: '/login/teacher', label: 'رابط دخول المشرفين', icon: BookOpen, color: 'text-blue-400' },
  { path: '/login/admin', label: 'رابط دخول المدراء', icon: Shield, color: 'text-purple-400' },
];

const RegistrationLinks = () => {
  const { isDark } = useTheme();
  const [copied, setCopied] = useState(null);

  const copy = async (url) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(url);
      toast.success('تم نسخ الرابط');
      setTimeout(() => setCopied(null), 2000);
    } catch (e) {
      toast.error('تعذّر النسخ — انسخ الرابط يدويًا');
    }
  };

  return (
    <div className={`p-4 rounded-xl border ${isDark ? 'bg-slate-800/40 border-white/10' : 'bg-white border-slate-200'}`}>
      <p className={`font-bold mb-3 flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
        <Link2 className="w-5 h-5 text-emerald-400" />
        روابط التسجيل والدخول
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        {LINKS.map(({ path, label, icon: Icon, color }) => {
          const url = `${window.location.origin}${path}`;
          return (
            <div key={path} className={`p-3 rounded-lg ${isDark ? 'bg-slate-900/60' : 'bg-slate-50'}`}>
              <p className={`text-sm font-medium flex items-center gap-1.5 mb-1 ${color}`}>
                <Icon className="w-4 h-4" />
                {label}
              </p>
              <div className="flex items-center gap-2">
                <code className={`flex-1 text-xs truncate ${isDark ? 'text-slate-300' : 'text-slate-600'}`} dir="ltr">{url}</code>
                <button type="button" onClick={() => copy(url)} title="نسخ الرابط"
                  className={`p-1.5 rounded-md ${isDark ? 'hover:bg-white/10 text-slate-300' : 'hover:bg-slate-200 text-slate-600'}`}>
                  {copied === url ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default RegistrationLinks;
