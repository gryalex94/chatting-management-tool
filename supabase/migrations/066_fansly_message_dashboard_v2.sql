-- Fansly Messages dashboard, second version (like Infloww's): each reply with the fan's message
-- before it, filters for the recipient, a price range, purchased and status, numbered pages; and
-- "open this chat in my extension's browser" requests. Idempotent, so it is safe to re-run. Needs 058.

alter table public.fansly_fetch_jobs drop constraint if exists fansly_fetch_jobs_kind_check;
alter table public.fansly_fetch_jobs add constraint fansly_fetch_jobs_kind_check check (kind in ('ledger', 'ledger_all', 'subscribers', 'statistics', 'open_chat'));
alter table public.fansly_fetch_jobs add column if not exists target_user uuid references public.users(id) on delete cascade;   -- open_chat: whose browser opens it

-- (the first version's functions stay: the running server uses them until this version is live)
drop function if exists public.fansly_sent_messages_v2(uuid, uuid, text, timestamptz, timestamptz, text, text, numeric, numeric, text, text, text, int, int);
drop function if exists public.fansly_sent_totals_v2(uuid, uuid, text, timestamptz, timestamptz, text, text, numeric, numeric, text, text, text);

-- the chat messages the team sent (mass messages have their own list), newest first, one page at a time
create or replace function public.fansly_sent_messages_v2(
  p_org uuid, p_account uuid default null, p_chatter text default null,
  p_from timestamptz default null, p_to timestamptz default null,
  p_q text default null, p_fan text default null,
  p_price_min numeric default null, p_price_max numeric default null,
  p_purchased text default 'all',          -- all · yes · no (a PPV not bought) · ppv (any PPV)
  p_status text default 'all',             -- all · sent · unsent
  p_replied text default 'all',            -- all · no (no reply from him yet)
  p_limit int default 50, p_offset int default 0)
returns table (
  account_id uuid, message_id text, group_id text, fan_account_id text, message text, sent_at timestamptz,
  price numeric, sold_at timestamptz, sold_net numeric, read_at timestamptz, chatter_id uuid, attribution text,
  deleted_at timestamptz, prev_fan_text text, prev_fan_at timestamptz, replied_at timestamptz, reply_s integer)
language sql stable
as $$
  select m.account_id, m.message_id, m.group_id, m.fan_account_id, m.text, m.sent_at,
         m.price, m.sold_at, m.sold_net, m.read_at, m.chatter_id, m.attribution, m.deleted_at,
         pf.text, pf.sent_at,
         r.replied_at,
         -- how long after his message this reply went out (only when his message was the last thing before it)
         case when pf.sent_at is not null and pf.sent_at > coalesce(pm.sent_at, '-infinity'::timestamptz) then extract(epoch from (m.sent_at - pf.sent_at))::int end
  from public.fansly_messages m
  join public.fansly_accounts a on a.id = m.account_id and a.organisation_id = p_org
  left join lateral (select f.text, f.sent_at from public.fansly_messages f
                     where f.account_id = m.account_id and f.group_id = m.group_id and f.from_fan and f.sent_at < m.sent_at
                     order by f.sent_at desc limit 1) pf on true
  left join lateral (select c.sent_at from public.fansly_messages c
                     where c.account_id = m.account_id and c.group_id = m.group_id and not c.from_fan and c.type is distinct from 2 and c.sent_at < m.sent_at
                     order by c.sent_at desc limit 1) pm on true
  left join lateral (select min(f.sent_at) as replied_at from public.fansly_messages f
                     where f.account_id = m.account_id and f.group_id = m.group_id and f.from_fan and f.sent_at > m.sent_at) r on true
  where not m.from_fan and m.sent_at is not null and m.type is distinct from 2
    and (p_account is null or m.account_id = p_account)
    and (p_chatter is null or (p_chatter = 'none' and m.chatter_id is null) or m.chatter_id::text = p_chatter)
    and (p_from is null or m.sent_at >= p_from) and (p_to is null or m.sent_at < p_to)
    and (p_q is null or m.text ilike '%' || p_q || '%')
    and (p_fan is null or m.fan_account_id = p_fan)
    and (p_price_min is null or m.price >= p_price_min) and (p_price_max is null or m.price <= p_price_max)
    and (p_purchased = 'all' or (p_purchased = 'yes' and m.sold_at is not null) or (p_purchased = 'no' and m.price > 0 and m.sold_at is null) or (p_purchased = 'ppv' and m.price > 0))
    and (p_status = 'all' or (p_status = 'sent' and m.deleted_at is null) or (p_status = 'unsent' and m.deleted_at is not null))
    and (p_replied = 'all' or (p_replied = 'no' and r.replied_at is null))
  order by m.sent_at desc, m.message_id desc
  limit greatest(coalesce(p_limit, 50), 1) offset greatest(coalesce(p_offset, 0), 0)
$$;

create or replace function public.fansly_sent_totals_v2(
  p_org uuid, p_account uuid default null, p_chatter text default null,
  p_from timestamptz default null, p_to timestamptz default null,
  p_q text default null, p_fan text default null,
  p_price_min numeric default null, p_price_max numeric default null,
  p_purchased text default 'all', p_status text default 'all', p_replied text default 'all')
returns table (messages bigint, fans bigint, ppv_sent bigint, ppv_sold bigint, sold_net numeric, unsent bigint, median_reply_s integer)
language sql stable
as $$
  select count(*), count(distinct x.fan_account_id), count(*) filter (where x.price > 0), count(*) filter (where x.sold_at is not null),
         coalesce(sum(x.sold_net), 0), count(*) filter (where x.deleted_at is not null),
         (percentile_cont(0.5) within group (order by x.reply_s) filter (where x.reply_s <= 259200))::int
  from public.fansly_sent_messages_v2(p_org, p_account, p_chatter, p_from, p_to, p_q, p_fan, p_price_min, p_price_max, p_purchased, p_status, p_replied, 2147483647, 0) x
$$;

revoke all on function public.fansly_sent_messages_v2(uuid, uuid, text, timestamptz, timestamptz, text, text, numeric, numeric, text, text, text, int, int) from public, anon, authenticated;
revoke all on function public.fansly_sent_totals_v2(uuid, uuid, text, timestamptz, timestamptz, text, text, numeric, numeric, text, text, text) from public, anon, authenticated;
grant execute on function public.fansly_sent_messages_v2(uuid, uuid, text, timestamptz, timestamptz, text, text, numeric, numeric, text, text, text, int, int) to service_role;
grant execute on function public.fansly_sent_totals_v2(uuid, uuid, text, timestamptz, timestamptz, text, text, numeric, numeric, text, text, text) to service_role;

notify pgrst, 'reload schema';
