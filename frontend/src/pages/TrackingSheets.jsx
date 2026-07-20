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
  Sunrise, Users, GraduationCap, Calendar, Sparkles, MessageCircle, Edit
} from 'lucide-react';
import { toast } from 'sonner';
import StudentLink from '../components/StudentLink';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const TrackingSheets = () => {
  const { isDark } = useTheme();
  const [sheets, setSheets] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedSheet, setSelectedSheet] = useState(null);
  const [activeTab, setActiveTab] = useState('manual');
  const [imagePreview, setImagePreview] = useState(null);
  const [imageBase64, setImageBase64] = useState('');
  const fileInputRef = useRef(null);
  // #3/#5 — بنود المتابعة المخصّصة + إدارتها بنفس مكان التسجيل
  const [customItems, setCustomItems] = useState([]);
  const [customValues, setCustomValues] = useState({});
  const [newItem, setNewItem] = useState({ name: '', max_points: '', icon: '⭐' });
  const [addingItem, setAddingItem] = useState(false);
  const ICON_CHOICES = ['⭐', '🕌', '📖', '🤲', '🌙', '☀️', '📿', '🕋', '💧', '📚', '🌱', '❤️', '✅', '🔥'];
  const customMax = () => customItems.reduce((s, it) => s + (it.max_points || 0), 0);
  
  const [formData, setFormData] = useState({
    student_id: '',
    week_start: '',
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

  const [editFormData, setEditFormData] = useState({
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

  const fetchCustomItems = async () => {
    try {
      const res = await axios.get(`${API}/tracking-items`);
      setCustomItems(res.data || []);
    } catch (e) { /* ignore */ }
  };

  const handleAddItem = async () => {
    const points = parseInt(newItem.max_points);
    if (!newItem.name.trim() || !points || points <= 0) {
      toast.error('أدخل اسم البند ونقاطه (أكبر من صفر)');
      return;
    }
    setAddingItem(true);
    try {
      await axios.post(`${API}/tracking-items`, { name: newItem.name.trim(), max_points: points, icon: newItem.icon || '⭐' });
      toast.success('تم إضافة البند');
      setNewItem({ name: '', max_points: '', icon: '⭐' });
      fetchCustomItems();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في إضافة البند');
    } finally {
      setAddingItem(false);
    }
  };

  const handleDeleteItem = async (id) => {
    try {
      await axios.delete(`${API}/tracking-items/${id}`);
      toast.success('تم حذف البند');
      fetchCustomItems();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في حذف البند');
    }
  };

  const fetchData = async () => {
    try {
      const [sheetsRes, groupsRes] = await Promise.all([
        axios.get(`${API}/tracking-sheets`),
        axios.get(`${API}/groups`)
      ]);
      fetchCustomItems();
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
      const res = await axios.post(`${API}/tracking-sheets/manual`, { ...formData, custom_values: customValues });
      toast.success(`تم إدخال ورقة المتابعة - ${res.data.points_breakdown.total_points} نقطة`);
      setDialogOpen(false);
      resetForm();
      setCustomValues({});
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
      duha_prayers: 0,
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
    const quran = Math.min(formData.quran_sitting_days, 35);
    const custom = customItems.reduce((s, it) => s + Math.min(Math.max(parseInt(customValues[it.id]) || 0, 0), it.max_points), 0);
    return prayers + quran + custom;
  };

  const calculateEditPoints = () => {
    const prayers = Math.min(editFormData.prayers_count, 35);
    const quran = Math.min(editFormData.quran_sitting_days, 35);
    return prayers + quran; // 70
  };

  const viewSheet = (sheet) => {
    setSelectedSheet(sheet);
    setViewDialogOpen(true);
  };

  const openEditDialog = (sheet) => {
    setSelectedSheet(sheet);
    const data = sheet.data || {};
    setEditFormData({
      prayers_count: data.prayers_count || 0,
      adhkar_after_prayer: data.adhkar_after_prayer || 0,
      quran_sitting_days: data.quran_sitting_days || 0,
      duha_prayers: data.duha_prayers || 0,
      family_recitation: data.family_recitation || 0,
      study_hours: data.study_hours || 0,
      witr_prayers_days: data.witr_prayers_days || 0,
      sunnah_prayers: data.sunnah_prayers || 0,
      night_prayer: data.night_prayer || 0,
      fasting: data.fasting || 0,
      notes: data.notes || ''
    });
    setEditDialogOpen(true);
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!selectedSheet) return;
    setSubmitting(true);
    
    try {
      const res = await axios.put(`${API}/tracking-sheets/${selectedSheet.id}`, editFormData);
      toast.success(`تم تحديث ورقة المتابعة - ${res.data.new_points} نقطة`);
      setEditDialogOpen(false);
      setSelectedSheet(null);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل تحديث ورقة المتابعة');
    } finally {
      setSubmitting(false);
    }
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
                            type="text"
                            inputMode="numeric"
                            placeholder="اكتب العدد"
                            value={formData.prayers_count === 0 ? '' : formData.prayers_count}
                            onChange={(e) => { const d = e.target.value.replace(/[^0-9]/g, ''); setFormData({ ...formData, prayers_count: d === '' ? 0 : parseInt(d, 10) }); }}
                            className={isDark ? 'bg-slate-700 border-white/10 text-white' : ''}
                          />
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
                      </div>

                      {/* بنود المشرف المخصّصة (#3) */}
                      {customItems.length > 0 && (
                        <div className="grid grid-cols-2 gap-4 mt-4">
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
                      )}
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
                      <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>الحد الأقصى: {70 + customMax()} نقطة</p>
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

      {/* Points Guide — ديناميكي (الأساس + بنود المشرف مع رموزها) #3 */}
      <Card className={isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'}>
        <CardHeader>
          <CardTitle className={isDark ? 'text-white' : 'text-slate-900'}>دليل النقاط (الأسبوعية)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2">
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
            <p className={`text-xs ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>الحد الأقصى الأسبوعي</p>
            <p className="text-xl font-bold text-emerald-400">{70 + customMax()} نقطة</p>
            <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>35 + 35{customMax() > 0 ? ` + ${customMax()}` : ''} = {70 + customMax()}</p>
          </div>
        </CardContent>
      </Card>

      {/* #5 — إدارة بنود المتابعة بنفس مكان التسجيل */}
      <Card className={isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'}>
        <CardHeader>
          <CardTitle className={`flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
            <Star className="w-5 h-5 text-purple-400" /> بنود المتابعة (نقاط + رمز)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {customItems.length > 0 && (
            <div className="space-y-2">
              {customItems.map((it) => (
                <div key={it.id} className={`flex items-center justify-between p-2 rounded-lg ${isDark ? 'bg-slate-800/50' : 'bg-slate-100'}`}>
                  <span className={`flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}><span className="text-lg">{it.icon || '⭐'}</span>{it.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-purple-400 font-bold text-sm">{it.max_points}</span>
                    <Button size="sm" variant="ghost" onClick={() => handleDeleteItem(it.id)} className="text-red-400 hover:bg-red-500/20 h-7 w-7 p-0">✕</Button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-[140px]">
              <Label className={`text-xs ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>اسم البند</Label>
              <Input value={newItem.name} onChange={(e) => setNewItem({ ...newItem, name: e.target.value })} placeholder="مثال: قيام الليل" className={isDark ? 'bg-slate-700 border-white/10 text-white' : ''} />
            </div>
            <div className="w-20">
              <Label className={`text-xs ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>النقاط</Label>
              <Input type="text" inputMode="numeric" value={newItem.max_points} onChange={(e) => setNewItem({ ...newItem, max_points: e.target.value.replace(/[^0-9]/g, '') })} placeholder="10" className={isDark ? 'bg-slate-700 border-white/10 text-white' : ''} />
            </div>
            <Button onClick={handleAddItem} disabled={addingItem} className="bg-purple-600 hover:bg-purple-700">
              {addingItem ? <Loader2 className="w-4 h-4 animate-spin" /> : 'إضافة'}
            </Button>
          </div>
          <div className="flex flex-wrap gap-1">
            {ICON_CHOICES.map((ic) => (
              <button key={ic} type="button" onClick={() => setNewItem({ ...newItem, icon: ic })}
                className={`w-8 h-8 rounded-lg text-base ${newItem.icon === ic ? 'bg-purple-500/30 ring-2 ring-purple-400' : (isDark ? 'bg-slate-800' : 'bg-slate-100')}`}>{ic}</button>
            ))}
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
                      <StudentLink studentId={sheet.student_id} name={getStudentName(sheet.student_id)} className={`font-medium ${isDark ? 'text-white' : 'text-slate-900'}`} />
                      <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                        أسبوع {sheet.week_start}
                        {sheet.submitted_by_student && <span className="text-emerald-400 mr-2">• سجّلها الطالب</span>}
                        {sheet.updated_by_sheikh && <span className="text-blue-400 mr-2">• عدّلها المشرف</span>}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-left">
                      <p className="text-emerald-400 font-bold">{sheet.points_earned || sheet.total_points || 0} / 70</p>
                      <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                        نقطة أسبوعية
                      </p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => openEditDialog(sheet)} className="text-blue-400 hover:text-blue-300">
                      <Edit className="w-4 h-4" />
                    </Button>
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
                  {selectedSheet.points_earned || selectedSheet.total_points || 0} / 70
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
                      <span className="text-emerald-400 font-bold">{selectedSheet.points_breakdown.prayers ?? selectedSheet.data?.prayers_count ?? 0}/35</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className={`flex items-center gap-2 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                        <BookOpen className="w-4 h-4 text-blue-400" /> الجلوس مع القرآن
                      </span>
                      <span className="text-blue-400 font-bold">{selectedSheet.points_breakdown.quran ?? selectedSheet.points_breakdown.quran_sitting ?? selectedSheet.data?.quran_sitting_days ?? 0}/35</span>
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

      {/* Edit Sheet Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={(open) => {
        setEditDialogOpen(open);
        if (!open) setSelectedSheet(null);
      }}>
        <DialogContent className={`max-w-2xl max-h-[90vh] overflow-y-auto ${isDark ? 'bg-slate-900 border-white/10' : 'bg-white'}`}>
          <DialogHeader>
            <DialogTitle className={isDark ? 'text-white' : 'text-slate-900'}>
              تعديل ورقة المتابعة - {selectedSheet && getStudentName(selectedSheet.student_id)}
            </DialogTitle>
          </DialogHeader>
          
          <form onSubmit={handleEditSubmit} className="space-y-4 mt-4">
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
                    type="text"
                    inputMode="numeric"
                    placeholder="اكتب العدد"
                    value={editFormData.prayers_count === 0 ? '' : editFormData.prayers_count}
                    onChange={(e) => { const d = e.target.value.replace(/[^0-9]/g, ''); setEditFormData({ ...editFormData, prayers_count: d === '' ? 0 : parseInt(d, 10) }); }}
                    className={isDark ? 'bg-slate-700 border-white/10 text-white' : ''}
                  />
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
                    value={editFormData.quran_sitting_days === 0 ? '' : editFormData.quran_sitting_days}
                    onChange={(e) => { const d = e.target.value.replace(/[^0-9]/g, ''); setEditFormData({ ...editFormData, quran_sitting_days: d === '' ? 0 : parseInt(d, 10) }); }}
                    className={isDark ? 'bg-slate-700 border-white/10 text-white' : ''}
                  />
                </div>
              </div>
            </div>

            <div>
              <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>ملاحظات</Label>
              <Textarea
                value={editFormData.notes}
                onChange={(e) => setEditFormData({ ...editFormData, notes: e.target.value })}
                className={isDark ? 'bg-slate-800 border-white/10 text-white' : ''}
              />
            </div>

            {/* Points Preview */}
            <div className={`p-4 rounded-xl text-center ${isDark ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-emerald-50 border border-emerald-200'}`}>
              <p className={isDark ? 'text-slate-300' : 'text-slate-600'}>النقاط الجديدة</p>
              <p className="text-3xl font-bold text-emerald-400">{calculateEditPoints()} نقطة</p>
              <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                النقاط السابقة: {selectedSheet?.points_earned || 0} نقطة
              </p>
            </div>

            <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700" disabled={submitting}>
              {submitting ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : null}
              تحديث ورقة المتابعة
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TrackingSheets;
