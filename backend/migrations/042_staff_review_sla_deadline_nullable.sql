-- ============================================================================
-- Staff service review: SLA deadline optional (no auto-timeout product path).
-- ============================================================================
-- New pending rows use NULL for sla_deadline_at; legacy rows may still have a timestamp.

ALTER TABLE service_staff_review_requests
  ALTER COLUMN sla_deadline_at DROP NOT NULL;

COMMENT ON COLUMN service_staff_review_requests.sla_deadline_at IS
  'Optional legacy timestamp; no longer used for auto-close. Prefer created_at for ordering.';
