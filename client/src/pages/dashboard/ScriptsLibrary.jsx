import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Copy, Pencil, Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/services/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import ScriptSteps from './ScriptSteps';

const STAGE_LABEL = { opener: 'Opener', warmup: 'Warm-up', sexting: 'Sexting', ppv_pitch: 'PPV pitch', after_no: 'After a no', reengage: 'Re-engage', custom: 'Custom request', aftercare: 'Aftercare', other: 'Other' };
const EMPTY = { stage: 'opener', title: '', text: '', account_id: 'all', active: true, item_ids: '', steps: [] };

const NAME = { fansly: 'Fansly', onlyfans: 'OnlyFans', fanvue: 'Fanvue' };

/**
 * The scripts library, one per platform. Managers write and order scripts per
 * stage (and optionally per page). On Fansly chatters click them in the
 * extension's side panel, which types the text into Fansly's message box for
 * them to send; each script shows how often it was used in the last 90 days and
 * how the PPV after it did. On OnlyFans and Fanvue the team copies them from here.
 */
export default function ScriptsLibrary({ platform = 'fansly' }) {
  const panel = platform === 'fansly';
  const [info, setInfo] = useState(null);
  const [edit, setEdit] = useState(null);       // the form, or null
  const [saving, setSaving] = useState(false);

  const load = () => api.get(`/api/fansly/scripts?platform=${platform}`).then(r => setInfo(r.data)).catch(e => setInfo({ error: e?.response?.data?.error || 'Could not load the scripts.' }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [platform]);

  if (!info) return <Skeleton className='h-64 w-full' />;
  if (info.error) return <p className='text-sm text-muted-foreground'>{info.error}</p>;

  const pageName = (id) => (info.accounts || []).find(a => a.id === id)?.page || 'a page';
  const byStage = (info.stages || Object.keys(STAGE_LABEL)).map(k => ({ k, list: info.scripts.filter(s => s.stage === k) })).filter(g => g.list.length);

  const save = async () => {
    setSaving(true);
    const body = {
      platform, stage: edit.stage, title: edit.title, active: edit.active,
      // a sequence keeps a text too (the panel's list shows it): its first text step, else its title
      text: edit.text?.trim() || (edit.steps || []).find(x => x.kind !== 'wait' && x.text?.trim())?.text || edit.title,
      ...(panel ? { steps: (edit.steps || []).length ? edit.steps : null } : {}),
      account_id: edit.account_id === 'all' ? null : edit.account_id,
      ...(panel ? { item_ids: String(edit.item_ids || '').split(/[\s,]+/).filter(Boolean) } : {}),
    };
    try {
      if (edit.id) await api.patch(`/api/fansly/scripts/${edit.id}`, body); else await api.post('/api/fansly/scripts', body);
      toast.success('Saved'); setEdit(null); load();
    } catch (e) { toast.error(e?.response?.data?.error || 'Could not save'); }
    finally { setSaving(false); }
  };
  const remove = async (s) => {
    if (!window.confirm(`Delete "${s.title}"? Its usage numbers go with it.`)) return;
    try { await api.delete(`/api/fansly/scripts/${s.id}`); load(); } catch (e) { toast.error(e?.response?.data?.error || 'Could not delete'); }
  };
  const toggle = async (s) => {
    try { await api.patch(`/api/fansly/scripts/${s.id}`, { active: !s.active }); load(); } catch (e) { toast.error(e?.response?.data?.error || 'Could not change'); }
  };
  const move = async (list, i, dir) => {
    const ids = list.map(s => s.id);
    const j = i + dir; if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    try { await api.post('/api/fansly/scripts/order', { ids }); load(); } catch (e) { toast.error(e?.response?.data?.error || 'Could not reorder'); }
  };

  return (
    <div className='grid gap-4'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <p className='max-w-2xl text-sm text-muted-foreground'>
          {panel ? <>
            Chatters see these in the extension&apos;s side panel and click one to put it in Fansly&apos;s message box; they edit and send it themselves.
            Placeholders: <code>{'{name}'}</code> the fan&apos;s name, <code>{'{last_bought}'}</code> his last purchase, <code>{'{page}'}</code> the page.
          </> : <>The {NAME[platform]} scripts library: the team copies a script from here and pastes it into the chat, then edits and sends it. Hidden scripts stay here but are marked hidden.</>}
        </p>
        <Button size='sm' onClick={() => setEdit({ ...EMPTY })}><Plus className='size-3.5' /> New script</Button>
      </div>

      {!info.scripts.length && <p className='rounded-lg border bg-card px-4 py-8 text-center text-sm text-muted-foreground'>No scripts yet. Add the first one.</p>}

      {byStage.map(g => (
        <section key={g.k} className='rounded-lg border bg-card'>
          <h3 className='border-b px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground'>{STAGE_LABEL[g.k] || g.k}</h3>
          <ul className='divide-y'>
            {g.list.map((s, i) => (
              <li key={s.id} className='flex gap-3 px-4 py-3'>
                <div className='flex flex-col gap-1'>
                  <Button size='icon' variant='ghost' className='size-6' disabled={i === 0} onClick={() => move(g.list, i, -1)} aria-label='Move up'><ArrowUp className='size-3.5' /></Button>
                  <Button size='icon' variant='ghost' className='size-6' disabled={i === g.list.length - 1} onClick={() => move(g.list, i, 1)} aria-label='Move down'><ArrowDown className='size-3.5' /></Button>
                </div>
                <div className='min-w-0 flex-1'>
                  <p className='font-medium'>
                    {s.title}
                    {!s.active && <Badge variant='outline' className='ml-2'>hidden</Badge>}
                    <Badge variant='secondary' className='ml-2'>{s.account_id ? pageName(s.account_id) : 'All pages'}</Badge>
                    {s.item_ids?.length > 0 && <Badge variant='outline' className='ml-2'>{s.item_ids.length} vault item{s.item_ids.length === 1 ? '' : 's'}</Badge>}
                  </p>
                  {s.steps?.length ? (
                    <ol className='mt-1 grid gap-0.5 text-sm text-muted-foreground'>
                      {s.steps.map((st, k) => (
                        <li key={k}>{k + 1}. {st.kind === 'wait' ? <i>wait for his reply</i> : st.kind === 'media'
                          ? <>{st.price > 0 ? <b>PPV ${Number(st.price).toFixed(2)}</b> : <b>free media</b>} ({st.media_ids.length} item{st.media_ids.length === 1 ? '' : 's'}){st.text ? `: ${st.text}` : ''}</>
                          : st.text}</li>
                      ))}
                    </ol>
                  ) : <p className='mt-1 whitespace-pre-wrap text-sm text-muted-foreground'>{s.text}</p>}
                  {panel && <p className='mt-1 text-xs text-muted-foreground'>
                    Used {s.uses} time{s.uses === 1 ? '' : 's'} in 90 days
                    {s.uses > 0 && ` · PPV sent after it ${s.ppv_after} time${s.ppv_after === 1 ? '' : 's'}, sold ${s.sold_after}${s.ppv_after ? ` (${Math.round((s.sold_after / s.ppv_after) * 100)}%)` : ''}`}
                  </p>}
                </div>
                <div className='flex items-start gap-2'>
                  {!panel && <Button size='icon' variant='ghost' className='size-7' aria-label='Copy'
                    onClick={() => navigator.clipboard.writeText(s.text).then(() => toast.success('Copied'), () => toast.error('Could not copy'))}><Copy className='size-3.5' /></Button>}
                  <Switch checked={s.active} onCheckedChange={() => toggle(s)} aria-label={panel ? 'Shown in the panel' : 'Shown'} />
                  <Button size='icon' variant='ghost' className='size-7' onClick={() => setEdit({ ...s, account_id: s.account_id || 'all', item_ids: (s.item_ids || []).join(', '), steps: s.steps || [] })} aria-label='Edit'><Pencil className='size-3.5' /></Button>
                  <Button size='icon' variant='ghost' className='size-7' onClick={() => remove(s)} aria-label='Delete'><Trash2 className='size-3.5' /></Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <Dialog open={!!edit} onOpenChange={(v) => !v && setEdit(null)}>
        <DialogContent className='max-h-[90vh] overflow-y-auto sm:max-w-xl'>
          <DialogHeader><DialogTitle>{edit?.id ? 'Edit script' : 'New script'}</DialogTitle></DialogHeader>
          {edit && (
            <div className='grid gap-3'>
              <div className='grid grid-cols-2 gap-3'>
                <div className='grid gap-1.5'>
                  <Label>Stage</Label>
                  <Select value={edit.stage} onValueChange={v => setEdit(x => ({ ...x, stage: v }))}>
                    <SelectTrigger className='w-full'><SelectValue /></SelectTrigger>
                    <SelectContent>{Object.entries(STAGE_LABEL).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className='grid gap-1.5'>
                  <Label>Page</Label>
                  <Select value={edit.account_id} onValueChange={v => setEdit(x => ({ ...x, account_id: v }))}>
                    <SelectTrigger className='w-full'><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value='all'>All {NAME[platform]} pages</SelectItem>
                      {(info.accounts || []).map(a => <SelectItem key={a.id} value={a.id}>{a.page}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className='grid gap-1.5'>
                <Label>Title</Label>
                <Input value={edit.title} maxLength={120} onChange={e => setEdit(x => ({ ...x, title: e.target.value }))} placeholder='e.g. Shower tease before the video' />
              </div>
              {panel && (
                <div className='flex items-center gap-2 text-sm'>
                  <Switch checked={!!(edit.steps || []).length} onCheckedChange={v => setEdit(x => ({ ...x, steps: v ? [{ kind: 'text', text: x.text || '' }] : [] }))} />
                  A sequence: text and media / PPV steps, one after another
                </div>
              )}
              {panel && (edit.steps || []).length > 0 ? (
                <div className='grid gap-1.5'>
                  <Label>Steps</Label>
                  <ScriptSteps steps={edit.steps} onChange={steps => setEdit(x => ({ ...x, steps }))} accounts={info.accounts || []} account={edit.account_id} />
                </div>
              ) : <div className='grid gap-1.5'>
                <Label>Text</Label>
                <Textarea value={edit.text} rows={6} maxLength={4000} onChange={e => setEdit(x => ({ ...x, text: e.target.value }))} placeholder={panel ? 'hey {name}, just got out of the shower…' : 'hey babe, just got out of the shower…'} />
              </div>}

              <label className='flex items-center gap-2 text-sm'><Switch checked={edit.active} onCheckedChange={v => setEdit(x => ({ ...x, active: v }))} /> {panel ? 'Shown in the panel' : 'Shown (not hidden)'}</label>
            </div>
          )}
          <DialogFooter>
            <Button variant='outline' onClick={() => setEdit(null)}>Cancel</Button>
            <Button onClick={save} disabled={saving || !edit?.title?.trim() || !edit?.text?.trim()}>{saving ? 'Saving…' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
