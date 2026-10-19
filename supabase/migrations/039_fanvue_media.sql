-- Photos, videos and PPVs in Fanvue chats (utils/fanvueSync.js → copyMedia).
-- Fanvue's message list carries only the text of a message: what was attached,
-- the PPV price and whether the fan bought it come from each chat's media list.
-- One row per media item per message: a message with 4 photos has 4 rows, and
-- the same photo sent again in another message has a row there too.
-- Idempotent, so it is safe to re-run.

create table if not exists public.fanvue_media (
  account_id    uuid not null references public.fanvue_accounts(id) on delete cascade,
  fan_uuid      text not null,
  message_uuid  text not null default '',  -- the message it came with
  media_uuid    text not null,
  media_type    text,                       -- image / video / audio / document
  from_fan      boolean not null default false,
  sent_at       timestamptz,
  price_cents   integer,                    -- PPV list price; null when free
  paid_cents    integer,                    -- what he paid to unlock it; null when not bought
  purchased_at  timestamptz,
  primary key (account_id, fan_uuid, message_uuid, media_uuid)
);
alter table public.fanvue_media enable row level security;

-- Whether a chat's whole media list has been copied once (then only what's new).
alter table public.fanvue_fans add column if not exists media_done boolean not null default false;

-- Let the API see the change straight away.
notify pgrst, 'reload schema';
