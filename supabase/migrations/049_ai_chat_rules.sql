-- Rules drafted from the manager's marks in Practice (AI chat, C2 in
-- AI_CHAT_ADJUSTMENT_QUESTIONS.md): after three similar marks a rule is drafted;
-- the manager approves it in the tool (ai_rules is the Playbook rules table), and then the writer and Claude's check
-- follow it. Idempotent.

create table if not exists public.ai_chat_rules (
  id              bigint generated always as identity primary key,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  creator_id      uuid not null references public.creators(id) on delete cascade,
  text            text not null,                         -- the rule, one line, as the writer reads it
  kind            text not null default 'wording',       -- wording | decision
  goal            text,                                  -- the moment it's for (plan goal), or null for all
  status          text not null default 'draft',         -- draft | approved | dismissed
  from_ids        bigint[] not null default '{}',        -- the marks (ai_feedback) it was drafted from
  created_at      timestamptz not null default now(),
  decided_at      timestamptz
);
create index if not exists ai_chat_rules_page on public.ai_chat_rules (organisation_id, creator_id, status, created_at desc);
alter table public.ai_chat_rules enable row level security;

notify pgrst, 'reload schema';
