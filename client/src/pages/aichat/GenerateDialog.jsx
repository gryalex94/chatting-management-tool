import { useState } from 'react';
import { Loader2, WandSparkles } from 'lucide-react';
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
import { errMsg } from './shared';

const MAX_VIBES = 3;
const words = (s) => s.trim().split(/\s+/).filter(Boolean).length;
const Err = ({ text }) => (text ? <span className='text-[13px] text-bad'>{text}</span> : null);

// Start from what's in the profile already, where it matches a choice.
function startFrom(current, o) {
  const pick = (v, list, d) => (list.includes(v) ? v : d);
  const age = parseInt(current.age, 10);
  return {
    description: '', name: current.name || '', from: current.from || '', interests: '', pet_names: '', limits: '',
    gender: pick(current.gender, o.genders, o.genders[0]),
    orientation: pick(current.orientation, o.orientations, o.orientations[0]),
    vibes: String(current.vibe || '').split(',').map(v => v.trim()).filter(v => o.vibes.includes(v)).slice(0, MAX_VIBES),
    heat: (o.heats.find(h => String(current.heat || '').startsWith(h.label)) || o.heats[1]).id,
    age: age >= 18 ? String(age) : '23',
    use_history: true,
  };
}

/**
 * "Generate from a description": a few words about her plus the essentials
 * (gender, age, sexuality, vibe, how spicy), and the AI writes her
 * whole profile into the form. Nothing is saved until the manager presses Save.
 */
export default function GenerateDialog({ page, options, current, onClose, onGenerated }) {
  const [g, setG] = useState(() => startFrom(current, options));
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => { const v = e?.target ? e.target.value : e; setG(x => ({ ...x, [k]: v })); setErrors(x => ({ ...x, [k]: null })); };
  const toggleVibe = (v) => {
    setErrors(x => ({ ...x, vibes: null }));
    setG(x => ({ ...x, vibes: x.vibes.includes(v) ? x.vibes.filter(y => y !== v) : x.vibes.length < MAX_VIBES ? [...x.vibes, v] : x.vibes }));
  };

  const generate = async () => {
    const age = parseInt(g.age, 10);
    const errs = {
      description: words(g.description) < 3 ? 'Describe her in at least 3 words' : null,
      vibes: g.vibes.length ? null : 'Pick at least one vibe',
      age: age >= 18 && age <= 70 ? null : 'Between 18 and 70',
    };
    setErrors(errs);
    if (Object.values(errs).some(Boolean)) return;
    setBusy(true);
    try {
      const { data } = await api.post(`/api/ai-chat/pages/${page.creator_id}/profile/generate`, { ...g, age });
      toast.success('Generated: check it, then save');
      onGenerated(data);
    } catch (e) { toast.error(errMsg(e, 'Could not generate her profile')); }
    finally { setBusy(false); }
  };

  const choice = (k, list, label) => (
    <div className='grid content-start gap-1.5'>
      <Label>{label}</Label>
      <Select value={g[k]} onValueChange={set(k)}>
        <SelectTrigger className='w-full' aria-label={label}><SelectValue /></SelectTrigger>
        <SelectContent>{list.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent className='max-h-[92vh] overflow-y-auto sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2'><WandSparkles className='size-5' />Generate her profile</DialogTitle>
          <DialogDescription>
            A few words about her and the essentials: the AI writes the whole profile into the form. It replaces what&apos;s there; nothing is saved until you press Save.
          </DialogDescription>
        </DialogHeader>

        <div className='grid gap-4'>
          <div className='grid gap-1.5'>
            <Label htmlFor='gen-desc'>Describe her in a few words</Label>
            <Textarea id='gen-desc' rows={2} value={g.description} onChange={set('description')} autoFocus
              placeholder='e.g. bubbly gamer girl who loves anime, snacks and late-night chats' />
            <Err text={errors.description} />
          </div>

          <div className='grid gap-4 sm:grid-cols-3'>
            <div className='grid content-start gap-1.5'>
              <Label htmlFor='gen-name'>Name</Label>
              <Input id='gen-name' value={g.name} onChange={set('name')} placeholder='The AI picks one' />
            </div>
            {choice('gender', options.genders, 'Gender')}
            <div className='grid content-start gap-1.5'>
              <Label htmlFor='gen-age'>Age</Label>
              <Input id='gen-age' type='number' min='18' max='70' inputMode='numeric' value={g.age} onChange={set('age')} />
              <Err text={errors.age} />
            </div>
            {choice('orientation', options.orientations, 'Sexuality')}
            <div className='grid content-start gap-1.5'>
              <Label htmlFor='gen-from'>Where she lives</Label>
              <Input id='gen-from' value={g.from} onChange={set('from')} placeholder='The AI picks' />
            </div>
          </div>

          <div className='grid gap-1.5'>
            <Label>Vibe <span className='font-normal text-muted-foreground'>(pick up to {MAX_VIBES})</span></Label>
            <div className='flex flex-wrap gap-1.5'>
              {options.vibes.map(v => (
                <button key={v} type='button' onClick={() => toggleVibe(v)} aria-pressed={g.vibes.includes(v)}
                  className={cn('rounded-full border px-3 py-1 text-sm', g.vibes.includes(v) ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted')}>
                  {v}
                </button>
              ))}
            </div>
            <Err text={errors.vibes} />
          </div>

          <div className='grid gap-1.5'>
            <Label>How spicy</Label>
            <div className='grid gap-2 sm:grid-cols-3'>
              {options.heats.map(h => (
                <button key={h.id} type='button' onClick={() => set('heat')(h.id)} aria-pressed={g.heat === h.id} aria-label={`${h.label}: ${h.hint}`}
                  className={cn('flex flex-col rounded-md border px-3 py-2 text-left', g.heat === h.id ? 'border-primary bg-primary/5' : 'hover:bg-muted/50')}>
                  <span className='text-sm font-medium'>{h.label}</span>
                  <span className='text-xs text-muted-foreground'>{h.hint}</span>
                </button>
              ))}
            </div>
            <span className='text-xs text-muted-foreground'>The house rules always apply, whatever you pick.</span>
          </div>

          <div className='grid gap-4 sm:grid-cols-3'>
            <div className='grid content-start gap-1.5'>
              <Label htmlFor='gen-interests'>Interests</Label>
              <Input id='gen-interests' value={g.interests} onChange={set('interests')} placeholder='Optional' />
            </div>
            <div className='grid content-start gap-1.5'>
              <Label htmlFor='gen-pets'>Pet names for fans</Label>
              <Input id='gen-pets' value={g.pet_names} onChange={set('pet_names')} placeholder='e.g. babe, handsome' />
            </div>
            <div className='grid content-start gap-1.5'>
              <Label htmlFor='gen-limits'>Her limits</Label>
              <Input id='gen-limits' value={g.limits} onChange={set('limits')} placeholder='Optional' />
            </div>
          </div>

          <label className='flex items-start gap-2 text-sm'>
            <Checkbox checked={g.use_history} onCheckedChange={(v) => setG(x => ({ ...x, use_history: !!v }))} className='mt-0.5' aria-label='Stay consistent with what she has already told fans' />
            <span>Stay consistent with what she has already told fans <span className='text-muted-foreground'>(reads some of her past messages)</span></span>
          </label>
        </div>

        <DialogFooter>
          <Button variant='ghost' onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={generate} disabled={busy}>{busy ? <><Loader2 className='animate-spin' />Writing her profile…</> : <><WandSparkles />Generate</>}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
