-- ============================================================================
-- 209_patients_archived_at.sql
-- ============================================================================
-- Date: 2026-08-23
-- Batch: receptionist-portal (desk archive — hide, not delete)
-- Description:
--   Soft-hide for front-desk search. The row stays. Restore clears both
--   columns. No backfill. No RLS change.
--
--   archived_at is a timestamp stamp, not PHI.
--   archived_by is the auth user who archived (not PHI).
--
-- Hard-rules:
--   - Additive nullable columns. No RLS change.
--   - Never log patient name / phone / DOB with this stamp.
--
-- Rollback (document only):
--   DROP INDEX IF EXISTS idx_patients_doctor_archived;
--   ALTER TABLE patients DROP COLUMN IF EXISTS archived_at;
--   ALTER TABLE patients DROP COLUMN IF EXISTS archived_by;
-- ============================================================================

ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ NULL;

ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS archived_by UUID NULL;

CREATE INDEX IF NOT EXISTS idx_patients_doctor_archived
  ON patients (doctor_id)
  WHERE archived_at IS NOT NULL;

COMMENT ON COLUMN patients.archived_at IS
  'NOT PHI. When set, Check-in / Patients list hide this row unless '
  'includeArchived=true. Restore = set archived_at and archived_by NULL.';

COMMENT ON COLUMN patients.archived_by IS
  'NOT PHI. Auth user who archived the row. NULL when not archived.';
