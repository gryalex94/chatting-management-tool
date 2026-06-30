const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic();

function parseJson(text) {
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

  // Last resort: the response was likely truncated (hit max_tokens). Salvage the
  // complete part — keep whole issues, drop the half-written final one.
  const salvaged = salvageJson(text);
  if (salvaged) { console.warn('[AI Agent] Salvaged a truncated JSON response.'); return salvaged; }

  console.error('[AI Agent] Failed to parse JSON:', text.slice(0, 300));
  throw new Error('AI returned invalid JSON');
}

// Recover a truncated JSON object: cut at the last complete `}`, then balance
// any still-open brackets so it parses (losing only the incomplete tail).
function salvageJson(text) {
  let s = String(text).replace(/```json\s*/g, '').replace(/```\s*/g, '');
  const start = s.indexOf('{');
  if (start < 0) return null;
  s = s.slice(start);
  const cuts = [];
  for (let i = 0; i < s.length; i++) if (s[i] === '}') cuts.push(i + 1);
  for (let k = cuts.length - 1; k >= 0; k--) {
    let candidate = s.slice(0, cuts[k]).replace(/,\s*$/, '');
    let braces = 0, brackets = 0, inStr = false, esc = false;
    for (const ch of candidate) {
      if (esc) { esc = false; continue; }
      if (ch === '\\') { esc = true; continue; }
      if (ch === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (ch === '{') braces++;
      else if (ch === '}') braces--;
      else if (ch === '[') brackets++;
      else if (ch === ']') brackets--;
    }
    if (inStr || braces < 0 || brackets < 0) continue;
    const closed = candidate + ']'.repeat(brackets) + '}'.repeat(braces);
    try { return JSON.parse(closed); } catch { /* try an earlier cut */ }
  }
  return null;
}

/**
 * Run one agent call and return the parsed JSON plus run metadata
 * (model used + token usage) so callers can compare cost/speed across models.
 */
async function runAgentDetailed({ systemPrompt, userContent, model = 'claude-sonnet-4-6', maxTokens = 16000 }) {
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

  const usage = response.usage
    ? { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens }
    : null;

  return { result: parseJson(text), usage, model };
}

// Backward-compatible wrapper: returns just the parsed JSON.
async function runAgent(opts) {
  const { result } = await runAgentDetailed(opts);
  return result;
}

module.exports = { runAgent, runAgentDetailed };
