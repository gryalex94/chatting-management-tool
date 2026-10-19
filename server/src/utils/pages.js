/**
 * Pages (the `creators` table) and the platform each belongs to (032_platforms.sql).
 */
const { supabaseAdmin } = require('./supabase');

const PLATFORMS = ['onlyfans', 'fanvue', 'fansly'];
const isPlatform = (p) => PLATFORMS.includes(p);

// Every new page starts with these three shifts (Amsterdam time).
const DEFAULT_SHIFTS = [
  { name: 'US Prime Shift', start_time: '02:00:00', end_time: '10:00:00' },
  { name: 'Middle Shift', start_time: '10:00:00', end_time: '18:00:00' },
  { name: 'EU Prime Shift', start_time: '18:00:00', end_time: '02:00:00' },
];

// Before database change 032 there is no platform column: every page is OnlyFans.
const noPlatformColumn = (e) => /platform/.test(String(e?.message || '')) && /column|schema cache/.test(String(e?.message || ''));

/** A new page on a platform, with its three default shifts. */
async function createPage({ name, organisationId, platform = 'onlyfans' }) {
  let { data, error } = await supabaseAdmin.from('creators').insert({ name, organisation_id: organisationId, platform }).select().single();
  if (error && noPlatformColumn(error) && platform === 'onlyfans') {
    ({ data, error } = await supabaseAdmin.from('creators').insert({ name, organisation_id: organisationId }).select().single());
  }
  if (error) throw error;
  // The page's own shifts are on its platform (that column comes with database change 034).
  const rows = DEFAULT_SHIFTS.map(s => ({ ...s, creator_id: data.id, organisation_id: organisationId, is_default: true, shift_type: 'regular', platform }));
  const { error: e2 } = await supabaseAdmin.from('shifts').insert(rows);
  if (e2 && noPlatformColumn(e2)) await supabaseAdmin.from('shifts').insert(rows.map(({ platform: _p, ...r }) => r));
  return data;
}

module.exports = { PLATFORMS, isPlatform, createPage, noPlatformColumn };
