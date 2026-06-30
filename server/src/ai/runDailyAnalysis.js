const { supabaseAdmin } = require('../utils/supabase');
const { analyzeComprehensive } = require('./agents/comprehensive');

/**
 * Run daily AI analysis for one chatter on one creator for one date
 * Single comprehensive agent — one API call for all 4 dimensions
 */
async function runDailyAnalysis(chatterId, creatorId, reportDate, orgId) {
  console.log(`[AI] Starting analysis for chatter=${chatterId} creator=${creatorId} date=${reportDate}`);

  // 1. Fetch messages using CEST-aware datetime range
  // DB stores times in CET (UTC+1). Infloww uses CEST in summer (UTC+2).
  // So Infloww's "May 21" starts at 23:00 CET May 20 (= 00:00 CEST May 21)
  const dateOffset = getCETtoCESTOffset(reportDate); // 1 in summer, 0 in winter
  const dayStart = `${reportDate}T00:00:00+00`;
  
  // Compute previous day for the offset window
  const prevDay = new Date(reportDate + 'T00:00:00Z');
  prevDay.setDate(prevDay.getDate() - 1);
  const prevDateStr = prevDay.toISOString().split('T')[0];
  const shiftedStart = dateOffset > 0 
    ? `${prevDateStr}T${String(24 - dateOffset).padStart(2,'0')}:00:00+00`
    : dayStart;
  const shiftedEnd = `${reportDate}T${String(24 - dateOffset).padStart(2,'0')}:00:00+00`;
  
  console.log(`[AI] Date range: ${shiftedStart} to ${shiftedEnd} (offset=${dateOffset}h)`);

  const allMessages = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabaseAdmin
      .from('messages')
      .select('*')
      .eq('organisation_id', orgId)
      .eq('creator_id', creatorId)
      .gte('sent_datetime', shiftedStart)
      .lt('sent_datetime', shiftedEnd)
      .order('sent_datetime', { ascending: true })
      .range(offset, offset + 999);
    if (error || !data || data.length === 0) break;
    allMessages.push(...data);
    if (data.length < 1000) break;
    offset += 1000;
  }

  if (allMessages.length === 0) {
    console.log(`[AI] No messages found, skipping`);
    return null;
  }

  // 2. Resolve chatter name
  const { data: chatter } = await supabaseAdmin
    .from('chatters').select('name').eq('id', chatterId).single();
  const chatterName = chatter?.name || 'Unknown';

  // Filter messages by this chatter
  const chatterMessages = allMessages.filter(m =>
    m.sender_name?.toLowerCase().trim() === chatterName.toLowerCase().trim()
  );

  if (chatterMessages.length === 0) {
    console.log(`[AI] No messages from ${chatterName}, skipping`);
    return null;
  }

  console.log(`[AI] Found ${chatterMessages.length} messages from ${chatterName}, ${allMessages.length} total on page`);

  // 3. Group by fan
  const conversations = groupByFan(chatterMessages, chatterName);
  console.log(`[AI] Grouped into ${conversations.length} conversations`);

  // 4. Get employee stats
  const { data: empStats } = await supabaseAdmin
    .from('employee_daily_stats')
    .select('*')
    .eq('chatter_id', chatterId)
    .eq('report_date', reportDate);
  const stats = empStats?.find(s => s.creator_id === creatorId) || empStats?.[0] || {};

  // 5. Get shift
  let shiftStart = 'unknown', shiftEnd = 'unknown';
  try {
    const { data } = await supabaseAdmin
      .from('chatter_creator_assignments')
      .select('shifts(start_time, end_time)')
      .eq('chatter_id', chatterId)
      .eq('creator_id', creatorId)
      .eq('is_active', true)
      .limit(1);
    if (data?.[0]?.shifts) {
      shiftStart = data[0].shifts.start_time?.slice(0, 5) || 'unknown';
      shiftEnd = data[0].shifts.end_time?.slice(0, 5) || 'unknown';
    }
  } catch {}

  // 6. Get creator name
  const { data: creator } = await supabaseAdmin
    .from('creators').select('name').eq('id', creatorId).single();

  // 6b. Get fan spending data for all fans in these conversations
  const fanUsernames = conversations.map(c => c.fan_username).filter(Boolean);
  let fanSpendingMap = {};
  if (fanUsernames.length > 0) {
    try {
      const { data: spendData } = await supabaseAdmin
        .from('fan_spending')
        .select('username, display_name, total_spend, ppv_sales, tips, classification')
        .eq('organisation_id', orgId)
        .in('username', fanUsernames);
      if (spendData) {
        spendData.forEach(f => {
          fanSpendingMap[f.username] = f;
        });
      }
    } catch {}
  }
  console.log(`[AI] Fan spending context: ${Object.keys(fanSpendingMap).length}/${fanUsernames.length} fans matched`);

  // 7. Compute AFK periods (gaps > 20 min within shift, not between shifts)
  const afkPeriods = computeAfkPeriods(chatterMessages, shiftStart, shiftEnd);
  if (afkPeriods.length > 0) {
    console.log(`[AI] Detected ${afkPeriods.length} AFK periods`);
  }

  // 7b. Compute reply-time stats in CODE (not AI). Reply time is only valid on
  // rows where the chatter actually replied to a fan message; burst/follow-up
  // rows have no reply time and must NOT be counted as slow. This kills both the
  // false "long reply time" flags and the missed real slow replies.
  const rtStats = computeReplyTimeStats(chatterMessages);
  console.log(`[AI] Reply time: overall avg ${rtStats.avg_overall_seconds}s, ${rtStats.slow_replies.length} slow (>150s)`);

  // 8. Run single comprehensive agent
  console.log(`[AI] Running comprehensive analysis...`);
  const result = await analyzeComprehensive(conversations, {
    chatter_name: chatterName,
    creator_name: creator?.name || 'Unknown',
    report_date: reportDate,
    shift_start: shiftStart,
    shift_end: shiftEnd,
    messages_sent: stats.messages_sent || chatterMessages.length,
    fans_chatted: stats.fans_chatted || conversations.length,
    clocked_hours: stats.clocked_hours_raw || 'unknown',
    fan_spending: fanSpendingMap,
    afk_periods: afkPeriods,
    reply_time_stats: rtStats,
  });

  console.log(`[AI] Analysis complete: overall=${result.scores?.overall} comm=${result.scores?.communication} sales=${result.scores?.sales} disc=${result.scores?.discipline} comp=${result.scores?.compliance}`);

  // 9. Save to database (unified format)
  const convs = result.conversations || [];
  const allSales = convs.flatMap(c => (c.sales || []).map(s => ({ ...s, fan: c.fan, username: c.username, tier: c.tier })));
  const soldSales = allSales.filter(s => s.sold);
  const failedSales = allSales.filter(s => !s.sold);

  const analysisRow = {
    chatter_id: chatterId,
    creator_id: creatorId,
    report_date: reportDate,
    overall_score: result.scores?.overall || 0,
    communication_score: result.scores?.communication || 0,
    sales_score: result.scores?.sales || 0,
    discipline_score: result.scores?.discipline || 0,
    compliance_score: result.scores?.compliance || 0,
    summary: result.summary || '',
    communication_report: result.stats || {},
    sales_report: { sold: soldSales, failed: failedSales },
    discipline_report: { afk_periods: afkPeriods },
    compliance_report: {},
    good_cases: convs.filter(c => c.verdict === 'good'),
    bad_cases: convs,
    flagged_items: convs.filter(c => c.verdict === 'critical'),
    auto_tasks: [],
    organisation_id: orgId,
  };

  const { error: upsertError } = await supabaseAdmin
    .from('ai_daily_analyses')
    .upsert(analysisRow, { onConflict: 'chatter_id,creator_id,report_date' });

  if (upsertError) {
    console.error(`[AI] Save error:`, upsertError.message);
    return null;
  }

  console.log(`[AI] Saved. ${convs.length} conversations (${soldSales.length} sold, ${failedSales.length} failed), ${afkPeriods.length} AFK periods.`);
  return analysisRow;
}

/**
 * Run for ALL chatters in an org
 */
async function runDailyAnalysisForOrg(orgId, reportDate) {
  console.log(`[AI] Running org-wide analysis for ${reportDate}...`);

  const { data: chatters } = await supabaseAdmin
    .from('chatters')
    .select('id, name, chatter_creator_assignments(creator_id, is_active)')
    .eq('organisation_id', orgId)
    .eq('is_active', true);

  if (!chatters) return { analyzed: 0 };
  let analyzed = 0;

  for (const chatter of chatters) {
    const active = chatter.chatter_creator_assignments?.filter(a => a.is_active) || [];
    for (const assignment of active) {
      try {
        const result = await runDailyAnalysis(chatter.id, assignment.creator_id, reportDate, orgId);
        if (result) analyzed++;
      } catch (err) {
        console.error(`[AI] Error analyzing ${chatter.name}:`, err.message);
      }
    }
  }

  console.log(`[AI] Org analysis complete: ${analyzed} pairs analyzed`);
  return { analyzed };
}

// ─── Helpers ────────────────────────────────────────

/**
 * Returns the offset from CET (DB timezone) to Amsterdam local time
 * Summer (CEST): returns 1 (Amsterdam is UTC+2, DB is UTC+1, diff = 1)
 * Winter (CET): returns 0 (both are UTC+1, diff = 0)
 */
function getCETtoCESTOffset(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z');
  const utcHour = d.getUTCHours();
  const amHour = parseInt(d.toLocaleString('en', {
    timeZone: 'Europe/Amsterdam', hour: 'numeric', hour12: false
  }));
  return (amHour - utcHour) - 1; // UTC→Amsterdam minus 1 (CET base)
}

/**
 * Compute reply-time stats in code from raw chatter rows.
 * replay_time_seconds is only meaningful when the chatter was replying to a fan
 * message (fan_message_text present). Burst/follow-up rows have no reply time and
 * are excluded so they can't register as "slow". This removes both the false
 * "long reply time" flags and the missed real slow replies.
 */
function computeReplyTimeStats(messages, slowThresholdSec = 150) {
  const valid = messages.filter(m =>
    m.fan_message_text && m.fan_message_text.trim() &&
    typeof m.replay_time_seconds === 'number' && m.replay_time_seconds > 0
  );

  const all = valid.map(m => m.replay_time_seconds);
  const sales = valid.filter(m => (parseFloat(m.price) || 0) > 0).map(m => m.replay_time_seconds);
  const avg = arr => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;

  const slow = valid
    .filter(m => m.replay_time_seconds > slowThresholdSec)
    .map(m => ({
      fan_username: m.sent_to_username,
      fan_nickname: m.sent_to_nickname || m.sent_to_username,
      time: (m.sent_time || '').slice(0, 5),
      datetime: m.sent_datetime || null,
      reply_time_seconds: m.replay_time_seconds,
      reply_time_min: Math.round(m.replay_time_seconds / 60),
    }))
    .sort((a, b) => b.reply_time_seconds - a.reply_time_seconds);

  return {
    avg_overall_seconds: avg(all),
    avg_during_sales_seconds: avg(sales),
    valid_reply_count: all.length,
    slow_threshold_seconds: slowThresholdSec,
    slow_replies: slow,
  };
}

function computeAfkPeriods(messages, shiftStart, shiftEnd, thresholdMin = 20) {
  if (messages.length < 2) return [];
  
  const sorted = [...messages]
    .filter(m => m.sent_datetime)
    .sort((a, b) => new Date(a.sent_datetime) - new Date(b.sent_datetime));
  
  // Parse shift times to determine shift duration
  const shiftStartH = shiftStart !== 'unknown' ? parseInt(shiftStart.split(':')[0]) : null;
  const shiftEndH = shiftEnd !== 'unknown' ? parseInt(shiftEnd.split(':')[0]) : null;
  
  // Calculate expected shift length in hours
  let shiftLengthH = 8; // default
  if (shiftStartH !== null && shiftEndH !== null) {
    shiftLengthH = shiftEndH > shiftStartH 
      ? shiftEndH - shiftStartH 
      : (24 - shiftStartH) + shiftEndH;
  }
  
  // Max gap to flag: anything longer than shift length is between-shift, not AFK
  const maxGapMin = shiftLengthH * 60;
  
  const periods = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1].sent_datetime);
    const curr = new Date(sorted[i].sent_datetime);
    const gapMin = (curr - prev) / 60000;
    
    // Only flag gaps between threshold (20 min) and max shift length
    // Gaps longer than shift length are between-shift gaps, not AFK
    if (gapMin >= thresholdMin && gapMin < maxGapMin) {
      const fromTime = sorted[i - 1].sent_time || '';
      const toTime = sorted[i].sent_time || '';
      periods.push({
        from: fromTime.slice(0, 5),
        to: toTime.slice(0, 5),
        duration_min: Math.round(gapMin),
      });
    }
  }
  return periods;
}

function groupByFan(messages, chatterName) {
  const convMap = {};

  // Each DB row may carry a fan message AND a chatter reply, recorded at the
  // same sent_datetime. Emit BOTH as separate timeline events. Rows with an
  // empty fan message are multi-message bursts (the chatter spoke again before
  // the fan replied) — they are kept as chatter-only events, never dropped.
  // We attach the full sent_datetime to every event so the conversation can be
  // ordered chronologically even when it crosses midnight.
  messages.forEach(m => {
    const fanKey = m.sent_to_username || 'unknown';
    if (!convMap[fanKey]) {
      convMap[fanKey] = {
        fan_username: m.sent_to_username,
        fan_nickname: m.sent_to_nickname || m.sent_to_username,
        messages: [],
        message_count: 0,
      };
    }

    const conv = convMap[fanKey];
    const dt = m.sent_datetime || null;

    if (m.fan_message_text && m.fan_message_text.trim()) {
      conv.messages.push({
        type: 'fan',
        datetime: dt,
        time: m.sent_time || '',
        text: m.fan_message_text.trim(),
      });
    }

    if (m.creator_message_text && m.creator_message_text.trim()) {
      conv.messages.push({
        type: 'chatter',
        datetime: dt,
        time: m.sent_time || '',
        text: m.creator_message_text.trim(),
        price: parseFloat(m.price) || 0,
        purchased: m.purchased,
        response_time: m.replay_time_seconds || 0,
      });
      conv.message_count++;
    }
  });

  // Sort every conversation's events chronologically by full datetime.
  // Within the same row/datetime, the fan message precedes the chatter reply.
  const typeRank = { fan: 0, chatter: 1 };
  Object.values(convMap).forEach(conv => {
    conv.messages.sort((a, b) => {
      const ta = a.datetime ? new Date(a.datetime).getTime() : 0;
      const tb = b.datetime ? new Date(b.datetime).getTime() : 0;
      if (ta !== tb) return ta - tb;
      return (typeRank[a.type] ?? 0) - (typeRank[b.type] ?? 0);
    });
  });

  return Object.values(convMap).filter(c => c.messages.length > 0);
}

async function createAutoTasks(autoTasks, chatterId, creatorId, orgId) {
  const { data: cycles } = await supabaseAdmin
    .from('cycles').select('id').eq('organisation_id', orgId).eq('status', 'active').limit(1);
  const cycleId = cycles?.[0]?.id;

  let created = 0;
  for (const task of autoTasks) {
    const { error } = await supabaseAdmin.from('tasks').insert({
      title: task.title,
      description: task.description || '',
      task_type: 'ai_generated',
      priority: task.priority || 3,
      chatter_id: chatterId,
      creator_id: creatorId,
      cycle_id: cycleId,
      requires_screenshots: false,
      organisation_id: orgId,
    });
    if (error) {
      console.error(`[AI] Task failed: ${error.message} — "${task.title}"`);
    } else {
      created++;
    }
  }
  console.log(`[AI] Created ${created}/${autoTasks.length} auto-tasks`);
}

module.exports = { runDailyAnalysis, runDailyAnalysisForOrg };