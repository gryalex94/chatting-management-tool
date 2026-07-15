import { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../../services/api';
import Chip from '../../components/shared/Chip';
import Avatar from '../../components/shared/Avatar';
import { fmtSentAt, areaMeta } from '../../utils/taskMeta';

const yesterday = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
};

const SEV_TONE = { critical: 'bad', high: 'bad', medium: 'warn', low: 'info' };
const WORKLOAD_TONE = { overloaded: 'warn', underperforming: 'bad', healthy: 'good', light: 'info' };
const TIER_TONE = { new_sub: 'purple', whale: 'good', spender: 'info', low: 'neutral', new: 'neutral' };
const TIER_LABEL = { new_sub: 'NEW SUB', whale: 'whale', spender: 'spender', low: 'low', new: '-' };
const PUNCT_TONE = { late: 'bad', early: 'info', on_time: 'good', no_shift: 'neutral', no_activity: 'neutral' };

function copy(text) {
  try { navigator.clipboard?.writeText(text); } catch { /* ignore */ }
}

// "2026-06-28" -> "28 Jun"; a date list -> { range:"20 Jun - 28 Jun", count, missing:[...] }
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dM = (iso) => { const [, mo, d] = String(iso).split('-').map(Number); return `${d} ${MON[mo - 1]}`; };
function fmtRange(dates) {
  if (!dates || !dates.length) return null;
  const s = [...dates].sort();
  const first = s[0], last = s[s.length - 1];
  const range = first === last ? dM(first) : `${dM(first)} - ${dM(last)}`;
  const have = new Set(s);
  const missing = [];
  for (let t = Date.parse(first + 'T00:00:00Z'), end = Date.parse(last + 'T00:00:00Z'); t <= end; t += 86400000) {
    const iso = new Date(t).toISOString().slice(0, 10);
    if (!have.has(iso)) missing.push(dM(iso));
  }
  return { range, count: s.length, missing };
}

// Compact snapshot of a chatter's calculated facts, stored alongside the AI
// report so it's self-contained for the later Opus correlation layer.
function chatterFacts(c) {
  return {
    workload_status: c.workload_status || null,
    reply_time_avg_seconds: c.reply_time_avg_seconds ?? null,
    total_messages: c.total_messages ?? null,
    pages: (c.pages || []).length,
    punctuality: c.punctuality?.label || c.punctuality?.state || null,
  };
}

// Run `worker` over items with a fixed number of concurrent runners.
async function pool(items, concurrency, worker) {
  let i = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (i < items.length) { const idx = i++; await worker(items[idx]); }
  });
  await Promise.all(runners);
}

export default function DailyCheckPage() {
  const [date, setDate] = useState(yesterday());
  const [tab, setTab] = useState('chatters');
  const [pageFilter, setPageFilter] = useState('all');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [hideClean, setHideClean] = useState(false);
  const [progress, setProgress] = useState(null);       // workflow progress bar state
  const [reviewEvals, setReviewEvals] = useState({});   // chatter_id -> { compliance, ... }
  const [creatorEvals, setCreatorEvals] = useState({}); // creator_id -> { creator: ... }

  const run = useCallback(async (d) => {
    setLoading(true); setError(null); setResult(null); setStatus('Computing daily check...');
    try {
      const { data } = await api.post('/api/daily-check/run', { report_date: d });
      setResult(data);
      setStatus(`Done - ${data.total_flags} issues - ${data.chatters?.length || 0} chatters - ${data.pages?.length || 0} pages`);
      // Load any stored AI evaluations for this day so badges show without expanding.
      try {
        const { data: ev } = await api.get('/api/daily-check/evaluations-all', { params: { report_date: d } });
        const map = {}, cmap = {};
        (ev.evaluations || []).forEach(e => {
          if (e.creator_id) (cmap[e.creator_id] ||= {})[e.eval_type] = e;
          else if (e.chatter_id) (map[e.chatter_id] ||= {})[e.eval_type] = e;
        });
        setReviewEvals(map);
        setCreatorEvals(cmap);
      } catch { /* ignore */ }
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to run daily check');
      setStatus('');
    } finally {
      setLoading(false);
    }
  }, []);

  // Reload whenever the selected date changes, so a past date's saved daily check
  // (flags + stored AI evaluations) can be viewed — not just the date opened on mount.
  useEffect(() => { run(date); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [date]);

  // The morning workflow: recompute everything → evaluate every chatter for
  // compliance/work-ethic, with a live progress bar. Runs the AI a few chatters
  // at a time so it finishes in a couple of minutes. Documents are uploaded
  // separately on the Uploads page.
  // Daily review — recompute + evaluate work ethic for each chatter.
  const runDailyReview = async () => {
    setError(null); setReviewEvals({});
    try {
      setProgress({ flow: 'daily', stage: 'calc', done: 0, total: 0 });
      const { data } = await api.post('/api/daily-check/run', { report_date: date, recompute: true });
      setResult(data);

      const chatters = data.chatters || [];
      setProgress({ flow: 'daily', stage: 'evaluate', done: 0, total: chatters.length, current: '' });
      let errors = 0;
      await pool(chatters, 3, async (c) => {
        setProgress(p => ({ ...p, current: c.chatter_name }));
        try {
          const { data: ev } = await api.post('/api/daily-check/evaluate', {
            chatter_id: c.chatter_id, report_date: date, eval_type: 'compliance', model: 'sonnet', prompt_version: 'A',
            metrics: chatterFacts(c),
          });
          if (ev.ok) setReviewEvals(m => ({ ...m, [c.chatter_id]: { ...(m[c.chatter_id] || {}), compliance: ev } }));
          else errors++;
        } catch { errors++; }
        setProgress(p => ({ ...p, done: p.done + 1 }));
      });

      setProgress({ flow: 'daily', stage: 'done', errorCount: errors });
      setStatus(`Reviewed - ${data.total_flags} calculated issues - ${chatters.length} chatters evaluated`);
    } catch (err) {
      setProgress({ flow: 'daily', stage: 'error', message: err?.response?.data?.error || 'Daily review failed' });
    }
  };

  // Creator review — the in-depth page analysis. Run weekly (not daily). Results
  // persist, so this stays available until you re-run it.
  const runCreatorReview = async () => {
    setError(null); setCreatorEvals({});
    try {
      let data = result;
      if (!data) {
        setProgress({ flow: 'creator', stage: 'calc', done: 0, total: 0 });
        const r = await api.post('/api/daily-check/run', { report_date: date });
        data = r.data; setResult(data);
      }
      const pages = data.pages || [];
      setProgress({ flow: 'creator', stage: 'creators', done: 0, total: pages.length, current: '' });
      let errors = 0;
      await pool(pages, 3, async (pg) => {
        setProgress(p => ({ ...p, current: pg.creator_name }));
        try {
          const { data: ev } = await api.post('/api/daily-check/evaluate', {
            eval_type: 'creator', creator_id: pg.creator_id, creator_name: pg.creator_name, report_date: date,
            metrics: pg.metrics, flags: (pg.flags || []).map(f => ({ severity: f.severity, text: f.evidence || f.flag_type })),
            model: 'sonnet',
          });
          if (ev.ok) setCreatorEvals(m => ({ ...m, [pg.creator_id]: { ...(m[pg.creator_id] || {}), creator: ev } }));
          else errors++;
        } catch { errors++; }
        setProgress(p => ({ ...p, done: p.done + 1 }));
      });
      setProgress({ flow: 'creator', stage: 'done', errorCount: errors });
      setStatus(`Creator review - ${pages.length} pages analysed`);
    } catch (err) {
      setProgress({ flow: 'creator', stage: 'error', message: err?.response?.data?.error || 'Creator review failed' });
    }
  };

  const setFlagStatus = async (flag, s) => {
    try {
      await api.patch(`/api/daily-check/flag/${flag.id}`, { status: s });
      flag.status = s;
      setResult(r => ({ ...r }));
    } catch { /* ignore */ }
  };

  const pageOptions = useMemo(() => {
    if (!result) return [];
    return (result.pages || []).map(p => ({ id: p.creator_id, name: p.creator_name }));
  }, [result]);

  // creator_id -> name, so per-sub incidents can show which page the fan was on.
  const creatorNames = useMemo(() => {
    const map = {};
    (result?.pages || []).forEach(p => { map[p.creator_id] = p.creator_name; });
    return map;
  }, [result]);

  return (
    <div className="animate-in">
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 16, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Daily Check</h1>
          <p style={{ fontSize: 13, color: 'var(--fg-2)' }}>Morning review - problems first.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} />
          <select value={pageFilter} onChange={e => setPageFilter(e.target.value)} style={inputStyle}>
            <option value="all">All pages</option>
            {pageOptions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button onClick={() => run(date)} disabled={loading || !!progress} title="Recompute the numbers from the uploaded reports — no AI" style={{ ...ghostBtn, padding: '8px 14px', fontSize: 12.5, opacity: (loading || progress) ? 0.6 : 1 }}>
            {loading ? 'Running...' : 'Recalculate metrics'}
          </button>
        </div>
      </div>

      {/* Reviews — run on documents already uploaded (Uploads page). */}
      {(() => {
        const busy = !!progress && progress.stage !== 'done' && progress.stage !== 'error';
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
            <button onClick={runDailyReview} disabled={busy}
              style={{ ...btnStyle, padding: '9px 18px', opacity: busy ? 0.6 : 1 }}>
              Run AI analysis
            </button>
            <button onClick={runCreatorReview} disabled={busy}
              style={{ ...ghostBtn, padding: '9px 16px', fontSize: 12.5, opacity: busy ? 0.6 : 1 }}>
              Run creator analysis
            </button>
            <span style={{ fontSize: 11.5, color: 'var(--fg-4)' }}>
              AI analysis = work-ethic check per chatter. Creator analysis = in-depth page analysis (run weekly). Then press <b>Build report &amp; tasks</b> on Home.
            </span>
          </div>
        );
      })()}

      <ReviewProgress progress={progress} onClose={() => setProgress(null)} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, fontSize: 12.5,
        color: loading ? 'var(--fg-2)' : 'var(--fg-3)' }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
          background: loading ? '#fbbf24' : (error ? '#f87171' : '#4ade80') }} />
        {error ? <span style={{ color: '#f87171' }}>{error}</span> : <span>{status || 'Idle'}</span>}
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid var(--border)' }}>
        {['chatters', 'creators'].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: '8px 14px', fontSize: 13.5,
            fontWeight: tab === t ? 700 : 500, color: tab === t ? 'var(--fg-0)' : 'var(--fg-3)',
            borderBottom: tab === t ? '2px solid var(--indigo)' : '2px solid transparent', marginBottom: -1,
          }}>
            {t === 'chatters' ? 'Chatters' : 'Creators'}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        {tab === 'chatters' && result && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--fg-3)', cursor: 'pointer' }}>
            <input type="checkbox" checked={hideClean} onChange={e => setHideClean(e.target.checked)} />
            Hide clean
          </label>
        )}
      </div>

      {loading && !result && <Empty text="Running the daily check..." />}

      {result && tab === 'chatters' && (
        <ChattersTab result={result} pageFilter={pageFilter} hideClean={hideClean}
          date={date} setFlagStatus={setFlagStatus} creatorNames={creatorNames} reviewEvals={reviewEvals} />
      )}
      {result && tab === 'creators' && (
        <CreatorsTab result={result} pageFilter={pageFilter} setFlagStatus={setFlagStatus}
          creatorNames={creatorNames} date={date} creatorEvals={creatorEvals} />
      )}
    </div>
  );
}

// Big workflow progress bar shown while a review runs (daily or creator).
function ReviewProgress({ progress, onClose }) {
  if (!progress) return null;
  const { stage } = progress;
  const flow = progress.flow || 'daily';
  const noun = flow === 'creator' ? 'Creator review' : 'Daily review';

  if (stage === 'error') {
    return (
      <div style={{ ...progressPanel, borderColor: '#f87171' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#f87171', fontWeight: 700, fontSize: 13.5 }}>{noun} failed</span>
          <button onClick={onClose} style={ghostBtn}>Dismiss</button>
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--fg-2)', marginTop: 6 }}>{progress.message}</div>
      </div>
    );
  }

  const steps = flow === 'creator'
    ? [{ key: 'creators', label: 'Analyse each creator page' }]
    : [
        { key: 'calc', label: 'Compute metrics & acknowledge chatters' },
        { key: 'evaluate', label: 'Evaluate work ethic for each chatter' },
      ];
  const order = [...steps.map(s => s.key), 'done'];
  const curIdx = order.indexOf(stage);

  let pct;
  if (stage === 'done') pct = 100;
  else if (flow === 'creator') pct = progress.total ? Math.max(5, 100 * (progress.done / progress.total)) : 5;
  else if (stage === 'evaluate') pct = progress.total ? 15 + 85 * (progress.done / progress.total) : 15;
  else pct = 10; // calc

  const done = stage === 'done';
  return (
    <div style={progressPanel}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontWeight: 700, fontSize: 14 }}>
          {done ? `✓ ${noun} complete` : `${noun} in progress...`}
        </span>
        {done && <button onClick={onClose} style={ghostBtn}>Dismiss</button>}
      </div>

      {/* the bar */}
      <div style={{ height: 14, borderRadius: 7, background: 'var(--bg-3)', overflow: 'hidden', marginBottom: 12 }}>
        <div style={{ height: '100%', width: `${pct}%`, borderRadius: 7,
          background: done ? '#4ade80' : 'var(--indigo)', transition: 'width .4s ease' }} />
      </div>

      {/* step checklist */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {steps.map((s, i) => {
          const stepDone = done || i < curIdx;
          const active = !done && i === curIdx;
          return (
            <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5,
              color: stepDone ? 'var(--fg-1)' : active ? 'var(--fg-0)' : 'var(--fg-4)' }}>
              <span style={{ width: 16 }}>{stepDone ? '✓' : active ? '⟳' : '○'}</span>
              <span style={{ fontWeight: active ? 700 : 500 }}>{s.label}</span>
              {(s.key === 'evaluate' || s.key === 'creators') && active && progress.total > 0 && (
                <span style={{ color: 'var(--fg-3)' }}>
                  — {progress.done}/{progress.total}{progress.current ? ` (${progress.current})` : ''}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {done && progress.errorCount > 0 && (
        <div style={{ fontSize: 11.5, color: 'var(--fg-3)', marginTop: 8 }}>
          {progress.errorCount} chatter{progress.errorCount === 1 ? '' : 's'} had no messages / could not be evaluated.
        </div>
      )}
    </div>
  );
}

function ChattersTab({ result, pageFilter, hideClean, date, setFlagStatus, creatorNames, reviewEvals }) {
  let chatters = result.chatters || [];
  if (pageFilter !== 'all') chatters = chatters.filter(c => c.pages.some(p => p.creator_id === pageFilter));
  if (hideClean) chatters = chatters.filter(c => c.has_issues);
  if (!chatters.length) return <Empty text="No chatters match." />;
  return chatters.map(c => <ChatterCard key={c.chatter_id} c={c} date={date} setFlagStatus={setFlagStatus}
    creatorNames={creatorNames} seed={reviewEvals?.[c.chatter_id]} />);
}

function ChatterCard({ c, date, setFlagStatus, creatorNames, seed }) {
  const [open, setOpen] = useState(false); // hidden by default; the badges give the at-a-glance signal
  const [evals, setEvals] = useState(seed || {}); // eval_type -> result (seeded / stored / fresh)
  const [aiLoading, setAiLoading] = useState(null); // eval_type currently running
  const [storedLoaded, setStoredLoaded] = useState(false);

  // When the batch review fills in this chatter's result, merge it in.
  useEffect(() => { if (seed) setEvals(e => ({ ...seed, ...e })); }, [seed]);

  // On first expand, load any previously-filed results (free, no AI call). Don't
  // overwrite anything already in memory (seed / a fresh run).
  useEffect(() => {
    if (!open || storedLoaded) return;
    setStoredLoaded(true);
    api.get('/api/daily-check/evaluations', { params: { chatter_id: c.chatter_id, report_date: date } })
      .then(({ data }) => {
        const map = {};
        (data.evaluations || []).forEach(e => { map[e.eval_type] = e; });
        setEvals(e => ({ ...map, ...e }));
      }).catch(() => {});
  }, [open]); // eslint-disable-line

  // Collapsed at-a-glance badge for the compliance analysis (if computed).
  const comp = evals.compliance?.evaluation;
  const compIssues = comp?.issues || [];
  const compCritical = compIssues.filter(i => i.severity === 'critical').length;

  const runAnalysis = async (evalType, extra) => {
    setAiLoading(evalType);
    try {
      const { data } = await api.post('/api/daily-check/evaluate', {
        chatter_id: c.chatter_id, report_date: date, eval_type: evalType, metrics: chatterFacts(c), ...extra,
      });
      setEvals(e => ({ ...e, [evalType]: data.ok ? data : { error: data.reason || 'No evaluation' } }));
    } catch (err) {
      setEvals(e => ({ ...e, [evalType]: { error: err?.response?.data?.error || 'Evaluation failed' } }));
    } finally { setAiLoading(null); }
  };

  const p = c.punctuality || {};
  return (
    <div style={cardStyle}>
      <div onClick={() => setOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
        <Avatar name={c.chatter_name} size={30} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 600, fontSize: 14.5 }}>{c.chatter_name}</span>
            {!c.has_issues && <Chip tone="good" style={{ fontSize: 10 }}>clear</Chip>}
            {c.workload_status && <Chip tone={WORKLOAD_TONE[c.workload_status]} style={{ fontSize: 10 }}>{c.workload_status}</Chip>}
            {p.label && <Chip tone={PUNCT_TONE[p.state]} style={{ fontSize: 10 }}>{p.label}</Chip>}
            {comp && (
              <Chip tone={compCritical ? 'bad' : compIssues.length ? 'warn' : 'good'} style={{ fontSize: 10 }}>
                {compCritical ? `${compCritical} critical` : compIssues.length ? `${compIssues.length} to check` : 'AI clear'}
              </Chip>
            )}
          </div>
          <div style={{ fontSize: 12, color: 'var(--fg-3)', marginTop: 2 }}>
            {c.pages.length} page{c.pages.length === 1 ? '' : 's'}:{' '}
            {c.pages.map((pg, i) => (
              <span key={pg.creator_id}>
                {i > 0 && ', '}
                <span style={{ color: 'var(--fg-0)', fontWeight: 700 }}>{pg.creator_name}</span>
              </span>
            ))}
            {' - '}{c.total_messages} msgs
          </div>
        </div>
        <span style={{ fontSize: 18, color: 'var(--fg-3)' }}>{open ? '-' : '+'}</span>
      </div>

      {open && (
        <div style={{ marginTop: 12 }}>
          <SectionLabel>Calculated issues</SectionLabel>
          {c.flags.length === 0 && (
            <div style={{ fontSize: 12.5, color: 'var(--fg-3)', padding: '6px 0' }}>No calculated issues.</div>
          )}
          {c.flags.map(f => <FlagRow key={f.id || f.flag_type} flag={f} setFlagStatus={setFlagStatus} creatorNames={creatorNames} />)}

          {(p.state === 'late' || p.state === 'early') && (
            <div style={{ fontSize: 11.5, color: 'var(--fg-3)', marginTop: 4 }}>
              {p.label} - shift {p.shift_start}, first message {p.first_message}{' '}
              <span style={{ color: 'var(--fg-4)' }}>(inferred from first message, not a login record)</span>
            </div>
          )}

          <div style={{ marginTop: 14 }}>
            <SectionLabel ai>AI analysis for compliance and work ethic</SectionLabel>
            <AIAnalysis result={evals.compliance} loading={aiLoading === 'compliance'} kind="compliance"
              onRun={() => runAnalysis('compliance', { model: 'sonnet', prompt_version: 'A' })} />
          </div>
          <div style={{ marginTop: 14 }}>
            <SectionLabel ai>AI analysis for dialogues sales quality</SectionLabel>
            <AIAnalysis result={evals.sales_quality} loading={aiLoading === 'sales_quality'} kind="sales"
              onRun={() => runAnalysis('sales_quality', { model: 'sonnet' })} />
          </div>
        </div>
      )}
    </div>
  );
}

function CreatorsTab({ result, pageFilter, setFlagStatus, creatorNames, date, creatorEvals }) {
  let pages = result.pages || [];
  if (pageFilter !== 'all') pages = pages.filter(p => p.creator_id === pageFilter);
  if (!pages.length) return <Empty text="No pages match." />;
  return pages.map(p => <CreatorCard key={p.creator_id} p={p} setFlagStatus={setFlagStatus}
    creatorNames={creatorNames} date={date} seed={creatorEvals?.[p.creator_id]} />);
}

function CreatorCard({ p, setFlagStatus, creatorNames, date, seed }) {
  const [open, setOpen] = useState(false);
  const m = p.metrics || {};
  const [evals, setEvals] = useState(seed || {});
  const [aiLoading, setAiLoading] = useState(false);
  useEffect(() => { if (seed) setEvals(e => ({ ...seed, ...e })); }, [seed]);

  const runCreatorAI = async () => {
    setAiLoading(true);
    try {
      const { data } = await api.post('/api/daily-check/evaluate', {
        eval_type: 'creator', creator_id: p.creator_id, creator_name: p.creator_name, report_date: date,
        metrics: p.metrics, flags: (p.flags || []).map(f => ({ severity: f.severity, text: f.evidence || f.flag_type })),
        model: 'sonnet',
      });
      setEvals(e => ({ ...e, creator: data.ok ? data : { error: data.reason || 'No evaluation' } }));
    } catch (err) {
      setEvals(e => ({ ...e, creator: { error: err?.response?.data?.error || 'Evaluation failed' } }));
    } finally { setAiLoading(false); }
  };

  const creatorIssues = evals.creator?.evaluation?.issues || [];
  const creatorCritical = creatorIssues.filter(i => i.severity === 'critical' || i.severity === 'high').length;

  return (
    <div style={cardStyle}>
      <div onClick={() => setOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
        <Avatar name={p.creator_name} size={30} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 14.5, color: 'var(--fg-0)' }}>{p.creator_name}</div>
          <div style={{ fontSize: 12, color: 'var(--fg-3)', marginTop: 2 }}>
            {m.ratio != null && <>ratio {Number(m.ratio).toFixed(1)} - </>}
            {m.ltv_7day != null && <>LTV ${Math.round(m.ltv_7day)} - </>}
            {(p.chatters || []).length} chatter{(p.chatters || []).length === 1 ? '' : 's'}
          </div>
        </div>
        {evals.creator?.evaluation && (
          <Chip tone={creatorCritical ? 'bad' : creatorIssues.length ? 'warn' : 'good'} style={{ fontSize: 10 }}>
            {creatorCritical ? `${creatorCritical} to check` : creatorIssues.length ? `${creatorIssues.length} notes` : 'AI healthy'}
          </Chip>
        )}
        {m.ratio != null && <Chip tone={m.ratio >= 5 ? 'good' : m.ratio >= 3 ? 'warn' : 'bad'}>ratio {Number(m.ratio).toFixed(1)}</Chip>}
        <span style={{ fontSize: 18, color: 'var(--fg-3)', marginLeft: 8 }}>{open ? '-' : '+'}</span>
      </div>

      {open && (
        <div style={{ marginTop: 12 }}>
          {m.window_dates && (() => {
            const w = fmtRange(m.window_dates), b = fmtRange(m.baseline_dates);
            const wIncomplete = m.window_dates.length < (m.ltv_window_days || 30) || (w && w.missing.length);
            return (
              <div style={{ fontSize: 11.5, color: 'var(--fg-3)', marginBottom: 10, lineHeight: 1.6 }}>
                <span style={{ fontWeight: 700, color: wIncomplete ? '#f59e0b' : 'var(--fg-2)' }}>
                  Ratio &amp; 7-day LTV: {w?.range} ({w?.count} days)
                </span>
                {w && w.missing.length > 0 && <span style={{ color: '#f59e0b' }}> — {w.missing.join(', ')} missing</span>}
                {b && <><br />Revenue baseline: {b.range} ({b.count} days){b.missing.length > 0 && <span style={{ color: '#f59e0b' }}> — {b.missing.length} missing</span>}</>}
              </div>
            );
          })()}
          <SectionLabel>Calculated issues</SectionLabel>
          {(p.flags || []).map(f => <FlagRow key={f.id || f.flag_type} flag={f} setFlagStatus={setFlagStatus} creatorNames={creatorNames} isPage />)}
          {(p.chatters || []).map(c => c.flags.length > 0 && (
            <div key={c.chatter_id} style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <Avatar name={c.chatter_name} size={20} />
                <span style={{ fontSize: 12.5, fontWeight: 600 }}>{c.chatter_name}</span>
              </div>
              {c.flags.map(f => <FlagRow key={f.id || f.flag_type} flag={f} setFlagStatus={setFlagStatus} creatorNames={creatorNames} />)}
            </div>
          ))}
          {(p.flags || []).length === 0 && !(p.chatters || []).some(c => c.flags.length > 0) && (
            <div style={{ fontSize: 12.5, color: 'var(--fg-3)', padding: '6px 0' }}>No calculated issues on this page.</div>
          )}

          <div style={{ marginTop: 14 }}>
            <SectionLabel ai>AI page analysis</SectionLabel>
            <AIAnalysis result={evals.creator} loading={aiLoading} kind="creator" onRun={runCreatorAI} />
          </div>
        </div>
      )}
    </div>
  );
}

function FlagRow({ flag, setFlagStatus, isPage, creatorNames }) {
  const subs = flag.details?.subs || [];
  const [showSubs, setShowSubs] = useState(false);
  const dismissed = flag.status === 'dismissed';
  const done = flag.status === 'done';

  return (
    <div style={{ background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 'var(--r-card)',
      padding: '10px 12px', marginBottom: 8, opacity: dismissed || done ? 0.5 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, flex: 1, minWidth: 0 }}>
          <Chip tone={SEV_TONE[flag.severity] || 'neutral'} style={{ flexShrink: 0 }}>{flag.severity}</Chip>
          <div style={{ fontSize: 13, color: 'var(--fg-1)', lineHeight: 1.5 }}>{flag.evidence || flag.flag_type}</div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          {subs.length > 0 && (
            <button onClick={() => setShowSubs(s => !s)} style={expandBtn}>
              {showSubs ? 'Collapse' : 'Expand'}
            </button>
          )}
          {!done && !dismissed && <>
            <button onClick={() => setFlagStatus(flag, 'done')} style={ghostBtn}>Done</button>
            <button onClick={() => setFlagStatus(flag, 'dismissed')} style={ghostBtn}>Dismiss</button>
          </>}
          {(done || dismissed) && <button onClick={() => setFlagStatus(flag, 'open')} style={ghostBtn}>Reopen</button>}
        </div>
      </div>
      {showSubs && subs.length > 0 && (
        <div style={{ marginTop: 10, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
          {subs.map((s, i) => <SubRow key={(s.fan_username || s.fan_nickname) + i} sub={s} creatorNames={creatorNames} />)}
        </div>
      )}
    </div>
  );
}

function SubRow({ sub, creatorNames }) {
  const creatorName = sub.creator_id ? (creatorNames?.[sub.creator_id] || null) : null;
  return (
    <div style={{ padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flexWrap: 'wrap' }}>
          <Chip tone={TIER_TONE[sub.tier] || 'neutral'} style={{ fontSize: 10, flexShrink: 0 }}>
            {TIER_LABEL[sub.tier] || sub.tier}{sub.spend ? ` $${Math.round(sub.spend).toLocaleString()}` : ''}
          </Chip>
          <span style={{ fontSize: 12.5, color: 'var(--fg-1)' }}>{sub.fan_nickname}</span>
          {sub.fan_username && (
            <button onClick={() => copy(sub.fan_username)} title="Copy username to search"
              style={{ ...ghostBtn, fontFamily: 'var(--ff-mono)', fontSize: 10.5, padding: '2px 6px' }}>
              {sub.fan_username} copy
            </button>
          )}
          {creatorName && (
            <span title="Page this fan was waiting on"
              style={{ fontSize: 11.5, color: 'var(--fg-0)', fontWeight: 700, flexShrink: 0,
                display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span style={{ color: 'var(--fg-3)', fontWeight: 500 }}>on</span> {creatorName}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          {sub.count > 1 && <span style={{ fontSize: 11, color: 'var(--fg-3)' }}>{sub.count}x</span>}
          <span style={{ fontSize: 12, color: '#f87171', fontWeight: 600 }}>{sub.worst_reply_min}m</span>
          <span style={{ fontSize: 11, color: 'var(--fg-3)' }}>{sub.worst_time}</span>
        </div>
      </div>
      {sub.worst_chatter_message && (
        <div onClick={() => copy(sub.worst_chatter_message)} title="Click to copy - paste into search to find the dialogue"
          style={{ marginTop: 4, fontSize: 11.5, color: 'var(--fg-2)', fontStyle: 'italic',
            background: 'var(--bg-3)', borderRadius: 6, padding: '6px 8px', lineHeight: 1.5, cursor: 'pointer' }}>
          "{sub.worst_chatter_message}" <span style={{ color: 'var(--fg-4)', fontStyle: 'normal' }}>- click to copy</span>
        </div>
      )}
    </div>
  );
}

const SEV_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

function fmtWhen(s) {
  if (!s) return '';
  const d = String(s).slice(0, 10), t = String(s).slice(11, 16);
  return t ? `${d} ${t}` : d;
}

const scoreTone = (n) => n >= 8 ? 'good' : n >= 5 ? 'warn' : 'bad';

// One AI analysis panel (compliance OR sales). Shows the stored/fresh result if
// present, otherwise a Run button. Sales results also carry 1-10 scores.
function AIAnalysis({ result, loading, onRun, kind }) {
  if (loading) return <div style={aiBox}>Reading the conversations...</div>;
  if (!result) return (
    <div style={{ ...aiBox, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
      <span style={{ color: 'var(--fg-3)' }}>
        AI opinion - verify.{' '}
        {kind === 'sales'
          ? 'Grades communication & sales against Rice Media standards.'
          : kind === 'creator'
            ? 'Reads the page metrics + creator report and reports what to look at.'
            : 'Highlights possible issues so you can open the dialogue and judge.'}
      </span>
      <button onClick={onRun} style={{ ...btnStyle, background: 'var(--bg-3)', color: 'var(--fg-0)' }}>Run analysis</button>
    </div>
  );
  if (result.error) return <div style={{ ...aiBox, color: '#f87171' }}>{result.error}</div>;

  const ev = result.evaluation || {};
  const issues = [...(ev.issues || [])].sort(
    (a, b) => (SEV_ORDER[a.severity] ?? 9) - (SEV_ORDER[b.severity] ?? 9));

  return (
    <div style={aiBox}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10.5, color: 'var(--fg-4)' }}>AI opinion - verify in the dialogue</span>
          {ev.communication_score != null && <Chip tone={scoreTone(ev.communication_score)} style={{ fontSize: 10 }}>Communication {ev.communication_score}/10</Chip>}
          {ev.sales_score != null && <Chip tone={scoreTone(ev.sales_score)} style={{ fontSize: 10 }}>Sales {ev.sales_score}/10</Chip>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {result.created_at && <span style={{ fontSize: 10, color: 'var(--fg-4)' }}>analysed {fmtWhen(result.created_at)}</span>}
          <button onClick={onRun} style={ghostBtn}>Re-run</button>
        </div>
      </div>
      {ev.overall && <p style={{ fontSize: 12.5, color: 'var(--fg-1)', lineHeight: 1.6, margin: '0 0 10px' }}>{ev.overall}</p>}
      {issues.length > 0 ? (
        issues.map((s, i) => <IssueRow key={i} issue={s} />)
      ) : (
        <div style={{ fontSize: 12, color: 'var(--fg-3)' }}>Nothing flagged.</div>
      )}
    </div>
  );
}

const spendTone = (n) => n >= 1000 ? 'good' : n >= 100 ? 'info' : 'neutral';

function UserBtn({ username, spend, title, size = 11 }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <button onClick={() => copy(username)} title={title}
        style={{ ...ghostBtn, fontFamily: 'var(--ff-mono)', fontSize: size, padding: '2px 7px' }}>
        {username}
      </button>
      {spend > 0 && <Chip tone={spendTone(spend)} style={{ fontSize: 9.5 }}>${spend.toLocaleString()}</Chip>}
    </span>
  );
}

function IssueRow({ issue }) {
  const u = issue.fan_username || issue.fan;
  return (
    <div style={{ padding: '8px 0', borderTop: '1px solid var(--border)' }}>
      {/* line 1: creator (page) > username > severity + type */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {issue.creator && <span style={{ fontWeight: 800, color: 'var(--fg-0)', fontSize: 12.5 }}>{issue.creator}</span>}
        {u && <UserBtn username={u} spend={issue.spend} title="Copy username to search and open this dialogue" />}
        <Chip tone={SEV_TONE[issue.severity] || 'neutral'} style={{ fontSize: 9.5 }}>{issue.severity || '-'}</Chip>
        {issue.area && (() => { const am = areaMeta(issue.area); return (
          <span style={{ fontSize: 10, fontWeight: 700, color: am.c, background: `${am.c}1f`, borderRadius: 5, padding: '2px 6px', letterSpacing: 0.2 }}>{am.label}</span>
        ); })()}
      </div>
      {/* line 2: the AI's note */}
      <div style={{ fontSize: 12.5, color: 'var(--fg-1)', lineHeight: 1.5, marginTop: 5 }}>{issue.detail}</div>
      {/* other subscribers referenced in the note → clickable usernames */}
      {issue.mentions?.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 5 }}>
          <span style={{ fontSize: 10.5, color: 'var(--fg-4)' }}>also mentioned:</span>
          {issue.mentions.map(mn => (
            <UserBtn key={mn.username} username={mn.username} spend={mn.spend} size={10.5} title={`Copy ${mn.nickname}'s username`} />
          ))}
        </div>
      )}
      {/* line 3: the exact message + when it was sent (click to copy → open the dialogue) */}
      {issue.message && (
        <div onClick={() => copy(issue.message)} title="Click to copy - paste into search to open the exact dialogue"
          style={{ marginTop: 5, fontSize: 11.5, color: 'var(--fg-2)', fontStyle: 'italic',
            background: 'var(--bg-3)', borderRadius: 6, padding: '6px 8px', lineHeight: 1.5, cursor: 'pointer' }}>
          <span style={{ color: 'var(--fg-4)', fontStyle: 'normal' }}>{issue.matched_who === 'fan' ? 'fan' : 'chatter'}{issue.sent_at ? ` · ${fmtSentAt(issue.sent_at)}` : ''}:</span>{' '}
          "{issue.message}" <span style={{ color: 'var(--fg-4)', fontStyle: 'normal' }}>- click to copy</span>
        </div>
      )}
    </div>
  );
}

function SectionLabel({ children, ai }) {
  return (
    <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase',
      color: ai ? '#a78bfa' : 'var(--fg-3)', marginBottom: 6 }}>{children}</div>
  );
}
function Empty({ text }) {
  return <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 'var(--r-panel)',
    padding: 40, textAlign: 'center', color: 'var(--fg-3)', fontSize: 13 }}>{text}</div>;
}

const cardStyle = { background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 'var(--r-panel)', padding: '16px 18px', marginBottom: 12 };
const inputStyle = { background: 'var(--bg-2)', border: '1px solid var(--border)', color: 'var(--fg-0)', borderRadius: 'var(--r-btn)', padding: '8px 10px', fontSize: 13, fontFamily: 'var(--ff-sans)' };
const btnStyle = { background: 'var(--indigo)', color: '#fff', border: 'none', cursor: 'pointer', borderRadius: 'var(--r-btn)', padding: '8px 16px', fontSize: 13, fontWeight: 600 };
const ghostBtn = { background: 'var(--bg-3)', border: '1px solid var(--fg-4)', color: 'var(--fg-1)', borderRadius: 'var(--r-btn)', padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' };
// Expand/Collapse: more prominent so it reads clearly as the press target.
const expandBtn = { background: 'var(--bg-3)', border: '1.5px solid var(--fg-3)', color: 'var(--fg-0)', borderRadius: 'var(--r-btn)', padding: '4px 14px', fontSize: 11.5, fontWeight: 800, letterSpacing: 0.3, cursor: 'pointer', whiteSpace: 'nowrap' };
const aiBox = { background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.22)', borderRadius: 'var(--r-card)', padding: '10px 12px', fontSize: 12.5, color: 'var(--fg-2)' };
const progressPanel = { background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 'var(--r-panel)', padding: '16px 18px', marginBottom: 16 };
