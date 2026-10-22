import { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Calendar, Plus, Trash2, MapPin, Clock, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatDate as fmtDate } from '../lib/utils';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const Activities = () => {
  const { user } = useAuth();
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const EMPTY_FORM = {
    title: '',
    description: '',
    date: '',
    time: '',
    end_time: '',
    location: '',
    required_fee: '',
    required_points: '',
  };
  const [formData, setFormData] = useState(EMPTY_FORM);

  useEffect(() => {
    fetchActivities();
  }, []);

  const fetchActivities = async () => {
    try {
      const response = await axios.get(`${API}/activities`);
      setActivities(response.data);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    
    try {
      await axios.post(`${API}/activities`, {
        ...formData,
        end_time: formData.end_time || null,
        required_fee: formData.required_fee !== '' ? Number(formData.required_fee) : null,
        required_points: formData.required_points !== '' ? Number(formData.required_points) : null,
      });
      toast.success('تم إنشاء النشاط بنجاح');
      setDialogOpen(false);
      setFormData(EMPTY_FORM);
      fetchActivities();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل إنشاء النشاط');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (activityId) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا النشاط؟')) return;
    
    try {
      await axios.delete(`${API}/activities/${activityId}`);
      toast.success('تم حذف النشاط');
      fetchActivities();
    } catch (error) {
      toast.error('فشل حذف النشاط');
    }
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
    <div className="space-y-8 animate-fadeIn" data-testid="activities-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">الأنشطة</h1>
          <p className="text-slate-400">الفعاليات والأنشطة القادمة</p>
        </div>
        
        {isAdmin && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-emerald-500 hover:bg-emerald-600" data-testid="add-activity-btn">
                <Plus className="w-5 h-5 ml-2" />
                إضافة نشاط
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-slate-900 border-slate-700">
              <DialogHeader>
                <DialogTitle className="text-white text-xl">إضافة نشاط جديد</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label className="text-slate-300">عنوان النشاط</Label>
                  <Input
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="bg-slate-800 border-slate-700 text-white"
                    placeholder="مثال: رحلة إلى المسجد الأقصى"
                    required
                    data-testid="activity-title-input"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-slate-300">الوصف</Label>
                  <Textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="bg-slate-800 border-slate-700 text-white"
                    placeholder="تفاصيل النشاط..."
                    required
                    data-testid="activity-desc-input"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-slate-300">التاريخ</Label>
                    <Input
                      type="date"
                      value={formData.date}
                      onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                      className="bg-slate-800 border-slate-700 text-white"
                      required
                      data-testid="activity-date-input"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-300">من الساعة</Label>
                    <Input
                      type="time"
                      value={formData.time}
                      onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                      className="bg-slate-800 border-slate-700 text-white"
                      required
                      data-testid="activity-time-input"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-slate-300">إلى الساعة (اختياري)</Label>
                    <Input
                      type="time"
                      value={formData.end_time}
                      onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                      className="bg-slate-800 border-slate-700 text-white"
                      data-testid="activity-end-time-input"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-300">المكان (اختياري)</Label>
                    <Input
                      value={formData.location}
                      onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                      className="bg-slate-800 border-slate-700 text-white"
                      placeholder="مثال: قاعة المركز"
                      data-testid="activity-location-input"
                    />
                  </div>
                </div>

                {/* شروط المشاركة */}
                <div className="p-3 rounded-lg bg-slate-800/50 border border-white/5 space-y-3">
                  <p className="text-sm text-slate-300">شروط المشاركة (اختياري)</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-slate-400 text-xs">الرسوم المطلوبة</Label>
                      <Input
                        type="number" min="0" step="0.5"
                        value={formData.required_fee}
                        onChange={(e) => setFormData({ ...formData, required_fee: e.target.value })}
                        className="bg-slate-800 border-slate-700 text-white"
                        placeholder="مثال: 20"
                        data-testid="activity-fee-input"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-slate-400 text-xs">النقاط المطلوبة</Label>
                      <Input
                        type="number" min="0"
                        value={formData.required_points}
                        onChange={(e) => setFormData({ ...formData, required_points: e.target.value })}
                        className="bg-slate-800 border-slate-700 text-white"
                        placeholder="مثال: 50"
                        data-testid="activity-points-input"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-slate-500">
                    تظهر للطلاب كشرط للمشاركة — التحصيل يتم يدويًا من الإدارة.
                  </p>
                </div>

                <Button
                  type="submit"
                  className="w-full bg-emerald-500 hover:bg-emerald-600"
                  disabled={submitting}
                  data-testid="submit-activity-btn"
                >
                  {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'إضافة'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Activities List */}
      {activities.length === 0 ? (
        <Card className="glass-card border-white/10">
          <CardContent className="p-12 text-center">
            <Calendar className="w-16 h-16 mx-auto text-slate-600 mb-4" />
            <h3 className="text-xl font-bold text-white mb-2">لا توجد أنشطة</h3>
            <p className="text-slate-400">لم يتمت إضافة أي أنشطة بعد</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {activities.map((activity) => (
            <Card key={activity.id} className="glass-card border-white/10 hover:border-emerald-500/30 transition-all group">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-lg font-bold text-white">{activity.title}</CardTitle>
                  {isAdmin && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDelete(activity.id)}
                      className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                      data-testid={`delete-activity-${activity.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-slate-400 text-sm mb-4">{activity.description}</p>
                
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-emerald-400">
                    <Calendar className="w-4 h-4" />
                    <span className="text-sm">{fmtDate(activity.date)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-300">
                    <Clock className="w-4 h-4" />
                    <span className="text-sm">
                      {activity.time}
                      {activity.end_time && <span className="text-slate-400"> ← {activity.end_time}</span>}
                    </span>
                  </div>
                  {activity.location && (
                    <div className="flex items-center gap-2 text-slate-400">
                      <MapPin className="w-4 h-4" />
                      <span className="text-sm">{activity.location}</span>
                    </div>
                  )}

                  {/* شروط المشاركة */}
                  {(activity.required_fee || activity.required_points) && (
                    <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-white/5">
                      <span className="text-xs text-slate-500">للمشاركة:</span>
                      {activity.required_fee ? (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400">
                          💰 {activity.required_fee}
                        </span>
                      ) : null}
                      {activity.required_points ? (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400">
                          ⭐ {activity.required_points} نقطة
                        </span>
                      ) : null}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default Activities;
