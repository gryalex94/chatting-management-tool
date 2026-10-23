const router = require('express').Router();
const { createClient } = require('@supabase/supabase-js');
const { supabaseAdmin } = require('../utils/supabase');
const { authMiddleware, requireMinRole, profileMissing } = require('../middleware/auth');
const { demoMask } = require('../utils/privacy');
const F = require('../utils/fanslyIngest');

/**
 * Fansly (phase 1): the browser extension's door into the tool, and the Fansly
 * dashboard. The extension logs a chatter in (POST /login), posts what the Fansly
 * page loads (POST /ingest) and says who is watching which account (POST /presence).
 * Managers read the summary (GET /). Nothing here ever talks to Fansly.
 */
const NOT_READY = 'Run database change 051 (Fansly) in Supabase first';
// Only a table that really is not there: "relation … does not exist" / "Could not find the table … in the schema cache".
const missingTable = (e) => /(relation "(public\.)?fansly_\w+" does not exist|Could not find the table '?(public\.)?fansly_\w+)/.test(String(e?.message || ''));
const fail = (res, e, what) => {
  console.error(`[fansly] ${what}:`, e.message);
  if (missingTable(e)) return res.status(409).json({ error: NOT_READY });
  return res.status(500).json({ error: `Could not ${what}` });
};
const MAX_EVENTS = 200;
const freshAuthClient = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });

async function profileOf(authUser) {
  const { data: user, error } = await supabaseAdmin.from('users').select('id, email, name, role, organisation_id, is_active').eq('auth_id', authUser.id).single();
  if (!user && !profileMissing(error)) throw error;
  return user || null;
}
const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name, role: u.role, organisationId: u.organisation_id });

// ---------- public: the extension signs in with the chatter's own account ----------

// POST /api/fansly/login { email, password } → { token, refreshToken, expiresAt, user }
router.post('/login', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (!email || !password) return res.status(400).json({ error: 'Email and password are needed' });
  try {
    const { data, error } = await freshAuthClient().auth.signInWithPassword({ email, password });
    if (error || !data?.session) return res.status(401).json({ error: 'Wrong email or password' });
    const user = await profileOf(data.user);
    if (!user) return res.status(404).json({ error: 'No account in the tool for this email yet' });
    if (user.is_active === false) return res.status(403).json({ error: 'This account has been deactivated.' });
    res.json({ token: data.session.access_token, refreshToken: data.session.refresh_token, expiresAt: (data.session.expires_at || 0) * 1000, user: publicUser(user) });
  } catch (e) { fail(res, e, 'sign in'); }
});

// POST /api/fansly/refresh { refreshToken } → the same shape as /login
router.post('/refresh', async (req, res) => {
  const refreshToken = String(req.body?.refreshToken || '');
  if (!refreshToken) return res.status(400).json({ error: 'No refresh token' });
  try {
    const { data, error } = await freshAuthClient().auth.refreshSession({ refresh_token: refreshToken });
    if (error || !data?.session) return res.status(401).json({ error: 'Please sign in again' });
    const user = await profileOf(data.user);
    if (!user || user.is_active === false) return res.status(403).json({ error: 'Please sign in again' });
    res.json({ token: data.session.access_token, refreshToken: data.session.refresh_token, expiresAt: (data.session.expires_at || 0) * 1000, user: publicUser(user) });
  } catch (e) { fail(res, e, 'refresh the sign-in'); }
});

// ---------- signed in: the extension ----------
router.use(authMiddleware);

/** The account the batch is about: the id the extension knows, else what the events reveal. */
async function accountFor(req, events) {
  const given = req.body?.account && req.body.account.id ? String(req.body.account.id) : null;
  const fanslyId = given || F.inferAccountId(events || []);
  if (!fanslyId) return null;
  return F.ensureAccount(req.user.organisationId, fanslyId, { username: req.body?.account?.username, displayName: req.body?.account?.displayName });
}

// GET /api/fansly/me → who is signed in, their chatter row, the accounts this organisation records
router.get('/me', async (req, res) => {
  try {
    const chatterId = await F.chatterFor(req.user);
    const { data: accounts, error } = await supabaseAdmin.from('fansly_accounts').select('id, fansly_account_id, username, display_name, status, last_seen_at, creators(name)')
      .eq('organisation_id', req.user.organisationId).order('first_seen_at');
    if (error && !missingTable(error)) throw error;
    res.json({ user: req.user, chatterId, tables_ready: !error, accounts: (accounts || []).map(a => ({ ...a, page: a.creators?.name || null, creators: undefined })) });
  } catch (e) { fail(res, e, 'load your details'); }
});

// POST /api/fansly/ingest { deviceId, extensionVersion, account: {id, username}, events: [{id, at, kind, data}] }
router.post('/ingest', async (req, res) => {
  const deviceId = String(req.body?.deviceId || '').slice(0, 80);
  const events = Array.isArray(req.body?.events) ? req.body.events.slice(0, MAX_EVENTS) : [];
  if (!deviceId) return res.status(400).json({ error: 'The extension did not say which browser it is' });
  if (!events.length) return res.json({ ok: true, counts: {}, accepted: [] });
  try {
    const account = await accountFor(req, events);
    if (!account) return res.json({ ok: false, needAccount: true, error: 'Could not tell which Fansly account this is yet. Open the Messages page.', accepted: [] });
    if (account.status === 'paused') return res.json({ ok: false, error: 'Recording is paused for this account', accepted: events.map(e => e.id) });
    const chatterId = await F.chatterFor(req.user);
    const shifts = await F.shiftsFor(req.user.organisationId);
    const ctx = { account, creatorId: account.fansly_account_id, user: req.user, chatterId, deviceId, shifts };
    const { counts, errors } = await F.applyEvents(ctx, events);
    F.heartbeat({ user: req.user, chatterId, deviceId, account, extensionVersion: req.body?.extensionVersion }).catch(() => {});
    supabaseAdmin.from('fansly_ingest_log').insert({ organisation_id: req.user.organisationId, account_id: account.id, user_id: req.user.id, device_id: deviceId,
      events: events.length, counts, errors: errors.length ? errors.join(' | ').slice(0, 2000) : null }).then(() => {});
    res.json({ ok: true, account: { id: account.id, fanslyId: account.fansly_account_id, username: account.username }, counts, errors, accepted: events.map(e => e.id) });
  } catch (e) {
    // the failure goes to the log too, so it can be read from the dashboard without the server logs
    supabaseAdmin.from('fansly_ingest_log').insert({ organisation_id: req.user.organisationId, user_id: req.user.id, device_id: deviceId, events: events.length,
      counts: { kinds: events.map(ev => ev.kind) }, errors: String(e.message).slice(0, 2000) }).then(() => {});
    if (missingTable(e)) return res.status(409).json({ error: NOT_READY });
    console.error('[fansly] ingest:', e.message);
    res.status(500).json({ error: `Could not save: ${String(e.message).slice(0, 300)}` });
  }
});

// POST /api/fansly/presence { deviceId, account: {id, username}, extensionVersion, action: 'heartbeat' | 'logout' }
router.post('/presence', async (req, res) => {
  const deviceId = String(req.body?.deviceId || '').slice(0, 80);
  if (!deviceId) return res.status(400).json({ error: 'The extension did not say which browser it is' });
  try {
    if (req.body?.action === 'logout') { await F.endPresence({ user: req.user, deviceId }); return res.json({ ok: true }); }
    const chatterId = await F.chatterFor(req.user);
    const account = await accountFor(req, []);
    const id = await F.heartbeat({ user: req.user, chatterId, deviceId, account, extensionVersion: req.body?.extensionVersion });
    res.json({ ok: true, presenceId: id, account: account ? { id: account.id, username: account.username, status: account.status } : null });
  } catch (e) { fail(res, e, 'record who is online'); }
});

// ---------- managers: the dashboard ----------
router.use(requireMinRole('manager'), demoMask);

const dayStart = (tz = 'Europe/Amsterdam') => {
  // midnight today in the organisation's usual timezone, as an ISO instant
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);   // YYYY-MM-DD
  const local = new Date(`${parts}T00:00:00`);
  const offset = new Date(now.toLocaleString('en-US', { timeZone: tz })).getTime() - now.getTime();
  return new Date(local.getTime() - offset).toISOString();
};

// GET /api/fansly → the accounts, who is online on each, today's numbers
router.get('/', async (req, res) => {
  const orgId = req.user.organisationId;
  try {
    await F.sweepPresence(orgId).catch(() => {});
    const { data: accounts, error } = await supabaseAdmin.from('fansly_accounts').select('id, fansly_account_id, username, display_name, followers_count, subscribers_count, status, first_seen_at, last_seen_at, creator_id, creators(name)')
      .eq('organisation_id', orgId).order('first_seen_at');
    if (error) throw error;
    const since = dayStart();
    const { data: presence } = await supabaseAdmin.from('fansly_presence').select('id, account_id, user_id, chatter_id, device_id, started_at, last_seen_at, users(name), chatters(name)')
      .eq('organisation_id', orgId).is('ended_at', null).order('started_at');
    const onlineBy = new Map();
    for (const p of presence || []) {
      const list = onlineBy.get(p.account_id) || [];
      list.push({ name: p.users?.name || p.chatters?.name || 'Someone', chatter: p.chatters?.name || null, since: p.started_at, device: p.device_id.slice(0, 8) });
      onlineBy.set(p.account_id, list);
    }
    const out = [];
    for (const a of accounts || []) {
      const { data: msgs } = await supabaseAdmin.from('fansly_messages').select('fan_account_id, from_fan, price, attribution, chatter_id, chatters(name)')
        .eq('account_id', a.id).gte('sent_at', since).limit(5000);
      const rows = msgs || [];
      const byChatter = new Map();
      for (const m of rows.filter(r => !r.from_fan)) {
        const k = m.chatters?.name || (m.attribution === 'unattributed' ? 'Not attributed' : 'History');
        const c = byChatter.get(k) || { name: k, sent: 0, ppv: 0, fans: new Set() };
        c.sent += 1; if (m.price != null) c.ppv += 1; if (m.fan_account_id) c.fans.add(m.fan_account_id);
        byChatter.set(k, c);
      }
      const { data: tx } = await supabaseAdmin.from('fansly_transactions').select('category, net').eq('account_id', a.id).gte('created_at_fansly', since).limit(2000);
      const net = {}; for (const t of tx || []) net[t.category || 'other'] = Math.round(((net[t.category || 'other'] || 0) + Number(t.net || 0)) * 100) / 100;
      const { count: fansTotal } = await supabaseAdmin.from('fansly_fans').select('*', { count: 'exact', head: true }).eq('account_id', a.id);
      const { count: msgTotal } = await supabaseAdmin.from('fansly_messages').select('*', { count: 'exact', head: true }).eq('account_id', a.id);
      out.push({
        id: a.id, fansly_account_id: a.fansly_account_id, username: a.username, display_name: a.display_name, page: a.creators?.name || null, creator_id: a.creator_id,
        followers_count: a.followers_count, subscribers_count: a.subscribers_count, status: a.status, first_seen_at: a.first_seen_at, last_seen_at: a.last_seen_at,
        online: onlineBy.get(a.id) || [], totals: { fans: fansTotal || 0, messages: msgTotal || 0 },
        today: {
          sent: rows.filter(r => !r.from_fan).length, received: rows.filter(r => r.from_fan).length,
          fans: new Set(rows.map(r => r.fan_account_id).filter(Boolean)).size,
          ppv_sent: rows.filter(r => !r.from_fan && r.price != null).length,
          unattributed: rows.filter(r => r.attribution === 'unattributed').length,
          net, by_chatter: [...byChatter.values()].map(c => ({ ...c, fans: c.fans.size })).sort((x, y) => y.sent - x.sent),
        },
      });
    }
    const { data: log } = await supabaseAdmin.from('fansly_ingest_log').select('received_at, device_id, events, counts, errors, users(name)').eq('organisation_id', orgId).order('received_at', { ascending: false }).limit(10);
    res.json({ tables_ready: true, accounts: out, recent: (log || []).map(l => ({ ...l, user: l.users?.name || null, users: undefined })), online_window_sec: F.ONLINE_MS / 1000 });
  } catch (e) { fail(res, e, 'load the Fansly pages'); }
});

// POST /api/fansly/accounts/:id { status: 'active' | 'paused' } — stop or resume recording an account
router.post('/accounts/:id', requireMinRole('admin'), async (req, res) => {
  const status = req.body?.status === 'paused' ? 'paused' : 'active';
  try {
    const { data, error } = await supabaseAdmin.from('fansly_accounts').update({ status }).eq('id', req.params.id).eq('organisation_id', req.user.organisationId).select('fansly_account_id').single();
    if (error) throw error;
    F.forgetAccount(req.user.organisationId, data.fansly_account_id);
    res.json({ ok: true, status });
  } catch (e) { fail(res, e, 'change the account'); }
});

module.exports = router;
