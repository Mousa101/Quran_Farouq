import { useState, useEffect } from 'react';
import axios from 'axios';
import { useTheme } from '../context/ThemeContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { toast } from 'sonner';
import { Layers, UserCheck, MoveRight, Send } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// N4 - العمليات الجماعية
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

const BulkOperations = () => {
  const { isDark } = useTheme();
  const [pending, setPending] = useState([]);
  const [students, setStudents] = useState([]);
  const [groups, setGroups] = useState([]);
  const [selPending, setSelPending] = useState(new Set());
  const [selMove, setSelMove] = useState(new Set());
  const [selNotify, setSelNotify] = useState(new Set());
  const [moveGroup, setMoveGroup] = useState('');
  const [moveData, setMoveData] = useState(true); // نقل بيانات الطالب للمجموعة الجديدة
  const [notifyTitle, setNotifyTitle] = useState('');
  const [notifyMsg, setNotifyMsg] = useState('');

  useEffect(() => { refresh(); }, []);

  const refresh = async () => {
    try {
      const [p, s, g] = await Promise.all([
        axios.get(`${API}/admin/pending-students`),
        axios.get(`${API}/reports/student-stats?sort_by=name&order=asc`),
        axios.get(`${API}/groups`),
      ]);
      setPending(p.data || []);
      setStudents((s.data.rows || []).map((r) => ({ id: r.student_id, name: r.name, group_name: r.group_name })));
      setGroups(g.data || []);
    } catch (e) { console.error(e); }
  };

  const toggle = (set, setter) => (id) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id); else next.add(id);
    setter(next);
  };

  const doActivate = async () => {
    if (selPending.size === 0) { toast.error('اختر حسابًا واحدًا على الأقل'); return; }
    try {
      const res = await axios.post(`${API}/admin/bulk/activate`, { user_ids: [...selPending] });
      toast.success(res.data.message);
      setSelPending(new Set());
      refresh();
    } catch (e) { toast.error('فشل في التفعيل'); }
  };

  const doMove = async () => {
    if (selMove.size === 0) { toast.error('اختر طالبًا واحدًا على الأقل'); return; }
    if (!moveGroup) { toast.error('اختر المجموعة'); return; }
    try {
      const res = await axios.post(`${API}/admin/bulk/change-group`, { student_ids: [...selMove], group_id: moveGroup, move_data: moveData });
      toast.success(res.data.message);
      setSelMove(new Set());
      refresh();
    } catch (e) { toast.error('فشل في النقل'); }
  };

  const doNotify = async () => {
    if (selNotify.size === 0) { toast.error('اختر مستلمًا واحدًا على الأقل'); return; }
    if (!notifyTitle.trim() || !notifyMsg.trim()) { toast.error('أدخل العنوان والنص'); return; }
    try {
      const res = await axios.post(`${API}/admin/bulk/notify`, { user_ids: [...selNotify], title: notifyTitle, message: notifyMsg });
      toast.success(res.data.message);
      setSelNotify(new Set()); setNotifyTitle(''); setNotifyMsg('');
    } catch (e) { toast.error('فشل في الإرسال'); }
  };

  const card = (icon, title) => (
    <CardHeader className="pb-2"><CardTitle className={`text-base flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>{icon}{title}</CardTitle></CardHeader>
  );

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className={`p-6 rounded-xl ${isDark ? 'glass-card border border-white/10' : 'bg-white border border-slate-200 shadow-sm'}`}>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center"><Layers className="w-6 h-6 text-purple-400" /></div>
          <div>
            <h1 className={`text-xl md:text-2xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>العمليات الجماعية</h1>
            <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>اعتماد التسجيل · نقل بين المجموعات · إشعار جماعي</p>
          </div>
        </div>
      </div>

      {/* Bulk activate */}
      <Card className={isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'}>
        {card(<UserCheck className="w-4 h-4 text-emerald-400" />, `اعتماد التسجيل (${pending.length} معلّق)`)}
        <CardContent className="space-y-3">
          <CheckList items={pending} idKey="id" labelFn={(s) => `${s.name} · ${s.email}`} selected={selPending} onToggle={toggle(selPending, setSelPending)} isDark={isDark} empty="لا توجد حسابات معلّقة" />
          <Button onClick={doActivate} disabled={selPending.size === 0} className="bg-emerald-600 hover:bg-emerald-700"><UserCheck className="w-4 h-4 ml-1" />تفعيل المحدّدين ({selPending.size})</Button>
        </CardContent>
      </Card>

      {/* Bulk move */}
      <Card className={isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'}>
        {card(<MoveRight className="w-4 h-4 text-blue-400" />, 'نقل الطلاب بين المجموعات')}
        <CardContent className="space-y-3">
          <CheckList items={students} idKey="id" labelFn={(s) => `${s.name}${s.group_name ? ` · ${s.group_name}` : ''}`} selected={selMove} onToggle={toggle(selMove, setSelMove)} isDark={isDark} empty="لا يوجد طلاب" />
          <label className={`flex items-center gap-2 text-sm cursor-pointer ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
            <input type="checkbox" checked={moveData} onChange={(e) => setMoveData(e.target.checked)} />
            نقل بيانات الطالب (التسميع وورق المتابعة) لمشرف المجموعة الجديدة
            <span className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>— إن أُلغيت، تبقى البيانات القديمة مع المجموعة السابقة</span>
          </label>
          <div className="flex items-center gap-2 flex-wrap">
            <select value={moveGroup} onChange={(e) => setMoveGroup(e.target.value)} className={`p-2 rounded-lg border text-sm ${isDark ? 'bg-slate-800 border-white/10 text-white' : 'bg-white border-slate-300'}`}>
              <option value="">اختر المجموعة الهدف</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <Button onClick={doMove} disabled={selMove.size === 0} className="bg-blue-600 hover:bg-blue-700"><MoveRight className="w-4 h-4 ml-1" />نقل المحدّدين ({selMove.size})</Button>
          </div>
        </CardContent>
      </Card>

      {/* Bulk notify */}
      <Card className={isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'}>
        {card(<Send className="w-4 h-4 text-amber-400" />, 'إشعار جماعي للطلاب')}
        <CardContent className="space-y-3">
          <CheckList items={students} idKey="id" labelFn={(s) => s.name} selected={selNotify} onToggle={toggle(selNotify, setSelNotify)} isDark={isDark} empty="لا يوجد طلاب" />
          <Input value={notifyTitle} onChange={(e) => setNotifyTitle(e.target.value)} placeholder="عنوان الإشعار" className={isDark ? 'bg-slate-800 border-white/10 text-white' : ''} />
          <Textarea value={notifyMsg} onChange={(e) => setNotifyMsg(e.target.value)} placeholder="نص الإشعار" className={isDark ? 'bg-slate-800 border-white/10 text-white' : ''} />
          <Button onClick={doNotify} disabled={selNotify.size === 0} className="bg-amber-600 hover:bg-amber-700"><Send className="w-4 h-4 ml-1" />إرسال للمحدّدين ({selNotify.size})</Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default BulkOperations;
