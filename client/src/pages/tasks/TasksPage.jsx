import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Chip } from '../../components/shared';
import DismissModal from '../../components/shared/DismissModal';
import { TIER, reasonLabel, fmtSentAt } from '../../utils/taskMeta';
import toast from 'react-hot-toast';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtDay = (d) => { if (!d || d === 'unknown') return 'Undated'; const [y, m, day] = d.split('-'); return `${+day} ${MONTHS[+m - 1]} ${y}`; };
// Group completed/dismissed tasks by the day they were actioned, newest day first.
function groupByDay(list) {
  const map = new Map();
  for (const t of list) { const d = (t.completed_at || t.updated_at || '').slice(0, 10) || 'unknown'; if (!map.has(d)) map.set(d, []); map.get(d).push(t); }
  return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]))
    .map(([day, ts]) => ({ day, ts: ts.sort((x, y) => (y.completed_at || y.updated_at || '').localeCompare(x.completed_at || x.updated_at || '')) }));
}

const copy = (t) => { try { navigator.clipboard?.writeText(t); toast.success('Copied'); } catch { /* ignore */ } };

const TABS = [
  { key: 'open', label: 'Open', statuses: ['open'] },
  { key: 'taken', label: 'Taken', statuses: ['taken'] },
  { key: 'completed', label: 'Completed', statuses: ['completed'] },
  { key: 'dismissed', label: 'Dismissed', statuses: ['dismissed'] },
  { key: 'archived', label: 'Archived', statuses: ['archived'] },
];

const GROUPS = [['none', 'All'], ['page', 'By page'], ['chatter', 'By chatter']];

// Bucket the already-priority-sorted list by page or chatter. Groups are ordered
// by their most urgent task (lowest priority number), so the spirit of the AI
// ranking carries up to the group level too. When grouping by chatter, the
// page-level bucket (tasks tied to no one) is always pinned to the very bottom.
const PAGE_BUCKET = 'Page-level (no chatter)';
function buildGroups(list, groupBy) {
  const keyOf = (t) => groupBy === 'page'
    ? (t.creator_name || 'Unassigned page')
    : (t.chatter_name || PAGE_BUCKET);
  const map = new Map();
  for (const t of list) { const k = keyOf(t); if (!map.has(k)) map.set(k, []); map.get(k).push(t); }
  return [...map.entries()]
    .map(([name, ts]) => ({ name, ts, top: Math.min(...ts.map(t => t.priority || 7)), pinLast: name === PAGE_BUCKET }))
    .sort((a, b) => (a.pinLast - b.pinLast) || (a.top - b.top) || (b.ts.length - a.ts.length) || a.name.localeCompare(b.name));
}

function fmtActioned(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
}

// Tag for a kept-waiting fan (matches the tier vocabulary from computeChatterMetrics).
function tierTag(s) {
  if (s.tier === 'new_sub') return { label: 'NEW SUB', c: '#ec4899' };
  if (s.tier === 'whale') return { label: `WHALE $${s.spend}`, c: '#a78bfa' };
  if (s.tier === 'spender') return { label: `SPENDER $${s.spend}`, c: '#60a5fa' };
  return { label: (s.tier || 'fan').toUpperCase(), c: 'var(--fg-3)' };
}

// Reply-time / AFK tasks carry a per-subscriber breakdown in context.subs. Render
// each fan as its own reviewable row: username (click-to-copy), tier, worst wait,
// when, and the message — so the manager can open the exact spot in Infloww.
function ReplyTimeSubs({ subs, workload }) {
  const [open, setOpen] = useState(subs.length <= 4);
  return (
    <div style={{ marginTop: 8 }}>
      <button onClick={() => setOpen(o => !o)} style={{ ...ghost, fontSize: 11, padding: '3px 9px' }}>
        {open ? '▾' : '▸'} {subs.length} fan{subs.length === 1 ? '' : 's'} kept waiting{workload ? ` · workload: ${workload}` : ''}
      </button>
      {open && (
        <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {subs.map((s, i) => {
            const tag = tierTag(s);
            return (
              <div key={s.fan_username || i} style={{ background: 'var(--bg-3)', borderRadius: 6, padding: '6px 8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <button onClick={() => copy(s.fan_username)} title="click to copy username" style={userBtn}>{s.fan_username || s.fan_nickname}</button>
                  <span style={{ fontSize: 9.5, fontWeight: 800, color: '#fff', background: tag.c, borderRadius: 4, padding: '1px 5px' }}>{tag.label}</span>
                  <span style={{ fontSize: 11, color: '#f87171', fontWeight: 700 }}>{s.worst_reply_min}m wait</span>
                  {s.worst_time && <span style={{ fontSize: 10.5, color: 'var(--indigo-bright)', fontWeight: 700 }}>🕐 {s.worst_time}</span>}
                  {s.count > 1 && <span style={{ fontSize: 10, color: 'var(--fg-3)' }}>×{s.count} times</span>}
                </div>
                {s.worst_fan_message && <div style={{ fontSize: 11, color: 'var(--fg-2)', fontStyle: 'italic', marginTop: 3 }}>fan: “{s.worst_fan_message}”</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Row({ task, onAction }) {
  const isCustom = task.source_type === 'custom';
  const ctx = task.context || {};
  const important = ctx.important;
  const t = TIER[task.priority] || TIER[7];
  const dismissed = task.status === 'dismissed';
  const actionedAt = (task.status === 'completed' || task.status === 'dismissed' || task.status === 'archived') ? task.completed_at : null;
  // Every fan the task refers to, each with their own username + time.
  const fans = (ctx.fans && ctx.fans.length) ? ctx.fans
    : (task.fan_username ? [{ username: task.fan_username, sent_at: ctx.sent_at }] : []);
  return (
    <div style={{ background: isCustom ? 'rgba(245,158,11,0.07)' : 'var(--bg-2)', border: `1.5px solid ${isCustom ? '#f59e0b' : 'var(--border)'}`, borderRadius: 'var(--r-card)', padding: '11px 13px', marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {isCustom
          ? <span style={{ fontSize: 10.5, fontWeight: 800, color: '#fff', background: '#f59e0b', borderRadius: 5, padding: '2px 7px' }}>{important ? '★ ' : ''}CUSTOM</span>
          : <span style={{ fontSize: 10.5, fontWeight: 800, color: '#fff', background: t.c, borderRadius: 5, padding: '2px 6px' }}>{t.label}</span>}
        {!isCustom && <Chip tone={task.severity === 'critical' || task.severity === 'high' ? 'bad' : task.severity === 'medium' ? 'warn' : 'info'} style={{ fontSize: 9.5 }}>{task.severity}</Chip>}
        {!isCustom && <span style={{ fontSize: 10.5, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: 0.3 }}>{task.area}</span>}
        {(task.creator_name || task.chatter_name) && <span style={{ fontSize: 11, color: 'var(--fg-2)', fontWeight: 600 }}>{task.creator_name || ''}{task.creator_name && task.chatter_name ? ' · ' : ''}{task.chatter_name || ''}</span>}
        {isCustom && ctx.assigned_to_name && <span style={{ fontSize: 11, color: 'var(--fg-3)' }}>for <b style={{ color: 'var(--fg-1)' }}>{ctx.assigned_to_name}</b></span>}
        {fans.map(f => (
          <span key={f.username} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <button onClick={() => copy(f.username)} title={f.nickname ? `${f.nickname} — click to copy` : 'click to copy'} style={userBtn}>{f.username}</button>
            {f.spend != null && <span title="Recorded spend" style={{ fontSize: 10.5, color: f.spend >= 1000 ? '#a78bfa' : f.spend > 0 ? '#4ade80' : 'var(--fg-3)', fontWeight: 700 }}>${f.spend}</span>}
            {f.sent_at && <span title="When this fan's message was sent" style={{ fontSize: 10.5, color: 'var(--indigo-bright)', fontWeight: 700 }}>🕐 {fmtSentAt(f.sent_at)}</span>}
          </span>
        ))}
        {!isCustom && task.days_open > 1 && <Chip tone="warn" style={{ fontSize: 9.5 }}>{task.days_open}d</Chip>}
        {actionedAt && <span style={{ marginLeft: 'auto', fontSize: 10.5, color: 'var(--fg-3)', fontWeight: 600 }}>{task.status === 'completed' ? '✓ done' : task.status === 'archived' ? '📥 archived' : '✕ dismissed'} {fmtActioned(actionedAt)}</span>}
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--fg-1)', lineHeight: 1.5, marginTop: 6 }}>{task.detail}</div>

      {/* reply-time / AFK: per-fan reviewable rows */}
      {Array.isArray(ctx.subs) && ctx.subs.length > 0 && !dismissed && (
        <ReplyTimeSubs subs={ctx.subs} workload={ctx.workload} />
      )}

      {task.status === 'archived' && task.priority_reason && (
        <div style={{ marginTop: 7 }}><Chip tone="neutral" style={{ fontSize: 10 }}>📥 {task.priority_reason}</Chip></div>
      )}

      {/* dismissed → show the reasoning (the calibration signal) */}
      {dismissed && (
        <div style={{ marginTop: 7, fontSize: 11.5, color: 'var(--fg-2)' }}>
          <Chip tone="neutral" style={{ fontSize: 10 }}>dismissed: {reasonLabel[task.dismiss_reason_code] || task.dismiss_reason_code || '—'}</Chip>
          {task.dismiss_reason && <span style={{ marginLeft: 8, fontStyle: 'italic', color: 'var(--fg-3)' }}>“{task.dismiss_reason}”</span>}
        </div>
      )}
      {ctx.message && !dismissed && (
        <div onClick={() => copy(ctx.message)} title="Click to copy"
          style={{ marginTop: 5, fontSize: 11.5, color: 'var(--fg-2)', fontStyle: 'italic', background: 'var(--bg-3)', borderRadius: 6, padding: '6px 8px', lineHeight: 1.5, cursor: 'pointer' }}>
          "{ctx.message}"
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, marginTop: 9 }}>
        {task.status === 'open' && <button onClick={() => onAction(task, 'take')} style={primary}>Take</button>}
        {task.status === 'taken' && <button onClick={() => onAction(task, 'complete')} style={primary}>Complete</button>}
        {task.status === 'taken' && <button onClick={() => onAction(task, 'reopen')} style={ghost}>Release</button>}
        {(task.status === 'open' || task.status === 'taken') && <button onClick={() => onAction(task, 'dismiss')} style={ghost}>Dismiss</button>}
        {(task.status === 'open' || task.status === 'taken') && <button onClick={() => onAction(task, 'archive')} style={ghost} title="File away without actioning">Archive</button>}
        {(task.status === 'dismissed' || task.status === 'completed' || task.status === 'archived') && <button onClick={() => onAction(task, 'reopen')} style={ghost}>Reopen</button>}
      </div>
    </div>
  );
}

function CustomTaskModal({ meta, onClose, onCreate }) {
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [important, setImportant] = useState(false);
  const [attach, setAttach] = useState('none');     // none | page | chatter
  const [creatorId, setCreatorId] = useState('');
  const [chatterId, setChatterId] = useState('');
  const [assignee, setAssignee] = useState('');
  const [saving, setSaving] = useState(false);

  const canSave = title.trim() && (attach !== 'page' || creatorId) && (attach !== 'chatter' || chatterId);
  const submit = async () => {
    if (!canSave) return; setSaving(true);
    await onCreate({
      title: title.trim(), detail: detail.trim(), important,
      creator_id: attach === 'page' ? creatorId : null,
      chatter_id: attach === 'chatter' ? chatterId : null,
      assigned_to_name: assignee || null,
    });
    setSaving(false);
  };
  const sel = { ...inputStyle, width: '100%' };
  return createPortal((
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 'var(--r-panel)', padding: 20, width: 'min(520px, 94vw)', maxHeight: '88vh', overflow: 'auto' }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>New custom task</div>

        <label style={lbl}>Title</label>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Review Maurice's discount habit" autoFocus style={{ ...inputStyle, width: '100%', marginBottom: 12 }} />

        <label style={lbl}>Details (optional)</label>
        <textarea value={detail} onChange={e => setDetail(e.target.value)} rows={3} placeholder="What to do, context…" style={{ ...inputStyle, width: '100%', resize: 'vertical', marginBottom: 12, fontFamily: 'var(--ff-sans)' }} />

        <label style={lbl}>Importance</label>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          {[[false, 'Normal'], [true, '★ Important']].map(([v, l]) => (
            <button key={l} onClick={() => setImportant(v)} style={{ ...groupBtn, flex: 1, padding: '8px 0', borderColor: important === v ? '#f59e0b' : 'var(--border)', background: important === v ? 'rgba(245,158,11,0.12)' : 'var(--bg-2)', color: important === v ? '#f59e0b' : 'var(--fg-2)' }}>{l}</button>
          ))}
        </div>

        <label style={lbl}>Attach to</label>
        <div style={{ display: 'flex', gap: 8, marginBottom: attach === 'none' ? 12 : 8 }}>
          {[['none', 'Nothing'], ['page', 'A page'], ['chatter', 'A chatter']].map(([v, l]) => (
            <button key={v} onClick={() => setAttach(v)} style={{ ...groupBtn, flex: 1, padding: '8px 0', borderColor: attach === v ? 'var(--indigo)' : 'var(--border)', background: attach === v ? 'var(--indigo-soft)' : 'var(--bg-2)', color: attach === v ? 'var(--indigo-bright)' : 'var(--fg-2)' }}>{l}</button>
          ))}
        </div>
        {attach === 'page' && (
          <select value={creatorId} onChange={e => setCreatorId(e.target.value)} style={{ ...sel, marginBottom: 12 }}>
            <option value="">Select a page…</option>
            {(meta.creators || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
        {attach === 'chatter' && (
          <select value={chatterId} onChange={e => setChatterId(e.target.value)} style={{ ...sel, marginBottom: 12 }}>
            <option value="">Select a chatter…</option>
            {(meta.chatters || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}

        <label style={lbl}>For (optional)</label>
        <select value={assignee} onChange={e => setAssignee(e.target.value)} style={{ ...sel, marginBottom: 16 }}>
          <option value="">Anyone</option>
          {(meta.members || []).map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
        </select>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={ghost}>Cancel</button>
          <button onClick={submit} disabled={!canSave || saving} style={{ ...primary, opacity: canSave && !saving ? 1 : 0.5 }}>{saving ? 'Creating…' : 'Create task'}</button>
        </div>
      </div>
    </div>
  ), document.body);
}

export default function TasksPage() {
  const { user } = useAuth();
  const canCreate = ['head_manager', 'admin', 'owner'].includes(user?.role);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('open');
  const [search, setSearch] = useState('');
  const [groupBy, setGroupBy] = useState('none');
  const [selPages, setSelPages] = useState([]);
  const [selChatters, setSelChatters] = useState([]);
  const [showFilters, setShowFilters] = useState(false);
  const [dismiss, setDismiss] = useState(null);
  const [showCustom, setShowCustom] = useState(false);
  const [meta, setMeta] = useState({ creators: [], chatters: [], members: [] });

  const load = useCallback(async () => {
    try {
      const [tk, cr, ch, mem] = await Promise.all([
        api.get('/api/review-tasks'),
        api.get('/api/creators').catch(() => ({ data: [] })),
        api.get('/api/chatters').catch(() => ({ data: [] })),
        api.get('/api/organisations/members').catch(() => ({ data: [] })),
      ]);
      setTasks(tk.data.tasks || []);
      setMeta({ creators: cr.data || [], chatters: ch.data || [], members: mem.data || [] });
    } catch { /* ignore */ } finally { setLoading(false); }
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const act = async (task, action, reason_code, reason) => {
    try {
      await api.patch(`/api/review-tasks/${task.id}`, { action, reason_code, reason });
      const next = action === 'take' ? 'taken' : action === 'complete' ? 'completed' : action === 'dismiss' ? 'dismissed' : action === 'archive' ? 'archived' : 'open';
      setTasks(ts => ts.map(t => t.id === task.id ? { ...t, status: next, dismiss_reason_code: reason_code || t.dismiss_reason_code, dismiss_reason: reason ?? t.dismiss_reason } : t));
      toast.success('Updated');
    } catch (e) { toast.error(e?.response?.data?.error || 'Failed'); }
  };
  const onAction = (task, action) => { if (action === 'dismiss') setDismiss(task); else act(task, action); };
  const createCustom = async (payload) => {
    try { await api.post('/api/review-tasks/custom', payload); toast.success('Custom task created'); setShowCustom(false); load(); }
    catch (e) { toast.error(e?.response?.data?.error || 'Failed'); }
  };

  const counts = Object.fromEntries(TABS.map(tb => [tb.key, tasks.filter(t => tb.statuses.includes(t.status)).length]));
  const cur = TABS.find(tb => tb.key === tab);

  // chip options come from this tab's tasks (before page/chatter filtering) so they stay stable
  const base = tasks.filter(t => cur.statuses.includes(t.status));
  const pageOpts = [...new Set(base.map(t => t.creator_name).filter(Boolean))].sort();
  const chatterOpts = [...new Set(base.map(t => t.chatter_name).filter(Boolean))].sort();
  const activeFilters = selPages.length + selChatters.length;

  let list = base;
  if (selPages.length) list = list.filter(t => selPages.includes(t.creator_name));
  if (selChatters.length) list = list.filter(t => selChatters.includes(t.chatter_name));
  if (search) {
    const s = search.toLowerCase();
    list = list.filter(t => [t.detail, t.chatter_name, t.creator_name, t.fan_username].some(v => (v || '').toLowerCase().includes(s)));
  }
  list = list.sort((a, b) => (a.priority || 7) - (b.priority || 7));

  const isHistory = tab === 'completed' || tab === 'dismissed' || tab === 'archived';
  const customTasks = list.filter(t => t.source_type === 'custom')
    .sort((a, b) => (b.context?.important ? 1 : 0) - (a.context?.important ? 1 : 0) || String(b.created_at).localeCompare(String(a.created_at)));
  const aiTasks = list.filter(t => t.source_type !== 'custom');

  // dismissed view: calibration breakdown by reason
  const dismissBreakdown = tab === 'dismissed'
    ? Object.entries(list.reduce((m, t) => { const k = t.dismiss_reason_code || 'other'; m[k] = (m[k] || 0) + 1; return m; }, {})).sort((a, b) => b[1] - a[1])
    : [];

  if (loading) return <div style={{ paddingTop: 80, textAlign: 'center', color: 'var(--fg-3)' }}>Loading…</div>;

  return (
    <div className="animate-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>Tasks</h1>
          <p style={{ fontSize: 13, color: 'var(--fg-2)', marginTop: 4 }}>The full backlog. Open & taken are the live queue; completed & dismissed are the record.</p>
        </div>
        {canCreate && <button onClick={() => setShowCustom(true)} style={primary}>+ Custom task</button>}
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        {TABS.map(tb => (
          <button key={tb.key} onClick={() => setTab(tb.key)}
            style={{ ...tabBtn, borderColor: tab === tb.key ? 'var(--indigo)' : 'var(--fg-4)', color: tab === tb.key ? 'var(--fg-0)' : 'var(--fg-2)' }}>
            {tb.label} {counts[tb.key]}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginRight: 4 }}>
          {GROUPS.map(([k, l]) => (
            <button key={k} onClick={() => setGroupBy(k)}
              style={{ ...groupBtn, borderColor: groupBy === k ? 'var(--indigo)' : 'var(--border)', background: groupBy === k ? 'var(--indigo-soft)' : 'var(--bg-2)', color: groupBy === k ? 'var(--indigo-bright)' : 'var(--fg-3)' }}>
              {l}
            </button>
          ))}
        </div>
        <button onClick={() => setShowFilters(v => !v)}
          style={{ ...groupBtn, marginRight: 4, borderColor: (showFilters || activeFilters) ? 'var(--indigo)' : 'var(--border)', background: activeFilters ? 'var(--indigo-soft)' : 'var(--bg-2)', color: activeFilters ? 'var(--indigo-bright)' : 'var(--fg-3)' }}>
          Filter{activeFilters ? ` · ${activeFilters}` : ''}
        </button>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
          style={{ ...inputStyle, width: 180 }} />
      </div>

      {showFilters && (
        <div style={filterPanel}>
          {pageOpts.length > 0 && (
            <div style={filterRow}>
              <span style={filterLabel}>Pages</span>
              {pageOpts.map(p => (
                <button key={p} onClick={() => setSelPages(a => a.includes(p) ? a.filter(x => x !== p) : [...a, p])} style={chipStyle(selPages.includes(p))}>{p}</button>
              ))}
            </div>
          )}
          {chatterOpts.length > 0 && (
            <div style={filterRow}>
              <span style={filterLabel}>Chatters</span>
              {chatterOpts.map(c => (
                <button key={c} onClick={() => setSelChatters(a => a.includes(c) ? a.filter(x => x !== c) : [...a, c])} style={chipStyle(selChatters.includes(c))}>{c}</button>
              ))}
            </div>
          )}
          {activeFilters > 0 && (
            <div><button onClick={() => { setSelPages([]); setSelChatters([]); }} style={{ ...groupBtn, color: 'var(--bad)', borderColor: 'var(--border)' }}>Clear filters</button></div>
          )}
        </div>
      )}

      {tab === 'dismissed' && dismissBreakdown.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14, padding: '10px 12px', background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 'var(--r-card)' }}>
          <span style={{ fontSize: 11.5, color: 'var(--fg-3)', fontWeight: 700 }}>Why dismissed (calibration):</span>
          {dismissBreakdown.map(([code, n]) => (
            <span key={code} style={{ fontSize: 11.5, color: 'var(--fg-1)' }}>{reasonLabel[code] || code}: <strong>{n}</strong></span>
          ))}
        </div>
      )}

      {list.length === 0 ? (
        <div style={{ background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 'var(--r-panel)', padding: 50, textAlign: 'center', color: 'var(--fg-3)' }}>
          Nothing here. Build the queue from Home{canCreate ? ', or add a custom task' : ''}.
        </div>
      ) : isHistory ? (
        // completed / dismissed → grouped by the day they were actioned
        groupByDay(list).map(g => (
          <div key={g.day} style={{ marginBottom: 18 }}>
            <div style={dayHeader}><span style={{ fontWeight: 700, fontSize: 13.5 }}>{fmtDay(g.day)}</span><Chip tone="neutral" style={{ fontSize: 10 }}>{g.ts.length}</Chip></div>
            {g.ts.map(t => <Row key={t.id} task={t} onAction={onAction} />)}
          </div>
        ))
      ) : (
        <>
          {/* custom tasks always pinned on top */}
          {customTasks.map(t => <Row key={t.id} task={t} onAction={onAction} />)}
          {groupBy === 'none'
            ? aiTasks.map(t => <Row key={t.id} task={t} onAction={onAction} />)
            : buildGroups(aiTasks, groupBy).map(g => (
              <div key={g.name} style={{ marginBottom: 18 }}>
                <div style={dayHeader}><span style={{ fontWeight: 700, fontSize: 13.5 }}>{g.name}</span><Chip tone="neutral" style={{ fontSize: 10 }}>{g.ts.length}</Chip></div>
                {g.ts.map(t => <Row key={t.id} task={t} onAction={onAction} />)}
              </div>
            ))}
        </>
      )}

      {dismiss && <DismissModal task={dismiss} onClose={() => setDismiss(null)}
        onConfirm={(code, note) => { act(dismiss, 'dismiss', code, note); setDismiss(null); }} />}
      {showCustom && <CustomTaskModal meta={meta} onClose={() => setShowCustom(false)} onCreate={createCustom} />}
    </div>
  );
}

const inputStyle = { background: 'var(--bg-2)', border: '1px solid var(--border)', color: 'var(--fg-0)', borderRadius: 'var(--r-btn)', padding: '8px 10px', fontSize: 13, fontFamily: 'var(--ff-sans)' };
const tabBtn = { background: 'var(--bg-3)', border: '1.5px solid var(--fg-4)', borderRadius: 'var(--r-btn)', padding: '6px 12px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' };
const groupBtn = { border: '1px solid var(--border)', borderRadius: 'var(--r-btn)', padding: '5px 10px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' };
const dayHeader = { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 2px 8px', borderBottom: '1px solid var(--border)', marginBottom: 10 };
const lbl = { display: 'block', fontSize: 10.5, fontWeight: 700, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 5 };
const filterPanel = { background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 'var(--r-card)', padding: '10px 12px', marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 8 };
const filterRow = { display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' };
const filterLabel = { fontSize: 10.5, fontWeight: 700, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: 0.4, width: 58, flexShrink: 0 };
const chipStyle = (active) => ({ border: `1px solid ${active ? 'var(--indigo)' : 'var(--border)'}`, background: active ? 'var(--indigo-soft)' : 'var(--bg-2)', color: active ? 'var(--indigo-bright)' : 'var(--fg-2)', borderRadius: 'var(--r-btn)', padding: '4px 9px', fontSize: 11, fontWeight: 600, cursor: 'pointer' });
const primary = { background: 'var(--indigo)', color: '#fff', border: 'none', cursor: 'pointer', borderRadius: 'var(--r-btn)', padding: '6px 14px', fontSize: 12, fontWeight: 700 };
const ghost = { background: 'var(--bg-3)', border: '1px solid var(--fg-4)', color: 'var(--fg-1)', borderRadius: 'var(--r-btn)', padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' };
const userBtn = { background: 'var(--bg-3)', border: '1px solid var(--fg-4)', color: 'var(--fg-0)', borderRadius: 'var(--r-btn)', padding: '2px 7px', fontSize: 10.5, fontWeight: 700, fontFamily: 'var(--ff-mono)', cursor: 'pointer' };
