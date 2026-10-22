// الصورة الافتراضية للطالب والمشرف عند عدم رفع صورة شخصية
export const defaultAvatar = (role) => (role === 'sheikh' ? '/avatars/teacher.svg' : '/avatars/student.svg');

export const avatarSrc = (profileImage, role) => profileImage || defaultAvatar(role);

// عند فشل تحميل الصورة المرفوعة نعرض الافتراضية
export const onAvatarError = (role) => (e) => {
  const fallback = defaultAvatar(role);
  if (!e.currentTarget.src.endsWith(fallback)) e.currentTarget.src = fallback;
};

// قراءة صورة من ملف وتصغيرها (أقصى بُعد 400px) ثم إرجاعها كـ data URL — لتخفيف حجم التخزين
export const readImageFile = (file, maxSize = 400) => new Promise((resolve, reject) => {
  if (!file || !file.type.startsWith('image/')) { reject(new Error('type')); return; }
  const reader = new FileReader();
  reader.onerror = () => reject(new Error('read'));
  reader.onload = () => {
    const img = new Image();
    img.onerror = () => reject(new Error('decode'));
    img.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
});
