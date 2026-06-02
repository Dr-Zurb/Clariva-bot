-- ============================================================================
-- 066_doctor_dashboard_events.sql
-- Plan 07 · Task 30 (mutual replay notifications — doctor-side feed)
-- Date:    2026-04-19
-- ============================================================================
-- Purpose:
--   Land the `doctor_dashboard_events` table. Decision 4 LOCKED mutual
--   accountability for every recording replay: when a patient replays their
--   consult, the doctor sees a dashboard event in their feed (NO DM / SMS /
--   email — Decision 4 principle 8 explicitly carves doctor-facing replay
--   notifications out of the urgent fan-out to avoid notification fatigue).
--
--   This table is the storage layer Task 30's `notifyDoctorOfPatientReplay`
--   helper inserts into, and Task 30's `<DoctorDashboardEventFeed>` reads
--   from. v1 lights up exactly one event_kind (`patient_replayed_recording`).
--
--   Why a new table instead of reusing `audit_logs` /
--   `recording_access_audit`? Audit logs are append-only metadata-only,
--   sized for retention. A user-facing feed needs (a) a structured payload
--   the UI can render (artifact_type, patient_display_name, consult_date,
--   recording_access_audit_id), (b) a lightweight per-row mutation path
--   (`acknowledged_at = now()` when the doctor clicks "Mark as read"), and
--   (c) RLS that lets the doctor read their own rows directly. The two
--   workloads don't overlap cleanly; separate tables serve both better.
--
-- Schema shape:
--
--   One row per dashboard-surfacable event for the doctor. v1 only emits
--   from the recording-replay path (patient or support-staff replay → row
--   inserted by `notifyDoctorOfPatientReplay`). Future plans add events
--   additively:
--     - Plan 08: `patient_replayed_video` (after video escalation ships).
--     - Plan 09: `modality_switched_mid_consult`.
--     - Plan 02 follow-up: `recording_stopped_by_patient_request`.
--
--   `event_kind` is TEXT + CHECK (not ENUM) so plans 08/09 widen via
--   `DROP CONSTRAINT` + `ADD CONSTRAINT` without an ALTER TYPE round-trip
--   (matches Plan 06 Task 39's `sender_role` widening pattern).
--
--   `payload` is JSONB. Per-event-kind shapes are documented at the call
--   site (notification-service.ts#notifyDoctorOfPatientReplay) and pinned
--   by unit tests. Initial v1 shape for `patient_replayed_recording`:
--     {
--       "artifact_type":             "audio" | "transcript",
--       "recording_access_audit_id": "<uuid of the recording_access_audit row>",
--       "patient_display_name":      "<resolved at insert time, may be empty>",
--       "replayed_at":               "<ISO timestamp>",
--       "consult_date":              "<ISO timestamp from session.actual_ended_at>",
--       "accessed_by_role":          "patient" | "support_staff",
--       "accessed_by_user_id":       "<uuid of the actual replayer>",
--       "escalation_reason":         "<free text — present iff role='support_staff'>"
--     }
--
--   `session_id ON DELETE SET NULL` (NOT cascade) so the feed row survives
--   if `consultation_sessions` is hard-deleted at regulatory retention end
--   — the doctor still has the audit trail of "I was notified of a patient
--   replay on this date" even after the session row is gone.
--
--   `acknowledged_at NULLS FIRST` index — the UI queries unread-first.
--   Postgres btree defaults to NULLS LAST for ascending order; the explicit
--   NULLS FIRST aligns the index with the query pattern.
--
-- Safety:
--   - `CREATE TABLE IF NOT EXISTS` is idempotent.
--   - RLS enabled with two policies:
--       * SELECT: doctor reads their own rows.
--       * UPDATE: doctor sets `acknowledged_at` on their own rows.
--     INSERT is service-role-only (the notification helper uses the admin
--     client which bypasses RLS). DELETE is service-role-only too — events
--     persist for ~30 days and are swept by a future retention worker
--     (out-of-scope for v1; volume is one row per replay per doctor, low).
--
-- Rollback:
--   Reverse ops at the file foot. Do NOT revert once events have been
--   surfaced to doctors — losing the acknowledged_at state would re-flag
--   already-read events, confusing the UI.
-- ============================================================================

CREATE TABLE IF NOT EXISTS doctor_dashboard_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- The doctor whose feed this event belongs to. ON DELETE CASCADE so a
    -- doctor account closure also removes their feed history (the events
    -- are personal to that doctor; they have no cross-account audit value).
    doctor_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- v1 set: 'patient_replayed_recording'. Plans 08/09 widen this CHECK
    -- additively (DROP CONSTRAINT + ADD CONSTRAINT with the wider IN list,
    -- matching the Plan 06 Task 39 sender_role widening pattern).
    event_kind      TEXT NOT NULL CHECK (event_kind IN (
                      'patient_replayed_recording'
                    )),

    -- The session this event refers to. SET NULL (not CASCADE) so a
    -- post-retention session purge leaves the event row intact for the
    -- doctor's "I was notified" history.
    session_id      UUID REFERENCES consultation_sessions(id) ON DELETE SET NULL,

    -- Per-event-kind structured payload. See header for v1 shape.
    payload         JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- Set when the doctor clicks "Mark as read". NULL = unread.
    acknowledged_at TIMESTAMPTZ,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Hot read: per-doctor unread-first feed. NULLS FIRST aligns the index
-- with the UI query pattern ("show unread events at the top").
CREATE INDEX IF NOT EXISTS idx_doctor_dashboard_events_doctor_unread
    ON doctor_dashboard_events(doctor_id, acknowledged_at NULLS FIRST, created_at DESC);

-- ----------------------------------------------------------------------------
-- RLS: doctor reads + acknowledges their own rows. Service-role bypasses RLS
-- for the INSERT path (notification-service.ts uses the admin client).
-- ----------------------------------------------------------------------------
ALTER TABLE doctor_dashboard_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS doctor_dashboard_events_select_self ON doctor_dashboard_events;
CREATE POLICY doctor_dashboard_events_select_self
    ON doctor_dashboard_events
    FOR SELECT
    USING (doctor_id = auth.uid());

DROP POLICY IF EXISTS doctor_dashboard_events_update_self ON doctor_dashboard_events;
CREATE POLICY doctor_dashboard_events_update_self
    ON doctor_dashboard_events
    FOR UPDATE
    USING (doctor_id = auth.uid())
    WITH CHECK (doctor_id = auth.uid());
-- INSERT is intentionally service-role-only. No DELETE policy — retention
-- is handled by a future cleanup worker.

COMMENT ON TABLE doctor_dashboard_events IS
    'Plan 07 Task 30. Doctor-facing event feed (replay notifications today; widens additively in Plans 08/09). RLS: doctor reads + acknowledges own rows; INSERT service-role-only.';
COMMENT ON COLUMN doctor_dashboard_events.doctor_id IS
    'FK to auth.users(id) ON DELETE CASCADE — feed row dies with the account.';
COMMENT ON COLUMN doctor_dashboard_events.event_kind IS
    'patient_replayed_recording. CHECK widens additively in Plans 08/09 (DROP CONSTRAINT + ADD CONSTRAINT).';
COMMENT ON COLUMN doctor_dashboard_events.session_id IS
    'FK to consultation_sessions(id) ON DELETE SET NULL — event survives session purge so the doctor keeps "I was notified" history.';
COMMENT ON COLUMN doctor_dashboard_events.payload IS
    'Pinned JSONB shape per event_kind. patient_replayed_recording: {artifact_type, recording_access_audit_id, patient_display_name, replayed_at, consult_date, accessed_by_role, accessed_by_user_id, escalation_reason?}.';
COMMENT ON COLUMN doctor_dashboard_events.acknowledged_at IS
    'Set when the doctor clicks "Mark as read". NULL = unread. Drives unread-first ordering.';

-- ============================================================================
-- Reverse migration (documented; kept in-file so the reverse op is one
-- grep away). Do NOT revert once events have been surfaced to doctors.
--
--   DROP POLICY IF EXISTS doctor_dashboard_events_update_self ON doctor_dashboard_events;
--   DROP POLICY IF EXISTS doctor_dashboard_events_select_self ON doctor_dashboard_events;
--   DROP INDEX IF EXISTS idx_doctor_dashboard_events_doctor_unread;
--   DROP TABLE IF EXISTS doctor_dashboard_events;
-- ============================================================================
