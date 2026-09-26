-- Infloww's own ID for each page (not the OnlyFans ID). With it, the app can open
-- a fan's conversation straight in the Infloww desktop app:
--   infloww://open?cid=<infloww_creator_id>&fid=<fan's OnlyFans id>&type=chatLink
-- It's the `cid` in any chat link copied from that page in Infloww (base64-decoded).
alter table public.creators add column if not exists infloww_creator_id text;

alter table public.creators drop constraint if exists creators_infloww_creator_id_digits;
alter table public.creators add constraint creators_infloww_creator_id_digits
  check (infloww_creator_id is null or infloww_creator_id ~ '^[0-9]{1,30}$');
