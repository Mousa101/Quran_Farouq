import { useState, useEffect } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Label } from '../components/ui/label';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Badge } from '../components/ui/badge';
import { BookOpen, User, CheckCircle, Loader2, AlertCircle, Star } from 'lucide-react';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const InitialAssessment = () => {
  const [pendingStudents, setPendingStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  
  const [formData, setFormData] = useState({
    previousJuz: [],
    additionalPages: 0,
    tajweedLevel: 'تمهيدية',
    notes: ''
  });

  useEffect(() => {
    fetchPendingStudents();
  }, []);

  const fetchPendingStudents = async () => {
    try {
      const response = await axios.get(`${API}/students/pending-assessment`);
      setPendingStudents(response.data);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleJuzToggle = (juzNumber) => {
    setFormData(prev => {
      const currentJuz = prev.previousJuz;
      if (currentJuz.includes(juzNumber)) {
        return { ...prev, previousJuz: currentJuz.filter(j => j !== juzNumber) };
      } else {
        return { ...prev, previousJuz: [...currentJuz, juzNumber].sort((a, b) => a - b) };
      }
    });
  };

  const openAssessmentDialog = (student) => {
    setSelectedStudent(student);
    setFormData({
      previousJuz: [],
      additionalPages: 0,
      tajweedLevel: 'تمهيدية',
      notes: ''
    });
    setDialogOpen(true);
  };

  const handleSubmitAssessment = async () => {
    if (!selectedStudent) return;
    
    setSubmitting(true);
    try {
      await axios.post(`${API}/students/${selectedStudent.id}/initial-assessment`, {
        student_id: selectedStudent.id,
        previous_memorization_juz: formData.previousJuz,
        previous_memorization_pages: formData.additionalPages,
        tajweed_level: formData.tajweedLevel,
        notes: formData.notes
      });
      
      toast.success('تم تسجيل التقييم الأولي بنجاح');
      setDialogOpen(false);
      setSelectedStudent(null);
      fetchPendingStudents();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل تسجيل التقييم');
    } finally {
      setSubmitting(false);
    }
  };

  const calculateTotalPages = () => {
    return formData.previousJuz.length * 20 + formData.additionalPages;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fadeIn" data-testid="initial-assessment-page">
      <div>
        <h1 className="text-2xl font-bold text-white">التقييم الأولي للطلاب</h1>
        <p className="text-slate-400">تسجيل الحفظ السابق ومستوى التجويد للطلاب الجدد</p>
      </div>

      {/* Pending Students */}
      <Card className="glass-card border-white/10">
        <CardHeader>
          <CardTitle className="text-xl font-bold text-white flex items-center gap-3">
            <AlertCircle className="w-6 h-6 text-amber-400" />
            طلاب بحاجة للتقييم ({pendingStudents.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {pendingStudents.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <CheckCircle className="w-16 h-16 mx-auto mb-4 text-emerald-500 opacity-50" />
              <p>جميع الطلاب تم تقييمهم</p>
            </div>
          ) : (
            <div className="space-y-4">
              {pendingStudents.map((student) => (
                <div
                  key={student.id}
                  className="p-4 rounded-xl bg-slate-800/50 border border-amber-500/30 hover:border-emerald-500/30 transition-all"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center">
                        <User className="w-6 h-6 text-amber-400" />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-white">{student.name}</h3>
                        <p className="text-slate-400 text-sm">{student.email}</p>
                        {student.registration_date && (
                          <p className="text-slate-500 text-xs mt-1">
                            تاريخ التسجيل: {new Date(student.registration_date).toLocaleDateString('ar-SA')}
                          </p>
                        )}
                      </div>
                    </div>
                    
                    <Button
                      onClick={() => openAssessmentDialog(student)}
                      className="bg-emerald-500 hover:bg-emerald-600"
                    >
                      <BookOpen className="w-5 h-5 ml-2" />
                      تقييم الطالب
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Assessment Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-slate-900 border-slate-700 max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white text-xl flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-emerald-400" />
              التقييم الأولي للطالب: {selectedStudent?.name}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-6 mt-4">
            {/* Previous Memorization Juz */}
            <div className="space-y-3">
              <Label className="text-slate-300">الأجزاء المحفوظة سابقاً</Label>
              <div className="grid grid-cols-6 gap-2 max-h-48 overflow-y-auto p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                {Array.from({ length: 30 }, (_, i) => i + 1).map((juz) => (
                  <div
                    key={juz}
                    onClick={() => handleJuzToggle(juz)}
                    className={`p-2 text-center rounded-lg cursor-pointer transition-all text-sm font-bold ${
                      formData.previousJuz.includes(juz)
                        ? 'bg-emerald-500 text-white'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    {juz}
                  </div>
                ))}
              </div>
              {formData.previousJuz.length > 0 && (
                <p className="text-emerald-400 text-sm">
                  الأجزاء المختارة: {formData.previousJuz.join(', ')} ({formData.previousJuz.length} جزء)
                </p>
              )}
            </div>

            {/* Additional Pages */}
            <div className="space-y-2">
              <Label className="text-slate-300">صفحات إضافية (بداية جزء جديد)</Label>
              <Input
                type="number"
                min="0"
                max="19"
                value={formData.additionalPages}
                onChange={(e) => setFormData({ ...formData, additionalPages: parseInt(e.target.value) || 0 })}
                className="bg-slate-800 border-slate-700 text-white w-32"
              />
              <p className="text-slate-500 text-xs">صفحات من جزء لم يكتمل حفظه</p>
            </div>

            {/* Total Calculation */}
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
              <div className="flex items-center justify-between">
                <span className="text-slate-300">إجمالي الحفظ السابق:</span>
                <span className="text-2xl font-bold text-emerald-400">
                  {calculateTotalPages()} صفحة
                </span>
              </div>
              <p className="text-slate-400 text-sm mt-1">
                ({formData.previousJuz.length} جزء × 20 صفحة) + {formData.additionalPages} صفحة
              </p>
            </div>

            {/* Tajweed Level */}
            <div className="space-y-2">
              <Label className="text-slate-300">مستوى التجويد</Label>
              <Select 
                value={formData.tajweedLevel} 
                onValueChange={(v) => setFormData({ ...formData, tajweedLevel: v })}
              >
                <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="تلاوة عامة" className="text-white">
                    <div className="flex items-center gap-2">
                      <Star className="w-4 h-4 text-slate-500" />
                      تلاوة عامة
                    </div>
                  </SelectItem>
                  <SelectItem value="تمهيدية" className="text-white">
                    <div className="flex items-center gap-2">
                      <Star className="w-4 h-4 text-slate-400" />
                      تمهيدية
                    </div>
                  </SelectItem>
                  <SelectItem value="متوسطة" className="text-white">
                    <div className="flex items-center gap-2">
                      <Star className="w-4 h-4 text-blue-400" />
                      <Star className="w-4 h-4 text-blue-400" />
                      متوسطة
                    </div>
                  </SelectItem>
                  <SelectItem value="متقدمة" className="text-white">
                    <div className="flex items-center gap-2">
                      <Star className="w-4 h-4 text-amber-400" />
                      <Star className="w-4 h-4 text-amber-400" />
                      <Star className="w-4 h-4 text-amber-400" />
                      متقدمة
                    </div>
                  </SelectItem>
                  <SelectItem value="إجازة" className="text-white">
                    <div className="flex items-center gap-2">
                      <Star className="w-4 h-4 text-emerald-400" />
                      <Star className="w-4 h-4 text-emerald-400" />
                      <Star className="w-4 h-4 text-emerald-400" />
                      <Star className="w-4 h-4 text-emerald-400" />
                      إجازة
                    </div>
                  </SelectItem>
                  <SelectItem value="اتقان" className="text-white">
                    <div className="flex items-center gap-2">
                      <Star className="w-4 h-4 text-purple-400" />
                      <Star className="w-4 h-4 text-purple-400" />
                      <Star className="w-4 h-4 text-purple-400" />
                      <Star className="w-4 h-4 text-purple-400" />
                      <Star className="w-4 h-4 text-purple-400" />
                      اتقان
                    </div>
                  </SelectItem>
                  <SelectItem value="سند غيبي" className="text-white">
                    <div className="flex items-center gap-2">
                      <BookOpen className="w-4 h-4 text-amber-500" />
                      سند غيبي
                    </div>
                  </SelectItem>
                  <SelectItem value="روايات أخرى" className="text-white">
                    <div className="flex items-center gap-2">
                      <BookOpen className="w-4 h-4 text-cyan-400" />
                      روايات أخرى
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label className="text-slate-300">ملاحظات (اختياري)</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="bg-slate-800 border-slate-700 text-white"
                placeholder="أي ملاحظات عن مستوى الطالب..."
              />
            </div>
          </div>

          <DialogFooter className="mt-6">
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>إلغاء</Button>
            <Button 
              onClick={handleSubmitAssessment} 
              className="bg-emerald-500 hover:bg-emerald-600"
              disabled={submitting}
            >
              {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'حفظ التقييم'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default InitialAssessment;
