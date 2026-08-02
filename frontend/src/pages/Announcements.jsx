import { useState, useEffect } from 'react';
import axios from 'axios';
import { useTheme } from '../context/ThemeContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { toast } from 'sonner';
import { Megaphone, Plus, Trash2, Send } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// N1 - إدارة الإعلانات (المدير)
const Announcements = () => {
  const { isDark } = useTheme();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [audience, setAudience] = useState('sheikhs');
  const [sending, setSending] = useState(false);

  useEffect(() => { fetchItems(); }, []);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/announcements`);
      setItems(res.data || []);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const send = async () => {
    if (!title.trim() || !message.trim()) { toast.error('أدخل العنوان والنص'); return; }
    setSending(true);
    try {
      const res = await axios.post(`${API}/announcements`, { title, message, audience });
      toast.success(`${res.data.message} (${res.data.recipients} مستلم)`);
      setTitle(''); setMessage('');
      fetchItems();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'فشل في البثّ');
    } finally { setSending(false); }
  };

  const remove = async (id) => {
    if (!window.confirm('حذف هذا الإعلان؟')) return;
    try {
      await axios.delete(`${API}/announcements/${id}`);
      toast.success('تم الحذف');
      fetchItems();
    } catch (e) { toast.error('فشل في الحذف'); }
  };

  const fmt = (iso) => { try { return new Date(iso).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' }); } catch { return ''; } };

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className={`p-6 rounded-xl ${isDark ? 'glass-card border border-white/10' : 'bg-white border border-slate-200 shadow-sm'}`}>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center"><Megaphone className="w-6 h-6 text-amber-400" /></div>
          <div>
            <h1 className={`text-xl md:text-2xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>الإعلانات</h1>
            <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>بثّ إعلان للمشرفين — يظهر في إشعاراتهم وعلى شريط لوحتهم</p>
          </div>
        </div>
      </div>

      {/* Compose */}
      <Card className={isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'}>
        <CardHeader className="pb-2"><CardTitle className={`text-base flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}><Plus className="w-4 h-4 text-amber-400" />إعلان جديد</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>العنوان</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="عنوان الإعلان" className={isDark ? 'bg-slate-800 border-white/10 text-white' : ''} />
          </div>
          <div>
            <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>النص</Label>
            <Textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="نص الإعلان" className={isDark ? 'bg-slate-800 border-white/10 text-white' : ''} />
          </div>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <Label className={isDark ? 'text-slate-300' : 'text-slate-700'}>الجمهور</Label>
              <select value={audience} onChange={(e) => setAudience(e.target.value)} className={`block p-2 rounded-lg border text-sm ${isDark ? 'bg-slate-800 border-white/10 text-white' : 'bg-white border-slate-300'}`}>
                <option value="sheikhs">المشرفون فقط</option>
                <option value="students">الطلاب فقط</option>
                <option value="all">المشرفون والطلاب</option>
              </select>
            </div>
            <Button onClick={send} disabled={sending} className="bg-amber-600 hover:bg-amber-700"><Send className="w-4 h-4 ml-1" />بثّ الإعلان</Button>
          </div>
        </CardContent>
      </Card>

      {/* List */}
      <Card className={isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200'}>
        <CardHeader className="pb-2"><CardTitle className={`text-base ${isDark ? 'text-white' : 'text-slate-900'}`}>الإعلانات المبثوثة ({items.length})</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center h-24"><div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" /></div>
          ) : items.length === 0 ? (
            <p className={`text-center py-6 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>لا توجد إعلانات</p>
          ) : (
            <div className="space-y-2">
              {items.map((a) => (
                <div key={a.id} className={`p-3 rounded-lg flex items-start justify-between gap-3 ${isDark ? 'bg-slate-800/50' : 'bg-slate-50'}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={`font-bold text-sm ${isDark ? 'text-white' : 'text-slate-900'}`}>{a.title}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        a.audience === 'all' ? 'bg-blue-500/20 text-blue-400'
                        : a.audience === 'students' ? 'bg-purple-500/20 text-purple-400'
                        : 'bg-emerald-500/20 text-emerald-400'
                      }`}>
                        {a.audience === 'all' ? 'الكل' : a.audience === 'students' ? 'الطلاب' : 'المشرفون'}
                      </span>
                    </div>
                    <p className={`text-sm ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{a.message}</p>
                    <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{fmt(a.created_at)}</p>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => remove(a.id)} className="text-red-400 hover:bg-red-500/10"><Trash2 className="w-4 h-4" /></Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Announcements;
