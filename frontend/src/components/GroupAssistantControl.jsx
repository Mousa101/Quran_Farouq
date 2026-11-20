import { useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { UserCog, Loader2 } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const PERMS = [
  { key: 'attendance', label: 'تسجيل الحضور' },
  { key: 'recitations', label: 'تسجيل التسميع' },
];

// تعيين الطالب «مساعد المشرف» وتحديد الخانات التي يسجّلها (للمدير ومشرف المجموعة)
const GroupAssistantControl = ({ student, onChanged, className = '' }) => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [perms, setPerms] = useState(student?.assistant_permissions || []);
  const [enabled, setEnabled] = useState(!!student?.is_group_assistant);
  const [saving, setSaving] = useState(false);
  if (!(user?.role === 'admin' || user?.role === 'sheikh') || !student?.group_id) return null;

  const active = !!student.is_group_assistant;
  const save = async () => {
    setSaving(true);
    try {
      const res = await axios.put(`${API}/students/${student.id}/assistant`, { enabled, permissions: enabled ? perms : [] });
      toast.success(res.data.message);
      setOpen(false);
      onChanged?.(res.data);
    } catch (e) { toast.error(e.response?.data?.detail || 'فشل الحفظ'); }
    finally { setSaving(false); }
  };

  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={() => { setPerms(student.assistant_permissions || []); setEnabled(active); setOpen(true); }}
        className={`gap-1 ${active ? 'border-amber-500/50 text-amber-400' : ''} ${className}`} data-testid="group-assistant-btn">
        <UserCog className="w-4 h-4" />{active ? 'مساعد المشرف ✓' : 'تعيين مساعدًا'}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl" className="max-w-sm">
          <DialogHeader><DialogTitle>مساعد المشرف — {student.name}</DialogTitle></DialogHeader>
          <p className="text-sm text-slate-400">يسجّل المساعد لطلاب مجموعته فقط، وكل ما يسجّله يظهر عند المشرف كأنه سجّله، ولا يُحسب أحد منهما متأخرًا إذا سجّل الآخر.</p>
          <label className="flex items-center gap-2 mt-2 font-medium">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} data-testid="assistant-enable" />
            هذا الطالب مساعد للمشرف
          </label>
          <div className={`space-y-2 pr-6 ${enabled ? '' : 'opacity-40 pointer-events-none'}`}>
            {PERMS.map((p) => (
              <label key={p.key} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={perms.includes(p.key)}
                  onChange={(e) => setPerms((x) => (e.target.checked ? [...x, p.key] : x.filter((k) => k !== p.key)))}
                  data-testid={`assistant-perm-${p.key}`} />
                {p.label}
              </label>
            ))}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>إلغاء</Button>
            <Button onClick={save} disabled={saving || (enabled && perms.length === 0)} className="bg-emerald-600 hover:bg-emerald-700" data-testid="assistant-save">
              {saving && <Loader2 className="w-4 h-4 ml-1 animate-spin" />}حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default GroupAssistantControl;
