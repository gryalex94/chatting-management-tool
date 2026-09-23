// Demo mode — makes the app safe to screen-share.
//
// Every response from our API passes through scrubResponse() (wired in
// services/api.js), so masking happens in ONE place instead of on every screen:
//   • fan usernames / nicknames  → stable pseudonyms ("Fan·3F2A"), consistent
//                                   across screens so a demo still makes sense
//   • message bodies and quotes  → hidden
//   • email addresses            → hidden
// Business data (revenue, creator and chatter names, priorities) stays visible.
//
// Masked values must never be written back, so containsMasked() lets the request
// interceptor block any save whose body carries a pseudonym or placeholder.

const KEY = 'demoMode';
let demo = false;
try { demo = localStorage.getItem(KEY) === '1'; } catch { /* blocked storage */ }

export const isDemoMode = () => demo;
export function setDemoMode(on) {
  demo = !!on;
  try { localStorage.setItem(KEY, demo ? '1' : '0'); } catch { /* ignore */ }
}

const PREFIX = 'Fan·';
const HIDDEN_QUOTE = '‹hidden›';
const HIDDEN_MSG = '‹message hidden›';
const HIDDEN_EMAIL = 'hidden@demo';
const MARKERS = [PREFIX, HIDDEN_QUOTE, HIDDEN_MSG, HIDDEN_EMAIL];

// Fields that identify a fan.
const ID_KEYS = new Set([
  'fan_username', 'sent_to_username', 'sent_to_nickname', 'sent_to_display', 'fan_nickname',
  'fan', 'nickname', 'display_name', 'username', 'before_username', 'resumed_username',
  'worst_fan', 'last_username',
]);
// Fields holding a fan's or chatter's message text — matched by name so new
// ones (e.g. worst_chatter_message) are covered automatically. `error_message`
// and other status fields deliberately don't match.
const MSG_KEY_RE = /^(fan|chatter|creator|before|resumed|worst|last)\w*message(_text)?$/;
// Free text written by the AI or the manager — may quote messages or name fans.
const TEXT_KEYS = new Set([
  'detail', 'title', 'overall', 'day_review', 'summary', 'evidence', 'priority_reason',
  'dismiss_reason', 'issue', 'reason', 'note', 'notes',
]);
// A bare `message` is a fan message only when it sits next to fan context
// (otherwise it's a status line like "File received").
const MSG_CONTEXT = ['sent_at', 'username', 'fan_username', 'matched_who', 'who', 'nickname'];

// Stable short hash (FNV-1a) → the same fan always gets the same pseudonym.
function pseudonym(raw) {
  const s = String(raw).trim().toLowerCase();
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return PREFIX + (h >>> 0).toString(36).toUpperCase().slice(-4).padStart(4, '0');
}

// Identifiers seen so far this session, so a fan named on one screen is also
// masked inside free text on the next.
// Two kinds: HANDLES (usernames — distinctive, safe to replace in every string,
// including internal keys like fingerprint/cluster_key) and DISPLAY NAMES
// ("Alex", "John") — only replaced inside free text, so a fan who happens to
// share a word with a page or chatter name can't rename that page on screen.
const HANDLE_KEYS = new Set(['fan_username', 'sent_to_username', 'username', 'before_username', 'resumed_username', 'last_username']);
const handles = new Set(), names = new Set();
function register(v, isHandle) {
  if (typeof v !== 'string') return;
  const t = v.trim();
  if (t.length < 3 || t.startsWith(PREFIX)) return;
  (isHandle && t.length >= 4 ? handles : names).add(t);
}
const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function buildRe(set) {
  const parts = [...set].sort((a, b) => b.length - a.length).map(esc);
  return parts.length ? new RegExp(`(?<![\\p{L}\\p{N}_])(${parts.join('|')})(?![\\p{L}\\p{N}_])`, 'giu') : null;
}
const cache = { h: { re: null, n: -1 }, all: { re: null, n: -1 } };
function handlesRe() {
  if (cache.h.n !== handles.size) cache.h = { re: buildRe(handles), n: handles.size };
  return cache.h.re;
}
function allRe() {
  const n = handles.size + names.size;
  if (cache.all.n !== n) cache.all = { re: buildRe(new Set([...handles, ...names])), n };
  return cache.all.re;
}
// Applied to EVERY string: handles, u-numbers and emails only.
function scrubIds(s) {
  let out = s.replace(/\bu\d{5,}\b/g, m => pseudonym(m)).replace(EMAIL_RE, HIDDEN_EMAIL);
  const re = handlesRe();
  if (re) out = out.replace(re, m => pseudonym(m));
  return out;
}

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/g;

function scrubText(s) {
  let out = s
    .replace(/"([^"]{3,})"/g, `"${HIDDEN_QUOTE}"`)
    .replace(/“([^”]{3,})”/g, `“${HIDDEN_QUOTE}”`)
    .replace(/‘([^’]{3,})’/g, `‘${HIDDEN_QUOTE}’`)
    .replace(/(^|[\s([:])'(.{3,}?)'(?=[\s.,;:)!?\]—–-]|$)/g, `$1'${HIDDEN_QUOTE}'`)
    .replace(/(^|\s)@([\w.-]{3,})/g, (_, pre, h) => `${pre}@${pseudonym(h)}`);
  out = scrubIds(out);
  const re = allRe();
  if (re) out = out.replace(re, m => pseudonym(m));
  return out;
}

function collect(node) {
  if (Array.isArray(node)) { node.forEach(collect); return; }
  if (!node || typeof node !== 'object') return;
  for (const [k, v] of Object.entries(node)) {
    if (ID_KEYS.has(k)) register(v, HANDLE_KEYS.has(k));
    else if (k === 'usernames' && Array.isArray(v)) v.forEach(x => register(x, true));
    else if (v && typeof v === 'object') collect(v);
  }
}

function transform(node) {
  if (Array.isArray(node)) return node.map(transform);
  if (!node || typeof node !== 'object') {
    return typeof node === 'string' ? scrubIds(node) : node;
  }
  const hasMsgContext = MSG_CONTEXT.some(k => k in node);
  const out = {};
  for (const [k, v] of Object.entries(node)) {
    if (v == null) { out[k] = v; continue; }
    if (ID_KEYS.has(k) && typeof v === 'string') out[k] = v.trim() ? pseudonym(v) : v;
    else if (k === 'usernames' && Array.isArray(v)) out[k] = v.map(x => (typeof x === 'string' ? pseudonym(x) : x));
    else if (MSG_KEY_RE.test(k) && typeof v === 'string') out[k] = v.trim() ? HIDDEN_MSG : v;
    else if (k === 'message' && typeof v === 'string' && hasMsgContext) out[k] = HIDDEN_MSG;
    else if (k === 'email' && typeof v === 'string') out[k] = v ? HIDDEN_EMAIL : v;
    else if (TEXT_KEYS.has(k) && typeof v === 'string') out[k] = scrubText(v);
    else out[k] = transform(v);
  }
  return out;
}

/** Mask fan identities and message content in an API response body. */
export function scrubResponse(data) {
  if (!demo || data == null || typeof data !== 'object') return data;
  collect(data);
  return transform(data);
}

/** True when an outgoing request body carries a masked value. */
export function containsMasked(body) {
  if (body == null) return false;
  let s;
  try { s = typeof body === 'string' ? body : JSON.stringify(body); } catch { return false; }
  return MARKERS.some(m => s.includes(m));
}
