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
const clock = (t) => (t ? String(t).slice(0, 5) : null);
const toMin = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0); };
const atMin = (m) => `${String(Math.floor(((m % 1440) + 1440) % 1440 / 60)).padStart(2, '0')}:${String(((m % 60) + 60) % 60).padStart(2, '0')}`;
// The hours a chatter can cover in a shift: all of it, or either half (how days
// off are covered: 4-hour overtime from the neighbouring shifts).
function partsOf(slot) {
  if (!slot) return [];
  const a = toMin(slot.start), len = Math.round(slot.hours * 60), half = Math.round(len / 2);
  return [
    { key: 'whole', label: `Whole shift (${slot.start}–${slot.end})`, from: null, to: null },
    { key: 'first', label: `First half (${slot.start}–${atMin(a + half)})`, from: slot.start, to: atMin(a + half) },
    { key: 'second', label: `Second half (${atMin(a + half)}–${slot.end})`, from: atMin(a + half), to: slot.end },
  ];
}
const hoursLabel = (from, to) => (from && to ? `${from}–${to}` : '');

/**
 * Shifts: who works which pages, shift by shift (server/src/utils/roster.js).
 * Chatters aren't tied to one page or team. The usual weekly roster says each
 * chatter's shift (or part of one: overtime), pages and days; changes for one day
 * (someone off, brought in, doing overtime) don't touch it. A page left without
 * anyone in a shift where it's normally covered shows red; covered for only part
 * of the shift, it shows the open hours. Either way, "Bring someone".
 */
export default function ShiftsPage() {
  const { user } = useAuth();
  const canEdit = EDIT_ROLES.includes(user?.role);
  const [week, setWeek] = useState(null);              // any date in the week shown; null = this week
  const [data, setData] = useState(null);
  const [day, setDay] = useState(null);                // the day on the board
  const [showAll, setShowAll] = useState(false);
  const [editor, setEditor] = useState(null);          // { assignment } | { chatterId? } (new)
  const [bring, setBring] = useState(null);            // { creatorId, shiftId, hole }
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

  // One call (or a few, in order) for every change; the week reloads after.
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
  const holeAt = Object.fromEntries((board?.holes || []).map(h => [`${h.creator_id}|${h.shift_id}`, h]));
  const working = new Set((board?.entries || []).map(e => e.chatter_id));
  const rosterChatters = [...new Set(assignments.map(a => a.chatter_id))];
  const offToday = rosterChatters.filter(id => !working.has(id));
  const offChange = Object.fromEntries((board?.off || []).map(o => [o.chatter_id, o]));
  const shiftOffs = (data.changes || []).filter(c => c.date === board?.date && c.kind === 'off' && c.shift_id);
  const holesBySlot = slots.map(s => ({ s, items: (board?.holes || []).filter(h => h.shift_id === s.id).sort((a, b) => pageName(a.creator_id).localeCompare(pageName(b.creator_id))) }))
    .filter(x => x.items.length);

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
                <div className='flex flex-col gap-1 rounded-md border border-bad/30 bg-bad/5 px-3 py-2 text-sm'>
                  {holesBySlot.map(({ s, items }) => (
                    <span key={s.id}>
                      <span className='font-medium text-bad'>{s.name}:</span>{' '}
                      {items.map(h => (h.partial ? `${pageName(h.creator_id)} (${h.missing.join(', ')})` : pageName(h.creator_id))).join(', ')} not covered
                    </span>
                  ))}
                </div>
              )}

              <div className='overflow-x-auto rounded-lg border bg-card'>
                <table className='w-full min-w-[680px] border-collapse text-sm'>
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
                          const here = board.entries.filter(e => e.shift_id === s.id && e.creator_ids.includes(p.id))
                            .sort((a, b) => toMin(a.from || s.start) - toMin(b.from || s.start));
                          const hole = holeAt[`${p.id}|${s.id}`];
                          return (
                            <td key={s.id} className={cn('px-2 py-1.5', hole && (hole.partial ? 'bg-warn/5' : 'bg-bad/5'))}>
                              <div className='flex flex-wrap items-center gap-1'>
                                {here.map(e => {
                                  const twoToday = board.entries.filter(x => x.chatter_id === e.chatter_id).length > 1;
                                  return (
                                    <EntryChip key={`${e.chatter_id}-${e.shift_id}`} entry={e} page={p} slot={s} name={name(e.chatter_id)} canEdit={canEdit} busy={busy}
                                      onOff={() => setChange({ date: board.date, chatter_id: e.chatter_id, kind: 'off' }, `${name(e.chatter_id)} is off ${fmtDay(board.date)}`)}
                                      onOffShift={twoToday ? () => setChange({ date: board.date, chatter_id: e.chatter_id, kind: 'off', shift_id: e.shift_id }, `${name(e.chatter_id)} is off ${s.name} that day`) : null}
                                      onNotHere={() => setChange({ date: board.date, chatter_id: e.chatter_id, kind: 'work', shift_id: e.shift_id, creator_ids: e.creator_ids.filter(x => x !== p.id), start_time: e.from, end_time: e.to }, `${name(e.chatter_id)} is off ${p.name} that day`)}
                                      onUndo={e.change_id ? () => run(() => api.delete(`/api/roster/changes/${e.change_id}`), 'Back to the usual roster') : null}
                                      onEdit={e.assignment_id ? () => setEditor({ assignment: assignments.find(a => a.id === e.assignment_id) }) : null} />
                                  );
                                })}
                                {hole && <span className={cn('text-xs font-medium', hole.partial ? 'text-warn' : 'text-bad')}>{hole.partial ? `Open ${hole.missing.join(', ')}` : 'Not covered'}</span>}
                                {canEdit && (
                                  <Button size='sm' variant={hole ? 'outline' : 'ghost'} className={cn('h-7 px-2 text-xs', !hole && 'text-muted-foreground')}
                                    onClick={() => setBring({ creatorId: p.id, shiftId: s.id, hole })} aria-label={`Bring someone to ${p.name}, ${s.name}`}>
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

              {(offToday.length > 0 || shiftOffs.length > 0) && (
                <div className='flex flex-wrap items-center gap-1.5 text-sm'>
                  {offToday.length > 0 && <span className='text-muted-foreground'>Off this day:</span>}
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
                  {shiftOffs.length > 0 && <span className='text-muted-foreground'>Off one shift:</span>}
                  {shiftOffs.map(c => (
                    <span key={c.id} className='inline-flex items-center gap-1 rounded-md border border-dashed px-2 py-0.5'>
                      {name(c.chatter_id)}<span className='text-xs text-muted-foreground'> · {slotById[c.shift_id]?.name || 'a shift'}</span>
                      {canEdit && (
                        <button type='button' className='ms-1 text-xs text-link hover:underline' disabled={busy}
                          onClick={() => run(() => api.delete(`/api/roster/changes/${c.id}`), `${name(c.chatter_id)} is back on ${slotById[c.shift_id]?.name || 'that shift'}`)}>Undo</button>
                      )}
                    </span>
                  ))}
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
        <BringDialog board={board} data={data} creatorId={bring.creatorId} shiftId={bring.shiftId} hole={bring.hole} name={name} pageName={pageName}
          onClose={() => setBring(null)}
          onRun={async (fn, done) => { const ok = await run(fn, done); if (ok) setBring(null); }} />
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

// A chatter on a page in a shift: hours shown when it's part of the shift
// (overtime). Dashed = changed for this day only.
function EntryChip({ entry, page, slot, name, canEdit, busy, onOff, onOffShift, onNotHere, onUndo, onEdit }) {
  const part = hoursLabel(entry.from, entry.to);
  const chip = (
    <span className={cn('inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-sm',
      entry.source === 'change' ? 'border-dashed border-link/50 bg-link/5' : 'bg-muted/40')}>
      {name}{part && <span className='text-xs text-muted-foreground tabular-nums'>{part}</span>}
      {canEdit && <MoreHorizontal className='size-3.5 text-muted-foreground' />}
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
          {name} · {slot.name}{part ? ` ${part} (overtime)` : ''}{entry.source === 'change' ? ' · this day only' : ''}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onOff}>Off this day</DropdownMenuItem>
        {onOffShift && <DropdownMenuItem onClick={onOffShift}>Off {slot.name} only this day</DropdownMenuItem>}
        {entry.creator_ids.length > 1 && <DropdownMenuItem onClick={onNotHere}>Not on {page.name} this day</DropdownMenuItem>}
        {onUndo && <DropdownMenuItem onClick={onUndo}>Undo this day&apos;s change</DropdownMenuItem>}
        {onEdit && <DropdownMenuItem onClick={onEdit}><Pencil />Edit usual shift…</DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function CandidateRow({ label, sub, dim = false, children }) {
  return (
    <li className={cn('flex flex-wrap items-center justify-between gap-2 px-3 py-2', dim && 'opacity-60')}>
      <div className='min-w-0'>
        <div className='text-sm font-medium'>{label}</div>
        {sub && <div className='text-xs text-muted-foreground'>{sub}</div>}
      </div>
      <div className='flex flex-wrap gap-1.5'>{children}</div>
    </li>
  );
}

// Bring someone onto a page in a shift, for all of it or part of it: someone on
// that shift takes the page too; someone off comes in; someone on another shift
// does overtime here (keeping their own shift) or moves here for the day.
function BringDialog({ board, data, creatorId, shiftId, hole, name, pageName, onClose, onRun }) {
  const [q, setQ] = useState('');
  const slot = (data.slots || []).find(s => s.id === shiftId);
  const parts = partsOf(slot);
  // the open hours of a part-covered page come first (an hour or more: shorter can't be booked)
  let open = hole?.partial && hole.missing.length === 1 ? hole.missing[0].split('–') : null;
  if (open && ((toMin(open[1]) - toMin(open[0]) + 1440) % 1440 || 1440) < 60) open = null;
  const choices = open && !parts.some(p => p.from === open[0] && p.to === open[1])
    ? [{ key: 'open', label: `Open hours (${open[0]}–${open[1]})`, from: open[0], to: open[1] }, ...parts] : parts;
  const [partKey, setPartKey] = useState(() => (open ? (parts.find(p => p.from === open[0] && p.to === open[1])?.key || 'open') : 'whole'));
  const part = choices.find(c => c.key === partKey) || choices[0];
  const hours = part?.from ? ` (${part.from}–${part.to})` : '';

  const dow = wd(board.date);
  const match = (id) => name(id).toLowerCase().includes(q.trim().toLowerCase());
  const entriesOf = (id) => board.entries.filter(e => e.chatter_id === id);
  const shiftEntry = (id) => entriesOf(id).find(x => x.shift_id === shiftId);
  // is someone already on this shift there for (an hour or more of) the hours picked?
  const len = slot ? Math.round(slot.hours * 60) : 0;
  const rel = (t) => (toMin(t) - toMin(slot.start) + 1440) % 1440;
  const win = (from, to) => (from && to ? [rel(from), rel(to) || len] : [0, len]);
  const during = (e) => { const [a, z] = win(e.from, e.to), [pa, pz] = win(part?.from, part?.to); return Math.min(z, pz) - Math.max(a, pa) >= 60; };
  const sameShift = [...new Set(board.entries.filter(e => e.shift_id === shiftId && !e.creator_ids.includes(creatorId)).map(e => e.chatter_id))]
    .filter(match).sort((a, b) => during(shiftEntry(b)) - during(shiftEntry(a)) || name(a).localeCompare(name(b)));
  const onThisShift = new Set(board.entries.filter(e => e.shift_id === shiftId).map(e => e.chatter_id));
  const otherShift = [...new Set(board.entries.filter(e => e.shift_id !== shiftId).map(e => e.chatter_id))].filter(id => !onThisShift.has(id) && match(id));
  const working = new Set(board.entries.map(e => e.chatter_id));
  const rowsOf = (id) => (data.assignments || []).filter(a => a.chatter_id === id).sort((a, b) => (a.start_time ? 1 : 0) - (b.start_time ? 1 : 0));
  // off that day: people on the roster first
  const free = (data.chatters || []).filter(c => c.is_active !== false && !working.has(c.id) && match(c.id)).map(c => c.id)
    .sort((a, b) => (rowsOf(b).length ? 1 : 0) - (rowsOf(a).length ? 1 : 0));
  const usualRow = (id) => (data.assignments || []).filter(a => a.chatter_id === id && a.shift_id === shiftId)
    .sort((a, b) => (a.start_time ? 1 : 0) - (b.start_time ? 1 : 0))[0];
  const sameHours = (a) => clock(a.start_time) === (part?.from || null) && clock(a.end_time) === (part?.to || null);
  const page = pageName(creatorId);
  const day = fmtDay(board.date);
  const slotName = (sid) => (data.slots || []).find(s => s.id === sid)?.name || 'another shift';
  const work = (id, extra = {}) => ({ date: board.date, chatter_id: id, kind: 'work', shift_id: shiftId, creator_ids: [creatorId], start_time: part?.from || null, end_time: part?.to || null, ...extra });

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className='max-h-[90vh] overflow-y-auto sm:max-w-xl'>
        <DialogHeader>
          <DialogTitle>Bring someone to {page}</DialogTitle>
          <DialogDescription>{slot?.name} {slot?.start}–{slot?.end}, {day}.{hole?.partial ? ` Open: ${hole.missing.join(', ')}.` : ''}</DialogDescription>
        </DialogHeader>
        <div className='grid gap-2 sm:grid-cols-2'>
          <Input id='bring-search' placeholder='Find a chatter' value={q} onChange={e => setQ(e.target.value)} />
          <Select value={partKey} onValueChange={setPartKey}>
            <SelectTrigger id='bring-hours' aria-label='Hours to cover'><SelectValue /></SelectTrigger>
            <SelectContent>{choices.map(c => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>

        <div className='grid gap-1'>
          <p className='text-xs font-medium uppercase tracking-wide text-muted-foreground'>Already on {slot?.name} that day: add {page} to their shift</p>
          {sameShift.length ? (
            <ul className='divide-y rounded-md border'>
              {sameShift.map(id => {
                const e = shiftEntry(id);
                const usual = e.assignment_id && (data.assignments || []).find(a => a.id === e.assignment_id);
                const away = !during(e);
                return (
                  <CandidateRow key={id} label={name(id)} dim={away}
                    sub={`${hoursLabel(e.from, e.to) ? `${hoursLabel(e.from, e.to)} · ` : ''}Handles ${e.creator_ids.map(pageName).join(', ')}${away ? ` · not on ${part.from}–${part.to}` : ''}`}>
                    <Button size='sm' onClick={() => onRun(() => api.put('/api/roster/changes', { date: board.date, chatter_id: id, kind: 'work', shift_id: shiftId, creator_ids: [...e.creator_ids, creatorId], start_time: e.from, end_time: e.to }), `${name(id)} takes ${page} on ${day}`)}>This day</Button>
                    {usual && (
                      <Button size='sm' variant='outline' onClick={() => onRun(() => api.patch(`/api/roster/assignments/${usual.id}`, { creator_ids: [...usual.creator_ids, creatorId] }), `${page} added to ${name(id)}'s usual shift`)}>Every shift</Button>
                    )}
                  </CandidateRow>
                );
              })}
            </ul>
          ) : <p className='text-sm text-muted-foreground'>Nobody else is on this shift that day.</p>}
        </div>

        <div className='grid gap-1'>
          <p className='text-xs font-medium uppercase tracking-wide text-muted-foreground'>On another shift that day: overtime here{hours}, or move here</p>
          {otherShift.length ? (
            <ul className='max-h-56 divide-y overflow-y-auto rounded-md border'>
              {otherShift.map(id => {
                const list = entriesOf(id), e = list[0];
                const shifts = list.map(x => `${slotName(x.shift_id)}${hoursLabel(x.from, x.to) ? ` ${hoursLabel(x.from, x.to)}` : ''}`).join(' + ');
                return (
                  <CandidateRow key={id} label={name(id)} sub={`Works ${shifts}${list.length === 1 ? ` on ${e.creator_ids.map(pageName).join(', ')}` : ''}`}>
                    <Button size='sm' onClick={() => onRun(() => api.put('/api/roster/changes', work(id)), `${name(id)} does overtime on ${page}${hours} on ${day}`)}>Overtime</Button>
                    {/* moving is clear only from a single shift */}
                    {list.length === 1 && <Button size='sm' variant='outline' onClick={() => onRun(async () => {
                      // here first, then off their own shift; if that fails, take back the first
                      const { data: added } = await api.put('/api/roster/changes', work(id));
                      try { await api.put('/api/roster/changes', { date: board.date, chatter_id: id, kind: 'off', shift_id: e.shift_id }); }
                      catch (err) { await api.delete(`/api/roster/changes/${added.id}`).catch(() => {}); throw err; }
                    }, `${name(id)} moves to ${slot?.name} on ${page} for ${day}`)}>Move here</Button>}
                  </CandidateRow>
                );
              })}
            </ul>
          ) : <p className='text-sm text-muted-foreground'>Nobody matching is on another shift that day.</p>}
        </div>

        <div className='grid gap-1'>
          <p className='text-xs font-medium uppercase tracking-wide text-muted-foreground'>Off that day: bring them in{hours}</p>
          {free.length ? (
            <ul className='max-h-56 divide-y overflow-y-auto rounded-md border'>
              {free.map(id => {
                const usual = usualRow(id);
                const rows = rowsOf(id);
                const offOnce = (board.off || []).find(o => o.chatter_id === id);
                const worksThatDay = rows.some(a => (a.weekdays || []).includes(dow));
                const sub = offOnce ? `Off this day only${offOnce.note ? `: ${offOnce.note}` : ''}`
                  : rows.length ? rows.map(a => `${slotName(a.shift_id)}${hoursLabel(clock(a.start_time), clock(a.end_time)) ? ` ${hoursLabel(clock(a.start_time), clock(a.end_time))}` : ''} ${a.weekdays.map(d => DAY[d]).join(' ')}`).join(' · ') : 'Not on the roster';
                return (
                  <CandidateRow key={id} label={name(id)} sub={sub}>
                    <Button size='sm' onClick={() => onRun(() => api.put('/api/roster/changes', work(id)), `${name(id)} comes in for ${page}${hours} on ${day}`)}>This day</Button>
                    {!worksThatDay && (
                      <Button size='sm' variant='outline' onClick={() => onRun(() => (usual && sameHours(usual)
                        ? api.patch(`/api/roster/assignments/${usual.id}`, { weekdays: [...usual.weekdays, dow], creator_ids: usual.creator_ids.includes(creatorId) ? usual.creator_ids : [...usual.creator_ids, creatorId] })
                        : api.post('/api/roster/assignments', { chatter_id: id, shift_id: shiftId, creator_ids: [creatorId], weekdays: [dow], start_time: part?.from || null, end_time: part?.to || null })), `${name(id)} now works ${slot?.name}${hours} every ${DAY[dow]}`)}>Every {DAY[dow]}</Button>
                    )}
                  </CandidateRow>
                );
              })}
            </ul>
          ) : <p className='text-sm text-muted-foreground'>Nobody matching is off that day.</p>}
        </div>

        <DialogFooter><Button variant='ghost' onClick={onClose}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// The usual roster, chatter by chatter, with this week's hours.
function TeamSection({ data, slotById, pageName, canEdit, onEdit, onAdd, onRemove }) {
  const assignments = data.assignments || [];
  const byChatter = {};
  for (const a of assignments) (byChatter[a.chatter_id] ||= []).push(a);
  for (const list of Object.values(byChatter)) list.sort((a, b) => (a.start_time ? 1 : 0) - (b.start_time ? 1 : 0) || String(slotById[a.shift_id]?.start).localeCompare(String(slotById[b.shift_id]?.start)));
  const names = Object.fromEntries((data.chatters || []).map(c => [c.id, c.name]));
  const firstStart = (id) => String(slotById[byChatter[id][0].shift_id]?.start);     // their main shift: whole rows sort first
  const order = Object.keys(byChatter).sort((a, b) => firstStart(a).localeCompare(firstStart(b)) || String(names[a]).localeCompare(String(names[b])));
  const notOn = (data.chatters || []).filter(c => c.is_active !== false && !byChatter[c.id]);
  const week = (id) => {
    const h = data.hours?.[id]; if (!h) return '';
    return `${h.shifts} shift${h.shifts === 1 ? '' : 's'}${h.overtime ? ` + ${Math.round(h.overtime)}h overtime` : ''} · ${Math.round(h.hours)}h`;
  };
  return (
    <section className='grid gap-3'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <h3 className='text-base font-semibold'>Usual roster</h3>
        {canEdit && <Button size='sm' variant='outline' onClick={() => onAdd(null)}><Plus />Add to the roster</Button>}
      </div>
      <div className='overflow-x-auto rounded-lg border bg-card'>
        <table className='w-full min-w-[720px] border-collapse text-sm'>
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
            {order.flatMap(id => byChatter[id].map((a, i) => {
              const s = slotById[a.shift_id];
              const part = hoursLabel(clock(a.start_time), clock(a.end_time));
              return (
                <tr key={a.id} className={cn('align-top', i === byChatter[id].length - 1 && 'border-b last:border-b-0')}>
                  <td className='px-3 py-2 font-medium'>{i === 0 ? names[id] || '?' : ''}</td>
                  <td className='px-3 py-2 whitespace-nowrap'>
                    {s?.name || '?'} <span className='text-xs text-muted-foreground tabular-nums'>{part || `${s?.start}–${s?.end}`}</span>
                    {part && <Badge variant='outline' className='ms-1.5 border-warn/40 font-normal text-warn'>overtime</Badge>}
                  </td>
                  <td className='px-3 py-2'>
                    <div className='flex gap-0.5'>
                      {[1, 2, 3, 4, 5, 6, 7].map(d => (
                        <span key={d} className={cn('w-7 rounded px-0.5 text-center text-[11px]', a.weekdays.includes(d) ? 'bg-primary/10 font-medium text-foreground' : 'text-muted-foreground/50')}>{DAY[d].slice(0, 2)}</span>
                      ))}
                    </div>
                  </td>
                  <td className='px-3 py-2'><div className='flex flex-wrap gap-1'>{(a.creator_ids || []).map(p => <Badge key={p} variant='secondary' className='font-normal'>{pageName(p)}</Badge>)}</div></td>
                  <td className='px-3 py-2 text-right text-xs whitespace-nowrap text-muted-foreground tabular-nums'>{i === 0 ? week(id) : ''}</td>
                  {canEdit && (
                    <td className='px-2 py-1.5 text-right whitespace-nowrap'>
                      <Button size='icon-sm' variant='ghost' aria-label='Edit' onClick={() => onEdit(a)}><Pencil /></Button>
                      <Button size='icon-sm' variant='ghost' aria-label='Remove from the roster' onClick={() => onRemove(a)}><Trash2 /></Button>
                      {i === byChatter[id].length - 1 && <Button size='icon-sm' variant='ghost' aria-label='Add another shift or overtime' onClick={() => onAdd(id)}><Plus /></Button>}
                    </td>
                  )}
                </tr>
              );
            }))}
          </tbody>
        </table>
      </div>
      {notOn.length > 0 && (
        <p className='text-xs text-muted-foreground'>Not on the roster: {notOn.map(c => c.name).join(', ')}.</p>
      )}
    </section>
  );
}

// Add or edit one usual shift: chatter, shift (all of it or part: overtime), pages, days.
function AssignmentEditor({ data, initial, onClose, onSave }) {
  const a = initial.assignment || null;
  const [chatterId, setChatterId] = useState(a?.chatter_id || initial.chatterId || '');
  const [shiftId, setShiftId] = useState(a?.shift_id || (data.slots || [])[0]?.id || '');
  const slot = (data.slots || []).find(s => s.id === shiftId);
  const parts = partsOf(slot);
  const startFrom = clock(a?.start_time), startTo = clock(a?.end_time);
  const custom = startFrom && !parts.some(p => p.from === startFrom && p.to === startTo) ? { key: 'custom', label: `${startFrom}–${startTo}`, from: startFrom, to: startTo } : null;
  const choices = custom && a?.shift_id === shiftId ? [...parts, custom] : parts;
  const [partKey, setPartKey] = useState(() => (startFrom ? (custom ? 'custom' : parts.find(p => p.from === startFrom)?.key || 'whole') : 'whole'));
  const part = choices.find(c => c.key === partKey) || choices[0];
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
          <DialogDescription>The shift (all of it, or half of it as overtime), the pages they handle in it, and the days.</DialogDescription>
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
          <div className='grid gap-1.5 sm:grid-cols-2 sm:gap-3'>
            <div className='grid gap-1.5'>
              <span className='text-sm font-medium'>Shift</span>
              <Select value={shiftId} onValueChange={(v) => { setShiftId(v); setPartKey('whole'); }}>
                <SelectTrigger id='roster-shift'><SelectValue /></SelectTrigger>
                <SelectContent>{(data.slots || []).map(s => <SelectItem key={s.id} value={s.id}>{s.name} {s.start}–{s.end}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className='grid gap-1.5'>
              <span className='text-sm font-medium'>Hours</span>
              <Select value={partKey} onValueChange={setPartKey}>
                <SelectTrigger id='roster-hours'><SelectValue /></SelectTrigger>
                <SelectContent>{choices.map(c => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
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
            const hours = { start_time: part?.from || null, end_time: part?.to || null };
            await onSave(a ? { shift_id: shiftId, creator_ids: [...pages], weekdays: [...days], ...hours } : { chatter_id: chatterId, shift_id: shiftId, creator_ids: [...pages], weekdays: [...days], ...hours }, a?.id);
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
      const { data } = await api.post('/api/roster/proposal/apply', { assignments: keep.map(r => ({ chatter_id: r.chatter_id, shift_id: r.shift_id, creator_ids: r.creator_ids, weekdays: r.weekdays, start_time: r.start_time || null, end_time: r.end_time || null })) });
      toast.success(`Roster built: ${data.applied} rows`);
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
            {p?.from ? `From the chats ${fmtDay(p.from)} – ${fmtDay(p.to)}: each chatter's shifts and overtime (part of a neighbouring shift), the days they worked them in at least 2 of the 4 weeks, and the pages they handled. ` : ''}
            Untick anything you don&apos;t want. Applying replaces the usual roster; changes for single days stay.
          </DialogDescription>
        </DialogHeader>
        {!p ? (
          <div className='flex items-center gap-2 py-6 text-sm text-muted-foreground'><Loader2 className='size-4 animate-spin' />Reading the last 4 weeks of chats…</div>
        ) : p.error ? (
          <p className='text-sm text-muted-foreground'>{p.error}</p>
        ) : (
          <div className='overflow-x-auto rounded-md border'>
            <table className='w-full min-w-[640px] text-sm'>
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
                  <tr key={`${r.chatter_id}-${r.shift_id}-${r.start_time || 'whole'}`} className={cn('border-b last:border-b-0 align-top', skip.has(i) && 'opacity-50')}>
                    <td className='px-2 py-2'>
                      <Checkbox checked={!skip.has(i)} id={`proposal-${i}`} aria-label={`Include ${r.chatter_name}`}
                        onCheckedChange={() => { const n = new Set(skip); if (n.has(i)) n.delete(i); else n.add(i); setSkip(n); }} />
                    </td>
                    <td className='px-2 py-2 whitespace-nowrap'>
                      {r.shift_name}{r.overtime && <span className='ms-1 text-xs text-warn'>{r.start_time}–{r.end_time} overtime</span>}
                    </td>
                    <td className='px-2 py-2 font-medium'>{r.chatter_name} <span className='text-xs font-normal text-muted-foreground'>· {r.shifts_worked}×</span></td>
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
          <Button disabled={!keep.length || busy || !!p?.error} onClick={apply}>{busy ? 'Applying…' : `Use these ${keep.length} rows`}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
