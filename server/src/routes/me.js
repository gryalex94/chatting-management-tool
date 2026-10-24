const express = require('express');
const { myStats, chatterOfUser, chatterById } = require('../utils/myStats');

const router = express.Router();
const ROLES = ['chatter', 'va', 'manager', 'head_manager', 'admin', 'owner'];
const isStaff = (u) => ROLES.indexOf(u.role) >= ROLES.indexOf('va');
const DAY = /^\d{4}-\d{2}-\d{2}$/;

// GET /api/me/stats?from=YYYY-MM-DD&to=YYYY-MM-DD[&chatter_id=] → the My stats page.
// A chatter gets their own only (chatter_id is ignored for them); staff may pass a chatter_id
// to see the page as that chatter does.
router.get('/stats', async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!DAY.test(String(from || '')) || !DAY.test(String(to || '')) || from > to) return res.status(400).json({ error: 'Pick the days' });
    if ((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000 > 92) return res.status(400).json({ error: 'Pick at most three months' });
    const chatter = req.query.chatter_id && isStaff(req.user)
      ? await chatterById(req.user.organisationId, String(req.query.chatter_id))
      : await chatterOfUser(req.user);
    if (!chatter) return res.json({ linked: false });
    res.json({ linked: true, preview: chatter && req.query.chatter_id && isStaff(req.user) ? true : false, ...(await myStats(req.user.organisationId, chatter, { from, to })) });
  } catch (e) {
    console.error('[me/stats]', e);
    res.status(500).json({ error: 'Could not load your stats' });
  }
});

module.exports = router;
