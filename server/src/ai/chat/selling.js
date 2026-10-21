/**
 * The selling rule in code (your answers in AI_CHAT_ADJUSTMENT_QUESTIONS.md, Part A
 * and E5). Pure: no database, no network.
 *  - cadenceOf: how often she plans a sell attempt with him, by his tier, give or take,
 *    never on a fixed date (E5). Him asking, or getting sexual, always counts.
 *  - buysOf / pauseOf / attemptsToday: a big purchase in the last 48 hours pauses
 *    offers; one selling attempt per conversation and per day (A7).
 *  - firstSaleStage: a new subscriber's path to his first sale (A1): stay with his vibe,
 *    then flirt, then a sexy vibe, then the direct ask, then the probe offer. It starts
 *    over each conversation; a fan who says exactly what he wants skips the stages.
 *  - probeFor: the first sale's items and price by explicitness (A1): a tease $30, nude
 *    $40, explicit $50; a vague fan gets a tease set (what sold best to new subscribers).
 *  - tasteOf: what he bought and how he reacted, read from the chat (A3), and what he
 *    says he is or isn't into; pickFor: what to offer him next (3 of 4 the same kind he
 *    loved, 1 of 4 something new; something different after no reaction).
 *  - priceObjection (A5), tipCredit (D1).
 */
const C = require('./content');

const DAY = 86400_000, HOUR = 3600_000;
const clean = (s) => String(s ?? '').trim();

// ── Cadence (E5) ──────────────────────────────────────────────────────────────
// days between planned attempts, by tier; a time waster gets a short one each conversation
const EVERY = { tw: 0, none: 7, small: 7, spender: 14, whale: 17.5 };
const EVERY_TEXT = { tw: 'each short conversation', none: 'about once a week', small: 'about once a week', spender: 'about every two weeks', whale: 'every two or three weeks' };
// a steady "give or take" for this fan and this attempt: 0.7–1.3 of the interval, never a fixed date
function jitter(seed) {
  let h = 7;
  for (const ch of String(seed)) h = (h * 31 + ch.charCodeAt(0)) % 1000003;
  return 0.7 + (h % 61) / 100;
}
/**
 * `tier` = plan.fanProfile's tier, `lastAttemptAt` = when a PPV was last sent to him
 * (ISO, or null), `seed` = something steady per fan (his uuid or name).
 * Returns { every, text, days, since, due, next_in, why }.
 */
function cadenceOf(tier, { lastAttemptAt = null, now = new Date(), seed = '' } = {}) {
  const t = tier in EVERY ? tier : 'none';
  const days = Math.round(EVERY[t] * jitter(`${seed}|${String(lastAttemptAt || '').slice(0, 10)}`) * 10) / 10;
  const since = lastAttemptAt ? (now.getTime() - Date.parse(lastAttemptAt)) / DAY : null;
  const due = t === 'tw' || since == null || since >= days;
  const next_in = due ? 0 : Math.ceil(days - since);
  const ago = since == null ? '' : since < 1 ? 'today' : since < 2 ? 'yesterday' : `${Math.round(since)} days ago`;
  const why = t === 'tw' ? 'a time waster: one short, cheap attempt each conversation, a bit pushier (E5)'
    : since == null ? `no attempt with him yet: the first whenever it fits, then ${EVERY_TEXT[t]} (E5)`
    : due ? `${EVERY_TEXT[t]} with him, and the last attempt was ${ago} (E5)`
    : `${EVERY_TEXT[t]} with him; the last attempt was ${ago}, the next in about ${next_in} day${next_in === 1 ? '' : 's'} (E5)`;
  return { every: t, text: EVERY_TEXT[t], days, since: since == null ? null : Math.round(since * 10) / 10, due, next_in, why };
}

// ── His purchases lately (A7) ─────────────────────────────────────────────────
/** His purchases in the chat: [{ at, amount }]; a practice purchase has no time, so it counts as now. */
function buysOf(chat = [], now = Date.now()) {
  const out = [];
  for (const m of chat) {
    if (m.from_fan || m.mass) continue;
    if (m.paid && m.paid_at) out.push({ at: Date.parse(m.paid_at), amount: Number(m.paid) });
    else if (m.media?.price && (m.media.bought_at || m.media.status === 'bought')) out.push({ at: m.media.bought_at ? Date.parse(m.media.bought_at) : now, amount: Number(m.media.price) });
  }
  return out;
}
/** A big purchase in the last 48 hours: no offer for 48 hours, unless he asks or is very actively horny (A7). */
function pauseOf({ chat = [], avgPrice = null, now = new Date() }) {
  const t = now.getTime();
  const recent = buysOf(chat, t).filter(b => t - b.at <= 2 * DAY);
  if (!recent.length) return null;
  const total = recent.reduce((s, b) => s + b.amount, 0);
  const biggest = Math.max(...recent.map(b => b.amount));
  const usual = Number(avgPrice) >= 10 ? Number(avgPrice) : null;
  if (!(total >= 100 || (usual && biggest >= 2 * usual))) return null;
  const latest = Math.max(...recent.map(b => b.at));
  const left = Math.max(1, Math.round((latest + 2 * DAY - t) / HOUR));
  return {
    total: Math.round(total), until: new Date(latest + 2 * DAY).toISOString(), hours_left: left,
    why: `he spent $${Math.round(total)} in the last 48 hours${usual && biggest >= 2 * usual ? ` ($${Math.round(biggest)} at once, twice his usual $${Math.round(usual)})` : ''}: no offer for ${left} more hour${left === 1 ? '' : 's'} unless he asks or is very actively horny (A7)`,
  };
}
/** PPVs sent to him in the last 24 hours (a practice message has no time: today). */
const attemptsToday = (chat = [], now = Date.now()) => chat.filter(m => !m.from_fan && !m.mass && m.media?.price && (!m.at || now - Date.parse(m.at) <= DAY)).length;
/** When a PPV was last sent to him (ISO), or null. */
function lastAttemptAt(chat = []) {
  for (let i = chat.length - 1; i >= 0; i -= 1) if (!chat[i].from_fan && !chat[i].mass && chat[i].media?.price) return chat[i].at || new Date().toISOString();
  return null;
}

// ── A new subscriber's first sale (A1) ────────────────────────────────────────
const STAGES = [
  ['vibe', 0, 'Stay with his vibe: welcome him, react to what he says, get to know him. Nothing sold, no flirting push'],
  ['flirt', 6, 'Start flirting: playful, a compliment, light teasing. Nothing sold yet'],
  ['sexy', 9, 'Keep a sexy, suggestive vibe without asking for anything: tease, hint, enjoy it. No PPV yet'],
  ['ask', 12, 'Turn direct: ask what he would like to see of you, or whether he is alone and wants to see something. One playful question'],
];
const STAGE_TEXT = Object.fromEntries(STAGES.map(([k, , t]) => [k, t]));
/**
 * Where a new subscriber is on the path to his first sale. `herHere` = her messages in
 * this conversation (the path starts over each conversation), `direct` = he said exactly
 * what he wants (he skips the stages), `hisLevel` and `since` = how sexual he is and her
 * replies since he got sexual (a sexual fan is in the sexy stage already), `asked` /
 * `offered` = the direct ask or the offer was made in this conversation.
 */
function firstSaleStage({ herHere = 0, direct = false, hisLevel = 0, since = 0, asked = false, offered = false }) {
  if (offered) return { stage: 'done', text: 'The first offer is out: nothing more this conversation unless he buys it', why: 'the probe offer was made (A1)' };
  if (direct) return { stage: 'offer', text: 'He said exactly what he wants: say yes and offer it now, at the probe price', why: 'a direct fan skips the stages (A1)' };
  if (asked) return { stage: 'offer', text: 'He answered what he wants: the probe offer now, matched to his answer', why: 'the direct ask is done (A1)' };
  if (hisLevel >= 2) {
    if (since >= 3) return { stage: 'ask', text: STAGE_TEXT.ask, why: `he got sexual himself and they've had ${since} of her replies in that vibe: time to ask (A1)` };
    return { stage: 'sexy', text: STAGE_TEXT.sexy, why: `he got sexual himself: the sexy vibe, the direct ask after about 3 of her replies (${since} so far) (A1)` };
  }
  let stage = 'vibe';
  for (const [k, from] of STAGES) if (herHere >= from) stage = k;
  const next = STAGES[STAGES.findIndex(([k]) => k === stage) + 1];
  return { stage, text: STAGE_TEXT[stage], why: `her message ${herHere + 1} of this conversation${next ? `; ${next[0] === 'ask' ? 'the direct ask' : `the ${next[0]} stage`} from her message ${next[1] + 1}` : ''} (A1)` };
}

// ── The probe offer (A1) ──────────────────────────────────────────────────────
const bandOf = (it) => (it.nudity === 'explicit' ? 'explicit' : ['nude', 'topless'].includes(it.nudity) ? 'nude' : 'tease');
const PROBE_PRICE = { tease: 30, nude: 40, explicit: 50 };
/**
 * The first sale's items: what he asked for (`match` = content.matchRequest), else a
 * tease set; single pieces only (no series step, no bundle), priced by explicitness.
 * `avoid` = item ids already offered (after a failed probe the next one is a different item).
 */
function probeFor(content = [], { match = null, avoid = [] } = {}) {
  const single = content.filter(it => it.active !== false && !it.series && it.kind !== 'bundle' && !avoid.includes(it.id));
  const ids = new Set(single.map(it => it.id));
  let items = match?.full?.length ? match.full.filter(it => ids.has(it.id)) : [];
  let why;
  if (items.length) why = `he asked for ${match.wants.join(' + ')}: the matching piece, at the probe price for how explicit it is (A1)`;
  else {
    const tease = [...single.filter(it => bandOf(it) === 'tease' && ['lingerie', 'implied'].includes(it.nudity)), ...single.filter(it => bandOf(it) === 'tease' && it.nudity === 'dressed')];
    items = tease.length ? tease : [...single].sort((a, b) => Number(a.price) - Number(b.price));
    why = match?.full ? 'nothing matches exactly: the closest tease set, named honestly (A1)' : 'he was vague: a tease set, what sold best to new subscribers (35k: $30–39 with a teasing caption) (A1)';
  }
  items = items.slice(0, 3).map(it => ({ ...it, probe_price: PROBE_PRICE[bandOf(it)] }));
  return { items, why, caption: 'a teasing caption, like "just took these for you…"; never explicit words in a first PPV (they sold half as well)' };
}

// ── His taste (A3) ────────────────────────────────────────────────────────────
const SUPER = /\b(?:wow|damn|holy|omg|amazing|incredible|perfect|gorgeous|stunning|unreal|insane|so (?:hot|sexy|good|fucking hot)|love(?:d)? (?:it|this|that|them|every)|best (?:thing|ever)|fire)\b|🔥|😍|🥵|🤤|💦|😈/iu;
const FINE = /\b(?:nice|cute|thanks|thank you|thx|cool|good|not bad|ok|okay|sweet|beautiful|lovely|hot)\b|😊|👍|❤️|😘|🥰/iu;
const DISLIKE = /\b(?:meh|not (?:really )?(?:my|what i) (?:thing|type|taste|wanted|expected)|expected (?:more|better)|that'?s it|disappoint\w*|refund|rip ?off|waste|not worth|too short|blurry|boring|lame|wasn'?t (?:worth|great)|only \d+ (?:pics?|photos?|seconds?))\b/i;
// what he says he isn't into, or is only into (only what he says counts: A3)
const NOT_INTO = /\b(?:(?:i'?m|im|i am) not (?:really |that |so |a big |much )?(?:into|a fan of|interested in|about|big on)|(?:i )?don'?t (?:really |even )?(?:like|want|need|care (?:for|about)|do)|(?:i )?hate|(?:i'?m|im) over)\s+(?:the |your |any |more |those |that |seeing |all the )?([a-z][a-z' -]{2,30}?)(?=[.,!?;]|$|\s(?:stuff|pics|photos|videos|content|tbh|though|really|at all|lol|haha|honestly|much|anymore|sorry))/gi;
const ONLY_INTO = /\b(?:only|just|mostly|mainly|really|strictly) (?:into|like|want|here for|interested in|care about|a fan of)\s+(?:the |your |some |seeing )?([a-z][a-z' -]{2,30}?)(?=[.,!?;]|$|\s(?:stuff|pics|photos|videos|content|tbh|though|really|lol|haha|honestly))/gi;
const labelsIn = (text, re) => {
  const out = [];
  for (const x of String(text).matchAll(re)) out.push(...C.CONCEPTS.filter(([, cre]) => cre.test(x[1])).map(([l]) => l));
  return [...new Set(out)];
};
const kindWord = (k) => (k === 'video' ? 'videos' : k === 'bundle' ? 'bundles' : 'photo sets');

/**
 * What he bought and how he took it, read from the chat (oldest first): every PPV she
 * sent (`content` names the practice ones), whether he bought it, how fast, and how he
 * reacted in his next messages (super happy, fine, no reaction, didn't like it); plus
 * what he says he's not into or only into. `seed` = a made-up fan's past (fanTypes).
 * Returns { sent, bought, loved, liked: { kinds, concepts, bands }, dislikes, only, last, text }.
 */
function tasteOf({ chat = [], content = [], seed = [] }) {
  const byId = Object.fromEntries(content.map(it => [it.id, it]));
  const sent = seed.map((s, i) => ({
    i: -seed.length + i, at: s.at || null, title: s.title || null, id: null, kind: s.kind || 'photos', nudity: s.nudity || null, band: bandOf(s), tags: s.tags || [],
    price: Number(s.price) || 0, bought: s.bought !== false, fast: s.fast === true, reaction: s.bought === false ? null : s.reaction || 'none', concepts: C.conceptsOf(s),
  }));
  chat.forEach((m, i) => {
    if (m.from_fan || m.mass || !m.media?.price) return;
    const it = m.media.item ? byId[Number(String(m.media.item).replace(/^c/i, ''))] : null;
    const bought = !!(m.media.bought_at || m.media.status === 'bought' || m.paid);
    let reaction = null;
    if (bought) {
      const his = [];
      for (let k = i + 1; k < chat.length && his.length < 3; k += 1) { if (chat[k].mass) continue; if (!chat[k].from_fan) break; if (clean(chat[k].text)) his.push(clean(chat[k].text)); }
      const t = his.join(' ');
      reaction = !t ? 'none' : DISLIKE.test(t) ? 'disliked' : SUPER.test(t) ? 'super_happy' : FINE.test(t) ? 'fine' : 'none';
    }
    const fast = bought && (m.media.speed === 'fast' || !!(m.media.bought_at && m.at && Date.parse(m.media.bought_at) - Date.parse(m.at) <= 10 * 60_000));
    sent.push({
      i, at: m.at || null, title: it?.title || m.media.title || null, id: it?.id || null, kind: it?.kind || (m.media.videos ? 'video' : 'photos'), nudity: it?.nudity || null,
      band: it ? bandOf(it) : null, tags: it ? [...(it.tags || []), it.focus].filter(Boolean) : [], price: Number(m.media.price), bought, fast, reaction, concepts: it ? C.conceptsOf(it) : [],
    });
  });
  const bought = sent.filter(s => s.bought);
  const loved = bought.filter(s => s.reaction === 'super_happy' || (s.fast && s.reaction !== 'disliked'));
  const his = chat.filter(m => m.from_fan && !m.mass).map(m => clean(m.text)).join('\n');
  const dislikes = labelsIn(his, NOT_INTO);
  const only = labelsIn(his, ONLY_INTO).filter(l => !dislikes.includes(l));
  const last = sent[sent.length - 1] || null;
  const liked = { kinds: [...new Set(loved.map(s => s.kind))], concepts: [...new Set(loved.flatMap(s => s.concepts))], bands: [...new Set(loved.map(s => s.band).filter(Boolean))] };
  const reactWord = { super_happy: 'super happy', fine: 'fine with it', none: 'no reaction', disliked: 'didn\'t like it' };
  const bits = [];
  if (sent.length) bits.push(`${bought.length} of ${sent.length} PPV${sent.length === 1 ? '' : 's'} bought`);
  if (loved.length) bits.push(`loved: ${[...liked.concepts, ...liked.kinds.map(kindWord)].slice(0, 4).join(', ')}`);
  if (last) bits.push(`last: ${last.title || kindWord(last.kind)}${last.band ? ` (${last.band})` : ''} at $${last.price}, ${last.bought ? `bought${last.fast ? ' fast' : ''}, ${reactWord[last.reaction] || 'no reaction'}` : 'not bought'}`);
  if (only.length) bits.push(`only into ${only.join(', ')}`);
  if (dislikes.length) bits.push(`not into ${dislikes.join(', ')}`);
  return { sent, bought: bought.length, loved, liked, dislikes, only, last, text: bits.join('; ') || 'nothing bought yet, nothing said about his taste' };
}

const BANDS = ['tease', 'nude', 'explicit'];
// new territory: an item with one of these he never bought is "something new", never "the same kind"
const BIG = new Set(['a man in it', 'anal', 'oral']);
/**
 * What to offer a fan who has a history (A3): his dislikes never, his "only" always;
 * mostly the kind he loved (3 of 4), sometimes something new (1 of 4); something
 * different after no reaction to the last one; at most one step up in explicitness
 * from his last buy (`stepUp` prefers that step: A4); `cheaperThan` = one cheaper
 * piece instead (A5). `offered` = PPVs already sent ({ id }). Returns { items, why, mix } or null.
 */
const BAND_LEVEL = { tease: 2, nude: 3, explicit: 3 };
function pickFor({ content = [], taste = null, offered = [], level = { max: 0 }, stepUp = false, cheaperThan = null, maxBand = null, rand = Math.random }) {
  const done = new Set(offered.map(o => o.id));
  // how spicy a pick may be: one step above the chat, or what he has bought before (a buyer who loved nude sets gets nude sets)
  const boughtBand = (taste?.sent || []).filter(s => s.bought && s.band).map(s => BAND_LEVEL[s.band]);
  const cap = Math.max((level?.max ?? 0) + 1, boughtBand.length ? Math.max(...boughtBand) : 0, maxBand ? BAND_LEVEL[maxBand] : 0);
  let pool = content.filter(it => it.active !== false && !it.series && !done.has(it.id) && C.levelOf(it) <= cap);
  if (maxBand) pool = pool.filter(it => BANDS.indexOf(bandOf(it)) <= BANDS.indexOf(maxBand));
  if (taste?.dislikes?.length) pool = pool.filter(it => !C.conceptsOf(it).some(c => taste.dislikes.includes(c)));
  if (taste?.only?.length) { const o = pool.filter(it => C.conceptsOf(it).some(c => taste.only.includes(c))); if (o.length) pool = o; }
  const lastBand = taste?.last?.bought ? taste.last.band : null;
  if (lastBand) pool = pool.filter(it => BANDS.indexOf(bandOf(it)) <= BANDS.indexOf(lastBand) + 1);   // at most one step up
  if (!pool.length) return null;
  const byPrice = (a, b) => Number(a.price) - Number(b.price);
  if (cheaperThan) {
    const cheap = pool.filter(it => Number(it.price) <= 0.7 * cheaperThan).sort(byPrice);
    return cheap.length ? { items: cheap.slice(0, 3), why: `one cheaper piece instead, under $${Math.round(0.7 * cheaperThan)} (A5)`, mix: 'cheaper' } : null;
  }
  const up = lastBand ? BANDS[Math.min(2, BANDS.indexOf(lastBand) + 1)] : null;
  if (!taste?.bought) return { items: [...pool].sort(byPrice).slice(0, 3), why: 'nothing bought yet: try things and gather his feedback (A3)', mix: 'any' };
  const boughtConcepts = new Set(taste.sent.filter(s => s.bought).flatMap(s => s.concepts));
  const newGround = (it) => C.conceptsOf(it).some(c => BIG.has(c) && !boughtConcepts.has(c));
  // the closest to what he loved first: his loved concepts, the kind and the explicitness he loved, the next step up when asked; then price
  const score = (it) => {
    const cs = C.conceptsOf(it);
    return 2 * cs.filter(c => taste.liked.concepts.includes(c)).length + (taste.liked.kinds.includes(it.kind) ? 1 : 0) + (taste.liked.bands.includes(bandOf(it)) ? 1 : 0) + (stepUp && up && bandOf(it) === up ? 2 : 0);
  };
  const prefer = (list) => [...list].sort((a, b) => (score(b) - 3 * newGround(b)) - (score(a) - 3 * newGround(a)) || byPrice(a, b));   // new ground last
  const same = pool.filter(it => !newGround(it) && (taste.liked.kinds.includes(it.kind) || C.conceptsOf(it).some(c => taste.liked.concepts.includes(c))));
  // "something new" never means new ground (a man, anal, oral): that only comes through a direct request of his
  const fresh = pool.filter(it => !C.conceptsOf(it).some(c => boughtConcepts.has(c)) && !newGround(it));
  if (taste.last?.bought && taste.last.reaction === 'none' && fresh.length) return { items: prefer(fresh).slice(0, 3), why: 'no reaction to the last one: something different this time (A3)', mix: 'different' };
  if (same.length && (!fresh.length || rand() < 0.75)) return { items: prefer(same).slice(0, 3), why: `mostly what he loved (${[...taste.liked.concepts, ...taste.liked.kinds.map(kindWord)].slice(0, 3).join(', ')}): 3 offers in 4 the same kind (A3)`, mix: 'same' };
  if (fresh.length) return { items: prefer(fresh).slice(0, 3), why: 'one offer in four something new, to learn what else he likes (A3)', mix: 'new' };
  return { items: prefer(pool).slice(0, 3), why: 'what fits him (A3)', mix: 'any' };
}

// ── A time waster's approach (D2) ─────────────────────────────────────────────
const TW_APPROACH = {
  short: 'short and sweet: friendly, brief, nothing for free, no chasing',
  cheap: 'one cheap offer: friendly and brief, and one cheap piece offered plainly once his free talk is used',
  honest: 'honest: friendly and brief, and once, lightly, that you spend your time on the ones who support you',
};
/** Three approaches in turn, one per conversation; the one that worked (a cheap offer) stays once he has ever bought. */
function twApproach({ strikes = 0, conversations = 0, buyer = false } = {}) {
  const kind = buyer ? 'cheap' : ['short', 'cheap', 'honest'][(Math.max(0, strikes) + Math.max(0, conversations)) % 3];
  return { kind, text: TW_APPROACH[kind], said: false, why: buyer ? 'a cheap offer worked with him once, so it stays' : 'the approaches take turns, one per conversation' };
}

// ── Objections and tips (A5, D1) ──────────────────────────────────────────────
const PRICE_OBJECTION = /\b(?:too (?:expensive|much|pricey|steep|high|rich)|pricey|expensive|that'?s a lot|cheaper|lower (?:the )?price|discount|can'?t (?:pay|do|spend) that much|(?:a )?bit much|out of my (?:budget|range)|not (?:paying|worth) that)\b/i;
const priceObjection = (text) => PRICE_OBJECTION.test(String(text || ''));
/** A tip with no request: free sexting if he's in the mood, and the first story steps go free, as many as the tip covers at his usual ticket, at most two (D1). */
function tipCredit(tip, { usual = null } = {}) {
  const ticket = Number(usual) >= 10 ? Number(usual) : PROBE_PRICE.tease;
  return { amount: Math.round(Number(tip) || 0), steps: Math.min(2, Math.floor((Number(tip) || 0) / ticket)), ticket: Math.round(ticket) };
}

module.exports = { cadenceOf, buysOf, pauseOf, attemptsToday, lastAttemptAt, firstSaleStage, probeFor, bandOf, PROBE_PRICE, tasteOf, pickFor, priceObjection, tipCredit, twApproach, TW_APPROACH, EVERY, STAGE_TEXT };
