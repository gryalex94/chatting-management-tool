-- Fansly: unsent messages, mass messages as one row each, purchases seen in the chat,
-- one linked account per platform per fan. Idempotent, so it is safe to re-run. Needs 051–057.

-- the mass message a per-fan copy belongs to (Fansly's correlationId), when it was unsent,
-- and where the sold mark came from (ledger: the Earnings page · chat: the chat's own purchase list)
alter table public.fansly_messages add column if not exists correlation_id text;
alter table public.fansly_messages add column if not exists deleted_at timestamptz;
alter table public.fansly_messages add column if not exists sold_source text;
create index if not exists fansly_messages_correlation on public.fansly_messages (account_id, correlation_id) where correlation_id is not null;

-- mass messages as Fansly's own history lists them (Messages → mass message history)
create table if not exists public.fansly_broadcasts (
  account_id    uuid not null references public.fansly_accounts(id) on delete cascade,
  broadcast_id  text not null,
  text          text,
  sent_at       timestamptz,
  deleted_at    timestamptz,
  recipients    integer,
  raw           jsonb,
  updated_at    timestamptz not null default now(),
  primary key (account_id, broadcast_id)
);
alter table public.fansly_broadcasts enable row level security;

-- a fan has one account per platform: one link per platform
alter table public.fan_links drop constraint if exists fan_links_organisation_id_fansly_fan_id_platform_ref_id_key;
delete from public.fan_links a using public.fan_links b
  where a.organisation_id = b.organisation_id and a.fansly_fan_id = b.fansly_fan_id and a.platform = b.platform and a.created_at < b.created_at;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'fan_links_one_per_platform') then
    alter table public.fan_links add constraint fan_links_one_per_platform unique (organisation_id, fansly_fan_id, platform);
  end if;
end $$;

-- the Messages list: now also says whether a message was unsent, and can show only those
drop function if exists public.fansly_sent_totals(uuid, uuid, text, timestamptz, timestamptz, boolean, boolean, boolean, text, text);
drop function if exists public.fansly_sent_messages(uuid, uuid, text, timestamptz, timestamptz, boolean, boolean, boolean, text, text, timestamptz, text, int);
drop function if exists public.fansly_sent_messages(uuid, uuid, text, timestamptz, timestamptz, boolean, boolean, boolean, text, text, timestamptz, text, int, boolean);

create or replace function public.fansly_sent_messages(
  p_org uuid, p_account uuid default null, p_chatter text default null,
  p_from timestamptz default null, p_to timestamptz default null,
  p_ppv boolean default false, p_sold boolean default false, p_unreplied boolean default false,
  p_kind text default 'all', p_q text default null,
  p_before timestamptz default null, p_before_id text default null, p_limit int default 100,
  p_unsent boolean default false)
returns table (
  account_id uuid, message_id text, group_id text, fan_account_id text, type smallint, message text, sent_at timestamptz,
  price numeric, sold_at timestamptz, sold_net numeric, delivered_at timestamptz, read_at timestamptz,
  chatter_id uuid, attribution text, replied_at timestamptz, waited_s integer, deleted_at timestamptz, correlation_id text)
language sql stable
as $$
  select m.account_id, m.message_id, m.group_id, m.fan_account_id, m.type, m.text, m.sent_at,
         m.price, m.sold_at, m.sold_net, m.delivered_at, m.read_at, m.chatter_id, m.attribution,
         r.replied_at,
         case when m.type = 2 then null else extract(epoch from (m.sent_at - w.first_fan))::int end as waited_s,
         m.deleted_at, m.correlation_id
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
    and (not p_unsent or m.deleted_at is not null)
    and (p_kind = 'all' or (p_kind = 'mass' and m.type = 2) or (p_kind = 'personal' and m.type is distinct from 2))
    and (p_q is null or m.text ilike '%' || p_q || '%')
    and (p_before is null or (m.sent_at, m.message_id) < (p_before, p_before_id))
  order by m.sent_at desc, m.message_id desc
  limit greatest(coalesce(p_limit, 100), 1)
$$;

create or replace function public.fansly_sent_totals(
  p_org uuid, p_account uuid default null, p_chatter text default null,
  p_from timestamptz default null, p_to timestamptz default null,
  p_ppv boolean default false, p_sold boolean default false, p_unreplied boolean default false,
  p_kind text default 'all', p_q text default null, p_unsent boolean default false)
returns table (messages bigint, fans bigint, ppv_sent bigint, ppv_sold bigint, sold_net numeric, replied bigint, median_waited_s integer, unsent bigint)
language sql stable
as $$
  select count(*), count(distinct x.fan_account_id), count(*) filter (where x.price > 0), count(*) filter (where x.sold_at is not null),
         coalesce(sum(x.sold_net), 0), count(*) filter (where x.replied_at is not null),
         (percentile_cont(0.5) within group (order by x.waited_s) filter (where x.waited_s <= 259200))::int,
         count(*) filter (where x.deleted_at is not null)
  from public.fansly_sent_messages(p_org, p_account, p_chatter, p_from, p_to, p_ppv, p_sold, p_unreplied, p_kind, p_q, null, null, 2147483647, p_unsent) x
$$;

-- mass messages, one row each: its copies to every fan grouped by Fansly's mass message id,
-- or (copies recorded before 058) by page, text, price and the minute it went out
create or replace function public.fansly_mass_messages(
  p_org uuid, p_account uuid default null, p_chatter text default null,
  p_from timestamptz default null, p_to timestamptz default null, p_q text default null,
  p_unsent boolean default false, p_limit int default 200)
returns table (
  account_id uuid, mass_key text, broadcast_id text, message text, sent_at timestamptz, chatter_id uuid,
  recipients bigint, read bigint, price numeric, ppv_sold bigint, sold_net numeric, deleted_at timestamptz)
language sql stable
as $$
  with raw as (
    select m.*,
           -- copies go out over several minutes: a gap of 30 minutes or more with the same text and price starts a new mass message
           case when m.sent_at - lag(m.sent_at) over (partition by m.account_id, coalesce(m.text, ''), coalesce(m.price, -1) order by m.sent_at) < interval '30 minutes' then 0 else 1 end as starts
    from public.fansly_messages m
    join public.fansly_accounts a on a.id = m.account_id and a.organisation_id = p_org
    where m.type = 2 and not m.from_fan and m.sent_at is not null
      and (p_account is null or m.account_id = p_account)
      and (p_from is null or m.sent_at >= p_from) and (p_to is null or m.sent_at < p_to)
      and (p_q is null or m.text ilike '%' || p_q || '%')
  ), copies as (
    select r.*, coalesce(r.correlation_id, md5(r.account_id::text || '|' || coalesce(r.text, '') || '|' || coalesce(r.price::text, '') || '|' ||
             sum(r.starts) over (partition by r.account_id, coalesce(r.text, ''), coalesce(r.price, -1) order by r.sent_at rows unbounded preceding)::text)) as k
    from raw r
  ), grouped as (
    select c.account_id, c.k as mass_key, max(c.correlation_id) as broadcast_id, max(c.text) as message, min(c.sent_at) as sent_at,
           (array_agg(c.chatter_id) filter (where c.chatter_id is not null))[1] as chatter_id,
           count(*) as recipients, count(*) filter (where c.read_at is not null) as read, max(c.price) as price,
           count(*) filter (where c.sold_at is not null) as ppv_sold, coalesce(sum(c.sold_net), 0) as sold_net,
           max(c.deleted_at) as deleted_at
    from copies c group by c.account_id, c.k
  )
  select g.account_id, g.mass_key, g.broadcast_id, g.message, g.sent_at, g.chatter_id, g.recipients, g.read, g.price, g.ppv_sold, g.sold_net,
         coalesce(g.deleted_at, b.deleted_at) as deleted_at
  from grouped g
  left join public.fansly_broadcasts b on b.account_id = g.account_id and b.broadcast_id = g.broadcast_id
  where (p_chatter is null or (p_chatter = 'none' and g.chatter_id is null) or g.chatter_id::text = p_chatter)
    and (not p_unsent or coalesce(g.deleted_at, b.deleted_at) is not null)
  order by g.sent_at desc
  limit greatest(coalesce(p_limit, 200), 1)
$$;

revoke all on function public.fansly_sent_messages(uuid, uuid, text, timestamptz, timestamptz, boolean, boolean, boolean, text, text, timestamptz, text, int, boolean) from public, anon, authenticated;
revoke all on function public.fansly_sent_totals(uuid, uuid, text, timestamptz, timestamptz, boolean, boolean, boolean, text, text, boolean) from public, anon, authenticated;
revoke all on function public.fansly_mass_messages(uuid, uuid, text, timestamptz, timestamptz, text, boolean, int) from public, anon, authenticated;
grant execute on function public.fansly_sent_messages(uuid, uuid, text, timestamptz, timestamptz, boolean, boolean, boolean, text, text, timestamptz, text, int, boolean) to service_role;
grant execute on function public.fansly_sent_totals(uuid, uuid, text, timestamptz, timestamptz, boolean, boolean, boolean, text, text, boolean) to service_role;
grant execute on function public.fansly_mass_messages(uuid, uuid, text, timestamptz, timestamptz, text, boolean, int) to service_role;

notify pgrst, 'reload schema';
