-- The Messages dashboard and the Scripts library on every platform (OnlyFans, Fanvue, as on Fansly).
-- Idempotent, so it is safe to re-run. Needs 055 (scripts), 030 (Fanvue), 067.

-- Scripts: one library per platform; on OnlyFans and Fanvue a script can belong to one page (creators.id)
alter table public.fansly_scripts add column if not exists platform text not null default 'fansly';
alter table public.fansly_scripts drop constraint if exists fansly_scripts_platform_check;
alter table public.fansly_scripts add constraint fansly_scripts_platform_check check (platform in ('fansly', 'onlyfans', 'fanvue'));
alter table public.fansly_scripts add column if not exists creator_id uuid references public.creators(id) on delete cascade;
create index if not exists fansly_scripts_platform on public.fansly_scripts (organisation_id, platform, stage, position);

-- ---------- OnlyFans: the uploaded chat exports (messages) ----------
drop function if exists public.of_sent_messages(uuid, uuid[], text, timestamptz, timestamptz, text, text, numeric, numeric, text, text, int, int);
create or replace function public.of_sent_messages(
  p_org uuid, p_creators uuid[], p_sender text, p_start timestamptz, p_end timestamptz, p_q text, p_fan text,
  p_price_min numeric, p_price_max numeric, p_purchased text, p_status text, p_limit int default 50, p_offset int default 0)
returns table (id uuid, creator_id uuid, sender_name text, fan_message_text text, creator_message_text text, sent_datetime timestamptz,
  replay_time_seconds integer, price numeric, purchased boolean, status text, sent_to_username text, sent_to_nickname text)
language sql stable
as $$
  select m.id, m.creator_id, m.sender_name, m.fan_message_text, m.creator_message_text, m.sent_datetime,
         m.replay_time_seconds, m.price, m.purchased, m.status, m.sent_to_username, m.sent_to_nickname
  from public.messages m
  where m.organisation_id = p_org and m.sent_datetime >= p_start and m.sent_datetime < p_end
    and nullif(trim(m.creator_message_text), '') is not null
    and (p_creators is null or m.creator_id = any (p_creators))
    and (p_sender is null or lower(trim(m.sender_name)) = lower(p_sender))
    and (p_q is null or m.creator_message_text ilike '%' || p_q || '%' or m.fan_message_text ilike '%' || p_q || '%')
    and (p_fan is null or m.sent_to_username = p_fan)
    and (p_price_min is null or m.price >= p_price_min) and (p_price_max is null or m.price <= p_price_max)
    and (p_purchased = 'all' or (p_purchased = 'yes' and m.purchased) or (p_purchased = 'no' and m.price > 0 and not coalesce(m.purchased, false)) or (p_purchased = 'ppv' and m.price > 0))
    and (p_status = 'all' or (p_status = 'sent' and m.status is distinct from 'Unsent') or (p_status = 'unsent' and m.status = 'Unsent'))
  order by m.sent_datetime desc, m.id desc
  limit greatest(coalesce(p_limit, 50), 1) offset greatest(coalesce(p_offset, 0), 0)
$$;

drop function if exists public.of_sent_totals(uuid, uuid[], text, timestamptz, timestamptz, text, text, numeric, numeric, text, text);
create or replace function public.of_sent_totals(
  p_org uuid, p_creators uuid[], p_sender text, p_start timestamptz, p_end timestamptz, p_q text, p_fan text,
  p_price_min numeric, p_price_max numeric, p_purchased text, p_status text)
returns table (messages bigint, fans bigint, ppv_sent bigint, ppv_sold bigint, sold_net numeric, unsent bigint, median_reply_s integer)
language sql stable
as $$
  select count(*), count(distinct x.sent_to_username), count(*) filter (where x.price > 0), count(*) filter (where x.price > 0 and x.purchased),
         coalesce(sum(x.price) filter (where x.price > 0 and x.purchased), 0), count(*) filter (where x.status = 'Unsent'),
         (percentile_cont(0.5) within group (order by x.replay_time_seconds) filter (where nullif(trim(x.fan_message_text), '') is not null and x.replay_time_seconds > 0 and x.replay_time_seconds < 7200))::int
  from public.of_sent_messages(p_org, p_creators, p_sender, p_start, p_end, p_q, p_fan, p_price_min, p_price_max, p_purchased, p_status, 2147483647, 0) x
$$;

-- ---------- Fanvue: the copied chats (fanvue_messages, fanvue_media, fanvue_earnings) ----------
drop function if exists public.fanvue_sent_messages(uuid, uuid[], timestamptz, timestamptz, text, text, numeric, numeric, text, text, text, int, int);
create or replace function public.fanvue_sent_messages(
  p_org uuid, p_accounts uuid[], p_start timestamptz, p_end timestamptz, p_q text, p_fan text,
  p_price_min numeric, p_price_max numeric, p_purchased text, p_status text, p_replied text, p_limit int default 50, p_offset int default 0)
returns table (account_id uuid, uuid text, fan_uuid text, type text, status text, text text, sent_at timestamptz,
  price numeric, bought boolean, sold_net numeric, prev_fan_text text, prev_fan_at timestamptz, replied_at timestamptz, reply_s integer)
language sql stable
as $$
  with m as (
    select x.*, (select sum(md.price_cents) / 100.0 from public.fanvue_media md where md.account_id = x.account_id and md.message_uuid = x.uuid and not md.from_fan and md.price_cents > 0) as price,
           exists (select 1 from public.fanvue_media md where md.account_id = x.account_id and md.message_uuid = x.uuid and md.purchased_at is not null and md.price_cents > 0) as bought
    from public.fanvue_messages x
    join public.fanvue_accounts a on a.id = x.account_id and a.organisation_id = p_org
    where not x.from_fan and x.type in ('SINGLE_RECIPIENT', 'CHAT_TEXT_GENERATION', 'CHAT_TEXT_REPLY', 'CHAT_TEXT_REWRITE')
      and x.sent_at >= p_start and x.sent_at < p_end and (p_accounts is null or x.account_id = any (p_accounts))
      and (p_q is null or x.text ilike '%' || p_q || '%') and (p_fan is null or x.fan_uuid = p_fan)
      and (p_status = 'all' or (p_status = 'sent' and x.status is distinct from 'UNSENT') or (p_status = 'unsent' and x.status = 'UNSENT')))
  select m.account_id, m.uuid, m.fan_uuid, m.type, m.status, m.text, m.sent_at, m.price, m.bought,
         (select sum(e.net_cents) / 100.0 from public.fanvue_earnings e where e.account_id = m.account_id and e.message_uuid = m.uuid and e.source = 'message'),
         pf.text, pf.sent_at, r.replied_at,
         case when pf.sent_at is not null and pf.sent_at > coalesce(pm.sent_at, '-infinity'::timestamptz) then extract(epoch from (m.sent_at - pf.sent_at))::int end
  from m
  left join lateral (select f.text, f.sent_at from public.fanvue_messages f where f.account_id = m.account_id and f.fan_uuid = m.fan_uuid and f.from_fan and f.sent_at < m.sent_at order by f.sent_at desc limit 1) pf on true
  left join lateral (select c.sent_at from public.fanvue_messages c where c.account_id = m.account_id and c.fan_uuid = m.fan_uuid and not c.from_fan and c.type <> 'BROADCAST' and c.sent_at < m.sent_at order by c.sent_at desc limit 1) pm on true
  left join lateral (select min(f.sent_at) as replied_at from public.fanvue_messages f where f.account_id = m.account_id and f.fan_uuid = m.fan_uuid and f.from_fan and f.sent_at > m.sent_at) r on true
  where (p_price_min is null or m.price >= p_price_min) and (p_price_max is null or m.price <= p_price_max)
    and (p_purchased = 'all' or (p_purchased = 'yes' and m.bought) or (p_purchased = 'no' and m.price > 0 and not m.bought) or (p_purchased = 'ppv' and m.price > 0))
    and (p_replied = 'all' or (p_replied = 'no' and r.replied_at is null))
  order by m.sent_at desc, m.uuid desc
  limit greatest(coalesce(p_limit, 50), 1) offset greatest(coalesce(p_offset, 0), 0)
$$;

drop function if exists public.fanvue_sent_totals(uuid, uuid[], timestamptz, timestamptz, text, text, numeric, numeric, text, text, text);
create or replace function public.fanvue_sent_totals(
  p_org uuid, p_accounts uuid[], p_start timestamptz, p_end timestamptz, p_q text, p_fan text,
  p_price_min numeric, p_price_max numeric, p_purchased text, p_status text, p_replied text)
returns table (messages bigint, fans bigint, ppv_sent bigint, ppv_sold bigint, sold_net numeric, unsent bigint, median_reply_s integer)
language sql stable
as $$
  select count(*), count(distinct x.fan_uuid), count(*) filter (where x.price > 0), count(*) filter (where x.bought),
         coalesce(sum(x.sold_net), 0), count(*) filter (where x.status = 'UNSENT'),
         (percentile_cont(0.5) within group (order by x.reply_s) filter (where x.reply_s <= 259200))::int
  from public.fanvue_sent_messages(p_org, p_accounts, p_start, p_end, p_q, p_fan, p_price_min, p_price_max, p_purchased, p_status, p_replied, 2147483647, 0) x
$$;

create index if not exists fanvue_messages_fan_time on public.fanvue_messages (account_id, fan_uuid, sent_at);
create index if not exists fanvue_media_message on public.fanvue_media (account_id, message_uuid);
create index if not exists fanvue_earnings_message on public.fanvue_earnings (account_id, message_uuid);

revoke all on function public.of_sent_messages(uuid, uuid[], text, timestamptz, timestamptz, text, text, numeric, numeric, text, text, int, int) from public, anon, authenticated;
revoke all on function public.of_sent_totals(uuid, uuid[], text, timestamptz, timestamptz, text, text, numeric, numeric, text, text) from public, anon, authenticated;
revoke all on function public.fanvue_sent_messages(uuid, uuid[], timestamptz, timestamptz, text, text, numeric, numeric, text, text, text, int, int) from public, anon, authenticated;
revoke all on function public.fanvue_sent_totals(uuid, uuid[], timestamptz, timestamptz, text, text, numeric, numeric, text, text, text) from public, anon, authenticated;
grant execute on function public.of_sent_messages(uuid, uuid[], text, timestamptz, timestamptz, text, text, numeric, numeric, text, text, int, int) to service_role;
grant execute on function public.of_sent_totals(uuid, uuid[], text, timestamptz, timestamptz, text, text, numeric, numeric, text, text) to service_role;
grant execute on function public.fanvue_sent_messages(uuid, uuid[], timestamptz, timestamptz, text, text, numeric, numeric, text, text, text, int, int) to service_role;
grant execute on function public.fanvue_sent_totals(uuid, uuid[], timestamptz, timestamptz, text, text, numeric, numeric, text, text, text) to service_role;

notify pgrst, 'reload schema';
