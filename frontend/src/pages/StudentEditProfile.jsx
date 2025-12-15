import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { User, Phone, School, Camera, Save, ArrowRight, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const StudentEditProfile = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    student_phone: '',
    profile_image: '',
    school_name: '',
    school_grade: '',
    school_average: ''
  });

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const response = await axios.get(`${API}/students/me/profile`);
      const data = response.data;
      setFormData({
        student_phone: data.student_phone || '',
        profile_image: data.profile_image || '',
        school_name: data.school_name || '',
        school_grade: data.school_grade || '',
        school_average: data.school_average || ''
      });
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await axios.put(`${API}/students/me/profile`, formData);
      toast.success('تم تحديث بياناتك بنجاح');
    } catch (error) {
      console.error('Error:', error);
      toast.error('فشل في تحديث البيانات');
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
            {/* Profile Image URL */}
            <div className="space-y-2">
              <Label className="text-slate-300 flex items-center gap-2">
                <Camera className="w-4 h-4" />
                رابط الصورة الشخصية
              </Label>
              <Input
                name="profile_image"
                value={formData.profile_image}
                onChange={handleChange}
                placeholder="https://example.com/image.jpg"
                className="bg-slate-800 border-slate-700 text-white"
                dir="ltr"
              />
              {formData.profile_image && (
                <div className="mt-2 flex justify-center">
                  <div className="w-24 h-24 rounded-xl overflow-hidden border-2 border-emerald-500/30">
                    <img 
                      src={formData.profile_image} 
                      alt="صورة شخصية"
                      className="w-full h-full object-cover"
                      onError={(e) => e.target.style.display = 'none'}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Phone Number */}
            <div className="space-y-2">
              <Label className="text-slate-300 flex items-center gap-2">
                <Phone className="w-4 h-4" />
                رقم الهاتف
              </Label>
              <Input
                name="student_phone"
                value={formData.student_phone}
                onChange={handleChange}
                placeholder="05XXXXXXXX"
                className="bg-slate-800 border-slate-700 text-white"
                dir="ltr"
              />
            </div>

            {/* School Name */}
            <div className="space-y-2">
              <Label className="text-slate-300 flex items-center gap-2">
                <School className="w-4 h-4" />
                اسم المدرسة
              </Label>
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
              <Input
                name="school_grade"
                value={formData.school_grade}
                onChange={handleChange}
                placeholder="مثال: الصف الخامس"
                className="bg-slate-800 border-slate-700 text-white"
              />
            </div>

            {/* School Average */}
            <div className="space-y-2">
              <Label className="text-slate-300">المعدل الدراسي</Label>
              <Input
                name="school_average"
                value={formData.school_average}
                onChange={handleChange}
                placeholder="مثال: 95%"
                className="bg-slate-800 border-slate-700 text-white"
              />
            </div>

            <Button
              type="submit"
              disabled={saving}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {saving ? (
                <>
                  <Loader2 className="w-5 h-5 ml-2 animate-spin" />
                  جاري الحفظ...
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
