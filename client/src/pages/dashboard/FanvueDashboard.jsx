import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bot, CircleAlert } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import api from '@/services/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import PlatformNotice from '@/components/shared/PlatformNotice';
import { Stat, Volume } from '@/pages/settings/FanvuePanel';
import { num, usd } from '@/utils/numbers';

const fmt = (iso) => (iso ? new Date(iso).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }) : 'never');
const shortDate = (iso) => (iso ? new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short' }) : '—');
// 45 s · 12 min · 3 h 20 min · 4 days
const duration = (sec) => {
  if (sec == null) return '·';
  if (sec < 60) return `${Math.round(sec)} s`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min`;
  if (min < 24 * 60) return `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ''}`;
  const d = Math.round(min / (24 * 60));
  return `${d} day${d === 1 ? '' : 's'}`;
};
// The name a manager knows the fan by (demo mode replaces these with pseudonyms).
const fanName = (f) => f.display_name || f.fan_nickname || (f.fan_username ? `@${f.fan_username}` : 'A fan');

/**
 * The dashboard when Fanvue is picked in the menu: each connected Fanvue page
 * with its last 30 days — messages a day (the team's own words vs Fanvue's AI
 * writer), how fast the team replies, the chats waiting for a reply and the top
 * fans. Everything is read from the copy of the chats; the tool never writes or
 * sends anything on Fanvue.
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
        <p className='text-muted-foreground'>The last 30 days, from the copy of the chats (updated every hour). Nothing is ever sent from here.</p>
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
    <section className='grid gap-4 rounded-lg border bg-card p-4'>
      <div className='flex flex-wrap items-center gap-2'>
        <p className='font-semibold'>{a.display_name || a.handle} <span className='font-normal text-muted-foreground'>@{a.handle}</span></p>
        {a.is_ai_creator && <Badge variant='outline' className='gap-1'><Bot className='size-3.5' />AI creator</Badge>}
        {a.status === 'reconnect' && <Badge variant='outline' className='gap-1 border-warn/40 text-warn'><CircleAlert className='size-3.5' />Needs connecting again</Badge>}
        <span className='ms-auto text-xs text-muted-foreground'>Last synced {fmt(a.synced_at)}</span>
      </div>
      {!stats ? <Skeleton className='h-48 w-full' />
        : stats.error ? <p className='text-sm text-muted-foreground'>Could not load this page&apos;s numbers.</p>
        : (
          <>
            <Volume stats={stats} />
            {stats.extras_ready ? (
              <>
                <Replies r={stats.replies} />
                <div className='grid items-start gap-4 xl:grid-cols-2'>
                  <Waiting rows={stats.waiting} total={stats.replies.waiting} />
                  <TopFans rows={stats.top_fans} />
                </div>
              </>
            ) : (
              <p className='text-xs text-muted-foreground'>Run database change 033 in Supabase to see reply times, the chats waiting for a reply and the top fans.</p>
            )}
          </>
        )}
    </section>
  );
}

// How fast the team answers: from the fan's first unanswered message to the
// team's reply (automatic and mass messages don't count as a reply).
function Replies({ r }) {
  return (
    <div className='grid gap-2 sm:grid-cols-3'>
      <Stat label='Typical reply time' value={duration(r.median_seconds)} sub={`half the replies came faster · ${num(r.replies)} replies`} />
      <Stat label='Answered within 5 minutes' value={r.within_5_min == null ? '·' : `${Math.round(r.within_5_min * 100)}%`} sub='the faster, the more fans buy' />
      <Stat label='Waiting for a reply' value={num(r.waiting)} sub='chats where the fan wrote last' />
    </div>
  );
}

function Waiting({ rows, total }) {
  return (
    <div className='grid gap-2'>
      <h4 className='text-sm font-medium'>
        Waiting for a reply
        {total > rows.length && <span className='font-normal text-muted-foreground'> · the {rows.length} longest of {num(total)}</span>}
      </h4>
      {!rows.length ? <p className='text-sm text-muted-foreground'>No chat is waiting: every fan who wrote has an answer.</p> : (
        <ul className='grid gap-1'>
          {rows.map((w, i) => (
            <li key={i} className='grid gap-0.5 rounded-md border px-3 py-2 text-sm'>
              <div className='flex items-center gap-2'>
                <span className='min-w-0 flex-1 truncate font-medium'>{fanName(w)}</span>
                <span className='shrink-0 text-xs tabular-nums text-warn'>waiting {duration(w.waiting_seconds)}</span>
              </div>
              {(w.spent_cents > 0 || w.fan_messages > 1) && (
                <p className='text-xs text-muted-foreground'>
                  {[w.spent_cents > 0 && `spent ${usd(w.spent_cents)}`, w.fan_messages > 1 && `${w.fan_messages} messages waiting`].filter(Boolean).join(' · ')}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TopFans({ rows }) {
  return (
    <div className='grid gap-2'>
      <h4 className='text-sm font-medium'>Top fans <span className='font-normal text-muted-foreground'>· by what they spent, after Fanvue&apos;s cut</span></h4>
      {!rows.length ? <p className='text-sm text-muted-foreground'>No purchases yet.</p> : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fan</TableHead>
              <TableHead className='text-right'>Spent</TableHead>
              <TableHead className='text-right'>30 days</TableHead>
              <TableHead className='hidden text-right sm:table-cell'>Last wrote</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((f, i) => (
              <TableRow key={i}>
                <TableCell className='max-w-40 truncate'>{fanName(f)}{f.is_top_spender && <Badge variant='outline' className='ms-1.5 h-4 px-1.5 text-[10px] font-normal'>top</Badge>}</TableCell>
                <TableCell className='text-right tabular-nums'>{usd(f.spent_cents)}</TableCell>
                <TableCell className='text-right tabular-nums'>{f.recent_cents > 0 ? usd(f.recent_cents) : '—'}</TableCell>
                <TableCell className='hidden text-right text-muted-foreground sm:table-cell'>{shortDate(f.last_wrote_at)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
