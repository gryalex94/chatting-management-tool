-- 009_review_tasks.sql
-- The AI task queue: one row per actionable item, derived from AI report issues
-- and engine flags, prioritised by the AI Task Manager. Global for now (no owner);
-- owner_id is reserved for later per-page manager assignment.

create table if not exists review_tasks (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  fingerprint text not null,              -- stable signature of the underlying issue
  source_type text not null,              -- 'compliance' | 'sales' | 'creator' | 'flag'
  source_ref jsonb,                       -- pointer back to the report/flag

  creator_id uuid,
  creator_name text,
  chatter_id uuid,
  chatter_name text,
  fan_username text,

  area text,
  severity text,                          -- critical | high | medium | low
  title text,
  detail text,
  context jsonb,                          -- { message, sent_at, matched_who, mentions, metrics }

  status text not null default 'open',    -- open | taken | completed | dismissed
  priority int,                           -- 1-7, set by the AI Task Manager
  priority_reason text,
  cluster_key text,                       -- groups related tasks (page/chatter/fan)

  first_seen_date date not null,
  last_seen_date date not null,
  days_open int not null default 1,
  carried_over boolean not null default false,
  regressed boolean not null default false,

  owner_id uuid,                          -- reserved for later per-page assignment
  taken_by uuid,
  taken_at timestamptz,
  completed_at timestamptz,
  resolved_by uuid,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (organisation_id, fingerprint)
);

create index if not exists review_tasks_org_status on review_tasks (organisation_id, status);
create index if not exists review_tasks_org_lastseen on review_tasks (organisation_id, last_seen_date);
