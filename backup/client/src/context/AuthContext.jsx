import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { supabase } from '../services/supabase';
import api, { setApiToken } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const signingOut = useRef(false);

  useEffect(() => {
    // Safety timeout — never stay loading forever
    const timeout = setTimeout(() => setLoading(false), 6000);

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (s?.access_token) {
        setSession(s);
        setApiToken(s.access_token);
        fetchProfile(s.user.id, timeout);
      } else {
        setLoading(false);
        clearTimeout(timeout);
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
        fetchProfile(s.user.id);
      } else {
        setApiToken(null);
        setUser(null);
        setLoading(false);
      }
    });

    return () => { subscription.unsubscribe(); clearTimeout(timeout); };
  }, []);

  async function fetchProfile(authId, timeout) {
    try {
      const { data } = await api.post('/api/auth/login', { authId });
      setUser(data.user);
    } catch (err) {
      console.error('Auth profile fetch failed:', err?.response?.status);
      setUser(null);
      // If 401, token is bad — sign out cleanly
      if (err?.response?.status === 401) {
        await cleanSignOut();
      }
    } finally {
      setLoading(false);
      if (timeout) clearTimeout(timeout);
    }
  }

  async function cleanSignOut() {
    signingOut.current = true;
    setApiToken(null);
    setUser(null);
    setSession(null);
    try { await supabase.auth.signOut(); } catch {}
    signingOut.current = false;
  }

  async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }

  async function signOut() {
    await cleanSignOut();
  }

  return (
    <AuthContext.Provider value={{
      session, user, loading, signIn, signOut,
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
