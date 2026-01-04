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
  Phone, Mail, School, Home, Clock, Star, Target, Sparkles, Download, Loader2
} from 'lucide-react';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

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
  const [generatingPDF, setGeneratingPDF] = useState(false);

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

  // تحديد بداية ونهاية الفصل الحالي
  const getSemesterDates = () => {
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    
    let semesterStart, semesterEnd, semesterName;
    
    if (month >= 9 || month <= 1) {
      // الفصل الأول: سبتمبر - يناير
      semesterStart = month >= 9 ? `${year}-09-01` : `${year - 1}-09-01`;
      semesterEnd = month >= 9 ? `${year + 1}-01-31` : `${year}-01-31`;
      semesterName = 'الفصل الدراسي الأول';
    } else {
      // الفصل الثاني: فبراير - يونيو
      semesterStart = `${year}-02-01`;
      semesterEnd = `${year}-06-30`;
      semesterName = 'الفصل الدراسي الثاني';
    }
    
    return { semesterStart, semesterEnd, semesterName };
  };

  // تصفية البيانات حسب الفصل
  const filterBySemester = (data, dateField = 'date') => {
    const { semesterStart, semesterEnd } = getSemesterDates();
    return data.filter(item => {
      const itemDate = item[dateField] || item.created_at;
      if (!itemDate) return false;
      const date = itemDate.split('T')[0];
      return date >= semesterStart && date <= semesterEnd;
    });
  };

  // إنشاء PDF لسجل الطالب
  const generatePDF = async () => {
    setGeneratingPDF(true);
    
    try {
      const { semesterName } = getSemesterDates();
      
      // تصفية البيانات للفصل الحالي
      const semesterAttendance = filterBySemester(attendance, 'date');
      const semesterRecitations = filterBySemester(recitations, 'created_at');
      const semesterTracking = filterBySemester(trackingSheets, 'week_start');
      
      // إنشاء PDF
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });
      
      // إضافة خط عربي
      doc.setFont('helvetica');
      
      // العنوان
      doc.setFontSize(20);
      doc.text('سجل الطالب', 105, 20, { align: 'center' });
      
      doc.setFontSize(14);
      doc.text(student?.name || '', 105, 30, { align: 'center' });
      doc.text(semesterName, 105, 38, { align: 'center' });
      
      let yPos = 50;
      
      // معلومات الطالب
      doc.setFontSize(12);
      doc.text(`البريد الإلكتروني: ${student?.email || '-'}`, 190, yPos, { align: 'right' });
      yPos += 7;
      doc.text(`المدرسة: ${student?.school_name || '-'}`, 190, yPos, { align: 'right' });
      yPos += 7;
      doc.text(`مجموع النقاط: ${stats?.total_points || 0}`, 190, yPos, { align: 'right' });
      yPos += 15;
      
      // جدول الحضور والغياب
      doc.setFontSize(14);
      doc.text('سجل الحضور والغياب', 190, yPos, { align: 'right' });
      yPos += 10;
      
      const presentCount = semesterAttendance.filter(a => a.status === 'present').length;
      const absentCount = semesterAttendance.filter(a => a.status === 'absent').length;
      const excusedCount = semesterAttendance.filter(a => a.status === 'excused').length;
      
      doc.setFontSize(10);
      doc.text(`حاضر: ${presentCount} | غائب: ${absentCount} | معذور: ${excusedCount}`, 190, yPos, { align: 'right' });
      yPos += 10;
      
      // جدول الحضور
      if (semesterAttendance.length > 0) {
        const attendanceData = semesterAttendance.slice(0, 20).map(a => [
          a.status === 'present' ? 'حاضر' : a.status === 'absent' ? 'غائب' : 'معذور',
          formatDate(a.date)
        ]);
        
        doc.autoTable({
          startY: yPos,
          head: [['الحالة', 'التاريخ']],
          body: attendanceData,
          theme: 'grid',
          styles: { halign: 'center', font: 'helvetica', fontSize: 9 },
          headStyles: { fillColor: [16, 185, 129] }
        });
        
        yPos = doc.lastAutoTable.finalY + 15;
      }
      
      // جدول التسميعات
      doc.setFontSize(14);
      doc.text('سجل التسميعات', 190, yPos, { align: 'right' });
      yPos += 10;
      
      if (semesterRecitations.length > 0) {
        const recitationData = semesterRecitations.slice(0, 15).map(r => [
          `${r.points_earned || 0}`,
          r.page_from && r.page_to ? `${r.page_from}-${r.page_to}` : '-',
          r.juz_number || '-',
          r.recitation_type === 'new_memorization' ? 'حفظ جديد' : 'مراجعة',
          formatDate(r.created_at)
        ]);
        
        doc.autoTable({
          startY: yPos,
          head: [['النقاط', 'الصفحات', 'الجزء', 'النوع', 'التاريخ']],
          body: recitationData,
          theme: 'grid',
          styles: { halign: 'center', font: 'helvetica', fontSize: 9 },
          headStyles: { fillColor: [139, 92, 246] }
        });
        
        yPos = doc.lastAutoTable.finalY + 15;
      }
      
      // التحقق من الحاجة لصفحة جديدة
      if (yPos > 250) {
        doc.addPage();
        yPos = 20;
      }
      
      // جدول ورق المتابعة
      doc.setFontSize(14);
      doc.text('سجل ورق المتابعة', 190, yPos, { align: 'right' });
      yPos += 10;
      
      if (semesterTracking.length > 0) {
        const trackingData = semesterTracking.slice(0, 10).map(t => [
          `${t.points_earned || 0}`,
          `${t.data?.prayers_count || 0}/35`,
          `${t.data?.duha_prayers || 0}/7`,
          `${t.data?.witr_prayers_days || 0}/7`,
          formatDate(t.week_start)
        ]);
        
        doc.autoTable({
          startY: yPos,
          head: [['النقاط', 'الصلوات', 'الضحى', 'الوتر', 'الأسبوع']],
          body: trackingData,
          theme: 'grid',
          styles: { halign: 'center', font: 'helvetica', fontSize: 9 },
          headStyles: { fillColor: [245, 158, 11] }
        });
      }
      
      // حفظ PDF
      const fileName = `سجل_${student?.name || 'الطالب'}_${semesterName}.pdf`;
      doc.save(fileName);
      
      toast.success('تم تحميل سجل الطالب بنجاح');
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast.error('فشل في إنشاء ملف PDF');
    } finally {
      setGeneratingPDF(false);
    }
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
      <div className="flex items-center justify-between flex-wrap gap-4">
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
        <div className="flex gap-2">
          <Button 
            onClick={generatePDF}
            disabled={generatingPDF}
            className="bg-emerald-500 hover:bg-emerald-600"
          >
            {generatingPDF ? (
              <Loader2 className="w-4 h-4 ml-2 animate-spin" />
            ) : (
              <Download className="w-4 h-4 ml-2" />
            )}
            تحميل PDF للفصل
          </Button>
          <Link to="/sheikh-rankings">
            <Button variant="outline" className={isDark ? 'border-white/10' : ''}>
              <ArrowRight className="w-4 h-4 ml-2" />
              العودة للترتيب
            </Button>
          </Link>
        </div>
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
