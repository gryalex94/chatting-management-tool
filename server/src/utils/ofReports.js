/**
 * Creator reports for OnlyFans, the same page as Fansly's (utils/fanslyReports.js), from the Infloww data:
 *  - earnings: every sale synced from Infloww (infloww_sales), by Amsterdam day and hour. A sale
 *    Infloww marks "undo" was refunded: it is left out of the earnings and shown as Refunded, which
 *    is how Infloww's own Creator reports count it.
 *  - subscriptions bought and active fans: Infloww's creator reports (creator_daily_stats)
 *  - chatting: the uploaded chat exports (messages), counted like the OnlyFans dashboard
 *  - credited sales per chatter: Infloww's own sales rules (the employee on each sale)
 * Each Infloww page is its own row, as in Infloww, even where pages are merged in this tool.
 */
const { supabaseAdmin } = require('./supabase');
const Stats = require('./fanslyStats');                 // Amsterdam days (amsDay, dayStartUtc, addDays)
const { dayWindow } = require('../ai/evalShared');      // the chat exports' own day clock

const cents = (n) => Math.round(n * 100) / 100;
const TYPE = { Subscription: 'subscriptions', RecurringSubscription: 'subscriptions', Messages: 'messages', Tips: 'tips', Posts: 'media' };
const typeOf = (t) => TYPE[t] || 'other';           // streams, referrals and anything new

async function all(q) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await q().range(from, from + 999);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < 1000) return out;
  }
}

const empty = () => ({ subscriptions: 0, messages: 0, tips: 0, media: 0, other: 0, refunds: 0, total: 0, sales: 0 });
const round = (b) => Object.fromEntries(Object.entries(b).map(([k, v]) => [k, k === 'sales' ? v : cents(v)]));

/** The OnlyFans pages to report on: every active page with an Infloww page id. */
async function ofPages(orgId) {
  const { data, error } = await supabaseAdmin.from('creators').select('id, name, infloww_creator_id').eq('organisation_id', orgId)
    .eq('platform', 'onlyfans').eq('is_active', true).not('infloww_creator_id', 'is', null).order('name');
  if (error) throw error;
  // pages with no sale in the last 90 days are left out of the list (old pages nobody works)
  const since = new Date(Date.now() - 90 * 86400000).toISOString();
  const live = await Promise.all((data || []).map(c => supabaseAdmin.from('infloww_sales').select('id', { count: 'exact', head: true })
    .eq('organisation_id', orgId).eq('creator_id', c.id).gte('created_at', since)));
  return (data || []).filter((c, i) => (live[i].count || 0) > 0).map(c => ({ id: c.id, page: c.name }));
}

/** The chatting numbers between two instants: per chatter (and page), and in all. */
async function chatting(orgId, ids, start, end, chatterOf) {
  const { data, error } = await supabaseAdmin.rpc('of_chatting', { p_org: orgId, p_creators: ids, p_start: start, p_end: end });
  if (error) throw error;
  const row = (r) => r && ({
    messages: Number(r.messages), ppv_sent: Number(r.ppv_sent), ppv_bought: Number(r.ppv_bought), ppv_sales: cents(Number(r.ppv_sales)),
    fans: Number(r.fans), buyers: Number(r.buyers), reply_s: r.reply_s, replies: Number(r.replies), mass: 0,
    unlock_rate: Number(r.ppv_sent) ? Math.round((Number(r.ppv_bought) / Number(r.ppv_sent)) * 1000) / 10 : null,
    golden_ratio: Number(r.messages) ? Math.round((Number(r.ppv_sent) / Number(r.messages)) * 10000) / 100 : null,
  });
  const rows = data || [];
  const team = row(rows.find(r => !r.by_sender && !r.by_creator)) || row({ messages: 0, ppv_sent: 0, ppv_bought: 0, ppv_sales: 0, fans: 0, buyers: 0, reply_s: null, replies: 0 });
  const byPage = new Map(rows.filter(r => !r.by_sender && r.by_creator).map(r => [r.creator_id, row(r)]));
  const bySender = rows.filter(r => r.by_sender && !r.by_creator).map(r => ({ sender: r.sender, chatter_id: chatterOf.get(r.sender) || null, ...row(r) }));
  return { team, byPage, bySender };
}

/** report(orgId, { from, to, accounts, gross }) — the same shape as fanslyReports.report. */
async function report(orgId, { from, to, accounts, gross }) {
  const pages = (await ofPages(orgId)).filter(p => !accounts.length || accounts.includes(p.id));
  const ids = pages.map(p => p.id);
  const days = Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000) + 1;
  const prevFrom = Stats.addDays(from, -days), prevTo = Stats.addDays(from, -1);
  const start = Stats.dayStartUtc(from), end = Stats.dayStartUtc(Stats.addDays(to, 1)), prevStart = Stats.dayStartUtc(prevFrom);
  const out = { platform: 'onlyfans', from, to, prev_from: prevFrom, prev_to: prevTo, gross: !!gross, pages: [], totals: round(empty()), prev_totals: round(empty()),
    by_hour: [], chatting: null, chatters: [], metrics: null, ledger: [], paying_fans: 0 };
  if (!ids.length) return out;

  // the sales, added up in the database: per page (now and before), per day and per hour of the day
  const rpcAll = async (fn, args) => {
    const out = [];
    for (let off = 0; ; off += 1000) {
      const { data, error } = await supabaseAdmin.rpc(fn, args).range(off, off + 999);
      if (error) throw error;
      out.push(...(data || []));
      if (!data || data.length < 1000) return out;
    }
  };
  const sums = await rpcAll('of_sales_summary', { p_org: orgId, p_creators: ids, p_prev_start: prevStart.toISOString(), p_start: start.toISOString(), p_end: end.toISOString() });
  const amountOf = (r) => Math.abs(Number(gross ? r.gross : r.net) || 0);
  const add = (b, r) => {
    const a = amountOf(r);
    if (r.undo) { b.refunds += a; return; }
    b[typeOf(r.type)] += a; b.total += a; b.sales += Number(r.sales) || 0;
  };
  const tot = empty(), prev = empty(), perPage = new Map(ids.map(id => [id, { now: empty(), prev: empty() }]));
  const byDay = new Map(), byHour = new Map();
  const slot = (m, k, base) => { if (!m.has(k)) m.set(k, { ...base, subscriptions: 0, messages: 0, tips: 0, media: 0, other: 0, refunds: 0 }); return m.get(k); };
  for (const r of sums) {
    if (r.kind === 'page') { const p = perPage.get(r.creator_id); if (!p) continue; add(r.is_now ? tot : prev, r); add(r.is_now ? p.now : p.prev, r); continue; }
    const h = r.kind === 'day' ? slot(byDay, r.day, { day: r.day, hour: null }) : slot(byHour, r.hour, { day: null, hour: r.hour });
    h[r.undo ? 'refunds' : typeOf(r.type)] += amountOf(r);
  }
  out.totals = round(tot); out.prev_totals = round(prev);
  // the chart: rows with a day (for days, weeks and months) and rows with an hour of the day
  out.by_hour = [...byDay.values(), ...byHour.values()].map(h => ({ ...h, ...Object.fromEntries(['subscriptions', 'messages', 'tips', 'media', 'other', 'refunds'].map(k => [k, cents(h[k])])) }));

  // paying fans, and the sales Infloww credits to each employee (now and before)
  const people = async (a, b) => {
    const { data, error } = await supabaseAdmin.rpc('of_sales_people', { p_org: orgId, p_creators: ids, p_start: a.toISOString(), p_end: b.toISOString() });
    if (error) throw error;
    const m = new Map();
    let fansN = 0;
    for (const r of data || []) if (r.kind === 'fans') fansN = Number(r.n); else m.set(r.key, Math.abs(Number(gross ? r.gross : r.net) || 0));
    return { fans: fansN, credited: m };
  };
  const [pNow, pPrev] = await Promise.all([people(start, end), people(prevStart, start)]);
  out.paying_fans = pNow.fans;
  const credited = pNow.credited, prevCredited = pPrev.credited;

  // Infloww's creator reports: subscriptions bought (new + renewals) and the active fans on the last day
  const stats = await all(() => supabaseAdmin.from('creator_daily_stats').select('creator_id, report_date, new_subscribers, subscriber_renewals, active_fans')
    .eq('organisation_id', orgId).in('creator_id', ids).gte('report_date', prevFrom).lte('report_date', to).order('report_date'));
  const subsBought = (f, t, id) => stats.filter(x => x.report_date >= f && x.report_date <= t && (!id || x.creator_id === id))
    .reduce((n, x) => n + (x.new_subscribers || 0) + (x.subscriber_renewals || 0), 0);
  const activeFans = (id) => { const last = stats.filter(x => x.creator_id === id && x.report_date <= to && x.active_fans != null).pop(); return last ? last.active_fans : null; };
  const pageMetrics = (b, n) => ({
    ratio: b.subscriptions > 0 ? Math.round(((b.messages + b.tips) / b.subscriptions) * 100) / 100 : null,
    ltv: n > 0 ? cents(b.total / n) : null, subscriptions_bought: n, per_day: cents(b.total / days),
  });
  out.metrics = { ...pageMetrics(tot, subsBought(from, to)), prev: pageMetrics(prev, subsBought(prevFrom, prevTo)) };

  // chatting, from the chat exports (their own day clock), now and the days before
  const { data: chs } = await supabaseAdmin.from('chatters').select('id, name').eq('organisation_id', orgId);
  const chatterOf = new Map((chs || []).map(c => [String(c.name || '').toLowerCase().trim(), c.id]));
  const chName = new Map((chs || []).map(c => [c.id, c.name]));
  const win = (f, t) => [dayWindow(f).start, dayWindow(t).end];
  const [nowC, prevC] = await Promise.all([chatting(orgId, ids, ...win(from, to), chatterOf), chatting(orgId, ids, ...win(prevFrom, prevTo), chatterOf)]);
  out.chatting = { chatter_id: 'team', ...nowC.team, sales: 0, prev: { ...prevC.team, sales: 0 } };

  // credited sales by Infloww's rules: the employee on each sale → our chatter
  const { data: emps } = await supabaseAdmin.from('infloww_employees').select('employee_id, chatter_id, name').eq('organisation_id', orgId);
  const salesOf = (m, chatterId) => (emps || []).filter(e => e.chatter_id === chatterId).reduce((n, e) => n + (m.get(e.employee_id) || 0), 0);
  const prevBy = new Map(prevC.bySender.map(c => [c.sender, c]));
  out.chatters = nowC.bySender.map(c => ({
    ...c, name: c.chatter_id ? chName.get(c.chatter_id) : c.sender, sales: c.chatter_id ? cents(salesOf(credited, c.chatter_id)) : 0,
    prev: prevBy.get(c.sender) ? { ...prevBy.get(c.sender), sales: c.chatter_id ? cents(salesOf(prevCredited, c.chatter_id)) : 0 } : null,
  })).sort((x, y) => y.sales - x.sales || y.messages - x.messages);
  out.chatting.sales = cents(out.chatters.reduce((n, c) => n + c.sales, 0));

  const totalAll = tot.total;
  out.pages = pages.map(p => {
    const pm = perPage.get(p.id), c = nowC.byPage.get(p.id);
    return {
      account_id: p.id, page: p.page, ...round(pm.now), prev: { ...round(pm.prev), ...pageMetrics(pm.prev, subsBought(prevFrom, prevTo, p.id)) },
      ...pageMetrics(pm.now, subsBought(from, to, p.id)),
      share: totalAll > 0 ? Math.round((pm.now.total / totalAll) * 10000) / 100 : null,
      active_subscribers: activeFans(p.id),
      messages_sent: c?.messages || 0, ppv_sent: c?.ppv_sent || 0, ppv_bought: c?.ppv_bought || 0,
      golden_ratio: c?.golden_ratio ?? null, unlock_rate: c?.unlock_rate ?? null, reply_s: c?.reply_s ?? null, fans_chatted: c?.fans || 0,
    };
  });
  // the chat exports reach this far (the days after are not uploaded yet)
  const { data: lastMsg } = await supabaseAdmin.from('messages').select('sent_datetime').eq('organisation_id', orgId).order('sent_datetime', { ascending: false }).limit(1);
  out.chats_until = lastMsg?.[0]?.sent_datetime || null;
  return out;
}

module.exports = { report, ofPages };
