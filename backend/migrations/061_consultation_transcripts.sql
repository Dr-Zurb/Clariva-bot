-- ============================================================================
-- 061_consultation_transcripts.sql
-- Plan 05 · Task 25 · Decision 12 LOCKED (voice recording inherits Decision 4)
-- Date: 2026-04-19
-- ============================================================================
-- Purpose:
--   Persist voice (and future video-audio) transcripts produced by the
--   post-consult pipeline. One row per (session, provider) so a re-run on a
--   different provider for QA does NOT overwrite the canonical row — the
--   unique index is the idempotency contract.
--
--   Task 25 decided `consultation_transcripts` lives on its own rather than
--   riding on Plan 02's `recording_artifact_index` (migration 056). Rationale
--   (mirrored in the task doc Notes #1):
--     * `recording_artifact_index` owns the audio COMPOSITION FILE lifecycle
--       (URI, bytes, 90-day self-serve hide, hard-delete). Transcripts are a
--       DERIVED artifact with a separate lifecycle (re-runnable; multiple per
--       session for provider QA; independently pruneable).
--     * The two tables join cleanly on `composition_sid` / `storage_uri`
--       when cross-referencing is needed.
--
-- Relationship to other tables:
--   * `consultation_session_id REFERENCES consultation_sessions(id)
--      ON DELETE CASCADE` — if the session row is (somehow, post-archival)
--      removed, the transcript goes with it. This is safe because the
--      archival worker (Plan 02 / Task 34) hard-deletes ARTIFACTS, not
--      SESSION rows; session rows are retained through the regulatory
--      retention window even when recordings are long gone.
--   * `composition_sid` is opaque at the schema level. It is the Twilio
--      Composition SID when one exists; during the narrow window between
--      `endSession` and Twilio's Composition-finalized webhook it may be
--      the room SID as a placeholder (the worker resolves the real
--      Composition SID on first poll). See `voice-transcription-service.ts`.
--
-- Worker / job state lives on this row:
--   * `status`        — queued | processing | completed | failed
--   * `retry_count`   — incremented per 5xx / transient failure; capped at
--                       `VOICE_TRANSCRIPTION_MAX_RETRIES` (default 5). Once
--                       the cap is hit the row flips to `'failed'`.
--   * `error_message` — populated for `'failed'` rows; NULL otherwise.
--
--   Single-table simplicity (no separate jobs table) — the tradeoff is that
--   the `consultation_transcripts` row carries some in-flight state. This is
--   acceptable because `(session, provider)` is the natural identity of a
--   transcript and the worker pattern is stable-identity retries, not
--   fan-out jobs.
--
-- Cost telemetry:
--   `cost_usd_cents` is populated on 'completed' rows so a future daily
--   materialized view (or an ops-dashboard aggregation query) can track
--   Whisper vs Deepgram unit economics without a JOIN through logs. The
--   service also emits a structured `logger.info('voice-transcription:
--   completed', ...)` line as the ops-dashboard hook.
--
-- RLS:
--   None in v1. Backend-only access (service role). Plan 07 (post-consult
--   doctor replay surface) will add doctor-side read RLS when it ships; the
--   table pattern today mirrors `recording_artifact_index` (migration 056)
--   which is also service-role-only with doctor / patient access gated at
--   the consuming plan's endpoints.
--
-- Safety:
--   * `CREATE TABLE IF NOT EXISTS` so re-running this migration is a no-op
--     on an environment that has already applied it.
--   * All indexes are `IF NOT EXISTS`.
--   * Additive only — no ALTER of any existing table.
-- ============================================================================

CREATE TABLE IF NOT EXISTS consultation_transcripts (
    id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Anchor the transcript to a consultation. CASCADE so transcripts go with
    -- the session when (if ever) the session row is hard-pruned. In the happy
    -- path the session row outlives the transcript — this is belt-and-braces.
    consultation_session_id     UUID        NOT NULL REFERENCES consultation_sessions(id) ON DELETE CASCADE,

    -- Which provider produced this row. CHECK keeps the enum small; add a new
    -- value in a follow-up migration when a third provider lands.
    provider                    TEXT        NOT NULL CHECK (provider IN ('openai_whisper', 'deepgram_nova_2')),

    -- e.g. 'en-IN', 'hi-IN', 'en-US'. Free-text to allow future BCP-47 codes
    -- without a schema bump; `voice-transcription-service.ts#selectProvider`
    -- owns the routing map.
    language_code               TEXT        NOT NULL,

    -- Provider's native JSON shape (Whisper `verbose_json` / Deepgram
    -- transcripts.channels[0].alternatives[0]). Downstream readers should
    -- treat this as opaque per-provider.
    transcript_json             JSONB       NOT NULL DEFAULT '{}'::jsonb,

    -- Denormalised plain-text concat. Enables `SELECT transcript_text`
    -- without paying to re-parse the JSON — Plan 10 (AI clinical assist)
    -- will read this column.
    transcript_text             TEXT        NOT NULL DEFAULT '',

    duration_seconds            INTEGER     NOT NULL DEFAULT 0 CHECK (duration_seconds >= 0),

    -- Minor units (cents). INTEGER is fine — at $0.006/min Whisper pricing a
    -- 24-hour consult is 864 cents which fits comfortably inside a 32-bit
    -- signed integer.
    cost_usd_cents              INTEGER     NOT NULL DEFAULT 0 CHECK (cost_usd_cents >= 0),

    -- Twilio Composition SID (or placeholder room SID during the short
    -- window between endSession and Composition-finalized; worker resolves).
    composition_sid             TEXT        NOT NULL,

    status                      TEXT        NOT NULL DEFAULT 'queued'
                                            CHECK (status IN ('queued', 'processing', 'completed', 'failed')),

    -- 5xx / network retries. Capped by env `VOICE_TRANSCRIPTION_MAX_RETRIES`.
    -- Lives on this row (vs a separate jobs table) for single-table simplicity;
    -- the row's identity `(session, provider)` is stable across retries.
    retry_count                 INTEGER     NOT NULL DEFAULT 0 CHECK (retry_count >= 0),

    error_message               TEXT,

    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at                  TIMESTAMPTZ,
    completed_at                TIMESTAMPTZ
);

-- Idempotency contract: one row per (session, provider). Re-enqueue from a
-- retried `endSession` collapses to ON CONFLICT DO NOTHING. A manual QA
-- re-run on a different provider (e.g. Whisper vs Deepgram on the same
-- Hindi consult) gets its own row, which is the intended escape hatch.
CREATE UNIQUE INDEX IF NOT EXISTS consultation_transcripts_session_provider_unique
    ON consultation_transcripts(consultation_session_id, provider);

-- Worker scan index: "give me the next batch of queued jobs in FIFO order".
-- Partial index keeps it proportional to pending work, not to historical
-- completed transcripts.
CREATE INDEX IF NOT EXISTS consultation_transcripts_status_created_idx
    ON consultation_transcripts(status, created_at)
    WHERE status IN ('queued', 'processing');

-- Ops-triage index: "show me failures over the last N days" — used by the
-- cost-watch / failure-rate dashboards.
CREATE INDEX IF NOT EXISTS consultation_transcripts_failed_created_idx
    ON consultation_transcripts(created_at)
    WHERE status = 'failed';

-- ----------------------------------------------------------------------------
-- RLS: service-role only. Doctor access is gated at Plan 07's replay
-- endpoints. Patient access: none in v1 (support-ticket only per Plan 07).
-- ----------------------------------------------------------------------------
ALTER TABLE consultation_transcripts ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE consultation_transcripts IS
    'Plan 05 / Task 25: per-session voice (and future video-audio) transcript. One row per session per provider so re-runs on a different provider for QA do not overwrite the canonical row. Service-role-only RLS; Plan 07 adds doctor-side read access.';
COMMENT ON COLUMN consultation_transcripts.consultation_session_id IS
    'FK to consultation_sessions(id) ON DELETE CASCADE.';
COMMENT ON COLUMN consultation_transcripts.provider IS
    'openai_whisper | deepgram_nova_2. See voice-transcription-service.ts#selectProvider for the routing map.';
COMMENT ON COLUMN consultation_transcripts.composition_sid IS
    'Twilio Composition SID, or room SID placeholder during the endSession → Composition-finalized window. Worker resolves the real Composition SID on first poll.';
COMMENT ON COLUMN consultation_transcripts.status IS
    'queued | processing | completed | failed. Worker owns transitions.';
COMMENT ON COLUMN consultation_transcripts.retry_count IS
    'Incremented on transient (5xx / network) failure. Capped at VOICE_TRANSCRIPTION_MAX_RETRIES before flipping status to failed.';

-- ============================================================================
-- Reverse migration (documented; kept in-file so the reverse op is one grep
-- away, consistent with the repo convention — see migrations 053 / 058).
--
--   DROP INDEX IF EXISTS consultation_transcripts_failed_created_idx;
--   DROP INDEX IF EXISTS consultation_transcripts_status_created_idx;
--   DROP INDEX IF EXISTS consultation_transcripts_session_provider_unique;
--   DROP TABLE IF EXISTS consultation_transcripts;
--
-- Warning: any captured transcripts are permanently lost. Prefer superseding
-- with a new migration over reverting.
-- ============================================================================
