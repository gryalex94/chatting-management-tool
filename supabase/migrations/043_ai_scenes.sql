-- Sexting scenes for the AI chat (utils/aiChat.js): beats from the agency's ~640
-- sexting sessions (Oct 2026 analysis) in the example library, kind 'scene'. Each
-- beat: its stage (warming, building, peak, after) in `phase`, what her message does
-- (sets the scene, undresses, tells him what to do…) in `situation`, and where she
-- is in the story in the new `setting` column. Idempotent, so it is safe to re-run.

alter table public.ai_examples add column if not exists setting text;
create index if not exists ai_examples_kind on public.ai_examples (organisation_id, kind);

-- Let the API see the change straight away.
notify pgrst, 'reload schema';
