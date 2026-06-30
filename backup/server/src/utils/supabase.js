const { createClient } = require('@supabase/supabase-js');

// Admin client (uses service_role key - bypasses RLS)
// Use this for all backend operations
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

// Public client (uses anon key - respects RLS)
// Use this only when you need RLS enforcement
const supabasePublic = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

module.exports = { supabaseAdmin, supabasePublic };
