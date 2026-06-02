/**
 * RBH-20: Narrow routing resolver for **golden fixtures** only.
 * Mirrors the **early** branches of `instagram-dm-webhook-handler` in the same order
 * for documented scenarios. Extend when adding fixture files — not a full simulator.
 */

import type { DmHandlerBranch } from '../types/dm-instrumentation';
import type { Intent } from '../types/ai';

/** Redacted fixture input — no user message text (use flags derived from tests). */
export interface DmRoutingFixtureWhen {
  intent: Intent;
  /** Pattern / classifier: user message is emergency */
  treat_as_emergency?: boolean;
  in_collection?: boolean;
  /** `signalsFeePricing` — RBH-18 + keywords */
  signals_fee_pricing?: boolean;
  user_explicit_book?: boolean;
  /** `!state.step || state.step === 'responded'` */
  idle_responded?: boolean;
  /** Misclassified pricing as book with empty collection */
  book_misclassified_pricing_only?: boolean;
  /** Fresh book intent — empty collection (`justStartingCollection`) */
  just_starting_collection?: boolean;
  /** rcp-22: returning patient memory — demographics on file */
  returning_memory_ready?: boolean;
  /** rcp-22: reason_for_visit already in conversation state */
  reason_for_visit_in_state?: boolean;
  /** rcp-23: follow-up confirm reply on awaiting_followup_service_confirmation */
  returning_followup_reply?: 'accept' | 'decline' | 'offer';
}

/**
 * First-match routing for fixtures (subset of production tree).
 */
export function resolveRoutingBranchForFixture(when: DmRoutingFixtureWhen): DmHandlerBranch {
  if (when.treat_as_emergency || when.intent === 'emergency') {
    return 'emergency_safety';
  }
  if (when.intent === 'medical_query' && !when.in_collection) {
    return 'medical_safety';
  }
  if (
    when.signals_fee_pricing &&
    !when.user_explicit_book &&
    when.in_collection
  ) {
    return 'fee_deterministic_mid_collection';
  }
  if (
    when.signals_fee_pricing &&
    !when.user_explicit_book &&
    when.idle_responded
  ) {
    return 'fee_deterministic_idle';
  }
  if (when.book_misclassified_pricing_only) {
    return 'fee_book_misclassified_idle';
  }
  if (
    when.intent === 'book_appointment' &&
    when.just_starting_collection &&
    when.returning_memory_ready
  ) {
    if (when.reason_for_visit_in_state) {
      return 'booking_start_returning_ready';
    }
    return 'booking_start_returning_reason';
  }
  if (when.returning_followup_reply === 'accept') {
    return 'returning_followup_confirm_accept';
  }
  if (when.returning_followup_reply === 'decline') {
    return 'returning_followup_confirm_decline';
  }
  if (when.returning_followup_reply === 'offer') {
    return 'returning_followup_confirm_offer';
  }
  if (when.intent === 'greeting' && !when.in_collection && when.idle_responded) {
    return 'greeting_template';
  }
  return 'unknown';
}
