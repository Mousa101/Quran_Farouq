import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { BookOpen, Mail, Key, CheckCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import axios from 'axios';
import { EMAIL_PLACEHOLDER } from '../lib/constants';
import { lastLoginPath, registerPathFor } from '../lib/authRoutes';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const Activate = () => {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [activationCode, setActivationCode] = useState('');

  const handleActivate = async (e) => {
    e.preventDefault();
    
    if (activationCode.length !== 6) {
      toast.error('رمز التفعيل يجب أن يكون 6 أرقام');
      return;
    }
    
    setLoading(true);
    
    try {
      const response = await axios.post(`${API}/auth/activate`, {
        email: email,
        activation_code: activationCode
      });
      
      // Save token and redirect
      localStorage.setItem('token', response.data.token);
      axios.defaults.headers.common['Authorization'] = `Bearer ${response.data.token}`;
      
      toast.success('تم تفعيل حسابك بنجاح!');
      window.location.href = '/dashboard';
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل التفعيل');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background pattern-overlay flex items-center justify-center p-4">
      <Card className="w-full max-w-md glass-card animate-fadeIn">
        <CardHeader className="text-center space-y-4">
          <div className="w-20 h-20 mx-auto rounded-full bg-emerald-500/20 flex items-center justify-center">
            <Key className="w-10 h-10 text-emerald-400" />
          </div>
          <div>
            <CardTitle className="text-2xl font-bold text-white font-cairo">
              تفعيل الحساب
            </CardTitle>
            <CardDescription className="text-slate-400 mt-2">
              أدخل بريدك الإلكتروني ورمز التفعيل الذي حصلت عليه من إدارة المركز
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleActivate} className="space-y-6">
            <div className="space-y-2">
              <Label className="text-slate-300">البريد الإلكتروني</Label>
              <div className="relative">
                <Mail className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                <Input
                  type="email"
                  placeholder={EMAIL_PLACEHOLDER}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pr-10 h-12 bg-slate-800 border-slate-700 text-white text-left"
                  dir="ltr"
                  required
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label className="text-slate-300">رمز التفعيل</Label>
              <Input
                type="text"
                placeholder="أدخل الرمز المكوّن من 6 أرقام"
                value={activationCode}
                onChange={(e) => setActivationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="text-center text-2xl tracking-[0.5em] bg-slate-800 border-emerald-500/50 text-white h-14"
                maxLength={6}
              />
            </div>
            
            <Button
              type="submit"
              className="w-full h-12 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl"
              disabled={loading || activationCode.length !== 6 || !email}
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                <>
                  <CheckCircle className="w-5 h-5 ml-2" />
                  تفعيل الحساب
                </>
              )}
            </Button>
          </form>
          
          <div className="mt-6 text-center space-y-2">
            <Link to={lastLoginPath()} className="text-slate-400 hover:text-white text-sm block">
              العودة لتسجيل الدخول
            </Link>
            <Link to={registerPathFor('student')} className="text-emerald-400 hover:text-emerald-300 text-sm block">
              ليس لديك حساب؟ سجل الآن
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Activate;
