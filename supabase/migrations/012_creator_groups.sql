-- Creator page "teams" (non-destructive grouping).
--
-- A page that belongs to another page's team carries merged_into = that team's
-- primary page id. It stays ACTIVE and keeps its own name, stats and messages —
-- grouping is purely a Shifts-view relationship, so uploads always land on the
-- real page and nothing ever respawns as a duplicate.
--
-- These columns were previously added ad-hoc to the live DB; this migration makes
-- them reproducible. Idempotent so it is safe to re-run.

ALTER TABLE creators ADD COLUMN IF NOT EXISTS merged_into UUID REFERENCES creators(id);
ALTER TABLE creators ADD COLUMN IF NOT EXISTS merged_at TIMESTAMPTZ;

-- Fast lookup of a team's member pages.
CREATE INDEX IF NOT EXISTS idx_creators_merged_into ON creators(merged_into);
