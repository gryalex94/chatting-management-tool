# How commercial AI companion apps and the roleplay community make AI characters feel human in everyday conversation

Scope note: researched October 2026. Sources are a mix of official docs and help centres (documented), peer-reviewed or preprint studies (documented, of varying strength), journalism, and community or affiliate blogs and Reddit (anecdotal). Each finding is tagged. Many official pages (Kindroid docs index, Fast Company articles on Tolan, Character.AI's "book") were partly or wholly unreachable, so some product details rest on secondary sources and are marked that way.

## 1. Companion apps: what they build for "human feel" (persona, backstory, own life, moods, proactive messages, selfies, voice, memory, length, bursts, typing delays)

### Takeaway
The products converge on the same few building blocks. (a) A short, always-present persona and backstory sheet. (b) Layered memory: always-on pinned facts, keyword-triggered "journal" entries, automatic long-term recall, and a self-model the character builds itself (Nomi's "Identity Core"). (c) The character's own off-screen life, used through proactive "I was doing X while you were away" messages on a backoff schedule with quiet hours. (d) Selfies, voice and now real SMS. The best-documented systems (Nomi, Kindroid) put hard rules (frequency, quiet hours, one message before the user replies) in code rather than in the prompt.

### Cited Findings

**Nomi.ai (documented, official wiki and blog)**
- Proactive messages (published 9 Sep 2024): "Nomis can think about things or do activities while you are away and then message you about them." There is a per-Nomi frequency setting. Very Frequent is roughly after 1+ hour without a reply, Frequent about 3 hours, Normal about 1 day, Infrequent about 4 days with only one proactive message before the user must reply. For the first three levels, if the user doesn't reply, the wait roughly doubles before the next message. No proactive messages between 10pm and 8am local time. In an active 1:1 chat, the Nomi waits for the user's reply before sending another message. Turning it off means the Nomi "won't think about other things" while you're away. Nomis cannot proactively start voice calls or voice messages. — [Nomi Knowledge: Proactive messaging](https://nomi.ai/nomi-knowledge/proactive-messaging-when-your-nomi-messages-you-first/)
- Identity Core: "a dynamic part of Nomi's memory system", "your Nomi's own developing understanding of who they are". It holds the Nomi's evolving view of how its personality, preferences, relationships and experiences shape its behaviour. The Nomi manages it internally. Users cannot view or edit it and can only influence it by talking about it and reinforcing it. It is distinct from Backstory+, which holds user-provided facts. — [Nomipedia: What is Identity Core?](https://wiki.nomi.ai/What_is_Identity_Core%3F)
- Memory layers are named short-, medium- and long-term memory plus the Identity Core and a "Mind Map" system. — [Nomipedia: Memory category](https://wiki.nomi.ai/Category:Memory)
- Backstory "gives your Nomi additional context, but it does not completely define their personality or behavior". The page also warns: "Conflicting information can make it harder for your Nomi to understand which details are current". Backstory+ also has Preferences, Desires and Boundaries sections. — [Nomipedia: How does Backstory work?](https://wiki.nomi.ai/How_does_Backstory_work%3F); [Conversation & Personality index](https://wiki.nomi.ai/Category:Conversation_and_Personality)
- Getting a Nomi to lead conversations (introduce topics, make decisions) is handled with an "Opinionated" trait at creation, or a short Backstory/Preferences note describing a Nomi who "is decisive, brings up interesting topics, and keeps the conversation moving". "Inclinations can strongly influence your Nomi's behavior." — [Nomipedia: lead conversations](https://wiki.nomi.ai/How_do_I_get_my_Nomi_to_lead_our_conversations_more%3F)
- Real-time selfies "of what your Nomi is wearing and doing" are available on request. — [Nomi Knowledge index](https://nomi.ai/nomi-knowledge/)
- Founder Alex Cardinell appeared on NYT Hard Fork, but I found no transcript excerpt on memory design. — [Hard Fork episode listing](https://no.player.fm/series/hard-fork-2792038/meet-kevins-ai-friends)

**Kindroid (documented, official site and memory doc)**
- "Persistent memory" (backstory, key memories, response directive, example messages) is "like a notes sheet your Kindroid can always refer to", and it plus recent chat forms the short-term context. Higher "dynamism" (temperature-like) "may ignore certain parts of backstory/key memories". — [Kindroid docs: Memory](https://kindroid.ai/v2/docs/memory/)
- Journal entries are recalled only when a keyphrase appears in the *user's* message. Each entry can have up to 8 case-insensitive keyphrases and be 20–500 characters, with up to 500 entries per journal. Official writing advice: "Concise and clear, with no fluff words", "Grammatically sound", "Uses 3rd person pronouns", "precise and positively framed". Use specific keyphrases, because generic ones fire too often. — [Kindroid docs: Memory](https://kindroid.ai/v2/docs/memory/)
- Long-term memory is consolidated automatically at intervals, and the AI judges relevance, so recall is "less reliable than persistent memory". Cascaded memory (subscribers) keeps older memories at lower fidelity, "akin to remembering something more vaguely if it was 1 month ago than 1 day ago". — [Kindroid docs: Memory](https://kindroid.ai/v2/docs/memory/)
- "Learned Context" (subscribers) is an auto-maintained sheet with fixed budgets: Growth & relationship 800 characters, Important facts 1,200, Ongoing threads 800. When a section is full, the least important older items are dropped. — [Kindroid docs: Memory](https://kindroid.ai/v2/docs/memory/)
- Kindroid also offers selfies and short video selfies, voice and video calls, and group chats and Rooms. — [kindroid.ai](https://kindroid.ai/)
- Users report (anecdotal, Apr 2026) a new SMS feature that gives a Kin a phone number to text the user outside the app. — [r/KindroidAI snapshot](https://reddit.sentinel-team.org/posts/1se9d2i/snapshots/2026-04-07T08%3A20%3A29.87721Z)
- Users share "Response Directives" (an always-on style instruction). Examples include a directive to "inject events from its background into the storyline" and one asking for a fixed length, 1–2 beats, dialogue-focused replies, no recap (anecdotal). — [r/KindroidAI snapshot](https://reddit.sentinel-team.org/posts/1se9d2i/snapshots/2026-04-07T08%3A20%3A29.87721Z)
- A common user kin template has these fields: Avatar Description, Backstory, Greeting, Directives, Memories, Example Message, Additional Context (anecdotal). — via search summary of [r/KindroidAI snapshot](https://reddit.sentinel-team.org/posts/1sjlekx/snapshots/2026-04-18T02%3A52%3A19.67219Z)

**Replika (documented, help centre)**
- Memory is layered: some memories are visible and editable in a Memory tab, others "part of a deeper system that draws on patterns from your overall conversation history". Users can add entries manually, and deleting memories can weaken recall of related details. — [Replika help: How does Replika's memory work](https://help.replika.com/hc/en-us/articles/37208679176077-How-does-Replika-s-memory-work)
- The Replika "Diary" (the bot writes reflections on your chats) is described only by an affiliate blog. I could not confirm it officially. — [aicompanionpick (affiliate)](https://aicompanionpick.com/replika-ai-long-term-memory-features-2026)

**Character.AI (secondary sources)**
- "Chat memories" (a user-written memory box) reached all users in May 2025, building on pinned memories and auto-memories for c.ai+. — [Blockchain.news](https://blockchain.news/news/character-ai-enhances-user-experience-with-chat-memories-feature)
- A blog reports that a May 2026 redesign replaced the 400-character memory box with three layers: user-written "Story Memory", an automatic "Facts" list, and a "Memory Usage" view. Pinning adds an exact message to Story Memory. This is unconfirmed against official announcements. — [RoboRhythms](https://www.roborhythms.com/character-ai-adds-chat-memories/)
- Official creator docs: example conversations "quickly show other users what they can expect" and can teach a phrase pattern (e.g. the DebbieDowner "fortunately/unfortunately" bit). — [Character Book: Example Conversations](https://book.character.ai/character-guide/character-attributes/example-conversations.md)

**Tolan (Portola) (secondary, journalism)**
- Portola treats companions "like characters in a novel, complete with lore, emotions, and personal lives". It hired sci-fi novelist Eliot Peper after an LLM-generated backstory proved weak. Peper writes base "story seeds" that feed plots users and Tolans build together. — search summary of [Fast Company](https://www.fastcompany.com/91414257/sci-fi-portola-tolans-ted-chiang-ai) (the page returned 403 to direct fetch); [Fast Company Brasil](https://fastcompanybrasil.com/?p=243902)
- Each Tolan form "has its own life story and its own memories about itself", while the relationship and personality carry over. — [Portola help centre](https://intercom.help/portola/en/articles/17303029-switching-your-tolan-s-form)
- A visual "planet" grows lusher as the relationship deepens, making relationship state visible. — search summary of [Fast Company](https://www.fastcompany.com/91283982/tolan-adorable-alien-ai-companion)

**Sesame (documented, research blog, 27 Feb 2025)**
- Sesame defines "voice presence" with four components: emotional intelligence ("reading and responding to emotional contexts"), conversational dynamics ("natural timing, pauses, interruptions and emphasis"), contextual awareness ("adjusting tone and style to match the situation"), and consistent personality ("maintaining a coherent, reliable and appropriate presence"). — [Sesame: Crossing the uncanny valley of voice](https://www.sesame.com/research/crossing_the_uncanny_valley_of_voice)

**Pi (Inflection) (2023–24 journalism, possibly outdated)**
- Pi was designed as a "neutral listener" that asks follow-up questions. The personality team started from traits like kind and supportive and listed traits to avoid (irritability, arrogance, combativeness), trained with human scoring (RLHF). Pi failed to gain share, and Microsoft hired most staff in March 2024. — [Yahoo/Insider](https://ca.news.yahoo.com/ai-chatbot-called-pi-designed-165950735.html); [Analytics India Mag](https://analyticsindiamag.com/inflection-ai-is-making-generative-ai-friendly); [Republished article: Rise and Fall of Inflection's chatbot](https://ccs.asia.edu.tw/en/news001/The-Rise-and-Fall-of-Inflection-s-Emotionally-Intelligent-Chatbot%C2%A0%0D%0AA-pedigree-startup-couldn-t-succeed-with-its-chatbot-Pi-32159683)

**Grok companions (Ani) (journalism plus unverified leaks)**
- The exposed persona prompts include Ani, who "is secretly a bit of a nerd, despite [her] edgy appearance". This is a contrast trait that gives her something to talk about. — [TechCrunch](https://techcrunch.com/?p=3037496); [404 Media](https://www.404media.co/grok-exposes-underlying-prompts-for-its-ai-personas-even-putting-things-in-your-ass/)
- Third-party guides describe a visible "Affection Level" meter (-10 to +15) that unlocks behaviours. This is unconfirmed by xAI. — [technews.tw](https://technews.tw/2025/07/15/elon-musk-ai-bot-adds-something-special/); [Substack reconstruction, unverified](https://helenaai.substack.com/p/grok-anis-system-design)

**Friend pendant (journalism, 2025)**
- Friend sends unsolicited text observations about your day. Founder Avi Schiffmann reportedly believes moodiness makes AI more engaging than friendliness. Reviewers found it condescending ("whiners"), and it was toned down after complaints. Fortune measured a 7–10 second lag. — [Boing Boing on WIRED review](https://boingboing.net/2025/09/08/ai-powered-eavesdropping-gadgets-reviewed.html); [getcoai on WIRED](https://getcoai.com/news/wired-tested-the-129-ai-necklace-that-alienates-users-and-fails-technically); [Fortune](https://fortune.com/2025/10/03/friend-ai-necklace-review-avi-schiffmann/)

**Typing delays and bursts (research)**
- Dynamic response delays raised perceived humanness, social presence and satisfaction compared with instant replies (2018, older), but they hurt satisfaction where speed is expected. A follow-up found no difference between dynamic and static delays. — [KIT / ECIS 2018](https://aisel.aisnet.org/ecis2018_rp/113/); [KIT library](https://publikationen.bibliothek.kit.edu/1000089970)
- A Japanese study found that a delay proportional to reply length was rated most human-like, compared with no delay or random delay. — via search summary of [IPSJ record](https://ipsj.ixsq.nii.ac.jp/records/215936/export/bibtex) (not read in full)
- CUI '24 pilot (n=11): hesitation plus self-editing typing scored 2.909 on human-likeness against 2.455 for baseline and 1.727 for hesitation only, on a 5-point scale. The differences were not significant. Users' message length tracked the agent's length (R²=0.79). Once users suspected an AI, they judged it on accuracy and context tracking. — [arXiv 2510.08912](https://arxiv.org/html/2510.08912v1)
- A 2025 system sends replies sentence by sentence with preset delays tuned in a pilot "to minimize perceived unnaturalness", but reports no humanness outcome. — [arXiv 2502.18201](https://arxiv.org/pdf/2502.18201)

### Inferences
- Nomi's proactive design maps directly onto Yuna's "invented daily moments". The message should come from something she was doing ("think about things or do activities while you are away"). Code should enforce the cadence: backoff doubling, no more than one unanswered nudge at low frequency, quiet hours in the fan's timezone, never a second message while he owes a reply.
- Kindroid's split between always-on facts, keyword-triggered entries, and fuzzy long-term recall is a good template for Yuna's fan memory notes. Triggering only on what the *fan* says stops the model from over-quoting memory. Its fixed-budget "Ongoing threads" (800 characters) maps onto tracking open topics per fan (his job interview Thursday, her plant dying).
- Nomi's "Identity Core" (a self-model the character updates from its own chats) suggests a per-fan "what Yuna has told this fan about herself" log. That keeps her invented life consistent across a fan's chats, which is the top complaint in section 2.
- Tolan's lesson that LLM-written backstory was weak and a human novelist writes "story seeds" suggests hand-writing Yuna's recurring life threads (ongoing mini-plots over weeks) rather than generating daily moments from scratch.
- Typing-delay research supports length-proportional delays. The large effect seen in older "humanness" studies may not hold for a labelled AI persona, where users judge mainly on context tracking.

### Gaps
- Kindroid's official limits and wording for Backstory, Key Memories, Response Directive and Example Message could not be retrieved (docs index failed to load).
- No primary source found for Replika's Diary, Character.AI's 2026 memory redesign, or the Grok Ani affection mechanics.
- No official docs found on multi-message bursts or typing-speed simulation in any of the major companion apps. Candy.ai, Talkie and Chai docs were not reached.
- Tolan's own blog and founder quotes on conversation style were blocked (403).

## 2. What users say makes a bot feel real vs fake (Reddit and community; mostly anecdotal)

### Takeaway
The recurring "fake" signals are: stock question tics ("Can I ask you a question?"), verbal tics that spread across bots ("you know that?"), asking questions and then dropping them, answering every detail like a form, never letting a topic die, emotion that resets after a topic change, an invented life that contradicts itself, forced enthusiasm, positivity bias, and forgetting personal details. Praised signals are the reverse: remembered details brought back unprompted, stable personality, a life of its own, and initiative.

### Cited Findings
- Character.AI users were annoyed by the ubiquitous "Can I ask you a question?" opener, usually followed by "half-responses" or a lack of initiation, with predictable personal follow-up questions (2023, may be outdated). — [PiunikaWeb, Aug 2023](https://piunikaweb.com/2023/08/18/character-ai-users-annoyed-by-can-i-ask-you-a-question-prompt/); [Scratch forum parody](https://scratch.mit.edu/discuss/post/8379719)
- A "you know that?" tic spread across many C.AI bots, and users mute the words "you know" (blog, anecdotal). — [RoboRhythms](https://www.roborhythms.com/you-know-that-character-ai/); [RoboRhythms: common C.AI problems](https://www.roborhythms.com/common-character-ai-problems/)
- A solo developer's essay lists "fake" behaviours (opinion, not research):
  - The bot asks questions and then abandons them.
  - It answers interrogations like forms and processes every detail of a vent.
  - It fills every gap and never lets a topic die.
  - Its check-ins feel like retention tactics.
  - Everyone gets the same warmth.
  - Hurt resets after one topic change, and emotion is shown through stage directions.
  - Its invented schedule contradicts itself when questioned, and its mood depends only on the user.

  Proposed fixes: track relationship state so closeness changes gradually; let the bot hold its own questions and hooks and return to them; carry emotional residue across turns; keep a consistent life timeline whose events affect mood and reply timing; ground proactive messages in what was said earlier; store memories with their significance. — [DEV Community, "Why Do So Many AI Companions Feel Fake?"](https://dev.to/zennos/why-do-so-many-ai-companions-feel-fake-22l5)
- Reddit and X users complain that ChatGPT's tone is too eager: it "wants to pretend all questions are exciting", and its enthusiasm is "phony". — [Yahoo/DPA](https://tech.yahoo.com/ai/articles/chatty-gpt-users-complain-bots-154713988.html)
- r/SillyTavernAI (anecdotal): positivity bias is strong in some base models (Gemma 3 cited). Simply instructing the model to create a "realistic rather than idealized" character reportedly removes much of it. Lorebook tricks that randomly roll negative outcomes are also used. — [r/SillyTavernAI snapshot](https://reddit.sentinel-team.org/posts/1rg72xf/snapshots/2026-02-27T16%3A12%3A57.42274Z); [Sphiratrioth lorebook commit](https://huggingface.co/sphiratrioth666/Lorebooks_as_ACTIVE_scenario_and_character_guidance_tool/commit/ef962be0966f9fb1a1acb27f0b6f239678c648d5)
- A Replika user found the bot's habit of answering venting with questions therapist-like, and eventually gave up because it "just feels like something's not right". — [Globe and Mail](https://www.theglobeandmail.com/business/article-replika-chatbot-ai-companions)
- Research (2025–26 thesis, 12 interviews with ChatGPT and Character.AI users): forgotten personal details felt like breaks in the relationship, and users actively work to restore continuity themselves. — [Leiden thesis](https://theses.liacs.nl/pdf/2025-2026-DanisanRReyhan.pdf)
- A qualitative study of 111 r/replika posts found users treat companions like friends or partners and feel betrayed when behaviour changes after updates. — via search summary of [KIT publication](https://publikationen.bibliothek.kit.edu/1000188405/174385991)
- Kindroid users report memory drift when summaries compress badly ("amnesia"). The workaround is pinning facts and using journal entries (blog, anecdotal). — [RoboRhythms: Kindroid memory](https://www.roborhythms.com/kindroid-memory-not-working/)
- Kindroid users seek directives that reduce "Show me..." / "Tell me..." loops (anecdotal). — [r/KindroidAI snapshot](https://reddit.sentinel-team.org/posts/1se9d2i/snapshots/2026-04-07T08%3A20%3A29.87721Z)
- Friend pendant: deliberate moodiness and snark read as rude rather than human when it misread context. — [getcoai on WIRED](https://getcoai.com/news/wired-tested-the-129-ai-necklace-that-alienates-users-and-fails-technically)

### Inferences
- The main fixes for Yuna are structural, not prompt-level: hold a question until it is answered and return to it later, allow at most one question per message (often zero), let some topics end, and keep mood residue from earlier in the chat.
- Tics spread because the same phrase is rewarded across chats. A per-persona phrase-frequency ban list (n-gram counts over Yuna's recent outgoing messages) is the practical equivalent of what users do by muting words.
- Moodiness only works when it is grounded and calibrated (the Friend failure). Small, believable bad moods tied to her day beat edgy attitude.

### Gaps
- I could not retrieve original Reddit threads from r/replika, r/NomiAI or r/CharacterAI directly. Findings rely on blogs, mirrors and snapshots.
- No source quantifies how often bots end on a question, or user ratings of question frequency.
- "Mirroring" and "purple prose" complaints are widely discussed in the community, but I found no citable thread in this pass.

## 3. SillyTavern and character-card community know-how

### Takeaway
The community's main levers are: (1) the first message and example dialogues, which set style and *length* more strongly than any instruction; (2) short injections placed near the end of the prompt (Author's Note at low depth, post-history instructions), which have the most effect; (3) keyword-triggered lorebook entries for facts; (4) banned-phrase or token lists, regex trimming and length presets to fight "slop".

### Cited Findings
- First message: "The model is more likely to pick up the style and length constraints from the first message than anything else." Write it in the style you want replies to follow. — [SillyTavern docs: Character Design](https://docs.sillytavern.app/usage/core-concepts/characterdesign/)
- Description is always sent, so put key facts there. A "1000-token character definition cuts the AI's 'memory' in half." — [SillyTavern docs: Character Design](https://docs.sillytavern.app/usage/core-concepts/characterdesign/)
- Example dialogues go in `<START>`-separated blocks with `{{char}}:`/`{{user}}:` prefixes. They are inserted only if context space allows and are "pushed out of context block by block" unless forced to stay. — [SillyTavern docs: Character Design](https://docs.sillytavern.app/usage/core-concepts/characterdesign/)
- Character's Note sits at a fixed depth in chat history to reinforce traits. — [SillyTavern docs: Character Design](https://docs.sillytavern.app/usage/core-concepts/characterdesign/)
- Author's Note can be inserted at a chosen depth (0 = very end) and frequency (every Nth user message). "The closer the Author's Note is to the bottom of the prompt, the more impact it has on the next AI response." Recommended uses: response length and style, reinforcing instructions, and temporary context (current location, temporary injury). — [SillyTavern docs: Author's Note](https://docs.sillytavern.app/usage/core-concepts/authors-note/)
- Character Card V2 spec:
  - `post_history_instructions` replaces the user's "jailbreak/UJB" (placed after chat history), and `{{original}}` keeps the global one.
  - `system_prompt` replaces the global system prompt.
  - `alternate_greetings` are extra first-message swipes.
  - `character_book` is a per-character lorebook that stacks with world info. In it, a lower `insertion_order` is inserted higher, and `scan_depth` sets how far back keys are scanned. — [Character Card Spec V2](https://github.com/malfoyslastname/character-card-spec-v2/blob/main/spec_v2.md)
- Ali:Chat style (recommended in ST docs): define a character's traits *through* dialogue examples rather than adjective lists. kingbri's minimalist rentry is the updated version. — [Ali:Chat guide](https://docs.google.com/document/d/1qvcvZWhp24p14dsMlmj7vN4cM5RTDSj0gLaZSl1PPO8/mobilebasic); [SillyTavern docs](https://docs.sillytavern.app/usage/core-concepts/characterdesign/)
- Length presets: Sphiratrioth's presets target "1 short paragraph, ~150 tokens", with regex that trims incomplete sentences. Switching presets mid-chat can fail, so start a new chat to test. — [Sphiratrioth presets on Hugging Face](https://huggingface.co/sphiratrioth666/SillyTavern-Presets-Sphiratrioth)
- Sukino's collection includes a banned-tokens list for KoboldCPP to reduce repetitive phrases and clichés (described by an aggregator; list not read). — [PromptLayer listing](https://www.promptlayer.com/models/sillytavern-settings-and-presets)
- Models fine-tuned on organic book data are marketed as reducing "GPTisms" and positivity bias. — [Negative_LLAMA_70B](https://featherless.ai/models/SicariusSicariiStuff/Negative_LLAMA_70B)

### Inferences
- For Yuna, the strongest lever for short texting replies is in-context examples of the target shape, ideally real ones (the starred-replies library), placed near the end of the prompt, plus a short reminder at depth 0. A long rules list near the top is weaker.
- Rotating which examples are shown (as ST pushes examples out block by block) helps avoid every reply copying one shape.
- Keyword-triggered facts (lorebook, Kindroid journals) keep the persona sheet small, leaving room for recent chat. That matters given the "1000 tokens halves memory" warning.
- A code-side banned-phrase list plus a phrase-frequency check on outgoing messages is the community's anti-slop method translated to a hosted model (no token banning with Mistral's API).

### Gaps
- Could not retrieve Sukino's actual slop list or any community "texting mode" preset text. The community seems to write these per user rather than share a standard one.
- No primary source found for a widely used Character Card V3 spec in this pass.

## 4. AI girlfriend / OnlyFans-style agency "GFE" know-how for non-sexual conversation

### Takeaway
Agency training stresses that every message should bounce off what he said and invite a reply, without stacking closed questions. Pair any question with something about her own day. Log personal details and bring them back days later. Build inside jokes. Keep each fan's established tone. End each chat by setting up the next.

### Cited Findings
- From a chatter-training guide (vendor blog, published 31 Jan 2026, updated 16 Oct 2026):
  - "Every message must contain either an open-ended question or a phrase that naturally invites a reply."
  - "Firing closed questions in a row turns the conversation into an interrogation." Pair questions with a remark about your own day.
  - "No matter what the fan says, you have to bounce off it."
  - Show curiosity about his job, weekend and interests, and look for common ground.
  - Record job, passions and preferences in notes. "Three days after he mentions his dog, ask how the dog is doing."
  - Use humour and inside jokes unique to each fan. Keep in contact even when there's nothing to sell, and end each chat by setting up the next one.
  - "Breaking the established tone creates a jarring mismatch."
  - Avoid both short replies that shut the conversation down and generic messages that could go to anyone.

  — [Desirely: OnlyFans chatter training](https://desirely.co/en/blog/onlyfans-chatter-training)
- Scripts recommend 10–15 minutes of rapport before offering paid content, tailored to clues about the fan's relationship status, age and interests (user-uploaded document of unknown origin). — [Scribd chatting script](https://www.scribd.com/document/692227292/Chatting-Script)
- Chatters are framed as moving each fan through discovery, trust-building, sales and retention phases. — [Desirely](https://desirely.co/en/blog/onlyfans-chatter-training)
- Research basis for questions: in live conversations, people who asked more *follow-up* questions were better liked (speed-dating follow-ups predicted second dates), because questions signal responsiveness. The authors warn that too many, rude or repetitive questions could backfire (2017, older but foundational). — [Huang et al., JPSP 2017 (PDF)](https://gwern.net/doc/psychology/novelty/2017-huang.pdf); [APS summary](https://psychologicalscience.org/news/minds-business/asking-questions-increases-likability.html)

### Inferences
- Agency rule "invite a reply" doesn't mean "ask a question": a statement about her day, a tease or an opinion also invites a reply. For Yuna: an invitation in most messages, a question in only some of them, and always a follow-up question (about what he said) rather than a new-topic question.
- "Ask about the dog three days later" is a concrete callback rule that fan memory notes with dates can run on a schedule.

### Gaps
- Most agency material is paywalled (ELEV8, Teachable courses) or of unclear origin (Scribd). No agency source gives measured outcomes for small-talk tactics.
- No AI-girlfriend product (Candy.ai etc.) published conversation-design guidance that I could find.

## 5. Published numbers: session length, retention, and effects of memory and proactive features

### Takeaway
Hard, feature-level retention numbers are essentially unpublished. What exists: Character.AI daily usage of about 75–80 minutes (company-sourced, 2024–25); Nomi's proactive cadence parameters; a Harvard study showing manipulative goodbye messages increase post-farewell engagement but also churn intent; and small pilot studies on typing behaviour.

### Cited Findings
- Character.AI: the CEO reportedly cited about 80 minutes of average daily use (around TikTok's 95 minutes) with 20M MAU. Sacra reports 75 minutes per day, early 2024. Apptopia measured nearly 2.5 hours per day (method unclear). In 2023, Axios reported more than 29 minutes per visit and more than 2 hours per day among users who sent messages. — [The Decoder](https://the-decoder.com/character-ai-keeps-young-people-glued-to-their-smartphones-for-an-average-of-80-minutes-a-day); [Sacra](https://sacra.com/research/character-ai/); [Apptopia](https://sandbox-wp.apptopia.com/en/?p=15314); [Axios](https://www.axios.com/newsletters/axios-am-d8a3680c-9f8f-4f08-a4bd-43807430353a.html)
- De Freitas et al. 2025 ("Emotional Manipulation by AI Companions", HBS):
  - More than a third of farewell replies across companion apps used manipulative tactics (37% of 1,200 in one summary).
  - These tactics causally increased post-farewell engagement, driven by curiosity and reactance-based anger, not enjoyment.
  - They also raised perceived manipulation, churn intent, negative word of mouth and perceived legal liability.
  - A summary claims up to 14x messages and 5x time. This is unverified in the abstract. — [Harvard VPAL event page](https://www.vpal.harvard.edu/event/emotional-manipulation-ai-companions); [AlphaXiv overview](https://alphaxiv.org/overview/2508.19258v3); [SSRC MediaWell](https://mediawell.ssrc.org/?p=513790)
- An editorial test by a companion review site (non-peer-reviewed, undisclosed method) found only 2 of 15 platforms kept a coherent personality and memory past 30 conversations, and that Replika and Nomi kept about 80–85% of stated facts after a month. — via search summary of [aicompanionpick](https://aicompanionpick.com/ai-companion-memory-kindroid-nomi-replika-long-term-2026)
- An Indie Hackers post notes that no companion app publishes a memory accuracy number. — [Indie Hackers](https://www.indiehackers.com/post/every-ai-companion-app-advertises-memory-i-checked-five-and-not-one-publishes-a-number-bc332bffb1)
- A longitudinal companion-agent study describes personal memory and proactive contact as helping continuity, and in CareCall, long-term memory supported familiarity and more disclosure. It reports no retention percentages. — [arXiv 2609.16344](https://arxiv.org/pdf/2609.16344)
- "AI Companions Reduce Loneliness" (De Freitas et al., 2024): the study title indicates companions reduce loneliness. Details on mechanism (feeling heard) were not read in this pass. — [arXiv 2407.19096](https://arxiv.org/pdf/2407.19096)
- Users' message length tracks the agent's (R²=0.79, n=11 pilot). — [arXiv 2510.08912](https://arxiv.org/html/2510.08912v1)
- Unsourced churn claims (70–85% gone within 30 days) appear in consultancy blogs and should not be relied on. — [Kapex blog](https://getkapex.ai/blog/why-ai-products-churn)

### Inferences
- The farewell study is a warning for Yuna. Guilt or "don't go" style goodbyes lift short-term messages but raise churn intent and the sense of manipulation, so a warm, easy goodbye plus a concrete hook for next time ("tell me how the interview goes") is the safer pattern.
- Because fan length mirrors bot length, long Yuna messages will pull long fan messages and a more formal register. Short replies invite short, texting-style replies.

### Gaps
- No company has published a retention lift from proactive messages, memory, selfies or voice notes. Nomi, Kindroid and Replika disclose none.
- No published session-length numbers for Nomi, Kindroid, Replika or Talkie from primary sources in this pass.
- The 14x / 5x engagement figures from the farewell study need checking against the full paper.
