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
import { BookOpen, Plus, Edit, Trash2, Upload, FileText, Download, Eye, Calendar, Target, BookMarked } from 'lucide-react';
import { formatDate as fmtDate } from '../lib/utils';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const CurriculumManagement = () => {
  const { user } = useAuth();
  const { isDark } = useTheme();
  const [curricula, setCurricula] = useState([]);
  const [selectedCurriculum, setSelectedCurriculum] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [entryDialogOpen, setEntryDialogOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [activeTab, setActiveTab] = useState('list');
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    type: 'manual'
  });
  const [entryData, setEntryData] = useState({
    title: '',
    date: '',
    topic: '',
    goal: '',
    references: '',
    results: ''
  });

  useEffect(() => {
    fetchCurricula();
  }, []);

  const fetchCurricula = async () => {
    try {
      const res = await axios.get(`${API}/curriculum`);
      setCurricula(res.data);
    } catch (error) {
      console.error('Error fetching curricula:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCurriculumDetails = async (id) => {
    try {
      const res = await axios.get(`${API}/curriculum/${id}`);
      setSelectedCurriculum(res.data);
      setActiveTab('details');
    } catch (error) {
      toast.error('فشل في تحميل تفاصيل المنهج');
    }
  };

  const handleCreateCurriculum = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/curriculum`, formData);
      toast.success('تم إنشاء المنهج بنجاح');
      setDialogOpen(false);
      setFormData({ name: '', description: '', type: 'manual' });
      fetchCurricula();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في إنشاء المنهج');
    }
  };

  const handleDeleteCurriculum = async (id) => {
    if (!confirm('هل أنت متأكد من حذف هذا المنهج؟')) return;
    try {
      await axios.delete(`${API}/curriculum/${id}`);
      toast.success('تم حذف المنهج بنجاح');
      fetchCurricula();
      if (selectedCurriculum?.id === id) {
        setSelectedCurriculum(null);
        setActiveTab('list');
      }
    } catch (error) {
      toast.error('فشل في حذف المنهج');
    }
  };

  const handleAddEntry = async (e) => {
    e.preventDefault();
    try {
      if (editingEntry) {
        await axios.put(`${API}/curriculum/entries/${editingEntry.id}`, entryData);
        toast.success('تم تحديث الخطة بنجاح');
      } else {
        await axios.post(`${API}/curriculum/${selectedCurriculum.id}/entries`, entryData);
        toast.success('تمت إضافة الخطة بنجاح');
      }
      setEntryDialogOpen(false);
      setEntryData({ title: '', date: '', topic: '', goal: '', references: '', results: '' });
      setEditingEntry(null);
      fetchCurriculumDetails(selectedCurriculum.id);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في حفظ الخطة');
    }
  };

  const handleDeleteEntry = async (entryId) => {
    if (!confirm('هل أنت متأكد من حذف هذه الخطة؟')) return;
    try {
      await axios.delete(`${API}/curriculum/entries/${entryId}`);
      toast.success('تم حذف الخطة بنجاح');
      fetchCurriculumDetails(selectedCurriculum.id);
    } catch (error) {
      toast.error('فشل في حذف الخطة');
    }
  };

  const handlePdfUpload = async (curriculumId, file) => {
    const formData = new FormData();
    formData.append('file', file);
    try {
      await axios.post(`${API}/curriculum/${curriculumId}/upload-pdf`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      toast.success('تم رفع الملف بنجاح');
      fetchCurricula();
      if (selectedCurriculum?.id === curriculumId) {
        fetchCurriculumDetails(curriculumId);
      }
    } catch (error) {
      toast.error('فشل في رفع الملف');
    }
  };

  const openEditEntry = (entry) => {
    setEditingEntry(entry);
    setEntryData({
      title: entry.title,
      date: entry.date,
      topic: entry.topic,
      goal: entry.goal,
      references: entry.references || '',
      results: entry.results || ''
    });
    setEntryDialogOpen(true);
  };

  const isAdmin = user?.role === 'admin';

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
            <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center">
              <BookOpen className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <h1 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>إدارة المنهج</h1>
              <p className={isDark ? 'text-slate-400' : 'text-slate-600'}>إنشاء وإدارة خطط المنهج الدراسي</p>
            </div>
          </div>
          {isAdmin && (
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button className="bg-emerald-600 hover:bg-emerald-700">
                  <Plus className="w-4 h-4 ml-2" />
                  إنشاء منهج جديد
                </Button>
              </DialogTrigger>
              <DialogContent className={isDark ? 'bg-slate-900 border-white/10' : 'bg-white'}>
                <DialogHeader>
                  <DialogTitle className={isDark ? 'text-white' : 'text-slate-900'}>إنشاء منهج جديد</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleCreateCurriculum} className="space-y-4">
                  <div>
                    <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>اسم المنهج</Label>
                    <Input
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                      className={isDark ? 'bg-slate-800 border-white/10 text-white' : ''}
                    />
                  </div>
                  <div>
                    <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>الوصف</Label>
                    <Textarea
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      className={isDark ? 'bg-slate-800 border-white/10 text-white' : ''}
                    />
                  </div>
                  <div>
                    <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>نوع المنهج</Label>
                    <select
                      value={formData.type}
                      onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                      className={`w-full p-2 rounded-md border ${isDark ? 'bg-slate-800 border-white/10 text-white' : 'bg-white border-slate-300'}`}
                    >
                      <option value="manual">إدخال يدوي</option>
                      <option value="pdf">رفع ملف PDF</option>
                    </select>
                  </div>
                  <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700">إنشاء</Button>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className={`grid w-full grid-cols-2 ${isDark ? 'bg-slate-800' : 'bg-slate-100'}`}>
          <TabsTrigger value="list">قائمة المناهج</TabsTrigger>
          <TabsTrigger value="details" disabled={!selectedCurriculum}>تفاصيل المنهج</TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="mt-4">
          {curricula.length === 0 ? (
            <Card className={isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'}>
              <CardContent className="p-12 text-center">
                <BookOpen className={`w-16 h-16 mx-auto mb-4 ${isDark ? 'text-slate-600' : 'text-slate-400'}`} />
                <p className={isDark ? 'text-slate-400' : 'text-slate-600'}>لا توجد مناهج بعد</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {curricula.map((curr) => (
                <Card key={curr.id} className={`${isDark ? 'glass-card border-white/10 hover:border-emerald-500/30' : 'bg-white border-slate-200 hover:border-emerald-500'} transition-all cursor-pointer`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        {curr.type === 'pdf' ? (
                          <FileText className="w-5 h-5 text-red-400" />
                        ) : (
                          <BookMarked className="w-5 h-5 text-emerald-400" />
                        )}
                        <h3 className={`font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{curr.name}</h3>
                      </div>
                      {isAdmin && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); handleDeleteCurriculum(curr.id); }}
                          className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                    <p className={`text-sm mb-3 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                      {curr.description || 'لا يوجد وصف'}
                    </p>
                    <div className="flex items-center justify-between">
                      <span className={`text-xs px-2 py-1 rounded-full ${curr.type === 'pdf' ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                        {curr.type === 'pdf' ? 'ملف PDF' : `${curr.entries_count || 0} خطة`}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => fetchCurriculumDetails(curr.id)}
                        className="text-emerald-400 hover:text-emerald-300"
                      >
                        <Eye className="w-4 h-4 ml-1" />
                        عرض
                      </Button>
                    </div>
                    {isAdmin && curr.type === 'manual' && (
                      <div className="mt-3 pt-3 border-t border-white/10">
                        <label className="cursor-pointer">
                          <input
                            type="file"
                            accept=".pdf"
                            className="hidden"
                            onChange={(e) => e.target.files?.[0] && handlePdfUpload(curr.id, e.target.files[0])}
                          />
                          <span className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300">
                            <Upload className="w-4 h-4" />
                            رفع ملف PDF
                          </span>
                        </label>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="details" className="mt-4">
          {selectedCurriculum && (
            <Card className={isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'}>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className={isDark ? 'text-white' : 'text-slate-900'}>{selectedCurriculum.name}</CardTitle>
                  <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>{selectedCurriculum.description}</p>
                </div>
                {isAdmin && selectedCurriculum.type !== 'pdf' && (
                  <Dialog open={entryDialogOpen} onOpenChange={(open) => { setEntryDialogOpen(open); if (!open) setEditingEntry(null); }}>
                    <DialogTrigger asChild>
                      <Button className="bg-emerald-600 hover:bg-emerald-700">
                        <Plus className="w-4 h-4 ml-2" />
                        إضافة خطة
                      </Button>
                    </DialogTrigger>
                    <DialogContent className={`max-w-2xl ${isDark ? 'bg-slate-900 border-white/10' : 'bg-white'}`}>
                      <DialogHeader>
                        <DialogTitle className={isDark ? 'text-white' : 'text-slate-900'}>
                          {editingEntry ? 'تعديل الخطة' : 'إضافة خطة جديدة'}
                        </DialogTitle>
                      </DialogHeader>
                      <form onSubmit={handleAddEntry} className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>العنوان</Label>
                            <Input
                              value={entryData.title}
                              onChange={(e) => setEntryData({ ...entryData, title: e.target.value })}
                              required
                              className={isDark ? 'bg-slate-800 border-white/10 text-white' : ''}
                            />
                          </div>
                          <div>
                            <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>التاريخ</Label>
                            <Input
                              type="date"
                              value={entryData.date}
                              onChange={(e) => setEntryData({ ...entryData, date: e.target.value })}
                              required
                              className={isDark ? 'bg-slate-800 border-white/10 text-white' : ''}
                            />
                          </div>
                        </div>
                        <div>
                          <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>الموضوع</Label>
                          <Textarea
                            value={entryData.topic}
                            onChange={(e) => setEntryData({ ...entryData, topic: e.target.value })}
                            required
                            className={isDark ? 'bg-slate-800 border-white/10 text-white' : ''}
                          />
                        </div>
                        <div>
                          <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>الهدف</Label>
                          <Textarea
                            value={entryData.goal}
                            onChange={(e) => setEntryData({ ...entryData, goal: e.target.value })}
                            required
                            className={isDark ? 'bg-slate-800 border-white/10 text-white' : ''}
                          />
                        </div>
                        <div>
                          <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>المراجع</Label>
                          <Input
                            value={entryData.references}
                            onChange={(e) => setEntryData({ ...entryData, references: e.target.value })}
                            className={isDark ? 'bg-slate-800 border-white/10 text-white' : ''}
                          />
                        </div>
                        <div>
                          <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>النتائج</Label>
                          <Textarea
                            value={entryData.results}
                            onChange={(e) => setEntryData({ ...entryData, results: e.target.value })}
                            className={isDark ? 'bg-slate-800 border-white/10 text-white' : ''}
                          />
                        </div>
                        <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700">
                          {editingEntry ? 'تحديث' : 'إضافة'}
                        </Button>
                      </form>
                    </DialogContent>
                  </Dialog>
                )}
              </CardHeader>
              <CardContent>
                {selectedCurriculum.type === 'pdf' && selectedCurriculum.pdf_url ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-4">
                      <FileText className="w-8 h-8 text-red-400" />
                      <div>
                        <p className={isDark ? 'text-white' : 'text-slate-900'}>{selectedCurriculum.pdf_filename}</p>
                        <a
                          href={selectedCurriculum.pdf_url}
                          download={selectedCurriculum.pdf_filename}
                          className="text-sm text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
                        >
                          <Download className="w-4 h-4" />
                          تحميل الملف
                        </a>
                      </div>
                    </div>
                    <iframe
                      src={selectedCurriculum.pdf_url}
                      className="w-full h-[600px] rounded-lg border border-white/10"
                      title="PDF Viewer"
                    />
                  </div>
                ) : (
                  <div className="space-y-4">
                    {selectedCurriculum.entries?.length === 0 ? (
                      <p className={`text-center py-8 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>لا توجد خطط بعد</p>
                    ) : (
                      selectedCurriculum.entries?.map((entry, index) => (
                        <div
                          key={entry.id}
                          className={`p-4 rounded-xl ${isDark ? 'bg-slate-800/50 border border-white/5' : 'bg-slate-50 border border-slate-200'}`}
                        >
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-3">
                              <span className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 font-bold">
                                {index + 1}
                              </span>
                              <div>
                                <h4 className={`font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{entry.title}</h4>
                                <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                                  <Calendar className="w-3 h-3 inline ml-1" />
                                  {fmtDate(entry.date)}
                                </p>
                              </div>
                            </div>
                            {isAdmin && (
                              <div className="flex gap-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => openEditEntry(entry)}
                                  className="text-blue-400 hover:text-blue-300"
                                >
                                  <Edit className="w-4 h-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDeleteEntry(entry.id)}
                                  className="text-red-400 hover:text-red-300"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            )}
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                            <div>
                              <p className={`text-xs font-bold mb-1 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>الموضوع</p>
                              <p className={`text-sm ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{entry.topic}</p>
                            </div>
                            <div>
                              <p className={`text-xs font-bold mb-1 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>الهدف</p>
                              <p className={`text-sm ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{entry.goal}</p>
                            </div>
                            {entry.references && (
                              <div>
                                <p className={`text-xs font-bold mb-1 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>المراجع</p>
                                <p className={`text-sm ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{entry.references}</p>
                              </div>
                            )}
                            {entry.results && (
                              <div>
                                <p className={`text-xs font-bold mb-1 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>النتائج</p>
                                <p className={`text-sm ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{entry.results}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default CurriculumManagement;
