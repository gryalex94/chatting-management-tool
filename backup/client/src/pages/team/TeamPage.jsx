import { useState, useEffect } from 'react';
import api from '../../services/api';
import { Users, Plus } from 'lucide-react';
import toast from 'react-hot-toast';

const statusConfig = {
  new: { label: 'New', color: 'var(--status-new)', bg: '#ef444420' },
  new_monitoring: { label: 'Monitoring', color: 'var(--status-monitoring)', bg: '#f59e0b20' },
  developing: { label: 'Developing', color: 'var(--status-developing)', bg: '#eab30820' },
  experienced: { label: 'Experienced', color: 'var(--status-experienced)', bg: '#22c55e20' },
};

export default function TeamPage() {
  const [chatters, setChatters] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newChatter, setNewChatter] = useState({ name: '', email: '' });

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    try {
      const [chattersRes, shiftsRes] = await Promise.all([
        api.get('/api/chatters'),
        api.get('/api/shifts'),
      ]);
      setChatters(chattersRes.data);
      setShifts(shiftsRes.data);
    } catch (err) {
      console.error('Team load error:', err);
    } finally {
      setLoading(false);
    }
  }

  async function addChatter(e) {
    e.preventDefault();
    try {
      await api.post('/api/chatters', newChatter);
      toast.success('Chatter added!');
      setShowAdd(false);
      setNewChatter({ name: '', email: '' });
      loadData();
    } catch (err) {
      toast.error('Failed to add chatter');
    }
  }

  async function updateStatus(id, status) {
    try {
      await api.put(`/api/chatters/${id}`, { status });
      toast.success('Status updated');
      loadData();
    } catch (err) {
      toast.error('Failed to update');
    }
  }

  // Group chatters by shift
  function getShiftName(chatter) {
    const assignment = chatter.chatter_creator_assignments?.find(a => a.is_active);
    return assignment?.shifts?.name || 'Unassigned';
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Team</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>{chatters.length} chatters</p>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
          style={{ background: 'var(--accent)' }}
        >
          <Plus size={16} />
          Add Chatter
        </button>
      </div>

      {/* Add chatter form */}
      {showAdd && (
        <form
          onSubmit={addChatter}
          className="rounded-xl p-4 mb-6 flex items-end gap-3 animate-fade-in"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
        >
          <div className="flex-1">
            <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>Name</label>
            <input
              value={newChatter.name}
              onChange={(e) => setNewChatter(p => ({ ...p, name: e.target.value }))}
              required
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
              placeholder="Chatter name"
            />
          </div>
          <div className="flex-1">
            <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>Email</label>
            <input
              value={newChatter.email}
              onChange={(e) => setNewChatter(p => ({ ...p, email: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
              placeholder="Optional"
            />
          </div>
          <button type="submit" className="px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ background: 'var(--accent)' }}>
            Add
          </button>
        </form>
      )}

      {/* Shift sections */}
      {shifts.map(shift => {
        const shiftChatters = chatters.filter(c => getShiftName(c) === shift.name);
        return (
          <div key={shift.id} className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{shift.name}</h2>
              <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--bg-card)', color: 'var(--text-muted)' }}>
                {shift.start_time?.slice(0, 5)} – {shift.end_time?.slice(0, 5)}
              </span>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{shiftChatters.length} chatters</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {shiftChatters.map(chatter => (
                <ChatterCard key={chatter.id} chatter={chatter} onStatusChange={updateStatus} />
              ))}
            </div>
          </div>
        );
      })}

      {/* Unassigned chatters */}
      {(() => {
        const unassigned = chatters.filter(c => getShiftName(c) === 'Unassigned');
        if (!unassigned.length) return null;
        return (
          <div className="mb-6">
            <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-secondary)' }}>Unassigned</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {unassigned.map(chatter => (
                <ChatterCard key={chatter.id} chatter={chatter} onStatusChange={updateStatus} />
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function ChatterCard({ chatter, onStatusChange }) {
  const config = statusConfig[chatter.status] || statusConfig.new;
  const creators = chatter.chatter_creator_assignments
    ?.filter(a => a.is_active)
    ?.map(a => a.creators?.name)
    ?.filter(Boolean) || [];

  return (
    <div
      className="rounded-xl p-4 transition-all duration-200 cursor-pointer"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
      onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--border-light)'}
      onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border)'}
    >
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{chatter.name}</h3>
        <span
          className="text-xs px-2 py-0.5 rounded-full font-medium"
          style={{ background: config.bg, color: config.color }}
        >
          {config.label}
        </span>
      </div>
      {creators.length > 0 && (
        <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
          {creators.join(', ')}
        </p>
      )}
      {/* Status changer */}
      <div className="flex gap-1 mt-2">
        {Object.entries(statusConfig).map(([key, val]) => (
          <button
            key={key}
            onClick={(e) => { e.stopPropagation(); onStatusChange(chatter.id, key); }}
            className="w-3 h-3 rounded-full transition-transform"
            style={{
              background: val.color,
              opacity: chatter.status === key ? 1 : 0.3,
              transform: chatter.status === key ? 'scale(1.3)' : 'scale(1)',
            }}
            title={val.label}
          />
        ))}
      </div>
    </div>
  );
}
