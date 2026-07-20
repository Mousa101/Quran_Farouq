import { useState, useEffect } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Key, Plus, Trash2, Copy, Check, Users, Shield, Loader2, GraduationCap } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const RegistrationCodes = () => {
  const [codes, setCodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [selectedRole, setSelectedRole] = useState('student');
  const [copiedCode, setCopiedCode] = useState(null);

  useEffect(() => {
    fetchCodes();
  }, []);

  const fetchCodes = async () => {
    try {
      const response = await axios.get(`${API}/auth/codes`);
      setCodes(response.data);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const generateCode = async () => {
    setGenerating(true);
    try {
      const response = await axios.post(`${API}/auth/generate-code`, { role: selectedRole });
      const roleLabels = { student: 'الطالب', sheikh: 'المشرف', admin: 'المدير' };
      toast.success(`تم إنشاء كود ${roleLabels[selectedRole]}: ${response.data.code}`);
      fetchCodes();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل إنشاء الكود');
    } finally {
      setGenerating(false);
    }
  };

  const deleteCode = async (code) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا الكود؟')) return;
    
    try {
      await axios.delete(`${API}/auth/codes/${code}`);
      toast.success('تم حذف الكود');
      fetchCodes();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل حذف الكود');
    }
  };

  const copyCode = (code) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    toast.success('تم نسخ الكود');
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const getRoleIcon = (role) => {
    if (role === 'student') return <GraduationCap className="w-4 h-4" />;
    if (role === 'sheikh') return <Users className="w-4 h-4" />;
    return <Shield className="w-4 h-4" />;
  };

  const getRoleLabel = (role) => {
    if (role === 'student') return 'طالب';
    if (role === 'sheikh') return 'مشرف';
    return 'مدير';
  };

  const getRoleStyle = (role) => {
    if (role === 'student') return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
    if (role === 'sheikh') return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const unusedCodes = codes.filter(c => !c.used);
  const usedCodes = codes.filter(c => c.used);

  // Group unused codes by role
  const studentCodes = unusedCodes.filter(c => c.role === 'student');
  const sheikhCodes = unusedCodes.filter(c => c.role === 'sheikh');
  const adminCodes = unusedCodes.filter(c => c.role === 'admin');

  return (
    <div className="space-y-8 animate-fadeIn" data-testid="registration-codes-page">
      <div>
        <h1 className="text-2xl font-bold text-white">أكواد التسجيل</h1>
        <p className="text-slate-400">إنشاء وإدارة أكواد تسجيل الطلاب والمشرفين والمدراء</p>
      </div>

      {/* Generate Code */}
      <Card className="glass-card border-white/10">
        <CardHeader>
          <CardTitle className="text-xl font-bold text-white flex items-center gap-3">
            <Key className="w-6 h-6 text-emerald-400" />
            إنشاء كود جديد
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4">
            <Select value={selectedRole} onValueChange={setSelectedRole}>
              <SelectTrigger className="w-full sm:w-48 bg-slate-800 border-slate-700 text-white" data-testid="role-select">
                <SelectValue placeholder="اختر نوع الحساب" />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                <SelectItem value="student" className="text-white">
                  <div className="flex items-center gap-2">
                    <GraduationCap className="w-4 h-4" />
                    طالب
                  </div>
                </SelectItem>
                <SelectItem value="sheikh" className="text-white">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    مشرف
                  </div>
                </SelectItem>
                <SelectItem value="admin" className="text-white">
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4" />
                    مدير
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
            
            <Button
              onClick={generateCode}
              className="bg-emerald-500 hover:bg-emerald-600"
              disabled={generating}
              data-testid="generate-code-btn"
            >
              {generating ? (
                <Loader2 className="w-5 h-5 animate-spin ml-2" />
              ) : (
                <Plus className="w-5 h-5 ml-2" />
              )}
              إنشاء كود
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Available Codes by Role */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Student Codes */}
        <Card className="glass-card border-emerald-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg text-white flex items-center gap-2">
              <GraduationCap className="w-5 h-5 text-emerald-400" />
              أكواد الطلاب ({studentCodes.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {studentCodes.length === 0 ? (
              <p className="text-slate-400 text-sm text-center py-4">لا توجد أكواد</p>
            ) : (
              <div className="space-y-2">
                {studentCodes.map((code) => (
                  <div key={code.id} className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between">
                    <span className="text-xl font-bold text-emerald-400 font-mono tracking-wider">{code.code}</span>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => copyCode(code.code)} className="text-slate-400 hover:text-emerald-400">
                        {copiedCode === code.code ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => deleteCode(code.code)} className="text-slate-400 hover:text-red-400">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Sheikh Codes */}
        <Card className="glass-card border-blue-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-400" />
              أكواد المشرفين ({sheikhCodes.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {sheikhCodes.length === 0 ? (
              <p className="text-slate-400 text-sm text-center py-4">لا توجد أكواد</p>
            ) : (
              <div className="space-y-2">
                {sheikhCodes.map((code) => (
                  <div key={code.id} className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-between">
                    <span className="text-xl font-bold text-blue-400 font-mono tracking-wider">{code.code}</span>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => copyCode(code.code)} className="text-slate-400 hover:text-blue-400">
                        {copiedCode === code.code ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => deleteCode(code.code)} className="text-slate-400 hover:text-red-400">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Admin Codes */}
        <Card className="glass-card border-purple-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg text-white flex items-center gap-2">
              <Shield className="w-5 h-5 text-purple-400" />
              أكواد المدراء ({adminCodes.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {adminCodes.length === 0 ? (
              <p className="text-slate-400 text-sm text-center py-4">لا توجد أكواد</p>
            ) : (
              <div className="space-y-2">
                {adminCodes.map((code) => (
                  <div key={code.id} className="p-3 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-between">
                    <span className="text-xl font-bold text-purple-400 font-mono tracking-wider">{code.code}</span>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => copyCode(code.code)} className="text-slate-400 hover:text-purple-400">
                        {copiedCode === code.code ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => deleteCode(code.code)} className="text-slate-400 hover:text-red-400">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Used Codes History */}
      {usedCodes.length > 0 && (
        <Card className="glass-card border-white/10">
          <CardHeader>
            <CardTitle className="text-xl font-bold text-white">
              الأكواد المستخدمة ({usedCodes.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {usedCodes.map((code) => (
                <div
                  key={code.id}
                  className="p-3 rounded-lg bg-slate-800/30 border border-white/5 flex items-center justify-between opacity-60"
                >
                  <div className="flex items-center gap-3">
                    <span className={`px-2 py-1 rounded text-xs font-bold ${getRoleStyle(code.role)}`}>
                      {getRoleLabel(code.role)}
                    </span>
                    <span className="text-slate-400 font-mono">{code.code}</span>
                  </div>
                  <span className="text-slate-500 text-xs">مستخدم</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default RegistrationCodes;
