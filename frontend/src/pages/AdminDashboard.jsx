import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import StudentLink from '../components/StudentLink';
import OnlineUsers from '../components/OnlineUsers';
import axios from 'axios';
import { useTheme } from '../context/ThemeContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { toast } from 'sonner';
import { 
  Users, BookOpen, Calendar, Trophy, TrendingUp, 
  GraduationCap, UserCheck, Target, Eye, Medal,
  ArrowUpRight, UserPlus, Clock, Archive, RefreshCw, Download, FileSpreadsheet, Edit,
  ChevronDown, ChevronUp, Loader2, BookUser, AlertTriangle, Bell
} from 'lucide-react';
import { formatDate as fmtDate } from '../lib/utils';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// شريط نسبة بسيط (يُستخدم لنسبتَي التسميع والحضور لكل مجموعة)
const RateBar = ({ label, value, color, isDark }) => {
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  const colors = {
    blue: { bar: 'bg-blue-500', text: 'text-blue-400' },
    emerald: { bar: 'bg-emerald-500', text: 'text-emerald-400' },
  };
  const c = colors[color] || colors.blue;
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>{label}</span>
        <span className={`text-[11px] font-bold ${c.text}`}>{pct}%</span>
      </div>
      <div className={`h-1.5 rounded-full overflow-hidden ${isDark ? 'bg-slate-700' : 'bg-slate-200'}`}>
        <div className={`h-full rounded-full ${c.bar}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
};

const AdminDashboard = () => {
  const { isDark } = useTheme();
  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [termDialogOpen, setTermDialogOpen] = useState(false);
  const [newTermName, setNewTermName] = useState('');
  const [confirmTermName, setConfirmTermName] = useState(''); // N5: تأكيد اسم الفصل الحالي
  const [closingTerm, setClosingTerm] = useState(false);
  const [activeTerm, setActiveTerm] = useState(null);
  const [allTerms, setAllTerms] = useState([]);
  const [selectedTermId, setSelectedTermId] = useState('new');
  const [loadingTerms, setLoadingTerms] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  // قائمة الطلاب بالصفحة الرئيسية + تنزيل سجل التسميع
  const [showWeekBreakdown, setShowWeekBreakdown] = useState(false);
  // المشرفون المتأخرون في تسجيل الحضور
  const [lateSheikhs, setLateSheikhs] = useState([]);
  const [alertingLate, setAlertingLate] = useState(false);
  const [showAllStudents, setShowAllStudents] = useState(false);
  const [studentSearch, setStudentSearch] = useState('');
  const [downloadingStudent, setDownloadingStudent] = useState(null);
  const [selectedExportTermId, setSelectedExportTermId] = useState('');
  const [exporting, setExporting] = useState(false);
  // F2: قيم نظام النقاط من مصدر واحد بالخادم (مع قيم احتياطية صحيحة)
  const [pointsConfig, setPointsConfig] = useState({
    attendance_points: 10,
    recitation_pass_points: 20,
    tracking_base_max: 70,
    weekly_tracking_max: 70,
  });

  useEffect(() => {
    fetchData();
    fetchActiveTerm();
    fetchAllTerms();
    fetchPointsConfig();
    fetchLateSheikhs();
  }, []);

  const fetchPointsConfig = async () => {
    try {
      const res = await axios.get(`${API}/config/points`);
      setPointsConfig(res.data);
    } catch (error) {
      console.error('Error fetching points config:', error);
    }
  };

  // N2: محرّر قواعد النقاط
  const [pointsEditorOpen, setPointsEditorOpen] = useState(false);
  const [pointsForm, setPointsForm] = useState({ attendance_points: 10, recitation_pass_points: 20, tracking_prayers_max: 35, tracking_sitting_max: 35 });
  const [savingPoints, setSavingPoints] = useState(false);

  const [recomputing, setRecomputing] = useState(false);
  const recomputePoints = async () => {
    setRecomputing(true);
    try {
      const res = await axios.post(`${API}/admin/recompute-points`);
      toast.success(res.data.message);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في إعادة الاحتساب');
    } finally {
      setRecomputing(false);
    }
  };

  const openPointsEditor = () => {
    setPointsForm({
      attendance_points: pointsConfig.attendance_points ?? 10,
      recitation_pass_points: pointsConfig.recitation_pass_points ?? 20,
      tracking_prayers_max: pointsConfig.tracking_prayers_max ?? 35,
      tracking_sitting_max: pointsConfig.tracking_sitting_max ?? 35,
    });
    setPointsEditorOpen(true);
  };

  const savePointsConfig = async () => {
    setSavingPoints(true);
    try {
      const res = await axios.put(`${API}/admin/config/points`, {
        attendance_points: parseInt(pointsForm.attendance_points),
        recitation_pass_points: parseInt(pointsForm.recitation_pass_points),
        tracking_prayers_max: parseInt(pointsForm.tracking_prayers_max),
        tracking_sitting_max: parseInt(pointsForm.tracking_sitting_max),
      });
      setPointsConfig(res.data.config);
      toast.success(res.data.message);
      setPointsEditorOpen(false);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في الحفظ');
    } finally {
      setSavingPoints(false);
    }
  };

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

  const fetchActiveTerm = async () => {
    try {
      const res = await axios.get(`${API}/terms/active`);
      setActiveTerm(res.data);
    } catch (error) {
      console.error('Error fetching active term:', error);
    }
  };

  const fetchAllTerms = async () => {
    setLoadingTerms(true);
    try {
      const res = await axios.get(`${API}/terms`);
      setAllTerms(res.data || []);
    } catch (error) {
      console.error('Error fetching terms:', error);
    } finally {
      setLoadingTerms(false);
    }
  };

  const handleCloseTermAndStartNew = async () => {
    // التحقق من الإدخال
    if (selectedTermId === 'new' && !newTermName.trim()) {
      toast.error('يرجى إدخال اسم الفصل الجديد');
      return;
    }

    // تحديد اسم الفصل الجديد
    let termName = newTermName.trim();
    if (selectedTermId !== 'new') {
      const selected = allTerms.find(t => t.id === selectedTermId);
      termName = selected ? selected.name : newTermName.trim();
    }

    if (!termName) {
      toast.error('يرجى اختيار فصل أو إدخال اسم جديد');
      return;
    }

    // N5: تأكيد بكتابة اسم الفصل الحالي بالضبط قبل التصفير
    if (activeTerm?.name && confirmTermName.trim() !== activeTerm.name.trim()) {
      toast.error(`للتأكيد، اكتب اسم الفصل الحالي بالضبط: «${activeTerm.name}»`);
      return;
    }

    setClosingTerm(true);
    try {
      const res = await axios.post(`${API}/terms/close-and-start-new`, {
        name: termName,
        confirm_name: confirmTermName.trim()
      });
      
      toast.success(res.data.message);
      setTermDialogOpen(false);
      setNewTermName('');
      setConfirmTermName('');
      setSelectedTermId('new');
      
      // تحديث البيانات
      fetchData();
      fetchActiveTerm();
      fetchAllTerms();
    } catch (error) {
      console.error('Error closing term:', error);
      toast.error(error.response?.data?.detail || 'فشل في إغلاق الفصل');
    } finally {
      setClosingTerm(false);
    }
  };

  const handleExportStudents = async (termId = null) => {
    setExporting(true);
    try {
      let url = `${API}/export/students`;
      if (termId) {
        url += `?term_id=${termId}`;
      }
      
      const response = await axios.get(url, {
        responseType: 'blob'
      });
      
      // إنشاء رابط التحميل
      const blob = new Blob([response.data], { 
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
      });
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      
      // استخراج اسم الملف
      const contentDisposition = response.headers['content-disposition'];
      let filename = 'hafiz_tracker.xlsx';
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename\*?=(?:UTF-8'')?([^;\n]*)/);
        if (filenameMatch) {
          filename = decodeURIComponent(filenameMatch[1]);
        }
      }
      
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);
      
      toast.success('تم تحميل الملف بنجاح');
      setExportDialogOpen(false);
    } catch (error) {
      console.error('Error exporting:', error);
      toast.error('فشل في تحميل الملف');
    } finally {
      setExporting(false);
    }
  };

  const handleExportTermArchive = async (termId) => {
    setExporting(true);
    try {
      const response = await axios.get(`${API}/export/term/${termId}`, {
        responseType: 'blob'
      });
      
      const blob = new Blob([response.data], { 
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
      });
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.setAttribute('download', 'hafiz_archive.xlsx');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);
      
      toast.success('تم تحميل أرشيف الفصل بنجاح');
    } catch (error) {
      console.error('Error exporting archive:', error);
      toast.error('فشل في تحميل الأرشيف');
    } finally {
      setExporting(false);
    }
  };

  const fetchLateSheikhs = async () => {
    try {
      const res = await axios.get(`${API}/reports/late-sheikhs`);
      setLateSheikhs(res.data?.sheikhs || []);
    } catch (error) {
      console.error('Error loading late sheikhs:', error);
    }
  };

  const alertLateSheikhs = async (ids) => {
    if (!ids.length) return;
    setAlertingLate(true);
    try {
      const res = await axios.post(`${API}/reports/late-sheikhs/alert`, { sheikh_ids: ids });
      toast.success(res.data.message || 'تم إرسال التنبيه');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في إرسال التنبيه');
    } finally {
      setAlertingLate(false);
    }
  };

  // تنزيل سجل تسميع طالب واحد (الفصل الحالي أو كل الفصول)
  const handleDownloadRecitations = async (student, scope) => {
    setDownloadingStudent(`${student.student_id}:${scope}`);
    try {
      const res = await axios.get(
        `${API}/export/student-recitations/${student.student_id}?scope=${scope}`,
        { responseType: 'blob' }
      );
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.download = `سجل_تسميع_${student.student_name}_${scope === 'all' ? 'كل_الفصول' : 'الفصل_الحالي'}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success(`تم تحميل سجل تسميع ${student.student_name}`);
    } catch (error) {
      console.error('Error downloading recitations:', error);
      toast.error('فشل في تحميل سجل التسميع');
    } finally {
      setDownloadingStudent(null);
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
  const allStudents = dashboardData?.all_students || [];
  const weekGroups = dashboardData?.week_groups || [];
  const totalGroupsPoints = dashboardData?.total_groups_points ?? 0;
  const activeTermName = dashboardData?.active_term_name;
  const sheikhs = dashboardData?.sheikhs || [];

  // قائمة الطلاب المعروضة: أول 5 أو الكل حسب زر «إظهار المزيد» + فلترة البحث
  const searchedStudents = studentSearch.trim()
    ? allStudents.filter((s) =>
        s.student_name?.toLowerCase().includes(studentSearch.trim().toLowerCase()) ||
        s.group_name?.toLowerCase().includes(studentSearch.trim().toLowerCase())
      )
    : allStudents;
  const visibleStudents = showAllStudents ? searchedStudents : searchedStudents.slice(0, 5);

  return (
    <div className="space-y-4 md:space-y-6 animate-fadeIn">
      {/* Welcome Header */}
      <div className={`p-4 md:p-6 rounded-xl ${isDark ? 'glass-card border border-white/10' : 'bg-white border border-slate-200 shadow-sm'}`}>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className={`text-lg md:text-2xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>مرحباً بك في لوحة التحكم</h1>
            <p className={`text-sm md:text-base ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>نظرة شاملة على أداء المركز</p>
            {activeTerm && (
              <p className={`text-xs mt-1 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>
                الفصل الحالي: {activeTerm.name}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {/* <Button 
              onClick={() => setExportDialogOpen(true)}
              variant="outline" 
              size="sm" 
              className={`text-xs md:text-sm text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10 ${isDark ? '' : 'border-emerald-300'}`}
            >
              <FileSpreadsheet className="w-3 h-3 md:w-4 md:h-4 ml-1 md:ml-2" />
              تحميل Excel
            </Button> */}
           
            {/* <Link to="/admin-rankings">
              <Button variant="outline" size="sm" className={`text-xs md:text-sm ${isDark ? 'border-white/10 hover:bg-white/5' : ''}`}>
                <TrendingUp className="w-3 h-3 md:w-4 md:h-4 ml-1 md:ml-2" />
                الترتيب التفصيلي
              </Button>
            </Link> */}
            {/* <Link to="/pending-students">
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-xs md:text-sm">

                طلبات التسجيل
              </Button>
            </Link> */}
          </div>
        </div>

        {/* وصول سريع */}
        <div className={`mt-4 pt-4 border-t ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
          <p className={`text-xs mb-2 ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>وصول سريع</p>
          <div className="flex flex-wrap gap-2">
            <Link to="/sheikh-management">
              <Button variant="outline" size="sm" className={`text-xs text-blue-400 border-blue-500/30 hover:bg-blue-500/10 ${isDark ? '' : 'border-blue-300'}`}>
                <UserPlus className="w-3 h-3 ml-1" />
                إضافة مشرف
              </Button>
            </Link>
            <Link to="/tracking-settings">
              <Button variant="outline" size="sm" className={`text-xs text-amber-400 border-amber-500/30 hover:bg-amber-500/10 ${isDark ? '' : 'border-amber-300'}`}>
                <Trophy className="w-3 h-3 ml-1" />
                إعدادات نقاط التميز
              </Button>
            </Link>
            <Link to="/student-management">
              <Button variant="outline" size="sm" className={`text-xs text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10 ${isDark ? '' : 'border-emerald-300'}`}>
                <GraduationCap className="w-3 h-3 ml-1" />
                إدارة الطلاب
              </Button>
            </Link>
            <Button
              onClick={() => setExportDialogOpen(true)}
              variant="outline"
              size="sm"
              className={`text-xs text-purple-400 border-purple-500/30 hover:bg-purple-500/10 ${isDark ? '' : 'border-purple-300'}`}
            >
              <FileSpreadsheet className="w-3 h-3 ml-1" />
              تحميل Excel
            </Button>
          </div>
        </div>
      </div>

      <OnlineUsers />

      {/* Stats Grid — بطاقات مربوطة بصفحاتها */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4">
        <Link to="/sheikh-management" className="block">
          <Card className={`${isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'} hover:border-blue-500/50 transition-colors cursor-pointer h-full`}>
            <CardContent className="p-3 md:p-4">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className={`text-xs md:text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>إدارة المشرفين</p>
                  <p className={`text-xl md:text-2xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{summary.total_sheikhs}</p>
                </div>
                <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                  <BookUser className="w-5 h-5 md:w-6 md:h-6 text-blue-400" />
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link to="/student-management" className="block">
          <Card className={`${isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'} hover:border-emerald-500/50 transition-colors cursor-pointer h-full`}>
            <CardContent className="p-3 md:p-4">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className={`text-xs md:text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>إدارة الطلاب</p>
                  <p className={`text-xl md:text-2xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{summary.total_students}</p>
                </div>
                <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                  <GraduationCap className="w-5 h-5 md:w-6 md:h-6 text-emerald-400" />
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        

        <Link to="/group-management" className="block">
          <Card className={`${isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'} hover:border-purple-500/50 transition-colors cursor-pointer h-full`}>
            <CardContent className="p-3 md:p-4">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className={`text-xs md:text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>إدارة المجموعات</p>
                  <p className={`text-xl md:text-2xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{summary.total_groups}</p>
                </div>
                <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-purple-500/20 flex items-center justify-center flex-shrink-0">
                  <Users className="w-5 h-5 md:w-6 md:h-6 text-purple-400" />
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link to="/pending-students" className="block">
          <Card className={`${isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'} hover:border-green-500/50 transition-colors cursor-pointer h-full`}>
            <CardContent className="p-3 md:p-4">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className={`text-xs md:text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>طلبات التسجيل</p>
                  <p className={`text-xl md:text-2xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                    {summary.pending_students ?? 0}
                  </p>
                  {summary.pending_students > 0 && (
                    <p className="text-[10px] md:text-xs text-green-400">بانتظار الاعتماد</p>
                  )}
                </div>
                <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-green-500/20 flex items-center justify-center flex-shrink-0 relative">
                   <UserPlus className="w-5 h-5 md:w-6 md:h-6 text-green-400" />
                   {summary.pending_students > 0 && (
                     <span className="absolute -top-1 -left-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                       {summary.pending_students}
                     </span>
                   )}
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* نِسَب الأسبوع (السبت→الجمعة) — «عرض المزيد» بيفتح تفريع بكل مجموعة */}
      <div className="grid grid-cols-2 gap-2 md:gap-4">
        <Card
          onClick={() => setShowWeekBreakdown(!showWeekBreakdown)}
          className={`${isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'} hover:border-emerald-500/50 transition-colors cursor-pointer h-full`}
        >
          <CardContent className="p-3 md:p-4">
            <div className="flex items-center gap-2 md:gap-3">
              <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                <UserCheck className="w-4 h-4 md:w-5 md:h-5 text-emerald-400" />
              </div>
              <div className="min-w-0">
                <p className={`text-[10px] md:text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>نسبة حضور الأسبوع</p>
                <p className={`text-lg md:text-xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  {summary.week_attendance_rate ?? 0}<span className="text-xs font-normal">%</span>
                </p>
                {summary.week_start && (
                  <p className={`text-[9px] md:text-[11px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{fmtDate(summary.week_start)} — {fmtDate(summary.week_end)}</p>
                )}
              </div>
            </div>
            <p className="text-[10px] md:text-xs text-emerald-400 mt-1 text-left flex items-center justify-end gap-1">
              {showWeekBreakdown ? <>إخفاء التفريع <ChevronUp className="w-3 h-3" /></> : <>عرض المزيد <ChevronDown className="w-3 h-3" /></>}
            </p>
          </CardContent>
        </Card>

        <Card
          onClick={() => setShowWeekBreakdown(!showWeekBreakdown)}
          className={`${isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'} hover:border-blue-500/50 transition-colors cursor-pointer h-full`}
        >
          <CardContent className="p-3 md:p-4">
            <div className="flex items-center gap-2 md:gap-3">
              <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                <BookOpen className="w-4 h-4 md:w-5 md:h-5 text-blue-400" />
              </div>
              <div className="min-w-0">
                <p className={`text-[10px] md:text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>نسبة تسميع الأسبوع</p>
                <p className={`text-lg md:text-xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  {summary.week_recitation_rate ?? 0}<span className="text-xs font-normal">%</span>
                </p>
                {summary.week_start && (
                  <p className={`text-[9px] md:text-[11px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                    {summary.week_pages ?? 0} صفحة هذا الأسبوع
                  </p>
                )}
              </div>
            </div>
            <p className="text-[10px] md:text-xs text-blue-400 mt-1 text-left flex items-center justify-end gap-1">
              {showWeekBreakdown ? <>إخفاء التفريع <ChevronUp className="w-3 h-3" /></> : <>عرض المزيد <ChevronDown className="w-3 h-3" /></>}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* تفريع الأسبوع: كل مجموعة لحالها مع مشرفها ونسبتَيها */}
      {showWeekBreakdown && (
        <Card className={isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'}>
          <CardHeader className="p-3 md:p-6">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <CardTitle className={`flex items-center gap-2 text-sm md:text-base ${isDark ? 'text-white' : 'text-slate-900'}`}>
                <Users className="w-4 h-4 md:w-5 md:h-5 text-purple-400" />
                تفريع الأسبوع حسب المجموعة
              </CardTitle>
              <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                {fmtDate(summary.week_start)} — {fmtDate(summary.week_end)}
              </span>
            </div>
          </CardHeader>
          <CardContent className="p-3 md:p-6 pt-0">
            {weekGroups.length === 0 ? (
              <p className={`text-center py-4 text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>لا توجد مجموعات</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {weekGroups.map((g) => (
                  <div
                    key={g.group_id}
                    className={`p-3 rounded-xl border ${isDark ? 'bg-slate-800/40 border-white/10' : 'bg-slate-50 border-slate-200'}`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                      <div className="min-w-0">
                        <p className={`font-bold text-sm truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>
                          {g.group_name}
                        </p>
                        <p className={`text-xs truncate ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                          المشرف: {g.sheikh_name} • {g.students_count} طالب
                        </p>
                      </div>
                      <Link to={`/statistics?group=${g.group_id}`}>
                        <Button variant="ghost" size="sm" className="text-slate-400 hover:text-emerald-400 h-7">
                          <Eye className="w-4 h-4" />
                        </Button>
                      </Link>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <RateBar label="الحضور" value={g.attendance_rate} color="emerald" isDark={isDark} />
                      <RateBar label="التسميع" value={g.recitation_rate} color="blue" isDark={isDark} />
                    </div>
                    <p className={`text-[10px] mt-2 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                      {g.attendance_records} سجل حضور • {g.recitation_records} سجل تسميع
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        {/* Top Groups */}
        <Card className={isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'}>
          <CardHeader className="flex flex-row items-center justify-between p-3 md:p-6">
            <CardTitle className={`flex items-center gap-2 text-sm md:text-base ${isDark ? 'text-white' : 'text-slate-900'}`}>
              <Users className="w-4 h-4 md:w-5 md:h-5 text-purple-400" />
              ترتيب المجموعات
            </CardTitle>
            <div className="flex items-center gap-2">
              {/* مجموع نقاط كل المجموعات */}
              <div className={`px-3 py-1.5 rounded-lg text-center ${isDark ? 'bg-emerald-500/15 border border-emerald-500/30' : 'bg-emerald-50 border border-emerald-200'}`}>
                <p className={`text-[9px] leading-tight ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>مجموع النقاط</p>
                <p className="text-sm md:text-base font-bold text-emerald-400 leading-tight">{totalGroupsPoints}</p>
              </div>
              <Link to="/admin-rankings?filter=groups">
                <Button variant="ghost" size="sm" className="text-emerald-400 text-xs md:text-sm">
                  عرض الكل <ArrowUpRight className="w-4 h-4 mr-1" />
                </Button>
              </Link>
            </div>
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

        {/* الطلاب — أول 5 مع «إظهار المزيد» وزر تنزيل سجل التسميع لكل طالب */}
        <Card className={isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'}>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className={`flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
              <Trophy className="w-5 h-5 text-amber-400" />
              الطلاب
              <span className={`text-xs font-normal ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                ({allStudents.length})
              </span>
            </CardTitle>
            <Link to="/admin-rankings?filter=students">
              <Button variant="ghost" size="sm" className="text-emerald-400">
                الترتيب <ArrowUpRight className="w-4 h-4 mr-1" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {allStudents.length === 0 ? (
              <p className={`text-center py-4 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>لا يوجد طلاب</p>
            ) : (
              <>
                {/* البحث يظهر فقط بعد توسيع القائمة */}
                {showAllStudents && (
                  <Input
                    value={studentSearch}
                    onChange={(e) => setStudentSearch(e.target.value)}
                    placeholder="بحث باسم الطالب أو المجموعة..."
                    className={`mb-3 h-9 text-sm ${isDark ? 'bg-slate-800 border-slate-700 text-white' : ''}`}
                  />
                )}

                <div className={`space-y-3 ${showAllStudents ? 'max-h-[32rem] overflow-y-auto pl-1' : ''}`}>
                  {visibleStudents.map((student, index) => {
                    const badge = getRankBadge(index + 1);
                    const busyCurrent = downloadingStudent === `${student.student_id}:current`;
                    const busyAll = downloadingStudent === `${student.student_id}:all`;
                    return (
                      <div
                        key={student.student_id}
                        className={`p-3 rounded-lg ${isDark ? 'bg-slate-800/50' : 'bg-slate-50'}`}
                      >
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-3 min-w-0">
                            <span className={`w-8 h-8 flex items-center justify-center rounded-full text-sm font-bold flex-shrink-0 ${badge.bg} ${badge.text}`}>
                              {badge.icon}
                            </span>
                            <div className="min-w-0">
                              <StudentLink studentId={student.student_id} name={student.student_name} className={`font-medium ${isDark ? 'text-white' : 'text-slate-900'}`} />
                              <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>{student.group_name}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <span className="text-emerald-400 font-bold text-sm">{student.total_points} نقطة</span>
                            <Link to={`/student/${student.student_id}`}>
                              <Button variant="ghost" size="sm" className="text-slate-400 hover:text-emerald-400" title="ملف الطالب">
                                <Eye className="w-4 h-4" />
                              </Button>
                            </Link>
                          </div>
                        </div>

                        {/* تنزيل سجل التسميع */}
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          <span className={`text-[11px] ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                            سجل التسميع:
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDownloadRecitations(student, 'current')}
                            disabled={busyCurrent || busyAll}
                            className={`h-7 text-[11px] px-2 text-blue-400 border-blue-500/30 hover:bg-blue-500/10 ${isDark ? '' : 'border-blue-300'}`}
                          >
                            {busyCurrent
                              ? <Loader2 className="w-3 h-3 ml-1 animate-spin" />
                              : <Download className="w-3 h-3 ml-1" />}
                            الفصل الحالي
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDownloadRecitations(student, 'all')}
                            disabled={busyCurrent || busyAll}
                            className={`h-7 text-[11px] px-2 text-purple-400 border-purple-500/30 hover:bg-purple-500/10 ${isDark ? '' : 'border-purple-300'}`}
                          >
                            {busyAll
                              ? <Loader2 className="w-3 h-3 ml-1 animate-spin" />
                              : <Download className="w-3 h-3 ml-1" />}
                            كل الفصول
                          </Button>
                        </div>
                      </div>
                    );
                  })}

                  {showAllStudents && searchedStudents.length === 0 && (
                    <p className={`text-center py-4 text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                      لا يوجد طالب مطابق للبحث
                    </p>
                  )}
                </div>

                {/* زر إظهار المزيد / أقل */}
                {allStudents.length > 5 && (
                  <Button
                    variant="ghost"
                    onClick={() => { setShowAllStudents(!showAllStudents); setStudentSearch(''); }}
                    className="w-full mt-3 text-emerald-400 hover:bg-emerald-500/10"
                  >
                    {showAllStudents ? (
                      <><ChevronUp className="w-4 h-4 ml-1" />إظهار أقل</>
                    ) : (
                      <><ChevronDown className="w-4 h-4 ml-1" />إظهار المزيد ({allStudents.length - 5} طالب)</>
                    )}
                  </Button>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* المشرفون المتأخرون في تسجيل الحضور */}
      {lateSheikhs.length > 0 && (
        <Card className={`${isDark ? 'glass-card' : 'bg-white'} border-amber-500/40`}>
          <CardHeader>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <CardTitle className={`flex items-center gap-2 text-base ${isDark ? 'text-white' : 'text-slate-900'}`}>
                <AlertTriangle className="w-5 h-5 text-amber-400" />
                مشرفون متأخّرون في تسجيل الحضور
                <span className="text-xs font-normal text-amber-400">({lateSheikhs.length})</span>
              </CardTitle>
              <Button
                size="sm"
                onClick={() => alertLateSheikhs(lateSheikhs.map((s) => s.sheikh_id))}
                disabled={alertingLate}
                className="bg-amber-600 hover:bg-amber-700 text-xs"
              >
                {alertingLate ? <Loader2 className="w-3 h-3 ml-1 animate-spin" /> : <Bell className="w-3 h-3 ml-1" />}
                تنبيه الكل
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {lateSheikhs.map((s) => (
                <div key={s.sheikh_id} className={`p-3 rounded-lg flex items-center justify-between gap-2 flex-wrap ${isDark ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-amber-50 border border-amber-200'}`}>
                  <div className="min-w-0">
                    <p className={`font-medium text-sm truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>{s.sheikh_name}</p>
                    <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                      {s.students_count} طالب · {s.groups.join('، ') || 'بدون مجموعات'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs px-2 py-1 rounded-full bg-amber-500/20 text-amber-400">
                      {s.days_since === null ? 'لم يسجّل مطلقًا' : `${s.days_since} يوم`}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => alertLateSheikhs([s.sheikh_id])}
                      className="text-amber-400 hover:bg-amber-500/10"
                      title="إرسال تنبيه"
                    >
                      <Bell className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* أداء المشرفين والمجموعات خلال الفصل */}
      <Card className={isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'}>
        <CardHeader>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className={`flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
              <BookUser className="w-5 h-5 text-blue-400" />
              أداء المشرفين والمجموعات
              {activeTermName && (
                <span className={`text-xs font-normal ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  — {activeTermName}
                </span>
              )}
            </CardTitle>
            <Link to="/sheikh-management">
              <Button variant="ghost" size="sm" className="text-emerald-400">
                إدارة المشرفين <ArrowUpRight className="w-4 h-4 mr-1" />
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {sheikhs.length === 0 ? (
            <p className={`text-center py-4 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>لا يوجد مشرفون</p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {sheikhs.map((sheikh) => (
                <div
                  key={sheikh.sheikh_id}
                  className={`p-4 rounded-xl border ${isDark ? 'bg-slate-800/40 border-white/10' : 'bg-slate-50 border-slate-200'}`}
                >
                  {/* رأس بطاقة المشرف */}
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-9 h-9 rounded-lg bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                        <BookUser className="w-4 h-4 text-blue-400" />
                      </div>
                      <div className="min-w-0">
                        <p className={`font-bold truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>
                          {sheikh.sheikh_name}
                        </p>
                        <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                          {sheikh.groups_count} مجموعة • {sheikh.students_count} طالب
                        </p>
                      </div>
                    </div>
                    <Link to={`/users?sheikh=${sheikh.sheikh_id}`}>
                      <Button variant="ghost" size="sm" className="text-slate-400 hover:text-emerald-400">
                        <Eye className="w-4 h-4" />
                      </Button>
                    </Link>
                  </div>

                  {/* مجموعات المشرف */}
                  {(!sheikh.groups || sheikh.groups.length === 0) ? (
                    <p className={`text-xs text-center py-3 ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                      لا توجد مجموعات مُسندة إلى هذا المشرف
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {sheikh.groups.map((g) => (
                        <div
                          key={g.group_id}
                          className={`p-3 rounded-lg ${isDark ? 'bg-slate-900/50' : 'bg-white border border-slate-200'}`}
                        >
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <span className={`text-sm font-medium truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>
                              {g.group_name}
                            </span>
                            <span className={`text-xs flex-shrink-0 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                              {g.students_count} طالب
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <RateBar label="التسميع" value={g.recitation_rate} color="blue" isDark={isDark} />
                            <RateBar label="الحضور" value={g.attendance_rate} color="emerald" isDark={isDark} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* جدول الفصول الدراسية */}
      <Card className={isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'}>
        <CardHeader>
          <CardTitle className={`flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
            <Calendar className="w-5 h-5 text-purple-400" />
            الفصول الدراسية
          </CardTitle>
           <Button 
              onClick={() => setTermDialogOpen(true)}
              variant="outline" 
              size="sm" 
              className={`text-xs md:text-sm text-amber-400 border-amber-500/30 hover:bg-amber-500/10 ${isDark ? '' : 'border-amber-300'}`}
            >
              <Archive className="w-3 h-3 md:w-4 md:h-4 ml-1 md:ml-2" />
              إغلاق الفصل وبدء فصل جديد
            </Button>
        </CardHeader>
        <CardContent>
          {loadingTerms ? (
            <div className="flex items-center justify-center py-4">
              <RefreshCw className="w-5 h-5 animate-spin text-emerald-400" />
            </div>
          ) : allTerms.length === 0 ? (
            <p className={`text-center py-4 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>لا توجد فصول دراسية</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className={`border-b ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
                    <th className={`px-4 py-3 text-right text-sm font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>اسم الفصل</th>
                    <th className={`px-4 py-3 text-right text-sm font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>تاريخ البداية</th>
                    <th className={`px-4 py-3 text-right text-sm font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>تاريخ النهاية</th>
                    <th className={`px-4 py-3 text-right text-sm font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>الحالة</th>
                    <th className={`px-4 py-3 text-right text-sm font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>تحميل</th>
                  </tr>
                </thead>
                <tbody>
                  {allTerms.map((term) => (
                    <tr key={term.id} className={`border-b ${isDark ? 'border-white/5 hover:bg-white/5' : 'border-slate-100 hover:bg-slate-50'}`}>
                      <td className={`px-4 py-3 font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>{term.name}</td>
                      <td className={`px-4 py-3 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                        {term.start_date ? fmtDate(term.start_date) : '-'}
                      </td>
                      <td className={`px-4 py-3 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                        {term.end_date ? fmtDate(term.end_date) : '-'}
                      </td>
                      <td className="px-4 py-3">
                        {term.is_active ? (
                          <span className="px-2 py-1 rounded-full text-xs bg-emerald-500/20 text-emerald-400">
                            نشط
                          </span>
                        ) : (
                          <span className={`px-2 py-1 rounded-full text-xs ${isDark ? 'bg-slate-700 text-slate-400' : 'bg-slate-200 text-slate-600'}`}>
                            مغلق
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => term.is_active ? handleExportStudents(term.id) : handleExportTermArchive(term.id)}
                          className="text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
                          disabled={exporting}
                        >
                          <Download className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Points System Info (F2) + N2 editor */}
      <Card className={isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className={`flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
              <Target className="w-5 h-5 text-emerald-400" />
              نظام النقاط
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={recomputePoints} disabled={recomputing} className={isDark ? 'border-white/10 text-white hover:bg-white/5' : ''}>
                <RefreshCw className={`w-4 h-4 ml-1 ${recomputing ? 'animate-spin' : ''}`} /> إعادة احتساب النقاط
              </Button>
              <Button size="sm" variant="outline" onClick={openPointsEditor} className={isDark ? 'border-white/10 text-white hover:bg-white/5' : ''}>
                <Edit className="w-4 h-4 ml-1" /> تعديل القواعد
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className={`p-4 rounded-xl text-center ${isDark ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-emerald-50 border border-emerald-200'}`}>
              <UserCheck className="w-8 h-8 mx-auto mb-2 text-emerald-400" />
              <p className={`text-sm ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>الحضور</p>
              <p className="text-2xl font-bold text-emerald-400">{pointsConfig.attendance_points} نقاط</p>
              <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>لكل يوم</p>
            </div>
            <div className={`p-4 rounded-xl text-center ${isDark ? 'bg-blue-500/10 border border-blue-500/30' : 'bg-blue-50 border border-blue-200'}`}>
              <BookOpen className="w-8 h-8 mx-auto mb-2 text-blue-400" />
              <p className={`text-sm ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>التسميع</p>
              <p className="text-2xl font-bold text-blue-400">{pointsConfig.recitation_pass_points} نقطة</p>
              <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>لكل تسميع ناجح</p>
            </div>
            <div className={`p-4 rounded-xl text-center ${isDark ? 'bg-purple-500/10 border border-purple-500/30' : 'bg-purple-50 border border-purple-200'}`}>
              <Calendar className="w-8 h-8 mx-auto mb-2 text-purple-400" />
              <p className={`text-sm ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>ورقة المتابعة</p>
              <p className="text-2xl font-bold text-purple-400">{pointsConfig.tracking_base_max} نقطة</p>
              <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>الأساس الأسبوعي (+ بنود المشرف)</p>
            </div>
            <div className={`p-4 rounded-xl text-center ${isDark ? 'bg-amber-500/10 border border-amber-500/30' : 'bg-amber-50 border border-amber-200'}`}>
              <Trophy className="w-8 h-8 mx-auto mb-2 text-amber-400" />
              <p className={`text-sm ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>الإجمالي الأسبوعي</p>
              <p className="text-2xl font-bold text-amber-400">{pointsConfig.weekly_tracking_max} نقطة</p>
              <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>ورقة المتابعة الأساسية</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* N2: Points rules editor dialog */}
      <Dialog open={pointsEditorOpen} onOpenChange={setPointsEditorOpen}>
        <DialogContent className={isDark ? 'bg-slate-900 border-white/10' : 'bg-white'}>
          <DialogHeader>
            <DialogTitle className={isDark ? 'text-white' : 'text-slate-900'}>تعديل قواعد النقاط</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {[
              { key: 'attendance_points', label: 'نقاط الحضور (لكل يوم)' },
              { key: 'recitation_pass_points', label: 'نقاط التسميع الناجح' },
              { key: 'tracking_prayers_max', label: 'حد نقاط الصلوات (ورقة المتابعة)' },
              { key: 'tracking_sitting_max', label: 'حد نقاط الجلوس مع القرآن' },
            ].map((f) => (
              <div key={f.key}>
                <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>{f.label}</Label>
                <Input
                  type="number"
                  min="0"
                  value={pointsForm[f.key]}
                  onChange={(e) => setPointsForm({ ...pointsForm, [f.key]: e.target.value })}
                  className={isDark ? 'bg-slate-800 border-white/10 text-white' : ''}
                />
              </div>
            ))}
            <div className={`p-3 rounded-lg text-sm ${isDark ? 'bg-blue-500/10 text-blue-300' : 'bg-blue-50 text-blue-700'}`}>
              الإجمالي الأسبوعي لورقة المتابعة (الأساس): {(parseInt(pointsForm.tracking_prayers_max) || 0) + (parseInt(pointsForm.tracking_sitting_max) || 0)} نقطة
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPointsEditorOpen(false)} className={isDark ? 'border-white/10' : ''}>إلغاء</Button>
            <Button onClick={savePointsConfig} disabled={savingPoints} className="bg-emerald-600 hover:bg-emerald-700">حفظ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Term Management Dialog */}
      <Dialog open={termDialogOpen} onOpenChange={setTermDialogOpen}>
        <DialogContent className={`${isDark ? 'bg-slate-900 border-white/10' : 'bg-white'} max-w-2xl max-h-[90vh] overflow-y-auto`}>
          <DialogHeader>
            <DialogTitle className={isDark ? 'text-white' : 'text-slate-900'}>
              إغلاق الفصل وبدء فصل جديد
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* تحذير */}
            <div className={`p-4 rounded-lg ${isDark ? 'bg-red-500/10 border border-red-500/30' : 'bg-red-50 border border-red-200'}`}>
              <p className={`text-sm font-bold ${isDark ? 'text-red-400' : 'text-red-700'}`}>
                تحذير هام:
              </p>
              <ul className={`text-sm mt-2 space-y-1 ${isDark ? 'text-red-300' : 'text-red-600'}`}>
                <li>• أرشفة بيانات جميع الطلاب للفصل الحالي</li>
                <li>• <strong>تصفير جميع نقاط الطلاب إلى 0</strong></li>
                <li>• إنشاء فصل دراسي جديد</li>
              </ul>
            </div>

            {/* الفصل الحالي */}
            {activeTerm && (
              <div className={`p-3 rounded-lg ${isDark ? 'bg-slate-800/50' : 'bg-slate-100'}`}>
                <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>الفصل الحالي (سيتم إغلاقه):</p>
                <p className={`font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>{activeTerm.name}</p>
              </div>
            )}

            {/* جدول الفصول السابقة */}
            {allTerms.length > 0 && (
              <div>
                <Label className={`mb-2 block ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                  اختر فصلاً سابقاً أو أنشئ جديداً:
                </Label>
                <div className={`rounded-lg border ${isDark ? 'border-white/10' : 'border-slate-200'} max-h-48 overflow-y-auto`}>
                  <table className="w-full">
                    <thead className={`sticky top-0 ${isDark ? 'bg-slate-800' : 'bg-slate-50'}`}>
                      <tr>
                        <th className={`px-3 py-2 text-right text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>اختر</th>
                        <th className={`px-3 py-2 text-right text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>اسم الفصل</th>
                        <th className={`px-3 py-2 text-right text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>الحالة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* خيار إنشاء فصل جديد */}
                      <tr 
                        className={`cursor-pointer ${selectedTermId === 'new' ? (isDark ? 'bg-emerald-500/20' : 'bg-emerald-50') : ''} ${isDark ? 'hover:bg-slate-800/50' : 'hover:bg-slate-50'}`}
                        onClick={() => setSelectedTermId('new')}
                      >
                        <td className="px-3 py-2">
                          <input 
                            type="radio" 
                            checked={selectedTermId === 'new'} 
                            onChange={() => setSelectedTermId('new')}
                            className="accent-emerald-500"
                          />
                        </td>
                        <td className={`px-3 py-2 font-medium ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>
                          + إنشاء فصل جديد
                        </td>
                        <td className="px-3 py-2">-</td>
                      </tr>
                      {/* الفصول الموجودة */}
                      {allTerms.filter(t => !t.is_active).map(term => (
                        <tr 
                          key={term.id}
                          className={`cursor-pointer ${selectedTermId === term.id ? (isDark ? 'bg-blue-500/20' : 'bg-blue-50') : ''} ${isDark ? 'hover:bg-slate-800/50' : 'hover:bg-slate-50'}`}
                          onClick={() => setSelectedTermId(term.id)}
                        >
                          <td className="px-3 py-2">
                            <input 
                              type="radio" 
                              checked={selectedTermId === term.id} 
                              onChange={() => setSelectedTermId(term.id)}
                              className="accent-blue-500"
                            />
                          </td>
                          <td className={`px-3 py-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                            {term.name}
                          </td>
                          <td className="px-3 py-2">
                            <span className={`text-xs px-2 py-1 rounded ${isDark ? 'bg-slate-700 text-slate-400' : 'bg-slate-200 text-slate-600'}`}>
                              مغلق
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* اسم الفصل الجديد (يظهر فقط عند اختيار إنشاء جديد) */}
            {selectedTermId === 'new' && (
              <div>
                <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>
                  اسم الفصل الجديد <span className="text-red-400">*</span>
                </Label>
                <Input
                  value={newTermName}
                  onChange={(e) => setNewTermName(e.target.value)}
                  placeholder="مثال: الفصل الثاني 2026"
                  className={`mt-1 ${isDark ? 'bg-slate-800 border-white/10 text-white' : ''}`}
                />
              </div>
            )}

            {/* ملخص الاختيار */}
            <div className={`p-3 rounded-lg ${isDark ? 'bg-blue-500/10 border border-blue-500/30' : 'bg-blue-50 border border-blue-200'}`}>
              <p className={`text-sm ${isDark ? 'text-blue-400' : 'text-blue-700'}`}>
                <strong>سيتم:</strong> {selectedTermId === 'new'
                  ? `إنشاء فصل جديد باسم "${newTermName || '...'}"`
                  : `استخدام الفصل "${allTerms.find(t => t.id === selectedTermId)?.name || ''}"`
                }
              </p>
            </div>

            {/* N5: تأكيد التصفير بكتابة اسم الفصل الحالي */}
            {activeTerm?.name && (
              <div className={`p-3 rounded-lg ${isDark ? 'bg-red-500/10 border border-red-500/30' : 'bg-red-50 border border-red-200'}`}>
                <Label className={`text-sm block mb-2 ${isDark ? 'text-red-300' : 'text-red-700'}`}>
                  للتأكيد، اكتب اسم الفصل الحالي بالضبط: <strong>«{activeTerm.name}»</strong>
                </Label>
                <Input
                  value={confirmTermName}
                  onChange={(e) => setConfirmTermName(e.target.value)}
                  placeholder={activeTerm.name}
                  className={isDark ? 'bg-slate-800 border-white/10 text-white' : ''}
                />
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setTermDialogOpen(false)}
              className={isDark ? 'border-white/10' : ''}
            >
              إلغاء
            </Button>
            <Button
              onClick={handleCloseTermAndStartNew}
              disabled={closingTerm || (selectedTermId === 'new' && !newTermName.trim()) || (activeTerm?.name && confirmTermName.trim() !== activeTerm.name.trim())}
              className="bg-red-600 hover:bg-red-700"
            >
              {closingTerm ? (
                <>
                  <RefreshCw className="w-4 h-4 ml-2 animate-spin" />
                  جارٍ الإغلاق...
                </>
              ) : (
                <>
                  <Archive className="w-4 h-4 ml-2" />
                  إغلاق وتصفير النقاط
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Export Excel Dialog */}
      <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
        <DialogContent className={`${isDark ? 'bg-slate-900 border-white/10' : 'bg-white'} max-w-lg`}>
          <DialogHeader>
            <DialogTitle className={isDark ? 'text-white' : 'text-slate-900'}>
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
                تحميل بيانات الطلاب
              </div>
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
              اختر الفصل الدراسي لتحميل بياناته:
            </p>
            
            {/* الفصل النشط */}
            <div 
              onClick={() => handleExportStudents(activeTerm?.id)}
              className={`p-4 rounded-lg border cursor-pointer transition-colors ${isDark ? 'border-emerald-500/30 hover:bg-emerald-500/10' : 'border-emerald-200 hover:bg-emerald-50'}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-emerald-400" />
                  <div>
                    <p className={`font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>
                      {activeTerm?.name || 'الفصل الحالي'}
                    </p>
                    <p className={`text-xs ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>نشط</p>
                  </div>
                </div>
                <Download className={`w-5 h-5 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} />
              </div>
            </div>

            {/* الفصول المغلقة */}
            {allTerms.filter(t => !t.is_active).length > 0 && (
              <div>
                <p className={`text-xs mb-2 ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                  الفصول السابقة (الأرشيف):
                </p>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {allTerms.filter(t => !t.is_active).map(term => (
                    <div 
                      key={term.id}
                      onClick={() => handleExportTermArchive(term.id)}
                      className={`p-3 rounded-lg border cursor-pointer transition-colors ${isDark ? 'border-white/10 hover:bg-white/5' : 'border-slate-200 hover:bg-slate-50'}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Archive className={`w-4 h-4 ${isDark ? 'text-slate-400' : 'text-slate-500'}`} />
                          <span className={isDark ? 'text-slate-300' : 'text-slate-700'}>{term.name}</span>
                        </div>
                        <Download className={`w-4 h-4 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {exporting && (
              <div className="flex items-center justify-center py-4">
                <RefreshCw className="w-6 h-6 animate-spin text-emerald-400" />
                <span className={`mr-2 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>جارٍ التحميل...</span>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setExportDialogOpen(false)}
              className={isDark ? 'border-white/10' : ''}
            >
              إغلاق
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminDashboard;
