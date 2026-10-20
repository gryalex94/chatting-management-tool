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
const NUDITY_LABEL = { dressed: 'fully dressed', lingerie: 'lingerie', implied: 'nude but covered', topless: 'topless', nude: 'fully nude', explicit: 'explicit' };
const NUDITY_LEVEL = { dressed: 1, lingerie: 2, implied: 2, topless: 3, nude: 3, explicit: 3 };
// fetish content is at least suggestive even when she is dressed
const FETISH = /\b(?:feet|foot|soles|toes|giantess|smother\w*|worship|dominat\w*|crush\w*|trampl\w*)\b/i;
const LEVEL_WORD = ['friendly', 'flirty', 'suggestive', 'explicit'];

const levelOf = (it) => Math.max(NUDITY_LEVEL[it.nudity] ?? 1, FETISH.test([...(it.tags || []), it.focus, it.action].join(' ')) ? 2 : 0);
const money = (n) => `$${Number(n) % 1 ? Number(n).toFixed(2) : Number(n)}`;
const lowest = (it) => Number(it.min_price ?? Math.round(it.price * 0.8));
const what = (it) => (it.kind === 'video' ? `a ${it.minutes ? `${Number(it.minutes)}-minute ` : ''}video`
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

/** The content list as the writer reads it (only active items). */
function contentText(items) {
  return items.filter(it => it.active !== false).map((it) => {
    const head = `[c${it.id}] ${it.title} · ${what(it)} · ${NUDITY_LABEL[it.nudity] || it.nudity}, ${LEVEL_WORD[levelOf(it)]} · ${money(it.price)} (lowest ${money(lowest(it))})`;
    const bits = [`  Inside: ${it.description}`];
    if (it.tags?.length) bits.push(`  Tags: ${it.tags.join(', ')}${it.face === false ? ' · her face isn\'t shown' : ''}`);
    if (it.notes) bits.push(`  When: ${it.notes}`);
    return [head, ...bits].join('\n');
  }).join('\n');
}

/**
 * Whether the PPV the writer attached may go out now. `ppv` = { item: "c12", price },
 * `items` = her content, `offered` = the PPVs already in this chat ({ id, status }),
 * `level` = { his, max }, `warm` = past the warm-up. Returns { item, price } or { problem }.
 */
function checkOffer({ ppv, items, offered = [], level, warm }) {
  const id = Number(String(ppv?.item || '').replace(/^c/i, ''));
  const item = items.find(it => it.id === id && it.active !== false);
  if (!item) return { problem: 'It attached content that isn\'t in her content list. Only offer what\'s in the list; if nothing fits, say so and offer the closest item.' };
  if (!warm) return { problem: 'It offered a PPV during the warm-up. Get to know him first; offer something only once you have been chatting a while.' };
  if (offered.some(o => o.status === 'pending')) return { problem: 'Her last PPV is still unopened. Don\'t send another one until he reacts to it.' };
  if (offered.some(o => o.id === item.id)) return { problem: `He already got "${item.title}". Don't send the same item twice; pick another one or talk about that one.` };
  if (levelOf(item) > (level?.max ?? 0) + 1) return { problem: `"${item.title}" is ${LEVEL_WORD[levelOf(item)]}: far spicier than the chat is now. Build it up first, or offer something softer.` };
  const price = Number(ppv.price) || Number(item.price);
  if (price < lowest(item)) return { problem: `${money(price)} is below the lowest price for "${item.title}" (${money(lowest(item))}).` };
  if (price > Number(item.price) * 1.2) return { problem: `${money(price)} is more than "${item.title}" costs (${money(item.price)}).` };
  return { item, price: Math.round(price * 100) / 100 };
}

module.exports = { NUDITY, NUDITY_LABEL, STARTER, levelOf, contentText, checkOffer, what, lowest, money };
