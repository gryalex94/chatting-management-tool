const router = require('express').Router();
const { supabaseAdmin } = require('../utils/supabase');
const { requireMinRole } = require('../middleware/auth');

// GET /api/shifts - List shifts (optionally filtered by creatorId)
router.get('/', async (req, res) => {
  try {
    let query = supabaseAdmin
      .from('shifts')
      .select('*')
      .eq('organisation_id', req.user.organisationId)
      .order('start_time');

    if (req.query.creatorId) {
      query = query.eq('creator_id', req.query.creatorId);
    } else {
      // Only return shifts that have a creator (not templates)
      query = query.not('creator_id', 'is', null);
    }

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch shifts' });
  }
});

// POST /api/shifts - Create shift for a specific creator
router.post('/', requireMinRole('admin'), async (req, res) => {
  try {
    const { name, start_time, end_time, timezone, shift_type, creatorId } = req.body;
    if (!name || !start_time || !end_time) {
      return res.status(400).json({ error: 'Name, start_time, and end_time are required' });
    }
    if (!creatorId) {
      return res.status(400).json({ error: 'creatorId is required' });
    }

    const { data, error } = await supabaseAdmin
      .from('shifts')
      .insert({
        name,
        start_time,
        end_time,
        timezone: timezone || 'Europe/Amsterdam',
        shift_type: shift_type || 'custom',
        organisation_id: req.user.organisationId,
        creator_id: creatorId,
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create shift' });
  }
});

// POST /api/shifts/init-defaults/:creatorId - Create default shifts for a new creator
router.post('/init-defaults/:creatorId', requireMinRole('admin'), async (req, res) => {
  try {
    const creatorId = req.params.creatorId;
    const orgId = req.user.organisationId;

    // Check if creator already has shifts
    const { data: existing } = await supabaseAdmin
      .from('shifts')
      .select('id')
      .eq('creator_id', creatorId)
      .limit(1);

    if (existing && existing.length > 0) {
      return res.status(409).json({ error: 'Creator already has shifts' });
    }

    const defaults = [
      { name: 'US Prime Shift', start_time: '02:00:00', end_time: '10:00:00' },
      { name: 'Middle Shift', start_time: '10:00:00', end_time: '18:00:00' },
      { name: 'EU Prime Shift', start_time: '18:00:00', end_time: '02:00:00' },
    ];

    const { data, error } = await supabaseAdmin
      .from('shifts')
      .insert(defaults.map(s => ({
        ...s,
        creator_id: creatorId,
        organisation_id: orgId,
        is_default: true,
        shift_type: 'default',
      })))
      .select();

    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create default shifts' });
  }
});

// PUT /api/shifts/:id - Update shift
router.put('/:id', requireMinRole('admin'), async (req, res) => {
  try {
    const { name, start_time, end_time } = req.body;
    const update = {};
    if (name !== undefined) update.name = name;
    if (start_time !== undefined) update.start_time = start_time;
    if (end_time !== undefined) update.end_time = end_time;

    const { data, error } = await supabaseAdmin
      .from('shifts')
      .update(update)
      .eq('id', req.params.id)
      .eq('organisation_id', req.user.organisationId)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update shift' });
  }
});

// DELETE /api/shifts/:id - Delete shift
router.delete('/:id', requireMinRole('admin'), async (req, res) => {
  try {
    const shiftId = req.params.id;
    const orgId = req.user.organisationId;

    await supabaseAdmin
      .from('chatter_creator_assignments')
      .update({ shift_id: null, is_active: false })
      .eq('shift_id', shiftId);

    const { error } = await supabaseAdmin
      .from('shifts')
      .delete()
      .eq('id', shiftId)
      .eq('organisation_id', orgId);

    if (error) {
      console.error('Shift delete DB error:', error);
      return res.status(500).json({ error: error.message });
    }
    res.json({ message: 'Shift deleted' });
  } catch (err) {
    console.error('Shift delete error:', err);
    res.status(500).json({ error: 'Failed to delete shift' });
  }
});

module.exports = router;