/**
 * "My stats": one chatter's own numbers, for the chatter themself (and a manager checking what they see).
 * Everything is cut down to that chatter here, on the server: the answer never holds another chatter's
 * numbers or a page's totals.
 *
 *  - sales and chatting: the Creator reports' chatter rows (OnlyFans / Fansly / Fanvue), now and the days before
 *  - pay: this pay period worked out as payroll does it, without saving, with the manager's own changes on top
 *  - coaching: open review tasks; feedback: the latest AI reviews; penalties and bonuses
 *  - level (stage) and the next 7 days of shifts
 */
const { supabaseAdmin } = require('./supabase');
const OF = require('./ofReports');
const FS = require('./fanslyReports');
const FV = require('./fanvueReports');
const P = require('./payroll');
const R = require('./roster');
const { stageOf } = require('./chatterStage');

const REPORTS = { onlyfans: OF.report, fansly: FS.report, fanvue: FV.report };
const PLATFORMS = Object.keys(REPORTS);
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// the reports and the payroll run cover the whole team: worked out once and shared for a few minutes
const cache = new Map();
function cached(key, ms, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ms) return hit.p;
  const p = fn().catch((e) => { cache.delete(key); throw e; });
  cache.set(key, { at: Date.now(), p });
  if (cache.size > 200) cache.delete(cache.keys().next().value);
  return p;
}

/** The chatter a login belongs to: the same email (as the Fansly extension finds it), else the same name. */
async function chatterOfUser(user) {
  const cols = 'id, name, email, started_on, created_at, stage_override, platforms, is_active';
  if (user.email) {
    const { data } = await supabaseAdmin.from('chatters').select(cols).eq('organisation_id', user.organisationId).ilike('email', user.email).limit(1);
    if (data?.[0]) return data[0];
  }
  if (user.name) {
    const { data } = await supabaseAdmin.from('chatters').select(cols).eq('organisation_id', user.organisationId).ilike('name', user.name).limit(2);
    if (data?.length === 1) return data[0];
  }
  return null;
}

async function chatterById(orgId, id) {
  const { data } = await supabaseAdmin.from('chatters').select('id, name, email, started_on, created_at, stage_override, platforms, is_active')
    .eq('organisation_id', orgId).eq('id', id).maybeSingle();
  return data || null;
}

// the numbers a chatter's row carries (and the same for the days before)
const KEEP = ['sales', 'messages', 'mass', 'ppv_sent', 'ppv_bought', 'ppv_sales', 'fans', 'buyers', 'reply_s', 'replies', 'unlock_rate', 'golden_ratio'];
const pickRow = (c) => (c ? Object.fromEntries(KEEP.map(k => [k, c[k] ?? null])) : null);

async function salesFor(orgId, chatterId, platform, from, to) {
  const rep = await cached(`rep|${orgId}|${platform}|${from}|${to}`, 3 * 60_000, () => REPORTS[platform](orgId, { from, to, accounts: [], gross: true }));
  const c = (rep.chatters || []).find(x => x.chatter_id === chatterId);
  return {
    platform, from: rep.from, to: rep.to, prev_from: rep.prev_from, prev_to: rep.prev_to,
    now: pickRow(c), prev: pickRow(c?.prev),
    chats_until: rep.chats_until || null,          // OnlyFans: the chat exports reach this far
  };
}

/** This pay period as payroll works it out now, with what the manager changed by hand on top. */
async function payFor(orgId, chatterId) {
  const today = P.todayAms();
  const period = P.periodOf(today);
  const [built, { data: saved }] = await Promise.all([
    cached(`pay|${orgId}|${period.start}`, 10 * 60_000, () => P.buildPeriod(orgId, period.start)),
    supabaseAdmin.from('payroll_reports').select('*').eq('organisation_id', orgId).eq('period_start', period.start).eq('chatter_id', chatterId).maybeSingle(),
  ]);
  const row = built.rows.find(r => r.chatter_id === chatterId);
  if (!row && !saved) return { period: { ...period, running: today <= period.end }, worked: false };
  // a final report is what gets paid: as it is; otherwise the fresh numbers with the manager's own entries
  let use = row || saved;
  if (saved && saved.status === 'final') use = saved;
  else if (saved && row) {
    const lines = { ...(row.lines || {}) };
    for (const [p, l] of Object.entries(saved.lines || {})) if (lines[p]) lines[p] = { ...lines[p], hours: l.hours ?? null, overtime_hours: l.overtime_hours ?? null };
    use = { ...row, hours: saved.hours ?? null, overtime_hours: saved.overtime_hours ?? null, additions: saved.additions ?? 0, deductions: saved.deductions ?? 0, notes: saved.notes || null, lines };
  }
  const t = P.totals(use);
  return {
    period: { ...period, running: today <= period.end },
    worked: true,
    final: saved?.status === 'final',
    onlyfans: { hours: t.hours_paid, overtime: t.overtime_paid, sales_net: t.sales_net, commission: t.commission, hourly_pay: t.hourly_pay, overtime_pay: t.overtime_pay,
      hourly_rate: Number(use.hourly_rate) || 0, commission_pct: Number(use.commission_pct) || 0, pages: use.details?.pages || [] },
    platforms: t.platforms.map(x => ({ platform: x.platform, hours: x.hours_paid, overtime: x.overtime_paid, sales_net: x.sales_net, commission: x.commission,
      hourly_pay: x.hourly_pay, overtime_pay: x.overtime_pay, pay: x.pay, hourly_rate: x.hourly_rate, commission_pct: x.commission_pct, pages: use.lines?.[x.platform]?.pages || [] })),
    additions: r2(use.additions), deductions: r2(use.deductions), notes: use.notes || null,
    total: t.total,
  };
}

/** The next 7 days of shifts (every platform): date, times, pages. */
async function shiftsFor(orgId, chatterId) {
  const from = P.todayAms(), to = R.addDays(from, 6);
  const r = await R.loadRoster(orgId, from, to, null);
  if (!r.ready) return [];
  const slot = Object.fromEntries(r.slots.map(s => [s.id, s]));
  const page = Object.fromEntries(r.pages.map(p => [p.id, p]));
  const out = [];
  for (let d = from; d <= to; d = R.addDays(d, 1)) {
    const day = R.effectiveDay(d, r.assignments, r.changes);
    if (day.off.some(o => o.chatter_id === chatterId)) { out.push({ date: d, off: true }); continue; }
    for (const e of day.entries.filter(x => x.chatter_id === chatterId)) {
      const s = slot[e.shift_id]; if (!s) continue;
      out.push({ date: d, shift: s.name, platform: s.platform, start: e.from || s.start, end: e.to || s.end, part: !!(e.from || e.to),
        pages: e.creator_ids.map(id => page[id]?.name).filter(Boolean), cover: e.source === 'change' });
    }
  }
  return out;
}

/** Open coaching tasks, and how many were done lately. */
async function coachingFor(orgId, chatterId) {
  const since = new Date(Date.now() - 14 * 86400000).toISOString();
  const [{ data: open }, { count: done }] = await Promise.all([
    supabaseAdmin.from('review_tasks').select('id, title, detail, severity, area, creator_name, fan_username, first_seen_date, last_seen_date, days_open, status, source_type')
      .eq('organisation_id', orgId).eq('chatter_id', chatterId).in('status', ['open', 'taken']).order('priority', { ascending: false, nullsFirst: false }).limit(30),
    supabaseAdmin.from('review_tasks').select('id', { count: 'exact', head: true }).eq('organisation_id', orgId).eq('chatter_id', chatterId).eq('status', 'completed').gte('completed_at', since),
  ]);
  return { open: open || [], done_14d: done || 0 };
}

/** The latest AI reviews (daily check and dialogue quality): the summary and the points, in plain words. */
async function feedbackFor(orgId, chatterId) {
  const { data } = await supabaseAdmin.from('chatter_evaluations').select('eval_type, report_date, payload, created_at')
    .eq('organisation_id', orgId).eq('chatter_id', chatterId).order('report_date', { ascending: false }).order('created_at', { ascending: false }).limit(20);
  const seen = new Set(), out = [];
  for (const r of data || []) {
    if (seen.has(r.eval_type)) continue;
    seen.add(r.eval_type);
    const p = r.payload || {};
    out.push({
      type: r.eval_type, date: r.report_date,
      summary: typeof p.overall === 'string' ? p.overall : (p.overall?.summary || p.summary || null),
      points: (p.issues || []).slice(0, 12).map(i => ({ area: i.area || null, severity: i.severity || null, page: i.creator || null, fan: i.fan_username || i.fan || null, detail: i.detail || i.title || null, message: i.message || null })),
      strengths: Array.isArray(p.strengths) ? p.strengths.slice(0, 6) : [],
    });
  }
  return out;
}

async function penaltiesFor(chatterId) {
  const { data } = await supabaseAdmin.from('chatter_penalties').select('id, penalty_type, amount, description, created_at, users:issued_by(name)')
    .eq('chatter_id', chatterId).order('created_at', { ascending: false }).limit(30);
  return (data || []).map(p => ({ id: p.id, type: p.penalty_type, amount: p.amount != null ? Number(p.amount) : null, note: p.description || null, at: p.created_at, by: p.users?.name || null }));
}

/** Everything on the My stats page, for one chatter and one date range (Amsterdam days, `to` included). */
async function myStats(orgId, chatter, { from, to }) {
  const today = P.todayAms();
  const platforms = (chatter.platforms && chatter.platforms.length ? chatter.platforms : PLATFORMS).filter(p => PLATFORMS.includes(p));
  const safe = (p, fallback) => p.catch((e) => { console.error('[myStats]', e.message); return fallback; });
  const [sales, todays, pay, shifts, coaching, feedback, penalties] = await Promise.all([
    Promise.all(platforms.map(p => safe(salesFor(orgId, chatter.id, p, from, to), { platform: p, error: true }))),
    Promise.all(platforms.map(p => safe(salesFor(orgId, chatter.id, p, today, today), { platform: p, error: true }))),
    safe(payFor(orgId, chatter.id), { error: true }),
    safe(shiftsFor(orgId, chatter.id), []),
    safe(coachingFor(orgId, chatter.id), { open: [], done_14d: 0 }),
    safe(feedbackFor(orgId, chatter.id), []),
    safe(penaltiesFor(chatter.id), []),
  ]);
  return {
    chatter: { id: chatter.id, name: chatter.name, platforms },
    level: stageOf(chatter, today),
    from, to, today,
    sales, today_sales: todays,
    pay, shifts, coaching, feedback, penalties,
  };
}

module.exports = { myStats, chatterOfUser, chatterById };
