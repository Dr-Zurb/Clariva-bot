-- ============================================================================
-- 191_patient_tags_array.sql
-- ============================================================================
-- Date: 2026-08-07
-- Batch: patients-multi-tag (pmt-01)
-- Description:
--   Adds `patient_tags TEXT[]` for multi-label clinic tags. Backfills from
--   legacy single `patient_tag`. Keeps `patient_tag` for one release (dual-read /
--   dual-write of tags[0]). Not PHI — doctor-set operational labels.
--
-- Not on hard-rules list:
--   - No RLS shape change.
--   - No PHI columns.
--
-- Rollback (document only):
--   DROP INDEX IF EXISTS idx_patients_tags_gin;
--   ALTER TABLE patients DROP COLUMN IF EXISTS patient_tags;
-- ============================================================================

ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS patient_tags TEXT[] NOT NULL DEFAULT '{}';

UPDATE patients
SET patient_tags = ARRAY[btrim(patient_tag)]
WHERE patient_tag IS NOT NULL
  AND btrim(patient_tag) <> ''
  AND (patient_tags IS NULL OR patient_tags = '{}');

CREATE INDEX IF NOT EXISTS idx_patients_tags_gin
  ON patients USING GIN (patient_tags);

COMMENT ON COLUMN patients.patient_tags IS
  'Doctor-set free-text labels (e.g. VIP, Follow-up). Multi-tag; not PHI. Legacy patient_tag mirrors tags[0].';
