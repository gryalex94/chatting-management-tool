import { useEffect, useState } from 'react';
import { ImageOff, Play } from 'lucide-react';
import api from '@/services/api';
import { cn } from '@/lib/utils';

// Small previews of her files (Fanvue's links expire: fetched fresh, kept a few minutes).
// Asked for together: previews wanted within a moment go in one request.
const cache = new Map();                 // assetId → { url, at }
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
          for (const id of part) cache.set(id, { url: data.previews?.[id] || null, at: Date.now() });
        }
      } catch { /* no previews this time */ }
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
  return Object.fromEntries(ids.map(id => [id, cache.has(id) ? cache.get(id).url : undefined]));
}

/** A row of small previews, blurred until hovered (her content is explicit). */
export default function Thumbs({ creatorId, ids = [], videos = [], className }) {
  const urls = useThumbs(creatorId, ids);
  if (!ids.length) return null;
  return (
    <div className={cn('flex flex-wrap gap-1', className)}>
      {ids.map(id => (
        <div key={id} className='relative h-14 w-8 overflow-hidden rounded bg-muted' title='Hover to see'>
          {urls[id] ? <img src={urls[id]} alt='' loading='lazy' className='size-full object-cover blur-sm transition hover:blur-none' />
            : urls[id] === null ? <ImageOff className='m-auto mt-4 size-4 text-muted-foreground' /> : null}
          {videos.includes(id) && <Play className='absolute bottom-0.5 right-0.5 size-3 fill-white text-white drop-shadow' />}
        </div>
      ))}
    </div>
  );
}
