/**
 * Shared modality resolver for `doctor_settings.consultation_types`.
 *
 * Plan 03 · Task 09 extracted this helper out of `service-catalog-ai-suggest.ts`
 * so two callers share one source of truth:
 *   1. AI auto-fill (`service-catalog-ai-suggest.ts`) — filters LLM-generated
 *      modalities against the doctor's configured channels.
 *   2. Single-fee catalog builder (`single-fee-catalog.ts`) — only enables
 *      modalities the doctor has actually opted into when materializing the
 *      one-entry catalog.
 *
 * Keep this module free of dependencies on schemas / DB / logger so both
 * call-sites (and future ones) can import it without pulling heavier trees.
 */

/** Canonical modality keys in `serviceModalitiesSchema`. Kept here so all modality callers agree. */
export const ALL_MODALITIES = ['text', 'voice', 'video'] as const;
export type ModalityKey = (typeof ALL_MODALITIES)[number];

export interface AllowedModalities {
  text: boolean;
  voice: boolean;
  video: boolean;
}

/**
 * Translate the free-form `doctor_settings.consultation_types` copy (e.g.
 * `"Video ₹500, Text ₹300"`, `"voice only"`, `"In-person & tele-video"`) into
 * the three boolean channel flags the catalog uses.
 *
 * Policy:
 *   - `null` / empty string → allow all three (doctor has not narrowed; don't
 *     over-restrict downstream UI). Same behavior for free-form copy that
 *     doesn't mention any channel keyword.
 *   - Otherwise, enable only the channels whose keywords appear.
 *
 * Regex set intentionally mirrors the pre-extraction function from
 * `service-catalog-ai-suggest.ts` so Task 06's existing behavior is preserved
 * byte-for-byte — the extraction is a refactor, not a semantic change.
 */
export function deriveAllowedModalitiesFromConsultationTypes(
  consultationTypes: string | null | undefined
): AllowedModalities {
  if (!consultationTypes) {
    // Doctor has not narrowed channels — allow all and let downstream UI decide.
    return { text: true, voice: true, video: true };
  }
  const t = consultationTypes.toLowerCase();
  const text = /text|chat|message|whats?app|sms/.test(t);
  const voice = /voice|phone|audio|call(?!s? today)/.test(t);
  const video = /video|televideo|telemed|tele[\s-]?consult/.test(t);
  if (!text && !voice && !video) {
    // Free-form copy that doesn't mention any channel — default to allow all rather
    // than silently disable everything (which would force "no modality enabled").
    return { text: true, voice: true, video: true };
  }
  return { text, voice, video };
}
