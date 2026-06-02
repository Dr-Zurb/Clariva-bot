-- ============================================================================
-- 052_consultation_messages_patient_jwt_rls.sql
-- Plan 04 · Task 18 — Extend `consultation_messages` RLS to accept
--                     synthetic patient JWTs (no auth.users row required).
--
-- WHY THIS EXISTS
--   Migration 051 RLS policies key on `auth.uid() = doctor_id` (works,
--   doctors are real Supabase auth users) and `auth.uid() = patient_id`
--   (BROKEN — bot patients reach via Instagram with no `auth.users` row;
--   `consultation_sessions.patient_id` references `patients.id` which is a
--   different UUID space from `auth.users.id`). As written, no patient
--   could ever pass the RLS check.
--
--   Two fix options were surveyed (see task-18 Notes):
--     (a) Lazy-provision auth.users row per patient on first getJoinToken.
--         Heavier — adds an auth.users row per bot patient + a column on
--         patients to remember the mapping.
--     (b) Custom-claim RLS — let the RLS also accept patient JWTs that
--         carry `consult_role = 'patient'` and `session_id = <sid>` claims,
--         signed by SUPABASE_JWT_SECRET. No auth.users pollution, no new
--         column, doctor side untouched.
--
--   Option (b) was picked. This migration ships the (b) policy.
--
-- WHAT CHANGES
--   - `consultation_messages_select_participants` is dropped + replaced.
--     New version OR-adds: `auth.jwt()->>'consult_role' = 'patient'
--                       AND auth.jwt()->>'session_id' = consultation_messages.session_id::text`.
--   - `consultation_messages_insert_live_participants` is dropped + replaced.
--     New version drops the `sender_id = auth.uid()` clause for patients
--     (since synthetic patient JWTs use a `sub` like 'patient:{appointmentId}'
--     which doesn't match a real UUID). Patients can INSERT iff their JWT
--     carries `consult_role = 'patient'`, `session_id = <sid>`, and the
--     parent session is `'live'`. Doctors keep the strict
--     `sender_id = auth.uid()` check.
--   - Storage RLS for `consultation-attachments` is similarly extended so
--     patients can upload attachments via signed Realtime sessions in
--     Plan 06.
--
-- WHAT DOESN'T CHANGE
--   - The `consultation_messages` table shape (no DDL).
--   - The Realtime publication.
--   - The Storage bucket itself.
--   - Doctor-side RLS clauses are preserved verbatim.
--
-- COMPATIBILITY
--   - `auth.jwt()` is a Supabase function returning the verified JWT
--     payload as JSONB. Available in all Supabase versions ≥ 2021.
--   - On non-Supabase Postgres, `auth.jwt()` doesn't exist — the policy
--     creation will fail. That's intended — text-consult is Supabase-only
--     in v1 (Decision 1 LOCKED). Self-hosted variants would need a
--     comparable JWT-claim accessor.
--
-- ROLLBACK
--   To revert to migration 051's behavior (which is broken for patients):
--     DROP POLICY consultation_messages_select_participants
--       ON consultation_messages;
--     DROP POLICY consultation_messages_insert_live_participants
--       ON consultation_messages;
--     -- then re-run the policy CREATE statements from migration 051.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. SELECT — replace with auth.uid() OR custom-claim variant.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS consultation_messages_select_participants
  ON consultation_messages;

CREATE POLICY consultation_messages_select_participants
  ON consultation_messages
  FOR SELECT
  USING (
    -- Doctor branch — real Supabase auth user, JWT `sub` = doctor_id UUID.
    session_id IN (
      SELECT id FROM consultation_sessions
      WHERE doctor_id = auth.uid()
    )
    -- Patient branch — synthetic JWT minted by `services/supabase-jwt-mint.ts`.
    -- The `sub` is `patient:{appointmentId}` (NOT a UUID), so we can't
    -- match it against `patient_id`. Instead we trust the custom claims.
    -- The JWT is signed by SUPABASE_JWT_SECRET so the claims are
    -- backend-attested.
    OR (
      auth.jwt() ->> 'consult_role' = 'patient'
      AND auth.jwt() ->> 'session_id' = consultation_messages.session_id::text
    )
  );

-- ----------------------------------------------------------------------------
-- 2. INSERT — replace. Doctor side keeps `sender_id = auth.uid()`;
--    patient side drops it (synthetic `sub` won't match a UUID `sender_id`).
--    The status='live' guard (Decision 5 live-only) is preserved on both
--    branches.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS consultation_messages_insert_live_participants
  ON consultation_messages;

CREATE POLICY consultation_messages_insert_live_participants
  ON consultation_messages
  FOR INSERT
  WITH CHECK (
    -- Doctor branch — sender_id MUST match auth.uid() (prevents a doctor
    -- from impersonating another doctor or a patient).
    (
      sender_id = auth.uid()
      AND session_id IN (
        SELECT id FROM consultation_sessions
        WHERE doctor_id = auth.uid()
          AND status = 'live'
      )
    )
    -- Patient branch — sender_id is the patient's `appointments.patient_id`
    -- (or a synthetic UUID derived from the appointment when patient_id
    -- is NULL). The JWT custom claims attest the patient's session
    -- membership; the `status='live'` guard is the live-only fence.
    OR (
      auth.jwt() ->> 'consult_role' = 'patient'
      AND auth.jwt() ->> 'session_id' = consultation_messages.session_id::text
      AND session_id IN (
        SELECT id FROM consultation_sessions
        WHERE id = consultation_messages.session_id
          AND status = 'live'
      )
    )
  );

-- ----------------------------------------------------------------------------
-- 3. Storage RLS — same extension for `consultation-attachments`.
--    Plan 06 will write attachments here; Plan 04 v1 doesn't, but
--    extending the policy now keeps the JWT shape stable across plans
--    (one less migration to ship in Plan 06).
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS consultation_attachments_select_participants
  ON storage.objects;

CREATE POLICY consultation_attachments_select_participants
  ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'consultation-attachments'
    AND (
      -- Doctor branch — real auth user.
      (storage.foldername(name))[1] IN (
        SELECT id::text FROM consultation_sessions
        WHERE doctor_id = auth.uid()
      )
      -- Patient branch — custom JWT claims. We compare the path's
      -- session-id segment (string) against the JWT's session_id claim.
      OR (
        auth.jwt() ->> 'consult_role' = 'patient'
        AND auth.jwt() ->> 'session_id' = (storage.foldername(name))[1]
      )
    )
  );

DROP POLICY IF EXISTS consultation_attachments_insert_participants
  ON storage.objects;

CREATE POLICY consultation_attachments_insert_participants
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'consultation-attachments'
    AND (
      -- Doctor branch — must be doctor of the session AND session live.
      (storage.foldername(name))[1] IN (
        SELECT id::text FROM consultation_sessions
        WHERE doctor_id = auth.uid()
          AND status = 'live'
      )
      -- Patient branch — JWT custom claims + status='live' guard.
      OR (
        auth.jwt() ->> 'consult_role' = 'patient'
        AND auth.jwt() ->> 'session_id' = (storage.foldername(name))[1]
        AND (storage.foldername(name))[1] IN (
          SELECT id::text FROM consultation_sessions
          WHERE id = ((storage.foldername(name))[1])::uuid
            AND status = 'live'
        )
      )
    )
  );
