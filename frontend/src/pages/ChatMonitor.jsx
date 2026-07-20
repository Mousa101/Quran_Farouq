import { useState, useEffect } from 'react';
import axios from 'axios';
import { useTheme } from '../context/ThemeContext';
import { Card, CardContent } from '../components/ui/card';
import { MessageCircle, Loader2, User } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// #3 — المدير يرى كل المحادثات بين الطلاب والمشرفين (قراءة فقط)
const ChatMonitor = () => {
  const { isDark } = useTheme();
  const [conversations, setConversations] = useState([]);
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msgLoading, setMsgLoading] = useState(false);

  useEffect(() => {
    axios.get(`${API}/chat/conversations`)
      .then((r) => setConversations(r.data.conversations || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const openConvo = async (c) => {
    setActive(c); setMsgLoading(true);
    try { const r = await axios.get(`${API}/chat/messages?student_id=${c.student_id}`); setMessages(r.data.messages || []); }
    catch (e) {} finally { setMsgLoading(false); }
  };

  const card = isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200';

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center"><MessageCircle className="w-6 h-6 text-emerald-400" /></div>
        <div>
          <h1 className={`text-xl md:text-2xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>مراقبة المحادثات</h1>
          <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>كل المحادثات بين الطلاب والمشرفين (قراءة فقط)</p>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        {/* قائمة المحادثات */}
        <Card className={`${card} md:col-span-1`}>
          <CardContent className="p-2 max-h-[70vh] overflow-y-auto">
            {loading ? (
              <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-emerald-400" /></div>
            ) : conversations.length === 0 ? (
              <p className="text-center text-slate-400 text-sm py-8">لا توجد محادثات</p>
            ) : conversations.map((c) => (
              <button key={c.student_id} onClick={() => openConvo(c)}
                className={`w-full text-right p-3 rounded-lg mb-1 ${active?.student_id === c.student_id ? 'bg-emerald-500/15' : (isDark ? 'hover:bg-white/5' : 'hover:bg-slate-100')}`}>
                <p className={`font-medium truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>{c.student_name}</p>
                <p className="text-xs text-slate-400 truncate">{c.last_text || '—'}</p>
              </button>
            ))}
          </CardContent>
        </Card>

        {/* الرسائل */}
        <Card className={`${card} md:col-span-2`}>
          <CardContent className="p-4 h-[70vh] overflow-y-auto">
            {!active ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400">
                <User className="w-12 h-12 mb-2 opacity-40" />اختر محادثة لعرضها
              </div>
            ) : msgLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-emerald-400" /></div>
            ) : messages.length === 0 ? (
              <p className="text-center text-slate-400 text-sm py-8">لا توجد رسائل</p>
            ) : messages.map((m) => (
              <div key={m.id} className={`flex ${m.sender_role === 'sheikh' ? 'justify-end' : 'justify-start'} mb-2`}>
                <div className={`max-w-[75%] px-3 py-2 rounded-2xl text-sm ${m.sender_role === 'sheikh' ? 'bg-blue-600 text-white' : (isDark ? 'bg-slate-700 text-white' : 'bg-slate-200 text-slate-900')}`}>
                  <p className="text-[10px] opacity-70 mb-0.5">{m.sender_role === 'sheikh' ? 'المشرف' : 'الطالب'}</p>
                  {m.text}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ChatMonitor;
