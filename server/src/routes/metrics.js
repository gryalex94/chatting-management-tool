const router = require('express').Router();
const { supabaseAdmin } = require('../utils/supabase');
const { computeMetricsForOrg } = require('../utils/computeMetrics');

// GET /api/metrics/chatter/:id - Get metrics for a specific chatter
router.get('/chatter/:id', async (req, res) => {
  try {
    const { days } = req.query;
    const limit = parseInt(days) || 30;

    const { data, error } = await supabaseAdmin
      .from('chatter_daily_metrics')
      .select('*')
      .eq('chatter_id', req.params.id)
      .order('report_date', { ascending: false })
      .limit(limit);

    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch metrics' });
  }
});

// GET /api/metrics/anomalies - Get unresolved anomaly flags
router.get('/anomalies', async (req, res) => {
  try {
    const { resolved } = req.query;

    let query = supabaseAdmin
      .from('anomaly_flags')
      .select(`
        *,
        chatter:chatters(id, name, status),
        creator:creators(id, name)
      `)
      .eq('organisation_id', req.user.organisationId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (resolved === 'false') query = query.eq('resolved', false);
    if (resolved === 'true') query = query.eq('resolved', true);

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch anomalies' });
  }
});

// GET /api/metrics/employee-stats - Per-chatter daily stats, computed from the
// Message Dashboard (chatter_daily_metrics). Returns the same field shape the
// profile expects, so the Employee Report upload is no longer needed.
router.get('/employee-stats', async (req, res) => {
  try {
    const { date, chatter_id } = req.query;

    // select('*') so this keeps working before migration 014 adds ppvs_sent /
    // ppvs_unlocked / fans_who_spent — those just come back undefined until then.
    let query = supabaseAdmin
      .from('chatter_daily_metrics')
      .select('*, creators(name)')
      .eq('organisation_id', req.user.organisationId)
      .order('report_date', { ascending: false });

    if (date) query = query.eq('report_date', date);
    if (chatter_id) query = query.eq('chatter_id', chatter_id);
    if (!date && !chatter_id) query = query.limit(500);

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });

    // Shape it like the old employee_daily_stats rows (the UI sums the raw counts
    // and derives golden ratio / unlock / Fan CVR itself).
    const rows = (data || []).map(r => ({
      report_date: r.report_date,
      chatter_id: r.chatter_id,
      creator_name: r.creators?.name || 'Unknown',
      sales: r.sales_today,
      messages_sent: r.messages_sent,
      fans_chatted: r.fans_chatted,
      ppvs_sent: r.ppvs_sent,
      ppvs_unlocked: r.ppvs_unlocked,
      fans_who_spent: r.fans_who_spent,
      golden_ratio: r.golden_ratio,
      unlock_rate: r.unlock_rate,
    }));
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch employee stats' });
  }
});

// GET /api/metrics/creator-stats - Get creator daily stats
router.get('/creator-stats', async (req, res) => {
  try {
    const { date, creator_id } = req.query;

    let query = supabaseAdmin
      .from('creator_daily_stats')
      .select('*')
      .eq('organisation_id', req.user.organisationId)
      .order('report_date', { ascending: false });

    if (date) query = query.eq('report_date', date);
    if (creator_id) query = query.eq('creator_id', creator_id);
    if (!date && !creator_id) query = query.limit(100);

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch creator stats' });
  }
});

// GET /api/metrics/selling-patterns - Get selling patterns
router.get('/selling-patterns', async (req, res) => {
  try {
    const { chatter_id, date, purchased } = req.query;

    let query = supabaseAdmin
      .from('selling_patterns')
      .select('*, chatter:chatters(name), creator:creators(name)')
      .eq('organisation_id', req.user.organisationId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (chatter_id) query = query.eq('chatter_id', chatter_id);
    if (date) query = query.eq('report_date', date);
    if (purchased === 'true') query = query.eq('was_purchased', true);
    if (purchased === 'false') query = query.eq('was_purchased', false);

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch selling patterns' });
  }
});

// POST /api/metrics/compute - Trigger Tier 1 computation
router.post('/compute', async (req, res) => {
  try {
    const { date } = req.body; // optional: compute for specific date only
    const result = await computeMetricsForOrg(req.user.organisationId, date || null);
    res.json(result);
  } catch (err) {
    console.error('Compute metrics error:', err);
    res.status(500).json({ error: 'Failed to compute metrics' });
  }
});

// POST /api/metrics/populate - Populate metrics from employee stats
router.post('/populate', async (req, res) => {
  try {
    const { populateMetricsFromEmployeeStats } = require('../utils/computeMetrics');
    const result = await populateMetricsFromEmployeeStats(req.user.organisationId);
    res.json(result);
  } catch (err) {
    console.error('Populate error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
