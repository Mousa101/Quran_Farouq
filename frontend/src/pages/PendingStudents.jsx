import { useState, useEffect } from 'react';
import axios from 'axios';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { UserPlus, Clock, Phone, Mail, Key, Copy, CheckCircle, School, Home, Calendar, User, Loader2, BookOpen, Shield, GraduationCap, Briefcase, Trash2 } from 'lucide-react';
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

  // #1 — رفض/حذف طلب تسجيل معلّق
  const rejectRegistration = async (user) => {
    if (!window.confirm(`هل أنت متأكد من حذف طلب تسجيل "${user.name}"؟ لا يمكن التراجع.`)) return;
    try {
      await axios.delete(`${API}/admin/pending-registrations/${user.id}`);
      toast.success('تم حذف طلب التسجيل');
      setDialogOpen(false);
      setSelectedUser(null);
      fetchPendingRegistrations();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في حذف الطلب');
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('ar-SA', {
      year: 'numeric', month: 'long', day: 'numeric'
    });
  };

  const getRoleInfo = (role) => {
    switch(role) {
      case 'sheikh':
        return { label: 'مشرف', icon: BookOpen, bgColor: 'bg-blue-500/20', textColor: 'text-blue-400' };
      case 'admin':
        return { label: 'مدير', icon: Shield, bgColor: 'bg-purple-500/20', textColor: 'text-purple-400' };
      default:
        return { label: 'طالب', icon: GraduationCap, bgColor: 'bg-emerald-500/20', textColor: 'text-emerald-400' };
    }
  };

  const getAllPending = () => {
    return [
      ...pendingData.students.map(s => ({...s, role: 'student'})),
      ...pendingData.sheikhs.map(s => ({...s, role: 'sheikh'})),
      ...pendingData.admins.map(s => ({...s, role: 'admin'}))
    ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
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
    <div className="space-y-6 animate-fadeIn">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-white flex items-center gap-3">
            <UserPlus className="w-6 h-6 md:w-8 md:h-8 text-amber-400" />
            طلبات التسجيل المعلقة
          </h1>
          <p className="text-slate-400 text-sm mt-1">مستخدمون بانتظار تفعيل حساباتهم ({pendingData.total})</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant={activeTab === 'all' ? 'default' : 'outline'} size="sm" onClick={() => setActiveTab('all')} className={activeTab === 'all' ? 'bg-emerald-600' : 'border-slate-700'}>
            الكل ({pendingData.total})
          </Button>
          <Button variant={activeTab === 'students' ? 'default' : 'outline'} size="sm" onClick={() => setActiveTab('students')} className={activeTab === 'students' ? 'bg-emerald-600' : 'border-slate-700'}>
            <GraduationCap className="w-4 h-4 ml-1" />طلاب ({pendingData.students.length})
          </Button>
          <Button variant={activeTab === 'sheikhs' ? 'default' : 'outline'} size="sm" onClick={() => setActiveTab('sheikhs')} className={activeTab === 'sheikhs' ? 'bg-blue-600' : 'border-slate-700'}>
            <BookOpen className="w-4 h-4 ml-1" />مشرفين ({pendingData.sheikhs.length})
          </Button>
          <Button variant={activeTab === 'admins' ? 'default' : 'outline'} size="sm" onClick={() => setActiveTab('admins')} className={activeTab === 'admins' ? 'bg-purple-600' : 'border-slate-700'}>
            <Shield className="w-4 h-4 ml-1" />مدراء ({pendingData.admins.length})
          </Button>
        </div>
      </div>

      {pendingList.length === 0 ? (
        <Card className="glass-card border-white/10">
          <CardContent className="py-12 text-center">
            <CheckCircle className="w-16 h-16 mx-auto mb-4 text-emerald-400 opacity-50" />
            <p className="text-slate-400 text-lg">لا توجد طلبات معلقة</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {pendingList.map((user) => {
            const roleInfo = getRoleInfo(user.role);
            return (
              <Card key={user.id} className="glass-card border-white/10 hover:border-amber-500/30 transition-all cursor-pointer" onClick={() => { setSelectedUser(user); setDialogOpen(true); }}>
                <CardContent className="p-3 md:p-4">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 md:w-12 md:h-12 rounded-xl ${roleInfo.bgColor} flex items-center justify-center`}>
                        <roleInfo.icon className={`w-5 h-5 md:w-6 md:h-6 ${roleInfo.textColor}`} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-base md:text-lg font-bold text-white">{user.name}</h3>
                          <Badge className={`${roleInfo.bgColor} ${roleInfo.textColor} text-[10px]`}>{roleInfo.label}</Badge>
                        </div>
                        <p className="text-slate-400 text-xs md:text-sm">{user.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="bg-slate-800/50 rounded-xl p-2 md:p-3 border border-amber-500/30">
                        <p className="text-[10px] md:text-xs text-slate-400 mb-0.5">كود التفعيل:</p>
                        <div className="flex items-center gap-1">
                          <span className="text-lg md:text-2xl font-mono font-bold text-amber-400 tracking-widest">{user.activation_code}</span>
                          <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-slate-400" onClick={(e) => { e.stopPropagation(); copyToClipboard(user.activation_code); }}>
                            <Copy className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-red-400 hover:text-red-300 hover:bg-red-500/10" title="رفض الطلب" onClick={(e) => { e.stopPropagation(); rejectRegistration(user); }}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-slate-900 border-slate-700 max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-white flex items-center gap-2">
              <User className="w-6 h-6 text-amber-400" />
              بيانات المستخدم
            </DialogTitle>
          </DialogHeader>
          {selectedUser && (
            <div className="space-y-4 mt-4">
              <div className="flex justify-center">
                <Badge className={`${getRoleInfo(selectedUser.role).bgColor} ${getRoleInfo(selectedUser.role).textColor} text-sm px-3 py-1`}>
                  {getRoleInfo(selectedUser.role).label}
                </Badge>
              </div>
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-center">
                <p className="text-sm text-amber-300 mb-2">كود التفعيل</p>
                <div className="flex items-center justify-center gap-3">
                  <span className="text-3xl font-mono font-bold text-amber-400 tracking-[0.3em]">{selectedUser.activation_code}</span>
                  <Button size="sm" variant="outline" className="border-amber-500/50 text-amber-400" onClick={() => copyToClipboard(selectedUser.activation_code)}>
                    <Copy className="w-4 h-4 ml-1" />نسخ
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-slate-800/50">
                  <p className="text-xs text-slate-400 mb-1">الاسم</p>
                  <p className="text-white font-medium">{selectedUser.name}</p>
                </div>
                <div className="p-3 rounded-lg bg-slate-800/50">
                  <p className="text-xs text-slate-400 mb-1">البريد</p>
                  <p className="text-white font-medium text-sm" dir="ltr">{selectedUser.email}</p>
                </div>
              </div>
              {selectedUser.student_phone && (
                <div className="p-3 rounded-lg bg-slate-800/50">
                  <p className="text-xs text-slate-400 mb-1">الهاتف</p>
                  <p className="text-emerald-400 font-medium" dir="ltr">{selectedUser.student_phone}</p>
                </div>
              )}
              {(selectedUser.role === 'sheikh' || selectedUser.role === 'admin') && selectedUser.specialization && (
                <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                  <p className="text-xs text-blue-300 mb-1">التخصص</p>
                  <p className="text-white font-medium">{selectedUser.specialization}</p>
                </div>
              )}
              <Button variant="outline" className="w-full border-red-500/40 text-red-400 hover:bg-red-500/10" onClick={() => rejectRegistration(selectedUser)}>
                <Trash2 className="w-4 h-4 ml-1" />رفض وحذف طلب التسجيل
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PendingStudents;
