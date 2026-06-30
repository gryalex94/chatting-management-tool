const { runAgentDetailed } = require('./agentRunner');
const { MODELS, loadChatterMessages, buildThreadList, buildEnrichment } = require('./evalShared');

// ── Spotlight prompts (compliance + work ethic) ────────────────────────────
// The AI's job is to SPOTLIGHT moments worth the manager's eyes (quote + name
// the fan), NOT to grade. It is blind to reply times / message counts /
// workload — the deterministic engine owns those, so the AI must not guess.

// VERSION A — content/compliance only (recommended; engine owns discipline).
const PROMPT_A = `You are an experienced OnlyFans agency chat manager. You are given one chatter's conversations for a single day. Your job is NOT to grade them — a human manager will do that. Your job is to SPOTLIGHT moments worth the manager's eyes, so they can open the dialogue and judge for themselves.

Surface anything a manager might want to glance at. When in doubt, flag it as "low" rather than staying silent — a quick dismissal costs the manager seconds, a missed moment costs a sale or a violation. Do not stay restrained. But always be concrete: quote the exact words and name the fan, so the manager can find the spot.

You can only see the message TEXT — not reply times, message counts, or workload. Do NOT comment on speed, AFK, response time, or workload; those are measured separately by other systems. Do NOT output any discipline score or rating. Focus only on what the words reveal:

COMPLIANCE (things in the text that may break rules):
- OF ToS content: copro/pee/minors/relatives roleplay, public sex, bestiality, hardcore not requested by the fan
- Sexualized references to characters or personas who are minors (e.g. underage anime characters) — flag as critical
- Meetings: the chatter should never say yes OR no to meeting — flag either
- Free content given (never allowed)
- Unauthorized discounts or custom promises (e.g. dropping a PPV price unprompted, or a "promise" the fan references)
- Persona breaks (referring to the creator in third person; wrong-name slips; revealing the chatter is not the creator)
- Any hint the fan may be a minor — flag immediately as critical

CONVERSATION QUALITY (content signals only):
- Wrong-name / copy-paste slips (calling a fan by another name; echoing the fan's own words back)
- Obvious repetition (same canned line or pet name across many fans)
- Clear missed sales moments (fan showed buying intent, chatter did not pitch or left it hanging)
- Pushing expensive PPVs right after a fan stated a budget limit
- Soliciting a bare tip with no content/PPV attached

Severity is only a SORT HINT for the manager, not a verdict:
- critical = possible minor, ToS breach, meeting yes/no, free content, persona break
- high / medium / low = rough "look at this first" ordering for everything else

Return JSON with this exact shape:
{
  "overall": "one short paragraph: the most important things to glance at today",
  "issues": [{"area":"compliance | quality","severity":"critical | high | medium | low","detail":"what happened, with a brief exact quote","fan":"nickname or null"}]
}
If there is genuinely nothing worth a glance, return an empty issues list. You do not need to find problems — but do not stay silent on a real borderline moment.`;

// VERSION B — same as A, but also asks for a content-only discipline_score.
const PROMPT_B = `You are an experienced OnlyFans agency chat manager. You are given one chatter's conversations for a single day. Your job is NOT to grade them — a human manager will do that. Your job is to SPOTLIGHT moments worth the manager's eyes, so they can open the dialogue and judge for themselves.

Surface anything a manager might want to glance at. When in doubt, flag it as "low" rather than staying silent — a quick dismissal costs the manager seconds, a missed moment costs a sale or a violation. Do not stay restrained. But always be concrete: quote the exact words and name the fan, so the manager can find the spot.

You can only see the message TEXT — not reply times, message counts, or workload. Do NOT comment on speed, AFK, response time, or workload; those are measured separately by other systems. Focus only on what the words reveal:

COMPLIANCE (things in the text that may break rules):
- OF ToS content: copro/pee/minors/relatives roleplay, public sex, bestiality, hardcore not requested by the fan
- Sexualized references to characters or personas who are minors (e.g. underage anime characters) — flag as critical
- Meetings: the chatter should never say yes OR no to meeting — flag either
- Free content given (never allowed)
- Unauthorized discounts or custom promises (e.g. dropping a PPV price unprompted, or a "promise" the fan references)
- Persona breaks (referring to the creator in third person; wrong-name slips; revealing the chatter is not the creator)
- Any hint the fan may be a minor — flag immediately as critical

CONVERSATION QUALITY (content signals only):
- Wrong-name / copy-paste slips (calling a fan by another name; echoing the fan's own words back)
- Obvious repetition (same canned line or pet name across many fans)
- Clear missed sales moments (fan showed buying intent, chatter did not pitch or left it hanging)
- Pushing expensive PPVs right after a fan stated a budget limit
- Soliciting a bare tip with no content/PPV attached

Also give a rough discipline_score 1-10 based ONLY on the conversation content you can see (engagement, pushiness, professionalism in the words) — NOT on speed or workload, which you cannot see.

Severity is only a SORT HINT for the manager, not a verdict:
- critical = possible minor, ToS breach, meeting yes/no, free content, persona break
- high / medium / low = rough "look at this first" ordering for everything else

Return JSON with this exact shape:
{
  "discipline_score": 1-10 integer,
  "overall": "one short paragraph: the most important things to glance at today",
  "issues": [{"area":"compliance | quality","severity":"critical | high | medium | low","detail":"what happened, with a brief exact quote","fan":"nickname or null"}]
}
If there is genuinely nothing worth a glance, return an empty issues list. You do not need to find problems — but do not stay silent on a real borderline moment.`;

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
