-- ============================================================================
-- 208_patients_guardian_and_alt_phone.sql
-- ============================================================================
-- Date: 2026-08-23
-- Batch: receptionist-portal (desk identity)
-- Description:
--   Extra identification points for patients who do not carry their own
--   mobile (common at the Indian OPD counter: parent / spouse / neighbour
--   number on a slip). Additive PHI columns. No backfill. No RLS change.
--
--   guardian_name + guardian_relation identify the related person.
--   alt_phone is a second last-10 contact (son / neighbour / old number).
--   address is optional free-text (locality / house hint), not a strong match key.
--
-- Hard-rules:
--   - Additive nullable columns. No RLS change.
--   - PHI: never log these values.
--
-- Rollback (document only):
--   DROP INDEX IF EXISTS idx_patients_alt_phone;
--   ALTER TABLE patients DROP CONSTRAINT IF EXISTS patients_guardian_relation_check;
--   ALTER TABLE patients DROP COLUMN IF EXISTS guardian_name;
--   ALTER TABLE patients DROP COLUMN IF EXISTS guardian_relation;
--   ALTER TABLE patients DROP COLUMN IF EXISTS alt_phone;
--   ALTER TABLE patients DROP COLUMN IF EXISTS address;
-- ============================================================================

ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS guardian_name TEXT NULL;

ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS guardian_relation TEXT NULL;

ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS alt_phone TEXT NULL;

ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS address TEXT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'patients_guardian_relation_check'
  ) THEN
    ALTER TABLE patients
      ADD CONSTRAINT patients_guardian_relation_check
      CHECK (
        guardian_relation IS NULL
        OR guardian_relation IN ('father', 'spouse', 'mother', 'son', 'daughter')
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_patients_alt_phone
  ON patients (alt_phone)
  WHERE alt_phone IS NOT NULL;

COMMENT ON COLUMN patients.guardian_name IS
  'PHI. Father / spouse / other related name used to identify the patient '
  'when they do not have their own mobile. NULL = not collected.';

COMMENT ON COLUMN patients.guardian_relation IS
  'Who guardian_name is to the patient. '
  'Values: father | spouse | mother | son | daughter. NULL = unknown / not collected.';

COMMENT ON COLUMN patients.alt_phone IS
  'PHI. Second contact, last-10 digits when set (son / neighbour / previous number). '
  'NULL = not collected.';

COMMENT ON COLUMN patients.address IS
  'PHI. Optional free-text address / locality for desk identification. '
  'NULL = not collected.';
