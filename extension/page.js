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
    attachments: m.attachments, interactions: m.interactions, totalTipAmount: m.totalTipAmount, likes: m.likes && m.likes.length,
  });
  const slimGroup = (g) => g && ({ id: g.id, type: g.type, createdBy: g.createdBy, users: g.users, userSettings: g.userSettings, lastMessage: slimMessage(g.lastMessage) });

  /** Which answers we keep, and how. Returns null for anything else. */
  function pick(method, url, body) {
    if (!API.test(url) || !body || body.success === false) return null;
    const p = path(url), r = body.response, q = query(url);
    if (method === 'GET') {
      if (p === '/account/me' && r && r.account) return { kind: 'me', data: slimAccount(r.account) };
      if (p === '/messaging/groups' && r) return { kind: 'groups', data: { data: r.data, aggregationData: { accounts: (r.aggregationData && r.aggregationData.accounts || []).map(slimAccount), groups: (r.aggregationData && r.aggregationData.groups || []).map(slimGroup) } } };
      if (/^\/group\/\d+\/?$/.test(p) && r) return { kind: 'group', data: slimGroup(r) };
      if (p === '/message' && r && r.messages) return { kind: 'messages', data: { groupId: q.groupId || null, before: q.before || null, messages: r.messages.map(slimMessage), accountMedia: (r.accountMedia || []).map(slimAccountMedia), accountMediaBundles: (r.accountMediaBundles || []).map(slimBundle), tips: r.tips || [] } };
      if (p === '/message/unread' && r) return { kind: 'unread', data: { messageInteractions: r.messageInteractions || [] } };
      if (p === '/subscribers' && r) return { kind: 'subscribers', data: { stats: r.stats, subscriptions: r.subscriptions || [] } };
      if (p === '/account/wallets/earnings/transactions' && r) return { kind: 'ledger', data: { total: r.total, data: r.data || [], aggregationData: { accounts: (r.aggregationData && r.aggregationData.accounts || []).map(slimAccount), accountMedia: (r.aggregationData && r.aggregationData.accountMedia || []).map(slimAccountMedia), accountMediaBundles: (r.aggregationData && r.aggregationData.accountMediaBundles || []).map(slimBundle), subscriptionHistory: r.aggregationData && r.aggregationData.subscriptionHistory || [] } } };
      return null;
    }
    if (method === 'POST') {
      if (p === '/message' && r && r.id) return { kind: 'sent', data: slimMessage(r) };
      if (p === '/account/media' && Array.isArray(r)) return { kind: 'media_created', data: r.map(slimAccountMedia) };
      return null;
    }
    return null;
  }

  const handle = (method, url, text) => {
    if (!API.test(url)) return;
    let body; try { body = JSON.parse(text); } catch { return; }
    const got = pick(String(method || 'GET').toUpperCase(), url, body);
    if (got) post(got.kind, url, got.data);
  };

  // ---- fetch ----
  const realFetch = window.fetch;
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    const method = (init && init.method) || (input && input.method) || 'GET';
    const result = realFetch.apply(this, arguments);
    if (API.test(url)) result.then(res => { try { res.clone().text().then(t => handle(method, url, t)).catch(() => {}); } catch { /* ignore */ } }).catch(() => {});
    return result;
  };

  // ---- XMLHttpRequest (Angular's HttpClient uses it) ----
  const XO = XMLHttpRequest.prototype.open, XS = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) { this.__cmt = { method, url: String(url) }; return XO.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function () {
    const info = this.__cmt;
    if (info && API.test(info.url)) {
      this.addEventListener('load', () => {
        try { if (this.responseType === '' || this.responseType === 'text') handle(info.method, info.url, this.responseText); else if (this.responseType === 'json' && this.response) handle(info.method, info.url, JSON.stringify(this.response)); } catch { /* ignore */ }
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
