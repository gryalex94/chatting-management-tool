-- Fansly: the Messages dashboard (every message the team sent, per page).
-- Two functions read fansly_messages with what a plain query can't do cheaply:
-- how long the fan had been waiting, and whether / when he replied.
-- Called only by the server (service role); not exposed to the browser.
-- Idempotent, so it is safe to re-run. Needs 051 and 052.

create index if not exists fansly_messages_group_time on public.fansly_messages (account_id, group_id, sent_at);

create or replace function public.fansly_sent_messages(
  p_org uuid, p_account uuid default null, p_chatter text default null,
  p_from timestamptz default null, p_to timestamptz default null,
  p_ppv boolean default false, p_sold boolean default false, p_unreplied boolean default false,
  p_kind text default 'all', p_q text default null,
  p_before timestamptz default null, p_before_id text default null, p_limit int default 100)
returns table (
  account_id uuid, message_id text, group_id text, fan_account_id text, type smallint, message text, sent_at timestamptz,
  price numeric, sold_at timestamptz, sold_net numeric, delivered_at timestamptz, read_at timestamptz,
  chatter_id uuid, attribution text, replied_at timestamptz, waited_s integer)
language sql stable
as $$
  select m.account_id, m.message_id, m.group_id, m.fan_account_id, m.type, m.text, m.sent_at,
         m.price, m.sold_at, m.sold_net, m.delivered_at, m.read_at, m.chatter_id, m.attribution,
         r.replied_at,
         case when m.type = 2 then null else extract(epoch from (m.sent_at - w.first_fan))::int end as waited_s
  from public.fansly_messages m
  join public.fansly_accounts a on a.id = m.account_id and a.organisation_id = p_org
  left join lateral (
    select min(f.sent_at) as replied_at from public.fansly_messages f
    where f.account_id = m.account_id and f.group_id = m.group_id and f.from_fan and f.sent_at > m.sent_at
  ) r on true
  left join lateral (
    select min(f.sent_at) as first_fan from public.fansly_messages f
    where f.account_id = m.account_id and f.group_id = m.group_id and f.from_fan and f.sent_at < m.sent_at
      and f.sent_at > coalesce((select max(c.sent_at) from public.fansly_messages c
                                where c.account_id = m.account_id and c.group_id = m.group_id and not c.from_fan
                                  and c.type is distinct from 2 and c.sent_at < m.sent_at), '-infinity'::timestamptz)
  ) w on true
  where not m.from_fan and m.sent_at is not null
    and (p_account is null or m.account_id = p_account)
    and (p_chatter is null or (p_chatter = 'none' and m.chatter_id is null) or m.chatter_id::text = p_chatter)
    and (p_from is null or m.sent_at >= p_from) and (p_to is null or m.sent_at < p_to)
    and (not p_ppv or m.price > 0) and (not p_sold or m.sold_at is not null)
    and (not p_unreplied or r.replied_at is null)
    and (p_kind = 'all' or (p_kind = 'mass' and m.type = 2) or (p_kind = 'personal' and m.type is distinct from 2))
    and (p_q is null or m.text ilike '%' || p_q || '%')
    and (p_before is null or (m.sent_at, m.message_id) < (p_before, p_before_id))
  order by m.sent_at desc, m.message_id desc
  limit greatest(coalesce(p_limit, 100), 1)          -- the server keeps pages small; the totals read everything
$$;

create or replace function public.fansly_sent_totals(
  p_org uuid, p_account uuid default null, p_chatter text default null,
  p_from timestamptz default null, p_to timestamptz default null,
  p_ppv boolean default false, p_sold boolean default false, p_unreplied boolean default false,
  p_kind text default 'all', p_q text default null)
returns table (messages bigint, fans bigint, ppv_sent bigint, ppv_sold bigint, sold_net numeric, replied bigint, median_waited_s integer)
language sql stable
as $$
  select count(*), count(distinct x.fan_account_id), count(*) filter (where x.price > 0), count(*) filter (where x.sold_at is not null),
         coalesce(sum(x.sold_net), 0), count(*) filter (where x.replied_at is not null),
         -- a fan who wrote days ago and only now got an answer isn't a reply time: over 3 days stays out
         (percentile_cont(0.5) within group (order by x.waited_s) filter (where x.waited_s <= 259200))::int
  from public.fansly_sent_messages(p_org, p_account, p_chatter, p_from, p_to, p_ppv, p_sold, p_unreplied, p_kind, p_q, null, null, 2147483647) x
$$;

revoke all on function public.fansly_sent_messages(uuid, uuid, text, timestamptz, timestamptz, boolean, boolean, boolean, text, text, timestamptz, text, int) from public, anon, authenticated;
revoke all on function public.fansly_sent_totals(uuid, uuid, text, timestamptz, timestamptz, boolean, boolean, boolean, text, text) from public, anon, authenticated;
grant execute on function public.fansly_sent_messages(uuid, uuid, text, timestamptz, timestamptz, boolean, boolean, boolean, text, text, timestamptz, text, int) to service_role;
grant execute on function public.fansly_sent_totals(uuid, uuid, text, timestamptz, timestamptz, boolean, boolean, boolean, text, text) to service_role;

notify pgrst, 'reload schema';
