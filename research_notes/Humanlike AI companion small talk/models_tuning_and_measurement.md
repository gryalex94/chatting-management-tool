# Models, tuning, sampling and measurement for human-like chat replies (as of Oct 2026)

Research date: 21 Oct 2026. Leaderboards in this area change monthly, and several sources below are third-party mirrors or aggregators, so treat every ranking as a dated snapshot. Model names such as "GPT-5.6 Sol" or "Claude Fable 5" appear exactly as the mirrors list them. I could not confirm them against the live eqbench.com table, which loads by script and returned empty to my fetcher.

## 1. Which models are best at natural, casual character chat (2025–2026)?

### Takeaway
On the only large public benchmark that measures "slop" (overused AI phrases), frontier closed models (Claude Sonnet 4.6/5, Opus, GPT-5.x) score far lower (better) than Mistral Large 3, which sits mid-table at about 28. The best open-weight options on that benchmark are GLM-5.2 and Kimi K2.6 (slop about 13). For volume roleplay, real usage on OpenRouter is dominated by cheap DeepSeek and GLM models, not Mistral. None of these benchmarks measures short, casual texting directly.

### Cited Findings
- **Creative Writing v3 (EQ-Bench) snapshot, sampled 2026-07-15**, from a mirror of the leaderboard. Elo / rubric (0–20) / slop, where lower slop is better:
  - GPT-5.6 Sol 2208 / 16.78 / 11.68; Claude Fable 5 2156 / 16.81 / 10.28; Claude Opus 4.7 2083 / 16.57 / 11.09; Claude Sonnet 4.6 1895 / 16.50 / **9.90** (lowest slop in the table); Claude Sonnet 5 1827 / 16.47 / 11.60.
  - Open-weight: GLM-5.2 1746 / 16.44 / 13.11; Kimi-K2.6 1716 / 16.67 / 13.30; Kimi-K2-Instruct 1679 / 15.51 slop; DeepSeek-V4-Flash 1564 / 20.92; DeepSeek-V4-Pro 1553 / 19.66; DeepSeek-V3.2 1493 / 23.19; Qwen3.5-397B-A17B 1486 / 24.32; Gemma 4 31B-it 1408 / 29.69; Gemma 4 12B-it 1270 / 32.31.
  - Mistral: Mistral Medium 3.1 1481 / 26.21; **Mistral-Large-3-675B-Instruct-2512 1410 / 15.49 rubric / 28.17 slop**; Mistral Small Creative 1371 / 29.61; Mistral-Small-3.2-24B 1242 / 32.82; Mistral-Nemo 970 / 56.72.
  - Cheap closed models: GPT-5 Mini slop 13.99; Claude 3.5 Haiku slop 22.00 (rubric 13.57).
  - Source: [benchmarklist.com mirror of Creative Writing v3](https://benchmarklist.com/benchmarks/creative_writing_v3/). The official page is [eqbench.com/creative_writing.html](https://eqbench.com/creative_writing.html); its table did not render for my fetcher.
- The Slop column "measures the frequency of words/phrases typically overused by LLMs". The list was built from word frequencies in a large set of generated stories, plus phrases from online lists. Creative Writing v3 Elo has used Claude Sonnet 4.6 as judge since 2026-03-01, so Elo values before and after that date don't compare. The pairwise criteria include "avoiding clichés", "avoiding flowery verbosity" and "character authenticity". Outputs are cut at 4,000 characters for judging, so the benchmark tests story writing, not texting. — [EQ-Bench About](https://eqbench.com/about.html)
- EQ-Bench 3 is now listed as a "legacy" leaderboard. It scores empathy and social skill (Demonstrated Empathy, Pragmatic EI, Social Dexterity, Message Tailoring, etc.) with Claude Opus 4.6 as judge. It also reports "Conversational", "Humanlike", "Warmth", "Validating" and "Compliant" style traits for visibility only; these don't count toward the score and the page doesn't define them. — [EQ-Bench About](https://eqbench.com/about.html); [search summary noting legacy status](https://eqbench.com/about.html)
- Spiral-Bench (Sam Paech) runs 30 simulated 20-turn chats against a Kimi-K2 "seeker" user. A judge ensemble (Sonnet 4.5, GPT-5, Kimi-K2-0905 in v1.2) scores sycophancy, delusion reinforcement and similar behaviours. In v1.0 (mid-2025), GPT-5 and o3 were safest (above 86), DeepSeek-R1-0528 scored 22.4, and GPT-4o behaved like a "glazer". — [eqbench.com/spiral-bench](https://eqbench.com/spiral-bench.html); [The Decoder](https://the-decoder.com/spiral-bench-shows-which-ai-models-most-strongly-reinforce-users-delusional-thinking/). This matters for a companion persona: high sycophancy reads as bot-like flattery.
- **OpenRouter roleplay usage share:**
  - Official page, dated March 2026: DeepSeek V3.2 37.0%, gpt-oss-120b 6.5%, Grok 4.1 Fast 5.8%, Hunter Alpha 5.6%. — [openrouter.ai/collections/roleplay](https://openrouter.ai/collections/roleplay)
  - Mirror copies dated September 2026: DeepSeek V4 Flash about 28.9% first, followed by DeepSeek V3.2, MiniMax M3 (free), GLM 5.3 Flash and MiMo V2.5. These mirrors are unofficial, so check the live page.
- A blog citing OpenRouter data from 2 Oct 2026 lists the most-used SillyTavern models over the prior 30 days as GLM 5.2, GLM 5.3 Flash, Gemini 3.8 Flash, DeepSeek V3.2 and DeepSeek V4.1 Flash. — [arcanumrpgs.com](https://arcanumrpgs.com/blog/best-model-for-sillytavern/) (secondary; not verified)
- **Community picks by GPU memory, from a Sept 2026 guide** (secondary source that defers to the r/SillyTavernAI weekly "Best Models" megathread):
  - 8 GB: L3-8B-Stheno-v3.2 or Anubis-Mini-8B
  - 12–16 GB: Rocinante-X-12B or Rocinante-XL-16B
  - 16 GB: Cydonia-24B v4.3
  - 24 GB: Qwen3.8-27B Heretic or Artemis-31B
  - The same guide says DeepSeek V4 Flash is "the best cheap model by a wide margin" and that frontier Claude and GPT write the best prose.
  - Sources: [isekaizero.ai](https://www.isekaizero.ai/blog/sillytavern-setup-guide); [tavernsprite.com](https://tavernsprite.com/blog/best-ai-models-for-sillytavern/)
- An April 2026 community list compiled from r/LocalLLaMA, r/LocalLLM and r/SillyTavernAI still names older roleplay fine-tunes: MythoMax-L2-13B, Midnight Miqu 70B, Behemoth-123B and Monstral-123B (both Mistral-Large-based), Dan's PersonalityEngine 24B and Gemma-2-Ataraxy-9B. It has no slop or naturalness ratings. — [swyx gist](https://gist.github.com/swyxio/324fc884061bf20e97a2ecbe59bae34a)
- **Mistral Large 3 (mistral-large-2512) price:** $0.50 per million input tokens, $1.50 per million output tokens, $0.05 for cached input, 256K context. This comes from aggregators citing Mistral's page. One says Large 3 is now the "previous flagship" sold alongside Large 4. — [pricepertoken](https://pricepertoken.com/pricing-page/model/mistral-ai-mistral-large-2512); [developersdigest](https://www.developersdigest.tech/models/mistral-large-3)

### Inferences
- Mistral Large 3's slop score (28) is about 2.5–3 times Claude Sonnet 4.6/5 (10–12) and about twice GLM-5.2 or Kimi K2.6 (13). On this measure, switching the writer model may do more than further prompt work. Kimi K2.6 and GLM-5.2 are the open-weight candidates to test first, since they are cheap on OpenRouter and reportedly more permissive than Claude.
- Low slop on long stories doesn't prove natural one-line texting. GPT-5 Mini and GPT-5 Nano have very low slop (14) but low Elo, which suggests slop partly tracks terse, plain output. An in-house blind test on Yuna-style turns is still needed (section 5).
- On an RTX 3070 (8 GB), only the 8B class runs comfortably (Stheno, Anubis-Mini, Ministral 8B). Mistral Small-based 24B models such as Cydonia need about 16 GB. In the same table, Mistral-family 8–24B bases score poorly (Small 3.2 slop 32.8, Nemo 56.7). Local hosting is therefore mainly useful for its sampler controls (section 3), not for model quality.

### Gaps
- I could not read the live eqbench.com tables (they load by script), the live OpenRouter roleplay ranking, or any r/SillyTavernAI megathread directly. Rankings above are from mirrors and blogs.
- I found no LMArena "creative" or "roleplay" breakdown, and no UGI leaderboard data in this pass.
- No benchmark I found measures short casual texting (one or two lines, lowercase, few questions) specifically. EQ-Bench 3's "Humanlike" and "Conversational" columns are the closest, but they are undefined and unscored.
- Several model names (GPT-5.6 Sol/Luna/Terra, Claude Fable 5, Gemini 3.8 Flash, GLM 5.3 Flash, DeepSeek V4.1 Flash) appear only in secondary sources I couldn't cross-check.

## 2. Is fine-tuning on real human texting worth it?

### Takeaway
Two published setups report that human-likeness preference tuning works on small open models (7–12B) without losing general skill: DPO on human-like vs formal answer pairs, and HAL's trait-based reward. Mistral's own self-serve fine-tuning API is deprecated; its replacement, Forge, is an enterprise contract. Practical routes are LoRA on an open model through Together or similar (from about $0.34–0.48 per million training tokens, $4 minimum), or local training of an 8B model.

### Cited Findings
- **"Enhancing Human-Like Responses in LLMs"** (arXiv 2501.05032, Jan 2025; AAAI-26 PerFM workshop):
  - Data: the Human-Like-DPO-Dataset, about 10,884 samples over 256 topics. Each sample is a casual question, a human-like answer (chosen) and a formal AI answer (rejected).
  - Method: DPO with LoRA on Llama-3-8B-Instruct, Qwen-2.5-7B-Instruct and Mistral-Nemo-Instruct-2407.
  - Result: anonymous voting found the tuned models "significantly outperformed official instruction models in conversational flow". The authors report no loss on general benchmarks. No independent replication found.
  - Sources: [arXiv PDF](https://arxiv.org/pdf/2501.05032); [hyper.ai dataset page](https://hyper.ai/en/datasets/37132); [Human-Like-LLama3-8B on Featherless](https://featherless.ai/models/HumanLLMs/Human-Like-LLama3-8B-Instruct)
- **HAL: Inducing Human-likeness in LLMs with Alignment** (arXiv 2601.02813, 2026): derives explicit conversational traits from contrastive dialogue data and combines them into one interpretable "human-likeness" score. That score becomes the reward for preference optimisation. The authors report models of several sizes aligned "without affecting their overall performance", and Chatbot-Arena-style human evaluations judged the aligned model more human-like more often. The abstract gives no numbers or trait list. — [arXiv](https://arxiv.org/abs/2601.02813)
- **Antislop / FTPO** (Paech et al., ICLR 2026): plain DPO used to remove slop "suffers significant degradation in writing quality and lexical diversity". Their token-level method (Final Token Preference Optimization) achieves about 90% slop reduction while holding GSM8K, MMLU and creative-writing scores. Code is MIT-licensed. — [arXiv 2510.15061](https://arxiv.org/abs/2510.15061); [ICLR 2026 poster](https://iclr.cc/virtual/2026/poster/10008156)
- **Mistral fine-tuning:** the docs page is now under "Deprecated features", described as "no longer actively supported". Fees shown there: $4 minimum per job, $2 per model per month storage. — [docs.mistral.ai/capabilities/finetuning](https://docs.mistral.ai/capabilities/finetuning/). A tracker says the mistral-finetune repository was archived on 16 June 2026 (unconfirmed). — [developersdigest](https://www.developersdigest.tech/deprecations/mistral)
- **Mistral Forge** (announced 17 March 2026): an enterprise service with SFT, DPO/RLHF, LoRA and distillation. It has no public price, API reference or self-serve signup, and engagements involve Mistral engineers. — [DataCamp](https://www.datacamp.com/blog/mistral-forge); [The Deep View](https://www.thedeepview.com/articles/mistral-unveils-forge-to-build-custom-ai-models)
- **Together AI** bills fine-tuning per token processed (epochs × training tokens plus validation), with different rates for SFT vs DPO and LoRA vs full tuning. Reported LoRA SFT rates are $0.48 per million training tokens up to 16B, $1.50 for 17–69B and $2.90 for 70–100B. A directory lists Llama 3.1 8B at $0.34 per million ($4 minimum). These are third-party figures; check them before relying on them. — [Together docs](https://docs.together.ai/docs/fine-tuning/pricing); [eesel.ai](https://eesel.ai/blog/together-ai-pricing); [developersdigest](https://www.developersdigest.tech/models/fine-tuning/together-ai)
- **Related evidence on simulating people:**
  - Models match human meaning better than human style. They "struggle to mirror human syntax, style, and conversational dynamics" and keep talking when a human would stop.
  - "The choice of prompt instructions significantly impacts the quality of simulations, often more so than the choice of the simulator model" (100k WildChat dialogues).
  - Source: [Ivey et al., "Real or Robotic?", arXiv 2409.08330 / Findings ACL 2026](https://arxiv.org/html/2409.08330v2)

### Inferences
- Worked cost example (assumed numbers): 5,000 real Yuna-style exchanges at about 300 tokens each is 1.5M tokens. Three epochs is 4.5M tokens, which at about $0.5 per million is roughly $2–3, so the $4 minimum applies. Training is cheap. The real cost is building clean chosen/rejected pairs and hosting a LoRA (dedicated endpoints bill by the minute), unless a provider offers serverless LoRA.
- For DPO pairs, use human-written chat turns as "chosen" and the current engine's replies to the same context as "rejected". This is the same structure as Human-Like-DPO, but in Yuna's own domain. Antislop's results warn that plain DPO can reduce lexical diversity, so check distinct-n after tuning.
- Project memory says the user considers Yuna's old Fanvue chats "garbage" and wants the AI to learn only from the 35k analysis library. Any SFT/DPO set should come from that curated library or from new human-written turns, not raw history.
- Fine-tuning isn't available on Mistral Large 3 through a self-serve API. Tuning the writer means moving to an open model (Mistral Small/Nemo base, Qwen, Gemma, Llama) hosted on Together, Fireworks or a local GPU.

### Gaps
- I didn't find an authoritative current per-token training price for Mistral; the pricing page wasn't fetched. Together's DPO rate and serverless-LoRA inference pricing were also not found.
- I found no independent replication of the Human-Like DPO or HAL gains, and no reports on how much data is needed specifically for texting style.
- I found no public dataset of real human romantic or flirty small talk suitable for "chosen" replies.

## 3. Anti-slop and sampling techniques, and where each is available

### Takeaway
Plain token banning (logit bias) breaks down at about 2,000 banned patterns. The Antislop sampler's backtracking handles 8,000+ phrases. The strongest variety controls (min-p at higher temperature, DRY, XTC, banned strings) are mostly local-runtime features (llama.cpp and similar). The Mistral API offers only temperature, top_p, top_k, frequency, presence and repetition penalties, plus `n` (several candidates, input billed once); it has no logit_bias or min_p. OpenRouter forwards min_p, top_a, repetition_penalty and logit_bias, but whether they apply depends on the provider.

### Cited Findings
- **Antislop sampler** (arXiv 2510.15061; v1 16 Oct 2025; ICLR 2026): an inference-time sampler that backtracks when a banned string appears, plus an automatic pipeline that compares a model's slop profile against human writing. "The Antislop Sampler successfully suppresses 8,000+ patterns while maintaining quality, whereas token banning becomes unusable at just 2,000." — [arXiv](https://arxiv.org/abs/2510.15061); [Thoughtworks summary](https://research.thoughtworks.com/library/antislop-framework-identifying-eliminating-repetitive-patterns-language-models)
- **Min-p** (Nguyen et al., ICLR 2025 oral): keeps tokens whose probability is at least p times the top token's. It holds coherence at high temperature where top-p degrades, and human raters preferred its outputs for quality and diversity. It is adopted in Hugging Face and vLLM. — [ICLR proceedings](https://proceedings.iclr.cc/paper_files/paper/2025/hash/afa5f124e36bed5cc2125067005d43f5-Abstract-Conference.html); [arXiv 2407.01082](https://arxiv.org/pdf/2407.01082v8)
- **llama.cpp samplers:**
  - min_p defaults to 0.05.
  - XTC ("exclude top choices") has probability and threshold settings; the threshold defaults to 0.10, and values above 0.5 disable it.
  - DRY (added in PR #9702) has multiplier, base, allowed length, penalty window and sequence breakers.
  - Default chain: penalties; dry; top_n_sigma; top_k; typ_p; top_p; min_p; xtc; temperature.
  - One comparison lists DRY, XTC, typical sampling and dynamic temperature as supported in llama.cpp but not in Ollama.
  - Sources: [smcleod.net guide](https://smcleod.net/2025/04/llm-sampling-parameters-guide/); [llama.cpp DRY commit](https://cdn04132025.gitlink.org.cn/replica/llama.cpp/commit/ff252ea48e90e6552010fd74584334fb41bdd387); [alexewerlof blog](https://blog.alexewerlof.com/p/sampling-args-in-llama-server)
- **Mistral chat API parameters:**
  - Available: temperature (recommended 0.0–0.7), top_p, top_k, frequency_penalty, presence_penalty, repetition_penalty, random_seed, stop, min_tokens, max_tokens, prediction.
  - `n` returns several completions, and input tokens are billed once.
  - Not listed: logit_bias and min_p.
  - Source: [docs.mistral.ai/api/endpoint/chat](https://docs.mistral.ai/api/endpoint/chat)
- **OpenRouter parameters:** temperature 0–2, top_p, top_k, min_p, top_a, frequency_penalty, presence_penalty, repetition_penalty 0–2, logit_bias (−100 to 100, by token ID) and seed. Support varies by provider, and DRY and XTC are not documented. — [OpenRouter parameters](https://openrouter.ai/docs/api/reference/parameters)

### Inferences
- What is available today on Mistral Large 3:
  - **Several candidates per call.** `n` = 3–5 at temperature about 0.8–1.0, with the existing Haiku checker or a cheap judge picking one. Because input is billed once, 4 candidates of about 60 output tokens add about 240 × $1.50 per million, which is about 0.036 cents.
  - **Mild frequency/presence penalties** to discourage repeated openers.
  - **Generate-then-filter** with the code's banned-phrase list, which is a crude backtracking: reject the candidate and pick another.
  - **No logit_bias**, so token-level bans are impossible on Mistral's own API.
- Worked per-reply cost (assumed sizes): about 4k input tokens costs 0.2 cents (0.02 cents if cached), plus about 4 × 60 output tokens at 0.036 cents. Total is about 0.06–0.25 cents per reply before the Haiku check, inside the 0.3–0.6 cent budget.
- The banned list should come from data, not intuition. The Antislop pipeline compares the engine's own output frequencies against a human chat corpus, which could be Yuna's curated 35k analysis library. The MIT-licensed code could produce that list, and the same list could later drive FTPO if the team moves to a tunable open model.
- DRY, XTC and true phrase-backtracking need a self-hosted runtime (llama.cpp/KoboldCpp on the RTX 3070 for 8B models, or a rented GPU for larger ones).

### Gaps
- I could not confirm KoboldCpp's exact phrase-banning or anti-slop feature name, or its backtracking behaviour; the search returned nothing relevant. The same goes for TabbyAPI/ExLlama banned strings.
- I found no controlled study of how temperature alone changes blandness in short chat replies.
- I didn't check which OpenRouter providers for Kimi K2.6 or GLM-5.2 actually honour min_p and logit_bias.

## 4. Prompting techniques with evidence

### Takeaway
The strongest evidence is the Jones and Bergen Turing test. The same model went from 36% to 73% "judged human" just by adding a detailed persona-and-style prompt, and interrogators mostly decided on linguistic style and conversational dynamics. The WildChat simulation study also found prompt wording matters more than model choice. I found no rigorous public evidence for "humanizer" rewrite passes or best-of-n reranked for human-likeness in chat.

### Cited Findings
- **Jones and Bergen, "Large Language Models Pass the Turing Test"** (arXiv 2503.23674, March 2025):
  - Setup: three-party, 5-minute chats.
  - With a PERSONA prompt, GPT-4.5 was picked as the human 73% of the time and LLaMa-3.1-405B 56%. Baselines: GPT-4o 21%, ELIZA 23%.
  - Without the persona prompt: GPT-4.5 36% and LLaMa 38%; both were significantly below chance with undergraduate judges. "Prompting with a humanlike persona was crucial for success."
  - The persona was a young person "relatively introverted and interested in internet culture" who uses slang. Each game appended a random name, city, languages and timestamps. The full prompt is only in Figure 6 (an image), which I couldn't read.
  - Interrogator reasons: linguistic style 27% (typos, informal tone), interaction dynamics 23%, socio-emotional factors frequent, knowledge and reasoning rare. Directness in answering and admitting lack of knowledge were among the most accurate cues.
  - Sources: [arXiv HTML](https://arxiv.org/html/2503.23674v1); [arXiv abs](https://arxiv.org/abs/2503.23674v1)
- **Real or Robotic?** (Ivey et al.): prompt instructions matter "often more so than the choice of the simulator model". LLM simulators keep talking when humans would end, and simulate well only humans who already write like an LLM. — [arXiv 2409.08330](https://arxiv.org/html/2409.08330v2)
- **HumT/DumT** (Cheng, Yu, Jurafsky; ACL 2025): human-like tone correlates with warmth, social closeness, femininity and low status. Users often prefer less human-like LLM output in assistant settings. The metric scores text by relative probability under an LLM after human-context phrases ("She said") vs inanimate ones ("It said"). — [ACL Anthology](https://aclanthology.org/2025.acl-long.1261); [arXiv 2502.13259](https://arxiv.org/html/2502.13259v1)
- **Best-of-n / reranking:** the closest work, HAL, generates several candidate dialogues and scores them with a human-likeness judge, but uses the ranked pairs for preference training rather than choosing at inference time. Older persona work reranks candidates with a natural-language-inference model to drop persona contradictions. — [HAL arXiv 2601.02813](https://arxiv.org/abs/2601.02813); [Song et al. AAAI 2020](https://ojs.aaai.org/index.php/AAAI/article/view/6417)

### Inferences
- The Turing-test result supports a very concrete persona: life details, a casual and slightly low-effort typing style, permission not to know things, and short direct answers. Abstract rules ("sound human") have less support. Their winning cues (directness, admitting ignorance) match the project's existing "few questions, no stalling" rules.
- A per-chat random life context (a day's plans, location and time, as the study appended timestamps and city) is cheap to add and was part of the winning setup.
- Example-led prompting (few-shot from the curated 35k library) fits the "Real or Robotic" finding that models copy meaning better than style. Showing the style beats describing it, though I found no direct head-to-head study for chat.
- Placing style rules after the chat history and best-of-n plus a judge are standard practitioner techniques, but this pass found no controlled study of either for chat. Treat them as things to A/B test in-house.

### Gaps
- I could not read the full text of the Jones and Bergen persona prompt (Figure 6 is an image). The PNAS publication was claimed by one news source and not confirmed.
- I found no controlled evidence on post-history instruction placement, "humanizer" second passes, or few-shot vs description for texting style.

## 5. How to measure human-likeness automatically

### Takeaway
LLM judges are biased toward longer and more familiar (lower-perplexity, more AI-like) text. AI-text detectors are near chance on texts under about 100 words. Neither is reliable alone for short chat replies. A sturdier set is: distribution metrics compared to real human chat (length, question rate, distinct-n, slop-phrase rate), plus position-swapped pairwise blind judging against human replies, plus periodic human blind tests.

### Cited Findings
- **Verbosity bias:** judges tend to favour longer answers (Zheng et al. 2024). One practitioner report says an AlpacaEval win rate moved from 22.9% to 64.3% just by asking for longer answers. Results vary: one study found Claude Sonnet 4 alone prefers concise answers. — [PromptLayer glossary](https://www.promptlayer.com/glossary/llm-as-judge-bias); [Grepture](https://grepture.com/blog/llm-as-a-judge-bias); [Judging the Judges, arXiv 2604.23178](https://arxiv.org/pdf/2604.23178)
- **Self-preference / familiarity bias:** LLM judges give "significantly higher evaluations to outputs with lower perplexity than human evaluators, regardless of whether the outputs were self-generated". In other words, judges reward text that is predictable to them, which is the opposite of idiosyncratic human texting. — [Wataoka et al., arXiv 2410.21819](https://arxiv.org/pdf/2410.21819)
- **EQ-Bench's bias controls, a usable template:** judge each pair in both orders and average; truncate to a standard length; anonymise model names. Self/family bias, verbosity and positivity remain uncontrolled. — [EQ-Bench About](https://eqbench.com/about.html)
- **AI-text detectors on short text:**
  - Statistical and fine-tuned detectors "require on the order of at least 100 words for accurate classification".
  - For short survey answers, detector accuracy was "no better than the chance level".
  - Concatenating 10 tweets lifted a RoBERTa detector from 80% to near 100%.
  - Sources: [arXiv 2406.15583](https://arxiv.org/pdf/2406.15583); [arXiv 2308.07499](https://arxiv.org/pdf/2308.07499); [arXiv 2508.08096](https://arxiv.org/pdf/2508.08096)
- **Model-based human-tone metric:** HumT scores the relative likelihood under a small language model of text in a human context vs an "it" context. It runs offline and costs nothing per call. — [HumT DumT](https://arxiv.org/html/2502.13259v1)
- **Style mismatches to measure:** "Real or Robotic?" quantified systematic differences in multiple text properties between LLM and human turns (style, syntax, conversation length and ending). Its metric suite is a model for comparing distributions. — [arXiv 2409.08330](https://arxiv.org/html/2409.08330v2)
- **Slop-phrase rate:** EQ-Bench's slop score is a match rate against a list of over-represented words. The Antislop pipeline builds such lists by comparing model output with human text. — [EQ-Bench About](https://eqbench.com/about.html); [Antislop](https://arxiv.org/abs/2510.15061)
- **Human blind tests:** the three-party Turing setup (judge sees human and AI side by side and picks the human) gave clear separations between prompts and models with a few hundred games. — [Jones and Bergen](https://arxiv.org/html/2503.23674v1)

### Inferences
- Suggested automatic scorecard per engine version, comparing about 500 replies against the same contexts' real human (chatter) replies:
  - length in words and characters (mean, median, spread)
  - share of replies containing "?"
  - distinct-1 and distinct-2 across replies
  - repeated-opener rate
  - slop-phrase rate (data-driven list)
  - emoji and punctuation rates
  - share of lowercase-start messages
  - The goal is the smallest distance between the engine's and the humans' distributions, not maximising any single number.
- For the judge: pairwise "which reply was written by a human?" with the real human reply as one option, both orders, matched lengths. Use a judge from a different family than the writer (e.g. not Mistral judging Mistral). Track the judge's "fooled" rate. Don't use absolute 1–10 "humanness" scores, which are most exposed to verbosity and familiarity bias.
- Don't run AI detectors on single replies. If used at all, concatenate 10+ replies per conversation and use only as a trend line.
- A small human panel (e.g. the chatters) doing 50 blind A/B pairs per release gives the ground truth for checking the automatic scorecard.

### Gaps
- I found no published study of LLM-judge accuracy specifically at telling human from AI short chat messages.
- I found no published reference distributions (length, question rate) for real human one-to-one flirty or casual chat. These must come from the team's own data.
- The HAL paper's trait list and judge (reportedly "HL16Q") were not visible in the abstract; reading the full paper could give a ready-made human-likeness rubric.
