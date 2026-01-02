import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useTheme } from '../context/ThemeContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { 
  FileText, Upload, Plus, Loader2, BookOpen, Moon, Star, Hand, Clock, Eye, 
  Sunrise, Users, GraduationCap, Calendar, Sparkles, MessageCircle
} from 'lucide-react';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const TrackingSheets = () => {
  const { isDark } = useTheme();
  const [sheets, setSheets] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [selectedSheet, setSelectedSheet] = useState(null);
  const [activeTab, setActiveTab] = useState('manual');
  const [imagePreview, setImagePreview] = useState(null);
  const [imageBase64, setImageBase64] = useState('');
  const fileInputRef = useRef(null);
  
  const [formData, setFormData] = useState({
    student_id: '',
    week_start: '',
    prayers_count: 0,
    adhkar_after_prayer: 0,
    quran_sitting_days: 0,
    family_recitation: 0,
    study_hours: 0,
    witr_prayers_days: 0,
    sunnah_prayers: 0,
    night_prayer: 0,
    fasting: 0,
    notes: ''
  });

  useEffect(() => {
    fetchData();
    // Set default week start to current week's Saturday
    const today = new Date();
    const dayOfWeek = today.getDay();
    const daysToSubtract = dayOfWeek === 6 ? 0 : dayOfWeek + 1;
    const saturday = new Date(today);
    saturday.setDate(today.getDate() - daysToSubtract);
    setFormData(prev => ({ ...prev, week_start: saturday.toISOString().split('T')[0] }));
  }, []);

  const fetchData = async () => {
    try {
      const [sheetsRes, groupsRes] = await Promise.all([
        axios.get(`${API}/tracking-sheets`),
        axios.get(`${API}/groups`)
      ]);
      
      setSheets(sheetsRes.data);
      
      // Get all students from groups
      const allStudents = [];
      for (const group of groupsRes.data) {
        const studentsRes = await axios.get(`${API}/groups/${group.id}/students`);
        allStudents.push(...studentsRes.data.map(s => ({ ...s, groupName: group.name })));
      }
      setStudents(allStudents);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('يرجى اختيار ملف صورة');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      setImagePreview(event.target.result);
      const base64 = event.target.result.split(',')[1];
      setImageBase64(base64);
    };
    reader.readAsDataURL(file);
  };

  const handleManualSubmit = async (e) => {
    e.preventDefault();
    if (!formData.student_id || !formData.week_start) {
      toast.error('يرجى اختيار الطالب وتاريخ الأسبوع');
      return;
    }

    setSubmitting(true);
    try {
      const res = await axios.post(`${API}/tracking-sheets/manual`, formData);
      toast.success(`تم إدخال ورقة المتابعة - ${res.data.points_breakdown.total_points} نقطة`);
      setDialogOpen(false);
      resetForm();
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في إدخال ورقة المتابعة');
    } finally {
      setSubmitting(false);
    }
  };

  const handleImageSubmit = async () => {
    if (!formData.student_id || !formData.week_start || !imageBase64) {
      toast.error('يرجى ملء جميع الحقول');
      return;
    }

    setSubmitting(true);
    try {
      const res = await axios.post(`${API}/tracking-sheets`, {
        student_id: formData.student_id,
        week_start: formData.week_start,
        image_base64: imageBase64
      });
      toast.success(`تم رفع ورقة المتابعة - ${res.data.points_breakdown?.total_points || 0} نقطة`);
      setDialogOpen(false);
      resetForm();
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في رفع ورقة المتابعة');
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const daysToSubtract = dayOfWeek === 6 ? 0 : dayOfWeek + 1;
    const saturday = new Date(today);
    saturday.setDate(today.getDate() - daysToSubtract);
    setFormData({
      student_id: '',
      week_start: saturday.toISOString().split('T')[0],
      prayers_count: 0,
      adhkar_after_prayer: 0,
      quran_sitting_days: 0,
      family_recitation: 0,
      study_hours: 0,
      witr_prayers_days: 0,
      sunnah_prayers: 0,
      night_prayer: 0,
      fasting: 0,
      notes: ''
    });
    setImagePreview(null);
    setImageBase64('');
  };

  const calculatePoints = () => {
    const prayers = Math.min(formData.prayers_count, 35);
    const adhkar = Math.min(formData.adhkar_after_prayer, 7);
    const quran = Math.min(formData.quran_sitting_days, 7);
    const family = Math.min(formData.family_recitation, 7);
    const study = Math.min(formData.study_hours, 7);
    const witr = Math.min(formData.witr_prayers_days, 7);
    const sunnah = Math.min(formData.sunnah_prayers, 7);
    // قيام الليل: إذا قام ليلة واحدة = 8 نقاط كاملة
    const night = formData.night_prayer >= 1 ? 8 : 0;
    // الصيام: إذا صام يوم واحد = 8 نقاط كاملة
    const fasting = formData.fasting >= 1 ? 8 : 0;
    return Math.min(prayers + adhkar + quran + family + study + witr + sunnah + night + fasting, 100);
  };

  const viewSheet = (sheet) => {
    setSelectedSheet(sheet);
    setViewDialogOpen(true);
  };

  const getStudentName = (studentId) => {
    const student = students.find(s => s.id === studentId);
    return student?.name || 'غير معروف';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className={`p-6 rounded-xl ${isDark ? 'glass-card border border-white/10' : 'bg-white border border-slate-200 shadow-sm'}`}>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center">
              <FileText className="w-6 h-6 text-purple-400" />
            </div>
            <div>
              <h1 className={`text-xl md:text-2xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>ورق المتابعة</h1>
              <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>تسجيل ومتابعة العبادات والأنشطة الأسبوعية</p>
            </div>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-purple-600 hover:bg-purple-700">
                <Plus className="w-4 h-4 ml-2" />
                إدخال ورقة متابعة
              </Button>
            </DialogTrigger>
            <DialogContent className={`max-w-2xl max-h-[90vh] overflow-y-auto ${isDark ? 'bg-slate-900 border-white/10' : 'bg-white'}`}>
              <DialogHeader>
                <DialogTitle className={isDark ? 'text-white' : 'text-slate-900'}>إدخال ورقة متابعة</DialogTitle>
              </DialogHeader>
              
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className={`grid w-full grid-cols-2 ${isDark ? 'bg-slate-800' : 'bg-slate-100'}`}>
                  <TabsTrigger value="manual">إدخال يدوي</TabsTrigger>
                  <TabsTrigger value="image">رفع صورة</TabsTrigger>
                </TabsList>

                <TabsContent value="manual" className="mt-4">
                  <form onSubmit={handleManualSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>الطالب</Label>
                        <select
                          value={formData.student_id}
                          onChange={(e) => setFormData({ ...formData, student_id: e.target.value })}
                          required
                          className={`w-full p-2 rounded-md border ${isDark ? 'bg-slate-800 border-white/10 text-white' : 'bg-white border-slate-300'}`}
                        >
                          <option value="">اختر الطالب</option>
                          {students.map((s) => (
                            <option key={s.id} value={s.id}>{s.name} - {s.groupName}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>بداية الأسبوع</Label>
                        <Input
                          type="date"
                          value={formData.week_start}
                          onChange={(e) => setFormData({ ...formData, week_start: e.target.value })}
                          required
                          className={isDark ? 'bg-slate-800 border-white/10 text-white' : ''}
                        />
                      </div>
                    </div>

                    {/* Points Entry Fields */}
                    <div className={`p-4 rounded-xl ${isDark ? 'bg-slate-800/50' : 'bg-slate-50'}`}>
                      <h3 className={`font-bold mb-4 ${isDark ? 'text-white' : 'text-slate-900'}`}>بيانات الأسبوع</h3>
                      
                      <div className="grid grid-cols-2 gap-4">
                        {/* الصلوات */}
                        <div>
                          <Label className={`flex items-center gap-2 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                            <Hand className="w-4 h-4 text-emerald-400" />
                            الصلوات (من 35)
                          </Label>
                          <Input
                            type="number"
                            min="0"
                            max="35"
                            value={formData.prayers_count}
                            onChange={(e) => setFormData({ ...formData, prayers_count: parseInt(e.target.value) || 0 })}
                            className={isDark ? 'bg-slate-700 border-white/10 text-white' : ''}
                          />
                          <p className={`text-xs mt-1 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>5 صلوات × 7 أيام</p>
                        </div>

                        {/* أذكار بعد الصلاة */}
                        <div>
                          <Label className={`flex items-center gap-2 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                            <MessageCircle className="w-4 h-4 text-teal-400" />
                            أذكار بعد الصلاة (من 7)
                          </Label>
                          <Input
                            type="number"
                            min="0"
                            max="7"
                            value={formData.adhkar_after_prayer}
                            onChange={(e) => setFormData({ ...formData, adhkar_after_prayer: parseInt(e.target.value) || 0 })}
                            className={isDark ? 'bg-slate-700 border-white/10 text-white' : ''}
                          />
                        </div>
                        
                        {/* الجلوس مع القرآن */}
                        <div>
                          <Label className={`flex items-center gap-2 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                            <BookOpen className="w-4 h-4 text-blue-400" />
                            الجلوس مع القرآن (من 7)
                          </Label>
                          <Input
                            type="number"
                            min="0"
                            max="7"
                            value={formData.quran_sitting_days}
                            onChange={(e) => setFormData({ ...formData, quran_sitting_days: parseInt(e.target.value) || 0 })}
                            className={isDark ? 'bg-slate-700 border-white/10 text-white' : ''}
                          />
                        </div>

                        {/* صلاة الضحى */}
                        <div>
                          <Label className={`flex items-center gap-2 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                            <Sunrise className="w-4 h-4 text-amber-400" />
                            صلاة الضحى (من 7)
                          </Label>
                          <Input
                            type="number"
                            min="0"
                            max="7"
                            value={formData.duha_prayers}
                            onChange={(e) => setFormData({ ...formData, duha_prayers: parseInt(e.target.value) || 0 })}
                            className={isDark ? 'bg-slate-700 border-white/10 text-white' : ''}
                          />
                        </div>

                        {/* التسميع للأهل */}
                        <div>
                          <Label className={`flex items-center gap-2 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                            <Users className="w-4 h-4 text-pink-400" />
                            التسميع للأهل (من 7)
                          </Label>
                          <Input
                            type="number"
                            min="0"
                            max="7"
                            value={formData.family_recitation}
                            onChange={(e) => setFormData({ ...formData, family_recitation: parseInt(e.target.value) || 0 })}
                            className={isDark ? 'bg-slate-700 border-white/10 text-white' : ''}
                          />
                        </div>

                        {/* ساعات الدراسة */}
                        <div>
                          <Label className={`flex items-center gap-2 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                            <GraduationCap className="w-4 h-4 text-purple-400" />
                            ساعات الدراسة (من 7)
                          </Label>
                          <Input
                            type="number"
                            min="0"
                            max="7"
                            value={formData.study_hours}
                            onChange={(e) => setFormData({ ...formData, study_hours: parseInt(e.target.value) || 0 })}
                            className={isDark ? 'bg-slate-700 border-white/10 text-white' : ''}
                          />
                        </div>

                        {/* الوتر */}
                        <div>
                          <Label className={`flex items-center gap-2 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                            <Moon className="w-4 h-4 text-indigo-400" />
                            الوتر (من 7)
                          </Label>
                          <Input
                            type="number"
                            min="0"
                            max="7"
                            value={formData.witr_prayers_days}
                            onChange={(e) => setFormData({ ...formData, witr_prayers_days: parseInt(e.target.value) || 0 })}
                            className={isDark ? 'bg-slate-700 border-white/10 text-white' : ''}
                          />
                        </div>

                        {/* السنن */}
                        <div>
                          <Label className={`flex items-center gap-2 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                            <Sparkles className="w-4 h-4 text-orange-400" />
                            السنن (من 7)
                          </Label>
                          <Input
                            type="number"
                            min="0"
                            max="7"
                            value={formData.sunnah_prayers}
                            onChange={(e) => setFormData({ ...formData, sunnah_prayers: parseInt(e.target.value) || 0 })}
                            className={isDark ? 'bg-slate-700 border-white/10 text-white' : ''}
                          />
                        </div>

                        {/* قيام الليل */}
                        <div>
                          <Label className={`flex items-center gap-2 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                            <Star className="w-4 h-4 text-yellow-400" />
                            قيام الليل (من 1)
                          </Label>
                          <Input
                            type="number"
                            min="0"
                            max="1"
                            value={formData.night_prayer}
                            onChange={(e) => setFormData({ ...formData, night_prayer: parseInt(e.target.value) || 0 })}
                            className={isDark ? 'bg-slate-700 border-white/10 text-white' : ''}
                          />
                        </div>

                        {/* الصيام */}
                        <div>
                          <Label className={`flex items-center gap-2 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                            <Calendar className="w-4 h-4 text-cyan-400" />
                            الصيام (من 1)
                          </Label>
                          <Input
                            type="number"
                            min="0"
                            max="1"
                            value={formData.fasting}
                            onChange={(e) => setFormData({ ...formData, fasting: parseInt(e.target.value) || 0 })}
                            className={isDark ? 'bg-slate-700 border-white/10 text-white' : ''}
                          />
                        </div>
                      </div>
                    </div>

                    <div>
                      <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>ملاحظات</Label>
                      <Textarea
                        value={formData.notes}
                        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                        className={isDark ? 'bg-slate-800 border-white/10 text-white' : ''}
                      />
                    </div>

                    {/* Points Preview */}
                    <div className={`p-4 rounded-xl text-center ${isDark ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-emerald-50 border border-emerald-200'}`}>
                      <p className={isDark ? 'text-slate-300' : 'text-slate-600'}>النقاط المتوقعة</p>
                      <p className="text-3xl font-bold text-emerald-400">{calculatePoints()} نقطة</p>
                      <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>الحد الأقصى: 100 نقطة</p>
                    </div>

                    <Button type="submit" className="w-full bg-purple-600 hover:bg-purple-700" disabled={submitting}>
                      {submitting ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : null}
                      حفظ ورقة المتابعة
                    </Button>
                  </form>
                </TabsContent>

                <TabsContent value="image" className="mt-4">
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>الطالب</Label>
                        <select
                          value={formData.student_id}
                          onChange={(e) => setFormData({ ...formData, student_id: e.target.value })}
                          className={`w-full p-2 rounded-md border ${isDark ? 'bg-slate-800 border-white/10 text-white' : 'bg-white border-slate-300'}`}
                        >
                          <option value="">اختر الطالب</option>
                          {students.map((s) => (
                            <option key={s.id} value={s.id}>{s.name} - {s.groupName}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>بداية الأسبوع</Label>
                        <Input
                          type="date"
                          value={formData.week_start}
                          onChange={(e) => setFormData({ ...formData, week_start: e.target.value })}
                          className={isDark ? 'bg-slate-800 border-white/10 text-white' : ''}
                        />
                      </div>
                    </div>

                    <div
                      className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                        imagePreview
                          ? isDark ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-emerald-500 bg-emerald-50'
                          : isDark ? 'border-white/20 hover:border-purple-500/50' : 'border-slate-300 hover:border-purple-500'
                      }`}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        accept="image/*"
                        className="hidden"
                      />
                      {imagePreview ? (
                        <div>
                          <img src={imagePreview} alt="Preview" className="max-h-48 mx-auto rounded-lg mb-2" />
                          <p className="text-emerald-400">تم اختيار الصورة</p>
                        </div>
                      ) : (
                        <div>
                          <Upload className={`w-12 h-12 mx-auto mb-3 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
                          <p className={isDark ? 'text-slate-400' : 'text-slate-600'}>اضغط لرفع صورة ورقة المتابعة</p>
                        </div>
                      )}
                    </div>

                    <Button onClick={handleImageSubmit} className="w-full bg-purple-600 hover:bg-purple-700" disabled={submitting}>
                      {submitting ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : null}
                      رفع الصورة
                    </Button>
                  </div>
                </TabsContent>
              </Tabs>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Points Guide */}
      <Card className={isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'}>
        <CardHeader>
          <CardTitle className={isDark ? 'text-white' : 'text-slate-900'}>دليل النقاط (الأسبوعية)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
            <div className={`p-3 rounded-lg text-center ${isDark ? 'bg-emerald-500/10' : 'bg-emerald-50'}`}>
              <Hand className="w-5 h-5 mx-auto mb-1 text-emerald-400" />
              <p className={`text-xs ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>الصلوات</p>
              <p className="text-sm font-bold text-emerald-400">35</p>
            </div>
            <div className={`p-3 rounded-lg text-center ${isDark ? 'bg-teal-500/10' : 'bg-teal-50'}`}>
              <MessageCircle className="w-5 h-5 mx-auto mb-1 text-teal-400" />
              <p className={`text-xs ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>أذكار الصلاة</p>
              <p className="text-sm font-bold text-teal-400">7</p>
            </div>
            <div className={`p-3 rounded-lg text-center ${isDark ? 'bg-blue-500/10' : 'bg-blue-50'}`}>
              <BookOpen className="w-5 h-5 mx-auto mb-1 text-blue-400" />
              <p className={`text-xs ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>القرآن</p>
              <p className="text-sm font-bold text-blue-400">7</p>
            </div>
            <div className={`p-3 rounded-lg text-center ${isDark ? 'bg-amber-500/10' : 'bg-amber-50'}`}>
              <Sunrise className="w-5 h-5 mx-auto mb-1 text-amber-400" />
              <p className={`text-xs ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>الضحى</p>
              <p className="text-sm font-bold text-amber-400">7</p>
            </div>
            <div className={`p-3 rounded-lg text-center ${isDark ? 'bg-pink-500/10' : 'bg-pink-50'}`}>
              <Users className="w-5 h-5 mx-auto mb-1 text-pink-400" />
              <p className={`text-xs ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>التسميع</p>
              <p className="text-sm font-bold text-pink-400">7</p>
            </div>
            <div className={`p-3 rounded-lg text-center ${isDark ? 'bg-purple-500/10' : 'bg-purple-50'}`}>
              <GraduationCap className="w-5 h-5 mx-auto mb-1 text-purple-400" />
              <p className={`text-xs ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>الدراسة</p>
              <p className="text-sm font-bold text-purple-400">7</p>
            </div>
            <div className={`p-3 rounded-lg text-center ${isDark ? 'bg-indigo-500/10' : 'bg-indigo-50'}`}>
              <Moon className="w-5 h-5 mx-auto mb-1 text-indigo-400" />
              <p className={`text-xs ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>الوتر</p>
              <p className="text-sm font-bold text-indigo-400">7</p>
            </div>
            <div className={`p-3 rounded-lg text-center ${isDark ? 'bg-orange-500/10' : 'bg-orange-50'}`}>
              <Sparkles className="w-5 h-5 mx-auto mb-1 text-orange-400" />
              <p className={`text-xs ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>السنن</p>
              <p className="text-sm font-bold text-orange-400">7</p>
            </div>
            <div className={`p-3 rounded-lg text-center ${isDark ? 'bg-yellow-500/10' : 'bg-yellow-50'}`}>
              <Star className="w-5 h-5 mx-auto mb-1 text-yellow-400" />
              <p className={`text-xs ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>قيام الليل</p>
              <p className="text-sm font-bold text-yellow-400">4</p>
            </div>
            <div className={`p-3 rounded-lg text-center ${isDark ? 'bg-cyan-500/10' : 'bg-cyan-50'}`}>
              <Calendar className="w-5 h-5 mx-auto mb-1 text-cyan-400" />
              <p className={`text-xs ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>الصيام</p>
              <p className="text-sm font-bold text-cyan-400">5</p>
            </div>
          </div>
          <div className={`mt-4 p-3 rounded-lg text-center ${isDark ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-emerald-50 border border-emerald-200'}`}>
            <p className={`text-sm ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>الحد الأقصى الأسبوعي</p>
            <p className="text-2xl font-bold text-emerald-400">100 نقطة</p>
            <p className={`text-xs mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>35+7+7+7+7+7+7+7+4+5=93 (مع حد أقصى 100)</p>
          </div>
        </CardContent>
      </Card>

      {/* Sheets List */}
      <Card className={isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'}>
        <CardHeader>
          <CardTitle className={isDark ? 'text-white' : 'text-slate-900'}>أوراق المتابعة المسجلة</CardTitle>
        </CardHeader>
        <CardContent>
          {sheets.length === 0 ? (
            <p className={`text-center py-8 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>لا توجد أوراق متابعة مسجلة</p>
          ) : (
            <div className="space-y-3">
              {sheets.map((sheet) => (
                <div
                  key={sheet.id}
                  className={`p-4 rounded-xl flex items-center justify-between ${isDark ? 'bg-slate-800/50 border border-white/5' : 'bg-slate-50 border border-slate-200'}`}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-lg bg-purple-500/20 flex items-center justify-center">
                      <FileText className="w-6 h-6 text-purple-400" />
                    </div>
                    <div>
                      <h3 className={`font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>{getStudentName(sheet.student_id)}</h3>
                      <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>أسبوع {sheet.week_start}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-left">
                      <p className="text-emerald-400 font-bold">{sheet.points_earned || sheet.total_points || 0} / 100</p>
                      <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                        نقطة أسبوعية
                      </p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => viewSheet(sheet)}>
                      <Eye className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* View Sheet Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className={`max-w-lg ${isDark ? 'bg-slate-900 border-white/10' : 'bg-white'}`}>
          <DialogHeader>
            <DialogTitle className={isDark ? 'text-white' : 'text-slate-900'}>تفاصيل ورقة المتابعة</DialogTitle>
          </DialogHeader>
          {selectedSheet && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className={`p-3 rounded-lg ${isDark ? 'bg-slate-800' : 'bg-slate-100'}`}>
                  <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>الطالب</p>
                  <p className={`font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>{getStudentName(selectedSheet.student_id)}</p>
                </div>
                <div className={`p-3 rounded-lg ${isDark ? 'bg-slate-800' : 'bg-slate-100'}`}>
                  <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>الأسبوع</p>
                  <p className={`font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>{selectedSheet.week_start}</p>
                </div>
              </div>
              
              {/* إجمالي النقاط - العرض الرئيسي */}
              <div className={`p-6 rounded-xl text-center ${isDark ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-emerald-50 border border-emerald-200'}`}>
                <p className={`text-lg ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>إجمالي النقاط الأسبوعية</p>
                <p className="text-4xl font-bold text-emerald-400 my-2">
                  {selectedSheet.points_earned || selectedSheet.total_points || 0} / 100
                </p>
                <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>نقطة</p>
              </div>

              {/* تفاصيل توزيع النقاط */}
              {selectedSheet.points_breakdown && (
                <div className={`p-4 rounded-xl ${isDark ? 'bg-slate-800/50' : 'bg-slate-50'}`}>
                  <h4 className={`font-bold mb-3 ${isDark ? 'text-white' : 'text-slate-900'}`}>توزيع النقاط</h4>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="flex justify-between items-center">
                      <span className={`flex items-center gap-2 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                        <Hand className="w-4 h-4 text-emerald-400" /> الصلوات
                      </span>
                      <span className="text-emerald-400 font-bold">{selectedSheet.points_breakdown.prayers || 0}/35</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className={`flex items-center gap-2 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                        <BookOpen className="w-4 h-4 text-blue-400" /> القرآن
                      </span>
                      <span className="text-blue-400 font-bold">{selectedSheet.points_breakdown.quran_sitting || 0}/7</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className={`flex items-center gap-2 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                        <Sunrise className="w-4 h-4 text-amber-400" /> الضحى
                      </span>
                      <span className="text-amber-400 font-bold">{selectedSheet.points_breakdown.duha || 0}/7</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className={`flex items-center gap-2 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                        <Users className="w-4 h-4 text-pink-400" /> التسميع للأهل
                      </span>
                      <span className="text-pink-400 font-bold">{selectedSheet.points_breakdown.family_recitation || 0}/7</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className={`flex items-center gap-2 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                        <GraduationCap className="w-4 h-4 text-purple-400" /> الدراسة
                      </span>
                      <span className="text-purple-400 font-bold">{selectedSheet.points_breakdown.study || 0}/7</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className={`flex items-center gap-2 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                        <Moon className="w-4 h-4 text-indigo-400" /> الوتر
                      </span>
                      <span className="text-indigo-400 font-bold">{selectedSheet.points_breakdown.witr || 0}/7</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className={`flex items-center gap-2 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                        <Sparkles className="w-4 h-4 text-orange-400" /> السنن
                      </span>
                      <span className="text-orange-400 font-bold">{selectedSheet.points_breakdown.sunnah || 0}/7</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className={`flex items-center gap-2 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                        <Star className="w-4 h-4 text-yellow-400" /> قيام الليل
                      </span>
                      <span className="text-yellow-400 font-bold">{selectedSheet.points_breakdown.night_prayer || 0}/8</span>
                    </div>
                    <div className="flex justify-between items-center col-span-2">
                      <span className={`flex items-center gap-2 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                        <Calendar className="w-4 h-4 text-cyan-400" /> الصيام
                      </span>
                      <span className="text-cyan-400 font-bold">{selectedSheet.points_breakdown.fasting || 0}/8</span>
                    </div>
                  </div>
                </div>
              )}
              
              {(selectedSheet.data?.notes || selectedSheet.notes) && (
                <div className={`p-3 rounded-lg ${isDark ? 'bg-slate-800' : 'bg-slate-100'}`}>
                  <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>ملاحظات</p>
                  <p className={isDark ? 'text-white' : 'text-slate-900'}>{selectedSheet.data?.notes || selectedSheet.notes}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TrackingSheets;
