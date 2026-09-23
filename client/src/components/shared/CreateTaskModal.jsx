import { useState, useEffect } from 'react';
import { Check, PenLine } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/services/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

const PRIORITIES = [
  { value: 1, label: 'Urgent', dot: 'bg-red-500', on: 'border-red-500/50 bg-red-500/10 text-red-600 dark:text-red-400' },
  { value: 2, label: 'High', dot: 'bg-orange-500', on: 'border-orange-500/50 bg-orange-500/10 text-orange-600 dark:text-orange-400' },
  { value: 3, label: 'Medium', dot: 'bg-amber-500', on: 'border-amber-500/50 bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  { value: 4, label: 'Low', dot: 'bg-zinc-400', on: 'border-zinc-400/60 bg-zinc-400/10 text-foreground' },
];

const DEFAULT_TEMPLATE = { label: 'Custom task', icon: '📝', title: '', description: '', priority: 3 };

// A toggleable pill used for templates and the creator / chatter pickers.
function Pill({ on, onClick, children, className }) {
  return (
    <button type='button' onClick={onClick}
      className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
        on ? 'border-primary/40 bg-primary/10 text-foreground' : 'bg-background text-muted-foreground hover:bg-accent hover:text-foreground', className)}>
      {on && <Check className='size-3' />}{children}
    </button>
  );
}

export default function CreateTaskModal({ onClose, onCreated, defaultCreatorId, defaultChatterId }) {
  const [form, setForm] = useState({
    title: '', description: '', priority: 3,
    creator_ids: defaultCreatorId ? [defaultCreatorId] : [],
    chatter_ids: defaultChatterId ? [defaultChatterId] : [],
    is_recurring: false, recurrence_pattern: 'weekly',
    requires_screenshots: true,
  });
  const [creators, setCreators] = useState([]);
  const [chatters, setChatters] = useState([]);
  const [saving, setSaving] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(0);
  const [templates, setTemplates] = useState([]);

  useEffect(() => {
    api.get('/api/creators').then(r => setCreators(r.data)).catch(() => {});
    api.get('/api/chatters').then(r => setChatters(r.data)).catch(() => {});
    api.get('/api/tasks/templates').then(r => setTemplates(r.data)).catch(() => {});
  }, []);

  const u = (k, v) => setForm(p => ({ ...p, [k]: v }));

  function applyTemplate(idx) {
    const allTemplates = [DEFAULT_TEMPLATE, ...templates];
    const t = allTemplates[idx];
    setSelectedTemplate(idx);
    if (t.title) {
      setForm(p => ({ ...p, title: t.title, description: t.description || '', priority: t.priority || 3 }));
    }
  }

  function toggleCreator(id) {
    setForm(p => ({
      ...p,
      creator_ids: p.creator_ids.includes(id)
        ? p.creator_ids.filter(x => x !== id)
        : [...p.creator_ids, id],
    }));
  }

  function toggleChatter(id) {
    setForm(p => ({
      ...p,
      chatter_ids: p.chatter_ids.includes(id)
        ? p.chatter_ids.filter(x => x !== id)
        : [...p.chatter_ids, id],
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.title.trim()) return toast.error('Title is required');
    setSaving(true);
    try {
      // Create one task per creator, or one with no creator
      const creatorList = form.creator_ids.length > 0 ? form.creator_ids : [null];
      const chatterList = form.chatter_ids.length > 0 ? form.chatter_ids : [null];

      for (const crid of creatorList) {
        for (const chid of chatterList) {
          await api.post('/api/tasks', {
            title: form.title,
            description: form.description,
            priority: form.priority,
            creator_id: crid,
            chatter_id: chid,
            is_recurring: form.is_recurring,
            recurrence_pattern: form.is_recurring ? form.recurrence_pattern : null,
            requires_screenshots: form.requires_screenshots,
          });
        }
      }

      const count = creatorList.length * chatterList.length;
      toast.success(count > 1 ? `${count} tasks created` : 'Task created');
      onCreated?.();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create task');
    } finally { setSaving(false); }
  }

  const multi = form.creator_ids.length > 1 || form.chatter_ids.length > 1;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className='flex max-h-[85vh] flex-col gap-0 p-0 sm:max-w-xl'>
        <DialogHeader className='border-b py-4 ps-6 pe-12'>
          <DialogTitle>New task</DialogTitle>
          <DialogDescription>Pick a template or write your own. One task is created per creator and chatter you select.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className='flex min-h-0 flex-1 flex-col'>
          <div className='grid gap-5 overflow-y-auto px-6 py-4'>
            <div className='grid gap-2'>
              <Label>Quick templates</Label>
              <div className='flex flex-wrap gap-1.5'>
                {[DEFAULT_TEMPLATE, ...templates].map((t, i) => (
                  <Pill key={i} on={selectedTemplate === i} onClick={() => applyTemplate(i)} className='rounded-md'>
                    {i === 0 ? <PenLine className='size-3' /> : <span aria-hidden>{t.icon}</span>}{t.label}
                  </Pill>
                ))}
              </div>
            </div>

            <div className='grid gap-2'>
              <Label htmlFor='nt-title'>Title</Label>
              <Input id='nt-title' value={form.title} onChange={e => u('title', e.target.value)} required placeholder='Task title' />
            </div>

            <div className='grid gap-2'>
              <Label htmlFor='nt-desc'>Description</Label>
              <Textarea id='nt-desc' value={form.description} onChange={e => u('description', e.target.value)} rows={2} placeholder='What needs to be done…' />
            </div>

            <div className='grid gap-2'>
              <Label>Priority</Label>
              <div className='grid grid-cols-2 gap-1.5 sm:grid-cols-4'>
                {PRIORITIES.map(p => (
                  <button key={p.value} type='button' onClick={() => u('priority', p.value)}
                    className={cn('inline-flex h-9 items-center justify-center gap-2 rounded-md border text-xs font-medium transition-colors',
                      form.priority === p.value ? p.on : 'bg-background text-muted-foreground hover:bg-accent')}>
                    <span className={cn('size-2 rounded-full', p.dot)} />{p.label}
                  </button>
                ))}
              </div>
            </div>

            <div className='grid gap-2'>
              <Label>Creators <span className='font-normal text-muted-foreground'>(optional, select multiple)</span></Label>
              <div className='flex flex-wrap gap-1.5'>
                {creators.map(c => (
                  <Pill key={c.id} on={form.creator_ids.includes(c.id)} onClick={() => toggleCreator(c.id)}>{c.name}</Pill>
                ))}
              </div>
            </div>

            <div className='grid gap-2'>
              <Label>Chatters <span className='font-normal text-muted-foreground'>(optional, select multiple)</span></Label>
              <div className='flex max-h-30 flex-wrap gap-1.5 overflow-y-auto'>
                {chatters.map(c => (
                  <Pill key={c.id} on={form.chatter_ids.includes(c.id)} onClick={() => toggleChatter(c.id)}>{c.name}</Pill>
                ))}
              </div>
            </div>

            <div className='flex flex-wrap items-center gap-x-5 gap-y-3'>
              <div className='flex items-center gap-2'>
                <Checkbox id='nt-shots' checked={form.requires_screenshots} onCheckedChange={v => u('requires_screenshots', v === true)} />
                <Label htmlFor='nt-shots' className='font-normal'>Screenshots required</Label>
              </div>
              <div className='flex items-center gap-2'>
                <Checkbox id='nt-rec' checked={form.is_recurring} onCheckedChange={v => u('is_recurring', v === true)} />
                <Label htmlFor='nt-rec' className='font-normal'>Recurring</Label>
              </div>
              {form.is_recurring && (
                <Select value={form.recurrence_pattern} onValueChange={v => u('recurrence_pattern', v)}>
                  <SelectTrigger size='sm' className='w-32'><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value='daily'>Daily</SelectItem>
                    <SelectItem value='weekly'>Weekly</SelectItem>
                    <SelectItem value='per_cycle'>Per cycle</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          <DialogFooter className='border-t px-6 py-4'>
            <Button type='button' variant='ghost' onClick={onClose}>Cancel</Button>
            <Button type='submit' disabled={saving}>
              {saving ? 'Creating…' : multi
                ? `Create ${Math.max(form.creator_ids.length, 1) * Math.max(form.chatter_ids.length, 1)} tasks`
                : 'Create task'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
