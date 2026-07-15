import { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const TOKEN_KEY = 'hafiz_token';

// جلسة مستقلة لكل تبويب (sessionStorage) — تسمح بفتح حساب مدير ومعلم وطالب في تبويبات مختلفة معاً.
// مع بقاء "تذكّر الدخول" عبر localStorage للتبويب الأول (إلا إذا فُتح التبويب بـ ?login=new).
const getInitialToken = () => {
  const sessionToken = sessionStorage.getItem(TOKEN_KEY);
  if (sessionToken) return sessionToken;
  // تبويب فُتح صراحةً لتسجيل حساب آخر → لا تعبئة تلقائية
  const forceLogin = new URLSearchParams(window.location.search).get('login') === 'new';
  if (forceLogin) return null;
  const remembered = localStorage.getItem(TOKEN_KEY);
  if (remembered) {
    sessionStorage.setItem(TOKEN_KEY, remembered); // ثبّتها لهذا التبويب
    return remembered;
  }
  return null;
};

const storeToken = (t) => {
  sessionStorage.setItem(TOKEN_KEY, t); // هذا التبويب
  localStorage.setItem(TOKEN_KEY, t);   // تذكّر للتبويبات الجديدة
};

const clearToken = () => {
  sessionStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(TOKEN_KEY);
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(getInitialToken());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      fetchUser();
    } else {
      setLoading(false);
    }
  }, [token]);

  const fetchUser = async () => {
    try {
      const response = await axios.get(`${API}/auth/me`);
      setUser(response.data);
    } catch (error) {
      console.error('Failed to fetch user:', error);
      logout();
    } finally {
      setLoading(false);
    }
  };

  const login = async (email, password) => {
    const response = await axios.post(`${API}/auth/login`, { email, password });
    const { token: newToken, user: userData } = response.data;

    storeToken(newToken);
    axios.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
    setToken(newToken);
    setUser(userData);

    return userData;
  };

  const register = async (name, email, password, role, registrationCode = '', mosqueName = '', schoolName = '', schoolGrade = '', birthDate = '', profileImage = '', studentPhone = '', fatherPhone = '', motherPhone = '') => {
    const response = await axios.post(`${API}/auth/register`, {
      name,
      email,
      password,
      role,
      registration_code: registrationCode || null,
      mosque_name: mosqueName || null,
      school_name: schoolName || null,
      school_grade: schoolGrade || null,
      birth_date: birthDate || null,
      profile_image: profileImage || null,
      student_phone: studentPhone || null,
      father_phone: fatherPhone || null,
      mother_phone: motherPhone || null
    });
    const { token: newToken, user: userData } = response.data;

    storeToken(newToken);
    axios.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
    setToken(newToken);
    setUser(userData);

    return userData;
  };

  const logout = () => {
    clearToken();
    delete axios.defaults.headers.common['Authorization'];
    setToken(null);
    setUser(null);
  };

  // فتح حساب آخر في تبويب جديد (للاختبار) — جلسة مستقلة لا تؤثر على هذا التبويب
  const openAnotherAccount = () => {
    window.open(`${window.location.origin}/login?login=new`, '_blank');
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout, openAnotherAccount }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
