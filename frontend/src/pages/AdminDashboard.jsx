import { useState, useEffect } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Users, BookOpen, Calendar, Trophy, TrendingUp } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const AdminDashboard = () => {
  const [stats, setStats] = useState({
    total_students: 0,
    total_sheikhs: 0,
    total_groups: 0,
    total_activities: 0
  });
  const [rankings, setRankings] = useState({ scores: [], gold: null, silver: null, bronze: null });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [statsRes, rankingsRes] = await Promise.all([
        axios.get(`${API}/statistics/overview`),
        axios.get(`${API}/rankings/weekly`)
      ]);
      setStats(statsRes.data);
      setRankings(rankingsRes.data);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const statCards = [
    { label: 'الطلاب', value: stats.total_students, icon: Users, color: 'emerald' },
    { label: 'الشيوخ', value: stats.total_sheikhs, icon: BookOpen, color: 'blue' },
    { label: 'المجموعات', value: stats.total_groups, icon: Users, color: 'purple' },
    { label: 'الأنشطة', value: stats.total_activities, icon: Calendar, color: 'amber' },
  ];

  const getRankStyle = (rank) => {
    switch (rank) {
      case 'gold':
        return 'border-amber-500 bg-amber-500/10 glow-gold';
      case 'silver':
        return 'border-slate-400 bg-slate-400/10 glow-silver';
      case 'bronze':
        return 'border-orange-600 bg-orange-600/10 glow-bronze';
      default:
        return 'border-slate-700 bg-slate-800/50';
    }
  };

  const getRankBadge = (rank) => {
    switch (rank) {
      case 'gold':
        return 'badge-gold';
      case 'silver':
        return 'badge-silver';
      case 'bronze':
        return 'badge-bronze';
      default:
        return 'bg-slate-700 text-slate-300';
    }
  };

  const getRankLabel = (rank) => {
    switch (rank) {
      case 'gold': return 'ذهبي';
      case 'silver': return 'فضي';
      case 'bronze': return 'برونزي';
      default: return 'مشارك';
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
    <div className="space-y-8 animate-fadeIn" data-testid="admin-dashboard">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((stat, index) => (
          <Card key={index} className="glass-card border-white/10 hover:border-emerald-500/30 transition-all duration-300">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-400 text-sm">{stat.label}</p>
                  <p className="text-3xl font-bold text-white mt-1">{stat.value}</p>
                </div>
                <div className={`w-12 h-12 rounded-xl bg-${stat.color}-500/20 flex items-center justify-center`}>
                  <stat.icon className={`w-6 h-6 text-${stat.color}-400`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Rankings Section */}
      <Card className="glass-card border-white/10">
        <CardHeader>
          <CardTitle className="text-xl font-bold text-white flex items-center gap-3">
            <Trophy className="w-6 h-6 text-amber-400" />
            الحافز الجماعي - الترتيب الأسبوعي
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Top 3 Podium */}
          <div className="grid grid-cols-3 gap-4 mb-8">
            {/* Silver - 2nd */}
            <div className="flex flex-col items-center pt-8">
              {rankings.silver && (
                <Card className={`w-full border-2 ${getRankStyle('silver')} transition-all duration-300`}>
                  <CardContent className="p-4 text-center">
                    <div className="w-16 h-16 mx-auto rounded-full bg-slate-400/20 flex items-center justify-center mb-3">
                      <span className="text-2xl font-bold text-slate-300">2</span>
                    </div>
                    <h3 className="text-lg font-bold text-white">{rankings.silver.student_name}</h3>
                    <p className="text-slate-400 text-sm">{rankings.silver.total_score} نقطة</p>
                    <span className={`inline-block mt-2 px-3 py-1 rounded-full text-xs font-bold ${getRankBadge('silver')}`}>
                      فضي
                    </span>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Gold - 1st */}
            <div className="flex flex-col items-center">
              {rankings.gold && (
                <Card className={`w-full border-2 ${getRankStyle('gold')} transition-all duration-300`}>
                  <CardContent className="p-4 text-center">
                    <div className="w-20 h-20 mx-auto rounded-full bg-amber-500/20 flex items-center justify-center mb-3">
                      <Trophy className="w-10 h-10 text-amber-400" />
                    </div>
                    <h3 className="text-xl font-bold text-white">{rankings.gold.student_name}</h3>
                    <p className="text-slate-400">{rankings.gold.total_score} نقطة</p>
                    <span className={`inline-block mt-2 px-4 py-1 rounded-full text-sm font-bold ${getRankBadge('gold')}`}>
                      ذهبي
                    </span>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Bronze - 3rd */}
            <div className="flex flex-col items-center pt-12">
              {rankings.bronze && (
                <Card className={`w-full border-2 ${getRankStyle('bronze')} transition-all duration-300`}>
                  <CardContent className="p-4 text-center">
                    <div className="w-14 h-14 mx-auto rounded-full bg-orange-600/20 flex items-center justify-center mb-3">
                      <span className="text-xl font-bold text-orange-400">3</span>
                    </div>
                    <h3 className="text-lg font-bold text-white">{rankings.bronze.student_name}</h3>
                    <p className="text-slate-400 text-sm">{rankings.bronze.total_score} نقطة</p>
                    <span className={`inline-block mt-2 px-3 py-1 rounded-full text-xs font-bold ${getRankBadge('bronze')}`}>
                      برونزي
                    </span>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>

          {/* Full Rankings Table */}
          <div className="bg-slate-800/30 rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="px-6 py-4 text-right text-sm font-medium text-slate-400">الترتيب</th>
                  <th className="px-6 py-4 text-right text-sm font-medium text-slate-400">الطالب</th>
                  <th className="px-6 py-4 text-right text-sm font-medium text-slate-400">المتابعة</th>
                  <th className="px-6 py-4 text-right text-sm font-medium text-slate-400">التسميع</th>
                  <th className="px-6 py-4 text-right text-sm font-medium text-slate-400">الحضور</th>
                  <th className="px-6 py-4 text-right text-sm font-medium text-slate-400">المجموع</th>
                  <th className="px-6 py-4 text-right text-sm font-medium text-slate-400">المركز</th>
                </tr>
              </thead>
              <tbody>
                {rankings.scores.map((score, index) => (
                  <tr key={score.student_id} className="border-b border-white/5 hover:bg-white/5">
                    <td className="px-6 py-4 text-white font-bold">{index + 1}</td>
                    <td className="px-6 py-4 text-white">{score.student_name}</td>
                    <td className="px-6 py-4 text-slate-300">{score.tracking_score}</td>
                    <td className="px-6 py-4 text-slate-300">{score.recitation_score}</td>
                    <td className="px-6 py-4 text-slate-300">{score.attendance_score}%</td>
                    <td className="px-6 py-4 text-emerald-400 font-bold">{score.total_score}</td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold ${getRankBadge(score.rank)}`}>
                        {getRankLabel(score.rank)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rankings.scores.length === 0 && (
              <div className="text-center py-12 text-slate-400">
                لا توجد بيانات للعرض
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminDashboard;
