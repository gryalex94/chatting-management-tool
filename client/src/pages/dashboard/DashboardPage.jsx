import { useState, useEffect, useCallback, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { Avatar, Chip } from '../../components/shared';
import { TIER } from '../../utils/taskMeta';
import toast from 'react-hot-toast';

const yesterday = () => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().split('T')[0]; };
const money = (n) => n == null ? '-' : `$${Math.round(n).toLocaleString()}`;

function Delta({ v, lowerBetter, money: m, suffix = '' }) {
  if (v == null || v === 0) return <span style={{ color: 'var(--fg-4)', fontSize: 10 }}>·</span>;
  const good = lowerBetter ? v < 0 : v > 0;
  const val = m ? `$${Math.abs(Math.round(v)).toLocaleString()}` : `${Math.abs(Math.round(v * 10) / 10)}${suffix}`;
  return <span style={{ color: good ? '#4ade80' : '#f87171', fontSize: 10, fontWeight: 700 }}>{v > 0 ? '▲' : '▼'}{val}</span>;
}

function Cell({ val, delta, money: m, suffix = '', lowerBetter }) {
  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 13 }}>{m ? money(val) : `${val}${suffix}`}</div>
      <Delta v={delta} money={m} suffix={suffix} lowerBetter={lowerBetter} />
    </div>
  );
}

function Donut({ counts }) {
  const total = counts.open + counts.taken + counts.completed;
  const pct = total ? counts.completed / total : 0;
  const r = 30, circ = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 80 80" width={78} height={78}>
      <circle cx={40} cy={40} r={r} fill="none" stroke="var(--bg-3)" strokeWidth={9} />
      <circle cx={40} cy={40} r={r} fill="none" stroke="#4ade80" strokeWidth={9} strokeLinecap="round"
        strokeDasharray={`${circ * pct} ${circ}`} transform="rotate(-90 40 40)" />
      <text x={40} y={45} textAnchor="middle" fontSize={17} fontWeight={700} fill="var(--fg-0)">{Math.round(pct * 100)}%</text>
    </svg>
  );
}

function Sparkline({ data, w = 74, h = 24, color = 'var(--indigo-bright)' }) {
  const vals = (data || []);
  const nums = vals.filter(v => v != null);
  if (nums.length < 2) return <span style={{ color: 'var(--fg-4)', fontSize: 10 }}>—</span>;
  const max = Math.max(...nums, 1), min = Math.min(...nums, 0), range = (max - min) || 1, n = vals.length;
  const x = i => (i / (n - 1)) * w, y = v => h - 2 - ((v - min) / range) * (h - 4);
  const segs = []; let cur = [];
  vals.forEach((v, i) => { if (v != null) cur.push(`${x(i)},${y(v)}`); else { if (cur.length) segs.push(cur); cur = []; } });
  if (cur.length) segs.push(cur);
  return (
    <svg width={w} height={h} style={{ display: 'block' }}>
      {segs.map((s, si) => s.length > 1 && <polyline key={si} points={s.join(' ')} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />)}
      {vals.map((v, i) => v != null ? <circle key={i} cx={x(i)} cy={y(v)} r={i === n - 1 ? 2.4 : 1.4} fill={color} /> : null)}
    </svg>
  );
}

const WL = { overloaded: { l: 'Overloaded', c: '#f87171' }, healthy: { l: 'Healthy', c: '#4ade80' }, light: { l: 'Light', c: '#60a5fa' } };
function WorkloadChip({ s }) {
  const m = WL[s] || { l: s, c: 'var(--fg-3)' };
  return <span style={{ fontSize: 10, fontWeight: 700, color: m.c, background: `${m.c}1e`, borderRadius: 5, padding: '2px 7px', whiteSpace: 'nowrap' }}>{m.l}</span>;
}

/* ─── Generic sortable, sticky-header, expandable table ─── */
function DataTable({ rows, columns, getKey, renderExpand, maxHeight = 380 }) {
  const [sort, setSort] = useState(null);
  const [exp, setExp] = useState(null);
  let data = rows;
  if (sort) {
    const col = columns.find(c => c.key === sort.key);
    data = [...rows].sort((a, b) => {
      const av = col.sortVal(a) ?? -Infinity, bv = col.sortVal(b) ?? -Infinity;
      return sort.dir === 'asc' ? (av < bv ? -1 : av > bv ? 1 : 0) : (av > bv ? -1 : av < bv ? 1 : 0);
    });
  }
  const toggleSort = key => setSort(s => (s && s.key === key) ? (s.dir === 'desc' ? { key, dir: 'asc' } : null) : { key, dir: 'desc' });
  const th = { position: 'sticky', top: 0, background: 'var(--bg-2)', zIndex: 2, padding: '8px 11px', fontSize: 10.5, fontWeight: 700, color: 'var(--fg-3)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: 0.3 };
  return (
    <div style={{ overflow: 'auto', maxHeight, border: '1px solid var(--border)', borderRadius: 'var(--r-panel)' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...th, width: 26 }} />
            {columns.map(c => (
              <th key={c.key} onClick={() => c.sortVal && toggleSort(c.key)} style={{ ...th, textAlign: c.align || 'left', cursor: c.sortVal ? 'pointer' : 'default' }}>
                {c.label}{sort?.key === c.key ? (sort.dir === 'desc' ? ' ▾' : ' ▴') : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map(row => {
            const k = getKey(row), isExp = exp === k;
            return (
              <Fragment key={k}>
                <tr style={{ borderBottom: '1px solid var(--border-soft)', background: isExp ? 'var(--bg-1)' : 'transparent' }}>
                  <td onClick={() => setExp(isExp ? null : k)} style={{ padding: '9px 8px', cursor: 'pointer', color: 'var(--fg-3)', fontSize: 11, textAlign: 'center' }}>{isExp ? '▾' : '▸'}</td>
                  {columns.map(c => (
                    <td key={c.key} onClick={c.onClick ? () => c.onClick(row) : undefined} style={{ padding: '6px 11px', textAlign: c.align || 'left', whiteSpace: 'nowrap', cursor: c.onClick ? 'pointer' : 'default' }}>
                      {c.render(row)}
                    </td>
                  ))}
                </tr>
                {isExp && <tr><td colSpan={columns.length + 1} style={{ padding: 0, background: 'var(--bg-1)', borderBottom: '1px solid var(--border)' }}>{renderExpand(row)}</td></tr>}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TaskList({ tasks }) {
  if (!tasks?.length) return <div style={{ fontSize: 11.5, color: 'var(--fg-3)' }}>No open tasks.</div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {tasks.slice(0, 8).map((t, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11.5 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: (TIER[t.priority] || {}).c || 'var(--fg-4)', flexShrink: 0 }} />
          <span style={{ color: 'var(--fg-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
        </div>
      ))}
      {tasks.length > 8 && <div style={{ fontSize: 10.5, color: 'var(--fg-4)' }}>+{tasks.length - 8} more</div>}
    </div>
  );
}

const expandWrap = { display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 16, padding: '12px 16px' };
const expandLabel = { fontSize: 10, fontWeight: 700, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 };

export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [date, setDate] = useState(yesterday());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [dayStatus, setDayStatus] = useState(null);   // which uploads exist for the day
  const [progress, setProgress] = useState(null);      // { stage, done, total, current }

  const load = useCallback(async (d) => {
    setLoading(true);
    try {
      const [res, ds] = await Promise.all([
        api.get('/api/daily-check/overview', { params: { date: d } }),
        api.get('/api/uploads/day-status', { params: { report_date: d } }).catch(() => ({ data: null })),
      ]);
      setData(res.data); setDayStatus(ds.data);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(date); }, [load]);

  const generate = async () => {
    setGenerating(true);
    try {
      const { data: rb } = await api.post('/api/review-tasks/rebuild', { report_date: date });
      await load(date);
      const arch = (rb?.ranked?.archived || 0) + (rb?.capped?.archived || 0);
      toast.success(`Report built${arch ? ` · archived ${arch} low-value tasks` : ''}`);
    }
    catch (e) { toast.error(e?.response?.data?.error || 'Failed'); }
    finally { setGenerating(false); }
  };

  // One-click daily pipeline (temporary convenience, removed once uploads auto-run):
  // recompute metrics → AI compliance report per chatter (progress bar) → build & rank tasks.
  const createDailyTasks = async () => {
    setGenerating(true);
    try {
      setProgress({ stage: 'calc' });
      const { data: run } = await api.post('/api/daily-check/run', { report_date: date, recompute: true });
      const chatters = run.chatters || [];
      for (let i = 0; i < chatters.length; i++) {
        const c = chatters[i];
        setProgress({ stage: 'evaluate', done: i, total: chatters.length, current: c.chatter_name });
        try { await api.post('/api/daily-check/evaluate', { chatter_id: c.chatter_id, report_date: date, eval_type: 'compliance', model: 'sonnet', prompt_version: 'A' }); }
        catch { /* skip a chatter that fails, keep going */ }
      }
      setProgress({ stage: 'build', done: chatters.length, total: chatters.length });
      const { data: rb } = await api.post('/api/review-tasks/rebuild', { report_date: date });
      const arch = (rb?.ranked?.archived || 0) + (rb?.capped?.archived || 0);
      await load(date);
      toast.success(`Daily tasks created${arch ? ` · archived ${arch} low-value` : ''}`);
    } catch (e) { toast.error(e?.response?.data?.error || 'Failed to create daily tasks'); }
    finally { setProgress(null); setGenerating(false); }
  };

  const hr = new Date().getHours();
  const greet = hr < 12 ? 'Morning' : hr < 18 ? 'Afternoon' : 'Evening';
  const tc = data?.task_counts || { open: 0, taken: 0, completed: 0, dismissed: 0 };
  const tt = data?.team_totals;
  const hasData = data && ((data.chatters || []).some(c => c.has_data) || (data.pages || []).length > 0);

  // ─── column definitions ───
  const chatterCols = [
    { key: 'name', label: 'Chatter', sortVal: r => r.name?.toLowerCase(), onClick: r => navigate(`/chatters/${r.chatter_id}`),
      render: r => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Avatar name={r.name} size={24} />
          <span style={{ fontWeight: 600, fontSize: 12.5, color: r.has_data ? 'var(--fg-0)' : 'var(--fg-3)' }}>{r.name}</span>
          {!r.has_data && <span style={{ fontSize: 10, color: 'var(--fg-4)' }}>day off</span>}
        </div>
      ) },
    { key: 'sales', label: 'Sales', align: 'right', sortVal: r => r.metrics?.sales ?? -1, render: r => r.has_data ? <Cell val={r.metrics.sales} delta={r.vs_prev?.sales} money /> : <span style={dash}>—</span> },
    { key: 'ppvs', label: 'PPVs', align: 'right', sortVal: r => r.metrics?.ppvs ?? -1, render: r => r.has_data ? <Cell val={r.metrics.ppvs} delta={r.vs_prev?.ppvs} /> : <span style={dash}>—</span> },
    { key: 'unlock', label: 'Unlock', align: 'right', sortVal: r => r.metrics?.unlock ?? -1, render: r => r.has_data ? <Cell val={r.metrics.unlock} delta={r.vs_prev?.unlock} suffix="%" /> : <span style={dash}>—</span> },
    { key: 'golden', label: 'Golden', align: 'right', sortVal: r => r.metrics?.golden ?? -1, render: r => r.has_data ? <Cell val={r.metrics.golden} delta={r.vs_prev?.golden} suffix="%" /> : <span style={dash}>—</span> },
    { key: 'messages', label: 'Msgs', align: 'right', sortVal: r => r.metrics?.messages ?? -1, render: r => r.has_data ? <Cell val={r.metrics.messages} delta={r.vs_prev?.messages} /> : <span style={dash}>—</span> },
    { key: 'reply', label: 'Reply', align: 'right', sortVal: r => r.metrics?.reply ?? 1e9, render: r => r.has_data ? <Cell val={r.metrics.reply} delta={r.vs_prev?.reply} suffix="s" lowerBetter /> : <span style={dash}>—</span> },
    { key: 'workload', label: 'Load', align: 'center', sortVal: r => ({ overloaded: 3, healthy: 2, light: 1 }[r.metrics?.workload] || 0), render: r => r.has_data && r.metrics?.workload ? <WorkloadChip s={r.metrics.workload} /> : <span style={dash}>—</span> },
    { key: 'spark', label: '7-day', sortVal: null, render: r => <Sparkline data={r.spark} /> },
    { key: 'tasks', label: 'Tasks', align: 'center', sortVal: r => r.concern, render: r => r.task_count > 0 ? <Chip tone={r.concern >= 12 ? 'bad' : r.concern >= 5 ? 'warn' : 'info'} style={{ fontSize: 10 }}>{r.task_count}</Chip> : <span style={dash}>·</span> },
  ];
  const renderChatterExpand = r => (
    <div style={expandWrap}>
      <div>
        <div style={expandLabel}>Sales by page today</div>
        {r.breakdown?.length ? r.breakdown.map(b => (
          <div key={b.creator_id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0' }}><span>{b.name}</span><b className="mono">{money(b.sales)}</b></div>
        )) : <div style={{ fontSize: 11.5, color: 'var(--fg-3)' }}>No sales recorded.</div>}
      </div>
      <div><div style={expandLabel}>Open tasks ({r.task_count})</div><TaskList tasks={r.tasks} /></div>
    </div>
  );

  const pageCols = [
    { key: 'name', label: 'Page', sortVal: r => r.name?.toLowerCase(),
      render: r => <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Avatar name={r.name} size={24} /><span style={{ fontWeight: 600, fontSize: 12.5 }}>{r.name}</span></div> },
    { key: 'daily', label: 'Daily rev', align: 'right', sortVal: r => r.metrics?.revenue_net ?? -1,
      render: r => <Cell val={r.metrics?.revenue_net} delta={(r.metrics?.revenue_net != null && r.metrics?.revenue_baseline_net != null) ? r.metrics.revenue_net - r.metrics.revenue_baseline_net : null} money /> },
    { key: 'wk', label: '7-day rev', align: 'right', sortVal: r => r.metrics?.revenue_7d ?? -1,
      render: r => <Cell val={r.metrics?.revenue_7d} delta={(r.metrics?.revenue_7d != null && r.metrics?.revenue_7d_prior != null) ? r.metrics.revenue_7d - r.metrics.revenue_7d_prior : null} money /> },
    { key: 'ratio', label: 'Ratio', align: 'right', sortVal: r => r.metrics?.ratio ?? -1,
      render: r => <span style={{ fontWeight: 700, fontSize: 13, color: r.metrics?.ratio == null ? 'var(--fg-4)' : r.metrics.ratio >= 5 ? '#4ade80' : r.metrics.ratio >= 3 ? '#fbbf24' : '#f87171' }}>{r.metrics?.ratio != null ? Number(r.metrics.ratio).toFixed(1) : '—'}</span> },
    { key: 'ltv', label: 'LTV', align: 'right', sortVal: r => r.metrics?.ltv_7day ?? -1, render: r => <span style={{ fontSize: 13, color: 'var(--fg-2)' }}>{r.metrics?.ltv_7day != null ? money(r.metrics.ltv_7day) : '—'}</span> },
    { key: 'worked', label: 'Worked by', sortVal: r => r.chatters?.length || 0, render: r => r.chatters?.length
      ? <div style={{ display: 'flex', alignItems: 'center' }}>{r.chatters.slice(0, 4).map((c, i) => <span key={c.chatter_id} title={`${c.name} · ${money(c.sales)}`} style={{ marginLeft: i ? -6 : 0, border: '1.5px solid var(--bg-1)', borderRadius: '50%', display: 'inline-flex' }}><Avatar name={c.name} size={20} /></span>)}{r.chatters.length > 4 && <span style={{ fontSize: 10, color: 'var(--fg-3)', marginLeft: 4 }}>+{r.chatters.length - 4}</span>}</div>
      : <span style={dash}>—</span> },
    { key: 'spark', label: '7-day', sortVal: null, render: r => <Sparkline data={r.spark} color="#4ade80" /> },
    { key: 'tasks', label: 'Tasks', align: 'center', sortVal: r => r.concern, render: r => r.task_count > 0 ? <Chip tone={r.concern >= 12 ? 'bad' : r.concern >= 5 ? 'warn' : 'info'} style={{ fontSize: 10 }}>{r.task_count}</Chip> : <span style={dash}>·</span> },
  ];
  const renderPageExpand = r => (
    <div style={expandWrap}>
      <div>
        <div style={expandLabel}>Chatters on this page today</div>
        {r.chatters?.length ? r.chatters.map(c => (
          <div key={c.chatter_id} onClick={() => navigate(`/chatters/${c.chatter_id}`)} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0', cursor: 'pointer' }}><span style={{ color: 'var(--indigo-bright)' }}>{c.name}</span><b className="mono">{money(c.sales)}</b></div>
        )) : <div style={{ fontSize: 11.5, color: 'var(--fg-3)' }}>No chatter sales recorded.</div>}
      </div>
      <div><div style={expandLabel}>Open tasks ({r.task_count})</div><TaskList tasks={r.tasks} /></div>
    </div>
  );

  return (
    <div className="animate-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 21, fontWeight: 700 }}>{greet}, {user?.name?.split(' ')[0]}.</h1>
          <p style={{ fontSize: 12.5, color: 'var(--fg-2)', marginTop: 3 }}>Team overview for {date}. <b style={{ cursor: 'pointer', color: 'var(--indigo-bright)' }} onClick={() => navigate('/tasks')}>Tasks →</b></p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="date" value={date} onChange={e => { setDate(e.target.value); load(e.target.value); }} style={inputStyle} />
          {dayStatus?.ready && (
            <button onClick={createDailyTasks} disabled={generating} style={{ ...primary, opacity: generating ? 0.6 : 1 }}
              title="Both files are uploaded — recompute metrics, run the AI report, and build the tasks in one go">
              {progress ? 'Working…' : '✨ Create daily tasks'}
            </button>
          )}
          <button onClick={generate} disabled={generating} style={{ ...primary, opacity: generating ? 0.6 : 1 }}>{generating && !progress ? 'Building…' : 'Build report & tasks'}</button>
        </div>
      </div>

      {progress && (
        <div style={{ ...panel, padding: '12px 16px', marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--fg-2)', marginBottom: 6 }}>
            <span>{progress.stage === 'calc' ? 'Recalculating metrics…'
              : progress.stage === 'build' ? 'Building & ranking tasks…'
                : `Analysing chatters… ${progress.done}/${progress.total}${progress.current ? ` · ${progress.current}` : ''}`}</span>
            {progress.total ? <span>{Math.round((progress.done / progress.total) * 100)}%</span> : null}
          </div>
          <div style={{ height: 6, background: 'var(--bg-3)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', background: 'var(--indigo)', transition: 'width 0.3s',
              width: progress.stage === 'calc' ? '8%' : progress.stage === 'build' ? '96%' : `${progress.total ? (progress.done / progress.total) * 90 + 5 : 5}%` }} />
          </div>
        </div>
      )}

      {loading ? <div style={{ paddingTop: 60, textAlign: 'center', color: 'var(--fg-3)' }}>Loading…</div>
        : !hasData ? (
          <div style={{ ...panel, padding: '44px 24px', textAlign: 'center', marginTop: 24 }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>📊</div>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Nothing to show for {date} yet</div>
            <p style={{ fontSize: 13, color: 'var(--fg-2)', marginBottom: 18 }}>Run the daily workflow and the team overview appears here:</p>
            <div style={{ maxWidth: 480, margin: '0 auto', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                ['1', <>Upload the <b>Message Dashboard</b> and <b>Creator Statistics</b> spreadsheets from Infloww.</>, '/reports', 'Go to Reports →'],
                ['2', <>In <b>Daily Check</b>, press <b>Run daily review</b> — the AI analyses every chatter. <span style={{ color: 'var(--fg-3)' }}>(Run the <b>creator review</b> once a week.)</span></>, '/daily', 'Go to Daily Check →'],
                ['3', <>Come back here and press <b>Build report & tasks</b> to build & rank the tasks and see the full overview.</>, null, null],
              ].map(([n, text, link, cta]) => (
                <div key={n} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 12.5 }}>
                  <span style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--indigo-soft)', color: 'var(--indigo-bright)', fontWeight: 700, fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>{n}</span>
                  <span style={{ color: 'var(--fg-1)', flex: 1, lineHeight: 1.5 }}>{text}{link && <> <b onClick={() => navigate(link)} style={{ cursor: 'pointer', color: 'var(--indigo-bright)' }}>{cta}</b></>}</span>
                </div>
              ))}
            </div>
            <button onClick={generate} disabled={generating} style={{ ...primary, padding: '10px 18px', fontSize: 13, marginTop: 22 }}>{generating ? 'Building…' : 'Build report & tasks'}</button>
          </div>
        ) : (
          <>
            {/* donut + AI review */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
              <div style={{ ...panel, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 14, minWidth: 230 }}>
                <Donut counts={tc} />
                <div style={{ fontSize: 11.5, lineHeight: 1.7 }}>
                  <div><b style={{ color: '#4ade80' }}>{tc.completed}</b> done</div>
                  <div><b style={{ color: '#60a5fa' }}>{tc.taken}</b> in progress</div>
                  <div><b style={{ color: 'var(--fg-1)' }}>{tc.open}</b> to do</div>
                  <div style={{ color: 'var(--fg-3)' }}>{tc.dismissed} dismissed</div>
                </div>
              </div>
              <div style={{ ...panel, padding: '12px 14px', flex: 1, minWidth: 260 }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: '#a78bfa', marginBottom: 5 }}>Today's review · AI</div>
                {data.day_review
                  ? <p style={{ fontSize: 12.5, color: 'var(--fg-1)', lineHeight: 1.55, margin: 0 }}>{data.day_review}</p>
                  : <p style={{ fontSize: 12, color: 'var(--fg-3)', margin: 0 }}>Press <b>Build report & tasks</b> for the AI summary + task queue.</p>}
              </div>
            </div>

            {/* team totals strip */}
            {tt && (
              <div style={{ ...panel, display: 'flex', gap: 0, marginBottom: 16, overflow: 'hidden' }}>
                {[
                  { l: 'Team sales today', v: money(tt.sales), d: tt.sales_vs_prev_pct, suffix: '%' },
                  { l: 'PPVs sent', v: tt.ppvs?.toLocaleString() },
                  { l: 'Messages', v: tt.messages?.toLocaleString() },
                  { l: 'Avg unlock', v: `${tt.unlock_avg}%` },
                  { l: 'Working today', v: `${tt.working}/${tt.total}` },
                ].map((s, i) => (
                  <div key={i} style={{ flex: 1, padding: '12px 16px', borderLeft: i ? '1px solid var(--border)' : 'none' }}>
                    <div style={{ fontSize: 10.5, color: 'var(--fg-3)', marginBottom: 3 }}>{s.l}</div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                      <span style={{ fontSize: 18, fontWeight: 700 }}>{s.v}</span>
                      {s.d != null && <Delta v={s.d} suffix={s.suffix} />}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* chatters table */}
            <div style={{ fontSize: 13, fontWeight: 700, margin: '4px 2px 8px' }}>Chatters <span style={{ color: 'var(--fg-3)', fontWeight: 400 }}>· sorted by concern · click a header to re-sort, ▸ to expand</span></div>
            <div style={{ marginBottom: 22 }}>
              <DataTable rows={data.chatters || []} columns={chatterCols} getKey={r => r.chatter_id} renderExpand={renderChatterExpand} />
            </div>

            {/* pages table */}
            <div style={{ fontSize: 13, fontWeight: 700, margin: '4px 2px 8px' }}>Pages <span style={{ color: 'var(--fg-3)', fontWeight: 400 }}>· sorted by biggest money drop</span></div>
            <DataTable rows={data.pages || []} columns={pageCols} getKey={r => r.creator_id} renderExpand={renderPageExpand} />
          </>
        )}
    </div>
  );
}

const inputStyle = { background: 'var(--bg-2)', border: '1px solid var(--border)', color: 'var(--fg-0)', borderRadius: 'var(--r-btn)', padding: '7px 10px', fontSize: 12.5, fontFamily: 'var(--ff-sans)' };
const primary = { background: 'var(--indigo)', color: '#fff', border: 'none', cursor: 'pointer', borderRadius: 'var(--r-btn)', padding: '8px 14px', fontSize: 12.5, fontWeight: 700 };
const panel = { background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 'var(--r-panel)' };
const dash = { color: 'var(--fg-4)', fontSize: 12 };
