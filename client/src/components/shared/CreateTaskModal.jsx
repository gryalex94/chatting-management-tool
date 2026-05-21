import { useState, useEffect } from 'react';
import api from '../../services/api';
import { X, Plus, Minus } from 'lucide-react';
import toast from 'react-hot-toast';
import { createPortal } from 'react-dom';

const PRIORITIES = [
  { value: 1, label: 'Urgent', color: '#ef4444' },
  { value: 2, label: 'High', color: '#f97316' },
  { value: 3, label: 'Medium', color: '#f59e0b' },
  { value: 4, label: 'Low', color: '#8888a0' },
];

const DEFAULT_TEMPLATE = { label: 'Custom task', icon: '📝', title: '', description: '', priority: 3 };

const inp = {
  width: '100%', padding: '8px 12px', borderRadius: 'var(--r-btn)',
  fontSize: 12.5, outline: 'none', background: 'var(--bg-2)',
  border: '1px solid var(--border)', color: 'var(--fg-0)',
};

export default function CreateTaskModal({ onClose, onCreated, defaultCreatorId, defaultChatterId }) {
  const [form, setForm] = useState({
    title: '', description: '', priority: 3,
    creator_ids: defaultCreatorId ? [defaultCreatorId] : [],
    chatter_ids: defaultChatterId ? [defaultChatterId] : [],
    is_recurring: false, recurrence_pattern: 'weekly',
    requires_screenshots: true,
  });
  const [creators, setCreators] = useState([]);
  const [chatters, setChatters] = useState([]);
  const [saving, setSaving] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(0);
  const [templates, setTemplates] = useState([]);

  useEffect(() => {
    api.get('/api/creators').then(r => setCreators(r.data)).catch(() => {});
    api.get('/api/chatters').then(r => setChatters(r.data)).catch(() => {});
    api.get('/api/tasks/templates').then(r => setTemplates(r.data)).catch(() => {});
  }, []);

  const u = (k, v) => setForm(p => ({ ...p, [k]: v }));

  function applyTemplate(idx) {
    const allTemplates = [DEFAULT_TEMPLATE, ...templates];
    const t = allTemplates[idx];
    setSelectedTemplate(idx);
    if (t.title) {
      setForm(p => ({ ...p, title: t.title, description: t.description || '', priority: t.priority || 3 }));
    }
  }

  function toggleCreator(id) {
    setForm(p => ({
      ...p,
      creator_ids: p.creator_ids.includes(id)
        ? p.creator_ids.filter(x => x !== id)
        : [...p.creator_ids, id],
    }));
  }

  function toggleChatter(id) {
    setForm(p => ({
      ...p,
      chatter_ids: p.chatter_ids.includes(id)
        ? p.chatter_ids.filter(x => x !== id)
        : [...p.chatter_ids, id],
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.title.trim()) return toast.error('Title is required');
    setSaving(true);
    try {
      // Create one task per creator, or one with no creator
      const creatorList = form.creator_ids.length > 0 ? form.creator_ids : [null];
      const chatterList = form.chatter_ids.length > 0 ? form.chatter_ids : [null];

      for (const crid of creatorList) {
        for (const chid of chatterList) {
          await api.post('/api/tasks', {
            title: form.title,
            description: form.description,
            priority: form.priority,
            creator_id: crid,
            chatter_id: chid,
            is_recurring: form.is_recurring,
            recurrence_pattern: form.is_recurring ? form.recurrence_pattern : null,
            requires_screenshots: form.requires_screenshots,
          });
        }
      }

      const count = creatorList.length * chatterList.length;
      toast.success(count > 1 ? `${count} tasks created` : 'Task created');
      onCreated?.();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create task');
    } finally { setSaving(false); }
  }

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={onClose}>
      <div style={{ width: 520, maxHeight: '85vh', background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 'var(--r-panel)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>New Task</span>
          <button className="btn sm ghost" onClick={onClose}><X size={14} /></button>
        </div>

        <div style={{ overflow: 'auto', flex: 1 }}>
          {/* Templates */}
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
            <div className="label" style={{ marginBottom: 8 }}>Quick templates</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {[DEFAULT_TEMPLATE, ...templates].map((t, i) => (
                <button key={i} type="button" onClick={() => applyTemplate(i)}
                  style={{
                    padding: '6px 10px', borderRadius: 'var(--r-btn)', fontSize: 11.5, fontWeight: 500,
                    border: `1px solid ${selectedTemplate === i ? 'var(--indigo-line)' : 'var(--border)'}`,
                    background: selectedTemplate === i ? 'var(--indigo-soft)' : 'var(--bg-2)',
                    color: selectedTemplate === i ? 'var(--indigo-bright)' : 'var(--fg-2)',
                    cursor: 'pointer', transition: 'all .12s',
                  }}>
                  {t.icon} {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label className="label" style={{ display: 'block', marginBottom: 6 }}>Title</label>
              <input value={form.title} onChange={e => u('title', e.target.value)} required style={inp} placeholder="Task title" />
            </div>

            <div>
              <label className="label" style={{ display: 'block', marginBottom: 6 }}>Description</label>
              <textarea value={form.description} onChange={e => u('description', e.target.value)} rows={2} style={{ ...inp, resize: 'vertical' }} placeholder="What needs to be done..." />
            </div>

            {/* Priority */}
            <div>
              <label className="label" style={{ display: 'block', marginBottom: 6 }}>Priority</label>
              <div style={{ display: 'flex', gap: 6 }}>
                {PRIORITIES.map(p => (
                  <button key={p.value} type="button" onClick={() => u('priority', p.value)}
                    style={{
                      flex: 1, padding: '8px 0', borderRadius: 'var(--r-btn)', fontSize: 11.5, fontWeight: 500,
                      border: `1px solid ${form.priority === p.value ? p.color : 'var(--border)'}`,
                      background: form.priority === p.value ? `${p.color}20` : 'var(--bg-2)',
                      color: form.priority === p.value ? p.color : 'var(--fg-2)',
                      cursor: 'pointer', transition: 'all .12s', textAlign: 'center',
                    }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, display: 'inline-block', marginRight: 6 }} />
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Creators — multi select chips */}
            <div>
              <label className="label" style={{ display: 'block', marginBottom: 6 }}>Creators <span style={{ textTransform: 'none', fontWeight: 400 }}>(optional, select multiple)</span></label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {creators.map(c => {
                  const sel = form.creator_ids.includes(c.id);
                  return (
                    <button key={c.id} type="button" onClick={() => toggleCreator(c.id)}
                      style={{
                        padding: '5px 10px', borderRadius: 999, fontSize: 11.5, fontWeight: 500,
                        border: `1px solid ${sel ? 'var(--indigo-line)' : 'var(--border)'}`,
                        background: sel ? 'var(--indigo-soft)' : 'var(--bg-2)',
                        color: sel ? 'var(--indigo-bright)' : 'var(--fg-2)',
                        cursor: 'pointer', transition: 'all .12s',
                      }}>
                      {sel ? '✓ ' : ''}{c.name}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Chatters — multi select chips */}
            <div>
              <label className="label" style={{ display: 'block', marginBottom: 6 }}>Chatters <span style={{ textTransform: 'none', fontWeight: 400 }}>(optional, select multiple)</span></label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 120, overflow: 'auto' }}>
                {chatters.map(c => {
                  const sel = form.chatter_ids.includes(c.id);
                  return (
                    <button key={c.id} type="button" onClick={() => toggleChatter(c.id)}
                      style={{
                        padding: '5px 10px', borderRadius: 999, fontSize: 11.5, fontWeight: 500,
                        border: `1px solid ${sel ? 'var(--indigo-line)' : 'var(--border)'}`,
                        background: sel ? 'var(--indigo-soft)' : 'var(--bg-2)',
                        color: sel ? 'var(--indigo-bright)' : 'var(--fg-2)',
                        cursor: 'pointer', transition: 'all .12s',
                      }}>
                      {sel ? '✓ ' : ''}{c.name}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Toggles */}
            <div style={{ display: 'flex', gap: 16 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--fg-2)', cursor: 'pointer' }}>
                <input type="checkbox" checked={form.requires_screenshots} onChange={e => u('requires_screenshots', e.target.checked)} />
                Screenshots required
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--fg-2)', cursor: 'pointer' }}>
                <input type="checkbox" checked={form.is_recurring} onChange={e => u('is_recurring', e.target.checked)} />
                Recurring
              </label>
              {form.is_recurring && (
                <select value={form.recurrence_pattern} onChange={e => u('recurrence_pattern', e.target.value)} style={{ ...inp, width: 100 }}>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="per_cycle">Per cycle</option>
                </select>
              )}
            </div>

            <button type="submit" disabled={saving} className="btn primary" style={{ width: '100%', height: 36, justifyContent: 'center', marginTop: 4 }}>
              {saving ? 'Creating...' : form.creator_ids.length > 1 || form.chatter_ids.length > 1
                ? `Create ${Math.max(form.creator_ids.length, 1) * Math.max(form.chatter_ids.length, 1)} tasks`
                : 'Create task'}
            </button>
          </form>
        </div>
      </div>
    </div>,
    document.body
  );
}