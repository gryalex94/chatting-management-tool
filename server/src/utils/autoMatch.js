const { supabaseAdmin } = require('./supabase');

// Find or create a creator by name, returns the ID
async function findOrCreateCreator(name, orgId) {
  if (!name || !name.trim()) return null;
  const trimmed = name.trim();

  // Try to find existing
  const { data: existing } = await supabaseAdmin
    .from('creators')
    .select('id')
    .eq('organisation_id', orgId)
    .ilike('name', trimmed)
    .limit(1);

  if (existing && existing.length > 0) return existing[0].id;

  // Create new
  const { data: created, error } = await supabaseAdmin
    .from('creators')
    .insert({ name: trimmed, organisation_id: orgId })
    .select('id')
    .single();

  if (error) {
    console.error(`Failed to create creator "${trimmed}":`, error.message);
    return null;
  }

  console.log(`Auto-created creator: ${trimmed}`);
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
  const chatterNames = new Map(); // name -> email

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