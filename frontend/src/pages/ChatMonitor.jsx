import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useTheme } from '../context/ThemeContext';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { MessageCircle, Loader2, User, Trash2, Users, BookUser } from 'lucide-react';
import { toast } from 'sonner';
import { formatDate } from '../lib/utils';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const ROLE_LABEL = { student: 'الطالب', sheikh: 'المشرف', admin: 'الإدارة' };
const ROLE_BUBBLE = {
  student: 'bg-slate-700 text-white',
  sheikh: 'bg-blue-600 text-white',
  admin: 'bg-purple-600 text-white',
};

const convoKey = (c) => (c.type === 'admin_sheikh' ? `sh-${c.sheikh_id}` : `st-${c.student_id}`);
const convoName = (c) => (c.type === 'admin_sheikh' ? `الإدارة ↔ ${c.sheikh_name}` : c.student_name);

// #3 — المدير يرى كل المحادثات بعرض مباشر، ويستطيع حذف رسالة أو محادثة كاملة
const ChatMonitor = () => {
  const { isDark } = useTheme();
  const [conversations, setConversations] = useState([]);
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msgLoading, setMsgLoading] = useState(false);
  const endRef = useRef(null);
  const lastCountRef = useRef(0);

  const loadConversations = async () => {
    try {
      const r = await axios.get(`${API}/chat/conversations`);
      // محادثات المشرفين التي لم تبدأ بعد لا تظهر هنا
      setConversations((r.data.conversations || []).filter((c) => c.last_at));
    } catch (e) { /* ignore */ } finally { setLoading(false); }
  };

  const loadMessages = async (c, silent = false) => {
    if (!c) return;
    if (!silent) setMsgLoading(true);
    try {
      const q = c.type === 'admin_sheikh' ? `sheikh_id=${c.sheikh_id}` : `student_id=${c.student_id}`;
      const r = await axios.get(`${API}/chat/messages?${q}`);
      setMessages(r.data.messages || []);
    } catch (e) { /* ignore */ } finally { if (!silent) setMsgLoading(false); }
  };

  useEffect(() => { loadConversations(); }, []);

  // عرض مباشر: تحديث القائمة والمحادثة المفتوحة كل 3 ثوانٍ
  useEffect(() => {
    const t = setInterval(() => {
      loadConversations();
      loadMessages(active, true);
    }, 3000);
    return () => clearInterval(t);
  }, [active]); // eslint-disable-line

  useEffect(() => {
    if (messages.length !== lastCountRef.current) endRef.current?.scrollIntoView({ behavior: 'smooth' });
    lastCountRef.current = messages.length;
  }, [messages]);

  const openConvo = (c) => { setActive(c); setMessages([]); lastCountRef.current = 0; loadMessages(c); };

  const deleteMessage = async (m) => {
    if (!window.confirm('حذف هذه الرسالة؟')) return;
    try {
      await axios.delete(`${API}/chat/messages/${m.id}`);
      setMessages((list) => list.filter((x) => x.id !== m.id));
      toast.success('تم حذف الرسالة');
    } catch (e) { toast.error(e.response?.data?.detail || 'فشل في حذف الرسالة'); }
  };

  const deleteConversation = async () => {
    if (!active || !window.confirm(`حذف محادثة «${convoName(active)}» كاملة؟ لا يمكن التراجع عن هذا الإجراء.`)) return;
    try {
      const q = active.type === 'admin_sheikh' ? `sheikh_id=${active.sheikh_id}` : `student_id=${active.student_id}`;
      const r = await axios.delete(`${API}/chat/conversation?${q}`);
      toast.success(r.data.message);
      setActive(null); setMessages([]);
      loadConversations();
    } catch (e) { toast.error(e.response?.data?.detail || 'فشل في حذف المحادثة'); }
  };

  const card = isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200';

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center"><MessageCircle className="w-6 h-6 text-emerald-400" /></div>
        <div>
          <h1 className={`text-xl md:text-2xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>إدارة المحادثات</h1>
          <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>كل المحادثات بعرض مباشر، مع إمكانية حذف الرسائل أو المحادثات</p>
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
            ) : conversations.map((c) => {
              const Icon = c.type === 'admin_sheikh' ? BookUser : Users;
              const selected = active && convoKey(active) === convoKey(c);
              return (
                <button key={convoKey(c)} onClick={() => openConvo(c)}
                  className={`w-full text-right p-3 rounded-lg mb-1 flex items-center gap-2 ${selected ? 'bg-emerald-500/15' : (isDark ? 'hover:bg-white/5' : 'hover:bg-slate-100')}`}>
                  <Icon className={`w-4 h-4 flex-shrink-0 ${c.type === 'admin_sheikh' ? 'text-purple-400' : 'text-emerald-400'}`} />
                  <div className="min-w-0 flex-1">
                    <p className={`font-medium truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>{convoName(c)}</p>
                    <p className="text-xs text-slate-400 truncate">{c.last_text || '—'}</p>
                  </div>
                  {c.unread > 0 && (
                    <span className="w-5 h-5 rounded-full bg-red-500 text-white text-[11px] flex items-center justify-center flex-shrink-0">{c.unread}</span>
                  )}
                </button>
              );
            })}
          </CardContent>
        </Card>

        {/* الرسائل */}
        <Card className={`${card} md:col-span-2`}>
          <CardContent className="p-4 h-[70vh] flex flex-col">
            {active && (
              <div className={`flex items-center justify-between gap-2 pb-3 mb-3 border-b ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
                <p className={`font-bold truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>{convoName(active)}</p>
                <Button size="sm" variant="outline" onClick={deleteConversation} disabled={messages.length === 0}
                  className="border-red-500/30 text-red-400 hover:bg-red-500/20">
                  <Trash2 className="w-4 h-4 ml-1" />
                  حذف المحادثة
                </Button>
              </div>
            )}
            <div className="flex-1 overflow-y-auto">
              {!active ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-400">
                  <User className="w-12 h-12 mb-2 opacity-40" />اختر محادثة لعرضها
                </div>
              ) : msgLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-emerald-400" /></div>
              ) : messages.length === 0 ? (
                <p className="text-center text-slate-400 text-sm py-8">لا توجد رسائل</p>
              ) : messages.map((m) => (
                <div key={m.id} className={`group flex items-center gap-1 ${m.sender_role === 'student' ? 'justify-start' : 'justify-end'} mb-2`}>
                  <div className={`max-w-[75%] px-3 py-2 rounded-2xl text-sm ${ROLE_BUBBLE[m.sender_role] || ROLE_BUBBLE.student}`}>
                    <p className="text-[10px] opacity-70 mb-0.5">
                      {m.sender_name || ROLE_LABEL[m.sender_role]} · {ROLE_LABEL[m.sender_role] || ''} · {formatDate(m.created_at, { withTime: true })}
                    </p>
                    {m.text}
                  </div>
                  <button onClick={() => deleteMessage(m)} title="حذف الرسالة"
                    className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-400 transition-opacity">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <div ref={endRef} />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ChatMonitor;
