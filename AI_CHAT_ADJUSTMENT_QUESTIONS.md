# Adjusting the whole system: open questions and your answers (21 Oct 2026)

Everything from the four upgrade steps is live in Practice. These were the things still open, grouped, with the current behaviour where one existed and a suggested answer. Your answers are under each question; Part F (going live with real fans) is parked until you want real fans in.

## The decisions in short (21 Oct 2026)

**Selling (Part A, with E5)**
- A new subscriber with no purchases walks a staged path, started over in every conversation: about 6 exchanges staying with his vibe (no selling unless he says exactly what he wants; then the offer comes in her second reply), about 3 exchanges of flirting, about 3 exchanges in a sexy vibe with no direct ask, then she turns direct and asks what he wants. The first sale is a video or set at a probe price by explicitness: tease or lingerie $30, nude $40, explicit $50. If he is vague: a tease set at $30–35 with a "just took these for you" caption. The first PPV's caption is never explicit.
- After his first buy she may lead into the sexting story only if he is into sexting; otherwise chat plus single PPVs. He is never pushed into sexting.
- If the first offer isn't bought: warm, no pushing for the rest of that conversation; next conversation one more try with a different item at $30; after two failed conversations, time-waster rules.
- Fans who bought before: a taste record per fan. Every PPV sent is recorded with its kind, whether he bought it and how he reacted (graded automatically from his next messages: super happy, fine, no reaction, didn't like it). What he says he likes or doesn't like is kept; only what he says counts as a dislike, and content he doesn't like is never offered again unless he asks. The pick leans toward what he bought and loved: 3 offers in 4 the same kind, 1 in 4 something new; no reaction to the last one means something different next; a fan who was never specific gets everything tried, to gather feedback. Sexting is used to build the relationship and to see how much he is willing to spend; after that any content, mixed, leaning to what he bought.
- One more offer in the same conversation after a buy, the next step, only while he stays active and warm; story steps excepted.
- "Too expensive": one cheaper item instead, once; then rapport.
- Discounts: whales on a sell day (exists), roleplay pre-tip (exists), and a win-back discount: one item at 30% off for a buyer away 14 days or more, once per 30 days.
- One selling attempt per day and per conversation, and rules for when she doesn't offer at all: his mood (sad, annoyed, suspicious), and a big recent spend ($100 or more, or twice his usual ticket, in the last 48 hours: no offer for 48 hours unless he asks or is very actively horny). Hard spenders are never over-pushed; upselling comes later through sexting or a PPV, depending on the situation.
- Planned sell attempts per fan, always give or take and never on a fixed date, unless he asks: time wasters every short conversation and pushier; low spenders about weekly; mid spenders about every two weeks; whales every two to three weeks. Him going sexual counts as asking: the story and its paid steps go ahead, within the big-spend pause and the mood rules.

**Her writing first (Part B)**
- His hours: his busiest 3-hour window from the last 30 days, in her time zone; at least 5 messages, else her evening.
- She writes first by fan type, at his hour: whale daily, spender every 2–3 days, new subscriber on day 1 and day 3, small buyer weekly, free follower every two weeks, time waster never.
- If he doesn't answer: mid spenders and up get a weekly personal message built from their dialogue and notes; everyone else one more try after two days, then only mass messages.
- He goes quiet mid-conversation: one short nudge after 30–60 minutes, unless she said goodbye; then she leaves it.
- A PPV not bought: in that conversation the normal sale strategy, find out why he didn't buy; the next selling attempt comes in the next conversation, with one reminder of the old PPV at most, then a different item. Sexting is a different path and not covered by this.
- She never sleeps. If he notices she is up at odd hours, she has an excuse: a messed-up sleep schedule, doomscrolling niche subreddits, and the like.
- Delays once she sends by herself: a random 1–4 minutes before the first message plus typing time; 10–30 minutes for time wasters and on short days.

**Learning from testing (Part C)**
- A full weekly report in the tool every Monday: by goal and fan type, how often he answered, went quiet, bought within a day; the three weakest rules with examples; cost; what changed since last week.
- After three similar marks I draft a rule; you approve it in the tool; then it is enforced in code where possible, else in the prompt.
- Claude fixes weak replies by writing the instruction (what is wrong, what to do instead, never the words) and Mistral rewrites once; both drafts shown in the map. You want to watch how it works in Practice.
- Order: the decision engine first, then the blind test with selling. Selling stays in Practice.

**Small rules (Part D)**
- Tips: with a request, she fulfils it: a tip equal to or above the price she would put for him means the content goes free; a smaller tip becomes a discount of that amount. With no request: free sexting if he is in the mood, and the tip covers as many of his usual-priced story steps as it adds up to, at most two.
- Time wasters: three approaches rotated per fan, and she remembers which worked: short and sweet; one cheap offer; an honest "I'm here for the ones who support me".
- A fact she told three or more fans moves into her profile by itself; you can remove it.
- An unusual request no longer stops the chat: the decision stays pending and is handled separately; she stays hesitant ("I'll think about it"), and after one or two exchanges about it she moves the conversation elsewhere. Your decision reaches her when it comes.
- A flagged file: the chat stays stopped until a manager clears or blocks the fan; the fan is marked in Fan memory.

**Tuning (Part E)**: warm-up floors, her moments, typos, the time-waster fade, free-talk budgets and tiers all stay as they are. The sell-day rule is replaced by the per-fan cadence above.

**Decided by me**: describe the 84 files fans ever sent (about 5 cents); redraw the decision tree page after this round; show in the score dialog where Claude's taste disagrees with the 35k library; her profile stays the cleaned draft until you give her a persona.

## What the 35k dialogues say about new subscribers

2,378 analysed chats with new subscribers; 1,972 got a PPV; 51% bought the first one; $41 per chat on average.

| Lever | Worked best | Worked worst |
|---|---|---|
| First PPV price | $30–39: 57% buy, $52 per chat, $31 more in the next 7 days | $40–49: 42% buy, $38 per chat. Over $70: 31% |
| Messages before the first PPV (both sides) | 17–24 messages: 62% buy, $58 per chat. 9–12: 56% | Within the first 4 messages: 40% |
| A direct ask before the PPV ("are you alone?", "wanna see?") | With it: 66% buy, $71 per chat | Without: 36%, $31 |
| Free sexy talk before the PPV | Extended: 70%, $89 per chat. Brief: 58% | None: 33% |
| PPV caption | "just took this for you right now": 86% at about $23. A tease: 59% | Explicit caption: 30% |
| He went sexual himself | 62% buy | He never did: 23% |
| Mistakes | No mistakes at all: 87% buy, $101 per chat | Too explicit too soon 37%, robotic 33%, pushy 35% |
| Fan behaviour | Engaged 77%, silent buyers 75%, horny-fast 57%, romantic 55% (and the most spend in the next 7 days) | Low effort 9%, time wasters 12% |

So the slow staged path is right, the "turn direct" step is the biggest single lever, and the first PPV should be a tease at $30–39, never explicit.

## Part A: Selling, the rule in code

Today the writer chooses what to offer from her list in most moments; code only checks the offer (in the list, not during warm-up, none pending, no repeat, price in range, his level). These make the choice itself a rule.

**A1. The first offer to a fan who has never bought** (after the warm-up, when the plan is to sell)
Now: any item that fits the moment and his level, priced between the item's lowest price and 1.2× its list price.
- a) The cheapest single piece in her list that fits his level (a photo or a short clip): the aim is the first yes (recommended)
- b) A small set at the usual price
- c) Leave it to the writer, as now

Answer: a fan with no buying record gets a video or photo set at a probe price, $30–50, not sexting, as the first sale; then we check his reaction and proceed. The price is linked to explicitness and to what he asked for.

Follow-up (how was it before): he counted as new until the first PPV was ever sent; every conversation had the aim "get to know him"; no PPV before her 6th message; from the 6th message a PPV was only allowed, never planned; after 15 of her messages she wound down without an offer. A warmed-up new subscriber could go through three conversations with no offer.

Follow-up answers:
- Warm-up: unless he says exactly what he wants during the first 6 exchanges, no selling: stay with his vibe, then start flirting; after the active flirt phase keep a sexy vibe for some time without a direct ask; only then turn direct and ask what he wants. Stage lengths: about 3 exchanges of flirting and about 3 in the sexy vibe. If he leaves before the stages are done, the next conversation starts over.
- Price: by explicitness: tease or lingerie $30, nude $40, explicit $50; the item is what he asked for or reacted to.
- Sexting with a new subscriber: after his first purchase. If he is not into sexting but something else, never push him into it; chat and single PPV sales instead.
- The first offer not bought: warm, no pushing for the rest of that conversation; next conversation a different item at $30; after two failed conversations, time-waster rules.
- He is vague ("surprise me"): a tease set at $30–35 with a "just took these for you" caption (the data's best band), not a $40 nude set.

**A2. Who starts the sexting**
Now: she leads a story only after he turned sexual and the warm-up is done; she never opens it herself.
- a) She may open it herself with flirty, intimate and girlfriend fans, in his evening, when the plan is to sell and the warm-up is done (recommended)
- b) Only when he turns sexual first, as now
- c) Only with fans who bought a sexting series before

Answer: new subscribers come warmed up from the social networks where they saw her content, so not taking the lead after the agreed stages means a lost sale. For new subscribers see A1 (she leads into the story after the first buy, if he is into it). For buyers see A3.

**A3. What steers the pick for a fan who bought before**
Now: the writer chooses from the moment; past buys only stop repeats.
- a) The kind he bought most (photos, videos or sexting series) and at most one step up in nudity from his last buy (recommended)
- b) Always the next step up in nudity, whatever the kind
- c) The writer's choice, as now

Answer: by what he buys, but new things are offered every now and then. Sexting helps develop the relationship and shows how much he is willing to spend; afterwards any content can be offered, always a mix leaning toward what he was willing to buy. If he rejects something and says he is only into certain things, that is remembered and content he doesn't like is never offered. If he was not specific, everything can be tried and feedback gathered. Each sent PPV should ideally get feedback on how happy he is: super happy means mostly the same kind, rarely something different; no feedback means try something different.
Follow-up answers: his reaction is graded automatically from his reply after a buy (super happy, fine, no reaction, didn't like it); 3 offers in 4 the same kind he loved, 1 in 4 new, and something different after no reaction; only what he says counts as a dislike (unbought PPVs don't).

**A4. A second offer in the same conversation after he bought**
Now: she reacts to the buy; no second offer in that conversation.
- a) At most one more, the next step, only while he stays active and warm (recommended)
- b) No second offer in that conversation, as now
- c) As many as he keeps buying

Answer: a) one more, if he's warm. Story steps inside a sexting session keep coming as the story goes.

**A5. When he says it's too expensive**
Now: he counts as broke: the plan switches to rapport, no selling for the rest of the conversation.
- a) One cheaper item instead, once; then rapport (recommended)
- b) A one-time 20–30% discount on the same item, at most once a week per fan
- c) Rapport straight away, as now

Answer: a) one cheaper item, once; then rapport.

**A6. Discounts beyond roleplay** (your Q35)
Now: whales get a personal discount on a sell day; roleplay PPVs are discounted by the pre-tip. Nothing else.
- a) Add a win-back discount: one item at 30% off for a buyer who was away 14 days or more, once per 30 days (recommended)
- b) No other discounts
- c) A discount for anyone after two offers he didn't take

Answer: a) the win-back discount.

**A7. How many offers per day for one fan**
Now: one pending at a time and no repeats; no daily cap.
- a) One offer per conversation, two per day (recommended)
- b) One per day
- c) No cap

Answer: one per day, with a set of rules for when she doesn't offer: mood checks and recent spending. Nobody is pushed into spending right after a big spend unless he wants it or is very actively engaged in a horny dialogue; hard spenders are not over-pushed. One selling attempt per day and per dialogue; upselling later if possible, through sexting or a PPV depending on the situation.
Follow-up: "a lot" = $100 or more, or twice his usual ticket, in the last 48 hours; no offer for 48 hours unless he asks or is very actively horny; the mood rules (sad, annoyed, suspicious) apply on top.

## Part B: Her writing first, his hours, follow-ups

Nothing here is built: today she only replies. Practice has a "follow-up" mode; nothing is scheduled.

**B1. How she learns his hours** (your B6 answer: yes)
- a) From when he wrote in the last 30 days: his busiest 3-hour window, counted in her time zone; needs at least 5 messages, else her evening (recommended)
- b) The hour of his last message
- c) Don't learn: her evening for everyone

Answer: a) his busiest 3 hours.

**B2. When she writes first** (a new conversation, not a reply)
- a) By fan type, always at his hour: whale daily, spender every 2–3 days, new subscriber on day 1 and day 3, small buyer weekly, free follower every two weeks, time waster never (recommended)
- b) Everyone every two days at his hour
- c) Never first: only replies and mass messages

Answer: a) by fan type.

**B3. If he doesn't answer her opener**
- a) One more try after two days with a different opener, then wait for him (recommended)
- b) Keep trying weekly
- c) Stop after one

Answer: every subscriber is pinged every now and then. Mid spenders and up get a weekly personal message based on their dialogue and notes; the rest get one more try after two days and are then reached by mass messages.

**B4. He goes quiet in the middle of a conversation**
- a) One nudge after 30–60 minutes, short, in passing, unless she was the one who said goodbye; then leave it (recommended)
- b) No nudge: wait for him
- c) A nudge after 30–60 minutes and another the next day

Answer: a) one nudge after 30–60 minutes.

**B5. A PPV he didn't open or buy**
Now (Practice): she points to it once if he talks about something else; a new one only if he asks for something else or ignores it.
- a) One reminder after 3–6 hours, in passing; then drop it, and next conversation a different item (recommended)
- b) A reminder, then a cheaper alternative the next day
- c) No reminder: next conversation a different item

Answer: after a failed PPV the normal sale strategy applies in the conversation: find out why he didn't buy. The next selling attempt comes in the next conversation; the old PPV is mentioned once at most, then on to a different PPV. Sexting is a different approach and not covered here.

**B6. Does she sleep?**
Now: nothing; she would answer at any hour.
- a) Asleep 1–8 am her time (US East): no first messages then, and a reply to a night message waits until she "wakes", with a "just woke up" line (recommended)
- b) Always awake; night replies come with a longer delay
- c) She lives in his time zone

Answer: she never sleeps, but if he notices, she reacts accordingly: "I messed up my sleeping schedule", "I was scrolling reddit and got lured into doomscrolling some niche subreddits", and the like.

**B7. Reply delay once she sends by herself**
Now (Practice): typing delays by the typing-speed setting, no waiting time before the first message.
- a) 1–4 minutes before the first message plus typing time; 10–30 minutes for time wasters and on short days (recommended)
- b) Instant plus typing time
- c) A fixed 2 minutes for everyone

Answer: a) 1–4 minutes plus typing.

## Part C: Learning from your testing

**C1. The weekly report** (your B7 answer: yes)
Now: the score dialog shows Claude's checks per day and outcomes by goal.
- a) Every Monday in the tool: by goal and fan type, how often he answered, went quiet, bought within a day; the three weakest rules with examples; cost; what changed since last week (recommended)
- b) Numbers only
- c) Also sent out (needs the channel from F5)

Answer: a) the full report in the tool.

**C2. Repeated marks becoming rules**
Now: "Bad wording" marks go to the writer as your notes in similar moments; "Wrong call" marks only to Claude's check.
- a) After three similar marks I draft a rule; you approve it in the tool; then it's enforced in code where possible, else in the prompt (recommended)
- b) Automatic after three marks, no approval
- c) Keep marks as notes only

Answer: a) draft, you approve.

**C3. Claude fixing weak replies**
Now: Claude only grades; code checks give the writer one rewrite.
- a) When Claude fails a reply, Claude writes the instruction (what's wrong and what to do instead, never the words) and Mistral rewrites once; both drafts shown in the map (recommended)
- b) Claude rewrites non-sexual replies itself; sexual ones take the instruction route
- c) Keep watch-only

Answer: a) instruction, then Mistral rewrites; you want to see exactly how it works in Practice.

**C4. The blind test and selling**
Now: the blind test covers talk only.
- a) Later, once real conversations exist (recommended)
- b) Add selling moments now, against the proven chatter answers
- c) Drop the blind test

Answer: first the decision-making engine, then the blind tests and the selling part in them. Selling stays in Practice.

## Part D: Small rules

**D1. Tips he sends by himself** (your Q39: tips are rewards, she never asks)
Now: she thanks him; the tip counts toward his tier; services are the exception (paid by a tip first).
- a) Thanks, warmer for the rest of the conversation, and she remembers it; no free content (recommended)
- b) Thanks plus a small free teaser once a day for a tip of $20 or more
- c) Thanks, and later a playful hint at tips with whales

Answer: a tip with a request: she tries to fulfil it. If the tip equals or exceeds the price we would put on that content for this subscriber, the content goes free for that tip; if not, a discount of the tipped amount. A tip with no request: free sexting if he is in the mood (without content), and the first 1–2 paid PPVs can be skipped depending on the amount.
Follow-up: the tip covers as many of his usual-priced story steps as it adds up to, at most two.

**D2. Time wasters** (fading after two failed conversations in a week)
Now: short replies, lowest priority, one cheap offer allowed.
- a) Rotate three approaches per fan and remember which worked: short and sweet; one cheap offer; an honest "I'm here for the ones who support me" (recommended)
- b) Always short, as now
- c) Stop replying after five failed conversations

Answer: a) rotate three approaches.

**D3. Her invented facts and her profile** (your Q15)
Now: everything she tells any fan about herself goes into her diary, and every chat respects it.
- a) A fact she told three or more fans moves into her profile by itself; you can remove it (recommended)
- b) You approve each one
- c) Never: the diary is enough

Answer: a) automatic after three fans.

**D4. How long a chat waits for a manager** (an unusual request)
Now: she hesitates twice, then the chat waits silently until Approve or Refuse.
- a) Silent; after 12 hours one "still thinking about it, don't rush me"; then silent (recommended)
- b) Silent until a decision, however long
- c) After an hour a soft no

Answer: the decision stays pending and the request is handled separately; the conversation may go on. She stays hesitant ("I'll think about it") and after one or two exchanges about the request she moves the conversation somewhere else.

**D5. After a flagged file** (someone who could be under 18, or something illegal)
Now: she leaves the conversation and the file is marked; nothing else happens.
- a) The chat stays stopped until a manager clears or blocks the fan; the fan is marked in Fan memory (recommended)
- b) She continues but never mentions the file
- c) Stopped, and the fan is blocked by itself

Answer: a) stopped until a manager clears or blocks him.

## Part E: Tuning what exists (keep or change)

**E1. Warm-up before any offer** (her messages in this conversation): new 6, friendly 4, flirty 3, intimate 3, girlfriend 2
- a) Keep (recommended)
- b) Shorter: 4, 3, 2, 2, 1
- c) Longer: 8, 6, 4, 4, 3

Answer: keep. New subscribers follow the staged path from A1 instead.

**E2. Her moments** (a life update, a question for advice, a game, a double text, a bad day): 1 conversation in 2 with intimate and girlfriend fans, 1 in 3 with friendly and flirty, none with new fans
- a) Keep (recommended)
- b) Fewer: 1 in 3 and 1 in 5
- c) More: every conversation with intimate and girlfriend fans, 1 in 2 otherwise

Answer: keep.

**E3. Typos**: about 1 message in 15, corrected half the time
- a) Keep (recommended)
- b) None
- c) More: 1 in 8

Answer: keep.

**E4. Time-waster fade**: 2 failed conversations in a week or 5 in a month
- a) Keep (recommended)
- b) Stricter: 1 and 3
- c) Looser: 3 and 8

Answer: keep.

**E5. Sell day**: a buyer 30 days after his last buy; a non-buyer after 3 conversations
- a) Keep (recommended)
- b) Sooner: 14 days and 2 conversations
- c) Later: 45 days and 5 conversations

Answer: replaced. A sell attempt once a week or two at most, depending on the subscriber: time wasters more often and pushier, possibly every short conversation; low spenders about once a week; mid spenders about once per two weeks; whales every two to three weeks. Always give or take, never a precise date. This applies unless the subscriber asks for something directly; him going sexual counts as asking, and the story with its paid steps goes ahead within the big-spend pause and the mood rules.

**E6. Free talk per conversation** (messages before she steers to a sale or winds down): whale 20, new subscriber 15, spender 15, small buyer 10, no spend 8, time waster 5; on a sell day 60% of that
- a) Keep (recommended)
- b) More talk: half as much again
- c) Less talk: a third less

Answer: keep.

**E7. Tiers** (PPV and tip spend in 90 days): whale $500, spender $100; halved on a page under $2k a month, which is Yuna's case today ($250 and $50)
- a) Keep (recommended)
- b) Lower: $300 and $60
- c) Higher: $1,000 and $200

Answer: keep.

## Part F: Going live with real fans (parked)

Nothing is sent until you set the server switch; the connection is read-only today and needs the write permission back (the creator approves again).

**F1. The assistance inbox**
- a) A page in this tool: chats waiting for a reply, the engine's draft with its decision map, Approve / Edit / Skip; Approve sends through Fanvue (recommended)
- b) Drafts in a Telegram chat, answered from there
- c) Later

Answer: later. The remaining going-live questions (F2–F10 below) are skipped until then.

**F2. Who may approve and send**: a) managers only (recommended); b) managers and chatters, the chatter's name kept on each sent message; c) only you.
**F3. How the tool learns about a new fan message** (now: the copy runs once an hour): a) Fanvue's events to the backend, the hourly copy as a backup (recommended); b) checking every minute; c) keep hourly.
**F4. Telling fans she's an AI** (the EU AI Act and Anthropic's rules require it; Fanvue allows labelled AI; now: the Fanvue AI-creator label, and she admits it when asked): a) the label plus one line in her bio and in the welcome message (recommended); b) also a line in her first message to every new fan; c) only when asked.
**F5. Where a person is told when a chat waits** (now: nowhere; the tool has no notification channel): a) Telegram to the manager on duty, needs a bot token and chat ids (recommended); b) email, needs a mail service; c) a badge in the tool only.
**F6. A shadow week before any sending**: a) one week of drafts nobody sends, compared with what you would send (recommended); b) skip; c) two weeks.
**F7. The first slice for automation**: a) free followers and new subscribers in their first week (recommended); b) whales and spenders; c) everyone.
**F8. Sending caps**: a) one reply per fan per minute, 60 an hour in total, nothing between 1 and 8 am her time (recommended); b) only Fanvue's limit; c) a lower cap you set.
**F9. Fan data clean-up** (Fanvue's policy: keep fan data only as long as needed): a) delete a fan's chat copy, notes and descriptions after 12 months of silence, keep earnings (recommended); b) after 6 months; c) keep everything.
**F10. A kill switch**: a) one button in the tool that stops all sending and automation at once, on top of the server switch (recommended); b) the server switch only.
