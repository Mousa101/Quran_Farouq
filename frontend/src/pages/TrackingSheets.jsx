import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { FileText, Upload, Loader2, Image, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const TrackingSheets = () => {
  const [sheets, setSheets] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState('');
  const [weekStart, setWeekStart] = useState('');
  const [imagePreview, setImagePreview] = useState(null);
  const [imageBase64, setImageBase64] = useState('');
  const fileInputRef = useRef(null);

  useEffect(() => {
    fetchData();
    // Set default week start to current week's Sunday
    const today = new Date();
    const sunday = new Date(today);
    sunday.setDate(today.getDate() - today.getDay());
    setWeekStart(sunday.toISOString().split('T')[0]);
  }, []);

  const fetchData = async () => {
    try {
      const [sheetsRes, groupsRes] = await Promise.all([
        axios.get(`${API}/tracking-sheets`),
        axios.get(`${API}/groups`)
      ]);
      
      setSheets(sheetsRes.data);
      
      // Get all students from groups
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

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('يرجى اختيار ملف صورة');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      setImagePreview(event.target.result);
      // Extract base64 without the data URL prefix
      const base64 = event.target.result.split(',')[1];
      setImageBase64(base64);
    };
    reader.readAsDataURL(file);
  };

  const handleUpload = async () => {
    if (!selectedStudent || !weekStart || !imageBase64) {
      toast.error('يرجى ملء جميع الحقول');
      return;
    }

    setUploading(true);
    try {
      const response = await axios.post(`${API}/tracking-sheets`, {
        student_id: selectedStudent,
        week_start: weekStart,
        image_base64: imageBase64
      });

      toast.success('تم رفع ورقة المتابعة وتحليلها بنجاح');
      
      // Show analysis results
      const analysis = response.data.analysis;
      toast.info(`النتائج: ${analysis.prayers_count} صلاة، ${analysis.quran_sitting_minutes} دقيقة مع القرآن، ${analysis.family_recitation_count} تسميع للأهل`);
      
      // Reset form
      setSelectedStudent('');
      setImagePreview(null);
      setImageBase64('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل رفع الورقة');
    } finally {
      setUploading(false);
    }
  };

  const getStudentName = (studentId) => {
    const student = students.find(s => s.id === studentId);
    return student?.name || 'غير معروف';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fadeIn" data-testid="tracking-page">
      <div>
        <h1 className="text-2xl font-bold text-white">ورق المتابعة</h1>
        <p className="text-slate-400">رفع وتحليل ورق متابعة الطلاب</p>
      </div>

      {/* Upload Form */}
      <Card className="glass-card border-white/10">
        <CardHeader>
          <CardTitle className="text-xl font-bold text-white flex items-center gap-3">
            <Upload className="w-6 h-6 text-emerald-400" />
            رفع ورقة متابعة جديدة
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-slate-300">الطالب</Label>
                <Select value={selectedStudent} onValueChange={setSelectedStudent}>
                  <SelectTrigger className="bg-slate-800 border-slate-700 text-white" data-testid="student-select">
                    <SelectValue placeholder="اختر الطالب" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    {students.map((student) => (
                      <SelectItem key={student.id} value={student.id} className="text-white">
                        {student.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-slate-300">بداية الأسبوع</Label>
                <Input
                  type="date"
                  value={weekStart}
                  onChange={(e) => setWeekStart(e.target.value)}
                  className="bg-slate-800 border-slate-700 text-white"
                  data-testid="week-start-input"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-slate-300">صورة ورقة المتابعة</Label>
                <Input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="bg-slate-800 border-slate-700 text-white file:bg-emerald-500 file:text-white file:border-0 file:rounded file:px-4 file:py-2 file:ml-4 cursor-pointer"
                  data-testid="image-upload-input"
                />
              </div>

              <Button
                onClick={handleUpload}
                className="w-full bg-emerald-500 hover:bg-emerald-600 h-12"
                disabled={uploading || !selectedStudent || !imageBase64}
                data-testid="upload-btn"
              >
                {uploading ? (
                  <>
                    <Loader2 className="w-5 h-5 ml-2 animate-spin" />
                    جاري التحليل...
                  </>
                ) : (
                  <>
                    <Upload className="w-5 h-5 ml-2" />
                    رفع وتحليل
                  </>
                )}
              </Button>
            </div>

            {/* Image Preview */}
            <div className="flex items-center justify-center">
              {imagePreview ? (
                <div className="relative w-full max-w-sm">
                  <img
                    src={imagePreview}
                    alt="Preview"
                    className="w-full rounded-xl border border-white/10"
                  />
                  <div className="absolute top-2 right-2 bg-emerald-500 text-white px-2 py-1 rounded-lg text-sm flex items-center gap-1">
                    <CheckCircle className="w-4 h-4" />
                    جاهز للرفع
                  </div>
                </div>
              ) : (
                <div className="w-full max-w-sm h-64 border-2 border-dashed border-slate-700 rounded-xl flex flex-col items-center justify-center text-slate-500">
                  <Image className="w-16 h-16 mb-4" />
                  <p>معاينة الصورة</p>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Previous Sheets */}
      <Card className="glass-card border-white/10">
        <CardHeader>
          <CardTitle className="text-xl font-bold text-white">الورق المرفوعة</CardTitle>
        </CardHeader>
        <CardContent>
          {sheets.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <FileText className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <p>لم يتم رفع أي ورق متابعة بعد</p>
            </div>
          ) : (
            <div className="space-y-4">
              {sheets.map((sheet) => (
                <div
                  key={sheet.id}
                  className="p-4 rounded-xl bg-slate-800/50 border border-white/5"
                >
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-bold text-white">{getStudentName(sheet.student_id)}</h3>
                      <p className="text-slate-400 text-sm">أسبوع {sheet.week_start}</p>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-3 gap-4">
                    <div className="p-3 rounded-lg bg-emerald-500/10 text-center">
                      <p className="text-slate-400 text-sm">الصلوات</p>
                      <p className="text-2xl font-bold text-emerald-400">{sheet.data.prayers_count}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-blue-500/10 text-center">
                      <p className="text-slate-400 text-sm">دقائق القرآن</p>
                      <p className="text-2xl font-bold text-blue-400">{sheet.data.quran_sitting_minutes}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-purple-500/10 text-center">
                      <p className="text-slate-400 text-sm">تسميع الأهل</p>
                      <p className="text-2xl font-bold text-purple-400">{sheet.data.family_recitation_count}</p>
                    </div>
                  </div>
                  
                  {sheet.data.notes && (
                    <p className="text-slate-400 text-sm mt-4">{sheet.data.notes}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default TrackingSheets;
