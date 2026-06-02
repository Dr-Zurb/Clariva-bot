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
 * **Persistence (rcp-19):** `conversations.metadata` is stored in the **nested** namespaced shape
 * (`booking`, `serviceMatch`, `cancel`, …). `readConversationState` still accepts legacy-flat rows
 * until a backfill / upgrade-on-write converges them. All writes go through `writeConversationState`.
 *
 * Callers merge with `{ ...state, ...patch }` then `updateConversationState` replaces the whole
 * metadata object — always spread existing state first.
 */

import type { Intent } from './ai';

/**
 * Last gated prompt the bot sent (RBH-07). Stored in metadata; no PHI.
 * Derived from `step` on each persist; substring checks on recent messages remain fallback for legacy rows.
 */
export type ConversationLastPromptKind =
  | 'collect_details'
  | 'consent'
  /** Consent step but last bot line was optional-extras ("say Yes to continue") — RBH-07 / philosophy §4.8. */
  | 'consent_optional_extras'
  /** Plan 02 · Task 27 — bot asked "OK to record?" (pre-re-pitch). */
  | 'recording_consent_ask'
  /** Plan 02 · Task 27 — bot sent the soft re-pitch after a first decline. */
  | 'recording_consent_re_pitch'
  | 'confirm_details'
  | 'match_pick'
  | 'cancel_confirm'
  /** User was asked to pick tele / in-clinic / modality (substring fallback exists for legacy). */
  | 'consultation_channel_pick'
  /** ARM-05: Visit type pending staff confirmation — no slot/payment CTA yet. */
  | 'staff_service_pending'
  /** RBH-13: Last assistant turn was a structured fee quote (not collecting PHI). */
  | 'fee_quote'
  /** Task 05: Bot asked the patient to narrow down multiple unrelated complaints before matching a service. */
  | 'complaint_clarification'
  /** rcp-23: returning follow-up service confirm (yes/no before catalog finalize). */
  | 'returning_followup_confirm';

/** RBH-13: Sub-flow stored in metadata alongside `step`. */
export type ConversationActiveFlow = 'fee_quote';

/** e-task-dm-04: reason-first triage before showing full fee catalog (enums only in metadata). */
export type ReasonFirstTriagePhase = 'ask_more' | 'confirm';

/**
 * Map flow step → prompt kind for persistence. Non-gating steps clear the field.
 */
export function conversationLastPromptKindForStep(
  step?: ConversationStage,
  activeFlow?: ConversationActiveFlow
): ConversationLastPromptKind | undefined {
  if (activeFlow === 'fee_quote' && (step === 'responded' || !step)) {
    return 'fee_quote';
  }
  if (!step || step === 'responded') return undefined;
  if (step === 'collecting_all' || step.startsWith('collecting_')) return 'collect_details';
  if (step === 'confirm_details') return 'confirm_details';
  if (step === 'consent') return 'consent';
  if (step === 'recording_consent') return 'recording_consent_ask';
  if (step === 'awaiting_match_confirmation') return 'match_pick';
  if (step === 'awaiting_cancel_confirmation') return 'cancel_confirm';
  if (step === 'awaiting_staff_service_confirmation') return 'staff_service_pending';
  if (step === 'awaiting_complaint_clarification') return 'complaint_clarification';
  if (step === 'awaiting_followup_service_confirmation') return 'returning_followup_confirm';
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
  /** ARM-06: staff closed review without confirming matcher proposal. */
  STAFF_REVIEW_CANCELLED_BY_STAFF: 'staff_review_cancelled_by_staff',
  /** ARM-06 / ARM-08: SLA elapsed before staff action. */
  STAFF_REVIEW_TIMED_OUT: 'staff_review_timed_out',
  /** learn-05: opt-in policy matched structured pattern; auto-finalized without staff review row. */
  LEARNING_POLICY_AUTOBOOK: 'learning_policy_autobook',
  /** Task 05: LLM flagged unrelated mixed complaints; bot asked patient to narrow focus. */
  MIXED_COMPLAINTS_CLARIFICATION_REQUESTED: 'mixed_complaints_clarification_requested',
  /** Task 05: Clarification attempt cap reached — handing off to staff review. */
  MIXED_COMPLAINTS_CLARIFICATION_EXHAUSTED: 'mixed_complaints_clarification_exhausted',
  /** Plan 03 / Task 10: doctor is in `catalog_mode='single_fee'`; matcher returned the lone service directly. */
  SINGLE_FEE_MODE: 'single_fee_mode',
  /** rcp-23: returning patient offered follow-up for prior catalog service (confirm gate). */
  RETURNING_FOLLOWUP_OFFERED: 'returning_followup_offered',
  /** rcp-23: patient confirmed follow-up recall — finalized via applyFinalCatalogServiceSelection. */
  RETURNING_FOLLOWUP_CONFIRMED: 'returning_followup_confirmed',
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
  /** Cancel / reschedule pick + confirm (system-action gated). */
  | 'awaiting_cancel_choice'
  | 'awaiting_cancel_confirmation'
  | 'awaiting_reschedule_choice'
  | 'awaiting_reschedule_slot'
  | 'consent'
  /**
   * Plan 02 · Task 27 · Decision 4 LOCKED.
   * Step after `consent` (schedule-this-appointment) and before
   * `awaiting_date_time` / `awaiting_slot_selection`. Handler asks
   * "are you OK with this consult being recorded?" and accepts one
   * soft re-pitch before persisting the answer to
   * `recordingConsent` (the appointment row doesn't exist yet; copied onto
   * `appointments.recording_consent_*` in `processSlotSelectionAndPay`).
   */
  | 'recording_consent'
  | 'awaiting_date_time'
  | 'awaiting_slot_selection'
  /** ARM-05: Matcher medium/low — clinic must confirm service before slot link. */
  | 'awaiting_staff_service_confirmation'
  /** rcp-23: returning patient — confirm follow-up for prior catalog service before finalize. */
  | 'awaiting_followup_service_confirmation'
  /** Task 05: LLM flagged mixed unrelated complaints; bot asked patient which one to focus on. */
  | 'awaiting_complaint_clarification';

/** Lifecycle discriminant (rcp-18/19): closed union; idle / non-gating turns use `responded`. */
export type ConversationStage = PatientCollectionStep | 'responded';

/** RBH-06 deprecated on-disk values — normalized to `awaiting_slot_selection` on read. */
export const DEPRECATED_SLOT_STEP_ALIASES = {
  confirming_slot: 'awaiting_slot_selection',
  selecting_slot: 'awaiting_slot_selection',
} as const satisfies Record<string, ConversationStage>;

const CONVERSATION_STAGE_SET = new Set<string>([
  'collecting_all',
  'collecting_name',
  'collecting_phone',
  'collecting_age',
  'collecting_gender',
  'collecting_reason_for_visit',
  'collecting_email',
  'confirm_details',
  'awaiting_match_confirmation',
  'awaiting_cancel_choice',
  'awaiting_cancel_confirmation',
  'awaiting_reschedule_choice',
  'awaiting_reschedule_slot',
  'consent',
  'recording_consent',
  'awaiting_date_time',
  'awaiting_slot_selection',
  'awaiting_staff_service_confirmation',
  'awaiting_followup_service_confirmation',
  'awaiting_complaint_clarification',
  'responded',
]);

export function isConversationStage(value: string): value is ConversationStage {
  return CONVERSATION_STAGE_SET.has(value);
}

/**
 * Map persisted `step` to the closed union. Deprecated slot aliases fold forward;
 * unknown legacy strings become `responded` so in-flight rows are not stranded.
 */
export function normalizePersistedStep(raw: unknown): ConversationStage | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  if (typeof raw !== 'string') return 'responded';
  const alias = DEPRECATED_SLOT_STEP_ALIASES[raw as keyof typeof DEPRECATED_SLOT_STEP_ALIASES];
  if (alias) return alias;
  if (isConversationStage(raw)) return raw;
  return 'responded';
}

/** rcp-15: cancel flow cluster (in-memory; legacy flat keys on disk via writeConversationState). */
export type CancelState = {
  appointmentId?: string;
  pendingAppointmentIds?: string[];
};

/** rcp-15: reschedule flow cluster (in-memory; legacy flat keys on disk via writeConversationState). */
export type RescheduleState = {
  appointmentId?: string;
  pendingAppointmentIds?: string[];
};

/** rcp-16: service catalog match + staff review (in-memory; legacy flat keys on disk). */
export type ServiceMatchState = {
  catalogServiceKey?: string;
  catalogServiceId?: string;
  matcherProposedCatalogServiceKey?: string;
  matcherProposedCatalogServiceId?: string;
  matcherProposedConsultationModality?: 'text' | 'voice' | 'video';
  serviceCatalogMatchConfidence?: ServiceCatalogMatchConfidence;
  serviceCatalogMatchReasonCodes?: string[];
  matcherCandidateLabels?: Array<{ service_key: string; label: string }>;
  pendingStaffServiceReview?: boolean;
  staffServiceReviewRequestId?: string;
  staffServiceReviewDeadlineAt?: string;
  serviceSelectionFinalized?: boolean;
  consultationModality?: 'text' | 'voice' | 'video';
};

/** Legacy flat metadata keys for the serviceMatch cluster (read/write seam only). */
export const SERVICE_MATCH_LEGACY_FIELD_NAMES = [
  'catalogServiceKey',
  'catalogServiceId',
  'matcherProposedCatalogServiceKey',
  'matcherProposedCatalogServiceId',
  'matcherProposedConsultationModality',
  'serviceCatalogMatchConfidence',
  'serviceCatalogMatchReasonCodes',
  'matcherCandidateLabels',
  'pendingStaffServiceReview',
  'staffServiceReviewRequestId',
  'staffServiceReviewDeadlineAt',
  'serviceSelectionFinalized',
  'consultationModality',
] as const satisfies readonly (keyof ServiceMatchState)[];

/**
 * Merge a patch into `state.serviceMatch`; `undefined` values remove keys (JSON omit on persist).
 */
export function mergeServiceMatch(
  state: ConversationState,
  patch: Partial<ServiceMatchState>
): ConversationState {
  const merged: ServiceMatchState = { ...(state.serviceMatch ?? {}) };
  for (const key of SERVICE_MATCH_LEGACY_FIELD_NAMES) {
    if (!(key in patch)) continue;
    const value = patch[key];
    if (value === undefined) {
      delete merged[key];
    } else {
      (merged as Record<string, unknown>)[key] = value;
    }
  }
  if (Object.keys(merged).length === 0) {
    const { serviceMatch: _sm, ...rest } = state;
    return rest;
  }
  return { ...state, serviceMatch: merged };
}

/** rcp-17: recording consent cluster (in-memory; legacy flat keys on disk). */
export type RecordingConsentState = {
  recordingConsentDecision?: boolean;
  recordingConsentVersion?: string;
  recordingConsentRePitched?: boolean;
};

export const RECORDING_CONSENT_LEGACY_FIELD_NAMES = [
  'recordingConsentDecision',
  'recordingConsentVersion',
  'recordingConsentRePitched',
] as const satisfies readonly (keyof RecordingConsentState)[];

/** rcp-17: idle medical deflection / fee triage (in-memory; legacy flat keys on disk). */
export type TriageState = {
  lastMedicalDeflectionAt?: string;
  reasonFirstTriagePhase?: ReasonFirstTriagePhase;
  postMedicalConsultFeeAckSent?: boolean;
  activeFlow?: ConversationActiveFlow;
};

export const TRIAGE_LEGACY_FIELD_NAMES = [
  'lastMedicalDeflectionAt',
  'reasonFirstTriagePhase',
  'postMedicalConsultFeeAckSent',
  'activeFlow',
] as const satisfies readonly (keyof TriageState)[];

/** rcp-17: mixed-complaints clarification (in-memory; legacy flat keys on disk). */
export type ClarificationState = {
  /** May contain PHI — same posture as `reasonForVisit`. */
  originalReasonForVisit?: string;
  /** May contain PHI — do NOT log at `info`. */
  pendingClarificationConcerns?: string[];
  complaintClarificationAttemptCount?: number;
  complaintClarificationRequestedAt?: string;
  complaintClarificationFallbackMatch?: {
    catalogServiceKey: string;
    catalogServiceId?: string;
    consultationModality?: 'text' | 'voice' | 'video';
    confidence: ServiceCatalogMatchConfidence;
    candidateLabels?: Array<{ service_key: string; label: string }>;
  };
};

export const CLARIFICATION_LEGACY_FIELD_NAMES = [
  'originalReasonForVisit',
  'pendingClarificationConcerns',
  'complaintClarificationAttemptCount',
  'complaintClarificationRequestedAt',
  'complaintClarificationFallbackMatch',
] as const satisfies readonly (keyof ClarificationState)[];

type ConversationNamespaceKey =
  | 'recordingConsent'
  | 'triage'
  | 'clarification'
  | 'booking'
  | 'bookingForOther';

function mergeNamespacePatch<NS extends Record<string, unknown>>(
  state: ConversationState,
  namespaceKey: ConversationNamespaceKey,
  fieldNames: readonly (keyof NS & string)[],
  patch: Partial<NS>
): ConversationState {
  const merged = { ...(state[namespaceKey] ?? {}) } as NS;
  for (const key of fieldNames) {
    if (!(key in patch)) continue;
    const value = patch[key];
    if (value === undefined) {
      delete merged[key];
    } else {
      (merged as Record<string, unknown>)[key] = value;
    }
  }
  if (Object.keys(merged).length === 0) {
    const { [namespaceKey]: _removed, ...rest } = state;
    return rest;
  }
  return { ...state, [namespaceKey]: merged };
}

export function mergeRecordingConsent(
  state: ConversationState,
  patch: Partial<RecordingConsentState>
): ConversationState {
  return mergeNamespacePatch(state, 'recordingConsent', RECORDING_CONSENT_LEGACY_FIELD_NAMES, patch);
}

export function mergeTriage(state: ConversationState, patch: Partial<TriageState>): ConversationState {
  return mergeNamespacePatch(state, 'triage', TRIAGE_LEGACY_FIELD_NAMES, patch);
}

export function mergeClarification(
  state: ConversationState,
  patch: Partial<ClarificationState>
): ConversationState {
  return mergeNamespacePatch(state, 'clarification', CLARIFICATION_LEGACY_FIELD_NAMES, patch);
}

/** rcp-18: booking / collection cluster (in-memory; legacy flat keys on disk). */
export type BookingState = {
  /** May contain PHI — preserved for appointment.reason_for_visit at booking. */
  reasonForVisit?: string;
  /** May contain PHI — optional patient extras for appointment.notes. */
  extraNotes?: string;
  age?: number;
  /** Channel pick: teleconsult modality or in_clinic (consultationModality stays in serviceMatch). */
  consultationType?: 'video' | 'in_clinic' | 'text' | 'voice';
  slotToConfirm?: { start: string; end: string; dateStr: string };
  slotSelectionDate?: string;
  bookingLinkSentAt?: string;
  bookingReminderSent?: boolean;
  lastBookingPatientId?: string;
  consent_requested_at?: string;
};

export const BOOKING_LEGACY_FIELD_NAMES = [
  'reasonForVisit',
  'extraNotes',
  'age',
  'consultationType',
  'slotToConfirm',
  'slotSelectionDate',
  'bookingLinkSentAt',
  'bookingReminderSent',
  'lastBookingPatientId',
  'consent_requested_at',
] as const satisfies readonly (keyof BookingState)[];

/** rcp-18: book-for-someone-else / patient-match cluster (in-memory; legacy flat keys on disk). */
export type BookingForOtherState = {
  bookingForSomeoneElse?: boolean;
  relation?: string;
  bookingForPatientId?: string;
  pendingSelfBooking?: boolean;
  pendingOtherBooking?: { relation: string };
  pendingMatchPatientIds?: string[];
};

export const BOOKING_FOR_OTHER_LEGACY_FIELD_NAMES = [
  'bookingForSomeoneElse',
  'relation',
  'bookingForPatientId',
  'pendingSelfBooking',
  'pendingOtherBooking',
  'pendingMatchPatientIds',
] as const satisfies readonly (keyof BookingForOtherState)[];

export function mergeBooking(
  state: ConversationState,
  patch: Partial<BookingState>
): ConversationState {
  return mergeNamespacePatch(state, 'booking', BOOKING_LEGACY_FIELD_NAMES, patch);
}

export function mergeBookingForOther(
  state: ConversationState,
  patch: Partial<BookingForOtherState>
): ConversationState {
  return mergeNamespacePatch(state, 'bookingForOther', BOOKING_FOR_OTHER_LEGACY_FIELD_NAMES, patch);
}

/** Read lifecycle step (alias over `step`). */
export function stageOf(state: ConversationState): ConversationStage | undefined {
  return state.step;
}

/** Set lifecycle step; `undefined` removes `step` from state. */
export function setStage(
  state: ConversationState,
  stage: ConversationStage | undefined
): ConversationState {
  if (stage === undefined) {
    const { step: _removed, ...rest } = state;
    return rest;
  }
  return { ...state, step: stage };
}

/**
 * Conversation state stored in conversations.metadata.
 * No PHI; safe for audit and logging (field names only).
 */
export interface ConversationState {
  /** Last detected intent (for context in next turn) */
  lastIntent?: Intent;
  /** Current step in flow (e.g. collecting_name, consent, awaiting_slot_selection, responded) */
  step?: ConversationStage;
  /**
   * RBH-07: Which gated prompt we last showed (details, consent, confirm, match, cancel yes/no).
   * Refreshed from `step` when the DM handler persists state; optional on legacy conversations.
   */
  lastPromptKind?: ConversationLastPromptKind;
  /** Collected data keys only (no values; values are PHI - stored in memory/Redis until Task 5) */
  collectedFields?: string[];
  /** Timestamp of last state update (ISO string) */
  updatedAt?: string;
  /** rcp-16: Catalog match, staff review, finalized selection. */
  serviceMatch?: ServiceMatchState;
  /** rcp-18: Booking / collection fields. */
  booking?: BookingState;
  /** rcp-18: Book-for-someone-else / patient-match. */
  bookingForOther?: BookingForOtherState;
  /** rcp-15: Cancel flow — appointment pick + confirmation. */
  cancel?: CancelState;
  /** rcp-15: Reschedule flow — appointment pick + slot link. */
  reschedule?: RescheduleState;
  /** rcp-17: Recording consent stash until appointment row exists. */
  recordingConsent?: RecordingConsentState;
  /** rcp-17: Idle medical deflection / fee triage. */
  triage?: TriageState;
  /** rcp-17: Mixed-complaints clarification. */
  clarification?: ClarificationState;
}

/** e-task-dm-03: TTL for treating `lastMedicalDeflectionAt` as active routing memory. */
export const MEDICAL_DEFLECTION_CONTEXT_TTL_MS = 48 * 60 * 60 * 1000;

export function isRecentMedicalDeflectionWindow(
  state: ConversationState,
  nowMs: number = Date.now()
): boolean {
  const raw = state.triage?.lastMedicalDeflectionAt;
  if (!raw) return false;
  const t = Date.parse(raw);
  if (Number.isNaN(t)) return false;
  return nowMs - t <= MEDICAL_DEFLECTION_CONTEXT_TTL_MS;
}

/** ARM-05: Block booking/slot CTAs until staff resolves (ARM-06/07) or high-confidence path finalized. */
export function isSlotBookingBlockedPendingStaffReview(state: ConversationState): boolean {
  const sm = state.serviceMatch;
  return sm?.pendingStaffServiceReview === true && sm?.serviceSelectionFinalized !== true;
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
    matcherCandidateLabels?: Array<{ service_key: string; label: string }>;
  }
): ConversationState {
  const sm = state.serviceMatch ?? {};
  const patch: Partial<ServiceMatchState> = {
    matcherProposedCatalogServiceKey: proposal.matcherProposedCatalogServiceKey,
    serviceCatalogMatchConfidence: proposal.serviceCatalogMatchConfidence,
  };

  if (proposal.matcherCandidateLabels !== undefined) {
    patch.matcherCandidateLabels = proposal.matcherCandidateLabels;
  }
  if (proposal.matcherProposedCatalogServiceId !== undefined) {
    patch.matcherProposedCatalogServiceId = proposal.matcherProposedCatalogServiceId;
  }
  if (proposal.matcherProposedConsultationModality !== undefined) {
    patch.matcherProposedConsultationModality = proposal.matcherProposedConsultationModality;
  }
  if (proposal.serviceCatalogMatchReasonCodes?.length) {
    patch.serviceCatalogMatchReasonCodes = [
      ...new Set([
        ...(sm.serviceCatalogMatchReasonCodes ?? []),
        ...proposal.serviceCatalogMatchReasonCodes,
      ]),
    ];
  }
  if (proposal.pendingStaffServiceReview !== undefined) {
    patch.pendingStaffServiceReview = proposal.pendingStaffServiceReview;
  }
  if (proposal.staffServiceReviewRequestId !== undefined) {
    patch.staffServiceReviewRequestId = proposal.staffServiceReviewRequestId;
  }
  if (proposal.staffServiceReviewDeadlineAt !== undefined) {
    patch.staffServiceReviewDeadlineAt = proposal.staffServiceReviewDeadlineAt;
  }

  if (proposal.finalizeSelection) {
    patch.catalogServiceKey = proposal.matcherProposedCatalogServiceKey;
    if (proposal.matcherProposedCatalogServiceId !== undefined) {
      patch.catalogServiceId = proposal.matcherProposedCatalogServiceId;
    }
    if (proposal.matcherProposedConsultationModality !== undefined) {
      patch.consultationModality = proposal.matcherProposedConsultationModality;
    }
    patch.serviceSelectionFinalized = true;
    patch.pendingStaffServiceReview = false;
    patch.staffServiceReviewRequestId = undefined;
    patch.staffServiceReviewDeadlineAt = undefined;
    patch.matcherCandidateLabels = undefined;
  }

  return mergeServiceMatch(state, patch);
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
  const sm = state.serviceMatch ?? {};
  const mergedCodes = [
    ...new Set([...(sm.serviceCatalogMatchReasonCodes ?? []), ...(final.reasonCodesAppend ?? [])]),
  ];
  const patch: Partial<ServiceMatchState> = {
    catalogServiceKey: final.catalogServiceKey,
    serviceSelectionFinalized: true,
    pendingStaffServiceReview: false,
    staffServiceReviewRequestId: undefined,
    staffServiceReviewDeadlineAt: undefined,
    serviceCatalogMatchConfidence: 'high',
    serviceCatalogMatchReasonCodes: mergedCodes.length > 0 ? mergedCodes : undefined,
  };

  if (final.catalogServiceId !== undefined) {
    patch.catalogServiceId = final.catalogServiceId;
  }
  if (final.consultationModality !== undefined) {
    patch.consultationModality = final.consultationModality;
  }

  if (final.clearProposal) {
    patch.matcherProposedCatalogServiceKey = undefined;
    patch.matcherProposedCatalogServiceId = undefined;
    patch.matcherProposedConsultationModality = undefined;
    patch.matcherCandidateLabels = undefined;
  }

  return mergeServiceMatch(state, patch);
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
  const sm = state.serviceMatch ?? {};
  const mergedCodes = [...new Set([...(sm.serviceCatalogMatchReasonCodes ?? []), reasonCode])];
  return {
    ...mergeServiceMatch(state, {
      pendingStaffServiceReview: false,
      staffServiceReviewRequestId: undefined,
      staffServiceReviewDeadlineAt: undefined,
      serviceCatalogMatchReasonCodes: mergedCodes,
    }),
    step: state.step === 'awaiting_staff_service_confirmation' ? 'responded' : state.step,
    lastPromptKind:
      state.step === 'awaiting_staff_service_confirmation' ? undefined : state.lastPromptKind,
    updatedAt: new Date().toISOString(),
  };
}
