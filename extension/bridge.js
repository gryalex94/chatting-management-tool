/**
 * The bridge between the page script (which lives in the page's world and cannot
 * reach the extension) and the background worker. It forwards what the page
 * copies, and types a script or suggestion from the side panel into Fansly's
 * message box (the chatter still presses send).
 */
(() => {
  // once per page: after an update the extension puts this script into open Fansly tabs again (background.js)
  if (window.__cmtBridgeLive) return;
  window.__cmtBridgeLive = true;
  const TAG = 'cmt-fansly';
  window.addEventListener('message', (ev) => {
    if (ev.source !== window || !ev.data || ev.data[TAG] !== 1) return;
    const { kind, url, data, extra, at } = ev.data;
    try { chrome.runtime.sendMessage({ type: 'fansly-event', kind, url, data, extra, at }); } catch { /* the worker is restarting; the page will send more */ }
  });
  // Tell the worker a Fansly tab is alive (for presence) even before the page talks.
  try { chrome.runtime.sendMessage({ type: 'fansly-tab', url: location.href }); } catch { /* ignore */ }

  // ---- the side panel asks: put this text in the message box ----
  function messageBox() {
    const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 40 && r.height > 10 && r.bottom > 0 && r.top < innerHeight; };
    const host = document.getElementById('cmt-panel-host');
    const boxes = [...document.querySelectorAll('textarea, [contenteditable="true"], [contenteditable=""]')].filter(el => !(host && host.contains(el)) && visible(el));
    // the chat's box sits at the bottom of the conversation: take the lowest one
    return boxes.sort((a, b) => b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom)[0] || null;
  }
  function insert(text) {
    const box = messageBox();
    if (!box) return false;
    box.focus();
    let ok = false;
    try { ok = document.execCommand('insertText', false, text); } catch { ok = false; }
    if (!ok && box.tagName === 'TEXTAREA') {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
      setter.call(box, (box.value ? box.value + ' ' : '') + text);
      box.dispatchEvent(new Event('input', { bubbles: true }));
      ok = true;
    }
    return ok;
  }
  // ---- "Read from Fansly": in a tab the extension opened for it, scroll the page's list to its end ----
  // Fansly's own app loads each next page as the list scrolls (as for a person); page.js records it.
  let stopped = false;
  // the list's total ("755 sales") can arrive before a read starts: noted from the first moment
  let ledgerTotal = null;
  window.addEventListener('message', (ev) => { if (ev.source === window && ev.data && ev.data[TAG] === 1 && ev.data.kind === 'ledger' && Number(ev.data.data && ev.data.data.total) > 0) ledgerTotal = Number(ev.data.data.total); });
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const humanPause = () => sleep(2200 + Math.random() * 1800);              // 2–4 s between scrolls
  const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const clickText = (re) => {
    const el = [...document.querySelectorAll('a, button, [role="button"], .tab, li, span, div')]
      .find(x => x.childElementCount <= 2 && re.test((x.textContent || '').trim()) && visible(x) && !(document.getElementById('cmt-panel-host') || { contains: () => false }).contains(x));
    if (el) { el.click(); return true; }
    return false;
  };
  // the "View all" inside the box whose heading matches (e.g. "Recent purchases"), else none
  const clickNear = (heading, re) => {
    const head = [...document.querySelectorAll('h1, h2, h3, h4, div, span')].find(x => x.childElementCount === 0 && heading.test((x.textContent || '').trim()) && visible(x));
    for (let box = head && head.parentElement; box && box !== document.body; box = box.parentElement) {
      const link = [...box.querySelectorAll('a, button, [role="button"], span, div')].find(x => x.childElementCount <= 2 && re.test((x.textContent || '').trim()) && visible(x));
      if (link) { link.click(); return true; }
    }
    return false;
  };
  // a list with numbered pages ("1–10 of 756" and arrows): where it stands, and its "next" control
  function pager() {
    const label = [...document.querySelectorAll('div, span, p')].find(x => x.childElementCount === 0 && /^\d+\s*[–-]\s*\d+\s+of\s+\d+$/i.test((x.textContent || '').trim()) && visible(x));
    if (!label) return null;
    const [, from, to, total] = (label.textContent.trim().match(/^(\d+)\s*[–-]\s*(\d+)\s+of\s+(\d+)$/i) || []).map(Number);
    // the pager's controls sit next to the label; "next" is the last one (an arrow), or one that says so
    let box = label.parentElement, next = null;
    for (let i = 0; i < 4 && box && !next; i++, box = box.parentElement) {
      const ctrls = [...box.querySelectorAll('button, a, [role="button"], li, .pagination-item, span')].filter(x => visible(x) && x !== label && !label.contains(x));
      next = ctrls.find(x => /next/i.test(x.getAttribute('aria-label') || x.getAttribute('title') || '')) || ctrls.find(x => /^[›>»→]$/.test((x.textContent || '').trim()))
        || (ctrls.length > 2 ? ctrls.filter(x => x.childElementCount <= 1 && !/^\d+$|^…$|^\.\.\.$/.test((x.textContent || '').trim())).pop() : null);
    }
    const disabled = !next || next.disabled || next.getAttribute('aria-disabled') === 'true' || /disabled/.test(next.className || '');
    return { from, to, total, next: disabled ? null : next };
  }
  function scrollEverything() {
    const boxes = [...document.querySelectorAll('*')].filter(el => el.scrollHeight > el.clientHeight + 40 && /(auto|scroll)/.test(getComputedStyle(el).overflowY));
    for (const el of boxes) { el.scrollTop = el.scrollHeight; el.dispatchEvent(new Event('scroll', { bubbles: true })); }
    window.scrollTo(0, document.documentElement.scrollHeight);
    window.dispatchEvent(new Event('scroll'));
  }
  async function runFetch(job) {
    const p = { rows: 0, total: ledgerTotal, pages: 0, note: 'starting' };
    let lastSize = null, lastLimit = null, seenStats = 0;
    const ids = new Set();
    const sales = job.kind === 'ledger' || job.kind === 'ledger_all';
    const want = sales ? 'ledger' : job.kind === 'subscribers' ? 'subscribers' : 'stats';
    let oldestAt = null;                                                    // the oldest sale seen so far (ms)
    window.addEventListener('message', (ev) => {
      if (ev.source !== window || !ev.data || ev.data[TAG] !== 1 || ev.data.kind !== want) return;
      const d = ev.data.data || {};
      if (want === 'stats') { seenStats += 1; return; }
      const rows = (want === 'ledger' ? d.data : d.subscriptions) || [];
      const limit = Number(d.limit) || null;
      if (want === 'ledger' && Number(d.total) > 0) p.total = Number(d.total);
      if (want === 'ledger' && !p.total && ledgerTotal) p.total = ledgerTotal;
      if (limit && limit <= 5) return;                                      // the small "recent purchases" box, not the list
      // each sale (or subscription) once, by its id: the CSV and the first pages hold the same newest ones
      for (const r of rows) {
        ids.add(String((r && (r.transactionId || r.id)) ?? `${ids.size}:${Math.random()}`));
        const t = Number(r && r.createdAt); if (t && (!oldestAt || t < oldestAt)) oldestAt = t;
      }
      p.rows = ids.size; p.pages += 1; lastSize = rows.length; lastLimit = limit;
    });
    const report = (note) => { p.note = note; try { chrome.runtime.sendMessage({ type: 'fetch-progress', progress: { ...p } }); } catch { /* worker restarting */ } };
    const done = (status, note, error) => { p.note = note; try { chrome.runtime.sendMessage({ type: 'fetch-done', status, progress: { ...p }, error }); } catch { /* ignore */ } };
    report('waiting for Fansly to load');
    await sleep(5000);
    // a page Fansly doesn't have (its routes change): stop at once and say so
    if (/does not exist/i.test(document.body ? document.body.innerText : '')) return done('failed', 'Fansly says this page does not exist', `Fansly has no page at ${location.pathname}: the extension needs its new address`);
    if (job.kind === 'statistics') {
      // the page loads its summary and top fans by itself; the 90-day view gives a second, longer snapshot
      for (let i = 0; i < 10 && !seenStats; i++) await sleep(1000);
      if (clickText(/^90 days$/i)) { report('reading the 90-day view'); await sleep(5000); }
      // Overview first, then the Earnings tab (its own summary and top fans)
      if (seenStats && !/\/creator\/stats\/earnings/.test(location.pathname) && !sessionStorage.getItem('cmtStatsEarnings')) {
        sessionStorage.setItem('cmtStatsEarnings', '1');
        report('reading the Earnings tab');
        location.href = 'https://fansly.com/creator/stats/earnings';
        return;                                                                // this tab reloads and the read goes on there
      }
      sessionStorage.removeItem('cmtStatsEarnings');
      return done(seenStats ? 'done' : 'failed', seenStats ? 'statistics read' : 'the statistics did not load', seenStats ? null : 'Fansly\'s statistics did not load in this tab');
    }
    // the sales list (Fansly's wallet history, from its real traffic on 24 Oct): 10 per page on screen, 30 per request,
    // each request continuing from the last sale; pressing "next" asks for more every 3 pages. "Earnings" stops once it
    // is past 45 days back (the sales before are read already); "Earnings, everything" goes to the last page.
    const RECENT_MS = 45 * 86400_000;
    if (sales) clickText(/^wallet history$/i);
    // subscribers: each tab is its own list (Active = status 3,4; Expired = 5; All = 3,4,5), 100 per request as it scrolls
    if (job.kind === 'subscribers') { for (let i = 0; i < 8 && !clickText(/^all\s*\(\d+\)$/i); i++) await sleep(1000); await sleep(3000); }
    // a list with numbered pages (the wallet history, maybe subscribers): press "next" to the last page
    if (job.kind !== 'statistics') {
      for (let i = 0; i < (sales ? 8 : 3) && !pager(); i++) await sleep(1000);
      if (pager()) {
        const stopAt = Date.now() + 15 * 60_000;
        let pg = pager(), stuck = 0, lastTo = -1;
        while (!stopped && pg && Date.now() < stopAt) {
          if (pg.total) p.total = pg.total;
          p.rows = Math.max(ids.size, pg.to);                                 // sales read (each once), at least as far as this page
          p.note = `page ${Math.ceil(pg.to / Math.max(1, pg.to - pg.from + 1))} of ${Math.ceil(pg.total / Math.max(1, pg.to - pg.from + 1))}`;
          report(p.note);
          if (pg.to >= pg.total) return done('done', 'every page read');
          if (job.kind === 'ledger' && oldestAt && Date.now() - oldestAt > RECENT_MS) return done('done', 'read back past 45 days');
          if (!pg.next) return done(pg.to >= pg.total ? 'done' : 'failed', 'no next page button', `Stopped at ${pg.to} of ${pg.total}: the next-page button wasn't found`);
          pg.next.click();
          await humanPause();
          pg = pager();
          stuck = pg && pg.to === lastTo ? stuck + 1 : 0;
          lastTo = pg ? pg.to : lastTo;
          if (stuck >= 4) return done('failed', 'the page did not move on', `Stopped at ${lastTo} of ${p.total}: the next page didn't load`);
        }
        return done(stopped ? 'cancelled' : 'done', stopped ? 'stopped' : 'time limit reached');
      }
    }
    const end = Date.now() + 10 * 60_000;
    let still = 0, before = -1, viewAllTried = false;
    while (!stopped && Date.now() < end) {
      // the whole list sits behind "View all" on the statistics page; elsewhere it is on the page itself
      if (!viewAllTried && p.pages === 0) {
        viewAllTried = true;
        const opened = sales ? (clickNear(/^recent purchases$/i, /^view all\b/i) || clickText(/^view all\b/i)) : job.kind === 'subscribers' ? false : clickText(/^view all\b/i);
        if (opened) { report('opening the full list'); await sleep(4000); }
      }
      scrollEverything();
      clickText(/^(show|load) more$/i);
      await humanPause();
      if (lastLimit && lastSize != null && lastSize < lastLimit) { sessionStorage.removeItem('cmtLedgerFallback'); return done('done', 'reached the end of the list'); }
      if (p.total && p.rows >= p.total) { sessionStorage.removeItem('cmtLedgerFallback'); return done('done', 'every sale read'); }
      still = p.rows === before ? still + 1 : 0;
      before = p.rows;
      report(p.pages ? 'scrolling' : 'looking for the list');
      if (still >= 6) {
        // the sales list: if the statistics page showed none, Fansly's wallet history is the other place it lives (tried once)
        if (!p.pages && sales && !sessionStorage.getItem('cmtLedgerFallback')) {
          sessionStorage.setItem('cmtLedgerFallback', '1');
          report('trying the statistics page');
          location.href = 'https://fansly.com/creator/stats/earnings';
          return;                                                              // this tab reloads and the read goes on there
        }
        sessionStorage.removeItem('cmtLedgerFallback');
        return done(p.pages ? 'done' : 'failed', p.pages ? 'nothing more loaded' : 'no list found', p.pages ? null : `No list loaded on ${location.pathname}. Open it by hand and scroll it to the end.`);
      }
    }
    done(stopped ? 'cancelled' : 'done', stopped ? 'stopped' : 'time limit (10 min) reached');
  }
  // ---- secure mode: a chatter's browser sees the chat side of Fansly only ----
  // Who is a chatter comes from the extension (background.js asks our server). Until it answers, the page
  // counts as a chatter's: nothing opens by default. page.js stops the money/account requests themselves.
  let chatOnly = true;
  const OPEN_PATHS = /^\/messages(\/|$)/;                       // the chats (the vault picker opens inside them)
  // Fansly's menu and buttons a chatter never needs: money, statistics, settings, the account, logging out
  const HIDE = new Set(['profile', 'subscriptions', 'media vault', 'media collection', 'lists', 'bookmarks', 'notifications', 'creator',
    'creator dashboard', 'co-performers', 'earning statistics', 'earnings', 'profile statistics', 'statistics', 'tracking links', 'scheduled post queue',
    'tax documentation', 'payments', 'payouts', 'wallet', 'settings', 'creator hub (fansly guide)', 'creator hub', 'contact support', 'help center',
    'merch store', 'logout', 'log out', 'sign out', 'switch account', 'add account', 'switch accounts', 'management sessions',
    'leaderboard', 'referrals', 'terms', 'privacy policy', 'profile statistics beta', 'home', 'explore', 'search',
    // the same menu when Fansly runs in German
    'profil', 'abonnements', 'abos', 'medientresor', 'mediensammlung', 'listen', 'lesezeichen', 'benachrichtigungen', 'ersteller',
    'creator-dashboard', 'statistiken', 'einnahmen', 'einnahmestatistiken', 'profilstatistiken', 'tracking-links', 'geplante beiträge',
    'steuerunterlagen', 'steuerdokumente', 'zahlungen', 'auszahlungen', 'geldbörse', 'einstellungen', 'support kontaktieren',
    'hilfe-center', 'hilfecenter', 'hilfe', 'abmelden', 'ausloggen', 'konto wechseln', 'konto hinzufügen', 'verwaltungssitzungen',
    // Spanish and Russian, in case a chatter's Fansly runs in theirs
    'perfil', 'suscripciones', 'listas', 'marcadores', 'notificaciones', 'estadísticas', 'ganancias', 'pagos', 'billetera', 'cartera',
    'configuración', 'ajustes', 'cerrar sesión', 'cambiar de cuenta', 'профиль', 'подписки', 'списки', 'закладки', 'уведомления',
    'статистика', 'доходы', 'заработок', 'платежи', 'выплаты', 'кошелёк', 'кошелек', 'настройки', 'выйти', 'выход', 'сменить аккаунт']);
  // and by where a link goes, whatever the language: everything in Fansly's menus but the chats
  const HIDE_PATHS = /^\/(settings|leaderboard|terms|privacy|tos|creator|wallet|payments?|payouts?|statistics|earnings|notifications|lists|bookmarks|subscriptions|vault|mediavault|collection|tracking|tax|support|help|referrals?|explore|home|search|management)(\/|$)/i;
  // logout and account-switch buttons by their icon
  const HIDE_ICONS = '[class*="sign-out"], [class*="right-from-bracket"], [class*="arrow-right-from"], [class*="fa-wallet"]';  // (not the dollar icon: the PPV price button uses it)
  const secureStyle = document.createElement('style');
  // by Fansly's own building blocks, so nothing shows even for a moment: the wallet balance, every top-bar
  // and account-menu item but the messages, the account menu itself; and the whole page while it is
  // on its way back from somewhere that isn't the chats
  secureStyle.textContent = '.cmt-hidden{display:none!important}.cmt-masked{visibility:hidden!important}'
    + 'html.cmt-chat-only app-balance-display,'
    + 'html.cmt-chat-only app-nav-bar-top [data-menu-item]:not([data-menu-item*="message" i]):not([data-menu-item*="chat" i]),'
    + 'html.cmt-chat-only app-nav-bar-top app-account-avatar,'
    + 'html.cmt-chat-only app-nav-bar-top .user-dropdown, html.cmt-chat-only app-nav-bar-top [class*="dropdown-menu"],'
    + 'html.cmt-chat-only app-nav-bar-mobile{display:none!important}'
    + 'html.cmt-away app-root{visibility:hidden!important}';
  (document.head || document.documentElement).append(secureStyle);
  document.documentElement.classList.add('cmt-chat-only');
  let lastOpen = OPEN_PATHS.test(location.pathname) ? location.pathname : '/messages';
  const route = () => {
    if (OPEN_PATHS.test(location.pathname)) { lastOpen = location.pathname; document.documentElement.classList.remove('cmt-away'); return; }
    if (!chatOnly) return;
    document.documentElement.classList.add('cmt-away');   // hidden until it is back
    // Fansly sends a browser signed out of Fansly from the chats to its front page: don't bounce forever
    let n = []; try { n = JSON.parse(sessionStorage.getItem('cmtBounce') || '[]').filter(t => Date.now() - t < 10000); } catch { /* ignore */ }
    if (n.length >= 3) { document.documentElement.classList.remove('cmt-away'); return; }
    try { sessionStorage.setItem('cmtBounce', JSON.stringify([...n, Date.now()])); } catch { /* ignore */ }
    location.replace(lastOpen);                           // back to the chat they were in
  };
  // page.js says at once when Fansly changes its address (not only on the 400 ms check)
  window.addEventListener('message', (ev) => { if (ev.source === window && ev.data && ev.data['cmt-route'] === 1) route(); });
  function hideForChatters() {
    document.documentElement.classList.toggle('cmt-chat-only', !!chatOnly);
    if (!chatOnly) {
      document.documentElement.classList.remove('cmt-away');
      document.querySelectorAll('.cmt-hidden, .cmt-masked').forEach(el => el.classList.remove('cmt-hidden', 'cmt-masked'));
      return;
    }
    if (!secureStyle.isConnected) (document.head || document.documentElement).append(secureStyle);
    const host = document.getElementById('cmt-panel-host');
    // menu items by their words (the item, not the whole menu)
    for (const el of document.querySelectorAll('a, button, [role="menuitem"], [role="button"], li, span, div')) {
      if (el.children.length > 3 || (host && host.contains(el))) continue;
      const t = String(el.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
      if (!t || t.length > 30 || !HIDE.has(t)) continue;
      const item = el.closest('a, button, [role="menuitem"], [role="button"], li') || el;
      item.classList.add('cmt-hidden');
    }
    for (const a of document.querySelectorAll('a[href]')) {
      if (host && host.contains(a)) continue;
      let u; try { u = new URL(a.getAttribute('href'), location.href); } catch { continue; }
      if (u.origin === location.origin && HIDE_PATHS.test(u.pathname)) a.classList.add('cmt-hidden');
    }
    for (const i of document.querySelectorAll(HIDE_ICONS)) {
      if (host && host.contains(i)) continue;
      const item = i.closest('a, button, [role="menuitem"], [role="button"], li');
      if (item && !(host && host.contains(item)) && !item.closest('form, [contenteditable]')) item.classList.add('cmt-hidden');
    }
    // the wallet balance at the top of the page ("$49.84", "49,84 $", "49,84 €")
    for (const el of document.querySelectorAll('div, span, a, button')) {
      if (el.children.length > 2 || (host && host.contains(el))) continue;
      if (!/^(\$\s?[\d.,]+|[\d.,]+\s?[$€])$/.test(String(el.textContent || '').trim())) continue;
      if (el.getBoundingClientRect().top < 90) (el.closest('a, button, [role="button"]') || el).classList.add('cmt-masked');
    }
    for (const v of document.querySelectorAll('video:not([controlslist~="nodownload"])')) v.setAttribute('controlslist', 'nodownload noplaybackrate');
  }
  let hideTimer = null;
  // once per frame, before it is drawn, so a menu that opens never shows its hidden items
  const hideSoon = () => { if (hideTimer) return; hideTimer = requestAnimationFrame(() => { hideTimer = null; hideForChatters(); }); };
  new MutationObserver((list) => { if (chatOnly && list.some(m => m.addedNodes.length)) hideSoon(); }).observe(document.documentElement, { childList: true, subtree: true });
  setInterval(route, 400);
  // a link to anything but the chats does nothing for a chatter
  document.addEventListener('click', (ev) => {
    if (!chatOnly) return;
    const mi = ev.target && ev.target.closest && ev.target.closest('app-nav-bar-top [data-menu-item]');
    if (mi && !/message|chat/i.test(mi.getAttribute('data-menu-item') || '')) { ev.preventDefault(); ev.stopPropagation(); return; }
    const a = ev.target && ev.target.closest && ev.target.closest('a[href]');
    if (!a) return;
    let u; try { u = new URL(a.getAttribute('href'), location.href); } catch { return; }
    if (u.origin === location.origin && !OPEN_PATHS.test(u.pathname)) { ev.preventDefault(); ev.stopPropagation(); }
    else if (u.origin !== location.origin) { ev.preventDefault(); ev.stopPropagation(); }
  }, true);
  // saving photos and videos: no right-click menu and no dragging them out
  const onMedia = (t) => t && t.closest && t.closest('img, video, picture, canvas, [style*="background-image"]');
  document.addEventListener('contextmenu', (ev) => { if (chatOnly && onMedia(ev.target)) ev.preventDefault(); }, true);
  document.addEventListener('dragstart', (ev) => { if (chatOnly && onMedia(ev.target)) ev.preventDefault(); }, true);
  // Nobody signed in to the extension: Fansly stays closed, our sign-in page instead. Fansly's own offline
  // helper (a service worker) can serve its pages without asking the network, past the extension's
  // address rules, so the page checks too, and shows nothing until the extension has answered.
  document.documentElement.classList.add('cmt-wait');
  secureStyle.textContent += 'html.cmt-wait app-root, html.cmt-wait body{visibility:hidden!important}';
  function setSecure(on, signedOut) {
    if (signedOut !== false) { location.replace(chrome.runtime.getURL('signin.html')); return; }
    document.documentElement.classList.remove('cmt-wait');
    chatOnly = !!on;
    window.postMessage({ 'cmt-secure': 1, chatOnly }, '*');
    hideForChatters(); route();
  }
  const askSecure = (tries) => {
    try {
      chrome.runtime.sendMessage({ type: 'cmt-secure-get' }, (r) => {
        void chrome.runtime.lastError;
        if (r) setSecure(r.chatOnly, r.signedOut);
        else if (tries < 5) setTimeout(() => askSecure(tries + 1), 400);   // the extension is waking up
        else setSecure(true, true);
      });
    } catch { setSecure(true, true); }                                     // the extension is gone: closed
  };
  askSecure(0);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hideForChatters, { once: true }); else hideForChatters();

  // ---- Fansly's vault window: a frame on what the fan in this chat was sent from it ----
  // green: he bought it · red: sent as a PPV, not bought · grey: sent free; with the price it went for.
  // Which picture is which item comes from Fansly's own vault answer (page.js), else from its name.
  const vaultKey = new Map(), vaultName = new Map();
  let marks = new Map(), marksFor = null, marksAt = 0, marksBusy = false;
  window.addEventListener('message', (ev) => {
    if (ev.source !== window || !ev.data || ev.data['cmt-vault-keys'] !== 1) return;
    // a key shared by several items (the creator's own account id is in every one) points to none
    for (const [k, v] of ev.data.keys || []) { const was = vaultKey.get(String(k)); vaultKey.set(String(k), was && was !== String(v) ? '' : String(v)); }
    for (const [k, v] of ev.data.names || []) vaultName.set(String(k).trim().toLowerCase(), String(v));
    markSoon();
  });
  const groupNow = () => (location.pathname.match(/^\/messages\/(\d{5,25})/) || [])[1] || null;
  function loadMarks() {
    const g = groupNow();
    if (!g || marksBusy || (g === marksFor && Date.now() - marksAt < 30000)) return;
    marksBusy = true;
    try {
      chrome.runtime.sendMessage({ type: 'cmt-vault-marks', group: g }, (r) => {
        void chrome.runtime.lastError; marksBusy = false;
        if (!r || !r.ok) return;
        marks = new Map(r.marks.map(m => [String(m.media_id), m])); marksFor = g; marksAt = Date.now();
        for (const m of r.marks) if (m.filename && !vaultName.has(m.filename.trim().toLowerCase())) vaultName.set(m.filename.trim().toLowerCase(), String(m.media_id));
        markVault();
      });
    } catch { marksBusy = false; }
  }
  const vaultStyle = document.createElement('style');
  vaultStyle.textContent = '.cmt-vm-rel{position:relative}.cmt-vm::after{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;z-index:2}'
    + '.cmt-vm-bought::after,.cmt-vm-free::after{box-shadow:inset 0 0 0 4px #22c55e}.cmt-vm-not_bought::after{box-shadow:inset 0 0 0 4px #ef4444}'
    + '.cmt-vm::after{z-index:20!important}.cmt-vm-tag{position:absolute;left:6px;bottom:6px;z-index:21;pointer-events:none;padding:2px 7px;border-radius:5px;font:600 12px/1.4 -apple-system,Segoe UI,Roboto,sans-serif;color:#fff}'
    + '.cmt-vm-bought .cmt-vm-tag{background:#16a34a}.cmt-vm-not_bought .cmt-vm-tag{background:#dc2626}.cmt-vm-free .cmt-vm-tag{background:#16a34a}';
  // the vault window: Fansly's picker with its "Upload to Vault" and "Add … Media" buttons
  function vaultWindow() {
    for (const b of document.querySelectorAll('button, .btn, div[class*="btn"]')) {
      const t = String(b.textContent || '').trim();
      if (!/^add \d+ media$/i.test(t) && !/^upload to vault$/i.test(t)) continue;
      let el = b;
      for (let i = 0; i < 12 && el.parentElement; i++) { el = el.parentElement; if (el.querySelectorAll('img').length >= 2 && el.getBoundingClientRect().width > 400) return el; }
    }
    return null;
  }
  const picOf = (el) => {
    if (el.tagName === 'IMG') return el.currentSrc || el.src || '';
    if (el.tagName === 'VIDEO') return el.poster || el.currentSrc || el.src || (el.querySelector('source') || {}).src || '';
    if (el.tagName === 'CANVAS') return '';
    const m = /url\(["']?([^"')]+)/.exec(el.style.backgroundImage || ''); return m ? m[1] : '';
  };
  function mediaOfPic(src) {
    let u; try { u = new URL(src, location.href); } catch { return null; }
    if (vaultKey.get(u.pathname)) return vaultKey.get(u.pathname);
    for (const seg of u.pathname.split(/[/._-]/)) if (/^\d{15,25}$/.test(seg) && vaultKey.get(seg)) return vaultKey.get(seg);
    return null;
  }
  function mediaOfTile(tile, pic) {
    // Fansly puts the item's own number on the picture's box (data-media-id); a video's preview may carry
    // one of its versions' numbers, which the vault answer leads back to the video
    const box = (pic.closest && pic.closest('[data-media-id]')) || tile.querySelector('[data-media-id]');
    const dm = box && box.getAttribute('data-media-id');
    if (dm && /^\d{5,25}$/.test(dm)) return vaultKey.get(dm) || dm;
    const byPic = mediaOfPic(picOf(pic));
    if (byPic) return byPic;
    // its name on the tile ("IMG_6883.jpeg")
    // Fansly cuts long names short on the tile ("copy_735726F0-541E-4211-A..."): the start must fit one item only
    for (const el of tile.querySelectorAll('span, div, [title]')) {
      if (el.children.length > 1) continue;
      for (const raw of [el.getAttribute('title'), el.textContent]) {
        const t = String(raw || '').trim().toLowerCase();
        if (!t || t.length > 160) continue;
        if (vaultName.has(t)) return vaultName.get(t);
        const cut = /(\.\.\.|…)$/.test(t) ? t.replace(/(\.\.\.|…)$/, '').trim() : null;
        if (cut && cut.length >= 8) {
          const hits = new Set();
          for (const [name, id] of vaultName) if (name.startsWith(cut)) hits.add(id);
          if (hits.size === 1) return [...hits][0];
        }
      }
    }
    return null;
  }
  // the tile: the biggest box around the picture that is still about its size
  function tileOf(pic, root) {
    const r = pic.getBoundingClientRect(); let tile = pic;
    for (let el = pic.parentElement, i = 0; el && el !== root && i < 10; el = el.parentElement, i++) {
      const b = el.getBoundingClientRect();
      if (b.width > r.width + 24 || b.height > r.height + 60) break;
      tile = el;
    }
    return tile === pic ? pic.parentElement : tile;
  }
  const money = (n) => `$${Number(n).toFixed(Number(n) % 1 ? 2 : 0)}`;
  function markVault() {
    const root = vaultWindow();
    if (!root) return;
    if (!vaultStyle.isConnected) (document.head || document.documentElement).append(vaultStyle);
    loadMarks();
    // photos are pictures; a video tile plays a short preview instead (a video element, sometimes a canvas)
    const pics = [...root.querySelectorAll('img, video, canvas'), ...root.querySelectorAll('[style*="background-image"]')].filter(p => p.getBoundingClientRect().width > 60);
    // a line in the window: what is known about him, and how many of those pictures are on screen
    let note = root.querySelector(':scope > .cmt-vm-note');
    if (!note) { note = document.createElement('div'); note.className = 'cmt-vm-note'; note.style.cssText = 'font:12px/1.4 -apple-system,Segoe UI,Roboto,sans-serif;color:#9ca3af;padding:4px 12px'; root.prepend(note); }
    let shown = 0, known = 0;
    const missed = [];
    for (const pic of pics) {
      const t = tileOf(pic, root); if (!t) continue;
      if (mediaOfTile(t, pic)) { known += 1; continue; }
      // why a tile wasn't recognised (hover the line): its label, what shows the picture, the kind of address
      const label = [...t.querySelectorAll('span, div')].map(e => e.children.length > 1 ? '' : String(e.textContent || '').trim()).find(x => /\.\w{2,4}(\.\.\.|…)?$|\.\.\.$|…$/.test(x)) || '?';
      const src = picOf(pic); let kind = 'none';
      try { if (src) { const u = new URL(src, location.href); kind = u.protocol === 'blob:' ? 'blob' : u.protocol === 'data:' ? 'data' : `${u.hostname}${u.pathname.replace(/\d{6,}/g, '#')}`; } } catch { kind = 'bad'; }
      missed.push(`${label} · ${pic.tagName.toLowerCase()} · ${kind}`);
    }
    note.title = missed.length ? `Not recognised:\n${[...new Set(missed)].slice(0, 15).join('\n')}` : '';
    // for the request log (kept only while it is on): one recognised and one unrecognised tile, once per window
    if (!root.dataset.cmtDiag && pics.length && marksFor === groupNow()) {
      root.dataset.cmtDiag = '1';
      const pick = (want) => pics.find(p => { const t = tileOf(p, root); return t && !!mediaOfTile(t, p) === want; });
      const sample = { hit: pick(true) ? vaultDiag(pick(true), root) : null, miss: pick(false) ? vaultDiag(pick(false), root) : null, videos: root.querySelectorAll('video').length, canvases: root.querySelectorAll('canvas').length, imgs: root.querySelectorAll('img').length };
      try { chrome.runtime.sendMessage({ type: 'fansly-event', kind: 'net', url: location.href, data: { method: 'UI', path: 'vault-tiles', query: {}, status: null, page: location.pathname, rows: {}, ui: { vault: sample } }, at: Date.now() }); } catch { /* ignore */ }
    }
    shown = [...marks.keys()].length;
    const nb = [...marks.values()];
    const text = marksFor !== groupNow() ? 'Chatting Manager: reading what he was sent…'
      : !nb.length ? 'Chatting Manager: nothing from the vault was sent to him yet.'
        : `Chatting Manager: sent to him ${nb.filter(m => !m.wall).length} · bought ${nb.filter(m => m.status === 'bought' && !m.wall).length} in chat, ${nb.filter(m => m.wall).length} on the wall · not bought ${nb.filter(m => m.status === 'not_bought').length}${pics.length ? ` · ${known} of ${pics.length} pictures here recognised` : ''}`;
    if (note.textContent !== text) note.textContent = text;
    const done = new Set();
    for (const pic of pics) {
      const tile = tileOf(pic, root); if (!tile || done.has(tile)) continue;
      const mid = mediaOfTile(tile, pic);
      if (mid) done.add(tile);
      const m = mid && marksFor === groupNow() ? marks.get(mid) : null;
      const want = m ? m.status : '';
      if ((tile.dataset.cmtVm || '') === want + (m ? m.price : '')) continue;
      tile.classList.remove('cmt-vm', 'cmt-vm-rel', 'cmt-vm-bought', 'cmt-vm-not_bought', 'cmt-vm-free');
      tile.querySelectorAll(':scope > .cmt-vm-tag').forEach(x => x.remove());
      tile.dataset.cmtVm = want + (m ? m.price : '');
      if (!m) continue;
      tile.classList.add('cmt-vm', `cmt-vm-${m.status}`);
      if (getComputedStyle(tile).position === 'static') tile.classList.add('cmt-vm-rel');
      const tag = document.createElement('div'); tag.className = 'cmt-vm-tag';
      tag.textContent = m.status === 'bought' ? `Bought${m.wall ? ' on wall' : ''}${m.price ? ` ${money(m.price)}` : ''}` : m.status === 'not_bought' ? `Not bought · ${money(m.price)}` : 'Sent free';
      tag.title = m.wall ? `Bought in a post on the wall, ${new Date(m.at).toLocaleDateString()}` : `${m.times > 1 ? `Sent ${m.times} times` : 'Sent'}${m.bundle ? ' in a bundle' : ''}, last ${new Date(m.at).toLocaleDateString()}`;
      tile.append(tag);
    }
  }
  function vaultDiag(target, root) {
    // the tile: go up from the click until a box holds a picture, a video or a canvas
    let tile = target;
    for (let i = 0; i < 8 && tile && tile !== root && !tile.querySelector('img, video, canvas, [style*="background-image"]'); i++) tile = tile.parentElement;
    const outline = (el, d) => {
      if (!el || d > 5) return null;
      const o = { tag: el.tagName.toLowerCase(), cls: String(el.className && el.className.baseVal != null ? el.className.baseVal : el.className || '').slice(0, 80) };
      const attrs = [...el.attributes].map(a => a.name).filter(n => !/^_ng|^class$/.test(n)); if (attrs.length) o.attrs = attrs.slice(0, 10);
      const w = el.getBoundingClientRect(); o.size = `${Math.round(w.width)}x${Math.round(w.height)}`;
      const own = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join(' ').trim(); if (own) o.text = own.slice(0, 80);
      for (const k of ['src', 'poster', 'href', 'title']) { const v = el.getAttribute && el.getAttribute(k); if (v) o[k] = v.slice(0, 200).replace(/[?].*$/, '?…'); }
      if (el.style && el.style.backgroundImage) o.bg = el.style.backgroundImage.slice(0, 200).replace(/[?].*$/, '?…');
      if (el.tagName === 'VIDEO') o.currentSrc = String(el.currentSrc || '').slice(0, 200).replace(/[?].*$/, '?…');
      const kids = [...el.children].slice(0, 8).map(c => outline(c, d + 1)).filter(Boolean); if (kids.length) o.kids = kids;
      return o;
    };
    const pics = tile ? [...tile.querySelectorAll('img, video, canvas, [style*="background-image"]')] : [];
    return {
      outline: outline(tile, 0),
      matched: pics.map(p => ({ tag: p.tagName.toLowerCase(), id: mediaOfTile(tileOf(p, root) || tile, p) || null, byPic: mediaOfPic(picOf(p)) || null, src: String(picOf(p)).slice(0, 120).replace(/[?].*$/, '?…') })),
      keys: vaultKey.size, names: vaultName.size, marks: marks.size, marksFor, group: groupNow(),
      pathSample: [...vaultKey.keys()].filter(k => k.startsWith('/')).slice(0, 6),
      nameSample: [...vaultName.keys()].filter(k => /\.(mp4|mov|m4v|webm)$/.test(k)).slice(0, 4),
    };
  }
  let markTimer = null;
  const markSoon = () => { if (markTimer) return; markTimer = setTimeout(() => { markTimer = null; markVault(); }, 150); };
  new MutationObserver(() => markSoon()).observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('scroll', markSoon, true);

  // ---- the request log (popup switch) also notes which controls are clicked: their label, never what is typed ----
  // (the worker keeps these only while logging is on, like the requests)
  document.addEventListener('click', (ev) => {
    const host = document.getElementById('cmt-panel-host');
    let el = ev.target && ev.target.closest && ev.target.closest('button, a, input, label, select, [role="button"], [role="menuitem"], [role="tab"], [tabindex]');
    // a tile in the vault window is a plain box: it counts too
    if (!el) { try { const vw = vaultWindow(); if (vw && ev.target && vw.contains(ev.target)) el = ev.target; } catch { /* ignore */ } }
    if (!el || (host && host.contains(el))) return;
    const label = (x) => String(x || '').replace(/\s+/g, ' ').trim().slice(0, 40);
    const ui = {
      tag: el.tagName.toLowerCase(), role: el.getAttribute('role') || null, type: el.getAttribute('type') || null,
      aria: label(el.getAttribute('aria-label')), title: label(el.getAttribute('title')), placeholder: label(el.getAttribute('placeholder')),
      classes: String(el.className && el.className.baseVal != null ? el.className.baseVal : el.className || '').split(/\s+/).filter(Boolean).slice(0, 4).join(' '),
      // a control's own words (Vault, Add, Price…); a long text is something else (a message): left out
      text: el.matches('input, select') ? null : (label(el.innerText).length <= 30 ? label(el.innerText) : null),
      icon: (el.querySelector('i[class], svg use, mat-icon') && label(el.querySelector('i[class], svg use, mat-icon').getAttribute('class') || el.querySelector('svg use')?.getAttribute('href') || el.querySelector('mat-icon')?.textContent)) || null,
    };
    // a click in the vault window: how that tile is built and why it was or wasn't recognised (to fix the frames)
    try { const vw = vaultWindow(); if (vw && vw.contains(el)) ui.vault = vaultDiag(ev.target, vw); } catch (e) { ui.vault = { error: String(e && e.message) }; }
    try { chrome.runtime.sendMessage({ type: 'fansly-event', kind: 'net', url: location.href, data: { method: 'UI', path: 'click', query: {}, status: null, page: location.pathname, rows: {}, ui }, at: Date.now() }); } catch { /* ignore */ }
  }, true);

  // ---- the translator: his message's English, shown under it in Fansly's own chat ----
  // The panel sends [{ text, en }] for the open chat. Each of his bubbles whose text is exactly one of
  // those gets a small "EN: …" line under its text (his text itself is left as it is). Only bubbles in
  // the conversation column count (not the chat list on the left); Fansly redraws as it scrolls, so a
  // watcher puts the lines back on new bubbles. Nothing is sent anywhere.
  let trItems = new Map(), trOn = true, trTimer = null;
  const norm = (t) => String(t || '').replace(/\s+/g, ' ').trim();
  function annotate() {
    document.querySelectorAll('.cmt-tr').forEach(el => { if (!trOn || !trItems.has(el.dataset.src)) el.remove(); });
    if (!trOn || !trItems.size) return;
    // the conversation column: the message box's ancestor that is as wide as the chat (the box itself is
    // narrower than the bubbles: the buttons beside it take room), so the chat list beside it stays out
    const box = messageBox();
    let pane = box;
    while (pane && pane.parentElement && pane.getBoundingClientRect().width < 420) pane = pane.parentElement;
    const col = pane && pane.getBoundingClientRect();
    const host = document.getElementById('cmt-panel-host');
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const seen = new Set();
    // an element's own text, without a line we added to it
    const ownText = (el) => [...el.childNodes].filter(n => !(n.classList && n.classList.contains('cmt-tr'))).map(n => n.textContent).join('');
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement;
      if (!el || seen.has(el) || (host && host.contains(el)) || el.closest('.cmt-tr, textarea, [contenteditable="true"]')) continue;
      seen.add(el);
      const key = norm(ownText(el));
      if (!key || !trItems.has(key)) continue;
      if (col) { const r = el.getBoundingClientRect(); if (r.right < col.left || r.left > col.right) continue; }   // the conversation column only
      const had = el.querySelector(':scope > .cmt-tr');
      if (had && had.dataset.src === key) continue;
      if (had) had.remove();
      // inside his text's own box, so it sits in the bubble with the same padding, just under his words
      const line = document.createElement('span');
      line.className = 'cmt-tr'; line.dataset.src = key;
      line.textContent = trItems.get(key);
      line.style.cssText = 'display:block;margin-top:5px;padding-top:5px;border-top:1px solid rgba(255,255,255,.14);font-size:.86em;line-height:1.35;opacity:.72;white-space:pre-wrap;';
      el.appendChild(line);
    }
  }
  const annotateSoon = () => { clearTimeout(trTimer); trTimer = setTimeout(annotate, 250); };
  new MutationObserver((list) => { if (trItems.size && trOn && list.some(m => [...m.addedNodes].some(x => !(x.classList && x.classList.contains('cmt-tr'))))) annotateSoon(); })
    .observe(document.documentElement, { childList: true, subtree: true });
  function setTranslations(msg) {
    trOn = msg.on !== false;
    trItems = new Map((msg.items || []).filter(x => x && x.text && x.en).map(x => [norm(x.text), String(x.en)]));
    annotate();
  }
  // from the panel inside this page (the same tab): a page event
  document.addEventListener('cmt-translations', (ev) => { try { setTranslations(JSON.parse(ev.detail || '{}')); } catch { /* ignore */ } });

  chrome.runtime.onMessage.addListener((msg, sender, respond) => {
    if (msg && msg.type === 'cmt-ping') { respond({ ok: true }); return false; }
    if (msg && msg.type === 'cmt-secure') { setSecure(msg.chatOnly, msg.signedOut); respond({ ok: true }); return false; }
    if (msg && msg.type === 'cmt-translations') { setTranslations(msg); respond({ ok: true }); return false; }
    // a sequence's media step: the item's name into the search box of Fansly's open vault window
    if (msg && msg.type === 'cmt-search' && typeof msg.text === 'string') {
      const looks = (el) => /search/i.test(`${el.getAttribute('placeholder') || ''} ${el.getAttribute('aria-label') || ''} ${el.type || ''}`);
      const shown = (el) => { const r = el.getBoundingClientRect(); return r.width > 40 && r.height > 10; };
      const inWindow = (el) => !!el.closest('[role="dialog"], .modal, [class*="modal"], [class*="overlay"], [class*="dialog"], [class*="vault"]');
      const box = [...document.querySelectorAll('input')].filter(el => looks(el) && shown(el) && inWindow(el)).pop();
      if (!box) { respond({ ok: false }); return false; }
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      box.focus(); setter.call(box, msg.text); box.dispatchEvent(new Event('input', { bubbles: true })); box.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));
      respond({ ok: true }); return false;
    }
    // a sequence's PPV step: its price into Fansly's own price box ("Amount"), once the chatter added the media
    if (msg && msg.type === 'cmt-price') {
      const box = [...document.querySelectorAll('input[aria-label="Amount"]')].find(el => el.getBoundingClientRect().width > 0);
      if (!box) { respond({ ok: false }); return false; }
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      box.focus(); setter.call(box, String(msg.price)); box.dispatchEvent(new Event('input', { bubbles: true })); box.dispatchEvent(new Event('change', { bubbles: true }));
      respond({ ok: true }); return false;
    }
    if (msg && msg.type === 'cmt-insert' && typeof msg.text === 'string') { respond({ ok: insert(msg.text) }); return false; }
    if (msg && msg.type === 'cmt-fetch-stop') { stopped = true; respond({ ok: true }); return false; }
    return false;
  });
  // is this the tab the extension opened for a read? then do it
  const askJob = () => { try { chrome.runtime.sendMessage({ type: 'fetch-tab-ready' }, (r) => { void chrome.runtime.lastError; if (r && r.job) runFetch(r.job); }); } catch { /* ignore */ } };
  if (document.readyState === 'complete') askJob(); else window.addEventListener('load', askJob, { once: true });
})();
