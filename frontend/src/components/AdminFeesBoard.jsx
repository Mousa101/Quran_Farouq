import { useState, useEffect } from 'react';
import axios from 'axios';
import { useTheme } from '../context/ThemeContext';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { toast } from 'sonner';
import {
  DollarSign, Wallet, Clock, CheckCircle, AlertCircle, Settings2, Sparkles,
  Loader2, Search, ChevronDown, ChevronUp, FileDown, Save
} from 'lucide-react';
import StudentLink from './StudentLink';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// حالات الدفع — لون وتسمية مختصرة لخلايا الشهور
const CELL = {
  paid: { bg: 'bg-emerald-500/25 text-emerald-300 border-emerald-500/40', label: 'مدفوع', short: '✓' },
  due: { bg: 'bg-red-500/25 text-red-300 border-red-500/40', label: 'مستحق', short: '!' },
  pending: { bg: 'bg-slate-500/20 text-slate-300 border-slate-500/30', label: 'قائم', short: '–' },
};
const EMPTY_CELL = { bg: 'bg-transparent text-slate-600 border-dashed border-slate-600/40', label: 'غير مولَّد', short: '' };

const STATUS_CYCLE = { pending: 'paid', paid: 'due', due: 'pending' };

const AdminFeesBoard = () => {
  const { isDark } = useTheme();
  const currentYear = new Date().getFullYear();

  const [year, setYear] = useState(currentYear);
  const [data, setData] = useState(null);
  const [groups, setGroups] = useState([]);
  const [groupId, setGroupId] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyCell, setBusyCell] = useState(null);

  // الإعدادات + التوليد
  const [showSettings, setShowSettings] = useState(false);
  const [config, setConfig] = useState({ monthly_amount: 0, auto_generate: true });
  const [savingConfig, setSavingConfig] = useState(false);
  const [generating, setGenerating] = useState(false);

  // تعديل مبلغ شهر
  const [editMonth, setEditMonth] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [savingMonth, setSavingMonth] = useState(false);

  useEffect(() => {
    axios.get(`${API}/groups`).then((r) => setGroups(r.data || [])).catch(() => {});
    fetchConfig();
  }, []);

  useEffect(() => {
    fetchOverview();
    // eslint-disable-next-line
  }, [year, groupId]);

  const fetchConfig = async () => {
    try {
      const res = await axios.get(`${API}/settings/fees`);
      setConfig(res.data);
    } catch (e) { /* ignore */ }
  };

  const fetchOverview = async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ year: String(year) });
      if (groupId !== 'all') p.append('group_id', groupId);
      const res = await axios.get(`${API}/admin/fees/overview?${p.toString()}`);
      setData(res.data);
    } catch (e) {
      toast.error('فشل في تحميل الرسوم');
    } finally {
      setLoading(false);
    }
  };

  const saveConfig = async () => {
    const amt = parseFloat(config.monthly_amount);
    if (isNaN(amt) || amt < 0) { toast.error('أدخل مبلغًا صحيحًا'); return; }
    setSavingConfig(true);
    try {
      const res = await axios.put(`${API}/settings/fees`, {
        monthly_amount: amt, auto_generate: !!config.auto_generate,
      });
      setConfig(res.data.settings);
      toast.success('تم حفظ إعدادات الرسوم');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'فشل في الحفظ');
    } finally {
      setSavingConfig(false);
    }
  };

  const generateYear = async () => {
    const ok = window.confirm(
      `سيتم توليد رسوم 12 شهرًا لسنة ${year} لكل الطلاب بقيمة ${config.monthly_amount} لكل شهر.\n` +
      'الأشهر الموجودة أصلًا ما رح تتكرّر. متابعة؟'
    );
    if (!ok) return;
    setGenerating(true);
    try {
      const res = await axios.post(`${API}/admin/fees/generate-year`, { year });
      toast.success(res.data.message);
      fetchOverview();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'فشل في التوليد');
    } finally {
      setGenerating(false);
    }
  };

  const applyMonthAmount = async () => {
    const m = parseInt(editMonth, 10);
    const a = parseFloat(editAmount);
    if (!m || m < 1 || m > 12) { toast.error('اختر الشهر'); return; }
    if (isNaN(a) || a < 0) { toast.error('أدخل مبلغًا صحيحًا'); return; }
    setSavingMonth(true);
    try {
      const res = await axios.put(`${API}/admin/fees/month-amount`, { year, month: m, amount: a });
      toast.success(res.data.message);
      setEditAmount('');
      fetchOverview();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'فشل في التعديل');
    } finally {
      setSavingMonth(false);
    }
  };

  // نقرة على خلية شهر تدوّر الحالة: قائم → مدفوع → مستحق → قائم
  const cycleStatus = async (cell) => {
    if (!cell?.fee_id) return;
    setBusyCell(cell.fee_id);
    try {
      const next = STATUS_CYCLE[cell.status] || 'paid';
      await axios.put(`${API}/fees/${cell.fee_id}/status`, { status: next });
      fetchOverview();
    } catch (e) {
      toast.error('فشل في تغيير الحالة');
    } finally {
      setBusyCell(null);
    }
  };

  const markRowPaid = async (row) => {
    const unpaid = Object.values(row.months).filter((c) => c.status !== 'paid').map((c) => c.fee_id);
    if (!unpaid.length) { toast.info('كل الأشهر مدفوعة'); return; }
    if (!window.confirm(`تعليم ${unpaid.length} شهر كمدفوع للطالب ${row.student_name}؟`)) return;
    try {
      const res = await axios.put(`${API}/admin/fees/bulk-status`, { fee_ids: unpaid, status: 'paid' });
      toast.success(res.data.message);
      fetchOverview();
    } catch (e) {
      toast.error('فشل في التحديث');
    }
  };

  const exportExcel = async () => {
    try {
      const res = await axios.get(`${API}/export/fees?year=${year}`, { responseType: 'blob' });
      const link = document.createElement('a');
      link.href = window.URL.createObjectURL(new Blob([res.data]));
      link.download = `الرسوم_المالية_${year}.xlsx`;
      link.click();
      toast.success('تم تحميل التقرير');
    } catch (e) { toast.error('فشل في التحميل'); }
  };

  const months = data?.months || [];
  // ترتيب ثابت بالاسم — الخادم بيرتّب حسب المستحق، وهذا بيخلّي الصفوف تقفز
  // بعد كل نقرة على خلية. الثبات أهم في جدول بينضغط عليه كتير.
  const rows = (data?.rows || [])
    .filter((r) =>
      !search.trim() ||
      r.student_name?.toLowerCase().includes(search.trim().toLowerCase()) ||
      r.group_name?.toLowerCase().includes(search.trim().toLowerCase())
    )
    .slice()
    .sort((a, b) => (a.student_name || '').localeCompare(b.student_name || '', 'ar'));
  const s = data?.summary || {};

  const money = (v) => (v ?? 0).toFixed(2);

  return (
    <div className="space-y-4 md:space-y-6">
      {/* شريط الأدوات */}
      <div className={`p-4 rounded-xl ${isDark ? 'glass-card border border-white/10' : 'bg-white border border-slate-200 shadow-sm'}`}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-emerald-500/20 flex items-center justify-center">
              <DollarSign className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <h1 className={`text-lg md:text-xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>الرسوم المالية</h1>
              <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                {data?.students_count ?? 0} طالب · سنة {year}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={year}
              onChange={(e) => setYear(parseInt(e.target.value, 10))}
              className={`p-2 rounded-lg border text-sm ${isDark ? 'bg-slate-800 border-white/10 text-white' : 'bg-white border-slate-300'}`}
            >
              {[currentYear - 1, currentYear, currentYear + 1].map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <select
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              className={`p-2 rounded-lg border text-sm ${isDark ? 'bg-slate-800 border-white/10 text-white' : 'bg-white border-slate-300'}`}
            >
              <option value="all">كل المجموعات</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <Button variant="outline" onClick={exportExcel} className={isDark ? 'border-white/10 text-white hover:bg-white/5' : ''}>
              <FileDown className="w-4 h-4 ml-1" />Excel
            </Button>
            <Button variant="outline" onClick={() => setShowSettings(!showSettings)} className={isDark ? 'border-white/10 text-white hover:bg-white/5' : ''}>
              <Settings2 className="w-4 h-4 ml-1" />الإعدادات
              {showSettings ? <ChevronUp className="w-4 h-4 mr-1" /> : <ChevronDown className="w-4 h-4 mr-1" />}
            </Button>
          </div>
        </div>
      </div>

      {/* الإعدادات + التوليد */}
      {showSettings && (
        <Card className={`${isDark ? 'glass-card' : 'bg-white'} border-emerald-500/30`}>
          <CardHeader>
            <CardTitle className={`flex items-center gap-2 text-base ${isDark ? 'text-white' : 'text-slate-900'}`}>
              <Sparkles className="w-5 h-5 text-emerald-400" />
              القيمة الافتراضية والتوليد التلقائي
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1">
                <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>المبلغ الشهري الافتراضي</Label>
                <Input
                  type="number" min="0" step="0.5"
                  value={config.monthly_amount}
                  onChange={(e) => setConfig({ ...config, monthly_amount: e.target.value })}
                  className={isDark ? 'bg-slate-800 border-slate-700 text-white' : ''}
                />
              </div>
              <div className="flex items-end">
                <label className={`flex items-center gap-2 text-sm cursor-pointer ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                  <input
                    type="checkbox"
                    checked={!!config.auto_generate}
                    onChange={(e) => setConfig({ ...config, auto_generate: e.target.checked })}
                  />
                  توليد تلقائي لأي طالب جديد
                </label>
              </div>
              <div className="flex items-end gap-2">
                <Button onClick={saveConfig} disabled={savingConfig} className="bg-emerald-600 hover:bg-emerald-700 flex-1">
                  {savingConfig ? <Loader2 className="w-4 h-4 ml-1 animate-spin" /> : <Save className="w-4 h-4 ml-1" />}
                  حفظ
                </Button>
              </div>
            </div>

            <div className={`p-3 rounded-lg ${isDark ? 'bg-slate-800/50' : 'bg-slate-50'}`}>
              <p className={`text-sm mb-2 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                توليد رسوم كل أشهر سنة {year} لكل الطلاب — ما بيكرّر الأشهر الموجودة.
              </p>
              <Button onClick={generateYear} disabled={generating} className="bg-blue-600 hover:bg-blue-700">
                {generating ? <Loader2 className="w-4 h-4 ml-1 animate-spin" /> : <Sparkles className="w-4 h-4 ml-1" />}
                توليد رسوم سنة {year}
              </Button>
            </div>

            <div className={`p-3 rounded-lg ${isDark ? 'bg-slate-800/50' : 'bg-slate-50'}`}>
              <p className={`text-sm mb-2 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                تعديل مبلغ شهر معيّن لكل الطلاب (الأشهر المدفوعة ما بتتأثّر):
              </p>
              <div className="flex items-end gap-2 flex-wrap">
                <select
                  value={editMonth}
                  onChange={(e) => setEditMonth(e.target.value)}
                  className={`p-2 rounded-lg border text-sm ${isDark ? 'bg-slate-800 border-white/10 text-white' : 'bg-white border-slate-300'}`}
                >
                  <option value="">اختر الشهر</option>
                  {months.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                </select>
                <Input
                  type="number" min="0" step="0.5" placeholder="المبلغ"
                  value={editAmount}
                  onChange={(e) => setEditAmount(e.target.value)}
                  className={`w-32 ${isDark ? 'bg-slate-800 border-slate-700 text-white' : ''}`}
                />
                <Button onClick={applyMonthAmount} disabled={savingMonth} className="bg-amber-600 hover:bg-amber-700">
                  {savingMonth ? <Loader2 className="w-4 h-4 ml-1 animate-spin" /> : null}
                  تطبيق
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* بطاقات الملخّص */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4">
        {[
          { label: 'الإجمالي', value: s.total, icon: Wallet, color: 'text-blue-400', bg: 'bg-blue-500/10' },
          { label: 'المدفوع', value: s.paid, icon: CheckCircle, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
          { label: 'المستحق', value: s.due, icon: AlertCircle, color: 'text-red-400', bg: 'bg-red-500/10' },
          { label: 'القائم', value: s.pending, icon: Clock, color: 'text-slate-400', bg: 'bg-slate-500/10' },
        ].map((c) => {
          const Icon = c.icon;
          return (
            <Card key={c.label} className={isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'}>
              <CardContent className={`p-3 md:p-4 text-center ${c.bg} rounded-lg`}>
                <Icon className={`w-6 h-6 mx-auto mb-1 ${c.color}`} />
                <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>{c.label}</p>
                <p className={`text-lg md:text-xl font-bold ${c.color}`}>{money(c.value)}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* شريط نسبة التحصيل */}
      <Card className={isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className={`text-sm ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>نسبة التحصيل</span>
            <span className="text-sm font-bold text-emerald-400">{s.collection_rate ?? 0}%</span>
          </div>
          <div className={`h-2 rounded-full overflow-hidden ${isDark ? 'bg-slate-700' : 'bg-slate-200'}`}>
            <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.min(100, s.collection_rate || 0)}%` }} />
          </div>
          <p className={`text-xs mt-2 ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
            المتبقّي على الطلاب: <strong className="text-amber-400">{money(s.outstanding)}</strong> (مستحق {money(s.due)} + قائم {money(s.pending)})
          </p>
        </CardContent>
      </Card>

      {/* جدول الطلاب × الأشهر */}
      <Card className={isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'}>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className={`text-base ${isDark ? 'text-white' : 'text-slate-900'}`}>
              {rows.length} طالب
            </CardTitle>
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="بحث بالاسم أو المجموعة..."
                className={`pr-10 h-9 w-full md:w-64 ${isDark ? 'bg-slate-800 border-slate-700 text-white' : ''}`}
              />
            </div>
          </div>
          <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
            اضغط على أي شهر لتغيير حالته: قائم ← مدفوع ← مستحق
          </p>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : rows.length === 0 ? (
            <p className={`text-center py-8 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>لا يوجد طلاب</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className={isDark ? 'text-slate-400' : 'text-slate-600'}>
                    <th className="p-2 text-right whitespace-nowrap sticky right-0 z-10 bg-inherit">الطالب</th>
                    {months.map((m, i) => (
                      <th key={m} className="p-1 text-center text-[10px] w-10" title={m}>{i + 1}</th>
                    ))}
                    <th className="p-2 text-center whitespace-nowrap">مدفوع</th>
                    <th className="p-2 text-center whitespace-nowrap">متبقّي</th>
                    <th className="p-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.student_id} className={`border-t ${isDark ? 'border-white/5' : 'border-slate-100'}`}>
                      <td className="p-2 whitespace-nowrap">
                        <StudentLink studentId={r.student_id} name={r.student_name} className={`font-medium ${isDark ? 'text-white' : 'text-slate-900'}`} />
                        <p className={`text-[10px] ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>{r.group_name}</p>
                      </td>
                      {months.map((m, i) => {
                        const cell = r.months[String(i + 1)];
                        const style = cell ? CELL[cell.status] : EMPTY_CELL;
                        return (
                          <td key={m} className="p-0.5 text-center">
                            <button
                              onClick={() => cycleStatus(cell)}
                              disabled={!cell || busyCell === cell?.fee_id}
                              title={cell ? `${m}: ${style.label} — ${cell.amount}` : `${m}: غير مولَّد`}
                              className={`w-8 h-8 rounded border text-xs font-bold transition-transform ${style.bg} ${cell ? 'hover:scale-110 cursor-pointer' : 'cursor-default'}`}
                            >
                              {busyCell === cell?.fee_id ? '…' : style.short}
                            </button>
                          </td>
                        );
                      })}
                      <td className="p-2 text-center text-emerald-400 font-bold whitespace-nowrap">{money(r.paid)}</td>
                      <td className={`p-2 text-center font-bold whitespace-nowrap ${r.outstanding > 0 ? 'text-amber-400' : 'text-slate-500'}`}>
                        {money(r.outstanding)}
                      </td>
                      <td className="p-2">
                        <Button size="sm" variant="ghost" onClick={() => markRowPaid(r)} className="text-emerald-400 hover:bg-emerald-500/10 text-xs whitespace-nowrap" title="تعليم كل الأشهر كمدفوعة">
                          دفع الكل
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* دليل الألوان */}
              <div className="flex items-center gap-4 mt-4 flex-wrap text-xs">
                {Object.entries(CELL).map(([k, v]) => (
                  <span key={k} className="flex items-center gap-1">
                    <span className={`w-5 h-5 rounded border flex items-center justify-center font-bold ${v.bg}`}>{v.short}</span>
                    <span className={isDark ? 'text-slate-400' : 'text-slate-600'}>{v.label}</span>
                  </span>
                ))}
                <span className="flex items-center gap-1">
                  <span className={`w-5 h-5 rounded border ${EMPTY_CELL.bg}`} />
                  <span className={isDark ? 'text-slate-400' : 'text-slate-600'}>غير مولَّد</span>
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminFeesBoard;
