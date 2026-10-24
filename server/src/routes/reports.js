const router = require('express').Router();
const { requireMinRole } = require('../middleware/auth');
const Stats = require('../utils/fanslyStats');
const OF = require('../utils/ofReports');

// Creator reports per platform (the Fansly one lives at /api/fansly/reports). Money: managers and up.
router.use(requireMinRole('manager'));

const fail = (res, e, what) => { console.error(`[reports] ${what}:`, e.message); res.status(500).json({ error: `Could not ${what}` }); };
function range(q) {
  const day = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null);
  let to = day(q.to) || Stats.amsDay(new Date()), from = day(q.from) || Stats.addDays(to, -6);
  if (from > to) [from, to] = [to, from];
  if (Date.parse(to) - Date.parse(from) > 800 * 86400000) from = Stats.addDays(to, -800);
  return { from, to, accounts: String(q.accounts || '').split(',').filter(x => /^[0-9a-f-]{36}$/i.test(x)), gross: q.gross === '1' };
}

// GET /api/reports/onlyfans/pages → the OnlyFans pages to pick from
router.get('/onlyfans/pages', async (req, res) => {
  try { res.json({ accounts: await OF.ofPages(req.user.organisationId) }); } catch (e) { fail(res, e, 'load the pages'); }
});

// GET /api/reports/onlyfans?from&to&accounts=<id,id>&gross=1 → the OnlyFans Creator reports
router.get('/onlyfans', async (req, res) => {
  try { res.json(await OF.report(req.user.organisationId, range(req.query))); } catch (e) { fail(res, e, 'load the report'); }
});

module.exports = router;
