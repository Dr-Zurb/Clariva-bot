-- ============================================================================
-- 192_appointment_booking_origin.sql
-- ============================================================================
-- Date: 2026-08-11
-- Batch: opd-status-model (osm-01)
-- Description:
--   Adds `appointments.booking_origin` so OPD provenance is stored at write
--   time instead of inferred from created_at ordering (isAppendedAfterDay).
--   Operational label only — not PHI. Backfill uses the only known-good
--   signal (opd_event_type = return_after_completed). Does NOT backfill from
--   the appended-after-day heuristic (OSM-D9).
--
-- Not on hard-rules list:
--   - No RLS shape change.
--   - No PHI columns.
--
-- Rollback (document only):
--   ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_booking_origin_check;
--   ALTER TABLE appointments DROP COLUMN IF EXISTS booking_origin;
-- ============================================================================

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS booking_origin TEXT NOT NULL DEFAULT 'booked';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'appointments_booking_origin_check'
  ) THEN
    ALTER TABLE appointments
      ADD CONSTRAINT appointments_booking_origin_check
      CHECK (
        booking_origin IN (
          'booked',
          'walk_in',
          'overflow',
          'return_after_completed',
          'rebooked'
        )
      );
  END IF;
END $$;

-- OSM-D9: only known-good provenance. Do not launder isAppendedAfterDay.
UPDATE appointments
SET booking_origin = 'return_after_completed'
WHERE opd_event_type = 'return_after_completed'
  AND booking_origin = 'booked';

COMMENT ON COLUMN appointments.booking_origin IS
  'How the appointment entered the day (osm-01). Operational label, not PHI. Values: booked | walk_in | overflow | return_after_completed | rebooked. Set at create / mode-conversion write paths (osm-04).';
