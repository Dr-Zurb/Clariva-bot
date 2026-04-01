-- ============================================================================
-- ARM-08: SLA timeout patient notify idempotency
-- ============================================================================
-- Migration: 041_service_staff_review_timeout_notify.sql
-- Date: 2026-03-31
-- Description:
--   When a pending review row is closed as cancelled_timeout, we may send one
--   proactive Instagram DM. This column prevents duplicate sends across cron ticks.
-- ============================================================================

ALTER TABLE service_staff_review_requests
  ADD COLUMN IF NOT EXISTS sla_timeout_notified_at TIMESTAMPTZ;

COMMENT ON COLUMN service_staff_review_requests.sla_timeout_notified_at IS
  'ARM-08: set when timeout DM sent (Instagram) or when notify skipped as N/A (non-Instagram); null means retry eligible.';

CREATE INDEX IF NOT EXISTS idx_service_staff_review_timeout_notify_retry
  ON service_staff_review_requests (resolved_at)
  WHERE status = 'cancelled_timeout' AND sla_timeout_notified_at IS NULL;

-- ============================================================================
-- Migration Complete
-- ============================================================================
