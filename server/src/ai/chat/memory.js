/**
 * What she remembers about a fan, as replies use it (from your answers to Q7 and
 * Q9–Q16 in AI_CHAT_RULES_QUESTIONS.md). Pure: no database, no network.
 *  - Dates: every note carries when he said it, and a plan the day it happens, so
 *    the writer reads "told you last week" or "was yesterday". She never says an
 *    exact date (Q13).
 *  - Closeness (Q16): a mix of signals, each worth 0–2 points, so the decision map
 *    can show why: how long and how often they chat, what personal things he
 *    shared, how sexual they have been, what he spends, how warmly he reacts to
 *    her. It sets her tone (and lets close fans get a little flirting in small talk).
 *  - Callbacks (Q9–Q12): a note she brings up herself, at most once every few days:
 *    a plan of his that just happened first ("how did the interview go?"), then one
 *    coming up very soon, then a life thing he shared. Never a note to avoid.
 *  - The conversation: where this one started (after a pause of 6 hours or more),
 *    and how long he was away before it.
 */
const { replyLevel } = require('./safety');

const DAY = 86400_000;
const PAUSE = 6 * 3600_000;          // a pause this long starts a new conversation
const clean = (s) => String(s ?? '').trim();

// ── Dates ─────────────────────────────────────────────────────────────────────
// The day (YYYY-MM-DD) a moment falls on in her time zone.
const dayIn = (date, timeZone = 'America/New_York') => new Date(date).toLocaleDateString('en-CA', { timeZone });

/** How long ago, in words she could use: "today", "last week", "a few months ago". */
function ago(iso, now = new Date()) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const d = Math.floor((now.getTime() - t) / DAY);
  if (d <= 0) return 'today';
  if (d === 1) return 'yesterday';
  if (d < 7) return 'a few days ago';
  if (d < 14) return 'last week';
  if (d < 30) return 'a few weeks ago';
  if (d < 60) return 'last month';
  if (d < 180) return 'a few months ago';
  return 'a long time ago';
}

/** A plan's day next to today (in her time zone): { days, text }; days below 0 = it has happened. */
function planWhen(on, now = new Date(), timeZone = 'America/New_York') {
  const days = Math.round((Date.parse(on) - Date.parse(dayIn(now, timeZone))) / DAY);
  if (!Number.isFinite(days)) return null;
  const text = days > 7 ? 'coming up, not this week' : days > 1 ? 'in a few days' : days === 1 ? 'tomorrow' : days === 0 ? 'today'
    : days === -1 ? 'was yesterday' : days >= -7 ? 'was a few days ago' : days >= -14 ? 'was last week' : 'was a while ago';
  return { days, text };
}

// ── The conversation ──────────────────────────────────────────────────────────
/**
 * Where this conversation started in `chat` (oldest first): right after the last
 * pause of 6 hours or more. Messages typed in Practice have no date: they are "now".
 * Returns { start, away }: `away` = how long he was gone before it (ms), or null.
 */
function conversation(chat = [], now = Date.now()) {
  let next = now;
  for (let i = chat.length - 1; i >= 0; i -= 1) {
    if (chat[i].mass) continue;
    const t = chat[i].at ? Date.parse(chat[i].at) : next;
    if (next - t >= PAUSE) return { start: i + 1, away: next - t };
    next = t;
  }
  return { start: 0, away: null };
}

/** "2 days", "5 hours", "3 weeks": how long he was away. */
function awayText(ms) {
  if (!ms) return '';
  const h = Math.round(ms / 3600_000), d = Math.round(ms / DAY);
  if (h < 24) return `${h} hours`;
  if (d < 14) return `${d} day${d === 1 ? '' : 's'}`;
  if (d < 60) return `${Math.round(d / 7)} weeks`;
  return `${Math.round(d / 30)} months`;
}

// ── Closeness (Q16) ───────────────────────────────────────────────────────────
const WARMTH = ['cold', 'normal', 'warm', 'affectionate'];
const CLOSENESS = ['new', 'friendly', 'flirty', 'intimate', 'girlfriend'];
// her tone, by how close they are
const TONE = {
  new: 'light, curious and friendly: you are just getting to know each other',
  friendly: 'warm and easy, like a friend he likes talking to',
  flirty: 'playful and teasing: flirting is normal between you two',
  intimate: 'affectionate and personal: you know him well, and it shows',
  girlfriend: 'very affectionate, like his girlfriend: you missed him, you share bits of your day, your little in-jokes',
};
// his words, when no memory has read him yet (Practice, or a fan without notes)
const AFFECTION = /\b(?:miss(?:ed)?\s+(?:you|u|ya)|love\s+(?:you|u|ya)|thinking\s+(?:of|about)\s+(?:you|u)|my\s+(?:girl|queen|love|angel)|sweetheart|darling)\b|❤️|😘|🥰|😍|💕/iu;
const KIND_WORDS = /\b(?:babe|baby|beautiful|gorgeous|cutie|sweetie|thank(?:s|\s+you)|haha+|lol|you'?re\s+(?:so\s+)?(?:sweet|cute|funny|amazing))\b|😊|☺️|😁|😂/iu;

/**
 * How close he and she are. `chat` = the conversation, oldest first (with dates
 * for a real fan), `card` = his notes, `tier` (plan.fanProfile), `bond` = what
 * his memory read about how he treats her ({ warmth, why }), or null.
 * Returns { level, score, tone, signals: [{ label, points, why }] }.
 */
function closenessOf({ chat = [], card = [], tier = 'none', bond = null, now = new Date() }) {
  const his = chat.filter(m => m.from_fan && !m.mass);
  const n = his.length;
  const days = new Set(his.filter(m => m.at && now.getTime() - Date.parse(m.at) <= 30 * DAY).map(m => String(m.at).slice(0, 10))).size;
  const talk = n >= 200 || days >= 8 ? 2 : n >= 25 || days >= 3 ? 1 : 0;
  const personal = card.filter(f => ['about', 'plan', 'avoid'].includes(f.kind) && clean(f.text)).length;
  const shared = personal >= 6 ? 2 : personal >= 2 ? 1 : 0;
  const hot = his.filter(m => replyLevel(m.text) >= 2).length;
  const sexual = hot >= 10 ? 2 : hot >= 1 ? 1 : 0;
  const spend = { whale: 2, spender: 2, small: 1 }[tier] || 0;
  let warmth = WARMTH.includes(bond?.warmth) ? bond.warmth : null;
  let warmWhy = clean(bond?.why);
  if (!warmth) {
    const sweet = his.filter(m => AFFECTION.test(m.text || '')).length;
    const kind = his.filter(m => KIND_WORDS.test(m.text || '')).length;
    warmth = sweet >= 2 ? 'affectionate' : sweet + kind >= 2 ? 'warm' : 'normal';
    warmWhy = 'from his words here; his memory hasn\'t rated him yet';
  }
  const warm = { cold: -1, normal: 0, warm: 1, affectionate: 2 }[warmth];
  const tierWord = { new: 'new subscriber', none: 'no spend in 90 days', small: 'small buyer', spender: 'spender', whale: 'whale', tw: 'time waster' }[tier] || tier;
  const score = Math.max(0, talk + shared + sexual + spend + warm);
  let i = score >= 8 ? 4 : score >= 6 ? 3 : score >= 4 ? 2 : score >= 2 ? 1 : 0;
  if (i === 4 && warmth !== 'affectionate') i = 3;           // "girlfriend" only when he is affectionate with her
  const level = CLOSENESS[i];
  const s = (k) => (k === 1 ? '' : 's');
  return {
    level, score, tone: TONE[level],
    signals: [
      { label: 'Chatting', points: talk, why: `${n} message${s(n)} from him${days ? `, on ${days} of the last 30 days` : ''}` },
      { label: 'Shared', points: shared, why: personal ? `${personal} personal note${s(personal)}` : 'nothing personal yet' },
      { label: 'Sexual', points: sexual, why: hot ? `${hot} sexual message${s(hot)} from him` : 'never sexual yet' },
      { label: 'Spends', points: spend, why: tierWord },
      { label: 'Warmth', points: warm, why: `${warmth}${warmWhy ? `: ${warmWhy}` : ''}` },
    ],
  };
}

// ── Callbacks (Q9–Q12) ────────────────────────────────────────────────────────
const STOP = new Set(('the and for his her she you was are but not can got him has had one two out new old who how why yes all any our its get '
  + 'let may say see use way about after again also always been being does doing done from gets going have having into just like likes '
  + 'loves more most much never only over really said says some still that their them then there they this told very want wants well '
  + 'were what when where which while will with would your yours called named lives living works working thinks enjoys usually '
  + 'sometimes years year old goes good bad lot lots kind sort time times thing things day days week weeks').split(' '));
const keyWords = (t) => [...new Set(clean(t).toLowerCase().match(/[a-z']{3,}/g) || [])].filter(w => !STOP.has(w));
const wordSet = (t) => new Set(clean(t).toLowerCase().match(/[a-z']{3,}/g) || []);
/** Did one of `texts` touch this note (its key words; two of them for a long note)? */
function mentioned(f, texts) {
  const k = keyWords(f.text);
  if (!k.length) return false;
  const need = k.length >= 5 ? 2 : 1;
  return texts.some((t) => { const w = wordSet(t); return k.filter(x => w.has(x)).length >= need; });
}
// a note that is only who he is, not something to talk about ("34 years old", "lives in Texas", "goes by Mike")
const IDENTITY = /^\W*(?:(?:he\s+is\s+|is\s+|aged?\s+)?\d+(?:\s*(?:years?\s*old|yo|y\/o))?|(?:lives?|based|living)\s+in\s+[\w\s,.'-]+|from\s+[\w\s,.'-]+|goes\s+by\s+[\w'-]+|(?:his\s+)?name\s+is\s+[\w'-]+|[\w\s/-]*time\s*zone[\w\s/-]*)\W*$/i;

// a life thing worth asking about (Q11: pets, work, hobbies, family, trips, health, problems he shared)
const TOPIC = /\b(?:dogs?|cats?|pets?|puppy|kitten|horse|job|work\w*|boss|office|shift|career|business|shop|company|gym|workout|run(?:s|ning)?|hik\w*|fish\w*|hunt\w*|golf|football|soccer|basketball|baseball|hockey|team|games?|gaming|playstation|xbox|guitar|music|band|sing\w*|movies?|shows?|books?|read\w*|cook\w*|bak\w*|garden\w*|car|truck|bike|motorbike|motorcycle|boat|house|apartment|moving|moved|kids?|sons?|daughters?|wife|girlfriend|brother|sister|mom|mother|dad|father|family|grand\w*|trip|travel\w*|vacation|holiday|flight|school|college|class|study\w*|exams?|degree|interview|surgery|doctor|hospital|sick|ill|injur\w*|wound|back\s+pain|stress\w*|breakup|divorce\w*|lonely|birthday|wedding|church|camping|beach|lake|sports?)\b/i;

/**
 * A note she could bring up herself now, or null. `card` = his notes, `recent` =
 * her messages of the last 3 days and everything said in this conversation (texts).
 * None if one of his notes came up in them already (at most once every few days, Q10).
 * Returns { note, kind, ask, why }.
 */
function callbackFor({ card = [], recent = [], now = new Date(), timeZone = 'America/New_York', pick = Math.random }) {
  const talkable = card.filter(f => ['about', 'plan'].includes(f.kind) && clean(f.text));
  if (!talkable.length || talkable.some(f => mentioned(f, recent))) return null;
  const plans = talkable.filter(f => f.kind === 'plan' && f.on).map(f => ({ f, w: planWhen(f.on, now, timeZone) })).filter(x => x.w);
  const done = plans.filter(x => x.w.days < 0 && x.w.days >= -14).sort((a, b) => b.w.days - a.w.days)[0];
  if (done) return { note: done.f.text, kind: 'plan', ask: `it ${done.w.text}: ask him how it went`, why: 'a plan of his that has just happened (Q11)' };
  const soon = plans.find(x => x.w.days >= 0 && x.w.days <= 1);
  if (soon) return { note: soon.f.text, kind: 'plan', ask: `it's ${soon.w.text}: wish him luck, or ask if he's ready`, why: 'a plan of his coming up very soon (Q11)' };
  const life = talkable.filter(f => f.kind === 'about' && !IDENTITY.test(f.text));
  const topics = life.filter(f => TOPIC.test(f.text));
  const pool = topics.length ? topics : life;
  if (!pool.length) return null;
  const f = pool[Math.floor(pick() * pool.length) % pool.length];
  return { note: f.text, kind: 'about', ask: 'ask how it\'s going, or tease him about it, naturally', why: 'a life thing he shared (Q11)' };
}

/** A plan of his coming up in the next 3 days, for a goodbye's hook ("tell me how the game goes"): { note, when } or null. */
function hookFor({ card = [], now = new Date(), timeZone = 'America/New_York' }) {
  const soon = card.filter(f => f.kind === 'plan' && f.on && clean(f.text)).map(f => ({ f, w: planWhen(f.on, now, timeZone) }))
    .filter(x => x.w && x.w.days >= 0 && x.w.days <= 3).sort((a, b) => a.w.days - b.w.days)[0];
  return soon ? { note: soon.f.text, when: soon.w.text } : null;
}

/** What he likes (sexually or in flirting): for selling and sexting only (Q11). */
const likesFor = (card = []) => card.filter(f => f.kind === 'likes' && clean(f.text)).map(f => f.text).slice(0, 3);

module.exports = { dayIn, ago, planWhen, conversation, awayText, closenessOf, callbackFor, hookFor, likesFor, mentioned, WARMTH, CLOSENESS, TONE, PAUSE };
