import { useEffect, useState } from 'react';
import { Gauge, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
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
const TIER_WORD = { new: 'new subscribers', none: 'no spend', small: 'small buyers', spender: 'spenders', whale: 'whales', tw: 'time wasters', unknown: 'unknown' };
const dayShort = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString([], { day: 'numeric', month: 'short' });

// The weekly report (C1): this week against last week, and what changed.
function WeeklyReport({ creatorId, version }) {
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    api.get(`/api/ai-chat/pages/${creatorId}/report`).then(r => { if (live) { setReport(r.data); setError(''); } }).catch(e => { if (live) setError(errMsg(e, 'Could not load the weekly report')); });
    return () => { live = false; };
  }, [creatorId, version]);
  if (error) return <p className='text-sm text-muted-foreground'>{error}</p>;
  if (!report) return <p className='flex items-center gap-2 text-sm text-muted-foreground'><Loader2 className='size-4 animate-spin' />Adding up the week…</p>;
  const w = report.this_week, l = report.last_week;
  const row = (label, a, b, unit = '') => (
    <div key={label} className='grid grid-cols-[minmax(0,1fr)_90px_90px] items-center gap-3 text-sm'>
      <span className='truncate text-muted-foreground'>{label}</span>
      <span className='font-medium'>{a == null ? '–' : `${a}${unit}`}</span>
      <span className='text-muted-foreground'>{b == null ? '–' : `${b}${unit}`}</span>
    </div>
  );
  const line = (t) => `${t.n} repl${t.n === 1 ? 'y' : 'ies'}: ${[['replied', t.replied], ['quiet', t.quiet], ['bought', t.bought], ['didn’t buy', t.not_bought], ['ignored', t.ignored]].filter(([, n]) => n).map(([k, n]) => `${n} ${k}`).join(' · ') || 'nothing yet'}`;
  return (
    <section className='flex flex-col gap-2 rounded-lg border p-3'>
      <h3 className='text-xs font-medium uppercase tracking-wide text-muted-foreground'>The week: from Monday {dayShort(report.from)}, against last week (from {dayShort(report.last_from)})</h3>
      <div className='grid grid-cols-[minmax(0,1fr)_90px_90px] gap-3 text-[11px] uppercase tracking-wide text-muted-foreground'><span /><span>This week</span><span>Last week</span></div>
      {row('Replies with an outcome', w.replies, l.replies)}
      {row('He replied', w.replied, l.replied, '%')}
      {row('He went quiet', w.quiet, l.quiet, '%')}
      {row('He bought', w.bought, l.bought, '%')}
      {row('Claude\'s score', w.score, l.score, '%')}
      {row('Replies Claude had fixed', w.fixed, l.fixed)}
      {row('Cost', `$${w.cost}`, `$${l.cost}`)}
      {w.by_goal.length > 0 && (
        <div className='flex flex-col gap-0.5 text-xs'>
          <span className='font-medium'>By moment, this week</span>
          {w.by_goal.slice(0, 8).map(t => <span key={t.key} className='text-muted-foreground'>{GOAL_WORD[t.key] || t.key}: {line(t)}</span>)}
        </div>
      )}
      {w.by_tier.length > 0 && (
        <div className='flex flex-col gap-0.5 text-xs'>
          <span className='font-medium'>By who he is, this week</span>
          {w.by_tier.map(t => <span key={t.key} className='text-muted-foreground'>{TIER_WORD[t.key] || t.key}: {line(t)}</span>)}
        </div>
      )}
      {w.weak.length > 0 && (
        <div className='flex flex-col gap-1 text-xs'>
          <span className='font-medium'>The weakest points this week</span>
          {w.weak.map(x => (
            <div key={x.point} className='flex flex-col gap-0.5 border-l-2 border-bad/40 ps-2'>
              <span>{x.label} · weak {x.count} time{x.count === 1 ? '' : 's'}</span>
              {x.examples.map((e, i) => <span key={i} className='text-muted-foreground'>{e.note} — he: {e.his || '(quiet)'} — her: {(e.her || []).join(' / ')}</span>)}
            </div>
          ))}
        </div>
      )}
      <div className='flex flex-col gap-0.5 text-xs'>
        <span className='font-medium'>What changed since last week</span>
        {report.changes.length ? report.changes.map((c, i) => <span key={i} className='text-muted-foreground'>{c}</span>) : <span className='text-muted-foreground'>Nothing to compare yet.</span>}
      </div>
    </section>
  );
}

// Rules drafted from your marks (C2): approve them and the writer and Claude follow them.
function Rules({ creatorId, version }) {
  const [rules, setRules] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    api.get(`/api/ai-chat/pages/${creatorId}/rules`).then(r => { if (live) setRules(r.data.rules); }).catch(() => { if (live) setRules([]); });
    return () => { live = false; };
  }, [creatorId, version]);
  const decide = async (r, status) => {
    setBusy(true);
    try { const { data } = await api.patch(`/api/ai-chat/pages/${creatorId}/rules/${r.id}`, { status }); setRules(data.rules); }
    catch (e) { toast.error(errMsg(e, 'Could not save that')); }
    finally { setBusy(false); }
  };
  const draft = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/api/ai-chat/pages/${creatorId}/rules/draft`);
      setRules(data.rules);
      toast.success(data.drafted ? `${data.drafted} rule${data.drafted === 1 ? '' : 's'} drafted from your marks` : data.groups ? 'Nothing new to draft: your marks don\'t share enough yet' : 'Not enough marks yet: three similar ones in one moment are needed');
    } catch (e) { toast.error(errMsg(e, 'Could not draft rules')); }
    finally { setBusy(false); }
  };
  const drafts = (rules || []).filter(r => r.status === 'draft'), approved = (rules || []).filter(r => r.status === 'approved');
  return (
    <section className='flex flex-col gap-2 rounded-lg border p-3'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <h3 className='text-xs font-medium uppercase tracking-wide text-muted-foreground'>Rules from your marks</h3>
        <Button size='sm' variant='outline' className='h-7 text-xs' onClick={draft} disabled={busy}>{busy ? <Loader2 className='size-3 animate-spin' /> : null}Draft rules from my marks now</Button>
      </div>
      <p className='text-xs text-muted-foreground'>Three similar marks in one moment and a rule is drafted for you. Approve it and the writer reads it with every reply, and Claude checks against it.</p>
      {rules === null ? <Loader2 className='size-4 animate-spin text-muted-foreground' /> : (
        <>
          {drafts.length > 0 && (
            <div className='flex flex-col gap-1.5'>
              {drafts.map(r => (
                <div key={r.id} className='flex flex-col gap-1 rounded-md border border-warn/40 bg-warn/5 p-2 text-xs'>
                  <span>{r.text}</span>
                  <span className='text-muted-foreground'>{r.kind === 'wording' ? 'Wording' : 'A wrong call'}{r.goal ? ` · ${GOAL_WORD[r.goal] || r.goal}` : ''} · from {r.from_ids?.length || 0} marks</span>
                  <div className='flex gap-1.5'>
                    <Button size='sm' variant='outline' className='h-7 text-xs' onClick={() => decide(r, 'approved')} disabled={busy}>Approve</Button>
                    <Button size='sm' variant='ghost' className='h-7 text-xs' onClick={() => decide(r, 'dismissed')} disabled={busy}>Dismiss</Button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {approved.length > 0 && (
            <div className='flex flex-col gap-0.5 text-xs'>
              <span className='font-medium'>In force</span>
              {approved.map(r => (
                <div key={r.id} className='flex items-start justify-between gap-2'>
                  <span>{r.text}{r.goal ? <span className='text-muted-foreground'> · {GOAL_WORD[r.goal] || r.goal}</span> : null}</span>
                  <button type='button' className='shrink-0 text-muted-foreground hover:underline' onClick={() => decide(r, 'dismissed')} disabled={busy}>Switch off</button>
                </div>
              ))}
            </div>
          )}
          {!drafts.length && !approved.length && <p className='text-xs text-muted-foreground'>No rules yet.</p>}
        </>
      )}
    </section>
  );
}

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
          {open && <WeeklyReport creatorId={creatorId} version={version} />}
          {open && <Rules creatorId={creatorId} version={version} />}
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
