import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import Avatar from '../shared/Avatar';
import {
  Home, ClipboardList, Users, Clock, Upload, BarChart3, Sparkles, Settings
} from 'lucide-react';

const NAV = [
  { to: '/',         icon: Home,          label: 'Dashboard' },
  { to: '/tasks',    icon: ClipboardList, label: 'Tasks',    badge: true },
  { to: '/creators', icon: Clock,         label: 'Shifts Overview' },
  { to: '/reports',  icon: Upload,        label: 'Reports' },
  { to: '/metrics',  icon: BarChart3,     label: 'Metrics' },
];

const LOWER = [
  { to: '/ai',       icon: Sparkles,  label: 'AI' },
  { to: '/settings', icon: Settings,  label: 'Settings' },
];

export default function Sidebar() {
  const { user } = useAuth();
  const location = useLocation();

  function isActive(path) {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  }

  return (
    <aside style={{
      width: 56, background: 'var(--bg-1)', borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '14px 0', gap: 4, flexShrink: 0, height: '100vh',
    }}>
      {/* Brand */}
      <div style={{
        width: 36, height: 36, borderRadius: 10,
        background: 'linear-gradient(135deg, var(--indigo), #a855f7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 700, color: 'white', fontSize: 13, marginBottom: 8,
      }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none">
          <path d="M5 6c0 5 7 9 7 13 0-4 7-8 7-13a4 4 0 0 0-7-2.5A4 4 0 0 0 5 6z"/>
        </svg>
      </div>

      {/* Main nav */}
      {NAV.map(({ to, icon: Icon }) => (
        <NavLink key={to} to={to} style={{
          width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: 10, color: isActive(to) ? 'var(--indigo-bright)' : 'var(--fg-3)',
          background: isActive(to) ? 'var(--indigo-soft)' : 'transparent',
          transition: 'background .12s, color .12s', position: 'relative', textDecoration: 'none',
        }}>
          <Icon size={18} />
          {isActive(to) && <span style={{
            position: 'absolute', left: -10, top: 8, bottom: 8, width: 2,
            background: 'var(--indigo)', borderRadius: '0 2px 2px 0',
          }} />}
        </NavLink>
      ))}

      {/* Separator */}
      <div style={{ width: 24, height: 1, background: 'var(--border)', margin: '8px 0' }} />

      {/* Lower nav */}
      {LOWER.map(({ to, icon: Icon }) => (
        <NavLink key={to} to={to} style={{
          width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: 10, color: isActive(to) ? 'var(--indigo-bright)' : 'var(--fg-3)',
          background: isActive(to) ? 'var(--indigo-soft)' : 'transparent',
          transition: 'background .12s, color .12s', textDecoration: 'none',
        }}>
          <Icon size={18} />
        </NavLink>
      ))}

      <div style={{ flex: 1 }} />
      <Avatar name={user?.name || 'User'} size={32} />
    </aside>
  );
}
