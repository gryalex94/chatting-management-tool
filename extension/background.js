/**
 * The background worker: collects what the page script copied, removes repeats,
 * batches it and posts it to the tool (POST /api/fansly/ingest) with the chatter's
 * session. Keeps a queue in storage so nothing is lost when the browser or the
 * internet hiccups. Sends a heartbeat every minute so the dashboard knows who is
 * watching which account (POST /api/fansly/presence).
 */
const VERSION = chrome.runtime.getManifest().version;
const DEFAULT_API = 'https://backend-production-bdeb.up.railway.app';   // change in the popup if the tool lives elsewhere
const FLUSH_MS = 4000, BATCH = 60, BATCH_BYTES = 1_500_000, HEARTBEAT_MIN = 1, MAX_QUEUE = 2000;
const KEEP = new Set(['me', 'groups', 'group', 'messages', 'sent', 'ws_message', 'ws_order', 'ws_other', 'unread', 'subscribers', 'ledger', 'media_created',
  'fnotes', 'fnote_deleted', 'lists', 'list_items', 'followers', 'notifications', 'stats', 'orders', 'msg_deleted', 'broadcasts', 'tiers']);

let queue = [];                 // events waiting to go
let seen = new Map();           // hash → time, to drop repeats (the page asks for the same chat again and again)
let flushTimer = null, flushing = false;
let state = { lastFlushAt: null, lastError: null, sentTotal: 0, accountId: null, accountUsername: null, needAccount: false };

// ---- small helpers ----
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
const get = (keys) => new Promise(r => chrome.storage.local.get(keys, r));
const set = (obj) => new Promise(r => chrome.storage.local.set(obj, r));
async function settings() {
  const s = await get(['session', 'apiUrl', 'deviceId']);
  if (!s.deviceId) { s.deviceId = 'd_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36); await set({ deviceId: s.deviceId }); }
  return { session: s.session || null, apiUrl: (s.apiUrl || DEFAULT_API).replace(/\/+$/, ''), deviceId: s.deviceId };
}
async function saveState() { await set({ state }); }

// ---- the chatter's session (token + refresh) ----
async function validSession() {
  const { session, apiUrl } = await settings();
  if (!session || !session.token) return null;
  if (!session.expiresAt || session.expiresAt - Date.now() > 2 * 60_000) return session;
  try {
    const res = await fetch(apiUrl + '/api/fansly/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: session.refreshToken }) });
    if (!res.ok) { if (res.status === 401 || res.status === 403) { await set({ session: null }); state.lastError = 'Signed out: please sign in again'; await saveState(); } return null; }
    const fresh = await res.json();
    await set({ session: fresh });
    return fresh;
  } catch (e) { state.lastError = 'Could not refresh the sign-in: ' + e.message; await saveState(); return session; }
}

async function api(path, body) {
  const session = await validSession();
  if (!session) throw Object.assign(new Error('Not signed in'), { noSession: true });
  const { apiUrl, deviceId } = await settings();
  const res = await fetch(apiUrl + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.token },
    body: JSON.stringify({ deviceId, extensionVersion: VERSION, account: state.accountId ? { id: state.accountId, username: state.accountUsername } : null, ...body }) });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) { await set({ session: null }); throw Object.assign(new Error('Signed out: please sign in again'), { noSession: true }); }
  if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
  return data;
}

// ---- the side panel's calls (GET/POST/PATCH/DELETE under /api/fansly/panel) ----
async function panelApi(method, path, body) {
  if (!/^\/api\/fansly\/panel\//.test(path)) throw new Error('Not a panel address');
  const session = await validSession();
  if (!session) throw Object.assign(new Error('Not signed in'), { noSession: true });
  const { apiUrl, deviceId } = await settings();
  const sep = path.includes('?') ? '&' : '?';
  const url = apiUrl + path + (method === 'GET' ? `${sep}deviceId=${encodeURIComponent(deviceId)}` : '');
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.token }, body: method === 'GET' ? undefined : JSON.stringify(body || {}) });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) { await set({ session: null }); throw Object.assign(new Error('Signed out: please sign in again'), { noSession: true }); }
  if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
  return data;
}

// ---- learning which Fansly account this browser shows ----
function noteAccount(kind, data) {
  let id = null, username = null;
  // only proof: Fansly's own "who am I" answer, or a message this browser sent (never a chat's media, which can be the fan's)
  if (kind === 'me' && data && data.id) { id = data.id; username = data.username || null; }
  else if (kind === 'sent' && data) id = data.senderId;
  if (id && String(id) !== state.accountId) { state.accountId = String(id); state.accountUsername = username; state.needAccount = false; saveState(); }
  else if (id && username && !state.accountUsername) { state.accountUsername = username; saveState(); }
}

// ---- the queue ----
async function enqueue(msg) {
  if (!KEEP.has(msg.kind)) return;
  noteAccount(msg.kind, msg.data);
  if (msg.kind === 'ledger') { state.lastLedgerAt = Date.now(); saveState(); }      // the popup reminds to open Earnings once a day
  const body = JSON.stringify(msg.data);
  const h = hash(msg.kind + '|' + body);
  const now = Date.now();
  // the same answer again within 10 minutes (a re-opened chat, a re-fetched list): skip it
  if (seen.has(h) && now - seen.get(h) < 10 * 60_000 && msg.kind !== 'sent') return;
  seen.set(h, now);
  if (seen.size > 3000) seen = new Map([...seen.entries()].filter(([, t]) => now - t < 10 * 60_000));
  queue.push({ id: h + '_' + now.toString(36), at: msg.at || now, kind: msg.kind, data: msg.data });
  if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE);
  await set({ queue });
  scheduleFlush();
}

function scheduleFlush() { if (!flushTimer) flushTimer = setTimeout(() => { flushTimer = null; flush(); }, FLUSH_MS); }

async function flush() {
  await ready;
  if (flushing || !queue.length) return;
  flushing = true;
  try {
    // up to BATCH events, but never more than ~1.5 MB in one go (a history page with media is big)
    const batch = []; let bytes = 0;
    for (const e of queue) { const n = JSON.stringify(e).length; if (batch.length && (batch.length >= BATCH || bytes + n > BATCH_BYTES)) break; batch.push(e); bytes += n; }
    const out = await api('/api/fansly/ingest', { events: batch });
    const ok = new Set(out.accepted || []);
    queue = queue.filter(e => !ok.has(e.id));
    if (out.account) { state.accountId = out.account.fanslyId || state.accountId; state.accountUsername = out.account.username || state.accountUsername; }
    state.needAccount = !!out.needAccount;
    if (out.needAccount && queue.length > 200) queue = queue.slice(-200);     // don't pile up forever while the account is unknown
    state.lastFlushAt = Date.now(); state.sentTotal += ok.size; state.lastError = out.ok ? null : (out.error || null);
    if (out.errors && out.errors.length) state.lastError = out.errors[0];
  } catch (e) {
    state.lastError = e.message;
  } finally {
    flushing = false;
    await set({ queue }); await saveState();
    if (queue.length) scheduleFlush();
  }
}

// ---- presence ----
async function heartbeat() {
  await ready;
  try {
    const tabs = await chrome.tabs.query({ url: 'https://fansly.com/*' });
    if (!tabs.length) return;
    const out = await api('/api/fansly/presence', { action: 'heartbeat' });
    if (out.account && out.account.username && !state.accountUsername) state.accountUsername = out.account.username;
    state.jobs = Array.isArray(out.jobs) ? out.jobs : []; state.staff = !!out.staff;
    state.assigned = out.assigned !== false;
    state.lastError = null; await saveState();
  } catch (e) { if (!e.noSession) { state.lastError = e.message; await saveState(); } }
}

// ---- "Read from Fansly": open Fansly's own page in a tab and let it scroll its list to the end ----
// Fansly's app makes every request itself, as when a person scrolls; the extension only records,
// as always. Started by a click (a manager's button, or the chatter's Start on a manager's request).
// Fansly's own addresses (its app's routes, 24 Oct 2026): the old /earnings and /subscribers lead to "page does not exist"
const FETCH_URL = { ledger: 'https://fansly.com/creator/stats/earnings', subscribers: 'https://fansly.com/creator/subscribers', statistics: 'https://fansly.com/creator/stats/overview' };   // then the Earnings tab too
let activeJob = null;                       // { id, kind, tabId, originTabId, progress }
let lastProgressPost = 0;
async function startFetch({ jobId, kind }) {
  if (activeJob) return { error: 'Already reading from Fansly in this browser' };
  let job;
  if (jobId) {
    job = (state.jobs || []).find(j => j.id === jobId);
    if (!job) return { error: 'That request is gone' };
  } else {
    const out = await api('/api/fansly/fetch', { kind });
    job = out.job;
  }
  const [origin] = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = await chrome.tabs.create({ url: FETCH_URL[job.kind], active: true });
  activeJob = { id: job.id, kind: job.kind, tabId: tab.id, originTabId: origin ? origin.id : null, progress: { rows: 0, total: null, note: 'opening Fansly' } };
  state.activeJob = activeJob; await saveState();
  const { deviceId } = await settings();
  api(`/api/fansly/fetch/${job.id}`, { status: 'running', deviceId, progress: activeJob.progress }).catch(() => {});
  return { ok: true, job: activeJob };
}
async function fetchProgress(progress) {
  if (!activeJob) return;
  activeJob.progress = progress; state.activeJob = activeJob; saveState();
  if (Date.now() - lastProgressPost > 5000) { lastProgressPost = Date.now(); api(`/api/fansly/fetch/${activeJob.id}`, { status: 'running', progress }).catch(() => {}); }
}
async function finishFetch({ status, progress, error }) {
  if (!activeJob) return;
  const job = activeJob; activeJob = null; state.activeJob = null;
  state.lastFetch = { kind: job.kind, status, progress, error: error || null, at: Date.now() };
  state.jobs = (state.jobs || []).filter(j => j.id !== job.id);
  await saveState();
  flush();                                                     // what the page loaded goes to the tool now
  api(`/api/fansly/fetch/${job.id}`, { status, progress, error: error || null }).catch(() => {});
  try { await chrome.tabs.remove(job.tabId); } catch { /* closed already */ }
  if (job.originTabId) { try { await chrome.tabs.update(job.originTabId, { active: true }); } catch { /* gone */ } }
}
// the reading tab was closed by hand: the read ends there
chrome.tabs.onRemoved.addListener((tabId) => { if (activeJob && activeJob.tabId === tabId) finishFetch({ status: 'cancelled', progress: activeJob.progress, error: 'The Fansly tab was closed' }); });

// ---- wiring ----
chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  if (msg && msg.type === 'fansly-event') { enqueue(msg); return false; }
  if (msg && msg.type === 'fansly-tab') { heartbeat(); return false; }
  if (msg && msg.type === 'popup-status') {
    settings().then(async (s) => {
      respond({ version: VERSION, apiUrl: s.apiUrl, deviceId: s.deviceId, session: s.session ? { user: s.session.user, expiresAt: s.session.expiresAt } : null, queue: queue.length, state });
    });
    return true;
  }
  if (msg && msg.type === 'popup-login') {
    (async () => {
      try {
        const apiUrl = (msg.apiUrl || DEFAULT_API).replace(/\/+$/, '');
        const res = await fetch(apiUrl + '/api/fansly/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: msg.email, password: msg.password }) });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return respond({ error: data.error || ('Could not sign in (HTTP ' + res.status + ')') });
        await set({ session: data, apiUrl });
        state.lastError = null; await saveState();
        heartbeat(); scheduleFlush();
        respond({ ok: true, user: data.user });
      } catch (e) { respond({ error: 'Could not reach the tool at that address: ' + e.message }); }
    })();
    return true;
  }
  if (msg && msg.type === 'popup-logout') {
    (async () => {
      try { await api('/api/fansly/presence', { action: 'logout' }); } catch { /* already out */ }
      await set({ session: null }); respond({ ok: true });
    })();
    return true;
  }
  if (msg && msg.type === 'fetch-start') { startFetch(msg).then(respond).catch(e => respond({ error: e.message })); return true; }
  if (msg && msg.type === 'fetch-stop') { if (activeJob) chrome.tabs.sendMessage(activeJob.tabId, { type: 'cmt-fetch-stop' }, () => void chrome.runtime.lastError); respond({ ok: true }); return false; }
  if (msg && msg.type === 'fetch-tab-ready') { respond(activeJob && sender.tab && sender.tab.id === activeJob.tabId ? { job: { id: activeJob.id, kind: activeJob.kind } } : {}); return false; }
  if (msg && msg.type === 'fetch-progress') { if (activeJob && sender.tab && sender.tab.id === activeJob.tabId) fetchProgress(msg.progress); return false; }
  if (msg && msg.type === 'fetch-done') { if (activeJob && sender.tab && sender.tab.id === activeJob.tabId) finishFetch(msg); return false; }
  if (msg && msg.type === 'panel-status') {
    (async () => {
      await ready;
      const s = await settings();
      respond({ signedIn: !!(s.session && s.session.token), user: s.session ? s.session.user : null, accountId: state.accountId, accountUsername: state.accountUsername, version: VERSION,
        jobs: state.jobs || [], staff: !!state.staff, activeJob, lastFetch: state.lastFetch || null });
    })();
    return true;
  }
  if (msg && msg.type === 'panel-api') {
    panelApi(String(msg.method || 'GET').toUpperCase(), String(msg.path || ''), msg.body)
      .then(data => respond({ ok: true, data }))
      .catch(e => respond({ ok: false, error: e.message, noSession: !!e.noSession }));
    return true;
  }
  if (msg && msg.type === 'popup-flush') { flush().then(() => respond({ ok: true, queue: queue.length })); return true; }
  return false;
});

chrome.alarms.create('cmt-heartbeat', { periodInMinutes: HEARTBEAT_MIN });
chrome.alarms.onAlarm.addListener((a) => { if (a.name === 'cmt-heartbeat') { heartbeat(); if (queue.length) flush(); } });

// restore the queue and the state when the worker wakes up; heartbeats and flushes wait for it
const ready = (async () => {
  const s = await get(['queue', 'state']);
  if (Array.isArray(s.queue)) queue = s.queue;
  if (s.state) state = { ...state, ...s.state };
  if (state.activeJob) activeJob = state.activeJob;           // a read was running when the worker went to sleep
  if (queue.length) scheduleFlush();
})();
