-- Fansly, phase 1: the tables the browser extension fills (FANSLY_EXTENSION_PLAN.md).
-- The extension sits inside the logged-in Fansly page, copies what the page loads
-- or receives live, and posts it to POST /api/fansly/ingest with the chatter's
-- session token. Nothing is ever written to Fansly.
-- Money arrives from Fansly in thousandths of a dollar (29990 = $29.99); it is
-- stored here in dollars. The raw object is kept beside the parsed fields.
-- Idempotent, so it is safe to re-run.

-- One row per Fansly creator account the extension has seen. Each account belongs
-- to a page (creators, platform = fansly), made on first sight when missing.
create table if not exists public.fansly_accounts (
  id                 uuid primary key default gen_random_uuid(),
  organisation_id    uuid not null references public.organisations(id) on delete cascade,
  creator_id         uuid references public.creators(id) on delete set null,
  fansly_account_id  text not null,                 -- the creator's Fansly account id
  username           text,
  display_name       text,
  followers_count    integer,
  subscribers_count  integer,
  status             text not null default 'active' check (status in ('active', 'paused')),
  first_seen_at      timestamptz not null default now(),
  last_seen_at       timestamptz,
  raw                jsonb,
  unique (organisation_id, fansly_account_id)
);
alter table public.fansly_accounts enable row level security;

-- Who was logged into the extension on which browser, watching which account, from
-- when to when. The ground truth for "who was on shift" and "who is online now".
-- One open row per device; it closes when the heartbeat stops or the person logs out.
create table if not exists public.fansly_presence (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  account_id       uuid references public.fansly_accounts(id) on delete cascade,
  user_id          uuid not null references public.users(id) on delete cascade,
  chatter_id       uuid references public.chatters(id) on delete set null,
  device_id        text not null,                   -- the extension install (one per browser profile)
  started_at       timestamptz not null default now(),
  last_seen_at     timestamptz not null default now(),
  ended_at         timestamptz,
  ended_reason     text,                            -- logout · timeout · switched
  extension_version text
);
create index if not exists fansly_presence_open on public.fansly_presence (account_id, last_seen_at desc) where ended_at is null;
create index if not exists fansly_presence_user on public.fansly_presence (user_id, started_at desc);
alter table public.fansly_presence enable row level security;

-- Every fan the page has shown: profile, nickname, subscription, last activity.
create table if not exists public.fansly_fans (
  account_id             uuid not null references public.fansly_accounts(id) on delete cascade,
  fansly_account_id      text not null,             -- the fan's account id
  group_id               text,                      -- the chat thread with this fan
  username               text,
  display_name           text,
  nickname               text,                      -- the name a chatter gave him (userSettings.customName)
  joined_fansly_at       timestamptz,
  last_seen_at           timestamptz,
  follows_you            boolean,
  subscription_tier_id   text,
  subscription_tier_name text,
  subscription_status    integer,
  subscribed_until       timestamptz,
  unread_count           integer,
  last_message_id        text,
  last_message_at        timestamptz,
  first_seen_at          timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  raw                    jsonb,
  primary key (account_id, fansly_account_id)
);
create index if not exists fansly_fans_group on public.fansly_fans (account_id, group_id);
create index if not exists fansly_fans_activity on public.fansly_fans (account_id, last_message_at desc);
alter table public.fansly_fans enable row level security;

-- Every message the page loaded or received live. `attribution` says how the
-- sender was known: logged_in (this browser sent it while a chatter was logged in),
-- unattributed (sent from a browser with nobody logged in), history (loaded from
-- the past; the sender is unknown), fan (he wrote it).
create table if not exists public.fansly_messages (
  account_id       uuid not null references public.fansly_accounts(id) on delete cascade,
  message_id       text not null,
  group_id         text,
  fan_account_id   text,
  from_fan         boolean not null default false,
  type             smallint,                        -- 1 chat · 2 mass message · 0 tip
  text             text,
  sent_at          timestamptz,
  delivered_at     timestamptz,
  read_at          timestamptz,
  reply_to         text,
  attachments      jsonb,                           -- [{content_type, content_id, price}]
  price            numeric(10,2),                   -- the PPV price on this message, if any
  tip_amount       numeric(10,2),
  user_id          uuid references public.users(id) on delete set null,
  chatter_id       uuid references public.chatters(id) on delete set null,
  shift_id         uuid references public.shifts(id) on delete set null,
  attribution      text check (attribution in ('logged_in', 'unattributed', 'history', 'fan')),
  device_id        text,
  source           text,                            -- sent · live · page · history
  first_seen_at    timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  raw              jsonb,
  primary key (account_id, message_id)
);
create index if not exists fansly_messages_time on public.fansly_messages (account_id, sent_at desc);
create index if not exists fansly_messages_fan on public.fansly_messages (account_id, fan_account_id, sent_at desc);
create index if not exists fansly_messages_chatter on public.fansly_messages (chatter_id, sent_at desc);
alter table public.fansly_messages enable row level security;

-- The media and bundles that were attached to messages (PPVs and free sends).
create table if not exists public.fansly_items (
  account_id         uuid not null references public.fansly_accounts(id) on delete cascade,
  item_id            text not null,                 -- accountMedia id or accountMediaBundle id
  kind               text not null check (kind in ('media', 'bundle')),
  price              numeric(10,2),
  media_type         smallint,                      -- 1 image · 2 video
  mimetype           text,
  duration_s         numeric(10,1),
  media_count        integer,
  for_fan_account_id text,                          -- the fan it was priced for (whitelist), when known
  lifetime_sales     integer,
  lifetime_net       numeric(12,2),
  created_at_fansly  timestamptz,
  updated_at         timestamptz not null default now(),
  raw                jsonb,
  primary key (account_id, item_id)
);
alter table public.fansly_items enable row level security;

-- Sales: the live purchase event now, the earnings ledger in phase 2. `category`
-- decides whose salary it counts for: chat_ppv and chat_tip are credited to a
-- chatter; wall, subscription and other never are.
create table if not exists public.fansly_transactions (
  account_id           uuid not null references public.fansly_accounts(id) on delete cascade,
  transaction_id       text not null,
  type                 integer,
  type_label           text,
  fan_account_id       text,
  item_id              text,
  message_id           text,
  gross                numeric(10,2),
  net                  numeric(10,2),
  status               integer,
  created_at_fansly    timestamptz,
  category             text check (category in ('chat_ppv', 'chat_tip', 'wall', 'subscription', 'refund', 'other')),
  credited_chatter_id  uuid references public.chatters(id) on delete set null,
  credited_message_id  text,
  credited_rule        text,
  source               text,                        -- live · ledger
  updated_at           timestamptz not null default now(),
  raw                  jsonb,
  primary key (account_id, transaction_id)
);
create index if not exists fansly_transactions_time on public.fansly_transactions (account_id, created_at_fansly desc);
create index if not exists fansly_transactions_chatter on public.fansly_transactions (credited_chatter_id, created_at_fansly desc);
alter table public.fansly_transactions enable row level security;

-- Every batch the extension sent: who, from which browser, what it held, what failed.
create table if not exists public.fansly_ingest_log (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  account_id       uuid references public.fansly_accounts(id) on delete set null,
  user_id          uuid references public.users(id) on delete set null,
  device_id        text,
  received_at      timestamptz not null default now(),
  events           integer,
  counts           jsonb,
  errors           text
);
create index if not exists fansly_ingest_log_time on public.fansly_ingest_log (organisation_id, received_at desc);
alter table public.fansly_ingest_log enable row level security;

-- Let the API see the change straight away.
notify pgrst, 'reload schema';
