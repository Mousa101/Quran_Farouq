import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { 
  LayoutDashboard, 
  Users, 
  Trophy, 
  Calendar, 
  Bell, 
  LogOut,
  BookOpen,
  UserCheck,
  FileText,
  UsersRound,
  Star,
  Key,
  GraduationCap,
  ClipboardList,
  UserCog,
  Sun,
  Moon
} from 'lucide-react';
import { Button } from './ui/button';

const Sidebar = () => {
  const { user, logout } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const getNavItems = () => {
    const baseItems = [
      { to: '/dashboard', icon: LayoutDashboard, label: 'الرئيسية' },
    ];

    if (user?.role === 'admin') {
      return [
        ...baseItems,
        { to: '/group-management', icon: UsersRound, label: 'إدارة المجموعات' },
        { to: '/student-management', icon: GraduationCap, label: 'إدارة الطلاب' },
        { to: '/rankings', icon: Trophy, label: 'الحوافز' },
        { to: '/activities', icon: Calendar, label: 'الأنشطة' },
        { to: '/users', icon: Users, label: 'المستخدمين' },
        { to: '/registration-codes', icon: Key, label: 'أكواد التسجيل' },
        { to: '/notifications', icon: Bell, label: 'الإشعارات' },
      ];
    }

    if (user?.role === 'sheikh') {
      return [
        ...baseItems,
        { to: '/groups', icon: UsersRound, label: 'مجموعاتي' },
        { to: '/initial-assessment', icon: ClipboardList, label: 'تقييم الطلاب الجدد' },
        { to: '/tracking', icon: FileText, label: 'ورق المتابعة' },
        { to: '/recitations', icon: BookOpen, label: 'التسميع' },
        { to: '/attendance', icon: UserCheck, label: 'الحضور' },
        { to: '/rankings', icon: Trophy, label: 'الترتيب' },
        { to: '/notifications', icon: Bell, label: 'الإشعارات' },
      ];
    }

    // Student
    return [
      ...baseItems,
      { to: '/my-progress', icon: Trophy, label: 'تقدمي' },
      { to: '/my-points', icon: Star, label: 'نقاطي' },
      { to: '/edit-profile', icon: UserCog, label: 'تعديل بياناتي' },
      { to: '/activities', icon: Calendar, label: 'الأنشطة' },
      { to: '/notifications', icon: Bell, label: 'الإشعارات' },
    ];
  };

  const navItems = getNavItems();

  return (
    <aside className={`fixed right-0 top-0 h-screen w-64 backdrop-blur-xl flex flex-col z-50 transition-colors duration-300 ${
      isDark ? 'bg-slate-900/95 border-l border-white/10' : 'bg-white/95 border-l border-slate-200'
    }`}>
      {/* Logo */}
      <div className={`p-6 border-b ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
            <BookOpen className="w-6 h-6 text-emerald-400" />
          </div>
          <div>
            <h1 className={`text-lg font-bold font-cairo ${isDark ? 'text-white' : 'text-slate-900'}`}>مركز الفاروق</h1>
            <p className="text-xs text-emerald-500">القرآني</p>
          </div>
        </div>
      </div>

      {/* User Info */}
      <div className={`p-4 border-b ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
        <div className={`p-3 rounded-xl ${isDark ? 'bg-slate-800/50' : 'bg-slate-100'}`}>
          <p className={`font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>{user?.name}</p>
          <p className="text-xs text-emerald-500">
            {user?.role === 'admin' && 'مدير'}
            {user?.role === 'sheikh' && 'شيخ'}
            {user?.role === 'student' && 'طالب'}
          </p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 ${
                isActive
                  ? 'bg-emerald-500/20 text-emerald-500 glow-green'
                  : isDark 
                    ? 'text-slate-400 hover:bg-white/5 hover:text-white'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`
            }
          >
            <item.icon className="w-5 h-5" />
            <span className="font-medium">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Theme Toggle & Logout */}
      <div className={`p-4 border-t ${isDark ? 'border-white/10' : 'border-slate-200'} space-y-2`}>
        {/* Theme Toggle */}
        <Button
          onClick={toggleTheme}
          variant="ghost"
          className={`w-full justify-start gap-3 ${
            isDark 
              ? 'text-amber-400 hover:text-amber-300 hover:bg-amber-500/10' 
              : 'text-indigo-600 hover:text-indigo-700 hover:bg-indigo-500/10'
          }`}
          data-testid="theme-toggle-btn"
        >
          {isDark ? (
            <>
              <Sun className="w-5 h-5" />
              <span>الوضع الفاتح</span>
            </>
          ) : (
            <>
              <Moon className="w-5 h-5" />
              <span>الوضع الداكن</span>
            </>
          )}
        </Button>

        {/* Logout */}
        <Button
          onClick={handleLogout}
          variant="ghost"
          className="w-full justify-start gap-3 text-red-400 hover:text-red-300 hover:bg-red-500/10"
          data-testid="logout-btn"
        >
          <LogOut className="w-5 h-5" />
          <span>تسجيل الخروج</span>
        </Button>
      </div>
    </aside>
  );
};

export default Sidebar;
