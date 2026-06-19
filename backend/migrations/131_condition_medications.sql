-- ============================================================================
-- Condition ↔ Medication links (Subjective Phase B — problem-oriented charting)
-- ============================================================================
-- Migration: 131_condition_medications.sql
-- Date:      2026-06-10
-- Description:
--   Many-to-many join between patient_chronic_conditions and patient_medications.
--   A medication may link to zero, one, or many conditions; unlinked meds appear
--   in the UI "General / not linked" bucket.
--
--   Mirrors migration 087/128 RLS shape (doctor_id scoped, four CRUD policies).
-- ============================================================================

CREATE TABLE IF NOT EXISTS condition_medications (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doctor_id     UUID NOT NULL REFERENCES auth.users(id)   ON DELETE CASCADE,
    patient_id    UUID NOT NULL REFERENCES patients(id)     ON DELETE CASCADE,
    condition_id  UUID NOT NULL REFERENCES patient_chronic_conditions(id) ON DELETE CASCADE,
    medication_id UUID NOT NULL REFERENCES patient_medications(id)       ON DELETE CASCADE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (condition_id, medication_id)
);

COMMENT ON TABLE  condition_medications              IS 'M:N link — medication filed under condition(s). PHI. Doctor-scoped.';
COMMENT ON COLUMN condition_medications.condition_id  IS 'FK → patient_chronic_conditions.id';
COMMENT ON COLUMN condition_medications.medication_id IS 'FK → patient_medications.id';

CREATE INDEX IF NOT EXISTS idx_condition_medications_chart_lookup
  ON condition_medications (doctor_id, patient_id);

CREATE INDEX IF NOT EXISTS idx_condition_medications_condition
  ON condition_medications (condition_id);

CREATE INDEX IF NOT EXISTS idx_condition_medications_medication
  ON condition_medications (medication_id);

ALTER TABLE condition_medications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own condition medications"   ON condition_medications;
DROP POLICY IF EXISTS "Users can insert own condition medications" ON condition_medications;
DROP POLICY IF EXISTS "Users can update own condition medications" ON condition_medications;
DROP POLICY IF EXISTS "Users can delete own condition medications" ON condition_medications;

CREATE POLICY "Users can read own condition medications"
ON condition_medications FOR SELECT
USING (auth.uid() = doctor_id);

CREATE POLICY "Users can insert own condition medications"
ON condition_medications FOR INSERT
WITH CHECK (auth.uid() = doctor_id);

CREATE POLICY "Users can update own condition medications"
ON condition_medications FOR UPDATE
USING (auth.uid() = doctor_id)
WITH CHECK (auth.uid() = doctor_id);

CREATE POLICY "Users can delete own condition medications"
ON condition_medications FOR DELETE
USING (auth.uid() = doctor_id);

-- ============================================================================
-- Reverse migration:
--   DROP TABLE IF EXISTS condition_medications;
-- ============================================================================
-- Migration Complete
-- ============================================================================
