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
          {pendingStudents.map((student) => (
            <Card 
              key={student.id} 
              className="glass-card border-white/10 hover:border-amber-500/30 transition-all cursor-pointer"
              onClick={() => openStudentDetails(student)}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center">
                      <Clock className="w-6 h-6 text-amber-400" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-white">{student.name}</h3>
                      <p className="text-slate-400 text-sm">{student.email}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    {/* Activation Code Display */}
                    <div className="bg-slate-800/50 rounded-xl p-3 border border-amber-500/30">
                      <p className="text-xs text-slate-400 mb-1">كود التفعيل:</p>
                      <div className="flex items-center gap-2">
                        <span className="text-2xl font-mono font-bold text-amber-400 tracking-widest">
                          {student.activation_code}
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 text-slate-400 hover:text-white"
                          onClick={(e) => {
                            e.stopPropagation();
                            copyToClipboard(student.activation_code);
                          }}
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                    
                    <Badge className="bg-amber-500/20 text-amber-400">
                      في الانتظار
                    </Badge>
                  </div>
                </div>
                
                {/* Quick Info */}
                <div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-400">
                  {student.student_phone && (
                    <span className="flex items-center gap-1">
                      <Phone className="w-4 h-4" />
                      {student.student_phone}
                    </span>
                  )}
                  {student.father_phone && (
                    <span className="flex items-center gap-1">
                      <Phone className="w-4 h-4 text-blue-400" />
                      الأب: {student.father_phone}
                    </span>
                  )}
                  {student.mother_phone && (
                    <span className="flex items-center gap-1">
                      <Phone className="w-4 h-4 text-pink-400" />
                      الأم: {student.mother_phone}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Student Details Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-slate-900 border-slate-700 max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-white flex items-center gap-2">
              <User className="w-6 h-6 text-amber-400" />
              بيانات الطالب
            </DialogTitle>
          </DialogHeader>
          
          {selectedStudent && (
            <div className="space-y-4 mt-4">
              {/* Activation Code - Highlighted */}
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-center">
                <p className="text-sm text-amber-300 mb-2">كود التفعيل</p>
                <div className="flex items-center justify-center gap-3">
                  <span className="text-3xl font-mono font-bold text-amber-400 tracking-[0.3em]">
                    {selectedStudent.activation_code}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-amber-500/50 text-amber-400 hover:bg-amber-500/20"
                    onClick={() => copyToClipboard(selectedStudent.activation_code)}
                  >
                    <Copy className="w-4 h-4 ml-1" />
                    نسخ
                  </Button>
                </div>
                <p className="text-xs text-slate-400 mt-3">
                  أرسل هذا الكود للطالب عبر واتساب أو SMS لتفعيل حسابه
                </p>
              </div>
              
              {/* Student Info */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-slate-800/50">
                  <p className="text-xs text-slate-400 mb-1">الاسم</p>
                  <p className="text-white font-medium">{selectedStudent.name}</p>
                </div>
                <div className="p-3 rounded-lg bg-slate-800/50">
                  <p className="text-xs text-slate-400 mb-1 flex items-center gap-1">
                    <Mail className="w-3 h-3" />
                    البريد الإلكتروني
                  </p>
                  <p className="text-white font-medium text-sm" dir="ltr">{selectedStudent.email}</p>
                </div>
              </div>
              
              {/* Phone Numbers */}
              <div className="space-y-2">
                <p className="text-sm text-slate-300 font-medium">أرقام الهواتف:</p>
                <div className="grid grid-cols-3 gap-2">
                  <div className="p-2 rounded-lg bg-slate-800/50 text-center">
                    <p className="text-xs text-slate-400">الطالب</p>
                    <p className="text-emerald-400 font-medium text-sm" dir="ltr">
                      {selectedStudent.student_phone || '-'}
                    </p>
                    {selectedStudent.student_phone && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 text-xs mt-1"
                        onClick={() => copyToClipboard(selectedStudent.student_phone)}
                      >
                        <Copy className="w-3 h-3 ml-1" />
                        نسخ
                      </Button>
                    )}
                  </div>
                  <div className="p-2 rounded-lg bg-slate-800/50 text-center">
                    <p className="text-xs text-slate-400">الأب</p>
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
