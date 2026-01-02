import { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Link } from 'react-router-dom';
import { Trophy, Medal, Users, Eye, TrendingUp, Target, BookOpen, UserCheck } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const SheikhRankings = () => {
  const { user } = useAuth();
  const { isDark } = useTheme();
  const [data, setData] = useState({ students: [], groups: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRankings();
  }, []);

  const fetchRankings = async () => {
    try {
      const res = await axios.get(`${API}/rankings/sheikh-students`);
      setData(res.data);
    } catch (error) {
      console.error('Error fetching rankings:', error);
    } finally {
      setLoading(false);
    }
  };

  const getRankBadge = (rank) => {
    if (rank === 1) return { bg: 'bg-amber-500/20', text: 'text-amber-400', icon: '🥇' };
    if (rank === 2) return { bg: 'bg-slate-400/20', text: 'text-slate-300', icon: '🥈' };
    if (rank === 3) return { bg: 'bg-orange-500/20', text: 'text-orange-400', icon: '🥉' };
    return { bg: 'bg-slate-700/50', text: 'text-slate-400', icon: rank };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const topThree = data.students.slice(0, 3);
  const rest = data.students.slice(3);

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className={`p-6 rounded-xl ${isDark ? 'glass-card border border-white/10' : 'bg-white border border-slate-200 shadow-sm'}`}>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center">
            <Trophy className="w-6 h-6 text-amber-400" />
          </div>
          <div>
            <h1 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>ترتيب طلابي</h1>
            <p className={isDark ? 'text-slate-400' : 'text-slate-600'}>ترتيب الطلاب في مجموعاتك حسب النقاط والإنجاز</p>
          </div>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className={isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                <Users className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <p className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{data.students.length}</p>
                <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>إجمالي الطلاب</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                <Target className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <p className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{data.groups.length}</p>
                <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>المجموعات</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <p className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  {data.students.reduce((sum, s) => sum + s.total_points, 0)}
                </p>
                <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>إجمالي النقاط</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
                <BookOpen className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <p className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  {data.students.reduce((sum, s) => sum + s.total_pages, 0)}
                </p>
                <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>صفحات محفوظة</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top 3 Podium */}
      {topThree.length > 0 && (
        <Card className={isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'}>
          <CardHeader>
            <CardTitle className={`flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
              <Medal className="w-5 h-5 text-amber-400" />
              المتصدرون
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              {/* Silver - 2nd */}
              <div className="flex flex-col items-center pt-8">
                {topThree[1] && (
                  <Link to={`/student/${topThree[1].student_id}`} className="w-full">
                    <div className={`p-4 rounded-xl text-center transition-all hover:scale-105 ${
                      isDark ? 'bg-slate-400/10 border border-slate-400/30' : 'bg-slate-100 border border-slate-300'
                    }`}>
                      <div className="w-16 h-16 mx-auto rounded-full bg-slate-400/20 flex items-center justify-center mb-2">
                        <span className="text-2xl">🥈</span>
                      </div>
                      <h3 className={`font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{topThree[1].student_name}</h3>
                      <p className="text-slate-400 text-sm">{topThree[1].group_name}</p>
                      <p className="text-lg font-bold text-slate-300 mt-2">{topThree[1].total_points} نقطة</p>
                    </div>
                  </Link>
                )}
              </div>

              {/* Gold - 1st */}
              <div className="flex flex-col items-center">
                {topThree[0] && (
                  <Link to={`/student/${topThree[0].student_id}`} className="w-full">
                    <div className={`p-4 rounded-xl text-center transition-all hover:scale-105 ${
                      isDark ? 'bg-amber-500/10 border border-amber-500/30' : 'bg-amber-50 border border-amber-300'
                    }`}>
                      <div className="w-20 h-20 mx-auto rounded-full bg-amber-500/20 flex items-center justify-center mb-2">
                        <Trophy className="w-10 h-10 text-amber-400" />
                      </div>
                      <h3 className={`text-lg font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{topThree[0].student_name}</h3>
                      <p className="text-slate-400 text-sm">{topThree[0].group_name}</p>
                      <p className="text-xl font-bold text-amber-400 mt-2">{topThree[0].total_points} نقطة</p>
                    </div>
                  </Link>
                )}
              </div>

              {/* Bronze - 3rd */}
              <div className="flex flex-col items-center pt-12">
                {topThree[2] && (
                  <Link to={`/student/${topThree[2].student_id}`} className="w-full">
                    <div className={`p-4 rounded-xl text-center transition-all hover:scale-105 ${
                      isDark ? 'bg-orange-500/10 border border-orange-500/30' : 'bg-orange-50 border border-orange-300'
                    }`}>
                      <div className="w-14 h-14 mx-auto rounded-full bg-orange-500/20 flex items-center justify-center mb-2">
                        <span className="text-xl">🥉</span>
                      </div>
                      <h3 className={`font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{topThree[2].student_name}</h3>
                      <p className="text-slate-400 text-sm">{topThree[2].group_name}</p>
                      <p className="text-lg font-bold text-orange-400 mt-2">{topThree[2].total_points} نقطة</p>
                    </div>
                  </Link>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Full Rankings Table */}
      <Card className={isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'}>
        <CardHeader>
          <CardTitle className={isDark ? 'text-white' : 'text-slate-900'}>جدول الترتيب الكامل</CardTitle>
        </CardHeader>
        <CardContent>
          {data.students.length === 0 ? (
            <p className={`text-center py-8 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>لا يوجد طلاب في مجموعاتك</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className={`border-b ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
                    <th className={`px-4 py-3 text-right text-sm font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>الترتيب</th>
                    <th className={`px-4 py-3 text-right text-sm font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>الطالب</th>
                    <th className={`px-4 py-3 text-right text-sm font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>المجموعة</th>
                    <th className={`px-4 py-3 text-right text-sm font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>النقاط</th>
                    <th className={`px-4 py-3 text-right text-sm font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>ورق المتابعة</th>
                    <th className={`px-4 py-3 text-right text-sm font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>الحضور</th>
                    <th className={`px-4 py-3 text-right text-sm font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>التسميعات</th>
                    {/* <th className={`px-4 py-3 text-right text-sm font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>الصفحات</th> */}
                    <th className={`px-4 py-3 text-right text-sm font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}></th>
                  </tr>
                </thead>
                <tbody>
                  {data.students.map((student) => {
                    const badge = getRankBadge(student.rank);
                    return (
                      <tr key={student.student_id} className={`border-b ${isDark ? 'border-white/5 hover:bg-white/5' : 'border-slate-100 hover:bg-slate-50'}`}>
                        <td className="px-4 py-3">
                          <span className={`w-8 h-8 inline-flex items-center justify-center rounded-full text-sm font-bold ${badge.bg} ${badge.text}`}>
                            {badge.icon}
                          </span>
                        </td>
                        <td className={`px-4 py-3 font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>{student.student_name}</td>
                        <td className={`px-4 py-3 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>{student.group_name}</td>
                        <td className="px-4 py-3 text-emerald-400 font-bold">{student.total_points}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col">
                            <span className="text-blue-400 font-bold">{student.tracking_points || 0}</span>
                            <span className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                              ({student.tracking_sheets_count || 0} ورقة)
                            </span>
                          </div>
                        </td>
                        <td className={`px-4 py-3 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{student.attendance_rate}%</td>
                        <td className={`px-4 py-3 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{student.total_recitations}</td>
                        {/* <td className={`px-4 py-3 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{student.total_pages}</td> */}
                        {/* <td className="px-4 py-3">
                          <span className="px-2 py-1 text-xs rounded-full bg-purple-500/20 text-purple-400">
                            المستوى {student.level}
                          </span>
                        </td> */}
                        <td className="px-4 py-3">
                          <Link to={`/student/${student.student_id}`}>
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
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default SheikhRankings;