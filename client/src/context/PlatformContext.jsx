import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api from '@/services/api';
import { PLATFORMS, pagePlatform } from '@/utils/platforms';
import { useAuth } from './AuthContext';

const KEY = 'platform';
const stored = () => {
  try { const v = localStorage.getItem(KEY); return PLATFORMS.some(p => p.id === v) ? v : 'onlyfans'; } catch { return 'onlyfans'; }
};

const PlatformContext = createContext(null);

/**
 * The platform the tool shows — OnlyFans, Fanvue or Fansly — picked with the
 * switch at the top of the menu and remembered in this browser. Dashboard, Daily
 * check, Tasks, Shifts, Reports and the page lists follow it; the Playbook, AI
 * rules and Payroll (one report per person) cover every platform.
 */
export function PlatformProvider({ children }) {
  const { user } = useAuth();
  const staff = !!user && user.role !== 'chatter';
  const [platform, setPlatformState] = useState(stored);
  const [pages, setPages] = useState([]);                  // every active page, with its platform
  const [pagesLoaded, setPagesLoaded] = useState(false);

  const reloadPages = useCallback(() => api.get('/api/creators')
    .then(r => setPages(Array.isArray(r.data) ? r.data : []))
    .catch(() => { /* the switch still works without the counts */ })
    .finally(() => setPagesLoaded(true)), []);
  useEffect(() => { if (staff) reloadPages(); }, [staff, reloadPages]);

  const setPlatform = useCallback((p) => {
    setPlatformState(p);
    try { localStorage.setItem(KEY, p); } catch { /* storage blocked */ }
  }, []);

  const value = useMemo(() => {
    const counts = Object.fromEntries(PLATFORMS.map(p => [p.id, 0]));
    for (const pg of pages) if (!pg.merged_into) counts[pagePlatform(pg)] += 1;   // a team counts once
    const platformPages = pages.filter(pg => pagePlatform(pg) === platform);
    return { platform, setPlatform, pages, pagesLoaded, platformPages, counts, reloadPages };
  }, [platform, setPlatform, pages, pagesLoaded, reloadPages]);

  return <PlatformContext.Provider value={value}>{children}</PlatformContext.Provider>;
}

export function usePlatform() {
  const ctx = useContext(PlatformContext);
  if (!ctx) throw new Error('usePlatform must be used within PlatformProvider');
  return ctx;
}
