import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Checkbox } from '../components/ui/checkbox';
import { Calendar } from '../components/ui/calendar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { 
  BookOpen, CheckCircle, XCircle, Loader2, Info, Users,
  FileText, RotateCcw, Clock, Trash2, Archive, Eye, RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Quran Juz page ranges
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

const RecitationsNew = () => {
  const navigate = useNavigate();
  const [students, setStudents] = useState([]);
  const [recitations, setRecitations] = useState({});
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Term selection for viewing old records
  const [terms, setTerms] = useState([]);
  const [selectedTermId, setSelectedTermId] = useState('');
  const [isViewingOldTerm, setIsViewingOldTerm] = useState(false);
  
  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [recitationToDelete, setRecitationToDelete] = useState(null);
  
  // Form state for recitation
  const [formData, setFormData] = useState({
    has_new_memorization: true,
    juz_number: 1,
    page_from: '',
    page_to: '',
    error_count: 0,
    passed_minimum: false,
    has_review: false,
    review_juz: [],
    partial_review_juz: null,
    partial_review_pages: 0,
    passed_review_minimum: false,
    notes: ''
  });

  useEffect(() => {
    fetchMyStudents();
    fetchTerms();
  }, []);

  useEffect(() => {
    if (students.length > 0) {
      fetchRecitations();
    }
  }, [selectedDate, students, selectedTermId]);

  const fetchTerms = async () => {
    try {
      const response = await axios.get(`${API}/terms`);
      setTerms(response.data || []);
      const activeTerm = response.data.find(t => t.is_active);
      if (activeTerm) {
        setSelectedTermId(activeTerm.id);
      }
    } catch (error) {
      console.error('Error fetching terms:', error);
    }
  };

  const handleTermChange = (termId) => {
    setSelectedTermId(termId);
    const term = terms.find(t => t.id === termId);
    setIsViewingOldTerm(term && !term.is_active);
  };

  // جلب طلاب المعلم (من مجموعاته)
  const fetchMyStudents = async () => {
    try {
      // جلب مجموعات المعلم
      const groupsRes = await axios.get(`${API}/groups`);
      const myGroups = groupsRes.data;
      
      // جلب طلاب كل مجموعة
      let allStudents = [];
      for (const group of myGroups) {
        try {
          const studentsRes = await axios.get(`${API}/groups/${group.id}/students`);
          const studentsWithGroup = studentsRes.data.map(s => ({
            ...s,
            group_name: group.name,
            group_id: group.id
          }));
          allStudents = [...allStudents, ...studentsWithGroup];
        } catch (err) {
          console.error(`Error fetching students for group ${group.id}:`, err);
        }
      }
      
      setStudents(allStudents);
    } catch (error) {
      console.error('Error fetching students:', error);
      toast.error('فشل في جلب قائمة الطلاب');
    } finally {
      setLoading(false);
    }
  };

  const fetchRecitations = async () => {
    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      let url = `${API}/recitations?date=${dateStr}`;
      if (selectedTermId) {
        url += `&term_id=${selectedTermId}`;
      }
      const response = await axios.get(url);
      
      // Convert to map by student_id
      const recitationMap = {};
      response.data.forEach(r => {
        if (!recitationMap[r.student_id]) {
          recitationMap[r.student_id] = [];
        }
        recitationMap[r.student_id].push(r);
      });
      setRecitations(recitationMap);
    } catch (error) {
      console.error('Error fetching recitations:', error);
    }
  };

  const handleDidNotRecite = async (student) => {
    if (isViewingOldTerm) {
      toast.error('لا يمكن التعديل على سجلات الفصول السابقة');
      return;
    }
    
    setSaving(true);
    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      await axios.post(`${API}/recitations`, {
        student_id: student.id,
        recitation_type: 'did_not_recite',
        did_not_recite: true,
        date: dateStr,
        notes: `لم يسمع - ${dateStr}`
      });
      
      toast.success(`تم تسجيل عدم التسميع للطالب ${student.name}`);
      fetchRecitations();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل تسجيل عدم التسميع');
    } finally {
      setSaving(false);
    }
  };

  const openRecitationDialog = (student) => {
    if (isViewingOldTerm) {
      toast.error('لا يمكن التعديل على سجلات الفصول السابقة');
      return;
    }
    
    setSelectedStudent(student);
    setFormData({
      has_new_memorization: true,
      juz_number: 1,
      page_from: '',
      page_to: '',
      error_count: 0,
      passed_minimum: false,
      has_review: false,
      review_juz: [],
      partial_review_juz: null,
      partial_review_pages: 0,
      passed_review_minimum: false,
      notes: ''
    });
    setDialogOpen(true);
  };

  const handleJuzChange = (newJuzNumber) => {
    // لا قيم افتراضية للصفحات — تُترك فارغة ليُدخلها المعلم بنفسه (أبسط وبدون تعليق)
    setFormData(prev => ({
      ...prev,
      juz_number: newJuzNumber,
      page_from: '',
      page_to: ''
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

  const handleSubmitRecitation = async () => {
    if (!selectedStudent) return;
    setSaving(true);
    
    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      // ضبط الصفحات مرة واحدة عند الحفظ فقط (بدل التعليق عند كل ضغطة)
      let pageFrom = null, pageTo = null;
      if (formData.has_new_memorization) {
        const jr = JUZ_PAGE_RANGES[formData.juz_number] || JUZ_PAGE_RANGES[1];
        const pf = parseInt(formData.page_from);
        const pt = parseInt(formData.page_to);
        pageFrom = isNaN(pf) ? jr.start : Math.max(jr.start, Math.min(jr.end, pf));
        pageTo = isNaN(pt) ? pageFrom : Math.max(pageFrom, Math.min(jr.end, pt));
      }
      const payload = {
        student_id: selectedStudent.id,
        recitation_type: 'combined',
        date: dateStr,
        has_new_memorization: formData.has_new_memorization,
        juz_number: formData.juz_number,
        page_from: pageFrom,
        page_to: pageTo,
        error_count: formData.error_count,
        passed_minimum: formData.passed_minimum,
        has_review: formData.has_review,
        review_juz: formData.review_juz,
        partial_review_juz: formData.partial_review_juz,
        partial_review_pages: formData.partial_review_pages,
        passed_review_minimum: formData.passed_review_minimum,
        notes: formData.notes
      };
      
      const response = await axios.post(`${API}/recitations`, payload);
      toast.success(`تم تسجيل التسميع بنجاح - ${response.data.points_earned} نقطة`);
      setDialogOpen(false);
      fetchRecitations();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل تسجيل التسميع');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRecitation = async () => {
    if (!recitationToDelete) return;
    setSaving(true);
    
    try {
      await axios.delete(`${API}/recitations/${recitationToDelete.id}`);
      toast.success('تم حذف التسميع بنجاح');
      setDeleteConfirmOpen(false);
      setRecitationToDelete(null);
      fetchRecitations();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل حذف التسميع');
    } finally {
      setSaving(false);
    }
  };

  const openDeleteConfirm = (recitation, student) => {
    setRecitationToDelete({ ...recitation, student_name: student.name });
    setDeleteConfirmOpen(true);
  };

  const getStudentStatus = (studentId) => {
    const studentRecitations = recitations[studentId];
    if (!studentRecitations || studentRecitations.length === 0) return 'not_recorded';
    
    const didNotRecite = studentRecitations.some(r => r.did_not_recite);
    if (didNotRecite) return 'did_not_recite';
    return 'recited';
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'recited':
        return <CheckCircle className="w-5 h-5 text-emerald-400" />;
      case 'did_not_recite':
        return <XCircle className="w-5 h-5 text-red-400" />;
      default:
        return <Clock className="w-5 h-5 text-slate-400" />;
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'recited':
        return <span className="px-2 py-1 text-xs rounded-full bg-emerald-500/20 text-emerald-400">سمّع</span>;
      case 'did_not_recite':
        return <span className="px-2 py-1 text-xs rounded-full bg-red-500/20 text-red-400">لم يسمّع</span>;
      default:
        return <span className="px-2 py-1 text-xs rounded-full bg-slate-500/20 text-slate-400">لم يُسجل</span>;
    }
  };

  const juzRange = JUZ_PAGE_RANGES[formData.juz_number] || JUZ_PAGE_RANGES[1];
  // أجزاء الطالب الضعيفة (من التقييم) — للتنبيه أثناء التسميع
  const weakJuz = selectedStudent?.weak_juz || [];
  const strongJuz = selectedStudent?.strong_juz || [];

  // إحصائيات
  const stats = {
    recited: students.filter(s => getStudentStatus(s.id) === 'recited').length,
    didNotRecite: students.filter(s => getStudentStatus(s.id) === 'did_not_recite').length,
    notRecorded: students.filter(s => getStudentStatus(s.id) === 'not_recorded').length
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fadeIn" data-testid="recitations-new-page">
      <div>
        <h1 className="text-2xl font-bold text-white">تسجيل التسميع</h1>
        <p className="text-slate-400">تسجيل الحفظ الجديد والمراجعة للطلاب</p>
      </div>

      {/* تحذير إذا كان يعرض فصل قديم */}
      {isViewingOldTerm && (
        <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/30">
          <div className="flex items-center gap-2">
            <Eye className="w-5 h-5 text-amber-400" />
            <p className="text-amber-400 font-medium">
              أنت تعرض سجلات فصل سابق (للقراءة فقط) - لا يمكن التعديل
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar Selection */}
        <Card className="glass-card border-white/10">
          <CardHeader>
            <CardTitle className="text-lg font-bold text-white">اختر التاريخ والفصل</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* اختيار الفصل */}
            <div>
              <Label className="text-slate-300 mb-2 block">الفصل الدراسي</Label>
              <Select value={selectedTermId} onValueChange={handleTermChange}>
                <SelectTrigger className="bg-slate-800 border-slate-700 text-white" data-testid="term-select">
                  <SelectValue placeholder="اختر الفصل" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  {terms.map((term) => (
                    <SelectItem key={term.id} value={term.id} className="text-white">
                      <div className="flex items-center gap-2">
                        {term.is_active ? (
                          <span className="w-2 h-2 rounded-full bg-emerald-400" />
                        ) : (
                          <Archive className="w-3 h-3 text-slate-400" />
                        )}
                        {term.name}
                        {term.is_active && <span className="text-xs text-emerald-400">(نشط)</span>}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={(date) => date && setSelectedDate(date)}
              locale={ar}
              className="rounded-xl border border-slate-700 bg-slate-800/50 p-3"
            />
            
            {/* Summary Stats */}
            <div className="grid grid-cols-3 gap-2 pt-4 border-t border-slate-700">
              <div className="text-center p-2 rounded-lg bg-emerald-500/10">
                <p className="text-lg font-bold text-emerald-400">{stats.recited}</p>
                <p className="text-xs text-slate-400">سمّع</p>
              </div>
              <div className="text-center p-2 rounded-lg bg-red-500/10">
                <p className="text-lg font-bold text-red-400">{stats.didNotRecite}</p>
                <p className="text-xs text-slate-400">لم يسمّع</p>
              </div>
              <div className="text-center p-2 rounded-lg bg-slate-500/10">
                <p className="text-lg font-bold text-slate-400">{stats.notRecorded}</p>
                <p className="text-xs text-slate-400">لم يُسجل</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Students List */}
        <Card className="glass-card border-white/10 lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg font-bold text-white flex items-center gap-3">
              <Users className="w-6 h-6 text-emerald-400" />
              طلابي - {format(selectedDate, 'EEEE d MMMM yyyy', { locale: ar })}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {students.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <Users className="w-16 h-16 mx-auto mb-4 opacity-50" />
                <p>لا يوجد طلاب في مجموعاتك</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[500px] overflow-y-auto">
                {students.map((student) => {
                  const status = getStudentStatus(student.id);
                  const studentRecs = recitations[student.id] || [];
                  
                  return (
                    <div
                      key={student.id}
                      className="p-4 rounded-xl bg-slate-800/50 border border-white/5"
                    >
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-3">
                          {getStatusIcon(status)}
                          <div>
                            <span className="text-white font-medium">{student.name}</span>
                            {student.group_name && (
                              <span className="text-slate-500 text-sm mr-2">({student.group_name})</span>
                            )}
                          </div>
                          {getStatusBadge(status)}
                        </div>
                        
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => openRecitationDialog(student)}
                            className="bg-emerald-500 hover:bg-emerald-600"
                            disabled={saving}
                          >
                            <BookOpen className="w-4 h-4 ml-1" />
                            سمّع
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDidNotRecite(student)}
                            className="border-red-500/30 text-red-400 hover:bg-red-500/20"
                            disabled={saving}
                          >
                            <XCircle className="w-4 h-4 ml-1" />
                            لم يسمّع
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => navigate(`/initial-assessment?student=${student.id}`)}
                            className="border-blue-500/30 text-blue-400 hover:bg-blue-500/20"
                          >
                            <RefreshCw className="w-4 h-4 ml-1" />
                            إعادة تقييم
                          </Button>
                        </div>
                      </div>
                      
                      {/* Show recitation details if exists */}
                      {studentRecs.length > 0 && (
                        <div className="mt-3 space-y-2">
                          {studentRecs.map((rec, idx) => (
                            <div key={idx} className="p-2 rounded-lg bg-slate-900/50 flex items-center justify-between">
                              <div className="flex flex-col gap-1 text-sm text-slate-300">
                                {rec.did_not_recite ? (
                                  <span className="text-red-400">لم يسمّع</span>
                                ) : (
                                  <>
                                    {/* حفظ جديد */}
                                    {(rec.has_new_memorization || rec.juz_number) && (
                                      <div className="flex items-center gap-2">
                                        <span className="text-emerald-400 text-xs px-1.5 py-0.5 bg-emerald-500/20 rounded">حفظ</span>
                                        {rec.juz_number && <span>الجزء {rec.juz_number}</span>}
                                        {rec.page_from && rec.page_to && (
                                          <span>ص {rec.page_from}-{rec.page_to}</span>
                                        )}
                                        {rec.passed_minimum && (
                                          <span className="text-emerald-400">✓</span>
                                        )}
                                      </div>
                                    )}
                                    {/* مراجعة */}
                                    {(rec.has_review || (rec.review_juz && rec.review_juz.length > 0)) && (
                                      <div className="flex items-center gap-2">
                                        <span className="text-blue-400 text-xs px-1.5 py-0.5 bg-blue-500/20 rounded">مراجعة</span>
                                        {rec.review_juz && rec.review_juz.length > 0 && (
                                          <span>الأجزاء: {rec.review_juz.sort((a,b) => a-b).join(', ')}</span>
                                        )}
                                        {rec.partial_review_pages > 0 && (
                                          <span>{rec.partial_review_pages} ص من جزء {rec.partial_review_juz}</span>
                                        )}
                                        {rec.passed_review_minimum && (
                                          <span className="text-blue-400">✓</span>
                                        )}
                                      </div>
                                    )}
                                    <span className="text-amber-400">+{rec.points_earned || 0} نقطة</span>
                                  </>
                                )}
                              </div>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => openDeleteConfirm(rec, student)}
                                className="text-red-400 hover:text-red-300 hover:bg-red-500/20 h-8 w-8 p-0"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recitation Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-slate-900 border-slate-700 max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white text-xl flex items-center gap-2">
              <BookOpen className="w-6 h-6 text-emerald-400" />
              تسجيل تسميع - {selectedStudent?.name}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-6 mt-4">
            {/* حفظ جديد */}
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Checkbox
                  id="has_new"
                  checked={formData.has_new_memorization}
                  onCheckedChange={(checked) => setFormData({...formData, has_new_memorization: checked})}
                  className="border-emerald-500 data-[state=checked]:bg-emerald-500"
                />
                <Label htmlFor="has_new" className="text-white font-bold flex items-center gap-2 cursor-pointer">
                  <FileText className="w-5 h-5 text-emerald-400" />
                  حفظ جديد
                </Label>
              </div>
              
              {formData.has_new_memorization && (
                <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20 space-y-4 mr-8">
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
                            {weakJuz.includes(i + 1) ? '⚠️ ' : ''}الجزء {i + 1} (ص {JUZ_PAGE_RANGES[i + 1].start} - {JUZ_PAGE_RANGES[i + 1].end})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {weakJuz.includes(formData.juz_number) && (
                    <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 flex items-center gap-2">
                      <Info className="w-4 h-4 text-red-400 flex-shrink-0" />
                      <p className="text-red-300 text-sm">
                        ⚠️ هذا الجزء من الأجزاء الضعيفة للطالب — يحتاج إلى تركيز ومراجعة
                      </p>
                    </div>
                  )}

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
                        placeholder={`${juzRange.start}`}
                        value={formData.page_from}
                        onChange={(e) => setFormData({ ...formData, page_from: e.target.value })}
                        className="bg-slate-800 border-slate-700 text-white"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-slate-300">إلى صفحة</Label>
                      <Input
                        type="number"
                        min={juzRange.start}
                        max={juzRange.end}
                        placeholder={`${juzRange.end}`}
                        value={formData.page_to}
                        onChange={(e) => setFormData({ ...formData, page_to: e.target.value })}
                        className="bg-slate-800 border-slate-700 text-white"
                      />
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
                      id="passed_min"
                      checked={formData.passed_minimum}
                      onCheckedChange={(checked) => setFormData({ ...formData, passed_minimum: checked })}
                      className="border-emerald-500 data-[state=checked]:bg-emerald-500"
                    />
                    <Label htmlFor="passed_min" className="text-white cursor-pointer flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-emerald-400" />
                      اجتاز الحد الأدنى (20 نقطة)
                    </Label>
                  </div>
                </div>
              )}
            </div>

            {/* مراجعة */}
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Checkbox
                  id="has_review"
                  checked={formData.has_review}
                  onCheckedChange={(checked) => setFormData({...formData, has_review: checked})}
                  className="border-blue-500 data-[state=checked]:bg-blue-500"
                />
                <Label htmlFor="has_review" className="text-white font-bold flex items-center gap-2 cursor-pointer">
                  <RotateCcw className="w-5 h-5 text-blue-400" />
                  مراجعة
                </Label>
              </div>
              
              {formData.has_review && (
                <div className="p-4 rounded-xl bg-blue-500/5 border border-blue-500/20 space-y-4 mr-8">
                  <div className="space-y-2">
                    <Label className="text-slate-300">الأجزاء المراجعة كاملة</Label>
                    <div className="grid grid-cols-6 gap-2 max-h-40 overflow-y-auto p-2 bg-slate-800/50 rounded-lg">
                      {Array.from({ length: 30 }, (_, i) => i + 1).map((juz) => {
                        const isWeak = weakJuz.includes(juz);
                        const isStrong = strongJuz.includes(juz);
                        const selected = formData.review_juz?.includes(juz);
                        return (
                          <div
                            key={juz}
                            onClick={() => handleJuzToggle(juz)}
                            title={isWeak ? 'جزء ضعيف — يحتاج تركيز' : (isStrong ? 'جزء قوي' : '')}
                            className={`relative p-2 text-center rounded-lg cursor-pointer transition-all text-sm ${
                              selected
                                ? 'bg-blue-500 text-white'
                                : isWeak
                                  ? 'bg-slate-700 text-slate-200 ring-2 ring-red-500'
                                  : isStrong
                                    ? 'bg-slate-700 text-slate-200 ring-1 ring-emerald-500/60'
                                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                            }`}
                          >
                            {juz}
                            {isWeak && <span className="absolute -top-1 -left-1 text-xs">⚠️</span>}
                          </div>
                        );
                      })}
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

                  <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/50">
                    <Checkbox
                      id="passed_review"
                      checked={formData.passed_review_minimum}
                      onCheckedChange={(checked) => setFormData({ ...formData, passed_review_minimum: checked })}
                      className="border-blue-500 data-[state=checked]:bg-blue-500"
                    />
                    <Label htmlFor="passed_review" className="text-white cursor-pointer flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-blue-400" />
                      اجتاز الحد الأدنى للمراجعة
                    </Label>
                  </div>
                </div>
              )}
            </div>

            {/* ملاحظات */}
            <div className="space-y-2">
              <Label className="text-slate-300">ملاحظات (اختياري)</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="bg-slate-800 border-slate-700 text-white"
                placeholder="أي ملاحظات إضافية..."
              />
            </div>
          </div>

          <DialogFooter className="mt-6">
            <Button variant="ghost" onClick={() => setDialogOpen(false)} className="text-slate-400">
              إلغاء
            </Button>
            <Button 
              onClick={handleSubmitRecitation}
              className="bg-emerald-500 hover:bg-emerald-600"
              disabled={saving || (!formData.has_new_memorization && !formData.has_review)}
            >
              {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : 'حفظ التسميع'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="bg-slate-900 border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-red-400" />
              تأكيد الحذف
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-slate-300">
              هل أنت متأكد من حذف تسميع الطالب <strong className="text-white">{recitationToDelete?.student_name}</strong>؟
            </p>
            {recitationToDelete?.points_earned > 0 && (
              <p className="text-amber-400 text-sm mt-2">
                سيتم خصم {recitationToDelete.points_earned} نقطة من الطالب
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteConfirmOpen(false)} className="text-slate-400">
              إلغاء
            </Button>
            <Button 
              onClick={handleDeleteRecitation}
              className="bg-red-500 hover:bg-red-600"
              disabled={saving}
            >
              {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : 'حذف'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RecitationsNew;
