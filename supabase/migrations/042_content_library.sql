-- Her content library: what she has and where it is (utils/contentLibrary.js).
--  - content_assets: one row per real photo or video, with what's in it: the
--    platform's own AI description and content tags (acts, objects, setting, body
--    parts, position…), the length of a video, its size.
--  - content_locations: where each one lives (platform, account, the platform's
--    media id, folder, name). Fanvue now; OnlyFans or Fansly later, so the same
--    photo can have several locations and the system always knows what is where.
--  - ai_content items (what she sells) are made of assets, and can be steps of a
--    series sent in order (a sexting sequence).
-- Idempotent, so it is safe to re-run.

create table if not exists public.content_assets (
  id              bigint generated always as identity primary key,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  creator_id      uuid not null references public.creators(id) on delete cascade,
  kind            text not null default 'image' check (kind in ('image', 'video', 'audio', 'other')),
  description     text,                                 -- the platform's AI description
  tags            jsonb not null default '{}'::jsonb,    -- { tags, nsfw, acts, objects, body, setting, position, people, look, other, important }
  length_ms       integer,                              -- video length
  width           integer,
  height          integer,
  created_at      timestamptz,                          -- when it was uploaded
  updated_at      timestamptz not null default now()
);
create index if not exists content_assets_page on public.content_assets (organisation_id, creator_id);
alter table public.content_assets enable row level security;

create table if not exists public.content_locations (
  asset_id        bigint not null references public.content_assets(id) on delete cascade,
  platform        text not null,                        -- fanvue / onlyfans / fansly
  account_id      uuid,                                 -- e.g. fanvue_accounts.id
  external_id     text not null,                        -- the platform's media id
  folder          text,
  name            text,
  status          text,                                 -- the platform's status (finalised, error…)
  synced_at       timestamptz not null default now(),
  primary key (platform, external_id)
);
create index if not exists content_locations_asset on public.content_locations (asset_id);
alter table public.content_locations enable row level security;

alter table public.ai_content add column if not exists asset_ids bigint[] not null default '{}';   -- the files in it
alter table public.ai_content add column if not exists series text;                               -- e.g. "Sexting 1": sent in order
alter table public.ai_content add column if not exists step integer;                              -- its place in the series
alter table public.ai_content add column if not exists source text not null default 'manual';    -- manual / starter / vault
alter table public.ai_content alter column minutes type numeric(8,3);                          -- short videos: seconds count

-- Let the API see the change straight away.
notify pgrst, 'reload schema';
