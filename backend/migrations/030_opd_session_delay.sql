-- Doctor-broadcast session delay for patient banners (e-task-opd-06)
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS opd_session_delay_minutes INTEGER NULL
  CONSTRAINT appointments_opd_session_delay_minutes_check CHECK (
    opd_session_delay_minutes IS NULL OR (opd_session_delay_minutes >= 0 AND opd_session_delay_minutes <= 480)
  );

COMMENT ON COLUMN appointments.opd_session_delay_minutes IS 'Doctor-set delay (minutes) shown to patient; cleared when null';
