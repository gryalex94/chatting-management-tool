const { supabaseAdmin } = require('../utils/supabase');

// Verify the JWT token from the request header
async function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];

    // Verify the token with Supabase
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // Get the user's profile from our users table
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('users')
      .select('*, organisations(*)')
      .eq('auth_id', user.id)
      .single();

    if (profileError || !profile) {
      return res.status(403).json({ error: 'User profile not found. Complete registration first.' });
    }

    // Attach user info to request
    req.user = {
      authId: user.id,
      email: user.email,
      id: profile.id,
      name: profile.name,
      role: profile.role,
      organisationId: profile.organisation_id,
      organisation: profile.organisations,
    };

    next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    res.status(500).json({ error: 'Authentication failed' });
  }
}

// Check if user has required role
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

// Check if user is at least a certain role level
function requireMinRole(minRole) {
  const roleHierarchy = ['chatter', 'va', 'manager', 'head_manager', 'admin', 'owner'];
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    const userLevel = roleHierarchy.indexOf(req.user.role);
    const requiredLevel = roleHierarchy.indexOf(minRole);
    if (userLevel < requiredLevel) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

module.exports = { authMiddleware, requireRole, requireMinRole };
