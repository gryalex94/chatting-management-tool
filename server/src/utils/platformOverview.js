/**
 * The Daily overview for Fansly and Fanvue, in the same shape as the OnlyFans one (utils/overview.js),
 * so the dashboard shows one page for every platform: the day's team totals, a row per chatter (sales,
 * PPVs, unlock, golden, messages, reply time, the 7 days before) and a row per page (the day's earnings
 * against the 30 days before, the 7 days against the 7 before, ratio over 2 weeks, LTV over 30 days),
 * with the open tasks on those pages and chatters. Counted with the Creator reports (fanslyReports,
 * fanvueReports), so the numbers agree with them.
 */
const { supabaseAdmin } = require('./supabase');
const Stats = require('./fanslyStats');
const FS = require('./fanslyReports');
const FV = require('./fanvueReports');

const W = { critical: 4, high: 3, medium: 2, low: 1 };
const REPORT = { fansly: FS.report, fanvue: FV.report };

async function buildPlatformOverview(orgId, platform, date) {
  const report = REPORT[platform];
  const run = (from, to) => report(orgId, { from, to, accounts: [], gross: false });
  const days7 = []; for (let i = 6; i >= 0; i--) days7.push(Stats.addDays(date, -i));
  const [daily, prev, week, twoWeeks, month, before30] = await Promise.all([
    Promise.all(days7.map(d => run(d, d))), run(Stats.addDays(date, -1), Stats.addDays(date, -1)),
    run(Stats.addDays(date, -6), date), run(Stats.addDays(date, -13), date), run(Stats.addDays(date, -29), date),
    run(Stats.addDays(date, -30), Stats.addDays(date, -1)),
  ]);
  const today = daily[daily.length - 1];

  // the page each report row stands for (tasks hang on creators.id)
  let creatorOf = new Map();
  if (platform === 'fansly') {
    const { data } = await supabaseAdmin.from('fansly_accounts').select('id, creator_id').eq('organisation_id', orgId);
    creatorOf = new Map((data || []).map(a => [a.id, a.creator_id]));
  } else {
    creatorOf = new Map((await FV.fanvuePages(orgId)).map(p => [p.id, p.creator_id]));
  }
  const creatorIds = [...new Set([...creatorOf.values()].filter(Boolean))];

  // the open tasks on this platform's pages (and their chatters), and the counts by status
  const tasks = [];
  const statuses = ['open', 'taken', 'completed', 'dismissed'];
  const taskCounts = Object.fromEntries(statuses.map(s => [s, 0]));
  if (creatorIds.length) {
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabaseAdmin.from('review_tasks').select('id, chatter_id, creator_id, severity, status, title, priority, area')
        .eq('organisation_id', orgId).in('creator_id', creatorIds).in('status', ['open', 'taken']).order('id').range(from, from + 999);
      if (error) throw error;
      tasks.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    const counts = await Promise.all(statuses.map(s => supabaseAdmin.from('review_tasks').select('id', { count: 'exact', head: true })
      .eq('organisation_id', orgId).in('creator_id', creatorIds).eq('status', s)));
    statuses.forEach((s, i) => { taskCounts[s] = counts[i].count || 0; });
  }
  const cConcern = {}, cTasks = {}, cList = {}, pConcern = {}, pTasks = {}, pList = {};
  for (const t of tasks) {
    const item = { title: t.title, priority: t.priority, area: t.area, severity: t.severity };
    if (t.chatter_id) { cConcern[t.chatter_id] = (cConcern[t.chatter_id] || 0) + (W[t.severity] || 1); cTasks[t.chatter_id] = (cTasks[t.chatter_id] || 0) + 1; (cList[t.chatter_id] ||= []).push(item); }
    if (t.creator_id) { pConcern[t.creator_id] = (pConcern[t.creator_id] || 0) + (W[t.severity] || 1); pTasks[t.creator_id] = (pTasks[t.creator_id] || 0) + 1; (pList[t.creator_id] ||= []).push(item); }
  }
  const byPri = (a, b) => (a.priority || 7) - (b.priority || 7);

  // chatters: everyone who worked this platform in the 7 days, plus anyone with an open task
  const metric = (c) => c && ({
    sales: Math.round(c.sales || 0), messages: c.messages, ppvs: c.ppv_sent, fans: c.fans,
    reply: c.reply_s ?? 0, unlock: c.unlock_rate != null ? Math.round(c.unlock_rate) : 0, golden: c.golden_ratio ?? 0, workload: null,
  });
  const ofDay = (rep, id) => rep.chatters.find(c => c.chatter_id === id);
  const ids = new Set();
  for (const r of daily) for (const c of r.chatters) if (c.chatter_id) ids.add(c.chatter_id);
  for (const t of tasks) if (t.chatter_id) ids.add(t.chatter_id);
  const { data: chs } = ids.size ? await supabaseAdmin.from('chatters').select('id, name').in('id', [...ids]) : { data: [] };
  const nameOf = new Map((chs || []).map(c => [c.id, c.name]));
  const todayM = [...ids].map(id => metric(ofDay(today, id))).filter(Boolean);
  const prevM = [...ids].map(id => metric(ofDay(prev, id))).filter(Boolean);
  const sum = (arr, k) => arr.reduce((s, x) => s + (x[k] || 0), 0);
  const avg = (arr, k) => (arr.length ? sum(arr, k) / arr.length : 0);
  const teamAvg = { sales: Math.round(avg(todayM, 'sales')), messages: Math.round(avg(todayM, 'messages')), reply: Math.round(avg(todayM, 'reply')), unlock: Math.round(avg(todayM, 'unlock')) };
  const chatters = [...ids].map(id => {
    const t = metric(ofDay(today, id)), y = metric(ofDay(prev, id));
    return {
      chatter_id: id, name: nameOf.get(id) || 'Unknown chatter', has_data: !!t, metrics: t,
      vs_prev: t && y ? { sales: t.sales - y.sales, ppvs: t.ppvs - y.ppvs, messages: t.messages - y.messages, reply: t.reply - y.reply, unlock: t.unlock - y.unlock, golden: Math.round((t.golden - y.golden) * 10) / 10, fans: t.fans - y.fans } : null,
      vs_avg: t ? { sales: t.sales - teamAvg.sales, unlock: t.unlock - teamAvg.unlock } : null,
      spark: daily.map(r => { const c = ofDay(r, id); return c ? Math.round(c.sales || 0) : null; }),
      breakdown: [], tasks: (cList[id] || []).sort(byPri).slice(0, 25), concern: cConcern[id] || 0, task_count: cTasks[id] || 0,
    };
  }).sort((a, b) => (b.concern - a.concern) || (Number(b.has_data) - Number(a.has_data)) || ((b.metrics?.sales || 0) - (a.metrics?.sales || 0)));

  // the whole team's chatting that day, whoever (or nobody) is credited for it
  const team = today.chatting || {};
  const teamTotals = {
    sales: Math.round(today.totals.total), sales_vs_prev_pct: prev.totals.total > 0 ? Math.round(((today.totals.total - prev.totals.total) / prev.totals.total) * 100) : null,
    ppvs: team.ppv_sent || 0, messages: team.messages || 0, unlock_avg: team.unlock_rate != null ? Math.round(team.unlock_rate) : 0,
    working: todayM.length, total: ids.size,
  };

  const find = (rep, id) => rep.pages.find(p => p.account_id === id) || {};
  const pages = today.pages.map(p => {
    const cid = creatorOf.get(p.account_id) || null, w = find(week, p.account_id), m30 = find(month, p.account_id), b30 = find(before30, p.account_id);
    const metrics = {
      revenue_net: p.total, revenue_baseline_net: b30.total != null ? Math.round((b30.total / 30) * 100) / 100 : null,
      revenue_7d: w.total ?? null, revenue_7d_prior: w.prev?.total ?? null,
      ratio: find(twoWeeks, p.account_id).ratio ?? null, ratio_target: 5, ltv_7day: m30.ltv ?? null, ltv_window_days: 30, ratio_window_days: 14,
    };
    const drop = metrics.revenue_baseline_net ? Math.max(0, metrics.revenue_baseline_net - p.total) : 0;
    return {
      creator_id: cid || p.account_id, name: p.page, is_free: false, metrics, flag_count: 0, money_score: drop,
      spark: daily.map(r => { const x = find(r, p.account_id); return x.total != null ? Math.round(x.total) : null; }),
      chatters: [], tasks: (pList[cid] || []).sort(byPri).slice(0, 25), concern: pConcern[cid] || 0, task_count: pTasks[cid] || 0,
    };
  }).sort((a, b) => (b.money_score - a.money_score) || (b.concern - a.concern));

  return { platform, report_date: date, team_avg: teamAvg, team_totals: teamTotals, spark_dates: days7, task_counts: taskCounts, chatters, pages, day_review: null, summary: null, review_at: null };
}

module.exports = { buildPlatformOverview };
