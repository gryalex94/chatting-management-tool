const { supabaseAdmin } = require('./supabase');

/*
 * Field ownership:
 * 
 * EMPLOYEE REPORT writes:
 *   sales_today, golden_ratio, unlock_rate, messages_sent, fans_chatted,
 *   active_conversations, chars_per_message, response_time_avg_seconds,
 *   workload_score, workload_status
 *
 * MESSAGE DASHBOARD writes:
 *   response_time_p50_seconds, response_time_p75_seconds, response_time_p90_seconds,
 *   response_time_trend, afk_gaps_count, afk_gaps_longest_minutes
 *
 * ROLLING AVERAGES (computed after either upload):
 *   sales_7day_avg, sales_30day_avg, sales_today_vs_avg_pct
 */

// ─── Employee Report → chatter_daily_metrics ────────

async function populateMetricsFromEmployeeStats(organisationId) {
  console.log('[Metrics] Populating from employee_daily_stats...');

  const { data: stats, error } = await supabaseAdmin
    .from('employee_daily_stats')
    .select('*')
    .eq('organisation_id', organisationId);

  if (error || !stats || stats.length === 0) {
    console.log('[Metrics] No employee stats found');
    return { computed: 0 };
  }

  // Aggregate by chatter + date
  const grouped = {};
  stats.forEach(s => {
    if (!s.chatter_id || !s.report_date) return;
    const key = `${s.chatter_id}|${s.report_date}`;
    if (!grouped[key]) {
      grouped[key] = {
        chatter_id: s.chatter_id,
        report_date: s.report_date,
        organisation_id: s.organisation_id,
        sales: 0, messages_sent: 0, fans_chatted: 0,
        character_count: 0, ppvs_sent: 0, ppvs_unlocked: 0,
        response_times: [],
      };
    }
    const g = grouped[key];
    g.sales += parseFloat(s.sales) || 0;
    g.messages_sent += s.messages_sent || 0;
    g.fans_chatted += s.fans_chatted || 0;
    g.character_count += s.character_count || 0;
    g.ppvs_sent += s.ppvs_sent || 0;
    g.ppvs_unlocked += s.ppvs_unlocked || 0;
    if (s.response_time_clocked_seconds) g.response_times.push(s.response_time_clocked_seconds);
  });

  let written = 0;

  for (const g of Object.values(grouped)) {
    const avgRT = g.response_times.length > 0
      ? Math.round(g.response_times.reduce((a, b) => a + b, 0) / g.response_times.length)
      : 0;
    const charsPerMsg = g.messages_sent > 0 ? Math.round(g.character_count / g.messages_sent) : 0;
    const goldenRatio = g.messages_sent > 0 ? Math.round((g.ppvs_sent / g.messages_sent) * 10000) / 100 : 0;
    const unlockRate = g.ppvs_sent > 0 ? Math.round((g.ppvs_unlocked / g.ppvs_sent) * 100) : 0;
    const workloadScore = Math.min(100, Math.round(((g.messages_sent / 200) * 0.6 + (g.fans_chatted / 30) * 0.4) * 100));
    const workloadStatus = workloadScore < 30 ? 'light' : workloadScore < 85 ? 'healthy' : 'overloaded';

    const employeeFields = {
      sales_today: Math.round(g.sales * 100) / 100,
      golden_ratio: goldenRatio,
      unlock_rate: unlockRate,
      messages_sent: g.messages_sent,
      fans_chatted: g.fans_chatted,
      active_conversations: g.fans_chatted,
      chars_per_message: charsPerMsg,
      response_time_avg_seconds: avgRT,
      workload_score: workloadScore,
      workload_status: workloadStatus,
    };

    const ok = await upsertMetricFields(g.chatter_id, g.report_date, g.organisation_id, employeeFields);
    if (ok) written++;
  }

  // Compute rolling averages for all affected chatters
  await computeRollingAverages(organisationId);

  console.log(`[Metrics] Populated ${written} records from employee stats`);
  return { computed: written };
}

// ─── Message Dashboard → chatter_daily_metrics ──────

async function computeMetricsForOrg(organisationId, targetDate = null) {
  console.log(`[Metrics] Computing from messages for org ${organisationId}...`);

  // Get chatters name→id map
  const { data: chatters } = await supabaseAdmin
    .from('chatters')
    .select('id, name')
    .eq('organisation_id', organisationId)
    .eq('is_active', true);

  if (!chatters || chatters.length === 0) return { computed: 0 };

  const chatterMap = {};
  chatters.forEach(c => { chatterMap[c.name.toLowerCase().trim()] = c.id; });

  // Fetch messages (paginated)
  const allMessages = [];
  let offset = 0;
  const PAGE = 1000;

  while (true) {
    let query = supabaseAdmin
      .from('messages')
      .select('sender_name, creator_id, sent_date, sent_datetime, replay_time_seconds, price, purchased, creator_message_text, sent_to_username, organisation_id')
      .eq('organisation_id', organisationId)
      .order('sent_datetime', { ascending: true })
      .range(offset, offset + PAGE - 1);

    if (targetDate) query = query.eq('sent_date', targetDate);

    const { data, error } = await query;
    if (error) { console.error('[Metrics] Fetch error:', error); break; }
    if (!data || data.length === 0) break;
    allMessages.push(...data);
    if (data.length < PAGE) break;
    offset += PAGE;
  }

  console.log(`[Metrics] Fetched ${allMessages.length} messages`);
  if (allMessages.length === 0) return { computed: 0 };

  // Group by chatter + date
  const groups = {};
  allMessages.forEach(msg => {
    const chatterId = chatterMap[msg.sender_name?.toLowerCase().trim()];
    if (!chatterId) return;
    const key = `${chatterId}|${msg.sent_date}`;
    if (!groups[key]) {
      groups[key] = { chatterId, date: msg.sent_date, orgId: msg.organisation_id, messages: [] };
    }
    groups[key].messages.push(msg);
  });

  let written = 0;

  for (const group of Object.values(groups)) {
    const msgs = group.messages;

    // Response time percentiles
    const responseTimes = msgs
      .map(m => m.replay_time_seconds)
      .filter(t => t != null && t > 0 && t < 7200) // cap at 2 hours
      .sort((a, b) => a - b);

    // AFK gaps
    const sortedByTime = [...msgs].sort((a, b) =>
      new Date(a.sent_datetime) - new Date(b.sent_datetime)
    );
    let afkGapsCount = 0;
    let longestGapMinutes = 0;
    for (let i = 1; i < sortedByTime.length; i++) {
      const gapMin = (new Date(sortedByTime[i].sent_datetime) - new Date(sortedByTime[i - 1].sent_datetime)) / 60000;
      if (gapMin > 15) {
        afkGapsCount++;
        longestGapMinutes = Math.max(longestGapMinutes, Math.round(gapMin));
      }
    }

    const messageFields = {
      response_time_p50_seconds: percentile(responseTimes, 50),
      response_time_p75_seconds: percentile(responseTimes, 75),
      response_time_p90_seconds: percentile(responseTimes, 90),
      afk_gaps_count: afkGapsCount,
      afk_gaps_longest_minutes: longestGapMinutes,
    };

    const ok = await upsertMetricFields(group.chatterId, group.date, group.orgId, messageFields);
    if (ok) written++;
  }

  // Compute response time trends
  await computeResponseTimeTrends(organisationId);
  // Compute rolling averages
  await computeRollingAverages(organisationId);

  console.log(`[Metrics] Computed ${written} records from messages`);
  return { computed: written };
}

// ─── Shared: Smart upsert (only writes specified fields) ────

async function upsertMetricFields(chatterId, reportDate, orgId, fields) {
  // Check if row exists
  const { data: existing } = await supabaseAdmin
    .from('chatter_daily_metrics')
    .select('id')
    .eq('chatter_id', chatterId)
    .eq('report_date', reportDate)
    .limit(1);

  if (existing && existing.length > 0) {
    // Update only the specified fields
    const { error } = await supabaseAdmin
      .from('chatter_daily_metrics')
      .update(fields)
      .eq('id', existing[0].id);

    if (error) {
      console.error(`[Metrics] Update error for ${chatterId}:`, error.message);
      return false;
    }
  } else {
    // Insert new row with defaults
    const { error } = await supabaseAdmin
      .from('chatter_daily_metrics')
      .insert({
        chatter_id: chatterId,
        creator_id: null,
        report_date: reportDate,
        organisation_id: orgId,
        // Defaults for all fields
        sales_today: 0, sales_7day_avg: 0, sales_30day_avg: 0, sales_today_vs_avg_pct: 0,
        response_time_avg_seconds: 0, response_time_p50_seconds: 0,
        response_time_p75_seconds: 0, response_time_p90_seconds: 0,
        response_time_trend: 'stable',
        chars_per_message: 0, golden_ratio: 0, unlock_rate: 0,
        workload_score: 0, workload_status: 'light',
        messages_sent: 0, fans_chatted: 0, active_conversations: 0,
        afk_gaps_count: 0, afk_gaps_longest_minutes: 0,
        // Override with provided fields
        ...fields,
      });

    if (error) {
      console.error(`[Metrics] Insert error for ${chatterId}:`, error.message);
      return false;
    }
  }
  return true;
}

// ─── Rolling averages ───────────────────────────────

async function computeRollingAverages(organisationId) {
  const { data: allMetrics } = await supabaseAdmin
    .from('chatter_daily_metrics')
    .select('id, chatter_id, report_date, sales_today')
    .eq('organisation_id', organisationId)
    .order('report_date', { ascending: false });

  if (!allMetrics || allMetrics.length === 0) return;

  // Group by chatter
  const byChatter = {};
  allMetrics.forEach(m => {
    if (!byChatter[m.chatter_id]) byChatter[m.chatter_id] = [];
    byChatter[m.chatter_id].push(m);
  });

  for (const [chatterId, records] of Object.entries(byChatter)) {
    for (let i = 0; i < records.length; i++) {
      const r = records[i];
      const salesValues = records.slice(i).map(x => parseFloat(x.sales_today) || 0);

      const avg7 = salesValues.slice(0, 7);
      const avg30 = salesValues.slice(0, 30);

      const sales7dayAvg = avg7.length > 0 ? Math.round(avg7.reduce((a, b) => a + b, 0) / avg7.length * 100) / 100 : 0;
      const sales30dayAvg = avg30.length > 0 ? Math.round(avg30.reduce((a, b) => a + b, 0) / avg30.length * 100) / 100 : 0;
      const vsAvgPct = sales7dayAvg > 0 ? Math.round(((parseFloat(r.sales_today) - sales7dayAvg) / sales7dayAvg) * 100) : 0;

      await supabaseAdmin
        .from('chatter_daily_metrics')
        .update({ sales_7day_avg: sales7dayAvg, sales_30day_avg: sales30dayAvg, sales_today_vs_avg_pct: vsAvgPct })
        .eq('id', r.id);
    }
  }
}

// ─── Response time trends ───────────────────────────

async function computeResponseTimeTrends(organisationId) {
  const { data: allMetrics } = await supabaseAdmin
    .from('chatter_daily_metrics')
    .select('id, chatter_id, report_date, response_time_avg_seconds')
    .eq('organisation_id', organisationId)
    .order('report_date', { ascending: false });

  if (!allMetrics || allMetrics.length === 0) return;

  const byChatter = {};
  allMetrics.forEach(m => {
    if (!byChatter[m.chatter_id]) byChatter[m.chatter_id] = [];
    byChatter[m.chatter_id].push(m);
  });

  for (const records of Object.values(byChatter)) {
    const rtValues = records.map(r => r.response_time_avg_seconds || 0);
    const recent3 = rtValues.slice(0, 3);
    const prior3 = rtValues.slice(3, 6);

    let trend = 'stable';
    if (recent3.length >= 2 && prior3.length >= 2) {
      const recentAvg = recent3.reduce((a, b) => a + b, 0) / recent3.length;
      const priorAvg = prior3.reduce((a, b) => a + b, 0) / prior3.length;
      trend = recentAvg < priorAvg * 0.9 ? 'improving' : recentAvg > priorAvg * 1.1 ? 'degrading' : 'stable';
    }

    // Update all records for this chatter with the trend
    for (const r of records) {
      await supabaseAdmin
        .from('chatter_daily_metrics')
        .update({ response_time_trend: trend })
        .eq('id', r.id);
    }
  }
}

// ─── Helpers ────────────────────────────────────────

function percentile(sortedArr, p) {
  if (sortedArr.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sortedArr.length) - 1;
  return sortedArr[Math.max(0, idx)];
}

module.exports = { computeMetricsForOrg, populateMetricsFromEmployeeStats };