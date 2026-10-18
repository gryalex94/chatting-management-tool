-- Fanvue: a mass message has one id for every fan who received it, so a message
-- is kept once per chat (account, fan, message): each fan's history then shows
-- the mass messages he got. In the daily numbers a mass message counts once,
-- and "chats" means chats with a real conversation (the fan or the team wrote).
-- Idempotent, so it is safe to re-run.

alter table public.fanvue_messages drop constraint if exists fanvue_messages_pkey;
alter table public.fanvue_messages add constraint fanvue_messages_pkey primary key (account_id, fan_uuid, uuid);
create index if not exists fanvue_messages_message on public.fanvue_messages (account_id, uuid);

create or replace function public.fanvue_daily_messages(p_account uuid, p_since timestamptz)
returns table (day date, fan_messages bigint, team_messages bigint, auto_messages bigint, chats bigint, fans_writing bigint)
language sql stable as $$
  with m as (
    select fan_uuid, uuid, from_fan, (sent_at at time zone 'Europe/Amsterdam')::date as day,
           (not from_fan and (type like 'AUTOMATED%' or type in ('BROADCAST', 'GHOST_PROMOTION', 'MARKETING_KYC'))) as auto,
           (not from_fan and coalesce(type, '') not in ('BROADCAST', 'GHOST_PROMOTION', 'MARKETING_KYC', 'LOCKED_MESSAGE_UNLOCKED', 'TIP')
                          and coalesce(type, '') not like 'AUTOMATED%') as team
    from public.fanvue_messages
    where account_id = p_account and sent_at >= p_since
  )
  select day,
         count(*) filter (where from_fan),
         count(*) filter (where team),
         count(distinct uuid) filter (where auto),
         count(distinct fan_uuid) filter (where from_fan or team),
         count(distinct fan_uuid) filter (where from_fan)
  from m
  group by day
  order by day;
$$;

revoke all on function public.fanvue_daily_messages(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.fanvue_daily_messages(uuid, timestamptz) to service_role;

-- Let the API see the change straight away.
notify pgrst, 'reload schema';
