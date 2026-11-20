import { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { useTheme } from '../context/ThemeContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { toast } from 'sonner';
import {
  FileText, Upload, Plus, Trash2, ArrowRight, Save, Download, Bold, Italic, Underline, Strikethrough,
  List, ListOrdered, AlignRight, AlignCenter, AlignLeft, AlignJustify, Undo2, Redo2, Highlighter,
  Heading1, Heading2, Pilcrow, Loader2, RemoveFormatting, Table2, ListChecks, IndentIncrease, IndentDecrease,
  Minus, ImagePlus, Link2, Rows3, Columns3, X, Search,
} from 'lucide-react';
import { formatDate as fmtDate } from '../lib/utils';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const TEXT_COLORS = ['#000000', '#dc2626', '#2563eb', '#059669', '#d97706', '#7c3aed'];

// تنسيقات محتوى المستند (Tailwind يلغي تنسيق العناوين والقوائم افتراضيًا)
const DOC_CSS = `
.doc-page { font-family: 'Arial', 'Tahoma', sans-serif; font-size: 15px; line-height: 1.8; color: #111827; }
.doc-page:focus { outline: none; }
.doc-page h1 { font-size: 1.8em; font-weight: 700; margin: .6em 0 .3em; }
.doc-page h2 { font-size: 1.4em; font-weight: 700; margin: .6em 0 .3em; }
.doc-page h3 { font-size: 1.2em; font-weight: 700; margin: .5em 0 .25em; }
.doc-page p { margin: 0 0 .5em; min-height: 1em; }
.doc-page ul { list-style: disc; padding-inline-start: 1.6em; margin: .3em 0 .6em; }
.doc-page ol { list-style: decimal; padding-inline-start: 1.6em; margin: .3em 0 .6em; }
.doc-page table { border-collapse: collapse; margin: .6em 0; width: 100%; }
.doc-page td, .doc-page th { border: 1px solid #9ca3af; padding: 4px 8px; vertical-align: top; }
.doc-page img { max-width: 100%; height: auto; }
.doc-page a { color: #2563eb; text-decoration: underline; }
.doc-page blockquote { border-inline-start: 3px solid #d1d5db; padding-inline-start: .8em; color: #4b5563; }
.doc-page hr { border: 0; border-top: 1px solid #9ca3af; margin: 1em 0; }
.doc-page td:focus-within, .doc-page th:focus-within { outline: 2px solid #10b981; outline-offset: -2px; }
.doc-page th { background: #f3f4f6; font-weight: 700; }
.doc-page li.chk { cursor: pointer; }
.doc-page font[size="1"] { font-size: 10px; } .doc-page font[size="2"] { font-size: 13px; }
.doc-page font[size="3"] { font-size: 15px; } .doc-page font[size="4"] { font-size: 18px; }
.doc-page font[size="5"] { font-size: 24px; } .doc-page font[size="6"] { font-size: 32px; }
`;

const FONT_SIZES = [['1', 'صغير جدًا'], ['2', 'صغير'], ['3', 'عادي'], ['4', 'متوسط'], ['5', 'كبير'], ['6', 'كبير جدًا']];
const BOX = '☐';
const CHECKED = '☑';

// اختيار حجم الجدول بالمرور على شبكة (مثل Word)
const TablePicker = ({ onPick, isDark }) => {
  const [hover, setHover] = useState([0, 0]);
  return (
    <div className={`absolute z-20 top-full mt-1 right-0 p-2 rounded-lg shadow-xl border ${isDark ? 'bg-slate-800 border-white/10' : 'bg-white border-slate-200'}`}>
      <div className="grid grid-cols-8 gap-0.5" onMouseLeave={() => setHover([0, 0])}>
        {Array.from({ length: 64 }).map((_, i) => {
          const r = Math.floor(i / 8) + 1;
          const c = (i % 8) + 1;
          const on = r <= hover[0] && c <= hover[1];
          return (
            <button key={i} type="button" aria-label={`${r} × ${c}`}
              onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setHover([r, c])} onClick={() => onPick(r, c)}
              className={`w-4 h-4 border ${on ? 'bg-emerald-500 border-emerald-600' : (isDark ? 'border-white/20' : 'border-slate-300')}`} />
          );
        })}
      </div>
      <p className={`text-xs text-center mt-1 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
        {hover[0] ? `${hover[0]} صف × ${hover[1]} عمود` : 'اختر حجم الجدول'}
      </p>
    </div>
  );
};

const formatSize = (b) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} م.ب` : `${Math.max(1, Math.round(b / 1024))} ك.ب`);

// قسم المستندات: رفع ملفات Word وعرضها وتعديلها داخل الموقع بلا تنزيل
const Documents = () => {
  const { isDark } = useTheme();
  const [docs, setDocs] = useState([]);
  const [search, setSearch] = useState('');
  const [contentHits, setContentHits] = useState(null); // نتائج البحث داخل نص المستندات من الخادم
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const q = search.trim();
    if (!q) { setContentHits(null); return undefined; }
    const t = setTimeout(() => {
      axios.get(`${API}/documents`, { params: { q } })
        .then((r) => setContentHits(new Set((r.data || []).map((d) => d.id))))
        .catch(() => setContentHits(null));
    }, 300);
    return () => clearTimeout(t);
  }, [search]);
  const [uploading, setUploading] = useState(false);
  const [openDoc, setOpenDoc] = useState(null); // {id, title, ...}
  const [title, setTitle] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);
  const editorRef = useRef(null);
  const imageRef = useRef(null);
  const savedRange = useRef(null);
  const [showTablePicker, setShowTablePicker] = useState(false);
  const [inTable, setInTable] = useState(false);

  const muted = isDark ? 'text-slate-400' : 'text-slate-500';
  const strong = isDark ? 'text-white' : 'text-slate-900';
  const cardCls = isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200';
  const input = isDark ? 'bg-slate-800 border-white/10 text-white' : '';

  const fetchDocs = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/documents`);
      setDocs(res.data || []);
    } catch (e) { toast.error('فشل في تحميل المستندات'); } finally { setLoading(false); }
  };

  useEffect(() => { fetchDocs(); }, []);

  // تنبيه قبل مغادرة الصفحة مع تعديلات غير محفوظة
  useEffect(() => {
    const warn = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    // روابط التطبيق الداخلية (القائمة الجانبية وغيرها) لا تمر بـ beforeunload، فنسأل قبل الانتقال
    const guardLinks = (e) => {
      if (!dirty) return;
      const a = e.target.closest?.('a[href]');
      if (a && !editorRef.current?.contains(a) && !window.confirm('هناك تعديلات غير محفوظة في المستند. الخروج بدون حفظ؟')) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    document.addEventListener('click', guardLinks, true);
    return () => {
      window.removeEventListener('beforeunload', warn);
      document.removeEventListener('click', guardLinks, true);
    };
  }, [dirty]);

  const openDocument = async (id) => {
    try {
      const res = await axios.get(`${API}/documents/${id}`);
      setOpenDoc(res.data);
      setTitle(res.data.title);
      setDirty(false);
    } catch (e) { toast.error(e.response?.data?.detail || 'فشل في فتح المستند'); }
  };

  // المحتوى يُكتب في المحرر مرة واحدة عند الفتح (المحرر غير متحكَّم به حتى لا يقفز المؤشر)
  useEffect(() => {
    if (openDoc && editorRef.current) editorRef.current.innerHTML = openDoc.html || '<p></p>';
  }, [openDoc?.id]);

  const upload = async (file) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.docx')) { toast.error('اختر ملف Word بصيغة .docx'); return; }
    const form = new FormData();
    form.append('file', file);
    setUploading(true);
    try {
      const res = await axios.post(`${API}/documents`, form);
      toast.success('تم رفع المستند');
      fetchDocs();
      openDocument(res.data.id);
    } catch (e) { toast.error(e.response?.data?.detail || 'فشل في رفع الملف'); } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const createBlank = async () => {
    try {
      const res = await axios.post(`${API}/documents/blank`, { title: 'مستند جديد' });
      fetchDocs();
      openDocument(res.data.id);
    } catch (e) { toast.error('فشل في إنشاء المستند'); }
  };

  const save = useCallback(async () => {
    if (!openDoc) return;
    if (!title.trim()) { toast.error('أدخل عنوان المستند'); return; }
    setSaving(true);
    try {
      await axios.put(`${API}/documents/${openDoc.id}`, { title, html: editorRef.current?.innerHTML || '' });
      setDirty(false);
      toast.success('تم حفظ المستند');
    } catch (e) { toast.error(e.response?.data?.detail || 'فشل في الحفظ'); } finally { setSaving(false); }
  }, [openDoc, title]);

  const closeDoc = () => {
    if (dirty && !window.confirm('هناك تعديلات غير محفوظة. الخروج بدون حفظ؟')) return;
    setOpenDoc(null);
    setDirty(false);
    fetchDocs();
  };

  const remove = async (d) => {
    if (!window.confirm(`حذف المستند «${d.title}» نهائيًا؟`)) return;
    try {
      await axios.delete(`${API}/documents/${d.id}`);
      toast.success('تم حذف المستند');
      if (openDoc?.id === d.id) { setOpenDoc(null); setDirty(false); }
      fetchDocs();
    } catch (e) { toast.error('فشل في الحذف'); }
  };

  const exportWord = async () => {
    if (dirty) await save();
    try {
      const res = await axios.get(`${API}/documents/${openDoc.id}/export`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title || 'مستند'}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) { toast.error('فشل في التصدير'); }
  };

  // أوامر التنسيق على النص المحدد داخل المحرر
  const exec = (cmd, value = null) => {
    editorRef.current?.focus();
    document.execCommand('styleWithCSS', false, cmd === 'hiliteColor' || cmd === 'foreColor');
    document.execCommand(cmd, false, value);
    setDirty(true);
  };

  // ---- أدوات الجداول والقوائم (تعديل مباشر على عناصر المحرر) ----
  const selectionNode = () => {
    const sel = window.getSelection();
    if (!sel?.rangeCount) return null;
    const n = sel.getRangeAt(0).startContainer;
    return editorRef.current?.contains(n) ? n : null;
  };
  const closestIn = (sel) => {
    const n = selectionNode();
    const el = n && (n.nodeType === 1 ? n : n.parentElement);
    const found = el?.closest(sel);
    return found && editorRef.current.contains(found) ? found : null;
  };
  const rememberRange = () => {
    const sel = window.getSelection();
    if (sel?.rangeCount && editorRef.current?.contains(sel.getRangeAt(0).startContainer)) savedRange.current = sel.getRangeAt(0).cloneRange();
  };
  const restoreRange = () => {
    editorRef.current?.focus();
    if (savedRange.current) {
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(savedRange.current);
    }
  };
  const placeCaret = (el) => {
    const r = document.createRange();
    r.selectNodeContents(el);
    r.collapse(true);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
  };
  const changed = () => { setDirty(true); setInTable(!!closestIn('td,th')); };

  const insertTable = (rows, cols) => {
    setShowTablePicker(false);
    restoreRange();
    const head = `<tr>${Array.from({ length: cols }).map((_, i) => `<th>عنوان ${i + 1}</th>`).join('')}</tr>`;
    const body = Array.from({ length: Math.max(rows - 1, 1) })
      .map(() => `<tr>${Array.from({ length: cols }).map(() => '<td><br></td>').join('')}</tr>`).join('');
    document.execCommand('insertHTML', false, `<table><thead>${head}</thead><tbody>${body}</tbody></table><p><br></p>`);
    changed();
  };

  const addRow = (below) => {
    const tr = closestIn('tr');
    if (!tr) return;
    const row = document.createElement('tr');
    Array.from(tr.children).forEach(() => { const td = document.createElement('td'); td.innerHTML = '<br>'; row.appendChild(td); });
    const inHead = tr.parentElement.tagName === 'THEAD';
    if (inHead) {
      const tbody = tr.closest('table').querySelector('tbody') || tr.closest('table').appendChild(document.createElement('tbody'));
      tbody.insertBefore(row, tbody.firstChild);
    } else tr.parentElement.insertBefore(row, below ? tr.nextSibling : tr);
    placeCaret(row.firstChild);
    changed();
  };

  const addColumn = (after) => {
    const cell = closestIn('td,th');
    if (!cell) return;
    const idx = Array.from(cell.parentElement.children).indexOf(cell);
    cell.closest('table').querySelectorAll('tr').forEach((tr) => {
      const isHead = tr.parentElement.tagName === 'THEAD';
      const c = document.createElement(isHead ? 'th' : 'td');
      c.innerHTML = isHead ? 'عنوان' : '<br>';
      const ref = tr.children[after ? idx + 1 : idx] || null;
      tr.insertBefore(c, ref);
    });
    changed();
  };

  const deleteRow = () => {
    const tr = closestIn('tr');
    if (!tr) return;
    const table = tr.closest('table');
    tr.remove();
    if (!table.querySelector('tr')) table.remove();
    changed();
  };

  const deleteColumn = () => {
    const cell = closestIn('td,th');
    if (!cell) return;
    const idx = Array.from(cell.parentElement.children).indexOf(cell);
    const table = cell.closest('table');
    table.querySelectorAll('tr').forEach((tr) => tr.children[idx]?.remove());
    if (!table.querySelector('td,th')) table.remove();
    changed();
  };

  const deleteTable = () => {
    const table = closestIn('table');
    if (table && window.confirm('حذف الجدول كاملًا؟')) { table.remove(); changed(); }
  };

  // قائمة مهام: عناصر تبدأ بمربع ☐ يتحول إلى ☑ بالنقر عليه
  const insertChecklist = () => {
    editorRef.current?.focus();
    const sel = window.getSelection().toString().trim();
    const items = (sel ? sel.split('\n').filter(Boolean) : ['مهمة']).map((t) => `<li class="chk">${BOX} ${t}</li>`).join('');
    document.execCommand('insertHTML', false, `<ul data-new-chk="1" style="list-style:none;padding-inline-start:0">${items}</ul><p><br></p>`);
    // وضع المؤشر في آخر عنصر من القائمة الجديدة ليبدأ الكتابة فيها مباشرة
    const ul = editorRef.current?.querySelector('ul[data-new-chk]');
    if (ul) {
      ul.removeAttribute('data-new-chk');
      const last = ul.lastElementChild;
      const r = document.createRange();
      r.selectNodeContents(last);
      r.collapse(false);
      const s = window.getSelection();
      s.removeAllRanges();
      s.addRange(r);
    }
    changed();
  };

  const onEditorClick = (e) => {
    const li = e.target.closest?.('li');
    if (!li || !editorRef.current.contains(li)) { changed(); return; }
    const text = li.firstChild;
    if (text?.nodeType === 3 && (text.data.startsWith(BOX) || text.data.startsWith(CHECKED))) {
      // النقر قرب بداية السطر (على المربع) يبدّل الحالة
      const rect = li.getBoundingClientRect();
      if (Math.abs(e.clientX - rect.right) < 24) {
        const done = text.data.startsWith(BOX);
        text.data = (done ? CHECKED : BOX) + text.data.slice(1);
        li.style.textDecoration = done ? 'line-through' : '';
        li.style.color = done ? '#6b7280' : '';
        setDirty(true);
      }
    }
    changed();
  };

  const insertImage = (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('اختر صورة'); return; }
    if (file.size > 3 * 1024 * 1024) { toast.error('حجم الصورة أكبر من 3 ميغابايت'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      restoreRange();
      document.execCommand('insertImage', false, reader.result);
      changed();
    };
    reader.readAsDataURL(file);
    if (imageRef.current) imageRef.current.value = '';
  };

  const insertLink = () => {
    rememberRange();
    const url = window.prompt('رابط الصفحة (يبدأ بـ https://)');
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) { toast.error('الرابط يجب أن يبدأ بـ http:// أو https://'); return; }
    restoreRange();
    if (window.getSelection().toString()) document.execCommand('createLink', false, url);
    else document.execCommand('insertHTML', false, `<a href="${url.replace(/"/g, '%22')}">${url.replace(/</g, '&lt;')}</a>`);
    changed();
  };

  const onKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
    // Tab داخل الجدول: الانتقال للخلية التالية، وفي آخر خلية يُضاف صف
    if (e.key === 'Tab') {
      const cell = closestIn('td,th');
      if (cell) {
        e.preventDefault();
        const cells = Array.from(cell.closest('table').querySelectorAll('td,th'));
        const next = cells[cells.indexOf(cell) + (e.shiftKey ? -1 : 1)];
        if (next) placeCaret(next);
        else if (!e.shiftKey) addRow(true);
      } else {
        e.preventDefault();
        exec(e.shiftKey ? 'outdent' : 'indent');
      }
    }
    // Enter في عنصر قائمة مهام: العنصر الجديد يبدأ بمربع فارغ
    if (e.key === 'Enter' && !e.shiftKey) {
      const li = closestIn('li.chk');
      if (li) {
        e.preventDefault();
        if (li.textContent.replace(/[☐☑]/g, '').trim() === '') {
          const p = document.createElement('p'); p.innerHTML = '<br>';
          li.parentElement.after(p); li.remove(); placeCaret(p);
        } else {
          const n = document.createElement('li'); n.className = 'chk'; n.textContent = `${BOX} `;
          li.after(n);
          const r = document.createRange(); r.setStart(n.firstChild, 2); r.collapse(true);
          const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
        }
        changed();
      }
    }
  };

  const tool = (Icon, label, onClick, active) => (
    <button key={label} type="button" title={label} aria-label={label}
      onMouseDown={(e) => e.preventDefault()} onClick={onClick}
      className={`p-1.5 rounded transition ${active ? 'bg-emerald-600 text-white' : (isDark ? 'text-slate-300 hover:bg-white/10' : 'text-slate-700 hover:bg-slate-200')}`}>
      <Icon className="w-4 h-4" />
    </button>
  );
  const sep = (k) => <span key={k} className={`mx-1 h-5 w-px ${isDark ? 'bg-white/10' : 'bg-slate-300'}`} />;

  if (openDoc) {
    return (
      <div className="space-y-4 animate-fadeIn">
        <style>{DOC_CSS}</style>
        <Card className={cardCls}>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="ghost" size="sm" onClick={closeDoc} className={muted}><ArrowRight className="w-4 h-4 ml-1" />كل المستندات</Button>
              <Input value={title} onChange={(e) => { setTitle(e.target.value); setDirty(true); }} className={`flex-1 min-w-[200px] font-bold ${input}`} />
              <span className={`text-xs ${dirty ? 'text-amber-500' : muted}`}>{dirty ? 'تعديلات غير محفوظة' : 'محفوظ'}</span>
              <Button onClick={save} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
                {saving ? <Loader2 className="w-4 h-4 ml-1 animate-spin" /> : <Save className="w-4 h-4 ml-1" />}حفظ
              </Button>
              <Button variant="outline" onClick={exportWord} className={isDark ? 'border-white/10' : ''} title="تنزيل نسخة Word (اختياري)">
                <Download className="w-4 h-4 ml-1" />Word
              </Button>
            </div>

            <div className={`sticky top-0 z-10 flex flex-wrap items-center gap-0.5 p-1.5 rounded-lg border ${isDark ? 'bg-slate-800 border-white/10' : 'bg-slate-50 border-slate-200'}`}>
              {tool(Undo2, 'تراجع', () => exec('undo'))}
              {tool(Redo2, 'إعادة', () => exec('redo'))}
              {sep('s1')}
              {tool(Heading1, 'عنوان رئيسي', () => exec('formatBlock', 'H1'))}
              {tool(Heading2, 'عنوان فرعي', () => exec('formatBlock', 'H2'))}
              {tool(Pilcrow, 'نص عادي', () => exec('formatBlock', 'P'))}
              {sep('s2')}
              {tool(Bold, 'غامق (Ctrl+B)', () => exec('bold'))}
              {tool(Italic, 'مائل (Ctrl+I)', () => exec('italic'))}
              {tool(Underline, 'تسطير (Ctrl+U)', () => exec('underline'))}
              {tool(Strikethrough, 'يتوسطه خط', () => exec('strikeThrough'))}
              {tool(Highlighter, 'تظليل', () => exec('hiliteColor', '#fde047'))}
              {tool(RemoveFormatting, 'إزالة التنسيق', () => exec('removeFormat'))}
              {sep('s3')}
              <span className={`text-xs px-1 ${muted}`}>اللون</span>
              {TEXT_COLORS.map((c) => (
                <button key={c} type="button" title="لون النص" aria-label={`لون ${c}`}
                  onMouseDown={(e) => e.preventDefault()} onClick={() => exec('foreColor', c)}
                  className="w-5 h-5 rounded-full border border-white/40" style={{ background: c }} />
              ))}
              {sep('s4')}
              {tool(List, 'قائمة نقطية', () => exec('insertUnorderedList'))}
              {tool(ListOrdered, 'قائمة مرقّمة', () => exec('insertOrderedList'))}
              {sep('s5')}
              {tool(AlignRight, 'محاذاة لليمين', () => exec('justifyRight'))}
              {tool(AlignCenter, 'توسيط', () => exec('justifyCenter'))}
              {tool(AlignLeft, 'محاذاة لليسار', () => exec('justifyLeft'))}
              {tool(AlignJustify, 'ضبط', () => exec('justifyFull'))}
              {sep('s6')}
              <select title="حجم الخط" aria-label="حجم الخط" defaultValue=""
                onMouseDown={rememberRange}
                onChange={(e) => { restoreRange(); exec('fontSize', e.target.value); e.target.value = ''; }}
                className={`text-xs rounded border px-1 py-1 ${isDark ? 'bg-slate-700 border-white/10 text-slate-200' : 'bg-white border-slate-300'}`}>
                <option value="" disabled>حجم الخط</option>
                {FONT_SIZES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              {tool(IndentIncrease, 'زيادة المسافة البادئة (Tab)', () => exec('indent'))}
              {tool(IndentDecrease, 'إنقاص المسافة البادئة (Shift+Tab)', () => exec('outdent'))}
              {sep('s7')}
              {tool(ListChecks, 'قائمة مهام (☐ تُعلَّم بالنقر)', insertChecklist)}
              <span className="relative">
                {tool(Table2, 'إدراج جدول', () => { rememberRange(); setShowTablePicker((v) => !v); }, showTablePicker)}
                {showTablePicker && <TablePicker isDark={isDark} onPick={insertTable} />}
              </span>
              {tool(Minus, 'خط فاصل', () => exec('insertHorizontalRule'))}
              {tool(ImagePlus, 'إدراج صورة', () => { rememberRange(); imageRef.current?.click(); })}
              {tool(Link2, 'إدراج رابط', insertLink)}
              <input ref={imageRef} type="file" accept="image/*" className="hidden" onChange={(e) => insertImage(e.target.files?.[0])} />
            </div>

            {inTable && (
              <div className={`flex flex-wrap items-center gap-1 p-1.5 rounded-lg border text-xs ${isDark ? 'bg-emerald-900/30 border-emerald-500/30 text-slate-200' : 'bg-emerald-50 border-emerald-200 text-slate-700'}`}>
                <span className="font-bold px-1 flex items-center gap-1"><Table2 className="w-4 h-4" />الجدول:</span>
                {[
                  [Rows3, 'صف فوق', () => addRow(false)],
                  [Rows3, 'صف تحت', () => addRow(true)],
                  [Columns3, 'عمود قبل', () => addColumn(false)],
                  [Columns3, 'عمود بعد', () => addColumn(true)],
                ].map(([Icon, label, fn]) => (
                  <button key={label} type="button" onMouseDown={(e) => e.preventDefault()} onClick={fn}
                    className={`flex items-center gap-1 px-2 py-1 rounded ${isDark ? 'hover:bg-white/10' : 'hover:bg-white'}`}>
                    <Icon className="w-3.5 h-3.5" />{label}
                  </button>
                ))}
                <span className={`mx-1 h-4 w-px ${isDark ? 'bg-white/10' : 'bg-slate-300'}`} />
                {[['حذف الصف', deleteRow], ['حذف العمود', deleteColumn], ['حذف الجدول', deleteTable]].map(([label, fn]) => (
                  <button key={label} type="button" onMouseDown={(e) => e.preventDefault()} onClick={fn}
                    className="flex items-center gap-1 px-2 py-1 rounded text-red-500 hover:bg-red-500/10">
                    <X className="w-3.5 h-3.5" />{label}
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* الصفحة: خلفية بيضاء كورقة Word في الوضعين */}
        <div className={`rounded-xl p-3 md:p-8 ${isDark ? 'bg-slate-800/40' : 'bg-slate-100'}`}>
          <div
            ref={editorRef}
            dir="rtl"
            contentEditable
            suppressContentEditableWarning
            onInput={() => setDirty(true)}
            onKeyDown={onKeyDown}
            onKeyUp={() => setInTable(!!closestIn('td,th'))}
            onClick={onEditorClick}
            onBlur={rememberRange}
            className="doc-page mx-auto bg-white shadow-lg rounded-sm max-w-[816px] min-h-[1000px] p-6 md:p-16"
          />
        </div>
        <p className={`text-xs text-center ${muted}`}>Ctrl+S للحفظ — Tab للانتقال بين خلايا الجدول (وفي آخر خلية يُضاف صف) — انقر المربع ☐ لتعليم المهمة.</p>
      </div>
    );
  }

  // البحث: العنوان واسم الملف محليًا + نص المستند من الخادم
  const sq = search.trim().toLowerCase();
  const shownDocs = !sq ? docs : docs.filter((d) =>
    (d.title || '').toLowerCase().includes(sq) || (d.filename || '').toLowerCase().includes(sq) || contentHits?.has(d.id));

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className={`p-6 rounded-xl ${isDark ? 'glass-card border border-white/10' : 'bg-white border border-slate-200 shadow-sm'}`}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center"><FileText className="w-6 h-6 text-emerald-400" /></div>
            <div>
              <h1 className={`text-xl md:text-2xl font-bold ${strong}`}>المستندات</h1>
              <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>ارفع ملفات Word واعرضها وعدّلها داخل الموقع بدون تنزيل</p>
            </div>
          </div>
          <div className="flex gap-2">
            <input ref={fileRef} type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
            <Button onClick={() => fileRef.current?.click()} disabled={uploading} className="bg-emerald-600 hover:bg-emerald-700">
              {uploading ? <Loader2 className="w-4 h-4 ml-1 animate-spin" /> : <Upload className="w-4 h-4 ml-1" />}رفع ملف Word
            </Button>
            <Button variant="outline" onClick={createBlank} className={isDark ? 'border-white/10' : ''}><Plus className="w-4 h-4 ml-1" />مستند فارغ</Button>
          </div>
        </div>
      </div>

      <Card className={cardCls}>
        <CardHeader className="pb-2 flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <CardTitle className={`text-base ${strong}`}>كل المستندات ({shownDocs.length}{search.trim() ? ` من ${docs.length}` : ''})</CardTitle>
          <div className="relative w-full sm:w-72">
            <Search className={`w-4 h-4 absolute right-2.5 top-1/2 -translate-y-1/2 ${muted}`} />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث في العنوان أو داخل المستند..." className="pr-8" data-testid="documents-search" />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-emerald-500" /></div>
          ) : docs.length === 0 ? (
            <p className={`text-center py-8 ${muted}`}>لا توجد مستندات بعد — ارفع ملف Word للبدء</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {shownDocs.length === 0 && <p className={`col-span-full text-center py-6 ${muted}`}>لا توجد نتائج لـ «{search}»</p>}
              {shownDocs.map((d) => (
                <div key={d.id} className={`p-4 rounded-lg flex items-start gap-3 transition hover:ring-1 hover:ring-emerald-500/50 ${isDark ? 'bg-slate-800/50' : 'bg-slate-50'}`}>
                  <button type="button" onClick={() => openDocument(d.id)} className="flex-1 min-w-0 text-right flex items-start gap-3">
                    <FileText className="w-8 h-8 text-blue-500 shrink-0" />
                    <div className="min-w-0">
                      <p className={`font-bold truncate ${strong}`}>{d.title}</p>
                      <p className={`text-xs ${muted}`}>آخر تعديل: {fmtDate(d.updated_at?.slice(0, 10))}</p>
                      {d.filename && <p className={`text-xs truncate ${muted}`}>{d.filename} — {formatSize(d.size)}</p>}
                    </div>
                  </button>
                  <Button size="sm" variant="ghost" onClick={() => remove(d)} className="text-red-400 hover:bg-red-500/10"><Trash2 className="w-4 h-4" /></Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Documents;
