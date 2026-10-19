-- AI chat, blind test version 2 and proven answers (utils/aiDuels.js):
--  - ai_gold: "proven answers": what her chatter answered in moments that were
--    followed by a purchase within a day. The gold standard the AI is measured
--    against, and examples it learns from (by Playbook situation).
--  - ai_duels: three answers per moment (her chatter's and two AI writers'), in
--    the order shown (A, B, C); whether the moment is a proven one; what the
--    chatter knew about the fan then; votes can be A, B, C, "can't choose"
--    (tie) or "none is good".
-- Needs database change 037. Idempotent, so it is safe to re-run.

create table if not exists public.ai_gold (
  account_id      uuid not null references public.fanvue_accounts(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  fan_uuid        text not null,
  moment_at       timestamptz not null,
  fan_said        jsonb not null,                       -- his message(s): ["…"]
  answer          jsonb not null,                       -- her chatter's answer: ["…"]
  situations      jsonb not null default '[]'::jsonb,   -- Playbook situations of the moment
  outcome         jsonb not null default '{}'::jsonb,   -- { replied, reply_after_min, bought }
  built_at        timestamptz not null default now(),
  primary key (account_id, fan_uuid, moment_at)
);
alter table public.ai_gold enable row level security;

alter table public.ai_duels add column if not exists options jsonb;                               -- [{ source: chatter | ai | ai2, model, text: ["…"] }], as A, B, C
alter table public.ai_duels add column if not exists proven boolean not null default false;      -- the chatter's answer was followed by a purchase
alter table public.ai_duels add column if not exists fan_context jsonb not null default '{}'::jsonb; -- { spent_before, messages_before, since }

alter table public.ai_duels drop constraint if exists ai_duels_ai_side_check;
alter table public.ai_duels add constraint ai_duels_ai_side_check check (ai_side in ('A', 'B', 'C'));
alter table public.ai_duels drop constraint if exists ai_duels_user_vote_check;
alter table public.ai_duels add constraint ai_duels_user_vote_check check (user_vote in ('A', 'B', 'C', 'tie', 'none'));
alter table public.ai_duels drop constraint if exists ai_duels_claude_vote_check;
alter table public.ai_duels add constraint ai_duels_claude_vote_check check (claude_vote in ('A', 'B', 'C', 'tie', 'none'));

-- Let the API see the change straight away.
notify pgrst, 'reload schema';
