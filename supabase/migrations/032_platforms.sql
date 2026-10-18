-- Platforms: every page belongs to one platform — OnlyFans, Fanvue or Fansly —
-- and the switch at the top of the menu shows one platform at a time. Pages that
-- exist today are OnlyFans (they all came from Infloww). A connected Fanvue
-- account gets a page of its own (server/src/routes/fanvue.js links them).
-- Idempotent, so it is safe to re-run.

alter table public.creators add column if not exists platform text not null default 'onlyfans';
alter table public.creators drop constraint if exists creators_platform_check;
alter table public.creators add constraint creators_platform_check check (platform in ('onlyfans', 'fanvue', 'fansly'));
create index if not exists idx_creators_platform on public.creators (organisation_id, platform);

-- The page a connected Fanvue account belongs to.
alter table public.fanvue_accounts add column if not exists creator_id uuid references public.creators(id) on delete set null;

-- Let the API see the change straight away.
notify pgrst, 'reload schema';
