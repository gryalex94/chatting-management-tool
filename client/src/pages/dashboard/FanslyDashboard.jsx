import { useEffect, useState } from 'react';
import { CircleAlert, MonitorSmartphone, Radio } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import api from '@/services/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import PlatformNotice from '@/components/shared/PlatformNotice';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { num } from '@/utils/numbers';
import FanslyMessages from './FanslyMessages';
import FanslyScripts from './FanslyScripts';

const fmt = (iso) => (iso ? new Date(iso).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }) : 'never');
const since = (iso) => {
  if (!iso) return '';
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return min < 1 ? 'just now' : min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`;
};
const money = (n) => (n == null ? '·' : `$${Number(n).toFixed(2)}`);
const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '·');
const secs = (s) => (s == null ? '·' : s < 60 ? `${s} s` : s < 3600 ? `${Math.round(s / 60)} min` : `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min`);

/**
 * The dashboard when Fansly is picked in the menu: every Fansly account the
 * browser extension has recorded, who is in it right now, and today's numbers
 * per chatter. Phase 1 of FANSLY_EXTENSION_PLAN.md: recording only.
 */
export default function FanslyDashboard() {
  const [tab, setTab] = useState(() => { try { return localStorage.getItem('fansly-tab') || 'overview'; } catch { return 'overview'; } });
  const pick = (v) => { setTab(v); try { localStorage.setItem('fansly-tab', v); } catch { /* ignore */ } };
  return (
    <Tabs value={tab} onValueChange={pick} className='gap-4'>
      <TabsList>
        <TabsTrigger value='overview'>Pages</TabsTrigger>
        <TabsTrigger value='messages'>Messages</TabsTrigger>
        <TabsTrigger value='scripts'>Scripts</TabsTrigger>
      </TabsList>
      <TabsContent value='overview'><FanslyOverview /></TabsContent>
      <TabsContent value='messages'><FanslyMessages /></TabsContent>
      <TabsContent value='scripts'><FanslyScripts /></TabsContent>
    </Tabs>
  );
}

function FanslyOverview() {
  const { isAdmin } = useAuth();
  const [info, setInfo] = useState(null);
  const [recounting, setRecounting] = useState(false);
  const load = () => api.get('/api/fansly').then(r => setInfo(r.data)).catch(e => setInfo({ error: e?.response?.data?.error || 'Could not load the Fansly pages.' }));
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, []);

  if (!info) return <div className='grid gap-4'><Skeleton className='h-8 w-56' /><Skeleton className='h-64 w-full' /></div>;
  if (info.error) return <p className='text-sm text-muted-foreground'>{info.error}</p>;
  const accounts = info.accounts || [];
  if (!accounts.length) {
    return (
      <PlatformNotice platform='fansly' title='No Fansly account recorded yet'>
        <p>Fansly comes in through the browser extension. In the browser profile that is logged into Fansly:</p>
        <ol className='mt-2 list-decimal space-y-1 pl-5 text-left'>
          <li>Open <code>chrome://extensions</code>, turn on Developer mode, click <em>Load unpacked</em> and pick the tool&apos;s <code>extension</code> folder.</li>
          <li>Click the extension icon and sign in with your account from this tool.</li>
          <li>Open fansly.com/messages. The account appears here within a minute.</li>
        </ol>
      </PlatformNotice>
    );
  }

  const pause = (a) => api.post(`/api/fansly/accounts/${a.id}`, { status: a.status === 'paused' ? 'active' : 'paused' }).then(load);
  const recount = () => { setRecounting(true); api.post('/api/fansly/recount').then(load).finally(() => setRecounting(false)); };

  return (
    <div className='grid gap-6'>
      {accounts.map(a => (
        <section key={a.id} className='rounded-lg border bg-card'>
          <header className='flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3'>
            <div>
              <h2 className='text-base font-semibold'>{a.page || a.username || 'Fansly page'} <span className='ml-1 text-sm font-normal text-muted-foreground'>{a.username ? `@${a.username}` : ''}</span></h2>
              <p className='text-xs text-muted-foreground'>
                {num(a.totals.fans)} fans · {num(a.totals.messages)} messages recorded · last seen {fmt(a.last_seen_at)} · sales ledger read {fmt(a.ledger_read_at)}
                {a.followers_count != null && ` · ${num(a.followers_count)} followers`}{a.subscribers_count != null && ` · ${num(a.subscribers_count)} subscribers`}
              </p>
            </div>
            <div className='flex items-center gap-2'>
              {a.status === 'paused' ? <Badge variant='outline'>Recording paused</Badge> : a.online.length
                ? <Badge className='gap-1 bg-emerald-600 text-white hover:bg-emerald-600'><Radio className='size-3' /> {a.online.length} online</Badge>
                : <Badge variant='secondary'>Nobody in it now</Badge>}
              {isAdmin && <Button size='sm' variant='outline' onClick={() => pause(a)}>{a.status === 'paused' ? 'Resume' : 'Pause'}</Button>}
            </div>
          </header>

          <div className='grid gap-4 px-4 py-3 md:grid-cols-[1fr_1fr]'>
            <div>
              <p className='mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground'>In the account now</p>
              {a.online.length ? (
                <ul className='space-y-1 text-sm'>
                  {a.online.map(p => <li key={p.device + p.since} className='flex items-center gap-2'><MonitorSmartphone className='size-3.5 text-muted-foreground' />{p.name}{p.chatter && p.chatter !== p.name ? ` (${p.chatter})` : ''}<span className='text-muted-foreground'>· {since(p.since)}</span></li>)}
                </ul>
              ) : <p className='text-sm text-muted-foreground'>No browser with the extension is on this account.</p>}
              {a.online.length > 1 && <p className='mt-2 flex items-center gap-1 text-xs text-amber-600'><CircleAlert className='size-3.5' /> Two people are logged in at once. Sends are credited to whoever&apos;s browser sent them.</p>}
            </div>
            <div>
              <p className='mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground'>Today</p>
              <div className='grid grid-cols-3 gap-2 text-sm'>
                <Stat label='Sent' value={num(a.today.sent)} />
                <Stat label='Received' value={num(a.today.received)} />
                <Stat label='Fans' value={num(a.today.fans)} />
                <Stat label='PPVs sent' value={num(a.today.ppv_sent)} />
                <Stat label='Chat PPV net' value={money(a.today.net.chat_ppv || 0)} />
                <Stat label='Tips net' value={money(a.today.net.chat_tip || 0)} />
              </div>
              {a.today.unattributed > 0 && <p className='mt-2 flex items-center gap-1 text-xs text-amber-600'><CircleAlert className='size-3.5' /> {a.today.unattributed} message{a.today.unattributed === 1 ? '' : 's'} sent today from a browser without the extension.</p>}
            </div>
          </div>

          {a.ledger_stale ? (
            <p className='mx-4 mb-3 flex items-center gap-1 text-xs text-amber-600'><CircleAlert className='size-3.5' /> Sales come from Fansly&apos;s Earnings page: someone with the extension should open it once a day and scroll its list.</p>
          ) : null}

          {a.last14?.length > 0 && (
            <div className='border-t'>
              <p className='px-4 pt-3 text-xs font-medium uppercase tracking-wide text-muted-foreground'>Last 14 days</p>
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Chatter</TableHead><TableHead className='text-right'>Days</TableHead><TableHead className='text-right'>Sent</TableHead><TableHead className='text-right'>Mass</TableHead>
                  <TableHead className='text-right'>PPVs sent</TableHead><TableHead className='text-right'>Sold</TableHead><TableHead className='text-right'>Sell rate</TableHead>
                  <TableHead className='text-right'>PPV net</TableHead><TableHead className='text-right'>Tips net</TableHead><TableHead className='text-right'>Reply time</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {a.last14.map(c => (
                    <TableRow key={c.name}>
                      <TableCell>{c.name}{c.unattributed > 0 && <span className='ml-1 text-xs text-amber-600'>({c.unattributed} not attributed)</span>}</TableCell>
                      <TableCell className='text-right'>{num(c.days)}</TableCell><TableCell className='text-right'>{num(c.sent)}</TableCell><TableCell className='text-right'>{num(c.mass_sent)}</TableCell>
                      <TableCell className='text-right'>{num(c.ppv_sent)}</TableCell><TableCell className='text-right'>{num(c.ppv_sold)}</TableCell><TableCell className='text-right'>{pct(c.ppv_sold, c.ppv_sent)}</TableCell>
                      <TableCell className='text-right'>{money(c.ppv_net)}</TableCell><TableCell className='text-right'>{money(c.tips_net)}</TableCell><TableCell className='text-right'>{secs(c.median_reply_s)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {a.today.by_chatter.length > 0 && (
            <Table>
              <TableHeader><TableRow><TableHead>Chatter</TableHead><TableHead className='text-right'>Sent</TableHead><TableHead className='text-right'>PPVs</TableHead><TableHead className='text-right'>Fans</TableHead></TableRow></TableHeader>
              <TableBody>
                {a.today.by_chatter.map(c => (
                  <TableRow key={c.name}><TableCell>{c.name}</TableCell><TableCell className='text-right'>{num(c.sent)}</TableCell><TableCell className='text-right'>{num(c.ppv)}</TableCell><TableCell className='text-right'>{num(c.fans)}</TableCell></TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </section>
      ))}

      <div className='flex justify-end'>
        <Button size='sm' variant='outline' disabled={recounting} onClick={recount}>{recounting ? 'Recounting…' : 'Match sales and recount 14 days'}</Button>
      </div>

      {info.recent?.length > 0 && (
        <section className='rounded-lg border bg-card px-4 py-3'>
          <p className='mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground'>Last batches from the extension</p>
          <ul className='space-y-1 text-xs text-muted-foreground'>
            {info.recent.map((l, i) => (
              <li key={i}>{fmt(l.received_at)} · {l.user || 'someone'} · {l.events} events{l.counts ? ` · ${Object.entries(l.counts).map(([k, v]) => `${k} ${v}`).join(', ')}` : ''}{l.errors ? <span className='text-red-600'> · {l.errors}</span> : ''}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return <div className='rounded-md border px-2.5 py-1.5'><p className='text-[11px] text-muted-foreground'>{label}</p><p className='font-medium tabular-nums'>{value}</p></div>;
}
