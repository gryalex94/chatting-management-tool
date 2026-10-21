import { useEffect, useState } from 'react';
import { CircleAlert, Layers, Loader2, Lock, Pencil, Plus, RefreshCw, Sparkles, Trash2, WandSparkles } from 'lucide-react';
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
import { cost, errMsg } from './shared';
import Thumbs from './Thumbs';

const LEVEL = ['friendly', 'flirty', 'suggestive', 'explicit'];
const KINDS = [['photos', 'Photos'], ['video', 'Video'], ['bundle', 'Bundle']];
const EMPTY = {
  title: '', kind: 'photos', amount: '', minutes: '', nudity: 'dressed', focus: '', outfit: '', setting: '', action: '',
  face: true, tags: '', description: '', price: '', min_price: '', notes: '', active: true,
};
const length = (m) => (Number(m) < 1 ? `${Math.max(1, Math.round(Number(m) * 60))}-sec` : `${Number(m)}-min`);
const what = (it) => (it.kind === 'video' ? `${it.minutes ? `${length(it.minutes)} ` : ''}video` : it.kind === 'bundle' ? `bundle${it.amount ? ` of ${it.amount}` : ''}` : `${it.amount || '?'} photo${it.amount === 1 ? '' : 's'}`);
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

// Her vault: every file, where it is, what Fanvue sees in it, how it sold, and which item uses it.
function Vault({ page }) {
  const [lib, setLib] = useState(null);
  const [busy, setBusy] = useState(false);
  const url = `/api/ai-chat/pages/${page.creator_id}/library`;
  useEffect(() => { api.get(url).then(r => setLib(r.data)).catch(e => setLib({ error: errMsg(e, 'Could not load her vault') })); }, [url]);
  const refresh = async () => {
    setBusy(true);
    try { const { data } = await api.post(`${url}/refresh`); setLib(data); toast.success(`Read her vault: ${data.copied?.media ?? 0} files`); }
    catch (e) { toast.error(errMsg(e, 'Could not read her vault')); }
    finally { setBusy(false); }
  };
  if (!lib) return <Skeleton className='h-40 w-full' />;
  if (lib.error) return <p className='text-sm text-muted-foreground'>{lib.error}</p>;
  if (!lib.ready) return <p className='text-sm text-warn'>Run database change 042 (her content library) in Supabase first.</p>;
  const live = lib.assets.filter(a => a.locations.some(l => l.status !== 'removed'));
  return (
    <div className='flex flex-col gap-3'>
      <div className='flex flex-wrap items-center justify-between gap-2 text-sm'>
        <span className='text-muted-foreground'>
          {live.length} files in her Fanvue vault ({live.filter(a => a.kind === 'image').length} photos, {live.filter(a => a.kind === 'video').length} videos), read with the hourly Fanvue copy.
          What&apos;s in each comes from Fanvue&apos;s own analysis.
        </span>
        <Button size='sm' variant='outline' onClick={refresh} disabled={busy}>{busy ? <Loader2 className='animate-spin' /> : <RefreshCw />}Read her vault again</Button>
      </div>
      <div className='grid gap-2 lg:grid-cols-2'>
        {live.map((a) => {
          const t = a.tags || {};
          const loc = a.locations[0] || {};
          const others = (t.people || []).filter(p => !/^(?:female|woman)$/.test(p));
          return (
            <div key={a.id} className='flex gap-3 rounded-lg border p-2.5'>
              <Thumbs creatorId={page.creator_id} ids={[a.id]} videos={a.kind === 'video' ? [a.id] : []} size='md' />
              <div className='flex min-w-0 flex-col gap-1 text-xs'>
                <div className='flex flex-wrap items-center gap-1.5'>
                  <span className='font-medium'>{a.kind === 'video' ? `Video, ${Math.round((a.length_ms || 0) / 1000)} s` : a.kind === 'image' ? 'Photo' : 'File'}</span>
                  <Badge variant='outline' className='font-normal'>{loc.platform} · {loc.folder || 'no folder'}</Badge>
                  {t.nsfw && <Badge variant='outline' className='border-bad/40 font-normal text-bad'>explicit</Badge>}
                  {a.used_by.map(u => <Badge key={u.id} variant='secondary' className='font-normal'>{u.series ? `${u.series} · step ${u.step}` : u.title}</Badge>)}
                </div>
                <p className='line-clamp-2 text-muted-foreground'>{a.description || 'No description from Fanvue yet.'}</p>
                <p className='text-muted-foreground'>
                  {[t.acts?.length ? `acts: ${t.acts.join(', ')}` : null, others.length ? `with: ${others.join(', ')}` : null, (t.objects || []).filter(o => o !== 'smartphone').length ? `objects: ${t.objects.filter(o => o !== 'smartphone').join(', ')}` : null,
                    t.setting?.length ? `where: ${t.setting.slice(0, 4).join(', ')}` : null].filter(Boolean).join(' · ')}
                </p>
                <p>{a.sales?.ppv ? `As a PPV: bought ${a.sales.bought} of ${a.sales.ppv} times ($${a.sales.low}–$${a.sales.high})` : a.sales?.sent ? `Sent free ${a.sales.sent} times` : 'Never sent yet'}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Her content: what she can sell, each item described exactly (made from the
 * files in her vault, or typed in). The AI only offers what's here, describes it
 * truthfully, and when he asks for something that isn't here, says so and offers
 * the closest item. "Her vault" shows every file and where it is.
 */
// Services (D1–D4) and requests (D1, D8, D9): what she sells besides PPVs, paid by a tip
// first, with a base price the manager sets; and fans' requests the AI couldn't decide.
const REQUEST_STATUS = { pending: ['Waiting for you', 'text-warn'], approved: ['Approved', 'text-good'], refused: ['Refused', 'text-muted-foreground'], noted: ['Missing content, noted', 'text-muted-foreground'] };
// a flagged file (D5): the chat stays stopped until it's cleared or he's blocked
const FLAG_STATUS = { pending: ['Waiting: clear him or block him', 'text-warn'], approved: ['Cleared', 'text-good'], refused: ['Blocked', 'text-bad'] };
function Services({ page }) {
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [requests, setRequests] = useState(null);
  const [busy, setBusy] = useState('');
  const [terms, setTerms] = useState({});
  const url = `/api/ai-chat/pages/${page.creator_id}`;
  useEffect(() => {
    api.get(`${url}/services`).then(r => { setData(r.data); setForm({ services: r.data.services, session_total: r.data.session_total }); }).catch(e => toast.error(errMsg(e, 'Could not load her services')));
    api.get(`${url}/requests`).then(r => setRequests(r.data.requests)).catch(() => setRequests([]));
  }, [url]);
  const save = async () => {
    setBusy('save');
    try { const { data: d } = await api.put(`${url}/services`, form); setData(d); setForm({ services: d.services, session_total: d.session_total }); toast.success('Services saved'); }
    catch (e) { toast.error(errMsg(e, 'Could not save')); }
    finally { setBusy(''); }
  };
  const decide = async (r, status) => {
    setBusy(`r${r.id}`);
    try { const { data: d } = await api.patch(`${url}/requests/${r.id}`, { status, terms: terms[r.id] || '' }); setRequests(d.requests); }
    catch (e) { toast.error(errMsg(e, 'Could not save your decision')); }
    finally { setBusy(''); }
  };
  if (!form) return <Skeleton className='h-40 w-full' />;
  const dirty = JSON.stringify(form) !== JSON.stringify({ services: data.services, session_total: data.session_total });
  const set = (k, patch) => setForm(f => ({ ...f, services: { ...f.services, [k]: { ...f.services[k], ...patch } } }));
  return (
    <div className='flex flex-col gap-5'>
      <div className='flex flex-col gap-3 rounded-lg border p-4'>
        <div className='flex flex-col gap-1'>
          <p className='text-sm font-medium'>Services she sells, paid by a tip first</p>
          <p className='max-w-2xl text-xs text-muted-foreground'>When he asks for one, she says yes, names the price and asks him to tip it; she delivers once the tip is in. The price is what he usually pays for a PPV, never below the base here. The one time she asks for a tip.</p>
        </div>
        <div className='grid gap-2 sm:grid-cols-2'>
          {Object.entries(form.services).map(([k, s]) => (
            <div key={k} className='flex items-center justify-between gap-3 rounded-md border px-3 py-2'>
              <label className='flex min-w-0 items-center gap-2 text-sm'>
                <Checkbox checked={s.on} onCheckedChange={v => set(k, { on: v === true })} aria-label={s.label} />
                <span className='flex flex-col'><span>{s.label}</span><span className='text-xs text-muted-foreground'>{s.what}</span></span>
              </label>
              <label className='flex shrink-0 items-center gap-1 text-xs text-muted-foreground'>from $<Input type='number' min='1' value={s.min} onChange={e => set(k, { min: e.target.value })} className='h-8 w-20' aria-label={`${s.label}: base price`} /></label>
            </div>
          ))}
        </div>
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <label className='flex items-center gap-2 text-sm'>A full roleplay session is worth about $<Input type='number' min='1' value={form.session_total} onChange={e => setForm(f => ({ ...f, session_total: e.target.value }))} className='h-8 w-24' aria-label='Roleplay session total' /><span className='text-xs text-muted-foreground'>his pre-tip counts toward it, so PPVs inside cost less</span></label>
          <Button onClick={save} disabled={!dirty || !!busy}>{busy === 'save' ? 'Saving…' : dirty ? 'Save' : 'Saved'}</Button>
        </div>
      </div>
      <div className='flex flex-col gap-2 rounded-lg border p-4'>
        <p className='text-sm font-medium'>Requests the AI couldn&apos;t decide</p>
        <p className='max-w-2xl text-xs text-muted-foreground'>An unusual request: she hesitated, parked it (&quot;I&apos;ll think about it&quot;) and moved the chat on; your yes or no, with your terms, reaches her in her next reply. Visual content she doesn&apos;t have: noted here as missing content. A flagged file (someone who could be under 18, or something illegal): the chat stays stopped until you clear him or block him.</p>
        {requests === null ? <Skeleton className='h-10 w-full' /> : !requests.length ? <p className='text-xs text-muted-foreground'>Nothing yet.</p> : (
          <ul className='flex flex-col gap-2'>
            {requests.map(r => (
              <li key={r.id} className='flex flex-col gap-1.5 rounded-md border px-3 py-2 text-sm'>
                <div className='flex flex-wrap items-baseline justify-between gap-2'>
                  <span className='min-w-0'>{r.kind === 'content' ? 'Content: ' : r.kind === 'flag' ? 'Flagged file: ' : 'Service: '}{r.text}</span>
                  <span className={cn('text-xs', (r.kind === 'flag' ? FLAG_STATUS : REQUEST_STATUS)[r.status]?.[1])}>{(r.kind === 'flag' ? FLAG_STATUS : REQUEST_STATUS)[r.status]?.[0] || r.status}{r.terms ? ` · ${r.terms}` : ''} · {new Date(r.created_at).toLocaleDateString([], { day: 'numeric', month: 'short' })}{r.source === 'practice' ? ' · practice' : ''}</span>
                </div>
                {r.status === 'pending' && r.kind === 'flag' && (
                  <div className='flex flex-wrap items-center gap-1.5'>
                    <Button size='sm' variant='outline' className='h-8' onClick={() => decide(r, 'approved')} disabled={busy === `r${r.id}`}>Clear him: it was fine</Button>
                    <Button size='sm' variant='outline' className='h-8' onClick={() => decide(r, 'refused')} disabled={busy === `r${r.id}`}>Block him</Button>
                  </div>
                )}
                {r.status === 'pending' && r.kind !== 'flag' && (
                  <div className='flex flex-wrap items-center gap-1.5'>
                    <Input value={terms[r.id] || ''} onChange={e => setTerms(t => ({ ...t, [r.id]: e.target.value }))} placeholder='Your terms (a price, what exactly), or why not' className='h-8 flex-1 min-w-48' aria-label='Terms' />
                    <Button size='sm' variant='outline' className='h-8' onClick={() => decide(r, 'approved')} disabled={busy === `r${r.id}`}>Approve</Button>
                    <Button size='sm' variant='outline' className='h-8' onClick={() => decide(r, 'refused')} disabled={busy === `r${r.id}`}>Refuse</Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function ContentTab({ page, onChanged }) {
  const [data, setData] = useState(null);               // { ready, items, options }
  const [form, setForm] = useState(null);               // the item being added or changed
  const [busy, setBusy] = useState('');
  const [view, setView] = useState('items');            // items / vault
  const url = `/api/ai-chat/pages/${page.creator_id}/content`;

  useEffect(() => {
    api.get(url).then(r => setData(r.data)).catch(e => setData({ error: errMsg(e, 'Could not load her content') }));
  }, [url]);
  const suggest = async () => {
    if (data.items.some(it => it.source === 'vault' || it.source === 'starter') && !window.confirm('Make new sets from her vault? They replace the starter list and earlier sets made from her vault (items you added yourself stay).')) return;
    setBusy('suggest');
    try {
      const { data: d } = await api.post(`${url}/suggest`);
      done(d, `${d.made} items made from her vault (${cost(d.cost)}): check them and their prices`);
    } catch (e) { toast.error(errMsg(e, 'Could not make sets')); }
    finally { setBusy(''); }
  };

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
          <Button variant='outline' onClick={suggest} disabled={!!busy}>{busy === 'suggest' ? <><Loader2 className='animate-spin' />Making sets…</> : <><WandSparkles />Make sets from her vault</>}</Button>
          {!data.items.length && <Button variant='outline' onClick={starter} disabled={!!busy}>{busy === 'starter' ? <Loader2 className='animate-spin' /> : <Sparkles />}Add the starter list</Button>}
          <Button onClick={() => setForm({ ...EMPTY })} disabled={!!busy || !!form}><Plus />Add an item</Button>
        </div>
      </div>

      {data.connection?.problem && (
        <div className='flex items-start gap-2 rounded-lg border border-warn/40 bg-warn/5 px-4 py-3 text-sm'>
          <CircleAlert className='mt-0.5 size-4 shrink-0 text-warn' />
          <span>{data.connection.problem} Until then there are no previews and her vault isn&apos;t updated; what she sells still works in Practice.</span>
        </div>
      )}
      <div className='flex gap-1 self-start rounded-md bg-muted p-1'>
        {[['items', `What she sells (${data.items.length})`], ['vault', 'Her vault: what is where'], ['services', 'Services and requests']].map(([k, l]) => (
          <button key={k} type='button' onClick={() => setView(k)} aria-pressed={view === k}
            className={cn('rounded px-3 py-1 text-sm', view === k ? 'bg-background shadow-sm' : 'text-muted-foreground')}>{l}</button>
        ))}
      </div>
      {view === 'vault' && <Vault page={page} />}
      {view === 'services' && <Services page={page} />}

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

      {view === 'items' && (!data.items.length ? (
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
                  {it.series && <Badge variant='outline' className='border-warn/40 font-normal text-warn'><Layers className='size-3' />{it.series} · step {it.step}</Badge>}
                  {!it.active && <Badge variant='secondary'>not offered</Badge>}
                </div>
                <div className='flex gap-1'>
                  <Button size='sm' variant='ghost' onClick={() => edit(it)} disabled={!!busy || !!form}><Pencil />Change</Button>
                  <Button size='sm' variant='ghost' onClick={() => remove(it)} disabled={!!busy || !!form} aria-label={`Delete ${it.title}`}>
                    {busy === `del${it.id}` ? <Loader2 className='animate-spin' /> : <Trash2 />}
                  </Button>
                </div>
              </div>
              <Thumbs creatorId={page.creator_id} ids={it.asset_ids || []} />
              <p className='text-sm'>{it.description}</p>
              <p className='text-xs text-muted-foreground'>
                {[it.tags?.length ? `Tags: ${it.tags.join(', ')}` : null, it.face === false ? 'face not shown' : null, it.notes ? `When: ${it.notes}` : null].filter(Boolean).join(' · ')}
              </p>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
