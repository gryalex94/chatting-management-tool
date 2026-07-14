# Graph Report - chatting-management-tool  (2026-07-12)

## Corpus Check
- 170 files · ~141,982 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1122 nodes · 1782 edges · 76 communities (71 shown, 5 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 96 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `f934a5b6`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Report Parsers
- AI Eval Runner
- Creator Stats Parsing
- Daily Check Engine
- Client Dependencies
- Client Dependencies
- Daily Check Page UI
- Tasks Page UI
- Task & Settings Modals
- AI Analysis Agents
- Server Dependencies
- Creators Page UI
- Server Dependencies
- App Shell & Routing
- Chatter Profile UI
- Server Entry & Routes
- Chatter Profile UI
- Review Task Generation
- App Shell & Routing
- Creators Page UI
- Server Entry & Routes
- Server Entry & Routes
- Auth Middleware & Routes
- Daily Analysis Pipeline
- Auth & Chatter Routes
- Daily Analysis Pipeline
- Chatter & Task Routes
- Creator & Shift Routes
- Dashboard Widgets
- Reports/Team/Uploads UI
- Settings & Shared UI
- Metrics Computation
- Metrics Computation
- Reports & Shared Widgets
- Custom Task Creation
- Theme & Topbar
- Auth Context & API Client
- AI Routes
- Shifts Route
- Organisations Route
- ESLint Config
- Vite Config
- ESLint Config
- Vite Config
- Creator weekly-report dump (latest eval per page)
- Handoff — Chatting-Management Tool (Rice Media)
- evaluateCreatorDay.js
- graphify reference: extra exports and benchmark
- Topbar.jsx
- creatorStats.js
- AuthContext.jsx
- graphify reference: query, path, explain
- React + Vite
- shifts.js
- graphify reference: add a URL and watch a folder
- graphify reference: commit hook and native CLAUDE.md integration
- graphify reference: incremental update and cluster-only
- React + Vite
- graphify reference: GitHub clone and cross-repo merge
- graphify reference: transcribe video and audio
- CLAUDE.md
- CLAUDE.md
- extraction-spec.md
- organisations.js
- tasks.js
- evaluateCreatorDay.js
- Chatter performance — evaluation blueprint
- computeChatterMetrics.js
- creators.js
- organisations.js
- shifts.js
- tasks.js

## God Nodes (most connected - your core abstractions)
1. `supabaseAdmin` - 28 edges
2. `useAuth()` - 20 edges
3. `useAuth()` - 20 edges
4. `runDailyCheck()` - 20 edges
5. `supabaseAdmin` - 16 edges
6. `Archived-task audit (124 cases)` - 16 edges
7. `Dismissed-task calibration set (85 cases)` - 16 edges
8. `runAgent()` - 14 edges
9. `Implementation plan — daily-check calibration (round 1)` - 14 edges
10. `runAgent()` - 13 edges

## Surprising Connections (you probably didn't know these)
- `AIQualityPanel()` --calls--> `fmtSentAt()`  [EXTRACTED]
  client/src/pages/chatters/ChatterProfile.jsx → client/src/utils/taskMeta.js
- `ProtectedRoute()` --calls--> `useAuth()`  [EXTRACTED]
  backup/client/src/App.jsx → backup/client/src/context/AuthContext.jsx
- `AppRoutes()` --calls--> `useAuth()`  [EXTRACTED]
  backup/client/src/App.jsx → backup/client/src/context/AuthContext.jsx
- `Topbar()` --calls--> `useAuth()`  [EXTRACTED]
  backup/client/src/components/layout/Topbar.jsx → backup/client/src/context/AuthContext.jsx
- `ChatterProfile()` --calls--> `useAuth()`  [EXTRACTED]
  backup/client/src/pages/chatters/ChatterProfile.jsx → backup/client/src/context/AuthContext.jsx

## Import Cycles
- None detected.

## Communities (76 total, 5 thin omitted)

### Community 0 - "Report Parsers"
Cohesion: 0.18
Nodes (9): authMiddleware(), requireMinRole(), { supabaseAdmin }, { requireMinRole }, router, { supabaseAdmin }, { requireMinRole }, router (+1 more)

### Community 1 - "AI Eval Runner"
Cohesion: 0.10
Nodes (27): AfkIncidents(), buildGroups(), chipStyle(), copy(), dayHeader, filterLabel, filterPanel, filterRow (+19 more)

### Community 2 - "Creator Stats Parsing"
Cohesion: 0.16
Nodes (14): DismissModal(), ghost, primary, CoachingLog(), inp, SettingsPage(), getInflowwOffset(), setInflowwOffset() (+6 more)

### Community 3 - "Daily Check Engine"
Cohesion: 0.08
Nodes (32): Anthropic, client, parseJson(), runAgent(), salvageJson(), analyzeCommunication(), formatConversations(), { runAgent } (+24 more)

### Community 4 - "Client Dependencies"
Cohesion: 0.05
Nodes (36): dependencies, axios, date-fns, @dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities, framer-motion, lucide-react (+28 more)

### Community 5 - "Client Dependencies"
Cohesion: 0.07
Nodes (30): AIAnalysis(), aiBox, btnStyle, cardStyle, ChatterCard(), chatterFacts(), copy(), CreatorCard() (+22 more)

### Community 6 - "Daily Check Page UI"
Cohesion: 0.20
Nodes (18): bestOverlap(), buildEnrichment(), buildThreadList(), extractQuote(), loadChatterMessages(), MODELS, _norm(), sigTokens() (+10 more)

### Community 7 - "Tasks Page UI"
Cohesion: 0.13
Nodes (25): avg(), chatterMetricsForDate(), chatterNameMap(), computeLtvWindow(), computePunctuality(), computeRatio(), creatorNameMap(), loadConfig() (+17 more)

### Community 8 - "Task & Settings Modals"
Cohesion: 0.11
Nodes (11): Avatar(), DAY_LABELS, DAY_NUMBERS, getTodayDayNumber(), getWeekDates(), ShiftSlot(), WeekBar(), avatarColor() (+3 more)

### Community 9 - "AI Analysis Agents"
Cohesion: 0.07
Nodes (26): author, dependencies, @anthropic-ai/sdk, cors, csv-parser, dotenv, express, helmet (+18 more)

### Community 10 - "Server Dependencies"
Cohesion: 0.22
Nodes (8): multer, { parseCreatorStats }, { parseEmployeeReport }, { parseMessageDashboard }, { requireMinRole }, router, { supabaseAdmin }, upload

### Community 11 - "Creators Page UI"
Cohesion: 0.19
Nodes (21): buildSpenderDevelopmentTasks(), buildTasksForChatterEval(), buildTasksForDate(), capLiveQueue(), countOpen(), defaultCluster(), defaultPriority(), keepByTenure() (+13 more)

### Community 12 - "Server Dependencies"
Cohesion: 0.11
Nodes (11): AIQualityPanel(), buildDailySeries(), CATEGORY_COLORS, ChatterProfile(), DAY_LABELS, DAY_NUMBERS, goldenColor(), PageContribution() (+3 more)

### Community 13 - "App Shell & Routing"
Cohesion: 0.13
Nodes (11): DEFAULT_TEMPLATE, inp, PRIORITIES, AuthContext, AuthProvider(), SetupPage(), statusConfig, reportTypes (+3 more)

### Community 14 - "Chatter Profile UI"
Cohesion: 0.05
Nodes (50): days(), dollar(), extractDate(), { findOrCreateCreator }, intval(), nullDash(), parseCreatorStats(), pct() (+42 more)

### Community 15 - "Server Entry & Routes"
Cohesion: 0.11
Nodes (17): aiRoutes, app, { authMiddleware }, authRoutes, chatterRoutes, cors, creatorRoutes, cycleRoutes (+9 more)

### Community 16 - "Chatter Profile UI"
Cohesion: 0.16
Nodes (15): App(), AppRoutes(), ProtectedRoute(), Layout(), LOWER, NAV, Sidebar(), Topbar() (+7 more)

### Community 17 - "Review Task Generation"
Cohesion: 0.08
Nodes (36): extractDate(), { findOrCreateCreator }, nullDash(), parseCreatorStats(), parseDays(), parseDollar(), parseFloat2(), parsePercent() (+28 more)

### Community 18 - "App Shell & Routing"
Cohesion: 0.29
Nodes (10): { computeMetricsForOrg }, router, { supabaseAdmin }, computeMetricsForOrg(), computeResponseTimeTrends(), computeRollingAverages(), percentile(), populateMetricsFromEmployeeStats() (+2 more)

### Community 19 - "Creators Page UI"
Cohesion: 0.05
Nodes (36): dependencies, axios, date-fns, @dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities, framer-motion, lucide-react (+28 more)

### Community 20 - "Server Entry & Routes"
Cohesion: 0.17
Nodes (4): Chip(), StatusDot(), REPORTS, ReportsPage()

### Community 23 - "Server Entry & Routes"
Cohesion: 0.09
Nodes (30): Anthropic, client, runAgent(), analyzeCommunication(), formatConversations(), { runAgent }, analyzeCompliance(), formatConversations() (+22 more)

### Community 24 - "Auth Middleware & Routes"
Cohesion: 0.07
Nodes (26): author, dependencies, @anthropic-ai/sdk, cors, csv-parser, dotenv, express, helmet (+18 more)

### Community 25 - "Daily Analysis Pipeline"
Cohesion: 0.08
Nodes (24): For /graphify add and --watch, For /graphify query, For the commit hook and native CLAUDE.md integration, For --update and --cluster-only, /graphify, Honesty Rules, Interpreter guard for subcommands, Part A - Structural extraction for code files (+16 more)

### Community 26 - "Auth & Chatter Routes"
Cohesion: 0.10
Nodes (19): aiRoutes, app, { authMiddleware }, authRoutes, chatterRoutes, cors, creatorRoutes, cycleRoutes (+11 more)

### Community 27 - "Daily Analysis Pipeline"
Cohesion: 0.13
Nodes (7): CATEGORY_COLORS, ChatterProfile(), DAY_LABELS, DAY_NUMBERS, goldenColor(), PageContribution(), unlockColor()

### Community 28 - "Chatter & Task Routes"
Cohesion: 0.19
Nodes (12): App(), AppRoutes(), ProtectedRoute(), Layout(), LOWER, NAV, Sidebar(), useAuth() (+4 more)

### Community 29 - "Creator & Shift Routes"
Cohesion: 0.14
Nodes (7): CreatorsPage(), DAY_LABELS, DAY_NUMBERS, getTodayDayNumber(), getWeekDates(), ShiftSlot(), WeekBar()

### Community 30 - "Dashboard Widgets"
Cohesion: 0.11
Nodes (17): aiRoutes, app, { authMiddleware }, authRoutes, chatterRoutes, cors, creatorRoutes, cycleRoutes (+9 more)

### Community 31 - "Reports/Team/Uploads UI"
Cohesion: 0.13
Nodes (11): Cell(), dash, DashboardPage(), expandLabel, expandWrap, inputStyle, money(), panel (+3 more)

### Community 32 - "Settings & Shared UI"
Cohesion: 0.12
Nodes (16): Age / underage-character (6), Archived-task audit (124 cases), Bare tip solicitation (3), Budget / pushed after limit (5), Copy-paste / duplicate script (8), Explicit / ToS content (6), Free content / unpaid send (3), Location disclosure (3) (+8 more)

### Community 33 - "Metrics Computation"
Cohesion: 0.12
Nodes (16): aiRoutes, app, { authMiddleware }, authRoutes, chatterRoutes, cors, creatorRoutes, cycleRoutes (+8 more)

### Community 34 - "Metrics Computation"
Cohesion: 0.18
Nodes (9): authMiddleware(), requireMinRole(), { supabaseAdmin }, { requireMinRole }, router, { supabaseAdmin }, { requireMinRole }, router (+1 more)

### Community 35 - "Reports & Shared Widgets"
Cohesion: 0.12
Nodes (16): Age / underage-character (6), Bare tip solicitation (3), Budget violation / pushed after limit (2), Copy-paste / duplicate script (5), Dismissed-task calibration set (85 cases), Emotional / romance (5), Explicit content / dirty talk (2), Free content to $0 / non-spenders (3) (+8 more)

### Community 36 - "Custom Task Creation"
Cohesion: 0.50
Nodes (3): { requireMinRole }, router, { supabaseAdmin }

### Community 37 - "Theme & Topbar"
Cohesion: 0.40
Nodes (4): { requireMinRole }, router, { runDailyAnalysis, runDailyAnalysisForOrg }, { supabaseAdmin }

### Community 38 - "Auth Context & API Client"
Cohesion: 0.22
Nodes (8): router, { supabaseAdmin }, { requireMinRole }, router, { supabaseAdmin }, { createClient }, supabaseAdmin, supabasePublic

### Community 39 - "AI Routes"
Cohesion: 0.16
Nodes (3): PriorityDot(), StatusDot(), DashboardPage()

### Community 40 - "Shifts Route"
Cohesion: 0.19
Nodes (5): REPORTS, ReportsPage(), statusConfig, reportTypes, api

### Community 41 - "Organisations Route"
Cohesion: 0.13
Nodes (14): Explicitly deferred, Files touched (summary), Implementation plan — daily-check calibration (round 1), Open questions — RESOLVED, STATUS (2026-07-07) — round 1 server implementation landed, Still open, Workstream A — Rewrite the compliance AI prompt, Workstream B — Severity / priority reclassification (+6 more)

### Community 42 - "ESLint Config"
Cohesion: 0.26
Nodes (8): Avatar(), inp, SettingsPage(), avatarColor(), fmtTimer(), initials(), PRIORITY_COLORS, STATUS_META

### Community 43 - "Vite Config"
Cohesion: 0.29
Nodes (10): { computeMetricsForOrg }, router, { supabaseAdmin }, computeMetricsForOrg(), computeResponseTimeTrends(), computeRollingAverages(), percentile(), populateMetricsFromEmployeeStats() (+2 more)

### Community 44 - "ESLint Config"
Cohesion: 0.16
Nodes (17): { buildOverview }, { buildTasksForChatterEval }, { evaluateChatterDay }, { evaluateChatterSales }, { evaluateCreatorDay }, NOTE: must be registered before '/:date' or it gets caught as a date param., router, { runDailyCheck } (+9 more)

### Community 45 - "Vite Config"
Cohesion: 0.24
Nodes (6): CreateTaskModal(), DEFAULT_TEMPLATE, inp, PRIORITIES, CreatorRow(), LANES

### Community 46 - "Creator weekly-report dump (latest eval per page)"
Cohesion: 0.20
Nodes (9): churn (11), Creator weekly-report dump (latest eval per page), ltv (8), Observations by metric, other (2), Per-page weekly summary (the "where to look"), ratio (3), revenue (11) (+1 more)

### Community 47 - "Handoff — Chatting-Management Tool (Rice Media)"
Cohesion: 0.20
Nodes (9): Data flow that matters (AI → tasks), Deployment (Railway) — CURRENTLY LIVE AND WORKING, Handoff — Chatting-Management Tool (Rice Media), Known pending / backlog (not blocking), Repo conventions / traps, Stack, UNCOMMITTED CHANGE (in working tree, needs commit + frontend redeploy), User working style (+1 more)

### Community 48 - "evaluateCreatorDay.js"
Cohesion: 0.20
Nodes (10): prioritiseTasks(), { runAgentDetailed }, shiftDays(), { supabaseAdmin }, { buildTasksForDate, capLiveQueue, buildSpenderDevelopmentTasks }, crypto, { prioritiseTasks }, { requireMinRole } (+2 more)

### Community 49 - "graphify reference: extra exports and benchmark"
Cohesion: 0.22
Nodes (8): graphify reference: extra exports and benchmark, Step 6b - Wiki (only if --wiki flag), Step 7 - Neo4j export (only if --neo4j or --neo4j-push flag), Step 7a - FalkorDB export (only if --falkordb or --falkordb-push flag), Step 7b - SVG export (only if --svg flag), Step 7c - GraphML export (only if --graphml flag), Step 7d - MCP server (only if --mcp flag), Step 8 - Token reduction benchmark (only if total_words > 5000)

### Community 50 - "Topbar.jsx"
Cohesion: 0.36
Nodes (5): Topbar(), Chip(), ThemeContext, ThemeProvider(), useTheme()

### Community 51 - "creatorStats.js"
Cohesion: 0.20
Nodes (9): { requireMinRole }, router, { runDailyAnalysis, runDailyAnalysisForOrg }, { supabaseAdmin }, router, { supabaseAdmin }, { createClient }, supabaseAdmin (+1 more)

### Community 52 - "AuthContext.jsx"
Cohesion: 0.47
Nodes (4): AuthContext, AuthProvider(), setApiToken(), supabase

### Community 53 - "graphify reference: query, path, explain"
Cohesion: 0.33
Nodes (5): For /graphify explain, For /graphify path, graphify reference: query, path, explain, Step 0 — Constrained query expansion (REQUIRED before traversal), Step 1 — Traversal

### Community 54 - "React + Vite"
Cohesion: 0.50
Nodes (3): Expanding the ESLint configuration, React Compiler, React + Vite

### Community 55 - "shifts.js"
Cohesion: 0.22
Nodes (8): A. Compliance / ToS  — hard rules ($500 penalty + job risk), B. Engaging communication  — the foundation (>50% of messages must use a strategy), C. Sales roadmap  — the selling flow, D. Pricing, E. Work ethic / technical (measurable), F. Penalties (severity calibration), How this maps to our AI evaluation, Rice Media — Chatting Strategy & Evaluation Blueprint

### Community 56 - "graphify reference: add a URL and watch a folder"
Cohesion: 0.50
Nodes (3): For /graphify add, For --watch, graphify reference: add a URL and watch a folder

### Community 57 - "graphify reference: commit hook and native CLAUDE.md integration"
Cohesion: 0.50
Nodes (3): For git commit hook, For native CLAUDE.md integration, graphify reference: commit hook and native CLAUDE.md integration

### Community 58 - "graphify reference: incremental update and cluster-only"
Cohesion: 0.50
Nodes (3): For --cluster-only, For --update (incremental re-extraction), graphify reference: incremental update and cluster-only

### Community 59 - "React + Vite"
Cohesion: 0.50
Nodes (3): Expanding the ESLint configuration, React Compiler, React + Vite

### Community 67 - "organisations.js"
Cohesion: 0.50
Nodes (3): { requireMinRole }, router, { supabaseAdmin }

### Community 68 - "tasks.js"
Cohesion: 0.50
Nodes (3): { requireMinRole }, router, { supabaseAdmin }

### Community 69 - "evaluateCreatorDay.js"
Cohesion: 0.27
Nodes (10): runAgentDetailed(), dM(), evaluateCreatorDay(), fmtRange(), fmtToday(), fmtTrend(), { MODELS }, MON (+2 more)

### Community 70 - "Chatter performance — evaluation blueprint"
Cohesion: 0.20
Nodes (9): 1. Compliance / ToS — **[Global]** (already live), 2. Engagement quality — split, 3. Sales roadmap / execution — **[In-depth]**, 4. Pricing — **[In-depth]** (dropped from Global — too context-dependent), 5. Prioritisation & reply time — **[Global]** (deterministic, already live), 6. Notes discipline — **[In-depth]** · ⚠️ DATA GAP, 7. Fan tiers (defines who matters, sharpens everything above), Chatter performance — evaluation blueprint (+1 more)

### Community 71 - "computeChatterMetrics.js"
Cohesion: 0.39
Nodes (6): computeChatterDailyMetrics(), computeDaySignals(), countWords(), pctile(), shiftDate(), { supabaseAdmin }

### Community 72 - "creators.js"
Cohesion: 0.50
Nodes (3): { requireMinRole }, router, { supabaseAdmin }

### Community 73 - "organisations.js"
Cohesion: 0.50
Nodes (3): { requireMinRole }, router, { supabaseAdmin }

### Community 74 - "shifts.js"
Cohesion: 0.50
Nodes (3): { requireMinRole }, router, { supabaseAdmin }

### Community 75 - "tasks.js"
Cohesion: 0.50
Nodes (3): { requireMinRole }, router, { supabaseAdmin }

## Knowledge Gaps
- **534 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+529 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `supabaseAdmin` connect `creatorStats.js` to `Report Parsers`, `Daily Check Engine`, `evaluateCreatorDay.js`, `Daily Check Page UI`, `computeChatterMetrics.js`, `creators.js`, `organisations.js`, `shifts.js`, `tasks.js`, `ESLint Config`, `Tasks Page UI`, `Chatter Profile UI`, `Creators Page UI`, `evaluateCreatorDay.js`, `App Shell & Routing`?**
  _High betweenness centrality (0.021) - this node is a cross-community bridge._
- **Why does `supabaseAdmin` connect `Auth Context & API Client` to `Metrics Computation`, `organisations.js`, `Custom Task Creation`, `Theme & Topbar`, `tasks.js`, `Server Dependencies`, `Vite Config`, `Review Task Generation`, `Server Entry & Routes`?**
  _High betweenness centrality (0.006) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `runDailyCheck()` (e.g. with `dailyCheck.js` and `stripForDb()`) actually correct?**
  _`runDailyCheck()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _536 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `AI Eval Runner` be split into smaller, more focused modules?**
  _Cohesion score 0.09852216748768473 - nodes in this community are weakly interconnected._
- **Should `Daily Check Engine` be split into smaller, more focused modules?**
  _Cohesion score 0.08292682926829269 - nodes in this community are weakly interconnected._
- **Should `Client Dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.05405405405405406 - nodes in this community are weakly interconnected._