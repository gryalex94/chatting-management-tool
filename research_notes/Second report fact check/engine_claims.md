# Fact check: the second report's claims about our engine (21 Oct 2026)

Report checked: `~/Documents/Codex/2026-10-21/while-the-model-is-rebuilding-the/outputs/fanvue-conversation-research.md`
(section 3 table, plus engine statements in sections 5, 6, 8, 10).

The report judged a picture of the engine (the HTML decision map dated 20 Oct), not the code. I checked the code as it
stands: the last commit (`HEAD` = 68824d2) and the uncommitted changes another session is making (engine v2 steps 2–3:
the Claude reader `strategy.readPrompt`, the meters `gauges.js`, the "soft slot" in `plan.js`). Where the two differ I
say so. Everything below runs in Practice only. Nothing is sent to Fanvue yet.

**Node IDs:** the report's node IDs don't match the current map (`analysis-data/yuna-chat-engine.html`, regenerated
21 Oct). Today `g11` is "Is he leaving?" and `g17`/`g18` are "honest no"/"offer it". So I matched each claim by what it
says, not by its ID.

## Score

| Verdict | Count | Claims |
|---|---|---|
| Still true | 10 | reader failure → chatty/friendly; first-yes goal ladder (in the committed code); freebie before sad/annoyed; one global callback cooldown; hourly notes (30 min quiet, 25 fans max); newest note wins plus the "wait, I thought…" check; spending raises closeness; code cuts sentences and turns questions into statements; marks matched by shared words plus the same goal; length buckets and no one-word replies |
| Partly true | 5 | reader labels too thin; unopened PPV → "point to it"; talk budget → steer to a sale or wind down; callbacks picked by chance; "Ministral 8B" not an exact model ID |
| No longer true | 2 | her self-facts not shared across fans (the diary plus auto-promotion now exist); Claude's check is watch-only (weak replies now get one rewrite) |
| Never true | 0 | (but the node IDs are mismatched, see above) |

## Claim by claim

### 1. The reader only gives situations, sexual level, mood, slowing down and contradictions (`m_read`–`m_clash`)
**Partly true.**
- Committed code: yes, that's all. `strategy.pickPrompt`, server/src/ai/chat/strategy.js:58-71 (HEAD).
- It reads both sides of the chat in turn ("Him:" / "You:"), the last 10 messages (strategy.js:6-9, 25). So the report's "confirm the reader sees both sides" is already the case.
- Uncommitted: a new Claude Haiku reader (`readPrompt`, strategy.js:256-283) adds what he is doing, what's new, up to 3 possible readings each with how sure it is, what she'd want to ask, a stance, and an "odd" flag. `plan.js:173` and `plan.js:466-469` pass these to the writer ("You're not sure what he means… don't assume").
- Still missing: no list of open questions or promises, and no tracking of what "it" or "that" refers to. The one thing close to an obligation is a word-pattern rule: "he asked something directly → answer it first" (`DIRECT_Q` plan.js:51, `answer_first` plan.js:378-379, checked again in aiChat.js:2400ish).
- **Worth it?** Partly, yes. Adding "his open question(s)" to the new reader costs nothing extra. It would replace the regex-only `answer_first` with something sturdier.

### 2. If the reader fails, it assumes friendly/chatty (`m_fail`)
**Still true.**
- aiChat.js `pickSituations`: when every attempt fails it returns `strategy.readMood(null)` (aiChat.js:2309 in the working copy). `readMood` turns a missing answer into level 0 and mood `chatty` (strategy.js:151-154).
- Now there are more attempts before that happens: in the working copy, Claude is tried twice, then Ministral, and OpenRouter falls back to Euryale 70B or Cydonia 24B (openrouter.js:31-32).
- Some damage is limited because code checks his own words afterwards: `SEXUAL_INTENT` lifts the level (aiChat.js ~1060), and heavy moods need confirming words (session.js:296-299).
- New small bug in the uncommitted trace: when the reader fails completely, `reader` is null and the decision map still labels the step "Planner (Ministral 8B)" (trace.js:122). So a failed read looks like a normal one.
- **Worth it?** Yes, and it's cheap. Mark the read as "unknown" and show it in the map. On an unknown read, use a cautious goal: no mood-based goals and no selling.

### 3. The goal is the first condition that comes true, in a fixed order (`g1`–`g20`)
**Still true in the committed code. Partly addressed in the uncommitted work.**
- The ladder is in plan.js:201-265 (about 40 goals, top to bottom, first match wins).
- Uncommitted "soft slot" (plan.js:267-291, gauges.js:117-130): when the ladder lands on a "talk" goal (`chat`, `get_to_know`, `flirt`, `sexy_vibe`, `tease`, `steer_to_sale`, `readiness_check`, `curious`), every possible move is scored on 7 meters. Another move wins only if it scores at least 8 points more. The hard goals above stay fixed.
- **Worth it?** This is already the report's suggestion, half built. Finish it and replay the test chats before adding anything new.

### 4. An unopened PPV plus a new message from him → "point to the PPV" (`g11` in the report)
**Partly true.**
- `point_to_ppv`, plan.js:235: fires when her PPV is unopened and he has written since (`waiting.hisAfter`), at most once per conversation (`!session.pointed`; set at aiChat.js ~1189).
- Goals that come before it in the ladder: goodbye, dry fan, slowing down, sad, suspicious, annoyed, and "asks what's in it" (plan.js:221-234).
- Since 502d4b5 (21 Oct 13:52), a direct question still gets "answer it plainly first", because `point_to_ppv` is not excluded from `answer_first` (plan.js:378). The report's music example would come out as "answers about music, then points to the PPV".
- Still true: an unrelated new topic ("anyway, how was your day") gets a PPV nudge, and the plan forbids her asking any question in that reply (plan.js:372).
- **Worth it?** Yes, small. Make it a passing touch only when his message has no new topic or question, or let the new reader's `doing` value decide. A few lines of code.

### 5. Using up the talk budget → steer to a sale or wind down (`g17`, `g18` in the report)
**Partly true. Mostly fixed since the snapshot.**
- Budget: BUDGET plan.js:47. It counts her non-sexual messages since his last purchase (plan.js:96-105). Sexting doesn't count.
- Since 1f8c8a7 (21 Oct 12:17), steering and winding down are off on rapport, win-back, get-to-know, read and first-sale days (`noSteer`, plan.js:168). They only happen on a planned `sell` day or for a time waster (`short`) (plan.js:261-263).
- A steer with nothing it's allowed to offer becomes a wind-down (plan.js:310).
- Uncommitted: `steer_to_sale` is a soft goal, so the meters can replace it with a better move (gauges.js:130).
- Still true: on a sell day, message number N can cut into a good exchange with "she has to go soon" (`wind_down` isn't a soft goal).
- **Worth it?** Low. Maybe make `wind_down` soft too, or skip it while engagement is high.

### 6. Freebie handling comes before sadness and annoyance (`g2`, `g7`, `g9`)
**Still true.**
- `no_freebies` is at plan.js:204. `comfort` (sad) is at plan.js:231 and `calm` (annoyed) at plan.js:233. `after_buy` (216), `cheaper` (218) and `why_not` (219) also come before comfort.
- The case the report warns about really happens. `FREE_ASK` matches "no money" and "broke" (plan.js:52). A non-buyer who says that is labelled a time waster (plan.js:81-82). So "I'm broke, I lost my job" → `no_freebies` beats `comfort`.
- (The session separately switches to a rapport day and turns selling off on `BROKE`, session.js:316-320, but the goal ladder still picks "no freebies".)
- **Worth it?** Yes, very cheap. Remove "no money"/"broke" from `FREE_ASK`, or let `comfort` win when sad words are present (session.js `CONFIRMS.sad`).

### 7. Callbacks are blocked for every note once any note came up recently (`r_cb`)
**Still true.**
- `callbackFor`, memory.js:163-165: if *any* talkable note was mentioned in her messages of the last 3 days or in this conversation (aiChat.js:1152-1155), no callback at all. A just-passed interview gets blocked because the dog came up yesterday.
- **Worth it?** Yes, cheap. Block only the note that was mentioned. Let a plan that just happened ("how did the interview go?") through anyway.

### 8. Some callbacks are picked by chance (`r_pick`, `r_pick2`)
**Partly true.**
- Plans are picked by rule, not chance: a plan that happened in the last 14 days comes first, then one due in the next day (memory.js:166-170).
- Chance is used only among "life" notes, after narrowing to topic-like notes (`TOPIC` regex) (memory.js:171-176).
- The welcome-back opener is also picked by chance: callback, pick up where they left off, or a fresh opener (plan.js:254-255).
- **Worth it?** Low to medium. Prefer life notes that share words with the current topic, and use chance only to break ties.

### 9. Notes update hourly, after 30 minutes of quiet, at most 25 fans an hour (`a_hr`, `a_30`, `a_25`)
**Still true.**
- `refreshMemories({ max = 25 })`, aiChat.js:625-660. Quiet for 30 minutes (633). Fans who wrote in the last 7 days. The longest-waiting go first. It's called from the hourly Fanvue copy (fanvueSync.js:278).
- Less important than it sounds: the writer always reads the raw recent messages, so a correction made in the current chat is in front of it. What lags is the *notes*, which drive callbacks, contradiction checks and closeness.
- **Worth it?** Not now (Practice only). Revisit before live sending, with a small per-conversation state that updates after every accepted reply.

### 10. The newest note wins; a contradicted note can trigger a check (`a_chg`, `v_c1o`)
**Still true.**
- Notes: "keep only the new version" (prompts.js:340). Each note keeps a `said_at` date (`sourced`, aiChat.js ~545). It doesn't keep which message it came from, and there's no "only true this week" period.
- Check: the reader flags a contradicted note (strategy.js:70 HEAD; working copy 108). The plan asks lightly, "wait, I thought you said…", only in calm goals (plan.js:367-368, 478). It says "believe what he says now".
- Nothing stops the reader flagging his own clear correction ("no, Max is my brother"), so she could challenge a correction.
- **Worth it?** Yes for the check, cheap: one prompt line ("a correction he makes himself is not a contradiction: accept it") and skip the check when his message starts with "no,". Validity periods on notes: low priority.

### 11. Spending adds to closeness (`w_c4`, `w_sum`)
**Still true.**
- memory.js:108: whale or spender +2, small buyer +1. Closeness sets her tone (plan.js:412) and lets close fans get light flirting in small talk (plan.js:400-403).
- **Worth it?** Optional. This came from the agency's answer to Q16. A big spender who is cold to her still can't reach "girlfriend" (memory.js:121). If changed, cap spending at +1.

### 12. Her self-facts stay in each fan's notes; nothing is shared globally yet
**No longer true.** Two features changed this.
- The diary (B9, commit 4179935, 21 Oct 01:18): every "her" note from every fan is gathered, de-duplicated and put in every writer prompt as "What you've told fans about yourself" (aiChat.js:1646-1683; prompts.js:227-228).
- Auto-promotion (3ffd481, 21 Oct 12:29): a fact she told 3 or more fans is added to her profile by itself (`promoteFacts`, aiChat.js:663-678, run after each hourly notes job). The manager can remove it afterwards and switch diary facts off.
- So the report's opposite warning now applies: "don't automatically promote a writer's improvised biography into global truth". That is what happens at 3 fans.
- **Worth it?** Yes, small. Make promotion a suggestion the manager approves, instead of automatic.

### 13. Code removes words and sentences and turns questions into statements (`c_tidy`, `c_drop`, `c_qo`)
**Still true.**
- `tidyMessages` (prompts.js:483), `dropSentences` (prompts.js:560-566, which only acts if at least 3 words remain), `unQuestion` (prompts.js:531-557). Called at aiChat.js:2363-2370.
- The report's fix ("validate the final transformed text") is already done. `checkReply`/`voiceProblems` run on the text *after* tidying (aiChat.js:2375-2378). Claude's check also sees the final text.
- **Worth it?** Low. One check worth adding: if `unQuestion` deleted his answer to a direct question, rewrite the reply instead.

### 14. Claude's quality check only watches (`c_coach`)
**No longer true (since adb418b, 21 Oct 12:41).**
- A reply Claude rates weak, or one that fails "answers him" when he asked something, gets one rewrite. Claude writes notes on what's wrong (never the words) and Mistral rewrites it. Then it's checked again (aiChat.js:1278-1293).
- Not done in selling moments (`SELL_GOALS`, fix 9). It never blocks: a still-weak rewrite is delivered.
- The comment at aiChat.js:1264 still says "never blocks or rewrites". That comment is out of date.
- **Worth it?** What the report proposes is mostly there. For live sending later, decide whether "still weak after the rewrite" should go to a person.

### 15. Manager marks are matched by shared words plus the same goal (`v_m1`)
**Still true.**
- `lessonsFor`, aiChat.js:1432-1441: 2 points per word shared with his message (4 at most) + 3 points for the same goal. A score of 3 or more fits. At most 3 of each kind.
- Marks also turn into drafted rules (`draftRules`, C2) that apply everywhere once approved.
- **Worth it?** Low for now: few marks. Revisit when there are hundreds, and match by problem type plus goal.

### 16. Length follows word-count buckets; never a bare one-word reply (`u_l4`/`u_l6`)
**Still true.**
- plan.js:386-394: he wrote 6 words or fewer → short (5–15 words, "not a bare one-word reply"); 7–25 → medium; more → long. Code only enforces upper and lower bounds loosely (safety.js:236-238).
- **Worth it?** No. This was the agency's own answer (Q4) and the user's feedback. Leave it.

### 17. "Ministral 8B" doesn't say which model actually runs (section 8)
**Partly true.**
- The code pins an exact ID: `mistralai/ministral-8b-2512` (aiChat.js:40; openrouter.js:21). The model OpenRouter actually served is logged on every call in `ai_usage.model` (aiChat.js:79-85, using `data.model`, openrouter.js:106).
- But the fallbacks mean the "planner" can silently be Euryale 70B or Cydonia 24B (openrouter.js:31-32 via `backupsFor`, aiChat.js ~2321). The decision map would still say "Ministral 8B" (trace.js:122).
- Uncommitted: the reader becomes `claude-haiku-5-5` (aiChat.js:42), with Ministral as the fallback.
- Prompt versions are not logged.
- **Worth it?** Cheap: show the actually-served model in the decision map instead of a fixed label.

### Other engine remarks in the report
- "The 19-message contradiction test doesn't prove accuracy": fair. Not a code claim.
- Section 8 on Anthropic's policy is worth noting. The uncommitted Claude reader reads the last 12 messages including sexting (strategy.js:265), and the coach reads the chat. The labelling of the 35k (Claude Sonnet 4.6) and of the examples (Haiku 5.5) also sent sexual chats to Claude. I didn't check the policy text myself.

## Where the "35k chats" and the example library came from

**Not from Fanvue. They come from the agency's OnlyFans pages, through Infloww exports.**
- Raw source: the `messages` table, filled by uploading Infloww "Message Dashboard" xlsx exports (server/src/parsers/messageDashboard.js). There's no API: Infloww's API has no message endpoint (memory note `infloww-api-v1-4`).
- Database check (read-only, 21 Oct): `messages` = 277,380 rows, **all from OnlyFans creators** (24 OnlyFans pages; the single Fanvue creator has none), 20 May – 20 Oct 2026.
- The analysis scripts all read `messages`: analysis-data/chat-analysis-2026-10/roadmap-build.js, discover-build.js; examples-2026-10/1-moments.js, 4-selling-moments.js; scenes-2026-10/1-sessions.js.
- 10,233 conversations were labelled by Claude Sonnet 4.6 (roadmap-label.js:10). Example moments were tagged by Claude Haiku 5.5 (examples-2026-10/2-tag.js:49).
- `ai_examples` = 11,341 rows, every one from those OnlyFans analyses:

  | Source | Kind | Rows |
  |---|---|---|
  | chat-analysis-2026-10 | chat | 4,693 |
  | chat-analysis-2026-10-selling | offer | 1,194 |
  | chat-analysis-2026-10-selling | turning | 1,281 |
  | chat-analysis-2026-10-selling | after_buy | 382 |
  | scenes-2026-10 | scene | 3,791 |

  There are 0 `practice` rows yet (starring was added in 06dbc8f).
- `fanvue-stats.js` touches Fanvue data, but it only counts things (no text).
- So Fanvue's API rule (section 5.2(13) as the report quotes it) doesn't apply to the 35k or `ai_examples`. A separate question remains, which I can't settle: whether OnlyFans' terms, Infloww's terms and the fans' privacy allow using OnlyFans fans' messages to build an AI for another platform.

### Where Fanvue-API data does feed the AI (Yuna's chats, her fans' messages)
1. **Blind test** (aiDuels.js `findMoments`, :52): real Fanvue fan messages and her chatters' answers are sent to two writer models and to Claude as judge. 404 `ai_duels` rows are stored. This is model evaluation on API-obtained messages. **Highest risk under 5.2(13).**
2. **`ai_gold` "proven answers"**: 394 rows of her Fanvue chatters' answers that were followed by a purchase. Used as the gold standard and as examples from 19 Oct (d99263e) until 20 Oct (d97284d, "learn from the 35k, not her Fanvue chats"). No code reads it now, but the **data is still in the database**. Deleting it is the user's call.
3. **Her profile**: `generateProfile` (aiChat.js:216-221, when "use history" is ticked) and `draftProfile` (aiChat.js:245-255) send her own Fanvue messages, broadcasts and welcome messages to the writer model, to draft the persona.
4. **Fan notes**: `buildMemory` (aiChat.js:579-620) sends each fan's Fanvue chat to the writer model to write notes (hourly through `refreshMemories`). Her self-facts from those notes go into every prompt (diary) and are auto-promoted into her profile (`promoteFacts`). Mostly this is running the service, but promoting into the profile shapes the persona from API data.
5. **Practice with a real fan**: his Fanvue chat is the context sent to Mistral and Claude (reader, coach, fix). `ai_checks` stores his latest message. A starred practice reply goes into `ai_examples`. Its "him" text is the line typed in Practice, but the reply was generated from the real chat.
6. **Not Fanvue data:** the 4 test chats (analysis-data/evals/voice-test.js) are scripted, made-up lines.
7. Live replies, once switched on, would read the fan's Fanvue chat. That is the service itself, covered by the creator authorizing it, not "development".

Uses 1, 2 and 3 (and arguably promotion in 4 and Practice in 5) are the ones to clear with Fanvue or stop. Fanvue chats are also already flagged as bad chatting (memory note `fanvue-chats-not-a-model`), so dropping them from development costs little.
