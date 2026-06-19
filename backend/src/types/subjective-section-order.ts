/**
 * Subjective-tab section ids (subj-23/subj-24).
 * Mirrors frontend/lib/cockpit/subjective-section-order.ts — keep in sync.
 */

/** All known static top-level subjective section ids (full registry). */
export const SUBJECTIVE_SECTION_ID_VALUES = [
  'chief_complaints',
  'patient_background',
  'allergies',
  'past_surgical',
  'family_history',
  'social_history',
  'free_text_notes',
  'custom_subsections',
] as const;

export type StaticSubjectiveSectionId = (typeof SUBJECTIVE_SECTION_ID_VALUES)[number];

export type SubjectiveSectionId = StaticSubjectiveSectionId | `custom_block:${string}`;

export const CUSTOM_BLOCK_SECTION_PREFIX = 'custom_block:';

/** Max stored order length (static registry + custom blocks). */
export const SUBJECTIVE_SECTION_ORDER_MAX = 40;

const SUBJECTIVE_SECTION_ID_SET = new Set<string>(SUBJECTIVE_SECTION_ID_VALUES);

const CUSTOM_BLOCK_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isCustomBlockSectionId(value: string): boolean {
  if (!value.startsWith(CUSTOM_BLOCK_SECTION_PREFIX)) return false;
  return CUSTOM_BLOCK_UUID_RE.test(value.slice(CUSTOM_BLOCK_SECTION_PREFIX.length));
}

export function isSubjectiveSectionId(value: string): value is SubjectiveSectionId {
  if (SUBJECTIVE_SECTION_ID_SET.has(value)) return true;
  return isCustomBlockSectionId(value);
}

/**
 * Sanitize a stored order: dedupe, drop unknown ids, preserve relative order.
 * Used on PATCH validation and on read normalization.
 */
export function sanitizeSubjectiveSectionOrder(raw: readonly string[]): SubjectiveSectionId[] {
  const seen = new Set<SubjectiveSectionId>();
  const result: SubjectiveSectionId[] = [];
  for (const id of raw) {
    if (typeof id !== 'string') continue;
    if (!isSubjectiveSectionId(id) || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  return result;
}

/**
 * Sanitize a stored hidden set (subj-32 / subj-37): dedupe + drop anything not
 * recognised by `isSubjectiveSectionId` (static or custom_block). Preserves
 * relative order. Tolerant — a renamed/removed id is dropped rather than
 * rejected so a stale id never bricks a save. Used on PATCH validation and on
 * read normalization.
 */
export function sanitizeSubjectiveSectionHidden(
  raw: readonly string[],
): SubjectiveSectionId[] {
  const seen = new Set<SubjectiveSectionId>();
  const result: SubjectiveSectionId[] = [];
  for (const id of raw) {
    if (typeof id !== 'string') continue;
    if (!isSubjectiveSectionId(id)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  return result;
}

/**
 * Sanitize a stored collapse map { [sectionId]: isOpen } (subj-28).
 * Drops unknown section ids and skips non-boolean values rather than rejecting,
 * so a renamed/removed id or a stray value never bricks a save. Used on PATCH
 * validation and on read normalization.
 */
export function sanitizeSubjectiveSectionCollapsed(
  raw: Record<string, unknown>,
): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!isSubjectiveSectionId(key)) continue;
    if (typeof value !== 'boolean') continue;
    result[key] = value;
  }
  return result;
}
