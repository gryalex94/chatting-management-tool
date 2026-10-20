/**
 * Copies a connected Fanvue account into our tables (030_fanvue.sql):
 *   1. the creator's profile (handle, AI creator or not, subscriber counts),
 *   2. the chat list, newest activity first — every fan she talks with,
 *   3. the messages of each chat that changed: the whole history the first time,
 *      then only what's new (kept per chat: a mass message has one id for every
 *      fan who got it),
 *   4. the photos, videos and PPVs of those chats (what was attached, the PPV
 *      price, whether he bought it: Fanvue's message list has only the text),
 *   5. earnings (subscriptions, PPVs, tips, refunds…).
 * Safe to stop at any point: each chat records how far it was copied, so the
 * next run carries on (a deploy restarting the server costs nothing but time).
 * Chats are read with markAsRead=false, so the team's unread badges never change.
 */
const { supabaseAdmin } = require('./supabase');
const fv = require('../integrations/fanvue');
const { copyFanvueVault } = require('./contentLibrary');

const running = new Map();     // account id → progress of the sync in progress
const lastResult = new Map();  // account id → the last sync's summary, errors included
const PAGE = 50;
const MAX_PAGES_PER_CHAT = 4000;   // 200k messages: a guard against a cursor that never ends
// The internet dropping for a moment (Wi-Fi, a laptop waking up): try again a
// minute later — the copy carries on where it stopped.
const NETWORK = /fetch failed|unreachable|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up|network/i;
const MAX_ATTEMPTS = 5;

async function upsertChunks(table, rows, onConflict) {
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabaseAdmin.from(table).upsert(rows.slice(i, i + 500), { onConflict });
    if (error) throw error;
  }
}

function messageRow(accountId, fanUuid, m) {
  const { text, sender, recipient, repliedMessage, ...rest } = m;
  return {
    account_id: accountId, uuid: m.uuid, fan_uuid: fanUuid,
    from_fan: sender?.uuid === fanUuid,
    sent_by_user_id: m.sentByUserId || null, app_uuid: m.appUuid || null,
    type: m.type || null, status: m.status || null, text: text ?? null, sent_at: m.sentAt || null,
    raw: { ...rest, replyTo: repliedMessage?.parent_message?.uuid || null },
  };
}

// Every fan we already know: how far each chat has been copied.
async function knownFans(accountId) {
  const out = new Map();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabaseAdmin.from('fanvue_fans').select('fan_uuid, history_done, messages_through, media_done')
      .eq('account_id', accountId).range(from, from + 999);
    if (error) throw error;
    for (const f of data || []) out.set(f.fan_uuid, f);
    if (!data || data.length < 1000) return out;
  }
}

/**
 * Copy one chat's messages, newest first. `whole`: keep going to the very first
 * message; otherwise stop at the first page holding a message we already have.
 */
async function copyChat(accountId, fanUuid, { whole, progress }) {
  let filter = null;
  let lastKey = null;
  for (let page = 0; page < MAX_PAGES_PER_CHAT; page++) {
    const body = await fv.request(accountId, `/v1/chats/${encodeURIComponent(fanUuid)}/messages`, {
      params: { limit: PAGE, markAsRead: 'false', sentBefore: filter?.sentBefore, receivedBefore: filter?.receivedBefore },
    });
    const msgs = (body?.data || []).filter(m => m?.uuid);
    if (!msgs.length) return true;
    let seenBefore = false;
    if (!whole) {
      // In this chat: a mass message has the same id in every fan's chat.
      const { data: have } = await supabaseAdmin.from('fanvue_messages').select('uuid')
        .eq('account_id', accountId).eq('fan_uuid', fanUuid).in('uuid', msgs.map(m => m.uuid));
      seenBefore = (have || []).length > 0;
    }
    await upsertChunks('fanvue_messages', msgs.map(m => messageRow(accountId, fanUuid, m)), 'account_id,fan_uuid,uuid');
    progress.messages += msgs.length;
    filter = body?.dateFilter || null;
    const key = JSON.stringify(filter);
    if (seenBefore || !filter || (!filter.sentBefore && !filter.receivedBefore) || key === lastKey) return true;
    lastKey = key;
  }
  return false;   // hit the guard: leave it marked unfinished
}

const cents = (p) => (Number.isFinite(p?.USD?.price) ? Math.round(p.USD.price) : null);

/**
 * Copy one chat's media list (039_fanvue_media.sql), newest first. `whole`: all of
 * it; otherwise stop at the first page holding an item we already have. Returns
 * false when the table isn't there yet (database change 039 not run).
 */
async function copyMedia(accountId, fanUuid, { whole, progress }) {
  let cursor = null;
  for (let page = 0; page < 200; page++) {
    const body = await fv.request(accountId, `/v1/chats/${encodeURIComponent(fanUuid)}/media`, { params: { limit: PAGE, cursor: cursor || undefined } });
    const items = (body?.data || []).filter(m => m?.uuid);
    if (!items.length) return true;
    const rows = [...new Map(items.map(m => [`${m.messageUuid || ''}|${m.uuid}`, {
      account_id: accountId, fan_uuid: fanUuid, message_uuid: m.messageUuid || '', media_uuid: m.uuid,
      media_type: m.mediaType || null, from_fan: m.ownerUuid === fanUuid, sent_at: m.sentAt || m.created_at || null,
      price_cents: cents(m.pricing), paid_cents: cents(m.amountPaid), purchased_at: m.purchasedAt || null,
    }])).values()];
    let seenBefore = false;
    if (!whole) {
      const { data: have } = await supabaseAdmin.from('fanvue_media').select('media_uuid')
        .eq('account_id', accountId).eq('fan_uuid', fanUuid).in('media_uuid', items.map(m => m.uuid));
      seenBefore = (have || []).length > 0;
    }
    const { error } = await supabaseAdmin.from('fanvue_media').upsert(rows, { onConflict: 'account_id,fan_uuid,message_uuid,media_uuid' });
    if (error) {
      if (/fanvue_media/.test(error.message)) return false;
      throw error;
    }
    progress.media += rows.length;
    cursor = body?.nextCursor || null;
    if (seenBefore || !cursor) return true;
  }
  return true;
}

// Earnings in 90-day windows (the API caps how much one list may span).
async function copyEarnings(accountId, fromIso, progress) {
  const end = Date.now();
  for (let s = Date.parse(fromIso); s < end; s += 90 * 86400000) {
    const e = Math.min(s + 90 * 86400000, end);
    let cursor = null;
    do {
      const body = await fv.request(accountId, '/v1/insights/earnings', {
        params: { startDate: new Date(s).toISOString(), endDate: new Date(e).toISOString(), size: PAGE, cursor },
      });
      const rows = (body?.data || []).filter(r => r.transactionOrderId && r.date).map(r => ({
        account_id: accountId, transaction_order_id: r.transactionOrderId, source: r.source || 'unknown',
        fan_uuid: r.user?.uuid || null, paid_at: r.date,
        gross_cents: Number.isFinite(r.gross) ? Math.round(r.gross) : null,
        net_cents: Number.isFinite(r.net) ? Math.round(r.net) : null,
        message_uuid: r.messageUuid || null, status: r.transactionOrderStatus || null,
      }));
      await upsertChunks('fanvue_earnings', rows, 'account_id,transaction_order_id,source');
      progress.earnings += rows.length;
      cursor = body?.nextCursor || null;
    } while (cursor);
  }
}

async function runFanvueSync(accountId, { full = false, attempt = 1 } = {}) {
  if (running.has(accountId)) return { skipped: 'already running' };
  const progress = { started_at: new Date().toISOString(), phase: 'profile', chats_listed: 0, chats_to_read: 0, chats_read: 0, messages: 0, media: 0, earnings: 0 };
  running.set(accountId, progress);
  const t0 = Date.now();
  const warnings = [];
  try {
    const { data: acc, error } = await supabaseAdmin.from('fanvue_accounts').select('id, synced_at').eq('id', accountId).single();
    if (error) throw error;

    // 1. Profile.
    const me = await fv.request(accountId, '/v1/users/me');
    await supabaseAdmin.from('fanvue_accounts').update({
      handle: me.handle, display_name: me.displayName, is_ai_creator: !!me.isAiCreator,
      subscribers_count: me.fanCounts?.subscribersCount ?? null, followers_count: me.fanCounts?.followersCount ?? null,
    }).eq('id', accountId);

    // 2. Chats, newest activity first. After the first full pass, stop at chats
    //    quiet since the last sync (an hour's margin).
    progress.phase = 'chats';
    const since = full || !acc.synced_at ? null : Date.parse(acc.synced_at) - 3600_000;
    const known = await knownFans(accountId);
    const todo = new Map();          // fan → { whole, lastAt }
    let cursor = null;
    do {
      const body = await fv.request(accountId, '/v1/chats', { params: { size: PAGE, cursor, sortBy: 'most_recent_messages' } });
      const chats = (body?.data || []).filter(c => c?.user?.uuid);
      await upsertChunks('fanvue_fans', chats.map(c => ({
        account_id: accountId, fan_uuid: c.user.uuid, handle: c.user.handle || null, display_name: c.user.displayName || null,
        nickname: c.user.nickname || null, is_top_spender: !!c.user.isTopSpender, registered_at: c.user.registeredAt || null,
        last_message_at: c.lastMessageAt || null, updated_at: new Date().toISOString(),
      })), 'account_id,fan_uuid');
      for (const c of chats) {
        const k = known.get(c.user.uuid);
        const last = c.lastMessageAt ? Date.parse(c.lastMessageAt) : 0;
        const through = k?.messages_through ? Date.parse(k.messages_through) : 0;
        // full: read every chat again from the start (a repair after a fix).
        if (full || !k?.history_done || last > through) todo.set(c.user.uuid, { whole: full || !k?.history_done, lastAt: c.lastMessageAt || null });
      }
      progress.chats_listed += chats.length;
      cursor = body?.nextCursor || null;
      const oldest = chats.at(-1)?.lastMessageAt;
      if (since && oldest && Date.parse(oldest) < since) break;
    } while (cursor);
    // Chats whose first copy was cut short last time, even if quiet since.
    for (const [fan, k] of known) if (!k.history_done && !todo.has(fan)) todo.set(fan, { whole: true, lastAt: null });

    // 3. Messages of every chat that changed.
    progress.phase = 'messages';
    progress.chats_to_read = todo.size;
    for (const [fan, t] of todo) {
      const done = await copyChat(accountId, fan, { whole: t.whole, progress });
      const patch = { messages_through: t.lastAt || new Date().toISOString(), updated_at: new Date().toISOString() };
      if (t.whole && done) patch.history_done = true;
      await supabaseAdmin.from('fanvue_fans').update(patch).eq('account_id', accountId).eq('fan_uuid', fan);
      progress.chats_read++;
    }

    // 3b. Photos, videos and PPVs: of every chat read now, and every chat whose
    //     whole media list hasn't been copied yet (the first time: all of them).
    progress.phase = 'media';
    const mediaTodo = new Map([...todo].map(([fan, t]) => [fan, { whole: full || !known.get(fan)?.media_done }]));
    for (const [fan, k] of known) if (!k.media_done && !mediaTodo.has(fan)) mediaTodo.set(fan, { whole: true });
    let mediaFailed = 0;
    for (const [fan, t] of mediaTodo) {
      let ok;
      try { ok = await copyMedia(accountId, fan, { whole: t.whole, progress }); }
      catch (e) {
        if (NETWORK.test(String(e.message)) || e.reconnect) throw e;
        mediaFailed += 1;                                         // one odd chat doesn't stop the rest
        console.error('[FanvueSync] media:', fan, e.message);
        continue;
      }
      if (!ok) { warnings.push('Photos and PPVs not copied: run database change 039 in Supabase'); break; }
      if (t.whole) await supabaseAdmin.from('fanvue_fans').update({ media_done: true }).eq('account_id', accountId).eq('fan_uuid', fan);
    }

    if (mediaFailed) warnings.push(`Photos and PPVs of ${mediaFailed} chat${mediaFailed === 1 ? '' : 's'} couldn't be copied`);

    // 3c. Her vault: what she has, with Fanvue's own description and tags (her content library)
    progress.phase = 'vault';
    try {
      progress.vault = await copyFanvueVault(accountId);
    } catch (e) {
      if (NETWORK.test(String(e.message)) || e.reconnect) throw e;
      warnings.push(e.status === 403 ? 'Her vault not copied: the read:media permission is missing' : `Her vault not copied: ${e.message}`);
    }

    // 4. Earnings: from the account's start the first time, then the last 3 days
    //    again (statuses settle) and onwards.
    progress.phase = 'earnings';
    try {
      const { data: lastPay } = await supabaseAdmin.from('fanvue_earnings').select('paid_at')
        .eq('account_id', accountId).order('paid_at', { ascending: false }).limit(1).maybeSingle();
      const from = full || !lastPay ? (me.createdAt || new Date(Date.now() - 3 * 365 * 86400000).toISOString())
        : new Date(Date.parse(lastPay.paid_at) - 3 * 86400000).toISOString();
      await copyEarnings(accountId, from, progress);
    } catch (e) {
      if (e.status !== 403) throw e;
      warnings.push('Earnings not copied: the read:insights permission is missing');
    }

    const summary = {
      finished_at: new Date().toISOString(), took_s: Math.round((Date.now() - t0) / 1000),
      chats_listed: progress.chats_listed, chats_read: progress.chats_read, messages: progress.messages, media: progress.media, vault: progress.vault || null, earnings: progress.earnings, warnings,
    };
    await supabaseAdmin.from('fanvue_accounts').update({ synced_at: summary.finished_at, sync_error: warnings[0] || null, status: 'connected' }).eq('id', accountId);
    lastResult.set(accountId, summary);
    console.log('[FanvueSync]', JSON.stringify(summary));
    return summary;
  } catch (e) {
    const retry = NETWORK.test(String(e.message)) && attempt < MAX_ATTEMPTS;
    console.error(`[FanvueSync] failed${retry ? ' (connection lost; trying again in a minute)' : ''}:`, e.message);
    const error = retry ? 'Lost the connection for a moment; carrying on in a minute' : e.message;
    const summary = { finished_at: new Date().toISOString(), error, messages: progress.messages, chats_read: progress.chats_read };
    await supabaseAdmin.from('fanvue_accounts').update({ sync_error: error, ...(e.reconnect ? { status: 'reconnect' } : {}) }).eq('id', accountId);
    lastResult.set(accountId, summary);
    if (retry) setTimeout(() => { runFanvueSync(accountId, { full, attempt: attempt + 1 }).catch(() => {}); }, 60_000);
    return summary;
  } finally {
    running.delete(accountId);
  }
}

// Every connected account (the hourly job on the live server).
async function syncAllFanvue() {
  const { data } = await supabaseAdmin.from('fanvue_accounts').select('id').eq('status', 'connected');
  for (const a of data || []) {
    await runFanvueSync(a.id);
    // then the AI chat's notes on fans whose conversation has ended (reads only; sends nothing)
    try { await require('./aiChat').refreshMemories(a.id); }
    catch (e) { console.error('[FanvueSync] notes after chats:', e.message); }
  }
}

const fanvueProgress = (id) => running.get(id) || null;
const fanvueLastResult = (id) => lastResult.get(id) || null;

module.exports = { runFanvueSync, syncAllFanvue, fanvueProgress, fanvueLastResult, _test: { messageRow, copyMedia } };
