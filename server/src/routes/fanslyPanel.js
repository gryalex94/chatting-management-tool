const express = require('express');
const { supabaseAdmin } = require('../utils/supabase');
const { authMiddleware, requireMinRole } = require('../middleware/auth');
const { demoMask } = require('../utils/privacy');
const { ROLE_RANK } = require('../utils/roles');
const F = require('../utils/fanslyIngest');
const { client } = require('../ai/agentRunner');

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
const amsHour = (iso) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Amsterdam', hour: '2-digit', hour12: false }).format(new Date(iso))) % 24;
const median = (xs) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[s.length >> 1]; };

/** The page from the Fansly account id the extension knows (only within the caller's organisation). */
async function accountOf(req, fanslyAccountId) {
  const id = String(fanslyAccountId || '');
  if (!/^\d{5,25}$/.test(id)) return null;
  const { data } = await supabaseAdmin.from('fansly_accounts').select('id, fansly_account_id, username, creator_id, status, creators(name)')
    .eq('organisation_id', req.user.organisationId).eq('fansly_account_id', id).maybeSingle();
  return data || null;
}

/** The fan in this chat: by his account id, else by the chat (group) id. */
async function fanOf(account, { fan, group }) {
  const cols = 'fansly_account_id, group_id, username, display_name, nickname, joined_fansly_at, last_seen_at, follows_you, subscription_tier_name, subscription_status, subscribed_until, last_message_at';
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
  for (const m of msgs) if (m.from_fan && m.sent_at) hours[amsHour(m.sent_at)] += 1;
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
    online_hours: topHours,                                       // Amsterdam hours he writes most
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
    const page = { id: account.id, username: account.username, name: account.creators?.name || account.username };
    if (!fan) return res.json({ found: false, reason: 'fan', page, shift });

    const fanId = fan.fansly_account_id;
    const { data: recent, error } = await supabaseAdmin.from('fansly_messages').select('message_id, from_fan, type, text, sent_at, price, sold_at, sold_net, attachments')
      .eq('account_id', account.id).eq('fan_account_id', fanId).order('sent_at', { ascending: false }).limit(1000);
    if (error) throw error;
    const msgs = (recent || []).filter(m => m.sent_at).reverse();
    const { data: tx } = await supabaseAdmin.from('fansly_transactions').select('category, type_label, item_id, gross, net, created_at_fansly')
      .eq('account_id', account.id).eq('fan_account_id', fanId).limit(2000);
    const { data: notes } = await supabaseAdmin.from('fansly_notes').select('id, text, pinned, created_at, updated_at, user_id, users(name)')
      .eq('account_id', account.id).eq('fan_account_id', fanId).order('pinned', { ascending: false }).order('created_at', { ascending: false }).limit(100);
    const { data: summary } = await supabaseAdmin.from('fansly_fan_summaries').select('summary, last_message_id, built_at, messages_used')
      .eq('account_id', account.id).eq('fan_account_id', fanId).maybeSingle();
    const lastId = msgs[msgs.length - 1]?.message_id || null;
    // items he already owns: what he bought (for "he already owns this" next to scripts with vault items)
    const owned = [...new Set((tx || []).filter(t => t.item_id && t.category !== 'refund').map(t => String(t.item_id)))];
    res.json({
      found: true, page, shift,
      fan: { ...fan, name: fan.nickname || fan.display_name || fan.username || null },
      metrics: metricsOf(msgs, tx || []),
      warnings: warningsOf(msgs, fan),
      notes: (notes || []).map(n => ({ id: n.id, text: n.text, pinned: n.pinned, created_at: n.created_at, updated_at: n.updated_at, author: n.users?.name || 'Someone', mine: n.user_id === req.user.id, can_edit: n.user_id === req.user.id || isManager(req.user) })),
      summary: summary ? { ...summary.summary, built_at: summary.built_at, stale: summary.last_message_id !== lastId, messages_used: summary.messages_used } : null,
      owned_item_ids: owned,
    });
  } catch (e) { fail(res, e, 'load the fan'); }
});

// POST /api/fansly/panel/notes { account, fan, text }
panel.post('/notes', async (req, res) => {
  const text = String(req.body?.text || '').trim().slice(0, 2000);
  if (!text) return res.status(400).json({ error: 'Write something first' });
  try {
    const account = await accountOf(req, req.body?.account);
    const fan = String(req.body?.fan || '');
    if (!account || !/^\d{5,25}$/.test(fan)) return res.status(404).json({ error: 'No such fan on this page' });
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
const SUMMARY_SCHEMA = {
  type: 'object',
  properties: {
    likes: { type: 'array', items: { type: 'string' } },
    bought: { type: 'array', items: { type: 'string' } },
    refused: { type: 'array', items: { type: 'string' } },
    promises: { type: 'array', items: { type: 'string' } },
    facts: { type: 'array', items: { type: 'string' } },
    next_step: { type: 'string' },
    suggested_note: { type: 'string' },
  },
  required: ['likes', 'bought', 'refused', 'promises', 'facts', 'next_step', 'suggested_note'],
  additionalProperties: false,
};
const building = new Set();           // one build per fan at a time

// POST /api/fansly/panel/summary { account, fan, force? } → the stored summary, rebuilt if his chat moved on
panel.post('/summary', async (req, res) => {
  try {
    const account = await accountOf(req, req.body?.account);
    const fanId = String(req.body?.fan || '');
    if (!account || !/^\d{5,25}$/.test(fanId)) return res.status(404).json({ error: 'No such fan on this page' });
    const { data: have } = await supabaseAdmin.from('fansly_fan_summaries').select('summary, last_message_id, built_at, messages_used').eq('account_id', account.id).eq('fan_account_id', fanId).maybeSingle();
    const { data: recent } = await supabaseAdmin.from('fansly_messages').select('message_id, from_fan, type, text, sent_at, price, sold_at, tip_amount')
      .eq('account_id', account.id).eq('fan_account_id', fanId).order('sent_at', { ascending: false }).limit(250);
    const msgs = (recent || []).filter(m => m.sent_at && m.type !== 2).reverse();
    const lastId = msgs[msgs.length - 1]?.message_id || null;
    const out = (row) => ({ ...row.summary, built_at: row.built_at, messages_used: row.messages_used, stale: row.last_message_id !== lastId });
    if (msgs.length < 4) return res.json({ summary: null, reason: 'Too few messages with him yet' });
    // keep the old one when nothing moved, or when it is fresh and only a few messages came since
    const newSince = have ? msgs.length - 1 - msgs.findIndex(m => m.message_id === have.last_message_id) : Infinity;
    const fresh = have && (have.last_message_id === lastId || (!req.body?.force && Date.now() - Date.parse(have.built_at) < 15 * 60_000 && newSince < 10));
    if (fresh) return res.json({ summary: out(have) });
    const key = `${account.id}:${fanId}`;
    if (building.has(key)) return res.json({ summary: have ? out(have) : null, building: true });
    building.add(key);
    try {
      const { data: tx } = await supabaseAdmin.from('fansly_transactions').select('category, type_label, net, created_at_fansly').eq('account_id', account.id).eq('fan_account_id', fanId).limit(200);
      const day = (iso) => new Date(iso).toISOString().slice(0, 16).replace('T', ' ');
      const lines = msgs.map(m => `[${day(m.sent_at)}] ${m.from_fan ? 'HIM' : 'HER'}: ${String(m.text || '').replace(/\s+/g, ' ').trim() || '(media)'}${Number(m.price) > 0 ? ` [PPV $${Number(m.price).toFixed(2)}${m.sold_at ? ', bought' : ', not bought'}]` : ''}${m.tip_amount ? ` [tip $${m.tip_amount}]` : ''}`);
      const buys = (tx || []).map(t => `${day(t.created_at_fansly)} ${t.type_label || t.category} $${Math.abs(Number(t.net) || 0).toFixed(2)}${t.category === 'refund' ? ' (refund)' : ''}`);
      const system = 'You help chatters on Fansly, a subscription site for verified adults, keep track of each fan. Adult and sexual talk between adults is normal here. You read one fan\'s chat with the creator ("HER" is the creator\'s team, "HIM" is the fan) and write short, plain notes for the next chatter. Facts only from the chat; never invent. Each list item is a few words. Empty lists are fine.';
      const user = `His purchases:\n${buys.join('\n') || 'none recorded'}\n\nThe chat, oldest first:\n${lines.join('\n')}\n\n`
        + 'Fill in: likes (what he enjoys, his kinks and topics), bought (what kind of content he paid for), refused (what he said no to or did not buy, and why if he said), '
        + 'promises (anything HER side promised him and still owes, or he promised), facts (his life: name, job, city, plans, dates), '
        + 'next_step (one sentence: what the next chatter should do with him now), suggested_note (one short fact worth saving as a note for every shift, or empty).';
      const r = await client.messages.create({ model: SUMMARY_MODEL, max_tokens: 1500, system, messages: [{ role: 'user', content: user }],
        output_config: { effort: 'low', format: { type: 'json_schema', schema: SUMMARY_SCHEMA } } });
      if (r.stop_reason === 'refusal') return res.json({ summary: have ? out(have) : null, error: 'The AI did not summarise this chat' });
      let summary;
      try { summary = JSON.parse(r.content.find(b => b.type === 'text')?.text || ''); } catch { return res.json({ summary: have ? out(have) : null, error: 'The AI answer could not be read' }); }
      const row = { account_id: account.id, fan_account_id: fanId, summary, last_message_id: lastId, last_message_at: msgs[msgs.length - 1].sent_at, messages_used: msgs.length, model: SUMMARY_MODEL, built_at: new Date().toISOString() };
      const { error } = await supabaseAdmin.from('fansly_fan_summaries').upsert(row, { onConflict: 'account_id,fan_account_id' });
      if (error) throw error;
      res.json({ summary: out(row) });
    } finally { building.delete(key); }
  } catch (e) { fail(res, e, 'summarise the fan'); }
});

// ---------- scripts, as the chatter sees them ----------

// GET /api/fansly/panel/scripts?account=<fansly id of the page>
panel.get('/scripts', async (req, res) => {
  try {
    const account = await accountOf(req, req.query.account);
    let q = supabaseAdmin.from('fansly_scripts').select('id, account_id, stage, title, text, position, item_ids').eq('organisation_id', req.user.organisationId).eq('active', true);
    q = account ? q.or(`account_id.is.null,account_id.eq.${account.id}`) : q.is('account_id', null);
    const { data, error } = await q.order('position').order('created_at');
    if (error) throw error;
    res.json({ stages: STAGES, scripts: data || [] });
  } catch (e) { fail(res, e, 'load the scripts'); }
});

// POST /api/fansly/panel/scripts/:id/use { account, fan }
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

// ======================= managers: the scripts library =======================
scripts.use(authMiddleware, requireMinRole('manager'));

const PPV_WINDOW_MS = 2 * 3600 * 1000;      // a PPV sent to the same fan within 2 h after the script counts as "after it"

// GET /api/fansly/scripts → every script, with how often it was used and how the PPV after it did (last 90 days)
scripts.get('/', async (req, res) => {
  const orgId = req.user.organisationId;
  try {
    const { data: list, error } = await supabaseAdmin.from('fansly_scripts').select('id, account_id, stage, title, text, position, active, item_ids, created_at, updated_at')
      .eq('organisation_id', orgId).order('position').order('created_at');
    if (error) throw error;
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
    const { data: accs } = await supabaseAdmin.from('fansly_accounts').select('id, username, creators(name)').eq('organisation_id', orgId).order('first_seen_at');
    res.json({
      stages: STAGES,
      accounts: (accs || []).map(a => ({ id: a.id, page: a.creators?.name || a.username })),
      scripts: (list || []).map(s => ({ ...s, ...(stats.get(s.id) || { uses: 0, ppv_after: 0, sold_after: 0, last_used_at: null }) })),
    });
  } catch (e) { fail(res, e, 'load the scripts'); }
});

function scriptFields(body, partial) {
  const out = {};
  if (!partial || body.title != null) { const t = String(body.title || '').trim().slice(0, 120); if (!t) throw Object.assign(new Error('A script needs a title'), { status: 400 }); out.title = t; }
  if (!partial || body.text != null) { const t = String(body.text || '').trim().slice(0, 4000); if (!t) throw Object.assign(new Error('A script needs its text'), { status: 400 }); out.text = t; }
  if (!partial || body.stage != null) out.stage = STAGES.includes(body.stage) ? body.stage : 'other';
  if (body.account_id !== undefined) out.account_id = /^[0-9a-f-]{36}$/i.test(String(body.account_id || '')) ? String(body.account_id) : null;
  if (body.active != null) out.active = !!body.active;
  if (body.item_ids !== undefined) out.item_ids = Array.isArray(body.item_ids) ? body.item_ids.map(String).filter(x => /^\d{5,25}$/.test(x)).slice(0, 50) : null;
  return out;
}
async function accountInOrg(orgId, accountId) {
  if (!accountId) return true;
  const { data } = await supabaseAdmin.from('fansly_accounts').select('id').eq('id', accountId).eq('organisation_id', orgId).maybeSingle();
  return !!data;
}

// POST /api/fansly/scripts { stage, title, text, account_id? }
scripts.post('/', async (req, res) => {
  try {
    const row = scriptFields(req.body || {}, false);
    if (!(await accountInOrg(req.user.organisationId, row.account_id))) return res.status(404).json({ error: 'No such Fansly page' });
    const { data: last } = await supabaseAdmin.from('fansly_scripts').select('position').eq('organisation_id', req.user.organisationId).eq('stage', row.stage).order('position', { ascending: false }).limit(1);
    const { data, error } = await supabaseAdmin.from('fansly_scripts').insert({ ...row, organisation_id: req.user.organisationId, created_by: req.user.id, position: (last?.[0]?.position ?? -1) + 1 }).select('id').single();
    if (error) throw error;
    res.json({ ok: true, id: data.id });
  } catch (e) { if (e.status) return res.status(e.status).json({ error: e.message }); fail(res, e, 'save the script'); }
});

// PATCH /api/fansly/scripts/:id
scripts.patch('/:id', async (req, res) => {
  try {
    const patch = scriptFields(req.body || {}, true);
    if (!(await accountInOrg(req.user.organisationId, patch.account_id))) return res.status(404).json({ error: 'No such Fansly page' });
    const { data, error } = await supabaseAdmin.from('fansly_scripts').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', req.params.id).eq('organisation_id', req.user.organisationId).select('id');
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
