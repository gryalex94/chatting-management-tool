import { useAuth } from '../../context/AuthContext';
import Chip from '../shared/Chip';
import { Search, Bell, Sun, Moon } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

export default function Topbar({ subtitle = 'Dashboard', right }) {
  const { user } = useAuth();
  const { theme, toggle } = useTheme();
  const orgName = user?.organisation?.name || 'Organisation';

  return (
    <div style={{
      height: 52, background: 'var(--bg-1)', borderBottom: '1px solid var(--border)',
      display: 'flex', alignItems: 'center', gap: 12, padding: '0 20px', flexShrink: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontWeight: 600, fontSize: 13 }}>{orgName}</span>
        <span style={{ color: 'var(--fg-3)' }}>/</span>
        <span style={{ fontSize: 13, color: 'var(--fg-2)' }}>{subtitle}</span>
      </div>
      <div style={{ flex: 1 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--fg-2)', fontSize: 12 }}>
        <Chip tone="indigo">
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--indigo-bright)', display: 'inline-block' }} />
          Active cycle
        </Chip>
        {right}
        <button onClick={toggle} className="btn ghost" style={{ width: 28, height: 28, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          title={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}>
          {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
        </button>
        <button className="btn ghost" style={{ width: 28, height: 28, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Search size={16} />
        </button>
        <button className="btn ghost" style={{ width: 28, height: 28, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
          <Bell size={16} />
          <span style={{ position: 'absolute', top: 4, right: 4, width: 7, height: 7, background: 'var(--bad)', borderRadius: '50%', border: '1.5px solid var(--bg-1)' }} />
        </button>
      </div>
    </div>
  );
}
