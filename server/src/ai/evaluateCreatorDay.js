const { runAgentDetailed } = require('./agentRunner');
const { MODELS } = require('./evalShared');
const { supabaseAdmin } = require('../utils/supabase');

// Page-level AI analysis. Fast & cheap: it reads NUMBERS, not raw messages —
// our calculated metrics are the trusted baseline, cross-checked against the
// raw Infloww fields for confirmation / contradiction / correlation.
const CREATOR_PROMPT = `You are an analyst for an OnlyFans agency reviewing ONE creator's page for a day.

Treat OUR CALCULATED METRICS as the trusted baseline — they are computed consistently and matter most (2-week ratio, 30-day LTV, revenue vs 30-day baseline). Start from those. Then CROSS-CHECK against the raw platform fields: confirm or question the picture, and look for correlations or contradictions — e.g. ratio looks fine but the spender count collapsed; revenue is up but only because of tips; renew % is sliding while active fans look flat; earnings per fan cratered. Many raw fields are noisy — use them to corroborate or explain the baseline, not as findings on their own.

Produce a short report: the state of the page, what's worth the manager's attention, and what to look at. Be concrete with the numbers. If any days are marked MISSING from the window or baseline, raise a "data" issue — those metrics are based on partial data and should be read with caution.

ONLY raise an issue when a metric crosses one of these thresholds — otherwise mention it in 'overall' but do NOT make it an issue (managers do not want a task for every number):
- revenue: only when it differs from baseline by 90% OR MORE, in EITHER direction (a collapse OR a surprise spike both warrant a look). Smaller swings are normal — no issue.
- ltv: only when it has dropped 20% or more versus the prior period → severity high.
- ratio: only when it is BELOW the target of 5 → look it up. At or above 5 is fine.
- chargebacks: whenever chargebacks exceed $50. ALWAYS severity high — money left the business and it may be our fault, so a manager must find out what happened (buyer's remorse vs. our mistake).
- spenders / churn: only when there is a clear, sustained deterioration (not a one-day wobble, not a free-page artefact where renew%/churn is meaningless).
A day that crosses none of these is a healthy day — say so in 'overall' and return few or no issues.

For a ratio or LTV issue, write the "detail" as an ACTION, not just a number: tell the manager to review THIS page's newest subscribers from the past week, its whales, and its potential spenders, and to flag the weakest chatting performances on the page — the metric points to WHERE to look, the task says WHAT to do. For a revenue anomaly, the action is to open the dashboard and check successful/failed sales for that day. For a chargeback, the action is to find out exactly what happened — was it buyer's remorse, or our mistake?

Return JSON with this exact shape:
{
  "overall": "one short paragraph: the state of the page and the headline",
  "issues": [{"area":"ratio | ltv | revenue | churn | spenders | chargeback | data | other","severity":"critical | high | medium | low","detail":"what stands out and what to look at, with the numbers"}]
}
If the page looks healthy, say so in 'overall' and return few or no issues. Do not invent problems.`;

const NET = 0.8; // OnlyFans takes 20%; raw fields are gross.

function fmtToday(s) {
  const net = (v) => `$${Math.round((v || 0) * NET)}`;
  return [
    `total earnings (net) ${net(s.total_earnings_gross)}`,
    `PPV/messages (net) ${net(s.message_gross)}`,
    `tips (net) ${net(s.tips_gross)}`,
    `subscriptions (net) ${net(s.total_subscription_gross)}`,
    `new subscribers ${s.new_subscribers ?? '?'}`,
    `renewals ${s.subscriber_renewals ?? '?'}`,
    `spenders ${s.number_of_spenders ?? '?'}`,
    `avg spend/spender (gross) $${s.avg_spend_per_spender_gross ?? '?'}`,
    `avg spend/transaction (gross) $${s.avg_spend_per_transaction_gross ?? '?'}`,
    `renew-on % ${s.renew_on_pct ?? '?'}`,
    `new fans ${s.new_fans ?? '?'}`,
    `active fans ${s.active_fans ?? '?'}`,
    `expired-fan change ${s.expired_fan_change ?? '?'}`,
    `chargebacks (gross) $${s.refund_gross ?? 0}`,
    `following ${s.following ?? '?'}`,
    `OF ranking ${s.of_ranking ?? '?'}`,
    `avg sub length ${s.avg_subscription_length_days ?? '?'}d`,
  ].join('\n- ');
}

function fmtTrend(rows) {
  return rows.map(s =>
    `${s.report_date}: earnings(net) $${Math.round((s.total_earnings_gross || 0) * NET)}, spenders ${s.number_of_spenders ?? '?'}, new subs ${s.new_subscribers ?? '?'}, renew% ${s.renew_on_pct ?? '?'}, chargebacks $${s.refund_gross ?? 0}`
  ).join('\n');
}

async function evaluateCreatorDay({ orgId, creatorId, creatorName, reportDate, metrics = {}, flags = [], model = 'sonnet' }) {
  const { data: stats } = await supabaseAdmin
    .from('creator_daily_stats')
    .select('*')
    .eq('organisation_id', orgId)
    .eq('creator_id', creatorId)
    .lte('report_date', reportDate)
    .order('report_date', { ascending: false })
    .limit(8);
  if (!stats?.length) return { ok: false, reason: 'No creator statistics for this page on this date.' };

  const today = stats.find(s => s.report_date === reportDate) || stats[0];
  const prior = stats.filter(s => s.report_date !== today.report_date).reverse();

  const m = metrics || {};
  const w = fmtRange(m.window_dates);
  const b = fmtRange(m.baseline_dates);
  const windowLine = w
    ? `30-day LTV window covers ${w.range} (${w.count} day${w.count === 1 ? '' : 's'})${w.missing.length ? ` — ${w.missing.join(', ')} MISSING from the DB` : ''}`
    : '';
  const baseLine = b
    ? `revenue baseline covers ${b.range} (${b.count} days)${b.missing.length ? ` — ${b.missing.length} day(s) missing` : ''}`
    : '';
  const calc = [
    m.ratio != null ? `ratio ${Number(m.ratio).toFixed(1)} (target ${m.ratio_target ?? 5})` : 'ratio n/a (free page)',
    m.ltv_7day != null ? `30-day LTV $${m.ltv_7day} (prior 30 days $${m.ltv_7day_prior ?? '?'})` : 'LTV n/a',
    m.revenue_net != null ? `revenue (net) $${m.revenue_net} vs baseline $${m.revenue_baseline_net ?? '?'}` : '',
    m.subscriber_count != null ? `subscribers today ${m.subscriber_count} (new ${m.new_subscribers ?? 0})` : '',
    windowLine,
    baseLine,
  ].filter(Boolean).join('\n- ');

  const flagText = (flags || []).length
    ? (flags || []).map(f => `[${f.severity || '-'}] ${f.text || f.evidence || f.flag_type}`).join('\n- ')
    : '(none)';

  const userContent = `Creator page: ${creatorName || today.creator_name} — ${reportDate}

OUR CALCULATED METRICS (trusted baseline):
- ${calc || '(none)'}

OUR CALCULATED FLAGS:
- ${flagText}

RAW PLATFORM FIELDS (today, net where noted):
- ${fmtToday(today)}

PRIOR DAYS (for trend):
${prior.length ? fmtTrend(prior) : '(no prior days loaded)'}`;

  const baseModelId = MODELS[model] || MODELS.sonnet;
  try {
    const t0 = Date.now();
    const { result, usage } = await runAgentDetailed({ systemPrompt: CREATOR_PROMPT, userContent, model: baseModelId, maxTokens: 2000 });
    return {
      ok: true,
      eval_type: 'creator',
      model, model_id: baseModelId,
      elapsed_ms: Date.now() - t0, usage,
      evaluation: {
        overall: result.overall || '',
        issues: Array.isArray(result.issues) ? result.issues.map(i => ({
          area: i.area || null, severity: i.severity || null, detail: i.detail || '',
        })) : [],
      },
    };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}

// "2026-06-28" -> "28 Jun"; a date list -> { range:"20 Jun - 28 Jun", count, missing:[...] }
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function dM(iso) { const [, mo, d] = String(iso).split('-').map(Number); return `${d} ${MON[mo - 1]}`; }
function fmtRange(dates) {
  if (!dates || !dates.length) return null;
  const s = [...dates].sort();
  const first = s[0], last = s[s.length - 1];
  const range = first === last ? dM(first) : `${dM(first)} - ${dM(last)}`;
  const have = new Set(s);
  const missing = [];
  for (let t = Date.parse(first + 'T00:00:00Z'), end = Date.parse(last + 'T00:00:00Z'); t <= end; t += 86400000) {
    const iso = new Date(t).toISOString().slice(0, 10);
    if (!have.has(iso)) missing.push(dM(iso));
  }
  return { range, count: s.length, missing };
}

module.exports = { evaluateCreatorDay };
