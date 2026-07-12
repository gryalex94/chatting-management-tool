-- Coaching: any chatter-linked task can be saved for a later coaching session.
-- A dedicated column (not context jsonb) so it survives the daily carry-forward,
-- which overwrites context on recurring tasks.
ALTER TABLE review_tasks
  ADD COLUMN IF NOT EXISTS coach_flag boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS coached_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_review_tasks_coach
  ON review_tasks (organisation_id, chatter_id) WHERE coach_flag = true;
