import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, Loader2, Search } from 'lucide-react';
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
];

/**
 * Every message the team sent from each Fansly page, newest first, like
 * Infloww's message dashboard. Filters above, totals for the filter, a row
 * opens the whole conversation, the same filter exports to CSV.
 */
export default function FanslyMessages() {
  const [opts, setOpts] = useState({ accounts: [], chatters: [] });
  // view: chat messages (the default) or mass messages, which have their own list
  const [f, setF] = useState({ account: 'all', chatter: 'all', range: '7', view: 'chat', ppv: false, sold: false, unreplied: false, unsent: false, q: '' });
  const [mass, setMass] = useState(null);       // { rows, totals, truncated } in the mass view
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState(null);
  const [next, setNext] = useState(null);
  const [totals, setTotals] = useState(null);
  const [error, setError] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [open, setOpen] = useState(null);       // { account_id, fan_account_id, focus }
  const reqId = useRef(0);

  useEffect(() => { api.get('/api/fansly/messages/filters').then(r => setOpts(r.data)).catch(() => {}); }, []);
  // typing in the search box waits a moment before asking the server
  useEffect(() => { const t = setTimeout(() => setF(x => (x.q === search ? x : { ...x, q: search })), 400); return () => clearTimeout(t); }, [search]);

  const params = useMemo(() => {
    const p = new URLSearchParams();
    if (f.account !== 'all') p.set('account', f.account);
    if (f.chatter !== 'all') p.set('chatter', f.chatter);
    const r = RANGES.find(x => x.v === f.range);
    if (r && r.days != null) { const now = new Date(); p.set('from', ymd(new Date(now.getTime() - r.days * 86400000))); p.set('to', ymd(now)); }
    if (f.unsent) p.set('unsent', '1');
    if (f.ppv) p.set('ppv', '1');
    if (f.sold) p.set('sold', '1');
    if (f.unreplied) p.set('unreplied', '1');
    if (f.q.trim()) p.set('q', f.q.trim());
    return p;
  }, [f]);

  const load = useCallback(() => {
    const id = ++reqId.current;
    setRows(null); setTotals(null); setMass(null); setError('');
    if (f.view === 'mass') {
      api.get(`/api/fansly/messages/mass?${params}`)
        .then(r => { if (id === reqId.current) setMass(r.data); })
        .catch(e => { if (id === reqId.current) setError(e?.response?.data?.error || 'Could not load the mass messages'); });
      return;
    }
    api.get(`/api/fansly/messages?${params}`)
      .then(r => { if (id === reqId.current) { setRows(r.data.rows || []); setNext(r.data.next); } })
      .catch(e => { if (id === reqId.current) setError(e?.response?.data?.error || 'Could not load the messages'); });
    api.get(`/api/fansly/messages/totals?${params}`)
      .then(r => { if (id === reqId.current) setTotals(r.data); })
      .catch(() => {});
  }, [params, f.view]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const more = async () => {
    if (!next || loadingMore) return;
    setLoadingMore(true);
    try {
      const p = new URLSearchParams(params); p.set('before', next.before); p.set('beforeId', next.beforeId);
      const { data } = await api.get(`/api/fansly/messages?${p}`);
      setRows(rs => [...(rs || []), ...(data.rows || [])]); setNext(data.next);
    } catch (e) { toast.error(e?.response?.data?.error || 'Could not load more'); }
    finally { setLoadingMore(false); }
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const { data } = await api.get(`/api/fansly/messages.csv?${params}`, { responseType: 'blob' });
      const url = URL.createObjectURL(data);
      const a = document.createElement('a'); a.href = url; a.download = `fansly-messages-${ymd(new Date())}.csv`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) {
      let msg = 'Could not export';
      try { msg = JSON.parse(await e.response.data.text()).error || msg; } catch { /* keep */ }
      toast.error(msg);
    } finally { setExporting(false); }
  };

  const set = (k) => (v) => setF(x => ({ ...x, [k]: v }));
  const toggle = (k) => setF(x => ({ ...x, [k]: !x[k] }));
  const showPage = opts.accounts.length > 1 && f.account === 'all';

  return (
    <div className='grid gap-4'>
      <div className='flex flex-wrap items-center gap-2'>
        <div className='inline-flex rounded-md border p-0.5'>
          <Button size='sm' variant={f.view === 'chat' ? 'default' : 'ghost'} onClick={() => set('view')('chat')}>Chat messages</Button>
          <Button size='sm' variant={f.view === 'mass' ? 'default' : 'ghost'} onClick={() => set('view')('mass')}>Mass messages</Button>
        </div>
        {opts.accounts.length > 1 && (
          <Select value={f.account} onValueChange={set('account')}>
            <SelectTrigger className='w-44'><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>All pages</SelectItem>
              {opts.accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.page}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <Select value={f.chatter} onValueChange={set('chatter')}>
          <SelectTrigger className='w-44'><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>All chatters</SelectItem>
            {opts.chatters.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            <SelectItem value='none'>Not attributed</SelectItem>
          </SelectContent>
        </Select>
        <Select value={f.range} onValueChange={set('range')}>
          <SelectTrigger className='w-36'><SelectValue /></SelectTrigger>
          <SelectContent>{RANGES.map(r => <SelectItem key={r.v} value={r.v}>{r.label}</SelectItem>)}</SelectContent>
        </Select>
        {f.view === 'chat' && <>
          <Toggle on={f.ppv} onClick={() => toggle('ppv')}>Only PPVs</Toggle>
          <Toggle on={f.sold} onClick={() => toggle('sold')}>Only sold</Toggle>
          <Toggle on={f.unreplied} onClick={() => toggle('unreplied')}>No reply yet</Toggle>
        </>}
        <Toggle on={f.unsent} onClick={() => toggle('unsent')}>Unsent</Toggle>
        <div className='relative min-w-48 flex-1'>
          <Search className='absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground' />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder='Search in the text' className='pl-8' />
        </div>
        {f.view === 'chat' && <Button size='sm' variant='outline' onClick={exportCsv} disabled={exporting}>
          {exporting ? <Loader2 className='size-3.5 animate-spin' /> : <Download className='size-3.5' />} CSV
        </Button>}
      </div>

      {f.view === 'mass' ? <MassList data={mass} error={error} showPage={showPage} /> : <>
      <div className='grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8'>
        <Total label='Messages' value={totals && num(totals.messages)} />
        <Total label='Fans' value={totals && num(totals.fans)} />
        <Total label='PPVs sent' value={totals && num(totals.ppv_sent)} />
        <Total label='PPVs sold' value={totals && num(totals.ppv_sold)} />
        <Total label='Sell rate' value={totals && (totals.ppv_sent ? `${Math.round((totals.ppv_sold / totals.ppv_sent) * 100)}%` : '·')} />
        <Total label='Net from sold' value={totals && money(totals.sold_net)} />
        <Total label='Median wait' value={totals && (totals.median_waited_s == null ? '·' : wait(totals.median_waited_s))} />
        <Total label='Unsent' value={totals && num(totals.unsent)} />
      </div>

      {error ? <p className='text-sm text-muted-foreground'>{error}</p> : !rows ? <Skeleton className='h-80 w-full' /> : !rows.length ? (
        <p className='rounded-lg border bg-card px-4 py-8 text-center text-sm text-muted-foreground'>No messages for this filter.</p>
      ) : (
        <div className='rounded-lg border bg-card'>
          <Table>
            <TableHeader><TableRow>
              <TableHead className='w-28'>Sent</TableHead>
              {showPage && <TableHead>Page</TableHead>}
              <TableHead>Chatter</TableHead><TableHead>Fan</TableHead><TableHead>Message</TableHead>
              <TableHead className='text-right'>PPV</TableHead><TableHead>Sold</TableHead><TableHead>Read</TableHead><TableHead className='text-right'>He waited</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {rows.map(r => (
                <TableRow key={`${r.account_id}:${r.message_id}`} className={cn(r.fan_account_id && 'cursor-pointer')}
                  onClick={() => r.fan_account_id && setOpen({ account_id: r.account_id, fan_account_id: r.fan_account_id, focus: r.message_id })}>
                  <TableCell className='whitespace-nowrap text-xs text-muted-foreground'>{when(r.sent_at)}</TableCell>
                  {showPage && <TableCell className='text-xs'>{r.page}</TableCell>}
                  <TableCell className='whitespace-nowrap text-xs'>{r.chatter || <span className='text-amber-600'>Not attributed</span>}</TableCell>
                  <TableCell className='max-w-40 truncate text-xs'>
                    {fanName(r)}
                    {r.kind === 'mass' && <Badge variant='outline' className='ml-1 px-1 py-0 text-[10px]'>mass</Badge>}
                  </TableCell>
                  <TableCell className='max-w-md'>
                    <p className={cn('line-clamp-2 text-sm', r.unsent_at && 'line-through opacity-60')}>{r.message || <span className='text-muted-foreground'>(media only)</span>}</p>
                    {r.unsent_at && <Badge variant='outline' className='mt-0.5 px-1 py-0 text-[10px] text-red-600'>unsent {when(r.unsent_at)}</Badge>}
                  </TableCell>
                  <TableCell className='text-right text-sm tabular-nums'>{money(r.price)}</TableCell>
                  <TableCell className='whitespace-nowrap text-xs'>
                    {r.sold_at ? <span className='text-emerald-600'>{r.sold_net != null ? money(r.sold_net) : 'bought'} · {when(r.sold_at)}</span> : r.price > 0 ? <span className='text-muted-foreground'>not yet</span> : ''}
                  </TableCell>
                  <TableCell className='whitespace-nowrap text-xs text-muted-foreground'>{r.read_at ? when(r.read_at) : r.kind === 'mass' ? '' : 'unread'}</TableCell>
                  <TableCell className='text-right text-xs tabular-nums'>{wait(r.waited_s)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {next && (
            <div className='flex justify-center border-t py-3'>
              <Button size='sm' variant='outline' onClick={more} disabled={loadingMore}>{loadingMore ? 'Loading…' : 'Show more'}</Button>
            </div>
          )}
        </div>
      )}

      </>}

      {open && <Conversation open={open} onClose={() => setOpen(null)} />}
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

function Toggle({ on, onClick, children }) {
  return <Button size='sm' variant={on ? 'default' : 'outline'} onClick={onClick}>{children}</Button>;
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
