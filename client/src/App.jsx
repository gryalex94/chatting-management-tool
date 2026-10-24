import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import Layout from './components/layout/Layout';
import LoginPage from './pages/auth/LoginPage';
import SetupPage from './pages/auth/SetupPage';
import AcceptInvitePage from './pages/auth/AcceptInvitePage';
import DashboardPage from './pages/dashboard/DashboardPage';
import DailyCheckPage from './pages/dailycheck/DailyCheckPage';
import PulsePage from './pages/pulse/PulsePage';
import CreatorsPage from './pages/creators/CreatorsPage';
import ReportsPage from './pages/reports/ReportsPage';
import TasksPage from './pages/tasks/TasksPage';
import RulesPage from './pages/rules/RulesPage';
import ShiftsPage from './pages/shifts/ShiftsPage';
import PayrollPage from './pages/payroll/PayrollPage';
import AiChatPage from './pages/aichat/AiChatPage';
import PlaybookPage from './pages/playbook/PlaybookPage';
import SettingsPage from './pages/settings/SettingsPage';
import FanvueCallback from './pages/fanvue/FanvueCallback';
import ChatterProfile from './pages/chatters/ChatterProfile';
import MyStatsPage from './pages/me/MyStatsPage';

function ProtectedRoute({ children }) {
  const { user, loading, unreachable, retryProfile } = useAuth();
  const { pathname } = useLocation();
  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-0)' }}>
      <div style={{ width: 32, height: 32, border: '2px solid var(--indigo)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin .6s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
  // Still logged in, but the server didn't answer (a restart, a network blip): say so
  // and offer a retry, rather than sending them to log in again.
  if (!user && unreachable) return (
    <div className='flex min-h-screen flex-col items-center justify-center gap-3 bg-background p-6 text-center'>
      <p className='font-medium'>Can&apos;t reach the server right now</p>
      <p className='max-w-sm text-sm text-muted-foreground'>You&apos;re still logged in. This usually passes within a minute, for example while an update is going live.</p>
      <button type='button' onClick={retryProfile} className='rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted'>Try again</button>
    </div>
  );
  if (!user) return <Navigate to="/login" replace />;
  // Chatters work from their own numbers (My stats) and the Playbook; the management pages aren't for them
  if (user.role === 'chatter' && !pathname.startsWith('/playbook') && !pathname.startsWith('/me')) return <Navigate to="/me" replace />;
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
      <Route path="/invite/:token" element={<AcceptInvitePage />} />
      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<DashboardPage />} />
        <Route path="daily" element={<DailyCheckPage />} />
        <Route path="pulse" element={<PulsePage />} />
        <Route path="tasks" element={<TasksPage />} />
        <Route path="rules" element={<RulesPage />} />
        <Route path="shifts" element={<ShiftsPage />} />
        <Route path="payroll" element={<PayrollPage />} />
        <Route path="ai-chat" element={<AiChatPage />} />
        <Route path="playbook" element={<PlaybookPage />} />
        <Route path="me" element={<MyStatsPage />} />
        <Route path="creators" element={<CreatorsPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="fanvue/callback" element={<FanvueCallback />} />
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
