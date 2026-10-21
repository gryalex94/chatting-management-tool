/**
 * When she writes first, and how she paces it (your answers B1–B4 and B7 in
 * AI_CHAT_ADJUSTMENT_QUESTIONS.md). Pure: no database, no network. Nothing here
 * sends anything: it says when a first message would be due and of what kind, for
 * Practice and the Fan memory tab now, and for sending later.
 *  - hisHour: the middle of his busiest 3-hour window (session.hoursOf), else her evening.
 *  - nextFirst: the next first message for a fan: a nudge when he went quiet in the
 *    middle of a conversation (B4); a new conversation at his hour, by who he is (B2);
 *    when he didn't answer her opener, a weekly personal message for spenders and one
 *    more try after two days for everyone else, then only mass messages (B3).
 *  - sendDelay: how long she waits before her first message (B7).
 */
const { PAUSE } = require('./memory');
const { conversationsOf } = require('./session');
const { GOODBYE } = require('./plan');

const DAY = 86400_000, MIN = 60_000;
// days between her first messages, by who he is (B2)
const EVERY = { whale: 1, spender: 2.5, new: null, small: 7, none: 14, tw: null };
const EVERY_TEXT = { whale: 'every day', spender: 'every two or three days', new: 'on his first and third day', small: 'about once a week', none: 'every two weeks', tw: 'never: he gets mass messages only' };
const KINDS = {
  nudge: 'He went quiet in the middle of the conversation: one short, light message in passing (a reaction to what he said last, or a "still there?"), no pushing; then leave it',
  opener: 'A new conversation at his usual hour: a fresh opener of your own (a small thing from your day, or something from his notes), never a bare "hey" or a question-only ping',
  personal: 'His weekly personal message: built from your dialogue and his notes (what he told you, his plans, his likes), warm and specific, as if you just thought of him',
  second_try: 'He didn\'t answer your last opener: one more try, from a different angle, light, no guilt; after this one only mass messages reach him',
};
const KIND_WORD = { nudge: 'a nudge: he went quiet', opener: 'a new conversation at his hour', personal: 'his weekly personal message', second_try: 'one more try, a different angle' };
const EVENING = 20;

/** The hour (her time zone) she writes first to him: the middle of his busiest window, else her evening (B1). */
const hisHour = (hours) => (hours && hours.n >= 5 && hours.best != null ? (hours.best + 1) % 24 : EVENING);

// The moment `hour`:00 (her time zone) on the day of `ts`, or the next day when that has passed.
function atHour(ts, hour, timeZone = 'America/New_York') {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(ts));
  const get = (k) => Number(parts.find(p => p.type === k)?.value || 0);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'));
  const offset = asUtc - Math.floor(ts / MIN) * MIN;              // how far her zone is ahead of UTC at that moment
  const target = Date.UTC(get('year'), get('month') - 1, get('day'), hour, 0) - offset;
  return target >= ts - 30 * MIN ? target : target + DAY;
}

/**
 * The next first message for him, or null when she has no reason to write first.
 * `chat` = his chat, oldest first (real messages carry `at`), `tier` = plan.fanProfile's
 * tier, `newSub`, `chatSince` = their first message (ISO), `hours` = session.hoursOf.
 * Returns { kind, text, at, due, in_ms, why, every }.
 */
function nextFirst({ chat = [], tier = 'none', newSub = false, chatSince = null, hours = null, now = new Date(), timeZone = 'America/New_York' }) {
  const t = now.getTime();
  const real = chat.filter(m => !m.mass && m.at);
  const his = real.filter(m => m.from_fan), hers = real.filter(m => !m.from_fan);
  const lastHis = his.length ? Date.parse(his[his.length - 1].at) : null;
  const lastHer = hers.length ? Date.parse(hers[hers.length - 1].at) : null;
  const last = Math.max(lastHis || 0, lastHer || 0) || null;
  const every = EVERY_TEXT[tier in EVERY ? tier : 'none'];
  const hour = hisHour(hours);
  const out = (kind, at, why) => ({ kind, text: KINDS[kind], word: KIND_WORD[kind], at: new Date(at).toISOString(), due: at <= t, in_ms: at - t, why, every, hour });
  // a conversation going on and he spoke last: she replies, she doesn't write first
  if (last && t - last < PAUSE && lastHis && (!lastHer || lastHis > lastHer)) return null;
  // he went quiet after her message, mid-conversation (B4): one nudge 30–60 minutes later, unless she said goodbye or nudged already
  if (lastHer && lastHis && lastHer > lastHis && t - lastHer < PAUSE) {
    const tail = [];
    for (let i = real.length - 1; i >= 0 && !real[i].from_fan; i -= 1) tail.unshift(real[i]);
    const saidBye = tail.some(m => GOODBYE.test(m.text || ''));
    const nudged = tail.length >= 2 && Date.parse(tail[tail.length - 1].at) - Date.parse(tail[0].at) >= 20 * MIN;
    if (saidBye || nudged) return null;
    return out('nudge', lastHer + 45 * MIN, 'he went quiet after her message: one short nudge, then she leaves it (B4)');
  }
  if (tier === 'tw') return null;
  // her openers that got no answer: the latest conversations with her messages only (B3)
  const convs = conversationsOf(chat, t);
  let unanswered = 0;
  for (let i = convs.length - 1; i >= 0 && convs[i].his === 0 && convs[i].hers > 0; i -= 1) unanswered += 1;
  if (unanswered >= 1 && lastHer) {
    if (['spender', 'whale'].includes(tier)) return out('personal', atHour(lastHer + 7 * DAY, hour, timeZone), 'he didn\'t answer her last message; a spender gets a weekly personal message (B3)');
    if (unanswered >= 2) return null;
    return out('second_try', atHour(lastHer + 2 * DAY, hour, timeZone), 'he didn\'t answer her opener: one more try after two days, then only mass messages (B3)');
  }
  // a new conversation, by who he is (B2)
  if (newSub) {
    const since = chatSince ? Date.parse(chatSince) : (last || t);
    const day1 = since + DAY, day3 = since + 3 * DAY;
    const at = !last || last < day1 ? day1 : last < day3 ? day3 : null;
    return at ? out('opener', atHour(at, hour, timeZone), 'a new subscriber: she writes on his first and third day (B2)') : null;
  }
  const days = EVERY[tier in EVERY ? tier : 'none'];
  if (days == null) return null;
  return out('opener', atHour((last || t) + days * DAY, hour, timeZone), `${every} at his hour (B2)`);
}

/** How long she waits before her first message (B7): 1–4 minutes, 10–30 for a time waster or on a short day. */
function sendDelay({ tier = 'none', aim = 'read', rand = Math.random } = {}) {
  const slow = tier === 'tw' || aim === 'short';
  const [lo, hi] = slow ? [10, 30] : [1, 4];
  const wait_min = Math.round((lo + rand() * (hi - lo)) * 10) / 10;
  return { wait_min, why: slow ? 'a time waster, or a short day: she takes her time (B7)' : 'a random one to four minutes before her first message, plus typing time (B7)' };
}

/** "in 2 days (Tue, 21:00 her time)" / "due now" */
function whenText(next, timeZone = 'America/New_York') {
  if (!next) return '';
  const when = new Date(next.at).toLocaleString('en-GB', { timeZone, weekday: 'short', hour: '2-digit', minute: '2-digit' });
  if (next.due) return `due now (${when} her time)`;
  const h = next.in_ms / 3600_000;
  return `${h < 1 ? `in ${Math.max(1, Math.round(next.in_ms / MIN))} min` : h < 36 ? `in ${Math.round(h)} hours` : `in ${Math.round(h / 24)} days`} (${when} her time)`;
}

module.exports = { nextFirst, sendDelay, hisHour, atHour, whenText, KINDS, KIND_WORD, EVERY, EVERY_TEXT };
