-- ============================================================================
-- Patient allergies section notes (free-text)
-- ============================================================================
-- Migration: 158_patient_allergies_section_notes.sql
-- Description:
--   One row per (doctor_id, patient_id) for section-level allergy notes that
--   don't belong on a specific allergen card (e.g. "NKDA per patient").
--   Doctor-scoped, patient-level — mirrors patient_medical_background_notes.
-- ============================================================================

CREATE TABLE IF NOT EXISTS patient_allergies_section_notes (
    doctor_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    patient_id  UUID NOT NULL REFERENCES patients(id)   ON DELETE CASCADE,
    notes       TEXT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (doctor_id, patient_id)
);

COMMENT ON TABLE  patient_allergies_section_notes        IS 'Section-level allergy notes, doctor-scoped. PHI.';
COMMENT ON COLUMN patient_allergies_section_notes.notes  IS 'Free-text additional notes for the allergies section.';

CREATE INDEX IF NOT EXISTS idx_patient_allergies_section_notes_lookup
  ON patient_allergies_section_notes (doctor_id, patient_id);

DROP TRIGGER IF EXISTS update_patient_allergies_section_notes_updated_at
  ON patient_allergies_section_notes;
CREATE TRIGGER update_patient_allergies_section_notes_updated_at
    BEFORE UPDATE ON patient_allergies_section_notes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE patient_allergies_section_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own patient allergies section notes"
  ON patient_allergies_section_notes;
DROP POLICY IF EXISTS "Users can insert own patient allergies section notes"
  ON patient_allergies_section_notes;
DROP POLICY IF EXISTS "Users can update own patient allergies section notes"
  ON patient_allergies_section_notes;
DROP POLICY IF EXISTS "Users can delete own patient allergies section notes"
  ON patient_allergies_section_notes;

CREATE POLICY "Users can read own patient allergies section notes"
ON patient_allergies_section_notes FOR SELECT
USING (auth.uid() = doctor_id);

CREATE POLICY "Users can insert own patient allergies section notes"
ON patient_allergies_section_notes FOR INSERT
WITH CHECK (auth.uid() = doctor_id);

CREATE POLICY "Users can update own patient allergies section notes"
ON patient_allergies_section_notes FOR UPDATE
USING (auth.uid() = doctor_id)
WITH CHECK (auth.uid() = doctor_id);

CREATE POLICY "Users can delete own patient allergies section notes"
ON patient_allergies_section_notes FOR DELETE
USING (auth.uid() = doctor_id);
