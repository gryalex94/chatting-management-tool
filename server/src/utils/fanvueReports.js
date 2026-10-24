/**
 * Creator reports for Fanvue, the same page as Fansly's and OnlyFans' (utils/fanslyReports.js,
 * utils/ofReports.js), from what the Fanvue sync copied in:
 *  - earnings: fanvue_earnings, by Amsterdam day and hour (subscriptions and renewals, message
 *    PPVs, tips, posts; a refund or chargeback comes off the total and shows as Refunded)
 *  - chatting: fanvue_messages and fanvue_media (a chat message with priced media is a PPV)
 *  - chatters: Fanvue does not say who sent a message, so, as payroll does, a message and its
 *    sale go to whoever was on the page's shift when it was sent (shared if several were), and a
 *    tip to whoever was on shift when it came in
 * Mass messages (broadcasts) and Fanvue's automated messages are left out of the chatting numbers.
 */
const { supabaseAdmin } = require('./supabase');
const Stats = require('./fanslyStats');                 // Amsterdam days, onShiftAt
const R = require('./roster');

const TZ = 'Europe/Amsterdam';
const hourOf = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' });
const cents = (n) => Math.round(n * 100) / 100;
const TYPE = { subscription: 'subscriptions', renewal: 'subscriptions', message: 'messages', tip: 'tips', post: 'media' };
const REFUND = new Set(['refund', 'chargeback']);
const typeOf = (s) => (REFUND.has(s) ? 'refund' : TYPE[s] || 'other');
const CHAT = new Set(['SINGLE_RECIPIENT', 'CHAT_TEXT_GENERATION', 'CHAT_TEXT_REPLY', 'CHAT_TEXT_REWRITE']);
const median = (xs) => { if (!xs.length) return null; const v = [...xs].sort((a, b) => a - b); const m = v.length >> 1; return Math.round(v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2); };

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

/** The Fanvue pages: every connected Fanvue account (the page it belongs to gives the name). */
async function fanvuePages(orgId) {
  const { data, error } = await supabaseAdmin.from('fanvue_accounts').select('id, handle, display_name, creator_id, subscribers_count, creators(name)')
    .eq('organisation_id', orgId).order('connected_at');
  if (error) throw error;
  return (data || []).map(a => ({ id: a.id, page: a.creators?.name || a.display_name || a.handle, creator_id: a.creator_id, subscribers: a.subscribers_count }));
}

/** The chatting numbers of one window, per chatter (key) and in all. */
function chatting(chats, ppv, start, end, whoOf) {
  const s = start.toISOString(), e = end.toISOString();
  const per = new Map();
  const row = (k) => {
    if (!per.has(k)) per.set(k, { messages: 0, ppv_sent: 0, ppv_bought: 0, ppv_sales: 0, fans: new Set(), buyers: new Set(), replies: [] });
    return per.get(k);
  };
  const team = row('team');
  const waiting = new Map();
  for (const m of chats) {
    const key = `${m.account_id}|${m.fan_uuid}`;
    if (m.from_fan) { if (!waiting.has(key)) waiting.set(key, m.sent_at); continue; }
    const since = waiting.get(key); waiting.delete(key);
    if (m.sent_at < s || m.sent_at >= e) continue;
    const p = ppv.get(m.uuid), wait = since ? (Date.parse(m.sent_at) - Date.parse(since)) / 1000 : null;
    const ids = whoOf(m.account_id, m.sent_at);
    for (const r of [team, ...(ids.length ? ids : ['none']).map(row)]) {
      r.messages += 1; r.fans.add(key);
      if (p) { r.ppv_sent += 1; if (p.bought) { r.ppv_bought += 1; r.ppv_sales += p.paid / (r === team ? 1 : Math.max(ids.length, 1)); r.buyers.add(key); } }
      if (wait != null && wait >= 0 && wait <= 3 * 86400) r.replies.push(wait);
    }
  }
  const finish = (r) => ({
    messages: r.messages, mass: 0, ppv_sent: r.ppv_sent, ppv_bought: r.ppv_bought, ppv_sales: cents(r.ppv_sales), fans: r.fans.size, buyers: r.buyers.size,
    unlock_rate: r.ppv_sent ? Math.round((r.ppv_bought / r.ppv_sent) * 1000) / 10 : null,
    golden_ratio: r.messages ? Math.round((r.ppv_sent / r.messages) * 10000) / 100 : null,
    reply_s: median(r.replies), replies: r.replies.length,
  });
  return new Map([...per.entries()].map(([k, r]) => [k, finish(r)]));
}

/** report(orgId, { from, to, accounts, gross }) — the same shape as the Fansly and OnlyFans reports. */
async function report(orgId, { from, to, accounts, gross }) {
  const pages = (await fanvuePages(orgId)).filter(p => !accounts.length || accounts.includes(p.id));
  const ids = pages.map(p => p.id);
  const days = Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000) + 1;
  const prevFrom = Stats.addDays(from, -days), prevTo = Stats.addDays(from, -1);
  const start = Stats.dayStartUtc(from), end = Stats.dayStartUtc(Stats.addDays(to, 1)), prevStart = Stats.dayStartUtc(prevFrom);
  const out = { platform: 'fanvue', from, to, prev_from: prevFrom, prev_to: prevTo, gross: !!gross, pages: [], totals: round(empty()), prev_totals: round(empty()),
    by_hour: [], chatting: null, chatters: [], metrics: null, ledger: [], paying_fans: 0 };
  if (!ids.length) return out;

  // the earnings, both windows
  const earned = await all(() => supabaseAdmin.from('fanvue_earnings').select('account_id, transaction_order_id, source, fan_uuid, paid_at, gross_cents, net_cents, message_uuid')
    .in('account_id', ids).gte('paid_at', prevStart.toISOString()).lt('paid_at', end.toISOString()).order('transaction_order_id'));
  const amountOf = (x) => Math.abs(Number(gross ? x.gross_cents : x.net_cents) || 0) / 100;
  const tot = empty(), prev = empty(), perPage = new Map(ids.map(id => [id, { now: empty(), prev: empty(), subs: 0, prevSubs: 0 }]));
  const hours = new Map(), fans = new Set();
  const add = (b, x, a) => { const k = typeOf(x.source); if (k === 'refund') { b.refunds += a; b.total -= a; return; } b[k] += a; b.total += a; b.sales += 1; };
  for (const x of earned) {
    const at = new Date(x.paid_at), a = amountOf(x), p = perPage.get(x.account_id), now = at >= start, k = typeOf(x.source);
    add(now ? tot : prev, x, a); add(now ? p.now : p.prev, x, a);
    if (k === 'subscriptions') { if (now) p.subs += 1; else p.prevSubs += 1; }
    if (!now) continue;
    const day = Stats.amsDay(at), hour = Number(hourOf.format(at)), key = `${day}|${hour}`;
    const h = hours.get(key) || { day, hour, subscriptions: 0, messages: 0, tips: 0, media: 0, other: 0, refunds: 0 };
    h[k === 'refund' ? 'refunds' : k] += a;
    hours.set(key, h);
    if (x.fan_uuid && k !== 'refund') fans.add(`${x.account_id}|${x.fan_uuid}`);
  }
  out.totals = round(tot); out.prev_totals = round(prev); out.paying_fans = fans.size;
  out.by_hour = [...hours.values()].map(h => ({ ...h, ...Object.fromEntries(['subscriptions', 'messages', 'tips', 'media', 'other', 'refunds'].map(k => [k, cents(h[k])])) }));
  const subsNow = [...perPage.values()].reduce((n, p) => n + p.subs, 0), subsPrev = [...perPage.values()].reduce((n, p) => n + p.prevSubs, 0);
  const pageMetrics = (b, n) => ({
    ratio: b.subscriptions > 0 ? Math.round(((b.messages + b.tips) / b.subscriptions) * 100) / 100 : null,
    ltv: n > 0 ? cents(b.total / n) : null, subscriptions_bought: n, per_day: cents(b.total / days),
  });
  out.metrics = { ...pageMetrics(tot, subsNow), prev: pageMetrics(prev, subsPrev) };

  // the chats (a day earlier too, for fans already waiting), the PPVs in them, and the mass messages
  const chats = (await all(() => supabaseAdmin.from('fanvue_messages').select('account_id, uuid, fan_uuid, from_fan, type, status, sent_at')
    .in('account_id', ids).gte('sent_at', new Date(prevStart.getTime() - 86400000).toISOString()).lt('sent_at', end.toISOString())
    .neq('type', 'BROADCAST').order('sent_at').order('uuid')))
    .filter(m => m.status !== 'UNSENT' && (m.from_fan || CHAT.has(m.type)));
  const media = await all(() => supabaseAdmin.from('fanvue_media').select('message_uuid, price_cents, paid_cents, purchased_at')
    .in('account_id', ids).eq('from_fan', false).gt('price_cents', 0).gte('sent_at', prevStart.toISOString()).lt('sent_at', end.toISOString()));
  const ppv = new Map();
  for (const x of media) {
    const p = ppv.get(x.message_uuid) || { bought: false, paid: 0 };
    if (x.purchased_at) p.bought = true;
    ppv.set(x.message_uuid, p);
  }
  // what each PPV brought in: its sale in the earnings (exact, net or gross)
  for (const x of earned) if (x.source === 'message' && x.message_uuid) { const p = ppv.get(x.message_uuid) || { bought: true, paid: 0 }; p.bought = true; p.paid += amountOf(x); ppv.set(x.message_uuid, p); }
  const massCount = async (a, b) => (await supabaseAdmin.from('fanvue_messages').select('uuid', { count: 'exact', head: true }).in('account_id', ids)
    .eq('type', 'BROADCAST').eq('status', 'SENT').gte('sent_at', a.toISOString()).lt('sent_at', b.toISOString())).count || 0;

  // who was on shift: the Fanvue roster
  const roster = await R.loadRoster(orgId, Stats.addDays(prevFrom, -1), to, 'fanvue', { removed: true }).catch(() => null);
  const pageOf = new Map(pages.map(p => [p.id, p.creator_id]));
  const whoOf = (accountId, iso) => Stats.onShiftAt(roster, pageOf.get(accountId), iso);
  const [nowC, prevC, massNow, massPrev] = await Promise.all([
    chatting(chats, ppv, start, end, whoOf), chatting(chats, ppv, prevStart, start, whoOf), massCount(start, end), massCount(prevStart, start),
  ]);

  // credited sales: message PPVs and tips, to whoever was on shift when the PPV went out (or the tip came in), shared equally
  const sentAt = new Map(chats.map(m => [m.uuid, m.sent_at]));
  const credit = (a, b) => {
    const m = new Map();
    for (const x of earned) {
      if (x.paid_at < a.toISOString() || x.paid_at >= b.toISOString() || !['message', 'tip', 'refund', 'chargeback'].includes(x.source)) continue;
      if (REFUND.has(x.source) && !x.message_uuid) continue;
      const ids2 = whoOf(x.account_id, sentAt.get(x.message_uuid) || x.paid_at);
      for (const id of ids2) m.set(id, (m.get(id) || 0) + (REFUND.has(x.source) ? -1 : 1) * amountOf(x) / ids2.length);
    }
    return m;
  };
  const credNow = credit(start, end), credPrev = credit(prevStart, start);
  out.chatting = { chatter_id: 'team', ...nowC.get('team'), mass: massNow, sales: cents([...credNow.values()].reduce((n, v) => n + v, 0)),
    prev: { ...prevC.get('team'), mass: massPrev, sales: cents([...credPrev.values()].reduce((n, v) => n + v, 0)) } };
  const chIds = [...new Set([...nowC.keys(), ...credNow.keys()].filter(k => k !== 'team' && k !== 'none'))];
  const { data: chs } = chIds.length ? await supabaseAdmin.from('chatters').select('id, name').in('id', chIds) : { data: [] };
  const chName = new Map((chs || []).map(c => [c.id, c.name]));
  out.chatters = [...chIds, ...(nowC.has('none') ? ['none'] : [])].map(k => {
    const c = nowC.get(k) || chatting([], ppv, start, end, whoOf).get('team');
    const pc = prevC.get(k);
    return { ...c, chatter_id: k === 'none' ? null : k, name: k === 'none' ? 'Nobody on shift' : chName.get(k) || 'Unknown chatter',
      sales: k === 'none' ? 0 : cents(credNow.get(k) || 0), prev: pc ? { ...pc, sales: cents(credPrev.get(k) || 0) } : null };
  }).sort((x, y) => (y.chatter_id ? 1 : 0) - (x.chatter_id ? 1 : 0) || y.sales - x.sales || y.messages - x.messages);

  const totalAll = tot.total;
  out.pages = pages.map(p => {
    const pm = perPage.get(p.id);
    const c = chatting(chats.filter(m => m.account_id === p.id), ppv, start, end, () => []).get('team');
    return {
      account_id: p.id, page: p.page, ...round(pm.now), prev: { ...round(pm.prev), ...pageMetrics(pm.prev, pm.prevSubs) }, ...pageMetrics(pm.now, pm.subs),
      share: totalAll > 0 ? Math.round((pm.now.total / totalAll) * 10000) / 100 : null, active_subscribers: p.subscribers,
      messages_sent: c.messages, ppv_sent: c.ppv_sent, ppv_bought: c.ppv_bought, golden_ratio: c.golden_ratio, unlock_rate: c.unlock_rate, reply_s: c.reply_s, fans_chatted: c.fans,
    };
  });
  out.roster = !!roster?.ready;
  return out;
}

module.exports = { report, fanvuePages };
