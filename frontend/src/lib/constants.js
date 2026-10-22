// قوائم ثابتة مشتركة عبر التطبيق (لتوحيد صيغة الكتابة وضمان عمل الفلاتر)

// #1 — نطاق البريد الثابت (المستخدم يكتب الاسم فقط ويُضاف تلقائياً)
export const EMAIL_DOMAIN = '@faroq.com';
export const emailLocalPart = (email) => (email || '').split('@')[0];
export const buildEmail = (localPart) => {
  const local = (localPart || '').trim().split('@')[0];
  return local ? local + EMAIL_DOMAIN : '';
};

// المثال الافتراضي للبريد في كل الحقول
export const EMAIL_PLACEHOLDER = 'example@faroq.com';

// أرقام الهواتف الأردنية: 07 ثم 7 أو 8 أو 9 ثم سبعة أرقام (مثال: 0791234567)
export const PHONE_PLACEHOLDER = '079XXXXXXX';
export const normalizePhone = (value) => {
  let digits = (value || '').replace(/[^0-9+]/g, '');
  if (digits.startsWith('+962')) digits = '0' + digits.slice(4);
  else if (digits.startsWith('00962')) digits = '0' + digits.slice(5);
  else if (digits.startsWith('962')) digits = '0' + digits.slice(3);
  return digits.replace(/\+/g, '').slice(0, 10);
};
export const isValidPhone = (value) => !value || /^07[789][0-9]{7}$/.test(value);
// يرجع رسالة خطأ لأول رقم غير صالح، أو null إذا كانت كل الأرقام صالحة
export const phoneError = (phones) => {
  for (const [label, value] of phones) {
    if (!isValidPhone(value)) return `${label} غير صحيح — يجب أن يكون رقمًا أردنيًا من 10 أرقام يبدأ بـ 077 أو 078 أو 079`;
  }
  return null;
};

// #5 — قائمة المساجد المعتمدة (الخيار الأخير "أخرى" يفتح حقل كتابة حر)
export const MOSQUE_OTHER = 'أخرى';
export const MOSQUES = [
  'مسجد الفالوجة',
  'مسجد المغيرة (الاستقلال)',
  'مسجد صقر شنك',
  'مسجد السنجوقية',
  'مسجد أبو بكر (ضاحية الأقصى)',
  MOSQUE_OTHER,
];

// #4 — قائمة الصفوف الدراسية بصيغة كتابة موحّدة (لضمان دقة التصفية في التقارير)
export const SCHOOL_GRADES = [
  'الصف الأول',
  'الصف الثاني',
  'الصف الثالث',
  'الصف الرابع',
  'الصف الخامس',
  'الصف السادس',
  'الصف السابع',
  'الصف الثامن',
  'الصف التاسع',
  'الصف العاشر',
  'الصف الحادي عشر',
  'الصف الثاني عشر',
];
