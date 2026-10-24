-- "Earnings" reads the recent sales (stops past 45 days); "Earnings, everything" reads the whole wallet history.
-- Idempotent, so it is safe to re-run. Needs 062.
alter table public.fansly_fetch_jobs drop constraint if exists fansly_fetch_jobs_kind_check;
alter table public.fansly_fetch_jobs add constraint fansly_fetch_jobs_kind_check check (kind in ('ledger', 'ledger_all', 'subscribers', 'statistics'));
notify pgrst, 'reload schema';
