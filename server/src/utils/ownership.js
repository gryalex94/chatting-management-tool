const { supabaseAdmin } = require('./supabase');

// supabaseAdmin bypasses RLS, so every id a route is handed must be checked
// against the caller's org. Returns the row (default: just id) or null.
async function ownedBy(table, id, orgId, cols = 'id') {
  if (!id || !orgId) return null;
  const { data } = await supabaseAdmin
    .from(table).select(cols).eq('id', id).eq('organisation_id', orgId).maybeSingle();
  return data || null;
}

// True when every provided id belongs to the org. Empty ids are skipped
// (optional fields); pass [table, id] pairs.
async function allOwned(orgId, refs) {
  const checks = refs.filter(([, id]) => id).map(([table, id]) => ownedBy(table, id, orgId));
  return (await Promise.all(checks)).every(Boolean);
}

module.exports = { ownedBy, allOwned };
