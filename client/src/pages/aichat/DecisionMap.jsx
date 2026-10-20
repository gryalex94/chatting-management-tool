import { Fragment, useState } from 'react';
import { Activity, BookOpen, ChevronLeft, ChevronRight, CircleCheck, Flame, FlaskConical, ListChecks, Loader2, PenLine, Route, ShieldCheck, UserRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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

// "What if": change what's known about him and decide the same moment again.
const AS_READ = 'as-read';
const CHOICES = {
  tier: { label: 'He is', options: [['new', 'a new subscriber'], ['none', 'no spend in 90 days'], ['small', 'a small buyer'], ['spender', 'a spender'], ['whale', 'a whale'], ['tw', 'a time waster']] },
  mood: { label: 'His mood', options: ['chatty', 'flirty', 'horny', 'romantic', 'joking', 'sad', 'tired', 'annoyed', 'suspicious', 'brief'].map(m => [m, m]) },
  his: { label: 'How sexual he is', options: [['0', 'friendly'], ['1', 'flirty'], ['2', 'suggestive'], ['3', 'explicit']] },
  budget: { label: 'Free talk', options: [['used', 'used up']] },
};
const describe = (o) => Object.entries(o).map(([k, v]) => `${CHOICES[k].label.toLowerCase()}: ${CHOICES[k].options.find(x => String(x[0]) === String(v))?.[1] || v}`).join(' · ');

function WhatIfTry({ entry, original }) {
  const trace = entry.data.used?.trace || [];
  const before = Object.fromEntries((original || []).map(s => [s.id, s.result]));
  const changed = trace.filter(s => before[s.id] !== undefined && before[s.id] !== s.result);
  const plan = trace.find(s => s.id === 'plan');
  return (
    <div className='flex flex-col gap-2 rounded-lg border border-dashed border-primary/40 bg-background p-3'>
      <span className='text-xs font-medium'>What if {describe(entry.overrides)}</span>
      {entry.data.screen && ['stop', 'handover'].includes(entry.data.screen.action) && <p className='text-xs text-bad'>The safety screen stops it.</p>}
      {changed.length > 0 ? (
        <ul className='flex flex-col gap-1 text-xs'>
          {changed.map(s => (
            <li key={s.id}><span className='text-muted-foreground'>{s.title}: </span><span className='line-through decoration-muted-foreground/60'>{before[s.id]}</span> → <span className='font-medium'>{s.result}</span></li>
          ))}
        </ul>
      ) : <p className='text-xs text-muted-foreground'>Nothing in the plan changes.</p>}
      {plan && <ol className='flex flex-col'><Step step={plan} /></ol>}
      {entry.write && (entry.data.results || []).map(r => (
        <div key={r.model} className='flex flex-col items-end gap-1'>
          <span className='self-start text-[11px] text-muted-foreground'>{r.label}: {r.status === 'ok' ? 'passed the checks' : r.status}</span>
          {(r.replies || []).map((m, k) => <span key={k} className='max-w-[95%] rounded-2xl rounded-br-sm bg-primary/90 px-2.5 py-1 text-xs text-primary-foreground'>{m.creator_message}</span>)}
          {r.ppv && <span className='text-[11px] text-warn'>PPV: {r.ppv.title} · ${r.ppv.price}</span>}
        </div>
      ))}
    </div>
  );
}

function WhatIf({ round, onWhatIf, busy }) {
  const [pick, setPick] = useState({ tier: AS_READ, mood: AS_READ, his: AS_READ, budget: AS_READ });
  const overrides = Object.fromEntries(Object.entries(pick).filter(([, v]) => v !== AS_READ).map(([k, v]) => [k, k === 'his' ? Number(v) : v]));
  const any = Object.keys(overrides).length > 0;
  if (!round.body) return null;
  return (
    <div className='flex flex-col gap-2 rounded-lg border bg-background p-3'>
      <span className='flex items-center gap-1.5 text-sm font-medium'><FlaskConical className='size-4 text-primary' aria-hidden />What if…</span>
      <div className='grid grid-cols-2 gap-2'>
        {Object.entries(CHOICES).map(([k, c]) => (
          <div key={k} className='flex min-w-0 flex-col gap-1'>
            <span className='text-[11px] text-muted-foreground'>{c.label}</span>
            <Select value={pick[k]} onValueChange={v => setPick(p => ({ ...p, [k]: v }))}>
              <SelectTrigger size='sm' className='h-8 w-full text-xs' aria-label={c.label}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={AS_READ}>{k === 'budget' ? 'as counted' : 'as read'}</SelectItem>
                {c.options.map(([v, l]) => <SelectItem key={v} value={String(v)}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>
      <div className='flex flex-wrap items-center gap-2'>
        <Button size='sm' variant='outline' disabled={!any || busy} onClick={() => onWhatIf(round, overrides, false)}>Decide again</Button>
        <Button size='sm' variant='outline' disabled={!any || busy} onClick={() => onWhatIf(round, overrides, true)}>Decide and write</Button>
        {busy && <Loader2 className='size-4 animate-spin text-muted-foreground' aria-label='Working' />}
      </div>
      <span className='text-[11px] text-muted-foreground'>"Decide again" changes no words and costs almost nothing; "decide and write" also asks the writer. Neither touches the chat.</span>
      {(round.whatIfs || []).map(e => <WhatIfTry key={e.id} entry={e} original={round.used?.trace} />)}
    </div>
  );
}

/**
 * How she decided one reply, step by step: the safety screen, who he is, the
 * moment, the plan (each decision with its reason), her sexting story, what the
 * writer read, then each writer's drafts (what was turned down and why, what the
 * code changed) and the result. `rounds` = the practice chat's replies, oldest first.
 */
export default function DecisionMap({ rounds, selectedId, onSelect, onWhatIf, whatIfBusy = false }) {
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
      {onWhatIf && shared.length > 1 && <WhatIf key={round.id} round={round} onWhatIf={onWhatIf} busy={whatIfBusy} />}
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
