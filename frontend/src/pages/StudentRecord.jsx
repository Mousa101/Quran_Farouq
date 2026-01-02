import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';
import { useTheme } from '../context/ThemeContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { 
  User, Calendar, CheckCircle, XCircle, AlertTriangle, 
  BookOpen, FileText, TrendingUp, Award, ArrowRight,
  Phone, Mail, School, Home, Clock, Star, Target, Sparkles
} from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const StudentRecord = () => {
  const { studentId } = useParams();
  const { isDark } = useTheme();
  const [student, setStudent] = useState(null);
  const [stats, setStats] = useState(null);
  const [attendance, setAttendance] = useState([]);
  const [recitations, setRecitations] = useState([]);
  const [trackingSheets, setTrackingSheets] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [studentId]);

  const fetchData = async () => {
    try {
      const [statsRes, attendanceRes, recitationsRes, trackingRes] = await Promise.all([
        axios.get(`${API}/statistics/student/${studentId}`),
        axios.get(`${API}/attendance?student_id=${studentId}`),
        axios.get(`${API}/recitations?student_id=${studentId}`),
        axios.get(`${API}/tracking-sheets?student_id=${studentId}`)
      ]);
      
      setStats(statsRes.data);
      setStudent(statsRes.data.student);
      setAttendance(attendanceRes.data);
      setRecitations(recitationsRes.data);
      setTrackingSheets(trackingRes.data);
    } catch (error) {
      console.error('Error fetching student data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('ar-SA', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'present':
        return <Badge className="bg-green-500/20 text-green-400"><CheckCircle className="w-3 h-3 ml-1" />حاضر</Badge>;
      case 'absent':
        return <Badge className="bg-red-500/20 text-red-400"><XCircle className="w-3 h-3 ml-1" />غائب</Badge>;
      case 'excused':
        return <Badge className="bg-yellow-500/20 text-yellow-400"><AlertTriangle className="w-3 h-3 ml-1" />معذور</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!student) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-400">الطالب غير موجود</p>
      </div>
    );
  }

  // Calculate attendance stats
  const presentCount = attendance.filter(a => a.status === 'present').length;
  const absentCount = attendance.filter(a => a.status === 'absent').length;
  const excusedCount = attendance.filter(a => a.status === 'excused').length;
  const totalDays = attendance.length;

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {student.profile_image ? (
            <img 
              src={student.profile_image} 
              alt={student.name}
              className="w-16 h-16 rounded-xl object-cover border-2 border-emerald-500/30"
            />
          ) : (
            <div className="w-16 h-16 rounded-xl bg-emerald-500/20 flex items-center justify-center">
              <User className="w-8 h-8 text-emerald-400" />
            </div>
          )}
          <div>
            <h1 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
              السجل العام - {student.name}
            </h1>
            <p className="text-slate-400">{student.email}</p>
          </div>
        </div>
        <Link to="/sheikh-rankings">
          <Button variant="outline" className={isDark ? 'border-white/10' : ''}>
            <ArrowRight className="w-4 h-4 ml-2" />
            العودة للترتيب
          </Button>
        </Link>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className={isDark ? 'glass-card' : 'bg-white'}>
          <CardContent className="p-4 text-center">
            <Award className="w-8 h-8 mx-auto text-emerald-400 mb-2" />
            <p className="text-2xl font-bold text-emerald-400">{stats?.total_points || 0}</p>
            <p className="text-slate-400 text-sm">مجموع النقاط</p>
          </CardContent>
        </Card>
        
        <Card className={isDark ? 'glass-card' : 'bg-white'}>
          <CardContent className="p-4 text-center">
            <Calendar className="w-8 h-8 mx-auto text-blue-400 mb-2" />
            <p className="text-2xl font-bold text-blue-400">{totalDays}</p>
            <p className="text-slate-400 text-sm">إجمالي أيام الدوام</p>
          </CardContent>
        </Card>
        
        <Card className={isDark ? 'glass-card' : 'bg-white'}>
          <CardContent className="p-4 text-center">
            <BookOpen className="w-8 h-8 mx-auto text-purple-400 mb-2" />
            <p className="text-2xl font-bold text-purple-400">{recitations.length}</p>
            <p className="text-slate-400 text-sm">عدد التسميعات</p>
          </CardContent>
        </Card>
        
        <Card className={isDark ? 'glass-card' : 'bg-white'}>
          <CardContent className="p-4 text-center">
            <FileText className="w-8 h-8 mx-auto text-amber-400 mb-2" />
            <p className="text-2xl font-bold text-amber-400">{trackingSheets.length}</p>
            <p className="text-slate-400 text-sm">ورق المتابعة</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="attendance" className="space-y-4">
        <TabsList className={`grid grid-cols-3 ${isDark ? 'bg-slate-800' : 'bg-slate-100'}`}>
          <TabsTrigger value="attendance">الحضور والغياب</TabsTrigger>
          <TabsTrigger value="recitations">التسميعات</TabsTrigger>
          <TabsTrigger value="tracking">ورق المتابعة</TabsTrigger>
        </TabsList>

        {/* Attendance Tab */}
        <TabsContent value="attendance">
          <Card className={isDark ? 'glass-card' : 'bg-white'}>
            <CardHeader>
              <CardTitle className={`flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                <Calendar className="w-5 h-5 text-blue-400" />
                سجل الحضور والغياب
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/* Summary */}
              <div className="grid grid-cols-3 gap-4 mb-6 p-4 rounded-xl bg-slate-800/30">
                <div className="text-center">
                  <p className="text-2xl font-bold text-green-400">{presentCount}</p>
                  <p className="text-slate-400 text-sm">حاضر</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-red-400">{absentCount}</p>
                  <p className="text-slate-400 text-sm">غائب</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-yellow-400">{excusedCount}</p>
                  <p className="text-slate-400 text-sm">معذور</p>
                </div>
              </div>

              {/* Attendance List */}
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {attendance.length === 0 ? (
                  <p className="text-center text-slate-400 py-8">لا يوجد سجل حضور</p>
                ) : (
                  attendance.slice().reverse().map((record, idx) => (
                    <div 
                      key={idx} 
                      className={`flex items-center justify-between p-3 rounded-lg ${isDark ? 'bg-slate-800/50' : 'bg-slate-50'}`}
                    >
                      <span className={isDark ? 'text-white' : 'text-slate-900'}>
                        {formatDate(record.date)}
                      </span>
                      {getStatusBadge(record.status)}
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Recitations Tab */}
        <TabsContent value="recitations">
          <Card className={isDark ? 'glass-card' : 'bg-white'}>
            <CardHeader>
              <CardTitle className={`flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                <BookOpen className="w-5 h-5 text-purple-400" />
                سجل التسميعات
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {recitations.length === 0 ? (
                  <p className="text-center text-slate-400 py-8">لا توجد تسميعات</p>
                ) : (
                  recitations.slice().reverse().map((rec, idx) => (
                    <div 
                      key={idx} 
                      className={`p-4 rounded-xl ${isDark ? 'bg-slate-800/50' : 'bg-slate-50'}`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <Badge className={rec.recitation_type === 'new_memorization' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-blue-500/20 text-blue-400'}>
                          {rec.recitation_type === 'new_memorization' ? 'حفظ جديد' : 'مراجعة'}
                        </Badge>
                        <span className="text-slate-400 text-sm">{formatDate(rec.created_at)}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        {rec.juz_number && (
                          <p className={isDark ? 'text-slate-300' : 'text-slate-700'}>
                            الجزء: {rec.juz_number}
                          </p>
                        )}
                        {rec.page_from && rec.page_to && (
                          <p className={isDark ? 'text-slate-300' : 'text-slate-700'}>
                            الصفحات: {rec.page_from} - {rec.page_to}
                          </p>
                        )}
                        {rec.rating && (
                          <p className="text-amber-400 flex items-center gap-1">
                            <Star className="w-3 h-3" />
                            التقييم: {rec.rating}/10
                          </p>
                        )}
                        <p className="text-emerald-400">
                          النقاط: {rec.points_earned || 0}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tracking Sheets Tab */}
        <TabsContent value="tracking">
          <Card className={isDark ? 'glass-card' : 'bg-white'}>
            <CardHeader>
              <CardTitle className={`flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                <FileText className="w-5 h-5 text-amber-400" />
                سجل ورق المتابعة
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {trackingSheets.length === 0 ? (
                  <p className="text-center text-slate-400 py-8">لا توجد ورق متابعة</p>
                ) : (
                  trackingSheets.slice().reverse().map((sheet, idx) => (
                    <div 
                      key={idx} 
                      className={`p-4 rounded-xl ${isDark ? 'bg-slate-800/50' : 'bg-slate-50'}`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <span className={`font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>
                          أسبوع {formatDate(sheet.week_start)}
                        </span>
                        <Badge className="bg-emerald-500/20 text-emerald-400">
                          {sheet.points_earned || 0} نقطة
                        </Badge>
                      </div>
                      {sheet.data && (
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-sm">
                          <div className="text-center p-2 rounded-lg bg-slate-700/30">
                            <p className="text-slate-400">الصلوات</p>
                            <p className="text-white font-bold">{sheet.data.prayers_count || 0}/35</p>
                          </div>
                          <div className="text-center p-2 rounded-lg bg-slate-700/30">
                            <p className="text-slate-400">الأذكار</p>
                            <p className="text-white font-bold">{sheet.data.adhkar_after_prayer || 0}/7</p>
                          </div>
                          <div className="text-center p-2 rounded-lg bg-slate-700/30">
                            <p className="text-slate-400">الضحى</p>
                            <p className="text-white font-bold">{sheet.data.duha_prayers || 0}/7</p>
                          </div>
                          <div className="text-center p-2 rounded-lg bg-slate-700/30">
                            <p className="text-slate-400">الوتر</p>
                            <p className="text-white font-bold">{sheet.data.witr_prayers_days || 0}/7</p>
                          </div>
                          <div className="text-center p-2 rounded-lg bg-slate-700/30">
                            <p className="text-slate-400">قيام الليل</p>
                            <p className="text-white font-bold">{sheet.data.night_prayer || 0}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Student Info Card */}
      <Card className={isDark ? 'glass-card' : 'bg-white'}>
        <CardHeader>
          <CardTitle className={`flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
            <User className="w-5 h-5 text-emerald-400" />
            معلومات الطالب
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {student.student_phone && (
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-slate-400" />
                <span className={isDark ? 'text-slate-300' : 'text-slate-700'}>{student.student_phone}</span>
              </div>
            )}
            {student.school_name && (
              <div className="flex items-center gap-2">
                <School className="w-4 h-4 text-slate-400" />
                <span className={isDark ? 'text-slate-300' : 'text-slate-700'}>{student.school_name}</span>
              </div>
            )}
            {student.mosque_name && (
              <div className="flex items-center gap-2">
                <Home className="w-4 h-4 text-slate-400" />
                <span className={isDark ? 'text-slate-300' : 'text-slate-700'}>{student.mosque_name}</span>
              </div>
            )}
            {student.school_average && (
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-slate-400" />
                <span className={isDark ? 'text-slate-300' : 'text-slate-700'}>المعدل: {student.school_average}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default StudentRecord;
