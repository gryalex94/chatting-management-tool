-- What he did after each of her replies (AI chat, B7 in AI_CHAT_UPGRADE_QUESTIONS.md):
-- did he answer, go quiet, buy, not buy or ignore the PPV. In Practice this is how the
-- manager played him (source 'practice'); live chats come later (source 'live'). Used
-- for a weekly report that tunes the talk budgets and warm-ups. Idempotent.

create table if not exists public.ai_outcomes (
  id              bigint generated always as identity primary key,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  creator_id      uuid not null references public.creators(id) on delete cascade,
  fan_uuid        text,                                  -- null for a made-up fan
  source          text not null default 'practice',      -- practice | live
  goal            text,                                  -- the plan's goal for the reply
  aim             text,                                  -- the conversation's plan then (rapport, sell, read…)
  tier            text,
  closeness       text,
  happened        text not null,                         -- replied | quiet | bought | not_bought | ignored | left
  ppv             boolean not null default false,        -- the reply carried a PPV
  created_at      timestamptz not null default now()
);
create index if not exists ai_outcomes_page on public.ai_outcomes (organisation_id, creator_id, created_at desc);
alter table public.ai_outcomes enable row level security;

notify pgrst, 'reload schema';
