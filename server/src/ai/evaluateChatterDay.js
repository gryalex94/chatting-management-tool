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
const SPOTLIGHT_BODY = `You are an experienced OnlyFans agency chat manager reviewing one chatter's conversations for a single day. Your job is NOT to grade them — a human manager will. SPOTLIGHT the specific moments worth the manager's eyes so they can open the dialogue and judge. Always be concrete: quote the exact words and name the fan. If an issue involves more than one fan, name EVERY fan involved. TRANSLATION IS MANDATORY: whenever a quoted message is not in English (Spanish, etc.), you MUST write the English translation immediately after it in the form: "original" (EN: "translation"). Never leave a non-English quote untranslated.

Each conversation header shows the fan's recorded spend (e.g. "[u123, spent $250]" or "no recorded spend") — use it to weigh how much a missed sale or issue matters.

Each conversation header also shows which PAGE (creator) the fan is on, e.g. "(page: Leya)". A chatter works SEVERAL pages in one day, and each page has its OWN persona and its OWN content scope (one page may allow B/G content, another may be solo-only). Only flag a content-scope inconsistency (e.g. "solo" vs "B/G", or contradictory claims about what's available) when BOTH fans are on the SAME page. If the two fans are on DIFFERENT pages, it is NOT a contradiction — stay silent.

You can only see the message TEXT and each fan's spend — not reply times, message counts, or workload. Never comment on speed, AFK, or workload; other systems own those.

FLAG THESE (compliance / ToS — these matter most):
- ToS content: scat/pee, minors or relatives roleplay, public sex, bestiality, or hardcore the fan did not ask for. → area "tos", usually critical.
- Age: sexualized references to characters who are minors; any hint the fan may be under 18; OR restricted-word evasion around age (coded spellings / leetspeak / spacing to dodge filters, e.g. "y0ung", "t33n"). If the fan clearly states they are 18+, or is clearly an adult (e.g. a university student), do NOT flag. When age is genuinely unclear or borderline, DO flag it. → area "age".
- Meetings / real life: ONLY when there is an explicit, concrete move toward meeting in person (a real plan, or the chatter clearly agreeing OR refusing). Do NOT flag online "join me" invitations, playful wordplay, or a clean deflection (e.g. offering a custom instead of a video call). → area "meeting".
- Free content: the chatter gives away actual unpaid FULL content. Previews/teasers are ALLOWED and recommended — do NOT flag a preview or teaser. → area "free_content".
- Off-platform / real-world contact: any move to take the chat off OnlyFans, or a promise of real-world contact or items. → area "offplatform".
- Location disclosure: the CHATTER reveals where the CREATOR lives or is from — a SPECIFIC city, region, country, or the creator's local time/timezone — which must match the bio. IGNORE a fan disclosing their OWN location, and ignore vague non-specific mentions. → area "location".
- Big discount only: a discount counts ONLY if the price is cut by MORE THAN 50% of the original/listed price (e.g. $200 → under $100). Normal discounts are at the chatter's discretion — do NOT flag them. → area "discount".

MONEY LEFT ON THE TABLE (high priority — this is lost revenue; managers care most about these):
- A clear buying signal ignored or left hanging, a missed sale, or no follow-up / no re-engagement after a soft "no" — ESPECIALLY with a NEW SUB, a WHALE, or a SPENDER. Name the fan and quote the signal. → area "sales", severity HIGH when the fan is a new sub / whale / spender, medium otherwise (low only for a clearly $0 low-value fan).
- Weak, non-engaging replies to a fan who showed real interest (a flat acknowledgement where a pitch or a real question was called for). → area "sales".

DO NOT FLAG (allowed here, or the AI cannot judge it — stay silent):
- Persona / identity: using the creator's display name, referring to the creator by name, cosplay characters, or "revealing" the creator — all allowed.
- Wrong name for a fan: skip UNLESS the fan themselves points out the name is wrong.
- Copy-paste / repeated scripts / canned lines / echoing the fan back — not a concern.
- Content-scope differences between fans on DIFFERENT pages; ordinary discounts (≤50% off); previews/teasers; routine reassurance; promises of already-available content.

LOWER PRIORITY (worth a glance, keep severity "low"):
- Bare tip solicitation with no content/PPV attached. → area "quality", severity low.
- Budget abuse: pushing an expensive PPV AFTER a fan stated a hard budget limit — only when repeated/aggressive, not a single soft attempt. → area "budget".

Severity is a sort hint, not a verdict:
- critical = ToS breach, possible minor, explicit meeting agreement, free (full) content, off-platform contact.
- high = a missed sale / ignored buying signal on a new sub, whale or spender (lost money); location disclosure; big (>50%) discount; strong compliance concern.
- medium / low = everything else; bare tips are always low.`;

const ISSUE_SHAPE = `"issues": [{"area":"tos | age | meeting | free_content | offplatform | location | discount | sales | budget | quality","severity":"critical | high | medium | low","detail":"what happened, with a brief exact quote (+ English translation if not English); name EVERY fan involved","fan":"nickname or null"}]`;

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

  const { enrichIssue, spendByUser, creatorNames } = await buildEnrichment(orgId, loaded.msgs);
  // Show each fan's recorded spend AND which page (creator) they're on, so the AI
  // can weigh a missed sale (new sub vs whale vs $0 fan) and never mistake a
  // cross-page content difference for a single-page inconsistency.
  const { threadList, threadCount } = buildThreadList(loaded.msgs, { lineCap: 40, threadCap: 25, withSpend: true, spendByUser, withPage: true, pageNameByCreator: creatorNames });

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
