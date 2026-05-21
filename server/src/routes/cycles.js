const router = require('express').Router();
const { supabaseAdmin } = require('../utils/supabase');
const { requireMinRole } = require('../middleware/auth');

// GET /api/cycles - List all cycles
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('cycles')
      .select('*')
      .eq('organisation_id', req.user.organisationId)
      .order('start_date', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch cycles' });
  }
});

// GET /api/cycles/active - Get current active cycle
router.get('/active', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('cycles')
      .select('*')
      .eq('organisation_id', req.user.organisationId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1);

    if (error || !data || data.length === 0) return res.json(null);
    res.json(data[0]);
    return; // No active cycle
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch active cycle' });
  }
});

// POST /api/cycles/start - Start a new weekly cycle
router.post('/start', requireMinRole('admin'), async (req, res) => {
  try {
    // Check if there's already an active cycle
    const { data: existing } = await supabaseAdmin
      .from('cycles')
      .select('id')
      .eq('organisation_id', req.user.organisationId)
      .eq('status', 'active')
      .limit(1);

    if (existing && existing.length > 0) {
      return res.status(400).json({ error: 'A cycle is already active. Close it first.' });
    }

    const today = new Date();
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() + 7);

    const { data, error } = await supabaseAdmin
      .from('cycles')
      .insert({
        organisation_id: req.user.organisationId,
        start_date: today.toISOString().split('T')[0],
        end_date: endDate.toISOString().split('T')[0],
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to start cycle' });
  }
});

// POST /api/cycles/:id/close - Close the week (owner/admin only)
router.post('/:id/close', requireMinRole('admin'), async (req, res) => {
  try {
    const cycleId = req.params.id;

    // 1. Close the cycle
    const { data: cycle, error: cycleError } = await supabaseAdmin
      .from('cycles')
      .update({
        status: 'closed',
        closed_by: req.user.id,
        closed_at: new Date().toISOString(),
      })
      .eq('id', cycleId)
      .select()
      .single();

    if (cycleError) return res.status(500).json({ error: cycleError.message });

    // 2. Move completed tasks to confirmed (including orphaned tasks without cycle_id)
    await supabaseAdmin
      .from('tasks')
      .update({ status: 'confirmed' })
      .eq('organisation_id', req.user.organisationId)
      .in('cycle_id', [cycleId])
      .eq('status', 'completed');

    // Also confirm orphaned completed tasks
    await supabaseAdmin
      .from('tasks')
      .update({ status: 'confirmed', cycle_id: cycleId })
      .eq('organisation_id', req.user.organisationId)
      .is('cycle_id', null)
      .eq('status', 'completed');

    // 3. Roll over unfinished tasks
    const { data: unfinished } = await supabaseAdmin
      .from('tasks')
      .select('*')
      .eq('cycle_id', cycleId)
      .in('status', ['pool', 'claimed', 'in_progress', 'pending_review']);

    // Start new cycle
    const today = new Date();
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() + 7);

    const { data: newCycle } = await supabaseAdmin
      .from('cycles')
      .insert({
        organisation_id: req.user.organisationId,
        start_date: today.toISOString().split('T')[0],
        end_date: endDate.toISOString().split('T')[0],
      })
      .select()
      .single();

    // Duplicate unfinished tasks into new cycle
    if (unfinished && unfinished.length > 0 && newCycle) {
      const rolledTasks = unfinished.map(task => ({
        title: task.title,
        description: task.description,
        task_type: task.task_type,
        priority: task.priority,
        status: 'pool',
        creator_id: task.creator_id,
        chatter_id: task.chatter_id,
        is_recurring: task.is_recurring,
        recurrence_pattern: task.recurrence_pattern,
        requires_screenshots: task.requires_screenshots,
        rollover_counter: (task.rollover_counter || 0) + 1,
        cycle_id: newCycle.id,
        organisation_id: task.organisation_id,
      }));

      await supabaseAdmin.from('tasks').insert(rolledTasks);

      // Mark old tasks as rolled over
      const oldIds = unfinished.map(t => t.id);
      await supabaseAdmin
        .from('tasks')
        .update({ status: 'rolled_over' })
        .in('id', oldIds);
    }

    res.json({
      message: 'Week closed',
      closedCycle: cycle,
      newCycle,
      rolledOverCount: unfinished?.length || 0,
    });
  } catch (err) {
    console.error('Close cycle error:', err);
    res.status(500).json({ error: 'Failed to close week' });
  }
});

module.exports = router;
