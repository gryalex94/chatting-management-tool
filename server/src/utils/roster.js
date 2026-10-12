const { supabaseAdmin } = require('./supabase');
const { dayWindow } = require('../ai/evalShared');

/**
 * The Shifts roster (migration 025). Chatters aren't tied to one page or team:
 *  - shift times are org-wide (shifts with no page): US Prime 02–10, Middle 10–18,
 *    EU Prime 18–02, Amsterdam time; a shift counts as the day it starts;
 *  - the standing roster says who works which shift, on which pages, which
 *    weekdays (a floater has one row per shift);
 *  - one-day changes say who is off, or who works a different shift/pages, that day.
 * A page is "normally covered" in a shift if anyone is rostered on it there on any
 * weekday; on a day when nobody is, that's a hole.
 */

const DAY_MS = 86400000;
const isoWeekday = (date) => { const d = new Date(`${date}T12:00:00Z`).getUTCDay(); return d === 0 ? 7 : d; };
const addDays = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const mondayOf = (date) => addDays(date, 1 - isoWeekday(date));
const toMin = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0); };
const shiftHours = (s) => { let d = toMin(s.end_time) - toMin(s.start_time); if (d <= 0) d += 1440; return d / 60; };
const READY_ERROR = 'Run migration 025 (shifts roster) in Supabase to turn this on';

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

// The shift times for everyone, earliest first.
async function loadSlots(orgId) {
  const { data } = await supabaseAdmin.from('shifts').select('id, name, start_time, end_time')
    .eq('organisation_id', orgId).is('creator_id', null).order('start_time');
  return (data || []).map(s => ({ ...s, start: String(s.start_time).slice(0, 5), end: String(s.end_time).slice(0, 5), hours: shiftHours(s) }));
}

/**
 * Everything the Shifts page needs for [from, to]. `ready` is false until
 * migration 025 has run (the tables don't exist yet).
 */
async function loadRoster(orgId, from, to) {
  const [slots, { data: pages }, { data: chatters }] = await Promise.all([
    loadSlots(orgId),
    supabaseAdmin.from('creators').select('id, name, is_active').eq('organisation_id', orgId).order('name'),
    supabaseAdmin.from('chatters').select('id, name, is_active').eq('organisation_id', orgId).order('name'),
  ]);
  const a = await supabaseAdmin.from('roster_assignments').select('*').eq('organisation_id', orgId).eq('is_active', true);
  if (a.error) return { ready: false, slots, pages: pages || [], chatters: chatters || [], assignments: [], changes: [] };
  let changes = [];
  if (from && to) {
    const c = await supabaseAdmin.from('roster_changes').select('*').eq('organisation_id', orgId).gte('date', from).lte('date', to);
    if (c.error) return { ready: false, slots, pages: pages || [], chatters: chatters || [], assignments: [], changes: [] };
    changes = c.data || [];
  }
  return { ready: slots.length > 0, slots, pages: pages || [], chatters: chatters || [], assignments: a.data || [], changes };
}

/**
 * Who works what on `date`: the standing roster for that weekday, with that day's
 * changes applied. Returns { entries: [{chatter_id, shift_id, creator_ids, source,
 * assignment_id|change_id}], off: [{chatter_id, change_id, note}] }.
 */
function effectiveDay(date, assignments, changes) {
  const dow = isoWeekday(date);
  const dayChanges = Object.fromEntries(changes.filter(c => c.date === date).map(c => [c.chatter_id, c]));
  const chatterIds = new Set([...assignments.map(a => a.chatter_id), ...Object.keys(dayChanges)]);
  const entries = [], off = [];
  for (const chatterId of chatterIds) {
    const ch = dayChanges[chatterId];
    if (ch?.kind === 'off') { off.push({ chatter_id: chatterId, change_id: ch.id, note: ch.note || null }); continue; }
    if (ch?.kind === 'work' && ch.shift_id && ch.creator_ids?.length) {
      entries.push({ chatter_id: chatterId, shift_id: ch.shift_id, creator_ids: ch.creator_ids, source: 'change', change_id: ch.id, note: ch.note || null });
      continue;
    }
    for (const a of assignments) {
      if (a.chatter_id !== chatterId || !(a.weekdays || []).includes(dow)) continue;
      entries.push({ chatter_id: chatterId, shift_id: a.shift_id, creator_ids: a.creator_ids || [], source: 'roster', assignment_id: a.id });
    }
  }
  return { entries, off };
}

// "page|shift" pairs anyone is rostered on, on any weekday.
const normallyCovered = (assignments) => new Set(assignments.flatMap(a => (a.creator_ids || []).map(p => `${p}|${a.shift_id}`)));

function dayBoard(date, assignments, changes, normal = normallyCovered(assignments)) {
  const { entries, off } = effectiveDay(date, assignments, changes);
  const covered = new Set(entries.flatMap(e => e.creator_ids.map(p => `${p}|${e.shift_id}`)));
  const holes = [...normal].filter(k => !covered.has(k)).map(k => { const [creator_id, shift_id] = k.split('|'); return { creator_id, shift_id }; });
  return { date, weekday: isoWeekday(date), entries, off, holes };
}

/** The week starting on the Monday of `anyDate`: 7 day boards plus hours per chatter. */
async function weekView(orgId, anyDate) {
  const start = mondayOf(anyDate);
  const end = addDays(start, 6);
  const r = await loadRoster(orgId, start, end);
  if (!r.ready) return { ...r, week_start: start };
  const normal = normallyCovered(r.assignments);
  const days = Array.from({ length: 7 }, (_, i) => dayBoard(addDays(start, i), r.assignments, r.changes, normal));
  const slotHours = Object.fromEntries(r.slots.map(s => [s.id, s.hours]));
  const hours = {};
  for (const d of days) for (const e of d.entries) {
    const h = (hours[e.chatter_id] ||= { shifts: 0, hours: 0 });
    h.shifts++; h.hours += slotHours[e.shift_id] || 0;
  }
  return { ...r, week_start: start, days, hours };
}

/**
 * Each chatter's rostered shift on `date` (the earliest, if several): for the
 * lateness check. null when the roster isn't in use yet (then the old shift
 * assignments are used).
 */
async function shiftStartsFor(orgId, date) {
  const r = await loadRoster(orgId, date, date).catch(() => null);
  if (!r?.ready || !r.assignments.length) return null;
  const slot = Object.fromEntries(r.slots.map(s => [s.id, s]));
  const out = {};
  for (const e of effectiveDay(date, r.assignments, r.changes).entries) {
    const s = slot[e.shift_id]; if (!s) continue;
    if (!out[e.chatter_id] || toMin(s.start) < toMin(out[e.chatter_id].start)) out[e.chatter_id] = { start: s.start, end: s.end, name: s.name };
  }
  return out;
}

/**
 * The roster as the team actually works: from the last `days` days of chat
 * exports. Each chatter's working blocks (messages with no 2h+ break, 15+
 * messages) are put in the shift they overlap most; per chatter and shift, the
 * weekdays they worked in at least 2 of the weeks, and the pages they handled
 * (5%+ of their messages there, or on at least half of those shifts). Chatters on
 * the ignore list, and shifts worked fewer than 4 times, are left out.
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

  // which shift a block belongs to: the most overlap (store times are Amsterdam wall clock)
  const slotOf = (s, e) => {
    let best = null, most = 0;
    const day0 = Math.floor(s / DAY_MS) * DAY_MS;
    for (const off of [-1, 0, 1]) for (const sl of slots) {
      const a = day0 + off * DAY_MS + toMin(sl.start) * 60000;
      const z = a + sl.hours * 3600000;
      const o = Math.max(0, Math.min(e, z) - Math.max(s, a));
      if (o > most) { most = o; best = { slot: sl, startsOn: new Date(day0 + off * DAY_MS).toISOString().slice(0, 10) }; }
    }
    return best;
  };

  const groups = {};                                   // chatter|slot -> { blocks, weekdayWeeks, pageMsgs, pageBlocks, msgs }
  for (const [chatterId, list] of Object.entries(byChatter)) {
    let block = [list[0]];
    const close = () => {
      if (block.length < 15) return;
      const s = Date.parse(block[0].sent_datetime), e = Date.parse(block[block.length - 1].sent_datetime);
      const at = slotOf(s, e); if (!at) return;
      const g = (groups[`${chatterId}|${at.slot.id}`] ||= { chatterId, slot: at.slot, blocks: 0, weekdays: {}, pageMsgs: {}, pageBlocks: {}, msgs: 0 });
      g.blocks++; g.msgs += block.length;
      const wd = isoWeekday(at.startsOn); (g.weekdays[wd] ||= new Set()).add(at.startsOn);
      const per = {}; for (const m of block) if (m.creator_id) per[m.creator_id] = (per[m.creator_id] || 0) + 1;
      for (const [p, n] of Object.entries(per)) { g.pageMsgs[p] = (g.pageMsgs[p] || 0) + n; if (n >= 3) g.pageBlocks[p] = (g.pageBlocks[p] || 0) + 1; }
    };
    for (let i = 1; i < list.length; i++) {
      if (Date.parse(list[i].sent_datetime) - Date.parse(list[i - 1].sent_datetime) > 2 * 3600000) { close(); block = []; }
      block.push(list[i]);
    }
    close();
  }

  const minWeeks = Math.min(2, weeks);
  const proposals = [];
  for (const g of Object.values(groups)) {
    if (g.blocks < 4) continue;                         // occasional: leave out
    const weekdays = Object.entries(g.weekdays).filter(([, dates]) => dates.size >= minWeeks).map(([d]) => Number(d)).sort();
    if (!weekdays.length) continue;
    const creatorIds = Object.keys(g.pageMsgs)
      .filter(p => g.pageMsgs[p] / g.msgs >= 0.05 || (g.pageBlocks[p] || 0) >= g.blocks / 2)
      .sort((a, b) => g.pageMsgs[b] - g.pageMsgs[a]);
    if (!creatorIds.length) continue;
    const chatter = (chatters || []).find(c => c.id === g.chatterId);
    proposals.push({
      chatter_id: g.chatterId, chatter_name: chatter?.name || '?',
      shift_id: g.slot.id, shift_name: g.slot.name,
      creator_ids: creatorIds, pages: creatorIds.map(p => ({ id: p, name: pageName[p] || '?', share: Math.round(100 * g.pageMsgs[p] / g.msgs) })),
      weekdays, shifts_worked: g.blocks,
    });
  }
  proposals.sort((a, b) => toMin(slots.find(s => s.id === a.shift_id).start) - toMin(slots.find(s => s.id === b.shift_id).start) || a.chatter_name.localeCompare(b.chatter_name));
  return { from: fromDay, to: toDay, proposals };
}

module.exports = {
  isoWeekday, addDays, mondayOf, loadSlots, loadRoster, effectiveDay, dayBoard, normallyCovered,
  weekView, shiftStartsFor, proposeFromActivity, READY_ERROR,
};
