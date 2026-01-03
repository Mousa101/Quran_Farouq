import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import {
  User, BookOpen, UserCheck, Star, Trophy, Calendar, ArrowRight,
  CheckCircle, XCircle, Clock, FileText, AlertTriangle, School, Home, Phone, TrendingUp,
  ChevronDown, ChevronUp
} from 'lucide-react';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';
import { ar } from 'date-fns/locale';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const StudentProfile = () => {
  const { studentId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [profileData, setProfileData] = useState(null);
  const [progressData, setProgressData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAllPersonalInfo, setShowAllPersonalInfo] = useState(false);

  useEffect(() => {
    fetchData();
  }, [studentId]);

  const fetchData = async () => {
    try {
      const [profileRes, progressRes] = await Promise.all([
        axios.get(`${API}/students/${studentId}/profile`),
        axios.get(`${API}/students/${studentId}/progress`)
      ]);
      setProfileData(profileRes.data);
      setProgressData(progressRes.data);
    } catch (error) {
      console.error('Error:', error);
      toast.error('فشل في تحميل بيانات الطالب');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('ar-SA');
  };

  // Format date with day name for records
  const formatDateWithDay = (dateStr) => {
    if (!dateStr) return '-';
    try {
      // Handle both ISO datetime and date-only formats
      const date = dateStr.includes('T') ? parseISO(dateStr) : new Date(dateStr + 'T00:00:00');
      return format(date, 'EEEE d MMMM yyyy', { locale: ar });
    } catch {
      return dateStr;
    }
  };

  // Format datetime with day name
  const formatDateTimeWithDay = (dateStr) => {
    if (!dateStr) return '-';
    try {
      const date = parseISO(dateStr);
      return format(date, 'EEEE d MMMM yyyy - h:mm a', { locale: ar });
    } catch {
      return dateStr;
    }
  };

  const calculateAge = (birthDate) => {
    if (!birthDate) return '-';
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return `${age} سنة`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!profileData) {
    return (
      <div className="text-center py-12 text-slate-400">
        <User className="w-16 h-16 mx-auto mb-4 opacity-50" />
        <p>لم يتم العثور على بيانات الطالب</p>
      </div>
    );
  }

  const { student, group, points, attendance_summary, recitation_summary, attendance_records, recitation_records, warnings } = profileData;

  return (
    <div className="space-y-6 animate-fadeIn" data-testid="student-profile-page">
      {/* Back Button */}
      <Button
        variant="ghost"
        onClick={() => navigate(-1)}
        className="text-slate-400 hover:text-white"
      >
        <ArrowRight className="w-5 h-5 ml-2" />
        رجوع
      </Button>

      {/* Header Card */}
      <Card className="glass-card border-white/10 overflow-hidden">
        <div className="h-24 bg-gradient-to-l from-emerald-500/30 to-blue-500/30" />
        <CardContent className="relative pt-0">
          <div className="flex flex-col md:flex-row gap-6 items-start -mt-12">
            {/* Profile Image */}
            <div className="w-24 h-24 rounded-2xl bg-slate-800 border-4 border-slate-900 flex items-center justify-center overflow-hidden">
              {student.profile_image ? (
                <img src={student.profile_image} alt={student.name} className="w-full h-full object-cover" />
              ) : (
                <span className="text-4xl font-bold text-emerald-400">
                  {student.name?.charAt(0)}
                </span>
              )}
            </div>

            {/* Basic Info */}
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-white">{student.name}</h1>
              <p className="text-slate-400 text-sm">{student.email}</p>
              {group && (
                <Badge className="mt-2 bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                  {group.name}
                </Badge>
              )}
            </div>

            {/* Points & Level */}
            <div className="flex items-center gap-4">
              <div className="text-center p-4 rounded-xl bg-amber-500/10 border border-amber-500/30">
                <Star className="w-6 h-6 text-amber-400 mx-auto" />
                <p className="text-2xl font-bold text-amber-400 mt-1">{points?.total_points || 0}</p>
                <p className="text-xs text-slate-400">النقاط</p>
              </div>
              <div className="text-center p-4 rounded-xl bg-purple-500/10 border border-purple-500/30">
                <Trophy className="w-6 h-6 text-purple-400 mx-auto" />
                <p className="text-2xl font-bold text-purple-400 mt-1">{points?.level || 1}</p>
                <p className="text-xs text-slate-400">المركز</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Total Progress Card */}
      {progressData && (
        <Card className="glass-card border-emerald-500/30 bg-gradient-to-br from-emerald-500/5 to-blue-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg text-white flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-emerald-400" />
              إجمالي التقدم في الحفظ
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* Total Progress */}
              <div className="col-span-2 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-center">
                <p className="text-4xl font-bold text-emerald-400">{progressData.total_progress?.total_pages || 0}</p>
                <p className="text-slate-400 text-sm">صفحة إجمالية</p>
                <p className="text-emerald-400 text-lg font-bold mt-2">
                  {progressData.total_progress?.description || ''}
                </p>
                {/* Progress Bar */}
                <div className="mt-3 h-3 bg-slate-700 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-emerald-500 to-blue-500 rounded-full transition-all"
                    style={{ width: `${Math.min(progressData.total_progress?.percentage || 0, 100)}%` }}
                  />
                </div>
                <p className="text-slate-400 text-xs mt-1">{progressData.total_progress?.percentage || 0}% من القرآن</p>
              </div>

              {/* Previous Memorization */}
              <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/30">
                <p className="text-slate-400 text-sm mb-2">الحفظ السابق</p>
                <p className="text-2xl font-bold text-blue-400">{progressData.previous_memorization?.total_pages || 0} صفحة</p>
                <p className="text-blue-300 text-sm mt-1">
                  {progressData.previous_memorization?.juz_count || 0} جزء + {progressData.previous_memorization?.additional_pages || 0} صفحة
                </p>
              </div>

              {/* New Memorization */}
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30">
                <p className="text-slate-400 text-sm mb-2">الحفظ الجديد</p>
                <p className="text-2xl font-bold text-amber-400">{progressData.new_memorization?.total_pages || 0} صفحة</p>
                <p className="text-amber-300 text-sm mt-1">
                  {progressData.new_memorization?.recitation_count || 0} تسميع
                </p>
              </div>
            </div>

            {/* Tajweed Level */}
            {progressData.tajweed_level && (
              <div className="mt-4 flex items-center gap-2">
                <span className="text-slate-400">مستوى التجويد:</span>
                <Badge className={`${
                  progressData.tajweed_level === 'متقدمة' ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' :
                  progressData.tajweed_level === 'متوسطة' ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' :
                  'bg-slate-500/20 text-slate-300 border-slate-500/30'
                }`}>
                  {progressData.tajweed_level}
                </Badge>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Personal Info & Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Personal Info */}
        <Card className="glass-card border-white/10">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg text-white flex items-center gap-2">
                <User className="w-5 h-5 text-emerald-400" />
                المعلومات الشخصية
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAllPersonalInfo(!showAllPersonalInfo)}
                className="text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
              >
                {showAllPersonalInfo ? (
                  <>
                    <ChevronUp className="w-4 h-4 ml-1" />
                    إخفاء
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-4 h-4 ml-1" />
                    إظهار المزيد
                  </>
                )}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Always visible info */}
            <div className="flex items-center gap-3 p-2 rounded-lg bg-slate-800/50">
              <Calendar className="w-4 h-4 text-slate-400" />
              <div>
                <p className="text-xs text-slate-400">تاريخ الميلاد</p>
                <p className="text-white text-sm">{formatDate(student.birth_date)} ({calculateAge(student.birth_date)})</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-2 rounded-lg bg-slate-800/50">
              <Home className="w-4 h-4 text-slate-400" />
              <div>
                <p className="text-xs text-slate-400">المسجد</p>
                <p className="text-white text-sm">{student.mosque_name || '-'}</p>
              </div>
            </div>

            {/* Expandable info */}
            {showAllPersonalInfo && (
              <>
                <div className="flex items-center gap-3 p-2 rounded-lg bg-slate-800/50">
                  <School className="w-4 h-4 text-slate-400" />
                  <div>
                    <p className="text-xs text-slate-400">المدرسة / الصف</p>
                    <p className="text-white text-sm">{student.school_name || '-'} {student.school_grade ? `(${student.school_grade})` : ''}</p>
                    {student.school_average && (
                      <p className="text-emerald-400 text-xs mt-1">المعدل: {student.school_average}</p>
                    )}
                  </div>
                </div>
                
                {/* Phone Numbers */}
                {(student.student_phone || student.father_phone || student.mother_phone) && (
                  <div className="pt-2 border-t border-slate-700">
                    <p className="text-xs text-slate-400 flex items-center gap-1 mb-2">
                      <Phone className="w-3 h-3" /> أرقام الهواتف
                    </p>
                    {student.student_phone && (
                      <p className="text-white text-sm">الطالب: <span dir="ltr">{student.student_phone}</span></p>
                    )}
                    {student.father_phone && (
                      <p className="text-white text-sm">الأب: <span dir="ltr">{student.father_phone}</span></p>
                    )}
                    {student.mother_phone && (
                      <p className="text-white text-sm">الأم: <span dir="ltr">{student.mother_phone}</span></p>
                    )}
                  </div>
                )}

                {student.registration_date && (
                  <div className="pt-2 border-t border-slate-700">
                    <p className="text-xs text-slate-400">تاريخ التسجيل في المركز</p>
                    <p className="text-emerald-400 text-sm">{formatDate(student.registration_date)}</p>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Attendance Summary */}
        <Card className="glass-card border-white/10">
          <CardHeader>
            <CardTitle className="text-lg text-white flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-blue-400" />
              ملخص الحضور
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-blue-500/20 border-4 border-blue-500/30">
                <span className="text-3xl font-bold text-blue-400">
                  {attendance_summary?.percentage || 0}%
                </span>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-3 rounded-lg bg-emerald-500/10">
                <CheckCircle className="w-5 h-5 text-emerald-400 mx-auto" />
                <p className="text-xl font-bold text-emerald-400 mt-1">{attendance_summary?.present || 0}</p>
                <p className="text-xs text-slate-400">حضور</p>
              </div>
              <div className="p-3 rounded-lg bg-red-500/10">
                <XCircle className="w-5 h-5 text-red-400 mx-auto" />
                <p className="text-xl font-bold text-red-400 mt-1">{attendance_summary?.absent || 0}</p>
                <p className="text-xs text-slate-400">غياب</p>
              </div>
              <div className="p-3 rounded-lg bg-amber-500/10">
                <Clock className="w-5 h-5 text-amber-400 mx-auto" />
                <p className="text-xl font-bold text-amber-400 mt-1">{attendance_summary?.excused || 0}</p>
                <p className="text-xs text-slate-400">عذر</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Recitation Summary */}
        <Card className="glass-card border-white/10">
          <CardHeader>
            <CardTitle className="text-lg text-white flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-purple-400" />
              ملخص التسميع
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <p className="text-sm text-slate-400">الحفظ الجديد</p>
              <p className="text-2xl font-bold text-emerald-400">{recitation_summary?.total_new_pages || 0} صفحة</p>
            </div>
            <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <p className="text-sm text-slate-400">المراجعة</p>
              <p className="text-2xl font-bold text-blue-400">
                {recitation_summary?.total_review_pages || 0} صفحة / {recitation_summary?.total_review_juz || 0} جزء
              </p>
            </div>
            <div className="text-center pt-2">
              <p className="text-slate-400 text-sm">إجمالي التسميعات</p>
              <p className="text-xl font-bold text-white">{recitation_summary?.total_recitations || 0}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Warnings Section */}
      {warnings && warnings.length > 0 && (
        <Card className="glass-card border-red-500/30">
          <CardHeader>
            <CardTitle className="text-lg text-red-400 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              الإنذارات ({warnings.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {warnings.map((warning) => (
                <div key={warning.id} className="p-4 rounded-lg bg-red-500/10 border border-red-500/20">
                  <div className="flex items-center justify-between mb-2">
                    <Badge className={`${
                      warning.type === 'absence' ? 'bg-red-500/20 text-red-400' :
                      warning.type === 'no_recitation' ? 'bg-amber-500/20 text-amber-400' :
                      'bg-purple-500/20 text-purple-400'
                    }`}>
                      {warning.type === 'absence' ? 'غياب متكرر' :
                       warning.type === 'no_recitation' ? 'عدم التسميع' :
                       'سلوك سلبي'}
                    </Badge>
                    <span className="text-xs text-slate-400">{formatDate(warning.created_at)}</span>
                  </div>
                  <p className="text-white">{warning.message}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Badges */}
      {points?.badge_details && points.badge_details.length > 0 && (
        <Card className="glass-card border-white/10">
          <CardHeader>
            <CardTitle className="text-lg text-white">الشارات المكتسبة</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {points.badge_details.map((badge) => (
                <div key={badge.id} className="p-3 rounded-xl bg-slate-800/50 border border-white/10 text-center min-w-[100px]">
                  <span className="text-3xl">{badge.icon}</span>
                  <p className="text-white text-sm mt-2">{badge.name}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Detailed Records Tabs */}
      <Card className="glass-card border-white/10">
        <Tabs defaultValue="recitations" className="w-full">
          <TabsList className="w-full bg-slate-800/50 p-1 rounded-xl">
            <TabsTrigger value="recitations" className="flex-1 data-[state=active]:bg-emerald-500">
              التسميعات
            </TabsTrigger>
            <TabsTrigger value="attendance" className="flex-1 data-[state=active]:bg-emerald-500">
              سجل الحضور
            </TabsTrigger>
          </TabsList>

          <TabsContent value="recitations" className="p-4">
            {recitation_records && recitation_records.length > 0 ? (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {recitation_records.map((rec) => (
                  <div key={rec.id} className="p-4 rounded-lg bg-slate-800/50 border border-white/5">
                    <div className="flex items-center justify-between mb-2">
                      <Badge className={rec.recitation_type === 'new_memorization' 
                        ? 'bg-emerald-500/20 text-emerald-400' 
                        : 'bg-blue-500/20 text-blue-400'}>
                        {rec.recitation_type === 'new_memorization' ? 'حفظ جديد' : 'مراجعة'}
                      </Badge>
                      <span className="text-xs text-slate-400">{formatDateTimeWithDay(rec.created_at)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="text-slate-300 text-sm">
                        {rec.recitation_type === 'new_memorization' 
                          ? `${rec.pages_count} صفحة` 
                          : rec.review_type === 'pages' 
                            ? `${rec.review_pages} صفحة مراجعة`
                            : `أجزاء: ${rec.review_juz?.join(', ')}`
                        }
                        {(rec.passed_minimum || rec.passed_review_minimum) && (
                          <CheckCircle className="w-4 h-4 text-emerald-400 inline-block mr-2" />
                        )}
                      </div>
                      <span className="text-amber-400 font-bold">+{rec.points_earned}</span>
                    </div>
                    {rec.notes && (
                      <p className="text-slate-400 text-xs mt-2">{rec.notes}</p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-slate-400">
                لا توجد تسميعات مسجلة
              </div>
            )}
          </TabsContent>

          <TabsContent value="attendance" className="p-4">
            {attendance_records && attendance_records.length > 0 ? (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {attendance_records.map((att) => (
                  <div key={att.id} className="p-3 rounded-lg bg-slate-800/50 border border-white/5">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-300">{formatDateWithDay(att.date)}</span>
                      <Badge className={`${
                        att.status === 'present' ? 'bg-emerald-500/20 text-emerald-400' :
                        att.status === 'absent' ? 'bg-red-500/20 text-red-400' :
                        'bg-amber-500/20 text-amber-400'
                      }`}>
                        {att.status === 'present' ? 'حاضر' :
                         att.status === 'absent' ? 'غائب' : 'معذور'}
                      </Badge>
                    </div>
                    {/* Show excuse reason if exists */}
                    {att.status === 'excused' && att.excuse_reason && (
                      <div className="mt-2 text-xs text-amber-300 bg-amber-500/10 p-2 rounded">
                        <span className="font-medium">سبب العذر:</span> {att.excuse_reason}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-slate-400">
                لا توجد سجلات حضور
              </div>
            )}
          </TabsContent>
        </Tabs>
      </Card>
    </div>
  );
};

export default StudentProfile;
