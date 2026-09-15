-- ============================================================================
-- 233_visit_documents.sql
-- desk-visit-prep P1 — appointment-scoped clinical documents from the desk
-- Date:    2026-09-12
-- ============================================================================
-- Purpose:
--   Front-desk report scans hang off the appointment, not the prescription
--   (DVP-DL-1). prescription_attachments.prescription_id stays NOT NULL.
--   A four-page lab report is one visit_documents row + four pages.
--
-- Storage:
--   Same private bucket `prescription-attachments` (027). Path prefix
--   `{doctor_id}/desk/{appointment_id}/{uuid}-{filename}` (DVP-DL-2).
--   No new bucket. No storage.objects RLS. Access is service-role signed URLs.
--
-- Auth:
--   RLS mirrors 087 (auth.uid() = doctor_id) as defence in depth.
--   Desk writes go through the service-role client (receptionist-portal R6).
--
-- Safety:
--   Additive. Idempotent. PHI (clinical document images). Reverse at file foot.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. TABLES
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS visit_documents (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doctor_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    patient_id      UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    appointment_id  UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
    document_type   TEXT NOT NULL DEFAULT 'other'
                    CHECK (document_type IN (
                      'lab_report',
                      'imaging',
                      'discharge_summary',
                      'old_prescription',
                      'referral_letter',
                      'other'
                    )),
    report_date     DATE NULL,
    ordered_by      TEXT NOT NULL DEFAULT 'outside'
                    CHECK (ordered_by IN ('us', 'outside')),
    source          TEXT NOT NULL DEFAULT 'front_desk'
                    CHECK (source IN ('front_desk', 'patient')),
    actor_id        UUID NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS visit_document_pages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id     UUID NOT NULL REFERENCES visit_documents(id) ON DELETE CASCADE,
    doctor_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    file_path       TEXT NOT NULL,
    file_type       TEXT NOT NULL,
    page_index      INTEGER NOT NULL CHECK (page_index >= 0),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (document_id, page_index)
);

COMMENT ON TABLE  visit_documents IS
  'desk-visit-prep P1. One labelled clinical document per appointment (lab report, old Rx, …). PHI. Service-role writes; doctor RLS for defence in depth.';
COMMENT ON COLUMN visit_documents.report_date IS
  'Date printed on the paper, not the upload day.';
COMMENT ON COLUMN visit_documents.ordered_by IS
  'us = this clinic ordered the test; outside = patient brought it.';
COMMENT ON COLUMN visit_documents.source IS
  'front_desk | patient. Who captured the pixels (DVP-DL-6).';
COMMENT ON COLUMN visit_documents.actor_id IS
  'auth.users id of the uploader. Audited separately; no FK so a deleted staff account does not drop the document.';
COMMENT ON TABLE  visit_document_pages IS
  'Pages/files belonging to a visit_documents row. file_path is a private storage object. PHI.';
COMMENT ON COLUMN visit_document_pages.file_path IS
  'Supabase storage path under prescription-attachments: {doctor_id}/desk/{appointment_id}/…';

-- ----------------------------------------------------------------------------
-- 2. INDEXES
-- ----------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_visit_documents_appointment
  ON visit_documents (doctor_id, appointment_id);

CREATE INDEX IF NOT EXISTS idx_visit_documents_patient
  ON visit_documents (doctor_id, patient_id);

CREATE INDEX IF NOT EXISTS idx_visit_document_pages_document
  ON visit_document_pages (document_id, page_index);

-- ----------------------------------------------------------------------------
-- 3. TRIGGERS
-- ----------------------------------------------------------------------------

DROP TRIGGER IF EXISTS update_visit_documents_updated_at ON visit_documents;
CREATE TRIGGER update_visit_documents_updated_at
    BEFORE UPDATE ON visit_documents
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 4. ROW LEVEL SECURITY (mirrors 087 — doctor JWT only; staff uses service role)
-- ----------------------------------------------------------------------------

ALTER TABLE visit_documents       ENABLE ROW LEVEL SECURITY;
ALTER TABLE visit_document_pages  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own visit documents"    ON visit_documents;
DROP POLICY IF EXISTS "Users can insert own visit documents"  ON visit_documents;
DROP POLICY IF EXISTS "Users can update own visit documents"  ON visit_documents;
DROP POLICY IF EXISTS "Users can delete own visit documents"  ON visit_documents;

CREATE POLICY "Users can read own visit documents"
ON visit_documents FOR SELECT
USING (auth.uid() = doctor_id);

CREATE POLICY "Users can insert own visit documents"
ON visit_documents FOR INSERT
WITH CHECK (auth.uid() = doctor_id);

CREATE POLICY "Users can update own visit documents"
ON visit_documents FOR UPDATE
USING (auth.uid() = doctor_id)
WITH CHECK (auth.uid() = doctor_id);

CREATE POLICY "Users can delete own visit documents"
ON visit_documents FOR DELETE
USING (auth.uid() = doctor_id);

DROP POLICY IF EXISTS "Users can read own visit document pages"    ON visit_document_pages;
DROP POLICY IF EXISTS "Users can insert own visit document pages"  ON visit_document_pages;
DROP POLICY IF EXISTS "Users can update own visit document pages"  ON visit_document_pages;
DROP POLICY IF EXISTS "Users can delete own visit document pages"  ON visit_document_pages;

CREATE POLICY "Users can read own visit document pages"
ON visit_document_pages FOR SELECT
USING (auth.uid() = doctor_id);

CREATE POLICY "Users can insert own visit document pages"
ON visit_document_pages FOR INSERT
WITH CHECK (auth.uid() = doctor_id);

CREATE POLICY "Users can update own visit document pages"
ON visit_document_pages FOR UPDATE
USING (auth.uid() = doctor_id)
WITH CHECK (auth.uid() = doctor_id);

CREATE POLICY "Users can delete own visit document pages"
ON visit_document_pages FOR DELETE
USING (auth.uid() = doctor_id);

-- ============================================================================
-- Reverse migration (manual):
--
--   DROP TABLE IF EXISTS visit_document_pages;
--   DROP TABLE IF EXISTS visit_documents;
-- ============================================================================
