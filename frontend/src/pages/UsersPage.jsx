import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Users, GraduationCap, Shield, Eye } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const UsersPage = () => {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const response = await axios.get(`${API}/users`);
      setUsers(response.data);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const getRoleIcon = (role) => {
    switch (role) {
      case 'admin':
        return <Shield className="w-4 h-4" />;
      case 'sheikh':
        return <Users className="w-4 h-4" />;
      case 'student':
        return <GraduationCap className="w-4 h-4" />;
      default:
        return null;
    }
  };

  const getRoleBadge = (role) => {
    switch (role) {
      case 'admin':
        return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
      case 'sheikh':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'student':
        return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
      default:
        return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
    }
  };

  const getRoleLabel = (role) => {
    switch (role) {
      case 'admin': return 'مدير';
      case 'sheikh': return 'شيخ';
      case 'student': return 'طالب';
      default: return role;
    }
  };

  const filteredUsers = filter === 'all' 
    ? users 
    : users.filter(u => u.role === filter);

  const counts = {
    all: users.length,
    admin: users.filter(u => u.role === 'admin').length,
    sheikh: users.filter(u => u.role === 'sheikh').length,
    student: users.filter(u => u.role === 'student').length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fadeIn" data-testid="users-page">
      <div>
        <h1 className="text-2xl font-bold text-white">المستخدمين</h1>
        <p className="text-slate-400">إدارة جميع مستخدمي النظام</p>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 flex-wrap">
        {[
          { key: 'all', label: 'الكل' },
          { key: 'student', label: 'الطلاب' },
          { key: 'sheikh', label: 'الشيوخ' },
          { key: 'admin', label: 'المدراء' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`px-4 py-2 rounded-lg transition-all ${
              filter === tab.key
                ? 'bg-emerald-500 text-white'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
            data-testid={`filter-${tab.key}`}
          >
            {tab.label} ({counts[tab.key]})
          </button>
        ))}
      </div>

      {/* Users List */}
      <Card className="glass-card border-white/10">
        <CardContent className="p-0">
          <div className="divide-y divide-white/5">
            {filteredUsers.map((user) => (
              <div
                key={user.id}
                className="p-4 flex items-center justify-between hover:bg-white/5 transition-all"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center">
                    <span className="text-lg font-bold text-emerald-400">
                      {user.name.charAt(0)}
                    </span>
                  </div>
                  <div>
                    {user.role === 'student' && (currentUser?.role === 'admin' || currentUser?.role === 'sheikh') ? (
                      <Link to={`/student/${user.id}`} className="text-white font-medium hover:text-emerald-400 transition-colors flex items-center gap-2">
                        {user.name}
                        <Eye className="w-4 h-4 opacity-50" />
                      </Link>
                    ) : (
                      <h3 className="text-white font-medium">{user.name}</h3>
                    )}
                    <p className="text-slate-400 text-sm">{user.email}</p>
                  </div>
                </div>
                
                <Badge className={`${getRoleBadge(user.role)} border flex items-center gap-1`}>
                  {getRoleIcon(user.role)}
                  {getRoleLabel(user.role)}
                </Badge>
              </div>
            ))}
          </div>
          
          {filteredUsers.length === 0 && (
            <div className="p-12 text-center text-slate-400">
              لا يوجد مستخدمين
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default UsersPage;
