-- Fanvue dashboard: who wrote each message, how fast the team replies, which
-- chats are still waiting for a reply, and the top fans by spend.
-- Idempotent, so it is safe to re-run.

-- What a message is: the fan's, the team's own words, written with Fanvue's AI
-- writer ('ai'), sent by itself ('auto': automated and mass messages), or a
-- system note ('other').
create or replace function public.fanvue_kind(p_from_fan boolean, p_type text)
returns text language sql immutable as $$
  select case
    when p_from_fan then 'fan'
    when coalesce(p_type, '') like 'AUTOMATED%' or p_type in ('BROADCAST', 'GHOST_PROMOTION', 'MARKETING_KYC') then 'auto'
    when p_type in ('LOCKED_MESSAGE_UNLOCKED', 'TIP') then 'other'
    when p_type like 'CHAT_TEXT_%' then 'ai'
    else 'team'
  end;
$$;

-- Messages per day (Amsterdam days). team_messages is everything the team sent
-- by hand; ai_messages is the part of it written with Fanvue's AI writer. A mass
-- message counts once; "chats" are chats where the fan or the team wrote.
drop function if exists public.fanvue_daily_messages(uuid, timestamptz);
create function public.fanvue_daily_messages(p_account uuid, p_since timestamptz)
returns table (day date, fan_messages bigint, team_messages bigint, ai_messages bigint, auto_messages bigint, chats bigint, fans_writing bigint)
language sql stable as $$
  with m as (
    select fan_uuid, uuid, (sent_at at time zone 'Europe/Amsterdam')::date as day, public.fanvue_kind(from_fan, type) as kind
    from public.fanvue_messages
    where account_id = p_account and sent_at >= p_since
  )
  select day,
         count(*) filter (where kind = 'fan'),
         count(*) filter (where kind in ('team', 'ai')),
         count(*) filter (where kind = 'ai'),
         count(distinct uuid) filter (where kind = 'auto'),
         count(distinct fan_uuid) filter (where kind in ('fan', 'team', 'ai')),
         count(distinct fan_uuid) filter (where kind = 'fan')
  from m
  group by day
  order by day;
$$;

-- Every wait since p_since: a fan wrote (one or more messages in a row) and the
-- team's next message answered it (replied_at), or nothing has yet (null).
-- Automated and mass messages don't count as answers.
create or replace function public.fanvue_reply_waits(p_account uuid, p_since timestamptz)
returns table (fan_uuid text, asked_at timestamptz, replied_at timestamptz, fan_messages bigint)
language sql stable as $$
  with t as (
    select fan_uuid, sent_at, kind,
           count(*) filter (where kind in ('team', 'ai'))
             over (partition by fan_uuid order by sent_at, (kind = 'fan') desc rows unbounded preceding) as answers
    from (
      select fan_uuid, sent_at, public.fanvue_kind(from_fan, type) as kind
      from public.fanvue_messages
      where account_id = p_account and sent_at >= p_since - interval '3 days'
    ) m
    where kind in ('fan', 'team', 'ai')
  ),
  waits as (
    select fan_uuid, answers as grp, min(sent_at) as asked_at, count(*) as fan_messages
    from t where kind = 'fan' group by fan_uuid, answers
  ),
  replies as (
    select fan_uuid, answers as grp, min(sent_at) as replied_at
    from t where kind in ('team', 'ai') group by fan_uuid, answers
  )
  select w.fan_uuid, w.asked_at, r.replied_at, w.fan_messages
  from waits w
  left join replies r on r.fan_uuid = w.fan_uuid and r.grp = w.grp + 1
  where w.asked_at >= p_since;
$$;

-- How fast the team answers: replies, the typical (median) wait in seconds, the
-- share answered within 5 minutes, and how many chats still wait.
create or replace function public.fanvue_reply_stats(p_account uuid, p_since timestamptz)
returns table (replies bigint, median_seconds double precision, within_5_min double precision, waiting bigint)
language sql stable as $$
  select count(replied_at),
         percentile_cont(0.5) within group (order by extract(epoch from replied_at - asked_at)) filter (where replied_at is not null),
         avg(case when replied_at - asked_at <= interval '5 minutes' then 1.0 else 0.0 end) filter (where replied_at is not null),
         count(*) filter (where replied_at is null)
  from public.fanvue_reply_waits(p_account, p_since);
$$;

-- The chats still waiting for the team, longest wait first.
create or replace function public.fanvue_waiting_chats(p_account uuid, p_since timestamptz)
returns table (fan_uuid text, asked_at timestamptz, fan_messages bigint)
language sql stable as $$
  select fan_uuid, min(asked_at), sum(fan_messages)::bigint
  from public.fanvue_reply_waits(p_account, p_since)
  where replied_at is null
  group by fan_uuid
  order by min(asked_at)
  limit 50;
$$;

-- The fans who spent the most (after Fanvue's cut, refunds counted against),
-- with what they spent since p_since, their last purchase, and when they last
-- wrote themselves (mass messages to them don't count).
drop function if exists public.fanvue_top_fans(uuid, timestamptz, integer);
create function public.fanvue_top_fans(p_account uuid, p_since timestamptz, p_limit integer default 10)
returns table (fan_uuid text, net_cents bigint, recent_net_cents bigint, purchases bigint, last_paid_at timestamptz, last_wrote_at timestamptz)
language sql stable as $$
  select e.fan_uuid, e.net_cents, e.recent_net_cents, e.purchases, e.last_paid_at,
         (select max(m.sent_at) from public.fanvue_messages m
           where m.account_id = p_account and m.fan_uuid = e.fan_uuid and m.from_fan)
  from (
    select fan_uuid,
           coalesce(sum(net_cents), 0) as net_cents,
           coalesce(sum(net_cents) filter (where paid_at >= p_since), 0) as recent_net_cents,
           count(*) filter (where net_cents > 0) as purchases,
           max(paid_at) filter (where net_cents > 0) as last_paid_at
    from public.fanvue_earnings
    where account_id = p_account and fan_uuid is not null
    group by fan_uuid
    order by 2 desc
    limit p_limit
  ) e
  order by e.net_cents desc;
$$;

revoke all on function public.fanvue_kind(boolean, text) from public, anon, authenticated;
revoke all on function public.fanvue_daily_messages(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.fanvue_reply_waits(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.fanvue_reply_stats(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.fanvue_waiting_chats(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.fanvue_top_fans(uuid, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.fanvue_kind(boolean, text) to service_role;
grant execute on function public.fanvue_daily_messages(uuid, timestamptz) to service_role;
grant execute on function public.fanvue_reply_waits(uuid, timestamptz) to service_role;
grant execute on function public.fanvue_reply_stats(uuid, timestamptz) to service_role;
grant execute on function public.fanvue_waiting_chats(uuid, timestamptz) to service_role;
grant execute on function public.fanvue_top_fans(uuid, timestamptz, integer) to service_role;

-- Let the API see the change straight away.
notify pgrst, 'reload schema';
