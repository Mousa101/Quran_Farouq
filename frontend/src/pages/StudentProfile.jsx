import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { 
  User, BookOpen, Calendar, CheckCircle, XCircle, Clock, Trophy, 
  Star, Building, GraduationCap, Edit, Trash2, ArrowRight, Loader2,
  FileText, RotateCcw
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const StudentProfile = () => {
  const { studentId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [profileData, setProfileData] = useState(null);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editData, setEditData] = useState({});

  useEffect(() => {
    fetchProfile();
    fetchGroups();
  }, [studentId]);

  const fetchProfile = async () => {
    try {
      const response = await axios.get(`${API}/students/${studentId}/profile`);
      setProfileData(response.data);
      setEditData({
        name: response.data.student.name,
        mosque_name: response.data.student.mosque_name || '',
        school_name: response.data.student.school_name || '',
        school_grade: response.data.student.school_grade || '',
        birth_date: response.data.student.birth_date || '',
        group_id: response.data.student.group_id || ''
      });
    } catch (error) {
      console.error('Error:', error);
      toast.error('فشل تحميل بيانات الطالب');
    } finally {
      setLoading(false);
    }
  };

  const fetchGroups = async () => {
    try {
      const response = await axios.get(`${API}/groups`);
      setGroups(response.data);
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await axios.put(`${API}/students/${studentId}`, editData);
      toast.success('تم تحديث البيانات بنجاح');
      setEditOpen(false);
      fetchProfile();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل تحديث البيانات');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('هل أنت متأكد من حذف هذا الطالب؟ سيتم حذف جميع بياناته!')) return;
    
    try {
      await axios.delete(`${API}/students/${studentId}`);
      toast.success('تم حذف الطالب بنجاح');
      navigate('/users');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل حذف الطالب');
    }
  };

  const handleChangeGroup = async (newGroupId) => {
    try {
      await axios.post(`${API}/students/${studentId}/change-group?group_id=${newGroupId || ''}`);
      toast.success('تم نقل الطالب بنجاح');
      fetchProfile();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل نقل الطالب');
    }
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
        <p>الطالب غير موجود</p>
      </div>
    );
  }

  const { student, group, points, attendance_summary, recitation_summary, attendance_records, recitation_records, tracking_sheets } = profileData;
  const isAdmin = user?.role === 'admin';

  return (
    <div className="space-y-6 animate-fadeIn" data-testid="student-profile-page">
      {/* Back Button */}
      <Button variant="ghost" onClick={() => navigate(-1)} className="text-slate-400 hover:text-white">
        <ArrowRight className="w-4 h-4 ml-2" />
        رجوع
      </Button>

      {/* Profile Header */}
      <Card className="glass-card border-white/10">
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row gap-6 items-start md:items-center">
            {/* Profile Image */}
            <div className="w-24 h-24 rounded-full bg-emerald-500/20 flex items-center justify-center overflow-hidden">
              {student.profile_image ? (
                <img 
                  src={`data:image/jpeg;base64,${student.profile_image}`} 
                  alt={student.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <User className="w-12 h-12 text-emerald-400" />
              )}
            </div>

            {/* Info */}
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-white mb-2">{student.name}</h1>
              <div className="flex flex-wrap gap-4 text-sm">
                {student.mosque_name && (
                  <span className="text-slate-400 flex items-center gap-1">
                    <Building className="w-4 h-4" />
                    {student.mosque_name}
                  </span>
                )}
                {student.school_name && (
                  <span className="text-slate-400 flex items-center gap-1">
                    <GraduationCap className="w-4 h-4" />
                    {student.school_name}
                  </span>
                )}
                {student.birth_date && (
                  <span className="text-slate-400 flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    {student.birth_date}
                  </span>
                )}
                {group && (
                  <span className="text-emerald-400 flex items-center gap-1">
                    <BookOpen className="w-4 h-4" />
                    {group.name}
                  </span>
                )}
              </div>
            </div>

            {/* Actions (Admin only) */}
            {isAdmin && (
              <div className="flex gap-2">
                <Dialog open={editOpen} onOpenChange={setEditOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm" className="border-slate-700">
                      <Edit className="w-4 h-4 ml-1" />
                      تعديل
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="bg-slate-900 border-slate-700">
                    <DialogHeader>
                      <DialogTitle className="text-white">تعديل بيانات الطالب</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 mt-4">
                      <div className="space-y-2">
                        <Label className="text-slate-300">الاسم</Label>
                        <Input
                          value={editData.name}
                          onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                          className="bg-slate-800 border-slate-700 text-white"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label className="text-slate-300">المسجد</Label>
                          <Input
                            value={editData.mosque_name}
                            onChange={(e) => setEditData({ ...editData, mosque_name: e.target.value })}
                            className="bg-slate-800 border-slate-700 text-white"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-slate-300">المدرسة</Label>
                          <Input
                            value={editData.school_name}
                            onChange={(e) => setEditData({ ...editData, school_name: e.target.value })}
                            className="bg-slate-800 border-slate-700 text-white"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label className="text-slate-300">المعدل</Label>
                          <Input
                            value={editData.school_grade}
                            onChange={(e) => setEditData({ ...editData, school_grade: e.target.value })}
                            className="bg-slate-800 border-slate-700 text-white"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-slate-300">تاريخ الميلاد</Label>
                          <Input
                            type="date"
                            value={editData.birth_date}
                            onChange={(e) => setEditData({ ...editData, birth_date: e.target.value })}
                            className="bg-slate-800 border-slate-700 text-white"
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-slate-300">المجموعة</Label>
                        <Select value={editData.group_id || ''} onValueChange={(v) => setEditData({ ...editData, group_id: v })}>
                          <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                            <SelectValue placeholder="اختر المجموعة" />
                          </SelectTrigger>
                          <SelectContent className="bg-slate-800 border-slate-700">
                            <SelectItem value="" className="text-white">بدون مجموعة</SelectItem>
                            {groups.map((g) => (
                              <SelectItem key={g.id} value={g.id} className="text-white">{g.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Button onClick={handleSave} className="w-full bg-emerald-500 hover:bg-emerald-600" disabled={saving}>
                        {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : 'حفظ'}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
                
                <Button variant="outline" size="sm" onClick={handleDelete} className="border-red-500/50 text-red-400 hover:bg-red-500/10">
                  <Trash2 className="w-4 h-4 ml-1" />
                  حذف
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="glass-card border-white/10">
          <CardContent className="p-4 text-center">
            <Trophy className="w-8 h-8 mx-auto text-amber-400 mb-2" />
            <p className="text-2xl font-bold text-white">{points?.total_points || 0}</p>
            <p className="text-slate-400 text-sm">مجموع النقاط</p>
          </CardContent>
        </Card>
        <Card className="glass-card border-white/10">
          <CardContent className="p-4 text-center">
            <Star className="w-8 h-8 mx-auto text-emerald-400 mb-2" />
            <p className="text-2xl font-bold text-white">{points?.level || 1}</p>
            <p className="text-slate-400 text-sm">المستوى</p>
          </CardContent>
        </Card>
        <Card className="glass-card border-white/10">
          <CardContent className="p-4 text-center">
            <CheckCircle className="w-8 h-8 mx-auto text-emerald-400 mb-2" />
            <p className="text-2xl font-bold text-white">{attendance_summary?.percentage || 0}%</p>
            <p className="text-slate-400 text-sm">نسبة الحضور</p>
          </CardContent>
        </Card>
        <Card className="glass-card border-white/10">
          <CardContent className="p-4 text-center">
            <BookOpen className="w-8 h-8 mx-auto text-blue-400 mb-2" />
            <p className="text-2xl font-bold text-white">{recitation_summary?.total_new_pages || 0}</p>
            <p className="text-slate-400 text-sm">صفحات الحفظ</p>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Records */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Attendance Summary */}
        <Card className="glass-card border-white/10">
          <CardHeader>
            <CardTitle className="text-lg font-bold text-white">ملخص الحضور</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="text-center p-3 rounded-lg bg-emerald-500/10">
                <CheckCircle className="w-6 h-6 mx-auto text-emerald-400 mb-1" />
                <p className="text-xl font-bold text-white">{attendance_summary?.present || 0}</p>
                <p className="text-slate-400 text-xs">حاضر</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-red-500/10">
                <XCircle className="w-6 h-6 mx-auto text-red-400 mb-1" />
                <p className="text-xl font-bold text-white">{attendance_summary?.absent || 0}</p>
                <p className="text-slate-400 text-xs">غائب</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-amber-500/10">
                <Clock className="w-6 h-6 mx-auto text-amber-400 mb-1" />
                <p className="text-xl font-bold text-white">{attendance_summary?.excused || 0}</p>
                <p className="text-slate-400 text-xs">معذور</p>
              </div>
            </div>
            
            {/* Attendance Table */}
            <div className="max-h-48 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-900">
                  <tr className="border-b border-white/10">
                    <th className="text-right py-2 text-slate-400">التاريخ</th>
                    <th className="text-right py-2 text-slate-400">الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {attendance_records?.slice(0, 20).map((a, i) => (
                    <tr key={i} className="border-b border-white/5">
                      <td className="py-2 text-white">{a.date}</td>
                      <td className="py-2">
                        <span className={`px-2 py-1 rounded text-xs ${
                          a.status === 'present' ? 'bg-emerald-500/20 text-emerald-400' :
                          a.status === 'absent' ? 'bg-red-500/20 text-red-400' :
                          'bg-amber-500/20 text-amber-400'
                        }`}>
                          {a.status === 'present' ? 'حاضر' : a.status === 'absent' ? 'غائب' : 'معذور'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Recitation Summary */}
        <Card className="glass-card border-white/10">
          <CardHeader>
            <CardTitle className="text-lg font-bold text-white">سجل التسميع</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="text-center p-3 rounded-lg bg-emerald-500/10">
                <FileText className="w-6 h-6 mx-auto text-emerald-400 mb-1" />
                <p className="text-xl font-bold text-white">{recitation_summary?.total_new_pages || 0}</p>
                <p className="text-slate-400 text-xs">حفظ جديد</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-blue-500/10">
                <RotateCcw className="w-6 h-6 mx-auto text-blue-400 mb-1" />
                <p className="text-xl font-bold text-white">{recitation_summary?.total_review_pages || 0}</p>
                <p className="text-slate-400 text-xs">مراجعة صفحات</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-purple-500/10">
                <BookOpen className="w-6 h-6 mx-auto text-purple-400 mb-1" />
                <p className="text-xl font-bold text-white">{recitation_summary?.total_review_juz || 0}</p>
                <p className="text-slate-400 text-xs">أجزاء مراجعة</p>
              </div>
            </div>
            
            {/* Recitation Table */}
            <div className="max-h-48 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-900">
                  <tr className="border-b border-white/10">
                    <th className="text-right py-2 text-slate-400">التاريخ</th>
                    <th className="text-right py-2 text-slate-400">النوع</th>
                    <th className="text-right py-2 text-slate-400">النقاط</th>
                  </tr>
                </thead>
                <tbody>
                  {recitation_records?.slice(0, 20).map((r, i) => (
                    <tr key={i} className="border-b border-white/5">
                      <td className="py-2 text-white text-xs">
                        {r.created_at ? format(new Date(r.created_at), 'MM/dd', { locale: ar }) : '-'}
                      </td>
                      <td className="py-2">
                        <span className={`px-2 py-1 rounded text-xs ${
                          r.recitation_type === 'new_memorization' 
                            ? 'bg-emerald-500/20 text-emerald-400' 
                            : 'bg-blue-500/20 text-blue-400'
                        }`}>
                          {r.recitation_type === 'new_memorization' ? 
                            `حفظ ${r.pages_count}ص` : 
                            r.review_type === 'pages' ? `مراجعة ${r.review_pages}ص` : `مراجعة ${r.review_juz?.length}ج`
                          }
                        </span>
                      </td>
                      <td className="py-2 text-amber-400 font-bold">+{r.points_earned}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tracking Sheets */}
      <Card className="glass-card border-white/10">
        <CardHeader>
          <CardTitle className="text-lg font-bold text-white">ورق المتابعة</CardTitle>
        </CardHeader>
        <CardContent>
          {tracking_sheets?.length === 0 ? (
            <p className="text-slate-400 text-center py-4">لا توجد ورق متابعة</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-right py-2 text-slate-400">الأسبوع</th>
                    <th className="text-right py-2 text-slate-400">الصلوات</th>
                    <th className="text-right py-2 text-slate-400">وقت القرآن</th>
                    <th className="text-right py-2 text-slate-400">تسميع الأهل</th>
                  </tr>
                </thead>
                <tbody>
                  {tracking_sheets?.map((t, i) => (
                    <tr key={i} className="border-b border-white/5">
                      <td className="py-2 text-white">{t.week_start}</td>
                      <td className="py-2 text-emerald-400">{t.data?.prayers_count || 0}</td>
                      <td className="py-2 text-blue-400">{t.data?.quran_sitting_minutes || 0} د</td>
                      <td className="py-2 text-purple-400">{t.data?.family_recitation_count || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default StudentProfile;
