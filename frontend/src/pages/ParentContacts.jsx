import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Button } from '../components/ui/button';
import { Textarea } from '../components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import StudentLink from '../components/StudentLink';
import { PhoneCall, Plus, Loader2, History, Trash2, CheckCircle2, XCircle, Search } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const METHODS = ['اتصال', 'واتساب', 'رسالة', 'زيارة', 'لقاء في المركز', 'أخرى'];
const today = () => new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 10);
const EMPTY = { contacted: true, contact_date: today(), method: 'اتصال', notes: '' };

// ملف التواصل مع الأهل: لكل طالب هل تم التواصل مع أهله، متى، وكيف، والملاحظات.
// المشرف يسجّل لطلابه، والمدير يرى ويسجّل للجميع.
const ParentContacts = () => {
  const { isDark } = useTheme();
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [groups, setGroups] = useState([]);
  const [groupId, setGroupId] = useState('all');
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [addFor, setAddFor] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [historyFor, setHistoryFor] = useState(null);
  const [history, setHistory] = useState([]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/parent-contacts/summary`, { params: groupId !== 'all' ? { group_id: groupId } : {} });
      setRows(res.data || []);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'تعذّر تحميل ملف التواصل');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { axios.get(`${API}/groups`).then((r) => setGroups(r.data || [])).catch(() => {}); }, []);
  useEffect(() => { load(); }, [groupId]);

  const shown = useMemo(() => rows.filter((r) => {
    if (q && !r.student_name.includes(q.trim())) return false;
    if (filter === 'done') return r.last_contact?.contacted;
    if (filter === 'not') return !r.last_contact?.contacted;
    return true;
  }), [rows, q, filter]);

  const openHistory = async (r) => {
    setHistoryFor(r);
    setHistory([]);
    try {
      const res = await axios.get(`${API}/parent-contacts`, { params: { student_id: r.student_id } });
      setHistory(res.data || []);
    } catch { toast.error('تعذّر تحميل السجل'); }
  };

  const save = async () => {
    setSaving(true);
    try {
      await axios.post(`${API}/parent-contacts`, { ...form, student_id: addFor.student_id });
      toast.success('تم حفظ التواصل');
      setAddFor(null);
      load();
      if (historyFor?.student_id === addFor.student_id) openHistory(historyFor);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'فشل الحفظ');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    if (!window.confirm('حذف هذا السجل؟')) return;
    try {
      await axios.delete(`${API}/parent-contacts/${id}`);
      toast.success('تم الحذف');
      setHistory((h) => h.filter((x) => x.id !== id));
      load();
    } catch (e) { toast.error(e.response?.data?.detail || 'فشل الحذف'); }
  };

  const muted = isDark ? 'text-slate-400' : 'text-slate-600';
  const strong = isDark ? 'text-white' : 'text-slate-900';
  const doneCount = rows.filter((r) => r.last_contact?.contacted).length;

  return (
    <div className="space-y-4" dir="rtl" data-testid="parent-contacts-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className={`text-2xl font-bold flex items-center gap-2 ${strong}`}>
          <PhoneCall className="w-6 h-6 text-emerald-500" />
          ملف التواصل مع الأهل
        </h1>
        <span className={`text-sm ${muted}`}>تم التواصل مع أهل {doneCount} من {rows.length} طالب</span>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative">
          <Search className={`w-4 h-4 absolute right-2 top-1/2 -translate-y-1/2 ${muted}`} />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث باسم الطالب" className="pr-8 w-52" />
        </div>
        <Select value={groupId} onValueChange={setGroupId}>
          <SelectTrigger className="w-48"><SelectValue placeholder="المجموعة" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل المجموعات</SelectItem>
            {groups.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">الكل</SelectItem>
            <SelectItem value="done">تم التواصل</SelectItem>
            <SelectItem value="not">لم يتم التواصل</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card className={isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'}>
        <CardContent className="p-0 overflow-x-auto">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-emerald-500" /></div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className={`border-b ${isDark ? 'border-white/10' : 'border-slate-200'} ${muted}`}>
                  <th className="px-3 py-2 text-right font-medium">الطالب</th>
                  <th className="px-3 py-2 text-right font-medium">المجموعة</th>
                  <th className="px-3 py-2 text-right font-medium">هاتف ولي الأمر</th>
                  <th className="px-3 py-2 text-right font-medium">التواصل</th>
                  <th className="px-3 py-2 text-right font-medium">آخر تواصل</th>
                  <th className="px-3 py-2 text-right font-medium">الملاحظات</th>
                  <th className="px-3 py-2 text-right font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => {
                  const c = r.last_contact;
                  return (
                    <tr key={r.student_id} className={`border-b ${isDark ? 'border-white/5' : 'border-slate-100'}`} data-testid={`contact-row-${r.student_id}`}>
                      <td className={`px-3 py-2 ${strong}`}><StudentLink studentId={r.student_id} name={r.student_name} /></td>
                      <td className={`px-3 py-2 ${muted}`}>{r.group_name}</td>
                      <td className={`px-3 py-2 ${muted}`} dir="ltr">{r.parent_phone || '—'}</td>
                      <td className="px-3 py-2">
                        {c?.contacted ? (
                          <span className="text-emerald-500 flex items-center gap-1"><CheckCircle2 className="w-4 h-4" />تم ({r.contacts_count})</span>
                        ) : (
                          <span className="text-red-400 flex items-center gap-1"><XCircle className="w-4 h-4" />{c ? 'لم يتم (محاولة)' : 'لم يتم'}</span>
                        )}
                      </td>
                      <td className={`px-3 py-2 whitespace-nowrap ${muted}`}>{c ? `${c.contact_date}${c.method ? ` · ${c.method}` : ''}` : '—'}</td>
                      <td className={`px-3 py-2 max-w-xs truncate ${muted}`} title={c?.notes || ''}>{c?.notes || '—'}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <Button size="sm" variant="ghost" className="text-emerald-500" onClick={() => { setAddFor(r); setForm({ ...EMPTY, contact_date: today() }); }} data-testid={`add-contact-${r.student_id}`}>
                          <Plus className="w-4 h-4 ml-1" />تسجيل
                        </Button>
                        <Button size="sm" variant="ghost" className={muted} onClick={() => openHistory(r)} title="السجل">
                          <History className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
                {shown.length === 0 && (
                  <tr><td colSpan={7} className={`text-center py-8 ${muted}`}>لا يوجد طلاب</td></tr>
                )}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* تسجيل تواصل */}
      <Dialog open={!!addFor} onOpenChange={(o) => !o && setAddFor(null)}>
        <DialogContent className={isDark ? 'bg-slate-900 border-slate-700' : 'bg-white'} dir="rtl">
          <DialogHeader><DialogTitle className={strong}>التواصل مع أهل {addFor?.student_name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Button type="button" variant={form.contacted ? 'default' : 'outline'} className={form.contacted ? 'bg-emerald-600 hover:bg-emerald-700' : ''}
                onClick={() => setForm((f) => ({ ...f, contacted: true }))}>تم التواصل</Button>
              <Button type="button" variant={!form.contacted ? 'default' : 'outline'} className={!form.contacted ? 'bg-red-600 hover:bg-red-700' : ''}
                onClick={() => setForm((f) => ({ ...f, contacted: false }))}>لم يتم (لم يُرَد)</Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className={muted}>التاريخ</Label>
                <Input type="date" value={form.contact_date} onChange={(e) => setForm((f) => ({ ...f, contact_date: e.target.value }))} />
              </div>
              <div>
                <Label className={muted}>الطريقة</Label>
                <Select value={form.method} onValueChange={(v) => setForm((f) => ({ ...f, method: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className={muted}>الملاحظات</Label>
              <Textarea rows={4} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="ما الذي تم الحديث عنه..." data-testid="contact-notes" />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setAddFor(null)}>إلغاء</Button>
            <Button onClick={save} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700" data-testid="contact-save">
              {saving && <Loader2 className="w-4 h-4 ml-1 animate-spin" />}حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* سجل التواصل */}
      <Dialog open={!!historyFor} onOpenChange={(o) => !o && setHistoryFor(null)}>
        <DialogContent className={`max-w-lg ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white'}`} dir="rtl">
          <DialogHeader><DialogTitle className={strong}>سجل التواصل — {historyFor?.student_name}</DialogTitle></DialogHeader>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {history.length === 0 && <p className={`text-center py-6 ${muted}`}>لا يوجد سجل بعد</p>}
            {history.map((h) => (
              <div key={h.id} className={`rounded-lg p-3 border ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
                <div className="flex items-center justify-between">
                  <span className={h.contacted ? 'text-emerald-500 text-sm' : 'text-red-400 text-sm'}>
                    {h.contacted ? 'تم التواصل' : 'لم يتم'} · {h.contact_date}{h.method ? ` · ${h.method}` : ''}
                  </span>
                  {(user?.role === 'admin' || h.created_by === user?.id) && (
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-red-400" onClick={() => remove(h.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                  )}
                </div>
                {h.notes && <p className={`text-sm mt-1 whitespace-pre-wrap ${strong}`}>{h.notes}</p>}
                <p className={`text-[11px] mt-1 ${muted}`}>بواسطة {h.created_by_name || '—'}</p>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ParentContacts;
