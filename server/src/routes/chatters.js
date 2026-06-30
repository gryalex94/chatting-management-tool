const router = require('express').Router();
const { supabaseAdmin } = require('../utils/supabase');
const { requireMinRole } = require('../middleware/auth');

// GET /api/chatters - List all chatters in org
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('chatters')
      .select(`
        *,
        chatter_creator_assignments(
          creator_id, creators(id, name),
          shift_id, shifts(id, name, start_time, end_time),
          day_of_week, cover_hours,
          familiarization_ends_at, is_active
        )
      `)
      .eq('organisation_id', req.user.organisationId)
      .eq('is_active', true)
      .order('name');

    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch chatters' });
  }
});

// ──────────────────────────────────────────────────
// Static routes MUST come before /:id
// ──────────────────────────────────────────────────

// GET /api/chatters/overtime/list - Get all overtime assignments
router.get('/overtime/list', async (req, res) => {
  try {
    const dayOfWeek = req.query.day ? parseInt(req.query.day) : null;
    let query = supabaseAdmin
      .from('chatter_overtime')
      .select('*, chatter:chatter_id(id, name), covering_for_chatter:covering_for(id, name)')
      .eq('organisation_id', req.user.organisationId);
    if (dayOfWeek) query = query.eq('day_of_week', dayOfWeek);
    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch overtime' });
  }
});

// GET /api/chatters/days-off/list - Get all days off for a date
router.get('/days-off/list', async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().split('T')[0];
    const { data, error } = await supabaseAdmin
      .from('chatter_days_off')
      .select('*, chatter:chatters(id, name), overtime_chatter:overtime_chatter_id(id, name)')
      .eq('organisation_id', req.user.organisationId)
      .eq('date', date);

    if (error) return res.status(500).json({ error: error.message });
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch days off' });
  }
});

// ──────────────────────────────────────────────────
// Dynamic /:id routes below
// ──────────────────────────────────────────────────

// GET /api/chatters/:id - Get single chatter with full profile
router.get('/:id', async (req, res) => {
  try {
    const chatterId = req.params.id;

    const { data: chatter, error } = await supabaseAdmin
      .from('chatters')
      .select(`
        *,
        chatter_creator_assignments(
          creator_id, creators(id, name),
          shift_id, shifts(id, name, start_time, end_time),
          day_of_week, cover_hours,
          familiarization_ends_at, assigned_at, is_active
        )
      `)
      .eq('id', chatterId)
      .eq('organisation_id', req.user.organisationId)
      .single();

    if (error) return res.status(404).json({ error: 'Chatter not found' });

    const { data: mistakes } = await supabaseAdmin
      .from('chatter_mistakes')
      .select('*, users:reported_by(name)')
      .eq('chatter_id', chatterId)
      .order('created_at', { ascending: false })
      .limit(50);

    const { data: penalties } = await supabaseAdmin
      .from('chatter_penalties')
      .select('*, users:issued_by(name)')
      .eq('chatter_id', chatterId)
      .order('created_at', { ascending: false });

    const { data: reviews } = await supabaseAdmin
      .from('chatter_performance_reviews')
      .select('*, users:reviewed_by(name)')
      .eq('chatter_id', chatterId)
      .order('created_at', { ascending: false });

    const { data: attachments } = await supabaseAdmin
      .from('task_attachments')
      .select('*, users:uploaded_by(name)')
      .eq('chatter_id', chatterId)
      .order('created_at', { ascending: false })
      .limit(100);

    const { data: latestMetrics } = await supabaseAdmin
      .from('chatter_daily_metrics')
      .select('*')
      .eq('chatter_id', chatterId)
      .order('report_date', { ascending: false })
      .limit(7);

    const mistakeCounts = [];

    res.json({
      ...chatter,
      mistakes: mistakes || [],
      penalties: penalties || [],
      reviews: reviews || [],
      attachments: attachments || [],
      latestMetrics: latestMetrics || [],
      mistakeCounts: mistakeCounts || [],
    });
  } catch (err) {
    console.error('Fetch chatter error:', err);
    res.status(500).json({ error: 'Failed to fetch chatter profile' });
  }
});

// POST /api/chatters - Create a new chatter
router.post('/', requireMinRole('manager'), async (req, res) => {
  try {
    const { name, email, status } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    const { data, error } = await supabaseAdmin
      .from('chatters')
      .insert({
        name,
        email,
        status: status || 'new',
        organisation_id: req.user.organisationId,
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create chatter' });
  }
});

// PUT /api/chatters/:id - Update chatter (name, status, work_days, etc.)
router.put('/:id', requireMinRole('manager'), async (req, res) => {
  try {
    const { name, email, status, is_active } = req.body;
    const update = {};
    if (name !== undefined) update.name = name;
    if (email !== undefined) update.email = email;
    if (status !== undefined) update.status = status;
    if (is_active !== undefined) update.is_active = is_active;
    if (req.body.work_days !== undefined) update.work_days = req.body.work_days;
    if (req.body.hourly_rate !== undefined) update.hourly_rate = req.body.hourly_rate;
    if (req.body.commission_pct !== undefined) update.commission_pct = req.body.commission_pct;

    const { data, error } = await supabaseAdmin
      .from('chatters')
      .update(update)
      .eq('id', req.params.id)
      .eq('organisation_id', req.user.organisationId)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update chatter' });
  }
});

// POST /api/chatters/:id/assign - Assign chatter to creator + shift
router.post('/:id/assign', requireMinRole('manager'), async (req, res) => {
  try {
    const { creatorId, shiftId, dayOfWeek, coverHours } = req.body;
    if (!creatorId) return res.status(400).json({ error: 'Creator ID is required' });
    // A cover sets BOTH a weekday and hours; a regular assignment sets neither.
    const isCover = dayOfWeek != null && coverHours != null;
    const dow = isCover ? Number(dayOfWeek) : null;
    const hours = isCover ? Number(coverHours) : null;

    const { data: chatter } = await supabaseAdmin
      .from('chatters')
      .select('status')
      .eq('id', req.params.id)
      .single();

    // Don't double-add the same person to the same slot (a regular and a cover, or
    // covers on different weekdays, are distinct — so match on day_of_week too).
    let dup = supabaseAdmin
      .from('chatter_creator_assignments')
      .select('id')
      .eq('chatter_id', req.params.id)
      .eq('creator_id', creatorId)
      .eq('shift_id', shiftId || null)
      .eq('is_active', true);
    dup = dow == null ? dup.is('day_of_week', null) : dup.eq('day_of_week', dow);
    const { data: existing } = await dup.limit(1);

    if (existing && existing.length > 0) {
      return res.status(409).json({ error: 'Already on this slot' });
    }

    const familDays = { new: 30, new_monitoring: 21, developing: 14, experienced: 7 };
    const days = familDays[chatter?.status] || 30;
    const familEndDate = new Date();
    familEndDate.setDate(familEndDate.getDate() + days);

    const { data, error } = await supabaseAdmin
      .from('chatter_creator_assignments')
      .insert({
        chatter_id: req.params.id,
        creator_id: creatorId,
        shift_id: shiftId || null,
        day_of_week: dow,
        cover_hours: hours,
        familiarization_ends_at: familEndDate.toISOString(),
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to assign chatter' });
  }
});

// POST /api/chatters/:id/unassign - Remove a chatter assignment
router.post('/:id/unassign', requireMinRole('manager'), async (req, res) => {
  try {
    const { creatorId, shiftId, dayOfWeek } = req.body;
    if (!creatorId) return res.status(400).json({ error: 'Creator ID is required' });

    const query = supabaseAdmin
      .from('chatter_creator_assignments')
      .update({ is_active: false })
      .eq('chatter_id', req.params.id)
      .eq('creator_id', creatorId)
      .eq('is_active', true);

    if (shiftId) query.eq('shift_id', shiftId);
    // Target one cover specifically (its weekday), else the regular standing row.
    if (dayOfWeek != null) query.eq('day_of_week', Number(dayOfWeek));
    else if (dayOfWeek === null) query.is('day_of_week', null);

    const { data, error } = await query.select();

    if (error) return res.status(500).json({ error: error.message });
    res.json({ removed: data?.length || 0 });
  } catch (err) {
    res.status(500).json({ error: 'Failed to unassign chatter' });
  }
});

// POST /api/chatters/:id/day-off - Add a day off
router.post('/:id/day-off', requireMinRole('manager'), async (req, res) => {
  try {
    const { date, overtimeChatterId, note } = req.body;
    if (!date) return res.status(400).json({ error: 'Date is required' });

    const { data, error } = await supabaseAdmin
      .from('chatter_days_off')
      .insert({
        chatter_id: req.params.id,
        date,
        overtime_chatter_id: overtimeChatterId || null,
        note: note || null,
        created_by: req.user.id,
        organisation_id: req.user.organisationId,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'Day off already set for this date' });
      return res.status(500).json({ error: error.message });
    }
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to add day off' });
  }
});

// DELETE /api/chatters/:id/day-off - Remove a day off
router.delete('/:id/day-off', requireMinRole('manager'), async (req, res) => {
  try {
    const date = req.query.date;
    if (!date) return res.status(400).json({ error: 'Date query param required' });

    const { error } = await supabaseAdmin
      .from('chatter_days_off')
      .delete()
      .eq('chatter_id', req.params.id)
      .eq('date', date);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ message: 'Day off removed' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove day off' });
  }
});

// GET /api/chatters/:id/overtime - Get overtime for a specific chatter
router.get('/:id/overtime', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('chatter_overtime')
      .select('*, chatter:chatter_id(id, name), covering_for_chatter:covering_for(id, name)')
      .eq('covering_for', req.params.id);
    if (error) return res.status(500).json({ error: error.message });
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch overtime' });
  }
});

// POST /api/chatters/:id/overtime - Add overtime assignment
router.post('/:id/overtime', requireMinRole('manager'), async (req, res) => {
  try {
    const { dayOfWeek, overtimeType, coveringFor, hours } = req.body;
    if (!dayOfWeek || !overtimeType || !coveringFor) {
      return res.status(400).json({ error: 'dayOfWeek, overtimeType, and coveringFor are required' });
    }
    const { data, error } = await supabaseAdmin
      .from('chatter_overtime')
      .insert({
        chatter_id: req.params.id,
        day_of_week: dayOfWeek,
        overtime_type: overtimeType,
        hours: hours || 4,
        covering_for: coveringFor,
        organisation_id: req.user.organisationId,
      })
      .select()
      .single();
    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'Overtime already set' });
      return res.status(500).json({ error: error.message });
    }
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to add overtime' });
  }
});

// DELETE /api/chatters/:id/overtime/:overtimeId - Remove overtime
router.delete('/:id/overtime/:overtimeId', requireMinRole('manager'), async (req, res) => {
  try {
    const { error } = await supabaseAdmin
      .from('chatter_overtime')
      .delete()
      .eq('id', req.params.overtimeId);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ message: 'Overtime removed' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove overtime' });
  }
});

// POST /api/chatters/:id/mistakes - Log a mistake
router.post('/:id/mistakes', requireMinRole('manager'), async (req, res) => {
  try {
    const { category, description } = req.body;
    if (!category) return res.status(400).json({ error: 'Category is required' });

    const { data, error } = await supabaseAdmin
      .from('chatter_mistakes')
      .insert({
        chatter_id: req.params.id,
        category,
        description,
        reported_by: req.user.id,
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to log mistake' });
  }
});

// POST /api/chatters/:id/penalties - Issue a penalty
router.post('/:id/penalties', requireMinRole('manager'), async (req, res) => {
  try {
    const { description, penalty_type, amount } = req.body;
    if (!description) return res.status(400).json({ error: 'Description is required' });

    const { data, error } = await supabaseAdmin
      .from('chatter_penalties')
      .insert({
        chatter_id: req.params.id,
        description,
        penalty_type: penalty_type || 'penalty',
        amount: amount || null,
        issued_by: req.user.id,
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to issue penalty' });
  }
});

// POST /api/chatters/:id/reviews - Log a performance review
router.post('/:id/reviews', requireMinRole('manager'), async (req, res) => {
  try {
    const { notes } = req.body;
    if (!notes) return res.status(400).json({ error: 'Notes are required' });

    const { data, error } = await supabaseAdmin
      .from('chatter_performance_reviews')
      .insert({
        chatter_id: req.params.id,
        notes,
        reviewed_by: req.user.id,
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to log review' });
  }
});

module.exports = router;