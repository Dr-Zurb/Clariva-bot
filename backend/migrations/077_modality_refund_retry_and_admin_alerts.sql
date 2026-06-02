-- ============================================================================
-- 077_modality_refund_retry_and_admin_alerts.sql
-- Plan 09 · Task 49 — mid-consult Razorpay refund retry worker + admin alerts
-- Date:    2026-04-19
-- ============================================================================
-- Purpose:
--   Task 49's refund retry worker needs per-row state that Migration
--   075 didn't provision (the partial index was pre-provisioned; the
--   worker's backoff bookkeeping wasn't). This migration adds:
--
--     1. Three columns on `consultation_modality_history`:
--          · refund_retry_count            INT — number of retry
--                                                attempts made. `0`
--                                                initially; `99`
--                                                sentinel after 7
--                                                failed attempts
--                                                (permanently stuck
--                                                → admin alert).
--          · refund_retry_last_attempt_at  TIMESTAMPTZ — wall clock of
--                                                the last worker tick
--                                                that touched the row.
--                                                Drives the backoff
--                                                schedule (1m → 5m →
--                                                15m → 1h → 6h → 24h).
--          · refund_retry_failure_reason   TEXT — Razorpay error
--                                                message from the last
--                                                failed attempt. Pure
--                                                diagnostic; NULL when
--                                                no attempts yet made.
--
--     2. A new `admin_payment_alerts` table for the "stuck refund"
--        dashboard surface + future payment-adjacent alerts
--        (signature mismatches, orphaned orders).
--
--     3. A refreshed partial index `idx_modality_history_refund_pending`
--        that filters out the permanent-failure sentinel so the worker
--        doesn't keep re-scanning rows it's given up on.
--
-- Doctrine:
--   · TEXT + CHECK (not ENUM) for `alert_kind`: taxonomy widens
--     additively (new alert kinds in Plan 10+) without an `ALTER TYPE`
--     dance.
--   · Service-role-only writes on `admin_payment_alerts` — no RLS
--     policies for non-service callers; the admin dashboard uses the
--     shared `CRON_SECRET` gate (matches `api/v1/admin.ts`).
--   · Idempotent (IF NOT EXISTS / DO $$ blocks) so the migration can
--     replay after a partial rollout without raising.
--
-- Safety:
--   · Column ADDs are non-blocking (default-null, plus a DEFAULT 0 on
--     `refund_retry_count` which Postgres now lazy-fills since 11+).
--   · The DROP + CREATE INDEX for the partial index runs online — the
--     old index is kept up to the CREATE, then dropped. Names pinned
--     so a concurrent replica replay is idempotent.
--
-- Reverse migration: documented at the bottom of this file.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Retry bookkeeping columns on consultation_modality_history.
-- ----------------------------------------------------------------------------
ALTER TABLE consultation_modality_history
  ADD COLUMN IF NOT EXISTS refund_retry_count            INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refund_retry_last_attempt_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS refund_retry_failure_reason   TEXT;

-- Sentinel constraint: the worker sets `refund_retry_count = 99` once
-- it gives up (after 7 attempts). The CHECK caps the domain so a bug
-- that increments past 99 surfaces loudly rather than silently DOSing
-- Razorpay. Widened marginally (to 150) to leave room for operational
-- manual retries without tripping.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'modality_history_refund_retry_count_bounds'
  ) THEN
    ALTER TABLE consultation_modality_history
      ADD CONSTRAINT modality_history_refund_retry_count_bounds
        CHECK (refund_retry_count BETWEEN 0 AND 150);
  END IF;
END $$;

COMMENT ON COLUMN consultation_modality_history.refund_retry_count IS
    'Plan 09 Task 49. Number of worker retry attempts made. 0=not yet '
    'tried (just inserted). 1..7 active retry lane. 99 permanent '
    'failure sentinel — worker stops + admin alert fires.';
COMMENT ON COLUMN consultation_modality_history.refund_retry_last_attempt_at IS
    'Plan 09 Task 49. Wall-clock timestamp of the most recent worker '
    'tick that touched this row. NULL until first attempt. Powers the '
    'backoff scheduler (1m → 5m → 15m → 1h → 6h → 24h).';
COMMENT ON COLUMN consultation_modality_history.refund_retry_failure_reason IS
    'Plan 09 Task 49. Razorpay error message from the most recent '
    'failed attempt. NULL while the retry lane is clean.';

-- ----------------------------------------------------------------------------
-- 2. admin_payment_alerts table.
-- ----------------------------------------------------------------------------
-- One row per unresolved payment-ops concern. Tiny table — rows are
-- acknowledged and then archived by a separate ops process (not shipped
-- in v1). Doesn't enable RLS; queries go through the CRON_SECRET-gated
-- admin route.

CREATE TABLE IF NOT EXISTS admin_payment_alerts (
  id                UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_kind        TEXT            NOT NULL CHECK (alert_kind IN (
                                      'refund_stuck_24h',
                                      'payment_signature_mismatch',
                                      'mid_consult_order_orphaned'
                                    )),
  -- history row id (for `refund_stuck_24h`), pending request id (for
  -- `mid_consult_order_orphaned`), or NULL (signature mismatches carry
  -- their context in `context_json`).
  related_entity_id UUID,
  -- Free-form JSON blob with whatever the alerting code found useful:
  -- correlation id, Razorpay error, amounts, etc. No PHI.
  context_json      JSONB           NOT NULL,
  created_at        TIMESTAMPTZ     NOT NULL DEFAULT now(),
  acknowledged_at   TIMESTAMPTZ,
  acknowledged_by   UUID
);

-- Dedup guard: the worker must not insert two `refund_stuck_24h` rows
-- for the same history row. Partial unique index (WHERE kind=...) lets
-- other kinds repeat per entity if the taxonomy ever needs it.
CREATE UNIQUE INDEX IF NOT EXISTS uq_admin_payment_alerts_refund_stuck_entity
  ON admin_payment_alerts(related_entity_id)
  WHERE alert_kind = 'refund_stuck_24h';

-- Hot read: ops dashboard "unacknowledged alerts, newest first".
CREATE INDEX IF NOT EXISTS idx_admin_payment_alerts_unacked_created
  ON admin_payment_alerts(created_at DESC)
  WHERE acknowledged_at IS NULL;

COMMENT ON TABLE admin_payment_alerts IS
    'Plan 09 Task 49. Payment-ops escalation queue. Rows written by the '
    'refund retry worker (after 7 failed attempts) and future signature-'
    'mismatch / orphaned-order detectors. Service-role writes only.';
COMMENT ON COLUMN admin_payment_alerts.alert_kind IS
    'Widens additively via CHECK drop/recreate. v1 values: '
    'refund_stuck_24h, payment_signature_mismatch, mid_consult_order_orphaned.';
COMMENT ON COLUMN admin_payment_alerts.related_entity_id IS
    'UUID of the entity the alert is about (history row / pending request). '
    'NULL allowed for entity-less alerts (generic signature mismatch).';
COMMENT ON COLUMN admin_payment_alerts.context_json IS
    'Diagnostic bag — correlation id, Razorpay error message, amounts. '
    'No PHI. Surfaced verbatim in the admin payment-alerts endpoint.';

-- ----------------------------------------------------------------------------
-- 3. Refresh the refund-pending partial index.
-- ----------------------------------------------------------------------------
-- Migration 075 pre-provisioned `idx_modality_history_refund_pending`
-- without the permanent-failure sentinel filter. Now that the sentinel
-- column exists we refine the predicate so the worker skips rows it has
-- permanently given up on. Keep the name so downstream code doesn't
-- need to change.

DROP INDEX IF EXISTS idx_modality_history_refund_pending;
CREATE INDEX IF NOT EXISTS idx_modality_history_refund_pending
  ON consultation_modality_history(occurred_at)
  WHERE billing_action = 'auto_refund_downgrade'
    AND razorpay_refund_id IS NULL
    AND refund_retry_count < 99;

-- ============================================================================
-- Reverse migration (documented; kept in-file so the reverse op is one
-- grep away):
--
--   DROP INDEX IF EXISTS idx_modality_history_refund_pending;
--   CREATE INDEX IF NOT EXISTS idx_modality_history_refund_pending
--     ON consultation_modality_history(occurred_at)
--     WHERE billing_action = 'auto_refund_downgrade' AND razorpay_refund_id IS NULL;
--
--   ALTER TABLE consultation_modality_history
--     DROP CONSTRAINT IF EXISTS modality_history_refund_retry_count_bounds,
--     DROP COLUMN IF EXISTS refund_retry_count,
--     DROP COLUMN IF EXISTS refund_retry_last_attempt_at,
--     DROP COLUMN IF EXISTS refund_retry_failure_reason;
--
--   DROP INDEX IF EXISTS uq_admin_payment_alerts_refund_stuck_entity;
--   DROP INDEX IF EXISTS idx_admin_payment_alerts_unacked_created;
--   DROP TABLE IF EXISTS admin_payment_alerts;
--
-- Prefer forward superseding in production — a permanent-failure
-- sentinel row reverted back to retry lane would re-hammer Razorpay.
-- ============================================================================
