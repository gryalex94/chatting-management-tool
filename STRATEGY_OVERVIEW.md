# Chatter performance — evaluation blueprint

Distilled from the Rice Media Notion playbook (ToS + Chatting approach + Technical
details). This is the rubric we evaluate chatters against. Each dimension is tagged
**[Global]** (cheap, reliable → automated daily check on everyone) or **[In-depth]**
(nuanced → the manual per-chatter review), and flags where we **lack data**.

---

## 1. Compliance / ToS — **[Global]** (already live)
Hard rules; a breach is $500 + possible job loss.
- No copro/pee, minors, or relatives roleplay (stepdad/stepdaughter only for huge whales, very careful).
- No public-sex, bestiality/animal (even werewolf/unicorn fantasy) roleplay.
- No hardcore unless the sub is begging and it's only his fetish, no harm to third parties.
- Meetings: never say yes **or** no — deflect ("trust issues, who knows…").
✔ Covered by the compliance spotlight (`evaluateChatterDay`).

## 2. Engagement quality — split
The single most important craft area: the model must sound genuinely interested, not bored/interrogating.
- **No dry replies to spenders** — banned list ("Nice, Okay, Cool, Haha, I see, Sure, Alright, Yep, Nope, Maybe, Got it, Same, Kinda…"), flagged only when it's the last/only message before the fan replies or the chat stalls. → **[Global]** ADD to the spotlight.
- **No laughing emojis**; use only the approved palette. → **[Global]** ADD (deterministic; enforce "no laughing emojis" now, full palette later).
- Not one-sided — build on answers with mini-stories + reactions; open-ended questions; create emotion (mostly flirty); **mirror energy** (playful→playful, deep→deep); handle short answers (open them up, then gently check mood); **always move the conversation forward** (new angle/story/question); **human-like texting** (letter-stretching, gonna/wanna, ellipses, fragments, fillers, mobile-style casing); **>50% of messages** use a strategy. → **[In-depth]** (too nuanced for a daily broad pass).

## 3. Sales roadmap / execution — **[In-depth]**
Normal talk → Flirting → Horny → Sexual → Sale, **step by step, never skip**.
- **New sub:** small talk (gather info) → flirt till obviously horny (don't overheat — he won't buy the whole script) → figure out what he wants (indirect, then direct) → probe readiness ("I hope I'm not distracting you", NOT "what are you doing") → sale (script if general, PPV if specific) → aftercare.
- **Older spender:** small talk → confirm he's OK (not at work / broke / sad) → flirt → sale from history → aftercare. **Don't hard-push spenders — they should initiate.**
- **TW ($0):** may jump to sales after small talk; be provocative, only flirt (no sexual talk).
- **Script = a live-sexting experience** the fan believes is made now, just for him ("let me check the lights", "close the door"). **Ladder** pricing grows with explicitness.
- **PPV descriptions** create curiosity — describe but leave something hidden; must fit the fan's request; never sell content we don't have.
- **No free sexting** (even text) unless whale / recent big spender.
- **Push higher prices** if the sub buys fast without negotiating.
- **Aftercare** after a sale (or if he bought 50%+ of a script); on a fail, find out **why** and re-engage; after the whole script, offer **round two / something special** (don't be pushy — not "here for his money").

## 4. Pricing — **[In-depth]** (dropped from Global — too context-dependent)
- Naked photo $45–55, video $70+, long full-nudity video (5–7 min) $100+, script ladder free→$10→$25→$50.
- **Respect spending history** — sold a video at $60 once → he expects ~$60 next; can't scale much beyond it.

## 5. Prioritisation & reply time — **[Global]** (deterministic, already live)
- Reply **< 2.5 min** to new subs / spenders / active sales.
- Priority order: **New subs > Whales > Spenders > Unsub-spenders > Unsubs/TW.** No ignoring even low spenders.
✔ Reply-time + AFK engine covers the timing; tier ranking already implemented.

## 6. Notes discipline — **[In-depth]** · ⚠️ DATA GAP
- **Model notes**: know the model's interests (Infloww notes + IG); if a fan references an obvious model interest and the chatter misses it, that's a lost case / exposure risk.
- **Fan notes**: note every detail a sub shares (esp. spenders); missing notes on spenders is **penalised**.
⚠️ We don't ingest Infloww notes today, so this can't be auto-checked yet — flag as a future data source.

## 7. Fan tiers (defines who matters, sharpens everything above)
- **TW** = $0 lifetime spend. **PS (Potential Spender)** = a new sub who spends **$80+** → "PS" treatment (whale-like effort) for 1–2 weeks. **Whale** = **$1000+**.
- More spend = more effort expected **and stricter review**.
- ⚠️ Our `classification` field has `ps`/`whale`; confirm PS is keyed to the **$80 first-session** rule (we currently lean on total_spend/classification).

---

## What this changes in the build
- **Global daily check** gains exactly two items: **dry-reply** (spotlight) + **laughing-emoji** (deterministic, low priority). Pricing stays out.
- **In-depth review** = dimensions 2 (full), 3, 4, plus notes when we have the data — evaluated per-conversation with the roadmap, producing coaching cases.
- **Data gaps to close later:** Infloww fan/model notes (notes discipline), and a first-session-$100/$80 signal for instant PS/whale flagging.
