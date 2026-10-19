import { useCallback, useEffect, useState } from 'react';
import { CircleAlert, Loader2, Play, Scale, Trophy } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/services/api';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { cost, dayTime, errMsg } from './shared';

const runName = (b) => `Test of ${dayTime(b.batch)}`;
const pct = (n, d) => (d ? `${Math.round((100 * n) / d)}%` : '–');

// Her messages as bubbles, on the right.
function Said({ list, k }) {
  return (
    <div className='flex flex-col items-end gap-1.5'>
      {list.map((m, i) => <div key={i} className='max-w-[90%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-primary px-3 py-1.5 text-sm text-primary-foreground'>{m[k]}</div>)}
    </div>
  );
}

// One side of the score: AI wins, chatter wins, ties, and the AI's win rate.
function Score({ title, t, note }) {
  const decided = t.ai + t.chatter;
  return (
    <div className='flex flex-col gap-1 rounded-lg border p-4'>
      <span className='text-sm text-muted-foreground'>{title}</span>
      <span className='text-2xl font-semibold tabular-nums'>{decided ? `AI ${pct(t.ai, decided)}` : '–'}</span>
      <span className='text-xs text-muted-foreground'>AI better {t.ai} · chatter better {t.chatter} · can&apos;t choose {t.tie}</span>
      {note && <span className='text-xs text-muted-foreground'>{note}</span>}
    </div>
  );
}

/**
 * The blind test: real moments from her chats where a chatter answered a fan,
 * and the AI's own answer to the same moment, shown as A and B. The manager picks
 * the better one without knowing which is which; Claude judges them too. Results
 * reveal who wrote what, and what really happened after the chatter's answer.
 */
export default function DuelTab({ page, ready, onSpent }) {
  const [ov, setOv] = useState(null);                 // { ready, batches, job }
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
  const ready_ = ov?.batches?.find(b => b.batch === current)?.total || 0;
  useEffect(() => {
    if (!current) return undefined;
    let live = true;
    const url = view === 'judge' ? 'next' : 'results';
    api.get(`/api/ai-chat/pages/${page.creator_id}/duels/${url}`, { params: { batch: current } })
      .then(r => { if (live) (view === 'judge' ? setDuel : setRes)(r.data); })
      .catch(e => { if (live) toast.error(errMsg(e, 'Could not load the test')); });
    return () => { live = false; };
  }, [page.creator_id, current, view, ready_]);

  const start = async () => {
    setBusy('start');
    try {
      const { data } = await api.post(`/api/ai-chat/pages/${page.creator_id}/duels`, { count: Number(count) });
      setOv(o => ({ ...o, job: data.job })); setBatch(data.job.batch); setView('judge'); setDuel(null);
      toast.success('Started: the AI is answering the moments');
    } catch (e) { toast.error(errMsg(e, 'Could not start')); }
    finally { setBusy(''); }
  };
  const vote = async (choice) => {
    setBusy(choice);
    try {
      const { data } = await api.post(`/api/ai-chat/pages/${page.creator_id}/duels/${duel.id}/vote`, { vote: choice });
      setDuel(data);
      if (data.done) { load(); toast.success('All judged: here are the results'); setView('results'); }
    } catch (e) { toast.error(errMsg(e, 'Could not save the vote')); }
    finally { setBusy(''); }
  };

  if (!ov) return <div className='grid gap-3'>{[0, 1, 2].map(i => <Skeleton key={i} className='h-14 w-full' />)}</div>;
  if (ov.error) return <p className='text-sm text-muted-foreground'>{ov.error}</p>;
  if (!ov.ready) {
    return (
      <div className='flex items-start gap-2 rounded-lg border border-warn/40 bg-warn/5 px-4 py-3 text-sm'>
        <CircleAlert className='mt-0.5 size-4 shrink-0 text-warn' /><span>Run database change 037 (AI blind test) in Supabase first.</span>
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
            Real moments from her chats where a chatter answered a fan. The AI writes its own answer to the same moment; you see both as A and B
            and pick the better one, without knowing which is which. Claude judges them too. Each test costs about $0.10 per 100 moments.
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
          <Loader2 className='size-4 animate-spin' />The AI is answering the moments: {job.done} of {job.total} ({cost(job.cost)} so far). You can start judging as they come in.
        </p>
      )}
      {job && !job.running && job.failed > 0 && <p className='text-sm text-warn'>{job.failed} moment{job.failed === 1 ? '' : 's'} couldn&apos;t be answered ({job.last_error}).</p>}

      {!ov.batches.length ? (
        <p className='rounded-lg border border-dashed p-6 text-sm text-muted-foreground'>No test yet. Start one above.</p>
      ) : (
        <>
          <div className='flex flex-wrap items-center gap-2'>
            {ov.batches.length > 1 && (
              <Select value={current} onValueChange={(v) => { setBatch(v); setDuel(null); setRes(null); }}>
                <SelectTrigger className='w-72' aria-label='Test run'><SelectValue /></SelectTrigger>
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
              <div className='flex flex-col gap-2 rounded-lg border bg-card p-3'>
                <span className='text-xs text-muted-foreground'>Moment {duel.number} of {duel.total}: the chat so far</span>
                {duel.context.map((m, i) => (
                  <div key={i} className={cn('flex', m.from_fan ? 'justify-start' : 'justify-end')}>
                    <div className={cn('max-w-[80%] whitespace-pre-wrap rounded-2xl px-3 py-1.5 text-sm',
                      m.from_fan ? 'rounded-bl-sm bg-muted' : 'rounded-br-sm bg-primary/80 text-primary-foreground',
                      m.from_fan && i === duel.context.length - 1 && 'ring-2 ring-primary/40')}>
                      {m.message || '(a photo or video)'}
                    </div>
                  </div>
                ))}
                <span className='text-center text-xs text-muted-foreground'>What should she answer?</span>
              </div>
              <div className='grid gap-3 md:grid-cols-2'>
                {[['A', duel.a], ['B', duel.b]].map(([side, list]) => (
                  <div key={side} className='flex flex-col gap-3 rounded-lg border p-3'>
                    <span className='text-sm font-medium'>Answer {side}</span>
                    <Said list={list} k='creator_message' />
                    <Button variant='outline' onClick={() => vote(side)} disabled={!!busy}>{busy === side ? <Loader2 className='animate-spin' /> : null}{side} is better</Button>
                  </div>
                ))}
              </div>
              <div><Button variant='ghost' onClick={() => vote('tie')} disabled={!!busy}>Can&apos;t choose</Button></div>
            </div>
          ))}

          {view === 'results' && (!res ? <Skeleton className='h-64 w-full' /> : (
            <div className='flex flex-col gap-4'>
              <div className='grid gap-3 md:grid-cols-3'>
                <Score title='Your votes' t={res.you} note={`${res.you.ai + res.you.chatter + res.you.tie} of ${res.total} judged`} />
                <Score title="Claude's votes" t={res.claude} />
                <div className='flex flex-col gap-1 rounded-lg border p-4 text-xs text-muted-foreground'>
                  <span className='text-sm'>Reality check on Claude</span>
                  <span>When the chatter&apos;s answer really got him writing back, Claude picked the chatter {pct(res.real_check.answered.chatter, res.real_check.answered.n)} of the time ({res.real_check.answered.n} moments).</span>
                  <span>When he didn&apos;t write back within a day: {pct(res.real_check.unanswered.chatter, res.real_check.unanswered.n)} ({res.real_check.unanswered.n} moments).</span>
                  <span>If Claude judges well, the first number is higher. This test cost {cost(res.cost)}.</span>
                </div>
              </div>

              {res.by_situation.length > 0 && (
                <div className='overflow-x-auto rounded-lg border'>
                  <table className='w-full min-w-[520px] text-sm'>
                    <thead><tr className='border-b bg-muted/40 text-left text-xs text-muted-foreground'>
                      <th className='px-3 py-2 font-medium'>Situation (Playbook)</th><th className='px-3 py-2 text-right font-medium'>Moments</th>
                      <th className='px-3 py-2 text-right font-medium'>AI better, by Claude</th><th className='px-3 py-2 text-right font-medium'>AI better, by you</th>
                    </tr></thead>
                    <tbody>{res.by_situation.map(s => (
                      <tr key={s.title} className='border-b last:border-b-0'>
                        <td className='px-3 py-1.5'>{s.title}</td><td className='px-3 py-1.5 text-right tabular-nums'>{s.n}</td>
                        <td className='px-3 py-1.5 text-right tabular-nums'>{pct(s.ai_claude, s.n)}</td>
                        <td className='px-3 py-1.5 text-right tabular-nums'>{s.you_n ? pct(s.ai_you, s.you_n) : '–'}</td>
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
                      {d.situations.map(t => <Badge key={t} variant='outline' className='font-normal'>{t}</Badge>)}
                      {d.ai_status !== 'ok' && <Badge variant='outline' className='border-warn/40 font-normal text-warn'>AI flagged: {d.ai_status}</Badge>}
                    </div>
                    <div className='flex flex-col items-start gap-1'>
                      {d.fan_messages.map((m, i) => <div key={i} className='max-w-[80%] rounded-2xl rounded-bl-sm bg-muted px-3 py-1.5 text-sm'>{m.fan_message}</div>)}
                    </div>
                    <div className='grid gap-3 md:grid-cols-2'>
                      <div className='flex flex-col gap-1.5'>
                        <span className='text-xs font-medium'>Her chatter {d.your_pick === 'chatter' && <Badge className='ms-1'>your pick</Badge>}{d.claude_pick === 'chatter' && <Badge variant='secondary' className='ms-1'>Claude&apos;s pick</Badge>}</span>
                        <Said list={d.chatter_messages} k='chatter_message' />
                        <span className='text-xs text-muted-foreground'>
                          What happened: {d.outcome?.replied ? `he wrote back after ${d.outcome.reply_after_min} min` : 'no answer within a day'}{d.outcome?.bought ? ', and bought within a day' : ''}
                        </span>
                      </div>
                      <div className='flex flex-col gap-1.5'>
                        <span className='text-xs font-medium'>AI {d.your_pick === 'ai' && <Badge className='ms-1'>your pick</Badge>}{d.claude_pick === 'ai' && <Badge variant='secondary' className='ms-1'>Claude&apos;s pick</Badge>}</span>
                        <Said list={d.ai_messages} k='creator_message' />
                      </div>
                    </div>
                    {d.claude_reason && <p className='text-xs text-muted-foreground'>Claude: {d.claude_reason}</p>}
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
