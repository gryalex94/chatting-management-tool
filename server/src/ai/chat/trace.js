/**
 * The decision map of one reply (Practice): every step the engine took, what it
 * looked at, what it decided and why, in plain words. utils/aiChat.js builds it
 * while it works; the practice room shows it next to the chat.
 * A step: { id, title, status, result, why, tags, details: [{ label, value }], quotes }
 *  - status: ok (passed), warn (turned down or a doubt), stop (stopped), info, decision
 *  - quotes: message texts (drafts), shown as they were written
 * Pure (no database, no network).
 */
const { ago, planWhen, awayText } = require('./memory');

const LEVEL_WORD = ['friendly', 'flirty', 'suggestive', 'explicit'];
const KIND_WORD = { about: 'about him', likes: 'he likes', plan: 'his plan', avoid: 'never bring up', promise: 'she promised', her: 'she told him' };
// when a note was said, or when his plan happens
const noteWhen = (f, now, timeZone) => {
  if (f.practice) return ' (learned in this practice chat)';
  const w = f.kind === 'plan' && f.on ? planWhen(f.on, now, timeZone) : null;
  if (w) return ` (${w.text})`;
  return f.said_at ? ` (${ago(f.said_at, now)})` : '';
};
const clean = (s) => String(s ?? '').trim();
const step = (id, title, { status = 'info', result = '', why = '', tags = [], details = [], quotes = [] } = {}) => ({
  id, title, status, result, why, tags, details: details.filter(d => d && clean(d.value)), quotes: quotes.filter(Boolean),
});
const money = (n) => `$${Math.round(Number(n) || 0)}`;
const day = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
// "medium" from her heat setting (the first level named)
const heatKind = (heat) => /\b(mild|medium|hot)\b/i.exec(String(heat || ''))?.[1]?.toLowerCase() || 'medium';

/** 1. The safety screen on his latest message(s). */
function safetyStep(screen) {
  if (!screen) return step('safety', 'Safety screen', { result: 'Nothing to screen: she writes first' });
  const stopped = screen.action === 'stop' || screen.action === 'handover';
  return step('safety', 'Safety screen', {
    status: stopped ? 'stop' : screen.review ? 'warn' : 'ok',
    result: stopped ? (screen.action === 'stop' ? 'Stopped: no AI saw his message' : 'A person takes over')
      : screen.notes.length ? `Passed, with ${screen.notes.length} note${screen.notes.length === 1 ? '' : 's'} for her` : 'Passed: nothing flagged',
    why: [...(screen.reasons || [])].join(' '),
    tags: ['House rules', ...(screen.review ? ['Claude'] : [])],
    details: [
      ...(screen.review ? [{ label: 'Claude looked first', value: `${screen.review.stop ? 'Stop' : 'Fine'}: ${screen.review.reason}` }] : []),
      ...(screen.notes || []).map(n => ({ label: 'Note for her', value: n })),
    ],
  });
}

/** 2. Who he is: his tier and flags (plan.fanProfile), a made-up fan's type, or a real fan's numbers and notes. */
function himStep({ real = false, fan = {}, type = null, money: m = null, card = [], story = '', long = false, profile = null, bond = null, state = null, now = new Date(), timeZone = 'America/New_York' }) {
  const bits = [];
  if (profile) bits.push(profile.tier_label);
  if (m?.standing?.label) bits.push(m.standing.label);
  if (m) bits.push(m.spent > 0 ? `${money(m.spent)} spent` : 'nothing spent');
  if (m?.last_purchase) bits.push(`last bought ${day(m.last_purchase)}`);
  const kinds = {};
  for (const f of card) kinds[f.kind] = (kinds[f.kind] || 0) + 1;
  const flags = profile ? [profile.new_sub ? 'new subscriber' : null, profile.time_waster ? 'time waster' : null, profile.suspicious ? 'suspicious' : null].filter(Boolean) : [];
  const close = profile?.close;
  if (close) bits.push(close.level);
  return step('him', 'Who he is', {
    result: bits.filter(Boolean).join(' · ') || (real ? 'Nothing known about him' : 'Not set'),
    why: type?.approach || '',
    tags: [profile ? 'Q16 · Q17' : null, type ? 'Fan type' : null, m ? 'Fanvue\'s numbers' : null, card.length ? 'Fan memory' : null].filter(Boolean),
    details: [
      profile ? { label: 'Tier', value: `${profile.tier_label}: ${profile.tier_why}` } : null,
      flags.length ? { label: 'Marked', value: flags.join(', ') } : null,
      state ? { label: 'Phase', value: `${state.phase}: ${state.phase_why}` } : null,
      state?.hours?.text ? { label: 'When he\'s around', value: state.hours.text } : null,
      state?.strikes30 ? { label: 'Failed sales', value: `${state.strikes7} this week, ${state.strikes30} this month (a PPV sent, not bought)${state.faded ? ': at the bottom (Q19b)' : ''}` } : null,
      close ? {
        label: 'Closeness',
        value: close.what_if ? `${close.level} (what if)` : `${close.level}, ${close.score} of 10 points: ${close.signals.map(s => `${s.label.toLowerCase()} ${s.points > 0 ? '+' : ''}${s.points} (${s.why})`).join(' · ')}`,
      } : null,
      bond?.warmth ? { label: 'How he treats her', value: `${bond.warmth}${bond.why ? `: ${bond.why}` : ''} (his memory's read${bond.at ? `, ${ago(bond.at, now)}` : ''})` } : null,
      profile ? { label: 'Free talk budget', value: `${profile.budget.used} of ${profile.budget.limit} of her small-talk messages in this conversation, since his last purchase (Q26b)` } : null,
      profile?.avg_price ? { label: 'Usually pays', value: `about $${profile.avg_price} a PPV` } : null,
      type ? { label: 'Practice type', value: type.label } : null,
      fan.name ? { label: 'Name', value: fan.name } : null,
      m?.standing?.text ? { label: 'Standing', value: m.standing.text } : null,
      m && (m.paid_messages || m.tips) ? { label: 'Buys', value: `${m.paid_messages || 0} paid message${m.paid_messages === 1 ? '' : 's'}, ${m.tips || 0} tip${m.tips === 1 ? '' : 's'}` } : null,
      card.length ? { label: 'Notes about him', value: `${card.length} (${Object.entries(kinds).map(([k, n]) => `${n} ${k}`).join(', ')})` } : null,
      ...card.slice(-10).map(f => ({ label: `· ${KIND_WORD[f.kind] || f.kind}`, value: `${f.text}${noteWhen(f, now, timeZone)}` })),
      long && clean(story) ? { label: 'Story so far', value: clean(story).slice(0, 300) } : null,
    ],
  });
}

/** 2b. This conversation: the plan for it (session.js), the sticky mood, no-selling, how the last one went. */
function sessionStep({ session = null, state = null, herHere = 0 }) {
  if (!session) return null;
  const aimWord = (a) => String(a || '').replace(/_/g, ' ');
  return step('session', 'This conversation', {
    status: 'decision',
    result: session.aim_text,
    why: `Because ${session.why}.`,
    tags: ['B2', 'B3', ...(session.mood ? ['B4'] : []), ...(state?.faded ? ['Q19b'] : [])],
    details: [
      { label: 'PPV allowed from', value: `her message ${session.warm_up} in this conversation (they're ${session.closeness}); ${herHere} so far${herHere >= session.warm_up ? ': allowed when it fits' : ''}` },
      session.mood_day ? { label: 'Her mood today', value: `${session.mood_day} (the same for every fan today: A7)` } : null,
      session.event ? { label: 'A moment of hers', value: `${session.event.kind.replace(/_/g, ' ')}: ${session.event.text}${session.event.done ? ' (used)' : ', when small talk allows (A2–A5)'}` } : { label: 'A moment of hers', value: 'none this conversation (chance: every other one when close, every third when friendly or flirty)' },
      session.mood ? { label: 'Mood that sticks', value: `${session.mood}, until he sounds lighter twice in a row (${session.lighter} of 2 so far)` } : null,
      session.no_sell ? { label: 'No selling', value: session.no_sell } : null,
      ...(session.changes || []).map(c => ({ label: 'Plan changed', value: `${aimWord(c.aim)}: ${c.why}` })),
      state?.last ? { label: 'Last conversation', value: `${state.last.ended ? `${day(state.last.ended)}: ` : ''}${state.last.text}` } : null,
      state ? { label: 'Conversations before', value: String(state.conversations) } : null,
    ],
  });
}

/** 3. The moment: the planner's read of him, and where the chat is. */
function momentStep({ level, situations = [], herCount = 0, warmUp = 6, phase = null, waiting = null, followUp = false, away = null, herHere = null, clash = null }) {
  const phaseWord = { offer: 'time to offer', waiting: 'a PPV is waiting for him', after_buy: 'after a buy', no_buy: 'after a no' }[phase];
  return step('moment', 'The moment', {
    result: followUp ? 'He has gone quiet: she writes first'
      : `Mood: ${level.mood} · his last message: ${LEVEL_WORD[level.his]}${level.pulled_back ? ' · he\'s slowing down' : ''}`,
    tags: ['Planner (Ministral 8B)'],
    details: [
      { label: 'Situations', value: situations.join(' · ') || 'none picked' },
      herHere != null ? { label: 'This conversation', value: `${herHere} of her replies so far${away ? `; he was away ${awayText(away)} before it` : ''}` } : null,
      clash ? { label: 'Doesn\'t fit his notes', value: `his latest message contradicts "${clash}"` } : null,
      { label: 'Warm-up', value: herCount >= warmUp ? `done (${herCount} of her messages this conversation, ${warmUp} needed)` : `${herCount} of ${warmUp} of her messages this conversation` },
      level.since ? { label: 'Since he got sexual', value: `${level.since} of her replies` } : null,
      phaseWord ? { label: 'Selling', value: phaseWord } : null,
      waiting ? { label: 'Her last PPV', value: `"${waiting.p.title}": ${waiting.p.status === 'pending' ? 'not opened yet' : waiting.p.status.replace('_', ' ')}${waiting.open ? ', no new PPV until he reacts' : ''}` } : null,
    ],
  });
}

/** 4. The plan: what this reply should do, each decision with its reason (plan.planReply). */
function planStep({ level, heat = '', voice = null, sell = false, noOffer = '', notes = [], storyOn = false, plan = null }) {
  const kind = heatKind(heat);
  if (plan) {
    const how = level.pulled_back ? 'he\'s slowing down, so she follows him'
      : level.lead ? (level.warm ? 'past the warm-up: she may lead, one step above him at most' : `he has been sexual for ${level.since} of her replies: she leads now`)
        : level.match ? 'he got sexual: she matches him, not above' : 'warm-up: she follows him, teasing at most';
    return step('plan', 'The plan', {
      status: 'decision',
      result: plan.goal_text,
      why: `Because ${plan.why}.`,
      tags: plan.rules,
      details: [
        { label: 'PPV', value: plan.sell.allowed ? (plan.offer?.items ? `offer one he asked for: ${plan.offer.items.map(it => `"${it.title}"`).join(', ')}` : plan.offer?.next ? plan.offer.next : `allowed: ${plan.sell.why}`) : `none: ${plan.sell.why}` },
        plan.price_hint ? { label: 'Price', value: plan.price_hint } : null,
        { label: 'Questions', value: plan.ask.allowed ? plan.ask.why : `none: ${plan.ask.why}` },
        { label: 'Length', value: `${plan.length.text} (${plan.length.why})` },
        plan.touch ? { label: 'Also, in passing', value: `${plan.touch.text}: ${plan.touch.why}` } : null,
        plan.event ? { label: 'A moment of hers', value: `${plan.event.kind.replace(/_/g, ' ')}: ${plan.event.text}` } : null,
        plan.budget ? { label: 'Free talk', value: `${plan.budget.used} of ${plan.budget.limit} small-talk messages${plan.aim === 'sell' ? ' (shorter today: the plan is to sell)' : ''}` } : null,
        // what memory brings to this reply, near the top
        plan.check ? { label: 'Check with him', value: `"${plan.check.note}": ${plan.check.why}` } : null,
        plan.callback ? { label: 'From his notes', value: `"${plan.callback.note}" (${plan.callback.ask}): ${plan.callback.why}` } : null,
        plan.hook ? { label: 'Hook for next time', value: `"${plan.hook.note}" (${plan.hook.when})` } : null,
        plan.back ? { label: 'Back after', value: `${plan.back}: she shows she's glad he's back (Q7)` } : null,
        plan.opener ? { label: 'Welcome back with', value: `${{ callback: 'something from his notes', pick_up: 'where they left off', fresh: 'a fresh opener' }[plan.opener.kind]}: ${plan.opener.why}` } : null,
        plan.tone ? { label: 'Tone', value: `${plan.tone} (from how close they are: Q16)` } : null,
        { label: 'How far she may go', value: `${plan.level.word}: ${how}. Her heat setting: ${kind}${kind === 'medium' ? ' (explicit only when he is)' : ''}.` },
        plan.level.why ? { label: 'Flirting', value: plan.level.why } : null,
        { label: 'Leads', value: plan.lead ? 'yes: she says what she does next' : 'no: she follows him' },
        plan.likes?.length ? { label: 'What he likes', value: plan.likes.join('; ') } : null,
        plan.story ? { label: 'Story move', value: `"${plan.story.move}"` } : null,
        voice?.openers?.length ? { label: 'Don\'t start like', value: voice.openers.map(o => `"${o}…"`).join(', ') } : null,
        ...notes.map(n => ({ label: 'Note for her', value: n })),
      ],
    });
  }
  const how = level.pulled_back ? 'he\'s slowing down, so she follows him'
    : level.lead ? (level.warm ? 'past the warm-up: she may lead, one step above him at most' : `he has been sexual for ${level.since} of her replies: she leads now`)
      : level.match ? 'he got sexual: she matches him, not above'
        : 'warm-up: she follows him, teasing at most';
  const summary = [
    level.lead && level.his >= 2 ? 'Lead' : 'Follow him',
    `up to ${LEVEL_WORD[level.max]}`,
    voice?.noQuestion ? 'no question' : 'one question at most',
    !sell ? null : noOffer ? 'no PPV now' : 'a PPV may go',
    storyOn ? 'sexting story' : null,
  ].filter(Boolean).join(' · ');
  return step('plan', 'The plan', {
    status: 'decision',
    result: summary,
    tags: ['Warm-up rule', 'Question rule', ...(sell ? ['Selling rules'] : [])],
    details: [
      { label: 'How far she may go', value: `${LEVEL_WORD[level.max]}: ${how}. Her heat setting: ${kind}${kind === 'medium' ? ' (explicit only when he is)' : ''}.` },
      { label: 'Questions', value: voice?.noQuestion ? `none: ${voice.noQuestion}` : 'one at most' },
      sell ? { label: 'PPV now', value: noOffer ? `no: ${noOffer}` : 'allowed, if it fits' } : { label: 'PPV now', value: 'selling is off' },
      voice?.openers?.length ? { label: 'Don\'t start like', value: voice.openers.map(o => `"${o}…"`).join(', ') } : null,
      voice?.names?.length ? { label: 'His name', value: `${voice.names.join(', ')}: left out if she used it lately` } : null,
      ...notes.map(n => ({ label: 'Note for her', value: n })),
    ],
  });
}

/** 5. Her sexting story, when they sext. */
function storyStep(s) {
  if (!s?.on) return null;
  const sc = s.scene;
  return step('story', 'Sexting story', {
    status: 'decision',
    result: `${{ warming: 'Warming up', building: 'Building up', peak: 'The peak', after: 'Afterwards' }[s.stage] || s.stage}${s.moves?.where ? ` · ${s.moves.where}` : ''}`,
    why: s.hint || '',
    tags: ['Story moves', '35k sexting'],
    details: [
      { label: 'Scene so far', value: sc ? [sc.where, sc.wearing, sc.done?.length ? `so far: ${sc.done.join(', ')}` : '', sc.him ? `he: ${sc.him}` : ''].filter(Boolean).join(' · ') : 'none yet: she sets one' },
      s.seed && !sc ? { label: 'Where it starts', value: s.seed } : null,
      s.next ? { label: 'Next PPV in her set', value: s.next } : null,
      s.moves?.moves?.length ? { label: 'Story moves offered', value: s.moves.moves.map(m => `"${m}"`).join(' · ') } : null,
      s.moves?.twist ? { label: 'A twist offered', value: `"${s.moves.twist}"` } : null,
      s.ideas?.length ? { label: 'Moments from the 35k', value: s.ideas.map(x => x.moment).join(' · ') } : null,
    ],
  });
}

/** 6. What the writer read besides the chat: examples, guides, her content. */
function briefingStep({ library = [], sales = [], situations = [], contentCount = 0, selling = false, chatCount = 0, long = false }) {
  const outcome = { bought_fast: 'bought fast', bought: 'bought', not_bought: 'didn\'t buy', bought_next: 'bought the next', next_not_bought: 'didn\'t buy the next', sold: 'sold', kept_him: 'kept him', lost: 'lost him', no_next_offer: 'after a buy' };
  return step('briefing', 'Briefing', {
    result: [`${long ? 'the last' : 'the whole chat,'} ${chatCount} message${chatCount === 1 ? '' : 's'}`, library.length ? `${library.length} examples from the 35k` : null,
      sales.length ? `${sales.length} selling examples` : null, selling ? `her ${contentCount} content items` : null].filter(Boolean).join(' · '),
    tags: ['House rules', 'Chat guide', '35k examples', ...(situations.length ? ['Playbook'] : [])],
    details: [
      ...library.map(x => ({ label: 'Example', value: `${clean(x.moment)} → "${x.reply.join(' / ')}"` })),
      ...sales.map(x => ({ label: `Selling (${outcome[x.outcome] || x.outcome})`, value: `${clean(x.moment)} → "${x.reply.join(' / ')}"` })),
      situations.length ? { label: 'Playbook guides', value: situations.join(' · ') } : null,
    ],
  });
}

/** 7. Your marks from Practice that fit this moment (wording ones go to the writer, all to Claude's check). */
function lessonsStep(lessons = []) {
  if (!lessons.length) return null;
  return step('lessons', 'Your notes that applied', {
    status: 'decision',
    result: `${lessons.length} of your marks fit this moment`,
    tags: ['Your marks'],
    details: lessons.map(l => ({ label: l.kind === 'wording' ? 'Bad wording' : 'Wrong call', value: `${l.note}${l.better ? ` → better: ${l.better}` : ''}` })),
  });
}

/** Claude's watch-only check of the reply (it never blocks or rewrites). */
const POINT_LABEL = { answers_him: 'Answers him', fits_moment: 'Fits the moment', notes_facts: 'Notes and facts', selling: 'Selling call', lessons: 'Your notes' };
function coachStep(label, coach) {
  const weak = Object.values(coach.points || {}).filter(p => p?.verdict === 'weak').length;
  return step('coach', `${label}: Claude's check (watch only)`, {
    status: coach.overall === 'good' ? 'ok' : coach.overall === 'declined' ? 'info' : coach.overall === 'weak' || weak ? 'warn' : 'ok',
    result: `${{ good: 'Good', okay: 'Okay', weak: 'Weak', declined: 'Not checked' }[coach.overall] || coach.overall}: ${coach.summary}`,
    tags: ['Claude', 'Q45'],
    details: Object.entries(coach.points || {}).filter(([, p]) => p && p.verdict !== 'n/a').map(([k, p]) => ({ label: `${POINT_LABEL[k] || k}${p.verdict === 'weak' ? ' (weak)' : ''}`, value: p.note })),
  });
}

/**
 * The writer's drafts and the result. `drafts` = [{ raw, final, ppv, offer, problems,
 * style, review, verdict }] in order; `pick` = the draft shown.
 */
function writerSteps({ label, drafts = [], pick = -1, status, ppv = null, scene = null, learned = [], aboutMe = [], typo = null, notes = [] }) {
  const out = drafts.map((d, i) => {
    const changed = d.raw.join('\n') !== d.final.join('\n');
    const turned = d.verdict === 'block';
    return step(`draft${i + 1}`, `${label}: draft ${i + 1}${i === pick ? ' (shown)' : ''}`, {
      status: turned ? 'warn' : d.style.length && i !== pick ? 'warn' : i === pick ? 'ok' : 'info',
      result: turned ? 'Turned down: it broke a rule' : d.style.length ? (i === pick ? 'Kept, with notes on how it sounds' : 'Rewritten: it sounded off') : 'Passed every check',
      tags: [turned ? 'Rules' : null, d.style.length ? 'Voice checks' : null, d.review ? 'Claude' : null, changed ? 'Tidied in code' : null].filter(Boolean),
      quotes: d.final,
      details: [
        changed ? { label: 'Code changed it from', value: d.raw.map(t => `"${t}"`).join(' / ') } : null,
        d.ppv ? { label: 'PPV', value: d.offer ? `"${d.offer}"` : d.ppv } : null,
        ...d.problems.map(p => ({ label: 'Rule', value: p })),
        ...d.style.map(p => ({ label: 'Sounds off', value: p })),
        d.review ? { label: 'Claude', value: d.review.ok ? 'fine' : d.review.declined ? 'declined to look' : `not fine: ${d.review.problems.join(' ')}` } : null,
      ],
    });
  });
  out.push(step('result', `${label}: the result`, {
    status: status === 'ok' ? 'ok' : status === 'blocked' ? 'stop' : 'warn',
    result: { ok: 'Shown: passed the checks', check: 'Shown: a person should look', blocked: 'Broke a rule after every rewrite', handover: 'Hands over to a person', error: 'Failed' }[status] || status,
    details: [
      ppv ? { label: 'PPV attached', value: `${ppv.title} · $${ppv.price} · ${ppv.what}` } : null,
      scene ? { label: 'Scene after', value: [scene.where, scene.wearing, scene.done?.length ? `so far: ${scene.done.join(', ')}` : '', scene.stage].filter(Boolean).join(' · ') } : null,
      learned.length ? { label: 'Would remember', value: learned.join(' · ') } : null,
      aboutMe.length ? { label: 'Said about herself', value: `${aboutMe.join(' · ')} (kept for this chat, so she stays consistent)` } : null,
      typo ? { label: 'A typo on purpose', value: `"${typo.word}"${typo.fixed ? ', fixed in a second message' : ', left as is'} (A8: about 1 message in 15, fixed half the time)` } : null,
      ...notes.map(n => ({ label: 'Note', value: n })),
    ],
  }));
  return out;
}

module.exports = { safetyStep, himStep, sessionStep, momentStep, planStep, storyStep, briefingStep, lessonsStep, coachStep, writerSteps, heatKind };
