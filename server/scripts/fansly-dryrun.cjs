#!/usr/bin/env node
/**
 * Runs the whole Fansly ingest (applyEvents) against a pretend database: every
 * read answers "nothing yet", every write is captured. Prints, per table, the
 * columns the rows carry, so they can be checked against the real tables.
 *
 *   node server/scripts/fansly-dryrun.cjs fansly-capture/fansly2.har
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'x';
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'x';

// ---- the pretend database ----
const writes = {};
const fakeDb = {
  from(table) {
    const q = { _op: 'select', _rows: null };
    const chain = new Proxy(q, {
      get(t, k) {
        if (k === 'then') return (res, rej) => Promise.resolve(finish()).then(res, rej);
        if (k === 'upsert' || k === 'insert') return (rows) => { t._op = k; t._rows = Array.isArray(rows) ? rows : [rows]; return chain; };
        if (k === 'update') return (patch) => { t._op = 'update'; t._rows = [patch]; return chain; };
        if (k === 'select') return (cols, opts) => { if (opts && opts.head) t._op = 'count'; return chain; };
        if (k === 'single' || k === 'maybeSingle') return () => chain;
        return () => chain;                                 // eq, in, is, order, limit, gte, lt, not…
      },
    });
    function finish() {
      if (q._op === 'upsert' || q._op === 'insert' || q._op === 'update') {
        (writes[table] = writes[table] || []).push(...q._rows.map(r => ({ op: q._op, row: r })));
        return { data: q._op === 'insert' ? { id: 'fake-id', ...q._rows[0] } : null, error: null };
      }
      if (q._op === 'count') return { count: 0, error: null };
      return { data: null, error: null };
    }
    return chain;
  },
};
const realResolve = Module._resolveFilename;
const supPath = path.resolve(__dirname, '../src/utils/supabase.js');
require.cache[supPath] = { id: supPath, filename: supPath, loaded: true, exports: { supabaseAdmin: fakeDb, supabasePublic: fakeDb } };

// ---- events from the capture, through the extension's page script (same as fansly-replay) ----
const vm = require('vm');
const harPath = process.argv[2]; if (!harPath) { console.error('usage: node fansly-dryrun.cjs <file.har>'); process.exit(1); }
const har = JSON.parse(fs.readFileSync(harPath, 'utf8'));
const posted = [];
function FakeXHR() { this.listeners = {}; this.responseType = ''; }
FakeXHR.prototype.open = function () {}; FakeXHR.prototype.send = function () {};
FakeXHR.prototype.addEventListener = function (ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); };
function FakeWS() { this.listeners = {}; } FakeWS.prototype.addEventListener = function (ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); };
const ctx = { window: { postMessage: (m) => posted.push(m), fetch: () => Promise.resolve({ clone: () => ({ text: () => Promise.resolve('') }) }) }, XMLHttpRequest: FakeXHR, WebSocket: FakeWS, URL, JSON, Date, console, String, Array, Object, Promise };
ctx.window.XMLHttpRequest = FakeXHR; ctx.window.WebSocket = FakeWS;
vm.createContext(ctx); vm.runInContext(fs.readFileSync(path.join(__dirname, '../../extension/page.js'), 'utf8'), ctx);
const body = (e) => { const c = e.response.content; if (!c.text) return null; return c.encoding === 'base64' ? Buffer.from(c.text, 'base64').toString('utf8') : c.text; };
for (const e of har.log.entries) {
  const url = e.request.url;
  if (/^wss?:/.test(url)) { const ws = new ctx.window.WebSocket(url); for (const f of e._webSocketMessages || []) if (f.type === 'receive') for (const fn of ws.listeners.message || []) fn({ data: f.data }); continue; }
  if (!/apiv3\.fansly\.com/.test(url) || e.request.method === 'OPTIONS') continue;
  const text = body(e); if (!text) continue;
  const x = new ctx.window.XMLHttpRequest(); x.open(e.request.method, url); x.send(); x.responseText = text;
  for (const fn of x.listeners.load || []) fn();
}
const events = posted.map((p, i) => ({ id: 'e' + i, at: p.at, kind: p.kind, data: p.data }));

// ---- run the ingest ----
(async () => {
  const F = require('../src/utils/fanslyIngest');
  const creatorId = F.inferAccountId(events);
  const ctxIngest = { account: { id: 'acc-1', creator_id: null, fansly_account_id: creatorId }, creatorId, user: { id: 'u1', organisationId: 'o1', name: 'Test Chatter', email: 't@example.com' }, chatterId: 'c1', deviceId: 'dev1', shifts: [] };
  const out = await F.applyEvents(ctxIngest, events);
  console.log('counts:', out.counts);
  console.log('errors:', out.errors);
  for (const [table, ws] of Object.entries(writes)) {
    const cols = new Set(); for (const w of ws) for (const k of Object.keys(w.row)) cols.add(k);
    console.log(`${table}: ${ws.length} rows · columns: ${[...cols].sort().join(',')}`);
  }
  await F.heartbeat({ user: ctxIngest.user, chatterId: 'c1', deviceId: 'dev1', account: ctxIngest.account, extensionVersion: '0.1.0' });
  const pr = writes.fansly_presence || [];
  console.log(`fansly_presence: ${pr.length} rows · columns: ${[...new Set(pr.flatMap(w => Object.keys(w.row)))].sort().join(',')}`);
})().catch(e => { console.error('FAILED:', e); process.exit(1); });
