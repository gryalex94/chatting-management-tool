const { runAgentDetailed } = require('./agentRunner');
const { supabaseAdmin } = require('../utils/supabase');

// The tasks arrive already tiered by deterministic rules. The AI Task Manager's
// job is JUDGMENT: bump carry-overs/regressions, fix mis-tiered items, re-cluster
// where useful, and summarise. It returns ONLY the changes — small, never truncates.
const PRIORITISER_PROMPT = `You are the task manager for an OnlyFans agency. You are given the current queue of open tasks, each already assigned a default priority tier (1 = act first) and a cluster. Review them and return ONLY the adjustments worth making, plus a short summary.

PRIORITY TIERS:
- P1 Critical / safety: possible minor / edgy age, ToS breach, an explicit agreement or refusal to meet in real life, free content, off-platform contact, a page in revenue collapse. Always first.
- P2 Serious work ethic: huge AFK with fans waiting, neglected new subs/whales. Also location disclosure (verify vs the creator's bio) and unusually deep (>50%) discounts.
- P3 Lost money: clear missed sale on a spender/whale, ignored buying intent.
- P4 Communication breach: dry/banned replies, weak engagement.
- P5 Sales craft / quality: skipped roadmap, weak follow-up, missing aftercare.
- P6 Page-health watch: ratio/LTV drift, spender softening, refunds.
- P7 Polish (e.g. a bare tip ask).

Note: persona/identity, ordinary discounts, copy-paste/scripts, and wrong-name-for-a-fan are NOT issues here — if you see one mis-filed as a task, lower it or archive it.

ADJUST a task when:
- It's mis-tiered — e.g. something flagged "high" is really a P1 safety issue, or a "critical" is actually routine. Move it.
- It is carried over (days_open > 1) or REGRESSED — bump it UP a tier; it's been ignored or came back.
- A page/chatter has a heavy concentration of issues — its most serious items can rise.
- It relates to something just completed — note it may already be handled (you can lower it).
- A cluster is wrong — give it a better cluster_key ("chatter:Name", "page:Name", or "fan:username").

ARCHIVE the least important tasks so the live queue stays focused and doesn't pile up day after day. Return up to 40 task ids that are genuinely low-value right now — P6/P7 polish, tiny one-off slips, redundant near-duplicates, stale items unlikely to be worth a manager's minute. NEVER archive critical or high severity, and NEVER archive a protected compliance item (area tos/age/meeting/free_content/offplatform/location) at any tier. Archiving FILES them away (it is reversible and tracked), it does NOT delete them — so be willing to cull the long tail.

Return JSON with this exact shape:
{
  "summary": "one short line: counts of critical/high, the worst page, anything carried over or regressed",
  "day_review": "2-4 sentences for the manager: the main flaws across the team today, which pages/chatters are the concern, and what to focus on first. Plain and specific.",
  "adjustments": [{"id":"<task id>","priority":1-7,"reason":"short why","cluster_key":"chatter:Maurice"}],
  "archive": ["<task id>", "<task id>"]
}
Only include tasks you are changing in "adjustments". Do not invent ids. priority and cluster_key are optional per adjustment — include only what changes.`;

function shiftDays(date, n) {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

async function prioritiseTasks(orgId, reportDate, model = 'sonnet') {
  const { data: open } = await supabaseAdmin.from('review_tasks')
    .select('id, severity, area, creator_name, chatter_name, fan_username, days_open, carried_over, regressed, title, priority, cluster_key')
    .eq('organisation_id', orgId).in('status', ['open', 'taken'])
    .not('source_type', 'in', '("custom","spender_dev")');   // manager-set / weekly PS tasks — the AI never re-ranks or archives them
  if (!open || !open.length) return { ok: true, summary: 'No open tasks.', adjusted: 0 };

  const { data: completed } = await supabaseAdmin.from('review_tasks')
    .select('title, chatter_name, creator_name')
    .eq('organisation_id', orgId).eq('status', 'completed')
    .gte('last_seen_date', shiftDays(reportDate, -3));

  const taskLines = open.map(t =>
    `[${t.id}] P${t.priority} ${t.severity || '-'} · ${t.area || '-'} · page=${t.creator_name || '-'} · chatter=${t.chatter_name || '-'} · fan=${t.fan_username || '-'}` +
    `${t.days_open > 1 ? ` · ${t.days_open}d` : ''}${t.carried_over ? ' · carried' : ''}${t.regressed ? ' · REGRESSED' : ''} · cluster=${t.cluster_key || '-'}: ${t.title}`
  ).join('\n');

  const completedLines = (completed || []).length
    ? (completed || []).slice(0, 40).map(t => `- ${t.chatter_name || t.creator_name || '-'}: ${t.title}`).join('\n')
    : '(none)';

  const userContent = `OPEN TASKS (${open.length}):\n${taskLines}\n\nRECENTLY COMPLETED:\n${completedLines}`;

  const { result } = await runAgentDetailed({
    systemPrompt: PRIORITISER_PROMPT, userContent,
    model: model === 'opus' ? 'claude-opus-4-8' : model === 'haiku' ? 'claude-haiku-4-5' : 'claude-sonnet-4-6',
    maxTokens: 4000,
  });

  const PROTECTED_AREAS = new Set(['tos', 'age', 'meeting', 'free_content', 'offplatform', 'location']);
  const adjustments = Array.isArray(result.adjustments) ? result.adjustments : [];
  const validIds = new Set(open.map(t => t.id));
  const sevOf = {}; const areaOf = {};
  open.forEach(t => { sevOf[t.id] = t.severity; areaOf[t.id] = (t.area || '').toLowerCase(); });
  const now = new Date().toISOString();
  let adjusted = 0;
  for (const a of adjustments) {
    if (!validIds.has(a.id)) continue;
    const update = { updated_at: now };
    if (a.priority != null) update.priority = Math.min(7, Math.max(1, parseInt(a.priority, 10) || 5));
    if (a.reason) update.priority_reason = a.reason;
    if (a.cluster_key) update.cluster_key = a.cluster_key;
    if (Object.keys(update).length === 1) continue;
    await supabaseAdmin.from('review_tasks').update(update).eq('id', a.id);
    adjusted++;
  }

  // Archive the AI's least-important picks — never critical/high, never deletes.
  const archiveIds = Array.isArray(result.archive) ? result.archive : [];
  let archived = 0;
  for (const id of archiveIds) {
    if (!validIds.has(id)) continue;
    if (sevOf[id] === 'critical' || sevOf[id] === 'high') continue;
    if (PROTECTED_AREAS.has(areaOf[id])) continue;   // never archive protected ToS classes
    const { data: up } = await supabaseAdmin.from('review_tasks')
      .update({ status: 'archived', completed_at: now, priority_reason: 'AI-archived: low value', updated_at: now })
      .eq('id', id).in('status', ['open', 'taken']).select('id');
    if (up && up.length) archived++;
  }

  return { ok: true, summary: result.summary || '', day_review: result.day_review || '', adjusted, archived };
}

module.exports = { prioritiseTasks };
