import { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '../components/ui/dialog';
import { toast } from 'sonner';
import { 
  Plus, Trash2, CheckCircle, XCircle, Clock, FileQuestion, 
  Users, Award, Eye, Play, BarChart, Edit2, ChevronRight, Check
} from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const CATEGORIES = [
  { value: 'quran', label: 'القرآن الكريم' },
  { value: 'tajweed', label: 'التجويد' },
  { value: 'islamic', label: 'الفقه والعقيدة' },
  { value: 'general', label: 'عام' }
];

const OnlineExams = () => {
  const { user } = useAuth();
  const { isDark } = useTheme();
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [takeExamDialogOpen, setTakeExamDialogOpen] = useState(false);
  const [resultsDialogOpen, setResultsDialogOpen] = useState(false);
  const [selectedExam, setSelectedExam] = useState(null);
  const [examResults, setExamResults] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  
  // حالة إنشاء الاختبار
  const [examForm, setExamForm] = useState({
    title: '',
    description: '',
    category: 'general',
    duration_minutes: 30,
    passing_score: 60,
    questions: []
  });
  
  // حالة السؤال الجديد
  const [newQuestion, setNewQuestion] = useState({
    question_text: '',
    options: ['', '', '', ''],
    correct_answer: 0,
    points: 1
  });
  
  // حالة تقديم الاختبار
  const [studentAnswers, setStudentAnswers] = useState([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);

  const isTeacher = user?.role === 'sheikh' || user?.role === 'admin';

  useEffect(() => {
    fetchExams();
  }, []);

  const fetchExams = async () => {
    try {
      const res = await axios.get(`${API}/online-exams`);
      setExams(res.data);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddQuestion = () => {
    if (!newQuestion.question_text.trim()) {
      toast.error('يرجى كتابة نص السؤال');
      return;
    }
    if (newQuestion.options.some(o => !o.trim())) {
      toast.error('يرجى ملء جميع الخيارات');
      return;
    }
    
    const questionWithId = {
      ...newQuestion,
      id: Date.now().toString()
    };
    
    setExamForm({
      ...examForm,
      questions: [...examForm.questions, questionWithId]
    });
    
    // إعادة تعيين السؤال
    setNewQuestion({
      question_text: '',
      options: ['', '', '', ''],
      correct_answer: 0,
      points: 1
    });
    
    toast.success('تمت إضافة السؤال');
  };

  const handleRemoveQuestion = (index) => {
    setExamForm({
      ...examForm,
      questions: examForm.questions.filter((_, i) => i !== index)
    });
  };

  const handleCreateExam = async () => {
    if (!examForm.title.trim()) {
      toast.error('يرجى كتابة عنوان الاختبار');
      return;
    }
    if (examForm.questions.length === 0) {
      toast.error('يرجى إضافة سؤال واحد على الأقل');
      return;
    }
    
    setSubmitting(true);
    try {
      await axios.post(`${API}/online-exams`, examForm);
      toast.success('تم إنشاء الاختبار بنجاح');
      setCreateDialogOpen(false);
      resetExamForm();
      fetchExams();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في إنشاء الاختبار');
    } finally {
      setSubmitting(false);
    }
  };

  const resetExamForm = () => {
    setExamForm({
      title: '',
      description: '',
      category: 'general',
      duration_minutes: 30,
      passing_score: 60,
      questions: []
    });
    setNewQuestion({
      question_text: '',
      options: ['', '', '', ''],
      correct_answer: 0,
      points: 1
    });
  };

  const handleStartExam = async (exam) => {
    try {
      const res = await axios.get(`${API}/online-exams/${exam.id}`);
      if (res.data.already_submitted) {
        toast.error('لقد قدمت هذا الاختبار سابقاً');
        return;
      }
      setSelectedExam(res.data);
      setStudentAnswers(new Array(res.data.questions.length).fill(-1));
      setCurrentQuestionIndex(0);
      setTakeExamDialogOpen(true);
    } catch (error) {
      toast.error('فشل في تحميل الاختبار');
    }
  };

  const handleSubmitExam = async () => {
    const unanswered = studentAnswers.filter(a => a === -1).length;
    if (unanswered > 0) {
      if (!confirm(`لديك ${unanswered} سؤال بدون إجابة. هل تريد التقديم؟`)) {
        return;
      }
    }
    
    setSubmitting(true);
    try {
      const res = await axios.post(`${API}/online-exams/${selectedExam.id}/submit`, {
        exam_id: selectedExam.id,
        answers: studentAnswers.map(a => a === -1 ? -1 : a)
      });
      
      toast.success(
        res.data.passed 
          ? `مبارك! نجحت في الاختبار بدرجة ${res.data.score}%` 
          : `للأسف لم تنجح. الدرجة: ${res.data.score}%`
      );
      
      setTakeExamDialogOpen(false);
      fetchExams();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في تقديم الاختبار');
    } finally {
      setSubmitting(false);
    }
  };

  const handleViewResults = async (exam) => {
    try {
      const res = await axios.get(`${API}/online-exams/${exam.id}/results`);
      setExamResults(res.data);
      setResultsDialogOpen(true);
    } catch (error) {
      toast.error('فشل في تحميل النتائج');
    }
  };

  const handleDeleteExam = async (examId) => {
    if (!confirm('هل أنت متأكد من حذف هذا الاختبار؟')) return;
    try {
      await axios.delete(`${API}/online-exams/${examId}`);
      toast.success('تم حذف الاختبار');
      fetchExams();
    } catch (error) {
      toast.error('فشل في الحذف');
    }
  };

  const handleToggleActive = async (examId) => {
    try {
      const res = await axios.put(`${API}/online-exams/${examId}/toggle-active`);
      toast.success(res.data.message);
      fetchExams();
    } catch (error) {
      toast.error('فشل في تغيير الحالة');
    }
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
            <div className="w-12 h-12 rounded-xl bg-indigo-500/20 flex items-center justify-center">
              <FileQuestion className="w-6 h-6 text-indigo-400" />
            </div>
            <div>
              <h1 className={`text-xl md:text-2xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                الاختبارات الإلكترونية
              </h1>
              <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                {isTeacher ? 'إنشاء وإدارة الاختبارات' : 'اختبر معلوماتك'}
              </p>
            </div>
          </div>
          
          {isTeacher && (
            <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button className="bg-indigo-600 hover:bg-indigo-700">
                  <Plus className="w-4 h-4 ml-2" />
                  إنشاء اختبار جديد
                </Button>
              </DialogTrigger>
              <DialogContent className={`max-w-4xl max-h-[90vh] overflow-y-auto ${isDark ? 'bg-slate-900 border-white/10' : 'bg-white'}`}>
                <DialogHeader>
                  <DialogTitle className={isDark ? 'text-white' : 'text-slate-900'}>إنشاء اختبار إلكتروني</DialogTitle>
                </DialogHeader>
                
                <div className="space-y-6">
                  {/* معلومات الاختبار */}
                  <div className={`p-4 rounded-xl ${isDark ? 'bg-slate-800/50' : 'bg-slate-50'}`}>
                    <h3 className={`font-bold mb-4 ${isDark ? 'text-white' : 'text-slate-900'}`}>معلومات الاختبار</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="col-span-2">
                        <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>عنوان الاختبار *</Label>
                        <Input
                          value={examForm.title}
                          onChange={(e) => setExamForm({ ...examForm, title: e.target.value })}
                          placeholder="مثال: اختبار أحكام النون الساكنة"
                          className={isDark ? 'bg-slate-700 border-white/10 text-white' : ''}
                        />
                      </div>
                      <div className="col-span-2">
                        <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>الوصف</Label>
                        <Textarea
                          value={examForm.description}
                          onChange={(e) => setExamForm({ ...examForm, description: e.target.value })}
                          placeholder="وصف مختصر للاختبار..."
                          className={isDark ? 'bg-slate-700 border-white/10 text-white' : ''}
                        />
                      </div>
                      <div>
                        <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>التصنيف</Label>
                        <select
                          value={examForm.category}
                          onChange={(e) => setExamForm({ ...examForm, category: e.target.value })}
                          className={`w-full p-2 rounded-md border ${isDark ? 'bg-slate-700 border-white/10 text-white' : 'bg-white border-slate-300'}`}
                        >
                          {CATEGORIES.map(c => (
                            <option key={c.value} value={c.value}>{c.label}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>المدة (دقيقة)</Label>
                        <Input
                          type="number"
                          min="5"
                          max="180"
                          value={examForm.duration_minutes}
                          onChange={(e) => setExamForm({ ...examForm, duration_minutes: parseInt(e.target.value) || 30 })}
                          className={isDark ? 'bg-slate-700 border-white/10 text-white' : ''}
                        />
                      </div>
                      <div>
                        <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>درجة النجاح %</Label>
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          value={examForm.passing_score}
                          onChange={(e) => setExamForm({ ...examForm, passing_score: parseInt(e.target.value) || 60 })}
                          className={isDark ? 'bg-slate-700 border-white/10 text-white' : ''}
                        />
                      </div>
                    </div>
                  </div>

                  {/* إضافة سؤال */}
                  <div className={`p-4 rounded-xl border-2 border-dashed ${isDark ? 'border-white/20 bg-slate-800/30' : 'border-slate-300 bg-slate-50'}`}>
                    <h3 className={`font-bold mb-4 ${isDark ? 'text-white' : 'text-slate-900'}`}>إضافة سؤال جديد</h3>
                    
                    <div className="space-y-4">
                      <div>
                        <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>نص السؤال *</Label>
                        <Textarea
                          value={newQuestion.question_text}
                          onChange={(e) => setNewQuestion({ ...newQuestion, question_text: e.target.value })}
                          placeholder="اكتب السؤال هنا..."
                          className={isDark ? 'bg-slate-700 border-white/10 text-white' : ''}
                        />
                      </div>
                      
                      <div className="grid grid-cols-2 gap-3">
                        {newQuestion.options.map((opt, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            <input
                              type="radio"
                              name="correct_answer"
                              checked={newQuestion.correct_answer === idx}
                              onChange={() => setNewQuestion({ ...newQuestion, correct_answer: idx })}
                              className="w-4 h-4 text-emerald-500"
                            />
                            <Input
                              value={opt}
                              onChange={(e) => {
                                const newOpts = [...newQuestion.options];
                                newOpts[idx] = e.target.value;
                                setNewQuestion({ ...newQuestion, options: newOpts });
                              }}
                              placeholder={`الخيار ${idx + 1}`}
                              className={`flex-1 ${isDark ? 'bg-slate-700 border-white/10 text-white' : ''}`}
                            />
                          </div>
                        ))}
                      </div>
                      <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                        * حدد الإجابة الصحيحة بالنقر على الدائرة بجانب الخيار
                      </p>
                      
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>النقاط:</Label>
                          <Input
                            type="number"
                            min="1"
                            max="10"
                            value={newQuestion.points}
                            onChange={(e) => setNewQuestion({ ...newQuestion, points: parseInt(e.target.value) || 1 })}
                            className={`w-20 ${isDark ? 'bg-slate-700 border-white/10 text-white' : ''}`}
                          />
                        </div>
                        <Button onClick={handleAddQuestion} className="bg-emerald-600 hover:bg-emerald-700">
                          <Plus className="w-4 h-4 ml-2" />
                          إضافة السؤال
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* قائمة الأسئلة */}
                  {examForm.questions.length > 0 && (
                    <div className={`p-4 rounded-xl ${isDark ? 'bg-slate-800/50' : 'bg-slate-50'}`}>
                      <h3 className={`font-bold mb-4 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                        الأسئلة المضافة ({examForm.questions.length})
                      </h3>
                      <div className="space-y-3">
                        {examForm.questions.map((q, idx) => (
                          <div key={q.id} className={`p-3 rounded-lg flex items-start justify-between ${isDark ? 'bg-slate-700/50' : 'bg-white border border-slate-200'}`}>
                            <div className="flex-1">
                              <p className={`font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                {idx + 1}. {q.question_text}
                              </p>
                              <p className={`text-xs mt-1 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>
                                الإجابة: {q.options[q.correct_answer]} • {q.points} نقطة
                              </p>
                            </div>
                            <Button variant="ghost" size="sm" onClick={() => handleRemoveQuestion(idx)} className="text-red-400">
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <DialogFooter className="mt-6">
                  <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>إلغاء</Button>
                  <Button onClick={handleCreateExam} disabled={submitting} className="bg-indigo-600 hover:bg-indigo-700">
                    {submitting ? 'جاري الإنشاء...' : 'إنشاء الاختبار'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* قائمة الاختبارات */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {exams.length === 0 ? (
          <div className={`col-span-full text-center py-12 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
            <FileQuestion className="w-16 h-16 mx-auto mb-4 opacity-50" />
            <p>لا توجد اختبارات متاحة</p>
          </div>
        ) : (
          exams.map((exam) => (
            <Card key={exam.id} className={`${isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'} overflow-hidden`}>
              <CardHeader className={`pb-2 ${exam.completed ? 'bg-emerald-500/10' : ''}`}>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className={`text-lg ${isDark ? 'text-white' : 'text-slate-900'}`}>{exam.title}</CardTitle>
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      exam.category === 'quran' ? 'bg-emerald-500/20 text-emerald-400' :
                      exam.category === 'tajweed' ? 'bg-blue-500/20 text-blue-400' :
                      exam.category === 'islamic' ? 'bg-purple-500/20 text-purple-400' :
                      'bg-slate-500/20 text-slate-400'
                    }`}>
                      {CATEGORIES.find(c => c.value === exam.category)?.label || exam.category}
                    </span>
                  </div>
                  {exam.completed && (
                    <div className="flex items-center gap-1 text-emerald-400">
                      <CheckCircle className="w-5 h-5" />
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {exam.description && (
                  <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>{exam.description}</p>
                )}
                
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className={`p-2 rounded-lg ${isDark ? 'bg-slate-800/50' : 'bg-slate-100'}`}>
                    <FileQuestion className="w-4 h-4 mx-auto text-indigo-400 mb-1" />
                    <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>أسئلة</p>
                    <p className={`font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{exam.questions?.length || 0}</p>
                  </div>
                  <div className={`p-2 rounded-lg ${isDark ? 'bg-slate-800/50' : 'bg-slate-100'}`}>
                    <Clock className="w-4 h-4 mx-auto text-amber-400 mb-1" />
                    <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>المدة</p>
                    <p className={`font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{exam.duration_minutes}د</p>
                  </div>
                  <div className={`p-2 rounded-lg ${isDark ? 'bg-slate-800/50' : 'bg-slate-100'}`}>
                    <Award className="w-4 h-4 mx-auto text-emerald-400 mb-1" />
                    <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>النجاح</p>
                    <p className={`font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{exam.passing_score}%</p>
                  </div>
                </div>

                {/* نتيجة الطالب */}
                {exam.completed && (
                  <div className={`p-3 rounded-lg text-center ${exam.passed ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-red-500/10 border border-red-500/30'}`}>
                    <p className={exam.passed ? 'text-emerald-400' : 'text-red-400'}>
                      {exam.passed ? 'ناجح ✅' : 'راسب ❌'} - درجتك: {exam.my_score}%
                    </p>
                  </div>
                )}

                {/* أزرار الإجراءات */}
                <div className="flex gap-2">
                  {!isTeacher ? (
                    exam.completed ? (
                      <Button disabled className="flex-1 bg-slate-600">
                        <CheckCircle className="w-4 h-4 ml-2" />
                        تم التقديم
                      </Button>
                    ) : (
                      <Button onClick={() => handleStartExam(exam)} className="flex-1 bg-indigo-600 hover:bg-indigo-700">
                        <Play className="w-4 h-4 ml-2" />
                        بدء الاختبار
                      </Button>
                    )
                  ) : (
                    <>
                      <Button onClick={() => handleViewResults(exam)} variant="outline" className="flex-1">
                        <BarChart className="w-4 h-4 ml-2" />
                        النتائج
                      </Button>
                      <Button onClick={() => handleToggleActive(exam.id)} variant="outline" size="sm">
                        {exam.is_active ? <XCircle className="w-4 h-4 text-red-400" /> : <CheckCircle className="w-4 h-4 text-emerald-400" />}
                      </Button>
                      <Button onClick={() => handleDeleteExam(exam.id)} variant="ghost" size="sm" className="text-red-400">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </>
                  )}
                </div>

                <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                  أنشأه: {exam.creator_name}
                </p>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* نافذة تقديم الاختبار */}
      <Dialog open={takeExamDialogOpen} onOpenChange={setTakeExamDialogOpen}>
        <DialogContent className={`max-w-2xl ${isDark ? 'bg-slate-900 border-white/10' : 'bg-white'}`}>
          <DialogHeader>
            <DialogTitle className={isDark ? 'text-white' : 'text-slate-900'}>
              {selectedExam?.title}
            </DialogTitle>
          </DialogHeader>
          
          {selectedExam && (
            <div className="space-y-6">
              {/* شريط التقدم */}
              <div className="flex items-center justify-between">
                <span className={isDark ? 'text-slate-400' : 'text-slate-600'}>
                  السؤال {currentQuestionIndex + 1} من {selectedExam.questions.length}
                </span>
                <div className="flex gap-1">
                  {selectedExam.questions.map((_, idx) => (
                    <button
                      key={idx}
                      onClick={() => setCurrentQuestionIndex(idx)}
                      className={`w-8 h-8 rounded-lg text-xs font-bold ${
                        studentAnswers[idx] !== -1
                          ? 'bg-emerald-500 text-white'
                          : idx === currentQuestionIndex
                            ? 'bg-indigo-500 text-white'
                            : isDark ? 'bg-slate-700 text-slate-400' : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {idx + 1}
                    </button>
                  ))}
                </div>
              </div>

              {/* السؤال الحالي */}
              <div className={`p-6 rounded-xl ${isDark ? 'bg-slate-800/50' : 'bg-slate-50'}`}>
                <p className={`text-lg font-bold mb-6 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  {selectedExam.questions[currentQuestionIndex]?.question_text}
                </p>
                
                <div className="space-y-3">
                  {selectedExam.questions[currentQuestionIndex]?.options.map((option, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        const newAnswers = [...studentAnswers];
                        newAnswers[currentQuestionIndex] = idx;
                        setStudentAnswers(newAnswers);
                      }}
                      className={`w-full p-4 rounded-xl text-right flex items-center gap-3 transition-all ${
                        studentAnswers[currentQuestionIndex] === idx
                          ? 'bg-indigo-500 text-white'
                          : isDark
                            ? 'bg-slate-700/50 text-white hover:bg-slate-700'
                            : 'bg-white text-slate-900 hover:bg-slate-100 border border-slate-200'
                      }`}
                    >
                      <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                        studentAnswers[currentQuestionIndex] === idx
                          ? 'bg-white/20'
                          : isDark ? 'bg-slate-600' : 'bg-slate-200'
                      }`}>
                        {String.fromCharCode(1571 + idx)}
                      </span>
                      <span className="flex-1">{option}</span>
                      {studentAnswers[currentQuestionIndex] === idx && (
                        <Check className="w-5 h-5" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* أزرار التنقل */}
              <div className="flex items-center justify-between">
                <Button
                  variant="outline"
                  onClick={() => setCurrentQuestionIndex(prev => Math.max(0, prev - 1))}
                  disabled={currentQuestionIndex === 0}
                >
                  السابق
                </Button>
                
                {currentQuestionIndex === selectedExam.questions.length - 1 ? (
                  <Button onClick={handleSubmitExam} disabled={submitting} className="bg-emerald-600 hover:bg-emerald-700">
                    {submitting ? 'جاري التقديم...' : 'تقديم الاختبار'}
                  </Button>
                ) : (
                  <Button
                    onClick={() => setCurrentQuestionIndex(prev => Math.min(selectedExam.questions.length - 1, prev + 1))}
                    className="bg-indigo-600 hover:bg-indigo-700"
                  >
                    التالي
                    <ChevronRight className="w-4 h-4 mr-2" />
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* نافذة النتائج */}
      <Dialog open={resultsDialogOpen} onOpenChange={setResultsDialogOpen}>
        <DialogContent className={`max-w-2xl max-h-[90vh] overflow-y-auto ${isDark ? 'bg-slate-900 border-white/10' : 'bg-white'}`}>
          <DialogHeader>
            <DialogTitle className={isDark ? 'text-white' : 'text-slate-900'}>
              نتائج: {examResults?.exam?.title}
            </DialogTitle>
          </DialogHeader>
          
          {examResults && (
            <div className="space-y-6">
              {/* إحصائيات */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className={`p-4 rounded-xl text-center ${isDark ? 'bg-indigo-500/10' : 'bg-indigo-50'}`}>
                  <p className={`text-2xl font-bold ${isDark ? 'text-indigo-400' : 'text-indigo-600'}`}>
                    {examResults.statistics.total_submissions}
                  </p>
                  <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>إجمالي المشاركين</p>
                </div>
                <div className={`p-4 rounded-xl text-center ${isDark ? 'bg-emerald-500/10' : 'bg-emerald-50'}`}>
                  <p className={`text-2xl font-bold ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>
                    {examResults.statistics.passed_count}
                  </p>
                  <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>ناجحون</p>
                </div>
                <div className={`p-4 rounded-xl text-center ${isDark ? 'bg-red-500/10' : 'bg-red-50'}`}>
                  <p className={`text-2xl font-bold ${isDark ? 'text-red-400' : 'text-red-600'}`}>
                    {examResults.statistics.failed_count}
                  </p>
                  <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>راسبون</p>
                </div>
                <div className={`p-4 rounded-xl text-center ${isDark ? 'bg-amber-500/10' : 'bg-amber-50'}`}>
                  <p className={`text-2xl font-bold ${isDark ? 'text-amber-400' : 'text-amber-600'}`}>
                    {examResults.statistics.average_score}%
                  </p>
                  <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>المعدل</p>
                </div>
              </div>

              {/* قائمة النتائج */}
              <div className={`rounded-xl overflow-hidden ${isDark ? 'bg-slate-800/50' : 'bg-slate-50'}`}>
                <div className={`p-3 grid grid-cols-4 font-bold text-sm ${isDark ? 'bg-slate-700 text-white' : 'bg-slate-200 text-slate-900'}`}>
                  <span>الطالب</span>
                  <span className="text-center">الدرجة</span>
                  <span className="text-center">الإجابات الصحيحة</span>
                  <span className="text-center">النتيجة</span>
                </div>
                {examResults.submissions.length === 0 ? (
                  <p className={`p-6 text-center ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>لا يوجد تقديمات بعد</p>
                ) : (
                  examResults.submissions.map((sub, idx) => (
                    <div key={sub.id} className={`p-3 grid grid-cols-4 items-center text-sm ${idx % 2 === 0 ? '' : isDark ? 'bg-slate-800/30' : 'bg-white'}`}>
                      <span className={isDark ? 'text-white' : 'text-slate-900'}>{sub.student_name}</span>
                      <span className={`text-center font-bold ${sub.score >= examResults.exam.passing_score ? 'text-emerald-400' : 'text-red-400'}`}>
                        {sub.score}%
                      </span>
                      <span className={`text-center ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                        {sub.correct_count}/{sub.total_questions}
                      </span>
                      <span className="text-center">
                        {sub.passed ? (
                          <span className="text-emerald-400">ناجح ✅</span>
                        ) : (
                          <span className="text-red-400">راسب ❌</span>
                        )}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default OnlineExams;
