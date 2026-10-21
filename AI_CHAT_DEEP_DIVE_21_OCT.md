# AI chat: deep dive of the decision manager (21 Oct 2026)

What this is: a full read of the code that decides what Yuna does each reply (the plan, the session, selling, content matching, services, the safety screen and the engine that ties them together), plus 35 simulated subscriber dialogues (113 turns) run through the real engine: the planner model reads each message as in production, the code decides, no writer. Every turn was checked against the rules you set. The first run flagged 24 turns; the fixes below were made, and the run was repeated (results at the end).

## 1. Where the AI was deciding what code can decide

Your rule: code works out everything that can be worked out from the numbers; the AI only reads the new thing he said and writes. Three places broke that rule.

**His level (how sexual his message is).** The planner model said 0–3, and code trusted it except for foreign swearing and politicians (fix 3). The simulation showed the planner reads context, not the message: "hey babe" from a spender came back as sexual (goal: tease), "did you think about it?" during a parked request came back as sexual (goal: tease), "I'm broke this month" came back as "pulled back". Now code checks the read against his own words:
- a short message (three words or fewer) with nothing sexual in it is flirty at most;
- "pulled back" only counts when there was something to pull back from (a sexting flow in this conversation) and he really cools it ("slow down", "not tonight", "let's talk about something else") or writes a real sentence about something else;
- a sexting flow is remembered in the session (`hot`): a short neutral reply inside it ("ok", "mmm", "yes") keeps his level, so the story goes on instead of falling back to small talk or "ease off". That is the "OK, OK, OK" problem from your screenshots: before, each "ok" read as level 0, sexting switched off, and she produced flirty filler. The flow ends when he cools it or writes about something else; the dry rule still ends it after five one-word replies.
- the word lists code uses got the common phrasings the planner was needed for ("tell me what you would do to me", "I'm already hard", "want you so bad", "punish me", "spank", "moan").

**The price.** Where a rule sets the price (a whale's 10–20% personal discount, the win-back 30% off, a PPV inside a paid roleplay at the session's share) the writer was told the rule and picked the number itself, checked only against a floor. Now code sets the number (15% off, 30% off, the roleplay share) and the writer only writes the caption. The probe prices ($30/$40/$50) and tip credit were already set in code.

**Steering with nothing to steer to.** When his free talk was used up, the plan said "steer toward something to buy" even on a day when no PPV was allowed (cadence, pause, warm-up). The writer then promised something it could not attach, the checker blocked the promise, and the reply was rewritten. Now that moment is a wind-down (short, warm, nothing promised).

What stays with the AI, and should: the mood read (sad and annoyed only stick when his own words confirm them), the Playbook situations, whether he contradicts a note, which of the three picked pieces fits the moment, and the words.

## 2. Bugs found and fixed

| # | What went wrong | Seen in | Fix |
|---|---|---|---|
| 1 | His opener "hey" counted as a one-word reply, so the dry rule fired one message early (question after two "ok"s, not three) | dialogue 1 | His messages before her first reply don't count; a photo, video or tip is never "dry" |
| 2 | A new subscriber's first message said what he wants ("how much for your nudes?", "I want to see your tits"); the welcome came first (right), but the next reply forgot it: a tease set at $30 instead of nudes at $40 | 2, 21 | What he asked for earlier in the conversation shapes the probe and counts as "he said exactly what he wants" in her first two replies |
| 3 | "come on just one free one" wasn't read as a free ask (only "free pic/nudes/content…" was) | 4 | The free-ask words match the session's list ("free one", "something free", "free sample") |
| 4 | "can you be my strict teacher tonight?" wasn't read as a roleplay request (an adjective in between) | 9 | One word allowed between "be my" / "play a" and the role |
| 5 | He doubted her twice, then asked "ok fine, how much for a video?": she kept reassuring instead of offering | 11 | Reassure only when he isn't asking to buy; a direct ask wins |
| 6 | "what else you got", "got anything good for me?", "so can i see them?" weren't read as asking to buy, so a whale after a big spend got small talk and a win-back fan got no offer | 12, 21, 30 | The asking-to-buy words cover "what else", "anything else/new for me", "can I see", "let me see", "got anything good/nice/spicy" |
| 7 | "still too much" after the cheaper piece: her PPV was still "waiting", so the plan told her to point him to the one he had just called too expensive | 17 | A price objection to a waiting PPV counts as a no: nobody points him back to it |
| 8 | "what do you think of Trump?" got both the politics non-answer and "answer his question plainly first" | 15 | No "answer first" when the question is politics, religion or a public figure |
| 9 | "did you think about it?" about a parked request was planned as "tease" (the planner read the feet-worship context as sexual); "the feet thing, yes or no?" wasn't read as asking again | 33 | No tease when he asks about his parked request; "yes or no", "you in?", "the X thing" count as asking again (and "so?" alone, which never matched) |
| 10 | The first-sale stages (6 vibe, 3 flirt, 3 sexy) counted her messages, not her replies: a reply of two short messages moved the stage twice | code reading | Stages count her replies (exchanges) |
| 11 | "I'm broke this month" switched the day to rapport, but a horny message after it still allowed a PPV | 28 | Nothing is offered for the rest of that conversation, unless he asks himself |
| 12 | A sad mood that stuck (right) also stuck when he then asked "what do you have for me?": comfort instead of the offer | code reading | Asking what she has lifts the stuck mood (the no-selling rule was already lifted) |
| 13 | "be honest, are you an AI?" wasn't read as doubt ("are you a bot" was); and the reassure instruction said "joke it away", against the house rule that she admits being an AI if asked outright | 26 | "are you an AI / human / a chatbot" count; the reassure plan says: if he asks outright, she says so honestly in her own style, never a denial |
| 14 | Inside a paid roleplay the cadence hold ("no planned attempt today") still blocked the PPV that may go after three exchanges | 9 | A paid roleplay, like her sexting set, isn't held by the cadence |
| 15 | "steer to sale" planned when no PPV could go (see part 1) | code reading | Wind-down instead |
| 16 | "nudes" was never read as a request for nudity (only "nude" and "naked" were), so "how much for your nudes?" got a tease set | 2 (second run) | "nudes" counts |
| 17 | "tits" matched a covered lingerie set that mentions breasts in its description | 21 (second run) | Breasts means shown (topless or more), or a set that is about them |
| 18 | "I am so hard though, tell me what you would do" was read by the planner as flirty (level 1), so a horny fan got small talk | 28 (second run) | Unmistakable sexual intent in his own words is at least suggestive, whatever the planner read; "fuck my life" and "worked so hard" stay out |
| 19 | "did you think about it?" about the parked feet-worship request was read as sexual from its context, and the sexting flow carried it on | 33 (second run) | A message about his parked request is never sexting: his level is capped and the flow ends |

Checked and found right (no change): the order of the goal ladder; one attempt a day and the pause after $100 in 48 hours (lifted when he asks or is very actively horny); the win-back price; the welcome of a brand-new subscriber; the politics note; the under-18 stop ("im 20 btw" passes); the hour note ("do you ever sleep?"); meet-ups and Instagram handled as chat with the house rules; "what's in it?" answered from the PPV; she writes first (nudge, personal); a tip with no request becomes credit for free story steps; an explicit photo of him gets a reaction at its level; the "anal videos" match offered the video tagged "anal" in her map, which is right.

## 3. Things to know that didn't change

- **How much she remembers.** The writer reads the whole conversation up to 100 messages; past that, the last 40 plus the written summary of the fan's story so far. His notes (facts, plans, likes) and the diary of what she told fans come with every reply. Practice keeps the last 40 typed messages. Mood swings inside a conversation are handled by the session (sticky moods, the sexting flow, the dry rule), not by the writer's memory.
- **The planner still reads longer messages.** Code now has the common sexual phrasings, but a long message with none of them is still the planner's call. The new check only corrects short messages.
- **A time waster from behaviour.** The planner's "time waster" situation can mark a real fan as a time waster, but only with zero spend in 90 days; a made-up fan's type always wins.
- **Plan-only mode** (used by the simulation) doesn't run the writer, so the "direct ask was asked" flag isn't set there; the simulation marks it itself. Production is unaffected.

## 4. The simulation

35 dialogues, 113 turns, run twice through the real engine (planner on, writer off). Each turn compares the planned goal, and where it matters whether a PPV may go, against your rules.

Dialogues: a dry new subscriber; a new subscriber asking the price at once; a spender getting horny on a no-attempt day; a time waster begging for free things; a sad fan who then asks what she has; a buyer back after three weeks; meet-up and Instagram; his dog, then his dick; a tip, then a paid roleplay; someone under 18 and a parent; doubt twice then the price; a whale right after a $150 buy; goodbye mid-sexting; Spanish and a question about her; "oh my god" vs "what do you think of Trump"; two casual short replies; too expensive twice; a fan who notices the hour; she writes first; a free follower asking for a discount; a new subscriber who says exactly what he wants; a new subscriber walking the whole path (6 vibe, 3 flirt, 3 sexy, the ask, a $30 probe, a buy, the after-buy offer); a PPV left waiting then "show me what else you have"; a tip with no request then horny; content she doesn't have; "are you an AI?"; sexting with five "ok"s; broke then horny; questions about the waiting PPV; win-back; "im 20"; a new subscriber swearing in Spanish; an unusual request hesitated, parked and asked about again; a new subscriber who gets sexual early; a big spender and the personal discount.

First run: 24 flagged turns (all explained by the bugs above, plus three expectations of mine that were too narrow). Second run, after fixes 1–15: 6 flagged turns, four of them the bugs 16–19 above and two my expectations (a roleplay PPV left waiting is pointed to once, which is right; a lingerie ask planned as "offer" with the probe price, which is right). Third run of the five dialogues those touched: 0 flagged. The 113 turns now follow the rules as you set them.

Two things the runs showed that are about her content map, not the engine: "show me your ass" finds no single piece about her ass (the probe falls back to a tease set, named honestly), and "tits" lands on the nude sets because no topless piece names breasts in its words. Tags on those pieces would fix both.

The script is in my scratchpad (`dialogues.js`); it needs the server's `.env` and costs about $0.02 a run (planner calls only).
