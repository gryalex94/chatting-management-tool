const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../utils/supabase');
const { requireMinRole } = require('../middleware/auth');
const P = require('../utils/payroll');
const { isPlatform } = require('../utils/pages');
const NO_LINES = 'Run database change 035 (payroll across platforms) in Supabase first';

// The Payroll page (utils/payroll.js): what each chatter earned in a two-week
// period. Pay is private: managers and up only.
router.use(requireMinRole('manager'));

const NOT_READY = 'Run migration 028 (payroll) in Supabase to turn this on';
const NO_OVERTIME = 'Run migration 029 (payroll overtime) in Supabase to set overtime';
const missingTable = (msg) => /payroll_(reports|periods)|hourly_rate|commission_pct/.test(String(msg || ''));
const fail = (res, e, what) => {
  console.error(`[payroll] ${what}:`, e.message);
  if (/^Run (database change|migration)/.test(e.message)) return res.status(409).json({ error: e.message });
  if (/overtime_/.test(e.message)) return res.status(409).json({ error: NO_OVERTIME });
  return res.status(missingTable(e.message) ? 409 : 500).json({ error: missingTable(e.message) ? NOT_READY : `Could not ${what}` });
};
const LIMITS = { hours: { max: 400 }, overtime_hours: { max: 400 }, additions: {}, deductions: {}, hourly_rate: { max: 1000 }, commission_pct: { max: 100 }, overtime_rate: { max: 1000 } };
const NULLABLE = new Set(['hours', 'overtime_hours', 'overtime_rate']);   // empty = from the chats / the hourly rate
const RATES = ['hourly_rate', 'commission_pct', 'overtime_rate'];
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

// PATCH /api/payroll/reports/:id { hours, overtime_hours, additions, deductions, notes,
// hourly_rate, commission_pct, overtime_rate, lines: { fanvue: { hours, overtime_hours,
// hourly_rate, commission_pct, overtime_rate } } } — send only what changed. Drafts
// only. The top-level hours and rates are the OnlyFans part; `lines` another
// platform's. A rate sent here is also saved as the chatter's own (for that
// platform), for their next reports.
router.patch('/reports/:id', async (req, res) => {
  try {
    const orgId = req.user.organisationId;
    const { data: cur, error } = await supabaseAdmin.from('payroll_reports').select('*').eq('id', req.params.id).eq('organisation_id', orgId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!cur) return res.status(404).json({ error: 'Not found' });
    if (cur.status === 'final') return res.status(409).json({ error: 'This report is final. Move it back to draft to change it.' });
    const update = { updated_at: new Date().toISOString() };
    for (const [k, lim] of Object.entries(LIMITS)) {
      if (req.body[k] === undefined) continue;
      const f = field(req.body[k], lim);
      if (f.error && k === 'additions' && Number(req.body[k]) < 0) return res.status(400).json({ error: 'Put money taken off under Deductions' });
      if (f.error) return res.status(400).json({ error: `Check the ${k.replace('_', ' ')}` });
      if (f.value === null && !NULLABLE.has(k)) return res.status(400).json({ error: `Fill in the ${k.replace('_', ' ')}` });
      update[k] = f.value;
    }
    if (req.body.notes !== undefined) update.notes = String(req.body.notes || '').trim().slice(0, 1000) || null;
    // another platform's line: its hours and rates
    const lineRates = {};
    if (req.body.lines && typeof req.body.lines === 'object') {
      const lines = { ...(cur.lines || {}) };
      for (const [platform, sent] of Object.entries(req.body.lines)) {
        if (!isPlatform(platform) || platform === 'onlyfans' || !lines[platform] || !sent || typeof sent !== 'object') {
          return res.status(400).json({ error: 'This report has no line for that platform' });
        }
        const next = { ...lines[platform] };
        for (const k of ['hours', 'overtime_hours', ...RATES]) {
          if (sent[k] === undefined) continue;
          const f = field(sent[k], LIMITS[k]);
          if (f.error) return res.status(400).json({ error: `Check the ${platform} ${k.replace('_', ' ')}` });
          if (f.value === null && !NULLABLE.has(k)) return res.status(400).json({ error: `Fill in the ${platform} ${k.replace('_', ' ')}` });
          next[k] = f.value;
        }
        lines[platform] = next;
        lineRates[platform] = Object.fromEntries(RATES.filter(k => sent[k] !== undefined).map(k => [k, next[k]]));
      }
      update.lines = lines;
    }
    const { data, error: ue } = await supabaseAdmin.from('payroll_reports').update(update).eq('id', cur.id).select().single();
    if (ue) throw new Error(/\blines\b/.test(ue.message) ? NO_LINES : ue.message);
    for (const [platform, r] of Object.entries(lineRates)) await P.setPlatformRates(orgId, cur.chatter_id, platform, r);
    const rate = Object.fromEntries(RATES.filter(k => update[k] !== undefined).map(k => [k, update[k]]));
    if (Object.keys(rate).length) {
      const { error: ce } = await supabaseAdmin.from('chatters').update(rate).eq('id', cur.chatter_id).eq('organisation_id', orgId);
      if (ce) throw new Error(ce.message);
    }
    res.json(await P.viewRow(data));
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
    res.json(await P.viewRow(data));
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

// GET /api/payroll/rates?platform= — the team's rates and every active chatter's own,
// for one platform (OnlyFans unless another is asked for).
router.get('/rates', async (req, res) => {
  try { res.json(await P.loadRates(req.user.organisationId, isPlatform(req.query.platform) ? req.query.platform : 'onlyfans')); }
  catch (e) { fail(res, e, 'load the pay rates'); }
});

// PUT /api/payroll/rates { platform?, team: { hourly_rate, commission_pct, overtime_rate },
// chatters: [{ id, hourly_rate, commission_pct, overtime_rate }] } — a chatter's empty
// rate means the team's; the team's empty overtime rate means each one's hourly rate,
// and on another platform any empty team rate means the general team rate.
// Draft reports take the new rates straight away; final ones keep theirs.
router.put('/rates', async (req, res) => {
  try {
    const platform = isPlatform(req.body.platform) ? req.body.platform : 'onlyfans';
    const clean = (o, nullable) => {
      const out = {};
      for (const k of RATES) {
        if (o?.[k] === undefined) continue;
        const f = field(o[k], LIMITS[k]);
        if (f.error || (f.value === null && !nullable(k))) return null;
        out[k] = f.value;
      }
      return out;
    };
    const team = req.body.team ? clean(req.body.team, k => platform !== 'onlyfans' || k === 'overtime_rate') : undefined;
    if (team === null) return res.status(400).json({ error: 'Check the team rates' });
    const chatters = [];
    for (const c of Array.isArray(req.body.chatters) ? req.body.chatters : []) {
      const r = clean(c, () => true);
      if (!r || !c.id) return res.status(400).json({ error: 'Check the chatters\' rates' });
      chatters.push({ id: String(c.id), ...r });
    }
    res.json(await P.saveRates(req.user.organisationId, { platform, team, chatters }));
  } catch (e) { fail(res, e, 'save the pay rates'); }
});

module.exports = router;
