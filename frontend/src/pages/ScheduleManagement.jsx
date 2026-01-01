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
import { Calendar, Plus, Edit, Trash2, Clock, Check, Power } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const DAYS = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'];

const ScheduleManagement = () => {
  const { user } = useAuth();
  const { isDark } = useTheme();
  const [schedules, setSchedules] = useState([]);
  const [selectedSchedule, setSelectedSchedule] = useState(null);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [slotDialogOpen, setSlotDialogOpen] = useState(false);
  const [editingSlot, setEditingSlot] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    start_date: '',
    end_date: '',
    lesson_days: []
  });
  const [slotData, setSlotData] = useState({
    day: 'السبت',
    start_time: '',
    end_time: '',
    subject: '',
    description: '',
    group_id: ''
  });

  useEffect(() => {
    fetchSchedules();
    fetchGroups();
  }, []);

  const fetchSchedules = async () => {
    try {
      const res = await axios.get(`${API}/schedule`);
      setSchedules(res.data);
    } catch (error) {
      console.error('Error fetching schedules:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchGroups = async () => {
    try {
      const res = await axios.get(`${API}/groups`);
      setGroups(res.data);
    } catch (error) {
      console.error('Error fetching groups:', error);
    }
  };

  const fetchScheduleDetails = async (id) => {
    try {
      const res = await axios.get(`${API}/schedule/${id}`);
      setSelectedSchedule(res.data);
    } catch (error) {
      toast.error('فشل في تحميل تفاصيل الجدول');
    }
  };

  const handleCreateSchedule = async (e) => {
    e.preventDefault();
    try {
      const res = await axios.post(`${API}/schedule`, formData);
      toast.success('تم إنشاء الجدول بنجاح');
      setDialogOpen(false);
      setFormData({ name: '', description: '', start_date: '', end_date: '', lesson_days: [] });
      fetchSchedules();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في إنشاء الجدول');
    }
  };

  const handleActivateSchedule = async (id) => {
    try {
      await axios.put(`${API}/schedule/${id}/activate`);
      toast.success('تم تفعيل الجدول بنجاح');
      fetchSchedules();
    } catch (error) {
      toast.error('فشل في تفعيل الجدول');
    }
  };

  const handleDeleteSchedule = async (id) => {
    if (!confirm('هل أنت متأكد من حذف هذا الجدول؟')) return;
    try {
      await axios.delete(`${API}/schedule/${id}`);
      toast.success('تم حذف الجدول بنجاح');
      fetchSchedules();
      if (selectedSchedule?.id === id) {
        setSelectedSchedule(null);
      }
    } catch (error) {
      toast.error('فشل في حذف الجدول');
    }
  };

  const handleAddSlot = async (e) => {
    e.preventDefault();
    try {
      if (editingSlot) {
        await axios.put(`${API}/schedule/slots/${editingSlot.id}`, slotData);
        toast.success('تم تحديث الحصة بنجاح');
      } else {
        await axios.post(`${API}/schedule/${selectedSchedule.id}/slots`, slotData);
        toast.success('تم إضافة الحصة بنجاح');
      }
      setSlotDialogOpen(false);
      setSlotData({ day: 'السبت', start_time: '', end_time: '', subject: '', description: '', group_id: '' });
      setEditingSlot(null);
      fetchScheduleDetails(selectedSchedule.id);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في حفظ الحصة');
    }
  };

  const handleDeleteSlot = async (slotId) => {
    if (!confirm('هل أنت متأكد من حذف هذه الحصة؟')) return;
    try {
      await axios.delete(`${API}/schedule/slots/${slotId}`);
      toast.success('تم حذف الحصة بنجاح');
      fetchScheduleDetails(selectedSchedule.id);
    } catch (error) {
      toast.error('فشل في حذف الحصة');
    }
  };

  const openEditSlot = (slot) => {
    setEditingSlot(slot);
    setSlotData({
      day: slot.day,
      start_time: slot.start_time,
      end_time: slot.end_time,
      subject: slot.subject,
      description: slot.description || '',
      group_id: slot.group_id || ''
    });
    setSlotDialogOpen(true);
  };

  const getSlotsByDay = (day) => {
    return selectedSchedule?.slots?.filter(s => s.day === day).sort((a, b) => a.start_time.localeCompare(b.start_time)) || [];
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
            <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center">
              <Calendar className="w-6 h-6 text-blue-400" />
            </div>
            <div>
              <h1 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>إدارة الجداول</h1>
              <p className={isDark ? 'text-slate-400' : 'text-slate-600'}>إنشاء وإدارة الجداول الدراسية اليومية</p>
            </div>
          </div>
          {isAdmin && (
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button className="bg-blue-600 hover:bg-blue-700">
                  <Plus className="w-4 h-4 ml-2" />
                  إنشاء جدول جديد
                </Button>
              </DialogTrigger>
              <DialogContent className={isDark ? 'bg-slate-900 border-white/10' : 'bg-white'}>
                <DialogHeader>
                  <DialogTitle className={isDark ? 'text-white' : 'text-slate-900'}>إنشاء جدول جديد</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleCreateSchedule} className="space-y-4">
                  <div>
                    <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>اسم الجدول</Label>
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
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>تاريخ البداية</Label>
                      <Input
                        type="date"
                        value={formData.start_date}
                        onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                        required
                        className={isDark ? 'bg-slate-800 border-white/10 text-white' : ''}
                      />
                    </div>
                    <div>
                      <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>تاريخ النهاية</Label>
                      <Input
                        type="date"
                        value={formData.end_date}
                        onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                        className={isDark ? 'bg-slate-800 border-white/10 text-white' : ''}
                      />
                    </div>
                  </div>
                  <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700">إنشاء</Button>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Schedule List */}
        <div className="lg:col-span-1">
          <Card className={isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'}>
            <CardHeader>
              <CardTitle className={isDark ? 'text-white' : 'text-slate-900'}>الجداول</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {schedules.length === 0 ? (
                <p className={`text-center py-4 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>لا توجد جداول بعد</p>
              ) : (
                schedules.map((schedule) => (
                  <div
                    key={schedule.id}
                    className={`p-3 rounded-lg cursor-pointer transition-all ${
                      selectedSchedule?.id === schedule.id
                        ? 'bg-blue-500/20 border border-blue-500/50'
                        : isDark
                        ? 'bg-slate-800/50 border border-white/5 hover:border-blue-500/30'
                        : 'bg-slate-50 border border-slate-200 hover:border-blue-500'
                    }`}
                    onClick={() => fetchScheduleDetails(schedule.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className={`font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>{schedule.name}</h3>
                          {schedule.is_active && (
                            <span className="px-2 py-0.5 text-xs rounded-full bg-emerald-500/20 text-emerald-400">مفعل</span>
                          )}
                        </div>
                        <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                          {schedule.slots_count || 0} حصة
                        </p>
                      </div>
                      {isAdmin && (
                        <div className="flex gap-1">
                          {!schedule.is_active && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => { e.stopPropagation(); handleActivateSchedule(schedule.id); }}
                              className="text-emerald-400 hover:text-emerald-300"
                            >
                              <Power className="w-4 h-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => { e.stopPropagation(); handleDeleteSchedule(schedule.id); }}
                            className="text-red-400 hover:text-red-300"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        {/* Schedule Details */}
        <div className="lg:col-span-2">
          {selectedSchedule ? (
            <Card className={isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'}>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className={isDark ? 'text-white' : 'text-slate-900'}>{selectedSchedule.name}</CardTitle>
                  <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                    {selectedSchedule.start_date} - {selectedSchedule.end_date || 'غير محدد'}
                  </p>
                </div>
                {isAdmin && (
                  <Dialog open={slotDialogOpen} onOpenChange={(open) => { setSlotDialogOpen(open); if (!open) setEditingSlot(null); }}>
                    <DialogTrigger asChild>
                      <Button className="bg-blue-600 hover:bg-blue-700">
                        <Plus className="w-4 h-4 ml-2" />
                        إضافة حصة
                      </Button>
                    </DialogTrigger>
                    <DialogContent className={isDark ? 'bg-slate-900 border-white/10' : 'bg-white'}>
                      <DialogHeader>
                        <DialogTitle className={isDark ? 'text-white' : 'text-slate-900'}>
                          {editingSlot ? 'تعديل الحصة' : 'إضافة حصة جديدة'}
                        </DialogTitle>
                      </DialogHeader>
                      <form onSubmit={handleAddSlot} className="space-y-4">
                        <div>
                          <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>اليوم</Label>
                          <select
                            value={slotData.day}
                            onChange={(e) => setSlotData({ ...slotData, day: e.target.value })}
                            className={`w-full p-2 rounded-md border ${isDark ? 'bg-slate-800 border-white/10 text-white' : 'bg-white border-slate-300'}`}
                          >
                            {DAYS.map((day) => (
                              <option key={day} value={day}>{day}</option>
                            ))}
                          </select>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>وقت البداية</Label>
                            <Input
                              type="time"
                              value={slotData.start_time}
                              onChange={(e) => setSlotData({ ...slotData, start_time: e.target.value })}
                              required
                              className={isDark ? 'bg-slate-800 border-white/10 text-white' : ''}
                            />
                          </div>
                          <div>
                            <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>وقت النهاية</Label>
                            <Input
                              type="time"
                              value={slotData.end_time}
                              onChange={(e) => setSlotData({ ...slotData, end_time: e.target.value })}
                              required
                              className={isDark ? 'bg-slate-800 border-white/10 text-white' : ''}
                            />
                          </div>
                        </div>
                        <div>
                          <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>الدرس / الموضوع</Label>
                          <Input
                            value={slotData.subject}
                            onChange={(e) => setSlotData({ ...slotData, subject: e.target.value })}
                            required
                            className={isDark ? 'bg-slate-800 border-white/10 text-white' : ''}
                          />
                        </div>
                        <div>
                          <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>الوصف</Label>
                          <Textarea
                            value={slotData.description}
                            onChange={(e) => setSlotData({ ...slotData, description: e.target.value })}
                            className={isDark ? 'bg-slate-800 border-white/10 text-white' : ''}
                          />
                        </div>
                        <div>
                          <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>المجموعة (اختياري)</Label>
                          <select
                            value={slotData.group_id}
                            onChange={(e) => setSlotData({ ...slotData, group_id: e.target.value })}
                            className={`w-full p-2 rounded-md border ${isDark ? 'bg-slate-800 border-white/10 text-white' : 'bg-white border-slate-300'}`}
                          >
                            <option value="">جميع المجموعات</option>
                            {groups.map((g) => (
                              <option key={g.id} value={g.id}>{g.name}</option>
                            ))}
                          </select>
                        </div>
                        <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700">
                          {editingSlot ? 'تحديث' : 'إضافة'}
                        </Button>
                      </form>
                    </DialogContent>
                  </Dialog>
                )}
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {DAYS.map((day) => {
                    const slots = getSlotsByDay(day);
                    if (slots.length === 0) return null;
                    return (
                      <div key={day} className={`p-4 rounded-xl ${isDark ? 'bg-slate-800/50' : 'bg-slate-50'}`}>
                        <h3 className={`font-bold mb-3 ${isDark ? 'text-white' : 'text-slate-900'}`}>{day}</h3>
                        <div className="space-y-2">
                          {slots.map((slot) => (
                            <div
                              key={slot.id}
                              className={`p-3 rounded-lg ${isDark ? 'bg-slate-700/50 border border-white/5' : 'bg-white border border-slate-200'}`}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <div className="flex items-center gap-1 text-blue-400">
                                    <Clock className="w-4 h-4" />
                                    <span className="text-sm">{slot.start_time} - {slot.end_time}</span>
                                  </div>
                                  <span className={`font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>{slot.subject}</span>
                                  {slot.group_id && (
                                    <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-400">
                                      {groups.find(g => g.id === slot.group_id)?.name || 'مجموعة'}
                                    </span>
                                  )}
                                </div>
                                {isAdmin && (
                                  <div className="flex gap-1">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => openEditSlot(slot)}
                                      className="text-blue-400 hover:text-blue-300"
                                    >
                                      <Edit className="w-4 h-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleDeleteSlot(slot.id)}
                                      className="text-red-400 hover:text-red-300"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  </div>
                                )}
                              </div>
                              {slot.description && (
                                <p className={`text-sm mt-2 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>{slot.description}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  {!selectedSchedule.slots?.length && (
                    <p className={`text-center py-8 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>لا توجد حصص بعد</p>
                  )}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className={isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'}>
              <CardContent className="p-12 text-center">
                <Calendar className={`w-16 h-16 mx-auto mb-4 ${isDark ? 'text-slate-600' : 'text-slate-400'}`} />
                <p className={isDark ? 'text-slate-400' : 'text-slate-600'}>اختر جدولاً لعرض التفاصيل</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default ScheduleManagement;
