-- ============================================================================
-- 081_consultation_sessions_patient_claim_branch.sql
-- Plan 04 · follow-up — re-grant patient JWTs read access to their own
--                       `consultation_sessions` row via JWT claims, so
--                       the live-only INSERT guard on consultation_messages
--                       can pass for patients.
--
-- WHY THIS EXISTS
--   Migration 080 rewrote `consultation_sessions_select` to use
--   `public.safe_uuid_sub()` instead of `auth.uid()`. For patient JWTs
--   (whose sub is the synthetic `'patient:{appointmentId}'`),
--   `safe_uuid_sub()` returns NULL, so the policy denies every row.
--
--   That was the right call for the immediate cast bug, but it has a
--   side-effect that surfaced the moment the patient tried to send a
--   message: migration 079's INSERT policy on
--   `consultation_messages` includes a live-only guard inside the
--   patient branch:
--
--     EXISTS (
--       SELECT 1 FROM consultation_sessions
--       WHERE id = consultation_messages.session_id
--         AND status = 'live'
--     )
--
--   That subquery reads `consultation_sessions`, which goes through
--   RLS. After 080, patient JWTs see ZERO rows there, so EXISTS is
--   always false and patient INSERTs 401/422 with "violates row-level
--   security policy". End-user symptom: doctor messages arrive on
--   patient's phone (SELECT works), patient types a reply, the row
--   shows "Retry" in red, and the doctor never sees the patient's
--   messages.
--
-- WHAT CHANGES
--   Adds a third branch to `consultation_sessions_select`: a patient
--   may read a session row when their JWT has
--   `consult_role = 'patient'` AND the JWT's `session_id` claim equals
--   the row's `id`. That's the same claims-attested membership we use
--   for `consultation_messages`. No UUID cast happens — we compare
--   `session_id::text` (uuid → text) against the JWT claim (already
--   text), so a patient JWT can never trigger 22P02 here.
--
-- WHAT DOESN'T CHANGE
--   * Doctor branch is preserved (uses `safe_uuid_sub()` from 080).
--   * Existing `consultation_sessions_select` row visibility for
--     doctors and the legacy `patient_id = auth.uid()` self-read are
--     preserved — for doctor JWTs `safe_uuid_sub()` returns the
--     doctor's real uid; the patient_id branch is unreachable today
--     (no real-uid patient JWT path exists yet) but kept for forward
--     compatibility.
--   * No change to JWT mint, RLS on `consultation_messages`, or the
--     `consultation-attachments` storage policies.
--   * Service-role bypass unchanged.
--
-- ROLLBACK
--   To restore migration 080 behaviour:
--     DROP POLICY consultation_sessions_select ON consultation_sessions;
--     CREATE POLICY consultation_sessions_select
--       ON consultation_sessions
--       FOR SELECT
--       USING (
--         doctor_id = public.safe_uuid_sub()
--         OR (patient_id IS NOT NULL AND patient_id = public.safe_uuid_sub())
--       );
-- ============================================================================

DROP POLICY IF EXISTS consultation_sessions_select
  ON consultation_sessions;

CREATE POLICY consultation_sessions_select
  ON consultation_sessions
  FOR SELECT
  USING (
    -- Doctor branch — real auth user; safe_uuid_sub() returns the
    -- doctor's uid for a doctor JWT, NULL for patient JWTs (so the
    -- comparison is FALSE for patients without raising 22P02).
    doctor_id = public.safe_uuid_sub()

    -- Legacy patient self-read branch — kept for forward compatibility
    -- with any future real-uid patient JWT path.
    OR (
      patient_id IS NOT NULL
      AND patient_id = public.safe_uuid_sub()
    )

    -- Patient claims branch — the patient JWT carries the session_id
    -- it's scoped to. Match by claim, not by uid. No cast: both sides
    -- of the equality are text.
    OR (
      auth.jwt() ->> 'consult_role' = 'patient'
      AND auth.jwt() ->> 'session_id' = consultation_sessions.id::text
    )
  );

NOTIFY pgrst, 'reload schema';
