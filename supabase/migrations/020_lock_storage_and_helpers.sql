-- SECURITY follow-up to 019 (from the full-codebase review, 2026-09-23).
--
-- 1. Storage: the "attachments" bucket had two policies that only checked "is
--    signed in" — not which organisation. Supabase Auth also accepts public
--    sign-ups, so any stranger who registers directly with Supabase could read
--    and upload files there. The app never uses Supabase Storage (attachments are
--    stored as links in a table), so the policies are simply removed; with no
--    policy, only the server can touch the bucket.
DROP POLICY IF EXISTS "Authenticated users can upload" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view"   ON storage.objects;

-- 2. The two SECURITY DEFINER helpers used by row-level security run with
--    elevated rights. Pin their search_path (so a lookalike object in another
--    schema can never be picked up) and stop logged-out visitors calling them.
ALTER FUNCTION get_user_org_id() SET search_path = public, pg_temp;
ALTER FUNCTION get_user_role()   SET search_path = public, pg_temp;
REVOKE EXECUTE ON FUNCTION get_user_org_id() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION get_user_role()   FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION get_user_org_id() TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION get_user_role()   TO authenticated, service_role;

-- Verify: expect no rows (no storage policies left on the attachments bucket).
SELECT policyname FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects';
