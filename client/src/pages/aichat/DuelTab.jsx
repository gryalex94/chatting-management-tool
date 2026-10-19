import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CircleAlert, Image as ImageIcon, Loader2, Lock, Play, Scale, Trophy } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/services/api';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { cost, dayTime, dollars, errMsg, fanName, shortDay } from './shared';

const runName = (b) => `Test of ${dayTime(b.batch)}`;
const pct = (n, d) => (d ? `${Math.round((100 * n) / d)}%` : '–');
const moments = (n) => `${n} moment${n === 1 ? '' : 's'}`;
const WHO = { tie: "Can't choose", none: 'None is good' };   // picks that aren't one of the answers

// Her messages as bubbles, on the right.
function Said({ list, k }) {
  return (
    <div className='flex flex-col items-end gap-1.5'>
      {list.map((m, i) => <div key={i} className='max-w-[90%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-primary px-3 py-1.5 text-sm text-primary-foreground'>{m[k]}</div>)}
    </div>
  );
}

// Who was picked as best, out of the votes cast: her chatter, each AI writer, none.
function Score({ title, t, writers, note }) {
  const rows = [['chatter', 'Her chatter'], ['ai', writers.ai || 'AI'], ...(writers.ai2 ? [['ai2', writers.ai2]] : []), ['none', 'None is good'], ['tie', "Can't choose"]];
  const ai = t.ai + t.ai2;
  return (
    <div className='flex flex-col gap-2 rounded-lg border p-4'>
      <span className='text-sm text-muted-foreground'>{title}</span>
      <span className='text-2xl font-semibold tabular-nums'>{t.n ? `AI best ${pct(ai, t.n)}` : '–'}</span>
      <div className='grid gap-1 text-xs'>
        {rows.map(([k, label]) => (
          <div key={k} className='flex items-center gap-2'>
            <span className='w-32 shrink-0 truncate text-muted-foreground'>{label}</span>
            <div className='h-1.5 flex-1 rounded bg-muted'><div className='h-1.5 rounded bg-primary' style={{ width: t.n ? `${(100 * t[k]) / t.n}%` : 0 }} /></div>
            <span className='w-14 text-right tabular-nums'>{t[k]} · {pct(t[k], t.n)}</span>
          </div>
        ))}
      </div>
      {note && <span className='text-xs text-muted-foreground'>{note}</span>}
    </div>
  );
}

// What came with a message: a PPV (and whether he had bought it by then), photos, a tip.
function Note({ text }) {
  const ppv = text.startsWith('PPV');
  return (
    <span className={cn('flex items-center gap-1 px-1 text-[11px]', ppv ? 'text-warn' : 'text-muted-foreground')}>
      {ppv ? <Lock className='size-3' /> : <ImageIcon className='size-3' />}{text}
    </span>
  );
}

// The chat up to the moment being judged, scrolled to the end.
function Context({ duel }) {
  const box = useRef(null);
  useLayoutEffect(() => { if (box.current) box.current.scrollTop = box.current.scrollHeight; }, [duel.id]);
  return (
    <div ref={box} className='flex max-h-[40vh] flex-col gap-2 overflow-y-auto rounded-lg border bg-card p-3'>
      <span className='text-center text-xs text-muted-foreground'>The whole chat up to this moment, as her chatter saw it then: photos, PPVs and the mass messages he answered</span>
      {duel.context.map((m, i) => (
        <div key={i} className={cn('flex flex-col gap-1', m.mass ? 'items-center' : m.from_fan ? 'items-start' : 'items-end')}>
          {(i === 0 || shortDay(m.sent_at) !== shortDay(duel.context[i - 1].sent_at)) && <span className='mb-1 self-center text-[11px] text-muted-foreground'>{dayTime(m.sent_at)}</span>}
          {m.mass ? (
            <p className='max-w-[80%] text-center text-xs italic text-muted-foreground'>{m.mass}: {m.message || m.empty}{m.note ? ` (${m.note})` : ''}</p>
          ) : (
            <>
              <div className={cn('max-w-[80%] whitespace-pre-wrap rounded-2xl px-3 py-1.5 text-sm',
                m.from_fan ? 'rounded-bl-sm bg-muted' : 'rounded-br-sm bg-primary/80 text-primary-foreground',
                m.from_fan && i === duel.context.length - 1 && 'ring-2 ring-primary/50')}>
                {m.message || m.empty}
              </div>
              {m.note && <Note text={m.note} />}
            </>
          )}
        </div>
      ))}
      <span className='text-center text-xs text-muted-foreground'>What should she answer?</span>
    </div>
  );
}

/**
 * The blind test: real moments from her chats (mostly with fans who pay) where a
 * chatter answered a fan, with two AI writers' answers to the same moment, shown
 * as A, B and C. The manager picks the best one, or none, without knowing who
 * wrote which; Claude judges them too. Her chatters' answers that were followed
 * by a purchase are the gold standard ("proven answers"); the AI learns from them.
 */
export default function DuelTab({ page, ready, onSpent }) {
  const [ov, setOv] = useState(null);                 // { ready, v2, proven_answers, batches, job }
  const [batch, setBatch] = useState(null);
  const [view, setView] = useState('judge');
  const [duel, setDuel] = useState(null);             // the moment being judged
  const [res, setRes] = useState(null);               // the results
  const [count, setCount] = useState('100');
  const [busy, setBusy] = useState('');

  const load = useCallback(() => api.get(`/api/ai-chat/pages/${page.creator_id}/duels`).then(r => setOv(r.data))
    .catch(e => setOv({ error: errMsg(e, 'Could not load the blind tests') })), [page.creator_id]);
  useEffect(() => { load(); }, [load]);
  const running = !!ov?.job?.running;
  useEffect(() => {
    if (!running) return undefined;
    const t = setInterval(() => { load(); onSpent?.(); }, 3000);
    return () => clearInterval(t);
  }, [running, load, onSpent]);

  const current = batch || ov?.batches?.[0]?.batch || null;
  // reload when more moments of this test come in (while it runs)
  const arrived = ov?.batches?.find(b => b.batch === current)?.total || 0;
  useEffect(() => {
    if (!current) return undefined;
    let live = true;
    const url = view === 'judge' ? 'next' : 'results';
    api.get(`/api/ai-chat/pages/${page.creator_id}/duels/${url}`, { params: { batch: current } })
      .then(r => { if (live) (view === 'judge' ? setDuel : setRes)(r.data); })
      .catch(e => { if (live) toast.error(errMsg(e, 'Could not load the test')); });
    return () => { live = false; };
  }, [page.creator_id, current, view, arrived]);

  const start = async () => {
    setBusy('start');
    try {
      const { data } = await api.post(`/api/ai-chat/pages/${page.creator_id}/duels`, { count: Number(count) });
      setOv(o => ({ ...o, job: data.job })); setBatch(data.job.batch); setView('judge'); setDuel(null);
      toast.success('Started');
    } catch (e) { toast.error(errMsg(e, 'Could not start')); }
    finally { setBusy(''); }
  };
  const vote = async (choice) => {
    setBusy(choice);
    try {
      const { data } = await api.post(`/api/ai-chat/pages/${page.creator_id}/duels/${duel.id}/vote`, { vote: choice });
      setDuel(data);
      if (data.done) { load(); if (!running) { toast.success('All judged: here are the results'); setView('results'); } }
    } catch (e) { toast.error(errMsg(e, 'Could not save the vote')); }
    finally { setBusy(''); }
  };

  if (!ov) return <div className='grid gap-3'>{[0, 1, 2].map(i => <Skeleton key={i} className='h-14 w-full' />)}</div>;
  if (ov.error) return <p className='text-sm text-muted-foreground'>{ov.error}</p>;
  if (!ov.ready || !ov.v2) {
    return (
      <div className='flex items-start gap-2 rounded-lg border border-warn/40 bg-warn/5 px-4 py-3 text-sm'>
        <CircleAlert className='mt-0.5 size-4 shrink-0 text-warn' />
        <span>Run database change {ov.ready ? '038 (proven answers)' : '037 (AI blind test), then 038'} in Supabase first.</span>
      </div>
    );
  }
  const job = ov.job;
  const run = ov.batches.find(b => b.batch === current);

  return (
    <div className='flex flex-col gap-4'>
      <div className='flex flex-wrap items-end justify-between gap-3 rounded-lg border px-4 py-3'>
        <div className='flex max-w-2xl items-start gap-2 text-sm'>
          <Scale className='mt-0.5 size-4 shrink-0 text-muted-foreground' />
          <span>
            Real moments from her chats, mostly with fans who pay. For each: her chatter&apos;s real answer and two AI answers to the same
            moment, as A, B and C. Pick the best one, or none, without knowing who wrote which; Claude judges them too.
            Her chatters&apos; answers that were followed by a purchase are the gold standard ({ov.proven_answers ? `${ov.proven_answers} proven answers` : 'built when a test starts'});
            the AI learns from them. About $0.20 per 100 moments.
          </span>
        </div>
        <div className='flex items-end gap-2'>
          <div className='grid gap-1'>
            <Label htmlFor='duel-count' className='text-xs'>Moments</Label>
            <Input id='duel-count' type='number' min='20' max='150' className='h-9 w-24' value={count} onChange={e => setCount(e.target.value)} />
          </div>
          <Button onClick={start} disabled={!!busy || running || !ready.writer}>
            {busy === 'start' || running ? <Loader2 className='animate-spin' /> : <Play />}New test
          </Button>
        </div>
      </div>

      {job?.running && (
        <p className='flex items-center gap-2 text-sm text-muted-foreground'>
          <Loader2 className='size-4 animate-spin' />
          {job.phase === 'gold'
            ? `Collecting proven answers: ${job.gold_done} of ${job.gold_total || '…'}`
            : `${job.writers?.join(' and ') || 'The AI'} answering the moments: ${job.done} of ${job.total} (${cost(job.cost)} so far). You can start judging as they come in.`}
        </p>
      )}
      {job && !job.running && job.last_error && <p className='text-sm text-warn'>{job.failed ? `${job.failed} moment${job.failed === 1 ? '' : 's'} couldn't be answered: ` : ''}{job.last_error}</p>}

      {!ov.batches.length ? (
        <p className='rounded-lg border border-dashed p-6 text-sm text-muted-foreground'>No test yet. Start one above.</p>
      ) : (
        <>
          <div className='flex flex-wrap items-center gap-2'>
            {ov.batches.length > 1 && (
              <Select value={current} onValueChange={(v) => { setBatch(v); setDuel(null); setRes(null); }}>
                <SelectTrigger className='w-80' aria-label='Test run'><SelectValue /></SelectTrigger>
                <SelectContent>{ov.batches.map(b => <SelectItem key={b.batch} value={b.batch}>{runName(b)} · {b.voted} of {b.total} judged</SelectItem>)}</SelectContent>
              </Select>
            )}
            <div className='flex gap-1 rounded-md bg-muted p-1'>
              {[['judge', 'Judge'], ['results', 'Results']].map(([k, l]) => (
                <button key={k} type='button' onClick={() => setView(k)} aria-pressed={view === k}
                  className={cn('rounded px-3 py-1 text-sm', view === k ? 'bg-background shadow-sm' : 'text-muted-foreground')}>{l}</button>
              ))}
            </div>
            {run && <span className='text-sm text-muted-foreground'>{run.voted} of {run.total} judged</span>}
          </div>

          {view === 'judge' && (!duel ? <Skeleton className='h-64 w-full' /> : duel.done ? (
            <div className='flex flex-col items-start gap-3 rounded-lg border p-6'>
              <p className='text-sm'>{job?.running ? 'You\'ve judged every moment that\'s ready. More are coming in.' : 'You\'ve judged every moment in this test.'}</p>
              <Button onClick={() => setView('results')}><Trophy />See the results</Button>
            </div>
          ) : (
            <div className='flex flex-col gap-4'>
              <div className='flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-lg border px-4 py-2 text-sm'>
                <span><span className='font-medium'>{fanName(duel.fan)}</span> <span className='text-muted-foreground'>· moment {duel.number} of {duel.total}</span></span>
                <span className='text-xs text-muted-foreground'>
                  By then: {duel.fan.standing && <span className='font-medium text-foreground'>{duel.fan.standing}</span>}
                  {' · '}{duel.fan.spent_before ? `spent ${dollars(duel.fan.spent_before)}` : 'hadn\'t spent anything'}
                  {duel.fan.paid_messages ? ` (${duel.fan.paid_messages} PPV${duel.fan.paid_messages === 1 ? '' : 's'} bought, last ${shortDay(duel.fan.last_purchase)})` : ''}
                  {' · '}{duel.fan.messages_before} messages in the chat{duel.fan.since ? ` since ${shortDay(duel.fan.since)}` : ''}
                </span>
              </div>
              <Context duel={duel} />
              <div className={cn('grid gap-3', duel.options.length > 2 ? 'lg:grid-cols-3' : 'md:grid-cols-2')}>
                {duel.options.map(o => (
                  <div key={o.key} className='flex flex-col justify-between gap-3 rounded-lg border p-3'>
                    <div className='flex flex-col gap-2'>
                      <span className='text-sm font-medium'>Answer {o.key}</span>
                      <Said list={o.messages} k='creator_message' />
                    </div>
                    <Button variant='outline' onClick={() => vote(o.key)} disabled={!!busy}>{busy === o.key && <Loader2 className='animate-spin' />}{o.key} is best</Button>
                  </div>
                ))}
              </div>
              <div className='flex flex-wrap gap-2'>
                <Button variant='ghost' onClick={() => vote('none')} disabled={!!busy}>None is good</Button>
                <Button variant='ghost' onClick={() => vote('tie')} disabled={!!busy}>Can&apos;t choose</Button>
              </div>
            </div>
          ))}

          {view === 'results' && (!res ? <Skeleton className='h-64 w-full' /> : (
            <div className='flex flex-col gap-4'>
              <div className='grid gap-3 lg:grid-cols-2'>
                <Score title='Your votes: which answer was best' t={res.you} writers={res.writers} note={`${res.you.n} of ${res.total} judged`} />
                <Score title="Claude's votes" t={res.claude} writers={res.writers} />
              </div>
              <div className='grid gap-3 lg:grid-cols-2'>
                <div className='flex flex-col gap-1 rounded-lg border p-4 text-sm'>
                  <span className='font-medium'>Against the gold standard</span>
                  {res.proven.n ? (
                    <>
                      <span className='text-xs text-muted-foreground'>{moments(res.proven.n)} where her chatter&apos;s answer was followed by a purchase within a day.</span>
                      <span>You picked an AI answer over that proven answer in {pct(res.proven.you.ai + res.proven.you.ai2, res.proven.you.n)} of them ({res.proven.you.n} judged).</span>
                      <span>Claude: {pct(res.proven.claude.ai + res.proven.claude.ai2, res.proven.claude.n)}.</span>
                    </>
                  ) : <span className='text-xs text-muted-foreground'>No proven moments in this test (tests from before proven answers don&apos;t have them).</span>}
                </div>
                <div className='flex flex-col gap-1 rounded-lg border p-4 text-xs text-muted-foreground'>
                  <span className='text-sm text-foreground'>Reality check on Claude</span>
                  <span>When her chatter&apos;s answer really got him writing back, Claude picked it {pct(res.real_check.answered.chatter, res.real_check.answered.n)} of the time ({moments(res.real_check.answered.n)}); when it didn&apos;t: {pct(res.real_check.unanswered.chatter, res.real_check.unanswered.n)} ({res.real_check.unanswered.n}).</span>
                  <span>If Claude judged by what works, the first number would be clearly higher. This test cost {cost(res.cost)}.</span>
                </div>
              </div>

              {res.by_situation.length > 0 && (
                <div className='overflow-x-auto rounded-lg border'>
                  <table className='w-full min-w-[520px] text-sm'>
                    <thead><tr className='border-b bg-muted/40 text-left text-xs text-muted-foreground'>
                      <th className='px-3 py-2 font-medium'>Situation (Playbook)</th><th className='px-3 py-2 text-right font-medium'>Moments</th>
                      <th className='px-3 py-2 text-right font-medium'>AI best, by you</th><th className='px-3 py-2 text-right font-medium'>AI best, by Claude</th>
                    </tr></thead>
                    <tbody>{res.by_situation.map(s => (
                      <tr key={s.title} className='border-b last:border-b-0'>
                        <td className='px-3 py-1.5'>{s.title}</td><td className='px-3 py-1.5 text-right tabular-nums'>{s.n}</td>
                        <td className='px-3 py-1.5 text-right tabular-nums'>{s.you_n ? pct(s.ai_you, s.you_n) : '–'}</td>
                        <td className='px-3 py-1.5 text-right tabular-nums'>{pct(s.ai_claude, s.n)}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )}

              <div className='flex flex-col gap-3'>
                {res.duels.map(d => (
                  <div key={d.id} className='flex flex-col gap-2 rounded-lg border p-3'>
                    <div className='flex flex-wrap items-center gap-2 text-xs text-muted-foreground'>
                      <span>{dayTime(d.moment_at)}</span>
                      {d.proven && <Badge variant='outline' className='border-good/40 font-normal text-good'>proven: a purchase followed</Badge>}
                      {d.fan_context.spent_before != null && <span>{d.fan_context.spent_before ? `he had spent ${dollars(d.fan_context.spent_before)}` : 'no spending yet'}</span>}
                      {d.fan_context.standing && <span>{d.fan_context.standing}</span>}
                      {d.situations.map(t => <Badge key={t} variant='outline' className='font-normal'>{t}</Badge>)}
                    </div>
                    <div className='flex flex-col items-start gap-1'>
                      {d.fan_messages.map((m, i) => <div key={i} className='max-w-[80%] rounded-2xl rounded-bl-sm bg-muted px-3 py-1.5 text-sm'>{m.fan_message}</div>)}
                    </div>
                    <div className={cn('grid gap-3', d.answers.length > 2 ? 'lg:grid-cols-3' : 'md:grid-cols-2')}>
                      {d.answers.map(a => (
                        <div key={a.key} className='flex flex-col gap-1.5'>
                          <span className='flex flex-wrap items-center gap-1 text-xs font-medium'>
                            {a.key}: {a.label}
                            {d.your_pick === a.source && <Badge>your pick</Badge>}
                            {d.claude_pick === a.source && <Badge variant='secondary'>Claude&apos;s pick</Badge>}
                          </span>
                          <Said list={a.messages} k={a.source === 'chatter' ? 'chatter_message' : 'creator_message'} />
                          {a.source === 'chatter' && (
                            <span className='text-xs text-muted-foreground'>
                              What happened: {d.outcome?.replied ? `he wrote back after ${d.outcome.reply_after_min} min` : 'no answer within a day'}{d.outcome?.bought ? ', and bought within a day' : ''}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                    <p className='text-xs text-muted-foreground'>
                      {WHO[d.your_pick] ? `You: ${WHO[d.your_pick]}. ` : ''}
                      {d.claude_reason ? `Claude${WHO[d.claude_pick] ? ` (${WHO[d.claude_pick].toLowerCase()})` : ''}: ${d.claude_reason}` : ''}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
