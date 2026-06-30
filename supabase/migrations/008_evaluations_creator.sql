-- 008_evaluations_creator.sql
-- Let the evaluations table also hold page-level (creator) analyses.
-- A row is keyed by chatter_id (chatter analyses) OR creator_id (page analyses).

alter table chatter_evaluations add column if not exists creator_id uuid;
alter table chatter_evaluations alter column chatter_id drop not null;

create index if not exists chatter_evaluations_creator_lookup
  on chatter_evaluations (organisation_id, creator_id, report_date);
