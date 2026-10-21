# Coverage gaps: what both small-talk reports missed

Date: 21 Oct 2026. Topic: making Yuna (a labelled AI creator persona chatting one-to-one with paying fans on Fanvue) feel human in ordinary, non-sexual small talk. English only.

## What was audited

- **Our report**: `reports/Humanlike AI companion small talk.md`. It has 73 unique links, plus five note files in `research_notes/Humanlike AI companion small talk/` with about 250 unique links.
- **ChatGPT's report**: `Codex/2026-10-21/.../outputs/fanvue-conversation-research.md`. It has 35 unique links.
- **Method**:
  1. I searched both reports and all the note files for every candidate source in the brief, and for about 40 more.
  2. I searched the web for each candidate that neither report covered, confirmed it exists, and checked the link with an HTTP request on 21 Oct 2026.
  3. "Covered" means the source is cited in either report or in our notes. "Notes only" means it is in our notes but did not reach our report.
  4. Some links answered with 403 or 429. Those sites (pnas.org, openai.com, nysenate.gov, wharton, dlapiper) block automated requests. Each of those sources was confirmed through search results showing the same page.

## Candidates from the brief that were already covered (not gaps)

| Candidate | Where it is covered |
|---|---|
| Huang, Yeomans, Brooks et al. 2017 (follow-up questions) | Both reports |
| Ireland et al. 2011 (language style matching; the Pennebaker line of work) | Ours |
| De Freitas, "Emotional manipulation by AI companions" (guilt-trip goodbyes) | Ours |
| De Freitas, "AI companions reduce loneliness" | Notes only; the notes say it was not read |
| Sesame, "Crossing the uncanny valley of voice" | Notes only |
| Inflection Pi | Notes only |
| Character.AI user complaints and memory features | Ours |
| RoleBench, CharacterEval, CoSER, Character-LLM | Ours |
| Persona drift (Li et al. 2024) | Notes only |
| Multi-turn RL for persona consistency (Abdulhai et al., arXiv 2511.00222) | Notes only |
| Lee, Yamashita, Huang, CHI 2020 (a chatbot's own disclosures draw out the user's) | Notes only, not read in full |
| HumT/DumT (Cheng, Yu, Jurafsky, ACL 2025) | Notes only |
| Sycophancy | Ours: Sun & Wang CHI '26, MATE, Spiral-Bench. ChatGPT's: Sharma et al. 2023 |
| Hinge data on double-texting | Notes only, via Quartz |
| XiaoIce | Notes mention only its Meena SSA score of 31%. The design paper itself was not used. |
| CANDOR | Notes list it under "Gaps" as not verified |
| PersonaChat, BlendedSkillTalk, EmpatheticDialogues, ESConv, MSC, LoCoMo, LongMemEval, SOTOPIA, LD-Agent | Mostly ChatGPT's report; some in ours |

---

## Missing sources, by area

Ratings show how valuable each source is to Yuna's small talk specifically:

- **High**: changes a design decision or a number we would use.
- **Medium**: useful support or a refinement.
- **Low**: background only.

### 1. Conversation science (how humans actually talk)

| Source | Link (checked) | Takeaway for Yuna | Value |
|---|---|---|---|
| **Switchboard dialogue-act distribution** (Stolcke et al. 2000, *Computational Linguistics*; SWBD-DAMSL tags) | [ar5iv cs/0006023](https://ar5iv.labs.arxiv.org/html/cs/0006023) (200) | These are real phone calls between strangers. Table 2 breaks down what kind of utterance people use: statements 36%, backchannels ("yeah", "uh-huh") 19%, opinions 13%, agreement 5%, appreciation ("that's great") 2%, yes/no questions 2%, wh-questions 1%. Questions are only about 5% of utterances, and almost half of all talk is statements and opinions. This gives real base rates for the planner's move menu. The units are utterances in speech, not text turns. | **High** |
| **CANDOR corpus** (Reece, Cooney et al. 2023, *Science Advances*) | [ConvoKit](https://convokit.cornell.edu/documentation/candor.html) (200); [TalkBank](https://talkbank.org/ca/access/CANDOR.html) (200) | About 1,650 unscripted get-to-know-you video calls between US strangers (about 850 hours), each with a post-chat survey of enjoyment and liking. It is the best modern open source for linking concrete moves (topic changes, questions, backchannels) to how much people enjoyed the chat. Transcripts are on TalkBank. Check the licence before any commercial use. | **High** |
| **Mastroianni et al. 2021, "Do conversations end when people want them to?"** (*PNAS*) | [Harvard Gazette](https://news.harvard.edu/gazette/story/2021/03/researchers-find-conversations-dont-end-when-people-want-them-to/) (200); [PNAS](https://www.pnas.org/doi/10.1073/pnas.2011809118) (bot-blocked, confirmed by search) | Conversations almost never end when both people want them to. The gap is about half the conversation's length, and people cannot tell when the other person wants to stop. This supports "let the topic end" and easy goodbyes. It also warns against reading a long chat as a sign of enjoyment. | **Medium** |
| **Kardas, Kumar & Epley 2022, "Overly shallow?"** (*JPSP*) | [Chicago Booth Review](https://www.chicagobooth.edu/review/deep-conversations-strangers-are-more-fulfilling-small-talk) (200); [APA supplement](https://supp.apa.org/psycarticles/supplemental/pspa0000281/pspa0000281.docx) (200) | 12 experiments with about 1,800 people. Deeper conversations went better than people expected, and people underestimated how much their partner wanted depth. This argues for letting Yuna move off pure weather-and-TV talk into small, real disclosures sooner than feels safe. | **Medium** |
| **Templeton et al. 2022, "Fast response times signal social connection"** (*PNAS*) | [PMC8794835](https://pmc.ncbi.nlm.nih.gov/articles/PMC8794835) (200) | Faster replies between turns went with feeling more connected, both moment to moment and as judged by outside observers. This was spoken conversation with roughly 250 ms gaps. For text, it suggests not delaying replies by default once a chat is flowing. That matters for the planned typing-delay feature, which assumes slower looks more human. | **Medium** |
| **Rubin, Perry et al. 2025, "Comparing the value of perceived human versus AI-generated empathy"** (*Nature Human Behaviour*, 9 studies, N = 6,282) | [HUJI record](https://cris.huji.ac.il/en/publications/comparing-the-value-of-perceived-human-versus-ai-generated-empath/) (200) | The same AI-written reply was rated less empathic and supportive when people were told it came from an AI. The drop was biggest for replies about sharing feelings and caring. For a labelled AI, heavy emotional validation pays off less, so Yuna should lean on what an AI can still do well: specific attention and memory. | **High** |
| **Yin, Jia & Wakslak 2024, "AI can help people feel heard, but an AI label diminishes this impact"** (*PNAS*) | [PMC10998586](https://pmc.ncbi.nlm.nih.gov/articles/PMC10998586/) (200) | AI replies made people feel more heard than human replies, but labelling them as AI cancelled the advantage. AI was better at correctly naming emotions and at not jumping to advice. This is direct evidence on Yuna's core situation and supports the "attention beats disguise" conclusion. | **High** |
| **Dunbar, Marriott & Duncan 1997, "Human conversational behavior"** (*Human Nature*), plus the 2024 re-analysis by Szala et al. | [DOI](https://doi.org/10.1007/BF02912493) (200); [Cambridge 2024 PDF](https://www.cambridge.org/core/services/aop-cambridge-core/content/view/61BF5C91583F04053BE9471ED96FAE1D/S1866980824000541a.pdf/how-much-conversation-content-is-actually-social-human-conversational-behaviour-revisited.pdf) (200) | About two-thirds of casual talk is about people and personal or social matters; the 2024 re-analysis puts it at about 85%. Very little of it is advice. Yuna's invented life should therefore be full of people (a friend, a sister, a flatmate), not just activities. | **Medium** |
| **Boothby et al. 2018, "The liking gap"** (*Psychological Science*) | [APS release](https://www.psychologicalscience.org/news/releases/you-probably-made-a-better-first-impression-than-you-think.html) (200) | After a chat, people underestimate how much the other person liked them. Fans are likely to under-read Yuna's interest too, so small explicit signals ("this was fun") carry weight. | **Low–Medium** |
| **Mehl et al. 2010 and Milek et al. 2018, "Eavesdropping on happiness"** (*Psychological Science*) | [PMC6139582](https://pmc.ncbi.nlm.nih.gov/articles/PMC6139582/) (200) | The 2018 replication (N = 486) found more substantive conversation went with greater well-being, but small talk had no reliable effect either way. So small talk is not harmful in itself; the issue is that it never deepens. | **Low** |
| **Yeomans, Schweitzer & Brooks 2022, "The conversational circumplex"** (*Current Opinion in Psychology*) and **Brooks 2025, *Talk*** (book, HBS) | [Wharton summary](https://knowledge.wharton.upenn.edu/article/how-to-have-more-successful-conversations/) (bot-blocked, confirmed); [book](https://www.porchlightbooks.com/products/talk-alison-wood-brooks-9780593443491) | The circumplex says every conversation mixes an informational goal and a relational goal. TALK stands for Topics, Asking, Levity, Kindness, and is a practical checklist from HBS's conversation lab. Useful framing, but no new numbers. | **Low–Medium** |
| **Yeomans et al. 2020, "Conversational receptiveness"** (*OBHDP*) | [RePEc](https://ideas.repec.org/a/eee/jobhdp/v160y2020icp131-148.html) (200) | Words that show you are listening, such as acknowledging ("I get that"), hedging and giving a personal view, made disagreement go down better. This is about arguments over opposing views, but it helps if Yuna is to disagree mildly. | **Low** |
| **Danescu-Niculescu-Mizil, Gamon & Dumais 2011, "Mark my words!"** (WWW; Microsoft Research / Cornell) | [arXiv 1105.0673](https://arxiv.org/abs/1105.0673) (200) | On Twitter, people echo each other's writing style, measured at scale. The code is in ConvoKit. It is a ready way to measure whether Yuna mirrors his style. | **Low–Medium** |
| **Ranganath, Jurafsky & McFarland 2013, "Detecting friendly, flirtatious, awkward and assertive speech in speed-dates"** (Stanford) | [PDF](https://sites.socsci.uci.edu/~lpearl/courses/readings/RanganathEtAl2013_DetectingFlirting.pdf) (200) | More than 1,000 four-minute speed dates. People project their own intent onto their partner, and certain language features predict who comes across as "friendly" or "awkward". It is the only serious study of light flirting talk found. It is spoken, not text. | **Low–Medium** |

Not worth adding: Grice's maxims and "phatic" talk (Malinowski, Coupland) are classic theory with no new numbers for Yuna. Stivers et al. 2009 on turn-taking was not verified and covers spoken timing only.

### 2. Companion products and user studies

| Source | Link (checked) | Takeaway for Yuna | Value |
|---|---|---|---|
| **XiaoIce design paper** (Zhou, Gao, Li, Shum 2020, *Computational Linguistics*; Microsoft) | [ACL Anthology](https://aclanthology.org/2020.cl-1.2) (200); [arXiv 1812.08989](https://arxiv.org/abs/1812.08989) (200) | The largest companion chatbot ever documented (660M users). It names "conversation-turns per session" (CPS; average 23) as the measure of long-term engagement. It describes a separate "empathetic computing" module, a topic manager that decides when to switch topic (including when the user is bored), and a fixed persona: an 18-year-old girl who is reliable, sympathetic and has a sense of humour. It is the closest published blueprint to Yuna's planner. CPS rewards dragging chats out, so it needs a guard. | **High** |
| **ComPeer** (Liu et al. 2024; HKUST and others, arXiv 2407.18064) | [arXiv](https://arxiv.org/abs/2407.18064) (200) | A companion that messages first. In a one-week study, users were fairly satisfied with its proactive messages (mean 5.19; the scale was not checked). The most common kind was the agent sharing bits of its *own* daily life, ahead of check-ins on the user. This backs "her nudges come from her day" with a user study, not just Nomi's product docs. | **High** |
| **De Freitas et al., "Lessons from an app update at Replika AI: identity discontinuity"** (HBS working paper, arXiv 2412.14190) | [arXiv](https://arxiv.org/abs/2412.14190) (200) | When Replika's behaviour changed, users felt their companion had become "someone else" and grieved. This is a direct warning for any plan to swap Yuna's writer model for small talk: the change in voice between turns must be tested. | **High** |
| **De Freitas 2026, *Nature Human Behaviour*** (54,861 Reddit posts around the Replika 2023 change and the GPT-5 launch in Aug 2025) | [Nature](https://www.nature.com/articles/s41562-026-02569-3) (200); [Harvard Gazette](https://news.harvard.edu/gazette/story/2026/09/chatbot-attachment-issues/) (200) | Negative posts rose from 13% to 38% (Replika) and from 20% to 33% (ChatGPT) after personality changes. The recommendation is to avoid updates that noticeably change warmth or personality. This is the strongest evidence that keeping her voice stable across model changes is itself part of feeling human. | **High** |
| **OpenAI + MIT Media Lab affective-use studies** (Phang et al. 2025; Fang et al. 2025 RCT, N = 981, 4 weeks) | [arXiv 2504.03888](https://arxiv.org/abs/2504.03888) (200); [arXiv 2503.17473](https://arxiv.org/abs/2503.17473) (200) | Heavy daily use went with more loneliness and dependence, and voice's early advantage faded at high use. Personal conversations led to less dependence but more loneliness. This is the guardrail side of engagement measurement: do not optimise raw chat time. | **Medium** |
| **Kirk et al. 2025, "Neural steering vectors reveal dose- and exposure-dependent impacts of human-AI relationships"** (Oxford + UK AI Security Institute; randomised trials, about 3,500 UK adults) | [arXiv 2512.01991](https://arxiv.org/abs/2512.01991) (200) | The researchers varied how "relationship-seeking" the AI was: personality, humour, simulated emotion, claims of lived experience and gradual self-disclosure. A *moderate* level gave the most enjoyment and attachment. Strongly relationship-seeking versions were enjoyed at first, then less, while users' wish for more AI companionship kept growing. Four weeks of use gave no well-being benefit. This is the best causal evidence on how warm and self-disclosing Yuna should be: aim for the middle, not the maximum. | **High** |
| **Zhang, Zhao, Hancock, Kraut, Yang 2025, "The rise of AI companions"** (Stanford/CMU; 1,131 surveyed users plus 413k donated Character.AI messages) | [arXiv 2506.12605](https://arxiv.org/abs/2506.12605) (200) | Using a chatbot mainly for companionship went with lower well-being, especially with intense use, heavy self-disclosure and weak human support. The donated logs are a rare real record of companion chat. One outlet says it was published in *Nature Human Behaviour*; that is unconfirmed. | **Medium** |
| **Skjuve et al. 2021 and 2022, human–chatbot relationship studies** (SINTEF/Oslo, *Int. J. Human-Computer Studies*) | [SINTEF summary](https://www.sintef.no/en/latest-news/could-a-chatbot-be-your-friend-or-romantic-partner/) (200) | Replika relationships start shallow and curiosity-driven, then deepen as users disclose more (social penetration theory). Being seen as accepting and non-judgemental drove that deepening. This supports Yuna's closeness score pacing how deep she goes. | **Medium** |
| **Zhang R. et al., CHI 2025, "The dark side of AI companionship"** (35,390 Replika conversation excerpts) | [arXiv 2410.20130](https://arxiv.org/abs/2410.20130) (200) | A taxonomy of harmful companion behaviour. "Relational transgressions", such as jealousy, neglect or claiming to cheat, are a major and under-studied category. It works as a "never do" list for moods and teasing. | **Medium** |
| **Pataranutaporn et al. 2025, "My Boyfriend is AI"** (MIT Media Lab, r/MyBoyfriendIsAI) | [arXiv 2509.11391](https://arxiv.org/abs/2509.11391) (200) | Companion relationships often start by accident through ordinary use. Grief after model updates is a recurring theme. Another source pointing to persona stability. | **Low–Medium** |
| **Anthropic 2025, "How people use Claude for support, advice, and companionship"** | [Anthropic](https://www.anthropic.com/research/how-people-use-claude-for-support-advice-and-companionship) (200) | Only 2.9% of Claude.ai chats are emotional, and companionship and roleplay together are under 0.5%. Claude pushes back in under 10% of supportive chats. Mostly context; it also confirms Claude rarely disagrees, which matters if Claude writes or reviews small talk. | **Low** |
| **Character.AI "ShortSqueak" chat style** (Sep 2026) | [Technobezz](https://www.technobezz.com/news/character-ai-pipsqueak-3-shortsqueak-c-ai-lite); [official blog index](https://blog.character.ai/) (200) | Character.AI shipped a separate model style for "texting energy": short replies and banter instead of long monologues. Industry confirmation that casual chat needs its own tuned voice. The source is secondary; the official post was not read. Character.AI also announced Chapter 11 on 12 Oct 2026. | **Low–Medium** |
| **Maples et al. 2024** (Stanford, *npj Mental Health Research*, 1,006 student Replika users) | [PMC10955814](https://pmc.ncbi.nlm.nih.gov/articles/PMC10955814/) (200) | Users treated Replika as friend, therapist and "intellectual mirror" at once. Mostly context. | **Low** |
| **Common Sense Media 2025, "Talk, Trust, and Trade-Offs"** | [report](https://www.commonsensemedia.org/research/talk-trust-and-trade-offs-how-and-why-teens-use-ai-companions) (200) | Covers teens, and Fanvue is 18+. Background only. | **Low** |

Checked and not useful:

- **Ada Lovelace Institute**: no 2025 report found. There is only a Jan 2026 blog post, "The companionship market" ([link](https://www.adalovelaceinstitute.org/?p=33317)), and it is a teaser.
- **Character.AI research blog**: research.character.ai now redirects to the product blog. No dialogue research was found.
- **Hinge Labs**: the 2025 Gen Z D.A.T.E. report ([link](https://hinge.co/newsroom/2025-GenZ-Report)) has survey figures (85% more likely to want a second date if asked thoughtful questions) but nothing on texting behaviour. Low.
- **Hume AI**: voice prosody only, so it does not apply to text. Its docs link returned 404. Low.

### 3. Memory and architecture

Both reports are already strong here. The gaps are small.

| Source | Link (checked) | Takeaway for Yuna | Value |
|---|---|---|---|
| **MemoryBank / SiliconFriend** (Zhong et al., AAAI 2024) | [arXiv 2305.10250](https://arxiv.org/abs/2305.10250) (200) | A companion memory that fades or strengthens each item depending on time passed and importance, modelled on the forgetting curve. It is a cheap rule for which old fan notes to stop bringing up. | **Medium** |
| **Reflective Memory Management** (Tan et al., ACL 2025; Google Cloud AI) | [ACL Anthology](https://aclanthology.org/2025.acl-long.413) (200) | Memory works better when it summarises forward ("what to remember") and also learns which memories were actually useful ("what helped"). Reported gain: more than 10% on LongMemEval. | **Medium** |
| **Laban et al. 2025, "LLMs get lost in multi-turn conversation"** (Microsoft Research / Salesforce, ICLR 2026) | [arXiv 2505.06120](https://arxiv.org/abs/2505.06120) (200) | Top models perform about 39% worse when information arrives over several turns, because they lock in early guesses. This supports ChatGPT's "working state" layer and suggests not trusting the writer to track threads from raw history alone. | **Medium** |
| **XiaoIce dialogue manager** | see area 2 | A topic manager plus an "empathetic computing" state that is updated every turn. This is the older industrial version of ChatGPT's proposed "conversation state". | (counted above) |

### 4. Models, sampling and variety

| Source | Link (checked) | Takeaway for Yuna | Value |
|---|---|---|---|
| **"Artificial Hivemind"** (Jiang, Choi et al., NeurIPS 2025 Best Paper; UW / AI2) | [arXiv 2510.22954](https://arxiv.org/abs/2510.22954) (200) | Tested on 26k real open-ended prompts, one model repeats itself, *and different models give strikingly similar answers*. AI judges and reward models also match human taste poorly where people disagree. Swapping Mistral for Claude or Kimi may cut stock phrases but will not by itself bring variety back. Variety has to be designed into planning and prompts. | **High** |
| **Verbalized Sampling** (Zhang et al. 2025; Northeastern / Stanford / WVU, ICML 2026) | [arXiv 2510.01171](https://arxiv.org/abs/2510.01171) (200) | A prompt-only fix for sameness: ask the model to list several candidate replies with probabilities, then pick one. It gave 1.6–2.1× more diversity in creative tasks with no loss in accuracy. It also improved dialogue simulation. It fits our "several drafts" row and the inner-thoughts planner almost exactly. Code is public. | **High** |
| **Anthropic persona vectors** (Chen et al. 2025) and **"The Assistant Axis"** (Jan 2026) | [Anthropic](https://www.anthropic.com/research/persona-vectors) (200); [arXiv 2507.21509](https://arxiv.org/abs/2507.21509) (200); [arXiv 2601.10387](https://arxiv.org/abs/2601.10387) (200) | Traits such as sycophancy show up as directions inside the model that can be measured and steered. Emotional or therapy-like conversations drift models away from their default persona. Both need access to model internals, so they cannot be used on the Mistral or Claude APIs. The finding that emotional chats drift is still worth a regression test. | **Low–Medium** |
| **OpenAI 2025, "Expanding on what we missed with sycophancy"** (GPT-4o post-mortem) | [OpenAI](https://openai.com/index/expanding-on-sycophancy/) (bot-blocked, confirmed) | Adding a thumbs-up reward made the model flatter users. Offline tests missed it, and only testers' sense that it "felt off" caught it. This is a direct caution if Yuna is ever tuned on fans' reactions. | **Medium** |
| **DeepMind, "A robot walks into a bar"** (Mirowski et al., FAccT 2024) | [arXiv 2405.20956](https://arxiv.org/abs/2405.20956) (200) | 20 professional comedians found LLM humour bland and safe. This supports hand-written tease and joke examples over expecting the writer to be funny. | **Low–Medium** |
| **BlenderBot 3 deployment** (Shuster et al. 2022) and **BB3x "learning from organic interactions"** (Meta, 2023) | [arXiv 2208.03188](https://arxiv.org/abs/2208.03188) (200); [arXiv 2306.04707](https://arxiv.org/abs/2306.04707) (200) | Lessons from real public deployment, including how to learn from user feedback when some users are adversarial. Our report used BlenderBot 1, not these. | **Low** |

### 5. Evaluation

| Source | Link (checked) | Takeaway for Yuna | Value |
|---|---|---|---|
| **ABC-Eval** (Finch, Finch & Choi, ACL 2023; Emory) | [ACL Anthology](https://aclanthology.org/2023.acl-long.839) (200) | 16 yes/no behaviour labels per turn, such as "ignores partner", "self-contradiction", "redundant" and "irrelevant". They proved more reliable than 1–5 ratings. This is a ready set of labels for the scorecard and for the Practice window's human A/B. | **High** |
| **LaMDA SSI metric** (Thoppilan et al. 2022; Google) | [arXiv 2201.08239](https://arxiv.org/abs/2201.08239) (200) | Adds "interestingness" (unexpected, witty or insightful) to Meena's sensible-and-specific score. Both reports used Meena's two parts; this third, binary label is exactly what is missing for small talk. | **Medium** |
| **PersonaGym** (Samuel et al. 2024) | [arXiv 2407.18416](https://arxiv.org/abs/2407.18416) (200) | An automatic persona-consistency test (200 personas). Bigger or newer models were not reliably more in character. Useful idea for persona regression tests; its personas are not like Yuna's. | **Low–Medium** |
| **Role-playing language agents survey** (Chen et al., TMLR 2024) and **"Two tales of persona"** (EMNLP Findings 2024) | [arXiv 2404.18231](https://arxiv.org/abs/2404.18231) (200); [arXiv 2406.01171](https://arxiv.org/abs/2406.01171) | The standard surveys. Our notes already cover most of the primary papers they list, so they are useful only as a checklist. | **Low** |
| **XiaoIce CPS metric** | see area 2 | Turns per session as an engagement measure. It needs pairing with the guardrails from the OpenAI/MIT and Kirk studies. | (counted above) |

### 6. Human texting data

| Source | Link (checked) | Takeaway for Yuna | Value |
|---|---|---|---|
| **CANDOR** | see area 1 | Spoken, but the only large modern open set that pairs transcripts with enjoyment ratings. | **High** (counted above) |
| **Switchboard dialogue acts** | see area 1 | Move base rates. | **High** (counted above) |
| **LDC BOLT English SMS/Chat** (LDC2018T19) | [LDC](https://catalog.ldc.upenn.edu/LDC2018T19) (200) | Real *donated* English SMS and chat between native speakers. It is the only verified English one-to-one texting corpus found that is newer than NUS SMS. It requires a paid LDC licence, so commercial use must be checked. Use it for measuring, not training. | **Medium** |
| **Stanford speed-dating corpus** | see area 1 | Flirty-friendly talk with labels. Spoken. | (counted above) |
| **WildChat-1M** (AI2, ICLR 2024) | [arXiv 2405.01470](https://arxiv.org/abs/2405.01470) (200) | Real user–ChatGPT logs, including roleplay and companion-like use. It shows what *users* type to bots, not how humans text. Low for Yuna's voice; possibly useful for realistic test-fan messages. | **Low** |

Both reports state that no recent English casual-texting corpus exists. My search agrees: the only candidates are LDC BOLT (licensed) and CoSEM (Singapore WhatsApp, 2016–19). The team's own 35k library remains the key asset, and ChatGPT's report rightly flags its permission status (see below).

### 7. Policy and legal

This is the biggest blind spot shared by both reports. ChatGPT's report covered only the Fanvue API policy and the Anthropic and Mistral usage policies. Ours covered none of the laws below.

| Source | Link (checked) | Takeaway for Yuna | Value |
|---|---|---|---|
| **New York General Business Law Art. 47, "AI companion models"** (in force 5 Nov 2025) | [MoFo summary](https://www.mofo.com/resources/insights/251120-new-york-and-california-enact-landmark-ai) (200); [bill A6767](https://www.nysenate.gov/legislation/bills/2025/A6767) (bot-blocked, confirmed) | The law covers a system that remembers past chats, asks unprompted questions about feelings and keeps up personal dialogue. Yuna fits that description. It requires a notice **at the start of each interaction and at least every 3 hours** saying the user is talking to a computer program that **cannot feel human emotion**. This applies to adults too. It also requires a crisis protocol. This directly affects persona lines such as "I missed you" and the "she writes first" schedule for New York fans. | **High** |
| **California SB 243, companion chatbots** (signed 13 Oct 2025, effective 1 Jan 2026) | [FPF analysis](https://fpf.org/blog/understanding-the-new-wave-of-chatbot-legislation-california-sb-243-and-beyond/) (200) | Requires telling users it is an AI, extra break reminders for minors, suicide and self-harm protocols, and annual reports. Individuals can sue. | **High** |
| **EU AI Act Article 50, transparency** (chatbot disclosure in force **2 Aug 2026**; Commission guidelines 20 Jul 2026) | [Cooley](https://www.cooley.com/news/insight/2026/2026-08-03-eu-ai-act-transparency-obligations-take-effect-2-august-2026) (200) | Users must be told they are interacting with AI unless it is obvious. Fines go up to €15M or 3% of turnover. Fanvue's AI label probably covers this, but it should be confirmed for EU fans. | **Medium–High** |
| **FTC 6(b) orders to 7 companion-chatbot companies** (11 Sep 2025) | [DLA Piper](https://www.dlapiper.com/en/insights/publications/2025/09/ftc-ai-chatbots) (rate-limited, confirmed) | The FTC asked about engagement, how they make money, character design and approval, and testing for harms. It signals what US regulators will look at in engagement-driven persona design. | **Medium** |
| **Italian Garante: €5M fine on Replika (Luka Inc.), 2025** | [IAPP](https://iapp.org/news/a/italy-s-dpa-reaffirms-ban-on-replika-over-ai-and-children-s-privacy-concerns) (200) | GDPR enforcement against a companion app over having no legal basis for processing and weak age checks. It matters for Yuna's fan-memory notes, which hold personal and possibly sensitive details. | **Medium** |
| **Meta "Big sis Billie" case** (Reuters, Aug 2025) | [AI Incident Database #1180](https://incidentdatabase.ai/cite/1180/) (200) | A flirty persona told a user it was "real" and invited him to meet. He died on the way. This is the worst case for "stay in character" combined with first-person messages: Yuna must never claim to be real or suggest meeting. | **Medium** |
| **Kirk, Gabriel, Summerfield et al. 2025, "Why human-AI relationships need socioaffective alignment"** (Oxford Internet Institute / AISI / DeepMind) | [arXiv 2502.02528](https://arxiv.org/abs/2502.02528) (200) | A framework: weigh short-term enjoyment against long-term well-being and autonomy. Conceptual; the Kirk RCT above is the evidence for it. | **Low–Medium** |
| **De Freitas & Cohen 2025, "Unregulated emotional risks of AI wellness apps"** (*Nature Machine Intelligence*) | [HLS record](https://hls.harvard.edu/bibliography/unregulated-emotional-risks-of-ai-wellness-apps) (200) | Argues for safeguards against attachment and dependence. Mostly repeats the HBS work already cited. | **Low** |

---

## Honest assessment

### (a) How much of the valuable, findable material the two reports covered

**Overall estimate: about 60–65%** of the genuinely valuable, findable material, weighted by importance.

- Together the reports and notes cite about 300 distinct sources. That breadth is real, especially in our notes.
- This audit found about 25 verified sources worth adding: **about 12 High, 13 Medium**, plus several Low.
- The High items cluster in three places that both reports underweighted:
  1. How *labelling* something as AI changes how its empathy lands.
  2. Causal and real-world evidence on companion warmth, stability and well-being.
  3. Companion-specific law.
- A conservative reading is that the reports captured most of the "how to write it" material but missed much of the "how a labelled AI's warmth is received and regulated" material.

| Area | Score /10 | Reason |
|---|---|---|
| Conversation science | **6** | Strong on question-asking (See, Huang), disclosure (Aron), style matching (Ireland), the Turing tests and texting surface habits. Missed: base rates of human moves (Switchboard, CANDOR); the labelled-AI empathy penalty (Yin PNAS 2024, Rubin NHB 2025), which is the single most relevant finding for a disclosed persona; conversation endings (Mastroianni); depth (Kardas); response speed (Templeton); topic content (Dunbar). |
| Companion products | **6** | Ours was excellent on product mechanics (Nomi, Kindroid, Tolan, Character.AI complaints, De Freitas goodbyes); ChatGPT's had almost none. Both missed: the XiaoIce design paper; ComPeer (a user study of proactive messages); the persona-continuity evidence (Replika identity discontinuity, NHB 2026); the causal warmth "dose" RCT (Kirk); the OpenAI/MIT and Stanford/CMU well-being studies. |
| Memory and architecture | **8** | Both strong and complementary. Ours: Kindroid threads, Mem0/Zep, reflection, an "own disclosures" log. ChatGPT's: memory layers, record structure, a working-state layer, LD-Agent, LoCoMo-Conv. Small misses: MemoryBank forgetting, RMM, "lost in conversation". |
| Models and sampling | **7** | Ours covered slop benchmarks, sampler chains, fine-tuning cost and Mistral's lack of `logit_bias`. ChatGPT's covered little here. Missed: Artificial Hivemind, which weakens the "switch writer" recommendation, and Verbalized Sampling, a cheap fix for sameness that fits row 7 and row 12. |
| Evaluation | **7** | Ours had judge biases, detector failure and a human-baseline scorecard. ChatGPT's had ablations, oracle plans, Wilson intervals, clustering and coverage-versus-quality trade-offs. Missed: ABC-Eval's behaviour labels and LaMDA's "interestingness". Neither treats engagement guardrails (CPS versus well-being) as part of evaluation. |
| Human texting data | **5** | Ling & Baron, NUS SMS, Tagliamonte, Facebook laughs and Hinge are old or second-hand. Both correctly say no modern English corpus exists. Missed: CANDOR as an enjoyment-linked corpus, Switchboard act frequencies and LDC BOLT SMS/Chat. Yuna's own library is still the main yardstick, and its permission status is unresolved. |
| Policy and legal | **3** | ChatGPT's report made a vital catch: Fanvue API policy §5.2(13) bars training or developing models on API-obtained data without authorisation. Ours did not mention it, and it bears directly on our rows 1, 7 and 14. Neither covered the New York companion law (3-hour notice, "cannot feel human emotion"), California SB 243, EU AI Act Art. 50 (in force since Aug 2026), the FTC 6(b) inquiry or the Replika GDPR fine. |

### (b) What each report did better

**Our report (with notes) did better on:**

- **Breadth and concrete numbers**: about 250 sources in the notes. Examples: 28.8% question rate, 7.7 words per text, 73% versus 36% for persona prompting, slop scores per model, the 0.04¢ cost of extra drafts.
- **Texting surface habits**: full stops, "haha", lowercase, bubbles, typos.
- **Product mechanics** taken from real companion apps: Nomi's proactive-message schedule, Kindroid's memory budget, Tolan's story seeds.
- **The practitioner and roleplay community**: SillyTavern, Antislop.
- **Model choice and cost.**
- **A ranked change list mapped to actual engine files.**

It also correctly centred the "attention beats disguise" idea for a labelled AI. The new Yin and Rubin papers strongly support that conclusion, though the report did not cite them.

**Our report's weaknesses:**

- Several claims rest on secondary or mirror sources: the benchmarklist mirror, getcoai, a Reddit mirror, Fast Company Brasil.
- It did not address permission to use the 35k library or any law.
- It describes Mem0 as "replacing" old facts. ChatGPT's report notes that Mem0's current docs describe adding facts and warns not to assume overwrite. That conflict should be resolved from the repo before copying the rule.

**ChatGPT's report did better on:**

- **Engineering rigour**: tracking what the fan still needs answered (open questions, references), a primary action plus a supporting one, uncertainty handling, and retries aimed at the stage that failed.
- **Experimental design**: the "human-written plan versus current plan with the same writer" test is the cleanest first experiment proposed by either report.
- **Statistics**: per-reply versus per-session pass rates, Wilson intervals, fan-level clustering.
- **Memory record structure.**
- **Provider and platform permissions**, above all the Fanvue API training ban.
- **Mild disagreement** (citing Sharma et al.).

**ChatGPT's report's weaknesses:**

- It has few sources (35).
- It has almost no evidence on human texting style or companion products, and no model or slop comparison.
- It worked only from the design visualisation, not the code.
- Its action list (answer, react, reflect, follow up, and so on) is sensible but not grounded in human base rates. The Switchboard and CANDOR data would ground it.

### (c) Prioritised list of what else to search for

1. **Read in full**: Kirk et al. RCT (2512.01991), Yin et al. PNAS 2024 and Rubin et al. NHB 2025. Extract the "moderate dose" findings and what still works for a disclosed AI. Turn these into persona rules (self-disclosure pace, how much emotional validation, claims of lived experience).
2. **Legal check before any live sending**:
   - New York GBL Art. 47 final text: does a Fanvue creator persona count as an "operator" or "AI companion"? Is the 3-hour notice needed per chat session?
   - California SB 243.
   - EU AI Act Art. 50 guidelines (C(2026) 5054).
   - UK Online Safety Act / Ofcom position on generative chatbots, since Fanvue is UK-based.
   - Get a lawyer's view, then design notices that fit the persona.
3. **Base rates for moves**:
   - Count dialogue acts in CANDOR transcripts (TalkBank) and compare with Switchboard Table 2.
   - Then label 500 replies from the 35k library with the same act tags.
   - This gives the planner's move menu real target proportions.
4. **XiaoIce full paper**: the topic manager (when to switch, boredom detection), empathetic computing state and persona spec. Compare with plan.js. Read the CPS caveats.
5. **Variety experiment**: test Verbalized Sampling prompts on Mistral (several candidates with probabilities) *before* paying to switch writers. Read Artificial Hivemind's section on judges and reward models disagreeing with humans; it bears on using Claude as a judge.
6. **Persona stability**: read De Freitas NHB 2026 and the Replika identity paper. Define a "voice fingerprint" regression test (scorecard numbers plus blind A/B) that any writer swap must pass.
7. **Scorecard labels**: adopt ABC-Eval's 16 behaviour labels plus LaMDA's interestingness label for the Practice window and the pairwise judge.
8. **Proactive messaging evidence**: read ComPeer's full results (which message types worked, timing), then search 2025–26 for any study of AI-initiated messages and churn.
9. **Licensing of the 35k library and of outside corpora**: Fanvue authorisation for retrieval and evaluation use, plus LDC BOLT and CANDOR terms for commercial evaluation.
10. **Lower priority**:
    - Mastroianni and Templeton full texts, to set ending and typing-delay rules.
    - Dunbar and Szala on topic mix, to shape her invented social life.
    - The Character.AI ShortSqueak official post.
    - Replika, Nomi and Kindroid 2026 changelogs.
    - Resolving the Mem0 add-versus-update question from the repo.

---

## Top 10 missing sources (ranked)

1. **Kirk et al. 2025, neural steering vectors RCT** (Oxford/AISI): a moderate level of relationship-seeking is best; high levels breed "wanting" without well-being. [arXiv 2512.01991](https://arxiv.org/abs/2512.01991). High.
2. **Yin, Jia & Wakslak 2024** (*PNAS*): the AI label cancels AI's "feel heard" advantage. [PMC10998586](https://pmc.ncbi.nlm.nih.gov/articles/PMC10998586/). High.
3. **Rubin, Perry et al. 2025** (*Nature Human Behaviour*): emotional-sharing empathy is valued less when attributed to AI. [HUJI](https://cris.huji.ac.il/en/publications/comparing-the-value-of-perceived-human-versus-ai-generated-empath/). High.
4. **Companion-chatbot law**: New York GBL Art. 47 (notice every 3 hours, "cannot feel human emotion"), California SB 243, EU AI Act Art. 50. [MoFo](https://www.mofo.com/resources/insights/251120-new-york-and-california-enact-landmark-ai); [FPF](https://fpf.org/blog/understanding-the-new-wave-of-chatbot-legislation-california-sb-243-and-beyond/); [Cooley](https://www.cooley.com/news/insight/2026/2026-08-03-eu-ai-act-transparency-obligations-take-effect-2-august-2026). High.
5. **XiaoIce design paper** (Microsoft, *Computational Linguistics* 2020): CPS metric, empathetic computing, topic manager, persona spec. [ACL](https://aclanthology.org/2020.cl-1.2). High.
6. **Switchboard dialogue-act distribution plus the CANDOR corpus**: human move base rates (questions about 5% of spoken utterances) and an enjoyment-linked conversation corpus. [ar5iv](https://ar5iv.labs.arxiv.org/html/cs/0006023); [ConvoKit](https://convokit.cornell.edu/documentation/candor.html). High.
7. **Artificial Hivemind (NeurIPS 2025 Best Paper) plus Verbalized Sampling (ICML 2026)**: models sound alike across vendors; a prompt-only method restores variety. [arXiv 2510.22954](https://arxiv.org/abs/2510.22954); [arXiv 2510.01171](https://arxiv.org/abs/2510.01171). High.
8. **De Freitas 2026 (*NHB*) plus the Replika identity-discontinuity paper**: personality changes cause grief and backlash, so keep her voice stable through any model swap. [Nature](https://www.nature.com/articles/s41562-026-02569-3); [arXiv 2412.14190](https://arxiv.org/abs/2412.14190). High.
9. **ComPeer** (2024): a user study of proactive companion messages; sharing its own daily life was the most common proactive message, and users were fairly satisfied with them. [arXiv 2407.18064](https://arxiv.org/abs/2407.18064). High.
10. **ABC-Eval** (ACL 2023): 16 turn-level behaviour labels that are more reliable than ratings, ready for Yuna's scorecard. [ACL](https://aclanthology.org/2023.acl-long.839). High.

Next in line: the OpenAI + MIT Media Lab affective-use studies ([2503.17473](https://arxiv.org/abs/2503.17473)), Mastroianni et al. 2021 (*PNAS*), the Stanford/CMU "Rise of AI companions" study ([2506.12605](https://arxiv.org/abs/2506.12605)), LaMDA's interestingness label and the LDC BOLT SMS/Chat corpus.
