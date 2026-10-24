-- Fansly scripts as sequences of steps (text; vault media, free or PPV with a price; wait for his
-- reply), from the vault and PPV recording of 24 Oct 2026:
--  - the vault, as Fansly's page loads it (GET /vault/albumsnew, GET /media/vaultnew): albums and media
--  - which vault media a chat item is (a PPV is a priced copy of a vault item: fansly_items.media_id)
--  - how far each fan got through a sequence
-- Nothing is sent to Fansly: the panel fills the message box and the chatter sends. Idempotent.

create table if not exists public.fansly_vault_albums (
  account_id       uuid not null references public.fansly_accounts(id) on delete cascade,
  album_id         text not null,
  title            text,
  type             integer,
  item_count       integer,
  pos              integer,
  updated_at       timestamptz not null default now(),
  primary key (account_id, album_id)
);
alter table public.fansly_vault_albums enable row level security;

create table if not exists public.fansly_vault_media (
  account_id       uuid not null references public.fansly_accounts(id) on delete cascade,
  media_id         text not null,
  type             integer,              -- 1 photo, 2 video (Fansly's media type)
  mimetype         text,
  width            integer,
  height           integer,
  duration_s       numeric,
  filename         text,                 -- the vault's own name for it (customFilename), else the file's
  album_ids        text[] not null default '{}',
  created_at_fansly timestamptz,
  updated_at       timestamptz not null default now(),
  primary key (account_id, media_id)
);
create index if not exists fansly_vault_media_new on public.fansly_vault_media (account_id, created_at_fansly desc);
alter table public.fansly_vault_media enable row level security;

-- a chat item's vault media (a single item: its mediaId; a bundle: the media of its items)
alter table public.fansly_items add column if not exists media_id text;
alter table public.fansly_items add column if not exists media_ids text[];
update public.fansly_items set media_id = raw->>'mediaId' where kind = 'media' and media_id is null and raw ? 'mediaId';
create index if not exists fansly_items_media on public.fansly_items (account_id, media_id);

-- a script's steps: null = one text, as before; else [{ kind: 'text'|'media'|'wait', text, media_ids: [..], price }]
alter table public.fansly_scripts add column if not exists steps jsonb;

create table if not exists public.fansly_script_runs (
  account_id       uuid not null references public.fansly_accounts(id) on delete cascade,
  fan_account_id   text not null,
  script_id        uuid not null references public.fansly_scripts(id) on delete cascade,
  step             integer not null default 0,     -- the next step to do (0-based)
  updated_at       timestamptz not null default now(),
  updated_by       uuid references public.users(id) on delete set null,
  primary key (account_id, fan_account_id, script_id)
);
alter table public.fansly_script_runs enable row level security;

notify pgrst, 'reload schema';
