-- Fansly: whether a chat's whole history is recorded. Fansly loads a chat 25 messages at a
-- time, newest first; a page with fewer than asked for means its first message is reached.
-- The side panel warns until then. Idempotent, so it is safe to re-run. Needs 051.
alter table public.fansly_fans add column if not exists history_complete boolean not null default false;
alter table public.fansly_fans add column if not exists history_complete_at timestamptz;
notify pgrst, 'reload schema';
