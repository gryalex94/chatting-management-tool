-- A tip nobody wrote about within the hour goes to whoever is rostered on that page's shift then;
-- when several are, they share it: all of them are listed here (credited_chatter_id stays the first).
-- Idempotent, so it is safe to re-run. Needs 051.
alter table public.fansly_transactions add column if not exists credited_chatter_ids uuid[];
notify pgrst, 'reload schema';
