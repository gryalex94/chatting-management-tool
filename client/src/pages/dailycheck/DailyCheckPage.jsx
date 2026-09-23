import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ChevronDown, Circle, CircleCheck, Clock, Copy, Loader2, RefreshCw, RotateCcw, Sparkles, X,
} from 'lucide-react';
import api from '@/services/api';
import { fmtSentAt, areaMeta } from '@/utils/taskMeta';
import { initials } from '@/utils/helpers';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const yesterday = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
};

const WORKLOAD_TONE = { overloaded: 'warn', underperforming: 'bad', healthy: 'good', light: 'info' };
const TIER_TONE = { new_sub: 'purple', whale: 'good', spender: 'info', low: 'neutral', new: 'neutral' };
const TIER_LABEL = { new_sub: 'New sub', whale: 'Whale', spender: 'Spender', low: 'Low', new: '-' };
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

/* ─── Small building blocks ─────────────────────────────────────────────── */

const TONE_CLASS = {
  good: 'border-good/30 bg-good/10 text-good',
  warn: 'border-warn/30 bg-warn/10 text-warn',
  bad: 'border-bad/30 bg-bad/10 text-bad',
  info: 'border-info/30 bg-info/10 text-info',
  purple: 'border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400',
  neutral: 'text-muted-foreground',
};
function ToneBadge({ tone, className, children }) {
  return <Badge variant='outline' className={cn('font-medium', TONE_CLASS[tone] || TONE_CLASS.neutral, className)}>{children}</Badge>;
}

const SEVERITY_CLASS = {
  critical: 'border-bad/40 bg-bad/10 text-bad',
  high: 'border-bad/30 text-bad',
  medium: 'border-warn/40 text-warn',
  low: 'text-muted-foreground',
};
function SeverityBadge({ severity }) {
  return <Badge variant='outline' className={cn('shrink-0 capitalize', SEVERITY_CLASS[severity])}>{severity || '-'}</Badge>;
}

function AreaBadge({ area }) {
  if (!area) return null;
  const am = areaMeta(area);
  return (
    <Badge variant='secondary' className='gap-1.5 font-normal'>
      <span className='size-1.5 rounded-full' style={{ background: am.c }} />{am.label}
    </Badge>
  );
}

function PersonAvatar({ name, small }) {
  return (
    <Avatar className={small ? 'size-6' : 'size-8'}>
      <AvatarFallback className={cn('font-medium', small ? 'text-[10px]' : 'text-xs')}>{initials(name)}</AvatarFallback>
    </Avatar>
  );
}

// A fan's username: click copies it.
function FanChip({ username, title }) {
  if (!username) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type='button' onClick={() => copy(username)}
          className='inline-flex max-w-full items-center gap-1 rounded-md border bg-background px-1.5 py-0.5 font-mono text-xs text-foreground transition-colors hover:bg-accent'>
          <span className='truncate'>{username}</span><Copy className='size-3 shrink-0 opacity-40' />
        </button>
      </TooltipTrigger>
      <TooltipContent>{title || 'Click to copy'}</TooltipContent>
    </Tooltip>
  );
}

const TimeStamp = ({ children }) => (
  <span className='inline-flex items-center gap-1 text-xs font-medium text-link'><Clock className='size-3' />{children}</span>
);

// Quoted message; click copies it so it can be pasted into search.
function QuotedMessage({ message, title, prefix }) {
  return (
    <button type='button' onClick={() => copy(message)} title={title}
      className='mt-1.5 block w-full rounded-md border-l-2 bg-muted/50 px-3 py-2 text-start text-xs leading-relaxed text-muted-foreground transition-colors hover:bg-muted'>
      {prefix && <span className='not-italic'>{prefix}</span>}{prefix && ' '}
      <span className='italic'>“{message}”</span>
      <span className='ms-1.5 whitespace-nowrap opacity-60'>· click to copy</span>
    </button>
  );
}

function SectionLabel({ children, ai }) {
  return (
    <div className='mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground'>
      {ai && <Sparkles className='size-3.5' />}{children}
    </div>
  );
}

function Empty({ text }) {
  return (
    <div className='flex items-center justify-center rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground'>
      {text}
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className='flex flex-col gap-3'>
      {[0, 1, 2, 3].map(i => (
        <div key={i} className='flex items-center gap-3 rounded-lg border bg-card p-4'>
          <Skeleton className='size-8 rounded-full' />
          <div className='flex-1 space-y-2'>
            <div className='flex gap-1.5'><Skeleton className='h-4 w-32' /><Skeleton className='h-4 w-14' /></div>
            <Skeleton className='h-3 w-2/3' />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── Page ──────────────────────────────────────────────────────────────── */

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

  const busy = !!progress && progress.stage !== 'done' && progress.stage !== 'error';

  return (
    <div className='flex flex-col gap-4 sm:gap-6'>
      <div className='flex flex-wrap items-end justify-between gap-3'>
        <div>
          <h2 className='text-2xl font-bold tracking-tight'>Daily check</h2>
          <p className='text-muted-foreground'>Morning review, problems first.</p>
        </div>
        <div className='flex w-full flex-wrap items-center gap-2 sm:w-auto'>
          <Input type='date' value={date} onChange={e => setDate(e.target.value)} aria-label='Report date'
            className='h-9 w-auto dark:scheme-dark' />
          <Select value={pageFilter} onValueChange={setPageFilter}>
            <SelectTrigger className='w-40 sm:w-48' aria-label='Page'><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>All pages</SelectItem>
              {pageOptions.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Tooltip>
            <TooltipTrigger asChild>
              {/* span keeps the tooltip working while the button is disabled */}
              <span className='inline-flex'>
                <Button variant='outline' onClick={() => run(date)} disabled={loading || !!progress}>
                  <RefreshCw className={cn(loading && 'animate-spin')} />
                  {loading ? 'Running...' : 'Recalculate metrics'}
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>Recompute the numbers from the uploaded reports — no AI</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Reviews — run on documents already uploaded (Uploads page). */}
      <div className='flex flex-col gap-3 rounded-lg border bg-card p-4 sm:flex-row sm:items-center'>
        <div className='flex flex-wrap gap-2'>
          <Button onClick={runDailyReview} disabled={busy}><Sparkles />Run AI analysis</Button>
          <Button variant='outline' onClick={runCreatorReview} disabled={busy}>Run creator analysis</Button>
        </div>
        <p className='text-xs leading-relaxed text-muted-foreground sm:ms-2'>
          AI analysis checks each chatter's work ethic. Creator analysis is the in-depth page analysis (run weekly).
          Then press <span className='font-medium text-foreground'>Build report &amp; tasks</span> on Home.
        </p>
      </div>

      <ReviewProgress progress={progress} onClose={() => setProgress(null)} />

      <div className={cn('-mt-1 flex items-center gap-2 text-sm', loading ? 'text-foreground' : 'text-muted-foreground')}>
        <span className={cn('size-2 shrink-0 rounded-full', loading ? 'bg-warn' : error ? 'bg-bad' : 'bg-good')} />
        {error ? <span className='text-bad'>{error}</span> : <span>{status || 'Idle'}</span>}
      </div>

      <div className='flex flex-wrap items-center justify-between gap-3'>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value='chatters'>Chatters</TabsTrigger>
            <TabsTrigger value='creators'>Creators</TabsTrigger>
          </TabsList>
        </Tabs>
        {tab === 'chatters' && result && (
          <div className='flex items-center gap-2'>
            <Checkbox id='dc-hide-clean' checked={hideClean} onCheckedChange={v => setHideClean(v === true)} />
            <Label htmlFor='dc-hide-clean' className='cursor-pointer font-normal text-muted-foreground'>Hide clean</Label>
          </div>
        )}
      </div>

      {loading && !result && <ListSkeleton />}

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
      <div className='rounded-lg border border-bad/40 bg-bad/5 p-4'>
        <div className='flex items-center justify-between gap-3'>
          <span className='text-sm font-semibold text-bad'>{noun} failed</span>
          <Button size='sm' variant='ghost' onClick={onClose}><X />Dismiss</Button>
        </div>
        <p className='mt-1 text-sm text-muted-foreground'>{progress.message}</p>
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
    <div className='rounded-lg border bg-card p-4'>
      <div className='mb-3 flex items-center justify-between gap-3'>
        <span className='flex items-center gap-2 text-sm font-semibold'>
          {done ? <CircleCheck className='size-4 text-good' /> : <Loader2 className='size-4 animate-spin text-muted-foreground' />}
          {done ? `${noun} complete` : `${noun} in progress...`}
        </span>
        <div className='flex items-center gap-2'>
          <span className='text-xs tabular-nums text-muted-foreground'>{Math.round(pct)}%</span>
          {done && <Button size='sm' variant='ghost' onClick={onClose}><X />Dismiss</Button>}
        </div>
      </div>

      <Progress value={pct} className={cn('mb-3 h-2.5', done && 'bg-good/20 [&>[data-slot=progress-indicator]]:bg-good')} />

      {/* step checklist */}
      <ul className='flex flex-col gap-1.5'>
        {steps.map((s, i) => {
          const stepDone = done || i < curIdx;
          const active = !done && i === curIdx;
          return (
            <li key={s.key} className={cn('flex flex-wrap items-center gap-2 text-sm',
              stepDone ? 'text-foreground' : active ? 'text-foreground' : 'text-muted-foreground')}>
              {stepDone ? <CircleCheck className='size-4 shrink-0 text-good' />
                : active ? <Loader2 className='size-4 shrink-0 animate-spin' />
                  : <Circle className='size-4 shrink-0 opacity-50' />}
              <span className={cn(active && 'font-medium')}>{s.label}</span>
              {(s.key === 'evaluate' || s.key === 'creators') && active && progress.total > 0 && (
                <span className='text-muted-foreground tabular-nums'>
                  {progress.done}/{progress.total}{progress.current ? ` · ${progress.current}` : ''}
                </span>
              )}
            </li>
          );
        })}
      </ul>

      {done && progress.errorCount > 0 && (
        <p className='mt-3 text-xs text-muted-foreground'>
          {progress.errorCount} chatter{progress.errorCount === 1 ? '' : 's'} had no messages / could not be evaluated.
        </p>
      )}
    </div>
  );
}

function ChattersTab({ result, pageFilter, hideClean, date, setFlagStatus, creatorNames, reviewEvals }) {
  let chatters = result.chatters || [];
  if (pageFilter !== 'all') chatters = chatters.filter(c => c.pages.some(p => String(p.creator_id) === pageFilter));
  if (hideClean) chatters = chatters.filter(c => c.has_issues);
  if (!chatters.length) return <Empty text='No chatters match.' />;
  return (
    <div className='flex flex-col gap-3'>
      {chatters.map(c => <ChatterCard key={c.chatter_id} c={c} date={date} setFlagStatus={setFlagStatus}
        creatorNames={creatorNames} seed={reviewEvals?.[c.chatter_id]} />)}
    </div>
  );
}

// Expandable card shell shared by chatter and creator cards.
function ExpandCard({ open, onOpenChange, header, children }) {
  return (
    <Collapsible open={open} onOpenChange={onOpenChange} className='rounded-lg border bg-card'>
      <CollapsibleTrigger asChild>
        <button type='button' className='flex w-full items-center gap-3 rounded-lg p-4 text-start transition-colors hover:bg-muted/40'>
          {header}
          <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className='flex flex-col gap-5 border-t p-4'>{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
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
    <ExpandCard open={open} onOpenChange={setOpen} header={<>
      <PersonAvatar name={c.chatter_name} />
      <div className='min-w-0 flex-1'>
        <div className='flex flex-wrap items-center gap-1.5'>
          <span className='me-1 font-semibold'>{c.chatter_name}</span>
          {!c.has_issues && <ToneBadge tone='good'>Clear</ToneBadge>}
          {c.workload_status && <ToneBadge tone={WORKLOAD_TONE[c.workload_status]} className='capitalize'>{c.workload_status}</ToneBadge>}
          {p.label && <ToneBadge tone={PUNCT_TONE[p.state]}>{p.label}</ToneBadge>}
          {comp && (
            <ToneBadge tone={compCritical ? 'bad' : compIssues.length ? 'warn' : 'good'}>
              {compCritical ? `${compCritical} critical` : compIssues.length ? `${compIssues.length} to check` : 'AI clear'}
            </ToneBadge>
          )}
        </div>
        <div className='mt-1 text-sm text-muted-foreground'>
          {c.pages.length} page{c.pages.length === 1 ? '' : 's'}:{' '}
          {c.pages.map((pg, i) => (
            <span key={pg.creator_id}>
              {i > 0 && ', '}
              <span className='font-medium text-foreground'>{pg.creator_name}</span>
            </span>
          ))}
          {' · '}<span className='tabular-nums'>{c.total_messages}</span> msgs
        </div>
      </div>
    </>}>
      <div>
        <SectionLabel>Calculated issues</SectionLabel>
        {c.flags.length === 0 && <p className='text-sm text-muted-foreground'>No calculated issues.</p>}
        <div className='flex flex-col gap-2'>
          {c.flags.map(f => <FlagRow key={f.id || f.flag_type} flag={f} setFlagStatus={setFlagStatus} creatorNames={creatorNames} />)}
        </div>
        {(p.state === 'late' || p.state === 'early') && (
          <p className='mt-2 text-xs text-muted-foreground'>
            {p.label} · shift {p.shift_start}, first message {p.first_message}{' '}
            <span className='opacity-70'>(inferred from first message, not a login record)</span>
          </p>
        )}
      </div>

      <div>
        <SectionLabel ai>AI analysis for compliance and work ethic</SectionLabel>
        <AIAnalysis result={evals.compliance} loading={aiLoading === 'compliance'} kind='compliance'
          onRun={() => runAnalysis('compliance', { model: 'sonnet', prompt_version: 'A' })} />
      </div>
      <div>
        <SectionLabel ai>AI analysis for dialogues sales quality</SectionLabel>
        <AIAnalysis result={evals.sales_quality} loading={aiLoading === 'sales_quality'} kind='sales'
          onRun={() => runAnalysis('sales_quality', { model: 'sonnet' })} />
      </div>
    </ExpandCard>
  );
}

function CreatorsTab({ result, pageFilter, setFlagStatus, creatorNames, date, creatorEvals }) {
  let pages = result.pages || [];
  if (pageFilter !== 'all') pages = pages.filter(p => String(p.creator_id) === pageFilter);
  if (!pages.length) return <Empty text='No pages match.' />;
  return (
    <div className='flex flex-col gap-3'>
      {pages.map(p => <CreatorCard key={p.creator_id} p={p} setFlagStatus={setFlagStatus}
        creatorNames={creatorNames} date={date} seed={creatorEvals?.[p.creator_id]} />)}
    </div>
  );
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
  const chatterCount = (p.chatters || []).length;

  return (
    <ExpandCard open={open} onOpenChange={setOpen} header={<>
      <PersonAvatar name={p.creator_name} />
      <div className='min-w-0 flex-1'>
        <div className='flex flex-wrap items-center gap-1.5'>
          <span className='me-1 font-semibold'>{p.creator_name}</span>
          {evals.creator?.evaluation && (
            <ToneBadge tone={creatorCritical ? 'bad' : creatorIssues.length ? 'warn' : 'good'}>
              {creatorCritical ? `${creatorCritical} to check` : creatorIssues.length ? `${creatorIssues.length} notes` : 'AI healthy'}
            </ToneBadge>
          )}
          {m.ratio != null && (
            <ToneBadge tone={m.ratio >= 5 ? 'good' : m.ratio >= 3 ? 'warn' : 'bad'} className='tabular-nums'>
              Ratio {Number(m.ratio).toFixed(1)}
            </ToneBadge>
          )}
        </div>
        <div className='mt-1 text-sm text-muted-foreground tabular-nums'>
          {m.ratio != null && <>ratio {Number(m.ratio).toFixed(1)} · </>}
          {m.ltv_7day != null && <>LTV ${Math.round(m.ltv_7day)} · </>}
          {chatterCount} chatter{chatterCount === 1 ? '' : 's'}
        </div>
      </div>
    </>}>
      {m.window_dates && (() => {
        const w = fmtRange(m.window_dates), b = fmtRange(m.baseline_dates);
        const wIncomplete = m.window_dates.length < (m.ltv_window_days || 30) || (w && w.missing.length);
        return (
          <div className='rounded-md bg-muted/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground'>
            <div>
              <span className={cn('font-medium', wIncomplete ? 'text-warn' : 'text-foreground')}>
                Ratio &amp; 7-day LTV: {w?.range} ({w?.count} days)
              </span>
              {w && w.missing.length > 0 && <span className='text-warn'> — {w.missing.join(', ')} missing</span>}
            </div>
            {b && (
              <div>
                Revenue baseline: {b.range} ({b.count} days)
                {b.missing.length > 0 && <span className='text-warn'> — {b.missing.length} missing</span>}
              </div>
            )}
          </div>
        );
      })()}

      <div>
        <SectionLabel>Calculated issues</SectionLabel>
        <div className='flex flex-col gap-2'>
          {(p.flags || []).map(f => <FlagRow key={f.id || f.flag_type} flag={f} setFlagStatus={setFlagStatus} creatorNames={creatorNames} isPage />)}
        </div>
        {(p.chatters || []).map(c => c.flags.length > 0 && (
          <div key={c.chatter_id} className='mt-3 border-t pt-3'>
            <div className='mb-2 flex items-center gap-2'>
              <PersonAvatar name={c.chatter_name} small />
              <span className='text-sm font-medium'>{c.chatter_name}</span>
            </div>
            <div className='flex flex-col gap-2'>
              {c.flags.map(f => <FlagRow key={f.id || f.flag_type} flag={f} setFlagStatus={setFlagStatus} creatorNames={creatorNames} />)}
            </div>
          </div>
        ))}
        {(p.flags || []).length === 0 && !(p.chatters || []).some(c => c.flags.length > 0) && (
          <p className='text-sm text-muted-foreground'>No calculated issues on this page.</p>
        )}
      </div>

      <div>
        <SectionLabel ai>AI page analysis</SectionLabel>
        <AIAnalysis result={evals.creator} loading={aiLoading} kind='creator' onRun={runCreatorAI} />
      </div>
    </ExpandCard>
  );
}

function FlagRow({ flag, setFlagStatus, creatorNames }) {
  const subs = flag.details?.subs || [];
  const [showSubs, setShowSubs] = useState(false);
  const dismissed = flag.status === 'dismissed';
  const done = flag.status === 'done';

  return (
    <div className={cn('rounded-md border bg-background p-3', (dismissed || done) && 'opacity-50')}>
      <div className='flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3'>
        <div className='flex min-w-0 flex-1 items-start gap-2'>
          <SeverityBadge severity={flag.severity} />
          <p className='min-w-0 text-sm leading-relaxed'>{flag.evidence || flag.flag_type}</p>
        </div>
        <div className='flex shrink-0 flex-wrap items-center gap-1.5'>
          {subs.length > 0 && (
            <Button size='xs' variant='secondary' onClick={() => setShowSubs(s => !s)}>
              <ChevronDown className={cn('transition-transform', showSubs && 'rotate-180')} />
              {showSubs ? 'Collapse' : `Expand (${subs.length})`}
            </Button>
          )}
          {!done && !dismissed && <>
            <Button size='xs' variant='outline' onClick={() => setFlagStatus(flag, 'done')}>Done</Button>
            <Button size='xs' variant='ghost' onClick={() => setFlagStatus(flag, 'dismissed')}>Dismiss</Button>
          </>}
          {(done || dismissed) && (
            <Button size='xs' variant='outline' onClick={() => setFlagStatus(flag, 'open')}><RotateCcw />Reopen</Button>
          )}
        </div>
      </div>
      {showSubs && subs.length > 0 && (
        <div className='mt-3 divide-y border-t'>
          {subs.map((s, i) => <SubRow key={(s.fan_username || s.fan_nickname) + i} sub={s} creatorNames={creatorNames} />)}
        </div>
      )}
    </div>
  );
}

function SubRow({ sub, creatorNames }) {
  const creatorName = sub.creator_id ? (creatorNames?.[sub.creator_id] || null) : null;
  return (
    <div className='py-2.5'>
      <div className='flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5'>
        <div className='flex min-w-0 flex-wrap items-center gap-2'>
          <ToneBadge tone={TIER_TONE[sub.tier] || 'neutral'} className='tabular-nums'>
            {TIER_LABEL[sub.tier] || sub.tier}{sub.spend ? ` $${Math.round(sub.spend).toLocaleString()}` : ''}
          </ToneBadge>
          <span className='text-sm'>{sub.fan_nickname}</span>
          <FanChip username={sub.fan_username} title='Copy username to search' />
          {creatorName && (
            <span title='Page this fan was waiting on' className='text-xs'>
              <span className='text-muted-foreground'>on</span> <span className='font-medium'>{creatorName}</span>
            </span>
          )}
        </div>
        <div className='flex shrink-0 items-center gap-3 tabular-nums'>
          {sub.count > 1 && <span className='text-xs text-muted-foreground'>×{sub.count}</span>}
          <span className='text-xs font-semibold text-bad'>{sub.worst_reply_min}m</span>
          {sub.worst_time && <TimeStamp>{sub.worst_time}</TimeStamp>}
        </div>
      </div>
      {sub.worst_chatter_message && (
        <QuotedMessage message={sub.worst_chatter_message} title='Click to copy - paste into search to find the dialogue' />
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
  const box = 'rounded-md border bg-muted/30 p-3 text-sm';
  if (loading) return (
    <div className={cn(box, 'flex items-center gap-2 text-muted-foreground')}>
      <Loader2 className='size-4 animate-spin' />Reading the conversations...
    </div>
  );
  if (!result) return (
    <div className={cn(box, 'flex flex-wrap items-center justify-between gap-3')}>
      <span className='text-muted-foreground'>
        AI opinion, verify it.{' '}
        {kind === 'sales'
          ? 'Grades communication & sales against Rice Media standards.'
          : kind === 'creator'
            ? 'Reads the page metrics + creator report and reports what to look at.'
            : 'Highlights possible issues so you can open the dialogue and judge.'}
      </span>
      <Button size='sm' variant='outline' onClick={onRun}><Sparkles />Run analysis</Button>
    </div>
  );
  if (result.error) return <div className={cn(box, 'border-bad/30 text-bad')}>{result.error}</div>;

  const ev = result.evaluation || {};
  const issues = [...(ev.issues || [])].sort(
    (a, b) => (SEV_ORDER[a.severity] ?? 9) - (SEV_ORDER[b.severity] ?? 9));

  return (
    <div className={box}>
      <div className='mb-2 flex flex-wrap items-start justify-between gap-2'>
        <div className='flex flex-wrap items-center gap-2'>
          <span className='text-xs text-muted-foreground'>AI opinion, verify in the dialogue</span>
          {ev.communication_score != null && <ToneBadge tone={scoreTone(ev.communication_score)} className='tabular-nums'>Communication {ev.communication_score}/10</ToneBadge>}
          {ev.sales_score != null && <ToneBadge tone={scoreTone(ev.sales_score)} className='tabular-nums'>Sales {ev.sales_score}/10</ToneBadge>}
        </div>
        <div className='flex items-center gap-2'>
          {result.created_at && <span className='text-xs text-muted-foreground tabular-nums'>Analysed {fmtWhen(result.created_at)}</span>}
          <Button size='xs' variant='ghost' onClick={onRun}><RefreshCw />Re-run</Button>
        </div>
      </div>
      {ev.overall && <p className='mb-3 leading-relaxed'>{ev.overall}</p>}
      {issues.length > 0 ? (
        <div className='divide-y border-t'>{issues.map((s, i) => <IssueRow key={i} issue={s} />)}</div>
      ) : (
        <p className='text-xs text-muted-foreground'>Nothing flagged.</p>
      )}
    </div>
  );
}

const spendTone = (n) => n >= 1000 ? 'good' : n >= 100 ? 'info' : 'neutral';

function UserBtn({ username, spend, title }) {
  return (
    <span className='inline-flex max-w-full items-center gap-1'>
      <FanChip username={username} title={title} />
      {spend > 0 && <ToneBadge tone={spendTone(spend)} className='tabular-nums'>${spend.toLocaleString()}</ToneBadge>}
    </span>
  );
}

function IssueRow({ issue }) {
  const u = issue.fan_username || issue.fan;
  return (
    <div className='py-2.5'>
      {/* line 1: creator (page) > username > severity + type */}
      <div className='flex flex-wrap items-center gap-2'>
        {issue.creator && <span className='text-sm font-semibold'>{issue.creator}</span>}
        {u && <UserBtn username={u} spend={issue.spend} title='Copy username to search and open this dialogue' />}
        <SeverityBadge severity={issue.severity} />
        <AreaBadge area={issue.area} />
      </div>
      {/* line 2: the AI's note */}
      <p className='mt-1.5 text-sm leading-relaxed'>{issue.detail}</p>
      {/* other subscribers referenced in the note → clickable usernames */}
      {issue.mentions?.length > 0 && (
        <div className='mt-1.5 flex flex-wrap items-center gap-1.5'>
          <span className='text-xs text-muted-foreground'>Also mentioned:</span>
          {issue.mentions.map(mn => (
            <UserBtn key={mn.username} username={mn.username} spend={mn.spend} title={`Copy ${mn.nickname}'s username`} />
          ))}
        </div>
      )}
      {/* line 3: the exact message + when it was sent (click to copy → open the dialogue) */}
      {issue.message && (
        <QuotedMessage message={issue.message} title='Click to copy - paste into search to open the exact dialogue'
          prefix={<>
            <span className='font-medium'>{issue.matched_who === 'fan' ? 'Fan' : 'Chatter'}</span>
            {issue.sent_at && <span className='text-link'> · {fmtSentAt(issue.sent_at)}</span>}:
          </>} />
      )}
    </div>
  );
}
