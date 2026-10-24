const express = require('express');
const { supabaseAdmin } = require('../utils/supabase');
const { authMiddleware, requireMinRole } = require('../middleware/auth');
const { demoMask } = require('../utils/privacy');
const { ROLE_RANK } = require('../utils/roles');
const F = require('../utils/fanslyIngest');
const { client } = require('../ai/agentRunner');
const Agency = require('../utils/fanAgency');

/**
 * Fansly, phase 3: the side panel the extension shows next to a Fansly chat,
 * and the scripts library managers write for it.
 *
 *   /api/fansly/panel/*    the extension (any signed-in account): the fan card,
 *                          his numbers, notes, the AI summary, the scripts.
 *   /api/fansly/scripts/*  managers in the tool: write, order and measure scripts.
 *
 * Everything here reads and writes our own database. Nothing is sent to Fansly;
 * a clicked script only lands in the message box, and the chatter sends it.
 */
const panel = express.Router();

/** Does this page have a creator profile (its own, or the linked page's)? */
async function hasProfile(orgId, creatorId) {
  if (!creatorId) return false;
  const AI = require('../utils/aiChat');
  const owner = await AI.profileOwner(orgId, creatorId);
  const { data } = await supabaseAdmin.from('ai_personas').select('profile').eq('creator_id', owner).eq('organisation_id', orgId).maybeSingle();
  return !!String(data?.profile?.name || '').trim();
}
const scripts = express.Router();

const STAGES = ['opener', 'warmup', 'sexting', 'ppv_pitch', 'after_no', 'reengage', 'custom', 'aftercare', 'other'];
const isManager = (u) => (ROLE_RANK[u?.role] ?? -1) >= ROLE_RANK.manager;
const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;
const missingTable = (e) => /(relation "(public\.)?fansly_\w+" does not exist|Could not find the table '?(public\.)?fansly_\w+)/.test(String(e?.message || ''));
const fail = (res, e, what) => {
  console.error(`[fansly-panel] ${what}:`, e.message);
  if (missingTable(e)) return res.status(409).json({ error: 'Run database changes 054 and 055 (Fansly panel) in Supabase first' });
  return res.status(500).json({ error: `Could not ${what}` });
};
// the hours he writes, in UTC: the panel shows them in the chatter's own time
const median = (xs) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[s.length >> 1]; };

/**
 * The page from the Fansly account id the extension knows (only within the caller's
 * organisation). `assigned`: a chatter works only the pages they are on the roster for.
 */
async function accountOf(req, fanslyAccountId) {
  const id = String(fanslyAccountId || '');
  if (!/^\d{5,25}$/.test(id)) return null;
  const { data } = await supabaseAdmin.from('fansly_accounts').select('id, fansly_account_id, username, creator_id, status, tiers, creators(name)')
    .eq('organisation_id', req.user.organisationId).eq('fansly_account_id', id).maybeSingle();
  if (!data) return null;
  return { ...data, assigned: await F.mayWork(req.user, data) };
}
const NOT_ASSIGNED = 'You are not on the roster for this page. Ask a manager to add you on the Shifts page.';
/** The same, for routes that change or cost something: refuses pages the caller may not work. */
async function workable(req, res, fanslyAccountId) {
  const account = await accountOf(req, fanslyAccountId);
  if (!account) { res.status(404).json({ error: 'No such Fansly page' }); return null; }
  if (!account.assigned) { res.status(403).json({ error: NOT_ASSIGNED }); return null; }
  return account;
}

/** The fan in this chat: by his account id, else by the chat (group) id. */
async function fanOf(account, { fan, group }) {
  const cols = 'fansly_account_id, group_id, username, display_name, nickname, joined_fansly_at, last_seen_at, follows_you, history_complete, subscription_tier_id, subscription_tier_name, subscription_status, subscribed_until, last_message_at';
  if (fan && /^\d{5,25}$/.test(String(fan))) {
    const { data } = await supabaseAdmin.from('fansly_fans').select(cols).eq('account_id', account.id).eq('fansly_account_id', String(fan)).maybeSingle();
    if (data) return data;
  }
  if (group && /^\d{5,25}$/.test(String(group))) {
    const { data } = await supabaseAdmin.from('fansly_fans').select(cols).eq('account_id', account.id).eq('group_id', String(group)).limit(1);
    if (data?.[0]) return data[0];
    // the fans table may not know the chat yet: the messages do
    const { data: m } = await supabaseAdmin.from('fansly_messages').select('fan_account_id').eq('account_id', account.id).eq('group_id', String(group)).not('fan_account_id', 'is', null).limit(1);
    if (m?.[0]) return { fansly_account_id: m[0].fan_account_id, group_id: String(group) };
  }
  return null;
}

/** The numbers about one fan, from his chat and his purchases. */
function metricsOf(msgs, tx) {
  const team = msgs.filter(m => !m.from_fan && m.type !== 2);
  const offered = msgs.filter(m => !m.from_fan && Number(m.price) > 0);
  const bought = offered.filter(m => m.sold_at);
  const buys = tx.filter(t => !['refund', 'subscription', 'chat_tip'].includes(t.category));
  const spent = tx.reduce((n, t) => n + (t.category === 'refund' ? -1 : 1) * Math.abs(Number(t.net) || 0), 0);
  const tips = tx.filter(t => t.category === 'chat_tip').reduce((n, t) => n + Math.abs(Number(t.net) || 0), 0);
  const last = [...tx].filter(t => t.category !== 'refund').sort((a, b) => String(b.created_at_fansly).localeCompare(String(a.created_at_fansly)))[0] || null;
  // his reply speed: from a message of ours to his next message, within a day
  const gaps = [];
  for (let i = 0; i < msgs.length; i++) {
    if (msgs[i].from_fan || msgs[i].type === 2) continue;
    if (i > 0 && !msgs[i - 1].from_fan) continue;            // only the first of a run of ours
    const next = msgs.slice(i + 1).find(m => m.from_fan);
    if (!next) continue;
    const s = (Date.parse(next.sent_at) - Date.parse(msgs[i].sent_at)) / 1000;
    if (s >= 0 && s < 86400) gaps.push(Math.round(s));
  }
  const hours = new Array(24).fill(0);
  for (const m of msgs) if (m.from_fan && m.sent_at) hours[new Date(m.sent_at).getUTCHours()] += 1;
  const topHours = hours.map((n, h) => ({ h, n })).filter(x => x.n > 0).sort((a, b) => b.n - a.n).slice(0, 3).map(x => x.h).sort((a, b) => a - b);
  return {
    spent_net: round2(spent),
    ppv_offered: offered.length, ppv_bought: bought.length, buy_rate: offered.length ? Math.round((bought.length / offered.length) * 100) : null,
    tips_net: round2(tips),
    purchases: buys.length,
    avg_price: buys.length ? round2(buys.reduce((n, t) => n + Math.abs(Number(t.gross ?? t.net) || 0), 0) / buys.length) : null,
    last_purchase: last ? { what: last.type_label || last.category, net: round2(Math.abs(Number(last.net) || 0)), at: last.created_at_fansly, category: last.category } : null,
    days_since_purchase: last?.created_at_fansly ? Math.floor((Date.now() - Date.parse(last.created_at_fansly)) / 86400000) : null,
    reply_s: median(gaps),
    online_hours_utc: topHours,                                   // the UTC hours he writes most
    messages_recorded: msgs.length, team_messages: team.length,
  };
}

/** What the chatter should notice right now. */
function warningsOf(msgs, fan) {
  const out = [];
  const lastMsg = msgs[msgs.length - 1];
  if (lastMsg?.from_fan && lastMsg.sent_at) {
    // he wrote last: how long since his first unanswered message
    let i = msgs.length - 1; while (i > 0 && msgs[i - 1].from_fan) i -= 1;
    const min = Math.floor((Date.now() - Date.parse(msgs[i].sent_at)) / 60000);
    if (min >= 2 && min < 7 * 24 * 60) out.push({ level: min >= 10 ? 'high' : 'mid', text: `He is waiting ${min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`}` });
  }
  let sinceOffer = 0;
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    if (m.from_fan || m.type === 2) continue;
    if (Number(m.price) > 0) break;
    sinceOffer += 1;
  }
  if (sinceOffer >= 15) out.push({ level: 'mid', text: `No PPV offered in the last ${sinceOffer} messages` });
  const lastOffer = [...msgs].reverse().find(m => !m.from_fan && Number(m.price) > 0);
  if (lastOffer && !lastOffer.sold_at && Date.now() - Date.parse(lastOffer.sent_at) < 48 * 3600 * 1000) out.push({ level: 'info', text: `Last PPV ($${Number(lastOffer.price).toFixed(2)}) is not bought yet` });
  if (fan?.subscribed_until) {
    const days = (Date.parse(fan.subscribed_until) - Date.now()) / 86400000;
    if (days >= 0 && days < 3) out.push({ level: 'mid', text: `His subscription ends in ${days < 1 ? 'less than a day' : `${Math.round(days)} days`}` });
    else if (days < 0) out.push({ level: 'info', text: 'His subscription has ended' });
  }
  return out;
}

// ======================= the extension's panel =======================
panel.use(authMiddleware, demoMask);

// GET /api/fansly/panel/fan?account=<fansly id of the page>&group=<chat id>&fan=<fan id>&deviceId=
panel.get('/fan', async (req, res) => {
  try {
    const account = await accountOf(req, req.query.account);
    if (!account) return res.json({ found: false, reason: 'page' });
    const fan = await fanOf(account, { fan: req.query.fan, group: req.query.group });
    const deviceId = String(req.query.deviceId || '').slice(0, 80);
    // the shift strip: who is signed in, since when on this browser, and the shift that is on now
    const shifts = await F.shiftsFor(req.user.organisationId).catch(() => []);
    const nowShift = F.shiftAt(shifts, account.creator_id, new Date().toISOString());
    let since = null;
    if (deviceId) {
      const { data: pres } = await supabaseAdmin.from('fansly_presence').select('started_at').eq('user_id', req.user.id).eq('device_id', deviceId).is('ended_at', null).order('started_at', { ascending: false }).limit(1);
      since = pres?.[0]?.started_at || null;
    }
    const shift = { user: req.user.name || req.user.email, since, shift: nowShift ? { start: nowShift.start_time, end: nowShift.end_time, timezone: nowShift.timezone } : null };
    // suggested replies use this Fansly page's own creator profile (or the page it is linked to)
    const page = { id: account.id, username: account.username, name: account.creators?.name || account.username, ai: await hasProfile(req.user.organisationId, account.creator_id) };
    if (!account.assigned) return res.json({ found: false, reason: 'not_assigned', message: NOT_ASSIGNED, page, shift });
    if (!fan) return res.json({ found: false, reason: 'fan', page, shift });

    const fanId = fan.fansly_account_id;
    const { data: recent, error } = await supabaseAdmin.from('fansly_messages').select('message_id, from_fan, type, text, sent_at, price, sold_at, sold_net, attachments')
      .eq('account_id', account.id).eq('fan_account_id', fanId).order('sent_at', { ascending: false }).limit(1000);
    if (error) throw error;
    const msgs = (recent || []).filter(m => m.sent_at).reverse();
    const { data: tx } = await supabaseAdmin.from('fansly_transactions').select('category, type_label, item_id, gross, net, created_at_fansly')
      .eq('account_id', account.id).eq('fan_account_id', fanId).limit(2000);
    const { data: note } = await supabaseAdmin.from('fansly_fan_notes').select('text, updated_at, users(name)').eq('account_id', account.id).eq('fan_account_id', fanId).maybeSingle();
    const { data: summary } = await supabaseAdmin.from('fansly_fan_summaries').select('summary, last_message_id, built_at, messages_used')
      .eq('account_id', account.id).eq('fan_account_id', fanId).maybeSingle();
    const { data: fanslyNotes } = await supabaseAdmin.from('fansly_platform_notes').select('note_id, title, note, created_at_fansly').eq('account_id', account.id).eq('fan_account_id', fanId)
      .order('created_at_fansly', { ascending: false }).limit(10);
    const { data: lists } = await supabaseAdmin.from('fansly_list_members').select('list_id').eq('account_id', account.id).eq('fan_account_id', fanId);
    let listNames = [];
    if (lists?.length) {
      const { data: ls } = await supabaseAdmin.from('fansly_lists').select('list_id, label').eq('account_id', account.id).in('list_id', lists.map(l => l.list_id));
      listNames = (ls || []).map(l => l.label).filter(Boolean);
    }
    const lastId = msgs[msgs.length - 1]?.message_id || null;
    // items he already owns: what he bought (for "he already owns this" next to scripts with vault items)
    const owned = [...new Set((tx || []).filter(t => t.item_id && t.category !== 'refund').map(t => String(t.item_id)))];
    // the same as vault media (a PPV is a priced copy of a vault item): what he owns, and what was already sent to him
    const sentItems = msgs.filter(m => !m.from_fan).flatMap(m => (m.attachments || []).map(x => String(x.content_id || x.contentId || '')).filter(Boolean));
    const boughtItems = [...owned, ...msgs.filter(m => !m.from_fan && m.sold_at).flatMap(m => (m.attachments || []).map(x => String(x.content_id || x.contentId || '')).filter(Boolean))];
    const itemIds = [...new Set([...sentItems, ...boughtItems])];
    const { data: its } = itemIds.length ? await supabaseAdmin.from('fansly_items').select('item_id, media_id, media_ids').eq('account_id', account.id).in('item_id', itemIds.slice(0, 1000)) : { data: [] };
    const mediaOf = new Map((its || []).map(x => [x.item_id, x.media_id ? [x.media_id] : (x.media_ids || [])]));
    const toMedia = (ids) => [...new Set(ids.flatMap(id => mediaOf.get(id) || []))];
    const { data: runs } = await supabaseAdmin.from('fansly_script_runs').select('script_id, step, updated_at').eq('account_id', account.id).eq('fan_account_id', fanId);
    res.json({
      found: true, page, shift,
      fan: { ...fan, name: fan.nickname || fan.display_name || fan.username || null, lists: listNames,
        // his tier with Fansly's own chip colour (when the extension has seen it)
        tier: fan.subscription_tier_id || fan.subscription_tier_name ? { name: account.tiers?.[fan.subscription_tier_id]?.name || fan.subscription_tier_name || 'Subscribed', color: account.tiers?.[fan.subscription_tier_id]?.color || null } : null },
      fansly_notes: (fanslyNotes || []).filter(n => n.note || n.title).map(n => ({ id: n.note_id, title: n.title, note: n.note, at: n.created_at_fansly })),
      metrics: metricsOf(msgs, tx || []),
      warnings: warningsOf(msgs, fan),
      // is his whole chat recorded? Until the chatter scrolls to its first message, numbers and the AI see only part of it
      history: { complete: !!fan.history_complete, recorded: msgs.filter(m => m.type !== 2).length, oldest_at: msgs[0]?.sent_at || null },
      note: { text: note?.text || '', updated_at: note?.updated_at || null, by: note?.users?.name || null },
      summary: summary ? { ...summary.summary, built_at: summary.built_at, stale: summary.last_message_id !== lastId, messages_used: summary.messages_used } : null,
      owned_item_ids: owned,
      owned_media_ids: toMedia(boughtItems), sent_media_ids: toMedia(sentItems),
      runs: Object.fromEntries((runs || []).map(r => [r.script_id, { step: r.step, at: r.updated_at }])),
      // where else he sits in the agency and what he spent there (utils/fanAgency.js)
      agency: await Agency.agencySpend(req.user.organisationId, fanId, { thisAccountId: account.id, fanslyOnly: true }).catch(e => { console.error('[fansly-panel] agency:', e.message); return null; }),
    });
  } catch (e) { fail(res, e, 'load the fan'); }
});

// POST /api/fansly/panel/notes { account, fan, text }
panel.post('/notes', async (req, res) => {
  const text = String(req.body?.text || '').trim().slice(0, 2000);
  if (!text) return res.status(400).json({ error: 'Write something first' });
  try {
    const account = await workable(req, res, req.body?.account);
    if (!account) return;
    const fan = String(req.body?.fan || '');
    if (!/^\d{5,25}$/.test(fan)) return res.status(404).json({ error: 'No such fan on this page' });
    const { data, error } = await supabaseAdmin.from('fansly_notes').insert({ account_id: account.id, fan_account_id: fan, user_id: req.user.id, text }).select('id').single();
    if (error) throw error;
    res.json({ ok: true, id: data.id });
  } catch (e) { fail(res, e, 'save the note'); }
});

/** A note the caller may change: their own, or any note on their organisation's pages for a manager. */
async function editableNote(req) {
  const { data: n } = await supabaseAdmin.from('fansly_notes').select('id, user_id, account_id, fansly_accounts!inner(organisation_id)').eq('id', req.params.id).maybeSingle();
  if (!n || n.fansly_accounts?.organisation_id !== req.user.organisationId) return null;
  if (n.user_id !== req.user.id && !isManager(req.user)) return null;
  return n;
}

// PUT /api/fansly/panel/note { account, fan, text } — the fan's one note, saved as the chatter types
panel.put('/note', async (req, res) => {
  try {
    const account = await workable(req, res, req.body?.account);
    if (!account) return;
    const fan = String(req.body?.fan || '');
    if (!/^\d{5,25}$/.test(fan)) return res.status(404).json({ error: 'No such fan on this page' });
    const text = String(req.body?.text ?? '').slice(0, 5000);
    const row = { account_id: account.id, fan_account_id: fan, text, updated_by: req.user.id, updated_at: new Date().toISOString() };
    const { error } = await supabaseAdmin.from('fansly_fan_notes').upsert(row, { onConflict: 'account_id,fan_account_id' });
    if (error) throw error;
    res.json({ ok: true, updated_at: row.updated_at });
  } catch (e) { fail(res, e, 'save the note'); }
});

// PATCH /api/fansly/panel/notes/:id { text?, pinned? }
panel.patch('/notes/:id', async (req, res) => {
  try {
    const n = await editableNote(req);
    if (!n) return res.status(403).json({ error: 'You can change only your own notes' });
    const patch = { updated_at: new Date().toISOString() };
    if (req.body?.text != null) { const t = String(req.body.text).trim().slice(0, 2000); if (!t) return res.status(400).json({ error: 'A note cannot be empty' }); patch.text = t; }
    if (req.body?.pinned != null) patch.pinned = !!req.body.pinned;
    const { error } = await supabaseAdmin.from('fansly_notes').update(patch).eq('id', n.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) { fail(res, e, 'change the note'); }
});

// DELETE /api/fansly/panel/notes/:id
panel.delete('/notes/:id', async (req, res) => {
  try {
    const n = await editableNote(req);
    if (!n) return res.status(403).json({ error: 'You can delete only your own notes' });
    const { error } = await supabaseAdmin.from('fansly_notes').delete().eq('id', n.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) { fail(res, e, 'delete the note'); }
});

// ---------- the AI summary of a fan ----------
const SUMMARY_MODEL = 'claude-haiku-5-5';
// What the fan told us, nothing more: no advice and no next steps (the chatter decides those).
const DEAL = { type: 'object', properties: { what: { type: 'string' }, why: { type: 'string' }, when: { type: 'string' } }, required: ['what', 'why', 'when'], additionalProperties: false };
const FACT = { type: 'object', properties: { topic: { type: 'string' }, detail: { type: 'string' } }, required: ['topic', 'detail'], additionalProperties: false };
const SUMMARY_SCHEMA = {
  type: 'object',
  properties: {
    likes: { type: 'array', items: { type: 'string' } },          // what turns him on, content and topics he enjoys
    dislikes: { type: 'array', items: { type: 'string' } },       // what he doesn't like or asked not to get
    said_yes: { type: 'array', items: DEAL },                     // what he bought or agreed to, and why / what made him say yes
    said_no: { type: 'array', items: DEAL },                      // what he refused or didn't buy, and his reason (his words)
    promises: { type: 'array', items: { type: 'string' } },       // anything still owed, by her side or by him
    about: { type: 'array', items: FACT },                        // his life: name, age, place, work, relationship, schedule, money, plans…
  },
  required: ['likes', 'dislikes', 'said_yes', 'said_no', 'promises', 'about'],
  additionalProperties: false,
};
const building = new Set();           // one build per fan at a time

// POST /api/fansly/panel/summary { account, fan, force? } → the stored summary, rebuilt if his chat moved on
panel.post('/summary', async (req, res) => {
  try {
    const account = await workable(req, res, req.body?.account);
    if (!account) return;
    const fanId = String(req.body?.fan || '');
    if (!/^\d{5,25}$/.test(fanId)) return res.status(404).json({ error: 'No such fan on this page' });
    const { data: have } = await supabaseAdmin.from('fansly_fan_summaries').select('summary, last_message_id, built_at, messages_used').eq('account_id', account.id).eq('fan_account_id', fanId).maybeSingle();
    const { data: recent } = await supabaseAdmin.from('fansly_messages').select('message_id, from_fan, type, text, sent_at, price, sold_at, tip_amount')
      .eq('account_id', account.id).eq('fan_account_id', fanId).order('sent_at', { ascending: false }).limit(250);
    const msgs = (recent || []).filter(m => m.sent_at && m.type !== 2).reverse();
    const lastId = msgs[msgs.length - 1]?.message_id || null;
    const out = (row) => ({ ...row.summary, built_at: row.built_at, messages_used: row.messages_used, stale: row.last_message_id !== lastId });
    if (msgs.length < 4) return res.json({ summary: null, reason: 'Too few messages with him yet' });
    // keep the old one when nothing moved, or when it is fresh and only a few messages came since
    const newSince = have ? msgs.length - 1 - msgs.findIndex(m => m.message_id === have.last_message_id) : Infinity;
    // pressing the button (force) always writes a new one; without it, the saved one is reused while it still fits
    const fresh = have && !req.body?.force && (have.last_message_id === lastId || (Date.now() - Date.parse(have.built_at) < 15 * 60_000 && newSince < 10));
    if (fresh) return res.json({ summary: out(have) });
    const key = `${account.id}:${fanId}`;
    if (building.has(key)) return res.json({ summary: have ? out(have) : null, building: true });
    building.add(key);
    try {
      const { data: tx } = await supabaseAdmin.from('fansly_transactions').select('category, type_label, net, gross, created_at_fansly, credited_message_id').eq('account_id', account.id).eq('fan_account_id', fanId).limit(200);
      const day = (iso) => new Date(iso).toISOString().slice(0, 16).replace('T', ' ');
      const lines = msgs.map(m => `[${day(m.sent_at)}] ${m.from_fan ? 'HIM' : 'HER'}: ${String(m.text || '').replace(/\s+/g, ' ').trim() || '(media)'}${Number(m.price) > 0 ? ` [PPV $${Number(m.price).toFixed(2)}${m.sold_at ? ', bought' : ', not bought'}]` : ''}${m.tip_amount ? ` [tip $${m.tip_amount}]` : ''}`);
      // only what he bought in the chat (PPVs and tips) and refunds, and only those the chat lines don't already show as bought
      // (subscriptions and wall purchases say nothing about the chat; a PPV in the chat would otherwise be listed twice)
      const shown = new Set(msgs.map(m => m.message_id));
      const outside = (tx || []).filter(t => ['chat_ppv', 'chat_tip', 'refund'].includes(t.category) && !(t.credited_message_id && shown.has(t.credited_message_id)));
      // those carry no chat around them: one line of totals (count and sum per kind) instead of a list
      const sumOf = (cat) => { const xs = outside.filter(t => t.category === cat); return xs.length ? `${xs.length} ${cat === 'chat_ppv' ? 'PPV' : cat === 'chat_tip' ? 'tip' : 'refund'}${xs.length === 1 ? '' : 's'}, $${xs.reduce((n, t) => n + Math.abs(Number(t.gross ?? t.net) || 0), 0).toFixed(2)}${xs.length ? ` (${day(xs.map(t => t.created_at_fansly).sort()[0])} to ${day(xs.map(t => t.created_at_fansly).sort().pop())})` : ''}` : null; };
      const buys = [['chat_ppv'], ['chat_tip'], ['refund']].map(([c]) => sumOf(c)).filter(Boolean);
      const system = 'You read one fan\'s chat with a creator on Fansly, a subscription site for verified adults, and write down what the chat tells us about him, for the chatters who talk to him. Adult and sexual talk between adults is normal here. "HER" is the creator\'s team, "HIM" is the fan. '
        + 'Report only information the chat contains: what he said, did, bought and refused. Never give advice, next steps, ideas or opinions, and never guess or invent. Keep his own words where they matter. Each item is short and plain. '
        + 'One item per thing: merge repeats of the same offer or fact into one, and never list one purchase twice. Leave out small talk and anything that says nothing ("he is good", "nothing noted"). Empty lists are fine.';
      const user = `His chat purchases from before the chat below (no chat recorded around them):\n${buys.join('\n') || 'none'}\n\nThe chat, oldest first:\n${lines.join('\n')}\n\n`
        + 'Fill in:\n'
        + '- likes: what he enjoys or asks for (kinks, content, body parts, outfits, roleplay, topics).\n'
        + '- dislikes: what he doesn\'t like, complained about or asked not to get.\n'
        + '- said_yes: each PPV he bought, tip he sent or offer he agreed to in the chat (the [PPV …, bought] and [tip …] marks, and his purchases above). what = what it was, from the chat (the video or photos it was, a custom, a tip), with its price; '
        + 'why = what made him say yes: what he had asked for, the tease or offer just before, his mood or reason, in his words where possible; empty if the chat shows nothing; when = the date (day only). Subscriptions are not listed; the purchases from before the chat are ONE item (what = their count and total, why empty, when = their dates).\n'
        + '- said_no: each PPV he didn\'t buy, offer he turned down or request he refused. what = what it was, with its price; why = his reason, in his words where possible ("card is empty", "too expensive", "send it free", "not into that"), or "no answer" if he just ignored it; when = the date (day only).\n'
        + '- promises: anything still owed: what HER side promised him, or what he promised (pay later, come back on payday).\n'
        + '- about: every fact about HIS life he shared (never facts about her), as topic + detail. Topics like name, age, location, time zone, job, schedule, relationship, family, money and payday, health, hobbies, travel and plans with dates, what he wants from her. One fact per item.';
      const r = await client.messages.create({ model: SUMMARY_MODEL, max_tokens: 4000, system, messages: [{ role: 'user', content: user }],
        output_config: { effort: 'low', format: { type: 'json_schema', schema: SUMMARY_SCHEMA } } });
      // what it cost, in the AI usage log with the rest of the AI spend (Claude Haiku 5.5: $0.10 in / $0.50 out per million tokens)
      const inTok = r.usage?.input_tokens || 0, outTok = r.usage?.output_tokens || 0;
      const cost = Math.round(((inTok * 0.10 + outTok * 0.50) / 1e6) * 1e6) / 1e6;
      supabaseAdmin.from('ai_usage').insert({ organisation_id: req.user.organisationId, kind: 'fansly_summary', model: SUMMARY_MODEL, input_tokens: inTok, output_tokens: outTok, cost_usd: cost, creator_id: account.creator_id || null, fan_uuid: fanId })
        .then(({ error: e2 }) => { if (e2) console.error('[fansly-panel] usage:', e2.message); });
      if (r.stop_reason === 'refusal') return res.json({ summary: have ? out(have) : null, error: 'The AI did not summarise this chat' });
      let summary;
      try { summary = JSON.parse(r.content.find(b => b.type === 'text')?.text || ''); } catch { return res.json({ summary: have ? out(have) : null, error: 'The AI answer could not be read' }); }
      const row = { account_id: account.id, fan_account_id: fanId, summary, last_message_id: lastId, last_message_at: msgs[msgs.length - 1].sent_at, messages_used: msgs.length, model: SUMMARY_MODEL, built_at: new Date().toISOString() };
      const { error } = await supabaseAdmin.from('fansly_fan_summaries').upsert(row, { onConflict: 'account_id,fan_account_id' });
      if (error) throw error;
      res.json({ summary: out(row), cost_usd: cost });
    } finally { building.delete(key); }
  } catch (e) { fail(res, e, 'summarise the fan'); }
});

// ---------- the translator (utils/fanslyTranslate.js); nothing is sent to Fansly ----------
const TR = require('../utils/fanslyTranslate');
const fanParam = (v) => (/^\d{5,25}$/.test(String(v || '')) ? String(v) : null);

// GET /api/fansly/panel/translate?account&fan → his recent messages in English (new ones translated now) and the language to answer in
panel.get('/translate', async (req, res) => {
  try {
    const account = await workable(req, res, req.query.account);
    if (!account) return;
    const fan = fanParam(req.query.fan);
    if (!fan) return res.status(404).json({ error: 'No such fan on this page' });
    const msgs = await TR.incoming(req.user.organisationId, account, fan);       // first: it learns his language
    res.json({ ...msgs, language: await TR.language(account, fan), languages: TR.NAMES });
  } catch (e) { fail(res, e, 'translate his messages'); }
});

// GET /api/fansly/panel/vault-marks?account=&group= → the vault items this fan was sent in his chat:
// bought (green in Fansly's vault), sent as a PPV and not bought (red), or sent free; with the price
panel.get('/vault-marks', async (req, res) => {
  try {
    const account = await workable(req, res, req.query.account);
    if (!account) return;
    const fan = await fanOf(account, { group: req.query.group, fan: req.query.fan });
    if (!fan) return res.json({ marks: [] });
    const { data: msgs, error } = await supabaseAdmin.from('fansly_messages').select('sent_at, sold_at, attachments')
      .eq('account_id', account.id).eq('fan_account_id', fan.fansly_account_id).eq('from_fan', false).not('attachments', 'is', null)
      .order('sent_at', { ascending: false }).limit(2000);
    if (error) throw error;
    const { data: tx } = await supabaseAdmin.from('fansly_transactions').select('item_id, category, gross, created_at_fansly')
      .eq('account_id', account.id).eq('fan_account_id', fan.fansly_account_id).not('item_id', 'is', null).limit(2000);
    const owned = new Set((tx || []).filter(t => t.category !== 'refund').map(t => String(t.item_id)));
    const sent = [];
    // what he bought on the creator's wall (posts), from the sales ledger
    for (const t of tx || []) if (t.category === 'wall') sent.push({ item: String(t.item_id), at: t.created_at_fansly, sold: true, price: Math.abs(Number(t.gross) || 0) || null, wall: true });
    for (const m of msgs || []) for (const a of m.attachments || []) {
      const id = String(a.content_id || a.contentId || '');
      if (id) sent.push({ item: id, at: m.sent_at, sold: !!m.sold_at || owned.has(id), price: a.price });
    }
    const ids = [...new Set(sent.map(x => x.item))];
    const { data: items } = ids.length ? await supabaseAdmin.from('fansly_items').select('item_id, price, media_id, media_ids').eq('account_id', account.id).in('item_id', ids.slice(0, 1000)) : { data: [] };
    const itemOf = new Map((items || []).map(i => [i.item_id, i]));
    const marks = new Map();                                  // vault media id → what happened with it in his chat
    for (const x of sent) {
      const it = itemOf.get(x.item); if (!it) continue;
      const price = Number(x.price ?? it.price) || 0;
      for (const mid of it.media_id ? [it.media_id] : (it.media_ids || [])) {
        const status = x.sold ? 'bought' : price > 0 ? 'not_bought' : 'free';
        const was = marks.get(mid);
        const rank = { bought: 3, not_bought: 2, free: 1 };
        // bought in the chat counts before bought on the wall; a later chat sale replaces a wall one
        if (!was || rank[status] > rank[was.status] || (status === 'bought' && was.wall && !x.wall))
          marks.set(mid, { media_id: mid, status, price, at: x.at, times: (was?.times || 0) + (x.wall ? 0 : 1), bundle: !it.media_id, wall: !!x.wall });
        else if (!x.wall) was.times += 1;
      }
    }
    const mids = [...marks.keys()];
    const { data: media } = mids.length ? await supabaseAdmin.from('fansly_vault_media').select('media_id, filename').eq('account_id', account.id).in('media_id', mids) : { data: [] };
    for (const v of media || []) marks.get(v.media_id).filename = v.filename || null;
    res.json({ marks: [...marks.values()] });
  } catch (e) { fail(res, e, 'read what he was sent from the vault'); }
});

// POST /api/fansly/panel/translate { account, fan, text, lang? } → the text in his language (or lang)
panel.post('/translate', async (req, res) => {
  try {
    const account = await workable(req, res, req.body?.account);
    if (!account) return;
    const fan = fanParam(req.body?.fan);
    if (!fan) return res.status(404).json({ error: 'No such fan on this page' });
    const lang = req.body?.lang && TR.NAMES[req.body.lang] ? req.body.lang : (await TR.language(account, fan)).lang;
    res.json(await TR.outgoing(req.user.organisationId, account, fan, req.body?.text, lang));
  } catch (e) { fail(res, e, 'translate the reply'); }
});

// PUT /api/fansly/panel/translate/language { account, fan, lang | null } → answer him in this language (null: his own)
panel.put('/translate/language', async (req, res) => {
  try {
    const account = await workable(req, res, req.body?.account);
    if (!account) return;
    const fan = fanParam(req.body?.fan);
    if (!fan) return res.status(404).json({ error: 'No such fan on this page' });
    res.json({ language: await TR.setLanguage(account, fan, req.body?.lang && TR.NAMES[req.body.lang] ? req.body.lang : null) });
  } catch (e) { fail(res, e, 'set his language'); }
});

// ---------- scripts, as the chatter sees them ----------

// GET /api/fansly/panel/scripts?account=<fansly id of the page>
panel.get('/scripts', async (req, res) => {
  try {
    const account = await accountOf(req, req.query.account);
    if (account && !account.assigned) return res.json({ stages: STAGES, scripts: [], not_assigned: true });
    let q = supabaseAdmin.from('fansly_scripts').select('id, account_id, stage, title, text, position, item_ids, steps').eq('organisation_id', req.user.organisationId).eq('platform', 'fansly').eq('active', true);
    q = account ? q.or(`account_id.is.null,account_id.eq.${account.id}`) : q.is('account_id', null);
    const { data, error } = await q.order('position').order('created_at');
    if (error) throw error;
    // the vault media the steps use: name, photo or video, length (to find it in Fansly's vault picker)
    const ids = [...new Set((data || []).flatMap(sc => (sc.steps || []).flatMap(st => st.media_ids || [])))];
    const { data: media } = ids.length && account ? await supabaseAdmin.from('fansly_vault_media').select('media_id, type, filename, duration_s, width, height, created_at_fansly, album_ids').eq('account_id', account.id).in('media_id', ids.slice(0, 1000)) : { data: [] };
    const { data: albums } = account ? await supabaseAdmin.from('fansly_vault_albums').select('album_id, title, type, item_count, pos').eq('account_id', account.id) : { data: [] };
    res.json({ stages: STAGES, scripts: data || [], media: Object.fromEntries((media || []).map(m => [m.media_id, m])), albums: albums || [] });
  } catch (e) { fail(res, e, 'load the scripts'); }
});

// POST /api/fansly/panel/scripts/:id/use { account, fan }
// POST /api/fansly/panel/scripts/:id/step { account, fan, step } — where this fan is in a sequence (the next step to do)
panel.post('/scripts/:id/step', async (req, res) => {
  try {
    const account = await workable(req, res, req.body?.account);
    if (!account) return;
    const fan = /^\d{5,25}$/.test(String(req.body?.fan || '')) ? String(req.body.fan) : null;
    const { data: sc } = await supabaseAdmin.from('fansly_scripts').select('id, steps').eq('id', req.params.id).eq('organisation_id', req.user.organisationId).maybeSingle();
    if (!sc || !fan) return res.status(404).json({ error: 'No such script or fan' });
    const step = Math.max(0, Math.min((sc.steps || []).length, Math.floor(Number(req.body?.step) || 0)));
    const { error } = await supabaseAdmin.from('fansly_script_runs').upsert({ account_id: account.id, fan_account_id: fan, script_id: sc.id, step, updated_at: new Date().toISOString(), updated_by: req.user.id }, { onConflict: 'account_id,fan_account_id,script_id' });
    if (error) throw error;
    res.json({ ok: true, step });
  } catch (e) { fail(res, e, 'save the step'); }
});

panel.post('/scripts/:id/use', async (req, res) => {
  try {
    const { data: s } = await supabaseAdmin.from('fansly_scripts').select('id').eq('id', req.params.id).eq('organisation_id', req.user.organisationId).maybeSingle();
    if (!s) return res.status(404).json({ error: 'No such script' });
    const account = await accountOf(req, req.body?.account);
    const fan = /^\d{5,25}$/.test(String(req.body?.fan || '')) ? String(req.body.fan) : null;
    const chatterId = await F.chatterFor(req.user).catch(() => null);
    const { error } = await supabaseAdmin.from('fansly_script_uses').insert({ organisation_id: req.user.organisationId, script_id: s.id, account_id: account?.id || null, fan_account_id: fan, user_id: req.user.id, chatter_id: chatterId });
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) { fail(res, e, 'record the script'); }
});

// ---------- "open this chat" from the Messages dashboard, for this person's own browser ----------

// GET /api/fansly/panel/commands?account=<fansly id> → chats to open here (asked from the dashboard by this person)
panel.get('/commands', async (req, res) => {
  try {
    const account = await accountOf(req, req.query.account);
    if (!account) return res.json({ open: [] });
    const { data } = await supabaseAdmin.from('fansly_fetch_jobs').select('id, progress, requested_at').eq('account_id', account.id).eq('kind', 'open_chat')
      .eq('target_user', req.user.id).eq('status', 'pending').gte('requested_at', new Date(Date.now() - 5 * 60_000).toISOString()).order('requested_at').limit(3);
    const ids = (data || []).map(j => j.id);
    if (ids.length) await supabaseAdmin.from('fansly_fetch_jobs').update({ status: 'done', finished_at: new Date().toISOString() }).in('id', ids);
    res.json({ open: (data || []).map(j => ({ id: j.id, group_id: j.progress?.group_id })).filter(x => /^\d{5,25}$/.test(String(x.group_id || ''))) });
  } catch (e) { fail(res, e, 'read the requests'); }
});

// ---------- one fan across the agency: links to his OnlyFans and Fanvue accounts ----------

// GET /api/fansly/panel/link-search?account=&q= → fans on OnlyFans and Fanvue to link him to
panel.get('/link-search', async (req, res) => {
  try {
    const account = await workable(req, res, req.query.account);
    if (!account) return;
    res.json({ results: await Agency.searchOther(req.user.organisationId, req.query.q) });
  } catch (e) { fail(res, e, 'search'); }
});

// POST /api/fansly/panel/links { account, fan, platform, ref_id, ref_name } — "this is the same person"
panel.post('/links', async (req, res) => {
  try {
    const account = await workable(req, res, req.body?.account);
    if (!account) return;
    const fan = String(req.body?.fan || ''), platform = String(req.body?.platform || ''), refId = String(req.body?.ref_id || '').slice(0, 80);
    if (!/^\d{5,25}$/.test(fan) || !['onlyfans', 'fanvue'].includes(platform) || !refId) return res.status(400).json({ error: 'Pick a fan to link' });
    const { error } = await supabaseAdmin.from('fan_links').upsert({ organisation_id: req.user.organisationId, fansly_fan_id: fan, platform, ref_id: refId,
      ref_name: String(req.body?.ref_name || '').slice(0, 120) || null, created_by: req.user.id, created_at: new Date().toISOString() }, { onConflict: 'organisation_id,fansly_fan_id,platform' });   // one account per platform: a new link replaces the old one
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) { fail(res, e, 'link the fan'); }
});

// DELETE /api/fansly/panel/links/:id — not the same person after all
panel.delete('/links/:id', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin.from('fan_links').delete().eq('id', req.params.id).eq('organisation_id', req.user.organisationId).select('id');
    if (error) throw error;
    if (!data?.length) return res.status(404).json({ error: 'No such link' });
    res.json({ ok: true });
  } catch (e) { fail(res, e, 'remove the link'); }
});

// ---------- phase 4: suggested replies ----------
const FX = require('../utils/fanslyAi');
const SAME_CONVERSATION_MS = 6 * 3600 * 1000;      // the engine's plan for a fan carries over within one conversation

// POST /api/fansly/panel/suggest { account, fan } → { draft_id, messages[], goal, why } or { stopped | quiet }
panel.post('/suggest', async (req, res) => {
  try {
    const account = await workable(req, res, req.body?.account);
    if (!account) return;
    const fanId = String(req.body?.fan || '');
    if (!/^\d{5,25}$/.test(fanId)) return res.status(404).json({ error: 'No such fan on this page' });
    if (!account.creator_id || !(await hasProfile(req.user.organisationId, account.creator_id))) return res.status(409).json({ error: 'This page has no creator profile yet. A manager fills it in: AI chat, with Fansly picked and this page chosen, then Her profile.' });
    const AI = require('../utils/aiChat');
    // the last suggestion for him in this conversation carries the engine's plan forward
    const { data: prev } = await supabaseAdmin.from('fansly_ai_drafts').select('id, session, status, created_at').eq('account_id', account.id).eq('fan_account_id', fanId)
      .order('created_at', { ascending: false }).limit(1);
    const last = prev?.[0];
    const session = last?.session && Date.now() - Date.parse(last.created_at) < SAME_CONVERSATION_MS ? last.session : null;
    // an unsent earlier suggestion counts as not used
    if (last && ['shown', 'inserted'].includes(last.status)) await supabaseAdmin.from('fansly_ai_drafts').update({ status: 'discarded', decided_at: new Date().toISOString() }).eq('id', last.id);
    const opts = { fanUuid: fanId, fansly: { accountId: account.id }, session };
    let out;
    try { out = await AI.reply(req.user.organisationId, account.creator_id, opts); }
    catch (e) {
      // he hasn't written since our last message: she writes first (a nudge)
      if (/no message from him/i.test(e.message)) out = await AI.reply(req.user.organisationId, account.creator_id, { ...opts, followUp: true });
      else throw e;
    }
    const chatterId = await F.chatterFor(req.user).catch(() => null);
    const base = { organisation_id: req.user.organisationId, account_id: account.id, fan_account_id: fanId, user_id: req.user.id, chatter_id: chatterId, his: (out.used?.said || []).join('\n').slice(0, 2000) || null };
    if (out.screen?.action === 'stop' || out.screen?.action === 'handover') {
      await supabaseAdmin.from('fansly_ai_drafts').insert({ ...base, status: 'failed', goal: 'stopped', draft: null });
      return res.json({ stopped: true, reasons: out.screen.reasons || [] });
    }
    if (out.quiet) return res.json({ quiet: true, text: out.quiet.text, why: out.quiet.why });
    const r = (out.results || []).find(x => ['ok', 'check'].includes(x.status) && x.replies?.length);
    if (!r) {
      await supabaseAdmin.from('fansly_ai_drafts').insert({ ...base, status: 'failed', goal: out.used?.plan?.goal || null, model: out.results?.[0]?.model || null, session: out.used?.session || null });
      return res.json({ error: (out.results?.[0]?.problems || [])[0] || 'The AI could not write a reply this time. Try again.' });
    }
    const messages = r.replies.map(x => String(x.creator_message || '').trim()).filter(Boolean);
    const { data: row, error } = await supabaseAdmin.from('fansly_ai_drafts').insert({ ...base, draft: messages.join('\n'), model: r.model, goal: out.used?.plan?.goal || null,
      session: out.used?.session || null, cost_usd: r.cost != null ? Math.round(r.cost * 1e6) / 1e6 : null, status: 'shown' }).select('id').single();
    if (error) throw error;
    res.json({ draft_id: row.id, messages, goal: out.used?.plan?.goal_text || out.used?.plan?.goal || null, why: out.used?.plan?.why || null, coach: r.coach?.summary || null, ppv_idea: r.ppv ? true : false });
  } catch (e) {
    if (e.status && e.status < 500) return res.status(e.status).json({ error: e.message });
    fail(res, e, 'suggest a reply');
  }
});

/** A suggestion of the caller's own. */
async function ownDraft(req) {
  const { data } = await supabaseAdmin.from('fansly_ai_drafts').select('id, draft, status, user_id, organisation_id').eq('id', req.params.id).maybeSingle();
  return data && data.organisation_id === req.user.organisationId && data.user_id === req.user.id ? data : null;
}

// POST /api/fansly/panel/drafts/:id { status: 'inserted' | 'discarded' }
panel.post('/drafts/:id', async (req, res) => {
  try {
    const d = await ownDraft(req);
    if (!d) return res.status(404).json({ error: 'No such suggestion' });
    const status = req.body?.status === 'inserted' ? 'inserted' : 'discarded';
    if (['sent_as_is', 'edited'].includes(d.status)) return res.json({ ok: true, status: d.status });
    await supabaseAdmin.from('fansly_ai_drafts').update({ status, decided_at: new Date().toISOString() }).eq('id', d.id);
    res.json({ ok: true, status });
  } catch (e) { fail(res, e, 'record the suggestion'); }
});

// POST /api/fansly/panel/drafts/:id/sent { text } → sent as it was, or edited
panel.post('/drafts/:id/sent', async (req, res) => {
  try {
    const d = await ownDraft(req);
    if (!d) return res.status(404).json({ error: 'No such suggestion' });
    const text = String(req.body?.text || '').slice(0, 4000);
    // the draft may be several messages: the sent one is compared with the closest of them
    const parts = String(d.draft || '').split('\n').filter(Boolean);
    const sim = Math.max(FX.similarity(d.draft, text), ...parts.map(p => FX.similarity(p, text)));
    const status = sim >= 0.9 ? 'sent_as_is' : 'edited';
    await supabaseAdmin.from('fansly_ai_drafts').update({ status, final_text: text, similarity: sim, decided_at: new Date().toISOString() }).eq('id', d.id);
    res.json({ ok: true, status, similarity: sim });
  } catch (e) { fail(res, e, 'record the suggestion'); }
});

// ======================= managers: the scripts library =======================
scripts.use(authMiddleware, requireMinRole('manager'));

const PPV_WINDOW_MS = 2 * 3600 * 1000;      // a PPV sent to the same fan within 2 h after the script counts as "after it"

// The scripts library is per platform (?platform= or body.platform; Fansly when left out). On Fansly a
// script can belong to one Fansly account (account_id) and is clicked in the extension's panel; on
// OnlyFans and Fanvue it can belong to one page (creator_id) and is copied from the library.
const SCRIPT_PLATFORMS = ['fansly', 'onlyfans', 'fanvue'];
const platformOf = (v) => (SCRIPT_PLATFORMS.includes(v) ? v : 'fansly');
async function scriptPages(orgId, platform) {
  if (platform === 'fansly') {
    const { data } = await supabaseAdmin.from('fansly_accounts').select('id, username, creators(name)').eq('organisation_id', orgId).order('first_seen_at');
    return (data || []).map(a => ({ id: a.id, page: a.creators?.name || a.username }));
  }
  const { data } = await supabaseAdmin.from('creators').select('id, name').eq('organisation_id', orgId).eq('platform', platform).eq('is_active', true).is('merged_into', null).order('name');
  return (data || []).map(c => ({ id: c.id, page: c.name }));
}

// GET /api/fansly/scripts?platform= → every script, with how often it was used and how the PPV after it did (last 90 days, Fansly)
scripts.get('/', async (req, res) => {
  const orgId = req.user.organisationId;
  const platform = platformOf(req.query.platform);
  try {
    const { data: rows, error } = await supabaseAdmin.from('fansly_scripts').select('id, account_id, creator_id, stage, title, text, position, active, item_ids, steps, created_at, updated_at')
      .eq('organisation_id', orgId).eq('platform', platform).order('position').order('created_at');
    if (error) throw error;
    // the page a script belongs to goes out as account_id on every platform
    const list = (rows || []).map(({ creator_id, ...x }) => (platform === 'fansly' ? x : { ...x, account_id: creator_id }));
    if (platform !== 'fansly') {
      return res.json({ platform, stages: STAGES, accounts: await scriptPages(orgId, platform), scripts: list.map(x => ({ ...x, uses: 0, ppv_after: 0, sold_after: 0, last_used_at: null })) });
    }
    const since = new Date(Date.now() - 90 * 86400000).toISOString();
    const { data: uses } = await supabaseAdmin.from('fansly_script_uses').select('script_id, account_id, fan_account_id, used_at').eq('organisation_id', orgId).gte('used_at', since).limit(20000);
    // the PPVs sent to the fans the scripts were used on, per page
    const ppvs = new Map();          // `${account}:${fan}` → [{ at, sold }]
    const byAccount = new Map();
    for (const u of uses || []) if (u.account_id && u.fan_account_id) { const s = byAccount.get(u.account_id) || new Set(); s.add(u.fan_account_id); byAccount.set(u.account_id, s); }
    for (const [acc, fans] of byAccount) {
      const ids = [...fans];
      for (let i = 0; i < ids.length; i += 200) {
        const { data } = await supabaseAdmin.from('fansly_messages').select('fan_account_id, sent_at, sold_at').eq('account_id', acc).eq('from_fan', false).gt('price', 0)
          .gte('sent_at', since).in('fan_account_id', ids.slice(i, i + 200)).limit(20000);
        for (const m of data || []) { const k = `${acc}:${m.fan_account_id}`; const a = ppvs.get(k) || []; a.push({ at: Date.parse(m.sent_at), sold: !!m.sold_at }); ppvs.set(k, a); }
      }
    }
    const stats = new Map();
    for (const u of uses || []) {
      const st = stats.get(u.script_id) || { uses: 0, ppv_after: 0, sold_after: 0, last_used_at: null };
      st.uses += 1;
      if (!st.last_used_at || u.used_at > st.last_used_at) st.last_used_at = u.used_at;
      const t = Date.parse(u.used_at);
      const next = (ppvs.get(`${u.account_id}:${u.fan_account_id}`) || []).filter(p => p.at >= t && p.at - t <= PPV_WINDOW_MS).sort((a, b) => a.at - b.at)[0];
      if (next) { st.ppv_after += 1; if (next.sold) st.sold_after += 1; }
      stats.set(u.script_id, st);
    }
    res.json({
      platform, stages: STAGES,
      accounts: await scriptPages(orgId, 'fansly'),
      scripts: (list || []).map(s => ({ ...s, ...(stats.get(s.id) || { uses: 0, ppv_after: 0, sold_after: 0, last_used_at: null }) })),
    });
  } catch (e) { fail(res, e, 'load the scripts'); }
});

// GET /api/fansly/scripts/vault?account=<page id>&album=&q=&type=&offset= → the page's vault as the extension saw it,
// with what each item sold for in chats (for picking media for a sequence's steps)
scripts.get('/vault', async (req, res) => {
  try {
    const orgId = req.user.organisationId;
    const { data: acc } = await supabaseAdmin.from('fansly_accounts').select('id').eq('id', String(req.query.account || '')).eq('organisation_id', orgId).maybeSingle();
    if (!acc) return res.status(404).json({ error: 'No such Fansly page' });
    const offset = Math.max(0, Math.floor(Number(req.query.offset) || 0));
    let q = supabaseAdmin.from('fansly_vault_media').select('media_id, type, filename, duration_s, width, height, created_at_fansly, album_ids', { count: 'exact' }).eq('account_id', acc.id);
    if (/^\d{5,25}$/.test(String(req.query.album || ''))) q = q.contains('album_ids', [String(req.query.album)]);
    if (['1', '2'].includes(String(req.query.type || ''))) q = q.eq('type', Number(req.query.type));
    const term = String(req.query.q || '').replace(/[%_,()]/g, '').trim().slice(0, 60);
    if (term) q = q.ilike('filename', `%${term}%`);
    const { data: media, count, error } = await q.order('created_at_fansly', { ascending: false, nullsFirst: false }).range(offset, offset + 59);
    if (error) throw error;
    const ids = (media || []).map(m => m.media_id);
    const { data: items } = ids.length ? await supabaseAdmin.from('fansly_items').select('media_id, price, lifetime_sales, lifetime_net').eq('account_id', acc.id).in('media_id', ids) : { data: [] };
    const sold = new Map();
    for (const it of items || []) { const x = sold.get(it.media_id) || { sent: 0, sales: 0, net: 0 }; x.sent += 1; x.sales += it.lifetime_sales || 0; x.net += Number(it.lifetime_net) || 0; sold.set(it.media_id, x); }
    const { data: albums } = await supabaseAdmin.from('fansly_vault_albums').select('album_id, title, type, item_count, pos').eq('account_id', acc.id).order('pos');
    res.json({ total: count || 0, offset, media: (media || []).map(m => ({ ...m, chats: sold.get(m.media_id) || null })), albums: albums || [] });
  } catch (e) { fail(res, e, 'load the vault'); }
});

/** A script's steps, checked: up to 20 of text / vault media (free or a price in dollars) / wait for his reply. */
function cleanSteps(v) {
  if (v == null || (Array.isArray(v) && !v.length)) return null;
  if (!Array.isArray(v)) throw Object.assign(new Error('The steps could not be read'), { status: 400 });
  const out = v.slice(0, 20).map(st => {
    const kind = ['text', 'media', 'wait'].includes(st?.kind) ? st.kind : null;
    if (!kind) throw Object.assign(new Error('A step is text, media or wait'), { status: 400 });
    const text = String(st.text || '').slice(0, 4000);
    if (kind === 'text' && !text.trim()) throw Object.assign(new Error('A text step needs its text'), { status: 400 });
    if (kind !== 'media') return kind === 'wait' ? { kind } : { kind, text };
    const media_ids = [...new Set((st.media_ids || []).map(String).filter(x => /^\d{5,25}$/.test(x)))].slice(0, 20);
    if (!media_ids.length) throw Object.assign(new Error('A media step needs at least one item from the vault'), { status: 400 });
    const price = Math.max(0, Math.min(1000, Math.round((Number(st.price) || 0) * 100) / 100));
    return { kind, text, media_ids, price };
  });
  return out;
}
function scriptFields(body, partial) {
  const out = {};
  if (!partial || body.title != null) { const t = String(body.title || '').trim().slice(0, 120); if (!t) throw Object.assign(new Error('A script needs a title'), { status: 400 }); out.title = t; }
  if (!partial || body.text != null) { const t = String(body.text || '').trim().slice(0, 4000); if (!t) throw Object.assign(new Error('A script needs its text'), { status: 400 }); out.text = t; }
  if (!partial || body.stage != null) out.stage = STAGES.includes(body.stage) ? body.stage : 'other';
  if (body.account_id !== undefined) out.account_id = /^[0-9a-f-]{36}$/i.test(String(body.account_id || '')) ? String(body.account_id) : null;
  if (body.active != null) out.active = !!body.active;
  if (body.steps !== undefined) out.steps = cleanSteps(body.steps);
  if (body.item_ids !== undefined) out.item_ids = Array.isArray(body.item_ids) ? body.item_ids.map(String).filter(x => /^\d{5,25}$/.test(x)).slice(0, 50) : null;
  return out;
}
async function accountInOrg(orgId, accountId, platform = 'fansly') {
  if (!accountId) return true;
  if (platform !== 'fansly') return (await scriptPages(orgId, platform)).some(p => p.id === accountId);
  const { data } = await supabaseAdmin.from('fansly_accounts').select('id').eq('id', accountId).eq('organisation_id', orgId).maybeSingle();
  return !!data;
}
/** A script's page: account_id on Fansly, creator_id on the other platforms. */
const placeOf = (row, platform) => {
  if (platform === 'fansly' || row.account_id === undefined) return row;
  const { account_id, ...rest } = row;
  return { ...rest, creator_id: account_id };
};

// POST /api/fansly/scripts { stage, title, text, account_id? }
scripts.post('/', async (req, res) => {
  try {
    const platform = platformOf(req.body?.platform);
    const row = scriptFields(req.body || {}, false);
    if (!(await accountInOrg(req.user.organisationId, row.account_id, platform))) return res.status(404).json({ error: 'No such page' });
    const { data: last } = await supabaseAdmin.from('fansly_scripts').select('position').eq('organisation_id', req.user.organisationId).eq('platform', platform).eq('stage', row.stage).order('position', { ascending: false }).limit(1);
    const { data, error } = await supabaseAdmin.from('fansly_scripts').insert({ ...placeOf(row, platform), platform, organisation_id: req.user.organisationId, created_by: req.user.id, position: (last?.[0]?.position ?? -1) + 1 }).select('id').single();
    if (error) throw error;
    res.json({ ok: true, id: data.id });
  } catch (e) { if (e.status) return res.status(e.status).json({ error: e.message }); fail(res, e, 'save the script'); }
});

// PATCH /api/fansly/scripts/:id
scripts.patch('/:id', async (req, res) => {
  try {
    const patch = scriptFields(req.body || {}, true);
    const { data: cur } = await supabaseAdmin.from('fansly_scripts').select('platform').eq('id', req.params.id).eq('organisation_id', req.user.organisationId).maybeSingle();
    if (!cur) return res.status(404).json({ error: 'No such script' });
    if (!(await accountInOrg(req.user.organisationId, patch.account_id, cur.platform))) return res.status(404).json({ error: 'No such page' });
    const { data, error } = await supabaseAdmin.from('fansly_scripts').update({ ...placeOf(patch, cur.platform), updated_at: new Date().toISOString() }).eq('id', req.params.id).eq('organisation_id', req.user.organisationId).select('id');
    if (error) throw error;
    if (!data?.length) return res.status(404).json({ error: 'No such script' });
    res.json({ ok: true });
  } catch (e) { if (e.status) return res.status(e.status).json({ error: e.message }); fail(res, e, 'change the script'); }
});

// DELETE /api/fansly/scripts/:id
scripts.delete('/:id', async (req, res) => {
  try {
    const { error } = await supabaseAdmin.from('fansly_scripts').delete().eq('id', req.params.id).eq('organisation_id', req.user.organisationId);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) { fail(res, e, 'delete the script'); }
});

// POST /api/fansly/scripts/order { ids: [...] } → positions in this order
scripts.post('/order', async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter(x => /^[0-9a-f-]{36}$/i.test(String(x))).slice(0, 500) : [];
  try {
    for (let i = 0; i < ids.length; i++) await supabaseAdmin.from('fansly_scripts').update({ position: i }).eq('id', ids[i]).eq('organisation_id', req.user.organisationId);
    res.json({ ok: true });
  } catch (e) { fail(res, e, 'reorder the scripts'); }
});

module.exports = { panel, scripts, metricsOf, warningsOf };
