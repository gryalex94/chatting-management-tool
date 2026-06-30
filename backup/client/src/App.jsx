import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import Layout from './components/layout/Layout';
import LoginPage from './pages/auth/LoginPage';
import SetupPage from './pages/auth/SetupPage';
import DashboardPage from './pages/dashboard/DashboardPage';
import PulsePage from './pages/pulse/PulsePage';
import CreatorsPage from './pages/creators/CreatorsPage';
import ReportsPage from './pages/reports/ReportsPage';
import TasksPage from './pages/tasks/TasksPage';
import SettingsPage from './pages/settings/SettingsPage';
import ChatterProfile from './pages/chatters/ChatterProfile';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-0)' }}>
      <div style={{ width: 32, height: 32, border: '2px solid var(--indigo)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin .6s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function AppRoutes() {
  const { user, loading } = useAuth();
  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-0)' }}>
      <div style={{ width: 32, height: 32, border: '2px solid var(--indigo)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin .6s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/setup" element={<SetupPage />} />
      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<DashboardPage />} />
        <Route path="pulse" element={<PulsePage />} />
        <Route path="tasks" element={<TasksPage />} />
        <Route path="creators" element={<CreatorsPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="chatters/:id" element={<ChatterProfile />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <AppRoutes />
          <Toaster position="top-right" toastOptions={{
            duration: 4000,
            style: { background: 'var(--bg-2)', color: 'var(--fg-0)', border: '1px solid var(--border)', fontSize: 13, fontFamily: 'var(--ff-sans)' },
          }} />
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
