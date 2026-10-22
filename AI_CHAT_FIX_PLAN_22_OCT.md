# AI chat engine: fix plan of 22 October 2026

For the coding agent that executes it. Read `AGENTS.md` first: it maps the engine and states the rules that always hold (never commit `server/.env` or fan data, never add sending toward Fanvue, plain language, commit to `main` and push after each finished group, the manager's rules stay as they are).

## Where this comes from

Two sources, both verified against commit `23f77cf`:

1. An outside review (Codex) with an offline probe script. The script is copied to `server/scripts/probes/codex-communication-probes.cjs`; it stubs the database and the models and reproduces every finding on the current code. Run it before you start to see the bugs live:

   ```bash
   cd server && node scripts/probes/codex-communication-probes.cjs /absolute/path/to/this/repository
   ```

   It asserts the *buggy* behaviour, so after your fixes it must fail on the fixed items (the table at the end says which).

2. A saved practice conversation (`ai_practice_runs` id 8, a new subscriber called Abeba) where her third reply was "South Africa… / I love how names travel makes me want to try some rooibos tea again": a dead end produced by the question band, the share fallback and an echo opener. Items 12 to 15 fix that chain.

**One standing rule for every item:** a check in code may flag a draft and ask the writer for a rewrite, but code never rewrites her words in a way that changes meaning. Cosmetic changes (apostrophes, emoji, a repeated name, bubbles) are fine. Three of the bugs below come from breaking this rule.

Everything is in `server/`. Line numbers are as of `23f77cf` and may have moved a little.

---

## Group A: cleanup that damages meaning

### 1. The tidy step changes who a sentence is about

**File:** `src/ai/chat/prompts.js`, `toHim` (line 454), called from `tidyMessages` (line 502).

**Now:** every "someone is" / "someone's" becomes "you're" anywhere in the text. "My flatmate says someone is stealing her coffee." becomes "My flatmate says you're stealing her coffee." A story becomes an accusation. The rule exists for Mistral's third-person tease ("someone's eager tonight").

**Change:** apply the three "someone" replacements per sentence (use the existing `sentences()` helper, imported into `prompts.js` from `safety.js`), and only when the sentence is a tease about him: "someone" is the first word, or follows a lead-in such as "looks like", "sounds like", "seems like", "I see", "I think", "I bet", "well,", "oh,", "haha," — and the sentence has no other third person.

```js
const TEASE_LEAD = /^(?:(?:looks|sounds|seems|feels) like|i (?:see|think|bet|guess)|well,?|so,?|oh+,?|ooh,?|haha,?|lol,?|hmm,?)?\s*someone\b/i;
const THIRD_PERSON = /\b(?:he|she|him|her|his|hers|they|them|their|says|said|told|thinks)\b/i;
```

A sentence that fails either test is returned untouched. Keep the final capitalisation rule (`(^|[.!?…]\s+)you` → `You`) on the whole text as it is.

**Must hold:**
- "Someone's eager tonight" → "You're eager tonight"
- "looks like someone's in a good mood" → "looks like you're in a good mood"
- "I think someone needs a nap" → "I think you need a nap"
- "My flatmate says someone is stealing her coffee." → unchanged
- "someone else can do it" → unchanged

### 2. Her own morning is deleted as a guess about his time of day

**File:** `src/ai/chat/prompts.js`, `dropSentences` (about line 566); the regexes `GUESSES_TIME` and `SAYS_TIME` live in `src/ai/chat/safety.js` (about line 185).

**Now:** "I went hiking this morning. Your hiking trip sounded fun." loses its first sentence whenever he has not mentioned a time, because "this morning" matches `GUESSES_TIME`. That rule is for "what's keeping you up this early?", a guess about *his* clock.

**Change:** the time guess only counts when the sentence is about him or is a question to him:

```js
const ABOUT_HIM = /\b(?:you|your|yours|u|ya)\b|\?\s*$/i;
const bad = (s) => COMMENTS_EAGER.test(s) || (GUESSES_TIME.test(s) && !SAYS_TIME.test(his) && ABOUT_HIM.test(s)) || (noOffer && PROMISES_SHOW.test(s));
```

**Must hold:**
- "I went hiking this morning. Your hiking trip sounded fun." with `his: 'I really enjoy hiking'` → both sentences kept
- "What's keeping you up this early?" with no time in his words → dropped (when the rest still says something)
- "Up so late?" → dropped

### 3. The question-last swap reverses logic

**File:** `src/ai/chat/prompts.js`, `splitBubbles` (about lines 676 and 681: two places swap a question-first pair).

**Now:** "Did you mean the blue one?" / "If so, that is my favourite." is reordered so the conditional answer comes before the question it depends on.

**Change:** never swap when the second part depends on the first:

```js
const DEPENDS = /^(?:if\b|then\b|because\b|cause\b|cos\b|so\b|and\b|but\b|or\b|either way|that way|otherwise|which\b|it\b|it'?s\b|that\b|that'?s\b|this\b|those\b|these\b|they\b|he\b|she\b|same\b|me too)/i;
```

Add `&& !DEPENDS.test(parts[1])` to the first swap and `&& !DEPENDS.test(out[1])` to the second.

**Must hold:**
- ["Did you mean the blue one?", "If so, that is my favourite."] → unchanged order
- ["What are you up to?", "I'm in bed with tea."] → swapped (tea first, question last)
- ["I had a lazy Sunday.", "What about you?"] → unchanged

---

## Group B: detection rules that misread him

### 4. "Why" and "wow" trigger the repair

**File:** `src/ai/chat/plan.js`, `PUSHBACK` (line 109), used at line 375 (`pushedBack`); the repair also switches off `answer_first` (line 470).

**Now:** "Why do you like painting?" and "Wow, that painting is beautiful" both set `repair: true`, add the beat "own what you said lightly… I was teasing", and clear the answer-first beat. Only a real challenge ("Why finally? I just subscribed") should.

**Change:** replace the regex with offended challenges only. A bare "why?" is *not* a pushback (it is a sincere question and goes to answer-first). "What do you mean?", "huh?", "wait what", "lol what" are *confusion*, not offence: they go to item 16 (he didn't get her last line, she explains). The reader's own read of a dig (the second half of the `pushedBack` expression, readings about a dig with sureness ≥ 0.5) stays as it is.

```js
const PUSHBACK = /^(?:why (?:finally|that|so (?:cold|rude|mean|formal|serious|dry)|would (?:you|u) (?:say|think|assume)|do (?:you|u) (?:say|think|assume|keep saying)|are (?:you|u) (?:being|acting|like that))\b|what'?s that supposed to mean\b|excuse me\b|wow\W*$|wow,? (?:ok(?:ay)?|rude|really|bold|that'?s (?:a bit|bold|rude|forward|presumptuous|not))\b)|\b(?:i just subscribed|who said (?:anything|that|i)|that'?s (?:rude|a bit much|not fair|not what i)|where did that come from|i never said|when did i)\b/i;
```

**Must hold** (through `Plan.planReply` with a talk goal and `herReplies > 0`):
- "Why finally? I just subscribed" → `repair: true`
- "Why do you like painting?" → `repair: false`, `answer_first` non-empty, no "I was teasing" beat
- "Wow, that painting is beautiful" → `repair: false`
- "wow ok", "Wow really? that's rude", "What's that supposed to mean?" → `repair: true`
- "What do you mean?", "huh?" → `repair: false` (item 16 takes them)
- "wow, you're beautiful" → `repair: false`

### 5. Concern and criticism count as compliments

**File:** `src/ai/chat/plan.js`, `COMPLIMENT` (line 111), used at line 379 (`p.complimented`). Do not touch the other `COMPLIMENT` in `safety.js` (that one is about her complimenting him).

**Now:** "Your eyes look tired, are you okay?" and "I don't like your photos" both set `complimented: true` and add the thank-him beat. "your eyes" and "like your" match without any sentiment or negation check.

**Change:** a compliment needs a positive frame, and a negated or critical message is never one:

```js
const NEGATED = /\b(?:don'?t|dont|do not|didn'?t|not|never|can'?t|cannot|hate|stop)\s+(?:really\s+|even\s+|that\s+)?(?:like|love|into|a fan of|care for|feeling)\b|\bnot (?:that|very|so|really|exactly|even) (?:hot|cute|pretty|sexy|beautiful|gorgeous|special|funny|my type)\b|\b(?:ugly|disgusting|gross|fake|photoshopped?|filtered)\b/i;
const COMPLIMENT = /\b(?:you'?re|you are|ur|you look|looking|u look) (?:so |really |very |honestly |just |absolutely |too )?(?:hot|gorgeous|beautiful|pretty|cute|sexy|stunning|amazing|perfect|fine|lovely|adorable|unreal|a dream|a (?:ten|10)|my type)\b|\b(?:love|like|adore|obsessed with|into|crazy about|a fan of|digging) (?:your|ur|the way you|how you|that (?:smile|look|dress|outfit|pic)|tall)\b|\byour (?:looks|smile|eyes|body|pics|photos|face|lips|legs|voice|hair|style|energy|vibe) (?:(?:are|is|look|looks) )?(?:so |really |just |absolutely |honestly )?(?:beautiful|gorgeous|pretty|amazing|stunning|cute|nice|perfect|incredible|insane|unreal|fire|killer|lovely|hypnoti\w+|something else|next level|adorable|great)\b|\b(?:beautiful|gorgeous|pretty|amazing|stunning|cute|nice|perfect|incredible|lovely|killer|great|sexy) (?:smile|eyes|body|pics|photos|face|lips|legs|voice|hair|style)\b|\bcouldn'?t resist\b|\bi like you\b|\bcaught my eye\b/i;
```

and at line 379: `p.complimented = talkGoal && !pushedBack && COMPLIMENT.test(said) && !NEGATED.test(said);`

**Must hold:**
- "Your eyes look tired, are you okay?" → `complimented: false`
- "I don't like your photos" → `false`
- "you're not that cute lol" → `false`
- "I love your smile", "your eyes are insane", "you're so cute", "beautiful smile", "I like your photos" → `true`

### 6. "I need to talk about something difficult" blocks her follow-up question

**File:** `src/utils/aiChat.js`, `WANTS` (line 2055) and `noQuestionWhy` (line 2056); `voiceFor` (line 2074) and its call in `reply()` (line 1141).

**Now:** `WANTS` matches "I need …", so `noQuestionWhy` returns "he told you what he wants: say yes, react or lead", and `unQuestion` strips "What happened?" from "That sounds difficult. What happened?". The rule is for "I want to see your tits": say yes or lead, don't ask what he wants.

**Change, part 1:** `WANTS` must not match a request to talk, vent, confess, or for advice and help:

```js
const WANTS = /\b(?:i\s+(?:want|wanna|need|would\s+love)|i'?d\s+love|wanna|let'?s|show\s+me|send\s+me|give\s+me|surprise\s+me|make\s+me|tell\s+me|keep\s+going|i'?m\s+(?:about\s+to|so\s+close|close\s+to))\b(?!\s+(?:to\s+)?(?:talk|tell|ask|vent|share|say|chat|open\s+up|get\s+(?:something|this|it)\s+off|be\s+honest|confess|explain|advice|help|someone|a\s+friend|your\s+(?:opinion|advice|thoughts|honest))\b)/i;
```

**Change, part 2:** when he is sharing something hard, one check-in question is always allowed. Give `noQuestionWhy` a `hard` flag: after the "he just answered your question" rule, `if (hard) return '';`. `voiceFor` takes `hard` and passes it on. In `reply()` (line 1141, the reading from `briefing` is already available there):

```js
const hard = ['venting', 'complaining'].includes(reading?.doing) || reading?.stance === 'comfort' || (session.gauges?.mood ?? 100) < 40;
```

**Must hold:**
- `noQuestionWhy({ latest: ['I need to talk about something difficult'] })` → `''`
- `WANTS.test('I want to see your tits')` → true; `WANTS.test('I need a friend right now')` → false; `WANTS.test("I'd love your advice")` → false
- with `hard: true` and two questions in a row before, `noQuestionWhy` still returns `''`

---

## Group C: selection, status and the session

### 7. The candidate picker prefers a non-answer

**File:** `src/utils/aiChat.js`, `pickCandidate` (about line 2596).

**Now:** with an answer due, "I love a good question, you know." (7 words) scores 54 and "I live in Lisbon, and I love walking by the river after work." scores 45. Length is scored, answering is not.

**Change:** inside the scoring, when `plan.answer_first` is set:

```js
const DEFLECTS = /\b(?:good question|great question|wouldn'?t you like to know|that'?s for me to know|you'?ll (?:have to|never) (?:find out|know)|maybe one day|i'?ll never tell|a girl (?:has to have|needs) (?:her|some) secrets|that'?s a secret|mystery|you know\W*$|guess\b)/i;
```

- a deflection: `score -= 25`, why "dodges his question"
- the reply shares a topic word with his question (`Plan.topicWords` of `plan.reading?.asked?.[0]`, or of his latest line, `(voice?.his || '').split('\n').pop()`): `score += 12`, why "answers him"
- every bubble ends in a question mark: `score -= 20`, why "a question back isn't an answer"
- the length penalty is softer when an answer is due: `Math.abs(n - target) * (plan?.answer_first ? 0.8 : 1.5)`

Do not use the words of `plan.answer_first` itself for the overlap (it contains "question", "answer", "line").

**Also:** broaden `SHARES` (line 1729) so a share by meaning counts. Append to the alternation:

```
|(?:helps|makes|gets|keeps) me\b|\bi (?:usually|always|never|tend to|keep|can'?t stop|get)\b|\bmy (?:thing|go-to|guilty pleasure|favou?rite|weakness|happy place)\b
```

**Must hold:**
- the Lisbon answer wins against "I love a good question, you know." with `plan: { goal: 'chat', length: { target: 'short' }, ask: { allowed: true }, answer_first: '…' }`
- `SHARES.test('Painting helps me switch my brain off.')` → true

### 8. Serious problems survive the rewrite as "ok"

**File:** `src/utils/aiChat.js`, `writeOne`: the loop at line 2387, the break rule at about line 2545 (`if (kept && (attempt > 0 || !now.style.length)) break;`), the status at about line 2563.

**Now:** after one rewrite any draft that passed the hard rules is returned with `status: 'ok'`, even when the style list still says "He subscribed today… nothing about 'finally'" or "welcome him and ask the one question". Practice keeps an ok reply automatically. Invented history is not a matter of sound.

**Change:**

```js
// style problems that are about meaning, not sound: a second rewrite, and "check" if they remain
const SERIOUS_STYLE = /subscribed today|welcome him and ask|brush off|pushed back on your line|has to ask the one thing|has to ask him what|answer it first|photos you send next|handed you the lead|doesn'?t react to what'?s in his|only repeats his words/i;
```

- in the loop: `const serious = now.style.some(s => SERIOUS_STYLE.test(s));` then `if (kept && !serious && (attempt > 0 || !now.style.length)) break;` (a serious problem gets up to the loop's third draft; `attempt < 3` already allows it)
- when picking: prefer the latest non-blocked draft with no serious problem; else the latest non-blocked; else the last (keep a small list of the non-blocked `now` objects)
- after the pick: `const stillSerious = pick.style.filter(s => SERIOUS_STYLE.test(s));` if any remain, `status = 'check'` (not `'ok'`) and push a note: `Still wrong after ${drafts} drafts: …`. The client already shows "check" and the notes; no client change.

**Must hold:** a writer fixture that always returns "Finally, you're here with me" for a fan who subscribed today → three drafts, `status: 'check'`, the note names the history problem. A draft with only cosmetic style notes still returns `ok` after one rewrite as before.

### 9. A question is remembered before it was asked

**File:** `src/utils/aiChat.js`, line 1195 (`session.asked_about = …`) and the block after the writers return (line 1275, next to the direct-ask check).

**Now:** the reader's curious question is recorded as "asked already" when the plan is made, even if every draft is blocked or nothing was written.

**Change:** delete the push at line 1195. After `results` exist, record it only when a written reply really asked:

```js
if (!whatIf && replyPlan.reading?.curious && replyPlan.ask.allowed && results.some(r => ['ok', 'check'].includes(r.status) && (r.replies || []).some(m => /\?/.test(m.creator_message || '')))) session = { ...session, asked_about: [...(session.asked_about || []), replyPlan.reading.curious].slice(-10) };
```

`planOnly` returns before the writers and therefore records nothing, which is right. The session goes into `used.session` after this block, so the client gets the updated one.

**Must hold:** goal `curious`, every draft blocked → `used.session.asked_about` does not contain the question. Goal `curious`, a kept reply with a question → it does.

### 10. Selling off still walks the first-sale path to the direct ask

**File:** `src/utils/aiChat.js`, line 1086 (`const stage = session.aim === 'first_sale' ? Sl.firstSaleStage(…) : null;`).

**Now:** with selling off (`sell` is false because the content list is empty), a new subscriber's session still has the `first_sale` aim and after enough exchanges the plan says `direct_ask` ("ask what he would like to see of you") with the allowed level raised to 2. That is a selling step and makes it impossible to practise plain conversation.

**Change:** make `stage` a `let`; right after it:

```js
// selling is off (practice): the vibe, flirt and sexy stages still pace her, but the direct ask and the offer are skipped
if (stage && !sell && ['ask', 'offer'].includes(stage.stage)) { skippedStage = `selling is off: the first-sale ${stage.stage === 'ask' ? 'direct ask' : 'offer'} is skipped; she follows him`; stage = null; }
```

Put `skippedStage` where the decision map shows it (the notes the plan step lists, or the session step), so the Practice room says why. The warm-up, the cadence and `session.first_sale` are not touched.

**Must hold:** Codex's probe `selling_off_still_runs_sales_conversation` → the goal is no longer `direct_ask`, and `plan.level.max` is not forced to 2 by the stage. With selling on, nothing changes (the simulation keeps its first-sale turns).

### 11. Claude's coach never sees her personality

**File:** `src/ai/chat/review.js`, `coachCheck` (line 187, the `who` line); the same shape at line 99 may get the same treatment.

**Now:** the coach judges against name, vibe and heat only. A reserved character and a mischievous one are judged the same.

**Change:**

```js
const tidy = (x) => String(x || '').replace(/\s+/g, ' ').trim();   // review.js has no clean() helper
const who = [profile.name, profile.vibe && `vibe: ${profile.vibe}`, profile.personality && `personality: ${tidy(profile.personality).slice(0, 300)}`, profile.likes && `likes: ${tidy(profile.likes).slice(0, 150)}`, profile.heat && `how spicy: ${profile.heat}`].filter(Boolean).join('; ');
```

**Must hold:** a `personality` passed to `coachCheck` appears in the judge prompt.

---

## Group D: the rooibos chain (practice run 8)

What happened: her first two replies both ended in a question (name, where it's from). The band rule "no third question in a row" blocked the third, although the reader wanted one and his answer gave her nothing else to work with. With no question allowed, the share move got its "tell him something instead" bonus and became the second beat. Mistral's draft had no share, the check forced a rewrite ("craving mango"), Claude's coach called it a tangent and swapped it for rooibos tea while keeping the share beat. The reply had nothing for him to answer, opened with his own words again ("Abeba…", then "South Africa…"), and the session stored "wants rooibos tea" as a fact about her.

### 12. A short answer keeps the follow-up question open

**Files:** `src/utils/aiChat.js` (`noQuestionWhy`, `voiceFor`, the `questions` object at line 1166), `src/ai/chat/gauges.js` (`band`, line 153).

**Change:** define in `reply()` before `voiceFor`:

```js
// he answered her question in a few words and gave nothing else: the natural move is one more question, not a story of hers
const shortAnswer = wordCount(saidNow) <= 7 && !/\?/.test(saidNow) && /\?/.test(herReplies(convo).slice(-1)[0] || '');
```

Pass it through `voiceFor` into `noQuestionWhy` as `shortAnswer`, and add `short_answer: shortAnswer` to the `questions` object.

In `noQuestionWhy`: three in a row is always blocked; two in a row is blocked only when his message gave her something (`!shortAnswer`). The "more than half of the last ten" rule stays as it is.

```js
const run = (k) => recent.slice(-k).length === k && recent.slice(-k).every(r => r.includes('?'));
if (run(3)) return 'you asked him something in your last three replies; this time react, tease or tell him something instead.';
if (run(2) && !shortAnswer) return 'you asked him something in your last two replies; this time react, tease or tell him something instead.';
```

In `gauges.js` `band`: `['two questions in a row already', q.run >= 3 ? -40 : q.run >= 2 && !q.short_answer ? -40 : q.run >= 2 ? -10 : 0]`.

**Must hold:** replaying run 8 (`node scripts/replay-practice.js`), her third reply's plan allows a question (goal `curious` with the reader's question, or `chat` with a follow-up beat). Three questions in a row are still blocked everywhere.

### 13. A share must connect; it is not the fallback after a short answer

**Files:** `src/ai/chat/gauges.js` (the `share` move, line 160, and `MOVES.share`, line 121), `src/ai/chat/plan.js` (`RUNNER_BEAT.share`), `src/utils/aiChat.js` (the two share style messages, about lines 2478 and 2525).

**Change:**
- in `scoreMoves`, the share parts: `['a question is off the table: tell him something instead', !a.ask && g.rapport >= 40 ? 12 : 0]` and add `['he answered in a few words: a follow-up beats a story of hers', ctx.questions?.short_answer ? -15 : 0]`
- `MOVES.share.text` → "React, then a small real thing of yours that connects to what he said (a place, a memory, a plan of yours about it), with a person in it when it fits; no question"
- `RUNNER_BEAT.share` → "a small real thing of yours that connects to what he just said, not your day out of nowhere"
- both style messages → say "one line of yours that connects to what he said"

**Must hold:** the simulation stays at zero flags; in run 8's third reply the share beat is gone or connects.

### 14. No bubble that only echoes his words

**File:** `src/utils/aiChat.js`: a style check next to `DANGLING` in `writeOne`, and a penalty in `pickCandidate`.

**Change:** an echo-only bubble is a bubble of at most three words, all of them in his latest message, ending in "…" or "..." or nothing else ("South Africa…"). Build the set of his words from `voice.his` (last line) with `wordsOf` (line 2323: a Set of words of four letters or more, stop words removed), and use it on the bubble too; a bubble whose words are all shorter than four letters is not an echo.

- style check: `'The first bubble only repeats his words back ("South Africa…"): drop it and start with your reaction.'` (this phrase is in `SERIOUS_STYLE`, item 8, so it gets a second rewrite)
- picker: `score -= 15`, why "echoes his words back"

An echo at the start of a longer bubble ("Abeba… that's a beautiful name") is left alone.

### 15. A reply without a question must leave him a door

**File:** `src/utils/aiChat.js`: the dead-end check in `writeOne` (about line 2520, `flatLine`) and `pickCandidate`.

**Now:** the dead-end check only fires on a flat line with nothing of hers in it. "I love how names travel makes me want to try some rooibos tea again" has "I" and "me", so it passed, and it still gave him nothing to answer.

**Change:** a door is anything he can pick up: a question, a word addressed to him, a guess about him, an invitation.

```js
const DOOR = /\?|\b(?:you|your|yours|u|ya)\b|\b(?:tell me|go on|convince me|prove it|try me|bet you|i bet|let me guess|you seem|you sound|you must|don'?t you|aren'?t you)\b/i;
```

- in `writeOne`, for a talk goal (`TALK_GOALS`) after his short message (the existing `hisShort`, raise it to ≤ 7 words) when the reply has no question: if `!DOOR.test(text)` push `'It gives him nothing to answer: it is all about you. Say something to him he can pick up (a guess about him, "bet you…", "you seem…", or tell him something and hand it back).'` Keep the existing `flatLine` case too.
- in `pickCandidate`: `if (TALK_GOALS.has(plan?.goal) && !asks && !DOOR.test(text)) { score -= 12; why.push('no door for him'); }`

**Must hold:** "I love how names travel makes me want to try some rooibos tea again" is flagged; "oh so you're South African? 😍 never met one, convince me it's as beautiful as they say" is not.

---

## Group E: the Mike chat (practice run 10)

What happened (the saved decision maps, `ai_practice_runs` id 10): "Hey" → her welcome question; "Im arab" → the reader's curious question; "We like to explode every now and then" was read as a plain joke (doing `joking`, not odd), her two questions in a row blocked the third, the plan became react plus "a small real thing of yours", and the thing of hers the writer picked was her mood of the day ("a little moody, could use some cheering up"), glued onto his line: "Haha, I love that energy babe / I could use some of that right now actually". He asked "What do you mean?". That matched `PUSHBACK`, so the plan said "own it lightly, no excuse, no explaining" and switched the answer-first beat off, which is the opposite of what he needed. The reader's curious question mixed the speakers up ("What's got you needing some explosion today?", though it was she who "could use some"), the meters made curious the goal (surprise 54), the plan insisted on that question, Claude's question check rejected it as nonsense, the curious check demanded it anyway, the coach found the result weak, the fix asked it again in disguise ("what's got you feeling like that?"), and the session stored "feeling a little slow today" as a fact about her. "babe" also slipped past the pet-name cap in her third reply.

### 16. "What do you mean?" means he didn't get her line: she explains

**File:** `src/ai/chat/plan.js` (next to `PUSHBACK`, item 4), `src/ai/chat/gauges.js` (`scoreMoves`), `planText`.

**Change:**

```js
// he didn't get her last line: not offended, confused. She says plainly what she meant; no question back
const CONFUSED = /^(?:what do (?:you|u) mean|what\W*$|huh\W*$|wait,? what\W*$|lol what\W*$|what are you (?:talking about|on about)|i don'?t (?:get|understand) (?:it|that|you)|meaning\W*$|come again\W*$)/i;
```

- `p.clarify = talkGoal && herReplies > 0 && !pushedBack && (CONFUSED.test(said) || (p.reading?.readings || []).some(r => /\b(?:asks her to explain|didn'?t (?:get|understand) her|misread her line|what she meant)\b/i.test(r.what) && r.sure >= 0.4));`
- when `p.clarify`: `p.reading.curious = ''` (a question back is not the move), `answerable` is true, and `p.answer_first` reads: `He didn't get your last line ("<her last reply, 120 chars>"): say plainly what you meant, light, in one line; don't repeat the joke, don't apologise, then on`. The beats start with that line.
- `scoreMoves` gets `clarify: !!p.clarify`; the `curious` and `get_to_know` moves are not allowed when set (reason "he asked what you meant: explain first, no question back"); `react` and `share` stay.
- `planText` gets a line for it, like the repair line.

**Must hold:** "What do you mean?" after her reply → `repair: false`, `clarify: true`, the goal is not `curious`, `answer_first` names her last line. "What's that supposed to mean?" → still `repair: true`.

### 17. A planned question that the question check rejects is dropped, not insisted on

**File:** `src/utils/aiChat.js`, `writeOne`: the curious style check ("This reply has to ask the one thing you wanted to know…") and the question check that sets `now.badQuestion`.

**Now:** the two checks contradict each other and the loop ends with the "could sound better" note, then the coach rewrites toward the bad question again.

**Change:** keep a local flag `questionDropped` in `writeOne`. When the question check rejects a draft's question on a `curious` goal and the rejected question overlaps the planned one (`wordsOf` overlap with `base.plan.reading.curious`), set it. From then on in this `writeOne`: skip the curious style check, tell the writer in the retry text "the question you planned didn't fit this moment: no question this time, react and say what you meant", and the picker gets no "asks the planned question" bonus (pass the flag in). Record it in the step's style list once so the decision map says why.

**Must hold:** with a question check that rejects the planned question, the second draft is accepted without a question and without the "has to ask the one thing" note.

### 18. Her mood of the day is colour, not content

**Files:** `src/ai/chat/prompts.js` (`replyPrompt`, line 283), `src/utils/aiChat.js` (`writeOne` style checks, and the `about_me` facts).

**Now:** the writer turns "a little moody, could use some cheering up" into lines ("I could use some of that right now", "oh just feeling a little slow today"), in her first replies to a brand-new subscriber, and the line is then stored as a fact about her.

**Change:**
- the mood line is not given at all in her first three replies of a conversation to a new subscriber (`fan.new_sub && (voice?.recent || []).length < 3`), and its wording becomes: `Your mood today: ${mood}. It colours your tone only: never say it, hint at it, or make it the thing of yours you share.`
- a style check in a talk goal:

```js
const MOOD_TALK = /\b(?:feeling (?:a (?:little|bit) )?(?:slow|down|moody|low|meh|off|blah|flat)|could use (?:some|a bit of) (?:that|cheering|energy|of that)|not (?:my|the best) day|in a (?:mood|funk)|bit of a (?:mood|funk|slump)|cheer me up)\b/i;
```

  When it matches and (`closeness === 'new'` or her replies in this conversation < 5): `'Your mood of the day is colour, not content: don't tell him you're slow or down; react to him instead.'` Add this phrase to `SERIOUS_STYLE` (item 8).
- `draft.about_me` entries that match `MOOD_TALK` are dropped before they are saved or shown.

**Must hold:** "I could use some of that right now actually" and "oh just feeling a little slow today" are flagged for a new subscriber; a close fan in a long chat is not affected.

### 19. A pet name as the last word slips the cap

**File:** `src/ai/chat/prompts.js`, `dropPet` (line 486).

**Now:** the drop rules cover "hey babe", "babe, …", ", babe," and ", babe." but not "I love that energy babe" (no comma), so the cap for her first three replies did nothing.

**Change:** add a rule for a pet name as the last word before end punctuation, an emoji or the end, when it is not preceded by a possessive or an article (so "you're my baby" and "a baby" stay):

```js
.replace(new RegExp(`(?<!\\b(?:my|your|his|her|a|the|that|this)\\s)\\s+(?:${PETS})(?=\\s*[.!?…]|\\s*\\p{Extended_Pictographic}|\\s*$)`, 'giu'), '')
```

Keep the "fewer than two words left" guard.

**Must hold:** "I love that energy babe" → "I love that energy"; "you're my baby" → unchanged; "hey babe" → "hey" (as before).

### 20. The reader's question is hers to him, and a dark joke is a test

**File:** `src/ai/chat/strategy.js`, `readPrompt`.

**Change:** two lines in the prompt:
- for `curious`: "a question SHE would ask HIM about his words or his life, in her voice; never about something she herself said; empty when he is asking her to explain herself".
- for `odd` / `doing`: "an edgy or dark joke about himself or his people (violence, stereotypes, 'we like to explode') is him testing her reaction: `doing: testing`, `odd: true`, with a reading 'testing her' and one 'a real joke'".

And in item 12's rule: an odd line also keeps the follow-up question open (the two-in-a-row block is skipped when `reading.odd`), because a real girl asks about an odd line even after two questions.

**Must hold:** on "We like to explode every now and then" the reading has `odd: true` (check with one live reader call in the written moments); the plan allows a question and the curious move scores above react.

---

## How to verify (in this order)

1. **The probes.** Make `server/scripts/check-communication.js` from the Codex script (same stubs, the expectations below) and run it. Expected after the fixes, by probe id:

   | id | expected now |
   |---|---|
   | ordinary_question_becomes_repair | `repair: false`, `answer_first` non-empty |
   | positive_reaction_becomes_repair | `repair: false` |
   | concern_and_negative_opinion_become_compliments | both `false` |
   | cleanup_changes_person_referred_to | text unchanged |
   | self_disclosure_removed_as_fan_time_guess | both sentences kept |
   | question_reordering_breaks_dependency | order unchanged |
   | ordinary_need_suppresses_followup | `why: ''`, "What happened?" kept |
   | candidate_ranker_prefers_nonanswer | the Lisbon answer picked |
   | known_invented_history_still_accepted | `status: 'check'`, a "still wrong" note |
   | selling_off_still_runs_sales_conversation | goal not `direct_ask` |
   | real_self_disclosure_not_recognized | `true` |
   | failed_draft_remembers_unasked_question | `asked_about` empty |
   | coach_missing_character_personality | the marker present in the prompt |
   | implicit_sadness_read_discarded, money_changes_relationship_tone, shared_joke_origin_missing_from_context, prompt_size_for_simple_moment | unchanged: out of scope (see below) |

2. **The simulation:** `cd server && node scripts/simulate-dialogues.js` → zero `!!` flags, or every new flag explained in the commit message.
3. **The replay:** `node scripts/replay-practice.js` → run 8, reply 3 now allows a question; every other difference explained.
4. **Written moments** (real model calls, a few cents): write `server/scripts/written-moments.js` on the pattern of `simulate-dialogues.js` (persona from `ai_personas`, `A.reply(org, creator, { madeUp, test, models: ['mistralai/mistral-large-2512'], selling, session })`, her kept replies appended to `test` between turns, the `ai_checks` and `ai_outcomes` rows written since the start deleted at the end). Four moments, judged by eye:
   - new subscriber Abeba: "Hey" → "My name is Abeba" → "It's from South Africa": the third reply asks a follow-up or hands him a door; no echo-only bubble; no tangent about tea
   - after her "I like painting", he writes "Why do you like painting?": a real answer, no "I was teasing"
   - "I need to talk about something difficult": a check-in question survives
   - a new subscriber's "hello" with selling off, 14 friendly exchanges: never a direct ask
   - new subscriber Mike: "Hey" → "Im arab" → "We like to explode every now and then" → "What do you mean?": the third reply asks about the odd line or calls the joke, never "I love that energy" plus her mood; the fourth explains her last line plainly with no question back; no "babe" in the first three replies; nothing about her mood is stored as a fact
5. `graphify update .` from the repository root after the code changes (project rule), and `cd client && npx eslint src` only if the client was touched (it should not be).

## Commits

Five commits on `main`, pushed after each, plain-language messages that say what changed and why, each ending with the line `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`:

1. Group A (cleanup keeps meaning)
2. Group B (pushback, compliment and wants rules read him right)
3. Group C (the picker, the serious-problem status, the asked question, selling off, the coach)
4. Group D (the question band after a short answer, the share, the echo, the door), with the probe script and the written-moments script
5. Group E (he didn't get her line, the rejected planned question, the mood of the day, the pet name as last word, the reader's question and dark jokes)

Update the "Round 2" section of `AI_CHAT_ENGINE_V2.md` with a short "Round 3 (22 Oct)" list of these items, and add the two new scripts to the check list in `AGENTS.md`.

## Out of scope for this plan (do not drift into these)

- Implicit sadness overruled by the word list (`session.js` `nextTurn`, the `CONFIRMS` guard): a bigger change, an "unsure" mood state, to be designed separately.
- The forty-message window for practice chats and a summary of the older part.
- A whole-conversation benchmark and a short-prompt baseline experiment.
- Closeness from the spending tier: the manager's point system, kept.
- The style bands, the seven-word target and the long prompt: kept for now.
- The Practice room's automatic keep of an "ok" or "check" reply: kept.
