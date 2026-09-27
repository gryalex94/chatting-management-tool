import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Archive, Bookmark, BookmarkCheck, ChevronRight, CircleCheck, CircleX, Clock,
  ExternalLink, Inbox, Keyboard, MessageSquareText, MoreHorizontal, Plus, RefreshCw, RotateCcw, Star, TriangleAlert, X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/services/api';
import { useAuth } from '@/context/AuthContext';
import { isDemoMode } from '@/utils/privacy';
import { TIER, reasonLabel, fmtSentAt, areaMeta, inflowwChatLink } from '@/utils/taskMeta';
import { cn } from '@/lib/utils';
import DismissModal from '@/components/shared/DismissModal';
import DialogueSheet from './DialogueSheet';
import FanLabel from '@/components/shared/FanLabel';
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

function PriorityBadge({ priority, reason }) {
  const t = TIER[priority] || TIER[7];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant='outline' className='gap-1.5 font-mono'>
          <span className='size-2 rounded-full' style={{ background: t.c }} />{t.label}
        </Badge>
      </TooltipTrigger>
      <TooltipContent className='max-w-xs'>{t.name}{reason ? ` · ${reason}` : ''}</TooltipContent>
    </Tooltip>
  );
}

// Open the conversation with one fan in the side panel.
function ChatButton({ onClick, label = 'Read the conversation here' }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type='button' size='xs' variant='outline' className='h-7 gap-1.5 px-2.5 text-xs font-medium' onClick={onClick}>
          <MessageSquareText className='size-3.5' />Chat
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

// Open the fan's chat in the Infloww desktop app (null link → nothing shown).
function InflowwButton({ href }) {
  if (!href) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button asChild size='xs' variant='outline'
          className='h-7 gap-1.5 border-link/50 px-2.5 text-xs font-medium text-link hover:bg-link/10 hover:text-link'>
          <a href={href}><ExternalLink className='size-3.5' />Infloww</a>
        </Button>
      </TooltipTrigger>
      <TooltipContent>Open this chat in the Infloww app</TooltipContent>
    </Tooltip>
  );
}

// The server checks each AI quote against the stored messages (verifyIssues).
// Safety findings it couldn't back up are kept, with the problem named here.
const EVIDENCE_WARNING = {
  quote_not_found: "The AI's quote isn't in this conversation. Read the chat before acting.",
  fan_said_it: 'The quoted words are the fan\'s, not the chatter\'s. Check who actually did it.',
};

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

// A fan, labelled like Infloww: their name when it's unique on the page, else the
// username first (see FanLabel). `names` = the task's context.names.
function FanChip({ username, nickname, className, names }) {
  return <FanLabel username={username} nickname={nickname} info={names?.[username]} className={className} />;
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
function ReplyTimeSubs({ subs, workload, taskId, onOpenChat, inflowwLink, names }) {
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
              <FanChip username={s.fan_username} nickname={s.fan_nickname} names={names} className={done.has(key) ? 'line-through' : ''} />
              {s.fan_username && <ChatButton onClick={() => onOpenChat(s.fan_username)} />}
              <InflowwButton href={inflowwLink(null, s.page, s.fan_username)} />
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
function AfkIncidents({ incidents, taskId, onOpenChat, inflowwLink, names }) {
  // chat + Infloww buttons for one fan on this gap's page
  const open = (fan, page) => fan && (
    <>
      <ChatButton onClick={() => onOpenChat(fan)} />
      <InflowwButton href={inflowwLink(null, page, fan)} />
    </>
  );
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
              <span>Before the gap</span><FanChip username={g.before_username} names={names} />{open(g.before_username, g.page)}
              <span className='italic'>“{g.before_message}”</span>
            </div>
          )}
          {g.resumed_message && (
            <div className='flex flex-wrap items-baseline gap-1.5 text-xs text-muted-foreground'>
              <span>Resumed</span><FanChip username={g.resumed_username} names={names} />{open(g.resumed_username, g.page)}
              <span className='italic'>“{g.resumed_message}”</span>
            </div>
          )}
          {Array.isArray(g.waiting_fans) && g.waiting_fans.length > 0 && (
            <div className='flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground'>
              <span>Waiting:</span>
              {g.waiting_fans.map((f, j) => (
                <span key={j} className='inline-flex items-center gap-1'>
                  <FanChip username={f.username} nickname={f.fan} names={names} />{open(f.username, g.page)}
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

// Safety-net flags (off-platform / under-18 keywords) carry context.hits — the exact
// messages that matched, so the manager can open each one and judge it.
function KeywordHits({ hits, taskId, onOpenChat, inflowwHref, names }) {
  const [done, toggle] = useChecklist(`hitsDone:${taskId}`);
  return (
    <ReviewList count={hits.length} defaultOpen={hits.length <= 4} label='Messages to check'
      doneLabel={done.size ? `${done.size} of ${hits.length} reviewed` : null}>
      {hits.map((h, i) => (
        <ReviewRow key={i} done={done.has(String(i))} onToggle={() => toggle(String(i))}>
          <div className='flex flex-wrap items-center gap-2'>
            <FanChip username={h.fan_username} names={names} />
            {h.fan_username && <ChatButton onClick={() => onOpenChat(h.fan_username)} />}
            <InflowwButton href={inflowwHref(h.fan_username)} />
            <Badge variant='outline' className='border-bad/30 text-bad'>{h.matched}</Badge>
            {h.sent_at && <TimeStamp>{fmtSentAt(h.sent_at)}</TimeStamp>}
          </div>
          {h.message && <p className='text-xs italic text-muted-foreground'>“{h.message}”</p>}
        </ReviewRow>
      ))}
    </ReviewList>
  );
}

// Always-visible one-click filter buttons (the manager's preference over a
// dropdown): every page/chatter that still has tasks in this tab, with its count.
function ToggleChips({ label, options, selected, onChange }) {
  if (!options.length) return null;
  const toggle = (v) => onChange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v]);
  return (
    <div className='flex flex-wrap items-center gap-1.5'>
      <span className='w-full text-xs font-medium text-muted-foreground sm:w-16 sm:shrink-0'>{label}</span>
      {options.map(o => {
        const on = selected.includes(o.value);
        return (
          <button key={o.value} type='button' onClick={() => toggle(o.value)} aria-pressed={on}
            className={cn('inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors',
              on ? 'border-primary bg-primary text-primary-foreground' : 'bg-background text-foreground hover:bg-accent',
              !on && o.count === 0 && 'opacity-50')}>
            {o.label}
            <span className={cn('font-mono tabular-nums', on ? 'text-primary-foreground/70' : 'text-muted-foreground')}>{o.count}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ─── One task ──────────────────────────────────────────────────────────── */

const ACTIONED = {
  completed: { icon: CircleCheck, verb: 'Completed' },
  dismissed: { icon: CircleX, verb: 'Dismissed' },
  archived: { icon: Inbox, verb: 'Archived' },
};

function TaskRow({ task, onAction, onOpenChat, memberName, focused, selected, onSelect, inflowwLink }) {
  const isCustom = task.source_type === 'custom';
  const ctx = task.context || {};
  const live = task.status === 'open' || task.status === 'taken';
  const dismissed = task.status === 'dismissed';
  const actioned = ACTIONED[task.status];
  // Every fan the task refers to, each with their own username + time (+ spend).
  const fans = (ctx.fans && ctx.fans.length) ? ctx.fans
    : (task.fan_username ? [{ username: task.fan_username, sent_at: ctx.sent_at, spend: ctx.spend ?? null }] : []);
  const where = [task.creator_name, task.chatter_name].filter(Boolean).join(' · ');
  const takenBy = task.status === 'taken' && task.taken_by ? memberName(task.taken_by) : null;
  const warning = EVIDENCE_WARNING[ctx.evidence];
  const rowRef = useRef(null);
  useEffect(() => { if (focused) rowRef.current?.scrollIntoView({ block: 'nearest' }); }, [focused]);

  return (
    <div ref={rowRef} data-task-id={task.id}
      className={cn('flex flex-col gap-3 p-4 sm:flex-row sm:gap-6', isCustom && 'border-l-2 border-l-warn bg-warn/5', focused && 'bg-accent/60 ring-2 ring-inset ring-ring/40')}>
      {live && (
        <Checkbox checked={selected} onCheckedChange={() => onSelect(task)} className='mt-1 hidden sm:flex' aria-label='Select task' />
      )}
      <div className='min-w-0 flex-1'>
        <div className='flex flex-wrap items-center gap-1.5'>
          {isCustom ? (
            <Badge className='gap-1 bg-warn text-white'>{ctx.important && <Star className='fill-current' />}Custom</Badge>
          ) : (
            <>
              <PriorityBadge priority={task.priority} reason={task.priority_reason} />
              <SeverityBadge severity={task.severity} />
              <AreaBadge area={task.area} />
            </>
          )}
          {!isCustom && task.regressed && live && (
            <Tooltip>
              <TooltipTrigger asChild><Badge variant='outline' className='border-bad/40 text-bad'>Came back</Badge></TooltipTrigger>
              <TooltipContent>This was completed before and showed up again on a later day.</TooltipContent>
            </Tooltip>
          )}
          {!isCustom && ctx.often_dismissed && live && (
            <Tooltip>
              <TooltipTrigger asChild><Badge variant='outline' className='font-normal text-muted-foreground'>Often dismissed</Badge></TooltipTrigger>
              <TooltipContent>This topic was dismissed {ctx.often_dismissed} times for this chatter in the last 30 days and never completed, so it's ranked lower.</TooltipContent>
            </Tooltip>
          )}
          {!isCustom && task.days_open > 1 && (
            <Badge variant='outline' className='border-warn/40 text-warn'>{task.days_open} days open</Badge>
          )}
          {takenBy && <Badge variant='secondary' className='font-normal'>Taken by {takenBy}</Badge>}
        </div>

        {isCustom && task.title && <p className='mt-2 text-sm font-semibold'>{task.title}</p>}

        {(where || fans.length > 0 || (isCustom && ctx.assigned_to_name)) && (
          <div className='mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm'>
            {where && <span className='font-medium'>{where}</span>}
            {isCustom && ctx.assigned_to_name && <span className='text-muted-foreground'>for <span className='font-medium text-foreground'>{ctx.assigned_to_name}</span></span>}
            {fans.map((f, fi) => (
              <span key={f.username || f.nickname || fi} className='inline-flex items-center gap-1.5'>
                <FanChip username={f.username} nickname={f.nickname} names={ctx.names} />
                {f.spend != null && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className={cn('text-xs font-semibold tabular-nums', f.spend >= 1000 ? 'text-violet-500' : f.spend > 0 ? 'text-good' : 'text-muted-foreground')}>${f.spend}</span>
                    </TooltipTrigger>
                    <TooltipContent>Recorded spend</TooltipContent>
                  </Tooltip>
                )}
                {f.sent_at && <TimeStamp>{fmtSentAt(f.sent_at)}</TimeStamp>}
                {f.username && <ChatButton onClick={() => onOpenChat(task, fans.length > 1 ? f.username : null)} />}
                <InflowwButton href={inflowwLink(task.creator_id, task.creator_name, f.username)} />
              </span>
            ))}
          </div>
        )}

        {task.detail && <p className='mt-2 text-sm leading-relaxed text-foreground/90'>{task.detail}</p>}

        {warning && (
          <p className='mt-2 flex items-start gap-1.5 rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn'>
            <TriangleAlert className='mt-px size-3.5 shrink-0' />{warning}
          </p>
        )}

        {ctx.message && (
          <button type='button' onClick={() => copy(ctx.message)} title='Click to copy'
            className='mt-2 block w-full rounded-md border-l-2 bg-muted/50 px-3 py-2 text-start text-sm italic leading-relaxed text-muted-foreground transition-colors hover:bg-muted'>
            “{ctx.message}”
          </button>
        )}

        {Array.isArray(ctx.subs) && ctx.subs.length > 0 && (
          <ReplyTimeSubs subs={ctx.subs} workload={ctx.workload} taskId={task.id} onOpenChat={(fan) => onOpenChat(task, fan)} inflowwLink={inflowwLink} names={ctx.names} />
        )}
        {Array.isArray(ctx.incidents) && ctx.incidents.length > 0 && (
          <AfkIncidents incidents={ctx.incidents} taskId={task.id} onOpenChat={(fan) => onOpenChat(task, fan)} inflowwLink={inflowwLink} names={ctx.names} />
        )}
        {Array.isArray(ctx.hits) && ctx.hits.length > 0 && (
          <KeywordHits hits={ctx.hits} taskId={task.id} onOpenChat={(fan) => onOpenChat(task, fan)} names={ctx.names}
            inflowwHref={(fan) => inflowwLink(task.creator_id, task.creator_name, fan)} />
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
        {task.status === 'completed' && OUTCOME_LABEL[ctx.outcome] && (
          <Badge variant='secondary' className='font-normal'>{OUTCOME_LABEL[ctx.outcome]}</Badge>
        )}
        <div className='flex items-center gap-1.5'>
          {task.status === 'open' && <Button size='sm' onClick={() => onAction(task, 'take')}>Take</Button>}
          {task.status === 'open' && (
            <Button size='sm' variant='outline' onClick={() => onAction(task, 'complete')}><CircleCheck />Complete</Button>
          )}
          {task.status === 'taken' && <Button size='sm' onClick={() => onAction(task, 'complete')}>Complete</Button>}
          {live && <Button size='sm' variant='outline' onClick={() => onAction(task, 'dismiss')}>Dismiss</Button>}
          {!live && <Button size='sm' variant='outline' onClick={() => onAction(task, 'reopen')}><RotateCcw />Reopen</Button>}
          {/* Page-level tasks can't be saved for coaching; keep the slot anyway so
              Take / Complete / Dismiss line up across every card. */}
          {!task.chatter_id && <span className='size-8 shrink-0' aria-hidden='true' />}
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
function TaskSection({ title, count, tasks, rowProps }) {
  return (
    <section className='overflow-hidden rounded-lg border bg-card'>
      {title && (
        <div className='flex items-center gap-2 border-b bg-muted/40 px-4 py-2.5 text-sm font-medium'>
          {title}<Badge variant='secondary' className='h-5 rounded-full px-1.5 font-mono text-xs'>{count}</Badge>
        </div>
      )}
      <div className='divide-y'>{tasks.map(t => <TaskRow key={t.id} task={t} {...rowProps(t)} />)}</div>
    </section>
  );
}

/* ─── New custom task ───────────────────────────────────────────────────── */

const ANYONE = '__anyone';
// One option in a row of mutually exclusive choices (importance, attach-to).
const Choice = ({ on, onClick, children }) => (
  <Button type='button' variant={on ? 'secondary' : 'outline'} className={cn('flex-1', on && 'ring-1 ring-ring')} onClick={onClick}>{children}</Button>
);
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

const LIVE = ['open', 'taken'];
const HISTORY_TABS = new Set(['completed', 'dismissed', 'archived']);
const HISTORY_PAGE = 200;
const SEV_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };
const byPriority = (a, b) => (a.priority || 7) - (b.priority || 7)
  || (SEV_ORDER[a.severity] ?? 4) - (SEV_ORDER[b.severity] ?? 4)
  || String(a.id).localeCompare(String(b.id));
const NEXT_STATUS = { take: 'taken', complete: 'completed', dismiss: 'dismissed', archive: 'archived', reopen: 'open' };
const UNDOABLE = { complete: 'Completed', dismiss: 'Dismissed', archive: 'Archived' };
const OUTCOMES = [['coached', 'Coached the chatter'], ['fixed', 'Fixed it'], ['noted', 'Just noted']];
const OUTCOME_LABEL = Object.fromEntries(OUTCOMES);
const SHORTCUTS = [
  ['j / k', 'Next / previous task'], ['t', 'Take'], ['c', 'Complete'], ['d', 'Dismiss, then 1–6 for the reason'],
  ['o', 'Open the conversation'], ['x', 'Select for a bulk action'], ['Esc', 'Clear the selection'],
];

// Apply an action to a task locally, the same way the server just did.
function applyAction(t, action, extra, userId) {
  if (action === 'coach') return { ...t, coach_flag: true };
  if (action === 'uncoach') return { ...t, coach_flag: false, coached_at: null };
  const status = action === 'undo' ? (extra.to || 'open') : NEXT_STATUS[action];
  const done = status === 'completed' || status === 'dismissed' || status === 'archived';
  const next = { ...t, status, completed_at: done ? new Date().toISOString() : null };
  if (action === 'take') { next.taken_by = userId; next.taken_at = new Date().toISOString(); }
  if (action === 'reopen') { next.taken_by = null; next.taken_at = null; }
  if (action === 'dismiss') { next.dismiss_reason_code = extra.reason_code; next.dismiss_reason = extra.reason || null; }
  if (action === 'reopen' || action === 'undo') { next.dismiss_reason_code = null; next.dismiss_reason = null; }
  return next;
}

export default function TasksPage() {
  const { user } = useAuth();
  const canCreate = ['head_manager', 'admin', 'owner'].includes(user?.role);
  const [tasks, setTasks] = useState([]);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState({});         // tab -> { loaded, loading, hasMore }
  const [members, setMembers] = useState([]);
  const [pages, setPages] = useState([]);              // for the pages' Infloww IDs
  const [fanIds, setFanIds] = useState({});            // username → OnlyFans ID from pasted chat links
  // Filter/tab settings persist across tab switches and navigation (localStorage).
  const [saved] = useState(() => { try { return JSON.parse(localStorage.getItem('tasksFilters') || '{}'); } catch { return {}; } });
  const [tab, setTab] = useState(saved.tab || 'open');
  const [search, setSearch] = useState(isDemoMode() ? '' : (saved.search || ''));
  const [groupBy, setGroupBy] = useState(saved.groupBy || 'none');
  const [selPages, setSelPages] = useState(saved.selPages || []);
  const [selChatters, setSelChatters] = useState(saved.selChatters || []);
  const [dismiss, setDismiss] = useState(null);        // a task, or { bulk: [tasks] }
  const [showCustom, setShowCustom] = useState(false);
  const [meta, setMeta] = useState(null);              // pages/chatters/members for the custom-task form
  const [chat, setChat] = useState(null);              // { task, fan }
  const [focusId, setFocusId] = useState(null);
  const [selected, setSelected] = useState(() => new Set());

  const mergeTasks = (list) => setTasks(prev => {
    const m = new Map(prev.map(t => [t.id, t]));
    list.forEach(t => m.set(t.id, t));
    return [...m.values()];
  });
  const loadCounts = useCallback(() => {
    api.get('/api/review-tasks/counts').then(r => setCounts(r.data || {})).catch(() => { /* counts optional */ });
  }, []);
  // The live queue only: history tabs are fetched when opened, a page at a time.
  const loadLive = useCallback(async () => {
    try {
      const [tk, mem, cr] = await Promise.all([
        api.get('/api/review-tasks?status=open,taken'),
        api.get('/api/organisations/members').catch(() => ({ data: [] })),
        api.get('/api/creators').catch(() => ({ data: [] })),
      ]);
      setPages(cr.data || []);
      api.get('/api/review-tasks/fan-links').then(r => setFanIds(r.data?.links || {})).catch(() => { /* optional */ });
      const live = tk.data.tasks || [];
      const liveIds = new Set(live.map(t => t.id));
      setTasks(prev => [...prev.filter(t => !LIVE.includes(t.status) && !liveIds.has(t.id)), ...live]);
      setMembers(mem.data || []);
    } catch { /* ignore */ } finally { setLoading(false); }
    loadCounts();
  }, [loadCounts]);
  const loadHistory = useCallback(async (key, offset = 0) => {
    setHistory(h => ({ ...h, [key]: { ...h[key], loading: true } }));
    try {
      const { data } = await api.get(`/api/review-tasks?status=${key}&limit=${HISTORY_PAGE}&offset=${offset}`);
      mergeTasks(data.tasks || []);
      setHistory(h => ({ ...h, [key]: { loaded: true, loading: false, hasMore: !!data.has_more, next: offset + (data.tasks || []).length } }));
    } catch {
      setHistory(h => ({ ...h, [key]: { ...h[key], loading: false } }));
    }
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadLive(); }, [loadLive]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (HISTORY_TABS.has(tab) && !history[tab]?.loaded && !history[tab]?.loading) loadHistory(tab);
  }, [tab, history, loadHistory]);
  // Persist filter/tab settings so they survive tab switches and navigation.
  useEffect(() => {
    try { localStorage.setItem('tasksFilters', JSON.stringify({ tab, search: isDemoMode() ? '' : search, groupBy, selPages, selChatters })); } catch { /* ignore */ }
  }, [tab, search, groupBy, selPages, selChatters]);
  // The custom-task form's pickers load only when it opens.
  useEffect(() => {
    if (!showCustom || meta) return;
    api.get('/api/chatters').catch(() => ({ data: [] }))
      .then(ch => setMeta({ creators: pages, chatters: ch.data || [], members }));
  }, [showCustom, meta, members, pages]);

  const refresh = () => {
    setHistory({});
    loadLive();
    toast.success('Refreshed');
  };
  const memberName = useCallback((id) => members.find(m => m.id === id)?.name || 'someone', [members]);
  // A page's Infloww ID, looked up by id or (for reply-time rows) by name.
  const inflowwId = useCallback((creatorId, pageName) => {
    const p = pages.find(x => (creatorId && x.id === creatorId) || (pageName && x.name === pageName));
    return p?.infloww_creator_id || null;
  }, [pages]);
  const inflowwLink = useCallback((creatorId, pageName, username) =>
    inflowwChatLink(inflowwId(creatorId, pageName), username, fanIds), [inflowwId, fanIds]);
  // A manager pasted a fan's chat link in the chat panel: that fan (and maybe the page) now has an ID.
  const onLinked = ({ username, of_user_id, page }) => {
    setFanIds(m => ({ ...m, [username]: of_user_id }));
    if (page?.set) api.get('/api/creators').then(r => setPages(r.data || [])).catch(() => { /* ignore */ });
  };

  // One action on one task. Complete / dismiss / archive offer Undo, which puts the
  // task back exactly where it was (open, or still taken by the same person).
  const act = async (task, action, extra = {}) => {
    // When the focused task leaves this tab, focus moves on to the next one.
    if (task.id === focusId && ['take', 'complete', 'dismiss', 'archive', 'reopen'].includes(action)) {
      const i = orderedIds.indexOf(task.id);
      setFocusId(orderedIds[i + 1] ?? orderedIds[i - 1] ?? null);
    }
    try {
      await api.patch(`/api/review-tasks/${task.id}`, { action, ...extra });
      setTasks(ts => ts.map(t => (t.id === task.id ? applyAction(t, action, extra, user?.id) : t)));
      loadCounts();
      if (UNDOABLE[action]) {
        const to = task.status === 'taken' ? 'taken' : 'open';
        const setOutcome = async (tt, outcome) => {
          toast.dismiss(tt.id);
          try {
            const { data } = await api.patch(`/api/review-tasks/${task.id}`, { action: 'outcome', outcome });
            setTasks(ts => ts.map(t => (t.id === task.id ? { ...t, ...data } : t)));
            toast.success(outcome === 'coached' ? 'Recorded as coached' : 'Recorded');
          } catch (e) { toast.error(e?.response?.data?.error || 'Failed'); }
        };
        toast(tt => (
          <span className='flex flex-col gap-2'>
            <span className='flex items-center gap-3'>
              {UNDOABLE[action]}
              <Button size='sm' variant='outline' className='h-7' onClick={() => { toast.dismiss(tt.id); act(task, 'undo', { to }); }}>Undo</Button>
            </span>
            {action === 'complete' && (
              <span className='flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground'>
                How was it handled?
                {OUTCOMES.map(([k, l]) => (
                  <Button key={k} size='sm' variant='secondary' className='h-6 px-2 text-xs' onClick={() => setOutcome(tt, k)}>{l}</Button>
                ))}
              </span>
            )}
          </span>
        ), { duration: action === 'complete' ? 9000 : 6000 });
      } else {
        toast.success(action === 'coach' ? 'Saved for coaching' : action === 'uncoach' ? 'Removed from coaching' : action === 'undo' ? 'Undone' : 'Updated');
      }
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Failed');
      if (e?.response?.status === 409) loadLive();       // someone else took it: show the real state
    }
  };
  const onAction = (task, action) => { if (action === 'dismiss') setDismiss(task); else act(task, action); };
  const openChat = (task, fan = null) => setChat({ task, fan });

  // Bulk: the same action on every selected task, then one Undo for all of them.
  const bulk = async (action, extra = {}) => {
    const list = tasks.filter(t => selected.has(t.id) && LIVE.includes(t.status));
    if (!list.length) return;
    const results = await Promise.allSettled(list.map(t => api.patch(`/api/review-tasks/${t.id}`, { action, ...extra })));
    const ok = list.filter((_, i) => results[i].status === 'fulfilled');
    const okIds = new Set(ok.map(t => t.id));
    setTasks(ts => ts.map(t => (okIds.has(t.id) ? applyAction(t, action, extra, user?.id) : t)));
    setSelected(new Set());
    loadCounts();
    const failed = list.length - ok.length;
    toast(tt => (
      <span className='flex items-center gap-3'>
        {UNDOABLE[action]} {ok.length} task{ok.length === 1 ? '' : 's'}{failed ? ` (${failed} failed)` : ''}
        <Button size='sm' variant='outline' className='h-7' onClick={async () => {
          toast.dismiss(tt.id);
          await Promise.allSettled(ok.map(t => api.patch(`/api/review-tasks/${t.id}`, { action: 'undo', to: t.status === 'taken' ? 'taken' : 'open' })));
          const back = new Map(ok.map(t => [t.id, t.status === 'taken' ? 'taken' : 'open']));
          setTasks(ts => ts.map(t => (back.has(t.id) ? applyAction(t, 'undo', { to: back.get(t.id) }) : t)));
          loadCounts();
        }}>Undo</Button>
      </span>
    ), { duration: 8000 });
  };
  const toggleSelect = (task) => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(task.id)) next.delete(task.id); else next.add(task.id);
    return next;
  });

  const createCustom = async (payload) => {
    try { await api.post('/api/review-tasks/custom', payload); toast.success('Custom task created'); setShowCustom(false); loadLive(); }
    catch (e) { toast.error(e?.response?.data?.error || 'Failed'); }
  };

  const cur = TABS.find(tb => tb.key === tab) || TABS[0];
  const isHistory = HISTORY_TABS.has(tab);

  // Filter options come from this tab's tasks, UNION the currently-selected values
  // so a selected option never vanishes after you action its last task (that made
  // the whole list look empty with no way to tell why).
  const base = tasks.filter(t => cur.statuses.includes(t.status));
  // Counts react to the OTHER filter, so combining is easy: pick a page and the
  // chatter row shows only chatters who still have tasks on it. A name whose last
  // task is done disappears (unless it's selected — then it stays, at 0, so it can
  // be switched off).
  const optionsFor = (field, sel, rows) => {
    const n = {};
    rows.forEach(t => { if (t[field]) n[t[field]] = (n[t[field]] || 0) + 1; });
    return [...new Set([...Object.keys(n), ...sel])].sort().map(v => ({ value: v, label: v, count: n[v] || 0 }));
  };
  const pageOpts = optionsFor('creator_name', selPages,
    selChatters.length ? base.filter(t => selChatters.includes(t.chatter_name)) : base);
  const chatterOpts = optionsFor('chatter_name', selChatters,
    selPages.length ? base.filter(t => selPages.includes(t.creator_name)) : base);
  const activeFilters = selPages.length + selChatters.length;
  const clearFilters = () => { setSelPages([]); setSelChatters([]); setSearch(''); };

  let list = base;
  if (selPages.length) list = list.filter(t => selPages.includes(t.creator_name));
  if (selChatters.length) list = list.filter(t => selChatters.includes(t.chatter_name));
  if (search) {
    const q = search.toLowerCase();
    list = list.filter(t => [t.title, t.detail, t.chatter_name, t.creator_name, t.fan_username, t.context?.message]
      .some(v => (v || '').toLowerCase().includes(q)));
  }
  list = list.slice().sort(byPriority);

  const customTasks = list.filter(t => t.source_type === 'custom')
    .sort((a, b) => (b.context?.important ? 1 : 0) - (a.context?.important ? 1 : 0) || String(b.created_at).localeCompare(String(a.created_at)));
  const aiTasks = list.filter(t => t.source_type !== 'custom');
  const sections = isHistory
    ? groupByDay(list).map(g => ({ key: g.day, title: fmtDay(g.day), ts: g.ts }))
    : [
      ...(customTasks.length ? [{ key: 'custom', title: 'Custom tasks', ts: customTasks }] : []),
      ...(groupBy === 'none'
        ? (aiTasks.length ? [{ key: 'all', title: null, ts: aiTasks }] : [])
        : buildGroups(aiTasks, groupBy).map(g => ({ key: g.name, title: g.name, ts: g.ts }))),
    ];
  // Tasks in the order they're shown: what j / k walk through.
  const ordered = sections.flatMap(sec => sec.ts);
  const orderedIds = ordered.map(t => t.id);
  const effectiveFocus = orderedIds.includes(focusId) ? focusId : null;
  const selectedLive = tasks.filter(t => selected.has(t.id) && LIVE.includes(t.status));

  // Keyboard shortcuts (not while typing or while a dialog / the chat is open).
  useEffect(() => {
    const onKey = (e) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target;
      if (el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))) return;
      if (dismiss || chat || showCustom || !orderedIds.length) return;
      const i = orderedIds.indexOf(effectiveFocus);
      const current = ordered[i] || null;
      const liveCurrent = current && LIVE.includes(current.status);
      switch (e.key) {
        case 'j': setFocusId(orderedIds[i < 0 ? 0 : Math.min(i + 1, orderedIds.length - 1)]); break;
        case 'k': setFocusId(orderedIds[i < 0 ? 0 : Math.max(i - 1, 0)]); break;
        case 't': if (current?.status === 'open') act(current, 'take'); else return; break;
        case 'c': if (liveCurrent) act(current, 'complete'); else return; break;
        case 'd': if (liveCurrent) setDismiss(current); else return; break;
        case 'o': {
          const fan = current?.fan_username || current?.context?.fans?.[0]?.username;
          if (fan) openChat(current, current.fan_username ? null : fan); else return;
          break;
        }
        case 'x': if (liveCurrent) toggleSelect(current); else return; break;
        case 'Escape': if (selected.size) setSelected(new Set()); else return; break;
        default: return;
      }
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const rowProps = (t) => ({
    onAction, onOpenChat: openChat, memberName, inflowwLink,
    focused: t.id === effectiveFocus, selected: selected.has(t.id), onSelect: toggleSelect,
  });

  // dismissed view: calibration breakdown by reason
  const dismissBreakdown = tab === 'dismissed'
    ? Object.entries(list.reduce((m, t) => { const k = t.dismiss_reason_code || 'other'; m[k] = (m[k] || 0) + 1; return m; }, {})).sort((a, b) => b[1] - a[1])
    : [];
  const histState = history[tab] || {};
  const showSkeleton = loading || (isHistory && histState.loading && !histState.loaded);

  return (
    <div className='flex flex-col gap-4 sm:gap-6'>
      <div className='flex flex-wrap items-end justify-between gap-2'>
        <div>
          <h2 className='text-2xl font-bold tracking-tight'>Tasks</h2>
          <p className='text-muted-foreground'>Open and taken tasks are the live queue. Completed, dismissed and archived tasks are the record.</p>
        </div>
        <div className='flex items-center gap-2'>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant='ghost' size='icon' aria-label='Keyboard shortcuts'><Keyboard /></Button>
            </TooltipTrigger>
            <TooltipContent className='max-w-xs'>
              <div className='grid grid-cols-[auto_1fr] gap-x-3 gap-y-1'>
                {SHORTCUTS.map(([k, l]) => <span key={k} className='contents'><kbd className='font-mono font-semibold'>{k}</kbd><span>{l}</span></span>)}
              </div>
            </TooltipContent>
          </Tooltip>
          <Button variant='outline' size='icon' onClick={refresh} aria-label='Refresh'><RefreshCw /></Button>
          {canCreate && <Button onClick={() => setShowCustom(true)}><Plus />Custom task</Button>}
        </div>
      </div>

      <div className='-mx-1 overflow-x-auto px-1'>
        <Tabs value={tab} onValueChange={(v) => { setTab(v); setFocusId(null); setSelected(new Set()); }}>
          <TabsList>
            {TABS.map(tb => (
              <TabsTrigger key={tb.key} value={tb.key} className='gap-1.5'>
                {tb.label}
                <span className='rounded-full bg-background/60 px-1.5 font-mono text-xs text-muted-foreground'>{counts[tb.key] ?? '·'}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <div className='flex flex-wrap items-center gap-2'>
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder='Search tasks…' className='h-8 w-full sm:w-56 lg:w-64' />
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

      {(pageOpts.length > 0 || chatterOpts.length > 0) && (
        <div className='grid gap-2.5 rounded-lg border bg-card p-3'>
          <ToggleChips label='Pages' options={pageOpts} selected={selPages} onChange={setSelPages} />
          <ToggleChips label='Chatters' options={chatterOpts} selected={selChatters} onChange={setSelChatters} />
        </div>
      )}

      {selectedLive.length > 0 && (
        <div className='sticky top-16 z-10 flex flex-wrap items-center gap-2 rounded-lg border bg-card px-4 py-2.5 shadow-sm'>
          <span className='text-sm font-medium'>{selectedLive.length} selected</span>
          <Button size='sm' variant='outline' onClick={() => bulk('complete')}><CircleCheck />Complete</Button>
          <Button size='sm' variant='outline' onClick={() => setDismiss({ bulk: selectedLive })}>Dismiss</Button>
          <Button size='sm' variant='outline' onClick={() => bulk('archive')}><Archive />Archive</Button>
          <Button size='sm' variant='ghost' className='ms-auto' onClick={() => setSelected(new Set())}>Clear<X /></Button>
        </div>
      )}

      {tab === 'dismissed' && dismissBreakdown.length > 0 && (
        <div className='flex flex-wrap items-center gap-2 rounded-lg border bg-card px-4 py-3 text-sm'>
          <span className='font-medium'>Why tasks were dismissed</span>
          <span className='text-muted-foreground'>(what the AI gets calibrated on)</span>
          {dismissBreakdown.map(([code, n]) => (
            <Badge key={code} variant='secondary' className='font-normal'>{reasonLabel[code] || code}: <span className='font-semibold'>{n}</span></Badge>
          ))}
        </div>
      )}

      {showSkeleton ? (
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
      ) : (
        <>
          {sections.map(sec => (
            <TaskSection key={sec.key} title={sec.title} count={sec.ts.length} tasks={sec.ts} rowProps={rowProps} />
          ))}
          {isHistory && histState.hasMore && (
            <Button variant='outline' disabled={histState.loading} onClick={() => loadHistory(tab, histState.next || 0)}>
              {histState.loading ? 'Loading…' : 'Load older tasks'}
            </Button>
          )}
        </>
      )}

      {dismiss && (
        <DismissModal task={dismiss.bulk ? null : dismiss} count={dismiss.bulk?.length}
          onClose={() => setDismiss(null)}
          onConfirm={(code, note) => {
            if (dismiss.bulk) bulk('dismiss', { reason_code: code, reason: note });
            else act(dismiss, 'dismiss', { reason_code: code, reason: note });
            setDismiss(null);
          }} />
      )}
      {showCustom && <CustomTaskDialog meta={meta || { creators: [], chatters: [], members }} onClose={() => setShowCustom(false)} onCreate={createCustom} />}
      {chat && <DialogueSheet task={chat.task} fan={chat.fan} onClose={() => setChat(null)} onLinked={onLinked} />}
    </div>
  );
}
