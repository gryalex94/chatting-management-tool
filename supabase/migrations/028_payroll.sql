-- Payroll: the report each chatter gets every second Monday (periods of two
-- weeks from Mon 28 Sep 2026, Amsterdam time). Hours come from the chat history
-- (shifts worked), sales from Infloww; the manager adds additions, deductions and
-- notes, then marks the report final (its numbers no longer change).
-- Idempotent, so it is safe to re-run.

-- Each chatter's pay: hourly rate and commission (% of net sales). Empty = the
-- defaults ($2/h, 5%). Made numeric whatever they were before (all empty).
alter table public.chatters add column if not exists hourly_rate numeric(8,2);
alter table public.chatters add column if not exists commission_pct numeric(5,2);
alter table public.chatters alter column hourly_rate type numeric(8,2) using hourly_rate::numeric;
alter table public.chatters alter column commission_pct type numeric(5,2) using commission_pct::numeric;

-- One period's calculation: when it ran and what to look out for.
create table if not exists public.payroll_periods (
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  period_start    date not null,
  period_end      date not null,
  warnings        jsonb not null default '[]'::jsonb,
  calculated_at   timestamptz,
  calculated_by   uuid references public.users(id) on delete set null,
  primary key (organisation_id, period_start)
);
alter table public.payroll_periods enable row level security;

-- One chatter's report for one period. Money shown on the report (net sales,
-- commission, hourly pay, total) is worked out from these, never stored twice.
create table if not exists public.payroll_reports (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  chatter_id      uuid not null references public.chatters(id) on delete cascade,
  period_start    date not null,
  period_end      date not null,
  status          text not null default 'draft' check (status in ('draft', 'final')),
  hours_auto      numeric(6,2) not null default 0,       -- from the chat history
  hours           numeric(6,2),                          -- set by the manager; empty = hours_auto
  hourly_rate     numeric(8,2) not null default 0,
  commission_pct  numeric(5,2) not null default 0,
  of_cut_pct      numeric(5,2) not null default 20,      -- OnlyFans' share: net = gross minus this
  sales_gross     numeric(12,2) not null default 0,      -- as Infloww shows it, refunds included
  refunded        numeric(12,2) not null default 0,      -- the part of sales_gross later refunded
  additions       numeric(12,2) not null default 0,
  deductions      numeric(12,2) not null default 0,
  notes           text,
  details         jsonb not null default '{}'::jsonb,    -- sales per page, shifts worked, flags
  calculated_at   timestamptz,
  finalized_at    timestamptz,
  created_by      uuid references public.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organisation_id, period_start, chatter_id)
);
create index if not exists payroll_reports_period on public.payroll_reports (organisation_id, period_start);
alter table public.payroll_reports enable row level security;
