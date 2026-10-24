/**
 * Fansly, phase 2 (FANSLY_EXTENSION_PLAN.md): what the recorded rows mean.
 *  - matchSales: ties each sale in the earnings ledger to the PPV message it paid
 *    for (same item, same fan) and marks that message sold; tips go to the chat.
 *    Run again whenever older chats arrive, because a sale can be recorded before
 *    the message it belongs to.
 *  - rebuildDaily: one line per account, Amsterdam day and chatter in fansly_daily,
 *    which reports and payroll read.
 * Nothing here talks to Fansly.
 */
const { supabaseAdmin } = require('./supabase');
const R = require('./roster');
const infloww = require('../integrations/infloww');

// ---------- who was on shift (the Fansly roster) ----------
// The roster's clock is Amsterdam's; a tip's real time is turned into it (as payroll does).
const amsClock = (iso) => infloww.toStoreTime(new Date(iso)).getTime();
const clockDay = (t) => new Date(t).toISOString().slice(0, 10);
const toMin = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0); };
const onRosterOn = (a, date) => (!a.created_at || clockDay(amsClock(a.created_at)) <= date) && (a.is_active !== false || (!!a.updated_at && clockDay(amsClock(a.updated_at)) > date));
const rosterCache = new Map();
async function fanslyRoster(orgId) {
  const hit = rosterCache.get(orgId);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.r;
  const today = clockDay(amsClock(new Date().toISOString()));
  const r = await R.loadRoster(orgId, '2024-01-01', today, 'fansly', { removed: true }).catch(() => ({ ready: false, slots: [], assignments: [], changes: [] }));
  rosterCache.set(orgId, { at: Date.now(), r });
  return r;
}
/** The chatters rostered on this page's Fansly shift at that moment (none before anyone was put on the roster). */
function onShiftAt(roster, creatorId, iso) {
  if (!roster?.ready || !creatorId || !iso) return [];
  const t = amsClock(iso), date = clockDay(t);
  const slotById = Object.fromEntries((roster.slots || []).map(x => [x.id, x]));
  const out = new Set();
  for (const d of [addDays(date, -1), date]) {
    for (const e of R.effectiveDay(d, roster.assignments.filter(a => onRosterOn(a, d)), roster.changes).entries) {
      const slot = slotById[e.shift_id];
      if (!slot || !(e.creator_ids || []).includes(creatorId)) continue;
      const [a, z] = R.windowIn(slot, e.from, e.to);
      const start = Date.parse(`${d}T00:00:00Z`) + toMin(slot.start) * 60000;
      if (t >= start + a * 60000 && t < start + z * 60000) out.add(e.chatter_id);
    }
  }
  return [...out];
}

const TZ = 'Europe/Amsterdam';
const DAY_MS = 86400000;
const PPV_SALE_TYPES = new Set([2110, 2116, 2010, 2016]);
const TIP_TYPES = new Set([7101, 7001]);

async function all(build, page = 1000) {
  const out = [];
  for (let from = 0; ; from += page) {
    const { data, error } = await build().range(from, from + page - 1);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < page) return out;
  }
}

// ---------- Amsterdam days ----------
const amsDay = (iso) => new Date(iso).toLocaleDateString('sv-SE', { timeZone: TZ });
/** Midnight of an Amsterdam day, as a real instant. */
function dayStartUtc(day) {
  const guess = new Date(`${day}T00:00:00Z`);
  const local = new Date(guess.toLocaleString('en-US', { timeZone: TZ }));
  return new Date(guess.getTime() - (local.getTime() - guess.getTime()));
}
const addDays = (day, n) => new Date(Date.parse(`${day}T12:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

// ---------- the owner's credit rules (per page, fansly_accounts.credit_rules) ----------
/**
 *  mass_ppv   'sender' (default): a PPV bought from a mass message is credited to whoever sent it; 'nobody': page revenue only
 *  late_days  null (default): a chat PPV bought any time later is credited to its sender, on the day of purchase;
 *             a number: bought more than that many days after it was sent → credited to nobody
 *  tip_hours  1 (default): a tip goes to the last chatter who wrote to him through the extension within this many
 *             hours; with nobody, to whoever is rostered on that page's Fansly shift at that moment (shared if several)
 * Only what went through the extension is credited: a PPV whose message has no chatter (sent from a browser
 * without the extension, or recorded from history) is credited to nobody. Refunds come off whoever got the sale.
 */
const DEFAULT_RULES = { mass_ppv: 'sender', late_days: null, tip_hours: 1 };
function rulesOf(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const late = Number(r.late_days);
  const tip = Number(r.tip_hours);
  return {
    mass_ppv: r.mass_ppv === 'nobody' ? 'nobody' : 'sender',
    late_days: Number.isFinite(late) && late > 0 ? Math.round(late) : null,
    tip_hours: Number.isFinite(tip) && tip > 0 && tip <= 72 ? tip : 1,
  };
}
async function rulesFor(accountId) {
  const { data } = await supabaseAdmin.from('fansly_accounts').select('credit_rules').eq('id', accountId).maybeSingle();
  return rulesOf(data?.credit_rules);
}

// ---------- sales ↔ messages ----------
/**
 * Match sales that have no message yet. A media or bundle sale belongs to the
 * creator's message to that fan carrying that item; a tip to the message it
 * arrived on, else to the chat it came from. Whatever stays unmatched and has an
 * item is "wall" (bought from a post), credited to nobody.
 */
async function matchSales(accountId) {
  const rules = await rulesFor(accountId);
  const { data: acct } = await supabaseAdmin.from('fansly_accounts').select('organisation_id, creator_id').eq('id', accountId).maybeSingle();
  const roster = acct ? await fanslyRoster(acct.organisation_id) : null;
  const open = await all(() => supabaseAdmin.from('fansly_transactions')
    .select('transaction_id, type, fan_account_id, item_id, net, created_at_fansly, category, credited_message_id')
    .eq('account_id', accountId).is('credited_message_id', null).or('category.is.null,category.not.in.(subscription,refund)').order('transaction_id'));
  if (!open.length) { await creditRefunds(accountId); return { matched: 0, open: 0 }; }
  const fans = [...new Set(open.map(t => t.fan_account_id).filter(Boolean))];
  const msgs = [];
  for (let i = 0; i < fans.length; i += 100) {
    msgs.push(...await all(() => supabaseAdmin.from('fansly_messages')
      .select('message_id, fan_account_id, chatter_id, attachments, sent_at, from_fan, type')
      .eq('account_id', accountId).in('fan_account_id', fans.slice(i, i + 100)).order('message_id')));
  }
  const byItemFan = new Map();          // `${item}:${fan}` → the creator's message carrying it (the earliest)
  const byTip = new Map();              // tip id → message
  const creatorByFan = new Map();       // fan → creator messages, oldest first
  for (const m of msgs) {
    for (const a of m.attachments || []) {
      if (a.content_type === 7) { byTip.set(String(a.content_id), m); continue; }
      if (m.from_fan) continue;
      const k = `${a.content_id}:${m.fan_account_id}`;
      if (!byItemFan.has(k)) byItemFan.set(k, m);
    }
    if (!m.from_fan) { const l = creatorByFan.get(m.fan_account_id) || []; l.push(m); creatorByFan.set(m.fan_account_id, l); }
  }
  for (const l of creatorByFan.values()) l.sort((a, b) => String(a.sent_at).localeCompare(String(b.sent_at)));

  const txUpdates = [], soldUpdates = [];
  for (const t of open) {
    let patch = null;
    if (PPV_SALE_TYPES.has(t.type) || (t.type == null && t.item_id)) {
      const m = t.item_id ? byItemFan.get(`${t.item_id}:${t.fan_account_id}`) : null;
      if (m) {
        const lateDays = (Date.parse(t.created_at_fansly) - Date.parse(m.sent_at)) / DAY_MS;
        let chatter = m.chatter_id || null;
        let rule = chatter ? (m.type === 2 ? 'sender_of_mass_message' : 'sender_of_message') : 'message_without_chatter';
        if (chatter && m.type === 2 && rules.mass_ppv === 'nobody') { chatter = null; rule = 'mass_message_not_credited'; }
        else if (chatter && m.type !== 2 && rules.late_days != null && lateDays > rules.late_days) { chatter = null; rule = `bought_after_${rules.late_days}_days`; }
        patch = { category: 'chat_ppv', credited_message_id: m.message_id, credited_chatter_id: chatter, credited_rule: rule, message_id: m.message_id };
        soldUpdates.push({ message_id: m.message_id, sold_at: t.created_at_fansly, sold_net: t.net });
      } else if (t.category !== 'wall') patch = { category: 'wall', credited_rule: 'item_not_in_any_chat' };
    } else if (TIP_TYPES.has(t.type)) {
      const onMsg = t.item_id ? byTip.get(String(t.item_id)) : null;
      // the chatter who last wrote to him (with a known sender) before the tip, within 12 hours
      const before = (creatorByFan.get(t.fan_account_id) || []).filter(m => m.sent_at <= t.created_at_fansly && Date.parse(t.created_at_fansly) - Date.parse(m.sent_at) < rules.tip_hours * 3600000);
      const last = [...before].reverse().find(m => m.chatter_id) || null;
      // nobody wrote to him through the extension within the window: whoever is rostered on the page's shift then
      const shift = last ? [] : onShiftAt(roster, acct?.creator_id, t.created_at_fansly);
      const ids = last ? [last.chatter_id] : shift;
      patch = { category: 'chat_tip', credited_message_id: (onMsg || last)?.message_id || null, credited_chatter_id: ids[0] || null, credited_chatter_ids: ids.length ? ids : null,
        credited_rule: last ? 'last_writer_within_window' : ids.length ? (ids.length > 1 ? 'on_shift_shared' : 'on_shift') : 'nobody_writing_or_on_shift', message_id: onMsg?.message_id || null };
    }
    if (patch) txUpdates.push({ transaction_id: t.transaction_id, ...patch });
  }
  for (const u of txUpdates) {
    const { transaction_id, ...patch } = u;
    await supabaseAdmin.from('fansly_transactions').update({ ...patch, updated_at: new Date().toISOString() }).eq('account_id', accountId).eq('transaction_id', transaction_id);
  }
  for (const s of soldUpdates) {
    await supabaseAdmin.from('fansly_messages').update({ sold_at: s.sold_at, sold_net: s.sold_net, sold_source: 'ledger' }).eq('account_id', accountId).eq('message_id', s.message_id);
  }
  await creditRefunds(accountId);          // after the sales, so a refund finds the chatter its sale went to
  return { matched: txUpdates.filter(u => u.credited_message_id).length, open: open.length };
}

/**
 * A refund comes off the chatter the refunded sale was credited to: the latest
 * credited sale to the same fan, for the same amount, before the refund.
 */
async function creditRefunds(accountId) {
  const refunds = await all(() => supabaseAdmin.from('fansly_transactions').select('transaction_id, fan_account_id, net, created_at_fansly')
    // new refunds, and ones whose sale was not credited yet (its chat may have arrived since)
    .eq('account_id', accountId).eq('category', 'refund').or('credited_rule.is.null,credited_rule.in.(refund_sale_not_found,refund_of_uncredited_sale)').order('transaction_id'));
  for (const r of refunds) {
    let patch = { credited_rule: 'refund_sale_not_found' };
    if (r.fan_account_id) {
      const { data: sales } = await supabaseAdmin.from('fansly_transactions').select('transaction_id, net, credited_chatter_id, credited_message_id, created_at_fansly')
        .eq('account_id', accountId).eq('fan_account_id', r.fan_account_id).in('category', ['chat_ppv', 'chat_tip', 'wall', 'subscription', 'other'])
        .lte('created_at_fansly', r.created_at_fansly).order('created_at_fansly', { ascending: false }).limit(50);
      const amount = Math.abs(Number(r.net) || 0);
      const sale = (sales || []).find(x => Math.abs(Math.abs(Number(x.net) || 0) - amount) < 0.02) || null;
      if (sale) patch = { credited_rule: sale.credited_chatter_id ? 'refund_of_credited_sale' : 'refund_of_uncredited_sale', credited_chatter_id: sale.credited_chatter_id || null, credited_message_id: sale.credited_message_id || null };
    }
    await supabaseAdmin.from('fansly_transactions').update({ ...patch, updated_at: new Date().toISOString() }).eq('account_id', accountId).eq('transaction_id', r.transaction_id);
  }
}

/**
 * The owner changed the rules: forget every chat credit and match again, then
 * recount every day that has messages or sales.
 */
async function reapplyRules(accountId) {
  await supabaseAdmin.from('fansly_transactions').update({ category: null, credited_chatter_id: null, credited_chatter_ids: null, credited_message_id: null, credited_rule: null, message_id: null })
    .eq('account_id', accountId).in('category', ['chat_ppv', 'chat_tip', 'wall']);
  await supabaseAdmin.from('fansly_transactions').update({ credited_chatter_id: null, credited_message_id: null, credited_rule: null }).eq('account_id', accountId).eq('category', 'refund');
  const res = await matchSales(accountId);
  const msgDays = await all(() => supabaseAdmin.from('fansly_messages').select('sent_at').eq('account_id', accountId).eq('from_fan', false).not('sent_at', 'is', null).order('sent_at').order('message_id'));
  const txDays = await all(() => supabaseAdmin.from('fansly_transactions').select('created_at_fansly').eq('account_id', accountId).not('created_at_fansly', 'is', null).order('transaction_id'));
  const days = [...new Set([...msgDays.map(m => amsDay(m.sent_at)), ...txDays.map(t => amsDay(t.created_at_fansly))])];
  await rebuildDaily(accountId, days);
  return { ...res, days: days.length };
}

// ---------- the daily summary ----------
const median = (xs) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return Math.round(s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2); };

/** Recount fansly_daily for these Amsterdam days of one account. */
async function rebuildDaily(accountId, days) {
  const list = [...new Set(days)].filter(Boolean).sort();
  for (const day of list) {
    const start = dayStartUtc(day), end = dayStartUtc(addDays(day, 1));
    // a day earlier too: a fan waiting since yesterday evening counts for the first reply today
    const msgs = await all(() => supabaseAdmin.from('fansly_messages')
      .select('message_id, group_id, fan_account_id, from_fan, type, price, chatter_id, attribution, sent_at, sold_at')
      .eq('account_id', accountId).gte('sent_at', new Date(start.getTime() - DAY_MS).toISOString()).lt('sent_at', end.toISOString()).order('sent_at').order('message_id'));
    const tx = await all(() => supabaseAdmin.from('fansly_transactions')
      .select('transaction_id, category, net, credited_chatter_id, credited_chatter_ids, credited_rule, created_at_fansly')
      .eq('account_id', accountId).gte('created_at_fansly', start.toISOString()).lt('created_at_fansly', end.toISOString()).order('transaction_id'));

    const rows = new Map();
    const row = (chatterId) => {
      const key = chatterId || 'none';
      if (!rows.has(key)) rows.set(key, { account_id: accountId, day, chatter_key: key, chatter_id: chatterId || null, sent: 0, mass_sent: 0, fans: new Set(), ppv_sent: 0, ppv_sold: 0, ppv_net: 0, mass_ppv_net: 0, tips_net: 0, refunds_net: 0, unattributed: 0, replies: [] });
      return rows.get(key);
    };
    const inDay = (iso) => iso >= start.toISOString() && iso < end.toISOString();
    const waiting = new Map();          // group → when he started waiting (first message since our last one)
    for (const m of msgs) {
      const g = m.group_id || m.fan_account_id;
      if (m.from_fan) { if (!waiting.has(g)) waiting.set(g, m.sent_at); continue; }
      const since = m.type === 2 ? null : waiting.get(g);
      if (m.type !== 2) waiting.delete(g);
      if (!inDay(m.sent_at)) continue;
      const r = row(m.chatter_id);
      if (m.type === 2) r.mass_sent += 1; else r.sent += 1;
      if (m.fan_account_id) r.fans.add(m.fan_account_id);
      if (Number(m.price) > 0) { r.ppv_sent += 1; if (m.sold_at) r.ppv_sold += 1; }
      if (m.attribution === 'unattributed') r.unattributed += 1;
      if (since) r.replies.push((Date.parse(m.sent_at) - Date.parse(since)) / 1000);
    }
    for (const t of tx) {
      // a tip shared by several chatters on shift: each gets an equal part
      if (t.category === 'chat_tip' && Array.isArray(t.credited_chatter_ids) && t.credited_chatter_ids.length > 1) {
        const part = Math.abs(Number(t.net) || 0) / t.credited_chatter_ids.length;
        for (const cid of t.credited_chatter_ids) row(cid).tips_net += part;
        continue;
      }
      const r = row(t.credited_chatter_id);
      const net = Math.abs(Number(t.net) || 0);
      if (t.category === 'chat_ppv') { r.ppv_net += net; if (t.credited_rule === 'sender_of_mass_message') r.mass_ppv_net += net; }
      else if (t.category === 'chat_tip') r.tips_net += net;
      else if (t.category === 'refund') r.refunds_net += net;
    }
    const out = [...rows.values()].map(r => ({
      account_id: r.account_id, day: r.day, chatter_key: r.chatter_key, chatter_id: r.chatter_id,
      sent: r.sent, mass_sent: r.mass_sent, fans: r.fans.size, ppv_sent: r.ppv_sent, ppv_sold: r.ppv_sold,
      ppv_net: Math.round(r.ppv_net * 100) / 100, mass_ppv_net: Math.round(r.mass_ppv_net * 100) / 100, tips_net: Math.round(r.tips_net * 100) / 100, refunds_net: Math.round(r.refunds_net * 100) / 100,
      unattributed: r.unattributed, median_reply_s: median(r.replies), updated_at: new Date().toISOString(),
    })).filter(r => r.sent || r.mass_sent || r.ppv_net || r.tips_net || r.refunds_net);
    await supabaseAdmin.from('fansly_daily').delete().eq('account_id', accountId).eq('day', day);
    if (out.length) {
      const { error } = await supabaseAdmin.from('fansly_daily').insert(out);
      if (error) throw new Error(`fansly_daily: ${error.message}`);
    }
  }
  return list.length;
}

// ---------- after each batch: match and recount, at most once a minute per account ----------
const pending = new Map();              // account id → { days:Set, timer }
const DEBOUNCE_MS = 45_000;

/** Note what a batch touched; the matching and recount run shortly after, once for many batches. */
function schedule(accountId, isoTimes = []) {
  const p = pending.get(accountId) || { days: new Set(), timer: null };
  for (const iso of isoTimes) if (iso) p.days.add(amsDay(iso));
  p.days.add(amsDay(new Date().toISOString()));
  if (!p.timer) {
    p.timer = setTimeout(() => run(accountId).catch(e => console.error('[fansly] stats:', e.message)), DEBOUNCE_MS);
    p.timer.unref?.();
  }
  pending.set(accountId, p);
}
async function run(accountId) {
  const p = pending.get(accountId); pending.delete(accountId);
  if (!p) return;
  const before = await all(() => supabaseAdmin.from('fansly_transactions').select('created_at_fansly').eq('account_id', accountId).is('credited_message_id', null).or('category.is.null,category.not.in.(subscription,refund)').order('transaction_id'));
  const res = await matchSales(accountId);
  // a sale matched now changes the day it was bought and the day its PPV was sent
  if (res.matched) for (const t of before) if (t.created_at_fansly) p.days.add(amsDay(t.created_at_fansly));
  // days can pile up during a backfill; recount the most recent 60 at most per run
  const days = [...p.days].sort().slice(-60);
  await rebuildDaily(accountId, days);
}

/** Recount the last few days of every account (nightly, and on demand from the dashboard). */
async function refreshAll(orgId = null, back = 3) {
  let q = supabaseAdmin.from('fansly_accounts').select('id');
  if (orgId) q = q.eq('organisation_id', orgId);
  const { data } = await q;
  const today = amsDay(new Date().toISOString());
  const days = Array.from({ length: back + 1 }, (_, i) => addDays(today, -i));
  for (const a of data || []) { await matchSales(a.id); await rebuildDaily(a.id, days); }
  return (data || []).length;
}

module.exports = { onShiftAt, matchSales, rebuildDaily, reapplyRules, rulesOf, DEFAULT_RULES, schedule, refreshAll, amsDay, dayStartUtc, addDays };
