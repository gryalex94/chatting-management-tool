# Implementation plan — daily-check calibration (round 1)

## STATUS (2026-07-07) — round 1 server implementation landed
**DONE (server / AI interpretation + task generation):**
- ✅ Compliance prompt rewritten (`evaluateChatterDay.js`): removed persona/identity, ordinary discounts, copy-paste, wrong-name; added location disclosure; tightened meeting/age/explicit/budget; free-content kept; bare-tip → low; non-English translation; discount only if >50% off. New `area` vocabulary (tos/age/meeting/free_content/offplatform/location/discount/budget/quality).
- ✅ Sales prompt (`evaluateChatterSales.js`): stopped persona flagging; added translation rule.
- ✅ Creator prompt (`evaluateCreatorDay.js`): threshold gating — revenue ±90%, LTV −20%, ratio <5, refunds >$50, spender/churn only on sustained deterioration.
- ✅ Priority tiers (`taskGenerator.js` `defaultPriority`): new areas + bare-tip low.
- ✅ Protected compliance class (Workstream G): never AI-archived (`prioritiseTasks.js`) nor queue-capped (`capLiveQueue`).
- ✅ Ignore-list (Workstream E, server side): `loadIgnoreSet` filters tasks; seeded `ignored_accounts='Paul B'`.
- ✅ Reply-time per-sub detail carried into task `context.subs` (server half of Workstream C).
- ✅ DB cleanup: 209 dismissed+archived tasks deleted (calibration preserved in the MD docs) for a clean re-evaluation.

**DONE — round 2 (this pass):**
- ✅ Reply-time sub-task UI (Workstream C client): expandable per-fan rows in `TasksPage.jsx` — username click-to-copy, tier tag, worst wait, time, fan message, workload context.
- ✅ Time-waster behavioural tiering (Workstream F): `computeChatterMetrics.js` uses `subscribers.first_seen` age (≤7d new sub, >14d + $0 → time_waster, ranked last); `dailyCheck.js` excludes time-wasters from reply-time tasks (their waits don't matter).
- ✅ Chatter tenure tiers (Workstream): `tenureTier` (new 0–7d / learning 8–21d / experienced 21d+) gates dialogue tasks in `taskGenerator.js` — experienced chatters only surface high/critical + protected; flags/page-health/protected always pass.
- ✅ Weekly creator review — cascade wording: LTV/ratio issues now phrased as an action (review the page's new subs / whales / PS + flag weakest chatters).

**DONE — round 4 (metric windows + spender development):**
- ✅ **Metric windows fixed** (`dailyCheck.js`): ratio over **2 weeks**, LTV over **30 days** vs the 30-day window ending 7 days earlier, revenue trend week-over-week, baseline 30 days. Thresholds now match the decisions: **LTV −20%** (was 25, now `high`), **revenue ±90%** both directions (was 80/50), **refunds >$50**, ratio <5. Labels updated in `evaluateCreatorDay.js` and `DailyCheckPage.jsx`.
- ✅ **Workload decoupled** from reply-time severity (`dailyCheck.js`) — informational only.
- ✅ **Spender-development generator** (`buildSpenderDevelopmentTasks` in `taskGenerator.js`, hooked into `/rebuild`): uses global `classification` (whale-anywhere), stalling = last spend in [30d..14d) ago, best-effort page attribution via last sale, **hard per-page cap (8), whale-first**. Verified: 11 tasks (one per page), whale pages P3/high, PS-only P5/medium, fans listed in `context.fans` (click-to-copy). Protected from AI-archive and queue-cap.
- ✅ **Cascade wording** in the deterministic LTV/ratio/revenue/refund flags → each says what to DO.

**REMAINING after round 4:** ignore-list → Team-settings toggle; workload chip on the chatter card; digest surfaced inside the creator Daily Check tab (Home already has it); Monday "run the weekly review" warning; richer PS-dev fan rows (spend/last-spend) in the UI.

**CLARIFICATIONS (2026-07-07, round 3) — reshape the remaining work:**
- 🔑 **Whale-anywhere = whale-everywhere.** A fan classified `whale`/`ps` on ANY page is treated the same on ALL pages (even $0 there). This means `subscribers.classification` being ORG-level is CORRECT — no fan→page attribution needed for whale/PS status. The attribution "blocker" is largely dissolved; multi-page spenders are rare and handled by the global classification.
- The weekly generator already has a home: the **"Creator review" button in Daily Check** (`DailyCheckPage.jsx`) — designed to create tasks for the upcoming week. PS-development + cascade should be built into that flow.
- **Digest** already largely exists on **Home** (`buildOverview` ranks pages by revenue-vs-30d, 7d trend, ratio, LTV). For now, surface the same view inside the creator part of Daily Check; no new dashboard needed.
- **Cadence**: run manually; just warn if it's Monday and the weekly review hasn't been run. No scheduler.
- ✅ **Workload is now purely informational** (`dailyCheck.js`): reply-time severity comes from reply facts only; workload is shown, never scored. TODO: also highlight workload on each chatter card/panel.
- **Ignore-list is really "exclude team members from reports."** Paul B is the chatting MANAGER who occasionally drives sales himself. Proper home: a per-member toggle in **Team settings** (users table), not a config string. Current `ignored_accounts` config works as a stopgap.

**REMAINING (larger data/UI features for a later pass):**
- ⛔ Weekly creator review data layer: a real digest view, a PS-development task generator (query `subscribers` for stalled PS on each page), and weekly (Monday) cadence scheduling. Cascade currently lives in the prompt wording, not yet a data-driven bundle.
- ⛔ Workload shown as a dedicated informative panel (it already flows in `context.workload` and shows on the reply-time list; no separate tab yet).
- ⛔ Settings UI for `ignored_accounts` / thresholds (config keys work; no form yet).

To re-evaluate: re-run **Run AI analysis** per day (overwrites the stored evaluations with the new prompt), then **Build report & tasks**.

---


Derived from the 85 dismissed cases in `DISMISSED_CALIBRATION.md` and Alex's decisions.
Page-health (ratio/LTV/revenue) is **deferred to the next category** — not in this plan.

---

## Workstream A — Rewrite the compliance AI prompt
**File:** `server/src/ai/evaluateChatterDay.js` (both `PROMPT_A` and `PROMPT_B`).
This is where persona/discount/wrong-name/copy-paste/meeting/age/etc. originate.

**REMOVE these flag types entirely:**
- **Persona / identity / creator-name** — creator names aren't real; stop flagging name use, third-person references, "not the creator" suspicions.
- **Unauthorized / unprompted discount** — discounts are chatter discretion.
- **Copy-paste / repeated scripts / canned lines** — not a daily-check concern.

**KEEP but RETARGET:**
- **Location disclosure** → NEW dedicated flag. Flag whenever the chatter states *where the creator lives/is from* (city/country), because it must match the bio each chatter was given. (We don't store bios yet, so surface **every** location claim for the manager to verify — see Open Q3.)
- **Free content given/offered** → keep (compliance). This is the piece we keep out of the discount removal.
- **Wrong name for a fan** → only flag **if the fan acknowledges the mismatch** ("that's not my name"). Otherwise silent (AI can't see stored fan names).
- **Bare tip solicitation** → keep flagging, but force **low** severity / non-priority (see Workstream B).

**TIGHTEN (keep the category, raise the bar):**
- **Meeting / real-life** → only flag an **explicit, concrete** in-person plan. Do NOT flag: online "join me," wordplay/metaphor, or a proper deflection (offering a custom instead of a call).
- **Age / underage-character** → don't flag when the fan states **18+** or is clearly adult (uni student), or when it's **vault content**. BUT still flag **edgy/ambiguous** age cases where it isn't clearly adult and explicit content proceeds.
- **Explicit / fetish** → don't flag chatter-initiated explicit content or benign fetishes; DO flag when the content is **unclear/edgy** and could be a ToS hard-limit.
- **Budget pushing** → only flag **repeated/aggressive** pressure after a hard limit, not a single soft discount attempt.
- **Emotional / promises** → keep only **off-platform contact** or real-world promises; drop routine reassurance.

**ADD (formatting instruction in the prompt):**
- **Non-English messages** → always include an **English translation** next to the original quote.

---

## Workstream B — Severity / priority reclassification
**File:** `server/src/utils/taskGenerator.js` (`defaultPriority`) + prompt severity guidance.
- Bare tip solicitation → always **low** tier (bottom of daily queue).
- New `location` compliance area → treat as **high** (verification-worthy), not critical.
- Re-check the `critical` list in the prompt so it no longer includes persona break / free-content-as-critical mislabels.

---

## Workstream C — Reply-time flags become individual, reviewable sub-tasks
**Today:** one task — *"kept 20 subs waiting"* — no way to find the 20 fans.
**Good news:** the per-sub detail already exists in the flag's `context.subs` (each: `fan_nickname`, `fan_username`, `tier`, `spend`, `count`, `worst_reply_min`, `worst_time`, `worst_chatter_message`, `worst_fan_message`, `creator_id`). Built in `computeChatterMetrics.js`, stored by `dailyCheck.js`.

**Changes:**
1. **`server/src/utils/taskGenerator.js`** — for `flag_type === 'high_response_time'`, instead of one task, emit a **parent task** with the headline + a **child list** built from `context.subs` (one entry per fan). Same for `afk_gap` using `context.incidents`.
2. **`client/src/pages/tasks/TasksPage.jsx`** — render the parent task as **expandable**, each child row showing: fan **username with click-to-copy**, worst wait (min) + time, and the worst chatter/fan message so the manager can locate it in Infloww. (Reuse the click-to-copy pattern the user asked for.)
3. Each child individually **completable/dismissable** so the manager works through them one by one.

**File:** `server/src/utils/dailyCheck.js` — keep the headline but ensure `context.subs` always carries the full list (it does today via `{ subs: slowInc }`).

---

## Workstream D — Workload becomes informative, not a task
- **Do not** raise workload as a task/flag. Instead surface `workload` (status, msgs/hour, total) on the **reply-time tab** as context next to the reply-time sub-tasks, so the manager sees "was this chatter overloaded?" while reviewing.
- **Files:** remove/guard the workload-driven severity bump in `dailyCheck.js`; show `workload` in the reply-time UI (`TasksPage.jsx` or the chatter reply-time view).

---

## Workstream E — Ignore-list (exclude specific accounts)
- New config key `ignored_accounts` in `daily_check_config` (comma-sep names/usernames). Seed with **Paul B**.
- Applied in **three places**: (1) metric/flag generation (`computeChatterMetrics.js` / `dailyCheck.js`) skip ignored chatters; (2) task generation (`taskGenerator.js`) drops them; (3) AI prompt gets "never mention these accounts."
- **Files:** `server/src/routes/organisations.js` (config already has GET/PUT), the three generators above, and a small Settings UI field (later).

---

## Workstream F — Time-waster vs new-sub (RESOLVED — behavioural)
- Today `tier = 'new_sub'` whenever there's no prior contact **in the day's window** — so genuine time-wasters get the "NEW SUB" urgency.
- **Rule (Alex):** a fan is a **time-waster after several sales attempts with no purchase.** Count PPV sends to that fan (`messages` where `price > 0` / creator message with a price and `purchased = false`) vs purchases (`subscriber_sales`). Time-waster = **≥ N sales attempts, 0 purchases** (N default 3 — confirm).
- **New sub:** `subscribers.first_seen` within the last 7 days (org-level table; page attribution via `subscriber_sales.creator_name` / messages).
- Reply-time tiering then: whale > new-sub > spender > rest; **time-wasters suppressed** (their waits don't matter, per manager workflow).
- Data: `subscribers` (`total_spend`, `classification`, `first_seen`, `last_spend_date`) + `subscriber_sales` + PPV-send counts from `messages`.

## Workstream H — Weekly Creator Review (Monday)
Replaces the daily creator page-health tasks. Two layers.

**Layer A — page digest (informational, NEVER a task):** per page, trend vs prior
period for revenue / ratio / LTV / spenders / churn / refunds. Free-page-aware
(skip renew-on%/churn where meaningless). This is the manager's "where to look" scan.

**Layer B — action tasks (small, sorted by the manager's priority order):**
| Trigger (threshold) | Task |
|---|---|
| **Revenue** ≥90% off 30-day baseline, **up OR down** | Suspicious income check on [page]/[day] — open dashboard, successful/failed sales, find cause, note feedback |
| **Refund** > **$50** (any single) | Chargeback/refund check on [page] — buyer's remorse or our error? |
| **LTV** drop **≥20%** (rolling **30-day** vs the 30-day ending 7 days earlier) | Cascade review (below) |
| **Ratio** **< 5** (trailing **2-week** window) | Cascade review (below) |
| **PS stalled** (`last_spend_date` gone quiet) | PS development check — are these spenders being grown into whales? Drop dead PS from list |
| Weekly, every page | Content cadence check (last batch vs agreement + fan content requests) — **manual item** (no data in reports) |

**The cascade (LTV/ratio drop → one bundled page task):**
> "[Page] LTV/ratio dropped → review this page's **new subs from the past week**,
> **whales**, and **potential spenders**, and **flag the most suspicious chatting
> performances** on the page."
Pulls together: new subs (`first_seen` ≤7d on page), whales + PS (below), and the
weakest chatter dialogues on that page from the chatter evals that week.

**Whale / PS identification — ALREADY SOLVED:**
- Use `subscribers.classification` directly — it's already populated org-wide:
  `whale` (73), `ps` (458), `regular` (466), `unclassified` (few). No nickname-tag
  parsing needed (only 1 name had a tag string, and it was a false positive).
- `total_spend` is populated and rich (top spender ~$25k) for tuning/verification.
- **Whale threshold (Alex):** a sub becomes a **whale at $1000+ lifetime spend** (mostly
  uniform across pages, occasionally page-specific). PS = spender below $1000 being
  developed toward whale. Use to verify/refresh `classification` in the weekly job.
- **Ideal signal (deferred):** a new sub who spends **>$100 in their first session** =
  instant whale — not trackable yet (needs first-session purchase data); future.

**Cadence:** run once per week (Monday). Creator eval stops running daily.
**Files:** `server/src/ai/evaluateCreatorDay.js` (prompt → digest + threshold triggers),
`server/src/utils/taskGenerator.js` (cascade + PS tasks), new weekly-digest storage,
`client` weekly-review view + auto-filled checklist.

---

## Workstream G — Protected compliance class (never auto-clear)
Proven necessary by the archive audit (a genuine real-life-meeting item was auto-archived).
- Define a **protected set** of compliance categories that neither the AI prioritiser
  (`prioritiseTasks.js`) nor the deterministic cap (`capLiveQueue` in `taskGenerator.js`)
  may ever archive: **location disclosure, meeting / real-life, under-18 / edgy-age,
  free content, off-platform contact.**
- Implementation: tag these tasks with a stable marker (e.g. `area` in a
  `PROTECTED_AREAS` set, or `context.protected = true` at generation time). Both archive
  paths skip any task whose area/marker is in the protected set (same way they already
  skip `critical`/`custom`).
- Also exclude the protected set from AI "archive" suggestions in the prioritiser prompt.
- **Files:** `server/src/utils/taskGenerator.js` (`capLiveQueue` filter + tag at insert),
  `server/src/ai/prioritiseTasks.js` (exclude from archive list + prompt note).

## Open questions — RESOLVED
1. **Time-waster** — ✅ DECIDED (behavioural): time-waster = **≥ N PPV/sales attempts with 0 purchases** (N default 3 — confirm the number). See Workstream F.
2. **Discount floor** — ✅ DECIDED: flag a discount only when the price is cut by **more than 50% of the initial/listed price**.
3. **Location** — ✅ DECIDED: flag **every** location disclosure; verify against bio manually.
4. **LTV** — ✅ DECIDED: rolling **30-day vs prior 30-day (7-day offset)**; drop **≥20% = high**.
5. **Ratio** — ✅ DECIDED: trailing **2-week** window; target **≥5**; below 5 → review task.
6. **Revenue anomaly** — ✅ DECIDED: **≥90%** deviation from 30-day baseline, **both directions**.
7. **Refunds** — ✅ DECIDED: any single refund **> $50** → look-up task.
8. **Chatter tenure** — ✅ DECIDED: 3 tiers off join date — **new** (0–7d), **active learning** (8–21d), **experienced** (21d+). Adapt existing `familDays` in `chatters.js`.

## Still open
- **Q1a — time-waster attempt count N** (default 3?) — the only remaining unknown.
- ~~Q9 Whale/PS thresholds~~ → RESOLVED: use `subscribers.classification` (`whale`/`ps`/`regular`), already populated.
- ~~Q10 PS nickname tag~~ → DROPPED: tags aren't in names; `classification` is the source.

## Files touched (summary)
- `server/src/ai/evaluateChatterDay.js` — prompt rewrite (A + B)
- `server/src/ai/evaluateChatterSales.js` — align bare-tip / budget wording
- `server/src/utils/taskGenerator.js` — priority tiers + reply-time sub-task expansion + ignore-list
- `server/src/utils/dailyCheck.js` — workload de-prioritise, keep `subs` context, ignore-list
- `server/src/utils/computeChatterMetrics.js` — time-waster tiering, ignore-list
- `server/src/routes/organisations.js` — `ignored_accounts` config
- `server/src/ai/prioritiseTasks.js` — exclude protected class from AI archive
- `server/src/utils/taskGenerator.js` — protected-class tag + `capLiveQueue` skip (also listed above)
- `client/src/pages/tasks/TasksPage.jsx` — expandable reply-time sub-tasks + click-to-copy + workload context

## Explicitly deferred
- Page health (ratio / LTV / revenue) → next category (weekly Monday trend + 90%-deviation revenue rule).
- Moving remaining "quality/sales" observations into a separate later sales-quality review lane.
