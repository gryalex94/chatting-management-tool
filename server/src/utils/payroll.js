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
 *  - Other platforms (Fanvue, migration 035): one report per person still; the
 *    report's columns are the OnlyFans part and each other platform is a line in
 *    `lines`, added to the total. Fanvue doesn't say which chatter sent what, so its
 *    hours are the Fanvue shifts people were rostered on (from the day they were put
 *    on the roster), and each PPV bought or tip goes to whoever was on that page's
 *    shift when the PPV was sent, split when several were (net = Fanvue's own
 *    figure after its cut). Time already paid on
 *    OnlyFans isn't paid twice. Rates per platform: the person's own for it, else
 *    the team's for it, else the team's general ones.
 */

const ANCHOR = '2026-09-28';          // a payroll period starts on this Monday, and every 14 days from it
const PERIOD_DAYS = 14;
const DEFAULT_RATE = 2;               // $ per hour, until the team's or a chatter's own rate is set
const DEFAULT_COMMISSION = 5;         // % of net sales
const RATE_KEYS = { hourly_rate: 'payroll_hourly_rate', commission_pct: 'payroll_commission_pct', overtime_rate: 'payroll_overtime_rate' };
// The team's rates for another platform: the same keys with ':platform' (payroll_hourly_rate:fanvue).
const rateKeys = (platform) => (platform === 'onlyfans' ? RATE_KEYS
  : Object.fromEntries(Object.entries(RATE_KEYS).map(([k, v]) => [k, `${v}:${platform}`])));
const RATE_FIELDS = Object.keys(RATE_KEYS);
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
  // other platforms' lines (Fanvue), each with its pay
  const platforms = Object.entries(row.lines || {}).filter(([, l]) => l && typeof l === 'object').map(([platform, l]) => ({ platform, ...lineTotals(l) }));
  const extra = (k) => platforms.reduce((sum, x) => sum + x[k], 0);
  const total = r2(commission + hourlyPay + overtimePay + extra('pay') + num(row.additions, 0) - num(row.deductions, 0));
  return {
    // the OnlyFans part (the report's own columns), as before
    hours_paid: hours, overtime_paid: overtime, overtime_rate_paid: otRate, sales_net: net, commission, hourly_pay: hourlyPay, overtime_pay: overtimePay,
    platforms,
    // every platform added up
    all: {
      hours: r2(hours + extra('hours_paid')), overtime: r2(overtime + extra('overtime_paid')),
      sales_gross: r2(num(row.sales_gross, 0) + extra('sales_gross')), sales_net: r2(net + extra('sales_net')),
      commission: r2(commission + extra('commission')), hourly_pay: r2(hourlyPay + extra('hourly_pay')), overtime_pay: r2(overtimePay + extra('overtime_pay')),
    },
    total,
  };
}

// One other platform's line: its hours (the manager's, else the roster's), sales
// (net is the platform's own figure), commission and pay.
function lineTotals(l) {
  const hours = num(l.hours, num(l.hours_auto, 0));
  const overtime = num(l.overtime_hours, num(l.overtime_hours_auto, 0));
  const otRate = num(l.overtime_rate, num(l.hourly_rate, 0));
  const net = r2(num(l.sales_net, 0));
  const commission = r2(net * num(l.commission_pct, 0) / 100);
  const hourlyPay = r2(hours * num(l.hourly_rate, 0));
  const overtimePay = r2(overtime * otRate);
  return {
    hours_paid: hours, overtime_paid: overtime, hourly_rate: num(l.hourly_rate, 0), commission_pct: num(l.commission_pct, 0), overtime_rate_paid: otRate,
    sales_gross: r2(num(l.sales_gross, 0)), sales_net: net, commission, hourly_pay: hourlyPay, overtime_pay: overtimePay, pay: r2(commission + hourlyPay + overtimePay),
  };
}

/**
 * The team's rates (Pay rates): hourly, commission and overtime (null = the hourly
 * rate). For another platform: the team's rates for it, else the general ones.
 */
async function teamRates(orgId, platform = 'onlyfans') {
  const own = rateKeys(platform);
  const { data } = await supabaseAdmin.from('daily_check_config').select('key, value').eq('organisation_id', orgId)
    .in('key', [...new Set([...Object.values(RATE_KEYS), ...Object.values(own)])]);
  const v = Object.fromEntries((data || []).map(c => [c.key, c.value]));
  const general = {
    hourly_rate: num(v[RATE_KEYS.hourly_rate], DEFAULT_RATE),
    commission_pct: num(v[RATE_KEYS.commission_pct], DEFAULT_COMMISSION),
    overtime_rate: num(v[RATE_KEYS.overtime_rate], null),
  };
  if (platform === 'onlyfans') return general;
  return Object.fromEntries(RATE_FIELDS.map(k => [k, num(v[own[k]], general[k])]));
}

// Everyone's own rates for another platform (chatter_platform_rates, migration 035).
async function platformRates(orgId, platform) {
  const [team, { data, error }] = await Promise.all([
    teamRates(orgId, platform),
    supabaseAdmin.from('chatter_platform_rates').select('chatter_id, hourly_rate, commission_pct, overtime_rate').eq('organisation_id', orgId).eq('platform', platform),
  ]);
  return { team, own: Object.fromEntries((data || []).map(r => [r.chatter_id, r])), ready: !error };
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

// ── Other platforms: Fanvue ─────────────────────────────────────────────────
const FANVUE_SALES = new Set(['message', 'tip']);           // what a chatter sells in the chat
const minOf = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0); };
const amsClock = (iso) => infloww.toStoreTime(new Date(iso)).getTime();    // real UTC → the chats' Amsterdam clock
const overlapMs = ([a, b], list) => list.reduce((sum, [c, d]) => sum + Math.max(0, Math.min(b, d) - Math.max(a, c)), 0);
const amsDay = (iso) => new Date(amsClock(iso)).toISOString().slice(0, 10);
// The roster keeps no history, so a row counts from the day it was added until the
// day it was taken off; days before that need a one-day change (or hours typed in).
const onRoster = (a, date) => (!a.created_at || amsDay(a.created_at) <= date) && (a.is_active !== false || (!!a.updated_at && amsDay(a.updated_at) > date));

// A rostered shift (or part of one) on `date`, as [start, end) in the Amsterdam clock.
function rosterInterval(date, slot, from, to) {
  const [a, z] = R.windowIn(slot, from, to);
  const start = Date.parse(`${date}T00:00:00Z`) + minOf(slot.start) * 60000;
  return [start + a * 60000, start + z * 60000];
}
// What someone was paid for on OnlyFans (their shifts from the chats), as [start, end).
function paidIntervals(shifts) {
  return (shifts || []).map(x => {
    const start = Date.parse(`${x.date}T00:00:00Z`) + minOf(x.from) * 60000;
    if (x.whole) return [start, start + x.hours * H];
    const a = ((minOf(x.first) - minOf(x.from)) + 1440) % 1440;           // from their first message
    return [start + a * 60000, start + a * 60000 + x.hours * H];
  });
}

/**
 * Each person's Fanvue line for the period: hours from the Fanvue roster (minus
 * time already paid on OnlyFans), and PPVs bought and tips credited to whoever was
 * on that page's shift when the PPV was sent (or the tip came in), split between
 * them. Returns { byChatter: { id: { hours, overtime, shifts, gross, net, refunded,
 * pages } }, warnings }.
 */
async function fanvueLines(orgId, period, paidByChatter) {
  const out = {}, warnings = [];
  const pages = await R.loadPages(orgId, 'fanvue');
  if (!pages.length) return { byChatter: out, warnings };
  const pageIds = new Set(pages.map(p => p.id));
  // from the day before: a night shift that started then still covers the first hours
  const roster = await R.loadRoster(orgId, R.addDays(period.start, -1), period.end, 'fanvue', { removed: true });
  if (!roster.ready) {
    warnings.push('Fanvue has no shift times yet, so nobody\'s Fanvue hours or sales could be counted. Open Shifts with Fanvue picked once, then recalculate.');
    return { byChatter: out, warnings };
  }
  const { data: accounts } = await supabaseAdmin.from('fanvue_accounts').select('id, creator_id').eq('organisation_id', orgId);
  const accPage = Object.fromEntries((accounts || []).filter(a => pageIds.has(a.creator_id)).map(a => [a.id, a.creator_id]));
  const accIds = Object.keys(accPage);
  let earned = [];
  const sentAt = {};
  if (accIds.length) {
    const from = Date.parse(`${period.start}T00:00:00Z`), to = Date.parse(`${R.addDays(period.end, 1)}T00:00:00Z`);
    earned = (await all(() => supabaseAdmin.from('fanvue_earnings').select('account_id, transaction_order_id, source, paid_at, gross_cents, net_cents, message_uuid')
      .in('account_id', accIds).gte('paid_at', new Date(from - 3 * H).toISOString()).lt('paid_at', new Date(to + 3 * H).toISOString())
      .order('paid_at').order('transaction_order_id')))
      .filter(x => { const t = amsClock(x.paid_at); return t >= from && t < to; });
    // when each PPV was sent: the seller is whoever was on shift then
    const uuids = [...new Set(earned.filter(x => x.message_uuid).map(x => x.message_uuid))];
    for (let i = 0; i < uuids.length; i += 200) {
      const { data } = await supabaseAdmin.from('fanvue_messages').select('uuid, sent_at').in('account_id', accIds).in('uuid', uuids.slice(i, i + 200));
      for (const m of data || []) if (m.sent_at && !sentAt[m.uuid]) sentAt[m.uuid] = m.sent_at;
    }
  }
  const core = fanvueCore({ period, pages, roster, accPage, earned, sentAt, paidByChatter, today: todayAms() });
  return { byChatter: core.byChatter, warnings: [...warnings, ...core.warnings] };
}

/**
 * Each person's Fansly line: hours from the Fansly roster (minus time paid on
 * OnlyFans), chat PPVs and tips from the earnings ledger, credited to the chatter
 * whose browser sent the PPV (fansly_transactions.credited_chatter_id); a sale
 * with no known sender goes to whoever was on that page's shift when it was sent.
 * Wall and subscription income never reaches a line.
 */
async function fanslyLines(orgId, period, paidByChatter) {
  const out = {}, warnings = [];
  const pages = await R.loadPages(orgId, 'fansly');
  if (!pages.length) return { byChatter: out, warnings };
  const pageIds = new Set(pages.map(p => p.id));
  const roster = await R.loadRoster(orgId, R.addDays(period.start, -1), period.end, 'fansly', { removed: true });
  if (!roster.ready) {
    warnings.push('Fansly has no shift times yet, so nobody\'s Fansly hours could be counted. Open Shifts with Fansly picked once, then recalculate.');
  }
  const { data: accounts, error } = await supabaseAdmin.from('fansly_accounts').select('id, creator_id').eq('organisation_id', orgId);
  if (error) return { byChatter: out, warnings };                    // before database change 051
  const accPage = Object.fromEntries((accounts || []).filter(a => pageIds.has(a.creator_id)).map(a => [a.id, a.creator_id]));
  const accIds = Object.keys(accPage);
  let earned = []; const sentAt = {};
  if (accIds.length) {
    const from = Date.parse(`${period.start}T00:00:00Z`), to = Date.parse(`${R.addDays(period.end, 1)}T00:00:00Z`);
    const tx = await all(() => supabaseAdmin.from('fansly_transactions').select('account_id, transaction_id, category, created_at_fansly, gross, net, credited_message_id, credited_chatter_id')
      .in('account_id', accIds).in('category', ['chat_ppv', 'chat_tip', 'refund']).gte('created_at_fansly', new Date(from - 3 * H).toISOString()).lt('created_at_fansly', new Date(to + 3 * H).toISOString())
      .order('created_at_fansly').order('transaction_id'));
    earned = tx.filter(x => { const t = amsClock(x.created_at_fansly); return t >= from && t < to; }).map(x => ({
      account_id: x.account_id, transaction_order_id: x.transaction_id, paid_at: x.created_at_fansly,
      source: x.category === 'chat_ppv' ? 'message' : x.category === 'chat_tip' ? 'tip' : 'refund',
      gross_cents: Math.round(Number(x.gross || x.net || 0) * 100), net_cents: Math.round(Number(x.net || 0) * 100),
      message_uuid: x.credited_message_id || null, seller_id: x.credited_chatter_id || null,
    }));
    const ids = [...new Set(earned.filter(x => x.message_uuid).map(x => x.message_uuid))];
    for (let i = 0; i < ids.length; i += 200) {
      const { data } = await supabaseAdmin.from('fansly_messages').select('message_id, sent_at').in('account_id', accIds).in('message_id', ids.slice(i, i + 200));
      for (const m of data || []) if (m.sent_at && !sentAt[m.message_id]) sentAt[m.message_id] = m.sent_at;
    }
  }
  if (!roster.ready) { roster.slots = []; roster.assignments = []; roster.changes = []; }
  const core = fanvueCore({ period, pages, roster, accPage, earned, sentAt, paidByChatter, today: todayAms(), label: 'Fansly' });
  return { byChatter: core.byChatter, warnings: [...warnings, ...core.warnings] };
}

/**
 * The counting behind fanvueLines, without the database (so it can be tested):
 * the roster (slots, assignments, changes) for the period and the day before, the
 * Fanvue pages, which account is which page, the period's earnings, when each PPV
 * was sent, and what each person was paid for on OnlyFans.
 */
function fanvueCore({ period, pages, roster, accPage, earned, sentAt, paidByChatter, today, label = 'Fanvue' }) {
  const out = {}, warnings = [];
  const pageIds = new Set(pages.map(p => p.id));
  const pageName = Object.fromEntries(pages.map(p => [p.id, p.name]));
  const slotById = Object.fromEntries(roster.slots.map(x => [x.id, x]));
  const entries = [];
  for (let d = R.addDays(period.start, -1); d <= period.end; d = R.addDays(d, 1)) {
    for (const e of R.effectiveDay(d, roster.assignments.filter(a => onRoster(a, d)), roster.changes).entries) {
      const slot = slotById[e.shift_id];
      const onPages = (e.creator_ids || []).filter(id => pageIds.has(id));
      if (!slot || !onPages.length) continue;
      const [start, end] = rosterInterval(d, slot, e.from, e.to);
      entries.push({ date: d, chatter_id: e.chatter_id, slot, from: e.from, to: e.to, part: !!e.from, pages: onPages, start, end });
    }
  }
  const line = (cid) => (out[cid] ||= { hours: 0, overtime: 0, shifts: [], gross: 0, net: 0, refunded: 0, pages: {} });

  // hours: the shifts that started in the period, up to yesterday; each day's first
  // whole shift is regular time, the rest overtime
  const lastDay = period.end < today ? period.end : R.addDays(today, -1);
  const byDay = {};
  for (const e of entries) if (e.date >= period.start && e.date <= lastDay) (byDay[`${e.chatter_id}|${e.date}`] ||= []).push(e);
  for (const list of Object.values(byDay)) {
    list.sort((a, b) => a.start - b.start);
    const lead = list.find(e => !e.part);
    for (const e of list) {
      const shared = overlapMs([e.start, e.end], paidByChatter[e.chatter_id] || []);
      const hours = Math.max(0, Math.round(((e.end - e.start - shared) / H) * 2) / 2);
      const overtime = e !== lead;
      const x = line(e.chatter_id);
      if (overtime) x.overtime += hours; else x.hours += hours;
      x.shifts.push({
        date: e.date, shift: e.slot.name, from: e.from || e.slot.start, to: e.to || e.slot.end, whole: !e.part, overtime, hours,
        rostered: true, ...(shared ? { paid_on_onlyfans: r2(shared / H) } : {}),
      });
    }
  }

  // sales: PPVs bought and tips (refunds noted, as with Infloww)
  const covered = entries.length ? [Math.min(...entries.map(e => e.start)), Math.max(...entries.map(e => e.end))] : [0, 0];
  let nobody = 0;
  for (const x of earned) {
    const sale = FANVUE_SALES.has(x.source);
    if (!sale && !((x.source === 'refund' || x.source === 'chargeback') && x.message_uuid)) continue;
    const page = accPage[x.account_id];
    // the PPV's send time, if the roster covers it; else when it was bought
    const sent = x.message_uuid && sentAt[x.message_uuid] ? amsClock(sentAt[x.message_uuid]) : null;
    const when = sent != null && sent >= covered[0] && sent < covered[1] ? sent : amsClock(x.paid_at);
    // Fansly knows who sent the PPV (the browser that sent it); otherwise whoever was on the page's shift then
    const who = x.seller_id ? [x.seller_id] : [...new Set(entries.filter(e => e.pages.includes(page) && when >= e.start && when < e.end).map(e => e.chatter_id))];
    const gross = Math.abs(Number(x.gross_cents) || 0) / 100, net = Math.abs(Number(x.net_cents) || 0) / 100;
    if (!who.length) { if (sale) nobody += gross; continue; }
    for (const cid of who) {
      const l = line(cid), share = 1 / who.length;
      if (!sale) { l.refunded += gross * share; continue; }
      l.gross += gross * share; l.net += net * share;
      l.pages[pageName[page]] = (l.pages[pageName[page]] || 0) + gross * share;
    }
  }
  if (nobody >= 1) warnings.push(`${label}: ${money(nobody)} in sales came in while nobody was on the ${label} roster for that page, so it's on no report. The roster counts from the day someone is put on it: for days before that, add one-day changes (Shifts, with ${label} picked), then recalculate.`);
  return { byChatter: out, warnings };
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
  // Fanvue: hours from its roster (minus time paid on OnlyFans), sales by who was on shift
  const paid = Object.fromEntries(Object.entries(hours).map(([cid, h]) => [cid, paidIntervals(h.shifts)]));
  const fv = await fanvueLines(orgId, period, paid);
  const fvRates = fv.byChatter && Object.keys(fv.byChatter).length ? await platformRates(orgId, 'fanvue') : null;
  // Fansly: hours from its roster, sales from its ledger credited to the sender
  const fs = await fanslyLines(orgId, period, paid).catch(e => { console.error('[payroll] Fansly:', e.message); return { byChatter: {}, warnings: [`Couldn't count Fansly (${e.message}).`] }; });
  const fsRates = fs.byChatter && Object.keys(fs.byChatter).length ? await platformRates(orgId, 'fansly') : null;
  warnings.push(...(fs.warnings || []));

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
  warnings.push(...fv.warnings);
  if (today <= period.end) warnings.push(`This period isn't over yet (it ends ${fmtDay(period.end)}), so the numbers will still change.`);
  else if (today === period.payday && Number(new Date().toLocaleString('en-GB', { timeZone: 'Europe/Amsterdam', hour: '2-digit', hour12: false })) < 12) {
    warnings.push('Infloww can take a few hours to settle the last day\'s sales: recalculate later today to be safe.');
  }

  // one row per chatter who worked or sold, plus anyone already in this period
  const prev = Object.fromEntries(existing.map(r => [r.chatter_id, r]));
  const ids = new Set([...Object.keys(hours), ...Object.keys(sold), ...Object.keys(fv.byChatter), ...Object.keys(prev)]);
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
    // other platforms' lines; hours the manager typed in stay
    const lines = {};
    for (const [platform, found, pRates] of [['fanvue', fv, fvRates], ['fansly', fs, fsRates]]) {
      const f = found.byChatter[cid], was = prev[cid]?.lines?.[platform];
      if (!f && !(was && (was.hours != null || was.overtime_hours != null))) continue;
      const x = f || { hours: 0, overtime: 0, shifts: [], gross: 0, net: 0, refunded: 0, pages: {} };
      const rates = pRates ? ratesFor(pRates.own[cid], pRates.team) : ratesFor(null, await teamRates(orgId, platform));
      lines[platform] = {
        hours_auto: x.hours, overtime_hours_auto: x.overtime, hours: was?.hours ?? null, overtime_hours: was?.overtime_hours ?? null,
        ...rates, sales_gross: r2(x.gross), sales_net: r2(x.net), refunded: r2(x.refunded),
        pages: Object.entries(x.pages).map(([name, amount]) => ({ name, amount: r2(amount) })).filter(p => p.amount).sort((a, b) => b.amount - a.amount),
        shifts: x.shifts, basis: platform === 'fansly' ? 'sender' : 'roster',
      };
    }
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
      lines,
      calculated_at: now, updated_at: now, created_by: prev[cid]?.created_by || userId,
    });
  }
  return { period, rows, warnings, calculated_at: now };
}

/** Calculate the period (buildPeriod) and save it; returns the saved period. */
async function calculatePeriod(orgId, start, userId = null) {
  const built = await buildPeriod(orgId, start, userId);
  const { period, warnings, calculated_at } = built;
  let { rows } = built;
  if (rows.length) {
    const save = (list) => supabaseAdmin.from('payroll_reports').upsert(list, { onConflict: 'organisation_id,period_start,chatter_id' });
    let { error } = await save(rows);
    if (error && /\blines\b/.test(error.message)) {
      // before migration 035 there's no room for other platforms: OnlyFans only
      const fanvue = rows.some(r => Object.keys(r.lines || {}).length);
      rows = rows.map(({ lines: _l, ...r }) => r);
      ({ error } = await save(rows));
      if (fanvue) warnings.push('Run database change 035 in Supabase to add Fanvue to the reports. Until then they cover OnlyFans only.');
    }
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
  const [rows, { data: meta, error }, chatters, ownOn] = await Promise.all([
    all(() => supabaseAdmin.from('payroll_reports').select('*').eq('organisation_id', orgId).eq('period_start', period.start).order('id')),
    supabaseAdmin.from('payroll_periods').select('warnings, calculated_at').eq('organisation_id', orgId).eq('period_start', period.start).maybeSingle(),
    all(() => supabaseAdmin.from('chatters').select('id, name, hourly_rate').eq('organisation_id', orgId).order('id')),
    ownPlatformRates(orgId),
  ]);
  if (error) throw new Error(error.message);
  const byId = Object.fromEntries(chatters.map(c => [c.id, c]));
  return {
    period: { ...period, running: todayAms() <= period.end },
    calculated_at: meta?.calculated_at || null,
    warnings: meta?.warnings || [],
    rows: rows.map(r => present(r, byId[r.chatter_id], ownOn)).sort((a, b) => a.chatter_name.localeCompare(b.chatter_name)),
  };
}

/** One saved report as the page shows it (name, live "default rate" flag, the money). */
async function viewRow(row) {
  const [{ data: c }, ownOn] = await Promise.all([
    supabaseAdmin.from('chatters').select('name, hourly_rate').eq('id', row.chatter_id).maybeSingle(),
    ownPlatformRates(row.organisation_id, row.chatter_id),
  ]);
  return present(row, c, ownOn);
}

// Who has an hourly rate of their own on another platform ("fanvue|<chatter id>");
// nobody before migration 035.
async function ownPlatformRates(orgId, chatterId = null) {
  let q = supabaseAdmin.from('chatter_platform_rates').select('chatter_id, platform').eq('organisation_id', orgId).not('hourly_rate', 'is', null);
  if (chatterId) q = q.eq('chatter_id', chatterId);
  const { data } = await q;
  return new Set((data || []).map(r => `${r.platform}|${r.chatter_id}`));
}

// A saved report as shown: the name, the money, whose rates each platform's part
// uses (own_rates), and "default rate" when a platform they worked on has no rate
// of theirs yet (worked out now, so it's never stale).
function present(r, c, ownOn) {
  const others = Object.keys(r.lines || {});
  const own_rates = { onlyfans: c?.hourly_rate != null, ...Object.fromEntries(others.map(p => [p, ownOn.has(`${p}|${r.chatter_id}`)])) };
  const onOnlyFans = !others.length || [r.hours_auto, r.overtime_hours_auto, r.hours, r.overtime_hours, r.sales_gross].some(v => num(v, 0) > 0);
  const team = (onOnlyFans && !own_rates.onlyfans) || others.some(p => !own_rates[p]);
  const flags = (r.details?.flags || []).filter(f => f !== 'default_rate');
  return { ...r, chatter_name: c?.name || '?', own_rates, ...totals(r), details: { ...r.details, flags: team ? ['default_rate', ...flags] : flags } };
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
 * A platform's pay rates: the team's and every active chatter's own (null = the
 * team's). OnlyFans' live on chatters (`overtime` is false until migration 029 adds
 * the overtime rate). Another platform's people's rates live in
 * chatter_platform_rates (`ready` is false until migration 035), and its team rates
 * may be empty: then the general ones (`general`) apply.
 */
async function loadRates(orgId, platform = 'onlyfans') {
  const [chatters, { data: ign }] = await Promise.all([
    all(() => supabaseAdmin.from('chatters').select('*').eq('organisation_id', orgId).order('id')),
    supabaseAdmin.from('daily_check_config').select('value').eq('organisation_id', orgId).eq('key', 'ignored_accounts').maybeSingle(),
  ]);
  const ignored = new Set(String(ign?.value || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean));
  const people = chatters.filter(c => c.is_active !== false && !ignored.has(c.name.toLowerCase().trim())).sort((a, b) => a.name.localeCompare(b.name));
  if (platform === 'onlyfans') {
    return {
      platform, ready: true, team: await teamRates(orgId),
      overtime: !chatters.length || 'overtime_rate' in chatters[0],
      chatters: people.map(c => ({ id: c.id, name: c.name, hourly_rate: num(c.hourly_rate, null), commission_pct: num(c.commission_pct, null), overtime_rate: num(c.overtime_rate, null) })),
    };
  }
  const k = rateKeys(platform);
  const [{ data: cfg }, general, own] = await Promise.all([
    supabaseAdmin.from('daily_check_config').select('key, value').eq('organisation_id', orgId).in('key', Object.values(k)),
    teamRates(orgId),
    supabaseAdmin.from('chatter_platform_rates').select('chatter_id, hourly_rate, commission_pct, overtime_rate').eq('organisation_id', orgId).eq('platform', platform),
  ]);
  const v = Object.fromEntries((cfg || []).map(c => [c.key, c.value]));
  const mine = Object.fromEntries((own.data || []).map(r => [r.chatter_id, r]));
  return {
    platform, ready: !own.error, overtime: true, general,
    team: Object.fromEntries(RATE_FIELDS.map(f => [f, num(v[k[f]], null)])),
    chatters: people.map(c => ({ id: c.id, name: c.name, ...Object.fromEntries(RATE_FIELDS.map(f => [f, num(mine[c.id]?.[f], null)])) })),
  };
}

/** Save one person's own rates for another platform (only the fields given change; all empty = none). */
async function setPlatformRates(orgId, chatterId, platform, rates) {
  const sent = Object.fromEntries(RATE_FIELDS.filter(f => rates[f] !== undefined).map(f => [f, rates[f]]));
  if (!Object.keys(sent).length) return;
  const { data: cur, error: e0 } = await supabaseAdmin.from('chatter_platform_rates').select('hourly_rate, commission_pct, overtime_rate')
    .eq('chatter_id', chatterId).eq('platform', platform).maybeSingle();
  if (e0) throw new Error(/chatter_platform_rates/.test(e0.message) ? 'Run database change 035 in Supabase to set rates for this platform' : e0.message);
  const next = { ...Object.fromEntries(RATE_FIELDS.map(f => [f, cur?.[f] ?? null])), ...sent };
  const { error } = RATE_FIELDS.every(f => next[f] == null)
    ? await supabaseAdmin.from('chatter_platform_rates').delete().eq('chatter_id', chatterId).eq('platform', platform)
    : await supabaseAdmin.from('chatter_platform_rates').upsert({ organisation_id: orgId, chatter_id: chatterId, platform, ...next, updated_at: new Date().toISOString() }, { onConflict: 'chatter_id,platform' });
  if (error) throw new Error(error.message);
}

/**
 * Save the team's rates and the chatters' own ({ id, hourly_rate, commission_pct,
 * overtime_rate }, null = the team's), then bring draft reports onto them (final
 * reports keep the rates they were made with).
 */
async function saveRates(orgId, { platform = 'onlyfans', team, chatters = [] }) {
  if (platform !== 'onlyfans') return saveOtherRates(orgId, platform, { team, chatters });
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

// Another platform's rates: the team's (empty = the general ones) and each person's
// own; then draft reports take them on that platform's line.
async function saveOtherRates(orgId, platform, { team, chatters = [] }) {
  const k = rateKeys(platform);
  if (team) for (const f of RATE_FIELDS) if (team[f] !== undefined) await setConfig(orgId, k[f], team[f]);
  for (const c of chatters) await setPlatformRates(orgId, c.id, platform, c);
  await refreshDraftLines(orgId, platform);
  return loadRates(orgId, platform);
}

// Draft reports with a line for `platform` get its current rates (final ones keep theirs).
async function refreshDraftLines(orgId, platform) {
  const { team, own } = await platformRates(orgId, platform);
  let drafts;
  try {
    drafts = await all(() => supabaseAdmin.from('payroll_reports').select('id, chatter_id, lines').eq('organisation_id', orgId).eq('status', 'draft').order('id'));
  } catch (e) {
    if (/\blines\b/.test(e.message)) return;                  // before migration 035
    throw e;
  }
  for (const r of drafts) {
    const l = r.lines?.[platform];
    if (!l) continue;
    const want = ratesFor(own[r.chatter_id], team);
    if (RATE_FIELDS.every(f => num(l[f], null) === want[f])) continue;
    const { error } = await supabaseAdmin.from('payroll_reports').update({ lines: { ...r.lines, [platform]: { ...l, ...want } }, updated_at: new Date().toISOString() }).eq('id', r.id);
    if (error) throw new Error(error.message);
  }
}

module.exports = {
  _test: { fanvueCore, paidIntervals, rosterInterval, present },
  ANCHOR, PERIOD_DAYS, DEFAULT_RATE, DEFAULT_COMMISSION, RATE_FIELDS,
  periodOf, isPeriodStart, recentPeriods, totals, buildPeriod, calculatePeriod, loadPeriod, viewRow, loadRates, saveRates, setPlatformRates, todayAms,
};
