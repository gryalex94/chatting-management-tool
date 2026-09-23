// Demo mode, server side. When a request carries `X-Demo-Mode: 1`, the JSON
// response is scrubbed BEFORE it leaves the server, so a screen-shared session —
// including the browser's network tab — only ever holds masked data:
//   • fan usernames / nicknames → stable pseudonyms ("Fan·3F2A9C"), the same
//     everywhere, so a demo still makes sense
//   • message bodies and quotes → hidden
//   • emails → hidden
// Business data (revenue, page and chatter names, priorities) stays visible.
//
// Fan names inside AI-written text can only be recognised if we know them, and a
// page like Home receives titles with no fan fields beside them. So the full list
// of the organisation's fan identities is loaded (and cached) up front.
// Page, chatter and staff names are protected: a fan who shares a name with a
// page never causes the page's name to be masked.
const { supabaseAdmin } = require('./supabase');

const PREFIX = 'Fan·';
const HIDDEN_QUOTE = '‹hidden›';
const HIDDEN_MSG = '‹message hidden›';
const HIDDEN_EMAIL = 'hidden@demo';
const MARKERS = [PREFIX, HIDDEN_QUOTE, HIDDEN_MSG, HIDDEN_EMAIL];

const ID_KEYS = new Set([
  'fan_username', 'sent_to_username', 'sent_to_nickname', 'sent_to_display', 'fan_nickname',
  'fan', 'nickname', 'display_name', 'username', 'before_username', 'resumed_username',
  'worst_fan', 'last_username', 'resumed_with_fan',
]);
const HANDLE_KEYS = new Set(['fan_username', 'sent_to_username', 'username', 'last_username']);
const MSG_KEY_RE = /^(fan|chatter|creator|before|resumed|worst|last)\w*message(_text)?$/;
const TEXT_KEYS = new Set([
  'detail', 'title', 'overall', 'day_review', 'summary', 'evidence', 'priority_reason',
  'dismiss_reason', 'issue', 'reason', 'note', 'notes', 'description', 'error_message',
  'fingerprint', 'cluster_key',
]);
const MSG_CONTEXT = ['sent_at', 'username', 'fan_username', 'matched_who', 'who', 'nickname'];
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN_RE = /[\p{L}\p{N}][\p{L}\p{N}_.\-]*/gu;

// "Mike🔥 " and "mike" are the same person: lower-case, drop emoji/punctuation.
function norm(x) {
  return String(x ?? '').toLowerCase()
    .replace(/[^\p{L}\p{N}_.\-\s]/gu, ' ').replace(/\s+/g, ' ').trim()
    .replace(/^[._-]+|[._-]+$/g, '');
}

// Stable, idempotent pseudonym (FNV-1a over the normalised name).
function pseudonym(raw) {
  const s0 = String(raw ?? '').trim();
  if (!s0 || s0.startsWith(PREFIX)) return s0;
  const s = norm(s0) || s0.toLowerCase();
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return PREFIX + (h >>> 0).toString(36).toUpperCase().padStart(7, '0').slice(-6);
}

// Handles safe to replace in ANY string (not just prose): u-numbers, or long /
// punctuated handles that can't be an ordinary word.
// Ordinary words some fans use as nicknames ("Fan", "Are") must never be masked
// inside prose — they'd turn sentences into nonsense.
const STOPWORDS = new Set("the and are was were for you your his her him she they them their our out not but all any can has had have who what when where why how this that these those with from into onto over under then than too very just also only one two new old big top day time today week month year page pages fan fans sub subs whale whales spender spenders chatter chatters creator creators manager ppv ppvs tip tips spent spend sale sales video videos photo photos content custom customs message messages chat chats reply replies sent bought buy yes okay hey hello hii thanks thank did does done got get give gave said say says asked ask told tell after before again still more most less least some many much every each other same own off here there now later soon never always about above below around between during while because since until again once what's it's that's i'm".split(' '));
const distinctive = (h) => /^u\d{5,}$/.test(h) || h.length >= 6 || /[\d_.-]/.test(h);

function newIds() { return { handles: new Set(), names: new Set(), protect: new Set() }; }
function register(ids, raw, isHandle) {
  if (typeof raw !== 'string' || raw.trim().startsWith(PREFIX)) return;
  const n = norm(raw);
  if (n.length < 3 || /^\d+$/.test(n) || STOPWORDS.has(n) || ids.protect.has(n)) return;   // never mangle amounts or page names
  ids.names.add(n);
  if (isHandle && !n.includes(' ') && distinctive(n)) ids.handles.add(n);
}

// Replace known names by scanning word tokens (fast set lookups, no giant regex).
// Multi-word names ("Bobby Alonso") match up to `maxWords` consecutive words.
// Existing pseudonyms are passed through untouched, so text scrubbed twice (server
// then browser) never becomes "Fan·AAAAAA·BBBBBB".
const PSEUDO_RE = /Fan·[A-Z0-9]{6}/g;
function replaceTokens(s, set, maxWords) {
  if (!set.size) return s;
  if (s.includes('Fan·')) {
    let out = '', last = 0;
    for (const m of s.matchAll(PSEUDO_RE)) {
      out += replaceTokensRaw(s.slice(last, m.index), set, maxWords) + m[0];
      last = m.index + m[0].length;
    }
    return out + replaceTokensRaw(s.slice(last), set, maxWords);
  }
  return replaceTokensRaw(s, set, maxWords);
}
function replaceTokensRaw(s, set, maxWords) {
  const toks = [];
  for (const m of s.matchAll(TOKEN_RE)) {
    const t = m[0].replace(/[._-]+$/, '');
    toks.push({ start: m.index, end: m.index + t.length, low: t.toLowerCase() });
  }
  let out = '', last = 0;
  for (let i = 0; i < toks.length;) {
    let hit = 0;
    for (let n = Math.min(maxWords, toks.length - i); n >= 1 && !hit; n--) {
      let key = toks[i].low, ok = true;
      for (let k = 1; k < n; k++) {
        if (!/^\s+$/.test(s.slice(toks[i + k - 1].end, toks[i + k].start))) { ok = false; break; }
        key += ' ' + toks[i + k].low;
      }
      if (ok && set.has(key)) hit = n;
    }
    if (hit) {
      const a = toks[i].start, b = toks[i + hit - 1].end;
      out += s.slice(last, a) + pseudonym(s.slice(a, b));
      last = b; i += hit;
    } else i++;
  }
  return out + s.slice(last);
}

// Any string: u-numbers, emails, distinctive handles.
function scrubIds(s, ids) {
  return replaceTokens(
    s.replace(/\bu\d{5,}\b/g, m => pseudonym(m)).replace(EMAIL_RE, HIDDEN_EMAIL),
    ids.handles, 1);
}

// Prose (AI detail, titles, reviews, notes): quotes — including one cut off by a
// truncated title — plus every known name.
// A quote cut off by a truncated title ("…said "yes I would lo…"): the quote
// marks don't balance, so hide from the last opening mark to the end.
function hideUnclosed(s, open, close) {
  const opens = s.split(open).length - 1;
  const closes = open === close ? 0 : s.split(close).length - 1;
  const unbalanced = open === close ? opens % 2 === 1 : opens > closes;
  if (!unbalanced) return s;
  const i = s.lastIndexOf(open);
  return s.slice(i + 1).length >= 3 ? s.slice(0, i + 1) + HIDDEN_QUOTE : s;
}

function scrubText(s, ids) {
  let out = s
    .replace(/"([^"]{3,})"/g, `"${HIDDEN_QUOTE}"`)
    .replace(/“([^”]{3,})”/g, `“${HIDDEN_QUOTE}”`)
    .replace(/‘([^’]{3,})’/g, `‘${HIDDEN_QUOTE}’`)
    .replace(/(^|[\s([:])'(.{3,}?)'(?=[\s.,;:)!?\]—–-]|$)/g, `$1'${HIDDEN_QUOTE}'`)
    .replace(/(^|[\s([:])'[^']{3,}$/, `$1'${HIDDEN_QUOTE}`);
  out = hideUnclosed(out, '"', '"');
  out = hideUnclosed(out, '“', '”');
  out = hideUnclosed(out, '‘', '’');
  out = out
    .replace(/(^|\s)@([\w.-]{3,})/g, (_, pre, h) => `${pre}@${pseudonym(h)}`);
  return replaceTokens(scrubIds(out, ids), ids.names, 3);
}

function transform(node, ids) {
  if (Array.isArray(node)) return node.map(n => transform(n, ids));
  if (!node || typeof node !== 'object') {
    return typeof node === 'string' && !UUID_RE.test(node) ? scrubIds(node, ids) : node;
  }
  const hasMsgContext = MSG_CONTEXT.some(k => k in node);
  const out = {};
  for (const [k, v] of Object.entries(node)) {
    if (v == null || k === 'id' || k.endsWith('_id')) { out[k] = v; continue; }   // ids aren't PII — never touch them
    if (ID_KEYS.has(k) && typeof v === 'string') out[k] = pseudonym(v);
    else if (k === 'usernames' && Array.isArray(v)) out[k] = v.map(x => (typeof x === 'string' ? pseudonym(x) : x));
    else if (MSG_KEY_RE.test(k) && typeof v === 'string') out[k] = v.trim() ? HIDDEN_MSG : v;
    else if (k === 'message' && typeof v === 'string' && hasMsgContext) out[k] = HIDDEN_MSG;
    else if (k === 'email' && typeof v === 'string') out[k] = v ? HIDDEN_EMAIL : v;
    else if (TEXT_KEYS.has(k) && typeof v === 'string') out[k] = scrubText(v, ids);
    else out[k] = transform(v, ids);
  }
  return out;
}

/** Mask a response body. `base` is the org's cached identity set. */
function scrub(body, base) {
  if (body == null || typeof body !== 'object') return body;
  // per-response copy so names seen in this body are masked too
  const ids = { handles: new Set(base.handles), names: new Set(base.names), protect: base.protect };
  (function walk(n) {
    if (Array.isArray(n)) return n.forEach(walk);
    if (!n || typeof n !== 'object') return;
    for (const [k, v] of Object.entries(n)) {
      if (ID_KEYS.has(k)) register(ids, v, HANDLE_KEYS.has(k));
      else if (k === 'usernames' && Array.isArray(v)) v.forEach(x => register(ids, x, true));
      else if (v && typeof v === 'object') walk(v);
    }
  })(body);
  return transform(body, ids);
}

function containsMasked(body) {
  if (body == null) return false;
  let s;
  try { s = typeof body === 'string' ? body : JSON.stringify(body); } catch { return false; }
  return MARKERS.some(m => s.includes(m));
}

// ---- the organisation's fan identities (cached) ----
const TTL_MS = 10 * 60 * 1000;
const cache = new Map();
async function pageAll(build) {
  let rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build().range(from, from + 999);
    if (error) throw error;
    if (!data?.length) break;
    rows = rows.concat(data);
    if (data.length < 1000) break;
  }
  return rows;
}
async function loadIdentities(orgId) {
  const hit = cache.get(orgId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.ids;
  const ids = newIds();
  // protect page, chatter and staff names FIRST, so no fan can mask them
  const [crs, chs, us] = await Promise.all([
    supabaseAdmin.from('creators').select('name').eq('organisation_id', orgId),
    supabaseAdmin.from('chatters').select('name').eq('organisation_id', orgId),
    supabaseAdmin.from('users').select('name').eq('organisation_id', orgId),
  ]);
  [...(crs.data || []), ...(chs.data || []), ...(us.data || [])].forEach(r => {
    const n = norm(r.name); if (n) { ids.protect.add(n); n.split(' ').forEach(w => w.length >= 3 && ids.protect.add(w)); }
  });
  const subs = await pageAll(() => supabaseAdmin.from('subscribers')
    .select('username, display_name').eq('organisation_id', orgId).order('username'));
  subs.forEach(s => { register(ids, s.username, true); register(ids, s.display_name, false); });
  const tasks = await pageAll(() => supabaseAdmin.from('review_tasks')
    .select('fan_username, context').eq('organisation_id', orgId).order('id'));
  const walk = (n) => {
    if (Array.isArray(n)) return n.forEach(walk);
    if (!n || typeof n !== 'object') return;
    for (const [k, v] of Object.entries(n)) {
      if (ID_KEYS.has(k)) register(ids, v, HANDLE_KEYS.has(k));
      else if (k === 'usernames' && Array.isArray(v)) v.forEach(x => register(ids, x, true));
      else if (v && typeof v === 'object') walk(v);
    }
  };
  tasks.forEach(t => { register(ids, t.fan_username, true); walk(t.context); });
  cache.set(orgId, { at: Date.now(), ids });
  return ids;
}

/**
 * Express middleware (mount after authMiddleware). With `X-Demo-Mode: 1`:
 * refuses writes that carry masked values, and scrubs every JSON response.
 */
async function demoMask(req, res, next) {
  if (req.get('X-Demo-Mode') !== '1') return next();
  try {
    if (req.method !== 'GET' && containsMasked(req.body)) {
      return res.status(409).json({ error: 'Demo mode is on — turn it off to save changes to fan data.' });
    }
    const ids = await loadIdentities(req.user.organisationId);
    const json = res.json.bind(res);
    res.json = (body) => json(scrub(body, ids));
    next();
  } catch (e) { next(e); }
}

module.exports = { demoMask, scrub, loadIdentities, pseudonym, containsMasked, norm };
