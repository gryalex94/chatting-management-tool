import { useCallback, useEffect, useState } from 'react';
import { CircleAlert, CircleCheck, Loader2, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/services/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const RESOURCES = [
  ['employees', 'Employees'],
  ['sales', 'Sales'],
  ['refunds', 'Refunds'],
  ['fan_ids', 'Fan IDs learned'],
  ['spend', 'Fan spend'],
];
const fmt = (iso) => (iso ? new Date(iso).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }) : 'never');

/**
 * Settings → Infloww: whether the API is connected, when each part last synced,
 * and what it has brought in. Syncs run by themselves every hour; the buttons
 * run one now, or backfill the past year once.
 */
export default function InflowwPanel() {
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.get('/api/integrations/infloww').then(r => setInfo(r.data)).catch(() => setInfo({ error: true }));
  }, []);
  useEffect(() => { load(); }, [load]);
  // While a sync runs, refresh the numbers every few seconds.
  useEffect(() => {
    if (!info?.running) return undefined;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [info?.running, load]);

  const sync = async (days) => {
    setBusy(true);
    try {
      await api.post('/api/integrations/infloww/sync', { days });
      toast.success(days > 30 ? 'Backfill started. It takes a few minutes' : 'Sync started');
      setTimeout(load, 1500);
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not start the sync');
    } finally { setBusy(false); }
  };

  if (!info) return <div className='p-4 text-sm text-muted-foreground'>Loading…</div>;
  if (info.error) return <div className='p-4 text-sm text-muted-foreground'>Could not load the Infloww status.</div>;

  const state = Object.fromEntries((info.state || []).map(s => [s.resource, s]));
  const t = info.totals || {};

  return (
    <div className='grid gap-4 p-4'>
      <div className='flex flex-wrap items-center gap-2'>
        {info.configured
          ? <Badge variant='outline' className='gap-1 border-good/40 text-good'><CircleCheck className='size-3.5' />Connected</Badge>
          : <Badge variant='outline' className='gap-1 border-warn/40 text-warn'><CircleAlert className='size-3.5' />Not configured on the server</Badge>}
        {!info.tables_ready && <Badge variant='outline' className='border-warn/40 text-warn'>Database change 023 not run yet</Badge>}
        {info.running && <Badge variant='secondary' className='gap-1'><Loader2 className='size-3.5 animate-spin' />Syncing…</Badge>}
        <div className='ms-auto flex gap-2'>
          <Button size='sm' variant='outline' disabled={!info.configured || !!info.running || busy} onClick={() => sync(3)}><RefreshCw />Sync now</Button>
          <Button size='sm' variant='outline' disabled={!info.configured || !!info.running || busy} onClick={() => sync(365)}>Backfill last year</Button>
        </div>
      </div>

      {info.last_result?.error && (
        <p className='rounded-md border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad'>
          Last sync ({fmt(info.last_result.finished_at)}) failed: {info.last_result.error}
        </p>
      )}
      {info.server_ip && (
        <p className='text-sm text-muted-foreground'>
          This server reaches Infloww from <code className='font-semibold text-foreground'>{info.server_ip}</code>. If your API key has IP
          restrictions, that address must be on its list (on Railway, switch on a static outbound IP first so it doesn&apos;t change).
        </p>
      )}
      {!info.configured && (
        <p className='text-sm text-muted-foreground'>
          Add <code>INFLOWW_API_KEY</code> and <code>INFLOWW_OID</code> to the server&apos;s variables (Railway → backend → Variables).
        </p>
      )}

      <div className='grid gap-2 sm:grid-cols-2 lg:grid-cols-5'>
        {RESOURCES.map(([key, label]) => {
          const s = state[key];
          return (
            <div key={key} className='rounded-md border p-3'>
              <p className='text-sm font-medium'>{label}</p>
              <p className='text-xs text-muted-foreground'>Last OK: {fmt(s?.last_ok_at)}</p>
              {s?.error && <p className='mt-1 text-xs text-bad'>{s.error}</p>}
            </div>
          );
        })}
      </div>

      <div className='flex flex-wrap gap-2 text-sm'>
        <Badge variant='secondary' className='font-normal'>Sales stored: <b className='ms-1'>{t.sales ?? '·'}</b></Badge>
        <Badge variant='secondary' className='font-normal'>Refunds: <b className='ms-1'>{t.refunds ?? '·'}</b></Badge>
        <Badge variant='secondary' className='font-normal'>Employees: <b className='ms-1'>{t.employees ?? '·'}</b> ({t.linked_employees ?? '·'} linked to chatters)</Badge>
        <Badge variant='secondary' className='font-normal'>Fan IDs: <b className='ms-1'>{t.fan_ids_from_sales ?? '·'}</b> from sales, <b className='mx-1'>{t.fan_ids_pasted ?? '·'}</b> pasted</Badge>
      </div>
      <p className='text-xs text-muted-foreground'>Syncs every hour by itself (the last 3 days). Run the backfill once to bring in the past year.</p>
    </div>
  );
}
