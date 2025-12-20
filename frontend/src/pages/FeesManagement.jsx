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
import { DollarSign, Plus, Check, Trash2, CreditCard, Clock, CheckCircle, AlertCircle } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const FEE_TYPES = [
  { value: 'subscription', label: 'رسوم اشتراك', color: 'emerald' },
  { value: 'umrah', label: 'عمرة', color: 'purple' },
  { value: 'activity', label: 'نشاط', color: 'blue' }
];

const FeesManagement = () => {
  const { user } = useAuth();
  const { isDark } = useTheme();
  const [fees, setFees] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    student_id: '',
    fee_type: 'subscription',
    amount: '',
    description: '',
    due_date: ''
  });

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
      await axios.post(`${API}/fees`, {
        ...formData,
        amount: parseFloat(formData.amount)
      });
      toast.success('تم إضافة الرسوم بنجاح');
      setDialogOpen(false);
      setFormData({ student_id: '', fee_type: 'subscription', amount: '', description: '', due_date: '' });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في إضافة الرسوم');
    }
  };

  const handleMarkPaid = async (feeId) => {
    try {
      await axios.put(`${API}/fees/${feeId}/pay`);
      toast.success('تم تأكيد الدفع');
      fetchData();
    } catch (error) {
      toast.error('فشل في تأكيد الدفع');
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

  const getFeeTypeInfo = (type) => FEE_TYPES.find(t => t.value === type) || FEE_TYPES[0];

  const totalDue = fees.filter(f => !f.is_paid).reduce((sum, f) => sum + f.amount, 0);
  const totalPaid = fees.filter(f => f.is_paid).reduce((sum, f) => sum + f.amount, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const isAdmin = user?.role === 'admin';

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className={`p-6 rounded-xl ${isDark ? 'glass-card border border-white/10' : 'bg-white border border-slate-200 shadow-sm'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center">
              <DollarSign className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <h1 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>الرسوم المالية</h1>
              <p className={isDark ? 'text-slate-400' : 'text-slate-600'}>إدارة رسوم الاشتراك والأنشطة</p>
            </div>
          </div>
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
                  <div>
                    <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>نوع الرسوم</Label>
                    <select
                      value={formData.fee_type}
                      onChange={(e) => setFormData({ ...formData, fee_type: e.target.value })}
                      className={`w-full p-2 rounded-md border ${isDark ? 'bg-slate-800 border-white/10 text-white' : 'bg-white border-slate-300'}`}
                    >
                      {FEE_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>المبلغ</Label>
                    <Input
                      type="number"
                      value={formData.amount}
                      onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                      required
                      className={isDark ? 'bg-slate-800 border-white/10 text-white' : ''}
                    />
                  </div>
                  <div>
                    <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>تاريخ الاستحقاق</Label>
                    <Input
                      type="date"
                      value={formData.due_date}
                      onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
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
                  <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700">إضافة</Button>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className={isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>المستحقات</p>
                <p className="text-xl font-bold text-red-400">{totalDue} د.أ</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>المدفوع</p>
                <p className="text-xl font-bold text-emerald-400">{totalPaid} د.أ</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                <CreditCard className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>الإجمالي</p>
                <p className="text-xl font-bold text-blue-400">{totalDue + totalPaid} د.أ</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Fees List */}
      <Card className={isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'}>
        <CardHeader>
          <CardTitle className={isDark ? 'text-white' : 'text-slate-900'}>قائمة الرسوم</CardTitle>
        </CardHeader>
        <CardContent>
          {fees.length === 0 ? (
            <p className={`text-center py-8 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>لا توجد رسوم</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className={`border-b ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
                    <th className={`px-4 py-3 text-right text-sm font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>الطالب</th>
                    <th className={`px-4 py-3 text-right text-sm font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>النوع</th>
                    <th className={`px-4 py-3 text-right text-sm font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>المبلغ</th>
                    <th className={`px-4 py-3 text-right text-sm font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>الاستحقاق</th>
                    <th className={`px-4 py-3 text-right text-sm font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>الحالة</th>
                    {isAdmin && <th className={`px-4 py-3 text-right text-sm font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}></th>}
                  </tr>
                </thead>
                <tbody>
                  {fees.map((fee) => {
                    const typeInfo = getFeeTypeInfo(fee.fee_type);
                    return (
                      <tr key={fee.id} className={`border-b ${isDark ? 'border-white/5' : 'border-slate-100'}`}>
                        <td className={`px-4 py-3 ${isDark ? 'text-white' : 'text-slate-900'}`}>{fee.student_name}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 text-xs rounded-full bg-${typeInfo.color}-500/20 text-${typeInfo.color}-400`}>
                            {typeInfo.label}
                          </span>
                        </td>
                        <td className={`px-4 py-3 font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{fee.amount} ر.س</td>
                        <td className={`px-4 py-3 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>{fee.due_date || '-'}</td>
                        <td className="px-4 py-3">
                          {fee.is_paid ? (
                            <span className="flex items-center gap-1 text-emerald-400">
                              <CheckCircle className="w-4 h-4" /> مدفوع
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-red-400">
                              <Clock className="w-4 h-4" /> غير مدفوع
                            </span>
                          )}
                        </td>
                        {isAdmin && (
                          <td className="px-4 py-3">
                            <div className="flex gap-2">
                              {!fee.is_paid && (
                                <Button variant="ghost" size="sm" onClick={() => handleMarkPaid(fee.id)} className="text-emerald-400">
                                  <Check className="w-4 h-4" />
                                </Button>
                              )}
                              <Button variant="ghost" size="sm" onClick={() => handleDelete(fee.id)} className="text-red-400">
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default FeesManagement;
