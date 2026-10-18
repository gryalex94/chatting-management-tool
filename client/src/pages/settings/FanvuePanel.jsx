import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bot, CircleAlert, CircleCheck, Link2, Loader2, RefreshCw, Unlink } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/services/api';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const fmt = (iso) => (iso ? new Date(iso).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }) : 'never');
const num = (n) => (n == null ? '·' : Math.round(n).toLocaleString());
const usd = (cents) => `$${(Math.round(cents) / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
// Cost per reply of the planned AI engine (Mistral writes, Claude checks the risky
// ones): about 0.3–0.6 cents.
const AI_CENTS = [0.3, 0.6];

/**
 * Settings → Fanvue: connect the creator's Fanvue account (she approves access on
 * Fanvue), copy her chats in, and see how many messages the team handles a day.
 */
export default function FanvuePanel() {
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.get('/api/fanvue').then(r => setInfo(r.data)).catch(e => setInfo({ error: e?.response?.data?.error || 'Could not load the Fanvue status.' }));
  }, []);
  useEffect(() => { load(); }, [load]);
  // While a sync runs, refresh the progress every few seconds.
  const anyRunning = !!info?.accounts?.some(a => a.running);
  useEffect(() => {
    if (!anyRunning) return undefined;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [anyRunning, load]);

  // Off to Fanvue: the creator logs in and approves; Fanvue sends her back to /fanvue/callback.
  const connect = async () => {
    setBusy(true);
    try {
      const { data } = await api.post('/api/fanvue/connect', { redirectUri: `${window.location.origin}/fanvue/callback` });
      window.location.assign(data.url);
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not start the connection');
      setBusy(false);
    }
  };

  if (!info) return <p className='text-sm text-muted-foreground'>Loading…</p>;
  if (info.error) return <p className='text-sm text-muted-foreground'>{info.error}</p>;
  const ready = info.configured && info.tables_ready;

  return (
    <div className='grid gap-4'>
      <div className='flex flex-wrap items-center gap-2'>
        {info.configured
          ? <Badge variant='outline' className='gap-1 border-good/40 text-good'><CircleCheck className='size-3.5' />App set up on the server</Badge>
          : <Badge variant='outline' className='gap-1 border-warn/40 text-warn'><CircleAlert className='size-3.5' />Not set up on the server</Badge>}
        {!info.tables_ready && <Badge variant='outline' className='border-warn/40 text-warn'>Database change 030 not run yet</Badge>}
        <Button size='sm' className='ms-auto' disabled={!ready || busy} onClick={connect}>
          {busy ? <Loader2 className='animate-spin' /> : <Link2 />}{info.accounts.length ? 'Connect an account' : 'Connect Fanvue'}
        </Button>
      </div>

      {!info.configured && (
        <p className='text-sm text-muted-foreground'>
          Add <code>FANVUE_CLIENT_ID</code> and <code>FANVUE_CLIENT_SECRET</code> (from the app you created at fanvue.com/dev) to the
          server&apos;s settings: <code>server/.env</code> on this computer, and Railway → backend → Variables for the live tool.
        </p>
      )}
      {info.configured && !info.tables_ready && (
        <p className='text-sm text-muted-foreground'>Run <code>supabase/migrations/030_fanvue.sql</code> in Supabase (SQL editor), then reload this page.</p>
      )}
      {ready && !info.accounts.length && (
        <p className='text-sm text-muted-foreground'>
          Connect Fanvue takes you to Fanvue: log in as the creator and approve. You come back here and her chats start copying in,
          which can take a while the first time. Nothing is ever sent to fans from here.
        </p>
      )}

      {info.accounts.map(a => <AccountCard key={a.id} account={a} reload={load} onReconnect={connect} />)}
    </div>
  );
}

function AccountCard({ account: a, reload, onReconnect }) {
  const [stats, setStats] = useState(null);
  const [busy, setBusy] = useState(false);
  const running = a.running;

  // Numbers again after each sync finishes.
  useEffect(() => {
    if (running) return;
    api.get(`/api/fanvue/accounts/${a.id}/stats`, { params: { days: 30 } }).then(r => setStats(r.data)).catch(() => setStats({ error: true }));
  }, [a.id, a.synced_at, running]);

  const sync = async () => {
    setBusy(true);
    try { await api.post(`/api/fanvue/accounts/${a.id}/sync`); toast.success('Sync started'); setTimeout(reload, 1000); }
    catch (e) { toast.error(e?.response?.data?.error || 'Could not start the sync'); }
    finally { setBusy(false); }
  };
  const disconnect = async () => {
    if (!window.confirm(`Disconnect @${a.handle}? The tool stops reading this account; the chats copied so far stay.`)) return;
    try { await api.post(`/api/fanvue/accounts/${a.id}/disconnect`); toast.success('Disconnected'); reload(); }
    catch (e) { toast.error(e?.response?.data?.error || 'Could not disconnect'); }
  };

  return (
    <section className='grid gap-3 rounded-lg border p-4'>
      <div className='flex flex-wrap items-center gap-2'>
        <div className='min-w-0'>
          <p className='font-semibold'>{a.display_name || a.handle} <span className='font-normal text-muted-foreground'>@{a.handle}</span></p>
          <p className='text-xs text-muted-foreground'>
            {num(a.subscribers_count)} subscribers · {num(a.followers_count)} followers · connected {fmt(a.connected_at)} · last synced {fmt(a.synced_at)}
          </p>
        </div>
        {a.is_ai_creator && <Badge variant='outline' className='gap-1'><Bot className='size-3.5' />AI creator</Badge>}
        {a.status === 'connected'
          ? <Badge variant='outline' className='gap-1 border-good/40 text-good'><CircleCheck className='size-3.5' />Connected</Badge>
          : <Badge variant='outline' className='gap-1 border-warn/40 text-warn'><CircleAlert className='size-3.5' />{a.status === 'reconnect' ? 'Needs connecting again' : 'Disconnected'}</Badge>}
        <div className='ms-auto flex gap-2'>
          {a.status === 'connected' && <Button size='sm' variant='outline' disabled={!!running || busy} onClick={sync}><RefreshCw className={cn(running && 'animate-spin')} />Sync now</Button>}
          {/* Approving again on Fanvue renews the same connection (e.g. with different permissions). */}
          <Button size='sm' variant={a.status === 'connected' ? 'ghost' : 'outline'} onClick={onReconnect}><Link2 />Connect again</Button>
          {a.status !== 'disconnected' && <Button size='sm' variant='ghost' onClick={disconnect}><Unlink />Disconnect</Button>}
        </div>
      </div>

      {running && <Progress p={running} />}
      {!running && a.sync_error && <p className='rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-sm'>{a.sync_error}</p>}
      {!running && a.last_result?.error && a.last_result.error !== a.sync_error && (
        <p className='rounded-md border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad'>Last sync failed: {a.last_result.error}</p>
      )}
      {stats && !stats.error && <Volume stats={stats} />}
    </section>
  );
}

function Progress({ p }) {
  const text = p.phase === 'profile' ? 'Reading the profile…'
    : p.phase === 'chats' ? `Reading the chat list… ${num(p.chats_listed)} chats so far`
    : p.phase === 'messages' ? `Copying messages: ${num(p.chats_read)} of ${num(p.chats_to_read)} chats · ${num(p.messages)} messages`
    : `Copying earnings… ${num(p.earnings)} so far`;
  const pct = p.phase === 'messages' && p.chats_to_read ? Math.round((p.chats_read / p.chats_to_read) * 100) : null;
  return (
    <div className='grid gap-1.5'>
      <p className='flex items-center gap-2 text-sm'><Loader2 className='size-4 animate-spin text-muted-foreground' />{text}</p>
      {pct != null && (
        <div className='h-1.5 overflow-hidden rounded-full bg-muted' role='progressbar' aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label='Copying messages'>
          <div className='h-full bg-primary transition-all' style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}

// The last 30 days: messages a day (fans, the team by hand, automatic), chats,
// earnings, and what AI replies would cost at this volume.
// A YYYY-MM-DD day, n days earlier.
const daysBefore = (day, n) => { const d = new Date(`${day}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };

function Volume({ stats }) {
  const today = stats.today;                                 // Amsterdam day, from the server
  const { rows, avg } = useMemo(() => {
    const byDay = new Map(stats.messages.map(d => [d.day, d]));
    const earnByDay = new Map(stats.earnings.map(d => [d.day, d]));
    const first = [...byDay.keys(), ...earnByDay.keys()].sort()[0];
    const out = [];
    for (let i = stats.days - 1; i >= 0; i--) {
      const day = daysBefore(today, i);
      if (!first || day < first) continue;
      const m = byDay.get(day) || {};
      out.push({ day, fan: Number(m.fan_messages || 0), team: Number(m.team_messages || 0), auto: Number(m.auto_messages || 0), chats: Number(m.chats || 0), net: Number(earnByDay.get(day)?.net_cents || 0) });
    }
    const full = out.filter(r => r.day !== today);           // today isn't over yet
    const mean = (k) => (full.length ? full.reduce((s, r) => s + r[k], 0) / full.length : null);
    return { rows: out, avg: { fan: mean('fan'), team: mean('team'), auto: mean('auto'), chats: mean('chats'), net: mean('net'), days: full.length } };
  }, [stats, today]);

  if (!rows.length) return <p className='text-sm text-muted-foreground'>No messages copied yet.</p>;
  const max = Math.max(1, ...rows.map(r => r.fan + r.team + r.auto));

  return (
    <div className='grid gap-3'>
      <div className='grid gap-2 sm:grid-cols-2 lg:grid-cols-5'>
        <Stat label='Fans write a day' value={num(avg.fan)} />
        <Stat label='Team sends by hand a day' value={num(avg.team)} />
        <Stat label='Sent automatically a day' value={num(avg.auto)} sub='automated + mass messages' />
        <Stat label='Chats active a day' value={num(avg.chats)} />
        <Stat label='Earned a day' value={avg.net == null ? '·' : usd(avg.net)} sub='after Fanvue’s cut' />
      </div>
      {avg.team != null && (
        <p className='text-sm text-muted-foreground'>
          If AI wrote the team&apos;s replies, at this volume it would cost about{' '}
          <b className='text-foreground'>{usd(avg.team * AI_CENTS[0])}–{usd(avg.team * AI_CENTS[1])} a day</b>.
          Averages over the last {avg.days} full day{avg.days === 1 ? '' : 's'} ({num(stats.totals.messages)} messages and {num(stats.totals.fans)} chats copied in total).
        </p>
      )}
      <div className='grid gap-1'>
        <div className='flex h-28 items-end gap-0.5' role='img' aria-label='Messages per day over the last 30 days'>
          {rows.map(r => (
            <div key={r.day} className='flex h-full min-w-0 flex-1 flex-col-reverse' title={`${r.day}: fans ${r.fan}, team ${r.team}, automatic ${r.auto}`}>
              <div className='bg-link/70' style={{ height: `${(r.fan / max) * 100}%` }} />
              <div className='bg-primary/80' style={{ height: `${(r.team / max) * 100}%` }} />
              <div className='bg-muted-foreground/40' style={{ height: `${(r.auto / max) * 100}%` }} />
            </div>
          ))}
        </div>
        <div className='flex flex-wrap gap-3 text-xs text-muted-foreground'>
          <span className='flex items-center gap-1'><span className='size-2 rounded-sm bg-link/70' />Fans</span>
          <span className='flex items-center gap-1'><span className='size-2 rounded-sm bg-primary/80' />Team by hand</span>
          <span className='flex items-center gap-1'><span className='size-2 rounded-sm bg-muted-foreground/40' />Automatic</span>
          <span className='ms-auto'>{rows[0].day} – {rows.at(-1).day}</span>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, sub }) {
  return (
    <div className='rounded-md border p-3'>
      <p className='text-xs text-muted-foreground'>{label}</p>
      <p className='text-xl font-semibold tabular-nums'>{value}</p>
      {sub && <p className='text-[11px] text-muted-foreground'>{sub}</p>}
    </div>
  );
}
