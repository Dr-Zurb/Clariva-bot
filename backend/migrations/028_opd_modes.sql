-- ============================================================================
-- OPD modes: slot vs queue (e-task-opd-01)
-- ============================================================================
-- Migration: 028_opd_modes.sql
-- Date: 2026-03-24
-- Description:
--   Add doctor_settings.opd_mode (default slot) and optional opd_policies JSONB.
--   Add opd_queue_entries for queue-mode token/position per appointment per day.
--   RLS: doctor owns rows; backend uses service role.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. doctor_settings: OPD mode + optional policy blob
-- ----------------------------------------------------------------------------
ALTER TABLE doctor_settings ADD COLUMN IF NOT EXISTS opd_mode TEXT NOT NULL DEFAULT 'slot'
  CONSTRAINT doctor_settings_opd_mode_check CHECK (opd_mode IN ('slot', 'queue'));

ALTER TABLE doctor_settings ADD COLUMN IF NOT EXISTS opd_policies JSONB NULL;

COMMENT ON COLUMN doctor_settings.opd_mode IS 'OPD scheduling: slot=fixed calendar; queue=token+ETA (OPD initiative)';
COMMENT ON COLUMN doctor_settings.opd_policies IS 'Optional JSON policy keys (grace minutes, queue caps); see DB_SCHEMA.md';

-- ----------------------------------------------------------------------------
-- 2. opd_queue_entries: one row per appointment when in queue mode (MVP)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS opd_queue_entries (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  appointment_id        UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  session_date          DATE NOT NULL,
  token_number          INTEGER NOT NULL,
  position              INTEGER NOT NULL DEFAULT 0,
  status                TEXT NOT NULL DEFAULT 'waiting'
    CONSTRAINT opd_queue_entries_status_check CHECK (
      status IN ('waiting', 'called', 'in_consultation', 'completed', 'skipped', 'missed', 'cancelled')
    ),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT opd_queue_entries_one_per_appointment UNIQUE (appointment_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_opd_queue_entries_doctor_session_token
  ON opd_queue_entries (doctor_id, session_date, token_number);

CREATE INDEX IF NOT EXISTS idx_opd_queue_entries_doctor_session
  ON opd_queue_entries (doctor_id, session_date);

CREATE INDEX IF NOT EXISTS idx_opd_queue_entries_doctor_id
  ON opd_queue_entries (doctor_id);

COMMENT ON TABLE opd_queue_entries IS 'Queue-mode OPD: token and order per appointment (migration 028)';

-- ----------------------------------------------------------------------------
-- 3. RLS (doctor JWT; service role bypasses RLS for backend admin client)
-- ----------------------------------------------------------------------------
ALTER TABLE opd_queue_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Doctors can read own opd queue entries" ON opd_queue_entries;
DROP POLICY IF EXISTS "Doctors can insert own opd queue entries" ON opd_queue_entries;
DROP POLICY IF EXISTS "Doctors can update own opd queue entries" ON opd_queue_entries;
DROP POLICY IF EXISTS "Doctors can delete own opd queue entries" ON opd_queue_entries;

CREATE POLICY "Doctors can read own opd queue entries"
  ON opd_queue_entries FOR SELECT
  USING (doctor_id = auth.uid());

CREATE POLICY "Doctors can insert own opd queue entries"
  ON opd_queue_entries FOR INSERT
  WITH CHECK (doctor_id = auth.uid());

CREATE POLICY "Doctors can update own opd queue entries"
  ON opd_queue_entries FOR UPDATE
  USING (doctor_id = auth.uid())
  WITH CHECK (doctor_id = auth.uid());

CREATE POLICY "Doctors can delete own opd queue entries"
  ON opd_queue_entries FOR DELETE
  USING (doctor_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 4. updated_at trigger
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS opd_queue_entries_updated_at ON opd_queue_entries;
CREATE TRIGGER opd_queue_entries_updated_at
  BEFORE UPDATE ON opd_queue_entries
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Migration Complete
-- ============================================================================
