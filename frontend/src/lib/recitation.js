// وصف موحّد لسجل التسميع: الحالة + المقدار (الجديد والمراجعة) بدون «undefined»
export function describeRecitation(rec = {}) {
  if (rec.did_not_recite || rec.recitation_type === 'did_not_recite') {
    return { status: 'لم يسمّع', parts: [], recited: false };
  }
  const parts = [];
  const newPages = rec.new_pages || rec.pages_count || 0;
  const hasNew = newPages > 0 || rec.has_new_memorization || rec.recitation_type === 'new_memorization';
  if (hasNew) {
    let t = `حفظ جديد: ${newPages} صفحة`;
    if (rec.page_from && rec.page_to) t += ` (ص ${rec.page_from}–${rec.page_to}${rec.juz_number ? `، جزء ${rec.juz_number}` : ''})`;
    else if (rec.juz_number) t += ` (جزء ${rec.juz_number})`;
    parts.push({ kind: 'new', text: t, passed: !!rec.passed_minimum });
  }
  const reviewJuz = (rec.review_juz || []).filter((j) => j !== null && j !== undefined);
  const reviewPages = rec.review_pages || 0;
  const hasReview = reviewPages > 0 || reviewJuz.length > 0 || rec.partial_review_pages || rec.has_review || rec.recitation_type === 'review';
  if (hasReview) {
    let t = `مراجعة: ${reviewPages} صفحة`;
    const extra = [];
    if (reviewJuz.length) extra.push(`أجزاء ${reviewJuz.join('، ')}`);
    if (rec.partial_review_pages) extra.push(`${rec.partial_review_pages} ص من جزء ${rec.partial_review_juz ?? ''}`.trim());
    if (extra.length) t += ` (${extra.join(' + ')})`;
    parts.push({ kind: 'review', text: t, passed: !!rec.passed_review_minimum });
  }
  return { status: parts.length ? 'سمّع' : 'تسميع', parts, recited: true };
}
