import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { MessageCircle, X, Send, ArrowRight, Loader2, Users, BookUser, Shield, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// تسمية ولون كل دور داخل الغرفة الثلاثية
const ROLE_META = {
  student: { label: 'الطالب', color: 'text-emerald-400', icon: Users },
  sheikh: { label: 'المشرف', color: 'text-blue-400', icon: BookUser },
  admin: { label: 'الإدارة', color: 'text-purple-400', icon: Shield },
};

// استعلام المحادثة: مدير↔مشرف، أو الطالب مع الإدارة، أو الطالب مع مشرفه
const convoQuery = (c) => {
  if (c.type === 'admin_sheikh') return `sheikh_id=${c.sheikh_id}`;
  return `student_id=${c.student_id}${c.type === 'student_admin' ? '&channel=admin' : ''}`;
};

// الطالب يختار من القائمة: مشرفه أو الإدارة. والمشرف يختار: أحد طلابه أو الإدارة.
const ChatWidget = () => {
  const { user } = useAuth();
  const { isDark } = useTheme();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState('list'); // 'list' | 'conversation'
  const [conversations, setConversations] = useState([]);
  const [active, setActive] = useState(null); // المحادثة المفتوحة
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const endRef = useRef(null);
  const lastCountRef = useRef(0);

  const role = user?.role;
  const isStudent = role === 'student';
  const enabled = ['student', 'sheikh', 'admin'].includes(role);

  const fetchUnread = async () => {
    try { const r = await axios.get(`${API}/chat/unread-count`); setUnread(r.data.unread || 0); } catch (e) {}
  };

  useEffect(() => {
    if (!enabled) return;
    fetchUnread();
    const t = setInterval(fetchUnread, 20000);
    return () => clearInterval(t);
  }, [user]); // eslint-disable-line

  // التمرير للأسفل عند وصول رسائل جديدة فقط (لا عند كل تحديث تلقائي)
  useEffect(() => {
    if (messages.length !== lastCountRef.current) endRef.current?.scrollIntoView({ behavior: 'smooth' });
    lastCountRef.current = messages.length;
  }, [messages]);

  // عرض مباشر: تحديث الرسائل وقائمة المحادثات كل 3 ثوانٍ ما دامت اللوحة مفتوحة
  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => {
      if (view === 'conversation') loadMessages(active, true);
      else loadConversations(true);
    }, 3000);
    return () => clearInterval(t);
  }, [open, view, active]); // eslint-disable-line

  const openWidget = async () => {
    setOpen(true);
    setView('list');
    setActive(null);
    loadConversations();
  };

  const loadConversations = async (silent = false) => {
    if (!silent) setLoading(true);
    try { const r = await axios.get(`${API}/chat/conversations`); setConversations(r.data.conversations || []); }
    catch (e) {} finally { if (!silent) setLoading(false); }
  };

  const loadMessages = async (convo, silent = false) => {
    if (!silent) setLoading(true);
    try {
      const r = await axios.get(`${API}/chat/messages?${convoQuery(convo)}`);
      setMessages(r.data.messages || []);
      fetchUnread();
    } catch (e) { if (!silent) setMessages([]); } finally { if (!silent) setLoading(false); }
  };

  // المدير: حذف رسالة أو المحادثة كاملة
  const deleteMessage = async (m) => {
    if (!window.confirm('حذف هذه الرسالة؟')) return;
    try {
      await axios.delete(`${API}/chat/messages/${m.id}`);
      setMessages((list) => list.filter((x) => x.id !== m.id));
    } catch (e) { toast.error(e.response?.data?.detail || 'فشل في حذف الرسالة'); }
  };

  const deleteConversation = async () => {
    if (!active || !window.confirm('حذف المحادثة كاملة؟ لا يمكن التراجع عن هذا الإجراء.')) return;
    try {
      const r = await axios.delete(`${API}/chat/conversation?${convoQuery(active)}`);
      toast.success(r.data.message);
      setMessages([]);
      setView('list'); setActive(null); loadConversations();
    } catch (e) { toast.error(e.response?.data?.detail || 'فشل في حذف المحادثة'); }
  };

  const openConversation = (c) => { setActive(c); setView('conversation'); loadMessages(c); };

  const send = async () => {
    if (!text.trim()) return;
    setSending(true);
    try {
      const body = { text: text.trim() };
      if (active?.type === 'admin_sheikh') body.sheikh_id = active.sheikh_id;
      else if (active?.student_id) {
        body.student_id = active.student_id;
        if (active.type === 'student_admin') body.channel = 'admin';
      }
      const r = await axios.post(`${API}/chat/send`, body);
      setMessages((m) => [...m, r.data.chat]);
      setText('');
    } catch (e) { /* ignore */ } finally { setSending(false); }
  };

  if (!enabled) return null;

  const title = () => {
    if (view === 'list') return isStudent ? 'مع من تريد التحدث؟' : 'المحادثات';
    if (active?.type === 'admin_sheikh') return role === 'admin' ? `الإدارة ↔ ${active.sheikh_name}` : 'محادثة مع الإدارة';
    if (isStudent) return active?.type === 'student_admin' ? 'محادثة مع الإدارة' : `محادثة مع المشرف ${active?.sheikh_name || ''}`;
    return active?.student_name || 'محادثة';
  };

  // فقاعة رسالة — مع اسم المرسل ودوره (مهم في الغرفة الثلاثية)
  const bubble = (m) => {
    const mine = m.sender_id === user?.user_id || m.sender_id === user?.id;
    const meta = ROLE_META[m.sender_role] || ROLE_META.student;
    return (
      <div key={m.id} className={`group flex items-center gap-1 ${mine ? 'justify-start' : 'justify-end'} mb-2`}>
        <div className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm ${
          mine ? 'bg-emerald-600 text-white rounded-tr-sm'
               : (isDark ? 'bg-slate-700 text-white rounded-tl-sm' : 'bg-slate-200 text-slate-900 rounded-tl-sm')
        }`}>
          {!mine && (
            <p className={`text-[10px] font-bold mb-0.5 ${meta.color}`}>
              {m.sender_name || meta.label} · {meta.label}
            </p>
          )}
          {m.text}
        </div>
        {role === 'admin' && (
          <button onClick={() => deleteMessage(m)} title="حذف الرسالة"
            className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-400 transition-opacity">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    );
  };

  const convoRow = (c) => {
    const isDirect = c.type === 'admin_sheikh' || c.type === 'student_admin';
    const toAdmin = role !== 'admin' && isDirect;
    const toSheikh = isStudent && c.type === 'student_room';
    const Icon = toAdmin ? Shield : (toSheikh || c.type === 'admin_sheikh') ? BookUser : Users;
    let name = c.type === 'admin_sheikh' ? c.sheikh_name : c.student_name;
    if (isStudent) name = toSheikh ? `المشرف: ${c.sheikh_name}` : 'الإدارة';
    const key = c.type === 'admin_sheikh' ? `sh-${c.sheikh_id}` : `${c.type}-${c.student_id}`;
    return (
      <button
        key={key}
        onClick={() => openConversation(c)}
        className={`w-full text-right p-3 rounded-lg mb-1 flex items-center justify-between gap-2 ${isDark ? 'hover:bg-white/5' : 'hover:bg-slate-100'}`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${isDirect ? 'bg-purple-500/20' : 'bg-emerald-500/20'}`}>
            <Icon className={`w-4 h-4 ${isDirect ? 'text-purple-400' : 'text-emerald-400'}`} />
          </div>
          <div className="min-w-0">
            <p className={`font-medium truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>{name}</p>
            <p className="text-xs text-slate-400 truncate">{c.last_text || 'ابدأ المحادثة'}</p>
          </div>
        </div>
        {c.unread > 0 && (
          <span className="w-5 h-5 rounded-full bg-red-500 text-white text-[11px] flex items-center justify-center flex-shrink-0">{c.unread}</span>
        )}
      </button>
    );
  };

  const directConvos = conversations.filter((c) => c.type === 'admin_sheikh');
  const studentAdminConvos = conversations.filter((c) => c.type === 'student_admin');
  const roomConvos = conversations.filter((c) => c.type === 'student_room');

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
            {view === 'conversation' && (
              <button onClick={() => { setView('list'); setActive(null); loadConversations(); }} className="text-slate-400 hover:text-emerald-400">
                <ArrowRight className="w-5 h-5" />
              </button>
            )}
            <MessageCircle className="w-5 h-5 text-emerald-400" />
            <p className={`font-bold text-sm truncate flex-1 ${isDark ? 'text-white' : 'text-slate-900'}`}>{title()}</p>
            {role === 'admin' && view === 'conversation' && active && messages.length > 0 && (
              <button onClick={deleteConversation} title="حذف المحادثة" className="text-slate-400 hover:text-red-400">
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* المحتوى */}
          {loading ? (
            <div className="flex-1 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-emerald-400" /></div>
          ) : view === 'list' ? (
            <div className="flex-1 overflow-y-auto p-2">
              {conversations.length === 0 ? (
                <p className="text-center text-slate-400 text-sm mt-8">لا توجد محادثات</p>
              ) : isStudent ? conversations.map(convoRow) : (
                <>
                  {directConvos.length > 0 && (
                    <>
                      <p className="text-[11px] text-slate-500 px-2 py-1">
                        {role === 'admin' ? 'محادثات مع المشرفين' : 'الإدارة'}
                      </p>
                      {directConvos.map(convoRow)}
                    </>
                  )}
                  {studentAdminConvos.length > 0 && (
                    <>
                      <p className="text-[11px] text-slate-500 px-2 py-1 mt-2">محادثات الطلاب مع الإدارة</p>
                      {studentAdminConvos.map(convoRow)}
                    </>
                  )}
                  {roomConvos.length > 0 && (
                    <>
                      <p className="text-[11px] text-slate-500 px-2 py-1 mt-2">
                        {role === 'admin' ? 'محادثات الطلاب مع المشرفين' : 'الطلاب'}
                      </p>
                      {roomConvos.map(convoRow)}
                    </>
                  )}
                </>
              )}
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-3">
              {/* من يطّلع على هذه المحادثة */}
              {active?.type !== 'admin_sheikh' && (
                <p className={`text-[10px] text-center mb-2 px-2 py-1 rounded ${isDark ? 'bg-slate-800 text-slate-400' : 'bg-slate-100 text-slate-500'}`}>
                  {active?.type === 'student_admin'
                    ? 'محادثة خاصة بين الطالب والإدارة، ولا يراها المشرف'
                    : 'محادثة بين الطالب ومشرفه، وتطّلع عليها الإدارة'}
                </p>
              )}
              {messages.length === 0 ? (
                <p className="text-center text-slate-400 text-sm mt-8">لا توجد رسائل بعد — ابدأ المحادثة</p>
              ) : messages.map(bubble)}
              <div ref={endRef} />
            </div>
          )}

          {/* حقل الإرسال */}
          {view === 'conversation' && (
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
