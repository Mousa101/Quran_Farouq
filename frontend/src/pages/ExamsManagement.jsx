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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { toast } from 'sonner';
import { 
  FileText, Plus, Trash2, CheckCircle, XCircle, AlertTriangle, 
  BookOpen, Award, Eye, Filter
} from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const QURAN_JUZ = Array.from({ length: 30 }, (_, i) => i + 1);

const TAJWEED_TOPICS = [
  'أحكام النون الساكنة والتنوين',
  'أحكام الميم الساكنة',
  'المدود',
  'أحكام اللام',
  'التفخيم والترقيق',
  'الوقف والابتداء',
  'أحكام الراء',
  'صفات الحروف',
  'مخارج الحروف'
];

const ExamsManagement = () => {
  const { user } = useAuth();
  const { isDark } = useTheme();
  const [exams, setExams] = useState([]);
  const [tajweedExams, setTajweedExams] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('quran');
  const [viewFilter, setViewFilter] = useState('all');
  
  const [quranForm, setQuranForm] = useState({
    student_id: '',
    exam_type: 'quran',
    juz_number: 1,
    surah_name: '',
    page_from: '',
    page_to: '',
    error_count: 0,
    warning_count: 0,
    tajweed_errors: 0,
    pronunciation_errors: 0,
    memorization_errors: 0,
    result: 'pending',
    grade: '',
    notes: ''
  });

  const [tajweedForm, setTajweedForm] = useState({
    student_id: '',
    topic: TAJWEED_TOPICS[0],
    questions_count: 10,
    correct_answers: 0,
    practical_score: 0,
    theoretical_score: 0,
    result: 'pending',
    notes: ''
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [examsRes, tajweedRes, studentsRes] = await Promise.all([
        axios.get(`${API}/admin-exams`),
        axios.get(`${API}/tajweed-exams`),
        user?.role === 'admin' 
          ? axios.get(`${API}/users?role=student`)
          : axios.get(`${API}/groups`).then(async (res) => {
              const allStudents = [];
              for (const g of res.data) {
                const sRes = await axios.get(`${API}/groups/${g.id}/students`);
                allStudents.push(...sRes.data);
              }
              return { data: allStudents };
            })
      ]);
      setExams(examsRes.data);
      setTajweedExams(tajweedRes.data);
      setStudents(studentsRes.data);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleQuranSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/admin-exams`, {
        ...quranForm,
        grade: parseInt(quranForm.grade) || 0
      });
      toast.success('تم إضافة الامتحان بنجاح');
      setDialogOpen(false);
      resetForms();
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في إضافة الامتحان');
    }
  };

  const handleTajweedSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/tajweed-exams`, tajweedForm);
      toast.success('تم إضافة امتحان التجويد بنجاح');
      setDialogOpen(false);
      resetForms();
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في إضافة الامتحان');
    }
  };

  const handleDeleteExam = async (examId, type) => {
    if (!confirm('هل أنت متأكد من حذف هذا الامتحان؟')) return;
    try {
      const endpoint = type === 'tajweed' ? 'tajweed-exams' : 'admin-exams';
      await axios.delete(`${API}/${endpoint}/${examId}`);
      toast.success('تم حذف الامتحان');
      fetchData();
    } catch (error) {
      toast.error('فشل في الحذف');
    }
  };

  const resetForms = () => {
    setQuranForm({
      student_id: '',
      exam_type: 'quran',
      juz_number: 1,
      surah_name: '',
      page_from: '',
      page_to: '',
      error_count: 0,
      warning_count: 0,
      tajweed_errors: 0,
      pronunciation_errors: 0,
      memorization_errors: 0,
      result: 'pending',
      grade: '',
      notes: ''
    });
    setTajweedForm({
      student_id: '',
      topic: TAJWEED_TOPICS[0],
      questions_count: 10,
      correct_answers: 0,
      practical_score: 0,
      theoretical_score: 0,
      result: 'pending',
      notes: ''
    });
  };

  const getResultBadge = (result) => {
    if (result === 'pass') return { bg: 'bg-emerald-500/20', text: 'text-emerald-400', label: 'ناجح', icon: CheckCircle };
    if (result === 'fail') return { bg: 'bg-red-500/20', text: 'text-red-400', label: 'راسب', icon: XCircle };
    return { bg: 'bg-amber-500/20', text: 'text-amber-400', label: 'قيد المراجعة', icon: AlertTriangle };
  };

  const filteredExams = viewFilter === 'all' ? exams : exams.filter(e => e.result === viewFilter);
  const filteredTajweed = viewFilter === 'all' ? tajweedExams : tajweedExams.filter(e => e.result === viewFilter);

  const isStudent = user?.role === 'student';

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
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center">
              <Award className="w-6 h-6 text-purple-400" />
            </div>
            <div>
              <h1 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>الامتحانات</h1>
              <p className={isDark ? 'text-slate-400' : 'text-slate-600'}>
                {isStudent ? 'نتائج امتحاناتي' : 'إدارة الامتحانات الإدارية والتجويد'}
              </p>
            </div>
          </div>
          {!isStudent && (
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button className="bg-purple-600 hover:bg-purple-700">
                  <Plus className="w-4 h-4 ml-2" />
                  إضافة امتحان
                </Button>
              </DialogTrigger>
              <DialogContent className={`max-w-2xl ${isDark ? 'bg-slate-900 border-white/10' : 'bg-white'}`}>
                <DialogHeader>
                  <DialogTitle className={isDark ? 'text-white' : 'text-slate-900'}>إضافة امتحان جديد</DialogTitle>
                </DialogHeader>
                
                <Tabs defaultValue="quran">
                  <TabsList className={`grid w-full grid-cols-2 ${isDark ? 'bg-slate-800' : 'bg-slate-100'}`}>
                    <TabsTrigger value="quran">مفصل قرآن</TabsTrigger>
                    <TabsTrigger value="tajweed">امتحان تجويد</TabsTrigger>
                  </TabsList>

                  <TabsContent value="quran" className="mt-4">
                    <form onSubmit={handleQuranSubmit} className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>الطالب</Label>
                          <select
                            value={quranForm.student_id}
                            onChange={(e) => setQuranForm({ ...quranForm, student_id: e.target.value })}
                            required
                            className={`w-full p-2 rounded-md border ${isDark ? 'bg-slate-800 border-white/10 text-white' : 'bg-white border-slate-300'}`}
                          >
                            <option value="">اختر الطالب</option>
                            {students.map((s) => (
                              <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>الجزء</Label>
                          <select
                            value={quranForm.juz_number}
                            onChange={(e) => setQuranForm({ ...quranForm, juz_number: parseInt(e.target.value) })}
                            className={`w-full p-2 rounded-md border ${isDark ? 'bg-slate-800 border-white/10 text-white' : 'bg-white border-slate-300'}`}
                          >
                            {QURAN_JUZ.map((j) => (
                              <option key={j} value={j}>الجزء {j}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>من صفحة</Label>
                          <Input
                            type="number"
                            value={quranForm.page_from}
                            onChange={(e) => setQuranForm({ ...quranForm, page_from: e.target.value })}
                            className={isDark ? 'bg-slate-800 border-white/10 text-white' : ''}
                          />
                        </div>
                        <div>
                          <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>إلى صفحة</Label>
                          <Input
                            type="number"
                            value={quranForm.page_to}
                            onChange={(e) => setQuranForm({ ...quranForm, page_to: e.target.value })}
                            className={isDark ? 'bg-slate-800 border-white/10 text-white' : ''}
                          />
                        </div>
                        <div>
                          <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>الدرجة %</Label>
                          <Input
                            type="number"
                            min="0"
                            max="100"
                            value={quranForm.grade}
                            onChange={(e) => setQuranForm({ ...quranForm, grade: e.target.value })}
                            className={isDark ? 'bg-slate-800 border-white/10 text-white' : ''}
                          />
                        </div>
                      </div>

                      <div className={`p-4 rounded-xl ${isDark ? 'bg-slate-800/50' : 'bg-slate-50'}`}>
                        <h4 className={`font-bold mb-3 ${isDark ? 'text-white' : 'text-slate-900'}`}>تفاصيل الأخطاء</h4>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>أخطاء الحفظ</Label>
                            <Input
                              type="number"
                              min="0"
                              value={quranForm.memorization_errors}
                              onChange={(e) => setQuranForm({ ...quranForm, memorization_errors: parseInt(e.target.value) || 0 })}
                              className={isDark ? 'bg-slate-700 border-white/10 text-white' : ''}
                            />
                          </div>
                          <div>
                            <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>أخطاء التجويد</Label>
                            <Input
                              type="number"
                              min="0"
                              value={quranForm.tajweed_errors}
                              onChange={(e) => setQuranForm({ ...quranForm, tajweed_errors: parseInt(e.target.value) || 0 })}
                              className={isDark ? 'bg-slate-700 border-white/10 text-white' : ''}
                            />
                          </div>
                          <div>
                            <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>أخطاء النطق</Label>
                            <Input
                              type="number"
                              min="0"
                              value={quranForm.pronunciation_errors}
                              onChange={(e) => setQuranForm({ ...quranForm, pronunciation_errors: parseInt(e.target.value) || 0 })}
                              className={isDark ? 'bg-slate-700 border-white/10 text-white' : ''}
                            />
                          </div>
                          <div>
                            <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>التنبيهات</Label>
                            <Input
                              type="number"
                              min="0"
                              value={quranForm.warning_count}
                              onChange={(e) => setQuranForm({ ...quranForm, warning_count: parseInt(e.target.value) || 0 })}
                              className={isDark ? 'bg-slate-700 border-white/10 text-white' : ''}
                            />
                          </div>
                        </div>
                      </div>

                      <div>
                        <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>النتيجة</Label>
                        <select
                          value={quranForm.result}
                          onChange={(e) => setQuranForm({ ...quranForm, result: e.target.value })}
                          className={`w-full p-2 rounded-md border ${isDark ? 'bg-slate-800 border-white/10 text-white' : 'bg-white border-slate-300'}`}
                        >
                          <option value="pending">قيد المراجعة</option>
                          <option value="pass">ناجح</option>
                          <option value="fail">راسب</option>
                        </select>
                      </div>

                      <div>
                        <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>ملاحظات</Label>
                        <Textarea
                          value={quranForm.notes}
                          onChange={(e) => setQuranForm({ ...quranForm, notes: e.target.value })}
                          className={isDark ? 'bg-slate-800 border-white/10 text-white' : ''}
                        />
                      </div>

                      <Button type="submit" className="w-full bg-purple-600 hover:bg-purple-700">إضافة الامتحان</Button>
                    </form>
                  </TabsContent>

                  <TabsContent value="tajweed" className="mt-4">
                    <form onSubmit={handleTajweedSubmit} className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>الطالب</Label>
                          <select
                            value={tajweedForm.student_id}
                            onChange={(e) => setTajweedForm({ ...tajweedForm, student_id: e.target.value })}
                            required
                            className={`w-full p-2 rounded-md border ${isDark ? 'bg-slate-800 border-white/10 text-white' : 'bg-white border-slate-300'}`}
                          >
                            <option value="">اختر الطالب</option>
                            {students.map((s) => (
                              <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>الموضوع</Label>
                          <select
                            value={tajweedForm.topic}
                            onChange={(e) => setTajweedForm({ ...tajweedForm, topic: e.target.value })}
                            className={`w-full p-2 rounded-md border ${isDark ? 'bg-slate-800 border-white/10 text-white' : 'bg-white border-slate-300'}`}
                          >
                            {TAJWEED_TOPICS.map((t) => (
                              <option key={t} value={t}>{t}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>الدرجة النظرية %</Label>
                          <Input
                            type="number"
                            min="0"
                            max="100"
                            value={tajweedForm.theoretical_score}
                            onChange={(e) => setTajweedForm({ ...tajweedForm, theoretical_score: parseInt(e.target.value) || 0 })}
                            className={isDark ? 'bg-slate-800 border-white/10 text-white' : ''}
                          />
                        </div>
                        <div>
                          <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>الدرجة العملية %</Label>
                          <Input
                            type="number"
                            min="0"
                            max="100"
                            value={tajweedForm.practical_score}
                            onChange={(e) => setTajweedForm({ ...tajweedForm, practical_score: parseInt(e.target.value) || 0 })}
                            className={isDark ? 'bg-slate-800 border-white/10 text-white' : ''}
                          />
                        </div>
                      </div>

                      <div>
                        <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>النتيجة</Label>
                        <select
                          value={tajweedForm.result}
                          onChange={(e) => setTajweedForm({ ...tajweedForm, result: e.target.value })}
                          className={`w-full p-2 rounded-md border ${isDark ? 'bg-slate-800 border-white/10 text-white' : 'bg-white border-slate-300'}`}
                        >
                          <option value="pending">قيد المراجعة</option>
                          <option value="pass">ناجح</option>
                          <option value="fail">راسب</option>
                        </select>
                      </div>

                      <div>
                        <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>ملاحظات</Label>
                        <Textarea
                          value={tajweedForm.notes}
                          onChange={(e) => setTajweedForm({ ...tajweedForm, notes: e.target.value })}
                          className={isDark ? 'bg-slate-800 border-white/10 text-white' : ''}
                        />
                      </div>

                      <Button type="submit" className="w-full bg-purple-600 hover:bg-purple-700">إضافة الامتحان</Button>
                    </form>
                  </TabsContent>
                </Tabs>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* Filter */}
      <Card className={isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'}>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className={`w-5 h-5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`} />
            <span className={`text-sm font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>فلتر:</span>
            {['all', 'pass', 'fail', 'pending'].map((filter) => (
              <Button
                key={filter}
                variant={viewFilter === filter ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewFilter(filter)}
                className={viewFilter === filter ? 'bg-purple-600' : isDark ? 'border-white/10' : ''}
              >
                {filter === 'all' ? 'الكل' : filter === 'pass' ? 'ناجح' : filter === 'fail' ? 'راسب' : 'قيد المراجعة'}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className={`grid w-full grid-cols-2 ${isDark ? 'bg-slate-800' : 'bg-slate-100'}`}>
          <TabsTrigger value="quran">مفاصل القرآن ({filteredExams.length})</TabsTrigger>
          <TabsTrigger value="tajweed">امتحانات التجويد ({filteredTajweed.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="quran" className="mt-4">
          <Card className={isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'}>
            <CardContent className="p-4">
              {filteredExams.length === 0 ? (
                <p className={`text-center py-8 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>لا توجد امتحانات</p>
              ) : (
                <div className="space-y-4">
                  {filteredExams.map((exam) => {
                    const resultBadge = getResultBadge(exam.result);
                    const ResultIcon = resultBadge.icon;
                    return (
                      <div key={exam.id} className={`p-4 rounded-xl ${isDark ? 'bg-slate-800/50 border border-white/5' : 'bg-slate-50 border border-slate-200'}`}>
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <h3 className={`font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{exam.student_name}</h3>
                            <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                              الجزء {exam.juz_number} • صفحة {exam.page_from} - {exam.page_to}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`px-3 py-1 rounded-full flex items-center gap-1 ${resultBadge.bg} ${resultBadge.text}`}>
                              <ResultIcon className="w-4 h-4" />
                              {resultBadge.label}
                            </span>
                            {!isStudent && (
                              <Button variant="ghost" size="sm" onClick={() => handleDeleteExam(exam.id, 'quran')} className="text-red-400">
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-3">
                          <div className={`p-2 rounded-lg text-center ${isDark ? 'bg-slate-700/50' : 'bg-white'}`}>
                            <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>الدرجة</p>
                            <p className="font-bold text-emerald-400">{exam.grade || 0}%</p>
                          </div>
                          <div className={`p-2 rounded-lg text-center ${isDark ? 'bg-slate-700/50' : 'bg-white'}`}>
                            <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>أخطاء الحفظ</p>
                            <p className="font-bold text-red-400">{exam.memorization_errors}</p>
                          </div>
                          <div className={`p-2 rounded-lg text-center ${isDark ? 'bg-slate-700/50' : 'bg-white'}`}>
                            <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>أخطاء التجويد</p>
                            <p className="font-bold text-amber-400">{exam.tajweed_errors}</p>
                          </div>
                          <div className={`p-2 rounded-lg text-center ${isDark ? 'bg-slate-700/50' : 'bg-white'}`}>
                            <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>أخطاء النطق</p>
                            <p className="font-bold text-purple-400">{exam.pronunciation_errors}</p>
                          </div>
                          <div className={`p-2 rounded-lg text-center ${isDark ? 'bg-slate-700/50' : 'bg-white'}`}>
                            <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>التنبيهات</p>
                            <p className="font-bold text-blue-400">{exam.warning_count}</p>
                          </div>
                        </div>
                        {exam.notes && (
                          <p className={`mt-3 text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                            <strong>ملاحظات:</strong> {exam.notes}
                          </p>
                        )}
                        <p className={`mt-2 text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                          الممتحن: {exam.examiner_name} • {exam.exam_date}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tajweed" className="mt-4">
          <Card className={isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'}>
            <CardContent className="p-4">
              {filteredTajweed.length === 0 ? (
                <p className={`text-center py-8 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>لا توجد امتحانات تجويد</p>
              ) : (
                <div className="space-y-4">
                  {filteredTajweed.map((exam) => {
                    const resultBadge = getResultBadge(exam.result);
                    const ResultIcon = resultBadge.icon;
                    return (
                      <div key={exam.id} className={`p-4 rounded-xl ${isDark ? 'bg-slate-800/50 border border-white/5' : 'bg-slate-50 border border-slate-200'}`}>
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <h3 className={`font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{exam.student_name}</h3>
                            <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>{exam.topic}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`px-3 py-1 rounded-full flex items-center gap-1 ${resultBadge.bg} ${resultBadge.text}`}>
                              <ResultIcon className="w-4 h-4" />
                              {resultBadge.label}
                            </span>
                            {!isStudent && (
                              <Button variant="ghost" size="sm" onClick={() => handleDeleteExam(exam.id, 'tajweed')} className="text-red-400">
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-3 mt-3">
                          <div className={`p-2 rounded-lg text-center ${isDark ? 'bg-slate-700/50' : 'bg-white'}`}>
                            <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>الدرجة النظرية</p>
                            <p className="font-bold text-blue-400">{exam.theoretical_score}%</p>
                          </div>
                          <div className={`p-2 rounded-lg text-center ${isDark ? 'bg-slate-700/50' : 'bg-white'}`}>
                            <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>الدرجة العملية</p>
                            <p className="font-bold text-purple-400">{exam.practical_score}%</p>
                          </div>
                          <div className={`p-2 rounded-lg text-center ${isDark ? 'bg-slate-700/50' : 'bg-white'}`}>
                            <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>الدرجة النهائية</p>
                            <p className="font-bold text-emerald-400">{exam.final_score}%</p>
                          </div>
                        </div>
                        {exam.notes && (
                          <p className={`mt-3 text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                            <strong>ملاحظات:</strong> {exam.notes}
                          </p>
                        )}
                        <p className={`mt-2 text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                          {exam.exam_date}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ExamsManagement;
