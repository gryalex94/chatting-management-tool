import { useEffect, useState } from 'react';
import { ImageOff, Loader2, Play } from 'lucide-react';
import api from '@/services/api';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

// Previews of her files, straight from her Fanvue vault (its links expire: fetched
// fresh, kept a few minutes). Previews wanted within a moment go in one request.
const cache = new Map();                 // assetId → { url, at }
const problems = new Map();              // creatorId → why there are no previews (e.g. Fanvue needs connecting again)
const FRESH = 15 * 60_000;
const queues = new Map();                // creatorId → { ids, waiters, timer }

function request(creatorId, ids) {
  const want = ids.filter(id => !(cache.get(id) && Date.now() - cache.get(id).at < FRESH));
  if (!want.length) return Promise.resolve();
  const q = queues.get(creatorId) || { ids: new Set(), waiters: [], timer: null };
  queues.set(creatorId, q);
  want.forEach(id => q.ids.add(id));
  return new Promise((resolve) => {
    q.waiters.push(resolve);
    clearTimeout(q.timer);
    q.timer = setTimeout(async () => {
      queues.delete(creatorId);
      const batch = [...q.ids];
      try {
        for (let i = 0; i < batch.length; i += 100) {
          const part = batch.slice(i, i + 100);
          const { data } = await api.post(`/api/ai-chat/pages/${creatorId}/library/previews`, { ids: part });
          if (data.problem) problems.set(creatorId, data.problem); else problems.delete(creatorId);
          // no preview because of a passing problem: not kept, so it's asked again later
          for (const id of part) if (data.previews?.[id] || !data.problem) cache.set(id, { url: data.previews?.[id] || null, at: Date.now() });
        }
      } catch { problems.set(creatorId, 'The previews couldn\'t be loaded just now.'); }
      q.waiters.forEach(w => w());
    }, 60);
  });
}

/** Preview links for these assets: { assetId: url | null } (undefined while loading). */
function useThumbs(creatorId, ids) {
  const key = ids.join(',');
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!key) return undefined;
    let live = true;
    request(creatorId, key.split(',').map(Number)).then(() => { if (live) setTick(t => t + 1); });
    return () => { live = false; };
  }, [creatorId, key]);
  return Object.fromEntries(ids.map(id => [id, cache.has(id) ? cache.get(id).url : problems.has(creatorId) ? null : undefined]));
}

// One file, large: the full photo, or the video playing.
function Large({ creatorId, id, onClose }) {
  const [file, setFile] = useState(null);           // { url, kind } | { problem }
  useEffect(() => {
    let live = true;
    api.post(`/api/ai-chat/pages/${creatorId}/library/previews`, { ids: [id], large: true })
      .then(({ data }) => { if (live) setFile(data.previews?.[id] ? { url: data.previews[id], kind: data.kinds?.[id] } : { problem: data.problem || 'No preview from Fanvue for this one.' }); })
      .catch(() => { if (live) setFile({ problem: 'The preview couldn\'t be loaded just now.' }); });
    return () => { live = false; };
  }, [creatorId, id]);
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className='max-w-xl'>
        <DialogHeader>
          <DialogTitle>From her vault</DialogTitle>
          <DialogDescription>Straight from Fanvue; nothing is saved in the tool.</DialogDescription>
        </DialogHeader>
        <div className='flex min-h-40 items-center justify-center'>
          {!file ? <Loader2 className='size-5 animate-spin text-muted-foreground' />
            : file.problem ? <p className='text-sm text-muted-foreground'>{file.problem}</p>
              : file.kind === 'video' ? <video src={file.url} controls autoPlay muted loop playsInline className='max-h-[70vh] rounded' />
                : <img src={file.url} alt='' className='max-h-[70vh] rounded object-contain' />}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * A row of previews, blurred until hovered (her content is explicit); a click opens
 * the full photo or the video. `size`: 'sm' (in lists) or 'md' (her vault).
 */
export default function Thumbs({ creatorId, ids = [], videos = [], size = 'sm', className }) {
  const urls = useThumbs(creatorId, ids);
  const [open, setOpen] = useState(null);
  if (!ids.length) return null;
  const problem = problems.get(creatorId);
  return (
    <div className={cn('flex flex-wrap gap-1', className)}>
      {ids.map(id => (
        <button key={id} type='button' onClick={() => setOpen(id)} aria-label='See it large'
          title={urls[id] ? 'Click to see it large' : urls[id] === null ? (problem || 'No preview') : 'Loading…'}
          className={cn('relative shrink-0 overflow-hidden rounded bg-muted', size === 'md' ? 'h-28 w-16' : 'h-14 w-8')}>
          {urls[id] ? <img src={urls[id]} alt='' loading='lazy' className='size-full object-cover blur-sm transition hover:blur-none' />
            : urls[id] === null ? <ImageOff className='absolute inset-0 m-auto size-4 text-muted-foreground' /> : null}
          {videos.includes(id) && <Play className='absolute bottom-0.5 right-0.5 size-3 fill-white text-white drop-shadow' />}
        </button>
      ))}
      {open && <Large creatorId={creatorId} id={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
