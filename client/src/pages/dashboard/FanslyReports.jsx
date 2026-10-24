import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Download, Search } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import api from '@/services/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import DateRangePicker from '@/components/shared/DateRangePicker';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { num } from '@/utils/numbers';

const money = (n) => (n == null ? '·' : `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const short = (n) => (Math.abs(n) >= 1000 ? `$${(n / 1000).toFixed(1)}K` : `$${Math.round(n)}`);
const dayLabel = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString([], { day: 'numeric', month: 'short', timeZone: 'UTC' });
const amsToday = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Amsterdam' });
const pct = (n) => (n == null ? '·' : `${Number(n).toFixed(n % 1 ? 1 : 0)}%`);
const secs = (s) => (s == null ? '·' : s < 60 ? `${s} s` : s < 3600 ? `${Math.floor(s / 60)} min ${s % 60 ? `${s % 60} s` : ''}`.trim() : `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min`);
const ratioColor = (r) => (r == null ? 'text-muted-foreground' : r >= 5 ? 'text-emerald-600' : r >= 3 ? 'text-amber-600' : 'text-red-500');
const addDays = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

// one colour per kind of earning, the same everywhere on the page
const TYPES = [
  { k: 'subscriptions', label: 'Subscriptions', color: '#378ADD' },
  { k: 'messages', label: 'Messages', color: '#7F77DD' },
  { k: 'tips', label: 'Tips', color: '#1D9E75' },
  { k: 'media', label: 'Posts and other media', color: '#D85A30' },
  { k: 'other', label: 'Other', color: '#888780' },
];

/** The change against the days just before, as a percentage (null when there was nothing before). */
const change = (now, before) => (before ? ((now - before) / Math.abs(before)) * 100 : null);

function Delta({ now, before, className, lowerBetter }) {
  const c = change(now, before);
  if (c == null) return <span className={cn('text-xs text-muted-foreground', className)}>{now ? 'new' : '·'}</span>;
  return <span className={cn('text-xs tabular-nums', (c >= 0) !== !!lowerBetter ? 'text-emerald-600' : 'text-red-500', className)}>{c >= 0 ? '↑' : '↓'} {Math.abs(c).toFixed(2)}%</span>;
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
  const [range, setRange] = useState(() => ({ from: addDays(amsToday(), -6), to: amsToday() }));
  const [gross, setGross] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/api/fansly/messages/filters').then(r => { setPages(r.data.accounts || []); setOne(r.data.accounts?.[0]?.id || ''); })
      .catch(e => setError(e?.response?.data?.error || 'Could not load the pages'));
  }, []);
  const { from, to } = range;
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
  const reset = () => { setRange({ from: addDays(amsToday(), -6), to: amsToday() }); setPicked([]); setGross(false); };

  return (
    <div className='grid grid-cols-[minmax(0,1fr)] gap-4'>
      <div className='flex flex-wrap items-center gap-2'>
        <div className='inline-flex rounded-md border p-0.5'>
          <Button size='sm' variant={view === 'overview' ? 'default' : 'ghost'} onClick={() => setView('overview')}>Overview</Button>
          <Button size='sm' variant={view === 'performance' ? 'default' : 'ghost'} onClick={() => setView('performance')}>Creator performance</Button>
        </div>
        <DateRangePicker value={range} onChange={setRange} />
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
    const cols = ['page', 'subscriptions', 'tips', 'messages', 'messages_chat', 'messages_mass', 'media', 'other', 'refunds', 'total', 'share', 'ratio', 'ltv', 'subscriptions_bought', 'unlock_rate', 'golden_ratio', 'messages_sent', 'ppv_sent', 'ppv_bought', 'reply_s', 'fans_chatted', 'active_subscribers'];
    const esc = (v) => (v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
    const csv = [cols.join(','), ...rows.map(r => cols.map(c => esc(r[c])).join(','))].join('\n');
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = `fansly-creators-${from}-${to}${gross ? '-gross' : ''}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
  const incomplete = data.ledger.filter(l => l.total && l.read < l.total);

  return (
    <div className={cn('grid grid-cols-[minmax(0,1fr)] gap-4', data.loading && 'opacity-60')}>
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
          <span className='text-xs text-muted-foreground'>{num(data.metrics.subscriptions_bought)} subscriptions bought or renewed</span>
        </div>
      </section>

      <ChattingMetrics data={data} />

      <div className='grid gap-4 lg:grid-cols-3'>
        <div className='min-w-0 lg:col-span-2'><EarningsChart data={data} from={from} to={to} /></div>
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
            {head('media', 'Posts and media', 'text-right')}{head('total', 'Total earnings', 'text-right')}{head('share', 'Contribution', 'text-right')}
            {head('ratio', 'Ratio', 'text-right')}{head('ltv', 'LTV', 'text-right')}{head('unlock_rate', 'Unlock', 'text-right')}{head('golden_ratio', 'Golden', 'text-right')}
            {head('messages_sent', 'Messages sent', 'text-right')}{head('reply_s', 'Reply time', 'text-right')}{head('active_subscribers', 'Active subscribers', 'text-right')}
          </TableRow></TableHeader>
          <TableBody>
            {rows.map(r => (
              <TableRow key={r.account_id}>
                <TableCell className='whitespace-nowrap'>{r.page}</TableCell>
                {['subscriptions', 'tips', 'messages', 'media'].map(k => (
                  <TableCell key={k} className='whitespace-nowrap text-right tabular-nums'>{money(r[k])} <Delta now={r[k]} before={r.prev[k]} className='ml-1' /></TableCell>
                ))}
                <TableCell className='whitespace-nowrap text-right font-medium tabular-nums'>{money(r.total)} <Delta now={r.total} before={r.prev.total} className='ml-1 font-normal' /></TableCell>
                <TableCell className='text-right tabular-nums'>{r.share == null ? '·' : `${r.share.toFixed(2)}%`}</TableCell>
                <TableCell className={cn('text-right font-medium tabular-nums', ratioColor(r.ratio))}>{r.ratio == null ? '·' : r.ratio.toFixed(2)}</TableCell>
                <TableCell className='text-right tabular-nums'>{money(r.ltv)}</TableCell>
                <TableCell className='text-right tabular-nums' title={`${r.ppv_bought} of ${r.ppv_sent} chat PPVs bought`}>{pct(r.unlock_rate)}</TableCell>
                <TableCell className='text-right tabular-nums'>{pct(r.golden_ratio)}</TableCell>
                <TableCell className='text-right tabular-nums'>{num(r.messages_sent)}</TableCell>
                <TableCell className='whitespace-nowrap text-right tabular-nums'>{secs(r.reply_s)}</TableCell>
                <TableCell className='text-right tabular-nums'>{num(r.active_subscribers)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      <div className='grid gap-1 text-xs text-muted-foreground'>
        <p>Changes compare with the same number of days just before. Ratio: messages and tips for every dollar of subscriptions (target 5). LTV: earnings for every subscription bought or renewed. Unlock: chat PPVs bought out of those sent. Golden: chat PPVs out of all chat messages sent. Reply time: typical wait from a fan&apos;s message to the reply. Chatting numbers count the chats the extension recorded; mass messages are left out. Active subscribers: as of the last time the Subscribers list was read.</p>
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
    <div className='grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]'>
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

        <ChattingMetrics data={data} />
        <ChatterTable rows={data.chatters} />
      </div>
    </div>
  );
}

/** The OnlyFans dashboard's own numbers: ratio, LTV, unlock, golden, reply time, and the chatting behind them. */
function ChattingMetrics({ data }) {
  const m = data.metrics, c = data.chatting, pm = m.prev, pc = c.prev;
  const tiles = [
    { label: 'Ratio', value: m.ratio == null ? '·' : m.ratio.toFixed(2), now: m.ratio, before: pm.ratio, cls: ratioColor(m.ratio), hint: '(messages + tips) ÷ subscriptions · target 5' },
    { label: 'LTV', value: money(m.ltv), now: m.ltv, before: pm.ltv, hint: `earnings ÷ ${num(m.subscriptions_bought)} subscriptions bought` },
    { label: 'Unlock rate', value: pct(c.unlock_rate), now: c.unlock_rate, before: pc.unlock_rate, hint: `${num(c.ppv_bought)} of ${num(c.ppv_sent)} chat PPVs bought` },
    { label: 'Golden ratio', value: pct(c.golden_ratio), now: c.golden_ratio, before: pc.golden_ratio, hint: 'chat PPVs ÷ chat messages' },
    { label: 'Messages sent', value: num(c.messages), now: c.messages, before: pc.messages, hint: `${num(c.mass)} mass messages besides` },
    { label: 'Fans chatted', value: num(c.fans), now: c.fans, before: pc.fans, hint: `${num(c.buyers)} bought a PPV` },
    { label: 'PPV sales', value: money(c.ppv_sales), now: c.ppv_sales, before: pc.ppv_sales, hint: 'chat PPVs bought' },
    { label: 'Reply time', value: secs(c.reply_s), now: c.reply_s, before: pc.reply_s, lower: true, hint: `typical, over ${num(c.replies)} replies` },
    { label: 'Per day', value: money(m.per_day), now: m.per_day, before: pm.per_day, hint: 'average earnings' },
  ];
  return (
    <section className='rounded-lg border bg-card p-4'>
      <h3 className='mb-3 text-sm font-medium'>Chatting metrics</h3>
      <div className='grid grid-cols-[repeat(auto-fill,minmax(118px,1fr))] gap-x-4 gap-y-3'>
        {tiles.map(t => (
          <div key={t.label} title={t.hint}>
            <p className='text-xs text-muted-foreground'>{t.label}</p>
            <p className={cn('text-lg font-semibold tabular-nums', t.cls)}>{t.value}</p>
            <Delta now={t.now || 0} before={t.before} lowerBetter={t.lower} />
            <p className='truncate text-[11px] text-muted-foreground'>{t.hint}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/** One row per chatter on this page, like the chatter table on the OnlyFans dashboard. */
function ChatterTable({ rows }) {
  return (
    <section className='rounded-lg border bg-card'>
      <h3 className='border-b px-4 py-2 text-sm font-medium'>By chatter</h3>
      {!rows.length ? <p className='px-4 py-6 text-center text-xs text-muted-foreground'>No chats recorded in these days.</p> : (
        <Table>
          <TableHeader><TableRow>
            <TableHead>Chatter</TableHead><TableHead className='text-right'>Credited sales</TableHead><TableHead className='text-right'>PPV sales</TableHead>
            <TableHead className='text-right'>PPVs</TableHead><TableHead className='text-right'>Unlock</TableHead><TableHead className='text-right'>Golden</TableHead>
            <TableHead className='text-right'>Messages</TableHead><TableHead className='text-right'>Fans</TableHead><TableHead className='text-right'>Reply time</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {rows.map(r => (
              <TableRow key={r.chatter_id || 'none'}>
                <TableCell className={cn('whitespace-nowrap', !r.chatter_id && 'text-muted-foreground')}>{r.name}</TableCell>
                <TableCell className='whitespace-nowrap text-right tabular-nums'>{r.chatter_id ? <>{money(r.sales)} <Delta now={r.sales} before={r.prev?.sales} className='ml-1' /></> : '·'}</TableCell>
                <TableCell className='text-right tabular-nums'>{money(r.ppv_sales)}</TableCell>
                <TableCell className='text-right tabular-nums'>{num(r.ppv_bought)} / {num(r.ppv_sent)}</TableCell>
                <TableCell className='text-right tabular-nums'>{pct(r.unlock_rate)}</TableCell>
                <TableCell className='text-right tabular-nums'>{pct(r.golden_ratio)}</TableCell>
                <TableCell className='text-right tabular-nums'>{num(r.messages)}{r.mass ? <span className='text-muted-foreground'> + {num(r.mass)} mass</span> : null}</TableCell>
                <TableCell className='text-right tabular-nums'>{num(r.fans)}</TableCell>
                <TableCell className='whitespace-nowrap text-right tabular-nums'>{secs(r.reply_s)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <p className='border-t px-4 py-2 text-xs text-muted-foreground'>Credited sales follow the page&apos;s credit rules (PPVs to whoever sent them through the extension, tips to the last chatter within the hour or the chatters on shift). &quot;No chatter signed in&quot; are messages sent without the extension signed in, so nobody is credited for them.</p>
    </section>
  );
}
