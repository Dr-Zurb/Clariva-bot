/**
 * Plan 03 · Task 12: client-side mirror of
 * `backend/src/utils/consultation-types.ts` (`deriveAllowedModalitiesFromConsultationTypes`).
 *
 * The single-fee editor shows three modality toggles (text / voice / video)
 * but persists them via the free-text `doctor_settings.consultation_types`
 * column — that is the field the backend's Task 09 single-fee catalog
 * builder reads when it regenerates the one-entry catalog.
 *
 * To keep the round-trip deterministic we:
 *   1. Detect modalities with the same keyword set the backend uses, so a
 *      saved string re-hydrates to the same toggle state on reload.
 *   2. Serialize the toggle state back to a canonical human-readable string
 *      ("Text, Voice, Video consultations") that unambiguously matches the
 *      backend regex on the next read.
 *
 * NOT imported by the backend — intentionally duplicated to avoid pulling a
 * backend module into the Next.js bundle. If the regex set changes on the
 * backend, update both sides together. Keyword parity is covered by the
 * backend unit tests and by the manual verification steps in the task doc.
 */

export const ALL_MODALITIES = ["text", "voice", "video"] as const;
export type ModalityKey = (typeof ALL_MODALITIES)[number];

export interface AllowedModalities {
  text: boolean;
  voice: boolean;
  video: boolean;
}

/**
 * Parse `consultation_types` free-text into modality toggle state.
 *
 * Mirrors backend policy exactly:
 *   - `null` / empty        → all three enabled (doctor has not narrowed)
 *   - free-text with no channel keyword → all three enabled
 *   - otherwise only channels whose keyword appears
 */
export function parseConsultationTypesToModalities(
  consultationTypes: string | null | undefined
): AllowedModalities {
  if (!consultationTypes) return { text: true, voice: true, video: true };
  const t = consultationTypes.toLowerCase();
  const text = /text|chat|message|whats?app|sms/.test(t);
  const voice = /voice|phone|audio|call(?!s? today)/.test(t);
  const video = /video|televideo|telemed|tele[\s-]?consult/.test(t);
  if (!text && !voice && !video) {
    return { text: true, voice: true, video: true };
  }
  return { text, voice, video };
}

/**
 * Serialize modality toggle state back to a canonical `consultation_types`
 * string. Always uses the base keyword ("Text"/"Voice"/"Video") so
 * `parseConsultationTypesToModalities` round-trips to the same booleans.
 *
 * At least one modality is always required at the component layer; this
 * helper returns `null` only if the caller deliberately passes an all-false
 * state, letting the backend fall back to its "all enabled" default.
 */
export function modalitiesToConsultationTypes(
  modalities: AllowedModalities
): string | null {
  const parts: string[] = [];
  if (modalities.text) parts.push("Text");
  if (modalities.voice) parts.push("Voice");
  if (modalities.video) parts.push("Video");
  if (parts.length === 0) return null;
  return `${parts.join(", ")} consultations`;
}

export function modalityLabel(m: ModalityKey): string {
  switch (m) {
    case "text":
      return "Text / chat";
    case "voice":
      return "Voice / phone";
    case "video":
      return "Video";
  }
}
