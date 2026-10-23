import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { KeyRound, ArrowRight, Phone, Mail, MessageCircle } from 'lucide-react';
import { lastLoginPath } from '../lib/authRoutes';

const ForgotPassword = () => {
  return (
    <div className="min-h-screen bg-background pattern-overlay flex items-center justify-center p-4">
      <Card className="w-full max-w-md glass-card animate-fadeIn">
        <CardHeader className="text-center space-y-4">
          <div className="w-20 h-20 mx-auto rounded-full bg-amber-500/20 flex items-center justify-center">
            <KeyRound className="w-10 h-10 text-amber-400" />
          </div>
          <CardTitle className="text-2xl font-bold text-white font-cairo">
            نسيت كلمة المرور؟
          </CardTitle>
          <CardDescription className="text-slate-400">
            لا تقلق! تواصل مع إدارة المركز لإعادة تعيين كلمة المرور
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-6">
          {/* معلومات التواصل */}
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-slate-800/50 border border-white/5">
              <h3 className="text-emerald-400 font-bold mb-3 flex items-center gap-2">
                <MessageCircle className="w-5 h-5" />
                طرق التواصل مع الإدارة
              </h3>
              
              <div className="space-y-3">
                {/* رقم الهاتف */}
                <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-900/50">
                  <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                    <Phone className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-slate-400 text-xs">الهاتف</p>
                    <p className="text-white font-medium" dir="ltr">تواصل مع إدارة المركز</p>
                  </div>
                </div>
                
                {/* البريد الإلكتروني */}
                <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-900/50">
                  <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                    <Mail className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <p className="text-slate-400 text-xs">البريد الإلكتروني</p>
                    <p className="text-white font-medium text-sm" dir="ltr">تواصل مع المدير</p>
                  </div>
                </div>
              </div>
            </div>
            
            {/* خطوات إعادة التعيين */}
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
              <h3 className="text-emerald-400 font-bold mb-3">خطوات إعادة تعيين كلمة المرور:</h3>
              <ol className="space-y-2 text-slate-300 text-sm">
                <li className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 text-xs flex items-center justify-center flex-shrink-0 mt-0.5">1</span>
                  <span>تواصل مع إدارة المركز عبر الهاتف أو البريد</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 text-xs flex items-center justify-center flex-shrink-0 mt-0.5">2</span>
                  <span>قدم بريدك الإلكتروني المسجل واسمك الكامل</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 text-xs flex items-center justify-center flex-shrink-0 mt-0.5">3</span>
                  <span>سيقوم المدير بإعادة تعيين كلمة المرور</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 text-xs flex items-center justify-center flex-shrink-0 mt-0.5">4</span>
                  <span>ستحصل على كلمة مرور مؤقتة لتسجيل الدخول</span>
                </li>
              </ol>
            </div>
          </div>
          
          {/* زر العودة */}
          <Link to={lastLoginPath()}>
            <Button className="w-full h-12 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl">
              <ArrowRight className="w-5 h-5 ml-2" />
              العودة لتسجيل الدخول
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
};

export default ForgotPassword;
