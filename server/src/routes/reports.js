const router = require('express').Router();
const { requireMinRole } = require('../middleware/auth');
const Stats = require('../utils/fanslyStats');
const OF = require('../utils/ofReports');
const FV = require('../utils/fanvueReports');
const MD = require('../utils/messagesDash');
const { buildPlatformOverview } = require('../utils/platformOverview');

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

// GET /api/reports/fanvue/pages, GET /api/reports/fanvue?from&to&accounts&gross → the Fanvue Creator reports
router.get('/fanvue/pages', async (req, res) => {
  try { res.json({ accounts: (await FV.fanvuePages(req.user.organisationId)).map(p => ({ id: p.id, page: p.page })) }); } catch (e) { fail(res, e, 'load the pages'); }
});
router.get('/fanvue', async (req, res) => {
  try { res.json(await FV.report(req.user.organisationId, range(req.query))); } catch (e) { fail(res, e, 'load the report'); }
});

// GET /api/reports/:platform/daily?date= → the Daily overview for Fansly or Fanvue (OnlyFans: /api/daily-check/overview)
router.get('/:platform/daily', async (req, res) => {
  if (!['fansly', 'fanvue'].includes(req.params.platform)) return res.status(404).json({ error: 'No such platform' });
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date || '')) ? String(req.query.date) : Stats.addDays(Stats.amsDay(new Date()), -1);
  try { res.json(await buildPlatformOverview(req.user.organisationId, req.params.platform, date)); } catch (e) { fail(res, e, 'build the overview'); }
});

// ---------- the Messages dashboard for OnlyFans and Fanvue (Fansly's lives at /api/fansly/messages) ----------
const md = (req, res) => { const p = MD.PLATFORM[req.params.platform]; if (!p) res.status(404).json({ error: 'No such platform' }); return p; };

// GET /api/reports/:platform/messages?account&chatter&from&to&q&fan&price_min&price_max&purchased&status&replied&page&size
router.get('/:platform/messages', async (req, res) => {
  const p = md(req, res); if (!p) return;
  try { res.json(await p.list(req.user.organisationId, MD.filters(req.query))); } catch (e) { fail(res, e, 'load the messages'); }
});
// GET /api/reports/:platform/messages/filters → the pages and the senders to filter by
router.get('/:platform/messages/filters', async (req, res) => {
  const p = md(req, res); if (!p) return;
  try { res.json(await p.filters(req.user.organisationId)); } catch (e) { fail(res, e, 'load the filters'); }
});
// GET /api/reports/:platform/messages/recipients?q= → fans to filter by ("Sent to")
router.get('/:platform/messages/recipients', async (req, res) => {
  const p = md(req, res); if (!p) return;
  try { res.json({ fans: await p.recipients(req.user.organisationId, String(req.query.q || '').trim().slice(0, 40)) }); } catch (e) { fail(res, e, 'find the fan'); }
});
// GET /api/reports/:platform/messages/conversation?account&fan → the whole chat with one fan
router.get('/:platform/messages/conversation', async (req, res) => {
  const p = md(req, res); if (!p) return;
  try {
    const out = await p.conversation(req.user.organisationId, String(req.query.account || ''), String(req.query.fan || '').slice(0, 80));
    if (!out) return res.status(404).json({ error: 'No such chat' });
    res.json(out);
  } catch (e) { fail(res, e, 'load the conversation'); }
});
// GET /api/reports/:platform/messages.csv → the same filter as a spreadsheet
router.get('/:platform/messages.csv', async (req, res) => {
  const p = md(req, res); if (!p) return;
  try {
    const { rows } = await p.list(req.user.organisationId, MD.filters(req.query), { csv: true });
    const cols = ['sent_at', 'page', 'chatter', 'fan_username', 'fan_nickname', 'prev_fan_text', 'message', 'reply_s', 'price', 'sold_net', 'unsent_at'];
    const esc = (v) => (v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.send('\ufeff' + [cols.join(','), ...rows.map(r => cols.map(c => esc(r[c])).join(','))].join('\n'));
  } catch (e) { fail(res, e, 'export the messages'); }
});

module.exports = router;
