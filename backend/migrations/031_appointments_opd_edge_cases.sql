-- ============================================================================
-- OPD edge cases: no_show, return link, payment transfer audit (e-task-opd-08)
-- ============================================================================
-- Migration: 031_appointments_opd_edge_cases.sql
-- Date: 2026-03-24
-- Description:
--   Extend appointments.status with no_show (missed slot window / no-show).
--   Optional related_appointment_id for same-day return / post-consult flows.
--   opd_event_type distinguishes standard vs return_after_completed.
--   transferred_payment_from_appointment_id audits fee transfer on reschedule (policy-driven).
-- ============================================================================

ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_status_check;

ALTER TABLE appointments
  ADD CONSTRAINT appointments_status_check CHECK (
    status IN (
      'pending',
      'confirmed',
      'cancelled',
      'completed',
      'no_show'
    )
  );

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS related_appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL;

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS opd_event_type TEXT NOT NULL DEFAULT 'standard'
    CONSTRAINT appointments_opd_event_type_check CHECK (opd_event_type IN ('standard', 'return_after_completed'));

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS transferred_payment_from_appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL;

COMMENT ON COLUMN appointments.related_appointment_id IS 'Optional link to prior appointment (e.g. return_after_completed); OPD-08';
COMMENT ON COLUMN appointments.opd_event_type IS 'standard | return_after_completed (OPD-08)';
COMMENT ON COLUMN appointments.transferred_payment_from_appointment_id IS 'If fee entitlement was transferred from a prior paid appointment (reschedule policy); OPD-08';

CREATE INDEX IF NOT EXISTS idx_appointments_related_appointment_id ON appointments(related_appointment_id)
  WHERE related_appointment_id IS NOT NULL;

-- ============================================================================
-- Migration Complete
-- ============================================================================
