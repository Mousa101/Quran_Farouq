import { useState, useEffect } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Calendar } from '../components/ui/calendar';
import { UserCheck, CheckCircle, XCircle, Clock, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const Attendance = () => {
  const [groups, setGroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState('');
  const [students, setStudents] = useState([]);
  const [attendance, setAttendance] = useState({});
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchGroups();
  }, []);

  useEffect(() => {
    if (selectedGroup) {
      fetchStudents();
      fetchAttendance();
    }
  }, [selectedGroup, selectedDate]);

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
      response.data.forEach(a => {
        attendanceMap[a.student_id] = a.status;
      });
      setAttendance(attendanceMap);
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const handleStatusChange = async (studentId, status) => {
    setSaving(true);
    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      await axios.post(`${API}/attendance`, {
        student_id: studentId,
        date: dateStr,
        status: status
      });
      
      setAttendance(prev => ({ ...prev, [studentId]: status }));
      toast.success('تم تسجيل الحضور');
    } catch (error) {
      toast.error('فشل تسجيل الحضور');
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
                    className="p-4 rounded-xl bg-slate-800/50 border border-white/5 flex items-center justify-between"
                  >
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
                        onClick={() => handleStatusChange(student.id, 'excused')}
                        className={`${getStatusStyle(attendance[student.id], 'excused')} transition-all`}
                        disabled={saving}
                        data-testid={`excused-${student.id}`}
                      >
                        معذور
                      </Button>
                    </div>
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
    </div>
  );
};

export default Attendance;
