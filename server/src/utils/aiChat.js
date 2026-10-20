/**
 * AI chat for the Fanvue AI creator (database change 036). Step 1 is a practice
 * room: nothing here sends anything to Fanvue, and the Fanvue connection stays
 * read-only. What it does:
 *  - Her profile (ai_personas): who she is and how she writes, drafted by the AI
 *    from her own past messages and edited by a manager.
 *  - Fan memory (ai_fan_memory): short facts about each fan and the story so far,
 *    built by the AI from the chat and kept up to date; a manager can correct or
 *    lock any fact. Money facts are read from Fanvue's own numbers each time.
 *  - A reply: the fan's latest message passes the safety screen (ai/chat/safety.js;
 *    Claude judges doubtful ones), the writer (a model on OpenRouter) gets the
 *    briefing (ai/chat/prompts.js), and its draft is checked the same way. A draft
 *    that breaks a rule is rewritten once, with the reason.
 * Every AI call is written to ai_usage with its cost.
 */
const crypto = require('crypto');
const { supabaseAdmin } = require('./supabase');
const or = require('../integrations/openrouter');
const { screenFan, checkReply, personaProblems } = require('../ai/chat/safety');
const P = require('../ai/chat/prompts');
const { reviewFan, reviewReply, reviewOffer, MODEL: CHECK_MODEL } = require('../ai/chat/review');
const { typingPlan, SPEEDS } = require('../ai/chat/timing');
const strategy = require('../ai/chat/strategy');
const { mediaNote, emptyBody, standingAt } = require('../ai/chat/notes');
const { FAN_TYPES, fanType } = require('../ai/chat/fanTypes');
const C = require('../ai/chat/content');

// Picks which Playbook situations fit a moment: small, quick and cheap.
const PICKER = 'mistralai/ministral-8b-2512';

const NOT_READY = 'Run database change 036 (AI chat) in Supabase first';
const LONG_CHAT = 100;                 // over this many messages, the writer reads the last 40 and the story so far
const RECENT = 40;
const MASS_KEPT = 3;                   // mass messages the writer sees, at most
const MEMORY_CHUNK = 250;              // messages per memory update call
// Her messages typed by her team (not Fanvue's own AI writer, CHAT_TEXT_…): where
// the facts she told fans about herself come from. Not how she chats: her Fanvue
// chats weren't good chatting; that comes from the agency's analysis of ~35k chats.
const TEAM_TYPES = ['SINGLE_RECIPIENT'];
const WELCOME_TYPES = ['AUTOMATED_NEW_SUBSCRIBER', 'AUTOMATED_FIRST_MESSAGE_REPLY'];

class AiChatError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
const clean = (s) => String(s ?? '').trim();
const isMass = (type) => !!type && (type.startsWith('AUTOMATED') || ['BROADCAST', 'GHOST_PROMOTION', 'MARKETING_KYC'].includes(type));
const tableMissing = (e) => /ai_(personas|fan_memory|usage|chat_fans)/.test(String(e?.message || ''));
const check = (error) => {
  if (!error) return;
  if (tableMissing(error)) throw new AiChatError(NOT_READY, 409);
  throw new Error(error.message);
};
const round = (n, d = 6) => Math.round(n * 10 ** d) / 10 ** d;

async function all(q) {
  const out = [];
  for (let off = 0; ; off += 1000) {
    const { data, error } = await q().range(off, off + 999);
    check(error);
    out.push(...(data || []));
    if (!data || data.length < 1000) return out;
  }
}

// What an AI call cost, kept per organisation (never fails the work it describes).
async function logUsage(orgId, kind, model, usage, { creatorId = null, fanUuid = null } = {}) {
  const { error } = await supabaseAdmin.from('ai_usage').insert({
    organisation_id: orgId, kind, model, input_tokens: usage?.input ?? null, output_tokens: usage?.output ?? null,
    cost_usd: usage?.cost == null ? null : round(usage.cost), creator_id: creatorId, fan_uuid: fanUuid,
  });
  if (error && !tableMissing(error)) console.error('[ai-chat] usage:', error.message);
}

// ── Pages, profile ───────────────────────────────────────────────────────────
/** A Fanvue page of the organisation and its connected account. */
async function pageAccount(orgId, creatorId) {
  const { data: page } = await supabaseAdmin.from('creators').select('id, name, organisation_id').eq('id', creatorId).maybeSingle();
  if (!page || page.organisation_id !== orgId) throw new AiChatError('Page not found', 404);
  const { data: account } = await supabaseAdmin.from('fanvue_accounts').select('id, handle, display_name, is_ai_creator')
    .eq('organisation_id', orgId).eq('creator_id', creatorId).maybeSingle();
  if (!account) throw new AiChatError('This page isn\'t linked to a Fanvue account', 409);
  return { page, account };
}

/** The organisation's Fanvue pages, whether each has a profile, and what's set up on the server. */
async function pages(orgId) {
  const { data: accs, error } = await supabaseAdmin.from('fanvue_accounts').select('id, handle, display_name, is_ai_creator, creator_id')
    .eq('organisation_id', orgId).not('creator_id', 'is', null);
  if (error) throw new Error(error.message);
  const ids = accs.map(a => a.creator_id);
  const [{ data: rows }, persona] = await Promise.all([
    ids.length ? supabaseAdmin.from('creators').select('id, name').in('id', ids) : { data: [] },
    ids.length ? supabaseAdmin.from('ai_personas').select('creator_id, profile, settings, updated_at').in('creator_id', ids) : { data: [] },
  ]);
  const name = Object.fromEntries((rows || []).map(r => [r.id, r.name]));
  const prof = Object.fromEntries((persona.data || []).map(p => [p.creator_id, p]));
  return {
    ready: { tables: !persona.error || !tableMissing(persona.error), writer: or.configured(), checker: !!process.env.ANTHROPIC_API_KEY },
    writers: or.WRITERS.map(({ id, label }) => ({ id, label })),
    default_writer: or.DEFAULT_WRITER,
    fan_types: FAN_TYPES,
    pages: accs.map(a => ({
      creator_id: a.creator_id, name: name[a.creator_id] || a.display_name || a.handle, handle: a.handle, is_ai_creator: a.is_ai_creator,
      has_profile: !!clean(prof[a.creator_id]?.profile?.name), writer: prof[a.creator_id]?.settings?.writer || or.DEFAULT_WRITER,
    })),
  };
}

async function loadPersona(orgId, creatorId) {
  const { data, error } = await supabaseAdmin.from('ai_personas').select('*').eq('creator_id', creatorId).maybeSingle();
  check(error);
  return data && data.organisation_id === orgId ? data : null;
}

// A model sometimes answers a field with a list or an object: make it plain text.
const asText = (v) => (Array.isArray(v) ? v.map(asText).filter(Boolean).join(', ')
  : v && typeof v === 'object' ? Object.entries(v).map(([k, x]) => `${k}: ${asText(x)}`).join('; ')
    : clean(v));

// A profile as typed (or drafted), trimmed to sensible sizes. Her age must be 18+.
function cleanProfile(p = {}) {
  const out = {};
  for (const [k] of P.PROFILE_FIELDS) out[k] = asText(p[k]).slice(0, 2000);
  const lines = (v) => (Array.isArray(v) ? v : String(v || '').split('\n')).map(asText).filter(Boolean);
  out.facts = lines(p.facts).slice(0, 40).map(f => f.slice(0, 200));
  const age = parseInt(out.age, 10);
  if (out.age && Number.isFinite(age) && age < 18) throw new AiChatError('Her age must be 18 or over');
  return out;
}

async function getProfile(orgId, creatorId) {
  const { page, account } = await pageAccount(orgId, creatorId);
  const p = await loadPersona(orgId, creatorId);
  return {
    page: { creator_id: page.id, name: page.name, handle: account.handle, is_ai_creator: account.is_ai_creator },
    profile: p?.profile || null, writer: p?.settings?.writer || or.DEFAULT_WRITER, typing: p?.settings?.typing || 'normal', emojis: p?.settings?.emojis || 'rarely',
    timezone: p?.settings?.timezone || P.DEFAULT_TZ, time_zones: P.TIME_ZONES,
    drafted_at: p?.drafted_at || null, updated_at: p?.updated_at || null,
    house_rules: P.HOUSE_RULES, chat_guide: P.CHAT_GUIDE, options: P.GENERATE_OPTIONS,
  };
}

async function saveProfile(orgId, creatorId, { profile, writer, typing, emojis, timezone, drafted }, userId) {
  await pageAccount(orgId, creatorId);
  const clean_ = cleanProfile(profile);
  if (!clean_.name) throw new AiChatError('Give her a name');
  if (writer != null && !or.isOffered(writer)) throw new AiChatError('Pick a writer');
  if (typing != null && !SPEEDS[typing]) throw new AiChatError('Pick her typing speed');
  if (emojis != null && !(emojis in P.EMOJI_CHANCE)) throw new AiChatError('Pick how often she uses emojis');
  if (timezone != null && !P.TIME_ZONES.some(([id]) => id === timezone)) throw new AiChatError('Pick her time zone');
  const cur = await loadPersona(orgId, creatorId);
  const now = new Date().toISOString();
  const { error } = await supabaseAdmin.from('ai_personas').upsert({
    creator_id: creatorId, organisation_id: orgId, profile: clean_,
    settings: {
      ...(cur?.settings || {}), writer: writer || cur?.settings?.writer || or.DEFAULT_WRITER,
      typing: typing || cur?.settings?.typing || 'normal',
      emojis: emojis || cur?.settings?.emojis || 'rarely',
      timezone: timezone || cur?.settings?.timezone || P.DEFAULT_TZ,
    },
    drafted_at: drafted ? now : cur?.drafted_at || null, updated_by: userId, updated_at: now,
  }, { onConflict: 'creator_id' });
  check(error);
  return getProfile(orgId, creatorId);
}

// An even spread of `n` items from a list (oldest to newest).
const spread = (list, n) => (list.length <= n ? list : Array.from({ length: n }, (_, i) => list[Math.floor((i * list.length) / n)]));
const distinct = (texts) => [...new Set(texts.map(clean).filter(t => t.length >= 2))];

/**
 * A new profile from a manager's description and choices (P.GENERATE_OPTIONS):
 * { description (3+ words), name, gender, age (18+), orientation, vibes (1–3),
 * heat, from, interests, pet_names, limits, use_history }. With
 * use_history it stays consistent with what she already told fans. Not saved.
 */
async function generateProfile(orgId, creatorId, raw = {}) {
  if (!or.configured()) throw new AiChatError('Add OPENROUTER_API_KEY to the server settings first', 409);
  const O = P.GENERATE_OPTIONS;
  const text = (v, max = 300) => clean(v).slice(0, max);
  const input = {
    description: text(raw.description, 600), name: text(raw.name, 60), from: text(raw.from, 120),
    interests: text(raw.interests), pet_names: text(raw.pet_names, 120), limits: text(raw.limits),
    gender: O.genders.includes(raw.gender) ? raw.gender : null,
    orientation: O.orientations.includes(raw.orientation) ? raw.orientation : null,
    vibes: (Array.isArray(raw.vibes) ? raw.vibes : []).filter(v => O.vibes.includes(v)).slice(0, 3),
    age: parseInt(raw.age, 10),
  };
  const heat = O.heats.find(h => h.id === raw.heat);
  if (input.description.split(/\s+/).filter(Boolean).length < 3) throw new AiChatError('Describe her in a few words (at least 3)');
  if (!input.gender || !input.orientation || !heat) throw new AiChatError('Pick her gender, sexuality and how spicy she is');
  if (!input.vibes.length) throw new AiChatError('Pick at least one vibe');
  if (!Number.isFinite(input.age) || input.age < 18 || input.age > 70) throw new AiChatError('Her age must be between 18 and 70');
  // her limits are refusals ("no minors"): those words are welcome there
  const typed = [input.description, input.name, input.from, input.interests, input.pet_names].join('\n');
  if (personaProblems(typed).length) throw new AiChatError(`Change the description: ${personaProblems(typed)[0]}`);
  input.heat = `${heat.label}: ${heat.hint}`;

  const { account } = await pageAccount(orgId, creatorId);
  const persona = await loadPersona(orgId, creatorId);
  const model = persona?.settings?.writer || or.DEFAULT_WRITER;
  let own = [];
  if (raw.use_history) {
    const rows = await all(() => supabaseAdmin.from('fanvue_messages').select('text, sent_at').eq('account_id', account.id).eq('from_fan', false)
      .in('type', TEAM_TYPES).not('text', 'is', null).order('sent_at').order('uuid'));
    own = spread(distinct(rows.map(m => m.text)).map(t => t.slice(0, 300)), 120);
  }
  const res = await or.chat({ model, maxTokens: 2000, temperature: 0.7, fallbacks: or.backupsFor(model), messages: P.generatePrompt({ input, own }) });
  await logUsage(orgId, 'profile', res.model, res.usage, { creatorId });
  const j = P.parseJsonObject(res.text);
  if (!j) throw new AiChatError('The AI\'s profile came back unreadable: try again', 502);
  const profile = cleanProfile({
    ...j, name: input.name || j.name, from: input.from || j.from, gender: input.gender, age: String(input.age),
    orientation: input.orientation, vibe: input.vibes.join(', '), heat: input.heat,
  });
  const wrote = personaProblems(Object.entries(profile).filter(([k]) => k !== 'limits').flatMap(([, v]) => v).join('\n'));
  if (wrote.length) throw new AiChatError(`The AI's profile wasn't usable (${wrote[0]}) Try again, or change the description.`, 502);
  return { profile, cost: res.usage.cost, model: or.writerLabel(res.model), read: own.length };
}

/**
 * The facts she has told fans about herself (name, age, where she lives, her
 * height, pets…), read from her past chats and added to her saved profile, so she
 * stays consistent with fans who know her. Not her style: her Fanvue chats weren't
 * good chatting. Not saved: the manager checks and saves it.
 */
async function draftProfile(orgId, creatorId) {
  if (!or.configured()) throw new AiChatError('Add OPENROUTER_API_KEY to the server settings first', 409);
  const { account } = await pageAccount(orgId, creatorId);
  const persona = await loadPersona(orgId, creatorId);
  const model = persona?.settings?.writer || or.DEFAULT_WRITER;
  const [own, mass, welcome] = await Promise.all([
    all(() => supabaseAdmin.from('fanvue_messages').select('text, sent_at').eq('account_id', account.id).eq('from_fan', false)
      .in('type', TEAM_TYPES).not('text', 'is', null).order('sent_at').order('uuid')),
    supabaseAdmin.from('fanvue_messages').select('text').eq('account_id', account.id).eq('type', 'BROADCAST').order('sent_at', { ascending: false }).limit(1000),
    supabaseAdmin.from('fanvue_messages').select('text').eq('account_id', account.id).in('type', WELCOME_TYPES).order('sent_at', { ascending: false }).limit(200),
  ]);
  const ownTexts = spread(distinct(own.map(m => m.text)).map(t => t.slice(0, 300)), 300);
  if (ownTexts.length < 10) throw new AiChatError('There are too few of her own messages to read facts from: fill them in by hand');
  const res = await or.chat({
    model, maxTokens: 1200, temperature: 0.2, fallbacks: or.backupsFor(model),
    messages: P.profilePrompt({ handle: account.handle, own: ownTexts, mass: distinct((mass.data || []).map(m => m.text)).slice(0, 30), welcome: distinct((welcome.data || []).map(m => m.text)).slice(0, 8) }),
  });
  await logUsage(orgId, 'profile', res.model, res.usage, { creatorId });
  const j = P.parseJsonObject(res.text);
  if (!j) throw new AiChatError('The AI\'s answer came back unreadable: try again', 502);
  const cur = persona?.profile || {};
  const found = cleanProfile({ name: j.name, age: parseInt(j.age, 10) >= 18 ? String(j.age) : '', from: j.from, facts: j.facts });
  const facts = [...cur.facts || []];
  for (const f of found.facts) if (!facts.some(x => x.toLowerCase() === f.toLowerCase())) facts.push(f);
  const profile = cleanProfile({ ...cur, name: cur.name || found.name, age: cur.age || found.age, from: cur.from || found.from, facts });
  return { profile, cost: res.usage.cost, model: or.writerLabel(res.model), read: ownTexts.length, added: facts.length - (cur.facts || []).length };
}

// ── A fan's chat, memory and money ──────────────────────────────────────────
// What came with each message (photos, videos, a PPV and whether he bought it),
// keyed "fan|message": a mass message has one id for every fan who got it.
// From fanvue_media (database change 039); none before it ran.
async function mediaFor(accountId, fanUuid = null) {
  let rows = [];
  try {
    rows = await all(() => {
      const q = supabaseAdmin.from('fanvue_media').select('fan_uuid, media_uuid, message_uuid, media_type, price_cents, purchased_at').eq('account_id', accountId);
      return (fanUuid ? q.eq('fan_uuid', fanUuid) : q).order('fan_uuid').order('media_uuid');
    });
  } catch { return {}; }
  const out = {};
  for (const r of rows) {
    if (!r.message_uuid) continue;
    const m = (out[`${r.fan_uuid}|${r.message_uuid}`] ||= { photos: 0, videos: 0, other: 0, price: null, bought_at: null });
    if (r.media_type === 'image') m.photos += 1; else if (r.media_type === 'video') m.videos += 1; else m.other += 1;
    if (r.price_cents) m.price = r.price_cents / 100;
    if (r.purchased_at && (!m.bought_at || r.purchased_at < m.bought_at)) m.bought_at = r.purchased_at;
  }
  return out;
}

// A fan's messages as the writer reads them: each with what came with it and,
// for a paid message, when he bought it.
function chatOf(rows, earn, media, fanUuid) {
  const paid = {};
  for (const e of earn) if (e.source === 'message' && e.message_uuid) paid[e.message_uuid] = { amount: (e.gross_cents || 0) / 100, at: e.paid_at };
  return rows.map(m => ({
    uuid: m.uuid, at: m.sent_at, from_fan: m.from_fan, text: m.text || '', type: m.type,
    mass: !m.from_fan && isMass(m.type), tip: m.type === 'TIP', gif: !!m.gif,
    paid: paid[m.uuid]?.amount || null, paid_at: paid[m.uuid]?.at || null, media: media[`${fanUuid}|${m.uuid}`] || null,
  }));
}

// The chat as it stood at `at`: what he bought later isn't bought yet.
function asOf(chat, at) {
  const t = Date.parse(at);
  const later = (x) => !!x && Date.parse(x) > t;
  return chat.map((m) => {
    if (!later(m.paid_at) && !later(m.media?.bought_at)) return m;
    const x = { ...m };
    if (later(m.paid_at)) { x.paid = null; x.paid_at = null; }
    if (later(m.media?.bought_at)) x.media = { ...m.media, bought_at: null };
    return x;
  });
}

// The whole chat with a fan, oldest first, as the writer reads it.
async function loadChat(accountId, fanUuid) {
  const [rows, earn, media] = await Promise.all([
    all(() => supabaseAdmin.from('fanvue_messages').select('uuid, from_fan, type, text, sent_at, gif:raw->gif').eq('account_id', accountId).eq('fan_uuid', fanUuid).order('sent_at').order('uuid')),
    supabaseAdmin.from('fanvue_earnings').select('source, gross_cents, net_cents, paid_at, message_uuid').eq('account_id', accountId).eq('fan_uuid', fanUuid),
    mediaFor(accountId, fanUuid),
  ]);
  const chat = chatOf(rows, earn.data || [], media, fanUuid);
  return { chat, money: moneyOf(earn.data || [], null, chat.find(m => !m.mass)?.at) };
}

// What a fan has spent, from Fanvue's own numbers (refunds taken off), and where
// he stands with her (subscribed or not); `at` = as it was then (default now),
// `chatSince` = their first message.
function moneyOf(allRows, at = null, chatSince = null) {
  const t = at ? Date.parse(at) : Date.now();
  const rows = at ? allRows.filter(e => e.paid_at && Date.parse(e.paid_at) <= t) : allRows;
  let spent = 0, paid = 0, tips = 0, last = null;
  for (const e of rows) {
    const amount = Math.abs(e.gross_cents || 0) / 100;
    if (e.source === 'refund' || e.source === 'chargeback') { spent -= amount; continue; }
    spent += amount;
    if (e.source === 'message') paid++;
    if (e.source === 'tip') tips++;
    if ((e.source === 'message' || e.source === 'tip') && (!last || e.paid_at > last)) last = e.paid_at;
  }
  return { spent: Math.round(spent * 100) / 100, paid_messages: paid, tips, last_purchase: last, standing: standingAt(rows, t, chatSince) };
}

// The part of a chat the writer reads: all of it, or the last 40 messages of a
// long one (the story so far covers the rest); at most the last 3 mass messages.
function windowFor(chat) {
  const realCount = chat.filter(m => !m.mass).length;
  let win = chat;
  if (realCount > LONG_CHAT) {
    let n = 0, i = chat.length;
    while (i > 0 && n < RECENT) { i -= 1; if (!chat[i].mass) n += 1; }
    win = chat.slice(i);
  }
  const massAt = win.map((m, i) => (m.mass ? i : -1)).filter(i => i >= 0);
  const keep = new Set(massAt.slice(-MASS_KEPT));
  return { messages: win.filter((m, i) => !m.mass || keep.has(i)), long: realCount > LONG_CHAT };
}

const fanName = (f) => clean(f?.nickname) || clean(f?.display_name) || clean(f?.handle) || '';
async function fanRow(accountId, fanUuid) {
  const { data } = await supabaseAdmin.from('fanvue_fans').select('fan_uuid, handle, display_name, nickname, is_top_spender, registered_at')
    .eq('account_id', accountId).eq('fan_uuid', fanUuid).maybeSingle();
  return data || { fan_uuid: fanUuid };
}
async function memoryRow(accountId, fanUuid) {
  const { data, error } = await supabaseAdmin.from('ai_fan_memory').select('*').eq('account_id', accountId).eq('fan_uuid', fanUuid).maybeSingle();
  check(error);
  return data;
}

/** The fans who ever wrote, newest first, with how far their memory goes. */
async function fans(orgId, creatorId) {
  const { account } = await pageAccount(orgId, creatorId);
  const [list, people, mem, earn] = await Promise.all([
    supabaseAdmin.rpc('ai_chat_fans', { p_account: account.id }),
    all(() => supabaseAdmin.from('fanvue_fans').select('fan_uuid, handle, display_name, nickname, is_top_spender').eq('account_id', account.id).order('fan_uuid')),
    all(() => supabaseAdmin.from('ai_fan_memory').select('fan_uuid, facts, built_at, edited_at, covered_through').eq('account_id', account.id).order('fan_uuid')),
    all(() => supabaseAdmin.from('fanvue_earnings').select('fan_uuid, source, gross_cents, paid_at').eq('account_id', account.id).order('paid_at').order('transaction_order_id')),
  ]);
  check(list.error);
  const who = Object.fromEntries(people.map(p => [p.fan_uuid, p]));
  const memo = Object.fromEntries(mem.map(m => [m.fan_uuid, m]));
  const money = {};
  for (const e of earn) (money[e.fan_uuid] ||= []).push(e);
  return (list.data || []).map(f => {
    const p = who[f.fan_uuid] || {}, m = memo[f.fan_uuid];
    return {
      fan_uuid: f.fan_uuid, display_name: p.display_name || null, fan_username: p.handle || null, fan_nickname: p.nickname || null,
      top_spender: !!p.is_top_spender, fan_messages: Number(f.fan_messages), her_messages: Number(f.her_messages),
      last_fan_at: f.last_fan_at, last_at: f.last_at, spent: moneyOf(money[f.fan_uuid] || []).spent,
      memory: m ? { facts: (m.facts || []).length, built_at: m.built_at, edited_at: m.edited_at, behind: !m.covered_through || f.last_at > m.covered_through } : null,
    };
  }).sort((a, b) => String(b.last_fan_at).localeCompare(String(a.last_fan_at)));
}

/** One fan: names, memory, money and the latest messages (for the tool's screens). */
async function fanDetail(orgId, creatorId, fanUuid) {
  const { account } = await pageAccount(orgId, creatorId);
  const [person, mem, { chat, money }] = await Promise.all([fanRow(account.id, fanUuid), memoryRow(account.id, fanUuid), loadChat(account.id, fanUuid)]);
  if (!chat.length) throw new AiChatError('No chat with this fan', 404);
  const win = windowFor(chat);             // exactly what the writer reads
  return {
    fan: { fan_uuid: fanUuid, display_name: person.display_name || null, fan_username: person.handle || null, fan_nickname: person.nickname || null, top_spender: !!person.is_top_spender },
    memory: mem ? { facts: (mem.facts || []).map(f => ({ id: f.id, kind: f.kind, note: f.text, locked: !!f.locked })), summary: mem.story || '', built_at: mem.built_at, edited_at: mem.edited_at, covered_through: mem.covered_through } : null,
    money,
    total: chat.filter(m => !m.mass).length,
    long: win.long,
    messages: win.messages.map(m => ({ sent_at: m.at, from_fan: m.from_fan, message: m.text, mass: m.mass, paid: m.paid, tip: m.tip, gif: m.gif, note: mediaNote(m), empty: emptyBody(m) })),
  };
}

const KINDS = new Set(P.FACT_KINDS);
const newId = () => crypto.randomBytes(5).toString('hex');
function cleanFacts(list, { keepIds = false } = {}) {
  return (Array.isArray(list) ? list : []).map(f => ({
    id: keepIds && /^[\w-]{1,24}$/.test(String(f?.id || '')) ? String(f.id) : newId(),
    kind: KINDS.has(f?.kind) ? f.kind : 'about',
    text: clean(f?.text ?? f?.note).slice(0, 200),
    ...(f?.locked ? { locked: true } : {}),
  })).filter(f => f.text);
}

/** A manager's corrections to a fan's memory: { facts: [{ id, kind, note, locked }], summary }. */
async function saveMemory(orgId, creatorId, fanUuid, { facts, summary }) {
  const { account } = await pageAccount(orgId, creatorId);
  const cur = await memoryRow(account.id, fanUuid);
  const now = new Date().toISOString();
  const { error } = await supabaseAdmin.from('ai_fan_memory').upsert({
    account_id: account.id, fan_uuid: fanUuid, organisation_id: orgId,
    facts: cleanFacts(facts, { keepIds: true }).slice(0, 60), story: clean(summary).slice(0, 2000) || null,
    covered_through: cur?.covered_through || null, messages_read: cur?.messages_read || 0, built_at: cur?.built_at || null,
    edited_at: now, updated_at: now,
  }, { onConflict: 'account_id,fan_uuid' });
  check(error);
  return fanDetail(orgId, creatorId, fanUuid);
}

/**
 * Bring a fan's memory up to date from the messages it hasn't read yet (`full`:
 * start again from the whole chat; facts the manager locked stay). Returns
 * { updated, cost }.
 */
async function buildMemory(orgId, creatorId, fanUuid, { full = false } = {}) {
  if (!or.configured()) throw new AiChatError('Add OPENROUTER_API_KEY to the server settings first', 409);
  const { account } = await pageAccount(orgId, creatorId);
  const [persona, person, mem, { chat }] = await Promise.all([
    loadPersona(orgId, creatorId), fanRow(account.id, fanUuid), memoryRow(account.id, fanUuid), loadChat(account.id, fanUuid),
  ]);
  const model = persona?.settings?.writer || or.DEFAULT_WRITER;
  const since = full ? null : mem?.covered_through || null;
  const fresh = chat.filter(m => !m.mass && (!since || m.at > since));
  if (!fresh.length) return { updated: false, cost: 0 };
  let facts = full ? (mem?.facts || []).filter(f => f.locked) : (mem?.facts || []);
  let story = full ? '' : mem?.story || '';
  let cost = 0;
  for (let i = 0; i < fresh.length; i += MEMORY_CHUNK) {
    const res = await or.chat({
      model, maxTokens: 1500, temperature: 0.2, fallbacks: or.backupsFor(model),
      messages: P.memoryPrompt({ name: persona?.profile?.name, fan: { name: fanName(person) }, known: facts, story, chat: fresh.slice(i, i + MEMORY_CHUNK) }),
    });
    cost += res.usage.cost || 0;
    await logUsage(orgId, 'memory', res.model, res.usage, { creatorId, fanUuid });
    const j = P.parseJsonObject(res.text);
    if (!j || !Array.isArray(j.facts)) throw new AiChatError('The AI\'s notes came back unreadable: try again', 502);
    facts = [...facts.filter(f => f.locked), ...cleanFacts(j.facts)].slice(0, 60);
    story = clean(j.story).slice(0, 2000) || story;
  }
  const now = new Date().toISOString();
  const { error } = await supabaseAdmin.from('ai_fan_memory').upsert({
    account_id: account.id, fan_uuid: fanUuid, organisation_id: orgId, facts, story: story || null,
    covered_through: fresh[fresh.length - 1].at, messages_read: (full ? 0 : mem?.messages_read || 0) + fresh.length,
    built_at: now, edited_at: mem?.edited_at || null, updated_at: now,
  }, { onConflict: 'account_id,fan_uuid' });
  check(error);
  return { updated: true, cost };
}

// Memory for every fan who wrote, in the background: one job per page at a time.
const jobs = new Map();
const memoryJob = (creatorId) => jobs.get(creatorId) || null;
async function buildAllMemory(orgId, creatorId) {
  if (jobs.get(creatorId)?.running) return jobs.get(creatorId);
  if (!or.configured()) throw new AiChatError('Add OPENROUTER_API_KEY to the server settings first', 409);
  const todo = (await fans(orgId, creatorId)).filter(f => !f.memory || f.memory.behind);
  const job = { running: true, total: todo.length, done: 0, failed: 0, cost: 0, started_at: new Date().toISOString(), finished_at: null, last_error: null };
  jobs.set(creatorId, job);
  const queue = [...todo];
  const worker = async () => {
    while (queue.length) {
      const f = queue.shift();
      try { job.cost += (await buildMemory(orgId, creatorId, f.fan_uuid)).cost; }
      catch (e) { job.failed += 1; job.last_error = e.message; console.error('[ai-chat] memory:', e.message); }
      finally { job.done += 1; }
    }
  };
  Promise.all([worker(), worker()]).finally(() => { job.running = false; job.finished_at = new Date().toISOString(); });
  return job;
}

// ── Her content (ai_content, database change 041) ─────────────────────────────
const CONTENT_MISSING = 'Run database change 041 (her content) in Supabase first';
const num = (v) => (v == null || v === '' ? null : Number(v));
async function loadContent(orgId, creatorId) {
  const { data, error } = await supabaseAdmin.from('ai_content').select('*').eq('organisation_id', orgId).eq('creator_id', creatorId).order('sort').order('id');
  if (error) {
    if (/ai_content/.test(error.message)) return [];
    throw new Error(error.message);
  }
  const items = data.map(r => ({ ...r, price: Number(r.price), min_price: num(r.min_price), minutes: num(r.minutes) }));
  // what the platform's AI sees in each item's files (its content tags), for exact matching
  const ids = [...new Set(items.flatMap(it => it.asset_ids || []))];
  if (ids.length) {
    const { data: assets } = await supabaseAdmin.from('content_assets').select('id, kind, tags, length_ms').in('id', ids);
    const byId = Object.fromEntries((assets || []).map(a => [a.id, a]));
    for (const it of items) {
      const tags = (it.asset_ids || []).map(id => byId[id]?.tags || {});
      const union = (k) => [...new Set(tags.flatMap(t => t[k] || []))];
      it.seen = { categories: union('categories'), acts: union('acts'), objects: union('objects'), people: union('people'), setting: union('setting'), body: union('body') };
    }
  }
  return items;
}

/** Her content list, each item with how spicy it is, and the choices for the form. */
async function contentList(orgId, creatorId) {
  await pageAccount(orgId, creatorId);
  const { error } = await supabaseAdmin.from('ai_content').select('id').limit(1);
  const items = error ? [] : await loadContent(orgId, creatorId);
  return {
    ready: !error, items: items.map(it => ({ ...it, level: C.levelOf(it), lowest: C.lowest(it) })),
    options: { nudity: C.NUDITY.map(id => ({ id, label: C.NUDITY_LABEL[id] })) },
  };
}

// An item as typed, checked: precise enough for the AI to match and describe truthfully.
function cleanItem(raw = {}) {
  const text = (v, max = 300) => clean(v).slice(0, max);
  const it = {
    title: text(raw.title, 80), kind: ['photos', 'video', 'bundle'].includes(raw.kind) ? raw.kind : 'photos',
    amount: Number.isInteger(Number(raw.amount)) && Number(raw.amount) > 0 ? Math.min(500, Number(raw.amount)) : null,
    minutes: Number(raw.minutes) > 0 ? Math.min(600, Math.round(Number(raw.minutes) * 1000) / 1000) : null,
    nudity: C.NUDITY.includes(raw.nudity) ? raw.nudity : 'dressed',
    focus: text(raw.focus), outfit: text(raw.outfit), setting: text(raw.setting), action: text(raw.action, 400),
    face: raw.face !== false,
    tags: [...new Set((Array.isArray(raw.tags) ? raw.tags : String(raw.tags || '').split(',')).map(t => text(t, 40).toLowerCase()).filter(Boolean))].slice(0, 15),
    description: text(raw.description, 1200), price: Number(raw.price), min_price: num(raw.min_price),
    notes: text(raw.notes, 400), active: raw.active !== false,
  };
  if (!it.title) throw new AiChatError('Give the item a name');
  if (it.description.split(/\s+/).length < 8) throw new AiChatError('Describe exactly what\'s inside (at least a sentence): the AI only offers what\'s described');
  if (!(it.price >= 1 && it.price <= 1000)) throw new AiChatError('Give it a price between $1 and $1,000');
  if (it.min_price != null && !(it.min_price >= 1 && it.min_price <= it.price)) throw new AiChatError('The lowest price must be between $1 and the price');
  const young = personaProblems([it.title, it.description, it.focus, it.outfit, it.setting, it.action, it.tags.join(' ')].join('\n'));
  if (young.length) throw new AiChatError(young[0]);
  return it;
}

/** Add or change an item (`raw.id` = change that one). Returns the list. */
async function saveContent(orgId, creatorId, raw, userId) {
  await pageAccount(orgId, creatorId);
  const it = cleanItem(raw);
  const now = new Date().toISOString();
  const id = Number(raw.id) || null;
  const q = id
    ? supabaseAdmin.from('ai_content').update({ ...it, updated_at: now }).eq('id', id).eq('organisation_id', orgId).eq('creator_id', creatorId)
    : supabaseAdmin.from('ai_content').insert({ ...it, organisation_id: orgId, creator_id: creatorId, sort: Date.now() % 2147483647, created_at: now, updated_at: now });
  const { error } = await q;
  if (error) throw new AiChatError(/ai_content/.test(error.message) ? CONTENT_MISSING : error.message, /ai_content/.test(error.message) ? 409 : 400);
  void userId;
  return contentList(orgId, creatorId);
}

async function deleteContent(orgId, creatorId, id) {
  await pageAccount(orgId, creatorId);
  const { error } = await supabaseAdmin.from('ai_content').delete().eq('id', Number(id)).eq('organisation_id', orgId).eq('creator_id', creatorId);
  if (error) throw new Error(error.message);
  return contentList(orgId, creatorId);
}

// One asset as the set-maker reads it: what Fanvue says is in it, and how it sold.
function assetLine(a) {
  const t = a.tags || {};
  const bits = [
    `[a${a.id}] ${a.kind === 'video' ? `video, ${Math.round((a.length_ms || 0) / 1000)} seconds` : a.kind}`,
    a.locations?.[0]?.folder ? `folder "${a.locations[0].folder}"` : 'no folder',
    a.locations?.[0]?.name ? `named "${a.locations[0].name}"` : null,
    a.sales?.ppv ? `sold ${a.sales.bought} of ${a.sales.ppv} times as a PPV ($${a.sales.low}–$${a.sales.high})` : 'never sold as a PPV',
  ].filter(Boolean).join(' · ');
  const tagBits = [
    t.categories?.length && `categories: ${t.categories.join(', ')}`, t.acts?.length && `acts: ${t.acts.join(', ')}`,
    t.objects?.length && `objects: ${t.objects.join(', ')}`, t.people?.length && `people: ${t.people.join(', ')}`,
    t.setting?.length && `setting: ${t.setting.join(', ')}`, t.position?.length && `position: ${t.position.join(', ')}`,
  ].filter(Boolean).join('; ');
  return `${bits}\n  ${clean(a.description).slice(0, 600)}${tagBits ? `\n  Tags: ${tagBits}` : ''}`;
}

/**
 * Sellable sets made from her vault (her content library): photo sets that belong
 * together, each video on its own, and each vault folder made for sexting kept as
 * an ordered series. Replaces the starter list and earlier suggestions; her own
 * items stay. Returns the content list.
 */
async function suggestContent(orgId, creatorId) {
  if (!or.configured()) throw new AiChatError('Add OPENROUTER_API_KEY to the server settings first', 409);
  await pageAccount(orgId, creatorId);
  const { library } = require('./contentLibrary');
  const lib = await library(orgId, creatorId);
  if (!lib.ready) throw new AiChatError('Run database change 042 (her content library) in Supabase first', 409);
  const assets = lib.assets.filter(a => a.description && a.locations.some(l => l.status !== 'removed') && a.kind !== 'other');
  if (assets.length < 2) throw new AiChatError('Her vault hasn\'t been read yet: it\'s copied with the hourly Fanvue copy');
  const persona = await loadPersona(orgId, creatorId);
  const model = persona?.settings?.writer || or.DEFAULT_WRITER;
  const res = await or.chat({
    model, maxTokens: 16000, temperature: 0.2, fallbacks: or.backupsFor(model),
    messages: [
      { role: 'system', content: 'You organise an adult creator\'s content library on Fanvue (a subscription site for verified adults) into PPVs she can sell in chats. Adult content is allowed. You describe content precisely and only from the descriptions and tags given; never invent anything. She is an adult woman: never call her young.' },
      {
        role: 'user',
        content: `Her content (id in brackets, then what the platform's AI says is in it, and how it sold):\n${assets.map(assetLine).join('\n')}\n\n`
          + 'Make sellable PPV items from it. Reply with compact JSON only (no line breaks or indentation): {"items": [{"assets": ["a12", "a15"], "title": "", "kind": "photos | video | bundle", "nudity": "dressed | lingerie | implied | topless | nude | explicit", "focus": "", "outfit": "", "setting": "", "action": "", "tags": [""], "description": "", "price": 20, "min_price": 16, "series": "", "step": 0, "notes": ""}]}\n'
          + '- Photos: put photos that share the outfit or the scene together, 2 to 5 per set; a photo stands alone only if nothing else is like it. Each video is its own item (kind "video"). Use every asset at most once. Leave out anything she isn\'t in (a room, an object).\n'
          + '- A folder made for sexting (its name says so) becomes ONE ordered series: set "series" to the folder name and give every item in it its own step 1, 2, 3… (no two with the same step), from the most teasing to the most explicit, 2 to 4 photos per step. Other items: series "" and step 0.\n'
          + '- description: exactly what is in it, precise and specific (outfit, what is shown, pose, setting, what happens, how long a video is in seconds), and what is NOT in it when a fan might expect it (no toys, no other people, no nudity…). Two or three plain sentences.\n'
          + '- nudity: the most she shows in it: explicit = sex acts or toys; nude = fully nude; topless; implied = nude but covered; lingerie; dressed.\n'
          + '- price in dollars: from how it sold (what was bought, at what price) and the rule "start low, raise step by step": teasing photo sets $10–20, nude sets $20–35, explicit $30–60, short videos by how explicit they are; a series rises step by step. min_price: about 80% of the price.\n'
          + '- notes: when to offer it (e.g. "a light first offer", "only after he bought something").',
      },
    ],
  });
  await logUsage(orgId, 'profile', res.model, res.usage, { creatorId });
  const j = P.parseJsonObject(res.text);
  const raw = Array.isArray(j?.items) ? j.items : [];
  // only what she is in (not a photo of her room)
  const byRef = new Map(assets.filter(a => !a.tags?.people || a.tags.people.length).map(a => [`a${a.id}`, a]));
  const used = new Set();
  const rows = [];
  for (const [i, it] of raw.entries()) {
    const ids = (Array.isArray(it.assets) ? it.assets : []).map(String).filter(r => byRef.has(r) && !used.has(r));
    if (!ids.length) continue;
    ids.forEach(r => used.add(r));
    const kinds = ids.map(r => byRef.get(r).kind);
    try {
      const item = cleanItem({
        ...it, title: clean(it.title) || clean(it.description).split(/[.:;]/)[0].slice(0, 60),
        kind: kinds.every(k => k === 'video') && ids.length === 1 ? 'video' : kinds.some(k => k === 'video') ? 'bundle' : 'photos',
        amount: kinds.filter(k => k === 'image').length || null,
        minutes: kinds.includes('video') ? Math.round(ids.reduce((s, r) => s + (byRef.get(r).length_ms || 0), 0) / 60) / 1000 : null,
      });
      rows.push({
        ...item, asset_ids: ids.map(r => Number(r.slice(1))), series: clean(it.series) || null, step: clean(it.series) ? Math.max(1, parseInt(it.step, 10) || i + 1) : null,
        source: 'vault', organisation_id: orgId, creator_id: creatorId, sort: i,
      });
    } catch (e) { console.error('[ai-chat] suggested item skipped:', e.message); }
  }
  // a series goes step by step: one item per step, in the order the AI gave (teasing first)
  const series = {};
  for (const r of rows) if (r.series) (series[r.series] ||= []).push(r);
  for (const list_ of Object.values(series)) list_.sort((a, b) => a.step - b.step || a.sort - b.sort).forEach((r, k) => { r.step = k + 1; });
  if (!rows.length) {
    console.error('[ai-chat] sets unusable:', res.finish || '', String(res.text).slice(0, 300), '…', String(res.text).slice(-200));
    throw new AiChatError('The AI\'s sets came back unusable: try again', 502);
  }
  const { error: delError } = await supabaseAdmin.from('ai_content').delete().eq('organisation_id', orgId).eq('creator_id', creatorId).in('source', ['starter', 'vault']);
  if (delError) throw new Error(delError.message);
  const { error } = await supabaseAdmin.from('ai_content').insert(rows);
  if (error) throw new Error(error.message);
  return { ...(await contentList(orgId, creatorId)), made: rows.length, unused: assets.length - used.size, cost: res.usage.cost };
}

/** Add the starter list (an example to change to what she really has). */
async function addStarterContent(orgId, creatorId) {
  await pageAccount(orgId, creatorId);
  const now = new Date().toISOString();
  const { error } = await supabaseAdmin.from('ai_content').insert(C.STARTER.map((it, i) => ({ ...it, source: 'starter', organisation_id: orgId, creator_id: creatorId, sort: i, created_at: now, updated_at: now })));
  if (error) throw new AiChatError(/ai_content/.test(error.message) ? CONTENT_MISSING : error.message, /ai_content/.test(error.message) ? 409 : 400);
  return contentList(orgId, creatorId);
}

// ── A reply ──────────────────────────────────────────────────────────────────
/**
 * Draft her reply in the practice room. `fanUuid` = a real fan (his chat, memory
 * and money) or null for a made-up one (`madeUp` = { name, notes, type }: type =
 * a fan type from ai/chat/fanTypes.js, his background and approach); `test` = the
 * messages typed in the practice room after that ({ from: 'fan' | 'her', text });
 * `models` = 1 to 3 writers to compare. Returns { screen, results, used }.
 */
async function reply(orgId, creatorId, { fanUuid = null, madeUp = null, test = [], models = [], selling = false, followUp = false }) {
  const { account } = await pageAccount(orgId, creatorId);
  const persona = await loadPersona(orgId, creatorId);
  if (!clean(persona?.profile?.name)) throw new AiChatError('Set up her profile first (Her profile)', 409);
  if (!or.configured()) throw new AiChatError('Add OPENROUTER_API_KEY to the server settings first', 409);
  const writers = [...new Set((models.length ? models : [persona.settings?.writer || or.DEFAULT_WRITER]).filter(or.isOffered))].slice(0, 3);
  if (!writers.length) writers.push(or.DEFAULT_WRITER);       // e.g. a writer that's no longer offered

  let chat = [], card = [], story = '', money = null, fan = {}, long = false, type = null;
  if (fanUuid) {
    const [person, mem, loaded] = await Promise.all([fanRow(account.id, fanUuid), memoryRow(account.id, fanUuid), loadChat(account.id, fanUuid)]);
    chat = loaded.chat; money = loaded.money;
    fan = { name: fanName(person) };
    card = mem?.facts || [];
    story = mem?.story || '';
  } else {
    fan = { name: clean(madeUp?.name).slice(0, 60) };
    if (clean(madeUp?.notes)) card = [{ kind: 'about', text: clean(madeUp.notes).slice(0, 500) }];
    // who he is (new subscriber, big spender, time waster…): his payments as Fanvue would show them
    type = fanType(madeUp?.type);
    if (type) money = moneyOf(type.payments, null, type.chatSince);
  }
  // selling (practice): her content list; the PPVs in the practice chat carry their status
  const content = selling ? (await loadContent(orgId, creatorId)).filter(it => it.active) : [];
  const typed = (Array.isArray(test) ? test : []).slice(-40).map((t) => {
    const m = { at: null, from_fan: t?.from === 'fan', text: clean(t?.text).slice(0, 1000), mass: false };
    if (!m.from_fan && t?.ppv && typeof t.ppv === 'object') m.media = practicePpv(t.ppv, content);
    return m;
  }).filter(t => t.text || t.media);
  const convo = [...chat, ...typed];
  let lastHer = -1;
  convo.forEach((m, i) => { if (!m.from_fan && !m.mass) lastHer = i; });
  const latest = convo.slice(lastHer + 1).filter(m => m.from_fan).map(m => m.text).filter(Boolean);
  if (!latest.length && !followUp) throw new AiChatError('There\'s no message from him to answer yet: write one as him first');

  // 1. the safety screen, before any writer sees anything (nothing to screen when she follows up)
  const screen = latest.length ? await screenLatest(orgId, creatorId, fanUuid, latest) : { action: 'continue', reasons: [], notes: [], review: null };
  if (screen.action === 'stop' || screen.action === 'handover') return { screen, results: [], used: null };

  // 2. the briefing, with the Playbook situations that fit this moment
  const win = windowFor(convo);
  long = win.long;
  const recentHer = convo.filter(m => !m.from_fan && !m.mass).slice(-8).map(m => m.text);
  const sell = content.length > 0;
  const { plan, level, library, phase, sales } = await briefing({ orgId, creatorId, fanUuid, persona, chat: win.messages, money, extraIds: type?.situation ? [type.situation] : [], selling: sell });
  const base = {
    profile: persona.profile, fan, card, money, story: long ? story : '', chat: win.messages,
    notes: [type?.approach, ...screen.notes, ...ppvNotes(convo, followUp), ...sellingNotes({ sell, level, ids: plan.ids, content, said: latest.join(' '), aboutLastPpv: asksAboutLastPpv(convo) })].filter(Boolean),
    situations: strategy.situationGuide(plan.ids), library, level, timeZone: persona.settings?.timezone || P.DEFAULT_TZ,
    selling: sell, content: sell ? C.contentText(content) : '', sales,
  };
  // the PPVs already in this practice chat: no repeats, and none while one is unopened
  const offered = convo.filter(m => m.media?.item).map(m => ({ id: Number(String(m.media.item).replace(/^c/i, '')), status: m.media.status }));

  // 3. each writer drafts; every draft is checked, and rewritten once if it breaks a rule
  const speed = persona.settings?.typing || 'normal';
  const emojis = persona.settings?.emojis || 'rarely';
  const results = await Promise.all(writers.map(model => writeOne({
    orgId, creatorId, fanUuid, model, base, latest, recentHer, speed, emojis, sell: sell ? { items: content, offered } : null,
  })));
  return {
    screen, results,
    used: {
      messages: win.messages.length, of: convo.filter(m => !m.mass).length, long, story: long && !!clean(story), facts: card.length, money: !!money,
      situations: plan.ids.map(strategy.situationTitle), examples: library.length, level, fan_type: type?.label || null,
      selling: sell, phase, sales: sales.length, follow_up: !!followUp,
    },
  };
}

// What she should keep in mind about selling right now.
const ASKS_FOR_CONTENT = new Set(['specific_content_request', 'content_not_available', 'asks_whats_in_ppv', 'fan_curious_about_page', 'wants_different_content', 'wants_preview']);
const SEXTING = new Set(['deep_roleplay', 'peak_arousal', 'horny_fast', 'fan_in_bed', 'warmed_up']);
function sellingNotes({ sell, level, ids, content, said = '', aboutLastPpv = false }) {
  if (!sell) return [];
  const out = [];
  // what he asks for, matched against her content in code (Fanvue's tags): she must not guess
  const m = aboutLastPpv ? null : C.matchRequest(said, content);
  if (m) {
    const name = (it) => `[c${it.id}] "${it.title}" (${C.what(it)}, ${C.money(it.price)})`;
    if (m.full.length) out.push(`He asks for ${m.wants.join(' + ')}. You DO have that: ${m.full.slice(0, 4).map(name).join(', ')}. Say yes${level.warm ? ' and offer one of these' : ', and offer it once you\'ve chatted a little more'}.`);
    else out.push(`He asks for ${m.wants.join(' + ')}. You DON'T have that exactly: say so plainly${m.close.length ? `, then offer the closest: ${m.close.map(x => `${name(x.it)} (has ${x.got.join(', ')})`).join(', ')}` : ', and keep chatting'}.`);
  }
  if (!level.warm) return [...out, 'No PPV yet: you are still in the warm-up. Get to know him and build it up first.'];
  if (!m && ids.some(id => ASKS_FOR_CONTENT.has(id))) {
    out.push('He is asking about content. Check your content list: if an item really is what he asks for, offer that one. If none is exactly it, start by saying plainly that you don\'t have that exact one, then offer the closest item and say what it is.');
  }
  const series = [...new Set(content.filter(it => it.series).map(it => it.series))];
  if (series.length && level.his >= 2 && ids.some(id => SEXTING.has(id))) out.push(`He is in the mood to sext: your sexting sequence "${series[0]}" fits, step by step.`);
  return out;
}

// A PPV in the practice chat, as the writer reads it (like a real one from Fanvue).
function practicePpv(p, content) {
  const id = Number(String(p.item || '').replace(/^c/i, ''));
  const it = content.find(x => x.id === id) || {};
  const kind = it.kind || p.kind;
  const amount = Number(it.amount ?? p.amount) || 0;
  return {
    item: `c${id}`, title: clean(it.title || p.title).slice(0, 80), price: Number(p.price) || Number(it.price) || null,
    photos: kind === 'video' ? 0 : kind === 'bundle' ? Math.max(1, amount - 2) : amount || 1, videos: kind === 'video' ? 1 : kind === 'bundle' ? 2 : 0, other: 0,
    status: ['bought', 'not_bought'].includes(p.status) ? p.status : 'pending', speed: p.speed === 'slow' ? 'slow' : 'fast', bought_at: null,
    series: it.series || null, step: it.step || null, next: it.series ? content.find(x => x.series === it.series && x.step === it.step + 1)?.title || null : null,
    inside: it.description ? `${C.what(it)}: ${it.description}` : null,
  };
}

// He asks about a PPV she sent: "what's in it?", "is it nude?", "how long is it?"…
const ASKS_ABOUT_IT = /\b(?:what(?:'s| is)?\s+in\s+(?:it|there|that)|is\s+(?:it|that|this)\b|does\s+(?:it|that)\b|how\s+(?:many|long)|what\s+(?:exactly|kind)|show\s+(?:your\s+)?face)\b/i;

// Whether his latest messages ask about the PPV she sent last (still unopened).
function asksAboutLastPpv(convo) {
  const i = convo.map(m => !!m.media?.item).lastIndexOf(true);
  if (i < 0 || convo[i].media.status !== 'pending' || convo.slice(i + 1).some(m => !m.from_fan && !m.mass)) return false;
  return ASKS_ABOUT_IT.test(convo.slice(i + 1).filter(m => m.from_fan).map(m => m.text).join(' '));
}

// What just happened with her last PPV (practice), and what she should do about it.
function ppvNotes(convo, followUp) {
  const i = convo.map(m => !!m.media?.item).lastIndexOf(true);
  const herAfter = i >= 0 && convo.slice(i + 1).some(m => !m.from_fan && !m.mass);
  const hisAfter = i >= 0 && convo.slice(i + 1).some(m => m.from_fan);
  const p = i >= 0 ? convo[i].media : null;
  const out = [];
  if (p && !herAfter) {
    const name = `"${p.title}"`;
    if (p.status === 'bought') {
      out.push(`He just bought your PPV ${name}${p.speed === 'slow' ? ' after a while' : ' right away'}. React to it: ask what he liked, keep the mood going${p.speed === 'slow' ? '' : ', and while he\'s into it tease the next step'}.`);
      if (p.series) out.push(p.next ? `It was step ${p.step} of your "${p.series}" sexting sequence; the next step is "${p.next}", when he wants more.` : `That was the last step of your "${p.series}" sexting sequence.`);
    }
    else if (p.status === 'not_bought') out.push(`He didn't buy your PPV ${name}. Don't beg or resend it; find out what's in the way, or keep chatting and try something else later.`);
    else if (followUp && !hisAfter) out.push(`He hasn't opened your PPV ${name} and has gone quiet. One light, playful follow-up; no begging, no new PPV.`);
    else if (hisAfter && ASKS_ABOUT_IT.test(convo.slice(i + 1).filter(m => m.from_fan).map(m => m.text).join(' ')) && p.inside) {
      out.push(`He asks about your PPV ${name}. Answer his question first, truthfully and plainly, from what's really in it: ${p.inside} Then you can tease. Don't send another PPV now.`);
    } else out.push(`Your PPV ${name} is still unopened: don't send another one now (you can talk about it, or answer him without offering anything).`);
  }
  if (followUp && !(p && !herAfter)) out.push('He hasn\'t replied for a while. Write one short, light follow-up to get him talking again; don\'t be pushy or needy.');
  if (followUp && p && !herAfter && p.status !== 'pending') out.push('He hasn\'t written anything since: you write first.');
  return out;
}

// The safety screen on his latest message(s); Claude judges the doubtful ones.
async function screenLatest(orgId, creatorId, fanUuid, latest) {
  const screen = { ...screenFan(latest), review: null };
  if (screen.action === 'review') {
    const r = await reviewFan(latest);
    await logUsage(orgId, 'check', CHECK_MODEL, r.usage, { creatorId, fanUuid });
    screen.review = { stop: r.stop, reason: r.reason, declined: !!r.declined, cost: r.usage.cost };
    screen.action = r.stop ? 'stop' : 'continue';
    if (r.stop) screen.reasons = [...screen.reasons, `Claude: ${r.reason}`];
  }
  return screen;
}

// ── The briefing: situations, his level, examples from the agency's good chats ──
// Her replies before this many of her own messages are the warm-up: she follows
// him and doesn't lead (the analysis: a longer warm-up sold far better).
const WARM_UP = 6;
// Situations that say who he is rather than what he's doing.
const WHO_HE_IS = new Set(['new_sub', 'spender', 'returns', 'long_time_follower', 'loyalty_play', 'time_waster']);

/**
 * What one reply needs besides the chat: the Playbook situations and his level and
 * mood (the picker), how sexual her reply may get, and examples from the agency's
 * good chats that fit. `chat` = the messages the writer reads.
 */
async function briefing({ orgId, creatorId, fanUuid, persona, chat, money, extraIds = [], selling = false }) {
  const plan = await pickSituations(orgId, creatorId, fanUuid, chat, money, selling);
  // a situation known for sure (a made-up fan's type) comes first, and the picker's
  // guesses about who he is (new, spender, back after a break…) go
  if (extraIds.length) plan.ids = strategy.readPick({ ids: [...extraIds, ...plan.ids.filter(id => !WHO_HE_IS.has(id))] }, { selling });
  const { his, mood, pulled_back } = plan.mood;
  const warm = chat.filter(m => !m.from_fan && !m.mass).length >= WARM_UP;
  const max = P.maxLevel({ his, heat: persona?.profile?.heat, warm: warm && !pulled_back });
  const level = { his, mood, pulled_back, max };
  let last = chat.length;
  while (last > 0 && chat[last - 1].from_fan) last -= 1;
  const said = chat.slice(last).map(m => m.text).join(' ');               // his latest message(s)
  const library = await libraryExamples(orgId, { ids: plan.ids, his, max, mood, said });
  // selling: which moment it is (making an offer, after a buy, after a no) and examples of it
  let phase = null;
  if (selling) {
    const i = chat.map(m => !!(m.media?.price && !m.from_fan)).lastIndexOf(true);
    const herAfter = i >= 0 && chat.slice(i + 1).some(m => !m.from_fan && !m.mass);
    const status = i >= 0 ? chat[i].media.status || (chat[i].media.bought_at ? 'bought' : 'not_bought') : null;
    if (status && !herAfter) phase = status === 'bought' ? 'after_buy' : 'no_buy';
    else if (warm && his >= 2 && !pulled_back) phase = 'offer';
  }
  const sales = phase ? await sellingExamples(orgId, { phase, ids: plan.ids, his, max, mood, said }) : [];
  return { plan, level: { ...level, warm }, library, phase, sales };
}

/**
 * Selling examples from the agency's chats for this phase: two that worked and one
 * that didn't (offer: bought / not bought; after a buy: bought the next one or
 * not; after a no: sold or kept him / lost him).
 */
const PHASES = {
  offer: { kind: 'offer', good: ['bought_fast', 'bought'], bad: ['not_bought'] },
  after_buy: { kind: 'after_buy', good: ['bought_next', 'no_next_offer'], bad: ['next_not_bought'] },
  no_buy: { kind: 'turning', good: ['sold', 'kept_him'], bad: ['lost'] },
};
async function sellingExamples(orgId, { phase, ids = [], his = 0, max = 0, mood = null, said = '' }) {
  const P_ = PHASES[phase];
  if (!P_) return [];
  const want = new Set(ids);
  const his_ = wordsOf(said);
  const rows = (await libraryRows(orgId)).filter(r => r.kind === P_.kind && Math.abs(r.his_level - his) <= 1 && r.her_level <= Math.min(3, max + 1));
  const overlap = (r) => { let k = 0; for (const w of wordsOf(`${r.him} ${r.moment}`)) if (his_.has(w)) k += 1; return Math.min(4, 2 * k); };
  const score = (r) => overlap(r) + (want.has(r.situation) ? 3 : 0) + (r.his_level === his ? 2 : 0) + (r.mood === mood ? 1 : 0) + Math.random() * 1.5;
  const best = (outcomes, n) => rows.filter(r => outcomes.includes(r.outcome)).map(r => [score(r), r]).sort((a, b) => b[0] - a[0]).slice(0, n).map(([, r]) => r);
  return [...best(P_.good, 2), ...best(P_.bad, 1)].map(r => ({ moment: r.moment, him: r.him, reply: r.reply, outcome: r.outcome, offer_what: r.offer_what }));
}

// The example library (ai_examples, database change 040): real moments from the
// agency's good chats. Kept in memory for a few minutes per organisation.
const libraryCache = new Map();
async function libraryRows(orgId) {
  const hit = libraryCache.get(orgId);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.rows;
  let rows = [];
  try {
    rows = await all(() => supabaseAdmin.from('ai_examples').select('id, kind, outcome, offer_what, dialogue, situation, his_level, her_level, mood, moment, him, reply').eq('organisation_id', orgId).order('id'));
  } catch { rows = []; }                                     // none before database change 040
  libraryCache.set(orgId, { at: Date.now(), rows });
  return rows;
}

/**
 * Up to `n` examples for this moment: near his level, her reply no more sexual
 * than allowed, the same situation and mood where possible, each from a
 * different chat (a little randomness, so she doesn't always see the same ones).
 */
const STOP = new Set('that this with what have your you are just like about when where there they them then than been would could should will your yours mine some much very really also into from over more here only well yeah okay going doing want know think good time today'.split(' '));
const wordsOf = (t) => new Set(String(t || '').toLowerCase().match(/[a-z]{4,}/g)?.filter(w => !STOP.has(w)) || []);
async function libraryExamples(orgId, { ids = [], his = 0, max = 0, mood = null, said = '', n = 4 }) {
  const want = new Set(ids);
  const his_ = wordsOf(said);
  const rows = (await libraryRows(orgId)).filter(r => (r.kind || 'chat') === 'chat' && r.her_level <= max && Math.abs(r.his_level - his) <= 1);
  // the same words as his message (what he talks about) count most, then the situation, his level and mood
  const overlap = (r) => { let k = 0; for (const w of wordsOf(`${r.him} ${r.moment}`)) if (his_.has(w)) k += 1; return Math.min(4, 2 * k); };
  const score = (r) => overlap(r) + (want.has(r.situation) ? 3 : 0) + (r.his_level === his ? 2 : 0) + (r.mood === mood ? 1 : 0) + Math.random() * 1.5;
  const out = [], seen = new Set();
  for (const [, r] of rows.map(r => [score(r), r]).sort((a, b) => b[0] - a[0])) {
    if (seen.has(r.dialogue)) continue;
    seen.add(r.dialogue);
    out.push({ moment: r.moment, him: r.him, reply: r.reply });
    if (out.length >= n) break;
  }
  return out;
}

// Which Playbook situations fit this moment (none if the picker fails: the reply
// still has the game plan).
async function pickSituations(orgId, creatorId, fanUuid, chat, money, selling = false) {
  try {
    const res = await or.chat({ model: PICKER, maxTokens: 160, temperature: 0, fallbacks: or.backupsFor(PICKER), messages: strategy.pickPrompt({ chat, money, selling }) });
    await logUsage(orgId, 'plan', res.model, res.usage, { creatorId, fanUuid });
    const j = P.parseJsonObject(res.text);
    return { ids: strategy.readPick(j, { selling }), mood: strategy.readMood(j), cost: res.usage.cost || 0 };
  } catch (e) {
    console.error('[ai-chat] situations:', e.message);
    return { ids: [], mood: strategy.readMood(null), cost: 0 };
  }
}

async function writeOne({ orgId, creatorId, fanUuid, model, base, latest, recentHer, speed, emojis, sell = null }) {
  const started = Date.now();
  const out = { model, label: or.writerLabel(model), cost: 0 };
  try {
    let retry = null, draft, verdict, problems = [], review = null, first = null, offerProblemSeen = null;
    // one rewrite if a draft breaks a rule; two when only the PPV offer was wrong (wrong item, not truthful)
    let tries = 2;
    for (let attempt = 0; attempt < tries; attempt += 1) {
      const res = await or.chat({ model, maxTokens: 400, temperature: 0.85, messages: P.replyPrompt({ ...base, retry }) });
      out.cost += res.usage.cost || 0;
      await logUsage(orgId, 'reply', res.model, res.usage, { creatorId, fanUuid });
      draft = P.readReply(res.text);
      // a PPV she attached: is it in her list, and allowed right now?
      let offerProblem = null;
      offerProblemSeen = null;
      draft.offer = null;
      if (sell && draft.ppv) {
        const o = C.checkOffer({ ppv: draft.ppv, items: sell.items, offered: sell.offered, level: base.level, warm: base.level?.warm });
        if (o.problem) { offerProblem = o.problem; offerProblemSeen = o.problem; } else draft.offer = o;
      }
      // her habit openers ("hehe", "mmm"): kept only now and then, never twice in a row
      const dropOpener = recentHer.some(r => /^\s*(?:he(?:he)+|m{2,}|hm+)\b/i.test(r)) || Math.random() < 0.6;
      draft.messages = P.tidyMessages(draft.messages, { emojis, maxLevel: base.level?.max ?? 3, dropOpener, recent: recentHer });
      if (draft.handover) return { ...out, status: 'handover', reason: draft.handover, replies: draft.messages.map(m => ({ creator_message: m })), learned: [], ms: Date.now() - started };
      const c = checkReply(draft.messages, { recent: recentHer, chatting: recentHer.length > 0, maxLevel: base.level?.max ?? 3, selling: !!sell, offering: !!draft.offer });
      if (offerProblem) { c.verdict = 'block'; c.problems = [offerProblem, ...c.problems]; }
      // a PPV that passed the code checks: Claude checks it's truthful about what's inside
      if (draft.offer && c.verdict !== 'block') {
        const r = await reviewOffer({ fanTexts: latest, messages: draft.messages, item: { ...draft.offer.item, what: C.what(draft.offer.item), seen: C.seenText(draft.offer.item) } });
        out.cost += r.usage.cost;
        await logUsage(orgId, 'check', CHECK_MODEL, r.usage, { creatorId, fanUuid });
        if (!r.ok) { c.verdict = 'block'; c.problems = [...r.problems.map(x => `Offer: ${x}`), ...c.problems]; }
      }
      verdict = c.verdict; problems = c.problems; review = null;
      if (verdict === 'review') {
        const r = await reviewReply({ fanTexts: latest, messages: draft.messages, flags: c.problems });
        out.cost += r.usage.cost;
        await logUsage(orgId, 'check', CHECK_MODEL, r.usage, { creatorId, fanUuid });
        review = { ok: r.ok, problems: r.problems, declined: !!r.declined };
        verdict = r.ok ? 'ok' : r.declined ? 'person' : 'block';
        problems = r.ok ? [] : r.problems;
      }
      if (verdict === 'block' && attempt === 0 && problems.length && problems.every(x => /^Offer: /.test(x) || x === offerProblemSeen)) tries = 3;
      // last try and only the PPV was wrong: send her text without it, if the text itself is fine
      if (verdict === 'block' && attempt === tries - 1 && draft.ppv && problems.every(x => /^Offer: /.test(x) || x === offerProblemSeen)) {
        const plain = checkReply(draft.messages, { recent: recentHer, chatting: recentHer.length > 0, maxLevel: base.level?.max ?? 3, selling: !!sell, offering: false });
        if (plain.verdict !== 'block') {
          draft.offer = null; verdict = plain.verdict === 'review' ? 'ok' : plain.verdict;
          problems = ['The PPV was left out: it broke a selling rule.'];
        }
      }
      if (verdict !== 'block' || attempt === tries - 1) break;
      first = problems;
      retry = problems.join(' ');
    }
    return {
      ...out,
      status: verdict === 'ok' ? 'ok' : verdict === 'person' ? 'check' : 'blocked',
      replies: draft.messages.map(m => ({ creator_message: m })),
      // the PPV on her last message (only when the reply passed)
      ppv: verdict !== 'block' && draft.offer ? {
        item: `c${draft.offer.item.id}`, price: draft.offer.price, title: draft.offer.item.title, kind: draft.offer.item.kind, amount: draft.offer.item.amount,
        minutes: draft.offer.item.minutes, what: C.what(draft.offer.item), description: draft.offer.item.description,
        series: draft.offer.item.series || null, step: draft.offer.item.step || null, asset_ids: draft.offer.item.asset_ids || [],
      } : null,
      // one message at a time, at her typing speed (never all in the same second)
      timing: typingPlan(draft.messages, { speed, theirText: latest.join(' ') }),
      learned: draft.learned.map(t => ({ note: t })),
      problems, review, retried: !!first, first_problems: first || [], format_ok: draft.format_ok,
      ms: Date.now() - started,
    };
  } catch (e) {
    console.error('[ai-chat] reply:', e.message);
    return { ...out, status: 'error', error: e.message, replies: [], learned: [], ms: Date.now() - started };
  }
}

/** What the AI chat cost: today and the last 30 days, by kind. */
async function usage(orgId) {
  const since = new Date(Date.now() - 30 * 86400_000).toISOString();
  const rows = await all(() => supabaseAdmin.from('ai_usage').select('kind, cost_usd, created_at').eq('organisation_id', orgId).gte('created_at', since).order('id'));
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Amsterdam' });
  const out = { today: 0, days30: 0, by_kind: {}, calls: rows.length };
  for (const r of rows) {
    const c = Number(r.cost_usd) || 0;
    out.days30 += c;
    out.by_kind[r.kind] = (out.by_kind[r.kind] || 0) + c;
    if (new Date(r.created_at).toLocaleDateString('sv-SE', { timeZone: 'Europe/Amsterdam' }) === today) out.today += c;
  }
  out.today = round(out.today, 4); out.days30 = round(out.days30, 4);
  for (const k of Object.keys(out.by_kind)) out.by_kind[k] = round(out.by_kind[k], 4);
  return out;
}

module.exports = {
  AiChatError, NOT_READY, pages, getProfile, saveProfile, draftProfile, generateProfile, fans, fanDetail, saveMemory,
  buildMemory, buildAllMemory, memoryJob, reply, usage, contentList, saveContent, deleteContent, addStarterContent, suggestContent,
  _test: { windowFor, moneyOf, cleanProfile, cleanFacts },
  // for the blind test (utils/aiDuels.js)
  _engine: { pageAccount, loadPersona, windowFor, screenLatest, briefing, pickSituations, libraryExamples, writeOne, logUsage, all, isMass, TEAM_TYPES, mediaFor, chatOf, asOf, moneyOf, loadContent },
};
