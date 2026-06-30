const router = require('express').Router();
const { supabaseAdmin } = require('../utils/supabase');
const { requireMinRole } = require('../middleware/auth');

// GET /api/tasks - List tasks with filters
router.get('/', async (req, res) => {
  try {
    const { status, priority, chatter_id, cycle_id, task_type } = req.query;

    let query = supabaseAdmin
      .from('tasks')
      .select(`
        *,
        creator:creators(id, name),
        chatter:chatters(id, name, status),
        assigned_user:users!tasks_assigned_to_fkey(id, name),
        claimed_user:users!tasks_claimed_by_fkey(id, name),
        task_attachments(id, attachment_type, file_url, label, created_at)
      `)
      .eq('organisation_id', req.user.organisationId)
      .order('priority', { ascending: true })
      .order('created_at', { ascending: false });

    if (status) query = query.eq('status', status);
    if (priority) query = query.eq('priority', parseInt(priority));
    if (chatter_id) query = query.eq('chatter_id', chatter_id);
    if (cycle_id) query = query.eq('cycle_id', cycle_id);
    if (task_type) query = query.eq('task_type', task_type);

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

// POST /api/tasks - Create custom task
router.post('/', requireMinRole('manager'), async (req, res) => {
  try {
    const {
      title, description, priority, assigned_to,
      creator_id, chatter_id, is_recurring, recurrence_pattern,
      requires_screenshots, cycle_id
    } = req.body;

    if (!title) return res.status(400).json({ error: 'Title is required' });

    // Get active cycle if not specified
    let activeCycleId = cycle_id;
    if (!activeCycleId) {
      const { data: activeCycles } = await supabaseAdmin
        .from('cycles')
        .select('id')
        .eq('organisation_id', req.user.organisationId)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1);
      activeCycleId = activeCycles?.[0]?.id;
    }

    const { data, error } = await supabaseAdmin
      .from('tasks')
      .insert({
        title,
        description,
        task_type: 'custom',
        priority: priority || 4,
        assigned_to,
        creator_id,
        chatter_id,
        is_recurring: is_recurring || false,
        recurrence_pattern,
        requires_screenshots: requires_screenshots !== false,
        cycle_id: activeCycleId,
        organisation_id: req.user.organisationId,
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create task' });
  }
});
// GET /api/tasks/templates - List task templates
router.get('/templates', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('task_templates')
      .select('*')
      .or(`organisation_id.eq.${req.user.organisationId},organisation_id.is.null`)
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

// POST /api/tasks/templates - Create template
router.post('/templates', requireMinRole('admin'), async (req, res) => {
  try {
    const { label, icon, title, description, priority, sort_order } = req.body;
    if (!label || !title) return res.status(400).json({ error: 'Label and title required' });

    const { data, error } = await supabaseAdmin
      .from('task_templates')
      .insert({
        label, icon: icon || '📝', title, description,
        priority: priority || 3,
        sort_order: sort_order || 0,
        organisation_id: req.user.organisationId,
        created_by: req.user.id,
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create template' });
  }
});

// PUT /api/tasks/templates/:id - Update template
router.put('/templates/:id', requireMinRole('admin'), async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('task_templates')
      .update(req.body)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update template' });
  }
});

// DELETE /api/tasks/templates/:id - Deactivate template
router.delete('/templates/:id', requireMinRole('admin'), async (req, res) => {
  try {
    await supabaseAdmin
      .from('task_templates')
      .update({ is_active: false })
      .eq('id', req.params.id);

    res.json({ message: 'Template removed' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove template' });
  }
});

// POST /api/tasks/:id/claim - Claim a task
router.post('/:id/claim', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('tasks')
      .update({
        status: 'claimed',
        claimed_by: req.user.id,
        claimed_at: new Date().toISOString(),
      })
      .eq('id', req.params.id)
      .eq('status', 'pool')
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(400).json({ error: 'Task already claimed or not in pool' });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to claim task' });
  }
});

// POST /api/tasks/:id/timer - Start/pause/resume/complete timer
router.post('/:id/timer', async (req, res) => {
  try {
    const { action } = req.body; // start, pause, resume, complete
    if (!['start', 'pause', 'resume', 'complete'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action' });
    }

    // Log the timer event
    await supabaseAdmin.from('task_timer_logs').insert({
      task_id: req.params.id,
      user_id: req.user.id,
      action,
    });

    // Update task status
    const statusMap = {
      start: 'in_progress',
      pause: 'in_progress', // status stays in_progress when paused
      resume: 'in_progress',
      complete: 'completed',
    };

    const update = { status: statusMap[action] };
    if (action === 'complete') {
      // Check if screenshots required
      const { data: task } = await supabaseAdmin
        .from('tasks')
        .select('requires_screenshots')
        .eq('id', req.params.id)
        .single();

      if (task?.requires_screenshots) {
        const { data: attachments } = await supabaseAdmin
          .from('task_attachments')
          .select('id')
          .eq('task_id', req.params.id)
          .limit(1);

        if (!attachments || attachments.length === 0) {
          return res.status(400).json({ error: 'Screenshots required before completing this task. Upload at least one good or bad case.' });
        }
      }

      update.completed_at = new Date().toISOString();
    }

    const { data, error } = await supabaseAdmin
      .from('tasks')
      .update(update)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json({ action, task: data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update timer' });
  }
});

// POST /api/tasks/:id/attachments - Upload proof of work
router.post('/:id/attachments', async (req, res) => {
  try {
    const { attachment_type, file_url, label, chatter_id } = req.body;
    if (!attachment_type || !file_url) {
      return res.status(400).json({ error: 'Type and file URL required' });
    }

    const { data, error } = await supabaseAdmin
      .from('task_attachments')
      .insert({
        task_id: req.params.id,
        chatter_id,
        attachment_type,
        file_url,
        label,
        uploaded_by: req.user.id,
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to add attachment' });
  }
});

// GET /api/tasks/:id/timer-logs - Get timer history for a task
router.get('/:id/timer-logs', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('task_timer_logs')
      .select('*, users:user_id(name)')
      .eq('task_id', req.params.id)
      .order('timestamp', { ascending: true });

    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch timer logs' });
  }
});



module.exports = router;
