import { useState } from 'react';
import axios from 'axios';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog';
import { toast } from 'sonner';
import { Send, Loader2 } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// إشعار جماعي: القائمة هي طلاب المجموعة المختارة في صفحة إدارة الطلاب
const BulkNotifyDialog = ({ open, onOpenChange, students, groupLabel }) => {
  const [selected, setSelected] = useState(new Set());
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  // من حُدّد ثم خرج من التصفية لا يُرسَل إليه
  const recipients = students.filter((s) => selected.has(s.id)).map((s) => s.id);
  const allSelected = students.length > 0 && recipients.length === students.length;

  const toggle = (id) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  const toggleAll = () => setSelected(new Set(allSelected ? [] : students.map((s) => s.id)));

  const send = async () => {
    if (!title.trim() || !message.trim()) { toast.error('أدخل العنوان والنص'); return; }
    setSending(true);
    try {
      const res = await axios.post(`${API}/admin/bulk/notify`, { user_ids: recipients, title, message });
      toast.success(res.data.message);
      setSelected(new Set());
      setTitle('');
      setMessage('');
      onOpenChange(false);
    } catch (e) {
      toast.error('فشل في الإرسال');
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-900 border-slate-700 max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Send className="w-5 h-5 text-amber-400" />
            إشعار جماعي للطلاب
          </DialogTitle>
          <DialogDescription className="text-slate-400">{groupLabel} · {students.length} طالب</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 mt-2">
          {students.length === 0 ? (
            <p className="text-sm text-center py-4 text-slate-500">لا يوجد طلاب</p>
          ) : (
            <>
              <label className="flex items-center gap-2 px-2 text-sm cursor-pointer text-amber-400">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} />
                تحديد الكل
              </label>
              <div className="max-h-56 overflow-y-auto space-y-1 p-2 rounded-lg bg-slate-800/40">
                {students.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 p-2 rounded cursor-pointer text-sm hover:bg-white/5 text-white">
                    <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} />
                    {s.name}
                  </label>
                ))}
              </div>
            </>
          )}
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="عنوان الإشعار" className="bg-slate-800 border-white/10 text-white" />
          <Textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="نص الإشعار" className="bg-slate-800 border-white/10 text-white" />
        </div>
        <DialogFooter className="gap-2 mt-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={send} disabled={recipients.length === 0 || sending} className="bg-amber-600 hover:bg-amber-700">
            {sending ? <Loader2 className="w-4 h-4 ml-1 animate-spin" /> : <Send className="w-4 h-4 ml-1" />}
            إرسال للمحدّدين ({recipients.length})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default BulkNotifyDialog;
