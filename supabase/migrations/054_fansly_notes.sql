-- Fansly, phase 3: notes on a fan, written in the extension's side panel.
-- They live only in our database (never sent to Fansly). Every shift sees them.
-- Idempotent, so it is safe to re-run. Needs 051.

create table if not exists public.fansly_notes (
  id               uuid primary key default gen_random_uuid(),
  account_id       uuid not null references public.fansly_accounts(id) on delete cascade,
  fan_account_id   text not null,
  user_id          uuid references public.users(id) on delete set null,
  text             text not null check (length(text) between 1 and 2000),
  pinned           boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists fansly_notes_fan on public.fansly_notes (account_id, fan_account_id, created_at desc);
alter table public.fansly_notes enable row level security;

notify pgrst, 'reload schema';
