import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  AlertTriangle, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, BarChart3, Bookmark, BookmarkCheck,
  Brain, Calendar, Check, ChevronDown, ChevronRight, Clock, Flag, Plus, RotateCcw, Star,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '@/context/AuthContext';
import api from '@/services/api';
import { STATUS_META, initials } from '@/utils/helpers';
import { TIER, fmtSentAt, areaLabel } from '@/utils/taskMeta';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

/* ─── Constants ──────────────────────────────────── */
// Data colours: one per mistake category (drawn as a small bar / dot).
const CATEGORY_COLORS = {
  long_response_time:'#f59e0b', poor_selling_pushy:'#ef4444', poor_selling_soft:'#ef4444',
  missing_notes:'#8b5cf6', afk_issue:'#f97316', script_quality:'#a855f7',
  not_adding_to_lists:'#3b82f6', poor_price_development:'#ef4444', poor_price_negotiation:'#ef4444',
  lack_of_aftercare:'#f59e0b', poor_horny_talk:'#f97316', poor_shift_handover:'#8b5cf6', other:'#6c6c84',
};

// Status dot colours (same values the old --st-* variables held).
const STATUS_DOT = { new: '#ef4444', new_monitoring: '#f97316', developing: '#eab308', experienced: '#22c55e' };

// Golden ratio / unlock rate bands → text colour class.
function goldenColor(val) {
  const v = parseFloat(val) || 0;
  if (v <= 2) return 'text-bad';
  if (v <= 4) return 'text-warn';
  if (v <= 8) return 'text-good';
  if (v <= 10) return 'text-warn';
  return 'text-bad';
}

function unlockColor(val) {
  const v = parseFloat(val) || 0;
  if (v <= 20) return 'text-bad';
  if (v <= 39) return 'text-warn';
  if (v <= 60) return 'text-good';
  if (v <= 80) return 'text-warn';
  return 'text-bad';
}

const sevDot = s => s === 'high' || s === 'critical' ? 'bg-bad' : s === 'medium' ? 'bg-warn' : 'bg-muted-foreground/60';
const categoryLabel = cat => cat?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

/* ─── Small building blocks ──────────────────────── */

// A bordered block with an optional icon + title row on top.
function Panel({ icon: Icon, title, meta, action, className, bodyClassName, children }) {
  return (
    <section className={cn('overflow-hidden rounded-lg border bg-card', className)}>
      <div className='flex flex-wrap items-center gap-x-2 gap-y-1 border-b px-4 py-3'>
        {Icon && <Icon className='size-4 text-muted-foreground' />}
        <h3 className='text-sm font-semibold'>{title}</h3>
        {meta && <span className='text-xs text-muted-foreground'>{meta}</span>}
        {action && <div className='ms-auto flex items-center gap-2'>{action}</div>}
      </div>
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

const EmptyState = ({ children, className }) => (
  <div className={cn('rounded-md border border-dashed px-4 py-6 text-center text-sm text-muted-foreground', className)}>{children}</div>
);

const TimeStamp = ({ children }) => (
  <span className='inline-flex items-center gap-1 font-medium text-link'><Clock className='size-3' />{children}</span>
);

/* ═══ TOP ZONE ═══════════════════════════════════ */

function AIScoreCard({ icon: Icon, label, score, trend, color }) {
  const scoreColor = score >= 7 ? 'text-good' : score >= 5 ? 'text-warn' : score > 0 ? 'text-bad' : 'text-muted-foreground';
  const TrendIcon = trend === 'up' ? ArrowUp : trend === 'down' ? ArrowDown : ArrowRight;
  const trendColor = trend === 'up' ? 'text-good' : trend === 'down' ? 'text-bad' : 'text-muted-foreground';
  return (
    <div className='flex flex-1 items-center gap-3 rounded-lg border bg-card px-4 py-3'>
      <div className='flex size-9 items-center justify-center rounded-md'
        style={{ color, background: `color-mix(in oklch, ${color} 12%, transparent)` }}><Icon className='size-4' /></div>
      <div className='flex-1'>
        <div className='text-xs text-muted-foreground'>{label}</div>
        <div className='flex items-baseline gap-1.5'>
          <span className={cn('text-xl font-bold tabular-nums', scoreColor)}>{score > 0 ? score.toFixed(1) : '—'}</span>
          {score > 0 && <TrendIcon className={cn('size-3.5', trendColor)} />}
        </div>
      </div>
    </div>
  );
}

function AlertsBanner({ alerts }) {
  if (!alerts || alerts.length === 0) return null;
  return (
    <div className='flex flex-col gap-1.5 rounded-lg border border-bad/30 bg-bad/5 px-4 py-3'>
      {alerts.map((a, i) => (
        <div key={i} className={cn('flex items-center gap-2 text-sm', a.severity === 'high' ? 'text-bad' : 'text-warn')}>
          <AlertTriangle className='size-4 shrink-0' />
          <span>{a.message}</span>
        </div>
      ))}
    </div>
  );
}

/* ═══ MIDDLE ZONE ════════════════════════════════ */

function KPI({ label, value, sub, color }) {
  return (
    <div className='bg-card px-4 py-3'>
      <div className='text-xs text-muted-foreground'>{label}</div>
      <div className={cn('mt-1 text-xl font-semibold tabular-nums', color)}>{value}</div>
      {sub && <div className={cn('mt-0.5 text-xs tabular-nums', color || 'text-muted-foreground')}>{sub}</div>}
    </div>
  );
}

function AIDailySummary({ summary, date }) {
  return (
    <Panel icon={Brain} title='AI daily summary' meta={date ? `Compliance check · ${date}` : null} bodyClassName='p-4'>
      {summary
        ? <p className='text-sm leading-relaxed text-foreground/90'>{summary}</p>
        : <p className='text-sm text-muted-foreground'>No compliance summary yet. Run the Daily Check for this chatter to fill it in.</p>}
    </Panel>
  );
}

// Sales/communication quality grader — run on demand. Feeds the two score cards.
function AIQualityPanel({ ev, onRun, running, canRun }) {
  const overall = ev?.evaluation?.overall;
  const issues = ev?.evaluation?.issues || [];
  return (
    <Panel icon={Brain} title='AI analysis of dialogues and sales quality'
      meta={ev?.report_date ? `Last run ${ev.report_date}` : null}
      action={
        <Button size='sm' onClick={onRun} disabled={running || !canRun}>
          {running ? 'Analysing…' : ev ? 'Re-run' : 'Run analysis'}
        </Button>
      }
      bodyClassName='p-4'>
      {!ev ? (
        <EmptyState>Not analysed yet. Run the AI analysis on this chatter's recent dialogues and sales quality.</EmptyState>
      ) : (
        <div className='space-y-3'>
          {overall && <p className='text-sm leading-relaxed text-foreground/90'>{overall}</p>}
          {issues.length === 0 && <p className='text-sm text-muted-foreground'>No strategy deviations found. The chatter followed the playbook.</p>}
          {issues.length > 0 && (
            <div className='space-y-2'>
              <div className='text-sm font-medium'>{issues.length} coaching point{issues.length === 1 ? '' : 's'}</div>
              {issues.map((iss, i) => {
                const who = iss.fan_username || iss.fan || null;
                return (
                  <div key={i} className='flex items-start gap-3 rounded-md border bg-muted/40 px-3 py-2'>
                    <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', sevDot(iss.severity))} />
                    <div className='min-w-0 flex-1 space-y-1'>
                      <div className='text-sm leading-snug'>{iss.detail || iss.title || iss.issue || 'Issue'}</div>
                      {(who || iss.sent_at || iss.area) && (
                        <div className='flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground'>
                          {iss.area && <span>{areaLabel(iss.area)}</span>}
                          {who && <span className='font-medium text-link'>@{who}</span>}
                          {iss.spend != null && <span className='tabular-nums'>${iss.spend} spent</span>}
                          {iss.sent_at && <TimeStamp>{fmtSentAt(iss.sent_at)}</TimeStamp>}
                        </div>
                      )}
                      {iss.message && (
                        <p className='border-l-2 ps-2 text-xs italic leading-snug text-muted-foreground'>“{iss.message}”</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}

function PageContribution({ stats, allStats, timeframe, setTimeframe }) {
  const active = (stats || []).filter(s => (s.messages_sent || 0) > 0 || parseFloat(s.sales) > 0);

  // For 7d/30d, aggregate per page
  let rows = active;
  if (timeframe !== '1d' && allStats) {
    const days = timeframe === '7d' ? 7 : 30;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().split('T')[0];
    const filtered = allStats.filter(s => s.report_date >= cutoffStr && ((s.messages_sent || 0) > 0 || parseFloat(s.sales) > 0));

    const grouped = {};
    filtered.forEach(s => {
      const key = s.creator_name || 'Unknown';
      if (!grouped[key]) grouped[key] = { creator_name: key, sales: 0, messages_sent: 0, fans_chatted: 0, ppvs_sent: 0, ppvs_unlocked: 0, fans_who_spent: 0, days: 0 };
      const g = grouped[key];
      g.sales += parseFloat(s.sales) || 0;
      g.messages_sent += s.messages_sent || 0;
      g.fans_chatted += s.fans_chatted || 0;
      g.ppvs_sent += s.ppvs_sent || 0;
      g.ppvs_unlocked += s.ppvs_unlocked || 0;
      g.fans_who_spent += s.fans_who_spent || 0;
      g.days++;
    });

    rows = Object.values(grouped).map(g => ({
      creator_name: g.creator_name,
      sales: g.sales.toFixed(2),
      messages_sent: g.messages_sent,
      fans_chatted: g.fans_chatted,
      golden_ratio: g.messages_sent > 0 ? ((g.ppvs_sent / g.messages_sent) * 100).toFixed(1) : '0.0',
      unlock_rate: g.ppvs_sent > 0 ? ((g.ppvs_unlocked / g.ppvs_sent) * 100).toFixed(0) : '0',
      fan_cvr: g.fans_chatted > 0 ? ((g.fans_who_spent / g.fans_chatted) * 100).toFixed(0) : '0',
      _days: g.days,
    }));
  }

  if (rows.length === 0) return null;

  return (
    <Panel icon={BarChart3} title='Per-page contribution'
      action={
        <ToggleGroup type='single' variant='outline' size='sm' value={timeframe}
          onValueChange={v => { if (v) setTimeframe(v); }}>
          {['1d', '7d', '30d'].map(tf => <ToggleGroupItem key={tf} value={tf} className='px-2.5 text-xs'>{tf}</ToggleGroupItem>)}
        </ToggleGroup>
      }>
      <Table>
          <TableHeader>
            <TableRow className='bg-muted/40 hover:bg-muted/40'>
              <TableHead className='ps-4'>Page</TableHead>
              <TableHead className='text-right'>Sales</TableHead>
              <TableHead className='text-right'>Messages</TableHead>
              <TableHead className='text-right'>Fans</TableHead>
              <TableHead className='text-right'>Golden ratio</TableHead>
              <TableHead className='text-right'>Unlock</TableHead>
              <TableHead className='pe-4 text-right'>Fan CVR</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.sort((a, b) => parseFloat(b.sales) - parseFloat(a.sales)).map((s, i) => (
              <TableRow key={i}>
                <TableCell className='ps-4 font-medium'>{s.creator_name || '—'}</TableCell>
                <TableCell className='text-right tabular-nums'>${parseFloat(s.sales || 0).toFixed(0)}</TableCell>
                <TableCell className='text-right tabular-nums'>{s.messages_sent || 0}</TableCell>
                <TableCell className='text-right tabular-nums'>{s.fans_chatted || 0}</TableCell>
                <TableCell className={cn('text-right tabular-nums', goldenColor(s.golden_ratio))}>{parseFloat(s.golden_ratio || 0).toFixed(1)}%</TableCell>
                <TableCell className={cn('text-right tabular-nums', unlockColor(s.unlock_rate))}>{parseFloat(s.unlock_rate || 0).toFixed(0)}%</TableCell>
                <TableCell className='pe-4 text-right tabular-nums'>{parseFloat(s.fan_cvr || 0).toFixed(0)}%</TableCell>
              </TableRow>
            ))}
          </TableBody>
      </Table>
    </Panel>
  );
}

/* ═══ BOTTOM ZONE ════════════════════════════════ */

// Build a real CALENDAR series (last N days ending at the latest day with data).
// A missing day = the chatter didn't work that day (a gap), NOT a missing upload.
function buildDailySeries(stats, days) {
  const byDate = {};
  (stats || []).forEach(s => { if (s.report_date) byDate[s.report_date] = (byDate[s.report_date] || 0) + (parseFloat(s.sales) || 0); });
  const dates = Object.keys(byDate).sort();
  if (!dates.length) return [];
  const end = new Date(dates[dates.length - 1] + 'T00:00:00Z');
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(end); d.setUTCDate(d.getUTCDate() - i);
    const ds = d.toISOString().slice(0, 10);
    out.push({ date: ds, sales: ds in byDate ? byDate[ds] : null });   // null = off
  }
  return out;
}

const RANGES = [{ k: 7, l: '7 days' }, { k: 30, l: '30 days' }, { k: 90, l: '90 days' }];

function PerformanceTrend({ stats }) {
  const [range, setRange] = useState(7);
  const [hover, setHover] = useState(null);
  const series = buildDailySeries(stats, range);
  const worked = series.filter(p => p.sales != null);

  if (!worked.length) return (
    <Panel title='Performance trend' bodyClassName='p-4'>
      <EmptyState>No sales data yet.</EmptyState>
    </Panel>
  );

  const W = 520, H = 130, padL = 10, padR = 10, padT = 14, padB = 26;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const maxV = Math.max(...worked.map(p => p.sales), 1);
  const n = series.length;
  const xOf = i => padL + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const yOf = v => padT + innerH - (v / maxV) * innerH;

  // Line segments only across CONSECUTIVE worked days (off days break the line).
  const segments = [];
  let cur = [];
  series.forEach((p, i) => {
    if (p.sales != null) cur.push(`${xOf(i)},${yOf(p.sales)}`);
    else { if (cur.length) segments.push(cur); cur = []; }
  });
  if (cur.length) segments.push(cur);

  const total = worked.reduce((s, p) => s + p.sales, 0);
  const avg = total / worked.length;
  const dM = ds => { const [, m, d] = ds.split('-'); return `${parseInt(d)}/${parseInt(m)}`; };

  return (
    <Panel title='Performance trend'
      action={
        <ToggleGroup type='single' variant='outline' size='sm' value={String(range)}
          onValueChange={v => { if (v) { setRange(Number(v)); setHover(null); } }}>
          {RANGES.map(r => <ToggleGroupItem key={r.k} value={String(r.k)} className='px-2.5 text-xs'>{r.l}</ToggleGroupItem>)}
        </ToggleGroup>
      }
      bodyClassName='p-4'>
      <div className='mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground'>
        <span>Total <b className='font-semibold text-foreground tabular-nums'>${Math.round(total).toLocaleString()}</b></span>
        <span>Average per working day <b className='font-semibold text-foreground tabular-nums'>${Math.round(avg).toLocaleString()}</b></span>
        <span className='tabular-nums'>{worked.length} of {n} days worked</span>
      </div>

      <div className='relative'>
        <svg width='100%' viewBox={`0 0 ${W} ${H}`} className='overflow-visible' onMouseLeave={() => setHover(null)}>
          <defs>
            <linearGradient id='ptgrad' x1='0' y1='0' x2='0' y2='1'>
              <stop offset='0%' stopColor='var(--chart-1)' stopOpacity='0.25' />
              <stop offset='100%' stopColor='var(--chart-1)' stopOpacity='0' />
            </linearGradient>
          </defs>
          {/* line per segment */}
          {segments.map((seg, si) => (
            <g key={si}>
              {seg.length > 1 && <polyline points={seg.join(' ')} fill='none' stroke='var(--chart-1)' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round' />}
            </g>
          ))}
          {/* points: worked = solid, off = hollow on baseline */}
          {series.map((p, i) => p.sales != null ? (
            <circle key={i} cx={xOf(i)} cy={yOf(p.sales)} r={hover === i ? 4.5 : 3} fill='var(--chart-1)' />
          ) : (
            <circle key={i} cx={xOf(i)} cy={padT + innerH} r={2.5} fill='none' stroke='var(--muted-foreground)' strokeOpacity='0.6' strokeWidth='1' />
          ))}
          {/* hover guide */}
          {hover != null && <line x1={xOf(hover)} y1={padT - 6} x2={xOf(hover)} y2={padT + innerH} stroke='var(--muted-foreground)' strokeOpacity='0.5' strokeWidth='1' strokeDasharray='3 3' />}
          {/* invisible hover bands */}
          {series.map((p, i) => (
            <rect key={`h${i}`} x={xOf(i) - innerW / (2 * n)} y={0} width={innerW / n + 2} height={H} fill='transparent'
              onMouseEnter={() => setHover(i)} className='cursor-pointer' />
          ))}
          {/* x labels: first / mid / last */}
          {[0, Math.floor((n - 1) / 2), n - 1].map(i => (
            <text key={`x${i}`} x={xOf(i)} y={H - 8} textAnchor='middle' fontSize='9' fill='var(--muted-foreground)'>{dM(series[i].date)}</text>
          ))}
        </svg>
        {hover != null && (
          // Position follows the hovered point (data-driven).
          <div className='pointer-events-none absolute -top-1 -translate-x-1/2 whitespace-nowrap rounded-md border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md'
            style={{ left: `${(xOf(hover) / W) * 100}%` }}>
            <div className='text-muted-foreground'>{dM(series[hover].date)}</div>
            {series[hover].sales != null
              ? <div className='font-semibold tabular-nums'>${Math.round(series[hover].sales).toLocaleString()}</div>
              : <div className='text-muted-foreground'>Off, didn't work</div>}
          </div>
        )}
      </div>
    </Panel>
  );
}

function MistakePatterns({ mistakes }) {
  if (!mistakes || mistakes.length === 0) return null;
  const counts = {};
  const recent = {};
  const now = Date.now();
  mistakes.forEach(m => {
    counts[m.category] = (counts[m.category] || 0) + 1;
    if (now - new Date(m.created_at).getTime() < 7 * 86400000) recent[m.category] = (recent[m.category] || 0) + 1;
  });
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (sorted.length === 0) return null;

  return (
    <Panel icon={Flag} title='Mistake patterns' bodyClassName='divide-y px-4'>
      {sorted.map(([cat, total]) => {
        const thisWeek = recent[cat] || 0;
        const color = CATEGORY_COLORS[cat] || 'var(--muted-foreground)';
        const label = categoryLabel(cat);
        return (
          <div key={cat} className='flex items-center gap-3 py-2.5'>
            <span className='h-7 w-1 shrink-0 rounded-full' style={{ background: color }} />
            <div className='min-w-0 flex-1'>
              <div className='text-sm font-medium'>{label}</div>
              <div className='text-xs text-muted-foreground tabular-nums'>{total} total · {thisWeek} this week</div>
            </div>
            {thisWeek >= 2 && <Badge variant='outline' className='border-bad/40 bg-bad/10 text-bad'>Escalating</Badge>}
            {total >= 3 && thisWeek < 2 && <Badge variant='outline' className='border-warn/40 text-warn'>Repeated</Badge>}
          </div>
        );
      })}
    </Panel>
  );
}

function MistakeEntry({ m }) {
  const color = CATEGORY_COLORS[m.category] || 'var(--muted-foreground)';
  const label = categoryLabel(m.category);
  return (
    <div className='space-y-1 py-3'>
      <div className='flex flex-wrap items-center gap-2'>
        <Badge variant='outline' className='gap-1.5 font-normal'>
          <span className='size-1.5 rounded-full' style={{ background: color }} />{label}
        </Badge>
        <span className='text-xs text-muted-foreground tabular-nums'>{new Date(m.created_at).toLocaleDateString()}</span>
      </div>
      {m.description && <p className='text-sm leading-relaxed text-foreground/90'>{m.description}</p>}
      {m.users?.name && <p className='text-xs text-muted-foreground'>Logged by {m.users.name}</p>}
    </div>
  );
}

function ReviewEntry({ r }) {
  return (
    <div className='space-y-1 py-3'>
      <div className='flex items-center justify-between gap-2 text-xs text-muted-foreground'>
        <span className='tabular-nums'>{new Date(r.created_at).toLocaleDateString()}</span>
        <span>by {r.users?.name || '—'}</span>
      </div>
      <p className='text-sm leading-relaxed text-foreground/90'>"{r.notes}"</p>
    </div>
  );
}

// Two-option picker used inside the dialogs (same pattern as the Tasks page).
const Choice = ({ on, onClick, className, children }) => (
  <Button type='button' variant={on ? 'secondary' : 'outline'} className={cn('flex-1', on && 'ring-1 ring-ring', className)} onClick={onClick}>{children}</Button>
);

/* ─── Penalty/Bonus Modal ────────────────────────── */
function PenaltyModal({ chatterId, onClose, onSaved }) {
  const [type, setType] = useState('penalty');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  async function save(e) {
    e.preventDefault(); setSaving(true);
    try {
      await api.post(`/api/chatters/${chatterId}/penalties`, {
        description, penalty_type: type, amount: amount ? parseFloat(amount) : null,
      });
      toast.success(type === 'penalty' ? 'Penalty issued' : 'Bonus added');
      onSaved(); onClose();
    } catch { toast.error('Failed'); }
    finally { setSaving(false); }
  }

  const isPenalty = type === 'penalty';

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>Add a penalty or bonus</DialogTitle>
          <DialogDescription>It's recorded on this chatter's profile.</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className='grid gap-4'>
          <div className='flex gap-2'>
            <Choice on={isPenalty} onClick={() => setType('penalty')} className={cn(isPenalty && 'text-bad')}><AlertTriangle />Penalty</Choice>
            <Choice on={!isPenalty} onClick={() => setType('bonus')} className={cn(!isPenalty && 'text-good')}><Star />Bonus</Choice>
          </div>
          <div className='grid gap-2'>
            <Label htmlFor='pb-amount'>Amount ($) <span className='font-normal text-muted-foreground'>(optional)</span></Label>
            <Input id='pb-amount' type='number' step='0.01' min='0' value={amount} onChange={e => setAmount(e.target.value)} placeholder='e.g. 25.00' />
          </div>
          <div className='grid gap-2'>
            <Label htmlFor='pb-desc'>What for?</Label>
            <Textarea id='pb-desc' value={description} onChange={e => setDescription(e.target.value)} rows={3} required placeholder={isPenalty ? 'Reason for penalty…' : 'Reason for bonus…'} />
          </div>
          <DialogFooter>
            <Button type='button' variant='ghost' onClick={onClose}>Cancel</Button>
            <Button type='submit' disabled={saving}>{saving ? 'Saving…' : isPenalty ? 'Issue penalty' : 'Give bonus'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Weekly Schedule ────────────────────────────── */
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_NUMBERS = [1, 2, 3, 4, 5, 6, 7];

function WeeklySchedule({ chatterId, workDays, assignments, onUpdate }) {
  const days = workDays || [1, 2, 3, 4, 5];
  // New cover model: this chatter's recurring covers (weekday + hours) from the Shifts board.
  const covers = (assignments || []).filter(a => a.day_of_week != null && a.cover_hours != null)
    .sort((a, b) => a.day_of_week - b.day_of_week);
  const coverDays = new Set(covers.map(c => c.day_of_week));

  async function toggle(dayNum) {
    const updated = days.includes(dayNum) ? days.filter(d => d !== dayNum) : [...days, dayNum].sort();
    try { await api.put(`/api/chatters/${chatterId}`, { work_days: updated }); toast.success('Schedule updated'); onUpdate(); }
    catch { toast.error('Failed'); }
  }

  return (
    <Panel icon={Calendar} title='Weekly schedule' meta={`${days.length} days a week`} bodyClassName='space-y-4 p-4'>
      <div className='grid grid-cols-7 gap-1.5'>
        {DAY_LABELS.map((label, i) => {
          const dayNum = DAY_NUMBERS[i], active = days.includes(dayNum), hasCover = coverDays.has(dayNum);
          return (
            <Button key={dayNum} variant={active ? 'default' : 'outline'} aria-pressed={active}
              onClick={() => toggle(dayNum)} className={cn('relative h-9 px-0 text-xs', !active && 'text-muted-foreground')}>
              {label}
              {hasCover && <span title='Cover shift' className='absolute -top-1 -right-1 size-2.5 rounded-full bg-link ring-2 ring-card' />}
            </Button>
          );
        })}
      </div>

      <div className='space-y-2'>
        <div className='text-sm'>
          <span className='font-medium'>Cover shifts</span>
          <span className='text-muted-foreground'> · managed on the Shifts board</span>
        </div>
        {covers.length === 0 ? (
          <EmptyState className='py-4'>No cover shifts. Add them by dragging onto the Shifts board.</EmptyState>
        ) : (
          <div className='space-y-1.5'>
            {covers.map(c => (
              <div key={c.shift_id ? `${c.creator_id}-${c.shift_id}-${c.day_of_week}` : c.day_of_week}
                className='flex items-center gap-3 rounded-md border bg-muted/40 px-3 py-2'>
                <span className='w-8 text-xs font-semibold text-link'>{DAY_LABELS[c.day_of_week - 1]}</span>
                <div className='min-w-0 flex-1'>
                  <div className='truncate text-sm font-medium'>{c.creators?.name || '—'}</div>
                  <div className='text-xs text-muted-foreground'>{c.shifts?.name || 'shift'}</div>
                </div>
                <span className='text-sm font-semibold text-link tabular-nums'>+{c.cover_hours}h</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Panel>
  );
}

/* ─── Add Task Modal ─────────────────────────────── */
// Creates a CUSTOM task (the manager queue) attached to this chatter — pins above
// the AI tasks on the Tasks screen.
function AddTaskModal({ chatterId, chatterName, onClose, onSaved }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [important, setImportant] = useState(false);
  const [saving, setSaving] = useState(false);

  async function save(e) {
    e.preventDefault(); setSaving(true);
    try {
      await api.post('/api/review-tasks/custom', { title, detail: description, important, chatter_id: chatterId });
      toast.success('Custom task created');
      onSaved(); onClose();
    } catch (err) { toast.error(err?.response?.data?.error || 'Failed'); }
    finally { setSaving(false); }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>New custom task</DialogTitle>
          <DialogDescription>For {chatterName}. It's pinned above the AI tasks on the Tasks page.</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className='grid gap-4'>
          <div className='grid gap-2'>
            <Label htmlFor='at-title'>Title</Label>
            <Input id='at-title' value={title} onChange={e => setTitle(e.target.value)} required placeholder='e.g. Review selling technique on Leya' autoFocus />
          </div>
          <div className='grid gap-2'>
            <Label htmlFor='at-detail'>Details <span className='font-normal text-muted-foreground'>(optional)</span></Label>
            <Textarea id='at-detail' value={description} onChange={e => setDescription(e.target.value)} rows={3} placeholder='What to do, context…' />
          </div>
          <div className='grid gap-2'>
            <Label>Importance</Label>
            <div className='flex gap-2'>
              <Choice on={!important} onClick={() => setImportant(false)}>Normal</Choice>
              <Choice on={important} onClick={() => setImportant(true)}><Star />Important</Choice>
            </div>
          </div>
          <DialogFooter>
            <Button type='button' variant='ghost' onClick={onClose}>Cancel</Button>
            <Button type='submit' disabled={saving || !title}>{saving ? 'Creating…' : 'Create task'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ═══ MAIN PAGE ══════════════════════════════════ */
// Coaching Log — the per-chatter board. PENDING = all open/taken tasks from the
// analysis (overview; each can be saved for coaching or completed). TO COACH =
// cases saved for the next coaching session. COACHED = the coached record / KB.
function CoachingLog({ chatterId, canCreate, onAddCustom }) {
  const [tab, setTab] = useState('pending');
  const [all, setAll] = useState([]);
  const loadTasks = useCallback(async () => {
    const { data } = await api.get(`/api/review-tasks?chatter_id=${chatterId}&status=open,taken,completed`).catch(() => ({ data: { tasks: [] } }));
    setAll(data?.tasks || []);
  }, [chatterId]);
  useEffect(() => { loadTasks(); }, [loadTasks]);
  const act = async (t, action) => {
    try { await api.patch(`/api/review-tasks/${t.id}`, { action }); loadTasks(); }
    catch (e) { toast.error(e?.response?.data?.error || 'Failed'); }
  };
  const pending = all.filter(t => t.status === 'open' || t.status === 'taken');
  const toCoach = all.filter(t => t.coach_flag && !t.coached_at);
  const coached = all.filter(t => t.coached_at);
  const list = tab === 'pending' ? pending : tab === 'tocoach' ? toCoach : coached;
  const TABS = [['pending', 'Pending', pending.length], ['tocoach', 'To coach', toCoach.length], ['coached', 'Coached', coached.length]];
  const empty = { pending: 'No pending cases for this chatter.', tocoach: 'Nothing saved for coaching. Use the bookmark button on a pending case to add it.', coached: 'No coached cases yet.' };
  return (
    <section className='overflow-hidden rounded-lg border bg-card'>
      <div className='flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-3'>
        <h3 className='text-sm font-semibold'>Coaching log</h3>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            {TABS.map(([k, label, n]) => (
              <TabsTrigger key={k} value={k} className='gap-1.5 text-xs'>
                {label}
                <span className='rounded-full bg-background/60 px-1.5 font-mono text-xs text-muted-foreground'>{n}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        {canCreate && <Button size='sm' variant='outline' className='ms-auto' onClick={onAddCustom}><Plus />Custom task</Button>}
      </div>
      <div className='max-h-[460px] overflow-y-auto'>
        {list.length === 0 ? (
          <div className='p-4'><EmptyState>{empty[tab]}</EmptyState></div>
        ) : (
          <div className='divide-y'>
            {list.map(t => {
              const tier = TIER[t.priority] || {};
              const sentAt = t.context?.sent_at;
              return (
                <div key={t.id} className={cn('flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:gap-4', t.coached_at && 'opacity-70')}>
                  <div className='flex min-w-0 flex-1 items-start gap-3'>
                    <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', !tier.c && 'bg-muted-foreground/60')}
                      style={tier.c ? { background: tier.c } : undefined} />
                    <div className='min-w-0 flex-1 space-y-1'>
                      <div className='text-sm font-medium'>{t.title || t.detail}</div>
                      <div className='flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground'>
                        {t.creator_name && <span className='font-medium text-foreground'>{t.creator_name}</span>}
                        {t.fan_username && <span className='font-mono'>{t.fan_username}</span>}
                        {sentAt && <TimeStamp>{fmtSentAt(sentAt)}</TimeStamp>}
                        <span>{areaLabel(t.area)}</span>
                        {t.coached_at && <span className='inline-flex items-center gap-1'><Check className='size-3' />Coached {new Date(t.coached_at).toLocaleDateString()}</span>}
                      </div>
                      {t.context?.message && <p className='text-xs italic text-muted-foreground'>“{t.context.message}”</p>}
                    </div>
                  </div>
                  <div className='flex shrink-0 items-center gap-1.5 ps-5 sm:ps-0'>
                    {tab === 'pending' && (t.coach_flag ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button size='sm' variant='secondary' className='text-warn' onClick={() => act(t, 'uncoach')}><BookmarkCheck />Saved</Button>
                        </TooltipTrigger>
                        <TooltipContent>Remove from coaching</TooltipContent>
                      </Tooltip>
                    ) : (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button size='icon-sm' variant='ghost' aria-label='Save for coaching' onClick={() => act(t, 'coach')}><Bookmark /></Button>
                        </TooltipTrigger>
                        <TooltipContent>Save for coaching</TooltipContent>
                      </Tooltip>
                    ))}
                    {tab === 'pending' && <Button size='sm' onClick={() => act(t, 'complete')}>Complete</Button>}
                    {tab === 'tocoach' && <Button size='sm' onClick={() => act(t, 'coached')}>Mark coached</Button>}
                    {tab === 'coached' && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button size='icon-sm' variant='ghost' aria-label='Move back to coach' onClick={() => act(t, 'uncoached')}><RotateCcw /></Button>
                        </TooltipTrigger>
                        <TooltipContent>Move back to "To coach"</TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

// Report history for one chatter, filtered to a single eval type (newest first),
// each openable to see the overview + findings, so managers can track progress.
function ReportsTimeline({ chatterId, type, title, emptyText }) {
  const [reports, setReports] = useState([]);
  const [openKey, setOpenKey] = useState(null);
  useEffect(() => {
    api.get(`/api/daily-check/chatter-eval-history?chatter_id=${chatterId}`)
      .then(r => setReports((r.data?.evaluations || []).filter(e => !type || e.eval_type === type))).catch(() => {});
  }, [chatterId, type]);
  return (
    <Panel title={title} meta={`${reports.length} run${reports.length === 1 ? '' : 's'}`} bodyClassName='max-h-[460px] overflow-y-auto'>
      {reports.length === 0 ? (
        <div className='p-4'><EmptyState>{emptyText || 'No reports generated yet.'}</EmptyState></div>
      ) : (
        <div className='divide-y'>
          {reports.map((r) => {
            const key = `${r.report_date}-${r.eval_type}-${r.created_at}`;
            const issues = r.evaluation?.issues || [];
            const isOpen = openKey === key;
            return (
              <div key={key}>
                <button type='button' onClick={() => setOpenKey(isOpen ? null : key)} aria-expanded={isOpen}
                  className='flex w-full items-center gap-2 px-4 py-2.5 text-start transition-colors hover:bg-muted/50'>
                  <ChevronRight className={cn('size-4 text-muted-foreground transition-transform', isOpen && 'rotate-90')} />
                  <span className='text-sm font-medium tabular-nums'>{r.report_date}</span>
                  <span className={cn('ms-auto text-xs', issues.length ? 'text-foreground/80' : 'text-muted-foreground')}>{issues.length} issue{issues.length === 1 ? '' : 's'}</span>
                </button>
                {isOpen && (
                  <div className='space-y-2 px-4 pb-3 ps-10'>
                    {r.evaluation?.overall && <p className='text-sm leading-relaxed text-foreground/90'>{r.evaluation.overall}</p>}
                    {issues.map((iss, i) => (
                      <div key={i} className='flex items-start gap-2'>
                        <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', sevDot(iss.severity))} />
                        <div className='min-w-0'>
                          <div className='text-sm leading-snug'>{iss.detail || iss.title}</div>
                          <div className='text-xs text-muted-foreground'>{areaLabel(iss.area)}{iss.fan_username ? ` · @${iss.fan_username}` : ''}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

function ProfileSkeleton() {
  return (
    <div className='flex flex-col gap-4'>
      <Skeleton className='h-8 w-20' />
      <div className='flex items-center gap-4'>
        <Skeleton className='size-14 rounded-full' />
        <div className='space-y-2'><Skeleton className='h-7 w-48' /><Skeleton className='h-4 w-64' /></div>
      </div>
      <Skeleton className='h-32 w-full rounded-lg' />
      <Skeleton className='h-20 w-full rounded-lg' />
      <div className='grid gap-4 lg:grid-cols-2'><Skeleton className='h-48 rounded-lg' /><Skeleton className='h-48 rounded-lg' /></div>
    </div>
  );
}

export default function ChatterProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canCreate = ['head_manager', 'admin', 'owner'].includes(user?.role);
  const [chatter, setChatter] = useState(null);
  const [loading, setLoading] = useState(true);
  const [employeeStats, setEmployeeStats] = useState([]);
  const [showPenaltyModal, setShowPenaltyModal] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [pageTimeframe, setPageTimeframe] = useState('1d');
  const [tasks, setTasks] = useState([]);
  const [evals, setEvals] = useState([]);
  const [runningQuality, setRunningQuality] = useState(false);
  const [showTaskModal, setShowTaskModal] = useState(false);

  const load = useCallback(async () => {
    try {
      const [chatterRes, statsRes, tasksRes, evalsRes] = await Promise.all([
        api.get(`/api/chatters/${id}`),
        api.get(`/api/metrics/employee-stats?chatter_id=${id}`).catch(() => ({ data:[] })),
        api.get(`/api/review-tasks?chatter_id=${id}&status=open,taken`).catch(() => ({ data:{ tasks:[] } })),
        api.get(`/api/daily-check/chatter-evals?chatter_id=${id}`).catch(() => ({ data:{ evaluations:[] } })),
      ]);
      setChatter(chatterRes.data);
      setEmployeeStats(statsRes.data || []);
      setTasks(tasksRes.data?.tasks || []);
      setEvals(evalsRes.data?.evaluations || []);
    } catch (err) { console.error(err?.message || err?.toString?.()); toast.error('Failed to load profile'); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function changeStatus(newStatus) {
    try { await api.put(`/api/chatters/${id}`, { status:newStatus }); toast.success('Status updated'); setStatusOpen(false); load(); }
    catch { toast.error('Failed'); }
  }

  if (loading) return <ProfileSkeleton />;
  if (!chatter) return (
    <div className='flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground'>
      Chatter not found.
      <Button variant='link' size='sm' onClick={() => navigate(-1)}>Go back</Button>
    </div>
  );

  const meta = STATUS_META[chatter.status] || STATUS_META.new;
  const assignments = chatter.chatter_creator_assignments?.filter(a=>a.is_active) || [];
  const regularAssignments = assignments.filter(a => a.day_of_week == null);   // not covers
  const creatorNames = [...new Set(regularAssignments.map(a=>a.creators?.name).filter(Boolean))];
  const shiftName = regularAssignments[0]?.shifts?.name || '—';
  const shiftHours = regularAssignments[0]?.shifts ? `${regularAssignments[0].shifts.start_time?.slice(0,5)} – ${regularAssignments[0].shifts.end_time?.slice(0,5)}` : '';

  const mistakes = chatter.mistakes || [];
  const penalties = chatter.penalties || [];
  const reviews = chatter.reviews || [];
  const metrics = chatter.latestMetrics || [];
  const latestMetric = metrics[0] || {};

  // Real daily series — sum sales across pages per CALENDAR day (not per upload row).
  const dailySales = {};
  employeeStats.forEach(s => { if (s.report_date) dailySales[s.report_date] = (dailySales[s.report_date] || 0) + (parseFloat(s.sales) || 0); });
  const dDates = Object.keys(dailySales).sort();
  const latestDay = dDates[dDates.length - 1] || null;
  const latestDaySales = latestDay ? dailySales[latestDay] : 0;
  const last7 = dDates.slice(-7).map(d => dailySales[d]);
  const avg7 = last7.length ? last7.reduce((a, b) => a + b, 0) / last7.length : 0;
  const vsAvgPct = avg7 > 0 ? Math.round(((latestDaySales - avg7) / avg7) * 100) : null;

  // Latest employee stats for per-page table
  const latestDate = employeeStats.length > 0 ? employeeStats.reduce((max,s) => s.report_date > max ? s.report_date : max, '') : null;
  const latestPageStats = latestDate ? employeeStats.filter(s => s.report_date === latestDate) : [];

  // AI evaluations: compliance → daily summary, sales_quality → quality analysis.
  const salesEval = evals.find(e => e.eval_type === 'sales_quality');
  const complianceEval = evals.find(e => e.eval_type === 'compliance');
  const commScore = parseFloat(salesEval?.evaluation?.communication_score) || 0;

  async function runQuality() {
    if (!latestDay) return toast.error('No data to analyse yet');
    setRunningQuality(true);
    try {
      const { data } = await api.post('/api/daily-check/evaluate', { chatter_id: id, report_date: latestDay, eval_type: 'sales_quality', model: 'sonnet' });
      if (data.ok === false) toast.error(data.reason || 'Nothing to analyse');
      else { toast.success('Quality analysis complete'); load(); }
    } catch (e) { toast.error(e?.response?.data?.error || 'Analysis failed'); }
    finally { setRunningQuality(false); }
  }

  // Alerts
  const alerts = [];
  if (vsAvgPct != null && vsAvgPct < -30)
    alerts.push({ severity:'high', message:`Sales ${vsAvgPct}% below 7-day average` });
  if (latestMetric.response_time_p90_seconds > 300)
    alerts.push({ severity:'high', message:`P90 response time ${latestMetric.response_time_p90_seconds}s (>5 min)` });
  if (latestMetric.response_time_trend === 'degrading')
    alerts.push({ severity:'warn', message:'Response times degrading over last 3 days' });
  const repeatedMistakes = {};
  mistakes.forEach(m => { repeatedMistakes[m.category] = (repeatedMistakes[m.category]||0) + 1; });
  Object.entries(repeatedMistakes).filter(([_,c]) => c >= 3).forEach(([cat,count]) => {
    alerts.push({ severity:'warn', message:`${cat.replace(/_/g,' ')}: repeated ${count} times` });
  });

  // Sales and golden ratio colors
  const salesColor = vsAvgPct == null ? '' : vsAvgPct > 0 ? 'text-good' : vsAvgPct < -20 ? 'text-bad' : '';
  const gr = parseFloat(latestMetric.golden_ratio) || 0;
  const ur = parseFloat(latestMetric.unlock_rate) || 0;
  const mistakes30 = mistakes.filter(m=>new Date(m.created_at)>new Date(Date.now()-30*86400000)).length;
  const commRing = commScore>=7 ? 'stroke-good' : commScore>=5 ? 'stroke-warn' : 'stroke-bad';

  return (
    <div className='flex flex-col gap-4 sm:gap-6'>
      <div className='flex flex-col gap-3'>
        <Button variant='ghost' size='sm' className='-ms-2 self-start text-muted-foreground' onClick={() => navigate(-1)}>
          <ArrowLeft />Back
        </Button>

        {/* ═══ HEADER ═══ */}
        <div className='flex flex-wrap items-center gap-4'>
          <div className='relative shrink-0'>
            <Avatar className='size-14'>
              <AvatarFallback className='text-lg font-semibold text-foreground'>{initials(chatter.name)}</AvatarFallback>
            </Avatar>
            {commScore > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <svg width={64} height={64} className='absolute -top-1 -left-1'>
                    <circle cx={32} cy={32} r={30} fill='none' className='stroke-border' strokeWidth={3} />
                    <circle cx={32} cy={32} r={30} fill='none' className={commRing} strokeWidth={3} strokeDasharray={`${(commScore/10)*188} 188`} strokeLinecap='round' transform='rotate(-90 32 32)' />
                  </svg>
                </TooltipTrigger>
                <TooltipContent>Communication score {commScore.toFixed(1)} / 10</TooltipContent>
              </Tooltip>
            )}
          </div>
          <div className='min-w-0 flex-1'>
            <div className='flex flex-wrap items-center gap-2'>
              <h2 className='text-2xl font-bold tracking-tight'>{chatter.name}</h2>
              <DropdownMenu open={statusOpen} onOpenChange={setStatusOpen}>
                <DropdownMenuTrigger asChild>
                  <Button variant='outline' size='sm' className='h-7 gap-1.5 rounded-full px-2.5 text-xs'>
                    <span className='size-2 rounded-full' style={{ background: STATUS_DOT[chatter.status] || STATUS_DOT.new }} />
                    {meta.label}<ChevronDown className='size-3 opacity-60' />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align='start' className='min-w-40'>
                  {Object.entries(STATUS_META).map(([k,v]) => (
                    <DropdownMenuItem key={k} onClick={()=>changeStatus(k)} className={cn(chatter.status===k && 'bg-accent')}>
                      <span className='size-2 rounded-full' style={{ background: STATUS_DOT[k] }} />{v.label}
                      {chatter.status===k && <Check className='ms-auto' />}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className='mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-muted-foreground'>
              {creatorNames.map(n => <Badge key={n} variant='secondary' className='font-normal'>{n}</Badge>)}
              <span className='inline-flex items-center gap-1'><Clock className='size-3.5' />{shiftName} {shiftHours}</span>
              <span>Joined {new Date(chatter.created_at).toLocaleDateString()}</span>
            </div>
          </div>
          {canCreate && <Button onClick={()=>setShowTaskModal(true)}><Plus />Custom task</Button>}
        </div>
      </div>

      {/* ═══ AI QUALITY ANALYSIS ═══ */}
      <AIQualityPanel ev={salesEval} onRun={runQuality} running={runningQuality} canRun={!!latestDay}/>

      {/* ═══ ALERTS ═══ */}
      {alerts.length > 0 && <AlertsBanner alerts={alerts}/>}

      {/* ═══ KPI STRIP ═══ */}
      <div className='grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-3 xl:grid-cols-6'>
        <KPI label='Sales, latest day' value={`$${Math.round(latestDaySales).toLocaleString()}`} color={salesColor}
          sub={vsAvgPct != null ? `${vsAvgPct>0?'+':''}${vsAvgPct}% vs 7-day average` : null}/>
        <KPI label='7-day average' value={`$${Math.round(avg7).toLocaleString()}`}/>
        <KPI label='Golden ratio' value={`${gr.toFixed(1)}%`} color={goldenColor(gr)}/>
        <KPI label='Unlock rate' value={`${ur.toFixed(0)}%`} color={unlockColor(ur)}/>
        <KPI label='Mistakes, last 30 days' value={mistakes30} color={mistakes30>3?'text-bad':''}/>
        <KPI label='Last review' value={reviews.length>0?`${Math.floor((Date.now()-new Date(reviews[0].created_at))/(86400000))}d ago`:'Never'}/>
      </div>

      {/* ═══ AI SUMMARY + PER-PAGE ═══ */}
      <div className='grid items-start gap-4 lg:grid-cols-[1fr_1.2fr]'>
        <AIDailySummary summary={complianceEval?.evaluation?.overall} date={complianceEval?.report_date}/>
        <div className='min-w-0'>
          <PageContribution stats={latestPageStats} allStats={employeeStats} timeframe={pageTimeframe} setTimeframe={setPageTimeframe}/>
        </div>
      </div>

      {/* ═══ BOTTOM ZONE ═══ */}
      <div className='grid items-start gap-4 lg:grid-cols-[1.4fr_1fr]'>
        {/* Left */}
        <div className='flex min-w-0 flex-col gap-4'>
          {/* Performance trend — calendar-based, interactive */}
          <PerformanceTrend stats={employeeStats}/>

          {/* Mistake Patterns */}
          <MistakePatterns mistakes={mistakes}/>

          {/* Coaching Log — pending cases + saved-for-coaching + coached record */}
          <CoachingLog chatterId={id} canCreate={canCreate} onAddCustom={() => setShowTaskModal(true)} />
        </div>

        {/* Right */}
        <div className='flex min-w-0 flex-col gap-4'>
          <WeeklySchedule chatterId={id} workDays={chatter.work_days} assignments={assignments} onUpdate={load}/>

          {/* Daily reports — history of the daily (compliance) AI reports */}
          <ReportsTimeline chatterId={id} type='compliance' title='Daily reports' emptyText='No daily reports yet.'/>

          {/* AI Analysis for Dialogues and Sales Quality — history of the strategy analyses */}
          <ReportsTimeline chatterId={id} type='sales_quality' title='Dialogue and sales-quality analyses' emptyText='No dialogue or sales-quality analyses yet. Run one above.'/>

          {/* Mistake log */}
          <Panel title='Mistake log' meta={`${mistakes.length} entries`} bodyClassName='max-h-[300px] overflow-y-auto'>
            {mistakes.length===0
              ? <div className='p-4'><EmptyState>No mistakes logged yet.</EmptyState></div>
              : <div className='divide-y px-4'>{mistakes.map(m=><MistakeEntry key={m.id} m={m}/>)}</div>}
          </Panel>

          {/* Penalties & Bonuses */}
          <Panel title='Penalties and bonuses'>
            {penalties.length===0 ? (
              <div className='p-4'><EmptyState>No penalties or bonuses.</EmptyState></div>
            ) : (
              <div className='divide-y px-4'>
                {penalties.map(p => {
                  const isBonus = p.penalty_type === 'bonus';
                  const Icon = isBonus ? Star : AlertTriangle;
                  return (
                    <div key={p.id} className='flex items-start gap-3 py-3'>
                      <Icon className={cn('mt-0.5 size-4 shrink-0', isBonus ? 'text-good' : 'text-bad')} />
                      <div className='min-w-0 flex-1 space-y-1'>
                        <div className='flex flex-wrap items-center gap-2'>
                          <Badge variant='outline' className={isBonus ? 'border-good/30 bg-good/10 text-good' : 'border-bad/30 bg-bad/10 text-bad'}>
                            {isBonus ? 'Bonus' : 'Penalty'}
                          </Badge>
                          {p.amount && <span className={cn('text-sm font-medium tabular-nums', isBonus ? 'text-good' : 'text-bad')}>{isBonus?'+':'-'}${p.amount}</span>}
                          <span className='text-xs text-muted-foreground tabular-nums'>{new Date(p.created_at).toLocaleDateString()}</span>
                        </div>
                        <p className='text-sm text-foreground/90'>{p.description}</p>
                        {p.users?.name && <p className='text-xs text-muted-foreground'>by {p.users.name}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>
        </div>
      </div>

      {/* Modals */}
      {showPenaltyModal && <PenaltyModal chatterId={id} onClose={()=>setShowPenaltyModal(false)} onSaved={load}/>}
      {showTaskModal && <AddTaskModal chatterId={id} chatterName={chatter.name} onClose={()=>setShowTaskModal(false)} onSaved={load}/>}
    </div>
  );
}
