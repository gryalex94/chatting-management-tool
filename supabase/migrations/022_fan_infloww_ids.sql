-- A fan's OnlyFans ID, learned from a chat link a manager pasted ("Copy chat link"
-- in Infloww). Needed to open the fan's chat in the Infloww app when they've
-- replaced the default "u<number>" username (whose number already IS the ID).
create table if not exists public.fan_infloww_ids (
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  username        text not null,
  of_user_id      text not null check (of_user_id ~ '^[0-9]{1,30}$'),
  created_by      uuid references public.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  primary key (organisation_id, username)
);

-- Same lock as every other table (migration 019): only the server reads it.
alter table public.fan_infloww_ids enable row level security;
