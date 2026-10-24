-- Fansly: a short "what the page requested" log, switched on in the extension's popup for
-- 15 minutes, so the reading buttons are built from Fansly's real requests (address, paging
-- settings, how many rows came back), not from guesses. Only addresses and counts: no bodies.
-- Idempotent, so it is safe to re-run.
create table if not exists public.fansly_net_log (
  id               bigint generated always as identity primary key,
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  account_id       uuid references public.fansly_accounts(id) on delete cascade,
  user_id          uuid references public.users(id) on delete set null,
  at               timestamptz not null,
  page             text,            -- the Fansly page the browser was on
  method           text,
  path             text,            -- /api/v1/... without the host
  query            jsonb,           -- the request's settings (limit, offset, before, status…)
  status           integer,
  rows             jsonb,           -- for each list in the answer: its name and length
  received_at      timestamptz not null default now()
);
create index if not exists fansly_net_log_time on public.fansly_net_log (organisation_id, at desc);
alter table public.fansly_net_log enable row level security;
notify pgrst, 'reload schema';
