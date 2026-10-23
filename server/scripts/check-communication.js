#!/usr/bin/env node
// Offline checks of how the engine reads him and keeps her words (fix plan of 22 Oct 2026). Built from the
// outside review's probe script (scripts/probes/codex-communication-probes.cjs): the same stubs for the
// database and the models, but these expect the FIXED behaviour. No model calls, no credentials, costs nothing.
//   cd server && node scripts/check-communication.js        prints one line per check, PASS or FAIL
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const root = path.join(__dirname, '..', '..');
const req = Module.createRequire(path.join(root, 'package.json'));
const P = req('./server/src/ai/chat/prompts');
const Plan = req('./server/src/ai/chat/plan');
let calls = [];
const reviewCalls = [];
let writerText = JSON.stringify({ messages: ['I love a good question, you know.'], learned: [], about_me: [], handover: '' });
let writerQueue = [];                                     // when set, the writer answers these in turn (then writerText)
let questionVerdict = { ok: true, problem: '' };          // Claude's question check, stubbed
const reading = { ids: [], level: 0, mood: 'chatty', pulled_back: false, answers: 'straight', thread: 'alive', doing: 'small_talk', new: '', readings: [], curious: '', asked: [], promised: [], odd: false, stance: 'steady' };
const records = {
  creators: { id: 'creator', organisation_id: 'org', name: 'Synthetic creator' },
  fanvue_accounts: { id: 'account', is_ai_creator: true },
  ai_personas: { organisation_id: 'org', creator_id: 'creator', profile: { name: 'Synthetic creator', age: '25', heat: 'mild', facts: [] }, settings: { emojis: 'none' } },
};
class Query {
  constructor(t) { this.t = t; this.one = false; this.off = 0; }
  select() { return this; } eq() { return this; } in() { return this; } not() { return this; } gte() { return this; } order() { return this; } limit() { return this; } insert() { return this; } upsert() { return this; } update() { return this; } delete() { return this; }
  range(n) { this.off = n; return this; } single() { this.one = true; return this; } maybeSingle() { this.one = true; return this; }
  then(resolve, reject) { const v = this.off ? [] : records[this.t] ?? []; return Promise.resolve({ data: this.one ? (Array.isArray(v) ? v[0] ?? null : v) : v, error: null }).then(resolve, reject); }
}
const or = { configured: () => true, isOffered: () => true, backupsFor: () => [], DEFAULT_WRITER: 'fixture/writer', writerLabel: x => x, WRITERS: [], chat: async (o) => { calls.push(o); return { text: o.model === 'fixture/writer' ? (writerQueue.length ? writerQueue.shift() : writerText) : JSON.stringify(reading), model: o.model, usage: { cost: 0 }, finish: 'stop' }; } };
const client = { messages: { create: async (o) => {
  reviewCalls.push(o);
  const props = o.output_config?.format?.schema?.properties || {};
  let a = { ok: true, problems: [], problem: '' };
  if (props.problem && !props.problems) a = questionVerdict;
  if (props.overall) a = { overall: 'good', summary: 'Fixed offline fixture', answers_him: { verdict: 'good', note: '' }, understood: { verdict: 'good', note: '' }, fits_moment: { verdict: 'good', note: '' }, notes_facts: { verdict: 'n/a', note: '' }, selling: { verdict: 'n/a', note: '' }, lessons: { verdict: 'n/a', note: '' } };
  return { stop_reason: 'end_turn', usage: {}, content: [{ type: 'text', text: JSON.stringify(a) }] };
} } };
const original = Module._load;
Module._load = function load(name, parent, main) {
  if (name === './supabase' || name.endsWith('/supabase')) return { supabaseAdmin: { from: t => new Query(t) } };
  if (name.endsWith('integrations/openrouter')) return or;
  if (name.endsWith('integrations/fanvue')) return {};
  if (name === '../agentRunner') return { client };
  return original.call(this, name, parent, main);
};
const enginePath = path.join(root, 'server/src/utils/aiChat.js');
const m = new Module(enginePath, module); m.filename = enginePath; m.paths = Module._nodeModulePaths(path.dirname(enginePath));
m._compile(`${fs.readFileSync(enginePath, 'utf8')}\nmodule.exports._communicationAudit={pickCandidate,SHARES,WANTS,GIVES_REASON:typeof GIVES_REASON==='undefined'?null:GIVES_REASON,RECEIVES:typeof RECEIVES==='undefined'?null:RECEIVES,withoutEchoes:typeof withoutEchoes==='undefined'?null:withoutEchoes,MOOD_TALK:typeof MOOD_TALK==='undefined'?null:MOOD_TALK,DOOR:typeof DOOR==='undefined'?null:DOOR,echoOnly:typeof echoOnly==='undefined'?null:echoOnly,TALK_ONLY,HANDS_OVER,nameIn,LATE_NAME,KNOWS_HIM,followsHim,followOnlyWhy};`, enginePath);
const A = m.exports;
const audit = A._communicationAudit;

let failed = 0;
const check = (id, ok, evidence = {}) => { if (!ok) failed += 1; console.log(`${ok ? 'PASS' : 'FAIL'} ${id}${ok ? '' : ` ${JSON.stringify(evidence)}`}`); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const profile = Plan.fanProfile({ chat: [{ from_fan: false, text: 'I like painting.' }, { from_fan: true, text: 'Why do you like painting?' }], latest: ['Why do you like painting?'] });
const makePlan = (text, extra = {}) => Plan.planReply({ level: { his: 0, max: 0, mood: 'chatty' }, latest: [text], profile, herReplies: 1, reading: { ...reading, doing: 'asking', asked: [text] }, rand: () => 0, ...extra });

(async () => {
  // Group A: the tidy step keeps what she meant
  const tidy = (t) => P.tidyMessages([t], { emojis: 'none' })[0];
  check('tease said to him', tidy('Someone\'s eager tonight') === 'You\'re eager tonight' && tidy('looks like someone\'s in a good mood') === 'looks like you\'re in a good mood' && tidy('I think someone needs a nap') === 'I think you need a nap');
  check('cleanup_changes_person_referred_to', tidy('My flatmate says someone is stealing her coffee.') === 'My flatmate says someone is stealing her coffee.' && tidy('someone else can do it') === 'someone else can do it');
  const morning = 'I went hiking this morning. Your hiking trip sounded fun.';
  check('self_disclosure_removed_as_fan_time_guess', same(P.dropSentences([morning], { his: 'I really enjoy hiking' }), [morning]));
  check('a guess at his clock still goes', same(P.dropSentences(['That sounds fun. What\'s keeping you up this early?'], { his: 'hey there' }), ['That sounds fun.']) && same(P.dropSentences(['Haha nice one. Up so late?'], { his: 'hey there' }), ['Haha nice one.']));
  const ordered = ['Did you mean the blue one?', 'If so, that is my favourite.'];
  check('question_reordering_breaks_dependency', same(P.splitBubbles(ordered), ordered));
  check('a short reaction question stays first, a moved one keeps its full stop', same(P.splitBubbles(['This weekend? Probably just lazing around']), ['This weekend? Probably just lazing around']) && same(P.splitBubbles(['Proper carbonara, huh? teach me your ways']), ['Proper carbonara, huh? teach me your ways']) && same(P.splitBubbles(['What do you do on weekends? I mostly read']), ['I mostly read. What do you do on weekends?']));
  check('a plain question still goes last', same(P.splitBubbles(['What are you up to?', 'I\'m in bed with tea.']), ['I\'m in bed with tea.', 'What are you up to?']) && same(P.splitBubbles(['I had a lazy Sunday.', 'What about you?']), ['I had a lazy Sunday.', 'What about you?']));

  // Group B: the rules read him right
  check('a real pushback is still repaired', makePlan('Why finally? I just subscribed').repair === true);
  const why = makePlan('Why do you like painting?');
  check('ordinary_question_becomes_repair', why.repair === false && !!why.answer_first && !why.beats.some(b => /teasing/.test(b)), { repair: why.repair, answer_first: why.answer_first, beats: why.beats });
  check('positive_reaction_becomes_repair', makePlan('Wow, that painting is beautiful').repair === false && makePlan('wow, you\'re beautiful').repair === false);
  check('challenges are repaired', ['wow ok', 'Wow really? that\'s rude', 'What\'s that supposed to mean?'].every(t => makePlan(t).repair === true));
  check('confusion is not offence', ['What do you mean?', 'huh?'].every(t => makePlan(t).repair === false));
  const notPraise = ['Your eyes look tired, are you okay?', 'I don\'t like your photos', 'you\'re not that cute lol'].map(t => makePlan(t).complimented);
  check('concern_and_negative_opinion_become_compliments', notPraise.every(x => x === false), { notPraise });
  const praise = ['you seem really sweet', 'you sound like a fun girl', 'I love your smile', 'your eyes are insane', 'you\'re so cute', 'beautiful smile', 'I like your photos'].map(t => makePlan(t).complimented);
  check('compliments are still received', praise.every(x => x === true), { praise });
  const noQuestion = A._test.noQuestionWhy({ latest: ['I need to talk about something difficult'] });
  check('ordinary_need_suppresses_followup', noQuestion === '', { noQuestion });
  check('he wants vs he needs to talk', audit.WANTS.test('I want to see your tits') && !audit.WANTS.test('I need a friend right now') && !audit.WANTS.test('I\'d love your advice'));
  check('a hard moment keeps its check-in question', A._test.noQuestionWhy({ latest: ['ugh'], recent: ['a?', 'b?'], hard: true }) === '');

  // Group C: the picker, the status, the asked question, selling off, the coach
  const candidates = [{ messages: ['I live in Lisbon, and I love walking by the river after work.'] }, { messages: ['I love a good question, you know.'] }];
  const ranked = audit.pickCandidate(candidates, { plan: { goal: 'chat', length: { target: 'short' }, ask: { allowed: true }, answer_first: 'He asked where you live; answer plainly first', reading: { asked: ['Where do you live?'] }, beats: ['answer his question plainly, in one line'] }, voice: { openers: [] } });
  check('candidate_ranker_prefers_nonanswer', ranked.draft === candidates[0], { scores: ranked.scores });
  check('real_self_disclosure_not_recognized', audit.SHARES.test('Painting helps me switch my brain off.'));
  writerText = JSON.stringify({ messages: ['Finally, you\'re here with me.'], learned: [], about_me: [], handover: '' });
  const generated = await A._engine.writeOne({ orgId: 'org', creatorId: 'creator', model: 'fixture/writer', base: { profile: records.ai_personas.profile, chat: [{ from_fan: true, text: 'hello' }], level: { max: 0, his: 0, mood: 'chatty' }, plan: { ...makePlan('hello', { profile: { ...profile, new_sub: true }, herReplies: 0 }), new_today: true } }, latest: ['hello'], recentHer: [], voice: null, speed: 'normal', emojis: 'none' });
  check('known_invented_history_still_accepted', generated.status === 'check' && generated.drafts === 3 && (generated.problems || []).some(x => /^Still wrong after/.test(x)), { status: generated.status, drafts: generated.drafts, problems: generated.problems });
  const dialogue = [];
  for (let i = 0; i < 12; i += 1) dialogue.push({ from: 'fan', text: `I enjoy painting and long walks number ${i}` }, { from: 'her', text: `I spent some time painting today number ${i}` });
  dialogue.push({ from: 'fan', text: 'I also enjoy drawing landscapes on weekends' });
  const off = await A.reply('org', 'creator', { madeUp: { name: 'Synthetic fan', type: 'new_sub' }, test: dialogue, selling: false, planOnly: true });
  check('selling_off_still_runs_sales_conversation', off.used.plan.goal !== 'direct_ask' && off.used.plan.level.max < 2, { goal: off.used.plan.goal, level: off.used.plan.level });
  process.env.ANTHROPIC_API_KEY = 'offline-fixture-not-a-key';   // the reader transport is stubbed above
  Object.assign(reading, { doing: 'sharing', new: 'A new hobby with more than one possible angle', readings: [{ what: 'Painting miniatures as a hobby', sure: 0.6 }, { what: 'Painting for a competition', sure: 0.4 }], curious: 'What kind of miniatures do you paint?', stance: 'curious' });
  writerText = JSON.stringify({ messages: ['https://example.com'], learned: [], about_me: [], handover: '' });
  const blocked = await A.reply('org', 'creator', { madeUp: { name: 'Synthetic fan', type: 'regular' }, test: [{ from: 'her', text: 'What do you enjoy doing?' }, { from: 'fan', text: 'I spend my weekends painting miniatures' }], selling: false });
  check('failed_draft_remembers_unasked_question', blocked.used.plan.goal === 'curious' && blocked.results[0].status === 'blocked' && !(blocked.used.session.asked_about || []).includes(reading.curious), { goal: blocked.used.plan.goal, status: blocked.results[0].status, asked: blocked.used.session.asked_about });
  writerText = JSON.stringify({ messages: ['Ooh miniatures, I love that. What kind of miniatures do you paint?'], learned: [], about_me: [], handover: '' });
  const asked = await A.reply('org', 'creator', { madeUp: { name: 'Synthetic fan', type: 'regular' }, test: [{ from: 'her', text: 'What do you enjoy doing?' }, { from: 'fan', text: 'I spend my weekends painting miniatures' }], selling: false });
  check('a question really asked is remembered', ['ok', 'check'].includes(asked.results[0].status) && (asked.used.session.asked_about || []).includes(reading.curious), { status: asked.results[0].status, asked: asked.used.session.asked_about });
  Object.assign(reading, { doing: 'small_talk', new: '', readings: [], curious: '', stance: 'steady' });
  const review = req('./server/src/ai/chat/review');
  await review.coachCheck({ profile: { name: 'Synthetic creator', personality: 'PERSONA_MARKER: dry humour, dislikes small talk, never uses pet names' }, chat: [], messages: ['hello there'] });
  check('coach_missing_character_personality', JSON.stringify(reviewCalls.at(-1)).includes('PERSONA_MARKER'));

  // Group D: after a short answer, the share, the echo, the door
  check('an echo-only bubble is caught', !!audit.echoOnly && audit.echoOnly('South Africa…', 'It\'s from South Africa') && !audit.echoOnly('Abeba… that\'s a beautiful name', 'My name is Abeba') && !audit.echoOnly('oh ok…', 'oh ok'));
  check('a reply without a door is caught', !!audit.DOOR && !audit.DOOR.test('I love how names travel makes me want to try some rooibos tea again') && audit.DOOR.test('oh so you\'re South African? 😍 never met one, convince me it\'s as beautiful as they say'));

  // Group E: the Mike chat (practice run 10)
  const mean = makePlan('What do you mean?', { herLast: 'Haha, I love that energy / I could use some of that right now actually', reading: { ...reading, curious: 'What do you need explosions for?' } });
  check('he didn\'t get her line: she explains', mean.repair === false && mean.clarify === true && mean.goal !== 'curious' && /I could use some of that/.test(mean.answer_first) && !mean.reading?.curious && mean.ask.allowed === false, { ask: mean.ask, repair: mean.repair, clarify: mean.clarify, goal: mean.goal, answer_first: mean.answer_first });
  Object.assign(reading, { doing: 'sharing', new: 'A new hobby', readings: [], curious: 'What kind of miniatures do you paint?', stance: 'curious' });
  questionVerdict = { ok: false, problem: 'It does not fit the chat.' };
  writerQueue = [JSON.stringify({ messages: ['Miniatures, nice. What kind of miniatures do you paint?'], learned: [], about_me: [], handover: '' }), JSON.stringify({ messages: ['Miniatures sound so calming, I love tiny details like that'], learned: [], about_me: [], handover: '' })];
  const dropped = await A.reply('org', 'creator', { madeUp: { name: 'Synthetic fan', type: 'regular' }, test: [{ from: 'her', text: 'What do you enjoy doing?' }, { from: 'fan', text: 'I spend my weekends painting miniatures' }], selling: false });
  const dr = dropped.results[0];
  check('a rejected planned question is dropped, not insisted on', dropped.used.plan.goal === 'curious' && dr.drafts === 2 && !(dr.replies || []).some(m => /\?/.test(m.creator_message)) && !(dr.style || []).some(x => /has to ask the one thing/.test(x)), { goal: dropped.used.plan.goal, drafts: dr.drafts, replies: dr.replies, style: dr.style, status: dr.status });
  questionVerdict = { ok: true, problem: '' }; writerQueue = [];
  Object.assign(reading, { doing: 'small_talk', new: '', readings: [], curious: '', stance: 'steady' });
  check('her mood of the day said out loud is caught', !!audit.MOOD_TALK && audit.MOOD_TALK.test('I could use some of that right now actually') && audit.MOOD_TALK.test('oh just feeling a little slow today') && !audit.MOOD_TALK.test('I love that energy'));
  const pet = (t) => P.tidyMessages([t], { emojis: 'none', recent: ['a', 'b'], closeness: 'new' })[0];
  check('a pet name as the last word is capped', pet('I love that energy babe') === 'I love that energy' && /my baby/.test(pet('you\'re my baby')) && pet('hey babe how are you') === 'hey how are you');
  const readText = JSON.stringify(req('./server/src/ai/chat/strategy').readPrompt({ chat: [{ from_fan: true, text: 'hi' }], money: null }));
  check('the reader\'s question is hers, a dark joke is a test', /SHE would ask HIM/.test(readText) && /we like to explode/.test(readText));

  check('an echo question is no door', !!audit.withoutEchoes && !audit.DOOR.test(audit.withoutEchoes(['South Africa, huh? That sounds exciting.'], 'It\'s from South Africa')) && audit.DOOR.test(audit.withoutEchoes(['South Africa, huh? What city?'], 'It\'s from South Africa')));
  questionVerdict = { ok: false, problem: 'It calls his nationality his name.' };
  writerText = JSON.stringify({ messages: ['Nice to meet you, Arab. Whereabouts?'], learned: [], about_me: [], handover: '' });
  const odd = await A.reply('org', 'creator', { madeUp: { name: 'Synthetic fan', type: 'regular' }, test: [{ from: 'her', text: 'What\'s your name?' }, { from: 'fan', text: 'Im arab' }], selling: false });
  const od = odd.results[0];
  check('a reply whose question makes no sense is not trimmed into "ok"', od.status === 'check' && (od.replies || []).some(m => /\?/.test(m.creator_message)), { status: od.status, drafts: od.drafts, replies: od.replies });
  questionVerdict = { ok: true, problem: '' };

  // the leftover writing slips (22 Oct, after the plan)
  check('a reworded welcome question counts as asked', Plan.sameKind('What made you stop by my page?', 'hi! What brought you here today?') && Plan.sameKind('what made you pick my page, Abeba?', 'Hi! What brought you my way? 😊') && !Plan.sameKind('Where are you from?', 'hi! What brought you here today?') && !Plan.sameKind('What part of South Africa?', 'Where are you from?'));
  check('a reason is a reason', !!audit.GIVES_REASON && audit.GIVES_REASON.test('Honestly? It\'s my way of making something pretty') && !audit.GIVES_REASON.test('My sister always steals my brushes though, drives me nuts'));
  check('a compliment received is seen', !!audit.RECEIVES && audit.RECEIVES.test('aww you\'re sweet') && audit.RECEIVES.test('stop, you\'ll make me blush') && !audit.RECEIVES.test('Now I\'m hungry... You\'re making me jealous over here'));
  check('"when I\'m feeling off" is a reason, not her mood', !audit.MOOD_TALK.test('It\'s my way of making something pretty when I\'m feeling off') && audit.MOOD_TALK.test('oh just feeling a little slow today'));

  // round 4 (AI_CHAT_FIX_PLAN_23_OCT.md), Group F: the Bob chat
  const Sl = req('./server/src/ai/chat/selling');
  const Sf = req('./server/src/ai/chat/safety');
  check('F1 "just talk" is a no, "show me" a yes', audit.TALK_ONLY.test("I'd be glad to talk to you a bit, I came here just to talk to you") && !audit.TALK_ONLY.test('yes show me') && audit.HANDS_OVER.test('surprise me'));
  check('F1 his no ends the path, a yes gets the offer, unclear waits', Sl.firstSaleStage({ herHere: 14, asked: true, declined: true }).stage === 'declined' && Sl.firstSaleStage({ herHere: 14, asked: true, answer: 'wants' }).stage === 'offer' && Sl.firstSaleStage({ herHere: 14, asked: true, answer: 'unclear' }).stage === 'asked');
  check('F2 the ask waits for him to flirt back, then for a moment that fits', Sl.firstSaleStage({ herHere: 12, warm: false }).stage === 'flirt' && Sl.firstSaleStage({ herHere: 19, herTurns: 19, warm: false }).stage === 'no_ask'
    && Sl.firstSaleStage({ herHere: 12, warm: true, fits: false, unfit: 'he just asked you something' }).waits && Sl.firstSaleStage({ herHere: 12, warm: true, fits: false, waited: 6 }).stage === 'no_ask' && Sl.firstSaleStage({ herHere: 12, warm: true }).stage === 'ask');
  let bob = await A.reply('org', 'creator', { madeUp: { name: 'Bob', type: 'new_sub' }, test: [{ from: 'fan', text: 'Hey there' }], selling: false, planOnly: true });
  const askedS = { ...bob.used.session, first_sale: { ...(bob.used.session.first_sale || {}), asked: true, warm: true } };
  bob = await A.reply('org', 'creator', { madeUp: { name: 'Bob', type: 'new_sub' }, test: [{ from: 'fan', text: 'Hey there' }, { from: 'her', text: 'What would you want to see of me then?' }, { from: 'fan', text: "I'd be glad to talk to you a bit, I came here just to talk to you" }], selling: false, planOnly: true, session: askedS });
  check('F1 run 11 reply 15: no offer after "I came here just to talk to you"', bob.used.stage?.stage === 'declined' && !['first_offer', 'offer'].includes(bob.used.plan.goal), { stage: bob.used.stage, goal: bob.used.plan.goal });
  const voice = (extra) => Sf.voiceProblems(["Bob, love that name. You're making me feel all kinds of special already."], { recent: ['a', 'b', 'c'], his: 'Got ya, my pleasure!', closeness: 'new', ...extra });
  check('F3 a feeling he did not cause is flagged, an earned one passes', voice({}).some(x => /didn't cause/.test(x)) && !Sf.voiceProblems(["aww you're making me blush"], { recent: ['a', 'b', 'c'], closeness: 'new', earned: true }).some(x => /didn't cause/.test(x)));
  check('F4 his name is found, a late name comment and a bare "you" are caught', audit.nameIn('My name is Bob, and you?') === 'Bob' && audit.nameIn("I'm good, you?") === '' && audit.LATE_NAME.test('Bob, love that name.') && !audit.DOOR.test("Bob, love that name. You're making me feel all kinds of special already."));
  const closing = Plan.planReply({ level: { his: 1, max: 1, mood: 'chatty' }, latest: ['Got ya, my pleasure!'], profile, herReplies: 3, reading: { ...reading, answers: 'closing' }, rand: () => 0 });
  const named = Plan.planReply({ level: { his: 0, max: 1, mood: 'chatty' }, latest: ['My name is Bob, and you?'], profile, herReplies: 2, reading: { ...reading, doing: 'sharing', asked: ['and you?'] }, nameGiven: 'Bob', rand: () => 0 });
  check('F4 a pleasantry makes her lead; his name is said back', closing.closing && closing.beats.some(b => /^lead:/.test(b)) && named.beats.some(b => /nice to meet you, Bob/.test(b)), { closing: closing.beats, named: named.beats });
  const over = makePlan('What do you mean?', { herLast: "Bob, love that name. You're making me feel all kinds of special already.", reading: { ...reading, doing: 'asking', asked: ['What do you mean?'] } });
  check('F5 repairing an overclaim takes it down', over.clarify_kind === 'overclaim' && /down a notch/.test(over.answer_first), { kind: over.clarify_kind, first: over.answer_first });
  check('F5 no pet name in a repair, none with a new fan who has not flirted back', P.tidyMessages(["I just meant you're making me blush, babe"], { emojis: 'none', noPet: true })[0] === "I just meant you're making me blush" && P.tidyMessages(['haha love it babe'], { emojis: 'none', recent: ['a', 'b', 'c', 'd'], closeness: 'new', warm: false })[0] === 'haha love it');

  // round 4, Group G
  check('G1 no name of his in a selling reply; "I know you like" is caught', P.tidyMessages(['Mike, this one is just for you'], { emojis: 'none', noName: true, names: ['Mike'] })[0] === 'This one is just for you' && audit.KNOWS_HIM.test('I know you like lingerie') && !audit.KNOWS_HIM.test('you said you like lingerie, so…'), { tidy: P.tidyMessages(['Mike, this one is just for you'], { emojis: 'none', noName: true, names: ['Mike'] }) });
  check('G2 two questions in a row: a follow-up only, three still block', !!audit.followOnlyWhy({ recent: ['a?', 'b?'] }) && !A._test.noQuestionWhy({ recent: ['a?', 'b?'] }) && !!A._test.noQuestionWhy({ recent: ['a?', 'b?', 'c?'] })
    && audit.followsHim('What part of South Africa?', "It's from South Africa") && audit.followsHim('really?', 'I quit my job') && !audit.followsHim('What do you do for fun?', "It's from South Africa"));
  const g3 = Plan.planReply({ level: { his: 0, max: 0, mood: 'chatty' }, latest: ["It's from South Africa"], profile, herReplies: 2, reading: { ...reading, doing: 'sharing' }, gauges: { heat: 0, mood: 54, rapport: 27, readiness: 10, doubt: 0, engagement: 51, surprise: 40 }, questions: { n: 2, asked: 2, share: 1, run: 2 }, rand: () => 0 });
  check('G3 no story of hers at low rapport unless he asked about her; never first', !(g3.scores || []).find(x => x.move === 'share')?.allowed && !/thing of yours/.test((g3.beats || [])[0] || ''), { scores: g3.scores, beats: g3.beats });
  check('G4 repairs by kind', Plan.repairKind("what's a platz?", 'Would you like a platz?') === 'term' && Plan.repairKind("what's that?", 'x') === 'that' && Plan.repairKind('like what?', 'x') === 'example' && Plan.repairKind('come again?', 'x') === 'repeat' && Plan.repairKind('What do you mean?', 'x') === 'whole' && Plan.repairKind('nice', 'x') === '');
  const term = makePlan("what's a platz?", { herLast: 'Would you like a platz, too?', reading: { ...reading, doing: 'asking', asked: ["what's a platz?"] } });
  check('G4 a word of hers gets its meaning, and her question may come again', term.clarify_kind === 'term' && /"platz" means/.test(term.answer_first) && term.ask.allowed, { kind: term.clarify_kind, first: term.answer_first, ask: term.ask });

  // out of scope for this plan (see AI_CHAT_FIX_PLAN_22_OCT.md): implicit sadness, the joke origin past the window, money and closeness, prompt size
  console.log(`\n${failed ? `${failed} check(s) failed` : 'all checks passed'}`);
  process.exitCode = failed ? 1 : 0;
})().catch((e) => { console.error(e.stack); process.exitCode = 1; });
