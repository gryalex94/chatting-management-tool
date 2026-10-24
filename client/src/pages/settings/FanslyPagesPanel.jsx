import { useEffect, useState } from 'react';
import { CircleAlert, MonitorSmartphone, Radio } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import toast from 'react-hot-toast';
import api from '@/services/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import PlatformNotice from '@/components/shared/PlatformNotice';
import { num } from '@/utils/numbers';
import FanslySettings from '@/pages/dashboard/FanslySettings';

const fmt = (iso) => (iso ? new Date(iso).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }) : 'never');
const since = (iso) => {
  if (!iso) return '';
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return min < 1 ? 'just now' : min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`;
};

/**
 * Settings → Pages on Fansly: every Fansly account the browser extension has
 * recorded (a Fansly page joins the tool when the extension first opens it, so
 * there is no "add page"), who is in it now, reading whole lists from Fansly,
 * the page itself (name, AI context: onEditPage), its settings (credit rules,
 * creator profile), pausing and disconnecting it.
 */
export default function FanslyPagesPanel({ onEditPage }) {
  const { isAdmin } = useAuth();
  const [info, setInfo] = useState(null);
  const [settingsFor, setSettingsFor] = useState(null);
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
  // disconnect: the page and everything recorded from it go; the extension adds it again if it opens the page later
  const remove = async (a) => {
    const name = a.page || a.username || 'this Fansly page';
    if (!window.confirm(`Disconnect ${name}? Every chat, sale and note recorded from it is deleted from this tool (nothing changes on Fansly). If the extension opens this page again later, it starts recording it as a new page.`)) return;
    try { await api.delete(`/api/fansly/accounts/${a.id}`); toast.success(`${name} disconnected`); load(); } catch (e) { toast.error(e?.response?.data?.error || 'Could not disconnect'); }
  };

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
              {onEditPage && a.creator_id && <Button size='sm' variant='outline' onClick={() => onEditPage(a.creator_id)}>Page</Button>}
              <Button size='sm' variant='outline' onClick={() => setSettingsFor(a)}>Settings</Button>
              {isAdmin && <Button size='sm' variant='outline' onClick={() => pause(a)}>{a.status === 'paused' ? 'Resume' : 'Pause'}</Button>}
              {isAdmin && <Button size='sm' variant='outline' className='text-red-600' onClick={() => remove(a)}>Disconnect</Button>}
            </div>
          </header>

          <div className='grid gap-4 px-4 py-3'>
            <div>
              <p className='mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground'>In the account now</p>
              {a.online.length ? (
                <ul className='space-y-1 text-sm'>
                  {a.online.map(p => <li key={p.device + p.since} className='flex items-center gap-2'><MonitorSmartphone className='size-3.5 text-muted-foreground' />{p.name}{p.chatter && p.chatter !== p.name ? ` (${p.chatter})` : ''}<span className='text-muted-foreground'>· {since(p.since)}</span>{p.on_roster === false && <span className='text-xs text-amber-600'>not on the roster for this page</span>}</li>)}
                </ul>
              ) : <p className='text-sm text-muted-foreground'>No browser with the extension is on this account.</p>}
              {a.online.length > 1 && <p className='mt-2 flex items-center gap-1 text-xs text-amber-600'><CircleAlert className='size-3.5' /> Two people are logged in at once. Sends are credited to whoever&apos;s browser sent them.</p>}
            </div>
          </div>

          <ReadFromFansly a={a} onChanged={load} />

        </section>
      ))}

      {settingsFor && <FanslySettings account={settingsFor} canEdit={isAdmin} onClose={(saved) => { setSettingsFor(null); if (saved) load(); }} />}

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

const FETCH_NAME = { ledger: 'Earnings (last 45 days)', ledger_all: 'Earnings, everything', subscribers: 'Subscribers', statistics: 'Statistics' };
const JOB_STATUS = { pending: 'waiting for a browser on this page', running: 'reading now', done: 'done', failed: 'failed', cancelled: 'stopped' };

/**
 * "Read from Fansly": ask the browser that is on this page to open Fansly's Earnings,
 * Subscribers or Statistics page and scroll its list to the end (Fansly's own app loads it,
 * the extension records it). The chatter there presses Start; a manager's own browser can
 * start it from the side panel. Also shows how much of the sales list has been read.
 */
function ReadFromFansly({ a, onChanged }) {
  const [busy, setBusy] = useState('');
  const ask = async (kind) => {
    setBusy(kind);
    try {
      const { data } = await api.post(`/api/fansly/accounts/${a.id}/fetch`, { kind });
      toast.success(data.already ? 'Already asked: waiting for the browser on this page' : a.online.length ? 'Asked: the chatter on this page gets a Start button in the side panel' : 'Asked: it starts when someone opens this page with the extension');
      onChanged();
    } catch (e) { toast.error(e?.response?.data?.error || 'Could not ask'); }
    finally { setBusy(''); }
  };
  const cancel = async (id) => { try { await api.post(`/api/fansly/fetch/${id}/cancel`); onChanged(); } catch (e) { toast.error(e?.response?.data?.error || 'Could not cancel'); } };
  const led = a.ledger || {};
  const complete = led.total && led.read >= led.total;
  const latest = {};
  for (const j of a.jobs || []) if (!latest[j.kind]) latest[j.kind] = j;
  return (
    <div className='mx-4 mb-3 grid gap-2 rounded-md border px-3 py-2 text-sm'>
      <div className='flex flex-wrap items-center gap-2'>
        <span className='font-medium'>Read from Fansly:</span>
        {['ledger', 'ledger_all', 'subscribers', 'statistics'].map(k => (
          <Button key={k} size='sm' variant='outline' disabled={!!busy || ['pending', 'running'].includes(latest[k]?.status)} onClick={() => ask(k)}>{busy === k ? 'Asking…' : FETCH_NAME[k]}</Button>
        ))}
      </div>
      <p className={`text-xs ${complete ? 'text-muted-foreground' : 'text-amber-600'}`}>
        Sales list: {num(led.read || 0)}{led.total ? ` of ${num(led.total)}` : ''} sales read{complete ? ', complete.' : led.total ? `. ${num(led.total - (led.read || 0))} still to read: use "Earnings, everything" once.` : '. Fansly says how many there are the first time its Earnings page is opened.'}
      </p>
      {Object.values(latest).map(j => (
        <p key={j.id} className='flex flex-wrap items-center gap-1 text-xs text-muted-foreground'>
          {FETCH_NAME[j.kind]}: {JOB_STATUS[j.status] || j.status}
          {j.progress?.rows != null && ` · ${num(j.progress.rows)}${j.progress.total ? ` of ${num(j.progress.total)}` : ''} rows`}
          {j.progress?.note && ` · ${j.progress.note}`}{j.error && <span className='text-red-600'> · {j.error}</span>}
          {' · '}{fmt(j.finished_at || j.requested_at)}
          {['pending', 'running'].includes(j.status) && <Button size='sm' variant='ghost' className='h-6 px-2' onClick={() => cancel(j.id)}>Cancel</Button>}
        </p>
      ))}
      <p className='text-xs text-muted-foreground'>It opens Fansly&apos;s own page in a tab of the browser on this page and scrolls the list at a calm pace (a minute or two), like a person would; nothing is sent to Fansly.</p>
    </div>
  );
}

