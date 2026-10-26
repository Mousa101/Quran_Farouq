import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { Toaster } from './components/ui/sonner';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import ChatWidget from './components/ChatWidget';
import Login from './pages/Login';
import Register from './pages/Register';
import Activate from './pages/Activate';
import ForgotPassword from './pages/ForgotPassword';
import AdminDashboard from './pages/AdminDashboard';
import SheikhDashboard from './pages/SheikhDashboard';
import StudentDashboard from './pages/StudentDashboard';
import Groups from './pages/Groups';
import TrackingSheets from './pages/TrackingSheets';
import Recitations from './pages/Recitations';
import RecitationsNew from './pages/RecitationsNew';
import Attendance from './pages/Attendance';
import Activities from './pages/Activities';
import Notifications from './pages/Notifications';
import Rankings from './pages/Rankings';
import UsersPage from './pages/UsersPage';
import MyPoints from './pages/MyPoints';
import MyWarnings from './pages/MyWarnings';
import PointsManager from './pages/PointsManager';
import RegistrationCodes from './pages/RegistrationCodes';
import StudentProfile from './pages/StudentProfile';
import StudentManagement from './pages/StudentManagement';
import GroupManagement from './pages/GroupManagement';
import InitialAssessment from './pages/InitialAssessment';
import StudentEditProfile from './pages/StudentEditProfile';
import SheikhEditProfile from './pages/SheikhEditProfile';
import PendingStudents from './pages/PendingStudents';
import CurriculumManagement from './pages/CurriculumManagement';
import ScheduleManagement from './pages/ScheduleManagement';
import SheikhRankings from './pages/SheikhRankings';
import AdminRankings from './pages/AdminRankings';
import AdminAnalytics from './pages/AdminAnalytics';
import StrugglingStudents from './pages/StrugglingStudents';
import CompetitionsAnalysis from './pages/CompetitionsAnalysis';
import AnnualCompetition from './pages/AnnualCompetition';
import TechnicalSupervision from './pages/TechnicalSupervision';
import SupervisionFile from './pages/SupervisionFile';
import AuditLog from './pages/AuditLog';
import ChatMonitor from './pages/ChatMonitor';
import StatisticsHub from './pages/StatisticsHub';
import StudentStats from './pages/StudentStats';
import Announcements from './pages/Announcements';
import BulkOperations from './pages/BulkOperations';
import SheikhAnalytics from './pages/SheikhAnalytics';
import SheikhMessage from './pages/SheikhMessage';
import FeesManagement from './pages/FeesManagement';
import HomeworkManagement from './pages/HomeworkManagement';
import ExamsManagement from './pages/ExamsManagement';
import OnlineExams from './pages/OnlineExams';
import SheikhManagement from './pages/SheikhManagement';
import StudentTracking from './pages/StudentTracking';
import MyProgress from './pages/MyProgress';
import StudentHomework from './pages/StudentHomework';
import StudentRecord from './pages/StudentRecord';
import TrackingSettings from './pages/TrackingSettings';
import DisplaySettings from './pages/DisplaySettings';
import { hiddenPathsFor } from './lib/navItems';
import { ROLE_SLUGS, loginPathFor, registerPathFor, lastLoginPath } from './lib/authRoutes';
import './App.css';

// F1: حماية الصفحات حسب الصلاحية.
// - إن لم يسجّل الدخول: يُوجَّه إلى صفحة دخول آخر دور استخدمه (افتراضيًا /student/login).
// - إن كان الدور غير مسموح للصفحة (allow): يُعاد توجيهه إلى /dashboard بدل ظهور خطأ.
// - الصفحات المشتركة لا تُمرّر allow فتبقى متاحة لكل الأدوار المسجّلة.
// - الصفحة التي أخفاها المدير لهذا الدور (إعدادات العرض) يُعاد توجيهها إلى /dashboard.
const ProtectedRoute = ({ children, allow }) => {
  const { user, loading, uiSettings } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to={lastLoginPath()} replace />;
  }

  if (allow && !allow.includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  if (hiddenPathsFor(user.role, uiSettings).includes(location.pathname)) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
};

const DashboardRouter = () => {
  const { user } = useAuth();

  switch (user?.role) {
    case 'admin':
      return <AdminDashboard />;
    case 'sheikh':
      return <SheikhDashboard />;
    case 'student':
      return <StudentDashboard />;
    default:
      return <Navigate to={lastLoginPath()} replace />;
  }
};

const Layout = ({ children }) => {
  return (
    <div className="min-h-screen bg-background pattern-overlay">
      <Sidebar />
      {/* Add top padding for mobile header and right margin for desktop sidebar */}
      <main className="pt-16 md:pt-0 md:mr-64 min-h-screen p-4 md:p-8">
        <TopBar />
        {children}
      </main>
      <ChatWidget />
    </div>
  );
};

// مكون التوجيه للواجبات - يعرض صفحة مختلفة للطالب
const HomeworkRoute = () => {
  const { user } = useAuth();

  if (user?.role === 'student') {
    return <StudentHomework />;
  }
  return <HomeworkManagement />;
};

function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <Routes>
      {/* Public Routes — لكل نوع حساب رابط دخول وتسجيل مستقل (مثل منصة الاختبارات) */}
      {['student', 'sheikh', 'admin'].map((role) => [
        <Route
          key={`${role}-login`}
          path={loginPathFor(role)}
          element={user ? <Navigate to="/dashboard" replace /> : <Login role={role} />}
        />,
        <Route
          key={`${role}-register`}
          path={registerPathFor(role)}
          element={user ? <Navigate to="/dashboard" replace /> : <Register role={role} />}
        />,
      ])}
      {/* الروابط القديمة تُحوَّل للجديدة حتى لا تتعطل الروابط المحفوظة */}
      <Route path="/login" element={<Navigate to={lastLoginPath()} replace />} />
      <Route path="/register" element={<Navigate to={registerPathFor('student')} replace />} />
      {['student', 'sheikh', 'admin'].map((role) => [
        <Route key={`${role}-login-old`} path={`/${ROLE_SLUGS[role]}/login`} element={<Navigate to={loginPathFor(role)} replace />} />,
        <Route key={`${role}-register-old`} path={`/${ROLE_SLUGS[role]}/register`} element={<Navigate to={registerPathFor(role)} replace />} />,
      ])}
      <Route
        path="/activate"
        element={user ? <Navigate to="/dashboard" replace /> : <Activate />}
      />
      <Route
        path="/forgot-password"
        element={user ? <Navigate to="/dashboard" replace /> : <ForgotPassword />}
      />

      {/* Protected Routes — الصفحات المشتركة (كل الأدوار) */}
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Layout>
              <DashboardRouter />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/notifications"
        element={
          <ProtectedRoute>
            <Layout>
              <Notifications />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/activities"
        element={
          <ProtectedRoute>
            <Layout>
              <Activities />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/homework"
        element={
          <ProtectedRoute>
            <Layout>
              <HomeworkRoute />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/exams"
        element={
          <ProtectedRoute>
            <Layout>
              <ExamsManagement />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/online-exams"
        element={
          <ProtectedRoute>
            <Layout>
              <OnlineExams />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/rankings"
        element={
          <ProtectedRoute>
            <Layout>
              <Rankings />
            </Layout>
          </ProtectedRoute>
        }
      />

      {/* الرسوم: المدير والطالب */}
      <Route
        path="/fees"
        element={
          <ProtectedRoute allow={['admin', 'student']}>
            <Layout>
              <FeesManagement />
            </Layout>
          </ProtectedRoute>
        }
      />

      {/* صفحات المدير والمعلم المشتركة */}
      <Route
        path="/curriculum"
        element={
          <ProtectedRoute allow={['admin', 'sheikh']}>
            <Layout>
              <CurriculumManagement />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/schedule"
        element={
          <ProtectedRoute allow={['admin', 'sheikh']}>
            <Layout>
              <ScheduleManagement />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/tracking-settings"
        element={
          <ProtectedRoute allow={['admin', 'sheikh']}>
            <Layout>
              <TrackingSettings />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/student/:studentId"
        element={
          <ProtectedRoute allow={['admin', 'sheikh']}>
            <Layout>
              <StudentProfile />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/student-record/:studentId"
        element={
          <ProtectedRoute allow={['admin', 'sheikh']}>
            <Layout>
              <StudentRecord />
            </Layout>
          </ProtectedRoute>
        }
      />

      {/* صفحات المدير فقط */}
      <Route
        path="/pending-students"
        element={
          <ProtectedRoute allow={['admin']}>
            <Layout>
              <PendingStudents />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/sheikh-management"
        element={
          <ProtectedRoute allow={['admin']}>
            <Layout>
              <SheikhManagement />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/student-management"
        element={
          <ProtectedRoute allow={['admin']}>
            <Layout>
              <StudentManagement />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/group-management"
        element={
          <ProtectedRoute allow={['admin']}>
            <Layout>
              <GroupManagement />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin-rankings"
        element={
          <ProtectedRoute allow={['admin']}>
            <Layout>
              <AdminRankings />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin-analytics"
        element={
          <ProtectedRoute allow={['admin']}>
            <Layout>
              <AdminAnalytics />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/struggling-students"
        element={
          <ProtectedRoute allow={['admin', 'sheikh']}>
            <Layout>
              <StrugglingStudents />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/competitions"
        element={
          <ProtectedRoute allow={['admin']}>
            <Layout>
              <CompetitionsAnalysis />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/technical-supervision"
        element={
          <ProtectedRoute allow={['admin']}>
            <Layout>
              <TechnicalSupervision />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/technical-supervision/young-hafiz"
        element={
          <ProtectedRoute allow={['admin']}>
            <Layout>
              <SupervisionFile kind="young_hafiz" />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/technical-supervision/tajweed"
        element={
          <ProtectedRoute allow={['admin']}>
            <Layout>
              <SupervisionFile kind="tajweed" />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/annual-competition"
        element={
          <ProtectedRoute allow={['admin']}>
            <Layout>
              <AnnualCompetition />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/audit-log"
        element={
          <ProtectedRoute allow={['admin']}>
            <Layout>
              <AuditLog />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/chat-monitor"
        element={
          <ProtectedRoute allow={['admin']}>
            <Layout>
              <ChatMonitor />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/statistics"
        element={
          <ProtectedRoute allow={['admin']}>
            <Layout>
              <StatisticsHub />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/student-stats"
        element={
          <ProtectedRoute allow={['admin', 'sheikh']}>
            <Layout>
              <StudentStats />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/announcements"
        element={
          <ProtectedRoute allow={['admin']}>
            <Layout>
              <Announcements />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/bulk-operations"
        element={
          <ProtectedRoute allow={['admin']}>
            <Layout>
              <BulkOperations />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/users"
        element={
          <ProtectedRoute allow={['admin']}>
            <Layout>
              <UsersPage />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/display-settings"
        element={
          <ProtectedRoute allow={['admin']}>
            <Layout>
              <DisplaySettings />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/registration-codes"
        element={
          <ProtectedRoute allow={['admin']}>
            <Layout>
              <RegistrationCodes />
            </Layout>
          </ProtectedRoute>
        }
      />

      {/* صفحات المعلم فقط */}
      <Route
        path="/groups"
        element={
          <ProtectedRoute allow={['sheikh']}>
            <Layout>
              <Groups />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/tracking"
        element={
          <ProtectedRoute allow={['sheikh']}>
            <Layout>
              <TrackingSheets />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/recitations"
        element={
          <ProtectedRoute allow={['sheikh', 'admin']}>
            <Layout>
              <RecitationsNew />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/recitations-old"
        element={
          <ProtectedRoute allow={['sheikh']}>
            <Layout>
              <Recitations />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/attendance"
        element={
          <ProtectedRoute allow={['sheikh', 'admin']}>
            <Layout>
              <Attendance />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/initial-assessment"
        element={
          <ProtectedRoute allow={['sheikh']}>
            <Layout>
              <InitialAssessment />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/sheikh-rankings"
        element={
          <ProtectedRoute allow={['sheikh']}>
            <Layout>
              <SheikhRankings />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/sheikh-analytics"
        element={
          <ProtectedRoute allow={['sheikh']}>
            <Layout>
              <SheikhAnalytics />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/sheikh-message"
        element={
          <ProtectedRoute allow={['sheikh']}>
            <Layout>
              <SheikhMessage />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/sheikh-edit-profile"
        element={
          <ProtectedRoute allow={['sheikh']}>
            <Layout>
              <SheikhEditProfile />
            </Layout>
          </ProtectedRoute>
        }
      />

      {/* صفحات الطالب فقط */}
      <Route
        path="/my-progress"
        element={
          <ProtectedRoute allow={['student']}>
            <Layout>
              <MyProgress />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/points-manager"
        element={
          <ProtectedRoute allow={['admin', 'sheikh']}>
            <Layout>
              <PointsManager />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/my-warnings"
        element={
          <ProtectedRoute allow={['student']}>
            <Layout>
              <MyWarnings />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/my-points"
        element={
          <ProtectedRoute allow={['student']}>
            <Layout>
              <MyPoints />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/student-tracking"
        element={
          <ProtectedRoute allow={['student']}>
            <Layout>
              <StudentTracking />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/edit-profile"
        element={
          <ProtectedRoute allow={['student']}>
            <Layout>
              <StudentEditProfile />
            </Layout>
          </ProtectedRoute>
        }
      />

      {/* Default Route */}
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <AppRoutes />
          <Toaster position="top-center" richColors />
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}

export default App;
