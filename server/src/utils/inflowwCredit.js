const { supabaseAdmin } = require('./supabase');
const { toStoreTime } = require('../integrations/infloww');

/**
 * Sales credited to each chatter by Infloww (its own attribution: message
 * sender, last chatter, on shift, or manually reassigned), per Amsterdam day.
 * "credited" is Infloww's attributed amount (after the platform fee), which is
 * what Infloww's own employee reports show. Unlike our chat-based sales (PPVs
 * bought in the exported chats), it includes tips and any sale Infloww credits.
 * Returns { [chatterId]: { total, count, byDay, byPage, byRule, byType } }.
 */
const amsDate = (d) => toStoreTime(d).toISOString().slice(0, 10);
const TYPE = { Messages: 'ppv', Tips: 'tips', Subscription: 'subs', RecurringSubscription: 'subs' };
const add = (o, k, v) => { o[k] = Math.round(((o[k] || 0) + v) * 100) / 100; };

async function creditByChatter(orgId, fromDate, toDate, { chatterId = null } = {}) {
  let eq = supabaseAdmin.from('infloww_employees').select('employee_id, chatter_id')
    .eq('organisation_id', orgId).not('chatter_id', 'is', null);
  if (chatterId) eq = eq.eq('chatter_id', chatterId);
  const { data: emps, error } = await eq;
  if (error || !emps?.length) return {};
  const chatterOf = Object.fromEntries(emps.map(e => [e.employee_id, e.chatter_id]));

  const from = new Date(Date.parse(fromDate + 'T00:00:00Z') - 86400000).toISOString();
  const to = new Date(Date.parse(toDate + 'T00:00:00Z') + 2 * 86400000).toISOString();
  const rows = [];
  const ids = Object.keys(chatterOf);
  for (let i = 0; i < ids.length; i += 100) {
    for (let off = 0; ; off += 1000) {
      const { data, error: e } = await supabaseAdmin.from('infloww_sales')
        .select('employee_id, creator_id, created_at, type, sales_amount, sales_rule, status')
        .eq('organisation_id', orgId).in('employee_id', ids.slice(i, i + 100))
        .gte('created_at', from).lt('created_at', to).order('id').range(off, off + 999);
      if (e) throw new Error(e.message);
      rows.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
  }

  const out = {};
  for (const s of rows) {
    if (s.status === 'undo') continue;                  // refunded: no longer credit
    const date = amsDate(s.created_at);
    if (date < fromDate || date > toDate) continue;
    const c = chatterOf[s.employee_id];
    const amt = Number(s.sales_amount) || 0;
    if (!c || !amt) continue;
    const o = (out[c] ||= { total: 0, count: 0, byDay: {}, byPage: {}, byRule: {}, byType: {} });
    add(o, 'total', amt);
    o.count++;
    const day = (o.byDay[date] ||= { credited: 0, ppv: 0, tips: 0, subs: 0, other: 0 });
    add(day, 'credited', amt);
    add(day, TYPE[s.type] || 'other', amt);
    if (s.creator_id) add(o.byPage, s.creator_id, amt);
    add(o.byRule, s.sales_rule || 'Unassigned', amt);
    add(o.byType, TYPE[s.type] || 'other', amt);
  }
  return out;
}

module.exports = { creditByChatter };
