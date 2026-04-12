/**
 * AI and Intent Type Definitions
 *
 * Types for the receptionist bot's intent classification and AI usage.
 * No business logic; pure types only. Used by services (e.g. intent detection)
 * and for runtime validation (INTENT_VALUES).
 *
 * Intent set is MVP-aligned; extendable (e.g. reschedule_appointment) without
 * breaking existing code.
 */

// ============================================================================
// Intent Types
// ============================================================================

/**
 * Valid intents for the receptionist bot (user message classification).
 * - book_appointment: User wants to book a visit
 * - ask_question: User has a general question
 * - check_availability: User wants to know when the doctor is free
 * - greeting: User said hello / small talk
 * - cancel_appointment: User wants to cancel (basic)
 * - revoke_consent: User wants to delete data or revoke consent (e-task-5)
 * - medical_query: User presents symptoms, chief complaints, asks for advice (redirect to doctor)
 * - emergency: Urgent/emergency language (redirect to emergency services)
 * - check_appointment_status: User asks if appointment is confirmed, when is visit
 * - book_for_someone_else: User wants to book for another person (e.g. "book for my mother")
 * - reschedule_appointment: User wants to change date/time of existing appointment
 * - unknown: Could not classify or fallback
 */
export type Intent =
  | 'book_appointment'
  | 'book_for_someone_else'
  | 'ask_question'
  | 'check_availability'
  | 'greeting'
  | 'cancel_appointment'
  | 'reschedule_appointment'
  | 'revoke_consent'
  | 'medical_query'
  | 'emergency'
  | 'check_appointment_status'
  | 'unknown';

/**
 * Const array of valid intent values for runtime validation.
 * Use for Zod schema, membership checks, or mapping API responses to Intent.
 * Single source of truth for "what intents exist".
 */
export const INTENT_VALUES: readonly Intent[] = [
  'book_appointment',
  'book_for_someone_else',
  'ask_question',
  'check_availability',
  'greeting',
  'cancel_appointment',
  'reschedule_appointment',
  'revoke_consent',
  'medical_query',
  'emergency',
  'check_appointment_status',
  'unknown',
] as const;

/**
 * Type guard: checks if a string is a valid Intent.
 */
export function isIntent(value: string): value is Intent {
  return (INTENT_VALUES as readonly string[]).includes(value);
}

/**
 * Maps a string to Intent; returns 'unknown' if not valid.
 * Use when parsing AI or external input.
 */
export function toIntent(value: string): Intent {
  return isIntent(value) ? value : 'unknown';
}

// ============================================================================
// Confidence and Result Types (for Task 2)
// ============================================================================

/**
 * Confidence score for intent classification (0–1).
 * Used by intent detection service to indicate classification certainty.
 */
export type ConfidenceScore = number;

/** RBH-18: Optional sub-topics from the classifier (any language; no regex growth). */
export type IntentTopic = 'pricing' | 'hours' | 'location' | 'booking_howto';

export const INTENT_TOPIC_VALUES: readonly IntentTopic[] = [
  'pricing',
  'hours',
  'location',
  'booking_howto',
] as const;

export function isIntentTopic(value: string): value is IntentTopic {
  return (INTENT_TOPIC_VALUES as readonly string[]).includes(value);
}

/** e-task-dm-06: classifier granularity for pricing DM routing (Understand layer). */
export type PricingSignalKind =
  | 'amount_seeking'
  | 'payment_existence'
  | 'generic_fee_interest'
  | 'none';

export const PRICING_SIGNAL_KIND_VALUES: readonly PricingSignalKind[] = [
  'amount_seeking',
  'payment_existence',
  'generic_fee_interest',
  'none',
] as const;

export function isPricingSignalKind(value: string): value is PricingSignalKind {
  return (PRICING_SIGNAL_KIND_VALUES as readonly string[]).includes(value);
}

/**
 * Result of intent detection: intent plus optional confidence.
 * Used by ai-service (Task 2) return type.
 *
 * RBH-18: `topics` + `is_fee_question` — from LLM JSON when available; omit on regex-only paths.
 */
export interface IntentDetectionResult {
  intent: Intent;
  confidence: ConfidenceScore;
  /** Classifier: user asking about cost/fees/charges/money/payment in any language */
  is_fee_question?: boolean;
  /** Classifier: thematic buckets (may be empty array from model) */
  topics?: IntentTopic[];
  /** e-task-dm-06: payment vs amount vs generic fee wording (trusted when confidence ≥ threshold) */
  pricing_signal_kind?: PricingSignalKind;
  /** e-task-dm-06: short follow-up continuing a fee/payment thread */
  fee_thread_continuation?: boolean;
  /**
   * e-task-dm-07: User is done listing visit concerns / nothing more to add before fee (natural language).
   * Set by classifier when assistant asked "anything else" before fee; mutually exclusive with fee_thread_continuation in merge.
   */
  reason_first_done_adding?: boolean;
}

// ============================================================================
// Comment Intent Types (e-task-6 — Instagram comment classification)
// ============================================================================

/**
 * Valid intents for Instagram comment classification.
 * High-intent (reply + DM): book_appointment, check_availability, pricing_inquiry, general_inquiry, medical_query
 * Low-intent (store only): greeting, praise, other
 * Skip (no storage): spam, joke, unrelated, vulgar
 */
export type CommentIntent =
  | 'book_appointment'
  | 'check_availability'
  | 'pricing_inquiry'
  | 'general_inquiry'
  | 'medical_query'
  | 'greeting'
  | 'praise'
  | 'spam'
  | 'joke'
  | 'unrelated'
  | 'vulgar'
  | 'other';

export const COMMENT_INTENT_VALUES: readonly CommentIntent[] = [
  'book_appointment',
  'check_availability',
  'pricing_inquiry',
  'general_inquiry',
  'medical_query',
  'greeting',
  'praise',
  'spam',
  'joke',
  'unrelated',
  'vulgar',
  'other',
] as const;

export function isCommentIntent(value: string): value is CommentIntent {
  return (COMMENT_INTENT_VALUES as readonly string[]).includes(value);
}

export function toCommentIntent(value: string): CommentIntent {
  return isCommentIntent(value) ? value : 'other';
}

export interface CommentIntentDetectionResult {
  intent: CommentIntent;
  confidence: ConfidenceScore;
}
