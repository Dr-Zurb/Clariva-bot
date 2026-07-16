/**
 * Assessment-tab section ids (assessment chrome).
 * Mirrors frontend/lib/cockpit/assessment-section-order.ts — keep in sync.
 */

import { isCustomBlockSectionId } from './subjective-section-order';

/** All known static top-level Assessment section ids (full registry). */
export const ASSESSMENT_SECTION_ID_VALUES = [
  'diagnoses',
  'known_conditions',
  'assessment_notes',
] as const;

export type StaticAssessmentSectionId = (typeof ASSESSMENT_SECTION_ID_VALUES)[number];

/**
 * assessment-plan-custom-sections: custom blocks ride in the order using the
 * shared `custom_block:${uuid}` convention (reuse the subjective helper).
 */
export type AssessmentSectionId = StaticAssessmentSectionId | `custom_block:${string}`;

/** Max stored order length (static registry + custom blocks). */
export const ASSESSMENT_SECTION_ORDER_MAX = 40;

const ASSESSMENT_SECTION_ID_SET = new Set<string>(ASSESSMENT_SECTION_ID_VALUES);

export function isStaticAssessmentSectionId(
  value: string,
): value is StaticAssessmentSectionId {
  return ASSESSMENT_SECTION_ID_SET.has(value);
}

export function isAssessmentSectionId(value: string): value is AssessmentSectionId {
  if (ASSESSMENT_SECTION_ID_SET.has(value)) return true;
  return isCustomBlockSectionId(value);
}

/**
 * Sanitize a stored order: dedupe, drop unknown ids, preserve relative order.
 * Used on PATCH validation and on read normalization.
 */
export function sanitizeAssessmentSectionOrder(
  raw: readonly string[],
): AssessmentSectionId[] {
  const seen = new Set<AssessmentSectionId>();
  const result: AssessmentSectionId[] = [];
  for (const id of raw) {
    if (typeof id !== 'string') continue;
    if (!isAssessmentSectionId(id) || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  return result;
}

/**
 * Sanitize a stored hidden set: dedupe + drop unknown ids. Preserves relative
 * order. Tolerant — a renamed/removed id is dropped rather than rejected.
 */
export function sanitizeAssessmentSectionHidden(
  raw: readonly string[],
): AssessmentSectionId[] {
  return sanitizeAssessmentSectionOrder(raw);
}

/**
 * Sanitize a stored collapse map { [sectionId]: isOpen }.
 * Drops unknown section ids and skips non-boolean values.
 */
export function sanitizeAssessmentSectionCollapsed(
  raw: Record<string, unknown>,
): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!isAssessmentSectionId(key)) continue;
    if (typeof value !== 'boolean') continue;
    result[key] = value;
  }
  return result;
}
