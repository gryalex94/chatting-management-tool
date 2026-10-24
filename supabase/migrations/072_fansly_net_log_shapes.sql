-- The request log (popup switch, 15 minutes) also keeps the outline of what was sent and what came
-- back (field names and kinds of value; prices, limits and types as numbers; no texts, names or ids)
-- and the controls clicked (their label and icon, never what is typed), to build the vault and PPV
-- parts of the side panel from Fansly's real data. Idempotent, so it is safe to re-run.
alter table public.fansly_net_log add column if not exists shape jsonb;
alter table public.fansly_net_log add column if not exists ui jsonb;
notify pgrst, 'reload schema';
