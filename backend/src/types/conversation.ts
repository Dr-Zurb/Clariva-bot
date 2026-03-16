/**
 * Conversation State Types (e-task-3)
 *
 * State shape for multi-turn flow. Stored in conversations.metadata (no PHI).
 * Used for flow control (e.g. current intent, step) and response generation.
 */

import type { Intent } from './ai';

/**
 * Collection step values (e-task-4). No PHI; only step and field names in metadata.
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
  /** Current step in flow (e.g. collecting_name, consent, selecting_slot, responded) */
  step?: string;
  /** Collected data keys only (no values; values are PHI - stored in memory/Redis until Task 5) */
  collectedFields?: string[];
  /** Timestamp of last state update (ISO string) */
  updatedAt?: string;
  /** When consent was first requested (ISO string); set when transitioning to step consent */
  consent_requested_at?: string;
  /** Date (YYYY-MM-DD) for slot selection; set when entering selecting_slot (e-task-3) */
  slotSelectionDate?: string;
  /** Consultation type chosen: video or in_clinic (e-task-2); used at booking */
  consultationType?: 'video' | 'in_clinic';
  /** Slot offered for confirmation (e-task-2); when step is confirming_slot */
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
}
