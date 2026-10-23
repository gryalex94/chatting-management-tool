import { useEffect, useState } from 'react';
import { Loader2, Lock, Sparkles, WandSparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/services/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { cost, dayTime, errMsg } from './shared';
import GenerateDialog from './GenerateDialog';

// Her profile, field by field: [key, label, hint, rows (0 = one line)].
const FIELDS = [
  ['name', 'Her name', '', 0],
  ['gender', 'Gender', '', 0],
  ['age', 'Age', '18 or over.', 0],
  ['orientation', 'Sexuality', '', 0],
  ['from', 'Where she lives', '', 0],
  ['vibe', 'Vibe', 'e.g. Playful tease, Bratty', 0],
  ['heat', 'How spicy', 'Mild, Medium or Hot, and what that means for her.', 2],
  ['about', 'Her story', 'A few sentences: what she shares about her life.', 3],
  ['personality', 'Personality', '', 3],
  ['likes', 'What she likes', '', 3],
  ['limits', 'Her limits', 'Things she won\'t do or talk about.', 2],
  ['facts', 'Things she has told fans about herself', 'One per line (her pet, her job, her city…). She keeps these the same with every fan.', 4],
  ['real_answer', 'If a fan asks whether she\'s real', 'She always says she\'s an AI character; this is how she puts it.', 2],
];
const TYPING = [
  ['relaxed', 'Relaxed', 'a 60-letter message takes about 20 seconds'],
  ['normal', 'Normal', 'about 13 seconds, like texting on a phone'],
  ['quick', 'Quick', 'about 9 seconds'],
];
const EMOJIS = [
  ['none', 'None'],
  ['rarely', 'Rarely', 'about 1 reply in 4'],
  ['sometimes', 'Sometimes', 'about half her replies'],
  ['often', 'Often', 'most replies'],
];
const LISTS = ['facts'];
const toForm = (p) => Object.fromEntries(FIELDS.map(([k]) => [k, LISTS.includes(k) ? (p?.[k] || []).join('\n') : p?.[k] || '']));
const fromForm = (f) => ({ ...f, ...Object.fromEntries(LISTS.map(k => [k, f[k].split('\n').map(s => s.trim()).filter(Boolean)])) });

/**
 * Who she is, as the AI writes her: generated from a manager's description (or
 * typed), with the facts she has told fans about herself read from her past
 * chats, then checked and saved by a manager. How she chats comes from the
 * agency's analysis of ~35k chats, not her own Fanvue chats. Next to it, the
 * house rules every reply keeps, which can't be switched off.
 */
// Her diary (B9): what she has told fans about herself, from every fan's notes, the
// same for everyone. A fact that doesn't hold any more can be switched off here.
function HerDiary({ page }) {
  const [facts, setFacts] = useState(null);
  const [busy, setBusy] = useState('');
  useEffect(() => {
    let live = true;
    api.get(`/api/ai-chat/pages/${page.creator_id}/diary`).then(r => { if (live) setFacts(r.data.facts); }).catch(() => { if (live) setFacts([]); });
    return () => { live = false; };
  }, [page.creator_id]);
  const toggle = async (f) => {
    setBusy(f.text);
    try {
      const { data } = await api.patch(`/api/ai-chat/pages/${page.creator_id}/diary`, { text: f.text, off: !f.off });
      setFacts(data.facts);
    } catch (e) { toast.error(errMsg(e, 'Could not change her diary')); }
    finally { setBusy(''); }
  };
  const on = (facts || []).filter(f => !f.off), off = (facts || []).filter(f => f.off);
  return (
    <div className='flex flex-col gap-2 rounded-lg border p-4'>
      <p className='text-sm font-medium'>Her diary: what she has told fans about herself</p>
      <p className='text-xs text-muted-foreground'>Gathered from every fan&apos;s notes, so she stays the same Yuna with everyone; the writer reads it with each reply and Claude checks for contradictions. Switch off anything that doesn&apos;t hold.</p>
      {facts === null ? <p className='text-xs text-muted-foreground'>Loading…</p> : !facts.length ? <p className='text-xs text-muted-foreground'>Nothing yet: it fills up as fans&apos; notes are read.</p> : (
        <ul className='flex flex-col gap-1 text-sm'>
          {on.slice(0, 40).map(f => (
            <li key={f.text} className='flex items-start justify-between gap-2'>
              <span>{f.text}{f.profile ? <span className='ms-1.5 text-xs text-muted-foreground'>(profile)</span> : f.fans > 1 ? <span className='ms-1.5 text-xs text-muted-foreground'>({f.fans} fans)</span> : null}</span>
              {!f.profile && <button type='button' onClick={() => toggle(f)} disabled={busy === f.text} className='shrink-0 text-xs text-muted-foreground hover:text-foreground hover:underline'>doesn&apos;t hold</button>}
            </li>
          ))}
          {on.length > 40 && <li className='text-xs text-muted-foreground'>…and {on.length - 40} more; the writer reads the 40 most shared.</li>}
          {off.length > 0 && <li className='mt-1 text-xs text-muted-foreground'>Switched off: {off.map(f => <button key={f.text} type='button' onClick={() => toggle(f)} className='me-2 line-through hover:no-underline'>{f.text}</button>)}</li>}
        </ul>
      )}
    </div>
  );
}

const PLATFORM = { onlyfans: 'OnlyFans', fanvue: 'Fanvue', fansly: 'Fansly' };

/**
 * Whose creator profile this page uses. Every page has its own; the same creator on two
 * platforms can share one by linking this page to the other page's profile. Editing a
 * shared profile changes it for every page linked to it.
 */
function ProfileLink({ data, allPages, onChanged }) {
  const [busy, setBusy] = useState(false);
  const me = data.page;
  const linked = data.profile_from;
  const choices = (allPages || []).filter(p => p.creator_id !== me.creator_id && !p.profile_from);
  const change = async (v) => {
    setBusy(true);
    try {
      const { data: d } = await api.put(`/api/ai-chat/pages/${me.creator_id}/profile-link`, { from: v === 'own' ? null : v });
      toast.success(v === 'own' ? 'This page uses its own profile again' : 'Linked: this page now uses that profile');
      onChanged?.(d);
    } catch (e) { toast.error(errMsg(e, 'Could not link the profile')); }
    finally { setBusy(false); }
  };
  return (
    <div className='flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm'>
      <div className='min-w-0'>
        <p className='font-medium'>{linked ? `Uses the profile of ${linked.name} (${PLATFORM[linked.platform] || linked.platform})` : 'This page\'s own creator profile'}</p>
        <p className='text-xs text-muted-foreground'>
          {linked ? 'The same creator on two platforms: what you change here changes it for both pages.' : 'Pages are kept apart per platform. Link only when it is the same creator on another platform.'}
        </p>
      </div>
      <Select value={linked ? linked.creator_id : 'own'} onValueChange={change} disabled={busy}>
        <SelectTrigger className='w-64' aria-label='Whose profile this page uses'><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value='own'>Its own profile</SelectItem>
          {choices.map(p => <SelectItem key={p.creator_id} value={p.creator_id}>Same creator as {p.name} ({PLATFORM[p.platform] || p.platform})</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

export default function ProfileTab({ page, writers, ready, onSaved, allPages = [] }) {
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [writer, setWriter] = useState('');
  const [typing, setTyping] = useState('normal');
  const [emojis, setEmojis] = useState('rarely');
  const [timezone, setTimezone] = useState('');
  const [drafted, setDrafted] = useState(null);       // { read, cost, model, added | generated } after facts or a generated profile, until saved
  const [busy, setBusy] = useState('');
  const [generating, setGenerating] = useState(false);  // the "Generate from a description" window

  useEffect(() => {
    api.get(`/api/ai-chat/pages/${page.creator_id}/profile`).then(r => {
      setData(r.data); setForm(toForm(r.data.profile)); setWriter(r.data.writer); setTyping(r.data.typing || 'normal'); setEmojis(r.data.emojis || 'rarely'); setTimezone(r.data.timezone);
    }).catch(e => setData({ error: errMsg(e, 'Could not load her profile') }));
  }, [page.creator_id]);

  if (!data) return <div className='grid gap-3'>{[0, 1, 2, 3].map(i => <Skeleton key={i} className='h-14 w-full' />)}</div>;
  if (data.error) return <p className='text-sm text-muted-foreground'>{data.error}</p>;

  const saved = toForm(data.profile);
  const dirty = !!drafted || writer !== data.writer || typing !== (data.typing || 'normal') || emojis !== (data.emojis || 'rarely') || timezone !== data.timezone || FIELDS.some(([k]) => form[k] !== saved[k]);
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  // the facts she told fans about herself, added to the form (nothing else changes)
  const draft = async () => {
    setBusy('draft');
    try {
      const { data: d } = await api.post(`/api/ai-chat/pages/${page.creator_id}/profile/draft`);
      const found = toForm(d.profile);
      setForm(f => {
        const have = f.facts.split('\n').map(x => x.trim()).filter(Boolean);
        const more = found.facts.split('\n').map(x => x.trim()).filter(x => x && !have.some(h => h.toLowerCase() === x.toLowerCase()));
        return { ...f, name: f.name || found.name, age: f.age || found.age, from: f.from || found.from, facts: [...have, ...more].join('\n') };
      });
      setDrafted({ read: d.read, cost: d.cost, model: d.model, added: d.added });
      toast.success(d.added ? `Added ${d.added} fact${d.added === 1 ? '' : 's'}: check them, then save` : 'No new facts found');
    } catch (e) { toast.error(errMsg(e, 'Could not read her facts')); }
    finally { setBusy(''); }
  };
  const save = async () => {
    setBusy('save');
    try {
      const { data: d } = await api.put(`/api/ai-chat/pages/${page.creator_id}/profile`, { profile: fromForm(form), writer, typing, emojis, timezone, drafted: !!drafted });
      setData(d); setForm(toForm(d.profile)); setWriter(d.writer); setTyping(d.typing || 'normal'); setEmojis(d.emojis || 'rarely'); setTimezone(d.timezone); setDrafted(null);
      toast.success('Profile saved');
      onSaved?.();
    } catch (e) { toast.error(errMsg(e, 'Could not save')); }
    finally { setBusy(''); }
  };

  return (
    <div className='grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]'>
      <div className='flex flex-col gap-4'>
        <div className='flex flex-wrap items-center justify-between gap-2 rounded-lg border px-4 py-3'>
          <div className='text-sm'>
            <p className='font-medium'>{data.page.name} <span className='font-normal text-muted-foreground'>{data.page.handle ? `@${data.page.handle}` : PLATFORM[data.page.platform] || ''}</span></p>
            <p className='text-xs text-muted-foreground'>
              {drafted ? `${drafted.generated ? `Generated by ${drafted.model}${drafted.read ? `, consistent with ${drafted.read} of her messages` : ''}` : `Facts read by ${drafted.model} from ${drafted.read} of her messages: ${drafted.added || 'no'} new`} (${cost(drafted.cost)}). Check it, change what's wrong, then save.`
                : data.updated_at ? `Saved ${dayTime(data.updated_at)}.` : 'No profile yet: generate one from a description, then check it.'}
            </p>
          </div>
          <div className='flex flex-wrap gap-2'>
            <Button variant='outline' onClick={() => setGenerating(true)} disabled={!!busy || !ready.writer || !ready.tables}><WandSparkles />Generate from a description</Button>
            {data.page.fanvue && <Button variant='outline' onClick={draft} disabled={!!busy || !ready.writer || !ready.tables}>
              {busy === 'draft' ? <><Loader2 className='animate-spin' />Reading her chats…</> : <><Sparkles />Facts from her chats</>}
            </Button>}
          </div>
        </div>

        <ProfileLink data={data} allPages={allPages} onChanged={(d) => {
          setData(d); setForm(toForm(d.profile)); setWriter(d.writer); setTyping(d.typing || 'normal'); setEmojis(d.emojis || 'rarely'); setTimezone(d.timezone); setDrafted(null); onSaved?.();
        }} />

        {generating && (
          <GenerateDialog page={page} options={data.options} current={fromForm(form)}
            onClose={() => setGenerating(false)}
            onGenerated={(d) => { setForm(toForm(d.profile)); setDrafted({ read: d.read, cost: d.cost, model: d.model, generated: true }); setGenerating(false); }} />
        )}

        <div className='grid gap-4 sm:grid-cols-3'>
          {FIELDS.filter(([, , , rows]) => !rows).map(([k, label, hint]) => (
            <div key={k} className='grid content-start gap-1.5'>
              <Label htmlFor={`pf-${k}`}>{label}</Label>
              <Input id={`pf-${k}`} value={form[k]} onChange={set(k)} inputMode={k === 'age' ? 'numeric' : undefined} />
              {hint && <span className='text-xs text-muted-foreground'>{hint}</span>}
            </div>
          ))}
        </div>
        {FIELDS.filter(([, , , rows]) => rows).map(([k, label, hint, rows]) => (
          <div key={k} className='grid gap-1.5'>
            <Label htmlFor={`pf-${k}`}>{label}</Label>
            <Textarea id={`pf-${k}`} rows={rows} value={form[k]} onChange={set(k)} />
            {hint && <span className='text-xs text-muted-foreground'>{hint}</span>}
          </div>
        ))}

        <div className='flex flex-wrap items-end justify-between gap-3'>
          <div className='grid gap-1.5'>
            <Label>Typing speed</Label>
            <Select value={typing} onValueChange={setTyping}>
              <SelectTrigger className='w-40' aria-label='Typing speed'><SelectValue /></SelectTrigger>
              <SelectContent>{TYPING.map(([id, label]) => <SelectItem key={id} value={id}>{label}</SelectItem>)}</SelectContent>
            </Select>
            <span className='text-xs text-muted-foreground'>Her messages arrive one at a time: {TYPING.find(t => t[0] === typing)?.[2]}.</span>
          </div>
          <div className='grid gap-1.5'>
            <Label>Emojis</Label>
            <Select value={emojis} onValueChange={setEmojis}>
              <SelectTrigger className='w-40' aria-label='Emojis'><SelectValue /></SelectTrigger>
              <SelectContent>{EMOJIS.map(([id, label]) => <SelectItem key={id} value={id}>{label}</SelectItem>)}</SelectContent>
            </Select>
            <span className='text-xs text-muted-foreground'>{emojis === 'none' ? 'Never.' : `At most one per reply, in ${EMOJIS.find(e => e[0] === emojis)?.[2]}.`}</span>
          </div>
          <div className='grid gap-1.5'>
            <Label>Her time zone</Label>
            <Select value={timezone} onValueChange={setTimezone}>
              <SelectTrigger className='w-56' aria-label='Her time zone'><SelectValue /></SelectTrigger>
              <SelectContent>{data.time_zones.map(([id, label]) => <SelectItem key={id} value={id}>{label}</SelectItem>)}</SelectContent>
            </Select>
            <span className='text-xs text-muted-foreground'>The time she lives by in the chat (morning, late night…).</span>
          </div>
          <div className='grid gap-1.5'>
            <Label>Writes her replies</Label>
            <Select value={writer} onValueChange={setWriter}>
              <SelectTrigger className='w-64' aria-label='Writer'><SelectValue /></SelectTrigger>
              <SelectContent>{writers.map(w => <SelectItem key={w.id} value={w.id}>{w.label}</SelectItem>)}</SelectContent>
            </Select>
            <span className='text-xs text-muted-foreground'>Also keeps her memory of each fan. You can compare others in Practice.</span>
          </div>
          <Button onClick={save} disabled={!dirty || !!busy || !form.name.trim()}>{busy === 'save' ? 'Saving…' : dirty ? 'Save' : 'Saved'}</Button>
        </div>
      </div>

      <div className='flex flex-col gap-4'>
        <HerDiary page={page} />
        <div className='flex flex-col gap-2 rounded-lg border bg-muted/30 p-4'>
          <p className='flex items-center gap-1.5 text-sm font-medium'><Lock className='size-3.5' />House rules, in every reply</p>
          <p className='text-xs text-muted-foreground'>Always on; they can&apos;t be switched off. The tool also checks every reply against them.</p>
          <ol className='list-decimal space-y-1.5 ps-4 text-sm'>{data.house_rules.map((r, i) => <li key={i}>{r}</li>)}</ol>
        </div>
        <div className='flex flex-col gap-2 rounded-lg border p-4'>
          <p className='text-sm font-medium'>How she chats</p>
          <p className='text-xs text-muted-foreground'>From the agency&apos;s analysis of ~35k chats: what the chats that went well had in common, and the costliest mistakes. Each reply also gets a few real examples from those chats.</p>
          <ul className='list-disc space-y-1.5 ps-4 text-sm'>{data.chat_guide.map((r, i) => <li key={i}>{r}</li>)}</ul>
        </div>
      </div>
    </div>
  );
}
