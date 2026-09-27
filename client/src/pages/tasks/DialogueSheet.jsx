import { useEffect, useRef, useState } from 'react';
import { ExternalLink, History, Loader2 } from 'lucide-react';
import api from '@/services/api';
import { fmtSentAt, areaMeta, reasonLabel, inflowwChatLink } from '@/utils/taskMeta';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import FanLabel from '@/components/shared/FanLabel';

// How far back "Show earlier" reaches, step by step (days before the task's day).
const DAY_STEPS = [1, 3, 7, 14, 30];
const CLASS_LABEL = { whale: 'Whale', ps: 'Spender', regular: 'Buyer' };
const STATUS_LABEL = { open: 'Open', taken: 'Taken', completed: 'Completed', dismissed: 'Dismissed', archived: 'Archived' };

/**
 * The conversation behind a task, read in the app instead of copying the
 * username into Infloww. Shows who the fan is, every other task about them, and
 * the messages around the task's day with the flagged message highlighted.
 * `fan` picks one fan out of a multi-fan task (reply-time / keyword rows).
 */
export default function DialogueSheet({ task, fan, onClose }) {
  const [step, setStep] = useState(0);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const focusRef = useRef(null);

  useEffect(() => {
    let live = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true); setError('');
    const q = new URLSearchParams({ days: String(DAY_STEPS[step]) });
    if (fan) q.set('fan', fan);
    api.get(`/api/review-tasks/${task.id}/dialogue?${q}`)
      .then(r => { if (live) setData(r.data); })
      .catch(e => { if (live) setError(e?.response?.data?.error || 'Could not load the conversation'); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [task.id, fan, step]);

  // Bring the flagged message into view once the conversation is in.
  useEffect(() => {
    if (!loading && focusRef.current) focusRef.current.scrollIntoView({ block: 'center' });
  }, [loading, data]);

  const info = data?.fan_info;
  const focus = data?.focus;
  // The message the task points at: exact time match, else the nearest one.
  let focusId = null;
  if (focus && data?.messages?.length) {
    const target = Date.parse(focus);
    focusId = data.messages.reduce((best, m) =>
      Math.abs(Date.parse(m.sent_at) - target) < Math.abs(Date.parse(best.sent_at) - target) ? m : best).id;
  }

  // Open this chat in Infloww, on the page of the flagged message (else the latest one).
  const pageMsg = data?.messages?.find(m => m.id === focusId) || data?.messages?.[data.messages.length - 1];
  const inflowwLink = inflowwChatLink(pageMsg?.page_infloww_id, data?.fan_username);

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
            {data ? `${fmtSentAt(data.from)} to ${fmtSentAt(data.to)}` : 'Loading…'}
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

        <div className='flex-1 overflow-y-auto px-4 py-3'>
          {step < DAY_STEPS.length - 1 && !error && (
            <Button variant='outline' size='sm' className='mb-3 w-full' disabled={loading} onClick={() => setStep(s => s + 1)}>
              <History />Show earlier ({DAY_STEPS[step + 1]} days before)
            </Button>
          )}
          {error ? (
            <p className='py-8 text-center text-sm text-muted-foreground'>{error}</p>
          ) : loading && !data ? (
            <div className='space-y-3'>{[0, 1, 2, 3].map(i => <Skeleton key={i} className={cn('h-12', i % 2 ? 'ms-auto w-3/4' : 'w-2/3')} />)}</div>
          ) : !data?.messages?.length ? (
            <p className='py-8 text-center text-sm text-muted-foreground'>No messages with this fan in this window.</p>
          ) : (
            <div className={cn('space-y-2', loading && 'opacity-50')}>
              {data.messages.map(m => (
                <div key={m.id} ref={m.id === focusId ? focusRef : undefined}
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
            </div>
          )}
          {loading && data && <Loader2 className='mx-auto mt-3 size-4 animate-spin text-muted-foreground' />}
        </div>
      </SheetContent>
    </Sheet>
  );
}
