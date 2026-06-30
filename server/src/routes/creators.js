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
      defaults.map(s => ({ ...s, creator_id: data.id, organisation_id: req.user.organisationId, is_default: true, shift_type: 'regular' }))
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

// POST /api/creators/:id/merge - Group another page into this one's TEAM.
// Non-destructive: the source page stays active and keeps its OWN name, stats,
// messages and per-day numbers. We only tag it as belonging to the target's
// group (merged_into) so the Shifts view shows them on one team card, and we
// move its working schedule (chatter assignments) onto the target so the team's
// roster lives in one place. Uploads continue to land on each real page, so
// nothing ever respawns as a duplicate.
router.post('/:id/merge', requireMinRole('admin'), async (req, res) => {
  try {
    const targetId = req.params.id;
    const { sourceId } = req.body;
    if (!sourceId) return res.status(400).json({ error: 'sourceId is required' });
    if (sourceId === targetId) return res.status(400).json({ error: 'Cannot merge a page into itself' });

    const { data: target } = await supabaseAdmin
      .from('creators').select('id, name, merged_into').eq('id', targetId).single();
    const { data: source } = await supabaseAdmin
      .from('creators').select('id, name, merged_into').eq('id', sourceId).single();
    if (!target || !source) return res.status(404).json({ error: 'Page not found' });

    // The group is always anchored on a top-level page. If the target is itself
    // a member of a group, anchor on that group's primary instead.
    const primaryId = target.merged_into || targetId;
    if (primaryId === sourceId) return res.status(400).json({ error: 'Cannot merge a page into itself' });

    // If the source already had pages grouped under it, re-point them to the primary.
    await supabaseAdmin
      .from('creators').update({ merged_into: primaryId })
      .eq('merged_into', sourceId);

    // Move the source's team roster onto the primary, remapping each assignment to
    // the primary's same-named shift (so chatters still land in the right slot).
    const [{ data: srcAssigns }, { data: primShifts }] = await Promise.all([
      supabaseAdmin.from('chatter_creator_assignments')
        .select('id, shift_id, shifts(name)').eq('creator_id', sourceId).eq('is_active', true),
      supabaseAdmin.from('shifts').select('id, name').eq('creator_id', primaryId),
    ]);
    for (const a of (srcAssigns || [])) {
      const match = (primShifts || []).find(s => s.name === a.shifts?.name) || (primShifts || [])[0];
      await supabaseAdmin.from('chatter_creator_assignments')
        .update({ creator_id: primaryId, shift_id: match ? match.id : a.shift_id })
        .eq('id', a.id);
    }

    // Manager assignments also follow the team.
    await supabaseAdmin.from('creator_manager_assignments')
      .update({ creator_id: primaryId }).eq('creator_id', sourceId);

    // Tag the source as a member of the group — but keep it ACTIVE with its own
    // name. (We do NOT move messages/stats; each page keeps its own numbers.)
    await supabaseAdmin
      .from('creators')
      .update({ merged_into: primaryId, merged_at: new Date().toISOString() })
      .eq('id', sourceId);

    res.json({ success: true, primaryId });
  } catch (err) {
    console.error('Merge error:', err);
    res.status(500).json({ error: 'Failed to merge pages' });
  }
});

// GET /api/creators/:id/merged - List pages grouped under this one (its team members)
router.get('/:id/merged', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('creators')
      .select('id, name, merged_at')
      .eq('merged_into', req.params.id)
      .neq('is_active', false)
      .order('merged_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch grouped pages' });
  }
});

// POST /api/creators/:id/split - Un-group a page so it stands on its own card again.
// The page was never deactivated, so this just clears its group tag.
router.post('/:id/split', requireMinRole('admin'), async (req, res) => {
  try {
    const sourceId = req.params.id;
    const { data: source } = await supabaseAdmin
      .from('creators').select('id, name, merged_into').eq('id', sourceId).single();

    if (!source || !source.merged_into) {
      return res.status(400).json({ error: 'This page is not part of a group' });
    }

    await supabaseAdmin
      .from('creators')
      .update({ merged_into: null, merged_at: null })
      .eq('id', sourceId);

    res.json({ success: true, message: `${source.name} split off` });
  } catch (err) {
    console.error('Split error:', err);
    res.status(500).json({ error: 'Failed to split page' });
  }
});

module.exports = router;
