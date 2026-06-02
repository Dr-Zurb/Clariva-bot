-- ============================================================================
-- Prescription PDFs Storage Bucket (EHR Sub-batch B2 / T3.15)
-- ============================================================================
-- Migration: 092_prescription_pdfs_bucket.sql
-- Date:      2026-05-04
-- Description:
--   Private storage bucket for generated prescription PDFs. PHI-bearing
--   (diagnosis, drug names, patient identifiers in the rendered PDF).
--   Read access ONLY via signed URLs minted by:
--     - the doctor's own dashboard (read-back of their just-rendered Rx)
--     - the patient share-link surface T3.16 (HMAC token gate validates
--       the token THEN mints a fresh signed URL on every visit)
--     - the send pipeline T3.17 (mints a signed URL to embed in the
--       email/IG-DM)
--
--   Path convention: `<doctor_id>/<prescription_id>.pdf`
--     - doctor_id-first prefix lets us slap on a "doctors can read their
--       own folder" RLS policy on `storage.objects` in one statement.
--     - One file per prescription_id (overwrite-on-regen per Decision
--       T3-D2; we never accumulate per-version artefacts).
--
--   We do NOT mirror the prescription-attachments bucket's PDF
--   constraint via DB CHECK — Storage bucket constraints (allowed
--   mime, size limit) are managed via the Supabase Dashboard /
--   storage.buckets columns where supported, not via SQL CHECK.
-- ============================================================================

-- ============================================================================
-- 1. BUCKET (idempotent)
-- ============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES (
  'prescription-pdfs',
  'prescription-pdfs',
  false
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 2. RLS — doctors read their own folder
-- ============================================================================
-- Mirrors the prescription-attachments RLS pattern (migration 027 +
-- the storage policies created via Dashboard for that bucket). The
-- service role bypasses RLS, so the send pipeline + the patient share
-- route both keep working without policy churn here.
--
-- Path layout enforced by the service: `<doctor_id>/<prescription_id>.pdf`.
-- The first path segment IS `auth.uid()` for the doctor — that's the
-- gate.
--
-- We also add an INSERT policy so the (rare) case where a doctor
-- triggers regen via a future user-scoped client doesn't 403; for now
-- only the service role uploads, so this is forward-compat.
-- ============================================================================

DROP POLICY IF EXISTS prescription_pdfs_select_own ON storage.objects;
CREATE POLICY prescription_pdfs_select_own
ON storage.objects FOR SELECT
USING (
  bucket_id = 'prescription-pdfs'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS prescription_pdfs_insert_own ON storage.objects;
CREATE POLICY prescription_pdfs_insert_own
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'prescription-pdfs'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS prescription_pdfs_update_own ON storage.objects;
CREATE POLICY prescription_pdfs_update_own
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'prescription-pdfs'
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'prescription-pdfs'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS prescription_pdfs_delete_own ON storage.objects;
CREATE POLICY prescription_pdfs_delete_own
ON storage.objects FOR DELETE
USING (
  bucket_id = 'prescription-pdfs'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- Optional follow-up via Dashboard:
--   UPDATE storage.buckets
--      SET file_size_limit    = 5242880,             -- 5 MB hard cap
--          allowed_mime_types = ARRAY['application/pdf']
--    WHERE id = 'prescription-pdfs';
-- ============================================================================
