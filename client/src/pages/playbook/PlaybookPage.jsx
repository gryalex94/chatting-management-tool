import { useMemo, useState } from 'react';
import { ArrowDown, Check, CornerDownRight, MessageSquareQuote, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BASIS, BRANCHES, RULES, SITUATIONS, STEPS } from './playbookData';

const GROUPS = ['All', 'Start', 'Fan types', 'While selling', 'He pushes back', 'After the sale'];
const byId = Object.fromEntries([...STEPS, ...BRANCHES, ...SITUATIONS].map(x => [x.id, x]));

/**
 * The chatter Playbook: how to sell, step by step (the roadmap), and what to do in
 * each situation — built from what worked in our own chats (playbookData.js).
 * Every part shows the numbers behind it and real lines that sold, to learn from
 * and put in your own words.
 */
export default function PlaybookPage() {
  const [tab, setTab] = useState('roadmap');
  const [stepId, setStepId] = useState('warmup');
  const [sitId, setSitId] = useState('price');
  const openSituation = (id) => {
    if (byId[id] && SITUATIONS.some(s => s.id === id)) { setTab('situations'); setSitId(id); }
    else if (byId[id]) { setTab('roadmap'); setStepId(id); }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-wrap items-end justify-between gap-3'>
        <div className='min-w-0'>
          <h2 className='text-2xl font-bold tracking-tight'>Playbook</h2>
          <p className='max-w-3xl text-muted-foreground'>How to sell, step by step, and what to do when it doesn’t go to plan — built from what worked in our own chats.</p>
        </div>
        <div className='inline-flex rounded-lg border bg-muted/40 p-1' role='tablist' aria-label='Playbook sections'>
          {[['roadmap', 'Roadmap'], ['situations', 'What do I do when…']].map(([k, label]) => (
            <button key={k} type='button' role='tab' aria-selected={tab === k} onClick={() => setTab(k)}
              className={cn('rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                tab === k ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground')}>{label}</button>
          ))}
        </div>
      </div>

      {tab === 'roadmap'
        ? <Roadmap stepId={stepId} setStepId={setStepId} open={openSituation} />
        : <Situations sitId={sitId} setSitId={setSitId} open={openSituation} />}

      <p className='text-xs text-muted-foreground'>{BASIS}</p>
    </div>
  );
}

// The rules, then the steps top to bottom (with what to do if it doesn't work),
// and the chosen step's details beside them.
function Roadmap({ stepId, setStepId, open }) {
  const detail = byId[stepId];
  return (
    <div className='grid gap-6'>
      <section className='rounded-lg border bg-card p-4'>
        <h3 className='mb-2 text-sm font-semibold'>The 10 rules</h3>
        <ol className='grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2'>
          {RULES.map((r, i) => (
            <li key={i} className='flex gap-2'><span className='w-5 shrink-0 text-right font-semibold tabular-nums text-muted-foreground'>{i + 1}.</span><span>{r}</span></li>
          ))}
        </ol>
      </section>

      <div className='grid items-start gap-6 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]'>
        <nav aria-label='Roadmap steps' className='flex flex-col items-stretch'>
          {STEPS.map((s, i) => {
            const branch = BRANCHES.find(b => b.after === s.id);
            return (
              <div key={s.id} className='flex flex-col items-stretch'>
                <StepButton item={s} active={stepId === s.id} onClick={() => setStepId(s.id)} />
                {stepId === s.id && <div className='mt-3 lg:hidden'><Detail item={detail} open={open} /></div>}
                {branch && (
                  <div className='ml-6 mt-2'>
                    <button type='button' onClick={() => setStepId(branch.id)}
                      className={cn('flex w-full items-start gap-2 rounded-md border border-dashed px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        stepId === branch.id ? 'border-warn bg-warn/10' : 'hover:bg-muted/60')}>
                      <CornerDownRight className='mt-0.5 size-4 shrink-0 text-warn' />
                      <span><span className='font-medium'>{branch.title}</span><span className='block text-xs text-muted-foreground'>{branch.short}</span></span>
                    </button>
                    {stepId === branch.id && <div className='mt-3 lg:hidden'><Detail item={detail} open={open} /></div>}
                  </div>
                )}
                {i < STEPS.length - 1 && <ArrowDown className='mx-auto my-1.5 size-4 text-muted-foreground' aria-hidden='true' />}
              </div>
            );
          })}
        </nav>
        <div className='hidden lg:sticky lg:top-4 lg:block'><Detail item={detail} open={open} /></div>
      </div>
    </div>
  );
}

function StepButton({ item, active, onClick }) {
  return (
    <button type='button' onClick={onClick} aria-current={active ? 'step' : undefined}
      className={cn('w-full rounded-lg border px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active ? 'border-primary bg-primary/5' : 'bg-card hover:bg-muted/60', item.id === 'start' && 'border-good/50')}>
      <span className='block font-semibold'>{item.title}</span>
      <span className='block text-sm text-muted-foreground'>{item.short}</span>
    </button>
  );
}

// Situations: search or pick a group, then the card beside the list.
function Situations({ sitId, setSitId, open }) {
  const [q, setQ] = useState('');
  const [group, setGroup] = useState('All');
  const list = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return SITUATIONS.filter(s => (group === 'All' || s.group === group)
      && words.every(w => [s.title, s.often, ...s.stats, ...s.do].join(' ').toLowerCase().includes(w)));
  }, [q, group]);
  const detail = byId[sitId];
  return (
    <div className='grid items-start gap-6 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]'>
      <div className='flex flex-col gap-3'>
        <div className='relative'>
          <Search className='pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground' aria-hidden='true' />
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder='What’s happening? e.g. expensive, quiet, custom' className='pl-9' aria-label='Search situations' />
        </div>
        <div className='flex flex-wrap gap-1.5'>
          {GROUPS.map(g => (
            <button key={g} type='button' onClick={() => setGroup(g)} aria-pressed={group === g}
              className={cn('rounded-full border px-2.5 py-0.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                group === g ? 'border-primary bg-primary/10 font-medium' : 'text-muted-foreground hover:bg-muted/60')}>{g}</button>
          ))}
        </div>
        <ul className='flex flex-col gap-1.5'>
          {list.map(s => (
            <li key={s.id}>
              <button type='button' onClick={() => setSitId(s.id)} aria-current={sitId === s.id ? 'true' : undefined}
                className={cn('w-full rounded-lg border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  sitId === s.id ? 'border-primary bg-primary/5' : 'bg-card hover:bg-muted/60')}>
                <span className='block text-sm font-medium'>{s.title}</span>
                <span className='block text-xs text-muted-foreground'>{s.often}</span>
              </button>
              {sitId === s.id && <div className='mt-2 lg:hidden'><Detail item={detail} open={open} /></div>}
            </li>
          ))}
          {!list.length && <li className='px-1 text-sm text-muted-foreground'>Nothing matches. Try another word, or pick “All”.</li>}
        </ul>
      </div>
      <div className='hidden lg:sticky lg:top-4 lg:block'><Detail item={detail} open={open} /></div>
    </div>
  );
}

// One step or situation: the numbers, what to do, what to avoid, lines that sold.
function Detail({ item, open }) {
  if (!item) return null;
  return (
    <article className='flex flex-col gap-4 rounded-lg border bg-card p-4 sm:p-5'>
      <header>
        <h3 className='text-lg font-semibold'>{item.title}</h3>
        <p className='text-sm text-muted-foreground'>{item.short || item.often}</p>
      </header>
      {item.stats?.length > 0 && (
        <section>
          <h4 className='mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground'>What our chats show</h4>
          <ul className='flex flex-col gap-1 text-sm'>{item.stats.map((s, i) => <li key={i} className='rounded-md bg-muted/40 px-3 py-1.5'>{s}</li>)}</ul>
        </section>
      )}
      <div className='grid gap-4 sm:grid-cols-2'>
        {item.do?.length > 0 && (
          <section>
            <h4 className='mb-1.5 text-xs font-medium uppercase tracking-wide text-good'>Do</h4>
            <ul className='flex flex-col gap-1.5 text-sm'>{item.do.map((s, i) => <li key={i} className='flex gap-2'><Check className='mt-0.5 size-4 shrink-0 text-good' aria-hidden='true' />{s}</li>)}</ul>
          </section>
        )}
        {item.avoid?.length > 0 && (
          <section>
            <h4 className='mb-1.5 text-xs font-medium uppercase tracking-wide text-bad'>Avoid</h4>
            <ul className='flex flex-col gap-1.5 text-sm'>{item.avoid.map((s, i) => <li key={i} className='flex gap-2'><X className='mt-0.5 size-4 shrink-0 text-bad' aria-hidden='true' />{s}</li>)}</ul>
          </section>
        )}
      </div>
      {item.lines?.length > 0 && (
        <section>
          <h4 className='mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground'>Lines that sold</h4>
          <p className='mb-2 text-xs text-muted-foreground'>Real lines from our chats (names removed). Learn the idea and say it your way: copy-paste chats sell the least.</p>
          <ul className='flex flex-col gap-2'>
            {item.lines.map((l, i) => (
              <li key={i} className='rounded-md border-l-2 border-primary/40 bg-muted/30 px-3 py-2'>
                <p className='flex gap-2 text-sm'><MessageSquareQuote className='mt-0.5 size-4 shrink-0 text-muted-foreground' aria-hidden='true' /><span>{l.line}</span></p>
                <p className='mt-1 pl-6 text-xs text-muted-foreground'>{l.why}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
      {item.links?.length > 0 && (
        <section className='flex flex-wrap items-center gap-1.5'>
          <span className='text-xs text-muted-foreground'>See also:</span>
          {item.links.filter(id => byId[id]).map(id => (
            <Button key={id} size='sm' variant='outline' className='h-7 px-2 text-xs' onClick={() => open(id)}>{byId[id].title}</Button>
          ))}
        </section>
      )}
      {item.group && <Badge variant='outline' className='w-fit font-normal text-muted-foreground'>{item.group}</Badge>}
    </article>
  );
}
