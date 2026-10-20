-- Requests from fans the AI can't decide alone (AI chat, D1, D8, D9 in
-- AI_CHAT_UPGRADE_QUESTIONS.md): a specific service that isn't in her menu (the
-- conversation waits for a manager's yes or no, with terms), and visual content
-- she doesn't have (noted as missing content). Idempotent.

create table if not exists public.ai_requests (
  id              bigint generated always as identity primary key,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  creator_id      uuid not null references public.creators(id) on delete cascade,
  fan_uuid        text,                                  -- null for a made-up fan
  source          text not null default 'practice',      -- practice | live
  kind            text not null,                         -- service | content
  text            text not null,                         -- what he asked for, in his words
  status          text not null default 'pending',       -- pending | approved | refused | noted
  terms           text,                                  -- the manager's terms (price, what exactly) or reason
  created_at      timestamptz not null default now(),
  decided_at      timestamptz
);
create index if not exists ai_requests_page on public.ai_requests (organisation_id, creator_id, status, created_at desc);
alter table public.ai_requests enable row level security;

notify pgrst, 'reload schema';
