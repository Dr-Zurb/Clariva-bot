-- ============================================================================
-- Multi-modality consultation sessions (Plan 01 · Task 15 · Decision 8 LOCKED)
-- ============================================================================
-- Migration: 049_consultation_sessions.sql
-- Date:      2026-04-19
-- Description:
--   Generalize the video-only `appointments.consultation_room_*` scaffolding
--   (migration 021) into a modality-blind `consultation_sessions` table that
--   supports text, voice, and video behind a single FK. Plans 04 (text) and
--   05 (voice) ship adapters that write into this table; Plan 03's
--   `<ConsultationLauncher>` reads from it.
--
--   Cutover strategy is **lazy-write**: this migration creates the table
--   empty. Every NEW call to the new `consultation-session-service.ts`
--   facade inserts a row here AND continues to populate the legacy
--   `appointments.consultation_room_*` columns so in-flight code paths read
--   what they always have. Existing in-flight rows finish on the legacy
--   path (no backfill). A follow-up drop migration ships ~14 days later
--   under Task 35 once telemetry confirms zero in-flight legacy rows.
--
-- Safety:
--   · Additive only — no existing column dropped, no constraint tightened.
--   · ENUMs created with `IF NOT EXISTS` semantics via guarded DO block;
--     re-running the migration on an already-migrated DB is a no-op.
--   · Indexes created `IF NOT EXISTS` for the same reason.
--   · RLS enabled at table-create time so accidental anonymous reads are
--     impossible during the cutover window.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- ENUMs (idempotent guards — Postgres has no `CREATE TYPE IF NOT EXISTS`)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'consultation_modality') THEN
    CREATE TYPE consultation_modality AS ENUM ('text', 'voice', 'video');
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'consultation_status') THEN
    CREATE TYPE consultation_status AS ENUM ('scheduled', 'live', 'ended', 'no_show', 'cancelled');
  END IF;
END$$;

-- ----------------------------------------------------------------------------
-- Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS consultation_sessions (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id            UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  doctor_id                 UUID NOT NULL,
  -- Nullable to match `appointments.patient_id` (guest bookings without a
  -- linked patient row are still allowed; the consult still needs a session).
  patient_id                UUID NULL,

  modality                  consultation_modality NOT NULL,
  status                    consultation_status   NOT NULL DEFAULT 'scheduled',

  -- `provider` is free-text (not an enum) so a future `whatsapp` / `pstn` /
  -- `supabase_realtime` adapter can register without a schema bump. Today's
  -- only writer is the video adapter (provider = 'twilio_video').
  provider                  TEXT NOT NULL,
  provider_session_id       TEXT,

  scheduled_start_at        TIMESTAMPTZ NOT NULL,
  expected_end_at           TIMESTAMPTZ NOT NULL,
  actual_started_at         TIMESTAMPTZ,
  actual_ended_at           TIMESTAMPTZ,

  doctor_joined_at          TIMESTAMPTZ,
  patient_joined_at         TIMESTAMPTZ,

  -- Plan 02 (Task 27) ships the source-of-truth column on `appointments`;
  -- denormalized here so the read path stays one-table-only after Plan 02.
  -- Stays NULL until Plan 02 wires it.
  recording_consent_at_book BOOLEAN,
  recording_artifact_ref    TEXT,

  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_consultation_sessions_appointment
  ON consultation_sessions(appointment_id);

CREATE INDEX IF NOT EXISTS idx_consultation_sessions_doctor_status
  ON consultation_sessions(doctor_id, status);

-- (provider, provider_session_id) is the natural lookup key for inbound
-- webhooks (Twilio room SID, future PSTN call SID, etc.). NULL
-- provider_session_id rows (created before adapter assigns the SID) are
-- excluded by the partial-index predicate so the index stays small.
CREATE INDEX IF NOT EXISTS idx_consultation_sessions_provider_session
  ON consultation_sessions(provider, provider_session_id)
  WHERE provider_session_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- updated_at trigger — re-uses the convention from earlier migrations.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_consultation_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_consultation_sessions_updated_at ON consultation_sessions;
CREATE TRIGGER trg_consultation_sessions_updated_at
  BEFORE UPDATE ON consultation_sessions
  FOR EACH ROW
  EXECUTE FUNCTION set_consultation_sessions_updated_at();

-- ----------------------------------------------------------------------------
-- Row-Level Security
-- ----------------------------------------------------------------------------
-- Both parties of the session can SELECT their own row. Service role
-- bypasses RLS (used by adapters / verification webhook to INSERT/UPDATE).
-- ----------------------------------------------------------------------------
ALTER TABLE consultation_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS consultation_sessions_select ON consultation_sessions;
CREATE POLICY consultation_sessions_select ON consultation_sessions
  FOR SELECT
  USING (
    doctor_id = auth.uid()
    OR (patient_id IS NOT NULL AND patient_id = auth.uid())
  );

-- ============================================================================
-- Migration Complete
-- ============================================================================
