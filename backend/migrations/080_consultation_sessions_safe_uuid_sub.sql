-- ============================================================================
-- 080_consultation_sessions_safe_uuid_sub.sql
-- Plan 04 · follow-up — extend the safe_uuid_sub() fix to
--                       `consultation_sessions` RLS so the patient
--                       branch can no longer trigger a 22P02 via the
--                       FK lookup the doctor branch performs.
--
-- WHY THIS EXISTS
--   Migration 079 fixed `consultation_messages` and the
--   `consultation-attachments` storage policies by replacing
--   `auth.uid()` with `public.safe_uuid_sub()` so the cast can never
--   fire on a patient sub. The diagnostic still 400'd with the same
--   `22P02 invalid input syntax for type uuid: "patient:..."` after
--   079 was applied.
--
--   Root cause: the doctor branch in 079's
--   `consultation_messages_select_participants` policy is
--
--     EXISTS (SELECT 1 FROM consultation_sessions
--             WHERE id = X AND doctor_id = safe_uuid_sub())
--
--   That subquery references `consultation_sessions`, and reads on
--   that table go through ITS OWN RLS policy
--   `consultation_sessions_select` (installed by migration 049):
--
--     USING (
--       doctor_id = auth.uid()
--       OR (patient_id IS NOT NULL AND patient_id = auth.uid())
--     )
--
--   Postgres' OR is not guaranteed to short-circuit. The planner may
--   evaluate the doctor-branch comparator first, calling `auth.uid()`,
--   which casts the patient sub `'patient:{appointmentId}'` to uuid
--   and raises 22P02 — even though the OUTER query is the patient
--   branch from 079, which never wanted the EXISTS subquery to run
--   in the first place. (Postgres' OR-short-circuit guarantee bites
--   us identically here, on the inner table's RLS.)
--
-- WHAT CHANGES
--   Rewrites `consultation_sessions_select` to use `safe_uuid_sub()`
--   in place of `auth.uid()`. For patient JWTs, `safe_uuid_sub()`
--   returns NULL, so both `doctor_id = NULL` and `patient_id = NULL`
--   are FALSE — the patient JWT cannot SELECT any session row through
--   this policy. That's the correct outcome: patient access to
--   `consultation_messages` is gated by 079's claim-attested patient
--   branch, NOT by selecting the parent session row, so cutting
--   patient JWTs off from `consultation_sessions` here doesn't
--   regress chat. (If a future feature needs patient JWTs to read
--   session rows, we'll add a claims-based branch then; today nothing
--   reads consultation_sessions through a patient JWT.)
--
--   Doctor-side semantics are preserved bit-for-bit: doctor JWTs have
--   real UUID subs, so `safe_uuid_sub() = auth.uid()` for them.
--
-- WHAT DOESN'T CHANGE
--   * `auth.uid()` itself — left alone for the rest of the project.
--   * Service-role bypass — unchanged.
--   * Realtime / publication membership.
--
-- ROLLBACK
--   To restore the migration 049 policy:
--     DROP POLICY consultation_sessions_select ON consultation_sessions;
--     CREATE POLICY consultation_sessions_select ON consultation_sessions
--       FOR SELECT
--       USING (
--         doctor_id = auth.uid()
--         OR (patient_id IS NOT NULL AND patient_id = auth.uid())
--       );
-- ============================================================================

DROP POLICY IF EXISTS consultation_sessions_select
  ON consultation_sessions;

CREATE POLICY consultation_sessions_select
  ON consultation_sessions
  FOR SELECT
  USING (
    doctor_id = public.safe_uuid_sub()
    OR (
      patient_id IS NOT NULL
      AND patient_id = public.safe_uuid_sub()
    )
  );

-- Force PostgREST to drop cached query plans built against the 049 policy.
NOTIFY pgrst, 'reload schema';
