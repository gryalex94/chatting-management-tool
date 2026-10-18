import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { supabase } from '../services/supabase';
import api, { setApiToken } from '../services/api';
import { setInflowwOffset } from '../utils/displaySettings';

const AuthContext = createContext(null);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
// Waits between tries when the server can't be reached (a deploy restarting it, a
// network blip): about half a minute in all before saying so.
const RETRY_MS = [1000, 2000, 4000, 8000, 15000];

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [unreachable, setUnreachable] = useState(false);   // logged in, but the server didn't answer
  const signingOut = useRef(false);
  const profileFor = useRef(null);                          // the login whose profile is loaded or loading

  useEffect(() => {
    // Safety timeout — never stay loading forever if Supabase itself doesn't answer
    const timeout = setTimeout(() => setLoading(false), 6000);

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      clearTimeout(timeout);
      if (s?.access_token) {
        setSession(s);
        setApiToken(s.access_token);
        if (profileFor.current !== s.user.id) fetchProfile(s.user.id);
      } else {
        setLoading(false);
      }
    }).catch(() => {
      setLoading(false);
      clearTimeout(timeout);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      if (signingOut.current) return; // prevent loop during signOut

      setSession(s);
      if (s?.access_token) {
        setApiToken(s.access_token);
        // A refreshed token (hourly, or on coming back to the tab) is the same person:
        // no need to ask the server again. Asking used to be when a blip logged people out.
        if (profileFor.current !== s.user.id) fetchProfile(s.user.id);
      } else {
        profileFor.current = null;
        setApiToken(null);
        setUser(null);
        setLoading(false);
      }
    });

    return () => { subscription.unsubscribe(); clearTimeout(timeout); };
  }, []);

  // The person's profile from our server. Only a real "this login is over" (401) signs
  // out, and only a missing or deactivated profile (403/404) goes back to the login
  // page; when the server can't be reached or can't check, they stay logged in and
  // it tries again.
  async function fetchProfile(authId) {
    profileFor.current = authId;
    setLoading(true);
    setUnreachable(false);
    for (let attempt = 0; ; attempt++) {
      try {
        const { data } = await api.post('/api/auth/login', { authId });
        if (profileFor.current !== authId) return;          // someone else logged in meanwhile
        setUser(data.user);
        // load org display preferences (Infloww time offset) for timestamp formatting
        api.get('/api/organisations/config')
          .then(r => setInflowwOffset(r.data?.config?.infloww_offset_hours))
          .catch(() => { /* config optional */ });
        break;
      } catch (err) {
        const status = err?.response?.status;
        console.error('Auth profile fetch failed:', status || err?.message);
        if (profileFor.current !== authId) return;
        if (status === 401) { await cleanSignOut(); break; }
        if (status === 403 || status === 404) { profileFor.current = null; setUser(null); break; }
        if (attempt >= RETRY_MS.length) { profileFor.current = null; setUnreachable(true); break; }
        await sleep(RETRY_MS[attempt]);
        if (profileFor.current !== authId) return;
      }
    }
    setLoading(false);
  }

  // After "the server can't be reached": try again (the button on that screen).
  function retryProfile() {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (s?.access_token) { setApiToken(s.access_token); fetchProfile(s.user.id); }
      else { setUnreachable(false); setLoading(false); }
    });
  }

  async function cleanSignOut() {
    signingOut.current = true;
    profileFor.current = null;
    setApiToken(null);
    setUser(null);
    setSession(null);
    setUnreachable(false);
    try { await supabase.auth.signOut(); } catch { /* already signed out */ }
    signingOut.current = false;
  }

  async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }

  async function signOut() {
    await cleanSignOut();
    // Saved filters and per-task checklists can hold fan usernames — don't leave
    // them behind on a shared computer. Theme and time offset are harmless.
    try {
      Object.keys(localStorage)
        .filter(k => k === 'tasksFilters' || k.startsWith('tasksFilters:') || k.startsWith('replyDone:') || k.startsWith('afkDone:') || k.startsWith('hitsDone:'))
        .forEach(k => localStorage.removeItem(k));
    } catch { /* storage blocked */ }
  }

  return (
    <AuthContext.Provider value={{
      session, user, loading, unreachable, retryProfile, signIn, signOut,
      isOwner: user?.role === 'owner',
      isAdmin: ['owner','admin'].includes(user?.role),
      isManager: ['owner','admin','head_manager','manager'].includes(user?.role),
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
