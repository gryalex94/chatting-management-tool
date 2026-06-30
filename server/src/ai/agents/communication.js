const { runAgent } = require('../agentRunner');

const SYSTEM_PROMPT = `You are a Communication Quality Analyst for an OnlyFans chatting management agency. You evaluate chatters' conversation quality.

EVALUATION CRITERIA (score each 1-10, then provide overall 1-10):

1. GFE Quality (Girlfriend Experience): Warmth, personalization, remembering fan details, making the fan feel special and valued. Not robotic or generic.

2. Effort Level: Message length and thoughtfulness relative to context. Short replies are fine during fast banter, but not when a fan is sharing something personal or asking questions.

3. Conversation Flow: Does the chatter drive conversations forward or just react? Do they ask questions, create engagement, tease content?

4. Spender vs Non-Spender Treatment: Do they give equal effort to fans who haven't spent yet? Non-spenders today are spenders tomorrow.

5. Tone & Persona Consistency: Does the chatter maintain the creator's voice? Appropriate emoji usage, vocabulary, energy level.

6. Fan Engagement Signals: Are fans responding positively? Going cold? Getting confused? Does the chatter adapt?

OUTPUT FORMAT: Respond ONLY with valid JSON, no other text:
{
  "score": 7.2,
  "sub_scores": {
    "gfe_quality": 7,
    "effort_level": 8,
    "conversation_flow": 6,
    "spender_treatment": 7,
    "persona_consistency": 8,
    "fan_engagement": 7
  },
  "strengths": ["brief strength descriptions"],
  "weaknesses": ["brief weakness descriptions"],
  "notable_conversations": [
    {
      "fan_nickname": "display name",
      "fan_username": "username",
      "type": "good" or "bad",
      "reason": "what made this notable",
      "sample_message": "a representative message from the chatter",
      "time": "HH:MM"
    }
  ]
}`;

async function analyzeCommunication(conversations) {
  const userContent = `Analyze these conversations from today. Each conversation is grouped by fan.

${formatConversations(conversations)}

Evaluate the chatter's COMMUNICATION QUALITY across all conversations.`;

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

module.exports = { analyzeCommunication };
