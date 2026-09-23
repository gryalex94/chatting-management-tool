const router = require('express').Router();
const { supabaseAdmin } = require('../utils/supabase');
const { requireMinRole } = require('../middleware/auth');
const { ASSIGNABLE, canManage } = require('../utils/roles');

// Org settings are readable by every role (the app needs e.g. the time offset for
// everyone), so they must never hold a credential. API keys — including the
// Infloww key — live only in the server's environment variables.
const SECRET_KEY_RE = /(api[_-]?key|secret|token|password|credential|private)/i;

// GET /api/organisations/config - org-wide preferences (key/value), e.g. the
// manual Infloww time offset used to align task timestamps with the chat screen.
router.get('/config', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('daily_check_config')
      .select('key, value')
      .eq('organisation_id', req.user.organisationId);
    if (error) return res.status(500).json({ error: error.message });
    const config = {};
    (data || []).forEach(r => { if (!SECRET_KEY_RE.test(r.key)) config[r.key] = r.value; });
    res.json({ config });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch config' });
  }
});

// PUT /api/organisations/config - set one preference (admin). Body { key, value }.
router.put('/config', requireMinRole('admin'), async (req, res) => {
  try {
    const { key, value } = req.body;
    if (!key) return res.status(400).json({ error: 'key is required' });
    if (SECRET_KEY_RE.test(key)) {
      return res.status(400).json({ error: "Credentials can't be stored in settings — they belong in the server's environment variables." });
    }
    const orgId = req.user.organisationId;
    const { data: existing } = await supabaseAdmin
      .from('daily_check_config').select('id')
      .eq('organisation_id', orgId).eq('key', key).maybeSingle();
    if (existing) {
      await supabaseAdmin.from('daily_check_config')
        .update({ value: String(value), updated_at: new Date().toISOString() }).eq('id', existing.id);
    } else {
      await supabaseAdmin.from('daily_check_config')
        .insert({ organisation_id: orgId, key, value: String(value) });
    }
    res.json({ ok: true, key, value: String(value) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save config' });
  }
});

// GET /api/organisations/mine - Get current user's org
router.get('/mine', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('organisations')
      .select('*')
      .eq('id', req.user.organisationId)
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch organisation' });
  }
});

// GET /api/organisations/members - Get all members of the org
router.get('/members', requireMinRole('va'), async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('id, email, name, role, is_active, created_at')
      .eq('organisation_id', req.user.organisationId)
      .order('created_at', { ascending: true });

    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch members' });
  }
});

// PATCH /api/organisations/members/:id — deactivate / reactivate a staff member,
// or change their role. Admin+ only, and only for people ranked below you.
// Deactivating also bans the login in Supabase Auth, so the person can't sign in
// or refresh a session; the auth middleware already refuses them on every request.
router.patch('/members/:id', requireMinRole('admin'), async (req, res) => {
  try {
    const orgId = req.user.organisationId;
    const { is_active, role } = req.body;
    const { data: target } = await supabaseAdmin.from('users')
      .select('id, auth_id, name, role, is_active').eq('id', req.params.id).eq('organisation_id', orgId).maybeSingle();
    if (!target) return res.status(404).json({ error: 'Not found' });
    if (!canManage(req.user, target)) {
      return res.status(403).json({ error: target.id === req.user.id ? "You can't change your own account here." : `You can't change a ${target.role.replace('_', ' ')}.` });
    }

    const update = {};
    if (role !== undefined && role !== target.role) {
      if (!(ASSIGNABLE[req.user.role] || []).includes(role)) {
        return res.status(403).json({ error: `Your role (${req.user.role}) cannot give the ${role} role.` });
      }
      update.role = role;
    }
    if (is_active !== undefined && !!is_active !== (target.is_active !== false)) update.is_active = !!is_active;
    if (!Object.keys(update).length) return res.json({ ok: true, unchanged: true });

    if ('is_active' in update && target.auth_id) {
      const { error: banErr } = await supabaseAdmin.auth.admin.updateUserById(target.auth_id, { ban_duration: update.is_active ? 'none' : '876000h' });
      if (banErr) return res.status(500).json({ error: banErr.message });
    }
    const { data, error } = await supabaseAdmin.from('users').update(update)
      .eq('id', target.id).eq('organisation_id', orgId).select('id, name, email, role, is_active').single();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err) {
    console.error('Update member error:', err.message);
    res.status(500).json({ error: 'Failed to update member' });
  }
});

// GET /api/organisations/invitations — pending, unexpired invitations (admin+).
router.get('/invitations', requireMinRole('admin'), async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin.from('invitations')
      .select('id, email, role, created_at, expires_at')
      .eq('organisation_id', req.user.organisationId).eq('status', 'pending')
      .gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data || []);
  } catch {
    res.status(500).json({ error: 'Failed to load invitations' });
  }
});

// DELETE /api/organisations/invitations/:id — revoke a pending invitation, so
// its link stops working immediately instead of staying valid for 7 days.
router.delete('/invitations/:id', requireMinRole('admin'), async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin.from('invitations').update({ status: 'expired' })
      .eq('id', req.params.id).eq('organisation_id', req.user.organisationId).eq('status', 'pending').select('id');
    if (error) return res.status(500).json({ error: error.message });
    if (!data?.length) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Failed to revoke invitation' });
  }
});

module.exports = router;
