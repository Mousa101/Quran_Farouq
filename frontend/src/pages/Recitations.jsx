import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Checkbox } from '../components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '../components/ui/radio-group';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '../components/ui/dialog';
import { Slider } from '../components/ui/slider';
import { BookOpen, Plus, Loader2, CheckCircle, FileText, RotateCcw, Edit, Trash2, Star, Info } from 'lucide-react';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Quran Juz page ranges (based on Madani Mushaf)
const JUZ_PAGE_RANGES = {
  1: { start: 1, end: 21, name: 'الجزء الأول' },
  2: { start: 22, end: 41, name: 'الجزء الثاني' },
  3: { start: 42, end: 61, name: 'الجزء الثالث' },
  4: { start: 62, end: 81, name: 'الجزء الرابع' },
  5: { start: 82, end: 101, name: 'الجزء الخامس' },
  6: { start: 102, end: 121, name: 'الجزء السادس' },
  7: { start: 122, end: 141, name: 'الجزء السابع' },
  8: { start: 142, end: 161, name: 'الجزء الثامن' },
  9: { start: 162, end: 181, name: 'الجزء التاسع' },
  10: { start: 182, end: 201, name: 'الجزء العاشر' },
  11: { start: 202, end: 221, name: 'الجزء الحادي عشر' },
  12: { start: 222, end: 241, name: 'الجزء الثاني عشر' },
  13: { start: 242, end: 261, name: 'الجزء الثالث عشر' },
  14: { start: 262, end: 281, name: 'الجزء الرابع عشر' },
  15: { start: 282, end: 301, name: 'الجزء الخامس عشر' },
  16: { start: 302, end: 321, name: 'الجزء السادس عشر' },
  17: { start: 322, end: 341, name: 'الجزء السابع عشر' },
  18: { start: 342, end: 361, name: 'الجزء الثامن عشر' },
  19: { start: 362, end: 381, name: 'الجزء التاسع عشر' },
  20: { start: 382, end: 401, name: 'الجزء العشرون' },
  21: { start: 402, end: 421, name: 'الجزء الحادي والعشرون' },
  22: { start: 422, end: 441, name: 'الجزء الثاني والعشرون' },
  23: { start: 442, end: 461, name: 'الجزء الثالث والعشرون' },
  24: { start: 462, end: 481, name: 'الجزء الرابع والعشرون' },
  25: { start: 482, end: 501, name: 'الجزء الخامس والعشرون' },
  26: { start: 502, end: 521, name: 'الجزء السادس والعشرون' },
  27: { start: 522, end: 541, name: 'الجزء السابع والعشرون' },
  28: { start: 542, end: 561, name: 'الجزء الثامن والعشرون' },
  29: { start: 562, end: 581, name: 'الجزء التاسع والعشرون' },
  30: { start: 582, end: 604, name: 'الجزء الثلاثون' }
};

const getInitialFormData = (juzNumber = 1) => {
  const juzRange = JUZ_PAGE_RANGES[juzNumber];
  return {
    student_id: '',
    recitation_type: 'combined',  // combined = حفظ ومراجعة معاً
    // حفظ جديد
    has_new_memorization: false,
    juz_number: juzNumber,
    page_from: juzRange.start,
    page_to: juzRange.start,
    rating: 7,
    error_count: 0,
    passed_minimum: false,
    // مراجعة
    has_review: false,
    review_juz: [],
    partial_review_juz: null,
    partial_review_pages: 0,
    passed_review_minimum: false,
    notes: ''
  };
};

const Recitations = () => {
  const [recitations, setRecitations] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedRecitation, setSelectedRecitation] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState(getInitialFormData());

  const fetchData = useCallback(async () => {
    try {
      const [recitationsRes, groupsRes] = await Promise.all([
        axios.get(`${API}/recitations`),
        axios.get(`${API}/groups`)
      ]);
      
      setRecitations(recitationsRes.data);
      
      const allStudents = [];
      for (const group of groupsRes.data) {
        const studentsRes = await axios.get(`${API}/groups/${group.id}/students`);
        allStudents.push(...studentsRes.data);
      }
      setStudents(allStudents);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleJuzChange = (newJuzNumber) => {
    const juzRange = JUZ_PAGE_RANGES[newJuzNumber];
    setFormData(prev => ({
      ...prev,
      juz_number: newJuzNumber,
      page_from: juzRange.start,
      page_to: juzRange.start
    }));
  };

  const handleJuzToggle = (juzNumber) => {
    setFormData(prev => {
      const currentJuz = prev.review_juz || [];
      if (currentJuz.includes(juzNumber)) {
        return { ...prev, review_juz: currentJuz.filter(j => j !== juzNumber) };
      } else {
        return { ...prev, review_juz: [...currentJuz, juzNumber] };
      }
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    
    try {
      const response = await axios.post(`${API}/recitations`, formData);
      toast.success(`تم تسجيل التسميع بنجاح - ${response.data.points_earned} نقطة`);
      setDialogOpen(false);
      setFormData(getInitialFormData());
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل تسجيل التسميع');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    if (!selectedRecitation) return;
    setSubmitting(true);
    
    try {
      const response = await axios.put(`${API}/recitations/${selectedRecitation.id}`, formData);
      toast.success(`تم تحديث التسميع - ${response.data.points_earned} نقطة`);
      setEditDialogOpen(false);
      setSelectedRecitation(null);
      setFormData(getInitialFormData());
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل تحديث التسميع');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedRecitation) return;
    setSubmitting(true);
    
    try {
      await axios.delete(`${API}/recitations/${selectedRecitation.id}`);
      toast.success('تم حذف التسميع بنجاح');
      setDeleteDialogOpen(false);
      setSelectedRecitation(null);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل حذف التسميع');
    } finally {
      setSubmitting(false);
    }
  };

  const openEditDialog = (rec) => {
    setSelectedRecitation(rec);
    const juzRange = JUZ_PAGE_RANGES[rec.juz_number || 1];
    setFormData({
      student_id: rec.student_id,
      recitation_type: rec.recitation_type,
      juz_number: rec.juz_number || 1,
      page_from: rec.page_from || juzRange.start,
      page_to: rec.page_to || juzRange.start,
      rating: rec.rating || 7,
      error_count: rec.error_count || 0,
      passed_minimum: rec.passed_minimum || false,
      review_juz: rec.review_juz || [],
      partial_review_juz: rec.partial_review_juz || null,
      partial_review_pages: rec.partial_review_pages || 0,
      passed_review_minimum: rec.passed_review_minimum || false,
      notes: rec.notes || ''
    });
    setEditDialogOpen(true);
  };

  const getStudentName = (studentId) => {
    const student = students.find(s => s.id === studentId);
    return student?.name || 'غير معروف';
  };

  const formatRecitationDetails = (rec) => {
    if (rec.recitation_type === 'new_memorization') {
      let details = [];
      if (rec.juz_number) details.push(`الجزء ${rec.juz_number}`);
      if (rec.page_from && rec.page_to) {
        details.push(`صفحة ${rec.page_from} - ${rec.page_to}`);
      } else if (rec.pages_count) {
        details.push(`${rec.pages_count} صفحة`);
      }
      if (rec.rating) details.push(`التقييم: ${rec.rating}/10`);
      if (rec.error_count) details.push(`الأخطاء: ${rec.error_count}`);
      return details.join(' | ');
    } else {
      let details = [];
      if (rec.review_juz && rec.review_juz.length > 0) {
        details.push(`الأجزاء: ${rec.review_juz.sort((a,b) => a-b).join(', ')}`);
      }
      if (rec.partial_review_pages && rec.partial_review_pages > 0) {
        const juzText = rec.partial_review_juz ? ` من جزء ${rec.partial_review_juz}` : '';
        details.push(`${rec.partial_review_pages} صفحات${juzText}`);
      }
      if (!rec.review_juz && rec.review_pages) {
        details.push(`${rec.review_pages} صفحة مراجعة`);
      }
      return details.join(' و ') || 'مراجعة';
    }
  };

  const juzRange = JUZ_PAGE_RANGES[formData.juz_number] || JUZ_PAGE_RANGES[1];

  const renderForm = (onSubmit, isEdit = false) => (
    <form onSubmit={onSubmit} className="space-y-4 mt-4">
      <div className="space-y-2">
        <Label className="text-slate-300">الطالب</Label>
        <Select 
          value={formData.student_id} 
          onValueChange={(v) => setFormData({ ...formData, student_id: v })}
          disabled={isEdit}
        >
          <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
            <SelectValue placeholder="اختر الطالب" />
          </SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-700 max-h-60">
            {students.map((student) => (
              <SelectItem key={student.id} value={student.id} className="text-white">
                {student.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-3">
        <Label className="text-slate-300 text-lg font-bold">نوع التسميع</Label>
        <p className="text-slate-400 text-sm">يمكنك تسجيل حفظ جديد ومراجعة معاً في نفس الخانة</p>
        
        {/* خيار الحفظ الجديد */}
        <div 
          className={`p-3 rounded-xl border-2 cursor-pointer transition-all ${
            formData.has_new_memorization 
              ? 'border-emerald-500 bg-emerald-500/10' 
              : 'border-slate-700 hover:border-slate-600'
          }`}
          onClick={() => setFormData({ ...formData, has_new_memorization: !formData.has_new_memorization })}
        >
          <div className="flex items-center gap-3">
            <Checkbox 
              checked={formData.has_new_memorization}
              className="border-emerald-500 data-[state=checked]:bg-emerald-500"
            />
            <FileText className="w-5 h-5 text-emerald-400" />
            <span className="text-white font-medium">حفظ جديد</span>
          </div>
        </div>
        
        {/* خيار المراجعة */}
        <div 
          className={`p-3 rounded-xl border-2 cursor-pointer transition-all ${
            formData.has_review 
              ? 'border-blue-500 bg-blue-500/10' 
              : 'border-slate-700 hover:border-slate-600'
          }`}
          onClick={() => setFormData({ ...formData, has_review: !formData.has_review })}
        >
          <div className="flex items-center gap-3">
            <Checkbox 
              checked={formData.has_review}
              className="border-blue-500 data-[state=checked]:bg-blue-500"
            />
            <RotateCcw className="w-5 h-5 text-blue-400" />
            <span className="text-white font-medium">مراجعة</span>
          </div>
        </div>
      </div>

      {/* قسم الحفظ الجديد */}
      {formData.has_new_memorization && (
        <div className="space-y-4 p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
          <div className="space-y-2">
            <Label className="text-slate-300">الجزء</Label>
            <Select 
              value={String(formData.juz_number)} 
              onValueChange={(v) => handleJuzChange(parseInt(v))}
            >
              <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                <SelectValue placeholder="اختر الجزء" />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700 max-h-60">
                {Array.from({ length: 30 }, (_, i) => (
                  <SelectItem key={i + 1} value={String(i + 1)} className="text-white">
                    الجزء {i + 1} (ص {JUZ_PAGE_RANGES[i + 1].start} - {JUZ_PAGE_RANGES[i + 1].end})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-2">
            <Info className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <p className="text-emerald-300 text-sm">
              {juzRange.name}: من صفحة {juzRange.start} إلى صفحة {juzRange.end}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-slate-300">من صفحة</Label>
              <Input
                type="number"
                min={juzRange.start}
                max={juzRange.end}
                value={formData.page_from}
                onChange={(e) => {
                  const val = parseInt(e.target.value) || juzRange.start;
                  const bounded = Math.max(juzRange.start, Math.min(juzRange.end, val));
                  setFormData({ ...formData, page_from: bounded });
                }}
                className="bg-slate-800 border-slate-700 text-white"
              />
              <p className="text-xs text-slate-500">الحد الأدنى: {juzRange.start}</p>
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">إلى صفحة</Label>
              <Input
                type="number"
                min={formData.page_from}
                max={juzRange.end}
                value={formData.page_to}
                onChange={(e) => {
                  const val = parseInt(e.target.value) || formData.page_from;
                  const bounded = Math.max(formData.page_from, Math.min(juzRange.end, val));
                  setFormData({ ...formData, page_to: bounded });
                }}
                className="bg-slate-800 border-slate-700 text-white"
              />
              <p className="text-xs text-slate-500">الحد الأقصى: {juzRange.end}</p>
            </div>
          </div>

          <div className="text-center p-2 rounded-lg bg-slate-800/50">
            <span className="text-emerald-400 font-bold">
              عدد الصفحات: {Math.max(0, formData.page_to - formData.page_from + 1)} صفحة
            </span>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-slate-300">تقييم التسميع</Label>
              <span className="text-emerald-400 font-bold text-lg flex items-center gap-1">
                <Star className="w-4 h-4" />
                {formData.rating}/10
              </span>
            </div>
            <Slider
              value={[formData.rating]}
              onValueChange={(v) => setFormData({ ...formData, rating: v[0] })}
              min={1}
              max={10}
              step={1}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-slate-500">
              <span>ضعيف</span>
              <span>متوسط</span>
              <span>ممتاز</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-slate-300">عدد الأخطاء</Label>
            <Input
              type="number"
              min="0"
              max="50"
              value={formData.error_count}
              onChange={(e) => setFormData({ ...formData, error_count: parseInt(e.target.value) || 0 })}
              className="bg-slate-800 border-slate-700 text-white"
            />
          </div>
          
          <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/50">
            <Checkbox
              id={isEdit ? "passed_min_edit" : "passed_min"}
              checked={formData.passed_minimum}
              onCheckedChange={(checked) => setFormData({ ...formData, passed_minimum: checked })}
              className="border-emerald-500 data-[state=checked]:bg-emerald-500"
            />
            <Label htmlFor={isEdit ? "passed_min_edit" : "passed_min"} className="text-white cursor-pointer flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-400" />
              اجتاز الحد الأدنى
            </Label>
          </div>
        </div>
      )}

      {formData.recitation_type === 'review' && (
        <div className="space-y-4 p-4 rounded-xl bg-blue-500/5 border border-blue-500/20">
          <div className="space-y-2">
            <Label className="text-slate-300">الأجزاء المراجعة كاملة</Label>
            <div className="grid grid-cols-6 gap-2 max-h-40 overflow-y-auto p-2 bg-slate-800/50 rounded-lg">
              {Array.from({ length: 30 }, (_, i) => i + 1).map((juz) => (
                <div
                  key={juz}
                  onClick={() => handleJuzToggle(juz)}
                  className={`p-2 text-center rounded-lg cursor-pointer transition-all text-sm ${
                    formData.review_juz?.includes(juz)
                      ? 'bg-blue-500 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  {juz}
                </div>
              ))}
            </div>
            {formData.review_juz?.length > 0 && (
              <p className="text-blue-400 text-sm">
                الأجزاء المختارة: {formData.review_juz.sort((a,b) => a-b).join(', ')}
              </p>
            )}
          </div>

          <div className="p-3 rounded-lg bg-slate-800/30 border border-slate-700 space-y-3">
            <Label className="text-slate-300 block">مراجعة جزئية (صفحات من جزء)</Label>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-slate-400 text-sm">عدد الصفحات</Label>
                <Input
                  type="number"
                  min="0"
                  max="20"
                  value={formData.partial_review_pages || 0}
                  onChange={(e) => setFormData({ ...formData, partial_review_pages: parseInt(e.target.value) || 0 })}
                  className="bg-slate-800 border-slate-700 text-white"
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-400 text-sm">من جزء</Label>
                <Select 
                  value={formData.partial_review_juz ? String(formData.partial_review_juz) : ""} 
                  onValueChange={(v) => setFormData({ ...formData, partial_review_juz: v ? parseInt(v) : null })}
                >
                  <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                    <SelectValue placeholder="اختر الجزء" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700 max-h-60">
                    {Array.from({ length: 30 }, (_, i) => (
                      <SelectItem key={i + 1} value={String(i + 1)} className="text-white">
                        الجزء {i + 1}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {(formData.review_juz?.length > 0 || formData.partial_review_pages > 0) && (
            <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <p className="text-blue-300 text-sm">
                <span className="font-bold">الناتج: </span>
                {formData.review_juz?.length > 0 && `مراجعة الأجزاء ${formData.review_juz.sort((a,b) => a-b).join(', ')}`}
                {formData.review_juz?.length > 0 && formData.partial_review_pages > 0 && ' و '}
                {formData.partial_review_pages > 0 && `${formData.partial_review_pages} صفحات${formData.partial_review_juz ? ` من جزء ${formData.partial_review_juz}` : ''}`}
              </p>
            </div>
          )}

          <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/50">
            <Checkbox
              id={isEdit ? "passed_review_edit" : "passed_review"}
              checked={formData.passed_review_minimum}
              onCheckedChange={(checked) => setFormData({ ...formData, passed_review_minimum: checked })}
              className="border-blue-500 data-[state=checked]:bg-blue-500"
            />
            <Label htmlFor={isEdit ? "passed_review_edit" : "passed_review"} className="text-white cursor-pointer flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-blue-400" />
              اجتاز الحد الأدنى للمراجعة
            </Label>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label className="text-slate-300">ملاحظات (اختياري)</Label>
        <Textarea
          value={formData.notes}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          className="bg-slate-800 border-slate-700 text-white"
          placeholder="أي ملاحظات إضافية..."
        />
      </div>

      <Button
        type="submit"
        className="w-full bg-emerald-500 hover:bg-emerald-600"
        disabled={submitting || !formData.student_id}
      >
        {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : isEdit ? 'تحديث' : 'حفظ'}
      </Button>
    </form>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fadeIn" data-testid="recitations-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">تسجيل التسميع</h1>
          <p className="text-slate-400">تسجيل الحفظ الجديد والمراجعة</p>
        </div>
        
        <Dialog open={dialogOpen} onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setFormData(getInitialFormData());
        }}>
          <DialogTrigger asChild>
            <Button className="bg-emerald-500 hover:bg-emerald-600">
              <Plus className="w-5 h-5 ml-2" />
              تسجيل تسميع
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-slate-900 border-slate-700 max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-white text-xl">تسجيل تسميع جديد</DialogTitle>
            </DialogHeader>
            {renderForm(handleSubmit)}
          </DialogContent>
        </Dialog>
      </div>

      <Card className="glass-card border-white/10">
        <CardHeader>
          <CardTitle className="text-xl font-bold text-white">سجل التسميعات</CardTitle>
        </CardHeader>
        <CardContent>
          {recitations.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <BookOpen className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <p>لم يتم تسجيل أي تسميع بعد</p>
            </div>
          ) : (
            <div className="space-y-4">
              {recitations.map((rec) => (
                <div
                  key={rec.id}
                  className="p-4 rounded-xl bg-slate-800/50 border border-white/5 hover:border-emerald-500/30 transition-all"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="text-lg font-bold text-white">{getStudentName(rec.student_id)}</h3>
                      <p className="text-slate-400 text-sm">
                        {new Date(rec.created_at).toLocaleDateString('ar-SA')}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-3 py-1 rounded-full text-sm font-bold ${
                        rec.recitation_type === 'new_memorization'
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : 'bg-blue-500/20 text-blue-400'
                      }`}>
                        {rec.recitation_type === 'new_memorization' ? 'حفظ جديد' : 'مراجعة'}
                      </span>
                      
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-blue-400 hover:text-blue-300 hover:bg-blue-500/10"
                        onClick={() => openEditDialog(rec)}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                        onClick={() => {
                          setSelectedRecitation(rec);
                          setDeleteDialogOpen(true);
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3 text-sm">
                    <span className="text-slate-300">{formatRecitationDetails(rec)}</span>
                    
                    {(rec.passed_minimum || rec.passed_review_minimum) && (
                      <span className={`flex items-center gap-1 ${
                        rec.recitation_type === 'new_memorization' ? 'text-emerald-400' : 'text-blue-400'
                      }`}>
                        <CheckCircle className="w-4 h-4" />
                        اجتاز
                      </span>
                    )}
                    
                    <span className="text-amber-400 font-bold">
                      +{rec.points_earned} نقطة
                    </span>
                  </div>

                  {rec.notes && (
                    <p className="text-slate-400 text-sm mt-3 p-2 bg-slate-900/50 rounded-lg">{rec.notes}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={editDialogOpen} onOpenChange={(open) => {
        setEditDialogOpen(open);
        if (!open) {
          setSelectedRecitation(null);
          setFormData(getInitialFormData());
        }
      }}>
        <DialogContent className="bg-slate-900 border-slate-700 max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white text-xl">تعديل التسميع</DialogTitle>
          </DialogHeader>
          {renderForm(handleUpdate, true)}
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="bg-slate-900 border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-white">تأكيد الحذف</DialogTitle>
          </DialogHeader>
          <div className="mt-4">
            <p className="text-slate-300">هل أنت متأكد من حذف هذا التسميع؟</p>
            <p className="text-red-400 text-sm mt-2">
              سيتم خصم {selectedRecitation?.points_earned || 0} نقطة من رصيد الطالب.
            </p>
          </div>
          <DialogFooter className="mt-6">
            <Button variant="ghost" onClick={() => setDeleteDialogOpen(false)}>إلغاء</Button>
            <Button className="bg-red-500 hover:bg-red-600" onClick={handleDelete} disabled={submitting}>
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'حذف'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Recitations;
