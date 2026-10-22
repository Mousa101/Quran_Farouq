// رمز الصلوات في ورقة المتابعة (مسجد) — بنفس أسلوب أيقونات lucide (خط بسماكة 2 ولون currentColor)
const MosqueIcon = ({ className = 'w-4 h-4', ...props }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
    {...props}
  >
    <path d="M12 2v2" />
    <path d="M7 11a5 5 0 0 1 10 0" />
    <path d="M6 11h12v10H6z" />
    <path d="M10 21v-4a2 2 0 0 1 4 0v4" />
    <path d="M3 21V9l1.5-2L6 9" />
    <path d="M21 21V9l-1.5-2L18 9" />
    <path d="M2 21h20" />
  </svg>
);

export default MosqueIcon;
