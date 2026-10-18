const router = require('express').Router();
const { supabaseAdmin } = require('../utils/supabase');
const { requireMinRole } = require('../middleware/auth');
const fv = require('../integrations/fanvue');
const { runFanvueSync, fanvueProgress, fanvueLastResult } = require('../utils/fanvueSync');
const { createPage, noPlatformColumn } = require('../utils/pages');

// Settings → Fanvue: connect a creator's Fanvue account (she approves on Fanvue),
// copy its chats and earnings in (utils/fanvueSync.js), and see the daily volume.
// Managers see the accounts and their numbers (the Fanvue dashboard); connecting,
// syncing and disconnecting give access to the creator's account: admins only.
router.use(requireMinRole('manager'));
const adminOnly = requireMinRole('admin');

const NOT_READY = 'Run database change 030 (Fanvue) in Supabase first';
const STATE_TTL_MS = 15 * 60_000;
const missingTable = (e) => /fanvue_(accounts|oauth_states|fans|messages|earnings|daily)/.test(String(e?.message || ''));
const fail = (res, e, what) => {
  console.error(`[fanvue] ${what}:`, e.message);
  if (missingTable(e)) return res.status(409).json({ error: NOT_READY });
  if (e instanceof fv.FanvueError) return res.status(e.reconnect ? 409 : 502).json({ error: e.message });
  return res.status(500).json({ error: `Could not ${what}` });
};
const ACCOUNT_COLS = 'id, organisation_id, handle, display_name, is_ai_creator, subscribers_count, followers_count, scopes, status, connected_at, synced_at, sync_error';
const view = ({ organisation_id, ...a }) => ({ ...a, running: fanvueProgress(a.id), last_result: fanvueLastResult(a.id) });

// The accounts, with the page each belongs to (that column comes with database change 032).
async function selectAccounts(build) {
  let r = await build(`${ACCOUNT_COLS}, creator_id`);
  if (r.error && /creator_id/.test(r.error.message)) r = await build(ACCOUNT_COLS);
  return r;
}

// A connected account belongs to a Fanvue page of its own (named after the
// creator), made the first time it's needed. Skipped before database change 032.
// One at a time per account; if another server linked a page first, ours goes.
const linking = new Map();
function ensurePage(acc) {
  if (acc.creator_id || !('creator_id' in acc)) return Promise.resolve(acc);
  if (!linking.has(acc.id)) {
    linking.set(acc.id, (async () => {
      try {
        const page = await createPage({ name: acc.display_name || acc.handle || 'Fanvue page', organisationId: acc.organisation_id, platform: 'fanvue' });
        const { data: done } = await supabaseAdmin.from('fanvue_accounts').update({ creator_id: page.id })
          .eq('id', acc.id).is('creator_id', null).select('id');
        if (done?.length) return { ...acc, creator_id: page.id };
        await supabaseAdmin.from('shifts').delete().eq('creator_id', page.id);
        await supabaseAdmin.from('creators').delete().eq('id', page.id);
        const { data: now } = await supabaseAdmin.from('fanvue_accounts').select('creator_id').eq('id', acc.id).single();
        return { ...acc, creator_id: now?.creator_id || null };
      } catch (e) {
        if (!noPlatformColumn(e)) console.error('[fanvue] making its page:', e.message);
        return acc;
      } finally {
        linking.delete(acc.id);
      }
    })());
  }
  return linking.get(acc.id);
}

// Fanvue sends the creator back to this tool's own /fanvue/callback page only
// (the address must also be listed on the app's Authentication tab on Fanvue).
function allowedRedirect(uri) {
  try {
    const u = new URL(uri);
    if (u.pathname !== '/fanvue/callback' || u.search || u.hash) return false;
    const origins = new Set(['http://localhost:5173']);
    if (process.env.CLIENT_URL) origins.add(new URL(process.env.CLIENT_URL).origin);
    return origins.has(u.origin);
  } catch { return false; }
}

// The account, if it belongs to the caller's organisation.
async function ownAccount(req, res) {
  const { data, error } = await selectAccounts((cols) => supabaseAdmin.from('fanvue_accounts').select(cols).eq('id', req.params.id).maybeSingle());
  if (error) { fail(res, error, 'load the Fanvue account'); return null; }
  if (!data || data.organisation_id !== req.user.organisationId) { res.status(404).json({ error: 'Fanvue account not found' }); return null; }
  return data;
}

// GET /api/fanvue — is it set up on the server, and the connected accounts.
router.get('/', async (req, res) => {
  const { data, error } = await selectAccounts((cols) => supabaseAdmin.from('fanvue_accounts').select(cols)
    .eq('organisation_id', req.user.organisationId).order('connected_at'));
  if (error && !missingTable(error)) return fail(res, error, 'load the Fanvue accounts');
  const accounts = await Promise.all((data || []).map(ensurePage));
  res.json({ configured: fv.configured(), tables_ready: !error, accounts: accounts.map(view) });
});

// POST /api/fanvue/connect { redirectUri } — the Fanvue address where the creator approves access.
router.post('/connect', adminOnly, async (req, res) => {
  if (!fv.configured()) return res.status(400).json({ error: 'Add FANVUE_CLIENT_ID and FANVUE_CLIENT_SECRET to the server settings first' });
  const redirectUri = String(req.body?.redirectUri || '');
  if (!allowedRedirect(redirectUri)) return res.status(400).json({ error: 'Fanvue can’t send the approval back to this address' });
  try {
    await supabaseAdmin.from('fanvue_oauth_states').delete().lt('created_at', new Date(Date.now() - STATE_TTL_MS).toISOString());
    const state = fv.newState();
    const { verifier, challenge } = fv.pkce();
    const { error } = await supabaseAdmin.from('fanvue_oauth_states').insert({
      state, organisation_id: req.user.organisationId, user_id: req.user.id, code_verifier: verifier, redirect_uri: redirectUri,
    });
    if (error) throw error;
    res.json({ url: fv.authorizeUrl({ state, challenge, redirectUri }) });
  } catch (e) { fail(res, e, 'start the Fanvue connection'); }
});

// POST /api/fanvue/callback { code, state } — the creator approved: swap the code
// for access, save the account, and start copying its chats in.
router.post('/callback', adminOnly, async (req, res) => {
  const code = String(req.body?.code || '');
  const state = String(req.body?.state || '');
  if (!code || !state) return res.status(400).json({ error: 'The approval came back incomplete. Click Connect Fanvue again.' });
  try {
    const { data: st, error: stErr } = await supabaseAdmin.from('fanvue_oauth_states').select('*').eq('state', state).maybeSingle();
    if (stErr) throw stErr;
    if (st) await supabaseAdmin.from('fanvue_oauth_states').delete().eq('state', st.state);    // one use only
    if (!st || st.organisation_id !== req.user.organisationId || st.user_id !== req.user.id || Date.now() - Date.parse(st.created_at) > STATE_TTL_MS) {
      return res.status(400).json({ error: 'This approval has expired or belongs to someone else. Click Connect Fanvue again.' });
    }
    const tok = await fv.exchangeCode({ code, verifier: st.code_verifier, redirectUri: st.redirect_uri });
    const me = await fv.call(tok.access_token, '/v1/users/me');
    if (!me?.uuid) throw new fv.FanvueError('Fanvue did not say which account approved');
    if (!me.isCreator) return res.status(400).json({ error: 'That Fanvue account isn’t a creator account. Log in to Fanvue as the creator and connect again.' });
    if (!tok.refresh_token) console.warn('[fanvue] no refresh token granted; the connection will need renewing when the access runs out');
    const { data: acc, error } = await supabaseAdmin.from('fanvue_accounts').upsert({
      organisation_id: req.user.organisationId, fanvue_uuid: me.uuid, handle: me.handle || null, display_name: me.displayName || null,
      is_ai_creator: !!me.isAiCreator, subscribers_count: me.fanCounts?.subscribersCount ?? null, followers_count: me.fanCounts?.followersCount ?? null,
      scopes: tok.scope || null, ...fv.tokenColumns(tok), status: 'connected', connected_by: req.user.id,
      connected_at: new Date().toISOString(), sync_error: null,
    }, { onConflict: 'organisation_id,fanvue_uuid' }).select(ACCOUNT_COLS).single();
    if (error) throw error;
    const { data: linked } = await selectAccounts((cols) => supabaseAdmin.from('fanvue_accounts').select(cols).eq('id', acc.id).single());
    await ensurePage(linked || acc);
    runFanvueSync(acc.id).catch(e => console.error('[FanvueSync]', e.message));   // first copy, in the background
    res.json({ account: view(acc) });
  } catch (e) { fail(res, e, 'finish the Fanvue connection'); }
});

// POST /api/fanvue/accounts/:id/sync — copy what's new now (runs in the background).
router.post('/accounts/:id/sync', adminOnly, async (req, res) => {
  const acc = await ownAccount(req, res);
  if (!acc) return;
  if (acc.status !== 'connected') return res.status(409).json({ error: 'Connect the account again first' });
  if (fanvueProgress(acc.id)) return res.status(409).json({ error: 'A sync is already running' });
  runFanvueSync(acc.id, { full: req.body?.full === true }).catch(e => console.error('[FanvueSync]', e.message));
  res.status(202).json({ started: true });
});

// GET /api/fanvue/accounts/:id/stats?days=30 — messages and earnings per day.
router.get('/accounts/:id/stats', async (req, res) => {
  const acc = await ownAccount(req, res);
  if (!acc) return;
  const days = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 7), 90);
  const since = new Date(Date.now() - days * 86400000).toISOString();
  try {
    const head = (table) => supabaseAdmin.from(table).select('account_id', { count: 'exact', head: true }).eq('account_id', acc.id);
    const [msgs, earn, fans, messages] = await Promise.all([
      supabaseAdmin.rpc('fanvue_daily_messages', { p_account: acc.id, p_since: since }),
      supabaseAdmin.rpc('fanvue_daily_earnings', { p_account: acc.id, p_since: since }),
      head('fanvue_fans'), head('fanvue_messages'),
    ]);
    for (const r of [msgs, earn, fans, messages]) if (r.error) throw r.error;
    res.json({
      days, today: new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Amsterdam' }),
      messages: msgs.data || [], earnings: earn.data || [], totals: { fans: fans.count || 0, messages: messages.count || 0 },
    });
  } catch (e) { fail(res, e, 'load the Fanvue numbers'); }
});

// POST /api/fanvue/accounts/:id/disconnect — forget the access (the copied chats stay).
router.post('/accounts/:id/disconnect', adminOnly, async (req, res) => {
  const acc = await ownAccount(req, res);
  if (!acc) return;
  const { error } = await supabaseAdmin.from('fanvue_accounts').update({ tokens: null, token_expires_at: null, status: 'disconnected' }).eq('id', acc.id);
  if (error) return fail(res, error, 'disconnect the Fanvue account');
  res.json({ ok: true });
});

module.exports = router;
