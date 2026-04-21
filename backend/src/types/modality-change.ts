/**
 * Modality-change State-Machine Types (Plan 09 · Task 47 · Decision 11 LOCKED)
 *
 * Mirrors the Migration 076 `modality_change_pending_requests` schema and
 * types the public `requestModalityChange()` contract — Task 47's single-
 * entry state machine. Four result kinds span the 2×2 matrix (upgrade/
 * downgrade × patient/doctor):
 *
 *   | initiatedBy | direction  | result kind                   |
 *   |-------------|------------|-------------------------------|
 *   | patient     | upgrade    | `pending_doctor_approval`     |
 *   | patient     | downgrade  | `applied` (no_refund_downgrade) |
 *   | doctor      | upgrade    | `pending_patient_consent`     |
 *   | doctor      | downgrade  | `applied` (auto_refund_downgrade) |
 *
 * The `rejected` branch spans authZ / session-state / rate-limit /
 * no-op / pending-request / reason-validation / provider-failure — one
 * tagged union so the API route returns the same envelope shape for
 * every failure path (Task 50/51/52 modals branch on `reason`).
 *
 * **Why co-located next to `modality-history.ts` (Task 46)** rather than
 * inside `types/consultation-session.ts`:
 *   · Domain alignment — `modality-*` types cluster under the Plan 09
 *     modality-switching surface; session-level types stay in
 *     `consultation-session.ts`.
 *   · Extension point — Task 49's billing types + Task 53's system-
 *     message extension will land as sibling files (`modality-billing.ts`,
 *     `modality-system-message.ts`) without touching the session facade.
 *
 * Field-naming doctrine: camelCase at the service boundary; query helpers
 * map to snake_case at the Supabase adapter. Matches Task 46.
 *
 * @see backend/migrations/076_modality_change_pending_requests.sql
 * @see docs/Development/Daily-plans/April 2026/19-04-2026/Tasks/task-47-request-modality-change-state-machine.md
 */

import type { Modality } from './consultation-session';
import type {
  ModalityBillingAction,
  ModalityInitiator,
  ModalityPresetReasonCode,
} from './modality-history';

// Re-export to the modality-change surface so callers pull everything
// from a single module. Task 46's `modality-history.ts` remains the
// canonical home — this is a thin re-export for import ergonomics.
export type { ModalityInitiator, ModalityPresetReasonCode, ModalityBillingAction };

// ============================================================================
// Rejection reasons — tagged union for the `rejected` result kind.
// ============================================================================

/**
 * Pinned rejection taxonomy for `ModalityChangeResult` / `ModalityChangeReject`.
 *
 * Each value maps to one branch in the state machine's guard chain:
 *
 *   | value                     | step | cause                                              |
 *   |---------------------------|------|----------------------------------------------------|
 *   | `forbidden`               | 1    | Caller JWT doesn't match `initiatedBy` seat.       |
 *   | `session_not_active`      | 2    | `session.status !== 'live'`.                       |
 *   | `no_op_transition`        | 5    | `requestedModality === current_modality`.          |
 *   | `max_upgrades_reached`    | 6    | `upgrade_count = 1` already.                       |
 *   | `max_downgrades_reached`  | 6    | `downgrade_count = 1` already.                     |
 *   | `pending_request_exists`  | 7    | Active (unresolved) pending row for the session.   |
 *   | `reason_required`         | 8    | Missing reason on doctor / patient-downgrade path. |
 *   | `reason_out_of_bounds`    | 8    | Reason length outside [5, 200] codepoints.         |
 *   | `provider_failure`        | 9    | Executor threw inside the commit transaction.      |
 *   | `internal_error`          | any  | Unexpected exception; compensating refund fires    |
 *   |                           |      | if the failure happened after Razorpay capture.    |
 *
 * Emitted values are pinned so Task 50/51/52 modals can branch on them
 * without string-stability risk. Widening is additive.
 */
export type ModalityRejectReason =
  | 'forbidden'
  | 'session_not_active'
  | 'no_op_transition'
  | 'max_upgrades_reached'
  | 'max_downgrades_reached'
  | 'pending_request_exists'
  | 'reason_required'
  | 'reason_out_of_bounds'
  | 'provider_failure'
  | 'internal_error';

// ============================================================================
// Public request + result shapes.
// ============================================================================

/**
 * Input to `requestModalityChange()`. The HTTP route validates + forwards
 * verbatim; private handlers inspect `initiatedBy` + the derived
 * direction to route to one of four branches.
 *
 * `requestingUserId` + `requestingRole` are populated from the caller's
 * JWT by the controller — the service never re-authenticates but DOES
 * verify the seat matches `initiatedBy`.
 */
export interface ModalityChangeRequest {
  sessionId: string;
  requestedModality: Modality;
  initiatedBy: ModalityInitiator;
  /** Required for doctor-initiated + patient-downgrade; optional for patient-upgrade. */
  reason?: string;
  /** Optional radio-button tag. Mirrors Migration 075 preset taxonomy. */
  presetReasonCode?: ModalityPresetReasonCode;
  /** Caller-supplied UUID. Service generates one if omitted. */
  correlationId?: string;
  /** Caller identity (populated by controller from JWT). */
  requestingUserId: string;
  /** Caller role — `'patient'` or `'doctor'`. Must match `initiatedBy`. */
  requestingRole: ModalityInitiator;
}

/**
 * Result discriminated on `kind`. Four success-adjacent kinds + one
 * rejection kind. All consumers (Task 50/51/52 modals + Task 54 launcher)
 * pattern-match on `kind`.
 */
export type ModalityChangeResult =
  | ModalityChangePendingDoctorApproval
  | ModalityChangePendingPatientConsent
  | ModalityChangeApplied
  | ModalityChangeReject;

/**
 * Returned for the patient-upgrade branch. Doctor now has 90s to call
 * `POST /modality-change/approve`.
 */
export interface ModalityChangePendingDoctorApproval {
  kind: 'pending_doctor_approval';
  approvalRequestId: string;
  /** ISO-8601 UTC. Patient UI counts down. */
  approvalExpiresAt: string;
  correlationId: string;
}

/**
 * Returned for the doctor-upgrade branch. Patient now has 60s to call
 * `POST /modality-change/patient-consent`.
 */
export interface ModalityChangePendingPatientConsent {
  kind: 'pending_patient_consent';
  consentRequestId: string;
  /** ISO-8601 UTC. Doctor UI counts down. */
  consentExpiresAt: string;
  correlationId: string;
}

/**
 * Returned immediately for patient-downgrade + doctor-downgrade branches
 * (no pending phase), and asynchronously for patient-upgrade (from the
 * Razorpay webhook handler) + doctor-upgrade (from patient consent).
 */
export interface ModalityChangeApplied {
  kind: 'applied';
  historyRowId: string;
  toModality: Modality;
  billingAction: ModalityBillingAction;
  correlationId: string;
}

/**
 * Returned on any guard-chain failure OR a post-commit compensating-
 * refund branch (executor fails mid-paid-upgrade-webhook). `refundInitiated`
 * is present only when the rejection carries a compensating refund.
 */
export interface ModalityChangeReject {
  kind: 'rejected';
  reason: ModalityRejectReason;
  /** Human-readable detail for structured logs — never shown to users verbatim. */
  detail?: string;
  correlationId: string;
  /**
   * Set when a paid-upgrade webhook-driven transition failed AFTER capture;
   * the state machine auto-enqueues a compensating refund. Absent on every
   * pre-capture rejection path.
   */
  refundInitiated?: true;
}

// ============================================================================
// Approval / consent input shapes (called from the second-round routes).
// ============================================================================

/**
 * Input to `handleDoctorApprovalOfPatientUpgrade()`. Doctor inspects the
 * pending row and chooses paid / free / decline.
 *
 *   - `'paid'`  → state machine calls billing.captureUpgradePayment;
 *                 the Razorpay webhook fires the commit branch.
 *   - `'free'`  → state machine applies immediately (free_upgrade).
 *   - `'decline'` → pending row terminates; no history row written.
 */
export interface DoctorApprovalInput {
  approvalRequestId: string;
  decision: 'paid' | 'free' | 'decline';
  /** Only used for `'paid'`. Pricing source of truth is service-side; doctor's UI echoes for confirmation. */
  amountPaise?: number;
  /** Only used for `'decline'`. 5..200 chars when set. */
  declineReason?: string;
  requestingUserId: string;
  correlationId?: string;
}

/**
 * Input to `handlePatientConsentForDoctorUpgrade()`. Patient approves or
 * declines the doctor-initiated upgrade; always-free on allow.
 */
export interface PatientConsentInput {
  consentRequestId: string;
  decision: 'allow' | 'decline';
  /** Optional patient-facing reason on decline (5..200 chars when set). */
  declineReason?: string;
  requestingUserId: string;
  correlationId?: string;
}

// ============================================================================
// Razorpay mid-consult webhook input.
// ============================================================================

/**
 * Input to `handleModalityChangePaymentCaptured()` — the second half of
 * the patient paid-upgrade branch. Called from the async Razorpay webhook
 * dispatcher after signature verification + idempotency check.
 *
 * The handler re-acquires the advisory lock, re-checks `upgrade_count`,
 * executes the transition, inserts the history row, and emits the system
 * message. On executor failure it fires the compensating refund.
 */
export interface ModalityPaymentCapturedInput {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  /** Echoed for audit — never trusted vs the authoritative pending-row value. */
  amountPaiseEcho: number;
  correlationId: string;
}

// ============================================================================
// Derived-state read shape (GET /modality-change/state).
// ============================================================================

/**
 * Return shape for the state-read endpoint. Consumed by Task 54's launcher
 * (to grey out buttons when a pending request exists or a counter is at
 * cap) + the Task 50/51/52 modals when they re-hydrate on page refresh.
 */
export interface ModalityChangeState {
  currentModality: Modality;
  upgradeCount: number;
  downgradeCount: number;
  activePendingRequest: ModalityChangeActivePending | null;
}

/**
 * Pending row projection surfaced to both participants. Every field is
 * safe-for-both-eyes (initiatedBy, requestedModality, expiresAt). Razorpay
 * order id is intentionally NOT exposed — the webhook is the trusted
 * commit trigger; the frontend doesn't need the id.
 */
export interface ModalityChangeActivePending {
  id: string;
  initiatedBy: ModalityInitiator;
  requestedModality: Modality;
  /** Derived from initiatedBy — `'patient_upgrade'` etc. Lets the UI switch modal copy. */
  kind: ModalityPendingKind;
  /** ISO-8601 UTC. */
  expiresAt: string;
  /** ISO-8601 UTC. */
  requestedAt: string;
}

export type ModalityPendingKind =
  | 'patient_upgrade'   // → doctor approval modal
  | 'doctor_upgrade';   // → patient consent modal

// ============================================================================
// Internal: pending-row camelCase mirror (used by query helpers).
// ============================================================================

/**
 * CamelCase mirror of `modality_change_pending_requests` — the query
 * helpers emit this shape after the snake→camel remap at the Supabase
 * adapter boundary.
 */
export interface ModalityChangePendingRow {
  id: string;
  sessionId: string;
  initiatedBy: ModalityInitiator;
  requestedModality: Modality;
  reason: string | null;
  presetReasonCode: ModalityPresetReasonCode | null;
  amountPaise: number | null;
  razorpayOrderId: string | null;
  requestedAt: string;
  expiresAt: string;
  respondedAt: string | null;
  response: ModalityPendingResponse | null;
  correlationId: string | null;
}

/**
 * Terminal `response` values. Mirrors the Migration 076 CHECK body.
 */
export type ModalityPendingResponse =
  | 'approved_paid'
  | 'approved_free'
  | 'allowed'
  | 'declined'
  | 'timeout'
  | 'checkout_cancelled'
  | 'provider_failure';

/**
 * Insert payload for a new pending request. `id` + `requestedAt` +
 * terminal fields default in the DB. `expiresAt` is caller-supplied
 * (state machine computes `now() + 90s` for patient-upgrade, `now() +
 * 60s` for doctor-upgrade — kept in-service to match Plan 08 Task 41's
 * convention).
 */
export interface InsertModalityChangePendingRow {
  sessionId: string;
  initiatedBy: ModalityInitiator;
  requestedModality: Modality;
  reason?: string | null;
  presetReasonCode?: ModalityPresetReasonCode | null;
  amountPaise?: number | null;
  razorpayOrderId?: string | null;
  expiresAt: string;
  correlationId: string;
}

/**
 * Update payload when a counter-party responds, the worker times out,
 * or Razorpay cancels checkout. Caller passes the guard predicate
 * (`expectResponseNull: true`) so the adapter can use an atomic UPDATE
 * with `response IS NULL` to guarantee at-most-once terminal writes.
 */
export interface UpdateModalityChangePendingResponse {
  id: string;
  response: ModalityPendingResponse;
  respondedAt: string;
  /** Optionally stamp the Razorpay order id on the `'approved_paid'` path. */
  razorpayOrderId?: string;
}
