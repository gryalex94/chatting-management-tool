-- 007_chatter_evaluations.sql
-- Stores AI evaluation results so they can be shown instantly (no re-run / re-cost)
-- and synthesised later by an overall report. One current row per
-- (chatter, day, eval_type); re-running overwrites that slot.

create table if not exists chatter_evaluations (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  chatter_id uuid not null,
  report_date date not null,
  eval_type text not null,            -- 'compliance' | 'sales_quality' | 'overall'
  model text,                         -- e.g. 'claude-sonnet-4-6'
  prompt_version text,                -- e.g. 'A'
  payload jsonb not null,             -- the evaluation result (overall + issues, scores, ...)
  input_tokens int,
  output_tokens int,
  created_at timestamptz not null default now(),
  unique (organisation_id, chatter_id, report_date, eval_type)
);

create index if not exists chatter_evaluations_lookup
  on chatter_evaluations (organisation_id, chatter_id, report_date);
