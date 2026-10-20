-- Teaching the AI chat from Practice (utils/aiChat.js):
--  - ai_feedback: a manager marks a step of a reply's decision map as wrong: a
--    wrong call (a decision: the plan, the story, who he is) or bad wording (her
--    words), with what was wrong and, optionally, what she should have done or
--    said. Wording marks become "don't do this" examples for the writer in
--    similar moments; every mark becomes a point Claude checks for; repeating
--    patterns become rules later.
--  - ai_checks: Claude's watch-only check of each Practice reply (does she answer
--    him, does it fit the moment, are his notes used right, is the selling call
--    right), kept for a daily score and the most common mistakes.
-- Idempotent, so it is safe to re-run.

create table if not exists public.ai_feedback (
  id              bigint generated always as identity primary key,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  creator_id      uuid not null references public.creators(id) on delete cascade,
  created_by      text,                                  -- the manager who marked it
  kind            text not null check (kind in ('decision', 'wording')),
  step            text,                                  -- the map step: plan, story, him, draft1, result…
  note            text not null,                         -- what was wrong, in the manager's words
  better          text,                                  -- what she should have done or said (optional)
  his             text,                                  -- his latest message(s)
  her             text[] not null default '{}',          -- her reply as it was shown
  goal            text,                                  -- the plan's goal then
  context         jsonb not null default '{}'::jsonb,    -- a snapshot: tier, mood, level, the step's result…
  active          boolean not null default true,         -- used for teaching
  created_at      timestamptz not null default now()
);
create index if not exists ai_feedback_page on public.ai_feedback (organisation_id, creator_id, created_at desc);
alter table public.ai_feedback enable row level security;

create table if not exists public.ai_checks (
  id              bigint generated always as identity primary key,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  creator_id      uuid not null references public.creators(id) on delete cascade,
  writer          text,                                  -- which writer wrote the reply
  overall         text,                                  -- good / okay / weak / declined
  points          jsonb not null default '{}'::jsonb,    -- { answers_him, fits_moment, notes_facts, selling }: { ok, note }
  his             text,
  her             text[] not null default '{}',
  goal            text,
  cost_usd        numeric(12, 6),
  created_at      timestamptz not null default now()
);
create index if not exists ai_checks_page on public.ai_checks (organisation_id, creator_id, created_at desc);
alter table public.ai_checks enable row level security;

-- Let the API see the change straight away.
notify pgrst, 'reload schema';
