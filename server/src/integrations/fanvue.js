/**
 * Client for Fanvue's API (https://api.fanvue.com, version 2025-06-26).
 *
 * Access is OAuth 2.0 with PKCE: an admin clicks "Connect Fanvue", the creator
 * approves on Fanvue, and we get an access token (short-lived) and a refresh
 * token (single use: every refresh hands out a new one, which must be saved at
 * once). The app's credentials come only from the server's environment —
 * FANVUE_CLIENT_ID and FANVUE_CLIENT_SECRET — never from the database or the
 * browser. Tokens are stored encrypted in fanvue_accounts.
 *
 * Limits: 100 requests a minute (the API policy's figure) and at most 6 at a
 * time, so calls for one account go one by one, spaced out, and any "slow down"
 * from Fanvue (429 + Retry-After) is waited out.
 */
const crypto = require('crypto');
const { supabaseAdmin } = require('../utils/supabase');

const AUTH_URL = 'https://auth.fanvue.com/oauth2/auth';
const TOKEN_URL = 'https://auth.fanvue.com/oauth2/token';
const API = 'https://api.fanvue.com';
const VERSION = '2025-06-26';
// What we ask the creator for: reading only, so this connection can't send a
// message even by mistake. Sending replies later needs write:chat added here and
// the creator approving again. openid/offline* bring the refresh token.
const SCOPES = ['openid', 'offline_access', 'offline', 'read:self', 'read:chat', 'read:media', 'read:fan', 'read:creator', 'read:insights'];
// Fanvue's API policy says 100 requests a minute per key (its API reference says
// 200): stay under the lower one.
const GAP_MS = 650;                       // ≈ 90 requests a minute per account

class FanvueError extends Error {
  constructor(message, { status, code, reconnect = false } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.reconnect = reconnect;
  }
}

const configured = () => !!(process.env.FANVUE_CLIENT_ID && process.env.FANVUE_CLIENT_SECRET);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const b64url = (buf) => Buffer.from(buf).toString('base64url');

// ── OAuth ─────────────────────────────────────────────────────────────────────

const newState = () => b64url(crypto.randomBytes(32));
function pkce() {
  const verifier = b64url(crypto.randomBytes(32));
  return { verifier, challenge: b64url(crypto.createHash('sha256').update(verifier).digest()) };
}

function authorizeUrl({ state, challenge, redirectUri }) {
  const q = new URLSearchParams({
    client_id: process.env.FANVUE_CLIENT_ID, redirect_uri: redirectUri, response_type: 'code',
    scope: SCOPES.join(' '), state, code_challenge: challenge, code_challenge_method: 'S256',
  });
  return `${AUTH_URL}?${q}`;
}

// Fanvue wants the app's credentials as Basic auth, never in the body.
async function tokenRequest(params) {
  if (!configured()) throw new FanvueError('Fanvue is not set up on the server (FANVUE_CLIENT_ID / FANVUE_CLIENT_SECRET)');
  const basic = Buffer.from(`${encodeURIComponent(process.env.FANVUE_CLIENT_ID)}:${encodeURIComponent(process.env.FANVUE_CLIENT_SECRET)}`).toString('base64');
  let res;
  try {
    res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams(params).toString(),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (e) {
    throw new FanvueError(`Fanvue unreachable: ${e.message}`);
  }
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.access_token) {
    // Never log the body: on success it holds tokens. On failure it's an OAuth error code.
    const code = body?.error || `http_${res.status}`;
    throw new FanvueError(code === 'invalid_client'
      ? 'Fanvue rejected the app credentials (check FANVUE_CLIENT_ID / FANVUE_CLIENT_SECRET)'
      : `Fanvue sign-in failed (${code})`, { status: res.status, code });
  }
  return body;
}

const exchangeCode = ({ code, verifier, redirectUri }) =>
  tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, code_verifier: verifier });
const refreshTokens = (refreshToken) => tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken });

// ── Tokens at rest: AES-256-GCM with a key derived from the app secret ────────
// (resetting the secret on Fanvue means connecting the account again anyway).

const key = () => crypto.createHash('sha256').update(`fanvue-tokens|${process.env.FANVUE_CLIENT_SECRET || ''}`).digest();
function seal(obj) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
  return `v1.${b64url(iv)}.${b64url(c.getAuthTag())}.${b64url(data)}`;
}
function unseal(text) {
  const [v, iv, tag, data] = String(text || '').split('.');
  if (v !== 'v1' || !data) throw new FanvueError('Stored Fanvue access is unreadable: connect the account again', { reconnect: true });
  try {
    const d = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
    d.setAuthTag(Buffer.from(tag, 'base64url'));
    return JSON.parse(Buffer.concat([d.update(Buffer.from(data, 'base64url')), d.final()]).toString('utf8'));
  } catch {
    throw new FanvueError('Stored Fanvue access is unreadable: connect the account again', { reconnect: true });
  }
}

/** The columns to save for a fresh token response (keeps the old refresh token if none came back). */
function tokenColumns(tok, previousRefresh = null) {
  return {
    tokens: seal({ access_token: tok.access_token, refresh_token: tok.refresh_token || previousRefresh }),
    token_expires_at: new Date(Date.now() + (Number(tok.expires_in) || 3600) * 1000).toISOString(),
  };
}

async function loadTokens(accountId) {
  const { data, error } = await supabaseAdmin.from('fanvue_accounts').select('tokens, token_expires_at, status').eq('id', accountId).maybeSingle();
  if (error) throw error;
  if (!data?.tokens || data.status === 'disconnected') throw new FanvueError('This Fanvue account is not connected', { reconnect: true });
  return { ...unseal(data.tokens), expiresAt: Date.parse(data.token_expires_at) || 0 };
}

async function markReconnect(accountId, message) {
  await supabaseAdmin.from('fanvue_accounts').update({ status: 'reconnect', sync_error: message }).eq('id', accountId);
}

// One refresh at a time per account: refresh tokens are single use.
const refreshing = new Map();
function refreshAccount(accountId, refreshToken) {
  if (!refreshing.has(accountId)) {
    refreshing.set(accountId, (async () => {
      try {
        const tok = await refreshTokens(refreshToken);
        const { error } = await supabaseAdmin.from('fanvue_accounts').update(tokenColumns(tok, refreshToken)).eq('id', accountId);
        if (error) throw error;
        return tok.access_token;
      } catch (e) {
        if (e.code !== 'invalid_grant') throw e;
        // Another server (local or live) may have just used this refresh token and
        // saved the new one: take that instead of giving up.
        await sleep(2000);
        const now = await loadTokens(accountId).catch(() => null);
        if (now?.refresh_token && now.refresh_token !== refreshToken) return now.access_token;
        const msg = 'Fanvue access ran out: connect the account again';
        await markReconnect(accountId, msg);
        throw new FanvueError(msg, { reconnect: true });
      }
    })().finally(() => refreshing.delete(accountId)));
  }
  return refreshing.get(accountId);
}

/** A working access token for an account, refreshed 5 minutes before it runs out. */
async function accessToken(accountId, { force = false } = {}) {
  const t = await loadTokens(accountId);
  if (!force && t.expiresAt - Date.now() > 5 * 60_000) return t.access_token;
  if (!t.refresh_token) throw new FanvueError('Fanvue gave no refresh token: connect the account again', { reconnect: true });
  return refreshAccount(accountId, t.refresh_token);
}

// ── API calls ─────────────────────────────────────────────────────────────────

function query(params = {}) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v == null || v === '') continue;
    for (const x of [].concat(v)) q.append(k, String(x));        // arrays: repeated params
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}

// Space out calls per account (and per token for the one-off calls at connect time).
const nextSlot = new Map();
async function pace(id) {
  const wait = (nextSlot.get(id) || 0) - Date.now();
  nextSlot.set(id, Math.max(Date.now(), nextSlot.get(id) || 0) + GAP_MS);
  if (wait > 0) await sleep(wait);
}

// The tool only READS Fanvue. Anything that would change something there — send
// a message or a PPV, show "typing…", post, upload — is refused here, before it
// leaves the server, unless FANVUE_ALLOW_SENDING=yes is set on the server (it
// isn't; the connection also asks for reading permissions only).
const sendingAllowed = () => process.env.FANVUE_ALLOW_SENDING === 'yes';

/** One call with a given access token. Retries rate limits and server hiccups. */
async function call(token, path, { method = 'GET', params, body, paceId = token.slice(-12) } = {}) {
  if (method !== 'GET' && !sendingAllowed()) {
    throw new FanvueError(`Blocked: this tool only reads Fanvue (${method} ${path.split('?')[0]} not sent)`, { status: 403 });
  }
  const url = `${API}${path}${query(params)}`;
  for (let attempt = 1; ; attempt++) {
    await pace(paceId);
    let res;
    try {
      res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`, 'X-Fanvue-API-Version': VERSION, Accept: 'application/json',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(30_000),
      });
    } catch (e) {
      if (attempt < 4) { await sleep(1000 * attempt); continue; }
      throw new FanvueError(`Fanvue unreachable: ${e.message}`);
    }
    // Close to the minute's limit: wait for the window to reset (at most a minute).
    const left = Number(res.headers.get('x-ratelimit-remaining'));
    const reset = Number(res.headers.get('x-ratelimit-reset'));
    if (Number.isFinite(left) && left <= 3 && reset) await sleep(Math.min(60_000, Math.max(0, reset * 1000 - Date.now()) + 500));

    if ((res.status === 429 || res.status >= 500) && attempt < 6) {
      const after = Number(res.headers.get('retry-after'));
      await sleep(after > 0 ? after * 1000 : Math.min(30_000, 1000 * 2 ** attempt));
      continue;
    }
    if (res.status === 204) return null;
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
    if (!res.ok) {
      const what = data?.error || data?.message || (Array.isArray(data?.errors) ? data.errors.map(x => x.message || x).join('; ') : '') || text.slice(0, 160);
      throw new FanvueError(res.status === 403 && /scope/i.test(String(what))
        ? `Fanvue didn't grant access to ${path.split('/')[2] || 'this'} (missing permission: tick it on the app and connect again)`
        : `Fanvue ${res.status}: ${what}`, { status: res.status });
    }
    return data;
  }
}

/** One call for a connected account: a fresh token, and one retry after a 401. */
async function request(accountId, path, opts = {}) {
  let token = await accessToken(accountId);
  try {
    return await call(token, path, { ...opts, paceId: accountId });
  } catch (e) {
    if (e.status !== 401) throw e;
    token = await accessToken(accountId, { force: true });
    try {
      return await call(token, path, { ...opts, paceId: accountId });
    } catch (e2) {
      if (e2.status === 401) {
        const msg = 'Fanvue refused the saved access: connect the account again';
        await markReconnect(accountId, msg);
        throw new FanvueError(msg, { status: 401, reconnect: true });
      }
      throw e2;
    }
  }
}

module.exports = {
  configured, SCOPES, newState, pkce, authorizeUrl, exchangeCode, tokenColumns, call, request, FanvueError,
  _test: { seal, unseal, query },
};
