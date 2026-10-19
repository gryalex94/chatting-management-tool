-- AI chat blind test (utils/aiDuels.js): real moments from a creator's chats where
-- a fan wrote and her chatter answered. For each, the AI writes its own answer
-- from the same chat; a manager (and Claude) pick the better one without knowing
-- which is which. `outcome` is what really happened after the chatter's answer.
-- Idempotent, so it is safe to re-run.

create table if not exists public.ai_duels (
  id              bigint generated always as identity primary key,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  creator_id      uuid not null references public.creators(id) on delete cascade,
  account_id      uuid not null references public.fanvue_accounts(id) on delete cascade,
  batch           timestamptz not null,                 -- one test run
  fan_uuid        text not null,
  moment_at       timestamptz not null,                 -- his message she answers
  fan_said        jsonb not null default '[]'::jsonb,   -- his message(s) at that moment: ["…"]
  human           jsonb not null,                       -- what her chatter sent: ["…"]
  ai              jsonb not null,                       -- what the AI wrote: ["…"]
  ai_model        text,
  ai_status       text,                                 -- ok / check / blocked (the AI's own checks)
  situations      jsonb not null default '[]'::jsonb,   -- Playbook situations the AI used
  ai_side         text not null check (ai_side in ('A', 'B')),
  outcome         jsonb not null default '{}'::jsonb,   -- after the chatter's answer: { replied, reply_after_min, bought }
  claude_vote     text check (claude_vote in ('A', 'B', 'tie')),
  claude_reason   text,
  user_vote       text check (user_vote in ('A', 'B', 'tie')),
  voted_by        uuid references public.users(id) on delete set null,
  voted_at        timestamptz,
  cost_usd        numeric(10,6),
  created_at      timestamptz not null default now()
);
create index if not exists ai_duels_batch on public.ai_duels (organisation_id, creator_id, batch);
alter table public.ai_duels enable row level security;

-- Let the API see the change straight away.
notify pgrst, 'reload schema';
