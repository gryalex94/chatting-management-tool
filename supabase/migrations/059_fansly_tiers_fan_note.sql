-- Fansly: the page's subscription tiers with Fansly's colours, and one free-text
-- note per fan (like Infloww's notes field: empty until someone types, saved as
-- they type, the same for every shift). Idempotent, so it is safe to re-run. Needs 051–058.

-- { "<tier id>": { "name": "...", "color": "#FF1493", "price": 5 } }, from the account and the subscriber list
alter table public.fansly_accounts add column if not exists tiers jsonb not null default '{}'::jsonb;

create table if not exists public.fansly_fan_notes (
  account_id      uuid not null references public.fansly_accounts(id) on delete cascade,
  fan_account_id  text not null,
  text            text not null default '' check (length(text) <= 5000),
  updated_by      uuid references public.users(id) on delete set null,
  updated_at      timestamptz not null default now(),
  primary key (account_id, fan_account_id)
);
alter table public.fansly_fan_notes enable row level security;

-- the notes written so far (one per line, oldest first) become the fan's note
insert into public.fansly_fan_notes (account_id, fan_account_id, text, updated_by, updated_at)
select n.account_id, n.fan_account_id, string_agg(n.text, E'\n' order by n.created_at), (array_agg(n.user_id order by n.created_at desc))[1], max(n.created_at)
from public.fansly_notes n
group by n.account_id, n.fan_account_id
on conflict (account_id, fan_account_id) do nothing;

-- the one colour already seen in a capture (23 Oct): corarossi's "Same as on OnlyFans" tier
update public.fansly_accounts set tiers = tiers || '{"723249959817715713": {"name": "Same as on OnlyFans", "color": "#FF1493"}}'::jsonb
where fansly_account_id = '681586678401347587' and not (tiers ? '723249959817715713');

notify pgrst, 'reload schema';
