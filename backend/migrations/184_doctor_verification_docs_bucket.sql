-- ============================================================================
-- 184_doctor_verification_docs_bucket.sql
-- doctor-verification-v1 · ver-02 — private Storage bucket for verification docs.
-- Date:    2026-07-22
-- ============================================================================
-- Purpose:
--   Private Supabase Storage bucket holding a doctor's registration
--   certificate (+ optional government ID). Sensitive personal data (name +
--   license number are visible in the rendered document) — NEVER public.
--
--   Path convention (load-bearing — the upload service ver-03 MUST follow):
--
--       doctor-verification-docs/{doctor_id}/certificate.<ext>
--       doctor-verification-docs/{doctor_id}/gov-id.<ext>
--
--     doctor_id-first prefix lets Storage RLS gate on the first folder
--     segment via `storage.foldername(name)[1] = auth.uid()::text`, exactly
--     like the prescription-pdfs (092) and consultation-transcripts (068)
--     buckets.
--
-- Access model:
--   · Upload   — service-role backend only (mints a short-lived SIGNED UPLOAD
--                URL for the doctor's browser, or streams the file). Doctors
--                do NOT get a Storage INSERT policy — see the guard below.
--   · Read     — the owning doctor (SELECT-own policy, defense-in-depth) and
--                the admin reviewer (via a service-role-minted short-lived
--                SIGNED URL, which bypasses RLS). No public URLs, ever.
--
-- Why no doctor INSERT/UPDATE policy:
--   Mirrors the verification-table guard (183). All writes flow through the
--   service-role backend so the object path recorded on the row is always the
--   canonical `{doctor_id}/...` key the backend chose — a doctor cannot upload
--   under someone else's prefix or overwrite arbitrary objects. Signed upload
--   URLs are themselves service-role-minted and scoped to a single object key.
--
-- Safety:
--   · Additive only — new bucket + new policy; no existing bucket/policy touched.
--   · Bucket INSERT uses ON CONFLICT (id) DO NOTHING (matches 068 / 092).
--   · DROP POLICY IF EXISTS + CREATE POLICY pairs → idempotent re-runs.
--   · Reverse migration documented at the file foot.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Bucket (private)
-- ----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES (
  'doctor-verification-docs',
  'doctor-verification-docs',
  false
)
ON CONFLICT (id) DO NOTHING;

-- File-size limit + MIME whitelist are applied via the Supabase Dashboard or
-- an ops-only query (column presence is Supabase-version-dependent, so this
-- migration stays portable). The upload service (ver-03) ALSO validates
-- type/size before minting the signed URL — this is defense-in-depth:
--   UPDATE storage.buckets
--      SET file_size_limit    = 10485760,   -- 10 MB
--          allowed_mime_types = ARRAY['application/pdf', 'image/jpeg', 'image/png']
--    WHERE id = 'doctor-verification-docs';

-- ----------------------------------------------------------------------------
-- 2. Storage RLS — owner SELECT-own only. No INSERT / UPDATE / DELETE from
--    non-service-role callers (the backend service role handles all writes and
--    bypasses RLS).
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS doctor_verification_docs_select_own ON storage.objects;
CREATE POLICY doctor_verification_docs_select_own
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'doctor-verification-docs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- No INSERT / UPDATE / DELETE policies — only the backend service role writes
-- to this bucket. Service-role calls bypass RLS so no explicit allow policy is
-- needed, and the absence of these policies is the escalation guard.

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- Reverse migration (manual; no automated down-migration tooling):
--
--   DROP POLICY IF EXISTS doctor_verification_docs_select_own ON storage.objects;
--   -- Bucket left in place — drop manually only after confirming zero objects
--   -- remain:
--   --   DELETE FROM storage.buckets WHERE id = 'doctor-verification-docs';
-- ============================================================================
