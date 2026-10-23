import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { BookOpen, Mail, Lock, Loader2, Eye, EyeOff, GraduationCap, Shield } from 'lucide-react';
import { toast } from 'sonner';
import { EMAIL_PLACEHOLDER } from '../lib/constants';

// لكل نوع حساب صفحة دخول مستقلة: /login/student (طالب)، /login/teacher (مشرف)، /login/admin (مدير)
const ROLE_PAGES = {
  student: { icon: GraduationCap, title: 'دخول الطلاب', description: 'أدخل بياناتك للوصول إلى حسابك' },
  sheikh: { icon: BookOpen, title: 'دخول المشرفين', description: 'أدخل بيانات حساب المشرف' },
  admin: { icon: Shield, title: 'دخول الإدارة', description: 'أدخل بيانات حساب المدير' },
};

const Login = ({ role = 'student' }) => {
  const selectedRole = ROLE_PAGES[role] ? role : 'student';
  const rolePage = ROLE_PAGES[selectedRole];
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const user = await login(email, password, selectedRole);
      toast.success(`مرحباً ${user.name}`);
      navigate('/dashboard');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل تسجيل الدخول');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background pattern-overlay flex">
      {/* Left side - Image */}
      <div className="hidden lg:flex lg:w-1/2 relative">
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-900/80 via-slate-900/90 to-background" />
        <img
          src="/backGround_url.png"
          alt="Quran"
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center p-8">
            <div className="w-32 h-32 mx-auto mb-6 rounded-full bg-white border border-white/20 flex items-center justify-center overflow-hidden p-2">
              <img src="/logo.png" alt="شعار المركز" className="w-28 h-28 object-contain" />
            </div>
            <h1 className="text-4xl font-bold text-white mb-2 font-cairo">مركز الفاروق</h1>
            <h2 className="text-2xl font-bold text-emerald-400 mb-4 font-cairo">القرآني</h2>
            <p className="text-lg text-slate-300 max-w-md">
              منصة متكاملة لإدارة حلقات تحفيظ القرآن الكريم
            </p>
          </div>
        </div>
      </div>

      {/* Right side - Login Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-4 md:p-8">
        <Card className="w-full max-w-md glass-card animate-fadeIn">
          <CardHeader className="text-center space-y-2 p-4 md:p-6">
            <div className="lg:hidden w-14 h-14 md:w-16 md:h-16 mx-auto mb-2 md:mb-4 rounded-xl bg-white flex items-center justify-center overflow-hidden p-1">
              <img src="/logo.png" alt="شعار المركز" className="w-12 h-12 md:w-14 md:h-14 object-contain" />
            </div>
            <CardTitle className="text-xl md:text-2xl font-bold text-white font-cairo flex items-center justify-center gap-2">
              <rolePage.icon className="w-5 h-5 md:w-6 md:h-6 text-emerald-400" />
              {rolePage.title}
            </CardTitle>
            <CardDescription className="text-slate-400 text-sm md:text-base">
              {rolePage.description}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 md:p-6 pt-0">
            <form onSubmit={handleSubmit} className="space-y-4 md:space-y-6">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-slate-300 text-sm md:text-base">البريد الإلكتروني</Label>
                <div className="relative">
                  <Mail className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 md:w-5 md:h-5 text-slate-500" />
                  <Input
                    id="email"
                    type="email"
                    placeholder={EMAIL_PLACEHOLDER}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pr-10 bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500 text-left h-10 md:h-11 text-sm md:text-base"
                    dir="ltr"
                    required
                    data-testid="login-email-input"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-slate-300 text-sm md:text-base">كلمة المرور</Label>
                <div className="relative">
                  <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 md:w-5 md:h-5 text-slate-500" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pr-10 pl-10 bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500 h-10 md:h-11 text-sm md:text-base"
                    required
                    data-testid="login-password-input"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                    title={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4 md:w-5 md:h-5" /> : <Eye className="w-4 h-4 md:w-5 md:h-5" />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                className="w-full h-10 md:h-12 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl glow-green text-sm md:text-base"
                disabled={loading}
                data-testid="login-submit-btn"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 md:w-5 md:h-5 animate-spin" />
                ) : (
                  'دخول'
                )}
              </Button>
            </form>

            <div className="mt-4 md:mt-6 text-center space-y-2">
              {/* لا رابط إنشاء حساب هنا — روابط التسجيل يرسلها المدير لكل فئة */}
              <p className="text-slate-500 text-xs md:text-sm">
                <Link
                  to="/forgot-password"
                  className="text-amber-400 hover:text-amber-300"
                >
                  نسيت كلمة المرور؟
                </Link>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Login;
