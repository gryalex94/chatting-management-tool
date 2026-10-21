# The science of humanlike casual chat: what makes a text chatbot's small talk feel human or robotic

Scope: academic findings, mostly from 2019 to 2026 plus classic social psychology, on what makes a text partner seem human, likeable and engaging, and what gives a bot away. The aim is to turn these findings into rules or measurements for the "Yuna" engine (Mistral writes, Claude checks).

---

## 1. Turing-test studies (Jones & Bergen, UC San Diego, 2023–2025): what passed, what was in the winning prompt, and which cues judges used

### Takeaway
The persona prompt decided the result. With a "young, introverted, internet-culture, slang" persona, GPT-4.5 was picked as the human 73% of the time. The same model without the persona scored only 36%. Judges mostly decided on **style and social/emotional cues** (formality, typos, verbosity, how questions were handled, personality), not on knowledge. The giveaways were being too formal, too wordy, too generic, too polite or helpful, and grammar that was too perfect. A forced persona, such as overdone slang, also got caught.

### Cited Findings
**2025 three-party test (GPT-4.5, LLaMa-3.1-405B, GPT-4o, ELIZA)**
- Five-minute three-party chats. The interrogator talks to one human and one AI at the same time and picks which is human. There were two pre-registered populations. — [Jones & Bergen 2025, arXiv 2503.23674](https://arxiv.org/html/2503.23674)
- Win rates (share of games where the AI was picked as the human). GPT-4.5-PERSONA scored **73%** (UCSD 69.2%, 74/107; Prolific 75.5%, 111/147), significantly more often than the real humans were picked. LLaMa-PERSONA scored **56%** (45.4% UCSD, 64.7% Prolific). LLaMa-NO-PERSONA scored 38%. **GPT-4.5-NO-PERSONA scored 36%**. GPT-4o-NO-PERSONA scored 21%, and ELIZA 23%. — [arXiv 2503.23674](https://arxiv.org/html/2503.23674)
- Sample: UCSD had 126 participants and 445 games. Prolific had 158 participants and 576 games. In total, 1,023 games were analysed. — [arXiv 2503.23674](https://arxiv.org/html/2503.23674)
- The PERSONA prompt told the model to play a **young person who is fairly introverted, into internet culture, and uses slang**. Each game also got a random name, city, languages and timestamps. The full prompt appears only as an image (Fig. 6), so the exact wording was not extracted. — [arXiv 2503.23674](https://arxiv.org/html/2503.23674)
- Interrogator strategies, by share of games: **small talk** (daily activities, personal details) 61%; social/emotional probing (opinions, emotions, humour, experiences) 50%; asking directly "are you human" 19%; situational awareness (weather, time) 13%; knowledge and reasoning 12%. The most *accurate* strategies were saying something strange to see the reaction, and "jailbreak" attempts. The least effective were asking about the weather and about human experiences. — [arXiv 2503.23674](https://arxiv.org/html/2503.23674)
- Reasons judges gave for verdicts: **linguistic style 27%** (formality, typos, verbosity) and **interactional dynamics 23%** (how questions were handled, conversational flow). "Gut feeling" was also common. Social and emotional factors were cited more often than knowledge. The most *accurate* reasons were **question handling (how directly the witness answered)** and **lack of knowledge** (not knowing something an AI would know). — [arXiv 2503.23674](https://arxiv.org/html/2503.23674)

**2024 two-party test (GPT-4)**
- GPT-4 was judged human **54%** of the time, against ELIZA 22% and real humans **67%**. The authors say "stylistic and socio-emotional factors" matter more for passing than traditional intelligence. — [Jones & Bergen 2024, arXiv 2405.08007](https://arxiv.org/abs/2405.08007)

**2023 public online test (GPT-4, many prompts): the best prompt text is printed in full**
- The best prompt, "Dragon", succeeded in **49.7%** of 855 games. Real humans scored 66%, ELIZA 22%, GPT-3.5 20%. Decisions were based mainly on **linguistic style (35%)** and **socio-emotional traits (27%)**. — [Jones & Bergen 2023, arXiv 2310.20216](https://arxiv.org/abs/2310.20216)
- What the Dragon prompt specified (paraphrased from the paper):
  - Persona: a **young, casual, slightly sassy** person on a random chat site who **isn't trying hard to prove they're human**. They may tease the interrogator and find it funny to defend their humanity.
  - Style: **mostly lowercase, rare punctuation**, sloppy spelling from typing fast, but **go easy on typos at the start**.
  - Length: **very concise; a word or two is better than a full sentence**.
  - Slang: occasional modern slang, with **dated slang banned**.
  - Knowledge: **not knowledgeable**, happy to admit it, bad at maths, speaks no other languages.
  - Attitude: occasional swearing and bluntness, but the personality should come through **subtly, not as a forced stereotype**. Starts guarded and **warms up slowly**.
  - Dragon was a toned-down version of "Sierra" (39%): it was told to be *less* informal. — [arXiv 2310.20216v2](https://arxiv.org/html/2310.20216v2)
- Reasons for "it's an AI" verdicts:
  - **Linguistic**: too formal; **too informal** (forced, overused slang); forced persona or dialect; **grammar too perfect** or unconvincingly bad; "ChatGPT-like" tone; **repetitive sentence structure**; **too verbose** (or too terse); output formatting.
  - **Socio-emotional**: **lacking personality** (boring, generic); unnatural responses; **overly polite or helpful**.
  - **Situational**: wrong local time, no knowledge of current events. — [arXiv 2310.20216v2](https://arxiv.org/html/2310.20216v2)
- Reasons for "it's human" verdicts: spelling and grammar errors, humanlike tone, **humour**, plausibility, **being uncooperative or rude**, informal tone, and a **plausible backstory** (cited for humans, rarely for AIs). Slow responses were cited about equally for humans and AIs. — [arXiv 2310.20216v2](https://arxiv.org/html/2310.20216v2)
- Telling the model to make more spelling and grammar errors usually raised success. Temperature had no consistent effect. — [arXiv 2310.20216v2](https://arxiv.org/html/2310.20216v2)

**Human heuristics are exploitable**
- Across 6 experiments (N = 4,600), people could not detect AI-written self-presentations in professional, hospitality and **dating** settings. They relied on cues such as **first-person pronouns, contractions and family topics** as signs of a human. These cues are unreliable, so AI can be made to look "more human than human". — [Jakesch et al., PNAS 2023 / arXiv 2206.07271](https://arxiv.org/abs/2206.07271)

### Inferences
- The persona effect (36% to 73% for the same model) is the strongest single lever in the literature. For Yuna this means a specific, lived-in character with a backstory, opinions and limits, not a generic "friendly girl".
- Rules that follow directly:
  - Short replies (a word or two to one sentence in small talk).
  - Mostly lowercase and light punctuation.
  - Slang should be sparse and current.
  - No flawless helpful-assistant tone.
  - She may decline, tease or be a little blunt.
  - She admits not knowing things rather than answering everything.
  - She warms up over the chat instead of being maximally warm from message one.
- "Question handling" was the most accurate tell. Bots answer every question fully and directly, like an assistant. A humanlike partner sometimes answers sideways, briefly, or with a joke.
- Overdoing the persona (forced slang, stereotyped dialect) was also a giveaway. A code check for slang or emoji density with an upper limit is as important as a lower one.
- Caveat: Fanvue fans know Yuna is a labelled AI. These studies measure *being mistaken for a human*, which is a stronger test than *feeling natural*. The style cues still map onto "feels like a bot".

### Gaps
- The exact 2025 PERSONA prompt wording (shown only as an image in the paper; the OSF materials were not retrieved).
- A secondary source claims the 2025 study was published in PNAS. I could not confirm this from a primary source.
- I found no 2025–2026 follow-up Turing studies beyond these.

---

## 2. Dialogue-system research on humanness and engagingness (Meena, BlenderBot, PersonaChat/ConvAI2, Multi-Session Chat)

### Takeaway
Human raters punish **repetition** most of all, then **generic replies** ("that's nice", "I don't know"). They reward **specific, detailed** replies and a **moderate-to-high rate of questions**. Replies that are too short are judged dull: BlenderBot's best length was about 20 tokens, close to humans' 18. **Remembering and bringing back the partner's earlier topics** raises engagement significantly. Engagingness can be pushed to human level, but *humanness* lagged in every model.

### Cited Findings
**Meena (Google, 2020): sensibleness + specificity**
- SSA (sensibleness and specificity average) has two parts. Sensible means nothing seems "confusing, illogical, out of context, or factually wrong". *Specific* means the reply fits this context and not dozens of others. Example: A says "I love tennis". "That's nice" is **not specific**. "Me too, I can't get enough of Roger Federer!" is specific. — [Adiwardana et al. 2020, arXiv 2001.09977](https://arxiv.org/abs/2001.09977)
- "GenericBot" always replies "I don't know" to questions and "ok" to statements. It was rated **70% sensible**, more than DialoGPT's 62%, yet **0% specific**. Sensibleness alone rewards bland bots. — [arXiv 2001.09977](https://arxiv.org/abs/2001.09977)
- SSA versus separately rated "human likeness" across chatbots: **R² = 0.96**. — [arXiv 2001.09977](https://arxiv.org/abs/2001.09977)
- SSA scores: humans **86%**, Meena (full) 79%, Mitsuku 56%, Cleverbot 56%, DialoGPT 48%, XiaoIce 31%. Humans have very high sensibleness but noticeably lower specificity. — [arXiv 2001.09977](https://arxiv.org/abs/2001.09977)

**See et al. 2019, "What makes a good conversation?" (PersonaChat; 28 model setups, each rated by 100+ crowdworkers)**
- Raters judged eight aspects on a 1–4 scale: avoiding repetition, interestingness, making sense, fluency, listening, inquisitiveness, humanness and engagingness. — [See et al., NAACL 2019 (arXiv 1902.08654)](https://arxiv.org/abs/1902.08654)
- **Repetition was "by far the biggest limiting quality factor"**:
  - Cutting self-repetition across turns improved *every* metric and brought scores close to human on all except humanness.
  - The best setting cut bigram repetition to **below** the level in human data.
  - Blocking repeated content words also helped. — [arXiv 1902.08654](https://arxiv.org/pdf/1902.08654)
- **Question rate**:
  - Humans in PersonaChat put a question in **28.8%** of utterances; the baseline bot 50%.
  - Engagingness peaked at **65.7%** question rate, but the **best "listener" rating was at 48.9%**.
  - Only 11.9% of raters said a bot asking a question 99.5% of the time asked "too many".
  - The authors warn that in real social chat, incessant questions would likely be judged worse than in this artificial "get to know each other" task. — [arXiv 1902.08654](https://arxiv.org/pdf/1902.08654); [Abigail See blog](http://www.abigailsee.com/2019/08/13/what-makes-a-good-conversation.html)
- **Specificity** (more rare, specific words, at about human level) gave higher interestingness, listening and engagingness. Pushed too far, it hurt fluency and sense. In A/B interestingness tests, specific models won 56–84% against the baseline. Raters' reasons were "more information", "better flow", "describe their life in more detail" and "funny". — [arXiv 1902.08654](https://arxiv.org/pdf/1902.08654)
- **Response-relatedness** (forcing the reply to echo the partner's words) gave **no improvement**. Raters tolerated generic but related replies more than slightly nonsensical ones. — [arXiv 1902.08654](https://arxiv.org/pdf/1902.08654)
- The best model matched the engagingness of the ConvAI2 winner (raw 3.1/4), but "humanness was nowhere near human-level for all models". **Engagingness ≠ humanness**. — [See blog](http://www.abigailsee.com/2019/08/13/what-makes-a-good-conversation.html)

**BlenderBot 1 (Meta, "Recipes for building an open-domain chatbot", 2020)**
- Against Meena in human chats (ACUTE-Eval pairwise):
  - Engagingness: BST 2.7B won **75%**.
  - Humanness: BST 2.7B won **65%**.
  - Against human–human logs: 49% (not significant), i.e. close to parity. — [Roller et al. 2020, arXiv 2004.13637](https://arxiv.org/html/2004.13637v2)
- **Length**:
  - Forcing a minimum reply length won big in engagingness: min 20 tokens won **83%** and min 40 won 82%, against no minimum.
  - Average length went from 9.5 to about 21 tokens; humans average **18.0 tokens** and Meena 10.4.
  - Very short replies read as dull. — [arXiv 2004.13637](https://arxiv.org/html/2004.13637v2)
- Fine-tuning on **blended skills** (persona + empathy + knowledge) beat a Reddit-only model, 61% to 39%. Against Meena, it reached 75% engagingness versus 53%. — [arXiv 2004.13637](https://arxiv.org/html/2004.13637v2)
- Failure modes the authors list:
  - **Repeated stock phrases**: "Do you have…" appeared **110** times in bot logs versus **6** in human logs.
  - **"Copycat"**: claiming the user's own pets, bands or interests.
  - **Contradiction and forgetfulness**: asking about pets the user already mentioned.
  - **Made-up facts**.
  - **Failing to get puns and jokes**. — [arXiv 2004.13637](https://arxiv.org/html/2004.13637v2)

**Long-term memory: "Beyond Goldfish Memory" (Multi-Session Chat, 2021)**
- Humans rated chats in session 5. Memory models that summarise past sessions and recall them did better than the baseline (BST 2.7B):
  - **Engaging responses: 62.1%** versus 53.0%.
  - **Final rating: 3.65/5** versus 3.14.
  - Referencing the **partner's** topics from earlier sessions: **33.8%** versus 14.5%. — [Xu, Szlam & Weston 2021, arXiv 2107.07567](https://arxiv.org/html/2107.07567v1)
- How memory was built: between sessions, each chat was summarised into short "important points" that extend the persona. Later sessions use these as the main reference. — [arXiv 2107.07567](https://arxiv.org/html/2107.07567v1)

### Inferences
These map to code checks:
1. A **cross-turn repetition filter**: block reusing any 2–3-word phrase, opener or question template Yuna used in the last N messages. Track recurring stock phrases per fan, the "Do you have…" pattern.
2. A **specificity check**: reject replies that could fit any context ("that's nice", "sounds fun", "haha cool") unless paired with a concrete detail.
3. **Question rate**: target roughly 30–50% of Yuna's small-talk messages containing a question. Humans ask 28.8%; the best listener score came at 48.9%. Never a question in every message.
4. **Avoid one-liner minimalism and essays alike.** The tension with the Turing results (concise wins) resolves as: short but specific. Humans in typed chat average about 18 tokens per turn in PersonaChat-style chat.
5. **No copycat**: never claim the fan's own hobby or pet as hers just because he mentioned it.
6. **Memory callbacks**: bring back his earlier topics (his job, his dog, the game he mentioned). This had one of the largest measured effects on engagement.

### Gaps
- BlenderBot 2/3 human-evaluation details were not retrieved.
- EmpatheticDialogues and ACUTE-Eval methodology papers were not fetched directly.
- These studies used paid crowdworkers in short, artificial "get to know you" chats, not paying fans.

---

## 3. Social psychology of liking in conversation: questions, self-disclosure, responsiveness, humour, style matching

### Takeaway
In text chat, people like partners who ask **follow-up questions**: questions about what *they* just said, not new-topic switches. The effect works through perceived **responsiveness** (understanding, validation, care). Closeness grows from **escalating, reciprocal self-disclosure**. Unconscious **function-word style matching** predicts mutual interest. Bot humour raises liking when it is friendly rather than aggressive.

### Cited Findings
**Question asking (Huang, Yeomans, Brooks, Minson & Gino, JPSP 2017)**
- **Study 1** was done in **text chat**: an instant-messaging tool (ChatPlat), 15-minute "get to know each other" chats, 398 participants analysed in about 199 dyads.
  - One person was told to ask either **≥9** or **≤4** questions.
  - Their partners liked high question-askers more: **M = 5.79 vs 5.31**, t(197) = 2.47, p = .014, **d = .35**.
  - The question askers did *not* predict this. People underestimate how much questions raise liking. — [Huang et al. 2017 (PDF)](https://gwern.net/doc/psychology/novelty/2017-huang.pdf)
- Question types across the studies: follow-up **40.5%**, full-switch (new topic) 27.6%, mirror ("you?") 19.0%, introductory 5.5%. **Follow-up questions alone predicted higher partner liking.** Coder-rated responsiveness was higher with more follow-ups and **lower with more full-switch questions**. — [Huang et al. 2017](https://gwern.net/doc/psychology/novelty/2017-huang.pdf)
- **Speed dating (Study 3, N = 110 daters)**: daters who asked more follow-up questions got more second dates. An 8% difference in follow-up rate ≈ **one extra date out of 20**. This is correlational. — [Huang et al. 2017](https://gwern.net/doc/psychology/novelty/2017-huang.pdf)
- The speed-dating analysis was challenged by Kluger & Malloy (2019), who argued that a second-date offer ≠ liking. The authors' 2019 reply defends the results. — [Harvard DASH record and summary](https://dash.harvard.edu/handle/1/35647952); [HKS](https://www.hks.harvard.edu/centers/cpl/publications/it-doesnt-hurt-ask-question-asking-increases-liking)
- Responsiveness (Reis & Shaver) means showing **understanding, validation and caring**. Perceived partner responsiveness is the felt sense that the partner "understands who you are… validates… cares". — [summary of Reis framework](https://psychologyfanatic.com/perceived-partner-responsiveness/); [Maisel et al. 2008](https://labs.psych.ucsb.edu/gable/shelly/sites/labs.psych.ucsb.edu.gable.shelly/files/pubs/maisel_et_al._2008.pdf)

**Self-disclosure and reciprocity**
- Aron et al. 1997 (36 questions): strangers taking turns with **escalating, reciprocal personal disclosure** felt closer than pairs asking small-talk questions. This held regardless of shared attitudes or expectations. After about 45 minutes, the relationship was rated closer than the closest relationship of about 30% of similar students. The questions rise in intensity within and across three sets. — [Greater Good summary](https://ggia.berkeley.edu/practice/practice_as_pdf/36_questions_for_increasing_closeness); [Explore Psychology](https://www.explorepsychology.com/?p=1333)
- Chatbots: when a chatbot discloses about its own life and feelings, users disclose more and more deeply. A 3-week study with 47 participants found a lasting reciprocal effect. The CHI 2020 paper (Lee, Yamashita, Huang, Fu) was not read in full. — [Illinois IDEALS (Lee dissertation)](https://www.ideals.illinois.edu/items/121097); [dblp CHI 2020](https://dblp1.uni-trier.de/rec/conf/chi/LeeYHF20.html)

**Linguistic style matching (LSM)**
- In 40 speed dates, matching in **function words** (pronouns, articles, etc.) predicted mutual romantic interest: odds ratio **3.05**. Pairs above the median wanted contact **33.3%** of the time versus 9.1% below it.
- In instant messages of 86 couples, LSM predicted staying together at 3 months: OR 1.95, about 77% versus 54%.
- The matching was unconscious, and the data are correlational. — [Ireland et al. 2011, Psych Science (PDF)](https://sites.socsci.uci.edu/~lpearl/courses/readings/IrelandEtAl2011_RelationshipPrediction.pdf); [Language Log caveat](https://languagelog.ldc.upenn.edu/nll/?p=3164)

**Humour**
- Chatbot humour raised service satisfaction in 3 experiments, through perceived humanness ("anthropomorphism") and interestingness. **Friendly (affiliative) humour helped; aggressive humour did not.** The same humour from a human agent had no effect. — [Kennesaw, "The influence of chatbot humour…" 2022](https://digitalcommons.kennesaw.edu/facpubs/6453)
- A humorous chatbot greeting raised engagement and emotional attachment versus a neutral one. — [Lekaviciute et al. 2023, OMEE](https://journals.vu.lt/omee/article/view/29887)
- Witscript's in-conversation jokes were rated 2.28 versus DialoGPT 1.61 versus humans 3.10. Making good conversational jokes remains hard. — [Witscript, arXiv 2302.02008](https://arxiv.org/pdf/2302.02008)

### Inferences
- **Follow-ups over topic switches**: in small talk, Yuna's questions should mostly be about the last thing he said, e.g. "wait what does your boss even do all day". Not new-topic interview questions ("so what are your hobbies?"), and not bare "wbu?" mirrors. A classifier can sort Yuna's questions into follow-up, switch or mirror. Target follow-up ≥ 50% of her questions.
- **Disclose, don't just ask**: give a small piece of her own day or opinion, then ask (or don't). Raise the depth slowly over the relationship (closeness level), mirroring the Aron escalation.
- **Style matching**: match his message length, casing, emoji use and formality roughly. This is measurable per turn (length ratio, emoji ratio, function-word overlap).
- **Humour**: friendly, teasing humour, never at his expense in an aggressive way.

### Gaps
- No study found that measures perceived partner responsiveness directly in human–chatbot text chat.
- Aron's original statistics were not retrieved (secondary summaries only).
- The CHI 2020 self-disclosure paper's sample size and effect sizes were not retrieved.

---

## 4. "AI-like" language: overused words, sycophancy, over-validation, list shapes, always answering everything

### Takeaway
There is measured evidence that LLMs overuse certain words ("delve", "intricate", etc.), and that human-feedback training (RLHF/DPO) contributes. There is also evidence that **flattery plus agreement in a friendly bot lowers perceived authenticity and trust**, and that generic, formulaic validation feels hollow over several turns. I found **no** peer-reviewed list of tell-tale words specific to casual chat. The measured lists come from scientific writing.

### Cited Findings
- **Excess vocabulary**: PubMed abstracts 2010–2024 show sudden spikes in "style words" after ChatGPT. "delves" was **28×** its expected 2024 frequency. At least **13.5%** of 2024 abstracts were LLM-processed, up to 40% in some subsets. The examples are style verbs and adjectives, not content words. — [Kobak et al., arXiv 2406.07016](https://arxiv.org/html/2406.07016v5)
- Juzek & Ward identified **21 focal words** overused due to LLMs. They found no evidence that model architecture explains it. — [COLING 2025, arXiv 2412.11385](https://arxiv.org/html/2412.11385v1)
- Follow-up: human feedback training (RLHF/DPO) is linked to lexical overuse ("delve", "intricate"). In an experiment emulating the feedback step, participants **systematically preferred variants containing those words**. Raters themselves drive the habit. — [Juzek & Ward 2025, arXiv 2508.01930](https://arxiv.org/abs/2508.01930)
- **Sycophancy**, N = 224: a **complimentary** LLM that changed its stance to agree with the user had **lower** perceived authenticity and trust. A neutral LLM that adapted had higher trust. Published as "Be Friendly, Not Friends" at CHI '26. — [Sun & Wang, arXiv 2502.10844](https://arxiv.org/abs/2502.10844v3)
- Conflicting evidence: another 2025 study found sycophancy *raised* perceived trustworthiness with little effect on actual trust. — [search summary of 2025 studies; UF coverage](https://www.jou.ufl.edu/?p=522409)
- **Empathy calibration over multiple turns** (N = 82, 2 studies):
  - Baseline LLM replies showed "generic validation and formulaic tone" that felt hollow across turns.
  - Adding self-critique produced "agreement-skewed" over-affirmation in 62.5% of participants in one condition.
  - Agreement density rose **98%**.
  - Conclusion: empathy should be calibrated to how much the person disclosed, not maximised. — [MATE, arXiv 2505.24658](https://arxiv.org/abs/2505.24658)
- Turing judges flagged "ChatGPT-like" tone, repetitive sentence structure, output formatting, verbosity, being overly polite or helpful, and grammar that was too perfect (see section 1). — [arXiv 2310.20216v2](https://arxiv.org/html/2310.20216v2)

### Inferences
- Keep a **banned-phrase list** of chat-assistant habits and enforce it in code: "I totally get that", "That sounds amazing!", "It's important to…", "I'm here for you", "No worries!", "delve", "absolutely", "honestly that's so valid", and "Great question". Treat it as a living list, built from Yuna's own logs (count phrase frequency per 1,000 messages against real-human chat logs). Note that the science gives the *method* (excess-frequency ratio against a human baseline), not a ready-made chat list.
- **Over-validation check**: limit compliments and agreement words per message. Never agree *and* compliment *and* reassure in one message. Let her disagree mildly and have opinions ("nah pineapple on pizza is wrong").
- **Shape check**: no lists, colons, or em-dash-heavy "balanced" sentences. Don't answer every part of a multi-part message. Avoid the symmetric "reaction + validation + question" template on every turn.

### Gaps
- No peer-reviewed measured list of LLM tell-words in *casual chat* (as opposed to academic writing) was found.
- No study found that measures hedging specifically as a bot cue in casual chat.
- The Cheng et al. (Stanford/CMU) 2025 sycophancy paper was seen only in a catalogue summary.

---

## 5. 2024–2026 work on making LLM chat more humanlike: DPO datasets, short replies, casual register, typos, response delays

### Takeaway
Fine-tuning on "humanlike vs formal" preference pairs made raters pick the tuned model about 80–90% of the time for conversational feel, at some cost to instruction-following. Humanlike *timing* also matters:
- dynamic response delays raise perceived humanness;
- hesitation and self-editing while typing are preferred.

### Cited Findings
- **"Enhancing Human-Like Responses in LLMs"** (Çalık & Akkuş, Jan 2025):
  - Method: DPO + LoRA on Llama-3-8B, Qwen-2.5-7B and Mistral-Nemo, with **10,884** synthetic pairs over 256 topics.
  - "Chosen" (humanlike) answers: casual and friendly, **contractions, interjections, optional emojis, personal stories, light humour, empathy, the model's own opinions, questions to keep the chat going**, and never mentioning being an AI.
  - "Rejected" answers: formal, neutral, no slang, no opinions or emotions. — [arXiv 2501.05032](https://arxiv.org/html/2501.05032)
- Results of that study:
  - Anonymous pairwise votes (2,000 votes, 500 questions, emojis stripped): tuned models chosen **89.6%** (Llama), **89.5%** (Qwen) and **79.6%** (Mistral-Nemo) of the time.
  - IFEval instruction-following fell by 3–9 points, contradicting the authors' "no loss" claim.
  - Raters were mostly high-school students and many were non-native speakers. — [arXiv 2501.05032](https://arxiv.org/html/2501.05032)
- **Response delays**:
  - A chatbot with **dynamic delays** (scaled to the complexity of the message and reply) was rated higher in perceived humanness, social presence and satisfaction than near-instant replies (customer-service setting). — [Gnewuch et al., ECIS 2018](https://aisel.aisnet.org/ecis2018_rp/113/)
  - A later lab study (N = 202) found delays have **mixed** effects: higher social presence, but they can lower intention to use, depending on prior chatbot experience. — [Gnewuch et al., BISE 2022 (supplement)](https://media.springernature.com/original/springer-static/esm/art%3A10.1007%2Fs12599-022-00755-x/MediaObjects/12599_2022_755_MOESM1_ESM.pdf)
- **Typing behaviour**: three agents were compared (baseline; hesitation; hesitation + self-editing). Users **preferred hesitation + self-editing**, linked to naturalness and trust. Numbers were not retrieved. — [arXiv 2510.08912](https://arxiv.org/abs/2510.08912)
- **Typos**: in the Turing tests, prompting more spelling and grammar errors usually raised pass rates. The best prompt asked for "go easy on typos at the start" plus sloppy spelling later, while "unconvincingly bad" grammar was itself a giveaway. — [arXiv 2310.20216v2](https://arxiv.org/html/2310.20216v2)

### Inferences
- The DPO "chosen" style rubric (contractions, interjections, small personal stories, opinions, light humour, a question to continue) can be used as a **Claude-checker rubric** or few-shot style guide. It doesn't require fine-tuning Mistral.
- On timing, the Fanvue sender can add delays scaled to message length plus a random "busy" factor. Splitting a reply into 2–3 short bubbles imitates human typing.
- On typos, the rule is "rare and plausible" (a dropped apostrophe, lowercase "i", an occasional wrong letter). Avoid frequent or cartoonish errors, which judges caught.
- Caveat: the delay and typing studies used customer-service bots or labelled agents, not companion chat.

### Gaps
- Not found:
  - peer-reviewed studies on **message splitting** (multiple short bubbles) in chatbots;
  - studies of companion/romance chatbots measuring small-talk humanness specifically;
  - typo-frequency studies with numbers outside the Turing tests.
- I found no independent replication of the 2501.05032 results.
