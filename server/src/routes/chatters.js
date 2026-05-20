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
          familiarization_ends_at, is_active
        )
      `)
      .eq('organisation_id', req.user.organisationId)
      .order('name');

    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch chatters' });
  }
});

// GET /api/chatters/:id - Get single chatter with full profile
router.get('/:id', async (req, res) => {
  try {
    const chatterId = req.params.id;

    // Get chatter + assignments
    const { data: chatter, error } = await supabaseAdmin
      .from('chatters')
      .select(`
        *,
        chatter_creator_assignments(
          creator_id, creators(id, name),
          shift_id, shifts(id, name, start_time, end_time),
          familiarization_ends_at, assigned_at, is_active
        )
      `)
      .eq('id', chatterId)
      .eq('organisation_id', req.user.organisationId)
      .single();

    if (error) return res.status(404).json({ error: 'Chatter not found' });

    // Get mistakes
    const { data: mistakes } = await supabaseAdmin
      .from('chatter_mistakes')
      .select('*, users:reported_by(name)')
      .eq('chatter_id', chatterId)
      .order('created_at', { ascending: false })
      .limit(50);

    // Get penalties
    const { data: penalties } = await supabaseAdmin
      .from('chatter_penalties')
      .select('*, users:issued_by(name)')
      .eq('chatter_id', chatterId)
      .order('created_at', { ascending: false });

    // Get performance reviews
    const { data: reviews } = await supabaseAdmin
      .from('chatter_performance_reviews')
      .select('*, users:reviewed_by(name)')
      .eq('chatter_id', chatterId)
      .order('created_at', { ascending: false });

    // Get task attachments (coaching dossier)
    const { data: attachments } = await supabaseAdmin
      .from('task_attachments')
      .select('*, users:uploaded_by(name)')
      .eq('chatter_id', chatterId)
      .order('created_at', { ascending: false })
      .limit(100);

    // Get latest metrics
    const { data: latestMetrics } = await supabaseAdmin
      .from('chatter_daily_metrics')
      .select('*')
      .eq('chatter_id', chatterId)
      .order('report_date', { ascending: false })
      .limit(7);

    // Count repeated mistake categories
    const { data: mistakeCounts } = await supabaseAdmin
      .rpc('count_chatter_mistakes', { p_chatter_id: chatterId });

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

// PUT /api/chatters/:id - Update chatter (name, status, etc.)
router.put('/:id', requireMinRole('manager'), async (req, res) => {
  try {
    const { name, email, status, is_active } = req.body;
    const update = {};
    if (name !== undefined) update.name = name;
    if (email !== undefined) update.email = email;
    if (status !== undefined) update.status = status;
    if (is_active !== undefined) update.is_active = is_active;

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
    const { creatorId, shiftId } = req.body;
    if (!creatorId) return res.status(400).json({ error: 'Creator ID is required' });

    // Get chatter to determine familiarization period
    const { data: chatter } = await supabaseAdmin
      .from('chatters')
      .select('status')
      .eq('id', req.params.id)
      .single();

    // Calculate familiarization end date based on status
    const familDays = {
      new: 30,
      new_monitoring: 21,
      developing: 14,
      experienced: 7,
    };
    const days = familDays[chatter?.status] || 30;
    const familEndDate = new Date();
    familEndDate.setDate(familEndDate.getDate() + days);

    const { data, error } = await supabaseAdmin
      .from('chatter_creator_assignments')
      .insert({
        chatter_id: req.params.id,
        creator_id: creatorId,
        shift_id: shiftId || null,
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
    const { description } = req.body;
    if (!description) return res.status(400).json({ error: 'Description is required' });

    const { data, error } = await supabaseAdmin
      .from('chatter_penalties')
      .insert({
        chatter_id: req.params.id,
        description,
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
