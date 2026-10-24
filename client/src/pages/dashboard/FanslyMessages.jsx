import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, ExternalLink, Loader2, Search, X } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/services/api';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { num } from '@/utils/numbers';

const when = (iso) => (iso ? new Date(iso).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }) : '');
const money = (n) => (n == null ? '' : `$${Number(n).toFixed(2)}`);
const wait = (s) => (s == null ? '' : s < 60 ? `${s} s` : s < 3600 ? `${Math.round(s / 60)} min` : s < 86400 ? `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min` : `${Math.round(s / 86400)} d`);
const ymd = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const fanName = (r) => r.fan_nickname || r.display_name || (r.fan_username ? `@${r.fan_username}` : r.fan_account_id ? `#${String(r.fan_account_id).slice(-6)}` : 'Mass message');

const RANGES = [
  { v: 'today', label: 'Today', days: 0 },
  { v: '7', label: 'Last 7 days', days: 6 },
  { v: '30', label: 'Last 30 days', days: 29 },
  { v: 'all', label: 'All time', days: null },
  { v: 'custom', label: 'Pick dates', days: null },
];
const START = { account: 'all', chatter: 'all', range: '7', from: '', to: '', view: 'chat', purchased: 'all', status: 'all', replied: 'all', price_min: '', price_max: '', q: '', fan: null };

/** Page numbers to show: the first, the last, and two either side of the current one. */
function pageList(page, pages) {
  const out = [];
  for (let n = 1; n <= pages; n++) if (n === 1 || n === pages || Math.abs(n - page) <= 2) out.push(n);
  return out.flatMap((n, k) => (k && n - out[k - 1] > 1 ? ['…', n] : [n]));
}

/**
 * Every chat message the team sent from each Fansly page, newest first, laid
 * out like Infloww's message dashboard: who sent it, from which page, the
 * fan's message it answered, how fast, the price and whether he bought it.
 * Numbered pages; "Open" opens the chat in your own browser where the
 * extension runs (or on fansly.com). Mass messages have their own list.
 */
export default function FanslyMessages() {
  const [opts, setOpts] = useState({ accounts: [], chatters: [] });
  const [f, setF] = useState(START);
  const [mass, setMass] = useState(null);       // { rows, totals, truncated } in the mass view
  const [search, setSearch] = useState('');
  const [price, setPrice] = useState({ min: '', max: '' });
  const [data, setData] = useState(null);       // { rows, total, totals, my_browsers }
  const [size, setSize] = useState(50);
  // the page number belongs to one filter: a new filter starts at page 1
  const fkey = JSON.stringify(f) + size;
  const [pg, setPg] = useState({ key: fkey, n: 1 });
  const page = pg.key === fkey ? pg.n : 1;
  const setPage = (n) => setPg({ key: fkey, n });
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [open, setOpen] = useState(null);       // { account_id, fan_account_id, focus }
  const reqId = useRef(0);

  useEffect(() => { api.get('/api/fansly/messages/filters').then(r => setOpts(r.data)).catch(() => {}); }, []);
  // typing waits a moment before asking the server
  useEffect(() => { const t = setTimeout(() => setF(x => (x.q === search ? x : { ...x, q: search })), 400); return () => clearTimeout(t); }, [search]);
  useEffect(() => { const t = setTimeout(() => setF(x => (x.price_min === price.min && x.price_max === price.max ? x : { ...x, price_min: price.min, price_max: price.max })), 500); return () => clearTimeout(t); }, [price]);

  const params = useMemo(() => {
    const p = new URLSearchParams();
    if (f.account !== 'all') p.set('account', f.account);
    if (f.chatter !== 'all') p.set('chatter', f.chatter);
    const r = RANGES.find(x => x.v === f.range);
    if (f.range === 'custom') { if (f.from) p.set('from', f.from); if (f.to) p.set('to', f.to); }
    else if (r && r.days != null) { const now = new Date(); p.set('from', ymd(new Date(now.getTime() - r.days * 86400000))); p.set('to', ymd(now)); }
    if (f.q.trim()) p.set('q', f.q.trim());
    if (f.fan) p.set('fan', f.fan.id);
    if (f.price_min !== '') p.set('price_min', f.price_min);
    if (f.price_max !== '') p.set('price_max', f.price_max);
    if (f.purchased !== 'all') p.set('purchased', f.purchased);
    if (f.status !== 'all') p.set('status', f.status);
    if (f.status === 'unsent') p.set('unsent', '1');       // (the mass list's filter)
    if (f.replied !== 'all') p.set('replied', f.replied);
    return p;
  }, [f]);

  const load = useCallback(() => {
    const id = ++reqId.current;
    setError('');
    if (f.view === 'mass') {
      setMass(null);
      api.get(`/api/fansly/messages/mass?${params}`)
        .then(r => { if (id === reqId.current) setMass(r.data); })
        .catch(e => { if (id === reqId.current) setError(e?.response?.data?.error || 'Could not load the mass messages'); });
      return;
    }
    setData(d => (d ? { ...d, loading: true } : null));
    const p = new URLSearchParams(params); p.set('page', String(page)); p.set('size', String(size));
    api.get(`/api/fansly/messages?${p}`)
      .then(r => { if (id === reqId.current) setData(r.data); })
      .catch(e => { if (id === reqId.current) setError(e?.response?.data?.error || 'Could not load the messages'); });
  }, [params, f.view, page, size]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const exportCsv = async () => {
    setExporting(true);
    try {
      const { data: blob } = await api.get(`/api/fansly/messages.csv?${params}`, { responseType: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `fansly-messages-${ymd(new Date())}.csv`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) {
      let msg = 'Could not export';
      try { msg = JSON.parse(await e.response.data.text()).error || msg; } catch { /* keep */ }
      toast.error(msg);
    } finally { setExporting(false); }
  };

  // "Open": in my own browser when my extension is on that page right now, otherwise on fansly.com in a new tab
  const openChat = async (r) => {
    if (!r.group_id) return;
    if (!(data?.my_browsers || []).includes(r.account_id)) { window.open(r.chat_url, '_blank', 'noopener'); return; }
    try {
      const { data: res } = await api.post('/api/fansly/messages/open', { account_id: r.account_id, group_id: r.group_id });
      if (res.sent) toast.success('Opening the chat in your browser'); else window.open(res.url, '_blank', 'noopener');
    } catch (e) { toast.error(e?.response?.data?.error || 'Could not open the chat'); }
  };

  const set = (k) => (v) => setF(x => ({ ...x, [k]: v }));
  const rows = data?.rows;
  const t = data?.totals;
  const pages = data ? Math.max(1, Math.ceil(data.total / size)) : 1;
  const changed = JSON.stringify({ ...f, view: 'chat' }) !== JSON.stringify(START);

  return (
    <div className='grid gap-4'>
      <div className='flex flex-wrap items-center gap-2'>
        <div className='inline-flex rounded-md border p-0.5'>
          <Button size='sm' variant={f.view === 'chat' ? 'default' : 'ghost'} onClick={() => set('view')('chat')}>Chat messages</Button>
          <Button size='sm' variant={f.view === 'mass' ? 'default' : 'ghost'} onClick={() => set('view')('mass')}>Mass messages</Button>
        </div>
        <div className='relative min-w-48 flex-1'>
          <Search className='absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground' />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder='Search in the text' className='pl-8' />
        </div>
        <Select value={f.range} onValueChange={set('range')}>
          <SelectTrigger className='w-36'><SelectValue /></SelectTrigger>
          <SelectContent>{RANGES.map(r => <SelectItem key={r.v} value={r.v}>{r.label}</SelectItem>)}</SelectContent>
        </Select>
        {f.range === 'custom' && <>
          <Input type='date' value={f.from} max={f.to || undefined} onChange={e => set('from')(e.target.value)} className='w-36' aria-label='From' />
          <span className='text-xs text-muted-foreground'>to</span>
          <Input type='date' value={f.to} min={f.from || undefined} onChange={e => set('to')(e.target.value)} className='w-36' aria-label='To' />
        </>}
        {f.view === 'chat' && <Button size='sm' variant='outline' onClick={exportCsv} disabled={exporting}>
          {exporting ? <Loader2 className='size-3.5 animate-spin' /> : <Download className='size-3.5' />} CSV
        </Button>}
      </div>

      <div className='flex flex-wrap items-center gap-2'>
        <Select value={f.chatter} onValueChange={set('chatter')}>
          <SelectTrigger className='w-40'><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>Sender: everyone</SelectItem>
            {opts.chatters.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            <SelectItem value='none'>Not attributed</SelectItem>
          </SelectContent>
        </Select>
        {opts.accounts.length > 1 && (
          <Select value={f.account} onValueChange={set('account')}>
            <SelectTrigger className='w-40'><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>Creator: all pages</SelectItem>
              {opts.accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.page}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {f.view === 'chat' && <>
          <FanPicker value={f.fan} onChange={set('fan')} />
          <div className='flex items-center gap-1'>
            <Input inputMode='decimal' value={price.min} onChange={e => setPrice(x => ({ ...x, min: e.target.value.replace(/[^\d.]/g, '') }))} placeholder='Price min' className='w-24' />
            <span className='text-xs text-muted-foreground'>–</span>
            <Input inputMode='decimal' value={price.max} onChange={e => setPrice(x => ({ ...x, max: e.target.value.replace(/[^\d.]/g, '') }))} placeholder='max' className='w-20' />
          </div>
          <Select value={f.purchased} onValueChange={set('purchased')}>
            <SelectTrigger className='w-40'><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>Purchased: any</SelectItem>
              <SelectItem value='ppv'>Only PPVs</SelectItem>
              <SelectItem value='yes'>Bought</SelectItem>
              <SelectItem value='no'>PPV not bought</SelectItem>
            </SelectContent>
          </Select>
          <Select value={f.replied} onValueChange={set('replied')}>
            <SelectTrigger className='w-36'><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>Fan replied: any</SelectItem>
              <SelectItem value='no'>No reply yet</SelectItem>
            </SelectContent>
          </Select>
        </>}
        <Select value={f.status} onValueChange={set('status')}>
          <SelectTrigger className='w-32'><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>Status: all</SelectItem>
            <SelectItem value='sent'>Sent</SelectItem>
            <SelectItem value='unsent'>Unsent</SelectItem>
          </SelectContent>
        </Select>
        {changed && <Button size='sm' variant='ghost' onClick={() => { setF(x => ({ ...START, view: x.view })); setSearch(''); setPrice({ min: '', max: '' }); }}>Clear filters</Button>}
      </div>

      {f.view === 'mass' ? <MassList data={mass} error={error} showPage={opts.accounts.length > 1 && f.account === 'all'} /> : <>
      <div className='grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7'>
        <Total label='Messages' value={t && num(t.messages)} />
        <Total label='Fans' value={t && num(t.fans)} />
        <Total label='PPVs sent' value={t && num(t.ppv_sent)} />
        <Total label='PPVs bought' value={t && num(t.ppv_sold)} />
        <Total label='Buy rate' value={t && (t.ppv_sent ? `${Math.round((t.ppv_sold / t.ppv_sent) * 100)}%` : '·')} />
        <Total label='Net from bought' value={t && money(t.sold_net)} />
        <Total label='Median reply time' value={t && (t.median_reply_s == null ? '·' : wait(t.median_reply_s))} />
      </div>

      {error ? <p className='text-sm text-muted-foreground'>{error}</p> : !rows ? <Skeleton className='h-80 w-full' /> : !rows.length ? (
        <p className='rounded-lg border bg-card px-4 py-8 text-center text-sm text-muted-foreground'>No messages for this filter.</p>
      ) : (
        <div className={cn('rounded-lg border bg-card', data.loading && 'opacity-60')}>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Sender</TableHead><TableHead>Creator</TableHead><TableHead className='min-w-72'>Message</TableHead>
              <TableHead>Sent time</TableHead><TableHead className='text-right'>Reply time</TableHead>
              <TableHead className='text-right'>Price</TableHead><TableHead>Purchased</TableHead><TableHead>Status</TableHead>
              <TableHead>Sent to</TableHead><TableHead className='text-right'>Actions</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {rows.map(r => (
                <TableRow key={`${r.account_id}:${r.message_id}`}>
                  <TableCell className='whitespace-nowrap text-xs'>{r.chatter || <span className='text-muted-foreground'>Not attributed</span>}</TableCell>
                  <TableCell className='whitespace-nowrap text-xs'>{r.page}</TableCell>
                  <TableCell className='max-w-md'>
                    {r.prev_fan_text && <p className='line-clamp-2 text-xs text-muted-foreground'>{r.prev_fan_text}</p>}
                    <p className={cn('line-clamp-3 text-sm', r.unsent_at && 'line-through opacity-60')}>{r.message || <span className='text-muted-foreground'>(media only)</span>}</p>
                  </TableCell>
                  <TableCell className='whitespace-nowrap text-xs text-muted-foreground'>{when(r.sent_at)}</TableCell>
                  <TableCell className='whitespace-nowrap text-right text-xs tabular-nums'>{r.reply_s != null && r.reply_s <= 259200 ? wait(r.reply_s) : <span className='text-muted-foreground' title={r.reply_s != null ? `The fan's last message was ${wait(r.reply_s)} before: a new start, not a reply` : 'Not a reply to a fan message'}>·</span>}</TableCell>
                  <TableCell className='text-right text-sm tabular-nums'>{r.price > 0 ? money(r.price) : <span className='text-muted-foreground'>Free</span>}</TableCell>
                  <TableCell className='whitespace-nowrap text-xs'>
                    {r.sold_at ? <span className='text-emerald-600' title={`Bought ${when(r.sold_at)}`}>Yes{r.sold_net != null ? ` · ${money(r.sold_net)}` : ''}</span> : r.price > 0 ? <span className='text-muted-foreground'>No</span> : ''}
                  </TableCell>
                  <TableCell className='whitespace-nowrap text-xs'>
                    {r.unsent_at ? <Badge variant='outline' className='text-red-600' title={`Unsent ${when(r.unsent_at)}`}>Unsent</Badge> : <Badge variant='outline'>Sent</Badge>}
                  </TableCell>
                  <TableCell className='max-w-40 truncate text-xs'>
                    <button type='button' className='hover:underline' title='Show only messages to this fan' onClick={() => set('fan')({ id: r.fan_account_id, name: fanName(r) })}>{fanName(r)}</button>
                  </TableCell>
                  <TableCell className='whitespace-nowrap text-right'>
                    <Button size='sm' variant='ghost' className='h-7 px-2 text-xs' onClick={() => setOpen({ account_id: r.account_id, fan_account_id: r.fan_account_id, focus: r.message_id })}>Chat here</Button>
                    <Button size='sm' variant='outline' className='h-7 px-2 text-xs' disabled={!r.group_id} onClick={() => openChat(r)}
                      title={(data.my_browsers || []).includes(r.account_id) ? 'Opens this chat in your browser where the extension is on this page' : 'Opens this chat on fansly.com in a new tab'}>
                      <ExternalLink className='size-3' /> Open
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className='flex flex-wrap items-center justify-between gap-2 border-t px-3 py-2'>
            <p className='text-xs text-muted-foreground'>{num((page - 1) * size + 1)}–{num(Math.min(page * size, data.total))} of {num(data.total)}</p>
            <div className='flex items-center gap-1'>
              <Button size='sm' variant='ghost' className='h-7 px-2' disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft className='size-4' /></Button>
              {pageList(page, pages).map((n, k) => n === '…' ? <span key={`e${k}`} className='px-1 text-xs text-muted-foreground'>…</span> : (
                <Button key={n} size='sm' variant={n === page ? 'default' : 'ghost'} className='h-7 min-w-7 px-2 text-xs' onClick={() => setPage(n)}>{n}</Button>
              ))}
              <Button size='sm' variant='ghost' className='h-7 px-2' disabled={page >= pages} onClick={() => setPage(page + 1)}><ChevronRight className='size-4' /></Button>
              <Select value={String(size)} onValueChange={v => setSize(Number(v))}>
                <SelectTrigger className='h-7 w-28 text-xs'><SelectValue /></SelectTrigger>
                <SelectContent>{[25, 50, 100].map(n => <SelectItem key={n} value={String(n)}>{n} per page</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
        </div>
      )}
      <p className='text-xs text-muted-foreground'>
        A message shows who sent it only when it went out through the extension with a chatter signed in; older ones say Not attributed. Reply time is how long after the fan&apos;s message the reply went out (more than 3 days counts as a new start, not a reply).
        Open goes to your own browser when your extension is on that page now; otherwise fansly.com opens in a new tab.
      </p>
      </>}

      {open && <Conversation open={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

/** "Sent to": find a fan by name and show only the messages to him. */
function FanPicker({ value, onChange }) {
  const [q, setQ] = useState('');
  const [list, setList] = useState([]);
  const [show, setShow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => {
      if (q.trim().length < 2) setList([]);
      else api.get(`/api/fansly/messages/recipients?q=${encodeURIComponent(q.trim())}`).then(r => setList(r.data.fans || [])).catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [q]);
  if (value) return (
    <Badge variant='secondary' className='h-8 gap-1 px-2 text-xs'>Sent to: {value.name}
      <button type='button' aria-label='Clear' onClick={() => onChange(null)}><X className='size-3' /></button>
    </Badge>
  );
  return (
    <div className='relative'>
      <Input value={q} onChange={e => { setQ(e.target.value); setShow(true); }} onFocus={() => setShow(true)} onBlur={() => setTimeout(() => setShow(false), 150)}
        placeholder='Sent to (fan)' className='w-40' />
      {show && list.length > 0 && (
        <div className='absolute z-20 mt-1 max-h-64 w-60 overflow-y-auto rounded-md border bg-popover p-1 shadow-md'>
          {list.map(x => (
            <button key={`${x.account_id}:${x.fan_account_id}`} type='button' className='block w-full truncate rounded px-2 py-1 text-left text-xs hover:bg-muted'
              onMouseDown={e => e.preventDefault()} onClick={() => { onChange({ id: x.fan_account_id, name: x.name || `@${x.username}` }); setQ(''); setShow(false); }}>
              {x.name}{x.username && x.name !== x.username ? <span className='text-muted-foreground'> @{x.username}</span> : null}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Mass messages, one row each: how many got it, read it, bought its PPV, and whether it was unsent. */
function MassList({ data, error, showPage }) {
  if (error) return <p className='text-sm text-muted-foreground'>{error}</p>;
  if (!data) return <Skeleton className='h-80 w-full' />;
  const t = data.totals;
  return (
    <>
      <div className='grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7'>
        <Total label='Mass messages' value={num(t.mass_messages)} />
        <Total label='Delivered to' value={num(t.recipients)} />
        <Total label='Read' value={t.recipients ? `${Math.round((t.read / t.recipients) * 100)}%` : '·'} />
        <Total label='With a PPV' value={num(t.with_ppv)} />
        <Total label='PPVs bought' value={num(t.ppv_sold)} />
        <Total label='Net from sold' value={money(t.sold_net)} />
        <Total label='Unsent' value={num(t.unsent)} />
      </div>
      {!data.rows.length ? <p className='rounded-lg border bg-card px-4 py-8 text-center text-sm text-muted-foreground'>No mass messages for this filter.</p> : (
        <div className='rounded-lg border bg-card'>
          <Table>
            <TableHeader><TableRow>
              <TableHead className='w-28'>Sent</TableHead>
              {showPage && <TableHead>Page</TableHead>}
              <TableHead>Sent by</TableHead><TableHead>Message</TableHead>
              <TableHead className='text-right'>Fans</TableHead><TableHead className='text-right'>Read</TableHead>
              <TableHead className='text-right'>PPV</TableHead><TableHead className='text-right'>Bought</TableHead><TableHead className='text-right'>Net</TableHead><TableHead>Unsent</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {data.rows.map(r => (
                <TableRow key={`${r.account_id}:${r.mass_key}`} className={cn(r.unsent_at && 'opacity-60')}>
                  <TableCell className='whitespace-nowrap text-xs text-muted-foreground'>{when(r.sent_at)}</TableCell>
                  {showPage && <TableCell className='text-xs'>{r.page}</TableCell>}
                  <TableCell className='whitespace-nowrap text-xs'>{r.chatter || <span className='text-amber-600'>Not attributed</span>}</TableCell>
                  <TableCell className='max-w-md'><p className='line-clamp-2 text-sm'>{r.message || <span className='text-muted-foreground'>(media only)</span>}</p></TableCell>
                  <TableCell className='text-right text-sm tabular-nums'>{num(r.recipients)}</TableCell>
                  <TableCell className='text-right text-xs tabular-nums'>{r.recipients ? `${Math.round((r.read / r.recipients) * 100)}%` : ''}</TableCell>
                  <TableCell className='text-right text-sm tabular-nums'>{money(r.price)}</TableCell>
                  <TableCell className='text-right text-sm tabular-nums'>{r.price > 0 ? num(r.ppv_sold) : ''}</TableCell>
                  <TableCell className='text-right text-sm tabular-nums'>{r.sold_net ? money(r.sold_net) : ''}</TableCell>
                  <TableCell className='whitespace-nowrap text-xs'>{r.unsent_at ? <Badge variant='outline' className='text-red-600'>unsent {when(r.unsent_at)}</Badge> : ''}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {data.truncated && <p className='border-t px-4 py-2 text-xs text-muted-foreground'>Showing the latest 500. Narrow the dates to see older ones.</p>}
        </div>
      )}
      <p className='text-xs text-muted-foreground'>A mass message counts once here, however many fans got it. Unsent marks come from the browser that unsent it, or from Fansly&apos;s mass message history (Messages, mass message history, Deleted) opened with the extension on.</p>
    </>
  );
}

function Total({ label, value }) {
  return (
    <div className='rounded-md border bg-card px-3 py-2'>
      <p className='text-[11px] text-muted-foreground'>{label}</p>
      {value == null ? <Skeleton className='mt-1 h-5 w-12' /> : <p className='text-base font-semibold tabular-nums'>{value}</p>}
    </div>
  );
}

/** The whole chat with one fan, as the chatter saw it, the clicked message highlighted. */
function Conversation({ open, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const focusRef = useRef(null);

  useEffect(() => {
    let live = true;
    api.get(`/api/fansly/messages/conversation?account=${open.account_id}&fan=${encodeURIComponent(open.fan_account_id)}`)
      .then(r => { if (live) setData(r.data); })
      .catch(e => { if (live) setError(e?.response?.data?.error || 'Could not load the conversation'); });
    return () => { live = false; };
  }, [open.account_id, open.fan_account_id]);
  useEffect(() => { if (data) setTimeout(() => focusRef.current?.scrollIntoView({ block: 'center' }), 50); }, [data]);

  const fan = data?.fan || {};
  const title = fan.nickname || fan.display_name || (fan.username ? `@${fan.username}` : 'Conversation');
  return (
    <Sheet open onOpenChange={(v) => !v && onClose()}>
      <SheetContent className='flex w-full flex-col gap-0 p-0 sm:max-w-xl'>
        <SheetHeader className='border-b'>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>
            {data ? [data.page, fan.username && `@${fan.username}`, fan.subscription_tier_name, fan.spent_net != null && `spent ${money(fan.spent_net)}`, fan.purchases != null && `${fan.purchases} purchases`].filter(Boolean).join(' · ') : 'Loading…'}
          </SheetDescription>
        </SheetHeader>
        <div className='flex-1 overflow-y-auto px-4 py-3'>
          {error ? <p className='text-sm text-muted-foreground'>{error}</p> : !data ? <Skeleton className='h-64 w-full' /> : (
            <div className='grid gap-2'>
              {data.truncated && <p className='text-center text-xs text-muted-foreground'>Showing the last 1,000 messages.</p>}
              {data.messages.map(m => (
                <div key={m.message_id} ref={m.message_id === open.focus ? focusRef : null}
                  className={cn('max-w-[85%] rounded-lg px-3 py-2 text-sm', m.from_fan ? 'justify-self-start bg-muted' : 'justify-self-end bg-primary/10',
                    m.message_id === open.focus && 'ring-2 ring-amber-500')}>
                  {m.message ? <p className='whitespace-pre-wrap break-words'>{m.message}</p> : <p className='text-muted-foreground'>(media only)</p>}
                  <p className='mt-1 text-[11px] text-muted-foreground'>
                    {[when(m.sent_at), !m.from_fan && (m.chatter || (m.attribution === 'unattributed' ? 'not attributed' : null)), m.kind === 'mass' && 'mass',
                      m.price != null && `PPV ${money(m.price)}${m.sold_at ? ` · sold${m.sold_net != null ? ` ${money(m.sold_net)}` : ''}` : ' · not sold'}`, m.tip_amount != null && `tip ${money(m.tip_amount)}`,
                      m.unsent_at && `unsent ${when(m.unsent_at)}`].filter(Boolean).join(' · ')}
                  </p>
                </div>
              ))}
              {!data.messages.length && <p className='text-sm text-muted-foreground'>No messages recorded with this fan.</p>}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
