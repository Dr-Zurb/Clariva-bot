-- Migration: 016_appointments_reason_for_visit.sql
-- Date: 2026-03-16
-- Description: Add reason_for_visit column; split from notes.
--   reason_for_visit = patient's main complaint (required for new bookings)
--   notes = optional patient extras + doctor default_notes

-- 1. Add column
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS reason_for_visit TEXT NULL;
COMMENT ON COLUMN appointments.reason_for_visit IS 'Patient main complaint/symptom (required for new bookings). Migration 016.';

-- 2. Backfill: notes like "Reason: X" or "Reason: X. Y"
UPDATE appointments
SET
  reason_for_visit = CASE
    WHEN POSITION('. ' IN SUBSTRING(notes FROM 9)) > 0
    THEN TRIM(SUBSTRING(SUBSTRING(notes FROM 9) FROM 1 FOR POSITION('. ' IN SUBSTRING(notes FROM 9)) - 1))
    ELSE TRIM(SUBSTRING(notes FROM 9))
  END,
  notes = CASE
    WHEN POSITION('. ' IN SUBSTRING(notes FROM 9)) > 0
    THEN NULLIF(TRIM(SUBSTRING(SUBSTRING(notes FROM 9) FROM POSITION('. ' IN SUBSTRING(notes FROM 9)) + 2)), '')
    ELSE NULL
  END
WHERE notes IS NOT NULL AND notes LIKE 'Reason: %';

-- 3. Backfill: notes exists but doesn't start with "Reason:" (legacy format)
UPDATE appointments
SET
  reason_for_visit = notes,
  notes = NULL
WHERE notes IS NOT NULL AND notes NOT LIKE 'Reason: %' AND reason_for_visit IS NULL;
