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
  { id: 'mistralai/ministral-8b-2512', label: 'Ministral 8B (fits your PC)', price: [0.15, 0.15] },
  { id: 'cognitivecomputations/dolphin-mistral-24b-venice-edition', label: 'Venice uncensored', price: [0.2, 0.9] },
  { id: 'thedrummer/cydonia-24b-v4.1', label: 'Cydonia 24B (roleplay)', price: [0.3, 0.5] },
  { id: 'sao10k/l3.1-euryale-70b', label: 'Euryale 70B (roleplay)', price: [0.85, 0.85] },
];
// Venice by default: Mistral Large 3 writes best but is often busy on OpenRouter's
// shared capacity (half the replies in the first test, 19 Oct 2026).
const DEFAULT_WRITER = 'cognitivecomputations/dolphin-mistral-24b-venice-edition';
// For work in the background (her profile, fan memory): when the chosen writer is
// busy, OpenRouter moves on to these.
const BACKUPS = ['cognitivecomputations/dolphin-mistral-24b-venice-edition', 'thedrummer/cydonia-24b-v4.1'];
const backupsFor = (model) => BACKUPS.filter(id => id !== model);
const writerLabel = (id) => WRITERS.find(w => w.id === id)?.label || id;
const isModelId = (id) => typeof id === 'string' && /^[a-z0-9][\w.-]*\/[\w.:-]+$/i.test(id) && id.length <= 100;

// How long to wait before trying a busy writer again. OpenRouter shares each
// model's capacity, so a popular one is sometimes "rate-limited upstream" for a bit.
const BUSY_WAITS = [3000, 8000, 15000];

/**
 * One chat request. Returns { text, finish, model (the one that answered), usage:
 * { input, output, cost } } (cost in USD). A busy writer is tried again after a
 * pause; failing ones twice. `fallbacks`: other models OpenRouter may use instead.
 */
async function chat({ model, messages, maxTokens = 600, temperature = 0.8, timeoutMs = 90_000, fallbacks = [] }) {
  if (!configured()) throw new Error('OpenRouter isn\'t connected: add OPENROUTER_API_KEY to the server settings');
  const body = {
    ...(fallbacks.length ? { models: [model, ...fallbacks] } : { model }),
    messages, max_tokens: maxTokens, temperature,
    provider: { data_collection: 'deny' },
    usage: { include: true },
  };
  for (let attempt = 0, busy = 0; ; attempt++) {
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
    const code = data.error?.code || res.status;
    if (code === 429 && busy < BUSY_WAITS.length) { await sleep(BUSY_WAITS[busy++]); continue; }
    if (res.status >= 500 && attempt < 2) { await sleep(2000 * (attempt + 1)); continue; }
    if (code === 429) throw new Error('This writer is busy right now (too many requests at OpenRouter). Try again in a minute.');
    if (code === 402) throw new Error('OpenRouter is out of credit: add some under Credits on openrouter.ai.');
    if (!res.ok || data.error) throw new Error(`OpenRouter: ${data.error?.metadata?.raw || data.error?.message || res.statusText || `error ${res.status}`}`.slice(0, 300));
    const choice = data.choices?.[0];
    const u = data.usage || {};
    const input = u.prompt_tokens || 0, output = u.completion_tokens || 0;
    const price = WRITERS.find(w => w.id === (data.model || model))?.price;
    const cost = typeof u.cost === 'number' ? u.cost : price ? (input * price[0] + output * price[1]) / 1e6 : null;
    const text = choice?.message?.content || '';
    if (!text.trim() && choice?.finish_reason === 'length') throw new Error('This writer used up its space thinking and wrote no reply.');
    return { text, finish: choice?.finish_reason || null, model: data.model || model, usage: { input, output, cost } };
  }
}

module.exports = { configured, chat, WRITERS, DEFAULT_WRITER, writerLabel, isModelId, backupsFor };
