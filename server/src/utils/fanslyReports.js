/**
 * Creator reports for Fansly (like Infloww's): earnings by type for any Amsterdam days, the same
 * number of days just before for the change, per page, per hour, top fans, new and ended
 * subscribers. Counted sale by sale from fansly_transactions (the wallet history the extension
 * reads), so any date range works.
 */
const { supabaseAdmin } = require('./supabase');
const Stats = require('./fanslyStats');

const TZ = 'Europe/Amsterdam';
const TYPES = ['subscriptions', 'messages', 'tips', 'media', 'other'];
const hourOf = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' });
// sums in tenths of a cent, cut to the cent the way Fansly shows them
const cents = (n) => Math.trunc(Math.round(n * 1000) / 10) / 100;

/** Which report line a sale belongs to. Fansly does not say whether media was bought in a chat or on a post:
 *  "messages" is media bought from a chat message we recorded, "media" everything else (posts, and chats never opened). */
function typeOf(t) {
  if (t.category === 'refund') return 'refund';
  if (t.category === 'subscription') return 'subscriptions';
  if (t.category === 'chat_ppv') return 'messages';
  if (t.category === 'chat_tip') return 'tips';
  if (t.category === 'wall') return 'media';
  return 'other';
}
const isMass = (t) => t.category === 'chat_ppv' && ['sender_of_mass_message', 'mass_message_not_credited'].includes(t.credited_rule);

async function all(q) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await q().range(from, from + 999);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < 1000) return out;
  }
}

const empty = () => ({ subscriptions: 0, messages: 0, messages_chat: 0, messages_mass: 0, tips: 0, media: 0, other: 0, refunds: 0, total: 0, sales: 0 });
function add(b, t, amount) {
  const k = typeOf(t);
  if (k === 'refund') { b.refunds += amount; b.total -= amount; return; }
  b[k] += amount; b.total += amount; b.sales += 1;
  if (k === 'messages') b[isMass(t) ? 'messages_mass' : 'messages_chat'] += amount;
}
const round = (b) => Object.fromEntries(Object.entries(b).map(([k, v]) => [k, k === 'sales' ? v : cents(v)]));

const median = (xs) => { if (!xs.length) return null; const v = [...xs].sort((x, y) => x - y); const m = v.length >> 1; return Math.round(v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2); };

/**
 * The chatting numbers the OnlyFans dashboard has, counted from the chats the extension recorded
 * between start and end: per chatter (null = sent without a chatter signed in) and for the whole team.
 *   golden ratio  PPVs sent ÷ chat messages sent        unlock rate  PPVs bought ÷ PPVs sent
 *   reply time    from the fan's first waiting message to our next chat message (typical = median)
 * Mass messages are left out of all of them (counted on their own).
 */
function chatting(msgs, tx, start, end) {
  const s = start.toISOString(), e = end.toISOString();
  const per = new Map();
  const row = (id) => {
    const k = id || 'none';
    if (!per.has(k)) per.set(k, { chatter_id: id || null, messages: 0, mass: 0, ppv_sent: 0, ppv_bought: 0, ppv_sales: 0, fans: new Set(), buyers: new Set(), replies: [], sales: 0 });
    return per.get(k);
  };
  const waiting = new Map();
  for (const m of msgs) {
    const g = m.group_id || m.fan_account_id;
    if (m.from_fan) { if (!waiting.has(g)) waiting.set(g, m.sent_at); continue; }
    const since = m.type === 2 ? null : waiting.get(g);
    if (m.type !== 2) waiting.delete(g);
    if (m.sent_at < s || m.sent_at >= e) continue;
    const r = row(m.chatter_id);
    if (m.type === 2) { r.mass += 1; continue; }
    r.messages += 1;
    if (m.fan_account_id) r.fans.add(m.fan_account_id);
    if (Number(m.price) > 0) { r.ppv_sent += 1; if (m.sold_at) { r.ppv_bought += 1; r.ppv_sales += Number(m.sold_net) || 0; r.buyers.add(m.fan_account_id); } }
    if (since) { const w = (Date.parse(m.sent_at) - Date.parse(since)) / 1000; if (w >= 0 && w <= 3 * 86400) r.replies.push(w); }
  }
  // money each chatter was credited with (PPVs and tips; a tip shared on shift in equal parts)
  for (const t of tx) {
    if (t.created_at_fansly < s || t.created_at_fansly >= e || !['chat_ppv', 'chat_tip', 'refund'].includes(t.category)) continue;
    const ids = Array.isArray(t.credited_chatter_ids) && t.credited_chatter_ids.length ? t.credited_chatter_ids : t.credited_chatter_id ? [t.credited_chatter_id] : [];
    const amount = Math.abs(Number(t.net) || 0) * (t.category === 'refund' ? -1 : 1);
    for (const id of ids) row(id).sales += amount / ids.length;
  }
  const finish = (r) => ({
    chatter_id: r.chatter_id, messages: r.messages, mass: r.mass, ppv_sent: r.ppv_sent, ppv_bought: r.ppv_bought,
    fans: r.fans.size, buyers: r.buyers.size, sales: cents(r.sales), ppv_sales: cents(r.ppv_sales),
    unlock_rate: r.ppv_sent ? Math.round((r.ppv_bought / r.ppv_sent) * 1000) / 10 : null,
    golden_ratio: r.messages ? Math.round((r.ppv_sent / r.messages) * 10000) / 100 : null,
    reply_s: median(r.replies), replies: r.replies.length,
  });
  const team = { chatter_id: 'team', messages: 0, mass: 0, ppv_sent: 0, ppv_bought: 0, ppv_sales: 0, fans: new Set(), buyers: new Set(), replies: [], sales: 0 };
  for (const r of per.values()) {
    for (const k of ['messages', 'mass', 'ppv_sent', 'ppv_bought', 'ppv_sales', 'sales']) team[k] += r[k];
    r.fans.forEach(f => team.fans.add(f)); r.buyers.forEach(f => team.buyers.add(f)); team.replies.push(...r.replies);
  }
  return { team: finish(team), chatters: [...per.values()].map(finish).filter(c => c.messages || c.mass || c.sales) };
}

/**
 * report(orgId, { from, to, accounts, gross }) — from/to are Amsterdam days (to included);
 * accounts: fansly_accounts ids (empty = every page); gross: before Fansly's 20% cut.
 */
async function report(orgId, { from, to, accounts, gross }) {
  const { data: accs, error } = await supabaseAdmin.from('fansly_accounts').select('id, username, creators(name)').eq('organisation_id', orgId).order('first_seen_at');
  if (error) throw error;
  const pages = (accs || []).filter(a => !accounts.length || accounts.includes(a.id));
  const ids = pages.map(a => a.id);
  const days = Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000) + 1;
  const prevFrom = Stats.addDays(from, -days), prevTo = Stats.addDays(from, -1);
  const start = Stats.dayStartUtc(from), end = Stats.dayStartUtc(Stats.addDays(to, 1)), prevStart = Stats.dayStartUtc(prevFrom);
  const out = { from, to, prev_from: prevFrom, prev_to: prevTo, gross: !!gross, pages: [], totals: round(empty()), prev_totals: round(empty()), by_hour: [], chatting: null, chatters: [], metrics: null, ledger: [] };
  if (!ids.length) return out;

  const tx = await all(() => supabaseAdmin.from('fansly_transactions').select('account_id, transaction_id, category, credited_rule, fan_account_id, gross, net, created_at_fansly')
    .in('account_id', ids).gte('created_at_fansly', prevStart.toISOString()).lt('created_at_fansly', end.toISOString()).order('transaction_id'));
  const amountOf = (t) => Math.abs(Number(gross ? (t.gross ?? (t.net != null ? t.net / 0.8 : 0)) : t.net) || 0);

  const tot = empty(), prev = empty(), perPage = new Map(ids.map(id => [id, { now: empty(), prev: empty() }]));
  const hours = new Map(), fans = new Set();
  for (const t of tx) {
    const at = new Date(t.created_at_fansly), a = amountOf(t), p = perPage.get(t.account_id);
    if (at < start) { add(prev, t, a); add(p.prev, t, a); continue; }
    add(tot, t, a); add(p.now, t, a);
    // the chart: one point per Amsterdam hour and type
    const day = Stats.amsDay(at), hour = Number(hourOf.format(at)), k = typeOf(t);
    const key = `${day}|${hour}`;
    const h = hours.get(key) || { day, hour, ...Object.fromEntries([...TYPES, 'refunds'].map(x => [x, 0])) };
    h[k === 'refund' ? 'refunds' : k] += a;
    hours.set(key, h);
    if (t.fan_account_id && k !== 'refund') fans.add(`${t.account_id}|${t.fan_account_id}`);
  }
  out.totals = round(tot); out.prev_totals = round(prev);
  out.paying_fans = fans.size;
  out.by_hour = [...hours.values()].map(h => Object.fromEntries(Object.entries(h).map(([k, v]) => [k, typeof v === 'number' && k !== 'hour' ? cents(v) : v])))
    .sort((x, y) => (x.day + String(x.hour).padStart(2, '0')).localeCompare(y.day + String(y.hour).padStart(2, '0')));

  // per page: who is subscribed now
  const subs = await all(() => supabaseAdmin.from('fansly_subscriptions').select('account_id, status').in('account_id', ids).in('status', [3, 4]));
  const totalAll = tot.total;
  out.pages = pages.map(a => {
    const p = perPage.get(a.id);
    return {
      account_id: a.id, page: a.creators?.name || a.username, username: a.username,
      ...round(p.now), prev: round(p.prev),
      share: totalAll > 0 ? Math.round((p.now.total / totalAll) * 10000) / 100 : null,
      active_subscribers: subs.filter(s => s.account_id === a.id).length,
    };
  });

  // the chatting numbers, now and the days before, for the whole selection and per page
  const msgs = await all(() => supabaseAdmin.from('fansly_messages').select('account_id, message_id, group_id, fan_account_id, from_fan, type, price, chatter_id, sent_at, sold_at, sold_net')
    .in('account_id', ids).gte('sent_at', new Date(prevStart.getTime() - 86400000).toISOString()).lt('sent_at', end.toISOString()).order('sent_at').order('message_id'));
  const cTx = await all(() => supabaseAdmin.from('fansly_transactions').select('account_id, category, net, credited_chatter_id, credited_chatter_ids, created_at_fansly')
    .in('account_id', ids).in('category', ['chat_ppv', 'chat_tip', 'refund']).gte('created_at_fansly', prevStart.toISOString()).lt('created_at_fansly', end.toISOString()).order('transaction_id'));
  const now = chatting(msgs, cTx, start, end), before = chatting(msgs, cTx, prevStart, start);
  const chIds = [...new Set(now.chatters.map(c => c.chatter_id).filter(Boolean))];
  const { data: chs } = chIds.length ? await supabaseAdmin.from('chatters').select('id, name').in('id', chIds) : { data: [] };
  const chName = new Map((chs || []).map(c => [c.id, c.name]));
  const prevBy = new Map(before.chatters.map(c => [c.chatter_id || 'none', c]));
  out.chatting = { ...now.team, prev: before.team };
  out.chatters = now.chatters.map(c => ({ ...c, name: c.chatter_id ? chName.get(c.chatter_id) || 'Unknown chatter' : 'No chatter signed in', prev: prevBy.get(c.chatter_id || 'none') || null }))
    .sort((x, y) => (y.chatter_id ? 1 : 0) - (x.chatter_id ? 1 : 0) || y.sales - x.sales || y.messages - x.messages);
  // page numbers like the OnlyFans dashboard: ratio = (messages + tips) ÷ subscriptions (target 5), LTV = earnings ÷ subscriptions bought (new and renewals)
  const subsBought = (from_, to_, acc) => tx.filter(t => t.category === 'subscription' && (!acc || t.account_id === acc) && new Date(t.created_at_fansly) >= from_ && new Date(t.created_at_fansly) < to_).length;
  const pageMetrics = (b, n) => ({
    ratio: b.subscriptions > 0 ? Math.round(((b.messages + b.tips) / b.subscriptions) * 100) / 100 : null,
    ltv: n > 0 ? cents(b.total / n) : null, subscriptions_bought: n, per_day: cents(b.total / days),
  });
  out.metrics = { ...pageMetrics(tot, subsBought(start, end)), prev: pageMetrics(prev, subsBought(prevStart, start)) };
  for (const p of out.pages) {
    const pm = perPage.get(p.account_id);
    Object.assign(p, pageMetrics(pm.now, subsBought(start, end, p.account_id)));
    p.prev = { ...p.prev, ...pageMetrics(pm.prev, subsBought(prevStart, start, p.account_id)) };
    const c = chatting(msgs.filter(m => m.account_id === p.account_id), cTx.filter(t => t.account_id === p.account_id), start, end).team;
    Object.assign(p, { messages_sent: c.messages, ppv_sent: c.ppv_sent, ppv_bought: c.ppv_bought, golden_ratio: c.golden_ratio, unlock_rate: c.unlock_rate, reply_s: c.reply_s, fans_chatted: c.fans });
  }
  const pageName = new Map(out.pages.map(p => [p.account_id, p.page]));

  // how complete the sales list is, per page (from the wallet history reads)
  const { data: led } = await supabaseAdmin.from('fansly_accounts').select('id, ledger_total, ledger_total_at').in('id', ids);
  const counts = await Promise.all(ids.map(id => supabaseAdmin.from('fansly_transactions').select('transaction_id', { count: 'exact', head: true }).eq('account_id', id).eq('source', 'ledger')));
  out.ledger = (led || []).map(l => ({ account_id: l.id, page: pageName.get(l.id), read: counts[ids.indexOf(l.id)]?.count ?? 0, total: l.ledger_total, read_at: l.ledger_total_at }));
  return out;
}

module.exports = { report, typeOf };
