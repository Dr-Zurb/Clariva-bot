/**
 * Clinical tie-break for chart-med intake pattern (Regular vs Irregular).
 * Mirrors `frontend/lib/cockpit/intake-pattern-policy.ts`.
 */

const NOT_REGULARLY_RE = /\bnot\s+regularly\b/i;

const REGULAR_INTAKE_PHRASE_RE =
  /\b(?:(?:was|is|been)\s+)?(?:taking|takes|take|taken)\s+regularly\b/i;

const HARD_IRREGULAR_RE =
  /\birregular(?:ly)?\b|\boff[\s-]and[\s-]on\b|\bon[\s-]and[\s-]off\b|\bnow[\s-]and[\s-]then\b/i;

export type IntakePatternPolicyValue = 'regular' | 'irregular' | 'prn' | null;

export function resolveIntakePatternPolicy(
  rawText: string,
  proposed: IntakePatternPolicyValue,
): IntakePatternPolicyValue {
  if (proposed === 'prn') return 'prn';

  const text = rawText.trim();
  if (!text) return proposed;

  if (NOT_REGULARLY_RE.test(text)) return 'irregular';

  if (REGULAR_INTAKE_PHRASE_RE.test(text)) return 'regular';

  if (/\bregularly\b/i.test(text) && !/\bregular\s+insulin\b/i.test(text)) {
    return 'regular';
  }

  if (HARD_IRREGULAR_RE.test(text)) return 'irregular';

  return proposed;
}
