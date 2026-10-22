# Working in this repository (for Codex and other coding agents)

This is the chatting-management tool of an agency that runs creator pages on Fanvue. The part under active work is the **AI chat engine** for the AI creator persona ("Yuna"): a Node/Express server (`server/`) with a React client (`client/`) and a Supabase database. Nothing in this repository sends a message to Fanvue: the engine runs in a practice room only (`FANVUE_ALLOW_SENDING` is unset and must stay unset).

## Rules that always hold

- Never commit `server/.env`, anything under `analysis-data/`, or any fan data (names, messages, payments). Those stay local.
- Never add sending or automation toward Fanvue. The Fanvue connection is read-only.
- Plain language in docs, comments and commit messages: explain decisions the way you would to a manager, not a programmer.
- Commit to `main` and push after each finished set of edits, with a message that says what changed and why.
- Keep the rules the manager decided (listed in the two question files below) unless the manager changes them. Make the engine follow them better; do not reinterpret them.

## The engine, file by file

All decisions are made in code; language models only read the moment and write the words.

| File | What it decides |
|---|---|
| `server/src/utils/aiChat.js` | `reply()`: the whole pipeline for one reply: safety screen, the reader, the session, the meters, the plan, the writer with its checks, Claude's check. Also memory, the practice room, saved conversations, the scorecard data. |
| `server/src/ai/chat/strategy.js` | The reader prompt (Claude Haiku, `readPrompt`): what he is doing, what is new, how his message can be read, what she would want to ask, the stance, an odd line, his open questions, her promises. Ministral is the fallback. |
| `server/src/ai/chat/plan.js` | `fanProfile` (tier, new subscriber, time waster, closeness, talk budget) and `planReply`: the goal ladder of hard rules, the soft slot where the meters score the moves, selling holds (`holdFor`), the offer and its price, questions, length, beats, the text the writer reads (`planText`). |
| `server/src/ai/chat/gauges.js` | The meters (heat, mood, rapport, readiness, doubt, engagement, surprise), how they move each turn, and `scoreMoves`: every soft move scored against them. |
| `server/src/ai/chat/session.js` | The plan for one conversation (aim, warm-up, sticky moods, no-selling rule, the sexting flow, cadence, pause, first-sale progress, open questions), kept by the practice room between replies. |
| `server/src/ai/chat/selling.js` | The selling rule: cadence per tier, the pause after a big spend, the first-sale stages and probe prices, his taste, which piece to offer next. |
| `server/src/ai/chat/content.js` | Her content map: matching what he asks for to pieces she has, whether a PPV may go, prices. |
| `server/src/ai/chat/services.js` | Paid services, the refusal list, unusual requests parked for a manager. |
| `server/src/ai/chat/safety.js` | The safety screen on his message, the rule checks and voice checks on her draft, how sexual a text is. |
| `server/src/ai/chat/prompts.js` | The writer prompt (Mistral), the tidy step, bubbles, the surface pass, parsing the writer's answer. |
| `server/src/ai/chat/review.js` | Claude's checks: the coach check of a reply, the PPV truthfulness review, the blind-test judge, rule drafting. |
| `server/src/ai/chat/trace.js` | The decision map shown in Practice: every step with its reason. |
| `server/src/ai/chat/vision.js` | Describing a fan's photo or video. |
| `server/src/utils/aiDuels.js` | Blind tests: real Fanvue moments written by two models, judged blind. |
| `client/src/pages/aichat/` | Practice room, decision map, blind-test tab, Claude's score, content and memory tabs. |

Documents that explain the decisions and their reasons, in order of writing: `AI_CHAT_RULES_QUESTIONS.md`, `AI_CHAT_UPGRADE_QUESTIONS.md`, `AI_CHAT_ADJUSTMENT_QUESTIONS.md` (the manager's answers), `AI_CHAT_DEEP_DIVE_21_OCT.md` (the audit), `AI_CHAT_ENGINE_V2.md` (the current architecture and what each part improves), `reports/` (research with sources).

## How to check the engine

All scripts run from `server/` and need `server/.env` (Supabase and OpenRouter keys, an Anthropic key for the reader). They make real model calls (cents, not dollars) and write nothing to Fanvue.

```bash
cd server
node scripts/simulate-dialogues.js          # 37 edge-case dialogues, plan only; "!!" marks a turn that broke a rule
node scripts/simulate-dialogues.js 2 21 36  # a few of them
node scripts/replay-practice.js             # saved practice conversations replayed; lists turns that decide differently now
node scripts/check-communication.js         # offline (no model calls): how the engine reads him and keeps her words; every line PASS
node scripts/written-moments.js             # four moments written by the real writer, to judge by eye (a few cents)
node scripts/scorecard.js --days 7          # her replies measured against the human chatters' bands
node scripts/scorecard.js --days 7 --moves 150   # plus the main move of 150 replies, labelled
cd ../client && npx eslint src              # the client lints clean
```

A change to the engine should keep the simulation at zero flags (or explain each new flag), keep the replay without unexplained differences, and move the scorecard toward the human bands, not away from them. When a rule and a model disagree, the rule wins and the check goes into code.

## What to look at when reviewing logic

- Does any decision that could be computed from numbers (prices, cadence, stages, holds, question budget, length) depend on a model's words instead? It should not.
- Does a model's read get checked against his own words before it drives a decision (`aiChat.js`, after the briefing)?
- Are the hard rules still vetoes that the meters cannot override (`plan.js`, the soft slot and `holdFor`)?
- Does the writer get the beats and the facts it needs (what she has on, his open question, her promise), and are its failures caught in code before Claude's check?
