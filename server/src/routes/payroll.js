const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../utils/supabase');
const { requireMinRole } = require('../middleware/auth');
const P = require('../utils/payroll');

// The Payroll page (utils/payroll.js): what each chatter earned in a two-week
// period. Pay is private: managers and up only.
router.use(requireMinRole('manager'));

const NOT_READY = 'Run migration 028 (payroll) in Supabase to turn this on';
const missingTable = (msg) => /payroll_(reports|periods)|hourly_rate|commission_pct/.test(String(msg || ''));
const fail = (res, e, what) => {
  console.error(`[payroll] ${what}:`, e.message);
  return res.status(missingTable(e.message) ? 409 : 500).json({ error: missingTable(e.message) ? NOT_READY : `Could not ${what}` });
};
// A money/number field: null when empty, else a number within [min, max].
function field(v, { min = 0, max = 1e6 } = {}) {
  if (v === null || v === '') return { value: null };
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) return { error: true };
  return { value: Math.round(n * 100) / 100 };
}

// GET /api/payroll?start=YYYY-MM-DD — a period's reports (default: the last
// finished period), and the recent periods with how many reports each has.
router.get('/', async (req, res) => {
  try {
    const orgId = req.user.organisationId;
    const periods = P.recentPeriods(8);
    const start = P.isPeriodStart(req.query.start) ? req.query.start : (periods.find(p => !p.running) || periods[0]).start;
    const [view, saved] = await Promise.all([
      P.loadPeriod(orgId, start),
      supabaseAdmin.from('payroll_reports').select('period_start, status').eq('organisation_id', orgId).gte('period_start', periods[periods.length - 1].start),
    ]);
    if (saved.error) throw new Error(saved.error.message);
    const count = {};
    for (const r of saved.data || []) {
      const c = (count[r.period_start] ||= { reports: 0, final: 0 });
      c.reports++; if (r.status === 'final') c.final++;
    }
    res.json({
      ...view,
      periods: periods.map(p => ({ ...p, ...(count[p.start] || { reports: 0, final: 0 }) })),
      defaults: { hourly_rate: P.DEFAULT_RATE, commission_pct: P.DEFAULT_COMMISSION },
    });
  } catch (e) { fail(res, e, 'load the payroll'); }
});

// POST /api/payroll/calculate { start } — read hours and sales afresh for the
// period; final reports stay as they are, drafts keep what was typed in.
router.post('/calculate', async (req, res) => {
  try {
    if (!P.isPeriodStart(req.body.start)) return res.status(400).json({ error: 'Pick a payroll period' });
    res.json(await P.calculatePeriod(req.user.organisationId, req.body.start, req.user.id));
  } catch (e) { fail(res, e, 'calculate the payroll'); }
});

// PATCH /api/payroll/reports/:id { hours, additions, deductions, notes, hourly_rate, commission_pct }
// Drafts only. A new rate or commission is also saved as the chatter's own, for
// their next reports.
router.patch('/reports/:id', async (req, res) => {
  try {
    const orgId = req.user.organisationId;
    const { data: cur, error } = await supabaseAdmin.from('payroll_reports').select('*').eq('id', req.params.id).eq('organisation_id', orgId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!cur) return res.status(404).json({ error: 'Not found' });
    if (cur.status === 'final') return res.status(409).json({ error: 'This report is final. Move it back to draft to change it.' });
    const update = { updated_at: new Date().toISOString() };
    const limits = { hours: { max: 400 }, additions: {}, deductions: {}, hourly_rate: { max: 1000 }, commission_pct: { max: 100 } };
    for (const [k, lim] of Object.entries(limits)) {
      if (req.body[k] === undefined) continue;
      const f = field(req.body[k], lim);
      if (f.error) return res.status(400).json({ error: `Check the ${k.replace('_', ' ')}` });
      if (f.value === null && k !== 'hours') return res.status(400).json({ error: `Fill in the ${k.replace('_', ' ')}` });
      update[k] = f.value;                                   // hours: empty = back to the hours from the chats
    }
    if (req.body.notes !== undefined) update.notes = String(req.body.notes || '').trim().slice(0, 1000) || null;
    // a rate typed here becomes the chatter's own, so the report no longer uses the defaults
    if (update.hourly_rate !== undefined && update.commission_pct !== undefined && cur.details?.flags?.includes('default_rate')) {
      update.details = { ...cur.details, flags: cur.details.flags.filter(f => f !== 'default_rate') };
    }
    const { data, error: ue } = await supabaseAdmin.from('payroll_reports').update(update).eq('id', cur.id).select().single();
    if (ue) throw new Error(ue.message);
    const rate = {};
    if (update.hourly_rate !== undefined) rate.hourly_rate = update.hourly_rate;
    if (update.commission_pct !== undefined) rate.commission_pct = update.commission_pct;
    if (Object.keys(rate).length) {
      const { error: ce } = await supabaseAdmin.from('chatters').update(rate).eq('id', cur.chatter_id).eq('organisation_id', orgId);
      if (ce) throw new Error(ce.message);
    }
    const { data: ch } = await supabaseAdmin.from('chatters').select('name').eq('id', cur.chatter_id).maybeSingle();
    res.json({ ...data, chatter_name: ch?.name || '?', ...P.totals(data) });
  } catch (e) { fail(res, e, 'save'); }
});

// POST /api/payroll/reports/:id/status { final: true | false }
router.post('/reports/:id/status', async (req, res) => {
  try {
    const final = !!req.body.final;
    const { data, error } = await supabaseAdmin.from('payroll_reports')
      .update({ status: final ? 'final' : 'draft', finalized_at: final ? new Date().toISOString() : null, updated_at: new Date().toISOString() })
      .eq('id', req.params.id).eq('organisation_id', req.user.organisationId).select().single();
    if (error) throw new Error(error.message);
    const { data: ch } = await supabaseAdmin.from('chatters').select('name').eq('id', data.chatter_id).maybeSingle();
    res.json({ ...data, chatter_name: ch?.name || '?', ...P.totals(data) });
  } catch (e) { fail(res, e, 'change the status'); }
});

// POST /api/payroll/finalize { start } — mark every draft of the period final.
router.post('/finalize', async (req, res) => {
  try {
    if (!P.isPeriodStart(req.body.start)) return res.status(400).json({ error: 'Pick a payroll period' });
    const now = new Date().toISOString();
    const { error } = await supabaseAdmin.from('payroll_reports').update({ status: 'final', finalized_at: now, updated_at: now })
      .eq('organisation_id', req.user.organisationId).eq('period_start', req.body.start).eq('status', 'draft');
    if (error) throw new Error(error.message);
    res.json(await P.loadPeriod(req.user.organisationId, req.body.start));
  } catch (e) { fail(res, e, 'finalize'); }
});

module.exports = router;
