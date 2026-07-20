import { useState, useEffect } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Trophy } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const Rankings = () => {
  const [rankings, setRankings] = useState({ scores: [], gold: null, silver: null, bronze: null });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRankings();
  }, []);

  const fetchRankings = async () => {
    try {
      const response = await axios.get(`${API}/rankings/weekly`);
      setRankings(response.data);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

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
    <div className="space-y-8 animate-fadeIn" data-testid="rankings-page">
      <div>
        <h1 className="text-2xl font-bold text-white">الترتيب الأسبوعي</h1>
        <p className="text-slate-400">نظام الحوافز - ذهبي، فضي، برونزي</p>
      </div>

      {/* Top 3 Podium */}
      <div className="grid grid-cols-3 gap-4">
        {/* Silver - 2nd */}
        <div className="flex flex-col items-center pt-8">
          {rankings.silver ? (
            <Card className={`w-full border-2 ${getRankStyle('silver')} transition-all duration-300`}>
              <CardContent className="p-6 text-center">
                <div className="w-20 h-20 mx-auto rounded-full bg-slate-400/20 flex items-center justify-center mb-4">
                  <span className="text-3xl font-bold text-slate-300">2</span>
                </div>
                <h3 className="text-xl font-bold text-white mb-2">{rankings.silver.student_name}</h3>
                <p className="text-slate-400 mb-4">{rankings.silver.total_score} نقطة</p>
                <span className={`inline-block px-4 py-2 rounded-full font-bold ${getRankBadge('silver')}`}>
                  فضي
                </span>
              </CardContent>
            </Card>
          ) : (
            <Card className="w-full border-2 border-slate-700 bg-slate-800/30">
              <CardContent className="p-6 text-center">
                <div className="w-20 h-20 mx-auto rounded-full bg-slate-700/50 flex items-center justify-center mb-4">
                  <span className="text-3xl font-bold text-slate-500">2</span>
                </div>
                <p className="text-slate-500">لا يوجد</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Gold - 1st */}
        <div className="flex flex-col items-center">
          {rankings.gold ? (
            <Card className={`w-full border-2 ${getRankStyle('gold')} transition-all duration-300`}>
              <CardContent className="p-6 text-center">
                <div className="w-24 h-24 mx-auto rounded-full bg-amber-500/20 flex items-center justify-center mb-4">
                  <Trophy className="w-12 h-12 text-amber-400" />
                </div>
                <h3 className="text-2xl font-bold text-white mb-2">{rankings.gold.student_name}</h3>
                <p className="text-slate-400 mb-4">{rankings.gold.total_score} نقطة</p>
                <span className={`inline-block px-5 py-2 rounded-full text-lg font-bold ${getRankBadge('gold')}`}>
                  ذهبي
                </span>
              </CardContent>
            </Card>
          ) : (
            <Card className="w-full border-2 border-slate-700 bg-slate-800/30">
              <CardContent className="p-6 text-center">
                <div className="w-24 h-24 mx-auto rounded-full bg-slate-700/50 flex items-center justify-center mb-4">
                  <Trophy className="w-12 h-12 text-slate-500" />
                </div>
                <p className="text-slate-500">لا يوجد</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Bronze - 3rd */}
        <div className="flex flex-col items-center pt-12">
          {rankings.bronze ? (
            <Card className={`w-full border-2 ${getRankStyle('bronze')} transition-all duration-300`}>
              <CardContent className="p-6 text-center">
                <div className="w-16 h-16 mx-auto rounded-full bg-orange-600/20 flex items-center justify-center mb-4">
                  <span className="text-2xl font-bold text-orange-400">3</span>
                </div>
                <h3 className="text-lg font-bold text-white mb-2">{rankings.bronze.student_name}</h3>
                <p className="text-slate-400 mb-4">{rankings.bronze.total_score} نقطة</p>
                <span className={`inline-block px-4 py-2 rounded-full font-bold ${getRankBadge('bronze')}`}>
                  برونزي
                </span>
              </CardContent>
            </Card>
          ) : (
            <Card className="w-full border-2 border-slate-700 bg-slate-800/30">
              <CardContent className="p-6 text-center">
                <div className="w-16 h-16 mx-auto rounded-full bg-slate-700/50 flex items-center justify-center mb-4">
                  <span className="text-2xl font-bold text-slate-500">3</span>
                </div>
                <p className="text-slate-500">لا يوجد</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Score Breakdown */}
      <Card className="glass-card border-white/10">
        <CardHeader>
          <CardTitle className="text-xl font-bold text-white">معايير التقييم</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
              <h4 className="text-lg font-bold text-emerald-400 mb-2">ورقة المتابعة (40%)</h4>
              <ul className="text-slate-400 text-sm space-y-1">
                <li>• عدد الصلوات المؤداة</li>
                <li>• وقت الجلوس مع القرآن</li>
                <li>• التسميع للأهل</li>
              </ul>
            </div>
            <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/30">
              <h4 className="text-lg font-bold text-blue-400 mb-2">التسميع للمشرف (40%)</h4>
              <ul className="text-slate-400 text-sm space-y-1">
                <li>• درجة التسميع</li>
                <li>• عدد الأخطاء</li>
                <li>• كمية الحفظ</li>
              </ul>
            </div>
            <div className="p-4 rounded-xl bg-purple-500/10 border border-purple-500/30">
              <h4 className="text-lg font-bold text-purple-400 mb-2">الحضور (20%)</h4>
              <ul className="text-slate-400 text-sm space-y-1">
                <li>• نسبة الحضور</li>
                <li>• الانضباط</li>
                <li>• المشاركة</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Full Rankings Table */}
      <Card className="glass-card border-white/10">
        <CardHeader>
          <CardTitle className="text-xl font-bold text-white">جدول الترتيب الكامل</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-slate-800/30 rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="px-6 py-4 text-right text-sm font-medium text-slate-400">#</th>
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

export default Rankings;
