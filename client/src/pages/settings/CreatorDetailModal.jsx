import { useState, useEffect } from 'react';
import { Trash2, TriangleAlert } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/services/api';
import { Avatar } from '@/components/shared';
import PageContextFields, { cleanContext } from '@/components/shared/PageContextFields';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';

/**
 * Everything about one creator page in one place: identity, the AI context used
 * when reviewing its dialogues, and removal. Lives in Settings rather than the
 * shift board because a page's conditions belong to the page, not to whichever
 * shift happens to be covering it — one shift often runs several pages, and each
 * of those pages has different rules.
 */
export default function CreatorDetailModal({ creator, isAdmin, onClose, onChanged }) {
  const [name, setName] = useState(creator.name);
  const [ctx, setCtx] = useState(() => ({ ...(creator.ai_context || {}) }));
  const [text, setText] = useState(creator.ai_instructions || '');
  const [usage, setUsage] = useState(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    api.get(`/api/creators/${creator.id}/usage`).then(r => setUsage(r.data)).catch(() => setUsage(null));
  }, [creator.id]);

  const dirty = name !== creator.name
    || text !== (creator.ai_instructions || '')
    || JSON.stringify(cleanContext(ctx)) !== JSON.stringify(creator.ai_context || null);

  async function save() {
    setSaving(true);
    try {
      await api.put(`/api/creators/${creator.id}`, {
        name: name.trim() || creator.name,
        ai_instructions: text.trim(),
        ai_context: cleanContext(ctx),
      });
      toast.success('Saved');
      onChanged();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save');
    } finally { setSaving(false); }
  }

  async function remove() {
    try {
      await api.delete(`/api/creators/${creator.id}`);
      toast.success(`${creator.name} deleted`);
      onChanged();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not delete');
    }
  }

  async function deactivate() {
    try {
      await api.put(`/api/creators/${creator.id}`, { is_active: false });
      toast.success(`${creator.name} deactivated`);
      onChanged();
      onClose();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className='flex max-h-[88vh] flex-col gap-0 p-0 sm:max-w-xl'>
        <DialogHeader className='flex-row items-center gap-3 space-y-0 border-b py-4 ps-6 pe-12 text-left'>
          <Avatar name={creator.name} size={36} />
          <div className='min-w-0 flex-1'>
            <DialogTitle className='truncate'>{creator.name}</DialogTitle>
            <DialogDescription className='tabular-nums'>
              {usage
                ? `${usage.messages.toLocaleString()} messages · ${usage.daily_stats} stat days · ${usage.tasks} tasks`
                : 'Loading history…'}
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className='grid gap-6 overflow-y-auto px-6 py-5'>
          <div className='grid gap-2'>
            <Label htmlFor='creator-name'>Page name</Label>
            <Input id='creator-name' value={name} onChange={e => setName(e.target.value)} disabled={!isAdmin} />
          </div>

          <section className='grid gap-3'>
            <div>
              <h3 className='text-sm font-semibold'>AI page context</h3>
              <Separator className='mt-2' />
            </div>
            <PageContextFields ctx={ctx} setCtx={setCtx} text={text} setText={setText} disabled={!isAdmin} />
          </section>

          {isAdmin && (
            <section className='grid gap-3'>
              <div>
                <h3 className='text-sm font-semibold text-bad'>Danger zone</h3>
                <Separator className='mt-2' />
              </div>
              {usage && !usage.deletable ? (
                <div className='flex gap-3 rounded-lg border bg-muted/40 p-3'>
                  <TriangleAlert className='mt-0.5 size-4 shrink-0 text-warn' />
                  <div className='grid gap-3 text-sm leading-relaxed text-muted-foreground'>
                    <p>
                      This page carries history, so it can't be deleted — every message, stat and task
                      points back at it. Deactivating hides it everywhere and keeps the history intact.
                    </p>
                    <Button variant='outline' size='sm' className='w-fit' onClick={deactivate}>Deactivate page</Button>
                  </div>
                </div>
              ) : (
                <Button variant='outline' size='sm' className='w-fit text-bad hover:text-bad'
                  onClick={() => setConfirmDelete(true)}><Trash2 />Delete this page</Button>
              )}
            </section>
          )}
        </div>

        <DialogFooter className='border-t px-6 py-4'>
          <Button variant='ghost' onClick={onClose}>Close</Button>
          {isAdmin && (
            <Button disabled={!dirty || saving} onClick={save}>{saving ? 'Saving…' : 'Save changes'}</Button>
          )}
        </DialogFooter>

        {/* Only reachable when the page has no history (or history hasn't loaded) */}
        <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {creator.name} permanently?</AlertDialogTitle>
              <AlertDialogDescription>It has no messages, stats or tasks, so nothing is lost.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction variant='destructive' onClick={remove}>Yes, delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
