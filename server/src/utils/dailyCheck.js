const { supabaseAdmin } = require('./supabase');

/**
 * Daily Check engine.
 *
 * Reads stored daily FACTS (creator_daily_stats, chatter_daily_metrics) and
 * STANDARDS (daily_check_config), computes page metrics (ratio, LTV, baselines)
 * and chatter signals on the fly, emits flags into anomaly_flags, and returns a
 * page-grouped triage structure for the UI.
 *
 * Nothing computed here is treated as source-of-truth — it is all re-derivable
 * from the stored facts, so re-running for a date refreshes cleanly.
 */
async function runDailyCheck(orgId, reportDate) {
  const cfg = await loadConfig(orgId);
  const commission = num(cfg.of_commission_pct, 20) / 100;
  const netFactor = 1 - commission;

  // ---- pull facts ----
  const pageStats = await pageStatsUpTo(orgId, reportDate, num(cfg.baseline_window_days, 14));
  const chatterRows = await chatterMetricsForDate(orgId, reportDate);
  const creators = await creatorNameMap(orgId);
  const chatters = await chatterNameMap(orgId);

  const flags = [];          // flat list, stored to anomaly_flags
  const pages = {};          // grouped output

  // ============ PAGE-LEVEL ============
  for (const [creatorId, history] of Object.entries(pageStats)) {
    const today = history.find(h => h.report_date === reportDate);
    if (!today) continue;
    const prior = history.filter(h => h.report_date < reportDate);

    // metrics
    // Windows per Rice policy: ratio over 2 weeks, LTV over 30 days (vs the 30-day
    // window ending 7 days earlier), revenue trend week-over-week, baseline 30 days.
    const ratioWindowDays = num(cfg.ratio_window_days, 14);   // 2-week ratio
    const ltvWindowDays   = num(cfg.ltv_window_days, 30);     // 30-day LTV
    const trendWindowDays = num(cfg.trend_window_days, 7);    // week-over-week revenue
    const baselineDays    = num(cfg.baseline_window_days, 30);// wider baseline = steadier "normal"
    const ratio = computeRatio(history, reportDate, ratioWindowDays);
    const ltvWindow = computeLtvWindow(history, reportDate, ltvWindowDays, netFactor);
    const ltvPriorWindow = computeLtvWindow(history, shiftDays(reportDate, -7), ltvWindowDays, netFactor);
    const revToday = today.total_earnings_gross * netFactor;
    const baselineRows = prior.slice(-baselineDays);
    const revBaseline = avg(baselineRows.map(h => h.total_earnings_gross * netFactor));

    // week-over-week revenue (net): this trend window and the one before it.
    const histUpTo = history.filter(h => h.report_date <= reportDate);
    const windowRows = histUpTo.slice(-trendWindowDays);
    const priorWindowRows = histUpTo.slice(-trendWindowDays * 2, -trendWindowDays);
    const revenue7d = round2(sum(windowRows.map(h => h.total_earnings_gross * netFactor)));
    const revenue7dPrior = round2(sum(priorWindowRows.map(h => h.total_earnings_gross * netFactor)));

    // Dates behind the LTV window (widest) so gaps in the 30-day LTV are visible.
    const windowDates = histUpTo.slice(-ltvWindowDays).map(h => h.report_date);
    const baselineDates = baselineRows.map(h => h.report_date);

    const page = pages[creatorId] = {
      creator_id: creatorId,
      creator_name: creators[creatorId] || today.creator_name,
      is_free: today.total_subscription_gross === 0,
      metrics: {
        ratio: ratio,
        ratio_target: num(cfg.ratio_target, 5),
        ltv_7day: round2(ltvWindow),
        ltv_7day_prior: round2(ltvPriorWindow),
        revenue_net: round2(revToday),
        revenue_baseline_net: round2(revBaseline),
        revenue_7d: revenue7d,
        revenue_7d_prior: revenue7dPrior,
        subscriber_count: (today.new_subscribers || 0) + (today.subscriber_renewals || 0),
        new_subscribers: today.new_subscribers || 0,
        // ltv_7day/_prior keys kept for back-compat but now hold the 30-DAY LTV
        // (vs the 30-day window ending 7 days earlier). Ratio is over 2 weeks.
        ltv_window_days: ltvWindowDays,
        ratio_window_days: ratioWindowDays,
        window_dates: windowDates,          // dates behind the 30-day LTV window
        baseline_dates: baselineDates,      // dates behind the revenue baseline
      },
      flags: [],
      chatters: {},
    };

    // ratio flag (paid pages only)
    if (!page.is_free && ratio != null && ratio < num(cfg.ratio_target, 5)) {
      page.flags.push(mkFlag('page', creatorId, null, reportDate, 'ratio_below_5', 'high',
        `Ratio ${ratio.toFixed(1)} is below target ${num(cfg.ratio_target, 5)} (tips+PPV vs subscriptions)`, orgId,
        { ratio, target: num(cfg.ratio_target, 5) }));
    }
    // bad / good day vs baseline — only on pages with meaningful revenue
    const minRev = num(cfg.min_revenue_floor, 50);
    if (revBaseline >= minRev) {
      const dropPct = ((revBaseline - revToday) / revBaseline) * 100;
      if (dropPct > num(cfg.bad_day_drop_pct, 90)) {
        page.flags.push(mkFlag('page', creatorId, null, reportDate, 'earnings_drop', 'high',
          `Revenue $${round2(revToday)} is ${Math.round(dropPct)}% below $${Math.round(revBaseline)} baseline — open the dashboard and check the day's successful/failed sales`, orgId,
          { revToday: round2(revToday), baseline: round2(revBaseline), dropPct: Math.round(dropPct) }));
      } else if (-dropPct > num(cfg.good_day_rise_pct, 90)) {
        page.flags.push(mkFlag('page', creatorId, null, reportDate, 'earnings_spike', 'low',
          `Revenue $${round2(revToday)} is ${Math.round(-dropPct)}% above $${Math.round(revBaseline)} baseline — worth understanding why`, orgId,
          { revToday: round2(revToday), baseline: round2(revBaseline), risePct: Math.round(-dropPct) }));
      }
    }
    // LTV drop — windowed (daily LTV is too volatile to alarm on)
    if (ltvWindow != null && ltvPriorWindow && ltvPriorWindow > 0) {
      const ltvDrop = ((ltvPriorWindow - ltvWindow) / ltvPriorWindow) * 100;
      if (ltvDrop > num(cfg.ltv_drop_pct, 20)) {
        page.flags.push(mkFlag('page', creatorId, null, reportDate, 'ltv_drop', 'high',
          `30-day LTV $${round2(ltvWindow)} dropped ${Math.round(ltvDrop)}% vs $${round2(ltvPriorWindow)} the prior 30 days — review this page's new subs, whales and PS`, orgId,
          { ltv: round2(ltvWindow), prior: round2(ltvPriorWindow), dropPct: Math.round(ltvDrop) }));
      }
    }
    // refund spike
    if ((today.refund_gross || 0) > num(cfg.refund_spike_amount, 50)) {
      page.flags.push(mkFlag('page', creatorId, null, reportDate, 'refund_spike', 'medium',
        `Refunds $${round2(today.refund_gross)} on this page today`, orgId, { refunds: round2(today.refund_gross) }));
    }

    flags.push(...page.flags);
  }

  // ============ CHATTER-LEVEL ============
  // First, ensure all chatter entries exist on their pages and find each
  // chatter's PRIMARY page (most messages) so day-level flags attach there
  // predictably instead of on a random page.
  const chatterPrimaryPage = {};   // chatter_id -> creator_id with most messages
  const chatterAnyRow = {};        // chatter_id -> a representative row (day signals)
  for (const row of chatterRows) {
    const creatorId = row.creator_id;
    const page = pages[creatorId] ||= {
      creator_id: creatorId, creator_name: creators[creatorId] || 'Unknown',
      is_free: null, metrics: null, flags: [], chatters: {},
    };
    page.chatters[row.chatter_id] ||= {
      chatter_id: row.chatter_id,
      chatter_name: chatters[row.chatter_id] || 'Unknown',
      workload_status: row.workload_status,
      reply_time_avg_seconds: row.response_time_avg_seconds,
      messages_sent: row.messages_sent,
      fans_chatted: row.fans_chatted,
      flags: [],
    };
    const best = chatterPrimaryPage[row.chatter_id];
    if (!best || row.messages_sent > best.messages_sent) {
      chatterPrimaryPage[row.chatter_id] = { creator_id: creatorId, messages_sent: row.messages_sent };
    }
    chatterAnyRow[row.chatter_id] = row;

    // PER-PAGE flag: zero sales on meaningful volume (volume is per-page)
    if (row.sales_today === 0 && row.messages_sent > 50) {
      const cEntry = page.chatters[row.chatter_id];
      const f = mkFlag('chatter', creatorId, row.chatter_id, reportDate, 'zero_sales', 'medium',
        `No sales across ${row.messages_sent} messages / ${row.fans_chatted} fans on this page`, orgId,
        { messages: row.messages_sent, fans: row.fans_chatted, workload: row.workload_status });
      cEntry.flags.push(f); flags.push(f);
    }
  }

  // Now day-level flags, attached to the primary page, carrying incident detail.
  for (const [chatterId, row] of Object.entries(chatterAnyRow)) {
    const primaryCreator = chatterPrimaryPage[chatterId].creator_id;
    const cEntry = pages[primaryCreator].chatters[chatterId];
    // Time-wasters' waits don't matter (manager policy) — exclude them so the
    // reply-time task only covers fans worth a manager's attention.
    const slowInc = (row.slow_reply_incidents || []).filter(i => i.tier !== 'time_waster');
    const afkInc = row.afk_incidents || [];

    // slow replies — grouped per subscriber, pre-sorted by fan priority
    // (new sub > whale > spender > rest), then worst wait. slowInc[0] = the most
    // important sub kept waiting.
    if (slowInc.length > 0) {
      const top = slowInc[0];
      const neglectedKey = slowInc.filter(i => i.priority_rank <= 1);   // subs that are new/whale
      const hasKeyNeglect = neglectedKey.length > 0;

      // Severity comes from the reply-time facts ONLY. Workload is INFORMATIONAL —
      // shown to the manager (headline + details.workload) but it never changes the
      // score; the manager weighs "was this chatter overloaded?" themselves.
      const sev = (row.response_time_p90_seconds > 600 || hasKeyNeglect) ? 'high' : 'medium';
      const lens = row.workload_status ? ` (workload: ${row.workload_status})` : '';
      const tierTag = top.tier === 'new_sub' ? 'NEW SUB' : top.tier === 'whale' ? `whale $${top.spend}` : top.tier === 'spender' ? `spender $${top.spend}` : top.tier;
      const headline = `kept ${slowInc.length} sub${slowInc.length === 1 ? '' : 's'} waiting (avg ${row.response_time_avg_seconds}s) — worst: ${top.fan_nickname} [${tierTag}] ${top.worst_reply_min}m at ${top.worst_time}${lens}`;

      const f = mkFlag('chatter', primaryCreator, chatterId, reportDate, 'high_response_time', sev,
        headline, orgId,
        { avg: row.response_time_avg_seconds, p90: row.response_time_p90_seconds, workload: row.workload_status,
          key_neglect_count: neglectedKey.length, subs: slowInc });
      cEntry.flags.push(f); flags.push(f);
    }
    // AFK gaps with full incident detail
    if (afkInc.length > 0) {
      const f = mkFlag('chatter', primaryCreator, chatterId, reportDate, 'afk_gap',
        row.afk_gaps_longest_minutes > 60 ? 'high' : 'medium',
        `${afkInc.length} AFK gap(s) with fans waiting, longest ${row.afk_gaps_longest_minutes} min`, orgId,
        { count: afkInc.length, longest: row.afk_gaps_longest_minutes, workload: row.workload_status, incidents: afkInc });
      cEntry.flags.push(f); flags.push(f);
    }
  }

  // ---- score & rank ----
  for (const f of flags) f.score = scoreFlag(f);
  flags.sort((a, b) => b.score - a.score);

  // ---- persist: wipe today's flags for this org, re-insert (idempotent) ----
  await supabaseAdmin.from('anomaly_flags').delete().eq('organisation_id', orgId).eq('report_date', reportDate);
  if (flags.length) {
    const toInsert = flags.map(stripForDb);
    const { error } = await supabaseAdmin.from('anomaly_flags').insert(toInsert);
    if (error) console.error('[DailyCheck] flag insert error:', error.message);
  }

  // ---- shape output: BY PAGE (creators tab) ----
  const pageList = Object.values(pages).map(p => {
    const pageFlagScore = Math.max(0, ...p.flags.map(f => f.score || 0));
    const chatterList = Object.values(p.chatters).map(c => ({
      ...c,
      worst_score: Math.max(0, ...c.flags.map(f => f.score || 0)),
    })).sort((a, b) => b.worst_score - a.worst_score);
    const allScores = [pageFlagScore, ...chatterList.map(c => c.worst_score)];
    return { ...p, chatters: chatterList, priority_score: Math.max(0, ...allScores) };
  }).sort((a, b) => b.priority_score - a.priority_score);

  // ---- shape output: BY CHATTER (chatters tab) ----
  // Re-index the SAME flags by person. Each chatter shows ALL pages they covered,
  // punctuality, and their flags pulled from wherever they were attached.
  const shifts = await shiftStartMap(orgId);
  const grace = cfg.punctuality_grace_minutes;

  // chatter -> { pages:[{creator_id,name,messages}], flags:[], representative row }
  const byChatter = {};
  for (const row of chatterRows) {
    const cid = row.chatter_id;
    if (!byChatter[cid]) {
      byChatter[cid] = {
        chatter_id: cid,
        chatter_name: chatters[cid] || 'Unknown',
        pages: [],
        workload_status: row.workload_status,
        reply_time_avg_seconds: row.response_time_avg_seconds,
        first_message_time: row.first_message_time,
        flags: [],
        total_messages: 0,
      };
    }
    byChatter[cid].pages.push({
      creator_id: row.creator_id,
      creator_name: creators[row.creator_id] || 'Unknown',
      messages: row.messages_sent || 0,
    });
    byChatter[cid].total_messages += row.messages_sent || 0;
    // keep the row with most messages as the representative for day-level fields
    if ((row.messages_sent || 0) > (byChatter[cid]._repMsgs || -1)) {
      byChatter[cid]._repMsgs = row.messages_sent || 0;
      byChatter[cid].workload_status = row.workload_status;
      byChatter[cid].reply_time_avg_seconds = row.response_time_avg_seconds;
      byChatter[cid].first_message_time = row.first_message_time;
    }
  }
  // attach flags by chatter_id
  for (const f of flags) {
    if (f.chatter_id && byChatter[f.chatter_id]) byChatter[f.chatter_id].flags.push(f);
  }
  // finalize: punctuality, sort pages, score
  const chatterList = Object.values(byChatter).map(c => {
    c.pages.sort((a, b) => b.messages - a.messages);
    c.punctuality = computePunctuality(c.first_message_time, shifts[c.chatter_id], grace);
    c.worst_score = Math.max(0, ...c.flags.map(f => f.score || 0));
    c.has_issues = c.flags.length > 0 || ['late'].includes(c.punctuality.state);
    delete c._repMsgs;
    return c;
  }).sort((a, b) => (b.worst_score - a.worst_score) || (b.total_messages - a.total_messages));

  return {
    report_date: reportDate,
    total_flags: flags.length,
    pages: pageList,          // creators tab
    chatters: chatterList,    // chatters tab
  };
}

// ─── metric helpers ─────────────────────────────────
function computeRatio(history, date, windowDays) {
  const window = history.filter(h => h.report_date <= date).slice(-windowDays);
  const tips = sum(window.map(h => h.tips_gross));
  const ppv = sum(window.map(h => h.message_gross));
  const subs = sum(window.map(h => h.total_subscription_gross));
  if (subs <= 0) return null;                 // free page
  return (tips + ppv) / subs;
}
function computeLtvWindow(history, date, windowDays, netFactor) {
  const window = history.filter(h => h.report_date <= date).slice(-windowDays);
  if (!window.length) return null;
  const rev = sum(window.map(h => h.total_earnings_gross * netFactor));
  const subCount = sum(window.map(h => (h.new_subscribers || 0) + (h.subscriber_renewals || 0)));
  if (subCount <= 0) return null;
  return rev / subCount;
}

// ─── scoring: severity × confidence (+ page weight) ──
function scoreFlag(f) {
  const sev = { high: 100, medium: 50, low: 20 }[f.severity] || 10;
  // page flags weigh slightly higher (business-wide), chatter flags scaled
  const scope = f.scope === 'page' ? 1.2 : 1.0;
  return Math.round(sev * scope);
}

// ─── flag construction ──────────────────────────────
function mkFlag(scope, creatorId, chatterId, date, type, severity, evidence, orgId, details) {
  return {
    scope, creator_id: creatorId, chatter_id: chatterId, report_date: date,
    flag_type: type, severity, evidence, organisation_id: orgId,
    details: details || {}, status: 'open', score: 0,
  };
}
function stripForDb(f) {
  return {
    scope: f.scope, creator_id: f.creator_id, chatter_id: f.chatter_id,
    report_date: f.report_date, flag_type: f.flag_type, severity: f.severity,
    evidence: f.evidence, details: f.details, status: f.status, score: f.score,
    organisation_id: f.organisation_id,
  };
}

// ─── data access ────────────────────────────────────
async function loadConfig(orgId) {
  const { data } = await supabaseAdmin.from('daily_check_config').select('key, value').eq('organisation_id', orgId);
  const cfg = {};
  (data || []).forEach(r => { cfg[r.key] = r.value; });
  return cfg;
}
async function pageStatsUpTo(orgId, date, windowDays) {
  const start = shiftDays(date, -(windowDays + 14));
  const { data } = await supabaseAdmin
    .from('creator_daily_stats').select('*')
    .eq('organisation_id', orgId).gte('report_date', start).lte('report_date', date)
    .order('report_date', { ascending: true });
  const byCreator = {};
  (data || []).forEach(r => { (byCreator[r.creator_id] ||= []).push(r); });
  return byCreator;
}
async function chatterMetricsForDate(orgId, date) {
  const { data } = await supabaseAdmin
    .from('chatter_daily_metrics').select('*')
    .eq('organisation_id', orgId).eq('report_date', date);
  return data || [];
}
async function creatorNameMap(orgId) {
  const { data } = await supabaseAdmin.from('creators').select('id, name').eq('organisation_id', orgId);
  const m = {}; (data || []).forEach(c => { m[c.id] = c.name; }); return m;
}
async function chatterNameMap(orgId) {
  const { data } = await supabaseAdmin.from('chatters').select('id, name').eq('organisation_id', orgId);
  const m = {}; (data || []).forEach(c => { m[c.id] = c.name; }); return m;
}

// Load each chatter's scheduled shift start (HH:MM) from their active assignment.
// Returns { chatter_id -> { start: 'HH:MM', name } }. Best-effort: a chatter may
// have no assignment (then punctuality is "shift not set").
async function shiftStartMap(orgId) {
  const { data: assigns } = await supabaseAdmin
    .from('chatter_creator_assignments')
    .select('chatter_id, shift_id, is_active')
    .eq('is_active', true);
  if (!assigns?.length) return {};
  const shiftIds = [...new Set(assigns.map(a => a.shift_id).filter(Boolean))];
  if (!shiftIds.length) return {};
  const { data: shifts } = await supabaseAdmin
    .from('shifts').select('id, name, start_time').in('id', shiftIds);
  const byId = {}; (shifts || []).forEach(s => { byId[s.id] = s; });
  const out = {};
  for (const a of assigns) {
    const s = byId[a.shift_id];
    if (s && !out[a.chatter_id]) out[a.chatter_id] = { start: String(s.start_time).slice(0, 5), name: s.name };
  }
  return out;
}

// Compare first-message time to scheduled shift start.
// Returns a punctuality object the UI renders, or a graceful "unknown" state.
// NOTE: first message is a PROXY for login, not a true attendance record.
function computePunctuality(firstMessageTime, shift, graceMin) {
  if (!shift || !shift.start) return { state: 'no_shift', label: 'shift not set' };
  if (!firstMessageTime) return { state: 'no_activity', label: 'no messages' };
  const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const diff = toMin(firstMessageTime) - toMin(shift.start);   // +late, -early
  const grace = num(graceMin, 10);
  if (diff > grace) return { state: 'late', minutes: diff, label: `started ~${diff}m late`, shift_start: shift.start, first_message: firstMessageTime };
  if (diff < -grace) return { state: 'early', minutes: -diff, label: `started ~${-diff}m early`, shift_start: shift.start, first_message: firstMessageTime };
  return { state: 'on_time', minutes: diff, label: 'on time', shift_start: shift.start, first_message: firstMessageTime };
}

// ─── tiny utils ─────────────────────────────────────
function num(v, d) { const n = parseFloat(v); return Number.isFinite(n) ? n : d; }
function sum(a) { return a.reduce((x, y) => x + (parseFloat(y) || 0), 0); }
function avg(a) { const f = a.filter(v => v != null && Number.isFinite(v)); return f.length ? sum(f) / f.length : 0; }
function round2(v) { return v == null ? null : Math.round(v * 100) / 100; }
function shiftDays(dateStr, delta) {
  const d = new Date(dateStr + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

module.exports = { runDailyCheck };
