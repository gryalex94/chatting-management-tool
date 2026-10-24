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
  const out = { from, to, prev_from: prevFrom, prev_to: prevTo, gross: !!gross, pages: [], totals: round(empty()), prev_totals: round(empty()), by_hour: [], top_fans: [], new_subscribers: [], ended_subscriptions: [], ledger: [] };
  if (!ids.length) return out;

  const tx = await all(() => supabaseAdmin.from('fansly_transactions').select('account_id, transaction_id, category, credited_rule, fan_account_id, gross, net, created_at_fansly')
    .in('account_id', ids).gte('created_at_fansly', prevStart.toISOString()).lt('created_at_fansly', end.toISOString()).order('transaction_id'));
  const amountOf = (t) => Math.abs(Number(gross ? (t.gross ?? (t.net != null ? t.net / 0.8 : 0)) : t.net) || 0);

  const tot = empty(), prev = empty(), perPage = new Map(ids.map(id => [id, { now: empty(), prev: empty() }]));
  const hours = new Map(), fans = new Map();
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
    if (t.fan_account_id) {
      const f = fans.get(`${t.account_id}|${t.fan_account_id}`) || { account_id: t.account_id, fan_account_id: t.fan_account_id, total: 0, purchases: 0 };
      f.total += k === 'refund' ? -a : a; if (k !== 'refund') f.purchases += 1;
      fans.set(`${t.account_id}|${t.fan_account_id}`, f);
    }
  }
  out.totals = round(tot); out.prev_totals = round(prev);
  out.paying_fans = fans.size;
  out.by_hour = [...hours.values()].map(h => Object.fromEntries(Object.entries(h).map(([k, v]) => [k, typeof v === 'number' && k !== 'hour' ? cents(v) : v])))
    .sort((x, y) => (x.day + String(x.hour).padStart(2, '0')).localeCompare(y.day + String(y.hour).padStart(2, '0')));

  // per page: PPVs sent and bought through the extension, and who is subscribed now
  const daily = await all(() => supabaseAdmin.from('fansly_daily').select('account_id, ppv_sent, ppv_sold').in('account_id', ids).gte('day', from).lte('day', to));
  const subs = await all(() => supabaseAdmin.from('fansly_subscriptions').select('account_id, status').in('account_id', ids).in('status', [3, 4]));
  const totalAll = tot.total;
  out.pages = pages.map(a => {
    const p = perPage.get(a.id), d = daily.filter(x => x.account_id === a.id);
    const sent = d.reduce((s, x) => s + (x.ppv_sent || 0), 0), sold = d.reduce((s, x) => s + (x.ppv_sold || 0), 0);
    return {
      account_id: a.id, page: a.creators?.name || a.username, username: a.username,
      ...round(p.now), prev: round(p.prev),
      // (messages + tips) for every dollar of subscriptions, as Infloww shows it
      engagement_ratio: p.now.subscriptions > 0 ? Math.round(((p.now.messages + p.now.tips) / p.now.subscriptions) * 10000) / 100 : null,
      prev_engagement_ratio: p.prev.subscriptions > 0 ? Math.round(((p.prev.messages + p.prev.tips) / p.prev.subscriptions) * 10000) / 100 : null,
      share: totalAll > 0 ? Math.round((p.now.total / totalAll) * 10000) / 100 : null,
      active_subscribers: subs.filter(s => s.account_id === a.id).length,
      ppv_sent: sent, ppv_sold: sold, buy_rate: sent ? Math.round((sold / sent) * 1000) / 10 : null,
    };
  });

  // fans: names, the top spenders, who subscribed for the first time, whose subscription ended
  const firstSub = new Map();
  const subTx = await all(() => supabaseAdmin.from('fansly_transactions').select('account_id, fan_account_id, created_at_fansly').in('account_id', ids).eq('category', 'subscription').lt('created_at_fansly', end.toISOString()).order('created_at_fansly'));
  for (const t of subTx) { const k = `${t.account_id}|${t.fan_account_id}`; if (t.fan_account_id && !firstSub.has(k)) firstSub.set(k, t); }
  const newSubs = [...firstSub.values()].filter(t => new Date(t.created_at_fansly) >= start);
  const { data: ended } = await supabaseAdmin.from('fansly_subscriptions').select('account_id, fan_account_id, tier_name, ends_at, auto_renew').in('account_id', ids)
    .gte('ends_at', start.toISOString()).lt('ends_at', new Date(Math.min(end.getTime(), Date.now())).toISOString()).order('ends_at', { ascending: false }).limit(300);
  const top = [...fans.values()].sort((x, y) => y.total - x.total).slice(0, 15);
  const want = [...new Set([...top, ...newSubs, ...(ended || [])].map(x => x.fan_account_id).filter(Boolean))];
  const names = new Map();
  for (let i = 0; i < want.length; i += 200) {
    const { data } = await supabaseAdmin.from('fansly_fans').select('account_id, fansly_account_id, username, display_name, nickname').in('account_id', ids).in('fansly_account_id', want.slice(i, i + 200));
    for (const f of data || []) names.set(`${f.account_id}|${f.fansly_account_id}`, { name: f.nickname || f.display_name || (f.username ? `@${f.username}` : null), username: f.username });
  }
  const who = (x) => names.get(`${x.account_id}|${x.fan_account_id}`)?.name || `#${String(x.fan_account_id).slice(-6)}`;
  const pageName = new Map(out.pages.map(p => [p.account_id, p.page]));
  out.top_fans = top.map(f => ({ ...f, total: cents(f.total), name: who(f), page: pageName.get(f.account_id) }));
  out.new_subscribers = newSubs.sort((x, y) => y.created_at_fansly.localeCompare(x.created_at_fansly)).map(t => ({ account_id: t.account_id, fan_account_id: t.fan_account_id, at: t.created_at_fansly, name: who(t), page: pageName.get(t.account_id) }));
  out.ended_subscriptions = (ended || []).map(s => ({ account_id: s.account_id, fan_account_id: s.fan_account_id, at: s.ends_at, tier: s.tier_name, renews: !!s.auto_renew, name: who(s), page: pageName.get(s.account_id) }));

  // how complete the sales list is, per page (from the wallet history reads)
  const { data: led } = await supabaseAdmin.from('fansly_accounts').select('id, ledger_total, ledger_total_at').in('id', ids);
  const counts = await Promise.all(ids.map(id => supabaseAdmin.from('fansly_transactions').select('transaction_id', { count: 'exact', head: true }).eq('account_id', id).eq('source', 'ledger')));
  out.ledger = (led || []).map(l => ({ account_id: l.id, page: pageName.get(l.id), read: counts[ids.indexOf(l.id)]?.count ?? 0, total: l.ledger_total, read_at: l.ledger_total_at }));
  return out;
}

module.exports = { report, typeOf };
