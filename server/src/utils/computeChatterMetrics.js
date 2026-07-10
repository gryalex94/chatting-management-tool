const { supabaseAdmin } = require('./supabase');

/**
 * Compute chatter_daily_metrics from the messages table.
 *
 * KEY MODEL (per project decisions):
 *  - The unit of evaluation is the CHATTER'S WHOLE DAY across ALL pages, because
 *    chatters cover several pages simultaneously. So workload, AFK, and the
 *    day-level reply-time are computed on a MERGED timeline of all their messages.
 *  - We still write one row PER (chatter, creator, date) so the page-grouped UI
 *    can show per-page volume/sales — but the DAY-LEVEL signals (workload, AFK,
 *    day reply-time, words/msg) are computed once and stamped onto every page row.
 *
 *  Signals:
 *   - reply time: only genuine replies to a fan message (fan_message_text present).
 *   - workload: 2x2 of volume (msgs/active-hour, merged day) x reply speed:
 *       high vol + slow  -> overloaded   (drowning, forgivable)
 *       low  vol + slow  -> underperforming (no excuse) [stored as 'light' + low score, flagged separately]
 *       high vol + fast  -> healthy      (crushing it)
 *       low  vol + fast  -> light        (quiet, fine)
 *   - AFK: a merged-day gap > AFK_GAP_MIN that COINCIDES with waiting fans
 *       (reply times > WAITING_RT_SEC around the gap). A long quiet stretch
 *       followed by snappy replies = no incoming work = NOT afk.
 *   - words/msg: cheap quality hint for the AI layer (not a judgment).
 */

const AFK_GAP_MIN = 30;        // a silence longer than this is a candidate gap
const MAX_GAP_MIN = 180;       // gaps longer than 3h are between-session/overnight, not AFK
const WAITING_RT_SEC = 300;    // 5 min: fans waited this long => work was pending
const HIGH_VOL_PER_HOUR = 40;  // >= this msgs/active-hour = high volume
const HIGH_VOL_TOTAL = 250;    // OR >= this total messages/day = high volume regardless of rate
const SLOW_DAY_RT_SEC = 150;   // day avg reply slower than this = "slow"

async function computeChatterDailyMetrics(organisationId, tzOffsetHours = 1) {
  console.log(`[Metrics] Computing chatter daily metrics (merged-day model, tz +${tzOffsetHours}h)...`);

  const { data: chatters } = await supabaseAdmin
    .from('chatters').select('id, name').eq('organisation_id', organisationId);
  if (!chatters?.length) { console.log('[Metrics] No chatters'); return { computed: 0 }; }
  const chatterMap = {};
  chatters.forEach(c => { chatterMap[c.name.toLowerCase().trim()] = c.id; });

  // Fan spending tiers (for incident detail + prioritisation).
  // Source of truth is the `subscribers` table (rebuilt from PPV sales).
  const fanTier = {};
  try {
    let foff = 0;
    while (true) {
      const { data, error } = await supabaseAdmin
        .from('subscribers')
        .select('username, total_spend, classification, first_seen')
        .eq('organisation_id', organisationId)
        .range(foff, foff + 999);
      if (error || !data?.length) break;
      data.forEach(f => { fanTier[f.username] = f; });
      if (data.length < 1000) break;
      foff += 1000;
    }
  } catch (e) { /* subscribers optional */ }

  const all = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabaseAdmin
      .from('messages')
      .select('sender_name, creator_id, sent_datetime, sent_time, replay_time_seconds, price, purchased, fan_message_text, creator_message_text, sent_to_username, sent_to_nickname, organisation_id')
      .eq('organisation_id', organisationId)
      .order('sent_datetime', { ascending: true })
      .range(offset, offset + 999);
    if (error) { console.error('[Metrics] fetch error', error.message); break; }
    if (!data?.length) break;
    all.push(...data);
    if (data.length < 1000) break;
    offset += 1000;
  }
  if (!all.length) { console.log('[Metrics] No messages'); return { computed: 0 }; }
  console.log(`[Metrics] Fetched ${all.length} messages`);

  // Tag every message with chatter id + display date, drop unmatched.
  const tagged = [];
  for (const m of all) {
    const cid = chatterMap[m.sender_name?.toLowerCase().trim()];
    if (!cid || !m.creator_id || !m.sent_datetime) continue;
    tagged.push({ ...m, _cid: cid, _date: shiftDate(m.sent_datetime, tzOffsetHours), _ts: new Date(m.sent_datetime).getTime() });
  }

  // ---- DAY level: group by chatter|date (ALL pages merged) ----
  const dayGroups = {};
  for (const m of tagged) {
    const k = `${m._cid}|${m._date}`;
    (dayGroups[k] ||= []).push(m);
  }

  // First date we ever messaged each fan (any chatter), for new-sub detection.
  // A fan is "new" on a given day if their earliest contact == that day (or later).
  const fanFirstContact = {};
  for (const m of tagged) {
    if (!m.sent_to_username) continue;
    const u = m.sent_to_username;
    if (!fanFirstContact[u] || m._date < fanFirstContact[u]) fanFirstContact[u] = m._date;
  }

  // Earliest date in the whole dataset — used to know if a given day has prior
  // history loaded (needed for trustworthy new-sub detection).
  const allDates = tagged.map(m => m._date).sort();
  const earliestDate = allDates[0];

  // Compute day-level signals once per chatter-day.
  const daySignals = {}; // key chatter|date -> {workload, afk, dayRT, wordsPerMsg, incidents}
  for (const [k, msgs] of Object.entries(dayGroups)) {
    const date = k.split('|')[1];
    // fans this chatter spoke to today who we had ALSO contacted before today
    const priorContact = new Set();
    for (const m of msgs) {
      if (m.sent_to_username && fanFirstContact[m.sent_to_username] < date) priorContact.add(m.sent_to_username);
    }
    msgs._priorContact = priorContact;
    msgs._historyReliable = date > earliestDate;   // there are loaded days before this one
    msgs._date = date;                             // report day, for fan-age (new-sub vs time-waster)
    daySignals[k] = computeDaySignals(msgs, fanTier);
  }

  // ---- PAGE level: group by chatter|creator|date for per-page volume/sales ----
  const pageGroups = {};
  for (const m of tagged) {
    const k = `${m._cid}|${m.creator_id}|${m._date}`;
    (pageGroups[k] ||= { chatter_id: m._cid, creator_id: m.creator_id, report_date: m._date, org: m.organisation_id, msgs: [] }).msgs.push(m);
  }

  let written = 0;
  for (const g of Object.values(pageGroups)) {
    const dayKey = `${g.chatter_id}|${g.report_date}`;
    const day = daySignals[dayKey];
    const msgs = g.msgs;

    // per-page volume & sales
    const chatterMsgs = msgs.filter(m => m.creator_message_text && m.creator_message_text.trim());
    const messagesSent = chatterMsgs.length;
    const fans = new Set(msgs.map(m => m.sent_to_username).filter(Boolean));
    const ppvsSent = chatterMsgs.filter(m => (parseFloat(m.price) || 0) > 0).length;
    const ppvsUnlocked = chatterMsgs.filter(m => (parseFloat(m.price) || 0) > 0 && m.purchased).length;
    const fansWhoSpent = new Set(chatterMsgs.filter(m => m.purchased).map(m => m.sent_to_username).filter(Boolean)).size;
    const salesToday = chatterMsgs.filter(m => m.purchased).reduce((s, m) => s + (parseFloat(m.price) || 0), 0);
    const unlockRate = ppvsSent > 0 ? Math.round((ppvsUnlocked / ppvsSent) * 100) : 0;
    const goldenRatio = messagesSent > 0 ? Math.round((ppvsSent / messagesSent) * 10000) / 100 : 0;

    const row = {
      chatter_id: g.chatter_id,
      creator_id: g.creator_id,
      report_date: g.report_date,
      organisation_id: g.org,
      sales_today: Math.round(salesToday * 100) / 100,
      // DAY-LEVEL signals (same across all this chatter's pages today):
      response_time_avg_seconds: day.dayRT.avg,
      response_time_p50_seconds: day.dayRT.p50,
      response_time_p75_seconds: day.dayRT.p75,
      response_time_p90_seconds: day.dayRT.p90,
      response_time_trend: 'stable',
      workload_score: day.workload.score,
      workload_status: day.workload.status,
      afk_gaps_count: day.afk.count,
      afk_gaps_longest_minutes: day.afk.longest,
      slow_reply_incidents: day.slowIncidents,
      afk_incidents: day.afk.incidents,
      words_per_message: day.wordsPerMsg,
      workload_underperforming: day.workload.underperforming,
      first_message_time: day.firstMessageTime,
      // PER-PAGE volume:
      golden_ratio: goldenRatio,
      unlock_rate: unlockRate,
      messages_sent: messagesSent,
      fans_chatted: fans.size,
      active_conversations: fans.size,
      ppvs_sent: ppvsSent,
      ppvs_unlocked: ppvsUnlocked,
      fans_who_spent: fansWhoSpent,
    };

    const { error } = await supabaseAdmin
      .from('chatter_daily_metrics')
      .upsert(row, { onConflict: 'chatter_id,creator_id,report_date' });
    if (error) console.error(`[Metrics] upsert error:`, error.message);
    else written++;
  }

  console.log(`[Metrics] Wrote ${written} rows (${Object.keys(dayGroups).length} chatter-days merged)`);
  return { computed: written };
}

/**
 * Day-level signals from a chatter's merged messages across all pages.
 * Captures individual incidents (fan, time, reply-time, messages, tier) so the
 * manager can act without digging.
 */
function computeDaySignals(dayMsgs, fanTier = {}) {
  const msgs = [...dayMsgs].sort((a, b) => a._ts - b._ts);

  // First OUTBOUND message of the day = proxy for when the chatter actually
  // started working (used for punctuality vs. their scheduled shift start).
  const firstOut = msgs.find(m => m.creator_message_text && m.creator_message_text.trim());
  const firstMessageTs = firstOut ? firstOut._ts : null;
  const firstMessageTime = firstOut ? new Date(firstOut._ts).toISOString().slice(11, 16) : null;

  // Whether we have ANY message history before this day. If not, "no prior
  // contact" is meaningless (it just means history isn't loaded), so we do NOT
  // call unknown fans "new subs" — they default to non-spender. New-sub detection
  // sharpens automatically once earlier days are loaded.
  const historyReliable = dayMsgs._historyReliable === true;

  // Priority for triage: NEW SUB > WHALE > SPENDER > NON-SPENDER.
  // This is a risk-of-loss ranking, not a dollar ranking: a fragile new sub is
  // easiest to lose to a bad first impression; a whale is resilient but high-value.
  // priorityRank: lower number = higher priority (sorts first).
  const tierOf = (username, hadPriorContact) => {
    const f = fanTier[username];
    const spend = f ? (parseFloat(f.total_spend) || 0) : 0;
    const cls = f ? f.classification : null;
    const firstSeen = f && f.first_seen ? String(f.first_seen).slice(0, 10) : null;
    let tier;
    if (cls === 'whale' || spend >= 1000) tier = 'whale';    // whale threshold $1000+
    else if (cls === 'ps' || spend >= 100) tier = 'spender';
    else if (spend > 0) tier = 'low';
    else tier = 'new';                                   // no spend recorded

    // For $0-spend fans, separate genuine NEW SUBS (worth chasing) from TIME-WASTERS
    // (subscribed a while, never spent — their waits don't matter). Prefer the
    // subscribers.first_seen age signal; fall back to loaded message history.
    let effective = tier;
    if (spend === 0) {
      const today = dayMsgs._date || null;
      const ageDays = (firstSeen && today)
        ? Math.round((new Date(today + 'T00:00:00Z') - new Date(firstSeen + 'T00:00:00Z')) / 86400000)
        : null;
      const genuinelyNew = ageDays != null ? ageDays <= 7 : (historyReliable && hadPriorContact === false);
      const timeWaster   = ageDays != null ? ageDays > 14 : (historyReliable && hadPriorContact === true);
      if (genuinelyNew) effective = 'new_sub';
      else if (timeWaster) effective = 'time_waster';        // else 8–14d / unknown → ordinary 'new'
    }
    // priorityRank: lower = triage first. time_waster ranks LAST (waits don't matter).
    const priorityRank = { new_sub: 0, whale: 1, spender: 2, low: 3, new: 4, time_waster: 6 }[effective] ?? 5;
    return { tier: effective, spend: Math.round(spend), priorityRank };
  };

  // Which fans had we messaged on a PRIOR day? (for new-sub detection)
  // Built by the caller and passed in via priorContact set; default: unknown(false-safe).
  const priorContact = dayMsgs._priorContact || new Set();

  // genuine replies (fan message present)
  const replies = msgs.filter(m => m.fan_message_text && m.fan_message_text.trim() &&
                 typeof m.replay_time_seconds === 'number' && m.replay_time_seconds > 0 &&
                 m.replay_time_seconds < 7200);
  const validRT = replies.map(m => m.replay_time_seconds).sort((a, b) => a - b);
  const avg = validRT.length ? Math.round(validRT.reduce((a, b) => a + b, 0) / validRT.length) : 0;
  const dayRT = { avg, p50: pctile(validRT, 50), p75: pctile(validRT, 75), p90: pctile(validRT, 90) };

  // SLOW REPLIES grouped PER SUBSCRIBER (not per incident).
  // The same sub kept waiting 3× is ONE row: count + worst wait + when + the
  // chatter's message on that worst instance (so the manager can search for it
  // to open the dialogue). Sorted by fan priority, then worst wait.
  const bySub = {};
  for (const m of replies) {
    if (m.replay_time_seconds <= WAITING_RT_SEC) continue;     // 5min+ : a real wait
    const u = m.sent_to_username || (m.sent_to_nickname || 'unknown');
    if (!bySub[u]) {
      const had = priorContact.has(m.sent_to_username);
      const t = tierOf(m.sent_to_username, had);
      bySub[u] = {
        fan_nickname: m.sent_to_nickname || m.sent_to_username,
        fan_username: m.sent_to_username,
        creator_id: m.creator_id,    // which page this fan was waiting on (merged-day: may differ from the chatter's primary page)
        tier: t.tier, spend: t.spend, priority_rank: t.priorityRank,
        count: 0,
        worst_reply_seconds: 0, worst_reply_min: 0,
        worst_time: '', worst_chatter_message: '', worst_fan_message: '',
      };
    }
    const s = bySub[u];
    s.count++;
    if (m.replay_time_seconds > s.worst_reply_seconds) {
      s.worst_reply_seconds = m.replay_time_seconds;
      s.worst_reply_min = Math.round(m.replay_time_seconds / 60);
      s.worst_time = (m.sent_time || '').slice(0, 5);
      s.creator_id = m.creator_id;     // page of the worst wait

      s.worst_chatter_message = (m.creator_message_text || '').slice(0, 200);
      s.worst_fan_message = (m.fan_message_text || '').slice(0, 200);
    }
  }
  const slowIncidents = Object.values(bySub)
    .sort((a, b) => a.priority_rank - b.priority_rank || b.worst_reply_seconds - a.worst_reply_seconds);

  // volume over active span (excluding cross-session breaks)
  const chatterMsgs = msgs.filter(m => m.creator_message_text && m.creator_message_text.trim());
  const times = chatterMsgs.map(m => m._ts).sort((a, b) => a - b);
  let activeMs = 0;
  for (let i = 1; i < times.length; i++) {
    const gap = times[i] - times[i - 1];
    if (gap <= MAX_GAP_MIN * 60000) activeMs += gap;
  }
  const spanHours = activeMs / 3600000;
  const msgsPerHour = spanHours > 0.25 ? chatterMsgs.length / spanHours : chatterMsgs.length;

  // workload 2x2 (volume x reply speed)
  const highVol = msgsPerHour >= HIGH_VOL_PER_HOUR || chatterMsgs.length >= HIGH_VOL_TOTAL;
  const slow = avg >= SLOW_DAY_RT_SEC;
  let status, score;
  if (highVol && slow) { status = 'overloaded'; score = 90; }
  else if (!highVol && slow) { status = 'light'; score = 15; }
  else if (highVol && !slow) { status = 'healthy'; score = 70; }
  else { status = 'light'; score = 40; }
  const underperforming = (!highVol && slow);
  const workload = { status, score, msgs_per_hour: Math.round(msgsPerHour * 10) / 10, total_messages: chatterMsgs.length, underperforming };

  // AFK INCIDENTS — gap (30min..3h) with waiting fans, full detail per gap
  const afkIncidents = [];
  for (let i = 1; i < chatterMsgs.length; i++) {
    const prev = chatterMsgs[i - 1], curr = chatterMsgs[i];
    const gapMin = (curr._ts - prev._ts) / 60000;
    if (gapMin <= AFK_GAP_MIN || gapMin >= MAX_GAP_MIN) continue;
    // fans who messaged during the gap and waited
    const waitingFans = msgs.filter(m => m.fan_message_text && m._ts > prev._ts && m._ts < curr._ts &&
                                         m.replay_time_seconds && m.replay_time_seconds > WAITING_RT_SEC);
    const endWaited = curr.replay_time_seconds && curr.replay_time_seconds > WAITING_RT_SEC;
    if (!waitingFans.length && !endWaited) continue;
    const t = tierOf(curr.sent_to_username, priorContact.has(curr.sent_to_username));
    afkIncidents.push({
      gap_minutes: Math.round(gapMin),
      creator_id: curr.creator_id || prev.creator_id || null,   // which page they resumed on
      from_time: new Date(prev._ts).toISOString().slice(11, 16),
      to_time: new Date(curr._ts).toISOString().slice(11, 16),
      // the chatter's own messages bracketing the gap, so the manager can search
      // for them in Infloww — who they were talking to + what they said.
      before_username: prev.sent_to_username || prev.sent_to_nickname || null,
      before_message: (prev.creator_message_text || '').slice(0, 200),
      resumed_username: curr.sent_to_username || curr.sent_to_nickname || null,
      resumed_message: (curr.creator_message_text || '').slice(0, 200),
      resumed_with_fan: curr.sent_to_nickname || curr.sent_to_username,
      resumed_tier: t.tier, resumed_spend: t.spend,
      resumed_reply_time_min: curr.replay_time_seconds ? Math.round(curr.replay_time_seconds / 60) : null,
      waiting_fans: waitingFans.slice(0, 5).map(m => ({
        fan: m.sent_to_nickname || m.sent_to_username,
        username: m.sent_to_username || null,
        waited_min: Math.round((m.replay_time_seconds || 0) / 60),
      })),
    });
  }
  const afk = {
    count: afkIncidents.length,
    longest: afkIncidents.reduce((mx, a) => Math.max(mx, a.gap_minutes), 0),
    incidents: afkIncidents,
  };

  // words per message (cheap quality hint)
  const totalWords = chatterMsgs.reduce((s, m) => s + countWords(m.creator_message_text), 0);
  const wordsPerMsg = chatterMsgs.length ? Math.round((totalWords / chatterMsgs.length) * 10) / 10 : 0;

  // High-priority misses: new subs + whales the chatter kept waiting (per-sub).
  const highPriorityMisses = slowIncidents.filter(i => i.priority_rank <= 1);
  const topMiss = highPriorityMisses[0] || slowIncidents[0] || null;

  return { dayRT, workload, afk, wordsPerMsg, slowIncidents, highPriorityMisses, topMiss, firstMessageTime, firstMessageTs };
}

function classifyWorkload(msgsPerHour, fans) {
  // kept for backward-compat / external callers; simple band version
  let status;
  if (msgsPerHour < 20) status = 'light';
  else if (msgsPerHour < 40) status = 'healthy';
  else status = 'overloaded';
  return { status, score: Math.min(100, Math.round((msgsPerHour / 60) * 100)) };
}

function shiftDate(datetimeStr, offsetH) {
  const m = String(datetimeStr).match(/(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return String(datetimeStr).slice(0, 10);
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)));
  d.setUTCHours(d.getUTCHours() + offsetH);
  const p = n => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}
function pctile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}
function countWords(t) {
  if (!t) return 0;
  return String(t).trim().split(/\s+/).filter(Boolean).length;
}

module.exports = { computeChatterDailyMetrics, classifyWorkload, computeDaySignals };
