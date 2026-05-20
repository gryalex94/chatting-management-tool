import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { Activity, Users, ListTodo, AlertTriangle, TrendingUp, Clock } from 'lucide-react';

function StatCard({ icon: Icon, label, value, color, subtext }) {
  return (
    <div
      className="rounded-xl p-5 transition-all duration-200"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
      onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--border-light)'}
      onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border)'}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>{label}</p>
          <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{value}</p>
          {subtext && <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{subtext}</p>}
        </div>
        <div className="p-2 rounded-lg" style={{ background: `${color}15` }}>
          <Icon size={18} style={{ color }} />
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState({
    tasks: { pool: 0, inProgress: 0, completed: 0 },
    chatters: 0,
    anomalies: 0,
    creators: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadDashboard() {
    try {
      const [tasksRes, chattersRes, anomaliesRes, creatorsRes] = await Promise.allSettled([
        api.get('/api/tasks'),
        api.get('/api/chatters'),
        api.get('/api/metrics/anomalies', { params: { resolved: 'false' } }),
        api.get('/api/creators'),
      ]);

      const tasks = tasksRes.status === 'fulfilled' ? tasksRes.value.data : [];
      const chatters = chattersRes.status === 'fulfilled' ? chattersRes.value.data : [];
      const anomalies = anomaliesRes.status === 'fulfilled' ? anomaliesRes.value.data : [];
      const creators = creatorsRes.status === 'fulfilled' ? creatorsRes.value.data : [];

      setStats({
        tasks: {
          pool: tasks.filter(t => t.status === 'pool').length,
          inProgress: tasks.filter(t => ['claimed', 'in_progress'].includes(t.status)).length,
          completed: tasks.filter(t => t.status === 'completed').length,
        },
        chatters: chatters.length,
        anomalies: anomalies.length,
        creators: creators.length,
      });
    } catch (err) {
      console.error('Dashboard load error:', err);
    } finally {
      setLoading(false);
    }
  }

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          {greeting()}, {user?.name?.split(' ')[0]}
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          Here's what's happening with your team today
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          icon={ListTodo}
          label="Tasks in Pool"
          value={stats.tasks.pool}
          color="var(--accent)"
          subtext={`${stats.tasks.inProgress} in progress`}
        />
        <StatCard
          icon={Activity}
          label="Completed Today"
          value={stats.tasks.completed}
          color="var(--success)"
        />
        <StatCard
          icon={AlertTriangle}
          label="Active Anomalies"
          value={stats.anomalies}
          color={stats.anomalies > 0 ? 'var(--danger)' : 'var(--success)'}
          subtext={stats.anomalies > 0 ? 'Needs attention' : 'All clear'}
        />
        <StatCard
          icon={Users}
          label="Chatters"
          value={stats.chatters}
          color="var(--info)"
          subtext={`${stats.creators} creators`}
        />
      </div>

      {/* Quick actions */}
      <div className="rounded-xl p-6" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          {[
            { label: 'Upload Reports', href: '/uploads', icon: '📊' },
            { label: 'View Tasks', href: '/tasks', icon: '📋' },
            { label: 'Team Overview', href: '/team', icon: '👥' },
            { label: 'Settings', href: '/settings', icon: '⚙️' },
          ].map(({ label, href, icon }) => (
            <a
              key={href}
              href={href}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm transition-colors"
              style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                color: 'var(--text-secondary)',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
            >
              <span>{icon}</span>
              {label}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
