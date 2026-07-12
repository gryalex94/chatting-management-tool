const router = require('express').Router();
const { supabaseAdmin } = require('../utils/supabase');
const { runDailyCheck } = require('../utils/dailyCheck');
const { evaluateChatterDay } = require('../ai/evaluateChatterDay');
const { evaluateChatterSales } = require('../ai/evaluateChatterSales');
const { evaluateCreatorDay } = require('../ai/evaluateCreatorDay');
const { saveEvaluation, getEvaluations, getEvaluationsForDate, getLatestEvaluations, getEvaluationHistory } = require('../utils/evaluationStore');
const { buildOverview } = require('../utils/overview');
const { buildTasksForChatterEval } = require('../utils/taskGenerator');

// Build tasks from EVERY stored eval (compliance + strategy) for one chatter/day,
// so a per-chatter run surfaces all of that chatter's tasks at once.
async function buildAllChatterTasks(orgId, reportDate, chatterId) {
  const evals = await getEvaluations(orgId, chatterId, reportDate);
  let created = 0, updated = 0;
  for (const ev of evals) {
    const r = await buildTasksForChatterEval(orgId, reportDate, chatterId, ev.eval_type, ev.evaluation?.issues || []);
    created += r.created || 0; updated += r.updated || 0;
  }
  return { created, updated };
}

/**
 * POST /api/daily-check/run
 * Body: { report_date: "YYYY-MM-DD" }
 * Computes flags from stored facts, persists them, returns the page-grouped list.
 */
router.post('/run', async (req, res) => {
  try {
    const { report_date, recompute } = req.body;
    if (!report_date) return res.status(400).json({ error: 'report_date is required' });
    // recompute:true rebuilds the merged-day chatter_daily_metrics from messages
    // first (e.g. after a code change to the incident detail), then runs the check.
    if (recompute) {
      const { computeChatterDailyMetrics } = require('../utils/computeChatterMetrics');
      await computeChatterDailyMetrics(req.user.organisationId);
    }
    const result = await runDailyCheck(req.user.organisationId, report_date);
    res.json(result);
  } catch (err) {
    console.error('[DailyCheck] run error:', err);
    res.status(500).json({ error: err.message || 'Daily check failed' });
  }
});

/**
 * GET /api/daily-check/evaluations?chatter_id=...&report_date=...
 * Returns the stored AI evaluations (both types) for a chatter on a day, so the
 * UI can show them instantly without re-running (and re-paying for) the AI.
 * NOTE: must be registered before '/:date' or it gets caught as a date param.
 */
router.get('/evaluations', async (req, res) => {
  try {
    const { chatter_id, report_date } = req.query;
    if (!chatter_id || !report_date) return res.status(400).json({ error: 'chatter_id and report_date are required' });
    const evaluations = await getEvaluations(req.user.organisationId, chatter_id, report_date);
    res.json({ evaluations });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load evaluations' });
  }
});

/**
 * GET /api/daily-check/evaluations-all?report_date=...
 * All stored evaluations for every chatter on a day (for at-a-glance badges).
 * Must be registered before '/:date'.
 */
router.get('/evaluations-all', async (req, res) => {
  try {
    const { report_date } = req.query;
    if (!report_date) return res.status(400).json({ error: 'report_date is required' });
    const evaluations = await getEvaluationsForDate(req.user.organisationId, report_date);
    res.json({ evaluations });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load evaluations' });
  }
});

/**
 * GET /api/daily-check/chatter-evals?chatter_id=...
 * The latest stored AI evaluation of each type for one chatter (for the profile).
 * Must be registered before '/:date'.
 */
router.get('/chatter-evals', async (req, res) => {
  try {
    const { chatter_id } = req.query;
    if (!chatter_id) return res.status(400).json({ error: 'chatter_id is required' });
    const evaluations = await getLatestEvaluations(req.user.organisationId, chatter_id);
    res.json({ evaluations });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load evaluations' });
  }
});

// Full evaluation history for one chatter (all dates) — the Reports timeline.
router.get('/chatter-eval-history', async (req, res) => {
  try {
    const { chatter_id } = req.query;
    if (!chatter_id) return res.status(400).json({ error: 'chatter_id is required' });
    const evaluations = await getEvaluationHistory(req.user.organisationId, chatter_id);
    res.json({ evaluations });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load evaluation history' });
  }
});

/**
 * GET /api/daily-check/overview?date=...
 * Home overview: day-review + chatter/page rankings with deltas. Before '/:date'.
 */
router.get('/overview', async (req, res) => {
  try {
    const date = req.query.date;
    if (!date) return res.status(400).json({ error: 'date is required' });
    const overview = await buildOverview(req.user.organisationId, date);
    res.json(overview);
  } catch (err) {
    console.error('[DailyCheck] overview error:', err);
    res.status(500).json({ error: 'Failed to build overview' });
  }
});

/**
 * GET /api/daily-check/:date
 * Returns the already-computed flags for a date (does not recompute).
 */
router.get('/:date', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('anomaly_flags')
      .select('*')
      .eq('organisation_id', req.user.organisationId)
      .eq('report_date', req.params.date)
      .order('score', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json({ report_date: req.params.date, flags: data || [] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch daily check' });
  }
});

/**
 * PATCH /api/daily-check/flag/:id
 * Body: { status: 'open'|'grabbed'|'done'|'dismissed' }
 * Manager grabs / completes / dismisses a flag.
 */
router.patch('/flag/:id', async (req, res) => {
  try {
    const { status } = req.body;
    const allowed = ['open', 'grabbed', 'done', 'dismissed'];
    if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status' });

    const update = { status };
    if (status === 'done' || status === 'dismissed') {
      update.resolved = true;
      update.resolved_by = req.user.id;
      update.resolved_at = new Date().toISOString();
    } else {
      update.resolved = false;
    }

    const { data, error } = await supabaseAdmin
      .from('anomaly_flags')
      .update(update)
      .eq('id', req.params.id)
      .eq('organisation_id', req.user.organisationId)
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update flag' });
  }
});

/**
 * POST /api/daily-check/evaluate
 * Body: { chatter_id, report_date, creator_id? }
 * On-demand AI evaluation of a chatter's conversation quality (opinion layer).
 */
router.post('/evaluate', async (req, res) => {
  try {
    const { chatter_id, report_date, creator_id, model, prompt_version, eval_type, creator_name, metrics, flags } = req.body;
    if (!report_date) return res.status(400).json({ error: 'report_date is required' });
    const orgId = req.user.organisationId;

    let result;
    if (eval_type === 'creator') {
      if (!creator_id) return res.status(400).json({ error: 'creator_id is required' });
      result = await evaluateCreatorDay({ orgId, creatorId: creator_id, creatorName: creator_name, reportDate: report_date, metrics, flags, model: model || 'sonnet' });
    } else {
      if (!chatter_id) return res.status(400).json({ error: 'chatter_id is required' });
      const common = { orgId, chatterId: chatter_id, reportDate: report_date, creatorId: creator_id || null, model: model || 'sonnet' };
      result = eval_type === 'sales_quality'
        ? await evaluateChatterSales(common)
        : await evaluateChatterDay({ ...common, promptVersion: prompt_version || 'A' });
    }

    if (!result.ok) return res.status(200).json({ ok: false, reason: result.reason });

    // Stamp the calculated snapshot this report was based on into the payload, so
    // each stored report is self-contained for the later Opus correlation layer.
    // (creator → page metrics; chatter → the deterministic work facts.)
    if (metrics && result.evaluation) result.evaluation.metrics = metrics;

    // File the result so it can be shown instantly next time (and synthesised later).
    const createdAt = await saveEvaluation({
      orgId, reportDate: report_date, result,
      chatterId: eval_type === 'creator' ? null : chatter_id,
      creatorId: eval_type === 'creator' ? creator_id : null,
    });

    // A manual per-chatter run populates ALL of this chatter's tasks (compliance +
    // strategy) from every stored eval for the day — so it doesn't need a separate
    // Home rebuild. The daily batch omits build_tasks and lets the Home build apply
    // tenure gating. sales_quality always builds (it's only ever run manually).
    let tasks_added = null;
    if ((req.body.build_tasks || eval_type === 'sales_quality') && chatter_id) {
      try { tasks_added = await buildAllChatterTasks(orgId, report_date, chatter_id); }
      catch (e) { console.error('[DailyCheck] chatter-eval tasks error:', e.message); }
    }
    res.json({ ...result, created_at: createdAt || new Date().toISOString(), tasks_added });
  } catch (err) {
    console.error('[DailyCheck] evaluate error:', err);
    res.status(500).json({ error: err.message || 'Evaluation failed' });
  }
});

module.exports = router;
