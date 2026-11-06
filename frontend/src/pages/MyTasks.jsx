import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useTheme } from '../context/ThemeContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { toast } from 'sonner';
import { ClipboardCheck, PlayCircle, CheckCircle2, RotateCcw } from 'lucide-react';
import { formatDate as fmtDate } from '../lib/utils';
import { TASK_STATUS, TASK_PRIORITY } from '../lib/tasks';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// مهامي — المهام التي أسندتها الإدارة للمشرف (يغيّر حالتها ويكتب ملاحظة عند الإنجاز)
const MyTasks = () => {
  const { isDark } = useTheme();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('open');
  const [finishing, setFinishing] = useState(null); // المهمة التي يُكتب لها ملاحظة الإنجاز
  const [note, setNote] = useState('');

  const muted = isDark ? 'text-slate-400' : 'text-slate-500';
  const strong = isDark ? 'text-white' : 'text-slate-900';

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/tasks`, { params: filter === 'all' ? {} : { status: filter } });
      setTasks(res.data || []);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, [filter]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  const setStatus = async (task, status, withNote) => {
    try {
      await axios.patch(`${API}/tasks/${task.id}/status`, withNote === undefined ? { status } : { status, note: withNote });
      toast.success(status === 'done' ? 'أُبلغت الإدارة بإنجاز المهمة' : 'تم تحديث الحالة');
      setFinishing(null);
      fetchTasks();
    } catch (e) { toast.error(e.response?.data?.detail || 'فشل في التحديث'); }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className={`p-6 rounded-xl ${isDark ? 'glass-card border border-white/10' : 'bg-white border border-slate-200 shadow-sm'}`}>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center"><ClipboardCheck className="w-6 h-6 text-emerald-400" /></div>
          <div>
            <h1 className={`text-xl md:text-2xl font-bold ${strong}`}>مهامي</h1>
            <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>المهام المسندة إليك من الإدارة — حدّث حالتها لتصل الإدارة أولًا بأول</p>
          </div>
        </div>
      </div>

      <Card className={isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'}>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className={`text-base ${strong}`}>المهام ({tasks.length})</CardTitle>
            <select value={filter} onChange={(e) => setFilter(e.target.value)}
              className={`p-2 rounded-lg border text-sm ${isDark ? 'bg-slate-800 border-white/10 text-white' : 'bg-white border-slate-300'}`}>
              <option value="open">غير المنجزة</option>
              <option value="done">المنجزة</option>
              <option value="all">الكل</option>
            </select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center h-24"><div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" /></div>
          ) : tasks.length === 0 ? (
            <p className={`text-center py-6 ${muted}`}>{filter === 'open' ? 'لا توجد مهام مفتوحة 🎉' : 'لا توجد مهام'}</p>
          ) : (
            <div className="space-y-2">
              {tasks.map((t) => (
                <div key={t.id} className={`p-3 rounded-lg space-y-2 ${isDark ? 'bg-slate-800/50' : 'bg-slate-50'} ${t.is_overdue ? 'border border-red-500/40' : ''}`}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className={`font-bold text-sm ${t.status === 'done' ? `line-through ${muted}` : strong}`}>{t.title}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${TASK_STATUS[t.status]?.cls}`}>{TASK_STATUS[t.status]?.label}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${TASK_PRIORITY[t.priority]?.cls}`}>أولوية {TASK_PRIORITY[t.priority]?.label}</span>
                    {t.is_overdue && <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-400">متأخرة</span>}
                  </div>
                  {t.details && <p className={`text-sm whitespace-pre-line ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{t.details}</p>}
                  <div className={`text-xs flex flex-wrap gap-x-4 gap-y-1 ${muted}`}>
                    {t.due_date && <span className={t.is_overdue ? 'text-red-400' : ''}>آخر موعد: {fmtDate(t.due_date, { withWeekday: true })}</span>}
                    {t.meeting_title && <span>من اجتماع: {t.meeting_title}</span>}
                    {t.status === 'done' && t.done_at && <span>أُنجزت: {fmtDate(t.done_at)}</span>}
                  </div>
                  {t.note && <p className={`text-xs ${isDark ? 'text-amber-300' : 'text-amber-700'}`}>ملاحظتي: {t.note}</p>}
                  <div className="flex gap-2 flex-wrap">
                    {t.status === 'todo' && (
                      <Button size="sm" variant="outline" onClick={() => setStatus(t, 'in_progress')} className={isDark ? 'border-white/10' : ''}>
                        <PlayCircle className="w-4 h-4 ml-1" />بدأت العمل
                      </Button>
                    )}
                    {t.status !== 'done' && (
                      <Button size="sm" onClick={() => { setFinishing(t); setNote(t.note || ''); }} className="bg-emerald-600 hover:bg-emerald-700">
                        <CheckCircle2 className="w-4 h-4 ml-1" />أنجزتها
                      </Button>
                    )}
                    {t.status === 'done' && (
                      <Button size="sm" variant="ghost" onClick={() => setStatus(t, 'in_progress')} className={muted}>
                        <RotateCcw className="w-4 h-4 ml-1" />إعادة فتح
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!finishing} onOpenChange={(o) => { if (!o) setFinishing(null); }}>
        <DialogContent className={`max-w-md ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white'}`}>
          <DialogHeader><DialogTitle className={isDark ? 'text-white' : ''}>إنجاز: {finishing?.title}</DialogTitle></DialogHeader>
          <div>
            <Label className={muted}>ملاحظة للإدارة (اختياري)</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="مثال: تم التنسيق مع أولياء الأمور"
              className={isDark ? 'bg-slate-800 border-white/10 text-white' : ''} />
          </div>
          <DialogFooter>
            <Button onClick={() => setStatus(finishing, 'done', note)} className="bg-emerald-600 hover:bg-emerald-700">تأكيد الإنجاز</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MyTasks;
