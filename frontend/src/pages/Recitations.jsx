import { useState, useEffect } from 'react';
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
import { BookOpen, Plus, Loader2, CheckCircle, FileText, RotateCcw, Edit, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const Recitations = () => {
  const [recitations, setRecitations] = useState([]);
  const [students, setStudents] = useState([]);
  const [quranJuz, setQuranJuz] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedRecitation, setSelectedRecitation] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  
  const initialFormData = {
    student_id: '',
    recitation_type: 'new_memorization',
    pages_count: 1,
    passed_minimum: false,
    review_type: 'pages',
    review_pages: 1,
    review_juz: [],
    passed_review_minimum: false,
    notes: ''
  };

  const [formData, setFormData] = useState(initialFormData);

  useEffect(() => {
    fetchData();
    fetchQuranJuz();
  }, []);

  const fetchData = async () => {
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
  };

  const fetchQuranJuz = async () => {
    try {
      const response = await axios.get(`${API}/quran/juz`);
      setQuranJuz(response.data);
    } catch (error) {
      console.error('Error fetching juz:', error);
    }
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
      resetForm();
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
      resetForm();
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
    setFormData({
      student_id: rec.student_id,
      recitation_type: rec.recitation_type,
      pages_count: rec.pages_count || 1,
      passed_minimum: rec.passed_minimum || false,
      review_type: rec.review_type || 'pages',
      review_pages: rec.review_pages || 1,
      review_juz: rec.review_juz || [],
      passed_review_minimum: rec.passed_review_minimum || false,
      notes: rec.notes || ''
    });
    setEditDialogOpen(true);
  };

  const resetForm = () => {
    setFormData(initialFormData);
  };

  const getStudentName = (studentId) => {
    const student = students.find(s => s.id === studentId);
    return student?.name || 'غير معروف';
  };

  // Recitation Form Component (reused for create and edit)
  const RecitationForm = ({ onSubmit, isEdit = false }) => (
    <form onSubmit={onSubmit} className="space-y-4 mt-4">
      {/* Student Selection - disabled in edit mode */}
      <div className="space-y-2">
        <Label className="text-slate-300">الطالب</Label>
        <Select 
          value={formData.student_id} 
          onValueChange={(v) => setFormData({ ...formData, student_id: v })}
          disabled={isEdit}
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

      {/* Recitation Type */}
      <div className="space-y-3">
        <Label className="text-slate-300">نوع التسميع</Label>
        <RadioGroup 
          value={formData.recitation_type} 
          onValueChange={(v) => setFormData({ ...formData, recitation_type: v })}
          className="grid grid-cols-2 gap-3"
        >
          <div>
            <RadioGroupItem value="new_memorization" id={isEdit ? "new-edit" : "new"} className="peer sr-only" />
            <Label
              htmlFor={isEdit ? "new-edit" : "new"}
              className="flex items-center gap-2 p-3 rounded-xl border-2 border-slate-700 cursor-pointer transition-all peer-data-[state=checked]:border-emerald-500 peer-data-[state=checked]:bg-emerald-500/10"
            >
              <FileText className="w-5 h-5 text-emerald-400" />
              <span className="text-white">حفظ جديد</span>
            </Label>
          </div>
          <div>
            <RadioGroupItem value="review" id={isEdit ? "review-edit" : "review"} className="peer sr-only" />
            <Label
              htmlFor={isEdit ? "review-edit" : "review"}
              className="flex items-center gap-2 p-3 rounded-xl border-2 border-slate-700 cursor-pointer transition-all peer-data-[state=checked]:border-blue-500 peer-data-[state=checked]:bg-blue-500/10"
            >
              <RotateCcw className="w-5 h-5 text-blue-400" />
              <span className="text-white">مراجعة</span>
            </Label>
          </div>
        </RadioGroup>
      </div>

      {/* New Memorization Fields */}
      {formData.recitation_type === 'new_memorization' && (
        <div className="space-y-4 p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
          <div className="space-y-2">
            <Label className="text-slate-300">عدد الصفحات المحفوظة</Label>
            <Input
              type="number"
              min="1"
              max="20"
              value={formData.pages_count}
              onChange={(e) => setFormData({ ...formData, pages_count: parseInt(e.target.value) || 1 })}
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

      {/* Review Fields */}
      {formData.recitation_type === 'review' && (
        <div className="space-y-4 p-4 rounded-xl bg-blue-500/5 border border-blue-500/20">
          {/* Review Type */}
          <div className="space-y-2">
            <Label className="text-slate-300">نوع المراجعة</Label>
            <RadioGroup 
              value={formData.review_type} 
              onValueChange={(v) => setFormData({ ...formData, review_type: v, review_juz: [] })}
              className="flex gap-4"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="pages" id={isEdit ? "pages-edit" : "pages"} />
                <Label htmlFor={isEdit ? "pages-edit" : "pages"} className="text-white cursor-pointer">صفحات</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="juz" id={isEdit ? "juz-edit" : "juz"} />
                <Label htmlFor={isEdit ? "juz-edit" : "juz"} className="text-white cursor-pointer">أجزاء</Label>
              </div>
            </RadioGroup>
          </div>

          {/* Pages Review */}
          {formData.review_type === 'pages' && (
            <div className="space-y-2">
              <Label className="text-slate-300">عدد صفحات المراجعة</Label>
              <Input
                type="number"
                min="1"
                max="100"
                value={formData.review_pages}
                onChange={(e) => setFormData({ ...formData, review_pages: parseInt(e.target.value) || 1 })}
                className="bg-slate-800 border-slate-700 text-white"
              />
            </div>
          )}

          {/* Juz Review */}
          {formData.review_type === 'juz' && (
            <div className="space-y-2">
              <Label className="text-slate-300">اختر الأجزاء المراجعة</Label>
              <div className="grid grid-cols-5 gap-2 max-h-48 overflow-y-auto p-2 bg-slate-800/50 rounded-lg">
                {quranJuz.map((juz) => (
                  <div
                    key={juz.number}
                    onClick={() => handleJuzToggle(juz.number)}
                    className={`p-2 text-center rounded-lg cursor-pointer transition-all text-sm ${
                      formData.review_juz?.includes(juz.number)
                        ? 'bg-blue-500 text-white'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    {juz.number}
                  </div>
                ))}
              </div>
              {formData.review_juz?.length > 0 && (
                <p className="text-blue-400 text-sm">
                  الأجزاء المختارة: {formData.review_juz.sort((a,b) => a-b).join(', ')}
                </p>
              )}
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

      {/* Notes */}
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
        data-testid="submit-recitation-btn"
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
        
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-emerald-500 hover:bg-emerald-600" data-testid="add-recitation-btn">
              <Plus className="w-5 h-5 ml-2" />
              تسجيل تسميع
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-slate-900 border-slate-700 max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-white text-xl">تسجيل تسميع جديد</DialogTitle>
            </DialogHeader>
            <RecitationForm onSubmit={handleSubmit} />
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
                      
                      {/* Edit Button */}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-blue-400 hover:text-blue-300 hover:bg-blue-500/10"
                        onClick={() => openEditDialog(rec)}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      
                      {/* Delete Button */}
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

                  <div className="flex flex-wrap gap-3">
                    {rec.recitation_type === 'new_memorization' && (
                      <>
                        <span className="text-slate-300 text-sm">
                          {rec.pages_count} صفحة
                        </span>
                        {rec.passed_minimum && (
                          <span className="text-emerald-400 text-sm flex items-center gap-1">
                            <CheckCircle className="w-4 h-4" />
                            اجتاز الحد الأدنى
                          </span>
                        )}
                      </>
                    )}
                    
                    {rec.recitation_type === 'review' && (
                      <>
                        {rec.review_type === 'pages' && (
                          <span className="text-slate-300 text-sm">
                            مراجعة {rec.review_pages} صفحة
                          </span>
                        )}
                        {rec.review_type === 'juz' && (
                          <span className="text-slate-300 text-sm">
                            مراجعة الأجزاء: {rec.review_juz?.join(', ')}
                          </span>
                        )}
                        {rec.passed_review_minimum && (
                          <span className="text-blue-400 text-sm flex items-center gap-1">
                            <CheckCircle className="w-4 h-4" />
                            اجتاز الحد الأدنى
                          </span>
                        )}
                      </>
                    )}
                    
                    <span className="text-amber-400 text-sm font-bold">
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

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={(open) => {
        setEditDialogOpen(open);
        if (!open) {
          setSelectedRecitation(null);
          resetForm();
        }
      }}>
        <DialogContent className="bg-slate-900 border-slate-700 max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white text-xl">تعديل التسميع</DialogTitle>
          </DialogHeader>
          <RecitationForm onSubmit={handleUpdate} isEdit={true} />
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="bg-slate-900 border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-white">تأكيد الحذف</DialogTitle>
          </DialogHeader>
          <div className="mt-4">
            <p className="text-slate-300">
              هل أنت متأكد من حذف هذا التسميع؟
            </p>
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
