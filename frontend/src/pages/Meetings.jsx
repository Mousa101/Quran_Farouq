import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { useTheme } from '../context/ThemeContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { toast } from 'sonner';
import {
  Plus, Trash2, Pencil, ArrowRight, Users, AlertTriangle, CheckCircle2, Send, ListTodo, FileText,
} from 'lucide-react';
import { formatDate as fmtDate } from '../lib/utils';
import { TASK_STATUS, TASK_PRIORITY, MEETING_TYPE, MEETING_STATUS } from '../lib/tasks';
import { RichText, RichTextarea } from '../components/RichText';
import { CATEGORY_COLORS } from '../lib/taskCategories';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const EMPTY_ITEM = { text: '', details: '', assignee_id: '', due_date: '', priority: 'normal', category_id: '' };
const EMPTY_MEETING = {
  title: '', date: '', time: '', type: 'sheikhs', status: 'scheduled',
  attendee_ids: [], other_attendees: '', agenda: '', minutes: '',
};

const meetingWhen = (m) => (m.date
  ? `${fmtDate(m.date, { withWeekday: true })}${m.time ? ` — ${m.time}` : ''}`
  : (m.time ? `بلا تاريخ — ${m.time}` : 'بلا تاريخ'));

// محاضر الاجتماعات: منفصلة عن المهام. بنود المحضر تبقى فيه، ويُرحَّل منها ما يلزم إلى قائمة المهام.
const Meetings = () => {
  const { isDark } = useTheme();
  const [searchParams, setSearchParams] = useSearchParams();
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sheikhs, setSheikhs] = useState([]);
  const [categories, setCategories] = useState([]);
  const [openMeeting, setOpenMeeting] = useState(null);
  const [meetingForm, setMeetingForm] = useState(null);
  const [itemForm, setItemForm] = useState(EMPTY_ITEM);
  const [editItem, setEditItem] = useState(null);

  const input = isDark ? 'bg-slate-800 border-white/10 text-white' : '';
  const selectCls = `p-2 rounded-lg border text-sm ${isDark ? 'bg-slate-800 border-white/10 text-white' : 'bg-white border-slate-300'}`;
  const muted = isDark ? 'text-slate-400' : 'text-slate-500';
  const strong = isDark ? 'text-white' : 'text-slate-900';
  const body = isDark ? 'text-slate-300' : 'text-slate-700';
  const cardCls = isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200';
  const rowCls = isDark ? 'bg-slate-800/50' : 'bg-slate-50';

  const fetchMeetings = async () => {
    try {
      const res = await axios.get(`${API}/meetings`);
      setMeetings(res.data || []);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const fetchMeeting = async (id) => {
    try {
      const res = await axios.get(`${API}/meetings/${id}`);
      setOpenMeeting(res.data);
    } catch (e) { toast.error(e.response?.data?.detail || 'فشل في تحميل الاجتماع'); }
  };

  useEffect(() => {
    fetchMeetings();
    axios.get(`${API}/sheikhs`).then((r) => setSheikhs(r.data || [])).catch(() => {});
    axios.get(`${API}/task-categories`).then((r) => setCategories(r.data || [])).catch(() => {});
  }, []);

  // فتح اجتماع مباشرة من رابط (مثلًا من قائمة المهام: ?open=<id>)
  useEffect(() => {
    const id = searchParams.get('open');
    if (id) fetchMeeting(id);
  }, [searchParams]);

  const open = (id) => setSearchParams({ open: id });
  const close = () => { setOpenMeeting(null); setSearchParams({}); fetchMeetings(); };
  const refresh = () => { fetchMeetings(); if (openMeeting) fetchMeeting(openMeeting.id); };

  const itemPayload = (i) => ({
    text: i.text, details: i.details || '', assignee_id: i.assignee_id || null,
    due_date: i.due_date || null, priority: i.priority, category_id: i.category_id || null,
  });

  const addItem = async () => {
    if (!itemForm.text.trim()) { toast.error('اكتب نص البند'); return; }
    try {
      await axios.post(`${API}/meetings/${openMeeting.id}/items`, itemPayload(itemForm));
      setItemForm(EMPTY_ITEM);
      refresh();
    } catch (e) { toast.error(e.response?.data?.detail || 'فشل في الإضافة'); }
  };

  const saveItem = async () => {
    if (!editItem.text.trim()) { toast.error('اكتب نص البند'); return; }
    try {
      await axios.put(`${API}/meeting-items/${editItem.id}`, itemPayload(editItem));
      toast.success('تم حفظ البند');
      setEditItem(null);
      refresh();
    } catch (e) { toast.error(e.response?.data?.detail || 'فشل في الحفظ'); }
  };

  const removeItem = async (item) => {
    const extra = item.task_id ? '\n(المهمة المرحّلة تبقى في قائمة المهام)' : '';
    if (!window.confirm(`حذف البند «${item.text}» من المحضر؟${extra}`)) return;
    try {
      await axios.delete(`${API}/meeting-items/${item.id}`);
      refresh();
    } catch (e) { toast.error('فشل في الحذف'); }
  };

  const transfer = async (item) => {
    try {
      await axios.post(`${API}/meeting-items/${item.id}/transfer`);
      toast.success('تم ترحيل البند إلى قائمة المهام');
      refresh();
    } catch (e) { toast.error(e.response?.data?.detail || 'فشل في الترحيل'); }
  };

  const transferAll = async () => {
    const pending = openMeeting.items.filter((i) => !i.task_id).length;
    if (!window.confirm(`ترحيل ${pending} بند إلى قائمة المهام؟`)) return;
    try {
      const res = await axios.post(`${API}/meetings/${openMeeting.id}/transfer-all`);
      toast.success(res.data.message);
      refresh();
    } catch (e) { toast.error(e.response?.data?.detail || 'فشل في الترحيل'); }
  };

  const saveMeeting = async () => {
    const m = meetingForm;
    if (!m.title.trim()) { toast.error('أدخل عنوان الاجتماع'); return; }
    const payload = { ...m, date: m.date || null, time: m.time || null };
    delete payload.id;
    try {
      const res = m.id
        ? await axios.put(`${API}/meetings/${m.id}`, payload)
        : await axios.post(`${API}/meetings`, payload);
      toast.success('تم حفظ الاجتماع');
      setMeetingForm(null);
      fetchMeetings();
      if (m.id) fetchMeeting(m.id); else open(res.data.id);
    } catch (e) { toast.error(e.response?.data?.detail || 'فشل في الحفظ'); }
  };

  const removeMeeting = async (m) => {
    if (!window.confirm(`حذف اجتماع «${m.title}» ومحضره؟`)) return;
    const transferred = m.items?.filter((i) => i.task_id).length || 0;
    const withTasks = transferred > 0
      && window.confirm(`حذف المهام المرحّلة منه (${transferred}) أيضًا؟\nاضغط «إلغاء» لإبقائها في قائمة المهام.`);
    try {
      await axios.delete(`${API}/meetings/${m.id}`, { params: { delete_tasks: withTasks } });
      toast.success('تم حذف الاجتماع');
      close();
    } catch (e) { toast.error('فشل في الحذف'); }
  };

  const toggleAttendee = (id) => setMeetingForm((f) => ({
    ...f, attendee_ids: f.attendee_ids.includes(id) ? f.attendee_ids.filter((x) => x !== id) : [...f.attendee_ids, id],
  }));

  const Badge = ({ cls, children }) => <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${cls}`}>{children}</span>;

  const assigneeOptions = (
    <>
      <option value="">الإدارة</option>
      {sheikhs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
    </>
  );
  const categoryOptions = (
    <>
      <option value="">—</option>
      {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
    </>
  );

  // حقول البند (إضافة/تعديل) — دالة عرض حتى لا يضيع التركيز
  const itemFields = (v, set, compact) => (
    <div className={compact ? 'grid grid-cols-2 xl:grid-cols-12 gap-2 items-end' : 'space-y-3'}>
      <div className={compact ? 'col-span-2 xl:col-span-4' : ''}>
        <Label className={muted}>البند / القرار</Label>
        <Input value={v.text} onChange={(e) => set({ ...v, text: e.target.value })}
          onKeyDown={(e) => { if (compact && e.key === 'Enter') addItem(); }}
          placeholder="مثال: تكريم الحفاظ نهاية الشهر" className={input} />
      </div>
      {!compact && (
        <div>
          <Label className={muted}>تفاصيل</Label>
          <RichTextarea isDark={isDark} value={v.details} onChange={(d) => set({ ...v, details: d })} className={input} />
        </div>
      )}
      <div className={compact ? 'grid grid-cols-2 gap-2 col-span-2 xl:col-span-7 xl:grid-cols-4' : 'grid grid-cols-2 gap-3'}>
        <div>
          <Label className={muted}>المسؤول</Label>
          <select value={v.assignee_id} onChange={(e) => set({ ...v, assignee_id: e.target.value })} className={`w-full ${selectCls}`}>{assigneeOptions}</select>
        </div>
        <div>
          <Label className={muted}>الموعد (اختياري)</Label>
          <Input type="date" value={v.due_date} onChange={(e) => set({ ...v, due_date: e.target.value })} className={input} />
        </div>
        <div>
          <Label className={muted}>الأولوية</Label>
          <select value={v.priority} onChange={(e) => set({ ...v, priority: e.target.value })} className={`w-full ${selectCls}`}>
            {Object.entries(TASK_PRIORITY).map(([k, p]) => <option key={k} value={k}>{p.label}</option>)}
          </select>
        </div>
        <div>
          <Label className={muted}>التصنيف</Label>
          <select value={v.category_id} onChange={(e) => set({ ...v, category_id: e.target.value })} className={`w-full ${selectCls}`}>{categoryOptions}</select>
        </div>
      </div>
      {compact && (
        <div className="xl:col-span-1">
          <Button onClick={addItem} className="w-full bg-emerald-600 hover:bg-emerald-700" title="إضافة البند"><Plus className="w-4 h-4" /></Button>
        </div>
      )}
    </div>
  );

  const itemRow = (item, n) => {
    const task = item.task;
    const done = task?.status === 'done';
    return (
      <div key={item.id} className={`p-3 rounded-lg flex items-start gap-3 ${rowCls}`}>
        <span className={`w-6 h-6 shrink-0 rounded-full text-xs flex items-center justify-center font-bold ${isDark ? 'bg-slate-700 text-slate-200' : 'bg-white text-slate-700 border border-slate-200'}`}>{n}</span>
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className={`font-bold text-sm ${strong}`}>{item.text}</p>
            {item.category_name && <Badge cls={(CATEGORY_COLORS[item.category_color] || CATEGORY_COLORS.slate).cls}>{item.category_name}</Badge>}
            {item.priority !== 'normal' && <Badge cls={TASK_PRIORITY[item.priority]?.cls}>{TASK_PRIORITY[item.priority]?.label}</Badge>}
          </div>
          {item.details && <RichText text={item.details} className={body} />}
          <div className={`text-xs flex flex-wrap gap-x-4 gap-y-1 ${muted}`}>
            <span>المسؤول: {item.assignee_name || 'الإدارة'}</span>
            {item.due_date && <span>الموعد: {fmtDate(item.due_date)}</span>}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
          {task ? (
            <Link to="/tasks" title="عرض في قائمة المهام">
              <Badge cls={done ? 'bg-emerald-500/20 text-emerald-500' : (task.is_overdue ? 'bg-red-500/20 text-red-400' : 'bg-blue-500/20 text-blue-400')}>
                <span className="inline-flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />مرحّلة — {task.is_overdue && !done ? 'متأخرة' : TASK_STATUS[task.status]?.label}
                </span>
              </Badge>
            </Link>
          ) : (
            <Button size="sm" variant="outline" onClick={() => transfer(item)}
              className={`text-emerald-600 ${isDark ? 'border-emerald-500/40' : 'border-emerald-300'}`}>
              <Send className="w-3.5 h-3.5 ml-1" />ترحيل إلى المهام
            </Button>
          )}
          <Button size="sm" variant="ghost" title="تعديل"
            onClick={() => setEditItem({ ...item, details: item.details || '', assignee_id: item.assignee_id || '', due_date: item.due_date || '', category_id: item.category_id || '' })}>
            <Pencil className="w-4 h-4" />
          </Button>
          <Button size="sm" variant="ghost" title="حذف" onClick={() => removeItem(item)} className="text-red-400 hover:bg-red-500/10"><Trash2 className="w-4 h-4" /></Button>
        </div>
      </div>
    );
  };

  const pendingCount = openMeeting?.items?.filter((i) => !i.task_id).length || 0;

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className={`p-6 rounded-xl ${isDark ? 'glass-card border border-white/10' : 'bg-white border border-slate-200 shadow-sm'}`}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center"><FileText className="w-6 h-6 text-emerald-400" /></div>
            <div>
              <h1 className={`text-xl md:text-2xl font-bold ${strong}`}>محاضر الاجتماعات</h1>
              <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>سجّل الاجتماع وقراراته، ثم رحّل ما يلزم منها إلى قائمة المهام لمتابعته</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Link to="/tasks"><Button variant="outline" className={isDark ? 'border-white/10' : ''}><ListTodo className="w-4 h-4 ml-1" />قائمة المهام</Button></Link>
            <Button onClick={() => setMeetingForm({ ...EMPTY_MEETING })} className="bg-emerald-600 hover:bg-emerald-700"><Plus className="w-4 h-4 ml-1" />اجتماع جديد</Button>
          </div>
        </div>
      </div>

      {!openMeeting && (
        <Card className={cardCls}>
          <CardHeader className="pb-2"><CardTitle className={`text-base ${strong}`}>الاجتماعات ({meetings.length})</CardTitle></CardHeader>
          <CardContent>
            {loading ? <p className={`text-center py-6 ${muted}`}>جارٍ التحميل…</p> : meetings.length === 0 ? (
              <p className={`text-center py-6 ${muted}`}>لا توجد اجتماعات</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {meetings.map((m) => (
                  <button key={m.id} type="button" onClick={() => open(m.id)}
                    className={`p-4 rounded-lg text-right space-y-2 transition hover:ring-1 hover:ring-emerald-500/50 ${rowCls}`}>
                    <div className="flex items-center justify-between gap-2">
                      <p className={`font-bold ${strong}`}>{m.title}</p>
                      <Badge cls={MEETING_STATUS[m.status]?.cls}>{MEETING_STATUS[m.status]?.label}</Badge>
                    </div>
                    <p className={`text-xs ${muted}`}>{MEETING_TYPE[m.type]} — {meetingWhen(m)}</p>
                    <p className={`text-xs ${muted}`}>
                      {m.items_total ? `${m.items_total} بند في المحضر — ${m.items_transferred} مرحّل إلى المهام` : 'لا بنود مسجّلة'}
                      {m.tasks_total > 0 && ` — أُنجز ${m.tasks_done} من ${m.tasks_total}`}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {openMeeting && (
        <>
          <Card className={cardCls}>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div>
                  <Button variant="ghost" size="sm" onClick={close} className={`mb-2 ${muted}`}><ArrowRight className="w-4 h-4 ml-1" />كل الاجتماعات</Button>
                  <CardTitle className={`text-lg flex items-center gap-2 flex-wrap ${strong}`}>
                    {openMeeting.title}
                    <Badge cls={MEETING_STATUS[openMeeting.status]?.cls}>{MEETING_STATUS[openMeeting.status]?.label}</Badge>
                  </CardTitle>
                  <p className={`text-sm ${muted}`}>{MEETING_TYPE[openMeeting.type]} — {meetingWhen(openMeeting)}</p>
                </div>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" className={isDark ? 'border-white/10' : ''}
                    onClick={() => setMeetingForm({
                      id: openMeeting.id, title: openMeeting.title, date: openMeeting.date || '', time: openMeeting.time || '',
                      type: openMeeting.type, status: openMeeting.status, attendee_ids: openMeeting.attendee_ids || [],
                      other_attendees: openMeeting.other_attendees || '', agenda: openMeeting.agenda || '', minutes: openMeeting.minutes || '',
                    })}>
                    <Pencil className="w-4 h-4 ml-1" />تعديل
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => removeMeeting(openMeeting)} className="text-red-400 hover:bg-red-500/10"><Trash2 className="w-4 h-4" /></Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {(openMeeting.attendees?.length > 0 || openMeeting.other_attendees) && (
                <div>
                  <p className={`text-sm font-bold flex items-center gap-1 ${strong}`}><Users className="w-4 h-4" />الحضور</p>
                  <p className={`text-sm ${body}`}>{[...openMeeting.attendees.map((a) => a.name), openMeeting.other_attendees].filter(Boolean).join('، ')}</p>
                </div>
              )}
              {openMeeting.agenda && (
                <div><p className={`text-sm font-bold ${strong}`}>جدول الأعمال</p><RichText text={openMeeting.agenda} className={body} /></div>
              )}
              {openMeeting.minutes && (
                <div><p className={`text-sm font-bold ${strong}`}>المحضر</p><RichText text={openMeeting.minutes} className={body} /></div>
              )}
              {!openMeeting.agenda && !openMeeting.minutes && !openMeeting.attendees?.length && (
                <p className={`text-sm ${muted}`}>لا تفاصيل بعد — اضغط «تعديل» لإضافة الحضور وجدول الأعمال والمحضر.</p>
              )}
            </CardContent>
          </Card>

          <Card className={cardCls}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <CardTitle className={`text-base ${strong}`}>بنود المحضر وقراراته ({openMeeting.items.length})</CardTitle>
                {pendingCount > 0 && (
                  <Button size="sm" onClick={transferAll} className="bg-emerald-600 hover:bg-emerald-700">
                    <Send className="w-4 h-4 ml-1" />ترحيل الكل إلى المهام ({pendingCount})
                  </Button>
                )}
              </div>
              <p className={`text-xs ${muted}`}>البنود تبقى في المحضر. رحّل منها ما يحتاج متابعة ليظهر في قائمة المهام.</p>
            </CardHeader>
            <CardContent className="space-y-3">
              {itemFields(itemForm, setItemForm, true)}
              {openMeeting.items.length === 0
                ? <p className={`text-center py-4 ${muted}`}>أضف بنود الاجتماع وقراراته هنا</p>
                : <div className="space-y-2">{openMeeting.items.map((it, i) => itemRow(it, i + 1))}</div>}
            </CardContent>
          </Card>

          {openMeeting.carried_over.length > 0 && (
            <Card className={cardCls}>
              <CardHeader className="pb-2">
                <CardTitle className={`text-base flex items-center gap-2 ${strong}`}>
                  <AlertTriangle className="w-4 h-4 text-amber-400" />مهام لم تُنجز من اجتماعات سابقة ({openMeeting.carried_over.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {openMeeting.carried_over.map((t) => (
                  <div key={t.id} className={`p-3 rounded-lg flex items-center justify-between gap-2 flex-wrap ${rowCls}`}>
                    <div>
                      <p className={`font-bold text-sm ${strong}`}>{t.title}</p>
                      <p className={`text-xs ${muted}`}>
                        من: {t.meeting_title} — المسؤول: {t.assignee_name || 'الإدارة'}{t.due_date ? ` — الموعد: ${fmtDate(t.due_date)}` : ''}
                      </p>
                    </div>
                    <Badge cls={t.is_overdue ? 'bg-red-500/20 text-red-400' : TASK_STATUS[t.status]?.cls}>{t.is_overdue ? 'متأخرة' : TASK_STATUS[t.status]?.label}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* تعديل بند */}
      <Dialog open={!!editItem} onOpenChange={(o) => { if (!o) setEditItem(null); }}>
        <DialogContent className={`max-w-lg ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white'}`}>
          <DialogHeader><DialogTitle className={isDark ? 'text-white' : ''}>تعديل البند</DialogTitle></DialogHeader>
          {editItem && itemFields(editItem, setEditItem, false)}
          {editItem?.task_id && <p className={`text-xs ${muted}`}>تعديل البند لا يغيّر المهمة المرحّلة منه — عدّلها من قائمة المهام.</p>}
          <DialogFooter><Button onClick={saveItem} className="bg-emerald-600 hover:bg-emerald-700">حفظ</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* إضافة/تعديل اجتماع */}
      <Dialog open={!!meetingForm} onOpenChange={(o) => { if (!o) setMeetingForm(null); }}>
        <DialogContent className={`max-w-2xl max-h-[90vh] overflow-y-auto ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white'}`}>
          <DialogHeader><DialogTitle className={isDark ? 'text-white' : ''}>{meetingForm?.id ? 'تعديل الاجتماع' : 'اجتماع جديد'}</DialogTitle></DialogHeader>
          {meetingForm && (
            <div className="space-y-3">
              <div>
                <Label className={muted}>العنوان</Label>
                <Input value={meetingForm.title} onChange={(e) => setMeetingForm({ ...meetingForm, title: e.target.value })} placeholder="مثال: اجتماع المشرفين الشهري" className={input} />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <Label className={muted}>التاريخ (اختياري)</Label>
                  <Input type="date" value={meetingForm.date} onChange={(e) => setMeetingForm({ ...meetingForm, date: e.target.value })} className={input} />
                </div>
                <div>
                  <Label className={muted}>الوقت (اختياري)</Label>
                  <Input type="time" value={meetingForm.time} onChange={(e) => setMeetingForm({ ...meetingForm, time: e.target.value })} className={input} />
                </div>
                <div>
                  <Label className={muted}>النوع</Label>
                  <select value={meetingForm.type} onChange={(e) => setMeetingForm({ ...meetingForm, type: e.target.value })} className={`w-full ${selectCls}`}>
                    {Object.entries(MEETING_TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <Label className={muted}>الحالة</Label>
                  <select value={meetingForm.status} onChange={(e) => setMeetingForm({ ...meetingForm, status: e.target.value })} className={`w-full ${selectCls}`}>
                    {Object.entries(MEETING_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <Label className={muted}>الحضور من المشرفين</Label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {sheikhs.length === 0 && <span className={`text-sm ${muted}`}>لا يوجد مشرفون</span>}
                  {sheikhs.map((s) => {
                    const on = meetingForm.attendee_ids.includes(s.id);
                    return (
                      <button key={s.id} type="button" onClick={() => toggleAttendee(s.id)}
                        className={`text-sm px-3 py-1 rounded-full border ${on ? 'bg-emerald-600 text-white border-emerald-600' : (isDark ? 'border-white/10 text-slate-300' : 'border-slate-300 text-slate-700')}`}>
                        {s.name}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <Label className={muted}>حضور آخرون</Label>
                <Input value={meetingForm.other_attendees} onChange={(e) => setMeetingForm({ ...meetingForm, other_attendees: e.target.value })} placeholder="أسماء من خارج النظام" className={input} />
              </div>
              <div>
                <Label className={muted}>جدول الأعمال</Label>
                <RichTextarea isDark={isDark} rows={3} value={meetingForm.agenda} onChange={(v) => setMeetingForm({ ...meetingForm, agenda: v })} className={input} />
              </div>
              <div>
                <Label className={muted}>المحضر (ما دار في الاجتماع)</Label>
                <RichTextarea isDark={isDark} rows={5} value={meetingForm.minutes} onChange={(v) => setMeetingForm({ ...meetingForm, minutes: v })} className={input} />
              </div>
              <p className={`text-xs ${muted}`}>البنود والقرارات تُضاف بعد الحفظ من صفحة الاجتماع، ثم تُرحَّل إلى المهام عند الحاجة.</p>
            </div>
          )}
          <DialogFooter><Button onClick={saveMeeting} className="bg-emerald-600 hover:bg-emerald-700">حفظ</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Meetings;
