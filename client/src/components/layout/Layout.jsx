import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  LayoutDashboard, ListTodo, Users, Upload, Settings, LogOut, ChevronLeft, ChevronRight
} from 'lucide-react';
import { useState } from 'react';

const navItems = [
  { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/tasks', icon: ListTodo, label: 'Tasks' },
  { path: '/team', icon: Users, label: 'Team' },
  { path: '/uploads', icon: Upload, label: 'Uploads' },
  { path: '/settings', icon: Settings, label: 'Settings' },
];

export default function Layout() {
  const { user, signOut } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();

  const roleColors = {
    owner: '#6366f1',
    admin: '#8b5cf6',
    head_manager: '#3b82f6',
    manager: '#22c55e',
  };

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--bg-primary)' }}>
      {/* Sidebar */}
      <aside
        className="flex flex-col border-r transition-all duration-300 ease-in-out"
        style={{
          width: collapsed ? '68px' : '240px',
          background: 'var(--bg-secondary)',
          borderColor: 'var(--border)',
        }}
      >
        {/* Logo area */}
        <div className="h-16 flex items-center px-4 border-b" style={{ borderColor: 'var(--border)' }}>
          {!collapsed && (
            <span className="font-semibold text-sm tracking-wide animate-fade-in" style={{ color: 'var(--text-primary)' }}>
              Chat Manager
            </span>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="ml-auto p-1.5 rounded-md transition-colors hover:bg-white/5"
            style={{ color: 'var(--text-secondary)' }}
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-3 px-2 flex flex-col gap-1">
          {navItems.map(({ path, icon: Icon, label }) => {
            const isActive = path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);
            return (
              <NavLink
                key={path}
                to={path}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group"
                style={{
                  background: isActive ? 'var(--accent)' : 'transparent',
                  color: isActive ? '#fff' : 'var(--text-secondary)',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.background = 'var(--bg-hover)';
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.background = 'transparent';
                }}
              >
                <Icon size={18} />
                {!collapsed && <span className="text-sm font-medium">{label}</span>}
              </NavLink>
            );
          })}
        </nav>

        {/* User info */}
        <div className="p-3 border-t" style={{ borderColor: 'var(--border)' }}>
          {!collapsed && (
            <div className="mb-2 px-2">
              <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                {user?.name}
              </p>
              <p className="text-xs flex items-center gap-1.5 mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                <span
                  className="w-2 h-2 rounded-full inline-block"
                  style={{ background: roleColors[user?.role] || '#888' }}
                />
                {user?.role?.replace('_', ' ')}
              </p>
            </div>
          )}
          <button
            onClick={signOut}
            className="flex items-center gap-3 px-3 py-2 rounded-lg transition-colors w-full text-left"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--danger)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}
          >
            <LogOut size={18} />
            {!collapsed && <span className="text-sm">Sign out</span>}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <div className="p-6 max-w-7xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
