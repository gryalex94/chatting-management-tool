const router = require('express').Router();
const { supabaseAdmin } = require('../utils/supabase');
const { requireMinRole } = require('../middleware/auth');

// GET /api/ai/prompts - List all prompt templates
router.get('/prompts', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('ai_prompt_templates')
      .select('*')
      .eq('organisation_id', req.user.organisationId)
      .order('name');

    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch prompts' });
  }
});

// POST /api/ai/prompts - Create new prompt template
router.post('/prompts', requireMinRole('admin'), async (req, res) => {
  try {
    const { name, description, prompt_text, input_spec, output_format, trigger_type, trigger_config, ai_provider } = req.body;

    const { data, error } = await supabaseAdmin
      .from('ai_prompt_templates')
      .insert({
        name,
        description,
        prompt_text,
        input_spec,
        output_format,
        trigger_type: trigger_type || 'manual',
        trigger_config,
        ai_provider: ai_provider || 'grok',
        created_by: req.user.id,
        updated_by: req.user.id,
        organisation_id: req.user.organisationId,
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });

    // Also save to version history
    await supabaseAdmin.from('ai_prompt_versions').insert({
      template_id: data.id,
      version: 1,
      prompt_text,
      input_spec,
      output_format,
      created_by: req.user.id,
    });

    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create prompt' });
  }
});

// PUT /api/ai/prompts/:id - Update prompt (creates new version)
router.put('/prompts/:id', requireMinRole('admin'), async (req, res) => {
  try {
    const { prompt_text, input_spec, output_format, description, trigger_type, trigger_config, ai_provider } = req.body;

    // Get current version
    const { data: current } = await supabaseAdmin
      .from('ai_prompt_templates')
      .select('version')
      .eq('id', req.params.id)
      .single();

    const newVersion = (current?.version || 0) + 1;

    const { data, error } = await supabaseAdmin
      .from('ai_prompt_templates')
      .update({
        prompt_text,
        input_spec,
        output_format,
        description,
        trigger_type,
        trigger_config,
        ai_provider,
        version: newVersion,
        updated_by: req.user.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });

    // Save version history
    await supabaseAdmin.from('ai_prompt_versions').insert({
      template_id: req.params.id,
      version: newVersion,
      prompt_text,
      input_spec,
      output_format,
      created_by: req.user.id,
    });

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update prompt' });
  }
});

// GET /api/ai/results - List AI analysis results
router.get('/results', async (req, res) => {
  try {
    const { chatter_id, date } = req.query;

    let query = supabaseAdmin
      .from('ai_analysis_results')
      .select('*, chatter:chatters(name), creator:creators(name), template:ai_prompt_templates(name)')
      .eq('organisation_id', req.user.organisationId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (chatter_id) query = query.eq('chatter_id', chatter_id);
    if (date) query = query.eq('report_date', date);

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch results' });
  }
});

module.exports = router;
