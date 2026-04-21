-- ============================================================================
-- 075_consultation_modality_history.sql
-- Plan 09 · Task 46 — mid-consult modality switching schema foundation
-- Date:    2026-04-19
-- ============================================================================
-- Purpose:
--   Decision 11 LOCKED the single-session-id doctrine: every modality
--   transition during a live consult shares the same
--   `consultation_session_id`, and each transition drops one immutable
--   row in a child `consultation_modality_history` table. This migration
--   lights up four things:
--
--     1. Two new ENUMs — `modality_billing_action` (four values covering
--        the paid/free × upgrade/downgrade matrix) and `modality_initiator`
--        (patient | doctor). Kept as ENUMs (not TEXT + CHECK) because the
--        value set is pinned by Decision 11 and unlikely to widen; a
--        future widen goes via `ALTER TYPE … ADD VALUE` which is cheap.
--
--     2. Three new columns on `consultation_sessions`:
--          · current_modality   — denormalised pointer so the state
--                                  machine (Task 47) checks the active
--                                  modality in O(1) without scanning
--                                  history. Three-step nullable → backfill
--                                  → NOT NULL pattern (matches Migration
--                                  069's `access_type` add).
--          · upgrade_count      — INT NOT NULL DEFAULT 0, counter for
--                                  rate-limit CHECKs.
--          · downgrade_count    — INT NOT NULL DEFAULT 0.
--        Plus two belt-and-suspenders CHECK constraints pinning
--        `upgrade_count <= 1` and `downgrade_count <= 1` (the hard
--        rate-limit — application-layer check lives in Task 47, DB check
--        prevents an application bug from corrupting invariants).
--
--     3. `consultation_modality_history` child table — 12 columns: id,
--        session_id FK (CASCADE), from_modality, to_modality, initiated_by,
--        billing_action, amount_paise, razorpay_payment_id,
--        razorpay_refund_id, reason, preset_reason_code, correlation_id,
--        occurred_at. Four CHECK constraints (from≠to, billing_shape by
--        billing_action, reason_required for doctor rows + patient
--        downgrades, amount_paise > 0 when set).
--
--     4. Two indexes:
--          · idx_modality_history_session_time — powers Task 55's timeline
--            read ("SELECT ... WHERE session_id = ? ORDER BY occurred_at
--            ASC").
--          · idx_modality_history_refund_pending — partial index on rows
--            awaiting refund settlement (auto_refund_downgrade + NULL
--            razorpay_refund_id). Tiny — most rows have the refund id set.
--
-- CHECK vs ENUM doctrine for preset_reason_code:
--   Kept as TEXT + CHECK (not ENUM) so the preset code set widens
--   additively via CHECK drop-and-recreate under the same constraint
--   name. Matches Migration 051's `consultation_messages.sender_role`
--   and Migration 070's `preset_reason_code` doctrine — preset taxonomies
--   evolve (new network/clinical reasons surface in live ops) and an
--   ENUM `ADD VALUE` can't drop values without table rewrite.
--
-- ENUM-ordering dependency (load-bearing):
--   The `modality_history_reason_required` CHECK uses `from_modality >
--   to_modality` to identify patient downgrades. This relies on the
--   Postgres `consultation_modality` ENUM being created in the order
--   `('text', 'voice', 'video')` (Migration 049, line 36), which gives
--   `text < voice < video` under natural ENUM comparison — so `video >
--   voice` and `voice > text` are downgrades, `text < voice` and `voice
--   < video` are upgrades, exactly matching the app-layer semantics. If
--   the enum is ever rebuilt with `ADD VALUE BEFORE`, this CHECK must be
--   rewritten to explicitly enumerate the downgrade pairs
--   `(from, to) IN (('video','voice'), ('video','text'), ('voice','text'))`
--   before the ordering change lands.
--
-- Why `doctor_id` / `patient_id` carry no extra FKs on the history table:
--   The `session_id` FK is sufficient — the parent row carries
--   `doctor_id` + `patient_id`, and we record the initiator as
--   `'patient' | 'doctor'` rather than by UUID (only one doctor / one
--   patient per session in v1). Matches Migration 070's decision to
--   keep `initiated_by` narrow rather than joining a second FK.
--
-- Service-role-only writes:
--   RLS enabled on `consultation_modality_history`; participant-scoped
--   SELECT policy mirrors the pattern from Migrations 065 / 070 (session
--   participants see their own rows). INSERT / UPDATE / DELETE policies
--   are intentionally absent — Task 47's state machine writes via the
--   service role (bypasses RLS). Omitting client-write policies keeps
--   the attack surface tight.
--
-- Why `razorpay_refund_id` is NULLable:
--   `billing_action = 'auto_refund_downgrade'` rows are written at
--   transition-commit time with `razorpay_refund_id = NULL`; the refund
--   retry worker (Task 49) UPSERTs the refund id once Razorpay confirms.
--   The `modality_history_billing_shape` CHECK permits NULL on that
--   branch; the partial index `idx_modality_history_refund_pending`
--   lets the worker scan pending rows in O(log N).
--
-- Safety:
--   · All operations idempotent (IF NOT EXISTS / DO $$ IF NOT EXISTS /
--     CONSTRAINT NOT VALID + VALIDATE).
--   · Backfill of `current_modality` runs under the default transaction
--     isolation; the nullable-first → UPDATE → NOT NULL pattern avoids a
--     lock escalation that would block concurrent writers on the parent
--     table during the backfill.
--   · Rate-limit CHECKs use `NOT VALID` + separate `VALIDATE CONSTRAINT`
--     so the ALTER doesn't hold ACCESS EXCLUSIVE while scanning the
--     whole table for the initial validation pass (matches Migration
--     051's widening pattern).
--
-- Reverse migration (documented at file foot).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. ENUMs (idempotent guards — Postgres has no `CREATE TYPE IF NOT EXISTS`)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'modality_billing_action') THEN
    CREATE TYPE modality_billing_action AS ENUM (
      'paid_upgrade',
      'free_upgrade',
      'no_refund_downgrade',
      'auto_refund_downgrade'
    );
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'modality_initiator') THEN
    CREATE TYPE modality_initiator AS ENUM ('patient', 'doctor');
  END IF;
END$$;

-- ----------------------------------------------------------------------------
-- 2. ALTER TABLE consultation_sessions — add the three counter/pointer cols.
--    Three-step pattern for `current_modality`:
--      Step 1: ADD COLUMN nullable (cheap metadata-only DDL).
--      Step 2: UPDATE backfill from existing `modality` column.
--      Step 3: lock NOT NULL.
--    Avoids lock escalation on the parent table during the backfill.
-- ----------------------------------------------------------------------------

-- Step 1: add nullable (cheap — catalog-only).
ALTER TABLE consultation_sessions
  ADD COLUMN IF NOT EXISTS current_modality consultation_modality;

-- The two counters default to 0 so they can be NOT NULL at add-time
-- without a separate backfill. Existing rows pick up the default.
ALTER TABLE consultation_sessions
  ADD COLUMN IF NOT EXISTS upgrade_count   INT NOT NULL DEFAULT 0;

ALTER TABLE consultation_sessions
  ADD COLUMN IF NOT EXISTS downgrade_count INT NOT NULL DEFAULT 0;

-- Step 2: backfill current_modality from modality for existing rows.
UPDATE consultation_sessions
SET    current_modality = modality
WHERE  current_modality IS NULL;

-- Step 3: lock down NOT NULL. No DEFAULT — new rows must supply the
-- value explicitly (the session-service facade always does).
ALTER TABLE consultation_sessions
  ALTER COLUMN current_modality SET NOT NULL;

-- Step 4: belt-and-suspenders rate-limit CHECKs. NOT VALID + separate
-- VALIDATE so the ALTER doesn't hold ACCESS EXCLUSIVE while scanning
-- (Migration 051 widening pattern).
ALTER TABLE consultation_sessions
  DROP CONSTRAINT IF EXISTS consultation_sessions_upgrade_count_max_check;
ALTER TABLE consultation_sessions
  ADD  CONSTRAINT consultation_sessions_upgrade_count_max_check
  CHECK (upgrade_count BETWEEN 0 AND 1) NOT VALID;
ALTER TABLE consultation_sessions
  VALIDATE CONSTRAINT consultation_sessions_upgrade_count_max_check;

ALTER TABLE consultation_sessions
  DROP CONSTRAINT IF EXISTS consultation_sessions_downgrade_count_max_check;
ALTER TABLE consultation_sessions
  ADD  CONSTRAINT consultation_sessions_downgrade_count_max_check
  CHECK (downgrade_count BETWEEN 0 AND 1) NOT VALID;
ALTER TABLE consultation_sessions
  VALIDATE CONSTRAINT consultation_sessions_downgrade_count_max_check;

COMMENT ON COLUMN consultation_sessions.current_modality IS
    'Denormalised pointer to the currently-active modality. Backfilled from '
    '`modality` for existing rows. Updated in Task 47''s transition '
    'transaction alongside the matching `consultation_modality_history` row.';
COMMENT ON COLUMN consultation_sessions.upgrade_count IS
    'Rate-limit counter for paid_upgrade + free_upgrade transitions. '
    'Hard-capped at 1 by CHECK `consultation_sessions_upgrade_count_max_check`.';
COMMENT ON COLUMN consultation_sessions.downgrade_count IS
    'Rate-limit counter for auto_refund_downgrade + no_refund_downgrade '
    'transitions. Hard-capped at 1 by CHECK '
    '`consultation_sessions_downgrade_count_max_check`.';

-- ----------------------------------------------------------------------------
-- 3. consultation_modality_history child table.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS consultation_modality_history (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Anchors the row to a consultation session. CASCADE on session
  -- delete — modality history belongs to the session; Plan 02's
  -- retention worker (Migration 055) hard-deletes sessions at
  -- regulatory retention end, and the history rows go with them.
  session_id          UUID NOT NULL REFERENCES consultation_sessions(id) ON DELETE CASCADE,

  -- Direction of the transition. Narrowed via the `consultation_modality`
  -- ENUM (created in Migration 049 as ('text', 'voice', 'video')).
  from_modality       consultation_modality NOT NULL,
  to_modality         consultation_modality NOT NULL,

  -- Who initiated. Patient initiates upgrades + downgrades (via the
  -- in-consult `<ModalityChangeButton>`); doctor initiates via the
  -- doctor-side equivalent (Task 52). Only one of each per session.
  initiated_by        modality_initiator NOT NULL,

  -- Billing disposition. Pinned by Decision 11's 2x2 matrix. Changes
  -- in shape (which of amount_paise / razorpay_payment_id /
  -- razorpay_refund_id are set) are enforced by the row-shape CHECK
  -- `modality_history_billing_shape` below.
  billing_action      modality_billing_action NOT NULL,

  -- Paid-upgrade capture amount + auto-refund-downgrade refund amount
  -- (same column — the refund worker reads this to mint the refund).
  -- NULL for free_upgrade + no_refund_downgrade. CHECK at the column
  -- level keeps the amount positive when set.
  amount_paise        INT CHECK (amount_paise IS NULL OR amount_paise > 0),

  -- Razorpay ids for paid/refunded transitions. Shape CHECK below
  -- enforces which column is populated per billing_action.
  razorpay_payment_id TEXT,
  razorpay_refund_id  TEXT,

  -- Free-text reason. Required for doctor-initiated rows AND for
  -- patient-initiated downgrades (see `modality_history_reason_required`
  -- CHECK). Bounds mirror Migration 070's `reason` CHECK (5..200 chars;
  -- `char_length` not `length` so multi-byte scripts — Devanagari,
  -- Tamil, etc — pin the codepoint count not the byte count).
  reason              TEXT CHECK (reason IS NULL OR char_length(reason) BETWEEN 5 AND 200),

  -- Preset tag the initiator picked from a radio-button list. TEXT +
  -- CHECK (not ENUM) so the taxonomy can widen additively under the
  -- same CHECK name. Seven v1 values covering the doctor-side (visible
  -- symptom / need to hear voice / patient request / case doesn't need
  -- modality) and patient-side (network or equipment / patient
  -- environment) reasons, plus `'other'`.
  preset_reason_code  TEXT CHECK (preset_reason_code IS NULL OR preset_reason_code IN (
                        'visible_symptom',
                        'need_to_hear_voice',
                        'patient_request',
                        'network_or_equipment',
                        'case_doesnt_need_modality',
                        'patient_environment',
                        'other'
                      )),

  -- Correlation id threading the whole transition flow: button tap →
  -- Razorpay capture/refund enqueue → history row → system message →
  -- notification fan-out. Matches Migration 070's correlation pattern.
  correlation_id      UUID,

  -- Server-assigned commit timestamp (clock-skew doctrine — never trust
  -- client clock). DEFAULT now() so the service can omit at insert time.
  occurred_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Direction invariant: a transition row must move the modality.
  CONSTRAINT modality_history_from_to_differ
    CHECK (from_modality <> to_modality),

  -- Billing-action shape CHECK. Pins the four legal row shapes:
  --
  --   paid_upgrade          amount_paise NOT NULL, razorpay_payment_id NOT NULL, razorpay_refund_id NULL.
  --   free_upgrade          all three NULL.
  --   no_refund_downgrade   all three NULL.
  --   auto_refund_downgrade amount_paise NOT NULL, razorpay_payment_id NULL, razorpay_refund_id NULL OR NOT NULL
  --                         (NULLable during enqueue → filled by Task 49's retry worker).
  --
  -- Any other shape is rejected.
  CONSTRAINT modality_history_billing_shape CHECK (
       (billing_action = 'paid_upgrade'
         AND amount_paise        IS NOT NULL
         AND razorpay_payment_id IS NOT NULL
         AND razorpay_refund_id  IS NULL)
    OR (billing_action = 'auto_refund_downgrade'
         AND amount_paise        IS NOT NULL
         AND razorpay_payment_id IS NULL
         /* razorpay_refund_id may be NULL during retry; Task 49 UPDATEs */)
    OR (billing_action = 'free_upgrade'
         AND amount_paise        IS NULL
         AND razorpay_payment_id IS NULL
         AND razorpay_refund_id  IS NULL)
    OR (billing_action = 'no_refund_downgrade'
         AND amount_paise        IS NULL
         AND razorpay_payment_id IS NULL
         AND razorpay_refund_id  IS NULL)
  ),

  -- Reason-capture invariant: doctor-initiated rows always require a
  -- reason; patient-initiated downgrades also require one (we want to
  -- know why — bad network? environment? AI prompt). Patient upgrades
  -- do NOT require a reason (they've paid; the upgrade is the reason).
  --
  -- Direction derived inline from `from_modality > to_modality` — this
  -- relies on the `consultation_modality` ENUM being ordered
  -- `('text','voice','video')` under Migration 049 (text < voice <
  -- video). See the file header for the enum-ordering doctrine + the
  -- refactor path if that ordering ever changes.
  CONSTRAINT modality_history_reason_required CHECK (
    CASE
      WHEN initiated_by = 'doctor'
        THEN reason IS NOT NULL
      WHEN initiated_by = 'patient' AND from_modality > to_modality
        THEN reason IS NOT NULL
      ELSE TRUE
    END
  )
);

-- ----------------------------------------------------------------------------
-- 4. Indexes.
-- ----------------------------------------------------------------------------

-- Hot read: Task 55's post-consult timeline query
--   "SELECT ... WHERE session_id = ? ORDER BY occurred_at ASC"
-- Ascending order because the timeline renders oldest-first.
CREATE INDEX IF NOT EXISTS idx_modality_history_session_time
  ON consultation_modality_history(session_id, occurred_at);

-- Partial index powering Task 49's refund retry worker scan:
--   "SELECT id, amount_paise, session_id
--      FROM consultation_modality_history
--     WHERE billing_action = 'auto_refund_downgrade'
--       AND razorpay_refund_id IS NULL
--     ORDER BY occurred_at"
-- Tiny index — most rows have razorpay_refund_id set once the worker
-- commits. Pre-provisioned so Task 49 ships without a migration bump.
CREATE INDEX IF NOT EXISTS idx_modality_history_refund_pending
  ON consultation_modality_history(occurred_at)
  WHERE billing_action = 'auto_refund_downgrade' AND razorpay_refund_id IS NULL;

-- ----------------------------------------------------------------------------
-- 5. Row-Level Security.
-- ----------------------------------------------------------------------------
ALTER TABLE consultation_modality_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS modality_history_select_participants
  ON consultation_modality_history;
CREATE POLICY modality_history_select_participants
  ON consultation_modality_history
  FOR SELECT
  USING (
    session_id IN (
      SELECT id FROM consultation_sessions
      WHERE doctor_id = auth.uid()
         OR (patient_id IS NOT NULL AND patient_id = auth.uid())
    )
  );
-- NO INSERT / UPDATE / DELETE policies: Task 47's state machine writes
-- via the service role (bypasses RLS). Task 49's refund retry worker
-- also runs service-role. Omitting client-write policies prevents a
-- leaked auth token from seeding fake history rows.

COMMENT ON TABLE consultation_modality_history IS
    'Plan 09 Task 46. Append-only child table; one row per successful '
    'modality transition within a consult. Service-role-only writes via '
    'Task 47''s state machine. Read by Task 55''s timeline.';
COMMENT ON COLUMN consultation_modality_history.session_id IS
    'FK to consultation_sessions(id) ON DELETE CASCADE.';
COMMENT ON COLUMN consultation_modality_history.billing_action IS
    'paid_upgrade | free_upgrade | no_refund_downgrade | auto_refund_downgrade. '
    'Row shape per value enforced by CHECK `modality_history_billing_shape`.';
COMMENT ON COLUMN consultation_modality_history.initiated_by IS
    'patient | doctor. Patient-initiated downgrades require a reason '
    '(see CHECK `modality_history_reason_required`).';
COMMENT ON COLUMN consultation_modality_history.amount_paise IS
    'Capture amount for paid_upgrade; refund amount for auto_refund_downgrade. '
    'NULL for free_upgrade + no_refund_downgrade. Positive-only via column CHECK.';
COMMENT ON COLUMN consultation_modality_history.razorpay_payment_id IS
    'Razorpay payment id for paid_upgrade rows. NULL on every other branch.';
COMMENT ON COLUMN consultation_modality_history.razorpay_refund_id IS
    'Razorpay refund id for auto_refund_downgrade rows. NULL during retry; '
    'UPDATEd by Task 49 once Razorpay confirms. Partial index '
    '`idx_modality_history_refund_pending` keys off the NULL predicate.';
COMMENT ON COLUMN consultation_modality_history.reason IS
    'Free-text reason, 5..200 chars (CHECK `reason IS NULL OR '
    'char_length(reason) BETWEEN 5 AND 200`). Required for doctor rows + '
    'patient-initiated downgrades.';
COMMENT ON COLUMN consultation_modality_history.preset_reason_code IS
    'Radio-button preset. TEXT + CHECK (not ENUM) so the taxonomy widens '
    'additively. Seven v1 values.';
COMMENT ON COLUMN consultation_modality_history.correlation_id IS
    'Traces button tap → Razorpay capture/refund → history row → system '
    'message → notification fan-out.';
COMMENT ON COLUMN consultation_modality_history.occurred_at IS
    'Server-assigned commit timestamp. DEFAULT now(). Clock-skew doctrine — '
    'never trust client clock.';

-- ============================================================================
-- Reverse migration (documented; kept in-file so the reverse op is one
-- grep away):
--
--   DROP TABLE IF EXISTS consultation_modality_history;
--
--   ALTER TABLE consultation_sessions
--     DROP CONSTRAINT IF EXISTS consultation_sessions_upgrade_count_max_check,
--     DROP CONSTRAINT IF EXISTS consultation_sessions_downgrade_count_max_check,
--     DROP COLUMN IF EXISTS current_modality,
--     DROP COLUMN IF EXISTS upgrade_count,
--     DROP COLUMN IF EXISTS downgrade_count;
--
--   DROP TYPE IF EXISTS modality_billing_action;
--   DROP TYPE IF EXISTS modality_initiator;
--
-- Do NOT revert once Task 47 rows exist in production — loses modality
-- transition audit trail which is part of the regulatory retention
-- envelope (per Plan 02 Task 33 retention policy). Prefer forward
-- superseding.
-- ============================================================================
