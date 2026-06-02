-- Diagnostic-only — NOT a migration. Paste this into the Supabase
-- dashboard SQL editor and share the result. Tells us:
--   1. Which RLS policies are currently in force on consultation_messages
--      (so we can verify migration 078 took effect).
--   2. Which policies are currently in force on consultation_sessions
--      (the table referenced by the doctor branch's EXISTS subquery).
--   3. Forces PostgREST to reload its schema cache, in case the cache
--      is still serving the pre-078 plan.

-- 1. Show current policies on consultation_messages.
SELECT schemaname, tablename, policyname, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'consultation_messages'
ORDER BY policyname;

-- 2. Show current policies on consultation_sessions.
SELECT schemaname, tablename, policyname, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'consultation_sessions'
ORDER BY policyname;

-- 3. Storage policies for consultation-attachments (sanity check).
SELECT schemaname, tablename, policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects'
  AND policyname LIKE 'consultation_attachments%'
ORDER BY policyname;

-- 4. Force PostgREST to reload its schema cache. Without this, the API
--    layer can keep serving the pre-78 plan even though pg_policies
--    shows the new one — manifesting as "I migrated but the error is
--    identical".
NOTIFY pgrst, 'reload schema';
