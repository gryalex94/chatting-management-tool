const { supabaseAdmin } = require('../utils/supabase');

// "Couldn't check right now" — the app keeps the person logged in and tries again,
// instead of treating a hiccup as a finished login (which sent people to log in again).
const UNREACHABLE = 'Could not check your login just now. Try again in a moment.';

// A session token checked with Supabase is trusted for a minute: every request
// used to ask Supabase again, so any blip there looked like an expired login.
const TOKEN_TTL_MS = 60 * 1000;
const checked = new Map();                // token -> { user, at }

/**
 * Check a session token. Returns { user } when it's valid, { invalid: true } when
 * Supabase says it isn't (expired, signed out), and { unreachable: true } when
 * Supabase couldn't be asked or didn't answer properly (network, 5xx, rate limit).
 */
async function verifyToken(token) {
  const hit = checked.get(token);
  if (hit && Date.now() - hit.at < TOKEN_TTL_MS) return { user: hit.user };
  let data, error;
  try { ({ data, error } = await supabaseAdmin.auth.getUser(token)); }
  catch (e) { return { unreachable: true, error: e }; }
  if (data?.user) {
    if (checked.size > 1000) checked.clear();
    checked.set(token, { user: data.user, at: Date.now() });
    return { user: data.user };
  }
  const status = Number(error?.status) || 0;
  if (!status || status >= 500 || status === 429) return { unreachable: true, error };
  return { invalid: true, error };
}

// A profile lookup that failed for a reason other than "no such row" is a blip too.
const profileMissing = (error) => !error || error.code === 'PGRST116';

// Verify the JWT token from the request header
async function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];

    // Verify the token with Supabase
    const { user, unreachable, error } = await verifyToken(token);
    if (unreachable) {
      console.warn('[auth] could not verify a token:', error?.status || '', error?.message || error);
      return res.status(503).json({ error: UNREACHABLE });
    }
    if (!user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // Get the user's profile from our users table
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('users')
      .select('*, organisations(*)')
      .eq('auth_id', user.id)
      .single();

    if (!profile && !profileMissing(profileError)) {
      console.warn('[auth] profile lookup failed:', profileError.message);
      return res.status(503).json({ error: UNREACHABLE });
    }
    if (profileError || !profile) {
      return res.status(403).json({ error: 'User profile not found. Complete registration first.' });
    }
    // A deactivated staff member's session token stays valid with Supabase, so
    // access has to be cut here, on every request.
    if (profile.is_active === false) {
      return res.status(403).json({ error: 'This account has been deactivated.' });
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

module.exports = { authMiddleware, requireRole, requireMinRole, verifyToken, profileMissing, UNREACHABLE };
