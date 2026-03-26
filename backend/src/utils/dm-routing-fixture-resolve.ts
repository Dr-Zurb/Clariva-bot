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
  if (when.intent === 'greeting' && !when.in_collection && when.idle_responded) {
    return 'greeting_template';
  }
  return 'unknown';
}
