# Handoff — Chatting-Management Tool (Rice Media)

_Last updated: 2026-07-07_

## What this is
An internal QA / management tool for an OnlyFans agency (Rice Media). A chatting
manager uploads daily Infloww exports; the app runs AI analysis on chatter
conversations and creator pages, turns findings into a prioritised **task queue**,
and surfaces money + quality metrics on a Home dashboard.

## Stack
- **client/** — React + Vite. API base from `VITE_API_URL`; Supabase auth from
  `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`. (All `VITE_*` vars are baked in
  at **build** time — changing one requires a frontend redeploy.)
- **server/** — Express. Entry `server/index.js` (`helmet`, CORS origin =
  `CLIENT_URL`, routes under `/api/*`, health at `/api/health`). No static
  serving — frontend and backend are **separate services**.
- **Supabase** — Postgres + Auth. Project `goggtzbghfboqqptmgfx`.
- **Anthropic** — via `server/src/ai/agentRunner.js` (`new Anthropic()` reads
  `ANTHROPIC_API_KEY`). Models: Sonnet `claude-sonnet-5`, Haiku
  `claude-haiku-4-5`, Opus `claude-opus-5-5`.

## Deployment (Railway) — CURRENTLY LIVE AND WORKING
Two services in one Railway project:
- **backend** — Root Directory = `server`. Vars: `SUPABASE_URL`,
  `SUPABASE_SERVICE_KEY`/anon, `ANTHROPIC_API_KEY`, `CLIENT_URL`, `PORT` (injected).
- **frontend** — Root Directory = `client`. Vars: `VITE_API_URL`,
  `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.

**Three gotchas we already hit and fixed (all "missing `https://`" class):**
1. `VITE_API_URL` must be the FULL url `https://backend-...up.railway.app`
   (no scheme → axios treats it as a relative path → 404 on the frontend domain).
2. `CLIENT_URL` (backend) must be the FULL frontend url `https://frontend-...`
   (no scheme → CORS `Access-Control-Allow-Origin` mismatch → preflight blocked).
3. `ANTHROPIC_API_KEY` must be on the **backend** service (the AI runs there, not
   in the browser). Confirmed working — the AI Quality Analysis button returns
   results in production.

Status: login works, data loads, Shifts loads without error, AI eval works.
Migrations 012/013/014 applied on the shared Supabase.

## Data flow that matters (AI → tasks)
The single-chatter **AI Quality Analysis** button (`POST /api/daily-check/evaluate`,
`eval_type='sales_quality'`) only **stores a report card** in the
`chatter_evaluations` table. It does NOT create tasks directly.

Tasks are built by a separate step — **"Build report & tasks"** on Home →
`POST /api/review-tasks/rebuild` → `buildTasksForDate()` reads ALL stored
evaluations for that date and converts each `issue` into a `review_tasks` row
(dedup + carry-forward), then the AI prioritiser ranks, then `capLiveQueue`
(default 150) trims the backlog.

```
Run AI Quality Analysis → chatter_evaluations → Build report & tasks → review_tasks (Tasks tab)
```

## UNCOMMITTED CHANGE (in working tree, needs commit + frontend redeploy)
`client/src/pages/chatters/ChatterProfile.jsx` — `AIQualityPanel` issue list.
- **Was:** each flagged issue rendered only `iss.area` (so every row said
  "communication"); capped at 6 rows.
- **Now:** renders `iss.detail` (the finding + exact quote), a meta line
  (`area · @fan_username · $spend · 🕐 time` via `fmtSentAt`), the fan's quoted
  `iss.message`, and ALL issues (no 6-cap).
- The underlying data was already stored (enrichIssue in
  `server/src/ai/evalShared.js` saves `detail`/`fan_username`/`message`/`sent_at`);
  this was display-only. **No AI re-run needed** — but the deployed frontend must
  be redeployed to show it.

## Known pending / backlog (not blocking)
- "Periods" weekly-review feature (head manager closes a period, decides task
  migration). The `archived` task status is the building block for this.
- Optional Settings field for `live_queue_cap` (currently config-key driven,
  default 150).
- Per-page-manager task routing.
- Optional Home quick-sort presets ("Worst drops / Top earners").

## Repo conventions / traps
- `daily_check_config` is a key/value table per org (keys: `ratio_target`,
  `infloww_offset_hours`, `live_queue_cap`). Infloww export time is offset from the
  chat UI by a manual hour setting — `fmtSentAt(iso, offsetHours)` applies it.
- `review_tasks.status` is free-text: open/taken/completed/dismissed/archived
  (no CHECK constraint). `source_type='custom'` = manager task, pinned above AI
  tasks, excluded from the AI prioritiser and the queue cap.
- `shift_type` HAS a CHECK constraint: regular/overtime/rotation/custom (NOT
  'default' — that bug caused 0-shift auto-pages).
- `position: fixed` breaks under a transformed ancestor (`.animate-in`) — use
  React `createPortal` to `document.body` for overlays/modals.
- Sidebar nav: Metrics and AI items are intentionally hidden.

## User working style
Prefers **plain language, no coder jargon** — explain simply. (Saved as a
persistent memory preference.)
