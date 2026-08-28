-- ============================================================================
-- 182_alerts_v2_event_kind_widen_and_dedupe.sql
-- Alerts v2 · alr2-01 — widen doctor_dashboard_events.event_kind CHECK +
-- add generalized dedupe_key (ALR2-D2 / ALR2-D5).
-- Date:    2026-07-21
-- ============================================================================
-- Purpose:
--   Two additive changes that land with Alerts v2 Wave 1:
--
--   1. Widen `doctor_dashboard_events.event_kind` CHECK to include the two
--      new doctor-facing kinds:
--        · `booking_review_sla_breach`  (action-needed)
--        · `appointment_no_show`        (informational)
--
--      Additive CHECK widening pattern mirrors Migrations 073 / 074
--      (DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT with the **full**
--      enumerated list). Legacy kinds stay legal; no backfill.
--
--   2. Add `dedupe_key TEXT` + a partial unique index
--      `uq_doctor_dashboard_events_dedupe ON (doctor_id, dedupe_key)
--      WHERE dedupe_key IS NOT NULL` so emitters can dedupe without
--      per-kind JSONB path checks (ALR2-D5). Legacy rows keep
--      `dedupe_key = NULL` and do not collide. Service wiring that
--      writes the key lands in alr2-02.
--
-- RLS (re-confirmed, unchanged):
--   New kinds are inserted via the service-role admin client (same path
--   as every existing kind). The existing policies
--   `doctor_dashboard_events_select_self` and
--   `doctor_dashboard_events_update_self` (`doctor_id = auth.uid()`)
--   already cover doctor reads + acknowledges of the new rows.
--   **No policy change is required** — this migration does not
--   CREATE / DROP / ALTER any RLS policy.
--
-- Safety:
--   · DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT is idempotent on re-run.
--   · ADD COLUMN IF NOT EXISTS + CREATE UNIQUE INDEX IF NOT EXISTS are
--     idempotent. No backfill.
--   · Pre-existing rows use only the three legacy kinds, which remain
--     legal under the widened CHECK; their `dedupe_key` stays NULL.
--
-- Reverse migration:
--   Documented at the file foot. Do NOT revert once Alerts v2 rows exist
--   in production — the doctor's feed + emitter dedupe would regress.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Part 1 — doctor_dashboard_events.event_kind widening
--
-- Migration 066 introduced `patient_replayed_recording`.
-- Migration 073 widened to add `patient_revoked_video_mid_session`.
-- Migration 074 widened to add `patient_replayed_video`.
-- This widening adds `booking_review_sla_breach` + `appointment_no_show`
-- (alerts-v2 · ALR2-D2).
-- ----------------------------------------------------------------------------

ALTER TABLE doctor_dashboard_events
    DROP CONSTRAINT IF EXISTS doctor_dashboard_events_event_kind_check;
ALTER TABLE doctor_dashboard_events
    ADD CONSTRAINT doctor_dashboard_events_event_kind_check CHECK (
      event_kind IN (
        'patient_replayed_recording',
        'patient_revoked_video_mid_session',
        'patient_replayed_video',
        'booking_review_sla_breach',
        'appointment_no_show'
      )
    );

COMMENT ON COLUMN doctor_dashboard_events.event_kind IS
    'Plan 07 Task 30 + Plan 08 Tasks 42/44 + Alerts v2 (alr2-01). Legal values: '
    'patient_replayed_recording, patient_revoked_video_mid_session, '
    'patient_replayed_video, booking_review_sla_breach, appointment_no_show. '
    'Future plans widen additively via DROP/ADD CONSTRAINT.';

-- ----------------------------------------------------------------------------
-- Part 2 — generalized dedupe_key (ALR2-D5)
-- ----------------------------------------------------------------------------

ALTER TABLE doctor_dashboard_events
    ADD COLUMN IF NOT EXISTS dedupe_key TEXT;

-- One event per (doctor, dedupe_key) when a key is supplied. Partial unique
-- index so legacy rows (NULL dedupe_key) are unaffected and do not collide.
CREATE UNIQUE INDEX IF NOT EXISTS uq_doctor_dashboard_events_dedupe
    ON doctor_dashboard_events(doctor_id, dedupe_key)
    WHERE dedupe_key IS NOT NULL;

COMMENT ON COLUMN doctor_dashboard_events.dedupe_key IS
    'Alerts v2 · alr2-01 (ALR2-D5). Caller-supplied idempotency key for '
    'insertDashboardEvent. NULL on legacy rows. Partial unique index '
    'uq_doctor_dashboard_events_dedupe enforces one row per '
    '(doctor_id, dedupe_key) when set. Examples: review_request_id, '
    'appointment_id, recording_access_audit_id.';

-- ============================================================================
-- Reverse migration (documented; kept in-file so the reverse op is one
-- grep away). Do NOT revert once Alerts v2 rows exist in production —
-- the doctor's feed + emitter dedupe would regress.
--
--   DROP INDEX IF EXISTS uq_doctor_dashboard_events_dedupe;
--   ALTER TABLE doctor_dashboard_events
--       DROP COLUMN IF EXISTS dedupe_key;
--
--   ALTER TABLE doctor_dashboard_events
--       DROP CONSTRAINT IF EXISTS doctor_dashboard_events_event_kind_check;
--   ALTER TABLE doctor_dashboard_events
--       ADD CONSTRAINT doctor_dashboard_events_event_kind_check CHECK (
--         event_kind IN (
--           'patient_replayed_recording',
--           'patient_revoked_video_mid_session',
--           'patient_replayed_video'
--         )
--       );
-- ============================================================================
