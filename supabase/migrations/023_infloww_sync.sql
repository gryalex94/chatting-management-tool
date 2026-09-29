-- Data pulled from the Infloww API (read-only) by server/src/utils/inflowwSync.js.
-- Every table is locked like the rest (migration 019): only the server reads it.

-- Same as migration 022, repeated so running this one alone is enough.
create table if not exists public.fan_infloww_ids (
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  username        text not null,
  of_user_id      text not null check (of_user_id ~ '^[0-9]{1,30}$'),
  created_by      uuid references public.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  primary key (organisation_id, username)
);
alter table public.fan_infloww_ids enable row level security;
-- where an ID came from: a manager's pasted chat link, or matched from API sales
alter table public.fan_infloww_ids add column if not exists source text not null default 'chat_link';

-- Infloww employees, linked to our chatters by name where it's unambiguous.
create table if not exists public.infloww_employees (
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  employee_id     text not null,
  name            text,
  status          text,
  chatter_id      uuid references public.chatters(id) on delete set null,
  updated_at      timestamptz not null default now(),
  primary key (organisation_id, employee_id)
);
alter table public.infloww_employees enable row level security;

-- Every sale, with who it's credited to (Infloww "Sales records").
-- Amounts in dollars; created_at is true UTC.
create table if not exists public.infloww_sales (
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  id               text not null,                 -- Infloww sales-record id
  transaction_id   text,
  creator_id       uuid references public.creators(id) on delete set null,
  fan_id           text,                          -- the fan's OnlyFans id
  fan_name         text,
  created_at       timestamptz,
  type             text,                          -- Subscription, Messages, Tips, ...
  tip_source       text,
  status           text,                          -- loading, done, undo, pending_return
  amount           numeric(12,2),
  net              numeric(12,2),
  sales_rule       text,                          -- Message sender, Last chatter, ...
  employee_id      text,
  sales_amount     numeric(12,2),
  currency         text,
  synced_at        timestamptz not null default now(),
  primary key (organisation_id, id)
);
create index if not exists infloww_sales_fan on public.infloww_sales (organisation_id, fan_id);
create index if not exists infloww_sales_page_time on public.infloww_sales (organisation_id, creator_id, created_at);
alter table public.infloww_sales enable row level security;

-- Refunds / chargebacks, per transaction.
create table if not exists public.infloww_refunds (
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  id               text not null,
  transaction_id   text,
  creator_id       uuid references public.creators(id) on delete set null,
  fan_id           text,
  payment_time     timestamptz,
  refund_time      timestamptz,
  status           text,
  amount           numeric(12,2),
  type             text,
  currency         text,
  synced_at        timestamptz not null default now(),
  primary key (organisation_id, id)
);
create index if not exists infloww_refunds_page_time on public.infloww_refunds (organisation_id, creator_id, refund_time);
alter table public.infloww_refunds enable row level security;

-- One row per synced resource: when it last ran, how much it pulled, any error.
create table if not exists public.infloww_sync_state (
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  resource        text not null,
  last_run_at     timestamptz,
  last_ok_at      timestamptz,
  rows            integer,
  error           text,
  primary key (organisation_id, resource)
);
alter table public.infloww_sync_state enable row level security;

notify pgrst, 'reload schema';
