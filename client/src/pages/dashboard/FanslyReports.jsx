import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Download, Search } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import api from '@/services/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { num } from '@/utils/numbers';

const money = (n) => (n == null ? '·' : `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const short = (n) => (Math.abs(n) >= 1000 ? `$${(n / 1000).toFixed(1)}K` : `$${Math.round(n)}`);
const when = (iso) => (iso ? new Date(iso).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }) : '');
const dayLabel = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString([], { day: 'numeric', month: 'short', timeZone: 'UTC' });
const amsToday = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Amsterdam' });
const addDays = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

// one colour per kind of earning, the same everywhere on the page
const TYPES = [
  { k: 'subscriptions', label: 'Subscriptions', color: '#378ADD' },
  { k: 'messages', label: 'Messages', color: '#7F77DD' },
  { k: 'tips', label: 'Tips', color: '#1D9E75' },
  { k: 'media', label: 'Posts and other media', color: '#D85A30' },
  { k: 'other', label: 'Other', color: '#888780' },
];

const RANGES = [
  ['today', 'Today'], ['yesterday', 'Yesterday'], ['7', 'Last 7 days'], ['30', 'Last 30 days'],
  ['month', 'This month'], ['last_month', 'Last month'], ['year', 'This year'], ['custom', 'Pick dates'],
];
function rangeDays(v, custom) {
  const t = amsToday();
  if (v === 'today') return [t, t];
  if (v === 'yesterday') return [addDays(t, -1), addDays(t, -1)];
  if (v === '7') return [addDays(t, -6), t];
  if (v === '30') return [addDays(t, -29), t];
  if (v === 'month') return [`${t.slice(0, 8)}01`, t];
  if (v === 'last_month') { const first = `${t.slice(0, 8)}01`; const end = addDays(first, -1); return [`${end.slice(0, 8)}01`, end]; }
  if (v === 'year') return [`${t.slice(0, 4)}-01-01`, t];
  return [custom.from || addDays(t, -6), custom.to || t];
}
/** The change against the days just before, as a percentage (null when there was nothing before). */
const change = (now, before) => (before ? ((now - before) / Math.abs(before)) * 100 : null);

function Delta({ now, before, className }) {
  const c = change(now, before);
  if (c == null) return <span className={cn('text-xs text-muted-foreground', className)}>{now ? 'new' : '·'}</span>;
  return <span className={cn('text-xs tabular-nums', c >= 0 ? 'text-emerald-600' : 'text-red-500', className)}>{c >= 0 ? '↑' : '↓'} {Math.abs(c).toFixed(2)}%</span>;
}

/**
 * Creator reports for Fansly, like Infloww's: the platform picked in the
 * sidebar, any dates, one page or several. Overview: the earnings summary,
 * earnings by day, the breakdown and a row per page. Creator performance: one
 * page at a time, with the hours sales come in, top fans and subscribers.
 */
export default function FanslyReports() {
  const [view, setView] = useState('overview');
  const [pages, setPages] = useState(null);
  const [picked, setPicked] = useState([]);           // the pages in the overview (empty: all)
  const [one, setOne] = useState('');                 // the page in Creator performance
  const [range, setRange] = useState('7');
  const [custom, setCustom] = useState({ from: '', to: '' });
  const [gross, setGross] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/api/fansly/messages/filters').then(r => { setPages(r.data.accounts || []); setOne(r.data.accounts?.[0]?.id || ''); })
      .catch(e => setError(e?.response?.data?.error || 'Could not load the pages'));
  }, []);
  const [from, to] = rangeDays(range, custom);
  const accounts = view === 'performance' ? (one ? [one] : []) : picked;
  const query = `from=${from}&to=${to}&accounts=${accounts.join(',')}${gross ? '&gross=1' : ''}`;
  useEffect(() => {
    if (!pages || (view === 'performance' && !one)) return undefined;
    let live = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setData(d => (d ? { ...d, loading: true } : null));
    api.get(`/api/fansly/reports?${query}`).then(r => { if (live) setData(r.data); }).catch(e => { if (live) setError(e?.response?.data?.error || 'Could not load the report'); });
    return () => { live = false; };
  }, [query, pages, view, one]);

  if (error) return <p className='text-sm text-muted-foreground'>{error}</p>;
  if (!pages) return <Skeleton className='h-64 w-full' />;
  if (!pages.length) return <p className='text-sm text-muted-foreground'>No Fansly page recorded yet.</p>;
  const reset = () => { setRange('7'); setCustom({ from: '', to: '' }); setPicked([]); setGross(false); };

  return (
    <div className='grid gap-4'>
      <div className='flex flex-wrap items-center gap-2'>
        <div className='inline-flex rounded-md border p-0.5'>
          <Button size='sm' variant={view === 'overview' ? 'default' : 'ghost'} onClick={() => setView('overview')}>Overview</Button>
          <Button size='sm' variant={view === 'performance' ? 'default' : 'ghost'} onClick={() => setView('performance')}>Creator performance</Button>
        </div>
        <Select value={range} onValueChange={setRange}>
          <SelectTrigger className='w-36'><SelectValue /></SelectTrigger>
          <SelectContent>{RANGES.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
        </Select>
        {range === 'custom' ? <>
          <Input type='date' value={custom.from} max={custom.to || undefined} onChange={e => setCustom(c => ({ ...c, from: e.target.value }))} className='w-36' aria-label='From' />
          <span className='text-xs text-muted-foreground'>to</span>
          <Input type='date' value={custom.to} min={custom.from || undefined} onChange={e => setCustom(c => ({ ...c, to: e.target.value }))} className='w-36' aria-label='To' />
        </> : <span className='text-xs text-muted-foreground'>{dayLabel(from)}{from !== to ? ` → ${dayLabel(to)}` : ''}</span>}
        {view === 'overview' && pages.length > 1 && <PagePicker pages={pages} picked={picked} onChange={setPicked} />}
        <div className='flex items-center gap-2'>
          <Switch id='net' checked={!gross} onCheckedChange={(v) => setGross(!v)} />
          <Label htmlFor='net' className='text-sm'>Show net earnings</Label>
        </div>
        <Button size='sm' variant='ghost' onClick={reset}>Reset</Button>
        <span className='ml-auto text-xs text-muted-foreground'>Amsterdam time</span>
      </div>

      {!data ? <Skeleton className='h-96 w-full' /> : view === 'overview'
        ? <Overview data={data} from={from} to={to} gross={gross} />
        : <Performance data={data} pages={pages} one={one} setOne={setOne} from={from} to={to} />}
    </div>
  );
}

function PagePicker({ pages, picked, onChange }) {
  const label = !picked.length ? 'Creator: all' : picked.length === 1 ? pages.find(p => p.id === picked[0])?.page : `${picked.length} creators`;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button size='sm' variant='outline'>{label} <ChevronDown className='size-3.5' /></Button></DropdownMenuTrigger>
      <DropdownMenuContent align='start'>
        <DropdownMenuCheckboxItem checked={!picked.length} onCheckedChange={() => onChange([])}>All creators</DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        {pages.map(p => (
          <DropdownMenuCheckboxItem key={p.id} checked={picked.includes(p.id)} onSelect={e => e.preventDefault()}
            onCheckedChange={(v) => onChange(v ? [...picked, p.id] : picked.filter(x => x !== p.id))}>{p.page}</DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Every day (or week, month, hour of the day) in the range, with each kind of earning. */
function buckets(byHour, from, to, by) {
  const zero = () => Object.fromEntries(TYPES.map(t => [t.k, 0]));
  const out = new Map();
  if (by === 'hour') for (let h = 0; h < 24; h++) out.set(h, { label: `${String(h).padStart(2, '0')}:00`, ...zero() });
  else {
    for (let d = from; d <= to; d = addDays(d, 1)) {
      const k = by === 'day' ? d : by === 'month' ? d.slice(0, 7) : weekStart(d);
      if (!out.has(k)) out.set(k, { label: by === 'month' ? new Date(`${k}-15T12:00:00Z`).toLocaleDateString([], { month: 'short', year: '2-digit', timeZone: 'UTC' }) : dayLabel(k), ...zero() });
    }
  }
  for (const h of byHour) {
    const k = by === 'hour' ? h.hour : by === 'day' ? h.day : by === 'month' ? h.day.slice(0, 7) : weekStart(h.day);
    const b = out.get(k); if (!b) continue;
    for (const t of TYPES) b[t.k] += h[t.k] || 0;
  }
  return [...out.values()].map(b => ({ ...b, ...Object.fromEntries(TYPES.map(t => [t.k, Math.round(b[t.k] * 100) / 100])) }));
}
function weekStart(d) { const wd = (new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7; return addDays(d, -wd); }

function EarningsChart({ data, from, to, only }) {
  const days = Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1;
  const [by, setBy] = useState(days > 120 ? 'month' : days > 45 ? 'week' : 'day');
  const rows = useMemo(() => buckets(data.by_hour, from, to, by), [data.by_hour, from, to, by]);
  const shown = only ? TYPES.filter(t => t.k === only) : TYPES;
  return (
    <section className='rounded-lg border bg-card p-4'>
      <div className='mb-2 flex items-center justify-between'>
        <h3 className='text-sm font-medium'>Earnings trends</h3>
        <div className='flex gap-1'>
          {[['hour', 'Hour'], ['day', 'Day'], ['week', 'Week'], ['month', 'Month']].map(([v, l]) => (
            <Button key={v} size='sm' variant={by === v ? 'secondary' : 'ghost'} className='h-7 px-2 text-xs' onClick={() => setBy(v)}>{l}</Button>
          ))}
        </div>
      </div>
      <div className='h-64'>
        <ResponsiveContainer width='100%' height='100%'>
          <BarChart data={rows} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke='currentColor' strokeOpacity={0.1} />
            <XAxis dataKey='label' tick={{ fontSize: 11, fill: 'currentColor', opacity: 0.6 }} tickLine={false} axisLine={false} interval='preserveStartEnd' />
            <YAxis tick={{ fontSize: 11, fill: 'currentColor', opacity: 0.6 }} tickLine={false} axisLine={false} tickFormatter={short} width={48} />
            <Tooltip cursor={{ fillOpacity: 0.06 }} contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12 }} formatter={(v, k) => [money(v), TYPES.find(t => t.k === k)?.label]} />
            {shown.map((t, i) => <Bar key={t.k} dataKey={t.k} stackId='a' fill={t.color} radius={i === shown.length - 1 ? [3, 3, 0, 0] : 0} maxBarSize={56} />)}
          </BarChart>
        </ResponsiveContainer>
      </div>
      {by === 'hour' && <p className='mt-1 text-xs text-muted-foreground'>Each bar adds up that hour over every day in the range.</p>}
    </section>
  );
}

function Breakdown({ totals }) {
  const parts = TYPES.map(t => ({ ...t, value: totals[t.k] || 0 }));
  const sum = parts.reduce((s, p) => s + p.value, 0);
  return (
    <section className='rounded-lg border bg-card p-4'>
      <h3 className='mb-2 text-sm font-medium'>Earnings breakdown</h3>
      <div className='h-40'>
        {sum > 0 ? (
          <ResponsiveContainer width='100%' height='100%'>
            <PieChart>
              <Pie data={parts.filter(p => p.value > 0)} dataKey='value' nameKey='label' innerRadius='62%' outerRadius='92%' paddingAngle={1} stroke='none'>
                {parts.filter(p => p.value > 0).map(p => <Cell key={p.k} fill={p.color} />)}
              </Pie>
              <Tooltip contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12 }} formatter={(v) => money(v)} />
            </PieChart>
          </ResponsiveContainer>
        ) : <p className='pt-14 text-center text-xs text-muted-foreground'>No earnings in these days.</p>}
      </div>
      <div className='mt-2 grid gap-1 text-xs'>
        {parts.map(p => (
          <div key={p.k} className='flex items-center gap-2'>
            <span className='size-2 rounded-full' style={{ background: p.color }} />
            <span className='flex-1'>{p.label}</span>
            <span className='w-14 text-right tabular-nums text-muted-foreground'>{sum ? `${((p.value / sum) * 100).toFixed(2)}%` : '0%'}</span>
            <span className='w-20 text-right tabular-nums'>{money(p.value)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Overview({ data, from, to, gross }) {
  const t = data.totals, p = data.prev_totals;
  const [sort, setSort] = useState({ k: 'total', dir: -1 });
  const rows = [...data.pages].sort((a, b) => ((a[sort.k] ?? -1) - (b[sort.k] ?? -1)) * sort.dir);
  const head = (k, label, cls) => (
    <TableHead className={cn('cursor-pointer select-none whitespace-nowrap', cls)} onClick={() => setSort(s => ({ k, dir: s.k === k ? -s.dir : -1 }))}>
      {label}{sort.k === k ? (sort.dir < 0 ? ' ↓' : ' ↑') : ''}
    </TableHead>
  );
  const exportCsv = () => {
    const cols = ['page', 'subscriptions', 'tips', 'messages', 'messages_chat', 'messages_mass', 'media', 'other', 'refunds', 'total', 'engagement_ratio', 'share', 'active_subscribers', 'ppv_sent', 'ppv_sold', 'buy_rate'];
    const esc = (v) => (v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
    const csv = [cols.join(','), ...rows.map(r => cols.map(c => esc(r[c])).join(','))].join('\n');
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = `fansly-creators-${from}-${to}${gross ? '-gross' : ''}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
  const incomplete = data.ledger.filter(l => l.total && l.read < l.total);

  return (
    <div className={cn('grid gap-4', data.loading && 'opacity-60')}>
      <section className='grid gap-2 lg:grid-cols-4'>
        <div className='rounded-lg border bg-card p-4 lg:row-span-2'>
          <p className='text-sm text-muted-foreground'>Total earnings</p>
          <p className='mt-1 text-3xl font-semibold tabular-nums'>{money(t.total)}</p>
          <Delta now={t.total} before={p.total} className='text-sm' />
          <p className='mt-4 text-xs text-muted-foreground'>Refunded</p>
          <p className='tabular-nums'>{money(t.refunds)}</p>
          <p className='mt-2 text-xs text-muted-foreground'>{num(t.sales)} purchases · compared with {dayLabel(data.prev_from)} → {dayLabel(data.prev_to)}</p>
        </div>
        {[...TYPES.slice(0, 2), TYPES[3], TYPES[2], TYPES[4]].map(x => (
          <div key={x.k} className='rounded-lg border bg-card p-3'>
            <p className='flex items-center gap-1.5 text-sm text-muted-foreground'><span className='size-2 rounded-full' style={{ background: x.color }} />{x.label}</p>
            <p className='mt-0.5 text-xl font-semibold tabular-nums'>{money(t[x.k])}</p>
            <div className='flex items-center gap-2'>
              <Delta now={t[x.k]} before={p[x.k]} />
              {x.k === 'messages' && <span className='text-xs text-muted-foreground'>chat {money(t.messages_chat)} · mass {money(t.messages_mass)}</span>}
            </div>
          </div>
        ))}
        <div className='rounded-lg border bg-card p-3'>
          <p className='text-sm text-muted-foreground'>Paying fans</p>
          <p className='mt-0.5 text-xl font-semibold tabular-nums'>{num(data.paying_fans)}</p>
          <span className='text-xs text-muted-foreground'>{num(data.new_subscribers.length)} new subscribers</span>
        </div>
      </section>

      <div className='grid gap-4 lg:grid-cols-3'>
        <div className='lg:col-span-2'><EarningsChart data={data} from={from} to={to} /></div>
        <Breakdown totals={t} />
      </div>

      <section className='rounded-lg border bg-card'>
        <div className='flex items-center justify-between border-b px-4 py-2'>
          <h3 className='text-sm font-medium'>Creator statistics</h3>
          <Button size='sm' variant='outline' onClick={exportCsv}><Download className='size-3.5' /> Export</Button>
        </div>
        <Table>
          <TableHeader><TableRow>
            {head('page', 'Creator')}
            {head('subscriptions', 'Subscriptions', 'text-right')}{head('tips', 'Tips', 'text-right')}{head('messages', 'Messages', 'text-right')}
            {head('media', 'Posts and media', 'text-right')}{head('engagement_ratio', 'Engagement ratio', 'text-right')}{head('total', 'Total earnings', 'text-right')}
            {head('share', 'Contribution', 'text-right')}{head('active_subscribers', 'Active subscribers', 'text-right')}{head('buy_rate', 'PPV buy rate', 'text-right')}
          </TableRow></TableHeader>
          <TableBody>
            {rows.map(r => (
              <TableRow key={r.account_id}>
                <TableCell className='whitespace-nowrap'>{r.page}</TableCell>
                {['subscriptions', 'tips', 'messages', 'media'].map(k => (
                  <TableCell key={k} className='whitespace-nowrap text-right tabular-nums'>{money(r[k])} <Delta now={r[k]} before={r.prev[k]} className='ml-1' /></TableCell>
                ))}
                <TableCell className='whitespace-nowrap text-right tabular-nums'>{r.engagement_ratio == null ? '·' : `${r.engagement_ratio.toFixed(2)}%`}</TableCell>
                <TableCell className='whitespace-nowrap text-right font-medium tabular-nums'>{money(r.total)} <Delta now={r.total} before={r.prev.total} className='ml-1 font-normal' /></TableCell>
                <TableCell className='text-right tabular-nums'>{r.share == null ? '·' : `${r.share.toFixed(2)}%`}</TableCell>
                <TableCell className='text-right tabular-nums'>{num(r.active_subscribers)}</TableCell>
                <TableCell className='whitespace-nowrap text-right tabular-nums' title={`${r.ppv_sold} of ${r.ppv_sent} PPVs sent through the extension were bought`}>{r.buy_rate == null ? '·' : `${r.buy_rate}%`}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      <div className='grid gap-1 text-xs text-muted-foreground'>
        <p>Changes compare with the same number of days just before. Engagement ratio: messages and tips for every dollar of subscriptions. Active subscribers: as of the last time the Subscribers list was read. PPV buy rate: only PPVs sent through the extension.</p>
        <p>Fansly does not say whether media was bought in a chat or on a post. Messages counts media bought from a chat message the extension has seen; the rest is under Posts and other media, and moves to Messages as more chats are opened with the extension on.</p>
        {incomplete.map(l => <p key={l.account_id} className='text-amber-600'>{l.page}: {num(l.read)} of {num(l.total)} sales read so far. Press Earnings, everything on the Pages tab to read the rest.</p>)}
      </div>
    </div>
  );
}

function Performance({ data, pages, one, setOne, from, to }) {
  const [q, setQ] = useState('');
  const [only, setOnly] = useState('');
  const t = data.totals, p = data.prev_totals;
  const list = pages.filter(x => x.page.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className='grid gap-4 lg:grid-cols-[220px_1fr]'>
      <aside className='grid content-start gap-1'>
        <div className='relative mb-1'>
          <Search className='absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground' />
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder='Search' className='pl-8' />
        </div>
        {list.map(x => (
          <button key={x.id} type='button' onClick={() => setOne(x.id)}
            className={cn('rounded-md px-3 py-2 text-left text-sm hover:bg-muted', x.id === one && 'bg-muted font-medium')}>{x.page}</button>
        ))}
      </aside>

      <div className={cn('grid min-w-0 gap-4', data.loading && 'opacity-60')}>
        <div className='flex flex-wrap gap-1'>
          <Button size='sm' variant={!only ? 'default' : 'outline'} onClick={() => setOnly('')}>All</Button>
          {TYPES.map(x => <Button key={x.k} size='sm' variant={only === x.k ? 'default' : 'outline'} onClick={() => setOnly(x.k)}>{x.label}</Button>)}
        </div>
        <EarningsChart data={data} from={from} to={to} only={only} />

        <section className='grid gap-2 sm:grid-cols-3 lg:grid-cols-6'>
          <div className='rounded-lg border bg-card p-3'>
            <p className='text-xs text-muted-foreground'>Total</p>
            <p className='text-lg font-semibold tabular-nums'>{money(t.total)}</p>
            <Delta now={t.total} before={p.total} />
          </div>
          {TYPES.map(x => (
            <div key={x.k} className='rounded-lg border bg-card p-3'>
              <p className='flex items-center gap-1.5 text-xs text-muted-foreground'><span className='size-2 rounded-full' style={{ background: x.color }} />{x.label}</p>
              <p className='text-lg font-semibold tabular-nums'>{money(t[x.k])}</p>
              <Delta now={t[x.k]} before={p[x.k]} />
            </div>
          ))}
        </section>

        <Heatmap data={data} from={from} to={to} only={only} />

        <div className='grid gap-4 xl:grid-cols-3'>
          <FanList title='Top fans' empty='No purchases in these days.' rows={data.top_fans} right={f => <>{money(f.total)} <span className='text-muted-foreground'>· {f.purchases}</span></>} />
          <FanList title={`New subscribers (${data.new_subscribers.length})`} empty='No new subscribers in these days.' rows={data.new_subscribers} right={f => <span className='text-muted-foreground'>{when(f.at)}</span>} />
          <FanList title={`Subscriptions ended (${data.ended_subscriptions.length})`} empty='No subscriptions ended in these days.' rows={data.ended_subscriptions} right={f => <span className='text-muted-foreground'>{when(f.at)}</span>} />
        </div>
      </div>
    </div>
  );
}

/** When sales come in: a square per day and hour, darker for more money. */
function Heatmap({ data, from, to, only }) {
  const days = [];
  for (let d = from; d <= to && days.length < 62; d = addDays(d, 1)) days.push(d);
  const val = new Map();
  for (const h of data.by_hour) val.set(`${h.day}|${h.hour}`, only ? h[only] || 0 : TYPES.reduce((s, x) => s + (h[x.k] || 0), 0));
  const max = Math.max(0, ...val.values());
  return (
    <section className='rounded-lg border bg-card p-4'>
      <h3 className='mb-2 text-sm font-medium'>Earnings heatmap</h3>
      <div className='overflow-x-auto'>
        <table className='border-separate border-spacing-0.5 text-[10px] text-muted-foreground'>
          <thead><tr><th />{Array.from({ length: 24 }, (_, h) => <th key={h} className='w-5 font-normal'>{h % 3 === 0 ? h : ''}</th>)}</tr></thead>
          <tbody>
            {days.map(d => (
              <tr key={d}>
                <td className='whitespace-nowrap pr-2'>{dayLabel(d)}</td>
                {Array.from({ length: 24 }, (_, h) => {
                  const v = val.get(`${d}|${h}`) || 0;
                  return <td key={h} title={v ? `${dayLabel(d)} ${h}:00 · ${money(v)}` : undefined} className='h-4 w-5 rounded-sm'
                    style={{ background: v && max ? `rgba(127,119,221,${0.2 + 0.8 * (v / max)})` : 'var(--muted)' }} />;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {days.length >= 62 && <p className='mt-1 text-xs text-muted-foreground'>Showing the first 62 days of the range.</p>}
    </section>
  );
}

function FanList({ title, rows, right, empty }) {
  return (
    <section className='rounded-lg border bg-card'>
      <h3 className='border-b px-4 py-2 text-sm font-medium'>{title}</h3>
      {!rows.length ? <p className='px-4 py-6 text-center text-xs text-muted-foreground'>{empty}</p> : (
        <div className='max-h-80 overflow-y-auto'>
          {rows.map((f, i) => (
            <div key={`${f.fan_account_id}:${i}`} className='flex items-center justify-between gap-2 border-b px-4 py-1.5 text-sm last:border-0'>
              <span className='truncate'>{f.name}</span><span className='whitespace-nowrap text-xs tabular-nums'>{right(f)}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
