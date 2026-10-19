/**
 * The AI chat's blind test (database changes 037 and 038): does the AI beat her
 * chatters, especially where the money is?
 *  - Proven answers (ai_gold): what her chatters answered in moments that were
 *    followed by a purchase within a day. They are the gold standard, and the AI
 *    learns from them (utils/aiChat.js → provenExamples). Built at the start of a
 *    test, each tagged with its Playbook situations.
 *  - Moments: a fan wrote and her chatter typed the answer within the hour (not
 *    Fanvue's AI writer, nothing paid or about prices, nothing the safety screen
 *    would stop). About 80% come from chats with fans who paid, half of those
 *    from proven moments.
 *  - For each moment two AI writers answer from the same chat up to then (no fan
 *    notes: they were built from later messages; no proven answers from the same
 *    fan). The three answers are shown as A, B and C in random order. A manager
 *    picks the best (or none) without knowing who wrote which; Claude does too.
 */
const { supabaseAdmin } = require('./supabase');
const A = require('./aiChat');
const or = require('../integrations/openrouter');
const strategy = require('../ai/chat/strategy');
const { screenFan } = require('../ai/chat/safety');
const { judgeDuel, MODEL: CHECK_MODEL } = require('../ai/chat/review');

const E = A._engine;
const NOT_READY = 'Run database change 037 (AI blind test) in Supabase first';
const NOT_READY_V2 = 'Run database change 038 (proven answers) in Supabase first';
const SELLING = /\$\s?\d|\b\d+\s?(?:usd|dollars?|bucks)\b|\bppv\b|\bunlock\w*|\btips?\b|\bvault\b/i;
const ANSWERED_WITHIN = 60 * 60_000;      // her chatter answered within the hour
const SAME_REPLY = 10 * 60_000;           // her messages that belong to one answer
const OUTCOME_WITHIN = 24 * 3600_000;     // he wrote back / bought within a day
const PER_PAYING_FAN = 8;                // moments per fan, at most: few fans pay, so more of theirs
const PER_FAN = 3;
const PAYING_SHARE = 0.8;                 // of the moments, from chats with fans who paid
const VENICE = 'cognitivecomputations/dolphin-mistral-24b-venice-edition';
const MISTRAL = 'mistralai/mistral-large-2512';
const LETTERS = ['A', 'B', 'C'];
const round = (n) => Math.round(n * 1e6) / 1e6;
const tableMissing = (e, t = 'ai_duels') => new RegExp(t).test(String(e?.message || ''));
const shuffle = (list) => [...list].sort(() => Math.random() - 0.5);
const iso = (t) => new Date(t).toISOString();

/** Every usable moment in an account's chats, with what happened after the chatter's answer. */
async function findMoments(accountId) {
  const [rows, earn] = await Promise.all([
    E.all(() => supabaseAdmin.from('fanvue_messages').select('uuid, fan_uuid, from_fan, type, text, sent_at').eq('account_id', accountId)
      .neq('type', 'BROADCAST').order('fan_uuid').order('sent_at').order('uuid')),
    E.all(() => supabaseAdmin.from('fanvue_earnings').select('fan_uuid, source, paid_at, gross_cents, message_uuid').eq('account_id', accountId).order('paid_at').order('transaction_order_id')),
  ]);
  const paidMessage = new Set(earn.filter(e => e.message_uuid).map(e => e.message_uuid));
  const buys = {}, money = {};
  for (const e of earn) {
    if (e.source === 'message' || e.source === 'tip') (buys[e.fan_uuid] ||= []).push(Date.parse(e.paid_at));
    (money[e.fan_uuid] ||= []).push(e);
  }
  const spentBefore = (fan, t) => Math.round((money[fan] || []).reduce((s, e) => {
    if (Date.parse(e.paid_at) >= t) return s;
    const amount = Math.abs(e.gross_cents || 0) / 100;
    return e.source === 'refund' || e.source === 'chargeback' ? s - amount : s + amount;
  }, 0) * 100) / 100;
  const byFan = {};
  for (const m of rows) if (m.sent_at && (m.from_fan || !E.isMass(m.type))) (byFan[m.fan_uuid] ||= []).push(m);

  const out = [];
  for (const [fan, list] of Object.entries(byFan)) {
    const paying = (buys[fan] || []).length > 0;
    let i = 0;
    while (i < list.length) {
      if (!list[i].from_fan) { i += 1; continue; }
      let j = i;                                                   // his messages i..j, then her answer
      while (j + 1 < list.length && list[j + 1].from_fan) j += 1;
      const start = i;
      i = j + 1;
      const first = list[j + 1];
      if (!first || first.from_fan || !E.TEAM_TYPES.includes(first.type)) continue;
      const hisAt = Date.parse(list[j].sent_at), herAt = Date.parse(first.sent_at);
      if (herAt < hisAt || herAt - hisAt > ANSWERED_WITHIN) continue;
      const answer = [first];
      let b = j + 2;
      while (b < list.length && !list[b].from_fan && answer.length < 3 && Date.parse(list[b].sent_at) - Date.parse(answer[answer.length - 1].sent_at) <= SAME_REPLY) {
        answer.push(list[b]); b += 1;
      }
      if (answer.some(m => !E.TEAM_TYPES.includes(m.type) || !String(m.text || '').trim() || paidMessage.has(m.uuid) || SELLING.test(m.text))) continue;
      const latest = list.slice(start, j + 1).map(m => String(m.text || '').trim()).filter(Boolean);
      if (!latest.length || screenFan(latest).action !== 'continue') continue;
      const answerEnd = Date.parse(answer[answer.length - 1].sent_at);
      const next = list.slice(b).find(m => m.from_fan);
      const nextAt = next ? Date.parse(next.sent_at) : null;
      const replied = !!nextAt && nextAt - answerEnd <= OUTCOME_WITHIN;
      out.push({
        fan_uuid: fan, at: list[j].sent_at, latest, paying,
        context: list.slice(0, j + 1),
        human: answer.map(m => m.text.trim()),
        fan_context: { spent_before: spentBefore(fan, hisAt), messages_before: j + 1, since: list[0].sent_at },
        outcome: {
          replied, reply_after_min: replied ? Math.round((nextAt - answerEnd) / 60_000) : null,
          bought: (buys[fan] || []).some(t => t > herAt && t - herAt <= OUTCOME_WITHIN),
        },
      });
    }
  }
  return out;
}

// About 80% from fans who paid (half of those proven moments), the rest from
// everyone else; at most PER_PAYING_FAN / PER_FAN moments per fan.
function sample(pool, n) {
  const perFan = {}, used = new Set();
  const take = (list, k) => {
    const out = [];
    for (const m of shuffle(list)) {
      if (out.length >= k) break;
      if (used.has(m) || (perFan[m.fan_uuid] || 0) >= (m.paying ? PER_PAYING_FAN : PER_FAN)) continue;
      perFan[m.fan_uuid] = (perFan[m.fan_uuid] || 0) + 1;
      used.add(m);
      out.push(m);
    }
    return out;
  };
  const paying = Math.round(n * PAYING_SHARE);
  const proven = take(pool.filter(m => m.paying && m.outcome.bought), Math.round(paying / 2));
  const otherPaying = take(pool.filter(m => m.paying && !m.outcome.bought), paying - proven.length);
  const rest = take(pool.filter(m => !m.paying), n - proven.length - otherPaying.length);
  const extra = take(pool, n - proven.length - otherPaying.length - rest.length);
  return shuffle([...proven, ...otherPaying, ...rest, ...extra]);
}

// The fan's own name words (to keep proven answers that name him out of the library).
async function fanNames(accountId) {
  const people = await E.all(() => supabaseAdmin.from('fanvue_fans').select('fan_uuid, handle, display_name, nickname').eq('account_id', accountId).order('fan_uuid'));
  return Object.fromEntries(people.map(p => [p.fan_uuid, new Set([p.handle, p.display_name, p.nickname]
    .flatMap(v => String(v || '').toLowerCase().split(/\s+/)).filter(w => w.length >= 3))]));
}
const namesHim = (set, texts) => texts.join(' ').toLowerCase().split(/[^\p{L}\p{N}_.-]+/u).some(w => set?.has(w));

/** Add the proven moments that aren't in the library yet, each tagged with its situations. */
async function buildGold(orgId, creatorId, accountId, pool, job) {
  const { data: have, error } = await supabaseAdmin.from('ai_gold').select('fan_uuid, moment_at').eq('account_id', accountId).limit(5000);
  if (error) throw new A.AiChatError(tableMissing(error, 'ai_gold') ? NOT_READY_V2 : error.message, 409);
  const done = new Set(have.map(g => `${g.fan_uuid}|${iso(g.moment_at)}`));
  const who = await fanNames(accountId);
  const todo = pool.filter(m => m.outcome.bought && m.outcome.replied && !done.has(`${m.fan_uuid}|${iso(m.at)}`) && !namesHim(who[m.fan_uuid], [...m.human, ...m.latest]));
  job.gold_total = todo.length;
  const queue = [...todo];
  const worker = async () => {
    while (queue.length) {
      const m = queue.shift();
      try {
        const chat = m.context.map(x => ({ at: x.sent_at, from_fan: x.from_fan, text: x.text || '', mass: false }));
        const plan = await E.pickSituations(orgId, creatorId, m.fan_uuid, E.windowFor(chat).messages, null);
        job.cost += plan.cost;
        const { error: e } = await supabaseAdmin.from('ai_gold').upsert({
          account_id: accountId, organisation_id: orgId, fan_uuid: m.fan_uuid, moment_at: m.at,
          fan_said: m.latest, answer: m.human, situations: plan.ids, outcome: m.outcome,
        }, { onConflict: 'account_id,fan_uuid,moment_at' });
        if (e) throw new Error(e.message);
      } catch (e) { console.error('[ai-duels] proven answer:', e.message); }
      finally { job.gold_done += 1; }
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  E.forgetGold(accountId);
}

// One moment: two AI answers, Claude's blind vote, saved. Returns what it cost.
async function oneDuel({ orgId, creatorId, accountId, persona, examples, writers, batch, m }) {
  const chat = m.context.map(x => ({ at: x.sent_at, from_fan: x.from_fan, text: x.text || '', mass: false }));
  const win = E.windowFor(chat);
  const plan = await E.pickSituations(orgId, creatorId, m.fan_uuid, win.messages, null);
  const proven = await E.provenExamples(accountId, plan.ids, { excludeFan: m.fan_uuid });
  const base = {
    profile: persona.profile, examples, fan: {}, card: [], money: null, story: '', chat: win.messages,
    notes: screenFan(m.latest).notes, situations: strategy.situationGuide(plan.ids), proven,
  };
  const recentHer = chat.filter(x => !x.from_fan).slice(-8).map(x => x.text);
  const answers = await Promise.all(writers.map(model => E.writeOne({
    orgId, creatorId, fanUuid: m.fan_uuid, model, base, latest: m.latest, recentHer, speed: 'normal', emojis: persona.settings?.emojis || 'rarely',
  })));
  let cost = plan.cost + answers.reduce((s, r) => s + (r.cost || 0), 0);
  const texts = answers.map(r => (r.replies || []).map(x => x.creator_message).filter(Boolean));
  if (!texts[0].length) throw new Error(answers[0].error || 'The AI wrote no reply');
  const options = shuffle([
    { source: 'chatter', text: m.human },
    { source: 'ai', model: writers[0], status: answers[0].status, text: texts[0] },
    ...(texts[1]?.length ? [{ source: 'ai2', model: writers[1], status: answers[1].status, text: texts[1] }] : []),
  ]);
  let vote = null, reason = null;
  try {
    const j = await judgeDuel({ profile: persona.profile, chat: win.messages.slice(-16), options: options.map(o => o.text), fan: m.fan_context });
    cost += j.usage.cost;
    await E.logUsage(orgId, 'check', CHECK_MODEL, j.usage, { creatorId, fanUuid: m.fan_uuid });
    vote = j.declined ? null : j.better;
    reason = j.reason;
  } catch (e) { reason = `Claude couldn't judge it (${e.message.slice(0, 80)})`; }
  const { error } = await supabaseAdmin.from('ai_duels').insert({
    organisation_id: orgId, creator_id: creatorId, account_id: accountId, batch, fan_uuid: m.fan_uuid, moment_at: m.at,
    fan_said: m.latest, human: m.human, ai: texts[0], ai_model: writers[0], ai_status: answers[0].status, situations: plan.ids,
    ai_side: LETTERS[options.findIndex(o => o.source === 'ai')], options, proven: m.outcome.bought, fan_context: m.fan_context,
    outcome: m.outcome, claude_vote: vote, claude_reason: reason, cost_usd: round(cost),
  });
  if (error) throw new Error(/options|proven|fan_context|check/.test(error.message) ? NOT_READY_V2 : error.message);
  return cost;
}

// One test run per page at a time, in the background.
const jobs = new Map();
const duelJob = (creatorId) => jobs.get(creatorId) || null;

/** Start a blind test on `count` moments (20–150): proven answers first, then the moments. */
async function startDuels(orgId, creatorId, count = 100) {
  if (jobs.get(creatorId)?.running) return jobs.get(creatorId);
  if (!or.configured()) throw new A.AiChatError('Add OPENROUTER_API_KEY to the server settings first', 409);
  const [d1, d2] = await Promise.all([
    supabaseAdmin.from('ai_duels').select('id, options').limit(1),
    supabaseAdmin.from('ai_gold').select('account_id').limit(1),
  ]);
  if (d1.error) throw new A.AiChatError(/options/.test(d1.error.message) ? NOT_READY_V2 : NOT_READY, 409);
  if (d2.error) throw new A.AiChatError(NOT_READY_V2, 409);
  const { account } = await E.pageAccount(orgId, creatorId);
  const persona = await E.loadPersona(orgId, creatorId);
  if (!String(persona?.profile?.name || '').trim()) throw new A.AiChatError('Set up her profile first (Her profile)', 409);
  const main = persona.settings?.writer || or.DEFAULT_WRITER;
  const writers = [main, main === VENICE ? MISTRAL : VENICE];
  const batch = new Date().toISOString();
  const job = {
    running: true, phase: 'gold', batch, total: 0, done: 0, failed: 0, gold_total: 0, gold_done: 0, cost: 0,
    writers: writers.map(or.writerLabel), last_error: null, finished_at: null,
  };
  jobs.set(creatorId, job);
  (async () => {
    try {
      const pool = await findMoments(account.id);
      await buildGold(orgId, creatorId, account.id, pool, job);
      const chosen = sample(pool, Math.min(150, Math.max(20, Number(count) || 100)));
      if (chosen.length < 5) throw new Error('There are too few moments in her chats where a chatter answered a fan');
      const examples = persona.profile.examples?.length ? persona.profile.examples : await E.styleExamples(account.id);
      job.phase = 'answers';
      job.total = chosen.length;
      const queue = [...chosen];
      const worker = async () => {
        while (queue.length) {
          const m = queue.shift();
          try { job.cost += await oneDuel({ orgId, creatorId, accountId: account.id, persona, examples, writers, batch, m }); }
          catch (e) { job.failed += 1; job.last_error = e.message; console.error('[ai-duels]', e.message); }
          finally { job.done += 1; }
        }
      };
      await Promise.all([worker(), worker(), worker()]);
    } catch (e) {
      job.last_error = e.message;
      console.error('[ai-duels]', e.message);
    } finally {
      job.running = false;
      job.finished_at = new Date().toISOString();
    }
  })();
  return job;
}

async function batchRows(orgId, creatorId, batch, cols = '*') {
  return E.all(() => supabaseAdmin.from('ai_duels').select(cols).eq('organisation_id', orgId).eq('creator_id', creatorId).eq('batch', batch).order('id'))
    .catch((e) => { if (tableMissing(e)) throw new A.AiChatError(NOT_READY, 409); throw e; });
}

// A moment's answers in the order shown (A, B, C), for tests from before database
// change 038 too (then: her chatter and one AI answer).
const optionsOf = (r) => (Array.isArray(r.options) && r.options.length ? r.options
  : (r.ai_side === 'A'
    ? [{ source: 'ai', model: r.ai_model, text: r.ai }, { source: 'chatter', text: r.human }]
    : [{ source: 'chatter', text: r.human }, { source: 'ai', model: r.ai_model, text: r.ai }]));
// Who a vote picked: 'chatter', 'ai', 'ai2', 'tie' or 'none'.
const pickedBy = (vote, opts) => (!vote ? null : vote === 'tie' || vote === 'none' ? vote : opts[LETTERS.indexOf(vote)]?.source || null);

/** The test runs so far (newest first), the proven answers and the running test. */
async function overview(orgId, creatorId) {
  const { account } = await E.pageAccount(orgId, creatorId);
  const [{ data, error }, gold] = await Promise.all([
    supabaseAdmin.from('ai_duels').select('batch, user_vote').eq('organisation_id', orgId).eq('creator_id', creatorId).order('batch', { ascending: false }).limit(5000),
    supabaseAdmin.from('ai_gold').select('fan_uuid', { count: 'exact', head: true }).eq('account_id', account.id),
  ]);
  if (error) {
    if (tableMissing(error)) return { ready: false, v2: false, batches: [], job: duelJob(creatorId) };
    throw new Error(error.message);
  }
  const by = {};
  for (const r of data) {
    const key = iso(r.batch);                                // the same run, however the database writes the time
    const b = (by[key] ||= { batch: key, total: 0, voted: 0 });
    b.total += 1;
    if (r.user_vote) b.voted += 1;
  }
  // a head-only count doesn't report a missing table: ask for a row to be sure
  const { error: goldError } = await supabaseAdmin.from('ai_gold').select('fan_uuid').limit(1);
  return { ready: true, v2: !goldError, proven_answers: goldError ? null : gold.count ?? 0, batches: Object.values(by), job: duelJob(creatorId) };
}

/** The next moment to judge in a run: who he is, the whole chat up to then, the answers (blind). */
async function nextDuel(orgId, creatorId, batch) {
  const rows = await batchRows(orgId, creatorId, batch);
  const left = rows.filter(r => !r.user_vote);
  if (!left.length) return { done: true, total: rows.length, voted: rows.length };
  const d = left[0];
  const [ctx, { data: person }] = await Promise.all([
    E.all(() => supabaseAdmin.from('fanvue_messages').select('from_fan, type, text, sent_at').eq('account_id', d.account_id).eq('fan_uuid', d.fan_uuid)
      .lte('sent_at', d.moment_at).neq('type', 'BROADCAST').order('sent_at').order('uuid')),
    supabaseAdmin.from('fanvue_fans').select('handle, display_name, nickname').eq('account_id', d.account_id).eq('fan_uuid', d.fan_uuid).maybeSingle(),
  ]);
  const context = ctx.filter(m => m.from_fan || !E.isMass(m.type)).map(m => ({ sent_at: m.sent_at, from_fan: m.from_fan, message: m.text || '' }));
  return {
    done: false, id: d.id, number: rows.length - left.length + 1, total: rows.length, voted: rows.length - left.length,
    fan: {
      display_name: person?.display_name || null, fan_username: person?.handle || null, fan_nickname: person?.nickname || null,
      spent_before: d.fan_context?.spent_before ?? null, messages_before: d.fan_context?.messages_before ?? context.length, since: d.fan_context?.since || context[0]?.sent_at || null,
    },
    context,
    options: optionsOf(d).map((o, i) => ({ key: LETTERS[i], messages: o.text.map(t => ({ creator_message: t })) })),
  };
}

/** A manager's vote: 'A', 'B', 'C', 'tie' (can't choose) or 'none' (none is good). Returns the next moment. */
async function vote(orgId, creatorId, duelId, choice, userId) {
  const { data: d, error: e0 } = await supabaseAdmin.from('ai_duels').select('*').eq('id', duelId).eq('organisation_id', orgId).eq('creator_id', creatorId).maybeSingle();
  if (e0) throw new Error(e0.message);
  if (!d) throw new A.AiChatError('Not found', 404);
  const n = optionsOf(d).length;
  if (!['tie', 'none', ...LETTERS.slice(0, n)].includes(choice)) throw new A.AiChatError('Pick one of the answers, "none is good" or "can\'t choose"');
  const { error } = await supabaseAdmin.from('ai_duels').update({ user_vote: choice, voted_by: userId, voted_at: new Date().toISOString() }).eq('id', d.id);
  if (error) throw new Error(/check/.test(error.message) ? NOT_READY_V2 : error.message);
  return nextDuel(orgId, creatorId, iso(d.batch));
}

/** A run's results, with every answer revealed. */
async function results(orgId, creatorId, batch) {
  const rows = await batchRows(orgId, creatorId, batch);
  const tally = () => ({ chatter: 0, ai: 0, ai2: 0, tie: 0, none: 0, n: 0 });
  const you = tally(), claude = tally(), provenYou = tally(), provenClaude = tally();
  const realCheck = { answered: { n: 0, chatter: 0 }, unanswered: { n: 0, chatter: 0 } };
  const bySituation = {};
  const writers = {};
  let cost = 0;
  const count = (t, who) => { if (who) { t[who] += 1; t.n += 1; } };
  const list = rows.map((r) => {
    cost += Number(r.cost_usd) || 0;
    const opts = optionsOf(r);
    for (const o of opts) if (o.source !== 'chatter') writers[o.source] = or.writerLabel(o.model || r.ai_model);
    const u = pickedBy(r.user_vote, opts), c = pickedBy(r.claude_vote, opts);
    count(you, u); count(claude, c);
    if (r.proven) { count(provenYou, u); count(provenClaude, c); }
    if (c && c !== 'tie' && c !== 'none') {
      const k = r.outcome?.replied ? 'answered' : 'unanswered';
      realCheck[k].n += 1;
      if (c === 'chatter') realCheck[k].chatter += 1;
    }
    for (const id of r.situations || []) {
      const s = (bySituation[id] ||= { title: strategy.situationTitle(id), n: 0, ai_claude: 0, you_n: 0, ai_you: 0 });
      s.n += 1;
      if (c === 'ai' || c === 'ai2') s.ai_claude += 1;
      if (u) { s.you_n += 1; if (u === 'ai' || u === 'ai2') s.ai_you += 1; }
    }
    return {
      id: r.id, moment_at: r.moment_at, proven: !!r.proven, fan_context: r.fan_context || {},
      fan_messages: (r.fan_said || []).map(t => ({ fan_message: t })),
      answers: opts.map((o, i) => ({
        key: LETTERS[i], source: o.source, label: o.source === 'chatter' ? 'Her chatter' : or.writerLabel(o.model || r.ai_model), status: o.status || null,
        messages: o.text.map(t => (o.source === 'chatter' ? { chatter_message: t } : { creator_message: t })),
      })),
      your_pick: u, claude_pick: c, claude_reason: r.claude_reason, outcome: r.outcome, situations: (r.situations || []).map(strategy.situationTitle),
    };
  });
  return {
    batch, total: rows.length, cost: round(cost), writers, you, claude,
    proven: { n: rows.filter(r => r.proven).length, you: provenYou, claude: provenClaude },
    real_check: realCheck, by_situation: Object.values(bySituation).sort((x, y) => y.n - x.n), duels: list,
  };
}

module.exports = { startDuels, duelJob, overview, nextDuel, vote, results, _test: { findMoments, sample } };
