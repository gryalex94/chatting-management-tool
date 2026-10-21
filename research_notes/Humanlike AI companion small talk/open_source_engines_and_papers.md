# Open-source engines, architectures and papers for believable, consistent AI characters in long one-to-one chats

Scope note: these notes cover open-source projects and research. GitHub numbers (stars, licence, last push) come from the GitHub API on 2026-10-21. Paper details come from arXiv abstract or HTML pages fetched the same day unless marked "(from prior knowledge, not re-verified)". Sexual content is out of scope; PIPPA and SillyTavern-ecosystem material is mentioned only for its mechanics.

## 1. Agent and character architectures (memory, reflection, planning, inner thoughts, plan-then-write, affect)

### Takeaway
The most transferable ideas for "small talk feels robotic" are (a) a hidden **thought reservoir** that is scored for "do I actually want to say this" before writing (Inner Thoughts, CSIM), (b) **reflection** that turns raw memory notes into higher-level beliefs about the fan (Generative Agents), and (c) **memory hygiene**: extract facts, then ADD/UPDATE/DELETE them with time stamps (Mem0, Zep/Graphiti, LongMemEval). Each of these is a prompt-and-data pattern that can be built in Node.js with hosted LLMs. The memory-layer products (Letta, Mem0, Zep) are mature and maintained, but they solve recall, not tone.

### Cited Findings

**Generative Agents (Park et al., 2023): memory stream + reflection + planning**
- Architecture: every observation goes into a natural-language "memory stream". Retrieval scores each memory by recency, importance and relevance. Periodic "reflection" asks the LLM for higher-level insights over recent memories and stores them back as memories. "Planning" makes top-down day plans that are broken into smaller steps and revised when something happens — [arXiv 2304.03442](https://arxiv.org/abs/2304.03442) (from prior knowledge of the paper, not re-verified)
- In the paper's ablation interviews, the full architecture (observation + reflection + planning) was judged most believable, and removing each component made it less believable — [arXiv 2304.03442](https://arxiv.org/abs/2304.03442) (from prior knowledge, not re-verified)
- Repo: joonspk-research/generative_agents, 22.3k stars, Apache-2.0, Python, last push 2024-08-05, so effectively unmaintained research code — [GitHub](https://github.com/joonspk-research/generative_agents)
- Idea to take: a nightly or every-N-messages "reflection" job per fan ("What 3 things have I learned about him? What does he care about? What running jokes do we have?"), stored as dated notes with an importance score. Retrieval then ranks by recency × importance × relevance. Yuna already has dated notes; the missing pieces are importance scoring and the reflection step.

**Inner Thoughts (Liu, Fang, Shi, Wu, Igarashi, Chen; arXiv 2501.00383, v2 Feb 2025)**
- A covert stream of thoughts runs alongside the conversation. The agent "models its intrinsic motivation to express each thought" and speaks only when motivation is high enough — [arXiv 2501.00383](https://arxiv.org/abs/2501.00383)
- Pipeline (from the HTML full text) — [arXiv HTML](https://arxiv.org/html/2501.00383v2):
  - Triggers: `on_new_message`, and `on_pause` after 10 s of silence (to start a new topic).
  - Retrieval: saliency = max(similarity to the raw utterance, similarity to an LLM interpretation of it) × importance × decay. Decay is 0.95 per timestep and the selection threshold is 0.3.
  - Thought formation is dual-process. "System 1" gives quick reactions such as acknowledgments; "System 2" gives deliberate thoughts from retrieved memories. Each thought is under 15 words and kept in a reservoir that evolves.
  - Evaluation: the LLM argues the 2 strongest reasons for and against saying each thought, then rates it 1–5. The score is a logprob-weighted rating multiplied by a "silence factor" of 1.02^(turns since the agent last spoke).
  - The 8 heuristics, from a 24-person think-aloud study: relevance, information gap, expected impact, urgency, coherence, originality, balance, dynamics.
  - Participation: the agent speaks if the best thought clears `imThreshold`. Otherwise it may emit a System-1 reaction with probability `system1Prob`, or stay silent.
- Results: in a simulation, 82% of human pairwise choices favoured Inner Thoughts over a fine-tuned GPT-3.5 next-speaker baseline. It was significantly better on turn appropriateness, coherence, intelligence, anthropomorphism, adaptability, engagement and initiative (Mann-Whitney p from 2.4e-6 to 6e-3). The user study (12 people, Slack) found the "Active Contributor" setting most preferred — [arXiv HTML](https://arxiv.org/html/2501.00383v2)
- Caveat: the paper studies multi-party chat, not one-to-one, and the study is small — [arXiv HTML](https://arxiv.org/html/2501.00383v2)
- Idea to take: before Mistral writes, generate 3–5 short candidate thoughts. Mix System-1 reactions ("lol same", "wait what") with System-2 thoughts drawn from her day, the fan's memory and the diary. Have a scorer rate each on relevance, originality and balance, with a penalty for asking a question when she asked one last turn. The writer then expresses only the winning thought. This maps directly onto the existing planner's "goal per reply" and makes reactive one-liners a legitimate choice.

**"Think Before You Speak" / CSIM (Zhou, Pang, Shen, Cheng; NAACL 2024 Findings, arXiv 2311.07445)**
- Gives black-box LLMs "communication skills" through a private inner monologue before each reply. The skills are topic transition, proactively asking questions, concept guidance, empathy and summarising. The authors built the Cskills benchmark and report CSIM beats the baselines — [arXiv 2311.07445](https://arxiv.org/abs/2311.07445)
- Idea to take: make "topic transition" an explicit planner move. When a thread is exhausted, she should not ask yet another question. She should bridge to something of her own ("that reminds me, today at the café…").

**Two-stage plan-then-write and step-by-step messaging (Stephanie / Stephanie2)**
- Stephanie2 (arXiv 2601.05657, Jan 2026) generates a reply as several messages. At each step it decides whether to send or "actively wait", and it models latency as thinking time + typing time. It reports beating Stephanie1 on naturalness and engagement, with a higher pass rate on a human role-identification (Turing-style) test. The abstract gives no numbers and no code release is stated — [arXiv 2601.05657](https://arxiv.org/abs/2601.05657)
- A search summary of the paper says active waiting "suppresses overly long monologue-like outputs" and raised average reply interval from 6.5 s to 10.5 s. This was not verified against the full text — [search result pointing to arXiv 2601.05657](https://arxiv.org/pdf/2601.05657)
- Stephanie (v1): "Step-by-Step Dialogues for Mimicking Human Interactions in Social Conversations" — [arXiv 2407.04093](https://arxiv.org/abs/2407.04093) (ID from prior knowledge, not re-verified)

**MemGPT / Letta**
- MemGPT (Packer et al., 2023) treats the context window like OS memory. A small "core memory" of editable blocks (persona, human) stays in the prompt; recall and archival storage are paged in with tool calls; the agent edits its own memory through function calls — [arXiv 2310.08560](https://arxiv.org/abs/2310.08560) (from prior knowledge, not re-verified)
- Letta (the MemGPT successor): 25.2k stars, Apache-2.0, actively maintained (last push 2026-10-18), Python server with an HTTP API and client SDKs — [GitHub letta-ai/letta](https://github.com/letta-ai/letta)
- Idea to take: keep a small, always-in-prompt "human block" per fan (name, job, pets, current worries, running jokes), edited by a background job. Everything else lives in searchable notes. Yuna's "story summary" plays this role; the change would be to make it structured and capped in size.

**Mem0**
- Extracts "salient information" from conversations, consolidates it and retrieves it; a graph variant adds relationships. Claims on LoCoMo: 26% relative LLM-as-judge improvement over OpenAI's memory, 91% lower p95 latency and >90% token savings versus full context. The graph variant is about 2% higher than base — [arXiv 2504.19413](https://arxiv.org/abs/2504.19413)
- The ADD/UPDATE/DELETE/NOOP update step is described in the full paper and repo. The abstract does not describe it, so it is not verified here — [arXiv 2504.19413](https://arxiv.org/abs/2504.19413)
- Repo: 67.6k stars, Apache-2.0, very active (pushed 2026-10-21) — [GitHub mem0ai/mem0](https://github.com/mem0ai/mem0)
- Caveat: these are vendor-authored benchmark claims. Zep publicly disputed some LoCoMo comparisons (from prior knowledge, not re-verified).
- Idea to take: when a new fact arrives ("I moved to Leeds"), run an explicit UPDATE/DELETE against old facts so Yuna never asks about the old city.

**Zep / Graphiti**
- A temporally aware knowledge graph. Claims 94.8% on DMR (vs 93.4% for MemGPT), up to 18.5% accuracy gains on LongMemEval, and 90% lower latency — [arXiv 2501.13956](https://arxiv.org/abs/2501.13956)
- Graphiti repo: 32.1k stars, Apache-2.0, very active (pushed 2026-10-21), Python — [GitHub getzep/graphiti](https://github.com/getzep/graphiti)
- Idea to take: give facts bi-temporal validity ("valid from / superseded on"). For example, "his sister is visiting" is true for one week, and Yuna can later ask "did your sister leave yet?"

**A-MEM (agentic memory, 2025)**
- Zettelkasten-style notes: each memory gets keywords, tags and links to related notes, and adding a new note can "evolve" older ones — [arXiv 2502.12110](https://arxiv.org/abs/2502.12110) (method details from prior knowledge, not re-verified)
- Repo agiresearch/A-mem: 1.2k stars, MIT, last push 2025-12-12 — [GitHub](https://github.com/agiresearch/A-mem)

**Long-term memory benchmarks: what they found**
- LongMemEval (ICLR 2025) has 500 questions covering 5 abilities: information extraction, multi-session reasoning, temporal reasoning, knowledge updates and abstention. Commercial assistants and long-context LLMs lose about 30% accuracy over extended interactions. The recommended fixes are to split sessions into finer units, expand index keys with extracted facts, and add time-aware query expansion — [arXiv 2410.10813](https://arxiv.org/abs/2410.10813); repo 1.2k stars, MIT — [GitHub](https://github.com/xiaowu0162/LongMemEval)
- LoCoMo (Maharana et al., ACL 2024): very long multi-session dialogues (about 300 turns over up to 35 sessions). LLMs lag humans most on temporal and long-range causal questions — [arXiv 2402.17753](https://arxiv.org/abs/2402.17753) (sizes from prior knowledge, not re-verified); repo snap-research/locomo, 1.2k stars, last push 2024-08 — [GitHub](https://github.com/snap-research/locomo)
- Idea to take: "temporal reasoning" and "knowledge updates" are the weak spots, so store absolute dates on every fan note and resolve "last week" when the note is written.

**Emotion / affect models (PAD, OCC)**
- I found no 2023–2026 open-source LLM chat engine with a published, evaluated PAD or OCC emotion layer in the time available. See Gaps.

### Inferences
- Yuna's engine already has most of the Generative Agents pieces (memory notes, invented day, planner). The gap is between "a goal" and "what she would actually blurt out". The Inner Thoughts "thought reservoir + motivation score + System-1 reaction" pattern is the most direct fix for robotic small talk, because it allows short, reactive, non-question replies.
- Off-the-shelf memory layers (Mem0, Zep, Letta) are Python-first services with HTTP APIs. They could be called from Node, but their main benefit is recall, which is not the stated weakness. Porting the *update discipline* (ADD/UPDATE/DELETE with dates) is cheaper than adopting a service.

### Gaps
- Inner Thoughts' exact LLM, code release and maintenance status were not found. The GitHub guess `xyliu-cs/inner-thoughts` returned 404.
- Mem0's exact ADD/UPDATE/DELETE prompt and the Zep-vs-Mem0 benchmark dispute were not verified from primary sources in this pass.
- PAD/OCC: no verified recent open-source implementation or measured result in chat agents. A focused follow-up search is needed (e.g. "LLM PAD emotion state companion").

## 2. Role-play / character LLM research, persona drift and fixes

### Takeaway
Character research falls into three groups: data built from books or scripts (CoSER, ChatHaruhi, RoleLLM, Character-LLM), synthetic persona scaling (OpenCharacter), and evaluation suites (CharacterEval, RoleBench, CoSER's GCA). The most relevant finding for Yuna is that **persona fidelity decays over long dialogues**, and that most role-play datasets are only 5–10 turns long. Long-chat consistency therefore has to be enforced by the engine (re-injecting the persona, a checker, fact diaries), not assumed from the model.

### Cited Findings
- **CoSER (2025)**: 17,966 characters from 771 books, with authentic dialogue, scene setups, character experiences and *internal thoughts*. It introduces "given-circumstance acting" (GCA) for training and evaluation and releases CoSER-8B and 70B (Llama-3.1). CoSER-70B scores 75.80% on InCharacter and 93.47% on LifeChoice, matching or beating GPT-4o. The paper licence is CC BY-NC-ND 4.0 — [arXiv 2502.09082](https://arxiv.org/abs/2502.09082); repo Neph0s/CoSER, 228 stars, no licence file detected, pushed 2026-04 — [GitHub](https://github.com/Neph0s/CoSER)
  - Idea to take: training data that pairs each line with the character's *inner thought* supports the "think, then speak" split, and the paper treats inner thoughts as part of character fidelity.
- **Character-LLM (Shao et al., EMNLP 2023)**: trains agents on reconstructed "experiences" of specific people, plus "protective experiences" that teach the character to say it does not know things outside its world — [arXiv 2310.10158](https://arxiv.org/abs/2310.10158) (from prior knowledge, not re-verified); repo choosewhatulike/trainable-agents, 653 stars, Apache-2.0, last push 2024-10 — [GitHub](https://github.com/choosewhatulike/trainable-agents)
  - Idea to take: Yuna should credibly *not know* things (she's not a search engine). The Turing-test study below found that "knowing too much" gives AIs away.
- **RoleLLM / RoleBench (Wang et al., 2023)**: a role-play benchmark with about 100 roles; RoleGPT prompting plus Context-Instruct data generation — [arXiv 2310.00746](https://arxiv.org/abs/2310.00746) (details from prior knowledge, not re-verified); repo 533 stars, no licence detected, last push 2024-10 — [GitHub](https://github.com/InteractiveNLP-Team/RoleLLM-public)
- **ChatHaruhi (Li et al., 2023)**: revives anime characters by retrieving each character's original script lines as few-shot examples; about 32 characters / 54k dialogues — [arXiv 2308.09597](https://arxiv.org/abs/2308.09597) (sizes from prior knowledge, not re-verified); repo 2.1k stars, Apache-2.0, last push 2024-08 — [GitHub](https://github.com/LC1332/Chat-Haruhi-Suzumiya)
  - Idea to take: retrieve *her own past lines* that fit the current mood or topic as style few-shots. Yuna's ai_examples library already does this; ChatHaruhi validates the approach.
- **CharacterEval (Tu et al., 2024)**: Chinese benchmark, about 1,785 multi-turn dialogues, 77 characters, 13 metrics in 4 dimensions, plus a trained reward model (CharacterRM) — [arXiv 2401.01275](https://arxiv.org/abs/2401.01275) (from prior knowledge, not re-verified); repo 309 stars, MIT, last push 2025-05 — [GitHub](https://github.com/morecry/CharacterEval)
  - Idea to take: borrow its metric list (e.g. fluency, coherence, consistency, human-likeness, engagement) as the rubric for the Claude checker.
- **OpenCharacter (2025)**: scales role-play training with large synthetic character profiles (from Persona Hub) and response rewriting/generation — [arXiv 2501.15427](https://arxiv.org/abs/2501.15427) (from prior knowledge, not re-verified)
- **Beyond Dialogue (2024)**: aligns the character profile to each scenario and adds "beyond dialogue" tasks to train role-play alignment — [arXiv 2408.10903](https://arxiv.org/abs/2408.10903) (from prior knowledge, not re-verified)
- **PIPPA (Gosling et al., 2023)**: about 1M utterances in 26k conversations from the Pygmalion community role-play front-end. It contains a lot of NSFW material, so it is out of scope for style data — [arXiv 2308.05884](https://arxiv.org/abs/2308.05884) (from prior knowledge, not re-verified)
- **Persona drift: measured findings**
  - "Persistent Personas?" (arXiv 2512.12775, Dec 2025) tests 7 open and closed LLMs over persona dialogues of 100+ rounds. Persona fidelity and instruction-following degrade with dialogue length. It also notes that role-play datasets average only about 5–10 turns — [arXiv 2512.12775](https://arxiv.org/html/2512.12775v2) (from search snippet; full text not read)
  - "Examining Identity Drift in Conversations of LLM Agents" (arXiv 2412.00804): across 9 LLMs, *larger* models drifted more, and assigning a persona did not reliably prevent drift — [arXiv 2412.00804](https://arxiv.org/pdf/2412.00804) (from search snippet)
  - Li et al. 2024, "Measuring and Controlling Instruction (In)Stability in Language Model Dialogs": persona or system-prompt adherence measurably decays within about 8 rounds, attributed to attention decay on the system prompt. Proposed "split-softmax" — [arXiv 2402.10962](https://arxiv.org/abs/2402.10962) (from prior knowledge, not re-verified)
  - Multi-turn RL using drift metrics as rewards reports more than 55% less inconsistency (for simulated users) — [arXiv 2511.00222](https://arxiv.org/abs/2511.00222v1) (from search snippet)
  - An EMNLP 2025 context-aware personality evaluation found conversation context raises answer consistency but also causes personality shifts, most extreme in GPT-3.5/4-Turbo — [Underline EMNLP 2025](https://underline.io/lecture/132442-cape-context-aware-personality-evaluation-framework-for-large-language-models) (from search snippet)

### Inferences
- With a hosted writer (Mistral Large 3) there is no fine-tuning, so the drift fixes available are engine-level. These are: send only a short recent window plus a compact persona card on every call (rather than a long history), retrieve her own lines as few-shots, and use a checker that scores against a persona rubric. All of these exist in some form in Yuna's engine; the research supports keeping the context short and the persona re-stated each turn.
- The CoSER/Character-LLM data approach (inner thought + line) could be copied in-house for prompting, without training, by storing examples as {situation, her inner thought, her message}.

### Gaps
- RPBench / RPBench-Auto (Boson AI, 2024) was not looked up in this pass, so its method and status are unverified.
- Whether CoSER's dataset and models carry a commercial-use licence was not established; the repo has no detected licence.

## 3. Open-source chat front-ends/engines: mechanics for bursts, idle/proactive triggers, timing

### Takeaway
The open-source hobby ecosystem (SillyTavern, KoboldCpp, Agnai, Amica, Open-LLM-VTuber) offers practical mechanics, not measured results: summaries, vector recall, lorebooks, idle "proactive speak" prompts and compressed "subconscious" logs. Voice frameworks (Pipecat, LiveKit Agents) are the mature reference for **turn-taking and timing**. Research on text bursts and timing (Stephanie2, typing-behaviour and delay studies) supports splitting replies into several messages with think-plus-type delays.

### Cited Findings
- **SillyTavern**: 34.8k stars, AGPL-3.0, Node.js, maintained (pushed 2026-10-02) — [GitHub](https://github.com/SillyTavern/SillyTavern)
  - Summarize extension: automatically writes a running summary of chat events; the docs warn that summaries can drop details or hallucinate and should be checked — [SillyTavern docs: Summarize](https://docs.sillytavern.app/extensions/summarize/)
  - Vector Storage / Chat Vectorization: retrieves relevant past messages into context. An optional per-message summary is used only for the vector; the original message is what gets inserted. The docs say it "does not guarantee" better memory — [SillyTavern docs: Chat Vectorization](https://docs.sillytavern.app/extensions/chat-vectorization/)
  - Community "MessageSummarize" extension: summarises *each message* individually instead of using embeddings — [GitHub qvink/SillyTavern-MessageSummarize](https://github.com/qvink/SillyTavern-MessageSummarize)
  - Licence note: AGPL-3.0 means code copied into a networked service carries copyleft duties. Borrow ideas, not code.
- **Open-LLM-VTuber**: 14.2k stars, custom licence ("NOASSERTION"), Python, last push 2026-05-15. Its code has a `proactive_speak` input flag and a configurable `proactive_speak_prompt` in `conf.default.yaml`, so the character can speak without user input — [GitHub search results in repo](https://github.com/Open-LLM-VTuber/Open-LLM-VTuber)
- **Amica**: 1.6k stars, MIT, TypeScript/Next.js (portable to Node), pushed 2026-09-22. "Amica Life" runs semi-autonomously with sleep, self-prompting and a "Subconscious Subroutine" that "stores compressed conversation logs with timestamps" to influence future replies — [Amica docs: amica-life.md](https://github.com/semperai/amica/blob/master/docs/overview/amica-life.md)
- **KoboldCpp**: 12.0k stars, AGPL-3.0, very active; a local inference front-end with World Info / memory / Author's Note mechanics — [GitHub](https://github.com/LostRuins/koboldcpp)
- **Agnai (agnaistic)**: 788 stars, AGPL-3.0, TypeScript, pushed 2026-06 — [GitHub](https://github.com/agnaistic/agnai)
- **Pipecat**: 16.7k stars, BSD-2-Clause, very active; real-time voice agent framework. Its companion **smart-turn** model (1.6k stars, BSD-2, last push 2026-01) predicts end of turn — [GitHub pipecat](https://github.com/pipecat-ai/pipecat); [GitHub smart-turn](https://github.com/pipecat-ai/smart-turn)
- **LiveKit Agents**: 14.9k stars, Apache-2.0, very active; also has turn-detection components — [GitHub](https://github.com/livekit/agents)
- **ParlAI** (Meta; home of BlenderBot, MSC, PersonaChat tooling) is now archived (archived = true, MIT) — [GitHub](https://github.com/facebookresearch/ParlAI)
- **Timing / burst research**
  - Stephanie2: send-or-wait at each step; latency = thinking + typing time; better naturalness and engagement and a higher Turing-style pass rate than single-shot step-by-step — [arXiv 2601.05657](https://arxiv.org/abs/2601.05657)
  - Human-like typing (hesitation + self-editing; Zhou & Hu, CUI '24): users preferred the agent with both hesitation and self-editing, and rated it more natural and trustworthy. Numbers were not on the abstract page — [arXiv 2510.08912](https://arxiv.org/abs/2510.08912)
  - Dynamically delayed replies were rated more human-like with higher social presence than near-instant replies, though participants knew it was a bot. Delays can hurt satisfaction where speed is expected — [ECIS 2018 (Gnewuch et al.)](https://aisel.aisnet.org/ecis2018_rp/113/) (via search summary)
  - HUMA (arXiv 2511.17315): simulated realistic response times in group chats, and participants classified the agents as human at near-chance rates — [arXiv 2511.17315](https://arxiv.org/html/2511.17315v1) (via search summary)

### Inferences
- Mechanics worth porting into the Node engine:
  - (1) Burst splitting: plan one reply, emit it as 1–3 bubbles, each delayed by think time + characters ÷ typing speed with jitter.
  - (2) A "proactive" trigger after a silence window, gated by an Inner-Thoughts-style motivation score so it does not nag.
  - (3) Per-message micro-summaries (the MessageSummarize idea) to feed the story summary.
- Because Yuna's output is not sent live to Fanvue yet (per project memory), timing matters for the practice window and the future send path, not today's text quality.

### Gaps
- No open-source project was found that publishes *measured* engagement gains from idle or proactive triggers in one-to-one text chat.
- "talkie"-like open clones were not surveyed in this pass.

## 4. Datasets of real human casual chat (style examples / fine-tuning) and licences

### Takeaway
Classic dialogue datasets are mostly crowdsourced role-play or written English-learner dialogue. Those sources are clean but stilted, and several are non-commercial. Real texting corpora (NUS SMS) exist but have unclear licences and are dated (2010–2015). For a commercial product, these are better used as internal *reference and evaluation* material, or to shape a rubric, than copied verbatim as examples.

### Cited Findings
- **DailyDialog** (Li et al., 2017; about 13k written daily-life dialogues from English-learning sites): licence CC BY-NC-SA 4.0, which is **non-commercial** — [HF dataset card](https://huggingface.co/datasets/daily_dialog); [ConvLab mirror metadata](https://huggingface.co/datasets/ConvLab/dailydialog/blob/main/README.md); paper [arXiv 1710.03957](https://arxiv.org/abs/1710.03957)
- **PersonaChat** (Zhang et al., 2018): crowdworkers chat while role-playing 5-sentence persona cards. Known to be stilted and question-heavy — [arXiv 1801.07243](https://arxiv.org/abs/1801.07243) (licence not verified)
- **Multi-Session Chat (MSC)** (Xu et al., 2021, "Beyond Goldfish Memory"): up to 5 sessions per pair with time gaps, plus per-session persona summaries. It is the classic long-term chat set — [arXiv 2107.07567](https://arxiv.org/abs/2107.07567) (licence not verified; ParlAI, its home, is archived — [GitHub](https://github.com/facebookresearch/ParlAI))
- **Topical-Chat** (Amazon Alexa, about 11k knowledge-grounded human-human conversations): repo 674 stars, no licence detected by GitHub (the README terms were not checked) — [GitHub alexa/Topical-Chat](https://github.com/alexa/Topical-Chat)
- **NUS SMS Corpus**: real SMS collected by NUS; the 2015 release has 55,835 English and 31,465 Chinese messages, in SQL/XML/JSON. No explicit licence was found, and the GitHub mirror asks users to notify the author and cite Chen & Kan (2013) — [GitHub WING-NUS/nus-sms-corpus](https://github.com/WING-NUS/nus-sms-corpus); [arXiv 1112.2468](https://arxiv.org/pdf/1112.2468)
- **CoSER** (book-derived dialogue with inner thoughts; see section 2): paper CC BY-NC-ND — [arXiv 2502.09082](https://arxiv.org/abs/2502.09082)
- **PIPPA**: real user role-play logs, but heavily NSFW, so out of scope — [arXiv 2308.05884](https://arxiv.org/abs/2308.05884)
- **LoCoMo / LongMemEval**: useful as *memory test suites* for the engine, not as style data — [arXiv 2402.17753](https://arxiv.org/abs/2402.17753); [arXiv 2410.10813](https://arxiv.org/abs/2410.10813)

### Inferences
- None of these match "flirty-friendly creator texting a fan over weeks". The project's own 35k-chat analysis and ai_examples library (per project memory) remain the best style source.
- External corpora are most useful for building a "human texting traits" checklist: short turns, fragments, reactions without questions, typos and lowercase, topic drift. NUS SMS is the closest real-texting reference but needs a licence check before any commercial use.

### Gaps
- CANDOR corpus (Reece et al., 2023, naturalistic video conversations), Conversation Chronicles (2023, synthetic long-term), and 2024–2026 human-texting datasets were not verified in this pass.
- Licences for PersonaChat, MSC and Topical-Chat were not confirmed from primary pages.

## 5. Which approaches show measured improvements in human-likeness or engagement?

### Takeaway
The strongest measured evidence is that a **casual humanlike persona prompt** roughly doubles how often an LLM passes as human. GPT-4.5 went from 36% without the persona to 73% with it. Small talk is the most common probing strategy, and **"knowing too much" or odd question handling** is what gives AIs away. Inner Thoughts (82% preference) and Stephanie2 (better naturalness and engagement) show gains from think-first and multi-message timing, and Generative Agents shows gains from reflection and planning.

### Cited Findings
- Turing test (Jones & Bergen, 2025), how often each system was judged human:

  | System | Win rate |
  |---|---|
  | GPT-4.5 with persona | 73% |
  | GPT-4.5 without persona | 36% |
  | LLaMa-3.1-405B with persona | 56% |
  | LLaMa-3.1-405B without persona | 38% |
  | ELIZA | 23% |
  | GPT-4o | 21% |

  PERSONA beat NO-PERSONA at p < 0.001. The persona was a "young person who is introverted, knowledgeable about internet culture, and uses slang" — [arXiv 2503.23674 HTML](https://arxiv.org/html/2503.23674)
- In the same study, small talk was the most common interrogator strategy (61% of games). The most common verdict reasons were linguistic style (27%) and interactional dynamics (23%). The reasons that best predicted a correct verdict were question handling and *lack of knowledge*: one judge cited a witness that "didn't know something that any AI should know" — [arXiv 2503.23674 HTML](https://arxiv.org/html/2503.23674)
- Inner Thoughts: 82% of pairwise human preferences, and significantly higher anthropomorphism, engagement and turn appropriateness than the baseline (simulation; multi-party) — [arXiv HTML 2501.00383v2](https://arxiv.org/html/2501.00383v2)
- Stephanie2: higher naturalness, engagement and Turing-style pass rate than Stephanie1 (numbers not on the abstract page) — [arXiv 2601.05657](https://arxiv.org/abs/2601.05657)
- Typing hesitation + self-editing: preferred, and rated more natural and trustworthy — [arXiv 2510.08912](https://arxiv.org/abs/2510.08912)
- Dynamic response delays: more human-like and higher social presence — [ECIS 2018](https://aisel.aisnet.org/ecis2018_rp/113/)
- Generative Agents: full memory + reflection + planning beat the ablations on believability — [arXiv 2304.03442](https://arxiv.org/abs/2304.03442) (from prior knowledge)
- CSIM inner monologue: beats baselines on its Cskills benchmark (numbers not verified) — [arXiv 2311.07445](https://arxiv.org/abs/2311.07445)
- Memory layers (Mem0, Zep) report *recall, accuracy and latency* gains, not human-likeness — [arXiv 2504.19413](https://arxiv.org/abs/2504.19413); [arXiv 2501.13956](https://arxiv.org/abs/2501.13956)

### Inferences
- For Yuna's small-talk problem, the evidence points to style, persona and turn-shape interventions over memory interventions:
  - a concrete casual persona voice (slang, brevity);
  - permission to give short reactive replies and not always ask a question;
  - selective ignorance (not an encyclopedia);
  - multi-bubble timing.
- Most "measured" results are small studies or multi-party settings. None measure weeks-long one-to-one companion chat, so in-house A/B tests (e.g. reply rate, conversation length, Claude-checker human-likeness score on the 4 test chats) remain necessary.

### Gaps
- No peer-reviewed study was found that measures engagement for long-running one-to-one companion text chats, comparing engine components such as reflection vs no reflection.
- Exact persona prompt text for the Turing study is in a figure (image) that was not read.
