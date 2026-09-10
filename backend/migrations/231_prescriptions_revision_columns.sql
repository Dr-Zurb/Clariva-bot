-- ============================================================================
-- 231_prescriptions_revision_columns.sql
-- Same-day revise identity on prescriptions (rx-lifecycle / rxl-21).
-- Date:    2026-09-10
-- ============================================================================
-- Purpose:
--   Give an issued prescription a version identity and a place to record
--   that it was handed over — without a snapshot table. A revision is a
--   new row (RXL-DL-13); this migration only adds the columns the clone
--   (rxl-22) and the write guard (rxl-23) will read.
--
--   No writer. No behaviour change on deploy. No backfill — historical
--   rows stay NULL and must not be given a fabricated Version 1.
--
-- Hard-rules:
--   - Additive ALTER. IF NOT EXISTS. Re-runnable as a no-op.
--   - RLS unchanged: doctor-owned via doctor_id (026) covers the new
--     columns. All four prescriptions policies still apply.
--   - No prescription_revisions snapshot table (superseded Phase 3).
--   - Self-FKs ON DELETE SET NULL — same as appointments.related_appointment_id
--     (031). CASCADE would wipe the sibling version. RESTRICT would block
--     appointment CASCADE delete when two versions exist.
--
-- Rollback (document only):
--   DROP INDEX IF EXISTS idx_prescriptions_supersedes_id;
--   DROP INDEX IF EXISTS idx_prescriptions_superseded_by_id;
--   ALTER TABLE prescriptions
--     DROP COLUMN IF EXISTS version,
--     DROP COLUMN IF EXISTS supersedes_id,
--     DROP COLUMN IF EXISTS superseded_by_id,
--     DROP COLUMN IF EXISTS revision_reason,
--     DROP COLUMN IF EXISTS issued_at,
--     DROP COLUMN IF EXISTS printed_at;
-- ============================================================================

ALTER TABLE prescriptions
  ADD COLUMN IF NOT EXISTS version INTEGER NULL;

ALTER TABLE prescriptions
  ADD COLUMN IF NOT EXISTS supersedes_id UUID NULL
    REFERENCES prescriptions(id) ON DELETE SET NULL;

ALTER TABLE prescriptions
  ADD COLUMN IF NOT EXISTS superseded_by_id UUID NULL
    REFERENCES prescriptions(id) ON DELETE SET NULL;

ALTER TABLE prescriptions
  ADD COLUMN IF NOT EXISTS revision_reason TEXT NULL;

ALTER TABLE prescriptions
  ADD COLUMN IF NOT EXISTS issued_at TIMESTAMPTZ NULL;

ALTER TABLE prescriptions
  ADD COLUMN IF NOT EXISTS printed_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN prescriptions.version IS
  'Revision number. Advances on re-issue only, never on autosave (RXL-DL-9). Null on drafts and historical rows; no backfill.';

COMMENT ON COLUMN prescriptions.supersedes_id IS
  'This row replaces that prescription (RXL-DL-12). Null on Version 1 and historical rows.';

COMMENT ON COLUMN prescriptions.superseded_by_id IS
  'Inverse of supersedes_id so a list can mark the old copy without joining. Null until a later version exists.';

COMMENT ON COLUMN prescriptions.revision_reason IS
  'Required on a revision at write time (RXL-Q8). Presets: dose_correction, drug_unavailable, clarified_for_pharmacy, added_missed_item, other. Null on Version 1 and historical rows.';

COMMENT ON COLUMN prescriptions.issued_at IS
  'First time this row left the clinic as an issued copy (send or print after Finish). Not attested_at (finish) and not printed_at (any print, including requisition). Null until issued.';

COMMENT ON COLUMN prescriptions.printed_at IS
  'Delivery event. A requisition print may set this without attesting (RXL-DL-16). Writer is later; column only.';

CREATE INDEX IF NOT EXISTS idx_prescriptions_supersedes_id
  ON prescriptions(supersedes_id)
  WHERE supersedes_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_prescriptions_superseded_by_id
  ON prescriptions(superseded_by_id)
  WHERE superseded_by_id IS NOT NULL;

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- RLS unchanged: auth.uid() = doctor_id (026) covers the new columns.
-- Additive only: existing rows stay NULL; reads and writes unaffected.
-- Partial indexes match 031 self-FK; rxl-22 / rxl-28 look these up.
-- ============================================================================
