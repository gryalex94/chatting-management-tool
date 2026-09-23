import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import api from '@/services/api';
import { STATUS_META, avatarColor, initials } from '@/utils/helpers';
import {
  Plus, ArrowRight, ArrowDown, AlertTriangle, Users, Pencil, Scissors, XCircle, MoreHorizontal,
  Clock, Trash2, Calendar, Check, X,
} from 'lucide-react';
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  pointerWithin, rectIntersection, useDraggable, useDroppable,
} from '@dnd-kit/core';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const DAY_LABELS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const DAY_NUMBERS = [1,2,3,4,5,6,7];

function getTodayDayNumber() {
  const jsDay = new Date().getDay();
  return jsDay === 0 ? 7 : jsDay;
}

function getWeekDates() {
  const now = new Date();
  const jsDay = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() + (jsDay === 0 ? -6 : 1 - jsDay));
  return DAY_NUMBERS.map((_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

/* ─── Collision strategy ─────────────────────────────
   Only consider the droppables that make sense for what's being dragged, so the
   ENTIRE target card is a valid landing zone (not a tiny point):
     • dragging a creator → only other cards' merge zones
     • dragging a chatter → only shift slots
   pointerWithin first (cursor inside the area), falling back to rect overlap. */
function collisionStrategy(args) {
  const cur = args.active?.data?.current;
  let containers = args.droppableContainers;
  if (cur?.type === 'creator') {
    containers = containers.filter(c =>
      c.data?.current?.type === 'creator-merge' && c.data?.current?.creatorId !== cur.creator?.id);
  } else {
    containers = containers.filter(c => c.data?.current?.shiftId != null);
  }
  const scoped = { ...args, droppableContainers: containers };
  const hits = pointerWithin(scoped);
  return hits.length ? hits : rectIntersection(scoped);
}

/* ─── Small building blocks ──────────────────────── */

// Initials on a colour derived from the name (the colour is data, not chrome).
function PersonAvatar({ name, className }) {
  return (
    <Avatar className={cn('size-7', className)}>
      <AvatarFallback className='text-[10px] font-semibold text-white' style={{ background: avatarColor(name) }}>
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  );
}

// Coloured dot for a chatter's experience status, label on hover.
function StatusDot({ status, withTooltip = true }) {
  const meta = STATUS_META[status] || STATUS_META.new;
  const dot = <span className='inline-block size-2 shrink-0 rounded-full' style={{ background: meta.color }} aria-label={meta.label} />;
  if (!withTooltip) return dot;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{dot}</TooltipTrigger>
      <TooltipContent>{meta.label}</TooltipContent>
    </Tooltip>
  );
}

/* ─── Draggable Chatter Wrapper ──────────────────── */
function DraggableChatter({ chatter, uniqueId, children }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: uniqueId || `chatter-${chatter.id}`,
    data: { chatter },
  });
  return (
    <div ref={setNodeRef} {...listeners} {...attributes}
      className={cn('cursor-grab', isDragging && 'opacity-30')}>
      {children}
    </div>
  );
}

/* ─── Draggable Creator Card Wrapper ─────────────── */
function DraggableCreatorWrap({ creator, draggingType, children }) {
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: `creator-${creator.id}`,
    data: { creator, type: 'creator' },
  });
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `creator-drop-${creator.id}`,
    data: { creatorId: creator.id, type: 'creator-merge' },
  });

  // Only glow when another CREATOR is dragged over, not chatters
  const showMergeGlow = isOver && draggingType === 'creator';

  return (
    <div ref={node => { setDragRef(node); setDropRef(node); }}
      {...listeners} {...attributes}
      className={cn(
        'cursor-grab rounded-lg transition-[outline-color,box-shadow,opacity] duration-150',
        isDragging && 'opacity-40',
        showMergeGlow && 'shadow-lg outline-2 -outline-offset-2 outline-link',
      )}>
      {children}
    </div>
  );
}

/* ─── Diagonal stripes SVG pattern ───────────────── */
const STRIPE_ID = 'dayoff-stripes';
function StripesPatternDef() {
  // currentColor inside the pattern comes from this svg's text colour.
  return (
    <svg width='0' height='0' className='absolute text-muted-foreground' aria-hidden='true'>
      <defs>
        <pattern id={STRIPE_ID} width='8' height='8' patternUnits='userSpaceOnUse' patternTransform='rotate(45)'>
          <rect width='3' height='8' fill='currentColor' opacity='0.15'/>
        </pattern>
      </defs>
    </svg>
  );
}

/* ─── Chatter Row ────────────────────────────────── */
function ChatterRow({ chatter, onClick, onRemove, isDayOff, isOvertime, coverHours }) {
  const isCover = coverHours != null;
  return (
    <div onClick={onClick}
      className={cn(
        'relative flex cursor-pointer items-center gap-2 overflow-hidden rounded-md border px-2.5 py-2 transition-colors',
        isDayOff ? 'bg-muted'
          : isCover ? 'border-link/40 bg-link/10 hover:border-link/60'
          : isOvertime ? 'border-warn bg-muted/40'
          : 'bg-muted/40 hover:border-foreground/25',
      )}>

      {isDayOff && (
        <svg className='pointer-events-none absolute inset-0 size-full' aria-hidden='true'>
          <rect width='100%' height='100%' fill={`url(#${STRIPE_ID})`}/>
        </svg>
      )}

      <div className='relative z-[1] flex min-w-0 flex-1 items-center gap-2'>
        <div className='relative shrink-0'>
          <PersonAvatar name={chatter.name}/>
          {isDayOff && (
            <span className='absolute -right-1 -bottom-0.5 rounded bg-muted-foreground px-1 text-[7px] leading-tight font-bold whitespace-nowrap text-background ring-2 ring-card'>OFF</span>
          )}
          {isOvertime && !isDayOff && (
            <span className='absolute -right-1 -bottom-0.5 rounded bg-warn px-0.5 text-[7px] leading-tight font-bold text-white ring-2 ring-card'>OT</span>
          )}
        </div>
        <div className='min-w-0 flex-1'>
          <div className='flex min-w-0 items-center gap-1.5'>
            {!isCover && !isDayOff && <StatusDot status={chatter.status}/>}
            <span className={cn(
              'truncate text-[13px]',
              isCover ? 'font-semibold text-link'
                : isDayOff ? 'text-muted-foreground line-through'
                : 'font-medium text-foreground',
            )}>{chatter.name}</span>
          </div>
          <div className={cn('mt-0.5 truncate font-mono text-[11px] tabular-nums', isCover ? 'text-link' : 'text-muted-foreground')}>
            {isCover ? `Cover · ${coverHours}h` : isDayOff ? 'Day off' : isOvertime ? 'Overtime cover' : (chatter.email || '—')}
          </div>
        </div>
      </div>

      <div className='relative z-[1] flex shrink-0 items-center'>
        {onRemove ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant='ghost' size='icon-xs' aria-label={isCover ? 'Remove cover' : 'Unassign'}
                className='text-muted-foreground hover:bg-muted hover:text-bad'
                onClick={e => { e.stopPropagation(); onRemove(); }}>
                <X/>
              </Button>
            </TooltipTrigger>
            <TooltipContent>{isCover ? 'Remove cover' : 'Unassign'}</TooltipContent>
          </Tooltip>
        ) : (
          <ArrowRight className='size-3 text-muted-foreground'/>
        )}
      </div>
    </div>
  );
}

/* ─── Droppable Shift Slot ───────────────────────── */
function ShiftSlot({ shift, chatters, creatorId, onAssign, onAddCover, onClickChatter, onRemove, selectedDay, draggingType }) {
  const droppableId = `slot-${creatorId}-${shift.id}`;
  const { setNodeRef, isOver } = useDroppable({
    id: droppableId,
    data: { creatorId, shiftId: shift.id },
  });

  // Only react to chatter drops, not creator drops
  const dropActive = isOver && draggingType !== 'creator';

  const now = new Date();
  const currentHour = now.getUTCHours();
  const [startH] = (shift.start_time || '10:00').split(':').map(Number);
  const [endH] = (shift.end_time || '18:00').split(':').map(Number);
  const isActive = endH > startH
    ? currentHour >= startH && currentHour < endH
    : currentHour >= startH || currentHour < endH;

  const onSlot = (a) => a.is_active && a.creator_id === creatorId && a.shift_id === shift.id;
  // Regular = standing assignee (no weekday). Cover = placed on THIS weekday, with hours.
  const regulars = chatters.filter(ch => ch.chatter_creator_assignments?.some(a => onSlot(a) && a.day_of_week == null));
  const covers = chatters.map(ch => {
    const a = ch.chatter_creator_assignments?.find(x => onSlot(x) && x.day_of_week === selectedDay);
    return a ? { ch, hours: a.cover_hours } : null;
  }).filter(Boolean);

  const workingRegulars = regulars.filter(ch => (ch.work_days || [1,2,3,4,5]).includes(selectedDay));
  const covered = workingRegulars.length > 0 || covers.length > 0;
  const hasRows = regulars.length > 0 || covers.length > 0;

  return (
    <div ref={setNodeRef}>
      <div className='mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 px-0.5'>
        <span className='text-xs font-medium'>{shift.name}</span>
        <span className='font-mono text-[11px] text-muted-foreground tabular-nums'>
          {shift.start_time?.slice(0,5)} – {shift.end_time?.slice(0,5)}
        </span>
        {isActive && selectedDay === getTodayDayNumber() && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className='size-1.5 rounded-full bg-good' aria-label='On shift now'/>
            </TooltipTrigger>
            <TooltipContent>On shift now</TooltipContent>
          </Tooltip>
        )}
        <div className='ms-auto flex items-center gap-1'>
          {!covered && !dropActive && (
            <span className='text-xs font-medium text-bad'>No one working</span>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant='ghost' size='xs' className='h-6 text-link hover:text-link'
                onClick={() => onAddCover(creatorId, shift.id)}>
                <Plus/>Cover
              </Button>
            </TooltipTrigger>
            <TooltipContent>Add a cover for this day</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {hasRows && (
        <div className='flex flex-col gap-1.5'>
          {regulars.map(ch => {
            const isDayOff = !(ch.work_days || [1,2,3,4,5]).includes(selectedDay);
            return (
              <DraggableChatter key={ch.id} chatter={ch} uniqueId={`chatter-${ch.id}-${creatorId}-${shift.id}`}>
                <ChatterRow chatter={ch} onClick={() => onClickChatter(ch)}
                  onRemove={() => onRemove(ch.id, creatorId, shift.id, null)}
                  isDayOff={isDayOff}/>
              </DraggableChatter>
            );
          })}
          {covers.map(({ ch, hours }) => (
            <ChatterRow key={`cover-${ch.id}`} chatter={ch} onClick={() => onClickChatter(ch)}
              onRemove={() => onRemove(ch.id, creatorId, shift.id, selectedDay)}
              coverHours={hours}/>
          ))}
        </div>
      )}

      {(!hasRows || dropActive) && (
        <div
          onClick={() => !dropActive && onAssign(creatorId, shift.id)}
          className={cn(
            'flex cursor-pointer items-center justify-center gap-1.5 rounded-md border border-dashed text-center text-xs transition-all duration-150',
            hasRows && 'mt-1.5',
            dropActive
              ? 'border-2 border-link bg-link/10 p-4 font-medium text-link'
              : 'p-3 text-muted-foreground hover:bg-muted/40 hover:text-foreground',
          )}>
          {dropActive
            ? <><ArrowDown className='size-3.5'/>Drop here to assign</>
            : 'Drop a chatter here, or click to pick a regular'}
        </div>
      )}
    </div>
  );
}

/* ─── Creator Card Menu ──────────────────────────── */
function CreatorMenu({ creator, mergedCreators, onRename, onSplit, onDeactivate, onManageShifts }) {
  // modal={false} so opening a dialog from an item doesn't leave the page unclickable.
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant='ghost' size='icon-sm' className='shrink-0 text-muted-foreground' aria-label='Page actions'
          onClick={e => e.stopPropagation()}>
          <MoreHorizontal/>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' className='min-w-48'>
        <DropdownMenuItem onClick={e => { e.stopPropagation(); onRename(creator); }}><Pencil/>Rename</DropdownMenuItem>
        <DropdownMenuItem onClick={e => { e.stopPropagation(); onManageShifts(); }}><Clock/>Manage shifts</DropdownMenuItem>
        {mergedCreators.length > 0 && (<>
          <DropdownMenuSeparator/>
          <DropdownMenuLabel className='text-xs font-normal text-muted-foreground'>Split off</DropdownMenuLabel>
          {mergedCreators.map(m => (
            <DropdownMenuItem key={m.id} onClick={e => { e.stopPropagation(); onSplit(m.id, m.name); }}><Scissors/>{m.name}</DropdownMenuItem>
          ))}
        </>)}
        <DropdownMenuSeparator/>
        <DropdownMenuItem variant='destructive' onClick={e => { e.stopPropagation(); onDeactivate(creator); }}><XCircle/>Deactivate</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ─── Creator Card ───────────────────────────────── */
function CreatorCard({ creator, chatters, shifts, onAssign, onAddCover, onClickChatter, onRemove, onSplit, onRename, onDeactivate, mergedCreators, onManageShifts, selectedDay, draggingType }) {
  const memberPages = mergedCreators;                 // pages grouped onto this team
  const isMerged = memberPages.length > 0;
  const groupIds = [creator.id, ...memberPages.map(m => m.id)];
  const assignedChatters = chatters.filter(ch =>
    ch.chatter_creator_assignments?.some(a => a.is_active && groupIds.includes(a.creator_id))
  );
  const pageCount = 1 + memberPages.length;

  return (
    <div className='flex flex-col overflow-hidden rounded-lg border bg-card'>
      <div className='flex items-center gap-3 border-b px-4 py-3'>
        <div className='relative shrink-0'>
          <PersonAvatar name={creator.name} className='size-8'/>
          {isMerged && (
            <span className='absolute -right-1.5 -bottom-0.5 rounded-full bg-primary px-1 text-[9px] leading-tight font-bold text-primary-foreground tabular-nums ring-2 ring-card'>
              +{memberPages.length}
            </span>
          )}
        </div>
        <div className='min-w-0 flex-1'>
          <div className='text-sm font-semibold break-words'>
            {creator.name}
            {isMerged && <span className='font-normal text-muted-foreground'> + {memberPages.map(m => m.name).join(' + ')}</span>}
          </div>
          <div className='mt-0.5 flex gap-2 text-xs text-muted-foreground tabular-nums'>
            <span>{assignedChatters.length} chatters</span>
            {isMerged && <span>· {pageCount} pages</span>}
          </div>
        </div>
        <CreatorMenu creator={creator} mergedCreators={mergedCreators}
          onRename={onRename} onSplit={onSplit} onDeactivate={onDeactivate} onManageShifts={onManageShifts}/>
      </div>
      <div className='flex flex-1 flex-col gap-3 p-3'>
        {shifts.map(shift => (
          <ShiftSlot key={shift.id} shift={shift} chatters={chatters} creatorId={creator.id}
            onAssign={onAssign} onAddCover={onAddCover} onClickChatter={onClickChatter} onRemove={onRemove}
            selectedDay={selectedDay} draggingType={draggingType}/>
        ))}
      </div>
    </div>
  );
}

// A selectable chatter row used in the assign / cover dialogs.
function PickRow({ chatter, selected, onClick, trailing }) {
  const meta = STATUS_META[chatter.status];
  return (
    <button type='button' onClick={onClick} aria-pressed={selected}
      className={cn(
        'flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left transition-colors',
        selected ? 'border-link/40 bg-link/10' : 'bg-muted/40 hover:border-link/40 hover:bg-link/5',
      )}>
      <PersonAvatar name={chatter.name}/>
      <div className='min-w-0 flex-1'>
        <div className='truncate text-sm font-medium'>{chatter.name}</div>
        <div className='mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground'>
          <StatusDot status={chatter.status} withTooltip={false}/>{meta?.label}
        </div>
      </div>
      {trailing}
    </button>
  );
}

/* ─── Assign Modal ───────────────────────────────── */
function AssignModal({ chatters, shifts, targetCreatorId, targetShiftId, creators, onAssign, onClose }) {
  const unassigned = chatters.filter(ch => !ch.chatter_creator_assignments?.some(a => a.is_active));
  const creatorName = creators.find(c => c.id === targetCreatorId)?.name || '';
  const shiftName = shifts.find(s => s.id === targetShiftId)?.name || '';
  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>Assign to {creatorName}</DialogTitle>
          <DialogDescription>{shiftName} shift</DialogDescription>
        </DialogHeader>
        {unassigned.length === 0 ? (
          <div className='rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground'>All chatters are already assigned.</div>
        ) : (
          <div className='grid gap-2'>
            <div className='text-xs font-medium text-muted-foreground'>Unassigned chatters</div>
            <div className='-mx-1 flex max-h-[50vh] flex-col gap-1.5 overflow-y-auto px-1'>
              {unassigned.map(ch => (
                <PickRow key={ch.id} chatter={ch} onClick={() => onAssign(ch.id, targetCreatorId, targetShiftId)}
                  trailing={<Plus className='size-4 text-link'/>}/>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ─── Add Cover Modal ────────────────────────────── */
function CoverModal({ target, chatters, creators, shifts, onAdd, onClose }) {
  const [chatterId, setChatterId] = useState(null);
  const [hours, setHours] = useState(4);
  const [q, setQ] = useState('');
  const creatorName = creators.find(c => c.id === target.creatorId)?.name || '';
  const shiftName = shifts.find(s => s.id === target.shiftId)?.name || '';
  const dayLabel = DAY_LABELS[target.dayOfWeek - 1];
  const list = chatters.filter(c => c.name.toLowerCase().includes(q.trim().toLowerCase()));
  const canAdd = chatterId && hours > 0;
  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>Add cover for {creatorName}</DialogTitle>
          <DialogDescription>{shiftName} · every {dayLabel}</DialogDescription>
        </DialogHeader>
        <div className='grid gap-3'>
          <Input value={q} onChange={e => setQ(e.target.value)} autoFocus placeholder='Search chatter…' aria-label='Search chatter'/>
          <div className='-mx-1 flex max-h-[40vh] flex-col gap-1.5 overflow-y-auto px-1'>
            {list.map(ch => (
              <PickRow key={ch.id} chatter={ch} selected={chatterId === ch.id} onClick={() => setChatterId(ch.id)}
                trailing={chatterId === ch.id ? <Check className='size-4 text-link'/> : null}/>
            ))}
          </div>
          <div className='flex items-center gap-2'>
            <Label htmlFor='cover-hours'>Hours</Label>
            <Input id='cover-hours' type='number' min={1} max={16} step={0.5} value={hours}
              onChange={e => setHours(parseFloat(e.target.value) || 0)} className='w-20 tabular-nums'/>
          </div>
        </div>
        <DialogFooter>
          <Button variant='ghost' onClick={onClose}>Cancel</Button>
          <Button disabled={!canAdd}
            onClick={() => onAdd(chatterId, target.creatorId, target.shiftId, target.dayOfWeek, hours)}>Add cover</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Rename Modal ───────────────────────────────── */
function RenameModal({ creator, onSave, onClose }) {
  const [name, setName] = useState(creator.name);
  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className='sm:max-w-sm'>
        <DialogHeader>
          <DialogTitle>Rename creator</DialogTitle>
        </DialogHeader>
        <div className='grid gap-2'>
          <Label htmlFor='rename-creator'>Name</Label>
          <Input id='rename-creator' value={name} onChange={e => setName(e.target.value)} autoFocus
            onKeyDown={e => { if (e.key === 'Enter' && name.trim()) onSave(creator.id, name.trim()); }}/>
        </div>
        <DialogFooter>
          <Button variant='ghost' onClick={onClose}>Cancel</Button>
          <Button onClick={() => name.trim() && onSave(creator.id, name.trim())}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Manage Shifts Modal ────────────────────────── */
const TIME_INPUT = 'tabular-nums dark:[color-scheme:dark]';

function TimeRange({ idPrefix, start, end, onStart, onEnd }) {
  return (
    <div className='grid grid-cols-[1fr_auto_1fr] items-end gap-2'>
      <div className='grid gap-1.5'>
        <Label htmlFor={`${idPrefix}-start`} className='text-xs text-muted-foreground'>Start</Label>
        <Input id={`${idPrefix}-start`} type='time' value={start} onChange={e => onStart(e.target.value)} className={TIME_INPUT}/>
      </div>
      <ArrowRight className='mb-2.5 size-4 text-muted-foreground'/>
      <div className='grid gap-1.5'>
        <Label htmlFor={`${idPrefix}-end`} className='text-xs text-muted-foreground'>End</Label>
        <Input id={`${idPrefix}-end`} type='time' value={end} onChange={e => onEnd(e.target.value)} className={TIME_INPUT}/>
      </div>
    </div>
  );
}

function ShiftsModal({ shifts, creatorId, onSave, onDelete, onCreate, onClose }) {
  const [edited, setEdited] = useState(shifts.map(s => ({ ...s })));
  const [newShift, setNewShift] = useState({ name: '', start_time: '00:00', end_time: '08:00' });
  const [showNew, setShowNew] = useState(false);
  function updateField(idx, field, value) {
    setEdited(prev => { const copy = [...prev]; copy[idx] = { ...copy[idx], [field]: value }; return copy; });
  }

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>Manage shifts</DialogTitle>
          <DialogDescription>Edit shift names and times, or add new ones.</DialogDescription>
        </DialogHeader>
        <div className='-mx-1 max-h-[60vh] overflow-y-auto px-1'>
          <div className='flex flex-col gap-3'>
            {edited.map((shift, idx) => (
              <div key={shift.id} className='grid gap-2 rounded-lg border bg-muted/40 p-3'>
                <div className='flex items-center gap-2'>
                  <Input value={shift.name} onChange={e => updateField(idx, 'name', e.target.value)}
                    className='flex-1 font-semibold' placeholder='Shift name' aria-label='Shift name'/>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant='ghost' size='icon-sm' aria-label='Delete shift'
                        className='text-muted-foreground hover:text-bad'
                        onClick={() => { if (window.confirm(`Delete "${shift.name}"?`)) onDelete(shift.id); }}>
                        <Trash2/>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Delete shift</TooltipContent>
                  </Tooltip>
                </div>
                <TimeRange idPrefix={`shift-${shift.id}`}
                  start={shift.start_time?.slice(0,5)||'00:00'} end={shift.end_time?.slice(0,5)||'08:00'}
                  onStart={v => updateField(idx,'start_time',v+':00')} onEnd={v => updateField(idx,'end_time',v+':00')}/>
              </div>
            ))}
          </div>
          {showNew ? (
            <div className='mt-3 grid gap-2 rounded-lg border border-dashed bg-muted/40 p-3'>
              <Label htmlFor='new-shift-name'>New shift</Label>
              <Input id='new-shift-name' value={newShift.name} onChange={e => setNewShift(p => ({ ...p, name: e.target.value }))}
                placeholder='e.g. Rotating, Night' autoFocus/>
              <TimeRange idPrefix='new-shift' start={newShift.start_time} end={newShift.end_time}
                onStart={v => setNewShift(p => ({ ...p, start_time: v }))} onEnd={v => setNewShift(p => ({ ...p, end_time: v }))}/>
              <div className='mt-1 flex justify-end gap-2'>
                <Button variant='ghost' size='sm' onClick={() => setShowNew(false)}>Cancel</Button>
                <Button size='sm'
                  onClick={() => { if (!newShift.name.trim()) return toast.error('Name required');
                    onCreate(newShift.name.trim(), newShift.start_time+':00', newShift.end_time+':00', creatorId);
                    setNewShift({ name:'', start_time:'00:00', end_time:'08:00' }); setShowNew(false); }}>Add</Button>
              </div>
            </div>
          ) : (
            <Button variant='outline' className='mt-3 w-full' onClick={() => setShowNew(true)}><Plus/>Add shift</Button>
          )}
        </div>
        <DialogFooter>
          <Button variant='ghost' onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSave(edited)}>Save changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Week Day Bar ───────────────────────────────── */
function WeekBar({ selectedDay, onSelect }) {
  const today = getTodayDayNumber();
  const weekDates = getWeekDates();
  return (
    <div className='flex gap-1'>
      {DAY_LABELS.map((label, i) => {
        const dayNum = DAY_NUMBERS[i];
        const isSelected = dayNum === selectedDay;
        const isToday = dayNum === today;
        const dateStr = weekDates[i].getDate();
        return (
          <button key={dayNum} type='button' onClick={() => onSelect(dayNum)} aria-pressed={isSelected}
            className={cn(
              'relative min-w-0 flex-1 rounded-md border py-2 text-center text-xs transition-colors',
              isSelected
                ? 'border-primary bg-primary font-semibold text-primary-foreground'
                : 'bg-card font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground',
            )}>
            <div>{label}</div>
            <div className='mt-0.5 font-mono text-[10px] tabular-nums opacity-70'>{dateStr}</div>
            {isToday && (
              <>
                <span className={cn('absolute top-1 right-1 size-1.5 rounded-full', isSelected ? 'bg-primary-foreground' : 'bg-good')}/>
                <span className='sr-only'>(today)</span>
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ─── Main Page ──────────────────────────────────── */
export default function CreatorsPage() {
  // eslint-disable-next-line no-unused-vars
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [creators, setCreators] = useState([]);
  const [chatters, setChatters] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [assignTarget, setAssignTarget] = useState(null);
  const [activeChatter, setActiveChatter] = useState(null);
  const [activeCreator, setActiveCreator] = useState(null);
  const [mergePrompt, setMergePrompt] = useState(null);
  const [renameTarget, setRenameTarget] = useState(null);
  const [shiftsCreatorId, setShiftsCreatorId] = useState(null);
  const [coverTarget, setCoverTarget] = useState(null);
  const [selectedDay, setSelectedDay] = useState(getTodayDayNumber());
  const [draggingType, setDraggingType] = useState(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const load = useCallback(async () => {
    try {
      const [cr, ch, sh] = await Promise.all([
        api.get('/api/creators'),
        api.get('/api/chatters'),
        api.get('/api/shifts'),
      ]);
      setCreators(cr.data);
      setChatters(ch.data);
      setShifts(sh.data);
    } catch (err) { console.error(err?.message || err?.toString?.()); }
    finally { setLoading(false); }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  function handleOpenAssign(creatorId, shiftId) { setAssignTarget({ creatorId, shiftId }); }

  async function handleAssign(chatterId, creatorId, shiftId) {
    try { await api.post(`/api/chatters/${chatterId}/assign`, { creatorId, shiftId });
      toast.success('Chatter assigned!'); setAssignTarget(null); load();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to assign'); }
  }

  function handleClickChatter(chatter) { navigate(`/chatters/${chatter.id}`); }

  function handleOpenCover(creatorId, shiftId) { setCoverTarget({ creatorId, shiftId, dayOfWeek: selectedDay }); }

  async function handleAddCover(chatterId, creatorId, shiftId, dayOfWeek, coverHours) {
    try { await api.post(`/api/chatters/${chatterId}/assign`, { creatorId, shiftId, dayOfWeek, coverHours });
      toast.success('Cover added!'); setCoverTarget(null); load();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to add cover'); }
  }

  async function handleRemove(chatterId, creatorId, shiftId, dayOfWeek) {
    try { await api.post(`/api/chatters/${chatterId}/unassign`, { creatorId, shiftId, dayOfWeek });
      toast.success(dayOfWeek != null ? 'Cover removed' : 'Chatter unassigned'); load();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to unassign'); }
  }

  async function confirmMerge() {
    if (!mergePrompt) return;
    try { await api.post(`/api/creators/${mergePrompt.targetId}/merge`, { sourceId: mergePrompt.sourceId });
      toast.success('Creators merged!'); setMergePrompt(null); load();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to merge'); }
  }

  async function handleSplit(sourceId, sourceName) {
    if (!window.confirm(`Split "${sourceName}" back into its own card?`)) return;
    try { await api.post(`/api/creators/${sourceId}/split`); toast.success(`${sourceName} is back!`); load();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to split'); }
  }

  async function handleRename(creatorId, newName) {
    try { await api.put(`/api/creators/${creatorId}`, { name: newName }); toast.success('Renamed'); setRenameTarget(null); load();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
  }


  async function handleDeactivate(creator) {
    if (!window.confirm(`Deactivate "${creator.name}"?`)) return;
    try { await api.put(`/api/creators/${creator.id}`, { is_active: false }); toast.success('Deactivated'); load();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
  }

  async function handleSaveShifts(editedShifts) {
    try { await Promise.all(editedShifts.map(s => api.put(`/api/shifts/${s.id}`, { name: s.name, start_time: s.start_time, end_time: s.end_time })));
      toast.success('Shifts updated'); setShiftsCreatorId(null); load();
    } catch { toast.error('Failed'); }
  }

  async function handleDeleteShift(shiftId) {
    try { await api.delete(`/api/shifts/${shiftId}`); toast.success('Deleted'); setShiftsCreatorId(null); load();
    } catch { toast.error('Failed'); }
  }

  async function handleCreateShift(name, startTime, endTime, creatorId) {
    try { await api.post('/api/shifts', { name, start_time: startTime, end_time: endTime, creatorId }); toast.success(`"${name}" created`); load();
    } catch { toast.error('Failed'); }
  }

  function handleDragStart(event) {
    const data = event.active.data.current;
    if (data?.chatter) { setActiveChatter(data.chatter); setDraggingType('chatter'); }
    else if (data?.type === 'creator') { setActiveCreator(data.creator); setDraggingType('creator'); }
  }

  function clearDrag() { setActiveChatter(null); setActiveCreator(null); setDraggingType(null); }

  async function handleDragEnd(event) {
    setActiveChatter(null);
    setActiveCreator(null);
    setDraggingType(null);
    const { active, over } = event;
    if (!over) return;
    const activeData = active.data.current;
    const overData = over.data.current;

    // Creator → Creator merge
    if (activeData?.type === 'creator' && overData?.type === 'creator-merge') {
      if (activeData.creator.id !== overData.creatorId)
        setMergePrompt({ sourceId: activeData.creator.id, targetId: overData.creatorId });
      return;
    }

    // Creator dragged onto a shift slot — ignore
    if (activeData?.type === 'creator') return;

    // Chatter → Shift slot assign
    const chatter = activeData?.chatter;
    if (!chatter || !overData?.creatorId || !overData?.shiftId) return;
    if (chatter.chatter_creator_assignments?.some(a => a.is_active && a.creator_id === overData.creatorId && a.shift_id === overData.shiftId)) return;

    try { await api.post(`/api/chatters/${chatter.id}/assign`, { creatorId: overData.creatorId, shiftId: overData.shiftId });
      toast.success(`${chatter.name} assigned!`); load();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
  }

  const unassigned = chatters.filter(ch => !ch.chatter_creator_assignments?.some(a => a.is_active));
  const assignedCount = chatters.length - unassigned.length;
  const offCount = chatters.filter(ch => {
    const wd = ch.work_days || [1,2,3,4,5];
    return !wd.includes(selectedDay) && ch.chatter_creator_assignments?.some(a => a.is_active);
  }).length;

  // Group pages into teams: a primary page (no merged_into) holds the team card,
  // and any pages tagged into it are its members. One card per team.
  const primaries = creators.filter(c => !c.merged_into);
  const membersByPrimary = {};
  creators.forEach(c => { if (c.merged_into) (membersByPrimary[c.merged_into] ||= []).push(c); });

  const header = (
    <div className='flex flex-wrap items-end justify-between gap-x-4 gap-y-2'>
      <div className='min-w-0 max-w-2xl'>
        <h2 className='text-2xl font-bold tracking-tight'>Shifts overview</h2>
        <p className='text-muted-foreground'>
          Pick a day to see who's working. Drag chatters into shifts, or drag one page onto another to put them on the same team.
        </p>
      </div>
      {!loading && (
        <div className='flex flex-wrap items-center gap-1.5'>
          <Badge variant='outline' className='tabular-nums'><Users/>{primaries.length} teams · {creators.length} pages</Badge>
          <Badge variant='outline' className='border-good/30 text-good tabular-nums'>{assignedCount}/{chatters.length} assigned</Badge>
          {offCount > 0 && <Badge variant='outline' className='border-warn/40 text-warn tabular-nums'><Calendar/>{offCount} off {DAY_LABELS[selectedDay - 1]}</Badge>}
          {unassigned.length > 0 && <Badge variant='outline' className='border-bad/40 bg-bad/10 text-bad tabular-nums'><AlertTriangle/>{unassigned.length} unassigned</Badge>}
        </div>
      )}
    </div>
  );

  if (loading) return (
    <div className='flex flex-col gap-4 sm:gap-6'>
      {header}
      <div className='flex gap-1'>{DAY_NUMBERS.map(d => <Skeleton key={d} className='h-12 flex-1'/>)}</div>
      <div className='grid grid-cols-[repeat(auto-fill,minmax(min(100%,340px),1fr))] gap-4'>
        {[0, 1, 2].map(i => (
          <div key={i} className='overflow-hidden rounded-lg border bg-card'>
            <div className='flex items-center gap-3 border-b px-4 py-3'>
              <Skeleton className='size-8 rounded-full'/>
              <div className='flex-1 space-y-1.5'><Skeleton className='h-4 w-1/2'/><Skeleton className='h-3 w-1/4'/></div>
            </div>
            <div className='space-y-2 p-3'>
              <Skeleton className='h-3 w-1/3'/><Skeleton className='h-11 w-full'/><Skeleton className='h-11 w-full'/>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <DndContext sensors={sensors} collisionDetection={collisionStrategy} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={clearDrag}>
    <StripesPatternDef/>
    <div className='flex flex-col gap-4 sm:gap-6'>
      {header}

      <WeekBar selectedDay={selectedDay} onSelect={setSelectedDay}/>

      {creators.length === 0 ? (
        <div className='flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground'>
          <p className='font-medium text-foreground'>No creators yet</p>
          <p>Add your creators in Settings first.</p>
        </div>
      ) : (
        <div className='grid grid-cols-[repeat(auto-fill,minmax(min(100%,340px),1fr))] gap-4'>
          {primaries.map(cr => (
            <DraggableCreatorWrap key={cr.id} creator={cr} draggingType={draggingType}>
              <CreatorCard creator={cr} chatters={chatters}
                shifts={shifts.filter(s => s.creator_id === cr.id)}
                onAssign={handleOpenAssign} onAddCover={handleOpenCover} onClickChatter={handleClickChatter}
                onRemove={handleRemove} onSplit={handleSplit}
                onRename={c => setRenameTarget(c)} onDeactivate={handleDeactivate}
                mergedCreators={membersByPrimary[cr.id] || []}
                onManageShifts={() => setShiftsCreatorId(cr.id)}
                selectedDay={selectedDay} draggingType={draggingType}/>
            </DraggableCreatorWrap>
          ))}
        </div>
      )}

      {unassigned.length > 0 && (
        <section className='overflow-hidden rounded-lg border bg-card'>
          <div className='flex flex-wrap items-center gap-x-2 gap-y-1 border-b bg-muted/40 px-4 py-2.5 text-sm font-medium'>
            Unassigned chatters
            <Badge variant='outline' className='h-5 rounded-full border-warn/40 px-1.5 font-mono text-xs text-warn'>{unassigned.length}</Badge>
            <span className='text-xs font-normal text-muted-foreground'>{unassigned.length} not assigned. Drag one onto a shift to assign.</span>
          </div>
          <div className='grid grid-cols-[repeat(auto-fill,minmax(min(100%,240px),1fr))] gap-2 p-3'>
            {unassigned.map(ch => (
              <DraggableChatter key={ch.id} chatter={ch}>
                <ChatterRow chatter={ch} onClick={() => handleClickChatter(ch)}/>
              </DraggableChatter>
            ))}
          </div>
        </section>
      )}

      {assignTarget && <AssignModal chatters={chatters} shifts={shifts} creators={creators}
        targetCreatorId={assignTarget.creatorId} targetShiftId={assignTarget.shiftId}
        onAssign={handleAssign} onClose={() => setAssignTarget(null)}/>}

      {coverTarget && <CoverModal target={coverTarget} chatters={chatters} creators={creators} shifts={shifts}
        onAdd={handleAddCover} onClose={() => setCoverTarget(null)}/>}

      {mergePrompt && (
        <Dialog open onOpenChange={open => { if (!open) setMergePrompt(null); }}>
          <DialogContent className='sm:max-w-md'>
            <DialogHeader>
              <DialogTitle>Merge creators</DialogTitle>
              <DialogDescription>You can undo this later with Split in the card's menu.</DialogDescription>
            </DialogHeader>
            <p className='text-sm leading-relaxed'>
              Merge <strong>{creators.find(c => c.id === mergePrompt.sourceId)?.name}</strong> into{' '}
              <strong>{creators.find(c => c.id === mergePrompt.targetId)?.name}</strong>?
            </p>
            <DialogFooter>
              <Button variant='ghost' onClick={() => setMergePrompt(null)}>Cancel</Button>
              <Button onClick={confirmMerge}>Merge</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {renameTarget && <RenameModal creator={renameTarget} onSave={handleRename} onClose={() => setRenameTarget(null)}/>}
      {shiftsCreatorId && <ShiftsModal
        shifts={shifts.filter(s => s.creator_id === shiftsCreatorId)}
        creatorId={shiftsCreatorId}
        onSave={handleSaveShifts}
        onDelete={handleDeleteShift}
        onCreate={handleCreateShift}
        onClose={() => setShiftsCreatorId(null)}/>}
    </div>

    <DragOverlay dropAnimation={null}>
      {activeChatter ? (
        <div className='flex w-[220px] -rotate-[1.5deg] cursor-grabbing items-center gap-2 rounded-md border-2 border-link bg-card px-3 py-2 shadow-xl'>
          <PersonAvatar name={activeChatter.name}/>
          <div className='truncate text-[13px] font-semibold'>{activeChatter.name}</div>
        </div>
      ) : activeCreator ? (
        <div className='flex w-[300px] -rotate-[1.5deg] cursor-grabbing items-center gap-3 rounded-lg border-2 border-link bg-card px-4 py-3 shadow-2xl'>
          <PersonAvatar name={activeCreator.name} className='size-8'/>
          <div className='min-w-0 flex-1'>
            <div className='truncate text-sm font-semibold'>{activeCreator.name}</div>
            <div className='flex items-center gap-1 text-xs font-medium text-link'>Drop on a page to team up<ArrowRight className='size-3'/></div>
          </div>
        </div>
      ) : null}
    </DragOverlay>
    </DndContext>
  );
}
