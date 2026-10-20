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
const fv = require('../integrations/fanvue');
const V = require('../ai/chat/vision');
const Sv = require('../ai/chat/services');
const { screenFan, checkReply, personaProblems, replyLevel, questionsIn, STORY_MOVE } = require('../ai/chat/safety');
const P = require('../ai/chat/prompts');
const { reviewFan, reviewReply, reviewOffer, coachCheck, MODEL: CHECK_MODEL } = require('../ai/chat/review');
const { RULES } = require('../ai/chat/rules');
const { typingPlan, SPEEDS } = require('../ai/chat/timing');
const strategy = require('../ai/chat/strategy');
const { mediaNote, emptyBody, standingAt } = require('../ai/chat/notes');
const { FAN_TYPES, fanType } = require('../ai/chat/fanTypes');
const C = require('../ai/chat/content');
const T = require('../ai/chat/trace');
const Plan = require('../ai/chat/plan');
const Mem = require('../ai/chat/memory');
const S = require('../ai/chat/session');

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
  let rows = [], notes = [];
  try {
    rows = await all(() => {
      const q = supabaseAdmin.from('fanvue_media').select('fan_uuid, media_uuid, message_uuid, media_type, from_fan, price_cents, purchased_at').eq('account_id', accountId);
      return (fanUuid ? q.eq('fan_uuid', fanUuid) : q).order('fan_uuid').order('media_uuid');
    });
  } catch { return {}; }
  // what his photos and videos showed, once looked at (ai/chat/vision.js, database change 047)
  try {
    notes = await all(() => {
      const q = supabaseAdmin.from('ai_media_notes').select('media_uuid, media_type, kind, sexual, flagged, description, details, failed').eq('account_id', accountId);
      return (fanUuid ? q.eq('fan_uuid', fanUuid) : q).order('fan_uuid').order('media_uuid');
    });
  } catch { notes = []; }
  const seenBy = Object.fromEntries(notes.map(n => [n.media_uuid, n]));
  const out = {};
  for (const r of rows) {
    if (!r.message_uuid) continue;
    const m = (out[`${r.fan_uuid}|${r.message_uuid}`] ||= { photos: 0, videos: 0, other: 0, price: null, bought_at: null });
    if (r.media_type === 'image') m.photos += 1; else if (r.media_type === 'video') m.videos += 1; else m.other += 1;
    if (r.price_cents) m.price = r.price_cents / 100;
    if (r.purchased_at && (!m.bought_at || r.purchased_at < m.bought_at)) m.bought_at = r.purchased_at;
    if (r.from_fan) {
      const s = seenBy[r.media_uuid];
      if (s) (m.seen ||= []).push({ media_uuid: r.media_uuid, video: r.media_type === 'video', kind: s.kind, sexual: s.sexual, flagged: !!s.flagged, description: s.description || '', details: s.details || [], failed: s.failed || null });
      else (m.unseen ||= []).push({ media_uuid: r.media_uuid, media_type: r.media_type });
    }
  }
  return out;
}

// The link to a fan's file, from what Fanvue sends for a message's media (signed links that expire).
function bestUrl(payload, mediaType) {
  const vs = Array.isArray(payload?.variants) ? payload.variants.filter(v => v?.url) : [];
  if (!vs.length) return payload?.url || null;
  if (mediaType === 'video') return (vs.find(v => v.lengthMs || /video|original|source/i.test(v.variantType || '')) || vs[0]).url;
  return [...vs].filter(v => !v.lengthMs).sort((a, b) => (b.width || 0) - (a.width || 0))[0]?.url || vs[0].url;
}
/**
 * Look at his photos and videos that haven't been seen yet (C1–C3, C6): each file is
 * fetched through Fanvue's link, described once, and only the description is kept
 * (ai_media_notes); the file is deleted. At most `max` at a time, the newest first.
 * The messages get their `seen` filled in. Returns how many were looked at.
 */
async function describeFanMedia(orgId, creatorId, accountId, fanUuid, chat, { max = 6 } = {}) {
  const todo = chat.filter(m => m.from_fan && m.media?.unseen?.length).flatMap(m => m.media.unseen.map(u => ({ ...u, message_uuid: m.uuid, m }))).slice(-max);
  for (const u of todo) {
    let d;
    try {
      const r = await fv.request(accountId, `/v1/chats/${fanUuid}/messages/${u.message_uuid}/media`, { params: { mediaUuids: u.media_uuid } });
      const url = bestUrl(r?.results?.[u.media_uuid], u.media_type);
      d = url ? await V.describeUrl(url, u.media_type === 'video' ? 'video' : 'image') : { failed: true, error: 'No link to the file' };
    } catch (e) { d = { failed: true, error: e.message }; }
    if (d.usage) await logUsage(orgId, 'look', d.model || V.DESCRIBER, d.usage, { creatorId, fanUuid });
    const row = {
      account_id: accountId, media_uuid: u.media_uuid, fan_uuid: fanUuid, message_uuid: u.message_uuid, media_type: u.media_type,
      kind: d.kind || null, sexual: d.sexual || null, flagged: !!d.flagged, description: d.description || null, details: d.details || [],
      failed: d.failed ? String(d.error || 'failed').slice(0, 200) : null, cost_usd: d.usage?.cost ?? null,
    };
    const { error } = await supabaseAdmin.from('ai_media_notes').upsert(row, { onConflict: 'account_id,media_uuid' });
    if (error && !/ai_media_notes/.test(error.message)) console.error('[ai-chat] media note:', error.message);
    (u.m.media.seen ||= []).push({ media_uuid: u.media_uuid, video: u.media_type === 'video', kind: row.kind, sexual: row.sexual, flagged: row.flagged, description: row.description || '', details: row.details, failed: row.failed });
    u.m.media.unseen = u.m.media.unseen.filter(x => x.media_uuid !== u.media_uuid);
  }
  return todo.length;
}
/** A photo or video uploaded in Practice as him: looked at the same way, nothing kept. Returns what the chat will carry. */
async function lookAt(orgId, creatorId, { buffer, mimetype = '', name = '' }) {
  await pageAccount(orgId, creatorId);
  if (!or.configured()) throw new AiChatError('Add OPENROUTER_API_KEY to the server settings first', 409);
  const video = /^video\//.test(mimetype) || /\.(mp4|mov|m4v|webm|avi)$/i.test(name);
  if (!video && !/^image\//.test(mimetype) && !/\.(jpe?g|png|webp|gif|heic)$/i.test(name)) throw new AiChatError('Send a photo or a video');
  const d = await V.describeBuffer(buffer, video ? 'video' : 'image', { name });
  if (d.usage) await logUsage(orgId, 'look', d.model || V.DESCRIBER, d.usage, { creatorId });
  return {
    media: {
      video, kind: d.kind || 'other', sexual: d.sexual || 'none', flagged: !!d.flagged, description: d.description || '', details: d.details || [],
      failed: d.failed ? String(d.error || 'failed').slice(0, 200) : null, frames: d.frames || 0, cost: d.usage?.cost || 0,
    },
  };
}

// A fan's messages as the writer reads them: each with what came with it and,
// for a paid message, when he bought it.
function chatOf(rows, earn, media, fanUuid) {
  const paid = {}, tips = {};
  for (const e of earn) {
    if (e.source === 'message' && e.message_uuid) paid[e.message_uuid] = { amount: (e.gross_cents || 0) / 100, at: e.paid_at };
    if (e.source === 'tip' && e.message_uuid) tips[e.message_uuid] = (tips[e.message_uuid] || 0) + Math.abs(e.gross_cents || 0) / 100;
  }
  return rows.map(m => ({
    uuid: m.uuid, at: m.sent_at, from_fan: m.from_fan, text: m.text || '', type: m.type,
    mass: !m.from_fan && isMass(m.type), tip: m.type === 'TIP' || !!tips[m.uuid], tip_amount: tips[m.uuid] ? Math.round(tips[m.uuid]) : null, gif: !!m.gif,
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
  let spent = 0, paid = 0, tips = 0, last = null, spent90 = 0, msgSpent = 0;
  for (const e of rows) {
    const amount = Math.abs(e.gross_cents || 0) / 100;
    if (e.source === 'refund' || e.source === 'chargeback') { spent -= amount; continue; }
    spent += amount;
    if (e.source === 'message') { paid++; msgSpent += amount; }
    if (e.source === 'tip') tips++;
    if ((e.source === 'message' || e.source === 'tip') && (!last || e.paid_at > last)) last = e.paid_at;
    // what he spent on PPVs and tips in the last 90 days: his tier (plan.js)
    if ((e.source === 'message' || e.source === 'tip') && e.paid_at && t - Date.parse(e.paid_at) <= 90 * 86400_000) spent90 += amount;
  }
  return {
    spent: Math.round(spent * 100) / 100, paid_messages: paid, tips, last_purchase: last, standing: standingAt(rows, t, chatSince),
    spent90: Math.round(spent90 * 100) / 100, msg_spent: Math.round(msgSpent * 100) / 100,
  };
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
  const [person, mem, { chat, money }, persona, pageUsd] = await Promise.all([fanRow(account.id, fanUuid), memoryRow(account.id, fanUuid), loadChat(account.id, fanUuid), loadPersona(orgId, creatorId), pageMonthly(account.id)]);
  if (!chat.length) throw new AiChatError('No chat with this fan', 404);
  const win = windowFor(chat);             // exactly what the writer reads
  // his state from his history (session.js), as the engine would see him if he wrote now
  const timeZone = persona?.settings?.timezone || P.DEFAULT_TZ;
  const talk = Mem.conversation(chat);
  const profile = Plan.fanProfile({ money, chat, pageMonthly: pageUsd, card: mem?.facts || [], bond: mem?.bond || null, from: talk.start });
  const state = S.fanStateOf({ chat, profile, away: talk.away, timeZone });
  return {
    state: { ...state, tier: profile.tier_label, closeness: profile.closeness, plan: S.startSession({ profile, state, away: talk.away }) },
    fan: { fan_uuid: fanUuid, display_name: person.display_name || null, fan_username: person.handle || null, fan_nickname: person.nickname || null, top_spender: !!person.is_top_spender },
    memory: mem ? {
      facts: (mem.facts || []).map(f => ({ id: f.id, kind: f.kind, note: f.text, locked: !!f.locked, said_at: f.said_at || null, on: f.on || null })),
      summary: mem.story || '', bond: mem.bond || null, built_at: mem.built_at, edited_at: mem.edited_at, covered_through: mem.covered_through,
    } : null,
    money,
    total: chat.filter(m => !m.mass).length,
    long: win.long,
    messages: win.messages.map(m => ({ sent_at: m.at, from_fan: m.from_fan, message: m.text, mass: m.mass, paid: m.paid, tip: m.tip, gif: m.gif, note: mediaNote(m), empty: emptyBody(m) })),
  };
}

const KINDS = new Set(P.FACT_KINDS);
const newId = () => crypto.randomBytes(5).toString('hex');
const DATE = /^\d{4}-\d{2}-\d{2}$/;
// A note: { id, kind, text, said_at (when he said it), on (a plan's day, YYYY-MM-DD), locked }.
function cleanFacts(list, { keepIds = false } = {}) {
  return (Array.isArray(list) ? list : []).map((f) => {
    const kind = KINDS.has(f?.kind) ? f.kind : 'about';
    const said = f?.said_at && Number.isFinite(Date.parse(f.said_at)) ? new Date(f.said_at).toISOString() : null;
    const on = kind === 'plan' && DATE.test(String(f?.on || '')) && Number.isFinite(Date.parse(f.on)) ? String(f.on) : null;
    return {
      id: keepIds && /^[\w-]{1,24}$/.test(String(f?.id || '')) ? String(f.id) : newId(),
      kind, text: clean(f?.text ?? f?.note).slice(0, 200),
      ...(said ? { said_at: said } : {}), ...(on ? { on } : {}),
      ...(f?.locked ? { locked: true } : {}),
    };
  }).filter(f => f.text);
}

// Where each note of the memory model's answer came from (memoryPrompt): "K2" = a
// current note (it keeps its id and when he said it), "#12" = a new message (its
// date); otherwise the newest message's date.
function sourced(list, open, part) {
  const last = part[part.length - 1]?.at || new Date().toISOString();
  const seen = new Set();
  return (Array.isArray(list) ? list : []).map((f) => {
    const src = clean(f?.from).toUpperCase();
    const k = /^K(\d+)$/.exec(src), n = /^#?(\d+)$/.exec(src);
    const old = k ? open[Number(k[1]) - 1] : null;
    const msg = !old && n ? part[Number(n[1]) - 1] : null;
    const id = old && !seen.has(old.id) ? old.id : undefined;      // a note split in two keeps its id once
    if (id) seen.add(id);
    return { kind: f?.kind, text: f?.text, on: f?.on, id, said_at: old ? old.said_at || null : msg?.at || last };
  });
}

// A made-up fan's notes as typed in Practice: one per line, comma or semicolon.
// "interview tomorrow" / "had a date yesterday" become plans on that day, so
// "how did it go?" can be tried out.
function madeUpNotes(text, timeZone = P.DEFAULT_TZ, now = new Date()) {
  return clean(text).split(/\n|;|,(?!\d)/).map(clean).filter(Boolean).slice(0, 12).map((t) => {
    if (/^\d{2}$/.test(t)) return { kind: 'about', text: `${t} years old` };        // "34, truck driver…": his age
    const rel = /\b(yesterday|today|tonight|tomorrow)\b/i.exec(t)?.[1]?.toLowerCase();
    if (!rel) return { kind: 'about', text: t.slice(0, 200) };
    const shift = { yesterday: -1, today: 0, tonight: 0, tomorrow: 1 }[rel];
    return { kind: 'plan', text: t.slice(0, 200), on: Mem.dayIn(new Date(now.getTime() + shift * 86400_000), timeZone) };
  });
}

/** A manager's corrections to a fan's memory: { facts: [{ id, kind, note, locked }], summary }. */
async function saveMemory(orgId, creatorId, fanUuid, { facts, summary }) {
  const { account } = await pageAccount(orgId, creatorId);
  const cur = await memoryRow(account.id, fanUuid);
  const now = new Date().toISOString();
  // when he said each thing stays as it was; a note the manager adds counts from now
  const before = new Map((cur?.facts || []).map(f => [f.id, f]));
  const list = (Array.isArray(facts) ? facts : []).map(f => ({ ...f, said_at: f?.said_at || before.get(f?.id)?.said_at || now }));
  const { error } = await supabaseAdmin.from('ai_fan_memory').upsert({
    account_id: account.id, fan_uuid: fanUuid, organisation_id: orgId,
    facts: cleanFacts(list, { keepIds: true }).slice(0, 60), story: clean(summary).slice(0, 2000) || null,
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
  // his newest photos and videos, looked at before the notes are written (C1), a few at a time
  if (fresh.some(m => m.from_fan && m.media?.unseen?.length)) await describeFanMedia(orgId, creatorId, account.id, fanUuid, fresh, { max: 8 });
  if (!fresh.length) return { updated: false, cost: 0 };
  let facts = full ? (mem?.facts || []).filter(f => f.locked) : (mem?.facts || []);
  let story = full ? '' : mem?.story || '';
  let bond = full ? null : mem?.bond || null;             // how he treats her (closeness, Q16)
  const timeZone = persona?.settings?.timezone || P.DEFAULT_TZ;
  let cost = 0;
  for (let i = 0; i < fresh.length; i += MEMORY_CHUNK) {
    const part = fresh.slice(i, i + MEMORY_CHUNK);
    const open = facts.filter(f => !f.locked);               // numbered K1, K2… in the prompt
    const res = await or.chat({
      model, maxTokens: 3000, temperature: 0.2, fallbacks: or.backupsFor(model),
      messages: P.memoryPrompt({ name: persona?.profile?.name, fan: { name: fanName(person) }, known: facts, story, bond, chat: part, timeZone }),
    });
    cost += res.usage.cost || 0;
    await logUsage(orgId, 'memory', res.model, res.usage, { creatorId, fanUuid });
    const j = P.parseJsonObject(res.text);
    if (!j || !Array.isArray(j.facts)) throw new AiChatError('The AI\'s notes came back unreadable: try again', 502);
    facts = [...facts.filter(f => f.locked), ...cleanFacts(sourced(j.facts, open, part), { keepIds: true })].slice(0, 60);
    story = clean(j.story).slice(0, 2000) || story;
    if (Mem.WARMTH.includes(j.warmth)) bond = { warmth: j.warmth, why: clean(j.warmth_why).slice(0, 200), at: new Date().toISOString() };
  }
  const now = new Date().toISOString();
  const { error } = await supabaseAdmin.from('ai_fan_memory').upsert({
    account_id: account.id, fan_uuid: fanUuid, organisation_id: orgId, facts, story: story || null, bond,
    covered_through: fresh[fresh.length - 1].at, messages_read: (full ? 0 : mem?.messages_read || 0) + fresh.length,
    built_at: now, edited_at: mem?.edited_at || null, updated_at: now,
  }, { onConflict: 'account_id,fan_uuid' });
  check(error);
  return { updated: true, cost };
}

/**
 * His notes after a conversation (Q14), run by the hourly Fanvue copy: fans who
 * wrote in the last 7 days, whose chat has been quiet for 30 minutes and whose
 * notes haven't read it yet, the longest waiting first, at most `max` a run. It
 * only reads the copied chats; nothing goes to Fanvue. Returns { fans, updated,
 * failed, cost } (or { skipped }).
 */
async function refreshMemories(accountId, { max = 25 } = {}) {
  if (!or.configured()) return { skipped: 'no OpenRouter key' };
  const { data: acc } = await supabaseAdmin.from('fanvue_accounts').select('id, organisation_id, creator_id').eq('id', accountId).maybeSingle();
  if (!acc?.creator_id) return { skipped: 'not linked to a page' };
  const persona = await loadPersona(acc.organisation_id, acc.creator_id);
  if (!clean(persona?.profile?.name)) return { skipped: 'no profile yet' };
  const now = Date.now();
  const since = new Date(now - 7 * 86400_000).toISOString();
  const quiet = now - 30 * 60_000;
  const [wrote, people, mem] = await Promise.all([
    all(() => supabaseAdmin.from('fanvue_messages').select('fan_uuid, sent_at').eq('account_id', accountId).eq('from_fan', true).gte('sent_at', since).order('sent_at').order('uuid')),
    all(() => supabaseAdmin.from('fanvue_fans').select('fan_uuid, last_message_at').eq('account_id', accountId).gte('last_message_at', since).order('fan_uuid')),
    all(() => supabaseAdmin.from('ai_fan_memory').select('fan_uuid, covered_through').eq('account_id', accountId).order('fan_uuid')),
  ]);
  const lastHis = {};
  for (const m of wrote) if (m.sent_at && (!lastHis[m.fan_uuid] || Date.parse(m.sent_at) > lastHis[m.fan_uuid])) lastHis[m.fan_uuid] = Date.parse(m.sent_at);
  const lastAny = Object.fromEntries(people.map(p => [p.fan_uuid, p.last_message_at ? Date.parse(p.last_message_at) : 0]));
  const covered = Object.fromEntries(mem.map(m => [m.fan_uuid, m.covered_through ? Date.parse(m.covered_through) : 0]));
  const todo = Object.entries(lastHis)
    .filter(([fan, at]) => at > (covered[fan] || 0) && Math.max(at, lastAny[fan] || 0) <= quiet)
    .sort((a, b) => a[1] - b[1]).slice(0, max);
  const out = { fans: todo.length, updated: 0, failed: 0, cost: 0 };
  for (const [fan] of todo) {
    try {
      const r = await buildMemory(acc.organisation_id, acc.creator_id, fan);
      if (r.updated) out.updated += 1;
      out.cost += r.cost;
    } catch (e) { out.failed += 1; console.error('[ai-chat] notes after a chat:', e.message); }
  }
  if (todo.length) console.log('[ai-chat] notes after chats:', JSON.stringify({ ...out, cost: round(out.cost, 4) }));
  return out;
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
  const { connection } = require('./contentLibrary');
  return {
    ready: !error, items: items.map(it => ({ ...it, level: C.levelOf(it), lowest: C.lowest(it) })), connection: await connection(creatorId),
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
          + '- title: plain words for exactly what he will see: what she wears (or topless / nude), where, what she does. Never a fancier or spicier word than the descriptions use: underwear or a crop top is not lingerie, a thong is not nude, hands between her legs is not masturbating, a plush toy is not a toy.\n'
          + '- description: exactly what is in it, precise and specific (outfit, what is shown, pose, setting, what happens, how long a video is in seconds), and what is NOT in it when a fan might expect it (no toys, no other people, no nudity…). Two or three plain sentences. If the photos differ (one nude, one in a thong), say which is which.\n'
          + '- nudity: the most she shows in it. dressed = clothes on (crop tops, shorts, cleavage); lingerie = only underwear or lingerie, nothing bare; implied = nude but her breasts and crotch are covered (hands, a sheet, stickers); topless = breasts bare, bottom covered; nude = fully nude; explicit = sex acts, touching herself, toys, or a man with her.\n'
          + '- tags: only what the descriptions say is there (no "nudes" or "lingerie" on a dressed set).\n'
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
// What the page earned in the last 30 days (small pages halve the spender bars: Q17b), kept a few minutes.
const earned = new Map();
async function pageMonthly(accountId) {
  const hit = earned.get(accountId);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.usd;
  let usd = null;
  try {
    const rows = await all(() => supabaseAdmin.from('fanvue_earnings').select('gross_cents').eq('account_id', accountId).gte('paid_at', new Date(Date.now() - 30 * 86400_000).toISOString()).order('paid_at'));
    usd = Math.round(rows.reduce((s, r) => s + Math.abs(r.gross_cents || 0), 0) / 100);
  } catch { usd = null; }
  earned.set(accountId, { at: Date.now(), usd });
  return usd;
}

/**
 * `whatIf` (Practice): change what's known about him and see how the plan changes:
 * { type (a made-up fan's type), tier, mood, his (0–3), budget: 'used' }. `planOnly`:
 * decide but don't write (no writer is called).
 */
async function reply(orgId, creatorId, { fanUuid = null, madeUp = null, test = [], models = [], selling = false, followUp = false, whatIf = null, planOnly = false, learned = [], session: sentSession = null, outcome = null }) {
  const { account } = await pageAccount(orgId, creatorId);
  // what he did after her previous reply (Practice: as you played him): the outcomes log (B7)
  if (outcome && typeof outcome === 'object' && clean(outcome.happened) && !whatIf && !planOnly) {
    supabaseAdmin.from('ai_outcomes').insert({
      organisation_id: orgId, creator_id: creatorId, fan_uuid: fanUuid, source: 'practice',
      goal: clean(outcome.goal).slice(0, 40) || null, aim: clean(outcome.aim).slice(0, 20) || null, tier: clean(outcome.tier).slice(0, 20) || null,
      closeness: clean(outcome.closeness).slice(0, 20) || null, happened: clean(outcome.happened).slice(0, 20), ppv: outcome.ppv === true,
    }).then(({ error }) => { if (error && !/ai_outcomes/.test(error.message)) console.error('[ai-chat] outcome:', error.message); });
  }
  const persona = await loadPersona(orgId, creatorId);
  if (!clean(persona?.profile?.name)) throw new AiChatError('Set up her profile first (Her profile)', 409);
  if (!or.configured()) throw new AiChatError('Add OPENROUTER_API_KEY to the server settings first', 409);
  const writers = [...new Set((models.length ? models : [persona.settings?.writer || or.DEFAULT_WRITER]).filter(or.isOffered))].slice(0, 3);
  if (!writers.length) writers.push(or.DEFAULT_WRITER);       // e.g. a writer that's no longer offered

  const timeZone = persona.settings?.timezone || P.DEFAULT_TZ;
  let chat = [], card = [], story = '', money = null, fan = {}, long = false, type = null, bond = null;
  if (fanUuid) {
    const [person, mem, loaded] = await Promise.all([fanRow(account.id, fanUuid), memoryRow(account.id, fanUuid), loadChat(account.id, fanUuid)]);
    chat = loaded.chat; money = loaded.money;
    fan = { name: fanName(person) };
    card = mem?.facts || [];
    story = mem?.story || '';
    bond = mem?.bond || null;
  } else {
    fan = { name: clean(madeUp?.name).slice(0, 60) };
    if (clean(madeUp?.notes)) card = madeUpNotes(madeUp.notes, timeZone);
    // who he is (new subscriber, big spender, time waster…): his payments as Fanvue would show them
    type = fanType(whatIf?.type || madeUp?.type);
    if (type) money = moneyOf(type.payments, null, type.chatSince);
  }
  // what she learned about him in this practice chat (from the replies you kept): only for this chat, never saved
  const learnedHere = (Array.isArray(learned) ? learned : []).map(t => clean(typeof t === 'string' ? t : t?.text).slice(0, 200)).filter(Boolean).slice(-20);
  if (learnedHere.length) card = [...card, ...learnedHere.map(text => ({ kind: 'about', text, said_at: new Date().toISOString(), practice: true }))];
  // selling (practice): her content list; the PPVs in the practice chat carry their status
  const content = selling ? (await loadContent(orgId, creatorId)).filter(it => it.active) : [];
  const typed = (Array.isArray(test) ? test : []).slice(-40).map((t) => {
    const m = { at: null, from_fan: t?.from === 'fan', text: clean(t?.text).slice(0, 1000), mass: false };
    if (!m.from_fan && t?.ppv && typeof t.ppv === 'object') m.media = practicePpv(t.ppv, content);
    if (!m.from_fan && t?.scene) m.scene = P.readScene(t.scene);           // her sexting story after that reply
    // a photo or video uploaded as him (lookAt): the chat carries what it showed
    if (m.from_fan && t?.media && typeof t.media === 'object' && (t.media.description || t.media.flagged || t.media.failed)) {
      const seen = {
        video: t.media.video === true, kind: clean(t.media.kind).slice(0, 40) || 'other', sexual: ['none', 'suggestive', 'explicit'].includes(t.media.sexual) ? t.media.sexual : 'none',
        flagged: t.media.flagged === true, description: clean(t.media.description).slice(0, 1500), details: (Array.isArray(t.media.details) ? t.media.details : []).map(clean).filter(Boolean).slice(0, 6),
        failed: t.media.failed ? 'failed' : null,
      };
      m.media = { photos: seen.video ? 0 : 1, videos: seen.video ? 1 : 0, other: 0, price: null, bought_at: null, seen: [seen] };
    }
    // a tip he sent (the practice room plays him): "[tip of $25]"
    if (m.from_fan && Number(t?.tip) > 0) { m.tip = true; m.tip_amount = Math.round(Number(t.tip)); }
    return m;
  }).filter(t => t.text || t.media || t.tip);
  // a real fan's photos and videos not looked at yet, in his latest messages (C1): seen now
  if (fanUuid && chat.slice(-12).some(m => m.from_fan && m.media?.unseen?.length)) await describeFanMedia(orgId, creatorId, account.id, fanUuid, chat.slice(-12));
  const convo = [...chat, ...typed];
  let lastHer = -1;
  convo.forEach((m, i) => { if (!m.from_fan && !m.mass) lastHer = i; });
  const latestMsgs = convo.slice(lastHer + 1).filter(m => m.from_fan);
  const latest = latestMsgs.map(m => m.text).filter(Boolean);
  const latestSeen = latestMsgs.flatMap(m => m.media?.seen || []);        // what his newest photos or videos showed
  const latestTip = latestMsgs.reduce((s, m) => s + (m.tip_amount || 0), 0);
  if (!latest.length && !latestSeen.length && !latestTip && !followUp) throw new AiChatError('There\'s no message from him to answer yet: write one as him first');
  // this conversation: since the last pause of 6 hours or more (memory.js)
  const talk = Mem.conversation(convo);
  if (!fanUuid && type?.away && talk.start === 0 && talk.away == null) talk.away = type.away;   // a made-up fan back after a break
  const now = new Date();
  const herHere = convo.slice(talk.start).filter(m => !m.from_fan && !m.mass).length;   // her messages in this conversation

  // 1. the safety screen, before any writer sees anything (nothing to screen when she follows up)
  const toScreen = [...latest, ...latestSeen.map(s => s.description).filter(Boolean)];
  const screen = latestSeen.some(s => s.flagged)
    ? { action: 'stop', reasons: ['His photo or video may show someone under 18 or something illegal. It was not looked at further; the AI leaves this chat and a person should look (C3).'], notes: [], review: null }
    : toScreen.length ? await screenLatest(orgId, creatorId, fanUuid, toScreen) : { action: 'continue', reasons: [], notes: [], review: null };
  if (screen.action === 'stop' || screen.action === 'handover') return { screen, results: [], used: { trace: [T.safetyStep(screen)] } };

  // 2. the briefing, with the Playbook situations that fit this moment
  const win = windowFor(convo);
  long = win.long;
  const recentHer = convo.filter(m => !m.from_fan && !m.mass).slice(-8).map(m => m.text);
  const sell = content.length > 0;
  // her last PPV in this practice chat: none new while it waits for him (unless he wants something else)
  const waiting = lastPpv(convo);
  const offered = convo.filter(m => m.media?.item).map(m => ({ id: Number(String(m.media.item).replace(/^c/i, '')), status: m.media.status, open: false }));
  if (waiting && offered.length) offered[offered.length - 1].open = waiting.open;
  // who he is, first from his numbers and notes alone (the planner's read comes next), then his state
  // from his history and the plan for this conversation (session.js), kept by the practice room
  const pageUsd = await pageMonthly(account.id);
  const first = Plan.fanProfile({ money, type, chat: convo, ids: [], mood: '', pageMonthly: pageUsd, offered, card, bond, from: talk.start, override: whatIf || {}, now });
  const state = fanUuid ? S.fanStateOf({ chat, profile: first, away: talk.away, timeZone, now }) : S.madeUpState(type, first);
  // her diary: what she has told fans about herself (B9), plus what she said in this practice chat
  const diaryAll = await loadDiary(orgId, creatorId, account.id, persona);
  const newest = sell ? content.filter(it => it.created_at && now.getTime() - Date.parse(it.created_at) <= 14 * 86400_000).sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0] : null;
  let session = S.resumeSession(sentSession) || S.startSession({ profile: first, state, away: talk.away, now, timeZone, newItem: newest?.title || null });
  const diary = [...diaryAll, ...(session.diary_add || []).map(text => ({ text, practice: true }))].slice(-45);
  const rotation = fanUuid ? S.rotationOf(chat.slice(0, talk.start), now.getTime()) : { openers: [], goodbyes: [] };
  // his notes the planner checks his latest message against (a contradiction: she checks with him,
  // Q14): who he is first (where he lives, his job, family), then his plans and likes
  const checkable = ['about', 'plan', 'likes'].flatMap(k => card.filter(f => f.kind === k && clean(f.text))).slice(0, 25);
  const { plan, level, library, phase, sales } = await briefing({ orgId, creatorId, fanUuid, persona, chat: win.messages, money, extraIds: type?.situation ? [type.situation] : [], selling: sell, override: whatIf, notes: checkable.map(f => f.text), warmUp: session.warm_up, herHere });
  // a sad or annoyed mood sticks (B4); no selling for the rest of a conversation he was sad, annoyed or suspicious in (B3)
  const turn = S.nextTurn(session, { read: level.mood, said: latest.join(' '), suspicious: first.suspicious || level.mood === 'suspicious', timeWaster: first.time_waster });
  session = turn.session;
  level.mood = turn.mood;
  // paid requests, refusals and unusual asks (services.js, D1–D9), and what they change in the session
  const services = Sv.servicesOf(persona.settings);
  const lastSeen = [...convo.slice(talk.start)].reverse().flatMap(m => (m.from_fan ? m.media?.seen || [] : [])).find(s => s.description && !s.flagged) || null;
  let request = latest.length || latestSeen.length ? Sv.requestOf(latest.join(' '), { media: latestSeen, services }) : null;
  // she asked what custom content he'd want exactly: his next message is the answer (D8, step 2)
  if (!request && session.custom_asked === 1 && latest.length) request = { kind: 'custom', what: latest.join(' ').slice(0, 120), described: true };
  if (request && services[request.kind]) request.price = Sv.priceFor(request.kind, { services, avgPrice: first.avg_price });
  let requestRow = null;
  const noteRequest = async (kind, text, status) => {
    try {
      const { data } = await supabaseAdmin.from('ai_requests').insert({ organisation_id: orgId, creator_id: creatorId, fan_uuid: fanUuid, source: 'practice', kind, text: clean(text).slice(0, 500), status }).select('id').single();
      return data?.id || null;
    } catch { return null; }
  };
  session = { ...session, pending: session.pending ? { ...session.pending } : null, service: session.service ? { ...session.service } : null, roleplay: session.roleplay ? { ...session.roleplay } : null };
  if (!whatIf) {
    if (request?.kind === 'unknown' && !session.pending) session.pending = { text: latest.join(' ').slice(0, 300), what: request.what, exchanges: 0, state: 'hesitant', terms: '', id: null };
    else if (session.pending?.state === 'hesitant' && latest.length) {
      session.pending.exchanges += 1;
      if (session.pending.exchanges >= 2) { session.pending.state = 'waiting'; if (!planOnly) requestRow = session.pending.id = await noteRequest('service', `${session.pending.what}: ${session.pending.text}`, 'pending'); }
    }
    if (request && services[request.kind] && !session.service) session.service = { kind: request.kind, label: services[request.kind].label, price: request.price, state: 'offered', tip: 0 };
    if (session.service?.state === 'offered' && latestTip > 0) { session.service.tip += latestTip; if (Sv.covers(session.service.tip, session.service.price)) session.service.state = 'paid'; }
    if (session.roleplay?.on && latest.length) session.roleplay.exchanges += 1;
  }
  // an unusual request after her hesitation: the conversation stops until a manager decides (D1)
  if (session.pending?.state === 'waiting') {
    const screenWait = { action: 'wait', reasons: [`He asked for something not in her menu ("${session.pending.what}"). She said nothing more: the conversation waits for your decision, then goes on with your terms (D1).`], notes: [], review: null };
    return { screen: screenWait, results: [], used: { trace: [T.safetyStep(screenWait)], session, request_id: session.pending.id || requestRow } };
  }
  // an explicit photo or video of him counts as explicit, whatever his words were (C4)
  const seenLevel = latestSeen.some(s => s.sexual === 'explicit') ? 3 : latestSeen.some(s => s.sexual === 'suggestive') ? 2 : 0;
  if (seenLevel > level.his) { level.his = seenLevel; level.max = P.maxLevel({ his: level.his, heat: persona.profile?.heat, lead: level.lead, match: level.match }); }
  // why no PPV can go out right now (then she mustn't promise one either)
  let noOffer = !sell ? '' : !level.warm ? `you are still in the warm-up (${herHere} of ${session.warm_up} of your messages this conversation), so get to know him first.`
    : waiting?.open ? `your PPV "${waiting.p.title}" is still unopened: point him to that one instead.` : session.no_sell ? `${session.no_sell}.` : '';
  const voice = { ...voiceFor({ chat: convo, fan, latest, followUp, from: talk.start }), pastOpeners: rotation.openers, pastGoodbyes: rotation.goodbyes };
  // sexting: the story she leads (the practice room keeps its scene), with ideas from the agency's sexting chats
  const scene = [...typed].reverse().find(m => !m.from_fan && m.scene)?.scene || null;
  const sexting = await storyFor({ orgId, level, scene, said: latest.join(' '), content, convo, waiting, sell, noOffer, timeZone });
  const momentNotes = [...ppvNotes(convo, followUp), ...sellingNotes({ sell, level, ids: plan.ids, content, said: latest.join(' '), aboutLastPpv: asksAboutLastPpv(convo) })];

  // 3. the plan: who he is and what this reply should do, decided in code (plan.js)
  const profile = Plan.fanProfile({ money, type, chat: convo, ids: plan.ids, mood: level.mood, pageMonthly: pageUsd, offered, card, bond, from: talk.start, override: whatIf || {}, now });
  const match = sell && !asksAboutLastPpv(convo) ? C.matchRequest(latest.join(' '), content) : null;
  const lastSent = convo.map(m => !!m.media?.item).lastIndexOf(true);
  const gap = lastSent < 0 ? null : convo.slice(lastSent + 1).filter(m => !m.from_fan && !m.mass).length;
  // what memory brings to this reply: a note to bring up (at most once every few days), a
  // plan of his coming up (a goodbye's hook), a note he just contradicted
  const here = convo.slice(talk.start);
  const threeDays = now.getTime() - 3 * 86400_000;
  // what was said lately: her messages of the last 3 days, and both sides of this conversation
  const recent = convo.filter((m, i) => !m.mass && (i >= talk.start || (!m.from_fan && (!m.at || Date.parse(m.at) >= threeDays)))).map(m => m.text);
  const callback = Mem.callbackFor({ card, recent, now, timeZone });
  const hook = Mem.hookFor({ card, now, timeZone });
  const clash = plan.contradicts ? checkable[plan.contradicts - 1] : null;
  const hisBefore = here.slice(0, Math.max(0, here.length - latest.length)).filter(m => m.from_fan).map(m => m.text).join(' ');
  const replyPlan = Plan.planReply({
    level, voice, latest, followUp, sell, noOffer, waiting, match, sexting, profile, ids: plan.ids, card, gap,
    herReplies: herReplies(here).length, away: talk.away,
    lastSexual: convo.slice(Math.max(0, talk.start - 12), talk.start).some(m => m.from_fan && replyLevel(m.text) >= 2),
    byeAgain: Plan.GOODBYE.test(hisBefore), callback, hook, check: clash ? { note: clash.text } : null, session, media: latestSeen, request, services, lastSeen,
  });
  // what this reply settles: a service delivered (a roleplay starts), a manager's decision used
  if (!whatIf) {
    if (replyPlan.goal === 'service_deliver' && session.service) {
      session.service.state = 'delivered';
      if (session.service.kind === 'roleplay') session.roleplay = { on: true, tip: session.service.tip, total: Math.max(session.service.tip, Number(persona.settings?.services?.session_total) || 250), exchanges: 0 };
    }
    if (['request_approved', 'request_refused'].includes(replyPlan.goal)) session.pending = null;
    if (replyPlan.goal === 'custom_content') {
      session.custom_asked = (session.custom_asked || 0) + 1;
      if (session.custom_asked === 2 && !planOnly) await noteRequest('content', latest.join(' '), 'noted');   // missing content, for you (Q38)
    }
  }
  if (replyPlan.event && session.event) session = { ...session, event: { ...session.event, done: true } };   // her moment is used once
  // the plan is enforced: no PPV (nor a promise of one) when it says so, no question when it says so, his length mirrored
  if (sell && !replyPlan.sell.allowed && !noOffer) noOffer = replyPlan.sell.why;
  if (replyPlan.check) voice.noQuestion = '';                 // checking what she remembers is the one question
  if (!replyPlan.ask.allowed && !voice.noQuestion) voice.noQuestion = replyPlan.ask.why;
  voice.length = replyPlan.length.target;
  if (replyPlan.level.max > level.max) level.max = replyPlan.level.max;   // close fans: a little flirting (Q16)
  // your marks from Practice that fit this moment: wording ones go to the writer, all go to Claude's check
  const lessons = lessonsFor(await loadLessons(orgId, creatorId), { said: latest.join(' '), goal: replyPlan.goal });
  const base = {
    profile: persona.profile, fan, card, money, story: long ? story : '', chat: win.messages,
    notes: [type?.approach, ...screen.notes, ...momentNotes].filter(Boolean),
    situations: strategy.situationGuide(plan.ids), library, level, voice, sexting, noOffer, plan: replyPlan, timeZone, now, diary, mood: session.mood_day, media: latestSeen,
    selling: sell, content: sell ? C.contentText(content) : '', sales, lessons: lessons.filter(l => l.kind === 'wording'),
  };
  // the decision map: what was looked at and decided before any writer wrote a word
  const situations = plan.ids.map(strategy.situationTitle);
  const trace = [
    T.safetyStep(latest.length ? screen : null),
    T.himStep({ real: !!fanUuid, fan, type, money, card, story, long, profile, bond, state, now, timeZone }),
    T.sessionStep({ session, state, herHere }),
    T.momentStep({ level, situations, herCount: herHere, warmUp: session.warm_up, phase, waiting, followUp, away: talk.away, herHere: herReplies(here).length, clash: clash?.text || null, media: latestSeen }),
    T.planStep({ level, heat: persona.profile?.heat, voice, sell, noOffer, notes: momentNotes, storyOn: !!sexting?.on, plan: replyPlan }),
    T.storyStep(sexting),
    T.briefingStep({ library, sales, situations, contentCount: content.length, selling: sell, chatCount: win.messages.length, long }),
    T.lessonsStep(lessons),
  ].filter(Boolean);
  if (planOnly) return { screen, results: [], used: { trace, said: latest, follow_up: !!followUp, what_if: whatIf, plan: replyPlan, profile, session, state } };

  // 3. each writer drafts; every draft is checked, and rewritten if it breaks a rule or sounds off
  const speed = persona.settings?.typing || 'normal';
  const emojis = persona.settings?.emojis || 'rarely';
  const results = await Promise.all(writers.map(model => writeOne({
    orgId, creatorId, fanUuid, model, base, latest, recentHer, voice, speed, emojis, sell: sell ? { items: content, offered, lowestShare: session.roleplay?.on ? 0.3 : null } : null,
  })));
  // 4. Claude's watch-only check of each reply (Practice): never blocks or rewrites; kept for a daily score
  await Promise.all(results.map(async (r) => {
    if (!['ok', 'check'].includes(r.status) || !r.replies.length) return;
    try {
      const c = await coachCheck({ profile: persona.profile, fan: profile, card, plan: replyPlan, chat: win.messages, messages: r.replies.map(x => x.creator_message), ppv: r.ppv, rules: RULES, lessons, diary });
      await logUsage(orgId, 'check', CHECK_MODEL, c.usage, { creatorId, fanUuid });
      r.cost += c.usage.cost || 0;
      r.coach = { overall: c.overall, summary: c.summary, points: c.points };
      r.trace = [...(r.trace || []), T.coachStep(r.label, r.coach)];
      supabaseAdmin.from('ai_checks').insert({
        organisation_id: orgId, creator_id: creatorId, writer: r.model, overall: c.overall, points: c.points,
        his: latest.join('\n') || null, her: r.replies.map(x => x.creator_message), goal: replyPlan.goal, cost_usd: c.usage.cost || 0,
      }).then(({ error }) => { if (error && !/ai_checks/.test(error.message)) console.error('[ai-chat] check save:', error.message); });
    } catch (e) { console.error('[ai-chat] coach:', e.message); }
  }));
  return {
    screen, results,
    used: {
      messages: win.messages.length, of: convo.filter(m => !m.mass).length, long, story: long && !!clean(story), facts: card.length, learned: learnedHere.length, money: !!money,
      situations: plan.ids.map(strategy.situationTitle), examples: library.length, level, fan_type: type?.label || null,
      selling: sell, phase, sales: sales.length, follow_up: !!followUp,
      story: sexting ? { stage: sexting.stage, ideas: sexting.ideas.length, moves: sexting.moves?.moves.length || 0, setting: sexting.moves?.where || null, scene: !!sexting.scene } : null,
      trace, said: latest, what_if: whatIf, plan: replyPlan, profile, session, state,
    },
  };
}

// ── Your marks from Practice (database change 044) ─────────────────────────────
// A wrong call or bad wording, marked on a reply's decision map, with what was wrong
// and what she should have done. Kept in memory for a short while per page.
const FEEDBACK_MISSING = 'Run database change 044 (marks on replies) in Supabase first';
const lessonCache = new Map();
async function loadLessons(orgId, creatorId) {
  const key = `${orgId}|${creatorId}`;
  const hit = lessonCache.get(key);
  if (hit && Date.now() - hit.at < 2 * 60_000) return hit.rows;
  let rows = [];
  try {
    const { data, error } = await supabaseAdmin.from('ai_feedback').select('id, kind, step, note, better, his, her, goal, created_at')
      .eq('organisation_id', orgId).eq('creator_id', creatorId).eq('active', true).order('created_at', { ascending: false }).limit(300);
    if (!error) rows = data || [];
  } catch { rows = []; }
  lessonCache.set(key, { at: Date.now(), rows });
  return rows;
}
// The marks that fit this moment: the same goal, or the same words as his message; three of each kind at most.
function lessonsFor(rows, { said = '', goal = '' }) {
  const his_ = wordsOf(said);
  const score = (r) => {
    let k = 0;
    for (const w of wordsOf(r.his)) if (his_.has(w)) k += 1;
    return Math.min(4, 2 * k) + (r.goal && r.goal === goal ? 3 : 0);
  };
  const pick = (kind) => rows.filter(r => r.kind === kind).map(r => [score(r), r]).filter(([s]) => s >= 3).sort((a, b) => b[0] - a[0]).slice(0, 3).map(([, r]) => r);
  return [...pick('wording'), ...pick('decision')];
}

/** Save a mark from Practice: { kind: 'decision' | 'wording', step, note, better, his, her, goal, context }. */
async function saveFeedback(orgId, creatorId, userId, raw = {}) {
  await pageAccount(orgId, creatorId);
  const text = (v, n) => clean(v).slice(0, n);
  const row = {
    organisation_id: orgId, creator_id: creatorId, created_by: userId ? String(userId) : null,
    kind: raw.kind === 'wording' ? 'wording' : 'decision', step: text(raw.step, 40) || null,
    note: text(raw.note, 1000), better: text(raw.better, 1000) || null, his: text(raw.his, 2000) || null,
    her: (Array.isArray(raw.her) ? raw.her : []).map(x => text(x, 1000)).filter(Boolean).slice(0, 5),
    goal: text(raw.goal, 40) || null, context: raw.context && typeof raw.context === 'object' ? raw.context : {},
  };
  if (!row.note) throw new AiChatError('Say what was wrong');
  const { data, error } = await supabaseAdmin.from('ai_feedback').insert(row).select('id').single();
  if (error) throw new AiChatError(/ai_feedback/.test(error.message) ? FEEDBACK_MISSING : error.message, /ai_feedback/.test(error.message) ? 409 : 400);
  lessonCache.delete(`${orgId}|${creatorId}`);
  return { id: data.id };
}

/** Your marks, newest first (switched-off ones too). */
async function listFeedback(orgId, creatorId) {
  await pageAccount(orgId, creatorId);
  const { data, error } = await supabaseAdmin.from('ai_feedback').select('*').eq('organisation_id', orgId).eq('creator_id', creatorId).order('created_at', { ascending: false }).limit(500);
  if (error) throw new AiChatError(/ai_feedback/.test(error.message) ? FEEDBACK_MISSING : error.message, 409);
  return { feedback: data };
}

/** Switch a mark on or off for teaching. */
async function setFeedbackActive(orgId, creatorId, id, active) {
  await pageAccount(orgId, creatorId);
  const { error } = await supabaseAdmin.from('ai_feedback').update({ active: !!active }).eq('id', Number(id)).eq('organisation_id', orgId).eq('creator_id', creatorId);
  if (error) throw new Error(error.message);
  lessonCache.delete(`${orgId}|${creatorId}`);
  return listFeedback(orgId, creatorId);
}

// ── Her diary (B9) ───────────────────────────────────────────────────────────
// What she has told fans about herself, from every fan's "her" notes, the same for
// everyone; the profile's own facts first. A fact the manager switched off
// (settings.diary_off) is left out. Kept in memory for a couple of minutes per page.
const diaryCache = new Map();
// "Yuna is 23 years old", "She's 23 years old" and "23 years old" are one fact
const normText = (t) => clean(t).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
  .replace(/^(?:yuna|she|her|i|i m|i am|she s|she is|she has|yuna is|yuna has|yuna s)\s+/u, '').replace(/^(?:is|has|s)\s+/u, '');
async function diaryOf(orgId, creatorId, accountId, persona) {
  const off = new Set((persona?.settings?.diary_off || []).map(normText));
  const own = (persona?.profile?.facts || []).map(clean).filter(Boolean);
  const rows = await all(() => supabaseAdmin.from('ai_fan_memory').select('fan_uuid, facts').eq('account_id', accountId).order('fan_uuid'));
  const seen = new Map(own.map(t => [normText(t), { text: t, said_at: null, fans: 0, profile: true }]));
  for (const r of rows) {
    for (const f of r.facts || []) {
      if (f.kind !== 'her' || !clean(f.text)) continue;
      const k = normText(f.text);
      const hit = seen.get(k);
      if (hit) { hit.fans += 1; if (f.said_at && (!hit.said_at || f.said_at > hit.said_at)) hit.said_at = f.said_at; }
      else seen.set(k, { text: clean(f.text), said_at: f.said_at || null, fans: 1, profile: false });
    }
  }
  const list = [...seen.entries()].map(([k, v]) => ({ ...v, off: off.has(k) }));
  list.sort((a, b) => (b.profile - a.profile) || (b.fans - a.fans) || String(b.said_at || '').localeCompare(String(a.said_at || '')));
  return list;
}
async function loadDiary(orgId, creatorId, accountId, persona) {
  const key = `${orgId}|${creatorId}`;
  const hit = diaryCache.get(key);
  if (hit && Date.now() - hit.at < 2 * 60_000) return hit.list;
  let list = [];
  try { list = (await diaryOf(orgId, creatorId, accountId, persona)).filter(d => !d.off).slice(0, 40); }
  catch (e) { console.error('[ai-chat] diary:', e.message); }
  diaryCache.set(key, { at: Date.now(), list });
  return list;
}
// ── Services and requests (D1–D9) ─────────────────────────────────────────────
/** Her services as set up (on/off, base price) and the roleplay session total. */
async function getServices(orgId, creatorId) {
  await pageAccount(orgId, creatorId);
  const persona = await loadPersona(orgId, creatorId);
  return { services: Sv.servicesOf(persona?.settings), session_total: Number(persona?.settings?.services?.session_total) || 250 };
}
async function saveServices(orgId, creatorId, { services = {}, session_total: total } = {}) {
  await pageAccount(orgId, creatorId);
  const cur = await loadPersona(orgId, creatorId);
  if (!cur) throw new AiChatError('Set up her profile first', 409);
  const next = {};
  for (const k of Sv.KINDS) {
    const s = services?.[k] || {};
    next[k] = { on: s.on !== false, min: Number(s.min) > 0 ? Math.round(Number(s.min)) : Sv.SERVICES[k].min };
  }
  next.session_total = Number(total) > 0 ? Math.round(Number(total)) : 250;
  const { error } = await supabaseAdmin.from('ai_personas').update({ settings: { ...(cur.settings || {}), services: next }, updated_at: new Date().toISOString() }).eq('creator_id', creatorId);
  check(error);
  return getServices(orgId, creatorId);
}
/** Fans' requests a manager decides on (an unusual service) or should know about (missing content). */
async function listRequests(orgId, creatorId) {
  await pageAccount(orgId, creatorId);
  const { data, error } = await supabaseAdmin.from('ai_requests').select('*').eq('organisation_id', orgId).eq('creator_id', creatorId).order('created_at', { ascending: false }).limit(200);
  if (error) throw new AiChatError(/ai_requests/.test(error.message) ? 'Run database change 048 (requests) in Supabase first' : error.message, 409);
  return { requests: data };
}
async function decideRequest(orgId, creatorId, id, { status, terms }) {
  await pageAccount(orgId, creatorId);
  if (!['approved', 'refused', 'noted'].includes(status)) throw new AiChatError('Approve or refuse it');
  const { error } = await supabaseAdmin.from('ai_requests').update({ status, terms: clean(terms).slice(0, 300) || null, decided_at: new Date().toISOString() }).eq('id', Number(id)).eq('organisation_id', orgId).eq('creator_id', creatorId);
  check(error);
  return listRequests(orgId, creatorId);
}

/** Her diary for the tool: every fact with how many fans heard it, and whether it's switched off. */
async function diary(orgId, creatorId) {
  const { account } = await pageAccount(orgId, creatorId);
  const persona = await loadPersona(orgId, creatorId);
  return { facts: await diaryOf(orgId, creatorId, account.id, persona) };
}
/** Switch a fact of her diary off (it doesn't hold any more) or back on. */
async function setDiaryFact(orgId, creatorId, text, off) {
  const { account } = await pageAccount(orgId, creatorId);
  const cur = await loadPersona(orgId, creatorId);
  if (!cur) throw new AiChatError('Set up her profile first', 409);
  const k = normText(text);
  if (!k) throw new AiChatError('Which fact?');
  const list = (cur.settings?.diary_off || []).filter(t => normText(t) !== k);
  if (off) list.push(clean(text).slice(0, 200));
  const { error } = await supabaseAdmin.from('ai_personas').update({ settings: { ...(cur.settings || {}), diary_off: list }, updated_at: new Date().toISOString() }).eq('creator_id', creatorId);
  check(error);
  diaryCache.delete(`${orgId}|${creatorId}`);
  return { facts: await diaryOf(orgId, creatorId, account.id, { ...cur, settings: { ...(cur.settings || {}), diary_off: list } }) };
}

// ── Claude's score (Q49) ─────────────────────────────────────────────────────
// Claude's watch-only checks of Practice replies (ai_checks), added up: a score per
// day (good = 1, okay = ½, weak = 0; declined ones don't count) and the most common
// weak points, each with a few examples. Nothing is sent anywhere.
const CHECK_POINTS = { answers_him: 'Answering him', fits_moment: 'Fitting the moment', notes_facts: 'His notes and her facts', selling: 'Selling', lessons: 'Repeating a marked mistake' };
const scoreOf = (c) => {
  const n = c.good + c.okay + c.weak;
  return n ? Math.round((100 * (c.good + c.okay / 2)) / n) : null;
};
async function checkScore(orgId, creatorId, { days = 7 } = {}) {
  await pageAccount(orgId, creatorId);
  const span = Math.min(30, Math.max(1, Math.round(Number(days) || 7)));
  const persona = await loadPersona(orgId, creatorId);
  const timeZone = persona?.settings?.timezone || P.DEFAULT_TZ;
  const today = Mem.dayIn(new Date(), timeZone);
  // from the start of the first day, in her time zone (a day's margin, then cut by day)
  const since = new Date(Date.parse(today) - span * 86400_000).toISOString();
  let rows;
  try {
    rows = await all(() => supabaseAdmin.from('ai_checks').select('id, writer, overall, points, his, her, goal, cost_usd, created_at')
      .eq('organisation_id', orgId).eq('creator_id', creatorId).gte('created_at', since).order('created_at', { ascending: false }).order('id'));
  } catch (e) {
    if (/ai_checks/.test(e.message)) throw new AiChatError(FEEDBACK_MISSING, 409);
    throw e;
  }
  const first = Mem.dayIn(new Date(Date.parse(today) - (span - 1) * 86400_000 + 12 * 3600_000), timeZone);
  rows = rows.map(r => ({ ...r, day: Mem.dayIn(r.created_at, timeZone) })).filter(r => r.day >= first);
  const blank = () => ({ checked: 0, good: 0, okay: 0, weak: 0, declined: 0 });
  const add = (c, r) => { c.checked += 1; if (c[r.overall] != null) c[r.overall] += 1; };
  const total = { ...blank(), cost: 0 };
  const byDay = new Map(), byGoal = new Map(), weak = new Map();
  for (const r of rows) {
    add(total, r);
    total.cost += Number(r.cost_usd) || 0;
    if (!byDay.has(r.day)) byDay.set(r.day, blank());
    add(byDay.get(r.day), r);
    const g = r.goal || 'unknown';
    if (!byGoal.has(g)) byGoal.set(g, blank());
    add(byGoal.get(g), r);
    for (const [k, v] of Object.entries(r.points || {})) {
      if (v?.verdict !== 'weak' || !CHECK_POINTS[k]) continue;
      if (!weak.has(k)) weak.set(k, { point: k, label: CHECK_POINTS[k], count: 0, examples: [] });
      const w = weak.get(k);
      w.count += 1;
      if (w.examples.length < 3) w.examples.push({ note: clean(v.note), his: clean(r.his).slice(0, 300), her: r.her || [], goal: r.goal, at: r.created_at });
    }
  }
  // what he did after her replies (B7): in Practice, as you played him; live later
  let outs = [];
  try {
    outs = await all(() => supabaseAdmin.from('ai_outcomes').select('goal, happened, ppv, created_at').eq('organisation_id', orgId).eq('creator_id', creatorId).gte('created_at', since).order('created_at', { ascending: false }).order('id'));
  } catch { outs = []; }
  const byGoalOut = new Map();
  for (const r of outs) {
    if (Mem.dayIn(r.created_at, timeZone) < first) continue;
    const g = r.goal || 'unknown';
    if (!byGoalOut.has(g)) byGoalOut.set(g, { goal: g, n: 0, replied: 0, quiet: 0, bought: 0, not_bought: 0, ignored: 0 });
    const o = byGoalOut.get(g);
    o.n += 1;
    if (o[r.happened] != null) o[r.happened] += 1;
  }
  const withScore = (c) => ({ ...c, score: scoreOf(c) });
  return {
    outcomes: [...byGoalOut.values()].sort((a, b) => b.n - a.n),
    days: span, today,
    total: { ...withScore(total), cost: round(total.cost, 4) },
    today_score: withScore(byDay.get(today) || blank()),
    by_day: [...byDay].sort((a, b) => b[0].localeCompare(a[0])).map(([day, c]) => ({ day, ...withScore(c) })),
    weak_points: [...weak.values()].sort((a, b) => b.count - a.count),
    by_goal: [...byGoal].map(([goal, c]) => ({ goal, ...withScore(c) })).sort((a, b) => b.weak - a.weak || b.checked - a.checked),
  };
}

// ── Her sexting story ────────────────────────────────────────────────────────
// He's close, or he finished: where the story goes next.
const PEAK = /\b(?:so\s+close|about\s+to\s+(?:cum|come|finish|bust)|gonna\s+(?:cum|come|bust)|i'?m\s+close|close\s+to\s+(?:cumming|coming)|edging|can'?t\s+hold\s+(?:it|on)|cumming)\b/i;
const FINISHED = /\b(?:i\s+(?:came|finished|busted|just\s+came)|just\s+(?:came|finished|busted)|made\s+me\s+(?:cum|come)|(?:that|this)\s+was\s+(?:amazing|incredible|so\s+good|insane|perfect)|i'?m\s+(?:spent|done\s+now))\b/i;
function storyStage(scene, said) {
  if (FINISHED.test(said)) return { stage: 'after', hint: 'He finished: aftercare now. Be warm and personal, tell him you enjoyed it too; no new PPV unless he asks for more.' };
  if (PEAK.test(said)) return { stage: 'peak', hint: 'He is close: take him over the edge, short and intense, no questions.' };
  const stage = scene?.stage || 'warming';
  if (stage === 'warming' && (scene?.done?.length || 0) >= 2) return { stage: 'building', hint: '' };
  return { stage, hint: '' };
}
// Where she is in the story, as the scene library names it.
const SETTINGS = [['bed', /\bbed|sheets|covers|duvet|blanket|pillow/i], ['shower', /\bshower/i], ['bath', /\bbath|tub\b/i], ['couch', /\bcouch|sofa/i],
  ['mirror', /\bmirror/i], ['kitchen', /\bkitchen/i], ['car', /\bcar\b/i], ['work', /\bwork|office|desk/i], ['gym', /\bgym/i], ['outdoors', /\boutside|beach|park|pool|balcony/i]];
const settingOf = (where) => (SETTINGS.find(([, re]) => re.test(String(where || ''))) || [null])[0];

// Story moves for her sexting stories (ai/chat/scenes.json: 18 home settings, moves
// for each stage, little twists), and which set fits where she is.
const SCENES = require('../ai/chat/scenes.json');
const SCENE_OF = [
  ['after_shower', /\btowel|shower/i], ['bath', /\bbath|tub\b/i], ['couch_movie', /\bcouch|sofa|movie|tv\b/i], ['trying_on', /\blingerie|trying\s+on/i],
  ['getting_ready', /\bmirror|getting\s+ready/i], ['after_gym', /\bgym|sports\s+bra|leggings/i], ['kitchen', /\bkitchen/i], ['desk', /\bdesk|office|laptop|work/i],
  ['rainy_day', /\brain/i], ['balcony', /\bbalcony/i], ['hotel', /\bhotel/i], ['oil', /\boil\b/i], ['stretching', /\byoga|stretch/i],
];
function sceneSet(where, hour) {
  const hit = SCENE_OF.find(([, re]) => re.test(String(where || '')));
  if (hit) return hit[0];
  if (/\bbed|sheets|covers|duvet|bedroom/i.test(String(where || ''))) return hour >= 5 && hour < 12 ? 'bed_morning' : 'bed_night';
  // no place yet: one that fits her time of day
  const fits = hour >= 5 && hour < 12 ? ['bed_morning', 'after_shower', 'kitchen'] : hour < 18 ? ['couch_movie', 'after_gym', 'rainy_day', 'trying_on'] : ['bed_night', 'after_shower', 'bath', 'couch_movie', 'cant_sleep'];
  return fits[Math.floor(Math.random() * fits.length)];
}
const pickSome = (list, n) => [...list].sort(() => Math.random() - 0.5).slice(0, n);
const sharesWords = (a, b) => { const w = wordsOf(b); return [...wordsOf(a)].filter(x => w.has(x)).length >= 2; };
// Three moves for this stage she hasn't used yet; the way to start when there's no
// scene; now and then a twist while it builds up.
function storyMoves({ scene, stage, hour }) {
  const key = sceneSet(scene?.where, hour);
  const set = SCENES[key];
  if (!set) return null;
  const done = scene?.done || [];
  const fresh = (set.moves[stage] || []).filter(m => !done.some(d => sharesWords(m, d)));
  return {
    where: set.where, start: scene ? [] : pickSome(set.opener, 2), moves: pickSome(fresh, 3),
    twist: stage === 'building' && Math.random() < 0.2 ? pickSome(set.twists, 1)[0] || '' : '',
  };
}

// Her sexting sequence in this story: where it was shot (to set the scene there,
// so its PPVs fit) and its next step (to lead the story to it).
function storySeed(content, convo) {
  const series = content.filter(it => it.series).sort((a, b) => a.step - b.step);
  if (!series.length) return { seed: '', next: '' };
  const sent = convo.filter(m => m.media?.item && m.media.series);
  const name = sent.length ? sent[sent.length - 1].media.series : series[0].series;
  const steps = series.filter(it => it.series === name);
  const bought = sent.filter(m => m.media.series === name && m.media.status === 'bought').map(m => m.media.step);
  const next = steps.find(it => it.step === (bought.length ? Math.max(...bought) : 0) + 1);
  const first = steps[0];
  const shot = [first.setting && `in ${first.setting}`, first.outfit && `wearing ${first.outfit}`].filter(Boolean).join(', ');
  return {
    seed: shot ? `set where your sexting sequence "${name}" was shot (${shot}), so its PPVs fit the story` : '',
    next: next ? `Next in "${name}": step ${next.step}, [c${next.id}] "${next.title}" (${C.what(next)}, ${C.money(next.price)}). Inside: ${next.description} Lead the story to it, then attach it.` : '',
    shot: first.setting || '',
  };
}

/**
 * Her sexting story for this reply, or null when they aren't sexting: on once he's
 * sexual and she matches or leads him (and while a story is going, unless he pulls
 * back). The scene so far, the stage it's at, her sequence's next step, and three
 * beats from the agency's sexting chats that do something other than her last reply.
 */
async function storyFor({ orgId, level, scene, said, content, convo, waiting, sell, noOffer, timeZone = P.DEFAULT_TZ }) {
  const on = !level.pulled_back && ((level.his >= 2 && (level.lead || level.match)) || (!!scene && level.his >= 1));
  if (!on) return null;
  const { stage, hint } = storyStage(scene, said);
  const { seed, next, shot } = sell ? storySeed(content, convo) : { seed: '', next: '', shot: '' };
  const skip = new Set([scene?.beat, ...(sell && !noOffer ? [] : ['teases_ppv', 'after_ppv'])].filter(Boolean));
  const ideas = await sceneIdeas(orgId, { stage, setting: settingOf(scene?.where || shot), his: level.his, max: level.max, skip, said, n: 2 });
  const hour = Number(new Date().toLocaleString('en-GB', { timeZone, hour: '2-digit', hour12: false })) % 24;
  const moves = storyMoves({ scene: scene || (shot ? { where: shot } : null), stage, hour });
  if (moves && !scene && shot) moves.start = [];               // her sequence says where it starts
  return { on: true, scene, stage, hint, seed, next: waiting?.open || stage === 'after' ? '' : next, ideas, moves };
}

// Beats from the agency's sexting chats (kind 'scene', database change 043) for the
// next step: this stage, her level allowed, where she is in it; each doing something different.
async function sceneIdeas(orgId, { stage, setting = null, his = 0, max = 0, skip = new Set(), said = '', n = 3 }) {
  const his_ = wordsOf(said);
  const rows = (await libraryRows(orgId)).filter(r => r.kind === 'scene' && r.phase === stage && r.her_level <= max && Math.abs(r.his_level - his) <= 1 && !skip.has(r.situation));
  const overlap = (r) => { let k = 0; for (const w of wordsOf(`${r.him} ${r.moment}`)) if (his_.has(w)) k += 1; return Math.min(4, 2 * k); };
  const score = (r) => overlap(r) + (setting && r.setting === setting ? 3 : 0) + (r.his_level === his ? 1 : 0) + Math.random() * 2;
  const out = [], beats = new Set();
  for (const [, r] of rows.map(r => [score(r), r]).sort((a, b) => b[0] - a[0])) {
    if (beats.has(r.situation)) continue;
    beats.add(r.situation);
    out.push({ stage: r.phase, beat: r.situation, setting: r.setting, moment: r.moment, him: r.him, reply: r.reply });
    if (out.length >= n) break;
  }
  return out;
}

// ── How she sounds: her last replies, his name, whether to ask anything ───────
// Her replies in a chat (her messages in a row are one reply; mass messages left
// out), each as one text, oldest first.
function herReplies(chat) {
  const out = [];
  let cur = null;
  for (const m of chat) {
    if (m.mass) continue;
    if (m.from_fan) { cur = null; continue; }
    if (!cur) { cur = []; out.push(cur); }
    if (clean(m.text)) cur.push(clean(m.text));
  }
  return out.map(r => r.join('\n')).filter(Boolean);
}

// His name: the one we know, or one he gave ("I'm mike") that she has called him.
const NOT_NAMES = new Set('alone home here back fine good great ok okay tired horny hard bored busy single married free ready sure sorry new done down up in out at on so just not still really very also from with about into a the gonna going trying looking'.split(' '));
function hisNames(chat, fan = {}) {
  const names = new Set();
  if (clean(fan.name)) names.add(clean(fan.name).split(/\s+/)[0]);
  const hers = chat.filter(m => !m.from_fan && !m.mass).map(m => clean(m.text)).join('\n');
  for (const m of chat.filter(x => x.from_fan)) {
    for (const x of String(m.text || '').matchAll(/\b(?:my name(?:'s| is)|name'?s|call me|i'?m|im|i am|it'?s)\s+([A-Za-z]{2,15})\b/gi)) {
      const w = x[1].charAt(0).toUpperCase() + x[1].slice(1).toLowerCase();
      if (!NOT_NAMES.has(w.toLowerCase()) && new RegExp(`[^.!?\\n]\\s${w}\\b`).test(hers)) names.add(w);
    }
  }
  return [...names];
}

// When her reply shouldn't ask him anything: he said yes or chose, he said what he
// wants, or she has asked a lot lately. '' = one question is fine.
const SAID_YES = /^\W*(?:yes+|yeah+|yep|ya+s*|sure|ok(?:ay)?|of course|absolutely|definitely|why not|both|all of (?:it|them)|all at once|go (?:on|ahead)|do it|please|let'?s go|i do|i am|i'?m in|keep going|more)\b/i;
const WANTS = /\b(?:i\s+(?:want|wanna|need|would\s+love)|i'?d\s+love|wanna|let'?s|show\s+me|send\s+me|give\s+me|surprise\s+me|make\s+me|tell\s+me|keep\s+going|i'?m\s+(?:about\s+to|so\s+close|close\s+to))\b/i;
function noQuestionWhy({ recent = [], latest = [] }) {
  const said = latest.join(' ');
  const lastAsked = recent.length > 0 && recent[recent.length - 1].includes('?');
  if (lastAsked && SAID_YES.test(said) && said.split(/\s+/).length <= 8) return 'he just answered your question: do what he chose or said yes to, don\'t ask again.';
  if (WANTS.test(said)) return 'he told you what he wants: say yes, react or lead.';
  if (recent.slice(-3).filter(r => r.includes('?')).length >= 2) return 'you asked him something in your last replies; this time react, tease or tell him something instead.';
  return '';
}

/**
 * What her reply's voice is checked against (safety.voiceProblems) and told
 * (prompts.replyPrompt): her last replies, his recent words and name, and
 * whether to ask anything. `latest` = his newest messages, `from` = where this
 * conversation starts (the question rule looks at this conversation only: what
 * she asked months ago doesn't count).
 */
function voiceFor({ chat, fan = {}, latest = [], followUp = false, from = 0 }) {
  const recent = herReplies(chat).slice(-6);
  return {
    recent, names: hisNames(chat, fan),
    his: chat.filter(m => m.from_fan).slice(-6).map(m => clean(m.text)).join('\n'),
    noQuestion: followUp ? '' : noQuestionWhy({ recent: herReplies(chat.slice(from)).slice(-6), latest }),
    openers: recent.slice(-4).map(r => r.split(/\s+/).slice(0, 2).join(' ').replace(/[,.!?…]+$/, '')).filter(Boolean),
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
const PPV_STATUSES = ['bought', 'not_bought', 'ignored'];
function practicePpv(p, content) {
  const id = Number(String(p.item || '').replace(/^c/i, ''));
  const it = content.find(x => x.id === id) || {};
  const kind = it.kind || p.kind;
  const amount = Number(it.amount ?? p.amount) || 0;
  return {
    item: `c${id}`, title: clean(it.title || p.title).slice(0, 80), price: Number(p.price) || Number(it.price) || null,
    photos: kind === 'video' ? 0 : kind === 'bundle' ? Math.max(1, amount - 2) : amount || 1, videos: kind === 'video' ? 1 : kind === 'bundle' ? 2 : 0, other: 0,
    status: PPV_STATUSES.includes(p.status) ? p.status : 'pending', speed: p.speed === 'slow' ? 'slow' : 'fast', bought_at: null,
    series: it.series || null, step: it.step || null, next: it.series ? content.find(x => x.series === it.series && x.step === it.step + 1)?.title || null : null,
    inside: it.description ? `${C.what(it)}: ${it.description}` : null,
  };
}

// He asks about a PPV she sent: "what's in it?", "is it nude?", "how long is it?"…
const ASKS_ABOUT_IT = /\b(?:what(?:'s| is)?\s+in\s+(?:it|there|that)|is\s+(?:it|that|this)\b|does\s+(?:it|that)\b|how\s+(?:many|long)|what\s+(?:exactly|kind)|show\s+(?:your\s+)?face)\b/i;
// He wants something other than the PPV waiting for him: "something more interesting", "not that one".
const WANTS_OTHER = /\b(?:something|anything)\s+(?:else|more|better|different|hotter|spicier|naughtier|nastier|dirtier|crazier)\b|\bnot\s+(?:that|this)(?:\s+one)?\b|\bshow\s+me\s+more\b|\bmore\s+(?:interesting|explicit|naked|nude)\b|\bsurprise\s+me\b|\bwhat\s+else\b/i;

/**
 * Her last PPV in a practice chat and what came after it: `herAfter` = her replies
 * since, `hisAfter` = all he wrote since, `hisLatest` = what he wrote since her last
 * reply; `open` = no new PPV until he reacts (unopened, and he doesn't want
 * something else; or he ignores it and she hasn't mentioned it yet). Null if none.
 */
function lastPpv(convo) {
  const i = convo.map(m => !!m.media?.item).lastIndexOf(true);
  if (i < 0) return null;
  const p = convo[i].media;
  const after = convo.slice(i + 1).filter(m => !m.mass);
  const herAfter = herReplies(after).length;
  const hisAfter = after.filter(m => m.from_fan).map(m => clean(m.text)).join(' ');
  let k = after.length;
  while (k > 0 && after[k - 1].from_fan) k -= 1;
  const hisLatest = after.slice(k).map(m => clean(m.text)).join(' ');
  const wantsOther = WANTS_OTHER.test(hisAfter);
  const open = (p.status === 'pending' && !wantsOther) || (p.status === 'ignored' && !herAfter);
  return { i, p, herAfter, hisAfter, hisLatest, wantsOther, open };
}

// Whether his latest messages ask about the PPV she sent last (still unopened).
function asksAboutLastPpv(convo) {
  const s = lastPpv(convo);
  return !!s && ['pending', 'ignored'].includes(s.p.status) && ASKS_ABOUT_IT.test(s.hisLatest);
}

// What just happened with her last PPV (practice), and what she should do about it.
function ppvNotes(convo, followUp) {
  const s = lastPpv(convo);
  const out = [];
  if (s) {
    const { p, herAfter, hisAfter, hisLatest } = s;
    const name = `"${p.title}"`;
    if (p.status === 'bought' && !herAfter) {
      out.push(`He just bought your PPV ${name}${p.speed === 'slow' ? ' after a while' : ' right away'}. React to it: ask what he liked, keep the mood going${p.speed === 'slow' ? '' : ', and while he\'s into it tease the next step'}.`);
      if (p.series) out.push(p.next ? `It was step ${p.step} of your "${p.series}" sexting sequence; the next step is "${p.next}", when he wants more.` : `That was the last step of your "${p.series}" sexting sequence.`);
    } else if (p.status === 'bought' && p.series && p.next) {
      out.push(`Your "${p.series}" sexting sequence goes on with step ${p.step + 1}, "${p.next}", when he wants more.`);
    } else if (p.status === 'not_bought' && !herAfter) {
      out.push(`He didn't buy your PPV ${name}. Don't beg or resend it; find out what's in the way, or keep chatting and try something else later.`);
    } else if (p.status === 'ignored') {
      out.push(herAfter
        ? `He isn't opening your PPV ${name} for now. Don't bring it up again: keep the chat going, and when it fits offer a different item (closer to what he wants, or cheaper).`
        : `He saw your PPV ${name} and hasn't opened it. Mention it once, lightly and playfully (no begging), then keep the chat going.`);
    } else if (p.status === 'pending') {
      if (hisLatest && FINISHED.test(hisLatest)) out.push(`He says he finished. Aftercare first: be warm and personal. Your PPV ${name} can wait; don't push it now.`);
      else if (followUp && !hisAfter) out.push(`He hasn't opened your PPV ${name} and has gone quiet. One light, playful follow-up; no begging, no new PPV.`);
      else if (hisLatest && ASKS_ABOUT_IT.test(hisLatest) && p.inside) out.push(`He asks about your PPV ${name}. Answer his question first, truthfully and plainly, from what's really in it: ${p.inside} Then you can tease. Don't send another PPV now.`);
      else if (s.wantsOther) out.push(`He wants something more than your PPV ${name} (he hasn't opened it). Offer a different item from your list that fits what he wants now: attach it as a PPV, don't just promise it.`);
      else if (hisAfter) {
        out.push(herAfter
          ? `Your PPV ${name} is still unopened. Keep the mood going without pushing it; if he asks for more, remind him once that it's waiting for him. Don't send or promise anything new until he opens it.`
          : `Your PPV ${name} is still unopened. If he wants more, that's where it starts: point him to it playfully, in your own words, and keep the mood going. Don't send or promise anything new until he opens it.`);
      } else out.push(`Your PPV ${name} is still unopened: don't send another one now.`);
    }
  }
  if (followUp && !(s && !s.herAfter)) out.push('He hasn\'t replied for a while. Write one short, light follow-up to get him talking again; don\'t be pushy or needy.');
  if (followUp && s && !s.herAfter && ['bought', 'not_bought'].includes(s.p.status)) out.push('He hasn\'t written anything since: you write first.');
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
// Her messages before this many are the warm-up: no PPV yet, and she follows him
// rather than leads (the analysis: a longer warm-up sold far better).
const WARM_UP = 6;
// Her replies since he got sexual before she matches him (1) and leads (2), even in
// the warm-up: with a direct fan, stalling and asking questions loses him.
const MATCH_AFTER = 1;
const LEAD_AFTER = 2;
// Situations that say who he is rather than what he's doing.
const WHO_HE_IS = new Set(['new_sub', 'spender', 'returns', 'long_time_follower', 'loyalty_play', 'time_waster']);

/**
 * What one reply needs besides the chat: the Playbook situations and his level and
 * mood (the picker), how sexual her reply may get and whether she leads, and
 * examples from the agency's good chats that fit. `chat` = the messages the writer reads.
 */
// `warmUp` = her messages before a PPV may go (the session's floor, by closeness: B3), `herHere` =
// her messages in this conversation (default: the whole window, as the blind test still counts).
async function briefing({ orgId, creatorId, fanUuid, persona, chat, money, extraIds = [], selling = false, override = null, notes = [], warmUp = WARM_UP, herHere = null }) {
  const plan = await pickSituations(orgId, creatorId, fanUuid, chat, money, selling, notes);
  // what if (Practice): his mood or level as you set it, instead of the planner's read
  if (override?.mood && strategy.MOODS.includes(override.mood)) plan.mood.mood = override.mood;
  if (Number.isInteger(override?.his) && override.his >= 0 && override.his <= 3) plan.mood.his = override.his;
  // a situation known for sure (a made-up fan's type) comes first, and the picker's
  // guesses about who he is (new, spender, back after a break…) go
  if (extraIds.length) plan.ids = strategy.readPick({ ids: [...extraIds, ...plan.ids.filter(id => !WHO_HE_IS.has(id))] }, { selling });
  const { his, mood, pulled_back } = plan.mood;
  const warm = (herHere ?? chat.filter(m => !m.from_fan && !m.mass).length) >= warmUp;
  // how many of her replies since he first got sexual (his words, checked in code)
  const hotAt = chat.findIndex(m => m.from_fan && replyLevel(m.text) >= 2);
  const since = hotAt < 0 ? 0 : herReplies(chat.slice(hotAt)).length;
  const hot = his >= 2 && !pulled_back;
  const lead = !pulled_back && (warm || (hot && since >= LEAD_AFTER));
  const match = hot && since >= MATCH_AFTER;
  const max = P.maxLevel({ his, heat: persona?.profile?.heat, lead, match });
  const level = { his, mood, pulled_back, max, lead, match, since };
  let last = chat.length;
  while (last > 0 && chat[last - 1].from_fan) last -= 1;
  const said = chat.slice(last).map(m => m.text).join(' ');               // his latest message(s)
  const library = await libraryExamples(orgId, { ids: plan.ids, his, max, mood, said });
  // selling: which moment it is (making an offer, a PPV waiting for him, after a buy,
  // after a no) and examples of it
  let phase = null;
  if (selling) {
    const i = chat.map(m => !!(m.media?.price && !m.from_fan)).lastIndexOf(true);
    const p = i >= 0 ? chat[i].media : null;
    const status = p ? p.status || (p.bought_at ? 'bought' : 'not_bought') : null;
    const after = i >= 0 ? chat.slice(i + 1).filter(m => !m.mass) : [];
    const herAfter = after.some(m => !m.from_fan);
    const hisAfter = after.filter(m => m.from_fan).map(m => m.text).join(' ');
    if ((status === 'pending' && !WANTS_OTHER.test(hisAfter)) || (status === 'ignored' && !herAfter)) phase = 'waiting';
    else if (['bought', 'not_bought'].includes(status) && !herAfter) phase = status === 'bought' ? 'after_buy' : 'no_buy';
    else if (warm && his >= 2 && !pulled_back) phase = 'offer';
  }
  const sales = phase ? await sellingExamples(orgId, { phase, ids: plan.ids, his, max, mood, said }) : [];
  return { plan, level: { ...level, warm }, library, phase, sales };
}

/**
 * Selling examples from the agency's chats for this phase: two that worked and one
 * that didn't (offer: bought / not bought; after a buy: bought the next one or
 * not; after a no, or while a PPV waits for him: sold or kept him / lost him).
 */
const PHASES = {
  offer: { kind: 'offer', good: ['bought_fast', 'bought'], bad: ['not_bought'] },
  after_buy: { kind: 'after_buy', good: ['bought_next', 'no_next_offer'], bad: ['next_not_bought'] },
  no_buy: { kind: 'turning', good: ['sold', 'kept_him'], bad: ['lost'] },
  waiting: {
    kind: 'turning', good: ['sold', 'kept_him'], bad: ['lost'],
    situations: ['fan_stalling', 'agreed_no_buy', 'quiet_after_ppv', 'ppv_ignored', 'second_ppv_ignored', 'asks_whats_in_ppv', 'wants_preview', 'wants_to_see_before_paying'],
  },
};
async function sellingExamples(orgId, { phase, ids = [], his = 0, max = 0, mood = null, said = '' }) {
  const P_ = PHASES[phase];
  if (!P_) return [];
  const want = new Set(ids);
  const his_ = wordsOf(said);
  let rows = (await libraryRows(orgId)).filter(r => r.kind === P_.kind && r.her_level <= Math.min(3, max + 1));
  const only = P_.situations ? rows.filter(r => P_.situations.includes(r.situation)) : [];
  rows = only.length >= 6 ? only : rows.filter(r => Math.abs(r.his_level - his) <= 1);
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
    rows = await all(() => supabaseAdmin.from('ai_examples').select('id, kind, outcome, offer_what, dialogue, phase, situation, setting, his_level, her_level, mood, moment, him, reply').eq('organisation_id', orgId).order('id'));
  } catch {
    // before database change 043 (no setting column), or 040 (no library at all)
    try { rows = await all(() => supabaseAdmin.from('ai_examples').select('id, kind, outcome, offer_what, dialogue, phase, situation, his_level, her_level, mood, moment, him, reply').eq('organisation_id', orgId).order('id')); } catch { rows = []; }
  }
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
// `notes` = his notes (texts): the planner also says if his latest message contradicts one.
async function pickSituations(orgId, creatorId, fanUuid, chat, money, selling = false, notes = []) {
  try {
    const res = await or.chat({ model: PICKER, maxTokens: 160, temperature: 0, fallbacks: or.backupsFor(PICKER), messages: strategy.pickPrompt({ chat, money, selling, notes }) });
    await logUsage(orgId, 'plan', res.model, res.usage, { creatorId, fanUuid });
    const j = P.parseJsonObject(res.text);
    return { ids: strategy.readPick(j, { selling }), mood: strategy.readMood(j), contradicts: strategy.readContradiction(j, notes), cost: res.usage.cost || 0 };
  } catch (e) {
    console.error('[ai-chat] situations:', e.message);
    return { ids: [], mood: strategy.readMood(null), contradicts: 0, cost: 0 };
  }
}

/**
 * One writer's reply: drafted, tidied in code, checked (rules, then how it
 * sounds), and rewritten with the reasons, up to 3 drafts in all:
 *  - a draft that breaks a rule is rewritten; if only its PPV keeps breaking a
 *    selling rule, the last draft is written without a PPV (and promises none);
 *  - a draft that keeps the rules but sounds off (questions, the same opener or
 *    phrase again, an assistant's words) is rewritten once; then the newest draft
 *    that keeps the rules is shown, with what still sounds off as a note.
 * `voice` = what her voice is checked against (voiceFor).
 */
async function writeOne({ orgId, creatorId, fanUuid, model, base, latest, recentHer, voice = null, speed, emojis, sell = null }) {
  const started = Date.now();
  const out = { model, label: or.writerLabel(model), cost: 0 };
  const recent = voice?.recent || recentHer;
  const maxLevel = base.level?.max ?? 3;
  try {
    let retry = null, noPpv = '', first = null, kept = null, last = null, drafts = 0;
    const steps = [];                                       // each draft, for the decision map
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const ask = retry && noPpv ? `${retry} This time attach no PPV (${noPpv}), and don't promise or tease one either.` : retry;
      const piece = base.plan?.length?.target === 'piece';                    // a paid written piece: more room (D1)
      const res = await or.chat({ model, maxTokens: piece ? 1000 : 400, temperature: 0.85, messages: P.replyPrompt({ ...base, retry: ask }) });
      drafts += 1;
      out.cost += res.usage.cost || 0;
      await logUsage(orgId, 'reply', res.model, res.usage, { creatorId, fanUuid });
      const draft = P.readReply(res.text);
      const raw = [...draft.messages];                        // as the writer wrote it, before the code tidied it
      if (noPpv) draft.ppv = null;
      // a PPV she attached: is it in her list, and allowed right now?
      let offerProblem = null;
      draft.offer = null;
      if (sell && draft.ppv) {
        const o = C.checkOffer({ ppv: draft.ppv, items: sell.items, offered: sell.offered, level: base.level, warm: base.level?.warm, lowestShare: sell.lowestShare || null });
        // the plan says no PPV with this reply (he's sad, suspicious…)
        if (!o.problem && base.plan && !base.plan.sell.allowed) o.problem = `It attached a PPV, but none should go with this reply: ${base.plan.sell.why}`;
        if (o.problem) offerProblem = o.problem; else draft.offer = o;
      }
      // her habit openers, his name said again, an emoji she just used: tidied in code;
      // questions she shouldn't ask turned into statements or left out where that reads well
      draft.messages = P.tidyMessages(draft.messages, { emojis, maxLevel, recent, names: voice?.names || [] });
      if (voice) draft.messages = P.dropSentences(draft.messages, { his: voice.his, noOffer: draft.ppv ? '' : noPpv || base.noOffer || '' });
      const asks = voice ? questionsIn(draft.messages, voice.his) : 0;
      // he sent a photo or video: her reply must pick up something she saw in it (C4, C5)
      const seen = (base.media || []).find(s => s.description && !s.flagged);
      const ignoresMedia = !!seen && !V.reactsTo(draft.messages, seen);
      if (voice && ((voice.noQuestion && asks) || asks > 1)) draft.messages = P.unQuestion(draft.messages, { keep: voice.noQuestion ? 0 : 1, his: voice.his });
      if (draft.handover) {
        steps.push({ raw, final: [...draft.messages], ppv: null, offer: null, problems: [`It asks a person to take over: ${draft.handover}`], style: [], review: null, verdict: 'handover' });
        return { ...out, status: 'handover', reason: draft.handover, replies: draft.messages.map(m => ({ creator_message: m })), learned: [], ms: Date.now() - started, trace: T.writerSteps({ label: out.label, drafts: steps, pick: steps.length - 1, status: 'handover' }) };
      }
      const c = checkReply(draft.messages, {
        recent: recentHer, chatting: recentHer.length > 0, maxLevel, selling: !!sell, offering: !!draft.offer,
        noOffer: draft.offer || draft.ppv ? '' : noPpv || base.noOffer || '', voice, maxChars: piece ? 900 : undefined,
      });
      let verdict = c.verdict, problems = [...c.problems], review = null;
      if (offerProblem) { verdict = 'block'; problems = [offerProblem, ...problems]; }
      // a PPV that passed the code checks: Claude checks it's truthful about what's inside
      if (draft.offer && verdict !== 'block') {
        const r = await reviewOffer({ fanTexts: latest, messages: draft.messages, item: { ...draft.offer.item, what: C.what(draft.offer.item), seen: C.seenText(draft.offer.item) } });
        out.cost += r.usage.cost;
        await logUsage(orgId, 'check', CHECK_MODEL, r.usage, { creatorId, fanUuid });
        if (!r.ok) { verdict = 'block'; problems = [...r.problems.map(x => `Offer: ${x}`), ...problems]; }
      }
      if (verdict === 'review') {
        const r = await reviewReply({ fanTexts: latest, messages: draft.messages, flags: problems });
        out.cost += r.usage.cost;
        await logUsage(orgId, 'check', CHECK_MODEL, r.usage, { creatorId, fanUuid });
        review = { ok: r.ok, problems: r.problems, declined: !!r.declined };
        verdict = r.ok ? 'ok' : r.declined ? 'person' : 'block';
        problems = r.ok ? [] : r.problems;
      }
      const now = { draft, verdict, problems, review, style: [...(c.style || [])], index: attempt };
      if (ignoresMedia) now.style.push(`It doesn't react to what's in his ${seen.video ? 'video' : 'photo'}: say one specific thing you see in it (${(seen.details || []).slice(0, 2).join(', ') || seen.kind}).`);
      // a paid written piece that's too thin for the money (D1)
      if (piece && (draft.messages.join(' ').match(/[\p{L}\p{N}']+/gu) || []).length < 70) now.style.push('It\'s too thin for something he paid for: give him real detail and build-up, 60–120 words a message.');
      // sexting: a reply that doesn't move the story on (stands still, or only reacts)
      // (a PPV sent as part of the story counts as a step, and so does a step the writer names, like "undresses")
      const named = draft.scene?.beat && draft.scene.beat !== 'reacts_to_him';
      if (base.sexting?.on && base.level?.lead && base.sexting.stage !== 'after' && !draft.offer && !named && !STORY_MOVE.test(draft.messages.join(' '))) {
        now.style.push('It doesn\'t move the story on: say what you are doing right now (your next story move), then tease him.');
      }
      // a set much tamer than where the chat is (a dressed set when he's explicit), outside a sexting sequence
      if (draft.offer && !draft.offer.item.series && C.levelOf(draft.offer.item) <= (base.level?.his ?? 0) - 2) {
        now.style.push(`The PPV "${draft.offer.item.title}" is much tamer than where the chat is: offer something closer to what he wants.`);
      }
      steps.push({
        raw, final: [...draft.messages], ppv: draft.ppv ? `${draft.ppv.item} at $${draft.ppv.price ?? '?'}${offerProblem ? `: ${offerProblem}` : ''}` : null,
        offer: draft.offer ? `${draft.offer.item.title}, $${draft.offer.price}` : null, problems, style: now.style, review, verdict,
      });
      last = now;
      if (verdict !== 'block') kept = now;
      if (!first) first = verdict === 'block' ? problems : now.style;
      // done: a draft that keeps the rules and sounds right (or was rewritten once already)
      if (kept && (attempt > 0 || !now.style.length)) break;
      // only the PPV keeps breaking a selling rule: the next draft goes without one
      if (verdict === 'block' && attempt >= 1 && problems.every(x => /^Offer: /.test(x) || x === offerProblem)) {
        noPpv = problems.map(x => x.replace(/^Offer: /, '')).join(' ');
      }
      retry = [...(verdict === 'block' ? problems : []), ...now.style].join(' ');
    }
    const pick = kept || last;
    const { draft } = pick;
    const notes = [...pick.problems];
    // a typo now and then (A8), only on a reply that passed and carries no PPV
    let typo = null;
    if (pick.verdict !== 'block' && !draft.offer && !draft.ppv) {
      const t = P.addTypo(draft.messages);
      draft.messages = t.messages;
      typo = t.typo;
    }
    if (noPpv && pick === kept && !draft.offer) notes.push(`Written again without a PPV: ${noPpv}`);
    const status = pick.verdict === 'ok' ? 'ok' : pick.verdict === 'person' ? 'check' : 'blocked';
    // the PPV on her last message (only when the reply passed)
    const ppv = pick.verdict !== 'block' && draft.offer ? {
      item: `c${draft.offer.item.id}`, price: draft.offer.price, title: draft.offer.item.title, kind: draft.offer.item.kind, amount: draft.offer.item.amount,
      minutes: draft.offer.item.minutes, what: C.what(draft.offer.item), description: draft.offer.item.description,
      series: draft.offer.item.series || null, step: draft.offer.item.step || null, asset_ids: draft.offer.item.asset_ids || [],
    } : null;
    const scene = base.sexting?.on ? draft.scene || base.sexting.scene || null : null;
    return {
      ...out,
      status,
      replies: draft.messages.map(m => ({ creator_message: m })),
      ppv,
      trace: T.writerSteps({ label: out.label, drafts: steps, pick: pick.index, status, ppv, scene, learned: draft.learned, aboutMe: draft.about_me || [], typo, notes: pick.verdict === 'block' ? [] : notes }),
      // one message at a time, at her typing speed (never all in the same second)
      timing: typingPlan(draft.messages, { speed, theirText: latest.join(' ') }),
      learned: draft.learned.map(t => ({ note: t })),
      about_me: draft.about_me || [],
      typo,
      // her sexting story after this reply (the practice room sends it back with the next message)
      scene,
      problems: notes, style: pick.style, review: pick.review, retried: drafts > 1, drafts, first_problems: drafts > 1 ? first || [] : [], format_ok: draft.format_ok,
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
  saveFeedback, listFeedback, setFeedbackActive, refreshMemories, checkScore, diary, setDiaryFact, lookAt, describeFanMedia, getServices, saveServices, listRequests, decideRequest,
  _test: { windowFor, moneyOf, cleanProfile, cleanFacts, sourced, madeUpNotes, herReplies, hisNames, noQuestionWhy, lastPpv, ppvNotes },
  // for the blind test (utils/aiDuels.js)
  _engine: { pageAccount, loadPersona, windowFor, screenLatest, briefing, pickSituations, libraryExamples, writeOne, voiceFor, herReplies, logUsage, all, isMass, TEAM_TYPES, mediaFor, chatOf, asOf, moneyOf, loadContent },
};
