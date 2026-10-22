import { useState, useEffect } from 'react';
import axios from 'axios';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Switch } from '../components/ui/switch';
import { toast } from 'sonner';
import { SlidersHorizontal, BookUser, GraduationCap, Bell, PanelRight, Save, Loader2 } from 'lucide-react';
import { NAV_ITEMS } from '../lib/navItems';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const ROLES = [
  { key: 'sheikh', label: 'المشرفون', icon: BookUser, color: 'text-blue-400' },
  { key: 'student', label: 'الطلاب', icon: GraduationCap, color: 'text-emerald-400' },
];

const NOTIFICATION_TYPES = [
  { key: 'system', label: 'إشعارات النظام', hint: 'التسميع والحضور والنقاط والإنذارات والواجبات' },
  { key: 'announcement', label: 'الإعلانات والرسائل الجماعية', hint: 'إعلانات الإدارة ورسائل المشرف لطلابه' },
  { key: 'chat', label: 'تنبيهات المحادثة', hint: 'إشعار عند وصول رسالة جديدة في المحادثة' },
];

// الإشعارات تُدار من قسمها الخاص، والرئيسية لا تُخفى
const configurableItems = (role) => NAV_ITEMS[role].filter((i) => i.to !== '/dashboard' && i.to !== '/notifications');

// إعدادات العرض: المدير يتحكم في روابط القائمة الجانبية وفي الإشعارات لكل من المشرفين والطلاب
const DisplaySettings = () => {
  const { isDark } = useTheme();
  const { refreshUiSettings } = useAuth();
  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    axios.get(`${API}/ui-settings`)
      .then((r) => setSettings(r.data))
      .catch(() => toast.error('فشل في تحميل الإعدادات'));
  }, []);

  const isVisible = (role, path) => !settings.hidden_nav[role].includes(path);

  const toggleNav = (role, path) => {
    setSettings((prev) => {
      const hidden = prev.hidden_nav[role];
      const next = hidden.includes(path) ? hidden.filter((p) => p !== path) : [...hidden, path];
      return { ...prev, hidden_nav: { ...prev.hidden_nav, [role]: next } };
    });
  };

  const setAllNav = (role, visible) => {
    setSettings((prev) => ({
      ...prev,
      hidden_nav: { ...prev.hidden_nav, [role]: visible ? [] : configurableItems(role).map((i) => i.to) },
    }));
  };

  const setNotif = (role, key, value) => {
    setSettings((prev) => ({
      ...prev,
      notifications: { ...prev.notifications, [role]: { ...prev.notifications[role], [key]: value } },
    }));
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await axios.put(`${API}/admin/ui-settings`, settings);
      setSettings(res.data.settings);
      refreshUiSettings();
      toast.success('تم حفظ إعدادات العرض');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'فشل في حفظ الإعدادات');
    } finally {
      setSaving(false);
    }
  };

  const card = isDark ? 'glass-card border-white/10' : 'bg-white border-slate-200';
  const text = isDark ? 'text-white' : 'text-slate-900';
  const muted = isDark ? 'text-slate-400' : 'text-slate-600';

  if (!settings) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center">
            <SlidersHorizontal className="w-6 h-6 text-emerald-400" />
          </div>
          <div>
            <h1 className={`text-xl md:text-2xl font-bold ${text}`}>إعدادات العرض</h1>
            <p className={`text-sm ${muted}`}>التحكم في روابط القائمة الجانبية والإشعارات الظاهرة للمشرفين والطلاب</p>
          </div>
        </div>
        <Button onClick={save} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white">
          {saving ? <Loader2 className="w-4 h-4 ml-2 animate-spin" /> : <Save className="w-4 h-4 ml-2" />}
          حفظ الإعدادات
        </Button>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {ROLES.map(({ key: role, label, icon: RoleIcon, color }) => {
          const notif = settings.notifications[role];
          return (
            <div key={role} className="space-y-6">
              {/* روابط القائمة الجانبية */}
              <Card className={card}>
                <CardHeader className="pb-3">
                  <CardTitle className={`text-lg flex items-center justify-between gap-2 ${text}`}>
                    <span className="flex items-center gap-2">
                      <PanelRight className={`w-5 h-5 ${color}`} />
                      القائمة الجانبية — {label}
                    </span>
                    <span className="flex gap-1">
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setAllNav(role, true)}>إظهار الكل</Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setAllNav(role, false)}>إخفاء الكل</Button>
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1">
                  {configurableItems(role).map(({ to, icon: Icon, label: itemLabel }) => (
                    <label key={to} className={`flex items-center justify-between gap-3 px-3 py-2 rounded-lg cursor-pointer ${isDark ? 'hover:bg-white/5' : 'hover:bg-slate-50'}`}>
                      <span className={`flex items-center gap-2 text-sm ${isVisible(role, to) ? text : 'text-slate-500 line-through'}`}>
                        <Icon className="w-4 h-4 flex-shrink-0" />
                        {itemLabel}
                      </span>
                      <Switch checked={isVisible(role, to)} onCheckedChange={() => toggleNav(role, to)} />
                    </label>
                  ))}
                  <p className={`text-xs pt-2 ${muted}`}>
                    الرابط المخفي يختفي من القائمة، ولا يمكن فتح صفحته مباشرة. «الرئيسية» تظهر دائمًا.
                  </p>
                </CardContent>
              </Card>

              {/* الإشعارات */}
              <Card className={card}>
                <CardHeader className="pb-3">
                  <CardTitle className={`text-lg flex items-center gap-2 ${text}`}>
                    <Bell className={`w-5 h-5 ${color}`} />
                    الإشعارات — {label}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <label className={`flex items-center justify-between gap-3 p-3 rounded-lg cursor-pointer ${isDark ? 'bg-slate-800/50' : 'bg-slate-100'}`}>
                    <span className="flex items-center gap-2">
                      <RoleIcon className={`w-4 h-4 ${color}`} />
                      <span className={`font-medium ${text}`}>إظهار الإشعارات</span>
                    </span>
                    <Switch checked={notif.enabled} onCheckedChange={(v) => setNotif(role, 'enabled', v)} />
                  </label>
                  {NOTIFICATION_TYPES.map(({ key, label: typeLabel, hint }) => (
                    <label key={key} className={`flex items-center justify-between gap-3 px-3 py-2 rounded-lg ${notif.enabled ? 'cursor-pointer' : 'opacity-50'}`}>
                      <span>
                        <span className={`block text-sm ${text}`}>{typeLabel}</span>
                        <span className={`block text-xs ${muted}`}>{hint}</span>
                      </span>
                      <Switch checked={notif[key]} disabled={!notif.enabled} onCheckedChange={(v) => setNotif(role, key, v)} />
                    </label>
                  ))}
                  <p className={`text-xs pt-1 ${muted}`}>
                    عند إيقاف الإشعارات يختفي الجرس ورابط «الإشعارات». الإشعارات تبقى محفوظة وتعود للظهور عند إعادة التفعيل.
                  </p>
                </CardContent>
              </Card>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default DisplaySettings;
