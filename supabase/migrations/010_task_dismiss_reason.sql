-- 010_task_dismiss_reason.sql
-- Capture WHY a manager dismissed a task — a category (for clean analysis) plus
-- an optional free-text note. This calibration signal is kept and later used to
-- improve the AI search / task-generation prompts.

alter table review_tasks add column if not exists dismiss_reason_code text;  -- allowed | needs_context | misread | too_minor | fan_fault | other
alter table review_tasks add column if not exists dismiss_reason text;       -- optional free-text note
