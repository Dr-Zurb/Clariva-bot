/**
 * Consultation Modality History — shared query helpers (Plan 09 · Task 46)
 *
 * Thin wrappers around the Supabase admin client that pin the exact
 * query shapes Task 47 / 49 / 55 will use against the Migration 075
 * schema. Co-located with the types in `types/modality-history.ts` so
 * downstream tasks import a tested primitive rather than re-hand-rolling
 * the chain.
 *
 * None of these helpers carry business logic (rate-limit arithmetic,
 * transition legality, refund orchestration) — that belongs in Tasks
 * 47 + 49 + 55. These are contract-pinning schema adapters only.
 *
 *   - `insertModalityHistoryRow`      — Task 47's state-machine insert
 *                                        path. Returns the wide row.
 *   - `fetchModalityHistoryForSession` — Task 55's timeline read,
 *                                        ORDER BY occurred_at ASC.
 *   - `fetchPendingRefundRows`        — Task 49's retry worker scan.
 *   - `updateRazorpayRefundId`        — Task 49's refund-confirm UPSERT
 *                                        onto an existing row.
 *   - `narrowHistoryEntry`            — pure helper that lifts a
 *                                        `ModalityHistoryRowWide` into
 *                                        the discriminated
 *                                        `ModalityHistoryEntry`.
 *
 * The Supabase admin client bypasses RLS — every write here runs as
 * service-role. RLS at the migration layer is SELECT-only (see
 * Migration 075 `modality_history_select_participants`).
 *
 * @see backend/migrations/075_consultation_modality_history.sql
 * @see backend/src/types/modality-history.ts
 * @see docs/Development/Daily-plans/April 2026/19-04-2026/Tasks/task-46-modality-history-schema-and-counters-migration.md
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Modality } from '../types/consultation-session';
import type {
  InsertModalityHistoryRow,
  ModalityBillingAction,
  ModalityHistoryEntry,
  ModalityHistoryRowWide,
  ModalityInitiator,
  ModalityPresetReasonCode,
  UpdateModalityHistoryRefundId,
} from '../types/modality-history';

// ============================================================================
// Snake-case row shape as Supabase returns it. Kept internal; callers
// consume the camelCase mirror from `types/modality-history`.
// ============================================================================

interface ModalityHistoryRowDb {
  id: string;
  session_id: string;
  from_modality: Modality;
  to_modality: Modality;
  initiated_by: ModalityInitiator;
  billing_action: ModalityBillingAction;
  amount_paise: number | null;
  razorpay_payment_id: string | null;
  razorpay_refund_id: string | null;
  reason: string | null;
  preset_reason_code: ModalityPresetReasonCode | null;
  correlation_id: string | null;
  occurred_at: string;
}

// ============================================================================
// Mappers — camelCase / snake_case split lives exclusively at the
// adapter boundary.
// ============================================================================

function historyRowFromDb(row: ModalityHistoryRowDb): ModalityHistoryRowWide {
  return {
    id:                row.id,
    sessionId:         row.session_id,
    fromModality:      row.from_modality,
    toModality:        row.to_modality,
    initiatedBy:       row.initiated_by,
    billingAction:     row.billing_action,
    amountPaise:       row.amount_paise,
    razorpayPaymentId: row.razorpay_payment_id,
    razorpayRefundId:  row.razorpay_refund_id,
    reason:            row.reason,
    presetReasonCode:  row.preset_reason_code,
    correlationId:     row.correlation_id,
    occurredAt:        row.occurred_at,
  };
}

/**
 * Lift a wide row into the `ModalityHistoryEntry` discriminated union.
 * Throws a typed error if the row's billing-shape invariants don't
 * match the DB-level `modality_history_billing_shape` CHECK — callers
 * should never see this unless someone bypassed the CHECK via a raw
 * SQL UPDATE, which would itself be a bug worth surfacing loudly.
 *
 * Pure. No DB access.
 */
export function narrowHistoryEntry(row: ModalityHistoryRowWide): ModalityHistoryEntry {
  const base = {
    id:               row.id,
    sessionId:        row.sessionId,
    fromModality:     row.fromModality,
    toModality:       row.toModality,
    initiatedBy:      row.initiatedBy,
    reason:           row.reason,
    presetReasonCode: row.presetReasonCode,
    correlationId:    row.correlationId,
    occurredAt:       row.occurredAt,
  };
  switch (row.billingAction) {
    case 'paid_upgrade': {
      if (row.amountPaise == null || row.razorpayPaymentId == null) {
        throw new Error(
          `narrowHistoryEntry: paid_upgrade row ${row.id} violates billing-shape CHECK ` +
            `(amountPaise / razorpayPaymentId must be set).`,
        );
      }
      return {
        ...base,
        billingAction:     'paid_upgrade',
        amountPaise:       row.amountPaise,
        razorpayPaymentId: row.razorpayPaymentId,
        razorpayRefundId:  null,
      };
    }
    case 'auto_refund_downgrade': {
      if (row.amountPaise == null) {
        throw new Error(
          `narrowHistoryEntry: auto_refund_downgrade row ${row.id} violates billing-shape ` +
            `CHECK (amountPaise must be set).`,
        );
      }
      return {
        ...base,
        billingAction:     'auto_refund_downgrade',
        amountPaise:       row.amountPaise,
        razorpayPaymentId: null,
        razorpayRefundId:  row.razorpayRefundId,
      };
    }
    case 'free_upgrade':
    case 'no_refund_downgrade': {
      return {
        ...base,
        billingAction:     row.billingAction,
        amountPaise:       null,
        razorpayPaymentId: null,
        razorpayRefundId:  null,
      };
    }
    default: {
      const exhaustive: never = row.billingAction;
      throw new Error(`narrowHistoryEntry: unknown billingAction ${exhaustive as string}`);
    }
  }
}

// ============================================================================
// consultation_modality_history helpers
// ============================================================================

/**
 * Insert a new modality-history row. Task 47 calls this inside the
 * transition transaction (alongside the `consultation_sessions`
 * `current_modality` + counter UPDATE). Returns the inserted wide row
 * — callers that want the narrowed union can pass the result through
 * `narrowHistoryEntry`.
 *
 * The DB-level CHECKs (`modality_history_billing_shape`,
 * `modality_history_reason_required`, `modality_history_from_to_differ`)
 * enforce shape invariants; this helper relies on those rather than
 * re-checking at the app layer — the compiler's discriminated-union
 * type on `InsertModalityHistoryRow` already pins the billing-shape
 * contract statically.
 */
export async function insertModalityHistoryRow(
  admin: SupabaseClient,
  row: InsertModalityHistoryRow,
): Promise<ModalityHistoryRowWide> {
  const payload = {
    session_id:          row.sessionId,
    from_modality:       row.fromModality,
    to_modality:         row.toModality,
    initiated_by:        row.initiatedBy,
    billing_action:      row.billingAction,
    amount_paise:        row.amountPaise ?? null,
    razorpay_payment_id: row.razorpayPaymentId ?? null,
    razorpay_refund_id:  row.razorpayRefundId ?? null,
    reason:              row.reason ?? null,
    preset_reason_code:  row.presetReasonCode ?? null,
    correlation_id:      row.correlationId,
  };
  const { data, error } = await admin
    .from('consultation_modality_history')
    .insert(payload)
    .select('*')
    .single();
  if (error || !data) {
    throw new Error(
      `insertModalityHistoryRow: ${error?.message ?? 'no row returned'}`,
    );
  }
  return historyRowFromDb(data as ModalityHistoryRowDb);
}

/**
 * Fetch every modality-history row for a session, oldest first. Task
 * 55's timeline renders in this order. Covered by
 * `idx_modality_history_session_time` (Migration 075).
 *
 * Returns `[]` if the session has no transitions (the common case for
 * a consult that started + ended at the same modality).
 */
export async function fetchModalityHistoryForSession(
  admin: SupabaseClient,
  sessionId: string,
): Promise<ModalityHistoryRowWide[]> {
  const { data, error } = await admin
    .from('consultation_modality_history')
    .select('*')
    .eq('session_id', sessionId)
    .order('occurred_at', { ascending: true });
  if (error) {
    throw new Error(
      `fetchModalityHistoryForSession: ${error.message ?? 'unknown supabase error'}`,
    );
  }
  return (data ?? []).map((r) => historyRowFromDb(r as ModalityHistoryRowDb));
}

/**
 * Scan for `auto_refund_downgrade` rows awaiting refund settlement.
 * Task 49's retry worker reads this with a `limit` each tick so it
 * doesn't stampede Razorpay on a backlog.
 *
 * The partial index `idx_modality_history_refund_pending` (Migration
 * 075) covers the WHERE predicate — the scan is O(log N) on pending
 * rows only, not O(total).
 */
export async function fetchPendingRefundRows(
  admin: SupabaseClient,
  limit: number,
): Promise<ModalityHistoryRowWide[]> {
  const { data, error } = await admin
    .from('consultation_modality_history')
    .select('*')
    .eq('billing_action', 'auto_refund_downgrade')
    .is('razorpay_refund_id', null)
    .order('occurred_at', { ascending: true })
    .limit(limit);
  if (error) {
    throw new Error(
      `fetchPendingRefundRows: ${error.message ?? 'unknown supabase error'}`,
    );
  }
  return (data ?? []).map((r) => historyRowFromDb(r as ModalityHistoryRowDb));
}

/**
 * Stamp the Razorpay refund id onto a pending `auto_refund_downgrade`
 * row. Task 49 calls this once Razorpay confirms the refund.
 *
 * Guard `.is('razorpay_refund_id', null)` prevents a double-write race
 * from overwriting an already-settled refund id — the UPDATE returns
 * 0 rows on conflict, which the caller treats as a lost-race no-op.
 * Returns the resolved row on success; `null` when no matching row
 * (the refund id was already settled by a concurrent worker, or the
 * row id is stale).
 */
export async function updateRazorpayRefundId(
  admin: SupabaseClient,
  update: UpdateModalityHistoryRefundId,
): Promise<ModalityHistoryRowWide | null> {
  const { data, error } = await admin
    .from('consultation_modality_history')
    .update({ razorpay_refund_id: update.razorpayRefundId })
    .eq('id', update.id)
    .eq('billing_action', 'auto_refund_downgrade')
    .is('razorpay_refund_id', null)
    .select('*')
    .maybeSingle();
  if (error) {
    throw new Error(
      `updateRazorpayRefundId: ${error.message ?? 'unknown supabase error'}`,
    );
  }
  if (!data) return null;
  return historyRowFromDb(data as ModalityHistoryRowDb);
}
