-- SECURITY: lock every table against direct public access.
--
-- The browser ships Supabase's public ("anon") key — that's normal and required
-- for login. But any table WITHOUT row-level security is then readable by anyone
-- holding that key, logged in or not. Verified 2026-09-23 with a logged-out probe:
--   subscriber_sales     33,509 rows readable  (fan usernames + spend history)
--   review_tasks          1,987 rows readable  (fan usernames + quoted messages)
--   chatter_evaluations     830 rows readable  (full AI reviews of dialogues)
--   daily_reviews, daily_check_config           readable
--
-- The app never reads tables from the browser: the client uses Supabase only for
-- login, and the server uses the service-role key, which bypasses RLS by design.
-- So enabling RLS (with no new policies) closes the hole and changes nothing for
-- the app. Tables that already have RLS and policies are left as they are.
DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND rowsecurity = false
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
    RAISE NOTICE 'RLS enabled on %', t.tablename;
  END LOOP;
END $$;

-- Task templates with no organisation are "shared": the server now refuses to let
-- any single organisation edit or delete them (otherwise one tenant could change a
-- template every tenant sees). All existing templates were created by our own
-- organisation, so claim them — this only runs while exactly one organisation
-- exists, and leaves templates alone otherwise.
UPDATE task_templates
SET organisation_id = (SELECT id FROM organisations LIMIT 1)
WHERE organisation_id IS NULL
  AND (SELECT count(*) FROM organisations) = 1;

-- Verify: every row below should say true.
SELECT tablename, rowsecurity AS rls_enabled
FROM pg_tables WHERE schemaname = 'public' ORDER BY rowsecurity, tablename;
