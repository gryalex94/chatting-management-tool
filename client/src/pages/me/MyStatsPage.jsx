import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, Brain, CalendarClock, Eye, GraduationCap, ListChecks, Scale, TrendingUp, Wallet } from 'lucide-react';
import api from '@/services/api';
import { cn } from '@/lib/utils';
import { platformInfo } from '@/utils/platforms';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import DateRangePicker from '@/components/shared/DateRangePicker';
import PlatformBadge from '@/components/shared/PlatformBadge';

const TZ = 'Europe/Amsterdam';
const amsToday = () => new Date().toLocaleDateString('sv-SE', { timeZone: TZ });
const addDays = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const money = (n) => (n == null ? '·' : `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const num = (n) => (n == null ? '·' : Number(n).toLocaleString());
const pct = (n) => (n == null ? '·' : `${Number(n).toFixed(1)}%`);
const secs = (s) => (s == null ? '·' : s < 60 ? `${Math.round(s)} s` : s < 3600 ? `${Math.round(s / 60)} min` : `${(s / 3600).toFixed(1)} h`);
const dayLabel = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const LEVEL = { new: 'New', learning: 'Learning', experienced: 'Experienced' };
const SEVERITY = { critical: 'bg-red-500/15 text-red-600', high: 'bg-orange-500/15 text-orange-600', medium: 'bg-amber-500/15 text-amber-700', low: 'bg-muted text-muted-foreground' };

function Panel({ icon: Icon, title, meta, className, bodyClassName, children }) {
  return (
    <section className={cn('overflow-hidden rounded-lg border bg-card', className)}>
      <div className='flex flex-wrap items-center gap-x-2 gap-y-1 border-b px-4 py-3'>
        {Icon && <Icon className='size-4 text-muted-foreground' />}
        <h3 className='text-sm font-semibold'>{title}</h3>
        {meta && <span className='text-xs text-muted-foreground'>{meta}</span>}
      </div>
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}
const Empty = ({ children }) => <p className='px-4 py-6 text-center text-sm text-muted-foreground'>{children}</p>;

/** The change against the days just before (green up, red down; lowerBetter flips it). */
function Delta({ now, before, lowerBetter }) {
  if (now == null || !before) return null;
  const c = ((now - before) / Math.abs(before)) * 100;
  if (!Number.isFinite(c)) return null;
  return <span className={cn('text-xs tabular-nums', (c >= 0) !== !!lowerBetter ? 'text-emerald-600' : 'text-red-500')}>{c >= 0 ? '↑' : '↓'} {Math.abs(c).toFixed(0)}%</span>;
}
function Tile({ label, value, now, before, lowerBetter, hint }) {
  return (
    <div className='rounded-md border px-3 py-2' title={hint}>
      <div className='text-xs text-muted-foreground'>{label}</div>
      <div className='flex items-baseline gap-2'><span className='text-lg font-semibold tabular-nums'>{value}</span><Delta now={now} before={before} lowerBetter={lowerBetter} /></div>
    </div>
  );
}

/** One platform's numbers for the picked days, against the same number of days before. */
function Sales({ s }) {
  const p = platformInfo(s.platform);
  const n = s.now, b = s.prev || {};
  return (
    <Panel icon={TrendingUp} title={<span className='flex items-center gap-2'><PlatformBadge platform={s.platform} />{p.name}</span>}
      meta={s.prev_from ? `against ${dayLabel(s.prev_from)} – ${dayLabel(s.prev_to)}` : null} bodyClassName='p-4'>
      {s.error ? <Empty>Couldn&apos;t load these numbers just now. Try again in a minute.</Empty>
        : !n ? <Empty>Nothing credited to you on {p.name} in these days.</Empty> : (
          <div className='grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4'>
            <Tile label='Sales credited to you' value={money(n.sales)} now={n.sales} before={b.sales} hint='PPVs and tips credited to you, before the platform fee' />
            <Tile label='PPVs sent' value={num(n.ppv_sent)} now={n.ppv_sent} before={b.ppv_sent} />
            <Tile label='PPVs bought' value={num(n.ppv_bought)} now={n.ppv_bought} before={b.ppv_bought} />
            <Tile label='Buy rate' value={pct(n.unlock_rate)} now={n.unlock_rate} before={b.unlock_rate} hint='PPVs bought out of PPVs sent' />
            <Tile label='Average PPV' value={n.ppv_bought ? money(n.ppv_sales / n.ppv_bought) : '·'} now={n.ppv_bought ? n.ppv_sales / n.ppv_bought : null} before={b.ppv_bought ? b.ppv_sales / b.ppv_bought : null} />
            <Tile label='Messages sent' value={num(n.messages)} now={n.messages} before={b.messages} />
            <Tile label='Fans written to' value={num(n.fans)} now={n.fans} before={b.fans} />
            <Tile label='Reply time' value={secs(n.reply_s)} now={n.reply_s} before={b.reply_s} lowerBetter hint='How long a fan waits for your answer (the middle value)' />
          </div>
        )}
      {s.chats_until && <p className='mt-2 text-xs text-muted-foreground'>The chats are in up to {new Date(s.chats_until).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}; later ones show once they are uploaded.</p>}
    </Panel>
  );
}

function Pay({ pay }) {
  if (!pay || pay.error) return <Panel icon={Wallet} title='My pay'><Empty>Couldn&apos;t work out your pay just now.</Empty></Panel>;
  const per = pay.period;
  const meta = per ? `${dayLabel(per.start)} – ${dayLabel(per.end)} · paid on ${dayLabel(per.payday)}` : null;
  if (!pay.worked) return <Panel icon={Wallet} title='My pay' meta={meta}><Empty>No hours or sales in this pay period yet.</Empty></Panel>;
  const rows = [
    ...(pay.onlyfans && (pay.onlyfans.hours || pay.onlyfans.sales_net) ? [{ platform: 'onlyfans', ...pay.onlyfans, pay: pay.onlyfans.commission + pay.onlyfans.hourly_pay + pay.onlyfans.overtime_pay }] : []),
    ...pay.platforms,
  ];
  return (
    <Panel icon={Wallet} title='My pay' meta={meta} bodyClassName='p-4'>
      <div className='flex flex-wrap items-baseline gap-3'>
        <span className='text-3xl font-bold tabular-nums'>{money(pay.total)}</span>
        <Badge variant={pay.final ? 'default' : 'secondary'}>{pay.final ? 'Final' : 'Estimate'}</Badge>
      </div>
      <p className='mt-1 text-xs text-muted-foreground'>{pay.final ? 'Checked by your manager: this is what gets paid.' : 'So far in this pay period. Final after your manager checks it.'}</p>
      <div className='mt-3 divide-y rounded-md border'>
        {rows.map(r => (
          <div key={r.platform} className='grid gap-1 px-3 py-2 text-sm sm:grid-cols-[1fr_auto]'>
            <div className='flex flex-wrap items-center gap-2'>
              <PlatformBadge platform={r.platform} /><span className='font-medium'>{platformInfo(r.platform).name}</span>
              <span className='text-xs text-muted-foreground'>
                {r.hours} h × {money(r.hourly_rate)}{r.overtime ? ` · ${r.overtime} h overtime` : ''} · {r.commission_pct}% of {money(r.sales_net)} net sales
              </span>
            </div>
            <span className='font-semibold tabular-nums sm:text-right'>{money(r.pay)}</span>
            {r.pages?.length > 0 && <div className='text-xs text-muted-foreground sm:col-span-2'>Sales by page: {r.pages.map(x => `${x.name} ${money(x.amount)}`).join(' · ')}</div>}
          </div>
        ))}
        {pay.additions > 0 && <div className='flex justify-between px-3 py-2 text-sm'><span>Bonuses and additions</span><span className='tabular-nums text-emerald-600'>+{money(pay.additions)}</span></div>}
        {pay.deductions > 0 && <div className='flex justify-between px-3 py-2 text-sm'><span>Deductions</span><span className='tabular-nums text-red-500'>−{money(pay.deductions)}</span></div>}
      </div>
      {pay.notes && <p className='mt-2 text-xs text-muted-foreground'>Note from your manager: {pay.notes}</p>}
    </Panel>
  );
}

function Shifts({ shifts }) {
  return (
    <Panel icon={CalendarClock} title='My next shifts' meta='next 7 days, Amsterdam time' bodyClassName='divide-y'>
      {!shifts.length ? <Empty>No shifts on the rota for the next 7 days.</Empty> : shifts.map((s, i) => (
        <div key={i} className='flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm'>
          <span className='w-28 font-medium'>{dayLabel(s.date)}</span>
          {s.off ? <span className='text-muted-foreground'>Day off</span> : (
            <>
              <PlatformBadge platform={s.platform} />
              <span className='tabular-nums'>{s.start}–{s.end}</span>
              <span className='text-muted-foreground'>{s.shift}{s.part ? ' (part)' : ''}{s.cover ? ' · cover' : ''}</span>
              <span className='text-xs text-muted-foreground'>{s.pages.join(', ')}</span>
            </>
          )}
        </div>
      ))}
    </Panel>
  );
}

function Coaching({ coaching }) {
  return (
    <Panel icon={ListChecks} title='To work on' meta={`${coaching.open.length} open${coaching.done_14d ? ` · ${coaching.done_14d} done in the last 14 days` : ''}`} bodyClassName='divide-y'>
      {!coaching.open.length ? <Empty>Nothing open. Keep it up.</Empty> : coaching.open.map(t => (
        <div key={t.id} className='px-4 py-3'>
          <div className='flex flex-wrap items-center gap-2'>
            {t.severity && <span className={cn('rounded px-1.5 py-0.5 text-[11px] font-medium', SEVERITY[t.severity] || SEVERITY.low)}>{t.severity}</span>}
            <span className='text-sm font-medium'>{t.title}</span>
          </div>
          {t.detail && <p className='mt-1 text-sm text-muted-foreground'>{t.detail}</p>}
          <p className='mt-1 text-xs text-muted-foreground'>{[t.creator_name, t.fan_username && `fan ${t.fan_username}`, t.first_seen_date && `since ${dayLabel(t.first_seen_date)}`].filter(Boolean).join(' · ')}</p>
        </div>
      ))}
    </Panel>
  );
}

const FEEDBACK_TITLE = { compliance: 'Daily check', sales_quality: 'Dialogue and sales quality' };
function Feedback({ feedback }) {
  return (
    <Panel icon={Brain} title='Feedback from the AI review' meta='the latest of each kind' bodyClassName='divide-y'>
      {!feedback.length ? <Empty>No AI review of your chats yet.</Empty> : feedback.map(f => (
        <div key={f.type} className='space-y-2 px-4 py-3'>
          <div className='text-sm font-medium'>{FEEDBACK_TITLE[f.type] || f.type} <span className='font-normal text-muted-foreground'>· {f.date ? dayLabel(f.date) : ''}</span></div>
          {f.summary && <p className='text-sm'>{f.summary}</p>}
          {f.strengths?.length > 0 && <ul className='list-disc space-y-0.5 ps-5 text-sm text-emerald-700'>{f.strengths.map((x, i) => <li key={i}>{typeof x === 'string' ? x : x.detail || x.text}</li>)}</ul>}
          {f.points.length > 0 && (
            <details className='text-sm'>
              <summary className='cursor-pointer text-muted-foreground'>{f.points.length} point{f.points.length === 1 ? '' : 's'} in detail</summary>
              <ul className='mt-2 space-y-2'>
                {f.points.map((p, i) => (
                  <li key={i} className='rounded-md border px-3 py-2'>
                    <div className='flex flex-wrap items-center gap-2 text-xs text-muted-foreground'>
                      {p.severity && <span className={cn('rounded px-1.5 py-0.5 font-medium', SEVERITY[p.severity] || SEVERITY.low)}>{p.severity}</span>}
                      {[p.page, p.fan && `fan ${p.fan}`].filter(Boolean).join(' · ')}
                    </div>
                    {p.detail && <p className='mt-1'>{p.detail}</p>}
                    {p.message && <p className='mt-1 border-s-2 ps-2 text-xs text-muted-foreground'>You wrote: “{p.message}”</p>}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      ))}
    </Panel>
  );
}

function Penalties({ penalties }) {
  return (
    <Panel icon={Scale} title='Penalties and bonuses' bodyClassName='divide-y'>
      {!penalties.length ? <Empty>None so far.</Empty> : penalties.map(p => {
        const bonus = /bonus/i.test(p.type || '');
        return (
          <div key={p.id} className='flex flex-wrap items-start gap-x-3 gap-y-1 px-4 py-2 text-sm'>
            <span className='w-24 text-muted-foreground'>{new Date(p.at).toLocaleDateString([], { day: 'numeric', month: 'short' })}</span>
            <span className={cn('font-medium capitalize', bonus ? 'text-emerald-600' : 'text-red-500')}>{String(p.type || '').replace(/_/g, ' ') || (bonus ? 'bonus' : 'penalty')}{p.amount != null ? ` ${money(p.amount)}` : ''}</span>
            <span className='min-w-0 flex-1'>{p.note}{p.by ? <span className='text-xs text-muted-foreground'> · {p.by}</span> : null}</span>
          </div>
        );
      })}
    </Panel>
  );
}

/** Today so far, every platform together. */
function Today({ list, shifts, today }) {
  const rows = list.filter(x => x.now);
  const sum = (k) => rows.reduce((n, x) => n + (Number(x.now[k]) || 0), 0);
  const mine = shifts.filter(s => s.date === today && !s.off);
  return (
    <div className='flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border bg-card px-4 py-3 text-sm'>
      <span className='font-semibold'>Today</span>
      <span>{mine.length ? mine.map(s => `${s.start}–${s.end} ${s.shift}`).join(', ') : 'No shift today'}</span>
      <span><span className='font-semibold tabular-nums'>{money(sum('sales'))}</span> <span className='text-muted-foreground'>credited</span></span>
      <span><span className='font-semibold tabular-nums'>{sum('ppv_sent')}</span> <span className='text-muted-foreground'>PPVs sent,</span> <span className='font-semibold tabular-nums'>{sum('ppv_bought')}</span> <span className='text-muted-foreground'>bought</span></span>
      <span><span className='font-semibold tabular-nums'>{sum('messages')}</span> <span className='text-muted-foreground'>messages</span></span>
    </div>
  );
}

/**
 * My stats: a chatter's own numbers (their home page). A manager opens it with ?chatter=<id> to see it as
 * that chatter does. The server sends this chatter's numbers only.
 */
export default function MyStatsPage() {
  const [params] = useSearchParams();
  const asChatter = params.get('chatter');
  const [range, setRange] = useState(() => ({ from: addDays(amsToday(), -6), to: amsToday() }));
  // the answer for which days (and whose): while the picked days differ, it's still loading
  const q = new URLSearchParams({ from: range.from, to: range.to, ...(asChatter ? { chatter_id: asChatter } : {}) }).toString();
  const [got, setGot] = useState({ q: null, data: null, error: '' });
  useEffect(() => {
    let live = true;
    api.get(`/api/me/stats?${q}`).then(r => { if (live) setGot({ q, data: r.data, error: '' }); })
      .catch(e => { if (live) setGot({ q, data: null, error: e.response?.data?.error || 'Could not load your stats' }); });
    return () => { live = false; };
  }, [q]);
  const data = got.q === q ? got.data : null, error = got.q === q ? got.error : '';

  const level = data?.level;
  return (
    <div className='flex flex-col gap-4'>
      {data?.preview && (
        <div className='flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm'>
          <Eye className='size-4' /> You&apos;re seeing this page as {data.chatter?.name} sees it.
        </div>
      )}
      <div className='flex flex-wrap items-end justify-between gap-3'>
        <div className='min-w-0'>
          <h2 className='text-2xl font-bold tracking-tight'>My stats</h2>
          <p className='text-muted-foreground'>
            {data?.chatter?.name || 'Your numbers'}
            {level && <span className='ms-2 inline-flex items-center gap-1 text-sm'><GraduationCap className='size-4' />{LEVEL[level.stage] || level.stage}{level.next ? ` · ${LEVEL[level.next.stage]} from ${dayLabel(level.next.on)}` : ''}</span>}
          </p>
        </div>
        <DateRangePicker value={range} onChange={setRange} />
      </div>

      {error ? <div className='flex items-center gap-2 rounded-md border border-red-500/40 px-3 py-2 text-sm text-red-600'><AlertTriangle className='size-4' />{error}</div>
        : !data ? <div className='grid gap-4'><Skeleton className='h-12 w-full' /><Skeleton className='h-48 w-full' /><Skeleton className='h-48 w-full' /></div>
          : !data.linked ? (
            <div className='rounded-lg border bg-card px-4 py-8 text-center'>
              <p className='font-medium'>Your account isn&apos;t linked to a chatter yet</p>
              <p className='mt-1 text-sm text-muted-foreground'>Ask your manager to put the email you sign in with on your chatter (Settings → Chatters).</p>
            </div>
          ) : (
            <>
              <Today list={data.today_sales} shifts={data.shifts} today={data.today} />
              {data.sales.map(s => <Sales key={s.platform} s={s} />)}
              <div className='grid gap-4 lg:grid-cols-2'>
                <Pay pay={data.pay} />
                <Shifts shifts={data.shifts} />
              </div>
              <Coaching coaching={data.coaching} />
              <Feedback feedback={data.feedback} />
              <Penalties penalties={data.penalties} />
            </>
          )}
    </div>
  );
}
