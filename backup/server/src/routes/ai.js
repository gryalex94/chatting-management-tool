const router = require('express').Router();
const { supabaseAdmin } = require('../utils/supabase');
const { requireMinRole } = require('../middleware/auth');
const { runDailyAnalysis, runDailyAnalysisForOrg } = require('../ai/runDailyAnalysis');

// POST /api/ai/analyze - Run analysis for a specific chatter+creator+date
router.post('/analyze', requireMinRole('manager'), async (req, res) => {
  try {
    const { chatter_id, creator_id, report_date } = req.body;
    if (!chatter_id || !creator_id || !report_date) {
      return res.status(400).json({ error: 'chatter_id, creator_id, and report_date are required' });
    }

    // Return immediately, run in background
    res.json({ message: 'Analysis started', chatter_id, creator_id, report_date });

    runDailyAnalysis(chatter_id, creator_id, report_date, req.user.organisationId)
      .catch(err => console.error('[AI Route] Analysis failed:', err.message));
  } catch (err) {
    res.status(500).json({ error: 'Failed to start analysis' });
  }
});

// POST /api/ai/analyze-org - Run analysis for ALL chatters for a date
router.post('/analyze-org', requireMinRole('admin'), async (req, res) => {
  try {
    const { report_date } = req.body;
    if (!report_date) return res.status(400).json({ error: 'report_date is required' });

    res.json({ message: 'Org-wide analysis started', report_date });

    runDailyAnalysisForOrg(req.user.organisationId, report_date)
      .catch(err => console.error('[AI Route] Org analysis failed:', err.message));
  } catch (err) {
    res.status(500).json({ error: 'Failed to start org analysis' });
  }
});

// GET /api/ai/analysis/:chatterId - Get latest AI analyses for a chatter
router.get('/analysis/:chatterId', async (req, res) => {
  try {
    const { days } = req.query;
    const limit = parseInt(days) || 7;

    const { data, error } = await supabaseAdmin
      .from('ai_daily_analyses')
      .select('*')
      .eq('chatter_id', req.params.chatterId)
      .eq('organisation_id', req.user.organisationId)
      .order('report_date', { ascending: false })
      .limit(limit);

    if (error) return res.status(500).json({ error: error.message });
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch analyses' });
  }
});

// GET /api/ai/analysis/:chatterId/:date - Get analysis for specific date
router.get('/analysis/:chatterId/:date', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('ai_daily_analyses')
      .select('*')
      .eq('chatter_id', req.params.chatterId)
      .eq('report_date', req.params.date)
      .eq('organisation_id', req.user.organisationId);

    if (error) return res.status(500).json({ error: error.message });
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch analysis' });
  }
});

// GET /api/ai/flagged - Get all flagged items across org (for manager dashboard)
router.get('/flagged', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('ai_daily_analyses')
      .select('chatter_id, creator_id, report_date, flagged_items, chatters(name), creators(name)')
      .eq('organisation_id', req.user.organisationId)
      .not('flagged_items', 'eq', '[]')
      .order('report_date', { ascending: false })
      .limit(50);

    if (error) return res.status(500).json({ error: error.message });
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch flagged items' });
  }
});

module.exports = router;