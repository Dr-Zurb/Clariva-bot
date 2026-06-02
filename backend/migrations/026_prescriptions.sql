-- ============================================================================
-- Prescription Tables (Prescription V1)
-- ============================================================================
-- Migration: 026_prescriptions.sql
-- Date: 2026-03-28
-- Description:
--   Create prescriptions, prescription_medicines, prescription_attachments.
--   Enables doctor to store structured SOAP notes and/or photo prescriptions
--   linked to appointments and patients.
--   PHI: diagnosis, medications, clinical notes. RLS enforces doctor-only access.
-- ============================================================================

-- ============================================================================
-- 1. TABLES
-- ============================================================================

-- ----------------------------------------------------------------------------
-- prescriptions table
-- Purpose: Store prescription records per appointment. PHI: diagnosis, meds, notes.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS prescriptions (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    appointment_id          UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
    patient_id              UUID NULL REFERENCES patients(id) ON DELETE SET NULL,
    doctor_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    type                    TEXT NOT NULL CHECK (type IN ('structured', 'photo', 'both')),
    cc                      TEXT NULL,
    hopi                    TEXT NULL,
    provisional_diagnosis   TEXT NULL,
    investigations          TEXT NULL,
    follow_up               TEXT NULL,
    patient_education       TEXT NULL,
    clinical_notes          TEXT NULL,
    sent_to_patient_at      TIMESTAMPTZ NULL,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE prescriptions IS 'Prescription records per appointment. PHI: diagnosis, meds, notes. RLS: doctor-only.';
COMMENT ON COLUMN prescriptions.type IS 'structured=SOAP form, photo=handwritten image, both=structured + photo';
COMMENT ON COLUMN prescriptions.sent_to_patient_at IS 'When prescription was sent to patient via DM/email.';

-- ----------------------------------------------------------------------------
-- prescription_medicines table
-- Purpose: Medicines prescribed in a prescription.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS prescription_medicines (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prescription_id UUID NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE,
    medicine_name   TEXT NOT NULL,
    dosage          TEXT NULL,
    route           TEXT NULL,
    frequency       TEXT NULL,
    duration        TEXT NULL,
    instructions    TEXT NULL,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE prescription_medicines IS 'Medicines in a prescription. CASCADE delete when prescription deleted.';

-- ----------------------------------------------------------------------------
-- prescription_attachments table
-- Purpose: Photo attachments (handwritten Rx, lab reports) for prescriptions.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS prescription_attachments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prescription_id UUID NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE,
    file_path       TEXT NOT NULL,
    file_type       TEXT NULL,
    caption         TEXT NULL,
    uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE prescription_attachments IS 'Photo/file attachments for prescriptions. file_path = Supabase Storage path.';
COMMENT ON COLUMN prescription_attachments.file_path IS 'Supabase Storage object path.';

-- ============================================================================
-- 2. INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_prescriptions_appointment_id ON prescriptions(appointment_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_patient_id ON prescriptions(patient_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_doctor_id ON prescriptions(doctor_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_created_at ON prescriptions(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_prescription_medicines_prescription_id ON prescription_medicines(prescription_id);

CREATE INDEX IF NOT EXISTS idx_prescription_attachments_prescription_id ON prescription_attachments(prescription_id);

-- ============================================================================
-- 3. TRIGGERS (updated_at)
-- ============================================================================

CREATE TRIGGER update_prescriptions_updated_at
    BEFORE UPDATE ON prescriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 4. ROW LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE prescriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE prescription_medicines ENABLE ROW LEVEL SECURITY;
ALTER TABLE prescription_attachments ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- prescriptions policies: doctor owns via doctor_id
-- ----------------------------------------------------------------------------

CREATE POLICY "Users can read own prescriptions"
ON prescriptions FOR SELECT
USING (auth.uid() = doctor_id);

CREATE POLICY "Users can insert own prescriptions"
ON prescriptions FOR INSERT
WITH CHECK (auth.uid() = doctor_id);

CREATE POLICY "Users can update own prescriptions"
ON prescriptions FOR UPDATE
USING (auth.uid() = doctor_id)
WITH CHECK (auth.uid() = doctor_id);

CREATE POLICY "Users can delete own prescriptions"
ON prescriptions FOR DELETE
USING (auth.uid() = doctor_id);

-- ----------------------------------------------------------------------------
-- prescription_medicines: access via parent prescription ownership
-- ----------------------------------------------------------------------------

CREATE POLICY "Users can read own prescription medicines"
ON prescription_medicines FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM prescriptions p
        WHERE p.id = prescription_medicines.prescription_id
        AND p.doctor_id = auth.uid()
    )
);

CREATE POLICY "Users can insert own prescription medicines"
ON prescription_medicines FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM prescriptions p
        WHERE p.id = prescription_medicines.prescription_id
        AND p.doctor_id = auth.uid()
    )
);

CREATE POLICY "Users can update own prescription medicines"
ON prescription_medicines FOR UPDATE
USING (
    EXISTS (
        SELECT 1 FROM prescriptions p
        WHERE p.id = prescription_medicines.prescription_id
        AND p.doctor_id = auth.uid()
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM prescriptions p
        WHERE p.id = prescription_medicines.prescription_id
        AND p.doctor_id = auth.uid()
    )
);

CREATE POLICY "Users can delete own prescription medicines"
ON prescription_medicines FOR DELETE
USING (
    EXISTS (
        SELECT 1 FROM prescriptions p
        WHERE p.id = prescription_medicines.prescription_id
        AND p.doctor_id = auth.uid()
    )
);

-- ----------------------------------------------------------------------------
-- prescription_attachments: access via parent prescription ownership
-- ----------------------------------------------------------------------------

CREATE POLICY "Users can read own prescription attachments"
ON prescription_attachments FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM prescriptions p
        WHERE p.id = prescription_attachments.prescription_id
        AND p.doctor_id = auth.uid()
    )
);

CREATE POLICY "Users can insert own prescription attachments"
ON prescription_attachments FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM prescriptions p
        WHERE p.id = prescription_attachments.prescription_id
        AND p.doctor_id = auth.uid()
    )
);

CREATE POLICY "Users can update own prescription attachments"
ON prescription_attachments FOR UPDATE
USING (
    EXISTS (
        SELECT 1 FROM prescriptions p
        WHERE p.id = prescription_attachments.prescription_id
        AND p.doctor_id = auth.uid()
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM prescriptions p
        WHERE p.id = prescription_attachments.prescription_id
        AND p.doctor_id = auth.uid()
    )
);

CREATE POLICY "Users can delete own prescription attachments"
ON prescription_attachments FOR DELETE
USING (
    EXISTS (
        SELECT 1 FROM prescriptions p
        WHERE p.id = prescription_attachments.prescription_id
        AND p.doctor_id = auth.uid()
    )
);

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- RLS: Doctor-only access. Service role bypasses for send-flow if needed.
-- PHI: Prescriptions contain diagnosis, meds, notes. 7-year retention per COMPLIANCE.
-- ============================================================================
