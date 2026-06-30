const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic();

async function runAgent({ systemPrompt, userContent, model = 'claude-sonnet-4-6', maxTokens = 16000 }) {
  console.log(`[AI Agent] Running with ${model}, input ~${Math.round(userContent.length / 4)} tokens...`);

  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system: systemPrompt + '\n\nCRITICAL: Your entire response must be ONLY valid JSON. No preamble, no markdown fences, no explanation. Start your response with { and end with }.',
    messages: [{ role: 'user', content: userContent }],
  });

  const text = response.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('\n');

  try { return JSON.parse(text.trim()); } catch {}

  const fenced = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  try { return JSON.parse(fenced); } catch {}

  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    try { return JSON.parse(match[0]); } catch {}
  }

  let depth = 0, start = -1, lastValid = null;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') { if (depth === 0) start = i; depth++; }
    if (text[i] === '}') { depth--; if (depth === 0 && start >= 0) {
      try { lastValid = JSON.parse(text.slice(start, i + 1)); } catch {}
    }}
  }
  if (lastValid) return lastValid;

  console.error('[AI Agent] Failed to parse JSON:', text.slice(0, 300));
  throw new Error('AI returned invalid JSON');
}

module.exports = { runAgent };