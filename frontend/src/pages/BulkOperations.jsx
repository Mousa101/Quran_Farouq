import { useState, useEffect } from 'react';
import axios from 'axios';
import { useTheme } from '../context/ThemeContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';
import { MoveRight, Loader2 } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// N4 - نقل الطلاب جماعيًا بين المجموعات
const CheckList = ({ items, idKey, labelFn, selected, onToggle, isDark, empty }) => (
  items.length === 0 ? <p className={`text-sm text-center py-4 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{empty}</p> : (
    <div className={`max-h-56 overflow-y-auto space-y-1 p-2 rounded-lg ${isDark ? 'bg-slate-800/40' : 'bg-slate-50'}`}>
      {items.map((it) => (
        <label key={it[idKey]} className={`flex items-center gap-2 p-2 rounded cursor-pointer text-sm ${isDark ? 'hover:bg-white/5 text-white' : 'hover:bg-white text-slate-900'}`}>
          <input type="checkbox" checked={selected.has(it[idKey])} onChange={() => onToggle(it[idKey])} />
          {labelFn(it)}
        </label>
      ))}
    </div>
  )
);

// أوضاع نقل الطالب — لازم تطابق TRANSFER_MODES في الخادم
const TRANSFER_MODES = [
  {
    value: 'with_data',
    label: 'نقل الطالب مع بياناته',
    hint: 'ينتقل التسميع وورق المتابعة إلى مشرف المجموعة الجديدة، وتبقى النقاط كما هي.',
  },
  {
    value: 'keep_old',
    label: 'نقل بدون البيانات',
    hint: 'ينتقل الطالب، وتبقى سجلاته السابقة مسجّلة لدى مشرف مجموعته القديمة.',
  },
  {
    value: 'fresh_start',
    label: 'البدء ببيانات جديدة',
    hint: 'أرشفة كل بيانات الطالب (تسميع/حضور/متابعة) وتصفير نقاطه ليبدأ من الصفر. وتبقى البيانات محفوظة في الأرشيف.',
    danger: true,
  },
];

const BulkOperations = ({ onChanged }) => {
  const { isDark } = useTheme();
  const [students, setStudents] = useState([]);
  const [groups, setGroups] = useState([]);
  const [selMove, setSelMove] = useState(new Set());
  const [moveGroup, setMoveGroup] = useState('');
  const [transferMode, setTransferMode] = useState('with_data'); // with_data | keep_old | fresh_start
  const [moving, setMoving] = useState(false);

  useEffect(() => { refresh(); }, []);

  const refresh = async () => {
    try {
      const [s, g] = await Promise.all([
        axios.get(`${API}/reports/student-stats?sort_by=name&order=asc`),
        axios.get(`${API}/groups`),
      ]);
      setStudents((s.data.rows || []).map((r) => ({ id: r.student_id, name: r.name, group_name: r.group_name })));
      setGroups(g.data || []);
    } catch (e) { console.error(e); }
  };

  const toggle = (set, setter) => (id) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id); else next.add(id);
    setter(next);
  };

  const doMove = async () => {
    if (selMove.size === 0) { toast.error('اختر طالبًا واحدًا على الأقل'); return; }
    if (!moveGroup) { toast.error('اختر المجموعة'); return; }
    // «البدء ببيانات جديدة» بيأرشف ويصفّر — تأكيد قبل التنفيذ
    if (transferMode === 'fresh_start') {
      const ok = window.confirm(
        `سيتم أرشفة بيانات ${selMove.size} طالب (التسميع والحضور وورق المتابعة) وتصفير نقاطهم ليبدأوا من جديد.\n` +
        'البيانات تبقى محفوظة في الأرشيف. هل تريد المتابعة؟'
      );
      if (!ok) return;
    }
    setMoving(true);
    try {
      const res = await axios.post(`${API}/admin/bulk/change-group`, {
        student_ids: [...selMove], group_id: moveGroup, mode: transferMode,
      });
      const a = res.data.archived;
      toast.success(
        a
          ? `${res.data.message} — أُرشِف ${a.recitations} تسميع و${a.attendance} حضور و${a.tracking_sheets} ورقة متابعة`
          : res.data.message
      );
      setSelMove(new Set());
      refresh();
      onChanged?.();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'فشل في النقل');
    } finally {
      setMoving(false);
    }
  };

  const card = (icon, title) => (
    <CardHeader className="pb-2"><CardTitle className={`text-base flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>{icon}{title}</CardTitle></CardHeader>
  );

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Bulk move */}
      <Card className={isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'}>
        {card(<MoveRight className="w-4 h-4 text-blue-400" />, 'نقل الطلاب بين المجموعات')}
        <CardContent className="space-y-3">
          <CheckList items={students} idKey="id" labelFn={(s) => `${s.name}${s.group_name ? ` · ${s.group_name}` : ''}`} selected={selMove} onToggle={toggle(selMove, setSelMove)} isDark={isDark} empty="لا يوجد طلاب" />
          {/* وضع النقل — ماذا يحدث لبيانات الطالب */}
          <div className="space-y-2">
            <p className={`text-sm font-medium ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>ماذا يحدث لبيانات الطالب؟</p>
            {TRANSFER_MODES.map((m) => (
              <label
                key={m.value}
                className={`flex items-start gap-2 text-sm cursor-pointer p-2 rounded-lg border transition-colors ${
                  transferMode === m.value
                    ? (isDark ? 'bg-blue-500/10 border-blue-500/40' : 'bg-blue-50 border-blue-300')
                    : (isDark ? 'border-white/10 hover:bg-white/5' : 'border-slate-200 hover:bg-slate-50')
                }`}
              >
                <input
                  type="radio"
                  name="transfer-mode"
                  value={m.value}
                  checked={transferMode === m.value}
                  onChange={() => setTransferMode(m.value)}
                  className="mt-1"
                />
                <span>
                  <span className={`font-medium ${m.danger ? 'text-amber-400' : (isDark ? 'text-slate-200' : 'text-slate-800')}`}>
                    {m.label}
                  </span>
                  <span className={`block text-xs ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>{m.hint}</span>
                </span>
              </label>
            ))}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <select value={moveGroup} onChange={(e) => setMoveGroup(e.target.value)} className={`p-2 rounded-lg border text-sm ${isDark ? 'bg-slate-800 border-white/10 text-white' : 'bg-white border-slate-300'}`}>
              <option value="">اختر المجموعة </option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <Button
              onClick={doMove}
              disabled={selMove.size === 0 || moving}
              className={transferMode === 'fresh_start' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-blue-600 hover:bg-blue-700'}
            >
              {moving ? <Loader2 className="w-4 h-4 ml-1 animate-spin" /> : <MoveRight className="w-4 h-4 ml-1" />}
              نقل المحدّدين ({selMove.size})
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default BulkOperations;
