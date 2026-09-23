import { useState, useEffect, useCallback, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowDown, ArrowRight, ArrowUp, ArrowUpDown, BarChart3, ChevronRight, ListChecks, Sparkles,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '@/context/AuthContext';
import api from '@/services/api';
import { Avatar, Chip } from '@/components/shared';
import { TIER } from '@/utils/taskMeta';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const yesterday = () => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().split('T')[0]; };
const money = (n) => n == null ? '-' : `$${Math.round(n).toLocaleString()}`;

const Dash = ({ children = '—' }) => <span className='text-xs text-muted-foreground/60'>{children}</span>;

function Delta({ v, lowerBetter, money: m, suffix = '' }) {
  if (v == null || v === 0) return <Dash>·</Dash>;
  const good = lowerBetter ? v < 0 : v > 0;
  const val = m ? `$${Math.abs(Math.round(v)).toLocaleString()}` : `${Math.abs(Math.round(v * 10) / 10)}${suffix}`;
  const Icon = v > 0 ? ArrowUp : ArrowDown;
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-[11px] font-semibold tabular-nums', good ? 'text-good' : 'text-bad')}>
      <Icon className='size-3' />{val}
    </span>
  );
}

function Cell({ val, delta, money: m, suffix = '', lowerBetter }) {
  return (
    <div className='leading-tight'>
      <div className='font-semibold tabular-nums'>{m ? money(val) : `${val}${suffix}`}</div>
      <Delta v={delta} money={m} suffix={suffix} lowerBetter={lowerBetter} />
    </div>
  );
}

function Donut({ counts }) {
  const total = counts.open + counts.taken + counts.completed;
  const pct = total ? counts.completed / total : 0;
  const r = 30, circ = 2 * Math.PI * r;
  return (
    <svg viewBox='0 0 80 80' width={78} height={78} className='shrink-0'>
      <circle cx={40} cy={40} r={r} fill='none' strokeWidth={9} className='stroke-muted' />
      <circle cx={40} cy={40} r={r} fill='none' strokeWidth={9} strokeLinecap='round' className='stroke-good'
        strokeDasharray={`${circ * pct} ${circ}`} transform='rotate(-90 40 40)' />
      <text x={40} y={45} textAnchor='middle' fontSize={17} fontWeight={700} className='fill-foreground tabular-nums'>{Math.round(pct * 100)}%</text>
    </svg>
  );
}

// Line sparkline with gaps for missing days. Colour comes from the text colour class.
function Sparkline({ data, w = 74, h = 24, className = 'text-link' }) {
  const vals = (data || []);
  const nums = vals.filter(v => v != null);
  if (nums.length < 2) return <Dash />;
  const max = Math.max(...nums, 1), min = Math.min(...nums, 0), range = (max - min) || 1, n = vals.length;
  const x = i => (i / (n - 1)) * w, y = v => h - 2 - ((v - min) / range) * (h - 4);
  const segs = []; let cur = [];
  vals.forEach((v, i) => { if (v != null) cur.push(`${x(i)},${y(v)}`); else { if (cur.length) segs.push(cur); cur = []; } });
  if (cur.length) segs.push(cur);
  return (
    <svg width={w} height={h} className={cn('block', className)}>
      {segs.map((s, si) => s.length > 1 && <polyline key={si} points={s.join(' ')} fill='none' stroke='currentColor' strokeWidth='1.5' strokeLinejoin='round' />)}
      {vals.map((v, i) => v != null ? <circle key={i} cx={x(i)} cy={y(v)} r={i === n - 1 ? 2.4 : 1.4} fill='currentColor' /> : null)}
    </svg>
  );
}

const WL = { overloaded: { l: 'Overloaded', tone: 'bad' }, healthy: { l: 'Healthy', tone: 'good' }, light: { l: 'Light', tone: 'info' } };
function WorkloadChip({ s }) {
  const m = WL[s] || { l: s, tone: 'neutral' };
  return <Chip tone={m.tone}>{m.l}</Chip>;
}

const concernTone = (c) => c >= 12 ? 'bad' : c >= 5 ? 'warn' : 'info';

/* ─── Generic sortable, sticky-header, expandable table ─── */
// A raw <table> (not the shadcn wrapper) so the header can stick inside the
// scroll box; the shadcn wrapper adds its own overflow container.
function DataTable({ rows, columns, getKey, renderExpand }) {
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
  const alignCls = (a) => a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left';
  return (
    <div className='max-h-[380px] overflow-auto rounded-lg border bg-card'>
      <table className='w-full caption-bottom text-sm'>
        <TableHeader className='sticky top-0 z-10 bg-muted shadow-[inset_0_-1px_0_var(--border)] [&_tr]:border-b-0'>
          <TableRow className='hover:bg-transparent'>
            <TableHead className='w-8'><span className='sr-only'>Expand</span></TableHead>
            {columns.map(c => {
              const sorted = sort?.key === c.key ? sort.dir : null;
              const SortIcon = sorted === 'desc' ? ArrowDown : sorted === 'asc' ? ArrowUp : ArrowUpDown;
              return (
                <TableHead key={c.key} className={cn('px-3 text-xs font-medium text-muted-foreground', alignCls(c.align))}
                  aria-sort={sorted === 'desc' ? 'descending' : sorted === 'asc' ? 'ascending' : undefined}>
                  {c.sortVal ? (
                    <button type='button' onClick={() => toggleSort(c.key)}
                      className={cn('group inline-flex items-center gap-1 hover:text-foreground', sorted && 'text-foreground')}>
                      {c.label}
                      <SortIcon className={cn('size-3', !sorted && 'opacity-0 group-hover:opacity-50')} />
                    </button>
                  ) : c.label}
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map(row => {
            const k = getKey(row), isExp = exp === k;
            return (
              <Fragment key={k}>
                <TableRow data-state={isExp ? 'selected' : undefined}>
                  <TableCell className='w-8 cursor-pointer text-center' onClick={() => setExp(isExp ? null : k)}>
                    <ChevronRight className={cn('mx-auto size-4 text-muted-foreground transition-transform', isExp && 'rotate-90')} aria-label={isExp ? 'Collapse' : 'Expand'} />
                  </TableCell>
                  {columns.map(c => (
                    <TableCell key={c.key} onClick={c.onClick ? () => c.onClick(row) : undefined}
                      className={cn('px-3 py-1.5', alignCls(c.align), c.onClick && 'cursor-pointer')}>
                      {c.render(row)}
                    </TableCell>
                  ))}
                </TableRow>
                {isExp && (
                  <TableRow className='bg-muted/30 hover:bg-muted/30'>
                    <TableCell colSpan={columns.length + 1} className='p-0 whitespace-normal'>{renderExpand(row)}</TableCell>
                  </TableRow>
                )}
              </Fragment>
            );
          })}
        </TableBody>
      </table>
    </div>
  );
}

function TaskList({ tasks }) {
  if (!tasks?.length) return <p className='text-sm text-muted-foreground'>No open tasks.</p>;
  return (
    <div className='grid gap-1.5'>
      {tasks.slice(0, 8).map((t, i) => (
        <div key={i} className='flex items-center gap-2 text-sm'>
          {/* tier colour is data */}
          <span className='size-1.5 shrink-0 rounded-full bg-muted-foreground' style={{ background: (TIER[t.priority] || {}).c }} />
          <span className='truncate'>{t.title}</span>
        </div>
      ))}
      {tasks.length > 8 && <p className='text-xs text-muted-foreground'>+{tasks.length - 8} more</p>}
    </div>
  );
}

const ExpandLabel = ({ children }) => <p className='mb-2 text-xs font-medium text-muted-foreground'>{children}</p>;
const ExpandWrap = ({ children }) => <div className='grid gap-4 px-4 py-3 sm:grid-cols-[1fr_1.4fr]'>{children}</div>;

function SectionTitle({ title, hint }) {
  return (
    <div className='flex flex-wrap items-baseline gap-x-2'>
      <h3 className='font-semibold'>{title}</h3>
      <span className='text-sm text-muted-foreground'>{hint}</span>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [date, setDate] = useState(yesterday());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const load = useCallback(async (d) => {
    setLoading(true);
    try { const res = await api.get('/api/daily-check/overview', { params: { date: d } }); setData(res.data); }
    catch { /* ignore */ } finally { setLoading(false); }
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(date); }, [load]);

  const generate = async () => {
    setGenerating(true);
    try {
      const { data: rb } = await api.post('/api/review-tasks/rebuild', { report_date: date });
      await load(date);
      const arch = (rb?.ranked?.archived || 0) + (rb?.capped?.archived || 0);
      toast.success(`Tasks built${arch ? ` · archived ${arch} low-value tasks` : ''}`);
    }
    catch (e) { toast.error(e?.response?.data?.error || 'Failed'); }
    finally { setGenerating(false); }
  };

  const hr = new Date().getHours();
  const greet = hr < 12 ? 'Morning' : hr < 18 ? 'Afternoon' : 'Evening';
  const tc = data?.task_counts || { open: 0, taken: 0, completed: 0, dismissed: 0 };
  const tt = data?.team_totals;
  const hasData = data && ((data.chatters || []).some(c => c.has_data) || (data.pages || []).length > 0);

  const tasksCell = r => r.task_count > 0 ? <Chip tone={concernTone(r.concern)} className='tabular-nums'>{r.task_count}</Chip> : <Dash>·</Dash>;

  // ─── column definitions ───
  const chatterCols = [
    { key: 'name', label: 'Chatter', sortVal: r => r.name?.toLowerCase(), onClick: r => navigate(`/chatters/${r.chatter_id}`),
      render: r => (
        <div className='flex items-center gap-2'>
          <Avatar name={r.name} size={24} />
          <span className={cn('font-medium hover:underline', !r.has_data && 'text-muted-foreground')}>{r.name}</span>
          {!r.has_data && <span className='text-xs text-muted-foreground'>day off</span>}
        </div>
      ) },
    { key: 'sales', label: 'Sales', align: 'right', sortVal: r => r.metrics?.sales ?? -1, render: r => r.has_data ? <Cell val={r.metrics.sales} delta={r.vs_prev?.sales} money /> : <Dash /> },
    { key: 'ppvs', label: 'PPVs', align: 'right', sortVal: r => r.metrics?.ppvs ?? -1, render: r => r.has_data ? <Cell val={r.metrics.ppvs} delta={r.vs_prev?.ppvs} /> : <Dash /> },
    { key: 'unlock', label: 'Unlock', align: 'right', sortVal: r => r.metrics?.unlock ?? -1, render: r => r.has_data ? <Cell val={r.metrics.unlock} delta={r.vs_prev?.unlock} suffix='%' /> : <Dash /> },
    { key: 'golden', label: 'Golden', align: 'right', sortVal: r => r.metrics?.golden ?? -1, render: r => r.has_data ? <Cell val={r.metrics.golden} delta={r.vs_prev?.golden} suffix='%' /> : <Dash /> },
    { key: 'messages', label: 'Msgs', align: 'right', sortVal: r => r.metrics?.messages ?? -1, render: r => r.has_data ? <Cell val={r.metrics.messages} delta={r.vs_prev?.messages} /> : <Dash /> },
    { key: 'reply', label: 'Reply', align: 'right', sortVal: r => r.metrics?.reply ?? 1e9, render: r => r.has_data ? <Cell val={r.metrics.reply} delta={r.vs_prev?.reply} suffix='s' lowerBetter /> : <Dash /> },
    { key: 'workload', label: 'Load', align: 'center', sortVal: r => ({ overloaded: 3, healthy: 2, light: 1 }[r.metrics?.workload] || 0), render: r => r.has_data && r.metrics?.workload ? <WorkloadChip s={r.metrics.workload} /> : <Dash /> },
    { key: 'spark', label: '7-day', sortVal: null, render: r => <Sparkline data={r.spark} /> },
    { key: 'tasks', label: 'Tasks', align: 'center', sortVal: r => r.concern, render: tasksCell },
  ];
  const renderChatterExpand = r => (
    <ExpandWrap>
      <div>
        <ExpandLabel>Sales by page today</ExpandLabel>
        {r.breakdown?.length ? r.breakdown.map(b => (
          <div key={b.creator_id} className='flex justify-between gap-4 py-0.5 text-sm'><span>{b.name}</span><span className='font-mono font-semibold tabular-nums'>{money(b.sales)}</span></div>
        )) : <p className='text-sm text-muted-foreground'>No sales recorded.</p>}
      </div>
      <div><ExpandLabel>Open tasks ({r.task_count})</ExpandLabel><TaskList tasks={r.tasks} /></div>
    </ExpandWrap>
  );

  const pageCols = [
    { key: 'name', label: 'Page', sortVal: r => r.name?.toLowerCase(),
      render: r => <div className='flex items-center gap-2'><Avatar name={r.name} size={24} /><span className='font-medium'>{r.name}</span></div> },
    { key: 'daily', label: 'Daily rev', align: 'right', sortVal: r => r.metrics?.revenue_net ?? -1,
      render: r => <Cell val={r.metrics?.revenue_net} delta={(r.metrics?.revenue_net != null && r.metrics?.revenue_baseline_net != null) ? r.metrics.revenue_net - r.metrics.revenue_baseline_net : null} money /> },
    { key: 'wk', label: '7-day rev', align: 'right', sortVal: r => r.metrics?.revenue_7d ?? -1,
      render: r => <Cell val={r.metrics?.revenue_7d} delta={(r.metrics?.revenue_7d != null && r.metrics?.revenue_7d_prior != null) ? r.metrics.revenue_7d - r.metrics.revenue_7d_prior : null} money /> },
    { key: 'ratio', label: 'Ratio', align: 'right', sortVal: r => r.metrics?.ratio ?? -1,
      render: r => <span className={cn('font-semibold tabular-nums', r.metrics?.ratio == null ? 'text-muted-foreground/60' : r.metrics.ratio >= 5 ? 'text-good' : r.metrics.ratio >= 3 ? 'text-warn' : 'text-bad')}>{r.metrics?.ratio != null ? Number(r.metrics.ratio).toFixed(1) : '—'}</span> },
    { key: 'ltv', label: 'LTV', align: 'right', sortVal: r => r.metrics?.ltv_7day ?? -1, render: r => <span className='tabular-nums text-muted-foreground'>{r.metrics?.ltv_7day != null ? money(r.metrics.ltv_7day) : '—'}</span> },
    { key: 'worked', label: 'Worked by', sortVal: r => r.chatters?.length || 0, render: r => r.chatters?.length
      ? (
        <div className='flex items-center'>
          {r.chatters.slice(0, 4).map((c, i) => (
            <span key={c.chatter_id} title={`${c.name} · ${money(c.sales)}`} className={cn('inline-flex rounded-full ring-2 ring-card', i && '-ms-1.5')}>
              <Avatar name={c.name} size={20} />
            </span>
          ))}
          {r.chatters.length > 4 && <span className='ms-1 text-xs text-muted-foreground'>+{r.chatters.length - 4}</span>}
        </div>
      )
      : <Dash /> },
    { key: 'spark', label: '7-day', sortVal: null, render: r => <Sparkline data={r.spark} className='text-good' /> },
    { key: 'tasks', label: 'Tasks', align: 'center', sortVal: r => r.concern, render: tasksCell },
  ];
  const renderPageExpand = r => (
    <ExpandWrap>
      <div>
        <ExpandLabel>Chatters on this page today</ExpandLabel>
        {r.chatters?.length ? r.chatters.map(c => (
          <button key={c.chatter_id} type='button' onClick={() => navigate(`/chatters/${c.chatter_id}`)}
            className='flex w-full justify-between gap-4 py-0.5 text-left text-sm'>
            <span className='text-link hover:underline'>{c.name}</span><span className='font-mono font-semibold tabular-nums'>{money(c.sales)}</span>
          </button>
        )) : <p className='text-sm text-muted-foreground'>No chatter sales recorded.</p>}
      </div>
      <div><ExpandLabel>Open tasks ({r.task_count})</ExpandLabel><TaskList tasks={r.tasks} /></div>
    </ExpandWrap>
  );

  const buildButton = (className) => (
    <Button onClick={generate} disabled={generating} className={className}><ListChecks />{generating ? 'Building…' : 'Build tasks'}</Button>
  );

  return (
    <div className='flex flex-col gap-4 sm:gap-6'>
      <div className='flex flex-wrap items-end justify-between gap-3'>
        <div>
          <h2 className='text-2xl font-bold tracking-tight'>{greet}, {user?.name?.split(' ')[0]}.</h2>
          <p className='text-muted-foreground'>
            Team overview for <span className='tabular-nums'>{date}</span>.{' '}
            <button type='button' onClick={() => navigate('/tasks')} className='inline-flex items-center gap-1 font-medium text-link hover:underline'>
              Tasks<ArrowRight className='size-3.5' />
            </button>
          </p>
        </div>
        <div className='flex flex-wrap items-center gap-2'>
          <Input type='date' aria-label='Report date' value={date} onChange={e => { setDate(e.target.value); load(e.target.value); }} className='w-auto tabular-nums' />
          {buildButton()}
        </div>
      </div>

      {loading ? (
        <div className='grid gap-4'>
          <div className='grid gap-4 md:grid-cols-[auto_1fr]'><Skeleton className='h-26 md:w-64' /><Skeleton className='h-26' /></div>
          <Skeleton className='h-20' />
          <Skeleton className='h-72' />
        </div>
      ) : !hasData ? (
        <div className='flex flex-col items-center rounded-lg border border-dashed px-6 py-12 text-center'>
          <div className='grid size-12 place-items-center rounded-full bg-muted'><BarChart3 className='size-6 text-muted-foreground' /></div>
          <h3 className='mt-4 text-lg font-semibold'>Nothing to show for {date} yet</h3>
          <p className='mt-1 text-sm text-muted-foreground'>Run the daily workflow and the team overview appears here:</p>
          <ol className='mt-6 grid w-full max-w-md gap-3 text-left text-sm'>
            {[
              ['1', <>Upload the <b>Message Dashboard</b> and <b>Creator Statistics</b> spreadsheets from Infloww.</>, '/reports', 'Go to Reports'],
              ['2', <>In <b>Daily Check</b>, press <b>Run daily review</b> — the AI analyses every chatter. <span className='text-muted-foreground'>(Run the <b>creator review</b> once a week.)</span></>, '/daily', 'Go to Daily Check'],
              ['3', <>Come back here and press <b>Build tasks</b> to build & rank the tasks and see the full overview.</>, null, null],
            ].map(([n, text, link, cta]) => (
              <li key={n} className='flex items-start gap-3'>
                <span className='grid size-6 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold tabular-nums'>{n}</span>
                <span className='flex-1 leading-relaxed'>
                  {text}
                  {link && <> <button type='button' onClick={() => navigate(link)} className='inline-flex items-center gap-1 font-medium text-link hover:underline'>{cta}<ArrowRight className='size-3.5' /></button></>}
                </span>
              </li>
            ))}
          </ol>
          {buildButton('mt-6')}
        </div>
      ) : (
        <>
          {/* task progress + AI review */}
          <div className='grid gap-4 md:grid-cols-[auto_1fr]'>
            <div className='flex items-center gap-4 rounded-lg border bg-card p-4'>
              <Donut counts={tc} />
              <dl className='grid gap-0.5 text-sm tabular-nums'>
                <div><span className='font-semibold text-good'>{tc.completed}</span> done</div>
                <div><span className='font-semibold text-info'>{tc.taken}</span> in progress</div>
                <div><span className='font-semibold'>{tc.open}</span> to do</div>
                <div className='text-muted-foreground'>{tc.dismissed} dismissed</div>
              </dl>
            </div>
            <div className='rounded-lg border bg-card p-4'>
              <p className='mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground'><Sparkles className='size-3.5' />Today's review · AI</p>
              {data.day_review
                ? <p className='text-sm leading-relaxed'>{data.day_review}</p>
                : <p className='text-sm text-muted-foreground'>Press <b className='text-foreground'>Build tasks</b> for the AI summary + task queue.</p>}
            </div>
          </div>

          {/* team totals */}
          {tt && (
            <div className='grid grid-cols-2 gap-4 lg:grid-cols-5'>
              {[
                { l: 'Team sales today', v: money(tt.sales), d: tt.sales_vs_prev_pct, suffix: '%' },
                { l: 'PPVs sent', v: tt.ppvs?.toLocaleString() },
                { l: 'Messages', v: tt.messages?.toLocaleString() },
                { l: 'Avg unlock', v: `${tt.unlock_avg}%` },
                { l: 'Working today', v: `${tt.working}/${tt.total}` },
              ].map((s, i) => (
                <div key={i} className={cn('rounded-lg border bg-card p-4', i === 0 && 'col-span-2 lg:col-span-1')}>
                  <p className='text-sm text-muted-foreground'>{s.l}</p>
                  <div className='mt-1 flex items-baseline gap-2'>
                    <span className='text-2xl font-bold tabular-nums'>{s.v}</span>
                    {s.d != null && <Delta v={s.d} suffix={s.suffix} />}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className='grid gap-2'>
            <SectionTitle title='Chatters' hint='Sorted by concern. Click a header to re-sort, the arrow to expand.' />
            <DataTable rows={data.chatters || []} columns={chatterCols} getKey={r => r.chatter_id} renderExpand={renderChatterExpand} />
          </div>

          <div className='grid gap-2'>
            <SectionTitle title='Pages' hint='Sorted by biggest money drop.' />
            <DataTable rows={data.pages || []} columns={pageCols} getKey={r => r.creator_id} renderExpand={renderPageExpand} />
          </div>
        </>
      )}
    </div>
  );
}
