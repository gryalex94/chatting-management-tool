/**
 * The bridge between the page script (which lives in the page's world and cannot
 * reach the extension) and the background worker. It forwards what the page
 * copies, and types a script or suggestion from the side panel into Fansly's
 * message box (the chatter still presses send).
 */
(() => {
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
  function scrollEverything() {
    const boxes = [...document.querySelectorAll('*')].filter(el => el.scrollHeight > el.clientHeight + 40 && /(auto|scroll)/.test(getComputedStyle(el).overflowY));
    for (const el of boxes) { el.scrollTop = el.scrollHeight; el.dispatchEvent(new Event('scroll', { bubbles: true })); }
    window.scrollTo(0, document.documentElement.scrollHeight);
    window.dispatchEvent(new Event('scroll'));
  }
  async function runFetch(job) {
    const p = { rows: 0, total: ledgerTotal, pages: 0, note: 'starting' };
    let lastSize = null, lastLimit = null, seenStats = 0;
    const want = job.kind === 'ledger' ? 'ledger' : job.kind === 'subscribers' ? 'subscribers' : 'stats';
    window.addEventListener('message', (ev) => {
      if (ev.source !== window || !ev.data || ev.data[TAG] !== 1 || ev.data.kind !== want) return;
      const d = ev.data.data || {};
      if (want === 'stats') { seenStats += 1; return; }
      const rows = (want === 'ledger' ? d.data : d.subscriptions) || [];
      const limit = Number(d.limit) || null;
      if (want === 'ledger' && Number(d.total) > 0) p.total = Number(d.total);
      if (want === 'ledger' && !p.total && ledgerTotal) p.total = ledgerTotal;
      if (limit && limit <= 5) return;                                      // the small "recent purchases" box, not the list
      p.rows += rows.length; p.pages += 1; lastSize = rows.length; lastLimit = limit;
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
      return done(seenStats ? 'done' : 'failed', seenStats ? 'statistics read' : 'the statistics did not load', seenStats ? null : 'Fansly\'s statistics did not load in this tab');
    }
    const end = Date.now() + 10 * 60_000;
    let still = 0, before = -1, viewAllTried = false;
    while (!stopped && Date.now() < end) {
      // the whole list sits behind "View all" on the statistics page; elsewhere it is on the page itself
      if (!viewAllTried && p.pages === 0) {
        viewAllTried = true;
        const opened = job.kind === 'ledger' ? (clickNear(/^recent purchases$/i, /^view all\b/i) || clickText(/^view all\b/i)) : clickText(/^view all\b/i);
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
        if (!p.pages && job.kind === 'ledger' && !sessionStorage.getItem('cmtLedgerFallback')) {
          sessionStorage.setItem('cmtLedgerFallback', '1');
          report('trying the wallet history page');
          location.href = 'https://fansly.com/creator/wallet/history';
          return;                                                              // this tab reloads and the read goes on there
        }
        sessionStorage.removeItem('cmtLedgerFallback');
        return done(p.pages ? 'done' : 'failed', p.pages ? 'nothing more loaded' : 'no list found', p.pages ? null : `No list loaded on ${location.pathname}. Open it by hand and scroll it to the end.`);
      }
    }
    done(stopped ? 'cancelled' : 'done', stopped ? 'stopped' : 'time limit (10 min) reached');
  }
  chrome.runtime.onMessage.addListener((msg, sender, respond) => {
    if (msg && msg.type === 'cmt-insert' && typeof msg.text === 'string') { respond({ ok: insert(msg.text) }); return false; }
    if (msg && msg.type === 'cmt-fetch-stop') { stopped = true; respond({ ok: true }); return false; }
    return false;
  });
  // is this the tab the extension opened for a read? then do it
  const askJob = () => { try { chrome.runtime.sendMessage({ type: 'fetch-tab-ready' }, (r) => { void chrome.runtime.lastError; if (r && r.job) runFetch(r.job); }); } catch { /* ignore */ } };
  if (document.readyState === 'complete') askJob(); else window.addEventListener('load', askJob, { once: true });
})();
