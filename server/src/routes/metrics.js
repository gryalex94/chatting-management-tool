const router = require('express').Router();
const { supabaseAdmin } = require('../utils/supabase');

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

// GET /api/metrics/employee-stats - Get employee daily stats
router.get('/employee-stats', async (req, res) => {
  try {
    const { date, chatter_id } = req.query;

    let query = supabaseAdmin
      .from('employee_daily_stats')
      .select('*')
      .eq('organisation_id', req.user.organisationId)
      .order('report_date', { ascending: false });

    if (date) query = query.eq('report_date', date);
    if (chatter_id) query = query.eq('chatter_id', chatter_id);
    if (!date && !chatter_id) query = query.limit(200);

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
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

module.exports = router;
