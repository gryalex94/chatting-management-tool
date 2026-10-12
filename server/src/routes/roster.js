const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../utils/supabase');
const { requireMinRole } = require('../middleware/auth');
const R = require('../utils/roster');

// The Shifts page (utils/roster.js). Staff can look; managers and up change it.
const canEdit = requireMinRole('manager');
const isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || '')) && Number.isFinite(Date.parse(`${d}T00:00:00Z`));
const todayAms = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Amsterdam' });
const missing = (res) => res.status(409).json({ error: R.READY_ERROR });

// Check that the chatter, shift and pages are this organisation's. Returns an error
// message, or null.
async function checkParts(orgId, { chatter_id, shift_id, creator_ids }) {
  if (chatter_id) {
    const { data } = await supabaseAdmin.from('chatters').select('id').eq('id', chatter_id).eq('organisation_id', orgId).maybeSingle();
    if (!data) return 'Unknown chatter';
  }
  if (shift_id) {
    const { data } = await supabaseAdmin.from('shifts').select('id').eq('id', shift_id).eq('organisation_id', orgId).is('creator_id', null).maybeSingle();
    if (!data) return 'Unknown shift';
  }
  if (creator_ids?.length) {
    const { data } = await supabaseAdmin.from('creators').select('id').eq('organisation_id', orgId).in('id', creator_ids);
    if ((data || []).length !== new Set(creator_ids).size) return 'Unknown page';
  }
  return null;
}
const cleanWeekdays = (w) => [...new Set((Array.isArray(w) ? w : []).map(Number).filter(d => d >= 1 && d <= 7))].sort();
const cleanIds = (ids) => [...new Set((Array.isArray(ids) ? ids : []).map(String).filter(Boolean))];

// A chatter can't be rostered twice on the same weekday.
async function overlap(orgId, chatterId, weekdays, exceptId = null) {
  const { data } = await supabaseAdmin.from('roster_assignments').select('id, weekdays')
    .eq('organisation_id', orgId).eq('chatter_id', chatterId).eq('is_active', true);
  const clash = (data || []).filter(a => a.id !== exceptId).flatMap(a => (a.weekdays || []).filter(d => weekdays.includes(d)));
  return [...new Set(clash)].sort();
}
const DAY = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// GET /api/roster?week=YYYY-MM-DD — the week (Mon–Sun) holding that date: shift
// times, pages, chatters, the standing roster, changes, each day's board and gaps,
// and hours per chatter.
router.get('/', async (req, res) => {
  try {
    const date = isDate(req.query.week) ? req.query.week : todayAms();
    const view = await R.weekView(req.user.organisationId, date);
    res.json({ ...view, today: todayAms(), message: view.ready ? null : R.READY_ERROR });
  } catch (e) {
    console.error('[roster] week:', e.message);
    res.status(500).json({ error: 'Could not load the shifts' });
  }
});

// GET /api/roster/chatter/:id — one chatter's standing roster and their changes
// in the next 14 days (for the chatter profile).
router.get('/chatter/:id', async (req, res) => {
  try {
    const orgId = req.user.organisationId;
    const from = todayAms(), to = R.addDays(from, 13);
    const r = await R.loadRoster(orgId, from, to);
    if (!r.ready) return res.json({ ready: false, assignments: [], changes: [] });
    res.json({
      ready: true, slots: r.slots, pages: r.pages,
      assignments: r.assignments.filter(a => a.chatter_id === req.params.id),
      changes: r.changes.filter(c => c.chatter_id === req.params.id).sort((a, b) => a.date.localeCompare(b.date)),
    });
  } catch {
    res.status(500).json({ error: 'Could not load the roster' });
  }
});

// POST /api/roster/assignments { chatter_id, shift_id, creator_ids, weekdays }
router.post('/assignments', canEdit, async (req, res) => {
  try {
    const orgId = req.user.organisationId;
    const body = { chatter_id: req.body.chatter_id, shift_id: req.body.shift_id, creator_ids: cleanIds(req.body.creator_ids), weekdays: cleanWeekdays(req.body.weekdays) };
    if (!body.chatter_id || !body.shift_id) return res.status(400).json({ error: 'Pick a chatter and a shift' });
    if (!body.creator_ids.length) return res.status(400).json({ error: 'Pick at least one page' });
    if (!body.weekdays.length) return res.status(400).json({ error: 'Pick at least one day' });
    const bad = await checkParts(orgId, body);
    if (bad) return res.status(400).json({ error: bad });
    const clash = await overlap(orgId, body.chatter_id, body.weekdays);
    if (clash.length) return res.status(409).json({ error: `Already rostered on ${clash.map(d => DAY[d]).join(', ')}` });
    const { data, error } = await supabaseAdmin.from('roster_assignments')
      .insert({ ...body, organisation_id: orgId, source: 'manual', created_by: req.user.id }).select().single();
    if (error) return /roster_assignments/.test(error.message) ? missing(res) : res.status(500).json({ error: 'Could not save' });
    res.json(data);
  } catch {
    res.status(500).json({ error: 'Could not save' });
  }
});

// PATCH /api/roster/assignments/:id { shift_id?, creator_ids?, weekdays? }
router.patch('/assignments/:id', canEdit, async (req, res) => {
  try {
    const orgId = req.user.organisationId;
    const { data: cur } = await supabaseAdmin.from('roster_assignments').select('*').eq('id', req.params.id).eq('organisation_id', orgId).maybeSingle();
    if (!cur) return res.status(404).json({ error: 'Not found' });
    const update = { updated_at: new Date().toISOString() };
    if (req.body.shift_id !== undefined) update.shift_id = req.body.shift_id;
    if (req.body.creator_ids !== undefined) {
      update.creator_ids = cleanIds(req.body.creator_ids);
      if (!update.creator_ids.length) return res.status(400).json({ error: 'Pick at least one page' });
    }
    if (req.body.weekdays !== undefined) {
      update.weekdays = cleanWeekdays(req.body.weekdays);
      if (!update.weekdays.length) return res.status(400).json({ error: 'Pick at least one day' });
      const clash = await overlap(orgId, cur.chatter_id, update.weekdays, cur.id);
      if (clash.length) return res.status(409).json({ error: `Already rostered on ${clash.map(d => DAY[d]).join(', ')}` });
    }
    const bad = await checkParts(orgId, { shift_id: update.shift_id, creator_ids: update.creator_ids });
    if (bad) return res.status(400).json({ error: bad });
    const { data, error } = await supabaseAdmin.from('roster_assignments').update(update).eq('id', cur.id).select().single();
    if (error) return res.status(500).json({ error: 'Could not save' });
    res.json(data);
  } catch {
    res.status(500).json({ error: 'Could not save' });
  }
});

// DELETE /api/roster/assignments/:id — off the standing roster (kept, inactive).
router.delete('/assignments/:id', canEdit, async (req, res) => {
  try {
    const { error } = await supabaseAdmin.from('roster_assignments')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', req.params.id).eq('organisation_id', req.user.organisationId);
    if (error) return res.status(500).json({ error: 'Could not remove' });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Could not remove' });
  }
});

// PUT /api/roster/changes { date, chatter_id, kind: 'off' | 'work', shift_id?, creator_ids?, note? }
// One change per chatter per day: it replaces any earlier one for that day.
router.put('/changes', canEdit, async (req, res) => {
  try {
    const orgId = req.user.organisationId;
    const { date, chatter_id } = req.body;
    let kind = req.body.kind;
    const creator_ids = cleanIds(req.body.creator_ids);
    if (!isDate(date) || !chatter_id) return res.status(400).json({ error: 'Pick a day and a chatter' });
    if (kind === 'work' && !creator_ids.length) kind = 'off';          // no pages left that day = off
    if (!['off', 'work'].includes(kind)) return res.status(400).json({ error: 'Invalid change' });
    if (kind === 'work' && !req.body.shift_id) return res.status(400).json({ error: 'Pick a shift' });
    const bad = await checkParts(orgId, { chatter_id, shift_id: kind === 'work' ? req.body.shift_id : null, creator_ids: kind === 'work' ? creator_ids : [] });
    if (bad) return res.status(400).json({ error: bad });
    const row = {
      organisation_id: orgId, date, chatter_id, kind,
      shift_id: kind === 'work' ? req.body.shift_id : null,
      creator_ids: kind === 'work' ? creator_ids : [],
      note: req.body.note ? String(req.body.note).trim().slice(0, 300) || null : null,
      created_by: req.user.id, created_at: new Date().toISOString(),
    };
    const { data, error } = await supabaseAdmin.from('roster_changes')
      .upsert(row, { onConflict: 'organisation_id,date,chatter_id' }).select().single();
    if (error) return /roster_changes/.test(error.message) ? missing(res) : res.status(500).json({ error: 'Could not save' });
    res.json(data);
  } catch {
    res.status(500).json({ error: 'Could not save' });
  }
});

// DELETE /api/roster/changes/:id — undo a one-day change (back to the usual roster).
router.delete('/changes/:id', canEdit, async (req, res) => {
  try {
    const { error } = await supabaseAdmin.from('roster_changes').delete().eq('id', req.params.id).eq('organisation_id', req.user.organisationId);
    if (error) return res.status(500).json({ error: 'Could not undo' });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Could not undo' });
  }
});

// GET /api/roster/proposal — the roster as the team actually worked the last 4 weeks.
router.get('/proposal', canEdit, async (req, res) => {
  try {
    res.json(await R.proposeFromActivity(req.user.organisationId));
  } catch (e) {
    res.status(e.message === R.READY_ERROR ? 409 : 500).json({ error: e.message === R.READY_ERROR ? e.message : 'Could not build the roster' });
  }
});

// POST /api/roster/proposal/apply { assignments: [{chatter_id, shift_id, creator_ids, weekdays}] }
// Replaces the standing roster (old rows kept, inactive). One-day changes stay.
router.post('/proposal/apply', canEdit, async (req, res) => {
  try {
    const orgId = req.user.organisationId;
    const list = (Array.isArray(req.body.assignments) ? req.body.assignments : [])
      .map(a => ({ chatter_id: a.chatter_id, shift_id: a.shift_id, creator_ids: cleanIds(a.creator_ids), weekdays: cleanWeekdays(a.weekdays) }))
      .filter(a => a.chatter_id && a.shift_id && a.creator_ids.length && a.weekdays.length);
    if (!list.length) return res.status(400).json({ error: 'Nothing to apply' });
    for (const a of list) { const bad = await checkParts(orgId, a); if (bad) return res.status(400).json({ error: bad }); }
    const seen = {};
    for (const a of list) for (const d of a.weekdays) {
      const k = `${a.chatter_id}|${d}`;
      if (seen[k]) return res.status(400).json({ error: `A chatter is rostered twice on ${DAY[d]}` });
      seen[k] = true;
    }
    const now = new Date().toISOString();
    const off = await supabaseAdmin.from('roster_assignments').update({ is_active: false, updated_at: now })
      .eq('organisation_id', orgId).eq('is_active', true);
    if (off.error) return /roster_assignments/.test(off.error.message) ? missing(res) : res.status(500).json({ error: 'Could not apply' });
    const { error } = await supabaseAdmin.from('roster_assignments')
      .insert(list.map(a => ({ ...a, organisation_id: orgId, source: 'from_activity', created_by: req.user.id })));
    if (error) return res.status(500).json({ error: 'Could not apply' });
    res.json({ ok: true, applied: list.length });
  } catch {
    res.status(500).json({ error: 'Could not apply' });
  }
});

module.exports = router;
