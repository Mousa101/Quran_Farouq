import { useState, useEffect } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { UserPlus, Clock, Phone, Mail, Key, Copy, CheckCircle, School, Home, Calendar, User, Loader2, BookOpen, Shield, GraduationCap, Briefcase } from 'lucide-react';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const PendingStudents = () => {
  const [pendingData, setPendingData] = useState({ students: [], sheikhs: [], admins: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('all');

  useEffect(() => {
    fetchPendingRegistrations();
  }, []);

  const fetchPendingRegistrations = async () => {
    try {
      const response = await axios.get(`${API}/admin/pending-registrations`);
      setPendingData(response.data);
    } catch (error) {
      console.error('Error:', error);
      // Fallback to old endpoint
      try {
        const res = await axios.get(`${API}/admin/pending-students`);
        setPendingData({ students: res.data, sheikhs: [], admins: [], total: res.data.length });
      } catch (e) {
        toast.error('فشل في تحميل البيانات');
      }
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast.success('تم النسخ!');
  };

  const openUserDetails = (user) => {
    setSelectedUser(user);
    setDialogOpen(true);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('ar-SA', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getRoleInfo = (role) => {
    switch(role) {
      case 'sheikh':
        return { label: 'معلم', icon: BookOpen, color: 'blue', bgColor: 'bg-blue-500/20', textColor: 'text-blue-400' };
      case 'admin':
        return { label: 'مدير', icon: Shield, color: 'purple', bgColor: 'bg-purple-500/20', textColor: 'text-purple-400' };
      default:
        return { label: 'طالب', icon: GraduationCap, color: 'emerald', bgColor: 'bg-emerald-500/20', textColor: 'text-emerald-400' };
    }
  };

  const getAllPending = () => {
    const all = [
      ...pendingData.students.map(s => ({...s, role: 'student'})),
      ...pendingData.sheikhs.map(s => ({...s, role: 'sheikh'})),
      ...pendingData.admins.map(s => ({...s, role: 'admin'}))
    ];
    return all.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  };

  const getFilteredList = () => {
    switch(activeTab) {
      case 'students': return pendingData.students.map(s => ({...s, role: 'student'}));
      case 'sheikhs': return pendingData.sheikhs.map(s => ({...s, role: 'sheikh'}));
      case 'admins': return pendingData.admins.map(s => ({...s, role: 'admin'}));
      default: return getAllPending();
    }
  };

  const pendingList = getFilteredList();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn" data-testid="pending-students-page">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-white flex items-center gap-3">
            <UserPlus className="w-6 h-6 md:w-8 md:h-8 text-amber-400" />
            طلبات التسجيل المعلقة
          </h1>
          <p className="text-slate-400 text-sm mt-1">مستخدمون بانتظار تفعيل حساباتهم ({pendingData.total})</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 flex-wrap">
          <Button
            variant={activeTab === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveTab('all')}
            className={activeTab === 'all' ? 'bg-emerald-600' : 'border-slate-700'}
          >
            الكل ({pendingData.total})
          </Button>
          <Button
            variant={activeTab === 'students' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveTab('students')}
            className={activeTab === 'students' ? 'bg-emerald-600' : 'border-slate-700'}
          >
            <GraduationCap className="w-4 h-4 ml-1" />
            طلاب ({pendingData.students.length})
          </Button>
          <Button
            variant={activeTab === 'sheikhs' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveTab('sheikhs')}
            className={activeTab === 'sheikhs' ? 'bg-blue-600' : 'border-slate-700'}
          >
            <BookOpen className="w-4 h-4 ml-1" />
            معلمين ({pendingData.sheikhs.length})
          </Button>
          <Button
            variant={activeTab === 'admins' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveTab('admins')}
            className={activeTab === 'admins' ? 'bg-purple-600' : 'border-slate-700'}
          >
            <Shield className="w-4 h-4 ml-1" />
            مدراء ({pendingData.admins.length})
          </Button>
        </div>
      </div>

      {pendingList.length === 0 ? (
        <Card className="glass-card border-white/10">
          <CardContent className="py-12 text-center">
            <CheckCircle className="w-16 h-16 mx-auto mb-4 text-emerald-400 opacity-50" />
            <p className="text-slate-400 text-lg">لا توجد طلبات معلقة</p>
            <p className="text-slate-500 text-sm mt-2">جميع المستخدمين تم تفعيل حساباتهم</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {pendingList.map((user) => {
            const roleInfo = getRoleInfo(user.role);
            return (
              <Card 
                key={user.id} 
                className="glass-card border-white/10 hover:border-amber-500/30 transition-all cursor-pointer"
                onClick={() => openUserDetails(user)}
              >
                <CardContent className="p-3 md:p-4">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div className="flex items-center gap-3 md:gap-4">
                      <div className={`w-10 h-10 md:w-12 md:h-12 rounded-xl ${roleInfo.bgColor} flex items-center justify-center`}>
                        <roleInfo.icon className={`w-5 h-5 md:w-6 md:h-6 ${roleInfo.textColor}`} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-base md:text-lg font-bold text-white truncate">{user.name}</h3>
                          <Badge className={`${roleInfo.bgColor} ${roleInfo.textColor} text-[10px]`}>
                            {roleInfo.label}
                          </Badge>
                        </div>
                        <p className="text-slate-400 text-xs md:text-sm truncate">{user.email}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2 md:gap-4">
                      {/* Activation Code Display */}
                      <div className="bg-slate-800/50 rounded-xl p-2 md:p-3 border border-amber-500/30 flex-shrink-0">
                        <p className="text-[10px] md:text-xs text-slate-400 mb-0.5 md:mb-1">كود التفعيل:</p>
                        <div className="flex items-center gap-1 md:gap-2">
                          <span className="text-lg md:text-2xl font-mono font-bold text-amber-400 tracking-widest">
                            {user.activation_code}
                          </span>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 md:h-8 md:w-8 p-0 text-slate-400 hover:text-white"
                            onClick={(e) => {
                              e.stopPropagation();
                              copyToClipboard(user.activation_code);
                            }}
                          >
                            <Copy className="w-3 h-3 md:w-4 md:h-4" />
                          </Button>
                        </div>
                      </div>
                      
                      <Badge className="bg-amber-500/20 text-amber-400 text-[10px] md:text-xs hidden md:flex">
                        في الانتظار
                      </Badge>
                    </div>
                  </div>
                  
                  {/* Quick Info */}
                  <div className="mt-2 md:mt-3 flex flex-wrap gap-2 md:gap-4 text-xs md:text-sm text-slate-400">
                    {user.student_phone && (
                      <span className="flex items-center gap-1">
                        <Phone className="w-3 h-3 md:w-4 md:h-4" />
                        {user.student_phone}
                      </span>
                    )}
                    {user.role === 'student' && user.father_phone && (
                      <span className="flex items-center gap-1">
                        <Phone className="w-3 h-3 md:w-4 md:h-4 text-blue-400" />
                        الأب: {user.father_phone}
                      </span>
                    )}
                    {(user.role === 'sheikh' || user.role === 'admin') && user.specialization && (
                      <span className="flex items-center gap-1">
                        <Briefcase className="w-3 h-3 md:w-4 md:h-4 text-blue-400" />
                        {user.specialization}
                      </span>
                    )}
                    {user.role === 'student' && user.mother_phone && (
                      <span className="flex items-center gap-1">
                        <Phone className="w-3 h-3 md:w-4 md:h-4 text-pink-400" />
                        الأم: {user.mother_phone}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* User Details Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-slate-900 border-slate-700 max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-white flex items-center gap-2">
              {selectedUser && (() => {
                const info = getRoleInfo(selectedUser.role);
                return <info.icon className={`w-6 h-6 ${info.textColor}`} />;
              })()}
              بيانات المستخدم
            </DialogTitle>
          </DialogHeader>
          
          {selectedUser && (
            <div className="space-y-4 mt-4">
              {/* Role Badge */}
              <div className="flex justify-center">
                <Badge className={`${getRoleInfo(selectedUser.role).bgColor} ${getRoleInfo(selectedUser.role).textColor} text-sm px-3 py-1`}>
                  {getRoleInfo(selectedUser.role).label}
                </Badge>
              </div>
              
              {/* Activation Code - Highlighted */}
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-center">
                <p className="text-sm text-amber-300 mb-2">كود التفعيل</p>
                <div className="flex items-center justify-center gap-3">
                  <span className="text-3xl font-mono font-bold text-amber-400 tracking-[0.3em]">
                    {selectedUser.activation_code}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-amber-500/50 text-amber-400 hover:bg-amber-500/20"
                    onClick={() => copyToClipboard(selectedUser.activation_code)}
                  >
                    <Copy className="w-4 h-4 ml-1" />
                    نسخ
                  </Button>
                </div>
                <p className="text-xs text-slate-400 mt-3">
                  أرسل هذا الكود للمستخدم لتفعيل حسابه
                </p>
              </div>
              
              {/* User Info */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-slate-800/50">
                  <p className="text-xs text-slate-400 mb-1">الاسم</p>
                  <p className="text-white font-medium">{selectedUser.name}</p>
                </div>
                <div className="p-3 rounded-lg bg-slate-800/50">
                  <p className="text-xs text-slate-400 mb-1 flex items-center gap-1">
                    <Mail className="w-3 h-3" />
                    البريد الإلكتروني
                  </p>
                  <p className="text-white font-medium text-sm" dir="ltr">{selectedUser.email}</p>
                </div>
              </div>
              
              {/* Sheikh/Admin specific */}
              {(selectedUser.role === 'sheikh' || selectedUser.role === 'admin') && (
                <div className="grid grid-cols-2 gap-3">
                  {selectedUser.specialization && (
                    <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                      <p className="text-xs text-blue-300 mb-1 flex items-center gap-1">
                        <Briefcase className="w-3 h-3" />
                        التخصص
                      </p>
                      <p className="text-white font-medium">{selectedUser.specialization}</p>
                    </div>
                  )}
                  {selectedUser.experience_years && (
                    <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                      <p className="text-xs text-blue-300 mb-1">سنوات الخبرة</p>
                      <p className="text-white font-medium">{selectedUser.experience_years} سنة</p>
                    </div>
                  )}
                </div>
              )}
              
              {/* Phone Numbers */}
              <div className="space-y-2">
                <p className="text-sm text-slate-300 font-medium">رقم الهاتف:</p>
                {selectedUser.student_phone ? (
                  <div className="p-2 rounded-lg bg-slate-800/50 flex items-center justify-between">
                    <p className="text-emerald-400 font-medium" dir="ltr">{selectedUser.student_phone}</p>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 text-xs"
                      onClick={() => copyToClipboard(selectedUser.student_phone)}
                    >
                      <Copy className="w-3 h-3 ml-1" />
                      نسخ
                    </Button>
                  </div>
                ) : (
                  <p className="text-slate-500 text-sm">لم يتم تحديد رقم</p>
                )}
              </div>
              
              {/* Student specific - Parent phones */}
              {selectedUser.role === 'student' && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2 rounded-lg bg-slate-800/50 text-center">
                    <p className="text-xs text-slate-400">هاتف الأب</p>
                    <p className="text-blue-400 font-medium text-sm" dir="ltr">
                      {selectedUser.father_phone || '-'}
                    </p>
                  </div>
                  <div className="p-2 rounded-lg bg-slate-800/50 text-center">
                    <p className="text-xs text-slate-400">هاتف الأم</p>
                    <p className="text-pink-400 font-medium text-sm" dir="ltr">
                      {selectedUser.mother_phone || '-'}
                    </p>
                  </div>
                </div>
              )}
              
              {/* Registration Date */}
              <div className="p-3 rounded-lg bg-slate-800/50">
                <p className="text-xs text-slate-400 mb-1 flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  تاريخ التسجيل
                </p>
                <p className="text-white font-medium">{formatDate(selectedUser.created_at)}</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PendingStudents;
                    <p className="text-blue-400 font-medium text-sm" dir="ltr">
                      {selectedStudent.father_phone || '-'}
                    </p>
                    {selectedStudent.father_phone && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 text-xs mt-1"
                        onClick={() => copyToClipboard(selectedStudent.father_phone)}
                      >
                        <Copy className="w-3 h-3 ml-1" />
                        نسخ
                      </Button>
                    )}
                  </div>
                  <div className="p-2 rounded-lg bg-slate-800/50 text-center">
                    <p className="text-xs text-slate-400">الأم</p>
                    <p className="text-pink-400 font-medium text-sm" dir="ltr">
                      {selectedStudent.mother_phone || '-'}
                    </p>
                    {selectedStudent.mother_phone && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 text-xs mt-1"
                        onClick={() => copyToClipboard(selectedStudent.mother_phone)}
                      >
                        <Copy className="w-3 h-3 ml-1" />
                        نسخ
                      </Button>
                    )}
                  </div>
                </div>
              </div>
              
              {/* Other Info */}
              <div className="grid grid-cols-2 gap-3">
                {selectedStudent.mosque_name && (
                  <div className="p-3 rounded-lg bg-slate-800/50">
                    <p className="text-xs text-slate-400 mb-1 flex items-center gap-1">
                      <Home className="w-3 h-3" />
                      المسجد
                    </p>
                    <p className="text-white text-sm">{selectedStudent.mosque_name}</p>
                  </div>
                )}
                {selectedStudent.school_name && (
                  <div className="p-3 rounded-lg bg-slate-800/50">
                    <p className="text-xs text-slate-400 mb-1 flex items-center gap-1">
                      <School className="w-3 h-3" />
                      المدرسة
                    </p>
                    <p className="text-white text-sm">{selectedStudent.school_name}</p>
                  </div>
                )}
                {selectedStudent.school_grade && (
                  <div className="p-3 rounded-lg bg-slate-800/50">
                    <p className="text-xs text-slate-400 mb-1">الصف</p>
                    <p className="text-white text-sm">{selectedStudent.school_grade}</p>
                  </div>
                )}
                {selectedStudent.birth_date && (
                  <div className="p-3 rounded-lg bg-slate-800/50">
                    <p className="text-xs text-slate-400 mb-1 flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      تاريخ الميلاد
                    </p>
                    <p className="text-white text-sm">{selectedStudent.birth_date}</p>
                  </div>
                )}
              </div>
              
              {/* Registration Date */}
              <div className="p-3 rounded-lg bg-slate-800/30 text-center">
                <p className="text-xs text-slate-400">تاريخ التسجيل</p>
                <p className="text-slate-300 text-sm">{formatDate(selectedStudent.created_at)}</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PendingStudents;
