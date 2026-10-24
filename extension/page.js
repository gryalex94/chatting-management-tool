/**
 * Runs inside the Fansly page itself (the page's own world, before its code
 * starts). It wraps the three ways the page talks to Fansly — fetch, XMLHttpRequest
 * and the live socket — and copies the answers we care about to the extension
 * (bridge.js → background.js). It changes nothing the page sends or receives,
 * and it never makes a request of its own.
 *
 * Big answers are trimmed here: media links (signed, short-lived) and the many
 * sizes of each picture are dropped; ids, prices, texts and times are kept.
 */
(() => {
  if (window.__cmtFanslyHooked) return;
  window.__cmtFanslyHooked = true;
  const TAG = 'cmt-fansly';
  const API = /^https:\/\/apiv3\.fansly\.com\/api\/v1\//;

  const post = (kind, url, data, extra) => {
    try { window.postMessage({ [TAG]: 1, kind, url, data, extra: extra || null, at: Date.now() }, '*'); } catch { /* ignore */ }
  };
  const query = (url) => { try { return Object.fromEntries(new URL(url).searchParams.entries()); } catch { return {}; } };
  const path = (url) => { try { return new URL(url).pathname.replace(/^\/api\/v1/, ''); } catch { return ''; } };

  // ---- trimming ----
  const slimMedia = (m) => m && ({ id: m.id, type: m.type, status: m.status, mimetype: m.mimetype, filename: m.filename, width: m.width, height: m.height, metadata: m.metadata, createdAt: m.createdAt });
  const slimAccountMedia = (am) => am && ({
    id: am.id, accountId: am.accountId, mediaId: am.mediaId, previewId: am.previewId, price: am.price, createdAt: am.createdAt, deleted: am.deleted,
    permissions: am.permissions, saleStats: am.saleStats, whitelist: am.whitelist, likeCount: am.likeCount, media: slimMedia(am.media), bundles: am.bundles && am.bundles.map(b => ({ id: b.id })),
  });
  const slimBundle = (b) => b && ({ id: b.id, accountId: b.accountId, price: b.price, createdAt: b.createdAt, accountMediaIds: b.accountMediaIds, permissions: b.permissions, saleStats: b.saleStats, deleted: b.deleted });
  const slimAccount = (a) => a && ({
    id: a.id, username: a.username, displayName: a.displayName, createdAt: a.createdAt, lastSeenAt: a.lastSeenAt, followsYou: a.followsYou,
    followCount: a.followCount, subscriberCount: a.subscriberCount, statusId: a.statusId, flags: a.flags, subscribed: a.subscribed, following: a.following,
  });
  const slimMessage = (m) => m && ({
    id: m.id, type: m.type, content: m.content, groupId: m.groupId, senderId: m.senderId, inReplyTo: m.inReplyTo, createdAt: m.createdAt,
    correlationId: m.correlationId, deletedAt: m.deletedAt,     // the mass message it belongs to · when it was unsent
    attachments: m.attachments, interactions: m.interactions, totalTipAmount: m.totalTipAmount, likes: m.likes && m.likes.length,
  });
  const slimTier = (t) => t && ({ id: t.id, name: t.name, color: t.color, price: t.price });
  const slimGroup = (g) => g && ({ id: g.id, type: g.type, createdBy: g.createdBy, users: g.users, userSettings: g.userSettings, lastMessage: slimMessage(g.lastMessage) });

  const listOf = (r, ...keys) => { if (Array.isArray(r)) return r; for (const k of keys) if (r && Array.isArray(r[k])) return r[k]; return []; };
  // the first list of objects in an answer whose shape is not known yet
  const firstList = (r) => { if (Array.isArray(r)) return r; for (const v of Object.values(r || {})) if (Array.isArray(v) && v.length && typeof v[0] === 'object') return v; return []; };
  const parseBody = (b) => { try { return typeof b === 'string' ? JSON.parse(b) : null; } catch { return null; } };

  /** Which answers we keep, and how. Returns null for anything else. `sent` = the request body (POST). */
  function pick(method, url, body, sent) {
    if (!API.test(url) || !body || body.success === false) return null;
    const p = path(url), r = body.response, q = query(url);
    if (method === 'GET') {
      // the vault, as Fansly's own page loads it (albums; one page of an album's media)
      if (p === '/vault/albumsnew' && r) return { kind: 'vault_albums', data: { albums: (r.albums || []).map(a => ({ id: a.id, type: a.type, title: a.title, itemCount: a.itemCount, pos: a.pos })) } };
      if (p === '/media/vaultnew' && r) return { kind: 'vault_media', data: { albumId: q.albumId || null, media: (r.media || []).map(slimMedia), albumMedia: (r.albumMedia || []).map(x => ({ mediaId: x.mediaId, albumId: x.albumId, customFilename: x.customFilename })) } };
      if (p === '/account/me' && r && r.account) return { kind: 'me', data: { ...slimAccount(r.account), subscriptionTiers: (r.account.subscriptionTiers || []).map(slimTier) } };
      if (p === '/subscriptions/tiers' && r) return { kind: 'tiers', data: { tiers: firstList(r).map(slimTier) } };
      if (p === '/messaging/groups' && r) return { kind: 'groups', data: { data: r.data, aggregationData: { accounts: (r.aggregationData && r.aggregationData.accounts || []).map(slimAccount), groups: (r.aggregationData && r.aggregationData.groups || []).map(slimGroup) } } };
      if (/^\/group\/\d+\/?$/.test(p) && r) return { kind: 'group', data: slimGroup(r) };
      // accountMediaOrders: what the fan in this chat bought (Fansly's "This user has purchased this media")
      if (p === '/message' && r && r.messages) return { kind: 'messages', data: { groupId: q.groupId || null, before: q.before || null, limit: q.limit || null, messages: r.messages.map(slimMessage), accountMedia: (r.accountMedia || []).map(slimAccountMedia), accountMediaBundles: (r.accountMediaBundles || []).map(slimBundle), tips: r.tips || [], accountMediaOrders: r.accountMediaOrders || [] } };
      if (/^\/message\/broadcast\/stats(\/deleted)?$/.test(p) && r) return { kind: 'broadcasts', data: { deleted: /deleted$/.test(p), items: firstList(r) } };
      if (p === '/message/unread' && r) return { kind: 'unread', data: { messageInteractions: r.messageInteractions || [] } };
      if (p === '/subscribers' && r) return { kind: 'subscribers', data: { stats: r.stats, subscriptions: r.subscriptions || [], limit: q.limit || null } };
      // Fansly's own notes on fans, the fan lists, followers, notifications, statistics: mirrored as shown
      if (/^\/notes\/?$/.test(p) && r) return { kind: 'fnotes', data: { notes: listOf(r, 'notes', 'data'), query: q } };
      if (p === '/lists/account' && r) return { kind: 'lists', data: { lists: listOf(r, 'lists', 'data') } };
      if (p === '/lists/itemsnew' && r) return { kind: 'list_items', data: { listId: q.listId || null, offset: q.offset || null, items: listOf(r, 'items', 'listItems', 'data'), accounts: listOf(r && r.aggregationData || r, 'accounts').map(slimAccount) } };
      if (/^\/account\/\d+\/followersnew$/.test(p) && r) return { kind: 'followers', data: { followers: listOf(r, 'followers', 'data'), accounts: listOf(r && r.aggregationData || r, 'accounts').map(slimAccount) } };
      if (p === '/notifications' && r) return { kind: 'notifications', data: { notifications: listOf(r, 'notifications', 'data'), accounts: listOf(r && r.aggregationData || {}, 'accounts').map(slimAccount) } };
      if (p === '/account/stats/summary' && r) return { kind: 'stats', data: { kind: 'summary', after: q.after || null, before: q.before || null, stats: r } };
      if (p === '/account/stats/fans/top' && r) return { kind: 'stats', data: { kind: 'top_fans', after: q.after || null, before: q.before || null, stats: r } };
      if (p === '/account/wallets/earnings/transactions' && r) return { kind: 'ledger', data: { total: r.total, limit: q.limit || null, data: r.data || [], aggregationData: { accounts: (r.aggregationData && r.aggregationData.accounts || []).map(slimAccount), accountMedia: (r.aggregationData && r.aggregationData.accountMedia || []).map(slimAccountMedia), accountMediaBundles: (r.aggregationData && r.aggregationData.accountMediaBundles || []).map(slimBundle), subscriptionHistory: r.aggregationData && r.aggregationData.subscriptionHistory || [] } } };
      return null;
    }
    if (method === 'POST') {
      if (p === '/message' && r && r.id) return { kind: 'sent', data: slimMessage(r) };
      if (p === '/account/media' && Array.isArray(r)) return { kind: 'media_created', data: r.map(slimAccountMedia) };
      if ((p === '/notes' || p === '/notes/edit') && r) return { kind: 'fnotes', data: { notes: listOf(r, 'notes', 'data').length ? listOf(r, 'notes', 'data') : (r.id ? [r] : []), saved: true } };
      if (p === '/message/delete') { const b = parseBody(sent) || {}; return { kind: 'msg_deleted', data: { messageId: b.messageId || b.id || null } }; }
      if (p === '/notes/delete') { const b = parseBody(sent) || {}; return { kind: 'fnote_deleted', data: { id: b.id || b.noteId || null, ids: b.ids || null } }; }
      return null;
    }
    return null;
  }

  // "what the page requested" (logged only while switched on in the popup): address, settings, list sizes; no bodies
  const lists = (r) => {
    const out = {};
    const add = (o, pre) => { for (const [k, v] of Object.entries(o || {})) if (Array.isArray(v)) out[pre + k] = v.length; };
    if (Array.isArray(r)) out.response = r.length; else if (r && typeof r === 'object') { add(r, ''); if (r.aggregationData) add(r.aggregationData, 'aggregationData.'); if (r.total != null) out.total = r.total; }
    return out;
  };
  // the outline of a request or answer, for building from Fansly's real data (logged only while switched on):
  // field names and kinds of value; numbers only for settings and money (price, limit, type…), never texts, names or ids
  const KEEP_NUM = /^(price|amount|.*price|.*amount|limit|offset|type|.*type|status|permission.*|flags?|count|total|duration|.*count|width|height|mimetype|access|visibility|.*permissions?)$/i;
  function shapeOf(v, key = '', depth = 0) {
    if (v == null) return null;
    if (Array.isArray(v)) return v.length ? [shapeOf(v[0], key, depth + 1), `×${v.length}`] : [];
    if (typeof v === 'object') {
      if (depth > 5) return '{…}';
      const o = {};
      for (const [k, x] of Object.entries(v).slice(0, 60)) o[k] = shapeOf(x, k, depth + 1);
      return o;
    }
    if (typeof v === 'number') return KEEP_NUM.test(key) ? v : 'number';
    if (typeof v === 'boolean') return v;
    if (typeof v === 'string') return /^\d{10,25}$/.test(v) ? 'id' : `text(${v.length})`;
    return typeof v;
  }
  const handle = (method, url, text, sent, status) => {
    if (!API.test(url)) return;
    let body; try { body = JSON.parse(text); } catch { return; }
    post('net', url, { method: String(method || 'GET').toUpperCase(), path: path(url), query: query(url), status: status || null, page: location.pathname, rows: lists(body && body.response),
      shape: { sent: shapeOf(parseBody(sent)), got: shapeOf(body && body.response) } });
    const got = pick(String(method || 'GET').toUpperCase(), url, body, sent);
    if (got) post(got.kind, url, got.data);
    // purchases riding along on any other answer (the app caches them from aggregationData too)
    const extra = body && body.response && body.response.aggregationData && body.response.aggregationData.accountMediaOrders;
    if (Array.isArray(extra) && extra.length) post('orders', url, { accountMediaOrders: extra });
  };

  // ---- secure mode (a chatter's browser): Fansly's money, statistics, account and logout requests are stopped ----
  // The state comes from the extension (bridge.js). Until it arrives (a moment after the page starts) a
  // sensitive request waits for it, at most 2 s, then counts as locked: nothing opens by default.
  const SENSITIVE = /^\/(account\/)?(wallets?|payouts?|payments?|billing|tax|taxes|stats|earnings|banking)(\/|$)|\/(password|email|twofa|2fa|totp|security|logout|management|managementsessions?|managementsession)(\/|$)|^\/account\/delete/i;
  let chatOnly = null, chatOnlyKnown;
  const known = new Promise((res) => { chatOnlyKnown = res; });
  setTimeout(() => { if (chatOnly === null) { chatOnly = true; chatOnlyKnown(); } }, 2000);
  window.addEventListener('message', (ev) => {
    if (ev.source === window && ev.data && ev.data['cmt-secure'] === 1) { chatOnly = !!ev.data.chatOnly; chatOnlyKnown(); }
  });
  const sensitive = (url) => API.test(url) && SENSITIVE.test(path(url));
  // Fansly moves between its pages without loading one: tell bridge.js at once, so a chatter's browser
  // goes back to the chats before the other page shows
  for (const k of ['pushState', 'replaceState']) {
    const real = history[k];
    history[k] = function (...a) { const r = real.apply(this, a); try { window.postMessage({ 'cmt-route': 1 }, '*'); } catch { /* ignore */ } return r; };
  }
  window.addEventListener('popstate', () => window.postMessage({ 'cmt-route': 1 }, '*'));
  const blockedBody = () => JSON.stringify({ success: false, error: { code: 403, details: 'Not available while chatting (Chatting Manager)' } });

  // ---- fetch ----
  const realFetch = window.fetch;
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    const method = (init && init.method) || (input && input.method) || 'GET';
    const sent = init && typeof init.body === 'string' ? init.body : null;
    if (sensitive(url)) {
      const self = this, args = arguments;
      return known.then(() => (chatOnly ? new Response(blockedBody(), { status: 403, headers: { 'Content-Type': 'application/json' } }) : realFetch.apply(self, args)));
    }
    const result = realFetch.apply(this, arguments);
    if (API.test(url)) result.then(res => { try { res.clone().text().then(t => handle(method, url, t, sent, res.status)).catch(() => {}); } catch { /* ignore */ } }).catch(() => {});
    return result;
  };

  // ---- XMLHttpRequest (Angular's HttpClient uses it) ----
  const XO = XMLHttpRequest.prototype.open, XS = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) { this.__cmt = { method, url: String(url) }; return XO.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function (reqBody) {
    const info = this.__cmt;
    if (info && sensitive(info.url)) {
      // wait for the state; a chatter's request fails like a refused one, an owner's goes out as normal
      const xhr = this, args = arguments;
      known.then(() => {
        if (!chatOnly) return XS.apply(xhr, args);
        for (const t of ['error', 'loadend']) try { xhr.dispatchEvent(new ProgressEvent(t)); } catch { /* ignore */ }
      });
      return undefined;
    }
    if (info && API.test(info.url)) {
      const sent = typeof reqBody === 'string' ? reqBody : null;
      this.addEventListener('load', () => {
        try { if (this.responseType === '' || this.responseType === 'text') handle(info.method, info.url, this.responseText, sent, this.status); else if (this.responseType === 'json' && this.response) handle(info.method, info.url, JSON.stringify(this.response), sent, this.status); } catch { /* ignore */ }
      });
    }
    return XS.apply(this, arguments);
  };

  // ---- the live socket: new messages (service 5, type 1) and purchases (service 2, type 7) ----
  const RealWS = window.WebSocket;
  function WrappedWS(url, protocols) {
    const ws = protocols === undefined ? new RealWS(url) : new RealWS(url, protocols);
    if (/fansly\.com/.test(String(url))) {
      ws.addEventListener('message', (ev) => {
        try {
          const frame = JSON.parse(ev.data);
          if (frame.t !== 10000) return;
          const d = typeof frame.d === 'string' ? JSON.parse(frame.d) : frame.d;
          const e = typeof d.event === 'string' ? JSON.parse(d.event) : d.event;
          if (!e) return;
          if (d.serviceId === 5 && e.type === 1 && e.message) post('ws_message', String(url), slimMessage(e.message));
          else if (d.serviceId === 2 && e.type === 7 && e.order) post('ws_order', String(url), e.order);
          else if ([2, 6, 7, 9, 14, 15].includes(d.serviceId)) post('ws_other', String(url), { serviceId: d.serviceId, type: e.type, event: e });   // purchases, wallet, tips, notifications: shapes still being learned
        } catch { /* not ours */ }
      });
    }
    return ws;
  }
  WrappedWS.prototype = RealWS.prototype;
  for (const k of ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED']) WrappedWS[k] = RealWS[k];
  window.WebSocket = WrappedWS;
})();
