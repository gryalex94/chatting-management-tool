-- Shifts: part of a shift (overtime). Days off are covered by 4-hour halves from
-- the neighbouring shifts (an EU Prime chatter staying until 06:00, a Middle
-- chatter coming in at 06:00), so a roster row or a one-day change can cover
-- part of a shift. Both times empty = the whole shift.
-- Idempotent, so it is safe to re-run.
alter table public.roster_assignments add column if not exists start_time time;
alter table public.roster_assignments add column if not exists end_time time;
alter table public.roster_changes add column if not exists start_time time;
alter table public.roster_changes add column if not exists end_time time;

-- One-day changes per shift, not per day: someone can be taken off just their
-- overtime, or brought in for a second (overtime) shift. A change with no shift
-- is the whole day off.
alter table public.roster_changes drop constraint if exists roster_changes_organisation_id_date_chatter_id_key;
create unique index if not exists roster_changes_one_per_shift on public.roster_changes
  (organisation_id, date, chatter_id, coalesce(shift_id, '00000000-0000-0000-0000-000000000000'::uuid));
