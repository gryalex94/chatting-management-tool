# Fact check: tools and policy links (second report)

Report checked: `fanvue-conversation-research.md` (ChatGPT, 21 Oct 2026), sections 7, 8 and 10.
Checked on 21 Oct 2026 by fetching each page live (WebFetch plus a raw `curl` copy). All 10 links returned HTTP 200 with the expected page.

## Verdict table

| # | Link | Resolves? | Claim supported? | Evidence / notes |
|---|---|---|---|---|
| 1 | https://docs.langchain.com/oss/python/langgraph/overview | Yes (200) | **Yes** (one word is a stretch) | Page calls it a framework for "long-running, stateful agents". It lists "durable execution, streaming, human-in-the-loop". Persistence: agents "persist through failures… resuming from where they left off". Human intervention: "inspecting and modifying agent state at any point". **"Branching"** isn't on the page as a word. The nearest is "mix deterministic steps with LLM-driven agentic steps in a single graph". The report's caveat is also backed: "LangGraph does not abstract prompts or architecture". |
| 2 | https://rasa.com/docs/learn/concepts/calm/ | Yes (200) | **Yes** | "LLMs keep the conversation fluent but don't guess your business logic". Flows handle the steps. It "detects and handles common conversational patterns like topic changes, corrections". The report's point that it's for customer-service/transactional flows is fair. |
| 3 | https://docs.letta.com/v1-sdk/memory/memory-blocks | Yes (200) | **Yes** | Blocks are "sections of the agent's context window that persist across all interactions". They can be made read-only with `read_only: true`. The sidebar files this page under **"V1 SDK (legacy)"**, and a newer "Agent SDK" exists. That backs the report's "verify the chosen SDK generation" warning. The report could have said outright that the linked page is the legacy SDK. |
| 4 | https://docs.mem0.ai/core-concepts/memory-operations/add | Yes (200) | **Yes** | "New memories are added without overwriting or deleting existing memories." The comparison table says "ADD-only" for both Platform (managed) and OSS. So "managed and open-source interfaces" is also correct. The page warns duplicates can happen when mixing `infer=False`/`infer=True`. That backs "evaluate… duplicates". (Older Mem0 versions did ADD/UPDATE/DELETE, so this warning matters.) |
| 5 | https://help.getzep.com/graphiti/getting-started/welcome | Yes (200, v4 docs) | **Yes** | "Build temporal Context Graphs with the open-source Graphiti framework". The graph "incrementally updates… so relationships and facts can evolve". It offers "hybrid search… combining semantic, keyword, and graph-based retrieval". |
| 6 | https://docs.mistral.ai/models/ | Yes (200; redirects to `/models`) | **Yes** | Has a "Deprecated & retired models" section ("Older models that have been deprecated or retired"). Its table gives version, API name, deprecation date, retirement date and replacement. **Ministral 8B 24.10 (`ministral-8b-2410`)** was deprecated 2 Dec 2025 and retired 31 Dec 2025, replaced by **Ministral 3 8B (v25.12)**. Our code already pins `mistralai/ministral-8b-2512` (Ministral 3 8B) in `server/src/utils/aiChat.js` (PICKER) and `server/src/integrations/openrouter.js`. So the report's "which generation is running?" worry is answered: the current one. |
| 7 | https://www.anthropic.com/legal/aup | Yes (200) | **Both claims are correct, with three caveats** | See the "Anthropic" section below. Short version: the page today is a **new version, "Effective Nov 12, 2026"** (3 weeks from now). The version in force today is dated 15 Sep 2025 (checked via the Wayback Machine, 31 Aug 2026 snapshot). **Both** versions list "Engage in erotic chats" under "Do Not Generate Sexually Explicit Content". Both list "train an AI model… without prior authorization from Anthropic" under "Do Not Abuse Our Platform". So the training rule **is in the AUP itself**. The Commercial Terms add a separate, narrower rule: D.4, no using the Services "to train competing AI models". |
| 8 | https://legal.mistral.ai/terms/usage-policy/ | Yes (200) | **Yes** | Effective 11 Jun 2026. Scope covers "Mistral AI products accessible on our platform or applications". It "does not apply to Mistral AI Products deployed on a customer's infrastructure, on the infrastructure of our partners, or to our open-source AI models and products." The report missed one point. This policy has **no general ban on adult/erotic text**. It bans non-consensual intimate images, CSAM, and content that "exploits individuals, including through human trafficking or sexual services". |
| 9 | https://legal.fanvue.com/api-policy | Yes (200) | **Yes on every point; one wording is slightly stronger than the source** | "Updated: 16th October 2026" is correct. Creator authorisation and "review, pause and switch off AI messaging at any time" are correct (§4.3(2)(1)). The ban on deceptive live-human presentation is correct (§4.3(2)(2)). "Requires honesty when asked about AI" is **slightly stronger than the text**. §4.3(2)(3) only says "Not deny being AI when a Fan **sincerely** asks". The stronger "answer clearly, no dodging" rule is in the help article (#10). §5.2(13) on AI training is correct, and the section number is right: the list is a numbered `<ol>`, item 13. One nuance: §5.2 bans "Apps whose purpose, or a substantial part of whose functionality" falls in a category. The "automating the website/apps outside the API" ban is correct, but it's **§5.1(10)**. The report gives no number for it. |
| 10 | https://help.fanvue.com/en/articles/17637130-ai-labels-and-disclosure | Yes (200) | **Yes** | Page metadata `dateModified` 2026-10-16. "The AI label on your profile counts as disclosure, so you can stay in character." If a fan asks directly, "you must answer yes, clearly. Don't ignore, dodge, joke or deny." "You can continue in character afterwards." "Never tell fans the AI label is wrong." Doing so can lead to "warnings and refunds of affected purchases". |

## Anthropic Usage Policy: what it says and what it means for us

**Versions.** On 21 Oct 2026 anthropic.com/legal/aup shows the version effective **12 Nov 2026**. Its page data marks it `isLatest: true`, created 28 Sep 2026. The previous version, in force until then, is dated **15 Sep 2025**. The report calls this the "current policy" without noticing the page shows a version that isn't in force yet. It doesn't change the conclusion, because both versions have the same two rules.

**Claim 1: "prohibits erotic chats and generating sexually explicit content".** Supported. The section is "Do Not Generate Sexually Explicit Content". It covers using the products or services to:
- "Depict or request sexual intercourse or sex acts"
- "Generate content related to sexual fetishes or fantasies"
- "Facilitate, promote, or depict incest or bestiality"
- "Engage in erotic chats"

**Claim 2: "restricts using outputs to train models without prior authorization".** Supported, and it **is in the AUP** ("Do Not Abuse Our Platform"):
- Nov 2026 wording: "Use outputs to train an AI model (e.g., 'model scraping' or 'model distillation') without prior authorization from Anthropic".
- Sep 2025 wording, broader: "Utilization of **inputs and outputs** to train an AI model…".
- The Commercial Terms add D.4: no access "to build a competing product or service, including to train competing AI models". Commercial Terms B also says "Anthropic may not train models on Customer Content from Services".

**What this means for using Claude as a reviewer or judge.**
- **No industry ban.** The Nov 2026 AUP says its rules "do not categorically prohibit use by any particular industry or line of business". Using Claude for non-sexual planning, reading and judging inside an adult-platform product isn't banned in itself.
- **Inputs count too.** The AUP "applies to anyone who submits inputs". The sexual rules are framed as using the service to "depict or **request**" sex acts or "engage in erotic chats". Asking Claude to improve, rewrite or plan a sexual message is clearly out. That includes "make this sext better" and "plan the next explicit step".
- **No clear exemption for reading or grading.** Passively reading a transcript that contains sexual turns and grading the non-sexual parts isn't named as banned. The policy also gives **no explicit moderation/classification exemption** for sexual content. The only "content moderation" carve-out sits inside the surveillance section.
- **Expect blocks.** The policy warns "real-time safeguards… may block or limit certain outputs". The report's advice to "record refusals separately from quality failures" fits this. Our code already handles `stop_reason === 'refusal'` in `server/src/integrations/openrouter.js`.
- **Practical reading.** Keep Claude out of anything that writes, edits or steers sexual content. Trim or summarise the explicit turns before sending history to Claude where possible. Log refusals.
- **Code fact the report didn't know.** The default "reader" is Claude (`READER = process.env.AI_CHAT_READER || 'claude-haiku-5-5'`, `server/src/utils/aiChat.js` line 42). It reads the chat to estimate things like sexual level. Sexual turns of the transcript therefore probably reach Claude today, and that's the boundary the report says to define.
- **Training rule.** If Claude's verdicts or rewrites are later used to fine-tune a model (Mistral or any other), the AUP rule applies and needs Anthropic's prior authorisation. Using Claude outputs as **few-shot examples in prompts** isn't "training". Starred replies that join the example library are fine on that point, unless they're later used for fine-tuning.
- **Disclosure rule the report didn't mention.** The AUP (Additional Use Case Guidelines) requires consumer-facing chatbots to "disclose to users that they are interacting with AI rather than a human". This must happen at the start of each session or "in the product interface". Fanvue's AI label on the profile probably satisfies "in the product interface". The AUP also bans fake personas used "to convince people they are interacting with a human when they are not".

## Mistral: which policy actually applies to us

- Our writers go through **OpenRouter**. Mistral Large 3 uses the agency's own Mistral key connected in OpenRouter (comment in `server/src/integrations/openrouter.js`, 19 Oct 2026). So it's probably served by Mistral's own platform, and **Mistral's Usage Policy applies**. That policy has no general adult-text ban.
- The fallback writers are **Euryale 70B and Cydonia 24B**, not Mistral. They're governed by OpenRouter's terms and whichever host serves them.
- So the report is right that "the deployment path matters". In practice it differs per model. Each writer's host terms should be checked, not just Mistral's.

## Fanvue API Access & Usage Policy: key wording (updated 16 October 2026)

Source: https://legal.fanvue.com/api-policy (also served as clean text at `/api-policy.md`). Section numbers follow the page's numbered lists.

**§4.2 Content Policies Apply to All Apps**
- (1) Anything an App creates, sends or displays "is treated as User Content of the User on whose behalf it acts". It must comply with the Community Guidelines, the Acceptable Use Policy and all other Fanvue content policies.
- (3) "App Builders must not design or configure an App to bypass, interfere with or evade Fanvue's moderation systems…"
- (4) "Creators remain responsible for content published or sent from their account, including content produced by an App they have authorised."

**§4.3 AI Disclosure**
- Applies to "Apps that use artificial intelligence to generate, edit or send content", in addition to Community Guidelines Section D.
- (1) AI-generated media: images, video and audio must carry "a clear and prominent disclosure that they are AI-generated". The App "must apply or preserve that disclosure, and must not remove or obscure it."
- (2) AI chat and personas. Apps that generate or send messages on a Creator's behalf using AI, or that operate an AI persona or chatbot, must:
  1. "Only operate with the authorisation of the Creator whose account they act for, and allow that Creator to review, pause and switch off AI messaging at any time;"
  2. "Not be designed or configured to deceive Fans into believing they are interacting live with a real person when they are not, in line with the Acceptable Use Policy – Content Authenticity & Quality;"
  3. "Not deny being AI when a Fan sincerely asks whether they are talking to a real person;"
  4. "Not generate messages or media that would be prohibited under Fanvue's content policies."
- (3) Real people: no generating or copying a real person's likeness or voice without documented consent and identity verification.
- (4) Minors: no content depicting or resembling anyone under 18. "Prompt text or disclaimers are not sufficient…"

**§5.1 Prohibited Conduct (relevant items)**
- (4) "Exceeding Rate Limits, failing to respect Retry-After guidance, or attempting to evade Rate Limits (for example, by spreading traffic across multiple Apps or accounts)."
- (10) "Asking Users for their Fanvue password, two-factor authentication codes or session cookies, or automating Fanvue's website or apps outside the API, contrary to the Acceptable Use Policy – Section 5."
- (13) "Any use contrary to the Acceptable Use Policy, the Community Guidelines or this Policy."

**§5.2 Prohibited Apps**
- Opening wording: "Fanvue does not permit Apps whose purpose, or a substantial part of whose functionality, falls into any of the categories below." The list is "not exhaustive".
- (6) Data harvesting: "Building or selling databases of Fans or Creators, profiling Users for resale…"
- (8) Fake engagement: includes bots "posing as Fans".
- (11) Spam and moderation evasion: includes hiding prohibited content "through codewords, obfuscation or altered media".
- **(13) AI training:** "**AI training on Fanvue content or data**: Using content, messages or other data obtained through the API to train, fine-tune or otherwise develop AI or machine learning models, unless expressly authorised by Fanvue and by the Users concerned."

**§6 Rate Limits**
- Counted "per App for each User it acts for". Exact numbers are in the API docs, not the policy.
- Must "Implement exponential backoff and honour Retry-After".
- Fanvue may tighten limits.

**§7.1 Data protection (App Builder)**
- The App Builder becomes a data controller or processor. It must not keep personal data "longer than necessary for the purposes disclosed to users".
- It must answer data subject access requests (DSARs) and keep its own privacy policy.
- It must process data "only for purposes disclosed to users at the time of authorisation".
- No specific retention period is set.

**§7.4 External integrations**
- Lists "AI services" by name. "You are solely responsible for ensuring your use of Fanvue data complies with the terms… of any external platforms."
- This ties Fanvue to the Anthropic, Mistral and OpenRouter terms above.

**§9 Resale & Reuse**
- No "redistributing API access, data, or responses to third parties" unless Fanvue expressly authorises it.

**§10 Security**
- "Never log Client Credentials or personal data." This is worth checking against our trace and log tables.

**Related: Fanvue Acceptable Use Policy**
- §2.3(1)(3): content must not be "falsely depicting live interactions".
- §5(6): no bots or scripts "to extract, scrape, collect, harvest or gather Content or information from Fanvue".
- This matters for where the 35k chats came from. §5.2(13) only covers data obtained **through the API**. Chats obtained some other way fall under this scraping rule and the privacy rules instead.

## Notes on how the report reads these policies

- The report treats §5.2(13) as covering the 35k collection. That's only true if the chats were obtained through the Fanvue API.
- The clause "otherwise develop AI… models" is broad. Whether a retrieval or few-shot example library counts as "developing a model" isn't settled by the text. The report is right not to assume it's cleared and right to ask Fanvue.
- Fine-tuning on Fanvue chats would clearly fall under the clause. It would need express authorisation from Fanvue **and** from the fans and creators concerned.
- The report says Fanvue "requires honesty when asked about AI". The API policy only says don't deny it when sincerely asked. The help article (16 Oct 2026) goes further: answer "yes, clearly", and no dodging or joking. Our engine should follow the stricter help-article rule.
- Typing-time simulation: the report calls it a presentation feature. Given §4.3(2)(2) and the AUP's "falsely depicting live interactions", keep it modest. It shouldn't be built to create the impression of a live human. The profile's AI label makes this low-risk, but the report didn't connect the two.
