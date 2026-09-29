const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../utils/supabase');
const { requireMinRole } = require('../middleware/auth');
const { draftRules, forgetHouseRules, newFeedbackCount, RULE_AREAS } = require('../ai/houseRules');

// The AI Rules page: lasting rules for the daily review (houseRules.js). Everyone
// on the staff can read them; only the owner/admins add, approve or change them.

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const MISSING = 'Run migration 024 (AI rules) in Supabase to turn this on';

// Page belongs to this organisation? Returns its id, null for "every page", or
// undefined when it's not one of ours.
async function pageId(orgId, creatorId) {
  if (!creatorId) return null;
  const { data } = await supabaseAdmin.from('creators').select('id').eq('organisation_id', orgId).eq('id', creatorId).maybeSingle();
  return data ? data.id : undefined;
}

// GET /api/ai-rules — every rule, the pages (with their facts), when the notes were
// last drafted, and how many new dismissals are waiting to be read.
router.get('/', async (req, res) => {
  try {
    const orgId = req.user.organisationId;
    const [{ data: rules, error }, { data: pages }, { data: org }] = await Promise.all([
      supabaseAdmin.from('ai_rules').select('*').eq('organisation_id', orgId).order('created_at', { ascending: false }),
      supabaseAdmin.from('creators').select('id, name, is_active, ai_context, ai_instructions').eq('organisation_id', orgId).order('name'),
      supabaseAdmin.from('organisations').select('ai_rules_drafted_at').eq('id', orgId).maybeSingle(),
    ]);
    if (error) return res.json({ ready: false, message: MISSING, rules: [], pages: pages || [] });
    const draftedAt = org?.ai_rules_drafted_at || null;
    res.json({ ready: true, rules: rules || [], pages: pages || [], drafted_at: draftedAt, new_feedback: await newFeedbackCount(orgId, draftedAt) });
  } catch {
    res.status(500).json({ error: 'Could not load the rules' });
  }
});

// POST /api/ai-rules { rule, creator_id?, area? } — a rule written by hand: in use straight away.
router.post('/', requireMinRole('admin'), async (req, res) => {
  try {
    const orgId = req.user.organisationId;
    const rule = clean(req.body.rule);
    if (rule.length < 3 || rule.length > 600) return res.status(400).json({ error: 'Write the rule in 3 to 600 characters' });
    const cid = await pageId(orgId, req.body.creator_id);
    if (cid === undefined) return res.status(400).json({ error: 'Unknown page' });
    const area = RULE_AREAS.has(req.body.area) ? req.body.area : null;
    const now = new Date().toISOString();
    const { data, error } = await supabaseAdmin.from('ai_rules').insert({
      organisation_id: orgId, creator_id: cid, area, rule, status: 'active', source: 'manual',
      created_by: req.user.id, decided_by: req.user.id, decided_at: now,
    }).select().single();
    if (error) return res.status(500).json({ error: /ai_rules/.test(error.message) ? MISSING : 'Could not save the rule' });
    forgetHouseRules(orgId);
    res.json(data);
  } catch {
    res.status(500).json({ error: 'Could not save the rule' });
  }
});

// POST /api/ai-rules/draft — read the new dismissals now and propose rules.
router.post('/draft', requireMinRole('admin'), async (req, res) => {
  try {
    const out = await draftRules(req.user.organisationId);
    if (out.skipped) return res.status(409).json({ error: 'Already drafting — give it a minute' });
    res.json(out);
  } catch (e) {
    console.error('[aiRules] draft:', e.message);
    res.status(500).json({ error: /migration 024/.test(e.message) ? MISSING : 'Drafting failed — try again in a minute' });
  }
});

// PATCH /api/ai-rules/:id { action: 'approve' | 'reject' | 'retire' | 'restore' | 'edit', rule?, creator_id?, area? }
// approve / edit can change the wording and the page in the same call. Approving
// a rule that refines an older one retires the older one.
router.patch('/:id', requireMinRole('admin'), async (req, res) => {
  try {
    const orgId = req.user.organisationId;
    const { data: cur } = await supabaseAdmin.from('ai_rules').select('*').eq('id', req.params.id).eq('organisation_id', orgId).maybeSingle();
    if (!cur) return res.status(404).json({ error: 'Rule not found' });
    const now = new Date().toISOString();
    const update = { updated_at: now };
    if (req.body.rule !== undefined) {
      const rule = clean(req.body.rule);
      if (rule.length < 3 || rule.length > 600) return res.status(400).json({ error: 'Write the rule in 3 to 600 characters' });
      update.rule = rule;
    }
    if (req.body.creator_id !== undefined) {
      const cid = await pageId(orgId, req.body.creator_id);
      if (cid === undefined) return res.status(400).json({ error: 'Unknown page' });
      update.creator_id = cid;
    }
    if (req.body.area !== undefined) update.area = RULE_AREAS.has(req.body.area) ? req.body.area : null;
    const action = req.body.action;
    const decide = (status) => Object.assign(update, { status, decided_by: req.user.id, decided_at: now });
    if (action === 'approve') decide('active');
    else if (action === 'reject') decide('rejected');
    else if (action === 'retire') decide('retired');
    else if (action === 'restore') decide(cur.status === 'rejected' ? 'proposed' : 'active');
    else if (action !== 'edit') return res.status(400).json({ error: 'Invalid action' });

    const { data, error } = await supabaseAdmin.from('ai_rules').update(update).eq('id', cur.id).eq('organisation_id', orgId).select().single();
    if (error) return res.status(500).json({ error: 'Could not update the rule' });
    if (action === 'approve' && cur.replaces) {
      await supabaseAdmin.from('ai_rules').update({ status: 'retired', decided_by: req.user.id, decided_at: now, updated_at: now })
        .eq('id', cur.replaces).eq('organisation_id', orgId).eq('status', 'active');
    }
    forgetHouseRules(orgId);
    res.json(data);
  } catch {
    res.status(500).json({ error: 'Could not update the rule' });
  }
});

// DELETE /api/ai-rules/:id — only rules that aren't in use (retire those first).
router.delete('/:id', requireMinRole('admin'), async (req, res) => {
  try {
    const orgId = req.user.organisationId;
    const { error, count } = await supabaseAdmin.from('ai_rules').delete({ count: 'exact' })
      .eq('id', req.params.id).eq('organisation_id', orgId).neq('status', 'active');
    if (error) return res.status(500).json({ error: 'Could not delete the rule' });
    if (!count) return res.status(400).json({ error: 'Retire a rule in use before deleting it' });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Could not delete the rule' });
  }
});

module.exports = router;
