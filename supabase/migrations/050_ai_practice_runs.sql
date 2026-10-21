-- AI chat: practice conversations are saved (utils/aiChat.js → savePracticeRun), so the
-- engine can learn from whole dialogues, not single moments:
--  - ai_practice_runs: one row per practice chat: the messages as typed, every reply
--    with its decision map and what the manager did as him afterwards, the engine's
--    session at the end. Saved as the chat goes; reopened from Practice; replayed
--    through the engine after changes (scripts/replay-practice.js).
--  - ai_examples gets a creator and a 'practice' source: a reply the manager starred in
--    Practice joins her example library and counts more than the analysed chats.
-- Idempotent, so it is safe to re-run.

create table if not exists public.ai_practice_runs (
  id              bigint generated always as identity primary key,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  creator_id      uuid not null references public.creators(id) on delete cascade,
  created_by      text,                                  -- the manager who practised
  fan_uuid        text,                                  -- a real fan's chat continued, or null for a made-up fan
  made_up         jsonb,                                 -- { name, type, notes }
  title           text not null,
  messages        jsonb not null default '[]'::jsonb,    -- the practice chat as typed (him and her kept replies)
  turns           jsonb not null default '[]'::jsonb,    -- each reply: the drafts, the decision map, the session, what he did next
  session         jsonb,                                 -- the engine's session at the end
  settings        jsonb not null default '{}'::jsonb,    -- { models, selling, learned }
  message_count   integer not null default 0,
  turn_count      integer not null default 0,
  starred         integer not null default 0,            -- replies starred into her example library
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists ai_practice_runs_page on public.ai_practice_runs (organisation_id, creator_id, updated_at desc);
alter table public.ai_practice_runs enable row level security;

alter table public.ai_examples add column if not exists creator_id uuid references public.creators(id) on delete cascade;

-- Let the API see the change straight away.
notify pgrst, 'reload schema';
