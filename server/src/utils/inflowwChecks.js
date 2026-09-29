const { supabaseAdmin } = require('./supabase');
const { toStoreTime } = require('../integrations/infloww');

/**
 * What we do with the Infloww API data (synced by inflowwSync.js):
 *  - applyInflowwSpend: each fan's real spend (PPV + tips + subscriptions +
 *    posts, last 12 months) into subscribers, so WHALE / SPENDER tags and the
 *    spend shown on tasks come from Infloww, not only from PPVs in our exports
 *  - fanChargebacks: one flag per refund, with the fan and the chatter credited
 *    with the original sale
 *  - newSubsUnmessaged: new paid subscribers who got no message in their first
 *    12 hours, one flag per page per day
 * All read our own tables only; nothing here calls Infloww.
 */
const DAY_MS = 86400000;
const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
// The manager's day (Amsterdam date) of a real UTC time.
const amsDate = (d) => toStoreTime(d).toISOString().slice(0, 10);
const fmtMoney = (n) => `$${Math.round(Number(n) * 100) / 100}`;

async function pageAll(build) {
  const out = [];
  for (let off = 0; ; off += 1000) {
    const { data, error } = await build().range(off, off + 999);
    if (error) throw new Error(error.message);
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

// OnlyFans id → the usernames we know the fan by (the default "u<id>", and a
// renamed username learned from sales or a pasted chat link).
async function usernamesById(orgId) {
  const rows = await pageAll(() => supabaseAdmin.from('fan_infloww_ids').select('username, of_user_id')
    .eq('organisation_id', orgId).order('username'));
  const map = {};
  for (const r of rows) (map[r.of_user_id] ||= []).push(r.username);
  return (fid) => [...new Set([`u${fid}`, ...(map[fid] || [])])];
}

// Same thresholds as rebuildSubscriberSpend (parsers/messageDashboard.js).
const classify = (total) => (total >= 1000 ? 'whale' : total >= 100 ? 'ps' : total > 0 ? 'regular' : 'unclassified');

/**
 * Real spend per fan from Infloww sales (refunded ones left out) into
 * subscribers: updates fans we already have, adds fans who spent $100+. Runs after each sync and after a chat export rebuilds the
 * PPV-only numbers, so for fans Infloww knows its total always has the last word.
 */
async function applyInflowwSpend(orgId) {
  const sales = await pageAll(() => supabaseAdmin.from('infloww_sales')
    .select('fan_id, fan_name, created_at, amount, status')
    .eq('organisation_id', orgId).in('status', ['done', 'loading']).order('id'));
  if (!sales.length) return 0;
  const byFan = {};
  for (const s of sales) {
    if (!s.fan_id || !(Number(s.amount) > 0)) continue;
    const f = (byFan[s.fan_id] ||= { total: 0, first: s.created_at, last: s.created_at, name: s.fan_name });
    f.total += Number(s.amount);
    if (s.created_at < f.first) f.first = s.created_at;
    if (s.created_at > f.last) { f.last = s.created_at; f.name = s.fan_name || f.name; }
  }
  const namesFor = await usernamesById(orgId);

  // Keep the earliest first_seen we already had (chat history can go back further).
  const existing = {};
  for (const r of await pageAll(() => supabaseAdmin.from('subscribers').select('username, first_seen')
    .eq('organisation_id', orgId).order('username'))) existing[r.username] = r.first_seen;

  const rows = [];
  for (const [fid, f] of Object.entries(byFan)) {
    const total = Math.round(f.total * 100) / 100;
    const first = amsDate(f.first), last = amsDate(f.last);
    for (const username of namesFor(fid)) {
      // New records only for fans whose tag it changes ($100+ = SPENDER or more):
      // the demo-mode privacy filter loads every fan record, so no 30k small payers.
      if (!(username in existing) && total < 100) continue;
      const prevFirst = existing[username];
      rows.push({
        organisation_id: orgId, username, display_name: f.name || null,
        total_spend: total, classification: classify(total),
        first_seen: prevFirst && prevFirst < first ? prevFirst : first,
        last_spend_date: last, last_seen: last,
      });
    }
  }
  let n = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabaseAdmin.from('subscribers').upsert(rows.slice(i, i + 500), { onConflict: 'username,organisation_id' });
    if (error) throw new Error(`subscribers: ${error.message}`);
    n += Math.min(500, rows.length - i);
  }
  return n;
}

// Refund types → words for the task.
const REFUND_WHAT = { chat_messages: 'a PPV', subscribes: 'a subscription', tips: 'a tip', post: 'a post', stream: 'a stream' };

/**
 * One flag per refund on `reportDate` (Amsterdam day of the refund): the fan,
 * what was refunded, and who sold it. Refunds and sales carry different
 * transaction ids, so the sale is the same fan's sale at the moment the refunded
 * payment was made (verified: 114/120 recent refunds line up to the minute).
 */
async function fanChargebacks(orgId, reportDate, { creators = {}, chatters = {} } = {}) {
  const from = new Date(Date.parse(reportDate + 'T00:00:00Z') - DAY_MS).toISOString();
  const to = new Date(Date.parse(reportDate + 'T00:00:00Z') + 2 * DAY_MS).toISOString();
  const refunds = (await pageAll(() => supabaseAdmin.from('infloww_refunds')
    .select('id, creator_id, fan_id, payment_time, refund_time, status, amount, type')
    .eq('organisation_id', orgId).gte('refund_time', from).lt('refund_time', to).order('id')))
    .filter(r => r.refund_time && amsDate(r.refund_time) === reportDate);
  if (!refunds.length) return [];

  const namesFor = await usernamesById(orgId);
  const emps = await pageAll(() => supabaseAdmin.from('infloww_employees').select('employee_id, name, chatter_id')
    .eq('organisation_id', orgId).order('employee_id'));
  const empById = Object.fromEntries(emps.map(e => [e.employee_id, e]));

  const flags = [];
  for (const r of refunds) {
    let sale = null;
    if (r.payment_time && r.fan_id) {
      const t = Date.parse(r.payment_time);
      const { data } = await supabaseAdmin.from('infloww_sales')
        .select('id, amount, created_at, employee_id, sales_rule, type')
        .eq('organisation_id', orgId).eq('fan_id', r.fan_id)
        .gte('created_at', new Date(t - 10 * 60e3).toISOString()).lte('created_at', new Date(t + 10 * 60e3).toISOString());
      const cands = (data || []).sort((a, b) =>
        (Math.abs(Number(a.amount) - Number(r.amount)) < 0.01 ? 0 : 1) - (Math.abs(Number(b.amount) - Number(r.amount)) < 0.01 ? 0 : 1)
        || Math.abs(Date.parse(a.created_at) - t) - Math.abs(Date.parse(b.created_at) - t));
      sale = cands[0] || null;
    }
    const emp = sale?.employee_id ? empById[sale.employee_id] : null;
    const chatterId = emp?.chatter_id || null;
    const seller = emp ? (chatters[chatterId] || emp.name) : null;
    const usernames = namesFor(r.fan_id);
    const fan = usernames.find(u => !/^u\d+$/.test(u)) || usernames[0];
    const what = REFUND_WHAT[r.type] || 'a purchase';
    const bought = r.payment_time ? amsDate(r.payment_time) : null;
    const evidence = `Chargeback ${fmtMoney(r.amount)}: ${what}${bought ? ` bought ${bought}` : ''}`
      + (seller ? `, sold by ${seller}${sale?.sales_rule ? ` (${sale.sales_rule.toLowerCase()})` : ''}` : ', seller unknown')
      + ` — open the chat and find out what happened (buyer's remorse vs. our mistake)`;
    flags.push({
      scope: chatterId ? 'chatter' : 'page', creator_id: r.creator_id, chatter_id: chatterId, report_date: reportDate,
      flag_type: 'fan_chargeback', severity: 'high', evidence, organisation_id: orgId, status: 'open', score: 0,
      details: {
        key: r.id, amount: Number(r.amount), refund_status: r.status, type: r.type, seller: seller || null,
        hits: [{ fan_username: fan, sent_at: r.payment_time ? toStoreTime(r.payment_time).toISOString() : null, matched: `chargeback ${fmtMoney(r.amount)}`,
          message: `${what}${bought ? ` bought ${bought}` : ''}${creators[r.creator_id] ? ` on ${creators[r.creator_id]}` : ''}` }],
      },
    });
  }
  return flags;
}

/**
 * New paid subscribers on `reportDate` who got no message from a chatter in
 * their first 12 hours — the "new subs first" rule. One flag per page. A sub
 * whose 12 hours aren't covered by our chat exports yet is left for later.
 * Welcome automations may not appear in the exports, so the flag says so.
 */
const FIRST_HOURS = 12;
async function newSubsUnmessaged(orgId, reportDate, { creators = {} } = {}) {
  const from = new Date(Date.parse(reportDate + 'T00:00:00Z') - DAY_MS).toISOString();
  const to = new Date(Date.parse(reportDate + 'T00:00:00Z') + 2 * DAY_MS).toISOString();
  const subs = (await pageAll(() => supabaseAdmin.from('infloww_sales')
    .select('fan_id, fan_name, creator_id, created_at, amount')
    .eq('organisation_id', orgId).eq('type', 'Subscription').gte('created_at', from).lt('created_at', to).order('id')))
    .filter(s => s.created_at && s.creator_id && amsDate(s.created_at) === reportDate);
  if (!subs.length) return [];
  const namesFor = await usernamesById(orgId);

  // How far each page's chat export reaches (store-frame time of its latest message).
  const lastMsg = {};
  const missed = {};                                    // creator_id → [hits]
  for (const s of subs) {
    const t = toStoreTime(s.created_at);
    const end = new Date(t.getTime() + FIRST_HOURS * 3600e3);
    if (!(s.creator_id in lastMsg)) {
      const { data } = await supabaseAdmin.from('messages').select('sent_datetime').eq('organisation_id', orgId)
        .eq('creator_id', s.creator_id).order('sent_datetime', { ascending: false }).limit(1);
      lastMsg[s.creator_id] = data?.[0] ? Date.parse(data[0].sent_datetime) : 0;
    }
    if (lastMsg[s.creator_id] < end.getTime()) continue;           // not judgeable yet
    const win = (q) => q.eq('organisation_id', orgId).eq('creator_id', s.creator_id)
      .gte('sent_datetime', new Date(t.getTime() - 10 * 60e3).toISOString()).lte('sent_datetime', end.toISOString())
      .not('creator_message_text', 'is', null).limit(1);
    const users = namesFor(s.fan_id);
    const { data: byUser } = await win(supabaseAdmin.from('messages').select('id').in('sent_to_username', users));
    if (byUser?.length) continue;
    if (s.fan_name) {
      const { data: byName } = await win(supabaseAdmin.from('messages').select('id').ilike('sent_to_nickname', s.fan_name.replace(/[%_\\]/g, '\\$&')));
      if (byName?.length) continue;                                 // renamed fan, found by name
    }
    (missed[s.creator_id] ||= []).push({
      fan_username: users.find(u => !/^u\d+$/.test(u)) || users[0],
      fan_nickname: s.fan_name || null,
      sent_at: t.toISOString(),
      matched: `${fmtMoney(s.amount)} sub, no message in ${FIRST_HOURS}h`,
      message: null,
    });
  }
  return Object.entries(missed).map(([creatorId, hits]) => ({
    scope: 'page', creator_id: creatorId, chatter_id: null, report_date: reportDate,
    flag_type: 'new_sub_unmessaged', severity: 'high', organisation_id: orgId, status: 'open', score: 0,
    evidence: `${hits.length} new paid sub${hits.length === 1 ? '' : 's'}${creators[creatorId] ? ` on ${creators[creatorId]}` : ''} got no message from a chatter in their first ${FIRST_HOURS} hours`
      + ' (a welcome automation may not show in the chat export — check the chat)',
    details: { hits: hits.slice(0, 25), total: hits.length },
  }));
}

module.exports = { applyInflowwSpend, fanChargebacks, newSubsUnmessaged };
