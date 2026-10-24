const router = require('express').Router();
const { createClient } = require('@supabase/supabase-js');
const { supabaseAdmin } = require('../utils/supabase');
const { authMiddleware, requireMinRole, profileMissing } = require('../middleware/auth');
const { demoMask } = require('../utils/privacy');
const F = require('../utils/fanslyIngest');
const Stats = require('../utils/fanslyStats');

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
  // a page is only ever created for an account Fansly itself named as the signed-in one (or that sent a message here)
  const create = F.provenAccountIds(events).has(fanslyId);
  return F.ensureAccount(req.user.organisationId, fanslyId, { username: req.body?.account?.username, displayName: req.body?.account?.displayName, create });
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
    const { counts, errors, touched } = await F.applyEvents(ctx, events);
    Stats.schedule(account.id, touched);                     // match sales and recount the days touched, shortly after
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
    const assigned = account ? await F.mayWork(req.user, account) : true;
    const jobs = account && assigned ? await jobsFor(req.user.organisationId, account.id).catch(() => []) : [];
    res.json({ ok: true, presenceId: id, assigned, jobs, staff: isStaff(req.user), account: account ? { id: account.id, username: account.username, status: account.status } : null });
  } catch (e) { fail(res, e, 'record who is online'); }
});

// ---------- "Read from Fansly" requests, as the extension sees them ----------
const FETCH_KINDS = ['ledger', 'ledger_all', 'subscribers', 'statistics'];
const isStaff = (u) => ['manager', 'head_manager', 'admin', 'owner'].includes(u?.role);

/** Requests waiting for (or running in) a browser on this Fansly account. */
async function jobsFor(orgId, accountId) {
  if (!accountId) return [];
  const { data } = await supabaseAdmin.from('fansly_fetch_jobs').select('id, kind, status, requested_at, progress, device_id, users:requested_by(name)')
    .eq('organisation_id', orgId).eq('account_id', accountId).in('kind', FETCH_KINDS).in('status', ['pending', 'running']).order('requested_at').limit(5);
  return (data || []).map(j => ({ id: j.id, kind: j.kind, status: j.status, requested_at: j.requested_at, progress: j.progress, device_id: j.device_id, by: j.users?.name || null }));
}

// POST /api/fansly/fetch { account: <fansly id>, kind } — a manager in the browser starts one right away
router.post('/fetch', async (req, res) => {
  try {
    if (!isStaff(req.user)) return res.status(403).json({ error: 'Only owners and managers can read whole lists from Fansly' });
    const kind = String(req.body?.kind || '');
    if (!FETCH_KINDS.includes(kind)) return res.status(400).json({ error: 'Pick what to read' });
    const account = await accountFor(req, []);
    if (!account) return res.status(404).json({ error: 'This Fansly page is not known yet' });
    const deviceId = String(req.body?.deviceId || '').slice(0, 80);
    const { data, error } = await supabaseAdmin.from('fansly_fetch_jobs').insert({ organisation_id: req.user.organisationId, account_id: account.id, kind, status: 'running',
      requested_by: req.user.id, started_by: req.user.id, device_id: deviceId || null, started_at: new Date().toISOString() }).select('id, kind, status').single();
    if (error) throw error;
    res.json({ job: data });
  } catch (e) { fail(res, e, 'start reading from Fansly'); }
});

// POST /api/fansly/fetch/:id { status: 'running' | 'done' | 'failed' | 'cancelled', progress, error } — the browser reports
router.post('/fetch/:id', async (req, res) => {
  try {
    const { data: job } = await supabaseAdmin.from('fansly_fetch_jobs').select('id, status, organisation_id').eq('id', req.params.id).maybeSingle();
    if (!job || job.organisation_id !== req.user.organisationId) return res.status(404).json({ error: 'No such request' });
    const status = ['running', 'done', 'failed', 'cancelled'].includes(req.body?.status) ? req.body.status : 'running';
    const patch = { status, progress: req.body?.progress && typeof req.body.progress === 'object' ? req.body.progress : undefined, error: req.body?.error ? String(req.body.error).slice(0, 500) : null };
    if (status === 'running' && job.status === 'pending') Object.assign(patch, { started_by: req.user.id, started_at: new Date().toISOString(), device_id: String(req.body?.deviceId || '').slice(0, 80) || null });
    if (['done', 'failed', 'cancelled'].includes(status)) patch.finished_at = new Date().toISOString();
    Object.keys(patch).forEach(k => patch[k] === undefined && delete patch[k]);
    const { error } = await supabaseAdmin.from('fansly_fetch_jobs').update(patch).eq('id', job.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) { fail(res, e, 'record the progress'); }
});

// ---------- managers: the dashboard ----------
router.use(requireMinRole('manager'), demoMask);

// POST /api/fansly/accounts/:id/fetch { kind } — ask a browser on this page to read a whole list from Fansly
router.post('/accounts/:id/fetch', async (req, res) => {
  try {
    const kind = String(req.body?.kind || '');
    if (!FETCH_KINDS.includes(kind)) return res.status(400).json({ error: 'Pick what to read' });
    const { data: acc } = await supabaseAdmin.from('fansly_accounts').select('id').eq('id', req.params.id).eq('organisation_id', req.user.organisationId).maybeSingle();
    if (!acc) return res.status(404).json({ error: 'No such Fansly page' });
    const { data: open } = await supabaseAdmin.from('fansly_fetch_jobs').select('id, status').eq('account_id', acc.id).eq('kind', kind).in('status', ['pending', 'running']).limit(1);
    if (open?.length) return res.json({ job: open[0], already: true });
    const { data, error } = await supabaseAdmin.from('fansly_fetch_jobs').insert({ organisation_id: req.user.organisationId, account_id: acc.id, kind, requested_by: req.user.id }).select('id, kind, status').single();
    if (error) throw error;
    res.json({ job: data });
  } catch (e) { fail(res, e, 'ask for the read'); }
});

// POST /api/fansly/fetch/:id/cancel — withdraw a request
router.post('/fetch/:id/cancel', async (req, res) => {
  try {
    const { error } = await supabaseAdmin.from('fansly_fetch_jobs').update({ status: 'cancelled', finished_at: new Date().toISOString() })
      .eq('id', req.params.id).eq('organisation_id', req.user.organisationId).in('status', ['pending', 'running']);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) { fail(res, e, 'cancel the request'); }
});

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
    const { data: accounts, error } = await supabaseAdmin.from('fansly_accounts').select('id, fansly_account_id, username, display_name, followers_count, subscribers_count, status, first_seen_at, last_seen_at, creator_id, ledger_total, creators(name)')
      .eq('organisation_id', orgId).order('first_seen_at');
    if (error) throw error;
    const since = dayStart();
    const { data: presence } = await supabaseAdmin.from('fansly_presence').select('id, account_id, user_id, chatter_id, device_id, started_at, last_seen_at, users(name), chatters(name)')
      .eq('organisation_id', orgId).is('ended_at', null).order('started_at');
    const onlineBy = new Map();
    // who is on the roster for which page: someone in a page they are not rostered on is flagged
    const rostered = new Map();
    const { data: ros } = await supabaseAdmin.from('roster_assignments').select('chatter_id, creator_ids').eq('organisation_id', orgId).eq('is_active', true);
    for (const r of ros || []) { const set = rostered.get(r.chatter_id) || new Set(); for (const id of r.creator_ids || []) set.add(id); rostered.set(r.chatter_id, set); }
    const { data: roles } = await supabaseAdmin.from('users').select('id, role').eq('organisation_id', orgId);
    const roleOf = new Map((roles || []).map(u => [u.id, u.role]));
    const creatorOf = new Map((accounts || []).map(a => [a.id, a.creator_id]));
    for (const p of presence || []) {
      const list = onlineBy.get(p.account_id) || [];
      const staff = ['manager', 'head_manager', 'admin', 'owner'].includes(roleOf.get(p.user_id));
      const onRoster = staff || (!!p.chatter_id && !!creatorOf.get(p.account_id) && !!rostered.get(p.chatter_id)?.has(creatorOf.get(p.account_id)));
      list.push({ name: p.users?.name || p.chatters?.name || 'Someone', chatter: p.chatters?.name || null, since: p.started_at, device: p.device_id.slice(0, 8), on_roster: onRoster });
      onlineBy.set(p.account_id, list);
    }
    const out = [];
    for (const a of accounts || []) {
      const { data: msgs } = await supabaseAdmin.from('fansly_messages').select('fan_account_id, from_fan, type, price, attribution, chatter_id, chatters(name)')
        .eq('account_id', a.id).gte('sent_at', since).limit(5000);
      const rows = msgs || [];
      const byChatter = new Map();
      for (const m of rows.filter(r => !r.from_fan && r.type !== 2)) {
        const k = m.chatters?.name || (m.attribution === 'unattributed' ? 'Not attributed' : 'History');
        const c = byChatter.get(k) || { name: k, sent: 0, ppv: 0, fans: new Set() };
        c.sent += 1; if (m.price != null) c.ppv += 1; if (m.fan_account_id) c.fans.add(m.fan_account_id);
        byChatter.set(k, c);
      }
      const { data: tx } = await supabaseAdmin.from('fansly_transactions').select('category, net').eq('account_id', a.id).gte('created_at_fansly', since).limit(2000);
      const net = {}; for (const t of tx || []) net[t.category || 'other'] = Math.round(((net[t.category || 'other'] || 0) + Number(t.net || 0)) * 100) / 100;
      const { count: fansTotal } = await supabaseAdmin.from('fansly_fans').select('*', { count: 'exact', head: true }).eq('account_id', a.id);
      // the last 14 days, one line per chatter, from the daily summary
      const from14 = Stats.addDays(Stats.amsDay(new Date().toISOString()), -13);
      const { data: daily } = await supabaseAdmin.from('fansly_daily').select('day, chatter_key, sent, mass_sent, fans, ppv_sent, ppv_sold, ppv_net, mass_ppv_net, tips_net, refunds_net, unattributed, median_reply_s, chatters(name)')
        .eq('account_id', a.id).gte('day', from14).limit(5000);
      const per = new Map();
      for (const d of daily || []) {
        const k = d.chatter_key;
        const p = per.get(k) || { name: d.chatters?.name || 'Not credited', days: new Set(), sent: 0, mass_sent: 0, ppv_sent: 0, ppv_sold: 0, ppv_net: 0, mass_ppv_net: 0, tips_net: 0, refunds_net: 0, unattributed: 0, replies: [] };
        p.days.add(d.day); p.sent += d.sent; p.mass_sent += d.mass_sent; p.ppv_sent += d.ppv_sent; p.ppv_sold += d.ppv_sold;
        p.ppv_net += Number(d.ppv_net); p.mass_ppv_net += Number(d.mass_ppv_net || 0); p.tips_net += Number(d.tips_net); p.refunds_net += Number(d.refunds_net); p.unattributed += d.unattributed;
        if (d.median_reply_s != null) p.replies.push(d.median_reply_s);
        per.set(k, p);
      }
      const last14 = [...per.values()].map(p => ({ ...p, days: p.days.size, ppv_net: Math.round(p.ppv_net * 100) / 100, mass_ppv_net: Math.round(p.mass_ppv_net * 100) / 100, tips_net: Math.round(p.tips_net * 100) / 100, refunds_net: Math.round(p.refunds_net * 100) / 100,
        median_reply_s: p.replies.length ? p.replies.sort((x, y) => x - y)[p.replies.length >> 1] : null, replies: undefined })).sort((x, y) => (y.ppv_net + y.tips_net) - (x.ppv_net + x.tips_net) || y.sent - x.sent);
      // when the sales ledger was last read (someone opened Fansly's Earnings page with the extension on)
      const { data: lastLedger } = await supabaseAdmin.from('fansly_transactions').select('updated_at').eq('account_id', a.id).eq('source', 'ledger').order('updated_at', { ascending: false }).limit(1);
      const ledger_read_at = lastLedger?.[0]?.updated_at || null;
      const { count: ledgerRows } = await supabaseAdmin.from('fansly_transactions').select('*', { count: 'exact', head: true }).eq('account_id', a.id).eq('source', 'ledger');
      const { data: lastJobs } = await supabaseAdmin.from('fansly_fetch_jobs').select('id, kind, status, requested_at, finished_at, progress, error').eq('account_id', a.id).in('kind', FETCH_KINDS).order('requested_at', { ascending: false }).limit(6);
      const { count: msgTotal } = await supabaseAdmin.from('fansly_messages').select('*', { count: 'exact', head: true }).eq('account_id', a.id);
      out.push({
        id: a.id, fansly_account_id: a.fansly_account_id, username: a.username, display_name: a.display_name, page: a.creators?.name || null, creator_id: a.creator_id,
        followers_count: a.followers_count, subscribers_count: a.subscribers_count, status: a.status, first_seen_at: a.first_seen_at, last_seen_at: a.last_seen_at,
        online: onlineBy.get(a.id) || [], totals: { fans: fansTotal || 0, messages: msgTotal || 0 }, ledger_read_at,
        ledger: { read: ledgerRows || 0, total: a.ledger_total || null }, jobs: lastJobs || [], ledger_stale: !ledger_read_at || Date.now() - Date.parse(ledger_read_at) > 36 * 3600 * 1000, last14,
        today: {
          sent: rows.filter(r => !r.from_fan && r.type !== 2).length, mass: rows.filter(r => !r.from_fan && r.type === 2).length, received: rows.filter(r => r.from_fan).length,
          fans: new Set(rows.map(r => r.fan_account_id).filter(Boolean)).size,
          ppv_sent: rows.filter(r => !r.from_fan && r.type !== 2 && r.price != null).length,
          unattributed: rows.filter(r => r.attribution === 'unattributed').length,
          net, by_chatter: [...byChatter.values()].map(c => ({ ...c, fans: c.fans.size })).sort((x, y) => y.sent - x.sent),
        },
      });
    }
    const { data: log } = await supabaseAdmin.from('fansly_ingest_log').select('received_at, device_id, events, counts, errors, users(name)').eq('organisation_id', orgId).order('received_at', { ascending: false }).limit(10);
    res.json({ tables_ready: true, accounts: out, recent: (log || []).map(l => ({ ...l, user: l.users?.name || null, users: undefined })), online_window_sec: F.ONLINE_MS / 1000 });
  } catch (e) { fail(res, e, 'load the Fansly pages'); }
});

// ---------- the Messages dashboard: every message the team sent, per page ----------

/** The filters from the query string, as the database functions take them. Days are Amsterdam days. */
function messageFilters(req) {
  const q = req.query || {};
  const day = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null);
  const from = day(q.from), to = day(q.to);
  const uuid = (v) => (/^[0-9a-f-]{36}$/i.test(String(v || '')) ? String(v) : null);
  return {
    p_org: req.user.organisationId,
    p_account: uuid(q.account),
    p_chatter: q.chatter === 'none' ? 'none' : uuid(q.chatter),
    p_from: from ? Stats.dayStartUtc(from).toISOString() : null,
    p_to: to ? Stats.dayStartUtc(Stats.addDays(to, 1)).toISOString() : null,
    p_ppv: q.ppv === '1', p_sold: q.sold === '1', p_unreplied: q.unreplied === '1',
    // mass messages have their own list (GET /messages/mass): this one is chat messages unless asked otherwise
    p_kind: ['mass', 'all'].includes(q.kind) ? q.kind : 'personal',
    p_q: String(q.q || '').trim().slice(0, 100) || null,
    p_unsent: q.unsent === '1',
  };
}

/** The Messages dashboard's filters (second version, like Infloww's). Days are Amsterdam days. */
function messageFiltersV2(req) {
  const q = req.query || {};
  const day = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null);
  const from = day(q.from), to = day(q.to);
  const uuid = (v) => (/^[0-9a-f-]{36}$/i.test(String(v || '')) ? String(v) : null);
  const money = (v) => (v === '' || v == null || isNaN(Number(v)) ? null : Number(v));
  const pick = (v, list, dflt) => (list.includes(v) ? v : dflt);
  return {
    p_org: req.user.organisationId,
    p_account: uuid(q.account),
    p_chatter: q.chatter === 'none' ? 'none' : uuid(q.chatter),
    p_from: from ? Stats.dayStartUtc(from).toISOString() : null,
    p_to: to ? Stats.dayStartUtc(Stats.addDays(to, 1)).toISOString() : null,
    p_q: String(q.q || '').trim().slice(0, 100) || null,
    p_fan: /^\d{5,25}$/.test(String(q.fan || '')) ? String(q.fan) : null,
    p_price_min: money(q.price_min), p_price_max: money(q.price_max),
    p_purchased: pick(q.purchased, ['all', 'yes', 'no', 'ppv'], 'all'),
    p_status: pick(q.status, ['all', 'sent', 'unsent'], 'all'),
    p_replied: pick(q.replied, ['all', 'no'], 'all'),
  };
}

/** Page names, chatter names and fan names for a list of message rows. */
async function decorate(orgId, rows) {
  const accIds = [...new Set(rows.map(r => r.account_id))];
  const { data: accs } = accIds.length ? await supabaseAdmin.from('fansly_accounts').select('id, username, creators(name)').eq('organisation_id', orgId).in('id', accIds) : { data: [] };
  const page = new Map((accs || []).map(a => [a.id, a.creators?.name || a.username || 'Fansly page']));
  const chIds = [...new Set(rows.map(r => r.chatter_id).filter(Boolean))];
  const { data: chs } = chIds.length ? await supabaseAdmin.from('chatters').select('id, name').in('id', chIds) : { data: [] };
  const chatter = new Map((chs || []).map(c => [c.id, c.name]));
  const fans = new Map();
  for (const accId of accIds) {
    const ids = [...new Set(rows.filter(r => r.account_id === accId && r.fan_account_id).map(r => r.fan_account_id))];
    for (let i = 0; i < ids.length; i += 200) {
      const { data } = await supabaseAdmin.from('fansly_fans').select('fansly_account_id, username, display_name, nickname').eq('account_id', accId).in('fansly_account_id', ids.slice(i, i + 200));
      for (const f of data || []) fans.set(`${accId}:${f.fansly_account_id}`, f);
    }
  }
  return rows.map(r => {
    const f = fans.get(`${r.account_id}:${r.fan_account_id}`) || {};
    return {
      account_id: r.account_id, page: page.get(r.account_id) || null, message_id: r.message_id, group_id: r.group_id, fan_account_id: r.fan_account_id,
      fan_username: f.username || null, display_name: f.display_name || null, fan_nickname: f.nickname || null,
      kind: r.type === 2 ? 'mass' : r.type === 0 ? 'tip' : 'personal', message: r.message, sent_at: r.sent_at,
      price: r.price != null ? Number(r.price) : null, sold_at: r.sold_at, sold_net: r.sold_net != null ? Number(r.sold_net) : null,
      delivered_at: r.delivered_at, read_at: r.read_at, replied_at: r.replied_at, waited_s: r.waited_s,
      chatter_id: r.chatter_id, chatter: r.chatter_id ? chatter.get(r.chatter_id) || 'Unknown' : null, attribution: r.attribution,
      unsent_at: r.deleted_at || null,
      prev_fan_text: r.prev_fan_text ?? null, prev_fan_at: r.prev_fan_at ?? null, reply_s: r.reply_s ?? null,
      chat_url: r.group_id ? `https://fansly.com/messages/${r.group_id}` : null,
    };
  });
}

// GET /api/fansly/messages/filters → the pages and the chatters to filter by
router.get('/messages/filters', async (req, res) => {
  try {
    const { data: accs, error } = await supabaseAdmin.from('fansly_accounts').select('id, username, creators(name)').eq('organisation_id', req.user.organisationId).order('first_seen_at');
    if (error) throw error;
    const ids = (accs || []).map(a => a.id);
    const { data: daily } = ids.length ? await supabaseAdmin.from('fansly_daily').select('chatter_id').in('account_id', ids).not('chatter_id', 'is', null).limit(5000) : { data: [] };
    const chIds = [...new Set((daily || []).map(d => d.chatter_id))];
    const { data: chs } = chIds.length ? await supabaseAdmin.from('chatters').select('id, name').in('id', chIds).order('name') : { data: [] };
    res.json({ accounts: (accs || []).map(a => ({ id: a.id, page: a.creators?.name || a.username, username: a.username })), chatters: chs || [] });
  } catch (e) { fail(res, e, 'load the filters'); }
});

/** Where this person's extension is open now: the Fansly accounts with a live browser of theirs. */
async function myBrowsers(user) {
  const { data } = await supabaseAdmin.from('fansly_presence').select('account_id, last_seen_at').eq('user_id', user.id).is('ended_at', null)
    .gte('last_seen_at', new Date(Date.now() - F.ONLINE_MS).toISOString());
  return [...new Set((data || []).map(p => p.account_id).filter(Boolean))];
}

// GET /api/fansly/messages?account&chatter&from&to&q&fan&price_min&price_max&purchased&status&replied&page&size
// → one page of chat messages the team sent, newest first, with the count for the pages and the totals
router.get('/messages', async (req, res) => {
  try {
    const f = messageFiltersV2(req);
    const size = [25, 50, 100].includes(Number(req.query.size)) ? Number(req.query.size) : 50;
    const page = Math.max(1, Math.floor(Number(req.query.page) || 1));
    const [{ data, error }, { data: tot, error: e2 }] = await Promise.all([
      supabaseAdmin.rpc('fansly_sent_messages_v2', { ...f, p_limit: size, p_offset: (page - 1) * size }),
      supabaseAdmin.rpc('fansly_sent_totals_v2', f),
    ]);
    if (error) throw error;
    if (e2) throw e2;
    const t = (tot || [])[0] || {};
    const rows = await decorate(req.user.organisationId, data || []);
    res.json({ rows, page, size, total: Number(t.messages || 0),
      totals: { messages: Number(t.messages || 0), fans: Number(t.fans || 0), ppv_sent: Number(t.ppv_sent || 0), ppv_sold: Number(t.ppv_sold || 0),
        sold_net: Math.trunc(Number(t.sold_net || 0) * 100) / 100, unsent: Number(t.unsent || 0), median_reply_s: t.median_reply_s ?? null },
      my_browsers: await myBrowsers(req.user).catch(() => []) });
  } catch (e) { fail(res, e, 'load the messages'); }
});

// GET /api/fansly/messages/recipients?q= → fans to filter by ("Sent to")
router.get('/messages/recipients', async (req, res) => {
  try {
    const term = String(req.query.q || '').trim().replace(/[%_,()]/g, '').slice(0, 40);
    const { data: accs } = await supabaseAdmin.from('fansly_accounts').select('id').eq('organisation_id', req.user.organisationId);
    const ids = (accs || []).map(a => a.id);
    if (!ids.length || term.length < 2) return res.json({ fans: [] });
    const { data } = await supabaseAdmin.from('fansly_fans').select('account_id, fansly_account_id, username, display_name, nickname').in('account_id', ids)
      .or(`username.ilike.%${term}%,display_name.ilike.%${term}%,nickname.ilike.%${term}%`).limit(20);
    res.json({ fans: (data || []).map(f => ({ fan_account_id: f.fansly_account_id, account_id: f.account_id, name: f.nickname || f.display_name || f.username, username: f.username })) });
  } catch (e) { fail(res, e, 'find the fan'); }
});

// POST /api/fansly/messages/open { account_id, group_id } — open this chat in my own extension's browser
// (where my side panel is on that page); without one, the page opens it from its link
router.post('/messages/open', async (req, res) => {
  try {
    const accountId = String(req.body?.account_id || ''), groupId = String(req.body?.group_id || '');
    if (!/^\d{5,25}$/.test(groupId)) return res.status(400).json({ error: 'No such chat' });
    const { data: acc } = await supabaseAdmin.from('fansly_accounts').select('id').eq('id', accountId).eq('organisation_id', req.user.organisationId).maybeSingle();
    if (!acc) return res.status(404).json({ error: 'No such Fansly page' });
    if (!(await myBrowsers(req.user)).includes(acc.id)) return res.json({ sent: false, url: `https://fansly.com/messages/${groupId}` });
    const { error } = await supabaseAdmin.from('fansly_fetch_jobs').insert({ organisation_id: req.user.organisationId, account_id: acc.id, kind: 'open_chat',
      requested_by: req.user.id, target_user: req.user.id, progress: { group_id: groupId } });
    if (error) throw error;
    res.json({ sent: true });
  } catch (e) { fail(res, e, 'open the chat'); }
});

// GET /api/fansly/messages/mass?account&chatter&from&to&q&unsent → mass messages, one row each, with totals
router.get('/messages/mass', async (req, res) => {
  try {
    const f = messageFilters(req);
    const { data, error } = await supabaseAdmin.rpc('fansly_mass_messages', { p_org: f.p_org, p_account: f.p_account, p_chatter: f.p_chatter, p_from: f.p_from, p_to: f.p_to, p_q: f.p_q, p_unsent: f.p_unsent, p_limit: 500 });
    if (error) throw error;
    const rows = data || [];
    const accIds = [...new Set(rows.map(r => r.account_id))];
    const { data: accs } = accIds.length ? await supabaseAdmin.from('fansly_accounts').select('id, username, creators(name)').eq('organisation_id', req.user.organisationId).in('id', accIds) : { data: [] };
    const page = new Map((accs || []).map(a => [a.id, a.creators?.name || a.username || 'Fansly page']));
    const chIds = [...new Set(rows.map(r => r.chatter_id).filter(Boolean))];
    const { data: chs } = chIds.length ? await supabaseAdmin.from('chatters').select('id, name').in('id', chIds) : { data: [] };
    const chatter = new Map((chs || []).map(c => [c.id, c.name]));
    const out = rows.map(r => ({ ...r, page: page.get(r.account_id) || null, chatter: r.chatter_id ? chatter.get(r.chatter_id) || 'Unknown' : null,
      recipients: Number(r.recipients), read: Number(r.read), ppv_sold: Number(r.ppv_sold), price: r.price != null ? Number(r.price) : null, sold_net: Number(r.sold_net || 0), unsent_at: r.deleted_at || null }));
    const sum = (k) => out.reduce((n, r) => n + (Number(r[k]) || 0), 0);
    res.json({ rows: out, totals: { mass_messages: out.length, recipients: sum('recipients'), read: sum('read'), with_ppv: out.filter(r => r.price > 0).length,
      ppv_sold: sum('ppv_sold'), sold_net: Math.round(sum('sold_net') * 100) / 100, unsent: out.filter(r => r.unsent_at).length }, truncated: out.length >= 500 });
  } catch (e) { fail(res, e, 'load the mass messages'); }
});

// GET /api/fansly/messages/totals → the same filters, counted
router.get('/messages/totals', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin.rpc('fansly_sent_totals_v2', messageFiltersV2(req));
    if (error) throw error;
    const t = (data || [])[0] || {};
    res.json({ messages: Number(t.messages || 0), fans: Number(t.fans || 0), ppv_sent: Number(t.ppv_sent || 0), ppv_sold: Number(t.ppv_sold || 0),
      sold_net: Math.trunc(Number(t.sold_net || 0) * 100) / 100, median_reply_s: t.median_reply_s ?? null, unsent: Number(t.unsent || 0) });
  } catch (e) { fail(res, e, 'count the messages'); }
});

// GET /api/fansly/messages/conversation?account&fan → the whole chat with one fan, oldest first, and his card
router.get('/messages/conversation', async (req, res) => {
  const accountId = String(req.query.account || ''), fanId = String(req.query.fan || '');
  try {
    const { data: acc } = await supabaseAdmin.from('fansly_accounts').select('id, username, creators(name)').eq('id', accountId).eq('organisation_id', req.user.organisationId).maybeSingle();
    if (!acc) return res.status(404).json({ error: 'No such Fansly page' });
    const { data: fan } = await supabaseAdmin.from('fansly_fans').select('fansly_account_id, username, display_name, nickname, joined_fansly_at, last_seen_at, follows_you, subscription_tier_name, subscribed_until')
      .eq('account_id', accountId).eq('fansly_account_id', fanId).maybeSingle();
    const { data: msgs, error } = await supabaseAdmin.from('fansly_messages').select('message_id, from_fan, type, text, sent_at, price, sold_at, sold_net, tip_amount, read_at, chatter_id, attribution, deleted_at')
      .eq('account_id', accountId).eq('fan_account_id', fanId).order('sent_at', { ascending: false }).limit(1000);
    if (error) throw error;
    const chIds = [...new Set((msgs || []).map(m => m.chatter_id).filter(Boolean))];
    const { data: chs } = chIds.length ? await supabaseAdmin.from('chatters').select('id, name').in('id', chIds) : { data: [] };
    const chatter = new Map((chs || []).map(c => [c.id, c.name]));
    const { data: tx } = await supabaseAdmin.from('fansly_transactions').select('category, net').eq('account_id', accountId).eq('fan_account_id', fanId);
    const spent = (tx || []).reduce((n, t) => n + (t.category === 'refund' ? -1 : 1) * Math.abs(Number(t.net) || 0), 0);
    res.json({
      page: acc.creators?.name || acc.username,
      fan: fan ? { ...fan, username: fan.username, spent_net: Math.round(spent * 100) / 100, purchases: (tx || []).filter(t => t.category !== 'refund').length } : { fansly_account_id: fanId },
      messages: (msgs || []).reverse().map(m => ({ message_id: m.message_id, from_fan: m.from_fan, kind: m.type === 2 ? 'mass' : m.type === 0 ? 'tip' : 'personal', message: m.text, sent_at: m.sent_at,
        price: m.price != null ? Number(m.price) : null, sold_at: m.sold_at, sold_net: m.sold_net != null ? Number(m.sold_net) : null, tip_amount: m.tip_amount != null ? Number(m.tip_amount) : null,
        read_at: m.read_at, chatter: m.chatter_id ? chatter.get(m.chatter_id) || 'Unknown' : null, attribution: m.attribution, unsent_at: m.deleted_at || null })),
      truncated: (msgs || []).length >= 1000,
    });
  } catch (e) { fail(res, e, 'load the conversation'); }
});

// GET /api/fansly/messages.csv → the same filters as a spreadsheet (up to 20,000 rows). Not in demo mode.
router.get('/messages.csv', async (req, res) => {
  if (req.get('X-Demo-Mode') === '1') return res.status(409).json({ error: 'Turn demo mode off to export real messages.' });
  try {
    // a thousand at a time (the database hands out at most that many per call), up to 20,000
    const data = [];
    for (let off = 0; off < 20000; off += 1000) {
      const { data: part, error } = await supabaseAdmin.rpc('fansly_sent_messages_v2', { ...messageFiltersV2(req), p_limit: 1000, p_offset: off });
      if (error) throw error;
      data.push(...(part || []));
      if (!part || part.length < 1000) break;
    }
    const rows = await decorate(req.user.organisationId, data || []);
    const cell = (v) => { const t = v == null ? '' : String(v); return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
    const cols = ['sent_at', 'page', 'chatter', 'fan_username', 'fan_nickname', 'prev_fan_text', 'message', 'reply_s', 'price', 'sold_at', 'sold_net', 'read_at', 'unsent_at', 'chat_url'];
    const csv = [cols.join(','), ...rows.map(r => cols.map(c => cell(r[c])).join(','))].join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="fansly-messages-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send('\ufeff' + csv);
  } catch (e) { fail(res, e, 'export the messages'); }
});

// ---------- per page: the owner's credit rules and the AI profile that writes the suggestions ----------

// GET /api/fansly/accounts/:id/settings
router.get('/accounts/:id/settings', async (req, res) => {
  try {
    const { data: a, error } = await supabaseAdmin.from('fansly_accounts').select('id, username, credit_rules, creator_id').eq('id', req.params.id).eq('organisation_id', req.user.organisationId).maybeSingle();
    if (error) throw error;
    if (!a) return res.status(404).json({ error: 'No such Fansly page' });
    // the creator profile the suggested replies use: this page's own, or the page it is linked to
    const AI = require('../utils/aiChat');
    const owner = a.creator_id ? await AI.profileOwner(req.user.organisationId, a.creator_id) : null;
    const { data: persona } = owner ? await supabaseAdmin.from('ai_personas').select('profile').eq('creator_id', owner).eq('organisation_id', req.user.organisationId).maybeSingle() : { data: null };
    const { data: ownerPage } = owner && owner !== a.creator_id ? await supabaseAdmin.from('creators').select('name, platform').eq('id', owner).maybeSingle() : { data: null };
    res.json({ credit_rules: Stats.rulesOf(a.credit_rules), defaults: Stats.DEFAULT_RULES, creator_id: a.creator_id,
      profile: { has: !!String(persona?.profile?.name || '').trim(), name: persona?.profile?.name || null, linked_to: ownerPage ? { name: ownerPage.name, platform: ownerPage.platform } : null } });
  } catch (e) { fail(res, e, 'load the settings'); }
});

// POST /api/fansly/accounts/:id/settings { credit_rules? } — owner / admin only
router.post('/accounts/:id/settings', requireMinRole('admin'), async (req, res) => {
  try {
    const { data: a } = await supabaseAdmin.from('fansly_accounts').select('id, credit_rules').eq('id', req.params.id).eq('organisation_id', req.user.organisationId).maybeSingle();
    if (!a) return res.status(404).json({ error: 'No such Fansly page' });
    const patch = {};
    let rulesChanged = false;
    if (req.body?.credit_rules) {
      const next = Stats.rulesOf(req.body.credit_rules);
      rulesChanged = JSON.stringify(next) !== JSON.stringify(Stats.rulesOf(a.credit_rules));
      patch.credit_rules = next;
    }
    if (Object.keys(patch).length) {
      const { error } = await supabaseAdmin.from('fansly_accounts').update(patch).eq('id', a.id);
      if (error) throw error;
    }
    // the new rules apply to every sale already recorded: match again and recount, in the background
    if (rulesChanged) Stats.reapplyRules(a.id).catch(e => console.error('[fansly] reapply rules:', e.message));
    res.json({ ok: true, recounting: rulesChanged });
  } catch (e) { fail(res, e, 'save the settings'); }
});

// ---------- the page view: revenue by type, top fans, new paying fans, expired subscriptions, AI suggestions ----------

// GET /api/fansly/reports?from&to&accounts=<id,id>&gross=1 — Creator reports: earnings by type for any days,
// the same number of days before for the change, per page, per hour, top fans, new and ended subscribers
router.get('/reports', async (req, res) => {
  try {
    const day = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null);
    const today = Stats.amsDay(new Date());
    let to = day(req.query.to) || today, from = day(req.query.from) || Stats.addDays(to, -6);
    if (from > to) [from, to] = [to, from];
    if (Date.parse(to) - Date.parse(from) > 800 * 86400000) from = Stats.addDays(to, -800);
    const accounts = String(req.query.accounts || '').split(',').filter(x => /^[0-9a-f-]{36}$/i.test(x));
    res.json(await require('../utils/fanslyReports').report(req.user.organisationId, { from, to, accounts, gross: req.query.gross === '1' }));
  } catch (e) { fail(res, e, 'load the report'); }
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

// DELETE /api/fansly/accounts/:id — disconnect a Fansly page: it and everything recorded from it go
// (chats, fans, sales, notes…, by the tables' own cascade). Nothing changes on Fansly.
router.delete('/accounts/:id', requireMinRole('admin'), async (req, res) => {
  try {
    const { data: acc } = await supabaseAdmin.from('fansly_accounts').select('id, fansly_account_id, creator_id').eq('id', req.params.id).eq('organisation_id', req.user.organisationId).maybeSingle();
    if (!acc) return res.status(404).json({ error: 'No such Fansly page' });
    const { error } = await supabaseAdmin.from('fansly_accounts').delete().eq('id', acc.id);
    if (error) throw error;
    F.forgetAccount(req.user.organisationId, acc.fansly_account_id);
    // its page in the tool stays (shifts and payroll history point at it), marked inactive
    if (acc.creator_id) await supabaseAdmin.from('creators').update({ is_active: false }).eq('id', acc.creator_id).eq('organisation_id', req.user.organisationId);
    res.json({ ok: true });
  } catch (e) { fail(res, e, 'disconnect the page'); }
});

module.exports = router;
