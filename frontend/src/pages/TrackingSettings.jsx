import { useState, useEffect } from 'react';
import axios from 'axios';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Switch } from '../components/ui/switch';
import { Settings, Clock, Calendar, CheckCircle, XCircle, Loader2, Trophy } from 'lucide-react';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// أيقونات مقترحة لبنود المتابعة
const ICON_CHOICES = ['⭐', '🕌', '📖', '🤲', '🌙', '☀️', '📿', '🕋', '💧', '📚', '🌱', '❤️', '✅', '🔥'];

const DAYS = [
  { value: 'saturday', label: 'السبت' },
  { value: 'sunday', label: 'الأحد' },
  { value: 'monday', label: 'الاثنين' },
  { value: 'tuesday', label: 'الثلاثاء' },
  { value: 'wednesday', label: 'الأربعاء' },
  { value: 'thursday', label: 'الخميس' },
  { value: 'friday', label: 'الجمعة' }
];

const TrackingSettings = () => {
  const { isDark } = useTheme();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [settings, setSettings] = useState({
    submission_enabled: true,
    submission_start_day: 'friday',
    submission_start_time: '21:00',
    submission_end_day: 'saturday',
    submission_end_time: '08:50',
    allow_late_submission: true
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [checkResult, setCheckResult] = useState(null);
  const [customItems, setCustomItems] = useState([]);
  const [newItem, setNewItem] = useState({ name: '', max_points: '', icon: '⭐' });
  const [addingItem, setAddingItem] = useState(false);
  // #4 — المدير يختار المشرف ليرى/يعدّل بنوده
  const [sheikhs, setSheikhs] = useState([]);
  const [selectedSheikh, setSelectedSheikh] = useState('');
  // إعدادات نقاط التميز (المدير فقط)
  const [excellence, setExcellence] = useState({ points: 50, period_days: 7 });
  const [savingExcellence, setSavingExcellence] = useState(false);

  useEffect(() => {
    fetchSettings();
    checkSubmissionWindow();
    if (isAdmin) {
      axios.get(`${API}/admin/sheikhs`).then((r) => setSheikhs(r.data || [])).catch(() => {});
      fetchExcellence();
    } else {
      fetchCustomItems();
    }
  }, []); // eslint-disable-line

  const fetchExcellence = async () => {
    try {
      const res = await axios.get(`${API}/settings/excellence-points`);
      setExcellence({ points: res.data.points, period_days: res.data.period_days });
    } catch (error) {
      console.error('Error fetching excellence settings:', error);
    }
  };

  const saveExcellence = async () => {
    const points = parseInt(excellence.points, 10);
    const periodDays = parseInt(excellence.period_days, 10);
    if (isNaN(points) || points < 1 || points > 1000) {
      toast.error('مقدار النقاط يجب أن يكون بين 1 و 1000');
      return;
    }
    if (isNaN(periodDays) || periodDays < 0 || periodDays > 365) {
      toast.error('المدة يجب أن تكون بين 0 و 365 يوم');
      return;
    }
    setSavingExcellence(true);
    try {
      const res = await axios.put(`${API}/settings/excellence-points`, { points, period_days: periodDays });
      setExcellence({ points: res.data.settings.points, period_days: res.data.settings.period_days });
      toast.success('تم حفظ إعدادات نقاط التميز');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في حفظ الإعدادات');
    } finally {
      setSavingExcellence(false);
    }
  };

  // المدير: تغيير النطاق يعيد جلب البنود (بدون اختيار مشرف = البنود العامة)
  useEffect(() => {
    if (isAdmin) fetchCustomItems();
  }, [selectedSheikh]); // eslint-disable-line

  const fetchCustomItems = async () => {
    try {
      const q = isAdmin && selectedSheikh ? `?sheikh_id=${selectedSheikh}` : '';
      const res = await axios.get(`${API}/tracking-items${q}`);
      setCustomItems(res.data || []);
    } catch (error) {
      console.error('Error fetching items:', error);
    }
  };

  const handleAddItem = async () => {
    const points = parseInt(newItem.max_points);
    if (!newItem.name.trim() || !points || points <= 0) {
      toast.error('أدخل اسم البند ونقاطه (أكبر من صفر)');
      return;
    }
    setAddingItem(true);
    try {
      const payload = { name: newItem.name.trim(), max_points: points, icon: newItem.icon || '⭐' };
      // المدير: بدون اختيار مشرف = بند عام للجميع؛ مع اختيار مشرف = خاص فيه
      if (isAdmin && selectedSheikh) payload.sheikh_id = selectedSheikh;
      await axios.post(`${API}/tracking-items`, payload);
      toast.success(isAdmin && !selectedSheikh ? 'تمت إضافة بند عام لكل المشرفين' : 'تمت إضافة البند');
      setNewItem({ name: '', max_points: '', icon: '⭐' });
      fetchCustomItems();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في إضافة البند');
    } finally {
      setAddingItem(false);
    }
  };

  const handleDeleteItem = async (id) => {
    try {
      await axios.delete(`${API}/tracking-items/${id}`);
      toast.success('تم حذف البند');
      fetchCustomItems();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في حذف البند');
    }
  };

  const fetchSettings = async () => {
    try {
      const response = await axios.get(`${API}/settings/tracking-submission`);
      setSettings({
        submission_enabled: response.data.submission_enabled ?? true,
        submission_start_day: response.data.submission_start_day || 'friday',
        submission_start_time: response.data.submission_start_time || '21:00',
        submission_end_day: response.data.submission_end_day || 'saturday',
        submission_end_time: response.data.submission_end_time || '08:50',
        allow_late_submission: response.data.allow_late_submission ?? true
      });
    } catch (error) {
      console.error('Error fetching settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const checkSubmissionWindow = async () => {
    try {
      const response = await axios.get(`${API}/settings/tracking-submission/check`);
      setCheckResult(response.data);
    } catch (error) {
      console.error('Error checking submission window:', error);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await axios.put(`${API}/settings/tracking-submission`, settings);
      toast.success('تم حفظ الإعدادات بنجاح');
      checkSubmissionWindow();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في حفظ الإعدادات');
    } finally {
      setSaving(false);
    }
  };

  const getDayLabel = (value) => {
    return DAYS.find(d => d.value === value)?.label || value;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      <div>
        <h1 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
          إعدادات ورق المتابعة
        </h1>
        <p className="text-slate-400">تحديد مواعيد تسليم ورق المتابعة الأسبوعية</p>
      </div>

      {/* حالة التسليم الحالية */}
      {checkResult && (
        <Card className={`${isDark ? 'glass-card' : 'bg-white'} ${checkResult.can_submit ? 'border-emerald-500/30' : 'border-amber-500/30'}`}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              {checkResult.can_submit ? (
                <CheckCircle className="w-6 h-6 text-emerald-400" />
              ) : (
                <XCircle className="w-6 h-6 text-amber-400" />
              )}
              <div>
                <p className={`font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  {checkResult.can_submit ? 'التسليم مفتوح الآن' : 'التسليم مغلق حالياً'}
                </p>
                <p className="text-slate-400 text-sm">{checkResult.message}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* إعدادات نقاط التميز — المدير فقط */}
      {isAdmin && (
        <Card className={`${isDark ? 'glass-card' : 'bg-white'} border-amber-500/30`}>
          <CardHeader>
            <CardTitle className={`flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
              <Trophy className="w-5 h-5 text-amber-400" />
              نقاط التميز
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-slate-400 text-sm">
              النقاط الإدارية التي يمنحها المدير للطالب المتميّز. حدّد المقدار، والمدة المسموح بعدها بمنحها للطالب نفسه مرة أخرى.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>مقدار النقاط</Label>
                <Input
                  type="number"
                  min="1"
                  max="1000"
                  value={excellence.points}
                  onChange={(e) => setExcellence({ ...excellence, points: e.target.value })}
                  className={isDark ? 'bg-slate-800 border-slate-700 text-white' : ''}
                />
                <p className="text-slate-500 text-xs">بين 1 و 1000</p>
              </div>
              <div className="space-y-2">
                <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>المدة (كل كم يوم)</Label>
                <Input
                  type="number"
                  min="0"
                  max="365"
                  value={excellence.period_days}
                  onChange={(e) => setExcellence({ ...excellence, period_days: e.target.value })}
                  className={isDark ? 'bg-slate-800 border-slate-700 text-white' : ''}
                />
                <p className="text-slate-500 text-xs">7 = مرة بالأسبوع • 0 = بدون تقييد</p>
              </div>
              <div className="flex items-end">
                <Button
                  onClick={saveExcellence}
                  disabled={savingExcellence}
                  className="bg-amber-600 hover:bg-amber-700 w-full"
                >
                  {savingExcellence ? <Loader2 className="w-4 h-4 ml-2 animate-spin" /> : <Trophy className="w-4 h-4 ml-2" />}
                  حفظ إعدادات التميز
                </Button>
              </div>
            </div>
            <div className={`p-3 rounded-lg text-sm ${isDark ? 'bg-amber-500/10 border border-amber-500/20 text-amber-300' : 'bg-amber-50 border border-amber-200 text-amber-800'}`}>
              حاليًا: <strong>{excellence.points}</strong> نقطة، {Number(excellence.period_days) === 0
                ? 'بدون تقييد على عدد المرات'
                : <>مرة كل <strong>{excellence.period_days}</strong> يوم لكل طالب</>}.
            </div>
          </CardContent>
        </Card>
      )}

      {/* بنود المتابعة المخصصة */}
      <Card className={isDark ? 'glass-card' : 'bg-white'}>
        <CardHeader>
          <CardTitle className={`flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
            <Settings className="w-5 h-5 text-purple-400" />
            بنود متابعة إضافية (الأساس: الصلوات 35 + الجلوس 35 = 70)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-slate-400 text-sm">أضف بنوداً بنقاطها ورمزها (icon)، وستظهر في دليل النقاط وفي ورقة المتابعة عند الطالب والمشرف وتُحتسب ضمن المجموع.</p>

          {/* #4 — المدير يختار المشرف، أو يضيف بندًا عامًّا للجميع */}
          {isAdmin && (
            <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>نطاق البند</Label>
              <select
                value={selectedSheikh}
                onChange={(e) => setSelectedSheikh(e.target.value)}
                className="w-full h-10 px-3 rounded-md bg-slate-800 border border-slate-700 text-white mt-1"
              >
                <option value="">🌍 بند عام — يظهر عند كل المشرفين وطلابهم</option>
                {sheikhs.map((s) => (<option key={s.id} value={s.id}>بنود {s.name} فقط</option>))}
              </select>
              <p className="text-slate-400 text-xs mt-2">
                {selectedSheikh
                  ? 'البند الذي تضيفه يظهر لهذا المشرف وطلابه فقط.'
                  : 'البند الذي تضيفه يُضاف لجميع المشرفين والطلاب، وتعرض القائمة أدناه البنود العامة.'}
              </p>
            </div>
          )}

          {customItems.length > 0 && (
            <div className="space-y-2">
              {customItems.map((it) => (
                <div key={it.id} className={`flex items-center justify-between p-3 rounded-lg ${isDark ? 'bg-slate-800/50' : 'bg-slate-100'}`}>
                  <span className={`flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                    <span className="text-xl">{it.icon || '⭐'}</span>{it.name}
                    {it.is_global && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400">عام</span>
                    )}
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="text-purple-400 font-bold">{it.max_points} نقطة</span>
                    <Button size="sm" variant="ghost" onClick={() => handleDeleteItem(it.id)} className="text-red-400 hover:bg-red-500/20">
                      <XCircle className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {(
            <div className="space-y-3">
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex-1 min-w-[160px]">
                  <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>اسم البند الجديد</Label>
                  <Input
                    value={newItem.name}
                    onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                    placeholder="مثال: قيام الليل"
                    className={isDark ? 'bg-slate-700 border-white/10 text-white' : ''}
                  />
                </div>
                <div className="w-28">
                  <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>النقاط</Label>
                  <Input
                    type="number"
                    min="1"
                    value={newItem.max_points}
                    onChange={(e) => setNewItem({ ...newItem, max_points: e.target.value })}
                    placeholder="10"
                    className={isDark ? 'bg-slate-700 border-white/10 text-white' : ''}
                  />
                </div>
                <Button onClick={handleAddItem} disabled={addingItem} className="bg-purple-600 hover:bg-purple-700">
                  {addingItem ? <Loader2 className="w-4 h-4 animate-spin" /> : 'إضافة'}
                </Button>
              </div>
              {/* اختيار الرمز */}
              <div>
                <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>الرمز (icon)</Label>
                <div className="flex flex-wrap gap-1 mt-1">
                  {ICON_CHOICES.map((ic) => (
                    <button
                      key={ic}
                      type="button"
                      onClick={() => setNewItem({ ...newItem, icon: ic })}
                      className={`w-9 h-9 rounded-lg text-lg transition-all ${newItem.icon === ic ? 'bg-purple-500/30 ring-2 ring-purple-400' : (isDark ? 'bg-slate-800' : 'bg-slate-100')}`}
                    >
                      {ic}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className={isDark ? 'glass-card' : 'bg-white'}>
        <CardHeader>
          <CardTitle className={`flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
            <Settings className="w-5 h-5 text-emerald-400" />
            إعدادات فترة التسليم
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* تفعيل/إلغاء تفعيل التحديد */}
          <div className="flex items-center justify-between p-4 rounded-xl bg-slate-800/30">
            <div>
              <p className={`font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>
                تحديد موعد التسليم
              </p>
              <p className="text-slate-400 text-sm">
                عند التفعيل، سيكون التسليم متاحاً فقط في الفترة المحددة
              </p>
            </div>
            <Switch
              checked={settings.submission_enabled}
              onCheckedChange={(checked) => setSettings({...settings, submission_enabled: checked})}
            />
          </div>

          {settings.submission_enabled && (
            <>
              {/* استقبال الورقة المتأخرة */}
              <div className="flex items-center justify-between p-4 rounded-xl bg-amber-500/5 border border-amber-500/20">
                <div>
                  <p className={`font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>
                    استقبال الورقة خارج التوقيت
                  </p>
                  <p className="text-slate-400 text-sm">
                    {settings.allow_late_submission
                      ? 'الورقة المتأخرة تُقبل وتُحفظ، لكن بدون احتساب نقاط.'
                      : 'الورقة المتأخرة تُرفض تمامًا ولا تُحفظ.'}
                  </p>
                </div>
                <Switch
                  checked={settings.allow_late_submission}
                  onCheckedChange={(checked) => setSettings({ ...settings, allow_late_submission: checked })}
                />
              </div>

              {/* وقت البداية */}
              <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20 space-y-4">
                <div className="flex items-center gap-2 text-emerald-400 font-medium">
                  <Clock className="w-5 h-5" />
                  بداية فترة التسليم
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-slate-300">اليوم</Label>
                    <Select 
                      value={settings.submission_start_day} 
                      onValueChange={(v) => setSettings({...settings, submission_start_day: v})}
                    >
                      <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-800 border-slate-700">
                        {DAYS.map(day => (
                          <SelectItem key={day.value} value={day.value} className="text-white">
                            {day.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-300">الوقت</Label>
                    <Input
                      type="time"
                      value={settings.submission_start_time}
                      onChange={(e) => setSettings({...settings, submission_start_time: e.target.value})}
                      className="bg-slate-800 border-slate-700 text-white"
                    />
                  </div>
                </div>
              </div>

              {/* وقت النهاية */}
              <div className="p-4 rounded-xl bg-red-500/5 border border-red-500/20 space-y-4">
                <div className="flex items-center gap-2 text-red-400 font-medium">
                  <Clock className="w-5 h-5" />
                  نهاية فترة التسليم
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-slate-300">اليوم</Label>
                    <Select 
                      value={settings.submission_end_day} 
                      onValueChange={(v) => setSettings({...settings, submission_end_day: v})}
                    >
                      <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-800 border-slate-700">
                        {DAYS.map(day => (
                          <SelectItem key={day.value} value={day.value} className="text-white">
                            {day.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-300">الوقت</Label>
                    <Input
                      type="time"
                      value={settings.submission_end_time}
                      onChange={(e) => setSettings({...settings, submission_end_time: e.target.value})}
                      className="bg-slate-800 border-slate-700 text-white"
                    />
                  </div>
                </div>
              </div>

              {/* ملخص */}
              <div className="p-4 rounded-xl bg-slate-800/50 text-center">
                <Calendar className="w-8 h-8 mx-auto text-blue-400 mb-2" />
                <p className={`font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  فترة التسليم
                </p>
                <p className="text-slate-400">
                  من {getDayLabel(settings.submission_start_day)} الساعة {settings.submission_start_time}
                </p>
                <p className="text-slate-400">
                  إلى {getDayLabel(settings.submission_end_day)} الساعة {settings.submission_end_time}
                </p>
              </div>
            </>
          )}

          <Button 
            onClick={handleSave}
            disabled={saving}
            className="w-full bg-emerald-500 hover:bg-emerald-600"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                جارٍ الحفظ...
              </>
            ) : (
              'حفظ الإعدادات'
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default TrackingSettings;
