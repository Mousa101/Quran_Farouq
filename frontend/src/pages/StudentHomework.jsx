import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Textarea } from '../components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Badge } from '../components/ui/badge';
import { 
  BookText, Clock, CheckCircle, AlertCircle, Upload, Image, FileText, 
  Loader2, Send, Eye, X
} from 'lucide-react';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const StudentHomework = () => {
  const { user } = useAuth();
  const { isDark } = useTheme();
  const [homework, setHomework] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [selectedHomework, setSelectedHomework] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitData, setSubmitData] = useState({
    notes: '',
    file_base64: null,
    file_name: '',
    file_type: ''
  });
  const fileInputRef = useRef(null);

  useEffect(() => {
    fetchHomework();
  }, []);

  const fetchHomework = async () => {
    try {
      const res = await axios.get(`${API}/homework`);
      setHomework(res.data);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const openSubmitDialog = (hw) => {
    setSelectedHomework(hw);
    setSubmitData({
      notes: hw.submission?.submission_notes || '',
      file_base64: hw.submission?.file_base64 || null,
      file_name: hw.submission?.file_name || '',
      file_type: hw.submission?.file_type || ''
    });
    setSubmitDialogOpen(true);
  };

  const openViewDialog = (hw) => {
    setSelectedHomework(hw);
    setViewDialogOpen(true);
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // التحقق من حجم الملف (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      toast.error('حجم الملف يجب أن يكون أقل من 10 ميجابايت');
      return;
    }

    // التحقق من نوع الملف
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('يرجى رفع صورة (PNG, JPG, GIF) أو PDF فقط');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result;
      setSubmitData({
        ...submitData,
        file_base64: base64,
        file_name: file.name,
        file_type: file.type.startsWith('image/') ? 'image' : 'pdf'
      });
    };
    reader.readAsDataURL(file);
  };

  const removeFile = () => {
    setSubmitData({
      ...submitData,
      file_base64: null,
      file_name: '',
      file_type: ''
    });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async () => {
    if (!submitData.notes && !submitData.file_base64) {
      toast.error('يرجى إضافة ملاحظات أو رفع ملف');
      return;
    }

    setSubmitting(true);
    try {
      await axios.post(`${API}/homework/${selectedHomework.id}/submit`, {
        notes: submitData.notes,
        file_base64: submitData.file_base64,
        file_name: submitData.file_name,
        file_type: submitData.file_type
      });
      toast.success('تم تسليم الواجب بنجاح');
      setSubmitDialogOpen(false);
      fetchHomework();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في تسليم الواجب');
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadge = (submission) => {
    if (!submission) return null;
    
    switch (submission.status) {
      case 'submitted':
        return <Badge className="bg-blue-500/20 text-blue-400">تم التسليم</Badge>;
      case 'graded':
        return <Badge className="bg-emerald-500/20 text-emerald-400">تم التقييم</Badge>;
      default:
        return <Badge className="bg-amber-500/20 text-amber-400">قيد الانتظار</Badge>;
    }
  };

  const isOverdue = (dueDate) => {
    return new Date(dueDate) < new Date();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
      </div>
    );
  }

  return (
    <div className={`min-h-screen p-4 md:p-6 ${isDark ? 'bg-slate-950' : 'bg-slate-50'}`}>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className={`p-3 rounded-xl ${isDark ? 'bg-purple-500/20' : 'bg-purple-100'}`}>
            <BookText className="w-6 h-6 text-purple-500" />
          </div>
          <div>
            <h1 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>واجباتي</h1>
            <p className={isDark ? 'text-slate-400' : 'text-slate-600'}>قم بتسليم واجباتك ومتابعة تقييماتك</p>
          </div>
        </div>

        {/* Homework List */}
        {homework.length === 0 ? (
          <Card className={isDark ? 'glass-card border-white/10' : 'bg-white'}>
            <CardContent className="py-12 text-center">
              <BookText className={`w-12 h-12 mx-auto mb-4 ${isDark ? 'text-slate-600' : 'text-slate-300'}`} />
              <p className={isDark ? 'text-slate-400' : 'text-slate-600'}>لا توجد واجبات حالياً</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {homework.map((hw) => (
              <Card 
                key={hw.id}
                className={`${isDark ? 'glass-card border-white/10' : 'bg-white'} ${
                  hw.submission?.status === 'graded' ? 'border-l-4 border-l-emerald-500' :
                  hw.submission?.status === 'submitted' ? 'border-l-4 border-l-blue-500' :
                  isOverdue(hw.due_date) ? 'border-l-4 border-l-red-500' :
                  'border-l-4 border-l-amber-500'
                }`}
              >
                <CardContent className="p-4">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className={`font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{hw.title}</h3>
                        {getStatusBadge(hw.submission)}
                      </div>
                      <p className={`text-sm mb-2 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                        {hw.description}
                      </p>
                      <div className="flex items-center gap-4 text-sm">
                        <span className={`flex items-center gap-1 ${
                          isOverdue(hw.due_date) && hw.submission?.status !== 'submitted' && hw.submission?.status !== 'graded'
                            ? 'text-red-400'
                            : isDark ? 'text-slate-500' : 'text-slate-400'
                        }`}>
                          <Clock className="w-4 h-4" />
                          تسليم: {new Date(hw.due_date).toLocaleDateString('ar-SA')}
                        </span>
                        {hw.submission?.status === 'graded' && (
                          <span className="text-emerald-400 font-bold">
                            الدرجة: {hw.submission.grade}/100
                          </span>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex gap-2">
                      {hw.submission?.status === 'graded' || hw.submission?.status === 'submitted' ? (
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => openViewDialog(hw)}
                          className={isDark ? 'border-white/20' : ''}
                        >
                          <Eye className="w-4 h-4 ml-2" />
                          عرض التسليم
                        </Button>
                      ) : (
                        <Button 
                          size="sm"
                          onClick={() => openSubmitDialog(hw)}
                          className="bg-emerald-600 hover:bg-emerald-700"
                        >
                          <Send className="w-4 h-4 ml-2" />
                          تسليم الواجب
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Submit Dialog */}
      <Dialog open={submitDialogOpen} onOpenChange={setSubmitDialogOpen}>
        <DialogContent className={`max-w-lg ${isDark ? 'bg-slate-900 border-white/10' : 'bg-white'}`}>
          <DialogHeader>
            <DialogTitle className={isDark ? 'text-white' : ''}>تسليم الواجب</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className={`p-3 rounded-lg ${isDark ? 'bg-slate-800' : 'bg-slate-100'}`}>
              <p className={`font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>
                {selectedHomework?.title}
              </p>
              <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                {selectedHomework?.description}
              </p>
            </div>

            {/* File Upload */}
            <div>
              <label className={`block mb-2 font-medium ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                رفع ملف (صورة أو PDF)
              </label>
              
              {submitData.file_base64 ? (
                <div className={`p-4 rounded-lg border-2 border-dashed ${isDark ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-emerald-500 bg-emerald-50'}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {submitData.file_type === 'image' ? (
                        <Image className="w-8 h-8 text-emerald-500" />
                      ) : (
                        <FileText className="w-8 h-8 text-emerald-500" />
                      )}
                      <div>
                        <p className={`font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>
                          {submitData.file_name}
                        </p>
                        <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                          {submitData.file_type === 'image' ? 'صورة' : 'PDF'}
                        </p>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" onClick={removeFile}>
                      <X className="w-4 h-4 text-red-400" />
                    </Button>
                  </div>
                  
                  {submitData.file_type === 'image' && (
                    <img 
                      src={submitData.file_base64} 
                      alt="Preview" 
                      className="mt-3 max-h-48 rounded-lg mx-auto"
                    />
                  )}
                </div>
              ) : (
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className={`p-8 rounded-lg border-2 border-dashed cursor-pointer transition-all ${
                    isDark 
                      ? 'border-slate-700 hover:border-emerald-500/50 bg-slate-800/50' 
                      : 'border-slate-300 hover:border-emerald-500 bg-slate-50'
                  }`}
                >
                  <div className="text-center">
                    <Upload className={`w-10 h-10 mx-auto mb-3 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
                    <p className={`font-medium ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                      اضغط لرفع ملف
                    </p>
                    <p className={`text-sm ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                      صورة (PNG, JPG) أو PDF - حد أقصى 10MB
                    </p>
                  </div>
                </div>
              )}
              
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.pdf"
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>

            {/* Notes */}
            <div>
              <label className={`block mb-2 font-medium ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                ملاحظات (اختياري)
              </label>
              <Textarea
                value={submitData.notes}
                onChange={(e) => setSubmitData({ ...submitData, notes: e.target.value })}
                placeholder="أضف أي ملاحظات..."
                className={isDark ? 'bg-slate-800 border-white/10 text-white' : ''}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSubmitDialogOpen(false)}>
              إلغاء
            </Button>
            <Button 
              onClick={handleSubmit}
              disabled={submitting || (!submitData.notes && !submitData.file_base64)}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin ml-2" />
              ) : (
                <Send className="w-4 h-4 ml-2" />
              )}
              تسليم
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className={`max-w-lg ${isDark ? 'bg-slate-900 border-white/10' : 'bg-white'}`}>
          <DialogHeader>
            <DialogTitle className={isDark ? 'text-white' : ''}>تفاصيل التسليم</DialogTitle>
          </DialogHeader>
          
          {selectedHomework?.submission && (
            <div className="space-y-4">
              <div className={`p-3 rounded-lg ${isDark ? 'bg-slate-800' : 'bg-slate-100'}`}>
                <p className={`font-medium mb-1 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  {selectedHomework.title}
                </p>
                <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                  تاريخ التسليم: {selectedHomework.submission.submitted_at ? 
                    new Date(selectedHomework.submission.submitted_at).toLocaleString('ar-SA') : 
                    'غير محدد'}
                </p>
              </div>

              {/* Submitted File */}
              {selectedHomework.submission.file_base64 && (
                <div className={`p-4 rounded-lg ${isDark ? 'bg-slate-800/50' : 'bg-slate-50'}`}>
                  <p className={`font-medium mb-2 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                    الملف المرفق
                  </p>
                  {selectedHomework.submission.file_type === 'image' ? (
                    <img 
                      src={selectedHomework.submission.file_base64} 
                      alt="Submission" 
                      className="max-h-64 rounded-lg mx-auto"
                    />
                  ) : (
                    <div className="flex items-center gap-3">
                      <FileText className="w-8 h-8 text-blue-400" />
                      <span className={isDark ? 'text-white' : 'text-slate-900'}>
                        {selectedHomework.submission.file_name}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Notes */}
              {selectedHomework.submission.submission_notes && (
                <div className={`p-4 rounded-lg ${isDark ? 'bg-slate-800/50' : 'bg-slate-50'}`}>
                  <p className={`font-medium mb-2 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                    ملاحظاتك
                  </p>
                  <p className={isDark ? 'text-slate-400' : 'text-slate-600'}>
                    {selectedHomework.submission.submission_notes}
                  </p>
                </div>
              )}

              {/* Grade */}
              {selectedHomework.submission.status === 'graded' && (
                <div className={`p-4 rounded-xl text-center ${isDark ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-emerald-50 border border-emerald-200'}`}>
                  <p className={isDark ? 'text-slate-300' : 'text-slate-600'}>الدرجة</p>
                  <p className="text-3xl font-bold text-emerald-400">{selectedHomework.submission.grade}/100</p>
                  {selectedHomework.submission.feedback && (
                    <p className={`mt-2 text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                      ملاحظات المعلم: {selectedHomework.submission.feedback}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default StudentHomework;
