import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { Checkbox } from '../components/ui/checkbox';
import {
  Users, Plus, Trash2, Edit, Search, UserPlus, UserMinus,
  Loader2, UsersRound, User
} from 'lucide-react';
import { toast } from 'sonner';

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
    sheikh_id: ''
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
    if (!formData.sheikh_id) {
      toast.error('يرجى اختيار مشرف للمجموعة');
      return;
    }
    setSubmitting(true);
    try {
      await axios.post(`${API}/groups`, formData);
      toast.success('تم إنشاء المجموعة بنجاح');
      setCreateDialogOpen(false);
      setFormData({ name: '', description: '', sheikh_id: '' });
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
      sheikh_id: group.sheikh_id
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
      toast.success('تم إضافة الطالب للمجموعة');
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
      toast.success('تم إزالة الطالب من المجموعة');
      // Refresh students
      const res = await axios.get(`${API}/groups/${selectedGroup.id}/students`);
      setGroupStudents(res.data);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في إزالة الطالب');
    }
  };

  const getSheikhName = (sheikhId) => {
    const sheikh = sheikhs.find(s => s.id === sheikhId);
    return sheikh?.name || 'غير معين';
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

              <div className="space-y-2">
                <Label className="text-slate-300">مشرف المجموعة</Label>
                <Select 
                  value={formData.sheikh_id} 
                  onValueChange={(v) => setFormData({ ...formData, sheikh_id: v })}
                >
                  <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                    <SelectValue placeholder="اختر المشرف" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    {sheikhs.map((sheikh) => (
                      <SelectItem key={sheikh.id} value={sheikh.id} className="text-white">
                        {sheikh.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

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
                  <span className="text-slate-400">المشرف:</span>
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

            <div className="space-y-2">
              <Label className="text-slate-300">مشرف المجموعة</Label>
              <Select 
                value={formData.sheikh_id} 
                onValueChange={(v) => setFormData({ ...formData, sheikh_id: v })}
              >
                <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                  <SelectValue placeholder="اختر المشرف" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  {sheikhs.map((sheikh) => (
                    <SelectItem key={sheikh.id} value={sheikh.id} className="text-white">
                      {sheikh.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

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
            <p className="text-amber-400 text-sm mt-2">سيتم إزالة جميع الطلاب من هذه المجموعة.</p>
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
        <DialogContent className="bg-slate-900 border-slate-700 max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-white text-xl flex items-center gap-2">
              <Users className="w-5 h-5 text-emerald-400" />
              إدارة طلاب مجموعة: {selectedGroup?.name}
            </DialogTitle>
          </DialogHeader>
          
          <div className="grid grid-cols-2 gap-4 mt-4 flex-1 overflow-hidden">
            {/* Current Students */}
            <div className="flex flex-col">
              <h3 className="text-white font-medium mb-3 flex items-center gap-2">
                <Badge className="bg-emerald-500/20 text-emerald-400">{groupStudents.length}</Badge>
                طلاب المجموعة
              </h3>
              <div className="space-y-2 overflow-y-auto flex-1 max-h-[300px] pr-2">
                {groupStudents.length === 0 ? (
                  <p className="text-slate-400 text-sm text-center py-4">لا يوجد طلاب</p>
                ) : (
                  groupStudents.map((student) => (
                    <div
                      key={student.id}
                      className="p-3 rounded-lg bg-slate-800/50 border border-white/5 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center">
                          <span className="text-xs font-bold text-emerald-400">{student.name?.charAt(0)}</span>
                        </div>
                        <span className="text-white text-sm">{student.name}</span>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                        onClick={() => handleRemoveStudentFromGroup(student.id)}
                      >
                        <UserMinus className="w-4 h-4" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Available Students */}
            <div className="flex flex-col">
              <h3 className="text-white font-medium mb-3 flex items-center gap-2">
                <Badge className="bg-blue-500/20 text-blue-400">{availableStudents.length}</Badge>
                الطلاب المتاحون
              </h3>
              <div className="space-y-2 overflow-y-auto flex-1 max-h-[300px] pr-2">
                {availableStudents.length === 0 ? (
                  <p className="text-slate-400 text-sm text-center py-4">لا يوجد طلاب متاحون</p>
                ) : (
                  availableStudents.map((student) => (
                    <div
                      key={student.id}
                      className="p-3 rounded-lg bg-slate-800/50 border border-white/5 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center">
                          <span className="text-xs font-bold text-blue-400">{student.name?.charAt(0)}</span>
                        </div>
                        <div>
                          <span className="text-white text-sm">{student.name}</span>
                          {student.group_id && (
                            <p className="text-slate-400 text-xs">في مجموعة أخرى</p>
                          )}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
                        onClick={() => handleAddStudentToGroup(student.id)}
                      >
                        <UserPlus className="w-4 h-4" />
                      </Button>
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
    </div>
  );
};

export default GroupManagement;
