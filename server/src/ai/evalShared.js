const { supabaseAdmin } = require('../utils/supabase');

// Short model keys (from the UI) -> real model IDs.
const MODELS = {
  haiku: 'claude-haiku-4-5',
  sonnet: 'claude-sonnet-4-6',
  opus: 'claude-opus-4-8',
};

function stripTags(s) { return String(s || '').replace(/<[^>]+>/g, '').trim(); }

// Lowercase, drop punctuation/emoji, collapse whitespace — so quote matching
// survives small differences (commas, emoji, smart quotes) between the AI's
// quote and the stored message.
const _norm = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();

// Pull the longest quoted span out of the AI's "detail" text so we can match it
// back to a real message. Handles straight and curly quotes.
function extractQuote(detail) {
  const q = '["\'“”‘’]';
  const re = new RegExp(q + '([^"\'“”‘’]{4,})' + q, 'g');
  const spans = [...String(detail || '').matchAll(re)].map(m => m[1]);
  return spans.sort((a, b) => b.length - a.length)[0] || null;
}

/**
 * Load one chatter's messages for the SELECTED DAY. The messages table links a
 * chatter by NAME (sender_name) — there is no sender_name_id column.
 */
async function loadChatterMessages(orgId, chatterId, reportDate, creatorId = null) {
  const { data: ch } = await supabaseAdmin.from('chatters').select('name').eq('id', chatterId).maybeSingle();
  if (!ch?.name) return { ok: false, reason: 'Chatter not found.' };

  let q = supabaseAdmin
    .from('messages')
    .select('sent_datetime, sent_to_nickname, sent_to_username, fan_message_text, creator_message_text, price, purchased, creator_id')
    .eq('organisation_id', orgId)
    .eq('sender_name', ch.name)
    .eq('sent_date', reportDate)
    .order('sent_datetime', { ascending: true })
    .limit(600);
  if (creatorId) q = q.eq('creator_id', creatorId);
  const { data: msgs } = await q;

  if (!msgs?.length) return { ok: false, reason: 'No messages found for this chatter on this date.' };
  return { ok: true, name: ch.name, msgs };
}

/**
 * Group messages into per-fan conversation blocks for the AI.
 *  - lineCap / threadCap bound the size (and cost).
 *  - withSpend annotates each header with the fan's username + recorded spend,
 *    so a sales review can apply the right roadmap per fan type.
 */
function buildThreadList(msgs, { lineCap = 40, threadCap = 25, withSpend = false, spendByUser = {}, withPage = false, pageNameByCreator = {} } = {}) {
  const threads = {};
  for (const m of msgs) {
    const username = m.sent_to_username || null;
    const key = username || m.sent_to_nickname || 'unknown';
    (threads[key] ||= { fan: m.sent_to_nickname || username || 'unknown', username, creator_id: m.creator_id || null, lines: [] });
    if (!threads[key].creator_id && m.creator_id) threads[key].creator_id = m.creator_id;
    if (m.fan_message_text) threads[key].lines.push(`FAN: ${stripTags(m.fan_message_text)}`);
    if (m.creator_message_text) {
      const tag = (parseFloat(m.price) || 0) > 0 ? ` [PPV $${m.price}${m.purchased ? ' SOLD' : ' not bought'}]` : '';
      threads[key].lines.push(`CHATTER: ${stripTags(m.creator_message_text)}${tag}`);
    }
  }
  const list = Object.values(threads).filter(t => t.lines.length >= 2).slice(0, threadCap);
  const blocks = list.map(t => {
    let header = `--- Conversation with ${t.fan}`;
    if (withSpend && t.username) {
      const sp = spendByUser[t.username];
      header += ` [${t.username}, ${sp ? `spent $${sp}` : 'no recorded spend'}]`;
    }
    // Label which PAGE (creator) this fan is on, so cross-page content differences
    // are never mistaken for a single-page inconsistency.
    if (withPage) {
      const pg = t.creator_id ? (pageNameByCreator[t.creator_id] || `page ${String(t.creator_id).slice(0, 6)}`) : 'unknown page';
      header += ` (page: ${pg})`;
    }
    header += ' ---';
    return `${header}\n${t.lines.slice(0, lineCap).join('\n')}`;
  });
  return { threadList: blocks.join('\n\n'), threadCount: list.length };
}

/**
 * Build the enrichment context for a chatter-day: creator (page) names, per-fan
 * spend, nickname↔username maps, and an enrichIssue() that maps each AI issue
 * back to the real username, page, exact message, time, and other mentioned fans.
 */
// Fuzzy match: the message whose significant words are most contained in the
// issue text. Robust to the AI paraphrasing or quoting with apostrophes/emoji
// (where exact substring matching fails).
const STOP = new Set('the a an and or to of in on at it is im i you your my me he she we they that this for with so but not no do did was were be been are as if then him her u'.split(' '));
function sigTokens(s) { return new Set(String(s || '').split(' ').filter(w => w.length > 2 && !STOP.has(w))); }
function bestOverlap(pool, detailNorm) {
  const dt = sigTokens(detailNorm);
  if (dt.size < 3) return null;
  let best = null, bestShared = 0;
  for (const x of pool) {
    const mt = sigTokens(x.ntext);
    if (mt.size < 3) continue;
    let shared = 0; for (const w of mt) if (dt.has(w)) shared++;
    // most of the message's words appear in the issue, and a solid absolute count
    if (shared >= 4 && shared / mt.size >= 0.5 && shared > bestShared) { bestShared = shared; best = x; }
  }
  return best;
}

async function buildEnrichment(orgId, msgs) {
  const creatorNames = {};
  const creatorInstructions = {};
  try {
    // ai_instructions is optional (migration 016). Try it, but fall back to plain
    // id/name if the column isn't there yet, so page names never go missing.
    let { data: crs, error } = await supabaseAdmin.from('creators').select('id, name, ai_instructions').eq('organisation_id', orgId);
    if (error) ({ data: crs } = await supabaseAdmin.from('creators').select('id, name').eq('organisation_id', orgId));
    (crs || []).forEach(c => { creatorNames[c.id] = c.name; if (c.ai_instructions) creatorInstructions[c.id] = c.ai_instructions; });
  } catch { /* names optional */ }

  // Collision-aware identity maps. Several fans often share a nickname ("Alex" can
  // be 50 different fans), so a nickname only resolves when it's UNambiguous; the
  // AI is prompted to return the exact username from the thread header instead.
  const nickToUsers = {};    // normalized nickname -> Set of usernames
  const nickDisplay = {};    // normalized nickname -> display nickname
  const userToNick = {};     // username -> display nickname
  const userByLower = {};    // lowercased username -> username (exact id lookup)
  const userToCreator = {};  // username -> creator_id (which page the fan is on)
  const msgIndex = [];
  for (const m of msgs) {
    const username = m.sent_to_username || null;
    const nickname = m.sent_to_nickname || username || 'unknown';
    const nl = _norm(nickname);
    if (username) {
      (nickToUsers[nl] ||= new Set()).add(username);
      if (!nickDisplay[nl]) nickDisplay[nl] = nickname;
      if (!userToNick[username]) userToNick[username] = nickname;
      userByLower[username.toLowerCase()] = username;
      if (m.creator_id && !userToCreator[username]) userToCreator[username] = m.creator_id;
    }
    if (m.fan_message_text) msgIndex.push({ username, who: 'fan', text: stripTags(m.fan_message_text), datetime: m.sent_datetime, creator_id: m.creator_id });
    if (m.creator_message_text) msgIndex.push({ username, who: 'chatter', text: stripTags(m.creator_message_text), datetime: m.sent_datetime, creator_id: m.creator_id });
  }
  for (const x of msgIndex) x.ntext = _norm(x.text);
  const nickKeys = Object.keys(nickToUsers);
  const allUsers = Object.values(userByLower);

  // Subscriber spend (global per fan, keyed by username).
  const spendByUser = {};
  const usernames = [...new Set(msgIndex.map(x => x.username).filter(Boolean))];
  if (usernames.length) {
    try {
      const { data: subs } = await supabaseAdmin
        .from('subscribers').select('username, total_spend')
        .eq('organisation_id', orgId).in('username', usernames.slice(0, 1000));
      (subs || []).forEach(s => { spendByUser[s.username] = Math.round(parseFloat(s.total_spend) || 0); });
    } catch { /* spend optional */ }
  }

  const enrichIssue = (issue) => {
    // Resolve the AI's "fan" field. Preference order:
    //  1. an exact USERNAME (the prompt asks for the header's bracketed id) — unambiguous;
    //  2. an UNambiguous nickname;
    //  3. an ambiguous nickname → search only the candidates' threads and let the
    //     quote decide; if it can't, keep the nickname with NO username — never guess.
    const rawFan = String(issue.fan || '').trim();
    let primaryUser = rawFan ? (userByLower[rawFan.toLowerCase()] || null) : null;
    let candidates = null;
    if (!primaryUser && rawFan) {
      const us = nickToUsers[_norm(rawFan)];
      if (us && us.size === 1) primaryUser = [...us][0];
      else if (us && us.size > 1) candidates = [...us];
    }
    const quote = extractQuote(issue.detail);
    const pool = primaryUser ? msgIndex.filter(x => x.username === primaryUser)
      : candidates ? msgIndex.filter(x => candidates.includes(x.username))
        : msgIndex;
    let match = null;
    if (quote) {
      const nq = _norm(quote);
      match = pool.find(x => x.ntext.includes(nq))
        || pool.find(x => x.ntext.length > 8 && nq.includes(x.ntext))
        || (primaryUser ? msgIndex.find(x => x.ntext.includes(nq)) : null);
    }
    // Fallback when exact quote-matching fails (apostrophes/emoji/paraphrase):
    // the best word-overlap message within the candidate pool.
    if (!match) match = bestOverlap(pool.length ? pool : msgIndex, _norm(issue.detail));
    // The verbatim username (or unambiguous nickname) wins; otherwise the matched
    // message's owner — restricted to the candidates when the nickname was shared.
    const matchedUser = (match && (!candidates || candidates.includes(match.username))) ? match.username : null;
    const username = primaryUser || matchedUser || null;
    const creatorId = (match && match.creator_id) || (username && userToCreator[username]) || null;

    const dl = _norm(issue.detail);
    const padded = ` ${dl} `;
    const rawDetail = String(issue.detail || '').toLowerCase();
    // Every fan the issue names: the primary + any USERNAME appearing in the detail
    // + any UNambiguous nickname as a whole word (shared nicknames are skipped —
    // attaching one of 50 "Alex"es would point the manager at the wrong dialogue).
    const fanNick = new Map();
    if (username) fanNick.set(username, userToNick[username] || (rawFan || null));
    for (const u of allUsers) {
      if (u.length < 4 || fanNick.has(u)) continue;
      if (rawDetail.includes(u.toLowerCase())) fanNick.set(u, userToNick[u] || null);
    }
    for (const nl of nickKeys) {
      if (nl.length < 3) continue;
      if (!padded.includes(` ${nl} `)) continue;
      const us = nickToUsers[nl];
      if (us.size !== 1) continue;                 // shared nickname → never guess
      const u = [...us][0];
      if (u && !fanNick.has(u)) fanNick.set(u, nickDisplay[nl]);
    }
    const fans = [...fanNick.entries()].map(([u, nick]) => {
      const fm = (u === username && match) ? match : bestOverlap(msgIndex.filter(x => x.username === u), dl);
      return { username: u, nickname: nick || null, spend: spendByUser[u] ?? null, message: fm ? fm.text : null, sent_at: fm ? fm.datetime : null };
    });
    const mentions = fans.filter(f => f.username !== username).map(f => ({ username: f.username, nickname: f.nickname, spend: f.spend }));

    return {
      fan: issue.fan || null,
      fan_username: username,
      spend: username ? (spendByUser[username] ?? null) : null,
      creator: creatorId ? (creatorNames[creatorId] || null) : null,
      area: issue.area || null,
      severity: issue.severity || null,
      detail: issue.detail || '',
      message: match ? match.text : null,
      sent_at: match ? match.datetime : null,
      matched_who: match ? match.who : null,
      fans,
      mentions,
    };
  };

  return { creatorNames, creatorInstructions, spendByUser, enrichIssue };
}

/**
 * Build the "special instructions" preamble for the pages that actually appear in
 * this chatter-day, from each page's manager-written ai_instructions. Returns '' if
 * none of the present pages have custom rules.
 */
function buildPageInstructions(msgs, creatorNames = {}, creatorInstructions = {}) {
  const present = new Set((msgs || []).map(m => m.creator_id).filter(Boolean));
  const lines = [];
  for (const cid of present) {
    const txt = (creatorInstructions[cid] || '').trim();
    if (txt) lines.push(`- ${creatorNames[cid] || 'page'}: ${txt}`);
  }
  if (!lines.length) return '';
  return `PER-PAGE SPECIAL INSTRUCTIONS (custom rules the manager set for specific pages — apply the matching page's rules to that page's conversations, IN ADDITION to everything above):\n${lines.join('\n')}\n\n`;
}

module.exports = { MODELS, stripTags, _norm, extractQuote, loadChatterMessages, buildThreadList, buildEnrichment, buildPageInstructions, bestOverlap, sigTokens };
