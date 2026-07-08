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
  try {
    const { data: crs } = await supabaseAdmin.from('creators').select('id, name').eq('organisation_id', orgId);
    (crs || []).forEach(c => { creatorNames[c.id] = c.name; });
  } catch { /* names optional */ }

  const nickToUser = {};     // normalized nickname -> username
  const nickDisplay = {};    // normalized nickname -> display nickname
  const userToCreator = {};  // username -> creator_id (which page the fan is on)
  const msgIndex = [];
  for (const m of msgs) {
    const username = m.sent_to_username || null;
    const nickname = m.sent_to_nickname || username || 'unknown';
    const nl = _norm(nickname);
    if (username) {
      if (!nickToUser[nl]) nickToUser[nl] = username;
      if (!nickDisplay[nl]) nickDisplay[nl] = nickname;
      if (m.creator_id && !userToCreator[username]) userToCreator[username] = m.creator_id;
    }
    if (m.fan_message_text) msgIndex.push({ username, who: 'fan', text: stripTags(m.fan_message_text), datetime: m.sent_datetime, creator_id: m.creator_id });
    if (m.creator_message_text) msgIndex.push({ username, who: 'chatter', text: stripTags(m.creator_message_text), datetime: m.sent_datetime, creator_id: m.creator_id });
  }
  for (const x of msgIndex) x.ntext = _norm(x.text);
  const nickKeys = Object.keys(nickToUser);

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
    const primaryUser = issue.fan ? (nickToUser[_norm(issue.fan)] || null) : null;
    const quote = extractQuote(issue.detail);
    const pool = primaryUser ? msgIndex.filter(x => x.username === primaryUser) : msgIndex;
    let match = null;
    if (quote) {
      const nq = _norm(quote);
      match = pool.find(x => x.ntext.includes(nq))
        || pool.find(x => x.ntext.length > 8 && nq.includes(x.ntext))
        || (primaryUser ? msgIndex.find(x => x.ntext.includes(nq)) : null);
    }
    // Fallback when exact quote-matching fails (apostrophes/emoji/paraphrase):
    // the best word-overlap message in this fan's thread.
    if (!match) match = bestOverlap(pool.length ? pool : msgIndex, _norm(issue.detail));
    const username = primaryUser || (match && match.username) || null;
    const creatorId = (match && match.creator_id) || (username && userToCreator[username]) || null;

    const dl = _norm(issue.detail);
    const padded = ` ${dl} `;
    // Every fan the issue names: the primary + any nickname appearing in the detail
    // as a WHOLE WORD (whole-word match avoids junk like 'd o' hitting 'good old').
    // Each fan carries their OWN best-match message + time, so a manager can find
    // every fan a multi-fan task refers to.
    const fanNick = new Map();
    if (username) fanNick.set(username, nickDisplay[_norm(issue.fan || '')] || issue.fan || null);
    for (const nl of nickKeys) {
      if (nl.length < 3) continue;
      if (!padded.includes(` ${nl} `)) continue;
      const u = nickToUser[nl];
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

  return { creatorNames, spendByUser, enrichIssue };
}

module.exports = { MODELS, stripTags, _norm, extractQuote, loadChatterMessages, buildThreadList, buildEnrichment, bestOverlap, sigTokens };
