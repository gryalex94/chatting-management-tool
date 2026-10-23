# AI chat engine: plan of 23 October 2026 (round 4)

For the coding agent that executes it. Read `AGENTS.md` first: it maps the engine and states the rules that always hold (never commit `server/.env` or fan data, never add sending toward Fanvue, plain language, commit to `main` and push after each finished group, the manager's rules stay as they are). The previous plan, `AI_CHAT_FIX_PLAN_22_OCT.md`, is done (commits `4b59cfd` to `b489a00`); this one builds on that code.

## Where this comes from

1. **Practice run 11** (`ai_practice_runs` id 11): the manager's chat with a made-up new subscriber, "Bob", on 22 Oct, on the round-3 code. The decision maps are saved in the run's `turns`. What went wrong is laid out at the top of Group F.
2. **The research report** `reports/Communication and sales papers for Yuna.md`. From its ranked list the manager picked seven items: names and callbacks out of the ask; questions judged by relevance; her share rides on a reaction; repairs by type; three wishes read from every message with a brake on selling; hard moments scored properly; three marks per reply in the practice room. They are Groups G and H.

**Standing rule (from round 3):** a check in code may flag a draft and ask the writer for a rewrite; code never changes her words in a way that changes their meaning.

**The one interpretation of the manager's rule A1 this plan makes.** A1 (in `AI_CHAT_ADJUSTMENT_QUESTIONS.md`) sets the path for a new subscriber: his vibe, about 3 exchanges of flirting, about 3 in a sexy vibe, then the direct ask and a probe offer at $30–50; "the first offer not bought: warm, no pushing for the rest of that conversation"; "if he is not into sexting but something else, never push him into it". The stage lengths stay as they are, as minimums. This plan adds: the direct ask also waits for a moment that fits and for him to have flirted back at least once, and "no, I just want to talk" ends the path for that conversation, warm and without pushing. A declined ask is not a time-waster strike (no PPV was sent), and the next conversation starts the path over, as A1 already says for a fan who leaves early. Change this only if the manager says so.

**Tested patterns.** Every regular expression in this plan is in `server/scripts/probes/round4-patterns.cjs` with 68 lines it must or must not catch, most of them real lines from runs 8, 10 and 11. Run it first; use the expressions from it, or tighten them and keep the file passing.

Everything is in `server/` unless the path says `client/`. Line numbers are as of `80c7c4c` and may have moved a little.

---

## Group F: the Bob chat (practice run 11)

What the decision maps show, by her reply:

| Reply | He wrote | What the engine decided | What she said |
|---|---|---|---|
| 3 | "My name is Bob, and you?" | answer his question, react with interest; no question (two in a row) | "yuna, but you can call me Little Yuna": his name never acknowledged |
| 4 | "Got ya, my pleasure!" | the reader called a closing pleasantry a joke; react, plus one easy question about him | "Bob, love that name. You're making me feel all kinds of special already.": his name a turn late, a feeling he did nothing to cause, no question; the door check passed because any "you" counts as a door |
| 5 | "What do you mean?" | the new clarify rule fired correctly: "say plainly what you meant" | first draft restated the claim ("just that you're already making my day brighter"), Claude called it a dodge, the fix restated it again: "I just meant you're making me blush, babe" |
| 13 | "Really? Why?" | the direct ask, by count (her 13th reply), although his heat never passed 32 of 100 all chat and he never wrote anything sexual | the writer refused the ask three times (status "check"), Practice kept the reply, so the ask was still owed |
| 14 | "And I always prefer to be invisible" | the direct ask again, although the reader read him as cooling ("he finds her line dull or too much", 60%; heat down to 12) | "Funny how you like hiding / What would you want to see of me then?" |
| 15 | "I'd be glad to talk to you a bit, I came here just to talk to you" | `firstSaleStage` returns "offer" as soon as the ask is out, without reading his answer; the reader said "he wants real conversation, not content" (60%), doubt 50, readiness 10 | "Talking to me sounds perfect... / I might have just what you need" with a PPV; Claude called it weak, but its fix never runs on selling goals |

### F1. His answer to the direct ask decides the offer; "just talk" ends the path

**Files:** `src/ai/chat/selling.js` (`firstSaleStage`), `src/utils/aiChat.js` (`reply()`, around lines 1040–1090 where `direct`, `stage` and `session.first_sale` are handled), `src/ai/chat/plan.js` (the ladder at lines 340–341, `holdFor` at 276), `src/ai/chat/gauges.js` (readiness).

**Now:** `if (asked) return { stage: 'offer', … 'the direct ask is done (A1)' }`: any message after the ask gets the probe offer.

**Change:**

- In `reply()`, classify his message once the ask is out (`session.first_sale.asked` and no attempt yet this conversation):
  - `decline`: `TALK_ONLY` (from the patterns file), or `S.BROKE`, or a reader reading with `sure >= 0.5` whose `what` matches `/\b(?:real conversation|just (?:to )?talk|not (?:here )?for (?:content|pics|buying)|not interested in (?:buying|content|pics))\b/i`, or (once H1 is in) `reading.wishes.buy === '-'`;
  - `wants`: a content match (`askedHere.full.length`), `asksNow`, `S.WANTS_TO_BUY`, his level 2 or more, or a yes or a hand-over at the start (`/^\W*(?:yes|yeah|yep|sure|ok(?:ay)?|surprise me|show me|anything|whatever you (?:want|like)|you choose|up to you)\b/i`);
  - `unclear`: anything else (a joke, a question back).
- The same `decline` test also runs before the ask: a new subscriber who says he only wants to talk is not walked to an ask in that conversation.
- Store it: `session.first_sale = { …, declined: true }` on a decline; `unclear: n` counts unclear answers. Two unclear answers count as a decline. A decline is lifted only when he asks himself (`asksNow`) or turns sexual himself (his level 2 or more), and then the path resumes where it was.
- `firstSaleStage` takes `declined` and `answer`. Order: offered → `done`; direct → `offer` (as now); declined → `{ stage: 'declined', text: 'He said he just wants to talk: take him at his word, warm and easy; nothing sold and no ask for the rest of this conversation unless he asks himself', why: 'he declined (A1: no pushing after a no)' }`; asked with `wants` → `offer` (as now); asked with `unclear` → `{ stage: 'asked', text: 'You asked what he would like to see and he has not said: answer what he wrote, keep the vibe, no PPV until he says what he wants', why: '… (A1)' }`.
- `plan.js`: stages `declined` and `asked` set no first-sale goal; the soft slot picks talk moves; `holdFor` returns the stage's reason for every selling goal. On a decline the readiness meter drops to 5 or below ("he said he just wants to talk").
- The decision map's session step says which answer was read and why.

**Must hold:** replaying run 11, reply 15 is not `first_offer` and no PPV is allowed. "yes show me" and "what do you have?" after the ask give `first_offer`. "lol maybe" gives stage `asked` and no PPV. A second unclear answer gives `declined`. A decline is not counted as a failed conversation for the time-waster rules (`session.js`, `strikes7`).

### F2. The direct ask waits for a moment that fits, and for him to have gone along

**Files:** `src/ai/chat/plan.js` (the ladder at line 340, where `stage.stage === 'ask'` becomes `direct_ask`), `src/utils/aiChat.js` (`reply()`: the session counters, next to the `held` counter at line 1216).

**Now:** the ask comes at her 13th reply (or 3 replies after he got sexual), whatever he is doing. In run 11 it came while he was asking her something and then while the reader read him as cooling.

**Change:**

- In `reply()`, remember whether he has gone along: `session.first_sale.warm = true` once his level was 1 or more, or the reader read him `flirting` or `sexting`, or he complimented her (`p.complimented`).
- In `planReply`, when the stage is `ask`, check that the moment fits. It does not fit when:
  - he is cooling: `pulled_back`, his mood annoyed or sad, the mood meter under 45, doubt 50 or more, or a reading with `sure >= 0.5` matching `/\b(?:dull|boring|bored|too much|annoyed|irritated|pushing back|not interested|losing interest|real conversation|not content|uncomfortable|put off)\b/i` (and, once H1 is in, a `-` on talk or buy in his latest read);
  - he just asked her something (`DIRECT_Q` or the reader's `asked`): she answers this time, and the ask may come next time;
  - it is a clarify or repair turn.
- If the moment does not fit, the goal is the sexy vibe (`sexy_vibe`, with its beats) and the text says why the ask waits; set `p.ask_waits = <reason>`. In `reply()`, count `session.first_sale.waited` up by one each time. After 6 waits in a conversation, the stage is `no_ask` (below).
- If he never went along (`warm` still false), the ask does not come; the stage stays flirting ("keep it flirty and fun; the ask waits until he flirts back"). If her 20th reply in the conversation comes and he still has not gone along, the stage is `no_ask`: `{ stage: 'no_ask', text: 'He never went along with the flirting: no ask this conversation, just chat warmly', why: 'A1: never push him into it' }`, with the same holds as `declined`.

**Must hold:** replaying run 11, reply 13 is not `direct_ask` (he asked "Really? Why?") and reply 14 is not `direct_ask` (the cooling reading). In the simulation, every first-sale dialogue where the fan flirts back or gets sexual reaches the ask at the same reply as before; list any that moved, with the reason.

### F3. A feeling he did nothing to cause is not said

**Files:** `src/ai/chat/safety.js` (`DECLARED` line 233, `voiceProblems` from line 235), `src/utils/aiChat.js` (`DECLARED_RE` at line 2691 is a copy: import `DECLARED` from `safety.js` instead; `pickCandidate`; `SERIOUS_STYLE` at line 1784; where `voice` is built at line 1141).

**Now:** the warmth dial knows "I care about you" and "I miss you" but not "you're making me feel special", "you're making me blush" or "you're making my day", which are the lines the writer actually reaches for.

**Change:**

- Add `FELT_FROM_HIM` (patterns file) to `safety.js`.
- `voice.earned` is set in `reply()`: true when his latest message is a compliment to her (`replyPlan.complimented`) or flirts with her (his level 1 or more and the reader's `doing` is `flirting`).
- In `voiceProblems`: when the closeness is new or friendly and `FELT_FROM_HIM` matches a draft that is not earned, the problem is: "It says he makes you feel something (special, blushing, your day made) that his message didn't cause: react to what he actually said." When it is earned, at most once in her last ten replies, like declared feelings.
- Add `his message didn't cause` to `SERIOUS_STYLE`, so the problem gets a second rewrite and a "check" status if it stays.
- `pickCandidate`: −20 for an unearned `FELT_FROM_HIM`, with "claims a feeling he didn't cause".

**Must hold:** reply 4 of run 11 ("Bob, love that name. You're making me feel all kinds of special already." after "Got ya, my pleasure!") is flagged. "aww you're making me blush" right after "you're stunning" passes the first time and is flagged the second time within ten replies.

### F4. A pleasantry closes a topic, so she leads; his name is acknowledged when he gives it

**Files:** `src/ai/chat/strategy.js` (`readPrompt` around line 106, `readReading` around line 130, `ANSWERS`), `src/ai/chat/plan.js` (`beatsFor` around line 70), `src/ai/chat/gauges.js` (`scoreMoves`), `src/ai/chat/review.js` (the coach's notes around line 200), `src/utils/aiChat.js` (`DOOR` at line 1763, the checks in `writeOne`, `pickCandidate`).

**Now:** "Got ya, my pleasure!" was read as a joke; the plan reacted to it; and the door check let a reply with nothing to answer through because it contained "you".

**Change:**

- Reader: a new value for `answers`: `"closing"`, described as "a pleasantry that closes the exchange ('got it', 'my pleasure', 'nice to meet you', 'likewise', 'cool', 'haha ok', 'sounds good'): nothing in it to react to; she leads". Not a joke, not odd. Add it to `ANSWERS`.
- Plan: when `answers` is `closing` in a talk goal, the beats are "a short warm acknowledgement, or none" and "lead: one easy question about him, or a small thing of yours that opens a new topic". In `scoreMoves`: react −15, get to know +15, curious +10 when the reader has a question, share +5.
- Coach: a note like the one for jokes: "He closed the exchange with a pleasantry: leading with something new is right here; reacting to it is not."
- `DOOR`: the new expression from the patterns file. A bare "you" is no longer a door; a question, a guess about him, a dare or an invitation is.
- His name: `NAME_GIVEN` (patterns file; also filter the result with `NOT_NAMES`, as `hisNames` does) on his latest message. When it finds a name, the plan's react beat becomes "say his name back warmly ('nice to meet you, Bob')", and when he asked hers and she has not given it, the answer beat stays first. Check in `writeOne` (a normal style note, not serious): her reply has neither his name nor `/nice to meet|pleasure to meet|lovely to meet/i` → "He just told you his name: say it back warmly ('nice to meet you, Bob')."
- A late comment on his name: `LATE_NAME` (patterns file) in her reply when his name came before his latest message → style note "It comments on his name late; he gave it earlier. React to what he just said." and −15 in `pickCandidate`.

**Must hold:** run 11 reply 3 gets the name beat; reply 4's draft is flagged by the door check and by `LATE_NAME`; `DOOR` does not pass "You're making me feel all kinds of special already." One live reader call (in the written moments, below) reads "Got ya, my pleasure!" after her name as `closing`.

### F5. Repairing an overclaim takes it down; pet names wait for him

**Files:** `src/ai/chat/plan.js` (the clarify rule: `p.clarify` at line 401, `answer_first` at line 496, `beatsFor` line 77, `planText` line 598), `src/ai/chat/prompts.js` (`tidyMessages` and `petLately` at line 510), `src/utils/aiChat.js` (`writeOne`'s `prep`, the voice object).

**Now:** "say plainly what you meant" made the writer restate the claim it could not back up; a pet name went into the repair; and the pet-name cap for a new fan ends after her third reply.

**Change:**

- In `planReply`, when `p.clarify` is set and her last line matches `FELT_FROM_HIM`, `DECLARED` or the `COMPLIMENT` in `safety.js` (a compliment on him), mark the repair as an overclaim (`p.clarify_kind = 'overclaim'`). Its `answer_first`: "He didn't get your last line ("…"): it said more than the moment had. Take it down a notch in plain words (what you really meant, like that it's nice to meet him, or that you like talking to him); light, no apology, don't say the claim again, then carry on." The first beat says the same in short.
- In `writeOne`, on an overclaim repair, `FELT_FROM_HIM` or `DECLARED` in the draft is a serious style note: "It says the claim again: take it down a notch instead."
- `tidyMessages` takes `noPet`: when set, pet names are dropped from every message. `writeOne` sets it when the plan is a clarify or repair turn, or the goal is `comfort`, `reassure`, `calm`, `ease_off`, `honest_no`, `why_not`, `goodbye` or `dry_bye`, or he declined this turn (F1).
- A new fan's pet names: `petLately` also holds while the closeness is new and he has not gone along yet (`voice.warm`, from `session.first_sale.warm` or a pet name or flirty word of his toward her in this conversation). After that, the existing cap applies (none in her first three replies, at most one in her last four).

**Must hold:** replaying run 11, reply 5 is an overclaim repair and its fixed draft ("I just meant you're making me blush, babe") is flagged, and "babe" is dropped from any repair. In run 11 he went along with his first message's compliment, so after that the usual cap applies; a fan who never flirts back gets no pet name at all.

---

## Group G: the cheap research items

### G1. His name and her memories stay out of the ask

**Files:** `src/ai/chat/prompts.js` (`tidyMessages`, `dropName` at line 474, the offer guidance in `replyPrompt`), `src/ai/chat/plan.js` (the callback choice around line 552), `src/utils/aiChat.js` (`writeOne`).

**Why:** in the name experiments (a scripted restaurant visit), a customer's name used at random points raised upsell acceptance (d = 0.36 over no name); the same number of mentions placed beside each upsell gave nothing over no name and felt more frequent than it was. In the retail field experiment, personalisation sold through "it's trying to help me" and lost through "it acts like it knows me".

**Change:**

- `tidyMessages` takes `noName`: when set, every one of his names is dropped (`dropName`). `writeOne` sets it when the goal is `offer`, `first_offer`, `cheaper`, `steer_to_sale`, `direct_ask`, `readiness_check`, `point_to_ppv`, `why_not` or `answer_ppv`, and in her first reply after he declined (F1) or passed on a PPV.
- Callbacks: drop `steer_to_sale` from the goals that may carry a callback (around line 552), and never attach `p.callback` to any goal in the selling set.
- The offer guidance in `replyPrompt`: "Why it suits him: only what he said in this conversation, in his words ('you said you love lingerie'); never 'I know you like…', 'guys like you', or what he did before. No name of his and nothing you remember about him in the message with the PPV or the price; a callback belongs in an earlier turn."
- Check in `writeOne` (a normal style note): `KNOWS_HIM` (patterns file) in a reply with a PPV → "It acts like you know him ('I know you like…'): say why it fits in his own words, or not at all."
- Mutual names: when her reply asks his name and she has not given hers in this conversation, the beat adds "give your name too" (in the restaurant field experiment a mutual exchange of names did best on every outcome).

**Must hold:** `tidyMessages(['Mike, this one is just for you'], { noName: true, names: ['Mike'] })` drops the name. `planReply` never returns a callback with a selling goal. "I know you like lingerie" in an offer reply is flagged.

### G2. A question is judged by whether it follows him, not by a count

**Files:** `src/utils/aiChat.js` (`noQuestionWhy` around line 2095, `voiceFor`, `writeOne`, `pickCandidate`), `src/ai/chat/gauges.js` (`band` at line 154), `src/ai/chat/plan.js` (`p.ask`), `scripts/scorecard.js`.

**Why:** in recorded conversations between strangers, a follow-up question about what the other person said predicted connection in deep talk and did nothing in small talk; question counts were not the lever.

**Change:**

- `noQuestionWhy` keeps: "he answered your question: do what he chose", the hard-moment exception, "he told you what he wants", and three questions in a row as a block. The two-in-a-row rule and the more-than-half-of-ten rule stop being blocks: they return `followOnly` instead ("you asked in your last two replies: a question now only if it follows up something he just said, in his words; never a new topic"). `voiceFor` returns it, and the plan's `ask` becomes `{ allowed: true, follow_only: true, why }`.
- A follow-up: the question shares a topic word with his latest message (`Plan.topicWords`), or it is a short reaction question (`/^(?:really|how come|why|what happened|and then|how so|wait,? what|seriously|for real|which one|how long|since when)\b/i`).
- In `writeOne`, under `follow_only`, a question that does not follow him is a normal style note ("Your question changes the subject after two questions in a row: ask about what he just said, or no question") and −20 in `pickCandidate`.
- `pickCandidate`, when he shared something (`reading.doing` is `sharing` or `venting`) and the draft asks: +10 for a follow-up ("follows up on what he shared"), −10 for a new topic ("changes the subject").
- `band` in `gauges.js`: the −40 for two in a row goes when the state is `follow_only`; three in a row keeps −40.
- `scorecard.js`: a new measure, "her questions that follow up his last message", reported with its 95% range. If the human chatters' library is on disk, measure it the same way for a band; if not, report hers only.

**Must hold:** run 8's third reply still allows a follow-up; three in a row is still blocked everywhere; a new-topic question after two in a row is flagged and loses in the picker; the simulation stays at zero flags.

### G3. Her share rides on a reaction to his words

**Files:** `src/ai/chat/gauges.js` (the share move in `scoreMoves`, `MOVES.share`), `src/ai/chat/plan.js` (`BEATS.share`, `beatsFor`).

**Why:** in the chatbot study, the bot's own self-disclosure added almost nothing once its responsiveness was counted, and the authors warn it can backfire without supportive behaviour.

**Change:**

- The share move is allowed only when rapport is 40 or more or he asked about her (`reading.doing === 'asking'`); otherwise its reason is "too early for a story of hers: react to him first".
- In `beatsFor`, whenever a share beat is planned and the first beat is not an answer or a reaction, put "react to his exact words first (name the detail he gave)" in front.
- `BEATS.share`: "a small real thing of yours that matches what he just said (same topic), after reacting to his words; a person in it when it fits".

**Must hold:** run 8's third reply plans no share (rapport 27, he did not ask about her); run 11's reply 10 may share (he asked about her work); a planned share is never the first beat.

### G4. Repairs by type, and she carries on afterwards

**Files:** `src/ai/chat/plan.js` (`CONFUSED` at line 125, the clarify rule), `src/ai/chat/review.js` (`COACH_SCHEMA`, the coach's checklist), `src/utils/aiChat.js` (`CHECK_POINTS` at line 1886, the fix trigger at line 1304).

**Why:** in the study of repairs on a bot's turn, people asked for a definition ("what's a platz?"), for the meaning of "that", for the whole line again in other words ("what do you mean"), for an example, or for a repeat. Each worked as three turns: his request, her repair, then back to what she was doing (the agent defined the item and offered it again). The authors found language models mixing these up (a paraphrase when asked to repeat, a paragraph when a sentence was wanted).

**Change:**

- When `p.clarify` is set, classify the kind with the patterns file: `term` (`TERM_Q`, and the term appears in her last reply), `that` (`THAT_Q`), `example` (`EXAMPLE_Q`), `repeat` (`REPEAT_Q`), otherwise `whole`. Move "come again" from `CONFUSED` to `REPEAT_Q`. An overclaim (F5) takes precedence over `whole` and `that`.
- Each kind gets its own `answer_first`: `term`, say what the term means in plain words; `that`, name plainly what her last line pointed to; `whole`, say the last line again in plainer words (it may be a little longer); `example`, one concrete example; `repeat`, the same words again.
- Carrying on: when her muddled line was a question, she may ask it again in plainer words (`ask.allowed`, why "carry on: ask your question again, plainer"); otherwise no question, as now.
- A new coach point `clear`: "could he misunderstand a line: a 'that' or 'some of that' with nothing it points to, an in-joke he was not part of, a claim the moment doesn't support? weak if so." Add it to `COACH_SCHEMA` (required), `CHECK_POINTS` ("Being clear"), and to the fix trigger for talk goals: `c.points?.clear?.verdict === 'weak' && TALK_GOALS.has(replyPlan.goal)`.

**Must hold:** the patterns file sorts the kinds; one live coach call (written moments) marks "I could use some of that right now actually" after "We like to explode every now and then" as unclear.

---

## Group H: the bigger lever

### H1. Three wishes read from every message

**Files:** `src/ai/chat/strategy.js` (`readPrompt`, `readReading`), `src/utils/aiChat.js` (the session after the briefing), `src/ai/chat/gauges.js` (`updateGauges`), `src/ai/chat/trace.js` (`momentStep`, `gaugesStep`).

**Why:** in a released dataset of 109 sales chats rated line by line (the numbers are our researcher's computation on that data, not the paper's), the seller's lines that lowered a buyer's willingness predicted failure (r about −0.4 to −0.5); the lines that raised it predicted almost nothing; the wish to buy rose late and separately from the wish to talk; a negative late in the chat halved purchases (30% against 49%). Engagement, disclosure and readiness to buy are three different things.

**Change:**

- The reader gets a field `wishes`: `{ "talk": "+|0|-", "tell": "+|0|-", "buy": "+|0|-" }`, for how his latest message responds to HER LAST LINE. talk: + he keeps it going (longer, asks back, enthusiastic), − shorter, dismissive, wants to stop. tell: + he tells her about himself, − he refuses or deflects a personal question. buy: + interest in seeing or buying her content (asks what she has, says yes to an offer, curious about her pictures), − declines, says he just wants to talk, objects to a price, is irritated by selling. Empty when her last line gave him nothing to respond to (his first message). `readReading` checks the values.
- The session keeps the last six reads (`session.wishes`, with her reply number).
- Meters: buy + raises readiness by 20 ("he showed interest in her content"), buy − lowers it by 30 ("he signalled no to buying"); talk − lowers engagement by 10.
- The decision map shows the three reads in the moment step.

**Must hold:** one live reader call each (written moments): Bob's "I came here just to talk to you" after her ask reads buy −, talk +; "what do you have for me tonight?" reads buy +.

### H2. A no to buying is the brake; an offer needs a yes signal

**Files:** `src/ai/chat/plan.js` (`holdFor` at line 276), `src/ai/chat/gauges.js` (the steer and offer moves).

**Change:**

- The brake: a buy − in his last two reads holds `steer_to_sale`, `offer`, `first_offer`, `direct_ask`, `readiness_check` and `point_to_ppv` for the rest of the conversation: "he signalled no to buying ('<his words>'): warm, no pushing this conversation unless he asks". It lifts when he asks himself (`asks`) or writes something explicit (`veryHorny`). For a new subscriber this is the same rule as F1, read by the model as well as by the pattern.
- The gate, on a planned attempt (aim `sell`): a PPV goes only when his latest read is buy +, or he asked. Otherwise the plan does the readiness check first (if it was not asked yet) or one steer. A buy 0 after the check allows one more steer at most; a buy − is the brake. The cadence (which day an attempt is due), the pause after a big spend and the first-sale stages stay as they are; the gate only decides the moment within an attempt that is already allowed. Story steps of a sexting set already under way (`sexting.next`) and a paid roleplay are exempt.

**Must hold:** in the simulation, the dialogues where the fan asks or says yes keep their offers at the same reply; list every offer that moved, with the read that moved it. Bob's run: no ask at 14, no offer at 15 (F1 and F2 already, H2 by the model's read too).

### H3. Hard moments scored properly

**Files:** `src/ai/chat/plan.js` (the comfort goal at line 327, `p.hard` at line 390, `planText` at line 602), `src/utils/aiChat.js` (`writeOne` checks), `src/ai/chat/review.js` (the coach's `understood` point).

**Why:** in the feeling-heard study, naming the feeling and calling it fair, recognising his effort, taking his side and repeating his words back went with feeling heard; reassurance, "I'm sorry" and her own story did not. In the coaching experiment, the corrections that moved people most were: validate, stop advising, ask an open question.

**Change:**

- The comfort beats: "name what he feels, in his words, and that it makes sense"; "one open question that invites him to say more (not 'are you ok?')". No suggestions unless he asked for advice (`ADVICE_ASKED`, patterns file); when she thinks he would want ideas, she asks whether he wants them.
- Checks in hard moments (`p.hard`), both serious style notes: `DISMISS` → "It brushes his feeling off ('<the words>'): name it and stay with it." `ADVICE` without `ADVICE_ASKED` in his recent messages → "It gives advice he didn't ask for: stay with what he feels; ask if he wants ideas." Add both phrases to `SERIOUS_STYLE`.
- The coach's `understood` point, in hard moments, checks the six things from the coaching study: the feeling named and validated; his words reflected; one invitation to say more; no unasked advice; nothing dismissive ("don't worry", "it'll be okay", "at least"); nothing about herself.

**Must hold:** the married-man written moment ("my wife does not know I am here", "she is just not into this stuff anymore") has no `DISMISS` or `ADVICE` in the final reply and asks one open question.

### H4. Three marks per reply in the practice room

**Files:** `client/src/pages/aichat/PracticeTab.jsx` (`Bubble` at line 41, the save at line 493), `src/utils/aiChat.js` (`savePracticeRun`: keep the marks in `turns`), `scripts/scorecard.js`.

**Why:** the sales dataset was built by people rating each seller line on the three wishes; the person playing the fan is the cheapest and closest judge there is, cheaper than a judge model.

**Change:**

- Under each of her kept replies, next to "Star it", three small marks: Talk, Tell, Buy. Each cycles through none, up and down, meaning how her line moved him, as the manager played him. Stored on the round as `marks: { talk, tell, buy }` with values −1, 0 or 1; saved with the run (the existing debounced save); `savePracticeRun` keeps only those three keys and those values.
- `scorecard.js`: a section "Your marks": per goal, how many of her replies were marked down on talk, tell and buy; and, once H1 is in, how often the reader's own read agreed with the manager's mark.

**Must hold:** `cd client && npx eslint src` is clean; a saved run reopens with its marks; the scorecard prints the new section on a run with marks.

---

## How to verify (in this order)

1. `node scripts/probes/round4-patterns.cjs` passes (68 lines).
2. `node scripts/check-communication.js` stays all PASS; add a line for each item above that can be checked offline (F1 to F5, G1 to G4, H2, H3).
3. `node scripts/simulate-dialogues.js`: zero flags, or each new flag explained in the commit message. For the first-sale dialogues, list every ask or offer that moved, with the reason.
4. `node scripts/replay-practice.js`: runs 8, 10 and 11. Run 11 must show: reply 3 acknowledges his name; reply 4 leads (no unearned feeling, no late name comment); reply 5 takes the claim down; no direct ask at 13 or 14; no offer at 15. Explain every other difference.
5. `node scripts/written-moments.js` (a few cents): add Bob's fifteen lines from run 11 as a moment and read the replies by eye, plus the live reader and coach calls named above.
6. `graphify update .` from the repository root; `cd client && npx eslint src` after H4.

## Commits

One commit per group, pushed after each (F, G, then H; H may be two commits, H1 and H2, then H3 and H4), with plain-language messages that say what changed and why, ending with the Co-Authored-By line your session uses. Add a "Round 4 (23 Oct)" section to `AI_CHAT_ENGINE_V2.md` and the patterns file to the check list in `AGENTS.md`. After each push, restart the local API on port 3001 so the manager tests the new code (see `.claude/launch.json`).

## Out of scope (do not drift into these)

- The stage lengths of A1 themselves (6, 3, 3): the manager's.
- Implicit sadness read by the model but overruled by the word list (`session.js`, `CONFIRMS`): a separate design.
- A summary of the older part of long practice chats (only the last forty messages reach the models).
- A whole-conversation benchmark and a short-prompt baseline experiment.
- Closeness from the spending tier, the seven-word target and the long writer prompt.
- Reply timing (the delays stay as they are).
