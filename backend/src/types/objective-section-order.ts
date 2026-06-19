/**
 * Objective-tab section ids (obj-09/obj-10).
 * Mirrors frontend/lib/cockpit/objective-section-order.ts — keep in sync.
 */

/** All known static top-level objective section ids (full registry). */
export const OBJECTIVE_SECTION_ID_VALUES = [
  'vitals',
  'exam',
  'test_results',
  'legacy_exam',
  'legacy_vitals',
] as const;

export type StaticObjectiveSectionId = (typeof OBJECTIVE_SECTION_ID_VALUES)[number];

export type ObjectiveSectionId = StaticObjectiveSectionId | `custom_block:${string}`;

export const CUSTOM_BLOCK_SECTION_PREFIX = 'custom_block:';

/** Max stored order length (static registry + custom blocks). */
export const OBJECTIVE_SECTION_ORDER_MAX = 40;

const OBJECTIVE_SECTION_ID_SET = new Set<string>(OBJECTIVE_SECTION_ID_VALUES);

const CUSTOM_BLOCK_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isCustomBlockSectionId(value: string): boolean {
  if (!value.startsWith(CUSTOM_BLOCK_SECTION_PREFIX)) return false;
  return CUSTOM_BLOCK_UUID_RE.test(value.slice(CUSTOM_BLOCK_SECTION_PREFIX.length));
}

export function isObjectiveSectionId(value: string): value is ObjectiveSectionId {
  if (OBJECTIVE_SECTION_ID_SET.has(value)) return true;
  return isCustomBlockSectionId(value);
}

/**
 * Sanitize a stored order: dedupe, drop unknown ids, preserve relative order.
 * Used on PATCH validation and on read normalization.
 */
export function sanitizeObjectiveSectionOrder(raw: readonly string[]): ObjectiveSectionId[] {
  const seen = new Set<ObjectiveSectionId>();
  const result: ObjectiveSectionId[] = [];
  for (const id of raw) {
    if (typeof id !== 'string') continue;
    if (!isObjectiveSectionId(id) || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  return result;
}

/**
 * Sanitize a stored hidden set (obj-10): dedupe + drop anything not recognised
 * by `isObjectiveSectionId` (static or custom_block). Preserves relative order.
 * Tolerant — a renamed/removed id is dropped rather than rejected so a stale id
 * never bricks a save. Used on PATCH validation and on read normalization.
 */
export function sanitizeObjectiveSectionHidden(raw: readonly string[]): ObjectiveSectionId[] {
  const seen = new Set<ObjectiveSectionId>();
  const result: ObjectiveSectionId[] = [];
  for (const id of raw) {
    if (typeof id !== 'string') continue;
    if (!isObjectiveSectionId(id)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  return result;
}

/**
 * Sanitize a stored collapse map { [sectionId]: isOpen } (obj-10).
 * Drops unknown section ids and skips non-boolean values rather than rejecting,
 * so a renamed/removed id or a stray value never bricks a save. Used on PATCH
 * validation and on read normalization.
 */
export function sanitizeObjectiveSectionCollapsed(
  raw: Record<string, unknown>,
): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!isObjectiveSectionId(key)) continue;
    if (typeof value !== 'boolean') continue;
    result[key] = value;
  }
  return result;
}
