/**
 * The meters of a conversation (engine v2, step 3). A few gauges, 0–100, kept in the session
 * and moved each turn by the numbers (code: his tier, buys, dryness, what he asked for) and by
 * the reading (Claude: what he is doing, what is new, how sure). Every soft move her reply
 * could make is then scored against them, and the best one wins; the hard rules (no PPV before
 * a new subscriber's direct ask, one attempt a day, the pause after a big spend, no selling to
 * a sad man) stay as vetoes in plan.js. So the decision floats with the conversation instead of
 * firing on the first rule that matches, and the decision map shows every meter and every score.
 * Pure: no database, no network.
 *
 *  - heat: how sexual he is right now (0 small talk … 100 explicit and in it)
 *  - mood: how he feels (50 even; under 40 he needs care; over 65 he is having fun)
 *  - rapport: how connected the two are (from how close they are, moved by this conversation)
 *  - readiness: how ready he is to pay right now (his tier, him asking, a buy, a no, a pause)
 *  - doubt: whether he doubts she is real (from his words; fades fast)
 *  - engagement: how much he puts in (length, questions, photos, tips; one-word replies drain it)
 *  - surprise: how much his latest message changed the picture (from the reading; per message)
 */
const GAUGES = ['heat', 'mood', 'rapport', 'readiness', 'doubt', 'engagement', 'surprise'];
const clamp = (v) => Math.max(0, Math.min(100, Math.round(Number(v) || 0)));
const RAPPORT_START = { new: 15, friendly: 40, flirty: 55, intimate: 70, girlfriend: 85 };
const READY_BASE = { new: 10, none: 15, small: 35, spender: 55, whale: 70, tw: 5 };
const MOOD_TARGET = { sad: 15, annoyed: 25, suspicious: 40, tired: 40, brief: 45, chatty: 60, curious: 62, caring: 65, joking: 70, flirty: 75, romantic: 75, horny: 80 };

/** The gauges when a conversation starts: from who he is. */
function startGauges({ profile }) {
  return {
    heat: 0, mood: 50, rapport: RAPPORT_START[profile?.closeness] ?? 20,
    readiness: READY_BASE[profile?.tier] ?? 15, doubt: 0, engagement: 60, surprise: 0,
  };
}

/** A saved set of gauges, checked. */
function readGauges(g) {
  if (!g || typeof g !== 'object') return null;
  const out = {};
  for (const k of GAUGES) { if (typeof g[k] !== 'number' || Number.isNaN(g[k])) return null; out[k] = clamp(g[k]); }
  return out;
}

/**
 * Move the gauges for this turn. `prev` = the session's gauges (startGauges when none),
 * `ctx` = { level, reading, profile, session, dry, asks, tip, nWords, question, media, cools,
 * suspicious, broke, objection, bought, notBought, followUp, leaving, sharing }.
 * Returns { gauges, changes: [{ gauge, from, to, why }] }: every move with its reason.
 */
function updateGauges(prev, ctx = {}) {
  const g = { ...(readGauges(prev) || startGauges({ profile: ctx.profile })) };
  const changes = [];
  const move = (k, to, why) => { const v = clamp(to); if (v !== g[k]) { changes.push({ gauge: k, from: g[k], to: v, why }); g[k] = v; } };
  const { level = {}, reading = null, profile = {}, session = null } = ctx;
  const his = Number(level.his) || 0;
  const mood = level.mood || 'chatty';
  const r = reading || {};
  if (ctx.followUp) {
    // she writes first: nothing new from him, his heat and surprise cool
    move('heat', g.heat * 0.5, 'she writes first: his heat cools');
    move('surprise', 0, 'nothing new from him');
    return { gauges: g, changes };
  }
  // heat: toward how sexual his words are, with some memory; the flow keeps it; cooling drops it
  const heatTarget = his * 33;
  if (ctx.cools || level.pulled_back) move('heat', g.heat * 0.4, ctx.cools ? 'he cools it' : 'he pulled back');
  else if (session?.hot && his >= 2) move('heat', Math.max(60, g.heat + 0.6 * (heatTarget - g.heat)), 'the sexting flow is on');
  else move('heat', g.heat + 0.6 * (heatTarget - g.heat), `his message is ${['friendly', 'flirty', 'suggestive', 'explicit'][his]}`);
  // mood: toward the read of it; a heavy mood that stuck holds it down
  const moodTarget = MOOD_TARGET[mood] ?? 55;
  move('mood', g.mood + 0.5 * (moodTarget - g.mood), `he seems ${mood}`);
  if (session?.mood) move('mood', Math.min(g.mood, 30), `the ${session.mood} mood sticks (B4)`);
  // rapport: real exchanges build it, opening up builds it more, dryness and annoyance cost it
  const n = Number(ctx.nWords) || 0;
  if (ctx.sharing || ['sharing', 'venting'].includes(r.doing)) move('rapport', g.rapport + 8, 'he opens up');
  else if (n >= 4 && !ctx.dry) move('rapport', g.rapport + 4, 'a real exchange');
  if (ctx.question) move('rapport', g.rapport + 3, 'he asks about her');
  if (ctx.dry) move('rapport', g.rapport - 3 * ctx.dry, `${ctx.dry} one-word repl${ctx.dry === 1 ? 'y' : 'ies'} in a row`);
  if (mood === 'annoyed' && session?.mood === 'annoyed') move('rapport', g.rapport - 10, 'he is annoyed');
  if (ctx.bought) move('rapport', g.rapport + 10, 'he bought');
  // readiness: his tier is the base it drifts back to; asking, a buy and heat raise it; a no, a price
  // objection, being broke, a pause and a no-selling rule drop it
  const base = READY_BASE[profile.tier] ?? 15;
  move('readiness', g.readiness + 0.2 * (base - g.readiness), `drifts back toward his tier (${profile.tier_label || profile.tier})`);
  if (ctx.asks) move('readiness', g.readiness + 35, 'he asks what she has, or for something specific');
  if (['buying', 'negotiating'].includes(r.doing) && !ctx.asks) move('readiness', g.readiness + 15, `he is ${r.doing}`);
  if (his >= 2) move('readiness', g.readiness + his * 5, 'he is in the mood');
  if (ctx.bought) move('readiness', g.readiness + 15, 'he just bought: one more at most while he is warm (A4)');
  if (ctx.notBought) move('readiness', g.readiness - 25, 'he passed on her last PPV');
  if (ctx.objection) move('readiness', g.readiness - 20, 'he says it is too much');
  if (ctx.broke) move('readiness', 0, 'he says he cannot spend now');
  if (session?.pause) move('readiness', Math.min(g.readiness, 10), 'the pause after his big spend (A7)');
  if (session?.no_sell) move('readiness', Math.min(g.readiness, 10), 'no selling this conversation (B3)');
  if (session?.cadence?.due && session?.aim === 'sell') move('readiness', g.readiness + 10, 'a planned attempt today (E5)');
  if (session?.aim === 'rapport') move('readiness', g.readiness - 10, 'a rapport day');
  // doubt: from his words; the reading's "is she a bot" counts half; it fades fast
  if (ctx.suspicious) move('doubt', 80, 'he doubts she is real');
  else if ((r.readings || []).some(x => /\b(?:bot|real|fake|scam|ai|catfish|robot|human)\b/i.test(x.what) && x.sure >= 0.4)) move('doubt', Math.max(g.doubt - 15, 50), 'the reading: he may be testing whether she is real');
  else move('doubt', g.doubt - 25, 'nothing doubtful in his message');
  // engagement: what he puts in
  if (ctx.media || ctx.tip) move('engagement', g.engagement + 15, ctx.tip ? 'he tipped' : 'he sent a photo or video');
  if (n > 0 && n <= 2) move('engagement', g.engagement - 15, 'a one- or two-word reply');
  else if (n >= 9) move('engagement', g.engagement + 10, 'a real message');
  else if (n > 0) move('engagement', g.engagement + 3, 'he keeps it going');
  if (ctx.question) move('engagement', g.engagement + 8, 'he asks something');
  if (ctx.dry >= 3) move('engagement', Math.min(g.engagement, 20), 'he has gone dry');
  if (ctx.leaving || r.doing === 'leaving') move('engagement', g.engagement - 20, 'he is leaving');
  // surprise: per message, from the reading
  // (the reader calls most messages "new": the picture changes only when it can be read more than one way,
  // when he tests or provokes, or when he opens up; a plain flirty or sexual line stays what it is)
  const readings = (r.readings || []).length;
  let surprise = (r.new ? 30 : 0) + Math.min(30, readings * 12) + (['testing', 'provoking'].includes(r.doing) ? 25 : 0) + (['sharing', 'venting'].includes(r.doing) && r.new ? 10 : 0);
  if (['sexting', 'flirting'].includes(r.doing) && readings < 2) surprise = Math.min(surprise, 30);
  if (r.odd) surprise += 30;   // a line that doesn't fit a man chatting up a girl: about other men, a non-sequitur, a provocation
  const plainJoke = r.answers === 'joke' && !r.odd && r.doing !== 'testing';
  if (plainJoke) surprise = Math.min(surprise, 10);   // a harmless joke answer to her question is plain, not a riddle
  move('surprise', surprise, surprise ? (plainJoke ? 'he answered her question with a joke: nothing to puzzle over' : r.odd ? 'an odd line for a man chatting her up' : readings >= 2 ? 'his message can be read more than one way' : r.new ? `something new: ${r.new}` : `he is ${r.doing}`) : 'nothing surprising');
  return { gauges: g, changes };
}

// The soft moves her reply can make, and the goal name each one becomes in plan.js.
const MOVES = {
  react: { goal: 'chat', text: 'React to what he said with real interest, in your own words; nothing steered' },
  curious: { goal: 'curious', text: 'React, then one real question about the new thing he said' },
  share: { goal: 'share', text: 'React, then a small real thing of yours that connects to what he said (a place, a memory, a plan of yours about it), with a person in it when it fits; no question' },
  get_to_know: { goal: 'get_to_know', text: 'Get to know him: one easy question about him' },
  flirt: { goal: 'flirt', text: 'Flirt: playful, a compliment, light teasing' },
  tease: { goal: 'tease', text: 'He got sexual: say yes playfully and tease; don\'t stall' },
  steer: { goal: 'steer_to_sale', text: 'Steer gently toward something to buy that fits him' },
  offer: { goal: 'offer', text: 'Offer the piece that fits him best, teased in her own words' },
  readiness_check: { goal: 'readiness_check', text: 'Check softly that he is ready ("are you alone?") and tease what you have; no PPV with this one' },
  comfort: { goal: 'comfort', text: 'Comfort him: no flirting, no selling' },
  reassure: { goal: 'reassure', text: 'Reassure him it is really her, warmly; no selling' },
};
const SOFT_GOALS = new Set(['chat', 'get_to_know', 'flirt', 'sexy_vibe', 'tease', 'steer_to_sale', 'readiness_check', 'curious']);

/**
 * Score every soft move against the gauges. `ctx` = { allowed: { ask, flirt, tease, sell, steer, check },
 * stage (a new subscriber's stage, or null), timeWaster, budgetShare (0–1), asks, reading, rand }.
 * Returns the moves, best first: [{ move, goal, text, score, allowed, why }].
 */
function scoreMoves(g, ctx = {}) {
  const a = ctx.allowed || {};
  const r = ctx.reading || {};
  const rand = ctx.rand || Math.random;
  const stage = ctx.stage || null;
  const inStage = (list) => !stage || list.includes(stage);
  const parts = (...xs) => xs.filter(x => x && x[1]).map(([why, v]) => ({ why, v }));
  const out = [];
  const add = (move, ok, whyNot, terms) => {
    const score = terms.reduce((s, t) => s + t.v, 0) + rand() * 8;
    const top = [...terms].filter(t => t.v > 0).sort((x, y) => y.v - x.v).slice(0, 2).map(t => t.why);
    out.push({ move, goal: MOVES[move].goal, text: MOVES[move].text, score: Math.round(score), allowed: ok, why: ok ? top.join(', ') || 'the default' : whyNot });
  };
  const tw = !!ctx.timeWaster;
  const q = ctx.questions || { share: 0.4, run: 0, n: 0 };   // her questions lately: humans ask in 35–45% of replies, rarely three in a row
  const band = (w) => ([['few questions lately: one would be good', q.n >= 4 && q.share < 0.3 ? w : 0], ['many questions lately', q.n >= 4 && q.share > 0.45 ? -w : 0], ['two questions in a row already', q.run >= 3 ? -40 : q.run >= 2 && !q.short_answer && !q.odd ? -40 : q.run >= 2 ? -10 : 0]]);
  const sexual = ['sexting', 'flirting'].includes(r.doing);
  const matching = ['match', 'playful'].includes(r.stance);
  const joke = r.answers === 'joke' && !r.odd && r.doing !== 'testing', dead = r.thread === 'dead';   // he answered her with a joke; the topic ran out
  add('react', true, '', parts(['the safe default', 35], ['something new to react to', g.surprise * 0.1], ['he puts little in', g.engagement < 40 ? 10 : 0], ['he made a joke: play along with it', joke && !['flirt', 'sexy'].includes(stage) ? 15 : 0]));
  add('curious', !!a.ask && !!r.curious && inStage(['vibe', 'flirt', 'sexy']) && !tw && !joke && !ctx.clarify, ctx.clarify ? 'he asked what you meant: explain first, no question back' : !a.ask ? 'no question this time' : joke ? 'he answered with a joke: play along, don\'t quiz it' : !r.curious ? (dead ? 'the topic ran out: nothing more to ask about it' : 'nothing she wants to ask') : tw ? 'a time waster gets no questions' : 'not at this stage',
    parts(['something new or surprising', g.surprise * 0.55], ['she barely knows him', (100 - g.rapport) * 0.15], ['he opens up', ['sharing', 'venting'].includes(r.doing) ? 15 : 0], ['he tests or provokes', ['testing', 'provoking'].includes(r.doing) ? 15 : 0], ['it can be read more than one way', (r.readings || []).length >= 2 ? 10 : 0], ['an odd line: a real girl would ask', r.odd ? 20 : 0], ['base', 15], ['the stage has a job: flirting, or the sexy vibe', ['flirt', 'sexy'].includes(stage) ? -12 : 0], ...band(15), ['he is flirting or sexting: not an interview', sexual && !r.odd ? -15 : 0], ['a sexting flow is on: don\'t interrupt it', g.heat > 60 && g.rapport > 50 ? -g.heat * 0.2 : 0]));
  add('share', inStage(['vibe', 'flirt', 'sexy']) && !tw && !ctx.hard, ctx.hard ? 'he is sharing something hard: no story of hers' : tw ? 'a time waster gets nothing of hers' : 'not at this stage',
    parts(['they are close', g.rapport * 0.25], ['he puts little in', g.engagement < 45 ? 15 : 0], ['he asked about her', r.doing === 'asking' ? 15 : 0], ['a quiet, friendly moment', g.heat < 40 && g.mood >= 45 ? 8 : 0], ['a question is off the table: tell him something instead', !a.ask && g.rapport >= 40 ? 12 : 0], ['he answered in a few words: a follow-up beats a story of hers', ctx.questions?.short_answer ? -15 : 0], ['base', 14], ['something surprising comes first', -g.surprise * 0.3], ['many questions lately: tell him something instead', q.n >= 4 && q.share > 0.45 ? 10 : 0], ['the topic ran out: bring something new of hers', dead && !['flirt', 'sexy'].includes(stage) ? 15 : 0]));
  add('get_to_know', !!a.ask && inStage(['vibe']) && !tw && !ctx.clarify, ctx.clarify ? 'he asked what you meant: explain first, no question back' : !a.ask ? 'no question this time' : tw ? 'a time waster gets no questions' : 'past the getting-to-know stage',
    parts(['she barely knows him', (100 - g.rapport) * 0.3], ['base', 20], ['the vibe stage', stage === 'vibe' ? 10 : 0], ['something surprising comes first', -g.surprise * 0.2], ['he is in a sexual mood', -g.heat * 0.3], ['a question just went out: a new-topic one now reads like an interview', q.run >= 1 ? -12 : 0], ['the topic ran out: a fresh, easy one about him', dead ? 25 : 0], ...band(12)));
  add('flirt', !!a.flirt && inStage(['flirt', 'sexy']) && !tw, !a.flirt ? 'flirting isn\'t allowed yet' : tw ? 'a time waster' : 'not at this stage',
    parts(['his heat', g.heat * 0.35], ['rapport', g.rapport * 0.25], ['his mood', g.mood * 0.1], ['the flirting stage', stage === 'flirt' ? 25 : 0], ['he is flirting', r.doing === 'flirting' ? 10 : 0], ['base', 10], ['an odd line', r.odd ? -10 : 0], ['he doubts her', -g.doubt * 0.4], ['something surprising comes first', -g.surprise * 0.2]));
  add('tease', !!a.tease && inStage(['sexy']) && !tw, !a.tease ? 'the reply may not get that sexual yet' : tw ? 'a time waster' : 'not at this stage',
    parts(['his heat', g.heat * 0.75], ['rapport', g.rapport * 0.1], ['the sexy stage', stage === 'sexy' ? 20 : 0], ['he set a sexual tone', sexual && !r.odd ? 15 : 0], ['the reading says match him', matching && !r.odd ? 10 : 0], ['he hands her the lead', ctx.invited ? 15 : 0], ['an odd line: don\'t take the bait', r.odd ? -25 : 0], ['something surprising comes first', -g.surprise * 0.35], ['he doubts her', -g.doubt * 0.5]));
  add('steer', !!a.steer && !stage, !a.steer ? 'no PPV can go now' : 'a new subscriber walks his path first',
    parts(['his readiness', g.readiness * 0.6], ['his free talk is used', (ctx.budgetShare || 0) * 25], ['his heat', g.heat * 0.1], ['a time waster: short and cheap', tw ? 15 : 0], ['something surprising comes first', -g.surprise * 0.3], ['he doubts her', -g.doubt * 0.5]));
  add('offer', !!a.sell && !stage, !a.sell ? 'no PPV can go now' : 'a new subscriber walks his path first',
    parts(['his readiness', g.readiness * 0.85], ['his heat', g.heat * 0.15], ['he asks', ctx.asks ? 25 : 0], ['the check comes first on a planned attempt (E5)', a.check && !ctx.asks ? -25 : 0], ['something surprising comes first', -g.surprise * 0.3], ['he doubts her', -g.doubt * 0.6], ['she barely knows him and he didn\'t ask', g.rapport < 25 && !ctx.asks ? -20 : 0]));
  add('readiness_check', !!a.check && !stage && !tw, !a.check ? 'not a planned attempt, or asked already' : tw ? 'a time waster' : 'a new subscriber walks his path first',
    parts(['his readiness', g.readiness * 0.55], ['his heat', g.heat * 0.2], ['the check before an offer sold twice as well', 15], ['something surprising comes first', -g.surprise * 0.2], ['he doubts her', -g.doubt * 0.4]));
  add('comfort', g.mood < 40, 'he is not down', parts(['his mood is low', (100 - g.mood) * 0.9], ['he is venting', r.doing === 'venting' ? 15 : 0]));
  add('reassure', g.doubt >= 60, 'he does not doubt her (in his own words)', parts(['his doubt', g.doubt * 0.95]));   // the reading's "may be testing" alone (50) never reassures
  return out.sort((x, y) => (y.allowed - x.allowed) || (y.score - x.score));
}

/** The gauges in one line, for notes and the practice room. */
const gaugeText = (g) => (g ? GAUGES.map(k => `${k} ${g[k]}`).join(' · ') : '');

module.exports = { GAUGES, MOVES, SOFT_GOALS, startGauges, readGauges, updateGauges, scoreMoves, gaugeText };
