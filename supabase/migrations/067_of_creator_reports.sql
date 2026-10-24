-- OnlyFans Creator reports: the chatting numbers (like the OnlyFans dashboard's) for any range of the
-- chat exports, per chatter and page, per chatter, per page, and in all. Idempotent, safe to re-run.

create index if not exists messages_org_sent on public.messages (organisation_id, sent_datetime);

drop function if exists public.of_chatting(uuid, uuid[], timestamptz, timestamptz);
create or replace function public.of_chatting(p_org uuid, p_creators uuid[], p_start timestamptz, p_end timestamptz)
returns table (
  sender text, creator_id uuid, by_sender boolean, by_creator boolean,
  messages bigint, ppv_sent bigint, ppv_bought bigint, ppv_sales numeric, fans bigint, buyers bigint,
  reply_s integer, replies bigint)
language sql stable
as $$
  with m as (
    select lower(trim(x.sender_name)) as sender, x.creator_id, x.sent_to_username as fan,
           coalesce(x.price, 0) as price, coalesce(x.purchased, false) as purchased,
           -- a genuine reply: to a fan message, under 2 hours (as the OnlyFans dashboard counts it)
           case when nullif(trim(x.fan_message_text), '') is not null and x.replay_time_seconds > 0 and x.replay_time_seconds < 7200 then x.replay_time_seconds end as rt
    from public.messages x
    where x.organisation_id = p_org and x.sent_datetime >= p_start and x.sent_datetime < p_end
      and nullif(trim(x.creator_message_text), '') is not null
      and (p_creators is null or x.creator_id = any (p_creators))
  )
  select sender, creator_id, grouping(sender) = 0, grouping(creator_id) = 0,
         count(*), count(*) filter (where price > 0), count(*) filter (where price > 0 and purchased),
         coalesce(sum(price) filter (where price > 0 and purchased), 0),
         count(distinct fan), count(distinct fan) filter (where price > 0 and purchased),
         (percentile_cont(0.5) within group (order by rt))::int, count(rt)
  from m
  group by grouping sets ((sender, creator_id), (sender), (creator_id), ())
$$;

revoke all on function public.of_chatting(uuid, uuid[], timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.of_chatting(uuid, uuid[], timestamptz, timestamptz) to service_role;

notify pgrst, 'reload schema';

-- the sales, added up in the database (Amsterdam days and hours, Infloww type, refunded or not):
--   'page' per page, for the range (is_now) and the days before; 'day' per day and 'hour' per hour of the day, for the range
drop function if exists public.of_sales_hours(uuid, uuid[], timestamptz, timestamptz);
drop function if exists public.of_sales_summary(uuid, uuid[], timestamptz, timestamptz, timestamptz);
create or replace function public.of_sales_summary(p_org uuid, p_creators uuid[], p_prev_start timestamptz, p_start timestamptz, p_end timestamptz)
returns table (kind text, creator_id uuid, day date, hour integer, type text, undo boolean, is_now boolean, gross numeric, net numeric, sales bigint)
language sql stable
as $$
  with s as (
    select x.creator_id, (x.created_at at time zone 'Europe/Amsterdam') as local, x.type, x.status = 'undo' as undo,
           x.created_at >= p_start as is_now, x.amount, x.net
    from public.infloww_sales x
    where x.organisation_id = p_org and x.created_at >= p_prev_start and x.created_at < p_end and (p_creators is null or x.creator_id = any (p_creators)))
  select 'page', creator_id, null::date, null::integer, type, coalesce(undo, false), is_now, sum(amount), sum(net), count(*) from s group by creator_id, type, undo, is_now
  union all
  select 'day', null, local::date, null, type, coalesce(undo, false), true, sum(amount), sum(net), count(*) from s where is_now group by local::date, type, undo
  union all
  select 'hour', null, null, extract(hour from local)::int, type, coalesce(undo, false), true, sum(amount), sum(net), count(*) from s where is_now group by extract(hour from local)::int, type, undo
$$;

-- paying fans per page and in all, and the credited sales per Infloww employee, between two instants
drop function if exists public.of_sales_people(uuid, uuid[], timestamptz, timestamptz);
create or replace function public.of_sales_people(p_org uuid, p_creators uuid[], p_start timestamptz, p_end timestamptz)
returns table (kind text, key text, gross numeric, net numeric, n bigint)
language sql stable
as $$
  with s as (select * from public.infloww_sales x where x.organisation_id = p_org and x.created_at >= p_start and x.created_at < p_end
             and (p_creators is null or x.creator_id = any (p_creators)) and x.status is distinct from 'undo')
  select 'fans', null, null, null, count(distinct (creator_id, fan_id)) from s where fan_id is not null
  union all
  select 'employee', employee_id::text, sum(amount), sum(net), count(*) from s where employee_id is not null group by employee_id
$$;

revoke all on function public.of_sales_summary(uuid, uuid[], timestamptz, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.of_sales_people(uuid, uuid[], timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.of_sales_summary(uuid, uuid[], timestamptz, timestamptz, timestamptz) to service_role;
grant execute on function public.of_sales_people(uuid, uuid[], timestamptz, timestamptz) to service_role;
notify pgrst, 'reload schema';
