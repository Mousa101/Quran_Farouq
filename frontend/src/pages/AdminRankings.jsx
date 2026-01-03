import { useState, useEffect } from 'react';
import axios from 'axios';
import { useTheme } from '../context/ThemeContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Link } from 'react-router-dom';
import { Trophy, Users, UserCheck, BookOpen, Filter, Eye, TrendingUp, Medal } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const AdminRankings = () => {
  const { isDark } = useTheme();
  const [data, setData] = useState({ type: '', data: [] });
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('groups');

  useEffect(() => {
    fetchRankings(activeFilter);
  }, [activeFilter]);

  const fetchRankings = async (filterType) => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/rankings/admin?filter_type=${filterType}`);
      setData(res.data);
    } catch (error) {
      console.error('Error fetching rankings:', error);
    } finally {
      setLoading(false);
    }
  };

  const filters = [
    { id: 'groups', label: 'المجموعات', icon: Users },
    { id: 'students', label: 'الأفراد', icon: Trophy },
    { id: 'attendance', label: 'الحضور', icon: UserCheck },
    { id: 'recitations', label: 'التسميع', icon: BookOpen },
  ];

  const getRankBadge = (rank) => {
    if (rank === 1) return { bg: 'bg-amber-500/20', text: 'text-amber-400', icon: '🥇' };
    if (rank === 2) return { bg: 'bg-slate-400/20', text: 'text-slate-300', icon: '🥈' };
    if (rank === 3) return { bg: 'bg-orange-500/20', text: 'text-orange-400', icon: '🥉' };
    return { bg: 'bg-slate-700/50', text: 'text-slate-400', icon: rank };
  };

  const renderGroupsTable = () => (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className={`border-b ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
            <th className={`px-4 py-3 text-right text-sm font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>الترتيب</th>
            <th className={`px-4 py-3 text-right text-sm font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>المجموعة</th>
            <th className={`px-4 py-3 text-right text-sm font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>المعلم</th>
            <th className={`px-4 py-3 text-right text-sm font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>الطلاب</th>
            <th className={`px-4 py-3 text-right text-sm font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>إجمالي النقاط</th>
            <th className={`px-4 py-3 text-right text-sm font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>المتوسط</th>
            <th className={`px-4 py-3 text-right text-sm font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>الحضور</th>
          </tr>
        </thead>
        <tbody>
          {data.data.map((item) => {
            const badge = getRankBadge(item.rank);
            return (
              <tr key={item.group_id} className={`border-b ${isDark ? 'border-white/5 hover:bg-white/5' : 'border-slate-100 hover:bg-slate-50'}`}>
                <td className="px-4 py-3">
                  <span className={`w-8 h-8 inline-flex items-center justify-center rounded-full text-sm font-bold ${badge.bg} ${badge.text}`}>
                    {badge.icon}
                  </span>
                </td>
                <td className={`px-4 py-3 font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>{item.group_name}</td>
                <td className={`px-4 py-3 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>{item.sheikh_name}</td>
                <td className={`px-4 py-3 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{item.student_count}</td>
                <td className="px-4 py-3 text-emerald-400 font-bold">{item.total_points}</td>
                <td className={`px-4 py-3 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{item.avg_points}</td>
                <td className={`px-4 py-3 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{item.attendance_rate}%</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  const renderStudentsTable = () => (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className={`border-b ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
            <th className={`px-4 py-3 text-right text-sm font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>الترتيب</th>
            <th className={`px-4 py-3 text-right text-sm font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>الطالب</th>
            <th className={`px-4 py-3 text-right text-sm font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>المجموعة</th>
            <th className={`px-4 py-3 text-right text-sm font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>النقاط</th>
            <th className={`px-4 py-3 text-right text-sm font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>المركز</th>
            <th className={`px-4 py-3 text-right text-sm font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}></th>
          </tr>
        </thead>
        <tbody>
          {data.data.map((item) => {
            const badge = getRankBadge(item.rank);
            return (
              <tr key={item.student_id} className={`border-b ${isDark ? 'border-white/5 hover:bg-white/5' : 'border-slate-100 hover:bg-slate-50'}`}>
                <td className="px-4 py-3">
                  <span className={`w-8 h-8 inline-flex items-center justify-center rounded-full text-sm font-bold ${badge.bg} ${badge.text}`}>
                    {badge.icon}
                  </span>
                </td>
                <td className={`px-4 py-3 font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>{item.student_name}</td>
                <td className={`px-4 py-3 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>{item.group_name}</td>
                <td className="px-4 py-3 text-emerald-400 font-bold">{item.total_points}</td>
                <td className="px-4 py-3">
                  <span className="px-2 py-1 text-xs rounded-full bg-purple-500/20 text-purple-400">
                    المركز {item.level}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <Link to={`/student/${item.student_id}`}>
                    <button className="text-emerald-400 hover:text-emerald-300">
                      <Eye className="w-4 h-4" />
                    </button>
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  const renderAttendanceTable = () => (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className={`border-b ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
            <th className={`px-4 py-3 text-right text-sm font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>الترتيب</th>
            <th className={`px-4 py-3 text-right text-sm font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>الطالب</th>
            <th className={`px-4 py-3 text-right text-sm font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>المجموعة</th>
            <th className={`px-4 py-3 text-right text-sm font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>الأيام</th>
            <th className={`px-4 py-3 text-right text-sm font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>حاضر</th>
            <th className={`px-4 py-3 text-right text-sm font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>معذور</th>
            <th className={`px-4 py-3 text-right text-sm font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>غائب</th>
            <th className={`px-4 py-3 text-right text-sm font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>النسبة</th>
            <th className={`px-4 py-3 text-right text-sm font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}></th>
          </tr>
        </thead>
        <tbody>
          {data.data.map((item) => {
            const badge = getRankBadge(item.rank);
            return (
              <tr key={item.student_id} className={`border-b ${isDark ? 'border-white/5 hover:bg-white/5' : 'border-slate-100 hover:bg-slate-50'}`}>
                <td className="px-4 py-3">
                  <span className={`w-8 h-8 inline-flex items-center justify-center rounded-full text-sm font-bold ${badge.bg} ${badge.text}`}>
                    {badge.icon}
                  </span>
                </td>
                <td className={`px-4 py-3 font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>{item.student_name}</td>
                <td className={`px-4 py-3 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>{item.group_name}</td>
                <td className={`px-4 py-3 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{item.total_days}</td>
                <td className="px-4 py-3 text-emerald-400">{item.present_days}</td>
                <td className="px-4 py-3 text-amber-400">{item.excused_days}</td>
                <td className="px-4 py-3 text-red-400">{item.absent_days}</td>
                <td className={`px-4 py-3 font-bold ${item.attendance_rate >= 80 ? 'text-emerald-400' : item.attendance_rate >= 60 ? 'text-amber-400' : 'text-red-400'}`}>
                  {item.attendance_rate}%
                </td>
                <td className="px-4 py-3">
                  <Link to={`/student/${item.student_id}`}>
                    <button className="text-emerald-400 hover:text-emerald-300">
                      <Eye className="w-4 h-4" />
                    </button>
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  const renderRecitationsTable = () => (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className={`border-b ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
            <th className={`px-4 py-3 text-right text-sm font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>الترتيب</th>
            <th className={`px-4 py-3 text-right text-sm font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>الطالب</th>
            <th className={`px-4 py-3 text-right text-sm font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>المجموعة</th>
            <th className={`px-4 py-3 text-right text-sm font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>التسميعات</th>
            <th className={`px-4 py-3 text-right text-sm font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>حفظ جديد</th>
            <th className={`px-4 py-3 text-right text-sm font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>مراجعة</th>
            <th className={`px-4 py-3 text-right text-sm font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>الصفحات</th>
            <th className={`px-4 py-3 text-right text-sm font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>النقاط</th>
            <th className={`px-4 py-3 text-right text-sm font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}></th>
          </tr>
        </thead>
        <tbody>
          {data.data.map((item) => {
            const badge = getRankBadge(item.rank);
            return (
              <tr key={item.student_id} className={`border-b ${isDark ? 'border-white/5 hover:bg-white/5' : 'border-slate-100 hover:bg-slate-50'}`}>
                <td className="px-4 py-3">
                  <span className={`w-8 h-8 inline-flex items-center justify-center rounded-full text-sm font-bold ${badge.bg} ${badge.text}`}>
                    {badge.icon}
                  </span>
                </td>
                <td className={`px-4 py-3 font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>{item.student_name}</td>
                <td className={`px-4 py-3 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>{item.group_name}</td>
                <td className={`px-4 py-3 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{item.total_recitations}</td>
                <td className="px-4 py-3 text-emerald-400">{item.new_memorization}</td>
                <td className="px-4 py-3 text-blue-400">{item.reviews}</td>
                <td className="px-4 py-3 text-purple-400 font-bold">{item.total_pages}</td>
                <td className="px-4 py-3 text-amber-400 font-bold">{item.total_points}</td>
                <td className="px-4 py-3">
                  <Link to={`/student/${item.student_id}`}>
                    <button className="text-emerald-400 hover:text-emerald-300">
                      <Eye className="w-4 h-4" />
                    </button>
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  const renderTable = () => {
    switch (data.type) {
      case 'groups': return renderGroupsTable();
      case 'students': return renderStudentsTable();
      case 'attendance': return renderAttendanceTable();
      case 'recitations': return renderRecitationsTable();
      default: return null;
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className={`p-6 rounded-xl ${isDark ? 'glass-card border border-white/10' : 'bg-white border border-slate-200 shadow-sm'}`}>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center">
            <Trophy className="w-6 h-6 text-amber-400" />
          </div>
          <div>
            <h1 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>الترتيب والإحصائيات</h1>
            <p className={isDark ? 'text-slate-400' : 'text-slate-600'}>عرض الترتيب حسب المجموعات والأفراد والحضور والتسميع</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <Card className={isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'}>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className={`w-5 h-5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`} />
            <span className={`text-sm font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>فلتر:</span>
            {filters.map((filter) => (
              <Button
                key={filter.id}
                variant={activeFilter === filter.id ? 'default' : 'outline'}
                size="sm"
                onClick={() => setActiveFilter(filter.id)}
                className={activeFilter === filter.id 
                  ? 'bg-emerald-600 hover:bg-emerald-700' 
                  : isDark 
                    ? 'border-white/10 hover:bg-white/5' 
                    : ''
                }
              >
                <filter.icon className="w-4 h-4 ml-2" />
                {filter.label}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Top 3 for Groups */}
      {data.type === 'groups' && data.data.length >= 3 && (
        <div className="grid grid-cols-3 gap-4">
          {/* Silver - 2nd */}
          <div className="flex flex-col items-center pt-8">
            <Card className={`w-full ${isDark ? 'bg-slate-400/10 border-slate-400/30' : 'bg-slate-100 border-slate-300'} border`}>
              <CardContent className="p-4 text-center">
                <div className="w-14 h-14 mx-auto rounded-full bg-slate-400/20 flex items-center justify-center mb-2">
                  <span className="text-2xl">🥈</span>
                </div>
                <h3 className={`font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{data.data[1]?.group_name}</h3>
                <p className="text-slate-400 text-sm">{data.data[1]?.sheikh_name}</p>
                <p className="text-lg font-bold text-slate-300 mt-2">{data.data[1]?.total_points} نقطة</p>
              </CardContent>
            </Card>
          </div>

          {/* Gold - 1st */}
          <div className="flex flex-col items-center">
            <Card className={`w-full ${isDark ? 'bg-amber-500/10 border-amber-500/30' : 'bg-amber-50 border-amber-300'} border`}>
              <CardContent className="p-4 text-center">
                <div className="w-16 h-16 mx-auto rounded-full bg-amber-500/20 flex items-center justify-center mb-2">
                  <Trophy className="w-8 h-8 text-amber-400" />
                </div>
                <h3 className={`font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{data.data[0]?.group_name}</h3>
                <p className="text-slate-400 text-sm">{data.data[0]?.sheikh_name}</p>
                <p className="text-xl font-bold text-amber-400 mt-2">{data.data[0]?.total_points} نقطة</p>
              </CardContent>
            </Card>
          </div>

          {/* Bronze - 3rd */}
          <div className="flex flex-col items-center pt-12">
            <Card className={`w-full ${isDark ? 'bg-orange-500/10 border-orange-500/30' : 'bg-orange-50 border-orange-300'} border`}>
              <CardContent className="p-4 text-center">
                <div className="w-12 h-12 mx-auto rounded-full bg-orange-500/20 flex items-center justify-center mb-2">
                  <span className="text-xl">🥉</span>
                </div>
                <h3 className={`font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{data.data[2]?.group_name}</h3>
                <p className="text-slate-400 text-sm">{data.data[2]?.sheikh_name}</p>
                <p className="text-lg font-bold text-orange-400 mt-2">{data.data[2]?.total_points} نقطة</p>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Rankings Table */}
      <Card className={isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'}>
        <CardHeader>
          <CardTitle className={`flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
            <Medal className="w-5 h-5 text-amber-400" />
            جدول الترتيب - {filters.find(f => f.id === activeFilter)?.label}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : data.data.length === 0 ? (
            <p className={`text-center py-8 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>لا توجد بيانات للعرض</p>
          ) : (
            renderTable()
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminRankings;
