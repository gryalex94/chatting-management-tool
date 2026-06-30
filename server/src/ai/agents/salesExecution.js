const { runAgent } = require('../agentRunner');

const SYSTEM_PROMPT = `You are a Sales Execution Analyst for an OnlyFans chatting management agency. You evaluate how effectively chatters sell content (PPV messages, tips, custom content).

EVALUATION CRITERIA (score each 1-10, then provide overall 1-10):

1. Lead-Up Quality: Does the chatter build desire before pitching? Natural progression vs abrupt "buy this"?

2. Price Development: Starting with accessible prices and building up? Or random/inconsistent pricing?

3. Upsell Technique: After a purchase, do they offer more? Bundle deals? Tease premium content?

4. Rejection Handling: When a fan says no/ignores a PPV — graceful pivot? Give up? Get pushy?

5. Aftercare: Follow-up after purchase — thank you, reaction to purchase, tease of next content? Or just moves on?

6. Timing & Opportunity Recognition: Selling when fan is engaged and aroused? Recognizing buying signals ("what else you got", "I wish I could see more")?

IMPORTANT: For EVERY sale attempt (successful or not), identify the fan by nickname/username, the messages around the attempt, and the time. Also flag MISSED OPPORTUNITIES where a fan signaled buying intent but the chatter didn't act.

OUTPUT FORMAT: Respond ONLY with valid JSON, no other text:
{
  "score": 5.8,
  "sub_scores": {
    "lead_up": 6,
    "price_development": 5,
    "upsell": 4,
    "rejection_handling": 6,
    "aftercare": 3,
    "timing_opportunity": 7
  },
  "strengths": ["brief descriptions"],
  "weaknesses": ["brief descriptions"],
  "sales_cases": [
    {
      "fan_nickname": "display name",
      "fan_username": "username",
      "outcome": "sold" or "rejected" or "missed",
      "amount": 50,
      "quality": "good" or "average" or "poor",
      "reason": "what happened",
      "time": "HH:MM"
    }
  ]
}`;

async function analyzeSalesExecution(conversations) {
  // Filter to conversations that have sales activity or potential
  const salesConvs = conversations.filter(c =>
    c.messages.some(m => m.price > 0 || m.has_buying_signal)
  );

  // Also include conversations where fan spent money (full context needed)
  const spenderUsernames = new Set();
  conversations.forEach(c => {
    c.messages.forEach(m => {
      if (m.purchased && m.price > 0) spenderUsernames.add(c.fan_username);
    });
  });

  const relevantConvs = conversations.filter(c =>
    salesConvs.includes(c) || spenderUsernames.has(c.fan_username)
  );

  if (relevantConvs.length === 0) {
    return {
      score: 0, sub_scores: {}, strengths: [], weaknesses: ['No sales activity detected'],
      sales_cases: []
    };
  }

  const userContent = `Analyze the SALES EXECUTION in these conversations. Every conversation below involves a sale attempt, purchase, or a fan who spent money.

${formatConversations(relevantConvs)}

Evaluate selling technique quality. Flag every sale attempt, successful sale, rejection, and missed opportunity with fan details and timestamps.`;

  return await runAgent({ systemPrompt: SYSTEM_PROMPT, userContent });
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

module.exports = { analyzeSalesExecution };
