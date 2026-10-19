/**
 * The AI chat's blind test (database change 037): does the AI beat her chatters?
 *  - Real moments from her chats: a fan wrote and her chatter typed the answer
 *    within the hour (not Fanvue's AI writer, nothing paid or about prices, nothing
 *    the safety screen would stop).
 *  - For each, the AI writes its own answer from the same chat up to that moment
 *    (no fan notes: they were built from later messages too), with her profile,
 *    game plan and the Playbook situations, through all its checks.
 *  - The two answers are shown as A and B in random order. A manager picks the
 *    better one without knowing which is which; Claude judges them the same way.
 *  - For the chatter's answer we also know what really happened next: did he
 *    write back within a day, did he buy.
 */
const { supabaseAdmin } = require('./supabase');
const A = require('./aiChat');
const or = require('../integrations/openrouter');
const strategy = require('../ai/chat/strategy');
const { screenFan } = require('../ai/chat/safety');
const { judgeDuel, MODEL: CHECK_MODEL } = require('../ai/chat/review');

const E = A._engine;
const NOT_READY = 'Run database change 037 (AI blind test) in Supabase first';
const SELLING = /\$\s?\d|\b\d+\s?(?:usd|dollars?|bucks)\b|\bppv\b|\bunlock\w*|\btips?\b|\bvault\b/i;
const ANSWERED_WITHIN = 60 * 60_000;      // her chatter answered within the hour
const SAME_REPLY = 10 * 60_000;           // her messages that belong to one answer
const OUTCOME_WITHIN = 24 * 3600_000;     // he wrote back / bought within a day
const PER_FAN = 2;
const round = (n) => Math.round(n * 1e6) / 1e6;
const tableMissing = (e) => /ai_duels/.test(String(e?.message || ''));

/** Every usable moment in an account's chats, with what happened after the chatter's answer. */
async function findMoments(accountId) {
  const [rows, earn] = await Promise.all([
    E.all(() => supabaseAdmin.from('fanvue_messages').select('uuid, fan_uuid, from_fan, type, text, sent_at').eq('account_id', accountId)
      .neq('type', 'BROADCAST').order('fan_uuid').order('sent_at').order('uuid')),
    E.all(() => supabaseAdmin.from('fanvue_earnings').select('fan_uuid, source, paid_at, message_uuid').eq('account_id', accountId).order('paid_at').order('transaction_order_id')),
  ]);
  const paidMessage = new Set(earn.filter(e => e.message_uuid).map(e => e.message_uuid));
  const buys = {};
  for (const e of earn) if (e.source === 'message' || e.source === 'tip') (buys[e.fan_uuid] ||= []).push(Date.parse(e.paid_at));
  const byFan = {};
  for (const m of rows) if (m.sent_at && (m.from_fan || !E.isMass(m.type))) (byFan[m.fan_uuid] ||= []).push(m);

  const out = [];
  for (const [fan, list] of Object.entries(byFan)) {
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
      out.push({
        fan_uuid: fan, at: list[j].sent_at, latest,
        context: list.slice(0, j + 1),
        human: answer.map(m => m.text.trim()),
        outcome: {
          replied: !!nextAt && nextAt - answerEnd <= OUTCOME_WITHIN,
          reply_after_min: nextAt && nextAt - answerEnd <= OUTCOME_WITHIN ? Math.round((nextAt - answerEnd) / 60_000) : null,
          bought: (buys[fan] || []).some(t => t > herAt && t - herAt <= OUTCOME_WITHIN),
        },
      });
    }
  }
  return out;
}

// A random spread: at most PER_FAN moments per fan.
function sample(pool, n) {
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  const per = {}, out = [];
  for (const m of shuffled) {
    if ((per[m.fan_uuid] || 0) >= PER_FAN) continue;
    per[m.fan_uuid] = (per[m.fan_uuid] || 0) + 1;
    out.push(m);
    if (out.length >= n) break;
  }
  return out;
}

// One moment: the AI's answer, Claude's blind vote, saved. Returns what it cost.
async function oneDuel({ orgId, creatorId, accountId, persona, examples, model, batch, m }) {
  const chat = m.context.map(x => ({ at: x.sent_at, from_fan: x.from_fan, text: x.text || '', mass: false }));
  const win = E.windowFor(chat);
  const plan = await E.pickSituations(orgId, creatorId, m.fan_uuid, win.messages, null);
  const base = {
    profile: persona.profile, examples, fan: {}, card: [], money: null, story: '', chat: win.messages,
    notes: screenFan(m.latest).notes, situations: strategy.situationGuide(plan.ids),
  };
  const recentHer = chat.filter(x => !x.from_fan).slice(-8).map(x => x.text);
  const res = await E.writeOne({ orgId, creatorId, fanUuid: m.fan_uuid, model, base, latest: m.latest, recentHer, speed: 'normal', emojis: persona.settings?.emojis || 'rarely' });
  const ai = (res.replies || []).map(r => r.creator_message).filter(Boolean);
  if (res.status === 'error' || !ai.length) throw new Error(res.error || 'The AI wrote no reply');
  const aiSide = Math.random() < 0.5 ? 'A' : 'B';
  const [a, b] = aiSide === 'A' ? [ai, m.human] : [m.human, ai];
  let vote = null, reason = null, judged = 0;
  try {
    const j = await judgeDuel({ profile: persona.profile, chat: win.messages.slice(-12), a, b });
    judged = j.usage.cost;
    await E.logUsage(orgId, 'check', CHECK_MODEL, j.usage, { creatorId, fanUuid: m.fan_uuid });
    vote = j.declined ? null : j.better;
    reason = j.reason;
  } catch (e) { reason = `Claude couldn't judge it (${e.message.slice(0, 80)})`; }
  const cost = (res.cost || 0) + plan.cost + judged;
  const { error } = await supabaseAdmin.from('ai_duels').insert({
    organisation_id: orgId, creator_id: creatorId, account_id: accountId, batch, fan_uuid: m.fan_uuid, moment_at: m.at,
    fan_said: m.latest, human: m.human, ai, ai_model: model, ai_status: res.status, situations: plan.ids, ai_side: aiSide, outcome: m.outcome,
    claude_vote: vote, claude_reason: reason, cost_usd: round(cost),
  });
  if (error) throw new Error(error.message);
  return cost;
}

// One test run per page at a time, in the background.
const jobs = new Map();
const duelJob = (creatorId) => jobs.get(creatorId) || null;

/** Start a blind test on `count` moments (20–150). */
async function startDuels(orgId, creatorId, count = 100) {
  if (jobs.get(creatorId)?.running) return jobs.get(creatorId);
  if (!or.configured()) throw new A.AiChatError('Add OPENROUTER_API_KEY to the server settings first', 409);
  const { error } = await supabaseAdmin.from('ai_duels').select('id').limit(1);
  if (error) throw new A.AiChatError(tableMissing(error) ? NOT_READY : error.message, tableMissing(error) ? 409 : 500);
  const { account } = await E.pageAccount(orgId, creatorId);
  const persona = await E.loadPersona(orgId, creatorId);
  if (!String(persona?.profile?.name || '').trim()) throw new A.AiChatError('Set up her profile first (Her profile)', 409);
  const picked = sample(await findMoments(account.id), Math.min(150, Math.max(20, Number(count) || 100)));
  if (picked.length < 5) throw new A.AiChatError('There are too few moments in her chats where a chatter answered a fan', 409);
  const examples = persona.profile.examples?.length ? persona.profile.examples : await E.styleExamples(account.id);
  const model = persona.settings?.writer || or.DEFAULT_WRITER;
  const batch = new Date().toISOString();
  const job = { running: true, batch, total: picked.length, done: 0, failed: 0, cost: 0, last_error: null, finished_at: null };
  jobs.set(creatorId, job);
  const queue = [...picked];
  const worker = async () => {
    while (queue.length) {
      const m = queue.shift();
      try { job.cost += await oneDuel({ orgId, creatorId, accountId: account.id, persona, examples, model, batch, m }); }
      catch (e) { job.failed += 1; job.last_error = e.message; console.error('[ai-duels]', e.message); }
      finally { job.done += 1; }
    }
  };
  Promise.all([worker(), worker(), worker()]).finally(() => { job.running = false; job.finished_at = new Date().toISOString(); });
  return job;
}

async function batchRows(orgId, creatorId, batch, cols = '*') {
  const rows = await E.all(() => supabaseAdmin.from('ai_duels').select(cols).eq('organisation_id', orgId).eq('creator_id', creatorId).eq('batch', batch).order('id'))
    .catch((e) => { if (tableMissing(e)) throw new A.AiChatError(NOT_READY, 409); throw e; });
  return rows;
}

// Who won, from the side a vote picked: 'ai', 'chatter' or 'tie'.
const winner = (vote, aiSide) => (!vote ? null : vote === 'tie' ? 'tie' : vote === aiSide ? 'ai' : 'chatter');

/** The test runs so far (newest first) and the running job. */
async function overview(orgId, creatorId) {
  await E.pageAccount(orgId, creatorId);
  const { data, error } = await supabaseAdmin.from('ai_duels').select('batch, user_vote, claude_vote, ai_side')
    .eq('organisation_id', orgId).eq('creator_id', creatorId).order('batch', { ascending: false }).limit(5000);
  if (error) {
    if (tableMissing(error)) return { ready: false, batches: [], job: duelJob(creatorId) };
    throw new Error(error.message);
  }
  const by = {};
  for (const r of data) {
    const key = new Date(r.batch).toISOString();            // the same run, however the database writes the time
    const b = (by[key] ||= { batch: key, total: 0, voted: 0 });
    b.total += 1;
    if (r.user_vote) b.voted += 1;
  }
  return { ready: true, batches: Object.values(by), job: duelJob(creatorId) };
}

/** The next moment to vote on in a run, without saying which answer is the AI's. */
async function nextDuel(orgId, creatorId, batch) {
  const rows = await batchRows(orgId, creatorId, batch, 'id, account_id, fan_uuid, moment_at, human, ai, ai_side, user_vote');
  const left = rows.filter(r => !r.user_vote);
  if (!left.length) return { done: true, total: rows.length, voted: rows.length };
  const d = left[0];
  const { data: ctx } = await supabaseAdmin.from('fanvue_messages').select('from_fan, type, text, sent_at')
    .eq('account_id', d.account_id).eq('fan_uuid', d.fan_uuid).lte('sent_at', d.moment_at).neq('type', 'BROADCAST')
    .order('sent_at', { ascending: false }).limit(40);
  const context = (ctx || []).filter(m => m.from_fan || !E.isMass(m.type)).slice(0, 12).reverse()
    .map(m => ({ sent_at: m.sent_at, from_fan: m.from_fan, message: m.text || '' }));
  const [a, b] = d.ai_side === 'A' ? [d.ai, d.human] : [d.human, d.ai];
  return {
    done: false, id: d.id, number: rows.length - left.length + 1, total: rows.length, voted: rows.length - left.length,
    context, a: a.map(t => ({ creator_message: t })), b: b.map(t => ({ creator_message: t })),
  };
}

/** A manager's vote: 'A', 'B' or 'tie'. Returns the next moment. */
async function vote(orgId, creatorId, duelId, choice, userId) {
  if (!['A', 'B', 'tie'].includes(choice)) throw new A.AiChatError('Pick A, B or "can\'t choose"');
  const { data, error } = await supabaseAdmin.from('ai_duels').update({ user_vote: choice, voted_by: userId, voted_at: new Date().toISOString() })
    .eq('id', duelId).eq('organisation_id', orgId).eq('creator_id', creatorId).select('batch').maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new A.AiChatError('Not found', 404);
  return nextDuel(orgId, creatorId, data.batch);
}

/** A run's results, with every answer revealed. */
async function results(orgId, creatorId, batch) {
  const rows = await batchRows(orgId, creatorId, batch);
  const tally = () => ({ ai: 0, chatter: 0, tie: 0 });
  const you = tally(), claude = tally();
  const realCheck = { answered: { n: 0, chatter: 0 }, unanswered: { n: 0, chatter: 0 } };
  const bySituation = {};
  let cost = 0;
  const list = rows.map((r) => {
    cost += Number(r.cost_usd) || 0;
    const u = winner(r.user_vote, r.ai_side), c = winner(r.claude_vote, r.ai_side);
    if (u) you[u] += 1;
    if (c) {
      claude[c] += 1;
      const k = r.outcome?.replied ? 'answered' : 'unanswered';
      realCheck[k].n += 1;
      if (c === 'chatter') realCheck[k].chatter += 1;
    }
    for (const id of r.situations || []) {
      const s = (bySituation[id] ||= { title: strategy.situationTitle(id), n: 0, ai_claude: 0, ai_you: 0, you_n: 0 });
      s.n += 1;
      if (c === 'ai') s.ai_claude += 1;
      if (u) { s.you_n += 1; if (u === 'ai') s.ai_you += 1; }
    }
    return {
      id: r.id, moment_at: r.moment_at, ai_side: r.ai_side, ai_status: r.ai_status,
      fan_messages: (r.fan_said || []).map(t => ({ fan_message: t })),
      chatter_messages: r.human.map(t => ({ chatter_message: t })), ai_messages: r.ai.map(t => ({ creator_message: t })),
      your_pick: u, claude_pick: c, claude_reason: r.claude_reason, outcome: r.outcome,
      situations: (r.situations || []).map(strategy.situationTitle),
    };
  });
  return {
    batch, total: rows.length, cost: round(cost), you, claude, real_check: realCheck,
    by_situation: Object.values(bySituation).sort((x, y) => y.n - x.n), duels: list,
  };
}

module.exports = { startDuels, duelJob, overview, nextDuel, vote, results, _test: { findMoments, sample } };
