import { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { 
  Users, BookOpen, UserCheck, FileText, TrendingUp, Eye,
  User, Mail, Phone, Home, Calendar, Briefcase, Star, Edit
} from 'lucide-react';
import { Link } from 'react-router-dom';
import AnnouncementBanner from '../components/AnnouncementBanner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const SheikhDashboard = () => {
  const { user } = useAuth();
  const [groups, setGroups] = useState([]);
  const [students, setStudents] = useState([]);
  const [recentRecitations, setRecentRecitations] = useState([]);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [groupsRes, recitationsRes, profileRes] = await Promise.all([
        axios.get(`${API}/groups`),
        axios.get(`${API}/recitations`),
        axios.get(`${API}/users/me/full`)
      ]);
      
      setGroups(groupsRes.data);
      setRecentRecitations(recitationsRes.data.slice(0, 5));
      setProfile(profileRes.data);
      
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
    { to: '/attendance', icon: UserCheck, label: 'تسجيل الحضور', color: 'amber' },
    { to: '/tracking', icon: FileText, label: 'رفع ورقة متابعة', color: 'blue' },
    { to: '/recitations', icon: BookOpen, label: 'تسجيل تسميع', color: 'purple' }
    
  ];

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('ar-SA');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6 animate-fadeIn" data-testid="sheikh-dashboard">
      {/* N1: شريط إعلانات المدير */}
      <AnnouncementBanner />
      {/* Welcome & Profile Header */}
      <div className="glass-card p-4 md:p-6 border border-white/10">
        <div className="flex flex-col md:flex-row md:items-center gap-4 md:gap-6">
          {/* Profile Image & Name */}
          <div className="flex items-center gap-3 md:gap-4">
            {profile?.profile_image ? (
              <img 
                src={profile.profile_image} 
                alt="صورة شخصية"
                className="w-16 h-16 md:w-20 md:h-20 rounded-xl md:rounded-2xl object-cover border-2 border-blue-500/30"
              />
            ) : (
              <div className="w-16 h-16 md:w-20 md:h-20 rounded-xl md:rounded-2xl bg-blue-500/20 flex items-center justify-center">
                <User className="w-8 h-8 md:w-10 md:h-10 text-blue-400" />
              </div>
            )}
            <div>
              <h1 className="text-lg md:text-2xl font-bold text-white">المشرف {user?.name}</h1>
              <div className="flex flex-wrap gap-1 md:gap-2 mt-1 md:mt-2">
                {profile?.specialization && (
                  <Badge className="bg-blue-500/20 text-blue-400 text-[10px] md:text-xs">
                    <Briefcase className="w-2.5 h-2.5 md:w-3 md:h-3 ml-1" />
                    {profile.specialization}
                  </Badge>
                )}
                {profile?.experience_years && (
                  <Badge className="bg-amber-500/20 text-amber-400 text-[10px] md:text-xs">
                    <Star className="w-2.5 h-2.5 md:w-3 md:h-3 ml-1" />
                    {profile.experience_years} سنة خبرة
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {/* Stats Summary */}
          <div className="flex-1 grid grid-cols-2 gap-2 md:gap-4">
            <div className="text-center p-2 md:p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
              <p className="text-xl md:text-2xl font-bold text-emerald-400">{groups.length}</p>
              <p className="text-slate-400 text-[10px] md:text-xs">مجموعة</p>
            </div>
            <div className="text-center p-2 md:p-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
              <p className="text-xl md:text-2xl font-bold text-blue-400">{students.length}</p>
              <p className="text-slate-400 text-[10px] md:text-xs">طالب</p>
            </div>
            
          </div>
        </div>
      </div>

      {/* Personal Info Card */}
      <Card className="glass-card border-white/10">
        <CardHeader className="pb-2 md:pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base md:text-lg font-bold text-white flex items-center gap-2">
            <User className="w-4 h-4 md:w-5 md:h-5 text-blue-400" />
            بياناتي الشخصية
          </CardTitle>
          <Link to="/sheikh-edit-profile">
            <Button size="sm" variant="outline" className="h-7 md:h-8 text-xs border-blue-500/30 text-blue-400 hover:bg-blue-500/10">
              <Edit className="w-3 h-3 ml-1" />
              تعديل
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 md:gap-3">
            {/* Email */}
            <div className="p-2 md:p-3 rounded-xl bg-slate-800/50 border border-white/5">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 md:w-8 md:h-8 rounded-lg bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                  <Mail className="w-3.5 h-3.5 md:w-4 md:h-4 text-blue-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-slate-400 text-[10px] md:text-xs">البريد</p>
                  <p className="text-white font-medium text-xs md:text-sm truncate" dir="ltr">{profile?.email || '-'}</p>
                </div>
              </div>
            </div>

            {/* Phone */}
            <div className="p-2 md:p-3 rounded-xl bg-slate-800/50 border border-white/5">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 md:w-8 md:h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                  <Phone className="w-3.5 h-3.5 md:w-4 md:h-4 text-emerald-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-slate-400 text-[10px] md:text-xs">الهاتف</p>
                  <p className="text-white font-medium text-xs md:text-sm" dir="ltr">{profile?.student_phone || '-'}</p>
                </div>
              </div>
            </div>

            {/* Mosque */}
            <div className="p-2 md:p-3 rounded-xl bg-slate-800/50 border border-white/5">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 md:w-8 md:h-8 rounded-lg bg-purple-500/20 flex items-center justify-center flex-shrink-0">
                  <Home className="w-3.5 h-3.5 md:w-4 md:h-4 text-purple-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-slate-400 text-[10px] md:text-xs">المسجد</p>
                  <p className="text-white font-medium text-xs md:text-sm truncate">{profile?.mosque_name || '-'}</p>
                </div>
              </div>
            </div>

            {/* Join Date */}
            <div className="p-2 md:p-3 rounded-xl bg-slate-800/50 border border-white/5">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 md:w-8 md:h-8 rounded-lg bg-cyan-500/20 flex items-center justify-center flex-shrink-0">
                  <Calendar className="w-3.5 h-3.5 md:w-4 md:h-4 text-cyan-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-slate-400 text-[10px] md:text-xs">تاريخ الالتحاق</p>
                  <p className="text-white font-medium text-xs md:text-sm">{formatDate(profile?.join_date || profile?.registration_date)}</p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card className="glass-card border-white/10">
        <CardHeader className="pb-2 md:pb-3">
          <CardTitle className="text-base md:text-lg font-bold text-white">إجراءات سريعة</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4">
            {quickActions.map((action) => (
              <Link key={action.to} to={action.to}>
                <Button
                  variant="ghost"
                  className={`w-full h-16 md:h-24 flex flex-col items-center justify-center gap-1 md:gap-2 bg-${action.color}-500/10 hover:bg-${action.color}-500/20 border border-${action.color}-500/30 rounded-xl transition-all`}
                  data-testid={`quick-action-${action.to.replace('/', '')}`}
                >
                  <action.icon className={`w-5 h-5 md:w-8 md:h-8 text-${action.color}-400`} />
                  <span className="text-white text-[10px] md:text-sm">{action.label}</span>
                </Button>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>

     
    </div>
  );
};

export default SheikhDashboard;
