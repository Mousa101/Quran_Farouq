import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { MessageCircle, X, Send, ArrowRight, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// #3 — زر محادثة عائم بين الطالب ومشرفه (وللمشرف قائمة طلابه)
const ChatWidget = () => {
  const { user } = useAuth();
  const { isDark } = useTheme();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState('conversation'); // 'list' (للمشرف) | 'conversation'
  const [conversations, setConversations] = useState([]);
  const [activeStudent, setActiveStudent] = useState(null); // {student_id, student_name} للمشرف
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const endRef = useRef(null);

  const isStudent = user?.role === 'student';
  const isSheikh = user?.role === 'sheikh';
  const enabled = isStudent || isSheikh; // الطالب والمشرف فقط

  const fetchUnread = async () => {
    try { const r = await axios.get(`${API}/chat/unread-count`); setUnread(r.data.unread || 0); } catch (e) {}
  };

  useEffect(() => {
    if (!enabled) return;
    fetchUnread();
    const t = setInterval(fetchUnread, 20000);
    return () => clearInterval(t);
  }, [user]); // eslint-disable-line

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const openWidget = async () => {
    setOpen(true);
    if (isStudent) { setView('conversation'); loadMessages(); }
    else { setView('list'); loadConversations(); }
  };

  const loadConversations = async () => {
    setLoading(true);
    try { const r = await axios.get(`${API}/chat/conversations`); setConversations(r.data.conversations || []); }
    catch (e) {} finally { setLoading(false); }
  };

  const loadMessages = async (studentId) => {
    setLoading(true);
    try {
      const q = studentId ? `?student_id=${studentId}` : '';
      const r = await axios.get(`${API}/chat/messages${q}`);
      setMessages(r.data.messages || []);
      fetchUnread();
    } catch (e) {} finally { setLoading(false); }
  };

  const openConversation = (c) => { setActiveStudent(c); setView('conversation'); loadMessages(c.student_id); };

  const send = async () => {
    if (!text.trim()) return;
    setSending(true);
    try {
      const body = { text: text.trim() };
      if (isSheikh && activeStudent) body.student_id = activeStudent.student_id;
      const r = await axios.post(`${API}/chat/send`, body);
      setMessages((m) => [...m, r.data.chat]);
      setText('');
    } catch (e) { /* ignore */ } finally { setSending(false); }
  };

  if (!enabled) return null;

  const bubble = (m) => {
    const mine = m.sender_role === user.role;
    return (
      <div key={m.id} className={`flex ${mine ? 'justify-start' : 'justify-end'} mb-2`}>
        <div className={`max-w-[75%] px-3 py-2 rounded-2xl text-sm ${mine ? 'bg-emerald-600 text-white rounded-tr-sm' : (isDark ? 'bg-slate-700 text-white rounded-tl-sm' : 'bg-slate-200 text-slate-900 rounded-tl-sm')}`}>
          {m.text}
        </div>
      </div>
    );
  };

  return (
    <>
      {/* الزر العائم */}
      <button
        onClick={() => (open ? setOpen(false) : openWidget())}
        className="fixed bottom-5 left-5 z-40 w-14 h-14 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg flex items-center justify-center transition-all"
        title="المحادثة"
      >
        {open ? <X className="w-6 h-6" /> : <MessageCircle className="w-6 h-6" />}
        {!open && unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-red-500 text-white text-[11px] font-bold flex items-center justify-center">{unread > 99 ? '99+' : unread}</span>
        )}
      </button>

      {/* اللوحة */}
      {open && (
        <div className={`fixed bottom-24 left-5 z-40 w-[92vw] max-w-sm h-[70vh] max-h-[560px] rounded-2xl shadow-2xl border flex flex-col overflow-hidden ${isDark ? 'bg-slate-900 border-white/10' : 'bg-white border-slate-200'}`}>
          {/* رأس */}
          <div className={`px-4 py-3 flex items-center gap-2 border-b ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
            {isSheikh && view === 'conversation' && (
              <button onClick={() => { setView('list'); setActiveStudent(null); loadConversations(); }} className="text-slate-400 hover:text-emerald-400"><ArrowRight className="w-5 h-5" /></button>
            )}
            <MessageCircle className="w-5 h-5 text-emerald-400" />
            <p className={`font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
              {isStudent ? 'محادثة مع مشرفي' : (view === 'list' ? 'محادثات الطلاب' : (activeStudent?.student_name || 'محادثة'))}
            </p>
          </div>

          {/* المحتوى */}
          {loading ? (
            <div className="flex-1 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-emerald-400" /></div>
          ) : isSheikh && view === 'list' ? (
            <div className="flex-1 overflow-y-auto p-2">
              {conversations.length === 0 ? (
                <p className="text-center text-slate-400 text-sm mt-8">لا يوجد طلاب</p>
              ) : conversations.map((c) => (
                <button key={c.student_id} onClick={() => openConversation(c)} className={`w-full text-right p-3 rounded-lg mb-1 flex items-center justify-between ${isDark ? 'hover:bg-white/5' : 'hover:bg-slate-100'}`}>
                  <div className="min-w-0">
                    <p className={`font-medium truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>{c.student_name}</p>
                    <p className="text-xs text-slate-400 truncate">{c.last_text || 'ابدأ المحادثة'}</p>
                  </div>
                  {c.unread > 0 && <span className="w-5 h-5 rounded-full bg-red-500 text-white text-[11px] flex items-center justify-center flex-shrink-0">{c.unread}</span>}
                </button>
              ))}
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-3">
              {messages.length === 0 ? (
                <p className="text-center text-slate-400 text-sm mt-8">لا توجد رسائل بعد — ابدأ المحادثة</p>
              ) : messages.map(bubble)}
              <div ref={endRef} />
            </div>
          )}

          {/* حقل الإرسال */}
          {(isStudent || (isSheikh && view === 'conversation')) && (
            <div className={`p-2 border-t flex items-center gap-2 ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
                placeholder="اكتب رسالة..."
                className={`flex-1 px-3 py-2 rounded-full text-sm outline-none ${isDark ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-900'}`}
              />
              <button onClick={send} disabled={sending || !text.trim()} className="w-9 h-9 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center disabled:opacity-50">
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
};

export default ChatWidget;
