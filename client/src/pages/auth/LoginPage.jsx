import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try { await signIn(email, password); toast.success('Welcome back!'); }
    catch (err) { toast.error(err.message || 'Login failed'); }
    finally { setLoading(false); }
  }

  const inp = { width: '100%', padding: '10px 12px', borderRadius: 'var(--r-btn)', fontSize: 13, outline: 'none', background: 'var(--bg-2)', border: '1px solid var(--border)', color: 'var(--fg-0)' };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-0)' }}>
      <div style={{ width: 360, background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 'var(--r-panel)', padding: 32 }} className="animate-in">
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg, var(--indigo), #a855f7)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="white" stroke="none"><path d="M5 6c0 5 7 9 7 13 0-4 7-8 7-13a4 4 0 0 0-7-2.5A4 4 0 0 0 5 6z"/></svg>
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 700 }}>Chat Manager</h1>
          <p style={{ fontSize: 13, color: 'var(--fg-2)', marginTop: 4 }}>Sign in to your account</p>
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label className="label" style={{ display: 'block', marginBottom: 6 }}>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required style={inp} placeholder="you@example.com" />
          </div>
          <div>
            <label className="label" style={{ display: 'block', marginBottom: 6 }}>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required style={inp} placeholder="••••••••" />
          </div>
          <button type="submit" disabled={loading} className="btn primary" style={{ width: '100%', height: 38, justifyContent: 'center', marginTop: 8 }}>
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
        <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--fg-3)', marginTop: 24 }}>
          First time? <Link to="/setup" style={{ color: 'var(--indigo-bright)', textDecoration: 'none' }}>Set up your organisation</Link>
        </p>
      </div>
    </div>
  );
}
