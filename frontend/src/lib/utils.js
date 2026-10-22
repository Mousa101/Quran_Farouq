import { clsx } from "clsx";
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

// كل التواريخ بالتقويم الميلادي كاملة (يوم شهر سنة) — 'ar-SA' كان يعرضها بالهجري.
const DATE_LOCALE = 'ar-u-ca-gregory-nu-latn';

export function formatDate(value, { withTime = false, withWeekday = false, short = false } = {}) {
  if (!value) return '-';
  // تاريخ بلا وقت (YYYY-MM-DD) يُقرأ بالتوقيت المحلي حتى لا يتأخر يومًا
  const d = value instanceof Date ? value
    : new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value);
  if (isNaN(d.getTime())) return String(value);
  const opts = { day: 'numeric', month: short ? 'numeric' : 'long', year: 'numeric' };
  if (withWeekday) opts.weekday = 'long';
  if (withTime) { opts.hour = 'numeric'; opts.minute = '2-digit'; }
  return d.toLocaleString(DATE_LOCALE, opts);
}
