import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { useTheme } from '../context/ThemeContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { 
  Users, BookOpen, Calendar, Trophy, TrendingUp, 
  GraduationCap, UserCheck, Target, Eye, Medal,
  ArrowUpRight, UserPlus, Clock
} from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const AdminDashboard = () => {
  const { isDark } = useTheme();
  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const res = await axios.get(`${API}/admin/dashboard-stats`);
      setDashboardData(res.data);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getRankBadge = (rank) => {
    if (rank === 1) return { bg: 'bg-amber-500/20', text: 'text-amber-400', icon: '🥇' };
    if (rank === 2) return { bg: 'bg-slate-400/20', text: 'text-slate-300', icon: '🥈' };
    if (rank === 3) return { bg: 'bg-orange-500/20', text: 'text-orange-400', icon: '🥉' };
    return { bg: 'bg-slate-700/50', text: 'text-slate-400', icon: rank };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const summary = dashboardData?.summary || {};
  const topGroups = dashboardData?.top_groups || [];
  const topStudents = dashboardData?.top_students || [];
  const sheikhs = dashboardData?.sheikhs || [];

  return (
    <div className="space-y-4 md:space-y-6 animate-fadeIn">
      {/* Welcome Header */}
      <div className={`p-4 md:p-6 rounded-xl ${isDark ? 'glass-card border border-white/10' : 'bg-white border border-slate-200 shadow-sm'}`}>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className={`text-lg md:text-2xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>مرحباً بك في لوحة التحكم</h1>
            <p className={`text-sm md:text-base ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>نظرة شاملة على أداء المركز</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/admin-rankings">
              <Button variant="outline" size="sm" className={`text-xs md:text-sm ${isDark ? 'border-white/10 hover:bg-white/5' : ''}`}>
                <TrendingUp className="w-3 h-3 md:w-4 md:h-4 ml-1 md:ml-2" />
                الترتيب التفصيلي
              </Button>
            </Link>
            <Link to="/pending-students">
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-xs md:text-sm">
                <UserPlus className="w-3 h-3 md:w-4 md:h-4 ml-1 md:ml-2" />
                طلبات التسجيل
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4">
        <Card className={isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'}>
          <CardContent className="p-3 md:p-4">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className={`text-xs md:text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>الطلاب</p>
                <p className={`text-xl md:text-2xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{summary.total_students}</p>
              </div>
              <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                <GraduationCap className="w-5 h-5 md:w-6 md:h-6 text-emerald-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'}>
          <CardContent className="p-3 md:p-4">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className={`text-xs md:text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>المشايخ</p>
                <p className={`text-xl md:text-2xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{summary.total_sheikhs}</p>
              </div>
              <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                <BookOpen className="w-5 h-5 md:w-6 md:h-6 text-blue-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'}>
          <CardContent className="p-3 md:p-4">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className={`text-xs md:text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>المجموعات</p>
                <p className={`text-xl md:text-2xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{summary.total_groups}</p>
              </div>
              <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-purple-500/20 flex items-center justify-center flex-shrink-0">
                <Users className="w-5 h-5 md:w-6 md:h-6 text-purple-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'}>
          <CardContent className="p-3 md:p-4">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className={`text-xs md:text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>إجمالي النقاط</p>
                <p className={`text-xl md:text-2xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{summary.total_points}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center">
                <Trophy className="w-6 h-6 text-amber-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Weekly Stats */}
      <div className="grid grid-cols-2 gap-4">
        <Card className={isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                <UserCheck className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>حضور هذا الأسبوع</p>
                <p className={`text-xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{summary.week_attendance} مرة</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                <BookOpen className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>صفحات هذا الأسبوع</p>
                <p className={`text-xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{summary.week_pages} صفحة</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Groups */}
        <Card className={isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'}>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className={`flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
              <Users className="w-5 h-5 text-purple-400" />
              ترتيب المجموعات
            </CardTitle>
            <Link to="/admin-rankings?filter=groups">
              <Button variant="ghost" size="sm" className="text-emerald-400">
                عرض الكل <ArrowUpRight className="w-4 h-4 mr-1" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {topGroups.length === 0 ? (
              <p className={`text-center py-4 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>لا توجد مجموعات</p>
            ) : (
              <div className="space-y-3">
                {topGroups.map((group, index) => {
                  const badge = getRankBadge(index + 1);
                  return (
                    <div
                      key={group.group_id}
                      className={`p-3 rounded-lg flex items-center justify-between ${isDark ? 'bg-slate-800/50' : 'bg-slate-50'}`}
                    >
                      <div className="flex items-center gap-3">
                        <span className={`w-8 h-8 flex items-center justify-center rounded-full text-sm font-bold ${badge.bg} ${badge.text}`}>
                          {badge.icon}
                        </span>
                        <div>
                          <p className={`font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>{group.group_name}</p>
                          <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>{group.sheikh_name} • {group.student_count} طالب</p>
                        </div>
                      </div>
                      <div className="text-left">
                        <p className="text-emerald-400 font-bold">{group.total_points}</p>
                        <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>نقطة</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top Students */}
        <Card className={isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'}>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className={`flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
              <Trophy className="w-5 h-5 text-amber-400" />
              أفضل الطلاب
            </CardTitle>
            <Link to="/admin-rankings?filter=students">
              <Button variant="ghost" size="sm" className="text-emerald-400">
                عرض الكل <ArrowUpRight className="w-4 h-4 mr-1" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {topStudents.length === 0 ? (
              <p className={`text-center py-4 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>لا يوجد طلاب</p>
            ) : (
              <div className="space-y-3">
                {topStudents.slice(0, 5).map((student, index) => {
                  const badge = getRankBadge(index + 1);
                  return (
                    <div
                      key={student.student_id}
                      className={`p-3 rounded-lg flex items-center justify-between ${isDark ? 'bg-slate-800/50' : 'bg-slate-50'}`}
                    >
                      <div className="flex items-center gap-3">
                        <span className={`w-8 h-8 flex items-center justify-center rounded-full text-sm font-bold ${badge.bg} ${badge.text}`}>
                          {badge.icon}
                        </span>
                        <div>
                          <p className={`font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>{student.student_name}</p>
                          <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>{student.group_name}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-emerald-400 font-bold">{student.total_points} نقطة</span>
                        <Link to={`/student/${student.student_id}`}>
                          <Button variant="ghost" size="sm" className="text-slate-400 hover:text-emerald-400">
                            <Eye className="w-4 h-4" />
                          </Button>
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Sheikhs List */}
      <Card className={isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'}>
        <CardHeader>
          <CardTitle className={`flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
            <BookOpen className="w-5 h-5 text-blue-400" />
            بيانات المشايخ
          </CardTitle>
        </CardHeader>
        <CardContent>
          {sheikhs.length === 0 ? (
            <p className={`text-center py-4 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>لا يوجد مشايخ</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className={`border-b ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
                    <th className={`px-4 py-3 text-right text-sm font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>الشيخ</th>
                    <th className={`px-4 py-3 text-right text-sm font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>البريد</th>
                    <th className={`px-4 py-3 text-right text-sm font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>المجموعات</th>
                    <th className={`px-4 py-3 text-right text-sm font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>الطلاب</th>
                    <th className={`px-4 py-3 text-right text-sm font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>التسميعات</th>
                    <th className={`px-4 py-3 text-right text-sm font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}></th>
                  </tr>
                </thead>
                <tbody>
                  {sheikhs.map((sheikh) => (
                    <tr key={sheikh.sheikh_id} className={`border-b ${isDark ? 'border-white/5 hover:bg-white/5' : 'border-slate-100 hover:bg-slate-50'}`}>
                      <td className={`px-4 py-3 font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>{sheikh.sheikh_name}</td>
                      <td className={`px-4 py-3 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>{sheikh.email}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-1 rounded-full text-xs bg-purple-500/20 text-purple-400">
                          {sheikh.groups_count} مجموعة
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-1 rounded-full text-xs bg-emerald-500/20 text-emerald-400">
                          {sheikh.students_count} طالب
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-1 rounded-full text-xs bg-blue-500/20 text-blue-400">
                          {sheikh.recitations_count} تسميع
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Link to={`/users?sheikh=${sheikh.sheikh_id}`}>
                          <Button variant="ghost" size="sm" className="text-emerald-400 hover:text-emerald-300">
                            <Eye className="w-4 h-4" />
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Points System Info */}
      <Card className={isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'}>
        <CardHeader>
          <CardTitle className={`flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
            <Target className="w-5 h-5 text-emerald-400" />
            نظام النقاط
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className={`p-4 rounded-xl text-center ${isDark ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-emerald-50 border border-emerald-200'}`}>
              <UserCheck className="w-8 h-8 mx-auto mb-2 text-emerald-400" />
              <p className={`text-sm ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>الحضور</p>
              <p className="text-2xl font-bold text-emerald-400">10 نقاط</p>
            </div>
            <div className={`p-4 rounded-xl text-center ${isDark ? 'bg-blue-500/10 border border-blue-500/30' : 'bg-blue-50 border border-blue-200'}`}>
              <BookOpen className="w-8 h-8 mx-auto mb-2 text-blue-400" />
              <p className={`text-sm ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>الحد الأدنى</p>
              <p className="text-2xl font-bold text-blue-400">20 نقطة</p>
            </div>
            <div className={`p-4 rounded-xl text-center ${isDark ? 'bg-purple-500/10 border border-purple-500/30' : 'bg-purple-50 border border-purple-200'}`}>
              <Calendar className="w-8 h-8 mx-auto mb-2 text-purple-400" />
              <p className={`text-sm ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>ورقة المتابعة</p>
              <p className="text-2xl font-bold text-purple-400">63 نقطة</p>
              <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>الحد الأقصى</p>
            </div>
            <div className={`p-4 rounded-xl text-center ${isDark ? 'bg-amber-500/10 border border-amber-500/30' : 'bg-amber-50 border border-amber-200'}`}>
              <Trophy className="w-8 h-8 mx-auto mb-2 text-amber-400" />
              <p className={`text-sm ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>الإجمالي الأسبوعي</p>
              <p className="text-2xl font-bold text-amber-400">93+ نقطة</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminDashboard;
