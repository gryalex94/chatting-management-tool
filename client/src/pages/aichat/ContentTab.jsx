import { useEffect, useState } from 'react';
import { CircleAlert, Loader2, Lock, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/services/api';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { errMsg } from './shared';

const LEVEL = ['friendly', 'flirty', 'suggestive', 'explicit'];
const KINDS = [['photos', 'Photos'], ['video', 'Video'], ['bundle', 'Bundle']];
const EMPTY = {
  title: '', kind: 'photos', amount: '', minutes: '', nudity: 'dressed', focus: '', outfit: '', setting: '', action: '',
  face: true, tags: '', description: '', price: '', min_price: '', notes: '', active: true,
};
const what = (it) => (it.kind === 'video' ? `${it.minutes ? `${Number(it.minutes)}-min ` : ''}video` : it.kind === 'bundle' ? `bundle${it.amount ? ` of ${it.amount}` : ''}` : `${it.amount || '?'} photo${it.amount === 1 ? '' : 's'}`);
const money = (n) => `$${Number(n) % 1 ? Number(n).toFixed(2) : Number(n)}`;

// One field of the item form.
function Field({ id, label, hint, children, className }) {
  return (
    <div className={cn('grid content-start gap-1.5', className)}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <span className='text-xs text-muted-foreground'>{hint}</span>}
    </div>
  );
}

/**
 * Her content: what she can sell, each item described exactly. The AI only offers
 * what's here, describes it truthfully, and when he asks for something that isn't
 * here, says so and offers the closest item.
 */
export default function ContentTab({ page, onChanged }) {
  const [data, setData] = useState(null);               // { ready, items, options }
  const [form, setForm] = useState(null);               // the item being added or changed
  const [busy, setBusy] = useState('');
  const url = `/api/ai-chat/pages/${page.creator_id}/content`;

  useEffect(() => {
    api.get(url).then(r => setData(r.data)).catch(e => setData({ error: errMsg(e, 'Could not load her content') }));
  }, [url]);

  const done = (d, msg) => { setData(d); setForm(null); onChanged?.(); if (msg) toast.success(msg); };
  const save = async () => {
    setBusy('save');
    try {
      const { data: d } = await api.post(url, { ...form, tags: form.tags.split(',').map(t => t.trim()).filter(Boolean) });
      done(d, form.id ? 'Saved' : 'Added');
    } catch (e) { toast.error(errMsg(e, 'Could not save')); }
    finally { setBusy(''); }
  };
  const remove = async (it) => {
    if (!window.confirm(`Delete "${it.title}" from her content?`)) return;
    setBusy(`del${it.id}`);
    try { done((await api.delete(`${url}/${it.id}`)).data, 'Deleted'); }
    catch (e) { toast.error(errMsg(e, 'Could not delete')); }
    finally { setBusy(''); }
  };
  const starter = async () => {
    setBusy('starter');
    try { done((await api.post(`${url}/starter`)).data, 'Starter list added: change it to what she really has'); }
    catch (e) { toast.error(errMsg(e, 'Could not add the starter list')); }
    finally { setBusy(''); }
  };
  const edit = (it) => setForm({
    ...EMPTY, ...it, amount: it.amount ?? '', minutes: it.minutes ?? '', min_price: it.min_price ?? '', tags: (it.tags || []).join(', '),
    focus: it.focus || '', outfit: it.outfit || '', setting: it.setting || '', action: it.action || '', notes: it.notes || '',
  });
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  if (!data) return <div className='grid gap-3'>{[0, 1, 2].map(i => <Skeleton key={i} className='h-20 w-full' />)}</div>;
  if (data.error) return <p className='text-sm text-muted-foreground'>{data.error}</p>;
  if (!data.ready) {
    return (
      <div className='flex items-start gap-2 rounded-lg border border-warn/40 bg-warn/5 px-4 py-3 text-sm'>
        <CircleAlert className='mt-0.5 size-4 shrink-0 text-warn' />Run database change 041 (her content) in Supabase first.
      </div>
    );
  }

  return (
    <div className='flex flex-col gap-4'>
      <div className='flex flex-wrap items-start justify-between gap-3 rounded-lg border px-4 py-3'>
        <p className='max-w-2xl text-sm'>
          What she can sell, each item described exactly: what it is, what&apos;s shown, the focus, the setting. The AI only offers what&apos;s here,
          describes it truthfully, and when he asks for something that isn&apos;t here, it says so and offers the closest item. For now it sells only in Practice.
        </p>
        <div className='flex flex-wrap gap-2'>
          {!data.items.length && <Button variant='outline' onClick={starter} disabled={!!busy}>{busy === 'starter' ? <Loader2 className='animate-spin' /> : <Sparkles />}Add the starter list</Button>}
          <Button onClick={() => setForm({ ...EMPTY })} disabled={!!busy || !!form}><Plus />Add an item</Button>
        </div>
      </div>

      {form && (
        <div className='flex flex-col gap-4 rounded-lg border border-primary/40 p-4'>
          <p className='text-sm font-medium'>{form.id ? `Change "${form.title}"` : 'A new item'}</p>
          <div className='grid gap-4 sm:grid-cols-[minmax(0,2fr)_130px_120px_minmax(0,1fr)]'>
            <Field id='ct-title' label='Name'><Input id='ct-title' value={form.title} onChange={set('title')} placeholder='e.g. Lingerie tease' /></Field>
            <Field id='ct-kind' label='What it is'>
              <Select value={form.kind} onValueChange={v => setForm(f => ({ ...f, kind: v }))}>
                <SelectTrigger id='ct-kind' aria-label='What it is'><SelectValue /></SelectTrigger>
                <SelectContent>{KINDS.map(([id, l]) => <SelectItem key={id} value={id}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            {form.kind === 'video'
              ? <Field id='ct-min' label='Minutes'><Input id='ct-min' inputMode='decimal' value={form.minutes} onChange={set('minutes')} placeholder='e.g. 1.5' /></Field>
              : <Field id='ct-amount' label={form.kind === 'bundle' ? 'Items in it' : 'Photos'}><Input id='ct-amount' inputMode='numeric' value={form.amount} onChange={set('amount')} placeholder='e.g. 5' /></Field>}
            <Field id='ct-nudity' label='How much she shows'>
              <Select value={form.nudity} onValueChange={v => setForm(f => ({ ...f, nudity: v }))}>
                <SelectTrigger id='ct-nudity' aria-label='How much she shows'><SelectValue /></SelectTrigger>
                <SelectContent>{data.options.nudity.map(n => <SelectItem key={n.id} value={n.id}>{n.label}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </div>
          <div className='grid gap-4 sm:grid-cols-2'>
            <Field id='ct-focus' label='The focus' hint='What the camera is on.'><Input id='ct-focus' value={form.focus} onChange={set('focus')} placeholder='e.g. her legs' /></Field>
            <Field id='ct-outfit' label='What she wears'><Input id='ct-outfit' value={form.outfit} onChange={set('outfit')} placeholder='e.g. a black lace bra and panties' /></Field>
            <Field id='ct-setting' label='Where'><Input id='ct-setting' value={form.setting} onChange={set('setting')} placeholder='e.g. on her bed' /></Field>
            <Field id='ct-action' label='What happens'><Input id='ct-action' value={form.action} onChange={set('action')} placeholder='e.g. lying on her side, kneeling, one from behind' /></Field>
          </div>
          <Field id='ct-desc' label='Exactly what&apos;s inside' hint='The AI describes it from this and matches it to what he asks for: be precise, and say what is NOT in it too.'>
            <Textarea id='ct-desc' rows={3} value={form.description} onChange={set('description')} placeholder='e.g. 5 photos in a black lace bra and panties on her bed: lying on her side, kneeling, one from behind looking over her shoulder. Nothing see-through, no nudity.' />
          </Field>
          <div className='grid gap-4 sm:grid-cols-[minmax(0,2fr)_110px_120px]'>
            <Field id='ct-tags' label='Tags' hint='Comma-separated: what fans might ask for.'><Input id='ct-tags' value={form.tags} onChange={set('tags')} placeholder='e.g. lingerie, lace, bed' /></Field>
            <Field id='ct-price' label='Price ($)'><Input id='ct-price' inputMode='decimal' value={form.price} onChange={set('price')} /></Field>
            <Field id='ct-min-price' label='Lowest ($)' hint='For a discount. Empty: 80%.'><Input id='ct-min-price' inputMode='decimal' value={form.min_price} onChange={set('min_price')} /></Field>
          </div>
          <Field id='ct-notes' label='When to offer it (optional)'><Input id='ct-notes' value={form.notes} onChange={set('notes')} placeholder='e.g. Only once he has bought something before.' /></Field>
          <div className='flex flex-wrap items-center justify-between gap-3'>
            <div className='flex flex-wrap gap-4 text-sm'>
              <label className='flex items-center gap-2'><Checkbox checked={form.face} onCheckedChange={v => setForm(f => ({ ...f, face: !!v }))} />Her face is in it</label>
              <label className='flex items-center gap-2'><Checkbox checked={form.active} onCheckedChange={v => setForm(f => ({ ...f, active: !!v }))} />She can offer it</label>
            </div>
            <div className='flex gap-2'>
              <Button variant='ghost' onClick={() => setForm(null)} disabled={!!busy}>Cancel</Button>
              <Button onClick={save} disabled={!!busy || !form.title.trim()}>{busy === 'save' && <Loader2 className='animate-spin' />}{form.id ? 'Save' : 'Add'}</Button>
            </div>
          </div>
        </div>
      )}

      {!data.items.length ? (
        <p className='rounded-lg border border-dashed p-6 text-sm text-muted-foreground'>Nothing yet. Add what she really has, or start from the starter list and change it.</p>
      ) : (
        <div className='flex flex-col gap-2'>
          {data.items.map(it => (
            <div key={it.id} className={cn('flex flex-col gap-1.5 rounded-lg border p-3', !it.active && 'opacity-60')}>
              <div className='flex flex-wrap items-center justify-between gap-2'>
                <div className='flex flex-wrap items-center gap-2'>
                  <Lock className='size-3.5 text-warn' />
                  <span className='font-medium'>{it.title}</span>
                  <Badge variant='outline' className='font-normal'>{what(it)}</Badge>
                  <Badge variant='outline' className='font-normal'>{data.options.nudity.find(n => n.id === it.nudity)?.label}</Badge>
                  <Badge variant='outline' className='font-normal'>{LEVEL[it.level]}</Badge>
                  <span className='text-sm tabular-nums'>{money(it.price)} <span className='text-xs text-muted-foreground'>(lowest {money(it.lowest)})</span></span>
                  {!it.active && <Badge variant='secondary'>not offered</Badge>}
                </div>
                <div className='flex gap-1'>
                  <Button size='sm' variant='ghost' onClick={() => edit(it)} disabled={!!busy || !!form}><Pencil />Change</Button>
                  <Button size='sm' variant='ghost' onClick={() => remove(it)} disabled={!!busy || !!form} aria-label={`Delete ${it.title}`}>
                    {busy === `del${it.id}` ? <Loader2 className='animate-spin' /> : <Trash2 />}
                  </Button>
                </div>
              </div>
              <p className='text-sm'>{it.description}</p>
              <p className='text-xs text-muted-foreground'>
                {[it.tags?.length ? `Tags: ${it.tags.join(', ')}` : null, it.face === false ? 'face not shown' : null, it.notes ? `When: ${it.notes}` : null].filter(Boolean).join(' · ')}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
