-- ============================================================================
-- Staff service review: track SLA breach + re-enable 30-minute timeout.
-- ============================================================================

ALTER TABLE service_staff_review_requests
  ADD COLUMN IF NOT EXISTS sla_breached_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN service_staff_review_requests.sla_breached_at IS
  'Set by cron when pending review exceeds sla_deadline_at. Prevents re-processing.';

COMMENT ON COLUMN service_staff_review_requests.sla_deadline_at IS
  'Timestamp: created_at + 30 min. Cron job checks pending rows past this deadline.';

CREATE INDEX IF NOT EXISTS idx_staff_review_sla_timeout
  ON service_staff_review_requests (sla_deadline_at)
  WHERE status = 'pending' AND sla_breached_at IS NULL AND sla_deadline_at IS NOT NULL;
