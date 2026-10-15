import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowRight, Check, CornerDownRight, Lightbulb, Loader2, MessageSquareQuote, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BASIS, BRANCHES, RULES, SITUATIONS, STEPS } from './playbookData';

const GROUPS = ['All', 'Start', 'Fan types', 'While selling', 'He pushes back', 'After the sale'];
const MOVE_LABEL = { warm_up: 'warm-up', tension: 'tension', readiness: 'ready?', tease: 'tease', ppv: 'PPV', live_detail: 'live detail', ladder: 'ladder', aftercare: 'aftercare' };
const byId = Object.fromEntries([...STEPS, ...BRANCHES, ...SITUATIONS].map(x => [x.id, x]));
// roadmap steps by id — a branch can share its id with the situation it leads to
const stepById = Object.fromEntries([...STEPS, ...BRANCHES].map(x => [x.id, x]));

/**
 * The chatter Playbook: how to sell, step by step (the roadmap), what to do in each
 * situation, and ready-made scripts — built from what worked in our own chats
 * (playbookData.js). Everything fits any page: [brackets] are filled in for the page
 * you're on. Fresh ideas and scripts are in playbookLines.json, loaded when it opens.
 */
export default function PlaybookPage() {
  const [tab, setTab] = useState('roadmap');
  const [stepId, setStepId] = useState('warmup');
  const [sitId, setSitId] = useState('price');
  const [extra, setExtra] = useState(null);           // fresh ideas and scripts
  useEffect(() => { import('./playbookLines.json').then(m => setExtra(m.default)).catch(() => setExtra({ failed: true })); }, []);
  const open = (id) => {
    if (SITUATIONS.some(s => s.id === id)) { setTab('situations'); setSitId(id); }
    else if (byId[id]) { setTab('roadmap'); setStepId(id); }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const ctx = { extra, open };

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-wrap items-end justify-between gap-3'>
        <div className='min-w-0'>
          <h2 className='text-2xl font-bold tracking-tight'>Playbook</h2>
          <p className='max-w-3xl text-muted-foreground'>How to sell, step by step, and what to do when it doesn’t go to plan — built from what worked in our own chats.</p>
        </div>
        <div className='inline-flex rounded-lg border bg-muted/40 p-1' role='tablist' aria-label='Playbook sections'>
          {[['roadmap', 'Roadmap'], ['situations', 'What do I do when…'], ['scripts', 'Scripts']].map(([k, label]) => (
            <button key={k} type='button' role='tab' aria-selected={tab === k} onClick={() => setTab(k)}
              className={cn('rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                tab === k ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground')}>{label}</button>
          ))}
        </div>
      </div>

      {tab !== 'scripts' && (
        <p className='-mt-3 text-xs text-muted-foreground'>Works on every page: fill in the [brackets] for the page you’re on.</p>
      )}

      {tab === 'roadmap' && <Roadmap stepId={stepId} setStepId={setStepId} ctx={ctx} />}
      {tab === 'situations' && <Situations sitId={sitId} setSitId={setSitId} ctx={ctx} />}
      {tab === 'scripts' && <Scripts extra={extra} />}

      <p className='text-xs text-muted-foreground'>{BASIS}</p>
    </div>
  );
}

// The rules, then the steps top to bottom (with what to do if it doesn't work),
// and the chosen step's details beside them.
function Roadmap({ stepId, setStepId, ctx }) {
  const detail = stepById[stepId];
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
                <ListButton item={s} active={stepId === s.id} onClick={() => setStepId(s.id)} big />
                {stepId === s.id && <div className='mt-3 lg:hidden'><Detail item={detail} ctx={ctx} /></div>}
                {branch && (
                  <div className='ml-6 mt-2'>
                    <button type='button' onClick={() => setStepId(branch.id)}
                      className={cn('flex w-full items-start gap-2 rounded-md border border-dashed px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        stepId === branch.id ? 'border-warn bg-warn/10' : 'hover:bg-muted/60')}>
                      <CornerDownRight className='mt-0.5 size-4 shrink-0 text-warn' />
                      <span><span className='font-medium'>{branch.title}</span><span className='block text-xs text-muted-foreground'>{branch.short}</span></span>
                    </button>
                    {stepId === branch.id && <div className='mt-3 lg:hidden'><Detail item={detail} ctx={ctx} /></div>}
                  </div>
                )}
                {i < STEPS.length - 1 && <ArrowDown className='mx-auto my-1.5 size-4 text-muted-foreground' aria-hidden='true' />}
              </div>
            );
          })}
        </nav>
        <div className='hidden lg:sticky lg:top-4 lg:block'><Detail item={detail} ctx={ctx} /></div>
      </div>
    </div>
  );
}

function ListButton({ item, active, onClick, big = false }) {
  return (
    <button type='button' onClick={onClick} aria-current={active ? 'true' : undefined}
      className={cn('w-full rounded-lg border text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        big ? 'px-4 py-3' : 'px-3 py-2',
        active ? 'border-primary bg-primary/5' : 'bg-card hover:bg-muted/60', item.id === 'start' && 'border-good/50')}>
      <span className={cn('flex items-center gap-2', big ? 'font-semibold' : 'text-sm font-medium')}>
        {item.title}
        {item.found && <Badge variant='outline' className='h-4 px-1.5 text-[10px] font-normal text-link'>new</Badge>}
      </span>
      <span className={cn('block text-muted-foreground', big ? 'text-sm' : 'text-xs')}>{item.short || item.often}</span>
    </button>
  );
}

// Situations: search or pick a group, then the card beside the list.
function Situations({ sitId, setSitId, ctx }) {
  const [q, setQ] = useState('');
  const [group, setGroup] = useState('All');
  const list = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return SITUATIONS.filter(s => (group === 'All' || s.group === group)
      && words.every(w => [s.title, s.often, ...(s.stats || []), ...(s.do || [])].join(' ').toLowerCase().includes(w)));
  }, [q, group]);
  const detail = byId[sitId];
  return (
    <div className='grid items-start gap-6 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]'>
      <div className='flex flex-col gap-3'>
        <div className='relative'>
          <Search className='pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground' aria-hidden='true' />
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder='What’s happening? e.g. expensive, married, real' className='pl-9' aria-label='Search situations' />
        </div>
        <div className='flex flex-wrap gap-1.5'>
          {GROUPS.map(g => (
            <button key={g} type='button' onClick={() => setGroup(g)} aria-pressed={group === g}
              className={cn('rounded-full border px-2.5 py-0.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                group === g ? 'border-primary bg-primary/10 font-medium' : 'text-muted-foreground hover:bg-muted/60')}>{g}</button>
          ))}
        </div>
        <p className='text-xs text-muted-foreground'>{list.length} situation{list.length === 1 ? '' : 's'}</p>
        <ul className='flex flex-col gap-1.5'>
          {list.map(s => (
            <li key={s.id}>
              <ListButton item={s} active={sitId === s.id} onClick={() => setSitId(s.id)} />
              {sitId === s.id && <div className='mt-2 lg:hidden'><Detail item={detail} ctx={ctx} /></div>}
            </li>
          ))}
          {!list.length && <li className='px-1 text-sm text-muted-foreground'>Nothing matches. Try another word, or pick “All”.</li>}
        </ul>
      </div>
      <div className='hidden lg:sticky lg:top-4 lg:block'><Detail item={detail} ctx={ctx} /></div>
    </div>
  );
}

// One step or situation: the numbers, what to do, how it usually goes, what to
// avoid, lines that sold and fresh ideas.
function Detail({ item, ctx }) {
  const { extra, open } = ctx;
  if (!item) return null;
  const ideas = extra?.fresh?.[item.id] || [];
  return (
    <article className='flex flex-col gap-4 rounded-lg border bg-card p-4 sm:p-5'>
      <header>
        <h3 className='flex items-center gap-2 text-lg font-semibold'>
          {item.title}
          {item.found && <Badge variant='outline' className='font-normal text-link'>new</Badge>}
        </h3>
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
      {item.flow?.length > 0 && (
        <section>
          <h4 className='mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground'>How it goes when it works</h4>
          <ol className='flex flex-col gap-2'>
            {item.flow.map((f, i) => (
              <li key={i} className='rounded-md border bg-muted/20 px-3 py-2 text-sm'>
                <p className='text-xs text-muted-foreground'><span className='font-semibold tabular-nums'>{i + 1}.</span> {f.if.charAt(0).toUpperCase() + f.if.slice(1)}</p>
                <p className='mt-1 flex gap-2'><ArrowRight className='mt-0.5 size-4 shrink-0 text-good' aria-hidden='true' /><span>{f.say}</span></p>
                {f.then && <p className='mt-1 pl-6 text-xs text-muted-foreground'>{f.then}</p>}
              </li>
            ))}
          </ol>
        </section>
      )}
      <Lines title='Lines that sold' note='Real lines from our chats (names removed). Learn the idea and say it your way: copy-paste chats sell the least.' lines={item.lines || []} />
      {extra
        ? <Lines title='Fresh ideas' note='Written by AI from what sells — not tested yet. Fill in the [brackets], try them and see what works.' lines={ideas} fresh />
        : <p className='flex items-center gap-2 text-xs text-muted-foreground'><Loader2 className='size-3.5 animate-spin' />Loading fresh ideas…</p>}
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

function Lines({ title, note, lines, fresh = false }) {
  const [more, setMore] = useState(false);
  if (!lines?.length) return null;
  const shown = more ? lines : lines.slice(0, 4);
  return (
    <section>
      <h4 className={cn('mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide', fresh ? 'text-link' : 'text-muted-foreground')}>
        {fresh && <Lightbulb className='size-3.5' aria-hidden='true' />}{title}
      </h4>
      {note && <p className='mb-2 text-xs text-muted-foreground'>{note}</p>}
      <ul className='flex flex-col gap-2'>
        {shown.map((l, i) => (
          <li key={i} className={cn('rounded-md border-l-2 px-3 py-2', fresh ? 'border-link/50 bg-link/5' : 'border-primary/40 bg-muted/30')}>
            <p className='flex gap-2 text-sm'><MessageSquareQuote className='mt-0.5 size-4 shrink-0 text-muted-foreground' aria-hidden='true' /><span>{l.line}</span></p>
            <p className='mt-1 pl-6 text-xs text-muted-foreground'>{l.why}{l.tone ? ` · ${l.tone}` : ''}</p>
          </li>
        ))}
      </ul>
      {lines.length > 4 && (
        <button type='button' onClick={() => setMore(m => !m)} className='mt-1.5 text-xs text-link hover:underline'>{more ? 'Show fewer' : `Show ${lines.length - 4} more`}</button>
      )}
    </section>
  );
}

// A script step sent with a PPV has a price guide; "—" means no PPV.
const priced = (st) => !!st.price && st.price !== '—';

// Ready-made scripts for any page, from the best-selling real ones on all our pages.
function Scripts({ extra }) {
  if (!extra) return <p className='flex items-center gap-2 text-sm text-muted-foreground'><Loader2 className='size-4 animate-spin' />Loading scripts…</p>;
  return (
    <div className='flex flex-col gap-4'>
      <div className='grid gap-3 lg:grid-cols-2'>
        {(extra.scripts || []).map((s, i) => (
          <article key={i} className='flex flex-col gap-2 rounded-lg border bg-card p-4'>
            <header>
              <h4 className='font-semibold'>{s.title}</h4>
              <p className='text-xs text-muted-foreground'>{s.when}</p>
            </header>
            <ol className='flex flex-col gap-2'>
              {s.steps.map((st, k) => (
                <li key={k} className='flex gap-2 text-sm'>
                  <span className='w-5 shrink-0 text-right tabular-nums text-muted-foreground'>{k + 1}.</span>
                  <span className='min-w-0 flex-1'>
                    {st.line}
                    <span className='mt-0.5 block text-[11px] text-muted-foreground'>
                      {st.move !== 'ppv' || !priced(st) ? MOVE_LABEL[st.move] || st.move : null}
                      {priced(st) && <>{st.move !== 'ppv' && ' · '}<span className='font-medium text-foreground'>PPV at {st.price}</span></>}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
            <p className='rounded-md bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground'>{s.why}</p>
          </article>
        ))}
      </div>
      <p className='text-xs text-muted-foreground'>Built from the best-selling real scripts across all our pages (names removed). Fill in the [brackets] for your page; prices are a guide — set them to the page and the fan.</p>
    </div>
  );
}
