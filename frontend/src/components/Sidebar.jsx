import { useState, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
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
  Moon,
  UserPlus,
  BookMarked,
  CalendarDays,
  TrendingUp,
  DollarSign,
  BookText,
  Award,
  Menu,
  X
} from 'lucide-react';
import { Button } from './ui/button';

const Sidebar = () => {
  const { user, logout } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Close mobile menu when route changes
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (isMobileMenuOpen && !event.target.closest('.sidebar-container')) {
        setIsMobileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isMobileMenuOpen]);

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isMobileMenuOpen]);

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
        { to: '/pending-students', icon: UserPlus, label: 'طلبات التسجيل' },
        { to: '/sheikh-management', icon: BookOpen, label: 'إدارة المعلمين' },
        { to: '/group-management', icon: UsersRound, label: 'إدارة المجموعات' },
        { to: '/student-management', icon: GraduationCap, label: 'إدارة الطلاب' },
        { to: '/admin-rankings', icon: TrendingUp, label: 'الترتيب والإحصائيات' },
        { to: '/fees', icon: DollarSign, label: 'الرسوم المالية' },
        { to: '/homework', icon: BookText, label: 'الواجبات' },
        { to: '/exams', icon: Award, label: 'الامتحانات' },
        { to: '/curriculum', icon: BookMarked, label: 'إدارة المنهج' },
        { to: '/schedule', icon: CalendarDays, label: 'إدارة الجداول' },
        { to: '/activities', icon: Calendar, label: 'الأنشطة' },
        { to: '/users', icon: Users, label: 'المستخدمين' },
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
        { to: '/homework', icon: BookText, label: 'الواجبات' },
        { to: '/exams', icon: Award, label: 'الامتحانات' },
        { to: '/sheikh-rankings', icon: TrendingUp, label: 'ترتيب طلابي' },
        { to: '/curriculum', icon: BookMarked, label: 'عرض المنهج' },
        { to: '/schedule', icon: CalendarDays, label: 'الجدول الدراسي' },
        { to: '/sheikh-edit-profile', icon: UserCog, label: 'تعديل بياناتي' },
        { to: '/notifications', icon: Bell, label: 'الإشعارات' },
      ];
    }

    // Student
    return [
      ...baseItems,
      { to: '/my-progress', icon: Trophy, label: 'تقدمي' },
      { to: '/my-points', icon: Star, label: 'نقاطي' },
      { to: '/fees', icon: DollarSign, label: 'المستحقات المالية' },
      { to: '/homework', icon: BookText, label: 'واجباتي' },
      { to: '/exams', icon: Award, label: 'امتحاناتي' },
      { to: '/edit-profile', icon: UserCog, label: 'تعديل بياناتي' },
      { to: '/notifications', icon: Bell, label: 'الإشعارات' },
    ];
  };

  const navItems = getNavItems();

  const SidebarContent = ({ isMobile = false }) => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className={`p-4 md:p-6 border-b flex-shrink-0 ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-white/10 flex items-center justify-center overflow-hidden">
            <img src="/logo.png" alt="شعار المركز" className="w-8 h-8 md:w-10 md:h-10 object-contain" />
          </div>
          <div>
            <h1 className={`text-base md:text-lg font-bold font-cairo ${isDark ? 'text-white' : 'text-slate-900'}`}>مركز الفاروق</h1>
            <p className="text-xs text-emerald-500">القرآني</p>
          </div>
        </div>
      </div>

      {/* User Info */}
      <div className={`p-3 md:p-4 border-b flex-shrink-0 ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
        <div className={`p-2 md:p-3 rounded-xl ${isDark ? 'bg-slate-800/50' : 'bg-slate-100'}`}>
          <p className={`font-medium text-sm md:text-base ${isDark ? 'text-white' : 'text-slate-900'}`}>{user?.name}</p>
          <p className="text-xs text-emerald-500">
            {user?.role === 'admin' && 'مدير'}
            {user?.role === 'sheikh' && 'شيخ'}
            {user?.role === 'student' && 'طالب'}
          </p>
        </div>
      </div>

      {/* Navigation - Scrollable */}
      <nav className="flex-1 p-2 md:p-4 space-y-1 md:space-y-2 overflow-y-auto min-h-0">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 md:px-4 py-2.5 md:py-3 rounded-xl transition-all duration-300 text-sm md:text-base ${
                isActive
                  ? 'bg-emerald-500/20 text-emerald-500 glow-green'
                  : isDark 
                    ? 'text-slate-400 hover:bg-white/5 hover:text-white'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`
            }
          >
            <item.icon className="w-5 h-5 flex-shrink-0" />
            <span className="font-medium truncate">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Theme Toggle & Logout - Fixed at bottom */}
      <div className={`p-3 md:p-4 border-t flex-shrink-0 ${isDark ? 'border-white/10' : 'border-slate-200'} space-y-2`}>
        {/* Theme Toggle */}
        <Button
          onClick={toggleTheme}
          variant="ghost"
          className={`w-full justify-start gap-3 text-sm md:text-base ${
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
          className="w-full justify-start gap-3 text-red-400 hover:text-red-300 hover:bg-red-500/10 text-sm md:text-base"
          data-testid="logout-btn"
        >
          <LogOut className="w-5 h-5" />
          <span>تسجيل الخروج</span>
        </Button>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile Header */}
      <header className={`md:hidden fixed top-0 right-0 left-0 z-50 px-4 py-3 flex items-center justify-between ${
        isDark ? 'bg-slate-900/95 border-b border-white/10' : 'bg-white/95 border-b border-slate-200'
      } backdrop-blur-xl`}>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center overflow-hidden">
            <img src="/logo.png" alt="شعار المركز" className="w-7 h-7 object-contain" />
          </div>
          <span className={`font-bold font-cairo ${isDark ? 'text-white' : 'text-slate-900'}`}>مركز الفاروق</span>
        </div>
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className={`p-2 rounded-lg ${isDark ? 'hover:bg-white/10' : 'hover:bg-slate-100'}`}
          aria-label="القائمة"
        >
          {isMobileMenuOpen ? (
            <X className={`w-6 h-6 ${isDark ? 'text-white' : 'text-slate-900'}`} />
          ) : (
            <Menu className={`w-6 h-6 ${isDark ? 'text-white' : 'text-slate-900'}`} />
          )}
        </button>
      </header>

      {/* Mobile Overlay */}
      {isMobileMenuOpen && (
        <div className="md:hidden fixed inset-0 bg-black/50 z-40" onClick={() => setIsMobileMenuOpen(false)} />
      )}

      {/* Mobile Sidebar */}
      <aside className={`sidebar-container md:hidden fixed right-0 top-14 bottom-0 w-72 backdrop-blur-xl flex flex-col z-50 transition-transform duration-300 ${
        isMobileMenuOpen ? 'translate-x-0' : 'translate-x-full'
      } ${isDark ? 'bg-slate-900/98 border-l border-white/10' : 'bg-white/98 border-l border-slate-200'}`}>
        <SidebarContent isMobile={true} />
      </aside>

      {/* Desktop Sidebar */}
      <aside className={`sidebar-container hidden md:flex fixed right-0 top-0 h-screen w-64 backdrop-blur-xl flex-col z-50 transition-colors duration-300 ${
        isDark ? 'bg-slate-900/95 border-l border-white/10' : 'bg-white/95 border-l border-slate-200'
      }`}>
        <SidebarContent />
      </aside>
    </>
  );
};

export default Sidebar;
