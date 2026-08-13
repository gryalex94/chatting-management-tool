# VA feedback audit → improvement plan

Audit date: 2026-08-13. Source: 1,057 review tasks, 95 dismissals with written
notes, 15 coach flags, 30 daily reviews, 442 stored evaluations.
(Raw per-fan detail deliberately NOT in this file — aggregates only.)

---

## 1. Headline: the rejections are 100% from the AI layer

| Layer | Actioned | Rejected | Rate |
|---|---|---|---|
| Deterministic engine (reply time, AFK, discount, location, page health, chargeback, spender-dev, custom) | 176 | **0** | **0%** |
| AI dialogue judgment (sales, meeting, offplatform, free_content, age, tos, communication) | 756 | **95** | **13%** |

Every single thing the VA rejected came from AI dialogue reading. The calculated
layer has never produced a false positive. **Design conclusion: keep moving work
from the AI layer into the deterministic layer wherever a fact is countable.**

Dismiss rate by area (a floor on the false-positive rate):

```
age 20% · offplatform 14% · sales 13% · free_content 13%
tos 12% · meeting 10% · communication 4% · everything deterministic 0%
```

`sales` is the volume problem: 507 actioned, 66 rejected — 2/3 of all rejections.

---

## 2. The 95 rejections, grouped

Counts overlap slightly (some notes cover two causes).

| # | Category | ~Count | Root cause | Status |
|---|---|---|---|---|
| 1 | Whale GFE treated as a missed sale | 14 | Judgment | ✅ fixed 2026-08-13 |
| 2 | **AI said "no PPV" but one was sent/bought** | 12 | **Evidence** | ❌ open |
| 3 | Meeting flag on roleplay/fantasy | 9 | Judgment | ✅ fixed |
| 4 | Off-platform raised by fan, chatter deflected | 8 | Judgment | ✅ fixed |
| 5 | Follow-up after PPV / sub vanished post-view | 8 | Judgment | ✅ fixed |
| 6 | **Page-specific facts the AI can't know** | 7 | **Missing input** | ⚠️ field built, empty |
| 7 | Conversation ended on chatter's open question | 6 | Judgment | ✅ fixed |
| 8 | "Can't spend / card maxed" → backing off correct | 4 | Judgment | ✅ fixed |
| 9 | Content after a tip = paid, not free | 4 | Judgment | ✅ fixed |
| 10 | **Same case flagged twice / same fan across chatters** | 4 | **Dedup** | ❌ open |
| 11 | Age flagged with no under-18 signal | 3 | Judgment | ✅ fixed |
| 12 | **Shift boundary (shift ended / handover mid-chat)** | 2 | **Missing input** | ❌ open |

**~61% (58/95) is already addressed** by today's prompt recalibration.
The remaining ~37 are *not* prompt problems — they are evidence, input and
dedup problems, and no amount of prompt wording fixes them.

Verbatim rules the VA wrote (now encoded):
- "When communicating with whales, not every conversation should be turned into
  a sales opportunity. Mixing sales with GFE is a perfectly valid approach." ×13
- "Only highlight off-platform cases where you suspect the **chatter** may have
  violated the rule, not the sub."
- "By default, assume that all subs are over 18."
- "When content is sent after receiving a tip, it should not be considered free content."
- "The top priority is to preserve a good relationship for the future while a
  spending sub recovers their ability to make purchases."

---

## 3. Three structural problems the feedback exposed

### 3a. 29% of conversations are never reviewed — silently

`buildThreadList` caps at **25 threads per chatter**. Measured on 2026-08-12:

```
374 conversations →  AI sees 265  ·  NEVER SEEN 109 (29%)
PPVs inside the unseen threads: 34 (14 of them sold)
```

Worst: one chatter had 67 conversations, 42 dropped. The cut is arbitrary
(first 25 encountered), not "the 25 that matter". Nothing tells the manager
coverage was partial — the report reads as if the whole day was reviewed.

### 3b. 9 of the last 35 days lost ~94% of their messages

Message counts per day: a healthy day stores ~3,000–3,800. These days stored
~110–250: **Jul 9, 10, 11, 12, 18, 22, 25 · Aug 1, 8**.

Cause was the upload pre-clear deleting by calendar date (fixed 2026-08-13,
commit `43592da`). **Every evaluation the VA reviewed ran against this bug** —
which is very likely the direct cause of category #2 above ("no PPV" when a PPV
existed): on those days the PPV genuinely was not in the data.

The 9 broken days are still broken in the database. They need re-upload.

### 3c. The coaching loop is not closing

- 15 tasks flagged 📌 Coach → **1** marked coached.
- **0** custom tasks created by the VA in the entire period.
- 48 completed tasks have no chatter attached.

"Completed" is also becoming a catch-all: dismissals ran 39 and 21 on Jul 14–15,
then trailed to ~1/day and **0 for the last three days**, while completions held
at 25–32/day. Either the AI got dramatically better (it didn't — no calibration
shipped until today) or **false positives are now being silently marked done**.
That destroys the feedback signal this whole audit depends on.

---

## 4. Plan

### Priority 1 — Restore evidence (fixes category #2, the largest open bucket)

1. **Re-upload the 9 broken days** so the AI stops judging partial dialogues.
2. **Give the eval the day's sales outcome per fan.** We already store
   `subscriber_sales` and the `[PPV $X SOLD]` tag. Add an explicit per-thread
   summary line to each conversation header, e.g.
   `(this shift: 3 PPVs sent, 2 sold, $154)` — so "no PPV was sent" becomes
   contradicted by data the model cannot miss.
3. **State the shift window** in the header and instruct: no missed-sale finding
   in the final ~10 minutes of a shift, and none where another chatter takes over
   mid-conversation (fixes category #12).

### Priority 2 — Close the coverage hole (3a)

4. **Rank threads before capping.** Order by value at risk — whales/spenders
   first, then unbought PPVs, then new subs — so the 25 the AI reads are the 25
   that matter, instead of an arbitrary 25.
5. **Raise the cap** for the sales review (25 → 40) and report coverage
   explicitly: "reviewed 40 of 67 conversations". Never let a partial review
   present itself as complete.

### Priority 3 — Feed the AI what only we know (3, category #6)

6. **Fill in the per-page AI instructions** (field shipped today, currently empty
   on every page). From the VA's own notes, these are already known:
   - Cora — has two OF accounts; a second-account mention is not off-platform
   - Julia — has a Telegram group; a fan mentioning it is not a violation
   - Tania — anal and B/G content exist on the page; not a ToS breach
   - Foggy — no voice content or voice tool available
   Each of these caused a false P1. This is ~15 minutes of typing for real gain.
7. **Add a per-fan notes field** for subs needing a personalised approach
   (the VA explicitly asked for this for one complex sub).

### Priority 4 — Stop re-flagging the same thing (category #10)

8. **Dedup across chatters:** if the same fan + same issue type is raised for
   3 different chatters in a day, it is a fan-behaviour pattern, not 3 chatter
   errors — collapse to one page-level task.
9. **Suppress re-flagging a dismissed fingerprint** for N days rather than only
   until it escalates to critical.

### Priority 5 — Repair the feedback loop (3c)

10. **Make "Dismiss" the path of least resistance for a false positive.** One
    click with the reason pre-selected; the free-text note optional. Right now
    completing is one click and dismissing is a modal, so the cheap action wins.
11. **Surface the coaching backlog** — 14 flagged items are sitting unseen.
12. **Track dismiss rate per area weekly** as the quality metric for this tool.
    Target: sales under 5%. It is 13% today.

---

## 5. What to expect

If Priorities 1–3 land, roughly **85–90 of the 95 historical rejections would
not have been raised**. The remaining handful are genuine judgment calls where a
manager's eye is the right answer — that residue is the target, not zero.
