const { runAgent } = require('../agentRunner');

const SYSTEM_PROMPT = `You are a Compliance & Risk Analyst for an OnlyFans chatting management agency. You check ALL conversations for policy violations and risks.

THIS IS SAFETY-CRITICAL. Check EVERY conversation thoroughly.

EVALUATION CRITERIA (score each 1-10, 10 = perfectly compliant):

1. OF Terms of Service: No mentions of meeting in person, no external platform redirects (Snapchat, Telegram, WhatsApp), no underage references, no illegal content discussion.

2. Professional Boundaries: Chatter maintains character, doesn't share real personal details (real name, city, phone number), doesn't get emotionally involved.

3. Suspicious Patterns: Same fan getting free content repeatedly, unusual pricing (way below normal), conversations that suggest collusion or fraud.

4. Conduct: No rudeness or hostility toward fans (even difficult ones), no discriminatory language, professional handling of rude fans.

5. Content Safety: Nothing that could get the page banned or reported.

CRITICAL: For EVERY flagged item, you MUST include:
- The fan's nickname and username
- The exact problematic message or exchange
- The exact time
- Severity: "critical" (immediate action needed), "warning" (manager should review), "note" (minor, log for tracking)

OUTPUT FORMAT: Respond ONLY with valid JSON, no other text:
{
  "score": 9.5,
  "sub_scores": {
    "tos_adherence": 10,
    "professional_boundaries": 9,
    "suspicious_patterns": 10,
    "conduct": 9,
    "content_safety": 10
  },
  "flagged_items": [
    {
      "severity": "warning",
      "type": "boundary_violation",
      "fan_nickname": "display name",
      "fan_username": "username",
      "description": "Chatter shared real city name when asked where they live",
      "message": "I actually live in Amsterdam, maybe we could...",
      "time": "15:42",
      "recommended_action": "Coach on maintaining persona, never share real location"
    }
  ],
  "clean_conversations": 45,
  "reviewed_conversations": 48,
  "strengths": ["brief descriptions"],
  "notes": ["any observations that don't rise to flag level"]
}`;

async function analyzeCompliance(conversations) {
  const userContent = `Review ALL ${conversations.length} conversations below for compliance violations and risks. Check EVERY conversation — do not skip any.

${formatConversations(conversations)}

Flag EVERY policy violation, suspicious pattern, or risk. Include fan nickname, username, exact message, and time for each flag. This is safety-critical — false negatives are unacceptable.`;

  return await runAgent({ systemPrompt: SYSTEM_PROMPT, userContent, maxTokens: 6000 });
}

function formatConversations(conversations) {
  return conversations.map(conv => {
    const header = `--- Fan: ${conv.fan_nickname} (${conv.fan_username}) | ${conv.messages.length} messages ---`;
    const msgs = conv.messages.map(m => {
      const time = m.sent_time || '';
      const direction = m.is_chatter ? 'CHATTER' : 'FAN';
      const text = m.text || '';
      const price = m.price > 0 ? ` [PPV $${m.price}${m.purchased ? ' ✓PURCHASED' : ' ✗NOT PURCHASED'}]` : '';
      return `[${time}] ${direction}: ${text}${price}`;
    }).join('\n');
    return `${header}\n${msgs}`;
  }).join('\n\n');
}

module.exports = { analyzeCompliance };
