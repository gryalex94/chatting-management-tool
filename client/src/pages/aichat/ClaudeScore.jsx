import { useEffect, useState } from 'react';
import { Gauge, Loader2 } from 'lucide-react';
import api from '@/services/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cost, errMsg } from './shared';

// The plan's goals, in plain words (the moment a reply was for).
const GOAL_WORD = {
  follow_up: 'Following up', no_freebies: 'Asked for free things', after_buy: 'Right after a buy', aftercare: 'Aftercare', goodbye: 'Goodbyes',
  ease_off: 'Easing off', comfort: 'Comforting him', reassure: 'Reassuring him', calm: 'Calming him', answer_ppv: 'Questions about a PPV',
  point_to_ppv: 'Pointing to a waiting PPV', honest_no: 'Content she doesn\'t have', offer: 'Offering what he asked for', lead_story: 'Leading the sexting',
  tease: 'Teasing', welcome_back: 'Welcome back', steer_to_sale: 'Steering to a sale', wind_down: 'Winding down', get_to_know: 'Getting to know him',
  chat: 'Small talk', unknown: 'Other',
};
const RANGES = [[1, 'Today'], [7, '7 days'], [30, '30 days']];
const tone = (s) => (s == null ? 'text-muted-foreground' : s >= 80 ? 'text-good' : s >= 60 ? 'text-warn' : 'text-bad');
const pct = (s) => (s == null ? '–' : `${s}%`);
const dayWord = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });

// good / okay / weak as one bar
function Bar({ c }) {
  const n = c.good + c.okay + c.weak;
  if (!n) return <span className='h-2 w-full rounded-full bg-muted' />;
  return (
    <span className='flex h-2 w-full overflow-hidden rounded-full bg-muted' aria-hidden>
      <span className='bg-good' style={{ width: `${(100 * c.good) / n}%` }} />
      <span className='bg-warn' style={{ width: `${(100 * c.okay) / n}%` }} />
      <span className='bg-bad' style={{ width: `${(100 * c.weak) / n}%` }} />
    </span>
  );
}
const counts = (c) => [`${c.good} good`, `${c.okay} okay`, `${c.weak} weak`, c.declined ? `${c.declined} not looked at` : null].filter(Boolean).join(' · ');

/**
 * Claude's score (Q49): a button with today's score, and the report it opens: the
 * score per day and the most common weak points, from Claude's watch-only checks of
 * Practice replies. `version` changes after each reply, so the score follows.
 */
export default function ClaudeScore({ creatorId, version = 0 }) {
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState(7);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [today, setToday] = useState(null);

  useEffect(() => {
    let live = true;
    api.get(`/api/ai-chat/pages/${creatorId}/checks`, { params: { days: 1 } }).then(r => { if (live) setToday(r.data.today_score); }).catch(() => {});
    return () => { live = false; };
  }, [creatorId, version]);
  useEffect(() => {
    if (!open) return undefined;
    let live = true;
    api.get(`/api/ai-chat/pages/${creatorId}/checks`, { params: { days } }).then(r => { if (live) { setData(r.data); setError(''); } })
      .catch(e => { if (live) { setData(null); setError(errMsg(e, 'Could not load Claude\'s score')); } });
    return () => { live = false; };
  }, [open, days, creatorId, version]);

  const shown = data?.days === days ? data : null;
  return (
    <>
      <Button size='sm' variant='ghost' onClick={() => setOpen(true)} title='Claude checks every practice reply: the score and the most common weak points'>
        <Gauge />Claude&apos;s score
        {today?.checked > 0 && <span className={cn('font-semibold', tone(today.score))}>{pct(today.score)}</span>}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className='max-h-[85vh] overflow-y-auto sm:max-w-2xl'>
          <DialogHeader>
            <DialogTitle>Claude&apos;s score</DialogTitle>
            <DialogDescription>
              Claude checks every practice reply against the rules, the plan and your marks. It only watches: it never changes a reply.
              Good counts 1, okay half, weak 0.
            </DialogDescription>
          </DialogHeader>
          <div className='flex gap-1.5' role='group' aria-label='Period'>
            {RANGES.map(([d, label]) => (
              <button key={d} type='button' onClick={() => setDays(d)} aria-pressed={days === d}
                className={cn('rounded-full border px-3 py-0.5 text-xs', days === d ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted')}>
                {label}
              </button>
            ))}
          </div>
          {error ? <p className='text-sm text-muted-foreground'>{error}</p> : !shown ? (
            <p className='flex items-center gap-2 text-sm text-muted-foreground'><Loader2 className='size-4 animate-spin' />Adding up…</p>
          ) : !shown.total.checked ? (
            <p className='text-sm text-muted-foreground'>No practice replies checked {days === 1 ? 'today' : `in the last ${days} days`} yet.</p>
          ) : (
            <div className='flex flex-col gap-5'>
              <div className='flex flex-wrap items-center gap-x-5 gap-y-2'>
                <span className={cn('text-3xl font-semibold', tone(shown.total.score))}>{pct(shown.total.score)}</span>
                <div className='flex min-w-48 flex-1 flex-col gap-1.5'>
                  <Bar c={shown.total} />
                  <span className='text-xs text-muted-foreground'>{shown.total.checked} repl{shown.total.checked === 1 ? 'y' : 'ies'} checked: {counts(shown.total)} · {cost(shown.total.cost)}</span>
                </div>
              </div>

              {days > 1 && (
                <section className='flex flex-col gap-1.5'>
                  <h3 className='text-xs font-medium uppercase tracking-wide text-muted-foreground'>By day</h3>
                  {shown.by_day.map(d => (
                    <div key={d.day} className='grid grid-cols-[110px_48px_minmax(0,1fr)] items-center gap-3 text-sm'>
                      <span>{dayWord(d.day)}</span>
                      <span className={cn('font-medium', tone(d.score))}>{pct(d.score)}</span>
                      <span className='flex flex-col gap-1'><Bar c={d} /><span className='text-[11px] text-muted-foreground'>{d.checked} checked · {counts(d)}</span></span>
                    </div>
                  ))}
                </section>
              )}

              <section className='flex flex-col gap-2'>
                <h3 className='text-xs font-medium uppercase tracking-wide text-muted-foreground'>Most common weak points</h3>
                {!shown.weak_points.length && <p className='text-sm text-muted-foreground'>None: Claude found nothing weak.</p>}
                {shown.weak_points.map(w => (
                  <div key={w.point} className='flex flex-col gap-1.5 rounded-lg border p-3'>
                    <span className='text-sm font-medium'>{w.label} <span className='font-normal text-muted-foreground'>· weak in {w.count} repl{w.count === 1 ? 'y' : 'ies'}</span></span>
                    {w.examples.map((x, i) => (
                      <div key={i} className='flex flex-col gap-0.5 border-l-2 border-bad/40 ps-2 text-xs'>
                        <span>{x.note}</span>
                        <span className='text-muted-foreground'>He: {x.his || '(he was quiet)'}</span>
                        <span className='text-muted-foreground'>Her: {(x.her || []).join(' / ')}</span>
                        <span className='text-[11px] text-muted-foreground'>{GOAL_WORD[x.goal] || x.goal} · {new Date(x.at).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </section>

              {shown.outcomes?.length > 0 && (
                <section className='flex flex-col gap-1.5'>
                  <h3 className='text-xs font-medium uppercase tracking-wide text-muted-foreground'>What he did next, by moment (as you played him)</h3>
                  {shown.outcomes.map(o => (
                    <div key={o.goal} className='grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 text-sm'>
                      <span className='truncate'>{GOAL_WORD[o.goal] || o.goal}</span>
                      <span className='text-[11px] text-muted-foreground'>{o.n} repl{o.n === 1 ? 'y' : 'ies'}: {[['replied', o.replied], ['quiet', o.quiet], ['bought', o.bought], ['didn’t buy', o.not_bought], ['ignored', o.ignored]].filter(([, n]) => n).map(([l, n]) => `${n} ${l}`).join(' · ') || 'nothing yet'}</span>
                    </div>
                  ))}
                </section>
              )}
              <section className='flex flex-col gap-1.5'>
                <h3 className='text-xs font-medium uppercase tracking-wide text-muted-foreground'>By moment</h3>
                {shown.by_goal.map(g => (
                  <div key={g.goal} className='grid grid-cols-[minmax(0,1fr)_48px_120px] items-center gap-3 text-sm'>
                    <span className='truncate'>{GOAL_WORD[g.goal] || g.goal}</span>
                    <span className={cn('font-medium', tone(g.score))}>{pct(g.score)}</span>
                    <span className='text-[11px] text-muted-foreground'>{g.checked} checked{g.weak ? ` · ${g.weak} weak` : ''}</span>
                  </div>
                ))}
              </section>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
