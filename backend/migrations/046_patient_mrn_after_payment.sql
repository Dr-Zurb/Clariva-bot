-- ============================================================================
-- Patient MRN: assign only after payment (Option B)
-- ============================================================================
-- Migration: 046_patient_mrn_after_payment.sql
-- Date: 2026-04-14
-- Description:
--   Make medical_record_number nullable and remove the auto-assign DEFAULT.
--   New patients start with NULL MRN; it is assigned on first successful
--   payment via application code (patient-service.assignMrnAfterPayment).
--   Existing patients keep their IDs. The sequence patient_mrn_seq is retained
--   for application-level nextval calls.
-- ============================================================================

-- 1. Drop the DEFAULT so new inserts get NULL instead of auto-P-xxxxx
ALTER TABLE patients ALTER COLUMN medical_record_number DROP DEFAULT;

-- 2. Allow NULLs (existing rows keep their values; new rows start NULL)
ALTER TABLE patients ALTER COLUMN medical_record_number DROP NOT NULL;

-- 3. Atomic MRN assignment function (called from app code after payment)
--    Returns the MRN (new or existing). No-op if already assigned.
CREATE OR REPLACE FUNCTION assign_patient_mrn(p_patient_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  existing TEXT;
  new_mrn  TEXT;
BEGIN
  SELECT medical_record_number INTO existing
    FROM patients WHERE id = p_patient_id;

  IF existing IS NOT NULL THEN
    RETURN existing;
  END IF;

  new_mrn := 'P-' || lpad(nextval('patient_mrn_seq')::text, 5, '0');

  UPDATE patients
     SET medical_record_number = new_mrn,
         updated_at = now()
   WHERE id = p_patient_id
     AND medical_record_number IS NULL;

  RETURN new_mrn;
END;
$$;

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- UNIQUE constraint (patients_medical_record_number_unique) stays: Postgres
-- allows multiple NULLs under UNIQUE, so unpaid patients can coexist.
-- Index idx_patients_medical_record_number stays for lookup performance.
-- Sequence patient_mrn_seq stays for application-level assignment.
-- Function assign_patient_mrn: atomic MRN assignment after payment.
-- ============================================================================
