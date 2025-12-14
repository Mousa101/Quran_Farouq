import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Users, Eye, UsersRound } from 'lucide-react';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const Groups = () => {
  const { user } = useAuth();
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const groupsRes = await axios.get(`${API}/groups`);
      
      // Get students for each group
      const groupsWithStudents = await Promise.all(
        groupsRes.data.map(async (group) => {
          const studentsRes = await axios.get(`${API}/groups/${group.id}/students`);
          return { ...group, students: studentsRes.data };
        })
      );
      setGroups(groupsWithStudents);
    } catch (error) {
      console.error('Error:', error);
      toast.error('خطأ في تحميل البيانات');
    } finally {
      setLoading(false);
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
      <div>
        <h1 className="text-2xl font-bold text-white">مجموعاتي</h1>
        <p className="text-slate-400">عرض المجموعات المسندة إليك</p>
      </div>

      {/* Groups Grid */}
      {groups.length === 0 ? (
        <Card className="glass-card border-white/10">
          <CardContent className="p-12 text-center">
            <UsersRound className="w-16 h-16 mx-auto text-slate-600 mb-4" />
            <h3 className="text-xl font-bold text-white mb-2">لا توجد مجموعات</h3>
            <p className="text-slate-400">لم يتم تعيين أي مجموعة لك بعد</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {groups.map((group) => (
            <Card key={group.id} className="glass-card border-white/10 hover:border-emerald-500/30 transition-all">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
                  <UsersRound className="w-5 h-5 text-emerald-400" />
                  {group.name}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {group.description && (
                  <p className="text-slate-400 text-sm">{group.description}</p>
                )}
                
                <div className="flex items-center gap-2">
                  <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">
                    {group.students?.length || 0} طالب
                  </Badge>
                </div>
                
                {/* Students List */}
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {group.students?.length === 0 ? (
                    <p className="text-slate-400 text-sm text-center py-4">لا يوجد طلاب</p>
                  ) : (
                    group.students?.map((student) => (
                      <Link 
                        key={student.id}
                        to={`/student/${student.id}`}
                        className="p-3 rounded-lg bg-slate-800/50 border border-white/5 hover:border-emerald-500/30 transition-all flex items-center justify-between group"
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center">
                            <span className="text-xs font-bold text-emerald-400">{student.name?.charAt(0)}</span>
                          </div>
                          <span className="text-white text-sm">{student.name}</span>
                        </div>
                        <Eye className="w-4 h-4 text-slate-400 group-hover:text-emerald-400 transition-colors" />
                      </Link>
                    ))
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

export default Groups;
