import { useAuth } from '../../context/AuthContext';
import Chip from '../shared/Chip';
import { Search, Bell, Sun, Moon, Eye, EyeOff } from 'lucide-react';
import { isDemoMode, setDemoMode } from '../../utils/privacy';
import { useTheme } from '../../context/ThemeContext';

export default function Topbar({ subtitle = 'Dashboard', right }) {
  const { user } = useAuth();
  const { theme, toggle } = useTheme();
  const orgName = user?.organisation?.name || 'Organisation';
  const demo = isDemoMode();
  // Masking is applied as data arrives, so reload to re-fetch everything in the new mode.
  const toggleDemo = () => { setDemoMode(!demo); window.location.reload(); };

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
        {demo && (
          <span title="Fan names, messages and emails are hidden. Safe to screen-share."
            style={{ fontSize: 11, fontWeight: 700, color: '#b45309', background: 'rgba(245,158,11,0.14)', border: '1px solid rgba(245,158,11,0.45)', borderRadius: 999, padding: '3px 10px' }}>
            Demo mode · fan data hidden
          </span>
        )}
        <button onClick={toggleDemo} className="btn ghost"
          style={{ height: 28, padding: '0 8px', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: demo ? '#b45309' : 'var(--fg-2)' }}
          title={demo ? 'Turn off demo mode (show real fan data)' : 'Turn on demo mode before screen-sharing'}>
          {demo ? <EyeOff size={15} /> : <Eye size={15} />}
          {demo ? 'Exit demo' : 'Demo mode'}
        </button>
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
