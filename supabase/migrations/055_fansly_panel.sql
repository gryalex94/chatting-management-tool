-- Fansly, phase 3: the side panel's scripts library and the AI summary per fan.
-- Scripts are written by managers in the tool and clicked by chatters in the
-- extension's panel (the text lands in Fansly's message box; the chatter sends).
-- Nothing here is ever sent to Fansly. Idempotent, so it is safe to re-run. Needs 051.

create table if not exists public.fansly_scripts (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  account_id       uuid references public.fansly_accounts(id) on delete cascade,   -- null: every Fansly page
  stage            text not null default 'other' check (stage in ('opener', 'warmup', 'sexting', 'ppv_pitch', 'after_no', 'reengage', 'custom', 'aftercare', 'other')),
  title            text not null check (length(title) between 1 and 120),
  text             text not null check (length(text) between 1 and 4000),
  position         integer not null default 0,
  active           boolean not null default true,
  item_ids         text[],                                                          -- later: vault items that go with it
  created_by       uuid references public.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists fansly_scripts_org on public.fansly_scripts (organisation_id, stage, position);
alter table public.fansly_scripts enable row level security;

-- every click on a script in the panel; "did the PPV after it sell" is worked out on read
create table if not exists public.fansly_script_uses (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  script_id        uuid not null references public.fansly_scripts(id) on delete cascade,
  account_id       uuid references public.fansly_accounts(id) on delete cascade,
  fan_account_id   text,
  user_id          uuid references public.users(id) on delete set null,
  chatter_id       uuid references public.chatters(id) on delete set null,
  used_at          timestamptz not null default now()
);
create index if not exists fansly_script_uses_script on public.fansly_script_uses (script_id, used_at desc);
alter table public.fansly_script_uses enable row level security;

-- the AI's read of a fan, rebuilt when his chat has moved on
create table if not exists public.fansly_fan_summaries (
  account_id       uuid not null references public.fansly_accounts(id) on delete cascade,
  fan_account_id   text not null,
  summary          jsonb not null,                  -- { likes, bought, refused, promises, next_step, suggested_note }
  last_message_id  text,
  last_message_at  timestamptz,
  messages_used    integer,
  model            text,
  built_at         timestamptz not null default now(),
  primary key (account_id, fan_account_id)
);
alter table public.fansly_fan_summaries enable row level security;

notify pgrst, 'reload schema';
