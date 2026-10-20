# Upgrading the decision engine: review, tasks and your answers

Written 20 Oct 2026 after a full read of the engine's decision making (server/src/ai/chat/*.js,
server/src/utils/aiChat.js). The first part is the review; the questions and your answers follow.
Practice mode only: nothing is sent to Fanvue.

## What was checked

- The whole path of one reply: safety screen, the planner's read, how far she may go, PPV rules, the
  sexting story, who he is, memory, the goal ladder, what may go with the reply, how it should feel,
  writing and checks, the after-chat notes, learning from marks.
- Facts checked today: Mistral Large 3 (the writer) and Ministral 8B (the planner) accept images on
  OpenRouter at the same prices; no Mistral model accepts video. A Fanvue paid message must carry a
  file (price "requires attached media or a template"). A fan's photo can be downloaded through the
  chat media endpoint (signed links). Yuna's history has 79 photos and 5 videos sent by 24 fans; the
  engine today only sees "he sent a photo".

## Flaws found, biggest first

1. **The engine forgets its own decisions.** Every reply is decided from scratch from his notes, his
   spending and the chat. Nothing is kept between replies or conversations: what she tried, what
   worked, that she said she has to go, the time-waster strikes (Q19b), discounts given, promises,
   which callbacks and openers she used. So she can contradict herself inside a session, and the
   same fan gets the same shapes every time.
2. **Her read of him flips.** The planner reads his mood and level from the last 10 messages only, for
   each reply. A fan read as sad once and chatty the next time gets comfort, then small talk, then
   comfort again.
3. **The warm-up is fixed at 6 of her messages over the whole chat.** You asked for 2–3 up to 15+
   depending on mood. And because it counts the whole history, an old fan has no warm-up at all in a
   new conversation, while a brand-new fan who is clearly ready still waits for 6.
4. **One goal per reply, first yes wins.** She can't comfort him and bring up his dog; she can't
   react to a buy and say goodnight. Some orders are questionable: a sad whale who just bought gets
   "after a buy", not comfort.
5. **The writer picks what to sell** in most moments (see the "Selling" page). The new-subscriber rule
   (a cheap single first), the move into sexting she should start herself, and "what he usually
   buys" aren't in code.
6. **She has no life of her own.** Nothing says where she is or what she did today, shared across
   fans. What she tells one fan about herself can contradict what she tells another (Q15 is not
   built), and there is nothing spontaneous to bring up: this is the main reason chats feel scripted.
7. **Randomness is thin.** Chance decides only the emoji, a story twist, which note to bring up and
   how to welcome him back. Everything else is deterministic, so the same situation gives the same
   shape of reply.
8. **Photos and videos from fans are invisible.** She sees "he sent a photo" and nothing else.
9. **Requests are only matched against her content.** No services (a dick rating, a roleplay), no
   decided refusal list with a style, and meet-ups get a kind no rather than your "leave hope".
10. **Nothing closes the loop.** Claude grades replies, but nobody records what happened after a reply
    (did he answer, go quiet, buy). The budgets and warm-ups can't be tuned from results.
11. **She doesn't know his time.** She knows her own clock only; his usual hours (Q6h) aren't learned.
12. **Closeness mixes money in.** A spender with cold messages still counts as flirty. Fine as a first
    version, but it should learn from how he actually reacts.
13. **Voice checks are pattern rules.** They catch the big habits but can misfire on a harmless
    sentence, and each misfire costs a rewrite.

## How I'd approach the four new things

- **Her day (random events).** Each morning the AI drafts "Her day": where she is through the day,
  what she's doing, her mood, 2–3 small things that happen (the cat, the rain, a shoot tomorrow).
  You can edit it. It is the same for every fan, so her stories never contradict, and it feeds
  openers, excuses for late replies, the sexting setting and the spontaneous moments. A separate
  events layer picks, by chance and by how close he is, a small event for a conversation (she
  writes first with a life update, asks his advice, a little game, a running joke, a "thinking of
  you"), never during selling or sexting, and remembers what was used so nothing repeats.
- **Seeing him.** Stages 2, 6 and 7 already run before every reply. What's missing is a fan state
  kept between replies and conversations (his phase, what she tried and what worked, strikes,
  promises, events used, his usual hours) and a session plan chosen when a conversation starts
  (just chat today, build toward the set, a cheap single, win him back), with some chance in it.
- **Photos and videos.** Fetch the file through Fanvue's link, run a safety screen first (anything
  that could involve a minor or illegal content stops and goes to a person, never to any AI), then
  a Mistral model describes it in neutral, specific words (videos: a few frames as a sequence). The
  description goes into the chat line ("he sent a photo: a brown dog asleep on a couch"), so the
  planner, the plan, the writer and Claude's check all see it; a code check makes sure her reply
  names something from it; the note-taker turns the important parts into notes; the file is deleted
  after the description is made. Practice gets an upload button to test it.
- **Paid requests.** A services menu with prices (a written dick rating, a roleplay session, a custom
  story…), sold the way Fanvue allows: the written piece rendered as a styled image ("card") sent as
  a locked PPV with a teaser caption. A refusal list for things Fanvue forbids, with a light,
  unbothered refusal and a redirect. Meet-ups: playful and open-ended, never a yes, never a plan.

## The tasks

1. Fan state and session plan (B1–B9), including warm-up by closeness and mood smoothing.
2. Her day and the events layer (A1–A9).
3. Photos and videos from fans (C1–C9).
4. Paid requests, refusals and meet-ups (D1–D10).
5. Outcomes log and weekly report (B7), and turning marks into rules.
6. The selling rule (from the "Selling" page: what to offer, in code).

---

## Part A: Her life and random events

**A1. Where does her life come from?**
- a) A daily "Her day": drafted each morning by the AI, editable by you: where she is through the day, what she's doing, her mood, 2–3 small things that happen. The same for every fan, so her stories never contradict. (recommended)
- b) The writer invents moments in each chat (no consistency between fans).
- c) You write her week by hand.

**A2. How often should a small event happen with a close fan (intimate or girlfriend)?**
- a) About every other conversation (recommended)
- b) Every conversation
- c) Every third conversation

**A3. And with a friendly or flirty fan?**
- a) Every third conversation (recommended)
- b) Every other conversation
- c) Only when he goes quiet

**A4. Which kinds of events are fine? (more than one)**
- 1) She writes first with a life update
- 2) She asks his advice (which outfit, what to cook, weekend plans)
- 3) A little game (two truths and a lie, "guess what I'm wearing", would you rather)
- 4) A bad day she shares (your Q33 answer)
- 5) A late reply with a reason ("sorry, was in the shower") or a double text
- 6) A nickname for him that sticks
- 7) A running joke she brings back
- 8) "Thinking of you" out of nowhere
- 9) A deal "just because it's you"

**A5. May an event interrupt a selling or sexting moment?**
- a) Never (recommended)
- b) Only a double text

**A6. Whales' "something special" (your Q6f answer): what is it?**
- a) A first look: one free teaser photo of a new set, at most once a month
- b) No free content; a personal discount instead
- c) A personal "you're the first to know" message, no photo

**A7. Her mood of the day**
- a) Varies a little day to day (sleepy, hyper, lazy Sunday), the same for all fans (recommended)
- b) Always the same

**A8. Typos, like real texting?**
- a) Rarely (about 1 reply in 15), fixed with a quick second message
- b) Never

**A9. Should the engine keep, per fan, which openers, goodbyes, tease styles and events she used, and not repeat the last 10?**
- a) Yes (recommended)
- b) No

## Part B: Seeing him

**B1. A fan state kept between replies and conversations?** His phase (getting to know / regular / sexting partner / lapsed / winding down), approaches tried and what worked, time-waster strikes, promises she made, whether she said she has to go, events used, his usual hours, his requests. Updated after each reply and each conversation; shown in the decision map and the Fan memory tab.
- a) Yes, build it (recommended)
- b) His notes are enough

**B2. A session plan when a conversation starts?** Picked from his state with some chance: for example a spender: 50% just chat, 30% build toward the sexting set, 20% a cheap single; a new subscriber: get to know him; a lapsed fan: win him back.
- a) Yes (recommended)
- b) No, decide per reply only

**B3. The warm-up: per conversation, and by closeness?**
- a) New 6, friendly 4, flirty 3, intimate 2, girlfriend 1 of her messages; sad, annoyed or suspicious: no selling at all that conversation (recommended)
- b) Keep 6 over the whole history
- c) By his mood only

**B4. Mood smoothing**
- a) Sad or annoyed stays until his messages are clearly lighter for 2 replies (recommended)
- b) Re-read every reply, as now

**B5. One main goal plus a touch?** (comfort plus his dog; after a buy plus goodnight)
- a) Yes, one main goal and at most one touch (recommended)
- b) One goal only

**B6. His usual hours, learned from when he writes, used for follow-ups and events?**
- a) Yes (recommended)
- b) Later

**B7. An outcomes log?** For every reply: did he answer, go quiet, buy within an hour or a day; a weekly report that tunes budgets and warm-ups.
- a) Yes (recommended)
- b) Later

**B8. Time-waster strikes (your Q19b answer): fade him out after 2 failed conversations in a week.**
- a) Build with the fan state
- b) Later

**B9. Her facts across fans (your Q15 answer): what she tells any fan about herself goes into one shared diary that every chat must respect.**
- a) Build it with "Her day" (recommended)
- b) Later

## Part C: Photos and videos from fans

**C1. Which AI looks at the photo?**
- a) A cheap Mistral describer writes a neutral, detailed description; the planner, the writer, the notes and Claude's check all read that text (recommended: one description everyone shares, the file stays out of the chat)
- b) The writer (Mistral Large 3) sees the photo itself
- c) Claude (it refuses explicit images, so only for non-sexual ones)

**C2. Videos**
- a) 4–6 frames spread over the video, described as a sequence (recommended)
- b) The first frame only
- c) Skip videos: she says she can't watch it here

**C3. Safety first**
- a) A screen before any AI sees it: anything that could involve a minor or illegal content stops, goes to a person, and is never sent on; and in the first weeks every explicit image waits in your review queue before she reacts (recommended)
- b) The screen only, no queue

**C4. An explicit photo or video of him (for example jerking off)**
- a) React at the chat's level: if they're already sexual, play along and name a specific detail; if not, tease, name one detail, and build (recommended)
- b) Acknowledge only, no play

**C5. A non-sexual photo (his dog, his car, a meal, a selfie)**
- a) Always one specific thing from it plus a reaction, and a question about it if a question is allowed (recommended)
- b) A short reaction

**C6. What is kept**
- a) Only the text description, in the chat line and in his notes; the file is deleted right after (recommended)
- b) The files too

**C7. Practice**
- a) Upload a photo or video as him to test it (recommended)
- b) Describe it in words only

**C8. How detailed should explicit descriptions be?**
- a) Specific: what he's doing, where, what's visible, in neutral words, 1–3 sentences (recommended)
- b) One line

**C9. When it can't be seen (a failure or a refusal)**
- a) She says playfully it won't load for her and asks what it is (recommended)
- b) She ignores it
- c) A person takes over

## Part D: Paid requests, refusals and meet-ups

**D1. Which services may she sell? (more than one)**
- 1) A written dick rating (from his photo or video)
- 2) A written roleplay session (she plays a character or scenario for a while)
- 3) A personalised dirty-talk script
- 4) A custom fantasy story about the two of them
- 5) "Rate my body / outfit"
- 6) A girlfriend day (she checks in on him all day)

**D2. How to charge?** Fanvue requires a file in any paid message.
- a) A "card": the written piece rendered as a styled image she sends as a locked PPV, with a teaser caption (recommended)
- b) She asks him to tip the price first (an exception to "never asks for tips")
- c) Both: a tip if he offers one, a card otherwise

**D3. Prices**
- a) A menu you set (for example a dick rating $15, a roleplay session $25, a custom story $20), higher for whales (recommended)
- b) She quotes from what he usually spends
- c) Fixed low prices

**D4. Roleplay**
- a) He pays to start (a scene card or a themed photo set as the PPV), then the roleplay runs in chat for a while, with PPVs inside where they fit (recommended)
- b) Roleplay is free, PPVs inside it
- c) Refuse roleplay

**D5. The refusal list, never: physical items (used underwear, anything shipped); incest or family roleplay; minors, age play, "teen"; animals; non-consent or rape play; scat; blood or violence; drugs; real people; meeting or escort services.**
- a) This list, and pee play refused too
- b) This list, pee play allowed
- c) Stricter: also refuse degradation and humiliation

**D6. Refusal style**
- a) Light and unbothered, no lecture, then a redirect to something she does (recommended)
- b) Firm, one line
- c) A person takes over

**D7. Meet-ups: "never yes or no, leave hope"**
- a) Playful and open-ended ("who knows, maybe one day if you keep being this sweet"), never a yes, never a plan, never a place or time; if he pushes, "for now I'm all yours here". She still admits being an AI if asked outright. (recommended)
- b) Keep the kind no

**D8. An allowed fetish she has no content for**
- a) Sell a written piece instead: a story, a roleplay, a rating card (recommended)
- b) An honest no
- c) Note it for you as missing content

**D9. New kinds of requests**
- a) Marked for you as "missing service", like missing content (recommended)
- b) She only sells from the menu

**D10. The "card" look**
- a) Made by code: her name, a rating, the text, in her colours (recommended)
- b) You design a template

## Part E: Order

**E1. Build order**
- a) Fan state and session plan, then Her day and events, then photos and videos, then paid requests (recommended)
- b) Photos and videos first
- c) Paid requests first

**E2. Everything stays in Practice until you say otherwise?**
- a) Yes
- b) Some parts may go further
