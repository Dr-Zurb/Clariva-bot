-- ============================================================================
-- Consultation-transcripts Storage bucket (Plan 07 · Task 32)
-- ============================================================================
-- Migration: 068_consultation_transcripts_bucket.sql
-- Date:      2026-04-19
-- Description:
--   Provisions the private Storage bucket where rendered consult-transcript
--   PDFs live. The renderer (`transcript-pdf-service.ts#renderConsultTranscriptPdf`)
--   writes one PDF per session at the canonical path:
--
--       consultation-transcripts/{session_id}/transcript.pdf
--
--   The bucket is a CACHE — the renderer regenerates on demand if missing.
--   Storage cost is negligible (KB-scale per consult). Retention is handled
--   by Plan 02 Task 34's archival worker alongside other consult artifacts.
--
--   Mirrors the `consultation-attachments` bucket shape from migration 051
--   (Plan 04 Task 17) — same folder-segment RLS keyed on `{session_id}`.
--
-- Path convention (load-bearing — `transcript-pdf-service` and its callers
-- MUST follow). Storage RLS keys on the first folder segment via
-- `storage.foldername(name)[1]`.
--
-- RLS:
--   SELECT  — session-participant (doctor or patient) may read. Mirrors the
--             `consultation_transcripts` table's read doctrine. The patient
--             branch is the load-bearing bit: it means a patient with a
--             scoped JWT (Migration 052-style `auth.uid() = patient_id`) can
--             download the cached PDF directly from Storage if their
--             session-scoped JWT were ever forwarded, but in practice the
--             service-role service mints a 15-min signed URL, which
--             bypasses RLS. The SELECT policy is defense-in-depth.
--   INSERT  — none. Only the service-role backend writes to this bucket;
--             direct-from-client writes would undermine the deterministic-
--             render contract.
--   UPDATE / DELETE — none. The bucket is a cache; the renderer overwrites
--             on demand via upload(..., { upsert: true }) which the service
--             role has unconditional access to.
--
-- Safety:
--   · Additive only — no existing bucket modified, no existing policy
--     touched.
--   · Bucket INSERT uses `ON CONFLICT (id) DO NOTHING` (matches migrations
--     027 + 051).
--   · Policy creates are `DROP POLICY IF EXISTS` + `CREATE POLICY` pairs
--     so re-runs are safe.
--   · Reverse migration documented below.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Bucket provisioning
-- ----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES (
  'consultation-transcripts',
  'consultation-transcripts',
  false
)
ON CONFLICT (id) DO NOTHING;

-- File-size limit + MIME whitelist are documented here, applied via the
-- Supabase Dashboard or an ops-only query (the columns' presence depends
-- on the Supabase version and this migration must be portable across
-- minor-version drift):
--   UPDATE storage.buckets
--   SET    file_size_limit    = 52428800,                        -- 50 MB
--          allowed_mime_types = ARRAY['application/pdf']
--   WHERE  id = 'consultation-transcripts';

-- ----------------------------------------------------------------------------
-- 2. Storage RLS — session-participant SELECT only. No INSERT / UPDATE /
--    DELETE from non-service-role callers.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS consultation_transcripts_select_participants
  ON storage.objects;
CREATE POLICY consultation_transcripts_select_participants
  ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'consultation-transcripts'
    AND (
      (storage.foldername(name))[1] IN (
        SELECT id::text FROM consultation_sessions
        WHERE doctor_id = auth.uid()
           OR (patient_id IS NOT NULL AND patient_id = auth.uid())
      )
    )
  );

-- No INSERT / UPDATE / DELETE policies — only the backend service role
-- writes to this bucket. Service-role calls bypass RLS so no explicit
-- allow policy is needed.

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- Reverse migration (manual; no automated down-migration tooling):
--
--   -- 1. Storage RLS
--   DROP POLICY IF EXISTS consultation_transcripts_select_participants
--     ON storage.objects;
--
--   -- 2. Bucket left in place — drop manually only after confirming zero
--   --    objects remain:
--   --      DELETE FROM storage.buckets WHERE id = 'consultation-transcripts';
-- ============================================================================
