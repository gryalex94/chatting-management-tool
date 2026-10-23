import { useEffect, useState } from 'react';
import api from '@/services/api';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { num } from '@/utils/numbers';

const money = (n) => (n == null ? '·' : `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const date = (iso) => (iso ? new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short' }) : '·');
const TYPE = [
  ['chat_ppv', 'Chat PPVs'], ['mass_ppv', 'Mass message PPVs'], ['chat_tip', 'Tips in chat'], ['wall', 'Wall and posts'],
  ['subscription', 'Subscriptions'], ['other', 'Other'], ['unsorted', 'Not sorted yet'], ['refund', 'Refunds'],
];

/**
 * One Fansly page's money: revenue by type (chat, mass, tips, wall,
 * subscriptions), by day, the top fans, new paying fans, expired subscriptions,
 * and how the chatters used the AI's suggested replies.
 */
export default function FanslyRevenue() {
  const [accounts, setAccounts] = useState(null);
  const [account, setAccount] = useState('');
  const [days, setDays] = useState('30');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/api/fansly/messages/filters').then(r => { setAccounts(r.data.accounts || []); if (r.data.accounts?.[0]) setAccount(r.data.accounts[0].id); })
      .catch(e => setError(e?.response?.data?.error || 'Could not load the pages'));
  }, []);
  useEffect(() => {
    if (!account) return undefined;
    let live = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setData(null);
    api.get(`/api/fansly/revenue?account=${account}&days=${days}`).then(r => { if (live) setData(r.data); }).catch(e => { if (live) setError(e?.response?.data?.error || 'Could not load the revenue'); });
    return () => { live = false; };
  }, [account, days]);

  if (error) return <p className='text-sm text-muted-foreground'>{error}</p>;
  if (!accounts) return <Skeleton className='h-64 w-full' />;
  if (!accounts.length) return <p className='text-sm text-muted-foreground'>No Fansly page recorded yet.</p>;
  const maxDay = data ? Math.max(1, ...data.by_day.map(d => Math.abs(d.net))) : 1;

  return (
    <div className='grid gap-4'>
      <div className='flex flex-wrap items-center gap-2'>
        <Select value={account} onValueChange={setAccount}>
          <SelectTrigger className='w-52'><SelectValue /></SelectTrigger>
          <SelectContent>{accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.page}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={days} onValueChange={setDays}>
          <SelectTrigger className='w-36'><SelectValue /></SelectTrigger>
          <SelectContent>{[['7', 'Last 7 days'], ['30', 'Last 30 days'], ['90', 'Last 90 days'], ['365', 'Last year']].map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
        </Select>
        <p className='text-xs text-muted-foreground'>From the sales ledger (Fansly&apos;s Earnings page, read by the extension). Net, after Fansly&apos;s cut.</p>
      </div>

      {!data ? <Skeleton className='h-80 w-full' /> : (
        <>
          <div className='grid grid-cols-2 gap-2 sm:grid-cols-4'>
            <Tile label='Net revenue' value={money(data.totals.net)} />
            <Tile label='Purchases' value={num(data.totals.transactions)} />
            <Tile label='Paying fans' value={num(data.totals.paying_fans)} />
            <Tile label='New paying fans' value={num(data.totals.new_paying_fans)} />
          </div>

          <section className='rounded-lg border bg-card'>
            <h3 className='border-b px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground'>By type</h3>
            <Table>
              <TableBody>
                {TYPE.filter(([k]) => data.totals.by_type[k] != null).map(([k, l]) => (
                  <TableRow key={k}>
                    <TableCell>{l}</TableCell>
                    <TableCell className='text-right tabular-nums'>{money(data.totals.by_type[k])}</TableCell>
                    <TableCell className='w-24 text-right text-xs text-muted-foreground'>{data.totals.net ? `${Math.round((data.totals.by_type[k] / data.totals.net) * 100)}%` : ''}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className='px-4 pb-3 text-xs text-muted-foreground'>Only chat PPVs, mass message PPVs (if the page&apos;s rule credits them) and tips in chat count toward a chatter&apos;s pay.</p>
          </section>

          {data.by_day.length > 0 && (
            <section className='rounded-lg border bg-card px-4 py-3'>
              <h3 className='mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground'>By day</h3>
              <div className='flex h-32 items-end gap-px' role='img' aria-label='Net revenue per day'>
                {data.by_day.map(d => (
                  <div key={d.day} className='flex-1 rounded-t-sm bg-primary/70 hover:bg-primary' style={{ height: `${Math.max(2, (Math.max(0, d.net) / maxDay) * 100)}%` }} title={`${d.day}: ${money(d.net)}`} />
                ))}
              </div>
              <div className='mt-1 flex justify-between text-[11px] text-muted-foreground'><span>{data.by_day[0].day}</span><span>{data.by_day[data.by_day.length - 1].day}</span></div>
            </section>
          )}

          <div className='grid gap-4 lg:grid-cols-2'>
            <ListCard title='Top fans' empty='No purchases in this period.' rows={data.top_fans} cols={[['Fan', r => r.name], ['Purchases', r => num(r.purchases), true], ['Net', r => money(r.net), true]]} />
            <ListCard title='New paying fans' empty='No new paying fans in this period.' rows={data.new_paying} cols={[['Fan', r => r.name], ['First purchase', r => date(r.first_purchase)], ['Net', r => money(r.net), true]]} />
            <ListCard title='Expired subscriptions' empty='None recorded. They come from the Subscribers page and the chat list.' rows={data.expired} cols={[['Fan', r => r.name], ['Tier', r => r.tier || '·'], ['Ended', r => date(r.ended)]]} />
            <ListCard title='Suggested replies (AI)' empty='No suggestions asked for in this period.' rows={data.ai}
              cols={[['Chatter', r => r.name], ['Asked', r => num(r.shown), true], ['Used', r => num(r.inserted + r.sent_as_is + r.edited), true], ['Sent as is', r => num(r.sent_as_is), true], ['Edited', r => num(r.edited), true], ['Cost', r => money(r.cost), true]]} />
          </div>
        </>
      )}
    </div>
  );
}

function Tile({ label, value }) {
  return <div className='rounded-md border bg-card px-3 py-2'><p className='text-[11px] text-muted-foreground'>{label}</p><p className='text-base font-semibold tabular-nums'>{value}</p></div>;
}

function ListCard({ title, rows, cols, empty }) {
  return (
    <section className='rounded-lg border bg-card'>
      <h3 className='border-b px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground'>{title}</h3>
      {!rows?.length ? <p className='px-4 py-4 text-sm text-muted-foreground'>{empty}</p> : (
        <Table>
          <TableHeader><TableRow>{cols.map(([l, , right]) => <TableHead key={l} className={right ? 'text-right' : ''}>{l}</TableHead>)}</TableRow></TableHeader>
          <TableBody>
            {rows.map((r, i) => <TableRow key={i}>{cols.map(([l, f, right]) => <TableCell key={l} className={right ? 'text-right tabular-nums' : ''}>{f(r)}</TableCell>)}</TableRow>)}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
