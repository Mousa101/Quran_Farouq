import { useState, useEffect } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Bell, Check, CheckCheck } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { ar } from 'date-fns/locale';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const Notifications = () => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchNotifications();
  }, []);

  const fetchNotifications = async () => {
    try {
      const response = await axios.get(`${API}/notifications`);
      setNotifications(response.data);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (notificationId) => {
    try {
      await axios.put(`${API}/notifications/${notificationId}/read`);
      setNotifications(prev => 
        prev.map(n => n.id === notificationId ? { ...n, is_read: true } : n)
      );
    } catch (error) {
      toast.error('فشل تحديث الإشعار');
    }
  };

  const markAllAsRead = async () => {
    try {
      await axios.put(`${API}/notifications/read-all`);
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      toast.success('تم تحديث جميع الإشعارات');
    } catch (error) {
      toast.error('فشل تحديث الإشعارات');
    }
  };

  const getTypeStyle = (type) => {
    switch (type) {
      case 'success':
        return 'border-emerald-500/30 bg-emerald-500/10';
      case 'warning':
        return 'border-amber-500/30 bg-amber-500/10';
      case 'error':
        return 'border-red-500/30 bg-red-500/10';
      default:
        return 'border-blue-500/30 bg-blue-500/10';
    }
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fadeIn" data-testid="notifications-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">الإشعارات</h1>
          <p className="text-slate-400">
            {unreadCount > 0 ? `${unreadCount} إشعارات غير مقروءة` : 'لا توجد إشعارات جديدة'}
          </p>
        </div>
        
        {unreadCount > 0 && (
          <Button
            onClick={markAllAsRead}
            variant="outline"
            className="border-slate-700 text-slate-300 hover:bg-slate-800"
            data-testid="mark-all-read-btn"
          >
            <CheckCheck className="w-5 h-5 ml-2" />
            تحديد الكل كمقروء
          </Button>
        )}
      </div>

      {notifications.length === 0 ? (
        <Card className="glass-card border-white/10">
          <CardContent className="p-12 text-center">
            <Bell className="w-16 h-16 mx-auto text-slate-600 mb-4" />
            <h3 className="text-xl font-bold text-white mb-2">لا توجد إشعارات</h3>
            <p className="text-slate-400">ستظهر إشعاراتك هنا</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {notifications.map((notification) => (
            <Card 
              key={notification.id} 
              className={`glass-card border transition-all ${
                notification.is_read ? 'border-white/5 opacity-70' : getTypeStyle(notification.type)
              }`}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      {!notification.is_read && (
                        <span className="w-2 h-2 rounded-full bg-emerald-400" />
                      )}
                      <h3 className="text-lg font-bold text-white">{notification.title}</h3>
                    </div>
                    <p className="text-slate-400">{notification.message}</p>
                    <p className="text-slate-500 text-sm mt-2">
                      {notification.created_at && formatDistanceToNow(new Date(notification.created_at), { 
                        addSuffix: true,
                        locale: ar 
                      })}
                    </p>
                  </div>
                  
                  {!notification.is_read && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => markAsRead(notification.id)}
                      className="text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
                      data-testid={`mark-read-${notification.id}`}
                    >
                      <Check className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default Notifications;
