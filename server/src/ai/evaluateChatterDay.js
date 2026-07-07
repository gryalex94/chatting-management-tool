const { runAgentDetailed } = require('./agentRunner');
const { MODELS, loadChatterMessages, buildThreadList, buildEnrichment } = require('./evalShared');

// ── Spotlight prompts (compliance + work ethic) ────────────────────────────
// The AI's job is to SPOTLIGHT moments worth the manager's eyes (quote + name
// the fan), NOT to grade. It is blind to reply times / message counts /
// workload — the deterministic engine owns those, so the AI must not guess.

// Shared spotlight body. Calibrated from the manager's real dismiss decisions:
// stop flagging persona/identity, ordinary discounts, copy-paste, wrong-names;
// keep + tighten the genuine ToS classes; add location disclosure. The protected
// classes (tos/age/meeting/free_content/offplatform/location) are never auto-cleared
// downstream — see PROTECTED_AREAS in taskGenerator.js.
const SPOTLIGHT_BODY = `You are an experienced OnlyFans agency chat manager reviewing one chatter's conversations for a single day. Your job is NOT to grade them — a human manager will. SPOTLIGHT the specific moments worth the manager's eyes so they can open the dialogue and judge. Always be concrete: quote the exact words and name the fan. If a message is not in English, add a short English translation right after the quote.

You can only see the message TEXT — not reply times, message counts, or workload. Never comment on speed, AFK, or workload; other systems own those.

FLAG THESE (compliance / ToS — these matter most):
- ToS content: scat/pee, minors or relatives roleplay, public sex, bestiality, or hardcore the fan did not ask for. → area "tos", usually critical.
- Age: sexualized references to characters who are minors, OR any hint the fan may be under 18. If the fan clearly states they are 18+, or is clearly an adult (e.g. a university student), do NOT flag. When the age is genuinely unclear or borderline, DO flag it. → area "age".
- Meetings / real life: ONLY when there is an explicit, concrete move toward meeting in person (a real plan, or the chatter clearly agreeing OR refusing). Do NOT flag online "join me" invitations, playful wordplay, or a clean deflection (e.g. offering a custom instead of a video call). → area "meeting".
- Free content: the chatter gives or offers unpaid content / an unpaid "preview". → area "free_content".
- Off-platform / real-world contact: any move to take the chat off OnlyFans, or a promise of real-world contact or items. → area "offplatform".
- Location disclosure: the chatter states where the creator lives or is from (city, country, nationality, local time/timezone). Always flag — it must match the creator's bio. → area "location".
- Big discount only: a discount counts ONLY if the price is cut by MORE THAN 50% of the original/listed price (e.g. $200 → under $100). Normal discounts are at the chatter's discretion — do NOT flag them. → area "discount".

DO NOT FLAG (allowed here, or the AI cannot judge it — stay silent):
- Persona / identity: using the creator's display name, referring to the creator by name, cosplay characters, or "revealing" the creator — all allowed.
- Wrong name for a fan: skip UNLESS the fan themselves points out the name is wrong.
- Copy-paste / repeated scripts / canned lines / echoing the fan back — not a concern.
- Ordinary discounts (50% off or less), routine reassurance, or promises of already-available content.

LOWER PRIORITY (worth a glance, keep severity "low"):
- Bare tip solicitation with no content/PPV attached. → area "quality", severity low.
- Budget abuse: pushing an expensive PPV AFTER a fan stated a hard budget limit — only when repeated/aggressive, not a single soft attempt. → area "budget".
- Clear missed sale: fan showed obvious buying intent and the chatter did not pitch or left it hanging. → area "quality".

Severity is a sort hint, not a verdict:
- critical = ToS breach, possible minor, explicit meeting agreement, free content, off-platform contact.
- high = location disclosure, big (>50%) discount, strong compliance concern.
- medium / low = everything else; bare tips are always low.`;

const ISSUE_SHAPE = `"issues": [{"area":"tos | age | meeting | free_content | offplatform | location | discount | budget | quality","severity":"critical | high | medium | low","detail":"what happened, with a brief exact quote (+ English translation if not English)","fan":"nickname or null"}]`;

// VERSION A — content/compliance only (recommended; engine owns discipline).
const PROMPT_A = `${SPOTLIGHT_BODY}

Return JSON with this exact shape:
{
  "overall": "one short paragraph: the most important things to glance at today",
  ${ISSUE_SHAPE}
}
If there is genuinely nothing worth a glance, return an empty issues list. Do not invent issues to fill the list.`;

// VERSION B — same as A, but also asks for a content-only discipline_score.
const PROMPT_B = `${SPOTLIGHT_BODY}

Also give a rough discipline_score 1-10 based ONLY on the conversation content you can see (engagement, pushiness, professionalism in the words) — NOT on speed or workload, which you cannot see.

Return JSON with this exact shape:
{
  "discipline_score": 1-10 integer,
  "overall": "one short paragraph: the most important things to glance at today",
  ${ISSUE_SHAPE}
}
If there is genuinely nothing worth a glance, return an empty issues list. Do not invent issues to fill the list.`;

const PROMPTS = { A: PROMPT_A, B: PROMPT_B };

/**
 * Compliance + work-ethic spotlight for a chatter-day. SPOTLIGHT, not grader:
 * surfaces moments worth the manager's eyes (quotes + fan name). Pure OPINION,
 * kept visually separate from the calculated layer. No discipline/speed scoring.
 */
async function evaluateChatterDay({ orgId, chatterId, reportDate, creatorId = null, model = 'sonnet', promptVersion = 'A' }) {
  const loaded = await loadChatterMessages(orgId, chatterId, reportDate, creatorId);
  if (!loaded.ok) return loaded;

  const { threadList, threadCount } = buildThreadList(loaded.msgs, { lineCap: 40, threadCap: 25 });
  const { enrichIssue } = await buildEnrichment(orgId, loaded.msgs);

  const systemPrompt = PROMPTS[promptVersion] || PROMPT_A;
  const userContent = `Chatter conversations for ${reportDate}${creatorId ? ' (one page)' : ' (all pages)'}:\n\n${threadList}`;
  const baseModelId = MODELS[model] || MODELS.sonnet;

  try {
    const t0 = Date.now();
    const { result, usage } = await runAgentDetailed({ systemPrompt, userContent, model: baseModelId, maxTokens: 4000 });
    const issues = Array.isArray(result.issues) ? result.issues.map(enrichIssue) : [];
    return {
      ok: true,
      eval_type: 'compliance',
      model, model_id: baseModelId, prompt_version: promptVersion,
      elapsed_ms: Date.now() - t0, usage,
      // No score — just the spotlight list. (overall kept as a header.)
      evaluation: { overall: result.overall || '', issues },
      threads_evaluated: threadCount,
    };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}

module.exports = { evaluateChatterDay };
