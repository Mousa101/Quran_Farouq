import { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Users, BookOpen, UserCheck, FileText, Plus, TrendingUp, Eye } from 'lucide-react';
import { Link } from 'react-router-dom';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const SheikhDashboard = () => {
  const { user } = useAuth();
  const [groups, setGroups] = useState([]);
  const [students, setStudents] = useState([]);
  const [recentRecitations, setRecentRecitations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [groupsRes, recitationsRes] = await Promise.all([
        axios.get(`${API}/groups`),
        axios.get(`${API}/recitations`)
      ]);
      
      setGroups(groupsRes.data);
      setRecentRecitations(recitationsRes.data.slice(0, 5));
      
      // Get students from all groups
      const allStudents = [];
      for (const group of groupsRes.data) {
        const studentsRes = await axios.get(`${API}/groups/${group.id}/students`);
        allStudents.push(...studentsRes.data);
      }
      setStudents(allStudents);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const quickActions = [
    { to: '/groups', icon: Users, label: 'إدارة المجموعات', color: 'emerald' },
    { to: '/tracking', icon: FileText, label: 'رفع ورقة متابعة', color: 'blue' },
    { to: '/recitations', icon: BookOpen, label: 'تسجيل تسميع', color: 'purple' },
    { to: '/attendance', icon: UserCheck, label: 'تسجيل الحضور', color: 'amber' },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fadeIn" data-testid="sheikh-dashboard">
      {/* Welcome */}
      <div className="glass-card p-6 border border-white/10">
        <h1 className="text-2xl font-bold text-white mb-2">مرحباً، الشيخ {user?.name}</h1>
        <p className="text-slate-400">إدارة حلقات التحفيظ والطلاب</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="glass-card border-white/10">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-sm">المجموعات</p>
                <p className="text-3xl font-bold text-white mt-1">{groups.length}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                <Users className="w-6 h-6 text-emerald-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card border-white/10">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-sm">الطلاب</p>
                <p className="text-3xl font-bold text-white mt-1">{students.length}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center">
                <BookOpen className="w-6 h-6 text-blue-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card border-white/10">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-sm">التسميعات هذا الأسبوع</p>
                <p className="text-3xl font-bold text-white mt-1">{recentRecitations.length}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-purple-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card className="glass-card border-white/10">
        <CardHeader>
          <CardTitle className="text-xl font-bold text-white">إجراءات سريعة</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {quickActions.map((action) => (
              <Link key={action.to} to={action.to}>
                <Button
                  variant="ghost"
                  className={`w-full h-24 flex flex-col items-center justify-center gap-2 bg-${action.color}-500/10 hover:bg-${action.color}-500/20 border border-${action.color}-500/30 rounded-xl transition-all`}
                  data-testid={`quick-action-${action.to.replace('/', '')}`}
                >
                  <action.icon className={`w-8 h-8 text-${action.color}-400`} />
                  <span className="text-white text-sm">{action.label}</span>
                </Button>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* My Groups */}
      <Card className="glass-card border-white/10">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-xl font-bold text-white">مجموعاتي</CardTitle>
          <Link to="/groups">
            <Button size="sm" className="bg-emerald-500 hover:bg-emerald-600">
              <Plus className="w-4 h-4 ml-2" />
              إضافة مجموعة
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {groups.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              لم تقم بإنشاء أي مجموعة بعد
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {groups.map((group) => (
                <div
                  key={group.id}
                  className="p-4 rounded-xl bg-slate-800/50 border border-white/5 hover:border-emerald-500/30 transition-all"
                >
                  <h3 className="text-lg font-bold text-white">{group.name}</h3>
                  <p className="text-slate-400 text-sm mt-1">{group.description || 'لا يوجد وصف'}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Recitations */}
      <Card className="glass-card border-white/10">
        <CardHeader>
          <CardTitle className="text-xl font-bold text-white">آخر التسميعات</CardTitle>
        </CardHeader>
        <CardContent>
          {recentRecitations.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              لا توجد تسميعات مسجلة
            </div>
          ) : (
            <div className="space-y-3">
              {recentRecitations.map((rec) => (
                <div
                  key={rec.id}
                  className="p-4 rounded-xl bg-slate-800/50 border border-white/5 flex items-center justify-between"
                >
                  <div>
                    <p className="text-white font-medium">سورة {rec.surah_name}</p>
                    <p className="text-slate-400 text-sm">آية {rec.verses_from} - {rec.verses_to}</p>
                  </div>
                  <div className="text-left">
                    <span className={`px-3 py-1 rounded-full text-sm font-bold ${
                      rec.quality_score >= 8 ? 'bg-emerald-500/20 text-emerald-400' :
                      rec.quality_score >= 5 ? 'bg-amber-500/20 text-amber-400' :
                      'bg-red-500/20 text-red-400'
                    }`}>
                      {rec.quality_score}/10
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default SheikhDashboard;
