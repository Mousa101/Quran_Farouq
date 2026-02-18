import { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Progress } from '../components/ui/progress';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { CircularGauge } from '../components/ui/circular-gauge';
import { toast } from 'sonner';
import { 
  BookOpen, Clock, Users, Trophy, Calendar, CheckCircle, 
  User, Phone, School, Home, Star, AlertTriangle, Award,
  Sunrise, Moon, BookMarked, Hand, Mail, Cake, MapPin, GraduationCap,
  ChevronDown, ChevronUp, Plus, Edit2, Sparkles
} from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const StudentDashboard = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [activities, setActivities] = useState([]);
  const [rankings, setRankings] = useState({ scores: [] });
  const [groupInfo, setGroupInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showMorePersonal, setShowMorePersonal] = useState(false);
  const [trackingDialogOpen, setTrackingDialogOpen] = useState(false);
  const [submittingTracking, setSubmittingTracking] = useState(false);
  const [trackingForm, setTrackingForm] = useState({
    prayers_count: 0,
    adhkar_after_prayer: 0,  // أذكار بعد الصلاة
    quran_sitting_days: 0,
    duha_prayers: 0,
    family_recitation: 0,
    study_hours: 0,
    witr_prayers_days: 0,
    sunnah_prayers: 0,
    night_prayer: 0,
    fasting: 0,
    notes: ''
  });

  const fetchData = async () => {
    if (!user?.id) return;
    
    try {
      const [statsRes, activitiesRes, rankingsRes] = await Promise.all([
        axios.get(`${API}/statistics/student/${user.id}`),
        axios.get(`${API}/activities`),
        axios.get(`${API}/rankings/group`)  // ترتيب حسب المجموعة فقط
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
    // استخدم my_rank من API الجديد أو ابحث في القائمة
    if (rankings.my_rank) return rankings.my_rank;
    const myScore = rankings.scores?.find(s => s.student_id === user?.id);
    return myScore || null;
  };

  const myRank = getMyRank();
  const myPosition = myRank?.position || (rankings.scores?.findIndex(s => s.student_id === user?.id) + 1) || 0;
  const totalInGroup = rankings.total_in_group || rankings.scores?.length || 0;

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

  // تقديم ورقة المتابعة من حساب الطالب
  const handleSubmitTracking = async () => {
    setSubmittingTracking(true);
    try {
      // الحصول على تاريخ بداية الأسبوع الحالي (الأحد)
      const today = new Date();
      const sunday = new Date(today);
      sunday.setDate(today.getDate() - today.getDay());
      const week_start = sunday.toISOString().split('T')[0];
      
      // تحويل القيم لأرقام صحيحة وتجنب إرسال undefined أو NaN
      const formDataToSend = {
        week_start,
        prayers_count: parseInt(trackingForm.prayers_count) || 0,
        adhkar_after_prayer: parseInt(trackingForm.adhkar_after_prayer) || 0,
        quran_sitting_days: parseInt(trackingForm.quran_sitting_days) || 0,
        duha_prayers: parseInt(trackingForm.duha_prayers) || 0,
        family_recitation: parseInt(trackingForm.family_recitation) || 0,
        study_hours: parseInt(trackingForm.study_hours) || 0,
        witr_prayers_days: parseInt(trackingForm.witr_prayers_days) || 0,
        sunnah_prayers: parseInt(trackingForm.sunnah_prayers) || 0,
        night_prayer: parseInt(trackingForm.night_prayer) || 0,
        fasting: parseInt(trackingForm.fasting) || 0,
        notes: trackingForm.notes || ''
      };
      
      const response = await axios.post(`${API}/tracking-sheets/student`, formDataToSend);
      
      // عرض رسالة نجاح مع النقاط المكتسبة
      const pointsEarned = response.data.points_earned || 0;
      if (response.data.submitted_outside_window) {
        toast.warning(`تم حفظ ورقة المتابعة بدون نقاط (خارج وقت التسليم)`);
      } else {
        toast.success(`تم حفظ ورقة المتابعة بنجاح! +${pointsEarned} نقطة`);
      }
      
      setTrackingDialogOpen(false);
      
      // تحديث البيانات فوراً بدون reload
      await fetchData();
      
      // إعادة تعيين النموذج فقط بعد النجاح
      setTrackingForm({
        prayers_count: 0,
        adhkar_after_prayer: 0,
        quran_sitting_days: 0,
        duha_prayers: 0,
        family_recitation: 0,
        study_hours: 0,
        witr_prayers_days: 0,
        sunnah_prayers: 0,
        night_prayer: 0,
        fasting: 0,
        notes: ''
      });
    } catch (error) {
      console.error('Error submitting tracking:', error);
      const errorMsg = error.response?.data?.detail || 'فشل في حفظ ورقة المتابعة';
      toast.error(errorMsg);
    } finally {
      setSubmittingTracking(false);
    }
  };

  const calculateTrackingPoints = () => {
    const prayers = Math.min(trackingForm.prayers_count, 35);
    const adhkar = Math.min(trackingForm.adhkar_after_prayer || 0, 7);  // أذكار بعد الصلاة
    const quran = Math.min(trackingForm.quran_sitting_days, 7);
    const duha = Math.min(trackingForm.duha_prayers, 7);
    const family = Math.min(trackingForm.family_recitation, 7);
    const study = Math.min(trackingForm.study_hours, 7);
    const witr = Math.min(trackingForm.witr_prayers_days, 7);
    const sunnah = Math.min(trackingForm.sunnah_prayers, 7);
    // قيام الليل: إذا أتم يوم = 8 نقاط كاملة
    const night = trackingForm.night_prayer >= 1 ? 8 : 0;
    // الصيام: إذا أتم يوم = 8 نقاط كاملة
    const fasting = trackingForm.fasting >= 1 ? 8 : 0;
    return Math.min(prayers + adhkar + quran + duha + family + study + witr + sunnah + night + fasting, 100);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const studentAge = calculateAge(stats?.student?.birth_date);
console.log(stats)
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
                    {myPosition} من {totalInGroup}
                  </p>
                  <p className="text-slate-400 text-[10px] md:text-sm">ترتيبك في المجموعة</p>
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
          <div className="flex items-center justify-between">
            <CardTitle className="text-base md:text-lg font-bold text-white flex items-center gap-2">
              <User className="w-4 h-4 md:w-5 md:h-5 text-emerald-400" />
              بياناتي الشخصية
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowMorePersonal(!showMorePersonal)}
              className="text-slate-400 hover:text-white"
            >
              {showMorePersonal ? (
                <>
                  <span className="text-xs ml-1">إخفاء</span>
                  <ChevronUp className="w-4 h-4" />
                </>
              ) : (
                <>
                  <span className="text-xs ml-1">إظهار المزيد</span>
                  <ChevronDown className="w-4 h-4" />
                </>
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* البيانات الأساسية - دائماً ظاهرة */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
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

            {/* Group */}
            <div className="p-3 md:p-4 rounded-xl bg-slate-800/50 border border-white/5">
              <div className="flex items-center gap-2 md:gap-3">
                <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg bg-indigo-500/20 flex items-center justify-center flex-shrink-0">
                  <Users className="w-4 h-4 md:w-5 md:h-5 text-indigo-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-slate-400 text-[10px] md:text-xs">المجموعة</p>
                  <p className="text-white font-bold text-sm md:text-base truncate">{groupInfo?.name || '-'}</p>
                </div>
              </div>
            </div>

            {/* School Average / GPA */}
            <div className="p-3 md:p-4 rounded-xl bg-slate-800/50 border border-white/5">
              <div className="flex items-center gap-2 md:gap-3">
                <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                  <GraduationCap className="w-4 h-4 md:w-5 md:h-5 text-amber-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-slate-400 text-[10px] md:text-xs">المعدل المدرسي</p>
                  <p className="text-amber-400 font-bold text-sm md:text-base truncate">{stats?.student?.school_average || '-'}</p>
                </div>
              </div>
            </div>

            {/* Tajweed Level */}
            <div className="p-3 md:p-4 rounded-xl bg-slate-800/50 border border-white/5">
              <div className="flex items-center gap-2 md:gap-3">
                <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg bg-purple-500/20 flex items-center justify-center flex-shrink-0">
                  <Star className="w-4 h-4 md:w-5 md:h-5 text-purple-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-slate-400 text-[10px] md:text-xs">مستوى التجويد</p>
                  <p className="text-purple-400 font-bold text-sm md:text-base truncate">{stats?.student?.tajweed_level || '-'}</p>
                </div>
              </div>
            </div>
          </div>

          {/* البيانات الإضافية - قابلة للطي */}
          {showMorePersonal && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4 mt-4 pt-4 border-t border-white/10 animate-fadeIn">
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
                <div className="flex items-center gap-2 md:gap-3">
                  <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg bg-cyan-500/20 flex items-center justify-center flex-shrink-0">
                    <Home className="w-4 h-4 md:w-5 md:h-5 text-cyan-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-slate-400 text-[10px] md:text-xs">المسجد</p>
                    <p className="text-white font-bold text-sm md:text-base truncate">{stats?.student?.mosque_name || '-'}</p>
                  </div>
                </div>
              </div>

              {/* Registration Date */}
              <div className="p-3 md:p-4 rounded-xl bg-slate-800/50 border border-white/5">
                <div className="flex items-center gap-2 md:gap-3">
                  <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg bg-teal-500/20 flex items-center justify-center flex-shrink-0">
                    <Calendar className="w-4 h-4 md:w-5 md:h-5 text-teal-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-slate-400 text-[10px] md:text-xs">تاريخ التسجيل</p>
                    <p className="text-white font-bold text-sm md:text-base truncate">{formatDate(stats?.student?.registration_date)}</p>
                  </div>
                </div>
              </div>

              {/* Join Date */}
              <div className="p-3 md:p-4 rounded-xl bg-slate-800/50 border border-white/5">
                <div className="flex items-center gap-2 md:gap-3">
                  <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg bg-green-500/20 flex items-center justify-center flex-shrink-0">
                    <Calendar className="w-4 h-4 md:w-5 md:h-5 text-green-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-slate-400 text-[10px] md:text-xs">تاريخ الانضمام</p>
                    <p className="text-white font-bold text-sm md:text-base truncate">{formatDate(stats?.student?.join_date)}</p>
                  </div>
                </div>
              </div>

              {/* Phone Numbers */}
              <div className="p-3 md:p-4 rounded-xl bg-slate-800/50 border border-white/5 col-span-1 sm:col-span-2 lg:col-span-3">
                <div className="flex items-center gap-2 md:gap-3 mb-2 md:mb-3">
                  <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg bg-green-500/20 flex items-center justify-center flex-shrink-0">
                    <Phone className="w-4 h-4 md:w-5 md:h-5 text-green-400" />
                  </div>
                  <p className="text-slate-400 text-xs md:text-sm">أرقام الهواتف</p>
                </div>
                <div className="grid grid-cols-3 gap-2 md:gap-4">
                  <div className="text-center p-2 md:p-3 rounded-lg bg-slate-900/50">
                    <p className="text-slate-400 text-[10px] md:text-xs mb-1">هاتف الطالب</p>
                    <p className="text-emerald-400 font-bold text-xs md:text-sm" dir="ltr">{stats?.student?.student_phone || '-'}</p>
                  </div>
                  <div className="text-center p-2 md:p-3 rounded-lg bg-slate-900/50">
                    <p className="text-slate-400 text-[10px] md:text-xs mb-1">هاتف الأب</p>
                    <p className="text-blue-400 font-bold text-xs md:text-sm" dir="ltr">{stats?.student?.father_phone || '-'}</p>
                  </div>
                  <div className="text-center p-2 md:p-3 rounded-lg bg-slate-900/50">
                    <p className="text-slate-400 text-[10px] md:text-xs mb-1">هاتف الأم</p>
                    <p className="text-pink-400 font-bold text-xs md:text-sm" dir="ltr">{stats?.student?.mother_phone || '-'}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* جدول بيانات الفصل الحالي */}
      <Card className="glass-card border-white/10">
        <CardHeader className="pb-2 md:pb-3">
          <CardTitle className="text-base md:text-lg font-bold text-white flex items-center gap-2">
            <Trophy className="w-4 h-4 md:w-5 md:h-5 text-amber-400" />
            إحصائياتي في الفصل الحالي
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-right text-slate-400 text-xs md:text-sm py-2 px-2">البيان</th>
                  <th className="text-center text-slate-400 text-xs md:text-sm py-2 px-2">القيمة</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-slate-800 hover:bg-slate-800/50">
                  <td className="py-3 px-2 text-slate-300 text-sm">
                    <div className="flex items-center gap-2">
                      <Award className="w-4 h-4 text-emerald-400" />
                      نقاط الفصل الحالي
                    </div>
                  </td>
                  <td className="py-3 px-2 text-center">
                    <span className="text-emerald-400 font-bold text-lg">{stats?.total_points || 0}</span>
                  </td>
                </tr>
                <tr className="border-b border-slate-800 hover:bg-slate-800/50">
                  <td className="py-3 px-2 text-slate-300 text-sm">
                    <div className="flex items-center gap-2">
                      <BookOpen className="w-4 h-4 text-purple-400" />
                      عدد مرات التسميع
                    </div>
                  </td>
                  <td className="py-3 px-2 text-center">
                    <span className="text-purple-400 font-bold text-lg">{stats?.recitation?.recitations_count || 0}</span>
                  </td>
                </tr>
                <tr className="border-b border-slate-800 hover:bg-slate-800/50">
                  <td className="py-3 px-2 text-slate-300 text-sm">
                    <div className="flex items-center gap-2">
                      <BookMarked className="w-4 h-4 text-blue-400" />
                      عدد ورق المتابعة
                    </div>
                  </td>
                  <td className="py-3 px-2 text-center">
                    <span className="text-blue-400 font-bold text-lg">{stats?.tracking?.sheets_count || 0}</span>
                  </td>
                </tr>
                <tr className="border-b border-slate-800 hover:bg-slate-800/50">
                  <td className="py-3 px-2 text-slate-300 text-sm">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-green-400" />
                      مجموع الدوام (حضور)
                    </div>
                  </td>
                  <td className="py-3 px-2 text-center">
                    <span className="text-green-400 font-bold text-lg">{stats?.attendance?.present || 0}</span>
                  </td>
                </tr>
                <tr className="border-b border-slate-800 hover:bg-slate-800/50">
                  <td className="py-3 px-2 text-slate-300 text-sm">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-red-400" />
                      أيام الغياب
                    </div>
                  </td>
                  <td className="py-3 px-2 text-center">
                    <span className="text-red-400 font-bold text-lg">{stats?.attendance?.absent || 0}</span>
                  </td>
                </tr>
                <tr className="hover:bg-slate-800/50">
                  <td className="py-3 px-2 text-slate-300 text-sm">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-amber-400" />
                      نسبة الحضور
                    </div>
                  </td>
                  <td className="py-3 px-2 text-center">
                    <span className="text-amber-400 font-bold text-lg">{stats?.attendance?.percentage || 0}%</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Memorization & Attendance/Recitation Gauges */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        {/* Memorization Progress */}
        <Card className="glass-card border-white/10">
          <CardHeader className="pb-2 md:pb-3">
            <CardTitle className="text-base md:text-lg font-bold text-white flex items-center gap-2">
              <BookOpen className="w-4 h-4 md:w-5 md:h-5 text-emerald-400" />
              مقدار الحفظ
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 md:space-y-4">
              
              {/* تقسيم الحفظ: القديم + الجديد */}
              <div className="grid grid-cols-1 gap-3 mt-4">
                {/* الحفظ القديم */}
                {/* المجموع الكلي */}
                <div className="p-3 md:p-4 rounded-xl bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 border border-emerald-500/20 text-center ">
                  <BookOpen className="w-6 h-6 md:w-8 md:h-8 mx-auto text-emerald-400 mb-2" />
                  <p className="text-xl md:text-2xl font-bold text-emerald-400">{stats?.memorization?.total_memorized  || 0}</p>
                  <p className="text-emerald-400 text-xs md:text-sm">المجموع الكلي</p>
                  <p className="text-emerald-500 text-[10px]">{Math.floor((stats?.memorization?.total_memorized || 0) / 20)} جزء</p>
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
              
              <div className="flex items-center justify-between">
                <span className="text-slate-400 text-sm md:text-base">إجمالي الصفحات المحفوظة</span>
                <span className="text-xl md:text-2xl font-bold text-emerald-400">
                  {stats?.memorization?.total_memorized || 0} صفحة
                </span>
              </div>
              <Progress 
                value={stats?.memorization?.percentage || 0} 
                className="h-4 bg-slate-700"
              />
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">604 صفحة</span>
                <span className="text-slate-500">
                  {stats?.memorization?.percentage || 0}% من القرآن
                </span>
              </div>
              
            </div>
          </CardContent>
        </Card>

        {/* Attendance & Recitation - Circular Gauges */}
        <Card className="glass-card border-white/10">
          <CardHeader className="pb-2 md:pb-3">
            <CardTitle className="text-base md:text-lg font-bold text-white flex items-center gap-2">
              <CheckCircle className="w-4 h-4 md:w-5 md:h-5 text-blue-400" />
              نسبة الحضور والتسميع
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-around py-2 md:py-4">
              {/* عداد الحضور */}
              <div className="block md:hidden">
                <CircularGauge 
                  value={stats?.attendance?.percentage || 0}
                  maxValue={100}
                  label="نسبة الحضور"
                  color="dynamic"
                  size="sm"
                  icon={CheckCircle}
                />
              </div>
              <div className="hidden md:block">
                <CircularGauge 
                  value={stats?.attendance?.percentage || 0}
                  maxValue={100}
                  label="نسبة الحضور"
                  color="dynamic"
                  size="md"
                  icon={CheckCircle}
                />
              </div>
              
              {/* عداد التسميع */}
              <div className="block md:hidden">
                <CircularGauge 
                  value={stats?.recitation?.recitation_rate || 0}
                  maxValue={100}
                  label="نسبة التسميع"
                  color="dynamic"
                  size="sm"
                  icon={Star}
                />
              </div>
              <div className="hidden md:block">
                <CircularGauge 
                  value={stats?.recitation?.recitation_rate || 0}
                  maxValue={100}
                  label="نسبة التسميع"
                  color="dynamic"
                  size="md"
                  icon={Star}
                />
              </div>
            </div>
            
            {/* تفاصيل إضافية */}
            <div className="grid grid-cols-2 gap-2 md:gap-3 mt-3 md:mt-4 pt-3 md:pt-4 border-t border-slate-700">
              <div className="text-center">
                <div className="flex items-center justify-center gap-1 md:gap-2 text-[10px] md:text-xs flex-wrap">
                  <span className="text-emerald-400 flex items-center gap-1">
                    <CheckCircle className="w-2.5 h-2.5 md:w-3 md:h-3" />
                    حضور: {stats?.attendance?.present || 0}
                  </span>
                  <span className="text-red-400">غياب: {stats?.attendance?.absent || 0}</span>
                </div>
                <p className="text-slate-500 text-[10px] md:text-xs mt-1">عذر: {stats?.attendance?.excused || 0}</p>
              </div>
              <div className="text-center">
                
                <p className="text-slate-500 text-[10px] md:text-xs mt-1">
                  {stats?.recitation?.recitation_days || 0} يوم - {stats?.recitation?.passed_days || 0} اجتاز
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ورقة المتابعة الإيمانية - الأسبوعية والفصلية */}
      <Card className="glass-card border-white/10">
        <CardHeader className="pb-2 md:pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base md:text-lg font-bold text-white flex items-center gap-2">
              <Hand className="w-4 h-4 md:w-5 md:h-5 text-purple-400" />
              ورقة المتابعة الإيمانية (100 نقطة)
            </CardTitle>
            <Button
              onClick={() => setTrackingDialogOpen(true)}
              size="sm"
              className="bg-purple-600 hover:bg-purple-700"
            >
              <Edit2 className="w-4 h-4 ml-1" />
              تعبئة الورقة
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* القيم الأسبوعية */}
          <div className="mb-4">
            <h4 className="text-sm font-bold text-emerald-400 mb-3 flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              هذا الأسبوع
            </h4>
            <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-2">
              <div className="p-2 md:p-3 rounded-xl bg-emerald-500/10 text-center">
                <Hand className="w-5 h-5 md:w-6 md:h-6 mx-auto text-emerald-400 mb-1" />
                <p className="text-lg md:text-xl font-bold text-white">{stats?.tracking?.weekly?.prayers || 0}<span className="text-xs text-slate-500">/35</span></p>
                <p className="text-emerald-400 text-[10px] md:text-xs">الصلوات</p>
              </div>
              <div className="p-2 md:p-3 rounded-xl bg-blue-500/10 text-center">
                <BookMarked className="w-5 h-5 md:w-6 md:h-6 mx-auto text-blue-400 mb-1" />
                <p className="text-lg md:text-xl font-bold text-white">{stats?.tracking?.weekly?.quran_sitting || 0}<span className="text-xs text-slate-500">/7</span></p>
                <p className="text-blue-400 text-[10px] md:text-xs">القرآن</p>
              </div>
              <div className="p-2 md:p-3 rounded-xl bg-amber-500/10 text-center">
                <Sunrise className="w-5 h-5 md:w-6 md:h-6 mx-auto text-amber-400 mb-1" />
                <p className="text-lg md:text-xl font-bold text-white">{stats?.tracking?.weekly?.duha_prayers || 0}<span className="text-xs text-slate-500">/7</span></p>
                <p className="text-amber-400 text-[10px] md:text-xs">الضحى</p>
              </div>
              <div className="p-2 md:p-3 rounded-xl bg-pink-500/10 text-center">
                <Users className="w-5 h-5 md:w-6 md:h-6 mx-auto text-pink-400 mb-1" />
                <p className="text-lg md:text-xl font-bold text-white">{stats?.tracking?.weekly?.family_recitation || 0}<span className="text-xs text-slate-500">/7</span></p>
                <p className="text-pink-400 text-[10px] md:text-xs">التسميع</p>
              </div>
              <div className="p-2 md:p-3 rounded-xl bg-purple-500/10 text-center">
                <GraduationCap className="w-5 h-5 md:w-6 md:h-6 mx-auto text-purple-400 mb-1" />
                <p className="text-lg md:text-xl font-bold text-white">{stats?.tracking?.weekly?.study_hours || 0}<span className="text-xs text-slate-500">/7</span></p>
                <p className="text-purple-400 text-[10px] md:text-xs">الدراسة</p>
              </div>
              <div className="p-2 md:p-3 rounded-xl bg-indigo-500/10 text-center">
                <Moon className="w-5 h-5 md:w-6 md:h-6 mx-auto text-indigo-400 mb-1" />
                <p className="text-lg md:text-xl font-bold text-white">{stats?.tracking?.weekly?.witr || 0}<span className="text-xs text-slate-500">/7</span></p>
                <p className="text-indigo-400 text-[10px] md:text-xs">الوتر</p>
              </div>
              <div className="p-2 md:p-3 rounded-xl bg-teal-500/10 text-center">
                <Sparkles className="w-5 h-5 md:w-6 md:h-6 mx-auto text-teal-400 mb-1" />
                <p className="text-lg md:text-xl font-bold text-white">{stats?.tracking?.weekly?.sunnah_prayers || 0}<span className="text-xs text-slate-500">/7</span></p>
                <p className="text-teal-400 text-[10px] md:text-xs">السنن</p>
              </div>
              <div className="p-2 rounded-xl bg-purple-500/10 text-center">
              <Hand className="w-8 h-8 mx-auto text-purple-400 mb-2" />
              <p className="text-2xl font-bold text-white">{stats?.tracking?.total_adhkar || 0}<span className="text-xs text-slate-500">/7</span></p>
              <p className="text-purple-400 text-xs">أذكار بعد الصلاة</p>
            </div>
              <div className="p-2 md:p-3 rounded-xl bg-yellow-500/10 text-center">
                <Star className="w-5 h-5 md:w-6 md:h-6 mx-auto text-yellow-400 mb-1" />
                <p className="text-lg md:text-xl font-bold text-white">{stats?.tracking?.weekly?.night_prayer >= 1 ? '8' : '0'}<span className="text-xs text-slate-500">/8</span></p>
                <p className="text-yellow-400 text-[10px] md:text-xs">قيام الليل</p>
              </div>
              <div className="p-2 md:p-3 rounded-xl bg-cyan-500/10 text-center">
                <Calendar className="w-5 h-5 md:w-6 md:h-6 mx-auto text-cyan-400 mb-1" />
                <p className="text-lg md:text-xl font-bold text-white">{stats?.tracking?.weekly?.fasting >= 1 ? '8' : '0'}<span className="text-xs text-slate-500">/8</span></p>
                <p className="text-cyan-400 text-[10px] md:text-xs">الصيام</p>
              </div>
            </div>
            <div className="mt-2 text-center">
              <span className="text-sm text-slate-400">نقاط الأسبوع: </span>
              <span className="text-lg font-bold text-emerald-400">{stats?.tracking?.weekly?.total_points || 0}</span>
              <span className="text-sm text-slate-500">/100</span>
            </div>
          </div>

          {/* الفاصل */}
          <div className="border-t border-white/10 my-4"></div>

          {/* المجموع الفصلي */}
          <div>
            <h4 className="text-sm font-bold text-amber-400 mb-3 flex items-center gap-2">
              <Trophy className="w-4 h-4" />
              المجموع الفصلي
            </h4>
            <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-2">
              <div className="p-2 md:p-3 rounded-xl bg-slate-800/50 text-center border border-emerald-500/20">
                <p className="text-lg md:text-xl font-bold text-emerald-400">{stats?.tracking?.semester?.prayers || 0}</p>
                <p className="text-slate-400 text-[10px] md:text-xs">الصلوات</p>
              </div>
              <div className="p-2 md:p-3 rounded-xl bg-slate-800/50 text-center border border-blue-500/20">
                <p className="text-lg md:text-xl font-bold text-blue-400">{stats?.tracking?.semester?.quran_sitting || 0}</p>
                <p className="text-slate-400 text-[10px] md:text-xs">القرآن</p>
              </div>
              <div className="p-2 md:p-3 rounded-xl bg-slate-800/50 text-center border border-amber-500/20">
                <p className="text-lg md:text-xl font-bold text-amber-400">{stats?.tracking?.semester?.duha_prayers || 0}</p>
                <p className="text-slate-400 text-[10px] md:text-xs">الضحى</p>
              </div>
              <div className="p-2 md:p-3 rounded-xl bg-slate-800/50 text-center border border-pink-500/20">
                <p className="text-lg md:text-xl font-bold text-pink-400">{stats?.tracking?.semester?.family_recitation || 0}</p>
                <p className="text-slate-400 text-[10px] md:text-xs">التسميع</p>
              </div>
              <div className="p-2 md:p-3 rounded-xl bg-slate-800/50 text-center border border-purple-500/20">
                <p className="text-lg md:text-xl font-bold text-purple-400">{stats?.tracking?.semester?.study_hours || 0}</p>
                <p className="text-slate-400 text-[10px] md:text-xs">الدراسة</p>
              </div>
              <div className="p-2 md:p-3 rounded-xl bg-slate-800/50 text-center border border-indigo-500/20">
                <p className="text-lg md:text-xl font-bold text-indigo-400">{stats?.tracking?.semester?.witr || 0}</p>
                <p className="text-slate-400 text-[10px] md:text-xs">الوتر</p>
              </div>
              <div className="p-2 md:p-3 rounded-xl bg-slate-800/50 text-center border border-teal-500/20">
                <p className="text-lg md:text-xl font-bold text-teal-400">{stats?.tracking?.semester?.sunnah_prayers || 0}</p>
                <p className="text-slate-400 text-[10px] md:text-xs">السنن</p>
              </div>
              <div className="p-2 md:p-3 rounded-xl bg-slate-800/50 text-center border border-yellow-500/20">
                <p className="text-lg md:text-xl font-bold text-yellow-400">{stats?.tracking?.semester?.night_prayer || 0}</p>
                <p className="text-slate-400 text-[10px] md:text-xs">قيام الليل</p>
              </div>
              <div className="p-2 md:p-3 rounded-xl bg-slate-800/50 text-center border border-cyan-500/20">
                <p className="text-lg md:text-xl font-bold text-cyan-400">{stats?.tracking?.semester?.fasting || 0}</p>
                <p className="text-slate-400 text-[10px] md:text-xs">الصيام</p>
              </div>
            </div>
            <div className="mt-3 flex justify-between items-center text-sm">
              <span className="text-slate-400">عدد الأسابيع: {stats?.tracking?.semester?.weeks_count || 0}</span>
              <div>
                <span className="text-slate-400">إجمالي النقاط: </span>
                <span className="text-xl font-bold text-amber-400">{stats?.tracking?.semester?.total_points || 0}</span>
              </div>
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

      {/* Dialog تعبئة ورقة المتابعة */}
      <Dialog open={trackingDialogOpen} onOpenChange={setTrackingDialogOpen}>
        <DialogContent className="bg-slate-900 border-white/10 max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white">تعبئة ورقة المتابعة الأسبوعية</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {/* الصلوات */}
              <div>
                <Label className="text-slate-300 flex items-center gap-2">
                  <Hand className="w-4 h-4 text-emerald-400" />
                  الصلوات (من 35)
                </Label>
                <Input
                  type="number"
                  min="0"
                  max="35"
                  value={trackingForm.prayers_count}
                  onChange={(e) => setTrackingForm({ ...trackingForm, prayers_count: parseInt(e.target.value) || 0 })}
                  className="bg-slate-800 border-white/10 text-white"
                />
              </div>
              
              {/* الجلوس مع القرآن */}
              <div>
                <Label className="text-slate-300 flex items-center gap-2">
                  <BookMarked className="w-4 h-4 text-blue-400" />
                  القرآن (من 7)
                </Label>
                <Input
                  type="number"
                  min="0"
                  max="7"
                  value={trackingForm.quran_sitting_days}
                  onChange={(e) => setTrackingForm({ ...trackingForm, quran_sitting_days: parseInt(e.target.value) || 0 })}
                  className="bg-slate-800 border-white/10 text-white"
                />
              </div>

              {/* صلاة الضحى */}
              <div>
                <Label className="text-slate-300 flex items-center gap-2">
                  <Sunrise className="w-4 h-4 text-amber-400" />
                  الضحى (من 7)
                </Label>
                <Input
                  type="number"
                  min="0"
                  max="7"
                  value={trackingForm.duha_prayers}
                  onChange={(e) => setTrackingForm({ ...trackingForm, duha_prayers: parseInt(e.target.value) || 0 })}
                  className="bg-slate-800 border-white/10 text-white"
                />
              </div>

              {/* التسميع للأهل */}
              <div>
                <Label className="text-slate-300 flex items-center gap-2">
                  <Users className="w-4 h-4 text-pink-400" />
                  التسميع (من 7)
                </Label>
                <Input
                  type="number"
                  min="0"
                  max="7"
                  value={trackingForm.family_recitation}
                  onChange={(e) => setTrackingForm({ ...trackingForm, family_recitation: parseInt(e.target.value) || 0 })}
                  className="bg-slate-800 border-white/10 text-white"
                />
              </div>

              {/* ساعات الدراسة */}
              <div>
                <Label className="text-slate-300 flex items-center gap-2">
                  <GraduationCap className="w-4 h-4 text-purple-400" />
                  الدراسة (من 7)
                </Label>
                <Input
                  type="number"
                  min="0"
                  max="7"
                  value={trackingForm.study_hours}
                  onChange={(e) => setTrackingForm({ ...trackingForm, study_hours: parseInt(e.target.value) || 0 })}
                  className="bg-slate-800 border-white/10 text-white"
                />
              </div>

              {/* الوتر */}
              <div>
                <Label className="text-slate-300 flex items-center gap-2">
                  <Moon className="w-4 h-4 text-indigo-400" />
                  الوتر (من 7)
                </Label>
                <Input
                  type="number"
                  min="0"
                  max="7"
                  value={trackingForm.witr_prayers_days}
                  onChange={(e) => setTrackingForm({ ...trackingForm, witr_prayers_days: parseInt(e.target.value) || 0 })}
                  className="bg-slate-800 border-white/10 text-white"
                />
              </div>

              {/* السنن */}
              <div>
                <Label className="text-slate-300 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-teal-400" />
                  السنن (من 7)
                </Label>
                <Input
                  type="number"
                  min="0"
                  max="7"
                  value={trackingForm.sunnah_prayers}
                  onChange={(e) => setTrackingForm({ ...trackingForm, sunnah_prayers: parseInt(e.target.value) || 0 })}
                  className="bg-slate-800 border-white/10 text-white"
                />
              </div>

              {/* قيام الليل */}
              <div>
                <Label className="text-slate-300 flex items-center gap-2">
                  <Star className="w-4 h-4 text-yellow-400" />
                  قيام الليل (0 أو 1) = 8 نقاط
                </Label>
                <Input
                  type="number"
                  min="0"
                  max="1"
                  value={trackingForm.night_prayer}
                  onChange={(e) => setTrackingForm({ ...trackingForm, night_prayer: parseInt(e.target.value) || 0 })}
                  className="bg-slate-800 border-white/10 text-white"
                />
              </div>

              {/* الصيام */}
              <div>
                <Label className="text-slate-300 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-cyan-400" />
                  الصيام (0 أو 1) = 8 نقاط
                </Label>
                <Input
                  type="number"
                  min="0"
                  max="1"
                  value={trackingForm.fasting}
                  onChange={(e) => setTrackingForm({ ...trackingForm, fasting: parseInt(e.target.value) || 0 })}
                  className="bg-slate-800 border-white/10 text-white"
                />
              </div>
            </div>

            {/* ملاحظات */}
            <div>
              <Label className="text-slate-300">ملاحظات (اختياري)</Label>
              <Textarea
                value={trackingForm.notes}
                onChange={(e) => setTrackingForm({ ...trackingForm, notes: e.target.value })}
                placeholder="أي ملاحظات إضافية..."
                className="bg-slate-800 border-white/10 text-white"
              />
            </div>

            {/* معاينة النقاط */}
            <div className="p-4 rounded-xl bg-purple-500/10 border border-purple-500/30 text-center">
              <p className="text-slate-300">النقاط المتوقعة</p>
              <p className="text-3xl font-bold text-purple-400">{calculateTrackingPoints()} نقطة</p>
              <p className="text-xs text-slate-500">من أصل 100 نقطة</p>
              {calculateTrackingPoints() >= 90 && (
                <p className="text-amber-400 text-sm mt-2">🏅 ستحصل على شارة العابد!</p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setTrackingDialogOpen(false)}>إلغاء</Button>
            <Button 
              onClick={handleSubmitTracking} 
              disabled={submittingTracking}
              className="bg-purple-600 hover:bg-purple-700"
            >
              {submittingTracking ? 'جاري الحفظ...' : 'حفظ ورقة المتابعة'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default StudentDashboard;
