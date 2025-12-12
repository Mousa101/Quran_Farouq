import { useState, useEffect } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Slider } from '../components/ui/slider';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { BookOpen, Plus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const Recitations = () => {
  const [recitations, setRecitations] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    student_id: '',
    surah_name: '',
    verses_from: 1,
    verses_to: 10,
    quality_score: 7,
    mistakes_count: 0,
    notes: ''
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [recitationsRes, groupsRes] = await Promise.all([
        axios.get(`${API}/recitations`),
        axios.get(`${API}/groups`)
      ]);
      
      setRecitations(recitationsRes.data);
      
      // Get all students
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
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    
    try {
      await axios.post(`${API}/recitations`, formData);
      toast.success('تم تسجيل التسميع بنجاح');
      setDialogOpen(false);
      setFormData({
        student_id: '',
        surah_name: '',
        verses_from: 1,
        verses_to: 10,
        quality_score: 7,
        mistakes_count: 0,
        notes: ''
      });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل تسجيل التسميع');
    } finally {
      setSubmitting(false);
    }
  };

  const getStudentName = (studentId) => {
    const student = students.find(s => s.id === studentId);
    return student?.name || 'غير معروف';
  };

  const getScoreColor = (score) => {
    if (score >= 8) return 'text-emerald-400 bg-emerald-500/20';
    if (score >= 5) return 'text-amber-400 bg-amber-500/20';
    return 'text-red-400 bg-red-500/20';
  };

  const surahs = [
    'الفاتحة', 'البقرة', 'آل عمران', 'النساء', 'المائدة', 'الأنعام', 'الأعراف',
    'الأنفال', 'التوبة', 'يونس', 'هود', 'يوسف', 'الرعد', 'إبراهيم', 'الحجر',
    'النحل', 'الإسراء', 'الكهف', 'مريم', 'طه', 'الأنبياء', 'الحج', 'المؤمنون',
    'النور', 'الفرقان', 'الشعراء', 'النمل', 'القصص', 'العنكبوت', 'الروم',
    'لقمان', 'السجدة', 'الأحزاب', 'سبأ', 'فاطر', 'يس', 'الصافات', 'ص',
    'الزمر', 'غافر', 'فصلت', 'الشورى', 'الزخرف', 'الدخان', 'الجاثية',
    'الأحقاف', 'محمد', 'الفتح', 'الحجرات', 'ق', 'الذاريات', 'الطور',
    'النجم', 'القمر', 'الرحمن', 'الواقعة', 'الحديد', 'المجادلة', 'الحشر',
    'الممتحنة', 'الصف', 'الجمعة', 'المنافقون', 'التغابن', 'الطلاق', 'التحريم',
    'الملك', 'القلم', 'الحاقة', 'المعارج', 'نوح', 'الجن', 'المزمل', 'المدثر',
    'القيامة', 'الإنسان', 'المرسلات', 'النبأ', 'النازعات', 'عبس', 'التكوير',
    'الانفطار', 'المطففين', 'الانشقاق', 'البروج', 'الطارق', 'الأعلى', 'الغاشية',
    'الفجر', 'البلد', 'الشمس', 'الليل', 'الضحى', 'الشرح', 'التين', 'العلق',
    'القدر', 'البينة', 'الزلزلة', 'العاديات', 'القارعة', 'التكاثر', 'العصر',
    'الهمزة', 'الفيل', 'قريش', 'الماعون', 'الكوثر', 'الكافرون', 'النصر',
    'المسد', 'الإخلاص', 'الفلق', 'الناس'
  ];

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
          <p className="text-slate-400">تسجيل وتقييم تسميع الطلاب</p>
        </div>
        
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-emerald-500 hover:bg-emerald-600" data-testid="add-recitation-btn">
              <Plus className="w-5 h-5 ml-2" />
              تسجيل تسميع
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-slate-900 border-slate-700 max-w-md">
            <DialogHeader>
              <DialogTitle className="text-white text-xl">تسجيل تسميع جديد</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label className="text-slate-300">الطالب</Label>
                <Select 
                  value={formData.student_id} 
                  onValueChange={(v) => setFormData({ ...formData, student_id: v })}
                >
                  <SelectTrigger className="bg-slate-800 border-slate-700 text-white" data-testid="recitation-student-select">
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

              <div className="space-y-2">
                <Label className="text-slate-300">السورة</Label>
                <Select 
                  value={formData.surah_name} 
                  onValueChange={(v) => setFormData({ ...formData, surah_name: v })}
                >
                  <SelectTrigger className="bg-slate-800 border-slate-700 text-white" data-testid="surah-select">
                    <SelectValue placeholder="اختر السورة" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700 max-h-60">
                    {surahs.map((surah) => (
                      <SelectItem key={surah} value={surah} className="text-white">
                        {surah}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-slate-300">من آية</Label>
                  <Input
                    type="number"
                    min="1"
                    value={formData.verses_from}
                    onChange={(e) => setFormData({ ...formData, verses_from: parseInt(e.target.value) || 1 })}
                    className="bg-slate-800 border-slate-700 text-white"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-slate-300">إلى آية</Label>
                  <Input
                    type="number"
                    min="1"
                    value={formData.verses_to}
                    onChange={(e) => setFormData({ ...formData, verses_to: parseInt(e.target.value) || 1 })}
                    className="bg-slate-800 border-slate-700 text-white"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-slate-300">درجة التسميع: {formData.quality_score}/10</Label>
                <Slider
                  value={[formData.quality_score]}
                  onValueChange={([v]) => setFormData({ ...formData, quality_score: v })}
                  min={1}
                  max={10}
                  step={1}
                  className="py-4"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-slate-300">عدد الأخطاء</Label>
                <Input
                  type="number"
                  min="0"
                  value={formData.mistakes_count}
                  onChange={(e) => setFormData({ ...formData, mistakes_count: parseInt(e.target.value) || 0 })}
                  className="bg-slate-800 border-slate-700 text-white"
                />
              </div>

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
                disabled={submitting || !formData.student_id || !formData.surah_name}
                data-testid="submit-recitation-btn"
              >
                {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'حفظ'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Recitations List */}
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
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-bold text-white">{getStudentName(rec.student_id)}</h3>
                      <p className="text-emerald-400">سورة {rec.surah_name}</p>
                      <p className="text-slate-400 text-sm">آية {rec.verses_from} - {rec.verses_to}</p>
                    </div>
                    <div className="text-left">
                      <span className={`px-4 py-2 rounded-xl text-lg font-bold ${getScoreColor(rec.quality_score)}`}>
                        {rec.quality_score}/10
                      </span>
                      {rec.mistakes_count > 0 && (
                        <p className="text-red-400 text-sm mt-2">{rec.mistakes_count} أخطاء</p>
                      )}
                    </div>
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
    </div>
  );
};

export default Recitations;
