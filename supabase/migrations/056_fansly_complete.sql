-- Fansly: the rest of FANSLY_EXTENSION_PLAN.md.
--  - per-page settings: the owner's credit rules, and which AI profile writes the suggested replies
--  - mirrors of what Fansly shows: its own notes on a fan, the fan lists and their members,
--    subscriptions, followers, notifications, statistics snapshots
--  - phase 4: every suggested reply and what the chatter did with it
-- All read from what the Fansly page already loads; nothing is ever sent to Fansly.
-- Idempotent, so it is safe to re-run. Needs 051–055.

alter table public.fansly_accounts add column if not exists credit_rules jsonb not null default '{}'::jsonb;
-- no foreign key on purpose: a second key to creators would make every creators(...) embed of fansly_accounts ambiguous
alter table public.fansly_accounts add column if not exists ai_creator_id uuid;
alter table public.fansly_accounts drop constraint if exists fansly_accounts_ai_creator_id_fkey;
-- PPV money from mass messages, kept apart from chat PPVs in the reports (it is already inside ppv_net)
alter table public.fansly_daily add column if not exists mass_ppv_net numeric(12,2) not null default 0;

-- Fansly's own notes on a fan (Fansly → Notes), mirrored. Our notes stay in fansly_notes.
create table if not exists public.fansly_platform_notes (
  account_id        uuid not null references public.fansly_accounts(id) on delete cascade,
  note_id           text not null,
  fan_account_id    text,
  content_type      integer,                     -- 12000 note on an account, 12002 on a username
  title             text,
  note              text,
  created_at_fansly timestamptz,
  updated_at        timestamptz not null default now(),
  raw               jsonb,
  primary key (account_id, note_id)
);
create index if not exists fansly_platform_notes_fan on public.fansly_platform_notes (account_id, fan_account_id);
alter table public.fansly_platform_notes enable row level security;

create table if not exists public.fansly_lists (
  account_id   uuid not null references public.fansly_accounts(id) on delete cascade,
  list_id      text not null,
  label        text,
  type         integer,
  item_count   integer,
  updated_at   timestamptz not null default now(),
  raw          jsonb,
  primary key (account_id, list_id)
);
alter table public.fansly_lists enable row level security;

create table if not exists public.fansly_list_members (
  account_id      uuid not null references public.fansly_accounts(id) on delete cascade,
  list_id         text not null,
  fan_account_id  text not null,
  first_seen_at   timestamptz not null default now(),
  last_seen_at    timestamptz not null default now(),
  primary key (account_id, list_id, fan_account_id)
);
alter table public.fansly_list_members enable row level security;

create table if not exists public.fansly_subscriptions (
  account_id        uuid not null references public.fansly_accounts(id) on delete cascade,
  subscription_id   text not null,
  fan_account_id    text,
  tier_id           text,
  tier_name         text,
  status            integer,
  price             numeric(10,2),
  renew_price       numeric(10,2),
  auto_renew        boolean,
  billing_cycle     integer,
  created_at_fansly timestamptz,
  renew_at          timestamptz,
  ends_at           timestamptz,
  updated_at        timestamptz not null default now(),
  raw               jsonb,
  primary key (account_id, subscription_id)
);
create index if not exists fansly_subscriptions_fan on public.fansly_subscriptions (account_id, fan_account_id);
alter table public.fansly_subscriptions enable row level security;

create table if not exists public.fansly_followers (
  account_id      uuid not null references public.fansly_accounts(id) on delete cascade,
  fan_account_id  text not null,
  first_seen_at   timestamptz not null default now(),
  last_seen_at    timestamptz not null default now(),
  primary key (account_id, fan_account_id)
);
alter table public.fansly_followers enable row level security;

create table if not exists public.fansly_notifications (
  account_id           uuid not null references public.fansly_accounts(id) on delete cascade,
  notification_id      text not null,
  type                 integer,
  correlation_id       text,
  correlation_group_id text,
  created_at_fansly    timestamptz,
  metadata             jsonb,
  raw                  jsonb,
  primary key (account_id, notification_id)
);
create index if not exists fansly_notifications_time on public.fansly_notifications (account_id, created_at_fansly desc);
alter table public.fansly_notifications enable row level security;

-- what the Statistics page showed (summary, top fans), kept as it was read
create table if not exists public.fansly_stats_snapshots (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null references public.fansly_accounts(id) on delete cascade,
  kind         text not null,                    -- summary · top_fans · fan
  after_at     timestamptz,
  before_at    timestamptz,
  data         jsonb not null,
  captured_at  timestamptz not null default now()
);
create index if not exists fansly_stats_snapshots_acc on public.fansly_stats_snapshots (account_id, kind, captured_at desc);
alter table public.fansly_stats_snapshots enable row level security;

-- phase 4: each suggested reply, and what the chatter did with it
create table if not exists public.fansly_ai_drafts (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  account_id      uuid not null references public.fansly_accounts(id) on delete cascade,
  fan_account_id  text not null,
  user_id         uuid references public.users(id) on delete set null,
  chatter_id      uuid references public.chatters(id) on delete set null,
  his             text,                          -- what he had written
  draft           text,                          -- the suggestion as shown
  model           text,
  goal            text,
  session         jsonb,                         -- the engine's plan for this conversation, carried to the next suggestion
  cost_usd        numeric(10,6),
  status          text not null default 'shown' check (status in ('shown', 'inserted', 'sent_as_is', 'edited', 'discarded', 'failed')),
  final_text      text,                          -- what was really sent, when it was
  similarity      numeric(4,3),
  created_at      timestamptz not null default now(),
  decided_at      timestamptz
);
create index if not exists fansly_ai_drafts_fan on public.fansly_ai_drafts (account_id, fan_account_id, created_at desc);
create index if not exists fansly_ai_drafts_org on public.fansly_ai_drafts (organisation_id, created_at desc);
alter table public.fansly_ai_drafts enable row level security;

notify pgrst, 'reload schema';
