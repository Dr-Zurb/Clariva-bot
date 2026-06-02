-- ============================================================================
-- 108_text_chat_quality.sql
-- Sub-batch D · task-text-D4 — chat delivery health metrics (T5.35).
--
-- Persists per-side 30s samples: optimistic-send → server-ack RTT p95,
-- Realtime reconnect count, presence flap count, and messages-in-window
-- for context. Doctor reads recent rows via RLS for the connection badge;
-- patients POST via the backend ingest endpoint (service-role INSERT).
--
-- PHI hygiene: no message bodies, no message ids — counts and aggregates only.
-- ============================================================================

CREATE TABLE IF NOT EXISTS text_chat_quality (
  id                  BIGSERIAL    PRIMARY KEY,
  session_id          UUID         NOT NULL REFERENCES consultation_sessions(id) ON DELETE CASCADE,
  sender_id           UUID         NOT NULL,
  sender_role         TEXT         NOT NULL CHECK (sender_role IN ('doctor', 'patient')),
  sample_at           TIMESTAMPTZ  NOT NULL,
  roundtrip_p95_ms    INTEGER,
  realtime_reconnects INTEGER      NOT NULL DEFAULT 0,
  presence_flaps      INTEGER      NOT NULL DEFAULT 0,
  messages_in_window  INTEGER      NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_text_chat_quality_session_time
  ON text_chat_quality (session_id, sample_at DESC);

ALTER TABLE text_chat_quality ENABLE ROW LEVEL SECURITY;

-- INSERT: only via service role (backend ingest). No client INSERT policy.

DROP POLICY IF EXISTS text_chat_quality_select_doctor ON text_chat_quality;

CREATE POLICY text_chat_quality_select_doctor
  ON text_chat_quality FOR SELECT
  USING (
    session_id IN (
      SELECT id FROM consultation_sessions
      WHERE doctor_id = public.safe_uuid_sub()
    )
  );

COMMENT ON TABLE text_chat_quality IS 'Sub-batch D · task-text-D4 — per-side chat QoS samples (30s cadence). Doctor SELECT-only via RLS; INSERT via backend service role.';

-- Realtime publication — live badge updates for doctor clients.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE text_chat_quality;
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
  WHEN undefined_object THEN
    RAISE NOTICE 'supabase_realtime publication not found; skipping ADD TABLE text_chat_quality';
END$$;

NOTIFY pgrst, 'reload schema';

-- Reverse migration (manual):
--   DO $$ BEGIN
--     ALTER PUBLICATION supabase_realtime DROP TABLE text_chat_quality;
--   EXCEPTION WHEN undefined_object THEN NULL;
--   END$$;
--   DROP POLICY IF EXISTS text_chat_quality_select_doctor ON text_chat_quality;
--   DROP INDEX  IF EXISTS idx_text_chat_quality_session_time;
--   DROP TABLE  IF EXISTS text_chat_quality;
