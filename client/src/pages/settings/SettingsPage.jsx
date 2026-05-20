import { useState, useEffect } from 'react';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Plus, Copy } from 'lucide-react';
import toast from 'react-hot-toast';

export default function SettingsPage() {
  const { user, isAdmin } = useAuth();
  const [members, setMembers] = useState([]);
  const [creators, setCreators] = useState([]);
  const [inviteForm, setInviteForm] = useState({ email: '', role: 'chatter' });
  const [creatorName, setCreatorName] = useState('');
  const [inviteToken, setInviteToken] = useState(null);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    try {
      const [membersRes, creatorsRes] = await Promise.all([
        api.get('/api/organisations/members'),
        api.get('/api/creators'),
      ]);
      setMembers(membersRes.data);
      setCreators(creatorsRes.data);
    } catch (err) {
      console.error('Settings load error:', err);
    }
  }

  async function sendInvite(e) {
    e.preventDefault();
    try {
      const { data } = await api.post('/api/auth/invite', inviteForm);
      setInviteToken(data.invitation.token);
      toast.success('Invitation created!');
      setInviteForm({ email: '', role: 'chatter' });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to send invite');
    }
  }

  async function addCreator(e) {
    e.preventDefault();
    if (!creatorName.trim()) return;
    try {
      await api.post('/api/creators', { name: creatorName });
      toast.success('Creator added!');
      setCreatorName('');
      loadData();
    } catch (err) {
      toast.error('Failed to add creator');
    }
  }

  function copyToken() {
    navigator.clipboard.writeText(inviteToken);
    toast.success('Token copied!');
  }

  const inputStyle = {
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    color: 'var(--text-primary)',
  };

  const roleColors = {
    owner: '#6366f1', admin: '#8b5cf6', head_manager: '#3b82f6', manager: '#22c55e', chatter: '#f59e0b', va: '#888',
  };

  return (
    <div className="animate-fade-in max-w-2xl">
      <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Settings</h1>
      <p className="text-sm mb-8" style={{ color: 'var(--text-secondary)' }}>
        Manage your organisation, team, and creators
      </p>

      {/* Organisation info */}
      <Section title="Organisation">
        <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{user?.organisation?.name}</p>
        <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
          {members.length} members · {creators.length} creators
        </p>
      </Section>

      {/* Creators */}
      <Section title="Creators">
        <div className="flex flex-wrap gap-2 mb-3">
          {creators.map(c => (
            <span
              key={c.id}
              className="px-3 py-1.5 rounded-lg text-xs font-medium"
              style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
            >
              {c.name}
            </span>
          ))}
        </div>
        {isAdmin && (
          <form onSubmit={addCreator} className="flex gap-2">
            <input
              value={creatorName}
              onChange={(e) => setCreatorName(e.target.value)}
              placeholder="Creator name"
              className="flex-1 px-3 py-2 rounded-lg text-sm outline-none"
              style={inputStyle}
            />
            <button type="submit" className="px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ background: 'var(--accent)' }}>
              <Plus size={16} />
            </button>
          </form>
        )}
      </Section>

      {/* Team members */}
      <Section title="Team Members">
        <div className="flex flex-col gap-2 mb-4">
          {members.map(m => (
            <div
              key={m.id}
              className="flex items-center justify-between px-3 py-2 rounded-lg"
              style={{ background: 'var(--bg-secondary)' }}
            >
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full" style={{ background: roleColors[m.role] }} />
                <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{m.name}</span>
              </div>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{m.role.replace('_', ' ')}</span>
            </div>
          ))}
        </div>

        {/* Invite form */}
        {isAdmin && (
          <>
            <h3 className="text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Invite New Member</h3>
            <form onSubmit={sendInvite} className="flex gap-2">
              <input
                value={inviteForm.email}
                onChange={(e) => setInviteForm(p => ({ ...p, email: e.target.value }))}
                placeholder="email@example.com"
                type="email"
                required
                className="flex-1 px-3 py-2 rounded-lg text-sm outline-none"
                style={inputStyle}
              />
              <select
                value={inviteForm.role}
                onChange={(e) => setInviteForm(p => ({ ...p, role: e.target.value }))}
                className="px-3 py-2 rounded-lg text-sm outline-none"
                style={inputStyle}
              >
                <option value="chatter">Chatter</option>
                <option value="va">VA</option>
                <option value="manager">Manager</option>
                <option value="head_manager">Head Manager</option>
                <option value="admin">Admin</option>
              </select>
              <button type="submit" className="px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ background: 'var(--accent)' }}>
                Invite
              </button>
            </form>

            {inviteToken && (
              <div className="mt-3 p-3 rounded-lg flex items-center gap-2" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
                <p className="text-xs flex-1 font-mono truncate" style={{ color: 'var(--text-secondary)' }}>{inviteToken}</p>
                <button onClick={copyToken} className="p-1" style={{ color: 'var(--accent)' }}>
                  <Copy size={14} />
                </button>
              </div>
            )}
          </>
        )}
      </Section>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="mb-8 rounded-xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
      <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>{title}</h2>
      {children}
    </div>
  );
}
