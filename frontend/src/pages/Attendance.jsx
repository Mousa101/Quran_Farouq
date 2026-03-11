import { useState, useEffect } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Calendar } from '../components/ui/calendar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { UserCheck, CheckCircle, XCircle, Clock, Loader2, Star, Sparkles, Archive, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const Attendance = () => {
  const [groups, setGroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState('');
  const [students, setStudents] = useState([]);
  const [attendance, setAttendance] = useState({});
  const [excuseReasons, setExcuseReasons] = useState({});
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Term selection for viewing old records
  const [terms, setTerms] = useState([]);
  const [selectedTermId, setSelectedTermId] = useState('');
  const [isViewingOldTerm, setIsViewingOldTerm] = useState(false);
  
  // Excuse dialog state
  const [excuseDialogOpen, setExcuseDialogOpen] = useState(false);
  const [selectedStudentForExcuse, setSelectedStudentForExcuse] = useState(null);
  const [excuseReason, setExcuseReason] = useState('');
  
  // Interaction badge dialog state
  const [interactionDialogOpen, setInteractionDialogOpen] = useState(false);
  const [selectedStudentForInteraction, setSelectedStudentForInteraction] = useState(null);
  const [interactionNotes, setInteractionNotes] = useState('');

  useEffect(() => {
    fetchGroups();
    fetchTerms();
  }, []);

  useEffect(() => {
    if (selectedGroup) {
      fetchStudents();
      fetchAttendance();
    }
  }, [selectedGroup, selectedDate, selectedTermId]);

  const fetchTerms = async () => {
    try {
      const response = await axios.get(`${API}/terms`);
      setTerms(response.data || []);
      // Set active term as default
      const activeTerm = response.data.find(t => t.is_active);
      if (activeTerm) {
        setSelectedTermId(activeTerm.id);
      }
    } catch (error) {
      console.error('Error fetching terms:', error);
    }
  };

  const handleTermChange = (termId) => {
    setSelectedTermId(termId);
    const term = terms.find(t => t.id === termId);
    setIsViewingOldTerm(term && !term.is_active);
  };

  const fetchGroups = async () => {
    try {
      const response = await axios.get(`${API}/groups`);
      setGroups(response.data);
      if (response.data.length > 0) {
        setSelectedGroup(response.data[0].id);
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStudents = async () => {
    try {
      const response = await axios.get(`${API}/groups/${selectedGroup}/students`);
      setStudents(response.data);
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const fetchAttendance = async () => {
    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const response = await axios.get(`${API}/attendance?date=${dateStr}`);
      
      // Convert to map
      const attendanceMap = {};
      const reasonsMap = {};
      response.data.forEach(a => {
        attendanceMap[a.student_id] = a.status;
        if (a.excuse_reason) {
          reasonsMap[a.student_id] = a.excuse_reason;
        }
      });
      setAttendance(attendanceMap);
      setExcuseReasons(reasonsMap);
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const handleStatusChange = async (studentId, status, reason = null) => {
    setSaving(true);
    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const payload = {
        student_id: studentId,
        date: dateStr,
        status: status
      };
      
      if (reason) {
        payload.excuse_reason = reason;
      }
      
      await axios.post(`${API}/attendance`, payload);
      
      setAttendance(prev => ({ ...prev, [studentId]: status }));
      if (reason) {
        setExcuseReasons(prev => ({ ...prev, [studentId]: reason }));
      }
      toast.success('تم تسجيل الحضور');
    } catch (error) {
      toast.error('فشل تسجيل الحضور');
    } finally {
      setSaving(false);
    }
  };

  const handleExcusedClick = (student) => {
    setSelectedStudentForExcuse(student);
    setExcuseReason(excuseReasons[student.id] || '');
    setExcuseDialogOpen(true);
  };

  const handleExcuseSubmit = async () => {
    if (!selectedStudentForExcuse || !excuseReason.trim()) {
      toast.error('يرجى إدخال سبب العذر');
      return;
    }
    
    await handleStatusChange(selectedStudentForExcuse.id, 'excused', excuseReason);
    setExcuseDialogOpen(false);
    setExcuseReason('');
    setSelectedStudentForExcuse(null);
  };

  // منح شارة التفاعل
  const handleInteractionClick = (student) => {
    setSelectedStudentForInteraction(student);
    setInteractionNotes('');
    setInteractionDialogOpen(true);
  };

  const handleInteractionSubmit = async () => {
    if (!selectedStudentForInteraction) return;
    
    setSaving(true);
    try {
      await axios.post(`${API}/badges/interaction`, {
        student_id: selectedStudentForInteraction.id,
        notes: interactionNotes
      });
      toast.success(`تم منح شارة التفاعل و10 نقاط للطالب ${selectedStudentForInteraction.name}`);
      setInteractionDialogOpen(false);
      setInteractionNotes('');
      setSelectedStudentForInteraction(null);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في منح شارة التفاعل');
    } finally {
      setSaving(false);
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'present':
        return <CheckCircle className="w-5 h-5 text-emerald-400" />;
      case 'absent':
        return <XCircle className="w-5 h-5 text-red-400" />;
      case 'excused':
        return <Clock className="w-5 h-5 text-amber-400" />;
      default:
        return null;
    }
  };

  const getStatusStyle = (currentStatus, buttonStatus) => {
    if (currentStatus === buttonStatus) {
      switch (buttonStatus) {
        case 'present':
          return 'bg-emerald-500 text-white';
        case 'absent':
          return 'bg-red-500 text-white';
        case 'excused':
          return 'bg-amber-500 text-white';
        default:
          return '';
      }
    }
    return 'bg-slate-700 text-slate-300 hover:bg-slate-600';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fadeIn" data-testid="attendance-page">
      <div>
        <h1 className="text-2xl font-bold text-white">تسجيل الحضور</h1>
        <p className="text-slate-400">تسجيل حضور وغياب الطلاب</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar & Group Selection */}
        <Card className="glass-card border-white/10">
          <CardHeader>
            <CardTitle className="text-lg font-bold text-white">اختر التاريخ والمجموعة</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Select value={selectedGroup} onValueChange={setSelectedGroup}>
              <SelectTrigger className="bg-slate-800 border-slate-700 text-white" data-testid="group-select">
                <SelectValue placeholder="اختر المجموعة" />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                {groups.map((group) => (
                  <SelectItem key={group.id} value={group.id} className="text-white">
                    {group.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={(date) => date && setSelectedDate(date)}
              locale={ar}
              className="rounded-xl border border-slate-700 bg-slate-800/50 p-3"
            />
          </CardContent>
        </Card>

        {/* Students Attendance */}
        <Card className="glass-card border-white/10 lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg font-bold text-white flex items-center gap-3">
              <UserCheck className="w-6 h-6 text-emerald-400" />
              الطلاب - {format(selectedDate, 'EEEE d MMMM yyyy', { locale: ar })}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {students.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <UserCheck className="w-16 h-16 mx-auto mb-4 opacity-50" />
                <p>لا يوجد طلاب في هذه المجموعة</p>
              </div>
            ) : (
              <div className="space-y-3">
                {students.map((student) => (
                  <div
                    key={student.id}
                    className="p-4 rounded-xl bg-slate-800/50 border border-white/5"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {getStatusIcon(attendance[student.id])}
                        <span className="text-white font-medium">{student.name}</span>
                      </div>
                      
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleStatusChange(student.id, 'present')}
                          className={`${getStatusStyle(attendance[student.id], 'present')} transition-all`}
                          disabled={saving}
                          data-testid={`present-${student.id}`}
                        >
                          حاضر
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleStatusChange(student.id, 'absent')}
                          className={`${getStatusStyle(attendance[student.id], 'absent')} transition-all`}
                          disabled={saving}
                          data-testid={`absent-${student.id}`}
                        >
                          غائب
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleExcusedClick(student)}
                          className={`${getStatusStyle(attendance[student.id], 'excused')} transition-all`}
                          disabled={saving}
                          data-testid={`excused-${student.id}`}
                        >
                          معذور
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleInteractionClick(student)}
                          className="bg-pink-500/20 text-pink-400 hover:bg-pink-500/30 transition-all"
                          disabled={saving}
                          title="منح شارة التفاعل"
                        >
                          <Sparkles className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                    
                    {/* Show excuse reason if exists */}
                    {attendance[student.id] === 'excused' && excuseReasons[student.id] && (
                      <div className="mt-2 p-2 rounded-lg bg-amber-500/10 text-amber-300 text-sm">
                        <span className="font-medium">سبب العذر:</span> {excuseReasons[student.id]}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Summary */}
      <Card className="glass-card border-white/10">
        <CardHeader>
          <CardTitle className="text-lg font-bold text-white">ملخص الحضور</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-emerald-500/10 text-center">
              <CheckCircle className="w-8 h-8 mx-auto text-emerald-400 mb-2" />
              <p className="text-2xl font-bold text-white">
                {Object.values(attendance).filter(s => s === 'present').length}
              </p>
              <p className="text-slate-400 text-sm">حاضر</p>
            </div>
            <div className="p-4 rounded-xl bg-red-500/10 text-center">
              <XCircle className="w-8 h-8 mx-auto text-red-400 mb-2" />
              <p className="text-2xl font-bold text-white">
                {Object.values(attendance).filter(s => s === 'absent').length}
              </p>
              <p className="text-slate-400 text-sm">غائب</p>
            </div>
            <div className="p-4 rounded-xl bg-amber-500/10 text-center">
              <Clock className="w-8 h-8 mx-auto text-amber-400 mb-2" />
              <p className="text-2xl font-bold text-white">
                {Object.values(attendance).filter(s => s === 'excused').length}
              </p>
              <p className="text-slate-400 text-sm">معذور</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Excuse Reason Dialog */}
      <Dialog open={excuseDialogOpen} onOpenChange={setExcuseDialogOpen}>
        <DialogContent className="bg-slate-900 border-slate-700 text-white">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">
              تسجيل عذر للطالب {selectedStudentForExcuse?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-slate-300">سبب العذر</Label>
              <Input
                value={excuseReason}
                onChange={(e) => setExcuseReason(e.target.value)}
                placeholder="مثال: مريض، سفر، ظروف عائلية..."
                className="bg-slate-800 border-slate-700 text-white"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button 
              variant="ghost" 
              onClick={() => setExcuseDialogOpen(false)}
              className="text-slate-400"
            >
              إلغاء
            </Button>
            <Button 
              onClick={handleExcuseSubmit}
              className="bg-amber-600 hover:bg-amber-700"
              disabled={saving}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'تأكيد'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Interaction Badge Dialog */}
      <Dialog open={interactionDialogOpen} onOpenChange={setInteractionDialogOpen}>
        <DialogContent className="bg-slate-900 border-slate-700 text-white">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-pink-400" />
              منح شارة التفاعل
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="p-4 rounded-xl bg-pink-500/10 border border-pink-500/30 text-center">
              <p className="text-pink-400 text-lg font-bold">{selectedStudentForInteraction?.name}</p>
              <p className="text-slate-400 text-sm mt-1">سيحصل على شارة ⭐ المتفاعل و +10 نقاط</p>
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">ملاحظات (اختياري)</Label>
              <Textarea
                value={interactionNotes}
                onChange={(e) => setInteractionNotes(e.target.value)}
                placeholder="سبب منح الشارة..."
                className="bg-slate-800 border-slate-700 text-white"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button 
              variant="ghost" 
              onClick={() => setInteractionDialogOpen(false)}
              className="text-slate-400"
            >
              إلغاء
            </Button>
            <Button 
              onClick={handleInteractionSubmit}
              className="bg-pink-600 hover:bg-pink-700"
              disabled={saving}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'منح الشارة'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Attendance;
