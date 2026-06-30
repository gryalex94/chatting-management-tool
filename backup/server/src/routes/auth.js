const router = require('express').Router();
const { supabaseAdmin } = require('../utils/supabase');

// POST /api/auth/setup - Initial setup: create org + owner account
// This is called once to bootstrap the system
router.post('/setup', async (req, res) => {
  try {
    const { email, password, name, orgName } = req.body;

    if (!email || !password || !name || !orgName) {
      return res.status(400).json({ error: 'Email, password, name, and organisation name are required' });
    }

    // Check if any org exists already
    const { data: existingOrgs } = await supabaseAdmin.from('organisations').select('id').limit(1);
    // Allow multiple orgs — skip this check for now

    // 1. Create Supabase auth user
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (authError) {
      return res.status(400).json({ error: authError.message });
    }

    // 2. Create organisation
    const { data: org, error: orgError } = await supabaseAdmin
      .from('organisations')
      .insert({ name: orgName })
      .select()
      .single();

    if (orgError) {
      return res.status(500).json({ error: 'Failed to create organisation: ' + orgError.message });
    }

    // 3. Create user profile as owner
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .insert({
        auth_id: authData.user.id,
        email,
        name,
        role: 'owner',
        organisation_id: org.id,
      })
      .select()
      .single();

    if (userError) {
      return res.status(500).json({ error: 'Failed to create user profile: ' + userError.message });
    }

    res.status(201).json({
      message: 'Setup complete',
      organisation: org,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });
  } catch (err) {
    console.error('Setup error:', err);
    res.status(500).json({ error: 'Setup failed' });
  }
});

// POST /api/auth/login - Get user profile after Supabase auth
// Frontend handles the actual login with Supabase client
// This endpoint returns the user profile
router.post('/login', async (req, res) => {
  try {
    const { authId } = req.body;

    if (!authId) {
      return res.status(400).json({ error: 'Auth ID required' });
    }

    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('*, organisations(*)')
      .eq('auth_id', authId)
      .single();

    if (error || !user) {
      return res.status(404).json({ error: 'User profile not found' });
    }

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        organisationId: user.organisation_id,
        organisation: user.organisations,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// POST /api/auth/invite - Send invitation (admin/head_manager only)
router.post('/invite', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'No token' });

    const token = authHeader.split(' ')[1];
    const { data: { user: authUser } } = await supabaseAdmin.auth.getUser(token);
    if (!authUser) return res.status(401).json({ error: 'Invalid token' });

    const { data: inviter } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('auth_id', authUser.id)
      .single();

    if (!inviter) return res.status(403).json({ error: 'User not found' });

    const { email, role } = req.body;
    if (!email || !role) {
      return res.status(400).json({ error: 'Email and role are required' });
    }

    // Check permissions: who can invite whom
    const canInvite = {
      owner: ['admin', 'head_manager', 'manager', 'chatter', 'va'],
      admin: ['admin', 'head_manager', 'manager', 'chatter', 'va'],
      head_manager: ['chatter', 'va'],
    };

    const allowedRoles = canInvite[inviter.role] || [];
    if (!allowedRoles.includes(role)) {
      return res.status(403).json({ error: `Your role (${inviter.role}) cannot invite ${role}` });
    }

    // Create invitation
    const { data: invitation, error } = await supabaseAdmin
      .from('invitations')
      .insert({
        email,
        role,
        organisation_id: inviter.organisation_id,
        invited_by: inviter.id,
      })
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: 'Failed to create invitation: ' + error.message });
    }

    res.status(201).json({
      message: 'Invitation created',
      invitation: {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        token: invitation.token,
        expiresAt: invitation.expires_at,
      },
    });
  } catch (err) {
    console.error('Invite error:', err);
    res.status(500).json({ error: 'Invitation failed' });
  }
});

// POST /api/auth/accept-invite - Accept invitation and create account
router.post('/accept-invite', async (req, res) => {
  try {
    const { token, password, name } = req.body;

    if (!token || !password || !name) {
      return res.status(400).json({ error: 'Token, password, and name are required' });
    }

    // Find the invitation
    const { data: invitation, error: invError } = await supabaseAdmin
      .from('invitations')
      .select('*')
      .eq('token', token)
      .eq('status', 'pending')
      .single();

    if (invError || !invitation) {
      return res.status(404).json({ error: 'Invalid or expired invitation' });
    }

    // Check if expired
    if (new Date(invitation.expires_at) < new Date()) {
      await supabaseAdmin
        .from('invitations')
        .update({ status: 'expired' })
        .eq('id', invitation.id);
      return res.status(400).json({ error: 'Invitation has expired' });
    }

    // Create Supabase auth user
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: invitation.email,
      password,
      email_confirm: true,
    });

    if (authError) {
      return res.status(400).json({ error: authError.message });
    }

    // Create user profile
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .insert({
        auth_id: authData.user.id,
        email: invitation.email,
        name,
        role: invitation.role,
        organisation_id: invitation.organisation_id,
        invited_by: invitation.invited_by,
      })
      .select()
      .single();

    if (userError) {
      return res.status(500).json({ error: 'Failed to create user: ' + userError.message });
    }

    // Mark invitation as accepted
    await supabaseAdmin
      .from('invitations')
      .update({ status: 'accepted' })
      .eq('id', invitation.id);

    res.status(201).json({
      message: 'Account created',
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });
  } catch (err) {
    console.error('Accept invite error:', err);
    res.status(500).json({ error: 'Failed to accept invitation' });
  }
});

// POST /api/auth/create-member - Directly create a team member (admin+)
router.post('/create-member', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'No token' });

    const token = authHeader.split(' ')[1];
    const { data: { user: authUser } } = await supabaseAdmin.auth.getUser(token);
    if (!authUser) return res.status(401).json({ error: 'Invalid token' });

    const { data: creator } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('auth_id', authUser.id)
      .single();

    if (!creator) return res.status(403).json({ error: 'User not found' });

    const canCreate = ['owner', 'admin', 'head_manager'].includes(creator.role);
    if (!canCreate) return res.status(403).json({ error: 'Insufficient permissions' });

    const { email, password, name, role } = req.body;
    if (!email || !password || !name || !role) {
      return res.status(400).json({ error: 'Email, password, name, and role are required' });
    }

    // Head managers can only create chatters/VAs
    if (creator.role === 'head_manager' && !['chatter', 'va'].includes(role)) {
      return res.status(403).json({ error: 'Head managers can only create chatters and VAs' });
    }

    // Create Supabase auth user
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (authError) return res.status(400).json({ error: authError.message });

    // Create user profile
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .insert({
        auth_id: authData.user.id,
        email,
        name,
        role,
        organisation_id: creator.organisation_id,
        invited_by: creator.id,
      })
      .select()
      .single();

    if (userError) return res.status(500).json({ error: userError.message });

    res.status(201).json({
      message: 'Member created',
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });
  } catch (err) {
    console.error('Create member error:', err);
    res.status(500).json({ error: 'Failed to create member' });
  }
});

module.exports = router;
