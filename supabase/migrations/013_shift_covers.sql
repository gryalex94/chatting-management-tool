-- Recurring shift covers on the fixed weekly schedule.
--
-- The weekly roster is a fixed template that repeats. Every person in a shift slot
-- is one of two kinds:
--   • Regular  → day_of_week IS NULL and cover_hours IS NULL. The standing person;
--               shown every day, greyed on their own days off (that is where holes
--               appear).
--   • Cover    → day_of_week + cover_hours both set. Shown ONLY on that weekday,
--               tagged with its hours. The recurring filler for a known hole — a
--               big page's rotating chatter, or someone covering a teammate's
--               weekly day off. Repeats every week, no dates involved.
--
-- Idempotent so it is safe to re-run.

ALTER TABLE chatter_creator_assignments
  ADD COLUMN IF NOT EXISTS day_of_week INT CHECK (day_of_week BETWEEN 1 AND 7);

ALTER TABLE chatter_creator_assignments
  ADD COLUMN IF NOT EXISTS cover_hours NUMERIC(4,1);
