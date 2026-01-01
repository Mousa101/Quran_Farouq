import { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Progress } from '../components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { 
  Star, Trophy, Award, Target, Zap, Crown, Medal, Gift,
  BookMarked, Hand, Sunrise, Moon, Clock, Users, CheckCircle, Sparkles
} from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const MyPoints = () => {
  const { user } = useAuth();
  const { isDark } = useTheme();
  const [pointsData, setPointsData] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [weeklyBadges, setWeeklyBadges] = useState({ current_week_badges: [], total_badges_count: 0 });
  const [studentStats, setStudentStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [pointsRes, transactionsRes, leaderboardRes, badgesRes, statsRes] = await Promise.all([
        axios.get(`${API}/points/my-points`),
        axios.get(`${API}/points/transactions`),
        axios.get(`${API}/points/leaderboard`),
        axios.get(`${API}/badges/student/${user?.id}`).catch(() => ({ data: { current_week_badges: [], total_badges_count: 0 } })),
        axios.get(`${API}/statistics/student/${user?.id}`)
      ]);
      
      setPointsData(pointsRes.data);
      setTransactions(transactionsRes.data);
      setLeaderboard(leaderboardRes.data);
      setWeeklyBadges(badgesRes.data);
      setStudentStats(statsRes.data);
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
      case 'interaction': return 'text-pink-400 bg-pink-500/20';
      case 'admin_bonus': return 'text-amber-400 bg-amber-500/20';
      case 'bonus': return 'text-amber-400 bg-amber-500/20';
      default: return 'text-slate-400 bg-slate-500/20';
    }
  };

  const getCategoryLabel = (category) => {
    switch (category) {
      case 'attendance': return 'حضور';
      case 'recitation': return 'تسميع';
      case 'tracking': return 'متابعة';
      case 'interaction': return 'تفاعل';
      case 'admin_bonus': return 'تميز';
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

  // الحد الأقصى للفصل 1000 نقطة
  const maxPoints = 1000;
  const progressToMax = pointsData ? Math.min((pointsData.total_points / maxPoints) * 100, 100) : 0;
  const myRankIndex = leaderboard.findIndex(l => l.student_id === user?.id);

  // الشارات الأسبوعية المتاحة
  const availableBadges = [
    { id: 'worshipper', name: 'العابد', icon: '🏅', description: 'إتمام ورق المتابعة 90%+' },
    { id: 'interactive', name: 'المتفاعل', icon: '⭐', description: 'يمنحها المعلم' },
    { id: 'committed', name: 'الملتزم', icon: '📅', description: 'حضور كل الدروس' },
    { id: 'memorizer', name: 'الحافظ', icon: '📖', description: 'تسميع في كل درس' }
  ];

  return (
    <div className="space-y-6 animate-fadeIn" data-testid="my-points-page">
      <div>
        <h1 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>نقاطي وشاراتي</h1>
        <p className={isDark ? 'text-slate-400' : 'text-slate-600'}>تابع إنجازاتك ومكافآتك (الحد الأقصى: 1000 نقطة في الفصل)</p>
      </div>

      {/* Points Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Level Card */}
        <Card className={`${isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'} lg:col-span-1`}>
          <CardContent className="p-6 text-center">
            <div className="w-20 h-20 mx-auto rounded-full bg-emerald-500/20 flex items-center justify-center mb-4 animate-pulse-glow">
              {getLevelIcon(pointsData?.level || 1)}
            </div>
            <h2 className={`text-3xl font-bold ${isDark ? 'text-white' : 'text-slate-900'} mb-1`}>المستوى {pointsData?.level || 1}</h2>
            <p className="text-emerald-400 text-lg font-medium mb-4">{getLevelName(pointsData?.level || 1)}</p>
            
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className={isDark ? 'text-slate-400' : 'text-slate-600'}>النقاط الحالية</span>
                <span className={`font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{pointsData?.total_points || 0} / {maxPoints}</span>
              </div>
              <Progress value={progressToMax} className="h-3 bg-slate-700" />
              <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                {Math.max(0, maxPoints - (pointsData?.total_points || 0))} نقطة متبقية للحد الأقصى
              </p>
            </div>

            {myRankIndex >= 0 && (
              <div className="mt-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30">
                <p className="text-amber-400 text-sm">ترتيبك في المركز</p>
                <p className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>#{myRankIndex + 1}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Points Breakdown */}
        <Card className={`${isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'} lg:col-span-2`}>
          <CardHeader>
            <CardTitle className={`text-xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>تفاصيل النقاط</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-center">
                <CheckCircle className="w-6 h-6 mx-auto text-emerald-400 mb-1" />
                <p className={`text-xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{pointsData?.attendance_points || 0}</p>
                <p className="text-emerald-400 text-xs">حضور</p>
                <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>10/يوم</p>
              </div>
              <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/30 text-center">
                <Target className="w-6 h-6 mx-auto text-blue-400 mb-1" />
                <p className={`text-xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{pointsData?.recitation_points || 0}</p>
                <p className="text-blue-400 text-xs">تسميع</p>
                <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>10/تسميع</p>
              </div>
              <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/30 text-center">
                <Zap className="w-6 h-6 mx-auto text-purple-400 mb-1" />
                <p className={`text-xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{pointsData?.tracking_points || 0}</p>
                <p className="text-purple-400 text-xs">متابعة</p>
                <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>100/أسبوع</p>
              </div>
              <div className="p-3 rounded-xl bg-pink-500/10 border border-pink-500/30 text-center">
                <Sparkles className="w-6 h-6 mx-auto text-pink-400 mb-1" />
                <p className={`text-xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{pointsData?.interaction_points || 0}</p>
                <p className="text-pink-400 text-xs">تفاعل</p>
                <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>10/مرة</p>
              </div>
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-center">
                <Crown className="w-6 h-6 mx-auto text-amber-400 mb-1" />
                <p className={`text-xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{pointsData?.admin_bonus_points || 0}</p>
                <p className="text-amber-400 text-xs">تميز</p>
                <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>50/أسبوع</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Weekly Badges */}
      <Card className={isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className={`text-xl font-bold ${isDark ? 'text-white' : 'text-slate-900'} flex items-center gap-3`}>
              <Gift className="w-6 h-6 text-amber-400" />
              الشارات الأسبوعية
            </CardTitle>
            <div className="text-left">
              <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>إجمالي الشارات</p>
              <p className="text-2xl font-bold text-amber-400">{weeklyBadges.total_badges_count || 0}</p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className={`text-sm mb-4 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
            الشارات تُمنح أسبوعياً وتُسحب في بداية كل أسبوع جديد - حاول الحصول عليها كل أسبوع!
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {availableBadges.map((badge) => {
              const earned = weeklyBadges.current_week_badges?.some(b => b.badge_id === badge.id);
              return (
                <div
                  key={badge.id}
                  className={`p-4 rounded-xl text-center transition-all ${
                    earned 
                      ? 'bg-emerald-500/10 border-2 border-emerald-500/50 shadow-lg shadow-emerald-500/20' 
                      : `${isDark ? 'bg-slate-800/30 border border-slate-700/30' : 'bg-slate-50 border border-slate-200'} opacity-60`
                  }`}
                >
                  <span className="text-4xl mb-2 block">{badge.icon}</span>
                  <h4 className={`font-bold text-sm ${earned ? 'text-emerald-400' : isDark ? 'text-slate-500' : 'text-slate-600'}`}>
                    {badge.name}
                  </h4>
                  <p className={`text-xs mt-1 ${earned ? (isDark ? 'text-slate-400' : 'text-slate-600') : (isDark ? 'text-slate-600' : 'text-slate-500')}`}>
                    {badge.description}
                  </p>
                  {earned && (
                    <p className="text-emerald-400 text-xs mt-2 font-bold">✓ حصلت عليها!</p>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Recent Transactions */}
      <Card className={isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'}>
        <CardHeader>
          <CardTitle className={`text-xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>آخر النقاط المكتسبة</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {transactions.length === 0 ? (
              <p className={`text-center py-8 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>لا توجد نقاط بعد</p>
            ) : (
              transactions.slice(0, 10).map((tx) => (
                <div
                  key={tx.id}
                  className={`flex items-center justify-between p-3 rounded-lg ${isDark ? 'bg-slate-800/50 hover:bg-slate-800' : 'bg-slate-50 hover:bg-slate-100'} transition-colors`}
                >
                  <div className="flex items-center gap-3">
                    <span className={`px-2 py-1 rounded-lg text-xs font-bold ${getCategoryColor(tx.category)}`}>
                      {getCategoryLabel(tx.category)}
                    </span>
                    <span className={`text-sm ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{tx.description}</span>
                  </div>
                  <span className="text-emerald-400 font-bold">+{tx.points}</span>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Leaderboard */}
      <Card className={isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'}>
        <CardHeader>
          <CardTitle className={`text-xl font-bold ${isDark ? 'text-white' : 'text-slate-900'} flex items-center gap-3`}>
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
                      : isDark ? 'bg-slate-800/50 hover:bg-slate-800' : 'bg-slate-50 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
                      index === 0 ? 'bg-amber-500/20 text-amber-400' :
                      index === 1 ? 'bg-slate-400/20 text-slate-300' :
                      index === 2 ? 'bg-orange-500/20 text-orange-400' :
                      isDark ? 'bg-slate-700 text-slate-400' : 'bg-slate-200 text-slate-500'
                    }`}>
                      {index + 1}
                    </div>
                    <div>
                      <p className={`font-bold ${isMe ? 'text-emerald-400' : isDark ? 'text-white' : 'text-slate-900'}`}>
                        {entry.student_name} {isMe && '(أنت)'}
                      </p>
                      <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>المستوى {entry.level || 1}</p>
                    </div>
                  </div>
                  <div className="text-left">
                    <p className={`text-xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{entry.total_points}</p>
                    <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>نقطة</p>
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
