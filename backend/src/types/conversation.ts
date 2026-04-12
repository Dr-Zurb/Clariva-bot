/**
 * Conversation State Types (e-task-3)
 *
 * State shape for multi-turn flow. Stored in conversations.metadata.
 *
 * **PHI / COMPLIANCE (ARM-03):**
 * - New ARM-03 fields MUST be enums, booleans, ISO timestamps, or opaque IDs only — **no** patient
 *   free-text, complaints, or echoes of DM content in `serviceCatalogMatchReasonCodes` or matcher fields.
 * - Pre-existing keys like `reasonForVisit` / `extraNotes` may hold PHI and follow legacy booking flows;
 *   do **not** add new PHI-bearing keys to metadata.
 *
 * **Semantics:** `matcherProposedCatalogServiceKey` (and related) = AI/staff **proposal**.
 * `catalogServiceKey` / `catalogServiceId` = **final** selection for quoting & `/book` once
 * `serviceSelectionFinalized` is true (or high-confidence path sets them without staff review).
 *
 * Persistence: callers merge with `{ ...state, ...patch }` then `updateConversationState` replaces
 * the whole metadata object — always spread existing state first.
 */

import type { Intent } from './ai';

/**
 * Last gated prompt the bot sent (RBH-07). Stored in metadata; no PHI.
 * Derived from `step` on each persist; substring checks on recent messages remain fallback for legacy rows.
 */
export type ConversationLastPromptKind =
  | 'collect_details'
  | 'consent'
  | 'confirm_details'
  | 'match_pick'
  | 'cancel_confirm'
  /** ARM-05: Visit type pending staff confirmation — no slot/payment CTA yet. */
  | 'staff_service_pending'
  /** RBH-13: Last assistant turn was a structured fee quote (not collecting PHI). */
  | 'fee_quote';

/** RBH-13: Sub-flow stored in metadata alongside `step`. */
export type ConversationActiveFlow = 'fee_quote';

/** e-task-dm-04: reason-first triage before showing full fee catalog (enums only in metadata). */
export type ReasonFirstTriagePhase = 'ask_more' | 'confirm';

/**
 * Map flow step → prompt kind for persistence. Non-gating steps clear the field.
 */
export function conversationLastPromptKindForStep(
  step?: string,
  activeFlow?: ConversationActiveFlow
): ConversationLastPromptKind | undefined {
  if (activeFlow === 'fee_quote' && (step === 'responded' || !step)) {
    return 'fee_quote';
  }
  if (!step || step === 'responded') return undefined;
  if (step === 'collecting_all' || step.startsWith('collecting_')) return 'collect_details';
  if (step === 'confirm_details') return 'confirm_details';
  if (step === 'consent') return 'consent';
  if (step === 'awaiting_match_confirmation') return 'match_pick';
  if (step === 'awaiting_cancel_confirmation') return 'cancel_confirm';
  if (step === 'awaiting_staff_service_confirmation') return 'staff_service_pending';
  return undefined;
}

/**
 * Collection step values (e-task-4). No PHI; only step and field names in metadata.
 * RBH-06: `confirming_slot` / `selecting_slot` are deprecated — use `awaiting_slot_selection`.
 */
/**
 * ARM-03 / AI receptionist: confidence band for catalog `service_key` matching (stored in metadata).
 */
export type ServiceCatalogMatchConfidence = 'high' | 'medium' | 'low';

/**
 * ARM-03: suggested reason codes for structured metrics/logging (snake_case). Arbitrary strings allowed
 * in `serviceCatalogMatchReasonCodes` for forward compatibility; prefer these when possible.
 */
export const SERVICE_CATALOG_MATCH_REASON_CODES = {
  CATALOG_ALLOWLIST_MATCH: 'catalog_allowlist_match',
  KEYWORD_HINT_MATCH: 'keyword_hint_match',
  SINGLE_SERVICE_CATALOG: 'single_service_catalog',
  AMBIGUOUS_COMPLAINT: 'ambiguous_complaint',
  /** DM fee path: thread matches both NCD-style and acute/general consult signals — staff assigns visit type (no patient price pick). */
  COMPETING_VISIT_TYPE_BUCKETS: 'competing_visit_type_buckets',
  /** e-task-dm-05: clinical-led thread + multi-row catalog could not be narrowed to one row — staff assigns visit type (no patient tier menu). */
  CLINICAL_LED_VISIT_TYPE_UNCLEAR: 'clinical_led_visit_type_unclear',
  NO_CATALOG_MATCH: 'no_catalog_match',
  MATCHER_ERROR: 'matcher_error',
  STAFF_CONFIRMED_PROPOSAL: 'staff_confirmed_proposal',
  STAFF_REASSIGNED_SERVICE: 'staff_reassigned_service',
  AUTO_FINALIZED_HIGH_CONFIDENCE: 'auto_finalized_high_confidence',
  /** ARM-04: validated choice produced by LLM stage (key still allowlisted). */
  SERVICE_MATCH_LLM: 'service_match_llm',
  /**
   * Practice catalog `competing_visit_type_prefer_service_key` resolved a mixed NCD+acute/general
   * thread to that row instead of catch-all / low-confidence ambiguity.
   */
  COMPETING_BUCKETS_PRACTICE_PREFERENCE: 'competing_buckets_practice_preference',
  /** ARM-06: staff closed review without confirming matcher proposal. */
  STAFF_REVIEW_CANCELLED_BY_STAFF: 'staff_review_cancelled_by_staff',
  /** ARM-06 / ARM-08: SLA elapsed before staff action. */
  STAFF_REVIEW_TIMED_OUT: 'staff_review_timed_out',
} as const;

export type PatientCollectionStep =
  | 'collecting_all'
  | 'collecting_name'
  | 'collecting_phone'
  | 'collecting_age'
  | 'collecting_gender'
  | 'collecting_reason_for_visit'
  | 'collecting_email'
  | 'confirm_details'
  | 'awaiting_match_confirmation'
  | 'consent'
  | 'awaiting_date_time'
  | 'awaiting_slot_selection'
  /** ARM-05: Matcher medium/low — clinic must confirm service before slot link. */
  | 'awaiting_staff_service_confirmation'
  | 'confirming_slot'
  | 'selecting_slot'
  | string;

/**
 * Conversation state stored in conversations.metadata.
 * No PHI; safe for audit and logging (field names only).
 */
export interface ConversationState {
  /** Last detected intent (for context in next turn) */
  lastIntent?: Intent;
  /** Current step in flow (e.g. collecting_name, consent, awaiting_slot_selection, responded) */
  step?: string;
  /**
   * RBH-07: Which gated prompt we last showed (details, consent, confirm, match, cancel yes/no).
   * Refreshed from `step` when the DM handler persists state; optional on legacy conversations.
   */
  lastPromptKind?: ConversationLastPromptKind;
  /** Collected data keys only (no values; values are PHI - stored in memory/Redis until Task 5) */
  collectedFields?: string[];
  /** Timestamp of last state update (ISO string) */
  updatedAt?: string;
  /** When consent was first requested (ISO string); set when transitioning to step consent */
  consent_requested_at?: string;
  /** Date (YYYY-MM-DD) for slot selection; legacy selecting_slot only (RBH-06) */
  slotSelectionDate?: string;
  /** Consultation channel: teleconsult modality or in_clinic (e-task-2, SFU-07) */
  consultationType?: 'video' | 'in_clinic' | 'text' | 'voice';
  /** SFU-05/SFU-07: catalog `service_key` when doctor has multi-service matrix */
  catalogServiceKey?: string;
  /** SFU-11: catalog `service_id` for episode lookup */
  catalogServiceId?: string;
  /**
   * ARM-03: AI matcher proposal for `service_key` **before** staff confirmation or auto-finalize.
   * Do not store patient text here — slug/key only.
   */
  matcherProposedCatalogServiceKey?: string;
  /** ARM-03: proposal stable id from `service_offerings_json` */
  matcherProposedCatalogServiceId?: string;
  matcherProposedConsultationModality?: 'text' | 'voice' | 'video';
  /** ARM-03: last matcher confidence (enum only) */
  serviceCatalogMatchConfidence?: ServiceCatalogMatchConfidence;
  /** ARM-03: machine-readable codes for logs/metrics — no free-text patient content */
  serviceCatalogMatchReasonCodes?: string[];
  /** ARM-03: patient must not get slot/payment until staff resolves (ARM-05/06) */
  pendingStaffServiceReview?: boolean;
  /** ARM-03 / ARM-06: id of pending review row */
  staffServiceReviewRequestId?: string;
  /** ARM-03: SLA end (ISO 8601); internal UI / worker only */
  staffServiceReviewDeadlineAt?: string;
  /**
   * ARM-03 / ARM-09: when true, `catalogServiceKey` (and modality/id) are authoritative for booking UX.
   */
  serviceSelectionFinalized?: boolean;
  /** SFU-05: teleconsult modality for quoting (text / voice / video) */
  consultationModality?: 'text' | 'voice' | 'video';
  /** Slot picked on booking page; optional metadata (canonical step: awaiting_slot_selection; RBH-06) */
  slotToConfirm?: { start: string; end: string; dateStr: string };
  /** Reason for visit (e-task-2); preserved for appointment.reason_for_visit at booking */
  reasonForVisit?: string;
  /** Optional patient extras for appointment.notes (e-task-2); e.g. "On blood thinners", "Allergic to X" */
  extraNotes?: string;
  /** Age (e-task-2); preserved for patients.age at booking */
  age?: number;
  /** When true, we're collecting for another person (e.g. mother); consent will create patient and set bookingForPatientId */
  bookingForSomeoneElse?: boolean;
  /** Relation when booking for someone else, e.g. "sister", "mother" (e-task-1 Bot Intelligence) */
  relation?: string;
  /** Patient ID when booking for someone else; slot selection uses this instead of conversation.patient_id */
  bookingForPatientId?: string;
  /** Patient ID of last booked appointment (for "payment done" / status check after redirect) */
  lastBookingPatientId?: string;
  /** e-task-4: When "me and X" — user wanted to book for self too; offer after first booking completes */
  pendingSelfBooking?: boolean;
  /** e-task-4: When "me first" — user wanted to book for other after self; offer after self booking completes */
  pendingOtherBooking?: { relation: string };
  /** e-task-5: When awaiting_match_confirmation — possible patient match IDs (top 1–2 for "which one?") */
  pendingMatchPatientIds?: string[];
  /** Cancel flow: appointment ID when user has chosen which one to cancel */
  cancelAppointmentId?: string;
  /** Cancel flow: when multiple appointments, store IDs for "1", "2" mapping */
  pendingCancelAppointmentIds?: string[];
  /** Reschedule flow: appointment ID when user has chosen which one to reschedule */
  rescheduleAppointmentId?: string;
  /** Reschedule flow: when multiple appointments, store IDs for "1", "2" mapping */
  pendingRescheduleAppointmentIds?: string[];
  /** RBH-13: Optional sub-flow (e.g. fee quote without forced intake). */
  activeFlow?: ConversationActiveFlow;
  /**
   * e-task-dm-03: ISO time when user last received idle `medical_query` safety/deflection copy.
   * **No PHI** — timestamp only; used so classify/generate paths weight thread continuity.
   * Cleared when starting fresh collection. Expire reads via `isRecentMedicalDeflectionWindow`.
   */
  lastMedicalDeflectionAt?: string;
  /**
   * e-task-dm-04: When set, fee idle paths defer full catalog until confirm (phase === confirm + yes).
   * Cleared with fresh collection / `lastMedicalDeflectionAt` resets.
   */
  reasonFirstTriagePhase?: ReasonFirstTriagePhase;
  /**
   * e-task-dm-04b: After idle medical deflection, we sent a **short** “yes, visits are paid” reply (no rupee block yet).
   * Next pricing turns defer to reason-first triage, then narrow fee after confirm. Cleared on new deflection / fee shown / intake start.
   */
  postMedicalConsultFeeAckSent?: boolean;
}

/** e-task-dm-03: TTL for treating `lastMedicalDeflectionAt` as active routing memory. */
export const MEDICAL_DEFLECTION_CONTEXT_TTL_MS = 48 * 60 * 60 * 1000;

export function isRecentMedicalDeflectionWindow(
  state: Pick<ConversationState, 'lastMedicalDeflectionAt'>,
  nowMs: number = Date.now()
): boolean {
  const raw = state.lastMedicalDeflectionAt;
  if (!raw) return false;
  const t = Date.parse(raw);
  if (Number.isNaN(t)) return false;
  return nowMs - t <= MEDICAL_DEFLECTION_CONTEXT_TTL_MS;
}

/** ARM-05: Block booking/slot CTAs until staff resolves (ARM-06/07) or high-confidence path finalized. */
export function isSlotBookingBlockedPendingStaffReview(state: ConversationState): boolean {
  return state.pendingStaffServiceReview === true && state.serviceSelectionFinalized !== true;
}

/**
 * ARM-03: record a matcher proposal and optional staff-review gate (pure; merge into state then persist).
 */
export function applyMatcherProposalToConversationState(
  state: ConversationState,
  proposal: {
    matcherProposedCatalogServiceKey: string;
    matcherProposedCatalogServiceId?: string;
    matcherProposedConsultationModality?: 'text' | 'voice' | 'video';
    serviceCatalogMatchConfidence: ServiceCatalogMatchConfidence;
    serviceCatalogMatchReasonCodes?: string[];
    pendingStaffServiceReview?: boolean;
    staffServiceReviewRequestId?: string;
    staffServiceReviewDeadlineAt?: string;
    /** High-confidence path: copy proposal into final `catalog*` fields and set finalized */
    finalizeSelection?: boolean;
  }
): ConversationState {
  const next: ConversationState = {
    ...state,
    matcherProposedCatalogServiceKey: proposal.matcherProposedCatalogServiceKey,
    serviceCatalogMatchConfidence: proposal.serviceCatalogMatchConfidence,
  };

  if (proposal.matcherProposedCatalogServiceId !== undefined) {
    next.matcherProposedCatalogServiceId = proposal.matcherProposedCatalogServiceId;
  }
  if (proposal.matcherProposedConsultationModality !== undefined) {
    next.matcherProposedConsultationModality = proposal.matcherProposedConsultationModality;
  }
  if (proposal.serviceCatalogMatchReasonCodes?.length) {
    next.serviceCatalogMatchReasonCodes = [
      ...new Set([
        ...(state.serviceCatalogMatchReasonCodes ?? []),
        ...proposal.serviceCatalogMatchReasonCodes,
      ]),
    ];
  }
  if (proposal.pendingStaffServiceReview !== undefined) {
    next.pendingStaffServiceReview = proposal.pendingStaffServiceReview;
  }
  if (proposal.staffServiceReviewRequestId !== undefined) {
    next.staffServiceReviewRequestId = proposal.staffServiceReviewRequestId;
  }
  if (proposal.staffServiceReviewDeadlineAt !== undefined) {
    next.staffServiceReviewDeadlineAt = proposal.staffServiceReviewDeadlineAt;
  }

  if (proposal.finalizeSelection) {
    next.catalogServiceKey = proposal.matcherProposedCatalogServiceKey;
    if (proposal.matcherProposedCatalogServiceId !== undefined) {
      next.catalogServiceId = proposal.matcherProposedCatalogServiceId;
    }
    if (proposal.matcherProposedConsultationModality !== undefined) {
      next.consultationModality = proposal.matcherProposedConsultationModality;
    }
    next.serviceSelectionFinalized = true;
    next.pendingStaffServiceReview = false;
    next.staffServiceReviewRequestId = undefined;
    next.staffServiceReviewDeadlineAt = undefined;
  }

  return next;
}

/**
 * ARM-03: apply staff-confirmed (or API) **final** catalog row — clears pending review flags (pure).
 */
export function applyFinalCatalogServiceSelection(
  state: ConversationState,
  final: {
    catalogServiceKey: string;
    catalogServiceId?: string;
    consultationModality?: 'text' | 'voice' | 'video';
    /** Remove proposal fields from returned state (undefined so JSON omits). */
    clearProposal?: boolean;
    reasonCodesAppend?: string[];
  }
): ConversationState {
  const mergedCodes = [
    ...new Set([...(state.serviceCatalogMatchReasonCodes ?? []), ...(final.reasonCodesAppend ?? [])]),
  ];
  const next: ConversationState = {
    ...state,
    catalogServiceKey: final.catalogServiceKey,
    serviceSelectionFinalized: true,
    pendingStaffServiceReview: false,
    staffServiceReviewRequestId: undefined,
    staffServiceReviewDeadlineAt: undefined,
    serviceCatalogMatchConfidence: 'high',
    serviceCatalogMatchReasonCodes: mergedCodes.length > 0 ? mergedCodes : undefined,
  };

  if (final.catalogServiceId !== undefined) {
    next.catalogServiceId = final.catalogServiceId;
  }
  if (final.consultationModality !== undefined) {
    next.consultationModality = final.consultationModality;
  }

  if (final.clearProposal) {
    next.matcherProposedCatalogServiceKey = undefined;
    next.matcherProposedCatalogServiceId = undefined;
    next.matcherProposedConsultationModality = undefined;
  }

  return next;
}

/**
 * ARM-06: clear pending staff-review gate without finalizing catalog (cancel / timeout paths).
 * Moves DM flow off `awaiting_staff_service_confirmation` so the patient is not stuck.
 */
export function applyStaffReviewGateCancellationToConversationState(
  state: ConversationState,
  reasonCode:
    | typeof SERVICE_CATALOG_MATCH_REASON_CODES.STAFF_REVIEW_CANCELLED_BY_STAFF
    | typeof SERVICE_CATALOG_MATCH_REASON_CODES.STAFF_REVIEW_TIMED_OUT
): ConversationState {
  const mergedCodes = [...new Set([...(state.serviceCatalogMatchReasonCodes ?? []), reasonCode])];
  return {
    ...state,
    pendingStaffServiceReview: false,
    staffServiceReviewRequestId: undefined,
    staffServiceReviewDeadlineAt: undefined,
    step: state.step === 'awaiting_staff_service_confirmation' ? 'responded' : state.step,
    lastPromptKind:
      state.step === 'awaiting_staff_service_confirmation' ? undefined : state.lastPromptKind,
    serviceCatalogMatchReasonCodes: mergedCodes,
    updatedAt: new Date().toISOString(),
  };
}
