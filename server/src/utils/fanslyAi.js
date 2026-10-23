/**
 * Fansly, phase 4: the Fansly side of the AI chat engine (utils/aiChat.js).
 * The engine was built on Fanvue's tables; these readers hand it a Fansly chat in
 * the same shape (chatOf / moneyOf), so reply() runs unchanged on a Fansly page.
 *
 * The suggestion is only a draft: the extension types it into Fansly's message
 * box and the chatter edits and sends it. Nothing here talks to Fansly.
 */
const { supabaseAdmin } = require('./supabase');

const clean = (s) => String(s ?? '').trim();
const cents = (n) => Math.round(Math.abs(Number(n) || 0) * 100);

async function all(build, page = 1000) {
  const out = [];
  for (let from = 0; ; from += page) {
    const { data, error } = await build().range(from, from + page - 1);
    if (error) throw new Error(error.message);
    out.push(...(data || []));
    if (!data || data.length < page) return out;
  }
}

/** The Fansly page as the engine's "account" (its id keys the per-fan lookups). */
async function page(orgId, accountId) {
  const { data } = await supabaseAdmin.from('fansly_accounts').select('id, username, display_name, organisation_id').eq('id', accountId).maybeSingle();
  if (!data || data.organisation_id !== orgId) { const e = new Error('Fansly page not found'); e.status = 404; throw e; }
  return { account: { id: data.id, handle: data.username, display_name: data.display_name } };
}

/** His purchases in the shape of fanvue_earnings rows (source: message, tip, post, subscription, refund). */
function earningsOf(tx) {
  return tx.map(t => ({
    source: t.category === 'chat_ppv' ? 'message' : t.category === 'chat_tip' ? 'tip' : t.category === 'subscription' ? 'subscription' : t.category === 'refund' ? 'refund' : 'post',
    gross_cents: cents(t.gross ?? t.net), net_cents: cents(t.net), paid_at: t.created_at_fansly,
    message_uuid: t.credited_message_id || t.message_id || null,
  }));
}

/**
 * The chat with one fan, oldest first, as chatOf() builds it for Fanvue: each
 * message with its PPV (photos / videos, price, when he bought it) and tips.
 */
async function loadChat(accountId, fanId) {
  const [rows, tx] = await Promise.all([
    all(() => supabaseAdmin.from('fansly_messages').select('message_id, from_fan, type, text, sent_at, attachments, price, sold_at, tip_amount')
      .eq('account_id', accountId).eq('fan_account_id', fanId).not('sent_at', 'is', null).order('sent_at').order('message_id')),
    all(() => supabaseAdmin.from('fansly_transactions').select('transaction_id, category, gross, net, created_at_fansly, credited_message_id, message_id')
      .eq('account_id', accountId).eq('fan_account_id', fanId).order('transaction_id')),
  ]);
  // what each attached item is (photo, video, a set)
  const itemIds = [...new Set(rows.flatMap(m => (m.attachments || []).filter(a => a.content_type !== 7).map(a => String(a.content_id))))];
  const items = new Map();
  for (let i = 0; i < itemIds.length; i += 200) {
    const { data } = await supabaseAdmin.from('fansly_items').select('item_id, kind, media_type, media_count').eq('account_id', accountId).in('item_id', itemIds.slice(i, i + 200));
    for (const it of data || []) items.set(it.item_id, it);
  }
  const tips = {};
  for (const t of tx) if (t.category === 'chat_tip' && t.message_id) tips[t.message_id] = (tips[t.message_id] || 0) + Math.abs(Number(t.gross ?? t.net) || 0);
  const chat = rows.map(m => {
    const atts = (m.attachments || []).filter(a => a.content_type !== 7);
    let media = null;
    if (atts.length) {
      media = { photos: 0, videos: 0, other: 0, price: m.price != null ? Number(m.price) : null, bought_at: m.sold_at || null };
      for (const a of atts) {
        const it = items.get(String(a.content_id));
        if (!it) media.other += 1;
        else if (it.kind === 'bundle') media.other += it.media_count || 1;
        else if (it.media_type === 2) media.videos += 1;
        else media.photos += 1;
      }
    }
    const tipAmount = m.tip_amount != null ? Number(m.tip_amount) : tips[m.message_id] || null;
    return {
      uuid: m.message_id, at: m.sent_at, from_fan: m.from_fan, text: m.text || '', type: m.type === 2 ? 'BROADCAST' : 'SINGLE_RECIPIENT',
      mass: !m.from_fan && m.type === 2, tip: m.type === 0 || !!tipAmount, tip_amount: tipAmount ? Math.round(tipAmount) : null, gif: false,
      paid: m.sold_at && m.price != null ? Number(m.price) : null, paid_at: m.sold_at || null, media,
    };
  });
  return { chat, earnings: earningsOf(tx) };
}

/** Who he is, in the shape of a fanvue_fans row. */
async function fanRow(accountId, fanId) {
  const { data: f } = await supabaseAdmin.from('fansly_fans').select('fansly_account_id, username, display_name, nickname').eq('account_id', accountId).eq('fansly_account_id', fanId).maybeSingle();
  // "registered" = when he first subscribed to her (the engine counts a new subscriber from it)
  const { data: sub } = await supabaseAdmin.from('fansly_subscriptions').select('created_at_fansly').eq('account_id', accountId).eq('fan_account_id', fanId).order('created_at_fansly').limit(1);
  return { fan_uuid: fanId, handle: f?.username || null, display_name: f?.display_name || null, nickname: f?.nickname || null, registered_at: sub?.[0]?.created_at_fansly || null };
}

/**
 * His notes, as the engine's memory card: what every shift wrote in the panel,
 * Fansly's own note on him, and the facts of the AI summary.
 */
async function memory(accountId, fanId) {
  const [{ data: notes }, { data: pnotes }, { data: sum }] = await Promise.all([
    supabaseAdmin.from('fansly_fan_notes').select('text, updated_at').eq('account_id', accountId).eq('fan_account_id', fanId).limit(1),
    supabaseAdmin.from('fansly_platform_notes').select('title, note, created_at_fansly').eq('account_id', accountId).eq('fan_account_id', fanId).limit(10),
    supabaseAdmin.from('fansly_fan_summaries').select('summary, built_at').eq('account_id', accountId).eq('fan_account_id', fanId).maybeSingle(),
  ]);
  const facts = [];
  // the fan's note, one fact per line
  for (const n of notes || []) for (const line of String(n.text || '').split('\n')) if (clean(line)) facts.push({ kind: 'about', text: clean(line).replace(/^[-•*]\s*/, '').slice(0, 300), said_at: n.updated_at });
  for (const n of pnotes || []) { const t = [clean(n.title), clean(n.note)].filter(Boolean).join(': '); if (t) facts.push({ kind: 'about', text: t.slice(0, 300), said_at: n.created_at_fansly }); }
  // the AI summary (new shape: about / said_yes / said_no with reasons; summaries from before 24 Oct: facts / refused as plain lines)
  const s = sum?.summary || {};
  const at = sum?.built_at;
  const deal = (d) => (typeof d === 'string' ? clean(d) : [clean(d?.what), clean(d?.why) && !/^no reason given$/i.test(clean(d.why)) ? `(${clean(d.why)})` : ''].filter(Boolean).join(' '));
  for (const t of s.about || []) { const x = typeof t === 'string' ? clean(t) : [clean(t?.topic), clean(t?.detail)].filter(Boolean).join(': '); if (x) facts.push({ kind: 'about', text: x, said_at: at }); }
  for (const t of s.facts || []) if (clean(t)) facts.push({ kind: 'about', text: clean(t), said_at: at });
  for (const t of s.likes || []) if (clean(t)) facts.push({ kind: 'likes', text: clean(t), said_at: at });
  for (const t of s.dislikes || []) if (clean(t)) facts.push({ kind: 'avoid', text: `Doesn't like: ${clean(t)}`, said_at: at });
  for (const t of [...(s.said_no || []), ...(s.refused || [])]) { const x = deal(t); if (x) facts.push({ kind: 'avoid', text: `Said no to: ${x}`, said_at: at }); }
  for (const t of s.said_yes || []) { const x = deal(t); if (x) facts.push({ kind: 'likes', text: `Bought / said yes to: ${x}`, said_at: at }); }
  for (const t of s.promises || []) if (clean(t)) facts.push({ kind: 'plan', text: `Open promise: ${clean(t)}`, said_at: at });
  return { facts: facts.slice(-40), story: '', bond: null };
}

/** What the page earned in the last 30 days (the engine scales the spender bars by it). */
const earned = new Map();
async function monthly(accountId) {
  const hit = earned.get(accountId);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.usd;
  let usd = null;
  try {
    const rows = await all(() => supabaseAdmin.from('fansly_transactions').select('gross, net').eq('account_id', accountId).neq('category', 'refund')
      .gte('created_at_fansly', new Date(Date.now() - 30 * 86400_000).toISOString()).order('transaction_id'));
    usd = Math.round(rows.reduce((s, r) => s + Math.abs(Number(r.gross ?? r.net) || 0), 0));
  } catch { usd = null; }
  earned.set(accountId, { at: Date.now(), usd });
  return usd;
}

/** How close two texts are, 0..1 (word overlap): was the draft sent as it was, or edited? */
function similarity(a, b) {
  const words = (s) => String(s || '').toLowerCase().match(/[\p{L}\p{N}']+/gu) || [];
  const x = words(a), y = words(b);
  if (!x.length && !y.length) return 1;
  if (!x.length || !y.length) return 0;
  const count = (arr) => arr.reduce((m, w) => m.set(w, (m.get(w) || 0) + 1), new Map());
  const cx = count(x), cy = count(y);
  let same = 0;
  for (const [w, n] of cx) same += Math.min(n, cy.get(w) || 0);
  return Math.round((2 * same / (x.length + y.length)) * 1000) / 1000;
}

module.exports = { page, loadChat, fanRow, memory, monthly, earningsOf, similarity };
