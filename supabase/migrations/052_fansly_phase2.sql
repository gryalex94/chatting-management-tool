-- Fansly, phase 2: history backfill, the sales ledger and the daily summary.
-- Idempotent, so it is safe to re-run. Needs 051.

-- Where the extension's backfill stands for this account (threads done, ledger pages…).
alter table public.fansly_accounts add column if not exists backfill jsonb;

-- A PPV message is marked sold the moment a sale is matched to it.
alter table public.fansly_messages add column if not exists sold_at timestamptz;
alter table public.fansly_messages add column if not exists sold_net numeric(10,2);

-- One line per account, day (Amsterdam) and chatter: what reports and payroll read.
-- chatter_key is the chatter id, or 'none' for messages nobody is credited with.
create table if not exists public.fansly_daily (
  account_id       uuid not null references public.fansly_accounts(id) on delete cascade,
  day              date not null,
  chatter_key      text not null,
  chatter_id       uuid references public.chatters(id) on delete set null,
  sent             integer not null default 0,     -- personal messages sent
  mass_sent        integer not null default 0,     -- mass messages sent
  fans             integer not null default 0,     -- distinct fans written to
  ppv_sent         integer not null default 0,
  ppv_sold         integer not null default 0,     -- of the PPVs sent that day, how many sold (so far)
  ppv_net          numeric(12,2) not null default 0,
  tips_net         numeric(12,2) not null default 0,
  refunds_net      numeric(12,2) not null default 0,
  unattributed     integer not null default 0,     -- creator-side messages with no known sender
  median_reply_s   integer,                        -- median seconds from his message to the next reply
  updated_at       timestamptz not null default now(),
  primary key (account_id, day, chatter_key)
);
create index if not exists fansly_daily_day on public.fansly_daily (account_id, day desc);
alter table public.fansly_daily enable row level security;

notify pgrst, 'reload schema';
