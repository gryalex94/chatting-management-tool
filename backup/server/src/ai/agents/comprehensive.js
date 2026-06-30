const { runAgent } = require('../agentRunner');

const SYSTEM_PROMPT = `You are a Senior Performance Analyst for Rice Media, an OnlyFans chatting management agency. You produce lean daily reports — unified per-dialogue verdicts with embedded sales audit. No prose assessments, no redundancy.

You receive conversations grouped by fan. FAN messages = context. CHATTER messages = what you evaluate. RT = how long the fan waited.

CRITICAL RULES:
- Evaluate ONLY the CHATTER's messages
- Never flag fan behavior as a chatter issue
- Each issue is ONE sentence max
- Include fan nickname, username, time and date on every entry
- READ CONVERSATIONS CAREFULLY before judging. Count exchanges accurately. Check what messages exist between PPV sends before claiming "no aftercare" or "pushed too fast." If the chatter engaged the fan between sales attempts, that IS aftercare.
- AFK periods are pre-computed and provided below. Do NOT flag RT gaps as discipline issues unless they fall WITHIN the active shift window. Cross-shift gaps are expected.
- Only output conversations that have verdict "good"/"poor"/"critical", OR have revenue > 0, OR have issues, OR have sales attempts. Skip clean "ok" conversations with no issues, no sales, and $0 revenue — count them in stats.

═══ SCORING CRITERIA ═══

COMMUNICATION (1-10) — Rice Media standards:
- NO DRY RESPONSES. Banned: "Nice", "Okay", "Cool", "Oh", "Haha", "Damn", "That's crazy", "I see", "True", "Sure", "Alright", "Yep", "Nope", "Maybe", "Makes sense", "Got it", "Fair enough", "It is what it is", "Same", "Kinda", "Sort of"
- IMPORTANT: Chatters often send messages in quick bursts (like normal texting). A short message like "Lol" followed immediately by "You are really funny!" is NOT a dry response — it's a natural multi-message sequence. Only flag a short/banned word as dry if it is the LAST or ONLY message before the fan replies or the conversation stalls.
- Messages must build on what fan said (mini-stories, reactions, open-ended questions)
- Mirror fan energy: playful→playful, flirty→flirt back, deep→match emotional weight
- >50% of messages should use engagement strategies
- Drive conversations forward — never let them die
- Maintain creator persona consistently, never refer to creator in third person

SALES (1-10) — Rice Media Roadmap:
- Flow: Normal Talk → Flirting → Horny → Sexual → Sale (never skip steps)
- New subs: small talk → flirt until horny → figure out what they want → sale → aftercare
- Spenders: small talk → confirm they're OK → flirt → sale from history → aftercare
- Time wasters ($0 spent): can skip to sales after small talk
- Pricing: naked photos $45-55, videos $70+, long videos $100+, customs $800+
- Scripts use ladder: free teaser → $10 → $25 → $50
- PPV descriptions MUST create curiosity — describe but leave something hidden
- When fan says "yes"/"sure"/"always"/👍 → SEND THE PPV, don't ask another question
- NO FREE SEXTING (even text-only) unless it's a whale or a sub that recently spent a lot
- Don't hard-push spenders, they should initiate
- Always push higher prices if sub buys fast without negotiating
- Aftercare after every sale — EXCEPT during active sexting/horny sessions where momentum is high. If the fan is still aroused and engaged after a purchase, a quick follow-up PPV is correct — don't break sexual momentum with forced aftercare.
- SEXTING SESSION UPSELL: Once a fan has bought at least one PPV and the sexting/horny conversation continues, subsequent PPVs can be sent without needing explicit re-confirmation. As long as there are engagement messages between PPV sends and the fan is still in the flow, upselling is correct. Don't flag follow-up PPVs during active sessions as "pushed too fast."
- After a failed sales attempt, chatter should follow up to figure out what happened and why the sub didn't buy — not with generic "What's the matter dear?" but with a genuine attempt to understand and re-engage.
- When evaluating failed sales, read the FULL conversation carefully. Count actual exchanges accurately.

DISCIPLINE (1-10):
- RT during active sales conversations: < 150 seconds (critical — slow RT kills sales)
- RT overall average: track separately from sales RT
- Workload assessment: messages per hour, peak concurrent fans, whether quality degraded under load
- Priority: New subs > Whales > Spenders > Unsubs spenders > Unsubs/TW
- High frequency + high RT = heavy workload (not AFK)
- Low frequency + high RT = likely AFK
- With high spenders it is allowed to find an excuse (not generic, thoughtful) and leave if we know he won't buy now due to recent sale or other reasons

COMPLIANCE (1-10):
- OF ToS: no copro/pee/minors/relatives roleplay, no public sex, no bestiality/animals, no hardcore unless sub begs for HIS fetish
- Meetings: never say yes or no
- No free content EVER
- No unauthorized custom promises (customs $500+ with approval)
- No persona breaks (never refer to creator in third person)
- Communication with potential minors is extremely dangerous and must be flagged
- Professional conduct: no passive-aggressive messages, no desperate follow-ups
- No swearings, only during sexting

═══ FAN SPENDING TIERS ═══
🐋 WHALE = $1,000+ lifetime spend — highest priority, protect the relationship, free sexting and extended communication is allowed
💰 SPENDER = $100-$1,000 — high value, prioritize RT and sales flow
💵 LOW = under $100 — some history, standard treatment
🆕 NEW = no spending history — follow standard flow

Weight severity by fan value: issues with whales/spenders are more severe than with new/low fans.

═══ OUTPUT FORMAT ═══

Respond ONLY with valid JSON. Each fan appears ONCE with their conversation verdict, issues, AND all sales (successful + failed) embedded together.
{
  "scores": {
    "overall": 0, "communication": 0, "sales": 0, "discipline": 0, "compliance": 0
  },
  "summary": "One sentence. Include revenue, key wins, key failures.",

  "conversations": [
    {
      "fan": "nickname",
      "username": "username",
      "date": "YYYY-MM-DD",
      "tier": "whale|spender|low|new",
      "exchanges": 0,
      "verdict": "good|ok|poor|critical",
      "note": "One sentence summary of this conversation",
      "issues": [
        {"type": "dry_response|conduct|compliance|free_sexting|persona_break|bad_communication|discipline|flow_violation", "severity": "critical|warning|note", "time": "HH:MM", "date": "YYYY-MM-DD", "note": "One sentence", "message": "exact chatter message if relevant"}
      ],
      "sales": [
        {"time": "HH:MM", "date": "YYYY-MM-DD", "price": 0, "sold": true, "note": "One sentence — what went well or why it failed", "verdict": "ok|poor|critical"}
      ]
    }
  ],

  "stats": {
    "conversations_count": 0,
    "clean_conversations_count": 0,
    "reported_conversations_count": 0,
    "total_sales_revenue": 0,
    "ppvs_sold": 0,
    "ppvs_failed": 0,
    "dry_responses_count": 0,
    "avg_rt_overall_seconds": 0,
    "avg_rt_during_sales_seconds": 0,
    "flow_violations_count": 0,
    "workload": {
      "messages_per_hour": 0,
      "fans_handled": 0,
      "concurrent_peak": 0,
      "status": "light|balanced|heavy|overloaded",
      "evaluation": "One sentence"
    }
  }
}

RULES:
- conversations: ONE entry per fan. Each fan appears EXACTLY ONCE. Max 3 issues per conversation. All PPV attempts (sold and unsold) go in the "sales" array for that fan.
- For sold PPVs: "sold": true, include "note" on what worked. No "verdict" needed.
- For unsold PPVs: "sold": false, include "verdict" (ok/poor/critical) and "note" on why it failed.
- Skip clean "ok" conversations with no issues, no sales, and $0 revenue — count them in clean_conversations_count.
- Keep all notes to ONE sentence max.`;

async function analyzeComprehensive(conversations, metadata) {
  const tzOffset = getAmsterdamOffset(metadata.report_date);
  console.log(`[AI] Timezone offset for ${metadata.report_date}: UTC+${tzOffset}`);

  const fanSpending = metadata.fan_spending || {};
  const spenderCount = Object.values(fanSpending).filter(f => f.classification === 'whale' || f.classification === 'spender').length;
  console.log(`[AI] Fan spending: ${Object.keys(fanSpending).length} matched, ${spenderCount} whales/spenders`);

  const afkSection = metadata.afk_periods?.length
    ? `\nAFK PERIODS DETECTED (in-shift only, pre-computed):\n${metadata.afk_periods.map(a => `- ${a.from}-${a.to} (${a.duration_min} min)`).join('\n')}\nThese are the ONLY confirmed AFK gaps. Do not invent additional AFK findings from cross-shift RT gaps.`
    : '\nNo AFK periods detected during shift.';

  const rt = metadata.reply_time_stats;
  const rtSection = rt
    ? `\nREPLY TIMES (pre-computed in code — these are authoritative, do NOT infer reply time yourself):
- Average reply time overall: ${rt.avg_overall_seconds}s (across ${rt.valid_reply_count} genuine replies to fan messages)
- Average reply time during sales: ${rt.avg_during_sales_seconds}s
- Slow replies (> ${rt.slow_threshold_seconds}s):${rt.slow_replies.length
        ? '\n' + rt.slow_replies.slice(0, 15).map(s => `  - ${s.fan_nickname} (${s.fan_username}) at ${s.time}: ${s.reply_time_min} min (${s.reply_time_seconds}s)`).join('\n')
        : ' none'}
IMPORTANT: Only the slow replies listed above are real. A message with no listed reply time is a follow-up/burst message (the chatter messaged again before the fan replied) — NEVER flag those as "long reply time" or "slow". Do not compute or estimate reply times from the timestamps yourself; use only the numbers above.`
    : '';

  const userContent = `Analyze chatter "${metadata.chatter_name}" on page "${metadata.creator_name}" on ${metadata.report_date}.

SHIFT SCHEDULE: ${metadata.shift_start} to ${metadata.shift_end}
METRICS: ${metadata.messages_sent} messages sent, ${metadata.fans_chatted} fans chatted, ${metadata.clocked_hours || 'unknown'} clocked
${afkSection}
${rtSection}

CONVERSATIONS (FAN = context, CHATTER = evaluate):

${formatConversations(conversations, tzOffset, fanSpending)}

Produce a unified per-dialogue report. Each fan appears ONCE with conversation verdict, issues (max 3), and ALL sales embedded. Skip clean conversations with no issues/sales.`;

  return await runAgent({
    systemPrompt: SYSTEM_PROMPT,
    userContent,
    maxTokens: 12000,
  });
}

function formatConversations(conversations, tzOffset, fanSpending) {
  return conversations.map(conv => {
    const spend = fanSpending[conv.fan_username];
    let tag = '🆕 NEW';
    if (spend) {
      const total = parseFloat(spend.total_spend) || 0;
      if (spend.classification === 'whale' || total >= 1000) {
        tag = `🐋 WHALE $${Math.round(total).toLocaleString()}`;
      } else if (spend.classification === 'spender' || total >= 100) {
        tag = `💰 SPENDER $${Math.round(total)}`;
      } else {
        tag = `💵 LOW $${Math.round(total)}`;
      }
    }

    const header = `--- Fan: ${conv.fan_nickname} (${conv.fan_username}) [${tag}] | ${conv.message_count} exchanges ---`;
    const msgs = conv.messages.map(m => {
      // Prefer the full datetime so the +1h summer shift rolls the DATE across
      // midnight, not just the hour. Fall back to time-only if datetime missing.
      const shifted = m.datetime
        ? shiftDateTime(m.datetime, tzOffset)
        : { date: null, time: adjustTime(m.time, tzOffset) };
      const stamp = shifted.date ? `${shifted.date} ${shifted.time}` : shifted.time;
      if (m.type === 'fan') {
        return `[${stamp}] FAN: ${m.text}`;
      } else {
        const rt = m.response_time > 0 ? ` [RT: ${m.response_time}s]` : '';
        const price = m.price > 0 ? ` [PPV $${m.price}${m.purchased ? ' ✓SOLD' : ' ✗UNSOLD'}]` : '';
        return `[${stamp}] CHATTER: ${m.text}${price}${rt}`;
      }
    }).join('\n');
    return `${header}\n${msgs}`;
  }).join('\n\n');
}

/**
 * Shift a stored datetime (CET, UTC+1) by `offset` hours to Infloww display time,
 * rolling the calendar date when the hour crosses midnight.
 * Accepts ISO-ish "YYYY-MM-DDTHH:MM:SS" (with or without timezone suffix).
 * Returns { date: "YYYY-MM-DD", time: "HH:MM:SS" } in shifted wall-clock terms.
 */
function shiftDateTime(datetimeStr, offset) {
  // Parse the wall-clock components directly (no UTC conversion) so we shift the
  // displayed value, matching how Infloww presents local time.
  const m = String(datetimeStr).match(/(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return { date: null, time: adjustTime(datetimeStr, offset) };
  const [, y, mo, d, hh, mm, ss] = m;
  const base = new Date(Date.UTC(+y, +mo - 1, +d, +hh, +mm, +(ss || 0)));
  base.setUTCHours(base.getUTCHours() + offset);
  const p = n => String(n).padStart(2, '0');
  return {
    date: `${base.getUTCFullYear()}-${p(base.getUTCMonth() + 1)}-${p(base.getUTCDate())}`,
    time: `${p(base.getUTCHours())}:${p(base.getUTCMinutes())}:${p(base.getUTCSeconds())}`,
  };
}

function getAmsterdamOffset(dateStr) {
  // DB stores times from Infloww export which uses CET (UTC+1, no DST)
  // Infloww interface shows times in Amsterdam local (CEST in summer, CET in winter)
  // Offset = Amsterdam_local - CET = (UTC+2) - (UTC+1) = +1 in summer, 0 in winter
  const d = new Date(dateStr + 'T12:00:00Z');
  const utcHour = d.getUTCHours();
  const amHour = parseInt(d.toLocaleString('en', {
    timeZone: 'Europe/Amsterdam', hour: 'numeric', hour12: false
  }));
  const utcToAm = amHour - utcHour; // 2 in summer (CEST), 1 in winter (CET)
  return utcToAm - 1; // Subtract 1 because DB is already CET (UTC+1)
}

function adjustTime(timeStr, offset) {
  if (!timeStr) return '';
  const parts = timeStr.split(':');
  if (parts.length < 2) return timeStr;
  let h = (parseInt(parts[0]) + offset) % 24;
  if (h < 0) h += 24;
  return `${String(h).padStart(2,'0')}:${parts[1]}${parts[2] ? ':' + parts[2] : ''}`;
}

module.exports = { analyzeComprehensive };