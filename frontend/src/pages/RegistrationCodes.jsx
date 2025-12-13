import { useState, useEffect } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Key, Plus, Trash2, Copy, Check, Users, Shield, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const RegistrationCodes = () => {
  const [codes, setCodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [selectedRole, setSelectedRole] = useState('sheikh');
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
      toast.success(`تم إنشاء كود ${selectedRole === 'sheikh' ? 'الشيخ' : 'المدير'}: ${response.data.code}`);
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
    return role === 'sheikh' ? <Users className="w-4 h-4" /> : <Shield className="w-4 h-4" />;
  };

  const getRoleLabel = (role) => {
    return role === 'sheikh' ? 'شيخ' : 'مدير';
  };

  const getRoleStyle = (role) => {
    return role === 'sheikh' 
      ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
      : 'bg-purple-500/20 text-purple-400 border-purple-500/30';
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

  return (
    <div className="space-y-8 animate-fadeIn" data-testid="registration-codes-page">
      <div>
        <h1 className="text-2xl font-bold text-white">أكواد التسجيل</h1>
        <p className="text-slate-400">إنشاء وإدارة أكواد تسجيل الشيوخ والمدراء</p>
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
                <SelectItem value="sheikh" className="text-white">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    شيخ
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

      {/* Available Codes */}
      <Card className="glass-card border-white/10">
        <CardHeader>
          <CardTitle className="text-xl font-bold text-white">
            الأكواد المتاحة ({unusedCodes.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {unusedCodes.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <Key className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>لا توجد أكواد متاحة</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {unusedCodes.map((code) => (
                <div
                  key={code.id}
                  className="p-4 rounded-xl bg-slate-800/50 border border-white/10 hover:border-emerald-500/30 transition-all"
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold border flex items-center gap-1 ${getRoleStyle(code.role)}`}>
                      {getRoleIcon(code.role)}
                      {getRoleLabel(code.role)}
                    </span>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => copyCode(code.code)}
                        className="text-slate-400 hover:text-emerald-400"
                        data-testid={`copy-${code.code}`}
                      >
                        {copiedCode === code.code ? (
                          <Check className="w-4 h-4" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => deleteCode(code.code)}
                        className="text-slate-400 hover:text-red-400"
                        data-testid={`delete-${code.code}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  
                  <div className="text-center">
                    <p className="text-3xl font-bold text-emerald-400 tracking-[0.3em] font-mono">
                      {code.code}
                    </p>
                  </div>
                  
                  <p className="text-slate-500 text-xs text-center mt-3">
                    {code.created_at && format(new Date(code.created_at), 'dd MMM yyyy - HH:mm', { locale: ar })}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

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
