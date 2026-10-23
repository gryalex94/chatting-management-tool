/**
 * The side panel (phase 3): a wide panel on the right of the Fansly page that
 * follows the open chat and shows what our tool knows about the fan — his card,
 * his numbers, notes from every shift, the AI's summary, the shift strip with
 * warnings, and the scripts library.
 *
 * It talks only to our server (through the background worker). It never sends
 * anything to Fansly: a clicked script is typed into the message box, and the
 * chatter edits it and presses send.
 */
(() => {
  // two homes: Chrome's own side panel next to the page (sidepanel.html, the default), or drawn inside the Fansly page
  const SIDE = location.protocol === 'chrome-extension:' || window.__cmtSideTest === true;   // (the flag: a test page acting as the side panel)
  if (!SIDE && (window.top !== window || document.getElementById('cmt-panel-host'))) return;
  const TAG = 'cmt-fansly';
  const MIN_W = 300, MAX_W = 760, STRIP_W = 30, REFRESH_MS = 20000;
  const STAGE_LABEL = { opener: 'Opener', warmup: 'Warm-up', sexting: 'Sexting', ppv_pitch: 'PPV pitch', after_no: 'After a no', reengage: 'Re-engage', custom: 'Custom request', aftercare: 'Aftercare', other: 'Other' };

  // ---------- talking to the background worker ----------
  const send = (msg) => new Promise((resolve) => {
    try { chrome.runtime.sendMessage(msg, (r) => { void chrome.runtime.lastError; resolve(r || null); }); } catch { resolve(null); }
  });
  const call = async (method, path, body) => {
    const r = await send({ type: 'panel-api', method, path, body });
    if (!r) throw new Error('The extension is restarting; try again in a moment');
    if (!r.ok) { if (r.noSession) st.signedIn = false; throw new Error(r.error || 'Failed'); }
    return r.data;
  };

  // ---------- state ----------
  const st = {
    signedIn: false, user: null, accountId: null, accountUsername: null,
    groupId: null, fanId: null, data: null, error: '', loading: false,
    summary: null, summaryBusy: false, summaryError: '', summaryAskedAt: 0,
    scripts: null, scriptsFor: null, openStages: new Set(['opener', 'ppv_pitch']), scriptFilter: '',
    noteDraft: '', editing: null, editDraft: '', toast: '',
    note: { fan: null, text: '', dirty: false, saving: false, savedAt: null, by: null, error: '' },   // the fan's one note, saved as you type
    suggest: null, suggestBusy: false, suggestError: '',
    linkQ: '', linkResults: null, linkBusy: false,   // { draft_id, messages, goal, why, inserted, group }
    width: 420, collapsed: false, push: true, open: { suggest: true, card: true, agency: true, metrics: true, notes: true, summary: true, scripts: true },
  };

  // ---------- the host element and its shadow root ----------
  const host = document.createElement('div');
  host.id = 'cmt-panel-host';
  const root = host.attachShadow({ mode: 'open' });
  const pushStyle = document.createElement('style');
  pushStyle.id = 'cmt-panel-push';

  const CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; }
    .wrap { position: fixed; top: 0; right: 0; height: 100vh; z-index: 2147483000; display: flex; font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #e7e7ea; }
    .grip { width: 6px; cursor: ew-resize; background: transparent; }
    .grip:hover { background: rgba(99,102,241,.4); }
    .panel { flex: 1; background: #16161a; border-left: 1px solid #2c2c33; display: flex; flex-direction: column; min-width: 0; box-shadow: -6px 0 18px rgba(0,0,0,.35); }
    .strip { width: ${STRIP_W}px; background: #16161a; border-left: 1px solid #2c2c33; display: flex; align-items: flex-start; justify-content: center; padding-top: 10px; cursor: pointer; }
    .strip span { writing-mode: vertical-rl; transform: rotate(180deg); font-weight: 600; letter-spacing: .04em; color: #a5a6f6; }
    header { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-bottom: 1px solid #2c2c33; }
    header .t { font-weight: 600; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .body { flex: 1; overflow-y: auto; padding: 8px 10px 40px; }
    button { font: inherit; color: inherit; background: #26262d; border: 1px solid #34343c; border-radius: 6px; padding: 3px 8px; cursor: pointer; }
    button:hover { background: #303038; }
    button.primary { background: #4f46e5; border-color: #4f46e5; color: #fff; }
    button.primary:hover { background: #4338ca; }
    button.link { background: none; border: none; padding: 0 2px; color: #a5a6f6; }
    button.icon { padding: 2px 6px; }
    button:disabled { opacity: .5; cursor: default; }
    textarea, input { font: inherit; color: inherit; background: #1e1e24; border: 1px solid #34343c; border-radius: 6px; padding: 6px 8px; width: 100%; }
    textarea { resize: vertical; min-height: 52px; }
    section { border: 1px solid #2c2c33; border-radius: 8px; margin: 8px 0; background: #1b1b20; }
    section > h3 { margin: 0; padding: 7px 10px; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: #9a9aa5; cursor: pointer; display: flex; justify-content: space-between; user-select: none; }
    section > .c { padding: 2px 10px 10px; }
    .muted { color: #8b8b96; }
    .small { font-size: 11px; }
    .name { font-size: 15px; font-weight: 600; }
    .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
    .stat { border: 1px solid #2c2c33; border-radius: 6px; padding: 4px 6px; }
    .stat .l { font-size: 10px; color: #8b8b96; }
    .stat .v { font-weight: 600; font-variant-numeric: tabular-nums; }
    .warn { border-radius: 6px; padding: 5px 8px; margin: 4px 0; font-size: 12px; }
    .warn.high { background: rgba(239,68,68,.15); color: #fca5a5; }
    .warn.mid { background: rgba(245,158,11,.14); color: #fcd34d; }
    .warn.info { background: rgba(99,102,241,.13); color: #c7d2fe; }
    .shift { padding: 6px 10px; border-bottom: 1px solid #2c2c33; font-size: 12px; background: #1b1b20; }
    .note { border-top: 1px solid #26262d; padding: 6px 0; }
    .note:first-child { border-top: none; }
    .note .txt { white-space: pre-wrap; word-break: break-word; }
    .pin { color: #fcd34d; }
    ul { margin: 2px 0 6px; padding-left: 18px; }
    li { margin: 1px 0; }
    .lbl { font-size: 11px; color: #9a9aa5; margin-top: 6px; }
    .stage { border-top: 1px solid #26262d; }
    .stage > .h { padding: 6px 0; cursor: pointer; display: flex; justify-content: space-between; color: #c9c9d1; user-select: none; }
    .script { border: 1px solid #2c2c33; border-radius: 6px; padding: 6px 8px; margin: 0 0 6px; cursor: pointer; }
    .script:hover { border-color: #6366f1; background: #202028; }
    .script .st { font-weight: 600; font-size: 12px; }
    .script .tx { white-space: pre-wrap; color: #b9b9c2; font-size: 12px; max-height: 5.6em; overflow: hidden; }
    .row { display: flex; gap: 6px; align-items: center; }
    .toast { position: absolute; bottom: 12px; left: 12px; right: 12px; background: #312e81; color: #e0e7ff; padding: 8px 10px; border-radius: 8px; font-size: 12px; }
    .err { color: #fca5a5; }
    .pill { display: inline-block; font-size: 10px; border: 1px solid #3a3a44; border-radius: 999px; padding: 0 6px; margin-left: 4px; color: #b9b9c2; }
  `;

  // in Chrome's side panel the panel fills it; Chrome sets the width and narrows the page
  const SIDE_CSS = `.wrap { position: static !important; width: 100% !important; height: 100vh; } .panel { border-left: none; box-shadow: none; } .grip { display: none; }`;

  // ---------- tiny DOM helper: never innerHTML with data ----------
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'value') el.value = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    return el;
  }

  // ---------- formats ----------
  const money = (n) => (n == null ? '·' : `$${Number(n).toFixed(2)}`);
  const dur = (s) => (s == null ? '·' : s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s / 60)} min` : `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min`);
  const date = (iso) => (iso ? new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short', year: '2-digit' }) : '·');
  const when = (iso) => (iso ? new Date(iso).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }) : '');
  const ago = (iso) => { if (!iso) return '·'; const m = Math.round((Date.now() - Date.parse(iso)) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.floor(m / 60)} h ago` : `${Math.floor(m / 1440)} d ago`; };
  // the hours he writes most, turned from UTC into the chatter's own computer time
  // (today's date, so summer or winter time is right)
  const localHours = (hs) => (hs && hs.length ? [...new Set(hs.map(x => { const d = new Date(); d.setUTCHours(x, 0, 0, 0); return d.getHours(); }))].sort((a, b) => a - b).map(x => `${String(x).padStart(2, '0')}:00`).join(', ') : '·');
  const myZone = () => { try { return new Date().toLocaleTimeString('en-GB', { timeZoneName: 'short' }).split(' ').pop(); } catch { return 'your time'; } };
  const sinceLabel = (iso) => { if (!iso) return ''; const m = Math.floor((Date.now() - Date.parse(iso)) / 60000); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`; };

  function flash(text) { st.toast = text; render(); setTimeout(() => { if (st.toast === text) { st.toast = ''; render(); } }, 3500); }

  // ---------- the page layout: make room for the panel ----------
  function applyLayout() {
    if (SIDE) return;
    const w = st.signedIn ? (st.collapsed ? STRIP_W : st.width) : STRIP_W;
    pushStyle.textContent = st.push && !st.collapsed && st.signedIn
      ? `html { margin-right: ${w}px !important; } body { width: auto !important; }`
      : '';
    if (!pushStyle.isConnected) (document.head || document.documentElement).append(pushStyle);
  }

  // ---------- typing a script into Fansly's message box (the chatter sends it) ----------
  function messageBox() {
    const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 40 && r.height > 10 && r.bottom > 0 && r.top < innerHeight; };
    const boxes = [...document.querySelectorAll('textarea, [contenteditable="true"], [contenteditable=""]')].filter(el => !host.contains(el) && visible(el));
    // the chat's box sits at the bottom of the conversation: take the lowest one
    return boxes.sort((a, b) => b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom)[0] || null;
  }
  async function insertText(text) {
    if (SIDE) {
      // the Fansly tab types it (bridge.js); the side panel can't reach the page itself
      const r = st.tabId != null ? await new Promise((res) => { try { chrome.tabs.sendMessage(st.tabId, { type: 'cmt-insert', text }, (x) => { void chrome.runtime.lastError; res(x || null); }); } catch { res(null); } }) : null;
      if (r && r.ok) return 'box';
      try { await navigator.clipboard.writeText(text); return 'clipboard'; } catch { return null; }
    }
    const box = messageBox();
    if (box) {
      box.focus();
      let ok = false;
      try { ok = document.execCommand('insertText', false, text); } catch { ok = false; }
      if (!ok && box.tagName === 'TEXTAREA') {
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
        setter.call(box, (box.value ? box.value + ' ' : '') + text);
        box.dispatchEvent(new Event('input', { bubbles: true }));
        ok = true;
      }
      if (ok) return 'box';
    }
    try { await navigator.clipboard.writeText(text); return 'clipboard'; } catch { return null; }
  }
  function fillPlaceholders(text) {
    const f = st.data && st.data.fan || {};
    const m = st.data && st.data.metrics || {};
    const name = f.nickname || f.display_name || f.username || '';
    return String(text)
      .replace(/\{name\}/gi, name || 'babe')
      .replace(/\{username\}/gi, f.username || '')
      .replace(/\{last_bought\}/gi, (m.last_purchase && m.last_purchase.what) || 'that last one')
      .replace(/\{page\}/gi, (st.data && st.data.page && st.data.page.name) || '');
  }

  // ---------- loading ----------
  let loadSeq = 0;
  async function loadFan(quiet) {
    if (!st.signedIn || !st.accountId) return;
    if (!st.groupId) { st.data = null; render(); return; }
    const seq = ++loadSeq;
    if (!quiet) { st.loading = true; st.error = ''; render(); }
    try {
      const q = new URLSearchParams({ account: st.accountId, group: st.groupId });
      const data = await call('GET', `/api/fansly/panel/fan?${q}`);
      if (seq !== loadSeq) return;
      const fanChanged = data.found && data.fan.fansly_account_id !== st.fanId;
      st.data = data; st.error = '';
      st.fanId = data.found ? data.fan.fansly_account_id : null;
      // the AI summary is built only when the chatter presses the button (it costs money); the saved one is shown as it is
      // the AI summary stays empty until the chatter presses Generate (each press writes a new one), so data.summary isn't shown
      void fanChanged;
      if (data.found) {
        // his note: a new fan loads it; the same fan picks up another shift's edits only while nobody is typing here
        const fid = data.fan.fansly_account_id, saved = data.note || {};
        const typing = root.activeElement && root.activeElement.classList && root.activeElement.classList.contains('fan-note');
        if (st.note.fan !== fid) st.note = { fan: fid, text: saved.text || '', dirty: false, saving: false, savedAt: saved.updated_at || null, by: saved.by || null, error: '' };
        else if (!st.note.dirty && !st.note.saving && !typing) st.note = { ...st.note, text: saved.text || '', savedAt: saved.updated_at || null, by: saved.by || null };
      }
    } catch (e) { if (seq === loadSeq) st.error = e.message; }
    finally { if (seq === loadSeq) { st.loading = false; render(); } }
  }
  async function loadSummary(force) {
    if (!st.fanId || st.summaryBusy) return;
    const fan = st.fanId;
    st.summaryBusy = true; st.summaryError = ''; st.summaryAskedAt = Date.now(); render();
    try {
      const r = await call('POST', '/api/fansly/panel/summary', { account: st.accountId, fan, force: !!force });
      if (fan !== st.fanId) return;
      st.summary = r.summary; st.summaryError = r.error || (r.summary ? '' : (r.reason || ''));
      if (r.cost_usd != null) flash(`Summary updated (cost $${Number(r.cost_usd).toFixed(4)})`);
    } catch (e) { if (fan === st.fanId) st.summaryError = e.message; }
    finally { st.summaryBusy = false; render(); }
  }
  async function loadScripts() {
    if (!st.signedIn || !st.accountId || st.scriptsFor === st.accountId) return;
    st.scriptsFor = st.accountId;
    try { const r = await call('GET', `/api/fansly/panel/scripts?account=${encodeURIComponent(st.accountId)}`); st.scripts = r.scripts || []; }
    catch (e) { st.scripts = []; st.scriptsFor = null; st.error = st.error || e.message; }
    render();
  }

  // ---------- following the open chat ----------
  // the page whose chat is followed: this page, or (side panel) the active Fansly tab of this window
  const currentPath = () => (SIDE ? st.tabPath || '' : location.pathname);
  function groupFromUrl() { const m = currentPath().match(/^\/messages\/(\d{5,25})/); return m ? m[1] : null; }
  function setGroup(g) {
    if (g === st.groupId) return;
    flushNote();
    st.note = { fan: null, text: '', dirty: false, saving: false, savedAt: null, by: null, error: '' };
    dropSuggestion();
    st.groupId = g; st.fanId = null; st.data = null; st.summary = null; st.summaryError = ''; st.noteDraft = ''; st.editing = null; st.linkQ = ''; st.linkResults = null;
    loadFan(false);
  }
  let lastHref = SIDE ? '' : location.href;
  const onHref = (href) => {
    if (href === lastHref) return;
    lastHref = href;
    const g = groupFromUrl();
    if (g) setGroup(g); else if (!/^\/messages/.test(currentPath())) setGroup(null);
  };
  if (SIDE) {
    const follow = () => {
      try {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          void chrome.runtime.lastError;
          const t = tabs && tabs[0];
          const fansly = t && /^https:\/\/fansly\.com\//.test(t.url || '');
          const wasOn = st.onFansly;
          st.onFansly = !!fansly; st.tabId = fansly ? t.id : null;
          st.tabPath = fansly ? new URL(t.url).pathname : '';
          if (wasOn !== st.onFansly) render();
          onHref(fansly ? t.url : '');
        });
      } catch { /* the panel is closing */ }
    };
    follow(); setInterval(follow, 700);
    // what the Fansly tab's page script copies reaches the side panel too (bridge.js → runtime message)
    chrome.runtime.onMessage.addListener((msg, sender) => {
      if (msg && msg.type === 'fansly-event' && sender.tab && sender.tab.id === st.tabId) onPageEvent(msg.kind, msg.data);
      return false;
    });
  } else {
    setInterval(() => onHref(location.href), 700);
    window.addEventListener('message', (ev) => {
      if (ev.source !== window || !ev.data || ev.data[TAG] !== 1) return;
      onPageEvent(ev.data.kind, ev.data.data);
    });
  }
  // the page script's copies: a chat loading, a new message in it
  let bumpTimer = null;
  function onPageEvent(kind, data) {
    if (kind === 'messages' && data && data.groupId && !groupFromUrl()) setGroup(String(data.groupId));
    const g = data && (data.groupId || (data.message && data.message.groupId));
    if (kind === 'sent' && g && st.suggest && st.suggest.inserted && String(g) === st.suggest.group) {
      const sug = st.suggest; st.suggest = null;
      call('POST', `/api/fansly/panel/drafts/${sug.draft_id}/sent`, { text: (data && data.content) || '' }).catch(() => {});
      render();
    }
    // a new message, or older ones loading as the chatter scrolls up: reload the panel once they're saved
    if ((kind === 'ws_message' || kind === 'sent' || kind === 'messages') && g && String(g) === st.groupId) {
      // our server has it a few seconds later (the worker batches every 4 s)
      clearTimeout(bumpTimer); bumpTimer = setTimeout(() => loadFan(true), kind === 'messages' ? 6000 : 7000);
    }
  }

  async function refreshStatus() {
    const s = await send({ type: 'panel-status' });
    if (!s) return;
    const was = st.signedIn + '|' + st.accountId;
    st.signedIn = !!s.signedIn; st.user = s.user; st.accountId = s.accountId; st.accountUsername = s.accountUsername;
    if (was !== st.signedIn + '|' + st.accountId) { applyLayout(); render(); loadScripts(); loadFan(false); }
  }

  // ---------- actions ----------
  // ---------- the fan's note: one free-text field, saved a moment after the chatter stops typing ----------
  let noteTimer = null;
  function typeNote(text) {
    st.note = { ...st.note, text, dirty: true, error: '' };
    clearTimeout(noteTimer);
    const fan = st.note.fan;
    noteTimer = setTimeout(() => saveNote(fan), 800);
  }
  async function saveNote(fan) {
    if (!fan || fan !== st.note.fan || !st.note.dirty) return;
    const text = st.note.text;
    st.note = { ...st.note, saving: true }; renderSoon();
    try {
      const r = await call('PUT', '/api/fansly/panel/note', { account: st.accountId, fan, text });
      if (st.note.fan === fan) st.note = { ...st.note, saving: false, dirty: st.note.text !== text, savedAt: r.updated_at, by: (st.user && (st.user.name || st.user.email)) || 'you' };
    } catch (e) { if (st.note.fan === fan) st.note = { ...st.note, saving: false, error: e.message }; }
    renderSoon();
  }
  function flushNote() { if (st.note.dirty) { clearTimeout(noteTimer); saveNote(st.note.fan); } }
  // the AI's note idea goes in as a new line of his note
  function addNote(text) {
    const t = String(text || '').trim();
    if (!t || !st.note.fan) return;
    typeNote(st.note.text ? `${st.note.text.replace(/\s+$/, '')}\n${t}` : t);
    flushNote(); flash('Added to his note'); render();
  }
  async function useScript(s) {
    const where = await insertText(fillPlaceholders(s.text));
    flash(where === 'box' ? 'In the message box: check it and press send yourself' : where === 'clipboard' ? 'Copied: paste it into the message box' : 'Could not reach the message box');
    if (where) call('POST', `/api/fansly/panel/scripts/${s.id}/use`, { account: st.accountId, fan: st.fanId }).catch(() => {});
  }

  // ---------- suggested replies (phase 4) ----------
  function dropSuggestion() {
    const sug = st.suggest;
    if (sug && sug.draft_id) call('POST', `/api/fansly/panel/drafts/${sug.draft_id}`, { status: 'discarded' }).catch(() => {});
    st.suggest = null; st.suggestError = '';
  }
  async function suggest() {
    if (!st.fanId || st.suggestBusy) return;
    dropSuggestion();
    const fan = st.fanId, group = st.groupId;
    st.suggestBusy = true; render();
    try {
      const r = await call('POST', '/api/fansly/panel/suggest', { account: st.accountId, fan });
      if (fan !== st.fanId) return;
      if (r.stopped) st.suggestError = `The AI stays out of this chat: ${(r.reasons || []).join(' ')}`;
      else if (r.quiet) st.suggestError = `The AI suggests not answering now. ${r.text || ''}`;
      else if (r.error) st.suggestError = r.error;
      else st.suggest = { ...r, group, inserted: false };
    } catch (e) { if (fan === st.fanId) st.suggestError = e.message; }
    finally { st.suggestBusy = false; render(); }
  }
  async function useSuggestion(text) {
    const sug = st.suggest; if (!sug) return;
    const where = await insertText(text);
    flash(where === 'box' ? 'In the message box: edit it if you like and press send yourself' : where === 'clipboard' ? 'Copied: paste it into the message box' : 'Could not reach the message box');
    if (where && !sug.inserted) { sug.inserted = true; call('POST', `/api/fansly/panel/drafts/${sug.draft_id}`, { status: 'inserted' }).catch(() => {}); }
    render();
  }

  // ---------- drawing ----------
  function section(key, title, content, extra) {
    const open = st.open[key];
    return h('section', null,
      h('h3', { onclick: () => { st.open[key] = !open; save(); render(); } }, h('span', null, title, extra || null), h('span', null, open ? '–' : '+')),
      open ? h('div', { class: 'c' }, content) : null);
  }

  function shiftStrip() {
    const d = st.data || {};
    const sh = d.shift || {};
    const who = (st.user && (st.user.name || st.user.email)) || sh.user || '?';
    return h('div', { class: 'shift' },
      h('div', { class: 'row' }, h('span', null, 'Signed in: ', h('b', null, who)), h('span', { class: 'muted', style: 'margin-left:auto' }, sh.since ? `on ${sinceLabel(sh.since)}` : '')),
      sh.shift ? h('div', { class: 'muted small' }, `Shift ${String(sh.shift.start).slice(0, 5)}–${String(sh.shift.end).slice(0, 5)}`) : null,
      ...((d.warnings || []).map(w => h('div', { class: `warn ${w.level}` }, w.text))),
      // his chat isn't fully recorded yet: the chatter scrolls up to its first message once
      d.found && d.history && !d.history.complete ? h('div', { class: 'warn mid' },
        h('b', null, 'Chat not fully recorded. '),
        `${d.history.recorded} message${d.history.recorded === 1 ? '' : 's'} so far${d.history.oldest_at ? `, back to ${date(d.history.oldest_at)}` : ''}. Scroll up in the chat to his very first message once; until then his numbers and the AI see only this part.`) : null);
  }

  function suggestion(d) {
    if (!d.page || !d.page.ai) return section('suggest', 'Suggested reply', h('div', { class: 'muted small' }, 'This page has no creator profile yet. A manager fills it in: AI chat, with Fansly picked and this page chosen, then Her profile.'));
    const sug = st.suggest;
    const content = [];
    if (st.suggestBusy) content.push(h('div', { class: 'muted small' }, 'Reading the chat and writing… (10–30 s)'));
    else if (sug) {
      if (sug.goal) content.push(h('div', { class: 'small muted' }, `Aim: ${sug.goal}`));
      for (const m of sug.messages) content.push(h('div', { class: 'script', title: 'Click: put it in the message box', onclick: () => useSuggestion(m) }, h('div', { class: 'tx', style: 'max-height:none;color:#e7e7ea' }, m)));
      if (sug.messages.length > 1) content.push(h('div', { class: 'small muted' }, 'She would send these as separate messages: put in one, send it, then the next.'));
      if (sug.coach) content.push(h('div', { class: 'small muted' }, `Check: ${sug.coach}`));
      content.push(h('div', { class: 'row', style: 'margin-top:6px' },
        h('button', { onclick: suggest }, 'Another one'),
        h('button', { onclick: () => { dropSuggestion(); render(); } }, 'Discard'),
        sug.inserted ? h('span', { class: 'small muted', style: 'margin-left:auto' }, 'in the box') : null));
    } else content.push(h('button', { class: 'primary', onclick: suggest }, 'Suggest a reply'));
    if (st.suggestError) content.push(h('div', { class: 'warn mid', style: 'margin-top:6px' }, st.suggestError));
    return section('suggest', 'Suggested reply', content);
  }

  function fanCard(d) {
    const f = d.fan;
    // his subscription tier as Fansly's own coloured chip, and until when
    const t = f.tier;
    const chip = t ? h('span', { class: 'pill', style: `margin:0 6px 0 0;${t.color ? `color:${t.color};border-color:${t.color};background:${t.color}22` : ''}` }, t.name) : null;
    const ended = f.subscribed_until && Date.parse(f.subscribed_until) < Date.now();
    const sub = t ? h('span', null, chip, f.subscribed_until ? `${ended ? 'ended' : 'until'} ${date(f.subscribed_until)}` : '') : (f.subscribed_until ? `Subscription ${ended ? 'ended' : 'until'} ${date(f.subscribed_until)}` : 'Not subscribed');
    return section('card', 'Fan', [
      h('div', { class: 'name' }, f.nickname || f.display_name || f.username || `#${String(f.fansly_account_id).slice(-6)}`),
      h('div', { class: 'muted' }, [f.username && `@${f.username}`, f.nickname && f.display_name && f.display_name !== f.nickname ? f.display_name : null].filter(Boolean).join(' · ')),
      h('div', { class: 'small', style: 'margin-top:4px' }, sub),
      h('div', { class: 'small muted' }, [`Fansly account since ${date(f.joined_fansly_at)}`, f.last_seen_at ? `last online ${ago(f.last_seen_at)}` : null, f.follows_you ? 'follows you' : null].filter(Boolean).join(' · ')),
      f.lists && f.lists.length ? h('div', { style: 'margin-top:4px' }, f.lists.map(l => h('span', { class: 'pill', style: 'margin:0 4px 0 0' }, l))) : null,
    ]);
  }

  // his spending on every Fansly page of the agency (other platforms can't be matched surely yet)
  function agency(d) {
    const a = d.agency;
    if (!a) return null;
    const pages = (a.pages || []).filter(p => p.page);
    const line = (p) => h('div', { class: 'note' },
      h('div', { class: 'row' }, h('b', null, p.page), p.this_page ? h('span', { class: 'small muted' }, 'this chat') : null, h('span', { style: 'margin-left:auto;font-weight:600' }, money(p.spent_net))),
      h('div', { class: 'small muted' }, [
        `${p.purchases} purchase${p.purchases === 1 ? '' : 's'}`,
        p.last_purchase_at ? `last ${date(p.last_purchase_at)}` : null,
        p.tier ? `${p.tier}${p.subscribed_until ? ` until ${date(p.subscribed_until)}` : ''}` : (p.subscribed_until ? `subscribed until ${date(p.subscribed_until)}` : null),
        p.last_message_at && !p.this_page ? `chatted ${ago(p.last_message_at)}` : null,
      ].filter(Boolean).join(' · ')));
    return section('agency', 'Across the agency', [
      h('div', { class: 'row' }, h('span', { class: 'name', style: 'font-size:14px' }, money(a.total_net)), h('span', { class: 'muted small' }, pages.length > 1 ? `on ${pages.length} of our pages` : 'only on this page so far')),
      ...pages.map(line),
    ], pages.length > 1 ? h('span', { class: 'pill' }, String(pages.length)) : null);
  }

  function metrics(d) {
    const m = d.metrics;
    const stat = (l, v) => h('div', { class: 'stat' }, h('div', { class: 'l' }, l), h('div', { class: 'v' }, v));
    return section('metrics', 'His numbers', [
      h('div', { class: 'grid' },
        stat('Spent with us', money(m.spent_net)),
        stat('PPVs bought', `${m.ppv_bought} / ${m.ppv_offered}`),
        stat('Buy rate', m.buy_rate == null ? '·' : `${m.buy_rate}%`),
        stat('Tips', money(m.tips_net)),
        stat('Avg price', money(m.avg_price)),
        stat('Since last buy', m.days_since_purchase == null ? '·' : `${m.days_since_purchase} d`),
        stat('Replies in', dur(m.reply_s)),
        stat(`Writes at (${myZone()})`, localHours(m.online_hours_utc)),
        stat('Messages', String(m.messages_recorded))),
      m.last_purchase ? h('div', { class: 'small muted', style: 'margin-top:6px' }, `Last purchase: ${m.last_purchase.what} ${money(m.last_purchase.net)} on ${date(m.last_purchase.at)}`) : h('div', { class: 'small muted', style: 'margin-top:6px' }, 'No purchase recorded yet (open Earnings to read the ledger).'),
    ]);
  }

  function notes(d) {
    const n = st.note;
    const status = n.error ? h('span', { class: 'err' }, `Not saved: ${n.error}`) : n.saving ? 'Saving…' : n.dirty ? 'Typing…' : n.savedAt ? `Saved${n.by ? ` by ${n.by}` : ''} · ${when(n.savedAt)}` : 'Every shift sees this. It stays in our tool, never on Fansly.';
    const theirs = (d.fansly_notes || []).map(n => h('div', { class: 'note' }, h('div', { class: 'txt' }, [n.title, n.note].filter(Boolean).join(': ')), h('div', { class: 'small muted' }, `Fansly's own note · ${date(n.at)}`)));
    return section('notes', 'Notes', [
      theirs.length ? h('div', { style: 'margin-bottom:6px' }, theirs) : null,
      h('textarea', { class: 'fan-note', placeholder: 'Write anything about him…', value: n.text, style: 'min-height:140px', oninput: (e) => typeNote(e.target.value), onblur: flushNote }),
      h('div', { class: 'small muted', style: 'margin-top:3px' }, status),
    ]);
  }

  function summary() {
    const s = st.summary;
    const list = (label, xs) => (xs && xs.length ? [h('div', { class: 'lbl' }, label), h('ul', null, xs.map(x => h('li', null, x)))] : []);
    const content = [];
    const hist = st.data && st.data.history;
    if (hist && !hist.complete) content.push(h('div', { class: 'small', style: 'color:#fcd34d;margin-bottom:4px' }, 'Only the recorded part of his chat is read. Scroll up to his first message first for a full summary.'));
    if (st.summaryBusy) content.push(h('div', { class: 'muted small' }, 'Reading his chat… (a few seconds)'));
    if (s) {
      // only what the chat tells us about him: what he likes, what he said yes and no to and why, his life
      const deals = (label, xs) => (xs && xs.length ? [h('div', { class: 'lbl' }, label), h('ul', null, xs.map(d => (typeof d === 'string' ? h('li', null, d)
        : h('li', null, h('b', null, d.what), d.why ? h('span', null, ` — ${d.why}`) : null, d.when ? h('span', { class: 'muted small' }, ` (${d.when})`) : null))))] : []);
      const about = (xs) => (xs && xs.length ? [h('div', { class: 'lbl' }, 'About him'), h('ul', null, xs.map(f => (typeof f === 'string' ? h('li', null, f)
        : h('li', null, f.topic ? h('span', { class: 'muted' }, `${f.topic}: `) : null, f.detail))))] : []);
      content.push(...list('Likes', s.likes), ...list('Doesn\'t like', s.dislikes),
        ...deals('Said yes to', s.said_yes || s.bought), ...deals('Said no to', s.said_no || s.refused),
        ...list('Open promises', s.promises), ...about(s.about || s.facts));
      content.push(h('div', { class: 'row small muted', style: 'margin-top:6px' }, `From his last ${s.messages_used || '?'} messages · just written`, h('button', { style: 'margin-left:auto', disabled: st.summaryBusy, onclick: () => loadSummary(true) }, 'Regenerate')));
    } else if (!st.summaryBusy) {
      content.push(h('div', { class: 'muted small' }, st.summaryError || 'Reads his chat and purchases and writes down what he told us: likes, what he said yes and no to and why, his life. About a tenth of a cent each time.'), h('button', { class: 'primary', style: 'margin-top:4px', onclick: () => loadSummary(true) }, 'Generate'));
    }
    if (s && st.summaryError) content.push(h('div', { class: 'err small' }, st.summaryError));
    return section('summary', 'AI summary', content);
  }

  function scripts() {
    const all = st.scripts;
    if (!all) return section('scripts', 'Scripts', h('div', { class: 'muted small' }, 'Loading…'));
    const q = st.scriptFilter.trim().toLowerCase();
    const shown = q ? all.filter(s => (s.title + ' ' + s.text).toLowerCase().includes(q)) : all;
    const owned = new Set((st.data && st.data.owned_item_ids) || []);
    const byStage = new Map();
    for (const s of shown) { const a = byStage.get(s.stage) || []; a.push(s); byStage.set(s.stage, a); }
    const filter = h('input', { placeholder: 'Find a script', value: st.scriptFilter, oninput: (e) => { st.scriptFilter = e.target.value; renderSoon(); } });
    return section('scripts', 'Scripts', [
      all.length ? filter : h('div', { class: 'muted small' }, 'No scripts yet. Managers add them in the tool: Dashboard, Fansly, Scripts.'),
      h('div', { style: 'margin-top:6px' }, Object.keys(STAGE_LABEL).filter(k => byStage.has(k)).map(k => {
        const open = q || st.openStages.has(k);
        return h('div', { class: 'stage' },
          h('div', { class: 'h', onclick: () => { if (st.openStages.has(k)) st.openStages.delete(k); else st.openStages.add(k); save(); render(); } }, h('span', null, STAGE_LABEL[k], h('span', { class: 'pill' }, String(byStage.get(k).length))), h('span', null, open ? '–' : '+')),
          open ? h('div', null, byStage.get(k).map(s => {
            const has = (s.item_ids || []).filter(id => owned.has(String(id)));
            return h('div', { class: 'script', title: 'Click: put it in the message box', onclick: () => useScript(s) },
              h('div', { class: 'st' }, s.title, has.length ? h('span', { class: 'pill', style: 'color:#fcd34d' }, 'he owns its content') : null),
              h('div', { class: 'tx' }, fillPlaceholders(s.text)));
          })) : null);
      })),
    ], all.length ? h('span', { class: 'pill' }, String(all.length)) : null);
  }

  function body() {
    if (!st.signedIn) return h('div', { class: 'muted', style: 'padding:12px' }, 'Sign in to the extension (its icon in the toolbar) with your account from the tool. The panel and the recording start after that.');
    if (SIDE && !st.onFansly) return h('div', { class: 'muted', style: 'padding:12px' }, 'Open fansly.com/messages in this window. The panel follows the chat that is open there.');
    if (!st.accountId) return h('div', { class: 'muted', style: 'padding:12px' }, 'Open the Messages page once so the extension learns which Fansly page this is.');
    const d = st.data;
    const parts = [];
    if (st.error) parts.push(h('div', { class: 'warn high' }, st.error));
    if (!st.groupId) parts.push(h('div', { class: 'muted', style: 'padding:6px 0' }, 'Open a chat to see the fan here.'));
    else if (!d) parts.push(h('div', { class: 'muted', style: 'padding:6px 0' }, st.loading ? 'Loading the fan…' : ''));
    else if (!d.found && d.reason === 'not_assigned') { parts.push(h('div', { class: 'warn high' }, d.message || 'You are not on the roster for this page.')); return h('div', { class: 'body' }, parts); }
    else if (!d.found) parts.push(h('div', { class: 'muted', style: 'padding:6px 0' }, d.reason === 'page' ? 'This Fansly page is not in the tool yet; it appears after the first messages are recorded.' : 'This chat is not recorded yet. It will be in a few seconds; scroll up in it to record older messages.'));
    else parts.push(suggestion(d), fanCard(d), agency(d), metrics(d), notes(d), summary());
    parts.push(scripts());
    return h('div', { class: 'body' }, parts);
  }

  let renderTimer = null;
  function renderSoon() { clearTimeout(renderTimer); renderTimer = setTimeout(render, 150); }
  function render() {
    // don't redraw under a chatter who is typing a note (a background refresh would wipe the cursor)
    const active = root.activeElement;
    if (active && (active.tagName === 'TEXTAREA' || active.tagName === 'INPUT')) {
      const keep = { tag: active.tagName, ph: active.getAttribute('placeholder'), start: active.selectionStart, end: active.selectionEnd };
      draw();
      const again = [...root.querySelectorAll(keep.tag.toLowerCase())].find(el => el.getAttribute('placeholder') === keep.ph);
      if (again) { again.focus(); try { again.setSelectionRange(keep.start, keep.end); } catch { /* ignore */ } }
      return;
    }
    draw();
  }
  function draw() {
    const oldBody = root.querySelector('.body');
    const scrollTop = oldBody ? oldBody.scrollTop : 0;
    root.replaceChildren();
    root.append(h('style', null, CSS + (SIDE ? SIDE_CSS : '')));
    if (st.collapsed && !SIDE) {
      root.append(h('div', { class: 'wrap' }, h('div', { class: 'strip', title: 'Open the panel', onclick: () => { st.collapsed = false; save(); applyLayout(); render(); } }, h('span', null, 'Chatting Manager'))));
      return;
    }
    const grip = h('div', { class: 'grip', title: 'Drag to resize' });
    grip.addEventListener('mousedown', startResize);
    const panel = h('div', { class: 'panel' },
      h('header', null,
        h('span', { class: 't' }, 'Chatting Manager', st.accountUsername ? h('span', { class: 'muted' }, ` · @${st.accountUsername}`) : null),
        SIDE ? null : h('button', { class: 'icon', title: st.push ? 'The page makes room for the panel. Click to lay the panel over the page instead.' : 'The panel lies over the page. Click to make room for it.', onclick: () => { st.push = !st.push; save(); applyLayout(); render(); } }, st.push ? '⇤' : '⇥'),
        st.groupId && st.signedIn ? h('button', { class: 'icon', title: 'Reload', onclick: () => loadFan(false) }, '↻') : null,
        SIDE ? null : h('button', { class: 'icon', title: 'Collapse', onclick: () => { st.collapsed = true; save(); applyLayout(); render(); } }, '›')),
      st.signedIn && st.accountId ? shiftStrip() : null,
      body(),
      st.toast ? h('div', { class: 'toast' }, st.toast) : null);
    root.append(h('div', { class: 'wrap', style: SIDE ? '' : `width:${st.width}px` }, grip, panel));
    const newBody = root.querySelector('.body');
    if (newBody && scrollTop) newBody.scrollTop = scrollTop;      // a refresh keeps the chatter's place
  }

  function startResize(e) {
    e.preventDefault();
    const x0 = e.clientX, w0 = st.width;
    const move = (ev) => { st.width = Math.max(MIN_W, Math.min(MAX_W, w0 + (x0 - ev.clientX))); root.querySelector('.wrap').style.width = st.width + 'px'; applyLayout(); };
    const up = () => { removeEventListener('mousemove', move, true); removeEventListener('mouseup', up, true); save(); };
    addEventListener('mousemove', move, true); addEventListener('mouseup', up, true);
  }

  // ---------- remembered per browser ----------
  function save() {
    try { chrome.storage.local.set({ panelPrefs: { width: st.width, collapsed: st.collapsed, push: st.push, open: st.open, openStages: [...st.openStages] } }); } catch { /* ignore */ }
  }
  function restore() {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get(['panelPrefs', 'panelOff', 'panelMode'], (s) => {
          const p = s.panelPrefs || {};
          if (p.width) st.width = Math.max(MIN_W, Math.min(MAX_W, p.width));
          else st.width = Math.max(MIN_W, Math.min(MAX_W, Math.round(innerWidth / 3)));
          if (p.collapsed != null) st.collapsed = !!p.collapsed;
          if (p.push != null) st.push = !!p.push;
          if (p.open) st.open = { ...st.open, ...p.open };
          if (Array.isArray(p.openStages)) st.openStages = new Set(p.openStages);
          // where the panel shows: 'side' (Chrome's side panel, the default), 'page' (inside Fansly), 'off'
          const mode = s.panelMode || (s.panelOff ? 'off' : 'side');
          resolve(SIDE ? false : mode !== 'page');
        });
      } catch { resolve(false); }
    });
  }

  // ---------- start ----------
  function mount() {
    if (!host.isConnected) (SIDE ? document.body : document.documentElement).append(host);
    applyLayout();
    render();
  }
  function unmount() { host.remove(); pushStyle.textContent = ''; }

  (async () => {
    const off = await restore();
    const start = () => {
      if (!off) mount();
      if (!SIDE) st.groupId = groupFromUrl();
      refreshStatus();
      setInterval(refreshStatus, 5000);
      setInterval(() => { if (!document.hidden && host.isConnected) loadFan(true); }, REFRESH_MS);
      setInterval(() => { if (host.isConnected && st.data) render(); }, 60000);    // the timers on the shift strip
    };
    if (document.body) start(); else document.addEventListener('DOMContentLoaded', start, { once: true });
    // the popup's choice of where the panel shows: inside the page only in 'page' mode
    chrome.storage.onChanged.addListener((ch) => {
      if (ch.panelMode && !SIDE) { if (ch.panelMode.newValue === 'page') { mount(); loadFan(false); } else unmount(); }
      if (ch.session) refreshStatus();
    });
  })();
})();
