import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { toast } from 'sonner';
import { Users, GraduationCap, Shield, Eye, Key, Search } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const UsersPage = () => {
  const { user: currentUser } = useAuth();
  const { isDark } = useTheme();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

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
      case 'sheikh': return 'مشرف';
      case 'student': return 'طالب';
      default: return role;
    }
  };

  const openPasswordDialog = (user) => {
    setSelectedUser(user);
    setNewPassword('');
    setPasswordDialogOpen(true);
  };

  const handleResetPassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      toast.error('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
      return;
    }

    setSubmitting(true);
    try {
      await axios.post(`${API}/admin/reset-password`, {
        email: selectedUser.email,
        new_password: newPassword
      });
      toast.success(`تم تغيير كلمة المرور للمستخدم ${selectedUser.name} بنجاح`);
      setPasswordDialogOpen(false);
      setNewPassword('');
      setSelectedUser(null);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في تغيير كلمة المرور');
    } finally {
      setSubmitting(false);
    }
  };

  // Filter by role and search term
  const filteredUsers = users
    .filter(u => filter === 'all' || u.role === filter)
    .filter(u => 
      searchTerm === '' || 
      u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase())
    );

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
    <div className="space-y-6 animate-fadeIn" data-testid="users-page">
      <div className={`p-6 rounded-xl ${isDark ? 'glass-card border border-white/10' : 'bg-white border border-slate-200 shadow-sm'}`}>
        <h1 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>المستخدمين</h1>
        <p className={isDark ? 'text-slate-400' : 'text-slate-600'}>إدارة جميع مستخدمي النظام</p>
      </div>

      {/* Search & Filter */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className={`absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`} />
          <Input
            placeholder="بحث بالاسم أو البريد..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={`pr-10 ${isDark ? 'bg-slate-800 border-white/10 text-white' : ''}`}
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {[
            { key: 'all', label: 'الكل' },
            { key: 'student', label: 'الطلاب' },
            { key: 'sheikh', label: 'المشرفين' },
            { key: 'admin', label: 'المدراء' },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`px-4 py-2 rounded-lg transition-all ${
                filter === tab.key
                  ? 'bg-emerald-500 text-white'
                  : isDark ? 'bg-slate-800 text-slate-400 hover:bg-slate-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
              data-testid={`filter-${tab.key}`}
            >
              {tab.label} ({counts[tab.key]})
            </button>
          ))}
        </div>
      </div>

      {/* Users List */}
      <Card className={isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'}>
        <CardContent className="p-0">
          <div className={`divide-y ${isDark ? 'divide-white/5' : 'divide-slate-100'}`}>
            {filteredUsers.map((user) => (
              <div
                key={user.id}
                className={`p-4 flex items-center justify-between ${isDark ? 'hover:bg-white/5' : 'hover:bg-slate-50'} transition-all`}
              >
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center ${isDark ? 'bg-slate-800' : 'bg-slate-100'}`}>
                    <span className="text-lg font-bold text-emerald-400">
                      {user.name.charAt(0)}
                    </span>
                  </div>
                  <div>
                    {user.role === 'student' && (currentUser?.role === 'admin' || currentUser?.role === 'sheikh') ? (
                      <Link to={`/student/${user.id}`} className={`font-medium hover:text-emerald-400 transition-colors flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                        {user.name}
                        <Eye className="w-4 h-4 opacity-50" />
                      </Link>
                    ) : (
                      <h3 className={`font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>{user.name}</h3>
                    )}
                    <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>{user.email}</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  {/* زر تغيير كلمة المرور - للمدير فقط */}
                  {currentUser?.role === 'admin' && user.role !== 'admin' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openPasswordDialog(user)}
                      className="text-amber-400 hover:text-amber-300 hover:bg-amber-500/10"
                      title="تغيير كلمة المرور"
                    >
                      <Key className="w-4 h-4" />
                    </Button>
                  )}
                  
                  <Badge className={`${getRoleBadge(user.role)} border flex items-center gap-1`}>
                    {getRoleIcon(user.role)}
                    {getRoleLabel(user.role)}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
          
          {filteredUsers.length === 0 && (
            <div className={`p-12 text-center ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
              لا يوجد مستخدمين
            </div>
          )}
        </CardContent>
      </Card>

      {/* Password Reset Dialog */}
      <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
        <DialogContent className={isDark ? 'bg-slate-900 border-white/10' : 'bg-white'}>
          <DialogHeader>
            <DialogTitle className={isDark ? 'text-white' : 'text-slate-900'}>
              تغيير كلمة المرور
            </DialogTitle>
          </DialogHeader>
          
          {selectedUser && (
            <div className="space-y-4">
              <div className={`p-4 rounded-lg ${isDark ? 'bg-slate-800/50' : 'bg-slate-50'}`}>
                <p className={isDark ? 'text-slate-400' : 'text-slate-600'}>المستخدم:</p>
                <p className={`font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{selectedUser.name}</p>
                <p className={`text-sm ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>{selectedUser.email}</p>
              </div>
              
              <div>
                <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>كلمة المرور الجديدة</Label>
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="أدخل كلمة المرور الجديدة (6 أحرف على الأقل)"
                  className={isDark ? 'bg-slate-800 border-white/10 text-white' : ''}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setPasswordDialogOpen(false)}>إلغاء</Button>
            <Button 
              onClick={handleResetPassword} 
              disabled={submitting}
              className="bg-amber-600 hover:bg-amber-700"
            >
              {submitting ? 'جاري التغيير...' : 'تغيير كلمة المرور'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default UsersPage;
