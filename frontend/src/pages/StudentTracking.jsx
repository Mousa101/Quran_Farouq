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
  Sunrise, Users, GraduationCap, Calendar, CheckCircle, Sparkles, MessageCircle
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
    duha_prayers: 0,
    family_recitation: 0,
    study_hours: 0,
    witr_prayers_days: 0,
    sunnah_prayers: 0,
    night_prayer: 0,
    fasting: 0,
    notes: ''
  });
  const [customItems, setCustomItems] = useState([]);
  const [customValues, setCustomValues] = useState({});

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      // بنود المشرف المخصصة
      try {
        const itemsRes = await axios.get(`${API}/tracking-items`);
        setCustomItems(itemsRes.data || []);
      } catch (e) { /* لا بنود */ }

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
          notes: existingSheet.data?.notes || ''
        });
        setCustomValues(existingSheet.data?.custom_values || {});
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
        week_start: currentWeek,
        custom_values: customValues
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

  const customTotal = () =>
    customItems.reduce((sum, it) => sum + Math.min(Math.max(parseInt(customValues[it.id]) || 0, 0), it.max_points), 0);

  const customMax = () => customItems.reduce((sum, it) => sum + it.max_points, 0);

  const calculatePoints = () => {
    const prayers = Math.min(formData.prayers_count, 35);
    const quran = Math.min(formData.quran_sitting_days, 35);
    return prayers + quran + customTotal(); // 70 (صلوات 35 + جلوس 35) + بنود المشرف
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
                  <h3 className={`font-bold mb-4 ${isDark ? 'text-white' : 'text-slate-900'}`}>بيانات الأسبوع (المجموع {70 + customMax()} نقطة)</h3>

                  <div className="grid grid-cols-2 gap-4">
                    {/* الصلوات */}
                    <div>
                      <Label className={`flex items-center gap-2 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                        <Hand className="w-4 h-4 text-emerald-400" />
                        الصلوات (من 35)
                      </Label>
                      <Input
                        type="text"
                        inputMode="numeric"
                        placeholder="اكتب العدد"
                        value={formData.prayers_count === 0 ? '' : formData.prayers_count}
                        onChange={(e) => { const d = e.target.value.replace(/[^0-9]/g, ''); setFormData({ ...formData, prayers_count: d === '' ? 0 : parseInt(d, 10) }); }}
                        className={isDark ? 'bg-slate-700 border-white/10 text-white' : ''}
                      />
                      <p className={`text-xs mt-1 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>5 صلوات × 7 أيام</p>
                    </div>

                    {/* الجلوس مع القرآن */}
                    <div>
                      <Label className={`flex items-center gap-2 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                        <BookOpen className="w-4 h-4 text-blue-400" />
                        الجلوس مع القرآن (من 35)
                      </Label>
                      <Input
                        type="text"
                        inputMode="numeric"
                        placeholder="اكتب العدد"
                        value={formData.quran_sitting_days === 0 ? '' : formData.quran_sitting_days}
                        onChange={(e) => { const d = e.target.value.replace(/[^0-9]/g, ''); setFormData({ ...formData, quran_sitting_days: d === '' ? 0 : parseInt(d, 10) }); }}
                        className={isDark ? 'bg-slate-700 border-white/10 text-white' : ''}
                      />
                    </div>

                    {/* بنود المشرف المخصصة */}
                    {customItems.map((it) => (
                      <div key={it.id}>
                        <Label className={`flex items-center gap-2 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                          <span className="text-base">{it.icon || '⭐'}</span>
                          {it.name} (من {it.max_points})
                        </Label>
                        <Input
                          type="text"
                          inputMode="numeric"
                          placeholder="اكتب العدد"
                          value={(customValues[it.id] ?? 0) === 0 ? '' : customValues[it.id]}
                          onChange={(e) => { const d = e.target.value.replace(/[^0-9]/g, ''); setCustomValues({ ...customValues, [it.id]: d === '' ? 0 : parseInt(d, 10) }); }}
                          className={isDark ? 'bg-slate-700 border-white/10 text-white' : ''}
                        />
                      </div>
                    ))}
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
                  <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>الحد الأقصى: {70 + customMax()} نقطة</p>
                  {calculatePoints() >= 0.9 * (70 + customMax()) && (
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

      {/* Points Guide — ديناميكي حسب بنود المشرف (#3) */}
      <Card className={isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'}>
        <CardHeader>
          <CardTitle className={isDark ? 'text-white' : 'text-slate-900'}>دليل النقاط (المجموع {70 + customMax()} نقطة)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
            <div className={`p-2 rounded-lg text-center ${isDark ? 'bg-emerald-500/10' : 'bg-emerald-50'}`}>
              <div className="text-lg">🤲</div>
              <p className={`text-xs ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>الصلوات</p>
              <p className="text-sm font-bold text-emerald-400">35</p>
            </div>
            <div className={`p-2 rounded-lg text-center ${isDark ? 'bg-blue-500/10' : 'bg-blue-50'}`}>
              <div className="text-lg">📖</div>
              <p className={`text-xs ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>الجلوس مع القرآن</p>
              <p className="text-sm font-bold text-blue-400">35</p>
            </div>
            {customItems.map((it) => (
              <div key={it.id} className={`p-2 rounded-lg text-center ${isDark ? 'bg-purple-500/10' : 'bg-purple-50'}`}>
                <div className="text-lg">{it.icon || '⭐'}</div>
                <p className={`text-xs ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{it.name}</p>
                <p className="text-sm font-bold text-purple-400">{it.max_points}</p>
              </div>
            ))}
          </div>
          <div className={`mt-3 p-2 rounded-lg text-center ${isDark ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-emerald-50 border border-emerald-200'}`}>
            <p className="text-lg font-bold text-emerald-400">المجموع الأسبوعي: {70 + customMax()} نقطة</p>
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
                    <span className={isDark ? 'text-slate-400' : 'text-slate-600'}>الجلوس مع القرآن:</span>
                    <span className="text-blue-400 font-bold">{selectedSheet.data?.quran_sitting_days || 0}/35</span>
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
