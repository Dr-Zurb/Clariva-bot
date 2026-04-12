-- ============================================================================
-- Staff feedback learning (learn-02): supervised examples from staff resolutions
-- ============================================================================
-- Migration: 043_service_match_learning_examples.sql
-- Description:
--   One row per resolved staff service review (confirm / reassign). feature_snapshot
--   holds structured fields only (see docs/Reference/STAFF_FEEDBACK_LEARNING_DATA_CONTRACT.md).
-- ============================================================================

CREATE TABLE IF NOT EXISTS service_match_learning_examples (
  id                           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id                    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  review_request_id            UUID NOT NULL UNIQUE
                               REFERENCES service_staff_review_requests(id) ON DELETE CASCADE,
  action                       TEXT NOT NULL
                               CHECK (action IN ('confirmed', 'reassigned')),
  proposed_catalog_service_key TEXT NOT NULL,
  final_catalog_service_key    TEXT NOT NULL,
  feature_snapshot             JSONB NOT NULL,
  correlation_id               TEXT,
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE service_match_learning_examples IS
  'learn-02: Staff confirm/reassign labels for service-match learning; no PHI columns.';
COMMENT ON COLUMN service_match_learning_examples.feature_snapshot IS
  'Structured JSON: review_row_at_resolution + conversation_state_after_resolution (allowlisted keys only).';

CREATE INDEX IF NOT EXISTS idx_service_match_learning_doctor_created
  ON service_match_learning_examples (doctor_id, created_at DESC);

ALTER TABLE service_match_learning_examples ENABLE ROW LEVEL SECURITY;

-- Doctors read own rows; backend writes via service_role only (same pattern as staff review audit).
CREATE POLICY "Doctors can read own service match learning examples"
  ON service_match_learning_examples FOR SELECT
  USING (doctor_id = auth.uid());

CREATE POLICY "Service role can insert service match learning examples"
  ON service_match_learning_examples FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role can read service match learning examples"
  ON service_match_learning_examples FOR SELECT
  USING (auth.role() = 'service_role');

-- ============================================================================
-- Migration Complete
-- ============================================================================
