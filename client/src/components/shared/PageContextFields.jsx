import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

// Structured facts about a creator page, fed to the AI whenever that page's
// dialogues are reviewed. Each field exists because a MISSING fact caused a real
// false alarm: content that does exist read as a ToS breach, a legitimate second
// account read as off-platform, content we can't make read as a missed sale.
//
// Shared so the editor can live wherever the creator record is managed.
export const CONTEXT_FIELDS = [
  { key:'content_available',   label:'Content that does exist here',          hint:'Stops it being flagged as off-scope or a ToS breach',      ph:'e.g. anal, B/G videos, cosplay sets' },
  { key:'content_unavailable', label:"Content we can't provide",              hint:"Not offering it won't count as a missed sale",             ph:'e.g. no voice notes, no video calls, no customs' },
  { key:'known_platforms',     label:'Other places she legitimately exists',  hint:'A fan mentioning these is not an off-platform violation',  ph:'e.g. second OnlyFans page, public Telegram group' },
  { key:'persona',             label:'Persona / voice',                       hint:'How this page talks',                                      ph:'e.g. shy student, playful and sarcastic' },
  { key:'pricing',             label:'Pricing on this page',                  hint:'Page-specific prices',                                     ph:'e.g. photos $45, videos $80, customs from $150' },
  { key:'emoji',               label:'Emoji rules',                           hint:'Preferred / banned emojis',                                ph:'e.g. use 🖤 not ❤️' },
];

// Strip empties so we never store blank keys.
export function cleanContext(ctx) {
  const out = {};
  CONTEXT_FIELDS.forEach(f => { const v = (ctx?.[f.key] || '').trim(); if (v) out[f.key] = v; });
  return Object.keys(out).length ? out : null;
}

function Field({ id, label, hint, children }) {
  return (
    <div className='grid gap-1.5'>
      <div>
        <Label htmlFor={id}>{label}</Label>
        <p className='mt-0.5 text-xs text-muted-foreground'>{hint}</p>
      </div>
      {children}
    </div>
  );
}

/** Controlled editor for the structured context + the free-text catch-all. */
export default function PageContextFields({ ctx, setCtx, text, setText, disabled = false }) {
  const set = (k, v) => setCtx(p => ({ ...p, [k]: v }));
  return (
    <div className='grid gap-4'>
      <p className='text-sm leading-relaxed text-muted-foreground'>
        Anything you fill in is treated as fact for this page and overrides the AI's general
        assumptions when it reviews these conversations. Every field is optional.
      </p>
      {CONTEXT_FIELDS.map(f => (
        <Field key={f.key} id={`ctx-${f.key}`} label={f.label} hint={f.hint}>
          <Input id={`ctx-${f.key}`} value={ctx?.[f.key] || ''} disabled={disabled}
            onChange={e => set(f.key, e.target.value)} placeholder={f.ph} />
        </Field>
      ))}
      <Field id='ctx-other' label='Anything else' hint="Free-text rules that don't fit above">
        <Textarea id='ctx-other' value={text || ''} disabled={disabled} onChange={e => setText(e.target.value)} rows={3}
          placeholder={"e.g. She's shy on cam — don't promise video calls."} className='leading-relaxed' />
      </Field>
    </div>
  );
}
