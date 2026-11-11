import { useState, useEffect } from 'react';
import axios from 'axios';
import { useTheme } from '../context/ThemeContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Checkbox } from '../components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { toast } from 'sonner';
import { ShieldCheck, UserPlus, Edit, Trash2, Loader2, Ban, CheckCircle } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const EMPTY_FORM = { name: '', email: '', password: '', permissions: [] };

// حسابات المدراء المساعدين — المدير الرئيسي ينشئ الحساب ويحدّد الأقسام المسموحة له
const AssistantAccounts = () => {
  const { isDark } = useTheme();
  const [sections, setSections] = useState([]);
  const [assistants, setAssistants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null); // الحساب الجاري تعديله أو null للإنشاء
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => { fetchAssistants(); }, []);

  const fetchAssistants = async () => {
    try {
      const res = await axios.get(`${API}/admin/assistants`);
      setSections(res.data.sections || []);
      setAssistants(res.data.assistants || []);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في تحميل الحسابات');
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (a) => {
    setEditing(a);
    setForm({ name: a.name, email: a.email, password: '', permissions: a.permissions });
    setDialogOpen(true);
  };

  const togglePermission = (key) => {
    setForm((f) => ({
      ...f,
      permissions: f.permissions.includes(key)
        ? f.permissions.filter((p) => p !== key)
        : [...f.permissions, key],
    }));
  };

  const allSelected = sections.length > 0 && form.permissions.length === sections.length;

  const handleSave = async () => {
    if (!form.name.trim()) return toast.error('الاسم مطلوب');
    if (!editing && !form.email.trim()) return toast.error('البريد الإلكتروني مطلوب');
    if ((!editing || form.password) && form.password.length < 6) {
      return toast.error('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
    }
    setSaving(true);
    try {
      if (editing) {
        const body = { name: form.name, permissions: form.permissions };
        if (form.password) body.password = form.password;
        const res = await axios.put(`${API}/admin/assistants/${editing.id}`, body);
        toast.success(res.data.message);
      } else {
        const res = await axios.post(`${API}/admin/assistants`, form);
        toast.success(res.data.message);
      }
      setDialogOpen(false);
      fetchAssistants();
    } catch (error) {
      const detail = error.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'فشل في الحفظ — تحقّق من البيانات');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (a) => {
    setBusyId(a.id);
    try {
      await axios.put(`${API}/admin/assistants/${a.id}`, { is_active: !a.is_active });
      toast.success(a.is_active ? 'تم إيقاف الحساب' : 'تم تفعيل الحساب');
      fetchAssistants();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في تغيير الحالة');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (a) => {
    if (!window.confirm(`حذف حساب «${a.name}» نهائيًا؟`)) return;
    setBusyId(a.id);
    try {
      const res = await axios.delete(`${API}/admin/assistants/${a.id}`);
      toast.success(res.data.message);
      fetchAssistants();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في الحذف');
    } finally {
      setBusyId(null);
    }
  };

  const sectionLabel = (key) => sections.find((s) => s.key === key)?.label || key;
  const inputCls = isDark ? 'bg-slate-800 border-white/10 text-white' : '';
  const labelCls = isDark ? 'text-slate-300' : 'text-slate-700';

  return (
    <div className="space-y-4 md:space-y-6 animate-fadeIn">
      <Card className={isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'}>
        <CardHeader>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <CardTitle className={`flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                حسابات المدراء المساعدين
                <span className={`text-xs font-normal ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  ({assistants.length})
                </span>
              </CardTitle>
              <p className={`text-xs mt-1 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                كل حساب بيدخل لوحة الإدارة وبيشوف فقط الأقسام اللي بتحدّدها له.
              </p>
            </div>
            <Button onClick={openCreate} size="sm" className="bg-emerald-600 hover:bg-emerald-700">
              <UserPlus className="w-4 h-4 ml-1" />
              إنشاء حساب
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
            </div>
          ) : assistants.length === 0 ? (
            <p className={`text-center py-8 text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
              لا توجد حسابات مساعدة بعد. اضغط «إنشاء حساب» للبدء.
            </p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {assistants.map((a) => (
                <div
                  key={a.id}
                  className={`p-4 rounded-xl border ${isDark ? 'bg-slate-800/40 border-white/10' : 'bg-slate-50 border-slate-200'}`}
                >
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="min-w-0">
                      <p className={`font-bold truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>{a.name}</p>
                      <p className={`text-xs truncate ${isDark ? 'text-slate-400' : 'text-slate-500'}`} dir="ltr">{a.email}</p>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full flex-shrink-0 ${a.is_active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                      {a.is_active ? 'نشط' : 'موقوف'}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-1 mb-3">
                    {a.permissions.length === 0 ? (
                      <span className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>بدون صلاحيات (الصفحة الرئيسية فقط)</span>
                    ) : (
                      a.permissions.map((p) => (
                        <span key={p} className={`text-[11px] px-2 py-0.5 rounded-full ${isDark ? 'bg-blue-500/15 text-blue-300' : 'bg-blue-50 text-blue-700'}`}>
                          {sectionLabel(p)}
                        </span>
                      ))
                    )}
                  </div>

                  <div className="flex items-center gap-1 flex-wrap">
                    <Button variant="outline" size="sm" onClick={() => openEdit(a)} className={`h-8 text-xs ${isDark ? 'border-white/10 text-white hover:bg-white/5' : ''}`}>
                      <Edit className="w-3 h-3 ml-1" /> تعديل الصلاحيات
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => toggleActive(a)} disabled={busyId === a.id} className="h-8 text-xs text-amber-400 hover:bg-amber-500/10">
                      {a.is_active ? <><Ban className="w-3 h-3 ml-1" /> إيقاف</> : <><CheckCircle className="w-3 h-3 ml-1" /> تفعيل</>}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(a)} disabled={busyId === a.id} className="h-8 text-xs text-red-400 hover:bg-red-500/10">
                      <Trash2 className="w-3 h-3 ml-1" /> حذف
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className={`${isDark ? 'bg-slate-900 border-white/10' : 'bg-white'} max-w-2xl max-h-[90vh] overflow-y-auto`}>
          <DialogHeader>
            <DialogTitle className={isDark ? 'text-white' : 'text-slate-900'}>
              {editing ? `تعديل حساب «${editing.name}»` : 'إنشاء حساب مدير مساعد'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label className={labelCls}>الاسم</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} />
              </div>
              <div>
                <Label className={labelCls}>البريد الإلكتروني</Label>
                <Input
                  type="email"
                  dir="ltr"
                  value={form.email}
                  disabled={!!editing}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className={inputCls}
                />
              </div>
              <div className="md:col-span-2">
                <Label className={labelCls}>
                  {editing ? 'كلمة مرور جديدة (اتركها فارغة للإبقاء على الحالية)' : 'كلمة المرور (6 أحرف على الأقل)'}
                </Label>
                <Input
                  type="text"
                  dir="ltr"
                  autoComplete="off"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className={inputCls}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className={labelCls}>الصلاحيات ({form.permissions.length} / {sections.length})</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-emerald-400"
                  onClick={() => setForm({ ...form, permissions: allSelected ? [] : sections.map((s) => s.key) })}
                >
                  {allSelected ? 'إلغاء الكل' : 'تحديد الكل'}
                </Button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {sections.map((s) => (
                  <label
                    key={s.key}
                    className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer text-sm ${isDark ? 'border-white/10 text-slate-200 hover:bg-white/5' : 'border-slate-200 text-slate-800 hover:bg-slate-50'}`}
                  >
                    <Checkbox checked={form.permissions.includes(s.key)} onCheckedChange={() => togglePermission(s.key)} />
                    {s.label}
                  </label>
                ))}
              </div>
              <p className={`text-xs mt-2 ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                إنشاء الحسابات، الفصول الدراسية، قواعد النقاط وقائمة المستخدمين تبقى للمدير الرئيسي فقط.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} className={isDark ? 'border-white/10' : ''}>إلغاء</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
              {saving && <Loader2 className="w-4 h-4 ml-1 animate-spin" />}
              {editing ? 'حفظ التعديلات' : 'إنشاء الحساب'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AssistantAccounts;
