import { useRef } from 'react';
import { Bold, Italic, Underline, Strikethrough, Highlighter, List, ListOrdered } from 'lucide-react';
import { Textarea } from './ui/textarea';

// تنسيق نص بسيط مثل برنامج Word: يُخزَّن النص بعلامات بسيطة ويُعرض منسّقًا
// (بلا HTML خام، فلا خطر حقن). النص القديم بلا علامات يظهر كما هو.
//   **غامق**   *مائل*   __تسطير__   ~~يتوسطه خط~~   ==تظليل==
//   سطر يبدأ بـ "- " قائمة نقطية، وبـ "1. " قائمة مرقّمة
const INLINE = [
  { mark: '**', key: 'b', render: (c, k) => <strong key={k} className="font-bold">{c}</strong> },
  { mark: '~~', key: 's', render: (c, k) => <s key={k}>{c}</s> },
  { mark: '__', key: 'u', render: (c, k) => <u key={k}>{c}</u> },
  { mark: '==', key: 'h', render: (c, k) => <mark key={k} className="bg-yellow-300/60 text-inherit rounded px-0.5">{c}</mark> },
  { mark: '*', key: 'i', render: (c, k) => <em key={k}>{c}</em> },
];

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const INLINE_RE = new RegExp(INLINE.map((f) => `${esc(f.mark)}(.+?)${esc(f.mark)}`).join('|'));

// تحويل سطر إلى عناصر React مع دعم التنسيقات المتداخلة
const renderInline = (text, keyPrefix = 'x') => {
  const out = [];
  let rest = text;
  let i = 0;
  while (rest) {
    const m = INLINE_RE.exec(rest);
    if (!m) { out.push(rest); break; }
    if (m.index > 0) out.push(rest.slice(0, m.index));
    const idx = m.slice(1).findIndex((g) => g !== undefined);
    const key = `${keyPrefix}-${i++}`;
    out.push(INLINE[idx].render(renderInline(m[idx + 1], key), key));
    rest = rest.slice(m.index + m[0].length);
  }
  return out;
};

export const RichText = ({ text, className = '' }) => {
  if (!text) return null;
  const blocks = [];
  let list = null;
  text.split('\n').forEach((line, n) => {
    const bullet = line.match(/^\s*[-•]\s+(.*)$/);
    const ordered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    const type = bullet ? 'ul' : ordered ? 'ol' : null;
    if (type) {
      if (!list || list.type !== type) { list = { type, items: [] }; blocks.push(list); }
      list.items.push(renderInline((bullet || ordered)[1], `l${n}`));
    } else {
      list = null;
      blocks.push({ type: 'p', content: line ? renderInline(line, `p${n}`) : ' ' });
    }
  });
  return (
    <div className={`text-sm leading-relaxed ${className}`}>
      {blocks.map((b, n) => {
        if (b.type === 'p') return <p key={n} className="min-h-[1.25em]">{b.content}</p>;
        const Tag = b.type;
        return (
          <Tag key={n} className={`${b.type === 'ul' ? 'list-disc' : 'list-decimal'} pr-5 space-y-0.5`}>
            {b.items.map((it, j) => <li key={j}>{it}</li>)}
          </Tag>
        );
      })}
    </div>
  );
};

const TOOLS = [
  { mark: '**', icon: Bold, title: 'غامق (Ctrl+B)', shortcut: 'b' },
  { mark: '*', icon: Italic, title: 'مائل (Ctrl+I)', shortcut: 'i' },
  { mark: '__', icon: Underline, title: 'تسطير (Ctrl+U)', shortcut: 'u' },
  { mark: '~~', icon: Strikethrough, title: 'يتوسطه خط (حذف)', shortcut: 'd' },
  { mark: '==', icon: Highlighter, title: 'تظليل' },
];

// حقل نص مع شريط أدوات تنسيق
export const RichTextarea = ({ value, onChange, className = '', isDark = false, rows = 3, placeholder }) => {
  const ref = useRef(null);

  const apply = (next, selStart, selEnd) => {
    onChange(next);
    requestAnimationFrame(() => {
      const el = ref.current;
      if (el) { el.focus(); el.setSelectionRange(selStart, selEnd); }
    });
  };

  // لفّ النص المحدد بالعلامة، أو إزالتها إن كان ملفوفًا بها أصلًا
  const wrap = (mark) => {
    const el = ref.current;
    if (!el) return;
    const v = value || '';
    const s = el.selectionStart;
    const e = el.selectionEnd;
    const sel = v.slice(s, e);
    const before = v.slice(s - mark.length, s);
    const after = v.slice(e, e + mark.length);
    if (before === mark && after === mark && sel) {
      apply(v.slice(0, s - mark.length) + sel + v.slice(e + mark.length), s - mark.length, e - mark.length);
    } else if (sel.startsWith(mark) && sel.endsWith(mark) && sel.length >= mark.length * 2) {
      const inner = sel.slice(mark.length, sel.length - mark.length);
      apply(v.slice(0, s) + inner + v.slice(e), s, s + inner.length);
    } else {
      const text = sel || 'نص';
      apply(v.slice(0, s) + mark + text + mark + v.slice(e), s + mark.length, s + mark.length + text.length);
    }
  };

  // تحويل الأسطر المحددة إلى قائمة (أو إلغاؤها)
  const toggleList = (ordered) => {
    const el = ref.current;
    if (!el) return;
    const v = value || '';
    const start = v.lastIndexOf('\n', el.selectionStart - 1) + 1;
    let end = v.indexOf('\n', el.selectionEnd);
    if (end === -1) end = v.length;
    const lines = v.slice(start, end).split('\n');
    const re = ordered ? /^\d+[.)]\s+/ : /^[-•]\s+/;
    const allListed = lines.every((l) => re.test(l));
    const next = lines.map((l, i) => {
      const clean = l.replace(/^(\d+[.)]|[-•])\s+/, '');
      return allListed ? clean : `${ordered ? `${i + 1}.` : '-'} ${clean}`;
    }).join('\n');
    apply(v.slice(0, start) + next + v.slice(end), start, start + next.length);
  };

  const onKeyDown = (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    const tool = TOOLS.find((t) => t.shortcut && t.shortcut === e.key.toLowerCase());
    if (tool) { e.preventDefault(); wrap(tool.mark); }
  };

  const btn = `p-1.5 rounded transition ${isDark ? 'text-slate-300 hover:bg-white/10' : 'text-slate-600 hover:bg-slate-200'}`;
  return (
    <div className={`rounded-md border ${isDark ? 'border-white/10' : 'border-slate-300'}`}>
      <div className={`flex flex-wrap items-center gap-0.5 px-1 py-1 border-b ${isDark ? 'border-white/10 bg-slate-800/60' : 'border-slate-200 bg-slate-50'}`}>
        {TOOLS.map((t) => (
          <button key={t.mark} type="button" title={t.title} aria-label={t.title} className={btn}
            onMouseDown={(e) => e.preventDefault()} onClick={() => wrap(t.mark)}>
            <t.icon className="w-4 h-4" />
          </button>
        ))}
        <span className={`mx-1 h-4 w-px ${isDark ? 'bg-white/10' : 'bg-slate-300'}`} />
        <button type="button" title="قائمة نقطية" aria-label="قائمة نقطية" className={btn}
          onMouseDown={(e) => e.preventDefault()} onClick={() => toggleList(false)}><List className="w-4 h-4" /></button>
        <button type="button" title="قائمة مرقّمة" aria-label="قائمة مرقّمة" className={btn}
          onMouseDown={(e) => e.preventDefault()} onClick={() => toggleList(true)}><ListOrdered className="w-4 h-4" /></button>
      </div>
      <Textarea ref={ref} rows={rows} value={value} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)} onKeyDown={onKeyDown}
        className={`border-0 rounded-t-none focus-visible:ring-0 focus-visible:ring-offset-0 ${className}`} />
      {value && (
        <div className={`px-3 py-2 border-t ${isDark ? 'border-white/10 text-slate-300' : 'border-slate-200 text-slate-700'}`}>
          <p className={`text-[11px] mb-1 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>معاينة</p>
          <RichText text={value} />
        </div>
      )}
    </div>
  );
};
