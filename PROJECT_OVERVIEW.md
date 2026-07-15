# Chatting Management Tool — Full Project Overview

_A complete knowledge base of the current system: what it does, how it's built, the
data model, the AI pipeline, and the known gaps. Written as the reference for a
future custom-CRM rebuild._

_Last updated: 2026-07-15._

---

## 1. What this is

An internal **QA + management tool for an OnlyFans agency (Rice Media)**. A chatting
manager uploads Infloww spreadsheet exports each day; the tool computes work-ethic
metrics, runs AI over the actual dialogues, and turns findings into a **prioritised
task queue** the manager works through — plus per-chatter **coaching** and per-page
**revenue health**.

**Core users:** chatting managers (review chatters/pages), head managers/owners
(oversight, custom tasks, settings). Everything is **multi-tenant** by
`organisation_id`.

**The daily loop it supports:**
1. Chatters work OnlyFans pages in Infloww.
2. Manager exports two spreadsheets (Message Dashboard + Creator Statistics) and uploads them.
3. Tool computes metrics + runs AI → produces tasks + page-health signals.
4. Manager works the task queue, coaches chatters, tracks progress.

---

## 2. Tech stack

| Layer | Tech |
|---|---|
| **Frontend** | React 19 + Vite, React Router 7, Recharts, dnd-kit, framer-motion, lucide-react, react-hot-toast, Tailwind 4, axios |
| **Backend** | Node + Express 5, `@anthropic-ai/sdk`, `xlsx` (spreadsheet parse), multer (uploads), helmet/cors/morgan |
| **Database** | Supabase (Postgres). `supabaseAdmin` (service-role key, bypasses RLS) is used for all backend ops. |
| **Auth** | Supabase Auth. Frontend authenticates against Supabase, sends the auth token; backend resolves it to a `users` row (`auth_id`). |
| **AI** | Anthropic. Models: Sonnet `claude-sonnet-4-6` (default), Haiku `claude-haiku-4-5`, Opus `claude-opus-4-8`. (`openai`/`GROK_API_KEY` deps exist but the evaluation path is Anthropic via `ai/agentRunner.js`.) |
| **Deploy** | Railway — two services: **backend** (root `server`) + **frontend** (root `client`). `CLIENT_URL` sets CORS; `VITE_API_URL` points the client at the backend. Both need `https://`. |

Repo layout: `client/`, `server/`, `supabase/migrations/`, plus a stale `backup/`
mirror (ignore it). Knowledge graph in `graphify-out/` (gitignored).

---

## 3. Architecture — the pipeline end to end

```
 INFLoww EXPORTS (xlsx)
   │  Message Dashboard  (every message: fan/chatter text, reply time, price, sent-to)
   │  Creator Statistics (per-page revenue, subs, spenders, refunds…)
   ▼
 ① UPLOAD + PARSE            server/src/parsers/*  ·  routes/uploads.js
   → messages, subscriber_sales, subscribers, creator_daily_stats
   ▼
 ② METRICS ENGINE (deterministic, no AI)   utils/computeChatterMetrics.js, computeMetrics.js
   → chatter_daily_metrics  (reply times, AFK gaps, workload, PPVs, fan tiers)
   ▼
 ③ DAILY CHECK (flags)      utils/dailyCheck.js  → anomaly_flags
   → reply-time, AFK, ratio, LTV, revenue, chargeback flags (deterministic)
   ▼
 ④ AI EVALUATIONS           ai/evaluateChatterDay.js (compliance), evaluateChatterSales.js
   (strategy), evaluateCreatorDay.js (page)   → chatter_evaluations
   ▼
 ⑤ THE TASKER               utils/taskGenerator.js + ai/prioritiseTasks.js
   buildTasksForDate → prioritiseTasks (AI rank/archive) → capLiveQueue → review_tasks
   ▼
 ⑥ FRONTEND                 Dashboard (overview), Tasks (queue), ChatterProfile
   (coaching), DailyCheck (per-date), Reports (upload), Creators (shifts)
```

**Key design principle — deterministic vs AI split:** anything countable (reply
times, AFK gaps, revenue math, fan tiers) is computed deterministically and the AI
never touches it. The AI does only fuzzy judgment (compliance, sales craft, strategy
deviations) and the final **ranking**. So a reply-time figure is always reproducible;
the model is reserved for "which of these 40 things matters most today."

---

## 4. Data model

Grouped by purpose. Row counts are the current test org (illustrative of scale).

### Identity & org
- **organisations** — tenant root.
- **users** [2] — managers/owners. `role` (chatting_manager / head_manager / admin / owner), `auth_id` links to Supabase Auth.
- **creators** [23] — the OF pages/models. `merged_into`/`merged_at` support non-destructive page merging (grouping pages as a team without losing identity).
- **chatters** [21] — the employees. `status`, `work_days`, `hourly_rate`, `commission_pct`, `created_at` (drives tenure tiers).

### Assignments & scheduling
- **chatter_creator_assignments** — which chatter covers which page, with `day_of_week` + `cover_hours` (the fixed-weekly "Regular + Cover" model), `familiarization_ends_at`.
- **shifts** [24] — shift definitions (`shift_type`: regular/overtime/rotation/custom — has a CHECK constraint; 'default' is NOT valid).
- **creator_manager_assignments**, **chatter_days_off**, **chatter_overtime**, **cycles** [7] (weekly "periods" scaffold, mostly unused).

### Raw imported data (from Infloww)
- **data_imports** [54] — one row per uploaded file. `report_type` (message_dashboard / creator_statistics), `report_date`, `status`, `row_count`.
- **messages** [17,102] — every message. `fan_message_text`/`creator_message_text`, `replay_time_seconds` (reply latency), `price`/`purchased` (PPV), `sent_datetime`, `sent_to_username`/`sent_to_nickname`/`sent_to_display` (fan identity — see §9), `creator_id`, `sender_name` (chatter).
- **subscriber_sales** [29,939] — the PPV sales ledger (fan × date × price × page). Dedup key `message_hash`. Source of truth for spend.
- **subscribers** [9,613] — per-fan rollup: `total_spend`, `classification` (whale/ps/regular/unclassified), `first_seen`/`last_seen`/`last_spend_date`, `display_name`.
- **creator_daily_stats** [1,311] — per-page-per-day revenue: subscription/tips/message(PPV) gross, `refund_gross` (chargebacks), `number_of_spenders`, `active_fans`, `renew_on_pct`, `new_subscribers`, etc. All GROSS; net derived on read (OF takes 20%).

### Computed metrics (deterministic)
- **chatter_daily_metrics** [582] — per chatter-day work facts: `response_time_avg/p50/p75/p90_seconds`, `slow_reply_incidents` (jsonb, per-fan), `afk_incidents` (jsonb), `workload_status`/`workload_score`, `messages_sent`, `ppvs_sent`/`ppvs_unlocked`, `golden_ratio`, `unlock_rate`, `fans_chatted`.

### AI outputs
- **chatter_evaluations** [111] — stored AI reports. `eval_type` (compliance / sales_quality / creator), `payload` (jsonb: `{overall, issues[]}`), `input_tokens`/`output_tokens`, `model`. One current row per (subject, date, type) — delete-then-insert.
- **anomaly_flags** [147] — deterministic engine flags. `flag_type` (high_response_time, afk_gap, ratio_below_5, earnings_drop, ltv_drop, chargeback), `severity`, `details` (jsonb — carries per-fan `subs`/`incidents`), `status`.
- **daily_reviews** [6] — the AI prioritiser's narrative per date (`summary`, `day_review`). ⚠️ No token columns (tasker usage is unmeasured).

### The task system (the heart)
- **review_tasks** [389] — the live queue + full history. Key columns:
  - `fingerprint` (dedup + carry-forward), `source_type` (compliance/sales/creator/flag/custom/spender_dev), `area`, `severity`, `title`, `detail`, `context` (jsonb: fan quote, per-fan subs, spend…).
  - `status` (open/taken/completed/dismissed/archived — free text, no CHECK), `priority` (1–7), `priority_reason`, `cluster_key`.
  - `first_seen_date`/`last_seen_date`/`days_open`/`carried_over`/`regressed` (recurrence tracking).
  - `chatter_id`/`creator_id`/`fan_username` (attribution).
  - `dismiss_reason_code`/`dismiss_reason` (calibration signal).
  - `coach_flag`/`coached_at` (coaching, migration 015).
- **daily_check_config** [15] — per-org key/value settings (see §11).

### Legacy / unused (candidates to drop in the rebuild)
`tasks` + `task_templates` + `task_timer_logs` (old task system, superseded by review_tasks), `fan_spending` [8,905] (legacy pre-`subscribers`), `employee_daily_stats`, `chatter_performance_reviews`, `chatter_mistakes`, `chatter_penalties`, `selling_patterns`, `invitations` (all empty or unused in the current flow).

---

## 5. Upload & parsing (`server/src/parsers/`, `routes/uploads.js`)

- **`messageDashboard.js`** — parses the Message Dashboard xlsx → `messages`. Also folds sales into `subscriber_sales` and refreshes `subscribers`.
  - ⚠️ **Timezone gotcha (fixed):** Infloww cuts the "day" on a **CET boundary**, so every daily file spans two UTC dates (a ~1h tail of yesterday + the full day). The re-upload pre-clear now deletes only the file's **time window** (min→max `sent_datetime`), not whole calendar dates — a previous version deleted by date and wiped ~94% of the previous day on every upload.
  - Has a date-mismatch guard: the picked `report_date` must appear in the file.
- **`creatorStats.js`** — parses Creator Statistics → `creator_daily_stats` (GROSS values, incl. `refund_gross` = chargebacks).
- **`subscriberSpend.js`** — maintains `subscribers` from the sales ledger. `classify()`: **whale ≥ $1000**, **ps ≥ $80**, regular > 0, else unclassified.
- **`autoMatch.js`** — fuzzy-matches spreadsheet creator/chatter names to DB rows.

**Upload UI:** `ReportsPage.jsx` (route `/reports`). Once both files are uploaded for a date, a **"✨ Create daily tasks"** banner appears → runs the whole pipeline (recompute metrics → AI compliance per chatter with a progress bar → build & rank tasks).

---

## 6. Metrics engine — deterministic (`utils/computeChatterMetrics.js`)

Reads `messages`, computes per chatter-day:
- **Reply-time incidents** — a reply > **5 min** (`WAITING_RT_SEC=300`) = a fan kept waiting. Grouped per fan (count, worst wait, when, the message). Each fan tagged with a **tier**.
- **AFK gaps** — a silence **30 min–3 h** with fans waiting. Captures the bracketing chatter messages + usernames + the fans left waiting (so a manager can find the exact spot in Infloww).
- **Workload** — a 2×2 of volume (msgs/active-hour ≥40 or ≥250/day) × speed (day avg reply ≥150s) → healthy / overloaded / light / underperforming. **Informational only** — it's shown but never changes a task's severity.
- **Fan tier** (`tierOf`): whale ($1000+) > new_sub (first_seen ≤7d) > spender/ps > low > **time_waster** ($0 spend + subscribed >14d — their waits are suppressed). Time-waster detection uses `subscribers.first_seen` age.

Then `dailyCheck.js` (`runDailyCheck`) turns those into **anomaly_flags** and computes page-health (ratio, LTV, revenue vs baseline, chargebacks) per creator.

---

## 7. AI evaluation layer

Three evals, all through `ai/agentRunner.js`. Each conversation the AI reads has a
header showing the fan's **spend** and **page**: `[u573778077, spent $480] (page: Leya)`.

### ① Compliance spotlight — `evaluateChatterDay.js` (`eval_type='compliance'`)
Runs **daily, per chatter** (the batch driver). A spotlight, not a grader — surfaces
moments to check. Flags: ToS content, under-18/edgy age, real-life meetings (explicit
only), free content, off-platform contact, big (>50%) discounts, **missed sales /
ignored buying signals** (high for whales/new-subs/spenders), **dry replies to
spenders**, **laughing emojis** (low). Deliberately does NOT flag: persona/identity,
ordinary discounts, copy-paste, wrong-name (unless the fan objects), cross-page
content differences. Fan identified by **username** (not display name — see §9).

### ② Strategy review — `evaluateChatterSales.js` (`eval_type='sales_quality'`)
Runs **manually, per chatter** (the "AI Analysis for Dialogues and Sales Quality"
panel). Not a grader — finds every deviation from the Rice playbook (§10) and writes
each as a **coaching case**: engagement quality (mirror energy, open questions,
human-like texting, no dry replies), the full sales roadmap (Normal→Flirt→Horny→Sex,
don't overheat, probe readiness, ladder pricing, script = live experience, no free
sexting, aftercare, follow-up on failed sale), and pricing discipline. **Feeds tasks
immediately** (see §8) — no Home rebuild needed.

### ③ Creator/page review — `evaluateCreatorDay.js` (`eval_type='creator'`)
Runs **per page** (weekly). Threshold-gated so it doesn't spam: revenue ±90% vs
30-day baseline, LTV −20% (30-day windows), ratio <5 (2-week), **chargebacks >$50**,
spender/churn on sustained deterioration. A ratio/LTV drop is phrased as a **cascade
action** ("review this page's new subs, whales, PS + flag weakest chatters").

**Translation is mandatory** in all prompts: non-English quotes get an English
translation appended.

---

## 8. The tasker — build → rank → cap (`utils/taskGenerator.js`, `ai/prioritiseTasks.js`)

Triggered by **`/api/review-tasks/rebuild`** (the Home "Build tasks" button, or the
end of "Create daily tasks").

1. **`buildTasksForDate`** — reads the date's `chatter_evaluations` + `anomaly_flags`, turns each finding into a task candidate, then:
   - **Ignore-list** — drops accounts in config `ignored_accounts` (e.g. "Paul B", a manager who sometimes chats).
   - **Tenure gating** — new chatters (0–7d) get everything; active-learning (8–21d) medium+; **experienced (21d+) only high/critical + protected**. Flags & page-health always pass.
   - **Fingerprint + carry-forward** — the same recurring issue is the *same* task with `days_open++` (not a duplicate); dismissed stays dismissed; a fixed-then-returned issue **regresses** and reopens bumped.
   - **Default priority (P1–P7)** by severity + area. **Flags carry their own area** via `FLAG_AREA` (e.g. chargeback → area `chargeback` → **P1**); everything else defaults to `work_ethic`.
   - Reply-time/AFK flags carry per-fan sub-rows into `context` (rendered as expandable checklists in the UI).
2. **`buildSpenderDevelopmentTasks`** — weekly: PS/whales who were recently active but went quiet (last spend 14–30d ago), one bundled task per page, capped at 8 fans, whales first.
3. **`prioritiseTasks`** (the AI task manager) — re-tiers mis-ranked items, bumps carried-over/regressed ones, and **archives** the low-value tail. It **never** touches: engine flags (reply-time/AFK/page-health), custom tasks, spender-dev, or **protected** items. ⚠️ Its token usage is not stored.
4. **`capLiveQueue`** — deterministic backstop: if the live queue > **150**, archive the lowest-tier oldest items — never protected/high/critical/custom/spender-dev.

**Protected areas** (never AI-archived, never queue-capped): `tos, age, meeting,
free_content, offplatform, chargeback`.

**Priority tiers:** P1 critical/safety (ToS, minor, meeting, free content, off-platform,
chargeback, revenue collapse) → P2 serious work-ethic (AFK, neglected new-subs/whales,
big discounts) → P3 lost money (missed sale on new-sub/whale/spender) → P4 comms → P5
sales craft → P6 page-health watch → P7 polish.

**Per-chatter task population:** running the AI analysis on a chatter builds **all** of
that chatter's tasks (`buildAllChatterTasks`), bypassing tenure gating — the manager
chose to review them.

---

## 9. Fan identity & tiers (important for a CRM)

- Fans arrive from the export's `Sent to` column = `Nickname (handle)`. We store the **handle** as `sent_to_username`. There is **no numeric OF fan-ID** in the export.
- **Display names collide massively** — 548 nicknames are shared by multiple fans ("Alex" = 54 fans). So the AI is asked to identify fans by **username**, and the resolver never guesses on a shared nickname (searches the candidates' threads, lets the quote decide, else attaches no username).
- **Fans rename themselves** — a fan can switch from a custom handle to a default `u…` id (69% of our fans are `u…`, 31% custom). When that happens our historical records key on the old handle and become un-findable in Infloww. **No alias/merge mechanism exists yet** (a good CRM feature).
- **Tiers** (playbook): TW = $0, **PS = $80+** (playbook: new sub $80+ in first session → whale treatment 1–2 weeks; we approximate with lifetime spend), **Whale = $1000+**.

---

## 10. The domain rules (what "good chatting" means)

Distilled in **`STRATEGY_OVERVIEW.md`** (the evaluation rubric from the Rice Media
playbook). Summary of the dimensions the tool evaluates:
1. **Compliance/ToS** — no minors/relatives/scat/bestiality; meetings deflected (never yes/no).
2. **Engagement** — no dry replies to spenders; mirror energy; open questions; human-like texting; approved emoji palette (no laughing emojis); >50% messages use a strategy.
3. **Sales roadmap** — Normal→Flirt→Horny→Sex step-by-step; don't overheat; probe readiness; ladder pricing by explicitness; script = live experience; no free sexting; aftercare; follow-up on failed sale.
4. **Pricing** — photo $45–55, video $70+, long video $100+; respect spending history.
5. **Prioritisation & reply <2.5 min** — New subs > Whales > Spenders > Unsubs > TW.
6. **Notes discipline** — *not implemented* (we don't ingest Infloww notes).

---

## 11. Configuration (`daily_check_config`, per-org key/value)

Read as `num(cfg.key, default)`. **Current DB values** (⚠️ some override newer code
defaults — see §13):

| Key | Current | Meaning |
|---|--:|---|
| `ratio_target` | 5 | tips+PPV vs subs target |
| `ratio_window_days` | **7** | ratio window (code default is now 14) |
| `ltv_drop_pct` | **25** | LTV drop % to flag (code default now 20) |
| `bad_day_drop_pct` | **80** | revenue-drop % (code default now 90) |
| `good_day_rise_pct` | **50** | revenue-spike % (code default now 90) |
| `baseline_window_days` | 30 | revenue baseline window |
| `min_revenue_floor` | 50 | ignore page-health on tiny pages |
| `slow_reply_seconds` | 150 | slow-day threshold |
| `afk_gap_minutes` | 20 | AFK gap threshold |
| `refund_spike_amount` | 50 | chargeback flag threshold ($) |
| `late_start_minutes` / `punctuality_grace_minutes` | 10 | punctuality |
| `of_commission_pct` | 20 | OF's cut (net = gross × 0.8) |
| `infloww_offset_hours` | 1 | manual TZ alignment for displayed times |
| `ignored_accounts` | Paul B | comma-sep names excluded from reports |
| `live_queue_cap` | (default 150) | max live tasks before capping |

---

## 12. API surface (`server/index.js`)

All under `/api`, all behind `authMiddleware` except `/auth`:
`/auth` · `/organisations` (incl. `/config`, `/members`) · `/creators` · `/chatters` ·
`/shifts` · `/tasks` (legacy) · `/cycles` · `/uploads` (incl. `/day-status`) ·
`/metrics` · `/ai` · `/daily-check` (run, evaluate, overview, chatter-evals,
chatter-eval-history, `:date`) · `/review-tasks` (rebuild, custom, `:id` PATCH with
take/complete/dismiss/archive/reopen/coach/uncoach/coached).

---

## 13. Known gaps, tech debt & lessons (READ before the rebuild)

1. **⚠️ Config drift** — `daily_check_config` still holds the OLD calibration values (`ratio_window_days=7`, `bad_day_drop_pct=80`, `good_day_rise_pct=50`, `ltv_drop_pct=25`). Since DB values override code defaults, the newer LTV-30d / ratio-14d / revenue-±90% calibration is **not actually live** until these keys are updated or deleted. Easy fix; flagged.
2. **Notes discipline unbuildable** — we don't ingest Infloww fan/model notes; a whole evaluation dimension (and a penalisable one) is missing. A CRM that captures notes unlocks it.
3. **Fan renames / aliases** — no way to merge `old_handle → u12345` when a fan renames; old tasks/spend become un-findable. High-value CRM feature (spend-fingerprint matching).
4. **First-session PS** — playbook PS = "$80 in first session"; we approximate with lifetime spend because we lack per-session first-purchase data.
5. **Tasker tokens unmeasured** — `prioritiseTasks` makes a real AI call not recorded in `daily_reviews`.
6. **Legacy tables** — `tasks`, `task_templates`, `fan_spending`, etc. are dead weight; the rebuild should drop them.
7. **`backup/` folder** — a stale full mirror of `client/`+`server/` in the repo; ignore it (it doubles search results).
8. **Fan data in git history** — `DISMISSED_CALIBRATION.md`/`ARCHIVED_AUDIT.md`/`CREATOR_REPORT_DUMP.md` (now gitignored) still exist in older commits with real fan usernames/quotes/spend. Needs a history scrub if the repo is ever public.
9. **Deploy footgun** — every Railway URL var needs `https://` (VITE_API_URL, CLIENT_URL) or you get 404/CORS. `VITE_*` bakes at build → redeploy frontend to change.

**Big lessons for the CRM:** (a) store the **raw uploaded files** (we don't — `file_url` is empty — so re-parsing for new columns is impossible); (b) normalise fan identity with a stable internal id + alias table from day one; (c) keep the deterministic/AI split (never let the model compute countable facts); (d) treat timezone boundaries explicitly (the CET/UTC day-cut caused 94% data loss).

---

## 14. Token usage & cost (measured, `chatter_evaluations`)

| Operation | Avg input/run | Avg output/run |
|---|--:|--:|
| Daily check (compliance, per chatter) | 7,289 | 1,231 |
| Creator review (per page) | 1,323 | 308 |
| Chatter review (strategy, per chatter) | 7,311 | 4,796 |

**A full daily run** (~12 chatters + 12 pages) ≈ **~103k input + ~19k output ≈ ~122k
tokens** (plus the unmeasured tasker). Compliance dominates (reads full dialogues).
Default model Sonnet.

---

## 15. Annotated file map

**Backend AI** (`server/src/ai/`): `agentRunner.js` (Anthropic wrapper) · `evalShared.js`
(thread building, spend/page enrichment, fan resolution) · `evaluateChatterDay.js`
(compliance) · `evaluateChatterSales.js` (strategy) · `evaluateCreatorDay.js` (page) ·
`prioritiseTasks.js` (AI ranking) · `runDailyAnalysis.js` (older org-wide path) ·
`agents/*` (older per-dimension agents, largely superseded).

**Backend logic** (`server/src/utils/`): `computeChatterMetrics.js` (reply/AFK/tiers) ·
`computeMetrics.js` (sales rollups) · `dailyCheck.js` (flags + page health) ·
`taskGenerator.js` (build/cap/spender-dev/coaching-eval) · `overview.js` (Home ranking) ·
`evaluationStore.js` (save/load evals) · `parsers.js`, `autoMatch.js`, `supabase.js`.

**Backend routes** (`server/src/routes/`): one file per resource (see §12).

**Frontend pages** (`client/src/pages/`): `dashboard/` (Home overview + Build tasks) ·
`tasks/` (the queue, filters, reply-time/AFK checklists, coach button) · `chatters/`
(ChatterProfile: metrics, AI panels, Coaching Log, Daily reports + AI Analysis
timelines, schedule) · `dailycheck/` (per-date flags + evals) · `reports/` (upload +
Create daily tasks) · `creators/` (pages, shifts, cover model) · `settings/`, `team/`,
`pulse/`, `auth/`.

**Migrations** (`supabase/migrations/`): 001 initial · 007 chatter_evaluations · 008
creator evals · 009 review_tasks · 010 dismiss reasons · 011 daily_reviews · 012
creator_groups · 013 shift_covers · 014 chatter metrics (PPV/fans) · 015 task coaching.
