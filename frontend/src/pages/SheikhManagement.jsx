import { useState, useEffect } from 'react';
import axios from 'axios';
import { useTheme } from '../context/ThemeContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../components/ui/dialog';
import { 
  BookOpen, Users, Search, Eye, Trash2, Phone, Mail, 
  Calendar, Award, GraduationCap, AlertTriangle, X,
  Briefcase, MapPin, Star, UserCheck, FileText, Key
} from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';

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

  useEffect(() => {
    fetchSheikhs();
  }, []);

  const fetchSheikhs = async () => {
    try {
      const res = await axios.get(`${API}/admin/sheikhs`);
      setSheikhs(res.data);
    } catch (error) {
      toast.error('فشل في تحميل بيانات المعلمين');
    } finally {
      setLoading(false);
    }
  };

  const fetchSheikhDetails = async (sheikhId) => {
    setDetailsLoading(true);
    try {
      const res = await axios.get(`${API}/admin/sheikh/${sheikhId}`);
      setSheikhDetails(res.data);
      setShowDetailsModal(true);
    } catch (error) {
      toast.error('فشل في تحميل تفاصيل المعلم');
    } finally {
      setDetailsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    
    try {
      await axios.delete(`${API}/admin/sheikh/${deleteTarget.id}`);
      toast.success(`تم حذف المعلم ${deleteTarget.name} بنجاح`);
      setSheikhs(prev => prev.filter(s => s.id !== deleteTarget.id));
      setShowDeleteModal(false);
      setDeleteTarget(null);
    } catch (error) {
      toast.error('فشل في حذف المعلم');
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

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('ar-SA');
  };

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
              إدارة المعلمين
            </h1>
            <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
              عرض وإدارة جميع المعلمين في المركز ({sheikhs.length} معلم)
            </p>
          </div>
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <Input
              type="text"
              placeholder="بحث بالاسم أو البريد..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`pr-10 h-10 w-full md:w-64 ${isDark ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-slate-200'}`}
            />
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
                {sheikh.profile_image ? (
                  <img src={sheikh.profile_image} alt={sheikh.name} className="w-14 h-14 rounded-xl object-cover border-2 border-blue-500/30" />
                ) : (
                  <div className="w-14 h-14 rounded-xl bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                    <BookOpen className="w-7 h-7 text-blue-400" />
                  </div>
                )}
                
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
          <BookOpen className="w-12 h-12 mx-auto text-slate-500 mb-3" />
          <p className={isDark ? 'text-slate-400' : 'text-slate-600'}>لا يوجد معلمين</p>
        </div>
      )}

      {/* Details Modal */}
      <Dialog open={showDetailsModal} onOpenChange={setShowDetailsModal}>
        <DialogContent className={`max-w-3xl max-h-[90vh] overflow-y-auto ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white'}`}>
          <DialogHeader>
            <DialogTitle className={`flex items-center gap-2 ${isDark ? 'text-white' : ''}`}>
              <BookOpen className="w-5 h-5 text-blue-400" />
              تفاصيل المعلم
            </DialogTitle>
          </DialogHeader>
          
          {sheikhDetails && (
            <div className="space-y-4">
              {/* Sheikh Info */}
              <div className={`p-4 rounded-xl ${isDark ? 'bg-slate-800/50' : 'bg-slate-100'}`}>
                <div className="flex items-start gap-4">
                  {sheikhDetails.sheikh.profile_image ? (
                    <img src={sheikhDetails.sheikh.profile_image} alt={sheikhDetails.sheikh.name} className="w-20 h-20 rounded-xl object-cover" />
                  ) : (
                    <div className="w-20 h-20 rounded-xl bg-blue-500/20 flex items-center justify-center">
                      <BookOpen className="w-10 h-10 text-blue-400" />
                    </div>
                  )}
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
              تأكيد حذف المعلم
            </DialogTitle>
            <DialogDescription className={isDark ? 'text-slate-400' : 'text-slate-600'}>
              هل أنت متأكد من حذف المعلم <span className="font-bold text-red-400">{deleteTarget?.name}</span>؟
              <br />
              سيتم إلغاء ربط المجموعات بهذا المعلم.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowDeleteModal(false)}>
              إلغاء
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              <Trash2 className="w-4 h-4 ml-2" />
              حذف المعلم
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
              تغيير كلمة مرور المعلم <span className="text-purple-400 font-bold">{passwordTarget?.name}</span>
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
              {passwordSubmitting ? 'جاري التغيير...' : 'تغيير كلمة المرور'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SheikhManagement;
