// Structured facts about a creator page, fed to the AI whenever that page's
// dialogues are reviewed. Each field exists because a MISSING fact caused a real
// false alarm: content that does exist read as a ToS breach, a legitimate second
// account read as off-platform, content we can't make read as a missed sale.
//
// Shared so the editor can live wherever the creator record is managed.
export const CONTEXT_FIELDS = [
  { key:'content_available',   label:'Content that DOES exist here',          hint:'Stops it being flagged as off-scope or a ToS breach',      ph:'e.g. anal, B/G videos, cosplay sets' },
  { key:'content_unavailable', label:"Content we CAN'T provide",              hint:"Not offering it won't count as a missed sale",             ph:'e.g. no voice notes, no video calls, no customs' },
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

const inputStyle = {
  width:'100%', padding:'8px 10px', fontSize:13, background:'var(--bg-2)',
  border:'1px solid var(--border)', borderRadius:'var(--r-tile)', color:'var(--fg-0)',
  outline:'none', fontFamily:'inherit',
};

/** Controlled editor for the structured context + the free-text catch-all. */
export default function PageContextFields({ ctx, setCtx, text, setText, disabled = false }) {
  const set = (k, v) => setCtx(p => ({ ...p, [k]: v }));
  return (
    <>
      <div style={{ fontSize:12, color:'var(--fg-3)', marginBottom:14, lineHeight:1.5 }}>
        Anything you fill in is treated as fact for this page and overrides the AI's general
        assumptions when it reviews these conversations. Every field is optional.
      </div>
      {CONTEXT_FIELDS.map(f => (
        <div key={f.key} style={{ marginBottom:12 }}>
          <div style={{ fontSize:12, fontWeight:600, color:'var(--fg-1)' }}>{f.label}</div>
          <div style={{ fontSize:10.5, color:'var(--fg-3)', margin:'2px 0 5px' }}>{f.hint}</div>
          <input value={ctx?.[f.key] || ''} disabled={disabled}
            onChange={e => set(f.key, e.target.value)} placeholder={f.ph} style={inputStyle}/>
        </div>
      ))}
      <div style={{ fontSize:12, fontWeight:600, color:'var(--fg-1)' }}>Anything else</div>
      <div style={{ fontSize:10.5, color:'var(--fg-3)', margin:'2px 0 5px' }}>Free-text rules that don't fit above</div>
      <textarea value={text || ''} disabled={disabled} onChange={e => setText(e.target.value)} rows={3}
        placeholder={"e.g. She's shy on cam — don't promise video calls."}
        style={{ ...inputStyle, lineHeight:1.5, resize:'vertical' }}/>
    </>
  );
}
