#!/usr/bin/env node
/**
 * Dry run of the Fansly pipeline against a saved capture, without the database:
 *   1. loads the extension's page script in a pretend browser,
 *   2. replays every request of a HAR file through it (as the page would see them),
 *   3. collects the events the extension would send,
 *   4. turns them into rows with the server's parser and prints what came out.
 *
 *   node server/scripts/fansly-replay.cjs fansly-capture/fansly2.har
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const harPath = process.argv[2];
if (!harPath) { console.error('usage: node fansly-replay.cjs <file.har>'); process.exit(1); }
const har = JSON.parse(fs.readFileSync(harPath, 'utf8'));

// ---- 1. a pretend browser for page.js ----
const posted = [];
const fakeWindow = {
  postMessage: (msg) => posted.push(msg),
  fetch: () => Promise.resolve({ clone: () => ({ text: () => Promise.resolve('') }) }),
  addEventListener() {},
};
function FakeXHR() { this.listeners = {}; this.responseType = ''; }
FakeXHR.prototype.open = function () {};
FakeXHR.prototype.send = function () {};
FakeXHR.prototype.addEventListener = function (ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); };
function FakeWS() { this.listeners = {}; }
FakeWS.prototype.addEventListener = function (ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); };
FakeWS.CONNECTING = 0; FakeWS.OPEN = 1; FakeWS.CLOSING = 2; FakeWS.CLOSED = 3;
const ctx = { window: fakeWindow, XMLHttpRequest: FakeXHR, WebSocket: FakeWS, URL, JSON, Date, console, String, Array, Object, Promise };
ctx.window.XMLHttpRequest = FakeXHR; ctx.window.WebSocket = FakeWS;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../../extension/page.js'), 'utf8'), ctx);

// ---- 2. replay the HAR through the wrapped XHR and socket ----
const body = (e) => { const c = e.response.content; if (!c.text) return null; return c.encoding === 'base64' ? Buffer.from(c.text, 'base64').toString('utf8') : c.text; };
let replayed = 0, frames = 0;
for (const e of har.log.entries) {
  const url = e.request.url;
  if (/^wss?:/.test(url)) {
    const ws = new ctx.window.WebSocket(url);                // the wrapped one, as the page would use
    for (const f of e._webSocketMessages || []) if (f.type === 'receive') { frames++; for (const fn of ws.listeners.message || []) fn({ data: f.data }); }
    continue;
  }
  if (!/apiv3\.fansly\.com/.test(url) || e.request.method === 'OPTIONS') continue;
  const text = body(e); if (!text) continue;
  const x = new ctx.XMLHttpRequest(); x.open(e.request.method, url); x.send();
  x.responseText = text; replayed++;
  for (const fn of x.listeners.load || []) fn();
}
const kinds = {}; for (const p of posted) kinds[p.kind] = (kinds[p.kind] || 0) + 1;
console.log(`replayed ${replayed} API answers and ${frames} socket frames → ${posted.length} events:`, kinds);
console.log('payload size:', Math.round(JSON.stringify(posted).length / 1024), 'KB (the page answers were', Math.round(har.log.entries.filter(e => /apiv3/.test(e.request.url)).reduce((n, e) => n + (e.response.content.size || 0), 0) / 1024), 'KB)');

// ---- 3. the server's parser, without a database ----
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'x';
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'x';
const F = require('../src/utils/fanslyIngest');
const events = posted.map((p, i) => ({ id: 'e' + i, at: p.at, kind: p.kind, data: p.data }));
const creatorId = F.inferAccountId(events);
console.log('creator account id:', creatorId);
const fake = { account: { id: '00000000-0000-0000-0000-000000000000', creator_id: null, fansly_account_id: creatorId }, creatorId, user: { id: 'u1', organisationId: 'o1', name: 'Test Chatter', email: 't@example.com' }, chatterId: 'c1', deviceId: 'dev1',
  shifts: [{ id: 's-eu', creator_id: null, start_time: '18:00:00', end_time: '02:00:00', timezone: 'Europe/Amsterdam' }, { id: 's-mid', creator_id: null, start_time: '10:00:00', end_time: '18:00:00', timezone: 'Europe/Amsterdam' }, { id: 's-us', creator_id: null, start_time: '02:00:00', end_time: '10:00:00', timezone: 'Europe/Amsterdam' }] };
const prices = new Map();
const rows = []; const items = [];
for (const e of events) {
  const d = e.data;
  if (e.kind === 'messages') {
    for (const am of d.accountMedia || []) { const p = F.itemPrice(am); if (p != null) prices.set(String(am.id), p); items.push(am); }
    for (const b of d.accountMediaBundles || []) { const p = F.itemPrice(b); if (p != null) prices.set(String(b.id), p); items.push(b); }
    for (const m of d.messages) rows.push(F.messageRow(fake, m, { source: d.before ? 'history' : 'page', attribution: 'history', prices }));
  }
  if (e.kind === 'media_created') for (const am of d) { const p = F.itemPrice(am); if (p != null) prices.set(String(am.id), p); }
  if (e.kind === 'sent') rows.push(F.messageRow(fake, d, { source: 'sent', attribution: 'logged_in', prices }));
  if (e.kind === 'ws_message') rows.push(F.messageRow(fake, d, { source: 'live', attribution: 'unattributed', prices }));
}
const byId = new Map(rows.map(r => [r.message_id, r]));
const all = [...byId.values()];
const count = (f) => all.filter(f).length;
console.log(`messages: ${all.length} unique · from fans ${count(r => r.from_fan)} · from the creator ${count(r => !r.from_fan)} · with a PPV price ${count(r => r.price != null)} · tips ${count(r => r.tip_amount != null)} · mass (type 2) ${count(r => r.type === 2)}`);
console.log('attribution:', all.reduce((o, r) => ((o[r.attribution] = (o[r.attribution] || 0) + 1), o), {}));
console.log('shifts of creator messages:', all.filter(r => !r.from_fan).reduce((o, r) => ((o[r.shift_id || 'none'] = (o[r.shift_id || 'none'] || 0) + 1), o), {}));
console.log('fans without an id:', count(r => !r.fan_account_id), '· messages without a time:', count(r => !r.sent_at));
const ppv = all.find(r => r.price != null);
if (ppv) console.log('a PPV row:', { ...ppv, text: `<${(ppv.text || '').length} chars>`, raw: '<kept>' });
const sent = all.find(r => r.source === 'sent');
if (sent) console.log('the sent row:', { ...sent, text: `<${(sent.text || '').length} chars>`, raw: '<kept>' });
const prices$ = [...prices.values()];
console.log('item prices seen ($):', prices$.slice(0, 12).join(', '), prices$.length > 12 ? '…' : '');
