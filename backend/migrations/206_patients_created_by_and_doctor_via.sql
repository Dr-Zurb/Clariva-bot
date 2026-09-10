-- ============================================================================
-- 206_patients_created_by_and_doctor_via.sql
-- ============================================================================
-- Date: 2026-08-23
-- Batch: receptionist-portal (provenance)
-- Description:
--   Distinguish doctor-entered patients from front-desk ones (R10), and stamp
--   the real actor on the row so "who typed this" is not an argument.
--
--   registered_via CHECK gains 'doctor'. created_by is the auth user who
--   created the row (doctor or staff). ON DELETE SET NULL keeps the channel
--   label if the auth user is later removed.
--
--   No backfill. Existing rows stay as they are (NULL created_by; prior
--   registered_via values). No RLS change. Not PHI columns.
--
-- Hard-rules:
--   - Additive column + CHECK widen. No RLS change. Not PHI.
--
-- Rollback (document only):
--   ALTER TABLE patients DROP CONSTRAINT IF EXISTS patients_registered_via_check;
--   ALTER TABLE patients ADD CONSTRAINT patients_registered_via_check
--     CHECK (registered_via IS NULL OR registered_via IN
--       ('bot', 'front_desk', 'booking_for_other', 'import'));
--   DROP INDEX IF EXISTS idx_patients_created_by;
--   ALTER TABLE patients DROP COLUMN IF EXISTS created_by;
-- ============================================================================

ALTER TABLE patients DROP CONSTRAINT IF EXISTS patients_registered_via_check;

ALTER TABLE patients
  ADD CONSTRAINT patients_registered_via_check
  CHECK (
    registered_via IS NULL
    OR registered_via IN ('bot', 'front_desk', 'booking_for_other', 'import', 'doctor')
  );

ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS created_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_patients_created_by
  ON patients (created_by);

COMMENT ON COLUMN patients.registered_via IS
  'How the patient row was created (R10). Not PHI. '
  'Values: bot | front_desk | booking_for_other | import | doctor. '
  'NULL = pre-column / unknown.';

COMMENT ON COLUMN patients.created_by IS
  'Auth user who created the row (doctor or staff). Not PHI. '
  'NULL = pre-column / unknown / auth user deleted.';
