import { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Progress } from '../components/ui/progress';
import { BookOpen, Clock, Users, Trophy, Calendar, CheckCircle, XCircle } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const StudentDashboard = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [activities, setActivities] = useState([]);
  const [rankings, setRankings] = useState({ scores: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [statsRes, activitiesRes, rankingsRes] = await Promise.all([
        axios.get(`${API}/statistics/student/${user?.id}`),
        axios.get(`${API}/activities`),
        axios.get(`${API}/rankings/weekly`)
      ]);
      
      setStats(statsRes.data);
      setActivities(activitiesRes.data.slice(0, 3));
      setRankings(rankingsRes.data);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getMyRank = () => {
    const myScore = rankings.scores.find(s => s.student_id === user?.id);
    return myScore || null;
  };

  const myRank = getMyRank();
  const myPosition = rankings.scores.findIndex(s => s.student_id === user?.id) + 1;

  const getRankStyle = (rank) => {
    switch (rank) {
      case 'gold':
        return { bg: 'bg-amber-500/20', text: 'text-amber-400', label: 'ذهبي' };
      case 'silver':
        return { bg: 'bg-slate-400/20', text: 'text-slate-300', label: 'فضي' };
      case 'bronze':
        return { bg: 'bg-orange-500/20', text: 'text-orange-400', label: 'برونزي' };
      default:
        return { bg: 'bg-slate-700/20', text: 'text-slate-400', label: 'مشارك' };
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fadeIn" data-testid="student-dashboard">
      {/* Welcome & Rank */}
      <div className="glass-card p-6 border border-white/10">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white mb-2">مرحباً، {user?.name}</h1>
            <p className="text-slate-400">تابع تقدمك في حفظ القرآن الكريم</p>
          </div>
          {myRank && (
            <div className={`flex items-center gap-3 px-6 py-3 rounded-xl ${getRankStyle(myRank.rank).bg}`}>
              <Trophy className={`w-8 h-8 ${getRankStyle(myRank.rank).text}`} />
              <div>
                <p className={`text-lg font-bold ${getRankStyle(myRank.rank).text}`}>
                  المركز {myPosition}
                </p>
                <p className="text-slate-400 text-sm">{getRankStyle(myRank.rank).label}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="glass-card border-white/10">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <p className="text-slate-400 text-sm">إجمالي الصلوات</p>
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                <BookOpen className="w-5 h-5 text-emerald-400" />
              </div>
            </div>
            <p className="text-3xl font-bold text-white">{stats?.tracking?.total_prayers || 0}</p>
          </CardContent>
        </Card>

        <Card className="glass-card border-white/10">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <p className="text-slate-400 text-sm">وقت الجلوس مع القرآن</p>
              <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
                <Clock className="w-5 h-5 text-blue-400" />
              </div>
            </div>
            <p className="text-3xl font-bold text-white">{stats?.tracking?.total_quran_time || 0}</p>
            <p className="text-slate-500 text-sm">دقيقة</p>
          </CardContent>
        </Card>

        <Card className="glass-card border-white/10">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <p className="text-slate-400 text-sm">التسميع للأهل</p>
              <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
                <Users className="w-5 h-5 text-purple-400" />
              </div>
            </div>
            <p className="text-3xl font-bold text-white">{stats?.tracking?.total_family_recitation || 0}</p>
            <p className="text-slate-500 text-sm">مرة</p>
          </CardContent>
        </Card>

        <Card className="glass-card border-white/10">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <p className="text-slate-400 text-sm">إجمالي الآيات</p>
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
                <BookOpen className="w-5 h-5 text-amber-400" />
              </div>
            </div>
            <p className="text-3xl font-bold text-white">{stats?.recitation?.total_verses || 0}</p>
            <p className="text-slate-500 text-sm">آية</p>
          </CardContent>
        </Card>
      </div>

      {/* Progress & Attendance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recitation Score */}
        <Card className="glass-card border-white/10">
          <CardHeader>
            <CardTitle className="text-xl font-bold text-white">متوسط درجة التسميع</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <Progress 
                  value={(stats?.recitation?.average_score || 0) * 10} 
                  className="h-4 bg-slate-700"
                />
              </div>
              <span className="text-2xl font-bold text-emerald-400">
                {stats?.recitation?.average_score || 0}/10
              </span>
            </div>
            <p className="text-slate-400 text-sm mt-4">
              عدد التسميعات: {stats?.recitation?.recitations_count || 0}
            </p>
          </CardContent>
        </Card>

        {/* Attendance */}
        <Card className="glass-card border-white/10">
          <CardHeader>
            <CardTitle className="text-xl font-bold text-white">نسبة الحضور</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <Progress 
                  value={stats?.attendance?.percentage || 0} 
                  className="h-4 bg-slate-700"
                />
              </div>
              <span className="text-2xl font-bold text-emerald-400">
                {stats?.attendance?.percentage || 0}%
              </span>
            </div>
            <div className="flex items-center gap-6 mt-4">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-emerald-400" />
                <span className="text-slate-300">حضور: {stats?.attendance?.present || 0}</span>
              </div>
              <div className="flex items-center gap-2">
                <XCircle className="w-5 h-5 text-red-400" />
                <span className="text-slate-300">غياب: {stats?.attendance?.absent || 0}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Upcoming Activities */}
      <Card className="glass-card border-white/10">
        <CardHeader>
          <CardTitle className="text-xl font-bold text-white flex items-center gap-3">
            <Calendar className="w-6 h-6 text-emerald-400" />
            الأنشطة القادمة
          </CardTitle>
        </CardHeader>
        <CardContent>
          {activities.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              لا توجد أنشطة قادمة
            </div>
          ) : (
            <div className="space-y-4">
              {activities.map((activity) => (
                <div
                  key={activity.id}
                  className="p-4 rounded-xl bg-slate-800/50 border border-white/5 hover:border-emerald-500/30 transition-all"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-lg font-bold text-white">{activity.title}</h3>
                      <p className="text-slate-400 text-sm mt-1">{activity.description}</p>
                    </div>
                    <div className="text-left">
                      <p className="text-emerald-400 font-medium">{activity.date}</p>
                      <p className="text-slate-500 text-sm">{activity.time}</p>
                    </div>
                  </div>
                  {activity.location && (
                    <p className="text-slate-500 text-sm mt-2">📍 {activity.location}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* My Score Details */}
      {myRank && (
        <Card className="glass-card border-white/10">
          <CardHeader>
            <CardTitle className="text-xl font-bold text-white">تفاصيل نقاطي</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="p-4 rounded-xl bg-slate-800/50 text-center">
                <p className="text-slate-400 text-sm">نقاط المتابعة</p>
                <p className="text-2xl font-bold text-white mt-2">{myRank.tracking_score}</p>
              </div>
              <div className="p-4 rounded-xl bg-slate-800/50 text-center">
                <p className="text-slate-400 text-sm">نقاط التسميع</p>
                <p className="text-2xl font-bold text-white mt-2">{myRank.recitation_score}</p>
              </div>
              <div className="p-4 rounded-xl bg-slate-800/50 text-center">
                <p className="text-slate-400 text-sm">نقاط الحضور</p>
                <p className="text-2xl font-bold text-white mt-2">{myRank.attendance_score}%</p>
              </div>
              <div className="p-4 rounded-xl bg-emerald-500/20 text-center">
                <p className="text-emerald-400 text-sm">المجموع</p>
                <p className="text-2xl font-bold text-emerald-400 mt-2">{myRank.total_score}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default StudentDashboard;
