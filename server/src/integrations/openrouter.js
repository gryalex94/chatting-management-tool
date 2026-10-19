/**
 * OpenRouter: one account and key for many AI models (Mistral, Venice's
 * uncensored model, roleplay models…). The AI chat (utils/aiChat.js) uses it to
 * write replies, keep each fan's memory and draft the creator's profile. Text in,
 * text out: it has no way to reach Fanvue. Models are only served by providers
 * that don't keep or train on what's sent.
 *
 * OPENROUTER_BASE_URL can point it at any server that speaks the same language,
 * such as a model running on your own computer.
 */
const BASE = () => (process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/+$/, '');
const configured = () => !!process.env.OPENROUTER_API_KEY;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// The writers offered in the tool, with their price per million tokens (in / out)
// for when OpenRouter doesn't report the cost itself.
const WRITERS = [
  { id: 'mistralai/mistral-large-2512', label: 'Mistral Large 3', price: [0.5, 1.5] },
  { id: 'mistralai/mistral-large-4-0', label: 'Mistral Large 4', price: [0.68, 2.09] },
  { id: 'cognitivecomputations/dolphin-mistral-24b-venice-edition', label: 'Venice uncensored', price: [0.2, 0.9] },
  { id: 'thedrummer/cydonia-24b-v4.1', label: 'Cydonia 24B (roleplay)', price: [0.3, 0.5] },
  { id: 'sao10k/l3.1-euryale-70b', label: 'Euryale 70B (roleplay)', price: [0.85, 0.85] },
];
const DEFAULT_WRITER = WRITERS[0].id;
const writerLabel = (id) => WRITERS.find(w => w.id === id)?.label || id;
const isModelId = (id) => typeof id === 'string' && /^[a-z0-9][\w.-]*\/[\w.:-]+$/i.test(id) && id.length <= 100;

/**
 * One chat request. Returns { text, finish, model, usage: { input, output, cost } }
 * (cost in USD). Busy or failing providers are retried twice.
 */
async function chat({ model, messages, maxTokens = 600, temperature = 0.8, timeoutMs = 90_000 }) {
  if (!configured()) throw new Error('OpenRouter isn\'t connected: add OPENROUTER_API_KEY to the server settings');
  const body = {
    model, messages, max_tokens: maxTokens, temperature,
    provider: { data_collection: 'deny' },
    usage: { include: true },
  };
  for (let attempt = 0; ; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let res, data;
    try {
      res = await fetch(`${BASE()}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json', 'X-Title': 'Chatting management tool' },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      data = await res.json().catch(() => ({}));
    } catch (e) {
      if (attempt < 2) { await sleep(1500 * (attempt + 1)); continue; }
      throw new Error(e.name === 'AbortError' ? 'The AI took too long to answer' : `Couldn't reach OpenRouter (${e.message})`);
    } finally {
      clearTimeout(timer);
    }
    if ((res.status === 429 || res.status >= 500) && attempt < 2) { await sleep(2000 * (attempt + 1)); continue; }
    if (!res.ok || data.error) throw new Error(`OpenRouter: ${data.error?.message || res.statusText || `error ${res.status}`}`);
    const choice = data.choices?.[0];
    const u = data.usage || {};
    const input = u.prompt_tokens || 0, output = u.completion_tokens || 0;
    const price = WRITERS.find(w => w.id === model)?.price;
    const cost = typeof u.cost === 'number' ? u.cost : price ? (input * price[0] + output * price[1]) / 1e6 : null;
    return { text: choice?.message?.content || '', finish: choice?.finish_reason || null, model: data.model || model, usage: { input, output, cost } };
  }
}

module.exports = { configured, chat, WRITERS, DEFAULT_WRITER, writerLabel, isModelId };
