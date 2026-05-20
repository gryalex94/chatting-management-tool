const router = require('express').Router();
const { supabaseAdmin } = require('../utils/supabase');
const { requireMinRole } = require('../middleware/auth');

// GET /api/shifts - List all shifts
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('shifts')
      .select('*')
      .eq('organisation_id', req.user.organisationId)
      .order('start_time');

    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch shifts' });
  }
});

// POST /api/shifts - Create custom shift
router.post('/', requireMinRole('admin'), async (req, res) => {
  try {
    const { name, start_time, end_time, timezone, shift_type } = req.body;
    if (!name || !start_time || !end_time) {
      return res.status(400).json({ error: 'Name, start_time, and end_time are required' });
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
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create shift' });
  }
});

// PUT /api/shifts/:id - Update shift
router.put('/:id', requireMinRole('admin'), async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('shifts')
      .update(req.body)
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

module.exports = router;
