import { useState, useEffect } from 'react';
import axios from 'axios';
import { useTheme } from '../context/ThemeContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { toast } from 'sonner';
import { MessageSquare, Send } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// T4 - مراسلة المعلم لطلابه
const SheikhMessage = () => {
  const { isDark } = useTheme();
  const [groups, setGroups] = useState([]);
  const [groupId, setGroupId] = useState('all');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    axios.get(`${API}/groups`).then((r) => setGroups(r.data || [])).catch(() => {});
  }, []);

  const send = async () => {
    if (!title.trim() || !message.trim()) { toast.error('أدخل العنوان والنص'); return; }
    setSending(true);
    try {
      const body = { title, message };
      if (groupId !== 'all') body.group_id = groupId;
      const res = await axios.post(`${API}/sheikh/message`, body);
      toast.success(res.data.message);
      setTitle(''); setMessage('');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'فشل في الإرسال');
    } finally { setSending(false); }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className={`p-6 rounded-xl ${isDark ? 'glass-card border border-white/10' : 'bg-white border border-slate-200 shadow-sm'}`}>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center"><MessageSquare className="w-6 h-6 text-blue-400" /></div>
          <div>
            <h1 className={`text-xl md:text-2xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>مراسلة الطلاب</h1>
            <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>أرسل رسالة لطلابك — تظهر في إشعاراتهم</p>
          </div>
        </div>
      </div>

      <Card className={isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'}>
        <CardHeader className="pb-2"><CardTitle className={`text-base ${isDark ? 'text-white' : 'text-slate-900'}`}>رسالة جديدة</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>إلى</Label>
            <select value={groupId} onChange={(e) => setGroupId(e.target.value)} className={`block p-2 rounded-lg border text-sm ${isDark ? 'bg-slate-800 border-white/10 text-white' : 'bg-white border-slate-300'}`}>
              <option value="all">كل طلابي</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
          <div>
            <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>العنوان</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="عنوان الرسالة" className={isDark ? 'bg-slate-800 border-white/10 text-white' : ''} />
          </div>
          <div>
            <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>النص</Label>
            <Textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="نص الرسالة" className={isDark ? 'bg-slate-800 border-white/10 text-white' : ''} />
          </div>
          <Button onClick={send} disabled={sending} className="bg-blue-600 hover:bg-blue-700"><Send className="w-4 h-4 ml-1" />إرسال</Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default SheikhMessage;
