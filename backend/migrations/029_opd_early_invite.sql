-- ============================================================================
-- OPD session: early-invite response (e-task-opd-04)
-- ============================================================================
-- Doctor/system sets opd_early_invite_expires_at when offering early join;
-- patient accepts/declines via POST /bookings/session/early-join/*
-- ============================================================================

ALTER TABLE appointments ADD COLUMN IF NOT EXISTS opd_early_invite_expires_at TIMESTAMPTZ NULL;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS opd_early_invite_response TEXT NULL
  CONSTRAINT appointments_opd_early_invite_response_check CHECK (
    opd_early_invite_response IS NULL OR opd_early_invite_response IN ('accepted', 'declined')
  );

COMMENT ON COLUMN appointments.opd_early_invite_expires_at IS 'When set and future, patient may accept early join (slot mode; e-task-opd-04)';
COMMENT ON COLUMN appointments.opd_early_invite_response IS 'Patient response to early join offer; NULL if not yet answered';

-- ============================================================================
-- Migration Complete
-- ============================================================================
