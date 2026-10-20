/**
 * Her content map (ai_content, database change 041): what she can sell, each item
 * described precisely, so the AI only offers what really exists, describes it
 * truthfully and matches it to what he asks for. When nothing matches she says so
 * and offers the closest thing. Pure (no database, no network).
 *  - STARTER: an example list to start from (the manager changes it to what she
 *    really has).
 *  - levelOf: how spicy an item is (the same 0–3 scale as the chat).
 *  - contentText: the list as the writer reads it.
 *  - checkOffer: is the PPV the writer attached allowed right now?
 */
const NUDITY = ['dressed', 'lingerie', 'implied', 'topless', 'nude', 'explicit'];
const NUDITY_LABEL = { dressed: 'fully dressed', lingerie: 'in underwear or lingerie', implied: 'nude but covered', topless: 'topless', nude: 'fully nude', explicit: 'explicit' };
const NUDITY_LEVEL = { dressed: 1, lingerie: 2, implied: 2, topless: 3, nude: 3, explicit: 3 };
// fetish content is at least suggestive even when she is dressed
const FETISH = /\b(?:feet|foot|soles|toes|giantess|smother\w*|worship|dominat\w*|crush\w*|trampl\w*)\b/i;
const LEVEL_WORD = ['friendly', 'flirty', 'suggestive', 'explicit'];

const levelOf = (it) => Math.max(NUDITY_LEVEL[it.nudity] ?? 1, FETISH.test([...(it.tags || []), it.focus, it.action].join(' ')) ? 2 : 0);
const money = (n) => `$${Number(n) % 1 ? Number(n).toFixed(2) : Number(n)}`;
const lowest = (it) => Number(it.min_price ?? Math.round(it.price * 0.8));
const length = (m) => (Number(m) < 1 ? `${Math.max(1, Math.round(Number(m) * 60))}-second` : `${Number(m)}-minute`);
const what = (it) => (it.kind === 'video' ? `a ${it.minutes ? `${length(it.minutes)} ` : ''}video`
  : it.kind === 'bundle' ? 'a bundle' : `${it.amount || 'a set of'} photo${it.amount === 1 ? '' : 's'}`);

const STARTER = [
  {
    title: 'Tall girl selfies', kind: 'photos', amount: 3, nudity: 'dressed', focus: 'her whole body and her height', outfit: 'fitted jeans and a white crop top',
    setting: 'the mirror in her hallway', action: 'mirror selfies next to a door frame', face: true, tags: ['tall', 'selfie', 'casual', 'height'],
    description: '3 mirror selfies, fully dressed in fitted jeans and a white crop top, standing next to a door frame she almost touches with her head. Playful, nothing revealing.',
    price: 12, min_price: 9, notes: 'A light first offer for a new or shy fan.',
  },
  {
    title: 'Legs for days', kind: 'photos', amount: 4, nudity: 'dressed', focus: 'her legs', outfit: 'a short black dress and high heels',
    setting: 'her living room', action: 'standing, sitting with her legs crossed, one shot from low down', face: true, tags: ['legs', 'heels', 'dress', 'tall'],
    description: '4 photos in a short black dress and high heels, all about her long legs: standing, sitting with her legs crossed, one from low down. No nudity.',
    price: 15, min_price: 12, notes: '',
  },
  {
    title: 'Feet', kind: 'photos', amount: 4, nudity: 'dressed', focus: 'her bare feet', outfit: 'barefoot',
    setting: 'a white bed sheet', action: 'close-ups of her soles and toes, one with her feet pressed toward the camera', face: false, tags: ['feet', 'soles', 'toes'],
    description: '4 close-ups of her bare feet on a white bed sheet: her soles, her toes with red nail polish, and one with her feet pressed toward the camera. Her face isn\'t in them.',
    price: 18, min_price: 14, notes: 'For fans into feet.',
  },
  {
    title: 'Giantess view', kind: 'photos', amount: 4, nudity: 'dressed', focus: 'her whole body seen from the floor', outfit: 'denim shorts and a tank top',
    setting: 'shot from the floor looking up', action: 'standing over the camera looking down, one with her bare foot raised above the lens', face: true, tags: ['giantess', 'pov', 'tall', 'dominant', 'feet'],
    description: '4 photos shot from the floor looking up at her, so she towers over the viewer: in denim shorts and a tank top, looking down with a smirk, one with her bare foot raised above the camera. No nudity.',
    price: 22, min_price: 17, notes: 'For fans into giantess, height or being dominated.',
  },
  {
    title: 'Lingerie tease', kind: 'photos', amount: 5, nudity: 'lingerie', focus: 'her body in lingerie', outfit: 'a black lace bra and panties',
    setting: 'her bed', action: 'lying on her side, kneeling, one from behind looking over her shoulder', face: true, tags: ['lingerie', 'lace', 'bed', 'tease'],
    description: '5 photos in a black lace bra and panties on her bed: lying on her side, kneeling, and one from behind looking over her shoulder. Nothing see-through, no nudity.',
    price: 22, min_price: 17, notes: '',
  },
  {
    title: 'Topless tease', kind: 'photos', amount: 4, nudity: 'implied', focus: 'her chest, covered', outfit: 'only white panties',
    setting: 'her bathroom mirror', action: 'covering her breasts with her hands and arm', face: true, tags: ['topless', 'implied', 'tease', 'mirror'],
    description: '4 photos in only white panties in her bathroom mirror, covering her breasts with her hands and arm. No nipples shown.',
    price: 30, min_price: 24, notes: '',
  },
  {
    title: 'Slow strip video', kind: 'video', minutes: 1.5, nudity: 'lingerie', focus: 'her body', outfit: 'an oversized white shirt over red lingerie',
    setting: 'her bedroom', action: 'slowly unbuttons the shirt and lets it drop, ends in the red lingerie, then turns around', face: true, tags: ['strip', 'video', 'lingerie', 'tease'],
    description: 'A 1.5-minute video: she slowly unbuttons an oversized white shirt and lets it drop, ending in a red lingerie set, then turns around slowly. No nudity.',
    price: 40, min_price: 32, notes: '',
  },
  {
    title: 'Full nude set', kind: 'photos', amount: 6, nudity: 'nude', focus: 'her whole body', outfit: 'nothing',
    setting: 'her bed and her shower', action: 'posing nude: 3 on the bed (lying back, on her knees, from behind), 3 in the shower', face: true, tags: ['nude', 'full body', 'shower', 'bed'],
    description: '6 fully nude photos: 3 on her bed (lying back, on her knees, from behind) and 3 in the shower with water running down her body. Posing only, no toys.',
    price: 45, min_price: 36, notes: 'Only once he has bought something before.',
  },
  {
    title: 'Explicit video', kind: 'video', minutes: 3, nudity: 'explicit', focus: 'her body', outfit: 'a lace lingerie set she takes off',
    setting: 'her bed', action: 'undresses, then uses a vibrator until she climaxes', face: true, tags: ['explicit', 'solo', 'toy', 'vibrator', 'video', 'orgasm'],
    description: 'A 3-minute solo video on her bed: she takes off a lace lingerie set and uses a vibrator until she climaxes. Only her, no other people.',
    price: 65, min_price: 52, notes: 'Only once he has bought something before.',
  },
  {
    title: 'The big bundle', kind: 'bundle', amount: 8, nudity: 'explicit', focus: 'everything', outfit: 'lingerie, then nothing',
    setting: 'her bed and her shower', action: 'the full nude set plus 2 explicit solo videos', face: true, tags: ['bundle', 'nude', 'explicit', 'video', 'toy'],
    description: 'Everything spicy at once: the 6-photo full nude set plus 2 explicit solo videos (3 minutes each), with a vibrator and her fingers, on her bed and in the shower.',
    price: 150, min_price: 120, notes: 'Only for big spenders who have already bought several of her PPVs.',
  },
];

// What the platform's AI sees in an item's files, in one line.
function seenText(it) {
  const s = it.seen;
  if (!s) return '';
  const others = (s.people || []).filter(p => !/^(?:female|woman|women)$/.test(p));
  return [
    `acts: ${s.acts?.length ? s.acts.join(', ') : 'none'}`, `toys/objects: ${(s.objects || []).filter(o => o !== 'smartphone').join(', ') || 'none'}`,
    `other people: ${others.length ? others.join(', ') : 'none'}`, s.setting?.length ? `setting: ${s.setting.slice(0, 6).join(', ')}` : null,
    s.body?.length ? `shows: ${s.body.slice(0, 8).join(', ')}` : null,
  ].filter(Boolean).join('; ');
}

/** The content list as the writer reads it (only active items; a series in order). */
function contentText(items) {
  const active = items.filter(it => it.active !== false);
  const one = (it) => {
    const head = `[c${it.id}] ${it.series ? `${it.series}, step ${it.step}: ` : ''}${it.title} · ${what(it)} · ${NUDITY_LABEL[it.nudity] || it.nudity}, ${LEVEL_WORD[levelOf(it)]} · ${money(it.price)} (lowest ${money(lowest(it))})`;
    const bits = [`  Inside: ${it.description}`];
    if (it.seen) bits.push(`  In the files: ${seenText(it)}`);
    if (it.tags?.length) bits.push(`  Tags: ${it.tags.join(', ')}${it.face === false ? ' · her face isn\'t shown' : ''}`);
    if (it.notes) bits.push(`  When: ${it.notes}`);
    return [head, ...bits].join('\n');
  };
  const single = active.filter(it => !it.series);
  const series = {};
  for (const it of active.filter(x => x.series)) (series[it.series] ||= []).push(it);
  return [
    ...single.map(one),
    ...Object.entries(series).map(([name, list]) => `Series "${name}" (a sexting sequence: send it step by step, the next step only after he bought the last one):\n${list.sort((a, b) => a.step - b.step).map(one).join('\n')}`),
  ].join('\n');
}

/**
 * Whether the PPV the writer attached may go out now. `ppv` = { item: "c12", price },
 * `items` = her content, `offered` = the PPVs already in this chat ({ id, status,
 * open }: open = still waiting for him, so no new one yet), `level` = { his, max },
 * `warm` = past the warm-up. Returns { item, price } or { problem }.
 */
// `lowestShare`: inside a paid roleplay, PPVs may go down to this share of the list price (D4).
function checkOffer({ ppv, items, offered = [], level, warm, lowestShare = null }) {
  const id = Number(String(ppv?.item || '').replace(/^c/i, ''));
  const item = items.find(it => it.id === id && it.active !== false);
  if (!item) return { problem: 'It attached content that isn\'t in her content list. Only offer what\'s in the list; if nothing fits, say so and offer the closest item.' };
  if (!warm) return { problem: 'It offered a PPV during the warm-up. Get to know him first; offer something only once you have been chatting a while.' };
  if (offered.some(o => o.open)) return { problem: 'Her last PPV is still unopened. Don\'t send another one until he reacts to it: point him to that one.' };
  if (offered.some(o => o.id === item.id)) return { problem: `He already got "${item.title}". Don't send the same item twice; pick another one or talk about that one.` };
  if (item.series) {
    // a sexting sequence: step by step, the next one only after he bought the last
    const bought = offered.map(o => items.find(x => x.id === o.id)).filter((x, k) => x?.series === item.series && offered[k].status === 'bought').map(x => x.step);
    const next = (bought.length ? Math.max(...bought) : 0) + 1;
    if (item.step !== next) {
      const want = items.find(x => x.series === item.series && x.step === next);
      return { problem: `"${item.series}" goes step by step: ${want ? `send step ${next} next ("${want.title}")` : 'it is finished'}, not step ${item.step}.` };
    }
  }
  if (levelOf(item) > (level?.max ?? 0) + 1) return { problem: `"${item.title}" is ${LEVEL_WORD[levelOf(item)]}: far spicier than the chat is now. Build it up first, or offer something softer.` };
  const price = Number(ppv.price) || Number(item.price);
  const floor = lowestShare ? Math.min(lowest(item), Math.round(Number(item.price) * lowestShare)) : lowest(item);
  if (price < floor) return { problem: `${money(price)} is below the lowest price for "${item.title}" (${money(floor)}).` };
  if (price > Number(item.price) * 1.2) return { problem: `${money(price)} is more than "${item.title}" costs (${money(item.price)}).` };
  return { item, price: Math.round(price * 100) / 100 };
}

// What a fan may ask for, and how to recognise it in an item (its kind, how much she
// shows, Fanvue's content tags, its own words). Each concept: [label, words he uses, test].
// "No toys, no other people." in a description isn't a toy: negations are left out.
const said = (t) => String(t || '').toLowerCase().replace(/\b(?:no|not|without|nothing)\b[^.;]*[.;]?/g, ' ');
const has = (it, ...words) => {
  const s = it.seen || {};
  const hay = [it.title, said(it.description), ...(it.tags || []), it.focus, it.outfit, it.setting, it.action, ...(s.acts || []), ...(s.objects || []), ...(s.setting || []), ...(s.body || []), ...(s.categories || [])]
    .join(' ').toLowerCase();
  return words.some(w => hay.includes(w));
};
// what an item is about (not every body part that happens to be in a full-body shot)
const about = (it, ...words) => {
  const hay = [it.title, said(it.description), ...(it.tags || []), it.focus].join(' ').toLowerCase();
  return words.some(w => hay.includes(w));
};
const withMan = (it) => (it.seen?.people || []).some(p => /\b(?:male|man|men|boy)\b/.test(p)) || /\b(?:male partner|a man|with a man|nude man|partner)\b/i.test(it.description || '');
const CONCEPTS = [
  ['a man in it', /\b(?:guy|guys|man|men|dude|boy ?friend|bf|partner|couple|b\/?g|with (?:a|another) (?:guy|man|dude)|sex with)\b/i, withMan],
  ['a toy', /\b(?:toy|toys|dildo|vibrator|plug)\b/i, it => has(it, 'dildo', 'vibrator', 'plug', 'sex toy') || (it.seen?.objects || []).some(o => /toy|dildo|vibrator/.test(o))],
  ['the shower or bath', /\b(?:shower|bath|bathtub|tub)\b/i, it => has(it, 'shower', 'bath')],
  ['a video', /\b(?:video|vid|vids|clip|movie)\b/i, it => it.kind === 'video' || it.kind === 'bundle'],
  ['full nudity', /\b(?:nude|naked|everything|all of you|full(?:y)? (?:nude|naked))\b/i, it => ['nude', 'explicit'].includes(it.nudity)],
  ['lace', /\blace\b/i, it => about(it, 'lace')],
  ['lingerie', /\b(?:lingerie|bra|panties|thong|bodysuit|underwear)\b/i, it => about(it, 'lingerie', 'bra', 'panties', 'thong', 'bodysuit', 'underwear')],
  ['her feet', /\b(?:feet|foot|toes|soles)\b/i, it => about(it, 'feet', 'foot', 'toes', 'soles')],
  ['her ass', /\b(?:ass|butt|booty|behind)\b/i, it => has(it, 'ass', 'buttock', 'booty')],
  ['her breasts', /\b(?:tits|boobs|breasts|titties|nipples)\b/i, it => has(it, 'boobs', 'breast', 'nipple')],
  ['anal', /\b(?:anal|ass ?fuck)\b/i, it => has(it, 'anal')],
  ['oral', /\b(?:blow ?job|bj|oral|suck(?:ing)? (?:a |his )?(?:cock|dick))\b/i, it => has(it, 'oral', 'blowjob', 'fellatio')],
  ['touching herself', /\b(?:touch(?:ing)? (?:yourself|herself)|masturbat\w*|finger(?:ing)?|play(?:ing)? with (?:yourself|herself))\b/i, it => has(it, 'masturbat', 'fingering')],
  ['a mirror selfie', /\b(?:mirror|selfie)\b/i, it => has(it, 'mirror', 'selfie')],
];

/**
 * What he asks for (from his latest messages), matched against her content: the items
 * that have all of it, or else the closest ones. Null when he isn't asking for anything specific.
 */
function matchRequest(text, items) {
  const wants = CONCEPTS.filter(([, re]) => re.test(String(text || '')));
  if (!wants.length) return null;
  const active = items.filter(it => it.active !== false);
  const scored = active.map(it => ({ it, got: wants.filter(([, , test]) => test(it)).map(([label]) => label) })).filter(x => x.got.length);
  const full = scored.filter(x => x.got.length === wants.length).map(x => x.it);
  const close = full.length ? [] : scored.sort((a, b) => b.got.length - a.got.length || a.it.price - b.it.price).slice(0, 3);
  return { wants: wants.map(([label]) => label), full, close };
}

module.exports = { NUDITY, NUDITY_LABEL, STARTER, levelOf, contentText, checkOffer, what, lowest, money, seenText, matchRequest };
