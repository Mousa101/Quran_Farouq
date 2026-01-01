import { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Progress } from '../components/ui/progress';
import { Badge } from '../components/ui/badge';
import { 
  BookOpen, BookMarked, Trophy, Target, Calendar, CheckCircle, 
  Award, Star, TrendingUp, Clock, Users, Sparkles
} from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const MyProgress = () => {
  const { user } = useAuth();
  const { isDark } = useTheme();
  const [stats, setStats] = useState(null);
  const [schedule, setSchedule] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [user?.id]);

  const fetchData = async () => {
    if (!user?.id) return;
    
    try {
      const [statsRes, scheduleRes] = await Promise.all([
        axios.get(`${API}/statistics/student/${user.id}`),
        axios.get(`${API}/schedules`).catch(() => ({ data: [] }))
      ]);
      
      setStats(statsRes.data);
      
      // البحث عن الجدول النشط
      const activeSchedule = scheduleRes.data.find(s => s.is_active);
      setSchedule(activeSchedule);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateSemesterProgress = () => {
    if (!schedule) return { days: 0, totalDays: 0, percentage: 0 };
    
    const startDate = new Date(schedule.start_date);
    const endDate = new Date(schedule.end_date);
    const today = new Date();
    
    const totalDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
    const daysPassed = Math.min(Math.ceil((today - startDate) / (1000 * 60 * 60 * 24)), totalDays);
    const percentage = totalDays > 0 ? Math.round((daysPassed / totalDays) * 100) : 0;
    
    return { days: daysPassed, totalDays, percentage };
  };

  const semesterProgress = calculateSemesterProgress();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className={`p-6 rounded-xl ${isDark ? 'glass-card border border-white/10' : 'bg-white border border-slate-200 shadow-sm'}`}>
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-xl bg-emerald-500/20 flex items-center justify-center">
            <TrendingUp className="w-7 h-7 text-emerald-400" />
          </div>
          <div>
            <h1 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>تقدمي في الفصل</h1>
            <p className={isDark ? 'text-slate-400' : 'text-slate-600'}>
              {schedule ? `${schedule.name} (${schedule.start_date} - ${schedule.end_date})` : 'لا يوجد فصل نشط'}
            </p>
          </div>
        </div>
      </div>

      {/* Semester Timeline */}
      {schedule && (
        <Card className={isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'}>
          <CardHeader>
            <CardTitle className={`flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
              <Calendar className="w-5 h-5 text-blue-400" />
              تقدم الفصل الدراسي
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between text-sm">
                <span className={isDark ? 'text-slate-400' : 'text-slate-600'}>
                  {semesterProgress.days} يوم من {semesterProgress.totalDays}
                </span>
                <span className="text-emerald-400 font-bold">{semesterProgress.percentage}%</span>
              </div>
              <Progress value={semesterProgress.percentage} className={`h-4 ${isDark ? 'bg-slate-700' : 'bg-slate-200'}`} />
              <div className="grid grid-cols-3 gap-4 mt-4">
                <div className={`p-3 rounded-lg text-center ${isDark ? 'bg-blue-500/10' : 'bg-blue-50'}`}>
                  <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>بداية الفصل</p>
                  <p className="text-blue-400 font-bold">{schedule.start_date}</p>
                </div>
                <div className={`p-3 rounded-lg text-center ${isDark ? 'bg-emerald-500/10' : 'bg-emerald-50'}`}>
                  <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>أيام الدروس</p>
                  <p className="text-emerald-400 font-bold">{schedule.lesson_days?.join('، ') || '-'}</p>
                </div>
                <div className={`p-3 rounded-lg text-center ${isDark ? 'bg-amber-500/10' : 'bg-amber-50'}`}>
                  <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>نهاية الفصل</p>
                  <p className="text-amber-400 font-bold">{schedule.end_date}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Memorization Progress */}
      <Card className={isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'}>
        <CardHeader>
          <CardTitle className={`flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
            <BookOpen className="w-5 h-5 text-emerald-400" />
            مقدار الحفظ
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 mb-6">
            
            
            {/* المجموع */}
            <div className={`p-4 rounded-xl text-center ${isDark ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-emerald-50 border border-emerald-200'}`}>
              <BookOpen className="w-8 h-8 mx-auto text-emerald-400 mb-2" />
              <p className="text-2xl font-bold text-emerald-400">
                {stats?.memorization?.total_memorized || 0}
              </p>
              <p className={`text-sm ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>إجمالي الحفظ</p>
              <p className={`text-xs ${isDark ? 'text-emerald-500' : 'text-emerald-500'}`}>
                ({Math.floor((stats?.memorization?.total_memorized || 0) / 20)} جزء)
              </p>
            </div>
          </div>
          
          {/* نسبة الحفظ من القرآن */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className={isDark ? 'text-slate-400' : 'text-slate-600'}>نسبة الحفظ من القرآن الكريم</span>
              <span className="text-emerald-400 font-bold">{stats?.memorization?.percentage || 0}%</span>
            </div>
            <Progress value={stats?.memorization?.percentage || 0} className={`h-4 ${isDark ? 'bg-slate-700' : 'bg-slate-200'}`} />
            <p className={`text-xs text-center ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
              {stats?.memorization?.total_memorized || 0} من 604 صفحة
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Attendance & Recitation */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Attendance */}
        <Card className={isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'}>
          <CardHeader>
            <CardTitle className={`flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
              <CheckCircle className="w-5 h-5 text-blue-400" />
              الحضور في الفصل
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center mb-4">
              <p className="text-4xl font-bold text-blue-400">{stats?.attendance?.percentage || 0}%</p>
              <p className={isDark ? 'text-slate-400' : 'text-slate-600'}>نسبة الحضور</p>
            </div>
            <Progress value={stats?.attendance?.percentage || 0} className={`h-3 mb-4 ${isDark ? 'bg-slate-700' : 'bg-slate-200'}`} />
            <div className="grid grid-cols-3 gap-2 text-center text-sm">
              <div className={`p-2 rounded-lg ${isDark ? 'bg-emerald-500/10' : 'bg-emerald-50'}`}>
                <p className="text-emerald-400 font-bold">{stats?.attendance?.present || 0}</p>
                <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>حاضر</p>
              </div>
              <div className={`p-2 rounded-lg ${isDark ? 'bg-red-500/10' : 'bg-red-50'}`}>
                <p className="text-red-400 font-bold">{stats?.attendance?.absent || 0}</p>
                <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>غائب</p>
              </div>
              <div className={`p-2 rounded-lg ${isDark ? 'bg-amber-500/10' : 'bg-amber-50'}`}>
                <p className="text-amber-400 font-bold">{stats?.attendance?.excused || 0}</p>
                <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>معذور</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Recitation */}
        <Card className={isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'}>
          <CardHeader>
            <CardTitle className={`flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
              <Star className="w-5 h-5 text-purple-400" />
              التسميع في الفصل
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center mb-4">
              <p className="text-4xl font-bold text-purple-400">{stats?.recitation?.total || 0}</p>
              <p className={isDark ? 'text-slate-400' : 'text-slate-600'}>مرات التسميع</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className={`p-3 rounded-lg text-center ${isDark ? 'bg-emerald-500/10' : 'bg-emerald-50'}`}>
                <BookOpen className="w-6 h-6 mx-auto text-emerald-400 mb-1" />
                <p className="text-emerald-400 font-bold">{stats?.recitation?.new_memorization || 0}</p>
                <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>حفظ جديد</p>
              </div>
              <div className={`p-3 rounded-lg text-center ${isDark ? 'bg-blue-500/10' : 'bg-blue-50'}`}>
                <BookMarked className="w-6 h-6 mx-auto text-blue-400 mb-1" />
                <p className="text-blue-400 font-bold">{stats?.recitation?.review || 0}</p>
                <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>مراجعة</p>
              </div>
            </div>
            {stats?.recitation?.average_rating > 0 && (
              <div className={`mt-4 p-3 rounded-lg text-center ${isDark ? 'bg-amber-500/10' : 'bg-amber-50'}`}>
                <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>متوسط التقييم</p>
                <p className="text-2xl font-bold text-amber-400">{stats?.recitation?.average_rating?.toFixed(1)}/10</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Points Summary */}
      <Card className={isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'}>
        <CardHeader>
          <CardTitle className={`flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
            <Award className="w-5 h-5 text-amber-400" />
            ملخص النقاط (الحد الأقصى 1000 نقطة)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
            <div className={`p-3 rounded-lg text-center ${isDark ? 'bg-emerald-500/10' : 'bg-emerald-50'}`}>
              <CheckCircle className="w-5 h-5 mx-auto text-emerald-400 mb-1" />
              <p className={`text-lg font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{stats?.points?.attendance || 0}</p>
              <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>حضور</p>
            </div>
            <div className={`p-3 rounded-lg text-center ${isDark ? 'bg-blue-500/10' : 'bg-blue-50'}`}>
              <Target className="w-5 h-5 mx-auto text-blue-400 mb-1" />
              <p className={`text-lg font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{stats?.points?.recitation || 0}</p>
              <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>تسميع</p>
            </div>
            <div className={`p-3 rounded-lg text-center ${isDark ? 'bg-purple-500/10' : 'bg-purple-50'}`}>
              <Clock className="w-5 h-5 mx-auto text-purple-400 mb-1" />
              <p className={`text-lg font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{stats?.points?.tracking || 0}</p>
              <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>متابعة</p>
            </div>
            <div className={`p-3 rounded-lg text-center ${isDark ? 'bg-pink-500/10' : 'bg-pink-50'}`}>
              <Sparkles className="w-5 h-5 mx-auto text-pink-400 mb-1" />
              <p className={`text-lg font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{stats?.points?.interaction || 0}</p>
              <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>تفاعل</p>
            </div>
            <div className={`p-3 rounded-lg text-center ${isDark ? 'bg-amber-500/10' : 'bg-amber-50'}`}>
              <Award className="w-5 h-5 mx-auto text-amber-400 mb-1" />
              <p className={`text-lg font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{stats?.points?.bonus || 0}</p>
              <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>تميز</p>
            </div>
          </div>
          
          <div className={`p-4 rounded-xl text-center ${isDark ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-emerald-50 border border-emerald-200'}`}>
            <p className={isDark ? 'text-slate-300' : 'text-slate-600'}>إجمالي النقاط</p>
            <p className="text-3xl font-bold text-emerald-400">{stats?.total_points || 0} / 1000</p>
            <Progress 
              value={Math.min(((stats?.total_points || 0) / 1000) * 100, 100)} 
              className={`h-2 mt-2 ${isDark ? 'bg-slate-700' : 'bg-slate-200'}`}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default MyProgress;
