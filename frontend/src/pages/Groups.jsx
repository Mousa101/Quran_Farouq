import { useState, useEffect } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Users, Plus, UserPlus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const Groups = () => {
  const [groups, setGroups] = useState([]);
  const [students, setStudents] = useState([]);
  const [unassignedStudents, setUnassignedStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [addStudentOpen, setAddStudentOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [formData, setFormData] = useState({ name: '', description: '' });
  const [selectedStudent, setSelectedStudent] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [groupsRes, usersRes] = await Promise.all([
        axios.get(`${API}/groups`),
        axios.get(`${API}/users?role=student`)
      ]);
      
      setGroups(groupsRes.data);
      
      // Get students for each group
      const groupsWithStudents = await Promise.all(
        groupsRes.data.map(async (group) => {
          const studentsRes = await axios.get(`${API}/groups/${group.id}/students`);
          return { ...group, students: studentsRes.data };
        })
      );
      setGroups(groupsWithStudents);
      
      // Filter unassigned students
      const allStudents = usersRes.data;
      const unassigned = allStudents.filter(s => !s.group_id);
      setUnassignedStudents(unassigned);
      setStudents(allStudents);
    } catch (error) {
      console.error('Error:', error);
      toast.error('خطأ في تحميل البيانات');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateGroup = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    
    try {
      await axios.post(`${API}/groups`, formData);
      toast.success('تم إنشاء المجموعة بنجاح');
      setCreateOpen(false);
      setFormData({ name: '', description: '' });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل إنشاء المجموعة');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddStudent = async () => {
    if (!selectedStudent || !selectedGroup) return;
    setSubmitting(true);
    
    try {
      await axios.post(`${API}/groups/${selectedGroup}/add-student`, { student_id: selectedStudent });
      toast.success('تم إضافة الطالب للمجموعة');
      setAddStudentOpen(false);
      setSelectedStudent('');
      setSelectedGroup(null);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل إضافة الطالب');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fadeIn" data-testid="groups-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">إدارة المجموعات</h1>
          <p className="text-slate-400">إنشاء وإدارة مجموعات الطلاب</p>
        </div>
        
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="bg-emerald-500 hover:bg-emerald-600" data-testid="create-group-btn">
              <Plus className="w-5 h-5 ml-2" />
              إنشاء مجموعة
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-slate-900 border-slate-700">
            <DialogHeader>
              <DialogTitle className="text-white text-xl">إنشاء مجموعة جديدة</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateGroup} className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label className="text-slate-300">اسم المجموعة</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="bg-slate-800 border-slate-700 text-white"
                  placeholder="مثال: مجموعة الفجر"
                  required
                  data-testid="group-name-input"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-300">الوصف (اختياري)</Label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="bg-slate-800 border-slate-700 text-white"
                  placeholder="وصف المجموعة..."
                  data-testid="group-desc-input"
                />
              </div>
              <Button
                type="submit"
                className="w-full bg-emerald-500 hover:bg-emerald-600"
                disabled={submitting}
                data-testid="submit-group-btn"
              >
                {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'إنشاء'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Groups Grid */}
      {groups.length === 0 ? (
        <Card className="glass-card border-white/10">
          <CardContent className="p-12 text-center">
            <Users className="w-16 h-16 mx-auto text-slate-600 mb-4" />
            <h3 className="text-xl font-bold text-white mb-2">لا توجد مجموعات</h3>
            <p className="text-slate-400">ابدأ بإنشاء مجموعتك الأولى</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {groups.map((group) => (
            <Card key={group.id} className="glass-card border-white/10 hover:border-emerald-500/30 transition-all">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-lg font-bold text-white">{group.name}</CardTitle>
                <Dialog open={addStudentOpen && selectedGroup === group.id} onOpenChange={(open) => {
                  setAddStudentOpen(open);
                  if (open) setSelectedGroup(group.id);
                }}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="ghost" className="text-emerald-400 hover:text-emerald-300">
                      <UserPlus className="w-4 h-4" />
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="bg-slate-900 border-slate-700">
                    <DialogHeader>
                      <DialogTitle className="text-white">إضافة طالب للمجموعة</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 mt-4">
                      <Select value={selectedStudent} onValueChange={setSelectedStudent}>
                        <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                          <SelectValue placeholder="اختر طالباً" />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-800 border-slate-700">
                          {unassignedStudents.map((student) => (
                            <SelectItem key={student.id} value={student.id} className="text-white">
                              {student.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {unassignedStudents.length === 0 && (
                        <p className="text-slate-400 text-sm text-center">لا يوجد طلاب غير مسجلين في مجموعات</p>
                      )}
                      <Button
                        onClick={handleAddStudent}
                        className="w-full bg-emerald-500 hover:bg-emerald-600"
                        disabled={!selectedStudent || submitting}
                      >
                        {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'إضافة'}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                {group.description && (
                  <p className="text-slate-400 text-sm mb-4">{group.description}</p>
                )}
                <div className="flex items-center gap-2 text-slate-300 mb-4">
                  <Users className="w-4 h-4" />
                  <span className="text-sm">{group.students?.length || 0} طالب</span>
                </div>
                
                {/* Students List */}
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {group.students?.map((student) => (
                    <div
                      key={student.id}
                      className="p-2 rounded-lg bg-slate-800/50 text-sm text-white"
                    >
                      {student.name}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default Groups;
