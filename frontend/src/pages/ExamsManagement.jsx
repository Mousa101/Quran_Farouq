import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '../components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';
import { 
  FileText, Plus, Trash2, CheckCircle, XCircle, AlertTriangle, 
  BookOpen, Award, Eye, Filter, FileQuestion, Play, BarChart
} from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// مفاصل القرآن الجديدة
const MUFASSAL_LEVELS = [
  { value: 5, label: 'مفصل 5 أجزاء', juz: [26, 27, 28, 29, 30], color: 'emerald' },
  { value: 10, label: 'مفصل 10 أجزاء', juz: [21, 22, 23, 24, 25, 26, 27, 28, 29, 30], color: 'blue' },
  { value: 15, label: 'مفصل 15 جزء', juz: [16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30], color: 'purple' },
  { value: 20, label: 'مفصل 20 جزء', juz: Array.from({ length: 20 }, (_, i) => 11 + i), color: 'amber' },
  { value: 25, label: 'مفصل 25 جزء', juz: Array.from({ length: 25 }, (_, i) => 6 + i), color: 'pink' },
  { value: 30, label: 'مفصل 30 جزء (كامل)', juz: Array.from({ length: 30 }, (_, i) => 1 + i), color: 'red' }
];

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
  const [onlineExams, setOnlineExams] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('mufassal'); // mufassal, tajweed, online
  const [viewFilter, setViewFilter] = useState('all');
  
  const [quranForm, setQuranForm] = useState({
    student_id: '',
    exam_type: 'quran',
    mufassal_level: 5,
    juz_numbers: [],  // أجزاء متعددة
    selected_juz: [],  // الأجزاء المختارة
    surah_name: '',
    page_from: '',
    page_to: '',
    warning_count: 0,  // التنبيهات (-0.5 لكل تنبيه)
    error_count: 0,    // الأخطاء (-2 لكل خطأ)
    tajweed_errors: 0, // أخطاء التجويد (-0.5 لكل خطأ)
    pronunciation_errors: 0,
    memorization_errors: 0,
    result: 'pending', // 'pass', 'fail', 'pending'
    grade: 100,        // الدرجة من 100
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

  const isTeacher = user?.role === 'admin' || user?.role === 'sheikh';

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [examsRes, tajweedRes, onlineRes, studentsRes] = await Promise.all([
        axios.get(`${API}/admin-exams`).catch(() => ({ data: [] })),
        axios.get(`${API}/tajweed-exams`).catch(() => ({ data: [] })),
        axios.get(`${API}/online-exams`).catch(() => ({ data: [] })),
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
      setOnlineExams(onlineRes.data);
      setStudents(studentsRes.data);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleMufassalSubmit = async (e) => {
    e.preventDefault();
    try {
      const totalErrors = quranForm.tajweed_errors + quranForm.pronunciation_errors + quranForm.memorization_errors;
      let result = 'pending';
      let grade = '';
      
      if (totalErrors <= 2) { result = 'excellent'; grade = 'ممتاز'; }
      else if (totalErrors <= 5) { result = 'good'; grade = 'جيد جداً'; }
      else if (totalErrors <= 8) { result = 'pass'; grade = 'جيد'; }
      else { result = 'fail'; grade = 'راسب'; }
      
      await axios.post(`${API}/admin-exams`, {
        ...quranForm,
        result,
        grade,
        error_count: totalErrors
      });
      
      toast.success('تم تسجيل امتحان المفصل بنجاح');
      setDialogOpen(false);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في تسجيل الامتحان');
    }
  };

  const handleTajweedSubmit = async (e) => {
    e.preventDefault();
    try {
      const totalScore = (tajweedForm.correct_answers / tajweedForm.questions_count) * 50 +
                        tajweedForm.practical_score * 0.3 +
                        tajweedForm.theoretical_score * 0.2;
      
      let result = 'pending';
      if (totalScore >= 90) result = 'excellent';
      else if (totalScore >= 75) result = 'good';
      else if (totalScore >= 60) result = 'pass';
      else result = 'fail';
      
      await axios.post(`${API}/tajweed-exams`, {
        ...tajweedForm,
        result,
        total_score: Math.round(totalScore)
      });
      
      toast.success('تم تسجيل امتحان التجويد بنجاح');
      setDialogOpen(false);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في تسجيل الامتحان');
    }
  };

  const handleDelete = async (examId, type) => {
    if (!confirm('هل أنت متأكد من حذف هذا الامتحان؟')) return;
    try {
      const endpoint = type === 'tajweed' ? 'tajweed-exams' : type === 'online' ? 'online-exams' : 'admin-exams';
      await axios.delete(`${API}/${endpoint}/${examId}`);
      toast.success('تم حذف الامتحان');
      fetchData();
    } catch (error) {
      toast.error('فشل في الحذف');
    }
  };

  const getStudentName = (studentId) => {
    const student = students.find(s => s.id === studentId);
    return student?.name || 'غير معروف';
  };

  const getResultBadge = (result) => {
    switch (result) {
      case 'excellent': return 'bg-emerald-500/20 text-emerald-400';
      case 'good': return 'bg-blue-500/20 text-blue-400';
      case 'pass': return 'bg-amber-500/20 text-amber-400';
      case 'fail': return 'bg-red-500/20 text-red-400';
      default: return 'bg-slate-500/20 text-slate-400';
    }
  };

  const getResultLabel = (result) => {
    switch (result) {
      case 'excellent': return 'ممتاز';
      case 'good': return 'جيد جداً';
      case 'pass': return 'مقبول';
      case 'fail': return 'راسب';
      default: return 'معلق';
    }
  };

  const getMufassalColor = (level) => {
    const found = MUFASSAL_LEVELS.find(m => m.value === level);
    return found?.color || 'slate';
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
            <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center">
              <Award className="w-6 h-6 text-amber-400" />
            </div>
            <div>
              <h1 className={`text-xl md:text-2xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>الامتحانات</h1>
              <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                {isTeacher ? 'إدارة الامتحانات والتقييمات' : 'امتحاناتي ونتائجي'}
              </p>
            </div>
          </div>
          
          {isTeacher && (
            <div className="flex gap-2">
              <Link to="/online-exams">
                <Button variant="outline" className="border-indigo-500/50 text-indigo-400 hover:bg-indigo-500/10">
                  <FileQuestion className="w-4 h-4 ml-2" />
                  امتحانات إلكترونية
                </Button>
              </Link>
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-amber-600 hover:bg-amber-700">
                    <Plus className="w-4 h-4 ml-2" />
                    تسجيل امتحان
                  </Button>
                </DialogTrigger>
                <DialogContent className={`max-w-2xl max-h-[90vh] overflow-y-auto ${isDark ? 'bg-slate-900 border-white/10' : 'bg-white'}`}>
                  <DialogHeader>
                    <DialogTitle className={isDark ? 'text-white' : 'text-slate-900'}>تسجيل امتحان جديد</DialogTitle>
                  </DialogHeader>
                  
                  <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <TabsList className={`grid w-full grid-cols-2 ${isDark ? 'bg-slate-800' : 'bg-slate-100'}`}>
                      <TabsTrigger value="mufassal">امتحان مفصل</TabsTrigger>
                      <TabsTrigger value="tajweed">امتحان تجويد</TabsTrigger>
                    </TabsList>

                    {/* امتحان المفصل */}
                    <TabsContent value="mufassal" className="mt-4">
                      <form onSubmit={handleMufassalSubmit} className="space-y-4">
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
                            <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>مستوى المفصل</Label>
                            <select
                              value={quranForm.mufassal_level}
                              onChange={(e) => {
                                const level = parseInt(e.target.value);
                                const mufassal = MUFASSAL_LEVELS.find(m => m.value === level);
                                setQuranForm({ 
                                  ...quranForm, 
                                  mufassal_level: level,
                                  juz_number: mufassal?.juz[0] || 26
                                });
                              }}
                              className={`w-full p-2 rounded-md border ${isDark ? 'bg-slate-800 border-white/10 text-white' : 'bg-white border-slate-300'}`}
                            >
                              {MUFASSAL_LEVELS.map((m) => (
                                <option key={m.value} value={m.value}>{m.label}</option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-4">
                          <div>
                            <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>الجزء</Label>
                            <select
                              value={quranForm.juz_number}
                              onChange={(e) => setQuranForm({ ...quranForm, juz_number: parseInt(e.target.value) })}
                              className={`w-full p-2 rounded-md border ${isDark ? 'bg-slate-800 border-white/10 text-white' : 'bg-white border-slate-300'}`}
                            >
                              {(MUFASSAL_LEVELS.find(m => m.value === quranForm.mufassal_level)?.juz || []).map((j) => (
                                <option key={j} value={j}>الجزء {j}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>من صفحة</Label>
                            <Input
                              type="number"
                              min="1"
                              max="604"
                              value={quranForm.page_from}
                              onChange={(e) => setQuranForm({ ...quranForm, page_from: e.target.value })}
                              className={isDark ? 'bg-slate-800 border-white/10 text-white' : ''}
                            />
                          </div>
                          <div>
                            <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>إلى صفحة</Label>
                            <Input
                              type="number"
                              min="1"
                              max="604"
                              value={quranForm.page_to}
                              onChange={(e) => setQuranForm({ ...quranForm, page_to: e.target.value })}
                              className={isDark ? 'bg-slate-800 border-white/10 text-white' : ''}
                            />
                          </div>
                        </div>

                        <div className={`p-4 rounded-xl ${isDark ? 'bg-slate-800/50' : 'bg-slate-50'}`}>
                          <h4 className={`font-bold mb-3 ${isDark ? 'text-white' : 'text-slate-900'}`}>الأخطاء</h4>
                          <div className="grid grid-cols-3 gap-4">
                            <div>
                              <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>تجويد</Label>
                              <Input
                                type="number"
                                min="0"
                                value={quranForm.tajweed_errors}
                                onChange={(e) => setQuranForm({ ...quranForm, tajweed_errors: parseInt(e.target.value) || 0 })}
                                className={isDark ? 'bg-slate-700 border-white/10 text-white' : ''}
                              />
                            </div>
                            <div>
                              <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>نطق</Label>
                              <Input
                                type="number"
                                min="0"
                                value={quranForm.pronunciation_errors}
                                onChange={(e) => setQuranForm({ ...quranForm, pronunciation_errors: parseInt(e.target.value) || 0 })}
                                className={isDark ? 'bg-slate-700 border-white/10 text-white' : ''}
                              />
                            </div>
                            <div>
                              <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>حفظ</Label>
                              <Input
                                type="number"
                                min="0"
                                value={quranForm.memorization_errors}
                                onChange={(e) => setQuranForm({ ...quranForm, memorization_errors: parseInt(e.target.value) || 0 })}
                                className={isDark ? 'bg-slate-700 border-white/10 text-white' : ''}
                              />
                            </div>
                          </div>
                        </div>

                        <div>
                          <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>ملاحظات</Label>
                          <Textarea
                            value={quranForm.notes}
                            onChange={(e) => setQuranForm({ ...quranForm, notes: e.target.value })}
                            className={isDark ? 'bg-slate-800 border-white/10 text-white' : ''}
                          />
                        </div>

                        <DialogFooter>
                          <Button type="submit" className="bg-amber-600 hover:bg-amber-700">
                            تسجيل الامتحان
                          </Button>
                        </DialogFooter>
                      </form>
                    </TabsContent>

                    {/* امتحان التجويد */}
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
                            <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>موضوع التجويد</Label>
                            <select
                              value={tajweedForm.topic}
                              onChange={(e) => setTajweedForm({ ...tajweedForm, topic: e.target.value })}
                              className={`w-full p-2 rounded-md border ${isDark ? 'bg-slate-800 border-white/10 text-white' : 'bg-white border-slate-300'}`}
                            >
                              {TAJWEED_TOPICS.map((topic) => (
                                <option key={topic} value={topic}>{topic}</option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-4">
                          <div>
                            <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>عدد الأسئلة</Label>
                            <Input
                              type="number"
                              min="1"
                              value={tajweedForm.questions_count}
                              onChange={(e) => setTajweedForm({ ...tajweedForm, questions_count: parseInt(e.target.value) || 10 })}
                              className={isDark ? 'bg-slate-800 border-white/10 text-white' : ''}
                            />
                          </div>
                          <div>
                            <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>الإجابات الصحيحة</Label>
                            <Input
                              type="number"
                              min="0"
                              max={tajweedForm.questions_count}
                              value={tajweedForm.correct_answers}
                              onChange={(e) => setTajweedForm({ ...tajweedForm, correct_answers: parseInt(e.target.value) || 0 })}
                              className={isDark ? 'bg-slate-800 border-white/10 text-white' : ''}
                            />
                          </div>
                          <div>
                            <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>الدرجة العملية (100)</Label>
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
                          <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>ملاحظات</Label>
                          <Textarea
                            value={tajweedForm.notes}
                            onChange={(e) => setTajweedForm({ ...tajweedForm, notes: e.target.value })}
                            className={isDark ? 'bg-slate-800 border-white/10 text-white' : ''}
                          />
                        </div>

                        <DialogFooter>
                          <Button type="submit" className="bg-blue-600 hover:bg-blue-700">
                            تسجيل الامتحان
                          </Button>
                        </DialogFooter>
                      </form>
                    </TabsContent>
                  </Tabs>
                </DialogContent>
              </Dialog>
            </div>
          )}
        </div>
      </div>

      {/* مفاصل القرآن */}
      {isTeacher && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {MUFASSAL_LEVELS.map((mufassal) => {
            const count = exams.filter(e => e.mufassal_level === mufassal.value).length;
            return (
              <Card key={mufassal.value} className={`${isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'} cursor-pointer hover:border-${mufassal.color}-500/50 transition-all`}>
                <CardContent className="p-4 text-center">
                  <BookOpen className={`w-8 h-8 mx-auto text-${mufassal.color}-400 mb-2`} />
                  <p className={`font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{mufassal.label}</p>
                  <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    {count} امتحان
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Tabs للامتحانات */}
      <Tabs defaultValue="mufassal" className="w-full">
        <TabsList className={`grid w-full grid-cols-3 ${isDark ? 'bg-slate-800' : 'bg-slate-100'}`}>
          <TabsTrigger value="mufassal">امتحانات المفصل ({exams.length})</TabsTrigger>
          <TabsTrigger value="tajweed">امتحانات التجويد ({tajweedExams.length})</TabsTrigger>
          <TabsTrigger value="online">امتحانات إلكترونية ({onlineExams.length})</TabsTrigger>
        </TabsList>

        {/* امتحانات المفصل */}
        <TabsContent value="mufassal">
          <Card className={isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'}>
            <CardContent className="p-0">
              {exams.length === 0 ? (
                <p className={`p-8 text-center ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>لا توجد امتحانات مفصل</p>
              ) : (
                <div className={`divide-y ${isDark ? 'divide-white/5' : 'divide-slate-100'}`}>
                  {exams.map((exam) => (
                    <div key={exam.id} className={`p-4 flex items-center justify-between ${isDark ? 'hover:bg-white/5' : 'hover:bg-slate-50'}`}>
                      <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-xl bg-${getMufassalColor(exam.mufassal_level)}-500/20 flex items-center justify-center`}>
                          <BookOpen className={`w-6 h-6 text-${getMufassalColor(exam.mufassal_level)}-400`} />
                        </div>
                        <div>
                          <h3 className={`font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{getStudentName(exam.student_id)}</h3>
                          <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                            مفصل {exam.mufassal_level || exam.juz_number} أجزاء • الجزء {exam.juz_number}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge className={getResultBadge(exam.result)}>
                          {getResultLabel(exam.result)}
                        </Badge>
                        {isTeacher && (
                          <Button variant="ghost" size="sm" onClick={() => handleDelete(exam.id, 'quran')} className="text-red-400">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* امتحانات التجويد */}
        <TabsContent value="tajweed">
          <Card className={isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'}>
            <CardContent className="p-0">
              {tajweedExams.length === 0 ? (
                <p className={`p-8 text-center ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>لا توجد امتحانات تجويد</p>
              ) : (
                <div className={`divide-y ${isDark ? 'divide-white/5' : 'divide-slate-100'}`}>
                  {tajweedExams.map((exam) => (
                    <div key={exam.id} className={`p-4 flex items-center justify-between ${isDark ? 'hover:bg-white/5' : 'hover:bg-slate-50'}`}>
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center">
                          <FileText className="w-6 h-6 text-blue-400" />
                        </div>
                        <div>
                          <h3 className={`font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{getStudentName(exam.student_id)}</h3>
                          <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>{exam.topic}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`text-lg font-bold ${exam.total_score >= 60 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {exam.total_score}%
                        </span>
                        <Badge className={getResultBadge(exam.result)}>
                          {getResultLabel(exam.result)}
                        </Badge>
                        {isTeacher && (
                          <Button variant="ghost" size="sm" onClick={() => handleDelete(exam.id, 'tajweed')} className="text-red-400">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* امتحانات إلكترونية */}
        <TabsContent value="online">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {onlineExams.length === 0 ? (
              <p className={`col-span-full p-8 text-center ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                لا توجد امتحانات إلكترونية
                {isTeacher && (
                  <Link to="/online-exams" className="block mt-2 text-indigo-400 hover:underline">
                    إنشاء امتحان إلكتروني جديد
                  </Link>
                )}
              </p>
            ) : (
              onlineExams.map((exam) => (
                <Card key={exam.id} className={`${isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'} ${exam.completed ? 'border-emerald-500/30' : ''}`}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className={`text-base ${isDark ? 'text-white' : 'text-slate-900'}`}>{exam.title}</CardTitle>
                      {exam.completed && <CheckCircle className="w-5 h-5 text-emerald-400" />}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className={`text-sm mb-3 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>{exam.description}</p>
                    <div className="flex items-center justify-between text-sm">
                      <span className={isDark ? 'text-slate-500' : 'text-slate-400'}>{exam.questions?.length || 0} سؤال</span>
                      {exam.completed ? (
                        <Badge className={exam.passed ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}>
                          {exam.my_score}%
                        </Badge>
                      ) : (
                        <Link to="/online-exams">
                          <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700">
                            <Play className="w-3 h-3 ml-1" />
                            بدء
                          </Button>
                        </Link>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ExamsManagement;
