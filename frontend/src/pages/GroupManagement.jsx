import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '../components/ui/dialog';
import { Textarea } from '../components/ui/textarea';
import { Checkbox } from '../components/ui/checkbox';
import {
  Users, Plus, Trash2, Edit, Search, UserPlus, UserMinus,
  Loader2, UsersRound, User, Eye
} from 'lucide-react';
import { toast } from 'sonner';
import BulkOperations from './BulkOperations';
import StudentLink from '../components/StudentLink';
import { avatarSrc, onAvatarError } from '../lib/avatar';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const GroupManagement = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [groups, setGroups] = useState([]);
  const [sheikhs, setSheikhs] = useState([]);
  const [allStudents, setAllStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [manageStudentsDialogOpen, setManageStudentsDialogOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [groupStudents, setGroupStudents] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    sheikh_ids: []
  });

  useEffect(() => {
    if (user?.role !== 'admin') {
      navigate('/dashboard');
      return;
    }
    fetchData();
  }, [user]);

  const fetchData = async () => {
    try {
      const [groupsRes, sheikhsRes, studentsRes] = await Promise.all([
        axios.get(`${API}/groups`),
        axios.get(`${API}/sheikhs`),
        axios.get(`${API}/users?role=student`)
      ]);
      setGroups(groupsRes.data);
      setSheikhs(sheikhsRes.data);
      setAllStudents(studentsRes.data);
    } catch (error) {
      console.error('Error:', error);
      toast.error('فشل في تحميل البيانات');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateGroup = async (e) => {
    e.preventDefault();
    if (formData.sheikh_ids.length === 0) {
      toast.error('يرجى اختيار مشرف واحد على الأقل للمجموعة');
      return;
    }
    setSubmitting(true);
    try {
      await axios.post(`${API}/groups`, formData);
      toast.success('تم إنشاء المجموعة بنجاح');
      setCreateDialogOpen(false);
      setFormData({ name: '', description: '', sheikh_ids: [] });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في إنشاء المجموعة');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateGroup = async (e) => {
    e.preventDefault();
    if (!selectedGroup) return;
    if (formData.sheikh_ids.length === 0) {
      toast.error('يرجى اختيار مشرف واحد على الأقل للمجموعة');
      return;
    }
    setSubmitting(true);
    try {
      await axios.put(`${API}/groups/${selectedGroup.id}`, formData);
      toast.success('تم تحديث المجموعة بنجاح');
      setEditDialogOpen(false);
      setSelectedGroup(null);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في تحديث المجموعة');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteGroup = async () => {
    if (!selectedGroup) return;
    setSubmitting(true);
    try {
      await axios.delete(`${API}/groups/${selectedGroup.id}`);
      toast.success('تم حذف المجموعة بنجاح');
      setDeleteDialogOpen(false);
      setSelectedGroup(null);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في حذف المجموعة');
    } finally {
      setSubmitting(false);
    }
  };

  const openEditDialog = (group) => {
    setSelectedGroup(group);
    setFormData({
      name: group.name,
      description: group.description || '',
      sheikh_ids: group.sheikh_ids?.length ? group.sheikh_ids : (group.sheikh_id ? [group.sheikh_id] : [])
    });
    setEditDialogOpen(true);
  };

  const openManageStudents = async (group) => {
    setSelectedGroup(group);
    try {
      const res = await axios.get(`${API}/groups/${group.id}/students`);
      setGroupStudents(res.data);
    } catch (error) {
      console.error('Error:', error);
    }
    setManageStudentsDialogOpen(true);
  };

  const handleAddStudentToGroup = async (studentId) => {
    if (!selectedGroup) return;
    try {
      await axios.post(`${API}/groups/${selectedGroup.id}/add-student`, { student_id: studentId });
      toast.success('تمت إضافة الطالب للمجموعة');
      // Refresh students
      const res = await axios.get(`${API}/groups/${selectedGroup.id}/students`);
      setGroupStudents(res.data);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في إضافة الطالب');
    }
  };

  const handleRemoveStudentFromGroup = async (studentId) => {
    if (!selectedGroup) return;
    try {
      await axios.post(`${API}/groups/${selectedGroup.id}/remove-student`, { student_id: studentId });
      toast.success('تمت إزالة الطالب من المجموعة');
      // Refresh students
      const res = await axios.get(`${API}/groups/${selectedGroup.id}/students`);
      setGroupStudents(res.data);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في إزالة الطالب');
    }
  };

  // بعد أي عملية جماعية (نقل/تفعيل) — نحدّث المجموعات وقوائم الطلاب فوق
  const handleBulkChanged = async () => {
    await fetchData();
    if (selectedGroup) {
      try {
        const res = await axios.get(`${API}/groups/${selectedGroup.id}/students`);
        setGroupStudents(res.data);
      } catch (error) {
        console.error('Error refreshing group students:', error);
      }
    }
  };

  const getSheikhName = (sheikhId) => {
    const sheikh = sheikhs.find(s => s.id === sheikhId);
    return sheikh?.name || 'غير معين';
  };

  // تعدد المشرفين: أول مشرف مختار هو المشرف الرئيسي للمجموعة
  const toggleSheikh = (sheikhId) => {
    setFormData((prev) => ({
      ...prev,
      sheikh_ids: prev.sheikh_ids.includes(sheikhId)
        ? prev.sheikh_ids.filter((id) => id !== sheikhId)
        : [...prev.sheikh_ids, sheikhId]
    }));
  };

  const renderSheikhPicker = () => (
    <div className="space-y-2">
      <Label className="text-slate-300">مشرفو المجموعة</Label>
      <p className="text-slate-500 text-xs">يمكن اختيار أكثر من مشرف؛ أول مشرف تختاره هو المشرف الرئيسي.</p>
      <div className="max-h-48 overflow-y-auto rounded-md border border-slate-700 bg-slate-800 divide-y divide-slate-700/60">
        {sheikhs.length === 0 ? (
          <p className="text-slate-400 text-sm text-center py-3">لا يوجد مشرفون</p>
        ) : sheikhs.map((sheikh) => {
          const order = formData.sheikh_ids.indexOf(sheikh.id);
          return (
            <label
              key={sheikh.id}
              className="flex items-center justify-between gap-2 px-3 py-2 cursor-pointer hover:bg-slate-700/40"
              data-testid={`group-sheikh-option-${sheikh.id}`}
            >
              <span className="flex items-center gap-2 text-white text-sm">
                <Checkbox checked={order !== -1} onCheckedChange={() => toggleSheikh(sheikh.id)} />
                {sheikh.name}
              </span>
              {order === 0 && (
                <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">رئيسي</Badge>
              )}
            </label>
          );
        })}
      </div>
    </div>
  );

  // اسم المجموعة الحالية للطالب (يُعرض في قائمة الطلاب المتاحين)
  const getGroupName = (groupId) => {
    const group = groups.find(g => g.id === groupId);
    return group?.name || 'مجموعة غير معروفة';
  };

  // Students not in selected group
  const availableStudents = allStudents.filter(s => 
    !groupStudents.find(gs => gs.id === s.id)
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
    <div className="space-y-6 animate-fadeIn" data-testid="group-management-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">إدارة المجموعات</h1>
          <p className="text-slate-400">إنشاء وتعديل وحذف المجموعات وتعيين المشرفين والطلاب</p>
        </div>

        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-emerald-500 hover:bg-emerald-600" data-testid="create-group-btn">
              <Plus className="w-5 h-5 ml-2" />
              إنشاء مجموعة
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-slate-900 border-slate-700 max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-white text-xl">إنشاء مجموعة جديدة</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateGroup} className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label className="text-slate-300">اسم المجموعة</Label>
                <Input
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="bg-slate-800 border-slate-700 text-white"
                  placeholder="مثال: حلقة الفجر"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-slate-300">الوصف (اختياري)</Label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="bg-slate-800 border-slate-700 text-white"
                  placeholder="وصف المجموعة..."
                />
              </div>

              {renderSheikhPicker()}

              <Button
                type="submit"
                className="w-full bg-emerald-500 hover:bg-emerald-600"
                disabled={submitting}
              >
                {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'إنشاء المجموعة'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Groups List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {groups.length === 0 ? (
          <div className="col-span-full text-center py-12 text-slate-400">
            <UsersRound className="w-16 h-16 mx-auto mb-4 opacity-50" />
            <p>لا توجد مجموعات بعد</p>
          </div>
        ) : (
          groups.map((group) => (
            <Card key={group.id} className="glass-card border-white/10 hover:border-emerald-500/30 transition-all">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg text-white flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <UsersRound className="w-5 h-5 text-emerald-400" />
                    {group.name}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-blue-400 hover:text-blue-300 hover:bg-blue-500/10"
                      onClick={() => openEditDialog(group)}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                      onClick={() => {
                        setSelectedGroup(group);
                        setDeleteDialogOpen(true);
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-slate-400 text-sm">{group.description || 'لا يوجد وصف'}</p>
                
                <div className="flex items-center gap-2 text-sm">
                  <User className="w-4 h-4 text-slate-400" />
                  <span className="text-slate-400">{group.sheikh_ids?.length > 1 ? 'المشرفون:' : 'المشرف:'}</span>
                  <span className="text-emerald-400">{group.sheikh_name || getSheikhName(group.sheikh_id)}</span>
                </div>

                <div className="flex items-center justify-between">
                  <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">
                    {group.student_count || 0} طالب
                  </Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                    onClick={() => openManageStudents(group)}
                  >
                    <Users className="w-4 h-4 ml-2" />
                    إدارة الطلاب
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Edit Group Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="bg-slate-900 border-slate-700 max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-white text-xl">تعديل المجموعة</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleUpdateGroup} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label className="text-slate-300">اسم المجموعة</Label>
              <Input
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="bg-slate-800 border-slate-700 text-white"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-slate-300">الوصف</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="bg-slate-800 border-slate-700 text-white"
              />
            </div>

            {renderSheikhPicker()}

            <DialogFooter>
              <Button variant="ghost" onClick={() => setEditDialogOpen(false)}>إلغاء</Button>
              <Button type="submit" className="bg-emerald-500 hover:bg-emerald-600" disabled={submitting}>
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'حفظ'}
              </Button>
            </DialogFooter>
          </form>
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
              هل أنت متأكد من حذف المجموعة <span className="text-red-400 font-bold">{selectedGroup?.name}</span>؟
            </p>
            <p className="text-amber-400 text-sm mt-2">سيتمت إزالة جميع الطلاب من هذه المجموعة.</p>
          </div>
          <DialogFooter className="mt-6">
            <Button variant="ghost" onClick={() => setDeleteDialogOpen(false)}>إلغاء</Button>
            <Button className="bg-red-500 hover:bg-red-600" onClick={handleDeleteGroup} disabled={submitting}>
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'حذف'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manage Students Dialog */}
      <Dialog open={manageStudentsDialogOpen} onOpenChange={setManageStudentsDialogOpen}>
        <DialogContent className="bg-slate-900 border-slate-700 max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-white text-xl flex items-center gap-2">
              <Users className="w-5 h-5 text-emerald-400" />
              إدارة طلاب مجموعة: {selectedGroup?.name}
            </DialogTitle>
          </DialogHeader>
          
          <div className="grid grid-cols-2 gap-4 mt-4 flex-1 min-h-0">
            {/* Current Students */}
            <div className="flex flex-col min-h-0">
              <h3 className="text-white font-medium mb-3 flex items-center gap-2">
                <Badge className="bg-emerald-500/20 text-emerald-400">{groupStudents.length}</Badge>
                طلاب المجموعة
              </h3>
              <div className="space-y-2 overflow-y-auto flex-1 min-h-0 max-h-[55vh] pr-2 pb-2">
                {groupStudents.length === 0 ? (
                  <p className="text-slate-400 text-sm text-center py-4">لا يوجد طلاب</p>
                ) : (
                  groupStudents.map((student) => (
                    <div
                      key={student.id}
                      className="p-3 rounded-lg bg-slate-800/50 border border-white/5 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <img src={avatarSrc(student.profile_image, 'student')} onError={onAvatarError('student')} alt="" className="w-8 h-8 rounded-full object-cover bg-slate-700 flex-shrink-0" />
                        <StudentLink studentId={student.id} name={student.name} className="text-white text-sm" />
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-slate-400 hover:text-emerald-400"
                          onClick={() => navigate(`/student/${student.id}`)}
                          title="فتح صفحة الطالب"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                          onClick={() => handleRemoveStudentFromGroup(student.id)}
                          title="إخراج من المجموعة"
                        >
                          <UserMinus className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Available Students */}
            <div className="flex flex-col min-h-0">
              <h3 className="text-white font-medium mb-3 flex items-center gap-2">
                <Badge className="bg-blue-500/20 text-blue-400">{availableStudents.length}</Badge>
                الطلاب المتاحون
              </h3>
              <div className="space-y-2 overflow-y-auto flex-1 min-h-0 max-h-[55vh] pr-2 pb-2">
                {availableStudents.length === 0 ? (
                  <p className="text-slate-400 text-sm text-center py-4">لا يوجد طلاب متاحون</p>
                ) : (
                  availableStudents.map((student) => (
                    <div
                      key={student.id}
                      className="p-3 rounded-lg bg-slate-800/50 border border-white/5 flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <img src={avatarSrc(student.profile_image, 'student')} onError={onAvatarError('student')} alt="" className="w-8 h-8 rounded-full object-cover bg-slate-700 flex-shrink-0" />
                        <div className="min-w-0">
                          <StudentLink
                            studentId={student.id}
                            name={student.name}
                            className="text-white text-sm"
                          />
                          {/* المجموعة الحالية للطالب (إن كان بمجموعة) */}
                          {student.group_id ? (
                            <p className="text-amber-400 text-xs truncate flex items-center gap-1">
                              <UsersRound className="w-3 h-3 flex-shrink-0" />
                              {getGroupName(student.group_id)}
                            </p>
                          ) : (
                            <p className="text-slate-500 text-xs">بدون مجموعة</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-slate-400 hover:text-emerald-400"
                          onClick={() => navigate(`/student/${student.id}`)}
                          title="فتح صفحة الطالب"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
                          onClick={() => handleAddStudentToGroup(student.id)}
                          title={student.group_id ? 'نقل الطالب لهذه المجموعة' : 'إضافة الطالب للمجموعة'}
                        >
                          <UserPlus className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="mt-4">
            <Button variant="ghost" onClick={() => setManageStudentsDialogOpen(false)}>إغلاق</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* #4 — العمليات الجماعية بنفس صفحة إدارة المجموعات (مربوطة: أي نقل بيحدّث القوائم فوق) */}
      <div className="mt-8 pt-6 border-t border-white/10">
        <BulkOperations onChanged={handleBulkChanged} />
      </div>
    </div>
  );
};

export default GroupManagement;
