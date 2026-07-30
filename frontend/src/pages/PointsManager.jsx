import { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../components/ui/dialog';
import { toast } from 'sonner';
import {
  Star, Plus, Minus, Lock, Unlock, History, Search, Loader2, Trash2,
  UserCheck, BookOpen, FileText, Award, ArrowRight
} from 'lucide-react';
import StudentLink from '../components/StudentLink';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// أنواع التعديل اليدوي
const ADJUST_TYPES = [
  { key: 'bonus', label: 'إضافة نقاط', icon: Plus, color: 'emerald', hint: 'نقاط خارجية (مسابقة، مبادرة، إنجاز خارج النظام)' },
  { key: 'deduction', label: 'خصم نقاط', icon: Minus, color: 'red', hint: 'خصم من رصيد الطالب' },
  { key: 'freeze', label: 'تجميد نقاط', icon: Lock, color: 'amber', hint: 'حجز مبلغ مؤقتًا — بينخصم من المتاح وبيرجع لما تفكّه' },
];

// أيقونة ولون كل مصدر في السجل
const SOURCE_META = {
  attendance: { icon: UserCheck, color: 'text-emerald-400' },
  recitation: { icon: BookOpen, color: 'text-blue-400' },
  tracking: { icon: FileText, color: 'text-purple-400' },
  admin_bonus: { icon: Award, color: 'text-amber-400' },
  bonus: { icon: Plus, color: 'text-emerald-400' },
  deduction: { icon: Minus, color: 'text-red-400' },
  freeze: { icon: Lock, color: 'text-amber-400' },
};

const PointsManager = () => {
  const { user } = useAuth();
  const { isDark } = useTheme();

  const [rows, setRows] = useState([]);
  const [groups, setGroups] = useState([]);
  const [groupId, setGroupId] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  // حوار التعديل
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [target, setTarget] = useState(null);
  const [adjustType, setAdjustType] = useState('bonus');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // السجل
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [ledger, setLedger] = useState(null);
  const [ledgerFilter, setLedgerFilter] = useState('all');
  const [ledgerLoading, setLedgerLoading] = useState(false);

  useEffect(() => {
    axios.get(`${API}/groups`).then((r) => setGroups(r.data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    fetchOverview();
    // eslint-disable-next-line
  }, [groupId]);

  const fetchOverview = async () => {
    setLoading(true);
    try {
      const p = groupId !== 'all' ? `?group_id=${groupId}` : '';
      const res = await axios.get(`${API}/points/overview${p}`);
      setRows(res.data?.students || []);
    } catch (e) {
      toast.error('فشل في تحميل النقاط');
    } finally {
      setLoading(false);
    }
  };

  const openAdjust = (row, type) => {
    setLedgerOpen(false); // ما نفتح حوارين فوق بعض
    setTarget(row);
    setAdjustType(type);
    setAmount('');
    setReason('');
    setAdjustOpen(true);
  };

  const submitAdjust = async () => {
    const pts = parseInt(amount, 10);
    if (!pts || pts <= 0) { toast.error('أدخل مقدارًا أكبر من صفر'); return; }
    setSubmitting(true);
    try {
      const res = await axios.post(`${API}/points/adjust`, {
        student_id: target.student_id, type: adjustType, points: pts, reason: reason.trim() || null,
      });
      toast.success(res.data.message);
      // حدّث أرصدة الطالب في الحوار من رد الخادم (لو المستخدم عمل عملية تانية بلا ما يسكّر)
      const p = res.data.points || {};
      setTarget((t) => (t ? {
        ...t,
        total_points: p.total_points ?? t.total_points,
        frozen_points: p.frozen_points ?? t.frozen_points,
        available_points: p.available_points ?? t.available_points,
      } : t));
      setAmount('');
      setReason('');
      setAdjustOpen(false);
      fetchOverview();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'فشل في تنفيذ العملية');
    } finally {
      setSubmitting(false);
    }
  };

  const loadLedger = async (studentId, src = ledgerFilter) => {
    setLedgerLoading(true);
    try {
      const q = src && src !== 'all' ? `?source=${src}` : '';
      const res = await axios.get(`${API}/points/ledger/${studentId}${q}`);
      setLedger(res.data);
    } catch (e) {
      toast.error('فشل في تحميل السجل');
    } finally {
      setLedgerLoading(false);
    }
  };

  const openLedger = (row) => {
    setAdjustOpen(false);
    setLedgerFilter('all');
    setLedger(null); // ما نعرض سجل طالب سابق ريثما يُحمَّل الجديد
    setLedgerOpen(true);
    loadLedger(row.student_id, 'all');
  };

  const releaseFreeze = async (id) => {
    try {
      const res = await axios.post(`${API}/points/freeze/${id}/release`);
      toast.success(res.data.message);
      loadLedger(ledger.student_id);
      fetchOverview();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'فشل في فكّ التجميد');
    }
  };

  const deleteAdjustment = async (id) => {
    if (!window.confirm('حذف هذا التعديل وإعادة احتساب نقاط الطالب؟')) return;
    try {
      const res = await axios.delete(`${API}/points/adjustments/${id}`);
      toast.success(res.data.message);
      loadLedger(ledger.student_id);
      fetchOverview();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'فشل في الحذف');
    }
  };

  const filtered = rows.filter((r) =>
    !search.trim() ||
    r.student_name?.toLowerCase().includes(search.trim().toLowerCase()) ||
    r.group_name?.toLowerCase().includes(search.trim().toLowerCase())
  );

  const activeType = ADJUST_TYPES.find((t) => t.key === adjustType);

  return (
    <div className="space-y-4 md:space-y-6 animate-fadeIn">
      {/* Header */}
      <div className={`p-4 md:p-6 rounded-xl ${isDark ? 'glass-card border border-white/10' : 'bg-white border border-slate-200 shadow-sm'}`}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center">
              <Star className="w-6 h-6 text-amber-400" />
            </div>
            <div>
              <h1 className={`text-lg md:text-2xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>إدارة النقاط</h1>
              <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                إضافة نقاط خارجية · خصم · تجميد — مع سجل كامل لكل طالب
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              className={`p-2 rounded-lg border text-sm ${isDark ? 'bg-slate-800 border-white/10 text-white' : 'bg-white border-slate-300'}`}
            >
              <option value="all">كل المجموعات</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="بحث..."
                className={`pr-10 h-10 w-full md:w-56 ${isDark ? 'bg-slate-800 border-slate-700 text-white' : ''}`}
              />
            </div>
          </div>
        </div>
      </div>

      {/* جدول الطلاب */}
      <Card className={isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'}>
        <CardHeader className="pb-2">
          <CardTitle className={`text-base ${isDark ? 'text-white' : 'text-slate-900'}`}>
            {filtered.length} طالب
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <p className={`text-center py-8 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>لا يوجد طلاب</p>
          ) : (
            <div className="space-y-2">
              {filtered.map((r) => (
                <div key={r.student_id} className={`p-3 rounded-xl ${isDark ? 'bg-slate-800/50' : 'bg-slate-50'}`}>
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <StudentLink studentId={r.student_id} name={r.student_name} className={`font-medium ${isDark ? 'text-white' : 'text-slate-900'}`} />
                      <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{r.group_name}</p>
                    </div>

                    {/* الأرصدة */}
                    <div className="flex items-center gap-3 text-center flex-shrink-0">
                      <div>
                        <p className={`text-[10px] ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>الإجمالي</p>
                        <p className="text-lg font-bold text-amber-400">{r.total_points}</p>
                      </div>
                      {r.frozen_points > 0 && (
                        <>
                          <div>
                            <p className={`text-[10px] ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>مجمّد</p>
                            <p className="text-lg font-bold text-slate-400">{r.frozen_points}</p>
                          </div>
                          <div>
                            <p className={`text-[10px] ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>المتاح</p>
                            <p className="text-lg font-bold text-emerald-400">{r.available_points}</p>
                          </div>
                        </>
                      )}
                      {r.manual_points !== 0 && (
                        <div>
                          <p className={`text-[10px] ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>يدوي</p>
                          <p className={`text-lg font-bold ${r.manual_points > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {r.manual_points > 0 ? '+' : ''}{r.manual_points}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* الإجراءات */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {ADJUST_TYPES.map((t) => {
                        const Icon = t.icon;
                        return (
                          <Button
                            key={t.key}
                            size="sm"
                            variant="ghost"
                            onClick={() => openAdjust(r, t.key)}
                            className={`text-${t.color}-400 hover:bg-${t.color}-500/10`}
                            title={t.label}
                          >
                            <Icon className="w-4 h-4" />
                          </Button>
                        );
                      })}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => openLedger(r)}
                        className="text-slate-400 hover:text-blue-400"
                        title="سجل النقاط"
                      >
                        <History className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  {/* تفصيل مصادر النقاط */}
                  <div className={`flex items-center gap-3 mt-2 text-[11px] flex-wrap ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                    <span>حضور {r.attendance_points}</span>
                    <span>تسميع {r.recitation_points}</span>
                    <span>متابعة {r.tracking_points}</span>
                    {r.active_freezes > 0 && (
                      <span className="text-amber-400">🔒 {r.active_freezes} تجميد سارٍ</span>
                    )}
                    {r.adjustments_count > 0 && (
                      <span className="text-blue-400">{r.adjustments_count} تعديل يدوي</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* حوار التعديل */}
      <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
        <DialogContent className={isDark ? 'bg-slate-900 border-slate-700' : 'bg-white'}>
          <DialogHeader>
            <DialogTitle className={`flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
              {activeType && <activeType.icon className={`w-5 h-5 text-${activeType.color}-400`} />}
              {activeType?.label} — {target?.student_name}
            </DialogTitle>
            <DialogDescription className={isDark ? 'text-slate-400' : 'text-slate-600'}>
              {activeType?.hint}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            {/* اختيار النوع */}
            <div className="grid grid-cols-3 gap-2">
              {ADJUST_TYPES.map((t) => {
                const Icon = t.icon;
                const on = adjustType === t.key;
                return (
                  <button
                    key={t.key}
                    onClick={() => setAdjustType(t.key)}
                    className={`p-2 rounded-lg border text-center text-xs transition-colors ${
                      on ? `bg-${t.color}-500/20 border-${t.color}-500/50 text-${t.color}-400`
                         : isDark ? 'border-white/10 text-slate-400 hover:bg-white/5' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Icon className="w-4 h-4 mx-auto mb-1" />
                    {t.label}
                  </button>
                );
              })}
            </div>

            {/* رصيد الطالب الحالي */}
            {target && (
              <div className={`p-3 rounded-lg text-sm ${isDark ? 'bg-slate-800' : 'bg-slate-100'}`}>
                <div className="flex items-center justify-around text-center">
                  <div>
                    <p className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>الإجمالي</p>
                    <p className="font-bold text-amber-400">{target.total_points}</p>
                  </div>
                  <div>
                    <p className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>المجمّد</p>
                    <p className="font-bold text-slate-400">{target.frozen_points}</p>
                  </div>
                  <div>
                    <p className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>المتاح</p>
                    <p className="font-bold text-emerald-400">{target.available_points}</p>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>المقدار</Label>
              <Input
                type="number" min="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="عدد النقاط"
                className={isDark ? 'bg-slate-800 border-slate-700 text-white' : ''}
              />
            </div>

            <div className="space-y-2">
              <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>السبب (يظهر للطالب)</Label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="مثال: الفوز بمسابقة، مساعدة زملائه، مخالفة سلوكية..."
                className={isDark ? 'bg-slate-800 border-slate-700 text-white' : ''}
              />
            </div>
          </div>

          <DialogFooter className="gap-2 mt-4">
            <Button variant="ghost" onClick={() => setAdjustOpen(false)}>إلغاء</Button>
            <Button
              onClick={submitAdjust}
              disabled={submitting}
              className={
                adjustType === 'bonus' ? 'bg-emerald-600 hover:bg-emerald-700'
                : adjustType === 'deduction' ? 'bg-red-600 hover:bg-red-700'
                : 'bg-amber-600 hover:bg-amber-700'
              }
            >
              {submitting ? <Loader2 className="w-4 h-4 ml-1 animate-spin" /> : null}
              تنفيذ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* سجل النقاط */}
      <Dialog open={ledgerOpen} onOpenChange={setLedgerOpen}>
        <DialogContent className={`max-w-2xl max-h-[85vh] overflow-hidden flex flex-col ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white'}`}>
          <DialogHeader>
            <DialogTitle className={`flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
              <History className="w-5 h-5 text-blue-400" />
              سجل نقاط {ledger?.student_name}
            </DialogTitle>
          </DialogHeader>

          {ledgerLoading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
            </div>
          ) : !ledger ? null : (
            <>
              {/* الأرصدة */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'الإجمالي', value: ledger.totals.total_points, color: 'text-amber-400' },
                  { label: 'المجمّد', value: ledger.totals.frozen_points, color: 'text-slate-400' },
                  { label: 'المتاح', value: ledger.totals.available_points, color: 'text-emerald-400' },
                ].map((c) => (
                  <div key={c.label} className={`p-2 rounded-lg text-center ${isDark ? 'bg-slate-800' : 'bg-slate-100'}`}>
                    <p className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{c.label}</p>
                    <p className={`text-lg font-bold ${c.color}`}>{c.value}</p>
                  </div>
                ))}
              </div>

              {/* التجميدات السارية */}
              {ledger.active_freezes?.length > 0 && (
                <div className={`p-2 rounded-lg space-y-1 ${isDark ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-amber-50 border border-amber-200'}`}>
                  <p className="text-xs font-bold text-amber-400">تجميدات سارية</p>
                  {ledger.active_freezes.map((f) => (
                    <div key={f.id} className="flex items-center justify-between gap-2 text-xs">
                      <span className={isDark ? 'text-slate-300' : 'text-slate-700'}>
                        🔒 {f.points} نقطة {f.reason ? `— ${f.reason}` : ''}
                      </span>
                      <Button size="sm" variant="ghost" onClick={() => releaseFreeze(f.id)} className="text-emerald-400 hover:bg-emerald-500/10 h-7 text-xs">
                        <Unlock className="w-3 h-3 ml-1" />فكّ التجميد
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {/* فلتر المصدر */}
              <div className="flex items-center gap-1 flex-wrap">
                {['all', ...Object.keys(ledger.source_labels)].map((k) => (
                  <button
                    key={k}
                    onClick={() => { setLedgerFilter(k); loadLedger(ledger.student_id, k); }}
                    className={`px-2 py-1 rounded text-[11px] transition-colors ${
                      ledgerFilter === k
                        ? 'bg-blue-500/20 text-blue-400 border border-blue-500/40'
                        : isDark ? 'bg-slate-800 text-slate-400 border border-white/10' : 'bg-slate-100 text-slate-600 border border-slate-200'
                    }`}
                  >
                    {k === 'all' ? 'الكل' : ledger.source_labels[k]}
                    {k !== 'all' && ledger.by_source[k] !== undefined && ` (${ledger.by_source[k]})`}
                  </button>
                ))}
              </div>

              {/* الحركات */}
              <div className="flex-1 overflow-y-auto space-y-1 pr-1">
                {ledger.entries.length === 0 ? (
                  <p className={`text-center py-8 text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>لا توجد حركات</p>
                ) : ledger.entries.map((e, i) => {
                  const meta = SOURCE_META[e.source] || SOURCE_META.attendance;
                  const Icon = meta.icon;
                  const isFreeze = e.source === 'freeze';
                  return (
                    <div key={e.adjustment_id || `${e.source}-${i}`} className={`p-2 rounded-lg flex items-center justify-between gap-2 ${isDark ? 'bg-slate-800/50' : 'bg-slate-50'}`}>
                      <div className="flex items-center gap-2 min-w-0">
                        <Icon className={`w-4 h-4 flex-shrink-0 ${meta.color}`} />
                        <div className="min-w-0">
                          <p className={`text-xs truncate ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{e.description}</p>
                          <p className={`text-[10px] ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                            {e.date || '—'}
                            {e.by && ` · بواسطة ${e.by}`}
                            {isFreeze && (e.active ? ' · سارٍ' : ' · مفكوك')}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <span className={`text-sm font-bold ${
                          isFreeze ? 'text-amber-400' : e.points > 0 ? 'text-emerald-400' : 'text-red-400'
                        }`}>
                          {isFreeze ? `🔒 ${e.points}` : `${e.points > 0 ? '+' : ''}${e.points}`}
                        </span>
                        {e.adjustment_id && (
                          <Button
                            size="sm" variant="ghost"
                            onClick={() => deleteAdjustment(e.adjustment_id)}
                            className="text-red-400 hover:bg-red-500/10 h-7 w-7 p-0"
                            title="حذف هذا التعديل"
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <p className={`text-[11px] ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                {ledger.count} حركة · التجميد ما بيغيّر الإجمالي، بس بيحجز من المتاح.
              </p>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PointsManager;
