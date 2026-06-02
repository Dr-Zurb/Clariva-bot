-- ============================================================================
-- 078_consultation_messages_rls_short_circuit_patient.sql
-- Plan 04 · follow-up — Fix patient JWT RLS regression on
--                       `consultation_messages` (and matching storage policies).
--
-- WHY THIS EXISTS
--   Migration 052 set up the patient-side RLS branch as an OR with the
--   doctor branch:
--
--     USING (
--       session_id IN (
--         SELECT id FROM consultation_sessions WHERE doctor_id = auth.uid()
--       )
--       OR (
--         auth.jwt() ->> 'consult_role' = 'patient'
--         AND auth.jwt() ->> 'session_id' = consultation_messages.session_id::text
--       )
--     );
--
--   The doctor branch calls `auth.uid()`, which inside Supabase is
--   roughly `(current_setting('request.jwt.claims', true)::jsonb ->>
--   'sub')::uuid`. For doctors `sub` is a real UUID — fine. For PATIENTS,
--   `sub` is the synthetic string `'patient:{appointmentId}'`
--   (see `services/supabase-jwt-mint.ts#buildPatientSub`) which is NOT a
--   valid UUID. Postgres' boolean OR is **not guaranteed to
--   short-circuit** — the planner is free to evaluate either side first,
--   and when it tries to evaluate the doctor branch the cast
--   `'patient:…'::uuid` raises:
--
--     22P02 invalid input syntax for type uuid: "patient:{...}"
--
--   This 400s every patient SELECT/INSERT against `consultation_messages`
--   AND closes the patient's Realtime channel (which performs the same
--   RLS check on each broadcast). End-user symptom: doctor side is
--   fine; patient side is stuck on "Reconnecting…", composer is locked
--   to "Reconnecting — your message will send when back online", and
--   the doctor sees the patient as Offline because patient presence
--   never tracks.
--
-- WHAT CHANGES
--   `consultation_messages_select_participants` and
--   `consultation_messages_insert_live_participants` are rewritten to
--   dispatch on `auth.jwt() ->> 'consult_role'` via a `CASE` expression.
--   Postgres `CASE` has guaranteed evaluation order (top-to-bottom), so
--   when the JWT is a patient JWT the doctor branch — and therefore the
--   `auth.uid()` cast — is never evaluated.
--
--   Storage policies on `consultation-attachments` (Migration 052
--   §3) have the same shape and the same latent issue, so they're
--   rewritten the same way for parity. Plan 06 attachment uploads
--   would have hit this the moment they shipped to a patient.
--
--   Doctor-side semantics are preserved bit-for-bit: the same
--   "doctor of this session" predicate runs in the doctor branch.
--
-- WHAT DOESN'T CHANGE
--   - Table shape, columns, or check constraints.
--   - Realtime publication membership.
--   - Service-role bypass behavior (still bypasses RLS entirely).
--   - The synthetic patient `sub` shape — JWT mint code is unchanged.
--
-- ROLLBACK
--   To revert to migration 052 behavior (broken for patients):
--     DROP POLICY consultation_messages_select_participants
--       ON consultation_messages;
--     DROP POLICY consultation_messages_insert_live_participants
--       ON consultation_messages;
--     DROP POLICY consultation_attachments_select_participants
--       ON storage.objects;
--     DROP POLICY consultation_attachments_insert_participants
--       ON storage.objects;
--     -- then re-run the policy CREATE statements from migration 052.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. consultation_messages SELECT — CASE on consult_role.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS consultation_messages_select_participants
  ON consultation_messages;

CREATE POLICY consultation_messages_select_participants
  ON consultation_messages
  FOR SELECT
  USING (
    CASE auth.jwt() ->> 'consult_role'
      WHEN 'patient' THEN
        -- Patient branch: synthetic sub, never call auth.uid().
        auth.jwt() ->> 'session_id' = consultation_messages.session_id::text
      ELSE
        -- Doctor branch: real auth user; auth.uid() is safe here because
        -- consult_role is NOT 'patient', so sub is a real UUID.
        EXISTS (
          SELECT 1
          FROM consultation_sessions
          WHERE id = consultation_messages.session_id
            AND doctor_id = auth.uid()
        )
    END
  );

-- ----------------------------------------------------------------------------
-- 2. consultation_messages INSERT — CASE on consult_role; Decision-5
--    "live-only" guard preserved on both branches.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS consultation_messages_insert_live_participants
  ON consultation_messages;

CREATE POLICY consultation_messages_insert_live_participants
  ON consultation_messages
  FOR INSERT
  WITH CHECK (
    CASE auth.jwt() ->> 'consult_role'
      WHEN 'patient' THEN
        -- Patient branch — claim-attested membership + live session.
        auth.jwt() ->> 'session_id' = consultation_messages.session_id::text
        AND EXISTS (
          SELECT 1
          FROM consultation_sessions
          WHERE id = consultation_messages.session_id
            AND status = 'live'
        )
      ELSE
        -- Doctor branch — sender_id matches auth.uid(); blocks one
        -- doctor from impersonating another doctor or any patient.
        sender_id = auth.uid()
        AND EXISTS (
          SELECT 1
          FROM consultation_sessions
          WHERE id = consultation_messages.session_id
            AND doctor_id = auth.uid()
            AND status = 'live'
        )
    END
  );

-- ----------------------------------------------------------------------------
-- 3. storage.objects SELECT — same CASE rewrite for
--    consultation-attachments. Plan 04 v1 doesn't write attachments,
--    but Plan 06 will, and the latent cast bug would surface there too.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS consultation_attachments_select_participants
  ON storage.objects;

CREATE POLICY consultation_attachments_select_participants
  ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'consultation-attachments'
    AND CASE auth.jwt() ->> 'consult_role'
      WHEN 'patient' THEN
        auth.jwt() ->> 'session_id' = (storage.foldername(name))[1]
      ELSE
        (storage.foldername(name))[1] IN (
          SELECT id::text
          FROM consultation_sessions
          WHERE doctor_id = auth.uid()
        )
    END
  );

-- ----------------------------------------------------------------------------
-- 4. storage.objects INSERT — CASE rewrite + live guard.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS consultation_attachments_insert_participants
  ON storage.objects;

CREATE POLICY consultation_attachments_insert_participants
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'consultation-attachments'
    AND CASE auth.jwt() ->> 'consult_role'
      WHEN 'patient' THEN
        auth.jwt() ->> 'session_id' = (storage.foldername(name))[1]
        AND EXISTS (
          SELECT 1
          FROM consultation_sessions
          WHERE id = ((storage.foldername(name))[1])::uuid
            AND status = 'live'
        )
      ELSE
        (storage.foldername(name))[1] IN (
          SELECT id::text
          FROM consultation_sessions
          WHERE doctor_id = auth.uid()
            AND status = 'live'
        )
    END
  );
