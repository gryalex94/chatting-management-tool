import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bot, CircleAlert } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import api from '@/services/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import PlatformNotice from '@/components/shared/PlatformNotice';
import { Volume } from '@/pages/settings/FanvuePanel';

const fmt = (iso) => (iso ? new Date(iso).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }) : 'never');

/**
 * The dashboard when Fanvue is picked in the menu: each connected Fanvue page with
 * its last 30 days (messages a day, chats, earnings). Chats and sales come in by
 * themselves (server/src/utils/fanvueSync.js), so there's nothing to upload.
 */
export default function FanvueDashboard() {
  const { isAdmin } = useAuth();
  const [info, setInfo] = useState(null);
  useEffect(() => {
    api.get('/api/fanvue').then(r => setInfo(r.data)).catch(e => setInfo({ error: e?.response?.data?.error || 'Could not load the Fanvue pages.' }));
  }, []);

  if (!info) return <div className='grid gap-4'><Skeleton className='h-8 w-56' /><Skeleton className='h-64 w-full' /></div>;
  if (info.error) return <p className='text-sm text-muted-foreground'>{info.error}</p>;
  const accounts = (info.accounts || []).filter(a => a.status !== 'disconnected');
  if (!accounts.length) {
    return (
      <PlatformNotice platform='fanvue' title='No Fanvue page connected yet'
        action={isAdmin && <Button asChild size='sm'><Link to='/settings?tab=fanvue'>Connect Fanvue</Link></Button>}>
        Connect a creator&apos;s Fanvue account and her chats and sales come in by themselves.
      </PlatformNotice>
    );
  }

  return (
    <div className='flex flex-col gap-4 sm:gap-6'>
      <div>
        <h2 className='text-2xl font-bold tracking-tight'>Fanvue</h2>
        <p className='text-muted-foreground'>The last 30 days. Chats and sales come in by themselves; there&apos;s nothing to upload.</p>
      </div>
      {accounts.map(a => <PageSummary key={a.id} account={a} />)}
    </div>
  );
}

function PageSummary({ account: a }) {
  const [stats, setStats] = useState(null);
  useEffect(() => {
    api.get(`/api/fanvue/accounts/${a.id}/stats`, { params: { days: 30 } }).then(r => setStats(r.data)).catch(() => setStats({ error: true }));
  }, [a.id]);
  return (
    <section className='grid gap-3 rounded-lg border bg-card p-4'>
      <div className='flex flex-wrap items-center gap-2'>
        <p className='font-semibold'>{a.display_name || a.handle} <span className='font-normal text-muted-foreground'>@{a.handle}</span></p>
        {a.is_ai_creator && <Badge variant='outline' className='gap-1'><Bot className='size-3.5' />AI creator</Badge>}
        {a.status === 'reconnect' && <Badge variant='outline' className='gap-1 border-warn/40 text-warn'><CircleAlert className='size-3.5' />Needs connecting again</Badge>}
        <span className='ms-auto text-xs text-muted-foreground'>Last synced {fmt(a.synced_at)}</span>
      </div>
      {!stats ? <Skeleton className='h-48 w-full' />
        : stats.error ? <p className='text-sm text-muted-foreground'>Could not load this page&apos;s numbers.</p>
        : <Volume stats={stats} />}
    </section>
  );
}
