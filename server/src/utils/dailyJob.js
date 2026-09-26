const { supabaseAdmin } = require('./supabase');
const { computeChatterDailyMetrics } = require('./computeChatterMetrics');
const { runDailyCheck } = require('./dailyCheck');
const { saveEvaluation } = require('./evaluationStore');
const { rebuildQueue } = require('./taskQueue');
const { evaluateChatterDay, prepareChatterDay } = require('../ai/evaluateChatterDay');
const { runAgentDetailed } = require('../ai/agentRunner');
const { runBatch } = require('../ai/batchRunner');
const { loadCorrections, dayWindow } = require('../ai/evalShared');

/**
 * The daily review as a server job: recompute the day's metrics, run the daily
 * check, review every chatter with the AI, save the reviews, then build and rank
 * the task queue. It used to run in the manager's browser tab and stopped when
 * the tab closed.
 *
 * mode 'direct' — normal API calls, 3 at a time (a manager is watching).
 * mode 'batch'  — the Batch API at half the price (the automatic run after an
 *                 upload, where nobody is waiting). Any call the batch couldn't
 *                 finish is retried directly.
 *
 * State lives in memory (one job per organisation, later dates queue behind it):
 * a server restart forgets it, and the next upload or button press starts again.
 */
const jobs = new Map();     // orgId -> state of the current / last job
const queued = new Map();   // orgId -> [{ reportDate, opts }]

function getDailyReviewStatus(orgId) {
  const st = jobs.get(orgId);
  return st ? { ...st, queued: (queued.get(orgId) || []).map(q => q.reportDate) } : null;
}

function startDailyReview(orgId, reportDate, opts = {}) {
  const cur = jobs.get(orgId);
  if (cur && !cur.finished_at) {
    if (cur.report_date !== reportDate) {
      const q = queued.get(orgId) || [];
      if (!q.some(x => x.reportDate === reportDate)) q.push({ reportDate, opts });
      queued.set(orgId, q);
    }
    return { started: false, status: getDailyReviewStatus(orgId) };
  }
  const state = {
    report_date: reportDate, mode: opts.mode || 'direct', trigger: opts.trigger || 'manual',
    stage: 'calc', done: 0, total: 0, errors: 0, current: null,
    started_at: new Date().toISOString(), finished_at: null, error: null, result: null,
  };
  jobs.set(orgId, state);
  run(orgId, state, opts)
    .catch(e => { state.error = e.message; console.error(`[DailyJob] ${reportDate} failed:`, e); })
    .finally(() => {
      state.stage = state.error ? 'error' : 'done';
      state.current = null;
      state.finished_at = new Date().toISOString();
      const next = (queued.get(orgId) || []).shift();
      if (next) startDailyReview(orgId, next.reportDate, next.opts);
    });
  return { started: true, status: getDailyReviewStatus(orgId) };
}

// The deterministic work facts stamped into each stored review (same as the
// Daily Check page sent when it ran the review itself).
function chatterFacts(c) {
  return {
    workload_status: c.workload_status || null,
    reply_time_avg_seconds: c.reply_time_avg_seconds ?? null,
    total_messages: c.total_messages ?? null,
    pages: (c.pages || []).length,
    punctuality: c.punctuality?.label || c.punctuality?.state || null,
  };
}

async function pool(items, concurrency, worker) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (i < items.length) { const idx = i++; await worker(items[idx]); }
  }));
}

async function run(orgId, state, { model = 'sonnet', mode = 'direct', buildQueue = true, skipMetrics = false }) {
  const date = state.report_date;
  if (!skipMetrics) await computeChatterDailyMetrics(orgId, { dates: [date] });
  const check = await runDailyCheck(orgId, date);
  const chatters = check.chatters || [];
  state.total_flags = check.total_flags;
  state.stage = 'evaluate';
  state.total = chatters.length;

  const corrections = await loadCorrections(orgId, date);   // same for every chatter in the run
  // The day's message count at review time, so a later upload can tell whether the day grew.
  const dayMessages = await countDayMessages(orgId, date);
  const save = async (c, result) => {
    if (result.evaluation) {
      result.evaluation.metrics = chatterFacts(c);
      result.evaluation.coverage = { ...(result.evaluation.coverage || {}), day_messages: dayMessages };
    }
    await saveEvaluation({ orgId, reportDate: date, result, chatterId: c.chatter_id });
  };

  if (mode === 'batch') {
    const preps = [];
    await pool(chatters, 3, async (c) => {
      const prep = await prepareChatterDay({ orgId, chatterId: c.chatter_id, reportDate: date, model, corrections });
      if (prep.ok) preps.push({ c, prep });
      else { state.errors++; state.done++; }
    });
    const results = await runBatch(preps.map(({ c, prep }) => ({ id: c.chatter_id, ...prep.request })),
      { onPoll: (counts) => { state.batch = counts; } });
    for (const { c, prep } of preps) {
      state.current = c.chatter_name;
      let r = results.get(c.chatter_id);
      if (!r || r.error) {
        try { r = await runAgentDetailed(prep.request); }
        catch (e) { r = null; console.error(`[DailyJob] ${c.chatter_name}: ${e.message}`); }
      }
      if (r?.result) await save(c, prep.finish(r.result, r.usage, null));
      else state.errors++;
      state.done++;
    }
  } else {
    await pool(chatters, 3, async (c) => {
      state.current = c.chatter_name;
      const r = await evaluateChatterDay({ orgId, chatterId: c.chatter_id, reportDate: date, model, corrections });
      if (r.ok) await save(c, r); else state.errors++;
      state.done++;
    });
  }

  if (buildQueue) {
    state.stage = 'tasks';
    const q = await rebuildQueue(orgId, date, model);
    state.result = { created: q.built?.created || 0, carried: q.built?.carried || 0, reopened: q.built?.reopened || 0, rank_error: q.rankError || null };
  }
}

async function countDayMessages(orgId, reportDate) {
  const { start, end } = dayWindow(reportDate);
  const { count } = await supabaseAdmin.from('messages').select('id', { count: 'exact', head: true })
    .eq('organisation_id', orgId).gte('sent_datetime', start).lt('sent_datetime', end);
  return count || 0;
}

/**
 * After a message upload: review the day automatically (batch mode) when it's a
 * finished day that hasn't been reviewed yet, or that grew by more than 10%
 * since its last review (a partial export topped up later). Switch off with the
 * daily_check_config key auto_daily_review = "off".
 */
async function maybeAutoReview(orgId, reportDate) {
  const { data: cfg } = await supabaseAdmin.from('daily_check_config').select('value')
    .eq('organisation_id', orgId).eq('key', 'auto_daily_review').maybeSingle();
  if (String(cfg?.value || '').toLowerCase() === 'off') return { skipped: 'disabled' };

  const { end } = dayWindow(reportDate);
  if (Date.now() < Date.parse(end)) return { skipped: 'day not finished' };

  const count = await countDayMessages(orgId, reportDate);
  if (!count) return { skipped: 'no messages' };

  const { data: evals } = await supabaseAdmin.from('chatter_evaluations').select('payload')
    .eq('organisation_id', orgId).eq('report_date', reportDate).eq('eval_type', 'compliance');
  if (evals?.length) {
    // Reviewed before: only again if the day grew by more than 10% since then.
    // A review without a recorded day size (older, or a single-chatter run) counts as current.
    const before = Math.max(0, ...evals.map(e => e.payload?.coverage?.day_messages || 0));
    if (!before || count <= before * 1.1) return { skipped: 'already reviewed' };
  }
  return startDailyReview(orgId, reportDate, { mode: 'batch', trigger: 'upload', skipMetrics: true });
}

module.exports = { startDailyReview, getDailyReviewStatus, maybeAutoReview };
