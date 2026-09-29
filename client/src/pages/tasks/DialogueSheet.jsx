import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowDown, ExternalLink, History, Link2, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/services/api';
import { fmtSentAt, areaMeta, reasonLabel, inflowwChatLink } from '@/utils/taskMeta';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import FanLabel from '@/components/shared/FanLabel';

const CLASS_LABEL = { whale: 'Whale', ps: 'Spender', regular: 'Buyer' };
const STATUS_LABEL = { open: 'Open', taken: 'Taken', completed: 'Completed', dismissed: 'Dismissed', archived: 'Archived' };

/**
 * The conversation behind a task, read in the app instead of copying the
 * username into Infloww. Shows who the fan is, every other task about them, and
 * the messages around the flagged one (highlighted). "Load more" brings in the
 * next batch of earlier messages, "Load newer" the later ones.
 * `fan` picks one fan out of a multi-fan task (reply-time / keyword rows).
 */
export default function DialogueSheet({ task, fan, onClose, onLinked }) {
  const [data, setData] = useState(null);
  const [messages, setMessages] = useState([]);
  const [hasOlder, setHasOlder] = useState(false);
  const [hasNewer, setHasNewer] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(null);   // 'older' | 'newer' | null
  const [reload, setReload] = useState(0);
  const listRef = useRef(null);
  const focusRef = useRef(null);
  const openOnFocus = useRef(false);   // scroll to the flagged message after the first load
  const keepPlace = useRef(null);      // scroll position to hold while older messages go in above

  useEffect(() => {
    let live = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true); setError('');
    const q = new URLSearchParams();
    if (fan) q.set('fan', fan);
    api.get(`/api/review-tasks/${task.id}/dialogue?${q}`)
      .then(r => {
        if (!live) return;
        openOnFocus.current = true;
        setData(r.data);
        setMessages(r.data.messages || []);
        setHasOlder(!!r.data.has_older);
        setHasNewer(!!r.data.has_newer);
      })
      .catch(e => { if (live) setError(e?.response?.data?.error || 'Could not load the conversation'); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [task.id, fan, reload]);

  const loadMore = async (dir) => {
    if (loadingMore || !messages.length) return;
    const edge = dir === 'older' ? messages[0] : messages[messages.length - 1];
    const key = dir === 'older' ? 'before' : 'after';
    const q = new URLSearchParams({ [key]: edge.sent_at, [`${key}_id`]: edge.id });
    if (fan) q.set('fan', fan);
    setLoadingMore(dir);
    try {
      const { data: r } = await api.get(`/api/review-tasks/${task.id}/dialogue?${q}`);
      const have = new Set(messages.map(m => m.id));
      const fresh = (r.messages || []).filter(m => !have.has(m.id));
      if (dir === 'older') {
        const el = listRef.current;
        if (el) keepPlace.current = { height: el.scrollHeight, top: el.scrollTop };
        setMessages(ms => [...fresh, ...ms]);
        setHasOlder(!!r.has_older);
      } else {
        setMessages(ms => [...ms, ...fresh]);
        setHasNewer(!!r.has_newer);
      }
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not load more messages');
    } finally { setLoadingMore(null); }
  };

  const focus = data?.focus;
  // The message the task points at: exact time match, else the nearest one.
  let focusId = null;
  if (focus && messages.length) {
    const target = Date.parse(focus);
    focusId = messages.reduce((best, m) =>
      Math.abs(Date.parse(m.sent_at) - target) < Math.abs(Date.parse(best.sent_at) - target) ? m : best).id;
  }
  const openId = focusId || data?.anchor_id || null;

  // After the first load, open on the flagged message; after "Load more", keep the
  // reader's place instead of jumping (the new messages go in above).
  useLayoutEffect(() => {
    const el = listRef.current;
    if (keepPlace.current && el) {
      el.scrollTop = keepPlace.current.top + (el.scrollHeight - keepPlace.current.height);
      keepPlace.current = null;
    } else if (openOnFocus.current && focusRef.current) {
      focusRef.current.scrollIntoView({ block: 'center' });
      openOnFocus.current = false;
    }
  }, [messages]);

  const info = data?.fan_info;

  // Open this chat in Infloww, on the page of the flagged message (else the latest one).
  const pageMsg = messages.find(m => m.id === focusId) || messages[messages.length - 1];
  const inflowwLink = inflowwChatLink(pageMsg?.page_infloww_id, data?.fan_username,
    data?.fan_of_id ? { [data.fan_username]: data.fan_of_id } : {});

  return (
    <Sheet open onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent className='flex w-full flex-col gap-0 p-0 sm:max-w-xl'>
        <SheetHeader className='border-b'>
          <SheetTitle className='text-base'>
            {data ? (
              <FanLabel username={data.fan_username} info={data.fan_name ? { name: data.fan_name, shared: data.name_shared } : null} />
            ) : (fan || task.fan_username || 'Conversation')}
          </SheetTitle>
          <SheetDescription>
            {!data ? 'Loading…' : messages.length
              ? `${messages.length} message${messages.length === 1 ? '' : 's'} · ${fmtSentAt(messages[0].sent_at)} to ${fmtSentAt(messages[messages.length - 1].sent_at)}`
              : 'No messages yet'}
          </SheetDescription>
          {info && (
            <div className='flex flex-wrap items-center gap-1.5 pt-1'>
              <Badge variant='outline' className={cn('font-semibold tabular-nums', info.total_spend >= 1000 ? 'text-violet-500' : info.total_spend > 0 ? 'text-good' : 'text-muted-foreground')}>
                ${info.total_spend} spent
              </Badge>
              {CLASS_LABEL[info.classification] && <Badge variant='secondary'>{CLASS_LABEL[info.classification]}</Badge>}
              {info.first_seen && <Badge variant='outline' className='font-normal'>First message {fmtSentAt(info.first_seen).split(',')[0]}</Badge>}
              {info.last_spend_date && <Badge variant='outline' className='font-normal'>Last purchase {info.last_spend_date}</Badge>}
            </div>
          )}
          {inflowwLink && (
            <Button asChild size='sm' className='mt-1 w-fit'>
              <a href={inflowwLink}><ExternalLink />Open in Infloww{pageMsg?.page ? ` (${pageMsg.page})` : ''}</a>
            </Button>
          )}
          {data && !inflowwLink && messages.length > 0 && (
            <LinkToInfloww username={data.fan_username} missingFan={!data.fan_of_id} missingPage={!pageMsg?.page_infloww_id}
              onDone={(r) => { onLinked?.(r); setReload(n => n + 1); }} />
          )}
        </SheetHeader>

        {data?.related?.length > 0 && (
          <details className='border-b px-4 py-2 text-sm'>
            <summary className='cursor-pointer font-medium'>{data.related.length} other task{data.related.length === 1 ? '' : 's'} about this fan</summary>
            <ul className='mt-2 space-y-1.5'>
              {data.related.map(r => (
                <li key={r.id} className='flex flex-wrap items-center gap-1.5 text-xs'>
                  <span className='text-muted-foreground'>{r.first_seen_date}</span>
                  <Badge variant='secondary' className='font-normal'>{areaMeta(r.area).label}</Badge>
                  <Badge variant='outline' className='font-normal'>
                    {STATUS_LABEL[r.status] || r.status}{r.dismiss_reason_code ? `: ${reasonLabel[r.dismiss_reason_code] || r.dismiss_reason_code}` : ''}
                  </Badge>
                  {r.chatter_name && <span className='text-muted-foreground'>{r.chatter_name}</span>}
                  <span className='w-full truncate text-muted-foreground'>{r.title}</span>
                </li>
              ))}
            </ul>
          </details>
        )}

        <div ref={listRef} className='flex-1 overflow-y-auto px-4 py-3'>
          {error ? (
            <p className='py-8 text-center text-sm text-muted-foreground'>{error}</p>
          ) : loading && !data ? (
            <div className='space-y-3'>{[0, 1, 2, 3].map(i => <Skeleton key={i} className={cn('h-12', i % 2 ? 'ms-auto w-3/4' : 'w-2/3')} />)}</div>
          ) : !messages.length ? (
            <p className='py-8 text-center text-sm text-muted-foreground'>No messages with this fan in the uploaded chats.</p>
          ) : (
            <div className={cn('space-y-2', loading && 'opacity-50')}>
              {hasOlder ? (
                <Button variant='outline' size='sm' className='mb-1 w-full' disabled={!!loadingMore} onClick={() => loadMore('older')}>
                  {loadingMore === 'older' ? <Loader2 className='animate-spin' /> : <History />}Load more
                </Button>
              ) : (
                <p className='pb-1 text-center text-[11px] text-muted-foreground'>No earlier messages in the uploaded chats</p>
              )}
              {messages.map(m => (
                <div key={m.id} ref={m.id === openId ? focusRef : undefined}
                  className={cn('space-y-1 rounded-md p-1', m.id === focusId && 'bg-warn/10 ring-1 ring-warn/50')}>
                  <p className='text-center text-[11px] text-muted-foreground'>{fmtSentAt(m.sent_at)}{m.page ? ` · ${m.page}` : ''}{m.sender_name ? ` · ${m.sender_name}` : ''}</p>
                  {m.fan_message && (
                    <div className='w-fit max-w-[85%] whitespace-pre-wrap rounded-lg rounded-bl-sm bg-muted px-3 py-2 text-sm'>{m.fan_message}</div>
                  )}
                  {m.chatter_message && (
                    <div className='ms-auto w-fit max-w-[85%] whitespace-pre-wrap rounded-lg rounded-br-sm bg-primary px-3 py-2 text-sm text-primary-foreground'>
                      {m.chatter_message}
                      {m.price > 0 && (
                        <span className={cn('mt-1 block text-xs font-semibold', m.purchased ? 'text-good' : 'opacity-70')}>
                          PPV ${m.price} · {m.purchased ? 'bought' : 'not bought'}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ))}
              {hasNewer && (
                <Button variant='outline' size='sm' className='mt-1 w-full' disabled={!!loadingMore} onClick={() => loadMore('newer')}>
                  {loadingMore === 'newer' ? <Loader2 className='animate-spin' /> : <ArrowDown />}Load newer
                </Button>
              )}
            </div>
          )}
          {loading && data && <Loader2 className='mx-auto mt-3 size-4 animate-spin text-muted-foreground' />}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/**
 * When "Open in Infloww" can't be built yet: the manager pastes this fan's chat
 * link from Infloww once (chat → ⋮ → Copy chat link). The server keeps the fan's
 * ID — and the page's, if that's missing too — so the button works for everyone.
 */
function LinkToInfloww({ username, missingFan, missingPage, onDone }) {
  const [link, setLink] = useState('');
  const [saving, setSaving] = useState(false);
  const why = missingFan
    ? "We don't know this fan's Infloww ID yet (they changed their username)."
    : "This page's Infloww ID isn't set yet.";
  const save = async () => {
    if (!link.trim()) return;
    setSaving(true);
    try {
      const { data } = await api.post('/api/review-tasks/fan-link', { username, link: link.trim() });
      toast.success(data.page?.set ? `Linked, and ${data.page.name}'s Infloww ID saved too` : 'Linked. "Open in Infloww" now works for this fan');
      setLink('');
      onDone(data);
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not save the link');
    } finally { setSaving(false); }
  };
  return (
    <div className='mt-1 grid gap-1.5 rounded-md border border-dashed p-2.5'>
      <p className='text-xs text-muted-foreground'>
        {why} In Infloww, open this fan&apos;s chat, click <b>⋮</b> then <b>Copy chat link</b>, and paste it here once.
        {missingPage && !missingFan ? ' Or set it in Settings → the page.' : ''}
      </p>
      <div className='flex gap-2'>
        <Input value={link} onChange={e => setLink(e.target.value)} placeholder='https://chatlink.infloww.com?cid=…&fid=…'
          className='h-8 text-xs' onKeyDown={e => { if (e.key === 'Enter') save(); }} />
        <Button size='sm' variant='outline' disabled={!link.trim() || saving} onClick={save}><Link2 />{saving ? 'Saving…' : 'Link'}</Button>
      </div>
    </div>
  );
}
