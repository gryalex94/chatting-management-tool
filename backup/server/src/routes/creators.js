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
      .neq('is_active', false)
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

    // Auto-create default shifts for the new creator
    const defaults = [
      { name: 'US Prime Shift', start_time: '02:00:00', end_time: '10:00:00' },
      { name: 'Middle Shift', start_time: '10:00:00', end_time: '18:00:00' },
      { name: 'EU Prime Shift', start_time: '18:00:00', end_time: '02:00:00' },
    ];
    await supabaseAdmin.from('shifts').insert(
      defaults.map(s => ({ ...s, creator_id: data.id, organisation_id: req.user.organisationId, is_default: true, shift_type: 'default' }))
    );

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

// POST /api/creators/:id/merge - Merge another creator into this one
router.post('/:id/merge', requireMinRole('admin'), async (req, res) => {
  try {
    const targetId = req.params.id;
    const { sourceId } = req.body;
    if (!sourceId) return res.status(400).json({ error: 'sourceId is required' });
    if (sourceId === targetId) return res.status(400).json({ error: 'Cannot merge creator into itself' });

    // Get both creator names
    const { data: target } = await supabaseAdmin
      .from('creators').select('name').eq('id', targetId).single();
    const { data: source } = await supabaseAdmin
      .from('creators').select('name').eq('id', sourceId).single();

    if (!target || !source) return res.status(404).json({ error: 'Creator not found' });

    // Reassign chatter assignments
    await supabaseAdmin
      .from('chatter_creator_assignments')
      .update({ creator_id: targetId })
      .eq('creator_id', sourceId)
      .eq('is_active', true);

    // Reassign manager assignments
    await supabaseAdmin
      .from('creator_manager_assignments')
      .update({ creator_id: targetId })
      .eq('creator_id', sourceId);

    // Move messages
    await supabaseAdmin.from('messages').update({ creator_id: targetId }).eq('creator_id', sourceId);

    // Move employee daily stats
    await supabaseAdmin.from('employee_daily_stats').update({ creator_id: targetId }).eq('creator_id', sourceId);

    // Move creator daily stats
    await supabaseAdmin.from('creator_daily_stats').update({ creator_id: targetId }).eq('creator_id', sourceId);

    // Move tasks
    await supabaseAdmin.from('tasks').update({ creator_id: targetId }).eq('creator_id', sourceId);

    // Combine names on target
    const combinedName = target.name + ' + ' + source.name;
    await supabaseAdmin
      .from('creators')
      .update({ name: combinedName })
      .eq('id', targetId);

    // Deactivate source and record merge
    await supabaseAdmin
      .from('creators')
      .update({ is_active: false, merged_into: targetId, merged_at: new Date().toISOString() })
      .eq('id', sourceId);

    res.json({ success: true, combinedName });
  } catch (err) {
    console.error('Merge error:', err);
    res.status(500).json({ error: 'Failed to merge creators' });
  }
});

// GET /api/creators/merged/all - Batch fetch all merged creators
router.get('/merged/all', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('creators')
      .select('id, name, merged_into, merged_at')
      .eq('organisation_id', req.user.organisationId)
      .eq('is_active', false)
      .not('merged_into', 'is', null);

    if (error) return res.status(500).json({ error: error.message });

    const map = {};
    (data || []).forEach(c => {
      if (!map[c.merged_into]) map[c.merged_into] = [];
      map[c.merged_into].push(c);
    });
    res.json(map);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch merged creators' });
  }
});

// GET /api/creators/:id/merged - List creators that were merged into this one
router.get('/:id/merged', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('creators')
      .select('id, name, merged_at')
      .eq('merged_into', req.params.id)
      .eq('is_active', false)
      .order('merged_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch merged creators' });
  }
});

// POST /api/creators/:id/split - Reverse a merge, reactivate the source creator
router.post('/:id/split', requireMinRole('admin'), async (req, res) => {
  try {
    const sourceId = req.params.id;

    const { data: source } = await supabaseAdmin
      .from('creators')
      .select('id, name, merged_into')
      .eq('id', sourceId)
      .single();

    if (!source || !source.merged_into) {
      return res.status(400).json({ error: 'This creator was not merged' });
    }

    const targetId = source.merged_into;

    // Get the target creator's current name and remove the source name
    const { data: target } = await supabaseAdmin
      .from('creators')
      .select('name')
      .eq('id', targetId)
      .single();

    if (target) {
      const parts = target.name.split(' + ').filter(p => p !== source.name);
      if (parts.length > 0) {
        await supabaseAdmin.from('creators').update({ name: parts.join(' + ') }).eq('id', targetId);
      }
    }

    // Also check if any OTHER creators were merged into the source — 
    // re-point them to the target instead so the chain doesn't break
    await supabaseAdmin
      .from('creators')
      .update({ merged_into: targetId })
      .eq('merged_into', sourceId)
      .eq('is_active', false);

    // Reactivate the source
    await supabaseAdmin
      .from('creators')
      .update({ is_active: true, merged_into: null, merged_at: null })
      .eq('id', sourceId);

    res.json({ success: true, message: `${source.name} split off` });
  } catch (err) {
    console.error('Split error:', err);
    res.status(500).json({ error: 'Failed to split creator' });
  }
});

module.exports = router;
