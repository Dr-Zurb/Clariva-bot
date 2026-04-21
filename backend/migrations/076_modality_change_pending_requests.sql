-- ============================================================================
-- 076_modality_change_pending_requests.sql
-- Plan 09 · Task 47 — mid-consult modality-change state-machine pending table
-- Date:    2026-04-19
-- ============================================================================
-- Purpose:
--   Decision 11 LOCKED the single-entry `requestModalityChange()` state
--   machine; the two-branch approval flow (patient-initiated upgrade
--   needs doctor approval; doctor-initiated upgrade needs patient
--   consent) requires a durable pending-request row. This migration
--   lights up:
--
--     1. `modality_change_pending_requests` table — one row per
--        patient→doctor approval request OR doctor→patient consent
--        request. Lifecycle: `requested_at` set at insert; `responded_at`
--        + `response` filled when the counter-party approves/declines,
--        the timeout worker flips `'timeout'`, or a Razorpay checkout
--        cancels the paid branch. Append-only modulo the single-shot
--        terminal UPDATE.
--
--     2. Indexes:
--          · idx_modality_pending_session_active — partial index on
--            unresponded rows (WHERE response IS NULL), powers Step 7
--            "is there a pending request for this session?" in O(log N).
--          · idx_modality_pending_expiry_scan — partial index on the
--            timeout worker's scan path (WHERE response IS NULL),
--            ordered by expires_at ASC.
--          · idx_modality_pending_razorpay_order — partial index on
--            `razorpay_order_id` for the paid-upgrade webhook lookup
--            (mid-consult `payment.captured` events match against this).
--
--     3. RLS — participant-scoped SELECT (doctor OR patient of the
--        linked session). No client-write policies; Task 47's state
--        machine writes service-role only.
--
-- Why a separate table vs. writing to `consultation_modality_history`
-- with a `status='pending'` enum:
--   The history table (Migration 075) is append-only and represents
--   committed transitions. Using it for pending state would require
--   either a `rolled_back = true` flag (rejected in Task 46 Notes #1)
--   or a status enum — both muddy its semantics. Separate table keeps
--   both cleanly: pending_requests models in-flight approval; history
--   models committed transitions. See task-47 Notes #6.
--
-- Response-shape CHECK invariant:
--   `responded_at` and `response` MUST move together — either both
--   NULL (pending), or both NOT NULL (terminal). Prevents the "half-
--   responded" row that would confuse the timeout worker and the
--   "is there a pending request" gate in Step 7.
--
-- Reason bounds:
--   `reason` 5..200 chars (char_length, not length — multi-byte
--   scripts pin codepoints not bytes). Matches Migration 075 +
--   Migration 070. Declined / timeout branches may carry an optional
--   doctor-facing reason (e.g. "clinical not needed"); the CHECK
--   tolerates NULL.
--
-- Preset reason code set mirrors Migration 075 but intentionally
-- duplicates the taxonomy here (rather than sharing) so the pending
-- table can widen independently — e.g. a future "low_battery"
-- patient preset could ship in a Task 50 update without
-- touching the history-row schema.
--
-- Safety:
--   · All operations idempotent (CREATE TABLE IF NOT EXISTS, CREATE
--     INDEX IF NOT EXISTS, DO $$ for RLS DROP+CREATE POLICY).
--   · Depends on Migration 075 for the `modality_initiator` +
--     `consultation_modality` ENUMs — MUST run after 075.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Table.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS modality_change_pending_requests (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Anchors to a consultation session. CASCADE on session delete
  -- (retention doctrine — pending rows are rendered meaningless once
  -- the session itself is scrubbed). Matches Migration 075.
  session_id             UUID NOT NULL REFERENCES consultation_sessions(id) ON DELETE CASCADE,

  -- Who initiated the request. Mirrors the `modality_initiator` ENUM
  -- introduced in Migration 075 — the state machine uses the same
  -- domain vocabulary for pending + history rows.
  initiated_by           modality_initiator NOT NULL,

  -- The modality the initiator wants to move TO. `from` isn't stored
  -- here (the state machine reads `consultation_sessions.current_modality`
  -- at apply time; snapshotting `from` here would let a race race a
  -- stale value through).
  requested_modality     consultation_modality NOT NULL,

  -- Free-text reason supplied by the initiator. 5..200 codepoints when
  -- set. Enforced further by Task 47 step 8 (doctor + patient-downgrade
  -- reason required at API boundary).
  reason                 TEXT CHECK (reason IS NULL OR char_length(reason) BETWEEN 5 AND 200),

  -- Preset radio-button pick. TEXT + CHECK — matches Migration 075's
  -- preset_reason_code taxonomy so the two tables stay domain-aligned.
  preset_reason_code     TEXT CHECK (preset_reason_code IS NULL OR preset_reason_code IN (
                           'visible_symptom',
                           'need_to_hear_voice',
                           'patient_request',
                           'network_or_equipment',
                           'case_doesnt_need_modality',
                           'patient_environment',
                           'other'
                         )),

  -- Paid-upgrade patient branch: captures the delta at request time so
  -- the doctor sees the exact amount before approving; the state machine
  -- carries this value into `modalityBillingService.captureUpgradePayment`
  -- on approval. NULL on every other branch (doctor-initiated upgrade is
  -- always free; downgrades don't land in this table).
  amount_paise           INT CHECK (amount_paise IS NULL OR amount_paise > 0),

  -- Razorpay order id issued by `captureUpgradePayment`. Populated only
  -- on the patient-paid branch after the doctor approves; the mid-consult
  -- `payment.captured` webhook looks up the pending row via this column
  -- to resume the state machine (Task 49).
  razorpay_order_id      TEXT,

  -- Timestamps. `requested_at` = insert clock; `expires_at` = business
  -- deadline (patient-upgrade: 90s; doctor-upgrade: 60s). The timeout
  -- worker scans `expires_at < now() AND response IS NULL`.
  requested_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at             TIMESTAMPTZ NOT NULL,

  -- Terminal fields: filled by approve/decline/patient-consent/timeout/
  -- paid-cancel branches. `response` values:
  --   'approved_paid'       — doctor approved patient upgrade with paid billing.
  --   'approved_free'       — doctor approved patient upgrade with free billing.
  --   'allowed'             — patient consented to doctor-initiated upgrade.
  --   'declined'            — counter-party declined.
  --   'timeout'             — worker flipped it (no counter-party response in window).
  --   'checkout_cancelled'  — patient closed Razorpay modal (paid branch).
  --   'provider_failure'    — executor threw inside the commit transaction.
  responded_at           TIMESTAMPTZ,
  response               TEXT CHECK (response IS NULL OR response IN (
                           'approved_paid',
                           'approved_free',
                           'allowed',
                           'declined',
                           'timeout',
                           'checkout_cancelled',
                           'provider_failure'
                         )),

  -- Correlation id threaded through the whole flow (button tap → pending
  -- row → Razorpay order → history row → system message). NOT NULL at the
  -- application layer (Task 47 always supplies one), but the column is
  -- NULLable to allow the migration to land without a backfill.
  correlation_id         UUID,

  -- Invariant: responded_at and response move together. Prevents the
  -- "half-responded" row that would break the timeout worker scan.
  CONSTRAINT modality_change_pending_response_shape CHECK (
    (response IS NULL AND responded_at IS NULL)
    OR (response IS NOT NULL AND responded_at IS NOT NULL)
  )
);

-- ----------------------------------------------------------------------------
-- 2. Indexes.
-- ----------------------------------------------------------------------------

-- Hot read: Step 7 "is there a pending request for this session?"
--   SELECT 1
--     FROM modality_change_pending_requests
--    WHERE session_id = ? AND response IS NULL
-- Partial index keeps it tiny — most rows in steady state are terminal.
CREATE INDEX IF NOT EXISTS idx_modality_pending_session_active
  ON modality_change_pending_requests(session_id, expires_at DESC)
  WHERE response IS NULL;

-- Timeout worker scan path:
--   SELECT id, session_id, correlation_id, initiated_by, expires_at
--     FROM modality_change_pending_requests
--    WHERE response IS NULL
--      AND expires_at < now()
--    ORDER BY expires_at ASC
-- Partial + ordered index for O(log N) scan of expired-pending rows.
CREATE INDEX IF NOT EXISTS idx_modality_pending_expiry_scan
  ON modality_change_pending_requests(expires_at)
  WHERE response IS NULL;

-- Paid-upgrade webhook reverse lookup:
--   SELECT id, session_id, correlation_id, amount_paise, requested_modality
--     FROM modality_change_pending_requests
--    WHERE razorpay_order_id = ?
-- Partial to keep the index small — the majority of pending rows are
-- free branches and never set this column.
CREATE INDEX IF NOT EXISTS idx_modality_pending_razorpay_order
  ON modality_change_pending_requests(razorpay_order_id)
  WHERE razorpay_order_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 3. Row-Level Security.
-- ----------------------------------------------------------------------------
ALTER TABLE modality_change_pending_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS modality_change_pending_select_participants
  ON modality_change_pending_requests;
CREATE POLICY modality_change_pending_select_participants
  ON modality_change_pending_requests
  FOR SELECT
  USING (
    session_id IN (
      SELECT id FROM consultation_sessions
      WHERE doctor_id = auth.uid()
         OR (patient_id IS NOT NULL AND patient_id = auth.uid())
    )
  );
-- NO INSERT / UPDATE / DELETE policies: Task 47's state machine + timeout
-- worker + webhook handler all write via the service role (bypasses RLS).
-- Mirrors Migration 075's attack-surface stance — no client-write door.

COMMENT ON TABLE modality_change_pending_requests IS
    'Plan 09 Task 47. Durable in-flight approval / consent requests for '
    'mid-consult modality changes. Service-role-only writes. One row per '
    'approval / consent request; resolved to terminal `response` by the '
    'counter-party, the timeout worker, or the Razorpay webhook. See '
    '`consultation_modality_history` (Migration 075) for the committed-'
    'transition audit (append-only).';
COMMENT ON COLUMN modality_change_pending_requests.session_id IS
    'FK to consultation_sessions(id) ON DELETE CASCADE.';
COMMENT ON COLUMN modality_change_pending_requests.initiated_by IS
    'patient | doctor. Patient → doctor-approval flow (paid/free branch). '
    'Doctor → patient-consent flow (always free).';
COMMENT ON COLUMN modality_change_pending_requests.requested_modality IS
    '"to" modality. "from" is read from consultation_sessions.current_modality '
    'at apply time to avoid a stale-snapshot race.';
COMMENT ON COLUMN modality_change_pending_requests.amount_paise IS
    'Paid-upgrade delta captured at request time so the doctor sees the exact '
    'price before approving. NULL on every non-paid-upgrade branch.';
COMMENT ON COLUMN modality_change_pending_requests.razorpay_order_id IS
    'Razorpay Order id after doctor approves paid. Mid-consult `payment.captured` '
    'webhook reverse-looks-up pending rows via this column. NULL until set.';
COMMENT ON COLUMN modality_change_pending_requests.expires_at IS
    'Business deadline (90s patient-upgrade, 60s doctor-upgrade). Scanned by '
    'the `modality-pending-timeout-worker` to flip `response=timeout` when '
    'the counter-party hasn''t responded.';
COMMENT ON COLUMN modality_change_pending_requests.response IS
    'Terminal disposition. Seven values — see CHECK body. NULL means pending.';
COMMENT ON COLUMN modality_change_pending_requests.correlation_id IS
    'Traces button tap → pending row → Razorpay order → history row → system '
    'message → notification fan-out. Always populated by the state machine.';

-- ============================================================================
-- Reverse migration (documented; kept in-file so the reverse op is one
-- grep away):
--
--   DROP TABLE IF EXISTS modality_change_pending_requests;
--
-- Do NOT revert once Task 47 has landed in production — the table is
-- the source of truth for in-flight approval state. Prefer forward
-- superseding.
-- ============================================================================
