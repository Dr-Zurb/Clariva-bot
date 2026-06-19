-- ============================================================================
-- Patient Medications (Subjective tab restructure / Phase 1)
-- ============================================================================
-- Migration: 128_patient_medications.sql
-- Date:      2026-06-10
-- Description:
--   Chart-level, doctor-scoped medication list backing the new "Medications"
--   section in the Subjective tab (current/ongoing + past/stopped). Mirrors the
--   migration 087 patient_chronic_conditions pattern exactly:
--     - patient-level (NOT visit-level) data
--     - doctor-scoped (each row carries doctor_id; RLS keys on
--       auth.uid() = doctor_id)
--     - soft-deletable via archived_at (the standard list query filters
--       WHERE archived_at IS NULL)
--     - partial index on (doctor_id, patient_id) WHERE archived_at IS NULL
--
--   The `status` column splits the single store into the two UI views:
--     - 'active' → current / ongoing medications
--     - 'past'   → discontinued / historical medications
--
--   Free-text drug_name in V1 (consistent with patient_allergies / conditions);
--   drug_master canonicalization is deferred.
--
--   PHI: medication names, doses, notes. Doctor-only access.
-- ============================================================================

-- ============================================================================
-- 1. TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS patient_medications (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doctor_id     UUID NOT NULL REFERENCES auth.users(id)   ON DELETE CASCADE,
    patient_id    UUID NOT NULL REFERENCES patients(id)     ON DELETE CASCADE,
    drug_name     TEXT NOT NULL,
    dose          TEXT NULL,
    frequency     TEXT NULL,
    status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'past')),
    started_on    DATE NULL,
    stopped_on    DATE NULL,
    note          TEXT NULL,
    archived_at   TIMESTAMPTZ NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  patient_medications             IS 'Patient medication list, doctor-scoped. PHI. Soft-deletable via archived_at.';
COMMENT ON COLUMN patient_medications.drug_name   IS 'Free-text drug name (e.g. "Metformin"). V1 — drug_master canonicalization deferred.';
COMMENT ON COLUMN patient_medications.dose        IS 'Free-text dose (e.g. "500 mg").';
COMMENT ON COLUMN patient_medications.frequency   IS 'Free-text frequency (e.g. "BD", "OD", "1-0-1").';
COMMENT ON COLUMN patient_medications.status      IS 'active = current/ongoing; past = discontinued/historical. Drives the two UI views.';
COMMENT ON COLUMN patient_medications.started_on  IS 'Approx start date if known.';
COMMENT ON COLUMN patient_medications.stopped_on  IS 'Approx stop date (past medications) if known.';
COMMENT ON COLUMN patient_medications.archived_at IS 'Soft delete. Standard list query filters WHERE archived_at IS NULL.';

-- ============================================================================
-- 2. INDEX (chart-panel hot path — partial; only non-archived rows)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_patient_medications_chart_lookup
  ON patient_medications (doctor_id, patient_id)
  WHERE archived_at IS NULL;

-- ============================================================================
-- 3. TRIGGER (updated_at maintenance; function lives in 001)
-- ============================================================================

DROP TRIGGER IF EXISTS update_patient_medications_updated_at ON patient_medications;
CREATE TRIGGER update_patient_medications_updated_at
    BEFORE UPDATE ON patient_medications
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 4. ROW LEVEL SECURITY (mirrors migration 087 shape exactly)
-- ============================================================================

ALTER TABLE patient_medications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own patient medications"   ON patient_medications;
DROP POLICY IF EXISTS "Users can insert own patient medications" ON patient_medications;
DROP POLICY IF EXISTS "Users can update own patient medications" ON patient_medications;
DROP POLICY IF EXISTS "Users can delete own patient medications" ON patient_medications;

CREATE POLICY "Users can read own patient medications"
ON patient_medications FOR SELECT
USING (auth.uid() = doctor_id);

CREATE POLICY "Users can insert own patient medications"
ON patient_medications FOR INSERT
WITH CHECK (auth.uid() = doctor_id);

CREATE POLICY "Users can update own patient medications"
ON patient_medications FOR UPDATE
USING (auth.uid() = doctor_id)
WITH CHECK (auth.uid() = doctor_id);

CREATE POLICY "Users can delete own patient medications"
ON patient_medications FOR DELETE
USING (auth.uid() = doctor_id);

-- ============================================================================
-- Reverse migration:
--   DROP TRIGGER IF EXISTS update_patient_medications_updated_at ON patient_medications;
--   DROP TABLE IF EXISTS patient_medications;
--   (Index + policies drop with the table.)
-- ============================================================================
-- Migration Complete
-- ============================================================================
