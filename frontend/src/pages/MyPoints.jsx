import { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Progress } from '../components/ui/progress';
import { Star, Trophy, Award, Target, Zap, Crown, Medal, Gift } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const MyPoints = () => {
  const { user } = useAuth();
  const [pointsData, setPointsData] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [allBadges, setAllBadges] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [pointsRes, transactionsRes, leaderboardRes, badgesRes] = await Promise.all([
        axios.get(`${API}/points/my-points`),
        axios.get(`${API}/points/transactions`),
        axios.get(`${API}/points/leaderboard`),
        axios.get(`${API}/badges/all`)
      ]);
      
      setPointsData(pointsRes.data);
      setTransactions(transactionsRes.data);
      setLeaderboard(leaderboardRes.data);
      setAllBadges(badgesRes.data);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const getLevelIcon = (level) => {
    if (level >= 10) return <Crown className="w-8 h-8 text-amber-400" />;
    if (level >= 7) return <Trophy className="w-8 h-8 text-purple-400" />;
    if (level >= 4) return <Medal className="w-8 h-8 text-blue-400" />;
    return <Star className="w-8 h-8 text-emerald-400" />;
  };

  const getLevelName = (level) => {
    const levels = {
      1: 'مبتدئ',
      2: 'متعلم',
      3: 'مجتهد',
      4: 'متقدم',
      5: 'متميز',
      6: 'حافظ',
      7: 'ماهر',
      8: 'خبير',
      9: 'أستاذ',
      10: 'عالم'
    };
    return levels[level] || 'مبتدئ';
  };

  const getCategoryColor = (category) => {
    switch (category) {
      case 'attendance': return 'text-emerald-400 bg-emerald-500/20';
      case 'recitation': return 'text-blue-400 bg-blue-500/20';
      case 'tracking': return 'text-purple-400 bg-purple-500/20';
      case 'bonus': return 'text-amber-400 bg-amber-500/20';
      default: return 'text-slate-400 bg-slate-500/20';
    }
  };

  const getCategoryLabel = (category) => {
    switch (category) {
      case 'attendance': return 'حضور';
      case 'recitation': return 'تسميع';
      case 'tracking': return 'متابعة';
      case 'bonus': return 'مكافأة';
      default: return category;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const progressToNextLevel = pointsData ? 
    ((pointsData.total_points / pointsData.next_level_points) * 100) : 0;

  const myRankIndex = leaderboard.findIndex(l => l.student_id === user?.id);

  return (
    <div className="space-y-8 animate-fadeIn" data-testid="my-points-page">
      <div>
        <h1 className="text-2xl font-bold text-white">نقاطي وشاراتي</h1>
        <p className="text-slate-400">تابع إنجازاتك ومكافآتك</p>
      </div>

      {/* Points Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Level Card */}
        <Card className="glass-card border-white/10 lg:col-span-1">
          <CardContent className="p-6 text-center">
            <div className="w-20 h-20 mx-auto rounded-full bg-emerald-500/20 flex items-center justify-center mb-4 animate-pulse-glow">
              {getLevelIcon(pointsData?.level || 1)}
            </div>
            <h2 className="text-3xl font-bold text-white mb-1">المستوى {pointsData?.level || 1}</h2>
            <p className="text-emerald-400 text-lg font-medium mb-4">{getLevelName(pointsData?.level || 1)}</p>
            
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">النقاط الحالية</span>
                <span className="text-white font-bold">{pointsData?.total_points || 0}</span>
              </div>
              <Progress value={Math.min(progressToNextLevel, 100)} className="h-3 bg-slate-700" />
              <p className="text-slate-500 text-xs">
                {pointsData?.next_level_points - pointsData?.total_points} نقطة للمستوى التالي
              </p>
            </div>

            {myRankIndex >= 0 && (
              <div className="mt-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30">
                <p className="text-amber-400 text-sm">ترتيبك في المركز</p>
                <p className="text-2xl font-bold text-white">#{myRankIndex + 1}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Points Breakdown */}
        <Card className="glass-card border-white/10 lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-xl font-bold text-white">تفاصيل النقاط</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-center">
                <Award className="w-8 h-8 mx-auto text-emerald-400 mb-2" />
                <p className="text-2xl font-bold text-white">{pointsData?.attendance_points || 0}</p>
                <p className="text-emerald-400 text-sm">نقاط الحضور</p>
              </div>
              <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/30 text-center">
                <Target className="w-8 h-8 mx-auto text-blue-400 mb-2" />
                <p className="text-2xl font-bold text-white">{pointsData?.recitation_points || 0}</p>
                <p className="text-blue-400 text-sm">نقاط التسميع</p>
              </div>
              <div className="p-4 rounded-xl bg-purple-500/10 border border-purple-500/30 text-center">
                <Zap className="w-8 h-8 mx-auto text-purple-400 mb-2" />
                <p className="text-2xl font-bold text-white">{pointsData?.tracking_points || 0}</p>
                <p className="text-purple-400 text-sm">نقاط المتابعة</p>
              </div>
            </div>

            {/* Recent Transactions */}
            <h4 className="text-lg font-bold text-white mb-3">آخر النقاط المكتسبة</h4>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {transactions.length === 0 ? (
                <p className="text-slate-400 text-center py-4">لا توجد نقاط بعد</p>
              ) : (
                transactions.slice(0, 5).map((tx) => (
                  <div
                    key={tx.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50"
                  >
                    <div className="flex items-center gap-3">
                      <span className={`px-2 py-1 rounded-lg text-xs font-bold ${getCategoryColor(tx.category)}`}>
                        {getCategoryLabel(tx.category)}
                      </span>
                      <span className="text-slate-300 text-sm">{tx.description}</span>
                    </div>
                    <span className="text-emerald-400 font-bold">+{tx.points}</span>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Badges */}
      <Card className="glass-card border-white/10">
        <CardHeader>
          <CardTitle className="text-xl font-bold text-white flex items-center gap-3">
            <Gift className="w-6 h-6 text-amber-400" />
            الشارات
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {allBadges.map((badge) => {
              const earned = pointsData?.badges?.includes(badge.id);
              return (
                <div
                  key={badge.id}
                  className={`p-4 rounded-xl text-center transition-all ${
                    earned 
                      ? 'bg-emerald-500/10 border border-emerald-500/30' 
                      : 'bg-slate-800/30 border border-slate-700/30 opacity-50'
                  }`}
                >
                  <span className="text-4xl mb-2 block">{badge.icon}</span>
                  <h4 className={`font-bold text-sm ${earned ? 'text-white' : 'text-slate-500'}`}>
                    {badge.name}
                  </h4>
                  <p className={`text-xs mt-1 ${earned ? 'text-slate-400' : 'text-slate-600'}`}>
                    {badge.description}
                  </p>
                  {!earned && badge.points_required > 0 && (
                    <p className="text-xs text-amber-500 mt-2">{badge.points_required} نقطة</p>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Leaderboard */}
      <Card className="glass-card border-white/10">
        <CardHeader>
          <CardTitle className="text-xl font-bold text-white flex items-center gap-3">
            <Trophy className="w-6 h-6 text-amber-400" />
            لوحة المتصدرين
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {leaderboard.slice(0, 10).map((entry, index) => {
              const isMe = entry.student_id === user?.id;
              return (
                <div
                  key={entry.student_id}
                  className={`flex items-center justify-between p-4 rounded-xl transition-all ${
                    isMe 
                      ? 'bg-emerald-500/20 border border-emerald-500/30' 
                      : 'bg-slate-800/50 hover:bg-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
                      index === 0 ? 'bg-amber-500/20 text-amber-400' :
                      index === 1 ? 'bg-slate-400/20 text-slate-300' :
                      index === 2 ? 'bg-orange-500/20 text-orange-400' :
                      'bg-slate-700 text-slate-400'
                    }`}>
                      {index + 1}
                    </div>
                    <div>
                      <p className={`font-bold ${isMe ? 'text-emerald-400' : 'text-white'}`}>
                        {entry.student_name} {isMe && '(أنت)'}
                      </p>
                      <p className="text-slate-400 text-sm">المستوى {entry.level || 1}</p>
                    </div>
                  </div>
                  <div className="text-left">
                    <p className="text-xl font-bold text-white">{entry.total_points}</p>
                    <p className="text-slate-500 text-xs">نقطة</p>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default MyPoints;
