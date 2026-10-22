import { useState, useEffect } from 'react';
import axios from 'axios';
import { useTheme } from '../context/ThemeContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../components/ui/dialog';
import {
  BookUser, Users, Search, Eye, Trash2, Phone, Mail,
  Calendar, Award, GraduationCap, AlertTriangle, X,
  Briefcase, MapPin, Star, UserCheck, FileText, Key, Edit, Loader2, UserPlus
} from 'lucide-react';
import { toast } from 'sonner';
import { EMAIL_PLACEHOLDER, PHONE_PLACEHOLDER, normalizePhone, phoneError } from '../lib/constants';
import { formatDate as fmtDate } from '../lib/utils';
import { defaultAvatar, onAvatarError } from '../lib/avatar';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const SheikhManagement = () => {
  const { isDark } = useTheme();
  const [sheikhs, setSheikhs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSheikh, setSelectedSheikh] = useState(null);
  const [sheikhDetails, setSheikhDetails] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [passwordTarget, setPasswordTarget] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);
  // تعديل بيانات المشرف
  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [savingEdit, setSavingEdit] = useState(false);

  // إضافة مشرف جديد
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({});
  const [addingSheikh, setAddingSheikh] = useState(false);
  const [groups, setGroups] = useState([]);

  const openAddSheikh = () => {
    setAddForm({
      name: '', email: '', password: '', student_phone: '', mosque_name: '',
      birth_date: '', specialization: '', experience_years: '', group_id: '',
    });
    setAddOpen(true);
  };

  const submitAddSheikh = async () => {
    if (!addForm.name?.trim() || !addForm.email?.trim() || !addForm.password) {
      toast.error('الاسم والبريد الإلكتروني وكلمة المرور مطلوبة');
      return;
    }
    if (addForm.password.length < 6) {
      toast.error('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
      return;
    }
    const badPhone = phoneError([['رقم الهاتف', addForm.student_phone]]);
    if (badPhone) { toast.error(badPhone); return; }
    setAddingSheikh(true);
    try {
      const payload = {
        ...addForm,
        experience_years: addForm.experience_years ? Number(addForm.experience_years) : null,
        group_id: addForm.group_id || null,
      };
      await axios.post(`${API}/admin/sheikhs`, payload);
      toast.success('تمت إضافة المشرف بنجاح');
      setAddOpen(false);
      fetchSheikhs();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في إضافة المشرف');
    } finally {
      setAddingSheikh(false);
    }
  };

  const openEditSheikh = (sheikh) => {
    setEditTarget(sheikh);
    setEditForm({
      name: sheikh.name || '', student_phone: sheikh.student_phone || '', mosque_name: sheikh.mosque_name || '',
      birth_date: sheikh.birth_date || '', join_date: sheikh.join_date || '',
      specialization: sheikh.specialization || '', experience_years: sheikh.experience_years || '',
    });
    setEditOpen(true);
  };

  const saveEditSheikh = async () => {
    const badPhone = phoneError([['رقم الهاتف', editForm.student_phone]]);
    if (badPhone) { toast.error(badPhone); return; }
    setSavingEdit(true);
    try {
      await axios.put(`${API}/admin/sheikhs/${editTarget.id}`, editForm);
      toast.success('تم تحديث بيانات المشرف');
      setEditOpen(false);
      fetchSheikhs();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في تحديث البيانات');
    } finally {
      setSavingEdit(false);
    }
  };

  useEffect(() => {
    fetchSheikhs();
    fetchGroups();
  }, []);

  const fetchSheikhs = async () => {
    try {
      const res = await axios.get(`${API}/admin/sheikhs`);
      setSheikhs(res.data);
    } catch (error) {
      toast.error('فشل في تحميل بيانات المشرفين');
    } finally {
      setLoading(false);
    }
  };

  const fetchGroups = async () => {
    try {
      const res = await axios.get(`${API}/groups`);
      setGroups(res.data || []);
    } catch (error) {
      // اختياري — الإسناد للمجموعة ممكن يتم لاحقًا من إدارة المجموعات
      setGroups([]);
    }
  };

  const fetchSheikhDetails = async (sheikhId) => {
    setDetailsLoading(true);
    try {
      const res = await axios.get(`${API}/admin/sheikh/${sheikhId}`);
      setSheikhDetails(res.data);
      setShowDetailsModal(true);
    } catch (error) {
      toast.error('فشل في تحميل تفاصيل المشرف');
    } finally {
      setDetailsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    
    try {
      await axios.delete(`${API}/admin/sheikh/${deleteTarget.id}`);
      toast.success(`تم حذف المشرف ${deleteTarget.name} بنجاح`);
      setSheikhs(prev => prev.filter(s => s.id !== deleteTarget.id));
      setShowDeleteModal(false);
      setDeleteTarget(null);
    } catch (error) {
      toast.error('فشل في حذف المشرف');
    }
  };

  const handleChangePassword = async () => {
    if (!passwordTarget || !newPassword) return;
    if (newPassword.length < 6) {
      toast.error('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
      return;
    }
    setPasswordSubmitting(true);
    try {
      await axios.post(`${API}/admin/reset-password`, {
        email: passwordTarget.email,
        new_password: newPassword
      });
      toast.success('تم تغيير كلمة المرور بنجاح');
      setShowPasswordModal(false);
      setPasswordTarget(null);
      setNewPassword('');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في تغيير كلمة المرور');
    } finally {
      setPasswordSubmitting(false);
    }
  };

  const filteredSheikhs = sheikhs.filter(s => 
    s.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatDate = (dateStr) => fmtDate(dateStr);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6 animate-fadeIn">
      {/* Header */}
      <div className={`p-4 md:p-6 rounded-xl ${isDark ? 'glass-card border border-white/10' : 'bg-white border border-slate-200 shadow-sm'}`}>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className={`text-lg md:text-2xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
              إدارة المشرفين
            </h1>
            <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
              عرض وإدارة جميع المشرفين في المركز ({sheikhs.length} مشرف)
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <Input
                type="text"
                placeholder="بحث بالاسم أو البريد..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`pr-10 h-10 w-full md:w-64 ${isDark ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-slate-200'}`}
              />
            </div>
            <Button onClick={openAddSheikh} className="bg-blue-600 hover:bg-blue-700 h-10 whitespace-nowrap">
              <UserPlus className="w-4 h-4 ml-1" />
              إضافة مشرف
            </Button>
          </div>
        </div>
      </div>

      {/* Sheikhs Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredSheikhs.map((sheikh) => (
          <Card key={sheikh.id} className={`${isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'} hover:border-blue-500/50 transition-colors`}>
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                {/* Profile Image */}
                <img src={sheikh.profile_image || defaultAvatar('sheikh')} onError={onAvatarError('sheikh')} alt={sheikh.name} className="w-14 h-14 rounded-xl object-cover border-2 border-blue-500/30 flex-shrink-0" />
                
                <div className="flex-1 min-w-0">
                  <h3 className={`font-bold truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>{sheikh.name}</h3>
                  <p className={`text-xs truncate ${isDark ? 'text-slate-400' : 'text-slate-500'}`} dir="ltr">{sheikh.email}</p>
                  
                  <div className="flex flex-wrap gap-1 mt-2">
                    <Badge className="bg-blue-500/20 text-blue-400 text-[10px]">
                      <Users className="w-2.5 h-2.5 ml-1" />
                      {sheikh.groups_count || 0} مجموعة
                    </Badge>
                    <Badge className="bg-emerald-500/20 text-emerald-400 text-[10px]">
                      <GraduationCap className="w-2.5 h-2.5 ml-1" />
                      {sheikh.students_count || 0} طالب
                    </Badge>
                  </div>
                </div>
              </div>
              
              {/* Actions */}
              <div className="flex gap-2 mt-4 pt-3 border-t border-slate-700/50">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => fetchSheikhDetails(sheikh.id)}
                  className={`flex-1 text-xs ${isDark ? 'border-slate-700 hover:bg-slate-800' : ''}`}
                  disabled={detailsLoading}
                >
                  <Eye className="w-3 h-3 ml-1" />
                  عرض التفاصيل
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => openEditSheikh(sheikh)}
                  className={`text-xs ${isDark ? 'border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/10' : 'border-emerald-500 text-emerald-600'}`}
                  title="تعديل البيانات"
                >
                  <Edit className="w-3 h-3" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => { setPasswordTarget(sheikh); setNewPassword(''); setShowPasswordModal(true); }}
                  className={`text-xs ${isDark ? 'border-purple-500/50 text-purple-400 hover:bg-purple-500/10' : 'border-purple-500 text-purple-600'}`}
                  title="تغيير كلمة المرور"
                >
                  <Key className="w-3 h-3" />
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => { setDeleteTarget(sheikh); setShowDeleteModal(true); }}
                  className="text-xs"
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredSheikhs.length === 0 && (
        <div className={`text-center py-12 rounded-xl ${isDark ? 'bg-slate-800/50' : 'bg-slate-100'}`}>
          <BookUser className="w-12 h-12 mx-auto text-slate-500 mb-3" />
          <p className={isDark ? 'text-slate-400' : 'text-slate-600'}>لا يوجد مشرفون</p>
        </div>
      )}

      {/* Details Modal */}
      <Dialog open={showDetailsModal} onOpenChange={setShowDetailsModal}>
        <DialogContent className={`max-w-3xl max-h-[90vh] overflow-y-auto ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white'}`}>
          <DialogHeader>
            <DialogTitle className={`flex items-center gap-2 ${isDark ? 'text-white' : ''}`}>
              <BookUser className="w-5 h-5 text-blue-400" />
              تفاصيل المشرف
            </DialogTitle>
          </DialogHeader>
          
          {sheikhDetails && (
            <div className="space-y-4">
              {/* Sheikh Info */}
              <div className={`p-4 rounded-xl ${isDark ? 'bg-slate-800/50' : 'bg-slate-100'}`}>
                <div className="flex items-start gap-4">
                  <img src={sheikhDetails.sheikh.profile_image || defaultAvatar('sheikh')} onError={onAvatarError('sheikh')} alt={sheikhDetails.sheikh.name} className="w-20 h-20 rounded-xl object-cover" />
                  <div className="flex-1">
                    <h3 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{sheikhDetails.sheikh.name}</h3>
                    <div className="grid grid-cols-2 gap-2 mt-2 text-sm">
                      <p className={isDark ? 'text-slate-400' : 'text-slate-600'}>
                        <Mail className="w-4 h-4 inline ml-1" />
                        {sheikhDetails.sheikh.email}
                      </p>
                      <p className={isDark ? 'text-slate-400' : 'text-slate-600'}>
                        <Phone className="w-4 h-4 inline ml-1" />
                        {sheikhDetails.sheikh.student_phone || '-'}
                      </p>
                      {sheikhDetails.sheikh.specialization && (
                        <p className={isDark ? 'text-slate-400' : 'text-slate-600'}>
                          <Briefcase className="w-4 h-4 inline ml-1" />
                          {sheikhDetails.sheikh.specialization}
                        </p>
                      )}
                      {sheikhDetails.sheikh.experience_years && (
                        <p className={isDark ? 'text-slate-400' : 'text-slate-600'}>
                          <Star className="w-4 h-4 inline ml-1" />
                          {sheikhDetails.sheikh.experience_years} سنة خبرة
                        </p>
                      )}
                      <p className={isDark ? 'text-slate-400' : 'text-slate-600'}>
                        <Calendar className="w-4 h-4 inline ml-1" />
                        انضم: {formatDate(sheikhDetails.sheikh.registration_date)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className={`p-3 rounded-xl text-center ${isDark ? 'bg-blue-500/10 border border-blue-500/20' : 'bg-blue-50'}`}>
                  <Users className="w-6 h-6 mx-auto text-blue-400 mb-1" />
                  <p className={`text-lg font-bold ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>{sheikhDetails.stats.total_groups}</p>
                  <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>مجموعة</p>
                </div>
                <div className={`p-3 rounded-xl text-center ${isDark ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-emerald-50'}`}>
                  <GraduationCap className="w-6 h-6 mx-auto text-emerald-400 mb-1" />
                  <p className={`text-lg font-bold ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>{sheikhDetails.stats.total_students}</p>
                  <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>طالب</p>
                </div>
                <div className={`p-3 rounded-xl text-center ${isDark ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-amber-50'}`}>
                  <Award className="w-6 h-6 mx-auto text-amber-400 mb-1" />
                  <p className={`text-lg font-bold ${isDark ? 'text-amber-400' : 'text-amber-600'}`}>{sheikhDetails.stats.total_points}</p>
                  <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>نقاط الطلاب</p>
                </div>
                <div className={`p-3 rounded-xl text-center ${isDark ? 'bg-purple-500/10 border border-purple-500/20' : 'bg-purple-50'}`}>
                  <FileText className="w-6 h-6 mx-auto text-purple-400 mb-1" />
                  <p className={`text-lg font-bold ${isDark ? 'text-purple-400' : 'text-purple-600'}`}>{sheikhDetails.stats.recitations_given}</p>
                  <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>تسميع</p>
                </div>
              </div>
              
              {/* Groups & Students */}
              <div>
                <h4 className={`font-bold mb-3 ${isDark ? 'text-white' : 'text-slate-900'}`}>المجموعات والطلاب</h4>
                {sheikhDetails.groups.length > 0 ? (
                  <div className="space-y-3">
                    {sheikhDetails.groups.map((group) => (
                      <div key={group.id} className={`p-3 rounded-xl ${isDark ? 'bg-slate-800/50 border border-slate-700' : 'bg-slate-50'}`}>
                        <div className="flex items-center justify-between mb-2">
                          <h5 className={`font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{group.name}</h5>
                          <Badge className="bg-emerald-500/20 text-emerald-400 text-xs">
                            {group.students_count} طالب
                          </Badge>
                        </div>
                        {group.students?.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {group.students.slice(0, 5).map((student) => (
                              <Badge key={student.id} className={`text-[10px] ${isDark ? 'bg-slate-700 text-slate-300' : 'bg-slate-200 text-slate-700'}`}>
                                {student.name}
                              </Badge>
                            ))}
                            {group.students.length > 5 && (
                              <Badge className="text-[10px] bg-blue-500/20 text-blue-400">
                                +{group.students.length - 5} آخرين
                              </Badge>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className={`text-center py-4 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>لا توجد مجموعات</p>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
        <DialogContent className={isDark ? 'bg-slate-900 border-slate-700' : 'bg-white'}>
          <DialogHeader>
            <DialogTitle className={`flex items-center gap-2 text-red-500`}>
              <AlertTriangle className="w-5 h-5" />
              تأكيد حذف المشرف
            </DialogTitle>
            <DialogDescription className={isDark ? 'text-slate-400' : 'text-slate-600'}>
              هل أنت متأكد من حذف المشرف <span className="font-bold text-red-400">{deleteTarget?.name}</span>؟
              <br />
              سيتم إلغاء ربط المجموعات بهذا المشرف.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowDeleteModal(false)}>
              إلغاء
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              <Trash2 className="w-4 h-4 ml-2" />
              حذف المشرف
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Sheikh Modal */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className={`max-w-lg ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white'}`}>
          <DialogHeader>
            <DialogTitle className={`flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
              <UserPlus className="w-5 h-5 text-blue-400" />إضافة مشرف جديد
            </DialogTitle>
            <DialogDescription className={isDark ? 'text-slate-400' : 'text-slate-600'}>
              يُنشأ الحساب مفعّلًا مباشرة، ويستطيع المشرف تسجيل الدخول فورًا.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 mt-2">
            <div className="col-span-2">
              <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>الاسم *</Label>
              <Input value={addForm.name} onChange={(e) => setAddForm({ ...addForm, name: e.target.value })} placeholder="اسم المشرف" className={isDark ? 'bg-slate-800 border-slate-700 text-white' : ''} />
            </div>
            <div>
              <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>البريد الإلكتروني *</Label>
              <Input value={addForm.email} onChange={(e) => setAddForm({ ...addForm, email: e.target.value })} dir="ltr" placeholder={EMAIL_PLACEHOLDER} className={isDark ? 'bg-slate-800 border-slate-700 text-white' : ''} />
            </div>
            <div>
              <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>كلمة المرور *</Label>
              <Input type="text" value={addForm.password} onChange={(e) => setAddForm({ ...addForm, password: e.target.value })} dir="ltr" placeholder="6 أحرف على الأقل" className={isDark ? 'bg-slate-800 border-slate-700 text-white' : ''} />
            </div>
            <div>
              <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>الهاتف</Label>
              <Input value={addForm.student_phone} onChange={(e) => setAddForm({ ...addForm, student_phone: normalizePhone(e.target.value) })} placeholder={PHONE_PLACEHOLDER} dir="ltr" className={isDark ? 'bg-slate-800 border-slate-700 text-white' : ''} />
            </div>
            <div>
              <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>تاريخ الميلاد</Label>
              <Input type="date" value={addForm.birth_date} onChange={(e) => setAddForm({ ...addForm, birth_date: e.target.value })} className={isDark ? 'bg-slate-800 border-slate-700 text-white' : ''} />
            </div>
            <div className="col-span-2">
              <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>المسجد</Label>
              <Input value={addForm.mosque_name} onChange={(e) => setAddForm({ ...addForm, mosque_name: e.target.value })} placeholder="اكتب اسم المسجد" className={isDark ? 'bg-slate-800 border-slate-700 text-white' : ''} />
            </div>
            <div>
              <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>التخصص</Label>
              <Input value={addForm.specialization} onChange={(e) => setAddForm({ ...addForm, specialization: e.target.value })} placeholder="مثال: تجويد، حفظ" className={isDark ? 'bg-slate-800 border-slate-700 text-white' : ''} />
            </div>
            <div>
              <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>سنوات الخبرة</Label>
              <Input type="number" min="0" value={addForm.experience_years} onChange={(e) => setAddForm({ ...addForm, experience_years: e.target.value })} className={isDark ? 'bg-slate-800 border-slate-700 text-white' : ''} />
            </div>
            <div className="col-span-2">
              <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>إسناد مجموعة (اختياري)</Label>
              <select
                value={addForm.group_id}
                onChange={(e) => setAddForm({ ...addForm, group_id: e.target.value })}
                className={`w-full h-10 px-3 rounded-md border ${isDark ? 'bg-slate-800 border-slate-700 text-white' : 'border-slate-300'}`}
              >
                <option value="">بدون مجموعة</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name} — {g.sheikh_name || 'غير معين'}</option>
                ))}
              </select>
              <p className={`text-xs mt-1 ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                إذا كانت المجموعة مُسندة إلى مشرف آخر، فستنتقل إلى المشرف الجديد.
              </p>
            </div>
          </div>
          <DialogFooter className="gap-2 mt-4">
            <Button variant="outline" onClick={() => setAddOpen(false)} className={isDark ? 'border-slate-700' : ''}>
              إلغاء
            </Button>
            <Button onClick={submitAddSheikh} disabled={addingSheikh} className="bg-blue-600 hover:bg-blue-700">
              {addingSheikh ? <Loader2 className="w-4 h-4 ml-1 animate-spin" /> : <UserPlus className="w-4 h-4 ml-1" />}
              إضافة المشرف
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Sheikh Modal */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className={`max-w-lg ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white'}`}>
          <DialogHeader>
            <DialogTitle className={`flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
              <Edit className="w-5 h-5 text-emerald-400" />تعديل بيانات {editTarget?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 mt-2">
            <div className="col-span-2">
              <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>الاسم</Label>
              <Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className={isDark ? 'bg-slate-800 border-slate-700 text-white' : ''} />
            </div>
            <div>
              <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>الهاتف</Label>
              <Input value={editForm.student_phone} onChange={(e) => setEditForm({ ...editForm, student_phone: normalizePhone(e.target.value) })} placeholder={PHONE_PLACEHOLDER} dir="ltr" className={isDark ? 'bg-slate-800 border-slate-700 text-white' : ''} />
            </div>
            <div>
              <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>تاريخ الميلاد</Label>
              <Input type="date" value={editForm.birth_date} onChange={(e) => setEditForm({ ...editForm, birth_date: e.target.value })} className={isDark ? 'bg-slate-800 border-slate-700 text-white' : ''} />
            </div>
            <div className="col-span-2">
              <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>المسجد</Label>
              <Input value={editForm.mosque_name} onChange={(e) => setEditForm({ ...editForm, mosque_name: e.target.value })} placeholder="اكتب اسم المسجد" className={isDark ? 'bg-slate-800 border-slate-700 text-white' : ''} />
            </div>
            <div>
              <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>التخصص</Label>
              <Input value={editForm.specialization} onChange={(e) => setEditForm({ ...editForm, specialization: e.target.value })} className={isDark ? 'bg-slate-800 border-slate-700 text-white' : ''} />
            </div>
            <div>
              <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>سنوات الخبرة</Label>
              <Input value={editForm.experience_years} onChange={(e) => setEditForm({ ...editForm, experience_years: e.target.value })} className={isDark ? 'bg-slate-800 border-slate-700 text-white' : ''} />
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setEditOpen(false)} className={isDark ? 'border-slate-600 text-slate-300' : ''}>إلغاء</Button>
            <Button onClick={saveEditSheikh} disabled={savingEdit} className="bg-emerald-600 hover:bg-emerald-700">
              {savingEdit ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : null}حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change Password Modal */}
      <Dialog open={showPasswordModal} onOpenChange={setShowPasswordModal}>
        <DialogContent className={isDark ? 'bg-slate-900 border-slate-700' : 'bg-white'}>
          <DialogHeader>
            <DialogTitle className={`flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
              <Key className="w-5 h-5 text-purple-400" />
              تغيير كلمة المرور
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <p className={isDark ? 'text-slate-300' : 'text-slate-600'}>
              تغيير كلمة مرور المشرف <span className="text-purple-400 font-bold">{passwordTarget?.name}</span>
            </p>
            <p className={`text-sm ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{passwordTarget?.email}</p>
            
            <div className="space-y-2">
              <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>كلمة المرور الجديدة</Label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className={isDark ? 'bg-slate-800 border-slate-700 text-white' : ''}
                placeholder="أدخل كلمة المرور الجديدة (6 أحرف على الأقل)"
                dir="ltr"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 mt-6">
            <Button variant="outline" onClick={() => setShowPasswordModal(false)}>
              إلغاء
            </Button>
            <Button 
              className="bg-purple-500 hover:bg-purple-600" 
              onClick={handleChangePassword} 
              disabled={passwordSubmitting || newPassword.length < 6}
            >
              {passwordSubmitting ? 'جارٍ التغيير...' : 'تغيير كلمة المرور'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SheikhManagement;
