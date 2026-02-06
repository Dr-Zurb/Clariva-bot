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
 * - unknown: Could not classify or fallback
 */
export type Intent =
  | 'book_appointment'
  | 'ask_question'
  | 'check_availability'
  | 'greeting'
  | 'cancel_appointment'
  | 'revoke_consent'
  | 'unknown';

/**
 * Const array of valid intent values for runtime validation.
 * Use for Zod schema, membership checks, or mapping API responses to Intent.
 * Single source of truth for "what intents exist".
 */
export const INTENT_VALUES: readonly Intent[] = [
  'book_appointment',
  'ask_question',
  'check_availability',
  'greeting',
  'cancel_appointment',
  'revoke_consent',
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

/**
 * Result of intent detection: intent plus optional confidence.
 * Used by ai-service (Task 2) return type.
 */
export interface IntentDetectionResult {
  intent: Intent;
  confidence: ConfidenceScore;
}
