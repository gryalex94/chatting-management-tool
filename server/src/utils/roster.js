const { supabaseAdmin } = require('./supabase');
const { noPlatformColumn } = require('./pages');
const { dayWindow } = require('../ai/evalShared');

/**
 * The Shifts roster (migration 025). Chatters aren't tied to one page or team:
 *  - shift times are org-wide (shifts with no page): US Prime 02–10, Middle 10–18,
 *    EU Prime 18–02, Amsterdam time; a shift counts as the day it starts;
 *  - the standing roster says who works which shift, on which pages, which
 *    weekdays (a floater has one row per shift);
 *  - one-day changes say who is off, or who works a different shift/pages, that day.
 * A page is "normally covered" in a shift if anyone is rostered on it there on any
 * weekday; on a day when nobody is, for all of the shift or part of it, that's a
 * hole. Days off are often covered by overtime: 4-hour halves from the neighbouring
 * shifts, so a roster row or a change can be part of a shift (start_time–end_time).
 */

const DAY_MS = 86400000;
const isoWeekday = (date) => { const d = new Date(`${date}T12:00:00Z`).getUTCDay(); return d === 0 ? 7 : d; };
const addDays = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const mondayOf = (date) => addDays(date, 1 - isoWeekday(date));
const toMin = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0); };
const shiftHours = (s) => { let d = toMin(s.end_time) - toMin(s.start_time); if (d <= 0) d += 1440; return d / 60; };
const READY_ERROR = 'Run migration 025 (shifts roster) in Supabase to turn this on';
const PLATFORM_ERROR = 'Run database change 034 (shifts per platform) in Supabase to give this platform its own shifts';
// A new platform's shift times to start with (Amsterdam time; EU Prime runs past
// midnight and counts as the day it starts) — the same three as OnlyFans.
const DEFAULT_SLOTS = [['US Prime', '02:00', '10:00'], ['Middle', '10:00', '18:00'], ['EU Prime', '18:00', '02:00']];

async function all(q) {
  const out = [];
  for (let off = 0; ; off += 1000) {
    const { data, error } = await q().range(off, off + 999);
    if (error) throw new Error(error.message);
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

// The shift times for everyone on a platform (null: every platform), earliest
// first. Payroll and the lateness check use OnlyFans' (they read OnlyFans chats).
async function loadSlots(orgId, platform = 'onlyfans') {
  const base = () => supabaseAdmin.from('shifts').select('id, name, start_time, end_time, platform')
    .eq('organisation_id', orgId).is('creator_id', null).order('start_time');
  let { data, error } = await (platform ? base().eq('platform', platform) : base());
  if (error && noPlatformColumn(error)) {                 // before database change 034: all OnlyFans
    if (platform && platform !== 'onlyfans') return [];
    ({ data } = await supabaseAdmin.from('shifts').select('id, name, start_time, end_time')
      .eq('organisation_id', orgId).is('creator_id', null).order('start_time'));
  }
  return (data || []).map(s => ({ ...s, platform: s.platform || 'onlyfans', start: String(s.start_time).slice(0, 5), end: String(s.end_time).slice(0, 5), hours: shiftHours(s) }));
}

// A platform's pages (null: every platform).
async function loadPages(orgId, platform) {
  const base = () => supabaseAdmin.from('creators').select('id, name, is_active, platform').eq('organisation_id', orgId).order('name');
  let { data, error } = await (platform ? base().eq('platform', platform) : base());
  if (error && noPlatformColumn(error)) {                 // before database change 032: all OnlyFans
    if (platform && platform !== 'onlyfans') return [];
    ({ data } = await supabaseAdmin.from('creators').select('id, name, is_active').eq('organisation_id', orgId).order('name'));
  }
  return (data || []).map(p => ({ ...p, platform: p.platform || 'onlyfans' }));
}

/**
 * A platform with pages but no shift times yet gets the usual three. Returns
 * the slots, or null when the shifts table has no platform yet (change 034).
 */
async function ensureSlots(orgId, platform) {
  const slots = await loadSlots(orgId, platform);
  if (slots.length || platform === 'onlyfans') return slots;
  const probe = await supabaseAdmin.from('shifts').select('platform').limit(1);
  if (probe.error) return null;
  if (!(await loadPages(orgId, platform)).length) return slots;
  const { error } = await supabaseAdmin.from('shifts').insert(DEFAULT_SLOTS.map(([name, st, et]) => ({
    organisation_id: orgId, name, start_time: st, end_time: et, timezone: 'Europe/Amsterdam',
    shift_type: 'regular', is_default: true, is_active: true, platform,
  })));
  if (error) throw new Error(error.message);
  return loadSlots(orgId, platform);
}

/**
 * Everything the Shifts page needs for [from, to], for one platform's roster
 * (null: every platform, e.g. a chatter's profile). `ready` is false until
 * migration 025 has run (the tables don't exist yet).
 */
async function loadRoster(orgId, from, to, platform = 'onlyfans') {
  const [slots, pages, { data: chatters }] = await Promise.all([
    loadSlots(orgId, platform),
    loadPages(orgId, platform),
    supabaseAdmin.from('chatters').select('id, name, is_active').eq('organisation_id', orgId).order('name'),
  ]);
  const a = await supabaseAdmin.from('roster_assignments').select('*').eq('organisation_id', orgId).eq('is_active', true);
  if (a.error) return { ready: false, platform, slots, pages, chatters: chatters || [], assignments: [], changes: [] };
  // One platform: the roster rows on its shifts. A whole day off (no shift) is the
  // person's, so it shows for everyone who works on this platform.
  const slotIds = new Set(slots.map(s => s.id));
  const assignments = platform ? (a.data || []).filter(x => slotIds.has(x.shift_id)) : (a.data || []);
  let changes = [];
  if (from && to) {
    const c = await supabaseAdmin.from('roster_changes').select('*').eq('organisation_id', orgId).gte('date', from).lte('date', to);
    if (c.error) return { ready: false, platform, slots, pages, chatters: chatters || [], assignments: [], changes: [] };
    changes = c.data || [];
    if (platform) {
      const working = new Set([...assignments.map(x => x.chatter_id), ...changes.filter(x => slotIds.has(x.shift_id)).map(x => x.chatter_id)]);
      changes = changes.filter(x => (x.shift_id ? slotIds.has(x.shift_id) : working.has(x.chatter_id)));
    }
  }
  return { ready: slots.length > 0, platform, slots, pages, chatters: chatters || [], assignments, changes };
}

// ── Windows inside a shift ──────────────────────────────────────────────────
// Part of a shift (overtime) is a from–to inside it; empty = the whole shift.
// Positions are minutes from the shift's start (a shift past midnight wraps).
const hhmm = (t) => (t ? String(t).slice(0, 5) : null);
const relMin = (slot, t) => (toMin(t) - toMin(slot.start) + 1440) % 1440;
const slotLen = (slot) => Math.round(slot.hours * 60);
function windowIn(slot, from, to) {
  const len = slotLen(slot);
  if (!from || !to) return [0, len];
  const a = relMin(slot, from);
  const z = relMin(slot, to) || len;                  // ends at the shift's end
  return [Math.min(a, len), Math.min(z, len)];
}
// A valid part of a shift: inside it, at least an hour, not the whole of it. null when fine.
function badWindow(slot, from, to) {
  if (!from && !to) return null;
  if (!/^\d{2}:\d{2}$/.test(String(from || '')) || !/^\d{2}:\d{2}$/.test(String(to || ''))) return 'Give both a start and an end time';
  const len = slotLen(slot), a = relMin(slot, from), z = relMin(slot, to) || len;
  if (a >= len || z > len || z - a < 60) return `Pick hours inside ${slot.name} (${slot.start}–${slot.end}), at least one hour`;
  return null;
}
const fmtRel = (slot, m) => { const t = (toMin(slot.start) + m) % 1440; return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };
// The parts of [0, len) no window covers (ignoring slivers under 15 min).
function uncovered(windows, len) {
  const out = []; let at = 0;
  for (const [a, z] of [...windows].sort((x, y) => x[0] - y[0])) {
    if (a - at >= 15) out.push([at, a]);
    at = Math.max(at, z);
  }
  if (len - at >= 15) out.push([at, len]);
  return out;
}

/**
 * Who works what on `date`: the usual roster for that weekday, with that day's
 * changes applied. A change with no shift is the whole day off; a change for a
 * shift replaces (or adds, or cancels) the chatter's usual entry for that shift.
 * Returns { entries: [{chatter_id, shift_id, creator_ids, from, to, source,
 * assignment_id|change_id}], off: [{chatter_id, change_id, note}] } — `off` lists
 * whole days off.
 */
function effectiveDay(date, assignments, changes) {
  const dow = isoWeekday(date);
  const mine = changes.filter(c => c.date === date);
  const chatterIds = new Set([...assignments.map(a => a.chatter_id), ...mine.map(c => c.chatter_id)]);
  const entries = [], off = [];
  for (const chatterId of chatterIds) {
    const own = mine.filter(c => c.chatter_id === chatterId);
    const dayOff = own.find(c => c.kind === 'off' && !c.shift_id);
    if (dayOff) { off.push({ chatter_id: chatterId, change_id: dayOff.id, note: dayOff.note || null }); continue; }
    const byShift = Object.fromEntries(own.filter(c => c.shift_id).map(c => [c.shift_id, c]));
    for (const a of assignments) {
      if (a.chatter_id !== chatterId || !(a.weekdays || []).includes(dow) || byShift[a.shift_id]) continue;
      entries.push({ chatter_id: chatterId, shift_id: a.shift_id, creator_ids: a.creator_ids || [], from: hhmm(a.start_time), to: hhmm(a.end_time), source: 'roster', assignment_id: a.id });
    }
    for (const c of Object.values(byShift)) {
      if (c.kind !== 'work' || !c.creator_ids?.length) continue;          // 'off' for one shift: nothing there
      entries.push({ chatter_id: chatterId, shift_id: c.shift_id, creator_ids: c.creator_ids, from: hhmm(c.start_time), to: hhmm(c.end_time), source: 'change', change_id: c.id, note: c.note || null });
    }
  }
  return { entries, off };
}

// "page|shift" pairs someone is rostered on for a WHOLE shift, on any weekday:
// what's expected to be covered. Overtime fills in on days off; it doesn't add
// expectations (a page someone touches in a 4-hour overtime isn't due every day).
const normallyCovered = (assignments) => new Set(assignments.filter(a => !a.start_time)
  .flatMap(a => (a.creator_ids || []).map(p => `${p}|${a.shift_id}`)));

// A day's board: entries, whole days off, and holes. A hole is a page left without
// anyone for all of a shift where it's normally covered, or for part of it
// (`missing` lists the open hours; `partial` when someone covers the rest).
function dayBoard(date, assignments, changes, slots, normal = normallyCovered(assignments)) {
  const { entries, off } = effectiveDay(date, assignments, changes);
  const slotById = Object.fromEntries(slots.map(s => [s.id, s]));
  const cover = {};
  for (const e of entries) {
    const s = slotById[e.shift_id]; if (!s) continue;
    const w = windowIn(s, e.from, e.to);
    for (const p of e.creator_ids) (cover[`${p}|${e.shift_id}`] ||= []).push(w);
  }
  const holes = [];
  for (const k of normal) {
    const [creator_id, shift_id] = k.split('|');
    const s = slotById[shift_id]; if (!s) continue;
    const open = uncovered(cover[k] || [], slotLen(s));
    if (!open.length) continue;
    holes.push({ creator_id, shift_id, partial: !!cover[k]?.length, missing: open.map(([a, z]) => `${fmtRel(s, a)}–${fmtRel(s, z)}`) });
  }
  return { date, weekday: isoWeekday(date), entries, off, holes };
}

/** One platform's week starting on the Monday of `anyDate`: 7 day boards plus hours per chatter. */
async function weekView(orgId, anyDate, platform = 'onlyfans') {
  const start = mondayOf(anyDate);
  const end = addDays(start, 6);
  const r = await loadRoster(orgId, start, end, platform);
  if (!r.ready) return { ...r, week_start: start };
  const normal = normallyCovered(r.assignments);
  const days = Array.from({ length: 7 }, (_, i) => dayBoard(addDays(start, i), r.assignments, r.changes, r.slots, normal));
  const slotById = Object.fromEntries(r.slots.map(s => [s.id, s]));
  const hours = {};
  for (const d of days) for (const e of d.entries) {
    const s = slotById[e.shift_id]; if (!s) continue;
    const [a, z] = windowIn(s, e.from, e.to);
    const h = (hours[e.chatter_id] ||= { shifts: 0, overtime: 0, hours: 0 });
    if (e.from) h.overtime += (z - a) / 60; else h.shifts++;
    h.hours += (z - a) / 60;
  }
  return { ...r, week_start: start, days, hours };
}

/**
 * Each chatter's rostered start on `date`, for the lateness check: their earliest
 * whole shift (overtime that continues last night's shift isn't a start), else
 * their earliest part shift. null when the roster isn't in use yet (then the old
 * shift assignments are used).
 */
async function shiftStartsFor(orgId, date) {
  const r = await loadRoster(orgId, date, date).catch(() => null);
  if (!r?.ready || !r.assignments.length) return null;
  const slot = Object.fromEntries(r.slots.map(s => [s.id, s]));
  const best = {};
  for (const e of effectiveDay(date, r.assignments, r.changes).entries) {
    const s = slot[e.shift_id]; if (!s) continue;
    const cand = { start: e.from || s.start, end: e.to || s.end, name: s.name, part: !!e.from };
    const cur = best[e.chatter_id];
    if (!cur || (cur.part && !cand.part) || (cur.part === cand.part && toMin(cand.start) < toMin(cur.start))) best[e.chatter_id] = cand;
  }
  return best;
}

/**
 * When someone worked, shift by shift, from their messages (oldest first; times
 * in the chat exports' Amsterdam clock). Messages with no 2h+ break form a block
 * (15+ messages); a block counts in each shift it covers for an hour or more with
 * 8+ messages there. Covering 70%+ of a shift is that whole shift (6h of 8 is the
 * shift, not overtime); less is part of one. Returns pieces: { slot, start (the
 * shift's start, ms), date (the day it starts), a, z (minutes from the shift's
 * start), whole, msgs (the messages inside), block (which stretch of work, counting
 * from 0: pieces of one block were worked without a break) }. Used for the roster
 * draft and payroll.
 */
function shiftPieces(list, slots) {
  const out = [];
  const at = (m) => Date.parse(m.sent_datetime);
  let n = 0;
  const close = (block) => {
    if (block.length < 15) return;
    const s = at(block[0]), e = at(block[block.length - 1]);
    const day0 = Math.floor(s / DAY_MS) * DAY_MS;
    for (const off of [-1, 0, 1, 2]) for (const sl of slots) {
      const a0 = day0 + off * DAY_MS + toMin(sl.start) * 60000, z0 = a0 + sl.hours * 3600000;
      if (Math.min(e, z0) - Math.max(s, a0) < 3600000) continue;          // under an hour of it: not a shift
      const inside = block.filter(m => { const t = at(m); return t >= a0 && t < z0; });
      if (inside.length < 8) continue;
      const a = (Math.max(s, a0) - a0) / 60000, z = (Math.min(e, z0) - a0) / 60000;
      out.push({ slot: sl, start: a0, date: new Date(a0).toISOString().slice(0, 10), a, z, whole: z - a >= 0.7 * slotLen(sl), msgs: inside, block: n });
    }
    n++;
  };
  let block = [];
  for (const m of list) {
    if (block.length && at(m) - at(block[block.length - 1]) > 2 * 3600000) { close(block); block = []; }
    block.push(m);
  }
  close(block);
  return out;
}

/**
 * The roster as the team actually works: from the last `days` days of chat
 * exports. Each chatter's working blocks (messages with no 2h+ break, 15+
 * messages) are split across the shifts they span: a 12-hour day is a whole
 * shift plus half of the next one (overtime). Per chatter and shift: whole shifts
 * and part shifts (by when in the shift they fall) are grouped separately; a
 * weekday counts when worked in at least 2 of the weeks, pages when they had 5%+
 * of the messages there or showed up on at least half of those shifts. Chatters on
 * the ignore list, and whole shifts worked fewer than 4 times, are left out.
 */
async function proposeFromActivity(orgId, { days = 28, endDate = null, slots: given = null } = {}) {
  const slots = given || await loadSlots(orgId);
  if (!slots.length) throw new Error(READY_ERROR);
  const { data: last } = await supabaseAdmin.from('data_imports').select('report_date').eq('organisation_id', orgId)
    .not('report_date', 'is', null).order('report_date', { ascending: false }).limit(1);
  const toDay = endDate || last?.[0]?.report_date || new Date().toISOString().slice(0, 10);
  const fromDay = addDays(toDay, -(days - 1));
  const weeks = Math.max(1, Math.round(days / 7));
  const [{ data: chatters }, { data: pages }, { data: ign }] = await Promise.all([
    supabaseAdmin.from('chatters').select('id, name').eq('organisation_id', orgId),
    supabaseAdmin.from('creators').select('id, name, is_active').eq('organisation_id', orgId),
    supabaseAdmin.from('daily_check_config').select('value').eq('organisation_id', orgId).eq('key', 'ignored_accounts').maybeSingle(),
  ]);
  const ignored = new Set(String(ign?.value || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean));
  const chatterByName = Object.fromEntries((chatters || []).map(c => [c.name.toLowerCase().trim(), c]));
  const pageName = Object.fromEntries((pages || []).map(p => [p.id, p.name]));

  const msgs = await all(() => supabaseAdmin.from('messages').select('sender_name, creator_id, sent_datetime')
    .eq('organisation_id', orgId).not('creator_message_text', 'is', null)
    .gte('sent_datetime', dayWindow(fromDay).start).lt('sent_datetime', dayWindow(toDay).end)
    .order('sent_datetime').order('id'));
  const byChatter = {};
  for (const m of msgs) {
    const c = chatterByName[String(m.sender_name || '').toLowerCase().trim()];
    if (!c || ignored.has(c.name.toLowerCase().trim())) continue;
    (byChatter[c.id] ||= []).push(m);
  }

  const groups = {};   // chatter|shift|whole-or-part -> pieces of work
  const addPiece = (chatterId, { slot, start: slotStartMs, a, z, whole, msgs: list }) => {
    const len = slotLen(slot);
    const part = whole ? 'whole' : a <= 45 ? 'early' : z >= len - 45 ? 'late' : 'middle';
    const g = (groups[`${chatterId}|${slot.id}|${part}`] ||= { chatterId, slot, part, pieces: 0, weekdays: {}, pageMsgs: {}, pageBlocks: {}, msgs: 0, windows: {} });
    const startsOn = new Date(slotStartMs).toISOString().slice(0, 10);
    g.pieces++; g.msgs += list.length;
    (g.weekdays[isoWeekday(startsOn)] ||= new Set()).add(startsOn);
    if (!whole) { const w = `${Math.round(a / 60) * 60}|${Math.round(z / 60) * 60}`; g.windows[w] = (g.windows[w] || 0) + 1; }
    const per = {}; for (const m of list) if (m.creator_id) per[m.creator_id] = (per[m.creator_id] || 0) + 1;
    for (const [p, k] of Object.entries(per)) { g.pageMsgs[p] = (g.pageMsgs[p] || 0) + k; if (k >= 3) g.pageBlocks[p] = (g.pageBlocks[p] || 0) + 1; }
  };
  for (const [chatterId, list] of Object.entries(byChatter)) {
    for (const piece of shiftPieces(list, slots)) addPiece(chatterId, piece);
  }

  const minWeeks = Math.min(2, weeks);
  const proposals = [];
  for (const g of Object.values(groups)) {
    if (g.part === 'whole' && g.pieces < 4) continue;                    // occasional: leave out
    const weekdays = Object.entries(g.weekdays).filter(([, dates]) => dates.size >= minWeeks).map(([d]) => Number(d)).sort();
    if (!weekdays.length) continue;
    const creatorIds = Object.keys(g.pageMsgs)
      .filter(p => g.pageMsgs[p] / g.msgs >= 0.05 || (g.pageBlocks[p] || 0) >= g.pieces / 2)
      .sort((a, b) => g.pageMsgs[b] - g.pageMsgs[a]);
    if (!creatorIds.length) continue;
    let start_time = null, end_time = null;
    if (g.part !== 'whole') {
      const [w] = Object.entries(g.windows).sort((x, y) => y[1] - x[1])[0];
      const [a, z] = w.split('|').map(Number);
      if (z - a < 60) continue;
      start_time = fmtRel(g.slot, a); end_time = fmtRel(g.slot, z);
    }
    const chatter = (chatters || []).find(c => c.id === g.chatterId);
    proposals.push({
      chatter_id: g.chatterId, chatter_name: chatter?.name || '?',
      shift_id: g.slot.id, shift_name: g.slot.name, start_time, end_time, overtime: g.part !== 'whole',
      creator_ids: creatorIds, pages: creatorIds.map(p => ({ id: p, name: pageName[p] || '?', share: Math.round(100 * g.pageMsgs[p] / g.msgs) })),
      weekdays, shifts_worked: g.pieces,
    });
  }
  // A whole shift on a day already covers that day: drop it from overtime rows.
  for (const p of proposals.filter(x => x.overtime)) {
    const whole = proposals.find(x => !x.overtime && x.chatter_id === p.chatter_id && x.shift_id === p.shift_id);
    if (whole) p.weekdays = p.weekdays.filter(d => !whole.weekdays.includes(d));
  }
  for (let i = proposals.length - 1; i >= 0; i--) if (!proposals[i].weekdays.length) proposals.splice(i, 1);
  const order = (p) => toMin(slots.find(s => s.id === p.shift_id).start) * 10 + (p.overtime ? 1 : 0);
  proposals.sort((a, b) => order(a) - order(b) || a.chatter_name.localeCompare(b.chatter_name));
  return { from: fromDay, to: toDay, proposals };
}

module.exports = {
  isoWeekday, addDays, mondayOf, loadSlots, loadPages, ensureSlots, loadRoster, effectiveDay, dayBoard, normallyCovered,
  weekView, shiftStartsFor, proposeFromActivity, shiftPieces, windowIn, badWindow, READY_ERROR, PLATFORM_ERROR,
};
