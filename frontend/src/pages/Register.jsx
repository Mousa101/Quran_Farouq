import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { RadioGroup, RadioGroupItem } from '../components/ui/radio-group';
import { BookOpen, Mail, Lock, User, Loader2, GraduationCap, Shield, Users, Key } from 'lucide-react';
import { toast } from 'sonner';

const Register = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('student');
  const [registrationCode, setRegistrationCode] = useState('');
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validate code for sheikh/admin
    if ((role === 'sheikh' || role === 'admin') && !registrationCode.trim()) {
      toast.error('كود التسجيل مطلوب للشيخ والمدير');
      return;
    }
    
    setLoading(true);

    try {
      const user = await register(name, email, password, role, registrationCode);
      toast.success(`مرحباً ${user.name}، تم إنشاء حسابك بنجاح`);
      navigate('/dashboard');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل إنشاء الحساب');
    } finally {
      setLoading(false);
    }
  };

  const roles = [
    { value: 'student', label: 'طالب', icon: GraduationCap, description: 'طالب حفظ القرآن', needsCode: false },
    { value: 'sheikh', label: 'شيخ', icon: Users, description: 'معلم ومحفظ', needsCode: true },
    { value: 'admin', label: 'مدير', icon: Shield, description: 'إدارة المركز', needsCode: true },
  ];

  const needsCode = role === 'sheikh' || role === 'admin';

  return (
    <div className="min-h-screen bg-background pattern-overlay flex">
      {/* Left side - Image */}
      <div className="hidden lg:flex lg:w-1/2 relative">
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-900/80 via-slate-900/90 to-background" />
        <img
          src="https://images.unsplash.com/photo-1565221406225-40d1b01a52d6?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDk1ODF8MHwxfHNlYXJjaHwxfHxtb2Rlcm4lMjBtb3NxdWUlMjBhcmNoaXRlY3R1cmUlMjBpbnRlcmlvciUyMGRhcmt8ZW58MHx8fHwxNzY1NTY0OTY5fDA&ixlib=rb-4.1.0&q=85"
          alt="Mosque"
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center p-8">
            <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-emerald-500/20 backdrop-blur-xl border border-emerald-500/30 flex items-center justify-center">
              <BookOpen className="w-10 h-10 text-emerald-400" />
            </div>
            <h1 className="text-4xl font-bold text-white mb-2 font-cairo">مركز الفاروق</h1>
            <h2 className="text-2xl font-bold text-emerald-400 mb-4 font-cairo">القرآني</h2>
            <p className="text-lg text-slate-300 max-w-md">
              ابدأ رحلتك في حفظ كتاب الله
            </p>
          </div>
        </div>
      </div>

      {/* Right side - Register Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8">
        <Card className="w-full max-w-md glass-card animate-fadeIn">
          <CardHeader className="text-center space-y-2">
            <div className="lg:hidden w-16 h-16 mx-auto mb-4 rounded-xl bg-emerald-500/20 flex items-center justify-center">
              <BookOpen className="w-8 h-8 text-emerald-400" />
            </div>
            <CardTitle className="text-2xl font-bold text-white font-cairo">إنشاء حساب</CardTitle>
            <CardDescription className="text-slate-400">
              أنشئ حسابك للبدء
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-slate-300">الاسم الكامل</Label>
                <div className="relative">
                  <User className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                  <Input
                    id="name"
                    type="text"
                    placeholder="أحمد محمد"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="pr-10 bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500"
                    required
                    data-testid="register-name-input"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email" className="text-slate-300">البريد الإلكتروني</Label>
                <div className="relative">
                  <Mail className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="example@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pr-10 bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500 text-left"
                    dir="ltr"
                    required
                    data-testid="register-email-input"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-slate-300">كلمة المرور</Label>
                <div className="relative">
                  <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pr-10 bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500"
                    required
                    minLength={6}
                    data-testid="register-password-input"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <Label className="text-slate-300">نوع الحساب</Label>
                <RadioGroup value={role} onValueChange={setRole} className="grid grid-cols-3 gap-3">
                  {roles.map((r) => (
                    <div key={r.value}>
                      <RadioGroupItem
                        value={r.value}
                        id={r.value}
                        className="peer sr-only"
                        data-testid={`role-${r.value}`}
                      />
                      <Label
                        htmlFor={r.value}
                        className="flex flex-col items-center justify-center p-3 rounded-xl border-2 border-slate-700 bg-slate-800/30 cursor-pointer transition-all peer-data-[state=checked]:border-emerald-500 peer-data-[state=checked]:bg-emerald-500/10 hover:bg-slate-800/50"
                      >
                        <r.icon className="w-6 h-6 mb-2 text-slate-400 peer-data-[state=checked]:text-emerald-400" />
                        <span className="text-sm font-medium text-white">{r.label}</span>
                        {r.needsCode && (
                          <span className="text-xs text-amber-400 mt-1">يحتاج كود</span>
                        )}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>

              {/* Registration Code for Sheikh/Admin */}
              {needsCode && (
                <div className="space-y-2 animate-fadeIn">
                  <Label htmlFor="code" className="text-slate-300 flex items-center gap-2">
                    <Key className="w-4 h-4 text-amber-400" />
                    كود التسجيل
                  </Label>
                  <Input
                    id="code"
                    type="text"
                    placeholder="أدخل الكود المكون من 6 أرقام"
                    value={registrationCode}
                    onChange={(e) => setRegistrationCode(e.target.value)}
                    className="bg-slate-800/50 border-amber-500/50 text-white placeholder:text-slate-500 text-center text-lg tracking-widest"
                    maxLength={6}
                    required
                    data-testid="registration-code-input"
                  />
                  <p className="text-xs text-amber-400/80">
                    * احصل على كود التسجيل من مدير المركز
                  </p>
                </div>
              )}

              <Button
                type="submit"
                className="w-full h-12 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl glow-green"
                disabled={loading}
                data-testid="register-submit-btn"
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  'إنشاء الحساب'
                )}
              </Button>
            </form>

            <div className="mt-6 text-center">
              <p className="text-slate-400">
                لديك حساب بالفعل؟{' '}
                <Link 
                  to="/login" 
                  className="text-emerald-400 hover:text-emerald-300 font-medium"
                  data-testid="login-link"
                >
                  سجل الدخول
                </Link>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Register;
