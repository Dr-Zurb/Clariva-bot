-- ============================================================================
-- 085_consultation_extra_participants.sql
-- Sub-batch C · task-video-C8 — three-way / multi-participant video calls.
--
-- WHY THIS EXISTS
--   Real clinical scenarios need a third party in the room: an
--   interpreter, a family member / caregiver, or a specialist the
--   primary doctor pulls in mid-call. Decision §16 picks the
--   per-call invite-link mechanism: doctor generates a short-lived
--   invite token, shares it (copy-link or SMS via existing infra),
--   the third party clicks it, exchanges it for a short-lived
--   Supabase JWT + a Twilio access token, and joins the SAME Twilio
--   room as the doctor + patient.
--
--   This migration ships the schema + RLS that:
--     1. Tracks the invite + the participant's lifecycle
--        (`invited_at` / `joined_at` / `left_at` / `revoked_at`).
--     2. Lets the third participant SELECT messages on
--        `consultation_messages` for the joined window only — same
--        defense-in-depth pattern Plan 06 uses for the patient
--        branch.
--     3. Does NOT let the third participant INSERT messages or
--        clinical artifacts. Their channel is read-only — they're
--        a guest in the room, not a clinical author.
--
-- HOW THE CONSULT_ROLE TAXONOMY EXTENDS
--   Migration 052 established two consult_role values:
--     'doctor'   — sub is a real auth.users.uuid
--     'patient'  — sub is the synthetic 'patient:{appointmentId}' string
--   This migration adds a THIRD value:
--     'extra_participant'
--   Sub for extra-participants is the synthetic
--   'extra:{participantId}' string (where participantId is the row's
--   primary key in `consultation_extra_participants`). Same shape
--   problem as patient JWTs: the sub is NOT a UUID, so any RLS that
--   tries to cast `auth.jwt() ->> 'sub'` to uuid would hit 22P02
--   (see Migration 079's writeup for why). All branches in this
--   migration use `public.safe_uuid_sub()` from 079 — which returns
--   NULL for non-UUID subs — instead of raw `auth.uid()`.
--
--   Side benefit: while we're rewriting
--   `consultation_messages_select_participants` to add the
--   extra_participant branch, we also restore the doctor branch's
--   `safe_uuid_sub()` usage that Migration 084 (snapshot visibility
--   RLS) accidentally reverted to `auth.uid()`. Plan F04 invariant
--   restored.
--
-- READ WINDOW (Decision: join-only, NOT join-leave-strict)
--   Per the task's Q&A at execution time, the extra participant can
--   SELECT messages with `created_at >= joined_at` for the rest of
--   the session — INCLUDING after they leave (so a reconnect with
--   a fresh exchange round-trip just works without reissuing a new
--   invite). They never see messages from BEFORE their join, which
--   was the only privacy gate we cared about.
--
--   The `left_at` column is still recorded for audit + product
--   analytics ("Maria stayed for 11 minutes"), but it's NOT in the
--   RLS predicate.
--
-- WHAT THE EXTRA PARTICIPANT CANNOT SEE / DO
--   * No SELECT on rows with `created_at < joined_at` (privacy gate).
--   * No INSERT on `consultation_messages` (they're a guest, not a
--     clinical author). The companion-chat composer is hidden in
--     extra_participant mode at the UI layer; this RLS gate is the
--     defense-in-depth.
--   * No SELECT on attachments — the storage policy in 079 is keyed
--     on doctor_id / patient session_id claim only. Extra
--     participants never receive a `session_id` claim that matches
--     the storage folder shape, so they're already excluded.
--     (Phase 2 may extend storage RLS to allow chat-image read for
--     extras; defer until a real consumer needs it.)
--   * No SELECT on `consultation_sessions`, `appointments`,
--     `prescriptions`, etc. — those tables don't have a third-party
--     RLS branch. Extra participants only see the chat surface.
--
-- ROLLBACK
--   To revert:
--     DROP POLICY IF EXISTS consultation_messages_select_participants
--       ON consultation_messages;
--     -- Re-create the policy from Migration 084 §line 150-180.
--     DROP POLICY IF EXISTS consultation_extra_participants_select_self
--       ON consultation_extra_participants;
--     DROP POLICY IF EXISTS consultation_extra_participants_doctor_full
--       ON consultation_extra_participants;
--     DROP TABLE IF EXISTS consultation_extra_participants;
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Table — consultation_extra_participants
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS consultation_extra_participants (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID NOT NULL REFERENCES consultation_sessions(id) ON DELETE CASCADE,
  -- HMAC-signed opaque token; the third party presents this in the
  -- invite URL `/c/video-invite/{token}`. UNIQUE so the exchange
  -- endpoint can `WHERE invite_token = $1` cheaply.
  invite_token    TEXT NOT NULL UNIQUE,
  -- Free-text label visible to all parties — "interpreter",
  -- "family member", "specialist". Optional; UI falls back to
  -- "Guest" when NULL. Capped at 64 chars to keep banners short.
  role_label      TEXT,
  -- Required display name (UI shows "Maria (interpreter) joined").
  -- Capped at 80 chars; backend trims + rejects empty.
  display_name    TEXT NOT NULL,
  invited_by      UUID NOT NULL,                 -- doctor user id (auth.users.uuid)
  invited_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Set when the exchange endpoint successfully mints the JWT for
  -- this row. Never re-mints — the token is single-shot for the
  -- first successful exchange. (A reconnect path uses the issued
  -- JWT; if the JWT itself expires, the doctor must re-invite.)
  joined_at       TIMESTAMPTZ,
  left_at         TIMESTAMPTZ,
  -- Set when the doctor explicitly revokes the invite. After this
  -- point the SELECT policy hides messages for this token holder
  -- AND the exchange endpoint refuses to mint.
  revoked_at      TIMESTAMPTZ,
  -- Drift guards: at most one of joined_at / revoked_at exists at
  -- exchange time; left_at MUST be >= joined_at; display_name
  -- non-empty after trim.
  CONSTRAINT consultation_extra_participants_display_name_not_empty
    CHECK (length(btrim(display_name)) > 0),
  CONSTRAINT consultation_extra_participants_display_name_len
    CHECK (length(display_name) <= 80),
  CONSTRAINT consultation_extra_participants_role_label_len
    CHECK (role_label IS NULL OR length(role_label) <= 64),
  CONSTRAINT consultation_extra_participants_left_after_joined
    CHECK (left_at IS NULL OR joined_at IS NOT NULL AND left_at >= joined_at)
);

-- Token lookup hot path — exchange endpoint hits this on every
-- third-party page load. Partial index excludes revoked rows so
-- the planner doesn't even consider stale invites.
CREATE INDEX IF NOT EXISTS consultation_extra_participants_token_idx
  ON consultation_extra_participants(invite_token)
  WHERE revoked_at IS NULL;

-- Session lookup — the doctor's invite list panel + the SELECT
-- RLS predicate both filter by session_id.
CREATE INDEX IF NOT EXISTS consultation_extra_participants_session_idx
  ON consultation_extra_participants(session_id);

-- Triage by status for the doctor's panel ("show me everyone
-- still in the room").
CREATE INDEX IF NOT EXISTS consultation_extra_participants_active_idx
  ON consultation_extra_participants(session_id)
  WHERE revoked_at IS NULL AND left_at IS NULL;

-- ----------------------------------------------------------------------------
-- 2. RLS — consultation_extra_participants
--    Doctor-of-session: full read + insert + update (revoke).
--    Extra participant (own row only): read so the invite page can
--      surface their display_name + role.
--    Patient: NO access — patients don't manage invites and don't
--      need to see who else is in the room beyond the system
--      banners they already get on the chat.
-- ----------------------------------------------------------------------------
ALTER TABLE consultation_extra_participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS consultation_extra_participants_doctor_full
  ON consultation_extra_participants;

CREATE POLICY consultation_extra_participants_doctor_full
  ON consultation_extra_participants
  FOR ALL
  USING (
    -- Doctor branch — safe_uuid_sub() returns NULL for synthetic
    -- (patient / extra_participant) JWTs, so this comparison is
    -- FALSE for them and behaves exactly like auth.uid() for
    -- doctor JWTs.
    EXISTS (
      SELECT 1
      FROM consultation_sessions
      WHERE id = consultation_extra_participants.session_id
        AND doctor_id = public.safe_uuid_sub()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM consultation_sessions
      WHERE id = consultation_extra_participants.session_id
        AND doctor_id = public.safe_uuid_sub()
    )
  );

DROP POLICY IF EXISTS consultation_extra_participants_select_self
  ON consultation_extra_participants;

CREATE POLICY consultation_extra_participants_select_self
  ON consultation_extra_participants
  FOR SELECT
  USING (
    auth.jwt() ->> 'consult_role' = 'extra_participant'
    AND auth.jwt() ->> 'session_id' = consultation_extra_participants.session_id::text
    AND auth.jwt() ->> 'extra_participant_id' = consultation_extra_participants.id::text
    AND consultation_extra_participants.revoked_at IS NULL
  );

-- ----------------------------------------------------------------------------
-- 3. Rewrite consultation_messages SELECT to add the extra_participant
--    branch + restore safe_uuid_sub() in the doctor branch.
--
--    The CASE order matters because Postgres' planner can't always
--    short-circuit OR. We dispatch on consult_role first so:
--      WHEN 'patient'           → claim-attested + snapshot gate (084)
--      WHEN 'extra_participant' → claim-attested + read-window gate (this migration)
--      ELSE                     → safe_uuid_sub() (doctor-or-anything-else)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS consultation_messages_select_participants
  ON consultation_messages;

CREATE POLICY consultation_messages_select_participants
  ON consultation_messages
  FOR SELECT
  USING (
    CASE auth.jwt() ->> 'consult_role'
      WHEN 'patient' THEN
        -- Patient branch (preserved from Migration 084):
        --   * Claim-attested membership.
        --   * Hide doctor-taken-of-patient snapshots (decision §14).
        auth.jwt() ->> 'session_id' = consultation_messages.session_id::text
        AND NOT (
          metadata IS NOT NULL
          AND metadata ->> 'snapshot'      = 'true'
          AND metadata ->> 'capturer_role' = 'doctor'
          AND metadata ->> 'target'        = 'remote'
        )
      WHEN 'extra_participant' THEN
        -- Extra-participant branch (NEW in this migration):
        --   * Claim-attested membership (session_id + extra_participant_id).
        --   * Read window gate: only messages created_at >=
        --     `joined_at` of the matching extra-participants row.
        --     This is the join-only variant chosen at execution
        --     time (see migration header).
        --   * Revocation gate: invite must NOT be revoked.
        --   * No INSERT — see policy 4 below; this is SELECT-only.
        --   * Snapshot gate (decision §14) — extras inherit the
        --     same hide-doctor-of-patient rule. Family member
        --     joining the call shouldn't see clinical-only
        --     snapshots either.
        auth.jwt() ->> 'session_id' = consultation_messages.session_id::text
        AND EXISTS (
          SELECT 1
          FROM consultation_extra_participants ep
          WHERE ep.session_id = consultation_messages.session_id
            AND ep.id::text   = auth.jwt() ->> 'extra_participant_id'
            AND ep.revoked_at IS NULL
            AND ep.joined_at IS NOT NULL
            AND consultation_messages.created_at >= ep.joined_at
        )
        AND NOT (
          metadata IS NOT NULL
          AND metadata ->> 'snapshot'      = 'true'
          AND metadata ->> 'capturer_role' = 'doctor'
          AND metadata ->> 'target'        = 'remote'
        )
      ELSE
        -- Doctor branch — safe_uuid_sub() returns NULL for
        -- patient / extra_participant JWTs, so this is FALSE for
        -- them and equivalent to auth.uid() for doctor JWTs.
        -- (This restores 079's invariant that 084 accidentally
        -- reverted to raw auth.uid(); see migration header.)
        EXISTS (
          SELECT 1
          FROM consultation_sessions
          WHERE id = consultation_messages.session_id
            AND doctor_id = public.safe_uuid_sub()
        )
    END
  );

-- ----------------------------------------------------------------------------
-- 4. INSERT policy is intentionally NOT extended for extra_participant.
--
--    The existing `consultation_messages_insert_live_participants`
--    policy (Migration 079) only has 'patient' and doctor branches.
--    Postgres falls through to FALSE for any other consult_role,
--    which is exactly what we want — extras can read the chat but
--    cannot post into it. UI also hides the composer in
--    extra_participant mode (defense-in-depth).
--
--    If a future task wants extras to be able to post (e.g.
--    interpreter clarifications), add a third CASE branch here
--    with `auth.jwt() ->> 'consult_role' = 'extra_participant'` +
--    the same EXISTS gate as the SELECT branch + a sender_id
--    check that pins the row to a synthetic `extra:{id}` shape.
--    Out of scope for v1.
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- 5. Force PostgREST to reload its schema cache so it stops serving
--    plans built against the 084 policy body.
-- ----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
