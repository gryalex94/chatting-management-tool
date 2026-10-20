-- What a fan's photo or video showed (AI chat, C1–C9 in AI_CHAT_UPGRADE_QUESTIONS.md):
-- one description per media item, written by a cheap Mistral model that looked
-- once. The file itself is never kept. A flagged item (someone who could be under
-- 18, or anything illegal) has no description: the AI leaves that conversation and
-- a person looks. Idempotent.

create table if not exists public.ai_media_notes (
  account_id      uuid not null references public.fanvue_accounts(id) on delete cascade,
  media_uuid      text not null,
  fan_uuid        text not null,
  message_uuid    text,
  media_type      text,                                  -- image | video
  kind            text,                                  -- his dog, a selfie, him jerking off…
  sexual          text,                                  -- none | suggestive | explicit
  flagged         boolean not null default false,
  description     text,
  details         jsonb not null default '[]'::jsonb,
  failed          text,                                  -- why it couldn't be seen, if it couldn't
  cost_usd        numeric(12, 6),
  created_at      timestamptz not null default now(),
  primary key (account_id, media_uuid)
);
create index if not exists ai_media_notes_fan on public.ai_media_notes (account_id, fan_uuid);
alter table public.ai_media_notes enable row level security;

notify pgrst, 'reload schema';
