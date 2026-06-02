-- ============================================================================
-- Service staff review queue (ARM-06)
-- ============================================================================
-- Migration: 040_service_staff_review_requests.sql
-- Date: 2026-03-31
-- Description:
--   Durable queue for low-confidence / pending-staff service catalog matches.
--   Separate table (plan Option B): no appointment row until slot selection.
--   No free-text PHI on review rows — IDs + structured matcher fields only.
--
-- Reference: e-task-arm-06-pending-review-persistence-and-apis.md
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Main review request table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS service_staff_review_requests (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id                  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id            UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  patient_id                 UUID REFERENCES patients(id) ON DELETE SET NULL,
  correlation_id             TEXT,
  status                     TEXT NOT NULL DEFAULT 'pending'
                             CHECK (status IN (
                               'pending',
                               'confirmed',
                               'reassigned',
                               'cancelled_by_staff',
                               'cancelled_timeout'
                             )),
  proposed_catalog_service_key TEXT NOT NULL,
  proposed_catalog_service_id UUID,
  proposed_consultation_modality TEXT CHECK (
                               proposed_consultation_modality IS NULL
                               OR proposed_consultation_modality IN ('text', 'voice', 'video')
                             ),
  match_confidence           TEXT NOT NULL CHECK (match_confidence IN ('high', 'medium', 'low')),
  match_reason_codes         JSONB NOT NULL DEFAULT '[]'::jsonb,
  candidate_labels           JSONB NOT NULL DEFAULT '[]'::jsonb,
  sla_deadline_at            TIMESTAMPTZ NOT NULL,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at                TIMESTAMPTZ,
  resolved_by_user_id        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  final_catalog_service_key  TEXT,
  final_catalog_service_id   UUID,
  final_consultation_modality TEXT CHECK (
                               final_consultation_modality IS NULL
                               OR final_consultation_modality IN ('text', 'voice', 'video')
                             ),
  resolution_internal_note   TEXT
);

COMMENT ON TABLE service_staff_review_requests IS 'ARM-06: Pending staff confirmation for AI-suggested catalog service; no PHI columns.';
COMMENT ON COLUMN service_staff_review_requests.candidate_labels IS 'Structured labels [{service_key,label}] only; no patient text.';
COMMENT ON COLUMN service_staff_review_requests.resolution_internal_note IS 'Short internal note; avoid PHI.';

-- Only one open pending review per conversation (idempotent worker creates)
CREATE UNIQUE INDEX IF NOT EXISTS uq_service_staff_review_one_pending_per_conversation
  ON service_staff_review_requests (conversation_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_service_staff_review_doctor_status_deadline
  ON service_staff_review_requests (doctor_id, status, sla_deadline_at);

CREATE INDEX IF NOT EXISTS idx_service_staff_review_pending_deadline
  ON service_staff_review_requests (sla_deadline_at)
  WHERE status = 'pending';

-- ----------------------------------------------------------------------------
-- 2. Append-only audit events
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS service_staff_review_audit_events (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_request_id   UUID NOT NULL REFERENCES service_staff_review_requests(id) ON DELETE CASCADE,
  event_type          TEXT NOT NULL CHECK (event_type IN (
                        'created',
                        'confirmed',
                        'reassigned',
                        'cancelled_by_staff',
                        'cancelled_timeout'
                      )),
  actor_user_id       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,
  correlation_id      TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE service_staff_review_audit_events IS 'ARM-06: Immutable audit trail for staff service review resolutions.';

CREATE INDEX IF NOT EXISTS idx_service_staff_review_audit_request
  ON service_staff_review_audit_events (review_request_id, created_at);

-- ----------------------------------------------------------------------------
-- 3. RLS
-- ----------------------------------------------------------------------------
ALTER TABLE service_staff_review_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_staff_review_audit_events ENABLE ROW LEVEL SECURITY;

-- Review requests: doctors see/update own practice; worker uses service_role
CREATE POLICY "Doctors can read own service staff review requests"
  ON service_staff_review_requests FOR SELECT
  USING (doctor_id = auth.uid());

CREATE POLICY "Doctors can update own service staff review requests"
  ON service_staff_review_requests FOR UPDATE
  USING (doctor_id = auth.uid())
  WITH CHECK (doctor_id = auth.uid());

CREATE POLICY "Service role can insert service staff review requests"
  ON service_staff_review_requests FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role can read service staff review requests"
  ON service_staff_review_requests FOR SELECT
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role can update service staff review requests"
  ON service_staff_review_requests FOR UPDATE
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Audit: doctors read events for their requests only; worker writes
CREATE POLICY "Doctors can read audit for own service staff reviews"
  ON service_staff_review_audit_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM service_staff_review_requests r
      WHERE r.id = review_request_id AND r.doctor_id = auth.uid()
    )
  );

CREATE POLICY "Service role can insert service staff review audit events"
  ON service_staff_review_audit_events FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role can read service staff review audit events"
  ON service_staff_review_audit_events FOR SELECT
  USING (auth.role() = 'service_role');

-- ----------------------------------------------------------------------------
-- 4. updated_at trigger (requests only)
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS service_staff_review_requests_updated_at ON service_staff_review_requests;
CREATE TRIGGER service_staff_review_requests_updated_at
  BEFORE UPDATE ON service_staff_review_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Migration Complete
-- ============================================================================
