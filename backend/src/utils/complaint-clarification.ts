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
 * Task 09 (Plan 04): render cap on the numbered list. Must match
 * `SERVICE_MATCH_MAX_CONCERNS` in `service-catalog-matcher.ts`; we re-declare the number
 * locally so this copy module has no import cycle against the matcher.
 */
const CLARIFICATION_NUMBERED_MIN_ITEMS = 2;
const CLARIFICATION_NUMBERED_MAX_ITEMS = 5;

/**
 * Per-locale copy scaffolding for the numbered-list variant of the clarification message
 * (Task 09). Only the `intro` + `ctaTemplate` are localized — the concern labels themselves
 * are rendered verbatim as English noun-phrases (what the matcher emitted). Localized
 * concern labels are a matcher-quality concern, not a copy concern (per task doc's "English
 * concerns in all locales for now" design constraint).
 *
 * `ctaTemplate` uses a single token placeholder — `{choices}` — which is substituted with the
 * locale's grammatical list of valid numeric replies (e.g. `"**1**, **2**, or **3**"`). This
 * keeps the translator surface tiny: each locale owns ONE sentence, not one sentence per N.
 */
interface ClarificationNumberedLocaleCopy {
  readonly intro: string;
  readonly ctaTemplate: string;
  /** Joins 2+ numeric choices (`**1**, **2**, or **3**`). Caller renders each bolded number. */
  readonly joinChoices: (choices: readonly string[]) => string;
}

function joinEnglishChoices(choices: readonly string[]): string {
  if (choices.length === 0) return '';
  if (choices.length === 1) return choices[0]!;
  if (choices.length === 2) return `${choices[0]} or ${choices[1]}`;
  return `${choices.slice(0, -1).join(', ')}, or ${choices[choices.length - 1]}`;
}

function joinHindiDevanagariChoices(choices: readonly string[]): string {
  if (choices.length === 0) return '';
  if (choices.length === 1) return choices[0]!;
  if (choices.length === 2) return `${choices[0]} या ${choices[1]}`;
  // Oxford-style: "1, 2, या 3"
  return `${choices.slice(0, -1).join(', ')}, या ${choices[choices.length - 1]}`;
}

function joinPunjabiGurmukhiChoices(choices: readonly string[]): string {
  if (choices.length === 0) return '';
  if (choices.length === 1) return choices[0]!;
  if (choices.length === 2) return `${choices[0]} ਜਾਂ ${choices[1]}`;
  return `${choices.slice(0, -1).join(', ')}, ਜਾਂ ${choices[choices.length - 1]}`;
}

/**
 * Task 09: Locale-specific templates for the numbered-list shape. English is the source of
 * truth for format — see the task doc target shape. Non-English locales mirror the structure
 * (intro / list / CTA with explicit numeric reply guidance) and reuse the same `**N.** {label}`
 * Markdown convention since Instagram DM renders bold identically across scripts.
 */
const CLARIFICATION_NUMBERED_BY_LOCALE: Record<
  'en' | 'hi' | 'pa' | 'latin-hi' | 'latin-pa',
  ClarificationNumberedLocaleCopy
> = {
  en: {
    intro: "You've mentioned a few concerns:",
    ctaTemplate:
      'Which one is the main reason for this visit? Reply {choices} — we can handle the rest in a follow-up.',
    joinChoices: joinEnglishChoices,
  },
  hi: {
    intro: 'आपने कई चीज़ें बताई हैं:',
    ctaTemplate: 'इस विज़िट का मुख्य कारण कौन-सा है? {choices} भेजें — बाकी के लिए फ़ॉलो-अप रख लेंगे।',
    joinChoices: joinHindiDevanagariChoices,
  },
  pa: {
    intro: 'ਤੁਸੀਂ ਕਈ ਗੱਲਾਂ ਦੱਸੀਆਂ ਹਨ:',
    ctaTemplate:
      'ਇਸ ਵਿਜ਼ਟ ਦਾ ਮੁੱਖ ਕਾਰਨ ਕਿਹੜਾ ਹੈ? {choices} ਭੇਜੋ — ਬਾਕੀ ਲਈ ਫਾਲੋ-ਅੱਪ ਰੱਖ ਲਵਾਂਗੇ।',
    joinChoices: joinPunjabiGurmukhiChoices,
  },
  'latin-hi': {
    intro: 'Aapne kai concerns bataaye hain:',
    ctaTemplate:
      'Is visit ka main reason kaunsa hai? {choices} reply karein — baaki ke liye follow-up rakh lenge.',
    joinChoices: joinEnglishChoices,
  },
  'latin-pa': {
    intro: 'Tussi kai concerns dasse ne:',
    ctaTemplate:
      'Is visit da main reason kehda hai? {choices} reply karo — baaki layi follow-up rakh laange.',
    joinChoices: joinEnglishChoices,
  },
};

/** Internal locale key that includes the roman-script splits. */
type ClarificationCopyLocale = keyof typeof CLARIFICATION_NUMBERED_BY_LOCALE;

function resolveCopyLocale(userText: string): ClarificationCopyLocale {
  const locale = detectSafetyMessageLocale(userText);
  const hasDevanagari = /[\u0900-\u097F]/.test(userText);
  const hasGurmukhi = /[\u0A00-\u0A7F]/.test(userText);
  if (locale === 'hi') return hasDevanagari ? 'hi' : 'latin-hi';
  if (locale === 'pa') return hasGurmukhi ? 'pa' : 'latin-pa';
  return 'en';
}

/**
 * Task 09: render the numbered-list variant of the clarification message when the matcher
 * supplied 2–5 concerns. Falls back to the legacy single-sentence copy outside that range so
 * a matcher regression or unusual response (1 concern, 6+ concerns, malformed list) never
 * produces a degraded DM — the patient just sees today's open-ended ask.
 *
 * Layout (en, mirrored structurally by every locale):
 *     You've mentioned a few concerns:\n
 *     \n
 *     **1.** Headache\n
 *     **2.** Diabetes follow-up\n
 *     **3.** Knee pain\n
 *     \n
 *     Which one is the main reason for this visit? Reply **1**, **2**, or **3** — …
 *
 * Why numbers are bolded but concern labels are not: consistency with the Task-07 cancel list
 * (`**1.** {date} — {modality}`), and because the patient's eye should land on the
 * actionable number, not on the clinical noun-phrase the LLM chose.
 */
function renderNumberedClarificationMessage(
  locale: ClarificationCopyLocale,
  concerns: readonly string[],
): string {
  const copy = CLARIFICATION_NUMBERED_BY_LOCALE[locale];
  const listLines = concerns.map((label, i) => `**${i + 1}.** ${label}`);
  const choiceTokens = concerns.map((_, i) => `**${i + 1}**`);
  const cta = copy.ctaTemplate.replace('{choices}', copy.joinChoices(choiceTokens));
  return [copy.intro, '', ...listLines, '', cta].join('\n');
}

/**
 * Locale-aware clarification copy. Reuses `detectSafetyMessageLocale` so we stay consistent with
 * every other patient-facing guardrail reply.
 *
 * **Task 09 extension (2026-04-18):** when `parsedConcerns` contains 2–5 non-empty entries, we
 * render the numbered-list variant instead of the single-sentence ask — the patient can then
 * reply with a number. Outside that range (0 / 1 / 6+ entries, or `parsedConcerns === undefined`
 * from deterministic / fallback matcher paths) we return today's locale string unchanged, so
 * the existing free-text clarification flow still works without regression.
 */
export function resolveComplaintClarificationMessage(
  userText: string,
  parsedConcerns?: readonly string[],
): string {
  // Numbered-list path (Task 09) when the matcher supplied a workable concern list.
  if (
    parsedConcerns &&
    parsedConcerns.length >= CLARIFICATION_NUMBERED_MIN_ITEMS &&
    parsedConcerns.length <= CLARIFICATION_NUMBERED_MAX_ITEMS
  ) {
    return renderNumberedClarificationMessage(resolveCopyLocale(userText), parsedConcerns);
  }

  // Legacy single-sentence path (pre-Task-09 + out-of-range fallback).
  const locale = detectSafetyMessageLocale(userText);
  const hasDevanagari = /[\u0900-\u097F]/.test(userText);
  const hasGurmukhi = /[\u0A00-\u0A7F]/.test(userText);
  if (locale === 'hi' && !hasDevanagari) return COMPLAINT_CLARIFICATION_LATIN_HI;
  if (locale === 'pa' && !hasGurmukhi) return COMPLAINT_CLARIFICATION_LATIN_PA;
  return COMPLAINT_CLARIFICATION_BY_LOCALE[locale];
}

/**
 * Task 09: pure helper that maps a patient's short numeric-only reply ("1", "2", "  3  ") back
 * to the concern string at `concerns[N-1]`. Used by the webhook handler when dispatching
 * replies received in `step = 'awaiting_complaint_clarification'`. Returns `null` when the
 * reply isn't a single positive integer, falls outside `1..concerns.length`, or `concerns` is
 * empty — the caller then falls through to the existing free-text re-match path.
 *
 * Strict contract (kept pure so the handler wiring is trivially testable):
 *  - Accepts only 1–2 ASCII digits. `"1"` / `"2"` / `"10"` → valid; `"1st"` / `"one"` / `"1, 2"`
 *    / `"1 please"` → `null` (the patient gave free-text; re-match handles it).
 *  - No locale-specific digit parsing (Devanagari / Gurmukhi numerals). If a patient types
 *    a localized digit we fall through to free-text — future enhancement, not scope here.
 */
export function resolveClarificationNumericReply(
  replyText: string,
  concerns: readonly string[] | undefined,
): string | null {
  if (!concerns || concerns.length === 0) return null;
  const trimmed = replyText.trim();
  if (!/^[0-9]{1,2}$/.test(trimmed)) return null;
  const n = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(n) || n < 1 || n > concerns.length) return null;
  return concerns[n - 1] ?? null;
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
