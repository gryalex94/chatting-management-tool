import { Fragment, useState } from 'react';
import { Activity, BookOpen, ChevronLeft, ChevronRight, CircleCheck, Flame, ListChecks, PenLine, Route, ShieldCheck, UserRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cost } from './shared';

// How each step looks: its icon, and its colour by status.
const ICON = { safety: ShieldCheck, him: UserRound, moment: Activity, plan: Route, story: Flame, briefing: BookOpen, result: CircleCheck };
const TONE = { ok: 'text-good', warn: 'text-warn', stop: 'text-bad', decision: 'text-primary', info: 'text-muted-foreground' };
const SHOWN = 4;                       // details shown before "Show more"

// One step of the map: what it looked at, what it decided, why, and the rules or data behind it.
function Step({ step }) {
  const [all, setAll] = useState(false);
  const Icon = ICON[step.id] || (step.id.startsWith('draft') ? PenLine : ListChecks);
  const details = all ? step.details : step.details.slice(0, SHOWN);
  return (
    <li className='grid grid-cols-[18px_minmax(0,1fr)] gap-x-2.5 border-t py-2.5 first:border-t-0'>
      <Icon className={cn('mt-0.5 size-4', TONE[step.status] || TONE.info)} aria-hidden />
      <div className='flex min-w-0 flex-col gap-1'>
        <div className='flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1'>
          <span className='text-sm font-medium'>{step.title}</span>
          {step.tags.length > 0 && (
            <span className='flex flex-wrap gap-1'>
              {step.tags.map(t => <Badge key={t} variant='outline' className='px-1.5 py-0 text-[10px] font-normal text-muted-foreground'>{t}</Badge>)}
            </span>
          )}
        </div>
        {step.result && <p className={cn('text-sm', step.status === 'warn' && 'text-warn', step.status === 'stop' && 'text-bad')}>{step.result}</p>}
        {step.quotes.length > 0 && (
          <div className='flex flex-col items-end gap-1'>
            {step.quotes.map((q, i) => <span key={i} className='max-w-[95%] rounded-2xl rounded-br-sm bg-primary/90 px-2.5 py-1 text-xs text-primary-foreground'>{q}</span>)}
          </div>
        )}
        {step.why && <p className='text-xs text-muted-foreground'>{step.why}</p>}
        {details.length > 0 && (
          <dl className='grid grid-cols-[minmax(0,8.5rem)_minmax(0,1fr)] gap-x-2 gap-y-1 text-xs'>
            {details.map((d, i) => (
              <Fragment key={i}>
                <dt className='text-muted-foreground'>{d.label}</dt>
                <dd className='min-w-0 break-words'>{d.value}</dd>
              </Fragment>
            ))}
          </dl>
        )}
        {step.details.length > SHOWN && (
          <button type='button' onClick={() => setAll(a => !a)} className='self-start text-xs text-link hover:underline'>
            {all ? 'Show less' : `Show ${step.details.length - SHOWN} more`}
          </button>
        )}
      </div>
    </li>
  );
}

/**
 * How she decided one reply, step by step: the safety screen, who he is, the
 * moment, the plan (each decision with its reason), her sexting story, what the
 * writer read, then each writer's drafts (what was turned down and why, what the
 * code changed) and the result. `rounds` = the practice chat's replies, oldest first.
 */
export default function DecisionMap({ rounds, selectedId, onSelect }) {
  const i = rounds.findIndex(r => r.id === selectedId);
  const round = i >= 0 ? rounds[i] : null;
  if (!round) {
    return (
      <div className='flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground'>
        <Route className='size-6' aria-hidden />
        <p>Write a message as him. How she decided her reply shows here, step by step.</p>
      </div>
    );
  }
  const shared = round.used?.trace || [];
  const said = round.used?.said?.length ? round.used.said.join(' / ') : null;
  return (
    <div className='flex flex-col gap-3'>
      <div className='flex items-center justify-between gap-2'>
        <h3 className='text-sm font-semibold'>How she decided</h3>
        <div className='flex items-center gap-1'>
          <Button size='icon' variant='ghost' className='size-7' disabled={i <= 0} onClick={() => onSelect(rounds[i - 1].id)} aria-label='The reply before'><ChevronLeft /></Button>
          <span className='text-xs tabular-nums text-muted-foreground'>reply {i + 1} of {rounds.length}</span>
          <Button size='icon' variant='ghost' className='size-7' disabled={i >= rounds.length - 1} onClick={() => onSelect(rounds[i + 1].id)} aria-label='The reply after'><ChevronRight /></Button>
        </div>
      </div>
      <p className='rounded-lg bg-muted px-3 py-2 text-xs'>
        {said ? <><span className='text-muted-foreground'>He wrote: </span>{said}</> : round.used?.follow_up ? 'He went quiet: she writes first.' : 'Her reply'}
      </p>
      {shared.length ? <ol className='flex flex-col'>{shared.map(s => <Step key={s.id} step={s} />)}</ol>
        : <p className='text-xs text-muted-foreground'>This reply was made before the decision map existed.</p>}
      {(round.results || []).map(r => (
        <section key={r.model} className={cn('flex flex-col rounded-lg border px-3 pt-2.5', round.kept === r.model && 'border-primary/50')}>
          <div className='flex flex-wrap items-baseline justify-between gap-2 pb-1'>
            <span className='text-sm font-medium'>{r.label}{round.kept === r.model ? ' · kept' : ''}</span>
            <span className='text-xs text-muted-foreground'>{cost(r.cost)} · {((r.ms || 0) / 1000).toFixed(1)} s</span>
          </div>
          {r.status === 'error' ? <p className='pb-2.5 text-xs text-bad'>{r.error}</p>
            : <ol className='flex flex-col'>{(r.trace || []).map(s => <Step key={s.id} step={s} />)}</ol>}
        </section>
      ))}
    </div>
  );
}
