-- ============================================================================
-- 234_patient_history_submissions.sql
-- desk-visit-prep P2 — front-desk basic history sidecar
-- Date:    2026-09-12
-- ============================================================================
-- Purpose:
--   Receptionist-typed why-today / allergies / medicines / conditions hang
--   off the appointment. The desk never writes patient_allergies,
--   patient_chronic_conditions, patient_medications, or prescriptions
--   (DVP-DL-3 / HL-DL-1). Doctor accept is a later write.
--
-- Field map: plan-history-link.md "Field → column map (v1)".
-- JSON payloads: { none: true } or { none: false, items: [...] }.
--
-- Auth:
--   RLS mirrors 087 / 233 (auth.uid() = doctor_id) as defence in depth.
--   Desk writes go through the service-role client (receptionist-portal R6).
--
-- Safety:
--   Additive. Idempotent. PHI (clinical answers). Reverse at file foot.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. TABLE
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS patient_history_submissions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doctor_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    patient_id      UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    appointment_id  UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
    source          TEXT NOT NULL DEFAULT 'front_desk'
                    CHECK (source IN ('front_desk', 'patient')),
    actor_id        UUID NOT NULL,
    why_today       TEXT NOT NULL,
    allergies       JSONB NOT NULL,
    medicines       JSONB NOT NULL,
    conditions      JSONB NOT NULL,
    notice_version  TEXT NULL,
    submitted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (appointment_id)
);

COMMENT ON TABLE  patient_history_submissions IS
  'desk-visit-prep P2. Sidecar for desk/patient history. PHI. Service-role writes; doctor RLS for defence in depth. Chart tables stay empty until doctor accept.';
COMMENT ON COLUMN patient_history_submissions.source IS
  'front_desk | patient. Who typed the answers (DVP-DL-6).';
COMMENT ON COLUMN patient_history_submissions.actor_id IS
  'auth.users id of the last writer. Audited separately; no FK so a deleted staff account does not drop the row.';
COMMENT ON COLUMN patient_history_submissions.why_today IS
  'Patient words as heard at the desk. Seeds prescriptions.cc on accept. Not appointments.reason_for_visit.';
COMMENT ON COLUMN patient_history_submissions.allergies IS
  '{ none: true } or { none: false, items: [{ name, reaction? }] }. Accept later writes patient_allergies / NKDA.';
COMMENT ON COLUMN patient_history_submissions.medicines IS
  '{ none: true } or { none: false, items: [{ name, dose? }] }. Accept later writes patient_medications source=self.';
COMMENT ON COLUMN patient_history_submissions.conditions IS
  '{ none: true } or { none: false, items: [{ name }] }. Accept later writes patient_chronic_conditions.';
COMMENT ON COLUMN patient_history_submissions.notice_version IS
  'Snapshot of the collection-notice version shown at capture (HL-DL-10). Wording is counsel-owned; do not ship DRAFT copy.';

-- ----------------------------------------------------------------------------
-- 2. INDEXES
-- ----------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_patient_history_submissions_appointment
  ON patient_history_submissions (doctor_id, appointment_id);

CREATE INDEX IF NOT EXISTS idx_patient_history_submissions_patient
  ON patient_history_submissions (doctor_id, patient_id);

-- ----------------------------------------------------------------------------
-- 3. TRIGGERS
-- ----------------------------------------------------------------------------

DROP TRIGGER IF EXISTS update_patient_history_submissions_updated_at
  ON patient_history_submissions;
CREATE TRIGGER update_patient_history_submissions_updated_at
    BEFORE UPDATE ON patient_history_submissions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 4. ROW LEVEL SECURITY (mirrors 087 / 233 — doctor JWT only; staff uses service role)
-- ----------------------------------------------------------------------------

ALTER TABLE patient_history_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own history submissions"    ON patient_history_submissions;
DROP POLICY IF EXISTS "Users can insert own history submissions"  ON patient_history_submissions;
DROP POLICY IF EXISTS "Users can update own history submissions"  ON patient_history_submissions;
DROP POLICY IF EXISTS "Users can delete own history submissions"  ON patient_history_submissions;

CREATE POLICY "Users can read own history submissions"
ON patient_history_submissions FOR SELECT
USING (auth.uid() = doctor_id);

CREATE POLICY "Users can insert own history submissions"
ON patient_history_submissions FOR INSERT
WITH CHECK (auth.uid() = doctor_id);

CREATE POLICY "Users can update own history submissions"
ON patient_history_submissions FOR UPDATE
USING (auth.uid() = doctor_id)
WITH CHECK (auth.uid() = doctor_id);

CREATE POLICY "Users can delete own history submissions"
ON patient_history_submissions FOR DELETE
USING (auth.uid() = doctor_id);

-- ============================================================================
-- Reverse migration (manual):
--
--   DROP TABLE IF EXISTS patient_history_submissions;
-- ============================================================================
