const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic();

function parseJson(text) {
  let firstErr = null;
  try { return JSON.parse(text.trim()); } catch (e) { firstErr = e; }

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

  // Never log the raw output — it can quote fan messages. Length + error position
  // only (V8's parse messages embed a snippet of the text, so not the message).
  const pos = String(firstErr?.message || '').match(/position (\d+)/);
  console.error(`[AI Agent] Failed to parse JSON: ${firstErr?.name || 'Error'}${pos ? ` at position ${pos[1]}` : ''}, response length ${text.length}`);
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

// Per-model request settings. The newer models think before answering;
// thinking eats into max_tokens, so those calls get extra headroom.
// Picked from a blind side-by-side on real chatter days (Sep 2026):
//   Sonnet 5 - thinking on at "low" effort. With thinking off it was the least
//              accurate of all setups; at low it beat Sonnet 4.6 for less money
//              in that test, but in production it reported far fewer issues, so
//              the default is Sonnet 4.6 again (see MODELS in evalShared.js).
//   Opus 5.5 - thinking can't be turned off; "medium" is its default, set
//              explicitly so it doesn't drift if the default changes.
const MODEL_SETTINGS = {
  'claude-sonnet-5': { thinking: { type: 'adaptive' }, effort: 'low', thinkingHeadroom: 16000 },
  'claude-opus-5-5': { thinking: { type: 'adaptive' }, effort: 'medium', thinkingHeadroom: 16000 },
};

const JSON_ONLY = '\n\nCRITICAL: Your entire response must be ONLY valid JSON. No preamble, no markdown fences, no explanation. Start your response with { and end with }.';

/**
 * The request for one review call — shared by direct calls and the Batch API so
 * both run with identical settings. The fixed instructions are marked for prompt
 * caching: every chatter in a run shares them, so after the first call they're
 * read from cache at a tenth of the price (Sonnet 4.6 caches prompts of 1024+
 * tokens; the review prompts are ~2-3k).
 */
function buildParams({ systemPrompt, userContent, model = 'claude-sonnet-4-6', maxTokens = 16000, settings }) {
  const cfg = settings || MODEL_SETTINGS[model] || {};
  const params = {
    model,
    max_tokens: maxTokens + (cfg.thinkingHeadroom || 0),
    system: [{ type: 'text', text: systemPrompt + JSON_ONLY, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: userContent }],
  };
  if (cfg.thinking) params.thinking = cfg.thinking;
  if (cfg.effort) params.output_config = { effort: cfg.effort };
  return params;
}

/**
 * Turn a finished response into { result, usage, stop_reason }. Throws on a
 * refusal and on an answer cut off by max_tokens (salvaging it would silently
 * drop the unfinished findings) so the caller can retry with more room.
 */
function readResponse(response) {
  if (response.stop_reason === 'refusal') throw new Error('AI declined to review this content');
  if (response.stop_reason === 'max_tokens') {
    const err = new Error('AI answer was cut off (max_tokens)');
    err.truncated = true;
    throw err;
  }
  const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
  const u = response.usage;
  const usage = u ? {
    input_tokens: u.input_tokens, output_tokens: u.output_tokens,
    cache_read_input_tokens: u.cache_read_input_tokens || 0,
    cache_creation_input_tokens: u.cache_creation_input_tokens || 0,
  } : null;
  return { result: parseJson(text), usage, stop_reason: response.stop_reason };
}

/**
 * Run one agent call and return the parsed JSON plus run metadata
 * (model used + token usage) so callers can compare cost/speed across models.
 * `settings` overrides MODEL_SETTINGS (used by model comparison scripts).
 * One retry: with double the output room if the answer was cut off, or as-is if
 * it came back as unparseable JSON.
 */
async function runAgentDetailed(opts) {
  const { userContent, model = 'claude-sonnet-4-6' } = opts;
  console.log(`[AI Agent] Running with ${model}, input ~${Math.round(userContent.length / 4)} tokens...`);
  let maxTokens = opts.maxTokens || 16000;
  for (let attempt = 1; ; attempt++) {
    // Streamed so a large max_tokens (thinking + answer) never hits the HTTP timeout.
    const response = await client.messages.stream(buildParams({ ...opts, model, maxTokens })).finalMessage();
    try {
      return { ...readResponse(response), model };
    } catch (e) {
      if (attempt >= 2 || !(e.truncated || e.message === 'AI returned invalid JSON')) throw e;
      if (e.truncated) maxTokens *= 2;
      console.warn(`[AI Agent] ${e.message}; retrying once`);
    }
  }
}

// Backward-compatible wrapper: returns just the parsed JSON.
async function runAgent(opts) {
  const { result } = await runAgentDetailed(opts);
  return result;
}

module.exports = { runAgent, runAgentDetailed, buildParams, readResponse, client };
