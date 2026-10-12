import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Check, ChevronLeft, ChevronRight, CircleAlert, Loader2, MoreHorizontal, Pencil, Plus, Sparkles, Trash2, UserPlus,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/services/api';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';

const DAY = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const wd = (iso) => new Date(`${iso}T12:00:00Z`).getUTCDay() || 7;
const fmtDay = (iso) => { const d = new Date(`${iso}T12:00:00Z`); return `${DAY[d.getUTCDay() || 7]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`; };
const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const EDIT_ROLES = ['manager', 'head_manager', 'admin', 'owner'];
const errMsg = (e, d) => e?.response?.data?.error || d;

/**
 * Shifts: who works which pages, shift by shift (server/src/utils/roster.js).
 * Chatters aren't tied to one page or team. The usual weekly roster says each
 * chatter's shift, pages and days; changes for one day (someone off, someone
 * brought in) don't touch it. A page left uncovered in a shift where it is
 * normally covered shows red, with a way to bring someone in.
 */
export default function ShiftsPage() {
  const { user } = useAuth();
  const canEdit = EDIT_ROLES.includes(user?.role);
  const [week, setWeek] = useState(null);              // any date in the week shown; null = this week
  const [data, setData] = useState(null);
  const [day, setDay] = useState(null);                // the day on the board
  const [showAll, setShowAll] = useState(false);
  const [editor, setEditor] = useState(null);          // { assignment } | { chatterId? } (new)
  const [bring, setBring] = useState(null);            // { creatorId, shiftId }
  const [proposal, setProposal] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api.get(`/api/roster${week ? `?week=${week}` : ''}`)
    .then(r => setData(r.data)).catch(() => setData({ error: true })), [week]);
  useEffect(() => { load(); }, [load]);

  const slots = useMemo(() => data?.slots || [], [data]);
  const assignments = useMemo(() => data?.assignments || [], [data]);
  const pageById = useMemo(() => Object.fromEntries((data?.pages || []).map(p => [p.id, p])), [data]);
  const chatterById = useMemo(() => Object.fromEntries((data?.chatters || []).map(c => [c.id, c])), [data]);
  const slotById = useMemo(() => Object.fromEntries(slots.map(s => [s.id, s])), [slots]);
  const days = useMemo(() => data?.days || [], [data]);
  const board = days.find(d => d.date === day) || days.find(d => d.date === data?.today) || days[0] || null;

  // One call for every change; the week reloads after.
  const run = async (fn, done) => {
    setBusy(true);
    try { await fn(); if (done) toast.success(done); await load(); return true; }
    catch (e) { toast.error(errMsg(e, 'Could not save')); return false; }
    finally { setBusy(false); }
  };
  const setChange = (body, done) => run(() => api.put('/api/roster/changes', body), done);
  const name = (id) => chatterById[id]?.name || 'Someone';
  const pageName = (id) => pageById[id]?.name || 'a page';

  const header = (
    <div className='flex flex-wrap items-end justify-between gap-3'>
      <div className='min-w-0'>
        <h2 className='text-2xl font-bold tracking-tight'>Shifts</h2>
        <p className='max-w-3xl text-muted-foreground'>
          Who works which pages, shift by shift. Changes for one day don&apos;t touch the usual roster.
        </p>
      </div>
      {data?.week_start && (
        <div className='flex flex-wrap items-center gap-2'>
          <div className='flex items-center gap-1'>
            <Button variant='outline' size='icon' aria-label='Previous week' onClick={() => setWeek(addDays(data.week_start, -7))}><ChevronLeft /></Button>
            <span className='min-w-36 text-center text-sm font-medium tabular-nums'>{fmtDay(data.week_start)} – {fmtDay(addDays(data.week_start, 6))}</span>
            <Button variant='outline' size='icon' aria-label='Next week' onClick={() => setWeek(addDays(data.week_start, 7))}><ChevronRight /></Button>
          </div>
          {week && <Button variant='ghost' size='sm' onClick={() => { setWeek(null); setDay(null); }}>This week</Button>}
          {canEdit && data.ready && <Button variant='outline' onClick={() => setProposal(true)}><Sparkles />Build from how we work now</Button>}
        </div>
      )}
    </div>
  );

  if (!data) return <div className='flex flex-col gap-6'>{header}<div className='grid gap-3'>{[0, 1, 2].map(i => <Skeleton key={i} className='h-24 w-full' />)}</div></div>;
  if (data.error) return <div className='flex flex-col gap-6'>{header}<p className='text-sm text-muted-foreground'>Could not load the shifts.</p></div>;
  if (!data.ready) {
    return (
      <div className='flex flex-col gap-6'>
        {header}
        <div className='flex items-start gap-2 rounded-lg border border-warn/40 bg-warn/5 px-4 py-3 text-sm'>
          <CircleAlert className='mt-0.5 size-4 shrink-0 text-warn' />
          <span>{data.message || 'Shifts are not set up yet.'} Then &ldquo;Build from how we work now&rdquo; fills the roster from the last 4 weeks.</span>
        </div>
        <OldViewLink />
      </div>
    );
  }

  // Pages on the board: those anyone is rostered on (plus anything worked that day).
  const rostered = new Set(assignments.flatMap(a => a.creator_ids || []));
  const boardPages = (data.pages || []).filter(p => (p.is_active !== false && (showAll || rostered.has(p.id)))
    || (board?.entries || []).some(e => e.creator_ids.includes(p.id)));
  const normal = new Set(assignments.flatMap(a => (a.creator_ids || []).map(p => `${p}|${a.shift_id}`)));
  const working = new Set((board?.entries || []).map(e => e.chatter_id));
  const rosterChatters = [...new Set(assignments.map(a => a.chatter_id))];
  const offToday = rosterChatters.filter(id => !working.has(id));
  const offChange = Object.fromEntries((board?.off || []).map(o => [o.chatter_id, o]));
  const holesBySlot = slots.map(s => ({ s, pages: (board?.holes || []).filter(h => h.shift_id === s.id).map(h => pageName(h.creator_id)) })).filter(x => x.pages.length);

  return (
    <div className='flex flex-col gap-6'>
      {header}

      {!assignments.length ? (
        <div className='flex flex-col items-start gap-3 rounded-lg border border-dashed p-6'>
          <p className='text-sm text-muted-foreground'>No roster yet. Build it from how the team actually worked the last 4 weeks, then adjust.</p>
          {canEdit && <Button onClick={() => setProposal(true)}><Sparkles />Build from how we work now</Button>}
        </div>
      ) : (
        <>
          {/* The week: one button per day, with that day's gaps */}
          <div className='grid grid-cols-7 gap-1.5'>
            {days.map(d => {
              const n = d.holes.length, on = board?.date === d.date;
              return (
                <button key={d.date} type='button' onClick={() => setDay(d.date)} aria-pressed={on}
                  className={cn('flex flex-col items-center gap-1 rounded-lg border px-1 py-2 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    on ? 'border-primary bg-primary/5' : 'hover:bg-muted/60', d.date === data.today && 'font-semibold')}>
                  <span>{fmtDay(d.date).split(' ').slice(0, 2).join(' ')}</span>
                  {n ? <span className='rounded-md bg-bad/10 px-1.5 text-[11px] font-medium text-bad'>{n} gap{n === 1 ? '' : 's'}</span>
                    : <Check className='size-3.5 text-good' aria-label='No gaps' />}
                </button>
              );
            })}
          </div>

          {board && (
            <section className='grid gap-3'>
              <div className='flex flex-wrap items-center justify-between gap-2'>
                <h3 className='text-base font-semibold'>{fmtDay(board.date)}{board.date === data.today ? ' · today' : ''}</h3>
                <label className='flex items-center gap-2 text-sm text-muted-foreground'>
                  <Switch checked={showAll} onCheckedChange={setShowAll} id='shifts-all-pages' />Show every page
                </label>
              </div>
              {holesBySlot.length > 0 && (
                <div className='flex flex-wrap gap-x-4 gap-y-1 rounded-md border border-bad/30 bg-bad/5 px-3 py-2 text-sm'>
                  {holesBySlot.map(({ s, pages }) => (
                    <span key={s.id}><span className='font-medium text-bad'>{s.name}:</span> {pages.join(', ')} not covered</span>
                  ))}
                </div>
              )}

              <div className='overflow-x-auto rounded-lg border bg-card'>
                <table className='w-full min-w-[640px] border-collapse text-sm'>
                  <thead>
                    <tr className='border-b bg-muted/40 text-left text-xs text-muted-foreground'>
                      <th className='w-36 px-3 py-2 font-medium'>Page</th>
                      {slots.map(s => <th key={s.id} className='px-3 py-2 font-medium'>{s.name} <span className='font-normal tabular-nums'>{s.start}–{s.end}</span></th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {boardPages.map(p => (
                      <tr key={p.id} className='border-b last:border-b-0 align-top'>
                        <td className='px-3 py-2 font-medium'>{p.name}</td>
                        {slots.map(s => {
                          const here = board.entries.filter(e => e.shift_id === s.id && e.creator_ids.includes(p.id));
                          const hole = !here.length && normal.has(`${p.id}|${s.id}`);
                          return (
                            <td key={s.id} className={cn('px-2 py-1.5', hole && 'bg-bad/5')}>
                              <div className='flex flex-wrap items-center gap-1'>
                                {here.map(e => (
                                  <EntryChip key={e.chatter_id} entry={e} page={p} slot={s} name={name(e.chatter_id)} canEdit={canEdit} busy={busy}
                                    onOff={() => setChange({ date: board.date, chatter_id: e.chatter_id, kind: 'off' }, `${name(e.chatter_id)} is off ${fmtDay(board.date)}`)}
                                    onNotHere={() => setChange({ date: board.date, chatter_id: e.chatter_id, kind: 'work', shift_id: e.shift_id, creator_ids: e.creator_ids.filter(x => x !== p.id) }, `${name(e.chatter_id)} is off ${p.name} that day`)}
                                    onUndo={e.change_id ? () => run(() => api.delete(`/api/roster/changes/${e.change_id}`), 'Back to the usual roster') : null}
                                    onEdit={e.assignment_id ? () => setEditor({ assignment: assignments.find(a => a.id === e.assignment_id) }) : null} />
                                ))}
                                {hole && <span className='text-xs font-medium text-bad'>Not covered</span>}
                                {canEdit && (
                                  <Button size='sm' variant={hole ? 'outline' : 'ghost'} className={cn('h-7 px-2 text-xs', !hole && 'text-muted-foreground')}
                                    onClick={() => setBring({ creatorId: p.id, shiftId: s.id })} aria-label={`Bring someone to ${p.name}, ${s.name}`}>
                                    <UserPlus />{hole ? 'Bring someone' : ''}
                                  </Button>
                                )}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {offToday.length > 0 && (
                <div className='flex flex-wrap items-center gap-1.5 text-sm'>
                  <span className='text-muted-foreground'>Off this day:</span>
                  {offToday.map(id => {
                    const ch = offChange[id];
                    return (
                      <span key={id} className={cn('inline-flex items-center gap-1 rounded-md border px-2 py-0.5', ch && 'border-dashed')}>
                        {name(id)}{ch ? <span className='text-xs text-muted-foreground'> · this day only{ch.note ? `: ${ch.note}` : ''}</span> : null}
                        {ch && canEdit && (
                          <button type='button' className='ms-1 text-xs text-link hover:underline' disabled={busy}
                            onClick={() => run(() => api.delete(`/api/roster/changes/${ch.change_id}`), `${name(id)} is back on the roster`)}>Undo</button>
                        )}
                      </span>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          <TeamSection data={data} slotById={slotById} pageName={pageName} canEdit={canEdit}
            onEdit={(a) => setEditor({ assignment: a })} onAdd={(chatterId) => setEditor({ chatterId })}
            onRemove={(a) => run(() => api.delete(`/api/roster/assignments/${a.id}`), `${name(a.chatter_id)}'s ${slotById[a.shift_id]?.name || ''} shift removed`)} />
        </>
      )}

      <OldViewLink />

      {editor && (
        <AssignmentEditor data={data} initial={editor} onClose={() => setEditor(null)}
          onSave={async (body, id) => { const ok = await run(() => (id ? api.patch(`/api/roster/assignments/${id}`, body) : api.post('/api/roster/assignments', body)), 'Roster saved'); if (ok) setEditor(null); }} />
      )}
      {bring && board && (
        <BringDialog board={board} data={data} creatorId={bring.creatorId} shiftId={bring.shiftId} name={name} pageName={pageName}
          onClose={() => setBring(null)}
          onToday={async (body, done) => { const ok = await setChange(body, done); if (ok) setBring(null); }}
          onUsual={async (fn, done) => { const ok = await run(fn, done); if (ok) setBring(null); }} />
      )}
      {proposal && <ProposalDialog onClose={() => setProposal(false)} onApplied={() => { setProposal(false); load(); }} />}
    </div>
  );
}

function OldViewLink() {
  return (
    <p className='text-xs text-muted-foreground'>
      Merging pages into teams lives on the <Link to='/creators' className='text-link hover:underline'>old shifts view</Link>.
    </p>
  );
}

// A chatter on a page in a shift. Dashed = changed for this day only.
function EntryChip({ entry, page, slot, name, canEdit, busy, onOff, onNotHere, onUndo, onEdit }) {
  const chip = (
    <span className={cn('inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-sm',
      entry.source === 'change' ? 'border-dashed border-link/50 bg-link/5' : 'bg-muted/40')}>
      {name}{canEdit && <MoreHorizontal className='size-3.5 text-muted-foreground' />}
    </span>
  );
  if (!canEdit) return chip;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={busy}>
        <button type='button' className='rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring' aria-label={`${name}: options`}>{chip}</button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='start'>
        <DropdownMenuLabel className='font-normal text-muted-foreground'>
          {name} · {slot.name}{entry.source === 'change' ? ' · this day only' : ''}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onOff}>Off this day</DropdownMenuItem>
        {entry.creator_ids.length > 1 && <DropdownMenuItem onClick={onNotHere}>Not on {page.name} this day</DropdownMenuItem>}
        {onUndo && <DropdownMenuItem onClick={onUndo}>Undo this day&apos;s change</DropdownMenuItem>}
        {onEdit && <DropdownMenuItem onClick={onEdit}><Pencil />Edit usual shift…</DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Bring someone onto a page in a shift: someone already on that shift takes the
// page too, or someone off that day comes in. For this day, or as their usual.
function BringDialog({ board, data, creatorId, shiftId, name, pageName, onClose, onToday, onUsual }) {
  const [q, setQ] = useState('');
  const slot = (data.slots || []).find(s => s.id === shiftId);
  const dow = wd(board.date);
  const match = (id) => name(id).toLowerCase().includes(q.trim().toLowerCase());
  const entriesOf = (id) => board.entries.filter(e => e.chatter_id === id);
  const sameShift = [...new Set(board.entries.filter(e => e.shift_id === shiftId && !e.creator_ids.includes(creatorId)).map(e => e.chatter_id))].filter(match);
  const otherShift = [...new Set(board.entries.filter(e => e.shift_id !== shiftId).map(e => e.chatter_id))].filter(id => !sameShift.includes(id) && match(id));
  const working = new Set(board.entries.map(e => e.chatter_id));
  const free = (data.chatters || []).filter(c => c.is_active !== false && !working.has(c.id) && match(c.id)).map(c => c.id);
  const usualRow = (id) => (data.assignments || []).find(a => a.chatter_id === id && a.shift_id === shiftId);
  const page = pageName(creatorId);
  const day = fmtDay(board.date);

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className='max-h-[90vh] overflow-y-auto sm:max-w-xl'>
        <DialogHeader>
          <DialogTitle>Bring someone to {page}</DialogTitle>
          <DialogDescription>{slot?.name} {slot?.start}–{slot?.end}, {day}.</DialogDescription>
        </DialogHeader>
        <Input id='bring-search' placeholder='Find a chatter' value={q} onChange={e => setQ(e.target.value)} />

        <div className='grid gap-1'>
          <p className='text-xs font-medium uppercase tracking-wide text-muted-foreground'>Already on {slot?.name} that day: add {page} to their shift</p>
          {sameShift.length ? (
            <ul className='divide-y rounded-md border'>
              {sameShift.map(id => {
                const e = entriesOf(id).find(x => x.shift_id === shiftId);
                const usual = usualRow(id);
                return (
                  <CandidateRow key={id} label={name(id)} sub={`Handles ${e.creator_ids.map(pageName).join(', ')}`}>
                    <Button size='sm' onClick={() => onToday({ date: board.date, chatter_id: id, kind: 'work', shift_id: shiftId, creator_ids: [...e.creator_ids, creatorId] }, `${name(id)} takes ${page} on ${day}`)}>This day</Button>
                    {usual && e.source === 'roster' && (
                      <Button size='sm' variant='outline' onClick={() => onUsual(() => api.patch(`/api/roster/assignments/${usual.id}`, { creator_ids: [...usual.creator_ids, creatorId] }), `${page} added to ${name(id)}'s usual shift`)}>Every shift</Button>
                    )}
                  </CandidateRow>
                );
              })}
            </ul>
          ) : <p className='text-sm text-muted-foreground'>Nobody else is on this shift that day.</p>}
        </div>

        <div className='grid gap-1'>
          <p className='text-xs font-medium uppercase tracking-wide text-muted-foreground'>Off that day: bring them in</p>
          {free.length ? (
            <ul className='max-h-64 divide-y overflow-y-auto rounded-md border'>
              {free.map(id => {
                const usual = usualRow(id);
                const rows = (data.assignments || []).filter(a => a.chatter_id === id);
                const offOnce = (board.off || []).find(o => o.chatter_id === id);   // normally works, off this day only
                const worksThatDay = rows.some(a => (a.weekdays || []).includes(dow));
                const sub = offOnce ? `Off this day only${offOnce.note ? `: ${offOnce.note}` : ''}`
                  : rows.length ? rows.map(a => `${(data.slots || []).find(s => s.id === a.shift_id)?.name || ''} ${a.weekdays.map(d => DAY[d]).join(' ')}`).join(' · ') : 'Not on the roster';
                return (
                  <CandidateRow key={id} label={name(id)} sub={sub}>
                    <Button size='sm' onClick={() => onToday({ date: board.date, chatter_id: id, kind: 'work', shift_id: shiftId, creator_ids: [creatorId] }, `${name(id)} comes in for ${page} on ${day}`)}>This day</Button>
                    {!worksThatDay && <Button size='sm' variant='outline' onClick={() => onUsual(() => (usual
                      ? api.patch(`/api/roster/assignments/${usual.id}`, { weekdays: [...usual.weekdays, dow], creator_ids: usual.creator_ids.includes(creatorId) ? usual.creator_ids : [...usual.creator_ids, creatorId] })
                      : api.post('/api/roster/assignments', { chatter_id: id, shift_id: shiftId, creator_ids: [creatorId], weekdays: [dow] })), `${name(id)} now works ${slot?.name} every ${DAY[dow]}`)}>Every {DAY[dow]}</Button>}
                  </CandidateRow>
                );
              })}
            </ul>
          ) : <p className='text-sm text-muted-foreground'>Nobody matching is off that day.</p>}
        </div>

        {otherShift.length > 0 && (
          <div className='grid gap-1'>
            <p className='text-xs font-medium uppercase tracking-wide text-muted-foreground'>On another shift that day: move them here for the day</p>
            <ul className='max-h-48 divide-y overflow-y-auto rounded-md border'>
              {otherShift.map(id => {
                const e = entriesOf(id)[0];
                const theirs = (data.slots || []).find(s => s.id === e?.shift_id)?.name || 'another shift';
                return (
                  <CandidateRow key={id} label={name(id)} sub={`Works ${theirs} on ${(e?.creator_ids || []).map(pageName).join(', ')}: moving them leaves that uncovered`}>
                    <Button size='sm' variant='outline' onClick={() => onToday({ date: board.date, chatter_id: id, kind: 'work', shift_id: shiftId, creator_ids: [creatorId] }, `${name(id)} moves to ${slot?.name} on ${page} for ${day}`)}>Move here this day</Button>
                  </CandidateRow>
                );
              })}
            </ul>
          </div>
        )}
        <DialogFooter><Button variant='ghost' onClick={onClose}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CandidateRow({ label, sub, children }) {
  return (
    <li className='flex flex-wrap items-center justify-between gap-2 px-3 py-2'>
      <div className='min-w-0'>
        <div className='text-sm font-medium'>{label}</div>
        {sub && <div className='text-xs text-muted-foreground'>{sub}</div>}
      </div>
      <div className='flex flex-wrap gap-1.5'>{children}</div>
    </li>
  );
}

// The usual roster, chatter by chatter, with this week's hours.
function TeamSection({ data, slotById, pageName, canEdit, onEdit, onAdd, onRemove }) {
  const assignments = data.assignments || [];
  const byChatter = {};
  for (const a of assignments) (byChatter[a.chatter_id] ||= []).push(a);
  const names = Object.fromEntries((data.chatters || []).map(c => [c.id, c.name]));
  const order = Object.keys(byChatter).sort((a, b) => {
    const sa = Math.min(...byChatter[a].map(x => slotById[x.shift_id]?.start || '99')), sb = Math.min(...byChatter[b].map(x => slotById[x.shift_id]?.start || '99'));
    return String(sa).localeCompare(String(sb)) || String(names[a]).localeCompare(String(names[b]));
  });
  const notOn = (data.chatters || []).filter(c => c.is_active !== false && !byChatter[c.id]);
  return (
    <section className='grid gap-3'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <h3 className='text-base font-semibold'>Usual roster</h3>
        {canEdit && <Button size='sm' variant='outline' onClick={() => onAdd(null)}><Plus />Add to the roster</Button>}
      </div>
      <div className='overflow-x-auto rounded-lg border bg-card'>
        <table className='w-full min-w-[640px] border-collapse text-sm'>
          <thead>
            <tr className='border-b bg-muted/40 text-left text-xs text-muted-foreground'>
              <th className='px-3 py-2 font-medium'>Chatter</th>
              <th className='px-3 py-2 font-medium'>Shift</th>
              <th className='px-3 py-2 font-medium'>Days</th>
              <th className='px-3 py-2 font-medium'>Pages</th>
              <th className='px-3 py-2 text-right font-medium'>This week</th>
              {canEdit && <th className='w-24 px-3 py-2' />}
            </tr>
          </thead>
          <tbody>
            {order.flatMap(id => byChatter[id].map((a, i) => (
              <tr key={a.id} className={cn('align-top', i === byChatter[id].length - 1 && 'border-b last:border-b-0')}>
                <td className='px-3 py-2 font-medium'>{i === 0 ? names[id] || '?' : ''}</td>
                <td className='px-3 py-2 whitespace-nowrap'>{slotById[a.shift_id]?.name || '?'} <span className='text-xs text-muted-foreground tabular-nums'>{slotById[a.shift_id]?.start}–{slotById[a.shift_id]?.end}</span></td>
                <td className='px-3 py-2'>
                  <div className='flex gap-0.5'>
                    {[1, 2, 3, 4, 5, 6, 7].map(d => (
                      <span key={d} className={cn('w-7 rounded px-0.5 text-center text-[11px]', a.weekdays.includes(d) ? 'bg-primary/10 font-medium text-foreground' : 'text-muted-foreground/50')}>{DAY[d].slice(0, 2)}</span>
                    ))}
                  </div>
                </td>
                <td className='px-3 py-2'><div className='flex flex-wrap gap-1'>{(a.creator_ids || []).map(p => <Badge key={p} variant='secondary' className='font-normal'>{pageName(p)}</Badge>)}</div></td>
                <td className='px-3 py-2 text-right text-xs whitespace-nowrap text-muted-foreground tabular-nums'>{i === 0 && data.hours?.[id] ? `${data.hours[id].shifts} shifts · ${Math.round(data.hours[id].hours)}h` : ''}</td>
                {canEdit && (
                  <td className='px-2 py-1.5 text-right whitespace-nowrap'>
                    <Button size='icon-sm' variant='ghost' aria-label='Edit' onClick={() => onEdit(a)}><Pencil /></Button>
                    <Button size='icon-sm' variant='ghost' aria-label='Remove from the roster' onClick={() => onRemove(a)}><Trash2 /></Button>
                    {i === byChatter[id].length - 1 && <Button size='icon-sm' variant='ghost' aria-label='Add another shift' onClick={() => onAdd(id)}><Plus /></Button>}
                  </td>
                )}
              </tr>
            )))}
          </tbody>
        </table>
      </div>
      {notOn.length > 0 && (
        <p className='text-xs text-muted-foreground'>Not on the roster: {notOn.map(c => c.name).join(', ')}.</p>
      )}
    </section>
  );
}

// Add or edit one usual shift: chatter, shift, pages, days.
function AssignmentEditor({ data, initial, onClose, onSave }) {
  const a = initial.assignment || null;
  const [chatterId, setChatterId] = useState(a?.chatter_id || initial.chatterId || '');
  const [shiftId, setShiftId] = useState(a?.shift_id || (data.slots || [])[0]?.id || '');
  const [pages, setPages] = useState(new Set(a?.creator_ids || []));
  const [days, setDays] = useState(new Set(a?.weekdays || [1, 2, 3, 4, 5]));
  const [busy, setBusy] = useState(false);
  const toggle = (set, setter, v) => { const n = new Set(set); if (n.has(v)) n.delete(v); else n.add(v); setter(n); };
  const activePages = (data.pages || []).filter(p => p.is_active !== false || pages.has(p.id));
  const chatters = (data.chatters || []).filter(c => c.is_active !== false || c.id === chatterId);
  const ok = chatterId && shiftId && pages.size && days.size;
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className='max-h-[90vh] overflow-y-auto sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>{a ? 'Edit usual shift' : 'Add to the roster'}</DialogTitle>
          <DialogDescription>The shift, the pages they handle in it, and the days they work it.</DialogDescription>
        </DialogHeader>
        <div className='grid gap-4'>
          {!a && (
            <div className='grid gap-1.5'>
              <span className='text-sm font-medium'>Chatter</span>
              <Select value={chatterId} onValueChange={setChatterId}>
                <SelectTrigger id='roster-chatter'><SelectValue placeholder='Pick a chatter' /></SelectTrigger>
                <SelectContent>{chatters.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          <div className='grid gap-1.5'>
            <span className='text-sm font-medium'>Shift</span>
            <Select value={shiftId} onValueChange={setShiftId}>
              <SelectTrigger id='roster-shift'><SelectValue /></SelectTrigger>
              <SelectContent>{(data.slots || []).map(s => <SelectItem key={s.id} value={s.id}>{s.name} {s.start}–{s.end}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className='grid gap-1.5'>
            <span className='text-sm font-medium'>Days</span>
            <div className='grid grid-cols-7 gap-1'>
              {[1, 2, 3, 4, 5, 6, 7].map(d => (
                <Button key={d} type='button' size='sm' variant={days.has(d) ? 'default' : 'outline'} aria-pressed={days.has(d)}
                  onClick={() => toggle(days, setDays, d)} className='px-0'>{DAY[d]}</Button>
              ))}
            </div>
          </div>
          <div className='grid gap-1.5'>
            <span className='text-sm font-medium'>Pages</span>
            <div className='grid grid-cols-2 gap-1.5 sm:grid-cols-3'>
              {activePages.map(p => (
                <label key={p.id} className='flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm'>
                  <Checkbox checked={pages.has(p.id)} onCheckedChange={() => toggle(pages, setPages, p.id)} id={`roster-page-${p.id}`} />{p.name}
                </label>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant='ghost' onClick={onClose}>Cancel</Button>
          <Button disabled={!ok || busy} onClick={async () => {
            setBusy(true);
            await onSave(a ? { shift_id: shiftId, creator_ids: [...pages], weekdays: [...days] } : { chatter_id: chatterId, shift_id: shiftId, creator_ids: [...pages], weekdays: [...days] }, a?.id);
            setBusy(false);
          }}>{busy ? 'Saving…' : 'Save'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// The roster as the team actually worked the last 4 weeks, to review and apply.
function ProposalDialog({ onClose, onApplied }) {
  const [p, setP] = useState(null);
  const [skip, setSkip] = useState(new Set());
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api.get('/api/roster/proposal').then(r => setP(r.data)).catch(e => setP({ error: errMsg(e, 'Could not build the roster') }));
  }, []);
  const rows = p?.proposals || [];
  const keep = rows.filter((_, i) => !skip.has(i));
  const apply = async () => {
    setBusy(true);
    try {
      const { data } = await api.post('/api/roster/proposal/apply', { assignments: keep.map(r => ({ chatter_id: r.chatter_id, shift_id: r.shift_id, creator_ids: r.creator_ids, weekdays: r.weekdays })) });
      toast.success(`Roster built: ${data.applied} shifts`);
      onApplied();
    } catch (e) { toast.error(errMsg(e, 'Could not apply')); }
    finally { setBusy(false); }
  };
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className='max-h-[90vh] overflow-y-auto sm:max-w-3xl'>
        <DialogHeader>
          <DialogTitle>Build the roster from how we work now</DialogTitle>
          <DialogDescription>
            {p?.from ? `From the chats ${fmtDay(p.from)} – ${fmtDay(p.to)}: each chatter's shift, the days they worked it in at least 2 of the 4 weeks, and the pages they handled. ` : ''}
            Untick anything you don&apos;t want. Applying replaces the usual roster; changes for single days stay.
          </DialogDescription>
        </DialogHeader>
        {!p ? (
          <div className='flex items-center gap-2 py-6 text-sm text-muted-foreground'><Loader2 className='size-4 animate-spin' />Reading the last 4 weeks of chats…</div>
        ) : p.error ? (
          <p className='text-sm text-muted-foreground'>{p.error}</p>
        ) : (
          <div className='overflow-x-auto rounded-md border'>
            <table className='w-full min-w-[600px] text-sm'>
              <thead>
                <tr className='border-b bg-muted/40 text-left text-xs text-muted-foreground'>
                  <th className='w-8 px-2 py-2' />
                  <th className='px-2 py-2 font-medium'>Shift</th>
                  <th className='px-2 py-2 font-medium'>Chatter</th>
                  <th className='px-2 py-2 font-medium'>Days</th>
                  <th className='px-2 py-2 font-medium'>Pages (share of their messages)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${r.chatter_id}-${r.shift_id}`} className={cn('border-b last:border-b-0 align-top', skip.has(i) && 'opacity-50')}>
                    <td className='px-2 py-2'>
                      <Checkbox checked={!skip.has(i)} id={`proposal-${i}`} aria-label={`Include ${r.chatter_name}`}
                        onCheckedChange={() => { const n = new Set(skip); if (n.has(i)) n.delete(i); else n.add(i); setSkip(n); }} />
                    </td>
                    <td className='px-2 py-2 whitespace-nowrap'>{r.shift_name}</td>
                    <td className='px-2 py-2 font-medium'>{r.chatter_name} <span className='text-xs font-normal text-muted-foreground'>· {r.shifts_worked} shifts</span></td>
                    <td className='px-2 py-2 whitespace-nowrap'>{r.weekdays.map(d => DAY[d]).join(' ')}</td>
                    <td className='px-2 py-2 text-muted-foreground'>{r.pages.map(x => `${x.name} ${x.share}%`).join(', ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <DialogFooter>
          <Button variant='ghost' onClick={onClose}>Cancel</Button>
          <Button disabled={!keep.length || busy || !!p?.error} onClick={apply}>{busy ? 'Applying…' : `Use these ${keep.length} shifts`}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
