/**
 * How the AI chat describes what isn't in a message's text, the same way on the
 * screens, for the writer, the situation picker and Claude:
 *  - what came with a message: photos, videos, a PPV and its price, whether he
 *    bought it (fanvue_media, database change 039; earnings for older ones),
 *  - where he stands with her: a new subscriber, a subscriber, a free follower,
 *    or his subscription ended (from Fanvue's subscription payments).
 */
const DAY = 86400_000;
const SUB_GAP = 35 * DAY;          // no renewal for this long: the subscription ended
const NEW_FOR = 7 * DAY;           // a new subscriber for his first week

const plural = (n, one, many = `${one}s`) => `${n === 1 ? 'a' : n} ${n === 1 ? one : many}`;
const day = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/Amsterdam' });

/** "4 photos", "a video", "2 photos and a video". */
function mediaWhat(md) {
  if (!md) return '';
  const parts = [];
  if (md.photos) parts.push(plural(md.photos, 'photo'));
  if (md.videos) parts.push(plural(md.videos, 'video'));
  if (md.other) parts.push(plural(md.other, 'file'));
  return parts.join(' and ');
}

/**
 * What came with a message, as of the chat given (purchases made later already
 * taken out): "PPV $25.69: 4 photos, he hasn't bought it", "he sent a photo",
 * "a photo, free", "paid message, he bought it for $12", "tip". '' when nothing.
 */
function mediaNote(m) {
  const md = m.media;
  if (md && (md.photos || md.videos || md.other)) {
    const what = mediaWhat(md);
    if (m.from_fan) return `he sent ${what}`;
    if (md.price) {
      const bought = md.bought_at || m.paid_at;
      return `PPV $${md.price}: ${what}, ${bought ? `he bought it on ${day(bought)}` : 'he hasn\'t bought it'}`;
    }
    return `${what}, free`;
  }
  if (m.paid) return `paid message, he bought it for $${m.paid}`;
  if (m.tip) return 'tip';
  return '';
}

/** What a message shows when it has no text. */
const emptyBody = (m) => (m.gif ? '(a gif)' : mediaWhat(m.media) ? `(${mediaWhat(m.media)})` : '(a photo or video)');

/**
 * Where he stood with her at `at` (ms, default now), from his subscription
 * payments: { state: 'follower' | 'new' | 'subscriber' | 'ended', since, days, ended, label, text }.
 * `chatSince` = their first message: a "new" subscriber may have chatted for long before.
 */
function standingAt(earn = [], at = Date.now(), chatSince = null) {
  const pays = earn.filter(e => (e.source === 'subscription' || e.source === 'renewal') && e.paid_at && Date.parse(e.paid_at) <= at)
    .map(e => Date.parse(e.paid_at)).sort((a, b) => a - b);
  if (!pays.length) {
    return { state: 'follower', label: 'Free follower', text: 'He isn\'t subscribed to you: he follows you for free.' };
  }
  let since = pays[0];
  for (let i = 1; i < pays.length; i++) if (pays[i] - pays[i - 1] > SUB_GAP) since = pays[i];     // he came back
  const last = pays[pays.length - 1];
  const iso = (t) => new Date(t).toISOString();
  if (at - last > SUB_GAP) {
    const ended = last + 31 * DAY;
    return { state: 'ended', since: iso(since), ended: iso(ended), label: `Subscription ended ~${day(ended)}`, text: `His subscription to you ended around ${day(ended)}: he isn't subscribed now.` };
  }
  const days = Math.floor((at - since) / DAY);
  const ago = days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
  if (at - since <= NEW_FOR) {
    const before = chatSince && since - Date.parse(chatSince) > 2 * DAY;   // he followed her for free first
    return {
      state: 'new', since: iso(since), days,
      label: before ? `New subscriber (${ago}), chatting since ${day(chatSince)}` : `New subscriber (${ago})`,
      text: before
        ? `He subscribed ${ago} (${day(since)}), but he isn't new to you: you have been chatting since ${day(chatSince)}, when he followed you for free.`
        : `He is a NEW subscriber: he subscribed ${ago} (${day(since)}).`,
    };
  }
  return { state: 'subscriber', since: iso(since), days, label: `Subscriber since ${day(since)}`, text: `He has been subscribed to you since ${day(since)} (${days} days).` };
}

module.exports = { mediaWhat, mediaNote, emptyBody, standingAt };
