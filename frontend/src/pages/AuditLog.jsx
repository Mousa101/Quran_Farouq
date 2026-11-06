import { useState, useEffect } from 'react';
import axios from 'axios';
import { useTheme } from '../context/ThemeContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../components/ui/dialog';
import { toast } from 'sonner';
import { ScrollText, Trash2, KeyRound, AlertTriangle, RotateCcw, Shield, MessageSquareX, SlidersHorizontal, Loader2 } from 'lucide-react';
import { formatDate as fmtDate } from '../lib/utils';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// N3 - سجل عمليات المدير الحساسة
const ACTIONS = {
  term_reset: { label: 'تصفير/إغلاق فصل', color: 'bg-red-500/20 text-red-400', icon: RotateCcw },
  password_reset: { label: 'إعادة تعيين كلمة مرور', color: 'bg-amber-500/20 text-amber-400', icon: KeyRound },
  user_delete: { label: 'حذف مستخدم', color: 'bg-red-500/20 text-red-400', icon: Trash2 },
  warning: { label: 'إنذار', color: 'bg-orange-500/20 text-orange-400', icon: AlertTriangle },
  chat_delete: { label: 'حذف محادثة/رسالة', color: 'bg-red-500/20 text-red-400', icon: MessageSquareX },
  ui_settings: { label: 'تعديل إعدادات العرض', color: 'bg-emerald-500/20 text-emerald-400', icon: SlidersHorizontal },
  points_reset: { label: 'تصفير نقاط', color: 'bg-red-500/20 text-red-400', icon: RotateCcw },
};

const AuditLog = () => {
  const { isDark } = useTheme();
  const [logs, setLogs] = useState([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [clearing, setClearing] = useState(false);

  useEffect(() => { fetchLogs(); }, [filter]);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const q = filter !== 'all' ? `?action=${filter}` : '';
      const res = await axios.get(`${API}/admin/audit-logs${q}`);
      setLogs(res.data.logs || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const clearLogs = async () => {
    setClearing(true);
    try {
      const res = await axios.delete(`${API}/admin/audit-logs`);
      toast.success(res.data.message);
      setConfirmOpen(false);
      fetchLogs();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'فشل في تصفير السجل');
    } finally {
      setClearing(false);
    }
  };

  const fmt = (iso) => (iso ? fmtDate(iso, { withTime: true }) : '');

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className={`p-6 rounded-xl ${isDark ? 'glass-card border border-white/10' : 'bg-white border border-slate-200 shadow-sm'}`}>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center"><Shield className="w-6 h-6 text-blue-400" /></div>
            <div>
              <h1 className={`text-xl md:text-2xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>سجل العمليات</h1>
              <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>أثر العمليات الحساسة غير القابلة للتراجع</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <select value={filter} onChange={(e) => setFilter(e.target.value)} className={`p-2 rounded-lg border text-sm ${isDark ? 'bg-slate-800 border-white/10 text-white' : 'bg-white border-slate-300'}`}>
              <option value="all">كل العمليات</option>
              {Object.entries(ACTIONS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <Button variant="outline" onClick={() => setConfirmOpen(true)} className="border-red-500/40 text-red-400 hover:bg-red-500/10" data-testid="clear-audit-btn">
              <Trash2 className="w-4 h-4 ml-1" />
              تصفير السجل
            </Button>
          </div>
        </div>
      </div>

      <Card className={isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'}>
        <CardHeader className="pb-2"><CardTitle className={`text-base flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}><ScrollText className="w-4 h-4 text-blue-400" />{logs.length} عملية</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center h-32"><div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
          ) : logs.length === 0 ? (
            <p className={`text-center py-8 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>لا توجد عمليات مسجّلة</p>
          ) : (
            <div className="space-y-2">
              {logs.map((log) => {
                const meta = ACTIONS[log.action] || { label: log.action, color: 'bg-slate-500/20 text-slate-400', icon: ScrollText };
                const Icon = meta.icon;
                return (
                  <div key={log.id} className={`p-3 rounded-lg flex items-start gap-3 ${isDark ? 'bg-slate-800/50' : 'bg-slate-50'}`}>
                    <span className={`px-2 py-1 rounded-full text-xs flex items-center gap-1 flex-shrink-0 ${meta.color}`}><Icon className="w-3 h-3" />{meta.label}</span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm ${isDark ? 'text-white' : 'text-slate-900'}`}>
                        {log.target_name || log.target_type || ''}
                        {log.details ? <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}> — {log.details}</span> : null}
                      </p>
                      <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>بواسطة {log.admin_name || '—'} · {fmt(log.created_at)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className={isDark ? 'bg-slate-900 border-slate-700' : 'bg-white'}>
          <DialogHeader>
            <DialogTitle className={isDark ? 'text-white' : 'text-slate-900'}>تصفير سجل العمليات</DialogTitle>
            <DialogDescription className={isDark ? 'text-slate-400' : 'text-slate-600'}>
              سيُحذف كامل السجل نهائيًا بكل أنواع عملياته، ولا يمكن التراجع عن ذلك.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 mt-4">
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>إلغاء</Button>
            <Button onClick={clearLogs} disabled={clearing} className="bg-red-600 hover:bg-red-700">
              {clearing ? <Loader2 className="w-4 h-4 animate-spin" /> : 'تصفير'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AuditLog;
