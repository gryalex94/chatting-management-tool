const { supabaseAdmin } = require('./supabase');

// Save an AI evaluation result. The subject is a chatter (chatterId) OR a
// creator/page (creatorId). We delete-then-insert the matching slot so the
// latest run overwrites it — one current result per subject/day/type.
async function saveEvaluation({ orgId, chatterId = null, creatorId = null, reportDate, result }) {
  const key = {
    organisation_id: orgId,
    report_date: reportDate,
    eval_type: result.eval_type,
  };
  if (creatorId) key.creator_id = creatorId; else key.chatter_id = chatterId;

  try {
    await supabaseAdmin.from('chatter_evaluations').delete().match(key);
  } catch (e) { console.error('[evalStore] delete error:', e.message); }

  const row = {
    organisation_id: orgId,
    chatter_id: chatterId || null,
    creator_id: creatorId || null,
    report_date: reportDate,
    eval_type: result.eval_type,
    model: result.model_id || null,
    prompt_version: result.prompt_version || null,
    payload: result.evaluation,
    input_tokens: result.usage?.input_tokens ?? null,
    output_tokens: result.usage?.output_tokens ?? null,
  };
  const { data, error } = await supabaseAdmin
    .from('chatter_evaluations').insert(row).select('created_at').maybeSingle();
  if (error) { console.error('[evalStore] save error:', error.message); return null; }
  return data?.created_at || null;
}

function shape(r) {
  return {
    ok: true,
    chatter_id: r.chatter_id,
    creator_id: r.creator_id,
    eval_type: r.eval_type,
    model_id: r.model,
    prompt_version: r.prompt_version,
    created_at: r.created_at,
    evaluation: r.payload,
    stored: true,
  };
}

// Stored evaluations for one chatter on a day (both types).
async function getEvaluations(orgId, chatterId, reportDate) {
  const { data, error } = await supabaseAdmin
    .from('chatter_evaluations')
    .select('chatter_id, creator_id, eval_type, model, prompt_version, payload, created_at')
    .eq('organisation_id', orgId)
    .eq('chatter_id', chatterId)
    .eq('report_date', reportDate);
  if (error) { console.error('[evalStore] load error:', error.message); return []; }
  return (data || []).map(shape);
}

// The most recent stored evaluation of each type for one chatter (any date), for
// the profile card — so it shows the latest AI read without picking a date.
async function getLatestEvaluations(orgId, chatterId) {
  const { data, error } = await supabaseAdmin
    .from('chatter_evaluations')
    .select('chatter_id, creator_id, eval_type, model, prompt_version, payload, created_at, report_date')
    .eq('organisation_id', orgId)
    .eq('chatter_id', chatterId)
    .order('report_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) { console.error('[evalStore] latest load error:', error.message); return []; }
  const seen = {};
  const out = [];
  for (const r of (data || [])) {
    if (seen[r.eval_type]) continue;
    seen[r.eval_type] = 1;
    out.push({ ...shape(r), report_date: r.report_date });
  }
  return out;
}

// Full history of a chatter's evaluations across all dates (newest first) — for
// the Reports timeline on the profile, so managers can see progress over time.
async function getEvaluationHistory(orgId, chatterId) {
  const { data, error } = await supabaseAdmin
    .from('chatter_evaluations')
    .select('chatter_id, eval_type, model, payload, created_at, report_date')
    .eq('organisation_id', orgId)
    .eq('chatter_id', chatterId)
    .order('report_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) { console.error('[evalStore] history load error:', error.message); return []; }
  return (data || []).map(r => ({ ...shape(r), report_date: r.report_date }));
}

// All stored evaluations (chatter AND creator) for a day — for at-a-glance badges.
async function getEvaluationsForDate(orgId, reportDate) {
  const { data, error } = await supabaseAdmin
    .from('chatter_evaluations')
    .select('chatter_id, creator_id, eval_type, model, prompt_version, payload, created_at')
    .eq('organisation_id', orgId)
    .eq('report_date', reportDate);
  if (error) { console.error('[evalStore] date-load error:', error.message); return []; }
  return (data || []).map(shape);
}

module.exports = { saveEvaluation, getEvaluations, getEvaluationsForDate, getLatestEvaluations, getEvaluationHistory };
