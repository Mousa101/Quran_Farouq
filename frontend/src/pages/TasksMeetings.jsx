import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useTheme } from '../context/ThemeContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { toast } from 'sonner';
import {
  ClipboardCheck, Plus, Trash2, Pencil, CalendarDays, ListTodo, ArrowRight, Users, AlertTriangle, CheckCircle2, Circle, Clock,
} from 'lucide-react';
import { formatDate as fmtDate } from '../lib/utils';
import { TASK_STATUS, TASK_PRIORITY, MEETING_TYPE, MEETING_STATUS } from '../lib/tasks';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const EMPTY_TASK = { title: '', details: '', priority: 'normal', due_date: '', assignee_id: '', meeting_id: '' };
const EMPTY_MEETING = {
  title: '', date: '', time: '', type: 'sheikhs', status: 'scheduled',
  attendee_ids: [], other_attendees: '', agenda: '', minutes: '',
};

// المهام ومتابعة مخرجات الاجتماعات (المدير)
const TasksMeetings = () => {
  const { isDark } = useTheme();
  const [tab, setTab] = useState('tasks');
  const [sheikhs, setSheikhs] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [summary, setSummary] = useState(null);

  const [tasks, setTasks] = useState([]);
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [statusFilter, setStatusFilter] = useState('open');
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [newTask, setNewTask] = useState(EMPTY_TASK);

  const [editTask, setEditTask] = useState(null);
  const [meetingForm, setMeetingForm] = useState(null); // null = مغلق، {id?, ...} = نافذة إضافة/تعديل
  const [openMeeting, setOpenMeeting] = useState(null); // تفاصيل الاجتماع المفتوح
  const [outcome, setOutcome] = useState(EMPTY_TASK);

  const input = isDark ? 'bg-slate-800 border-white/10 text-white' : '';
  const selectCls = `p-2 rounded-lg border text-sm ${isDark ? 'bg-slate-800 border-white/10 text-white' : 'bg-white border-slate-300'}`;
  const muted = isDark ? 'text-slate-400' : 'text-slate-500';
  const strong = isDark ? 'text-white' : 'text-slate-900';
  const cardCls = isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200';

  const fetchTasks = useCallback(async () => {
    setLoadingTasks(true);
    try {
      const params = {};
      if (statusFilter !== 'all') params.status = statusFilter;
      if (assigneeFilter) params.assignee = assigneeFilter;
      if (overdueOnly) params.overdue = true;
      const res = await axios.get(`${API}/tasks`, { params });
      setTasks(res.data || []);
    } catch (e) { console.error(e); } finally { setLoadingTasks(false); }
  }, [statusFilter, assigneeFilter, overdueOnly]);

  const fetchMeetings = async () => {
    try {
      const res = await axios.get(`${API}/meetings`);
      setMeetings(res.data || []);
    } catch (e) { console.error(e); }
  };

  const fetchSummary = async () => {
    try {
      const res = await axios.get(`${API}/tasks/summary`);
      setSummary(res.data);
    } catch (e) { console.error(e); }
  };

  const fetchMeeting = async (id) => {
    try {
      const res = await axios.get(`${API}/meetings/${id}`);
      setOpenMeeting(res.data);
    } catch (e) { toast.error(e.response?.data?.detail || 'فشل في تحميل الاجتماع'); }
  };

  useEffect(() => {
    axios.get(`${API}/sheikhs`).then((r) => setSheikhs(r.data || [])).catch(() => {});
    fetchMeetings();
    fetchSummary();
  }, []);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  // بعد أي تعديل على مهمة: تحديث القائمة والأرقام وتقدّم الاجتماعات
  const refreshAll = () => {
    fetchTasks();
    fetchSummary();
    fetchMeetings();
    if (openMeeting) fetchMeeting(openMeeting.id);
  };

  const taskPayload = (t) => ({
    title: t.title,
    details: t.details || '',
    priority: t.priority,
    due_date: t.due_date || null,
    assignee_id: t.assignee_id || null,
    meeting_id: t.meeting_id || null,
  });

  const addTask = async (t, reset) => {
    if (!t.title.trim()) { toast.error('أدخل عنوان المهمة'); return; }
    try {
      await axios.post(`${API}/tasks`, taskPayload(t));
      toast.success('تمت إضافة المهمة');
      reset();
      refreshAll();
    } catch (e) { toast.error(e.response?.data?.detail || 'فشل في الإضافة'); }
  };

  const saveTask = async () => {
    if (!editTask.title.trim()) { toast.error('أدخل عنوان المهمة'); return; }
    try {
      await axios.put(`${API}/tasks/${editTask.id}`, { ...taskPayload(editTask), status: editTask.status });
      toast.success('تم حفظ المهمة');
      setEditTask(null);
      refreshAll();
    } catch (e) { toast.error(e.response?.data?.detail || 'فشل في الحفظ'); }
  };

  const setStatus = async (task, status) => {
    try {
      await axios.patch(`${API}/tasks/${task.id}/status`, { status });
      refreshAll();
    } catch (e) { toast.error(e.response?.data?.detail || 'فشل في التحديث'); }
  };

  const removeTask = async (task) => {
    if (!window.confirm(`حذف المهمة «${task.title}»؟`)) return;
    try {
      await axios.delete(`${API}/tasks/${task.id}`);
      toast.success('تم الحذف');
      refreshAll();
    } catch (e) { toast.error('فشل في الحذف'); }
  };

  const saveMeeting = async () => {
    const m = meetingForm;
    if (!m.title.trim() || !m.date) { toast.error('أدخل عنوان الاجتماع وتاريخه'); return; }
    const body = { ...m, time: m.time || null };
    delete body.id;
    try {
      const res = m.id
        ? await axios.put(`${API}/meetings/${m.id}`, body)
        : await axios.post(`${API}/meetings`, body);
      toast.success('تم حفظ الاجتماع');
      setMeetingForm(null);
      fetchMeetings();
      fetchSummary();
      fetchMeeting(res.data.id);
    } catch (e) { toast.error(e.response?.data?.detail || 'فشل في الحفظ'); }
  };

  const removeMeeting = async (m) => {
    if (!window.confirm(`حذف اجتماع «${m.title}»؟`)) return;
    const withTasks = (m.tasks?.length || 0) > 0
      && window.confirm('حذف مخرجات الاجتماع (مهامه) أيضًا؟\nاضغط «إلغاء» لإبقائها مهامًا مستقلة.');
    try {
      await axios.delete(`${API}/meetings/${m.id}`, { params: { delete_tasks: withTasks } });
      toast.success('تم حذف الاجتماع');
      setOpenMeeting(null);
      fetchMeetings();
      fetchTasks();
      fetchSummary();
    } catch (e) { toast.error('فشل في الحذف'); }
  };

  const toggleAttendee = (id) => {
    setMeetingForm((f) => ({
      ...f,
      attendee_ids: f.attendee_ids.includes(id) ? f.attendee_ids.filter((x) => x !== id) : [...f.attendee_ids, id],
    }));
  };

  const assigneeOptions = (
    <>
      <option value="">أنا (الإدارة)</option>
      {sheikhs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
    </>
  );

  const Badge = ({ cls, children }) => <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${cls}`}>{children}</span>;

  // دوال عرض (لا مكوّنات) حتى لا يُعاد تركيب الحقول ويضيع التركيز مع كل حرف
  const taskRow = (t, showMeeting = true) => {
    const done = t.status === 'done';
    return (
      <div key={t.id} className={`p-3 rounded-lg flex items-start gap-3 ${isDark ? 'bg-slate-800/50' : 'bg-slate-50'} ${t.is_overdue ? 'border border-red-500/40' : ''}`}>
        <button
          type="button"
          onClick={() => setStatus(t, done ? 'todo' : 'done')}
          title={done ? 'إرجاعها غير منجزة' : 'تعليمها منجزة'}
          className="mt-0.5 shrink-0"
        >
          {done ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> : <Circle className={`w-5 h-5 ${muted}`} />}
        </button>
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className={`font-bold text-sm ${done ? `line-through ${muted}` : strong}`}>{t.title}</p>
            <Badge cls={TASK_PRIORITY[t.priority]?.cls}>{TASK_PRIORITY[t.priority]?.label}</Badge>
            {!done && t.status === 'in_progress' && <Badge cls={TASK_STATUS.in_progress.cls}>{TASK_STATUS.in_progress.label}</Badge>}
            {t.is_overdue && <Badge cls="bg-red-500/20 text-red-400">متأخرة</Badge>}
          </div>
          {t.details && <p className={`text-sm whitespace-pre-line ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{t.details}</p>}
          <div className={`text-xs flex flex-wrap gap-x-4 gap-y-1 ${muted}`}>
            <span>المسؤول: {t.assignee_name || 'الإدارة'}</span>
            {t.due_date && <span className={t.is_overdue ? 'text-red-400' : ''}>الموعد: {fmtDate(t.due_date)}</span>}
            {showMeeting && t.meeting_title && (
              <button type="button" className="underline" onClick={() => { setTab('meetings'); fetchMeeting(t.meeting_id); }}>
                من اجتماع: {t.meeting_title}
              </button>
            )}
            {done && t.done_at && <span>أُنجزت: {fmtDate(t.done_at)}</span>}
          </div>
          {t.note && <p className={`text-xs ${isDark ? 'text-amber-300' : 'text-amber-700'}`}>ملاحظة المشرف: {t.note}</p>}
        </div>
        <div className="flex shrink-0">
          <Button size="sm" variant="ghost" onClick={() => setEditTask({ ...t, due_date: t.due_date || '', assignee_id: t.assignee_id || '', meeting_id: t.meeting_id || '' })}>
            <Pencil className="w-4 h-4" />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => removeTask(t)} className="text-red-400 hover:bg-red-500/10"><Trash2 className="w-4 h-4" /></Button>
        </div>
      </div>
    );
  };

  const taskQuickAdd = ({ value, onChange, onAdd, withMeeting }) => (
    <div className="grid grid-cols-2 xl:grid-cols-12 gap-2 items-end">
      <div className="col-span-2 xl:col-span-4">
        <Label className={muted}>المهمة</Label>
        <Input value={value.title} onChange={(e) => onChange({ ...value, title: e.target.value })}
          onKeyDown={(e) => { if (e.key === 'Enter') onAdd(); }} placeholder="مثال: تجهيز شهادات الحفاظ" className={input} />
      </div>
      <div className="xl:col-span-3">
        <Label className={muted}>المسؤول</Label>
        <select value={value.assignee_id} onChange={(e) => onChange({ ...value, assignee_id: e.target.value })} className={`w-full ${selectCls}`}>
          {assigneeOptions}
        </select>
      </div>
      <div className="xl:col-span-2">
        <Label className={muted}>آخر موعد</Label>
        <Input type="date" value={value.due_date} onChange={(e) => onChange({ ...value, due_date: e.target.value })} className={input} />
      </div>
      <div className={withMeeting ? 'xl:col-span-1' : 'xl:col-span-2'}>
        <Label className={muted}>الأولوية</Label>
        <select value={value.priority} onChange={(e) => onChange({ ...value, priority: e.target.value })} className={`w-full ${selectCls}`}>
          {Object.entries(TASK_PRIORITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>
      {withMeeting && (
        <div className="xl:col-span-1">
          <Label className={muted}>اجتماع</Label>
          <select value={value.meeting_id} onChange={(e) => onChange({ ...value, meeting_id: e.target.value })} className={`w-full ${selectCls}`}>
            <option value="">—</option>
            {meetings.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
          </select>
        </div>
      )}
      <div className="xl:col-span-1">
        <Button onClick={onAdd} className="w-full bg-emerald-600 hover:bg-emerald-700"><Plus className="w-4 h-4" /></Button>
      </div>
    </div>
  );

  const Spinner = () => (
    <div className="flex items-center justify-center h-24"><div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" /></div>
  );

  const progressBar = (done, total) => (
    <div className="flex items-center gap-2">
      <div className={`flex-1 h-2 rounded-full overflow-hidden ${isDark ? 'bg-slate-700' : 'bg-slate-200'}`}>
        <div className="h-full bg-emerald-500" style={{ width: total ? `${(done / total) * 100}%` : '0%' }} />
      </div>
      <span className={`text-xs whitespace-nowrap ${muted}`}>{done} / {total}</span>
    </div>
  );

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className={`p-6 rounded-xl ${isDark ? 'glass-card border border-white/10' : 'bg-white border border-slate-200 shadow-sm'}`}>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center"><ClipboardCheck className="w-6 h-6 text-emerald-400" /></div>
          <div>
            <h1 className={`text-xl md:text-2xl font-bold ${strong}`}>المهام والاجتماعات</h1>
            <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>قائمة مهام الإدارة، ومحاضر الاجتماعات ومتابعة تنفيذ مخرجاتها</p>
          </div>
        </div>
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
            {[
              { label: 'مهام مفتوحة', value: summary.open, icon: ListTodo, cls: 'text-blue-400' },
              { label: 'متأخرة', value: summary.overdue, icon: AlertTriangle, cls: 'text-red-400', onClick: () => { setTab('tasks'); setOverdueOnly(true); } },
              { label: 'مستحقة اليوم', value: summary.due_today, icon: Clock, cls: 'text-amber-400' },
            ].map((c) => (
              <button key={c.label} type="button" onClick={c.onClick} className={`p-3 rounded-lg text-right ${isDark ? 'bg-slate-800/50' : 'bg-slate-50'}`}>
                <div className="flex items-center gap-2"><c.icon className={`w-4 h-4 ${c.cls}`} /><span className={`text-xs ${muted}`}>{c.label}</span></div>
                <p className={`text-2xl font-bold ${strong}`}>{c.value}</p>
              </button>
            ))}
            <button type="button" onClick={() => { if (summary.next_meeting) { setTab('meetings'); fetchMeeting(summary.next_meeting.id); } }}
              className={`p-3 rounded-lg text-right ${isDark ? 'bg-slate-800/50' : 'bg-slate-50'}`}>
              <div className="flex items-center gap-2"><CalendarDays className="w-4 h-4 text-emerald-400" /><span className={`text-xs ${muted}`}>الاجتماع القادم</span></div>
              <p className={`text-sm font-bold mt-1 ${strong}`}>{summary.next_meeting ? summary.next_meeting.title : 'لا يوجد'}</p>
              {summary.next_meeting && <p className={`text-xs ${muted}`}>{fmtDate(summary.next_meeting.date, { withWeekday: true })}{summary.next_meeting.time ? ` — ${summary.next_meeting.time}` : ''}</p>}
            </button>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        {[['tasks', 'المهام', ListTodo], ['meetings', 'الاجتماعات', CalendarDays]].map(([k, label, Icon]) => (
          <Button key={k} variant={tab === k ? 'default' : 'outline'} onClick={() => setTab(k)}
            className={tab === k ? 'bg-emerald-600 hover:bg-emerald-700' : (isDark ? 'border-white/10' : '')}>
            <Icon className="w-4 h-4 ml-1" />{label}
          </Button>
        ))}
      </div>

      {tab === 'tasks' && (
        <>
          <Card className={cardCls}>
            <CardHeader className="pb-2"><CardTitle className={`text-base flex items-center gap-2 ${strong}`}><Plus className="w-4 h-4 text-emerald-400" />مهمة جديدة</CardTitle></CardHeader>
            <CardContent>
              {taskQuickAdd({ value: newTask, onChange: setNewTask, withMeeting: true, onAdd: () => addTask(newTask, () => setNewTask(EMPTY_TASK)) })}
            </CardContent>
          </Card>

          <Card className={cardCls}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className={`text-base ${strong}`}>المهام ({tasks.length})</CardTitle>
                <div className="flex items-center gap-2 flex-wrap">
                  <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={selectCls}>
                    <option value="open">غير المنجزة</option>
                    <option value="todo">لم تبدأ</option>
                    <option value="in_progress">قيد التنفيذ</option>
                    <option value="done">المنجزة</option>
                    <option value="all">الكل</option>
                  </select>
                  <select value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)} className={selectCls}>
                    <option value="">كل المسؤولين</option>
                    <option value="me">مهام الإدارة</option>
                    <option value="sheikhs">مهام المشرفين</option>
                    {sheikhs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  <label className={`text-sm flex items-center gap-1 ${muted}`}>
                    <input type="checkbox" checked={overdueOnly} onChange={(e) => setOverdueOnly(e.target.checked)} />
                    المتأخرة فقط
                  </label>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loadingTasks ? <Spinner /> : tasks.length === 0 ? (
                <p className={`text-center py-6 ${muted}`}>لا توجد مهام</p>
              ) : (
                <div className="space-y-2">{tasks.map((t) => taskRow(t))}</div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {tab === 'meetings' && !openMeeting && (
        <Card className={cardCls}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className={`text-base ${strong}`}>الاجتماعات ({meetings.length})</CardTitle>
              <Button onClick={() => setMeetingForm({ ...EMPTY_MEETING })} className="bg-emerald-600 hover:bg-emerald-700"><Plus className="w-4 h-4 ml-1" />اجتماع جديد</Button>
            </div>
          </CardHeader>
          <CardContent>
            {meetings.length === 0 ? (
              <p className={`text-center py-6 ${muted}`}>لا توجد اجتماعات</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {meetings.map((m) => (
                  <button key={m.id} type="button" onClick={() => fetchMeeting(m.id)}
                    className={`p-4 rounded-lg text-right space-y-2 transition hover:ring-1 hover:ring-emerald-500/50 ${isDark ? 'bg-slate-800/50' : 'bg-slate-50'}`}>
                    <div className="flex items-center justify-between gap-2">
                      <p className={`font-bold ${strong}`}>{m.title}</p>
                      <Badge cls={MEETING_STATUS[m.status]?.cls}>{MEETING_STATUS[m.status]?.label}</Badge>
                    </div>
                    <p className={`text-xs ${muted}`}>{MEETING_TYPE[m.type]} — {fmtDate(m.date, { withWeekday: true })}{m.time ? ` — ${m.time}` : ''}</p>
                    {m.tasks_total > 0
                      ? <div><p className={`text-xs mb-1 ${muted}`}>تنفيذ المخرجات</p>{progressBar(m.tasks_done, m.tasks_total)}</div>
                      : <p className={`text-xs ${muted}`}>لا مخرجات مسجّلة</p>}
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {tab === 'meetings' && openMeeting && (
        <>
          <Card className={cardCls}>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div>
                  <Button variant="ghost" size="sm" onClick={() => setOpenMeeting(null)} className={`mb-2 ${muted}`}><ArrowRight className="w-4 h-4 ml-1" />كل الاجتماعات</Button>
                  <CardTitle className={`text-lg flex items-center gap-2 flex-wrap ${strong}`}>
                    {openMeeting.title}
                    <Badge cls={MEETING_STATUS[openMeeting.status]?.cls}>{MEETING_STATUS[openMeeting.status]?.label}</Badge>
                  </CardTitle>
                  <p className={`text-sm ${muted}`}>{MEETING_TYPE[openMeeting.type]} — {fmtDate(openMeeting.date, { withWeekday: true })}{openMeeting.time ? ` — ${openMeeting.time}` : ''}</p>
                </div>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" className={isDark ? 'border-white/10' : ''}
                    onClick={() => setMeetingForm({
                      id: openMeeting.id, title: openMeeting.title, date: openMeeting.date, time: openMeeting.time || '',
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
                  <p className={`text-sm ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                    {[...openMeeting.attendees.map((a) => a.name), openMeeting.other_attendees].filter(Boolean).join('، ')}
                  </p>
                </div>
              )}
              {openMeeting.agenda && (
                <div>
                  <p className={`text-sm font-bold ${strong}`}>جدول الأعمال</p>
                  <p className={`text-sm whitespace-pre-line ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{openMeeting.agenda}</p>
                </div>
              )}
              {openMeeting.minutes && (
                <div>
                  <p className={`text-sm font-bold ${strong}`}>المحضر</p>
                  <p className={`text-sm whitespace-pre-line ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{openMeeting.minutes}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className={cardCls}>
            <CardHeader className="pb-2">
              <CardTitle className={`text-base ${strong}`}>مخرجات الاجتماع وقراراته ({openMeeting.tasks.length})</CardTitle>
              {openMeeting.tasks.length > 0 && progressBar(openMeeting.tasks.filter((t) => t.status === 'done').length, openMeeting.tasks.length)}
            </CardHeader>
            <CardContent className="space-y-3">
              {taskQuickAdd({ value: outcome, onChange: setOutcome,
                onAdd: () => addTask({ ...outcome, meeting_id: openMeeting.id }, () => setOutcome(EMPTY_TASK)) })}
              {openMeeting.tasks.length === 0
                ? <p className={`text-center py-4 ${muted}`}>أضف قرارات الاجتماع هنا — كل قرار يصبح مهمة تُتابَع حتى تُنجز</p>
                : <div className="space-y-2">{openMeeting.tasks.map((t) => taskRow(t, false))}</div>}
            </CardContent>
          </Card>

          {openMeeting.carried_over.length > 0 && (
            <Card className={cardCls}>
              <CardHeader className="pb-2">
                <CardTitle className={`text-base flex items-center gap-2 ${strong}`}>
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  مخرجات لم تُنجز من اجتماعات سابقة ({openMeeting.carried_over.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">{openMeeting.carried_over.map((t) => taskRow(t))}</div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* تعديل مهمة */}
      <Dialog open={!!editTask} onOpenChange={(o) => { if (!o) setEditTask(null); }}>
        <DialogContent className={`max-w-lg ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white'}`}>
          <DialogHeader><DialogTitle className={isDark ? 'text-white' : ''}>تعديل المهمة</DialogTitle></DialogHeader>
          {editTask && (
            <div className="space-y-3">
              <div>
                <Label className={muted}>العنوان</Label>
                <Input value={editTask.title} onChange={(e) => setEditTask({ ...editTask, title: e.target.value })} className={input} />
              </div>
              <div>
                <Label className={muted}>التفاصيل</Label>
                <Textarea value={editTask.details} onChange={(e) => setEditTask({ ...editTask, details: e.target.value })} className={input} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className={muted}>المسؤول</Label>
                  <select value={editTask.assignee_id} onChange={(e) => setEditTask({ ...editTask, assignee_id: e.target.value })} className={`w-full ${selectCls}`}>{assigneeOptions}</select>
                </div>
                <div>
                  <Label className={muted}>آخر موعد</Label>
                  <Input type="date" value={editTask.due_date} onChange={(e) => setEditTask({ ...editTask, due_date: e.target.value })} className={input} />
                </div>
                <div>
                  <Label className={muted}>الأولوية</Label>
                  <select value={editTask.priority} onChange={(e) => setEditTask({ ...editTask, priority: e.target.value })} className={`w-full ${selectCls}`}>
                    {Object.entries(TASK_PRIORITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div>
                  <Label className={muted}>الحالة</Label>
                  <select value={editTask.status} onChange={(e) => setEditTask({ ...editTask, status: e.target.value })} className={`w-full ${selectCls}`}>
                    {Object.entries(TASK_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <Label className={muted}>من اجتماع</Label>
                <select value={editTask.meeting_id} onChange={(e) => setEditTask({ ...editTask, meeting_id: e.target.value })} className={`w-full ${selectCls}`}>
                  <option value="">— بلا اجتماع —</option>
                  {meetings.map((m) => <option key={m.id} value={m.id}>{m.title} ({fmtDate(m.date, { short: true })})</option>)}
                </select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={saveTask} className="bg-emerald-600 hover:bg-emerald-700">حفظ</Button>
          </DialogFooter>
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
                  <Label className={muted}>التاريخ</Label>
                  <Input type="date" value={meetingForm.date} onChange={(e) => setMeetingForm({ ...meetingForm, date: e.target.value })} className={input} />
                </div>
                <div>
                  <Label className={muted}>الوقت</Label>
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
                <Textarea rows={3} value={meetingForm.agenda} onChange={(e) => setMeetingForm({ ...meetingForm, agenda: e.target.value })} className={input} />
              </div>
              <div>
                <Label className={muted}>المحضر (ما دار في الاجتماع)</Label>
                <Textarea rows={5} value={meetingForm.minutes} onChange={(e) => setMeetingForm({ ...meetingForm, minutes: e.target.value })} className={input} />
              </div>
              <p className={`text-xs ${muted}`}>القرارات والمخرجات تُضاف بعد الحفظ من صفحة الاجتماع، ولكل منها مسؤول وموعد.</p>
            </div>
          )}
          <DialogFooter>
            <Button onClick={saveMeeting} className="bg-emerald-600 hover:bg-emerald-700">حفظ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TasksMeetings;
