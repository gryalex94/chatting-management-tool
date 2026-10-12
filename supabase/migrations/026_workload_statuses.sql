-- Workload statuses (computeChatterMetrics, recalibrated 2026-10-12): adds 'slow'
-- (slow replies on a normal day) and 'underperforming' (slow on a quiet day) to
-- the statuses a chatter-day can have. Until this runs, the app stores the
-- nearest old status instead (slow → overloaded, underperforming → light).
-- Idempotent, so it is safe to re-run.
alter table public.chatter_daily_metrics drop constraint if exists chatter_daily_metrics_workload_status_check;
alter table public.chatter_daily_metrics add constraint chatter_daily_metrics_workload_status_check
  check (workload_status in ('overloaded', 'healthy', 'light', 'afk', 'slow', 'underperforming'));
