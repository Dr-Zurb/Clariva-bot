/**
 * Modality Change State Machine (Plan 09 · Task 47 · Decision 11 LOCKED)
 *
 * v1's single most critical state machine. One public function —
 * `requestModalityChange()` — routes every mid-consult modality
 * transition through nine enforcement steps (Decision 11 LOCKED):
 *
 *   Step 0: correlation-id + structured-log start.
 *   Step 1: authZ — caller JWT matches `initiatedBy` seat.
 *   Step 2: session-state — `status = 'live'`.
 *   Step 3: advisory-lock intent (see "Concurrency doctrine" below).
 *   Step 4: load session + counters + pricing context.
 *   Step 5: derive direction via `classifyModalityDirection` (text<voice<video).
 *   Step 6: rate-limit check — `upgrade_count < 1` / `downgrade_count < 1`.
 *   Step 7: pending-request check — no active pending row for this session.
 *   Step 8: reason validation — required for doctor + patient-downgrade;
 *           length bounds mirror Migration 075's CHECK (5..200 chars).
 *   Step 9: route to one of four handlers.
 *
 * The four handlers are private to this module:
 *
 *   | branch                           | behaviour                                                         |
 *   |----------------------------------|-------------------------------------------------------------------|
 *   | `handlePatientInitiatedUpgrade`  | → pending_doctor_approval (90s). History commit deferred.         |
 *   | `handlePatientInitiatedDowngrade`| → immediate no_refund_downgrade commit.                           |
 *   | `handleDoctorInitiatedUpgrade`   | → pending_patient_consent (60s). Free on consent.                 |
 *   | `handleDoctorInitiatedDowngrade` | → immediate auto_refund_downgrade commit + Task 49 refund enqueue.|
 *
 * Plus three second-round handlers called by the HTTP routes:
 *
 *   - `handleDoctorApprovalOfPatientUpgrade(approvalRequestId, 'paid' | 'free' | 'decline')`
 *   - `handlePatientConsentForDoctorUpgrade(consentRequestId, 'allow' | 'decline')`
 *   - `handleModalityChangePaymentCaptured(razorpayOrderId, razorpayPaymentId)`
 *
 * **Concurrency doctrine — simplified from the task spec.**
 *
 *   The task spec calls for `pg_advisory_xact_lock(hashtext('modality:' ||
 *   sessionId))` + `SELECT FOR UPDATE` + CHECK constraint (three layers).
 *   Supabase's JS client cannot open user-managed transactions from node;
 *   advisory locks + row-level `FOR UPDATE` require a Postgres RPC. v1
 *   compresses the three layers into:
 *
 *     1. Atomic counter UPDATE with predicate `upgrade_count = 0` (or
 *        `downgrade_count = 0`). Supabase's `.eq('upgrade_count', 0)`
 *        on the update is effectively `UPDATE … WHERE upgrade_count = 0`
 *        — only the first writer's UPDATE returns a row; the second
 *        reads 0 rows and the state machine raises `provider_failure`.
 *     2. Migration 075's `consultation_sessions_upgrade_count_max_check`
 *        CHECK guarantees the DB catches a bypass at the constraint layer
 *        (belt-and-suspenders).
 *     3. Pending-request guard `response IS NULL` on
 *        `modality_change_pending_requests` atomic UPDATE closes the
 *        approve-race window.
 *
 *   A follow-up task can add a `public.call_pg_advisory_xact_lock()`
 *   RPC + wrap the commit in an explicit transaction to close the
 *   tiny window between "history INSERT succeeded" and "counter UPDATE
 *   returned 0 rows" (which would orphan the history row without
 *   bumping the counter). Filed in `capture/inbox.md` for Task 47.1.
 *
 * **Realtime fan-out.** None custom. Clients subscribe to Postgres-
 * changes on `modality_change_pending_requests` (INSERT / UPDATE) +
 * `consultation_modality_history` (INSERT) filtered by `session_id`
 * — mirrors Plan 08 Task 41's RLS-channel pattern. The state machine
 * writes via service role; Supabase publishes the row change; the
 * frontend modals react. Documented deviation from the task spec's
 * custom-broadcast prescription (Notes below).
 *
 * **emitSystemMessage integration.** This service calls
 * `emitSystemMessage({ event: 'modality_switched', ... })` for every
 * successful commit. Task 53 extends the copy + meta shape; v1 ships
 * the event tag + a short banner so the chat surfaces the transition
 * even before Task 53 lands.
 *
 * @see backend/migrations/076_modality_change_pending_requests.sql
 * @see backend/src/types/modality-change.ts
 * @see docs/Development/Daily-plans/April 2026/19-04-2026/Tasks/task-47-request-modality-change-state-machine.md
 * @see COMPLIANCE.md - No PHI in logs
 */

import { randomUUID } from 'crypto';

import { getSupabaseAdminClient } from '../config/database';
import { logger } from '../config/logger';
import { InternalError } from '../utils/errors';

import {
  classifyModalityDirection,
  type ModalityBillingAction,
  type ModalityHistoryResponse,
  type ModalityHistoryTimelineEntry,
} from '../types/modality-history';
import type { Modality, SessionRecord } from '../types/consultation-session';
import type {
  DoctorApprovalInput,
  InsertModalityChangePendingRow,
  ModalityChangeActivePending,
  ModalityChangeApplied,
  ModalityChangePendingDoctorApproval,
  ModalityChangePendingPatientConsent,
  ModalityChangePendingRow,
  ModalityChangeReject,
  ModalityChangeRequest,
  ModalityChangeResult,
  ModalityChangeState,
  ModalityInitiator,
  ModalityPaymentCapturedInput,
  ModalityPendingKind,
  ModalityRejectReason,
  PatientConsentInput,
} from '../types/modality-change';

import {
  insertModalityHistoryRow,
  narrowHistoryEntry,
} from './modality-history-queries';
import {
  fetchActivePendingForSession,
  fetchPendingById,
  fetchPendingByRazorpayOrderId,
  insertModalityPendingRow,
  resolvePendingRequest,
  stampRazorpayOrderOnPending,
} from './modality-pending-requests-queries';
import {
  executeModalityTransition,
  type ExecuteTransitionResult,
} from './modality-transition-executor';
import { getModalityBillingService } from './modality-billing-service';
import { emitSystemMessage } from './consultation-message-service';

// ============================================================================
// Constants
// ============================================================================

/** Patient-upgrade doctor-approval window (Decision 11 LOCKED). */
export const PATIENT_UPGRADE_EXPIRY_SECONDS = 90;
/** Doctor-upgrade patient-consent window. Matches Plan 08 Task 41's 60s. */
export const DOCTOR_UPGRADE_EXPIRY_SECONDS = 60;
/** Reason-length bounds. Mirrors Migration 075's `char_length BETWEEN 5 AND 200`. */
export const REASON_MIN_CHARS = 5;
export const REASON_MAX_CHARS = 200;

// ============================================================================
// Public API: requestModalityChange — the single entry point.
// ============================================================================

/**
 * Single entry point for the four-branch 2×2 matrix. Runs the nine-
 * step guard chain, then dispatches to the matching private handler.
 * Never throws — every failure returns a typed `rejected` result so
 * the HTTP envelope shape stays stable across branches.
 */
export async function requestModalityChange(
  input: ModalityChangeRequest,
): Promise<ModalityChangeResult> {
  const correlationId = input.correlationId?.trim() || randomUUID();
  const log = logger.child({
    correlationId,
    sessionId: input.sessionId,
    initiatedBy: input.initiatedBy,
    requestedModality: input.requestedModality,
    handler: 'requestModalityChange',
  });

  log.info('requestModalityChange: received');

  // Step 1: authZ — caller seat matches initiatedBy.
  if (input.requestingRole !== input.initiatedBy) {
    log.warn({ requestingRole: input.requestingRole }, 'requestModalityChange: forbidden (role mismatch)');
    return rejection('forbidden', correlationId, 'requestingRole !== initiatedBy');
  }

  const admin = getSupabaseAdminClient();
  if (!admin) {
    log.error('requestModalityChange: admin client unavailable');
    return rejection('internal_error', correlationId, 'admin_client_unavailable');
  }

  // Step 4: load session + counters. Step 2 (session state) runs
  // inline once we have the row.
  const session = await loadSessionWithCounters(admin, input.sessionId);
  if (!session) {
    log.warn('requestModalityChange: session not found');
    return rejection('internal_error', correlationId, 'session_not_found');
  }

  // Step 1 (continued): caller is a participant of the session
  // matching the seat.
  const seatAllowed =
    (input.initiatedBy === 'doctor' && session.doctorId === input.requestingUserId) ||
    (input.initiatedBy === 'patient' && session.patientId === input.requestingUserId);
  if (!seatAllowed) {
    log.warn({ requestingUserId: input.requestingUserId }, 'requestModalityChange: forbidden (seat mismatch)');
    return rejection('forbidden', correlationId, 'seat_mismatch');
  }

  // Step 2: session must be live.
  if (session.status !== 'live') {
    log.info({ status: session.status }, 'requestModalityChange: session not active');
    return rejection('session_not_active', correlationId, `status=${session.status}`);
  }

  // Step 5: derive direction.
  const direction = classifyModalityDirection(session.currentModality, input.requestedModality);
  if (direction === 'noop') {
    log.info('requestModalityChange: no-op transition');
    return rejection('no_op_transition', correlationId, 'to === current');
  }

  // Step 6: rate-limit check (read-side). The atomic UPDATE in the
  // commit branches enforces at-most-once; this read-side check
  // fails fast with a friendly error before spinning up any side effects.
  if (direction === 'upgrade' && session.upgradeCount >= 1) {
    log.info('requestModalityChange: max upgrades reached');
    return rejection('max_upgrades_reached', correlationId, `upgrade_count=${session.upgradeCount}`);
  }
  if (direction === 'downgrade' && session.downgradeCount >= 1) {
    log.info('requestModalityChange: max downgrades reached');
    return rejection('max_downgrades_reached', correlationId, `downgrade_count=${session.downgradeCount}`);
  }

  // Step 7: pending-request check.
  const activePending = await fetchActivePendingForSession(admin, session.id);
  if (activePending) {
    log.info({ activePendingId: activePending.id }, 'requestModalityChange: pending request exists');
    return rejection('pending_request_exists', correlationId, `pendingId=${activePending.id}`);
  }

  // Step 8: reason validation.
  const reasonRequired =
    input.initiatedBy === 'doctor' ||
    (input.initiatedBy === 'patient' && direction === 'downgrade');
  const reasonCheck = validateReason(input.reason, reasonRequired);
  if (!reasonCheck.ok) {
    log.info({ why: reasonCheck.reason }, 'requestModalityChange: reason validation failed');
    return rejection(reasonCheck.reason, correlationId, reasonCheck.detail);
  }

  // Step 9: route to the matching handler.
  if (input.initiatedBy === 'patient' && direction === 'upgrade') {
    return handlePatientInitiatedUpgrade(input, session, correlationId);
  }
  if (input.initiatedBy === 'patient' && direction === 'downgrade') {
    return handlePatientInitiatedDowngrade(input, session, correlationId);
  }
  if (input.initiatedBy === 'doctor' && direction === 'upgrade') {
    return handleDoctorInitiatedUpgrade(input, session, correlationId);
  }
  // doctor + downgrade
  return handleDoctorInitiatedDowngrade(input, session, correlationId);
}

// ============================================================================
// Private: handlePatientInitiatedUpgrade — pending_doctor_approval.
// ============================================================================

async function handlePatientInitiatedUpgrade(
  input: ModalityChangeRequest,
  session: LoadedSession,
  correlationId: string,
): Promise<ModalityChangePendingDoctorApproval | ModalityChangeReject> {
  const admin = getSupabaseAdminClient();
  if (!admin) return rejection('internal_error', correlationId, 'admin_client_unavailable');

  const expiresAt = new Date(Date.now() + PATIENT_UPGRADE_EXPIRY_SECONDS * 1000).toISOString();
  const payload: InsertModalityChangePendingRow = {
    sessionId: session.id,
    initiatedBy: 'patient',
    requestedModality: input.requestedModality,
    reason: input.reason ?? null,
    presetReasonCode: input.presetReasonCode ?? null,
    expiresAt,
    correlationId,
  };

  try {
    const row = await insertModalityPendingRow(admin, payload);
    logger.info(
      { correlationId, sessionId: session.id, approvalRequestId: row.id, expiresAt },
      'handlePatientInitiatedUpgrade: pending row inserted (doctor approval window open)',
    );
    // Realtime fan-out: the INSERT on modality_change_pending_requests
    // publishes via Postgres-changes (RLS participant-scoped SELECT
    // policy on Migration 076). Doctor UI's subscription fires the
    // approval modal. No explicit publish needed.
    return {
      kind: 'pending_doctor_approval',
      approvalRequestId: row.id,
      approvalExpiresAt: row.expiresAt,
      correlationId,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(
      { correlationId, sessionId: session.id, error: message },
      'handlePatientInitiatedUpgrade: insert failed',
    );
    return rejection('internal_error', correlationId, message);
  }
}

// ============================================================================
// Private: handlePatientInitiatedDowngrade — immediate commit, no refund.
// ============================================================================

async function handlePatientInitiatedDowngrade(
  input: ModalityChangeRequest,
  session: LoadedSession,
  correlationId: string,
): Promise<ModalityChangeApplied | ModalityChangeReject> {
  return executeAndCommitTransition({
    session,
    toModality: input.requestedModality,
    initiatedBy: 'patient',
    billingAction: 'no_refund_downgrade',
    reason: input.reason ?? null,
    presetReasonCode: input.presetReasonCode ?? null,
    amountPaise: null,
    razorpayPaymentId: null,
    direction: 'downgrade',
    correlationId,
  });
}

// ============================================================================
// Private: handleDoctorInitiatedUpgrade — pending_patient_consent.
// ============================================================================

async function handleDoctorInitiatedUpgrade(
  input: ModalityChangeRequest,
  session: LoadedSession,
  correlationId: string,
): Promise<ModalityChangePendingPatientConsent | ModalityChangeReject> {
  const admin = getSupabaseAdminClient();
  if (!admin) return rejection('internal_error', correlationId, 'admin_client_unavailable');

  const expiresAt = new Date(Date.now() + DOCTOR_UPGRADE_EXPIRY_SECONDS * 1000).toISOString();
  const payload: InsertModalityChangePendingRow = {
    sessionId: session.id,
    initiatedBy: 'doctor',
    requestedModality: input.requestedModality,
    reason: input.reason ?? null,
    presetReasonCode: input.presetReasonCode ?? null,
    expiresAt,
    correlationId,
  };

  try {
    const row = await insertModalityPendingRow(admin, payload);
    logger.info(
      { correlationId, sessionId: session.id, consentRequestId: row.id, expiresAt },
      'handleDoctorInitiatedUpgrade: pending row inserted (patient consent window open)',
    );
    return {
      kind: 'pending_patient_consent',
      consentRequestId: row.id,
      consentExpiresAt: row.expiresAt,
      correlationId,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(
      { correlationId, sessionId: session.id, error: message },
      'handleDoctorInitiatedUpgrade: insert failed',
    );
    return rejection('internal_error', correlationId, message);
  }
}

// ============================================================================
// Private: handleDoctorInitiatedDowngrade — immediate commit + auto-refund.
// ============================================================================

async function handleDoctorInitiatedDowngrade(
  input: ModalityChangeRequest,
  session: LoadedSession,
  correlationId: string,
): Promise<ModalityChangeApplied | ModalityChangeReject> {
  // Compute the refund delta up-front. If billing is not shipped yet
  // (Task 49 stub), surface internal_error and bail — better than
  // partially committing a transition with no refund lined up.
  const billing = getModalityBillingService();
  let amountPaise: number;
  try {
    const delta = await billing.computeUpgradeDelta({
      sessionId: session.id,
      fromModality: session.currentModality,
      toModality: input.requestedModality,
      correlationId,
    });
    amountPaise = delta.amountPaise;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(
      { correlationId, sessionId: session.id, error: message },
      'handleDoctorInitiatedDowngrade: computeUpgradeDelta failed',
    );
    return rejection('internal_error', correlationId, `computeUpgradeDelta: ${message}`);
  }

  if (amountPaise <= 0) {
    // No delta to refund — downgrade to a same-priced tier. Record as
    // no_refund_downgrade so the DB shape-CHECK accepts it.
    return executeAndCommitTransition({
      session,
      toModality: input.requestedModality,
      initiatedBy: 'doctor',
      billingAction: 'no_refund_downgrade',
      reason: input.reason ?? null,
      presetReasonCode: input.presetReasonCode ?? null,
      amountPaise: null,
      razorpayPaymentId: null,
      direction: 'downgrade',
      correlationId,
    });
  }

  const result = await executeAndCommitTransition({
    session,
    toModality: input.requestedModality,
    initiatedBy: 'doctor',
    billingAction: 'auto_refund_downgrade',
    reason: input.reason ?? null,
    presetReasonCode: input.presetReasonCode ?? null,
    amountPaise,
    razorpayPaymentId: null,
    direction: 'downgrade',
    correlationId,
  });

  if (result.kind === 'applied') {
    // Enqueue refund best-effort. Synchronous path stamps refund id
    // inline; async path leaves razorpay_refund_id NULL for the
    // Task 49 retry worker. Errors swallowed — history row is already
    // committed; the worker picks it up.
    try {
      await billing.autoRefundDowngrade({
        historyRowId: result.historyRowId,
        originalRazorpayPaymentId: '', // Task 49 reads the original from `appointments.razorpay_payment_id`.
        amountPaise,
        reason: 'doctor_downgrade',
        correlationId,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn(
        { correlationId, sessionId: session.id, historyRowId: result.historyRowId, error: message },
        'handleDoctorInitiatedDowngrade: autoRefundDowngrade failed inline; worker will retry',
      );
    }
  }
  return result;
}

// ============================================================================
// Public second-round API: doctor approval of a patient-initiated upgrade.
// ============================================================================

export async function handleDoctorApprovalOfPatientUpgrade(
  input: DoctorApprovalInput,
): Promise<ModalityChangeResult> {
  const correlationId = input.correlationId?.trim() || randomUUID();
  const log = logger.child({
    correlationId,
    approvalRequestId: input.approvalRequestId,
    decision: input.decision,
    handler: 'handleDoctorApprovalOfPatientUpgrade',
  });
  log.info('handleDoctorApprovalOfPatientUpgrade: received');

  const admin = getSupabaseAdminClient();
  if (!admin) return rejection('internal_error', correlationId, 'admin_client_unavailable');

  const pending = await fetchPendingById(admin, input.approvalRequestId);
  if (!pending) {
    log.info('handleDoctorApprovalOfPatientUpgrade: approval row not found');
    return rejection('internal_error', correlationId, 'approval_request_not_found');
  }
  if (pending.response !== null) {
    log.info({ existingResponse: pending.response }, 'handleDoctorApprovalOfPatientUpgrade: already resolved');
    return rejection('internal_error', correlationId, `already_resolved:${pending.response}`);
  }
  if (pending.initiatedBy !== 'patient') {
    log.warn('handleDoctorApprovalOfPatientUpgrade: pending row not a patient-initiated request');
    return rejection('forbidden', correlationId, 'wrong_initiator_for_approval');
  }

  const session = await loadSessionWithCounters(admin, pending.sessionId);
  if (!session) return rejection('internal_error', correlationId, 'session_not_found');
  if (session.doctorId !== input.requestingUserId) {
    log.warn('handleDoctorApprovalOfPatientUpgrade: caller is not the doctor of this session');
    return rejection('forbidden', correlationId, 'caller_not_doctor');
  }

  if (input.decision === 'decline') {
    const reasonCheck = validateReason(input.declineReason, false);
    if (!reasonCheck.ok) return rejection(reasonCheck.reason, correlationId, reasonCheck.detail);
    const resolved = await resolvePendingRequest(admin, {
      id: pending.id,
      response: 'declined',
      respondedAt: new Date().toISOString(),
    });
    if (!resolved) {
      return rejection('internal_error', correlationId, 'resolve_race_lost');
    }
    log.info('handleDoctorApprovalOfPatientUpgrade: declined — no history row written');
    return {
      kind: 'rejected',
      reason: 'forbidden',
      detail: 'doctor_declined',
      correlationId,
    };
  }

  if (input.decision === 'free') {
    const resolved = await resolvePendingRequest(admin, {
      id: pending.id,
      response: 'approved_free',
      respondedAt: new Date().toISOString(),
    });
    if (!resolved) return rejection('internal_error', correlationId, 'resolve_race_lost');
    return executeAndCommitTransition({
      session,
      toModality: pending.requestedModality,
      initiatedBy: 'patient',
      billingAction: 'free_upgrade',
      reason: null,
      presetReasonCode: pending.presetReasonCode,
      amountPaise: null,
      razorpayPaymentId: null,
      direction: 'upgrade',
      correlationId,
    });
  }

  // decision === 'paid'
  if (!input.amountPaise || input.amountPaise <= 0) {
    return rejection('reason_out_of_bounds', correlationId, 'paid requires amountPaise > 0');
  }
  const billing = getModalityBillingService();
  // Resolve pending → 'approved_paid' first so the webhook reverse-lookup
  // finds a terminal row (simplifies the webhook's guard chain). Stamp
  // the Razorpay order id once the order is created.
  const resolved = await resolvePendingRequest(admin, {
    id: pending.id,
    response: 'approved_paid',
    respondedAt: new Date().toISOString(),
  });
  if (!resolved) return rejection('internal_error', correlationId, 'resolve_race_lost');
  try {
    const capture = await billing.captureUpgradePayment({
      sessionId: session.id,
      pendingRequestId: pending.id,
      fromModality: session.currentModality,
      toModality: pending.requestedModality,
      amountPaise: input.amountPaise,
      correlationId,
    });
    await stampRazorpayOrderOnPending(admin, pending.id, capture.razorpayOrderId);
    log.info({ razorpayOrderId: capture.razorpayOrderId }, 'handleDoctorApprovalOfPatientUpgrade: paid flow — order created, awaiting webhook');
    return {
      kind: 'pending_doctor_approval',
      approvalRequestId: pending.id,
      approvalExpiresAt: pending.expiresAt,
      correlationId,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error({ error: message }, 'handleDoctorApprovalOfPatientUpgrade: captureUpgradePayment failed');
    return rejection('internal_error', correlationId, `captureUpgradePayment: ${message}`);
  }
}

// ============================================================================
// Public second-round API: patient consent on a doctor-initiated upgrade.
// ============================================================================

export async function handlePatientConsentForDoctorUpgrade(
  input: PatientConsentInput,
): Promise<ModalityChangeResult> {
  const correlationId = input.correlationId?.trim() || randomUUID();
  const log = logger.child({
    correlationId,
    consentRequestId: input.consentRequestId,
    decision: input.decision,
    handler: 'handlePatientConsentForDoctorUpgrade',
  });
  log.info('handlePatientConsentForDoctorUpgrade: received');

  const admin = getSupabaseAdminClient();
  if (!admin) return rejection('internal_error', correlationId, 'admin_client_unavailable');

  const pending = await fetchPendingById(admin, input.consentRequestId);
  if (!pending) return rejection('internal_error', correlationId, 'consent_request_not_found');
  if (pending.response !== null) {
    return rejection('internal_error', correlationId, `already_resolved:${pending.response}`);
  }
  if (pending.initiatedBy !== 'doctor') {
    return rejection('forbidden', correlationId, 'wrong_initiator_for_consent');
  }

  const session = await loadSessionWithCounters(admin, pending.sessionId);
  if (!session) return rejection('internal_error', correlationId, 'session_not_found');
  if (session.patientId !== input.requestingUserId) {
    return rejection('forbidden', correlationId, 'caller_not_patient');
  }

  if (input.decision === 'decline') {
    const reasonCheck = validateReason(input.declineReason, false);
    if (!reasonCheck.ok) return rejection(reasonCheck.reason, correlationId, reasonCheck.detail);
    const resolved = await resolvePendingRequest(admin, {
      id: pending.id,
      response: 'declined',
      respondedAt: new Date().toISOString(),
    });
    if (!resolved) return rejection('internal_error', correlationId, 'resolve_race_lost');
    log.info('handlePatientConsentForDoctorUpgrade: declined — no history row written');
    return {
      kind: 'rejected',
      reason: 'forbidden',
      detail: 'patient_declined',
      correlationId,
    };
  }

  // decision === 'allow' — always-free path for doctor-initiated upgrade.
  const resolved = await resolvePendingRequest(admin, {
    id: pending.id,
    response: 'allowed',
    respondedAt: new Date().toISOString(),
  });
  if (!resolved) return rejection('internal_error', correlationId, 'resolve_race_lost');
  return executeAndCommitTransition({
    session,
    toModality: pending.requestedModality,
    initiatedBy: 'doctor',
    billingAction: 'free_upgrade',
    reason: pending.reason,
    presetReasonCode: pending.presetReasonCode,
    amountPaise: null,
    razorpayPaymentId: null,
    direction: 'upgrade',
    correlationId,
  });
}

// ============================================================================
// Public third-round API: Razorpay `payment.captured` webhook dispatch.
// ============================================================================

/**
 * Commit branch for the patient-paid-upgrade flow. Called by the async
 * Razorpay webhook dispatcher (in `webhook-worker.ts`, filed for Task
 * 49's integration) after signature verification + idempotency check.
 *
 * Idempotency: guarded by the pending-row lifecycle and the history
 * table's `razorpay_payment_id` uniqueness check. A duplicate webhook
 * fire finds a pending row whose pending billing context is already
 * consumed (counter bumped, history inserted) — the guarded UPDATE on
 * `consultation_sessions.upgrade_count = 0` returns 0 rows and the
 * handler returns a `applied` result without duplicating side effects.
 */
export async function handleModalityChangePaymentCaptured(
  input: ModalityPaymentCapturedInput,
): Promise<ModalityChangeResult> {
  const correlationId = input.correlationId || randomUUID();
  const log = logger.child({
    correlationId,
    razorpayOrderId: input.razorpayOrderId,
    razorpayPaymentId: input.razorpayPaymentId,
    handler: 'handleModalityChangePaymentCaptured',
  });
  log.info('handleModalityChangePaymentCaptured: received');

  const admin = getSupabaseAdminClient();
  if (!admin) return rejection('internal_error', correlationId, 'admin_client_unavailable');

  const pending = await fetchPendingByRazorpayOrderId(admin, input.razorpayOrderId);
  if (!pending) {
    log.warn('handleModalityChangePaymentCaptured: no pending row matches razorpay_order_id — silent skip');
    return rejection('internal_error', correlationId, 'no_pending_for_order');
  }
  if (pending.response !== 'approved_paid') {
    log.info(
      { existingResponse: pending.response },
      'handleModalityChangePaymentCaptured: pending row not in approved_paid state — skip',
    );
    return rejection('internal_error', correlationId, `pending_not_approved_paid:${pending.response}`);
  }
  if (pending.amountPaise == null) {
    return rejection('internal_error', correlationId, 'pending_missing_amount');
  }

  // Idempotency: duplicate webhook → history row already exists for
  // this razorpay_payment_id. The DB-level shape CHECK makes the
  // INSERT safe-to-retry, but we short-circuit to avoid a wasted
  // executor call.
  const existing = await admin
    .from('consultation_modality_history')
    .select('id, billing_action')
    .eq('razorpay_payment_id', input.razorpayPaymentId)
    .maybeSingle();
  if (existing.error) {
    log.error({ error: existing.error.message }, 'handleModalityChangePaymentCaptured: idempotency lookup failed');
    return rejection('internal_error', correlationId, existing.error.message);
  }
  if (existing.data) {
    log.info({ historyRowId: existing.data.id }, 'handleModalityChangePaymentCaptured: idempotent skip (history exists)');
    return {
      kind: 'applied',
      historyRowId: existing.data.id as string,
      toModality: pending.requestedModality,
      billingAction: 'paid_upgrade',
      correlationId,
    };
  }

  const session = await loadSessionWithCounters(admin, pending.sessionId);
  if (!session) return rejection('internal_error', correlationId, 'session_not_found');

  const direction = classifyModalityDirection(session.currentModality, pending.requestedModality);
  if (direction !== 'upgrade') {
    log.warn({ direction }, 'handleModalityChangePaymentCaptured: current modality has drifted — not an upgrade anymore');
    // Compensating refund — the patient paid but we can't apply.
    await fireCompensatingRefund(pending, input.razorpayPaymentId, correlationId);
    return {
      kind: 'rejected',
      reason: 'provider_failure',
      detail: 'modality_drift_post_capture',
      correlationId,
      refundInitiated: true,
    };
  }

  const commitResult = await executeAndCommitTransition({
    session,
    toModality: pending.requestedModality,
    initiatedBy: 'patient',
    billingAction: 'paid_upgrade',
    reason: null,
    presetReasonCode: pending.presetReasonCode,
    amountPaise: pending.amountPaise,
    razorpayPaymentId: input.razorpayPaymentId,
    direction: 'upgrade',
    correlationId,
  });

  if (commitResult.kind === 'rejected' && commitResult.reason === 'provider_failure') {
    // Executor failed AFTER capture — refund.
    log.error('handleModalityChangePaymentCaptured: executor failed after capture — firing compensating refund');
    await fireCompensatingRefund(pending, input.razorpayPaymentId, correlationId);
    return { ...commitResult, refundInitiated: true };
  }

  return commitResult;
}

async function fireCompensatingRefund(
  pending: ModalityChangePendingRow,
  razorpayPaymentId: string,
  correlationId: string,
): Promise<void> {
  const billing = getModalityBillingService();
  try {
    await billing.autoRefundDowngrade({
      historyRowId: null,
      pendingRequestId: pending.id,
      originalRazorpayPaymentId: razorpayPaymentId,
      amountPaise: pending.amountPaise ?? 0,
      reason: 'provider_failure',
      correlationId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(
      { correlationId, pendingId: pending.id, error: message },
      'fireCompensatingRefund: failed — Task 49 retry worker will not reattempt automatically. Ops alert.',
    );
  }
}

// ============================================================================
// Public read: GET /modality-change/state.
// ============================================================================

/**
 * Derived state read for the Task 54 launcher + modal re-hydration on
 * page refresh. Returns the session's current modality + counters +
 * the active pending row if any.
 *
 * AuthZ is enforced by the caller (the HTTP controller checks JWT
 * before dispatching). This service trusts the caller.
 */
export async function getModalityChangeState(
  sessionId: string,
): Promise<ModalityChangeState | null> {
  const admin = getSupabaseAdminClient();
  if (!admin) return null;

  const session = await loadSessionWithCounters(admin, sessionId);
  if (!session) return null;

  const pending = await fetchActivePendingForSession(admin, sessionId);

  return {
    currentModality: session.currentModality,
    upgradeCount: session.upgradeCount,
    downgradeCount: session.downgradeCount,
    activePendingRequest: pending ? projectActivePending(pending) : null,
  };
}

// ============================================================================
// Public read: GET /modality-change/history (Plan 09 · Task 55).
// ============================================================================

/**
 * Duplicated here (not imported from the worker module) to keep the
 * read path free of worker-lifecycle side effects. Any divergence
 * between this literal and `modality-refund-retry-worker.ts`'s
 * `REFUND_RETRY_PERMANENT_SENTINEL` would be caught by the integration
 * tests that exercise both paths against the same row.
 */
const REFUND_RETRY_PERMANENT_SENTINEL = 99;

/**
 * Timeline-read error taxonomy — narrow enough for the controller to
 * map to HTTP status codes without inspecting error messages.
 *
 *   - `session_not_found`  → 404.
 *   - `forbidden`          → 403 (requester is not a session participant).
 *   - `internal_error`     → 500.
 */
export type ModalityHistoryReadError =
  | 'session_not_found'
  | 'forbidden'
  | 'internal_error';

export interface ModalityHistoryReadResult {
  ok: true;
  data: ModalityHistoryResponse;
}

export interface ModalityHistoryReadFailure {
  ok: false;
  error: ModalityHistoryReadError;
  detail?: string;
}

/**
 * Read the modality timeline for a completed (or in-flight) consult.
 * Powers Task 55's `<ModalityHistoryTimeline>` component on the
 * appointment detail page.
 *
 * AuthZ: session participants only (doctor seat OR patient seat).
 * Migration 075's `modality_history_select_participants` RLS policy
 * enforces the same invariant at the DB layer; the controller uses
 * the service role, so we re-check here at the application layer for
 * belt-and-suspenders privacy.
 *
 * Ordering: oldest transition first. Matches plan open question #4 +
 * the existing `idx_modality_history_session_time` index; the UI
 * renders synthetic "Started as X" + "Consult ended" anchors around
 * the actual rows.
 */
export async function getModalityHistory(
  sessionId: string,
  requestingUserId: string,
): Promise<ModalityHistoryReadResult | ModalityHistoryReadFailure> {
  const admin = getSupabaseAdminClient();
  if (!admin) return { ok: false, error: 'internal_error', detail: 'admin_client_unavailable' };

  const { data: sessionRow, error: sessionErr } = await admin
    .from('consultation_sessions')
    .select(
      'id, doctor_id, patient_id, modality, current_modality, upgrade_count, downgrade_count, status, actual_started_at, actual_ended_at, created_at',
    )
    .eq('id', sessionId)
    .maybeSingle();

  if (sessionErr) {
    logger.warn(
      { sessionId, error: sessionErr.message },
      'getModalityHistory: session query failed',
    );
    return { ok: false, error: 'internal_error', detail: sessionErr.message };
  }
  if (!sessionRow) {
    return { ok: false, error: 'session_not_found' };
  }

  const row = sessionRow as Record<string, unknown>;
  const doctorId = row.doctor_id as string;
  const patientId = (row.patient_id as string | null) ?? null;
  const seatAllowed =
    requestingUserId === doctorId ||
    (patientId !== null && requestingUserId === patientId);
  if (!seatAllowed) {
    logger.info(
      { sessionId, requestingUserId },
      'getModalityHistory: forbidden (not a participant)',
    );
    return { ok: false, error: 'forbidden' };
  }

  const { data: historyRows, error: historyErr } = await admin
    .from('consultation_modality_history')
    .select(
      'id, from_modality, to_modality, initiated_by, billing_action, amount_paise, razorpay_payment_id, razorpay_refund_id, reason, preset_reason_code, occurred_at, refund_retry_count',
    )
    .eq('session_id', sessionId)
    .order('occurred_at', { ascending: true });

  if (historyErr) {
    logger.warn(
      { sessionId, error: historyErr.message },
      'getModalityHistory: history query failed',
    );
    return { ok: false, error: 'internal_error', detail: historyErr.message };
  }

  const entries: ModalityHistoryTimelineEntry[] = (historyRows ?? []).map((r) => {
    const h = r as Record<string, unknown>;
    const billingAction = h.billing_action as ModalityBillingAction;
    const retryCount = (h.refund_retry_count as number | null) ?? 0;
    const refundFailedPermanent =
      billingAction === 'auto_refund_downgrade' &&
      retryCount >= REFUND_RETRY_PERMANENT_SENTINEL;
    return {
      id: h.id as string,
      fromModality: h.from_modality as ModalityHistoryTimelineEntry['fromModality'],
      toModality: h.to_modality as ModalityHistoryTimelineEntry['toModality'],
      initiatedBy: h.initiated_by as ModalityInitiator,
      billingAction,
      amountPaise: (h.amount_paise as number | null) ?? null,
      razorpayPaymentId: (h.razorpay_payment_id as string | null) ?? null,
      razorpayRefundId: (h.razorpay_refund_id as string | null) ?? null,
      refundFailedPermanent,
      reason: (h.reason as string | null) ?? null,
      presetReasonCode:
        (h.preset_reason_code as ModalityHistoryTimelineEntry['presetReasonCode']) ?? null,
      occurredAt: h.occurred_at as string,
    };
  });

  const startedAt =
    (row.actual_started_at as string | null) ??
    (row.created_at as string | null) ??
    new Date(0).toISOString();

  return {
    ok: true,
    data: {
      session: {
        id: row.id as string,
        initialModality: row.modality as ModalityHistoryTimelineEntry['fromModality'],
        currentModality: row.current_modality as ModalityHistoryTimelineEntry['fromModality'],
        upgradeCount: (row.upgrade_count as number) ?? 0,
        downgradeCount: (row.downgrade_count as number) ?? 0,
        startedAt,
        endedAt: (row.actual_ended_at as string | null) ?? null,
        status: row.status as string,
      },
      entries,
    },
  };
}

function projectActivePending(row: ModalityChangePendingRow): ModalityChangeActivePending {
  const kind: ModalityPendingKind =
    row.initiatedBy === 'patient' ? 'patient_upgrade' : 'doctor_upgrade';
  return {
    id: row.id,
    initiatedBy: row.initiatedBy,
    requestedModality: row.requestedModality,
    kind,
    expiresAt: row.expiresAt,
    requestedAt: row.requestedAt,
  };
}

// ============================================================================
// Internal: executeAndCommitTransition — the shared commit branch.
// ============================================================================

interface CommitTransitionInput {
  session: LoadedSession;
  toModality: Modality;
  initiatedBy: ModalityInitiator;
  billingAction: ModalityBillingAction;
  reason: string | null;
  presetReasonCode: ModalityChangeRequest['presetReasonCode'] | null;
  amountPaise: number | null;
  razorpayPaymentId: string | null;
  direction: 'upgrade' | 'downgrade';
  correlationId: string;
}

/**
 * The shared commit branch. Runs the executor, inserts the history
 * row, atomically bumps the counter + updates `current_modality`, and
 * emits the system message. Every "applied" branch funnels through
 * here so the sequencing + rollback rules live in exactly one place.
 *
 * Rollback doctrine:
 *   · Executor throws → no history row, no counter bump. Return
 *     provider_failure. Caller's compensating-refund branch (paid-
 *     upgrade webhook only) fires if relevant.
 *   · History INSERT fails → no counter bump. Return internal_error.
 *   · Counter UPDATE returns 0 rows (rate-limit race) → we have an
 *     orphan history row. Log loudly + return provider_failure;
 *     the follow-up observability task (inbox #47.1) surfaces this
 *     for manual ops review.
 *   · System message emit fails → log only (best-effort). The chat
 *     can recover via a GET /modality-change/state refresh.
 */
async function executeAndCommitTransition(
  input: CommitTransitionInput,
): Promise<ModalityChangeApplied | ModalityChangeReject> {
  const admin = getSupabaseAdminClient();
  if (!admin) return rejection('internal_error', input.correlationId, 'admin_client_unavailable');

  // 1. Executor first. Throwing here = no side effects yet.
  let executorResult: ExecuteTransitionResult;
  try {
    executorResult = await executeModalityTransition({
      session: {
        id: input.session.id,
        appointmentId: input.session.appointmentId,
        doctorId: input.session.doctorId,
        patientId: input.session.patientId,
        modality: input.session.currentModality,
        status: 'live',
        provider: input.session.provider,
        providerSessionId: input.session.providerSessionId ?? undefined,
        scheduledStartAt: new Date(),
        expectedEndAt: new Date(),
      },
      toModality: input.toModality,
      correlationId: input.correlationId,
      reason: input.reason ?? undefined,
      initiatedBy: input.initiatedBy,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(
      { correlationId: input.correlationId, sessionId: input.session.id, error: message },
      'executeAndCommitTransition: executor failed',
    );
    return rejection('provider_failure', input.correlationId, message);
  }

  // 2. History INSERT.
  let historyRowId: string;
  try {
    const historyInput = buildHistoryInsert(input);
    const historyRow = await insertModalityHistoryRow(admin, historyInput);
    // Narrow to assert shape CHECK invariants at the app boundary.
    narrowHistoryEntry(historyRow);
    historyRowId = historyRow.id;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(
      { correlationId: input.correlationId, sessionId: input.session.id, error: message },
      'executeAndCommitTransition: history INSERT failed',
    );
    return rejection('internal_error', input.correlationId, `history_insert: ${message}`);
  }

  // 3. Counter + current_modality UPDATE. Guarded by the counter = 0
  // predicate so a concurrent second-writer's UPDATE returns 0 rows.
  //
  // Task 48 widened the executor contract so:
  //   · `newProviderSessionId === null` signals "clear the DB column"
  //     (voice/video → text branches — the Twilio room is gone).
  //   · `newProvider` (optional) is set on every cross-provider branch
  //     (all four text-touching transitions). When present we also
  //     stamp `provider` so `consultation_sessions` reflects the new
  //     service-of-record. Undefined for voice↔video (same Twilio
  //     room, same provider string).
  const counterCol = input.direction === 'upgrade' ? 'upgrade_count' : 'downgrade_count';
  const updateRow: Record<string, unknown> = {
    current_modality: input.toModality,
    [counterCol]: 1,
    provider_session_id: executorResult.newProviderSessionId,
  };
  if (executorResult.newProvider !== undefined) {
    updateRow.provider = executorResult.newProvider;
  }
  if (executorResult.recordingArtifactRef !== undefined) {
    updateRow.recording_artifact_ref = executorResult.recordingArtifactRef;
  }
  const { data: updated, error: updErr } = await admin
    .from('consultation_sessions')
    .update(updateRow)
    .eq('id', input.session.id)
    .eq(counterCol, 0)
    .select('id')
    .maybeSingle();

  if (updErr) {
    logger.error(
      { correlationId: input.correlationId, sessionId: input.session.id, error: updErr.message, historyRowId },
      'executeAndCommitTransition: session UPDATE failed AFTER history INSERT — orphan history row',
    );
    return rejection('internal_error', input.correlationId, `session_update: ${updErr.message}`);
  }
  if (!updated) {
    logger.error(
      { correlationId: input.correlationId, sessionId: input.session.id, historyRowId, counterCol },
      'executeAndCommitTransition: counter UPDATE raced (concurrent second writer) — history row orphaned',
    );
    return rejection('provider_failure', input.correlationId, 'counter_update_raced');
  }

  // 4. System message emit (best-effort).
  //
  // Plan 09 · Task 53 — rich copy per billing action × initiator, with
  // amount + reason embedded inline. Copy is neutral 3rd-person so a
  // single persisted row works for both doctor + patient viewers; the
  // structured `meta` payload carries the same fields verbatim so a
  // future Plan 06 Task 38 frontend renderer can swap to per-viewer
  // copy additively (the row is already in the DB; only the rendering
  // contract changes).
  //
  // Dedup key uses `historyRowId` (spec §"Dedup key") — guaranteed
  // unique per transition, so the `(sessionId, event, correlationId)`
  // triple cannot collide.
  try {
    await emitSystemMessage({
      sessionId: input.session.id,
      event: 'modality_switched',
      body: buildModalitySwitchedBanner({
        from: input.session.currentModality,
        to: input.toModality,
        initiatedBy: input.initiatedBy,
        billingAction: input.billingAction,
        reason: input.reason,
        amountPaise: input.amountPaise,
      }),
      correlationId: `modality_switched:${historyRowId}`,
      meta: {
        historyRowId,
        from: input.session.currentModality,
        to: input.toModality,
        initiatedBy: input.initiatedBy,
        billingAction: input.billingAction,
        reason: input.reason,
        amountPaise: input.amountPaise,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(
      { correlationId: input.correlationId, sessionId: input.session.id, error: message },
      'executeAndCommitTransition: emitSystemMessage failed (best-effort; banner dropped)',
    );
  }

  logger.info(
    {
      correlationId: input.correlationId,
      sessionId: input.session.id,
      historyRowId,
      from: input.session.currentModality,
      to: input.toModality,
      billingAction: input.billingAction,
    },
    'executeAndCommitTransition: applied',
  );

  return {
    kind: 'applied',
    historyRowId,
    toModality: input.toModality,
    billingAction: input.billingAction,
    correlationId: input.correlationId,
  };
}

/**
 * Discriminated-union builder for the history insert payload. The
 * return type mirrors Task 46's `InsertModalityHistoryRow` — the
 * `billingAction` tag selects the shape (optional vs required
 * `amountPaise` + `razorpayPaymentId`). Throws `InternalError` if the
 * caller asks for a `paid_upgrade` without the payment context or an
 * `auto_refund_downgrade` without the amount; both would be rejected
 * downstream by the DB CHECK but failing here short-circuits the
 * orphan-history-row window.
 */
function buildHistoryInsert(
  input: CommitTransitionInput,
): Parameters<typeof insertModalityHistoryRow>[1] {
  const base = {
    sessionId: input.session.id,
    fromModality: input.session.currentModality,
    toModality: input.toModality,
    initiatedBy: input.initiatedBy,
    reason: input.reason,
    presetReasonCode: input.presetReasonCode ?? null,
    correlationId: input.correlationId,
  };
  switch (input.billingAction) {
    case 'paid_upgrade': {
      if (input.amountPaise == null || input.razorpayPaymentId == null) {
        throw new InternalError(
          'buildHistoryInsert: paid_upgrade missing amountPaise / razorpayPaymentId',
        );
      }
      return {
        ...base,
        billingAction: 'paid_upgrade' as const,
        amountPaise: input.amountPaise,
        razorpayPaymentId: input.razorpayPaymentId,
      };
    }
    case 'auto_refund_downgrade': {
      if (input.amountPaise == null) {
        throw new InternalError(
          'buildHistoryInsert: auto_refund_downgrade missing amountPaise',
        );
      }
      return {
        ...base,
        billingAction: 'auto_refund_downgrade' as const,
        amountPaise: input.amountPaise,
      };
    }
    case 'free_upgrade': {
      return { ...base, billingAction: 'free_upgrade' as const };
    }
    case 'no_refund_downgrade': {
      return { ...base, billingAction: 'no_refund_downgrade' as const };
    }
    default: {
      const exhaustive: never = input.billingAction;
      throw new InternalError(`buildHistoryInsert: unknown billingAction ${exhaustive as string}`);
    }
  }
}

/**
 * Canonical copy for the `modality_switched` system message (Plan 09
 * Task 53). Persisted as one `consultation_messages.body` row — both
 * doctor + patient see the exact same string, so the copy uses
 * neutral 3rd-person phrasing ("Patient upgraded to Video.", "Doctor
 * downgraded the consult to Voice.") rather than the 9-variant
 * per-perspective matrix in Task 53's spec.
 *
 * **Why neutral, not per-perspective.** The Plan 06 Task 37 emitter
 * persists ONE body per row and broadcasts to every consumer; there
 * is no per-viewer projection layer today. Emitting two rows (one
 * per viewer) would pollute the chat + break the dedup invariant
 * (see the `correlationId` seeded from `historyRowId` in the caller).
 * A future Plan 06 Task 38 follow-up can light up per-viewer copy
 * client-side using the structured `meta` payload — the meta already
 * carries every field the matrix needs (`initiatedBy`,
 * `billingAction`, `reason`, `amountPaise`).
 *
 * **Modality words title-cased** per the spec (`Text`, `Voice`,
 * `Video`). **Reason is never truncated** — Migration 075's 5..200
 * CHECK already bounds the input; the chat bubble wraps naturally.
 * **Amount rendered in ₹ whole rupees** (paise ÷ 100, rounded to
 * integer) to match Razorpay's customer-facing invoice convention.
 *
 * @ai-pipeline-stable
 * Plan 10's session-narrative AI pipeline reads `consultation_messages`
 * rows `WHERE system_event = 'modality_switched'`. The body string
 * shape above is considered stable — cosmetic copy tweaks are fine
 * but the structured information (from/to/initiatedBy/action/amount/
 * reason) must remain derivable. AI pipeline consumers should prefer
 * the `meta` payload for parsing; the body is for humans.
 */
function buildModalitySwitchedBanner(input: {
  from: Modality;
  to: Modality;
  initiatedBy: ModalityInitiator;
  billingAction: ModalityBillingAction;
  reason: string | null;
  amountPaise: number | null;
}): string {
  const toTitle = titleCaseModality(input.to);
  const amountRupees =
    input.amountPaise !== null && input.amountPaise !== undefined
      ? formatRupeesFromPaise(input.amountPaise)
      : null;
  const reasonSuffix =
    input.reason && input.reason.trim().length > 0
      ? ` Reason: ${input.reason.trim()}`
      : '';

  switch (input.billingAction) {
    case 'paid_upgrade':
      // Patient-initiated only — doctor approved with charge, payment
      // captured synchronously in Task 49's webhook hook.
      return amountRupees
        ? `Patient upgraded to ${toTitle}. Payment of ${amountRupees} processed.`
        : `Patient upgraded to ${toTitle}. Payment processed.`;

    case 'free_upgrade':
      // Either the doctor granted the patient's request for free, or
      // the doctor initiated the upgrade themselves (patient consent
      // path — reason is always populated on the doctor-initiated
      // branch per Migration 075 CHECK `modality_history_reason_required`).
      if (input.initiatedBy === 'doctor') {
        return `Doctor upgraded the consult to ${toTitle} at no extra charge.${reasonSuffix}`;
      }
      return `Doctor approved the patient's upgrade to ${toTitle} as a free upgrade.`;

    case 'no_refund_downgrade':
      // Patient-initiated only — reason is required per Migration 075
      // CHECK (patient downgrade row demands 5..200 chars).
      return `Patient switched to ${toTitle} for the remainder of the consult. No refund issued.${reasonSuffix}`;

    case 'auto_refund_downgrade':
      // Doctor-initiated only — refund is enqueued synchronously by
      // Task 49's billing service; the refund-status follow-up banner
      // (`modality_refund_processing` / `modality_refund_failed`)
      // is emitted by the retry worker when the async path kicks in.
      // Reason is always populated (Migration 075 CHECK).
      return amountRupees
        ? `Doctor downgraded the consult to ${toTitle}. Patient refunded ${amountRupees}.${reasonSuffix}`
        : `Doctor downgraded the consult to ${toTitle}. Refund issued to patient.${reasonSuffix}`;

    default: {
      // Exhaustiveness — TypeScript flags new union members before
      // they reach here. The string fallback keeps the emit best-
      // effort even if a future schema change lands ahead of a copy
      // update.
      const exhaustive: never = input.billingAction;
      return `Modality switched to ${toTitle}. (${String(exhaustive)})`;
    }
  }
}

function titleCaseModality(m: Modality): string {
  return m === 'text' ? 'Text' : m === 'voice' ? 'Voice' : 'Video';
}

/**
 * Render `paise` as `₹X` (whole rupees). Matches the Razorpay invoice
 * convention — patients see rupee amounts on their receipts, so the
 * chat banner should too. Uses `Intl.NumberFormat('en-IN')` for the
 * lakh/crore grouping on large amounts (though modality fees are
 * always ≤ ₹500 in v1, the code is ready for when the pricing
 * catalogue grows).
 */
function formatRupeesFromPaise(paise: number): string {
  const rupees = Math.round(paise / 100);
  const formatted = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(rupees);
  return formatted;
}

/**
 * Test-only surface — the banner builder is private but Task 53's
 * copy-matrix assertions exercise every branch independently of the
 * state-machine's commit path. Not re-exported to `__testOnly__`
 * because the rest of the module already uses direct function
 * declarations; a single named export keeps the test surface
 * explicit.
 */
export const __testOnly__ = {
  buildModalitySwitchedBanner,
  formatRupeesFromPaise,
};

// ============================================================================
// Internal: session load + guard helpers.
// ============================================================================

interface LoadedSession {
  id: string;
  appointmentId: string;
  doctorId: string;
  patientId: string | null;
  modality: Modality;
  currentModality: Modality;
  upgradeCount: number;
  downgradeCount: number;
  status: string;
  provider: SessionRecord['provider'];
  providerSessionId: string | null;
}

async function loadSessionWithCounters(
  admin: ReturnType<typeof getSupabaseAdminClient>,
  sessionId: string,
): Promise<LoadedSession | null> {
  if (!admin) return null;
  const { data, error } = await admin
    .from('consultation_sessions')
    .select(
      'id, appointment_id, doctor_id, patient_id, modality, current_modality, upgrade_count, downgrade_count, status, provider, provider_session_id',
    )
    .eq('id', sessionId)
    .maybeSingle();
  if (error) {
    logger.warn({ sessionId, error: error.message }, 'loadSessionWithCounters: query failed');
    return null;
  }
  if (!data) return null;
  const row = data as Record<string, unknown>;
  return {
    id: row.id as string,
    appointmentId: row.appointment_id as string,
    doctorId: row.doctor_id as string,
    patientId: (row.patient_id as string | null) ?? null,
    modality: row.modality as Modality,
    currentModality: row.current_modality as Modality,
    upgradeCount: (row.upgrade_count as number) ?? 0,
    downgradeCount: (row.downgrade_count as number) ?? 0,
    status: row.status as string,
    provider: row.provider as SessionRecord['provider'],
    providerSessionId: (row.provider_session_id as string | null) ?? null,
  };
}

function validateReason(
  reason: string | undefined | null,
  required: boolean,
): { ok: true } | { ok: false; reason: ModalityRejectReason; detail: string } {
  const trimmed = reason?.trim();
  if (!trimmed) {
    if (required) {
      return { ok: false, reason: 'reason_required', detail: 'reason missing' };
    }
    return { ok: true };
  }
  const length = [...trimmed].length; // codepoint count (multi-byte safe).
  if (length < REASON_MIN_CHARS || length > REASON_MAX_CHARS) {
    return {
      ok: false,
      reason: 'reason_out_of_bounds',
      detail: `length=${length} outside [${REASON_MIN_CHARS},${REASON_MAX_CHARS}]`,
    };
  }
  return { ok: true };
}

function rejection(
  reason: ModalityRejectReason,
  correlationId: string,
  detail?: string,
): ModalityChangeReject {
  return { kind: 'rejected', reason, correlationId, detail };
}
