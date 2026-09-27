import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Label } from '../components/ui/label';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { BookOpen, User, CheckCircle, Loader2, AlertCircle, Star, RefreshCw, History, Trophy } from 'lucide-react';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const EMPTY_FORM = {
  previousJuz: [],
  additionalPages: 0,
  tajweedLevel: 'تمهيدية',
  notes: '',
  weakJuz: [],
  strongJuz: [],
  adminJuz: [],
  // المشاركة في المسابقات
  annualCompetition: false,
  annualJuz: [],
  youngHafiz: false,
  youngHafizJuz: []
};

// شبكة اختيار الأجزاء (1-30)
// allowed: إن مُرِّرت، لا يُسمح باختيار إلا الأجزاء ضمنها (الباقي مُعطَّل)
const JuzGrid = ({ selected, onToggle, activeClass = 'bg-emerald-500 text-white', allowed = null }) => (
  <div className="grid grid-cols-6 gap-2 max-h-44 overflow-y-auto p-3 bg-slate-800/50 rounded-lg border border-slate-700">
    {Array.from({ length: 30 }, (_, i) => i + 1).map((juz) => {
      const isAllowed = allowed === null || allowed.includes(juz);
      const isSelected = selected.includes(juz);
      return (
        <div
          key={juz}
          onClick={() => isAllowed && onToggle(juz)}
          title={isAllowed ? '' : 'اختر هذا الجزء في الحفظ السابق أولاً'}
          className={`p-2 text-center rounded-lg transition-all text-sm font-bold ${
            !isAllowed
              ? 'bg-slate-800/40 text-slate-600 cursor-not-allowed opacity-40'
              : isSelected
                ? `${activeClass} cursor-pointer`
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600 cursor-pointer'
          }`}
        >
          {juz}
        </div>
      );
    })}
  </div>
);

const InitialAssessment = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [pendingStudents, setPendingStudents] = useState([]);
  const [assessedStudents, setAssessedStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [isReassessment, setIsReassessment] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // سجل التقييمات
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [formData, setFormData] = useState(EMPTY_FORM);

  const fetchStudents = useCallback(async () => {
    try {
      const groupsRes = await axios.get(`${API}/groups`);
      let all = [];
      for (const group of groupsRes.data) {
        try {
          const studentsRes = await axios.get(`${API}/groups/${group.id}/students`);
          all = [...all, ...studentsRes.data.map(s => ({ ...s, group_name: group.name, group_id: group.id }))];
        } catch (err) {
          console.error('Error fetching group students:', err);
        }
      }
      setPendingStudents(all.filter(s => !s.initial_assessment_done));
      setAssessedStudents(all.filter(s => s.initial_assessment_done));
      return all;
    } catch (error) {
      console.error('Error:', error);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const makeForm = (student) => ({
    previousJuz: student.previous_memorization_juz || [],
    additionalPages: student.previous_memorization_pages || 0,
    tajweedLevel: student.tajweed_level || 'تمهيدية',
    notes: '',
    weakJuz: student.weak_juz || [],
    strongJuz: student.strong_juz || [],
    adminJuz: student.administrative_test_juz || [],
    annualCompetition: !!student.annual_competition,
    annualJuz: student.annual_competition_juz || [],
    youngHafiz: !!student.young_hafiz,
    youngHafizJuz: student.young_hafiz_juz || []
  });

  const openAssessmentDialog = useCallback((student) => {
    setSelectedStudent(student);
    setIsReassessment(!!student.initial_assessment_done);
    setFormData(student.initial_assessment_done ? makeForm(student) : EMPTY_FORM);
    setDialogOpen(true);
  }, []);

  const [allStudents, setAllStudents] = useState(null);

  useEffect(() => {
    fetchStudents().then(setAllStudents);
  }, [fetchStudents]);

  // فتح تقييم طالب محدد قادم من صفحة الحضور/التسميع — يتفاعل مع تغيّر الرابط وليس فقط عند التحميل الأول
  const sid = searchParams.get('student');
  useEffect(() => {
    if (!sid || !allStudents) return;
    const student = allStudents.find(s => s.id === sid);
    setSearchParams({}, { replace: true });
    if (student) {
      // تأجيل الفتح لإطار لاحق حتى يكتمل رسم الصفحة وإغلاق أي نافذة سابقة
      requestAnimationFrame(() => openAssessmentDialog(student));
    } else {
      toast.error('لم يتم العثور على الطالب');
    }
  }, [sid, allStudents, openAssessmentDialog, setSearchParams]);

  const toggleIn = (field) => (juzNumber) => {
    setFormData(prev => {
      const current = prev[field];
      const next = current.includes(juzNumber)
        ? current.filter(j => j !== juzNumber)
        : [...current, juzNumber].sort((a, b) => a - b);
      const updated = { ...prev, [field]: next };
      // عند إزالة جزء من الحفظ السابق: نظّف القوية/الضعيفة/الإدارية منه (تبقى ⊆ المحفوظ)
      if (field === 'previousJuz') {
        const memo = new Set(next);
        updated.strongJuz = prev.strongJuz.filter(j => memo.has(j));
        updated.weakJuz = prev.weakJuz.filter(j => memo.has(j));
        updated.adminJuz = prev.adminJuz.filter(j => memo.has(j));
      }
      // #5 — الجزء لا يكون قوياً وضعيفاً معاً: عند تعليمه في إحداهما يُزال من الأخرى
      if (field === 'strongJuz') {
        updated.weakJuz = prev.weakJuz.filter(j => j !== juzNumber);
      } else if (field === 'weakJuz') {
        updated.strongJuz = prev.strongJuz.filter(j => j !== juzNumber);
      }
      return updated;
    });
  };

  // اختيار كتل من 5 أجزاء للاختبارات الإدارية (مضاعفات 5)
  const toggleAdminBlock = (start) => {
    const block = [start, start + 1, start + 2, start + 3, start + 4];
    setFormData(prev => {
      const allIn = block.every(j => prev.adminJuz.includes(j));
      const next = allIn
        ? prev.adminJuz.filter(j => !block.includes(j))
        : [...new Set([...prev.adminJuz, ...block])].sort((a, b) => a - b);
      return { ...prev, adminJuz: next };
    });
  };

  const handleSubmitAssessment = async () => {
    if (!selectedStudent) return;
    if (formData.adminJuz.length % 5 !== 0) {
      toast.error('عدد الأجزاء المختبَرة إدارياً يجب أن يكون من مضاعفات 5 (5، 10، 15، ...)');
      return;
    }
    // الأجزاء القوية/الضعيفة/الإدارية يجب أن تكون من ضمن المحفوظ
    const memo = new Set(formData.previousJuz);
    const outside = [...formData.strongJuz, ...formData.weakJuz, ...formData.adminJuz].filter(j => !memo.has(j));
    if (outside.length) {
      toast.error('لا يمكن تسجيل أجزاء قوية/ضعيفة/مختبَرة خارج الأجزاء المحفوظة');
      return;
    }
    const both = formData.strongJuz.filter(j => formData.weakJuz.includes(j));
    if (both.length) {
      toast.error(`الأجزاء التالية قوية وضعيفة معاً: ${both.join('، ')} — اختر واحدة فقط`);
      return;
    }
    // مسابقة مُحدَّدة بلا أجزاء = تسجيل ناقص
    if (formData.annualCompetition && formData.annualJuz.length === 0) {
      toast.error('حدّد الأجزاء التي شارك فيها الطالب في المسابقة السنوية');
      return;
    }
    if (formData.youngHafiz && formData.youngHafizJuz.length === 0) {
      toast.error('حدّد الأجزاء التي شارك فيها الطالب في الحافظ الصغير');
      return;
    }

    setSubmitting(true);
    try {
      await axios.post(`${API}/students/${selectedStudent.id}/initial-assessment`, {
        student_id: selectedStudent.id,
        previous_memorization_juz: formData.previousJuz,
        previous_memorization_pages: formData.additionalPages,
        tajweed_level: formData.tajweedLevel,
        notes: formData.notes,
        weak_juz: formData.weakJuz,
        strong_juz: formData.strongJuz,
        administrative_test_juz: formData.adminJuz,
        annual_competition: formData.annualCompetition,
        annual_competition_juz: formData.annualCompetition ? formData.annualJuz : [],
        young_hafiz: formData.youngHafiz,
        young_hafiz_juz: formData.youngHafiz ? formData.youngHafizJuz : []
      });

      toast.success(isReassessment ? 'تم تسجيل إعادة التقييم بنجاح' : 'تم تسجيل التقييم الأولي بنجاح');
      setDialogOpen(false);
      setSelectedStudent(null);
      fetchStudents();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل تسجيل التقييم');
    } finally {
      setSubmitting(false);
    }
  };

  const openHistory = async (student) => {
    setSelectedStudent(student);
    setHistoryOpen(true);
    setHistoryLoading(true);
    try {
      const res = await axios.get(`${API}/students/${student.id}/assessments`);
      setHistory(res.data);
    } catch (error) {
      toast.error('فشل في جلب سجل التقييمات');
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  // كل جزء 20 صفحة ما عدا جزء عمّ (30) = 24 صفحة
  const pagesForJuzList = (juzList) =>
    (juzList || []).reduce((sum, j) => sum + (Number(j) === 30 ? 24 : 20), 0);
  const calculateTotalPages = () => pagesForJuzList(formData.previousJuz) + formData.additionalPages;

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
        <h1 className="text-2xl font-bold text-white">تقييم الطلاب</h1>
        <p className="text-slate-400">تسجيل الحفظ السابق ومستوى التجويد وتصنيف الأجزاء، مع إمكانية إعادة التقييم</p>
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
                <div key={student.id} className="p-4 rounded-xl bg-slate-800/50 border border-amber-500/30 hover:border-emerald-500/30 transition-all">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center">
                        <User className="w-6 h-6 text-amber-400" />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-white">{student.name}</h3>
                        <p className="text-slate-400 text-sm">{student.email}</p>
                        {student.group_name && <p className="text-slate-500 text-xs mt-1">المجموعة: {student.group_name}</p>}
                      </div>
                    </div>
                    <Button onClick={() => openAssessmentDialog(student)} className="bg-emerald-500 hover:bg-emerald-600">
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

      {/* Assessed Students — re-evaluation */}
      <Card className="glass-card border-white/10">
        <CardHeader>
          <CardTitle className="text-xl font-bold text-white flex items-center gap-3">
            <CheckCircle className="w-6 h-6 text-emerald-400" />
            الطلاب المقيَّمون ({assessedStudents.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {assessedStudents.length === 0 ? (
            <div className="text-center py-8 text-slate-400">لا يوجد طلاب مقيَّمون بعد</div>
          ) : (
            <div className="space-y-4">
              {assessedStudents.map((student) => (
                <div key={student.id} className="p-4 rounded-xl bg-slate-800/50 border border-white/5">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center">
                        <User className="w-6 h-6 text-emerald-400" />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-white">{student.name}</h3>
                        <p className="text-slate-400 text-sm">
                          {student.tajweed_level && <span className="ml-2">التجويد: {student.tajweed_level}</span>}
                          {student.assessment_count ? <span>عدد التقييمات: {student.assessment_count}</span> : null}
                        </p>
                        {student.group_name && <p className="text-slate-500 text-xs mt-1">المجموعة: {student.group_name}</p>}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => openHistory(student)} className="border-slate-600 text-slate-300 hover:bg-slate-700">
                        <History className="w-4 h-4 ml-1" />
                        السجل
                      </Button>
                      <Button size="sm" onClick={() => openAssessmentDialog(student)} className="bg-blue-500 hover:bg-blue-600">
                        <RefreshCw className="w-4 h-4 ml-1" />
                        إعادة تقييم
                      </Button>
                    </div>
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
              {isReassessment ? 'إعادة تقييم الطالب' : 'التقييم الأولي للطالب'}: {selectedStudent?.name}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6 mt-4">
            {/* Previous Memorization Juz */}
            <div className="space-y-3">
              <Label className="text-slate-300">الأجزاء المحفوظة سابقاً</Label>
              <JuzGrid selected={formData.previousJuz} onToggle={toggleIn('previousJuz')} />
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
                type="number" min="0" max="19"
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
                <span className="text-2xl font-bold text-emerald-400">{calculateTotalPages()} صفحة</span>
              </div>
              <p className="text-slate-400 text-sm mt-1">
                ({formData.previousJuz.length} جزء × 20 صفحة) + {formData.additionalPages} صفحة
              </p>
            </div>

            {/* الأجزاء القوية — من ضمن المحفوظ فقط */}
            <div className="space-y-3">
              <Label className="text-slate-300">الأجزاء القوية في الحفظ <span className="text-xs text-slate-500">(من ضمن المحفوظ فقط)</span></Label>
              <JuzGrid selected={formData.strongJuz} onToggle={toggleIn('strongJuz')} activeClass="bg-emerald-600 text-white" allowed={formData.previousJuz} />
              {formData.strongJuz.length > 0 && (
                <p className="text-emerald-400 text-sm">{formData.strongJuz.length} جزء قوي</p>
              )}
            </div>

            {/* الأجزاء الضعيفة — من ضمن المحفوظ فقط */}
            <div className="space-y-3">
              <Label className="text-slate-300">الأجزاء الضعيفة في الحفظ <span className="text-xs text-slate-500">(من ضمن المحفوظ فقط)</span></Label>
              <JuzGrid selected={formData.weakJuz} onToggle={toggleIn('weakJuz')} activeClass="bg-red-500 text-white" allowed={formData.previousJuz} />
              {formData.weakJuz.length > 0 && (
                <p className="text-red-400 text-sm">{formData.weakJuz.length} جزء ضعيف</p>
              )}
            </div>

            {/* الاختبارات الإدارية — مضاعفات 5 */}
            <div className="space-y-3">
              <Label className="text-slate-300">الأجزاء المختبَرة إدارياً (مضاعفات 5)</Label>
              <div className="flex flex-wrap gap-2">
                {[1, 6, 11, 16, 21, 26].map((start) => {
                  const block = [start, start + 1, start + 2, start + 3, start + 4];
                  const allIn = block.every(j => formData.adminJuz.includes(j));
                  const memorizedAll = block.every(j => formData.previousJuz.includes(j));
                  return (
                    <button
                      key={start}
                      type="button"
                      disabled={!memorizedAll}
                      title={memorizedAll ? '' : 'يجب حفظ كل أجزاء هذه الكتلة أولاً'}
                      onClick={() => memorizedAll && toggleAdminBlock(start)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-all ${
                        !memorizedAll ? 'bg-slate-800/40 text-slate-600 cursor-not-allowed opacity-40'
                        : allIn ? 'bg-purple-500 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      }`}
                    >
                      {start}-{start + 4}
                    </button>
                  );
                })}
              </div>
              <JuzGrid selected={formData.adminJuz} onToggle={toggleIn('adminJuz')} activeClass="bg-purple-500 text-white" />
              <p className={`text-sm ${formData.adminJuz.length % 5 === 0 ? 'text-purple-400' : 'text-red-400'}`}>
                {formData.adminJuz.length} جزء مختبَر إدارياً
                {formData.adminJuz.length % 5 !== 0 && ' — يجب أن يكون العدد من مضاعفات 5'}
              </p>
            </div>

            {/* المشاركة في المسابقات */}
            <div className="space-y-3 p-3 rounded-xl bg-amber-500/5 border border-amber-500/20">
              <Label className="text-amber-400 flex items-center gap-2">
                <Trophy className="w-4 h-4" />
                المشاركة في المسابقات
              </Label>

              {[
                { key: 'annualCompetition', juzKey: 'annualJuz', label: 'شارك في المسابقة السنوية', color: 'bg-amber-500 text-white' },
                { key: 'youngHafiz', juzKey: 'youngHafizJuz', label: 'شارك في مسابقة الحافظ الصغير', color: 'bg-cyan-500 text-white' },
              ].map((c) => (
                <div key={c.key} className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-200">
                    <input
                      type="checkbox"
                      checked={formData[c.key]}
                      onChange={(e) => setFormData({
                        ...formData,
                        [c.key]: e.target.checked,
                        // إلغاء التحديد بيمسح الأجزاء حتى ما تتخزّن أجزاء لمسابقة ما شارك فيها
                        [c.juzKey]: e.target.checked ? formData[c.juzKey] : [],
                      })}
                    />
                    {c.label}
                  </label>

                  {formData[c.key] && (
                    <div className="space-y-1 pr-6">
                      <p className="text-xs text-slate-400">الأجزاء التي شارك فيها:</p>
                      <JuzGrid
                        selected={formData[c.juzKey]}
                        onToggle={toggleIn(c.juzKey)}
                        activeClass={c.color}
                      />
                      <p className={`text-xs ${formData[c.juzKey].length ? 'text-emerald-400' : 'text-red-400'}`}>
                        {formData[c.juzKey].length
                          ? `${formData[c.juzKey].length} جزء: ${formData[c.juzKey].join('، ')}`
                          : 'لم تُحدَّد أجزاء بعد'}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Tajweed Level */}
            <div className="space-y-2">
              <Label className="text-slate-300">مستوى التجويد</Label>
              <Select value={formData.tajweedLevel} onValueChange={(v) => setFormData({ ...formData, tajweedLevel: v })}>
                <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  {['تلاوة عامة', 'تمهيدية', 'متوسطة', 'متقدمة', 'إجازة', 'اتقان', 'سند غيبي', 'روايات أخرى'].map((lvl) => (
                    <SelectItem key={lvl} value={lvl} className="text-white">
                      <div className="flex items-center gap-2">
                        <Star className="w-4 h-4 text-amber-400" />
                        {lvl}
                      </div>
                    </SelectItem>
                  ))}
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
            <Button onClick={handleSubmitAssessment} className="bg-emerald-500 hover:bg-emerald-600" disabled={submitting}>
              {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'حفظ التقييم'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* History Dialog */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="bg-slate-900 border-slate-700 max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white text-xl flex items-center gap-2">
              <History className="w-5 h-5 text-blue-400" />
              سجل تقييمات: {selectedStudent?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            {historyLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-blue-400" /></div>
            ) : history.length === 0 ? (
              <div className="text-center py-8 text-slate-400">لا يوجد سجل تقييمات</div>
            ) : (
              history.map((rec) => (
                <div key={rec.id} className="p-4 rounded-xl bg-slate-800/50 border border-white/5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-white font-bold">
                      {new Date(rec.date).toLocaleString('ar-SA')}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded ${rec.is_reassessment ? 'bg-blue-500/20 text-blue-300' : 'bg-emerald-500/20 text-emerald-300'}`}>
                      {rec.is_reassessment ? 'إعادة تقييم' : 'تقييم أولي'}
                    </span>
                  </div>
                  <div className="text-sm text-slate-300 space-y-1">
                    <p>التجويد: <span className="text-white">{rec.tajweed_level}</span></p>
                    {rec.strong_juz?.length > 0 && <p className="text-emerald-400">قوية: {rec.strong_juz.join(', ')}</p>}
                    {rec.weak_juz?.length > 0 && <p className="text-red-400">ضعيفة: {rec.weak_juz.join(', ')}</p>}
                    {rec.administrative_test_juz?.length > 0 && <p className="text-purple-400">إدارية: {rec.administrative_test_juz.join(', ')} ({rec.administrative_test_juz.length} جزء)</p>}
                    {rec.notes && <p className="text-slate-400">ملاحظات: {rec.notes}</p>}
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default InitialAssessment;
