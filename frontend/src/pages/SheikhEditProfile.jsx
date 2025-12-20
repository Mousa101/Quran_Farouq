import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { 
  User, Mail, Phone, Home, Calendar, Briefcase, Star,
  Save, Loader2, Upload, Camera, Check, X
} from 'lucide-react';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const SheikhEditProfile = () => {
  const { user, updateUser } = useAuth();
  const { isDark } = useTheme();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imagePreview, setImagePreview] = useState(null);
  const fileInputRef = useRef(null);
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    mosqueName: '',
    birthDate: '',
    joinDate: '',
    specialization: '',
    experienceYears: '',
    profileImage: ''
  });

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const res = await axios.get(`${API}/auth/me`);
      const userData = res.data;
      setFormData({
        name: userData.name || '',
        email: userData.email || '',
        phone: userData.student_phone || '',
        mosqueName: userData.mosque_name || '',
        birthDate: userData.birth_date || '',
        joinDate: userData.join_date || '',
        specialization: userData.specialization || '',
        experienceYears: userData.experience_years || '',
        profileImage: userData.profile_image || ''
      });
      setImagePreview(userData.profile_image || null);
    } catch (error) {
      toast.error('فشل في تحميل البيانات');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

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
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target.result;
        setImagePreview(base64);
        setFormData(prev => ({ ...prev, profileImage: base64 }));
        setUploadingImage(false);
        toast.success('تم تحميل الصورة');
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

  const removeImage = () => {
    setImagePreview(null);
    setFormData(prev => ({ ...prev, profileImage: '' }));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);

    try {
      const payload = {
        name: formData.name,
        student_phone: formData.phone,
        mosque_name: formData.mosqueName,
        birth_date: formData.birthDate,
        join_date: formData.joinDate,
        specialization: formData.specialization,
        experience_years: formData.experienceYears ? parseInt(formData.experienceYears) : null,
        profile_image: formData.profileImage
      };

      await axios.put(`${API}/users/me`, payload);
      toast.success('تم تحديث البيانات بنجاح');
      
      // Update local user data
      if (updateUser) {
        updateUser({ ...user, ...payload, profile_image: formData.profileImage });
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في تحديث البيانات');
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
    <div className="max-w-2xl mx-auto space-y-6 animate-fadeIn">
      {/* Header */}
      <div className={`p-4 md:p-6 rounded-xl ${isDark ? 'glass-card border border-white/10' : 'bg-white border border-slate-200 shadow-sm'}`}>
        <h1 className={`text-xl md:text-2xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
          تعديل بياناتي الشخصية
        </h1>
        <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
          قم بتحديث معلوماتك الشخصية وصورتك
        </p>
      </div>

      <Card className={isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'}>
        <CardContent className="p-4 md:p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Profile Image */}
            <div className="flex flex-col items-center gap-4">
              <div className="relative">
                {imagePreview ? (
                  <div className="relative">
                    <img 
                      src={imagePreview} 
                      alt="صورة شخصية" 
                      className="w-28 h-28 md:w-32 md:h-32 rounded-2xl object-cover border-4 border-blue-500/30"
                    />
                    <button
                      type="button"
                      onClick={removeImage}
                      className="absolute -top-2 -right-2 w-7 h-7 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div 
                    onClick={() => fileInputRef.current?.click()}
                    className={`w-28 h-28 md:w-32 md:h-32 rounded-2xl flex flex-col items-center justify-center cursor-pointer transition-colors border-2 border-dashed ${
                      isDark ? 'bg-slate-800/50 border-slate-600 hover:border-blue-500' : 'bg-slate-100 border-slate-300 hover:border-blue-500'
                    }`}
                  >
                    {uploadingImage ? (
                      <Loader2 className="w-8 h-8 text-slate-500 animate-spin" />
                    ) : (
                      <>
                        <Camera className="w-8 h-8 text-slate-500 mb-1" />
                        <span className="text-xs text-slate-500">إضافة صورة</span>
                      </>
                    )}
                  </div>
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
                className={isDark ? 'border-slate-700' : ''}
              >
                {uploadingImage ? (
                  <><Loader2 className="w-4 h-4 ml-2 animate-spin" />جاري الرفع...</>
                ) : (
                  <><Upload className="w-4 h-4 ml-2" />{imagePreview ? 'تغيير الصورة' : 'رفع صورة'}</>
                )}
              </Button>
              <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                الحد الأقصى: 5 ميجابايت | JPG, PNG
              </p>
            </div>

            {/* Name & Email */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>
                  <User className="w-4 h-4 inline ml-1" />
                  الاسم الكامل
                </Label>
                <Input
                  value={formData.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                  className={isDark ? 'bg-slate-800/50 border-slate-700 text-white' : ''}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>
                  <Mail className="w-4 h-4 inline ml-1" />
                  البريد الإلكتروني
                </Label>
                <Input
                  value={formData.email}
                  disabled
                  className={`${isDark ? 'bg-slate-800/30 border-slate-700 text-slate-500' : 'bg-slate-100'} cursor-not-allowed`}
                  dir="ltr"
                />
                <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                  لا يمكن تغيير البريد الإلكتروني
                </p>
              </div>
            </div>

            {/* Phone & Mosque */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>
                  <Phone className="w-4 h-4 inline ml-1" />
                  رقم الهاتف
                </Label>
                <Input
                  value={formData.phone}
                  onChange={(e) => handleChange('phone', e.target.value)}
                  className={isDark ? 'bg-slate-800/50 border-slate-700 text-white' : ''}
                  dir="ltr"
                />
              </div>
              <div className="space-y-2">
                <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>
                  <Home className="w-4 h-4 inline ml-1" />
                  المسجد
                </Label>
                <Input
                  value={formData.mosqueName}
                  onChange={(e) => handleChange('mosqueName', e.target.value)}
                  className={isDark ? 'bg-slate-800/50 border-slate-700 text-white' : ''}
                />
              </div>
            </div>

            {/* Specialization & Experience */}
            <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-xl ${isDark ? 'bg-blue-500/10 border border-blue-500/20' : 'bg-blue-50 border border-blue-200'}`}>
              <div className="space-y-2">
                <Label className={isDark ? 'text-blue-300' : 'text-blue-700'}>
                  <Briefcase className="w-4 h-4 inline ml-1" />
                  التخصص
                </Label>
                <Input
                  value={formData.specialization}
                  onChange={(e) => handleChange('specialization', e.target.value)}
                  placeholder="مثال: تجويد، حفظ"
                  className={isDark ? 'bg-slate-800/50 border-slate-700 text-white' : ''}
                />
              </div>
              <div className="space-y-2">
                <Label className={isDark ? 'text-blue-300' : 'text-blue-700'}>
                  <Star className="w-4 h-4 inline ml-1" />
                  سنوات الخبرة
                </Label>
                <Input
                  type="number"
                  min="0"
                  max="50"
                  value={formData.experienceYears}
                  onChange={(e) => handleChange('experienceYears', e.target.value)}
                  className={isDark ? 'bg-slate-800/50 border-slate-700 text-white' : ''}
                />
              </div>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>
                  <Calendar className="w-4 h-4 inline ml-1" />
                  تاريخ الميلاد
                </Label>
                <Input
                  type="date"
                  value={formData.birthDate}
                  onChange={(e) => handleChange('birthDate', e.target.value)}
                  className={isDark ? 'bg-slate-800/50 border-slate-700 text-white' : ''}
                />
              </div>
              <div className="space-y-2">
                <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>
                  <Calendar className="w-4 h-4 inline ml-1" />
                  تاريخ الإلتحاق
                </Label>
                <Input
                  type="date"
                  value={formData.joinDate}
                  onChange={(e) => handleChange('joinDate', e.target.value)}
                  className={isDark ? 'bg-slate-800/50 border-slate-700 text-white' : ''}
                />
              </div>
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              disabled={saving}
              className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white font-bold"
            >
              {saving ? (
                <><Loader2 className="w-5 h-5 ml-2 animate-spin" />جاري الحفظ...</>
              ) : (
                <><Save className="w-5 h-5 ml-2" />حفظ التغييرات</>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default SheikhEditProfile;
