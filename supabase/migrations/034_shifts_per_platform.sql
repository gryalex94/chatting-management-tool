-- Shifts per platform: every platform has its own shift times and roster. The
-- shift times for everyone (shifts with no page) get a platform — the ones that
-- exist are OnlyFans'. A page's own old shifts follow the page. A platform's
-- shift times are made the first time its roster opens (the usual three to start
-- with, changeable on the Shifts page). Needs database change 032.
-- Idempotent, so it is safe to re-run.

alter table public.shifts add column if not exists platform text not null default 'onlyfans';
alter table public.shifts drop constraint if exists shifts_platform_check;
alter table public.shifts add constraint shifts_platform_check check (platform in ('onlyfans', 'fanvue', 'fansly'));

update public.shifts s set platform = c.platform
from public.creators c
where s.creator_id = c.id and s.platform <> c.platform;

create index if not exists shifts_org_platform on public.shifts (organisation_id, platform) where creator_id is null;

-- Let the API see the change straight away.
notify pgrst, 'reload schema';
