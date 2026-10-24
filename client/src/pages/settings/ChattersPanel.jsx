import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Plus, X } from 'lucide-react';
import api from '@/services/api';
import { STAGE_META, stageOf } from '@/utils/helpers';
import { platformInfo } from '@/utils/platforms';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const day = (d) => (d ? new Date(`${String(d).slice(0, 10)}T12:00:00Z`).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '·');

/**
 * Settings → Chatters: one row per chatter, with their experience stage (which decides how strict
 * the daily review's tasks are for them), the day they started, the platforms and pages they are on
 * in the usual rota (the Shifts page) and the last day they worked. Pay rates live on the Payroll page.
 */
export default function ChattersPanel({ chatters, platform, canEdit, onChanged, onDeactivate }) {
  const navigate = useNavigate();
  const [scope, setScope] = useState('platform');
  const [form, setForm] = useState({ name: '', started_on: '' });
  const shown = scope === 'all' ? chatters : chatters.filter(c => (c.platforms || []).includes(platform) || !(c.platforms || []).length);
  const put = async (c, body, done) => {
    try { await api.put(`/api/chatters/${c.id}`, body); toast.success(done); onChanged(); }
    catch (e) { toast.error(e?.response?.data?.error || 'Could not save'); }
  };
  const add = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    try { await api.post('/api/chatters', { name: form.name.trim(), started_on: form.started_on || undefined }); toast.success(`${form.name.trim()} added`); setForm({ name: '', started_on: '' }); onChanged(); }
    catch (err) { toast.error(err?.response?.data?.error || 'Could not add'); }
  };

  return (
    <div className='grid gap-3'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <div className='inline-flex rounded-md border p-0.5'>
          <Button size='sm' variant={scope === 'platform' ? 'default' : 'ghost'} onClick={() => setScope('platform')}>{platformInfo(platform).name}</Button>
          <Button size='sm' variant={scope === 'all' ? 'default' : 'ghost'} onClick={() => setScope('all')}>All platforms</Button>
        </div>
        <p className='text-xs text-muted-foreground'>{shown.length} of {chatters.length} chatters{scope === 'platform' ? ` on ${platformInfo(platform).name} (or not on any rota yet)` : ''}</p>
      </div>

      <div className='overflow-hidden rounded-md border'>
        <Table>
          <TableHeader><TableRow className='bg-muted/40 hover:bg-muted/40'>
            <TableHead className='ps-3'>Chatter</TableHead><TableHead>Stage</TableHead><TableHead>Started</TableHead>
            <TableHead>On the rota</TableHead><TableHead>Last worked</TableHead><TableHead className='w-10' />
          </TableRow></TableHeader>
          <TableBody>
            {shown.map(c => {
              const st = c.stage || { stage: stageOf(c) };
              return (
                <TableRow key={c.id}>
                  <TableCell className='ps-3'>
                    <button type='button' className='font-medium hover:underline' onClick={() => navigate(`/chatters/${c.id}`)}>{c.name}</button>
                    {c.email && <p className='text-xs text-muted-foreground'>{c.email}</p>}
                  </TableCell>
                  <TableCell>
                    <Select value={st.override || 'auto'} disabled={!canEdit} onValueChange={v => put(c, { stage_override: v === 'auto' ? null : v }, v === 'auto' ? `${c.name} follows the start date` : `${c.name}: ${STAGE_META[v].label}`)}>
                      <SelectTrigger className='h-8 w-44 text-xs'>
                        <span className='flex items-center gap-1.5'>
                          <span className='size-2 rounded-full' style={{ background: STAGE_META[st.stage]?.color }} />
                          {STAGE_META[st.stage]?.label}{st.override ? ' · set by hand' : ''}
                        </span>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value='auto'>Follow the start date</SelectItem>
                        {Object.entries(STAGE_META).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {st.next && <p className='mt-0.5 text-[11px] text-muted-foreground'>{STAGE_META[st.next.stage].label} from {day(st.next.on)}</p>}
                  </TableCell>
                  <TableCell>
                    <Input type='date' className='h-8 w-36 text-xs' defaultValue={st.started_on || ''} disabled={!canEdit} aria-label={`${c.name} started on`}
                      onBlur={e => e.target.value && e.target.value !== st.started_on && put(c, { started_on: e.target.value }, 'Start date saved')} />
                  </TableCell>
                  <TableCell className='max-w-72'>
                    {(c.rota_pages || []).length ? (
                      <div className='flex flex-wrap gap-1'>
                        {c.rota_pages.filter(p => scope === 'all' || p.platform === platform).map(p => (
                          <Badge key={p.id} variant='secondary' className='font-normal'>{p.name}{scope === 'all' ? ` · ${platformInfo(p.platform).name}` : ''}</Badge>
                        ))}
                      </div>
                    ) : <span className='text-xs text-muted-foreground'>Not on the rota</span>}
                  </TableCell>
                  <TableCell className='whitespace-nowrap text-xs text-muted-foreground'>{day(c.last_worked)}</TableCell>
                  <TableCell>
                    {canEdit && <Button size='icon-sm' variant='ghost' className='text-muted-foreground hover:text-bad' aria-label={`Deactivate ${c.name}`} onClick={() => onDeactivate(c)}><X /></Button>}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <p className='text-xs text-muted-foreground'>
        The stage decides which of the daily review&apos;s findings become tasks: New, every finding; Learning, medium and serious ones; Experienced, the serious ones.
        Safety and rules findings, new-subscriber steps, gifts, dry replies to spenders, medium quality problems and missed sales on spenders become tasks for everyone.
        By default the stage follows the start date (New for 7 days, Learning to day 21); set it by hand to keep someone on a stage longer. Pay rates are on the Payroll page.
      </p>

      {canEdit && (
        <form onSubmit={add} className='flex flex-wrap gap-2'>
          <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder='Name' aria-label='Name' required className='min-w-40 flex-1' />
          <Input type='date' value={form.started_on} onChange={e => setForm(f => ({ ...f, started_on: e.target.value }))} aria-label='Started on' className='w-40' title='The day they started (today when left empty)' />
          <Button type='submit'><Plus />Add chatter</Button>
        </form>
      )}
    </div>
  );
}
