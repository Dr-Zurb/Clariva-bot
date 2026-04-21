/**
 * Modality-change frontend types (Plan 09 · Task 50 · Decision 11 LOCKED).
 *
 * Mirror of the backend service-layer contracts in
 * `backend/src/types/modality-change.ts`. Kept hand-written (not
 * auto-generated) because (a) the frontend only consumes a subset of
 * the service surface and (b) the backend types import from
 * `consultation-session` / `modality-history` which drag node-only
 * shapes into the browser bundle.
 *
 * **Lifecycle coupling:** when the backend type changes, update this
 * file in the same PR. Task 47/49's result discriminant (`kind`) is
 * the compile-time contract; widening is additive on both sides.
 *
 * @see backend/src/types/modality-change.ts
 * @see docs/Development/Daily-plans/April 2026/19-04-2026/Tasks/task-50-patient-modality-upgrade-request-modal.md
 */

// Re-declared locally so we don't reach into the backend bundle. Must
// stay aligned with `backend/src/types/consultation-session.ts` + the
// Migration 075 `consultation_modality` enum order (`text` < `voice` <
// `video`).
export type Modality = "text" | "voice" | "video";

export type ModalityInitiator = "patient" | "doctor";

/**
 * Preset radio-button tags for the doctor-initiated / patient-
 * downgrade reason field. Mirrors Migration 075's CHECK body.
 * Task 50's patient-upgrade request form does NOT require a reason,
 * so these pills aren't surfaced by this modal — but the type is
 * exported so the Task 51 doctor modal + Task 52 patient-downgrade
 * modal can import from the same place.
 */
export type ModalityPresetReasonCode =
  | "visible_symptom"
  | "need_to_hear_voice"
  | "patient_request"
  | "network_or_equipment"
  | "case_doesnt_need_modality"
  | "patient_environment"
  | "other";

export type ModalityBillingAction =
  | "paid_upgrade"
  | "free_upgrade"
  | "no_refund_downgrade"
  | "auto_refund_downgrade";

export type ModalityRejectReason =
  | "forbidden"
  | "session_not_active"
  | "no_op_transition"
  | "max_upgrades_reached"
  | "max_downgrades_reached"
  | "pending_request_exists"
  | "reason_required"
  | "reason_out_of_bounds"
  | "provider_failure"
  | "internal_error";

/**
 * Terminal values of `modality_change_pending_requests.response`.
 * Mirrors Migration 076 CHECK.
 */
export type ModalityPendingResponse =
  | "approved_paid"
  | "approved_free"
  | "allowed"
  | "declined"
  | "timeout"
  | "checkout_cancelled"
  | "provider_failure";

/** Request body for `POST /modality-change/request`. */
export interface ModalityChangeRequestBody {
  requestedModality: Modality;
  initiatedBy: ModalityInitiator;
  reason?: string;
  presetReasonCode?: ModalityPresetReasonCode;
  correlationId?: string;
}

export interface ModalityChangePendingDoctorApproval {
  kind: "pending_doctor_approval";
  approvalRequestId: string;
  approvalExpiresAt: string;
  correlationId: string;
}

export interface ModalityChangePendingPatientConsent {
  kind: "pending_patient_consent";
  consentRequestId: string;
  consentExpiresAt: string;
  correlationId: string;
}

export interface ModalityChangeApplied {
  kind: "applied";
  historyRowId: string;
  toModality: Modality;
  billingAction: ModalityBillingAction;
  correlationId: string;
}

export interface ModalityChangeReject {
  kind: "rejected";
  reason: ModalityRejectReason;
  detail?: string;
  correlationId: string;
  refundInitiated?: true;
}

export type ModalityChangeResult =
  | ModalityChangePendingDoctorApproval
  | ModalityChangePendingPatientConsent
  | ModalityChangeApplied
  | ModalityChangeReject;

export type ModalityPendingKind = "patient_upgrade" | "doctor_upgrade";

/**
 * Derived-state projection surfaced to both participants via
 * `GET /modality-change/state`. Consumed by the modal on mount
 * for page-refresh resilience (Task 50 re-hydration path).
 */
export interface ModalityChangeActivePending {
  id: string;
  initiatedBy: ModalityInitiator;
  requestedModality: Modality;
  kind: ModalityPendingKind;
  expiresAt: string;
  requestedAt: string;
}

export interface ModalityChangeState {
  currentModality: Modality;
  upgradeCount: number;
  downgradeCount: number;
  activePendingRequest: ModalityChangeActivePending | null;
}

/**
 * Client-side-only projection of the `modality_change_pending_requests`
 * row — the patient's Supabase browser client reads this directly via
 * the `modality_history_participants_select` RLS policy (Migration
 * 076 line 206). `razorpay_order_id` + `amount_paise` are exposed here
 * because the row is DB-level visible to participants; the HTTP
 * `GET /state` projection deliberately masks them (per Task 47 Notes
 * §"Pending row projection"). The modal reads the row via
 * postgres_changes UPDATE events to drive the `checkout_ready` state
 * without waiting for a dedicated backend Realtime broadcast.
 */
export interface PendingRequestRow {
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

// ============================================================================
// GET /modality-change/history response shape (Plan 09 · Task 55).
// ============================================================================

/**
 * Session summary frame for the timeline. Renders the synthetic
 * "Started as X" anchor (from `initialModality` + `startedAt`) and
 * the "Consult ended"/"Consult in progress" anchor (from `endedAt` +
 * `status`) above/below the `entries` list.
 */
export interface ModalityHistorySessionSummary {
  id: string;
  initialModality: Modality;
  currentModality: Modality;
  upgradeCount: number;
  downgradeCount: number;
  startedAt: string;
  endedAt: string | null;
  status: string;
}

/**
 * One transition row as surfaced to the Task 55 timeline. Matches the
 * backend `ModalityHistoryTimelineEntry` 1:1. `refundFailedPermanent`
 * is the derived flag the UI uses to render the red "Support
 * contacted" badge when Task 49's retry worker has exhausted its
 * budget.
 */
export interface ModalityHistoryTimelineEntry {
  id: string;
  fromModality: Modality;
  toModality: Modality;
  initiatedBy: ModalityInitiator;
  billingAction: ModalityBillingAction;
  amountPaise: number | null;
  razorpayPaymentId: string | null;
  razorpayRefundId: string | null;
  refundFailedPermanent: boolean;
  reason: string | null;
  presetReasonCode: ModalityPresetReasonCode | null;
  occurredAt: string;
}

export interface ModalityHistoryResponse {
  session: ModalityHistorySessionSummary;
  entries: ModalityHistoryTimelineEntry[];
}

/** Client-side projection of `consultation_modality_history` INSERT events. */
export interface ModalityHistoryRowInsert {
  id: string;
  session_id: string;
  from_modality: Modality;
  to_modality: Modality;
  initiated_by: ModalityInitiator;
  billing_action: ModalityBillingAction;
  amount_paise: number | null;
  razorpay_order_id: string | null;
  razorpay_payment_id: string | null;
  occurred_at: string;
  correlation_id: string | null;
}
