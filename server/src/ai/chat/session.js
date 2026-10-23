/**
 * The fan state and the plan for one conversation (your answers B1–B8 and A9 in
 * AI_CHAT_UPGRADE_QUESTIONS.md). Pure: no database, no network.
 *  - fanStateOf: what his history says, computed fresh each time: his conversations
 *    (split at pauses of 6 hours or more), his phase, the hours he is usually
 *    around, time-waster strikes (Q19b), how the last conversation ended.
 *  - startSession: the plan for this conversation (B2): bought recently, build
 *    rapport; no buy for a long time, plan to sell; in between, read his vibe. Plus
 *    the warm-up floor by closeness (B3).
 *  - nextTurn: what changes with each reply: a sad or annoyed mood sticks until he
 *    sounds lighter twice (B4); no selling for the rest of the conversation once he
 *    was sad, annoyed or suspicious (B3); the aim moves when he says he's broke or
 *    asks to buy. The practice room keeps the session and sends it back each time.
 */
const { replyLevel } = require('./safety');
const { PAUSE, awayText } = require('./memory');
const Sl = require('./selling');
const G = require('./gauges');

const DAY = 86400_000;
const clean = (s) => String(s ?? '').trim();
// her messages in a conversation before a PPV is even allowed, by closeness (B3): a floor, not a trigger
const WARM_UP = { new: 6, friendly: 4, flirty: 3, intimate: 3, girlfriend: 2 };
const HEAVY = new Set(['sad', 'annoyed']);                 // sticks (B4)
const NO_SELL = new Set(['sad', 'annoyed', 'suspicious']); // no selling for the rest of the conversation (B3)
const LIGHT = new Set(['chatty', 'joking', 'curious', 'flirty', 'horny', 'romantic', 'caring']);
// a heavy read sticks only when his own words back it (fix 3): the planner misreads jokes and politics
const CONFIRMS = {
  sad: /\b(?:sad|depress\w*|lonely|so alone|feel(?:ing)? alone|all alone|alone again|cry\w*|tears|died|passed away|funeral|lost my|miss (?:him|her|them|my)|broke up|breakup|divorc\w*|dumped|heartbroken|hurt\w*|stress\w*|anxious|anxiety|panic|tired of|exhausted|burn\w* out|hate my (?:life|job)|rough (?:day|week|night|time)|bad day|not (?:doing )?(?:well|great|good|ok|okay)|sick|hospital|surgery|fired|laid off|lost my job|can'?t sleep|insomnia|worthless|nobody|no one cares|fuck my life|fml)\b/i,
  annoyed: /\b(?:wtf|annoy\w*|boring|bored|bullshit|bs|shut up|fuck off|fuck you|screw you|dumb|stupid|dummy|idiot|moron|leave me|stop (?:it|that|texting|messaging)|not funny|seriously|whatever|ugh|pathetic|lame|scam\w*|waste of|bot|fake|liar|lying|pointless|forget it)\b/i,
};
// he can't pay (a price objection, "too expensive", is handled by the plan instead: one cheaper piece, A5)
const BROKE = /\b(?:no\s+money|broke|can'?t\s+afford|not\s+(?:buying|paying)|payday|next\s+week\s+maybe|skint)\b/i;
const FREE = /\b(?:for\s+free|free\s+(?:pics?|nudes?|content|stuff|vid\w*|preview|one|something)|something\s+free|anything\s+free)\b/i;
const WANTS_TO_BUY = /\b(?:what\s+(?:else\s+)?(?:do\s+you|have\s+you|you|u)\s+(?:got|have|sell)|what\s+else(?:\s+(?:you|u))?\s+(?:got|have)|(?:anything|something)\s+(?:else|more|new)\s+(?:for\s+me|to\s+(?:see|show|buy))|(?:send|show)\s+me\s+(?:something|more|what)|i'?ll\s+(?:buy|take|get)\s+it|how\s+much|price|unlock|wanna\s+see\s+(?:it|them|you|more|something)|(?:can|could)\s+i\s+see|let\s+me\s+see|i\s+want\s+to\s+see|got\s+(?:anything|something)(?:\s+\w+)?\s+(?:for\s+me|new|hot|naughty|good|nice|spicy|fun))\b/i;
// Her mood of the day (A7): picked from the date, so every fan gets the same Yuna that day.
const MOODS_OF_DAY = [
  'a bit sleepy and cosy', 'hyper and giggly', 'a lazy, slow mood', 'upbeat, a busy day', 'soft and cuddly', 'playful and a bit cheeky',
  'quiet and thoughtful', 'in a great mood, music on', 'tired after a long day, but happy to chat', 'restless, can\'t sit still',
  'chilled, nothing planned', 'a little moody, could use some cheering up',
];
// Her small moments (A4): what she does, and when in a conversation it fits ("start": her first
// reply; "talk": small talk after a couple of replies; "any": whenever small talk goes on).
const EVENTS = {
  life_update: { slot: 'start', text: 'share one small, specific thing from your day or what you\'re doing right now, in a line, before you answer him' },
  bad_day: { slot: 'start', text: 'mention lightly that you\'ve had a rough day (one real-sounding reason), and let him cheer you up a little; don\'t dwell on it' },
  advice: { slot: 'talk', text: 'ask his advice on something small of yours: two outfits to pick from, what to cook tonight, what to do this weekend' },
  game: { slot: 'talk', text: 'start a little game: two truths and a lie about you, or a "would you rather"' },
  game_flirty: { slot: 'talk', text: 'start a little game: "guess what I\'m wearing", playfully' },
  double_text: { slot: 'any', text: 'after your reply, send a second short message as an afterthought, the way people do ("oh and…", "wait, also…")' },
  first_to_know: { slot: 'talk', text: 'tell him he\'s the first to know about your new set (name it, say what\'s in it in a line); no price unless he asks (A6)' },
};
const AIMS = {
  first_sale: 'Walk him to his first sale: stay with his vibe, then flirt, then a sexy vibe, then ask what he wants and offer one piece at $30–50',
  get_to_know: 'Get to know him: welcome him, let him talk, nothing sold before he\'s clearly in the mood',
  rapport: 'Build rapport, don\'t push: he bought recently. Nothing is offered unless he asks or starts the sexting himself',
  sell: 'Plan to sell him something today, without pushing: steer toward it earlier, his set when he\'s in the mood',
  read: 'Read his vibe while talking: judge whether he\'s willing to buy, offer only when it fits',
  win_back: 'Win him back: warm, personal, catch up first; selling only if he asks',
  short: 'A time waster at the bottom: friendly, short, nothing for free, no chasing',
};

// ── His history ───────────────────────────────────────────────────────────────
/**
 * His conversations in `chat` (oldest first): split at pauses of 6 hours or more.
 * Messages typed in Practice have no time: they belong to the conversation going on.
 */
function conversationsOf(chat = [], now = Date.now()) {
  const out = [];
  let cur = null, prev = null;
  for (const m of chat) {
    if (m.mass) continue;
    const t = m.at ? Date.parse(m.at) : (prev ?? now);
    if (!cur || (prev != null && t - prev >= PAUSE)) {
      cur = { start: m.at || null, end: m.at || null, his: 0, hers: 0, ppv: 0, bought: 0, sexual: false, last_his: '' };
      out.push(cur);
    }
    if (m.from_fan) { cur.his += 1; cur.last_his = clean(m.text).slice(0, 120); if (replyLevel(m.text) >= 2) cur.sexual = true; }
    else {
      cur.hers += 1;
      if (m.media?.price) { cur.ppv += 1; if (m.paid || m.media.bought_at || m.media.status === 'bought') cur.bought += 1; }
    }
    if (m.at) cur.end = m.at;
    prev = t;
  }
  return out;
}

const pad = (h) => `${String(h).padStart(2, '0')}:00`;
/** The hours he is usually around (his messages of the last 90 days, in her time zone). */
function hoursOf(chat = [], { timeZone = 'America/New_York', now = Date.now() } = {}) {
  const since = now - 90 * DAY;
  const counts = new Array(24).fill(0);
  let n = 0;
  for (const m of chat) {
    if (!m.from_fan || !m.at || Date.parse(m.at) < since) continue;
    counts[Number(new Date(m.at).toLocaleString('en-GB', { timeZone, hour: '2-digit', hour12: false })) % 24] += 1;
    n += 1;
  }
  if (n < 5) return { n, best: null, text: '' };
  const win = counts.map((_, h) => counts[h] + counts[(h + 1) % 24] + counts[(h + 2) % 24]);
  const best = win.indexOf(Math.max(...win));
  const share = Math.round((100 * win[best]) / n);
  return { n, best, text: `usually around ${pad(best)}–${pad((best + 3) % 24)} her time (${share}% of his messages)` };
}

/**
 * His state from his history. `chat` = his real chat (oldest first), `profile` =
 * plan.fanProfile, `away` = how long he was gone before this conversation (ms).
 * Returns { conversations, buyer, phase, phase_why, hours, strikes7, strikes30,
 * faded, last }.
 */
function fanStateOf({ chat = [], profile, away = null, timeZone = 'America/New_York', now = new Date() }) {
  const t = now.getTime();
  const convs = conversationsOf(chat, t);
  const done = convs.filter(c => c.end && t - Date.parse(c.end) >= PAUSE);   // the conversation going on isn't counted
  const buyer = done.some(c => c.bought > 0) || (profile?.tier && ['small', 'spender', 'whale'].includes(profile.tier));
  // Q19b: a failed conversation = a PPV sent and not bought (one approach tried)
  const failed = done.filter(c => c.ppv > 0 && c.bought === 0 && c.end);
  const strikes7 = failed.filter(c => t - Date.parse(c.end) <= 7 * DAY).length;
  const strikes30 = failed.filter(c => t - Date.parse(c.end) <= 30 * DAY).length;
  const faded = !!profile?.time_waster && (strikes7 >= 2 || strikes30 >= 5);
  const sexy = done.filter(c => c.sexual || c.bought > 0).length;
  let phase, why;
  if (faded) [phase, why] = ['winding down', `a time waster with ${strikes7} failed conversation${strikes7 === 1 ? '' : 's'} this week, ${strikes30} this month (Q19b)`];
  else if (profile?.new_sub) [phase, why] = ['new', 'a new subscriber'];
  else if (away != null && away >= 14 * DAY && done.length) [phase, why] = ['lapsed', `away ${awayText(away)}`];
  else if (sexy >= 2) [phase, why] = ['sexting partner', `${sexy} conversations got sexual or ended in a buy`];
  else if (done.length < 3) [phase, why] = ['getting to know', `${done.length} conversation${done.length === 1 ? '' : 's'} so far`];
  else [phase, why] = ['regular', `${done.length} conversations, ${sexy} sexual or with a buy`];
  const last = done[done.length - 1] || null;
  return {
    conversations: done.length, buyer, phase, phase_why: why, hours: hoursOf(chat, { timeZone, now: t }),
    strikes7, strikes30, faded, last_ppv_at: Sl.lastAttemptAt(chat.filter(m => m.at)),
    last: last ? {
      ended: last.end, his: last.his, hers: last.hers, ppv: last.ppv, bought: last.bought, sexual: last.sexual,
      text: `${last.his} from him, ${last.hers} from her${last.ppv ? `, ${last.ppv} PPV${last.ppv === 1 ? '' : 's'} sent, ${last.bought ? `${last.bought} bought` : 'none bought'}` : ', no PPV'}${last.sexual ? ', it got sexual' : ''}`,
    } : null,
  };
}

/** A made-up fan's state, from his practice type (fanTypes.js: conversations, lastDays, strikes…). */
function madeUpState(type, profile) {
  const h = type?.history || {};
  const n = h.conversations ?? 0;
  const faded = !!profile?.time_waster && (h.strikes7 || 0) >= 2;
  return {
    conversations: n, buyer: !!h.bought, phase: faded ? 'winding down' : profile?.new_sub ? 'new' : (h.awayDays || 0) >= 14 ? 'lapsed' : h.sexual ? 'sexting partner' : n < 3 ? 'getting to know' : 'regular',
    phase_why: `his practice type (${type?.label || 'not set'})`, hours: { n: 0, best: null, text: '' },
    strikes7: h.strikes7 || 0, strikes30: h.strikes30 || h.strikes7 || 0, faded,
    last_ppv_at: h.lastPpvDays != null ? new Date(Date.now() - h.lastPpvDays * DAY).toISOString() : null,
    last: n ? { text: h.last || 'a normal chat', sexual: !!h.sexual, bought: h.bought ? 1 : 0 } : null,
  };
}

// ── Her day ───────────────────────────────────────────────────────────────────
/** Her mood today, the same for every fan (A7). */
function herMood(now = new Date(), timeZone = 'America/New_York') {
  const day = new Date(now).toLocaleDateString('en-CA', { timeZone });
  let h = 0;
  for (const ch of day) h = (h * 31 + ch.charCodeAt(0)) % 100003;
  return MOODS_OF_DAY[h % MOODS_OF_DAY.length];
}

/**
 * A small moment of hers for this conversation, or null (A2–A5): about every other
 * conversation with an intimate or girlfriend fan, every third with a friendly or
 * flirty one, none with a new one or a time waster; never during selling or
 * sexting (that's decided when it's used, see eventNow). `newItem` = a set added
 * lately, for a whale's "first to know".
 */
function pickEvent({ profile, aim = 'read', mood = '', newItem = null, rand = Math.random }) {
  if (aim === 'short' || profile.time_waster || profile.new_sub) return null;
  const chance = ['intimate', 'girlfriend'].includes(profile.closeness) ? 0.5 : ['friendly', 'flirty'].includes(profile.closeness) ? 1 / 3 : 0;
  if (!chance || rand() >= chance) return null;
  if (profile.tier === 'whale' && newItem) return { kind: 'first_to_know', item: newItem, ...EVENTS.first_to_know, text: EVENTS.first_to_know.text.replace('your new set', `your new set "${newItem}"`), done: false };
  const pool = ['life_update', 'advice', 'double_text', ['flirty', 'intimate', 'girlfriend'].includes(profile.closeness) ? 'game_flirty' : 'game'];
  if (/moody/.test(mood)) pool.push('bad_day');
  const kind = pool[Math.floor(rand() * pool.length) % pool.length];
  return { kind, ...EVENTS[kind], done: false };
}

/** Does the moment planned fit this reply? `herReplies` = her replies in this conversation so far. */
function eventFits(event, { goal, herReplies = 0, sexting = false }) {
  if (!event || event.done || sexting) return false;
  const calm = ['chat', 'get_to_know', 'welcome_back', 'follow_up'].includes(goal);
  if (!calm) return false;
  if (event.slot === 'start') return herReplies === 0;
  if (event.slot === 'talk') return herReplies >= 2 && goal !== 'follow_up';
  return true;
}

/** What she opened and closed past conversations with (A9): not to be repeated. */
function rotationOf(chat = [], now = Date.now()) {
  const out = { openers: [], goodbyes: [] };
  let cur = null, prev = null;
  const flush = () => { if (cur) { if (cur.first) out.openers.push(cur.first); if (cur.last) out.goodbyes.push(cur.last); } };
  for (const m of chat) {
    if (m.mass) continue;
    const t = m.at ? Date.parse(m.at) : (prev ?? now);
    if (!cur || (prev != null && t - prev >= PAUSE)) { flush(); cur = { first: '', last: '' }; }
    if (!m.from_fan && clean(m.text)) { if (!cur.first) cur.first = clean(m.text).slice(0, 80); cur.last = clean(m.text).slice(0, 80); }
    prev = t;
  }
  flush();
  return { openers: out.openers.slice(-10), goodbyes: out.goodbyes.slice(-10) };
}

// ── The plan for this conversation ────────────────────────────────────────────
const daysText = (d) => (d === 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`);
/**
 * The plan when a conversation starts (B2, and E5 / A1 / A7 in the adjustment round).
 * `profile` = plan.fanProfile, `state` = fanStateOf, `away` = how long he was gone (ms),
 * `cadence` = selling.cadenceOf (how often she plans an attempt with him), `pause` =
 * selling.pauseOf (a big spend lately), `taste` = selling.tasteOf. Returns the session
 * the practice room keeps: { aim, aim_text, why, warm_up, closeness, mood, lighter,
 * no_sell, changes, cadence, pause, first_sale, … }.
 */
function startSession({ profile, state, away = null, now = new Date(), timeZone = 'America/New_York', newItem = null, cadence = null, pause = null, taste = null, rand = Math.random }) {
  const d = profile.days_since_buy;
  // a time waster who isn't faded yet (D2): three approaches in turn, the one that worked when one did
  const tw = profile.time_waster && !state.faded ? Sl.twApproach({ strikes: state.strikes30, conversations: state.conversations, buyer: state.buyer }) : null;
  let aim, why;
  if (state.faded) [aim, why] = ['short', `a time waster with ${state.strikes7} failed conversation${state.strikes7 === 1 ? '' : 's'} this week: lowest priority (Q19b)`];
  else if (profile.new_sub && !state.buyer && (state.strikes7 || 0) >= 2) [aim, why] = ['short', `a new subscriber who didn't take the first offer in ${state.strikes7} conversations this week: time-waster rules (A1)`];
  else if (profile.new_sub) [aim, why] = ['first_sale', `a new subscriber with no purchase yet: the staged path to his first sale (A1)`];
  else if (pause) [aim, why] = ['rapport', pause.why];
  else if (tw) [aim, why] = [tw.kind === 'cheap' ? 'sell' : 'read', `a time waster, the approach this time: ${tw.text} (D2)`];
  else if (away != null && away >= 14 * DAY && state.buyer) [aim, why] = ['win_back', `he used to buy and was away ${awayText(away)}`];
  else if (d != null && d <= 7) [aim, why] = ['rapport', `he bought ${daysText(d)}: no pushing, build rapport (B2)`];
  else if (cadence?.due) [aim, why] = ['sell', `a planned attempt: ${cadence.why}`];
  else if (cadence) [aim, why] = ['read', `no planned attempt today: ${cadence.why}`];
  else [aim, why] = ['read', d != null ? `his last buy was ${daysText(d)}: read his vibe, no pushing (B2)` : 'nothing bought yet: read his vibe while talking (B2)'];
  const mood_day = herMood(now, timeZone);
  return {
    aim, aim_text: AIMS[aim], why, warm_up: WARM_UP[profile.closeness] ?? WARM_UP.new, closeness: profile.closeness,
    started_at: now.toISOString(), mood: null, lighter: 0, no_sell: '', changes: [],
    mood_day, event: pickEvent({ profile, aim, mood: mood_day, newItem, rand }), diary_add: [],
    pending: null, service: null, roleplay: null, custom_asked: 0,
    // selling (A1–A7, E5): the cadence, a pause after a big spend, the first-sale path, what was done once
    cadence: cadence ? { every: cadence.every, text: cadence.text, due: cadence.due, next_in: cadence.next_in, why: cadence.why } : null,
    pause: pause ? { total: pause.total, until: pause.until, why: pause.why } : null,
    first_sale: { asked: false, held: 0 }, asked_ready: false, why_asked: false, reminded: false, cheaper_done: false, credit: null, dry_asked: false, dry_bye: false, pointed: false, hot: false, hot_at: null, asked_about: [], gauges: null, open: [],
    taste_text: taste?.text || '', tw,
  };
}

/** A session the practice room sent back, checked. */
function resumeSession(s) {
  if (!s || typeof s !== 'object' || !AIMS[s.aim]) return null;
  return {
    aim: s.aim, aim_text: AIMS[s.aim], why: clean(s.why).slice(0, 200), warm_up: Number.isInteger(s.warm_up) ? s.warm_up : WARM_UP.new,
    closeness: clean(s.closeness) || 'new', started_at: clean(s.started_at) || new Date().toISOString(),
    mood: HEAVY.has(s.mood) ? s.mood : null, lighter: Number.isInteger(s.lighter) ? s.lighter : 0, no_sell: clean(s.no_sell).slice(0, 200),
    changes: Array.isArray(s.changes) ? s.changes.slice(-10).map(c => ({ aim: clean(c.aim), why: clean(c.why).slice(0, 200) })) : [],
    mood_day: clean(s.mood_day).slice(0, 80),
    event: s.event && EVENTS[s.event.kind] ? { kind: s.event.kind, ...EVENTS[s.event.kind], text: clean(s.event.text).slice(0, 300) || EVENTS[s.event.kind].text, item: clean(s.event.item).slice(0, 120) || undefined, done: s.event.done === true } : null,
    diary_add: Array.isArray(s.diary_add) ? s.diary_add.map(t => clean(t).slice(0, 160)).filter(Boolean).slice(-20) : [],
    // paid requests (services.js, D1–D4): an unusual ask waiting for a manager, a service offered or paid, a roleplay going on
    pending: s.pending && typeof s.pending === 'object' && ['hesitant', 'waiting', 'approved', 'refused'].includes(s.pending.state)
      ? { text: clean(s.pending.text).slice(0, 300), what: clean(s.pending.what).slice(0, 80), exchanges: Number.isInteger(s.pending.exchanges) ? s.pending.exchanges : 0, state: s.pending.state, terms: clean(s.pending.terms).slice(0, 300), id: Number.isInteger(s.pending.id) ? s.pending.id : null, parked: s.pending.parked === true, again: s.pending.again === true }
      : null,
    service: s.service && typeof s.service === 'object' && clean(s.service.kind) && ['offered', 'paid', 'delivered'].includes(s.service.state)
      ? { kind: clean(s.service.kind), label: clean(s.service.label).slice(0, 60), price: Math.max(0, Math.round(Number(s.service.price) || 0)), state: s.service.state, tip: Math.max(0, Math.round(Number(s.service.tip) || 0)) }
      : null,
    roleplay: s.roleplay && typeof s.roleplay === 'object' && s.roleplay.on === true
      ? { on: true, tip: Math.max(0, Math.round(Number(s.roleplay.tip) || 0)), total: Math.max(1, Math.round(Number(s.roleplay.total) || 250)), exchanges: Number.isInteger(s.roleplay.exchanges) ? s.roleplay.exchanges : 0 }
      : null,
    custom_asked: Number.isInteger(s.custom_asked) ? s.custom_asked : 0,
    cadence: s.cadence && typeof s.cadence === 'object' && s.cadence.every in Sl.EVERY
      ? { every: s.cadence.every, text: clean(s.cadence.text).slice(0, 60), due: s.cadence.due === true, next_in: Math.max(0, Math.round(Number(s.cadence.next_in) || 0)), why: clean(s.cadence.why).slice(0, 200) } : null,
    pause: s.pause && typeof s.pause === 'object' && clean(s.pause.why) ? { total: Math.round(Number(s.pause.total) || 0), until: clean(s.pause.until).slice(0, 40), why: clean(s.pause.why).slice(0, 300) } : null,
    pause_lifted: s.pause_lifted === true,
    first_sale: {
      asked: s.first_sale?.asked === true, held: Math.max(0, Math.round(Number(s.first_sale?.held) || 0)),
      // round 4 (F1, F2): his no, his unclear answers, whether he flirted back, how long the ask waited, the ask dropped
      declined: s.first_sale?.declined === true, unclear: Math.max(0, Math.round(Number(s.first_sale?.unclear) || 0)), warm: s.first_sale?.warm === true,
      waited: Math.max(0, Math.round(Number(s.first_sale?.waited) || 0)), no_ask: s.first_sale?.no_ask === true,
    },
    asked_ready: s.asked_ready === true, why_asked: s.why_asked === true, reminded: s.reminded === true, cheaper_done: s.cheaper_done === true,
    dry_asked: s.dry_asked === true, dry_bye: s.dry_bye === true, pointed: s.pointed === true, hot: s.hot === true,
    asked_about: (Array.isArray(s.asked_about) ? s.asked_about : []).map(t => clean(t).slice(0, 160)).filter(Boolean).slice(-10),
    gauges: G.readGauges(s.gauges), hot_at: Number.isInteger(s.hot_at) ? s.hot_at : null,
    open: (Array.isArray(s.open) ? s.open : []).map(o => ({ what: clean(o?.what).slice(0, 120), sure: Math.max(0, Math.min(1, Number(o?.sure) || 0)), turn: Number.isInteger(o?.turn) ? o.turn : 0 })).filter(o => o.what).slice(-4),
    credit: s.credit && typeof s.credit === 'object' && Number(s.credit.amount) > 0 ? { amount: Math.round(Number(s.credit.amount)), steps: Math.max(0, Math.min(2, Math.round(Number(s.credit.steps) || 0))), total: Math.max(0, Math.min(2, Math.round(Number(s.credit.total ?? s.credit.steps) || 0))), ticket: Math.max(10, Math.round(Number(s.credit.ticket) || 30)) } : null,
    taste_text: clean(s.taste_text).slice(0, 300),
    tw: s.tw && Sl.TW_APPROACH[s.tw.kind] ? { kind: s.tw.kind, text: Sl.TW_APPROACH[s.tw.kind], said: s.tw.said === true, why: clean(s.tw.why).slice(0, 120) } : null,
    flag: ['pending', 'cleared', 'blocked'].includes(s.flag) ? s.flag : null,
  };
}

/**
 * What this reply changes in the session: the sticky mood (B4), no selling once he
 * was sad, annoyed or suspicious (B3), and the aim when he says he's broke or asks
 * to buy. `read` = the planner's mood for this reply, `said` = his latest message(s).
 * Returns { session, mood } with the mood to use.
 */
function nextTurn(session, { read: readIn = 'chatty', said = '', suspicious = false, timeWaster = false, veryHorny = false }) {
  const s = { ...session, changes: [...(session.changes || [])] };
  let read = readIn;
  if (HEAVY.has(read) && !CONFIRMS[read].test(said)) {
    s.changes.push({ aim: s.aim, why: `the planner read him as ${read}, but his words don't show it: not kept (fix 3)` });
    read = 'chatty';
  }
  let mood = read;
  // the pause after a big spend (A7) ends when he asks himself or is very actively horny
  if (s.pause && (WANTS_TO_BUY.test(said) || veryHorny)) {
    s.changes.push({ aim: s.aim, why: `${veryHorny ? 'he\'s very actively horny' : 'he asks himself'}: the pause after his big spend is lifted (A7)` });
    s.pause = null; s.pause_lifted = true;
  }
  if (HEAVY.has(read)) { s.mood = read; s.lighter = 0; }
  else if (s.mood) {
    s.lighter = LIGHT.has(read) ? s.lighter + 1 : 0;
    if (s.lighter >= 2) { s.mood = null; s.lighter = 0; } else mood = s.mood;
  }
  // "too expensive" is haggling, not a mood: one cheaper piece may follow (A5), so it doesn't switch selling off
  if (!s.no_sell && (NO_SELL.has(read) || suspicious) && !(read === 'annoyed' && !suspicious && Sl.priceObjection(said))) s.no_sell = `he was ${suspicious && !NO_SELL.has(read) ? 'suspicious' : read} earlier in this conversation: no selling for the rest of it (B3)`;
  const change = (aim, why) => { if (s.aim !== aim) { s.changes.push({ aim, why }); s.aim = aim; s.aim_text = AIMS[aim]; s.why = why; } };
  if (FREE.test(said)) { /* a free ask changes nothing: the plan handles it (no freebies) */ }
  else if (BROKE.test(said) && !timeWaster && s.aim !== 'short') {
    change('rapport', 'he says he can\'t spend now: no pushing');
    // nothing offered for the rest of the conversation, horny or not (deep dive); asking himself turns it back on
    if (!s.no_sell) s.no_sell = 'he said he can\'t spend now: nothing offered for the rest of this conversation unless he asks himself';
  }
  else if (WANTS_TO_BUY.test(said) && !['short', 'get_to_know', 'first_sale'].includes(s.aim)) {
    change('sell', 'he asks what she has or wants to buy');
    // he asks himself: answering him isn't pushing, so the no-selling rule (B3) doesn't hold him back
    if (s.no_sell) { s.changes.push({ aim: 'sell', why: 'he asked himself, so selling is back on' }); s.no_sell = ''; }
    // and a sad or annoyed mood that stuck is behind him (deep dive): comforting a man who asks what she has misses him
    if (s.mood && !HEAVY.has(read)) { s.changes.push({ aim: 'sell', why: `he asks what she has: the ${s.mood} mood is behind him` }); s.mood = null; s.lighter = 0; mood = read; }
  }
  return { session: s, mood };
}

module.exports = { conversationsOf, hoursOf, fanStateOf, madeUpState, startSession, resumeSession, nextTurn, herMood, pickEvent, eventFits, rotationOf, WARM_UP, AIMS, EVENTS, WANTS_TO_BUY, BROKE };
