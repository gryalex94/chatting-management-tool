/**
 * Fansly, phase 1: turns what the browser extension copied from the Fansly page
 * into our tables (051_fansly.sql). The extension posts batches of events; each
 * event is one answer the page got from Fansly (a chat, the thread list, a sent
 * message, a live socket event…), trimmed of media links. Nothing here talks to
 * Fansly: it only reads what the page already received.
 *
 * Money comes in thousandths of a dollar (29990 = $29.99) and is stored in dollars.
 *
 * Who sent a message: the browser that sent it sees the answer to its own send
 * (event kind `sent`), and the person logged into the extension on that browser
 * is the sender → attribution `logged_in`. Other browsers only see the message
 * arrive over the socket; a creator-side message that no extension sent is
 * `unattributed`. Old messages loaded from history are `history`; his are `fan`.
 * A stronger attribution never gets overwritten by a weaker one.
 */
const { supabaseAdmin } = require('./supabase');
const { findOrCreateChatter } = require('./autoMatch');
const { createPage } = require('./pages');

const dollars = (mills) => (mills == null || isNaN(Number(mills)) ? null : Math.round(Number(mills)) / 1000);
const tsSec = (s) => (s ? new Date(Number(s) * 1000).toISOString() : null);        // Fansly seconds → ISO
const tsMs = (ms) => (ms ? new Date(Number(ms)).toISOString() : null);              // Fansly milliseconds → ISO
const str = (v) => (v == null ? null : String(v));
const RANK = { fan: 1, history: 1, unattributed: 2, logged_in: 3 };                 // stronger wins

// The price Fansly keeps on a media item or a bundle: the first permission entry.
function itemPrice(item) {
  const flag = item?.permissions?.permissionFlags?.[0];
  let p = Number(flag?.price) || 0;
  // a media inside a bundle shows price 0 here, with the real one tucked into metadata: {"1":"{\"price\":39990}"}
  if (!p && flag?.metadata) {
    try { for (const v of Object.values(JSON.parse(flag.metadata))) { const inner = typeof v === 'string' ? JSON.parse(v) : v; if (inner?.price) p = Math.max(p, Number(inner.price) || 0); } } catch { /* not JSON */ }
  }
  if (!p && item?.price) p = Number(item.price) || 0;
  return p ? dollars(p) : (flag || item?.price != null ? 0 : null);
}

/** Which of these two account ids is the creator: the one that owns the media / started the thread list. */
function inferAccountId(events) {
  for (const e of events) {
    const d = e?.data || {};
    if (e.kind === 'me' && d.id) return str(d.id);
    if (e.kind === 'groups' && d.data?.[0]?.account_id) return str(d.data[0].account_id);
    if (e.kind === 'messages' && d.accountMedia?.[0]?.accountId) return str(d.accountMedia[0].accountId);
    if (e.kind === 'sent' && d.senderId) return str(d.senderId);
    if (e.kind === 'media_created' && Array.isArray(d) && d[0]?.accountId) return str(d[0].accountId);
  }
  return null;
}

// ---------- lookups with short caches (one process, many batches a minute) ----------
const accountCache = new Map();            // `${org}:${fanslyId}` → { at, row }
const forgetAccount = (orgId, fanslyId) => accountCache.delete(`${orgId}:${fanslyId}`);
async function ensureAccount(orgId, fanslyId, hint = {}) {
  const key = `${orgId}:${fanslyId}`;
  const hit = accountCache.get(key);
  let acc = hit && Date.now() - hit.at < 5 * 60_000 ? hit.row : null;
  if (!acc) {
    const { data, error } = await supabaseAdmin.from('fansly_accounts').select('*').eq('organisation_id', orgId).eq('fansly_account_id', fanslyId).maybeSingle();
    if (error) throw error;
    acc = data;
  }
  if (!acc) {
    // A new Fansly account: give it a page of its own (platform fansly), named after the username for now.
    const name = hint.username ? `${hint.username} (Fansly)` : `Fansly ${fanslyId.slice(-6)}`;
    const page = await createPage({ name, organisationId: orgId, platform: 'fansly' }).catch(() => null);
    const { data, error } = await supabaseAdmin.from('fansly_accounts')
      .upsert({ organisation_id: orgId, fansly_account_id: fanslyId, creator_id: page?.id || null, username: hint.username || null, display_name: hint.displayName || null, last_seen_at: new Date().toISOString() },
        { onConflict: 'organisation_id,fansly_account_id' }).select().single();
    if (error) throw error;
    acc = data;
  }
  accountCache.set(key, { at: Date.now(), row: acc });
  return acc;
}

const chatterCache = new Map();            // user id → chatter id (or null)
/** The chatter row for a logged-in user: same email, else same name, else a new row. */
async function chatterFor(user) {
  if (chatterCache.has(user.id)) return chatterCache.get(user.id);
  let id = null;
  if (user.email) {
    const { data } = await supabaseAdmin.from('chatters').select('id').eq('organisation_id', user.organisationId).ilike('email', user.email).limit(1);
    id = data?.[0]?.id || null;
  }
  if (!id && user.name) id = await findOrCreateChatter(user.name, user.organisationId, user.email).catch(() => null);
  chatterCache.set(user.id, id);
  setTimeout(() => chatterCache.delete(user.id), 10 * 60_000).unref?.();
  return id;
}

const shiftCache = new Map();              // org → { at, rows }
async function shiftsFor(orgId) {
  const hit = shiftCache.get(orgId);
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit.rows;
  const { data } = await supabaseAdmin.from('shifts').select('id, creator_id, start_time, end_time, timezone, platform, is_active')
    .eq('organisation_id', orgId).eq('is_active', true);
  const rows = (data || []).filter(s => !s.platform || s.platform === 'fansly');
  shiftCache.set(orgId, { at: Date.now(), rows });
  return rows;
}
const minutesIn = (iso, tz) => {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz || 'Europe/Amsterdam', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(iso));
    const h = Number(parts.find(p => p.type === 'hour')?.value) % 24, m = Number(parts.find(p => p.type === 'minute')?.value);
    return h * 60 + m;
  } catch { return null; }
};
const toMin = (t) => { const [h, m] = String(t || '0:0').split(':').map(Number); return h * 60 + m; };
/** The shift (the page's own first, else the platform's) whose hours contain this moment. */
function shiftAt(shifts, creatorId, iso) {
  if (!iso) return null;
  const pick = (rows) => rows.find(s => {
    const now = minutesIn(iso, s.timezone); if (now == null) return false;
    const a = toMin(s.start_time), b = toMin(s.end_time);
    return a <= b ? (now >= a && now < b) : (now >= a || now < b);          // overnight shifts wrap midnight
  });
  return pick(shifts.filter(s => s.creator_id && s.creator_id === creatorId)) || pick(shifts.filter(s => !s.creator_id)) || null;
}

// ---------- parsing one event into rows ----------
function slimMessage(m) {
  const { attachments, embeds, interactions, likes, ...rest } = m || {};
  return { ...rest, attachments, interactions };
}

/**
 * One message → a row. `creatorId` is the Fansly account id of the creator;
 * `prices` maps item ids to dollars (from the same batch or the items table).
 */
function messageRow(ctx, m, { source, attribution, prices }) {
  const fromFan = str(m.senderId) !== ctx.creatorId;
  const other = (m.interactions || []).map(i => str(i.userId)).find(id => id && id !== ctx.creatorId) || null;
  const fanId = fromFan ? str(m.senderId) : other;
  const mine = (m.interactions || []).find(i => str(i.userId) !== ctx.creatorId) || null;   // his receipt of my message
  const atts = (m.attachments || []).map(a => ({ content_type: a.contentType, content_id: str(a.contentId), price: prices.get(str(a.contentId)) ?? null }));
  const price = atts.reduce((best, a) => (a.price != null && (best == null || a.price > best) ? a.price : best), null);
  const createdAt = m.createdAt > 1e12 ? tsMs(m.createdAt) : tsSec(m.createdAt);
  const att = fromFan ? 'fan' : attribution;
  return {
    account_id: ctx.account.id, message_id: str(m.id), group_id: str(m.groupId), fan_account_id: fanId,
    from_fan: fromFan, type: m.type ?? null, text: m.content || null, sent_at: createdAt,
    delivered_at: !fromFan && mine?.deliveredAt ? tsMs(mine.deliveredAt) : null,
    read_at: !fromFan && mine?.readAt ? tsMs(mine.readAt) : null,
    reply_to: m.inReplyTo ? str(m.inReplyTo) : null,
    attachments: atts.length ? atts : null, price,
    tip_amount: m.totalTipAmount ? dollars(m.totalTipAmount) : null,
    user_id: att === 'logged_in' ? ctx.user.id : null,
    chatter_id: att === 'logged_in' ? ctx.chatterId : null,
    shift_id: !fromFan ? shiftAt(ctx.shifts, ctx.account.creator_id, createdAt)?.id || null : null,
    attribution: att, device_id: att === 'logged_in' ? ctx.deviceId : null, source,
    updated_at: new Date().toISOString(), raw: slimMessage(m),
  };
}

function mediaItemRow(ctx, am) {
  const media = am.media || {};
  let duration = null;
  try { duration = JSON.parse(media.metadata || '{}').duration ?? null; } catch { /* not JSON */ }
  const forFan = (am.whitelist || []).map(w => str(w.accountId)).find(id => id !== ctx.creatorId) || null;
  return {
    account_id: ctx.account.id, item_id: str(am.id), kind: 'media', price: itemPrice(am),
    media_type: media.type ?? null, mimetype: media.mimetype || null, duration_s: duration, media_count: 1,
    for_fan_account_id: forFan, lifetime_sales: am.saleStats?.sales ?? null, lifetime_net: am.saleStats ? dollars(am.saleStats.total) : null,
    created_at_fansly: tsSec(am.createdAt), updated_at: new Date().toISOString(),
    raw: { ...am, media: media && { id: media.id, type: media.type, mimetype: media.mimetype, filename: media.filename, width: media.width, height: media.height, metadata: media.metadata } },
  };
}
function bundleItemRow(ctx, b) {
  return {
    account_id: ctx.account.id, item_id: str(b.id), kind: 'bundle', price: itemPrice(b),
    media_type: null, mimetype: null, duration_s: null, media_count: (b.accountMediaIds || []).length || null,
    for_fan_account_id: null, lifetime_sales: b.saleStats?.sales ?? null, lifetime_net: b.saleStats ? dollars(b.saleStats.total) : null,
    created_at_fansly: tsSec(b.createdAt), updated_at: new Date().toISOString(),
    raw: { ...b, bundleContent: undefined },
  };
}

function fanRowFromAccount(ctx, a, extra = {}) {
  return {
    account_id: ctx.account.id, fansly_account_id: str(a.id), username: a.username || null, display_name: a.displayName || null,
    joined_fansly_at: a.createdAt ? (a.createdAt > 1e12 ? tsMs(a.createdAt) : tsSec(a.createdAt)) : null,
    last_seen_at: a.lastSeenAt ? tsMs(a.lastSeenAt) : null, follows_you: a.followsYou ?? null,
    updated_at: new Date().toISOString(), raw: a, ...extra,
  };
}

/**
 * Apply one batch. Returns { counts, errors }. `ctx`: { account, creatorId, user,
 * chatterId, deviceId, shifts }.
 */
async function applyEvents(ctx, events) {
  const counts = {}; const errors = [];
  const bump = (k, n = 1) => { counts[k] = (counts[k] || 0) + n; };
  const messages = new Map();        // message id → row (last write wins within the batch, strongest attribution kept)
  const items = new Map();
  const fans = new Map();
  const transactions = new Map();
  const prices = new Map();          // item id → dollars, from this batch
  const accountPatch = {};

  const putMessage = (row) => {
    const prev = messages.get(row.message_id);
    if (prev && RANK[prev.attribution] > RANK[row.attribution]) {
      // keep the stronger attribution, take the fresher receipts
      messages.set(row.message_id, { ...prev, delivered_at: row.delivered_at || prev.delivered_at, read_at: row.read_at || prev.read_at });
    } else messages.set(row.message_id, row);
  };
  const putFan = (row) => {
    const prev = fans.get(row.fansly_account_id) || {};
    const merged = { ...prev };
    for (const [k, v] of Object.entries(row)) if (v != null || !(k in merged)) merged[k] = v;
    fans.set(row.fansly_account_id, merged);
  };
  const takeItems = (d) => {
    for (const am of d?.accountMedia || []) { const r = mediaItemRow(ctx, am); items.set(r.item_id, r); if (r.price != null) prices.set(r.item_id, r.price); }
    for (const b of d?.accountMediaBundles || []) { const r = bundleItemRow(ctx, b); items.set(r.item_id, r); if (r.price != null) prices.set(r.item_id, r.price); }
  };

  // items first, so the prices are known when the messages are read
  for (const e of events) {
    const d = e?.data;
    if (e.kind === 'messages') takeItems(d);
    if (e.kind === 'media_created' && Array.isArray(d)) takeItems({ accountMedia: d });
    if (e.kind === 'ledger') takeItems(d?.aggregationData);
  }
  // a sent PPV references an item made moments earlier (maybe in an earlier batch): fetch those prices
  const wanted = new Set();
  for (const e of events) for (const a of (e.kind === 'sent' || e.kind === 'ws_message' ? e.data?.attachments : []) || []) if (!prices.has(str(a.contentId))) wanted.add(str(a.contentId));
  if (wanted.size) {
    const { data } = await supabaseAdmin.from('fansly_items').select('item_id, price').eq('account_id', ctx.account.id).in('item_id', [...wanted]);
    for (const r of data || []) if (r.price != null) prices.set(r.item_id, Number(r.price));
  }

  for (const e of events) {
    const d = e?.data;
    try {
      switch (e.kind) {
        case 'me': {
          Object.assign(accountPatch, { username: d.username || undefined, display_name: d.displayName || undefined, followers_count: d.followCount ?? undefined, subscribers_count: d.subscriberCount ?? undefined });
          bump('me'); break;
        }
        case 'groups': {                                   // the thread list: fans, their threads, the last message of each
          const accounts = new Map((d.aggregationData?.accounts || []).map(a => [str(a.id), a]));
          const groups = new Map((d.aggregationData?.groups || []).map(g => [str(g.id), g]));
          for (const t of d.data || []) {
            const fanId = str(t.partnerAccountId); if (!fanId) continue;
            const g = groups.get(str(t.groupId));
            const me = (g?.users || []).find(u => str(u.userId) === ctx.creatorId);
            const base = accounts.has(fanId) ? fanRowFromAccount(ctx, accounts.get(fanId)) : { account_id: ctx.account.id, fansly_account_id: fanId, updated_at: new Date().toISOString() };
            putFan({ ...base, username: base.username || t.partnerUsername || null, group_id: str(t.groupId),
              nickname: me?.userSettings?.customName || null, subscription_tier_id: t.subscriptionTierId ? str(t.subscriptionTierId) : null,
              unread_count: t.unreadCount ?? null, last_message_id: t.lastMessageId ? str(t.lastMessageId) : null,
              last_message_at: g?.lastMessage?.createdAt ? tsSec(g.lastMessage.createdAt) : null });
            if (g?.lastMessage?.id) putMessage(messageRow(ctx, g.lastMessage, { source: 'page', attribution: 'history', prices }));
            bump('threads');
          }
          break;
        }
        case 'group': {                                    // one thread: the nickname and the two users
          const fanId = (d.users || []).map(u => str(u.userId)).find(id => id !== ctx.creatorId);
          const me = (d.users || []).find(u => str(u.userId) === ctx.creatorId);
          if (fanId) putFan({ account_id: ctx.account.id, fansly_account_id: fanId, group_id: str(d.id), nickname: me?.userSettings?.customName || d.userSettings?.customName || null, updated_at: new Date().toISOString() });
          if (d.lastMessage?.id) putMessage(messageRow(ctx, d.lastMessage, { source: 'page', attribution: 'history', prices }));
          bump('group'); break;
        }
        case 'messages': {                                 // a chat page (25 messages) the chatter opened or scrolled
          for (const m of d.messages || []) putMessage(messageRow(ctx, m, { source: d.before ? 'history' : 'page', attribution: 'history', prices }));
          for (const t of d.tips || []) bump('tips_seen');
          bump('messages', (d.messages || []).length); break;
        }
        case 'sent': {                                     // this browser sent it: the logged-in person is the sender
          putMessage(messageRow(ctx, d, { source: 'sent', attribution: 'logged_in', prices }));
          bump('sent'); break;
        }
        case 'ws_message': {                               // arrived live over the socket (his, or sent from another browser)
          putMessage(messageRow(ctx, d, { source: 'live', attribution: 'unattributed', prices }));
          bump('live'); break;
        }
        case 'unread': {                                   // delivery/read receipts of our unread messages
          for (const i of d.messageInteractions || d || []) {
            if (!i?.messageId) continue;
            const prev = messages.get(str(i.messageId));
            if (prev) messages.set(str(i.messageId), { ...prev, delivered_at: i.deliveredAt ? tsMs(i.deliveredAt) : prev.delivered_at, read_at: i.readAt ? tsMs(i.readAt) : prev.read_at });
          }
          bump('receipts'); break;
        }
        case 'subscribers': {
          for (const s of d.subscriptions || []) putFan({ account_id: ctx.account.id, fansly_account_id: str(s.subscriberId),
            subscription_tier_id: str(s.subscriptionTierId), subscription_tier_name: s.subscriptionTierName || null, subscription_status: s.status ?? null,
            subscribed_until: s.endsAt ? tsMs(s.endsAt) : null, updated_at: new Date().toISOString() });
          bump('subscribers', (d.subscriptions || []).length); break;
        }
        case 'ws_order': {                                 // a fan bought something, live (shape best-effort until seen)
          const o = d || {};
          const itemId = str(o.accountMediaBundleId || o.bundleId || o.accountMediaId || o.contentId || o.productId);
          const fanId = str(o.accountId || o.buyerId || o.purchaserId);
          const gross = dollars(o.price ?? o.amount);
          const id = str(o.id || o.orderId || `${itemId}:${fanId}:${o.createdAt || e.at}`);
          transactions.set(id, { account_id: ctx.account.id, transaction_id: id, type: null, type_label: 'Media order (live)', fan_account_id: fanId, item_id: itemId,
            gross, net: gross != null ? Math.round(gross * 80) / 100 : null, status: null, created_at_fansly: o.createdAt ? (o.createdAt > 1e12 ? tsMs(o.createdAt) : tsSec(o.createdAt)) : new Date(e.at || Date.now()).toISOString(),
            category: null, source: 'live', updated_at: new Date().toISOString(), raw: o });
          bump('orders'); break;
        }
        case 'media_created': bump('items_created', Array.isArray(d) ? d.length : 0); break;
        case 'ws_other': bump(`ws_${d?.serviceId}_${d?.type}`); break;     // counted so the shapes can be learned from the log
        case 'ledger': {                                   // phase 2 reads this properly; keep the rows now so nothing is lost
          const LABEL = { 2110: 'Media', 2116: 'Media Sets', 7101: 'Tips', 15001: 'Subscriptions', 32101: 'Locked Text', 45101: 'Stream Tickets', 18001: 'Referrals', 18002: 'Referrals', 24101: 'Leaderboard Prize Money', 6101: 'Refunds', 2010: 'Media (Legacy)', 2016: 'Media Sets (Legacy)', 7001: 'Tips (Legacy)' };
          for (const t of d.data || []) {
            const net = dollars(t.amount);
            transactions.set(str(t.transactionId), { account_id: ctx.account.id, transaction_id: str(t.transactionId), type: t.type, type_label: LABEL[t.type] || String(t.type),
              fan_account_id: str(t.correlationAccountId), item_id: [2110, 2116, 2010, 2016].includes(t.type) ? str(t.correlationId) : null,
              gross: net != null && t.destinationTax ? Math.round(net / (1 - t.destinationTax / 10000) * 100) / 100 : net, net, status: t.status ?? null,
              created_at_fansly: tsMs(t.createdAt), category: t.type === 15001 ? 'subscription' : t.type === 6101 ? 'refund' : null, source: 'ledger', updated_at: new Date().toISOString(), raw: t });
          }
          for (const a of d.aggregationData?.accounts || []) putFan(fanRowFromAccount(ctx, a));
          bump('ledger', (d.data || []).length); break;
        }
        default: bump('ignored');
      }
    } catch (err) { errors.push(`${e.kind}: ${err.message}`); }
  }

  // ---- write, keeping a stronger attribution already in the table ----
  const now = new Date().toISOString();
  if (messages.size) {
    const ids = [...messages.keys()];
    const existing = new Map();
    for (let i = 0; i < ids.length; i += 500) {
      const { data } = await supabaseAdmin.from('fansly_messages').select('message_id, attribution, chatter_id, user_id, shift_id, device_id, source, first_seen_at')
        .eq('account_id', ctx.account.id).in('message_id', ids.slice(i, i + 500));
      for (const r of data || []) existing.set(r.message_id, r);
    }
    const rows = [];
    for (const row of messages.values()) {
      const old = existing.get(row.message_id);
      if (old && RANK[old.attribution] > RANK[row.attribution]) {
        rows.push({ ...row, attribution: old.attribution, chatter_id: old.chatter_id, user_id: old.user_id, shift_id: old.shift_id, device_id: old.device_id, source: old.source, first_seen_at: old.first_seen_at });
      } else rows.push(old ? { ...row, first_seen_at: old.first_seen_at } : row);
    }
    await upsert('fansly_messages', rows, 'account_id,message_id');
    counts.messages_written = rows.length;
    counts.unattributed = rows.filter(r => r.attribution === 'unattributed').length;
  }
  if (items.size) { await upsert('fansly_items', [...items.values()], 'account_id,item_id'); counts.items_written = items.size; }
  if (fans.size) {
    // a fan row we already have keeps what the new one doesn't say
    const ids = [...fans.keys()];
    const { data } = await supabaseAdmin.from('fansly_fans').select('*').eq('account_id', ctx.account.id).in('fansly_account_id', ids.slice(0, 1000));
    const old = new Map((data || []).map(r => [r.fansly_account_id, r]));
    const rows = [...fans.values()].map(f => {
      const o = old.get(f.fansly_account_id) || {};
      const merged = { ...o, ...Object.fromEntries(Object.entries(f).filter(([, v]) => v != null)) };
      if (o.raw && f.raw) merged.raw = { ...o.raw, ...f.raw };
      return merged;
    });
    await upsert('fansly_fans', rows, 'account_id,fansly_account_id');
    counts.fans_written = rows.length;
  }
  if (transactions.size) {
    const rows = [...transactions.values()];
    await creditTransactions(ctx, rows);
    await upsert('fansly_transactions', rows, 'account_id,transaction_id');
    counts.transactions_written = rows.length;
  }
  const patch = Object.fromEntries(Object.entries(accountPatch).filter(([, v]) => v !== undefined));
  await supabaseAdmin.from('fansly_accounts').update({ ...patch, last_seen_at: now }).eq('id', ctx.account.id);
  if (Object.keys(patch).length) forgetAccount(ctx.user.organisationId, ctx.creatorId);
  return { counts, errors };
}

/**
 * Whose salary a sale counts for: a media/bundle sale whose item was attached to a
 * message sent to that fan is a chat PPV, credited to that message's chatter.
 * Everything else is wall / subscription / other and credited to nobody.
 */
async function creditTransactions(ctx, rows) {
  const itemIds = [...new Set(rows.map(r => r.item_id).filter(Boolean))];
  if (!itemIds.length) { for (const r of rows) if (!r.category) r.category = r.type === 7101 || r.type === 7001 ? 'chat_tip' : 'other'; return; }
  const { data } = await supabaseAdmin.from('fansly_messages').select('message_id, fan_account_id, chatter_id, attachments, sent_at')
    .eq('account_id', ctx.account.id).eq('from_fan', false).not('attachments', 'is', null).order('sent_at', { ascending: false }).limit(5000);
  const byItem = new Map();
  for (const m of data || []) for (const a of m.attachments || []) {
    const k = `${a.content_id}:${m.fan_account_id}`;
    if (!byItem.has(k)) byItem.set(k, m);
  }
  for (const r of rows) {
    if (r.category && r.category !== 'other') continue;
    const m = r.item_id ? byItem.get(`${r.item_id}:${r.fan_account_id}`) : null;
    if (m) { r.category = 'chat_ppv'; r.credited_message_id = m.message_id; r.credited_chatter_id = m.chatter_id || null; r.credited_rule = m.chatter_id ? 'sender_of_message' : 'message_without_chatter'; }
    else if (r.type === 7101 || r.type === 7001) r.category = 'chat_tip';
    else if (r.item_id) { r.category = 'wall'; r.credited_rule = 'item_not_in_any_chat'; }
    else r.category = r.category || 'other';
  }
}

/**
 * Every row of one write must carry the same columns: when they differ, the API
 * fills the gaps with explicit nulls, which overrides the table's defaults
 * (first_seen_at became null and the write failed). Missing columns are filled
 * here on purpose: first_seen_at with now, anything else with null.
 */
function uniform(rows) {
  const keys = new Set(); for (const r of rows) for (const k of Object.keys(r)) keys.add(k);
  const now = new Date().toISOString();
  return rows.map(r => { const out = {}; for (const k of keys) out[k] = k in r && r[k] !== undefined ? r[k] : (k === 'first_seen_at' ? now : null); return out; });
}
async function upsert(table, rows, onConflict) {
  const all = uniform(rows);
  for (let i = 0; i < all.length; i += 500) {
    const { error } = await supabaseAdmin.from(table).upsert(all.slice(i, i + 500), { onConflict });
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

// ---------- presence ----------
const ONLINE_MS = 2 * 60_000;              // a heartbeat every minute; silent for two → offline

/** A heartbeat from a browser: keep its open row alive, or open one (closing a row for another account). */
async function heartbeat({ user, chatterId, deviceId, account, extensionVersion }) {
  const now = new Date().toISOString();
  const { data: open } = await supabaseAdmin.from('fansly_presence').select('id, account_id').eq('user_id', user.id).eq('device_id', deviceId).is('ended_at', null)
    .order('started_at', { ascending: false }).limit(5);
  const rows = open || [];
  const same = rows.find(r => (r.account_id || null) === (account?.id || null));
  const others = rows.filter(r => r !== same);
  if (others.length) await supabaseAdmin.from('fansly_presence').update({ ended_at: now, ended_reason: 'switched' }).in('id', others.map(r => r.id));
  if (same) {
    await supabaseAdmin.from('fansly_presence').update({ last_seen_at: now, chatter_id: chatterId || null, extension_version: extensionVersion || null }).eq('id', same.id);
    return same.id;
  }
  const { data, error } = await supabaseAdmin.from('fansly_presence').insert({ organisation_id: user.organisationId, account_id: account?.id || null, user_id: user.id, chatter_id: chatterId || null,
    device_id: deviceId, started_at: now, last_seen_at: now, extension_version: extensionVersion || null }).select('id').single();
  if (error) throw error;
  return data.id;
}

async function endPresence({ user, deviceId, reason = 'logout' }) {
  const now = new Date().toISOString();
  await supabaseAdmin.from('fansly_presence').update({ ended_at: now, ended_reason: reason }).eq('user_id', user.id).eq('device_id', deviceId).is('ended_at', null);
}

/** Close rows whose heartbeat stopped (run lazily when the dashboard asks). */
async function sweepPresence(orgId) {
  const cutoff = new Date(Date.now() - ONLINE_MS).toISOString();
  const { data } = await supabaseAdmin.from('fansly_presence').select('id, last_seen_at').eq('organisation_id', orgId).is('ended_at', null).lt('last_seen_at', cutoff);
  if (data?.length) await supabaseAdmin.from('fansly_presence').update({ ended_at: new Date().toISOString(), ended_reason: 'timeout' }).in('id', data.map(r => r.id));
}

module.exports = { applyEvents, inferAccountId, ensureAccount, forgetAccount, chatterFor, shiftsFor, shiftAt, heartbeat, endPresence, sweepPresence, messageRow, itemPrice, dollars, ONLINE_MS };
