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
  if (window.top !== window || document.getElementById('cmt-panel-host')) return;
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
    width: 420, collapsed: false, push: true, open: { card: true, metrics: true, notes: true, summary: true, scripts: true },
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
  const hours = (hs) => (hs && hs.length ? hs.map(x => `${String(x).padStart(2, '0')}:00`).join(', ') : '·');
  const sinceLabel = (iso) => { if (!iso) return ''; const m = Math.floor((Date.now() - Date.parse(iso)) / 60000); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`; };

  function flash(text) { st.toast = text; render(); setTimeout(() => { if (st.toast === text) { st.toast = ''; render(); } }, 3500); }

  // ---------- the page layout: make room for the panel ----------
  function applyLayout() {
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
      // a new fan: read (or build) his summary; the same fan whose chat moved on: ask again at most every 3 minutes
      if (data.found && (fanChanged || (data.summary && data.summary.stale && Date.now() - st.summaryAskedAt > 180000))) loadSummary(false);
      else if (data.found && !st.summaryBusy) st.summary = data.summary;
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
  function groupFromUrl() { const m = location.pathname.match(/^\/messages\/(\d{5,25})/); return m ? m[1] : null; }
  function setGroup(g) {
    if (g === st.groupId) return;
    st.groupId = g; st.fanId = null; st.data = null; st.summary = null; st.summaryError = ''; st.noteDraft = ''; st.editing = null;
    loadFan(false);
  }
  let lastHref = location.href;
  setInterval(() => { if (location.href !== lastHref) { lastHref = location.href; const g = groupFromUrl(); if (g) setGroup(g); else if (!/^\/messages/.test(location.pathname)) setGroup(null); } }, 700);
  // the page script's copies: a chat loading, a new message in it
  let bumpTimer = null;
  window.addEventListener('message', (ev) => {
    if (ev.source !== window || !ev.data || ev.data[TAG] !== 1) return;
    const { kind, data } = ev.data;
    if (kind === 'messages' && data && data.groupId && !groupFromUrl()) setGroup(String(data.groupId));
    const g = data && (data.groupId || (data.message && data.message.groupId));
    if ((kind === 'ws_message' || kind === 'sent') && g && String(g) === st.groupId) {
      // our server has it a few seconds later (the worker batches every 4 s)
      clearTimeout(bumpTimer); bumpTimer = setTimeout(() => loadFan(true), 7000);
    }
  });

  async function refreshStatus() {
    const s = await send({ type: 'panel-status' });
    if (!s) return;
    const was = st.signedIn + '|' + st.accountId;
    st.signedIn = !!s.signedIn; st.user = s.user; st.accountId = s.accountId; st.accountUsername = s.accountUsername;
    if (was !== st.signedIn + '|' + st.accountId) { applyLayout(); render(); loadScripts(); loadFan(false); }
  }

  // ---------- actions ----------
  async function addNote(text) {
    const t = String(text || '').trim();
    if (!t || !st.fanId) return;
    try { await call('POST', '/api/fansly/panel/notes', { account: st.accountId, fan: st.fanId, text: t }); st.noteDraft = ''; flash('Note saved'); await loadFan(true); }
    catch (e) { flash(e.message); }
  }
  async function saveEdit(id) {
    try { await call('PATCH', `/api/fansly/panel/notes/${id}`, { text: st.editDraft }); st.editing = null; await loadFan(true); }
    catch (e) { flash(e.message); }
  }
  async function pinNote(n) { try { await call('PATCH', `/api/fansly/panel/notes/${n.id}`, { pinned: !n.pinned }); await loadFan(true); } catch (e) { flash(e.message); } }
  async function deleteNote(n) {
    if (!confirm('Delete this note?')) return;
    try { await call('DELETE', `/api/fansly/panel/notes/${n.id}`); await loadFan(true); } catch (e) { flash(e.message); }
  }
  async function useScript(s) {
    const where = await insertText(fillPlaceholders(s.text));
    flash(where === 'box' ? 'In the message box: check it and press send yourself' : where === 'clipboard' ? 'Copied: paste it into the message box' : 'Could not reach the message box');
    if (where) call('POST', `/api/fansly/panel/scripts/${s.id}/use`, { account: st.accountId, fan: st.fanId }).catch(() => {});
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
      ...((d.warnings || []).map(w => h('div', { class: `warn ${w.level}` }, w.text))));
  }

  function fanCard(d) {
    const f = d.fan;
    const sub = f.subscription_tier_name ? `${f.subscription_tier_name}${f.subscribed_until ? ` until ${date(f.subscribed_until)}` : ''}` : (f.subscribed_until ? `subscribed until ${date(f.subscribed_until)}` : 'not subscribed');
    return section('card', 'Fan', [
      h('div', { class: 'name' }, f.nickname || f.display_name || f.username || `#${String(f.fansly_account_id).slice(-6)}`),
      h('div', { class: 'muted' }, [f.username && `@${f.username}`, f.nickname && f.display_name && f.display_name !== f.nickname ? f.display_name : null].filter(Boolean).join(' · ')),
      h('div', { class: 'small', style: 'margin-top:4px' }, sub),
      h('div', { class: 'small muted' }, `Joined Fansly ${date(f.joined_fansly_at)} · last seen ${ago(f.last_seen_at)}${f.follows_you ? ' · follows you' : ''}`),
    ]);
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
        stat('Writes at', hours(m.online_hours)),
        stat('Messages', String(m.messages_recorded))),
      m.last_purchase ? h('div', { class: 'small muted', style: 'margin-top:6px' }, `Last purchase: ${m.last_purchase.what} ${money(m.last_purchase.net)} on ${date(m.last_purchase.at)}`) : h('div', { class: 'small muted', style: 'margin-top:6px' }, 'No purchase recorded yet (open Earnings to read the ledger).'),
    ]);
  }

  function notes(d) {
    const list = d.notes || [];
    const add = h('textarea', { placeholder: 'Add a note for every shift (stays in our tool, never on Fansly)', value: st.noteDraft, oninput: (e) => { st.noteDraft = e.target.value; } });
    return section('notes', 'Notes', [
      h('div', null, list.length ? list.map(n => st.editing === n.id
        ? h('div', { class: 'note' },
          h('textarea', { placeholder: 'Edit the note', value: st.editDraft, oninput: (e) => { st.editDraft = e.target.value; } }),
          h('div', { class: 'row', style: 'margin-top:4px' }, h('button', { class: 'primary', onclick: () => saveEdit(n.id) }, 'Save'), h('button', { onclick: () => { st.editing = null; render(); } }, 'Cancel')))
        : h('div', { class: 'note' },
          h('div', { class: 'txt' }, n.pinned ? h('span', { class: 'pin' }, '★ ') : null, n.text),
          h('div', { class: 'row small muted' }, `${n.author} · ${when(n.created_at)}`,
            n.can_edit ? h('span', { style: 'margin-left:auto' },
              h('button', { class: 'link', onclick: () => pinNote(n) }, n.pinned ? 'unpin' : 'pin'),
              h('button', { class: 'link', onclick: () => { st.editing = n.id; st.editDraft = n.text; render(); } }, 'edit'),
              h('button', { class: 'link', onclick: () => deleteNote(n) }, 'delete')) : null)))
        : h('div', { class: 'muted small' }, 'No notes on him yet.')),
      add,
      h('div', { class: 'row', style: 'margin-top:4px' }, h('button', { class: 'primary', onclick: () => addNote(st.noteDraft) }, 'Add note')),
    ], list.length ? h('span', { class: 'pill' }, String(list.length)) : null);
  }

  function summary() {
    const s = st.summary;
    const list = (label, xs) => (xs && xs.length ? [h('div', { class: 'lbl' }, label), h('ul', null, xs.map(x => h('li', null, x)))] : []);
    const content = [];
    if (st.summaryBusy) content.push(h('div', { class: 'muted small' }, s ? 'Updating…' : 'Reading his chat…'));
    if (s) {
      content.push(...list('Likes', s.likes), ...list('Bought', s.bought), ...list('Said no to', s.refused), ...list('Open promises', s.promises), ...list('About him', s.facts));
      if (s.next_step) content.push(h('div', { class: 'lbl' }, 'Next step'), h('div', null, s.next_step));
      if (s.suggested_note) content.push(h('div', { class: 'warn info', style: 'margin-top:8px' }, 'Note idea: ', s.suggested_note, ' ', h('button', { class: 'link', onclick: () => addNote(s.suggested_note) }, 'save as note')));
      content.push(h('div', { class: 'row small muted', style: 'margin-top:6px' }, `From ${s.messages_used || '?'} messages · ${ago(s.built_at)}`, h('button', { class: 'link', style: 'margin-left:auto', disabled: st.summaryBusy, onclick: () => loadSummary(true) }, 'refresh')));
    } else if (!st.summaryBusy) {
      content.push(h('div', { class: 'muted small' }, st.summaryError || 'No summary yet.'), h('button', { style: 'margin-top:4px', onclick: () => loadSummary(true) }, 'Summarise him'));
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
    if (!st.accountId) return h('div', { class: 'muted', style: 'padding:12px' }, 'Open the Messages page once so the extension learns which Fansly page this is.');
    const d = st.data;
    const parts = [];
    if (st.error) parts.push(h('div', { class: 'warn high' }, st.error));
    if (!st.groupId) parts.push(h('div', { class: 'muted', style: 'padding:6px 0' }, 'Open a chat to see the fan here.'));
    else if (!d) parts.push(h('div', { class: 'muted', style: 'padding:6px 0' }, st.loading ? 'Loading the fan…' : ''));
    else if (!d.found) parts.push(h('div', { class: 'muted', style: 'padding:6px 0' }, d.reason === 'page' ? 'This Fansly page is not in the tool yet; it appears after the first messages are recorded.' : 'This chat is not recorded yet. It will be in a few seconds; scroll up in it to record older messages.'));
    else parts.push(fanCard(d), metrics(d), notes(d), summary());
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
    root.append(h('style', null, CSS));
    if (st.collapsed) {
      root.append(h('div', { class: 'wrap' }, h('div', { class: 'strip', title: 'Open the panel', onclick: () => { st.collapsed = false; save(); applyLayout(); render(); } }, h('span', null, 'Chatting Manager'))));
      return;
    }
    const grip = h('div', { class: 'grip', title: 'Drag to resize' });
    grip.addEventListener('mousedown', startResize);
    const panel = h('div', { class: 'panel' },
      h('header', null,
        h('span', { class: 't' }, 'Chatting Manager', st.accountUsername ? h('span', { class: 'muted' }, ` · @${st.accountUsername}`) : null),
        h('button', { class: 'icon', title: st.push ? 'The page makes room for the panel. Click to lay the panel over the page instead.' : 'The panel lies over the page. Click to make room for it.', onclick: () => { st.push = !st.push; save(); applyLayout(); render(); } }, st.push ? '⇤' : '⇥'),
        st.groupId && st.signedIn ? h('button', { class: 'icon', title: 'Reload', onclick: () => loadFan(false) }, '↻') : null,
        h('button', { class: 'icon', title: 'Collapse', onclick: () => { st.collapsed = true; save(); applyLayout(); render(); } }, '›')),
      st.signedIn && st.accountId ? shiftStrip() : null,
      body(),
      st.toast ? h('div', { class: 'toast' }, st.toast) : null);
    root.append(h('div', { class: 'wrap', style: `width:${st.width}px` }, grip, panel));
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
        chrome.storage.local.get(['panelPrefs', 'panelOff'], (s) => {
          const p = s.panelPrefs || {};
          if (p.width) st.width = Math.max(MIN_W, Math.min(MAX_W, p.width));
          else st.width = Math.max(MIN_W, Math.min(MAX_W, Math.round(innerWidth / 3)));
          if (p.collapsed != null) st.collapsed = !!p.collapsed;
          if (p.push != null) st.push = !!p.push;
          if (p.open) st.open = { ...st.open, ...p.open };
          if (Array.isArray(p.openStages)) st.openStages = new Set(p.openStages);
          resolve(!!s.panelOff);
        });
      } catch { resolve(false); }
    });
  }

  // ---------- start ----------
  function mount() {
    if (!host.isConnected) document.documentElement.append(host);
    applyLayout();
    render();
  }
  function unmount() { host.remove(); pushStyle.textContent = ''; }

  (async () => {
    const off = await restore();
    const start = () => {
      if (!off) mount();
      st.groupId = groupFromUrl();
      refreshStatus();
      setInterval(refreshStatus, 5000);
      setInterval(() => { if (!document.hidden && host.isConnected) loadFan(true); }, REFRESH_MS);
      setInterval(() => { if (host.isConnected && st.data) render(); }, 60000);    // the timers on the shift strip
    };
    if (document.body) start(); else document.addEventListener('DOMContentLoaded', start, { once: true });
    // the popup's "Show the side panel" switch
    chrome.storage.onChanged.addListener((ch) => {
      if (ch.panelOff) { if (ch.panelOff.newValue) unmount(); else { mount(); loadFan(false); } }
      if (ch.session) refreshStatus();
    });
  })();
})();
