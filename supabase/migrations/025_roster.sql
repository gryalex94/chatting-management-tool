-- Shifts, rebuilt (the Shifts page). Chatters are no longer tied to one page or
-- team: each works a shift, on the pages they handle in it, on their weekdays.
--  • shifts with no page (creator_id null) are the shift times for everyone
--  • roster_assignments: the standing weekly roster
--  • roster_changes: one-day changes (someone off, someone brought in)
-- The old per-page shifts and chatter_creator_assignments are left untouched.
-- Idempotent, so it is safe to re-run.

-- The three shift times for everyone (Amsterdam time; EU Prime runs past midnight
-- and counts as the day it starts).
insert into public.shifts (organisation_id, name, start_time, end_time, timezone, shift_type, is_default, is_active)
select o.id, s.name, s.st::time, s.et::time, 'Europe/Amsterdam', 'regular', true, true
from public.organisations o
cross join (values ('US Prime', '02:00', '10:00'), ('Middle', '10:00', '18:00'), ('EU Prime', '18:00', '02:00')) as s(name, st, et)
where not exists (
  select 1 from public.shifts x
  where x.organisation_id = o.id and x.creator_id is null and x.name = s.name
);

-- The standing weekly roster: who works which shift, on which pages, which days.
-- A chatter who works different shifts on different days (a floater) has one row
-- per shift.
create table if not exists public.roster_assignments (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  chatter_id      uuid not null references public.chatters(id) on delete cascade,
  shift_id        uuid not null references public.shifts(id) on delete cascade,
  creator_ids     uuid[] not null default '{}',                 -- the pages they handle in this shift
  weekdays        smallint[] not null default '{1,2,3,4,5}',    -- 1 = Monday … 7 = Sunday
  is_active       boolean not null default true,
  source          text not null default 'manual' check (source in ('manual', 'from_activity')),
  created_by      uuid references public.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists roster_assignments_org on public.roster_assignments (organisation_id, is_active);
alter table public.roster_assignments enable row level security;

-- One-day changes. Per chatter and date at most one: 'off' (not working that day)
-- or 'work' (works this shift on these pages that day, instead of their usual).
create table if not exists public.roster_changes (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  date            date not null,
  chatter_id      uuid not null references public.chatters(id) on delete cascade,
  kind            text not null check (kind in ('off', 'work')),
  shift_id        uuid references public.shifts(id) on delete cascade,
  creator_ids     uuid[] not null default '{}',
  note            text,
  created_by      uuid references public.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  unique (organisation_id, date, chatter_id)
);
create index if not exists roster_changes_org_date on public.roster_changes (organisation_id, date);
alter table public.roster_changes enable row level security;
