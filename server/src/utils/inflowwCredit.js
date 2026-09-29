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

/**
 * Make Infloww's credit THE sales figure: for every linked chatter's metric row
 * (chatter, page, day) in `dates`, sales_today becomes what Infloww credits them
 * with there that day (0 if nothing). The dashboard, sparklines, chatter profile
 * and sales alerts all read sales_today. Chatters Infloww can't link keep the
 * chat-export number (PPVs bought in their chats).
 */
async function applyCreditToMetrics(orgId, dates) {
  if (!dates?.length) return 0;
  const { data: emps } = await supabaseAdmin.from('infloww_employees').select('employee_id, chatter_id')
    .eq('organisation_id', orgId).not('chatter_id', 'is', null);
  if (!emps?.length) return 0;
  const chatterOf = Object.fromEntries(emps.map(e => [e.employee_id, e.chatter_id]));
  const linked = [...new Set(emps.map(e => e.chatter_id))];
  const sorted = [...dates].sort();
  const fromDate = sorted[0], toDate = sorted[sorted.length - 1], wanted = new Set(sorted);

  const credit = {};                                   // chatter|page|date -> credited
  const from = new Date(Date.parse(fromDate + 'T00:00:00Z') - 86400000).toISOString();
  const to = new Date(Date.parse(toDate + 'T00:00:00Z') + 2 * 86400000).toISOString();
  const ids = Object.keys(chatterOf);
  for (let i = 0; i < ids.length; i += 100) {
    for (let off = 0; ; off += 1000) {
      const { data, error } = await supabaseAdmin.from('infloww_sales')
        .select('employee_id, creator_id, created_at, sales_amount, status')
        .eq('organisation_id', orgId).in('employee_id', ids.slice(i, i + 100))
        .gte('created_at', from).lt('created_at', to).order('id').range(off, off + 999);
      if (error) throw new Error(error.message);
      for (const s of (data || [])) {
        if (s.status === 'undo' || !s.creator_id) continue;
        const date = amsDate(s.created_at);
        if (!wanted.has(date)) continue;
        const k = `${chatterOf[s.employee_id]}|${s.creator_id}|${date}`;
        credit[k] = Math.round(((credit[k] || 0) + (Number(s.sales_amount) || 0)) * 100) / 100;
      }
      if (!data || data.length < 1000) break;
    }
  }

  const rows = [];
  for (let i = 0; i < linked.length; i += 100) {
    for (let off = 0; ; off += 1000) {
      const { data, error } = await supabaseAdmin.from('chatter_daily_metrics')
        .select('chatter_id, creator_id, report_date, organisation_id, sales_today')
        .in('chatter_id', linked.slice(i, i + 100)).gte('report_date', fromDate).lte('report_date', toDate)
        .order('id').range(off, off + 999);
      if (error) throw new Error(error.message);
      rows.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
  }
  const changed = [];
  for (const r of rows) {
    if (!wanted.has(r.report_date)) continue;
    const v = credit[`${r.chatter_id}|${r.creator_id}|${r.report_date}`] || 0;
    if (v !== Number(r.sales_today)) changed.push({ ...r, sales_today: v });
  }
  for (let i = 0; i < changed.length; i += 500) {
    const { error } = await supabaseAdmin.from('chatter_daily_metrics')
      .upsert(changed.slice(i, i + 500), { onConflict: 'chatter_id,creator_id,report_date' });
    if (error) throw new Error(`chatter_daily_metrics: ${error.message}`);
  }
  return changed.length;
}

module.exports = { creditByChatter, applyCreditToMetrics };
