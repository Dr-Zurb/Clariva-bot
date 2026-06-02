-- ============================================================================
-- 104_patients_tags.sql
-- ============================================================================
-- Date: 2026-05-18
-- Batch: patients-redesign (Phase 1) — task pr-02
-- Description:
--   Adds free-text `patient_tag` column to the `patients` table for the
--   "untagged" segment filter (DL-4) and the bulk-tag action (DL-11).
--   The tag is a clinic-internal label set by the doctor — no PHI.
--
-- Not on hard-rules list:
--   - No RLS shape change (the existing patients RLS predicate covers all columns).
--   - No PHI added (a tag like "VIP" or "Follow-up needed" is not patient health data).
--
-- Rollback (NOT shipped as a separate migration this batch — documenting only):
--   DROP INDEX IF EXISTS idx_patients_tag_lower;
--   ALTER TABLE patients DROP COLUMN IF EXISTS patient_tag;
-- ============================================================================

ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS patient_tag TEXT;

-- Index for `?segment=untagged` and future tag lookups (patients are not doctor-scoped).
CREATE INDEX IF NOT EXISTS idx_patients_tag_lower
  ON patients (LOWER(patient_tag))
  WHERE patient_tag IS NOT NULL;

COMMENT ON COLUMN patients.patient_tag IS
  'Doctor-set free-text label (e.g. "VIP", "Follow-up needed"). Not PHI.';
