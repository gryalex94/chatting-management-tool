const router = require('express').Router();
const { supabaseAdmin } = require('../utils/supabase');
const { requireMinRole } = require('../middleware/auth');

// GET /api/organisations/config - org-wide preferences (key/value), e.g. the
// manual Infloww time offset used to align task timestamps with the chat screen.
router.get('/config', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('daily_check_config')
      .select('key, value')
      .eq('organisation_id', req.user.organisationId);
    if (error) return res.status(500).json({ error: error.message });
    const config = {};
    (data || []).forEach(r => { config[r.key] = r.value; });
    res.json({ config });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch config' });
  }
});

// PUT /api/organisations/config - set one preference (admin). Body { key, value }.
router.put('/config', requireMinRole('admin'), async (req, res) => {
  try {
    const { key, value } = req.body;
    if (!key) return res.status(400).json({ error: 'key is required' });
    const orgId = req.user.organisationId;
    const { data: existing } = await supabaseAdmin
      .from('daily_check_config').select('id')
      .eq('organisation_id', orgId).eq('key', key).maybeSingle();
    if (existing) {
      await supabaseAdmin.from('daily_check_config')
        .update({ value: String(value), updated_at: new Date().toISOString() }).eq('id', existing.id);
    } else {
      await supabaseAdmin.from('daily_check_config')
        .insert({ organisation_id: orgId, key, value: String(value) });
    }
    res.json({ ok: true, key, value: String(value) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save config' });
  }
});

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
