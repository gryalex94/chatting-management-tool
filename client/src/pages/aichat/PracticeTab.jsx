import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Coins, FolderOpen, Hourglass, Loader2, Lock, Maximize2, MessageSquareReply, Paperclip, RotateCcw, Route, Search, Send, ShieldAlert, Star, Trash2, UserRoundPlus, X } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/services/api';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { cost, dayTime, errMsg, fanName, moneyLine, shortDay } from './shared';
import Thumbs from './Thumbs';
import DecisionMap from './DecisionMap';
import ClaudeScore from './ClaudeScore';

const MADE_UP = 'made-up';
// the meters of a conversation (engine v2): what each gauge means in two words
const METERS = [['heat', 'His heat'], ['mood', 'His mood'], ['rapport', 'Rapport'], ['readiness', 'Ready to pay'], ['doubt', 'Doubt'], ['engagement', 'Engagement'], ['surprise', 'Surprise']];
const clean = (s) => String(s ?? '').trim();
const STATUS = {
  ok: { label: 'Passed the checks', tone: 'border-good/40 text-good' },
  check: { label: 'A person should look', tone: 'border-warn/40 text-warn' },
  blocked: { label: 'Broke a rule', tone: 'border-bad/40 text-bad' },
  handover: { label: 'Hands over to a person', tone: 'border-warn/40 text-warn' },
  error: { label: 'Failed', tone: 'border-bad/40 text-bad' },
};

// "How she decided": opens this reply's decision map on the right.
const MapLink = ({ onClick, active }) => (
  <button type='button' onClick={onClick} aria-pressed={active}
    className={cn('inline-flex items-center gap-1 rounded px-1 text-[11px] hover:underline', active ? 'font-medium text-primary' : 'text-link')}>
    <Route className='size-3' aria-hidden />How she decided
  </button>
);

// One chat bubble: him on the left, her on the right (with a link to its decision map).
function Bubble({ fromFan, children, meta, tone, onMap, mapActive, onStar = null, starred = false }) {
  return (
    <div className={cn('flex flex-col gap-0.5', fromFan ? 'items-start' : 'items-end')}>
      <div className={cn('max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-1.5 text-sm',
        fromFan ? 'rounded-bl-sm bg-muted' : 'rounded-br-sm bg-primary text-primary-foreground', tone, mapActive && 'ring-2 ring-primary/40 ring-offset-1 ring-offset-card')}>
        {children}
      </div>
      {meta && <span className={cn('max-w-[85%] whitespace-pre-line px-1 text-[11px] text-muted-foreground', !fromFan && 'text-right')}>{meta}</span>}
      {(onMap || onStar) && (
        <span className='flex items-center gap-2'>
          {onMap && <MapLink onClick={onMap} active={mapActive} />}
          {onStar && (
            <button type='button' onClick={onStar} disabled={starred} aria-pressed={starred} title={starred ? 'In her example library' : 'A reply you like: it joins her example library'}
              className={cn('inline-flex items-center gap-1 rounded px-1 text-[11px]', starred ? 'text-warn' : 'text-link hover:underline')}>
              <Star className={cn('size-3', starred && 'fill-current')} aria-hidden />{starred ? 'Starred' : 'Star it'}
            </button>
          )}
        </span>
      )}
    </div>
  );
}

// Her sexting story after a reply, in one line: "in bed · a crop top · so far: lights off, top off · he: stroking · building up".
const STAGE = { warming: 'warming up', building: 'building up', peak: 'the peak', after: 'afterwards' };
const sceneLine = (s) => (s ? [s.where, s.wearing, s.done?.length ? `so far: ${s.done.join(', ')}` : null, s.him ? `he: ${s.him}` : null, STAGE[s.stage]].filter(Boolean).join(' · ') : '');
// Under a kept reply: which writer, the checks, the cost, and the story (the rest is in its decision map).
const keptNote = (result) => [
  `kept · ${result.label}`, STATUS[result.status]?.label?.toLowerCase(), cost(result.cost),
].filter(Boolean).join(' · ') + (result.scene ? `\nScene: ${sceneLine(result.scene)}` : '');
// Her reply as messages in the practice chat; the details (a PPV, the story's scene, its map) go on the last one.
const keptMessages = (result, roundId) => result.replies.map((r, i, all) => ({
  from: 'her', text: r.creator_message, label: result.label, note: i === all.length - 1 ? keptNote(result) : null,
  ...(i === all.length - 1 ? { roundId } : {}),
  ...(i === all.length - 1 && result.ppv ? { ppv: { ...result.ppv, status: 'pending' } } : {}),
  ...(i === all.length - 1 && result.scene ? { scene: result.scene } : {}),
}));

// A PPV she sent: price, what it is, exactly what's inside, and what he did with it.
const PPV_STATUS = { pending: 'Not opened yet', bought: 'He bought it', not_bought: 'He didn\'t buy it', ignored: 'He saw it and isn\'t opening it' };
function PpvCard({ ppv, creatorId, children }) {
  return (
    <div className='flex max-w-[85%] flex-col gap-1 self-end rounded-xl border border-dashed border-warn/50 bg-warn/5 px-3 py-2 text-xs'>
      <span className='flex items-center gap-1.5 font-medium'><Lock className='size-3.5 text-warn' />PPV ${ppv.price} · {ppv.series ? `${ppv.series}, step ${ppv.step}: ` : ''}{ppv.title} · {ppv.what}</span>
      {creatorId && ppv.asset_ids?.length > 0 && <Thumbs creatorId={creatorId} ids={ppv.asset_ids} />}
      <span className='text-muted-foreground'>{ppv.description}</span>
      {ppv.status && <span className={cn('font-medium', ppv.status === 'bought' ? 'text-good' : ppv.status === 'not_bought' ? 'text-bad' : ppv.status === 'ignored' ? 'text-warn' : 'text-muted-foreground')}>
        {PPV_STATUS[ppv.status]}{ppv.status === 'bought' ? (ppv.speed === 'slow' ? ' after a while' : ' right away') : ''}
      </span>}
      {children}
    </div>
  );
}

// When each of her messages starts and finishes being typed, counted from when he
// wrote (`startAt`); played back as it would happen, unless skipped.
function usePlayback(timing, startAt, off) {
  const schedule = useMemo(() => (timing || []).reduce((list, x) => {
    const start = (list.length ? list[list.length - 1].end : startAt) + x.wait_ms;
    return [...list, { start, end: start + x.typing_ms }];
  }, []), [timing, startAt]);
  const [now, setNow] = useState(0);
  const [skipped, setSkipped] = useState(false);
  const last = schedule.length ? schedule[schedule.length - 1].end : 0;
  const done = off || skipped || (now > 0 && now >= last);
  useEffect(() => {
    if (done) return undefined;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [done]);
  return {
    shown: done ? schedule.length : schedule.filter(x => now >= x.end).length,
    typing: !done && schedule.some(x => now >= x.start && now < x.end),
    done, skip: () => setSkipped(true),
    arrivedAfter: schedule.map(x => Math.round((x.end - startAt) / 1000)),
  };
}

// "typing…": three dots, like a chat app.
const Typing = () => (
  <div className='flex justify-end'>
    <div className='flex gap-1 rounded-2xl rounded-br-sm bg-primary/70 px-3 py-2.5' aria-label='She is typing'>
      {[0, 150, 300].map(d => <span key={d} className='size-1.5 animate-bounce rounded-full bg-primary-foreground' style={{ animationDelay: `${d}ms` }} />)}
    </div>
  </div>
);

// One writer's answer: the reply (one message at a time, at her typing speed),
// whether it passed the checks, and what it cost.
function Draft({ result, startAt, kept, onKeep, canKeep, onGrow, creatorId, onMap, mapActive }) {
  const s = STATUS[result.status] || STATUS.error;
  const live = ['ok', 'check'].includes(result.status);
  const play = usePlayback(result.timing, startAt, !live || kept);
  useEffect(() => { onGrow?.(); }, [play.shown, play.typing, onGrow]);
  return (
    <div className={cn('flex flex-col gap-2 rounded-lg border p-3', kept && 'border-primary/50 bg-primary/5', mapActive && 'ring-2 ring-primary/30')}>
      <div className='flex flex-wrap items-center gap-2 text-xs'>
        <span className='font-medium'>{result.label}</span>
        <Badge variant='outline' className={cn('font-normal', s.tone)}>{s.label}</Badge>
        <span className='text-muted-foreground'>{cost(result.cost)} · {(result.ms / 1000).toFixed(1)} s</span>
        {result.retried && <span className='text-muted-foreground'>· rewritten{result.drafts > 2 ? ` ${result.drafts - 1} times` : ' once'}</span>}
        {onMap && <span className='ms-auto'><MapLink onClick={onMap} active={mapActive} /></span>}
      </div>
      {result.status === 'error' ? <p className='text-sm text-bad'>{result.error}</p> : (
        <div className='flex flex-col gap-1.5'>
          {result.replies.slice(0, play.shown).map((r, i) => (
            <Bubble key={i} tone={result.status === 'blocked' ? 'opacity-60' : null}
              meta={live && result.timing ? `arrived after ${play.arrivedAfter[i]} s` : null}>{r.creator_message}</Bubble>
          ))}
          {play.typing && <Typing />}
          {play.done && result.ppv && <PpvCard ppv={result.ppv} creatorId={creatorId} />}
          {!play.done && (
            <button type='button' onClick={play.skip} className='self-end text-xs text-link hover:underline'>
              {play.shown ? 'Skip the wait' : `${result.replies.length} message${result.replies.length === 1 ? '' : 's'} on the way · skip the wait`}
            </button>
          )}
        </div>
      )}
      {result.status === 'handover' && <p className='text-xs text-warn'>The AI asks a person to take over: {result.reason}</p>}
      {result.problems?.length > 0 && result.status !== 'handover' && (
        <ul className='list-disc ps-4 text-xs text-muted-foreground'>{result.problems.map((p, i) => <li key={i}>{p}</li>)}</ul>
      )}
      {result.retried && result.first_problems?.length > 0 && (
        <p className='text-xs text-muted-foreground'>First draft turned down: {result.first_problems.join(' ')}</p>
      )}
      {result.style?.length > 0 && result.status !== 'error' && (
        <p className='text-xs text-warn'>Could sound better: {result.style.join(' ')}</p>
      )}
      {result.review && <p className='text-xs text-muted-foreground'>Claude checked it: {result.review.ok ? 'fine' : result.review.declined ? 'declined to look' : 'not fine'}.</p>}
      {result.fixed && (
        <div className='flex flex-col gap-1 rounded-md border border-primary/30 bg-primary/5 p-2 text-xs'>
          <span className='font-medium'>Claude found the first version weak{result.fixed.summary ? `: ${result.fixed.summary}` : ''}. Rewritten with its notes (above).</span>
          <span className='text-muted-foreground'>Claude&apos;s notes: {result.fixed.notes.join(' ')}</span>
          <span className='text-muted-foreground'>Before the fix: {result.fixed.before.map(x => x.creator_message).join(' / ')}{result.fixed.before_ppv ? ` [PPV ${result.fixed.before_ppv.title}]` : ''}</span>
          {result.fixed.coach && <span className={cn('font-medium', result.fixed.coach.overall === 'good' ? 'text-good' : result.fixed.coach.overall === 'okay' ? 'text-warn' : 'text-bad')}>After the fix, Claude says: {result.fixed.coach.overall}{result.fixed.coach.summary ? ` · ${result.fixed.coach.summary}` : ''}</span>}
        </div>
      )}
      {result.format_ok === false && <p className='text-xs text-muted-foreground'>This writer didn&apos;t answer in the format asked, so its whole answer is shown.</p>}
      {result.learned?.length > 0 && (
        <p className='text-xs text-muted-foreground'>Would remember: {result.learned.map(l => l.note).join(' · ')}</p>
      )}
      {result.about_me?.length > 0 && (
        <p className='text-xs text-muted-foreground'>Said about herself: {result.about_me.join(' · ')} (kept for this chat)</p>
      )}
      {result.scene && <p className='text-xs text-muted-foreground'>Scene after this reply: {sceneLine(result.scene)}</p>}
      {canKeep && live && play.done && result.replies.length > 0 && (
        <div>
          <Button size='sm' variant={kept ? 'secondary' : 'outline'} onClick={onKeep} disabled={kept}>
            <Check />{kept ? 'Kept' : 'Use this reply'}
          </Button>
        </div>
      )}
    </div>
  );
}

// The safety screen stopped his message before any AI saw it.
function Stopped({ screen, decided = null, onDecide = null, onFlag = null }) {
  const [terms, setTerms] = useState('');
  const waiting = screen.action === 'wait';
  const flagged = screen.flag === 'pending';
  return (
    <div className='flex items-start gap-2 rounded-lg border border-warn/40 bg-warn/5 p-3 text-sm'>
      <ShieldAlert className='mt-0.5 size-4 shrink-0 text-warn' />
      <div className='flex min-w-0 flex-1 flex-col gap-1'>
        <span className='font-medium'>{screen.flag === 'blocked' ? 'Blocked: a manager blocked him after a flagged file.' : flagged ? 'Stopped: a flagged file. She stays out until you clear him or block him.' : screen.action === 'stop' ? 'Stopped: no AI saw this message.' : waiting ? 'Waiting for your decision: she says nothing until you decide.' : 'A person takes over: the AI doesn\'t answer this.'}</span>
        {screen.reasons.map((r, i) => <span key={i} className='text-muted-foreground'>{r}</span>)}
        {flagged && decided && <span className='text-xs font-medium text-good'>You {decided === 'cleared' ? 'cleared him: write his next message and she goes on' : 'blocked him: she never answers him again'}.</span>}
        {flagged && !decided && onFlag && (
          <div className='mt-1 flex flex-wrap gap-1.5'>
            <Button size='sm' variant='outline' className='h-7 text-xs' onClick={() => onFlag('cleared')}>Clear him: it was fine</Button>
            <Button size='sm' variant='outline' className='h-7 text-xs' onClick={() => onFlag('blocked')}>Block him</Button>
          </div>
        )}
        {waiting && decided && <span className='text-xs font-medium text-good'>You {decided}: write his next message and she goes on with your terms.</span>}
        {waiting && !decided && onDecide && (
          <div className='mt-1 flex flex-col gap-1.5'>
            <Input value={terms} onChange={e => setTerms(e.target.value)} placeholder='Your terms (a price, what exactly), or why not' className='h-8' aria-label='Your terms' />
            <div className='flex flex-wrap gap-1.5'>
              <Button size='sm' variant='outline' className='h-7 text-xs' onClick={() => onDecide('approved', terms)}>Approve</Button>
              <Button size='sm' variant='outline' className='h-7 text-xs' onClick={() => onDecide('refused', terms)}>Refuse</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Your decision on a parked request (D4): approve or refuse, with your terms; she goes on with it in her next reply.
function PendingDecision({ onDecide }) {
  const [terms, setTerms] = useState('');
  return (
    <div className='mt-1 flex flex-col gap-1.5'>
      <Input value={terms} onChange={e => setTerms(e.target.value)} placeholder='Your terms (a price, what exactly), or why not' className='h-7 text-xs' aria-label='Your terms' />
      <div className='flex flex-wrap gap-1.5'>
        <Button size='sm' variant='outline' className='h-7 text-xs' onClick={() => onDecide('approved', terms)}>Approve</Button>
        <Button size='sm' variant='outline' className='h-7 text-xs' onClick={() => onDecide('refused', terms)}>Refuse</Button>
      </div>
    </div>
  );
}

/**
 * The practice room, in its own window: pick a real fan (his chat as the AI reads
 * it, his memory and spending) or a made-up one, write as him, see her reply from
 * up to three writers, and next to the chat how she decided it, step by step (the
 * decision map). The window keeps its chat when it's closed and opened again.
 * In the tab itself: a card to open it.
 */
export default function PracticeTab({ page, writers, fanTypes = [], ready, onSpent, onSetUp, onContent, contentVersion = 0, open = false, onOpen, onClose }) {
  const [fans, setFans] = useState(null);
  const [search, setSearch] = useState('');
  const [fanId, setFanId] = useState(MADE_UP);
  const [detail, setDetail] = useState(null);         // the real fan: what the AI reads; undefined while loading
  const [madeUp, setMadeUp] = useState({ name: '', notes: '', type: 'none' });   // type: who he is (new subscriber, time waster…)
  const [selling, setSelling] = useState(true);        // she may sell: PPVs from her content list
  const [contentCount, setContentCount] = useState(null);
  const [test, setTest] = useState([]);               // typed here: { from: 'fan' | 'her', text, label?, ppv?, scene?, roundId? }
  const [rounds, setRounds] = useState([]);           // the AI's answers: { id, at (after test[at - 1]), screen, results, used, kept }
  const [mapId, setMapId] = useState(null);           // the reply whose decision map is shown
  const [learned, setLearned] = useState([]);         // what she learned about him from the replies kept (this chat only)
  const [session, setSession] = useState(null);       // the plan for this conversation, kept by the engine between replies
  const [models, setModels] = useState([page.writer]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const scroller = useRef(null);
  const composer = useRef(null);
  const fileInput = useRef(null);
  const [looking, setLooking] = useState(false);       // a photo or video of his being looked at
  const [tip, setTip] = useState('');                   // a tip he sends (the practice room plays him)
  const mapPanel = useRef(null);
  // the practice chat is saved as it goes (database change 050): reopened later, replayed after changes, its replies starred
  const [runId, setRunId] = useState(null);
  const runIdRef = useRef(null);
  const [runs, setRuns] = useState(null);
  const [runsOpen, setRunsOpen] = useState(false);
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    api.get(`/api/ai-chat/pages/${page.creator_id}/content`).then(r => setContentCount(r.data.items.filter(it => it.active).length)).catch(() => setContentCount(0));
  }, [page.creator_id, contentVersion]);
  useEffect(() => {
    api.get(`/api/ai-chat/pages/${page.creator_id}/fans`).then(r => setFans(r.data.fans))
      .catch(e => { setFans([]); toast.error(errMsg(e, 'Could not load the fans')); });
  }, [page.creator_id]);
  const loadRuns = useCallback(() => api.get(`/api/ai-chat/pages/${page.creator_id}/practice-runs`).then(r => setRuns(r.data.runs)).catch(() => setRuns([])), [page.creator_id]);
  useEffect(() => { if (open) loadRuns(); }, [open, loadRuns]);
  useEffect(() => {
    if (fanId === MADE_UP) return undefined;
    let live = true;
    api.get(`/api/ai-chat/pages/${page.creator_id}/fans/${fanId}`).then(r => { if (live) setDetail(r.data); })
      .catch(e => { if (live) { setDetail(null); toast.error(errMsg(e, 'Could not load the chat')); } });
    return () => { live = false; };
  }, [page.creator_id, fanId]);
  // keep the newest message in view
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [detail, test, rounds, busy, open]);
  // another reply's map: start at its top
  useEffect(() => { if (mapPanel.current) mapPanel.current.scrollTop = 0; }, [mapId]);
  // the window: Esc closes it (unless a menu inside is open), the page behind doesn't scroll
  useEffect(() => {
    if (!open) return undefined;
    const before = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => {
      // a menu or dialog inside handles its own Esc (it marks the key as handled)
      if (e.key === 'Escape' && !e.defaultPrevented && !document.querySelector('[data-radix-popper-content-wrapper], [role="dialog"][data-state="open"]')) onClose?.();
    };
    window.addEventListener('keydown', onKey);
    setTimeout(() => composer.current?.focus(), 0);
    return () => { document.body.style.overflow = before; window.removeEventListener('keydown', onKey); };
  }, [open, onClose]);

  const pick = (id) => {
    if (busy) return;
    setFanId(id); setTest([]); setRounds([]); setMapId(null); setLearned([]); setSession(null); setDetail(id === MADE_UP ? null : undefined);
    runIdRef.current = null; setRunId(null);
  };
  const startOver = () => { if (!busy) { setTest([]); setRounds([]); setMapId(null); setLearned([]); setSession(null); runIdRef.current = null; setRunId(null); } };
  // what he did after her last reply (as you played him): logged with the next request, for the outcomes report
  const outcomeOf = (quiet) => {
    const last = rounds[rounds.length - 1];
    if (!last?.used?.plan) return null;
    const status = test.find(m => m.roundId === last.id && m.ppv)?.ppv?.status;
    const happened = ['bought', 'not_bought', 'ignored'].includes(status) ? status : quiet ? 'quiet' : 'replied';
    return { goal: last.used.plan.goal, aim: last.used.session?.aim, tier: last.used.profile?.tier, closeness: last.used.profile?.closeness, happened, ppv: !!status };
  };
  // a kept reply's new facts about him join what she knows for the rest of this chat
  const withLearned = (list, result) => [...new Set([...list, ...(result?.learned || []).map(l => l.note).filter(Boolean)])].slice(-20);
  // what she said about herself in a kept reply joins her diary for the rest of this chat (never saved)
  const addAboutMe = (result) => {
    if (!result?.about_me?.length) return;
    setSession(s => (s ? { ...s, diary_add: [...new Set([...(s.diary_add || []), ...result.about_me])].slice(-20) } : s));
  };
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (fans || []).filter(f => !q || [f.display_name, f.fan_username, f.fan_nickname].some(v => String(v || '').toLowerCase().includes(q)));
  }, [fans, search]);

  const real = fanId !== MADE_UP;
  const lastReal = real && detail?.messages?.length ? detail.messages[detail.messages.length - 1] : null;
  const canAnswerLast = real && !test.length && !rounds.length && lastReal?.from_fan;
  const blocked = !page.has_profile || !ready.writer || !ready.tables;

  const sells = selling && contentCount > 0;
  const ask = async (nextTest, { followUp = false, known = learned, outcome = null } = {}) => {
    const askedAt = Date.now();         // her timing counts from when he wrote
    setBusy(true);
    // kept with the reply, so "what if" can ask again about the same moment
    const body = {
      fan_uuid: real ? fanId : null,
      made_up: real ? null : { ...madeUp, type: madeUp.type === 'none' ? null : madeUp.type },
      test: nextTest.map(({ from, text: t, ppv, scene, media, tip: tipped }) => ({ from, text: t, ...(ppv ? { ppv } : {}), ...(scene ? { scene } : {}), ...(media ? { media } : {}), ...(tipped ? { tip: tipped } : {}) })),
      models, selling: sells, follow_up: followUp, learned: known, session, outcome,
    };
    try {
      const { data } = await api.post(`/api/ai-chat/pages/${page.creator_id}/reply`, body);
      const id = `r${askedAt}`;
      if (data.used?.session) setSession(data.used.session);
      else if (data.screen?.flag) setSession(s => ({ ...(s || {}), flag: data.screen.flag, flag_id: data.screen.flag_id || null }));
      setRounds(r => [...r, { id, at: nextTest.length, askedAt, body: { ...body, outcome: null }, ...data, kept: null, whatIfs: [] }]);
      setMapId(id);                     // the newest reply's map
      onSpent?.();
    } catch (e) { toast.error(errMsg(e, 'Could not get a reply')); }
    finally { setBusy(false); }
  };
  // a step of a reply's map marked as wrong (a wrong call, or bad wording): saved, and it teaches the engine
  const mark = async (payload) => {
    try {
      await api.post(`/api/ai-chat/pages/${page.creator_id}/feedback`, payload);
      toast.success('Saved: the engine learns from it');
    } catch (e) { toast.error(errMsg(e, 'Could not save your note')); throw e; }
  };
  // what if he were someone else, or in another mood: the same moment decided again
  // (and written, if asked), shown in the map, not in the chat
  const [whatIfBusy, setWhatIfBusy] = useState(false);
  const whatIf = async (round, overrides, write) => {
    if (!round?.body || whatIfBusy) return;
    setWhatIfBusy(true);
    try {
      const { data } = await api.post(`/api/ai-chat/pages/${page.creator_id}/reply`, { ...round.body, what_if: overrides, plan_only: !write });
      setRounds(rs => rs.map(r => (r.id === round.id ? { ...r, whatIfs: [{ id: `w${Date.now()}`, overrides, write, data }, ...(r.whatIfs || [])] } : r)));
      onSpent?.();
    } catch (e) { toast.error(errMsg(e, 'Could not try that')); }
    finally { setWhatIfBusy(false); }
  };
  // no reply picked for his last message: the first one that passed counts, so
  // the chat goes on from her answer (otherwise she'd never have answered)
  const withKept = () => {
    let next = [...test], known = learned;
    const last = rounds[rounds.length - 1];
    if (last && !last.kept && last.at === test.length) {
      const first = (last.results || []).find(r => ['ok', 'check'].includes(r.status) && r.replies.length);
      if (first) {
        next = [...next, ...keptMessages(first, last.id)];
        known = withLearned(learned, first);
        setLearned(known);
        addAboutMe(first);
        setRounds(rs => rs.map(r => (r === last ? { ...r, kept: first.model } : r)));
      }
    }
    return { next, known };
  };
  const send = () => {
    const t = text.trim();
    if (!t || busy || blocked) return;
    const outcome = outcomeOf(false);
    const kept = withKept();
    const next = [...kept.next, { from: 'fan', text: t }];
    setTest(next);
    setText('');
    ask(next, { known: kept.known, outcome });
  };
  // a photo or video sent as him: looked at by the describer (nothing is kept), then she answers it
  const sendFile = async (file) => {
    if (!file || busy || blocked) return;
    setLooking(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const { data } = await api.post(`/api/ai-chat/pages/${page.creator_id}/media`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
      const outcome = outcomeOf(false);
      const kept = withKept();
      const next = [...kept.next, { from: 'fan', text: text.trim(), media: data.media }];
      setTest(next);
      setText('');
      onSpent?.();
      await ask(next, { known: kept.known, outcome });
    } catch (e) { toast.error(errMsg(e, 'Could not look at the file')); }
    finally { setLooking(false); if (fileInput.current) fileInput.current.value = ''; }
  };
  // a tip he sends, with or without words (the practice room plays him)
  const sendTip = () => {
    const amount = Math.round(Number(tip));
    if (!amount || amount <= 0 || busy || blocked) return;
    const outcome = outcomeOf(false);
    const kept = withKept();
    const next = [...kept.next, { from: 'fan', text: text.trim(), tip: amount }];
    setTest(next);
    setText('');
    setTip('');
    ask(next, { known: kept.known, outcome });
  };
  // your decision on a request the AI couldn't decide (D1): she goes on with your terms
  // a flagged file (D5): cleared, and she goes on; blocked, and she never answers him again
  const decideFlag = async (round, status) => {
    setSession(s => ({ ...(s || {}), flag: status }));
    setRounds(rs => rs.map(r => (r.id === round.id ? { ...r, decided: status } : r)));
    const id = round.screen?.flag_id;
    if (id) { try { await api.patch(`/api/ai-chat/pages/${page.creator_id}/requests/${id}`, { status: status === 'cleared' ? 'approved' : 'refused', terms: '' }); } catch (e) { toast.error(errMsg(e, 'Could not save your decision')); } }
  };
  const decide = async (round, status, terms) => {
    setSession(s => (s?.pending ? { ...s, pending: { ...s.pending, state: status, terms } } : s));
    setRounds(rs => rs.map(r => (r.id === round.id ? { ...r, decided: status } : r)));
    const id = round.used?.request_id;
    if (id) { try { await api.patch(`/api/ai-chat/pages/${page.creator_id}/requests/${id}`, { status, terms }); } catch (e) { toast.error(errMsg(e, 'Could not save your decision')); } }
  };
  const [firstKind, setFirstKind] = useState('nudge');   // she writes first: a nudge, a new conversation, her weekly personal message, a second try (B2–B4)
  // she writes without a new message from him (he went quiet, or just bought)
  const followUp = () => {
    if (busy || blocked) return;
    const outcome = outcomeOf(true);
    const { next, known } = withKept();
    setTest(next);
    ask(next, { followUp: firstKind, known, outcome });
  };
  // what he did with her PPV (the practice room plays him)
  const setPpv = (i, status, speed = null) => setTest(t => t.map((m, k) => (k === i ? { ...m, ppv: { ...m.ppv, status, speed } } : m)));
  const lastPpvAt = test.map(m => !!m.ppv).lastIndexOf(true);
  const keep = (round, result) => {
    setTest(t => [...t, ...keptMessages(result, round.id)]);
    setLearned(l => withLearned(l, result));
    addAboutMe(result);
    setRounds(rs => rs.map(r => (r === round ? { ...r, kept: result.model } : r)));
  };
  // saved as it goes (1.5 s after the last change): the messages, every reply with its decision map, the session,
  // and what you did as him after each reply (the PPV's fate, or whether he wrote on)
  const saveRun = useCallback(async () => {
    if (!rounds.length) return null;
    const happenedAfter = (round) => {
      const status = test.find(m => m.roundId === round.id && m.ppv)?.ppv?.status;
      if (['bought', 'not_bought', 'ignored'].includes(status)) return status;
      const i = test.findIndex(m => m.roundId === round.id);
      return i >= 0 && test.slice(i + 1).some(m => m.from === 'fan') ? 'replied' : null;
    };
    const typeLabel = !real && madeUp.type !== 'none' ? fanTypes.find(t => t.id === madeUp.type)?.label : null;
    const body = {
      id: runIdRef.current, fan_uuid: real ? fanId : null, made_up: real ? null : madeUp,
      title: `${real ? fanName(detail?.fan) || 'a real fan' : clean(madeUp.name) || 'a made-up fan'}${typeLabel ? ` (${typeLabel.toLowerCase()})` : ''} · ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`,
      messages: test, turns: rounds.map(r => ({ ...r, whatIfs: [], outcome: happenedAfter(r) })), session, settings: { models, selling: sells, learned },
    };
    try {
      const { data } = await api.post(`/api/ai-chat/pages/${page.creator_id}/practice-runs`, body);
      if (!runIdRef.current) { runIdRef.current = data.run.id; setRunId(data.run.id); }
      setRuns(rs => (rs ? [data.run, ...rs.filter(x => x.id !== data.run.id)] : rs));
      return data.run.id;
    } catch (e) { console.error('practice save:', errMsg(e, 'failed')); return null; }
  }, [rounds, test, session, models, sells, learned, real, fanId, madeUp, detail, fanTypes, page.creator_id]);
  useEffect(() => {
    if (!rounds.length) return undefined;
    const t = setTimeout(() => { saveRun(); }, 1500);
    return () => clearTimeout(t);
  }, [saveRun, rounds.length]);
  // a kept reply you like: starred into her example library, where it counts more than the analysed chats
  const star = async (roundId) => {
    const id = runIdRef.current || await saveRun();
    if (!id) { toast.error('Could not save the conversation first'); return; }
    try {
      const { data } = await api.post(`/api/ai-chat/pages/${page.creator_id}/practice-runs/${id}/star`, { turn_id: roundId });
      setRounds(rs => rs.map(r => (r.id === roundId ? { ...r, starred: true } : r)));
      setRuns(rs => (rs ? rs.map(x => (x.id === data.run.id ? { ...x, starred: data.run.starred } : x)) : rs));
      toast.success('Starred: it joins her example library');
    } catch (e) { toast.error(errMsg(e, 'Could not star the reply')); }
  };
  // a saved conversation, reopened where it was left (its decision maps included)
  const openRun = async (r) => {
    if (busy || opening) return;
    setOpening(true);
    try {
      const { data } = await api.get(`/api/ai-chat/pages/${page.creator_id}/practice-runs/${r.id}`);
      const run = data.run;
      runIdRef.current = run.id; setRunId(run.id);
      setFanId(run.fan_uuid || MADE_UP); setDetail(run.fan_uuid ? undefined : null);
      setMadeUp(run.made_up ? { name: run.made_up.name || '', notes: run.made_up.notes || '', type: run.made_up.type || 'none' } : { name: '', notes: '', type: 'none' });
      setTest(run.messages || []); setRounds(run.turns || []); setSession(run.session || null); setLearned(run.settings?.learned || []);
      const ms = (run.settings?.models || []).filter(m => writers.some(w => w.id === m)).slice(0, 3);
      if (ms.length) setModels(ms);
      if (typeof run.settings?.selling === 'boolean') setSelling(run.settings.selling);
      setMapId(run.turns?.length ? run.turns[run.turns.length - 1].id : null);
      setRunsOpen(false);
    } catch (e) { toast.error(errMsg(e, 'Could not open the conversation')); }
    finally { setOpening(false); }
  };
  const removeRun = async (r) => {
    if (!window.confirm(`Delete "${r.title}"? Its starred replies stay in her example library.`)) return;
    try {
      const { data } = await api.delete(`/api/ai-chat/pages/${page.creator_id}/practice-runs/${r.id}`);
      setRuns(data.runs);
      if (runIdRef.current === r.id) { runIdRef.current = null; setRunId(null); }
    } catch (e) { toast.error(errMsg(e, 'Could not delete it')); }
  };
  // keep the newest message in view while her messages arrive one by one
  const toBottom = useCallback(() => { const el = scroller.current; if (el) el.scrollTop = el.scrollHeight; }, []);
  const toggleModel = (id) => setModels(m => (m.includes(id) ? (m.length > 1 ? m.filter(x => x !== id) : m) : m.length < 3 ? [...m, id] : m));

  // a kept reply shows once, as her message in the chat (its map link under it), so its card goes
  const roundsAt = (n) => rounds.filter(r => r.at === n && !r.kept).map(round => (
    <div key={round.id} className='flex flex-col gap-2'>
      {round.quiet ? (
        <div className='flex flex-col items-stretch gap-1'>
          <div className='rounded-lg border border-dashed p-3 text-sm text-muted-foreground'>
            <span className='font-medium text-foreground'>She doesn&apos;t answer this one.</span> {round.quiet.text}. Because {round.quiet.why}. Write something real as him and she&apos;s back.
          </div>
          <MapLink onClick={() => setMapId(round.id)} active={mapId === round.id} />
        </div>
      ) : round.screen && ['stop', 'handover', 'wait'].includes(round.screen.action) ? (
        <div className='flex flex-col items-stretch gap-1'>
          <Stopped screen={round.screen} decided={round.decided || null} onDecide={round === rounds[rounds.length - 1] ? (status, terms) => decide(round, status, terms) : null} onFlag={round === rounds[rounds.length - 1] ? (status) => decideFlag(round, status) : null} />
          <MapLink onClick={() => setMapId(round.id)} active={mapId === round.id} />
        </div>
      ) : (
        <>
          {round.screen?.review && <p className='text-xs text-muted-foreground'>Claude checked his message first: {round.screen.review.reason}</p>}
          <div className={cn('grid gap-2', round.results.length > 1 && 'xl:grid-cols-2')}>
            {round.results.map(res => (
              <Draft key={res.model} result={res} startAt={round.askedAt} kept={round.kept === res.model} onGrow={toBottom} creatorId={page.creator_id}
                canKeep={!round.kept && round === rounds[rounds.length - 1]} onKeep={() => keep(round, res)}
                onMap={() => setMapId(round.id)} mapActive={mapId === round.id} />
            ))}
          </div>
          {!round.kept && round.results.length > 1 && <p className='text-xs text-muted-foreground'>If you just write on, the first reply that passed is used.</p>}
        </>
      )}
    </div>
  ));

  const fanLabel = real ? fanName(detail?.fan) || 'a real fan' : clean(madeUp.name) || 'a made-up fan';

  // who he is: a made-up fan's setup, or a real fan's numbers
  const whoPanel = (
    <div className='flex flex-col gap-3'>
      <h3 className='text-xs font-medium uppercase tracking-wide text-muted-foreground'>Who he is</h3>
      <button type='button' onClick={() => pick(MADE_UP)}
        className={cn('flex items-center gap-2 rounded-md border px-3 py-2 text-left text-sm hover:bg-muted/50', fanId === MADE_UP && 'border-primary bg-primary/5')}>
        <UserRoundPlus className='size-4 shrink-0' /><span className='font-medium'>A made-up fan</span>
      </button>
      {!real && (
        <div className='flex flex-col gap-2.5 rounded-md border p-2.5'>
          <div className='grid gap-1.5'>
            <Label htmlFor='mu-name'>His name</Label>
            <Input id='mu-name' value={madeUp.name} onChange={e => setMadeUp(m => ({ ...m, name: e.target.value }))} placeholder='Mike' disabled={test.length > 0} />
          </div>
          <div className='grid gap-1.5'>
            <Label>Who he is</Label>
            <Select value={madeUp.type} onValueChange={v => setMadeUp(m => ({ ...m, type: v }))} disabled={test.length > 0}>
              <SelectTrigger aria-label='Who he is'><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value='none'>Not set</SelectItem>
                {fanTypes.map(t => <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <span className='text-xs text-muted-foreground'>{fanTypes.find(t => t.id === madeUp.type)?.hint || 'The AI knows nothing about him.'}</span>
          </div>
          <div className='grid gap-1.5'>
            <Label htmlFor='mu-notes'>What she knows about him</Label>
            <Textarea id='mu-notes' rows={2} value={madeUp.notes} onChange={e => setMadeUp(m => ({ ...m, notes: e.target.value }))} placeholder='34, truck driver from Texas, has a dog called Max, job interview tomorrow' disabled={test.length > 0} className='min-h-0 resize-none' />
            <span className='text-xs text-muted-foreground'>One note per comma. &quot;Interview tomorrow&quot; or &quot;a date yesterday&quot; become plans with a day.</span>
          </div>
          {test.length > 0 && <span className='text-xs text-muted-foreground'>Start over to change him.</span>}
        </div>
      )}
      {session && (
        <div className='flex flex-col gap-0.5 rounded-md border border-primary/30 bg-primary/5 p-2.5 text-xs'>
          <span className='font-medium'>This conversation: {session.aim.replace(/_/g, ' ')}</span>
          <span className='text-muted-foreground'>{session.aim_text}. Because {session.why}.</span>
          {session.no_sell && <span className='text-warn'>{session.no_sell}.</span>}
          {session.gauges && (
            <div className='mt-1 grid grid-cols-[auto_1fr_auto] items-center gap-x-2 gap-y-0.5' aria-label='The meters'>
              {METERS.map(([k, label]) => (
                <Fragment key={k}>
                  <span className='text-[11px] text-muted-foreground'>{label}</span>
                  <span className='h-1.5 overflow-hidden rounded bg-muted'><span className={cn('block h-1.5 rounded', k === 'doubt' ? 'bg-warn' : 'bg-primary')} style={{ width: `${session.gauges[k]}%` }} /></span>
                  <span className='text-[11px] tabular-nums text-muted-foreground'>{session.gauges[k]}</span>
                </Fragment>
              ))}
            </div>
          )}
          {session.hot && <span className='text-muted-foreground'>Sexting flow on: his short replies keep it going until he cools it, changes the subject, or goes dry.</span>}
          {session.cadence && <span className='text-muted-foreground'>Sell attempts: {session.cadence.text}; {session.cadence.due ? 'one is due today' : `the next in about ${session.cadence.next_in} day${session.cadence.next_in === 1 ? '' : 's'}`}.</span>}
          {session.pause && <span className='text-warn'>After his big spend: {session.pause.why}.</span>}
          {session.taste_text && <span className='text-muted-foreground'>His taste: {session.taste_text}.</span>}
          {session.credit && <span>His ${session.credit.amount} tip: {session.credit.steps ? `${session.credit.steps} story step${session.credit.steps === 1 ? '' : 's'} free` : 'free sexting if he is in the mood'}.</span>}
          {session.service && <span>{session.service.label}, ${session.service.price}: {session.service.state === 'offered' ? 'waiting for his tip' : session.service.state === 'paid' ? `tipped $${session.service.tip}, she delivers` : 'delivered'}</span>}
          {session.roleplay?.on && <span>Roleplay on: {session.roleplay.exchanges} exchange{session.roleplay.exchanges === 1 ? '' : 's'}, PPVs at {Math.round(100 * Math.max(0.3, 1 - session.roleplay.tip / session.roleplay.total))}% of list</span>}
          {session.pending && <span className='text-warn'>An unusual request ("{session.pending.what || session.pending.text}"): {{ hesitant: 'she hesitates, then parks it', waiting: session.pending.parked ? 'parked, the chat goes on; your decision reaches her' : 'she parks it now', approved: 'approved', refused: 'refused' }[session.pending.state]}</span>}
          {session.pending && ['hesitant', 'waiting'].includes(session.pending.state) && rounds.length > 0 && (
            <PendingDecision onDecide={(status, terms) => decide(rounds[rounds.length - 1], status, terms)} />
          )}
          {session.tw && <span className='text-muted-foreground'>Time waster, this time: {session.tw.text}.</span>}
        </div>
      )}
      {real && (detail === undefined ? <Skeleton className='h-16 w-full' /> : detail && (
        <div className='flex flex-col gap-1 rounded-md border p-2.5 text-sm'>
          <span className='font-medium'>{fanName(detail.fan)}{detail.fan.top_spender && <Badge variant='outline' className='ms-1.5 font-normal'>top spender</Badge>}</span>
          <span className='text-xs text-muted-foreground'>{moneyLine(detail.money)}</span>
          <span className='text-xs text-muted-foreground'>{detail.memory ? `${detail.memory.facts.length} notes in memory${detail.memory.built_at ? ` (${shortDay(detail.memory.built_at)})` : ''}` : 'No memory yet (Fan memory tab)'}</span>
        </div>
      ))}
      {learned.length > 0 && (
        <div className='flex flex-col gap-1 rounded-md border border-dashed p-2.5'>
          <span className='text-xs font-medium'>She learned in this chat</span>
          <ul className='list-disc ps-4 text-xs text-muted-foreground'>{learned.map(l => <li key={l}>{l}</li>)}</ul>
          <span className='text-[11px] text-muted-foreground'>Used for the rest of this practice chat only; never saved to his memory.</span>
        </div>
      )}
      <div className='flex flex-col gap-1.5'>
        <button type='button' onClick={() => setRunsOpen(o => !o)} aria-expanded={runsOpen}
          className='flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground'>
          <FolderOpen className='size-3.5' aria-hidden />Saved conversations{runs ? ` (${runs.length})` : ''}
        </button>
        {runId && <span className='text-[11px] text-muted-foreground'>This one is saved as you go, with every decision map. Star a reply you like under it: it joins her example library.</span>}
        {runsOpen && (
          <div className='flex flex-col gap-1'>
            {!runs ? <Skeleton className='h-10 w-full' /> : !runs.length ? <p className='text-xs text-muted-foreground'>Nothing saved yet: a conversation is saved once she has replied.</p> : runs.slice(0, 30).map(r => (
              <div key={r.id} className={cn('flex items-center gap-1 rounded-md border px-2 py-1', runId === r.id && 'border-primary bg-primary/5')}>
                <button type='button' onClick={() => openRun(r)} disabled={busy || opening} className='flex min-w-0 flex-1 flex-col text-left'>
                  <span className='truncate text-xs font-medium'>{r.title}</span>
                  <span className='text-[11px] text-muted-foreground'>{r.turn_count} repl{r.turn_count === 1 ? 'y' : 'ies'} · {shortDay(r.updated_at)}{r.starred ? ` · ${r.starred} starred` : ''}</span>
                </button>
                <button type='button' onClick={() => removeRun(r)} className='rounded p-1 text-muted-foreground hover:text-bad' aria-label={`Delete ${r.title}`}><Trash2 className='size-3.5' aria-hidden /></button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
  // the real fans to pick from
  const fanList = (
    <div className='flex flex-col gap-2'>
      <h3 className='text-xs font-medium uppercase tracking-wide text-muted-foreground'>Or a real fan</h3>
      <div className='relative'>
        <Search className='pointer-events-none absolute start-2.5 top-2.5 size-4 text-muted-foreground' />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder='Find a real fan' className='ps-8' aria-label='Find a fan' />
      </div>
      <div className='flex flex-col gap-1'>
        {!fans ? [0, 1, 2].map(i => <Skeleton key={i} className='h-12 w-full' />) : shown.slice(0, 60).map(f => (
          <button key={f.fan_uuid} type='button' onClick={() => pick(f.fan_uuid)}
            className={cn('flex flex-col rounded-md border px-3 py-1.5 text-left hover:bg-muted/50', fanId === f.fan_uuid && 'border-primary bg-primary/5')}>
            <span className='truncate text-sm font-medium'>{fanName(f)}</span>
            <span className='text-xs text-muted-foreground'>
              {f.fan_messages} from him · {shortDay(f.last_fan_at)}{f.spent > 0 ? ` · $${f.spent}` : ''}{f.memory ? '' : ' · no memory'}
            </span>
          </button>
        ))}
        {fans && !shown.length && <p className='px-1 text-sm text-muted-foreground'>No fan found.</p>}
      </div>
    </div>
  );

  // how she answers: selling on or off, which writers
  const settingsPanel = (
    <div className='flex flex-col gap-3'>
      <h3 className='text-xs font-medium uppercase tracking-wide text-muted-foreground'>How she answers</h3>
      <label className='flex items-start gap-2 text-sm'>
        <Switch checked={sells} onCheckedChange={setSelling} disabled={!contentCount} aria-label='She sells' className='mt-0.5' />
        {contentCount === null ? <span className='text-muted-foreground'>Checking her content…</span> : contentCount
          ? <span>She sells: PPVs from her {contentCount} content item{contentCount === 1 ? '' : 's'}</span>
          : <span className='text-muted-foreground'>She can&apos;t sell yet: add her content first{onContent && <> (<button type='button' className='text-link hover:underline' onClick={onContent}>Her content</button>)</>}</span>}
      </label>
      <div className='flex flex-col gap-1.5'>
        <span className='text-xs text-muted-foreground'>Writers (up to 3)</span>
        <div className='flex flex-wrap gap-1.5'>
          {writers.map(w => (
            <button key={w.id} type='button' onClick={() => toggleModel(w.id)} aria-pressed={models.includes(w.id)}
              className={cn('rounded-full border px-2.5 py-0.5 text-xs', models.includes(w.id) ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted')}>
              {w.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  // the chat: his real chat (if any), then the practice
  const chat = (
    <div ref={scroller} className='flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto rounded-lg border bg-card p-3'>
      {real && detail?.long && <p className='text-center text-xs text-muted-foreground'>A long chat: the AI reads the last 40 messages here, plus the story so far from memory.</p>}
      {real && detail?.messages?.map((m, i) => (
        m.mass
          ? <p key={i} className='mx-auto max-w-[80%] text-center text-xs italic text-muted-foreground'>Mass message, {dayTime(m.sent_at)}: {m.message || m.empty}{m.note ? ` (${m.note})` : ''}</p>
          : <Bubble key={i} fromFan={m.from_fan} meta={`${dayTime(m.sent_at)}${m.note ? ` · ${m.note}` : ''}`}>
              {m.message || m.empty || (m.gif ? '(a gif)' : '(a photo or video)')}
            </Bubble>
      ))}
      {(real ? detail : true) && (
        <div className='my-1 flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground'>
          <span className='h-px flex-1 bg-border' />Practice from here: nothing is sent to Fanvue<span className='h-px flex-1 bg-border' />
        </div>
      )}
      {roundsAt(0)}
      {test.map((m, i) => (
        <div key={`t${i}`} className='flex flex-col gap-2'>
          <Bubble fromFan={m.from === 'fan'} tone='border border-dashed border-current/30' meta={m.from === 'fan' ? 'you, writing as him' : m.note || null}
            onMap={m.roundId ? () => setMapId(m.roundId) : null} mapActive={!!m.roundId && mapId === m.roundId}
            onStar={m.roundId && m.from === 'her' ? () => star(m.roundId) : null} starred={!!m.roundId && !!rounds.find(r => r.id === m.roundId)?.starred}>
            {m.text}
            {m.tip && <span className={cn('flex items-center gap-1 text-xs text-good', m.text && 'mt-1')}><Coins className='size-3' aria-hidden />Tipped ${m.tip}</span>}
            {m.media && (
              <span className={cn('flex items-start gap-1 text-xs', m.text && 'mt-1', m.media.flagged ? 'text-bad' : 'text-muted-foreground')}>
                <Paperclip className='mt-0.5 size-3 shrink-0' aria-hidden />
                <span>{m.media.flagged ? `A ${m.media.video ? 'video' : 'photo'} that was flagged: the AI leaves this chat` : m.media.failed ? `A ${m.media.video ? 'video' : 'photo'} that couldn't be seen` : `A ${m.media.video ? `video (${m.media.frames} frames)` : 'photo'} of ${m.media.kind}: ${m.media.description}`}</span>
              </span>
            )}
          </Bubble>
          {m.ppv && (
            <PpvCard ppv={m.ppv} creatorId={page.creator_id}>
              {i === lastPpvAt && ['pending', 'ignored'].includes(m.ppv.status) && !busy && (
                <div className='mt-1 flex flex-col gap-1'>
                  {/* he wrote past it: what did he do with it? (the AI treats it as still unopened until you say) */}
                  {m.ppv.status === 'pending' && test.slice(i + 1).some(x => x.from === 'fan') && (
                    <span className='font-medium text-warn'>He wrote after it: did he open it?</span>
                  )}
                  <div className='flex flex-wrap gap-1.5'>
                    <Button size='sm' variant='outline' className='h-7 text-xs' onClick={() => setPpv(i, 'bought', 'fast')}>Bought right away</Button>
                    <Button size='sm' variant='outline' className='h-7 text-xs' onClick={() => setPpv(i, 'bought', 'slow')}>Bought after a while</Button>
                    <Button size='sm' variant='outline' className='h-7 text-xs' onClick={() => setPpv(i, 'not_bought')}>Didn&apos;t buy</Button>
                    {m.ppv.status === 'pending' && <Button size='sm' variant='outline' className='h-7 text-xs' onClick={() => setPpv(i, 'ignored')}>Ignores it</Button>}
                  </div>
                </div>
              )}
            </PpvCard>
          )}
          {roundsAt(i + 1)}
        </div>
      ))}
      {busy && <div className='flex items-center gap-2 text-sm text-muted-foreground'><Loader2 className='size-4 animate-spin' />Writing her reply…</div>}
      {!busy && !test.length && !rounds.length && !canAnswerLast && (
        <p className='m-auto text-center text-sm text-muted-foreground'>Write a message as him below to see how she answers.</p>
      )}
    </div>
  );

  // writing as him
  const composerBox = (
    <div className='flex flex-col gap-2'>
      <div className='flex gap-2'>
        <Textarea ref={composer} rows={2} value={text} onChange={e => setText(e.target.value)} placeholder='Write as him… (Enter to send)'
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          disabled={busy || blocked || (real && !detail)} className='min-h-[44px] resize-none' aria-label='Message as the fan' />
        <input ref={fileInput} type='file' accept='image/*,video/*' className='hidden' onChange={e => sendFile(e.target.files?.[0])} aria-label='A photo or video as him' />
        <Button variant='outline' size='icon' onClick={() => fileInput.current?.click()} disabled={busy || looking || blocked || (real && !detail)} className='self-end' title='Send a photo or video as him' aria-label='Send a photo or video as him'>
          {looking ? <Loader2 className='animate-spin' /> : <Paperclip />}
        </Button>
        <Button onClick={send} disabled={busy || blocked || !text.trim() || (real && !detail)} className='self-end'><Send />Send</Button>
      </div>
      <div className='flex flex-wrap items-center gap-2'>
        <div className='flex items-center gap-1'>
          <Input type='number' min='1' value={tip} onChange={e => setTip(e.target.value)} placeholder='$' className='h-8 w-20' aria-label='Tip amount' disabled={busy || blocked} />
          <Button size='sm' variant='outline' onClick={sendTip} disabled={busy || blocked || !Number(tip) || (real && !detail)} title='He sends a tip (with the words in the box, if any)'><Coins />He tips</Button>
        </div>
        {canAnswerLast && <Button size='sm' variant='outline' onClick={() => ask([])} disabled={busy || blocked}><MessageSquareReply />Answer his last message</Button>}
        {(test.length > 0 || rounds.length > 0) && (
          <span className='flex flex-wrap items-center gap-1.5'>
            <Select value={firstKind} onValueChange={setFirstKind}>
              <SelectTrigger className='h-8 w-56 text-xs' aria-label='How she writes first'><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value='nudge'>He went quiet: a nudge</SelectItem>
                <SelectItem value='opener'>A new conversation at his hour</SelectItem>
                <SelectItem value='personal'>Her weekly personal message</SelectItem>
                <SelectItem value='second_try'>A second try, different angle</SelectItem>
              </SelectContent>
            </Select>
            <Button size='sm' variant='outline' onClick={followUp} disabled={busy || blocked}><Hourglass />She writes first</Button>
          </span>
        )}
      </div>
    </div>
  );

  const workspace = (
    <div className={cn('fixed inset-0 z-50 bg-black/50 p-2 sm:p-4', !open && 'hidden')} role='dialog' aria-modal='true' aria-labelledby='practice-title'>
      <div className='mx-auto flex h-full w-full max-w-[1800px] flex-col overflow-hidden rounded-xl border bg-background shadow-lg'>
        <header className='flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5'>
          <div className='flex min-w-0 flex-wrap items-baseline gap-x-3'>
            <h2 id='practice-title' className='text-lg font-semibold'>Practice</h2>
            <span className='truncate text-sm text-muted-foreground'>{page.name} · with {fanLabel} · nothing is sent to Fanvue{runId ? ' · saved' : ''}</span>
          </div>
          <div className='flex items-center gap-2'>
            {open && <ClaudeScore creatorId={page.creator_id} version={rounds.length} />}
            {(test.length > 0 || rounds.length > 0) && <Button size='sm' variant='ghost' onClick={startOver} disabled={busy}><RotateCcw />Start over</Button>}
            <Button size='icon' variant='ghost' onClick={onClose} aria-label='Close practice'><X /></Button>
          </div>
        </header>
        <div className='grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[280px_minmax(0,1fr)_minmax(340px,440px)] lg:overflow-hidden'>
          <aside className='order-3 flex flex-col gap-6 border-t p-3 lg:order-none lg:min-h-0 lg:overflow-y-auto lg:border-r lg:border-t-0'>
            {whoPanel}
            {settingsPanel}
            {fanList}
          </aside>
          <main className='order-1 flex min-h-[70vh] flex-col gap-3 p-3 lg:order-none lg:min-h-0'>
            {!page.has_profile && (
              <div className='flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warn/40 bg-warn/5 px-4 py-3 text-sm'>
                <span>Set up her profile first: the AI needs to know who she is.</span>
                <Button size='sm' onClick={onSetUp}>Her profile</Button>
              </div>
            )}
            {chat}
            {composerBox}
          </main>
          <aside ref={mapPanel} className='order-2 border-t bg-muted/20 p-3 lg:order-none lg:min-h-0 lg:overflow-y-auto lg:border-l lg:border-t-0' aria-label='How she decided'>
            <DecisionMap rounds={rounds} selectedId={mapId || rounds[rounds.length - 1]?.id} onSelect={setMapId} onWhatIf={whatIf} whatIfBusy={whatIfBusy} onMark={mark} />
          </aside>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <div className='flex flex-wrap items-center justify-between gap-4 rounded-lg border p-5'>
        <div className='flex max-w-2xl flex-col gap-1'>
          <span className='font-medium'>Practice room</span>
          <span className='text-sm text-muted-foreground'>Write as a fan, see her reply, and how she decided it step by step: who he is, the moment, the plan, every draft and check.</span>
          {(test.length > 0 || rounds.length > 0) && <span className='text-xs text-muted-foreground'>A practice chat is open: {fanLabel}, {test.length} message{test.length === 1 ? '' : 's'}.</span>}
        </div>
        <Button onClick={onOpen}><Maximize2 />{test.length || rounds.length ? 'Continue practice' : 'Open practice'}</Button>
      </div>
      {createPortal(workspace, document.body)}
    </>
  );
}
