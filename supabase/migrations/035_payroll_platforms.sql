-- Payroll across platforms: still one report per person per period. The report's
-- own columns stay the OnlyFans part (as before); every other platform the person
-- worked on gets a line in `lines` ({ "fanvue": { hours_auto, hours, overtime…,
-- rates, sales_gross, sales_net, refunded, pages, shifts } }), and the total adds
-- them up. Pay rates can differ per platform: a person's own rates for a platform
-- live in chatter_platform_rates (OnlyFans' stay on chatters); the team's per
-- platform in daily_check_config (payroll_hourly_rate:fanvue …).
-- Idempotent, so it is safe to re-run.

alter table public.payroll_reports add column if not exists lines jsonb not null default '{}'::jsonb;

create table if not exists public.chatter_platform_rates (
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  chatter_id      uuid not null references public.chatters(id) on delete cascade,
  platform        text not null check (platform in ('fanvue', 'fansly')),
  hourly_rate     numeric(8,2),
  commission_pct  numeric(5,2),
  overtime_rate   numeric(8,2),
  updated_at      timestamptz not null default now(),
  primary key (chatter_id, platform)
);
alter table public.chatter_platform_rates enable row level security;

-- Let the API see the change straight away.
notify pgrst, 'reload schema';
