const { supabaseAdmin } = require('./supabase');
const infloww = require('../integrations/infloww');
const R = require('./roster');

/**
 * Payroll: each chatter's pay for a two-week period, as on the report the manager
 * sends them every second Monday (migration 028).
 *  - Periods run Monday to Sunday two weeks later, counted from Mon 28 Sep 2026,
 *    by Amsterdam time (CET/CEST) — the days the manager's Infloww statistics use.
 *  - Sales: Infloww's sale records, read fresh when calculating (so a sale moved to
 *    another chatter by hand in Infloww counts for whoever has it now), credited to
 *    the chatter's Infloww account(s), refunds included — as Infloww's own numbers.
 *  - Hours: the shifts they worked, from the chat history (roster.shiftPieces):
 *    most of a shift (70%+) counts as the whole shift. A shift cut short counts from
 *    their first to their last message in it, quiet stretches included (no fans
 *    writing isn't a break), to the half hour — as the manager's reports do. Overtime
 *    is usually half a shift: most of a half (70%+) counts as the whole half (4 h),
 *    else the time worked, to the hour. A shift belongs to the
 *    day it starts. Each day's main shift is regular
 *    time; anything extra is overtime (staying on into the next shift, coming in
 *    early, a second shift that day), paid at the overtime rate if one is set.
 *  - Net = gross minus OnlyFans' cut (20%); commission = net × their %; hourly pay =
 *    regular hours × their rate; overtime pay = overtime hours × their overtime rate
 *    (else the hourly rate); total = commission + both + additions − deductions.
 *  - Rates: the chatter's own, else the team's (daily_check_config payroll_*), else
 *    $2/h and 5%; no overtime rate = overtime paid at the hourly rate.
 */

const ANCHOR = '2026-09-28';          // a payroll period starts on this Monday, and every 14 days from it
const PERIOD_DAYS = 14;
const DEFAULT_RATE = 2;               // $ per hour, until the team's or a chatter's own rate is set
const DEFAULT_COMMISSION = 5;         // % of net sales
const RATE_KEYS = { hourly_rate: 'payroll_hourly_rate', commission_pct: 'payroll_commission_pct', overtime_rate: 'payroll_overtime_rate' };
const SHORT_SHIFT_MIN = 7 * 60;       // a whole shift with less chatting than this is flagged for a look
const H = 3600000, DAY_MS = 86400000;

const dayNum = (d) => Math.round(Date.parse(`${d}T00:00:00Z`) / DAY_MS);
const todayAms = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Amsterdam' });
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const num = (v, d) => (v == null || v === '' || !Number.isFinite(Number(v)) ? d : Number(v));
const hhmm = (ms) => new Date(ms).toISOString().slice(11, 16);    // chat times are Amsterdam clock labelled as UTC
const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtDay = (d) => { const x = new Date(`${d}T12:00:00Z`); return `${DAY[x.getUTCDay()]} ${x.getUTCDate()} ${MON[x.getUTCMonth()]}`; };
const money = (n) => `$${r2(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** The period holding `date`: { start, end, payday } (payday = the Monday after). */
function periodOf(date) {
  const k = Math.floor((dayNum(date) - dayNum(ANCHOR)) / PERIOD_DAYS);
  const start = R.addDays(ANCHOR, k * PERIOD_DAYS);
  return { start, end: R.addDays(start, PERIOD_DAYS - 1), payday: R.addDays(start, PERIOD_DAYS) };
}
const isPeriodStart = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || '')) && Number.isFinite(Date.parse(`${d}T00:00:00Z`)) && periodOf(d).start === d;

/** The running period and the `n` before it, newest first. */
function recentPeriods(n = 8, today = todayAms()) {
  const cur = periodOf(today);
  return Array.from({ length: n + 1 }, (_, i) => ({ ...periodOf(R.addDays(cur.start, -i * PERIOD_DAYS)), running: i === 0 }));
}

/**
 * What the report shows, from a saved row: hours_paid (regular) and overtime_paid
 * are the manager's hours, else the chats'; overtime without its own rate is paid
 * at the hourly rate.
 */
function totals(row) {
  const hours = num(row.hours, num(row.hours_auto, 0));
  const overtime = num(row.overtime_hours, num(row.overtime_hours_auto, 0));
  const otRate = num(row.overtime_rate, num(row.hourly_rate, 0));
  const net = r2(num(row.sales_gross, 0) * (100 - num(row.of_cut_pct, 20)) / 100);
  const commission = r2(net * num(row.commission_pct, 0) / 100);
  const hourlyPay = r2(hours * num(row.hourly_rate, 0));
  const overtimePay = r2(overtime * otRate);
  const total = r2(commission + hourlyPay + overtimePay + num(row.additions, 0) - num(row.deductions, 0));
  return { hours_paid: hours, overtime_paid: overtime, overtime_rate_paid: otRate, sales_net: net, commission, hourly_pay: hourlyPay, overtime_pay: overtimePay, total };
}

/** The team's rates (Pay rates): hourly, commission and overtime (null = the hourly rate). */
async function teamRates(orgId) {
  const { data } = await supabaseAdmin.from('daily_check_config').select('key, value').eq('organisation_id', orgId).in('key', Object.values(RATE_KEYS));
  const v = Object.fromEntries((data || []).map(c => [c.key, c.value]));
  return {
    hourly_rate: num(v[RATE_KEYS.hourly_rate], DEFAULT_RATE),
    commission_pct: num(v[RATE_KEYS.commission_pct], DEFAULT_COMMISSION),
    overtime_rate: num(v[RATE_KEYS.overtime_rate], null),
  };
}
// A chatter's rates: their own, else the team's.
const ratesFor = (c, team) => ({
  hourly_rate: num(c?.hourly_rate, team.hourly_rate),
  commission_pct: num(c?.commission_pct, team.commission_pct),
  overtime_rate: num(c?.overtime_rate, team.overtime_rate),
});

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

// Hours per chatter from their messages: the shifts that started in the period.
// Also counts each day's messages, to spot days whose chat export is missing.
async function hoursFromChats(orgId, period, slots, chatterOf) {
  const from = Date.parse(`${period.start}T00:00:00Z`), to = Date.parse(`${R.addDays(period.end, 1)}T00:00:00Z`);
  const msgs = await all(() => supabaseAdmin.from('messages').select('sender_name, sent_datetime')
    .eq('organisation_id', orgId).not('creator_message_text', 'is', null)
    .gte('sent_datetime', new Date(from - 12 * H).toISOString()).lt('sent_datetime', new Date(to + 12 * H).toISOString())
    .order('sent_datetime').order('id'));
  const perDay = {}, byChatter = {};
  for (const m of msgs) {
    const t = Date.parse(m.sent_datetime);
    if (t >= from && t < to) { const d = m.sent_datetime.slice(0, 10); perDay[d] = (perDay[d] || 0) + 1; }
    const c = chatterOf(m.sender_name);
    if (c) (byChatter[c.id] ||= []).push(m);
  }
  const out = {};
  for (const [cid, list] of Object.entries(byChatter)) {
    const pieces = R.shiftPieces(list, slots);
    // each stretch of work's main shift: its longest piece (the earliest on a tie)
    const main = {};
    for (const p of pieces) { const m = main[p.block]; if (!m || p.z - p.a > m.z - m.a) main[p.block] = p; }
    const groups = {};                                  // day|shift: one shift, even if worked in two stretches
    for (const p of pieces) {
      const g = (groups[`${p.date}|${p.slot.id}`] ||= { slot: p.slot, date: p.date, start: p.start, mins: 0, first: Infinity, last: -Infinity, main: false });
      g.mins += p.z - p.a;
      g.first = Math.min(g.first, Date.parse(p.msgs[0].sent_datetime));
      g.last = Math.max(g.last, Date.parse(p.msgs[p.msgs.length - 1].sent_datetime));
      if (main[p.block] === p) g.main = true;
    }
    const every = Object.values(groups).sort((a, b) => a.start - b.start);
    for (const g of every) g.whole = g.mins >= 0.7 * g.slot.hours * 60;
    // regular time is the day's main shift (the first whole one); everything else that
    // day is overtime. A day without a whole shift: main shifts were cut short (regular).
    const byDay = {};
    for (const g of every) (byDay[g.date] ||= []).push(g);
    for (const day of Object.values(byDay)) {
      const lead = day.find(g => g.main && g.whole);
      for (const g of day) g.overtime = lead ? g !== lead : !g.main;
    }
    const half = (h) => Math.max(1, Math.round(h * 2) / 2);
    const shifts = every.filter(g => g.start >= from && g.start < to).map(g => {
      let { first, last } = g, hours = g.whole ? g.slot.hours : Math.max(1, Math.round(g.mins / 60));
      const halfShift = g.slot.hours / 2;                 // overtime halves: most of one is the whole half
      if (!g.whole && g.overtime && g.mins >= 0.7 * halfShift * 60 && g.mins <= (halfShift + 1) * 60) hours = halfShift;
      if (!g.whole && !g.overtime) {
        // cut short: from their first message in this shift to their last, quiet stretches included
        const end = g.start + g.slot.hours * H;
        const inShift = list.map(m => Date.parse(m.sent_datetime)).filter(t => t >= g.start && t < end);
        first = Math.min(first, inShift[0]); last = Math.max(last, inShift[inShift.length - 1]);
        hours = Math.max(hours, half((last - first) / H));
      }
      return {
        date: g.date, shift: g.slot.name, from: g.slot.start, to: g.slot.end, whole: g.whole, overtime: g.overtime,
        hours, first: hhmm(first), last: hhmm(last), active_min: Math.round(g.mins),
      };
    });
    const sum = (ot) => shifts.filter(x => x.overtime === ot).reduce((s, x) => s + x.hours, 0);
    if (shifts.length) out[cid] = { hours: sum(false), overtime: sum(true), shifts };
  }
  return { byChatter: out, perDay };
}

// Every sale record in the period, from Infloww: { employee, page, amount, status }.
// Times are converted to the Amsterdam clock to cut the days like Infloww's statistics.
async function salesFromInfloww(orgId, period) {
  const from = Date.parse(`${period.start}T00:00:00Z`), to = Date.parse(`${R.addDays(period.end, 1)}T00:00:00Z`);
  // every page, also ones disconnected since (their sales in the period still count), except
  // pages removed before it started
  const [all_, { data: ours }] = await Promise.all([
    infloww.getAll('/v1/all-creators'),
    supabaseAdmin.from('creators').select('name, infloww_creator_id').eq('organisation_id', orgId).not('infloww_creator_id', 'is', null),
  ]);
  const pages = all_.filter(p => { const gone = infloww.toDate(p.deletedTime); return !gone || gone.getTime() >= from - DAY_MS; });
  const ourName = Object.fromEntries((ours || []).map(c => [String(c.infloww_creator_id), c.name]));
  const records = [];
  const readPage = async (p) => {
    const list = await infloww.getAll('/v1/transaction-perf/details', {
      creatorId: p.id, startTime: new Date(from - 3 * H).toISOString(), endTime: new Date(to + H).toISOString(),
    });
    for (const x of list) {
      const t = infloww.toDate(x.createdTime);
      if (!t) continue;
      const local = infloww.toStoreTime(t).getTime();
      if (local < from || local >= to) continue;
      records.push({
        employee: x.attributeEmployeeId != null ? String(x.attributeEmployeeId) : null,
        page: ourName[String(p.id)] || p.name || `Page ${p.id}`,
        amount: (Number(x.salesAmount) || 0) / 100, status: x.status || null,
      });
    }
  };
  for (let i = 0; i < pages.length; i += 4) await Promise.all(pages.slice(i, i + 4).map(readPage));
  return records;
}

// The same from our synced copy, when Infloww can't be reached (misses sales
// moved between chatters after they were copied).
async function salesFromCopy(orgId, period) {
  const from = Date.parse(`${period.start}T00:00:00Z`), to = Date.parse(`${R.addDays(period.end, 1)}T00:00:00Z`);
  const rows = await all(() => supabaseAdmin.from('infloww_sales').select('employee_id, created_at, sales_amount, status, creators(name)')
    .eq('organisation_id', orgId).gte('created_at', new Date(from - 3 * H).toISOString()).lt('created_at', new Date(to + H).toISOString()).order('id'));
  return rows.filter(s => { const t = infloww.toStoreTime(new Date(s.created_at)).getTime(); return t >= from && t < to; })
    .map(s => ({ employee: s.employee_id, page: s.creators?.name || 'Other page', amount: Number(s.sales_amount) || 0, status: s.status }));
}

/**
 * Work out every chatter's pay for the period starting `start`: the rows to save
 * (without saving them) and the period's warnings. Reports already marked final
 * are left out; drafts keep what the manager typed (hours, additions, deductions,
 * notes, which aren't in these rows) and get fresh hours, sales and rates.
 */
async function buildPeriod(orgId, start, userId = null) {
  const period = periodOf(start);
  const [slots, chatters, emps, cfg, team, existing] = await Promise.all([
    R.loadSlots(orgId),
    all(() => supabaseAdmin.from('chatters').select('*').eq('organisation_id', orgId).order('id')),   // '*': overtime_rate only after migration 029
    all(() => supabaseAdmin.from('infloww_employees').select('employee_id, name, chatter_id').eq('organisation_id', orgId).order('employee_id')),
    supabaseAdmin.from('daily_check_config').select('key, value').eq('organisation_id', orgId).in('key', ['ignored_accounts', 'of_commission_pct']),
    teamRates(orgId),
    // before migration 028 there's nothing saved yet (saving then says so); any other failure stops here
    all(() => supabaseAdmin.from('payroll_reports').select('*').eq('organisation_id', orgId).eq('period_start', period.start).order('id'))
      .catch(e => { if (/payroll_reports/.test(e.message) && /schema cache|does not exist/.test(e.message)) return []; throw e; }),
  ]);
  const conf = Object.fromEntries((cfg.data || []).map(c => [c.key, c.value]));
  const ignored = new Set(String(conf.ignored_accounts || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean));
  const ofCut = num(conf.of_commission_pct, 20);
  const byName = Object.fromEntries(chatters.map(c => [c.name.toLowerCase().trim(), c]));
  const chatterOf = (name) => { const c = byName[String(name || '').toLowerCase().trim()]; return c && !ignored.has(c.name.toLowerCase().trim()) ? c : null; };
  const warnings = [];
  const today = todayAms();

  const { byChatter: hours, perDay } = await hoursFromChats(orgId, period, slots, chatterOf);

  let sales, source = 'infloww';
  if (infloww.configured()) {
    try { sales = await salesFromInfloww(orgId, period); }
    catch (e) { console.error('[payroll] Infloww:', e.message); warnings.push(`Couldn't read Infloww (${e.message}). Sales come from the last synced copy, which can miss sales moved between chatters by hand.`); }
  }
  if (!sales) { sales = await salesFromCopy(orgId, period); source = 'copy'; if (!infloww.configured()) warnings.push('Infloww isn\'t connected, so sales come from the last synced copy.'); }

  // sales per chatter, through their Infloww account(s)
  const chatterOfEmployee = {}, accounts = {};
  for (const e of emps) if (e.chatter_id) { chatterOfEmployee[e.employee_id] = e.chatter_id; accounts[e.chatter_id] = true; }
  const sold = {}, unlinked = {};
  for (const s of sales) {
    const cid = chatterOfEmployee[s.employee];
    if (!cid) { if (s.employee && s.amount) unlinked[s.employee] = (unlinked[s.employee] || 0) + s.amount; continue; }
    const x = (sold[cid] ||= { gross: 0, refunded: 0, pages: {} });
    x.gross += s.amount;
    if (s.status === 'undo') x.refunded += s.amount;
    x.pages[s.page] = (x.pages[s.page] || 0) + s.amount;
  }
  const empName = Object.fromEntries(emps.map(e => [e.employee_id, e.name]));
  for (const [id, amount] of Object.entries(unlinked).sort((a, b) => b[1] - a[1])) {
    if (amount >= 1) warnings.push(`Infloww account “${empName[id] || id}” has ${money(amount)} in sales but isn't linked to a chatter here, so it's on no report. Accounts are linked by name: there must be exactly one chatter called “${empName[id] || id}”.`);
  }

  // days in the period (up to yesterday) with no chat export
  const lastDay = period.end < today ? period.end : R.addDays(today, -1);
  const missing = [];
  for (let d = period.start; d <= lastDay; d = R.addDays(d, 1)) if (!perDay[d]) missing.push(d);
  if (missing.length) warnings.push(`No chat export uploaded for ${missing.map(fmtDay).join(', ')}: hours for ${missing.length === 1 ? 'that day' : 'those days'} can't be counted. Upload ${missing.length === 1 ? 'it' : 'them'} on the Reports page, then recalculate.`);
  if (today <= period.end) warnings.push(`This period isn't over yet (it ends ${fmtDay(period.end)}), so the numbers will still change.`);
  else if (today === period.payday && Number(new Date().toLocaleString('en-GB', { timeZone: 'Europe/Amsterdam', hour: '2-digit', hour12: false })) < 12) {
    warnings.push('Infloww can take a few hours to settle the last day\'s sales: recalculate later today to be safe.');
  }

  // one row per chatter who worked or sold, plus anyone already in this period
  const prev = Object.fromEntries(existing.map(r => [r.chatter_id, r]));
  const ids = new Set([...Object.keys(hours), ...Object.keys(sold), ...Object.keys(prev)]);
  const chatterById = Object.fromEntries(chatters.map(c => [c.id, c]));
  const now = new Date().toISOString();
  const rows = [];
  for (const cid of ids) {
    const c = chatterById[cid];
    if (!c || prev[cid]?.status === 'final' || ignored.has(c.name.toLowerCase().trim())) continue;
    const h = hours[cid] || { hours: 0, overtime: 0, shifts: [] };
    const s = sold[cid] || { gross: 0, refunded: 0, pages: {} };
    const flags = [];
    if ((h.hours || h.overtime) && !accounts[cid]) flags.push('no_infloww_account');
    // worth a look against Infloww: full shifts with little chatting, and shifts cut short
    const short = h.shifts.filter(x => (x.whole && x.active_min < SHORT_SHIFT_MIN) || (!x.whole && !x.overtime));
    if (short.length) flags.push('short_shifts');
    rows.push({
      organisation_id: orgId, chatter_id: cid, period_start: period.start, period_end: period.end,
      hours_auto: h.hours, overtime_hours_auto: h.overtime, sales_gross: r2(s.gross), refunded: r2(s.refunded),
      ...ratesFor(c, team), of_cut_pct: ofCut,
      details: {
        pages: Object.entries(s.pages).map(([name, amount]) => ({ name, amount: r2(amount) })).filter(p => p.amount).sort((a, b) => b.amount - a.amount),
        shifts: h.shifts, flags, sales_source: source,
      },
      calculated_at: now, updated_at: now, created_by: prev[cid]?.created_by || userId,
    });
  }
  return { period, rows, warnings, calculated_at: now };
}

/** Calculate the period (buildPeriod) and save it; returns the saved period. */
async function calculatePeriod(orgId, start, userId = null) {
  const { period, rows, warnings, calculated_at } = await buildPeriod(orgId, start, userId);
  if (rows.length) {
    const save = (list) => supabaseAdmin.from('payroll_reports').upsert(list, { onConflict: 'organisation_id,period_start,chatter_id' });
    let { error } = await save(rows);
    if (error && /overtime_/.test(error.message)) {
      // before migration 029 there's nowhere to keep overtime apart: it counts as ordinary hours
      ({ error } = await save(rows.map(({ overtime_hours_auto: ot, overtime_rate: _r, ...r }) => ({ ...r, hours_auto: r.hours_auto + ot }))));
      warnings.push('Run migration 029 in Supabase to pay overtime at its own rate. Until then overtime counts as ordinary hours.');
    }
    if (error) throw new Error(error.message);
  }
  const { error: pe } = await supabaseAdmin.from('payroll_periods').upsert({
    organisation_id: orgId, period_start: period.start, period_end: period.end, warnings, calculated_at, calculated_by: userId,
  }, { onConflict: 'organisation_id,period_start' });
  if (pe) throw new Error(pe.message);
  return loadPeriod(orgId, period.start);
}

/** A period's saved reports, with the money worked out, and its warnings. */
async function loadPeriod(orgId, start) {
  const period = periodOf(start);
  const [rows, { data: meta, error }, chatters] = await Promise.all([
    all(() => supabaseAdmin.from('payroll_reports').select('*').eq('organisation_id', orgId).eq('period_start', period.start).order('id')),
    supabaseAdmin.from('payroll_periods').select('warnings, calculated_at').eq('organisation_id', orgId).eq('period_start', period.start).maybeSingle(),
    all(() => supabaseAdmin.from('chatters').select('id, name, hourly_rate').eq('organisation_id', orgId).order('id')),
  ]);
  if (error) throw new Error(error.message);
  const name = Object.fromEntries(chatters.map(c => [c.id, c.name]));
  // "default rate": the chatter has no rate of their own yet (worked out now, so it's never stale)
  const own = new Set(chatters.filter(c => c.hourly_rate != null).map(c => c.id));
  const flagged = (r) => {
    const flags = (r.details?.flags || []).filter(f => f !== 'default_rate');
    return { ...r.details, flags: own.has(r.chatter_id) ? flags : ['default_rate', ...flags] };
  };
  return {
    period: { ...period, running: todayAms() <= period.end },
    calculated_at: meta?.calculated_at || null,
    warnings: meta?.warnings || [],
    rows: rows.map(r => ({ ...r, details: flagged(r), chatter_name: name[r.chatter_id] || '?', ...totals(r) }))
      .sort((a, b) => a.chatter_name.localeCompare(b.chatter_name)),
  };
}

/** One saved report as the page shows it (name, live "default rate" flag, the money). */
async function viewRow(row) {
  const { data: c } = await supabaseAdmin.from('chatters').select('name, hourly_rate').eq('id', row.chatter_id).maybeSingle();
  const flags = (row.details?.flags || []).filter(f => f !== 'default_rate');
  return {
    ...row, chatter_name: c?.name || '?', ...totals(row),
    details: { ...row.details, flags: c?.hourly_rate != null ? flags : ['default_rate', ...flags] },
  };
}

// ── Pay rates ───────────────────────────────────────────────────────────────
async function setConfig(orgId, key, value) {
  const { data: cur, error } = await supabaseAdmin.from('daily_check_config').select('id').eq('organisation_id', orgId).eq('key', key).maybeSingle();
  if (error) throw new Error(error.message);
  const q = value == null
    ? (cur ? supabaseAdmin.from('daily_check_config').delete().eq('id', cur.id) : null)
    : cur ? supabaseAdmin.from('daily_check_config').update({ value: String(value), updated_at: new Date().toISOString() }).eq('id', cur.id)
      : supabaseAdmin.from('daily_check_config').insert({ organisation_id: orgId, key, value: String(value) });
  if (q) { const { error: e } = await q; if (e) throw new Error(e.message); }
}

/**
 * The team's rates and every active chatter's own (null = the team's). `overtime`
 * is false until migration 029 adds the overtime rate.
 */
async function loadRates(orgId) {
  const [team, chatters, { data: ign }] = await Promise.all([
    teamRates(orgId),
    all(() => supabaseAdmin.from('chatters').select('*').eq('organisation_id', orgId).order('id')),
    supabaseAdmin.from('daily_check_config').select('value').eq('organisation_id', orgId).eq('key', 'ignored_accounts').maybeSingle(),
  ]);
  const ignored = new Set(String(ign?.value || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean));
  return {
    team,
    overtime: !chatters.length || 'overtime_rate' in chatters[0],
    chatters: chatters.filter(c => c.is_active !== false && !ignored.has(c.name.toLowerCase().trim()))
      .map(c => ({ id: c.id, name: c.name, hourly_rate: num(c.hourly_rate, null), commission_pct: num(c.commission_pct, null), overtime_rate: num(c.overtime_rate, null) }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/**
 * Save the team's rates and the chatters' own ({ id, hourly_rate, commission_pct,
 * overtime_rate }, null = the team's), then bring draft reports onto them (final
 * reports keep the rates they were made with).
 */
async function saveRates(orgId, { team, chatters = [] }) {
  const ready = (await loadRates(orgId)).overtime;
  if (team) for (const [k, key] of Object.entries(RATE_KEYS)) if (team[k] !== undefined && (ready || k !== 'overtime_rate')) await setConfig(orgId, key, team[k]);
  for (const c of chatters) {
    const update = {};
    for (const k of Object.keys(RATE_KEYS)) if (c[k] !== undefined && (ready || k !== 'overtime_rate')) update[k] = c[k];
    if (!Object.keys(update).length) continue;
    const { error } = await supabaseAdmin.from('chatters').update(update).eq('id', c.id).eq('organisation_id', orgId);
    if (error) throw new Error(error.message);
  }
  const t = await teamRates(orgId);
  const [drafts, people] = await Promise.all([
    all(() => supabaseAdmin.from('payroll_reports').select('*').eq('organisation_id', orgId).eq('status', 'draft').order('id')),
    all(() => supabaseAdmin.from('chatters').select('*').eq('organisation_id', orgId).order('id')),
  ]);
  const byId = Object.fromEntries(people.map(c => [c.id, c]));
  for (const r of drafts) {
    const want = ratesFor(byId[r.chatter_id], t);
    if (!ready) delete want.overtime_rate;
    if (Object.entries(want).every(([k, v]) => num(r[k], null) === v)) continue;
    const { error } = await supabaseAdmin.from('payroll_reports').update({ ...want, updated_at: new Date().toISOString() }).eq('id', r.id);
    if (error) throw new Error(error.message);
  }
  return loadRates(orgId);
}

module.exports = {
  ANCHOR, PERIOD_DAYS, DEFAULT_RATE, DEFAULT_COMMISSION,
  periodOf, isPeriodStart, recentPeriods, totals, buildPeriod, calculatePeriod, loadPeriod, viewRow, loadRates, saveRates, todayAms,
};
