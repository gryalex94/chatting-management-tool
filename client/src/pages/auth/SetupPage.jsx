import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import toast from 'react-hot-toast';

export default function SetupPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', orgName: '' });
  const [loading, setLoading] = useState(false);
  const u = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const inp = { width: '100%', padding: '10px 12px', borderRadius: 'var(--r-btn)', fontSize: 13, outline: 'none', background: 'var(--bg-2)', border: '1px solid var(--border)', color: 'var(--fg-0)' };

  async function handleSubmit(e) {
    e.preventDefault(); setLoading(true);
    try { await api.post('/api/auth/setup', form); toast.success('Organisation created!'); navigate('/login'); }
    catch (err) { toast.error(err.response?.data?.error || 'Setup failed'); }
    finally { setLoading(false); }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-0)' }}>
      <div style={{ width: 360, background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 'var(--r-panel)', padding: 32 }} className="animate-in">
        <h1 style={{ fontSize: 20, fontWeight: 700, textAlign: 'center' }}>Set Up Organisation</h1>
        <p style={{ fontSize: 13, color: 'var(--fg-2)', textAlign: 'center', marginTop: 4, marginBottom: 24 }}>Create your first admin account</p>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div><label className="label" style={{ display: 'block', marginBottom: 6 }}>Organisation Name</label><input value={form.orgName} onChange={e => u('orgName', e.target.value)} required style={inp} placeholder="e.g. RICE-MEDIA" /></div>
          <div><label className="label" style={{ display: 'block', marginBottom: 6 }}>Your Name</label><input value={form.name} onChange={e => u('name', e.target.value)} required style={inp} /></div>
          <div><label className="label" style={{ display: 'block', marginBottom: 6 }}>Email</label><input type="email" value={form.email} onChange={e => u('email', e.target.value)} required style={inp} /></div>
          <div><label className="label" style={{ display: 'block', marginBottom: 6 }}>Password</label><input type="password" value={form.password} onChange={e => u('password', e.target.value)} required minLength={6} style={inp} /></div>
          <button type="submit" disabled={loading} className="btn primary" style={{ width: '100%', height: 38, justifyContent: 'center', marginTop: 4 }}>{loading ? 'Creating...' : 'Create Organisation'}</button>
        </form>
      </div>
    </div>
  );
}
