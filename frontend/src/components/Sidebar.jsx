import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { 
  LayoutDashboard, 
  Users, 
  Trophy, 
  Calendar, 
  Bell, 
  Settings,
  LogOut,
  BookOpen,
  UserCheck,
  FileText,
  UsersRound
} from 'lucide-react';
import { Button } from './ui/button';

const Sidebar = () => {
  const { user, logout } = useAuth();
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
        { to: '/rankings', icon: Trophy, label: 'الحوافز' },
        { to: '/activities', icon: Calendar, label: 'الأنشطة' },
        { to: '/users', icon: Users, label: 'المستخدمين' },
        { to: '/notifications', icon: Bell, label: 'الإشعارات' },
      ];
    }

    if (user?.role === 'sheikh') {
      return [
        ...baseItems,
        { to: '/groups', icon: UsersRound, label: 'المجموعات' },
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
      { to: '/activities', icon: Calendar, label: 'الأنشطة' },
      { to: '/notifications', icon: Bell, label: 'الإشعارات' },
    ];
  };

  const navItems = getNavItems();

  return (
    <aside className="fixed right-0 top-0 h-screen w-64 bg-slate-900/95 backdrop-blur-xl border-l border-white/10 flex flex-col z-50">
      {/* Logo */}
      <div className="p-6 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
            <BookOpen className="w-6 h-6 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white font-cairo">حافظ</h1>
            <p className="text-xs text-slate-400">تطبيق حفظ القرآن</p>
          </div>
        </div>
      </div>

      {/* User Info */}
      <div className="p-4 border-b border-white/10">
        <div className="glass-card p-3">
          <p className="text-white font-medium">{user?.name}</p>
          <p className="text-xs text-emerald-400">
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
                  ? 'bg-emerald-500/20 text-emerald-400 glow-green'
                  : 'text-slate-400 hover:bg-white/5 hover:text-white'
              }`
            }
          >
            <item.icon className="w-5 h-5" />
            <span className="font-medium">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Logout */}
      <div className="p-4 border-t border-white/10">
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
