import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '@/services/api';
import { platformInfo } from '@/utils/platforms';
import PlatformBadge from '@/components/shared/PlatformBadge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Copy settings onto this page from another page: the same creator on OnlyFans, Fanvue and Fansly
 * (server/src/utils/pageCopy.js). Copied once; afterwards the pages are separate.
 */
export default function CopyFromPage({ creator, platform, onClose, onCopied }) {
  const [sources, setSources] = useState(null);
  const [from, setFrom] = useState('');
  const [parts, setParts] = useState(new Set(['profile', 'facts', 'rules', 'content', 'scripts']));
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get(`/api/creators/${creator.id}/copy-sources`).then(r => setSources(r.data.sources || [])).catch(() => setSources([])); }, [creator.id]);
  const src = (sources || []).find(s => s.page.id === from);
  const fansly = platform === 'fansly' && src?.page.platform === 'fansly';
  const PARTS = src ? [
    ['profile', 'Creator profile', 'what the AI writes from', src.profile, 'replaces this page’s'],
    ['facts', 'Page facts and AI context', 'what the page has, can’t do, where else she is', src.facts, 'replaces this page’s'],
    ['rules', 'AI rules for the page', `${src.rules} rule${src.rules === 1 ? '' : 's'}`, src.rules > 0, 'added'],
    ['content', 'Content catalogue', `${src.content} item${src.content === 1 ? '' : 's'}, without their media`, src.content > 0, 'added'],
    ['scripts', 'Scripts', `${src.scripts} script${src.scripts === 1 ? '' : 's'}, text only`, src.scripts > 0, 'added'],
    ...(fansly ? [['credit', 'Fansly credit rules', 'who is credited for sales', src.credit, 'replaces this page’s']] : []),
  ] : [];
  const chosen = PARTS.filter(([k, , , has]) => has && parts.has(k)).map(([k]) => k);
  const toggle = (k) => setParts(p => { const n = new Set(p); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const copy = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/api/creators/${creator.id}/copy-from`, { source_id: from, parts: chosen });
      const c = data.copied || {};
      const said = [c.profile && 'the creator profile', c.facts && 'the page facts', c.rules && `${c.rules} rules`, c.content && `${c.content} catalogue items`, c.scripts && `${c.scripts} scripts`, c.credit && 'the credit rules'].filter(Boolean);
      toast.success(said.length ? `Copied ${said.join(', ')} from ${data.from.name}` : 'Nothing new to copy');
      onCopied();
    } catch (e) { toast.error(e?.response?.data?.error || 'Could not copy'); }
    finally { setBusy(false); }
  };
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>Copy settings into {creator.name}</DialogTitle>
          <DialogDescription>From another page of the same creator. Copied once: afterwards the two pages are separate. To keep sharing one creator profile, link it on the AI chat page instead.</DialogDescription>
        </DialogHeader>
        {!sources ? <Skeleton className='h-40 w-full' /> : (
          <div className='grid gap-4'>
            <div className='grid gap-1.5'>
              <Label>Copy from</Label>
              <Select value={from} onValueChange={setFrom}>
                <SelectTrigger className='w-full'><SelectValue placeholder='Pick a page' /></SelectTrigger>
                <SelectContent>{sources.map(s => <SelectItem key={s.page.id} value={s.page.id}><span className='flex items-center gap-2'><PlatformBadge platform={s.page.platform} />{s.page.name}</span></SelectItem>)}</SelectContent>
              </Select>
            </div>
            {src && (
              <div className='grid gap-2'>
                {PARTS.map(([k, label, sub, has, how]) => (
                  <label key={k} className={has ? 'flex items-start gap-2' : 'flex items-start gap-2 opacity-50'}>
                    <Checkbox checked={has && parts.has(k)} disabled={!has} onCheckedChange={() => toggle(k)} className='mt-0.5' />
                    <span className='grid'>
                      <span className='text-sm'>{label} <span className='text-xs text-muted-foreground'>· {has ? how : `${platformInfo(src.page.platform).name} page has none`}</span></span>
                      <span className='text-xs text-muted-foreground'>{sub}</span>
                    </span>
                  </label>
                ))}
                {src.page.platform !== platform && <p className='text-xs text-muted-foreground'>Media can’t move between platforms (each has its own files): copied catalogue items and scripts need their media picked again here.</p>}
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant='ghost' onClick={onClose}>Close</Button>
          <Button disabled={!chosen.length || busy} onClick={copy}>{busy ? 'Copying…' : 'Copy'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
