import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CircleAlert, CircleCheck, Loader2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import api from '@/services/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import PlatformNotice from '@/components/shared/PlatformNotice';

const fmt = (iso) => (iso ? new Date(iso).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }) : 'never');

/**
 * Reports when Fanvue is picked in the menu: nothing to upload — the chats and
 * sales of each connected page come in by themselves (every hour on the live
 * tool). Shows when each page last synced, and anything that went wrong.
 */
export default function FanvueReports() {
  const { isAdmin } = useAuth();
  const [info, setInfo] = useState(null);
  useEffect(() => {
    api.get('/api/fanvue').then(r => setInfo(r.data)).catch(e => setInfo({ error: e?.response?.data?.error || 'Could not load the Fanvue pages.' }));
  }, []);

  if (!info) return <Skeleton className='h-40 w-full' />;
  if (info.error) return <p className='text-sm text-muted-foreground'>{info.error}</p>;
  const settings = isAdmin && <Button asChild size='sm' variant='outline'><Link to='/settings?tab=fanvue'>Open Settings → Fanvue</Link></Button>;
  if (!info.accounts?.length) {
    return (
      <PlatformNotice platform='fanvue' title='No Fanvue page connected yet' action={settings}>
        Fanvue needs no uploads: connect a creator&apos;s account and her chats and sales come in by themselves.
      </PlatformNotice>
    );
  }

  return (
    <div className='flex flex-col gap-4 sm:gap-6'>
      <div className='flex flex-wrap items-end justify-between gap-3'>
        <div>
          <h2 className='text-2xl font-bold tracking-tight'>Reports</h2>
          <p className='text-muted-foreground'>Fanvue needs no uploads: chats and sales come in by themselves, every hour.</p>
        </div>
        {settings}
      </div>
      <div className='grid gap-2'>
        {info.accounts.map(a => (
          <div key={a.id} className='flex flex-wrap items-center gap-3 rounded-lg border bg-card px-4 py-3'>
            <p className='min-w-0 flex-1 truncate font-medium'>{a.display_name || a.handle} <span className='font-normal text-muted-foreground'>@{a.handle}</span></p>
            {a.running
              ? <Badge variant='secondary' className='gap-1'><Loader2 className='size-3.5 animate-spin' />Syncing…</Badge>
              : a.status === 'connected' && !a.sync_error
                ? <Badge variant='outline' className='gap-1 border-good/40 text-good'><CircleCheck className='size-3.5' />Up to date</Badge>
                : <Badge variant='outline' className='gap-1 border-warn/40 text-warn'><CircleAlert className='size-3.5' />{a.status === 'connected' ? 'Last sync had a problem' : a.status === 'reconnect' ? 'Needs connecting again' : 'Disconnected'}</Badge>}
            <span className='text-sm text-muted-foreground'>Last synced {fmt(a.synced_at)}</span>
            {a.sync_error && <p className='w-full text-sm text-warn'>{a.sync_error}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
