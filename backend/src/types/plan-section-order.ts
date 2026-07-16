/**
 * Plan-tab section ids (plan chrome).
 * Mirrors frontend/lib/cockpit/plan-section-order.ts — keep in sync.
 */

import { isCustomBlockSectionId } from './subjective-section-order';

/** All known static top-level Plan section ids (full registry). */
export const PLAN_SECTION_ID_VALUES = [
  'investigations',
  'medications',
  'follow_up',
  'advice',
  'referral',
  'clinical_notes',
] as const;

export type StaticPlanSectionId = (typeof PLAN_SECTION_ID_VALUES)[number];

/**
 * assessment-plan-custom-sections: custom blocks ride in the order using the
 * shared `custom_block:${uuid}` convention (reuse the subjective helper).
 */
export type PlanSectionId = StaticPlanSectionId | `custom_block:${string}`;

/** Max stored order length (static registry + custom blocks). */
export const PLAN_SECTION_ORDER_MAX = 40;

const PLAN_SECTION_ID_SET = new Set<string>(PLAN_SECTION_ID_VALUES);

export function isStaticPlanSectionId(value: string): value is StaticPlanSectionId {
  return PLAN_SECTION_ID_SET.has(value);
}

export function isPlanSectionId(value: string): value is PlanSectionId {
  if (PLAN_SECTION_ID_SET.has(value)) return true;
  return isCustomBlockSectionId(value);
}

/**
 * Sanitize a stored order: dedupe, drop unknown ids, preserve relative order.
 * Used on PATCH validation and on read normalization.
 */
export function sanitizePlanSectionOrder(raw: readonly string[]): PlanSectionId[] {
  const seen = new Set<PlanSectionId>();
  const result: PlanSectionId[] = [];
  for (const id of raw) {
    if (typeof id !== 'string') continue;
    if (!isPlanSectionId(id) || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  return result;
}

/**
 * Sanitize a stored hidden set: dedupe + drop unknown ids. Preserves relative
 * order. Tolerant — a renamed/removed id is dropped rather than rejected.
 */
export function sanitizePlanSectionHidden(raw: readonly string[]): PlanSectionId[] {
  return sanitizePlanSectionOrder(raw);
}

/**
 * Sanitize a stored collapse map { [sectionId]: isOpen }.
 * Drops unknown section ids and skips non-boolean values.
 */
export function sanitizePlanSectionCollapsed(
  raw: Record<string, unknown>,
): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!isPlanSectionId(key)) continue;
    if (typeof value !== 'boolean') continue;
    result[key] = value;
  }
  return result;
}
