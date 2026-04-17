/**
 * Task 05: Mixed-complaint clarification copy + gating predicate.
 *
 * When the LLM matcher flags `mixed_complaints: true` with low confidence and the catalog has
 * multiple real (non catch-all) services, we ask the patient to narrow down their primary concern
 * BEFORE we book or escalate to staff review. This module owns:
 *  - `shouldRequestComplaintClarification` — pure, unit-testable gating predicate
 *  - `resolveComplaintClarificationMessage` — locale-aware copy, reusing the safety-message
 *    locale detector so Hinglish / Hindi / Punjabi patients get a reply in their own script/romanization
 *
 * **No PHI** lives in this module. Copy is generic ("which concern") and never echoes patient text.
 * Locale detection is deterministic (no LLM), same pattern as `safety-messages.ts`.
 */

import { detectSafetyMessageLocale, type SafetyMessageLocale } from './safety-messages';
import { CATALOG_CATCH_ALL_SERVICE_KEY } from './service-catalog-schema';
import type { ServiceCatalogV1 } from './service-catalog-schema';
import type { ServiceCatalogMatchConfidence } from '../types/conversation';
import { isSingleFeeMode } from './catalog-mode-guard';
import type { CatalogMode } from '../types/doctor-settings';

/** Task 05: hard cap on clarification rounds (task breakdown §5.3 / doc Implementation Plan). */
export const COMPLAINT_CLARIFICATION_MAX_ATTEMPTS = 1;

/** English default (exported for logs / fallback). */
export const COMPLAINT_CLARIFICATION_RESPONSE_EN =
  "You've mentioned a few concerns. Which one would you like to consult about first? We can address the others in a follow-up visit.";

const COMPLAINT_CLARIFICATION_BY_LOCALE: Record<SafetyMessageLocale, string> = {
  en: COMPLAINT_CLARIFICATION_RESPONSE_EN,
  hi: 'आपने कई चीज़ें बताई हैं। पहले किसके लिए डॉक्टर से बात करना चाहेंगे? बाकी के लिए फ़ॉलो-अप में देख लेंगे।',
  pa: 'ਤੁਸੀਂ ਕਈ ਗੱਲਾਂ ਦੱਸੀਆਂ ਹਨ। ਪਹਿਲਾਂ ਕਿਸ ਲਈ ਡਾਕਟਰ ਨਾਲ ਗੱਲ ਕਰਨੀ ਚਾਹੋਗੇ? ਬਾਕੀ ਲਈ ਫਾਲੋ-ਅੱਪ ਵਿਜ਼ਟ ਰੱਖ ਲਵਾਂਗੇ।',
};

/** Roman Hindi (Hinglish without Devanagari). */
const COMPLAINT_CLARIFICATION_LATIN_HI =
  'Aapne kai concerns bataaye hain. Pehle kis ke liye consult karna chahenge? Baaki ke liye follow-up appointment rakh lenge.';

/** Roman Punjabi. */
const COMPLAINT_CLARIFICATION_LATIN_PA =
  'Tussi kai concerns dasse ne. Pehlan kis layi consult karna chahoge? Baaki layi follow-up appointment rakh laange.';

/**
 * Locale-aware clarification copy. Reuses `detectSafetyMessageLocale` so we stay consistent with
 * every other patient-facing guardrail reply.
 */
export function resolveComplaintClarificationMessage(userText: string): string {
  const locale = detectSafetyMessageLocale(userText);
  const hasDevanagari = /[\u0900-\u097F]/.test(userText);
  const hasGurmukhi = /[\u0A00-\u0A7F]/.test(userText);
  if (locale === 'hi' && !hasDevanagari) return COMPLAINT_CLARIFICATION_LATIN_HI;
  if (locale === 'pa' && !hasGurmukhi) return COMPLAINT_CLARIFICATION_LATIN_PA;
  return COMPLAINT_CLARIFICATION_BY_LOCALE[locale];
}

/** How many non-catch-all services live in the catalog. Used by the gating predicate. */
export function countRealCatalogServices(catalog: ServiceCatalogV1): number {
  return catalog.services.filter(
    (s) => s.service_key.trim().toLowerCase() !== CATALOG_CATCH_ALL_SERVICE_KEY
  ).length;
}

/**
 * Inputs the gating predicate needs. Kept minimal so the webhook handler can assemble it without
 * dragging the whole match result / state object across the module boundary.
 */
export interface ComplaintClarificationGateInput {
  /** LLM advisory flag. `false` from deterministic / fallback paths is always ineligible. */
  mixedComplaints: boolean;
  /** Matcher confidence for the current proposal. Only `low` is eligible for clarification. */
  confidence: ServiceCatalogMatchConfidence;
  /** Catalog available to this doctor. */
  catalog: ServiceCatalogV1;
  /**
   * Whether staff service review is already pending for this conversation. If true, we do **not**
   * stack clarification on top — staff will resolve (task breakdown §5.4).
   */
  pendingStaffServiceReview: boolean;
  /** How many clarification rounds we've already shown for the **current** event. */
  attemptCount: number;
  /**
   * Task 10 (Plan 03): doctor's `catalog_mode`. When `'single_fee'` the predicate short-circuits —
   * the synthetic consultation catalog has exactly one service and clarification is meaningless.
   * `null`/`'multi_service'` keep the pre-Task-10 behavior (covered today by
   * `countRealCatalogServices > 1`). Optional so existing tests / callers compile unchanged.
   */
  catalogMode?: CatalogMode | null;
}

/**
 * Pure predicate: do we ask the patient to narrow down their mixed complaints?
 *
 * Gating rules (task breakdown §5.1–5.4):
 *  - LLM must have set `mixed_complaints: true`
 *  - Matcher confidence must be `low` (high/medium → the matcher is sure enough, proceed)
 *  - Catalog must have >1 real (non catch-all) service
 *  - Staff review must not already be pending
 *  - We must not have exceeded the attempt cap (`COMPLAINT_CLARIFICATION_MAX_ATTEMPTS`)
 */
export function shouldRequestComplaintClarification(
  input: ComplaintClarificationGateInput
): boolean {
  // Task 10 (Plan 03): single-fee doctors have a synthetic one-entry catalog — nothing to
  // disambiguate. Caller emits `clarification.skip.single_fee` breadcrumb.
  if (isSingleFeeMode(input.catalogMode)) return false;
  if (!input.mixedComplaints) return false;
  if (input.confidence !== 'low') return false;
  if (input.pendingStaffServiceReview) return false;
  if (input.attemptCount >= COMPLAINT_CLARIFICATION_MAX_ATTEMPTS) return false;
  return countRealCatalogServices(input.catalog) > 1;
}
