import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '@/services/api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * One Fansly page's settings (owner / admin): the rules for which sales count
 * toward a chatter's pay, and which AI profile writes the suggested replies in
 * the extension's side panel.
 */
export default function FanslySettings({ account, onClose, canEdit }) {
  const [s, setS] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get(`/api/fansly/accounts/${account.id}/settings`).then(r => setS({ ...r.data, late: r.data.credit_rules.late_days ?? '' }))
      .catch(e => { toast.error(e?.response?.data?.error || 'Could not load the settings'); onClose(); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account.id]);

  const save = async () => {
    setSaving(true);
    try {
      const r = await api.post(`/api/fansly/accounts/${account.id}/settings`, {
        credit_rules: { mass_ppv: s.credit_rules.mass_ppv, late_days: s.late === '' ? null : Number(s.late), tip_hours: Number(s.credit_rules.tip_hours) },
      });
      toast.success(r.data.recounting ? 'Saved. Sales are being matched again with the new rules; numbers update in a minute.' : 'Saved');
      onClose(true);
    } catch (e) { toast.error(e?.response?.data?.error || 'Could not save'); }
    finally { setSaving(false); }
  };
  const rule = (k, v) => setS(x => ({ ...x, credit_rules: { ...x.credit_rules, [k]: v } }));

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>Settings: {account.page || account.username}</DialogTitle>
          <DialogDescription>Which sales a chatter is paid for, and who writes the suggested replies.</DialogDescription>
        </DialogHeader>
        {!s ? <Skeleton className='h-48 w-full' /> : (
          <div className='grid gap-4'>
            <div className='grid gap-1.5'>
              <Label>A PPV bought from a mass message</Label>
              <Select value={s.credit_rules.mass_ppv} onValueChange={v => rule('mass_ppv', v)} disabled={!canEdit}>
                <SelectTrigger className='w-full'><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value='sender'>Credited to the chatter who sent the mass message</SelectItem>
                  <SelectItem value='nobody'>Page revenue only, credited to nobody</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className='grid gap-1.5'>
              <Label>A chat PPV bought days after it was sent</Label>
              <div className='flex items-center gap-2 text-sm'>
                <span>Credited to its sender unless bought more than</span>
                <Input className='w-20' type='number' min='1' value={s.late} placeholder='never' disabled={!canEdit} onChange={e => setS(x => ({ ...x, late: e.target.value }))} />
                <span>days later</span>
              </div>
              <p className='text-xs text-muted-foreground'>Empty: always credited to the sender, counted on the day it was bought.</p>
            </div>
            <div className='grid gap-1.5'>
              <Label>A tip in chat</Label>
              <div className='flex items-center gap-2 text-sm'>
                <span>Goes to the last chatter who wrote to him within</span>
                <Input className='w-20' type='number' min='1' max='72' value={s.credit_rules.tip_hours} disabled={!canEdit} onChange={e => rule('tip_hours', e.target.value)} />
                <span>hours</span>
              </div>
            </div>
            <p className='text-xs text-muted-foreground'>Wall purchases, subscriptions, renewals, stream tickets and referrals are never credited to a chatter. A refund comes off whoever the sale was credited to.</p>
            <div className='grid gap-1.5 rounded-md border px-3 py-2 text-sm'>
              <Label>Creator profile for suggested replies</Label>
              {s.profile?.has
                ? <p>Uses {s.profile.linked_to ? <>the profile of <b>{s.profile.linked_to.name}</b> ({s.profile.linked_to.platform}), linked as the same creator</> : <>this page&apos;s own profile (<b>{s.profile.name}</b>)</>}.</p>
                : <p className='text-amber-600'>This page has no creator profile yet, so there are no suggested replies.</p>}
              <p className='text-xs text-muted-foreground'>Each page has its own profile, kept apart from her pages on other platforms. Fill it in, or link it to the same creator&apos;s page, in AI chat (with Fansly picked in the menu, this page chosen), Her profile.</p>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant='outline' onClick={() => onClose()}>Close</Button>
          {canEdit && <Button onClick={save} disabled={saving || !s}>{saving ? 'Saving…' : 'Save'}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
