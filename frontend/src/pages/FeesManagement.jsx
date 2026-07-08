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
import { DollarSign, Plus, Trash2, Clock, CheckCircle, AlertCircle, Calendar, Search, FileDown } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const ARABIC_MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
];

const FEE_TYPES = [
  { value: 'subscription', label: 'رسوم اشتراك', color: 'emerald' },
  { value: 'umrah', label: 'عمرة', color: 'purple' },
  { value: 'activity', label: 'نشاط', color: 'blue' }
];

// حالات الدفع
const PAYMENT_STATUS = {
  pending: { label: 'قائم', color: 'bg-slate-500/20 text-slate-400', icon: Clock },  // لم يأتي وقت دفعه
  due: { label: 'مستحق', color: 'bg-amber-500/20 text-amber-400', icon: AlertCircle },  // مستحق الدفع
  paid: { label: 'مدفوع', color: 'bg-emerald-500/20 text-emerald-400', icon: CheckCircle }  // تم الدفع
};

const FeesManagement = () => {
  const { user } = useAuth();
  const { isDark } = useTheme();
  const [fees, setFees] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStudent, setSelectedStudent] = useState('all');
  const [formData, setFormData] = useState({
    student_id: '',
    fee_type: 'subscription',
    amount: '',
    description: '',
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear()
  });

  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [feesRes, studentsRes] = await Promise.all([
        axios.get(`${API}/fees`),
        axios.get(`${API}/users?role=student`)
      ]);
      setFees(feesRes.data);
      setStudents(studentsRes.data);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      // حساب تاريخ الاستحقاق (آخر يوم في الشهر)
      const dueDate = new Date(formData.year, formData.month, 0);
      
      await axios.post(`${API}/fees`, {
        student_id: formData.student_id,
        fee_type: formData.fee_type,
        amount: parseFloat(formData.amount),
        description: formData.description || `رسوم ${ARABIC_MONTHS[formData.month - 1]} ${formData.year}`,
        due_date: dueDate.toISOString().split('T')[0],
        month: formData.month,
        year: formData.year
      });
      toast.success('تم إضافة الرسوم بنجاح');
      setDialogOpen(false);
      setFormData({ 
        student_id: '', 
        fee_type: 'subscription', 
        amount: '', 
        description: '', 
        month: new Date().getMonth() + 1,
        year: new Date().getFullYear()
      });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في إضافة الرسوم');
    }
  };

  const handleDelete = async (feeId) => {
    if (!confirm('هل أنت متأكد من حذف هذه الرسوم؟')) return;
    try {
      await axios.delete(`${API}/fees/${feeId}`);
      toast.success('تم حذف الرسوم');
      fetchData();
    } catch (error) {
      toast.error('فشل في الحذف');
    }
  };

  // تحديد حالة الدفع (تعتمد على الحالة المحسوبة من الخادم مع احتياطي محلي)
  const getPaymentStatus = (fee) => {
    if (fee.status && ['pending', 'due', 'paid'].includes(fee.status)) return fee.status;
    if (fee.is_paid) return 'paid';
    const today = new Date();
    const dueDate = new Date(fee.due_date);
    if (dueDate < today) return 'due';  // مستحق (تاريخ الاستحقاق مر)
    return 'pending';  // قائم (لم يأتي وقت دفعه)
  };

  // تغيير حالة الرسوم يدوياً (المدير)
  const handleChangeStatus = async (feeId, status) => {
    try {
      await axios.put(`${API}/fees/${feeId}/status`, { status });
      const labels = { pending: 'قائم', due: 'مستحق', paid: 'مدفوع' };
      toast.success(`تم تحديث الحالة إلى: ${labels[status]}`);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في تحديث الحالة');
    }
  };

  // تحميل التقرير المالي Excel
  const handleExportExcel = async () => {
    try {
      const res = await axios.get(`${API}/export/fees?year=${selectedYear}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `التقرير_المالي_${selectedYear}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success('تم تحميل التقرير المالي');
    } catch (error) {
      toast.error('فشل في تحميل التقرير');
    }
  };

  const getStudentName = (studentId) => {
    const student = students.find(s => s.id === studentId);
    return student?.name || 'غير معروف';
  };

  // تصفية الرسوم
  const filteredFees = fees
    .filter(f => selectedStudent === 'all' || f.student_id === selectedStudent)
    .filter(f => {
      const feeYear = f.year || new Date(f.created_at).getFullYear();
      return feeYear === selectedYear;
    })
    .filter(f => {
      if (!searchTerm) return true;
      const studentName = getStudentName(f.student_id).toLowerCase();
      return studentName.includes(searchTerm.toLowerCase());
    });

  // تجميع الرسوم حسب الشهر
  const feesByMonth = {};
  filteredFees.forEach(fee => {
    const month = fee.month || new Date(fee.due_date || fee.created_at).getMonth() + 1;
    if (!feesByMonth[month]) {
      feesByMonth[month] = [];
    }
    feesByMonth[month].push(fee);
  });

  // حساب الإحصائيات
  const stats = {
    total: filteredFees.reduce((sum, f) => sum + (f.amount || 0), 0),
    paid: filteredFees.filter(f => f.is_paid).reduce((sum, f) => sum + (f.amount || 0), 0),
    due: filteredFees.filter(f => getPaymentStatus(f) === 'due').reduce((sum, f) => sum + (f.amount || 0), 0),
    pending: filteredFees.filter(f => getPaymentStatus(f) === 'pending').reduce((sum, f) => sum + (f.amount || 0), 0)
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
            <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center">
              <DollarSign className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <h1 className={`text-xl md:text-2xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                {isAdmin ? 'إدارة الرسوم المالية' : 'المستحقات المالية'}
              </h1>
              <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                السنة: {selectedYear}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {/* اختيار السنة */}
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value))}
              className={`p-2 rounded-lg border ${isDark ? 'bg-slate-800 border-white/10 text-white' : 'bg-white border-slate-300'}`}
            >
              {[2023, 2024, 2025, 2026].map(year => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
            
            {isAdmin && (
              <Button onClick={handleExportExcel} variant="outline" className={isDark ? 'border-white/10 text-white hover:bg-white/5' : ''}>
                <FileDown className="w-4 h-4 ml-2" />
                تقرير Excel
              </Button>
            )}

            {isAdmin && (
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-emerald-600 hover:bg-emerald-700">
                    <Plus className="w-4 h-4 ml-2" />
                    إضافة رسوم
                  </Button>
                </DialogTrigger>
                <DialogContent className={isDark ? 'bg-slate-900 border-white/10' : 'bg-white'}>
                  <DialogHeader>
                    <DialogTitle className={isDark ? 'text-white' : 'text-slate-900'}>إضافة رسوم جديدة</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                      <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>الطالب</Label>
                      <select
                        value={formData.student_id}
                        onChange={(e) => setFormData({ ...formData, student_id: e.target.value })}
                        required
                        className={`w-full p-2 rounded-md border ${isDark ? 'bg-slate-800 border-white/10 text-white' : 'bg-white border-slate-300'}`}
                      >
                        <option value="">اختر الطالب</option>
                        {students.map((s) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>الشهر</Label>
                        <select
                          value={formData.month}
                          onChange={(e) => setFormData({ ...formData, month: parseInt(e.target.value) })}
                          className={`w-full p-2 rounded-md border ${isDark ? 'bg-slate-800 border-white/10 text-white' : 'bg-white border-slate-300'}`}
                        >
                          {ARABIC_MONTHS.map((month, idx) => (
                            <option key={idx} value={idx + 1}>{month}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>السنة</Label>
                        <select
                          value={formData.year}
                          onChange={(e) => setFormData({ ...formData, year: parseInt(e.target.value) })}
                          className={`w-full p-2 rounded-md border ${isDark ? 'bg-slate-800 border-white/10 text-white' : 'bg-white border-slate-300'}`}
                        >
                          {[2024, 2025, 2026].map(year => (
                            <option key={year} value={year}>{year}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>نوع الرسوم</Label>
                        <select
                          value={formData.fee_type}
                          onChange={(e) => setFormData({ ...formData, fee_type: e.target.value })}
                          className={`w-full p-2 rounded-md border ${isDark ? 'bg-slate-800 border-white/10 text-white' : 'bg-white border-slate-300'}`}
                        >
                          {FEE_TYPES.map((type) => (
                            <option key={type.value} value={type.value}>{type.label}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>المبلغ</Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={formData.amount}
                          onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                          required
                          placeholder="0.00"
                          className={isDark ? 'bg-slate-800 border-white/10 text-white' : ''}
                        />
                      </div>
                    </div>
                    
                    <div>
                      <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>الوصف (اختياري)</Label>
                      <Textarea
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        placeholder={`رسوم ${ARABIC_MONTHS[formData.month - 1]} ${formData.year}`}
                        className={isDark ? 'bg-slate-800 border-white/10 text-white' : ''}
                      />
                    </div>
                    
                    <DialogFooter>
                      <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700">
                        إضافة الرسوم
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>
      </div>

      {/* الإحصائيات */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className={isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'}>
          <CardContent className="p-4 text-center">
            <DollarSign className="w-8 h-8 mx-auto text-blue-400 mb-2" />
            <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>الإجمالي</p>
            <p className="text-xl font-bold text-blue-400">{stats.total.toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card className={isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'}>
          <CardContent className="p-4 text-center">
            <CheckCircle className="w-8 h-8 mx-auto text-emerald-400 mb-2" />
            <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>مدفوع</p>
            <p className="text-xl font-bold text-emerald-400">{stats.paid.toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card className={isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'}>
          <CardContent className="p-4 text-center">
            <AlertCircle className="w-8 h-8 mx-auto text-amber-400 mb-2" />
            <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>مستحق</p>
            <p className="text-xl font-bold text-amber-400">{stats.due.toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card className={isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'}>
          <CardContent className="p-4 text-center">
            <Clock className="w-8 h-8 mx-auto text-slate-400 mb-2" />
            <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>قائم</p>
            <p className="text-xl font-bold text-slate-400">{stats.pending.toFixed(2)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      {isAdmin && (
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className={`absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`} />
            <Input
              placeholder="بحث بالاسم..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`pr-10 ${isDark ? 'bg-slate-800 border-white/10 text-white' : ''}`}
            />
          </div>
          <select
            value={selectedStudent}
            onChange={(e) => setSelectedStudent(e.target.value)}
            className={`p-2 rounded-lg border ${isDark ? 'bg-slate-800 border-white/10 text-white' : 'bg-white border-slate-300'}`}
          >
            <option value="all">جميع الطلاب</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* عرض الرسوم حسب الأشهر */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {ARABIC_MONTHS.map((monthName, idx) => {
          const monthNum = idx + 1;
          const monthFees = feesByMonth[monthNum] || [];
          const monthTotal = monthFees.reduce((sum, f) => sum + (f.amount || 0), 0);
          const monthPaid = monthFees.filter(f => f.is_paid).reduce((sum, f) => sum + (f.amount || 0), 0);
          
          // تحديد لون البطاقة
          const allPaid = monthFees.length > 0 && monthFees.every(f => f.is_paid);
          const hasDue = monthFees.some(f => getPaymentStatus(f) === 'due');
          
          return (
            <Card 
              key={monthNum} 
              className={`${isDark ? 'glass-card' : 'bg-white'} border ${
                allPaid ? 'border-emerald-500/30' : hasDue ? 'border-amber-500/30' : 'border-white/10'
              }`}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className={`text-base ${isDark ? 'text-white' : 'text-slate-900'}`}>
                    <Calendar className="w-4 h-4 inline ml-2 text-blue-400" />
                    {monthName}
                  </CardTitle>
                  {monthFees.length > 0 && (
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      allPaid ? 'bg-emerald-500/20 text-emerald-400' :
                      hasDue ? 'bg-amber-500/20 text-amber-400' :
                      'bg-slate-500/20 text-slate-400'
                    }`}>
                      {allPaid ? 'مدفوع' : hasDue ? 'مستحق' : 'قائم'}
                    </span>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {monthFees.length === 0 ? (
                  <p className={`text-center py-4 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                    لا توجد رسوم
                  </p>
                ) : (
                  <div className="space-y-2">
                    {monthFees.map((fee) => {
                      const status = getPaymentStatus(fee);
                      const StatusIcon = PAYMENT_STATUS[status].icon;
                      
                      return (
                        <div
                          key={fee.id}
                          className={`p-3 rounded-lg ${isDark ? 'bg-slate-800/50' : 'bg-slate-50'} flex items-center justify-between`}
                        >
                          <div className="flex-1">
                            <p className={`font-medium text-sm ${isDark ? 'text-white' : 'text-slate-900'}`}>
                              {getStudentName(fee.student_id)}
                            </p>
                            <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                              {fee.description}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`text-sm font-bold ${status === 'paid' ? 'text-emerald-400' : status === 'due' ? 'text-amber-400' : 'text-slate-400'}`}>
                              {fee.amount}
                            </span>
                            {isAdmin ? (
                              <select
                                value={status}
                                onChange={(e) => handleChangeStatus(fee.id, e.target.value)}
                                className={`text-xs rounded-full px-2 py-1 border cursor-pointer focus:outline-none ${PAYMENT_STATUS[status].color} ${isDark ? 'border-white/10' : 'border-slate-300'}`}
                                title="تغيير الحالة"
                              >
                                <option value="pending">قائم</option>
                                <option value="due">مستحق</option>
                                <option value="paid">مدفوع</option>
                              </select>
                            ) : (
                              <span className={`text-xs px-2 py-1 rounded-full ${PAYMENT_STATUS[status].color}`}>
                                <StatusIcon className="w-3 h-3 inline ml-1" />
                                {PAYMENT_STATUS[status].label}
                              </span>
                            )}
                            {isAdmin && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDelete(fee.id)}
                                className="text-red-400 hover:bg-red-500/10"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    
                    {/* ملخص الشهر */}
                    <div className={`mt-2 pt-2 border-t ${isDark ? 'border-white/10' : 'border-slate-200'} flex justify-between text-sm`}>
                      <span className={isDark ? 'text-slate-400' : 'text-slate-600'}>المجموع:</span>
                      <span className={`font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                        {monthPaid}/{monthTotal}
                      </span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default FeesManagement;
