-- ============================================================================
-- 079_consultation_rls_safe_uuid_sub.sql
-- Plan 04 · follow-up — bulletproof fix for the patient-JWT RLS regression.
--
-- WHY THIS EXISTS (read the receipts before changing anything)
--   Migration 052 introduced an OR-based RLS predicate where the doctor
--   branch called `auth.uid()` and the patient branch only used custom
--   JWT claims. Postgres does not guarantee short-circuit OR, so for
--   patient JWTs the doctor branch was evaluated, the cast
--   `(jwt.sub)::uuid` failed, and every patient SELECT/INSERT against
--   `consultation_messages` 400'd with:
--
--     22P02 invalid input syntax for type uuid: "patient:{appointmentId}"
--
--   Migration 078 tried to fix that by switching from OR to a CASE on
--   `auth.jwt() ->> 'consult_role'`, expecting CASE to suppress
--   evaluation of the doctor branch when the JWT is a patient JWT.
--
--   It didn't. Postgres' CASE evaluation guarantee has a known
--   carve-out: STABLE functions can be hoisted out of CASE arms during
--   planning. `auth.uid()` is `STABLE` and Supabase defines it as a
--   single-line SQL function that the planner inlines, so the cast can
--   still happen even when the CASE branch containing it is never
--   chosen at runtime. We confirmed this empirically — after applying
--   078 + `NOTIFY pgrst, 'reload schema'`, the
--   `scripts/diagnose-text-consult-jwt.ts` probe still returned the
--   same 22P02 error.
--
-- WHAT CHANGES
--   1. Introduces `public.safe_uuid_sub()` — a STABLE SQL helper that
--      reads `auth.jwt() ->> 'sub'` and returns it as `uuid` ONLY when
--      the value matches the canonical UUID regex. For patient JWTs
--      whose sub is `patient:{appointmentId}`, the regex fails and the
--      helper returns NULL. No cast is ever attempted on a non-UUID
--      string, so 22P02 cannot be raised regardless of how aggressive
--      the planner is about hoisting expressions out of CASE.
--
--   2. Rewrites `consultation_messages_select_participants` and
--      `consultation_messages_insert_live_participants` to use
--      `safe_uuid_sub()` everywhere `auth.uid()` was previously used
--      against this table. The doctor branch keeps its original
--      semantics (`doctor_id = safe_uuid_sub()` is exactly equivalent
--      to `doctor_id = auth.uid()` for doctor JWTs and harmlessly
--      `doctor_id = NULL` (false) for patient JWTs).
--
--   3. Same rewrite for the storage policies on
--      `consultation-attachments` — Plan 06 attachment uploads would
--      hit the same 22P02 the moment they shipped to a patient.
--
-- WHAT DOESN'T CHANGE
--   * `auth.uid()` is left untouched. Other tables in the project still
--     use it correctly because their JWTs always have UUID subs. Only
--     consultation tables — which are touched by synthetic patient
--     JWTs — are migrated.
--   * Realtime publication membership.
--   * JWT mint behaviour. Patient sub stays `patient:{appointmentId}`.
--   * Service-role bypass (still bypasses RLS entirely).
--
-- ROLLBACK
--   To revert to migration 078 behaviour:
--     DROP POLICY consultation_messages_select_participants
--       ON consultation_messages;
--     DROP POLICY consultation_messages_insert_live_participants
--       ON consultation_messages;
--     DROP POLICY consultation_attachments_select_participants
--       ON storage.objects;
--     DROP POLICY consultation_attachments_insert_participants
--       ON storage.objects;
--     -- then re-run the policy CREATE statements from migration 078.
--   The `safe_uuid_sub()` function can be left in place — nothing else
--   depends on it and dropping it is a separate operational decision.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Helper: safe_uuid_sub()
--    Returns the JWT sub claim as a uuid IFF it matches the canonical
--    UUID regex; otherwise NULL. Crucially, the regex test is performed
--    BEFORE the cast, so a non-UUID sub never triggers a cast attempt.
--    Marked STABLE so the planner can cache the result within a query.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.safe_uuid_sub() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN (auth.jwt() ->> 'sub') ~
         '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    THEN (auth.jwt() ->> 'sub')::uuid
    ELSE NULL
  END
$$;

COMMENT ON FUNCTION public.safe_uuid_sub() IS
  'Returns auth.jwt() sub as uuid ONLY when sub is a canonical UUID; otherwise NULL. '
  'Use in RLS policies on tables that may be hit by synthetic-sub JWTs '
  '(e.g. patient JWTs with sub="patient:{appointmentId}") to avoid '
  '22P02 cast failures when auth.uid() is hoisted out of CASE arms.';

-- ----------------------------------------------------------------------------
-- 1. consultation_messages SELECT — patient branch (claims) + doctor
--    branch (safe_uuid_sub instead of auth.uid).
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS consultation_messages_select_participants
  ON consultation_messages;

CREATE POLICY consultation_messages_select_participants
  ON consultation_messages
  FOR SELECT
  USING (
    -- Patient branch — JWT-claim-attested membership; no UUID cast.
    (
      auth.jwt() ->> 'consult_role' = 'patient'
      AND auth.jwt() ->> 'session_id' = consultation_messages.session_id::text
    )
    OR
    -- Doctor branch — safe_uuid_sub() returns NULL for patient JWTs,
    -- so this comparison is FALSE for patients (no cast attempted)
    -- and behaves exactly like auth.uid() for doctor JWTs.
    EXISTS (
      SELECT 1
      FROM consultation_sessions
      WHERE id = consultation_messages.session_id
        AND doctor_id = public.safe_uuid_sub()
    )
  );

-- ----------------------------------------------------------------------------
-- 2. consultation_messages INSERT — Decision-5 live-only guard preserved.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS consultation_messages_insert_live_participants
  ON consultation_messages;

CREATE POLICY consultation_messages_insert_live_participants
  ON consultation_messages
  FOR INSERT
  WITH CHECK (
    -- Patient branch — claim-attested membership + live session.
    (
      auth.jwt() ->> 'consult_role' = 'patient'
      AND auth.jwt() ->> 'session_id' = consultation_messages.session_id::text
      AND EXISTS (
        SELECT 1
        FROM consultation_sessions
        WHERE id = consultation_messages.session_id
          AND status = 'live'
      )
    )
    OR
    -- Doctor branch — sender_id MUST match the doctor's real uid
    -- (blocks impersonation). safe_uuid_sub() is NULL for patients,
    -- so this whole branch is FALSE for patient JWTs.
    (
      sender_id = public.safe_uuid_sub()
      AND EXISTS (
        SELECT 1
        FROM consultation_sessions
        WHERE id = consultation_messages.session_id
          AND doctor_id = public.safe_uuid_sub()
          AND status = 'live'
      )
    )
  );

-- ----------------------------------------------------------------------------
-- 3. storage.objects SELECT — same rewrite for consultation-attachments.
--    Plan 04 v1 doesn't write attachments, but Plan 06 will, and the
--    same 22P02 would surface there if we leave 052/078 in place.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS consultation_attachments_select_participants
  ON storage.objects;

CREATE POLICY consultation_attachments_select_participants
  ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'consultation-attachments'
    AND (
      -- Patient branch — claim-attested folder match.
      (
        auth.jwt() ->> 'consult_role' = 'patient'
        AND auth.jwt() ->> 'session_id' = (storage.foldername(name))[1]
      )
      OR
      -- Doctor branch — safe_uuid_sub() guards the cast.
      (storage.foldername(name))[1] IN (
        SELECT id::text
        FROM consultation_sessions
        WHERE doctor_id = public.safe_uuid_sub()
      )
    )
  );

-- ----------------------------------------------------------------------------
-- 4. storage.objects INSERT — CASE rewrite + live guard.
--    Migration 051 left an old `consultation_attachments_insert_live_participants`
--    policy in place that 052/078 never dropped (different name). Drop
--    it here so we don't have two overlapping INSERT policies.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS consultation_attachments_insert_live_participants
  ON storage.objects;
DROP POLICY IF EXISTS consultation_attachments_insert_participants
  ON storage.objects;

CREATE POLICY consultation_attachments_insert_participants
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'consultation-attachments'
    AND (
      -- Patient branch — claims + live guard. The folder-name to-uuid
      -- cast here is on the OBJECT path (which our backend controls
      -- and always writes as a UUID), NOT on the JWT sub, so it's
      -- safe.
      (
        auth.jwt() ->> 'consult_role' = 'patient'
        AND auth.jwt() ->> 'session_id' = (storage.foldername(name))[1]
        AND EXISTS (
          SELECT 1
          FROM consultation_sessions
          WHERE id = ((storage.foldername(name))[1])::uuid
            AND status = 'live'
        )
      )
      OR
      -- Doctor branch — safe_uuid_sub() guards the cast.
      (storage.foldername(name))[1] IN (
        SELECT id::text
        FROM consultation_sessions
        WHERE doctor_id = public.safe_uuid_sub()
          AND status = 'live'
      )
    )
  );

-- ----------------------------------------------------------------------------
-- 5. Force PostgREST to reload its schema cache so it stops serving
--    plans built against the 052/078 policy bodies.
-- ----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
