import { clsx } from "clsx";
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

// كل التواريخ أرقامًا: يوم/شهر/سنة (ميلادي، أرقام لاتينية) — بدون أسماء أشهر ولا Intl
// حتى لا تظهر رموز غريبة على بعض الأجهزة.
const WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const pad = (n) => String(n).padStart(2, '0');

export function formatDate(value, { withTime = false, withWeekday = false } = {}) {
  if (!value) return '-';
  // تاريخ بلا وقت (YYYY-MM-DD) يُقرأ بالتوقيت المحلي حتى لا يتأخر يومًا
  const d = value instanceof Date ? value
    : new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value);
  if (isNaN(d.getTime())) return String(value);
  let out = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  if (withWeekday) out = `${WEEKDAYS[d.getDay()]} ${out}`;
  if (withTime) {
    const h = d.getHours();
    out += ` ${pad(h % 12 || 12)}:${pad(d.getMinutes())} ${h < 12 ? 'ص' : 'م'}`;
  }
  return out;
}

export const weekdayName = (value) => {
  const d = value instanceof Date ? value : new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value);
  return isNaN(d.getTime()) ? '' : WEEKDAYS[d.getDay()];
};
