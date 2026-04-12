-- ============================================================================
-- learn-04: Policy suggestions + opt-in autobook policy records (no matcher change)
-- ============================================================================

-- Aggregates reassignment examples for stability detection (called via RPC from backend).
CREATE OR REPLACE FUNCTION stable_reassignment_pattern_candidates(
  p_min_count int,
  p_window_days int
)
RETURNS TABLE (
  doctor_id uuid,
  pattern_key text,
  proposed_catalog_service_key text,
  final_catalog_service_key text,
  resolution_count bigint,
  window_start timestamptz,
  window_end timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    e.doctor_id,
    e.pattern_key,
    lower(trim(e.proposed_catalog_service_key)),
    lower(trim(e.final_catalog_service_key)),
    COUNT(*)::bigint,
    MIN(e.created_at),
    MAX(e.created_at)
  FROM service_match_learning_examples e
  WHERE e.action = 'reassigned'
    AND e.pattern_key IS NOT NULL
    AND e.created_at >= NOW() - make_interval(days => GREATEST(1, p_window_days))
  GROUP BY
    e.doctor_id,
    e.pattern_key,
    lower(trim(e.proposed_catalog_service_key)),
    lower(trim(e.final_catalog_service_key))
  HAVING COUNT(*) >= GREATEST(1, p_min_count);
$$;

COMMENT ON FUNCTION stable_reassignment_pattern_candidates(int, int) IS
  'learn-04: Groups reassignment learning rows by doctor + pattern + proposed→final within window.';

GRANT EXECUTE ON FUNCTION stable_reassignment_pattern_candidates(int, int) TO service_role;

-- ----------------------------------------------------------------------------
-- Pending / resolved suggestions (doctor must accept before learn-05 uses policy)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS service_match_learning_policy_suggestions (
  id                               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id                        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pattern_key                      TEXT NOT NULL,
  proposed_catalog_service_key     TEXT NOT NULL,
  final_catalog_service_key        TEXT NOT NULL,
  resolution_count                 INT NOT NULL,
  window_start_at                  TIMESTAMPTZ NOT NULL,
  window_end_at                    TIMESTAMPTZ NOT NULL,
  status                           TEXT NOT NULL DEFAULT 'pending'
                                   CHECK (status IN ('pending', 'accepted', 'declined', 'snoozed', 'superseded')),
  snoozed_until                    TIMESTAMPTZ,
  notification_title               TEXT NOT NULL,
  notification_body                TEXT NOT NULL,
  created_at                       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                       TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE service_match_learning_policy_suggestions IS
  'learn-04: Stable-pattern suggestion for doctor opt-in; aggregates only in notification body.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_policy_suggestion_one_pending_per_pair
  ON service_match_learning_policy_suggestions (doctor_id, pattern_key, proposed_catalog_service_key, final_catalog_service_key)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_policy_suggestions_doctor_status
  ON service_match_learning_policy_suggestions (doctor_id, status, created_at DESC);

-- ----------------------------------------------------------------------------
-- Enabled policies (learn-05 will read; disabled_at revokes without deleting)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS service_match_autobook_policies (
  id                               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id                        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pattern_key                      TEXT NOT NULL,
  proposed_catalog_service_key     TEXT NOT NULL,
  final_catalog_service_key        TEXT NOT NULL,
  enabled                          BOOLEAN NOT NULL DEFAULT true,
  enabled_at                       TIMESTAMPTZ NOT NULL DEFAULT now(),
  enabled_by_user_id               UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  scope                            JSONB NOT NULL DEFAULT '{}'::jsonb,
  disabled_at                      TIMESTAMPTZ,
  suggestion_id                    UUID REFERENCES service_match_learning_policy_suggestions(id) ON DELETE SET NULL,
  created_at                       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                       TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE service_match_autobook_policies IS
  'learn-04/05: Doctor-opt-in autobook scope; matcher unchanged until learn-05 consumes rows.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_autobook_policy_active_per_pair
  ON service_match_autobook_policies (doctor_id, pattern_key, proposed_catalog_service_key, final_catalog_service_key)
  WHERE disabled_at IS NULL AND enabled = true;

CREATE INDEX IF NOT EXISTS idx_autobook_policies_doctor_active
  ON service_match_autobook_policies (doctor_id)
  WHERE disabled_at IS NULL AND enabled = true;

DROP TRIGGER IF EXISTS service_match_learning_policy_suggestions_updated_at ON service_match_learning_policy_suggestions;
CREATE TRIGGER service_match_learning_policy_suggestions_updated_at
  BEFORE UPDATE ON service_match_learning_policy_suggestions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS service_match_autobook_policies_updated_at ON service_match_autobook_policies;
CREATE TRIGGER service_match_autobook_policies_updated_at
  BEFORE UPDATE ON service_match_autobook_policies
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE service_match_learning_policy_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_match_autobook_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Doctors can read own policy suggestions"
  ON service_match_learning_policy_suggestions FOR SELECT
  USING (doctor_id = auth.uid());

CREATE POLICY "Doctors can update own policy suggestions"
  ON service_match_learning_policy_suggestions FOR UPDATE
  USING (doctor_id = auth.uid())
  WITH CHECK (doctor_id = auth.uid());

CREATE POLICY "Service role full access policy suggestions"
  ON service_match_learning_policy_suggestions FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Doctors can read own autobook policies"
  ON service_match_autobook_policies FOR SELECT
  USING (doctor_id = auth.uid());

CREATE POLICY "Service role full access autobook policies"
  ON service_match_autobook_policies FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ============================================================================
-- Migration Complete
-- ============================================================================
