-- Fansly: "Read from Fansly" requests, exact amounts, and how much of the sales ledger is read.
--  - fansly_fetch_jobs: an owner or manager asks a browser on that page to open Fansly's Earnings,
--    Subscribers or Statistics page and scroll its list to the end (Fansly's own app loads
--    everything; the extension records it as always). The chatter in that browser starts it.
--  - amounts kept to a tenth of a cent, as Fansly pays them ($6.392 net of a $7.99 sub), so
--    sums match Fansly's to the cent; backfilled from the raw ledger rows.
--  - ledger_total: how many sales Fansly says its Earnings list has (for "121 of 755 read").
-- Idempotent, so it is safe to re-run. Needs 051–061.

create table if not exists public.fansly_fetch_jobs (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  account_id       uuid not null references public.fansly_accounts(id) on delete cascade,
  kind             text not null check (kind in ('ledger', 'subscribers', 'statistics')),
  status           text not null default 'pending' check (status in ('pending', 'running', 'done', 'failed', 'cancelled')),
  requested_by     uuid references public.users(id) on delete set null,
  requested_at     timestamptz not null default now(),
  started_by       uuid references public.users(id) on delete set null,
  device_id        text,
  started_at       timestamptz,
  finished_at      timestamptz,
  progress         jsonb not null default '{}'::jsonb,     -- { rows, total, pages, note }
  error            text
);
create index if not exists fansly_fetch_jobs_acc on public.fansly_fetch_jobs (account_id, requested_at desc);
alter table public.fansly_fetch_jobs enable row level security;

alter table public.fansly_accounts add column if not exists ledger_total integer;
alter table public.fansly_accounts add column if not exists ledger_total_at timestamptz;

alter table public.fansly_transactions alter column gross type numeric(12,3);
alter table public.fansly_transactions alter column net type numeric(12,3);
alter table public.fansly_messages alter column sold_net type numeric(12,3);

-- the ledger rows' exact amounts, from what Fansly sent (thousandths of a dollar)
update public.fansly_transactions
   set net = (raw->>'amount')::numeric / 1000,
       gross = case when coalesce((raw->>'destinationTax')::numeric, 0) > 0
                    then round(((raw->>'amount')::numeric / 1000) / (1 - (raw->>'destinationTax')::numeric / 10000), 3)
                    else (raw->>'amount')::numeric / 1000 end
 where source = 'ledger' and raw ? 'amount';

notify pgrst, 'reload schema';
