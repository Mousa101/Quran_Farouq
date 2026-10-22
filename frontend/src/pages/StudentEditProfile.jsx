import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { User, Phone, School, Camera, Save, ArrowRight, Loader2, Calendar, Building, X } from 'lucide-react';
import { toast } from 'sonner';
import { MOSQUES, MOSQUE_OTHER, SCHOOL_GRADES, PHONE_PLACEHOLDER, normalizePhone, phoneError } from '../lib/constants';
import { defaultAvatar, readImageFile } from '../lib/avatar';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const StudentEditProfile = () => {
  const navigate = useNavigate();
  const { user, updateUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mosqueOther, setMosqueOther] = useState(false); // #5
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef(null);
  const [formData, setFormData] = useState({
    name: '',
    student_phone: '',
    father_phone: '',
    mother_phone: '',
    profile_image: '',
    birth_date: '',
    school_name: '',
    school_grade: '',
    school_average: '',
    mosque_name: ''
  });

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const response = await axios.get(`${API}/students/me/profile`);
      const data = response.data;
      setFormData({
        name: data.name || '',
        student_phone: data.student_phone || '',
        father_phone: data.father_phone || '',
        mother_phone: data.mother_phone || '',
        profile_image: data.profile_image || '',
        birth_date: data.birth_date || '',
        school_name: data.school_name || '',
        school_grade: data.school_grade || '',
        school_average: data.school_average || '',
        mosque_name: data.mosque_name || ''
      });
      // #5 إذا المسجد المحفوظ خارج القائمة، اعتبره "أخرى" وأظهر حقل الكتابة
      const savedMosque = data.mosque_name || '';
      setMosqueOther(!!savedMosque && !MOSQUES.slice(0, -1).includes(savedMosque));
    } catch (error) {
      console.error('Error:', error);
      toast.error('فشل في تحميل البيانات');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handlePhoneChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: normalizePhone(value) }));
  };

  // رفع الصورة الشخصية من ملف (تُصغَّر قبل الحفظ)
  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('يرجى اختيار صورة صالحة');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('حجم الصورة يجب أن يكون أقل من 5 ميجابايت');
      return;
    }
    setUploadingImage(true);
    try {
      const dataUrl = await readImageFile(file);
      setFormData(prev => ({ ...prev, profile_image: dataUrl }));
      toast.success('تم تحميل الصورة — اضغط «حفظ التغييرات» لاعتمادها');
    } catch (error) {
      toast.error('فشل في قراءة الصورة');
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeImage = () => setFormData(prev => ({ ...prev, profile_image: '' }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validation
    if (!formData.name || !formData.name.trim()) {
      toast.error('الاسم مطلوب');
      return;
    }
    const badPhone = phoneError([
      ['رقم هاتف الطالب', formData.student_phone],
      ['رقم هاتف الأب', formData.father_phone],
      ['رقم هاتف الأم', formData.mother_phone],
    ]);
    if (badPhone) {
      toast.error(badPhone);
      return;
    }
    
    setSaving(true);
    try {
      const response = await axios.put(`${API}/students/me/profile`, formData);
      toast.success(response.data.message || 'تم تحديث بياناتك بنجاح');
      
      // Update local user context if name changed
      if (formData.name && updateUser) {
        updateUser({ ...user, name: formData.name });
      }
    } catch (error) {
      console.error('Error:', error);
      const errorMsg = error.response?.data?.detail || 'فشل في تحديث البيانات';
      toast.error(errorMsg);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn max-w-2xl mx-auto" data-testid="student-edit-profile">
      {/* Back Button */}
      <Button
        variant="ghost"
        onClick={() => navigate(-1)}
        className="text-slate-400 hover:text-white"
      >
        <ArrowRight className="w-5 h-5 ml-2" />
        رجوع
      </Button>

      <Card className="glass-card border-white/10">
        <CardHeader>
          <CardTitle className="text-xl font-bold text-white flex items-center gap-3">
            <User className="w-6 h-6 text-emerald-400" />
            تعديل بياناتي الشخصية
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* الصورة الشخصية — رفع ملف */}
            <div className="flex flex-col items-center gap-3">
              <div className="relative">
                <img
                  src={formData.profile_image || defaultAvatar('student')}
                  alt="صورة شخصية"
                  className="w-28 h-28 rounded-2xl object-cover border-2 border-emerald-500/30"
                />
                {formData.profile_image && (
                  <button
                    type="button"
                    onClick={removeImage}
                    title="إزالة الصورة"
                    className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
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
                className="border-slate-700"
              >
                {uploadingImage ? (
                  <><Loader2 className="w-4 h-4 ml-2 animate-spin" />جارٍ الرفع...</>
                ) : (
                  <><Camera className="w-4 h-4 ml-2" />{formData.profile_image ? 'تغيير الصورة' : 'رفع صورة شخصية'}</>
                )}
              </Button>
              <p className="text-xs text-slate-500">الحد الأقصى: 5 ميجابايت | JPG, PNG</p>
            </div>

            {/* Name */}
            <div className="space-y-2">
              <Label className="text-slate-300 flex items-center gap-2">
                <User className="w-4 h-4" />
                الاسم الكامل <span className="text-red-400">*</span>
              </Label>
              <Input
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="الاسم الكامل"
                className="bg-slate-800 border-slate-700 text-white"
                required
              />
            </div>

            {/* Birth Date */}
            <div className="space-y-2">
              <Label className="text-slate-300 flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                تاريخ الميلاد
              </Label>
              <Input
                name="birth_date"
                type="date"
                value={formData.birth_date}
                onChange={handleChange}
                className="bg-slate-800 border-slate-700 text-white"
                dir="ltr"
              />
            </div>

            {/* Phone Numbers Section */}
            <div className="p-4 rounded-xl bg-slate-800/50 space-y-4">
              <h3 className="text-white font-medium flex items-center gap-2">
                <Phone className="w-4 h-4 text-emerald-400" />
                أرقام الهواتف
              </h3>
              
              {/* Student Phone */}
              <div className="space-y-2">
                <Label className="text-slate-300">رقم هاتف الطالب</Label>
                <Input
                  name="student_phone"
                  type="tel"
                  inputMode="numeric"
                  value={formData.student_phone}
                  onChange={handlePhoneChange}
                  placeholder={PHONE_PLACEHOLDER}
                  className="bg-slate-800 border-slate-700 text-white"
                  dir="ltr"
                />
              </div>

              {/* Father Phone */}
              <div className="space-y-2">
                <Label className="text-slate-300">رقم هاتف الأب</Label>
                <Input
                  name="father_phone"
                  type="tel"
                  inputMode="numeric"
                  value={formData.father_phone}
                  onChange={handlePhoneChange}
                  placeholder={PHONE_PLACEHOLDER}
                  className="bg-slate-800 border-slate-700 text-white"
                  dir="ltr"
                />
              </div>

              {/* Mother Phone */}
              <div className="space-y-2">
                <Label className="text-slate-300">رقم هاتف الأم</Label>
                <Input
                  name="mother_phone"
                  type="tel"
                  inputMode="numeric"
                  value={formData.mother_phone}
                  onChange={handlePhoneChange}
                  placeholder={PHONE_PLACEHOLDER}
                  className="bg-slate-800 border-slate-700 text-white"
                  dir="ltr"
                />
              </div>
            </div>

            {/* School Section */}
            <div className="p-4 rounded-xl bg-slate-800/50 space-y-4">
              <h3 className="text-white font-medium flex items-center gap-2">
                <School className="w-4 h-4 text-blue-400" />
                بيانات المدرسة
              </h3>
              
              {/* School Name */}
              <div className="space-y-2">
                <Label className="text-slate-300">اسم المدرسة</Label>
                <Input
                  name="school_name"
                  value={formData.school_name}
                  onChange={handleChange}
                  placeholder="مثال: مدرسة الأمل الابتدائية"
                  className="bg-slate-800 border-slate-700 text-white"
                />
              </div>

              {/* School Grade */}
              <div className="space-y-2">
                <Label className="text-slate-300">الصف الدراسي</Label>
                <select
                  name="school_grade"
                  value={formData.school_grade}
                  onChange={handleChange}
                  className="w-full h-10 px-3 rounded-md bg-slate-800 border border-slate-700 text-white"
                >
                  <option value="">اختر الصف</option>
                  {SCHOOL_GRADES.map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </div>

              {/* School Average */}
              <div className="space-y-2">
                <Label className="text-slate-300">المعدل الدراسي (%)</Label>
                <div className="relative">
                  <Input
                    name="school_average"
                    inputMode="numeric"
                    value={formData.school_average}
                    onChange={(e) => setFormData((prev) => ({ ...prev, school_average: e.target.value.replace(/[^0-9.]/g, '') }))}
                    placeholder="مثال: 95"
                    className="bg-slate-800 border-slate-700 text-white pl-7"
                  />
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">%</span>
                </div>
              </div>
            </div>

            {/* Mosque Name */}
            <div className="space-y-2">
              <Label className="text-slate-300 flex items-center gap-2">
                <Building className="w-4 h-4" />
                اسم المسجد
              </Label>
              <select
                value={mosqueOther ? MOSQUE_OTHER : formData.mosque_name}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === MOSQUE_OTHER) {
                    setMosqueOther(true);
                    setFormData(prev => ({ ...prev, mosque_name: '' }));
                  } else {
                    setMosqueOther(false);
                    setFormData(prev => ({ ...prev, mosque_name: val }));
                  }
                }}
                className="w-full h-10 px-3 rounded-md bg-slate-800 border border-slate-700 text-white"
              >
                <option value="">اختر المسجد</option>
                {MOSQUES.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
              {mosqueOther && (
                <Input
                  name="mosque_name"
                  value={formData.mosque_name}
                  onChange={handleChange}
                  placeholder="اكتب اسم مسجدك"
                  className="bg-slate-800 border-slate-700 text-white mt-2"
                />
              )}
            </div>

            <Button
              type="submit"
              disabled={saving}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {saving ? (
                <>
                  <Loader2 className="w-5 h-5 ml-2 animate-spin" />
                  جارٍ الحفظ...
                </>
              ) : (
                <>
                  <Save className="w-5 h-5 ml-2" />
                  حفظ التغييرات
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default StudentEditProfile;
