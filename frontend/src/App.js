import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { Toaster } from './components/ui/sonner';
import Sidebar from './components/Sidebar';
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
import Attendance from './pages/Attendance';
import Activities from './pages/Activities';
import Notifications from './pages/Notifications';
import Rankings from './pages/Rankings';
import UsersPage from './pages/UsersPage';
import MyPoints from './pages/MyPoints';
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
import FeesManagement from './pages/FeesManagement';
import HomeworkManagement from './pages/HomeworkManagement';
import ExamsManagement from './pages/ExamsManagement';
import OnlineExams from './pages/OnlineExams';
import SheikhManagement from './pages/SheikhManagement';
import StudentTracking from './pages/StudentTracking';
import MyProgress from './pages/MyProgress';
import StudentHomework from './pages/StudentHomework';
import './App.css';

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
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
      return <Navigate to="/login" replace />;
  }
};

const Layout = ({ children }) => {
  return (
    <div className="min-h-screen bg-background pattern-overlay">
      <Sidebar />
      {/* Add top padding for mobile header and right margin for desktop sidebar */}
      <main className="pt-16 md:pt-0 md:mr-64 min-h-screen p-4 md:p-8">
        {children}
      </main>
    </div>
  );
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
      {/* Public Routes */}
      <Route 
        path="/login" 
        element={user ? <Navigate to="/dashboard" replace /> : <Login />} 
      />
      <Route 
        path="/register" 
        element={user ? <Navigate to="/dashboard" replace /> : <Register />} 
      />
      <Route 
        path="/activate" 
        element={user ? <Navigate to="/dashboard" replace /> : <Activate />} 
      />
      <Route 
        path="/forgot-password" 
        element={user ? <Navigate to="/dashboard" replace /> : <ForgotPassword />} 
      />

      {/* Protected Routes */}
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
        path="/groups"
        element={
          <ProtectedRoute>
            <Layout>
              <Groups />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/tracking"
        element={
          <ProtectedRoute>
            <Layout>
              <TrackingSheets />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/recitations"
        element={
          <ProtectedRoute>
            <Layout>
              <Recitations />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/attendance"
        element={
          <ProtectedRoute>
            <Layout>
              <Attendance />
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
        path="/rankings"
        element={
          <ProtectedRoute>
            <Layout>
              <Rankings />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/my-progress"
        element={
          <ProtectedRoute>
            <Layout>
              <MyProgress />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/users"
        element={
          <ProtectedRoute>
            <Layout>
              <UsersPage />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/my-points"
        element={
          <ProtectedRoute>
            <Layout>
              <MyPoints />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/registration-codes"
        element={
          <ProtectedRoute>
            <Layout>
              <RegistrationCodes />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/pending-students"
        element={
          <ProtectedRoute>
            <Layout>
              <PendingStudents />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/student/:studentId"
        element={
          <ProtectedRoute>
            <Layout>
              <StudentProfile />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/student-management"
        element={
          <ProtectedRoute>
            <Layout>
              <StudentManagement />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/sheikh-management"
        element={
          <ProtectedRoute>
            <Layout>
              <SheikhManagement />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/group-management"
        element={
          <ProtectedRoute>
            <Layout>
              <GroupManagement />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/initial-assessment"
        element={
          <ProtectedRoute>
            <Layout>
              <InitialAssessment />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/edit-profile"
        element={
          <ProtectedRoute>
            <Layout>
              <StudentEditProfile />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/sheikh-edit-profile"
        element={
          <ProtectedRoute>
            <Layout>
              <SheikhEditProfile />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/curriculum"
        element={
          <ProtectedRoute>
            <Layout>
              <CurriculumManagement />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/schedule"
        element={
          <ProtectedRoute>
            <Layout>
              <ScheduleManagement />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/sheikh-rankings"
        element={
          <ProtectedRoute>
            <Layout>
              <SheikhRankings />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin-rankings"
        element={
          <ProtectedRoute>
            <Layout>
              <AdminRankings />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/fees"
        element={
          <ProtectedRoute>
            <Layout>
              <FeesManagement />
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
        path="/student-tracking"
        element={
          <ProtectedRoute>
            <Layout>
              <StudentTracking />
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
