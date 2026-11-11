import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useTheme } from '../context/ThemeContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { toast } from 'sonner';
import {
  ClipboardCheck, Plus, Trash2, Pencil, CalendarDays, ListTodo, AlertTriangle, CheckCircle2, Circle, Clock, Tags, Check, X, FileText,
} from 'lucide-react';
import { formatDate as fmtDate } from '../lib/utils';
import { RichText, RichTextarea } from '../components/RichText';
import { CATEGORY_COLORS } from '../lib/taskCategories';
import { TASK_STATUS, TASK_PRIORITY } from '../lib/tasks';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const EMPTY_TASK = { title: '', details: '', priority: 'normal', due_date: '', assignee_id: '', meeting_id: '', category_id: '' };

// قائمة المهام (المدير). محاضر الاجتماعات في صفحة مستقلة، ومنها تُرحَّل البنود إلى هنا.
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
  const navigate = useNavigate();

  const [categories, setCategories] = useState([]);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [newCategory, setNewCategory] = useState({ name: '', color: 'emerald' });
  const [editCategory, setEditCategory] = useState(null);

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
      if (categoryFilter) params.category_id = categoryFilter;
      const res = await axios.get(`${API}/tasks`, { params });
      setTasks(res.data || []);
    } catch (e) { console.error(e); } finally { setLoadingTasks(false); }
  }, [statusFilter, assigneeFilter, overdueOnly, categoryFilter]);

  const fetchCategories = async () => {
    try {
      const res = await axios.get(`${API}/task-categories`);
      setCategories(res.data || []);
    } catch (e) { console.error(e); }
  };

  const saveCategory = async (cat, reset) => {
    if (!cat.name.trim()) { toast.error('أدخل اسم التصنيف'); return; }
    try {
      const body = { name: cat.name, color: cat.color };
      if (cat.id) await axios.put(`${API}/task-categories/${cat.id}`, body);
      else await axios.post(`${API}/task-categories`, body);
      toast.success('تم حفظ التصنيف');
      reset();
      fetchCategories();
      fetchTasks();
    } catch (e) { toast.error(e.response?.data?.detail || 'فشل في الحفظ'); }
  };

  const removeCategory = async (cat) => {
    const extra = cat.tasks_count ? `\nسيُزال التصنيف من ${cat.tasks_count} مهمة (المهام نفسها لا تُحذف).` : '';
    if (!window.confirm(`حذف التصنيف «${cat.name}»؟${extra}`)) return;
    try {
      await axios.delete(`${API}/task-categories/${cat.id}`);
      toast.success('تم حذف التصنيف');
      if (categoryFilter === cat.id) setCategoryFilter('');
      fetchCategories();
      fetchTasks();
    } catch (e) { toast.error('فشل في الحذف'); }
  };

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

  useEffect(() => {
    axios.get(`${API}/sheikhs`).then((r) => setSheikhs(r.data || [])).catch(() => {});
    fetchMeetings();
    fetchSummary();
    fetchCategories();
  }, []);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  // بعد أي تعديل على مهمة: تحديث القائمة والأرقام وتقدّم الاجتماعات
  const refreshAll = () => {
    fetchTasks();
    fetchSummary();
    fetchMeetings();
  };

  const taskPayload = (t) => ({
    title: t.title,
    details: t.details || '',
    priority: t.priority,
    due_date: t.due_date || null,
    assignee_id: t.assignee_id || null,
    meeting_id: t.meeting_id || null,
    category_id: t.category_id || null,
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

  const assigneeOptions = (
    <>
      <option value="">أنا (الإدارة)</option>
      {sheikhs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
    </>
  );

  const categoryOptions = (emptyLabel) => (
    <>
      <option value="">{emptyLabel}</option>
      {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
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
            {t.category_name && <Badge cls={(CATEGORY_COLORS[t.category_color] || CATEGORY_COLORS.slate).cls}>{t.category_name}</Badge>}
            <Badge cls={TASK_PRIORITY[t.priority]?.cls}>{TASK_PRIORITY[t.priority]?.label}</Badge>
            {!done && t.status === 'in_progress' && <Badge cls={TASK_STATUS.in_progress.cls}>{TASK_STATUS.in_progress.label}</Badge>}
            {t.is_overdue && <Badge cls="bg-red-500/20 text-red-400">متأخرة</Badge>}
          </div>
          {t.details && <RichText text={t.details} className={isDark ? 'text-slate-300' : 'text-slate-700'} />}
          <div className={`text-xs flex flex-wrap gap-x-4 gap-y-1 ${muted}`}>
            <span>المسؤول: {t.assignee_name || 'الإدارة'}</span>
            {t.due_date && <span className={t.is_overdue ? 'text-red-400' : ''}>الموعد: {fmtDate(t.due_date)}</span>}
            {showMeeting && t.meeting_title && (
              <Link to={`/meetings?open=${t.meeting_id}`} className="underline">
                من اجتماع: {t.meeting_title}
              </Link>
            )}
            {done && t.done_at && <span>أُنجزت: {fmtDate(t.done_at)}</span>}
          </div>
          {t.note && <p className={`text-xs ${isDark ? 'text-amber-300' : 'text-amber-700'}`}>ملاحظة المشرف: {t.note}</p>}
        </div>
        <div className="flex shrink-0">
          <Button size="sm" variant="ghost" onClick={() => setEditTask({ ...t, due_date: t.due_date || '', assignee_id: t.assignee_id || '', meeting_id: t.meeting_id || '', category_id: t.category_id || '' })}>
            <Pencil className="w-4 h-4" />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => removeTask(t)} className="text-red-400 hover:bg-red-500/10"><Trash2 className="w-4 h-4" /></Button>
        </div>
      </div>
    );
  };

  const taskQuickAdd = ({ value, onChange, onAdd, withMeeting }) => (
    <div className="grid grid-cols-2 xl:grid-cols-12 gap-2 items-end">
      <div className="col-span-2 xl:col-span-3">
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
        <Label className={muted}>آخر موعد (اختياري)</Label>
        <Input type="date" value={value.due_date} onChange={(e) => onChange({ ...value, due_date: e.target.value })} className={input} />
      </div>
      <div className={withMeeting ? 'xl:col-span-1' : 'xl:col-span-2'}>
        <Label className={muted}>الأولوية</Label>
        <select value={value.priority} onChange={(e) => onChange({ ...value, priority: e.target.value })} className={`w-full ${selectCls}`}>
          {Object.entries(TASK_PRIORITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>
      <div className="xl:col-span-1">
        <Label className={muted}>التصنيف</Label>
        <select value={value.category_id} onChange={(e) => onChange({ ...value, category_id: e.target.value })} className={`w-full ${selectCls}`}>
          {categoryOptions('—')}
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
            <h1 className={`text-xl md:text-2xl font-bold ${strong}`}>المهام</h1>
            <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>قائمة مهام الإدارة والمشرفين، ومنها ما رُحّل من محاضر الاجتماعات</p>
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
            <button type="button" onClick={() => navigate(summary.next_meeting ? `/meetings?open=${summary.next_meeting.id}` : '/meetings')}
              className={`p-3 rounded-lg text-right ${isDark ? 'bg-slate-800/50' : 'bg-slate-50'}`}>
              <div className="flex items-center gap-2"><CalendarDays className="w-4 h-4 text-emerald-400" /><span className={`text-xs ${muted}`}>الاجتماع القادم</span></div>
              <p className={`text-sm font-bold mt-1 ${strong}`}>{summary.next_meeting ? summary.next_meeting.title : 'لا يوجد'}</p>
              {summary.next_meeting && <p className={`text-xs ${muted}`}>{fmtDate(summary.next_meeting.date, { withWeekday: true })}{summary.next_meeting.time ? ` — ${summary.next_meeting.time}` : ''}</p>}
            </button>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        {[['tasks', 'المهام', ListTodo], ['categories', 'التصنيفات', Tags]].map(([k, label, Icon]) => (
          <Button key={k} variant={tab === k ? 'default' : 'outline'} onClick={() => setTab(k)}
            className={tab === k ? 'bg-emerald-600 hover:bg-emerald-700' : (isDark ? 'border-white/10' : '')}>
            <Icon className="w-4 h-4 ml-1" />{label}
          </Button>
        ))}
        <Link to="/meetings" className="mr-auto">
          <Button variant="outline" className={isDark ? 'border-white/10' : ''}><FileText className="w-4 h-4 ml-1" />محاضر الاجتماعات</Button>
        </Link>
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
                  {categories.length > 0 && (
                    <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className={selectCls}>
                      {categoryOptions('كل التصنيفات')}
                    </select>
                  )}
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

      {tab === 'categories' && (
        <Card className={cardCls}>
          <CardHeader className="pb-2">
            <CardTitle className={`text-base flex items-center gap-2 ${strong}`}><Tags className="w-4 h-4 text-emerald-400" />تصنيفات المخرجات والمهام ({categories.length})</CardTitle>
            <p className={`text-xs ${muted}`}>صنّف قرارات الاجتماعات (مثل: تعليمي، مالي، أنشطة) لتسهيل متابعتها وتصفيتها.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex-1 min-w-[180px]">
                <Label className={muted}>اسم التصنيف</Label>
                <Input value={newCategory.name} onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveCategory(newCategory, () => setNewCategory({ name: '', color: newCategory.color })); }}
                  placeholder="مثال: تعليمي" className={input} />
              </div>
              <div>
                <Label className={muted}>اللون</Label>
                <select value={newCategory.color} onChange={(e) => setNewCategory({ ...newCategory, color: e.target.value })} className={`w-full ${selectCls}`}>
                  {Object.entries(CATEGORY_COLORS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <Button onClick={() => saveCategory(newCategory, () => setNewCategory({ name: '', color: newCategory.color }))} className="bg-emerald-600 hover:bg-emerald-700">
                <Plus className="w-4 h-4 ml-1" />إضافة
              </Button>
            </div>
            {categories.length === 0 ? (
              <p className={`text-center py-6 ${muted}`}>لا توجد تصنيفات بعد</p>
            ) : (
              <div className="space-y-2">
                {categories.map((c) => (
                  <div key={c.id} className={`p-3 rounded-lg flex items-center gap-3 ${isDark ? 'bg-slate-800/50' : 'bg-slate-50'}`}>
                    {editCategory?.id === c.id ? (
                      <>
                        <Input value={editCategory.name} onChange={(e) => setEditCategory({ ...editCategory, name: e.target.value })} className={`flex-1 ${input}`} />
                        <select value={editCategory.color} onChange={(e) => setEditCategory({ ...editCategory, color: e.target.value })} className={selectCls}>
                          {Object.entries(CATEGORY_COLORS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                        </select>
                        <Button size="sm" variant="ghost" onClick={() => saveCategory(editCategory, () => setEditCategory(null))} className="text-emerald-500"><Check className="w-4 h-4" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditCategory(null)}><X className="w-4 h-4" /></Button>
                      </>
                    ) : (
                      <>
                        <span className={`w-3 h-3 rounded-full shrink-0 ${(CATEGORY_COLORS[c.color] || CATEGORY_COLORS.slate).dot}`} />
                        <span className={`flex-1 font-bold text-sm ${strong}`}>{c.name}</span>
                        <button type="button" className={`text-xs underline ${muted}`}
                          onClick={() => { setCategoryFilter(c.id); setStatusFilter('all'); setTab('tasks'); }}>
                          {c.tasks_count} مهمة
                        </button>
                        <Button size="sm" variant="ghost" onClick={() => setEditCategory({ id: c.id, name: c.name, color: c.color })}><Pencil className="w-4 h-4" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => removeCategory(c)} className="text-red-400 hover:bg-red-500/10"><Trash2 className="w-4 h-4" /></Button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
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
                <RichTextarea isDark={isDark} value={editTask.details} onChange={(v) => setEditTask({ ...editTask, details: v })} className={input} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className={muted}>المسؤول</Label>
                  <select value={editTask.assignee_id} onChange={(e) => setEditTask({ ...editTask, assignee_id: e.target.value })} className={`w-full ${selectCls}`}>{assigneeOptions}</select>
                </div>
                <div>
                  <Label className={muted}>آخر موعد (اختياري)</Label>
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
                <Label className={muted}>التصنيف</Label>
                <select value={editTask.category_id} onChange={(e) => setEditTask({ ...editTask, category_id: e.target.value })} className={`w-full ${selectCls}`}>
                  {categoryOptions('— بلا تصنيف —')}
                </select>
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

    </div>
  );
};

export default TasksMeetings;
