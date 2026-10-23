-- One fan across the agency: a Fansly fan linked by hand to the same person on
-- OnlyFans (Infloww's fan id) or Fanvue (the fan's uuid), so the side panel can
-- show what he spent on every page. Fansly pages need no link: Fansly gives a
-- fan one id across all creators. Idempotent, so it is safe to re-run.

create table if not exists public.fan_links (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  fansly_fan_id    text not null,
  platform         text not null check (platform in ('onlyfans', 'fanvue')),
  ref_id           text not null,                 -- OnlyFans: Infloww fan id · Fanvue: fan uuid
  ref_name         text,
  created_by       uuid references public.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  unique (organisation_id, fansly_fan_id, platform, ref_id)
);
create index if not exists fan_links_fan on public.fan_links (organisation_id, fansly_fan_id);
alter table public.fan_links enable row level security;

notify pgrst, 'reload schema';
