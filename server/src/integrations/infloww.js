/**
 * Read-only client for the Infloww API (https://openapi.infloww.com, spec v1.4).
 *
 * Credentials come only from the server's environment — INFLOWW_API_KEY and
 * INFLOWW_OID ("Agency OID") — never from the database or the browser.
 * Without the x-oid header Infloww's firewall answers every request with a
 * Cloudflare "you have been blocked" page, which looks like an IP ban but isn't.
 *
 * Limits: 1,000 requests/minute per agency, up to 100 rows per page, date
 * windows of at most 31 days, nothing older than ~1 year.
 */
const BASE = 'https://openapi.infloww.com';

const configured = () => !!(process.env.INFLOWW_API_KEY && process.env.INFLOWW_OID);

class InflowwError extends Error {
  constructor(message, { status, requestId } = {}) {
    super(message);
    this.status = status;
    this.requestId = requestId;
  }
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Array params (creatorIds, employeeIds) go as a comma-separated list.
function query(params) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) {
    if (v == null || v === '') continue;
    q.set(k, Array.isArray(v) ? v.join(',') : String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}

/** One GET. Retries 429 / 5xx a few times with backoff; returns the JSON body. */
async function get(path, params = {}) {
  if (!configured()) throw new InflowwError('Infloww API is not configured (INFLOWW_API_KEY / INFLOWW_OID)');
  const url = `${BASE}${path}${query(params)}`;
  for (let attempt = 1; ; attempt++) {
    let res;
    try {
      res = await fetch(url, {
        headers: { Authorization: process.env.INFLOWW_API_KEY, 'x-oid': process.env.INFLOWW_OID, Accept: 'application/json' },
        signal: AbortSignal.timeout(30_000),
      });
    } catch (e) {
      if (attempt < 4) { await sleep(1000 * attempt); continue; }
      throw new InflowwError(`Infloww unreachable: ${e.message}`);
    }
    const requestId = res.headers.get('x-request-id');
    const text = await res.text();
    let body = null;
    try { body = JSON.parse(text); } catch { /* HTML error page */ }

    if ((res.status === 429 || res.status >= 500) && attempt < 4) {
      const wait = Number(res.headers.get('retry-after')) * 1000 || 2000 * attempt;
      await sleep(wait);
      continue;
    }
    if (!res.ok || !body) {
      if (!body && /cloudflare/i.test(text)) {
        throw new InflowwError('Blocked by Infloww\'s firewall — check INFLOWW_OID, and the API key\'s IP settings (this server\'s address must be allowed)', { status: res.status });
      }
      throw new InflowwError(`Infloww ${res.status}: ${body?.errorMessage || text.slice(0, 160)}`, { status: res.status, requestId });
    }
    return body;
  }
}

/** Every row of a cursor-paged list endpoint. */
async function getAll(path, params = {}, { maxPages = 500 } = {}) {
  const rows = [];
  let cursor = null;
  for (let page = 0; page < maxPages; page++) {
    const body = await get(path, { limit: 100, ...params, ...(cursor ? { cursor } : {}) });
    rows.push(...(body.data?.list || []));
    if (!body.hasMore || !body.cursor || body.cursor === cursor) break;
    cursor = body.cursor;
  }
  return rows;
}

// Infloww times come as unix milliseconds (sometimes as ISO strings).
function toDate(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  const d = Number.isFinite(n) && String(v).length >= 12 ? new Date(n) : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}
// Money comes in the smallest unit (cents).
const toDollars = (v) => (v == null || v === '' ? null : Math.round(Number(v)) / 100);

// [start, end) windows of at most 31 days, as the API requires.
function windows(from, to, days = 30) {
  const out = [];
  for (let s = from.getTime(); s < to.getTime(); s += days * 86400000) {
    out.push([new Date(s), new Date(Math.min(s + days * 86400000, to.getTime()))]);
  }
  return out;
}

module.exports = { configured, get, getAll, toDate, toDollars, windows, InflowwError };
