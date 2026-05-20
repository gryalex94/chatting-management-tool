const router = require('express').Router();
const { supabaseAdmin } = require('../utils/supabase');
const { requireMinRole } = require('../middleware/auth');

// GET /api/organisations/mine - Get current user's org
router.get('/mine', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('organisations')
      .select('*')
      .eq('id', req.user.organisationId)
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch organisation' });
  }
});

// GET /api/organisations/members - Get all members of the org
router.get('/members', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('id, email, name, role, is_active, created_at')
      .eq('organisation_id', req.user.organisationId)
      .order('created_at', { ascending: true });

    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch members' });
  }
});

module.exports = router;
