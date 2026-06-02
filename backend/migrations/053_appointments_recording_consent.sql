-- ============================================================================
-- 053_appointments_recording_consent.sql
-- Plan 02 · Task 27 · Decision 4 LOCKED
-- Date:    2026-04-19
-- ============================================================================
-- Purpose:
--   Decision 4 locked `recording-on-by-default` with patient consent captured
--   at booking and a soft re-pitch on first decline. This migration adds the
--   per-appointment columns that record the patient's answer + the exact
--   consent wording version they saw.
--
--   The capture surface is `appointments.recording_consent_*`; every
--   consultation session joins back through `consultation_sessions.appointment_id`
--   so the read path (doctor-side banner, Plan 04/05 recording gate) stays
--   session-keyed while the source of truth lives on the appointment row.
--
-- Columns introduced (all nullable — existing rows keep working):
--   recording_consent_decision BOOLEAN
--     · NULL  → patient never answered (pre-Task-27 bookings, or bot dropped
--               before asking). Downstream treats NULL conservatively — see
--               `recording-consent-service.ts` for the read-side semantics.
--     · TRUE  → patient opted in.
--     · FALSE → patient declined (possibly after the soft re-pitch). Consult
--               still proceeds; recording does not start.
--   recording_consent_at        TIMESTAMPTZ → when the decision was captured.
--   recording_consent_version   TEXT        → `RECORDING_CONSENT_VERSION` that
--                                             was in effect at capture time.
--                                             Snapshot; never overwritten on
--                                             later version bumps (that's the
--                                             legal-defensibility property).
--
-- Safety:
--   · Additive only — no drop, no constraint tightening on existing columns.
--   · `ADD COLUMN IF NOT EXISTS` so re-running is a no-op.
--   · No ENUM / trigger / index added here — decision is a cardinality-2
--     boolean, nobody filters by it in the hot path (the join from
--     `consultation_sessions` uses `appointment_id` which is already
--     indexed via migration 049).
--   · RLS already enforced on `appointments` (migration 002) — unchanged.
--
-- Rollback:
--   Reverse operations drop all three columns. If reverted after any
--   capture happened, those decisions are permanently lost. Prefer
--   superseding with a new migration over reverting.
-- ============================================================================

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS recording_consent_decision BOOLEAN;

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS recording_consent_at TIMESTAMPTZ;

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS recording_consent_version TEXT;

COMMENT ON COLUMN appointments.recording_consent_decision IS
  'Plan 02 Task 27 · NULL = not asked yet; TRUE = opted in; FALSE = declined (booking still proceeds, recording is gated off).';

COMMENT ON COLUMN appointments.recording_consent_at IS
  'Plan 02 Task 27 · Timestamp at which `recording_consent_decision` was captured. NULL iff decision is NULL.';

COMMENT ON COLUMN appointments.recording_consent_version IS
  'Plan 02 Task 27 · Snapshot of `RECORDING_CONSENT_VERSION` that was in effect at capture time. Never overwritten on later body-text bumps.';

-- ============================================================================
-- Reverse (documented only; kept in-file so the reverse op is one grep away).
--
--   ALTER TABLE appointments DROP COLUMN IF EXISTS recording_consent_version;
--   ALTER TABLE appointments DROP COLUMN IF EXISTS recording_consent_at;
--   ALTER TABLE appointments DROP COLUMN IF EXISTS recording_consent_decision;
-- ============================================================================
