const { client, buildParams, readResponse } = require('./agentRunner');

/**
 * Run many review calls through the Message Batches API: half the price of
 * direct calls, finished in minutes to (rarely) hours. Used for the automatic
 * review after an upload, where nobody is waiting on the screen.
 *
 * requests: [{ id, systemPrompt, userContent, model, maxTokens }]
 *   id must match ^[a-zA-Z0-9_-]{1,64}$ (a chatter uuid does).
 * Resolves to a Map id → { result, usage } or { error }. Results come back in
 * any order, so they're keyed by id, never by position.
 */
const POLL_MS = 30_000;
const MAX_WAIT_MS = 6 * 3600_000;

async function runBatch(requests, { onPoll } = {}) {
  const out = new Map();
  if (!requests.length) return out;
  const batch = await client.messages.batches.create({
    requests: requests.map(r => ({ custom_id: r.id, params: buildParams(r) })),
  });
  console.log(`[Batch] ${batch.id}: ${requests.length} review calls submitted`);

  const started = Date.now();
  let status = batch;
  while (status.processing_status !== 'ended') {
    if (Date.now() - started > MAX_WAIT_MS) {
      await client.messages.batches.cancel(batch.id).catch(() => {});
      throw new Error(`Batch ${batch.id} did not finish within ${MAX_WAIT_MS / 3600_000}h`);
    }
    await new Promise(r => setTimeout(r, POLL_MS));
    status = await client.messages.batches.retrieve(batch.id);
    onPoll?.(status.request_counts);
  }

  for await (const item of await client.messages.batches.results(batch.id)) {
    const r = item.result;
    if (r.type === 'succeeded') {
      try { out.set(item.custom_id, readResponse(r.message)); }
      catch (e) { out.set(item.custom_id, { error: e.message, truncated: !!e.truncated }); }
    } else {
      out.set(item.custom_id, { error: r.type === 'errored' ? (r.error?.error?.message || r.error?.type || 'errored') : r.type });
    }
  }
  console.log(`[Batch] ${batch.id}: ended, ${status.request_counts.succeeded} succeeded, ${status.request_counts.errored} errored`);
  return out;
}

module.exports = { runBatch };
