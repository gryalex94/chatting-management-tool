const router = require('express').Router();
const crypto = require('crypto');
const { supabaseAdmin } = require('../utils/supabase');
const { requireMinRole } = require('../middleware/auth');
const { buildTasksForDate, capLiveQueue, buildSpenderDevelopmentTasks } = require('../utils/taskGenerator');
const { prioritiseTasks } = require('../ai/prioritiseTasks');

// POST /api/review-tasks/custom — a manager-created task that pins ABOVE the AI
// queue. Reuses the tasks table (source_type='custom') so the generator and the
// AI prioritiser leave it alone. Importance rides on severity; the assignee is a
// label for now. Higher-tier managers only.
router.post('/custom', requireMinRole('head_manager'), async (req, res) => {
  try {
    const orgId = req.user.organisationId;
    const { title, detail, important, creator_id, chatter_id, assigned_to_name } = req.body;
    if (!title || !String(title).trim()) return res.status(400).json({ error: 'Title is required' });

    let creator_name = null, chatter_name = null;
    if (creator_id) { const { data } = await supabaseAdmin.from('creators').select('name').eq('id', creator_id).eq('organisation_id', orgId).maybeSingle(); creator_name = data?.name || null; }
    if (chatter_id) { const { data } = await supabaseAdmin.from('chatters').select('name').eq('id', chatter_id).eq('organisation_id', orgId).maybeSingle(); chatter_name = data?.name || null; }

    const today = new Date().toISOString().slice(0, 10);
    const row = {
      organisation_id: orgId,
      source_type: 'custom',
      fingerprint: 'custom:' + crypto.randomUUID(),
      creator_id: creator_id || null, creator_name,
      chatter_id: chatter_id || null, chatter_name,
      area: 'custom',
      severity: important ? 'critical' : 'medium',
      title: String(title).trim(),
      detail: detail ? String(detail).trim() : '',
      context: { is_custom: true, important: !!important, assigned_to_name: assigned_to_name || null, created_by: req.user.name || null },
      status: 'open',
      priority: 0,
      cluster_key: 'custom',
      first_seen_date: today, last_seen_date: today, days_open: 1,
      owner_id: req.user.id,
    };
    const { data, error } = await supabaseAdmin.from('review_tasks').insert(row).select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create custom task' });
  }
});

// GET /api/review-tasks?status=open,taken  — the queue / backlog
router.get('/', async (req, res) => {
  try {
    const orgId = req.user.organisationId;
    let q = supabaseAdmin.from('review_tasks').select('*').eq('organisation_id', orgId);
    if (req.query.status) q = q.in('status', String(req.query.status).split(','));
    if (req.query.chatter_id) q = q.eq('chatter_id', req.query.chatter_id);
    const { data, error } = await q.order('priority', { ascending: true, nullsFirst: false }).order('severity', { ascending: true });
    if (error) return res.status(500).json({ error: error.message });
    res.json({ tasks: data || [] });
  } catch {
    res.status(500).json({ error: 'Failed to load tasks' });
  }
});

// POST /api/review-tasks/rebuild  { report_date }  — build from reports/flags, then rank
router.post('/rebuild', async (req, res) => {
  try {
    const { report_date, model } = req.body;
    if (!report_date) return res.status(400).json({ error: 'report_date is required' });
    const orgId = req.user.organisationId;
    const built = await buildTasksForDate(orgId, report_date);
    // weekly PS/whale development — one bundled task per page (safe per-page cap)
    let spenderDev = { created: 0, updated: 0, pages: 0 };
    try { spenderDev = await buildSpenderDevelopmentTasks(orgId, report_date); }
    catch (e) { console.error('[reviewTasks] spender-dev error:', e.message); }
    const ranked = await prioritiseTasks(orgId, report_date, model || 'sonnet');
    // deterministic backstop: keep the live queue under the cap (configurable)
    const { data: capCfg } = await supabaseAdmin.from('daily_check_config')
      .select('value').eq('organisation_id', orgId).eq('key', 'live_queue_cap').maybeSingle();
    const capped = await capLiveQueue(orgId, parseInt(capCfg?.value, 10) || 150);
    // persist the day-review narrative so Home can show it without re-running
    try {
      await supabaseAdmin.from('daily_reviews').delete().match({ organisation_id: orgId, report_date });
      await supabaseAdmin.from('daily_reviews').insert({ organisation_id: orgId, report_date, summary: ranked.summary || null, day_review: ranked.day_review || null });
    } catch (e) { console.error('[reviewTasks] day_review store error:', e.message); }
    const { data } = await supabaseAdmin.from('review_tasks').select('*')
      .eq('organisation_id', orgId).in('status', ['open', 'taken'])
      .order('priority', { ascending: true, nullsFirst: false });
    res.json({ built, spenderDev, ranked, capped, tasks: data || [] });
  } catch (err) {
    console.error('[reviewTasks] rebuild error:', err);
    res.status(500).json({ error: err.message || 'Rebuild failed' });
  }
});

// PATCH /api/review-tasks/:id  { action: 'take' | 'complete' | 'dismiss' | 'reopen' }
router.patch('/:id', async (req, res) => {
  try {
    const { action, reason } = req.body;
    const now = new Date().toISOString();
    const update = { updated_at: now };
    if (action === 'take') { update.status = 'taken'; update.taken_by = req.user.id; update.taken_at = now; }
    else if (action === 'complete') { update.status = 'completed'; update.completed_at = now; update.resolved_by = req.user.id; }
    else if (action === 'dismiss') {
      // Dismissing requires a reason CATEGORY (one of the 6) — the calibration
      // signal we keep to improve the AI prompts later. 'other' needs a note.
      const code = req.body.reason_code;
      const note = reason ? String(reason).trim() : '';
      const valid = ['allowed', 'needs_context', 'misread', 'too_minor', 'fan_fault', 'other'];
      if (!valid.includes(code)) return res.status(400).json({ error: 'A dismissal reason is required' });
      if (code === 'other' && !note) return res.status(400).json({ error: 'Please explain the reason' });
      update.status = 'dismissed'; update.resolved_by = req.user.id; update.completed_at = now;
      update.dismiss_reason_code = code;
      update.dismiss_reason = note || null;
    }
    else if (action === 'archive') { update.status = 'archived'; update.completed_at = now; update.resolved_by = req.user.id; }
    else if (action === 'reopen') { update.status = 'open'; update.taken_by = null; update.taken_at = null; update.completed_at = null; }
    // Coaching flags are orthogonal to task status — a task can be saved for a
    // later coaching session regardless of whether it's open/taken/completed.
    else if (action === 'coach') { update.coach_flag = true; }
    else if (action === 'uncoach') { update.coach_flag = false; update.coached_at = null; }
    else if (action === 'coached') { update.coached_at = now; }
    else if (action === 'uncoached') { update.coached_at = null; }
    else return res.status(400).json({ error: 'Invalid action' });

    const { data, error } = await supabaseAdmin.from('review_tasks')
      .update(update).eq('id', req.params.id).eq('organisation_id', req.user.organisationId).select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch {
    res.status(500).json({ error: 'Failed to update task' });
  }
});

module.exports = router;
