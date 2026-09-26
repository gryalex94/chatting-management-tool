const { supabaseAdmin } = require('./supabase');
const { buildTasksForDate, capLiveQueue, buildSpenderDevelopmentTasks } = require('./taskGenerator');
const { prioritiseTasks } = require('../ai/prioritiseTasks');

/**
 * Build the day's task queue from the stored AI reports + flags, rank it, keep
 * it under the cap and store the day-review narrative. Shared by the "Generate"
 * button (POST /api/review-tasks/rebuild) and the automatic daily review job.
 * If the AI ranker fails, the tasks it would have ranked are already saved, so
 * the cap and summary still run and the error is reported alongside.
 */
async function rebuildQueue(orgId, reportDate, model = 'sonnet') {
  const built = await buildTasksForDate(orgId, reportDate);
  // weekly PS/whale development — one bundled task per page (safe per-page cap)
  let spenderDev = { created: 0, updated: 0, pages: 0 };
  try { spenderDev = await buildSpenderDevelopmentTasks(orgId, reportDate); }
  catch (e) { console.error('[taskQueue] spender-dev error:', e.message); }
  let ranked = {}, rankError = null;
  try { ranked = await prioritiseTasks(orgId, reportDate, model); }
  catch (e) { rankError = e.message; console.error('[taskQueue] ranking error:', e.message); }
  // deterministic backstop: keep the live queue under the cap (configurable)
  const { data: capCfg } = await supabaseAdmin.from('daily_check_config')
    .select('value').eq('organisation_id', orgId).eq('key', 'live_queue_cap').maybeSingle();
  const capped = await capLiveQueue(orgId, parseInt(capCfg?.value, 10) || 150);
  // persist the day-review narrative so Home can show it without re-running
  if (!rankError) {
    try {
      await supabaseAdmin.from('daily_reviews').delete().match({ organisation_id: orgId, report_date: reportDate });
      await supabaseAdmin.from('daily_reviews').insert({ organisation_id: orgId, report_date: reportDate, summary: ranked.summary || null, day_review: ranked.day_review || null });
    } catch (e) { console.error('[taskQueue] day_review store error:', e.message); }
  }
  return { built, spenderDev, ranked, capped, rankError };
}

module.exports = { rebuildQueue };
