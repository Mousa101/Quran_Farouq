import { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { 
  FileText, Plus, Loader2, BookOpen, Moon, Star, Hand, Eye, 
  Users, GraduationCap, Calendar, CheckCircle, Sparkles, MessageCircle
} from 'lucide-react';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// دالة للحصول على بداية الأسبوع الحالي (السبت)
const getCurrentWeekStart = () => {
  const today = new Date();
  // في JavaScript: 0=الأحد، 6=السبت
  // نحتاج السبت كبداية الأسبوع
  const dayOfWeek = today.getDay();
  const daysToSubtract = dayOfWeek === 6 ? 0 : dayOfWeek + 1;
  const saturday = new Date(today);
  saturday.setDate(today.getDate() - daysToSubtract);
  return saturday.toISOString().split('T')[0];
};

const StudentTracking = () => {
  const { user } = useAuth();
  const { isDark } = useTheme();
  const [sheets, setSheets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [selectedSheet, setSelectedSheet] = useState(null);
  const [currentWeekSheet, setCurrentWeekSheet] = useState(null);
  
  const [formData, setFormData] = useState({
    week_start: getCurrentWeekStart(),
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
  }, []);

  const fetchData = async () => {
    try {
      const res = await axios.get(`${API}/tracking-sheets`);
      setSheets(res.data);
      
      // البحث عن ورقة الأسبوع الحالي
      const currentWeek = getCurrentWeekStart();
      const existingSheet = res.data.find(s => s.week_start === currentWeek);
      if (existingSheet) {
        setCurrentWeekSheet(existingSheet);
        // تحميل البيانات الموجودة
        setFormData({
          week_start: currentWeek,
          prayers_count: existingSheet.data?.prayers_count || 0,
          quran_sitting_days: existingSheet.data?.quran_sitting_days || 0,
          duha_prayers: existingSheet.data?.duha_prayers || 0,
          family_recitation: existingSheet.data?.family_recitation || 0,
          study_hours: existingSheet.data?.study_hours || 0,
          witr_prayers_days: existingSheet.data?.witr_prayers_days || 0,
          sunnah_prayers: existingSheet.data?.sunnah_prayers || 0,
          night_prayer: existingSheet.data?.night_prayer || 0,
          fasting: existingSheet.data?.fasting || 0,
          notes: existingSheet.data?.notes || ''
        });
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // التأكد من أن التاريخ هو بداية الأسبوع الحالي
    const currentWeek = getCurrentWeekStart();
    if (formData.week_start !== currentWeek) {
      toast.error(`يمكنك فقط تعبئة ورقة الأسبوع الحالي (${currentWeek})`);
      return;
    }

    setSubmitting(true);
    try {
      const res = await axios.post(`${API}/tracking-sheets/student`, {
        ...formData,
        week_start: currentWeek
      });
      toast.success(res.data.message || 'تم حفظ ورقة المتابعة بنجاح');
      setDialogOpen(false);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في حفظ ورقة المتابعة');
    } finally {
      setSubmitting(false);
    }
  };

  const calculatePoints = () => {
    const prayers = Math.min(formData.prayers_count, 35);
    const quran = Math.min(formData.quran_sitting_days, 7);
    const duha = Math.min(formData.duha_prayers, 7);
    const family = Math.min(formData.family_recitation, 7);
    const study = Math.min(formData.study_hours, 7);
    const witr = Math.min(formData.witr_prayers_days, 7);
    const sunnah = Math.min(formData.sunnah_prayers, 7);
    // قيام الليل: إذا أتم يوم = 8 نقاط كاملة
    const night = formData.night_prayer >= 1 ? 8 : 0;
    // الصيام: إذا أتم يوم = 8 نقاط كاملة
    const fasting = formData.fasting >= 1 ? 8 : 0;
    return Math.min(prayers + quran + duha + family + study + witr + sunnah + night + fasting, 100);
  };

  const viewSheet = (sheet) => {
    setSelectedSheet(sheet);
    setViewDialogOpen(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const currentWeekStart = getCurrentWeekStart();

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
              <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                سجّل أنشطتك وعباداتك الأسبوعية (الأسبوع من السبت للسبت)
              </p>
            </div>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-purple-600 hover:bg-purple-700">
                <Plus className="w-4 h-4 ml-2" />
                {currentWeekSheet ? 'تعديل ورقة الأسبوع' : 'تعبئة ورقة متابعة'}
              </Button>
            </DialogTrigger>
            <DialogContent className={`max-w-2xl max-h-[90vh] overflow-y-auto ${isDark ? 'bg-slate-900 border-white/10' : 'bg-white'}`}>
              <DialogHeader>
                <DialogTitle className={isDark ? 'text-white' : 'text-slate-900'}>
                  {currentWeekSheet ? 'تعديل ورقة المتابعة' : 'تعبئة ورقة المتابعة'}
                </DialogTitle>
              </DialogHeader>
              
              <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                <div className={`p-3 rounded-lg ${isDark ? 'bg-purple-500/10 border border-purple-500/30' : 'bg-purple-50 border border-purple-200'}`}>
                  <p className={`text-sm ${isDark ? 'text-purple-300' : 'text-purple-700'}`}>
                    📅 أسبوع: <strong>{currentWeekStart}</strong>
                  </p>
                  {currentWeekSheet && (
                    <p className="text-xs text-amber-400 mt-1">* يوجد سجل سابق - سيتم تحديثه</p>
                  )}
                </div>

                {/* Points Entry Fields */}
                <div className={`p-4 rounded-xl ${isDark ? 'bg-slate-800/50' : 'bg-slate-50'}`}>
                  <h3 className={`font-bold mb-4 ${isDark ? 'text-white' : 'text-slate-900'}`}>بيانات الأسبوع (المجموع 100 نقطة)</h3>
                  
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
                            <Hand className="w-4 h-4 text-amber-400" />
                            أذكار بعد الصلاة (من 7)
                          </Label>
                          <Input
                            type="number"
                            min="0"
                            max="7"
                            value={formData.adhkar_count}
                            onChange={(e) => setFormData({ ...formData, adhkar_count: parseInt(e.target.value) || 0 })}
                            className={isDark ? 'bg-slate-700 border-white/10 text-white' : ''}
                          />
                          <p className={`text-xs mt-1 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>كل يوم = 1 نقطة</p>
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
                        <Sparkles className="w-4 h-4 text-teal-400" />
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
                        قيام الليل (0 أو 1) = 8 نقاط
                      </Label>
                      <Input
                        type="number"
                        min="0"
                        max="1"
                        value={formData.night_prayer}
                        onChange={(e) => setFormData({ ...formData, night_prayer: parseInt(e.target.value) || 0 })}
                        className={isDark ? 'bg-slate-700 border-white/10 text-white' : ''}
                      />
                      <p className={`text-xs mt-1 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>إذا أتممت يوم واحد = 8 نقاط كاملة</p>
                    </div>

                    {/* الصيام */}
                    <div>
                      <Label className={`flex items-center gap-2 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                        <Calendar className="w-4 h-4 text-cyan-400" />
                        الصيام (0 أو 1) = 8 نقاط
                      </Label>
                      <Input
                        type="number"
                        min="0"
                        max="1"
                        value={formData.fasting}
                        onChange={(e) => setFormData({ ...formData, fasting: parseInt(e.target.value) || 0 })}
                        className={isDark ? 'bg-slate-700 border-white/10 text-white' : ''}
                      />
                      <p className={`text-xs mt-1 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>إذا أتممت يوم واحد = 8 نقاط كاملة</p>
                    </div>
                  </div>
                </div>

                <div>
                  <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>ملاحظات (اختياري)</Label>
                  <Textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    className={isDark ? 'bg-slate-800 border-white/10 text-white' : ''}
                    placeholder="أي ملاحظات إضافية..."
                  />
                </div>

                {/* Points Preview */}
                <div className={`p-4 rounded-xl text-center ${isDark ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-emerald-50 border border-emerald-200'}`}>
                  <p className={isDark ? 'text-slate-300' : 'text-slate-600'}>النقاط المتوقعة</p>
                  <p className="text-3xl font-bold text-emerald-400">{calculatePoints()} نقطة</p>
                  <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>الحد الأقصى: 100 نقطة</p>
                  {calculatePoints() >= 90 && (
                    <p className="text-amber-400 text-sm mt-2">🏅 ستحصل على شارة العابد!</p>
                  )}
                </div>

                <Button type="submit" className="w-full bg-purple-600 hover:bg-purple-700" disabled={submitting}>
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : null}
                  {currentWeekSheet ? 'تحديث ورقة المتابعة' : 'حفظ ورقة المتابعة'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Points Guide */}
      <Card className={isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'}>
        <CardHeader>
          <CardTitle className={isDark ? 'text-white' : 'text-slate-900'}>دليل النقاط (المجموع 100 نقطة)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-2">
            <div className={`p-2 rounded-lg text-center ${isDark ? 'bg-emerald-500/10' : 'bg-emerald-50'}`}>
              <Hand className="w-4 h-4 mx-auto mb-1 text-emerald-400" />
              <p className={`text-xs ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>الصلوات</p>
              <p className="text-sm font-bold text-emerald-400">35</p>
            </div>
            <div className={`p-2 rounded-lg text-center ${isDark ? 'bg-blue-500/10' : 'bg-blue-50'}`}>
              <BookOpen className="w-4 h-4 mx-auto mb-1 text-blue-400" />
              <p className={`text-xs ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>القرآن</p>
              <p className="text-sm font-bold text-blue-400">7</p>
            </div>
            <div className={`p-2 rounded-lg text-center ${isDark ? 'bg-amber-500/10' : 'bg-amber-50'}`}>
              <Sunrise className="w-4 h-4 mx-auto mb-1 text-amber-400" />
              <p className={`text-xs ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>الضحى</p>
              <p className="text-sm font-bold text-amber-400">7</p>
            </div>
            <div className={`p-2 rounded-lg text-center ${isDark ? 'bg-pink-500/10' : 'bg-pink-50'}`}>
              <Users className="w-4 h-4 mx-auto mb-1 text-pink-400" />
              <p className={`text-xs ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>التسميع</p>
              <p className="text-sm font-bold text-pink-400">7</p>
            </div>
            
            <div className={`p-2 rounded-lg text-center ${isDark ? 'bg-purple-500/10' : 'bg-purple-50'}`}>
              <GraduationCap className="w-4 h-4 mx-auto mb-1 text-purple-400" />
              <p className={`text-xs ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>الدراسة</p>
              <p className="text-sm font-bold text-purple-400">7</p>
            </div>
            <div className={`p-2 rounded-lg text-center ${isDark ? 'bg-indigo-500/10' : 'bg-indigo-50'}`}>
              <Moon className="w-4 h-4 mx-auto mb-1 text-indigo-400" />
              <p className={`text-xs ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>الوتر</p>
              <p className="text-sm font-bold text-indigo-400">7</p>
            </div>
            <div className={`p-2 rounded-lg text-center ${isDark ? 'bg-teal-500/10' : 'bg-teal-50'}`}>
              <Sparkles className="w-4 h-4 mx-auto mb-1 text-teal-400" />
              <p className={`text-xs ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>السنن</p>
              <p className="text-sm font-bold text-teal-400">7</p>
            </div>
            <div className={`p-3 rounded-lg text-center ${isDark ? 'bg-amber-500/10' : 'bg-amber-50'}`}>
              <Star className="w-6 h-6 mx-auto mb-2 text-amber-400" />
              <p className={`text-sm ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>الأذكار</p>
              <p className="text-lg font-bold text-amber-400">7 نقاط</p>
            </div>
            <div className={`p-2 rounded-lg text-center ${isDark ? 'bg-yellow-500/10' : 'bg-yellow-50'}`}>
              <Star className="w-4 h-4 mx-auto mb-1 text-yellow-400" />
              <p className={`text-xs ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>قيام</p>
              <p className="text-sm font-bold text-yellow-400">8</p>
            </div>
            <div className={`p-2 rounded-lg text-center ${isDark ? 'bg-cyan-500/10' : 'bg-cyan-50'}`}>
              <Calendar className="w-4 h-4 mx-auto mb-1 text-cyan-400" />
              <p className={`text-xs ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>الصيام</p>
              <p className="text-sm font-bold text-cyan-400">8</p>
            </div>
          </div>
          <div className={`mt-3 p-2 rounded-lg text-center ${isDark ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-emerald-50 border border-emerald-200'}`}>
            <p className="text-lg font-bold text-emerald-400">المجموع الأسبوعي: 100 نقطة</p>
          </div>
        </CardContent>
      </Card>

      {/* Current Week Status */}
      {currentWeekSheet && (
        <Card className={isDark ? 'glass-card border-emerald-500/30' : 'bg-white border-emerald-200'}>
          <CardHeader>
            <CardTitle className={`flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
              <CheckCircle className="w-5 h-5 text-emerald-400" />
              ورقة الأسبوع الحالي
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className={isDark ? 'text-slate-300' : 'text-slate-600'}>
                  تم تعبئة ورقة أسبوع {currentWeekSheet.week_start}
                </p>
                <p className="text-emerald-400 font-bold text-xl mt-1">
                  {currentWeekSheet.points_earned || 0} نقطة
                </p>
              </div>
              <Button variant="outline" onClick={() => viewSheet(currentWeekSheet)}>
                <Eye className="w-4 h-4 ml-2" />
                عرض التفاصيل
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* My Sheets List */}
      <Card className={isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'}>
        <CardHeader>
          <CardTitle className={isDark ? 'text-white' : 'text-slate-900'}>سجلاتي السابقة</CardTitle>
        </CardHeader>
        <CardContent>
          {sheets.length === 0 ? (
            <div className={`text-center py-8 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
              <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>لا توجد سجلات سابقة</p>
              <p className="text-sm mt-2">ابدأ بتعبئة ورقة المتابعة الأولى!</p>
            </div>
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
                      <h3 className={`font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>أسبوع {sheet.week_start}</h3>
                      <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                        صلوات: {sheet.data?.prayers_count || 0}/35
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-left">
                      <p className="text-emerald-400 font-bold text-lg">{sheet.points_earned || 0}</p>
                      <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>نقطة</p>
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
              <div className={`p-3 rounded-lg ${isDark ? 'bg-slate-800' : 'bg-slate-100'}`}>
                <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>الأسبوع</p>
                <p className={`font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>{selectedSheet.week_start}</p>
              </div>
              
              <div className={`p-4 rounded-xl ${isDark ? 'bg-slate-800/50' : 'bg-slate-50'}`}>
                <h4 className={`font-bold mb-3 ${isDark ? 'text-white' : 'text-slate-900'}`}>التفاصيل</h4>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="flex justify-between">
                    <span className={isDark ? 'text-slate-400' : 'text-slate-600'}>الصلوات:</span>
                    <span className="text-emerald-400 font-bold">{selectedSheet.data?.prayers_count || 0}/35</span>
                  </div>
                  <div className="flex justify-between">
                    <span className={isDark ? 'text-slate-400' : 'text-slate-600'}>القرآن:</span>
                    <span className="text-blue-400 font-bold">{selectedSheet.data?.quran_sitting_days || 0}/7</span>
                  </div>
                  <div className="flex justify-between">
                    <span className={isDark ? 'text-slate-400' : 'text-slate-600'}>الضحى:</span>
                    <span className="text-amber-400 font-bold">{selectedSheet.data?.duha_prayers || 0}/7</span>
                  </div>
                  <div className="flex justify-between">
                    <span className={isDark ? 'text-slate-400' : 'text-slate-600'}>التسميع:</span>
                    <span className="text-pink-400 font-bold">{selectedSheet.data?.family_recitation || 0}/7</span>
                  </div>
                  <div className="flex justify-between">
                    <span className={isDark ? 'text-slate-400' : 'text-slate-600'}>الدراسة:</span>
                    <span className="text-purple-400 font-bold">{selectedSheet.data?.study_hours || 0}/7</span>
                  </div>
                  <div className="flex justify-between">
                    <span className={isDark ? 'text-slate-400' : 'text-slate-600'}>الوتر:</span>
                    <span className="text-indigo-400 font-bold">{selectedSheet.data?.witr_prayers_days || 0}/7</span>
                  </div>
                  <div className="flex justify-between">
                    <span className={isDark ? 'text-slate-400' : 'text-slate-600'}>السنن:</span>
                    <span className="text-teal-400 font-bold">{selectedSheet.data?.sunnah_prayers || 0}/7</span>
                  </div>
                  <div className="flex justify-between">
                    <span className={isDark ? 'text-slate-400' : 'text-slate-600'}>قيام الليل:</span>
                    <span className="text-yellow-400 font-bold">{selectedSheet.data?.night_prayer >= 1 ? '8' : '0'}/8</span>
                  </div>
                  <div className="flex justify-between">
                    <span className={isDark ? 'text-slate-400' : 'text-slate-600'}>الصيام:</span>
                    <span className="text-cyan-400 font-bold">{selectedSheet.data?.fasting >= 1 ? '8' : '0'}/8</span>
                  </div>
                </div>
              </div>
              
              <div className={`p-4 rounded-xl text-center ${isDark ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-emerald-50 border border-emerald-200'}`}>
                <p className={isDark ? 'text-slate-300' : 'text-slate-600'}>إجمالي النقاط</p>
                <p className="text-3xl font-bold text-emerald-400">{selectedSheet.points_earned || 0} نقطة</p>
              </div>
              
              {selectedSheet.data?.notes && (
                <div className={`p-3 rounded-lg ${isDark ? 'bg-slate-800' : 'bg-slate-100'}`}>
                  <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>ملاحظات</p>
                  <p className={isDark ? 'text-white' : 'text-slate-900'}>{selectedSheet.data.notes}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default StudentTracking;
