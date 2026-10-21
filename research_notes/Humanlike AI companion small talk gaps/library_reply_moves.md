# How our human chatters small-talk: reply moves in our own chat data

Measured 21 Oct 2026. Read-only: nothing in the database or the app was changed. Scripts and working files are in the session scratchpad (`library_moves/`), not in the repo.

## The answer in short

- **Human chatters ask a question in about 43% of ordinary small-talk replies, not almost every time.** The rule is "the reply contains a question mark". On 67,070 replies the result is 43.1% (95% CI 42.7–43.5). The model's judgement, which also counts questions with no "?", gives 48%. A question is the *main* move in only about a third of replies (33–35%).
- **The rest of the replies are answers (16–18%), short reactions (18%), opinions (5–6%), sharing about herself (5–7%), teasing (4–6%), closings (5%), empathy (3–4%) and compliments (3–5%).**
- **Style.** A reply is short: 7 words (median), 8.3 on average. It comes in 1.26 separate messages ("bubbles") on average, and 23% of replies use 2 or more. 30% have an emoji. 11% have a laugh word (haha, lol, hehe). Almost none end with a full stop (0.3%). Almost none start with a lowercase letter (0.7%; this may be the export, see Limitations).
- **Yuna's AI replies on the 19 Oct engine asked a question 79% of the time** (86 small-talk moments). On the same real Fanvue moments, the human chatters asked 47% of the time. Yuna's replies were also longer: 13 words vs 8.6, in one bubble. On the 21 Oct engine, Yuna asked only 25% of the time, but on just 28 moments.
- **Engagement (not cause and effect).** Turns with a question got a fan reply a bit more often (86.5% vs 81.9%), but the fan wrote *less* (10+ words: 26.9% vs 29.7%). Compliments drew the longest fan replies. Opening a brand-new topic drew the shortest. Closings were followed by silence, as you'd expect. Question turns sit more often in dialogues that ended in a purchase (14.1% vs 9.2% within 24 h). That is very likely because chatters ask more questions to fans who are already engaged, and the question itself is probably not the reason.

## 1. Data and how small talk was picked

**Source.** The `messages` table: 277,380 rows from Infloww "Message Dashboard" exports for the agency's OnlyFans pages, all from chatters. The table holds 13 page records, some of them combined pages. Each row is one creator message ("bubble"). It also stores the fan message it answered, the price, whether it was bought, and the reply time. Rows marked "Unsent" (1,451) were left out. The `ai_examples` table (11,341 tagged moments) only covers the "good" dialogues and cuts each reply at 3 bubbles. For that reason it was used as a robustness check, not as the main sample (see section 2c).

**From rows to replies (turns).**
1. Messages were grouped per page and fan, sorted by time, and split into sessions wherever there was a gap of more than 3 hours. That gives 36,758 sessions, the same rule the 35k analysis used.
2. A new fan message starts whenever the quoted fan text changes. The chatter's bubbles until the next fan message form one **turn** (one reply). That gives 201,167 turns.

**What counted as small talk.** A turn was kept only if all of these held. 67,070 turns passed (33%), from 12 pages and 22 chatters.

| Rule | Turns dropped |
|---|---|
| A paid message (PPV) inside the turn | 11,689 |
| A PPV among the 3 messages before the fan's message (talk about content just sent) | 9,234 |
| A PPV in the next 2 turns of the session (warm-up for a sale) | 17,358 |
| Not English (Spanish word check; the "Cora ES" pages were left out) | 9,003 |
| Sexual words or emoji in the fan's message, the reply, or the 3 messages before | 69,998 |
| Selling words (buy, price, tip, content, pics, video, unlock, $, snap, etc.) in the same window | 16,815 |

- **Mass messages.** None in this table: every row has source "Employee" (one row says "AI Copilot"). Mass messages are stored elsewhere.
- **Sexual filter.** Our data has no sexual-level tag on single messages, so this is a word list of about 130 terms plus a few sexual emoji. It was checked against the `ai_examples` level tags (0 friendly, 1 flirty, 2 suggestive, 3 explicit). It flags 7% of level-0 moments, 31% of level 1, 74% of level 2 and 97% of level 3. On top of that, the filter also looks at the 3 messages before, and the labelling model gave a second opinion (below).
- **Leaks the model caught.** The labelling model judged 10.4% of the sampled turns (CI 9.0–12.0) as "not small talk", meaning sexual or selling. The stronger model said 17.6%. The main move table only uses turns the model confirmed as small talk.

## 2. Style stats (rule-based, all 67,070 small-talk turns)

How each column was measured:
- **Has a question:** a "?" anywhere in the turn.
- **Words:** emoji are not counted as words.
- **Starts lowercase:** the first letter of the first bubble.
- **Ends with a full stop:** the last bubble ends with a single "." (not "..").
- **Laughter:** haha, hehe, lol, lmao and similar.

| Group | Turns | Has a question | Words per turn (mean / median) | Words per bubble (mean / median) | Bubbles per turn | 2+ bubbles | Emoji per turn | Any emoji | Starts lowercase | Ends with a full stop | Laughter |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **All small-talk turns** | 67,070 | 43.1% (42.7–43.5) | 8.3 / 7 | 6.6 / 6 | 1.26 | 22.6% (22.3–22.9) | 0.41 | 30.5% (30.2–30.9) | 0.7% (0.6–0.8) | 0.3% (0.3–0.4) | 10.8% (10.5–11.0) |
| The fan messages they answer | 67,070 | 18.3% | 8.2 / 6 | 8.2 / 6 | 1 quoted | n/a | 0.37 | 17.4% | 8.6% | 5.6% | 6.0% |

More detail:
- **Bubbles per turn:** 1 bubble in 77%, 2 in 20%, 3 or more in 3%.
- **Words per turn:** P10 = 2, P25 = 4, P75 = 11, P90 = 16. 20% of turns are 3 words or fewer.
- **When a turn with 2+ bubbles has a question,** the question is in the last bubble 85% of the time.
- **Common phrases:** "How are you"-type questions 4.6%, "what are you doing / wyd" 2.4%, a pet name (babe, hun, love, dear and so on) 17%.
- **Chatters differ a lot.** The question share runs from 20% to 70% across chatters with 300+ turns (median 49%), and from 27% to 58% across pages (median 45%).

### 2a. Split by what the fan did next

What counts as a fan reply: his next message in the same session that the chatter answered.

| Group | Turns | Has a question | Words per turn | Bubbles | 2+ bubbles | Any emoji | Laughter |
|---|---|---|---|---|---|---|---|
| Fan replied in session | 56,259 | 44.4% (44.0–44.8) | 8.6 | 1.28 | 23.8% | 28.9% | 11.3% |
| No visible fan reply in session | 10,811 | 36.2% (35.3–37.1) | 7.0 | 1.19 | 16.4% | 39.2% | 8.0% |
| Fan reply 10+ words | 19,121 | 40.7% (40.0–41.4) | 10.0 | 1.30 | 25.6% | 30.7% | 13.4% |
| Fan reply under 10 words | 37,138 | 46.4% (45.9–46.9) | 7.9 | 1.26 | 22.9% | 27.9% | 10.2% |

| Turn | Turns | Fan replied in session | Fan reply 10+ words (share of all turns) | Median fan reply words | Bought within 24 h |
|---|---|---|---|---|---|
| Has a question | 28,914 | 86.5% (86.1–86.8) | 26.9% (26.4–27.4) | 6 | 14.1% (13.7–14.6) |
| No question | 38,156 | 81.9% (81.5–82.3) | 29.7% (29.3–30.2) | 7 | 9.2% (9.0–9.5) |

| Bubbles in turn | Turns | Fan replied in session | Fan reply 10+ words | Bought within 24 h |
|---|---|---|---|---|
| 1 | 51,897 | 82.6% | 27.4% | 10.2% |
| 2 | 13,084 | 88.2% | 31.9% | 14.7% |
| 3+ | 2,089 | 89.2% | 34.6% | 20.1% |

### 2b. Split by purchase within 24 h

A purchase means a PPV in the same fan's chat on the same page, marked as bought, and sent within 24 h after the turn.

| Group | Turns | Has a question | Words per turn | Bubbles | 2+ bubbles | Any emoji | Laughter |
|---|---|---|---|---|---|---|---|
| Bought within 24 h | 7,615 | 53.7% (52.6–54.8) | 9.8 | 1.37 | 30.7% | 38.1% | 12.6% |
| No purchase within 24 h | 59,455 | 41.8% (41.4–42.1) | 8.2 | 1.25 | 21.6% | 29.6% | 10.5% |

### 2c. Robustness: the moments tagged in `ai_examples`

These are human replies from the "good" dialogues of the 35k analysis (warm-up, no-PPV and aftercare moments; replies cut at 3 bubbles).

| Group | Turns | Has a question | Words per turn | Bubbles | 2+ bubbles | Any emoji | Lowercase start | Full stop | Laughter |
|---|---|---|---|---|---|---|---|---|---|
| Tagged level 0–1 (him and her) | 2,299 | 54.2% (52.2–56.2) | 11.1 | 1.36 | 30.3% | 46.4% | 0.6% | 0.2% | 15.9% |
| Tagged casual_chatter, level 0–1 | 1,186 | 57.6% (54.8–60.4) | 10.9 | 1.35 | 30.9% | 37.3% | 0.5% | 0.3% | 17.9% |

The good, buying dialogues use more questions (54–58%) than small talk overall (43%). This matches the purchase split in 2b. Even there, though, a question is far from "almost every time".

## 3. Reply moves (labelled by a model, 1,500 random small-talk turns)

**Method.**
- **Sample.** 1,500 turns drawn from the 67,070 with a fixed seed (20261021).
- **What the model saw.** The 3 messages before the reply (the last of them is the fan's message), then the reply. Every bubble was shown, numbered.
- **Masking.** Fan usernames and nicknames were replaced by [fan], and the page name by [her name]. First names that fans typed into their own messages were not masked.
- **Models.** Everything ran through OpenRouter, with no Claude/Anthropic models involved, at temperature 0, JSON output, and the provider setting `data_collection: deny`.
  - Main rater: `mistralai/mistral-small-3.2-24b-instruct`, $0.066.
  - Second rater: `mistralai/mistral-medium-3.1`, $0.338.
  - Total about $0.40, well under the $3 cap.
- **Which turns count.** The tables only use turns the rater itself confirmed as small talk: 1,344 for small and 1,236 for medium.

### Move shares (primary move; 95% Wilson intervals)

| Move | mistral-small: count | mistral-small: share | mistral-medium: count | mistral-medium: share | Primary or secondary (small) |
|---|---|---|---|---|---|
| question_followup | 350 | **26.0%** (23.8–28.5) | 215 | **17.4%** (15.4–19.6) | 33.3% |
| question_new | 126 | **9.4%** (7.9–11.1) | 194 | **15.7%** (13.8–17.8) | 14.3% |
| answer | 247 | 18.4% (16.4–20.5) | 200 | 16.2% (14.2–18.3) | 19.6% |
| reaction | 247 | 18.4% (16.4–20.5) | 222 | 18.0% (15.9–20.2) | 23.7% |
| opinion | 76 | 5.7% (4.5–7.0) | 63 | 5.1% (4.0–6.5) | 8.4% |
| self_disclosure | 61 | 4.5% (3.5–5.8) | 88 | 7.1% (5.8–8.7) | 8.9% |
| closing | 64 | 4.8% (3.7–6.0) | 63 | 5.1% (4.0–6.5) | 5.4% |
| tease_joke | 56 | 4.2% (3.2–5.4) | 78 | 6.3% (5.1–7.8) | 8.6% |
| empathy | 53 | 3.9% (3.0–5.1) | 38 | 3.1% (2.2–4.2) | 6.0% |
| compliment | 39 | 2.9% (2.1–3.9) | 57 | 4.6% (3.6–5.9) | 6.8% |
| guess_about_partner | 22 | 1.6% (1.1–2.5) | 16 | 1.3% (0.8–2.1) | 2.5% |
| callback | 2 | 0.1% (0.0–0.5) | 2 | 0.2% (0.0–0.6) | 0.5% |
| other | 1 | 0.1% (0.0–0.4) | 0 | 0.0% (0.0–0.3) | 0.4% |
| **Any question as primary** | 476 | **35.4%** (32.9–38.0) | 409 | **33.1%** (30.5–35.8) | |
| Any question move, primary or secondary | | 47.1% (44.4–49.8) | | 46.2% (43.4–49.0) | |
| has_question (model) / "?" rule, same turns | | 48.4% / 44.0% | | 47.7% / 44.7% | |
| Replies with a second move | | 38.5% | | 35.4% | |

**How reliable this is.**
- **Agreement between the two models.** They pick the same primary move in 64.8% of turns (Cohen's kappa 0.59, moderate). At least one of their moves overlaps in 78% of turns. They agree on the small-talk flag in 89.7% of turns.
- **The biggest disagreement** is follow-up vs new question: small said follow-up where medium said new in 102 cases. The other disagreements are answer vs self_disclosure, reaction vs compliment, and answer vs reaction.
- **So the follow-up vs new split is uncertain:** follow-up 17–26%, new 9–16%. The *total* question share is stable at 33–35% as main move and about 46–47% as any move.
- **Hand check (by me, 50 random turns the small model confirmed as small talk).**
  - Primary-move agreement: small model 43/50 = 86%; medium model 45/50 = 90%.
  - The small model's misses: answers it labelled as reactions (2), a sign-off it labelled as an answer, a new topic it labelled as a follow-up question (2), a playful counter-question it labelled as a new question, and a reaction it labelled as a guess about the partner.
  - has_question was right in 48/50. One miss was a rhetorical line counted as a question. The other was a question with no "?" that was not counted.
- **callback is close to 0 by design.** The model only saw 3 earlier messages, so it could not spot references to things said much earlier. Treat callback as "not measured".

### What the moves look like (paraphrased; names and details changed)

- **question_followup.** He says he's been gardening all day. She says that's fine, then asks how often he does it.
- **question_new.** He thanks her for the good vibes. She thanks him and asks how his day is going.
- **answer.** He asks if she has a car. She says not yet, but soon.
- **reaction.** He explains why a relative moved. She replies "I see".
- **opinion.** He says he can't sleep well. She says he might sleep better if he relaxed more.
- **empathy.** He says he gave up trying something. She hopes it goes better next time.
- **closing.** After a lull she says it was nice catching up.

## 4. Engagement and the move used (description only, not cause and effect)

Main rater, the 1,344 confirmed small-talk turns.

| Move (primary) | Fan replied 10+ words (n=369) | Fan replied under 10 words (n=757) | No visible fan reply (n=218) |
|---|---|---|---|
| question_followup | 25.7% | 28.0% | 19.7% |
| question_new | 6.0% | 11.1% | 9.2% |
| answer | 20.6% | 19.4% | 11.0% |
| reaction | 20.1% | 16.4% | 22.5% |
| compliment | 5.4% | 2.1% | 1.4% |
| closing | 2.2% | 2.2% | 17.9% |
| any question move | 43.6% (38.7–48.7) | 51.9% (48.4–55.5) | 36.2% (30.1–42.8) |

| Primary move | n | Fan replied in session | Fan reply 10+ words | Median fan reply words | Bought within 24 h |
|---|---|---|---|---|---|
| question_followup | 350 | 87.7% | 27.1% | 6 | 13.1% |
| question_new | 126 | 84.1% | **17.5%** | 5 | 13.5% |
| answer | 247 | 90.3% | 30.8% | 7 | 13.8% |
| self_disclosure | 61 | 90.2% | 26.2% | 6 | 14.8% |
| opinion | 76 | 81.6% | 26.3% | 7 | 9.2% |
| reaction | 247 | 80.2% | 30.0% | 7 | 8.5% |
| tease_joke | 56 | 87.5% | 26.8% | 7 | 10.7% |
| compliment | 39 | 92.3% | **51.3%** (36–66) | 12.5 | 17.9% |
| empathy | 53 | 86.8% | 30.2% | 7 | 9.4% |
| closing | 64 | 39.1% | 12.5% | 7 | 0.0% |

| Move (primary) | Bought within 24 h (n=157) | No purchase (n=1,187) |
|---|---|---|
| question_followup | 29.3% | 25.6% |
| question_new | 10.8% | 9.2% |
| answer | 21.7% | 17.9% |
| reaction | 13.4% | 19.0% |
| closing | 0.0% | 5.4% |
| any question move | 56.1% (48.2–63.6) | 45.9% (43.1–48.8) |

How to read this:
- **Questions get *a* reply a little more often, but not a *longer* one.** Brand-new topic questions get the shortest replies.
- **Answers, reactions, empathy and sharing about herself** keep the fan talking about as well as a follow-up question does.
- **Compliments are linked with the longest fan replies,** but there are only 39 of them, so the interval is wide.
- **The purchase gap is mostly about who the fan is, not about the move.** Engaged fans get more questions and also buy more.

## 5. Yuna's AI replies compared with humans (rule-based only; nothing sent to any model)

Where the AI replies came from:
- **`ai_duels`:** 404 real Fanvue moments. The AI wrote a reply, and the human chatter's real reply is stored next to it. The AI model was mistral-large-2512. The batches ran on 19 and 21 Oct. The same small-talk word filter was applied to the fan message and both replies, which left 114 moments.
- **`ai_checks`:** 52 small-talk replies, 20–21 Oct.
- **The eval test chats** in `analysis-data/evals/`, with made-up fans, where his level was 0–1: 10–13 replies per run.
- **`ai_practice_runs`** is empty.

| Group | Turns | Has a question | Words per turn (mean / median) | Words per bubble | Bubbles | 2+ bubbles | Any emoji | Lowercase start | Full stop | Laughter |
|---|---|---|---|---|---|---|---|---|---|---|
| **Human OnlyFans chatters (all small talk)** | 67,070 | **43.1%** (42.7–43.5) | 8.3 / 7 | 6.6 | 1.26 | 22.6% | 30.5% | 0.7% | 0.3% | 10.8% |
| Human Fanvue chatters, same duel moments | 114 | **46.5%** (37.6–55.6) | 8.6 / 7 | 7.3 | 1.18 | 17.5% | 14.9% | 18.2% | 7.9% | 9.6% |
| Yuna AI, duels, all | 114 | 65.8% (56.7–73.9) | 13.2 / 12 | 11.9 | 1.11 | 10.5% | 28.9% | 43.0% | 4.4% | 11.4% |
| Yuna AI, duels 19 Oct | 86 | **79.1%** (69.3–86.3) | 13.2 / 12 | 11.8 | 1.12 | 11.6% | 25.6% | 55.8% | 1.2% | 15.1% |
| Yuna AI, duels 21 Oct | 28 | 25.0% (12.7–43.4) | 13.2 / 12 | 12.3 | 1.07 | 7.1% | 39.3% | 3.6% | 14.3% | 0.0% |
| Yuna AI, ai_checks 20–21 Oct | 52 | 44.2% (31.6–57.7) | 11.3 / 10.5 | 9.8 | 1.15 | 15.4% | 21.2% | 0.0% | 5.8% | 0.0% |
| Yuna AI, eval chats 20 Oct ("before-mistral" → "final-mistral") | 12 each | 100% → 33% | 14.1 → 10.4 | | 1.00 | 0% | 25–33% | 0% | 8% | 0% |

- **Paired view (same 114 moments):** both asked 36 times; only the AI asked 39; only the human asked 17; neither asked 22.
- **Filtering on the fan's message only** (257 moments) gives the same picture: the AI asks 70.0%, humans 45.5%. AI replies average 13.3 words, human replies 9.5.
- **The gaps that matter for Yuna:**
  - Questions: earlier engine 66–79%, newest small batches 25–44%, humans about 43–47%.
  - Length: AI replies are about 50% longer per turn, and each bubble is almost twice as long (12 vs 6.6 words).
  - Splitting: the AI rarely splits a reply into 2+ bubbles (7–12%); humans do it in 18–23% of replies.
  - Sample size: the 21 Oct numbers rest on only 28 + 52 replies.

## Suggested targets for Yuna (ordinary small talk, from the human base rate)

| What | Target |
|---|---|
| Replies with a question | about 40–50% (rule) |
| Replies where a question is the main move | about a third |
| Answer or reaction as the main move, together | about 35% of replies |
| Sharing about herself, opinion or teasing as the main move | about 15% |
| Words per turn | median about 7, mostly 4–11 |
| Words per bubble | about 6 |
| Replies split into 2+ bubbles | about 1 in 4; when a split reply has a question, put it in the last bubble |
| Emoji | about 1 reply in 3 |
| Laugh word | about 1 in 10 |
| Ending with a full stop | almost never |

## Limitations

- **Selection by word list.** The sexual and selling filters are word lists. Leaks remain (the models flagged 10–18% of sampled turns) and some harmless turns are lost. For example, any use of "hot", "bed", "shower" or "body" drops a turn. That may slightly undercount teasing.
- **Hidden fan messages.** The export only shows a fan message when the chatter answered it. Extra fan messages in between are invisible, and "no visible fan reply" can also mean the chatter never answered. Fan reply times are worked out from the stored reply times.
- **Purchase timing.** We only know when a bought PPV was *sent*, not when he paid. Within 24 h is approximate, and the 2b link is strongly confounded by how engaged the fan already was.
- **Capital letters and full stops.** The 0.7% lowercase starts and 0.3% full stops on OnlyFans may partly come from the chat tool or the export auto-capitalising. The Fanvue human chatters show 18% lowercase starts and 8% full stops at the same kind of moments.
- **Reach of the sample.** One agency, 22 chatters, 12 pages, Aug–Oct 2026, English only. Chatters vary a lot (20–70% questions). These are paid chatters writing as the creator, so the persona is not natural chat between peers.
- **Model labels.** Agreement between the two models is moderate (kappa 0.59). The follow-up vs new question split is not reliable; the total question share is. callback could not be measured with 3 messages of context. The labels are for the whole turn (all bubbles together).
- **Not comparable one-to-one with CANDOR.** CANDOR is spoken video calls between strangers. This data is paid text chat with very short turns. Compare shares with that in mind.
- **Small AI samples.** Especially the newest engine: 28 duel moments and 52 checks.

## The exact labelling prompt

System message:

```
Label the conversational move of the LAST reply.

You see a short excerpt of a casual text chat between a FAN and a CREATOR, then the LAST reply, written by the CREATOR. The LAST reply may be made of several separate messages sent in a row; label it as one reply.

Pick ONE primary move for the LAST reply and, only if the reply clearly does a second thing, one secondary move. Moves:
- question_followup: asks about something the partner just said
- question_new: asks a question that opens a new topic (incl. "what about you?/wbu")
- answer: directly answers the partner's question
- self_disclosure: shares own experience, day, story, feelings
- opinion: states a view, preference, judgement or mild disagreement
- reaction: short acknowledgement/backchannel/laughter ("haha", "oh nice", "omg")
- tease_joke: playful teasing or humour
- compliment: praise of the partner
- empathy: sympathy/support for the partner's feelings
- guess_about_partner: statement or assumption about the partner
- callback: refers back to something said much earlier
- closing: wrapping up, goodbye
- other

Also say:
- has_question: true if the LAST reply asks the partner anything (with or without a question mark)
- small_talk: true if the excerpt is ordinary everyday chat; false if it is sexual or flirting toward sex, or about buying, selling, paying for or sending paid content

Answer with JSON only: {"primary": "<move>", "secondary": "<move or null>", "has_question": true|false, "small_talk": true|false}
```

User message:

```
Chat excerpt:
FAN: <message>
CREATOR: <message>
FAN: <the message being answered>

LAST reply:
CREATOR (message 1): <bubble>
CREATOR (message 2): <bubble>
```

(When the reply is one bubble, the line is just `CREATOR: <text>`.) Settings: temperature 0, seed 7, max_tokens 80, `response_format: json_object`, OpenRouter `provider.data_collection: deny`. An unknown move was mapped to `other`. A secondary move equal to the primary was dropped.

Scripts are in the scratchpad folder `library_moves/`:

| Script | What it does |
|---|---|
| `dump.js`, `dump2.js`, `dump3.js` | Read-only pulls from the database |
| `lib.js` | Word filters and style rules |
| `build.js` | Builds turns and selects small talk |
| `stats.js` | Style stats |
| `label.js` | Model labelling |
| `moves.js` | Move shares and engagement |
| `ai_stats.js` | AI vs human |
| `handcheck.js` | Hand-check sample |
