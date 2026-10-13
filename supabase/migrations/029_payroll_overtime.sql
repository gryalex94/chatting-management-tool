-- Payroll overtime: hours beyond a chatter's main shift of the day (staying on into
-- the next shift, coming in early, a second shift) are counted apart and can be paid
-- at their own rate. Empty overtime rate = the team's, else the hourly rate. The
-- team's rates live in daily_check_config (payroll_hourly_rate,
-- payroll_commission_pct, payroll_overtime_rate).
-- Idempotent, so it is safe to re-run.
alter table public.chatters add column if not exists overtime_rate numeric(8,2);

alter table public.payroll_reports add column if not exists overtime_hours_auto numeric(6,2) not null default 0;  -- from the chat history
alter table public.payroll_reports add column if not exists overtime_hours numeric(6,2);                           -- set by the manager; empty = overtime_hours_auto
alter table public.payroll_reports add column if not exists overtime_rate numeric(8,2);                            -- empty = paid at the hourly rate
