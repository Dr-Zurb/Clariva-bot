-- ============================================================================
-- Patient medical background section notes (PMH free-text)
-- ============================================================================
-- Migration: 140_patient_medical_background_notes.sql
-- Description:
--   One row per (doctor_id, patient_id) for section-level PMH notes that don't
--   belong on a specific condition card (e.g. "Multiple laparotomies abroad").
--   Doctor-scoped, patient-level — mirrors the linked PMH chart model.
-- ============================================================================

CREATE TABLE IF NOT EXISTS patient_medical_background_notes (
    doctor_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    patient_id  UUID NOT NULL REFERENCES patients(id)   ON DELETE CASCADE,
    notes       TEXT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (doctor_id, patient_id)
);

COMMENT ON TABLE  patient_medical_background_notes        IS 'Section-level PMH notes, doctor-scoped. PHI.';
COMMENT ON COLUMN patient_medical_background_notes.notes  IS 'Free-text additional notes for the PMH section.';

CREATE INDEX IF NOT EXISTS idx_patient_medical_background_notes_lookup
  ON patient_medical_background_notes (doctor_id, patient_id);

DROP TRIGGER IF EXISTS update_patient_medical_background_notes_updated_at
  ON patient_medical_background_notes;
CREATE TRIGGER update_patient_medical_background_notes_updated_at
    BEFORE UPDATE ON patient_medical_background_notes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE patient_medical_background_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own patient medical background notes"
  ON patient_medical_background_notes;
DROP POLICY IF EXISTS "Users can insert own patient medical background notes"
  ON patient_medical_background_notes;
DROP POLICY IF EXISTS "Users can update own patient medical background notes"
  ON patient_medical_background_notes;
DROP POLICY IF EXISTS "Users can delete own patient medical background notes"
  ON patient_medical_background_notes;

CREATE POLICY "Users can read own patient medical background notes"
ON patient_medical_background_notes FOR SELECT
USING (auth.uid() = doctor_id);

CREATE POLICY "Users can insert own patient medical background notes"
ON patient_medical_background_notes FOR INSERT
WITH CHECK (auth.uid() = doctor_id);

CREATE POLICY "Users can update own patient medical background notes"
ON patient_medical_background_notes FOR UPDATE
USING (auth.uid() = doctor_id)
WITH CHECK (auth.uid() = doctor_id);

CREATE POLICY "Users can delete own patient medical background notes"
ON patient_medical_background_notes FOR DELETE
USING (auth.uid() = doctor_id);
