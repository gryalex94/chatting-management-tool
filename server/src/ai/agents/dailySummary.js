const { runAgent } = require('../agentRunner');

const SYSTEM_PROMPT = `You are a Daily Performance Summary Agent. You synthesize reports from 4 specialist analysts (Communication, Sales, Discipline, Compliance) into one coherent daily brief for a manager.

Your job:
1. Calculate an overall score (weighted: Communication 25%, Sales 30%, Discipline 25%, Compliance 20%)
2. Write a 2-3 sentence natural language summary that a manager can read in 10 seconds
3. Generate auto-task suggestions for issues that need investigation
4. Compile the most important good/bad cases across all reports
5. List coaching points

For auto-tasks: every task must have a clear title, priority (1-4), and enough context that a manager knows what to investigate. Include fan nicknames and times.

OUTPUT FORMAT: Respond ONLY with valid JSON, no other text:
{
  "overall_score": 7.1,
  "summary": "Natural language summary for managers...",
  "auto_tasks": [
    {
      "title": "Review missed selling opportunity with BillFan",
      "priority": 3,
      "description": "Fan BillFan (u515005267) showed buying intent at 18:20 but chatter changed topic. Review conversation and coach on recognizing signals.",
      "task_type": "review_selling"
    }
  ],
  "good_cases": [
    {
      "category": "great_upsell",
      "fan_nickname": "display name",
      "fan_username": "username",
      "description": "what happened",
      "time": "HH:MM"
    }
  ],
  "bad_cases": [
    {
      "category": "missed_opportunity",
      "fan_nickname": "display name",
      "fan_username": "username",
      "description": "what happened",
      "time": "HH:MM"
    }
  ],
  "coaching_points": ["actionable coaching recommendations"],
  "flagged_for_manager": [
    {
      "severity": "critical" or "warning",
      "fan_nickname": "display name",
      "fan_username": "username",
      "message": "the problematic message",
      "time": "HH:MM",
      "reason": "why this needs manager attention"
    }
  ]
}`;

async function generateDailySummary(reports, employeeMetrics) {
  const userContent = `Synthesize these specialist reports into a daily performance summary.

CHATTER: ${reports.chatter_name}
CREATOR/PAGE: ${reports.creator_name}
DATE: ${reports.report_date}

EMPLOYEE METRICS:
- Sales: $${employeeMetrics.sales || 0}
- Messages sent: ${employeeMetrics.messages_sent || 0}
- Fans chatted: ${employeeMetrics.fans_chatted || 0}
- Golden ratio: ${employeeMetrics.golden_ratio || 0}%
- Unlock rate: ${employeeMetrics.unlock_rate || 0}%

COMMUNICATION REPORT:
${JSON.stringify(reports.communication, null, 2)}

SALES EXECUTION REPORT:
${JSON.stringify(reports.sales, null, 2)}

DISCIPLINE & WORKLOAD REPORT:
${JSON.stringify(reports.discipline, null, 2)}

COMPLIANCE REPORT:
${JSON.stringify(reports.compliance, null, 2)}

Create a summary with overall score, auto-tasks for issues, good/bad cases, and coaching points. IMPORTANT: For any flagged items (especially compliance), include fan nickname, username, message content, and time so the manager can navigate directly to it.`;

  return await runAgent({ systemPrompt: SYSTEM_PROMPT, userContent });
}

module.exports = { generateDailySummary };
