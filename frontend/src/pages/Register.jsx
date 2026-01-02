import { useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { BookOpen, Mail, Lock, User, Loader2, Phone, Calendar, School, Home, CheckCircle, Key, Image, Upload, UserPlus, GraduationCap, Shield, Briefcase } from 'lucide-react';
import { toast } from 'sonner';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const Register = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(1); // 1: Registration, 2: Waiting/Activation
  const [loading, setLoading] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState('');
  const [activationCode, setActivationCode] = useState('');
  const [selectedRole, setSelectedRole] = useState('student');
  const fileInputRef = useRef(null);
  const [imagePreview, setImagePreview] = useState(null);
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    mosqueName: '',
    schoolName: '',
    birthDate: '',
    joinDate: '',
    schoolGrade: '',
    school_average:'',
    studentPhone: '',
    fatherPhone: '',
    motherPhone: '',
    profileImage: '',
    // Sheikh/Admin specific
    specialization: '',
    experienceYears: ''
  });

  const roles = [
    { id: 'student', label: 'طالب', icon: GraduationCap, color: 'emerald', description: 'التسجيل كطالب في حلقات التحفيظ' },
    { id: 'sheikh', label: 'معلم', icon: BookOpen, color: 'blue', description: 'التسجيل كمعلم قرآن كريم' },
    { id: 'admin', label: 'مدير', icon: Shield, color: 'purple', description: 'التسجيل كمدير للمركز' }
  ];

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // رفع الصورة
  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // التحقق من نوع الملف
    if (!file.type.startsWith('image/')) {
      toast.error('يرجى اختيار صورة صالحة');
      return;
    }

    // التحقق من حجم الملف (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('حجم الصورة يجب أن يكون أقل من 5 ميجابايت');
      return;
    }

    setUploadingImage(true);

    try {
      // تحويل الصورة إلى base64
      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64 = event.target.result;
        setImagePreview(base64);
        setFormData(prev => ({ ...prev, profileImage: base64 }));
        setUploadingImage(false);
        toast.success('تم تحميل الصورة بنجاح');
      };
      reader.onerror = () => {
        toast.error('فشل في قراءة الصورة');
        setUploadingImage(false);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      toast.error('فشل في تحميل الصورة');
      setUploadingImage(false);
    }
  };

  // إزالة الصورة
  const removeImage = () => {
    setImagePreview(null);
    setFormData(prev => ({ ...prev, profileImage: '' }));
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (formData.password !== formData.confirmPassword) {
      toast.error('كلمات المرور غير متطابقة');
      return;
    }
    
    if (formData.password.length < 6) {
      toast.error('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
      return;
    }
    
    setLoading(true);
    
    try {
      const payload = {
        name: formData.name,
        email: formData.email,
        password: formData.password,
        confirm_password: formData.confirmPassword,
        role: selectedRole,
        mosque_name: formData.mosqueName,
        birth_date: formData.birthDate,
        join_date: formData.joinDate,
        student_phone: formData.studentPhone,
        profile_image: formData.profileImage
      };

      // Add role-specific fields
      if (selectedRole === 'student') {
        payload.school_name = formData.schoolName;
        payload.school_grade = formData.schoolGrade;
        payload.father_phone = formData.fatherPhone;
        payload.mother_phone = formData.motherPhone;
        payload.school_average = formData.school_average ? parseInt(formData.school_average) : null;
      } else if (selectedRole === 'sheikh' || selectedRole === 'admin') {
        payload.specialization = formData.specialization;
        payload.experience_years = formData.experienceYears ? parseInt(formData.experienceYears) : null;
      }

      const response = await axios.post(`${API}/auth/register`, payload);
      
      const roleLabel = selectedRole === 'student' ? 'طالب' : (selectedRole === 'sheikh' ? 'معلم' : 'مدير');
      toast.success(`تم تسجيل بياناتك كـ${roleLabel} بنجاح`);
      setRegisteredEmail(formData.email);
      setStep(2);
    } catch (error) {
      // Handle error - detail might be string or object
      const detail = error.response?.data?.detail;
      let errorMessage = 'فشل التسجيل';
      
      if (typeof detail === 'string') {
        errorMessage = detail;
      } else if (Array.isArray(detail)) {
        errorMessage = detail.map(d => d.msg || d).join(', ');
      } else if (detail && typeof detail === 'object') {
        errorMessage = detail.msg || detail.message || JSON.stringify(detail);
      }
      
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleActivate = async (e) => {
    e.preventDefault();
    
    if (activationCode.length !== 6) {
      toast.error('كود التفعيل يجب أن يكون 6 أرقام');
      return;
    }
    
    setLoading(true);
    
    try {
      const response = await axios.post(`${API}/auth/activate`, {
        email: registeredEmail,
        activation_code: activationCode
      });
      
      // Save token and redirect
      localStorage.setItem('token', response.data.token);
      axios.defaults.headers.common['Authorization'] = `Bearer ${response.data.token}`;
      
      toast.success('تم تفعيل حسابك بنجاح!');
      window.location.href = '/dashboard';
    } catch (error) {
      toast.error(error.response?.data?.detail || 'كود التفعيل غير صحيح');
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Waiting for activation
  if (step === 2) {
    return (
      <div className="min-h-screen bg-background pattern-overlay flex items-center justify-center p-4">
        <Card className="w-full max-w-md glass-card animate-fadeIn">
          <CardHeader className="text-center space-y-4">
            <div className="w-20 h-20 mx-auto rounded-full bg-amber-500/20 flex items-center justify-center">
              <Key className="w-10 h-10 text-amber-400" />
            </div>
            <CardTitle className="text-2xl font-bold text-white font-cairo">
              في انتظار التفعيل
            </CardTitle>
            <CardDescription className="text-slate-400">
              تم تسجيل بياناتك بنجاح!
              <br />
              يرجى التواصل مع إدارة المركز للحصول على كود التفعيل
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleActivate} className="space-y-6">
              <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700">
                <p className="text-sm text-slate-400 mb-2">بريدك الإلكتروني:</p>
                <p className="text-emerald-400 font-medium">{registeredEmail}</p>
              </div>
              
              <div className="space-y-2">
                <Label className="text-slate-300">كود التفعيل</Label>
                <Input
                  type="text"
                  placeholder="أدخل الكود من 6 أرقام"
                  value={activationCode}
                  onChange={(e) => setActivationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="text-center text-2xl tracking-[0.5em] bg-slate-800 border-emerald-500/50 text-white h-14"
                  maxLength={6}
                />
              </div>
              
              <Button
                type="submit"
                className="w-full h-12 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl"
                disabled={loading || activationCode.length !== 6}
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                  <>
                    <CheckCircle className="w-5 h-5 ml-2" />
                    تفعيل الحساب
                  </>
                )}
              </Button>
            </form>
            
            <div className="mt-6 text-center">
              <Link to="/login" className="text-slate-400 hover:text-white text-sm">
                العودة لتسجيل الدخول
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Step 1: Registration Form
  return (
    <div className="min-h-screen bg-background pattern-overlay flex">
      {/* Left side - Image */}
      <div className="hidden lg:flex lg:w-1/2 relative">
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-900/80 via-slate-900/90 to-background" />
        <img
          src="/backGround_url.png"
          alt="Mosque"
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center p-8">
            <div className="w-32 h-32 mx-auto mb-6 rounded-full bg-white/10 backdrop-blur-xl border border-white/20 flex items-center justify-center overflow-hidden">
              <img src="/logo.png" alt="شعار المركز" className="w-28 h-28 object-contain" />
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
        <Card className="w-full max-w-lg glass-card animate-fadeIn my-4">
          <CardHeader className="text-center space-y-2 pb-4">
            <div className="lg:hidden w-20 h-20 mx-auto mb-2 rounded-full bg-white/10 flex items-center justify-center overflow-hidden">
              <img src="/logo.png" alt="شعار المركز" className="w-16 h-16 object-contain" />
            </div>
            <CardTitle className="text-xl font-bold text-white font-cairo">تسجيل مستخدم جديد</CardTitle>
            <CardDescription className="text-slate-400 text-sm">اختر نوع حسابك وأدخل بياناتك</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Role Selection */}
              <div className="space-y-2">
                <Label className="text-slate-300 text-sm">نوع الحساب <span className="text-red-400">*</span></Label>
                <div className="grid grid-cols-3 gap-2">
                  {roles.map((role) => (
                    <button
                      key={role.id}
                      type="button"
                      onClick={() => setSelectedRole(role.id)}
                      className={`p-3 rounded-xl border-2 transition-all duration-200 flex flex-col items-center gap-1 ${
                        selectedRole === role.id
                          ? `bg-${role.color}-500/20 border-${role.color}-500 text-${role.color}-400`
                          : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:border-slate-600'
                      }`}
                      style={{
                        backgroundColor: selectedRole === role.id ? `var(--${role.color}-500-20, rgba(16, 185, 129, 0.2))` : undefined,
                        borderColor: selectedRole === role.id ? 
                          (role.color === 'emerald' ? '#10b981' : role.color === 'blue' ? '#3b82f6' : '#a855f7') 
                          : undefined,
                        color: selectedRole === role.id ? 
                          (role.color === 'emerald' ? '#34d399' : role.color === 'blue' ? '#60a5fa' : '#c084fc') 
                          : undefined
                      }}
                    >
                      <role.icon className="w-5 h-5" />
                      <span className="text-xs font-medium">{role.label}</span>
                    </button>
                  ))}
                </div>
                <p className="text-slate-500 text-[10px] text-center">
                  {roles.find(r => r.id === selectedRole)?.description}
                </p>
              </div>

              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-slate-300 text-sm">الاسم الكامل <span className="text-red-400">*</span></Label>
                  <div className="relative">
                    <User className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <Input
                      type="text"
                      placeholder="الاسم الرباعي"
                      value={formData.name}
                      onChange={(e) => handleChange('name', e.target.value)}
                      className="pr-8 h-9 text-sm bg-slate-800/50 border-slate-700 text-white"
                      required
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-slate-300 text-sm">البريد الإلكتروني <span className="text-red-400">*</span></Label>
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
                    />
                  </div>
                </div>
              </div>

              {/* Password */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-slate-300 text-sm">كلمة المرور <span className="text-red-400">*</span></Label>
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
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-slate-300 text-sm">تأكيد كلمة المرور <span className="text-red-400">*</span></Label>
                  <div className="relative">
                    <Lock className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <Input
                      type="password"
                      placeholder="••••••••"
                      value={formData.confirmPassword}
                      onChange={(e) => handleChange('confirmPassword', e.target.value)}
                      className="pr-8 h-9 text-sm bg-slate-800/50 border-slate-700 text-white"
                      required
                      minLength={6}
                    />
                  </div>
                </div>
              </div>

              {/* Sheikh/Admin specific fields */}
              {(selectedRole === 'sheikh' || selectedRole === 'admin') && (
                <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
                  <div className="space-y-1">
                    <Label className="text-blue-300 text-sm flex items-center gap-1">
                      <Briefcase className="w-3 h-3" />
                      التخصص
                    </Label>
                    <Input
                      type="text"
                      placeholder={selectedRole === 'sheikh' ? "مثال: تجويد، حفظ" : "مثال: إدارة تعليمية"}
                      value={formData.specialization}
                      onChange={(e) => handleChange('specialization', e.target.value)}
                      className="h-9 text-sm bg-slate-800/50 border-slate-700 text-white"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-blue-300 text-sm flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      سنوات الخبرة
                    </Label>
                    <Input
                      type="number"
                      placeholder="مثال: 5"
                      min="0"
                      max="50"
                      value={formData.experienceYears}
                      onChange={(e) => handleChange('experienceYears', e.target.value)}
                      className="h-9 text-sm bg-slate-800/50 border-slate-700 text-white"
                    />
                  </div>
                </div>
              )}

              {/* Phone Numbers - Different for students vs others */}
              {selectedRole === 'student' ? (
                <div className="space-y-2">
                  <Label className="text-slate-400 text-xs flex items-center gap-1">
                    <Phone className="w-3 h-3" />
                    أرقام الهواتف
                  </Label>
                  <div className="grid grid-cols-3 gap-2">
                    <Input
                      type="tel"
                      placeholder="هاتف الطالب"
                      value={formData.studentPhone}
                      onChange={(e) => handleChange('studentPhone', e.target.value)}
                      className="h-8 text-xs bg-slate-800/50 border-slate-700 text-white text-left"
                      dir="ltr"
                    />
                    <Input
                      type="tel"
                      placeholder="هاتف الأب"
                      value={formData.fatherPhone}
                      onChange={(e) => handleChange('fatherPhone', e.target.value)}
                      className="h-8 text-xs bg-slate-800/50 border-slate-700 text-white text-left"
                      dir="ltr"
                    />
                    <Input
                      type="tel"
                      placeholder="هاتف الأم"
                      value={formData.motherPhone}
                      onChange={(e) => handleChange('motherPhone', e.target.value)}
                      className="h-8 text-xs bg-slate-800/50 border-slate-700 text-white text-left"
                      dir="ltr"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-1">
                  <Label className="text-slate-400 text-xs flex items-center gap-1">
                    <Phone className="w-3 h-3" />
                    رقم الهاتف
                  </Label>
                  <Input
                    type="tel"
                    placeholder="رقم الهاتف"
                    value={formData.studentPhone}
                    onChange={(e) => handleChange('studentPhone', e.target.value)}
                    className="h-8 text-xs bg-slate-800/50 border-slate-700 text-white text-left"
                    dir="ltr"
                  />
                </div>
              )}

              {/* Mosque & Birth Date */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-slate-400 text-xs flex items-center gap-1">
                    <Home className="w-3 h-3" />
                    المسجد
                  </Label>
                  <Input
                    type="text"
                    placeholder="اسم المسجد"
                    value={formData.mosqueName}
                    onChange={(e) => handleChange('mosqueName', e.target.value)}
                    className="h-8 text-xs bg-slate-800/50 border-slate-700 text-white"
                  />
                </div>
                <div className="space-y-1">
                    <Label className="text-slate-400 text-xs flex items-center gap-1">
                      <School className="w-3 h-3" />
                      المدرسة
                    </Label>
                    <Input
                      type="text"
                      placeholder="اسم المدرسة"
                      value={formData.schoolName}
                      onChange={(e) => handleChange('schoolName', e.target.value)}
                      className="h-8 text-xs bg-slate-800/50 border-slate-700 text-white"
                    />
                  </div>
                
              </div>

              {/* School & Grade - Students only */}
              {selectedRole === 'student' && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-slate-400 text-xs">الصف الدراسي</Label>
                    <Input
                      type="text"
                      placeholder="مثال: الصف السادس"
                      value={formData.schoolGrade}
                      onChange={(e) => handleChange('schoolGrade', e.target.value)}
                      className="h-8 text-xs bg-slate-800/50 border-slate-700 text-white"
                    />
                  </div>
                 <div className="space-y-1">
              <Label className="text-slate-400 text-xs">المعدل الدراسي</Label>
              <Input
                type="text"
                value={formData.school_average}
                onChange={(e) => handleChange('school_average', e.target.value)}
                placeholder="مثال: 95%"
                className="h-8 text-xs bg-slate-800/50 border-slate-700 text-white"
                    
              />
            </div>
                
                </div>
              )}

              {/* Join Date */}
              <div className="space-y-1">
                  <Label className="text-slate-400 text-xs flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    تاريخ الميلاد
                  </Label>
                  <Input
                    type="date"
                    value={formData.birthDate}
                    onChange={(e) => handleChange('birthDate', e.target.value)}
                    className="h-8 text-xs bg-slate-800/50 border-slate-700 text-white"
                  />
                </div>  
              <div className="space-y-1">
                <Label className="text-slate-400 text-xs flex items-center gap-1">
                  <UserPlus className="w-3 h-3" />
                  تاريخ الالتحاق بالمركز
                </Label>
                <Input
                  type="date"
                  value={formData.joinDate}
                  onChange={(e) => handleChange('joinDate', e.target.value)}
                  className="h-8 text-xs bg-slate-800/50 border-slate-700 text-white"
                />
              </div>

              {/* Profile Image Upload */}
              <div className="space-y-2">
                <Label className="text-slate-400 text-xs flex items-center gap-1">
                  <Image className="w-3 h-3" />
                  الصورة الشخصية (اختياري)
                </Label>
                <div className="flex items-center gap-3">
                  {/* معاينة الصورة */}
                  {imagePreview ? (
                    <div className="relative">
                      <img 
                        src={imagePreview} 
                        alt="معاينة" 
                        className="w-16 h-16 rounded-xl object-cover border-2 border-emerald-500/30"
                      />
                      <button
                        type="button"
                        onClick={removeImage}
                        className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center hover:bg-red-600"
                      >
                        ×
                      </button>
                    </div>
                  ) : (
                    <div 
                      onClick={() => fileInputRef.current?.click()}
                      className="w-16 h-16 rounded-xl bg-slate-800/50 border-2 border-dashed border-slate-600 flex items-center justify-center cursor-pointer hover:border-emerald-500/50 transition-colors"
                    >
                      {uploadingImage ? (
                        <Loader2 className="w-6 h-6 text-slate-500 animate-spin" />
                      ) : (
                        <Upload className="w-6 h-6 text-slate-500" />
                      )}
                    </div>
                  )}
                  
                  {/* زر الرفع */}
                  <div className="flex-1">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="hidden"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingImage}
                      className="h-8 text-xs bg-slate-800/50 border-slate-600 text-slate-300 hover:bg-slate-700"
                    >
                      {uploadingImage ? (
                        <>
                          <Loader2 className="w-3 h-3 ml-1 animate-spin" />
                          جاري الرفع...
                        </>
                      ) : (
                        <>
                          <Upload className="w-3 h-3 ml-1" />
                          {imagePreview ? 'تغيير الصورة' : 'اختر صورة'}
                        </>
                      )}
                    </Button>
                    <p className="text-slate-500 text-[10px] mt-1">الحد الأقصى: 5 ميجابايت</p>
                  </div>
                </div>
              </div>

              {/* Notice */}
              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                <p className="text-xs text-amber-300">
                  <strong>ملاحظة:</strong> بعد التسجيل، ستحتاج للحصول على كود التفعيل من إدارة المركز لتتمكن من استخدام حسابك.
                </p>
              </div>

              <Button
                type="submit"
                className="w-full h-10 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl"
                disabled={loading}
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'تسجيل البيانات'}
              </Button>
            </form>

            <div className="mt-4 text-center">
              <p className="text-slate-400 text-sm">
                لديك حساب؟{' '}
                <Link to="/login" className="text-emerald-400 hover:text-emerald-300 font-medium">
                  سجل الدخول
                </Link>
              </p>
              <div className="flex items-center justify-center gap-3 mt-2">
                <Link to="/activate" className="text-emerald-400 hover:text-emerald-300 text-xs">
                  لديك كود تفعيل؟
                </Link>
                <span className="text-slate-600">|</span>
                <Link to="/forgot-password" className="text-amber-400 hover:text-amber-300 text-xs">
                  نسيت كلمة المرور؟
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Register;
