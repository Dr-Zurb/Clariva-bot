-- ============================================================================
-- 105_voice_call_quality.sql
-- Sub-batch C · task-voice-C2 — QoS health metrics for VOICE consultations.
--
-- WHY THIS EXISTS
--   The only schema work in the entire voice batch. Persists per-call
--   quality samples (RTT, jitter, packet loss, network quality level,
--   audio in/out levels) so ops can answer:
--     - "Median RTT by clinic this month"
--     - "Top 10 calls by packet loss yesterday"
--     - "Has T3.19 noise suppression measurably improved patient-side
--        audio level?"
--
-- SAMPLE CADENCE (decision §13 — same as video E6 sibling)
--   10s for the first minute (catch early-call instability), then 30s
--   thereafter. ~120 rows max per 30-min call. The frontend reporter
--   batches every 60s and on call end to amortise round-trips.
--
-- WHY A SEPARATE TABLE FROM video_call_quality (decision §27, mirrored
-- in Migration 086 header)
--   Voice has no resolution / fps / kbps columns; cleaner ops queries;
--   cheaper indexes (smaller rows). Both tables share the same
--   `(session_id, sampled_at)` index pattern + the
--   `network_quality_level IS NOT NULL` partial index, so the ops
--   runbook reads identically across modalities.
--
-- USER_ID SEMANTICS (mirrors Migration 086 video sibling decision)
--   The spec writes `user_id UUID NOT NULL`. For doctors, `user_id` IS
--   the real `auth.users.uuid` (matches `safe_uuid_sub()`). For
--   patients, the JWT sub is synthetic (`patient:{appointmentId}`) and
--   is NOT a UUID — `safe_uuid_sub()` returns NULL — so we cannot use
--   the same `user_id = safe_uuid_sub()` shape uniformly. We chose
--   "use the `consultation_sessions.id` UUID as a synthetic surrogate
--   for the patient role". Documented in the column comment + enforced
--   in the service layer (`backend/src/services/voice-call-quality-
--   service.ts`). The semantic meaning is: "the ID under which this
--   caller is acting". For doctors that's their auth UUID; for patients
--   that's the session ID acting as synthetic patient identifier.
--
-- RLS DESIGN
--   The frontend reporter posts via the backend endpoint
--   (`POST /api/v1/consultation/:sessionId/voice-quality`). The
--   endpoint validates auth in TypeScript and INSERTs via the **admin
--   client** (RLS-bypass) — same pattern as the video sibling and
--   `consultation-extra-participant-service.ts` /
--   `consultation-auto-fallback-service.ts` (existing precedent for
--   participant-only writes that are too auth-shape-divergent to fit a
--   single RLS WITH CHECK clause cleanly).
--
--   RLS here is **defense-in-depth** for any future caller that hits
--   the table via a session-scoped client (e.g. an ops dashboard
--   reading own-clinic samples). Two policies:
--
--     1. INSERT — accept (a) doctors with matching session_id ownership
--        (`safe_uuid_sub()` works because doctor JWT subs are real
--        UUIDs), AND (b) patients/extras whose JWT carries a
--        `session_id` claim that matches the row's `session_id` (the
--        same `auth.jwt() ->> 'session_id'` pattern Migration 085 +
--        the patient_messages_insert_live policy already use).
--
--     2. SELECT — doctor-of-the-session only. Patient + extra
--        participants do NOT see their own samples (out-of-scope for
--        v1 per spec — "Patient-side QoS dashboard" explicitly listed
--        under "Out of scope").
--
-- SCHEMA INVARIANTS
--   - `sample_seq` is per-(session_id, user_id, role) monotonic; the
--     frontend reporter writes 0-indexed and increments on each sample.
--     We don't enforce monotonicity in DB (it's a soft contract — a
--     buggy reporter would just produce duplicate seq values, which is
--     OK for analytics).
--   - All numeric metric columns are NULLable — Twilio doesn't always
--     populate every field on every sample (especially the first few
--     samples before the SDK has enough data, or during transient
--     reconnects). Reporter writes whatever it has; analytics queries
--     handle NULLs explicitly.
--   - `sampled_at DEFAULT now()` — backend sets the wall-clock at
--     INSERT time, NOT the frontend timestamp. Reduces clock-skew noise
--     in percentile queries; clients that batch + flush 60s late don't
--     poison the timeline.
--
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Table
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS voice_call_quality (
  id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id            UUID         NOT NULL REFERENCES consultation_sessions(id) ON DELETE CASCADE,
  -- See "USER_ID SEMANTICS" header note. Doctor: auth.users.uuid.
  -- Patient: consultation_sessions.id (synthetic surrogate). For both,
  -- always a valid UUID so the NOT NULL invariant holds.
  user_id               UUID         NOT NULL,
  -- The 'extra_participant' value is reserved for forward-compatibility
  -- with three-way voice calls; today's reporter only emits 'doctor'
  -- and 'patient'. Mirrors the video sibling's CHECK shape so ops
  -- queries can UNION ALL across modalities cleanly.
  role                  TEXT         NOT NULL CHECK (role IN ('doctor', 'patient', 'extra_participant')),
  sampled_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),

  -- Twilio Network Quality API: integer 0..5 (5 = excellent).
  -- See `frontend/hooks/useNetworkQuality.ts` for the canonical mapping.
  network_quality_level INT          CHECK (network_quality_level BETWEEN 0 AND 5),

  rtt_ms                INT,
  jitter_ms             INT,
  -- 0..100 with 2 decimal places. NUMERIC, not REAL, for exact
  -- percentile aggregation in ops queries.
  packet_loss_pct       NUMERIC(5,2),

  -- Linear PCM amplitude scale 0..100 (Twilio-normalised). Same shape
  -- as the video sibling so audio-only ops queries can UNION ALL
  -- across both tables when the question is "voice + video, how loud
  -- did the patient sound today?".
  audio_input_level     NUMERIC(5,2),
  audio_output_level    NUMERIC(5,2),

  -- Useful for cross-referencing with Twilio's own composition logs
  -- when ops needs to pull the recording for a specific bad-quality
  -- session. Free-text (Twilio room SIDs are RMxxxxxx).
  twilio_room_sid       TEXT,

  -- Per-(session_id, user_id, role) monotonic sample number. 0-indexed.
  -- Useful for "how many samples are we missing?" gap analysis.
  sample_seq            INT          NOT NULL CHECK (sample_seq >= 0)
);

-- ----------------------------------------------------------------------------
-- Indexes
-- ----------------------------------------------------------------------------
-- Primary read pattern: "give me all samples for one session in time
-- order" (post-call investigation; doctor's "this call was rough"
-- debugging).
CREATE INDEX IF NOT EXISTS voice_call_quality_session_idx
  ON voice_call_quality(session_id, sampled_at);

-- Secondary read pattern: "give me all samples in the last N days
-- that have a network quality reading" — feeds the ops daily/weekly
-- digest. Partial index keeps it small (NULL network_quality_level
-- samples are rare-but-real during early-call warmup; excluding them
-- halves index size without losing the digest's signal).
CREATE INDEX IF NOT EXISTS voice_call_quality_clinic_idx
  ON voice_call_quality(sampled_at)
  WHERE network_quality_level IS NOT NULL;

-- ----------------------------------------------------------------------------
-- Row-Level Security
-- ----------------------------------------------------------------------------
ALTER TABLE voice_call_quality ENABLE ROW LEVEL SECURITY;

-- Drop-and-recreate so the migration is idempotent (re-running on a
-- partially-applied DB is safe).
DROP POLICY IF EXISTS voice_call_quality_insert_participant ON voice_call_quality;
DROP POLICY IF EXISTS voice_call_quality_select_doctor      ON voice_call_quality;

-- INSERT — defense-in-depth for any future session-scoped client
-- caller (today's path is admin-client via the backend endpoint, which
-- bypasses RLS by design). Two branches OR'd:
--
--   1. Doctor branch — JWT sub is a real auth.users.uuid; check
--      session ownership via `consultation_sessions.doctor_id`.
--      `safe_uuid_sub()` (Migration 079) safely casts the sub to UUID
--      and returns NULL for non-UUID subs (= patient JWTs), so this
--      branch is doctor-only by construction.
--
--   2. Participant branch — JWT carries a `session_id` claim that
--      matches the row's session_id. This is the same shape used by
--      `consultation_messages_insert_live_participants` (Plan 06) +
--      Migration 085's extra-participant SELECT branch + Migration
--      086's video-quality INSERT participant branch. Catches patient
--      + extra_participant inserts uniformly.
CREATE POLICY voice_call_quality_insert_participant ON voice_call_quality
  FOR INSERT
  WITH CHECK (
    (
      -- (1) Doctor branch.
      role = 'doctor'
      AND user_id = public.safe_uuid_sub()
      AND session_id IN (
        SELECT id FROM consultation_sessions
        WHERE doctor_id = public.safe_uuid_sub()
      )
    )
    OR
    (
      -- (2) Participant branch (patient / extra_participant).
      -- session_id claim must match the row + the consult_role claim
      -- must be one of the participant kinds (defensive — malformed
      -- doctor JWTs without consult_role would fall through here
      -- otherwise and bypass branch (1)'s session-ownership check).
      role IN ('patient', 'extra_participant')
      AND auth.jwt() ->> 'session_id' = session_id::text
      AND auth.jwt() ->> 'consult_role' IN ('patient', 'extra_participant')
    )
  );

-- SELECT — doctor-only on own sessions. Patient + extras don't get a
-- read surface today (decision: out of scope for v1; "Patient-side
-- QoS dashboard" explicitly listed under spec's "Out of scope").
CREATE POLICY voice_call_quality_select_doctor ON voice_call_quality
  FOR SELECT
  USING (
    session_id IN (
      SELECT id FROM consultation_sessions WHERE doctor_id = public.safe_uuid_sub()
    )
  );

-- ----------------------------------------------------------------------------
-- Comments — readable by `psql \d+ voice_call_quality` and by ops
-- runbooks that auto-generate from `pg_catalog`.
-- ----------------------------------------------------------------------------
COMMENT ON TABLE  voice_call_quality                        IS 'Sub-batch C · task-voice-C2 — per-sample QoS metrics for voice consultations. Cadence: 10s for first 60s then 30s. ~64 samples per side per 30-min call.';
COMMENT ON COLUMN voice_call_quality.user_id                IS 'Doctor: auth.users.uuid (real). Patient: consultation_sessions.id (synthetic surrogate, since patient JWT subs are not UUIDs). See migration header.';
COMMENT ON COLUMN voice_call_quality.role                   IS 'doctor / patient / extra_participant. Today the reporter only emits doctor + patient; extra_participant reserved for three-way voice forward-compat.';
COMMENT ON COLUMN voice_call_quality.network_quality_level  IS 'Twilio Network Quality API integer 0..5 (5 = excellent). Null until the SDK has enough samples (~3-5s post-connect).';
COMMENT ON COLUMN voice_call_quality.sampled_at             IS 'Backend wall-clock at INSERT (default now()). Reduces clock-skew noise vs trusting the client timestamp; client batches that flush 60s late do not poison the timeline.';
COMMENT ON COLUMN voice_call_quality.sample_seq             IS '0-indexed per-(session_id, user_id, role) monotonic counter. Useful for gap analysis ("how many samples are we missing?"). Soft contract — DB does not enforce monotonicity.';

-- ============================================================================
-- Verification
-- ----------------------------------------------------------------------------
-- After applying:
--   1. Run `node backend/scripts/diagnose-text-consult-jwt.ts` — should
--      report no regression. The shared `safe_uuid_sub()` invariant is
--      reused; nothing else in the JWT path is touched.
--   2. INSERT smoke (with admin client; RLS bypass):
--        INSERT INTO voice_call_quality (
--          session_id, user_id, role, sample_seq
--        ) VALUES (
--          '<some-session>', '<some-session>', 'patient', 0
--        ) RETURNING id;
--      Should succeed.
--   3. SELECT smoke (with doctor session-scoped client):
--        SELECT count(*) FROM voice_call_quality WHERE session_id = '<own>';
--      Should return the rows for the doctor's own session.
--   4. INSERT smoke (with patient session-scoped client; for future
--      callers — today the backend endpoint uses admin client):
--      Should succeed when row's session_id matches JWT session_id
--      claim AND consult_role = 'patient'.
--   5. Ops percentile query verification (spec §"Ops query verification"):
--      SELECT cs.doctor_id, DATE_TRUNC('day', vcq.sampled_at) AS day,
--             PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY vcq.rtt_ms)
--               AS median_rtt
--      FROM voice_call_quality vcq
--      JOIN consultation_sessions cs ON cs.id = vcq.session_id
--      WHERE vcq.sampled_at >= now() - INTERVAL '30 days'
--      GROUP BY cs.doctor_id, day
--      ORDER BY day, median_rtt;
--      Should return in <1s on populated data; the
--      `voice_call_quality_session_idx` covers the join + sampled_at
--      filter without a sequential scan.
--
-- Reverse migration (drop everything cleanly):
--   DROP POLICY IF EXISTS voice_call_quality_select_doctor      ON voice_call_quality;
--   DROP POLICY IF EXISTS voice_call_quality_insert_participant ON voice_call_quality;
--   DROP INDEX  IF EXISTS voice_call_quality_clinic_idx;
--   DROP INDEX  IF EXISTS voice_call_quality_session_idx;
--   DROP TABLE  IF EXISTS voice_call_quality;
-- ============================================================================
