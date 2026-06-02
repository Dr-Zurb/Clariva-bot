-- ============================================================================
-- learn-03: Pattern key on examples + shadow evaluation table + metrics view
-- ============================================================================

-- Pattern key for indexed lookup (same formula as application SHA256 canonical JSON).
ALTER TABLE service_match_learning_examples
  ADD COLUMN IF NOT EXISTS pattern_key TEXT;

COMMENT ON COLUMN service_match_learning_examples.pattern_key IS
  'Deterministic hash from reason codes + candidate keys + proposed key (see SERVICE_MATCH_PATTERN_KEY.md).';

CREATE INDEX IF NOT EXISTS idx_service_match_learning_doctor_pattern_created
  ON service_match_learning_examples (doctor_id, pattern_key, created_at DESC)
  WHERE pattern_key IS NOT NULL;

-- ----------------------------------------------------------------------------
-- Shadow evaluations (one row per new pending staff review, when enabled)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS service_match_shadow_evaluations (
  id                               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id                        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id                  UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  review_request_id                UUID NOT NULL UNIQUE
                                   REFERENCES service_staff_review_requests(id) ON DELETE CASCADE,
  pattern_key                      TEXT NOT NULL,
  matcher_proposed_catalog_service_key TEXT NOT NULL,
  would_suggest_service_key        TEXT,
  similarity_score                 NUMERIC(8, 6) NOT NULL DEFAULT 0,
  source_example_ids               UUID[] NOT NULL DEFAULT '{}',
  correlation_id                   TEXT,
  created_at                       TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE service_match_shadow_evaluations IS
  'learn-03: Hypothetical suggestion from past examples at staff-review queue time; no behavior change.';
COMMENT ON COLUMN service_match_shadow_evaluations.similarity_score IS
  'Vote share for winning final_catalog_service_key among pattern-matched examples (0–1).';

CREATE INDEX IF NOT EXISTS idx_service_match_shadow_doctor_created
  ON service_match_shadow_evaluations (doctor_id, created_at DESC);

ALTER TABLE service_match_shadow_evaluations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Doctors can read own service match shadow evaluations"
  ON service_match_shadow_evaluations FOR SELECT
  USING (doctor_id = auth.uid());

CREATE POLICY "Service role can insert service match shadow evaluations"
  ON service_match_shadow_evaluations FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role can read service match shadow evaluations"
  ON service_match_shadow_evaluations FOR SELECT
  USING (auth.role() = 'service_role');

-- Resolved reviews only: compare shadow vs staff final key (internal analytics).
CREATE OR REPLACE VIEW service_match_shadow_resolution_metrics AS
SELECT
  s.id AS shadow_id,
  s.doctor_id,
  s.review_request_id,
  s.pattern_key,
  s.matcher_proposed_catalog_service_key,
  s.would_suggest_service_key,
  s.similarity_score,
  s.source_example_ids,
  s.created_at AS shadow_created_at,
  r.status AS review_status,
  r.final_catalog_service_key AS staff_final_catalog_service_key,
  r.resolved_at AS staff_resolved_at,
  CASE
    WHEN r.status IN ('confirmed', 'reassigned')
     AND s.would_suggest_service_key IS NOT NULL
     AND lower(trim(s.would_suggest_service_key)) = lower(trim(r.final_catalog_service_key))
    THEN true
    ELSE false
  END AS shadow_agrees_with_staff
FROM service_match_shadow_evaluations s
INNER JOIN service_staff_review_requests r ON r.id = s.review_request_id
WHERE r.status IN ('confirmed', 'reassigned');

COMMENT ON VIEW service_match_shadow_resolution_metrics IS
  'Internal: shadow vs staff final key for resolved reviews. See SERVICE_MATCH_SHADOW_METRICS.md.';

-- ============================================================================
-- Migration Complete
-- ============================================================================
