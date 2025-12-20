import { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Progress } from '../components/ui/progress';
import { Badge } from '../components/ui/badge';
import { CircularGauge } from '../components/ui/circular-gauge';
import { 
  BookOpen, Clock, Users, Trophy, Calendar, CheckCircle, 
  User, Phone, School, Home, Star, AlertTriangle, Award,
  Sunrise, Moon, BookMarked, Hand, Mail, Cake, MapPin, GraduationCap
} from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const StudentDashboard = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [activities, setActivities] = useState([]);
  const [rankings, setRankings] = useState({ scores: [] });
  const [groupInfo, setGroupInfo] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    if (!user?.id) return;
    
    try {
      const [statsRes, activitiesRes, rankingsRes] = await Promise.all([
        axios.get(`${API}/statistics/student/${user.id}`),
        axios.get(`${API}/activities`),
        axios.get(`${API}/rankings/weekly`)
      ]);
      
      setStats(statsRes.data);
      setActivities(activitiesRes.data.slice(0, 3));
      setRankings(rankingsRes.data);
      
      // جلب معلومات المجموعة
      if (statsRes.data?.student?.group_id) {
        try {
          const groupsRes = await axios.get(`${API}/groups`);
          const studentGroup = groupsRes.data.find(g => g.id === statsRes.data.student.group_id);
          if (studentGroup) {
            setGroupInfo(studentGroup);
          }
        } catch (e) {
          console.error('Error fetching group:', e);
        }
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [user?.id]);

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

  const getTajweedBadgeColor = (level) => {
    const colors = {
      'تلاوة عامة': 'bg-slate-500/20 text-slate-400',
      'تمهيدية': 'bg-slate-400/20 text-slate-300',
      'متوسطة': 'bg-blue-500/20 text-blue-400',
      'متقدمة': 'bg-amber-500/20 text-amber-400',
      'إجازة': 'bg-emerald-500/20 text-emerald-400',
      'اتقان': 'bg-purple-500/20 text-purple-400',
      'سند غيبي': 'bg-amber-600/20 text-amber-500',
      'روايات أخرى': 'bg-cyan-500/20 text-cyan-400'
    };
    return colors[level] || 'bg-slate-500/20 text-slate-400';
  };

  const calculateAge = (birthDate) => {
    if (!birthDate) return null;
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('ar-SA', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const studentAge = calculateAge(stats?.student?.birth_date);

  return (
    <div className="space-y-6 animate-fadeIn" data-testid="student-dashboard">
      {/* Welcome & Points Header */}
      <div className="glass-card p-4 md:p-6 border border-white/10">
        <div className="flex flex-col gap-4 md:gap-6">
          {/* Profile Image & Name */}
          <div className="flex items-center gap-3 md:gap-4">
            {stats?.student?.profile_image ? (
              <img 
                src={stats.student.profile_image} 
                alt="صورة شخصية"
                className="w-14 h-14 md:w-20 md:h-20 rounded-xl md:rounded-2xl object-cover border-2 border-emerald-500/30"
              />
            ) : (
              <div className="w-14 h-14 md:w-20 md:h-20 rounded-xl md:rounded-2xl bg-emerald-500/20 flex items-center justify-center">
                <User className="w-7 h-7 md:w-10 md:h-10 text-emerald-400" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg md:text-2xl font-bold text-white truncate">{stats?.student?.name || user?.name}</h1>
                {/* اسم المجموعة */}
                {groupInfo && (
                  <Badge className="bg-purple-500/20 text-purple-400 text-[10px] md:text-xs">
                    <Users className="w-3 h-3 ml-1" />
                    {groupInfo.name}
                  </Badge>
                )}
              </div>
              <div className="flex flex-wrap gap-1 md:gap-2 mt-1 md:mt-2">
                {stats?.student?.tajweed_level && (
                  <Badge className={`${getTajweedBadgeColor(stats.student.tajweed_level)} text-[10px] md:text-xs`}>
                    <Star className="w-2.5 h-2.5 md:w-3 md:h-3 ml-1" />
                    {stats.student.tajweed_level}
                  </Badge>
                )}
                {studentAge && (
                  <Badge className="bg-blue-500/20 text-blue-400 text-[10px] md:text-xs">
                    <Cake className="w-2.5 h-2.5 md:w-3 md:h-3 ml-1" />
                    {studentAge} سنة
                  </Badge>
                )}
                {/* المعدل GPA */}
                {stats?.student?.school_average && (
                  <Badge className="bg-amber-500/20 text-amber-400 text-[10px] md:text-xs">
                    <GraduationCap className="w-2.5 h-2.5 md:w-3 md:h-3 ml-1" />
                    المعدل: {stats.student.school_average}
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {/* Rank & Total Points */}
          <div className="grid grid-cols-2 gap-2 md:gap-4">
            {myRank && (
              <div className={`flex items-center gap-2 md:gap-3 px-3 md:px-5 py-2 md:py-3 rounded-xl ${getRankStyle(myRank.rank).bg}`}>
                <Trophy className={`w-6 h-6 md:w-8 md:h-8 ${getRankStyle(myRank.rank).text}`} />
                <div>
                  <p className={`text-sm md:text-lg font-bold ${getRankStyle(myRank.rank).text}`}>
                    المركز {myPosition}
                  </p>
                  <p className="text-slate-400 text-[10px] md:text-sm">{getRankStyle(myRank.rank).label}</p>
                </div>
              </div>
            )}
            <div className="flex items-center gap-2 md:gap-3 px-3 md:px-5 py-2 md:py-3 rounded-xl bg-emerald-500/20 border border-emerald-500/30">
              <Award className="w-6 h-6 md:w-8 md:h-8 text-emerald-400" />
              <div>
                <p className="text-xl md:text-2xl font-bold text-emerald-400">{stats?.total_points || 0}</p>
                <p className="text-slate-400 text-[10px] md:text-sm">مجموع النقاط</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Personal Info Card - Detailed */}
      <Card className="glass-card border-white/10">
        <CardHeader className="pb-2 md:pb-3">
          <CardTitle className="text-base md:text-lg font-bold text-white flex items-center gap-2">
            <User className="w-4 h-4 md:w-5 md:h-5 text-emerald-400" />
            بياناتي الشخصية
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
            {/* Name */}
            <div className="p-3 md:p-4 rounded-xl bg-slate-800/50 border border-white/5">
              <div className="flex items-center gap-2 md:gap-3">
                <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                  <User className="w-4 h-4 md:w-5 md:h-5 text-emerald-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-slate-400 text-[10px] md:text-xs">الاسم الكامل</p>
                  <p className="text-white font-bold text-sm md:text-base truncate">{stats?.student?.name || user?.name || '-'}</p>
                </div>
              </div>
            </div>

            {/* Email */}
            <div className="p-3 md:p-4 rounded-xl bg-slate-800/50 border border-white/5">
              <div className="flex items-center gap-2 md:gap-3">
                <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                  <Mail className="w-4 h-4 md:w-5 md:h-5 text-blue-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-slate-400 text-[10px] md:text-xs">البريد الإلكتروني</p>
                  <p className="text-white font-medium text-xs md:text-sm truncate" dir="ltr">{stats?.student?.email || user?.email || '-'}</p>
                </div>
              </div>
            </div>

            {/* Age & Birth Date */}
            <div className="p-3 md:p-4 rounded-xl bg-slate-800/50 border border-white/5">
              <div className="flex items-center gap-2 md:gap-3">
                <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg bg-pink-500/20 flex items-center justify-center flex-shrink-0">
                  <Cake className="w-4 h-4 md:w-5 md:h-5 text-pink-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-slate-400 text-[10px] md:text-xs">العمر / تاريخ الميلاد</p>
                  <p className="text-white font-bold text-sm md:text-base">
                    {studentAge ? `${studentAge} سنة` : '-'}
                  </p>
                </div>
              </div>
            </div>

            {/* School */}
            <div className="p-3 md:p-4 rounded-xl bg-slate-800/50 border border-white/5">
              <div className="flex items-center gap-2 md:gap-3">
                <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                  <School className="w-4 h-4 md:w-5 md:h-5 text-amber-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-slate-400 text-[10px] md:text-xs">المدرسة / الصف</p>
                  <p className="text-white font-bold text-sm md:text-base truncate">{stats?.student?.school_name || '-'}</p>
                  {stats?.student?.school_grade && (
                    <p className="text-amber-400 text-[10px] md:text-xs">{stats.student.school_grade}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Mosque */}
            <div className="p-3 md:p-4 rounded-xl bg-slate-800/50 border border-white/5">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
                  <Home className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <p className="text-slate-400 text-xs">المسجد</p>
                  <p className="text-white font-bold">{stats?.student?.mosque_name || '-'}</p>
                </div>
              </div>
            </div>

            {/* Registration Date */}
            <div className="p-4 rounded-xl bg-slate-800/50 border border-white/5">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-lg bg-cyan-500/20 flex items-center justify-center">
                  <Calendar className="w-5 h-5 text-cyan-400" />
                </div>
                <div>
                  <p className="text-slate-400 text-xs">تاريخ التسجيل في المركز</p>
                  <p className="text-white font-bold">{formatDate(stats?.student?.registration_date)}</p>
                </div>
              </div>
            </div>

            {/* Phone Numbers */}
            <div className="p-4 rounded-xl bg-slate-800/50 border border-white/5 md:col-span-2 lg:col-span-3">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center">
                  <Phone className="w-5 h-5 text-green-400" />
                </div>
                <p className="text-slate-400 text-sm">أرقام الهواتف</p>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center p-3 rounded-lg bg-slate-900/50">
                  <p className="text-slate-400 text-xs mb-1">هاتف الطالب</p>
                  <p className="text-emerald-400 font-bold" dir="ltr">{stats?.student?.student_phone || '-'}</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-slate-900/50">
                  <p className="text-slate-400 text-xs mb-1">هاتف الأب</p>
                  <p className="text-blue-400 font-bold" dir="ltr">{stats?.student?.father_phone || '-'}</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-slate-900/50">
                  <p className="text-slate-400 text-xs mb-1">هاتف الأم</p>
                  <p className="text-pink-400 font-bold" dir="ltr">{stats?.student?.mother_phone || '-'}</p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Memorization & Attendance/Recitation Gauges */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Memorization Progress */}
        <Card className="glass-card border-white/10">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-emerald-400" />
              مقدار الحفظ
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">إجمالي الصفحات المحفوظة</span>
                <span className="text-2xl font-bold text-emerald-400">
                  {stats?.memorization?.total_memorized || 0} صفحة
                </span>
              </div>
              <Progress 
                value={stats?.memorization?.percentage || 0} 
                className="h-4 bg-slate-700"
              />
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">
                  {stats?.memorization?.percentage || 0}% من القرآن
                </span>
                <span className="text-slate-500">604 صفحة</span>
              </div>
              
              {/* تقسيم الحفظ إلى صفحات وأجزاء */}
              <div className="grid grid-cols-2 gap-3 mt-4">
                <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 border border-emerald-500/20 text-center">
                  <BookOpen className="w-8 h-8 mx-auto text-emerald-400 mb-2" />
                  <p className="text-2xl font-bold text-white">{stats?.memorization?.total_previous || 0}</p>
                  <p className="text-emerald-400 text-sm">صفحة محفوظة</p>
                </div>
                <div className="p-4 rounded-xl bg-gradient-to-br from-blue-500/10 to-blue-500/5 border border-blue-500/20 text-center">
                  <BookMarked className="w-8 h-8 mx-auto text-blue-400 mb-2" />
                  <p className="text-2xl font-bold text-white">
                    {stats?.memorization?.previous_juz?.length || Math.floor((stats?.memorization?.total_memorized || 0) / 20)}
                  </p>
                  <p className="text-blue-400 text-sm">جزء محفوظ</p>
                </div>
              </div>
              
              {/* Tajweed Level */}
              {stats?.student?.tajweed_level && (
                <div className="mt-4 p-4 rounded-xl bg-gradient-to-r from-purple-500/10 to-blue-500/10 border border-purple-500/20">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-300">مستوى التجويد</span>
                    <Badge className={`${getTajweedBadgeColor(stats.student.tajweed_level)} text-lg px-4 py-1`}>
                      <Star className="w-4 h-4 ml-2" />
                      {stats.student.tajweed_level}
                    </Badge>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Attendance & Recitation - Circular Gauges */}
        <Card className="glass-card border-white/10">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-blue-400" />
              نسبة الحضور والتسميع
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-around py-4">
              {/* عداد الحضور */}
              <CircularGauge 
                value={stats?.attendance?.percentage || 0}
                maxValue={100}
                label="نسبة الحضور"
                color="dynamic"
                size="md"
                icon={CheckCircle}
              />
              
              {/* عداد التسميع */}
              <CircularGauge 
                value={(stats?.recitation?.average_rating || 0) * 10}
                maxValue={100}
                label="نسبة التسميع"
                color="dynamic"
                size="md"
                icon={Star}
              />
            </div>
            
            {/* تفاصيل إضافية */}
            <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-slate-700">
              <div className="text-center">
                <div className="flex items-center justify-center gap-2 text-xs">
                  <span className="text-emerald-400 flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" />
                    حضور: {stats?.attendance?.present || 0}
                  </span>
                  <span className="text-red-400">غياب: {stats?.attendance?.absent || 0}</span>
                </div>
                <p className="text-slate-500 text-xs mt-1">عذر: {stats?.attendance?.excused || 0}</p>
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center gap-2 text-xs">
                  <span className="text-amber-400 flex items-center gap-1">
                    <Star className="w-3 h-3" />
                    التقييم: {stats?.recitation?.average_rating || 0}/10
                  </span>
                </div>
                <p className="text-slate-500 text-xs mt-1">
                  {stats?.recitation?.recitations_count || 0} تسميع - {stats?.recitation?.passed_count || 0} اجتاز
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Prayers & Quran Time */}
      <Card className="glass-card border-white/10">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
            <Hand className="w-5 h-5 text-purple-400" />
            ورقة المتابعة الإيمانية
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <div className="p-4 rounded-xl bg-emerald-500/10 text-center">
              <BookMarked className="w-8 h-8 mx-auto text-emerald-400 mb-2" />
              <p className="text-2xl font-bold text-white">{stats?.tracking?.total_prayers || 0}</p>
              <p className="text-emerald-400 text-xs">الصلوات المفروضة</p>
            </div>
            <div className="p-4 rounded-xl bg-amber-500/10 text-center">
              <Clock className="w-8 h-8 mx-auto text-amber-400 mb-2" />
              <p className="text-2xl font-bold text-white">{stats?.tracking?.total_quran_time || 0}</p>
              <p className="text-amber-400 text-xs">الجلوس مع القرآن</p>
            </div>
            <div className="p-4 rounded-xl bg-purple-500/10 text-center">
              <Hand className="w-8 h-8 mx-auto text-purple-400 mb-2" />
              <p className="text-2xl font-bold text-white">{stats?.tracking?.total_adhkar || 0}</p>
              <p className="text-purple-400 text-xs">أذكار بعد الصلاة</p>
            </div>
            <div className="p-4 rounded-xl bg-blue-500/10 text-center">
              <Sunrise className="w-8 h-8 mx-auto text-blue-400 mb-2" />
              <p className="text-2xl font-bold text-white">{stats?.tracking?.total_sunnah || 0}</p>
              <p className="text-blue-400 text-xs">السنن الرواتب</p>
            </div>
            <div className="p-4 rounded-xl bg-indigo-500/10 text-center">
              <Moon className="w-8 h-8 mx-auto text-indigo-400 mb-2" />
              <p className="text-2xl font-bold text-white">{stats?.tracking?.total_witr || 0}</p>
              <p className="text-indigo-400 text-xs">صلاة الوتر</p>
            </div>
            
            <div className="p-4 rounded-xl bg-pink-500/10 text-center">
              <Users className="w-8 h-8 mx-auto text-pink-400 mb-2" />
              <p className="text-2xl font-bold text-white">{stats?.tracking?.total_family_recitation || 0}</p>
              <p className="text-pink-400 text-xs">التسميع للأهل</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Warnings & Alerts */}
      {(stats?.warnings?.count > 0) && (
        <Card className="glass-card border-red-500/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg font-bold text-red-400 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              التنبيهات والإنذارات ({stats?.warnings?.count})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {stats?.warnings?.list?.map((warning, index) => (
                <div key={index} className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge className="bg-red-500/20 text-red-400 text-xs">{warning.type}</Badge>
                    <span className="text-slate-500 text-xs">
                      {new Date(warning.date).toLocaleDateString('ar-SA')}
                    </span>
                  </div>
                  <p className="text-slate-300 text-sm">{warning.message}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Upcoming Activities */}
      {activities.length > 0 && (
        <Card className="glass-card border-white/10">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
              <Calendar className="w-5 h-5 text-emerald-400" />
              الأنشطة القادمة
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {activities.map((activity) => (
                <div
                  key={activity.id}
                  className="p-4 rounded-xl bg-slate-800/50 border border-white/5 hover:border-emerald-500/30 transition-all"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-white font-bold">{activity.title}</h3>
                      <p className="text-slate-400 text-sm mt-1">{activity.description}</p>
                    </div>
                    <div className="text-left">
                      <p className="text-emerald-400 font-medium text-sm">{activity.date}</p>
                      <p className="text-slate-500 text-xs">{activity.time}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default StudentDashboard;
