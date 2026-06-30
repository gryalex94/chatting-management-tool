const { supabaseAdmin } = require('./supabase');
const { runDailyCheck } = require('./dailyCheck');

const shiftDays = (date, n) => { const d = new Date(date + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const W = { critical: 4, high: 3, medium: 2, low: 1 };

/**
 * "How worrying is this page, money-wise." Higher = worse. Weighted so the daily
 * revenue shortfall vs the page's own 30-day average dominates (that is where
 * anomalies show), then the week-over-week 7-day trend, then a weak ratio.
 * LTV/issue-count are shown in the UI but deliberately not part of the ranking.
 */
function moneyConcern(m) {
  if (!m) return 0;
  const base = m.revenue_baseline_net || 0, today = m.revenue_net || 0;
  const dailyDrop = base > 0 ? Math.max(0, (base - today) / base) : 0;                            // 0..1 below avg
  const prior = m.revenue_7d_prior || 0, cur = m.revenue_7d || 0;
  const weekDrop = prior > 0 ? Math.max(0, (prior - cur) / prior) : 0;                            // 0..1 vs last wk
  const ratioPenalty = (m.ratio != null) ? Math.max(0, (5 - m.ratio)) / 5 : 0;                    // ratio under 5
  // Dampen tiny / free pages: a $1→$0 swing is a 100% drop but means nothing.
  // Pages with a $100+/day average count fully; smaller ones scale down toward 0.
  const sizeWeight = Math.min(1, base / 100);
  return Math.round((dailyDrop * 3 + weekDrop * 2 + ratioPenalty) * sizeWeight * 100) / 100;
}

/**
 * Home overview: AI day-review + chatters ranked by concern (with metrics, and
 * deltas vs team average and vs their own previous day) + pages ranked by health.
 * Chatters with no metrics that day come back has_data:false (a likely day off).
 */
async function buildOverview(orgId, reportDate) {
  const prev = shiftDays(reportDate, -1);
  const days7 = []; for (let i = 6; i >= 0; i--) days7.push(shiftDays(reportDate, i ? -i : 0));
  const NET = 0.8;
  const result = await runDailyCheck(orgId, reportDate);   // page metrics + chatter list

  const [{ data: allChatters }, { data: allCreators }, { data: metricRows }, { data: pageStats }, { data: tasks }, { data: dr }] = await Promise.all([
    supabaseAdmin.from('chatters').select('id, name').eq('organisation_id', orgId),
    supabaseAdmin.from('creators').select('id, name').eq('organisation_id', orgId),
    supabaseAdmin.from('chatter_daily_metrics')
      .select('chatter_id, creator_id, report_date, sales_today, messages_sent, response_time_avg_seconds, unlock_rate, golden_ratio, ppvs_sent, fans_chatted, workload_status')
      .eq('organisation_id', orgId).in('report_date', days7),
    supabaseAdmin.from('creator_daily_stats').select('creator_id, report_date, total_earnings_gross')
      .eq('organisation_id', orgId).in('report_date', days7),
    supabaseAdmin.from('review_tasks').select('chatter_id, creator_id, severity, status, title, priority, area')
      .eq('organisation_id', orgId),
    supabaseAdmin.from('daily_reviews').select('summary, day_review, created_at')
      .eq('organisation_id', orgId).eq('report_date', reportDate).maybeSingle(),
  ]);

  const chatterName = {}; (allChatters || []).forEach(c => { chatterName[c.id] = c.name; });
  const creatorName = {}; (allCreators || []).forEach(c => { creatorName[c.id] = c.name; });

  // aggregate per (chatter, date); plus per (chatter, creator) sales for today's breakdown
  const agg = {};
  const ccSales = {};   // `${chatter}|${creator}` -> today's sales
  for (const m of (metricRows || [])) {
    const k = `${m.chatter_id}|${m.report_date}`;
    const a = agg[k] || (agg[k] = { sales: 0, messages: 0, ppvs: 0, fans: 0, reply: null, unlockSum: 0, unlockN: 0, goldenSum: 0, goldenN: 0, workload: null });
    if (a.workload == null && m.workload_status) a.workload = m.workload_status;
    a.sales += parseFloat(m.sales_today) || 0;
    a.messages += m.messages_sent || 0;
    a.ppvs += m.ppvs_sent || 0;
    a.fans += m.fans_chatted || 0;
    if (a.reply == null) a.reply = m.response_time_avg_seconds || 0;
    if (m.unlock_rate != null) { a.unlockSum += m.unlock_rate; a.unlockN++; }
    if (m.golden_ratio != null) { a.goldenSum += parseFloat(m.golden_ratio) || 0; a.goldenN++; }
    if (m.report_date === reportDate && m.creator_id) {
      const ck = `${m.chatter_id}|${m.creator_id}`;
      ccSales[ck] = (ccSales[ck] || 0) + (parseFloat(m.sales_today) || 0);
    }
  }
  const metricOf = (cid, date) => {
    const a = agg[`${cid}|${date}`];
    if (!a) return null;
    return {
      sales: Math.round(a.sales), messages: a.messages, ppvs: a.ppvs, fans: a.fans,
      reply: Math.round(a.reply || 0),
      unlock: a.unlockN ? Math.round(a.unlockSum / a.unlockN) : 0,
      golden: a.goldenN ? Math.round((a.goldenSum / a.goldenN) * 10) / 10 : 0,
      workload: a.workload,
    };
  };

  // page net revenue per day, for the page sparkline
  const pageDaily = {};
  for (const r of (pageStats || [])) { (pageDaily[r.creator_id] ||= {})[r.report_date] = (parseFloat(r.total_earnings_gross) || 0) * NET; }

  // concern + compact task lists (for the expand) from open/taken tasks
  const cConcern = {}, cTasks = {}, pConcern = {}, pTasks = {}, cTaskList = {}, pTaskList = {};
  const taskCounts = { open: 0, taken: 0, completed: 0, dismissed: 0 };
  for (const t of (tasks || [])) {
    if (taskCounts[t.status] != null) taskCounts[t.status]++;
    if (t.status !== 'open' && t.status !== 'taken') continue;
    const item = { title: t.title, priority: t.priority, area: t.area, severity: t.severity };
    if (t.chatter_id) { cConcern[t.chatter_id] = (cConcern[t.chatter_id] || 0) + (W[t.severity] || 1); cTasks[t.chatter_id] = (cTasks[t.chatter_id] || 0) + 1; (cTaskList[t.chatter_id] ||= []).push(item); }
    if (t.creator_id) { pConcern[t.creator_id] = (pConcern[t.creator_id] || 0) + (W[t.severity] || 1); pTasks[t.creator_id] = (pTasks[t.creator_id] || 0) + 1; (pTaskList[t.creator_id] ||= []).push(item); }
  }
  const byPri = (a, b) => (a.priority || 7) - (b.priority || 7);

  // team averages + totals today
  const todayM = (allChatters || []).map(c => metricOf(c.id, reportDate)).filter(Boolean);
  const prevM = (allChatters || []).map(c => metricOf(c.id, prev)).filter(Boolean);
  const sum = (arr, k) => arr.reduce((s, x) => s + (x[k] || 0), 0);
  const avg = (arr, k) => arr.length ? sum(arr, k) / arr.length : 0;
  const teamAvg = { sales: Math.round(avg(todayM, 'sales')), messages: Math.round(avg(todayM, 'messages')), reply: Math.round(avg(todayM, 'reply')), unlock: Math.round(avg(todayM, 'unlock')) };
  const tSales = sum(todayM, 'sales'), tSalesPrev = sum(prevM, 'sales');
  const teamTotals = {
    sales: Math.round(tSales),
    sales_vs_prev_pct: tSalesPrev > 0 ? Math.round(((tSales - tSalesPrev) / tSalesPrev) * 100) : null,
    ppvs: sum(todayM, 'ppvs'), messages: sum(todayM, 'messages'),
    unlock_avg: teamAvg.unlock, working: todayM.length, total: (allChatters || []).length,
  };

  const chatters = (allChatters || []).map(c => {
    const t = metricOf(c.id, reportDate);
    const y = metricOf(c.id, prev);
    const breakdown = (allCreators || []).map(cr => ({ creator_id: cr.id, name: cr.name, sales: Math.round(ccSales[`${c.id}|${cr.id}`] || 0) }))
      .filter(b => b.sales > 0).sort((a, b) => b.sales - a.sales);
    return {
      chatter_id: c.id, name: c.name,
      has_data: !!t,
      metrics: t,
      vs_prev: t && y ? { sales: t.sales - y.sales, ppvs: t.ppvs - y.ppvs, messages: t.messages - y.messages, reply: t.reply - y.reply, unlock: t.unlock - y.unlock, golden: Math.round((t.golden - y.golden) * 10) / 10, fans: t.fans - y.fans } : null,
      vs_avg: t ? { sales: t.sales - teamAvg.sales, unlock: t.unlock - teamAvg.unlock } : null,
      spark: days7.map(d => { const a = agg[`${c.id}|${d}`]; return a ? Math.round(a.sales) : null; }),
      breakdown, tasks: (cTaskList[c.id] || []).sort(byPri).slice(0, 25),
      concern: cConcern[c.id] || 0, task_count: cTasks[c.id] || 0,
    };
  }).sort((a, b) => (b.concern - a.concern) || (Number(b.has_data) - Number(a.has_data)) || ((b.metrics?.sales || 0) - (a.metrics?.sales || 0)));

  const pages = (result.pages || []).map(p => {
    const onPage = (allChatters || []).map(c => ({ chatter_id: c.id, name: c.name, sales: Math.round(ccSales[`${c.id}|${p.creator_id}`] || 0) }))
      .filter(x => x.sales > 0).sort((a, b) => b.sales - a.sales);
    return {
      creator_id: p.creator_id, name: p.creator_name, is_free: p.is_free,
      metrics: p.metrics, flag_count: (p.flags || []).length,
      money_score: moneyConcern(p.metrics),
      spark: days7.map(d => { const v = pageDaily[p.creator_id]?.[d]; return v != null ? Math.round(v) : null; }),
      chatters: onPage, tasks: (pTaskList[p.creator_id] || []).sort(byPri).slice(0, 25),
      concern: pConcern[p.creator_id] || 0, task_count: pTasks[p.creator_id] || 0,
    };
  }).sort((a, b) => (b.money_score - a.money_score) || (b.concern - a.concern));

  return {
    report_date: reportDate,
    team_avg: teamAvg, team_totals: teamTotals, spark_dates: days7,
    task_counts: taskCounts,
    chatters, pages,
    day_review: dr?.day_review || null,
    summary: dr?.summary || null,
    review_at: dr?.created_at || null,
  };
}

module.exports = { buildOverview };
