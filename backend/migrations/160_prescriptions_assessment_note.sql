-- ============================================================================
-- Prescriptions clinical-impression note + visit acuity
-- ============================================================================
-- Migration: 160_prescriptions_assessment_note.sql
-- Date:      2026-07-09
-- Batch:     assessment-tab (Wave 2) — task asmt-02
-- Description:
--   Additive nullable Assessment columns on `prescriptions`:
--     assessment_note   TEXT   free-text clinical-impression / reasoning note
--     assessment_acuity TEXT   visit-level trajectory: improving|stable|worsening
--   Both are NULLABLE (NULL = "not recorded"); a mid-call draft with only CC + Dx
--   still saves (ASMT-D3). The acuity column is constrained to the three allowed
--   values via a named CHECK OR'd with `IS NULL` so existing rows trivially
--   satisfy it and the vocabulary can be revised later safely. Mirrors the
--   scalar-column-add pattern from migration 151.
--
--   PRIVACY (ASMT-D5): the impression note + acuity are clinician-only in v1.
--   They are NOT rendered on the patient PDF / SMS / notification output — the
--   privacy precedent is `clinical_notes` (present in the form, absent from
--   patient-facing readers).
--
-- PHI:
--   Both new columns carry PHI (clinical reasoning + trajectory). RLS on
--   `prescriptions` already covers all columns (doctor-only access via
--   `auth.uid() = doctor_id`, established in migration 026). This migration does
--   NOT modify RLS policies. 7-year retention applies per COMPLIANCE;
--   account-deletion cascade already covers `prescriptions`.
--
-- Idempotency:
--   - `ADD COLUMN IF NOT EXISTS` (Postgres 9.6+).
--   - Named CHECK follows the migration-151 pattern: `DROP CONSTRAINT IF EXISTS`
--     → `ADD CONSTRAINT` (Postgres has no `ADD CONSTRAINT IF NOT EXISTS`), so
--     re-running is a no-op and the allowed-value vocabulary can be revised.
--
-- Rollback (NOT shipped as a separate migration — documented only):
--   ALTER TABLE prescriptions
--     DROP CONSTRAINT IF EXISTS prescriptions_assessment_acuity_chk,
--     DROP COLUMN IF EXISTS assessment_note,
--     DROP COLUMN IF EXISTS assessment_acuity;
-- ============================================================================

ALTER TABLE prescriptions
  ADD COLUMN IF NOT EXISTS assessment_note   TEXT NULL,
  ADD COLUMN IF NOT EXISTS assessment_acuity TEXT NULL;

ALTER TABLE prescriptions
  DROP CONSTRAINT IF EXISTS prescriptions_assessment_acuity_chk;
ALTER TABLE prescriptions
  ADD CONSTRAINT prescriptions_assessment_acuity_chk
  CHECK (
    assessment_acuity IS NULL
    OR assessment_acuity IN ('improving', 'stable', 'worsening')
  );

COMMENT ON COLUMN prescriptions.assessment_note IS
  'PHI: free-text clinical-impression / reasoning note. Clinician-only (ASMT-D5): NOT rendered on patient PDF/SMS/notification. assessment-tab / asmt-02.';
COMMENT ON COLUMN prescriptions.assessment_acuity IS
  'PHI: visit-level trajectory improving|stable|worsening. Clinician-only (ASMT-D5): NOT rendered on patient PDF/SMS/notification. assessment-tab / asmt-02.';

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- RLS unchanged: doctor-only access via `auth.uid() = doctor_id` (migration 026)
--                covers both new columns.
-- PHI: both added columns carry PHI; 7-year retention applies per COMPLIANCE.
-- Additive only: existing prescriptions validate + hydrate unchanged (NULL cols).
-- Privacy (ASMT-D5): neither column feeds the patient-facing PDF/SMS/notification.
-- No new indexes: no query pattern filters on the new columns.
-- ============================================================================
