const { supabaseAdmin } = require('./supabase');

/**
 * What to call each fan on screen, the way Infloww does: the (editable) name
 * the team sees — "John" — plus how many fans on the same page share that name.
 * A unique name is the best label; a shared one needs the username (u123…) to
 * tell the fans apart (manager feedback, Sep 2026: ~87% of task fans have a
 * name that's unique on their page).
 *
 * pairs: [{ username, creatorId, nickname? }]  (nickname = the name as seen in
 *   today's data; looked up from the latest message when missing)
 * Returns { [username]: { name, shared } } — shared = fans on that page with
 * this name in the last 60 days (1 = unique). Best effort: a failed lookup
 * leaves the fan out, and the UI falls back to the username.
 */
const WINDOW_DAYS = 60;

async function fanNameInfo(orgId, pairs, refDate = null) {
  const out = {};
  const list = pairs.filter(p => p.username && p.creatorId);
  if (!list.length) return out;
  const since = new Date((refDate ? Date.parse(refDate + 'T00:00:00Z') : Date.now()) - WINDOW_DAYS * 86400000).toISOString();

  // Latest name for fans we don't have one for (newest message first).
  const nameOf = {};
  for (const p of list) if (p.nickname && p.nickname !== p.username) nameOf[p.username] ??= String(p.nickname).trim();
  // A chatty fan can fill a whole page of rows, so keep asking for the ones still
  // unnamed; a fan missing from a short (final) page has no messages in the window.
  let missing = [...new Set(list.filter(p => !nameOf[p.username]).map(p => p.username))];
  for (let round = 0; missing.length && round < 20; round++) {
    const chunk = missing.slice(0, 25);
    const { data, error } = await supabaseAdmin.from('messages').select('sent_to_username, sent_to_nickname')
      .eq('organisation_id', orgId).in('sent_to_username', chunk).gte('sent_datetime', since)
      .order('sent_datetime', { ascending: false }).range(0, 999);
    if (error) break;
    for (const m of (data || [])) if (m.sent_to_nickname && !nameOf[m.sent_to_username]) nameOf[m.sent_to_username] = String(m.sent_to_nickname).trim();
    const complete = (data || []).length < 1000;
    missing = missing.filter(u => !nameOf[u] && !(complete && chunk.includes(u)));
  }

  // Per page: how many different fans go by each name.
  const byPage = {};
  for (const p of list) {
    const name = nameOf[p.username];
    if (name) (byPage[p.creatorId] ||= new Set()).add(name);
  }
  const holders = {};   // creatorId|name -> Set(username)
  for (const [creatorId, names] of Object.entries(byPage)) {
    const arr = [...names];
    for (let i = 0; i < arr.length; i += 100) {
      for (let from = 0; from < 5000; from += 1000) {
        const { data, error } = await supabaseAdmin.from('messages').select('sent_to_username, sent_to_nickname')
          .eq('organisation_id', orgId).eq('creator_id', creatorId).in('sent_to_nickname', arr.slice(i, i + 100))
          .gte('sent_datetime', since).order('id', { ascending: true }).range(from, from + 999);
        if (error || !data?.length) break;
        for (const m of data) if (m.sent_to_username) (holders[`${creatorId}|${String(m.sent_to_nickname).trim()}`] ||= new Set()).add(m.sent_to_username);
        if (data.length < 1000) break;
      }
    }
  }

  for (const p of list) {
    const name = nameOf[p.username];
    if (!name) continue;
    const shared = Math.max(1, holders[`${p.creatorId}|${name}`]?.size || 1);
    // A fan on several pages keeps the most cautious (largest) count.
    if (!out[p.username] || shared > out[p.username].shared) out[p.username] = { name, shared };
  }
  return out;
}

module.exports = { fanNameInfo };
