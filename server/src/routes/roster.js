const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../utils/supabase');
const { requireMinRole } = require('../middleware/auth');
const R = require('../utils/roster');
const { isPlatform } = require('../utils/pages');

// The Shifts page (utils/roster.js). Staff can look; managers and up change it.
const canEdit = requireMinRole('manager');
const isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || '')) && Number.isFinite(Date.parse(`${d}T00:00:00Z`));
const todayAms = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Amsterdam' });
const missing = (res) => res.status(409).json({ error: R.READY_ERROR });
const PARTS_ERROR = 'Run migration 027 (part shifts / overtime) in Supabase to turn this on';
const needs027 = (msg) => /start_time|end_time|roster_changes_organisation_id_date_chatter_id_key/.test(String(msg || ''));
const slotOf = async (orgId, shiftId) => (await R.loadSlots(orgId, null)).find(x => x.id === shiftId) || null;
const clock = (t) => (t ? String(t).slice(0, 5) : null);

// Check that the chatter, shift and pages are this organisation's, and that the
// pages are on the shift's platform. Returns an error message, or null.
async function checkParts(orgId, { chatter_id, shift_id, creator_ids }) {
  if (chatter_id) {
    const { data } = await supabaseAdmin.from('chatters').select('id').eq('id', chatter_id).eq('organisation_id', orgId).maybeSingle();
    if (!data) return 'Unknown chatter';
  }
  let slot = null;
  if (shift_id) {
    slot = await slotOf(orgId, shift_id);
    if (!slot) return 'Unknown shift';
  }
  if (creator_ids?.length) {
    const pages = (await R.loadPages(orgId, null)).filter(p => creator_ids.includes(p.id));
    if (pages.length !== new Set(creator_ids).size) return 'Unknown page';
    if (slot && pages.some(p => p.platform !== slot.platform)) return 'Those pages are on another platform than this shift';
  }
  return null;
}
const cleanWeekdays = (w) => [...new Set((Array.isArray(w) ? w : []).map(Number).filter(d => d >= 1 && d <= 7))].sort();
const cleanIds = (ids) => [...new Set((Array.isArray(ids) ? ids : []).map(String).filter(Boolean))];

// A chatter can't be rostered twice for the same shift on the same weekday. Two
// different shifts on one day is fine: that's overtime (often 4h of the next shift).
async function overlap(orgId, chatterId, shiftId, weekdays, exceptId = null) {
  const { data } = await supabaseAdmin.from('roster_assignments').select('id, shift_id, weekdays')
    .eq('organisation_id', orgId).eq('chatter_id', chatterId).eq('is_active', true);
  const clash = (data || []).filter(a => a.id !== exceptId && a.shift_id === shiftId).flatMap(a => (a.weekdays || []).filter(d => weekdays.includes(d)));
  return [...new Set(clash)].sort();
}
const DAY = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// GET /api/roster?week=YYYY-MM-DD&platform= — one platform's week (Mon–Sun) holding
// that date: shift times, pages, chatters, the standing roster, changes, each
// day's board and gaps, and hours per chatter. A platform's own shift times are
// made the first time its roster opens.
router.get('/', async (req, res) => {
  try {
    const orgId = req.user.organisationId;
    const date = isDate(req.query.week) ? req.query.week : todayAms();
    const platform = isPlatform(req.query.platform) ? req.query.platform : 'onlyfans';
    const own = platform === 'onlyfans' ? [] : await R.ensureSlots(orgId, platform);
    const view = await R.weekView(orgId, date, platform);
    res.json({ ...view, today: todayAms(), message: view.ready ? null : own === null ? R.PLATFORM_ERROR : R.READY_ERROR });
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
    const r = await R.loadRoster(orgId, from, to, null);         // every platform
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

// POST /api/roster/assignments { chatter_id, shift_id, creator_ids, weekdays, start_time?, end_time? }
router.post('/assignments', canEdit, async (req, res) => {
  try {
    const orgId = req.user.organisationId;
    const body = { chatter_id: req.body.chatter_id, shift_id: req.body.shift_id, creator_ids: cleanIds(req.body.creator_ids), weekdays: cleanWeekdays(req.body.weekdays) };
    if (!body.chatter_id || !body.shift_id) return res.status(400).json({ error: 'Pick a chatter and a shift' });
    if (!body.creator_ids.length) return res.status(400).json({ error: 'Pick at least one page' });
    if (!body.weekdays.length) return res.status(400).json({ error: 'Pick at least one day' });
    const bad = await checkParts(orgId, body);
    if (bad) return res.status(400).json({ error: bad });
    const from = clock(req.body.start_time), to = clock(req.body.end_time);
    const badW = R.badWindow(await slotOf(orgId, body.shift_id), from, to);
    if (badW) return res.status(400).json({ error: badW });
    const clash = await overlap(orgId, body.chatter_id, body.shift_id, body.weekdays);
    if (clash.length) return res.status(409).json({ error: `Already on this shift on ${clash.map(d => DAY[d]).join(', ')}` });
    const row = { ...body, organisation_id: orgId, source: 'manual', created_by: req.user.id };
    if (from) Object.assign(row, { start_time: from, end_time: to });
    const { data, error } = await supabaseAdmin.from('roster_assignments').insert(row).select().single();
    if (error) return needs027(error.message) ? res.status(409).json({ error: PARTS_ERROR }) : /roster_assignments/.test(error.message) ? missing(res) : res.status(500).json({ error: 'Could not save' });
    res.json(data);
  } catch {
    res.status(500).json({ error: 'Could not save' });
  }
});

// PATCH /api/roster/assignments/:id { shift_id?, creator_ids?, weekdays?, start_time?, end_time? }
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
    }
    const shiftId = update.shift_id || cur.shift_id;
    const clash = await overlap(orgId, cur.chatter_id, shiftId, update.weekdays || cur.weekdays, cur.id);
    if (clash.length) return res.status(409).json({ error: `Already on this shift on ${clash.map(d => DAY[d]).join(', ')}` });
    // the shift and pages it ends up with (both checked: they must be on one platform)
    const bad = await checkParts(orgId, { shift_id: shiftId, creator_ids: update.creator_ids || cur.creator_ids });
    if (bad) return res.status(400).json({ error: bad });
    // the hours: as sent, else as they were (still checked when the shift changes)
    const timesSent = req.body.start_time !== undefined || req.body.end_time !== undefined;
    const from = timesSent ? clock(req.body.start_time) : clock(cur.start_time);
    const to = timesSent ? clock(req.body.end_time) : clock(cur.end_time);
    if (timesSent || update.shift_id) {
      const badW = R.badWindow(await slotOf(orgId, shiftId), from, to);
      if (badW) return res.status(400).json({ error: badW });
    }
    // a whole shift that stays whole has nothing to write (and works before migration 027)
    if (timesSent && (from || cur.start_time)) Object.assign(update, { start_time: from, end_time: to });
    const { data, error } = await supabaseAdmin.from('roster_assignments').update(update).eq('id', cur.id).select().single();
    if (error) return res.status(needs027(error.message) ? 409 : 500).json({ error: needs027(error.message) ? PARTS_ERROR : 'Could not save' });
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

// PUT /api/roster/changes { date, chatter_id, kind: 'off' | 'work', shift_id?, creator_ids?, start_time?, end_time?, note? }
// One-day changes, per shift: 'off' with no shift = the whole day off; 'off' for a
// shift = just that shift (e.g. their overtime); 'work' for a shift = what they do
// on it that day (instead of their usual, or as an extra: overtime). A new change
// replaces the earlier one for that shift; a whole day off replaces all of them.
router.put('/changes', canEdit, async (req, res) => {
  try {
    const orgId = req.user.organisationId;
    const { date, chatter_id } = req.body;
    let kind = req.body.kind;
    const shift_id = req.body.shift_id || null;
    const creator_ids = cleanIds(req.body.creator_ids);
    if (!isDate(date) || !chatter_id) return res.status(400).json({ error: 'Pick a day and a chatter' });
    if (kind === 'work' && !creator_ids.length) kind = 'off';          // no pages left on that shift = off it
    if (!['off', 'work'].includes(kind)) return res.status(400).json({ error: 'Invalid change' });
    if (kind === 'work' && !shift_id) return res.status(400).json({ error: 'Pick a shift' });
    const bad = await checkParts(orgId, { chatter_id, shift_id, creator_ids: kind === 'work' ? creator_ids : [] });
    if (bad) return res.status(400).json({ error: bad });
    const from = kind === 'work' ? clock(req.body.start_time) : null, to = kind === 'work' ? clock(req.body.end_time) : null;
    if (from || to) {
      const badW = R.badWindow(await slotOf(orgId, shift_id), from, to);
      if (badW) return res.status(400).json({ error: badW });
    }
    // clear what this replaces: the same shift's change, and a whole day off; a whole day off clears everything
    let del = supabaseAdmin.from('roster_changes').delete().eq('organisation_id', orgId).eq('date', date).eq('chatter_id', chatter_id);
    if (shift_id) del = del.or(`shift_id.eq.${shift_id},shift_id.is.null`);
    const d = await del;
    if (d.error) return /roster_changes/.test(d.error.message) ? missing(res) : res.status(500).json({ error: 'Could not save' });
    const row = {
      organisation_id: orgId, date, chatter_id, kind, shift_id,
      creator_ids: kind === 'work' ? creator_ids : [],
      note: req.body.note ? String(req.body.note).trim().slice(0, 300) || null : null,
      created_by: req.user.id, created_at: new Date().toISOString(),
    };
    if (from) Object.assign(row, { start_time: from, end_time: to });
    const { data, error } = await supabaseAdmin.from('roster_changes').insert(row).select().single();
    if (error) return needs027(error.message) || /duplicate key/.test(error.message) ? res.status(409).json({ error: PARTS_ERROR }) : res.status(500).json({ error: 'Could not save' });
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

// ── A platform's shift times (Shifts page → Shift times) ────────────────────
const isClock = (t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(t || ''));
async function ownSlot(orgId, id) {
  const { data } = await supabaseAdmin.from('shifts').select('id').eq('id', id).eq('organisation_id', orgId).is('creator_id', null).maybeSingle();
  return data;
}
// The fields sent, checked. partial: only what's there (an edit).
function slotFields(body, partial) {
  const out = {};
  if (body.name !== undefined || !partial) {
    const name = String(body.name || '').trim();
    if (!name || name.length > 40) return { error: 'Give the shift a name (up to 40 characters)' };
    out.name = name;
  }
  for (const k of ['start_time', 'end_time']) {
    if (body[k] === undefined && partial) continue;
    if (!isClock(body[k])) return { error: 'Times look like 09:00' };
    out[k] = body[k];
  }
  return { out };
}

// POST /api/roster/slots { platform, name, start_time, end_time } — a new shift time
router.post('/slots', canEdit, async (req, res) => {
  try {
    const platform = req.body.platform;
    if (!isPlatform(platform)) return res.status(400).json({ error: 'Unknown platform' });
    const { out, error } = slotFields(req.body, false);
    if (error) return res.status(400).json({ error });
    if (out.start_time === out.end_time) return res.status(400).json({ error: 'A shift needs different start and end times' });
    const { data, error: e } = await supabaseAdmin.from('shifts').insert({
      ...out, organisation_id: req.user.organisationId, platform, timezone: 'Europe/Amsterdam', shift_type: 'regular', is_default: false, is_active: true,
    }).select('id').single();
    if (e) return res.status(/platform/.test(e.message) ? 409 : 500).json({ error: /platform/.test(e.message) ? R.PLATFORM_ERROR : 'Could not add the shift' });
    res.status(201).json(data);
  } catch {
    res.status(500).json({ error: 'Could not add the shift' });
  }
});

// PATCH /api/roster/slots/:id { name?, start_time?, end_time? } — rename or move a
// shift time; everyone rostered on it moves with it
router.patch('/slots/:id', canEdit, async (req, res) => {
  try {
    const orgId = req.user.organisationId;
    if (!(await ownSlot(orgId, req.params.id))) return res.status(404).json({ error: 'Not found' });
    const { out, error } = slotFields(req.body, true);
    if (error) return res.status(400).json({ error });
    if (!Object.keys(out).length) return res.status(400).json({ error: 'Nothing to change' });
    const cur = await slotOf(orgId, req.params.id);
    if ((out.start_time || cur.start) === (out.end_time || cur.end)) return res.status(400).json({ error: 'A shift needs different start and end times' });
    const { error: e } = await supabaseAdmin.from('shifts').update(out).eq('id', req.params.id).eq('organisation_id', orgId);
    if (e) return res.status(500).json({ error: 'Could not save the shift' });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Could not save the shift' });
  }
});

// DELETE /api/roster/slots/:id — only a shift nobody is or was rostered on (the
// roster rows and their history would go with it)
router.delete('/slots/:id', canEdit, async (req, res) => {
  try {
    const orgId = req.user.organisationId;
    if (!(await ownSlot(orgId, req.params.id))) return res.status(404).json({ error: 'Not found' });
    const [a, c] = await Promise.all([
      supabaseAdmin.from('roster_assignments').select('id', { count: 'exact', head: true }).eq('organisation_id', orgId).eq('shift_id', req.params.id),
      supabaseAdmin.from('roster_changes').select('id', { count: 'exact', head: true }).eq('organisation_id', orgId).eq('shift_id', req.params.id),
    ]);
    if ((a.count || 0) + (c.count || 0) > 0) return res.status(409).json({ error: 'People are or were rostered on this shift: move them to another shift first' });
    const { error } = await supabaseAdmin.from('shifts').delete().eq('id', req.params.id).eq('organisation_id', orgId).is('creator_id', null);
    if (error) return res.status(500).json({ error: 'Could not remove the shift' });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Could not remove the shift' });
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

// POST /api/roster/proposal/apply { assignments: [{chatter_id, shift_id, creator_ids, weekdays, start_time?, end_time?}] }
// Replaces the standing roster (old rows kept, inactive). One-day changes stay.
router.post('/proposal/apply', canEdit, async (req, res) => {
  try {
    const orgId = req.user.organisationId;
    const list = (Array.isArray(req.body.assignments) ? req.body.assignments : [])
      .map(a => ({ chatter_id: a.chatter_id, shift_id: a.shift_id, creator_ids: cleanIds(a.creator_ids), weekdays: cleanWeekdays(a.weekdays), start_time: clock(a.start_time), end_time: clock(a.end_time) }))
      .filter(a => a.chatter_id && a.shift_id && a.creator_ids.length && a.weekdays.length);
    if (!list.length) return res.status(400).json({ error: 'Nothing to apply' });
    const slots = await R.loadSlots(orgId);
    for (const a of list) {
      const bad = await checkParts(orgId, a); if (bad) return res.status(400).json({ error: bad });
      const badW = R.badWindow(slots.find(x => x.id === a.shift_id), a.start_time, a.end_time); if (badW) return res.status(400).json({ error: badW });
    }
    const seen = {};
    for (const a of list) for (const d of a.weekdays) {
      const k = `${a.chatter_id}|${a.shift_id}|${d}`;
      if (seen[k]) return res.status(400).json({ error: `A chatter is on the same shift twice on ${DAY[d]}` });
      seen[k] = true;
    }
    const withParts = list.some(a => a.start_time);
    // check the columns for part shifts exist before switching the old roster off
    if (withParts) {
      const probe = await supabaseAdmin.from('roster_assignments').select('start_time').limit(1);
      if (probe.error) return res.status(409).json({ error: PARTS_ERROR });
    }
    const now = new Date().toISOString();
    const off = await supabaseAdmin.from('roster_assignments').update({ is_active: false, updated_at: now })
      .eq('organisation_id', orgId).eq('is_active', true);
    if (off.error) return /roster_assignments/.test(off.error.message) ? missing(res) : res.status(500).json({ error: 'Could not apply' });
    const rows = list.map(a => {
      const r = { chatter_id: a.chatter_id, shift_id: a.shift_id, creator_ids: a.creator_ids, weekdays: a.weekdays, organisation_id: orgId, source: 'from_activity', created_by: req.user.id };
      if (a.start_time) Object.assign(r, { start_time: a.start_time, end_time: a.end_time });
      return r;
    });
    // rows with and without part times can't share one insert before the columns exist; after, they can
    const { error } = await supabaseAdmin.from('roster_assignments').insert(rows.map(r => (withParts ? { start_time: null, end_time: null, ...r } : r)));
    if (error) return res.status(500).json({ error: 'Could not apply' });
    res.json({ ok: true, applied: list.length });
  } catch {
    res.status(500).json({ error: 'Could not apply' });
  }
});

module.exports = router;
