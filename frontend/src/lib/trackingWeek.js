// أسبوع ورقة المتابعة يبدأ السبت وينتهي الجمعة — بنفس منطق الخادم (get_current_week_start)
import { formatDate } from './utils';

export const PRAYERS_MAX = 35;          // 5 صلوات × 7 أيام
export const SITTING_DAYS_MAX = 7;      // الجلوس مع القرآن يُسجَّل بالأيام
export const SITTING_POINTS_PER_DAY = 5; // 7 أيام = 35 نقطة
export const TRACKING_BASE_MAX = PRAYERS_MAX + SITTING_DAYS_MAX * SITTING_POINTS_PER_DAY; // 70

// YYYY-MM-DD بالتوقيت المحلي (toISOString يحوّل إلى UTC فيتأخر يومًا بعد منتصف الليل في الأردن)
const toYmd = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const getCurrentWeekStart = () => {
  const today = new Date();
  // في JavaScript: 0=الأحد ... 6=السبت
  const daysSinceSaturday = (today.getDay() + 1) % 7;
  const saturday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - daysSinceSaturday);
  return toYmd(saturday);
};

export const weekEndOf = (weekStart) => {
  const d = new Date(`${weekStart}T00:00:00`);
  d.setDate(d.getDate() + 6);
  return toYmd(d);
};

// «من السبت 25 أكتوبر 2026 إلى الجمعة 31 أكتوبر 2026»
export const weekRangeLabel = (weekStart) =>
  `من ${formatDate(weekStart, { withWeekday: true })} إلى ${formatDate(weekEndOf(weekStart), { withWeekday: true })}`;

export const clampPrayers = (v) => Math.min(Math.max(parseInt(v, 10) || 0, 0), PRAYERS_MAX);
export const clampSittingDays = (v) => Math.min(Math.max(parseInt(v, 10) || 0, 0), SITTING_DAYS_MAX);
export const sittingPoints = (days) => clampSittingDays(days) * SITTING_POINTS_PER_DAY;
