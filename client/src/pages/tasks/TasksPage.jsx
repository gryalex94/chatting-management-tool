import { useState, useEffect } from 'react';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Clock, Play, Pause, Check, Plus, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';

const statusLabels = {
  pool: 'Available',
  claimed: 'Claimed',
  in_progress: 'In Progress',
  completed: 'Completed',
  pending_review: 'Pending Review',
  confirmed: 'Confirmed',
  rolled_over: 'Rolled Over',
};

const priorityColors = {
  1: 'var(--danger)',
  2: '#f97316',
  3: 'var(--warning)',
  4: 'var(--info)',
  5: '#8b5cf6',
  6: 'var(--text-secondary)',
  7: 'var(--text-muted)',
};

export default function TasksPage() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [filter, setFilter] = useState('active');
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadTasks(); }, [filter]);

  async function loadTasks() {
    setLoading(true);
    try {
      const params = {};
      if (filter === 'active') {
        // Don't filter by status — get all non-historical
      } else if (filter !== 'all') {
        params.status = filter;
      }
      const { data } = await api.get('/api/tasks', { params });
      const filtered = filter === 'active'
        ? data.filter(t => !['confirmed', 'rolled_over'].includes(t.status))
        : data;
      setTasks(filtered);
    } catch (err) {
      console.error('Load tasks error:', err);
    } finally {
      setLoading(false);
    }
  }

  async function claimTask(taskId) {
    try {
      await api.post(`/api/tasks/${taskId}/claim`);
      toast.success('Task claimed!');
      loadTasks();
    } catch (err) {
      toast.error('Failed to claim task');
    }
  }

  async function timerAction(taskId, action) {
    try {
      await api.post(`/api/tasks/${taskId}/timer`, { action });
      toast.success(`Timer ${action}ed`);
      loadTasks();
    } catch (err) {
      toast.error(`Failed to ${action} timer`);
    }
  }

  const filters = [
    { key: 'active', label: 'Active' },
    { key: 'pool', label: 'Pool' },
    { key: 'in_progress', label: 'In Progress' },
    { key: 'completed', label: 'Completed' },
    { key: 'all', label: 'All' },
  ];

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Tasks</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>{tasks.length} tasks</p>
        </div>
        <button
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
          style={{ background: 'var(--accent)' }}
        >
          <Plus size={16} />
          New Task
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-6">
        {filters.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
            style={{
              background: filter === f.key ? 'var(--accent)' : 'var(--bg-card)',
              color: filter === f.key ? '#fff' : 'var(--text-secondary)',
              border: `1px solid ${filter === f.key ? 'var(--accent)' : 'var(--border)'}`,
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Task list */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-16" style={{ color: 'var(--text-muted)' }}>
          <ListIcon className="mx-auto mb-3" size={32} />
          <p className="text-sm">No tasks found</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {tasks.map((task, i) => (
            <div
              key={task.id}
              className="rounded-xl p-4 transition-all duration-200 animate-fade-in"
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                animationDelay: `${i * 30}ms`,
              }}
              onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--border-light)'}
              onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border)'}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ background: priorityColors[task.priority] }}
                    />
                    <h3 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      {task.title}
                    </h3>
                    {task.rollover_counter > 0 && (
                      <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--danger)', color: '#fff' }}>
                        ×{task.rollover_counter}
                      </span>
                    )}
                  </div>
                  {task.description && (
                    <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
                      {task.description.substring(0, 120)}{task.description.length > 120 ? '...' : ''}
                    </p>
                  )}
                  <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                    {task.chatter && <span>👤 {task.chatter.name}</span>}
                    {task.creator && <span>📄 {task.creator.name}</span>}
                    <span
                      className="px-2 py-0.5 rounded-full"
                      style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}
                    >
                      {statusLabels[task.status] || task.status}
                    </span>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-2">
                  {task.status === 'pool' && (
                    <button
                      onClick={() => claimTask(task.id)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium text-white"
                      style={{ background: 'var(--accent)' }}
                    >
                      Claim
                    </button>
                  )}
                  {task.status === 'claimed' && (
                    <button
                      onClick={() => timerAction(task.id, 'start')}
                      className="p-2 rounded-lg transition-colors"
                      style={{ background: 'var(--success)', color: '#fff' }}
                    >
                      <Play size={14} />
                    </button>
                  )}
                  {task.status === 'in_progress' && (
                    <>
                      <button
                        onClick={() => timerAction(task.id, 'pause')}
                        className="p-2 rounded-lg"
                        style={{ background: 'var(--warning)', color: '#fff' }}
                      >
                        <Pause size={14} />
                      </button>
                      <button
                        onClick={() => timerAction(task.id, 'complete')}
                        className="p-2 rounded-lg"
                        style={{ background: 'var(--success)', color: '#fff' }}
                      >
                        <Check size={14} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ListIcon({ className, size }) {
  return <AlertCircle className={className} size={size} style={{ color: 'var(--text-muted)' }} />;
}
