-- The platforms a chatter works on, set in Settings → Chatters (empty: unassigned). Filled once from
-- what they already do: the Shifts rota, OnlyFans chats in the last 60 days, Fansly through the extension.
-- Idempotent: only empty rows are filled.

alter table public.chatters add column if not exists platforms text[] not null default '{}';
alter table public.chatters drop constraint if exists chatters_platforms_check;
alter table public.chatters add constraint chatters_platforms_check check (platforms <@ array['onlyfans', 'fanvue', 'fansly']::text[]);

update public.chatters c set platforms = x.p
from (
  select c2.id, array(select distinct p from unnest(array_cat(array_cat(
      coalesce((select array_agg(coalesce(s.platform, 'onlyfans')) from public.roster_assignments a join public.shifts s on s.id = a.shift_id where a.chatter_id = c2.id and a.is_active), '{}'),
      case when exists (select 1 from public.chatter_daily_metrics m where m.chatter_id = c2.id and m.report_date >= current_date - 60) then array['onlyfans'] else '{}'::text[] end),
      case when exists (select 1 from public.fansly_daily d where d.chatter_id = c2.id) then array['fansly'] else '{}'::text[] end)) p where p is not null order by p) as p
  from public.chatters c2
) x
where x.id = c.id and c.platforms = '{}';
