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
import { toast } from 'sonner';
import { BookOpen, Plus, Trash2, Calendar, Users, CheckCircle, Clock, Eye } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const HomeworkManagement = () => {
  const { user } = useAuth();
  const { isDark } = useTheme();
  const [homework, setHomework] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [selectedHomework, setSelectedHomework] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    due_date: '',
    group_id: ''
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [hwRes, groupsRes] = await Promise.all([
        axios.get(`${API}/homework`),
        axios.get(`${API}/groups`)
      ]);
      setHomework(hwRes.data);
      setGroups(groupsRes.data);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/homework`, formData);
      toast.success('تم إضافة الواجب بنجاح');
      setDialogOpen(false);
      setFormData({ title: '', description: '', due_date: '', group_id: '' });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في إضافة الواجب');
    }
  };

  const handleDelete = async (hwId) => {
    if (!confirm('هل أنت متأكد من حذف هذا الواجب؟')) return;
    try {
      await axios.delete(`${API}/homework/${hwId}`);
      toast.success('تم حذف الواجب');
      fetchData();
    } catch (error) {
      toast.error('فشل في الحذف');
    }
  };

  const viewSubmissions = async (hw) => {
    setSelectedHomework(hw);
    try {
      const res = await axios.get(`${API}/homework/${hw.id}/submissions`);
      setSubmissions(res.data);
      setViewDialogOpen(true);
    } catch (error) {
      toast.error('فشل في تحميل التسليمات');
    }
  };

  const handleGrade = async (submissionId, grade) => {
    try {
      await axios.put(`${API}/homework/submissions/${submissionId}/grade?grade=${grade}`);
      toast.success('تم التقييم');
      if (selectedHomework) {
        viewSubmissions(selectedHomework);
      }
    } catch (error) {
      toast.error('فشل في التقييم');
    }
  };

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
            <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center">
              <BookOpen className="w-6 h-6 text-blue-400" />
            </div>
            <div>
              <h1 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>الواجبات</h1>
              <p className={isDark ? 'text-slate-400' : 'text-slate-600'}>
                {isStudent ? 'واجباتي الدراسية' : 'إدارة الواجبات للطلاب'}
              </p>
            </div>
          </div>
          {!isStudent && (
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button className="bg-blue-600 hover:bg-blue-700">
                  <Plus className="w-4 h-4 ml-2" />
                  إضافة واجب
                </Button>
              </DialogTrigger>
              <DialogContent className={isDark ? 'bg-slate-900 border-white/10' : 'bg-white'}>
                <DialogHeader>
                  <DialogTitle className={isDark ? 'text-white' : 'text-slate-900'}>إضافة واجب جديد</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>عنوان الواجب</Label>
                    <Input
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      required
                      className={isDark ? 'bg-slate-800 border-white/10 text-white' : ''}
                    />
                  </div>
                  <div>
                    <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>الوصف</Label>
                    <Textarea
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      required
                      className={isDark ? 'bg-slate-800 border-white/10 text-white' : ''}
                    />
                  </div>
                  <div>
                    <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>تاريخ التسليم</Label>
                    <Input
                      type="date"
                      value={formData.due_date}
                      onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                      required
                      className={isDark ? 'bg-slate-800 border-white/10 text-white' : ''}
                    />
                  </div>
                  <div>
                    <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>المجموعة (اختياري)</Label>
                    <select
                      value={formData.group_id}
                      onChange={(e) => setFormData({ ...formData, group_id: e.target.value })}
                      className={`w-full p-2 rounded-md border ${isDark ? 'bg-slate-800 border-white/10 text-white' : 'bg-white border-slate-300'}`}
                    >
                      <option value="">جميع الطلاب</option>
                      {groups.map((g) => (
                        <option key={g.id} value={g.id}>{g.name}</option>
                      ))}
                    </select>
                  </div>
                  <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700">إضافة</Button>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* Homework List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {homework.length === 0 ? (
          <Card className={`col-span-full ${isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'}`}>
            <CardContent className="p-12 text-center">
              <BookOpen className={`w-16 h-16 mx-auto mb-4 ${isDark ? 'text-slate-600' : 'text-slate-400'}`} />
              <p className={isDark ? 'text-slate-400' : 'text-slate-600'}>لا توجد واجبات</p>
            </CardContent>
          </Card>
        ) : (
          homework.map((hw) => (
            <Card key={hw.id} className={isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <h3 className={`font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{hw.title}</h3>
                  {!isStudent && (
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(hw.id)} className="text-red-400">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
                <p className={`text-sm mb-3 line-clamp-2 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>{hw.description}</p>
                <div className="flex items-center gap-4 text-sm mb-3">
                  <span className={`flex items-center gap-1 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                    <Calendar className="w-4 h-4" />
                    {hw.due_date}
                  </span>
                </div>
                {isStudent && hw.submission && (
                  <div className={`p-2 rounded-lg ${hw.submission.status === 'graded' ? 'bg-emerald-500/10' : 'bg-amber-500/10'}`}>
                    {hw.submission.status === 'graded' ? (
                      <span className="text-emerald-400 flex items-center gap-1">
                        <CheckCircle className="w-4 h-4" />
                        تم التقييم - الدرجة: {hw.submission.grade}%
                      </span>
                    ) : (
                      <span className="text-amber-400 flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        قيد الانتظار
                      </span>
                    )}
                  </div>
                )}
                {!isStudent && (
                  <Button variant="outline" size="sm" onClick={() => viewSubmissions(hw)} className="w-full mt-2">
                    <Eye className="w-4 h-4 ml-2" />
                    عرض التسليمات
                  </Button>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* View Submissions Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className={`max-w-2xl ${isDark ? 'bg-slate-900 border-white/10' : 'bg-white'}`}>
          <DialogHeader>
            <DialogTitle className={isDark ? 'text-white' : 'text-slate-900'}>تسليمات: {selectedHomework?.title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {submissions.map((sub) => (
              <div key={sub.id} className={`p-3 rounded-lg ${isDark ? 'bg-slate-800' : 'bg-slate-100'}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className={`font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>{sub.student_name}</p>
                    <p className={`text-sm ${sub.status === 'graded' ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {sub.status === 'graded' ? `تم التقييم: ${sub.grade}%` : 'قيد الانتظار'}
                    </p>
                  </div>
                  {sub.status !== 'graded' && (
                    <div className="flex gap-2">
                      {[100, 80, 60, 40].map((grade) => (
                        <Button
                          key={grade}
                          variant="outline"
                          size="sm"
                          onClick={() => handleGrade(sub.id, grade)}
                          className="text-xs"
                        >
                          {grade}%
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default HomeworkManagement;
