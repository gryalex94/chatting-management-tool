import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Clock, Film, Image as ImageIcon, MessageSquare, Plus, Trash2 } from 'lucide-react';
import api from '@/services/api';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';

const len = (s) => (s == null ? '' : s >= 60 ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : `0:${String(Math.round(s)).padStart(2, '0')}`);
const day = (iso) => (iso ? new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short', year: '2-digit' }) : '');
/** A vault item as people know it: its name, else photo/video with its length and date. */
const mediaLabel = (m) => (m ? m.filename || `${m.type === 2 ? 'Video' : 'Photo'}${m.duration_s ? ` ${len(m.duration_s)}` : ''}${m.created_at_fansly ? ` · ${day(m.created_at_fansly)}` : ''}` : 'Vault item');

/**
 * A Fansly script's steps: text, vault media (free, or a PPV with a price; several items make a
 * bundle) and "wait for his reply". The side panel walks a fan through them one step at a time and
 * fills Fansly's message box; the chatter always presses Send.
 */
export default function ScriptSteps({ steps, onChange, accounts, account }) {
  const [picking, setPicking] = useState(null);       // the step index whose media is being picked
  const [known, setKnown] = useState({});             // media id → the vault item, for the labels
  const set = (i, patch) => onChange(steps.map((s, k) => (k === i ? { ...s, ...patch } : s)));
  const move = (i, d) => { const j = i + d; if (j < 0 || j >= steps.length) return; const n = [...steps]; [n[i], n[j]] = [n[j], n[i]]; onChange(n); };
  const add = (kind) => onChange([...steps, kind === 'media' ? { kind, text: '', media_ids: [], price: 10 } : kind === 'wait' ? { kind } : { kind, text: '' }]);
  const page = account && account !== 'all' ? account : accounts[0]?.id;

  return (
    <div className='grid gap-2'>
      {steps.map((s, i) => (
        <div key={i} className='rounded-md border p-2'>
          <div className='mb-1.5 flex items-center gap-2 text-xs'>
            <Badge variant='secondary'>{i + 1}</Badge>
            {s.kind === 'text' ? <span className='flex items-center gap-1'><MessageSquare className='size-3.5' />Text</span>
              : s.kind === 'media' ? <span className='flex items-center gap-1'><Film className='size-3.5' />{s.price > 0 ? `PPV $${Number(s.price).toFixed(2)}` : 'Free media'}{s.media_ids?.length > 1 ? ` · bundle of ${s.media_ids.length}` : ''}</span>
                : <span className='flex items-center gap-1 text-muted-foreground'><Clock className='size-3.5' />Wait for his reply</span>}
            <span className='ml-auto flex gap-0.5'>
              <Button size='icon' variant='ghost' className='size-6' disabled={i === 0} onClick={() => move(i, -1)} aria-label='Move up'><ArrowUp className='size-3.5' /></Button>
              <Button size='icon' variant='ghost' className='size-6' disabled={i === steps.length - 1} onClick={() => move(i, 1)} aria-label='Move down'><ArrowDown className='size-3.5' /></Button>
              <Button size='icon' variant='ghost' className='size-6' onClick={() => onChange(steps.filter((_, k) => k !== i))} aria-label='Remove step'><Trash2 className='size-3.5' /></Button>
            </span>
          </div>
          {s.kind !== 'wait' && (
            <Textarea rows={2} value={s.text || ''} maxLength={4000} placeholder={s.kind === 'media' ? 'The text with it (optional): want to see what happened next? 😈' : 'hey {name}, just got out of the shower…'}
              onChange={e => set(i, { text: e.target.value })} />
          )}
          {s.kind === 'media' && (
            <div className='mt-1.5 grid gap-1.5'>
              <div className='flex flex-wrap gap-1'>
                {(s.media_ids || []).map(id => <Badge key={id} variant='outline' className='font-normal'>{mediaLabel(known[id])}</Badge>)}
                <Button size='sm' variant='outline' className='h-6 px-2 text-xs' disabled={!page} onClick={() => setPicking(i)}>{s.media_ids?.length ? 'Change media' : 'Pick from the vault'}</Button>
              </div>
              <div className='flex items-center gap-2 text-sm'>
                <Label className='text-xs text-muted-foreground'>Price</Label>
                <Input className='h-7 w-24' type='number' min='0' max='1000' step='0.01' value={s.price ?? 0} onChange={e => set(i, { price: e.target.value === '' ? 0 : Number(e.target.value) })} />
                <span className='text-xs text-muted-foreground'>{Number(s.price) > 0 ? 'PPV' : 'free'}</span>
              </div>
            </div>
          )}
        </div>
      ))}
      <div className='flex flex-wrap gap-1'>
        <Button size='sm' variant='outline' onClick={() => add('text')}><Plus className='size-3.5' />Text</Button>
        <Button size='sm' variant='outline' onClick={() => add('media')}><Plus className='size-3.5' />Media / PPV</Button>
        <Button size='sm' variant='outline' onClick={() => add('wait')}><Plus className='size-3.5' />Wait for his reply</Button>
      </div>
      {picking != null && page && (
        <VaultPicker account={page} accounts={accounts} chosen={steps[picking]?.media_ids || []}
          onClose={() => setPicking(null)}
          onPick={(ids, items) => { setKnown(k => ({ ...k, ...Object.fromEntries(items.map(m => [m.media_id, m])) })); set(picking, { media_ids: ids }); setPicking(null); }} />
      )}
    </div>
  );
}

/** The page's vault as the extension saw it: albums, photos or videos, a search on the name. */
function VaultPicker({ account, accounts, chosen, onClose, onPick }) {
  const [acc, setAcc] = useState(account);
  const [album, setAlbum] = useState('all');
  const [type, setType] = useState('all');
  const [q, setQ] = useState('');
  const [data, setData] = useState(null);
  const [sel, setSel] = useState(() => new Map(chosen.map(id => [id, { media_id: id }])));
  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      const p = new URLSearchParams({ account: acc });
      if (album !== 'all') p.set('album', album);
      if (type !== 'all') p.set('type', type);
      if (q.trim()) p.set('q', q.trim());
      api.get(`/api/fansly/scripts/vault?${p}`).then(r => { if (live) setData(r.data); }).catch(() => { if (live) setData({ media: [], albums: [], total: 0 }); });
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [acc, album, type, q]);
  const toggle = (m) => setSel(s => { const n = new Map(s); if (n.has(m.media_id)) n.delete(m.media_id); else n.set(m.media_id, m); return n; });
  const albumName = (a) => a.title || `Album ${a.pos ?? ''} · ${a.item_count ?? '?'} items`;
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className='sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle>Pick from the vault</DialogTitle>
          <DialogDescription>The vault as the extension saw it: open Fansly&apos;s Vault with the extension on to add the rest. Several items go as one bundle.</DialogDescription>
        </DialogHeader>
        <div className='flex flex-wrap gap-2'>
          {accounts.length > 1 && (
            <Select value={acc} onValueChange={setAcc}>
              <SelectTrigger className='w-44'><SelectValue /></SelectTrigger>
              <SelectContent>{accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.page}</SelectItem>)}</SelectContent>
            </Select>
          )}
          <Select value={album} onValueChange={setAlbum}>
            <SelectTrigger className='w-48'><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>All albums</SelectItem>
              {(data?.albums || []).map(a => <SelectItem key={a.album_id} value={a.album_id}>{albumName(a)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className='w-32'><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value='all'>Photos and videos</SelectItem><SelectItem value='2'>Videos</SelectItem><SelectItem value='1'>Photos</SelectItem></SelectContent>
          </Select>
          <Input className='w-44 flex-1' placeholder='Search the name' value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <div className='max-h-[50vh] overflow-y-auto rounded-md border'>
          {!data ? <Skeleton className='h-40 w-full' /> : !data.media.length ? <p className='p-6 text-center text-sm text-muted-foreground'>Nothing here yet. Open the Vault on Fansly with the extension on and its media appears here.</p> : (
            data.media.map(m => (
              <button key={m.media_id} type='button' onClick={() => toggle(m)}
                className={cn('flex w-full items-center gap-3 border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-muted', sel.has(m.media_id) && 'bg-primary/10')}>
                {m.type === 2 ? <Film className='size-4 text-muted-foreground' /> : <ImageIcon className='size-4 text-muted-foreground' />}
                <span className='min-w-0 flex-1 truncate'>{mediaLabel(m)}</span>
                <span className='text-xs text-muted-foreground'>{m.width && m.height ? `${m.width}×${m.height}` : ''}</span>
                {m.chats && <span className='text-xs text-muted-foreground' title='In chats: times sent as a PPV item, times bought'>sent {m.chats.sent}× · bought {m.chats.sales}×</span>}
                <input type='checkbox' readOnly checked={sel.has(m.media_id)} className='size-4' />
              </button>
            ))
          )}
        </div>
        <DialogFooter>
          <span className='mr-auto text-xs text-muted-foreground'>{data ? `${data.total} item${data.total === 1 ? '' : 's'}` : ''}{sel.size ? ` · ${sel.size} picked` : ''}</span>
          <Button variant='ghost' onClick={onClose}>Cancel</Button>
          <Button disabled={!sel.size} onClick={() => onPick([...sel.keys()], [...sel.values()])}>Use {sel.size || ''}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
