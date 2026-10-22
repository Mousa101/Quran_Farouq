// شريط تقدّم الحفظ من 604 صفحة: الحفظ حتى بداية الفصل بلون، وما أُنجز في الفصل الحالي بلون مختلف
const TOTAL_QURAN_PAGES = 604;

const pct = (pages) => Math.min(Math.max((pages / TOTAL_QURAN_PAGES) * 100, 0), 100);

const MemorizationBar = ({ previousPages = 0, termPages = 0, className = '' }) => {
  const prevPct = pct(previousPages);
  const termPct = Math.min(pct(termPages), 100 - prevPct);
  const totalPct = Math.round((prevPct + termPct) * 10) / 10;

  return (
    <div className={className} data-testid="memorization-bar">
      <div
        className="h-4 bg-slate-700 rounded-full overflow-hidden flex"
        role="img"
        aria-label={`${previousPages} صفحة قبل الفصل و${termPages} صفحة في الفصل الحالي من ${TOTAL_QURAN_PAGES}`}
      >
        <div className="h-full bg-blue-500 transition-all" style={{ width: `${prevPct}%` }} title={`قبل الفصل: ${previousPages} صفحة`} />
        <div className="h-full bg-amber-400 transition-all" style={{ width: `${termPct}%` }} title={`الفصل الحالي: ${termPages} صفحة`} />
      </div>
      <div className="flex items-center justify-between gap-2 flex-wrap mt-2 text-xs">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 text-slate-300">
            <span className="w-3 h-3 rounded-sm bg-blue-500 inline-block" />
            قبل الفصل: {previousPages} صفحة
          </span>
          <span className="flex items-center gap-1 text-slate-300">
            <span className="w-3 h-3 rounded-sm bg-amber-400 inline-block" />
            الفصل الحالي: {termPages} صفحة
          </span>
        </div>
        <span className="text-slate-400">{totalPct}% من القرآن</span>
      </div>
    </div>
  );
};

export default MemorizationBar;
