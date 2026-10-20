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
const { reviewFan, reviewReply, MODEL: CHECK_MODEL } = require('../ai/chat/review');
const { typingPlan, SPEEDS } = require('../ai/chat/timing');
const strategy = require('../ai/chat/strategy');
const { mediaNote, emptyBody, standingAt } = require('../ai/chat/notes');

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

// ── A reply ──────────────────────────────────────────────────────────────────
/**
 * Draft her reply in the practice room. `fanUuid` = a real fan (his chat, memory
 * and money) or null for a made-up one (`madeUp` = { name, notes }); `test` = the
 * messages typed in the practice room after that ({ from: 'fan' | 'her', text });
 * `models` = 1 to 3 writers to compare. Returns { screen, results, used }.
 */
async function reply(orgId, creatorId, { fanUuid = null, madeUp = null, test = [], models = [] }) {
  const { account } = await pageAccount(orgId, creatorId);
  const persona = await loadPersona(orgId, creatorId);
  if (!clean(persona?.profile?.name)) throw new AiChatError('Set up her profile first (Her profile)', 409);
  if (!or.configured()) throw new AiChatError('Add OPENROUTER_API_KEY to the server settings first', 409);
  const writers = [...new Set((models.length ? models : [persona.settings?.writer || or.DEFAULT_WRITER]).filter(or.isOffered))].slice(0, 3);
  if (!writers.length) writers.push(or.DEFAULT_WRITER);       // e.g. a writer that's no longer offered

  let chat = [], card = [], story = '', money = null, fan = {}, long = false;
  if (fanUuid) {
    const [person, mem, loaded] = await Promise.all([fanRow(account.id, fanUuid), memoryRow(account.id, fanUuid), loadChat(account.id, fanUuid)]);
    chat = loaded.chat; money = loaded.money;
    fan = { name: fanName(person) };
    card = mem?.facts || [];
    story = mem?.story || '';
  } else {
    fan = { name: clean(madeUp?.name).slice(0, 60) };
    if (clean(madeUp?.notes)) card = [{ kind: 'about', text: clean(madeUp.notes).slice(0, 500) }];
  }
  const typed = (Array.isArray(test) ? test : []).slice(-40)
    .map(t => ({ at: null, from_fan: t?.from === 'fan', text: clean(t?.text).slice(0, 1000), mass: false }))
    .filter(t => t.text);
  const convo = [...chat, ...typed];
  let lastHer = -1;
  convo.forEach((m, i) => { if (!m.from_fan && !m.mass) lastHer = i; });
  const latest = convo.slice(lastHer + 1).filter(m => m.from_fan).map(m => m.text).filter(Boolean);
  if (!latest.length) throw new AiChatError('There\'s no message from him to answer yet: write one as him first');

  // 1. the safety screen, before any writer sees anything
  const screen = await screenLatest(orgId, creatorId, fanUuid, latest);
  if (screen.action === 'stop' || screen.action === 'handover') return { screen, results: [], used: null };

  // 2. the briefing, with the Playbook situations that fit this moment
  const win = windowFor(convo);
  long = win.long;
  const recentHer = convo.filter(m => !m.from_fan && !m.mass).slice(-8).map(m => m.text);
  const { plan, level, library } = await briefing({ orgId, creatorId, fanUuid, persona, chat: win.messages, money });
  const base = {
    profile: persona.profile, fan, card, money, story: long ? story : '', chat: win.messages, notes: screen.notes,
    situations: strategy.situationGuide(plan.ids), library, level, timeZone: persona.settings?.timezone || P.DEFAULT_TZ,
  };

  // 3. each writer drafts; every draft is checked, and rewritten once if it breaks a rule
  const speed = persona.settings?.typing || 'normal';
  const emojis = persona.settings?.emojis || 'rarely';
  const results = await Promise.all(writers.map(model => writeOne({ orgId, creatorId, fanUuid, model, base, latest, recentHer, speed, emojis })));
  return {
    screen, results,
    used: {
      messages: win.messages.length, of: convo.filter(m => !m.mass).length, long, story: long && !!clean(story), facts: card.length, money: !!money,
      situations: plan.ids.map(strategy.situationTitle), examples: library.length, level,
    },
  };
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

/**
 * What one reply needs besides the chat: the Playbook situations and his level and
 * mood (the picker), how sexual her reply may get, and examples from the agency's
 * good chats that fit. `chat` = the messages the writer reads.
 */
async function briefing({ orgId, creatorId, fanUuid, persona, chat, money }) {
  const plan = await pickSituations(orgId, creatorId, fanUuid, chat, money);
  const { his, mood, pulled_back } = plan.mood;
  const warm = chat.filter(m => !m.from_fan && !m.mass).length >= WARM_UP;
  const max = P.maxLevel({ his, heat: persona?.profile?.heat, warm: warm && !pulled_back });
  const level = { his, mood, pulled_back, max };
  let last = chat.length;
  while (last > 0 && chat[last - 1].from_fan) last -= 1;
  const said = chat.slice(last).map(m => m.text).join(' ');               // his latest message(s)
  const library = await libraryExamples(orgId, { ids: plan.ids, his, max, mood, said });
  return { plan, level, library };
}

// The example library (ai_examples, database change 040): real moments from the
// agency's good chats. Kept in memory for a few minutes per organisation.
const libraryCache = new Map();
async function libraryRows(orgId) {
  const hit = libraryCache.get(orgId);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.rows;
  let rows = [];
  try {
    rows = await all(() => supabaseAdmin.from('ai_examples').select('id, dialogue, situation, his_level, her_level, mood, moment, him, reply').eq('organisation_id', orgId).order('id'));
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
  const rows = (await libraryRows(orgId)).filter(r => r.her_level <= max && Math.abs(r.his_level - his) <= 1);
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
async function pickSituations(orgId, creatorId, fanUuid, chat, money) {
  try {
    const res = await or.chat({ model: PICKER, maxTokens: 160, temperature: 0, fallbacks: or.backupsFor(PICKER), messages: strategy.pickPrompt({ chat, money }) });
    await logUsage(orgId, 'plan', res.model, res.usage, { creatorId, fanUuid });
    const j = P.parseJsonObject(res.text);
    return { ids: strategy.readPick(j), mood: strategy.readMood(j), cost: res.usage.cost || 0 };
  } catch (e) {
    console.error('[ai-chat] situations:', e.message);
    return { ids: [], mood: strategy.readMood(null), cost: 0 };
  }
}

async function writeOne({ orgId, creatorId, fanUuid, model, base, latest, recentHer, speed, emojis }) {
  const started = Date.now();
  const out = { model, label: or.writerLabel(model), cost: 0 };
  try {
    let retry = null, draft, verdict, problems = [], review = null, first = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const res = await or.chat({ model, maxTokens: 400, temperature: 0.85, messages: P.replyPrompt({ ...base, retry }) });
      out.cost += res.usage.cost || 0;
      await logUsage(orgId, 'reply', res.model, res.usage, { creatorId, fanUuid });
      draft = P.readReply(res.text);
      // her habit openers ("hehe", "mmm"): kept only now and then, never twice in a row
      const dropOpener = recentHer.some(r => /^\s*(?:he(?:he)+|m{2,}|hm+)\b/i.test(r)) || Math.random() < 0.6;
      draft.messages = P.tidyMessages(draft.messages, { emojis, maxLevel: base.level?.max ?? 3, dropOpener });
      if (draft.handover) return { ...out, status: 'handover', reason: draft.handover, replies: draft.messages.map(m => ({ creator_message: m })), learned: [], ms: Date.now() - started };
      const c = checkReply(draft.messages, { recent: recentHer, chatting: recentHer.length > 0, maxLevel: base.level?.max ?? 3 });
      verdict = c.verdict; problems = c.problems; review = null;
      if (verdict === 'review') {
        const r = await reviewReply({ fanTexts: latest, messages: draft.messages, flags: c.problems });
        out.cost += r.usage.cost;
        await logUsage(orgId, 'check', CHECK_MODEL, r.usage, { creatorId, fanUuid });
        review = { ok: r.ok, problems: r.problems, declined: !!r.declined };
        verdict = r.ok ? 'ok' : r.declined ? 'person' : 'block';
        problems = r.ok ? [] : r.problems;
      }
      if (verdict !== 'block' || attempt === 1) break;
      first = problems;
      retry = problems.join(' ');
    }
    return {
      ...out,
      status: verdict === 'ok' ? 'ok' : verdict === 'person' ? 'check' : 'blocked',
      replies: draft.messages.map(m => ({ creator_message: m })),
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
  buildMemory, buildAllMemory, memoryJob, reply, usage,
  _test: { windowFor, moneyOf, cleanProfile, cleanFacts },
  // for the blind test (utils/aiDuels.js)
  _engine: { pageAccount, loadPersona, windowFor, screenLatest, briefing, pickSituations, libraryExamples, writeOne, logUsage, all, isMass, TEAM_TYPES, mediaFor, chatOf, asOf, moneyOf },
};
