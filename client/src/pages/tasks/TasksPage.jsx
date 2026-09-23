import { useState, useEffect, useCallback } from 'react';
import {
  Archive, Bookmark, BookmarkCheck, ChevronRight, CircleCheck, CircleX, Clock, Copy,
  Inbox, MoreHorizontal, Plus, RotateCcw, Star, X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/services/api';
import { useAuth } from '@/context/AuthContext';
import { isDemoMode } from '@/utils/privacy';
import { TIER, reasonLabel, fmtSentAt, areaMeta } from '@/utils/taskMeta';
import { cn } from '@/lib/utils';
import DismissModal from '@/components/shared/DismissModal';
import { FacetedFilter } from '@/components/data-table/FacetedFilter';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtDay = (d) => { if (!d || d === 'unknown') return 'Undated'; const [y, m, day] = d.split('-'); return `${+day} ${MONTHS[+m - 1]} ${y}`; };
// Group completed/dismissed tasks by the day they were actioned, newest day first.
function groupByDay(list) {
  const map = new Map();
  for (const t of list) { const d = (t.completed_at || t.updated_at || '').slice(0, 10) || 'unknown'; if (!map.has(d)) map.set(d, []); map.get(d).push(t); }
  return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]))
    .map(([day, ts]) => ({ day, ts: ts.sort((x, y) => (y.completed_at || y.updated_at || '').localeCompare(x.completed_at || x.updated_at || '')) }));
}

const copy = (t) => { try { navigator.clipboard?.writeText(t); toast.success('Copied'); } catch { /* ignore */ } };

const TABS = [
  { key: 'open', label: 'Open', statuses: ['open'] },
  { key: 'taken', label: 'Taken', statuses: ['taken'] },
  { key: 'completed', label: 'Completed', statuses: ['completed'] },
  { key: 'dismissed', label: 'Dismissed', statuses: ['dismissed'] },
  { key: 'archived', label: 'Archived', statuses: ['archived'] },
];

const GROUPS = [['none', 'No grouping'], ['page', 'Group by page'], ['chatter', 'Group by chatter']];

// Bucket the already-priority-sorted list by page or chatter. Groups are ordered
// by their most urgent task (lowest priority number), so the spirit of the AI
// ranking carries up to the group level too. When grouping by chatter, the
// page-level bucket (tasks tied to no one) is always pinned to the very bottom.
const PAGE_BUCKET = 'Page-level (no chatter)';
function buildGroups(list, groupBy) {
  const keyOf = (t) => groupBy === 'page'
    ? (t.creator_name || 'Unassigned page')
    : (t.chatter_name || PAGE_BUCKET);
  const map = new Map();
  for (const t of list) { const k = keyOf(t); if (!map.has(k)) map.set(k, []); map.get(k).push(t); }
  return [...map.entries()]
    .map(([name, ts]) => ({ name, ts, top: Math.min(...ts.map(t => t.priority || 7)), pinLast: name === PAGE_BUCKET }))
    .sort((a, b) => (a.pinLast - b.pinLast) || (a.top - b.top) || (b.ts.length - a.ts.length) || a.name.localeCompare(b.name));
}

function fmtActioned(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
}

// Tag for a kept-waiting fan (matches the tier vocabulary from computeChatterMetrics).
function tierTag(s) {
  if (s.tier === 'new_sub') return { label: 'New sub', c: '#ec4899' };
  if (s.tier === 'whale') return { label: `Whale $${s.spend}`, c: '#8b5cf6' };
  if (s.tier === 'spender') return { label: `Spender $${s.spend}`, c: '#3b82f6' };
  return { label: s.tier ? s.tier.replace('_', ' ') : 'Fan', c: 'var(--muted-foreground)' };
}
const tint = (c) => ({ color: c, background: `color-mix(in oklch, ${c} 12%, transparent)`, borderColor: `color-mix(in oklch, ${c} 30%, transparent)` });

// Per-task checklist: which sub-rows the manager has reviewed. Persisted in
// localStorage keyed by the task id, so ticks survive navigation.
function useChecklist(storeKey) {
  const [done, setDone] = useState(() => { try { return new Set(JSON.parse(localStorage.getItem(storeKey) || '[]')); } catch { return new Set(); } });
  const toggle = (k) => setDone(prev => {
    const next = new Set(prev);
    if (next.has(k)) next.delete(k); else next.add(k);
    try { localStorage.setItem(storeKey, JSON.stringify([...next])); } catch { /* ignore */ }
    return next;
  });
  return [done, toggle];
}

/* ─── Small building blocks ─────────────────────────────────────────────── */

function PriorityBadge({ priority }) {
  const t = TIER[priority] || TIER[7];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant='outline' className='gap-1.5 font-mono'>
          <span className='size-2 rounded-full' style={{ background: t.c }} />{t.label}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>{t.name}</TooltipContent>
    </Tooltip>
  );
}

const SEVERITY_CLASS = {
  critical: 'border-bad/40 bg-bad/10 text-bad',
  high: 'border-bad/30 text-bad',
  medium: 'border-warn/40 text-warn',
  low: 'text-muted-foreground',
};
function SeverityBadge({ severity }) {
  if (!severity) return null;
  return <Badge variant='outline' className={cn('capitalize', SEVERITY_CLASS[severity])}>{severity}</Badge>;
}

function AreaBadge({ area }) {
  if (!area) return null;
  const am = areaMeta(area);
  return (
    <Badge variant='secondary' className='gap-1.5 font-normal'>
      <span className='size-1.5 rounded-full' style={{ background: am.c }} />{am.label}
    </Badge>
  );
}

// A fan's username: click copies it (the nickname shows on hover).
function FanChip({ username, nickname, className }) {
  const value = username || nickname;
  if (!value) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type='button' onClick={() => copy(value)}
          className={cn('inline-flex items-center gap-1 rounded-md border bg-background px-1.5 py-0.5 font-mono text-xs text-foreground transition-colors hover:bg-accent', className)}>
          {value}<Copy className='size-3 opacity-40' />
        </button>
      </TooltipTrigger>
      <TooltipContent>{nickname && username ? `${nickname} · click to copy` : 'Click to copy'}</TooltipContent>
    </Tooltip>
  );
}

const TimeStamp = ({ children }) => (
  <span className='inline-flex items-center gap-1 text-xs font-medium text-link'><Clock className='size-3' />{children}</span>
);

// Collapsible, checkable list of sub-rows (fans kept waiting / AFK gaps).
function ReviewList({ label, doneLabel, count, defaultOpen, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className='mt-3'>
      <CollapsibleTrigger asChild>
        <Button variant='ghost' size='sm' className='-ms-2 h-7 px-2 text-muted-foreground'>
          <ChevronRight className={cn('transition-transform', open && 'rotate-90')} />
          {doneLabel || label}
          <span className='text-xs opacity-70'>({count})</span>
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className='mt-1.5 space-y-1.5'>{children}</CollapsibleContent>
    </Collapsible>
  );
}

function ReviewRow({ done, onToggle, children }) {
  return (
    <div className={cn('flex gap-3 rounded-md border bg-muted/40 px-3 py-2', done && 'opacity-50')}>
      <Checkbox checked={done} onCheckedChange={onToggle} className='mt-0.5' aria-label='Mark reviewed' />
      <div className='min-w-0 flex-1 space-y-1'>{children}</div>
    </div>
  );
}

// Reply-time tasks carry a per-subscriber breakdown in context.subs. Each fan is
// its own reviewable, checkable row: username (click-to-copy), tier, PAGE (a
// chatter's subs span several pages), worst wait, when, and the message.
function ReplyTimeSubs({ subs, workload, taskId }) {
  const [done, toggle] = useChecklist(`replyDone:${taskId}`);
  return (
    <ReviewList count={subs.length} defaultOpen={subs.length <= 4}
      label={`Fans kept waiting${workload ? ` · workload: ${workload}` : ''}`}
      doneLabel={done.size ? `${done.size} of ${subs.length} reviewed` : null}>
      {subs.map((s, i) => {
        const tag = tierTag(s);
        const key = s.fan_username || String(i);
        return (
          <ReviewRow key={key} done={done.has(key)} onToggle={() => toggle(key)}>
            <div className='flex flex-wrap items-center gap-2'>
              <FanChip username={s.fan_username} nickname={s.fan_nickname} className={done.has(key) ? 'line-through' : ''} />
              <Badge variant='outline' className='capitalize' style={tint(tag.c)}>{tag.label}</Badge>
              {s.page && <Badge variant='secondary' className='font-normal'>{s.page}</Badge>}
              <span className='text-xs font-semibold text-bad'>{s.worst_reply_min}m wait</span>
              {s.worst_time && <TimeStamp>{s.worst_time}</TimeStamp>}
              {s.count > 1 && <span className='text-xs text-muted-foreground'>×{s.count} times</span>}
            </div>
            {s.worst_fan_message && <p className='text-xs italic text-muted-foreground'>Fan: “{s.worst_fan_message}”</p>}
          </ReviewRow>
        );
      })}
    </ReviewList>
  );
}

// AFK tasks carry context.incidents — each gap with its bracketing times, who the
// chatter resumed with, and the fans left waiting. Point the manager to the spot.
function AfkIncidents({ incidents, taskId }) {
  const [done, toggle] = useChecklist(`afkDone:${taskId}`);
  return (
    <ReviewList count={incidents.length} defaultOpen={incidents.length <= 3} label='AFK gaps, where to look'
      doneLabel={done.size ? `${done.size} of ${incidents.length} reviewed` : null}>
      {incidents.map((g, i) => (
        <ReviewRow key={i} done={done.has(String(i))} onToggle={() => toggle(String(i))}>
          <div className='flex flex-wrap items-center gap-2'>
            <span className='text-xs font-semibold text-bad'>{g.gap_minutes}m gap</span>
            <TimeStamp>{g.from_time} → {g.to_time}</TimeStamp>
            {g.page && <Badge variant='secondary' className='font-normal'>{g.page}</Badge>}
          </div>
          {g.before_message && (
            <div className='flex flex-wrap items-baseline gap-1.5 text-xs text-muted-foreground'>
              <span>Before the gap</span><FanChip username={g.before_username} />
              <span className='italic'>“{g.before_message}”</span>
            </div>
          )}
          {g.resumed_message && (
            <div className='flex flex-wrap items-baseline gap-1.5 text-xs text-muted-foreground'>
              <span>Resumed</span><FanChip username={g.resumed_username} />
              <span className='italic'>“{g.resumed_message}”</span>
            </div>
          )}
          {Array.isArray(g.waiting_fans) && g.waiting_fans.length > 0 && (
            <div className='flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground'>
              <span>Waiting:</span>
              {g.waiting_fans.map((f, j) => (
                <span key={j} className='inline-flex items-center gap-1'>
                  <FanChip username={f.username} nickname={f.fan} />
                  <span className='font-semibold text-bad'>{f.waited_min}m</span>
                </span>
              ))}
            </div>
          )}
        </ReviewRow>
      ))}
    </ReviewList>
  );
}

/* ─── One task ──────────────────────────────────────────────────────────── */

const ACTIONED = {
  completed: { icon: CircleCheck, verb: 'Completed' },
  dismissed: { icon: CircleX, verb: 'Dismissed' },
  archived: { icon: Inbox, verb: 'Archived' },
};

function TaskRow({ task, onAction }) {
  const isCustom = task.source_type === 'custom';
  const ctx = task.context || {};
  const live = task.status === 'open' || task.status === 'taken';
  const dismissed = task.status === 'dismissed';
  const actioned = ACTIONED[task.status];
  // Every fan the task refers to, each with their own username + time.
  const fans = (ctx.fans && ctx.fans.length) ? ctx.fans
    : (task.fan_username ? [{ username: task.fan_username, sent_at: ctx.sent_at }] : []);
  const where = [task.creator_name, task.chatter_name].filter(Boolean).join(' · ');

  return (
    <div className={cn('flex flex-col gap-3 p-4 sm:flex-row sm:gap-6', isCustom && 'border-l-2 border-l-warn bg-warn/5')}>
      <div className='min-w-0 flex-1'>
        <div className='flex flex-wrap items-center gap-1.5'>
          {isCustom ? (
            <Badge className='gap-1 bg-warn text-white'>{ctx.important && <Star className='fill-current' />}Custom</Badge>
          ) : (
            <>
              <PriorityBadge priority={task.priority} />
              <SeverityBadge severity={task.severity} />
              <AreaBadge area={task.area} />
            </>
          )}
          {!isCustom && task.days_open > 1 && (
            <Badge variant='outline' className='border-warn/40 text-warn'>{task.days_open} days open</Badge>
          )}
        </div>

        {(where || fans.length > 0 || (isCustom && ctx.assigned_to_name)) && (
          <div className='mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm'>
            {where && <span className='font-medium'>{where}</span>}
            {isCustom && ctx.assigned_to_name && <span className='text-muted-foreground'>for <span className='font-medium text-foreground'>{ctx.assigned_to_name}</span></span>}
            {fans.map((f, fi) => (
              <span key={f.username || f.nickname || fi} className='inline-flex items-center gap-1.5'>
                <FanChip username={f.username} nickname={f.nickname} />
                {f.spend != null && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className={cn('text-xs font-semibold tabular-nums', f.spend >= 1000 ? 'text-violet-500' : f.spend > 0 ? 'text-good' : 'text-muted-foreground')}>${f.spend}</span>
                    </TooltipTrigger>
                    <TooltipContent>Recorded spend</TooltipContent>
                  </Tooltip>
                )}
                {f.sent_at && <TimeStamp>{fmtSentAt(f.sent_at)}</TimeStamp>}
              </span>
            ))}
          </div>
        )}

        <p className='mt-2 text-sm leading-relaxed text-foreground/90'>{task.detail}</p>

        {ctx.message && !dismissed && (
          <button type='button' onClick={() => copy(ctx.message)} title='Click to copy'
            className='mt-2 block w-full rounded-md border-l-2 bg-muted/50 px-3 py-2 text-start text-sm italic leading-relaxed text-muted-foreground transition-colors hover:bg-muted'>
            “{ctx.message}”
          </button>
        )}

        {Array.isArray(ctx.subs) && ctx.subs.length > 0 && !dismissed && (
          <ReplyTimeSubs subs={ctx.subs} workload={ctx.workload} taskId={task.id} />
        )}
        {Array.isArray(ctx.incidents) && ctx.incidents.length > 0 && !dismissed && (
          <AfkIncidents incidents={ctx.incidents} taskId={task.id} />
        )}

        {task.status === 'archived' && task.priority_reason && (
          <p className='mt-2 flex items-center gap-1.5 text-xs text-muted-foreground'><Inbox className='size-3.5' />{task.priority_reason}</p>
        )}
        {/* dismissed → show the reasoning (the calibration signal) */}
        {dismissed && (
          <div className='mt-2 flex flex-wrap items-center gap-2 text-xs'>
            <Badge variant='outline' className='font-normal'>Reason: {reasonLabel[task.dismiss_reason_code] || task.dismiss_reason_code || 'none given'}</Badge>
            {task.dismiss_reason && <span className='italic text-muted-foreground'>“{task.dismiss_reason}”</span>}
          </div>
        )}
      </div>

      <div className='flex shrink-0 flex-wrap items-center gap-2 sm:flex-col sm:items-end sm:justify-start'>
        {actioned && task.completed_at && (
          <span className='inline-flex items-center gap-1 text-xs text-muted-foreground'>
            <actioned.icon className='size-3.5' />{actioned.verb} {fmtActioned(task.completed_at)}
          </span>
        )}
        <div className='flex items-center gap-1.5'>
          {task.status === 'open' && <Button size='sm' onClick={() => onAction(task, 'take')}>Take</Button>}
          {task.status === 'taken' && <Button size='sm' onClick={() => onAction(task, 'complete')}>Complete</Button>}
          {live && <Button size='sm' variant='outline' onClick={() => onAction(task, 'dismiss')}>Dismiss</Button>}
          {!live && <Button size='sm' variant='outline' onClick={() => onAction(task, 'reopen')}><RotateCcw />Reopen</Button>}
          {task.chatter_id && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size='icon-sm' variant={task.coach_flag ? 'secondary' : 'ghost'}
                  className={cn(task.coach_flag && 'text-warn')}
                  onClick={() => onAction(task, task.coach_flag ? 'uncoach' : 'coach')}
                  aria-label={task.coach_flag ? 'Remove from coaching log' : 'Save for coaching'}>
                  {task.coach_flag ? <BookmarkCheck /> : <Bookmark />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{task.coach_flag ? "Saved to this chatter's coaching log. Click to remove." : "Save for this chatter's coaching session"}</TooltipContent>
            </Tooltip>
          )}
          {live && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size='icon-sm' variant='ghost' aria-label='More actions'><MoreHorizontal /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align='end'>
                {task.status === 'open' && (
                  <DropdownMenuItem onClick={() => onAction(task, 'complete')}><CircleCheck />Complete without taking</DropdownMenuItem>
                )}
                {task.status === 'taken' && (
                  <DropdownMenuItem onClick={() => onAction(task, 'reopen')}><RotateCcw />Release</DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => onAction(task, 'archive')}><Archive />Archive (file away)</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </div>
  );
}

// A bordered block of tasks, optionally with a heading (group / day).
function TaskSection({ title, count, tasks, onAction }) {
  return (
    <section className='overflow-hidden rounded-lg border bg-card'>
      {title && (
        <div className='flex items-center gap-2 border-b bg-muted/40 px-4 py-2.5 text-sm font-medium'>
          {title}<Badge variant='secondary' className='h-5 rounded-full px-1.5 font-mono text-xs'>{count}</Badge>
        </div>
      )}
      <div className='divide-y'>{tasks.map(t => <TaskRow key={t.id} task={t} onAction={onAction} />)}</div>
    </section>
  );
}

/* ─── New custom task ───────────────────────────────────────────────────── */

const ANYONE = '__anyone';
function CustomTaskDialog({ meta, onClose, onCreate }) {
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [important, setImportant] = useState(false);
  const [attach, setAttach] = useState('none');     // none | page | chatter
  const [creatorId, setCreatorId] = useState('');
  const [chatterId, setChatterId] = useState('');
  const [assignee, setAssignee] = useState(ANYONE);
  const [saving, setSaving] = useState(false);

  const canSave = title.trim() && (attach !== 'page' || creatorId) && (attach !== 'chatter' || chatterId);
  const submit = async () => {
    if (!canSave) return; setSaving(true);
    await onCreate({
      title: title.trim(), detail: detail.trim(), important,
      creator_id: attach === 'page' ? creatorId : null,
      chatter_id: attach === 'chatter' ? chatterId : null,
      assigned_to_name: assignee === ANYONE ? null : assignee,
    });
    setSaving(false);
  };

  const Choice = ({ on, onClick, children }) => (
    <Button type='button' variant={on ? 'secondary' : 'outline'} className={cn('flex-1', on && 'ring-1 ring-ring')} onClick={onClick}>{children}</Button>
  );

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>New custom task</DialogTitle>
          <DialogDescription>A task written by you. It's pinned above the AI tasks.</DialogDescription>
        </DialogHeader>
        <div className='grid gap-4'>
          <div className='grid gap-2'>
            <Label htmlFor='ct-title'>Title</Label>
            <Input id='ct-title' value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Review Maurice's discount habit" autoFocus />
          </div>
          <div className='grid gap-2'>
            <Label htmlFor='ct-detail'>Details <span className='font-normal text-muted-foreground'>(optional)</span></Label>
            <Textarea id='ct-detail' value={detail} onChange={e => setDetail(e.target.value)} rows={3} placeholder='What to do, context…' />
          </div>
          <div className='grid gap-2'>
            <Label>Importance</Label>
            <div className='flex gap-2'>
              <Choice on={!important} onClick={() => setImportant(false)}>Normal</Choice>
              <Choice on={important} onClick={() => setImportant(true)}><Star />Important</Choice>
            </div>
          </div>
          <div className='grid gap-2'>
            <Label>Attach to</Label>
            <div className='flex gap-2'>
              {[['none', 'Nothing'], ['page', 'A page'], ['chatter', 'A chatter']].map(([v, l]) => (
                <Choice key={v} on={attach === v} onClick={() => setAttach(v)}>{l}</Choice>
              ))}
            </div>
            {attach === 'page' && (
              <Select value={creatorId} onValueChange={setCreatorId}>
                <SelectTrigger className='w-full'><SelectValue placeholder='Select a page…' /></SelectTrigger>
                <SelectContent>{(meta.creators || []).map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            )}
            {attach === 'chatter' && (
              <Select value={chatterId} onValueChange={setChatterId}>
                <SelectTrigger className='w-full'><SelectValue placeholder='Select a chatter…' /></SelectTrigger>
                <SelectContent>{(meta.chatters || []).map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            )}
          </div>
          <div className='grid gap-2'>
            <Label>For <span className='font-normal text-muted-foreground'>(optional)</span></Label>
            <Select value={assignee} onValueChange={setAssignee}>
              <SelectTrigger className='w-full'><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ANYONE}>Anyone</SelectItem>
                {(meta.members || []).map(m => <SelectItem key={m.id} value={m.name}>{m.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant='ghost' onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={!canSave || saving}>{saving ? 'Creating…' : 'Create task'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Page ──────────────────────────────────────────────────────────────── */

export default function TasksPage() {
  const { user } = useAuth();
  const canCreate = ['head_manager', 'admin', 'owner'].includes(user?.role);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  // Filter/tab settings persist across tab switches and navigation (localStorage).
  const [saved] = useState(() => { try { return JSON.parse(localStorage.getItem('tasksFilters') || '{}'); } catch { return {}; } });
  const [tab, setTab] = useState(saved.tab || 'open');
  const [search, setSearch] = useState(isDemoMode() ? '' : (saved.search || ''));
  const [groupBy, setGroupBy] = useState(saved.groupBy || 'none');
  const [selPages, setSelPages] = useState(saved.selPages || []);
  const [selChatters, setSelChatters] = useState(saved.selChatters || []);
  const [dismiss, setDismiss] = useState(null);
  const [showCustom, setShowCustom] = useState(false);
  const [meta, setMeta] = useState({ creators: [], chatters: [], members: [] });

  const load = useCallback(async () => {
    try {
      const [tk, cr, ch, mem] = await Promise.all([
        api.get('/api/review-tasks'),
        api.get('/api/creators').catch(() => ({ data: [] })),
        api.get('/api/chatters').catch(() => ({ data: [] })),
        api.get('/api/organisations/members').catch(() => ({ data: [] })),
      ]);
      setTasks(tk.data.tasks || []);
      setMeta({ creators: cr.data || [], chatters: ch.data || [], members: mem.data || [] });
    } catch { /* ignore */ } finally { setLoading(false); }
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);
  // Persist filter/tab settings so they survive tab switches and navigation.
  useEffect(() => {
    try { localStorage.setItem('tasksFilters', JSON.stringify({ tab, search: isDemoMode() ? '' : search, groupBy, selPages, selChatters })); } catch { /* ignore */ }
  }, [tab, search, groupBy, selPages, selChatters]);

  const act = async (task, action, reason_code, reason) => {
    try {
      await api.patch(`/api/review-tasks/${task.id}`, { action, reason_code, reason });
      setTasks(ts => ts.map(t => {
        if (t.id !== task.id) return t;
        if (action === 'coach') return { ...t, coach_flag: true };
        if (action === 'uncoach') return { ...t, coach_flag: false, coached_at: null };
        const next = action === 'take' ? 'taken' : action === 'complete' ? 'completed' : action === 'dismiss' ? 'dismissed' : action === 'archive' ? 'archived' : 'open';
        const done = next === 'completed' || next === 'dismissed' || next === 'archived';
        return { ...t, status: next, completed_at: done ? new Date().toISOString() : t.completed_at, dismiss_reason_code: reason_code || t.dismiss_reason_code, dismiss_reason: reason ?? t.dismiss_reason };
      }));
      toast.success(action === 'coach' ? 'Saved for coaching' : action === 'uncoach' ? 'Removed from coaching' : 'Updated');
    } catch (e) { toast.error(e?.response?.data?.error || 'Failed'); }
  };
  const onAction = (task, action) => { if (action === 'dismiss') setDismiss(task); else act(task, action); };
  const createCustom = async (payload) => {
    try { await api.post('/api/review-tasks/custom', payload); toast.success('Custom task created'); setShowCustom(false); load(); }
    catch (e) { toast.error(e?.response?.data?.error || 'Failed'); }
  };

  const counts = Object.fromEntries(TABS.map(tb => [tb.key, tasks.filter(t => tb.statuses.includes(t.status)).length]));
  const cur = TABS.find(tb => tb.key === tab) || TABS[0];

  // Filter options come from this tab's tasks, UNION the currently-selected values
  // so a selected option never vanishes after you action its last task (that made
  // the whole list look empty with no way to tell why).
  const base = tasks.filter(t => cur.statuses.includes(t.status));
  const optionsFor = (field, selected) => {
    const n = {};
    base.forEach(t => { if (t[field]) n[t[field]] = (n[t[field]] || 0) + 1; });
    return [...new Set([...Object.keys(n), ...selected])].sort().map(v => ({ value: v, label: v, count: n[v] || 0 }));
  };
  const pageOpts = optionsFor('creator_name', selPages);
  const chatterOpts = optionsFor('chatter_name', selChatters);
  const activeFilters = selPages.length + selChatters.length;
  const clearFilters = () => { setSelPages([]); setSelChatters([]); setSearch(''); };

  let list = base;
  if (selPages.length) list = list.filter(t => selPages.includes(t.creator_name));
  if (selChatters.length) list = list.filter(t => selChatters.includes(t.chatter_name));
  if (search) {
    const s = search.toLowerCase();
    list = list.filter(t => [t.detail, t.chatter_name, t.creator_name, t.fan_username].some(v => (v || '').toLowerCase().includes(s)));
  }
  list = list.sort((a, b) => (a.priority || 7) - (b.priority || 7));

  const isHistory = tab === 'completed' || tab === 'dismissed' || tab === 'archived';
  const customTasks = list.filter(t => t.source_type === 'custom')
    .sort((a, b) => (b.context?.important ? 1 : 0) - (a.context?.important ? 1 : 0) || String(b.created_at).localeCompare(String(a.created_at)));
  const aiTasks = list.filter(t => t.source_type !== 'custom');

  // dismissed view: calibration breakdown by reason
  const dismissBreakdown = tab === 'dismissed'
    ? Object.entries(list.reduce((m, t) => { const k = t.dismiss_reason_code || 'other'; m[k] = (m[k] || 0) + 1; return m; }, {})).sort((a, b) => b[1] - a[1])
    : [];

  return (
    <div className='flex flex-col gap-4 sm:gap-6'>
      <div className='flex flex-wrap items-end justify-between gap-2'>
        <div>
          <h2 className='text-2xl font-bold tracking-tight'>Tasks</h2>
          <p className='text-muted-foreground'>Open and taken tasks are the live queue. Completed, dismissed and archived tasks are the record.</p>
        </div>
        {canCreate && <Button onClick={() => setShowCustom(true)}><Plus />Custom task</Button>}
      </div>

      <div className='-mx-1 overflow-x-auto px-1'>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            {TABS.map(tb => (
              <TabsTrigger key={tb.key} value={tb.key} className='gap-1.5'>
                {tb.label}
                <span className='rounded-full bg-background/60 px-1.5 font-mono text-xs text-muted-foreground'>{counts[tb.key]}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <div className='flex flex-wrap items-center gap-2'>
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder='Search tasks…' className='h-8 w-full sm:w-56 lg:w-64' />
        <FacetedFilter title='Page' options={pageOpts} selected={selPages} onChange={setSelPages} />
        <FacetedFilter title='Chatter' options={chatterOpts} selected={selChatters} onChange={setSelChatters} />
        {(activeFilters > 0 || search) && (
          <Button variant='ghost' size='sm' className='h-8 px-2 lg:px-3' onClick={clearFilters}>Reset<X /></Button>
        )}
        {!isHistory && (
          <div className='ms-auto'>
            <Select value={groupBy} onValueChange={setGroupBy}>
              <SelectTrigger size='sm' className='h-8 w-44'><SelectValue /></SelectTrigger>
              <SelectContent>{GROUPS.map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        )}
      </div>

      {tab === 'dismissed' && dismissBreakdown.length > 0 && (
        <div className='flex flex-wrap items-center gap-2 rounded-lg border bg-card px-4 py-3 text-sm'>
          <span className='font-medium'>Why tasks were dismissed</span>
          <span className='text-muted-foreground'>(what the AI gets calibrated on)</span>
          {dismissBreakdown.map(([code, n]) => (
            <Badge key={code} variant='secondary' className='font-normal'>{reasonLabel[code] || code}: <span className='font-semibold'>{n}</span></Badge>
          ))}
        </div>
      )}

      {loading ? (
        <div className='overflow-hidden rounded-lg border bg-card'>
          {[0, 1, 2, 3, 4].map(i => (
            <div key={i} className='space-y-2.5 border-b p-4 last:border-b-0'>
              <div className='flex gap-1.5'><Skeleton className='h-5 w-10' /><Skeleton className='h-5 w-14' /><Skeleton className='h-5 w-20' /></div>
              <Skeleton className='h-4 w-1/3' />
              <Skeleton className='h-4 w-4/5' />
            </div>
          ))}
        </div>
      ) : list.length === 0 ? (
        <div className='flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground'>
          {activeFilters > 0 || search ? (
            <>No tasks match the current filters.<Button variant='link' size='sm' onClick={clearFilters}>Clear filters</Button></>
          ) : (
            <>Nothing here. Build the queue from the Dashboard{canCreate ? ', or add a custom task' : ''}.</>
          )}
        </div>
      ) : isHistory ? (
        // completed / dismissed / archived → grouped by the day they were actioned
        groupByDay(list).map(g => <TaskSection key={g.day} title={fmtDay(g.day)} count={g.ts.length} tasks={g.ts} onAction={onAction} />)
      ) : (
        <>
          {/* custom tasks always pinned on top */}
          {customTasks.length > 0 && <TaskSection title='Custom tasks' count={customTasks.length} tasks={customTasks} onAction={onAction} />}
          {groupBy === 'none'
            ? aiTasks.length > 0 && <TaskSection tasks={aiTasks} onAction={onAction} />
            : buildGroups(aiTasks, groupBy).map(g => <TaskSection key={g.name} title={g.name} count={g.ts.length} tasks={g.ts} onAction={onAction} />)}
        </>
      )}

      {dismiss && <DismissModal task={dismiss} onClose={() => setDismiss(null)}
        onConfirm={(code, note) => { act(dismiss, 'dismiss', code, note); setDismiss(null); }} />}
      {showCustom && <CustomTaskDialog meta={meta} onClose={() => setShowCustom(false)} onCreate={createCustom} />}
    </div>
  );
}
