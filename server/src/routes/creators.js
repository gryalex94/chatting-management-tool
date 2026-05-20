const router = require('express').Router();
const { supabaseAdmin } = require('../utils/supabase');
const { requireMinRole } = require('../middleware/auth');

// GET /api/creators - List all creators in org
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('creators')
      .select(`
        *,
        creator_manager_assignments(user_id, users(id, name, email)),
        chatter_creator_assignments(chatter_id, chatters(id, name, status), shift_id, shifts(id, name))
      `)
      .eq('organisation_id', req.user.organisationId)
      .order('name');

    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch creators' });
  }
});

// POST /api/creators - Create a new creator
router.post('/', requireMinRole('admin'), async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    const { data, error } = await supabaseAdmin
      .from('creators')
      .insert({ name, organisation_id: req.user.organisationId })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create creator' });
  }
});

// PUT /api/creators/:id - Update creator
router.put('/:id', requireMinRole('admin'), async (req, res) => {
  try {
    const { name, is_active } = req.body;
    const { data, error } = await supabaseAdmin
      .from('creators')
      .update({ name, is_active })
      .eq('id', req.params.id)
      .eq('organisation_id', req.user.organisationId)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update creator' });
  }
});

// POST /api/creators/:id/assign-manager - Assign a manager to creator
router.post('/:id/assign-manager', requireMinRole('admin'), async (req, res) => {
  try {
    const { userId } = req.body;
    const { data, error } = await supabaseAdmin
      .from('creator_manager_assignments')
      .insert({ user_id: userId, creator_id: req.params.id })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to assign manager' });
  }
});

// DELETE /api/creators/:id/unassign-manager/:userId
router.delete('/:id/unassign-manager/:userId', requireMinRole('admin'), async (req, res) => {
  try {
    const { error } = await supabaseAdmin
      .from('creator_manager_assignments')
      .delete()
      .eq('creator_id', req.params.id)
      .eq('user_id', req.params.userId);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ message: 'Manager unassigned' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to unassign manager' });
  }
});

module.exports = router;
