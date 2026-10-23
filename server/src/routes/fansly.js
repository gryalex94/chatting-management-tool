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
    res.json({ ok: true, presenceId: id, assigned, account: account ? { id: account.id, username: account.username, status: account.status } : null });
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
      const { count: msgTotal } = await supabaseAdmin.from('fansly_messages').select('*', { count: 'exact', head: true }).eq('account_id', a.id);
      out.push({
        id: a.id, fansly_account_id: a.fansly_account_id, username: a.username, display_name: a.display_name, page: a.creators?.name || null, creator_id: a.creator_id,
        followers_count: a.followers_count, subscribers_count: a.subscribers_count, status: a.status, first_seen_at: a.first_seen_at, last_seen_at: a.last_seen_at,
        online: onlineBy.get(a.id) || [], totals: { fans: fansTotal || 0, messages: msgTotal || 0 }, ledger_read_at, ledger_stale: !ledger_read_at || Date.now() - Date.parse(ledger_read_at) > 36 * 3600 * 1000, last14,
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

// GET /api/fansly/messages?account&chatter&from&to&ppv&sold&unreplied&kind&q&before&beforeId&limit
router.get('/messages', async (req, res) => {
  try {
    const f = messageFilters(req);
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 200);
    const before = req.query.before && req.query.beforeId ? { p_before: String(req.query.before), p_before_id: String(req.query.beforeId) } : {};
    const { data, error } = await supabaseAdmin.rpc('fansly_sent_messages', { ...f, ...before, p_limit: limit + 1 });
    if (error) throw error;
    const more = (data || []).length > limit;
    const rows = await decorate(req.user.organisationId, (data || []).slice(0, limit));
    const last = rows[rows.length - 1];
    res.json({ rows, next: more && last ? { before: last.sent_at, beforeId: last.message_id } : null });
  } catch (e) { fail(res, e, 'load the messages'); }
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
    const { data, error } = await supabaseAdmin.rpc('fansly_sent_totals', messageFilters(req));
    if (error) throw error;
    const t = (data || [])[0] || {};
    res.json({ messages: Number(t.messages || 0), fans: Number(t.fans || 0), ppv_sent: Number(t.ppv_sent || 0), ppv_sold: Number(t.ppv_sold || 0),
      sold_net: Number(t.sold_net || 0), replied: Number(t.replied || 0), median_waited_s: t.median_waited_s ?? null, unsent: Number(t.unsent || 0) });
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
    const { data, error } = await supabaseAdmin.rpc('fansly_sent_messages', { ...messageFilters(req), p_limit: 20000 });
    if (error) throw error;
    const rows = await decorate(req.user.organisationId, data || []);
    const cell = (v) => { const t = v == null ? '' : String(v); return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
    const cols = ['sent_at', 'page', 'chatter', 'attribution', 'kind', 'fan_username', 'fan_nickname', 'display_name', 'message', 'price', 'sold_at', 'sold_net', 'delivered_at', 'read_at', 'replied_at', 'waited_s', 'unsent_at'];
    const csv = [cols.join(','), ...rows.map(r => cols.map(c => cell(r[c])).join(','))].join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="fansly-messages-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send('\ufeff' + csv);
  } catch (e) { fail(res, e, 'export the messages'); }
});

// POST /api/fansly/recount — match sales and recount the last 14 days now
router.post('/recount', async (req, res) => {
  try { const n = await Stats.refreshAll(req.user.organisationId, 13); res.json({ ok: true, accounts: n }); }
  catch (e) { fail(res, e, 'recount the Fansly numbers'); }
});

// ---------- per page: the owner's credit rules and the AI profile that writes the suggestions ----------

/** The pages that have an AI profile (Her profile in AI chat): any of them can write for a Fansly page. */
async function aiPages(orgId) {
  const { data } = await supabaseAdmin.from('ai_personas').select('creator_id, profile, creators(name, organisation_id)').limit(200);
  return (data || []).filter(p => p.creators?.organisation_id === orgId && p.profile?.name).map(p => ({ creator_id: p.creator_id, page: p.creators.name, name: p.profile.name }));
}

// GET /api/fansly/accounts/:id/settings
router.get('/accounts/:id/settings', async (req, res) => {
  try {
    const { data: a, error } = await supabaseAdmin.from('fansly_accounts').select('id, username, credit_rules, ai_creator_id').eq('id', req.params.id).eq('organisation_id', req.user.organisationId).maybeSingle();
    if (error) throw error;
    if (!a) return res.status(404).json({ error: 'No such Fansly page' });
    res.json({ credit_rules: Stats.rulesOf(a.credit_rules), defaults: Stats.DEFAULT_RULES, ai_creator_id: a.ai_creator_id, ai_pages: await aiPages(req.user.organisationId).catch(() => []) });
  } catch (e) { fail(res, e, 'load the settings'); }
});

// POST /api/fansly/accounts/:id/settings { credit_rules?, ai_creator_id? } — owner / admin only
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
    if (req.body?.ai_creator_id !== undefined) {
      const id = req.body.ai_creator_id || null;
      if (id && !(await aiPages(req.user.organisationId)).some(p => p.creator_id === id)) return res.status(400).json({ error: 'That page has no AI profile' });
      patch.ai_creator_id = id;
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

// GET /api/fansly/revenue?account=<id>&days=30
router.get('/revenue', async (req, res) => {
  const orgId = req.user.organisationId;
  const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 365);
  try {
    const { data: acc } = await supabaseAdmin.from('fansly_accounts').select('id, username, creators(name)').eq('id', String(req.query.account || '')).eq('organisation_id', orgId).maybeSingle();
    if (!acc) return res.status(404).json({ error: 'No such Fansly page' });
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const page = 1000;
    const tx = [];
    for (let from = 0; ; from += page) {
      const { data, error } = await supabaseAdmin.from('fansly_transactions').select('transaction_id, category, type_label, fan_account_id, net, gross, created_at_fansly, credited_rule, credited_chatter_id')
        .eq('account_id', acc.id).gte('created_at_fansly', since).order('transaction_id').range(from, from + page - 1);
      if (error) throw error;
      tx.push(...(data || []));
      if (!data || data.length < page) break;
    }
    const r2 = (n) => Math.round(n * 100) / 100;
    const byType = {}, byDay = {}, perFan = new Map();
    for (const t of tx) {
      const net = Math.abs(Number(t.net) || 0) * (t.category === 'refund' ? -1 : 1);
      const mass = (t.category === 'chat_ppv' && t.credited_rule === 'sender_of_mass_message') || t.credited_rule === 'mass_message_not_credited';
      const k = mass ? 'mass_ppv' : (t.category || 'unsorted');
      byType[k] = r2((byType[k] || 0) + net);
      const day = Stats.amsDay(t.created_at_fansly);
      const d = byDay[day] || (byDay[day] = { day, net: 0 }); d.net = r2(d.net + net); d[k] = r2((d[k] || 0) + net);
      if (t.fan_account_id) { const f = perFan.get(t.fan_account_id) || { fan: t.fan_account_id, net: 0, purchases: 0 }; f.net += net; if (t.category !== 'refund') f.purchases += 1; perFan.set(t.fan_account_id, f); }
    }
    // a paying fan is new when his first purchase ever (not just in the window) falls in the window
    const fanIds = [...perFan.keys()];
    const firstEver = new Map();
    for (let i = 0; i < fanIds.length; i += 200) {
      const { data } = await supabaseAdmin.from('fansly_transactions').select('fan_account_id, created_at_fansly').eq('account_id', acc.id).in('fan_account_id', fanIds.slice(i, i + 200)).neq('category', 'refund').order('created_at_fansly').limit(5000);
      for (const t of data || []) if (!firstEver.has(t.fan_account_id)) firstEver.set(t.fan_account_id, t.created_at_fansly);
    }
    const names = new Map();
    const want = [...new Set([...perFan.keys()])];
    for (let i = 0; i < want.length; i += 200) {
      const { data } = await supabaseAdmin.from('fansly_fans').select('fansly_account_id, username, display_name, nickname').eq('account_id', acc.id).in('fansly_account_id', want.slice(i, i + 200));
      for (const f of data || []) names.set(f.fansly_account_id, f.nickname || f.display_name || (f.username ? `@${f.username}` : null));
    }
    const label = (id) => names.get(id) || `#${String(id).slice(-6)}`;
    const top = [...perFan.values()].sort((a, b) => b.net - a.net).slice(0, 15).map(f => ({ fan_account_id: f.fan, name: label(f.fan), net: r2(f.net), purchases: f.purchases, first_purchase: firstEver.get(f.fan) || null }));
    const newPaying = [...perFan.values()].filter(f => firstEver.get(f.fan) >= since).sort((a, b) => b.net - a.net).map(f => ({ fan_account_id: f.fan, name: label(f.fan), net: r2(f.net), first_purchase: firstEver.get(f.fan) }));
    // subscriptions that ended in the window (from the Subscribers page, else the fan rows)
    const now = new Date().toISOString();
    const { data: endedSubs } = await supabaseAdmin.from('fansly_subscriptions').select('fan_account_id, tier_name, ends_at, auto_renew').eq('account_id', acc.id).gte('ends_at', since).lt('ends_at', now).order('ends_at', { ascending: false }).limit(200);
    let expired = (endedSubs || []).map(x => ({ fan_account_id: x.fan_account_id, tier: x.tier_name, ended: x.ends_at }));
    if (!expired.length) {
      const { data: fans } = await supabaseAdmin.from('fansly_fans').select('fansly_account_id, username, display_name, nickname, subscription_tier_name, subscribed_until').eq('account_id', acc.id).gte('subscribed_until', since).lt('subscribed_until', now).order('subscribed_until', { ascending: false }).limit(200);
      expired = (fans || []).map(f => ({ fan_account_id: f.fansly_account_id, tier: f.subscription_tier_name, ended: f.subscribed_until, name: f.nickname || f.display_name || (f.username ? `@${f.username}` : null) }));
    }
    for (const e of expired) if (!e.name) e.name = label(e.fan_account_id);
    // the AI's suggestions in the window, per chatter
    const { data: drafts } = await supabaseAdmin.from('fansly_ai_drafts').select('status, chatter_id, cost_usd, chatters(name)').eq('account_id', acc.id).gte('created_at', since).limit(10000);
    const ai = new Map();
    for (const d of drafts || []) {
      const k = d.chatters?.name || 'Not credited';
      const a = ai.get(k) || { name: k, shown: 0, inserted: 0, sent_as_is: 0, edited: 0, discarded: 0, failed: 0, cost: 0 };
      a.shown += 1; if (a[d.status] != null && d.status !== 'shown') a[d.status] += 1; a.cost += Number(d.cost_usd) || 0;
      ai.set(k, a);
    }
    res.json({
      page: acc.creators?.name || acc.username, days, since,
      totals: { net: r2(Object.values(byType).reduce((n, v) => n + v, 0)), by_type: byType, transactions: tx.length, paying_fans: perFan.size, new_paying_fans: newPaying.length },
      by_day: Object.values(byDay).sort((a, b) => a.day.localeCompare(b.day)),
      top_fans: top, new_paying: newPaying.slice(0, 30), expired: expired.slice(0, 50),
      ai: [...ai.values()].map(a => ({ ...a, cost: r2(a.cost) })),
    });
  } catch (e) { fail(res, e, 'load the revenue'); }
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
