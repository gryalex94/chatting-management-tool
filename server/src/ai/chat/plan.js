/**
 * The deciding layer (Practice first): who he is, and the plan for her next reply,
 * decided in code from your answers in AI_CHAT_RULES_QUESTIONS.md (the Q numbers)
 * and the agency's 35k analysed chats, each decision with its reason. The writer
 * only turns the plan into her words; the decision map shows every decision.
 *  - fanProfile: his tier (scaled by the page's size), new subscriber or not, time
 *    waster, suspicious, a rough closeness, his talk budget.
 *  - planReply: the goal of this reply, whether she may sell or ask, how long,
 *    a callback from his notes, the story move, the PPV to offer.
 *  - planText: the plan as the writer reads it.
 * Pure (no database, no network).
 */
const { replyLevel } = require('./safety');

const clean = (s) => String(s ?? '').trim();
const DAY = 86400_000;
const LEVEL_WORD = ['friendly', 'flirty', 'suggestive', 'explicit'];

// Spender tiers as in the 35k analysis (spent on PPVs and tips in 90 days), halved
// for small pages (under $2,000 a month): Q17, Q17b.
const TIER_BARS = { whale: 500, spender: 100 };
const SMALL_PAGE = 2000;
const TIER_LABEL = { new: 'New subscriber', none: 'No spend in 90 days', small: 'Small buyer', spender: 'Spender', whale: 'Whale', tw: 'Time waster' };
// Free small talk before she moves toward a sale, in her messages since his last
// purchase (Q26b; starting points, to be calibrated). Sexting doesn't count (Q27).
const BUDGET = { whale: 20, new: 15, spender: 15, small: 10, none: 8, tw: 5 };
const SUSPICIOUS = /\b(?:are\s+(?:you|u)\s+(?:a\s+)?(?:real|bot|robot|fake|ai|a\s+scam|scamming)|is\s+(?:this|it)\s+(?:really\s+)?(?:you|real|a\s+bot|fake|a\s+scam)|scam\w*|catfish\w*|fake\s+(?:account|profile|pics?)|not\s+really\s+(?:you|her)|who\s+am\s+i\s+(?:really\s+)?talking\s+to)\b/i;
const FREE_ASK = /\b(?:for\s+free|free\s+(?:pics?|nudes?|content|stuff|vid\w*|preview)|send\s+(?:me\s+)?(?:a\s+)?(?:free|preview)|no\s+money|broke)\b/i;

/**
 * Who he is, for this reply. `money` = his spending ({ spent, spent90, paid_messages,
 * msg_spent, last_purchase, standing }), `type` = a made-up fan's type, `chat` = the
 * conversation (oldest first), `ids` = the planner's situations, `mood`, `pageMonthly`
 * = the page's earnings in the last 30 days, `offered` = PPVs she sent in this chat,
 * `card` = his notes, `override` = what-if changes ({ tier }).
 */
function fanProfile({ money = null, type = null, chat = [], ids = [], mood = '', pageMonthly = null, offered = [], card = [], override = {} }) {
  const small = pageMonthly != null && pageMonthly < SMALL_PAGE;
  const k = small ? 0.5 : 1;
  const spent90 = money?.spent90 ?? 0;
  const his = chat.filter(m => m.from_fan);
  const hisText = his.map(m => clean(m.text)).join('\n');
  // a sale attempt: any PPV she sent him, in his real chat or this practice
  const tried = offered.length > 0 || chat.some(m => !m.from_fan && m.media?.price);
  const standing = money?.standing?.state || null;
  // still "new" until the first sale attempt (Q17): a real subscriber nobody has sold to yet
  const newSub = type?.id === 'new_sub' || standing === 'new' || (!type && standing === 'subscriber' && !(money?.paid_messages) && !tried);
  const newWhy = type?.id === 'new_sub' ? 'his type is new subscriber' : standing === 'new' ? 'he subscribed in the last 7 days'
    : newSub ? 'nobody has tried to sell to him yet, so he\'s still treated as new (Q17)' : '';
  const behaviour = ids.includes('time_waster') || FREE_ASK.test(hisText);
  const timeWaster = type?.id === 'time_waster' || (behaviour && spent90 === 0 && !newSub);
  const twWhy = type?.id === 'time_waster' ? 'his type is time waster'
    : timeWaster ? 'he wants attention or free things and bought nothing in 90 days (Q6e-1)' : '';
  let tier = spent90 >= TIER_BARS.whale * k ? 'whale' : spent90 >= TIER_BARS.spender * k ? 'spender' : spent90 > 0 ? 'small' : 'none';
  if (newSub) tier = 'new';
  if (timeWaster) tier = 'tw';
  if (override.tier && TIER_LABEL[override.tier]) tier = override.tier;
  const bars = `whale $${TIER_BARS.whale * k}+, spender $${TIER_BARS.spender * k}+ in 90 days${small ? ' (halved: a small page)' : ''}`;
  const suspicious = mood === 'suspicious' || SUSPICIOUS.test(hisText);
  // a rough closeness until his memory rates it (Q16): his type and spending, what he shared, how far they went
  let score = { new: 0, none: 1, small: 1, spender: 2, whale: 3, tw: 0 }[tier];
  if (card.filter(f => f.kind === 'about' || f.kind === 'likes').length >= 3) score += 1;
  if (his.filter(m => replyLevel(m.text) >= 2).length >= 3) score += 1;
  const closeness = ['new', 'friendly', 'flirty', 'intimate', 'girlfriend'][Math.min(4, score)];
  // free small talk since his last purchase (sexting doesn't count)
  let since = -1;
  chat.forEach((m, i) => { if (!m.from_fan && (m.media?.status === 'bought' || m.media?.bought_at)) since = i; });
  const lastBuy = money?.last_purchase ? Date.parse(money.last_purchase) : null;
  const after = chat.slice(since + 1).filter(m => !m.from_fan && !m.mass && (!lastBuy || !m.at || Date.parse(m.at) > lastBuy));
  const used = after.filter(m => replyLevel(m.text) < 2).length;
  const sad = mood === 'sad';
  const limit = Math.round(BUDGET[tier] * (sad && ['small', 'spender', 'whale'].includes(tier) ? 1.5 : 1));
  const budget = { used: override.budget === 'used' ? limit : used, limit };
  return {
    tier, tier_label: TIER_LABEL[tier], tier_why: override.tier ? 'what if' : tier === 'new' ? newWhy : tier === 'tw' ? twWhy : `$${Math.round(spent90)} on PPVs and tips in 90 days (${bars})`,
    small_page: small, new_sub: newSub, time_waster: tier === 'tw', suspicious, closeness, budget,
    days_since_buy: lastBuy ? Math.floor((Date.now() - lastBuy) / DAY) : null,
    avg_price: money?.paid_messages ? Math.round((money.msg_spent || 0) / money.paid_messages) : null,
  };
}

const words = (t) => (clean(t).match(/[\p{L}\p{N}']+/gu) || []).length;
// his notes she could bring up herself (Q11: life things, plans, problems he shared;
// not what he likes sexually here, never what to avoid)
const callbackNotes = (card) => card.filter(f => f.kind === 'about' && clean(f.text));

/**
 * The plan for her next reply, with reasons. Returns { goal, goal_text, why, sell,
 * ask, length, level, lead, callback, story, offer, rules }.
 */
function planReply({ level, voice = null, latest = [], followUp = false, sell = false, noOffer = '', waiting = null, match = null, sexting = null, profile, ids = [], card = [], herReplies = 0, gap = null }) {
  const said = latest.join(' ');
  const mood = level.mood;
  const p = { rules: [] };
  const goal = (g, text, why, rules = []) => { p.goal = g; p.goal_text = text; p.why = why; p.rules.push(...rules); };

  // 1. the goal of this reply
  if (followUp) goal('follow_up', 'He went quiet: one short, light message to get him talking again', 'he hasn\'t answered', ['Q6']);
  else if (profile.time_waster && FREE_ASK.test(said)) goal('no_freebies', 'Friendly but short: nothing for free; if anything, a small, cheap offer', 'a time waster asking for free things', ['Q19', 'Q31']);
  else if (waiting?.p?.status === 'bought' && !waiting.herAfter) goal('after_buy', 'He just bought: react to it, and keep the mood going', 'he bought her last PPV', ['Q34']);
  else if (sexting?.on && sexting.stage === 'after') goal('aftercare', 'He finished: aftercare, warm and personal', 'he says he finished', ['Q44']);
  else if (level.pulled_back) goal('ease_off', 'He\'s slowing down: ease off, back to normal talk', 'he pulled back');
  else if (mood === 'sad') goal('comfort', 'Comfort him: no flirting, no selling', `he seems sad${['spender', 'whale'].includes(profile.tier) ? ', and he spends: take your time' : ''}`, ['Q24', 'Q25']);
  else if (profile.suspicious) goal('reassure', 'Calm and easy: reassure him, joke it away, no selling unless he asks', 'he doubts it\'s real or worth it', ['Q24c']);
  else if (mood === 'annoyed') goal('calm', 'Stay calm and warm; no selling', 'he seems annoyed', ['Q1', 'Q24d']);
  else if (waiting?.open && /\b(?:what(?:'s| is)?\s+in\s+(?:it|there|that)|is\s+(?:it|that)\b|how\s+(?:many|long))/i.test(waiting.hisLatest || '')) goal('answer_ppv', 'Answer what he asks about her PPV, truthfully, then tease', 'he asks what\'s in it', ['Q42']);
  else if (waiting?.open && waiting.hisAfter) goal('point_to_ppv', 'Point him to the PPV waiting for him, playfully; nothing new', 'her last PPV is still unopened', ['Q37']);
  else if (match && !match.full.length) goal('honest_no', 'Say honestly she doesn\'t have that exactly (maybe she\'ll make something like it), ask what exactly he\'d want, offer the closest', 'he asks for something she doesn\'t have', ['Q38']);
  else if (match?.full.length && sell && !noOffer) goal('offer', 'He asked for something she has: say yes and offer it', 'he asks for something in her content', ['Q23']);
  else if (sexting?.on && level.lead) goal('lead_story', 'Lead the sexting story one step on: what she does now, then tease', 'they\'re sexting and she leads', ['Q41', 'Q42b']);
  else if (level.his >= 2) goal('tease', 'He got sexual: say yes playfully and tease; don\'t stall', 'he got sexual first', ['Q1']);
  else if (profile.budget.used >= profile.budget.limit && sell && !noOffer && !profile.time_waster) goal('steer_to_sale', 'His free talk is used up: steer gently toward something to buy that fits him', `${profile.budget.used} of ${profile.budget.limit} free messages used`, ['Q26b', 'Q28']);
  else if (profile.budget.used >= profile.budget.limit) goal('wind_down', 'His free talk is used up: keep it short and warm, she has to go soon', `${profile.budget.used} of ${profile.budget.limit} free messages used`, ['Q28', 'Q29']);
  else if (profile.new_sub) goal('get_to_know', 'Get to know him: welcome him, react to what he says', 'a new subscriber', ['Q21']);
  else goal('chat', 'Keep him talking: real interest in what he said, a small story of hers, or a new topic', 'small talk', ['Q5', 'Q5b']);

  // 2. selling: may a PPV go with this reply?
  const noSell = { comfort: 'he\'s sad: comfort first (Q24)', reassure: 'he\'s suspicious: no selling unless he asks (Q24c)', calm: 'he\'s annoyed (Q1)', ease_off: 'he\'s slowing down', aftercare: 'aftercare first (Q44)', point_to_ppv: 'her last PPV is still unopened', answer_ppv: 'her last PPV is still unopened' }[p.goal];
  // a time waster: short replies (Q19)
  if (profile.time_waster && !['offer', 'lead_story'].includes(p.goal)) p.short = 'he\'s a time waster: friendly but short (Q19)';
  p.sell = !sell ? { allowed: false, why: 'selling is off' } : noOffer ? { allowed: false, why: noOffer } : noSell ? { allowed: false, why: noSell }
    : { allowed: true, why: ['offer', 'steer_to_sale', 'lead_story', 'after_buy'].includes(p.goal) ? 'a PPV fits now, if it fits the story' : 'allowed, if it really fits' };
  // what to offer: what he asked for, or the next step of her sexting set (after 2–4 messages of story: Q41)
  p.offer = null;
  if (p.sell.allowed) {
    if (match?.full.length) p.offer = { items: match.full.slice(0, 3), why: `he asked for ${match.wants.join(' + ')}` };
    else if (sexting?.next && (gap == null || gap >= 2)) p.offer = { next: sexting.next, why: `the next step of her set${gap != null ? ` (${gap} of her messages since the last PPV)` : ''}` };
    if (profile.avg_price) p.price_hint = `he usually pays about $${profile.avg_price}: stay close to that, slightly above (Q23)`;
  }

  // 3. questions
  const noAskGoal = { lead_story: 'she leads the story instead', tease: 'he said what he wants: play along', offer: 'he asked: say yes', point_to_ppv: 'no question, just point him to it' }[p.goal];
  p.ask = voice?.noQuestion ? { allowed: false, why: voice.noQuestion } : noAskGoal ? { allowed: false, why: noAskGoal } : { allowed: true, why: 'one at most (Q5)' };

  // 4. length: mirror his (Q4), never a bare one-liner; sexting gets room for a story move
  const n = words(said);
  const target = followUp || p.short ? 'short' : p.goal === 'lead_story' ? 'medium' : n <= 6 ? 'short' : n <= 25 ? 'medium' : 'long';
  p.length = { target, why: followUp ? 'a light nudge' : p.short || (p.goal === 'lead_story' ? 'room for a story move' : `he wrote ${n} word${n === 1 ? '' : 's'}: mirror him (Q4)`) };
  p.length.text = { short: 'short: one message, about 5–15 words, but not a bare one-word reply', medium: 'one or two short messages', long: 'two or three messages, with some substance' }[target];

  // 5. how far she may go, and whether she leads (decided by the warm-up rules)
  p.level = { max: level.max, word: LEVEL_WORD[level.max] };
  p.lead = !!level.lead && level.his >= 2;

  // 6. a callback from his notes (Q9–Q11): now and then, in small talk; at most once in this chat
  p.callback = null;
  const notes = callbackNotes(card);
  const used = (voice?.recent || []).join(' ').toLowerCase();
  const fresh = notes.filter(f => !clean(f.text).toLowerCase().split(/[^a-z]+/).filter(w => w.length >= 4).some(w => used.includes(w)));
  if (fresh.length && ['chat', 'get_to_know', 'comfort', 'follow_up'].includes(p.goal) && (herReplies <= 1 || p.goal === 'follow_up' || p.goal === 'comfort')) {
    p.callback = { note: fresh[0].text, why: herReplies <= 1 ? 'the start of a chat: a good moment to show she remembers (Q9)' : 'a quiet moment' };
  }

  // 7. the story move, when they sext
  p.story = sexting?.on && sexting.moves?.moves?.length ? { move: sexting.moves.moves[0], why: `the next move for ${sexting.moves.where}` } : null;
  p.rules = [...new Set(p.rules)];
  return p;
}

/** The plan as the writer reads it. */
function planText(p) {
  const lines = [`Goal: ${p.goal_text}.`];
  lines.push(`Length: ${p.length.text}.`);
  lines.push(p.ask.allowed ? 'Questions: one at most, and only if it helps.' : `Questions: none this time (${p.ask.why}).`);
  if (p.callback) lines.push(`Show you remember him: bring up "${p.callback.note}" naturally (no dates, don't quote it).`);
  if (p.story) lines.push(`Story move: "${p.story.move}" (or one like it).`);
  if (!p.sell.allowed) lines.push(`PPV: none with this reply (${p.sell.why}). Don't promise one either.`);
  else if (p.offer?.items) lines.push(`PPV: he asked for it, so offer one of these if it fits: ${p.offer.items.map(it => `[c${it.id}] "${it.title}"`).join(', ')}.`);
  else if (p.offer?.next) lines.push(`PPV: ${p.offer.next}`);
  if (p.price_hint) lines.push(`Price: ${p.price_hint}.`);
  return lines;
}

module.exports = { fanProfile, planReply, planText, TIER_LABEL, BUDGET };
