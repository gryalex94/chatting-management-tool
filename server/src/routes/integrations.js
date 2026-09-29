const router = require('express').Router();
const { supabaseAdmin } = require('../utils/supabase');
const { requireMinRole } = require('../middleware/auth');
const { configured } = require('../integrations/infloww');
const { runInflowwSync, inflowwSyncRunning } = require('../utils/inflowwSync');

// A missing table (migration 023 not run) must come back as null, and a
// head-only count doesn't report that, so ask for one row too.
const count = async (table, orgId, filter = (q) => q) => {
  const { count: n, error } = await filter(supabaseAdmin.from(table).select('organisation_id', { count: 'exact' }).eq('organisation_id', orgId)).limit(1);
  return error ? null : n || 0;
};

// GET /api/integrations/infloww — is the API connected, when did each part last
// sync, and what has it brought in so far.
router.get('/infloww', requireMinRole('admin'), async (req, res) => {
  const orgId = req.user.organisationId;
  const { data: state } = await supabaseAdmin.from('infloww_sync_state').select('*').eq('organisation_id', orgId);
  const [sales, refunds, employees, linkedEmployees, fanIdsSales, fanIdsPasted] = await Promise.all([
    count('infloww_sales', orgId), count('infloww_refunds', orgId), count('infloww_employees', orgId),
    count('infloww_employees', orgId, q => q.not('chatter_id', 'is', null)),
    count('fan_infloww_ids', orgId, q => q.eq('source', 'sales')),
    count('fan_infloww_ids', orgId, q => q.eq('source', 'chat_link')),
  ]);
  // The address Infloww sees this server at, for the key's IP allow-list
  // (Cloudflare's trace page on Infloww's API host answers even without a key).
  let serverIp = null;
  try {
    const t = await (await fetch('https://openapi.infloww.com/cdn-cgi/trace', { signal: AbortSignal.timeout(5000) })).text();
    serverIp = /^ip=(.+)$/m.exec(t)?.[1] || null;
  } catch { /* optional */ }
  res.json({
    configured: configured(), running: inflowwSyncRunning(), server_ip: serverIp,
    tables_ready: sales !== null && fanIdsSales !== null,   // migration 023 applied
    state: state || [],
    totals: { sales, refunds, employees, linked_employees: linkedEmployees, fan_ids_from_sales: fanIdsSales, fan_ids_pasted: fanIdsPasted },
  });
});

// POST /api/integrations/infloww/sync { days } — sync now (runs in the background;
// days up to 365 = the one-time backfill).
router.post('/infloww/sync', requireMinRole('admin'), async (req, res) => {
  if (!configured()) return res.status(400).json({ error: 'Infloww API is not configured on the server (INFLOWW_API_KEY / INFLOWW_OID)' });
  if (inflowwSyncRunning()) return res.status(409).json({ error: 'A sync is already running' });
  const days = Math.min(Math.max(parseInt(req.body.days, 10) || 3, 1), 365);
  runInflowwSync({ days });                          // not awaited: a year takes a few minutes
  res.status(202).json({ started: true, days });
});

module.exports = router;
