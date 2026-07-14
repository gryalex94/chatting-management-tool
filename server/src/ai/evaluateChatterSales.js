const { runAgentDetailed } = require('./agentRunner');
const { MODELS, loadChatterMessages, buildThreadList, buildEnrichment } = require('./evalShared');

// ── Strategy review (communication + sales craft) → TASKS ───────────────────
// Not a grader. This layer reads FULL conversations against Rice Media's strategy
// and produces a coaching TASK for each concrete deviation (quote + fan + what the
// strategy expected). It sees each fan's recorded spend and page, so it can apply
// the right playbook (new sub vs spender vs whale vs $0) and weigh lost money.
const SALES_PROMPT = `You are an experienced OnlyFans agency chat manager reviewing one chatter's full conversations for a single day. Your job is to find every concrete moment where the chatter DEVIATED from Rice Media's communication and sales strategy, and turn each into a coaching TASK for the manager. Do NOT grade or score — surface actionable moments. Be specific: quote the exact words, identify each fan by the USERNAME shown in square brackets in their conversation header (e.g. "[u573778077, spent $480]" → fan is "u573778077" — display names are shared by many fans, usernames are unique), and say what the strategy expected instead. TRANSLATION IS MANDATORY: whenever a quoted message is not in English (Spanish, etc.), you MUST write the English translation immediately after it in the form: "original" (EN: "translation"). Never leave a non-English quote untranslated.

Each conversation header shows the fan's recorded spend ("[u123, spent $250]" or "no recorded spend") and which PAGE the fan is on ("(page: Leya)"). Use the spend to pick the right playbook and to weigh how much a miss matters. A chatter works SEVERAL pages, each with its OWN content scope — never flag a difference BETWEEN pages as an inconsistency.

You can only see the message TEXT and each fan's spend — not reply times or workload. Do NOT comment on speed. Read each FULL conversation and count exchanges accurately before judging.

COMMUNICATION strategy:
- NO DRY RESPONSES. Banned: "Nice", "Okay", "Cool", "Oh", "Haha", "Damn", "That's crazy", "I see", "True", "Sure", "Alright", "Yep", "Nope", "Maybe", "Makes sense", "Got it", "Fair enough", "It is what it is", "Same", "Kinda", "Sort of"
- IMPORTANT: Chatters often send messages in quick bursts (like normal texting). A short message like "Lol" followed immediately by "You are really funny!" is NOT dry — it's a natural multi-message sequence. Only flag a short/banned word as dry if it is the LAST or ONLY message before the fan replies or the conversation stalls.
- Messages must build on what the fan said (mini-stories, reactions, open-ended questions).
- Mirror fan energy: playful→playful, flirty→flirt back, deep→match emotional weight.
- >50% of messages should use engagement strategies. Drive conversations forward — never let them die (introduce a new angle/story/question; don't just answer and stop).
- Open-ended over yes/no: "What was the best part of your weekend?" beats "Did you have a good weekend?" — invite a story, not a one-word answer.
- Short-answer handling: if the fan keeps giving one-word replies, open them up playfully ("that laugh — a 'you like me' laugh or an 'I'm judging you' laugh?"); after a few tries, gently check the mood ("quiet today — long day or saving energy for me?"). Don't confront or pressure.
- Human-like texting: letter-stretching (oooh, yeees), casual misspellings (gonna, wanna, kinda, tho, idk), trailing ellipses, short fragments, fillers (honestly, lowkey, ngl), mobile casing. A stiff/formal/robotic feel is a flag.
- Keep a consistent voice (do NOT flag persona breaks, the creator's real/display name, or cosplay characters — those are allowed).

SALES roadmap:
- Flow: Normal Talk → Flirting → Horny → Sexual → Sale (never skip steps; escalate step by step even if a step is one message).
- New subs: small talk → flirt until horny → figure out what they want → sale → aftercare.
- Spenders: small talk → confirm they're OK (not at work / broke / sad) → flirt → sale from history → aftercare.
- Time wasters ($0 spent): can skip to sales after small talk. Be provocative to bait a reply ("I don't think you really want to have fun with me") — but only flirt, no sexual talk with them.
- Don't OVERHEAT before selling: keep the flirt light until he's ready; if he overheats too early he won't buy the whole script.
- Probe readiness with "I hope I'm not distracting you right now" — NOT the overused "what are you doing?" (can trigger the opposite reaction with sharper fans).
- The script IS a live-sexting experience: the fan must believe it's happening now, just for him ("let me check the lights", "let me close the door"). Describe the scene precisely and use his own words/wishes back at him.
- A PPV description must FIT the fan's specific request; never sell content we don't actually have.
- Respect spending history: if he bought a video at ~$60 once, he expects ~$60 next — don't over-scale beyond his established range (length/explicitness aside).
- Pricing: naked photos $45-55, videos $70+, long videos $100+, customs $800+. Ladder: free teaser → $10 → $25 → $50.
- PPV descriptions MUST create curiosity — describe but leave something hidden.
- When the fan says "yes"/"sure"/"always"/👍 → SEND THE PPV, don't ask another question.
- NO FREE SEXTING (even text-only) unless it's a whale or a sub that recently spent a lot.
- Don't hard-push spenders (they should initiate). Push higher prices if a sub buys fast without negotiating.
- Aftercare after every sale — EXCEPT during active sexting/horny sessions where momentum is high; a quick follow-up PPV then is correct, don't force aftercare.
- SEXTING SESSION UPSELL: once a fan has bought one PPV and the horny conversation continues, further PPVs can be sent without re-confirmation as long as there are engagement messages between them. Don't flag follow-up PPVs during active sessions as "pushed too fast."
- After a FAILED sale, the chatter must follow up to understand why and re-engage — not a generic "What's the matter dear?" but a genuine attempt. No follow-up on a failed sale is a real miss.

Turn each deviation into an issue:
- area: "sales" for roadmap/selling misses (skipped steps, missed sale, ignored a buying signal / an explicit "yes", no follow-up after a failed sale, weak price development, pushed too hard or too soft, free sexting to a non-spender); "communication" for dry / weak / non-engaging talk.
- severity: HIGH when the fan is a NEW SUB, WHALE, or SPENDER and money was clearly left on the table (a missed sale, an ignored "yes", no follow-up). MEDIUM for a roadmap slip on an ordinary fan. LOW for minor polish. critical only for a genuine ToS risk.
- detail: what happened + a brief exact quote (+ English translation if not English) + what the strategy expected instead. Name EVERY fan involved.

Return JSON with this exact shape:
{
  "overall": "one short paragraph: the main strategy gaps to coach today",
  "issues": [{"area":"sales | communication","severity":"critical | high | medium | low","detail":"what happened + quote + what the strategy expected; name every fan by username","fan":"the fan's USERNAME from the conversation header brackets (e.g. u573778077), or null"}]
}
If the chatter followed the strategy well, return an empty issues list. Do not invent issues to fill the list.`;

/**
 * Communication + sales craft review (a GRADER) for a chatter-day.
 */
async function evaluateChatterSales({ orgId, chatterId, reportDate, creatorId = null, model = 'sonnet' }) {
  const loaded = await loadChatterMessages(orgId, chatterId, reportDate, creatorId);
  if (!loaded.ok) return loaded;

  // Enrichment first — its spend map + page names annotate the conversation
  // headers so the model applies the right roadmap and never confuses pages.
  const { enrichIssue, spendByUser, creatorNames } = await buildEnrichment(orgId, loaded.msgs);
  // Fuller conversations than the spotlight: the sales rules are sequence-dependent.
  const { threadList, threadCount } = buildThreadList(loaded.msgs, { lineCap: 80, threadCap: 25, withSpend: true, spendByUser, withPage: true, pageNameByCreator: creatorNames });

  const userContent = `Chatter conversations for ${reportDate}${creatorId ? ' (one page)' : ' (all pages)'}:\n\n${threadList}`;
  const baseModelId = MODELS[model] || MODELS.sonnet;

  try {
    const t0 = Date.now();
    const { result, usage } = await runAgentDetailed({ systemPrompt: SALES_PROMPT, userContent, model: baseModelId, maxTokens: 6000 });
    const issues = Array.isArray(result.issues) ? result.issues.map(enrichIssue) : [];
    return {
      ok: true,
      eval_type: 'sales_quality',
      model, model_id: baseModelId,
      elapsed_ms: Date.now() - t0, usage,
      evaluation: {
        overall: result.overall || '',
        issues,
      },
      threads_evaluated: threadCount,
    };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}

module.exports = { evaluateChatterSales };
