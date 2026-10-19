-- AI chat for the Fanvue AI creator (utils/aiChat.js): the profile the AI writes
-- as, what it remembers about each fan, and what every AI call cost. Nothing here
-- sends anything to Fanvue: replies are only shown in the tool.
-- Idempotent, so it is safe to re-run.

-- The creator's character, one per page: who she is, how she writes, what she has
-- told fans about herself; plus which AI model writes for her.
create table if not exists public.ai_personas (
  creator_id      uuid primary key references public.creators(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  profile         jsonb not null default '{}'::jsonb,
  settings        jsonb not null default '{}'::jsonb,
  drafted_at      timestamptz,
  updated_by      uuid references public.users(id) on delete set null,
  updated_at      timestamptz not null default now()
);
alter table public.ai_personas enable row level security;

-- What she remembers about each fan: short facts ([{ id, kind, text, locked }]) and
-- the story so far, built from the chat up to `covered_through`. Money facts are
-- not kept here: they're read from Fanvue's own numbers each time.
create table if not exists public.ai_fan_memory (
  account_id      uuid not null references public.fanvue_accounts(id) on delete cascade,
  fan_uuid        text not null,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  facts           jsonb not null default '[]'::jsonb,
  story           text,
  covered_through timestamptz,
  messages_read   integer not null default 0,
  built_at        timestamptz,
  edited_at       timestamptz,
  updated_at      timestamptz not null default now(),
  primary key (account_id, fan_uuid)
);
alter table public.ai_fan_memory enable row level security;

-- Every AI call: what it was for, which model, and what it cost.
create table if not exists public.ai_usage (
  id              bigint generated always as identity primary key,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  kind            text not null,
  model           text not null,
  input_tokens    integer,
  output_tokens   integer,
  cost_usd        numeric(10,6),
  creator_id      uuid references public.creators(id) on delete set null,
  fan_uuid        text,
  created_at      timestamptz not null default now()
);
create index if not exists ai_usage_org_time on public.ai_usage (organisation_id, created_at desc);
alter table public.ai_usage enable row level security;

-- The fans who ever wrote to an account, with how much each side wrote (mass and
-- automatic messages left out) and when.
create or replace function public.ai_chat_fans(p_account uuid)
returns table (fan_uuid text, fan_messages bigint, her_messages bigint, last_fan_at timestamptz, last_at timestamptz)
language sql stable as $$
  select fan_uuid,
         count(*) filter (where from_fan),
         count(*) filter (where not from_fan),
         max(sent_at) filter (where from_fan),
         max(sent_at)
  from public.fanvue_messages
  where account_id = p_account
    and (from_fan or not (coalesce(type, '') like 'AUTOMATED%' or coalesce(type, '') in ('BROADCAST', 'GHOST_PROMOTION', 'MARKETING_KYC')))
  group by fan_uuid
  having count(*) filter (where from_fan) > 0;
$$;
revoke all on function public.ai_chat_fans(uuid) from public, anon, authenticated;
grant execute on function public.ai_chat_fans(uuid) to service_role;

-- Let the API see the change straight away.
notify pgrst, 'reload schema';
