import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '../components/ui/dialog';
import { Textarea } from '../components/ui/textarea';
import {
  Users, Plus, Trash2, Edit, Search, AlertTriangle,
  UserPlus, Eye, RefreshCcw, Loader2, Key, Award
} from 'lucide-react';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const StudentManagement = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [students, setStudents] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [warningDialogOpen, setWarningDialogOpen] = useState(false);
  const [changeGroupDialogOpen, setChangeGroupDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [newPassword, setNewPassword] = useState('');

  const [newStudentData, setNewStudentData] = useState({
    email: '',
    password: '',
    name: '',
    mosque_name: '',
    school_name: '',
    school_grade: '',
    birth_date: ''
  });

  const [warningData, setWarningData] = useState({
    type: 'absence',
    message: ''
  });

  const [newGroupId, setNewGroupId] = useState('');

  useEffect(() => {
    if (user?.role !== 'admin') {
      navigate('/dashboard');
      return;
    }
    fetchData();
  }, [user]);

  const fetchData = async () => {
    try {
      const [studentsRes, groupsRes] = await Promise.all([
        axios.get(`${API}/users?role=student`),
        axios.get(`${API}/groups`)
      ]);
      setStudents(studentsRes.data);
      setGroups(groupsRes.data);
    } catch (error) {
      console.error('Error:', error);
      toast.error('فشل في تحميل البيانات');
    } finally {
      setLoading(false);
    }
  };

  const handleAddStudent = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await axios.post(`${API}/admin/students`, {
        ...newStudentData,
        role: 'student'
      });
      toast.success('تم إضافة الطالب بنجاح');
      setAddDialogOpen(false);
      setNewStudentData({
        email: '',
        password: '',
        name: '',
        mosque_name: '',
        school_name: '',
        school_grade: '',
        birth_date: ''
      });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في إضافة الطالب');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteStudent = async () => {
    if (!selectedStudent) return;
    setSubmitting(true);
    try {
      await axios.delete(`${API}/students/${selectedStudent.id}`);
      toast.success('تم حذف الطالب بنجاح');
      setDeleteDialogOpen(false);
      setSelectedStudent(null);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في حذف الطالب');
    } finally {
      setSubmitting(false);
    }
  };

  const handleChangeGroup = async () => {
    if (!selectedStudent) return;
    setSubmitting(true);
    try {
      await axios.post(`${API}/students/${selectedStudent.id}/change-group?group_id=${newGroupId === 'none' ? '' : newGroupId}`);
      toast.success('تم نقل الطالب بنجاح');
      setChangeGroupDialogOpen(false);
      setSelectedStudent(null);
      setNewGroupId('');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في نقل الطالب');
    } finally {
      setSubmitting(false);
    }
  };

  const handleIssueWarning = async () => {
    if (!selectedStudent) return;
    setSubmitting(true);
    try {
      await axios.post(`${API}/admin/warnings`, {
        student_id: selectedStudent.id,
        type: warningData.type,
        message: warningData.message
      });
      toast.success('تم إصدار الإنذار بنجاح');
      setWarningDialogOpen(false);
      setSelectedStudent(null);
      setWarningData({ type: 'absence', message: '' });
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في إصدار الإنذار');
    } finally {
      setSubmitting(false);
    }
  };

  const handleChangePassword = async () => {
    if (!selectedStudent || !newPassword) return;
    if (newPassword.length < 6) {
      toast.error('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
      return;
    }
    setSubmitting(true);
    try {
      await axios.post(`${API}/admin/reset-password`, {
        email: selectedStudent.email,
        new_password: newPassword
      });
      toast.success('تم تغيير كلمة المرور بنجاح');
      setPasswordDialogOpen(false);
      setSelectedStudent(null);
      setNewPassword('');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في تغيير كلمة المرور');
    } finally {
      setSubmitting(false);
    }
  };

  const getGroupName = (groupId) => {
    const group = groups.find(g => g.id === groupId);
    return group?.name || 'بدون مجموعة';
  };

  const filteredStudents = students.filter(student =>
    student.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    student.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (user?.role !== 'admin') {
    return null;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn" data-testid="student-management-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">إدارة الطلاب</h1>
          <p className="text-slate-400">إضافة وحذف ونقل الطلاب وإصدار الإنذارات</p>
        </div>

        <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-emerald-500 hover:bg-emerald-600" data-testid="add-student-btn">
              <UserPlus className="w-5 h-5 ml-2" />
              إضافة طالب
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-slate-900 border-slate-700 max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-white text-xl">إضافة طالب جديد</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAddStudent} className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-slate-300">الاسم</Label>
                  <Input
                    required
                    value={newStudentData.name}
                    onChange={(e) => setNewStudentData({ ...newStudentData, name: e.target.value })}
                    className="bg-slate-800 border-slate-700 text-white"
                    placeholder="اسم الطالب"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-slate-300">البريد الإلكتروني</Label>
                  <Input
                    type="email"
                    required
                    value={newStudentData.email}
                    onChange={(e) => setNewStudentData({ ...newStudentData, email: e.target.value })}
                    className="bg-slate-800 border-slate-700 text-white"
                    placeholder="email@example.com"
                    dir="ltr"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-slate-300">كلمة المرور</Label>
                <Input
                  type="password"
                  required
                  value={newStudentData.password}
                  onChange={(e) => setNewStudentData({ ...newStudentData, password: e.target.value })}
                  className="bg-slate-800 border-slate-700 text-white"
                  placeholder="********"
                  dir="ltr"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-slate-300">المسجد</Label>
                  <Input
                    value={newStudentData.mosque_name}
                    onChange={(e) => setNewStudentData({ ...newStudentData, mosque_name: e.target.value })}
                    className="bg-slate-800 border-slate-700 text-white"
                    placeholder="اسم المسجد"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-slate-300">تاريخ الميلاد</Label>
                  <Input
                    type="date"
                    value={newStudentData.birth_date}
                    onChange={(e) => setNewStudentData({ ...newStudentData, birth_date: e.target.value })}
                    className="bg-slate-800 border-slate-700 text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-slate-300">المدرسة</Label>
                  <Input
                    value={newStudentData.school_name}
                    onChange={(e) => setNewStudentData({ ...newStudentData, school_name: e.target.value })}
                    className="bg-slate-800 border-slate-700 text-white"
                    placeholder="اسم المدرسة"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-slate-300">الصف / المعدل</Label>
                  <Input
                    value={newStudentData.school_grade}
                    onChange={(e) => setNewStudentData({ ...newStudentData, school_grade: e.target.value })}
                    className="bg-slate-800 border-slate-700 text-white"
                    placeholder="مثال: الصف السادس - 95%"
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full bg-emerald-500 hover:bg-emerald-600"
                disabled={submitting}
              >
                {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'إضافة الطالب'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
        <Input
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="bg-slate-800/50 border-slate-700 text-white pr-10"
          placeholder="البحث عن طالب..."
          data-testid="search-student"
        />
      </div>

      {/* Students List */}
      <Card className="glass-card border-white/10">
        <CardHeader>
          <CardTitle className="text-xl text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-emerald-400" />
            الطلاب ({filteredStudents.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filteredStudents.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              لا يوجد طلاب
            </div>
          ) : (
            <div className="space-y-3">
              {filteredStudents.map((student) => (
                <div
                  key={student.id}
                  className="p-4 rounded-xl bg-slate-800/50 border border-white/5 hover:border-emerald-500/30 transition-all"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-slate-700 flex items-center justify-center">
                        <span className="text-lg font-bold text-emerald-400">
                          {student.name?.charAt(0)}
                        </span>
                      </div>
                      <div>
                        <h3 className="text-white font-medium">{student.name}</h3>
                        <p className="text-slate-400 text-sm">{student.email}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                        {getGroupName(student.group_id)}
                      </Badge>

                      <div className="flex items-center gap-1">
                        <Link to={`/student/${student.id}`}>
                          <Button size="sm" variant="ghost" className="text-blue-400 hover:text-blue-300 hover:bg-blue-500/10">
                            <Eye className="w-4 h-4" />
                          </Button>
                        </Link>

                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-amber-400 hover:text-amber-300 hover:bg-amber-500/10"
                          onClick={() => {
                            setSelectedStudent(student);
                            setNewGroupId(student.group_id || '');
                            setChangeGroupDialogOpen(true);
                          }}
                        >
                          <RefreshCcw className="w-4 h-4" />
                        </Button>

                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-orange-400 hover:text-orange-300 hover:bg-orange-500/10"
                          onClick={() => {
                            setSelectedStudent(student);
                            setWarningDialogOpen(true);
                          }}
                        >
                          <AlertTriangle className="w-4 h-4" />
                        </Button>

                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-purple-400 hover:text-purple-300 hover:bg-purple-500/10"
                          onClick={() => {
                            setSelectedStudent(student);
                            setNewPassword('');
                            setPasswordDialogOpen(true);
                          }}
                          title="تغيير كلمة المرور"
                        >
                          <Key className="w-4 h-4" />
                        </Button>

                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                          onClick={() => {
                            setSelectedStudent(student);
                            setDeleteDialogOpen(true);
                          }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Change Group Dialog */}
      <Dialog open={changeGroupDialogOpen} onOpenChange={setChangeGroupDialogOpen}>
        <DialogContent className="bg-slate-900 border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-white">تغيير مجموعة الطالب</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <p className="text-slate-300">نقل الطالب <span className="text-emerald-400 font-bold">{selectedStudent?.name}</span> إلى:</p>
            <Select value={newGroupId} onValueChange={setNewGroupId}>
              <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                <SelectValue placeholder="اختر المجموعة" />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                <SelectItem value="none" className="text-white">بدون مجموعة</SelectItem>
                {groups.map((group) => (
                  <SelectItem key={group.id} value={group.id} className="text-white">
                    {group.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter className="mt-6">
            <Button variant="ghost" onClick={() => setChangeGroupDialogOpen(false)}>إلغاء</Button>
            <Button className="bg-emerald-500 hover:bg-emerald-600" onClick={handleChangeGroup} disabled={submitting}>
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'نقل'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Warning Dialog */}
      <Dialog open={warningDialogOpen} onOpenChange={setWarningDialogOpen}>
        <DialogContent className="bg-slate-900 border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-orange-400" />
              إصدار إنذار
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <p className="text-slate-300">إصدار إنذار للطالب <span className="text-emerald-400 font-bold">{selectedStudent?.name}</span></p>
            
            <div className="space-y-2">
              <Label className="text-slate-300">نوع الإنذار</Label>
              <Select value={warningData.type} onValueChange={(v) => setWarningData({ ...warningData, type: v })}>
                <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="absence" className="text-white">غياب متكرر</SelectItem>
                  <SelectItem value="no_recitation" className="text-white">عدم التسميع</SelectItem>
                  <SelectItem value="behavior" className="text-white">سلوك سلبي</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-slate-300">رسالة الإنذار</Label>
              <Textarea
                value={warningData.message}
                onChange={(e) => setWarningData({ ...warningData, message: e.target.value })}
                className="bg-slate-800 border-slate-700 text-white min-h-[100px]"
                placeholder="اكتب رسالة الإنذار..."
              />
            </div>
          </div>
          <DialogFooter className="mt-6">
            <Button variant="ghost" onClick={() => setWarningDialogOpen(false)}>إلغاء</Button>
            <Button 
              className="bg-orange-500 hover:bg-orange-600" 
              onClick={handleIssueWarning} 
              disabled={submitting || !warningData.message}
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'إصدار الإنذار'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="bg-slate-900 border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-white">تأكيد الحذف</DialogTitle>
          </DialogHeader>
          <div className="mt-4">
            <p className="text-slate-300">
              هل أنت متأكد من حذف الطالب <span className="text-red-400 font-bold">{selectedStudent?.name}</span>؟
            </p>
            <p className="text-red-400 text-sm mt-2">سيتم حذف جميع بيانات الطالب بشكل نهائي.</p>
          </div>
          <DialogFooter className="mt-6">
            <Button variant="ghost" onClick={() => setDeleteDialogOpen(false)}>إلغاء</Button>
            <Button className="bg-red-500 hover:bg-red-600" onClick={handleDeleteStudent} disabled={submitting}>
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'حذف'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change Password Dialog */}
      <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
        <DialogContent className="bg-slate-900 border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Key className="w-5 h-5 text-purple-400" />
              تغيير كلمة المرور
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <p className="text-slate-300">
              تغيير كلمة مرور الطالب <span className="text-purple-400 font-bold">{selectedStudent?.name}</span>
            </p>
            <p className="text-slate-500 text-sm">{selectedStudent?.email}</p>
            
            <div className="space-y-2">
              <Label className="text-slate-300">كلمة المرور الجديدة</Label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="bg-slate-800 border-slate-700 text-white"
                placeholder="أدخل كلمة المرور الجديدة (6 أحرف على الأقل)"
                dir="ltr"
              />
            </div>
          </div>
          <DialogFooter className="mt-6">
            <Button variant="ghost" onClick={() => setPasswordDialogOpen(false)}>إلغاء</Button>
            <Button 
              className="bg-purple-500 hover:bg-purple-600" 
              onClick={handleChangePassword} 
              disabled={submitting || newPassword.length < 6}
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'تغيير كلمة المرور'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default StudentManagement;
