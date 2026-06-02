/**
 * Modality Change — pending-requests query helpers (Plan 09 · Task 47)
 *
 * Thin Supabase admin client wrappers around the
 * `modality_change_pending_requests` table (Migration 076). Mirrors the
 * shape of `modality-history-queries.ts` so the two sit next to each
 * other — callers import a tested primitive instead of re-hand-rolling
 * the snake↔camel adapter chain.
 *
 * No business logic. No rate-limit arithmetic. The state machine in
 * `modality-change-service.ts` owns the policy; this file owns the
 * schema contract only.
 *
 *   - `insertModalityPendingRow`          — state-machine branch (Step 9 patient-upgrade
 *                                           + doctor-upgrade) creates a pending row.
 *   - `fetchActivePendingForSession`      — Step 7 "is there a pending request?"
 *                                           Uses the partial index
 *                                           `idx_modality_pending_session_active`.
 *   - `fetchPendingById`                  — single-row fetch for approve / consent /
 *                                           webhook dispatch paths.
 *   - `fetchPendingByRazorpayOrderId`     — mid-consult `payment.captured`
 *                                           webhook reverse lookup.
 *   - `resolvePendingRequest`             — atomic UPDATE with
 *                                           `response IS NULL` guard; caller
 *                                           treats a 0-row return as a lost-race
 *                                           no-op.
 *   - `stampRazorpayOrderOnPending`       — UPDATE only the `razorpay_order_id`
 *                                           column on the approved-paid branch.
 *   - `fetchExpiredPendingRequests`       — timeout-worker scan path
 *                                           (`expires_at < cutoff` AND
 *                                           `response IS NULL`).
 *
 * The `fetchActivePendingForSession` query matches ANY active
 * (`response IS NULL`) pending row regardless of `initiated_by` or
 * `expires_at` — Step 7's semantics are "the session is busy with a
 * pending negotiation, no new request allowed". The timeout worker
 * expires stale rows within 5s, so stuck-pending rows are short-lived.
 *
 * @see backend/migrations/076_modality_change_pending_requests.sql
 * @see backend/src/types/modality-change.ts
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Modality } from '../types/consultation-session';
import type {
  InsertModalityChangePendingRow,
  ModalityChangePendingRow,
  ModalityInitiator,
  ModalityPendingResponse,
  ModalityPresetReasonCode,
  UpdateModalityChangePendingResponse,
} from '../types/modality-change';

// ============================================================================
// Snake-case row shape as Supabase returns it.
// ============================================================================

interface ModalityPendingRowDb {
  id: string;
  session_id: string;
  initiated_by: ModalityInitiator;
  requested_modality: Modality;
  reason: string | null;
  preset_reason_code: ModalityPresetReasonCode | null;
  amount_paise: number | null;
  razorpay_order_id: string | null;
  requested_at: string;
  expires_at: string;
  responded_at: string | null;
  response: ModalityPendingResponse | null;
  correlation_id: string | null;
}

function pendingRowFromDb(row: ModalityPendingRowDb): ModalityChangePendingRow {
  return {
    id:                row.id,
    sessionId:         row.session_id,
    initiatedBy:       row.initiated_by,
    requestedModality: row.requested_modality,
    reason:            row.reason,
    presetReasonCode:  row.preset_reason_code,
    amountPaise:       row.amount_paise,
    razorpayOrderId:   row.razorpay_order_id,
    requestedAt:       row.requested_at,
    expiresAt:         row.expires_at,
    respondedAt:       row.responded_at,
    response:          row.response,
    correlationId:     row.correlation_id,
  };
}

// ============================================================================
// Inserts + updates.
// ============================================================================

/**
 * Insert a new pending request. Returns the persisted camelCase row.
 * The DB defaults `id`, `requested_at`, `response`, `responded_at`.
 *
 * Callers MUST supply `expiresAt` — the state machine computes it
 * (`now() + 90s` patient-upgrade, `now() + 60s` doctor-upgrade) before
 * calling; this helper stays dumb.
 */
export async function insertModalityPendingRow(
  admin: SupabaseClient,
  row: InsertModalityChangePendingRow,
): Promise<ModalityChangePendingRow> {
  const payload = {
    session_id:         row.sessionId,
    initiated_by:       row.initiatedBy,
    requested_modality: row.requestedModality,
    reason:             row.reason ?? null,
    preset_reason_code: row.presetReasonCode ?? null,
    amount_paise:       row.amountPaise ?? null,
    razorpay_order_id:  row.razorpayOrderId ?? null,
    expires_at:         row.expiresAt,
    correlation_id:     row.correlationId,
  };
  const { data, error } = await admin
    .from('modality_change_pending_requests')
    .insert(payload)
    .select('*')
    .single();
  if (error || !data) {
    throw new Error(
      `insertModalityPendingRow: ${error?.message ?? 'no row returned'}`,
    );
  }
  return pendingRowFromDb(data as ModalityPendingRowDb);
}

/**
 * Atomic resolve of a pending request. Guard `response IS NULL` prevents
 * a double-resolve race (fast patient clicks approve at 59.9s + worker
 * tick at 60s → only one UPDATE wins).
 *
 * Returns the resolved row on success; `null` when the row was already
 * terminal (lost race — caller's branch handles this as a no-op).
 */
export async function resolvePendingRequest(
  admin: SupabaseClient,
  update: UpdateModalityChangePendingResponse,
): Promise<ModalityChangePendingRow | null> {
  const payload: Record<string, unknown> = {
    response:     update.response,
    responded_at: update.respondedAt,
  };
  if (update.razorpayOrderId !== undefined) {
    payload.razorpay_order_id = update.razorpayOrderId;
  }
  const { data, error } = await admin
    .from('modality_change_pending_requests')
    .update(payload)
    .eq('id', update.id)
    .is('response', null)
    .select('*')
    .maybeSingle();
  if (error) {
    throw new Error(
      `resolvePendingRequest: ${error.message ?? 'unknown supabase error'}`,
    );
  }
  if (!data) return null;
  return pendingRowFromDb(data as ModalityPendingRowDb);
}

/**
 * Stamp the Razorpay order id onto an already-approved-paid pending
 * row. Called by the state machine after it creates the Razorpay order
 * and before it publishes the `checkout_ready` Realtime event.
 *
 * Separate from `resolvePendingRequest` because the resolve + order-id
 * stamp happen in the same branch; but the guard predicates differ —
 * this UPDATE runs on an ALREADY-terminal (`response = 'approved_paid'`)
 * row, whereas `resolvePendingRequest` runs on a pending row.
 */
export async function stampRazorpayOrderOnPending(
  admin: SupabaseClient,
  id: string,
  razorpayOrderId: string,
): Promise<ModalityChangePendingRow | null> {
  const { data, error } = await admin
    .from('modality_change_pending_requests')
    .update({ razorpay_order_id: razorpayOrderId })
    .eq('id', id)
    .eq('response', 'approved_paid')
    .is('razorpay_order_id', null)
    .select('*')
    .maybeSingle();
  if (error) {
    throw new Error(
      `stampRazorpayOrderOnPending: ${error.message ?? 'unknown supabase error'}`,
    );
  }
  if (!data) return null;
  return pendingRowFromDb(data as ModalityPendingRowDb);
}

// ============================================================================
// Reads.
// ============================================================================

/**
 * Step 7 guard: is there ANY active (unresolved) pending request for
 * this session? Matches any `initiated_by` — a patient-initiated pending
 * blocks a doctor-initiated request and vice versa (Decision 11: only
 * one in-flight negotiation per session).
 *
 * Covered by `idx_modality_pending_session_active` (partial index
 * WHERE response IS NULL) — O(log N) in practice.
 */
export async function fetchActivePendingForSession(
  admin: SupabaseClient,
  sessionId: string,
): Promise<ModalityChangePendingRow | null> {
  const { data, error } = await admin
    .from('modality_change_pending_requests')
    .select('*')
    .eq('session_id', sessionId)
    .is('response', null)
    .order('expires_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error(
      `fetchActivePendingForSession: ${error.message ?? 'unknown supabase error'}`,
    );
  }
  if (!data) return null;
  return pendingRowFromDb(data as ModalityPendingRowDb);
}

/**
 * Fetch a specific pending row by id. Used by the approve / consent
 * routes + the Razorpay webhook dispatcher (after the order-id
 * reverse lookup returns the id). Returns `null` on miss; callers
 * surface a `404`.
 */
export async function fetchPendingById(
  admin: SupabaseClient,
  id: string,
): Promise<ModalityChangePendingRow | null> {
  const { data, error } = await admin
    .from('modality_change_pending_requests')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) {
    throw new Error(
      `fetchPendingById: ${error.message ?? 'unknown supabase error'}`,
    );
  }
  if (!data) return null;
  return pendingRowFromDb(data as ModalityPendingRowDb);
}

/**
 * Reverse lookup for the mid-consult `payment.captured` webhook.
 * Covered by `idx_modality_pending_razorpay_order` (partial, tiny).
 * Matches regardless of `response` — the webhook may arrive after a
 * `checkout_cancelled` terminal flip due to Razorpay-side retry, and
 * the state machine decides how to handle the race.
 */
export async function fetchPendingByRazorpayOrderId(
  admin: SupabaseClient,
  razorpayOrderId: string,
): Promise<ModalityChangePendingRow | null> {
  const { data, error } = await admin
    .from('modality_change_pending_requests')
    .select('*')
    .eq('razorpay_order_id', razorpayOrderId)
    .maybeSingle();
  if (error) {
    throw new Error(
      `fetchPendingByRazorpayOrderId: ${error.message ?? 'unknown supabase error'}`,
    );
  }
  if (!data) return null;
  return pendingRowFromDb(data as ModalityPendingRowDb);
}

/**
 * Timeout worker scan path. Returns up to `limit` rows whose
 * `expires_at < cutoffIso` and are still pending. Ordered ASC so the
 * oldest-expired row times out first.
 *
 * Uses `idx_modality_pending_expiry_scan` (partial ordered index).
 */
export async function fetchExpiredPendingRequests(
  admin: SupabaseClient,
  cutoffIso: string,
  limit: number,
): Promise<ModalityChangePendingRow[]> {
  const { data, error } = await admin
    .from('modality_change_pending_requests')
    .select('*')
    .is('response', null)
    .lt('expires_at', cutoffIso)
    .order('expires_at', { ascending: true })
    .limit(limit);
  if (error) {
    throw new Error(
      `fetchExpiredPendingRequests: ${error.message ?? 'unknown supabase error'}`,
    );
  }
  return (data ?? []).map((r) => pendingRowFromDb(r as ModalityPendingRowDb));
}
