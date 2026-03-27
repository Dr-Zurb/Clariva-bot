/**
 * Conversation State Types (e-task-3)
 *
 * State shape for multi-turn flow. Stored in conversations.metadata (no PHI).
 * Used for flow control (e.g. current intent, step) and response generation.
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
  /** RBH-13: Last assistant turn was a structured fee quote (not collecting PHI). */
  | 'fee_quote';

/** RBH-13: Sub-flow stored in metadata alongside `step`. */
export type ConversationActiveFlow = 'fee_quote';

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
  return undefined;
}

/**
 * Collection step values (e-task-4). No PHI; only step and field names in metadata.
 * RBH-06: `confirming_slot` / `selecting_slot` are deprecated — use `awaiting_slot_selection`.
 */
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
}
