-- ============================================================================
-- 056_recording_artifact_index.sql
-- Plan 02 · Task 34
-- Date:    2026-04-19
-- ============================================================================
-- Purpose:
--   Plan 02 open question #2 accepted: use a dedicated `recording_artifact_index`
--   table rather than scattering visibility / deletion flags across
--   `consultation_sessions.recording_artifact_ref` text columns. Plans 04 / 05
--   (voice and video recording) and Plan 07 (recording replay) INSERT one row
--   per artifact they produce; Plan 07's replay player READs the
--   `patient_self_serve_visible` flag to decide whether a patient-side lookup
--   404s; this task's archival worker WRITEs both the visibility flag (hide
--   phase) and `hard_deleted_at` (delete phase).
--
--   Artifact kinds tracked today:
--     * 'audio_composition'  — Plan 05 (Twilio audio compositions)
--     * 'video_composition'  — Plan 08 (Twilio video compositions post-escalation)
--     * 'transcript'         — Plan 07 (server-side PDF rendering)
--     * 'chat_export'        — Plan 06 / 07 (text consult chat export)
--
--   Free-text `artifact_kind` rather than an ENUM so the set can grow without
--   a schema bump (audio_redacted, video_lowres_preview, etc). Service-layer
--   code normalises and validates known values.
--
-- Relationship to other tables:
--   * `session_id` REFERENCES consultation_sessions(id) ON DELETE RESTRICT —
--     the session row cannot be deleted while artifacts are still indexed.
--     That's intentional: consultation_sessions is the anchor for clinical
--     retention, deleting it out from under an indexed recording would leave
--     an orphan we cannot audit. Hard-delete via the archival worker happens
--     first; only then can the session row be (separately) pruned.
--   * No FK to `appointments` — one appointment can have multiple sessions
--     (voice → video escalation, Plan 09), each with their own artifacts.
--   * `storage_uri` is opaque to the schema (bucket/path convention documented
--     in `storage-service.ts#deleteObject`). The UNIQUE tuple prevents the
--     same artifact being indexed twice by a retried upload.
--
-- Out of scope:
--   * Doctor-facing "how much storage am I using" dashboard. `bytes` is
--     populated where cheap (Twilio compositions expose size in webhook
--     payloads) but not load-bearing — NULL is always acceptable.
--   * Per-artifact access-control overrides. Access gating happens at the
--     consuming plan (Plan 07 for replay). This table is just the artifact
--     registry + lifecycle flags.
-- ============================================================================

CREATE TABLE IF NOT EXISTS recording_artifact_index (
    id                            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Anchors the artifact to a consultation. ON DELETE RESTRICT because the
    -- archival worker is the only thing allowed to "remove" an artifact; a
    -- cascading delete from consultation_sessions would bypass
    -- `archival_history` logging and is treated as a bug.
    session_id                    UUID        NOT NULL REFERENCES consultation_sessions(id) ON DELETE RESTRICT,

    artifact_kind                 TEXT        NOT NULL,

    -- Opaque URI. Convention for Supabase storage: '<bucket>/<path>' — e.g.
    -- 'recordings/patient_<uuid>/sess_<uuid>/audio.mp4'. The worker splits on
    -- the first slash to route DELETE calls; see storage-service.ts.
    storage_uri                   TEXT        NOT NULL,

    -- Optional size. Useful for ops "storage freed this month" reports.
    bytes                         BIGINT,

    -- Plan 07 replay player reads this flag. When FALSE the player 404s
    -- patient requests; doctor-side lookups ignore the flag (doctors retain
    -- access throughout the regulatory retention window).
    patient_self_serve_visible    BOOLEAN     NOT NULL DEFAULT TRUE,

    -- Set when the archival worker's hide phase transitions
    -- patient_self_serve_visible TRUE → FALSE. Used by the admin-preview API
    -- to display "hidden X days ago" metadata for ops triage.
    patient_self_serve_hidden_at  TIMESTAMPTZ,

    -- Set when the archival worker's hard-delete phase removes the underlying
    -- storage object. Worker asserts IS NULL inside the same transaction as
    -- the storage call (row lock) to defend against double-delete attempts
    -- under concurrent cron runs. Never NULLed back to TRUE — once deleted,
    -- the artifact is gone and re-running the delete is a no-op.
    hard_deleted_at               TIMESTAMPTZ,

    created_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- One row per (session, kind, storage URI). A retried upload to the same
    -- path collapses to one row; an uploader wanting to overwrite should
    -- DELETE + INSERT (rare — usually compositions land at fresh paths).
    UNIQUE (session_id, artifact_kind, storage_uri)
);

-- Lookup-by-session is the Plan 07 hot path ("give me every artifact for
-- this consult for the replay UI").
CREATE INDEX IF NOT EXISTS idx_recording_artifact_session
    ON recording_artifact_index(session_id);

-- Ops-triage index: "show me artifacts that have been hidden but not yet
-- hard-deleted", ordered by when they were hidden. Partial-indexed on the
-- two predicates so the index stays small (only the slice the admin-preview
-- API actually reads from).
CREATE INDEX IF NOT EXISTS idx_recording_artifact_visibility_hidden_at
    ON recording_artifact_index(patient_self_serve_hidden_at)
    WHERE patient_self_serve_visible = FALSE AND hard_deleted_at IS NULL;

-- Worker-scan index: the hide phase and the hard-delete phase SELECT by
-- `hard_deleted_at IS NULL` joined to `consultation_sessions.actual_ended_at`.
-- A partial index on `hard_deleted_at IS NULL` keeps the worker's scan
-- proportional to live artifacts, not to the full archived history.
CREATE INDEX IF NOT EXISTS idx_recording_artifact_live
    ON recording_artifact_index(session_id)
    WHERE hard_deleted_at IS NULL;

-- ----------------------------------------------------------------------------
-- RLS: service-role only. Doctor / patient access to individual artifacts is
-- gated at the replay endpoint (Plan 07), not at the row level.
-- ----------------------------------------------------------------------------
ALTER TABLE recording_artifact_index ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE recording_artifact_index IS
    'Registry of clinical-recording artifacts. Plans 04/05/07/08 INSERT one row per artifact. Plan 07 reads patient_self_serve_visible. Task 34 worker writes patient_self_serve_hidden_at and hard_deleted_at.';
COMMENT ON COLUMN recording_artifact_index.session_id IS
    'References consultation_sessions(id) ON DELETE RESTRICT. The session cannot be dropped while artifacts are indexed.';
COMMENT ON COLUMN recording_artifact_index.artifact_kind IS
    'Free-text kind: audio_composition | video_composition | transcript | chat_export. New kinds do not require a schema bump.';
COMMENT ON COLUMN recording_artifact_index.storage_uri IS
    'Opaque URI. Supabase convention: <bucket>/<path>. storage-service.ts#deleteObject parses it.';
COMMENT ON COLUMN recording_artifact_index.patient_self_serve_visible IS
    'FALSE after Task 34 hide phase fires at +90 days. Plan 07 replay player 404s patient-side requests when FALSE.';
COMMENT ON COLUMN recording_artifact_index.patient_self_serve_hidden_at IS
    'Wall-clock timestamp of the hide-phase transition. NULL while the artifact is still patient-visible.';
COMMENT ON COLUMN recording_artifact_index.hard_deleted_at IS
    'Set when the archival worker hard-deletes the underlying storage object. Once set, re-runs are no-ops.';

-- ============================================================================
-- Migration Complete
-- ============================================================================
