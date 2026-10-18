-- Fanvue: a creator account connected through Fanvue's API (the creator approves
-- access once), with its chats, messages and earnings copied in. First use: see
-- how many messages the chatting team handles; next: remember each fan and
-- suggest (or send) replies. The access tokens are stored encrypted by the server
-- (server/src/integrations/fanvue.js), and only the server reads these tables.
-- Idempotent, so it is safe to re-run.

-- One connected Fanvue creator account.
create table if not exists public.fanvue_accounts (
  id                uuid primary key default gen_random_uuid(),
  organisation_id   uuid not null references public.organisations(id) on delete cascade,
  fanvue_uuid       text not null,                  -- the creator's Fanvue user id
  handle            text,
  display_name      text,
  is_ai_creator     boolean,
  subscribers_count integer,
  followers_count   integer,
  scopes            text,                           -- what the creator granted
  tokens            text,                           -- encrypted access + refresh token
  token_expires_at  timestamptz,
  status            text not null default 'connected' check (status in ('connected', 'reconnect', 'disconnected')),
  connected_by      uuid references public.users(id) on delete set null,
  connected_at      timestamptz not null default now(),
  synced_at         timestamptz,                    -- when the last sync finished
  sync_error        text,
  unique (organisation_id, fanvue_uuid)
);
alter table public.fanvue_accounts enable row level security;

-- A "Connect Fanvue" click waiting for the creator to approve (kept 15 minutes).
create table if not exists public.fanvue_oauth_states (
  state             text primary key,
  organisation_id   uuid not null references public.organisations(id) on delete cascade,
  user_id           uuid not null references public.users(id) on delete cascade,
  code_verifier     text not null,
  redirect_uri      text not null,
  created_at        timestamptz not null default now()
);
alter table public.fanvue_oauth_states enable row level security;

-- Everyone the creator chats with.
create table if not exists public.fanvue_fans (
  account_id        uuid not null references public.fanvue_accounts(id) on delete cascade,
  fan_uuid          text not null,
  handle            text,
  display_name      text,
  nickname          text,
  is_top_spender    boolean,
  registered_at     timestamptz,
  last_message_at   timestamptz,
  history_done      boolean not null default false, -- the whole chat has been copied
  messages_through  timestamptz,                    -- copied up to this last-message time
  updated_at        timestamptz not null default now(),
  primary key (account_id, fan_uuid)
);
alter table public.fanvue_fans enable row level security;

-- Every message in those chats, both ways.
create table if not exists public.fanvue_messages (
  account_id        uuid not null references public.fanvue_accounts(id) on delete cascade,
  uuid              text not null,
  fan_uuid          text not null,
  from_fan          boolean not null,
  sent_by_user_id   text,                           -- the team member who sent it for the creator
  app_uuid          text,                           -- sent by an app through the API
  type              text,                           -- SINGLE_RECIPIENT, AUTOMATED_…, BROADCAST, TIP…
  status            text,
  text              text,
  sent_at           timestamptz,
  raw               jsonb,                          -- the rest of what Fanvue sent (media, price…)
  primary key (account_id, uuid)
);
create index if not exists fanvue_messages_time on public.fanvue_messages (account_id, sent_at);
create index if not exists fanvue_messages_fan on public.fanvue_messages (account_id, fan_uuid, sent_at desc);
alter table public.fanvue_messages enable row level security;

-- Every payment (subscription, renewal, PPV, tip…) and every refund or chargeback.
create table if not exists public.fanvue_earnings (
  account_id           uuid not null references public.fanvue_accounts(id) on delete cascade,
  transaction_order_id text not null,
  source               text not null,
  fan_uuid             text,
  paid_at              timestamptz not null,
  gross_cents          integer,
  net_cents            integer,
  message_uuid         text,                        -- the PPV or tip message it paid for
  status               text,
  primary key (account_id, transaction_order_id, source)
);
create index if not exists fanvue_earnings_time on public.fanvue_earnings (account_id, paid_at);
alter table public.fanvue_earnings enable row level security;

-- Messages per day (Amsterdam days): what fans wrote, what the team sent by hand,
-- and what went out by itself (automated and mass messages).
create or replace function public.fanvue_daily_messages(p_account uuid, p_since timestamptz)
returns table (day date, fan_messages bigint, team_messages bigint, auto_messages bigint, chats bigint, fans_writing bigint)
language sql stable as $$
  select (sent_at at time zone 'Europe/Amsterdam')::date as day,
         count(*) filter (where from_fan),
         count(*) filter (where not from_fan and coalesce(type, '') not in ('BROADCAST', 'GHOST_PROMOTION', 'MARKETING_KYC', 'LOCKED_MESSAGE_UNLOCKED', 'TIP')
                          and coalesce(type, '') not like 'AUTOMATED%'),
         count(*) filter (where not from_fan and (type like 'AUTOMATED%' or type in ('BROADCAST', 'GHOST_PROMOTION', 'MARKETING_KYC'))),
         count(distinct fan_uuid),
         count(distinct fan_uuid) filter (where from_fan)
  from public.fanvue_messages
  where account_id = p_account and sent_at >= p_since
  group by 1
  order by 1;
$$;

-- Earnings per day (Amsterdam days), after Fanvue's fee; refunds count against.
create or replace function public.fanvue_daily_earnings(p_account uuid, p_since timestamptz)
returns table (day date, net_cents bigint, message_cents bigint, tip_cents bigint, subscription_cents bigint)
language sql stable as $$
  select (paid_at at time zone 'Europe/Amsterdam')::date,
         coalesce(sum(net_cents), 0),
         coalesce(sum(net_cents) filter (where source = 'message'), 0),
         coalesce(sum(net_cents) filter (where source = 'tip'), 0),
         coalesce(sum(net_cents) filter (where source in ('subscription', 'renewal')), 0)
  from public.fanvue_earnings
  where account_id = p_account and paid_at >= p_since
  group by 1
  order by 1;
$$;

revoke all on function public.fanvue_daily_messages(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.fanvue_daily_earnings(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.fanvue_daily_messages(uuid, timestamptz) to service_role;
grant execute on function public.fanvue_daily_earnings(uuid, timestamptz) to service_role;

-- Let the API see the new tables and functions straight away.
notify pgrst, 'reload schema';
