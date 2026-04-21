/**
 * Modality Refund Retry Worker (Plan 09 · Task 49)
 *
 * Polls `consultation_modality_history` for `auto_refund_downgrade`
 * rows that are still missing a `razorpay_refund_id` and retries the
 * Razorpay refund with exponential backoff. Pairs with the inline
 * refund call in Task 47's state machine (which tries once, then
 * leaves NULL if the inline call fails).
 *
 * ## Backoff ladder
 *
 *   attempt | min age since occurred_at
 *   --------|--------------------------
 *      1    | ≥ 1 minute
 *      2    | ≥ 5 minutes
 *      3    | ≥ 15 minutes
 *      4    | ≥ 1 hour
 *      5    | ≥ 6 hours
 *      6    | ≥ 24 hours
 *
 * After attempt 6 (≥24h elapsed since the transition), if Razorpay
 * still hasn't confirmed the refund, the worker writes the permanent-
 * failure sentinel (`refund_retry_count = 99`) + inserts an
 * `admin_payment_alerts` row with kind `refund_stuck_24h`. Ops must
 * investigate and manually close.
 *
 * ## Atomicity + idempotent stamp
 *
 * The worker uses the billing-service's `autoRefundDowngrade` with
 * `attemptNumber` so the Razorpay `Idempotency-Key` varies per
 * attempt — Razorpay dedups within 24h on the same key, so a
 * worker re-try within that window is safe. The DB-level
 * `razorpay_refund_id IS NULL` predicate on the UPDATE guards against
 * two pods racing to stamp the same row (matches the
 * `updateRazorpayRefundId` pattern).
 *
 * ## Why polling
 *
 * Same rationale as the modality-pending-timeout-worker: BullMQ would
 * dedup in-memory and lose timers on pod crash; Postgres polling
 * survives restarts and scales across pods without coordination.
 *
 * ## Customer copy
 *
 * On the first worker attempt (regardless of outcome), emit a system
 * message "Refund of ₹X processing — expect within 3 business days."
 * Decision 11 resilience copy. Subsequent retries are silent —
 * patient doesn't need retry noise. On permanent failure, emit the
 * "couldn't automatically refund" copy once.
 *
 * @see docs/Development/Daily-plans/April 2026/19-04-2026/Tasks/task-49-modality-billing-razorpay-capture-and-refund.md
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { getSupabaseAdminClient } from '../config/database';
import { logger } from '../config/logger';
import { getModalityBillingService } from '../services/modality-billing-service';
import { emitSystemMessage } from '../services/consultation-message-service';
import {
  buildRefundFailedDm,
  buildRefundProcessingDm,
} from '../utils/dm-copy';

// ============================================================================
// Constants
// ============================================================================

/** Cap per tick so a backlog after a cron outage doesn't DOS Razorpay. */
const BATCH_SIZE_CAP = 50;

/** Permanent-failure sentinel — matches the CHECK bounds in Migration 077. */
export const REFUND_RETRY_PERMANENT_SENTINEL = 99;

/** Attempt count at which we give up + write `refund_stuck_24h` alert. */
export const REFUND_RETRY_STUCK_ATTEMPT = 6;

/**
 * Per-attempt minimum age gate (ms). Attempt N uses index N-1.
 * The 1st attempt is allowed ≥1min after the row was inserted; the
 * 6th attempt is gated behind 24h.
 */
export const REFUND_RETRY_BACKOFF_MS: ReadonlyArray<number> = [
  1 * 60 * 1000,         // attempt 1: ≥ 1m
  5 * 60 * 1000,         // attempt 2: ≥ 5m
  15 * 60 * 1000,        // attempt 3: ≥ 15m
  60 * 60 * 1000,        // attempt 4: ≥ 1h
  6 * 60 * 60 * 1000,    // attempt 5: ≥ 6h
  24 * 60 * 60 * 1000,   // attempt 6: ≥ 24h
];

// ============================================================================
// Result shapes
// ============================================================================

export interface ModalityRefundRetryJobResult {
  /** Rows fetched from the scan (pre-backoff filter). */
  scanned:     number;
  /** Rows the worker actually attempted a refund on this tick. */
  attempted:   number;
  /** Rows that succeeded synchronously (refund id stamped). */
  succeeded:   number;
  /** Rows whose retry failed — still NULL refund id; will retry next tick. */
  requeued:    number;
  /** Rows that tripped the 24h sentinel this tick (admin alert written). */
  stuck:       number;
  /** Rows filtered out by the backoff gate (not ready yet). */
  skippedBackoff: number;
  errors:      string[];
}

// ============================================================================
// Pending row shape (internal)
// ============================================================================

interface PendingRefundRow {
  id:                         string;
  sessionId:                  string;
  amountPaise:                number;
  razorpayPaymentId:          string | null;
  correlationId:              string | null;
  occurredAt:                 string;
  refundRetryCount:           number;
  refundRetryLastAttemptAt:   string | null;
}

// ============================================================================
// Public: runModalityRefundRetryJob
// ============================================================================

export async function runModalityRefundRetryJob(
  correlationId: string,
): Promise<ModalityRefundRetryJobResult> {
  const result: ModalityRefundRetryJobResult = {
    scanned: 0,
    attempted: 0,
    succeeded: 0,
    requeued: 0,
    stuck: 0,
    skippedBackoff: 0,
    errors: [],
  };

  const admin = getSupabaseAdminClient();
  if (!admin) {
    logger.error(
      { correlationId },
      'modality-refund-retry-worker: no admin client — tick skipped',
    );
    return result;
  }

  let rows: PendingRefundRow[];
  try {
    rows = await fetchPendingRefundRowsWide(admin, BATCH_SIZE_CAP);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(
      { correlationId, error: msg },
      'modality-refund-retry-worker: scan query failed',
    );
    result.errors.push(msg);
    return result;
  }

  result.scanned = rows.length;
  if (rows.length === 0) {
    logger.debug(
      { correlationId },
      'modality-refund-retry-worker: no pending refund rows',
    );
    return result;
  }

  const nowMs = Date.now();
  for (const row of rows) {
    const rowCorrelationId = row.correlationId ?? correlationId;
    try {
      // Backoff gate: how long since row was inserted + how long since
      // the last attempt? Use whichever is more recent so the first-
      // ever attempt uses `occurred_at` (the 1m gate) and subsequent
      // attempts use the last-attempt timestamp + the N-th gap.
      const nextAttempt = row.refundRetryCount + 1;
      if (nextAttempt > REFUND_RETRY_STUCK_ATTEMPT) {
        // Already at attempt 7+; caller should not have returned this
        // row (the partial index filters count < 99). If it slipped
        // past, sentinel it now.
        await sentinelAsStuck(admin, row, correlationId, result);
        continue;
      }

      const gateMs = REFUND_RETRY_BACKOFF_MS[nextAttempt - 1] ?? 0;
      const referenceMs = row.refundRetryLastAttemptAt
        ? new Date(row.refundRetryLastAttemptAt).getTime()
        : new Date(row.occurredAt).getTime();
      if (nowMs - referenceMs < gateMs) {
        result.skippedBackoff += 1;
        continue;
      }

      if (!row.razorpayPaymentId) {
        // Shouldn't happen — the history row's billing-shape CHECK
        // disallows `auto_refund_downgrade` without a payment ref on
        // the originating appointment. We didn't snapshot the
        // payment id on the history row itself (task-49 spec mentions
        // joining to appointments), so look it up now.
        const paymentId = await lookupOriginalPaymentId(admin, row.sessionId, correlationId);
        if (!paymentId) {
          logger.error(
            {
              correlationId: rowCorrelationId,
              historyRowId: row.id,
              sessionId: row.sessionId,
            },
            'modality-refund-retry-worker: cannot locate original razorpay_payment_id — sentinelling',
          );
          await sentinelAsStuck(admin, row, correlationId, result, 'missing_original_payment_id');
          continue;
        }
        row.razorpayPaymentId = paymentId;
      }

      result.attempted += 1;
      const billing = getModalityBillingService();
      const refundResult = await billing.autoRefundDowngrade({
        historyRowId:              row.id,
        originalRazorpayPaymentId: row.razorpayPaymentId,
        amountPaise:               row.amountPaise,
        reason:                    'doctor_downgrade',
        correlationId:             rowCorrelationId,
        attemptNumber:             nextAttempt,
      });

      // First-attempt DM fires exactly once regardless of outcome.
      if (nextAttempt === 1) {
        await emitRefundProcessingDm(
          row.sessionId,
          row.amountPaise,
          rowCorrelationId,
        );
      }

      if (refundResult.status === 'sync_success') {
        // Billing service already stamped `razorpay_refund_id`. Clear
        // the retry bookkeeping so future scans don't pick it up.
        await admin
          .from('consultation_modality_history')
          .update({
            refund_retry_count:            nextAttempt,
            refund_retry_last_attempt_at:  new Date().toISOString(),
            refund_retry_failure_reason:   null,
          })
          .eq('id', row.id);
        result.succeeded += 1;
        logger.info(
          {
            correlationId: rowCorrelationId,
            historyRowId: row.id,
            attempt: nextAttempt,
            razorpayRefundId: refundResult.razorpayRefundId,
          },
          'modality-refund-retry-worker: refund succeeded',
        );
        continue;
      }

      // Queued — record attempt + decide whether to sentinel.
      if (refundResult.permanent || nextAttempt >= REFUND_RETRY_STUCK_ATTEMPT) {
        await sentinelAsStuck(
          admin,
          row,
          correlationId,
          result,
          refundResult.failureReason ?? 'retry_limit_reached',
          nextAttempt,
        );
        continue;
      }

      await admin
        .from('consultation_modality_history')
        .update({
          refund_retry_count:            nextAttempt,
          refund_retry_last_attempt_at:  new Date().toISOString(),
          refund_retry_failure_reason:   refundResult.failureReason ?? 'unknown',
        })
        .eq('id', row.id);
      result.requeued += 1;
      logger.warn(
        {
          correlationId: rowCorrelationId,
          historyRowId: row.id,
          attempt: nextAttempt,
          failureReason: refundResult.failureReason,
        },
        'modality-refund-retry-worker: refund still failing — rescheduled',
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(msg);
      logger.error(
        { correlationId: rowCorrelationId, historyRowId: row.id, error: msg },
        'modality-refund-retry-worker: unexpected error processing row',
      );
    }
  }

  logger.info(
    {
      correlationId,
      scanned: result.scanned,
      attempted: result.attempted,
      succeeded: result.succeeded,
      requeued: result.requeued,
      stuck: result.stuck,
      skippedBackoff: result.skippedBackoff,
      errors: result.errors.length,
    },
    'modality-refund-retry-worker: tick complete',
  );

  return result;
}

// ============================================================================
// Internals
// ============================================================================

async function fetchPendingRefundRowsWide(
  admin: SupabaseClient,
  limit: number,
): Promise<PendingRefundRow[]> {
  const { data, error } = await admin
    .from('consultation_modality_history')
    .select(
      'id, session_id, amount_paise, razorpay_payment_id, correlation_id, occurred_at, refund_retry_count, refund_retry_last_attempt_at',
    )
    .eq('billing_action', 'auto_refund_downgrade')
    .is('razorpay_refund_id', null)
    .lt('refund_retry_count', REFUND_RETRY_PERMANENT_SENTINEL)
    .order('occurred_at', { ascending: true })
    .limit(limit);
  if (error) {
    throw new Error(`fetchPendingRefundRows: ${error.message}`);
  }
  return (data ?? []).map((r) => ({
    id:                        r.id as string,
    sessionId:                 r.session_id as string,
    amountPaise:               r.amount_paise as number,
    razorpayPaymentId:         (r.razorpay_payment_id as string | null) ?? null,
    correlationId:             (r.correlation_id as string | null) ?? null,
    occurredAt:                r.occurred_at as string,
    refundRetryCount:          (r.refund_retry_count as number | null) ?? 0,
    refundRetryLastAttemptAt:  (r.refund_retry_last_attempt_at as string | null) ?? null,
  }));
}

/**
 * Resolve the original booking payment id for a session. The
 * modality-history row doesn't carry `razorpay_payment_id` for
 * `auto_refund_downgrade` rows (the billing-shape CHECK forbids it
 * on that branch — see Migration 075 line 284); we reach back to the
 * appointment the session was spawned from.
 */
async function lookupOriginalPaymentId(
  admin: SupabaseClient,
  sessionId: string,
  correlationId: string,
): Promise<string | null> {
  const { data: session } = await admin
    .from('consultation_sessions')
    .select('appointment_id')
    .eq('id', sessionId)
    .maybeSingle();
  const appointmentId = session?.appointment_id as string | null | undefined;
  if (!appointmentId) {
    logger.warn({ correlationId, sessionId }, 'lookupOriginalPaymentId: no appointment_id');
    return null;
  }
  const { data: apt } = await admin
    .from('appointments')
    .select('razorpay_payment_id')
    .eq('id', appointmentId)
    .maybeSingle();
  return (apt?.razorpay_payment_id as string | null | undefined) ?? null;
}

/**
 * Write the permanent-failure sentinel + best-effort insert an
 * `admin_payment_alerts` row. Idempotent via the partial unique
 * index on `alert_kind = 'refund_stuck_24h'`.
 */
async function sentinelAsStuck(
  admin: SupabaseClient,
  row: PendingRefundRow,
  tickCorrelationId: string,
  result: ModalityRefundRetryJobResult,
  failureReason = 'retry_limit_reached',
  attemptNumber: number = REFUND_RETRY_STUCK_ATTEMPT,
): Promise<void> {
  const rowCorrelationId = row.correlationId ?? tickCorrelationId;
  const { error: updateErr } = await admin
    .from('consultation_modality_history')
    .update({
      refund_retry_count:           REFUND_RETRY_PERMANENT_SENTINEL,
      refund_retry_last_attempt_at: new Date().toISOString(),
      refund_retry_failure_reason:  failureReason,
    })
    .eq('id', row.id);
  if (updateErr) {
    logger.error(
      { correlationId: rowCorrelationId, historyRowId: row.id, error: updateErr.message },
      'modality-refund-retry-worker: sentinel UPDATE failed',
    );
    result.errors.push(`sentinel_update: ${updateErr.message}`);
  }

  const { error: insertErr } = await admin
    .from('admin_payment_alerts')
    .insert({
      alert_kind:        'refund_stuck_24h',
      related_entity_id: row.id,
      context_json:      {
        sessionId:        row.sessionId,
        amountPaise:      row.amountPaise,
        correlationId:    rowCorrelationId,
        attemptNumber,
        failureReason,
        occurredAt:       row.occurredAt,
      },
    });
  if (insertErr && !/duplicate key value/i.test(insertErr.message)) {
    logger.error(
      { correlationId: rowCorrelationId, historyRowId: row.id, error: insertErr.message },
      'modality-refund-retry-worker: admin_payment_alerts insert failed',
    );
    result.errors.push(`admin_alert_insert: ${insertErr.message}`);
  }

  result.stuck += 1;

  // Emit the "couldn't automatically refund" DM once. Dedup via
  // `emitSystemMessage`'s correlation-id-scoped LRU guard.
  await emitRefundFailedDm(row.sessionId, row.amountPaise, rowCorrelationId);

  logger.error(
    {
      correlationId: rowCorrelationId,
      historyRowId: row.id,
      sessionId: row.sessionId,
      amountPaise: row.amountPaise,
      attemptNumber,
      failureReason,
    },
    'modality-refund-retry-worker: refund permanently stuck — admin alert written',
  );
}

async function emitRefundProcessingDm(
  sessionId: string,
  amountPaise: number,
  correlationId: string,
): Promise<void> {
  const amountInr = Math.round(amountPaise / 100);
  try {
    await emitSystemMessage({
      sessionId,
      event: 'modality_refund_processing',
      body: buildRefundProcessingDm({ amountInr, expectedDays: 3 }),
      correlationId: `${correlationId}::refund_processing`,
      meta: { amountPaise, kind: 'refund_processing' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(
      { correlationId, sessionId, error: msg },
      'emitRefundProcessingDm: emit failed (non-fatal)',
    );
  }
}

async function emitRefundFailedDm(
  sessionId: string,
  amountPaise: number,
  correlationId: string,
): Promise<void> {
  const amountInr = Math.round(amountPaise / 100);
  try {
    await emitSystemMessage({
      sessionId,
      event: 'modality_refund_failed',
      body: buildRefundFailedDm({ amountInr }),
      correlationId: `${correlationId}::refund_failed`,
      meta: { amountPaise, kind: 'refund_failed' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(
      { correlationId, sessionId, error: msg },
      'emitRefundFailedDm: emit failed (non-fatal)',
    );
  }
}

// ============================================================================
// Test-only helpers
// ============================================================================

export const __testOnly__ = {
  fetchPendingRefundRowsWide,
  lookupOriginalPaymentId,
  sentinelAsStuck,
  REFUND_RETRY_BACKOFF_MS,
};
