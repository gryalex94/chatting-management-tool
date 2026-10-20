/**
 * The deciding layer (Practice first): who he is, and the plan for her next reply,
 * decided in code from your answers in AI_CHAT_RULES_QUESTIONS.md (the Q numbers)
 * and the agency's 35k analysed chats, each decision with its reason. The writer
 * only turns the plan into her words; the decision map shows every decision.
 *  - fanProfile: his tier (scaled by the page's size), new subscriber or not, time
 *    waster, suspicious, how close they are (memory.js), his talk budget.
 *  - planReply: the goal of this reply (goodbyes and "welcome back" too), whether
 *    she may sell or ask, how long, her tone, a note of his to bring up, a check
 *    when he contradicts a note, the story move, the PPV to offer.
 *  - planText: the plan as the writer reads it.
 * Pure (no database, no network).
 */
const { replyLevel } = require('./safety');
const { closenessOf, CLOSENESS, TONE, likesFor, awayText } = require('./memory');

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
// he's leaving (Q8)
const GOODBYE = /\b(?:good\s*night|good\s*bye|g'?night|nighty?\s*night|gn|nite|gotta\s+(?:go|run|sleep)|got\s+to\s+go|have\s+to\s+(?:go|leave|run)|need\s+to\s+(?:go|sleep|leave)|i'?m\s+(?:off|out|going\s+to\s+(?:bed|sleep))|heading\s+(?:to\s+bed|out|off)|off\s+to\s+(?:bed|sleep|work)|going\s+to\s+(?:bed|sleep)|talk\s+(?:to\s+(?:you|u)\s+)?(?:later|tomorrow|tmrw|soon)|ttyl|bye+|see\s+(?:you|ya|u)\s+(?:later|tomorrow|soon))\b/i;
const DAY_MS = DAY;

/**
 * Who he is, for this reply. `money` = his spending ({ spent, spent90, paid_messages,
 * msg_spent, last_purchase, standing }), `type` = a made-up fan's type, `chat` = the
 * conversation (oldest first), `ids` = the planner's situations, `mood`, `pageMonthly`
 * = the page's earnings in the last 30 days, `offered` = PPVs she sent in this chat,
 * `card` = his notes, `bond` = how he treats her (his memory's read), `from` = where
 * this conversation starts in `chat` (memory.conversation), `override` = what-if
 * changes ({ tier, closeness, budget }).
 */
function fanProfile({ money = null, type = null, chat = [], ids = [], mood = '', pageMonthly = null, offered = [], card = [], bond = null, from = 0, override = {}, now = new Date() }) {
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
  // how close they are (Q16): a mix of signals, each with its points (memory.js); what if: as you set it
  const close = closenessOf({ chat, card, tier, bond, now });
  if (override.closeness && CLOSENESS.includes(override.closeness)) Object.assign(close, { level: override.closeness, tone: TONE[override.closeness], what_if: true });
  const closeness = close.level;
  // free small talk in this conversation, since his last purchase (Q26: judged per chat; Q27:
  // sexting doesn't count)
  let since = from - 1;
  chat.forEach((m, i) => { if (i >= from && !m.from_fan && (m.media?.status === 'bought' || m.media?.bought_at)) since = i; });
  const lastBuy = money?.last_purchase ? Date.parse(money.last_purchase) : null;
  const after = chat.slice(since + 1).filter(m => !m.from_fan && !m.mass && (!lastBuy || !m.at || Date.parse(m.at) > lastBuy));
  const used = after.filter(m => replyLevel(m.text) < 2).length;
  const sad = mood === 'sad';
  const limit = Math.round(BUDGET[tier] * (sad && ['small', 'spender', 'whale'].includes(tier) ? 1.5 : 1));
  const budget = { used: override.budget === 'used' ? limit : used, limit };
  return {
    tier, tier_label: TIER_LABEL[tier], tier_why: override.tier ? 'what if' : tier === 'new' ? newWhy : tier === 'tw' ? twWhy : `$${Math.round(spent90)} on PPVs and tips in 90 days (${bars})`,
    small_page: small, new_sub: newSub, time_waster: tier === 'tw', suspicious, closeness, close, budget,
    days_since_buy: lastBuy ? Math.floor((Date.now() - lastBuy) / DAY) : null,
    avg_price: money?.paid_messages ? Math.round((money.msg_spent || 0) / money.paid_messages) : null,
  };
}

const words = (t) => (clean(t).match(/[\p{L}\p{N}']+/gu) || []).length;

// How she says goodbye (Q8, 8a–8d): by who he is and what just happened.
// `again`: he already said he's leaving once in this conversation (her one try is used).
function goodbyeOf({ profile, waiting = null, sexting = null, away = null, herReplies = 0, mood = '', again = false }) {
  if (profile.time_waster) return { kind: 'short', text: 'He\'s leaving: a short, friendly goodbye', why: 'a time waster says goodbye', rules: ['Q8'] };
  if (waiting?.open && !again) return { kind: 'keep_ppv', text: 'He\'s leaving with her PPV still unopened: one playful try to keep him ("you sure you want to miss out on…?"), no pressure; a warm goodbye if he still goes', why: 'he\'s leaving right after her PPV', rules: ['Q8a'] };
  if (sexting?.on && sexting.stage !== 'after' && !again) return { kind: 'mid_sexting', text: 'He\'s leaving in the middle of sexting: one playful push ("you\'re leaving me like this?"), with a hook to come back and finish later', why: 'he\'s leaving before they finished', rules: ['Q8c'] };
  if (away >= 2 * DAY_MS && herReplies <= 3) return { kind: 'stronger_hook', text: 'He came back after a long time and is already leaving: a warm goodbye with a stronger hook ("don\'t disappear on me again…")', why: `he was away ${awayText(away)} and is leaving quickly`, rules: ['Q8b'] };
  if (profile.tier === 'whale') return { kind: 'personal', text: 'A personal goodbye: something you remember about him, "I\'ll be thinking about you", a plan for tomorrow', why: 'a whale is leaving', rules: ['Q8d', 'Q20'] };
  return { kind: 'warm', text: `He's leaving: a warm goodbye with a hook for next time${mood === 'sad' ? ', and a little comfort' : ''}`, why: 'he says he has to go', rules: ['Q8'] };
}

/**
 * The plan for her next reply, with reasons. `herReplies` = her replies in this
 * conversation (since the last long pause), `away` = how long he was gone before
 * it (ms), `lastSexual` = the conversation before ended sexual, `byeAgain` = he
 * already said goodbye once in it, `callback` = a note of his she could bring up
 * (memory.callbackFor), `hook` = a plan of his coming up (memory.hookFor), `check` =
 * a note his latest message contradicts ({ note }), `session` = the plan for this
 * conversation (session.js: aim rapport / sell / read / win_back / get_to_know /
 * short), `rand` = chance (tests).
 * Returns { goal, goal_text, why, sell, ask, length, level, lead, tone, back,
 * opener, callback, touch, hook, check, likes, story, offer, aim, budget, rules }.
 */
function planReply({ level, voice = null, latest = [], followUp = false, sell = false, noOffer = '', waiting = null, match = null, sexting = null, profile, ids = [], card = [], herReplies = 0, gap = null, away = null, lastSexual = false, byeAgain = false, callback = null, hook = null, check = null, session = null, rand = Math.random }) {
  const said = latest.join(' ');
  const mood = level.mood;
  const p = { rules: [] };
  // the plan for this conversation (B2): selling day, rapport day… (session.js)
  const aim = session?.aim || 'read';
  p.aim = aim; p.aim_text = session?.aim_text || ''; p.aim_why = session?.why || '';
  // free talk: shorter when today's plan is to sell; no steering on a rapport or win-back day
  const limit = aim === 'sell' ? Math.max(3, Math.ceil(profile.budget.limit * 0.6)) : profile.budget.limit;
  p.budget = { used: profile.budget.used, limit };
  const noSteer = ['rapport', 'win_back', 'get_to_know'].includes(aim);
  const goal = (g, text, why, rules = []) => { p.goal = g; p.goal_text = text; p.why = why; p.rules.push(...rules); };
  const leaving = !followUp && (GOODBYE.test(said) || ids.includes('leaving_soon'));
  const back = !followUp && away >= 2 * DAY_MS && herReplies === 0;

  // 1. the goal of this reply
  if (followUp && aim === 'short') goal('follow_up', 'He went quiet, and he\'s a time waster at the bottom: no chasing; if you must write, one dry, friendly line', 'he hasn\'t answered, and he gets no follow-ups (Q19b)', ['Q6e-2', 'Q19b']);
  else if (followUp) goal('follow_up', 'He went quiet: one short, light message to get him talking again', 'he hasn\'t answered', ['Q6']);
  else if (profile.time_waster && FREE_ASK.test(said)) goal('no_freebies', 'Friendly but short: nothing for free; if anything, a small, cheap offer', 'a time waster asking for free things', ['Q19', 'Q31']);
  else if (waiting?.p?.status === 'bought' && !waiting.herAfter) goal('after_buy', 'He just bought: react to it, and keep the mood going', 'he bought her last PPV', ['Q34']);
  else if (sexting?.on && sexting.stage === 'after') goal('aftercare', 'He finished: aftercare, warm and personal', 'he says he finished', ['Q44']);
  else if (leaving) {
    const bye = goodbyeOf({ profile, waiting, sexting, away, herReplies, mood, again: byeAgain });
    goal('goodbye', bye.text, bye.why, bye.rules);
    p.bye = bye.kind;
  }
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
  else if (back) {
    // Q7: a warm welcome back plus, by chance and depending on how things were going, one of
    // a callback to his notes, picking up where they left off (never restarting dirty talk cold), a fresh opener
    const ways = [...(callback ? ['callback', 'callback'] : []), ...(lastSexual ? [] : ['pick_up']), 'fresh'];
    const way = ways[Math.floor(rand() * ways.length) % ways.length];
    const text = { callback: 'and show you remember something he told you', pick_up: 'and pick up where you two left off', fresh: 'and a fresh, light opener of your own' }[way];
    goal('welcome_back', `He's back after ${awayText(away)}: start by showing you're really happy he's back (in your own words), ${text}`, `he was away ${awayText(away)}`, ['Q7']);
    p.opener = { kind: way, why: way === 'pick_up' ? 'the last conversation wasn\'t sexual, so picking it up is fine' : lastSexual && way !== 'callback' ? 'the last conversation was sexual: never restart dirty talk cold' : 'picked by chance (Q7)' };
  }
  else if (profile.budget.used >= limit && sell && !noOffer && !profile.time_waster && !noSteer) goal('steer_to_sale', 'His free talk is used up: steer gently toward something to buy that fits him', `${profile.budget.used} of ${limit} free messages used${aim === 'sell' ? ' (shorter today: the plan is to sell)' : ''}`, ['Q26b', 'Q28']);
  else if (profile.budget.used >= limit && !noSteer) goal('wind_down', 'His free talk is used up: keep it short and warm, she has to go soon', `${profile.budget.used} of ${limit} free messages used`, ['Q28', 'Q29']);
  else if (profile.new_sub) goal('get_to_know', 'Get to know him: welcome him, react to what he says', 'a new subscriber', ['Q21']);
  else goal('chat', 'Keep him talking: real interest in what he said, a small story of hers, or a new topic', 'small talk', ['Q5', 'Q5b']);

  // 2. selling: may a PPV go with this reply?
  const noSell = {
    comfort: 'he\'s sad: comfort first (Q24)', reassure: 'he\'s suspicious: no selling unless he asks (Q24c)', calm: 'he\'s annoyed (Q1)', ease_off: 'he\'s slowing down',
    aftercare: 'aftercare first (Q44)', point_to_ppv: 'her last PPV is still unopened', answer_ppv: 'her last PPV is still unopened',
    welcome_back: 'he just came back: welcome him first (Q7)',
    goodbye: p.bye === 'mid_sexting' ? null : 'he\'s leaving: no new PPV now (Q8)',
  }[p.goal];
  // a time waster: short replies (Q19); one at the bottom: shorter still (Q19b)
  if (aim === 'short' && !['offer', 'lead_story'].includes(p.goal)) p.short = 'a time waster at the bottom: friendly, short, nothing for free (Q19b)';
  else if (profile.time_waster && !['offer', 'lead_story'].includes(p.goal)) p.short = 'he\'s a time waster: friendly but short (Q19)';
  p.sell = !sell ? { allowed: false, why: 'selling is off' } : noOffer ? { allowed: false, why: noOffer } : noSell ? { allowed: false, why: noSell }
    : { allowed: true, why: ['offer', 'steer_to_sale', 'lead_story', 'after_buy'].includes(p.goal) ? 'a PPV fits now, if it fits the story' : aim === 'rapport' ? 'only if he asks or leads there himself: today is about rapport' : 'allowed, if it really fits' };
  // what to offer: what he asked for, or the next step of her sexting set (after 2–4 messages of story: Q41)
  p.offer = null;
  if (p.sell.allowed) {
    if (match?.full.length) p.offer = { items: match.full.slice(0, 3), why: `he asked for ${match.wants.join(' + ')}` };
    else if (sexting?.next && (gap == null || gap >= 2)) p.offer = { next: sexting.next, why: `the next step of her set${gap != null ? ` (${gap} of her messages since the last PPV)` : ''}` };
    if (profile.avg_price) p.price_hint = `he usually pays about $${profile.avg_price}: stay close to that, slightly above (Q23)`;
  }

  // a note his latest message contradicts (Q14): she checks with him, in a calm moment only
  p.check = check && ['chat', 'get_to_know', 'welcome_back', 'wind_down', 'steer_to_sale'].includes(p.goal)
    ? { note: check.note, why: 'what he just said doesn\'t fit what she remembers (Q14)' } : null;

  // 3. questions
  const noAskGoal = {
    lead_story: 'she leads the story instead', tease: 'he said what he wants: play along', offer: 'he asked: say yes', point_to_ppv: 'no question, just point him to it',
    goodbye: ['keep_ppv', 'mid_sexting'].includes(p.bye) ? null : 'he\'s leaving: no question to hold him',
  }[p.goal];
  p.ask = p.check ? { allowed: true, why: 'the one question: check what she remembers (Q14)' }
    : voice?.noQuestion ? { allowed: false, why: voice.noQuestion } : noAskGoal ? { allowed: false, why: noAskGoal } : { allowed: true, why: 'one at most (Q5)' };

  // 4. length: mirror his (Q4), never a bare one-liner; sexting gets room for a story move
  const n = words(said);
  const roomy = p.goal === 'lead_story' || p.goal === 'welcome_back' || ['personal', 'stronger_hook'].includes(p.bye);
  const target = followUp || p.short ? 'short' : roomy ? 'medium' : p.goal === 'goodbye' ? 'short' : n <= 6 ? 'short' : n <= 25 ? 'medium' : 'long';
  p.length = {
    target,
    why: followUp ? 'a light nudge' : p.short || (p.goal === 'lead_story' ? 'room for a story move' : p.goal === 'welcome_back' ? 'a welcome back plus one thing more'
      : p.goal === 'goodbye' ? (roomy ? 'a goodbye with a little more to it' : 'he\'s leaving: keep it short') : `he wrote ${n} word${n === 1 ? '' : 's'}: mirror him (Q4)`),
  };
  p.length.text = { short: 'short: one message, about 5–15 words, but not a bare one-word reply', medium: 'one or two short messages', long: 'two or three messages, with some substance' }[target];

  // 5. how far she may go, and whether she leads (decided by the warm-up rules); close
  //    fans get a little flirting even in small talk (Q16)
  p.level = { max: level.max, word: LEVEL_WORD[level.max] };
  const close = profile.closeness;
  if (level.max < 1 && !level.pulled_back && ['flirty', 'intimate', 'girlfriend'].includes(close)
    && ['chat', 'welcome_back', 'follow_up', 'wind_down', 'steer_to_sale', 'goodbye', 'get_to_know'].includes(p.goal)) {
    p.level = { max: 1, word: LEVEL_WORD[1], why: `you two are ${close}: a little flirting fits even in small talk (Q16)` };
  }
  p.lead = !!level.lead && level.his >= 2;

  // her tone, from how close they are (Q16); softer when he's sad, doubtful or annoyed
  const careful = ['comfort', 'reassure', 'calm', 'ease_off'].includes(p.goal);
  p.tone = careful ? (['intimate', 'girlfriend'].includes(close) ? 'caring and personal: you know him well' : 'kind and calm')
    : profile.close?.tone || TONE[close] || '';
  if (back && p.goal !== 'welcome_back') p.back = awayText(away);

  // 6. a note of his she brings up herself (Q9–Q11): at the start of a conversation, when
  //    he comes back, or in a quiet moment; at most once every few days (memory.callbackFor)
  p.callback = null;
  if (callback && !p.check) {
    if (p.goal === 'welcome_back' && p.opener?.kind === 'callback') p.callback = { ...callback, why: `he's back: show you remember him (Q7); ${callback.why}` };
    else if (['chat', 'get_to_know', 'follow_up'].includes(p.goal)) {
      const quiet = ids.includes('low_effort') || ids.includes('fan_going_cold');
      if (herReplies === 0 || p.goal === 'follow_up' || quiet) {
        p.callback = { ...callback, why: `${p.goal === 'follow_up' ? 'he went quiet' : quiet ? 'a quiet moment' : 'the start of a conversation'}: ${callback.why}` };
      }
    }
  }
  // one small extra touch (B5): he's leaving while the reply has another job, or a note of his in passing
  p.touch = null;
  if (leaving && !['goodbye', 'follow_up'].includes(p.goal)) p.touch = { kind: 'goodbye', text: 'he\'s leaving: say goodbye too, warm, with a hook for next time', why: 'he said he has to go (B5)' };
  else if (callback && !p.callback && !p.check && ['comfort', 'after_buy', 'calm', 'ease_off', 'wind_down', 'steer_to_sale'].includes(p.goal) && herReplies <= 2) {
    p.touch = { kind: 'callback', note: callback.note, text: `mention "${callback.note}" in passing (${callback.ask})`, why: `a small personal touch (B5); ${callback.why}` };
  }
  // a hook for next time when he leaves: a plan of his coming up (Q8)
  p.hook = p.goal === 'goodbye' && hook && p.bye !== 'short' ? hook : null;
  // what he likes, for selling and sexting only (Q11)
  p.likes = ['tease', 'lead_story', 'offer', 'steer_to_sale'].includes(p.goal) ? likesFor(card) : [];

  // 7. the story move, when they sext
  p.story = sexting?.on && sexting.moves?.moves?.length ? { move: sexting.moves.moves[0], why: `the next move for ${sexting.moves.where}` } : null;
  p.rules = [...new Set(p.rules)];
  return p;
}

/** The plan as the writer reads it. */
function planText(p) {
  const lines = [`Goal: ${p.goal_text}.`];
  if (p.aim_text) lines.push(`Today's plan for him: ${p.aim_text}.`);
  if (p.touch) lines.push(`Also, in passing: ${p.touch.text}.`);
  if (p.back) lines.push(`He's back after ${p.back}: let him feel you're glad he's back.`);
  if (p.tone) lines.push(`Tone: ${p.tone}.`);
  lines.push(`Length: ${p.length.text}.`);
  lines.push(p.check ? 'Questions: just the one below.' : p.ask.allowed ? 'Questions: one at most, and only if it helps.' : `Questions: none this time (${p.ask.why}).`);
  if (p.check) lines.push(`Check with him: what he just said doesn't fit what you remember ("${p.check.note}"). Ask lightly, like a real person would ("wait, I thought you said…"); no dates, and believe what he says now.`);
  if (p.callback) lines.push(`Show you remember him: bring up "${p.callback.note}" (${p.callback.ask}); naturally, no dates, don't quote it.`);
  if (p.hook) lines.push(`A hook for next time: "${p.hook.note}" is ${p.hook.when}; like "tell me how it goes".`);
  if (p.likes?.length) lines.push(`What he likes (use it if it fits): ${p.likes.join('; ')}.`);
  if (p.level.why) lines.push(`Flirting: a little is fine here (${p.level.why}).`);
  if (p.story) lines.push(`Story move: "${p.story.move}" (or one like it).`);
  if (!p.sell.allowed) lines.push(`PPV: none with this reply (${p.sell.why}). Don't promise one either.`);
  else if (p.offer?.items) lines.push(`PPV: he asked for it, so offer one of these if it fits: ${p.offer.items.map(it => `[c${it.id}] "${it.title}"`).join(', ')}.`);
  else if (p.offer?.next) lines.push(`PPV: ${p.offer.next}`);
  if (p.price_hint) lines.push(`Price: ${p.price_hint}.`);
  return lines;
}

module.exports = { fanProfile, planReply, planText, goodbyeOf, TIER_LABEL, BUDGET, GOODBYE };
