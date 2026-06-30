const { supabaseAdmin } = require('./supabase');

// Find or create a creator (page) by name, returns the ID.
// Every real page is its own active row keeping its own stats — grouping pages
// into a team (merged_into) never renames or deactivates them — so a plain exact
// match on the active page is always correct. (Older builds also matched inside
// concatenated "A + B" names; that collapsed several pages onto one id and made
// same-day stats overwrite each other, so it was removed.)
async function findOrCreateCreator(name, orgId) {
  if (!name || !name.trim()) return null;
  const trimmed = name.trim();

  // Exact match against an active page.
  const { data: exact } = await supabaseAdmin
    .from('creators')
    .select('id')
    .eq('organisation_id', orgId)
    .ilike('name', trimmed)
    .neq('is_active', false)
    .limit(1);

  if (exact && exact.length > 0) return exact[0].id;

  // No match — create new
  const { data: created, error } = await supabaseAdmin
    .from('creators')
    .insert({ name: trimmed, organisation_id: orgId })
    .select('id')
    .single();

  if (error) {
    console.error(`Failed to create creator "${trimmed}":`, error.message);
    return null;
  }

  // Auto-create default shifts for the new creator
  const defaults = [
    { name: 'US Prime Shift', start_time: '02:00:00', end_time: '10:00:00' },
    { name: 'Middle Shift', start_time: '10:00:00', end_time: '18:00:00' },
    { name: 'EU Prime Shift', start_time: '18:00:00', end_time: '02:00:00' },
  ];
  await supabaseAdmin.from('shifts').insert(
    defaults.map(s => ({ ...s, creator_id: created.id, organisation_id: orgId, is_default: true, shift_type: 'regular' }))
  );

  console.log(`Auto-created creator: ${trimmed} (with default shifts)`);
  return created.id;
}

// Find or create a chatter by name, returns the ID
async function findOrCreateChatter(name, orgId, email) {
  if (!name || !name.trim()) return null;
  const trimmed = name.trim();

  const { data: existing } = await supabaseAdmin
    .from('chatters')
    .select('id')
    .eq('organisation_id', orgId)
    .ilike('name', trimmed)
    .limit(1);

  if (existing && existing.length > 0) return existing[0].id;

  const { data: created, error } = await supabaseAdmin
    .from('chatters')
    .insert({
      name: trimmed,
      email: email || null,
      status: 'new',
      organisation_id: orgId,
    })
    .select('id')
    .single();

  if (error) {
    console.error(`Failed to create chatter "${trimmed}":`, error.message);
    return null;
  }

  console.log(`Auto-created chatter: ${trimmed}`);
  return created.id;
}

// Build lookup maps for all unique names in a dataset
async function buildLookupMaps(rows, orgId, { creatorField, chatterField, chatterEmailField }) {
  const creatorNames = new Set();
  const chatterNames = new Map();

  rows.forEach(row => {
    if (creatorField && row[creatorField]) creatorNames.add(row[creatorField].trim());
    if (chatterField && row[chatterField]) {
      const name = row[chatterField].trim();
      const email = chatterEmailField ? row[chatterEmailField] : null;
      if (!chatterNames.has(name)) chatterNames.set(name, email);
    }
  });

  const creatorMap = {};
  const chatterMap = {};

  for (const name of creatorNames) {
    creatorMap[name] = await findOrCreateCreator(name, orgId);
  }

  for (const [name, email] of chatterNames) {
    chatterMap[name] = await findOrCreateChatter(name, orgId, email);
  }

  return { creatorMap, chatterMap };
}

module.exports = { findOrCreateCreator, findOrCreateChatter, buildLookupMaps };