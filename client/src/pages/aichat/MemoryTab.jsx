import { useCallback, useEffect, useMemo, useState } from 'react';
import { Brain, Loader2, Lock, LockOpen, Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/services/api';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { agoText, cost, dayTime, errMsg, fanName, KINDS, moneyLine, shortDay } from './shared';

const status = (f) => (!f.memory ? { label: 'no memory', tone: 'text-muted-foreground' }
  : f.memory.behind ? { label: 'new messages since', tone: 'text-warn' }
    : { label: `${f.memory.facts} notes`, tone: 'text-good' });

// One fan's notes and story, editable. Remounted (key) whenever the saved memory changes.
function MemoryEditor({ detail, busy, onSave, onBuild }) {
  const [facts, setFacts] = useState(() => (detail.memory?.facts || []).map(f => ({ ...f })));
  const [summary, setSummary] = useState(detail.memory?.summary || '');
  const shape = (list) => JSON.stringify(list.map(({ kind, note, locked, on }) => ({ kind, note, locked: !!locked, on: on || null })));
  const dirty = summary !== (detail.memory?.summary || '') || shape(facts) !== shape(detail.memory?.facts || []);
  const change = (i, patch) => setFacts(fs => fs.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const bond = detail.memory?.bond;

  return (
    <div className='flex flex-col gap-4'>
      <div className='flex flex-wrap items-center justify-between gap-2 rounded-lg border px-4 py-3'>
        <div className='min-w-0 text-sm'>
          <p className='font-medium'>{fanName(detail.fan)}{detail.fan.top_spender && <Badge variant='outline' className='ms-1.5 font-normal'>top spender</Badge>}</p>
          <p className='text-xs text-muted-foreground'>
            {moneyLine(detail.money)} (Fanvue&apos;s numbers) · {detail.total} messages
            {detail.memory?.built_at ? ` · memory updated ${dayTime(detail.memory.built_at)}` : ''}{detail.memory?.edited_at ? ` · corrected ${dayTime(detail.memory.edited_at)}` : ''}
          </p>
          {bond?.warmth && <p className='text-xs text-muted-foreground'>How he treats her: <span className='text-foreground'>{bond.warmth}</span>{bond.why ? ` (${bond.why})` : ''}. Part of how close they are.</p>}
          {detail.state && (
            <p className='text-xs text-muted-foreground'>
              {detail.state.tier} · {detail.state.closeness} · {detail.state.phase} ({detail.state.phase_why}) · {detail.state.conversations} conversation{detail.state.conversations === 1 ? '' : 's'}
              {detail.state.hours?.text ? ` · ${detail.state.hours.text}` : ''}{detail.state.strikes30 ? ` · ${detail.state.strikes30} failed sale${detail.state.strikes30 === 1 ? '' : 's'} this month` : ''}
              {detail.state.last?.text ? ` · last time: ${detail.state.last.text}` : ''}
              {detail.state.plan ? ` · if he wrote now: ${detail.state.plan.aim.replace(/_/g, ' ')} (${detail.state.plan.why})` : ''}
            </p>
          )}
        </div>
        <div className='flex flex-wrap gap-2'>
          <Button size='sm' variant='outline' onClick={() => onBuild(false)} disabled={!!busy}>
            {busy === 'build' ? <Loader2 className='animate-spin' /> : <RefreshCw />}{detail.memory ? 'Update from new messages' : 'Build from the chat'}
          </Button>
          {detail.memory && (
            <Button size='sm' variant='ghost' onClick={() => { if (window.confirm('Read the whole chat again and rewrite the notes? Notes you locked stay as they are.')) onBuild(true); }} disabled={!!busy}>
              Start again from the whole chat
            </Button>
          )}
        </div>
      </div>

      {KINDS.map(([kind, label]) => (
        <div key={kind} className='flex flex-col gap-1.5'>
          <div className='flex items-center justify-between'>
            <Label>{label}</Label>
            <Button size='sm' variant='ghost' className='h-7' onClick={() => setFacts(fs => [...fs, { id: null, kind, note: '', locked: true, on: null }])}><Plus />Add</Button>
          </div>
          {facts.map((f, i) => f.kind === kind && (
            <div key={f.id || `new-${i}`} className='flex items-center gap-1.5'>
              <Input value={f.note} onChange={e => change(i, { note: e.target.value, locked: true })} aria-label={`${label} note`} className='h-8' />
              {kind === 'plan' && (
                <Input type='date' value={f.on || ''} onChange={e => change(i, { on: e.target.value || null, locked: true })} aria-label='The day it happens' title='The day it happens' className='h-8 w-36 shrink-0' />
              )}
              <span className='hidden w-24 shrink-0 text-[11px] text-muted-foreground sm:inline' title={f.said_at ? `He said it ${dayTime(f.said_at)}` : 'No date yet'}>
                {f.said_at ? agoText(f.said_at) : ''}
              </span>
              <Button size='icon' variant='ghost' className='size-8 shrink-0' onClick={() => change(i, { locked: !f.locked })}
                aria-label={f.locked ? 'Unlock: the AI may change this note' : 'Lock: the AI keeps this note as it is'} title={f.locked ? 'Locked: the AI keeps it as it is' : 'The AI may update this'}>
                {f.locked ? <Lock className='text-primary' /> : <LockOpen className='text-muted-foreground' />}
              </Button>
              <Button size='icon' variant='ghost' className='size-8 shrink-0' onClick={() => setFacts(fs => fs.filter((_, j) => j !== i))} aria-label='Delete note'><Trash2 /></Button>
            </div>
          ))}
          {!facts.some(f => f.kind === kind) && <p className='text-xs text-muted-foreground'>Nothing yet.</p>}
        </div>
      ))}

      <div className='grid gap-1.5'>
        <Label htmlFor='mem-story'>Story so far</Label>
        <Textarea id='mem-story' rows={4} value={summary} onChange={e => setSummary(e.target.value)} placeholder='How things are going between them: running jokes, anything in progress.' />
        <span className='text-xs text-muted-foreground'>The AI reads this only in long chats (over 100 messages), where it can&apos;t read everything.</span>
      </div>

      <div className='flex items-center justify-between gap-2'>
        <span className='text-xs text-muted-foreground'>Notes you add or change are locked, so the AI won&apos;t overwrite them. New messages update the notes by themselves about half an hour after a chat goes quiet.</span>
        <Button onClick={() => onSave(facts, summary)} disabled={!dirty || !!busy}>{busy === 'save' ? 'Saving…' : dirty ? 'Save' : 'Saved'}</Button>
      </div>
    </div>
  );
}

/**
 * What she remembers about each fan who ever wrote: built by the AI from the
 * chat, kept up to date, and correctable here. Money facts aren't stored: they
 * come from Fanvue's own numbers each time.
 */
export default function MemoryTab({ page, ready, onSpent }) {
  const [list, setList] = useState(null);             // { fans, job }
  const [search, setSearch] = useState('');
  const [fanId, setFanId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [busy, setBusy] = useState('');

  const load = useCallback(() => api.get(`/api/ai-chat/pages/${page.creator_id}/fans`).then(r => setList(r.data))
    .catch(e => setList({ error: errMsg(e, 'Could not load the fans') })), [page.creator_id]);
  useEffect(() => { load(); }, [load]);
  // while memory is being built for everyone, check on it every few seconds
  const running = !!list?.job?.running;
  useEffect(() => {
    if (!running) return undefined;
    const t = setInterval(() => { load(); onSpent?.(); }, 3000);
    return () => clearInterval(t);
  }, [running, load, onSpent]);
  useEffect(() => {
    if (!fanId) return undefined;
    let live = true;
    api.get(`/api/ai-chat/pages/${page.creator_id}/fans/${fanId}`).then(r => { if (live) setDetail(r.data); })
      .catch(e => { if (live) { setDetail(null); toast.error(errMsg(e, 'Could not load the fan')); } });
    return () => { live = false; };
  }, [page.creator_id, fanId]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (list?.fans || []).filter(f => !q || [f.display_name, f.fan_username, f.fan_nickname].some(v => String(v || '').toLowerCase().includes(q)));
  }, [list, search]);
  const todo = (list?.fans || []).filter(f => !f.memory || f.memory.behind).length;

  const buildAll = async () => {
    setBusy('all');
    try { const { data } = await api.post(`/api/ai-chat/pages/${page.creator_id}/memory`); setList(l => ({ ...l, job: data.job })); }
    catch (e) { toast.error(errMsg(e, 'Could not start')); }
    finally { setBusy(''); }
  };
  const build = async (full) => {
    setBusy('build');
    try {
      const { data } = await api.post(`/api/ai-chat/pages/${page.creator_id}/fans/${fanId}/memory`, { full });
      setDetail(data);
      toast.success(data.updated ? `Memory updated (${cost(data.cost)})` : 'Already up to date');
      load(); onSpent?.();
    } catch (e) { toast.error(errMsg(e, 'Could not update the memory')); }
    finally { setBusy(''); }
  };
  const save = async (facts, summary) => {
    setBusy('save');
    try {
      const { data } = await api.put(`/api/ai-chat/pages/${page.creator_id}/fans/${fanId}/memory`, {
        facts: facts.filter(f => f.note.trim()).map(f => ({ id: f.id, kind: f.kind, note: f.note, locked: !!f.locked, on: f.kind === 'plan' ? f.on || null : null })), summary,
      });
      setDetail(data);
      toast.success('Memory saved');
      load();
    } catch (e) { toast.error(errMsg(e, 'Could not save')); }
    finally { setBusy(''); }
  };

  if (!list) return <div className='grid gap-3'>{[0, 1, 2].map(i => <Skeleton key={i} className='h-14 w-full' />)}</div>;
  if (list.error) return <p className='text-sm text-muted-foreground'>{list.error}</p>;
  const job = list.job;

  return (
    <div className='flex flex-col gap-4'>
      <div className='flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3'>
        <div className='flex items-start gap-2 text-sm'>
          <Brain className='mt-0.5 size-4 shrink-0 text-muted-foreground' />
          <span>
            {job?.running ? `Building memory: ${job.done} of ${job.total} fans (${cost(job.cost)} so far)…`
              : job?.finished_at ? `Built memory for ${job.done - job.failed} of ${job.total} fans (${cost(job.cost)})${job.failed ? `; ${job.failed} failed (${job.last_error})` : ''}.`
                : todo ? `${todo} of ${list.fans.length} fans who wrote have no memory yet or new messages since. Building it all costs well under $1.`
                  : `All ${list.fans.length} fans who wrote have up-to-date memory.`}
          </span>
        </div>
        <Button onClick={buildAll} disabled={!!busy || running || !todo || !ready.writer}>
          {running || busy === 'all' ? <Loader2 className='animate-spin' /> : <Brain />}Build memory for {todo || 'all'} fan{todo === 1 ? '' : 's'}
        </Button>
      </div>

      <div className='grid gap-4 md:grid-cols-[250px_minmax(0,1fr)]'>
        <div className='flex flex-col gap-2'>
          <div className='relative'>
            <Search className='pointer-events-none absolute start-2.5 top-2.5 size-4 text-muted-foreground' />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder='Find a fan' className='ps-8' aria-label='Find a fan' />
          </div>
          <div className='flex max-h-[65vh] flex-col gap-1 overflow-y-auto'>
            {shown.map(f => {
              const s = status(f);
              return (
                <button key={f.fan_uuid} type='button' onClick={() => { setFanId(f.fan_uuid); setDetail(null); }}
                  className={cn('flex flex-col rounded-md border px-3 py-1.5 text-left hover:bg-muted/50', fanId === f.fan_uuid && 'border-primary bg-primary/5')}>
                  <span className='truncate text-sm font-medium'>{fanName(f)}</span>
                  <span className='text-xs text-muted-foreground'>
                    {f.fan_messages} from him · {shortDay(f.last_fan_at)} · <span className={s.tone}>{s.label}</span>
                  </span>
                </button>
              );
            })}
            {!shown.length && <p className='px-1 text-sm text-muted-foreground'>No fan found.</p>}
          </div>
        </div>

        <div className='min-w-0'>
          {!fanId ? <p className='rounded-lg border border-dashed p-6 text-sm text-muted-foreground'>Pick a fan to see what she remembers about him.</p>
            : !detail ? <Skeleton className='h-64 w-full' />
              : <MemoryEditor key={`${fanId}-${detail.memory?.built_at || ''}-${detail.memory?.edited_at || ''}`} detail={detail} busy={busy} onSave={save} onBuild={build} />}
        </div>
      </div>
    </div>
  );
}
