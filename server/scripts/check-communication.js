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
const or = { configured: () => true, isOffered: () => true, backupsFor: () => [], DEFAULT_WRITER: 'fixture/writer', writerLabel: x => x, WRITERS: [], chat: async (o) => { calls.push(o); return { text: o.model === 'fixture/writer' ? writerText : JSON.stringify(reading), model: o.model, usage: { cost: 0 }, finish: 'stop' }; } };
const client = { messages: { create: async (o) => {
  reviewCalls.push(o);
  const props = o.output_config?.format?.schema?.properties || {};
  let a = { ok: true, problems: [], problem: '' };
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
m._compile(`${fs.readFileSync(enginePath, 'utf8')}\nmodule.exports._communicationAudit={pickCandidate,SHARES,WANTS,DOOR:typeof DOOR==='undefined'?null:DOOR,echoOnly:typeof echoOnly==='undefined'?null:echoOnly};`, enginePath);
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
  check('a plain question still goes last', same(P.splitBubbles(['What are you up to?', 'I\'m in bed with tea.']), ['I\'m in bed with tea.', 'What are you up to?']) && same(P.splitBubbles(['I had a lazy Sunday.', 'What about you?']), ['I had a lazy Sunday.', 'What about you?']));

  // Group B: the rules read him right
  check('a real pushback is still repaired', makePlan('Why finally? I just subscribed').repair === true);
  const why = makePlan('Why do you like painting?');
  check('ordinary_question_becomes_repair', why.repair === false && !!why.answer_first && !why.beats.some(b => /teasing/.test(b)), { repair: why.repair, answer_first: why.answer_first, beats: why.beats });
  check('positive_reaction_becomes_repair', makePlan('Wow, that painting is beautiful').repair === false && makePlan('wow, you\'re beautiful').repair === false);
  check('challenges are repaired', ['wow ok', 'huh?', 'What do you mean?', 'Wow really? that\'s rude'].every(t => makePlan(t).repair === true));
  const notPraise = ['Your eyes look tired, are you okay?', 'I don\'t like your photos', 'you\'re not that cute lol'].map(t => makePlan(t).complimented);
  check('concern_and_negative_opinion_become_compliments', notPraise.every(x => x === false), { notPraise });
  const praise = ['I love your smile', 'your eyes are insane', 'you\'re so cute', 'beautiful smile', 'I like your photos'].map(t => makePlan(t).complimented);
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

  // out of scope for this plan (see AI_CHAT_FIX_PLAN_22_OCT.md): implicit sadness, the joke origin past the window, money and closeness, prompt size
  console.log(`\n${failed ? `${failed} check(s) failed` : 'all checks passed'}`);
  process.exitCode = failed ? 1 : 0;
})().catch((e) => { console.error(e.stack); process.exitCode = 1; });
