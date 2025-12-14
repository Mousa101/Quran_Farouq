import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { RadioGroup, RadioGroupItem } from '../components/ui/radio-group';
import { BookOpen, Mail, Lock, User, Loader2, GraduationCap, Shield, Users, Key, Building, Calendar, Image } from 'lucide-react';
import { toast } from 'sonner';

const Register = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'student',
    registrationCode: '',
    mosqueName: '',
    schoolName: '',
    schoolGrade: '',
    birthDate: '',
    profileImage: ''
  });
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        handleChange('profileImage', event.target.result.split(',')[1]);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if ((formData.role === 'sheikh' || formData.role === 'admin') && !formData.registrationCode.trim()) {
      toast.error('كود التسجيل مطلوب للشيخ والمدير');
      return;
    }
    
    setLoading(true);

    try {
      const user = await register(
        formData.name, 
        formData.email, 
        formData.password, 
        formData.role, 
        formData.registrationCode,
        formData.mosqueName,
        formData.schoolName,
        formData.schoolGrade,
        formData.birthDate,
        formData.profileImage
      );
      toast.success(`مرحباً ${user.name}، تم إنشاء حسابك بنجاح`);
      navigate('/dashboard');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل إنشاء الحساب');
    } finally {
      setLoading(false);
    }
  };

  const roles = [
    { value: 'student', label: 'طالب', icon: GraduationCap, needsCode: false },
    { value: 'sheikh', label: 'شيخ', icon: Users, needsCode: true },
    { value: 'admin', label: 'مدير', icon: Shield, needsCode: true },
  ];

  const needsCode = formData.role === 'sheikh' || formData.role === 'admin';
  const isStudent = formData.role === 'student';

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
      <div className="w-full lg:w-1/2 flex items-center justify-center p-4 overflow-y-auto">
        <Card className="w-full max-w-md glass-card animate-fadeIn my-4">
          <CardHeader className="text-center space-y-2 pb-4">
            <div className="lg:hidden w-14 h-14 mx-auto mb-2 rounded-xl bg-emerald-500/20 flex items-center justify-center">
              <BookOpen className="w-7 h-7 text-emerald-400" />
            </div>
            <CardTitle className="text-xl font-bold text-white font-cairo">إنشاء حساب</CardTitle>
            <CardDescription className="text-slate-400 text-sm">أنشئ حسابك للبدء</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Role Selection */}
              <div className="space-y-2">
                <Label className="text-slate-300 text-sm">نوع الحساب</Label>
                <RadioGroup value={formData.role} onValueChange={(v) => handleChange('role', v)} className="grid grid-cols-3 gap-2">
                  {roles.map((r) => (
                    <div key={r.value}>
                      <RadioGroupItem value={r.value} id={r.value} className="peer sr-only" data-testid={`role-${r.value}`} />
                      <Label
                        htmlFor={r.value}
                        className="flex flex-col items-center justify-center p-2 rounded-lg border-2 border-slate-700 bg-slate-800/30 cursor-pointer transition-all peer-data-[state=checked]:border-emerald-500 peer-data-[state=checked]:bg-emerald-500/10 hover:bg-slate-800/50"
                      >
                        <r.icon className="w-5 h-5 mb-1 text-slate-400" />
                        <span className="text-xs font-medium text-white">{r.label}</span>
                        {r.needsCode && <span className="text-[10px] text-amber-400">يحتاج كود</span>}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>

              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-slate-300 text-sm">الاسم</Label>
                  <div className="relative">
                    <User className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <Input
                      type="text"
                      placeholder="الاسم الكامل"
                      value={formData.name}
                      onChange={(e) => handleChange('name', e.target.value)}
                      className="pr-8 h-9 text-sm bg-slate-800/50 border-slate-700 text-white"
                      required
                      data-testid="register-name-input"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-slate-300 text-sm">البريد</Label>
                  <div className="relative">
                    <Mail className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <Input
                      type="email"
                      placeholder="email@example.com"
                      value={formData.email}
                      onChange={(e) => handleChange('email', e.target.value)}
                      className="pr-8 h-9 text-sm bg-slate-800/50 border-slate-700 text-white text-left"
                      dir="ltr"
                      required
                      data-testid="register-email-input"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-slate-300 text-sm">كلمة المرور</Label>
                <div className="relative">
                  <Lock className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <Input
                    type="password"
                    placeholder="••••••••"
                    value={formData.password}
                    onChange={(e) => handleChange('password', e.target.value)}
                    className="pr-8 h-9 text-sm bg-slate-800/50 border-slate-700 text-white"
                    required
                    minLength={6}
                    data-testid="register-password-input"
                  />
                </div>
              </div>

              {/* Registration Code for Sheikh/Admin */}
              {needsCode && (
                <div className="space-y-1 animate-fadeIn">
                  <Label className="text-slate-300 text-sm flex items-center gap-1">
                    <Key className="w-3 h-3 text-amber-400" />
                    كود التسجيل
                  </Label>
                  <Input
                    type="text"
                    placeholder="الكود من 6 أرقام"
                    value={formData.registrationCode}
                    onChange={(e) => handleChange('registrationCode', e.target.value)}
                    className="h-9 text-sm bg-slate-800/50 border-amber-500/50 text-white text-center tracking-widest"
                    maxLength={6}
                    required
                    data-testid="registration-code-input"
                  />
                </div>
              )}

              {/* Student Extra Fields */}
              {isStudent && (
                <div className="space-y-3 p-3 rounded-lg bg-slate-800/30 border border-slate-700/50 animate-fadeIn">
                  <p className="text-xs text-emerald-400 font-medium">معلومات الطالب (اختياري)</p>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-slate-400 text-xs">المسجد</Label>
                      <Input
                        type="text"
                        placeholder="اسم المسجد"
                        value={formData.mosqueName}
                        onChange={(e) => handleChange('mosqueName', e.target.value)}
                        className="h-8 text-xs bg-slate-800/50 border-slate-700 text-white"
                        data-testid="mosque-input"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-slate-400 text-xs">تاريخ الميلاد</Label>
                      <Input
                        type="date"
                        value={formData.birthDate}
                        onChange={(e) => handleChange('birthDate', e.target.value)}
                        className="h-8 text-xs bg-slate-800/50 border-slate-700 text-white"
                        data-testid="birthdate-input"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-slate-400 text-xs">المدرسة</Label>
                      <Input
                        type="text"
                        placeholder="اسم المدرسة"
                        value={formData.schoolName}
                        onChange={(e) => handleChange('schoolName', e.target.value)}
                        className="h-8 text-xs bg-slate-800/50 border-slate-700 text-white"
                        data-testid="school-input"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-slate-400 text-xs">المعدل</Label>
                      <Input
                        type="text"
                        placeholder="مثال: 95%"
                        value={formData.schoolGrade}
                        onChange={(e) => handleChange('schoolGrade', e.target.value)}
                        className="h-8 text-xs bg-slate-800/50 border-slate-700 text-white"
                        data-testid="grade-input"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-slate-400 text-xs flex items-center gap-1">
                      <Image className="w-3 h-3" />
                      صورة شخصية
                    </Label>
                    <Input
                      type="file"
                      accept="image/*"
                      onChange={handleImageChange}
                      className="h-8 text-xs bg-slate-800/50 border-slate-700 text-white file:bg-emerald-500/20 file:text-emerald-400 file:border-0 file:text-xs"
                      data-testid="profile-image-input"
                    />
                  </div>
                </div>
              )}

              <Button
                type="submit"
                className="w-full h-10 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl"
                disabled={loading}
                data-testid="register-submit-btn"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'إنشاء الحساب'}
              </Button>
            </form>

            <div className="mt-4 text-center">
              <p className="text-slate-400 text-sm">
                لديك حساب؟{' '}
                <Link to="/login" className="text-emerald-400 hover:text-emerald-300 font-medium" data-testid="login-link">
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
