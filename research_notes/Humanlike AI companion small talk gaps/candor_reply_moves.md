# Human baseline for small-talk "reply moves" (CANDOR substitute: Switchboard + Topical-Chat)

Date: 21 Oct 2026. Purpose: human base rates for how often people ask questions, react, share their own stories, give opinions and so on, to compare with Yuna's AI-written small talk. A parallel analysis applies the same labels to our own chat library. The exact labelling prompt is at the end, so both analyses can use the same one.

## Plain-language summary

- **We could not use CANDOR itself.** You get it by filling in a registration form (organisation, contact details, what you'll use it for), then waiting for approval. I did not sign up for you. Instead I used two free conversation datasets and the numbers CANDOR's authors published.
- **Strangers talking on the phone (Switchboard) ask a question in about 8% of all turns.** Leave out the "uh-huh / yeah" turns and it is about 11%. A typical speaker asks in 9% of their real turns, and 9 in 10 speakers stay under 26%. Asking three times in a row happens in about 1% of stretches.
- **Strangers texting (Topical-Chat) ask much more: about a third of turns have a question.** These crowd workers were told to chat about articles they had been given, and they lean on "did you know…?". Even here, a typical person asks in 30% of turns, only 16% of people ask in more than half their turns, and three questions in a row happen in about 5% of stretches.
- **What people mostly do instead of asking:**
  - talk about themselves (self-disclosure): about 27% of turns in both datasets;
  - give opinions: 9% on the phone, 28% in text;
  - react ("yeah", "oh nice", "haha"): 42% of phone turns, 13% of text turns.
  - Teasing, compliments, empathy and guesses about the partner are each rare, at 0–2% as the main move.
- **Does asking more make a chat better?** Only a little. In Topical-Chat, the conversations both people rated "Excellent" had slightly more question turns than the ones rated "Good" or lower (34.3% vs 31.1%). The average rating stops rising once about 40–50% of turns contain a question.
  - The top-rated chats also had fewer pure-reaction turns (11% vs 16%) and slightly shorter messages.
  - The differences are small. Ratings are bunched near the top of the scale, so this tells us little about real enjoyment.
- **What this means for Yuna.** A question in nearly every reply is far outside the human range:
  - speech: about 10% of turns;
  - text chat between strangers on assigned topics: about 30%;
  - even very curious people rarely go above 50–60%.
- Human small talk is mostly "here's mine" (self-disclosure and opinion) plus short reactions.

## 1. Data sources and licences

| Source | What it is | How obtained | Licence | Used? |
|---|---|---|---|---|
| **CANDOR** (Reece et al. 2023, *Science Advances* 9(13): eadf3197) | 1,656 video calls between US strangers, 31 min on average (SD 8), with post-chat surveys (enjoyment on a 1–9 scale) | Registration form at betterup-data-requests.herokuapp.com (asks for affiliation, contact info and intended use), then manual review; download links are emailed. ConvoKit does **not** host it, only a converter, and says "the license of the original distribution applies". | No data licence is stated anywhere public (not on the BetterUp page, the paper or ConvoKit). The paper itself is CC BY-NC 4.0. | **No.** It needs a sign-up form and approval, so I stopped as instructed. Only its published figures are used (section 5). |
| **Switchboard Dialog Act Corpus** (SwDA), via ConvoKit `switchboard-corpus` | 1,155 five-minute US phone calls between strangers on assigned topics (child care, recycling and so on), 1990–91. Every utterance is hand-tagged with SWBD-DAMSL dialogue acts. | Direct download, no sign-up: `zissou.infosci.cornell.edu/convokit/datasets/switchboard-corpus/switchboard-corpus.zip` (5.8 MB) | "Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Unported" | **Yes**, as the main spoken baseline. |
| **Topical-Chat** (Gopalakrishnan et al. 2019, Amazon Alexa) | 10,784 text chats between pairs of crowd workers (about 21 turns each). Each had reading material on a topic. Each partner rated the whole chat (Excellent / Good / Passable / Not Good / Poor), and each turn was rated by the partner. | Direct download from github.com/alexa/Topical-Chat (`conversations/*.json`) | Community Data License Agreement – Sharing 1.0 (CDLA-Sharing-1.0), an open data licence accepted by use with no sign-up. It allows analysis; sharing obligations apply only if you republish the data. | **Yes**, as the text-chat baseline and for the rating comparison. |
| Stolcke et al. 2000 (*Computational Linguistics* 26(3); arXiv cs/0006023) | Published dialogue-act frequencies for Switchboard | Paper | — | Yes, as published figures (section 5). |

Licence caveat: Switchboard is **non-commercial**. Here it is used only to work out summary rates, which are facts, for internal research. Don't ship its text or derived datasets inside a commercial product. Topical-Chat has no such restriction.

Not used: Persona-Chat (no clear licence) and Fisher (paid, from the LDC).

Safety: the downloads sit in `scratchpad/candor_data/`, kept apart from the scripts in `scratchpad/candor_scripts/`. Python was run with `python3 -I` and paths passed as arguments. Only the JSON data was read; nothing that came with the data was run.

## 2. Method

**Turns.**
- *Switchboard:* ConvoKit has already merged each speaker's consecutive utterances, so turns strictly alternate (0 same-speaker repeats in 122,646 rows). A listener's "uh-huh" therefore counts as its own turn and splits the speaker's turn in two. That is the same as CANDOR's **"Audiophile"** turn model, and it is the one used here.
  - I also report a **"substantive turns"** view that drops pure backchannels: turns of 3 words or fewer whose dialogue-act tags are only backchannel or agreement tags (b, bk, ba, aa, %, x, +, bh). This roughly matches CANDOR's **"Backbiter"** view, which moves backchannels out of the turn sequence.
  - Text was cleaned of transcription markup ({F uh,} → "uh,", [ + ] repairs, / unit marks, <laughter> → "(laughs)").
  - 3,282 turns that were only noise or markup (0 words) were dropped, leaving 119,364 turns.
- *Topical-Chat:* each message is a turn (235,261 turns). Speakers almost never send two messages in a row there.

**Rule-based measures on ALL turns.**
- Word count: tokens matching `[A-Za-z0-9']+`.
- Share of very short turns: 3 words or fewer.
- `has_question` (rule): the turn has "?", or contains "what about you / how about you / wbu / hbu / and you", or any sentence starts with an interrogative opener (wh-word or flipped auxiliary + pronoun, e.g. "do you", "are they"), optionally after "so/and/but/well/oh/um".
- For Switchboard there is also the **hand-made dialogue-act gold standard**: a turn counts as a question if any segment's tag is a question tag (qy, qw, qo, qh, qr, qrr, bh, ^d, ^g).
  - Checked against that gold standard, the rule is 72% precise and catches 77% of questions. It gives 8.5% of turns with a question; the gold standard gives 8.0%.

**LLM labelling.**
- Samples:
  - **1,500 random turns from each corpus**, seed 42, sampled from all non-empty turns, so Switchboard backchannels are included.
  - Each turn came with the **previous 3 turns** as context, marked TARGET SPEAKER or PARTNER.
- Model:
  - `mistralai/mistral-small-2603`, the newest Mistral Small on OpenRouter on 21 Oct 2026.
  - Settings: temperature 0, seed 7, reasoning off.
  - Structured JSON output, with the move names limited to the taxonomy list.
- Retries: 393 calls first failed with HTTP 429 (rate limit) and were re-run with fewer parallel workers. All 3,000 are labelled.
- **Total spend: about US$0.34**, against a US$3 cap.
  - The account uses its own Mistral key through OpenRouter, so OpenRouter reports $0. The spend shown is the upstream inference cost (about $0.0001 per turn).

**Taxonomy.** Exactly the shared list: question_followup, question_new, answer, self_disclosure, opinion, reaction, tease_joke, compliment, empathy, guess_about_partner, callback, closing, other. Each turn gets one primary move, an optional secondary move, and has_question. The full prompt is in section 9.

**Intervals.** Shares carry 95% Wilson intervals over turns. Turns from the same conversation are not fully independent, so these are a little too narrow. Group differences use ±1.96 SE. For the all-conversation comparison, I resampled whole conversations 500 times (a cluster bootstrap).

## 3. Move shares (LLM labels, n = 1,500 turns per corpus)

### 3a. Switchboard (spoken phone calls between strangers), all turns

| Move | Primary: count | Share | 95% CI | Primary or secondary |
|---|---|---|---|---|
| question_followup | 25 | 1.7% | 1.1–2.4% | 2.5% |
| question_new | 62 | 4.1% | 3.2–5.3% | 4.8% |
| answer | 139 | 9.3% | 7.9–10.8% | 9.7% |
| self_disclosure | 410 | 27.3% | 25.1–29.6% | 34.3% |
| opinion | 140 | 9.3% | 8.0–10.9% | 16.9% |
| reaction | 632 | 42.1% | 39.7–44.6% | 50.4% |
| tease_joke | 2 | 0.1% | 0.0–0.5% | 0.7% |
| compliment | 0 | 0.0% | 0.0–0.3% | 0.7% |
| empathy | 1 | 0.1% | 0.0–0.4% | 2.3% |
| guess_about_partner | 15 | 1.0% | 0.6–1.6% | 2.9% |
| callback | 9 | 0.6% | 0.3–1.1% | 0.9% |
| closing | 24 | 1.6% | 1.1–2.4% | 1.9% |
| other | 41 | 2.7% | 2.0–3.7% | 3.3% |
| **any question move** | 87 | **5.8%** | 4.7–7.1% | 7.3% |

### 3b. Switchboard, substantive turns only (drops reaction/other turns of ≤3 words; n = 975)

| Move | Primary: count | Share | 95% CI | Primary or secondary |
|---|---|---|---|---|
| question_followup | 25 | 2.6% | 1.7–3.8% | 3.4% |
| question_new | 62 | 6.4% | 5.0–8.1% | 7.3% |
| answer | 139 | 14.3% | 12.2–16.6% | 15.0% |
| self_disclosure | 410 | 42.1% | 39.0–45.2% | 52.5% |
| opinion | 140 | 14.4% | 12.3–16.7% | 25.7% |
| reaction | 141 | 14.5% | 12.4–16.8% | 27.2% |
| tease_joke | 2 | 0.2% | 0.1–0.7% | 0.9% |
| compliment | 0 | 0.0% | 0.0–0.4% | 0.9% |
| empathy | 1 | 0.1% | 0.0–0.6% | 2.3% |
| guess_about_partner | 15 | 1.5% | 0.9–2.5% | 3.8% |
| callback | 9 | 0.9% | 0.5–1.7% | 1.2% |
| closing | 24 | 2.5% | 1.7–3.6% | 2.7% |
| other | 7 | 0.7% | 0.3–1.5% | 0.9% |
| **any question move** | 87 | **8.9%** | 7.3–10.9% | 10.7% |

### 3c. Topical-Chat (text chat between strangers, assigned reading material), all turns

Only 8 of the 1,500 sampled turns are short reactions or fragments, so the substantive-only table is almost the same and is not repeated.

| Move | Primary: count | Share | 95% CI | Primary or secondary |
|---|---|---|---|---|
| question_followup | 25 | 1.7% | 1.1–2.4% | 3.0% |
| question_new | 231 | 15.4% | 13.7–17.3% | 27.1% |
| answer | 127 | 8.5% | 7.2–10.0% | 9.2% |
| self_disclosure | 391 | 26.1% | 23.9–28.3% | 39.9% |
| opinion | 415 | 27.7% | 25.5–30.0% | 44.5% |
| reaction | 194 | 12.9% | 11.3–14.7% | 31.1% |
| tease_joke | 22 | 1.5% | 1.0–2.2% | 3.2% |
| compliment | 2 | 0.1% | 0.0–0.5% | 0.8% |
| empathy | 0 | 0.0% | 0.0–0.3% | 1.3% |
| guess_about_partner | 10 | 0.7% | 0.4–1.2% | 4.3% |
| callback | 5 | 0.3% | 0.1–0.8% | 0.5% |
| closing | 74 | 4.9% | 3.9–6.1% | 6.0% |
| other | 4 | 0.3% | 0.1–0.7% | 0.7% |
| **any question move** | 256 | **17.1%** | 15.2–19.1% | 29.8% |

**Reading the tables.**
- In both corpora, *new-topic* questions far outnumber *follow-up* questions as the main move. In Topical-Chat this is partly built into the task: people quiz each other with "Did you know…?" about their reading material.
- About 30% of Topical-Chat turns contain a question move somewhere in the turn, but only 17% are *mainly* a question. People usually attach the question to a statement or reaction ("Oh wow I didn't know that. Did you know she co-owns the Dolphins?").

## 4. Question rates and words per turn (rule-based, ALL turns)

| Measure | Switchboard (speech) | Topical-Chat (text) |
|---|---|---|
| Turns / conversations | 119,364 / 1,155 | 235,261 / 10,784 |
| Turns per conversation (median) | 94 (five-minute calls) | 21 |
| Turns with a question: gold dialogue-act tags | **8.0%** (7.8–8.2%) | — |
| Turns with a question: rule | 8.5% (8.3–8.7%) | **32.7%** (32.6–32.9%) |
| Turns with a question, substantive turns only | **11.0%** (gold) | 33.1% (turns >3 words) |
| Turns with a question: LLM, in the 1,500-turn sample | 9.5% (8.1–11.1%) | 35.3% (33.0–37.8%) |
| Per speaker in a conversation (≥5 substantive turns): median question rate | 9.1% | 30.0% |
| Same, 10th–90th percentile | 0%–26% | 9%–58% |
| Speakers who ask in more than 50% of their turns | **0.6%** | **16%** |
| P(question, given own previous turn had one) | 29% | 35% |
| P(question, given own previous turn had none) | 8% | 26% |
| Three own turns in a row all with a question | **1.1%** of windows | **5.2%** of windows |
| Words per turn, mean / median (all turns) | 12.3 / 6 | 19.6 / 18 |
| Words per turn, interquartile range | 2–16 | 12–25 |
| Words per turn, substantive turns, mean / median | 17.7 / 12 | 19.9 / 18 |
| Very short turns (≤3 words) | **39.4%** (39.1–39.7%) | **1.3%** (1.3–1.4%) |
| Pure backchannel turns (dialogue-act tags) | 34.1% | — |

Median words by main move (LLM sample):

| Corpus | question_followup | question_new | answer | self_disclosure | opinion | reaction |
|---|---|---|---|---|---|---|
| Switchboard | 5 | 9 | 8 | 19.5 | 15 | 2 |
| Topical-Chat | 12 | 14 | 15 | 22 | 21 | 18 |

Text-chat "reactions" are usually a reaction plus a comment.

Checks on the labels:
- **Switchboard, has_question.** The LLM agrees with the gold dialogue-act question tags on 95.4% of sampled turns.
- **Switchboard, question moves.** An LLM question move (primary or secondary) agrees with the gold question tag on 96.0% of turns.
- **Switchboard, backchannels.** Of the 524 gold backchannel turns in the sample, 87% were labelled reaction. The rest were mostly labelled other, opinion or answer.
- **Topical-Chat.** The LLM's has_question agrees with the rule on 90.8% of turns. The LLM finds more questions, for example "Can you believe…" without a "?".

## 5. Published reference figures

**CANDOR** (Reece et al. 2023; figures read from the paper):
- **Words per turn by turn model:**
  - "Audiophile" turns (split at every change of speaker): mean 6.4 words, median 2. About 441 turns per conversation.
  - "Cliffhanger" turns (split at the end of sentences): mean 17.8, median 9. About 159 turns per conversation.
  - Switchboard's 12.3 / 6 falls between the two.
- **Backchannels:**
  - 33.7% of speaker turns get at least one listener backchannel, rising to 65.5% for turns of five words or more.
  - About 1,000 backchannel words per hour.
  - "yeah" alone is about 40% of backchannels.
- **Enjoyment measure:** "how much they enjoyed the conversation", 1–9 scale. The paper gives no mean or SD. A secondary analysis (arXiv 2604.15322) reports a heavy positive skew, with 28.5% giving the maximum.
- **Enjoyment correlates reported:**
  - Shorter gaps before your turn go with higher *partner* enjoyment: b = −0.73 per second of mean gap, P < 0.001. The effect comes from long gaps.
  - Longer Cliffhanger turns go with slightly more *own* enjoyment: b = 0.06, P < 0.001.
- **"Good conversationalists"** (top vs bottom quartile of partner rating) talk slightly faster. They mix new and on-topic content, and nod and smile more while listening.
- **What the paper does not report:** question rates, or any link between questions and liking. So there is no published CANDOR question baseline.

**Stolcke et al. 2000** (Switchboard dialogue-act frequencies, per utterance unit, not per turn):

| Act | Share of utterance units |
|---|---|
| Statement (non-opinion) | 36% |
| Backchannel/acknowledge | 19% |
| Opinion | 13% |
| Abandoned/uninterpretable | 6% |
| Agree/accept | 5% |
| Appreciation | 2% |
| Yes-no question | 2% |
| Yes answers | 1% |
| Conventional closing | 1% |
| Wh-question | 1% |
| No answers | 1% |
| Declarative yes-no question | 1% |
| Backchannel question | 1% |
| Open question | 0.3% |
| Rhetorical question | 0.2% |

All question types together are about 5–6% of utterance units. That fits our 8% of *turns*, because a turn can hold several units.

Related literature, not re-checked here: Huang et al. 2017 (*JPSP*, "It doesn't hurt to ask") found in get-to-know-you chats and speed dates that asking more questions, *follow-up* questions especially, raises how much the partner likes you. In both of our corpora, follow-ups are rare, at about 2% of turns as the main move.

## 6. Move mix vs rated conversation quality (Topical-Chat only)

Switchboard has no enjoyment ratings, and CANDOR could not be used. The proxy is Topical-Chat's self-rated conversation quality.

Each conversation's score is the mean of both partners' ratings: Excellent = 5, Good = 4, Passable = 3, Not Good = 2, Poor = 1. Distribution: 5.0 in 31%, 4.5 in 43%, 4.0 in 21%, 3.5 or below in 5%. Because so many ratings are tied, the "quartiles" are:
- **top:** both partners said Excellent (5.0), 3,299 conversations (31%);
- **bottom:** mean 4.0 or lower, 2,829 conversations (26%).

**All conversations, rule-based** (conversation-level means; 95% CI from 500 resamples of whole conversations):

| Measure | Top | Bottom | Difference (95% CI) |
|---|---|---|---|
| Share of turns with a question | 34.3% | 31.1% | **+3.2 pp** (+2.6 to +3.9) |
| Mean words per turn | 18.3 | 20.3 | **−1.9** (−2.2 to −1.7) |
| Share of turns ≤3 words | 1.3% | 1.4% | −0.1 pp (−0.3 to 0.0) |

**Mean rating by share of turns with a question** (all 10,784 conversations):

| Question share | Conversations | Mean rating | Share rated top |
|---|---|---|---|
| 0–10% | 511 | 4.40 | 22% |
| 10–20% | 1,589 | 4.45 | 26% |
| 20–30% | 2,654 | 4.47 | 29% |
| 30–40% | 2,815 | 4.50 | 32% |
| 40–50% | 1,986 | 4.55 | 35% |
| 50–60% | 968 | 4.54 | 33% |
| 60–100% | 260 | 4.56 | 35% |

The benefit flattens at about 40–50%. Chats with very few questions are rated lowest.

**LLM move mix, top vs bottom** (sampled turns: top n = 456, bottom n = 381):

| Measure | Top | Bottom | Difference (pp, ±95%) |
|---|---|---|---|
| Any question move (primary) | 17.8% | 16.8% | +1.0 (±5.1) |
| Question move (primary or secondary) | 30.9% | 28.6% | +2.3 (±6.2) |
| question_followup | 1.3% | 0.8% | +0.5 (±1.4) |
| question_new | 16.4% | 16.0% | +0.4 (±5.0) |
| answer | 10.1% | 7.3% | +2.7 (±3.8) |
| self_disclosure | 24.6% | 23.9% | +0.7 (±5.8) |
| opinion | 26.8% | 30.2% | −3.4 (±6.1) |
| **reaction** | 11.0% | 15.5% | **−4.5 (±4.6)**, borderline |
| tease_joke | 1.8% | 1.3% | +0.4 (±1.7) |
| guess_about_partner | 0.2% | 1.0% | −0.8 (±1.1) |
| callback | 0.7% | 0.0% | +0.7 (±0.7) |
| **closing** | 7.0% | 3.1% | **+3.9 (±2.9)** |

Partner's turn rating by main move (1–5):
- self_disclosure 4.48, opinion 4.45, answer 4.43, closing 4.45, question_followup 4.40;
- question_new 4.32 and reaction 4.29 are the lowest of the common moves.

**What it shows:**
- In text, chats with a few more questions and slightly shorter messages are rated a bit better.
- The best-rated chats lean less on bare reactions, and more often end with a proper goodbye. A proper ending is likely a marker of a chat that went well, not a cause.
- None of these is a big effect, and the ratings sit near the ceiling.

## 7. Hand-check of 50 LLM labels

Random sample, seed 7: 25 Switchboard and 25 Topical-Chat turns. The text is in `scratchpad/candor_labels/handcheck.txt`. I checked each one myself.

| | Primary move agrees | has_question agrees |
|---|---|---|
| Switchboard | 19/25 (76%) | 25/25 |
| Topical-Chat | 19/25 (76%) | 24/25 |
| **Total** | **38/50 (76%)** | **49/50 (98%)** |

The 12 disagreements fall into clear patterns:
1. **Under-use of `answer`** (4 cases). When an answer also gives personal detail, the model picks self_disclosure ("Hello, I use Amazon all the time…" after "do you shop on Amazon?"). The prompt's rule says to use answer here. **Effect:** answer is undercounted and self_disclosure overcounted, by perhaps a few points.
2. **Speech fragments labelled `reaction`** ("you know,", "Well,", the second half of a split sentence) when they should be other, or the continued move (3 cases). This is a speech-only problem; it inflates reaction slightly in Switchboard.
3. **One-off mistakes:**
   - an answer phrased as a question ("Wasn't it done first by ESPN?") labelled guess_about_partner;
   - a fact continuation labelled answer;
   - a spoken topic statement ("and lawn care?") labelled question_new;
   - one missed rhetorical "Can you believe…?" (the has_question miss).

Question detection is reliable: 98% hand-check agreement and about 95% agreement with Switchboard's gold tags. The finer split between answer and self_disclosure is the weakest part. **For comparisons with our own chats, use the same prompt and model, so this bias is the same on both sides.** If you need a single safer number, combine "answer + self_disclosure".

## 8. Limitations

- **Not CANDOR.** Switchboard calls are 5 minutes long, on an assigned topic (child care, crime…), between US adults in 1990–91. They are not open "get to know you" chats.
  - Topical-Chat workers were paid to discuss reading material, so "did you know…?" fact-sharing inflates question_new and opinion.
  - Neither corpus is flirty or parasocial like a Fanvue chat.
- **Speech is not texting.**
  - Speech has many backchannel turns (39% of turns are ≤3 words), which barely exist in text (1.3%).
  - Texts are longer, and each message bundles a reaction with content and a question.
  - For a Fanvue-style chat, **Topical-Chat is the closer format**, and Switchboard's substantive-turn numbers are the closer *spoken* reference.
- **The taxonomy has no slot for "shares a fact about the world"** (very common in Topical-Chat). Such turns fall into opinion, self_disclosure or reaction. This is deliberate, to keep the shared taxonomy unchanged, but it blurs those three.
- **callback is undercounted by design.** The labeller sees only 3 previous turns, so it cannot see "much earlier".
- **The "enjoyment" measure is weak.** It is Topical-Chat's quality rating, which is heavily skewed (74% of conversations at 4.5 or 5). Switchboard has none, and CANDOR's 1–9 enjoyment scale was not available.
- **The top-vs-bottom LLM comparison uses about 400 turns per group**, so only differences above about 5 points can be detected.
- **One LLM labeller** (Mistral Small) with 76% primary-move agreement on a 50-item hand-check. Each item had a single human checker, so no inter-rater reliability was measured.
- Wilson intervals ignore clustering of turns within conversations. With 1,500 turns spread over about 1,000 conversations, the effect is small.
- **Switchboard is CC BY-NC-SA**: use these rates only as internal reference figures.

## 9. Exact labelling prompt (reuse as is)

Model: `mistralai/mistral-small-2603` via OpenRouter. Settings: `temperature: 0`, `seed: 7`, `max_tokens: 120`, `reasoning: {enabled: false}`, and the structured `response_format` below.

Context: the previous 3 turns. Each context line starts with `TARGET SPEAKER:` or `PARTNER:` depending on who said it.

**System message:**

```text
You label "reply moves" in two-person casual conversations (spoken transcripts or text chats).
You will see up to 3 previous turns as context, then the TARGET turn. Label ONLY the TARGET turn.

Choose ONE primary move (what the turn mainly does) and optionally ONE secondary move (another clear move in the same turn, else "none").

Moves:
- question_followup: asks about something the partner just said (e.g. "Oh, where did you go?" after the partner mentions a trip).
- question_new: asks a question that opens a new topic or turns the topic to the partner, incl. "what about you?" / "wbu" / "and you?".
- answer: directly answers the partner's question (including short yes/no answers).
- self_disclosure: shares own experience, day, story, plans, facts about oneself or feelings (not a direct answer to a question).
- opinion: states a view, preference, judgement, evaluation of a topic, or mild disagreement.
- reaction: short acknowledgement/backchannel/laughter/agreement with no new content ("haha", "oh nice", "yeah", "uh-huh", "right", "omg", "really?", "that's cool").
- tease_joke: playful teasing or humour.
- compliment: praise of the partner.
- empathy: sympathy or support for the partner's feelings or situation.
- guess_about_partner: statement or assumption about the partner ("you seem like a night owl", "you must be busy").
- callback: refers back to something said much earlier in the conversation (not in the last few turns).
- closing: wrapping up, goodbye, "nice talking to you".
- other: anything else (greetings, fragments, unintelligible, meta talk about the task or recording).

Rules:
- If a turn both answers a question and adds own experience, primary = answer, secondary = self_disclosure.
- A reaction word followed by real content is labelled by the content (secondary may be reaction).
- A one-word echo question like "Really?" or "Oh yeah?" is a reaction.
- A turn that asks something counts as a question move (primary or secondary) whenever the question is a real request for information from the partner.
- Ignore disfluencies, fillers (uh, um), false starts and transcription marks. A fragment with no content (only fillers or a cut-off word) is other.
- has_question = true if the TARGET turn contains any question at all (including rhetorical, tag, or echo questions), else false.

Return JSON only: {"primary": "<move>", "secondary": "<move or none>", "has_question": true|false}
```

**User message template:**

```text
Previous turns:
{TARGET SPEAKER|PARTNER}: {text}
{TARGET SPEAKER|PARTNER}: {text}
{TARGET SPEAKER|PARTNER}: {text}

TARGET turn (TARGET SPEAKER):
{text}
```

If there is no earlier turn, the context reads `(start of conversation)`.

**Structured output (`response_format`):**

```json
{"type": "json_schema", "json_schema": {"name": "move", "strict": true, "schema": {
  "type": "object", "additionalProperties": false,
  "properties": {
    "primary": {"type": "string", "enum": ["question_followup","question_new","answer","self_disclosure","opinion","reaction","tease_joke","compliment","empathy","guess_about_partner","callback","closing","other"]},
    "secondary": {"type": "string", "enum": ["question_followup","question_new","answer","self_disclosure","opinion","reaction","tease_joke","compliment","empathy","guess_about_partner","callback","closing","other","none"]},
    "has_question": {"type": "boolean"}},
  "required": ["primary","secondary","has_question"]}}}
```

Rule-based `has_question` and word count, to apply to our chats in the same way, are in `prep.py` below (`has_question_rule`, `nwords`).

## 10. Files and scripts

Working files (scratchpad, not in git):
- data: `/private/tmp/claude-501/-Users-alexeygrygoriev-Documents-GitHub-chatting-management-tool/d84d9195-95d0-48f1-b9f1-164eb40e0049/scratchpad/candor_data/`
- scripts: `.../scratchpad/candor_scripts/` (`prep.py`, `label.py`, `analyze.py`, `extra_stats.py`)
- turn table: `.../scratchpad/candor_work/turns.jsonl`
- labels: `.../scratchpad/candor_labels/switchboard.labels.jsonl` and `topical.labels.jsonl`
- generated report: `.../scratchpad/candor_labels/report.md`
- hand-check sample: `.../scratchpad/candor_labels/handcheck.txt`

Commands as run:

```bash
python3 -I prep.py <candor_data> <candor_work>
python3 -I label.py <candor_work>/turns.jsonl switchboard 1500 42 <candor_labels>/switchboard.labels.jsonl <server/.env> mistralai/mistral-small-2603 3.0 8
python3 -I label.py <candor_work>/turns.jsonl topical     1500 42 <candor_labels>/topical.labels.jsonl     <server/.env> mistralai/mistral-small-2603 3.0 8
# 429 rate-limit errors removed from the label files, then label.py re-run with 2 workers (it resumes and skips ids already done)
python3 -I analyze.py <candor_work> <candor_labels>
python3 -I extra_stats.py <candor_work>/turns.jsonl
```

Sources:
- [ConvoKit CANDOR page](https://convokit.cornell.edu/documentation/candor.html)
- [BetterUp CANDOR page](https://www.betterup.com/research/candor-research)
- [BetterUp data request portal](https://betterup-data-requests.herokuapp.com/)
- [Reece et al. 2023, PMC10065445](https://pmc.ncbi.nlm.nih.gov/articles/PMC10065445)
- [TalkBank CANDOR access](https://talkbank.org/ca/access/CANDOR.html)
- [ConvoKit Switchboard page](https://convokit.cornell.edu/documentation/switchboard.html)
- [Topical-Chat repository](https://github.com/alexa/Topical-Chat)
- [Stolcke et al. 2000 (ar5iv)](https://ar5iv.labs.arxiv.org/html/cs/0006023)
- [Secondary analysis of CANDOR enjoyment ratings (arXiv 2604.15322)](https://arxiv.org/pdf/2604.15322)

### Script texts

#### prep.py

```python
"""Build turn tables from Switchboard (ConvoKit SwDA) and Topical-Chat, plus rule-based stats.

Usage: python3 -I prep.py <data_dir> <work_dir>
Reads only JSON data; runs no code shipped with the data.
"""
import json, re, sys, os, collections, statistics, math

DATA, WORK = sys.argv[1], sys.argv[2]
os.makedirs(WORK, exist_ok=True)

# ---------- shared rule-based helpers ----------
INTERROG = re.compile(
    r"^(?:so |and |but |well |oh |okay |ok |um |uh |like )*"
    r"(?:what|what's|whats|who|who's|whom|whose|where|where's|when|why|how|how's|which|"
    r"do|does|did|don't|doesn't|didn't|are|aren't|is|isn't|was|wasn't|were|weren't|"
    r"have|haven't|has|hasn't|had|can|can't|could|couldn't|will|won't|would|wouldn't|"
    r"should|shouldn't|shall|may|might|am)\s+(?:you|u|ya|your|we|they|he|she|it|there|that|this|i|anyone|anybody|people)\b",
    re.I)
WBU = re.compile(r"\b(what about you|how about you|and you|wbu|hbu|you\?)", re.I)

def sentences(t):
    return [s.strip() for s in re.split(r"(?<=[.!?])\s+|\n+", t) if s.strip()]

def has_question_rule(t):
    if "?" in t:
        return True
    if WBU.search(t):
        return True
    return any(INTERROG.match(s) for s in sentences(t))

WORD = re.compile(r"[A-Za-z0-9']+")
def nwords(t):
    return len(WORD.findall(t))

# ---------- Switchboard ----------
def clean_swb(t):
    t = re.sub(r"<+\s*laughter\s*>+", " (laughs) ", t, flags=re.I)
    t = re.sub(r"<+[^<>]*>+", " ", t)              # other non-verbal / noise
    t = re.sub(r"\{[A-Z]\s*", "", t)                # {F uh,} {D so,} -> keep words
    t = t.replace("}", "")
    t = re.sub(r"\(\((.*?)\)\)", r"\1", t)           # ((uncertain)) -> words
    t = re.sub(r"[\[\]\+#]", " ", t)                 # repair brackets, continuation, overlap
    t = re.sub(r"-*/", " ", t)                       # slash-unit boundaries
    t = re.sub(r"\s+([,.?!])", r"\1", t)
    t = re.sub(r"\s+", " ", t).strip()
    t = re.sub(r"^[,.\s]+", "", t)
    return t

GOLD_Q = re.compile(r"^(q[a-z]*|bh)|\^g|\^d")
DAMAP = [  # crude crosswalk from SWBD-DAMSL base tags to the shared taxonomy
    (re.compile(r"^(qy|qw|qo|qr|qrr|qh|bh)"), "question"),
    (re.compile(r"^(ny|nn|na|ng|no|nd|arp|aap)"), "answer"),
    (re.compile(r"^(b|bk|ba|aa|bf|br|bd|b\^m)$|^(b|bk|ba|aa)\^"), "reaction"),
    (re.compile(r"^sv"), "opinion"),
    (re.compile(r"^sd"), "statement_non_opinion"),
    (re.compile(r"^(fc)"), "closing"),
    (re.compile(r"^(fp)"), "opening"),
]

def swb():
    convs = json.load(open(os.path.join(DATA, "swb/switchboard-corpus/conversations.json")))
    turns = []
    for line in open(os.path.join(DATA, "swb/switchboard-corpus/utterances.jsonl")):
        u = json.loads(line)
        segs = u["meta"]["tag"]
        tags = [tg for _, tg in segs]
        text = clean_swb(u["text"])
        turns.append({
            "corpus": "switchboard", "conv": u["conversation_id"], "id": u["id"],
            "speaker": u["speaker"], "text": text, "tags": tags,
            "gold_q": any(GOLD_Q.search(tg) for tg in tags),
        })
    # order within conversation by numeric suffix
    turns.sort(key=lambda x: (x["conv"], int(x["id"].split("-")[1])))
    return turns, convs

# ---------- Topical-Chat ----------
RATING = {"Excellent": 5, "Good": 4, "Passable": 3, "Not Good": 2, "Poor": 1}
def topical():
    turns, convs = [], {}
    for f in ["train", "valid_freq", "valid_rare", "test_freq", "test_rare"]:
        d = json.load(open(os.path.join(DATA, f"topical/{f}.json")))
        for cid, c in d.items():
            rs = [RATING[v] for v in c["conversation_rating"].values() if v in RATING]
            convs[cid] = {"split": f, "rating_mean": sum(rs) / len(rs) if rs else None,
                          "ratings": c["conversation_rating"]}
            for i, m in enumerate(c["content"]):
                turns.append({"corpus": "topical", "conv": cid, "id": f"{cid}-{i}",
                              "speaker": m["agent"], "text": m["message"].strip(),
                              "turn_rating": RATING.get(m["turn_rating"]),
                              "sentiment": m["sentiment"]})
    return turns, convs

def ci95(k, n):  # Wilson interval
    if n == 0:
        return (0, 0)
    p, z = k / n, 1.96
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return (c - h, c + h)

def basic_stats(turns, name):
    wc = [t["wc"] for t in turns]
    n = len(turns)
    q = sum(t["hasq_rule"] for t in turns)
    short = sum(1 for w in wc if w <= 3)
    s = {"corpus": name, "turns": n, "convs": len({t["conv"] for t in turns}),
         "words_mean": statistics.mean(wc), "words_median": statistics.median(wc),
         "words_p25": statistics.quantiles(wc, n=4)[0], "words_p75": statistics.quantiles(wc, n=4)[2],
         "hasq_rule": q / n, "hasq_rule_ci": ci95(q, n),
         "short_le3": short / n, "short_le3_ci": ci95(short, n),
         "turns_per_conv_median": statistics.median(collections.Counter(t["conv"] for t in turns).values())}
    return s

def main():
    out = {}
    st, sconv = swb()
    for t in st:
        t["wc"] = nwords(t["text"].replace("(laughs)", ""))
        t["hasq_rule"] = has_question_rule(t["text"])
    # drop empty turns (pure noise) from stats but keep for context
    st_nonempty = [t for t in st if t["wc"] > 0]
    s = basic_stats(st_nonempty, "switchboard")
    gq = sum(t["gold_q"] for t in st_nonempty)
    s["hasq_gold_da"] = gq / len(st_nonempty); s["hasq_gold_da_ci"] = ci95(gq, len(st_nonempty))
    s["empty_turns_dropped"] = len(st) - len(st_nonempty)
    # rule vs gold agreement
    tp = sum(1 for t in st_nonempty if t["gold_q"] and t["hasq_rule"])
    s["rule_vs_gold_precision"] = tp / max(1, sum(t["hasq_rule"] for t in st_nonempty))
    s["rule_vs_gold_recall"] = tp / max(1, gq)
    # DA crosswalk: share of turns containing each mapped act (any segment), and "main" act = longest segment
    cnt_any = collections.Counter(); cnt_main = collections.Counter()
    for t in st_nonempty:
        mapped = set()
        for tg in t["tags"]:
            for rx, lab in DAMAP:
                if rx.search(tg):
                    mapped.add(lab); break
        for m in mapped:
            cnt_any[m] += 1
    s["da_any_share"] = {k: v / len(st_nonempty) for k, v in cnt_any.most_common()}
    # pure-backchannel turns: all segments are b/bk/ba/aa/% and <=3 words
    pure_bc = sum(1 for t in st_nonempty if all(re.match(r"^(b|bk|ba|aa|bh|%|x|\+)", tg) for tg in t["tags"]) and t["wc"] <= 3)
    s["pure_backchannel_turn_share"] = pure_bc / len(st_nonempty)
    out["switchboard"] = s

    tt, tconv = topical()
    for t in tt:
        t["wc"] = nwords(t["text"])
        t["hasq_rule"] = has_question_rule(t["text"])
    tt = [t for t in tt if t["wc"] > 0]
    out["topical"] = basic_stats(tt, "topical")

    # Topical-Chat: per-conversation question share vs rating, on ALL conversations
    by = collections.defaultdict(list)
    for t in tt:
        by[t["conv"]].append(t)
    rows = []
    for cid, ts in by.items():
        r = tconv[cid]["rating_mean"]
        if r is None:
            continue
        rows.append((r, sum(x["hasq_rule"] for x in ts) / len(ts), statistics.mean(x["wc"] for x in ts),
                     sum(1 for x in ts if x["wc"] <= 3) / len(ts)))
    rs = sorted(r[0] for r in rows)
    q1, q3 = statistics.quantiles(rs, n=4)[0], statistics.quantiles(rs, n=4)[2]
    out["topical_rating_dist"] = dict(collections.Counter(rs))
    out["topical_rating_q1_q3"] = (q1, q3)
    json.dump({k: v for k, v in tconv.items()}, open(os.path.join(WORK, "topical_convs.json"), "w"))
    json.dump(sconv, open(os.path.join(WORK, "swb_convs.json"), "w"))

    with open(os.path.join(WORK, "turns.jsonl"), "w") as f:
        for t in st + tt:
            f.write(json.dumps(t) + "\n")
    json.dump(out, open(os.path.join(WORK, "rule_stats.json"), "w"), indent=1)
    print(json.dumps(out, indent=1))

main()
```

#### label.py

```python
"""LLM reply-move labelling with the shared taxonomy.

Usage: python3 -I label.py <turns.jsonl> <corpus> <n> <seed> <out.jsonl> <env_file> <model> <budget_usd> [workers]
Resumable: skips ids already in out.jsonl. Stops when cumulative cost (all *.labels.jsonl in out dir) >= budget.
"""
import json, sys, os, random, urllib.request, time, threading, glob
from concurrent.futures import ThreadPoolExecutor

TURNS, CORPUS, N, SEED, OUT, ENV, MODEL, BUDGET = sys.argv[1:9]
N, SEED, BUDGET = int(N), int(SEED), float(BUDGET)
WORKERS = int(sys.argv[9]) if len(sys.argv) > 9 else 8

MOVES = ["question_followup", "question_new", "answer", "self_disclosure", "opinion", "reaction",
         "tease_joke", "compliment", "empathy", "guess_about_partner", "callback", "closing", "other"]

SYSTEM_PROMPT = """You label "reply moves" in two-person casual conversations (spoken transcripts or text chats).
You will see up to 3 previous turns as context, then the TARGET turn. Label ONLY the TARGET turn.

Choose ONE primary move (what the turn mainly does) and optionally ONE secondary move (another clear move in the same turn, else "none").

Moves:
- question_followup: asks about something the partner just said (e.g. "Oh, where did you go?" after the partner mentions a trip).
- question_new: asks a question that opens a new topic or turns the topic to the partner, incl. "what about you?" / "wbu" / "and you?".
- answer: directly answers the partner's question (including short yes/no answers).
- self_disclosure: shares own experience, day, story, plans, facts about oneself or feelings (not a direct answer to a question).
- opinion: states a view, preference, judgement, evaluation of a topic, or mild disagreement.
- reaction: short acknowledgement/backchannel/laughter/agreement with no new content ("haha", "oh nice", "yeah", "uh-huh", "right", "omg", "really?", "that's cool").
- tease_joke: playful teasing or humour.
- compliment: praise of the partner.
- empathy: sympathy or support for the partner's feelings or situation.
- guess_about_partner: statement or assumption about the partner ("you seem like a night owl", "you must be busy").
- callback: refers back to something said much earlier in the conversation (not in the last few turns).
- closing: wrapping up, goodbye, "nice talking to you".
- other: anything else (greetings, fragments, unintelligible, meta talk about the task or recording).

Rules:
- If a turn both answers a question and adds own experience, primary = answer, secondary = self_disclosure.
- A reaction word followed by real content is labelled by the content (secondary may be reaction).
- A one-word echo question like "Really?" or "Oh yeah?" is a reaction.
- A turn that asks something counts as a question move (primary or secondary) whenever the question is a real request for information from the partner.
- Ignore disfluencies, fillers (uh, um), false starts and transcription marks. A fragment with no content (only fillers or a cut-off word) is other.
- has_question = true if the TARGET turn contains any question at all (including rhetorical, tag, or echo questions), else false.

Return JSON only: {"primary": "<move>", "secondary": "<move or none>", "has_question": true|false}"""

def user_prompt(ctx, target):
    lines = []
    for t in ctx:
        who = "TARGET SPEAKER" if t["speaker"] == target["speaker"] else "PARTNER"
        lines.append(f"{who}: {t['text']}")
    c = "\n".join(lines) if lines else "(start of conversation)"
    return f"Previous turns:\n{c}\n\nTARGET turn (TARGET SPEAKER):\n{target['text']}"

SCHEMA = {"type": "json_schema", "json_schema": {"name": "move", "strict": True, "schema": {
    "type": "object", "additionalProperties": False,
    "properties": {"primary": {"type": "string", "enum": MOVES},
                   "secondary": {"type": "string", "enum": MOVES + ["none"]},
                   "has_question": {"type": "boolean"}},
    "required": ["primary", "secondary", "has_question"]}}}

def key():
    for line in open(ENV):
        if line.startswith("OPENROUTER_API_KEY="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit("no key")

KEY = key()
lock = threading.Lock()

def spent():
    tot = 0.0
    for f in glob.glob(os.path.join(os.path.dirname(OUT) or ".", "*.labels.jsonl")):
        for l in open(f):
            tot += json.loads(l).get("cost", 0) or 0
    return tot

def call(msgs):
    body = {"model": MODEL, "messages": msgs, "temperature": 0, "max_tokens": 120,
            "response_format": SCHEMA, "usage": {"include": True}, "seed": 7,
            "reasoning": {"enabled": False}}
    for attempt in range(4):
        try:
            req = urllib.request.Request("https://openrouter.ai/api/v1/chat/completions",
                                         data=json.dumps(body).encode(),
                                         headers={"Authorization": "Bearer " + KEY, "Content-Type": "application/json"})
            r = json.load(urllib.request.urlopen(req, timeout=60))
            return r
        except Exception as e:
            err = str(e)
            time.sleep(2 * (attempt + 1))
    return {"error": err}

def main():
    turns = [json.loads(l) for l in open(TURNS)]
    turns = [t for t in turns if t["corpus"] == CORPUS]
    byconv = {}
    for t in turns:
        byconv.setdefault(t["conv"], []).append(t)
    idx = []
    for cid, ts in byconv.items():
        for i, t in enumerate(ts):
            if t["wc"] > 0:
                idx.append((cid, i))
    idx.sort()
    rnd = random.Random(SEED)
    sample = rnd.sample(idx, N)
    done = set()
    if os.path.exists(OUT):
        done = {json.loads(l)["id"] for l in open(OUT)}
    start_spent = spent()
    print("already spent", round(start_spent, 4), "done", len(done), flush=True)
    cost = [start_spent]
    fout = open(OUT, "a")

    def work(item):
        cid, i = item
        ts = byconv[cid]
        t = ts[i]
        if t["id"] in done:
            return
        with lock:
            if cost[0] >= BUDGET:
                return
        ctx = [x for x in ts[max(0, i - 3):i]]
        msgs = [{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": user_prompt(ctx, t)}]
        r = call(msgs)
        rec = {"id": t["id"], "conv": cid, "corpus": CORPUS, "text": t["text"], "wc": t["wc"],
               "hasq_rule": t["hasq_rule"], "gold_q": t.get("gold_q"), "tags": t.get("tags"),
               "turn_rating": t.get("turn_rating"), "context": [[x["speaker"] == t["speaker"], x["text"]] for x in ctx]}
        if "error" in r:
            rec["error"] = r["error"]
        else:
            try:
                rec["label"] = json.loads(r["choices"][0]["message"]["content"])
            except Exception as e:
                rec["error"] = "parse: " + str(r)[:300]
            u = r.get("usage") or {}
            # BYOK accounts report cost=0; the real spend is the upstream inference cost.
            up = (u.get("cost_details") or {}).get("upstream_inference_cost")
            est = u.get("prompt_tokens", 0) * 0.15e-6 + u.get("completion_tokens", 0) * 0.6e-6
            rec["cost"] = max(u.get("cost", 0) or 0, up or 0, est)
            rec["tokens"] = [u.get("prompt_tokens"), u.get("completion_tokens")]
            rec["model_used"] = r.get("model")
        with lock:
            cost[0] += rec.get("cost", 0) or 0
            fout.write(json.dumps(rec) + "\n"); fout.flush()

    with ThreadPoolExecutor(WORKERS) as ex:
        list(ex.map(work, sample))
    print("total spent", round(cost[0], 4))

main()
```

#### analyze.py

```python
"""Summarise LLM labels + rule-based stats.

Usage: python3 -I analyze.py <work_dir> <labels_dir>
"""
import json, sys, os, collections, math, random, statistics

WORK, LAB = sys.argv[1], sys.argv[2]
MOVES = ["question_followup", "question_new", "answer", "self_disclosure", "opinion", "reaction",
         "tease_joke", "compliment", "empathy", "guess_about_partner", "callback", "closing", "other"]
QM = {"question_followup", "question_new"}

def ci(k, n):
    if n == 0:
        return (0, 0)
    p, z = k / n, 1.96
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return (c - h, c + h)

def pct(x):
    return f"{100*x:.1f}%"

def fmt(k, n):
    lo, hi = ci(k, n)
    return f"{k} | {pct(k/n)} | {pct(lo)}–{pct(hi)}"

def load(name):
    rs = [json.loads(l) for l in open(os.path.join(LAB, f"{name}.labels.jsonl"))]
    ok = [r for r in rs if "label" in r]
    return rs, ok

def table(recs, title):
    n = len(recs)
    out = [f"\n#### {title} (n = {n} turns)\n",
           "| Move | Primary: count | share | 95% CI | Primary or secondary: share |",
           "|---|---|---|---|---|"]
    prim = collections.Counter(r["label"]["primary"] for r in recs)
    anym = collections.Counter()
    for r in recs:
        for m in {r["label"]["primary"], r["label"]["secondary"]} - {"none"}:
            anym[m] += 1
    for m in MOVES:
        out.append(f"| {m} | {fmt(prim[m], n)} | {pct(anym[m]/n)} |")
    q = sum(1 for r in recs if r["label"]["primary"] in QM)
    qa = sum(1 for r in recs if ({r["label"]["primary"], r["label"]["secondary"]} & QM))
    out.append(f"| **any question move (primary)** | {fmt(q, n)} | {pct(qa/n)} |")
    return "\n".join(out), prim, anym

def stats_block(recs):
    n = len(recs)
    hq_llm = sum(r["label"]["has_question"] for r in recs)
    hq_rule = sum(r["hasq_rule"] for r in recs)
    lines = [f"- has_question (LLM): {fmt(hq_llm, n)}",
             f"- has_question (rule: '?' or interrogative opener): {fmt(hq_rule, n)}",
             f"- LLM vs rule agreement on has_question: {pct(sum(r['label']['has_question']==r['hasq_rule'] for r in recs)/n)}"]
    if recs and recs[0].get("gold_q") is not None:
        g = sum(bool(r["gold_q"]) for r in recs)
        lines.append(f"- has_question (gold SWBD-DAMSL question tags): {fmt(g, n)}")
        lines.append(f"- LLM vs gold agreement on has_question: {pct(sum(r['label']['has_question']==bool(r['gold_q']) for r in recs)/n)}")
    wc = [r["wc"] for r in recs]
    lines.append(f"- words per turn in sample: mean {statistics.mean(wc):.1f}, median {statistics.median(wc)}")
    bym = collections.defaultdict(list)
    for r in recs:
        bym[r["label"]["primary"]].append(r["wc"])
    lines.append("- median words by primary move: " + ", ".join(
        f"{m} {statistics.median(bym[m])}" for m in MOVES if bym[m]))
    return "\n".join(lines)

def compare(top, bot, title):
    out = [f"\n#### {title}\n", f"Top group n = {len(top)} turns; bottom group n = {len(bot)} turns.\n",
           "| Measure | Top: share (95% CI) | Bottom: share (95% CI) | Difference (top − bottom, pp) |",
           "|---|---|---|---|"]
    def row(name, f):
        kt, kb = sum(1 for r in top if f(r)), sum(1 for r in bot if f(r))
        pt, pb = kt / len(top), kb / len(bot)
        se = math.sqrt(pt * (1 - pt) / len(top) + pb * (1 - pb) / len(bot))
        lt, ht = ci(kt, len(top)); lb, hb = ci(kb, len(bot))
        out.append(f"| {name} | {pct(pt)} ({pct(lt)}–{pct(ht)}) | {pct(pb)} ({pct(lb)}–{pct(hb)}) | "
                   f"{100*(pt-pb):+.1f} (±{100*1.96*se:.1f}) |")
    row("any question move (primary)", lambda r: r["label"]["primary"] in QM)
    row("question move (primary or secondary)", lambda r: bool({r["label"]["primary"], r["label"]["secondary"]} & QM))
    row("has_question (LLM)", lambda r: r["label"]["has_question"])
    for m in MOVES:
        row(f"primary = {m}", lambda r, m=m: r["label"]["primary"] == m)
    return "\n".join(out)

def main():
    rep = []
    tconv = json.load(open(os.path.join(WORK, "topical_convs.json")))
    spend = 0
    for name in ["switchboard", "topical"]:
        rs, ok = load(name)
        spend += sum(r.get("cost", 0) or 0 for r in rs)
        rep.append(f"\n### {name}: {len(ok)} labelled, {len(rs)-len(ok)} errors")
        t, prim, anym = table(ok, f"{name} — all sampled turns")
        rep.append(t)
        sub = [r for r in ok if not (r["label"]["primary"] in ("reaction", "other") and r["wc"] <= 3)]
        t2, _, _ = table(sub, f"{name} — substantive turns only (drops reaction/other turns of ≤3 words)")
        rep.append(t2)
        rep.append("\n" + stats_block(ok))
        if name == "switchboard":
            # LLM primary vs DA crosswalk for reactions / questions
            def da_main(tags):
                s = " ".join(tags)
                return s
            agree_q = sum(1 for r in ok if (r["label"]["primary"] in QM or r["label"]["secondary"] in QM) == bool(r["gold_q"]))
            rep.append(f"- LLM question move (primary or secondary) vs gold DA question tag agreement: {pct(agree_q/len(ok))}")
            bc = [r for r in ok if all(tg.split('^')[0] in ('b', 'bk', 'ba', 'aa', '%', 'x', '+', 'bh') for tg in r["tags"]) and r['wc'] <= 3]
            rep.append(f"- of {len(bc)} gold backchannel/agree-only short turns, LLM primary = reaction for {pct(sum(r['label']['primary']=='reaction' for r in bc)/max(1,len(bc)))}")
        if name == "topical":
            for r in ok:
                r["crating"] = tconv[r["conv"]]["rating_mean"]
            top = [r for r in ok if r["crating"] is not None and r["crating"] >= 5.0]
            bot = [r for r in ok if r["crating"] is not None and r["crating"] <= 4.0]
            rep.append(compare(top, bot, "Topical-Chat: conversations rated top (both partners 'Excellent', 31% of convs) vs bottom (mean ≤ 4.0 = 'Good' or lower, 26% of convs)"))
            # partner-rated turn quality by move
            bym = collections.defaultdict(list)
            for r in ok:
                if r.get("turn_rating"):
                    bym[r["label"]["primary"]].append(r["turn_rating"])
            rep.append("\n- partner's turn rating (1–5) by primary move: " + ", ".join(
                f"{m} {statistics.mean(v):.2f} (n={len(v)})" for m, v in sorted(bym.items(), key=lambda x: -len(x[1]))))
    rep.append(f"\nTotal LLM spend (upstream inference cost): ${spend:.3f}")

    # Topical-Chat ALL turns: rule-based measures by rating group (conversation-level, cluster bootstrap)
    turns = [json.loads(l) for l in open(os.path.join(WORK, "turns.jsonl"))]
    by = collections.defaultdict(list)
    for t in turns:
        if t["corpus"] == "topical":
            by[t["conv"]].append(t)
    def convstats(cids):
        qs = [sum(t["hasq_rule"] for t in by[c]) / len(by[c]) for c in cids]
        ws = [statistics.mean(t["wc"] for t in by[c]) for c in cids]
        sh = [sum(t["wc"] <= 3 for t in by[c]) / len(by[c]) for c in cids]
        return statistics.mean(qs), statistics.mean(ws), statistics.mean(sh)
    top = [c for c in by if tconv[c]["rating_mean"] is not None and tconv[c]["rating_mean"] >= 5.0]
    bot = [c for c in by if tconv[c]["rating_mean"] is not None and tconv[c]["rating_mean"] <= 4.0]
    rnd = random.Random(1)
    boots = []
    for _ in range(500):
        a = [rnd.choice(top) for _ in top]; b = [rnd.choice(bot) for _ in bot]
        sa, sb = convstats(a), convstats(b)
        boots.append(tuple(x - y for x, y in zip(sa, sb)))
    st, sb_ = convstats(top), convstats(bot)
    names = ["share of turns with a question (rule)", "mean words per turn", "share of turns ≤3 words"]
    rep.append(f"\n#### Topical-Chat, ALL conversations, rule-based (top n={len(top)} convs, bottom n={len(bot)} convs; conversation-level means, 500× cluster bootstrap)\n")
    rep.append("| Measure | Top | Bottom | Difference (95% CI) |\n|---|---|---|---|")
    for i, nm in enumerate(names):
        d = sorted(x[i] for x in boots)
        f = (lambda v: pct(v)) if i != 1 else (lambda v: f"{v:.1f}")
        fd = (lambda v: f"{100*v:+.1f} pp") if i != 1 else (lambda v: f"{v:+.1f}")
        rep.append(f"| {nm} | {f(st[i])} | {f(sb_[i])} | {fd(st[i]-sb_[i])} ({fd(d[12])} to {fd(d[487])}) |")
    # dose-response: mean rating by question-share band
    rows = []
    for c in by:
        r = tconv[c]["rating_mean"]
        if r is None:
            continue
        rows.append((sum(t["hasq_rule"] for t in by[c]) / len(by[c]), r))
    bands = [(0, .1), (.1, .2), (.2, .3), (.3, .4), (.4, .5), (.5, .6), (.6, 1.01)]
    rep.append("\nMean conversation rating by share of turns containing a question (all Topical-Chat conversations):\n")
    rep.append("| Question share band | Conversations | Mean rating (1–5) | Share rated top (5.0) |\n|---|---|---|---|")
    for lo, hi in bands:
        v = [r for q, r in rows if lo <= q < hi]
        if v:
            rep.append(f"| {int(lo*100)}–{min(100,int(hi*100))}% | {len(v)} | {statistics.mean(v):.2f} | {pct(sum(x>=5 for x in v)/len(v))} |")

    open(os.path.join(LAB, "report.md"), "w").write("\n".join(rep))
    print("\n".join(rep))

    # hand-check sample: 25 per corpus
    rnd = random.Random(7)
    hc = []
    for name in ["switchboard", "topical"]:
        _, ok = load(name)
        hc += rnd.sample(ok, 25)
    with open(os.path.join(LAB, "handcheck.txt"), "w") as f:
        for i, r in enumerate(hc):
            f.write(f"=== {i} [{r['corpus']}] id={r['id']}\n")
            for same, tx in r["context"]:
                f.write(f"   {'T' if same else 'P'}: {tx[:300]}\n")
            f.write(f">> T: {r['text'][:500]}\n   LABEL: {r['label']}\n\n")

main()
```

#### extra_stats.py

```python
"""Extra rule-based stats on ALL turns: per-speaker question rates and question streaks.

Usage: python3 -I extra_stats.py <turns.jsonl>
"""
import json, sys, collections, statistics

turns = [json.loads(l) for l in open(sys.argv[1])]
for corpus in ["switchboard", "topical"]:
    ts = [t for t in turns if t["corpus"] == corpus and t["wc"] > 0]
    qkey = "gold_q" if corpus == "switchboard" else "hasq_rule"
    by = collections.defaultdict(list)
    for t in ts:
        by[t["conv"]].append(t)
    # substantive = not a pure short backchannel (Switchboard: DA tags; Topical: >3 words)
    def substantive(t):
        if corpus == "switchboard":
            return not (t["wc"] <= 3 and all(tg.split("^")[0] in ("b", "bk", "ba", "aa", "%", "x", "+", "bh") for tg in t["tags"]))
        return t["wc"] > 3
    sub = [t for t in ts if substantive(t)]
    print(f"\n== {corpus} ({qkey})")
    print("question share, all turns:", round(sum(t[qkey] for t in ts) / len(ts), 4), "n", len(ts))
    print("question share, substantive turns:", round(sum(t[qkey] for t in sub) / len(sub), 4), "n", len(sub))
    print("substantive words/turn mean, median:", round(statistics.mean(t["wc"] for t in sub), 1), statistics.median(t["wc"] for t in sub))
    # per speaker-in-conversation question rate over substantive turns
    rates = []
    p_after_q, p_after_nq = [0, 0], [0, 0]
    streak3 = [0, 0]
    for cid, cts in by.items():
        sp = collections.defaultdict(list)
        for t in cts:
            if substantive(t):
                sp[t["speaker"]].append(bool(t[qkey]))
        for s, seq in sp.items():
            if len(seq) >= 5:
                rates.append(sum(seq) / len(seq))
            for a, b in zip(seq, seq[1:]):
                if a:
                    p_after_q[0] += b; p_after_q[1] += 1
                else:
                    p_after_nq[0] += b; p_after_nq[1] += 1
            for i in range(len(seq) - 2):
                streak3[1] += 1
                streak3[0] += all(seq[i:i + 3])
    qs = statistics.quantiles(rates, n=10)
    print("per speaker-conversation question rate (substantive turns, >=5 turns): median", round(statistics.median(rates), 3),
          "p10", round(qs[0], 3), "p90", round(qs[8], 3), "max", round(max(rates), 3), "n", len(rates))
    print("share of speakers asking in >50% of substantive turns:", round(sum(r > .5 for r in rates) / len(rates), 4))
    print("P(question | own previous substantive turn had a question):", round(p_after_q[0] / p_after_q[1], 3))
    print("P(question | own previous substantive turn had none):", round(p_after_nq[0] / p_after_nq[1], 3))
    print("share of 3-turn windows (same speaker) where all 3 have a question:", round(streak3[0] / streak3[1], 4))
```
