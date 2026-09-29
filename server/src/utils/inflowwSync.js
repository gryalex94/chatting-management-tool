const { supabaseAdmin } = require('./supabase');
const infloww = require('../integrations/infloww');
const { applyInflowwSpend } = require('./inflowwChecks');

/**
 * Pulls Infloww data into our tables (read-only on Infloww's side):
 *  - pages      → creators.infloww_creator_id (filled by exact name when missing)
 *  - employees  → infloww_employees, linked to our chatters by exact name
 *  - sales      → infloww_sales (every sale + who it's credited to)
 *  - refunds    → infloww_refunds
 *  - fan IDs    → fan_infloww_ids for renamed fans, learned by matching PPV
 *                 sales to the purchases in our chat exports
 * Runs hourly for the last few days (recent sales stay "loading" and change for
 * ~12 h), and once over the past year as a backfill. The organisation is the one
 * whose pages carry the Infloww page IDs this key can see.
 */
const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
let running = null;                       // the sync in progress, if any
let lastResult = null;                    // the last sync's summary, errors included

async function upsertChunks(table, rows, onConflict) {
  let n = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error } = await supabaseAdmin.from(table).upsert(chunk, { onConflict });
    if (error) throw new Error(`${table}: ${error.message}`);
    n += chunk.length;
  }
  return n;
}

async function setState(orgId, resource, patch) {
  await supabaseAdmin.from('infloww_sync_state')
    .upsert({ organisation_id: orgId, resource, ...patch }, { onConflict: 'organisation_id,resource' });
}

// Run one resource, recording when it ran, how much it pulled, or its error.
async function step(orgId, resource, fn, summary) {
  const now = new Date().toISOString();
  try {
    const rows = await fn();
    await setState(orgId, resource, { last_run_at: now, last_ok_at: now, rows, error: null });
    summary[resource] = rows;
  } catch (e) {
    await setState(orgId, resource, { last_run_at: now, error: String(e.message).slice(0, 500) }).catch(() => {});
    summary[resource] = { error: e.message };
    console.error(`[InflowwSync] ${resource}:`, e.message);
  }
}

/** Which organisation this key belongs to, and our page id for each Infloww page id. */
// Infloww's reports name pages by platform id; map those to our page ids.
function platformMap(apiPages, pageMap) {
  const out = {};
  for (const p of apiPages) if (pageMap[p.id] && p.platformPid != null) out[String(p.platformPid)] = pageMap[p.id];
  return out;
}

async function resolvePages(apiPages) {
  const ids = apiPages.map(p => String(p.id));
  const { data: ours } = await supabaseAdmin.from('creators').select('id, name, organisation_id, infloww_creator_id');
  const byOrg = {};
  for (const c of (ours || [])) if (c.infloww_creator_id && ids.includes(c.infloww_creator_id)) byOrg[c.organisation_id] = (byOrg[c.organisation_id] || 0) + 1;
  const orgId = Object.entries(byOrg).sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!orgId) throw new Error('None of our pages has an Infloww page ID this key can see — set them in Settings → page');

  const mine = (ours || []).filter(c => c.organisation_id === orgId);
  const pageMap = {};                                   // infloww page id → our creator id
  for (const c of mine) if (c.infloww_creator_id) pageMap[c.infloww_creator_id] = c.id;
  // Pages still without an ID: take it from an exact, unique name match.
  for (const p of apiPages) {
    if (pageMap[p.id]) continue;
    const same = mine.filter(c => !c.infloww_creator_id && norm(c.name) === norm(p.name));
    if (same.length === 1) {
      const { error } = await supabaseAdmin.from('creators').update({ infloww_creator_id: String(p.id) }).eq('id', same[0].id);
      if (!error) pageMap[p.id] = same[0].id;
    }
  }
  return { orgId, pageMap };
}

async function syncEmployees(orgId) {
  const emps = await infloww.getAll('/v1/employees');
  const { data: chatters } = await supabaseAdmin.from('chatters').select('id, name').eq('organisation_id', orgId);
  const byName = {};
  for (const c of (chatters || [])) (byName[norm(c.name)] ||= []).push(c.id);
  // A name shared by several employees (old + new account) links only the active one.
  const activeByName = {};
  for (const e of emps) if (e.status === 'Activated') (activeByName[norm(e.employeeName)] ||= []).push(e.employeeId);
  const rows = emps.map(e => {
    const key = norm(e.employeeName);
    const chatter = byName[key]?.length === 1 ? byName[key][0] : null;
    const unique = (activeByName[key]?.length || 0) <= 1 && (e.status === 'Activated' || !activeByName[key]?.length);
    return {
      organisation_id: orgId, employee_id: String(e.employeeId), name: e.employeeName || null,
      status: e.status || null, chatter_id: chatter && unique ? chatter : null, updated_at: new Date().toISOString(),
    };
  });
  return upsertChunks('infloww_employees', rows, 'organisation_id,employee_id');
}

async function syncSales(orgId, pageMap, from, to) {
  let n = 0;
  for (const [inflowwId, creatorId] of Object.entries(pageMap)) {
    for (const [s, e] of infloww.windows(from, to)) {
      const list = await infloww.getAll('/v1/transaction-perf/details', { creatorId: inflowwId, startTime: s.toISOString(), endTime: e.toISOString() });
      const rows = list.map(x => ({
        organisation_id: orgId, id: String(x.id), transaction_id: x.transactionId ? String(x.transactionId) : null,
        creator_id: creatorId, fan_id: x.fanId != null ? String(x.fanId) : null, fan_name: x.fanName || null,
        created_at: infloww.toDate(x.createdTime)?.toISOString() || null,
        type: x.type || null, tip_source: x.tipSource || null, status: x.status || null,
        amount: infloww.toDollars(x.amount), net: infloww.toDollars(x.net), sales_rule: x.salesRule || null,
        employee_id: x.attributeEmployeeId != null ? String(x.attributeEmployeeId) : null,
        sales_amount: infloww.toDollars(x.salesAmount), currency: x.currency || null, synced_at: new Date().toISOString(),
      }));
      n += await upsertChunks('infloww_sales', rows, 'organisation_id,id');
    }
  }
  return n;
}

async function syncRefunds(orgId, pageMap, from, to) {
  let n = 0;
  for (const [inflowwId, creatorId] of Object.entries(pageMap)) {
    for (const [s, e] of infloww.windows(from, to)) {
      const list = await infloww.getAll('/v1/refunds', { creatorId: inflowwId, startTime: s.toISOString(), endTime: e.toISOString() });
      const rows = list.map(x => ({
        organisation_id: orgId, id: String(x.id), transaction_id: x.transactionId ? String(x.transactionId) : null,
        creator_id: creatorId, fan_id: x.fanId != null ? String(x.fanId) : null,
        payment_time: infloww.toDate(x.paymentTime)?.toISOString() || null,
        refund_time: infloww.toDate(x.refundTime)?.toISOString() || null,
        status: x.paymentStatus || null, amount: infloww.toDollars(x.paymentAmount),
        type: x.transactionType || null, currency: x.currency || null, synced_at: new Date().toISOString(),
      }));
      n += await upsertChunks('infloww_refunds', rows, 'organisation_id,id');
    }
  }
  return n;
}

/**
 * Daily page stats (what the Creator Statistics upload used to fill), per
 * Amsterdam day, into creator_daily_stats:
 *  - earnings by type, spenders, averages: from our synced sales (matched the
 *    uploads within ~1% on 62 of 65 page-days, counted per Amsterdam day)
 *  - refunds: from our synced refunds, by the day of the refund
 *  - new / renewed subs, active & expired fans, auto-renew, subscription length,
 *    ranking: from Infloww's creator reports
 * The hourly run refreshes the last few days (Infloww's reports can lag up to a
 * day). A backfill only fills days that have no stats yet (e.g. days nobody
 * uploaded) and never rewrites what was uploaded.
 */
const amsDate = (d) => infloww.toStoreTime(d).toISOString().slice(0, 10);
const round2 = (n) => Math.round(n * 100) / 100;

async function syncPageStats(orgId, pageMap, pidMap, from, to, { onlyMissing = false } = {}) {
  const dFrom = amsDate(from), dTo = amsDate(to);
  const inRange = (d) => d >= dFrom && d <= dTo;

  // Sales and refunds are already in our tables (synced just before).
  const sales = [];
  for (let off = 0; ; off += 1000) {
    const { data, error } = await supabaseAdmin.from('infloww_sales')
      .select('creator_id, created_at, type, amount, fan_id')
      .eq('organisation_id', orgId).gte('created_at', new Date(from.getTime() - 86400000).toISOString())
      .order('id').range(off, off + 999);
    if (error) throw new Error(error.message);
    sales.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  const { data: refunds } = await supabaseAdmin.from('infloww_refunds').select('creator_id, refund_time, amount')
    .eq('organisation_id', orgId).gte('refund_time', new Date(from.getTime() - 86400000).toISOString());

  const { data: names } = await supabaseAdmin.from('creators').select('id, name').eq('organisation_id', orgId);
  const nameOf = Object.fromEntries((names || []).map(c => [c.id, c.name]));
  const rows = {};                                          // creator|date -> row
  const row = (creatorId, date) => (rows[`${creatorId}|${date}`] ||= {
    organisation_id: orgId, creator_id: creatorId, creator_name: nameOf[creatorId] || null, report_date: date,
    total_earnings_gross: 0, total_subscription_gross: 0, subscription_gross: 0, recurring_subscriptions_gross: 0,
    tips_gross: 0, message_gross: 0, refund_gross: 0, _spenders: new Set(), _tx: 0,
  });
  for (const s of sales) {
    if (!s.created_at || !s.creator_id) continue;
    const date = amsDate(s.created_at);
    if (!inRange(date)) continue;
    const r = row(s.creator_id, date), amt = Number(s.amount) || 0;
    r.total_earnings_gross += amt;
    if (s.type === 'Subscription') { r.subscription_gross += amt; r.total_subscription_gross += amt; }
    else if (s.type === 'RecurringSubscription') { r.recurring_subscriptions_gross += amt; r.total_subscription_gross += amt; }
    else if (s.type === 'Tips') r.tips_gross += amt;
    else if (s.type === 'Messages') r.message_gross += amt;
    if (amt > 0) { r._tx++; if (s.fan_id) r._spenders.add(s.fan_id); }
  }
  for (const f of (refunds || [])) {
    if (!f.refund_time || !f.creator_id) continue;
    const date = amsDate(f.refund_time);
    if (inRange(date)) row(f.creator_id, date).refund_gross += Number(f.amount) || 0;
  }

  // Infloww's creator reports (≤10 pages and ≤31 days per call), keyed by platform id.
  const ids = Object.keys(pageMap);
  const report = async (path) => {
    const out = [];
    for (const [ws, we] of infloww.windows(new Date(dFrom + 'T00:00:00Z'), new Date(Date.parse(dTo + 'T00:00:00Z') + 86400000), 31)) {
      for (let i = 0; i < ids.length; i += 10) {
        const body = await infloww.get(path, { creatorIds: ids.slice(i, i + 10), startTime: ws.toISOString().slice(0, 10), endTime: new Date(we.getTime() - 86400000).toISOString().slice(0, 10) });
        out.push(...(body.data?.list || []));
      }
    }
    return out;
  };
  const put = (list, fn) => {
    for (const x of list) {
      const creatorId = pidMap[String(x.platformPid)];
      if (creatorId && x.date && inRange(x.date)) fn(row(creatorId, x.date), x);
    }
  };
  const num = (v) => (v == null || v === '' ? null : Number(String(v).replace(/[^0-9.-]/g, '')));
  put(await report('/v1/creator-report/fans/subscriber-count'), (r, x) => {
    r.new_subscribers = num(x.newSubscribers); r.new_fans = r.new_subscribers; r.subscriber_renewals = num(x.subscriberRenewals);
  });
  const fanCounts = await report('/v1/creator-report/fans/count');
  put(fanCounts, (r, x) => { r.active_fans = num(x.activeFans); r._expired = num(x.expiredFans); });
  put(await report('/v1/creator-report/fans/renew-on'), (r, x) => { r.fans_renew_on = num(x.fansWithRenewOn); });
  put(await report('/v1/creator-report/fans/avg-subscription-length'), (r, x) => { r.avg_subscription_length_days = num(x.avgSubscriptionLength); });
  put(await report('/v1/creator-report/rank'), (r, x) => { r.of_ranking = num(x.performanceRank); });

  // Derived fields, then drop the helpers.
  const expiredByKey = {};
  for (const r of Object.values(rows)) if (r._expired != null) expiredByKey[`${r.creator_id}|${r.report_date}`] = r._expired;
  const prevDay = (d) => new Date(Date.parse(d + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10);
  let out = Object.values(rows).map(r => {
    const spenders = r._spenders.size;
    const o = {
      ...r,
      total_earnings_gross: round2(r.total_earnings_gross), total_subscription_gross: round2(r.total_subscription_gross),
      subscription_gross: round2(r.subscription_gross), recurring_subscriptions_gross: round2(r.recurring_subscriptions_gross),
      tips_gross: round2(r.tips_gross), message_gross: round2(r.message_gross), refund_gross: round2(r.refund_gross),
      number_of_spenders: spenders,
      avg_spend_per_spender_gross: spenders ? round2(r.total_earnings_gross / spenders) : 0,
      avg_spend_per_transaction_gross: r._tx ? round2(r.total_earnings_gross / r._tx) : 0,
    };
    if (o.active_fans && o.fans_renew_on != null) o.renew_on_pct = round2(100 * o.fans_renew_on / o.active_fans);
    const prev = expiredByKey[`${r.creator_id}|${prevDay(r.report_date)}`];
    if (r._expired != null && prev != null) o.expired_fan_change = r._expired - prev;
    delete o._spenders; delete o._tx; delete o._expired;
    return o;
  });

  if (onlyMissing) {
    const { data: have } = await supabaseAdmin.from('creator_daily_stats').select('creator_id, report_date')
      .eq('organisation_id', orgId).gte('report_date', dFrom).lte('report_date', dTo);
    const exists = new Set((have || []).map(h => `${h.creator_id}|${h.report_date}`));
    out = out.filter(r => !exists.has(`${r.creator_id}|${r.report_date}`));
  }
  // Rows differ in which report fields they carry; PostgREST needs the same keys
  // in one batch, so group by key set.
  const groups = {};
  for (const r of out) (groups[Object.keys(r).sort().join(',')] ||= []).push(r);
  let n = 0;
  for (const g of Object.values(groups)) n += await upsertChunks('creator_daily_stats', g, 'creator_id,report_date');
  return n;
}

/**
 * Renamed fans' OnlyFans IDs, from PPV sales. A sale is matched to a purchase in
 * our chat exports on the same page, at the same price, by the same fan name,
 * when exactly one fan fits. Our message times are the PPV's send time in
 * Amsterdam wall-clock (≈1–2 h ahead of the API's UTC), and a fan often buys
 * later than it was sent — hence the window: sent up to 48 h before the sale,
 * or up to 3 h "after" it. Verified on real data: for fans with a default
 * "u<number>" username the matched number equalled the API's fan ID 142/142.
 * A manager's pasted chat link always wins over a match.
 */
async function learnFanIds(orgId, from, to) {
  const sales = [];
  for (let off = 0; ; off += 1000) {
    const { data, error } = await supabaseAdmin.from('infloww_sales')
      .select('creator_id, fan_id, fan_name, created_at, amount')
      .eq('organisation_id', orgId).eq('type', 'Messages')
      .gte('created_at', from.toISOString()).lt('created_at', to.toISOString())
      .order('id').range(off, off + 999);
    if (error) throw new Error(error.message);
    sales.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  if (!sales.length) return 0;

  // Our purchases over the same span (+ margins), indexed by page|price.
  const buys = {};
  const msgFrom = new Date(from.getTime() - 48 * 3600e3).toISOString();
  const msgTo = new Date(to.getTime() + 4 * 3600e3).toISOString();
  for (let off = 0; ; off += 1000) {
    const { data, error } = await supabaseAdmin.from('messages')
      .select('creator_id, sent_to_username, sent_to_nickname, sent_datetime, price')
      .eq('organisation_id', orgId).eq('purchased', true).gt('price', 0)
      .gte('sent_datetime', msgFrom).lt('sent_datetime', msgTo)
      .order('id').range(off, off + 999);
    if (error) throw new Error(error.message);
    for (const m of (data || [])) {
      if (!m.sent_to_username) continue;
      (buys[`${m.creator_id}|${Math.round(Number(m.price) * 100)}`] ||= []).push(m);
    }
    if (!data || data.length < 1000) break;
  }

  const found = {};                         // username → Set(fan ids)
  for (const s of sales) {
    if (!s.fan_id || !s.created_at) continue;
    const t = Date.parse(s.created_at);
    const cands = (buys[`${s.creator_id}|${Math.round(Number(s.amount) * 100)}`] || []).filter(m => {
      const d = Date.parse(m.sent_datetime) - t;
      return d >= -48 * 3600e3 && d <= 3 * 3600e3 && norm(m.sent_to_nickname) === norm(s.fan_name);
    });
    const users = [...new Set(cands.map(m => m.sent_to_username))];
    if (users.length !== 1) continue;
    const u = users[0];
    const own = /^u(\d+)$/.exec(u)?.[1];
    if (own) continue;                      // default username: the number already is the ID
    (found[u] ||= new Set()).add(String(s.fan_id));
  }

  const { data: existing } = await supabaseAdmin.from('fan_infloww_ids').select('username, source').eq('organisation_id', orgId);
  const pasted = new Set((existing || []).filter(r => r.source === 'chat_link').map(r => r.username));
  const rows = Object.entries(found)
    .filter(([u, ids]) => ids.size === 1 && !pasted.has(u))            // one clear answer, never over a paste
    .map(([u, ids]) => ({ organisation_id: orgId, username: u, of_user_id: [...ids][0], source: 'sales', created_at: new Date().toISOString() }));
  return upsertChunks('fan_infloww_ids', rows, 'organisation_id,username');
}

/** One full sync over the last `days` days. Only one runs at a time. */
async function runInflowwSync({ days = 3 } = {}) {
  if (!infloww.configured()) return { skipped: 'not configured' };
  if (running) return { skipped: 'already running', since: running };
  running = new Date().toISOString();
  const summary = { days, started_at: running };
  try {
    const apiPages = await infloww.getAll('/v1/creators');
    const { orgId, pageMap } = await resolvePages(apiPages);
    summary.pages = Object.keys(pageMap).length;
    const to = new Date();
    const from = new Date(to.getTime() - Math.min(Math.max(days, 1), 365) * 86400000);
    await step(orgId, 'employees', () => syncEmployees(orgId), summary);
    await step(orgId, 'sales', () => syncSales(orgId, pageMap, from, to), summary);
    await step(orgId, 'refunds', () => syncRefunds(orgId, pageMap, from, to), summary);
    await step(orgId, 'fan_ids', () => learnFanIds(orgId, from, to), summary);
    await step(orgId, 'page_stats', () => syncPageStats(orgId, pageMap, platformMap(apiPages, pageMap), from, to,
      { onlyMissing: days > 7 }), summary);
    // the recent days are always refreshed, even during a backfill
    if (days > 7) await step(orgId, 'page_stats', () => syncPageStats(orgId, pageMap, platformMap(apiPages, pageMap),
      new Date(to.getTime() - 3 * 86400000), to), summary);
    // Real spend per fan: a full pass over the year of sales, so not every hour.
    const { data: sp } = await supabaseAdmin.from('infloww_sync_state').select('last_ok_at')
      .eq('organisation_id', orgId).eq('resource', 'spend').maybeSingle();
    if (days > 3 || !sp?.last_ok_at || Date.now() - Date.parse(sp.last_ok_at) > 6 * 3600e3) {
      await step(orgId, 'spend', () => applyInflowwSpend(orgId), summary);
    }
    summary.finished_at = new Date().toISOString();
    console.log('[InflowwSync]', JSON.stringify(summary));
    lastResult = summary;
    return summary;
  } catch (e) {
    // e.g. the server's address not allowed, or a missing key: this fails before
    // we know the organisation, so it's kept here for the Settings tab to show
    console.error('[InflowwSync] failed:', e.message);
    lastResult = { ...summary, error: e.message, finished_at: new Date().toISOString() };
    return lastResult;
  } finally {
    running = null;
  }
}

const inflowwSyncRunning = () => running;
const inflowwLastResult = () => lastResult;

module.exports = { runInflowwSync, inflowwSyncRunning, inflowwLastResult };
