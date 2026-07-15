import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// #2 — الوصول السريع لصفحة الطالب: النقر على اسم الطالب يفتح صفحته (للمدير والمعلم فقط)
const StudentLink = ({ studentId, name, className = '', onNavigate }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canOpen = studentId && (user?.role === 'admin' || user?.role === 'sheikh');

  if (!canOpen) {
    return <span className={className}>{name}</span>;
  }
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        if (onNavigate) onNavigate();
        navigate(`/student/${studentId}`);
      }}
      title="فتح صفحة الطالب"
      className={`text-right hover:text-emerald-400 hover:underline transition-colors cursor-pointer ${className}`}
    >
      {name}
    </button>
  );
};

export default StudentLink;
