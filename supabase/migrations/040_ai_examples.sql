-- AI chat: the example library (utils/aiChat.js → libraryExamples). Real moments
-- from the agency's good dialogues in the Oct 2026 analysis of ~35k chats (the
-- first PPV was bought and the chatter made no mistakes): what was going on, his
-- message in plain words, and the chatter's reply. Only warm-up, small talk and
-- aftercare for now (no selling). Each is tagged with its Playbook situation, how
-- sexual his message and her reply were (0 friendly … 3 explicit) and his mood,
-- so the writer gets examples that fit the moment. No fan names or usernames.
-- Idempotent, so it is safe to re-run.

create table if not exists public.ai_examples (
  id              bigint generated always as identity primary key,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  source          text not null,                         -- e.g. 'chat-analysis-2026-10'
  dialogue        text,                                  -- which analysed dialogue (to spread examples)
  phase           text,                                  -- warmup / no_ppv / aftercare
  situation       text,                                  -- Playbook situation id, or null
  his_level       smallint,                              -- 0 friendly, 1 flirty, 2 suggestive, 3 explicit
  her_level       smallint,
  mood            text,                                  -- chatty, joking, curious, flirty, horny, …
  moment          text not null,                         -- what's going on, in one line
  him             text not null,                         -- his message, in plain words
  reply           jsonb not null,                        -- her reply as sent: ["…"]
  created_at      timestamptz not null default now()
);
create index if not exists ai_examples_pick on public.ai_examples (organisation_id, his_level, situation);
alter table public.ai_examples enable row level security;

-- Let the API see the change straight away.
notify pgrst, 'reload schema';
