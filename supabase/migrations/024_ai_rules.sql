-- Lasting rules for the AI review. Drafted each week from the managers' dismissal
-- notes (or written by hand on the AI Rules page); a rule is only used once the
-- owner approves it. Unlike the "recently rejected" examples (last 30 days), an
-- approved rule stays until it's retired.
create table if not exists public.ai_rules (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  creator_id      uuid references public.creators(id) on delete cascade,  -- null = every page
  area            text,                                                   -- the task area it's about, if one
  rule            text not null check (char_length(rule) between 3 and 600),
  status          text not null default 'proposed'
                  check (status in ('proposed', 'active', 'rejected', 'retired')),
  source          text not null default 'manual' check (source in ('manual', 'drafted')),
  why             text,                                                   -- what feedback it comes from
  based_on        jsonb,                                                  -- the dismissed tasks behind it
  replaces        uuid references public.ai_rules(id) on delete set null, -- an older rule it refines
  created_by      uuid references public.users(id) on delete set null,
  decided_by      uuid references public.users(id) on delete set null,
  decided_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists ai_rules_org_status on public.ai_rules (organisation_id, status);

-- Same lock as every other table (migration 019): only the server reads it.
alter table public.ai_rules enable row level security;

-- Up to when the dismissal notes have been read for drafting.
alter table public.organisations add column if not exists ai_rules_drafted_at timestamptz;
