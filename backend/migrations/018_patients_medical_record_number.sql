-- ============================================================================
-- Patients Medical Record Number (MRN) - Patient Identity & Matching
-- ============================================================================
-- Migration: 018_patients_medical_record_number.sql
-- Date: 2026-03-27
-- Description:
--   Add medical_record_number (human-readable Patient ID) to patients table.
--   Format: P-00001, P-00002, etc. Used as optional shortcut for repeat patients.
--   Primary identification remains phone search + confirm.
-- ============================================================================

-- 1. Create sequence for MRN generation
CREATE SEQUENCE IF NOT EXISTS patient_mrn_seq START 1;

-- 2. Add column (nullable initially for backfill)
ALTER TABLE patients ADD COLUMN IF NOT EXISTS medical_record_number TEXT;
COMMENT ON COLUMN patients.medical_record_number IS 'Human-readable Patient ID (e.g. P-00001). Optional shortcut for repeat bookings.';

-- 3. Backfill existing patients (ordered by created_at)
WITH numbered AS (
  SELECT id, row_number() OVER (ORDER BY created_at) AS rn
  FROM patients
  WHERE medical_record_number IS NULL
)
UPDATE patients p
SET medical_record_number = 'P-' || lpad(n.rn::text, 5, '0')
FROM numbered n
WHERE p.id = n.id;

-- 4. Set sequence to max+1 so new patients get correct next value
SELECT setval(
  'patient_mrn_seq',
  COALESCE(
    (SELECT max(CAST(SUBSTRING(medical_record_number FROM 4) AS INTEGER)) FROM patients WHERE medical_record_number ~ '^P-[0-9]+$'),
    0
  ) + 1
);

-- 5. Add UNIQUE constraint and NOT NULL (backfill ensures no NULLs)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'patients_medical_record_number_unique'
  ) THEN
    ALTER TABLE patients ADD CONSTRAINT patients_medical_record_number_unique UNIQUE (medical_record_number);
  END IF;
END $$;
ALTER TABLE patients ALTER COLUMN medical_record_number SET NOT NULL;

-- 6. Set default for new inserts (evaluated at INSERT time)
ALTER TABLE patients ALTER COLUMN medical_record_number SET DEFAULT ('P-' || lpad(nextval('patient_mrn_seq')::text, 5, '0'));

-- 7. Index for lookups
CREATE INDEX IF NOT EXISTS idx_patients_medical_record_number ON patients(medical_record_number);

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- Note: Default uses nextval so each new INSERT gets next MRN. Backfilled rows
-- already have values. Sequence was set to max+1 to avoid collisions.
-- ============================================================================
