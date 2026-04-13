/**
 * RBH-20: Structured routing labels for Instagram DM handler (observability + golden tests).
 * No PHI — branch names and intent metadata only.
 */

import type { Intent, IntentTopic } from './ai';

/**
 * Which **terminal** reply path ran for this DM turn (aligns with `instagram-dm-webhook-handler` order).
 * Prefer stable snake_case values for log aggregations.
 */
export type DmHandlerBranch =
  | 'revoke_consent'
  | 'receptionist_paused'
  | 'cancel_flow_numeric'
  | 'cancel_flow_confirm'
  | 'reschedule_flow_numeric'
  | 'emergency_safety'
  | 'medical_safety'
  /** e-task-dm-04b: Short “consultations are paid” after deflection (no fee table yet) */
  | 'post_medical_payment_existence_ack'
  | 'fee_deterministic_idle'
  /** e-task-dm-05: fee signal came from short follow-up (“what is it?”) after bot mentioned fee/payment */
  | 'fee_follow_up_anaphora_idle'
  /** Competing NCD vs acute/general signals — staff assigns visit type (no multi-tier fee menu for patient). */
  | 'fee_ambiguous_visit_type_staff'
  /** Ask-more: user asked pricing before confirm — bridge copy, stay in ask_more */
  | 'reason_first_triage_ask_more_payment_bridge'
  /** e-task-dm-09: bare "yes" after "anything else?" — ask what to add, stay in ask_more */
  | 'reason_first_triage_ask_more_ambiguous_yes'
  /** e-task-dm-04: deferred full catalog — ask-more copy */
  | 'reason_first_triage_ask_more'
  /** e-task-dm-04: confirm / clarify / replay consolidated reason */
  | 'reason_first_triage_confirm'
  /** e-task-dm-04: fee quote after confirm yes (narrow when matcher resolves one row) */
  | 'reason_first_triage_fee_narrow'
  | 'fee_deterministic_mid_collection'
  | 'greeting_template'
  | 'check_appointment_status'
  | 'cancel_appointment_intent'
  | 'reschedule_appointment_intent'
  | 'book_for_someone_else'
  | 'patient_match_confirmation'
  | 'consent_flow'
  | 'staff_service_review_pending'
  /** learn-05: enabled autobook policy matched; staff review row skipped */
  | 'learning_policy_autobook'
  | 'consultation_channel_pick'
  /** Channel chosen but clinical thread needs reason-first before collecting_all / AI intake */
  | 'consultation_channel_pick_reason_first'
  | 'booking_collection'
  /** After 112/108, patient reports stable / non-crisis vitals — resume toward teleconsult booking (AI) */
  | 'booking_resume_after_emergency'
  | 'confirm_details'
  | 'post_booking_ack'
  | 'fee_book_misclassified_idle'
  | 'booking_start_ai'
  /** Fresh book intent with clinical thread — reason-first gate before collection */
  | 'booking_start_reason_first'
  | 'booking_continue_ai'
  | 'slot_selection'
  | 'book_responded'
  /** book_appointment while step responded — clinical thread needs reason-first before deterministic intake */
  | 'book_responded_reason_first'
  | 'ai_open_response'
  /** Should not appear in production — indicates a missed assignment */
  | 'unknown'
  /** Conflict recovery path re-runs generateResponse */
  | 'conflict_recovery_ai';

export interface InstagramDmRoutingLogFields {
  correlationId: string;
  eventId: string;
  doctorId: string;
  conversationId: string;
  branch: DmHandlerBranch;
  intent: Intent;
  intent_topics?: IntentTopic[];
  is_fee_question?: boolean;
  state_step_before: string | null;
  state_step_after: string | null;
  greeting_fast_path?: boolean;
}
