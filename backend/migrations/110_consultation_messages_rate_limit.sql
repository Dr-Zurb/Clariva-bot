-- ============================================================================
-- 110_consultation_messages_rate_limit.sql
-- Sub-batch D · task-text-D5 — server-side INSERT rate limit on
--                              consultation_messages (T5.34).
--
-- WHY THIS EXISTS
--   Pre-D5 the only INSERT throttle on consultation_messages was a
--   client-side recommendation (60 msg/min noted in Plan F04 task 17,
--   never enforced). A malicious patient or a buggy client could fill a
--   session with 10k messages in a minute, creating:
--     - SPAM that the doctor must scroll past;
--     - STORAGE pressure (10k msgs × ~4KB body ≈ 40 MB / session);
--     - AI-PIPELINE POISONING (T3 / Plan 10 reads messages as input).
--
--   This migration ships the throttle at the RLS layer so EVERY client
--   (web, mobile, scripted) hits the same wall regardless of how it
--   authenticates. Limits per (session_id, sender_id) tuple:
--     * 30 messages / minute (soft).
--     * 200 messages / hour (hard).
--
--   We rate-limit by `(session_id, sender_id)` (not just sender) because:
--     - cross-session leakage isn't a concern (each session is bounded);
--     - it lets multi-session doctors operate on multiple consults in
--       parallel without the limit summing across them;
--     - it makes the rate check a single-table scan on an indexed pair.
--
-- WHAT CHANGES
--   1. New SECURITY DEFINER SQL function `public.check_chat_insert_rate(
--        p_session_id UUID, p_sender_id UUID
--      ) RETURNS BOOLEAN` that returns FALSE iff the (session, sender)
--      tuple has already crossed 30/min or 200/hour. SECURITY DEFINER is
--      required so the function can COUNT rows on consultation_messages
--      independently of the caller's RLS context; `SET search_path =
--      public` blocks search-path injection.
--
--   2. Rewrite of the canonical INSERT policy
--      `consultation_messages_insert_live_participants` (last shipped by
--      migration 079). The two-branch (patient + doctor) shape from 079
--      is PRESERVED — both branches gain an AND on the rate-check.
--
--   3. NOTIFY pgrst, 'reload schema' so PostgREST stops serving plans
--      built against the 079 policy body.
--
-- WHAT DOESN'T CHANGE
--   * SELECT, UPDATE, DELETE policies on consultation_messages are
--     untouched.
--   * Storage RLS (`consultation-attachments`) is untouched — file
--     uploads aren't rate-limited; the per-INSERT chat-row rate limit
--     covers the row that attaches them.
--   * Reactions (`consultation_message_reactions`) are NOT rate-limited.
--     Reactions are rare and self-throttle by user behaviour; if abuse
--     surfaces, a separate migration can add a parallel cap.
--   * `safe_uuid_sub()` and its usage in the policy are preserved
--     verbatim from migration 079.
--
-- FRONTEND CONTRACT
--   The Supabase client cannot distinguish "RLS rejected because
--   rate-limited" from "RLS rejected because session ended" — both
--   surface as error code `42501` (insufficient_privilege). The frontend
--   mirrors the per-minute count locally and treats rejects-while-at-cap
--   as rate-limit, otherwise as the existing failure-path. The local
--   count is a UX hint, not a security boundary.
--
-- PERFORMANCE
--   Two COUNT queries per INSERT, both filtered on
--   `(session_id, sender_id, created_at >= NOW() - interval)`. The
--   existing index `consultation_messages_session_created_idx`
--   (migration 051) makes each scan ms-level even on busy sessions.
--   We deliberately keep the function STABLE — the planner caches per
--   query — even though SECURITY DEFINER functions are CALLER-only-once
--   in RLS WITH CHECK, so the effective cost is "two COUNTs per INSERT
--   attempt". For the 30/min cap this is bounded above by 60 small
--   scans/min/sender.
--
-- ROLLBACK
--   To revert to migration 079 behaviour (no rate limit):
--
--     DROP POLICY IF EXISTS consultation_messages_insert_live_participants
--       ON consultation_messages;
--
--     -- Re-run the CREATE POLICY block from migration 079 §2 verbatim:
--     CREATE POLICY consultation_messages_insert_live_participants
--       ON consultation_messages
--       FOR INSERT
--       WITH CHECK (
--         (
--           auth.jwt() ->> 'consult_role' = 'patient'
--           AND auth.jwt() ->> 'session_id' = consultation_messages.session_id::text
--           AND EXISTS (
--             SELECT 1 FROM consultation_sessions
--             WHERE id = consultation_messages.session_id
--               AND status = 'live'
--           )
--         )
--         OR
--         (
--           sender_id = public.safe_uuid_sub()
--           AND EXISTS (
--             SELECT 1 FROM consultation_sessions
--             WHERE id = consultation_messages.session_id
--               AND doctor_id = public.safe_uuid_sub()
--               AND status = 'live'
--           )
--         )
--       );
--
--     DROP FUNCTION IF EXISTS public.check_chat_insert_rate(UUID, UUID);
--
--   The function can be left in place if any other code path consumes
--   it; dropping it is a separate operational decision.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Rate-check helper — counts recent inserts and applies the two caps.
--    SECURITY DEFINER: required so the function can COUNT on
--    consultation_messages independently of the caller's RLS context.
--    STABLE:           the planner can cache the result per query.
--    SET search_path = public: blocks search-path injection.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_chat_insert_rate(
  p_session_id UUID,
  p_sender_id  UUID
) RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_minute_count INTEGER;
  v_hour_count   INTEGER;
BEGIN
  -- Defensive NULL guards: if either id is NULL the row would fail
  -- the table's NOT NULL constraints anyway, but returning TRUE here
  -- avoids surfacing a stray rate-limit reject ahead of the real
  -- error.
  IF p_session_id IS NULL OR p_sender_id IS NULL THEN
    RETURN TRUE;
  END IF;

  -- Per-minute cap (soft, 30).
  SELECT COUNT(*) INTO v_minute_count
  FROM consultation_messages
  WHERE session_id = p_session_id
    AND sender_id  = p_sender_id
    AND created_at > (now() - interval '1 minute');

  IF v_minute_count >= 30 THEN
    RETURN FALSE;
  END IF;

  -- Per-hour cap (hard, 200).
  SELECT COUNT(*) INTO v_hour_count
  FROM consultation_messages
  WHERE session_id = p_session_id
    AND sender_id  = p_sender_id
    AND created_at > (now() - interval '1 hour');

  IF v_hour_count >= 200 THEN
    RETURN FALSE;
  END IF;

  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION public.check_chat_insert_rate(UUID, UUID) IS
  'Sub-batch D · task-text-D5 — returns FALSE when the (session, sender) '
  'tuple has hit the per-minute (30) or per-hour (200) INSERT cap on '
  'consultation_messages. SECURITY DEFINER so the count is independent '
  'of caller RLS; consumed by consultation_messages_insert_live_participants.';

-- ----------------------------------------------------------------------------
-- 2. Rewrite the canonical INSERT policy to AND-in the rate-check on
--    BOTH branches (patient + doctor). Structure mirrors migration 079
--    verbatim; only the trailing AND clause is new.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS consultation_messages_insert_live_participants
  ON consultation_messages;

CREATE POLICY consultation_messages_insert_live_participants
  ON consultation_messages
  FOR INSERT
  WITH CHECK (
    -- Patient branch — claim-attested membership + live session +
    -- rate-check. The patient does not control sender_id beyond what
    -- the JWT-minted client passes; the rate-check is keyed on the
    -- inserted row's (session_id, sender_id).
    (
      auth.jwt() ->> 'consult_role' = 'patient'
      AND auth.jwt() ->> 'session_id' = consultation_messages.session_id::text
      AND EXISTS (
        SELECT 1
        FROM consultation_sessions
        WHERE id = consultation_messages.session_id
          AND status = 'live'
      )
      AND public.check_chat_insert_rate(
        consultation_messages.session_id,
        consultation_messages.sender_id
      )
    )
    OR
    -- Doctor branch — sender_id MUST match the doctor's real uid
    -- (blocks impersonation). safe_uuid_sub() is NULL for patient
    -- JWTs, so this whole branch is FALSE for patients.
    (
      sender_id = public.safe_uuid_sub()
      AND EXISTS (
        SELECT 1
        FROM consultation_sessions
        WHERE id = consultation_messages.session_id
          AND doctor_id = public.safe_uuid_sub()
          AND status = 'live'
      )
      AND public.check_chat_insert_rate(
        consultation_messages.session_id,
        consultation_messages.sender_id
      )
    )
  );

-- ----------------------------------------------------------------------------
-- 3. Force PostgREST to reload its schema cache so it stops serving
--    plans built against the 079 policy body.
-- ----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
