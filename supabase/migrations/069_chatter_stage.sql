-- A chatter's experience stage, made real: it decides how strict the daily review's tasks are.
--   started_on      the day they started (defaults to when they were added to the tool)
--   stage_override  null: the stage follows started_on (New for 7 days, Learning to day 21, then
--                   Experienced); 'new' | 'learning' | 'experienced': set by a manager, kept until cleared
-- The old colour (chatters.status) never drove anything and is no longer shown. Idempotent.

alter table public.chatters add column if not exists started_on date;
update public.chatters set started_on = created_at::date where started_on is null;
alter table public.chatters alter column started_on set default current_date;

alter table public.chatters add column if not exists stage_override text;
alter table public.chatters drop constraint if exists chatters_stage_override_check;
alter table public.chatters add constraint chatters_stage_override_check check (stage_override in ('new', 'learning', 'experienced'));
