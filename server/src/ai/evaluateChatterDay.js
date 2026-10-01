const { runAgentDetailed } = require('./agentRunner');
const { loadHouseRules, houseRulesBlock } = require('./houseRules');
const { MODELS, loadChatterMessages, buildThreadList, buildEnrichment, buildPageInstructions, UNTRUSTED_RULE, READING_RULE, EVIDENCE_FIELDS, keywordFans, loadFanContext, loadCorrections, verifyIssues, NEW_SUB_RULES, loadPayments, withPayments } = require('./evalShared');

// ── Spotlight prompts (compliance + work ethic) ────────────────────────────
// The AI's job is to SPOTLIGHT moments worth the manager's eyes (quote + name
// the fan), NOT to grade. It is blind to reply times / message counts /
// workload — the deterministic engine owns those, so the AI must not guess.

// Shared spotlight body. Calibrated from the manager's real dismiss decisions:
// stop flagging persona/identity, ordinary discounts, copy-paste, wrong-names;
// keep + tighten the genuine ToS classes. The protected classes
// (tos/age/meeting/free_content/offplatform) are never auto-cleared downstream —
// see PROTECTED_AREAS in taskGenerator.js.
const SPOTLIGHT_BODY = `You are an experienced OnlyFans agency chat manager reviewing one chatter's conversations for a single day. Your job is NOT to grade them — a human manager will. SPOTLIGHT the specific moments worth the manager's eyes so they can open the dialogue and judge. Always be concrete: quote the exact words and identify the fan by the USERNAME shown in square brackets in their conversation header (e.g. "[u573778077, spent $480]" → fan is "u573778077") — many fans share the same display name, so the username is the only reliable identifier. In the detail text write each fan as their display name followed by the username in brackets, e.g. "Zodiac (zkd91)" — the name is how the team knows the fan, the username tells same-named fans apart. If an issue involves more than one fan, include EVERY fan's username in the detail. TRANSLATION IS MANDATORY: whenever a quoted message is not in English (Spanish, etc.), you MUST write the English translation immediately after it in the form: "original" (EN: "translation"). Never leave a non-English quote untranslated.

${UNTRUSTED_RULE}

${READING_RULE}

${NEW_SUB_RULES}

Each conversation header shows the fan's recorded spend (e.g. "[u123, spent $250]" or "no recorded spend") — use it to weigh how much a missed sale or issue matters.

Each conversation header also shows which PAGE (creator) the fan is on, e.g. "(page: Leya)". A chatter works SEVERAL pages in one day, and each page has its OWN persona and its OWN content scope (one page may allow B/G content, another may be solo-only). Only flag a content-scope inconsistency (e.g. "solo" vs "B/G", or contradictory claims about what's available) when BOTH fans are on the SAME page. If the two fans are on DIFFERENT pages, it is NOT a contradiction — stay silent.

You can only see the message TEXT and each fan's spend — not reply times, message counts, or workload. Never comment on speed, AFK, or workload; other systems own those.

FLAG THESE (compliance / ToS — these matter most):
- ToS content: scat/pee, minors or relatives roleplay, public sex, bestiality, or hardcore the fan did not ask for. → area "tos", usually critical.
- Age: assume every fan is an adult (18+) by DEFAULT. Flag ONLY when there is a concrete signal the fan may be a minor — they state an age under 18, reference being in high school / a young grade, the chatter sexualizes a character who is a minor — OR restricted-word evasion around age (coded spellings / leetspeak, e.g. "y0ung", "t33n"). A university student or any ordinary adult is NOT a flag. Do not flag on a vague vibe; unclear-but-adult stays silent. → area "age".
- Meetings / real life: ONLY when there is an explicit, concrete move toward meeting in person (a real plan, or the chatter clearly agreeing OR refusing). Do NOT flag online "join me" invitations, playful wordplay, a clean deflection (e.g. offering a custom instead of a video call), OR imaginative roleplay / fantasy ("come have a taste", "our little coffee date", "if we ever met…") — fantasy is not a real plan. → area "meeting".
- Free content: the chatter gives away actual unpaid FULL content. Previews/teasers are ALLOWED and recommended — do NOT flag a preview or teaser. Content sent AFTER a fan tips is PAID content — do NOT flag it as free (it need not be a formal PPV). → area "free_content".
- Off-platform / real-world contact: flag ONLY when the CHATTER initiates or agrees to move off OnlyFans, or promises real-world contact/items. If the FAN raises it and the chatter deflects, ignores it, or keeps things on-platform, that is correct — do NOT flag. "My other account" usually means the creator's SECOND OnlyFans page — that is NOT off-platform. → area "offplatform".
- Big discount only: a discount counts ONLY if the price is cut by MORE THAN 50% of the original/listed price (e.g. $200 → under $100). Normal discounts are at the chatter's discretion — do NOT flag them. → area "discount".

MONEY LEFT ON THE TABLE (lost revenue — but read the calibration carefully; do NOT over-flag):
- A clear buying signal IGNORED: the fan explicitly asked for content, or said "yes" / "send it" / "👍", and the chatter did not deliver or pivoted away. Name the fan and quote the signal. → area "sales", severity HIGH for a new sub / whale / spender.
- A READINESS CHECK IS NOT IGNORING THE SIGNAL: our process is to check that the fan is ready and willing to buy right now before sending the PPV — one short question right after his "yes" ("are you alone right now?", "are you ready for me?", "do you have a few minutes?"). If the fan went quiet after that check, the chatter did NOT ignore the signal (a "still there?" follow-up is correct) — do not flag it. Flag only when the fan answered the check (e.g. "yes I'm alone") and still got no PPV or offer, or the chatter stalled with several questions or changed the subject.
- Only flag a "missed sale" when there is a CONCRETE ignored signal like the above — NOT merely because a warm conversation happened to have no PPV in it.
- WHALES ARE DIFFERENT: with an established whale, pure GFE (girlfriend-experience) talk with no pitch is a VALID, deliberate strategy — do NOT flag a whale chat as a missed sale just because no PPV was sent. Only flag a whale on an explicit, ignored buying signal.
- A FOLLOW-UP AFTER A SENT PPV IS CORRECT: if the chatter sent a PPV and then followed up ("still there?", "where'd you go?"), that IS the right move — do not flag it as "no re-engagement." If the fan went quiet after opening/viewing the PPV, that is NOT the chatter's fault.
- BUDGET / CAN'T SPEND: if the fan says they can't spend right now / card is maxed / broke, backing off and keeping the relationship warm (no pressure) is the CORRECT long-term play — do NOT flag it as a missed sale.
- Weak, non-engaging replies to a fan who showed real interest (a flat acknowledgement where a pitch or a real question was called for). → area "sales".

COMMUNICATION (daily catches):
- Dry reply to a SPENDER: a flat/banned filler ("Nice", "Okay", "Cool", "Oh", "Haha", "Damn", "I see", "True", "Sure", "Alright", "Yep", "Nope", "Maybe", "Makes sense", "Got it", "Fair enough", "Same", "Kinda", "Sort of", or "Lol"/"K" on its own) used as the LAST or ONLY message before the fan replies or the conversation stalls. Quick multi-message bursts are fine — only flag a dead-end dry reply. → area "communication", severity medium.
- Laughing emojis: the chatter used a laughing emoji (😂 🤣 😆 😹 😅). Not allowed on our pages. → area "quality", severity low.
- Swearing out of context: the chatter uses harsh swearwords OUTSIDE of sexting / intimate talk (e.g. in normal chit-chat). Swearing during dirty talk is fine — flag it only when it is NOT part of an intimate exchange. → area "swearing", severity low.

PAGE-MANAGEMENT CATCHES (the manager wants eyes on these):
- Gift / package incoming: a fan says they are sending the creator a gift, a package, or something in the mail/on the way. Surface it so the manager can handle it. → area "gift", severity medium.
- Undelivered custom: a fan refers to a CUSTOM they already paid for / ordered that has NOT been delivered yet (chasing it, "where's my video", "still waiting"). The manager must troubleshoot this. → area "custom", severity high.
- Content too explicit: the chatter sends a screenshot / photo / description that is over-the-top graphic even by sexting standards (gratuitously extreme). Surface it for a look. → area "excessive", severity medium.

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
- high = a missed sale / ignored buying signal on a new sub, whale or spender (lost money); big (>50%) discount; strong compliance concern.
- medium / low = everything else; bare tips are always low.`;

const ISSUE_SHAPE = `"issues": [{"area":"tos | age | meeting | free_content | offplatform | discount | sales | new_sub | communication | budget | quality | swearing | gift | custom | excessive","severity":"critical | high | medium | low","detail":"what happened, with a brief exact quote (+ English translation if not English); name EVERY fan involved","fan":"the fan's USERNAME from the conversation header brackets (e.g. u573778077), or null",${EVIDENCE_FIELDS}}]`;

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
/**
 * Everything up to the AI call: load the day, build the prompt. Returns the
 * request plus finish(result, usage, elapsedMs) that turns the model's answer
 * into the stored evaluation — so the same code serves a direct call and the
 * Batch API. `corrections` can be passed in when many chatters share one run.
 */
async function prepareChatterDay({ orgId, chatterId, reportDate, creatorId = null, model = 'sonnet', promptVersion = 'A', corrections = null }) {
  const loaded = await loadChatterMessages(orgId, chatterId, reportDate, creatorId);
  if (!loaded.ok) return loaded;

  const { enrichIssue, spendByUser, creatorNames, creatorInstructions, creatorContext } = await buildEnrichment(orgId, loaded.msgs);
  const { tags: fanTags, earlier } = await loadFanContext(orgId, loaded.msgs, reportDate);
  // Tips and unseen purchases from Infloww, placed in each fan's conversation.
  const payments = await loadPayments(orgId, loaded.msgs, reportDate).catch(() => []);
  // Show each fan's recorded spend, tags (whale / new sub) AND which page (creator)
  // they're on, so the AI can weigh a missed sale and never mistake a cross-page
  // content difference for a single-page inconsistency. Safety-net hits always
  // make the cut.
  const { threadList, threadCount, totalThreads, droppedThreads, forcedThreads } = buildThreadList(withPayments(loaded.msgs, payments), {
    lineCap: 40, threadCap: 30, withSpend: true, spendByUser, withPage: true, pageNameByCreator: creatorNames,
    mustInclude: keywordFans(loaded.msgs, creatorContext), fanTags, earlier,
  });

  const systemPrompt = PROMPTS[promptVersion] || PROMPT_A;
  const houseRules = await loadHouseRules(orgId);
  const pageInstr = buildPageInstructions(loaded.msgs, creatorNames, creatorInstructions, creatorContext, houseRules.byPage);
  const coverage = droppedThreads
    ? `NOTE ON COVERAGE: you are seeing the ${threadCount} highest-value conversations of ${totalThreads} this chatter had. Judge only what you see; never conclude anything about the rest of their day.\n\n`
    : '';
  const past = corrections ?? await loadCorrections(orgId, reportDate);
  const userContent = `${houseRulesBlock(houseRules)}${pageInstr}${past}${coverage}Chatter conversations for ${reportDate}${creatorId ? ' (one page)' : ' (all pages)'}:\n\n${threadList}`;
  const baseModelId = MODELS[model] || MODELS.sonnet;

  const finish = (result, usage, elapsedMs) => {
    const { kept: issues, dropped } = verifyIssues(Array.isArray(result.issues) ? result.issues.map(enrichIssue) : []);
    return {
      ok: true,
      eval_type: 'compliance',
      model, model_id: baseModelId, prompt_version: promptVersion,
      elapsed_ms: elapsedMs, usage,
      // No score — just the spotlight list. (overall kept as a header.) Dropped
      // findings and coverage are stored with it so both can be audited later;
      // messages_reviewed lets a later upload tell whether the day grew since.
      evaluation: {
        overall: result.overall || '', issues, dropped,
        coverage: {
          threads_evaluated: threadCount, threads_total: totalThreads, threads_skipped: droppedThreads,
          threads_forced: forcedThreads, messages_reviewed: loaded.msgs.length,
        },
      },
      threads_evaluated: threadCount,
      threads_total: totalThreads,
      threads_skipped: droppedThreads,
    };
  };

  return { ok: true, request: { systemPrompt, userContent, model: baseModelId, maxTokens: 6000 }, finish };
}

async function evaluateChatterDay(opts) {
  const prep = await prepareChatterDay(opts);
  if (!prep.ok) return prep;
  try {
    const t0 = Date.now();
    const { result, usage } = await runAgentDetailed(prep.request);
    return prep.finish(result, usage, Date.now() - t0);
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}

module.exports = { evaluateChatterDay, prepareChatterDay, SPOTLIGHT_BODY };
