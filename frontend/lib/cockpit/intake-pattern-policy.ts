/**
 * Clinical tie-break for chart-med intake pattern (Regular vs Irregular).
 *
 * When the doctor states the patient takes a drug regularly, we classify
 * `regular` even if they note occasional missed doses ("taken regularly but
 * missed occasionally"). Reserve `irregular` for predominantly erratic use
 * (irregular/irregularly, off-and-on, not regularly) or when only soft skip
 * cues appear without any regular phrasing.
 */

import type { PatientMedicationIntakePattern } from "@/types/patient-chart";

/** Explicit negation — always irregular. */
const NOT_REGULARLY_RE = /\bnot\s+regularly\b/i;

/** Verb + regularly — dominant regular cue. */
const REGULAR_INTAKE_PHRASE_RE =
  /\b(?:(?:was|is|been)\s+)?(?:taking|takes|take|taken)\s+regularly\b/i;

/** Hard irregular — wins only when no regular intake phrasing is present. */
const HARD_IRREGULAR_RE =
  /\birregular(?:ly)?\b|\boff[\s-]and[\s-]on\b|\bon[\s-]and[\s-]off\b|\bnow[\s-]and[\s-]then\b/i;

/**
 * Apply the regular-dominant policy to a proposed intake pattern (from the
 * deterministic parser or AI). PRN/SOS intake is never overridden.
 */
export function resolveIntakePatternPolicy(
  rawText: string,
  proposed: PatientMedicationIntakePattern | null,
): PatientMedicationIntakePattern | null {
  if (proposed === "prn") return "prn";

  const text = rawText.trim();
  if (!text) return proposed;

  if (NOT_REGULARLY_RE.test(text)) return "irregular";

  if (REGULAR_INTAKE_PHRASE_RE.test(text)) return "regular";

  // Bare "regularly" as an adherence adverb (not "regular insulin").
  if (/\bregularly\b/i.test(text) && !/\bregular\s+insulin\b/i.test(text)) {
    return "regular";
  }

  if (HARD_IRREGULAR_RE.test(text)) return "irregular";

  return proposed;
}
