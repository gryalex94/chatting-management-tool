const { runAgent } = require('../agentRunner');

const SYSTEM_PROMPT = `You are a Work Discipline & Workload Analyst for an OnlyFans chatting management agency. You evaluate chatters' work habits, punctuality, and workload management.

You receive message timestamps and metrics rather than full conversation content.

EVALUATION CRITERIA (score each 1-10, then provide overall 1-10):

1. Punctuality: Did they start on time (within 10 min of shift start)? Did they work until shift end?

2. Response Consistency: Are response times steady throughout the shift or do they degrade? Look for patterns.

3. AFK Detection: Identify periods where fans sent messages but the chatter didn't respond for 15+ minutes. A gap with no incoming fan messages is a SLOW PERIOD, not AFK.

4. Workload Management: How many concurrent conversations were they handling? Did quality degrade under load?

5. Fan Prioritization: Were high-value fans (those who spent money) getting faster responses?

6. Shift Coverage: Any uncovered gaps? Proper handover if applicable?

IMPORTANT: For confirmed AFK periods, provide the exact time range and which fans were left waiting.

OUTPUT FORMAT: Respond ONLY with valid JSON, no other text:
{
  "score": 8.1,
  "sub_scores": {
    "punctuality": 9,
    "response_consistency": 7,
    "afk_detection": 8,
    "workload_management": 8,
    "fan_prioritization": 7,
    "shift_coverage": 9
  },
  "shift_start_actual": "02:06",
  "shift_end_actual": "10:12",
  "punctuality_note": "Started 6 min late, within tolerance",
  "afk_periods": [
    {
      "from": "05:30",
      "to": "05:52",
      "confirmed": true,
      "unanswered_fans": ["fan_nickname (username)"],
      "longest_wait_minutes": 18
    }
  ],
  "workload": {
    "status": "heavy",
    "total_messages": 290,
    "total_fans": 41,
    "concurrent_avg": 8.3,
    "concurrent_peak": 14,
    "peak_time": "21:00-22:30",
    "quality_under_load": "maintained until 12+ concurrent, then response times doubled",
    "hours_worked": 7.9,
    "messages_per_hour": 36.7
  },
  "response_time_pattern": "description of how response times changed through the shift",
  "strengths": ["brief descriptions"],
  "weaknesses": ["brief descriptions"]
}`;

async function analyzeDiscipline(timestampData) {
  const userContent = `Analyze work discipline and workload from this timestamp/metrics data:

SHIFT SCHEDULE: ${timestampData.shift_start} to ${timestampData.shift_end}

MESSAGE TIMELINE (chronological):
${timestampData.timeline.map(m =>
    `[${m.sent_time}] → ${m.fan_nickname} (${m.fan_username}) | Reply: ${m.replay_time_seconds}s | ${m.is_chatter ? 'SENT' : 'RECEIVED'}${m.price > 0 ? ` | PPV $${m.price}` : ''}`
  ).join('\n')}

METRICS FROM EMPLOYEE REPORT:
- Messages sent: ${timestampData.messages_sent}
- Fans chatted: ${timestampData.fans_chatted}
- Clocked hours: ${timestampData.clocked_hours || 'unknown'}
- Messages per hour: ${timestampData.messages_per_hour || 'unknown'}

Evaluate work discipline, detect AFK periods, and assess workload.`;

  return await runAgent({ systemPrompt: SYSTEM_PROMPT, userContent });
}

module.exports = { analyzeDiscipline };
