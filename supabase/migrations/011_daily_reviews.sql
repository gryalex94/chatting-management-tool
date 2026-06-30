-- 011_daily_reviews.sql
-- The AI "working-day review" narrative shown on Home, produced when the task
-- queue is rebuilt. One row per org per day.

create table if not exists daily_reviews (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  report_date date not null,
  summary text,
  day_review text,
  created_at timestamptz not null default now(),
  unique (organisation_id, report_date)
);
