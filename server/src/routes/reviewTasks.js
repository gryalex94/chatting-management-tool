const router = require('express').Router();
const crypto = require('crypto');
const { supabaseAdmin } = require('../utils/supabase');
const { requireMinRole } = require('../middleware/auth');
const { allowedModel } = require('../utils/modelPolicy');
const { rebuildQueue } = require('../utils/taskQueue');
const { dayWindow, stripTags } = require('../ai/evalShared');
const { DISMISS_CODES } = require('../utils/dismissReasons');
const { fanNameInfo } = require('../utils/fanNames');

const STATUSES = ['open', 'taken', 'completed', 'dismissed', 'archived'];
const OUTCOMES = ['coached', 'fixed', 'noted'];
const HISTORY = new Set(['completed', 'dismissed', 'archived']);

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

// GET /api/review-tasks/counts — how many tasks sit in each tab, without loading them
router.get('/counts', async (req, res) => {
  try {
    const orgId = req.user.organisationId;
    const counts = {};
    await Promise.all(STATUSES.map(async st => {
      const { count } = await supabaseAdmin.from('review_tasks').select('id', { count: 'exact', head: true })
        .eq('organisation_id', orgId).eq('status', st);
      counts[st] = count || 0;
    }));
    res.json(counts);
  } catch {
    res.status(500).json({ error: 'Failed to count tasks' });
  }
});

// GET /api/review-tasks?status=open,taken  — the queue / backlog
//   &limit=N&offset=M pages a history tab (newest actioned first); without a
//   limit everything matching is returned (the live queue is small).
router.get('/', async (req, res) => {
  try {
    const orgId = req.user.organisationId;
    const statuses = req.query.status ? String(req.query.status).split(',') : null;
    const history = statuses && statuses.every(st => HISTORY.has(st));
    const limit = Math.min(parseInt(req.query.limit, 10) || 0, 500);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    const build = () => {
      let q = supabaseAdmin.from('review_tasks').select('*').eq('organisation_id', orgId);
      if (statuses) q = q.in('status', statuses);
      if (req.query.chatter_id) q = q.eq('chatter_id', req.query.chatter_id);
      if (req.query.fan) q = q.eq('fan_username', String(req.query.fan));
      return history
        ? q.order('completed_at', { ascending: false, nullsFirst: false }).order('id', { ascending: true })
        : q.order('priority', { ascending: true, nullsFirst: false }).order('id', { ascending: true });
    };
    if (limit) {
      const { data, error } = await build().range(offset, offset + limit - 1);
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ tasks: data || [], has_more: (data || []).length === limit });
    }
    // Supabase caps a response at 1000 rows — page through (id breaks ties so pages are stable)
    let tasks = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await build().range(from, from + 999);
      if (error) return res.status(500).json({ error: error.message });
      tasks = tasks.concat(data || []);
      if (!data || data.length < 1000) break;
    }
    res.json({ tasks });
  } catch {
    res.status(500).json({ error: 'Failed to load tasks' });
  }
});

// GET /api/review-tasks/:id/dialogue?fan=<username>&days=1
// The conversation behind a task, so a manager can judge it without leaving the
// app: every message with that fan from `days` days before the task's day
// through the day after, each labelled with its page, plus who the fan is and
// every other task about them. `fan` picks one fan out of a multi-fan task.
// (No page filter: an AI task's page can be the chatter's main page rather than
// the fan's, which hid the whole conversation.)
router.get('/:id/dialogue', async (req, res) => {
  try {
    const orgId = req.user.organisationId;
    const { data: task } = await supabaseAdmin.from('review_tasks')
      .select('id, fan_username, context, first_seen_date, last_seen_date')
      .eq('id', req.params.id).eq('organisation_id', orgId).maybeSingle();
    if (!task) return res.status(404).json({ error: 'Task not found' });
    const fan = String(req.query.fan || task.fan_username || '').trim();
    if (!fan) return res.status(400).json({ error: "This task isn't about one fan" });
    const days = Math.min(Math.max(parseInt(req.query.days, 10) || 1, 0), 30);

    const focus = task.context?.sent_at || null;
    const day = focus ? focus.slice(0, 10) : (task.last_seen_date || task.first_seen_date);
    const from = new Date(Date.parse(dayWindow(day).start) - days * 86400000).toISOString();
    const to = new Date(Date.parse(dayWindow(day).end) + 86400000).toISOString();

    const rows = [];
    for (let off = 0; off < 3000; off += 1000) {
      const { data, error } = await supabaseAdmin.from('messages')
        .select('id, sent_datetime, sender_name, fan_message_text, creator_message_text, price, purchased, creator_id')
        .eq('organisation_id', orgId).eq('sent_to_username', fan)
        .gte('sent_datetime', from).lt('sent_datetime', to)
        .order('sent_datetime', { ascending: true }).order('id', { ascending: true }).range(off, off + 999);
      if (error) return res.status(500).json({ error: 'Could not load the conversation' });
      rows.push(...(data || []));
      if (!data || data.length < 1000) break;
    }

    const [{ data: sub }, { data: firstMsg }, { data: related }, { data: pages }] = await Promise.all([
      supabaseAdmin.from('subscribers').select('total_spend, classification, last_spend_date')
        .eq('organisation_id', orgId).eq('username', fan).maybeSingle(),
      supabaseAdmin.from('messages').select('sent_datetime').eq('organisation_id', orgId).eq('sent_to_username', fan)
        .order('sent_datetime', { ascending: true }).limit(1),
      supabaseAdmin.from('review_tasks')
        .select('id, area, severity, status, dismiss_reason_code, first_seen_date, chatter_name, title')
        .eq('organisation_id', orgId).eq('fan_username', fan).neq('id', task.id)
        .order('first_seen_date', { ascending: false }).limit(15),
      // infloww_creator_id arrives with migration 021; fall back if it isn't there yet
      supabaseAdmin.from('creators').select('id, name, infloww_creator_id').eq('organisation_id', orgId)
        .then(r => (r.error ? supabaseAdmin.from('creators').select('id, name').eq('organisation_id', orgId) : r)),
    ]);
    const pageName = Object.fromEntries((pages || []).map(c => [c.id, c.name]));
    const pageInfloww = Object.fromEntries((pages || []).map(c => [c.id, c.infloww_creator_id || null]));

    // What to call the fan: their name, and whether other fans on the page share it
    const lastPage = rows.length ? rows[rows.length - 1].creator_id : null;
    const nameInfo = lastPage ? (await fanNameInfo(orgId, [{ username: fan, creatorId: lastPage }]).catch(() => ({})))[fan] : null;

    res.json({
      fan_username: fan,
      fan_name: nameInfo?.name || null,
      name_shared: nameInfo?.shared || null,
      from, to, focus, days,
      fan_info: {
        total_spend: sub ? Math.round(parseFloat(sub.total_spend) || 0) : 0,
        classification: sub?.classification || null,
        last_spend_date: sub?.last_spend_date || null,
        first_seen: firstMsg?.[0]?.sent_datetime || null,
      },
      related: related || [],
      messages: rows.map(m => ({
        id: m.id, sent_at: m.sent_datetime, sender_name: m.sender_name, page: pageName[m.creator_id] || null,
        page_infloww_id: pageInfloww[m.creator_id] || null,
        fan_message: m.fan_message_text ? stripTags(m.fan_message_text) : null,
        chatter_message: m.creator_message_text ? stripTags(m.creator_message_text) : null,
        price: parseFloat(m.price) || 0, purchased: !!m.purchased,
      })),
    });
  } catch {
    res.status(500).json({ error: 'Could not load the conversation' });
  }
});

// POST /api/review-tasks/rebuild  { report_date }  — build from reports/flags, then rank
router.post('/rebuild', requireMinRole('va'), async (req, res) => {
  try {
    const { report_date } = req.body;
    const model = allowedModel(req.body.model, req.user.role);   // opus is admin-only
    if (!report_date) return res.status(400).json({ error: 'report_date is required' });
    const orgId = req.user.organisationId;
    const out = await rebuildQueue(orgId, report_date, model || 'sonnet');
    const { data } = await supabaseAdmin.from('review_tasks').select('*')
      .eq('organisation_id', orgId).in('status', ['open', 'taken'])
      .order('priority', { ascending: true, nullsFirst: false });
    res.json({ ...out, tasks: data || [] });
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
    let onlyIfOpen = false;
    if (action === 'take') { update.status = 'taken'; update.taken_by = req.user.id; update.taken_at = now; onlyIfOpen = true; }
    else if (action === 'complete') { update.status = 'completed'; update.completed_at = now; update.resolved_by = req.user.id; }
    else if (action === 'dismiss') {
      // Dismissing requires a reason CATEGORY — the calibration signal the AI
      // reviews and the task builder learn from. 'other' needs a note.
      const code = req.body.reason_code;
      const note = reason ? String(reason).trim() : '';
      if (!DISMISS_CODES.includes(code)) return res.status(400).json({ error: 'A dismissal reason is required' });
      if (code === 'other' && !note) return res.status(400).json({ error: 'Please explain the reason' });
      update.status = 'dismissed'; update.resolved_by = req.user.id; update.completed_at = now;
      update.dismiss_reason_code = code;
      update.dismiss_reason = note || null;
    }
    else if (action === 'archive') { update.status = 'archived'; update.completed_at = now; update.resolved_by = req.user.id; }
    else if (action === 'reopen') {
      Object.assign(update, { status: 'open', taken_by: null, taken_at: null, completed_at: null, resolved_by: null, dismiss_reason_code: null, dismiss_reason: null });
    }
    // Undo a complete / dismiss / archive: back to where it was ('open' or 'taken'),
    // keeping whoever had taken it.
    else if (action === 'undo') {
      const to = req.body.to === 'taken' ? 'taken' : 'open';
      Object.assign(update, { status: to, completed_at: null, resolved_by: null, dismiss_reason_code: null, dismiss_reason: null });
    }
    // Coaching flags are orthogonal to task status — a task can be saved for a
    // later coaching session regardless of whether it's open/taken/completed.
    else if (action === 'coach') { update.coach_flag = true; }
    else if (action === 'uncoach') { update.coach_flag = false; update.coached_at = null; }
    else if (action === 'coached') { update.coached_at = now; }
    // How a completed task was handled. 'coached' also records the coaching
    // session, so the chatter's coaching log fills itself in.
    else if (action === 'outcome') {
      const outcome = String(req.body.outcome || '');
      if (!OUTCOMES.includes(outcome)) return res.status(400).json({ error: 'Invalid outcome' });
      const { data: cur } = await supabaseAdmin.from('review_tasks').select('context')
        .eq('id', req.params.id).eq('organisation_id', req.user.organisationId).maybeSingle();
      if (!cur) return res.status(404).json({ error: 'Task not found' });
      update.context = { ...(cur.context || {}), outcome, outcome_by: req.user.id, outcome_at: now };
      if (outcome === 'coached') { update.coach_flag = true; update.coached_at = now; }
    }
    else if (action === 'uncoached') { update.coached_at = null; }
    else return res.status(400).json({ error: 'Invalid action' });

    // Taking only succeeds while the task is still open, so two managers can't
    // silently take the same task.
    let q = supabaseAdmin.from('review_tasks').update(update).eq('id', req.params.id).eq('organisation_id', req.user.organisationId);
    if (onlyIfOpen) q = q.eq('status', 'open');
    const { data, error } = await q.select().maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(409).json({ error: onlyIfOpen ? 'Someone else already took this task' : 'Task not found' });
    res.json(data);
  } catch {
    res.status(500).json({ error: 'Failed to update task' });
  }
});

module.exports = router;
