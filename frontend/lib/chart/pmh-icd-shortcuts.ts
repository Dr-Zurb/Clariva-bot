/**
 * ICD-11 quick-add shortcuts for PMH / Known conditions.
 *
 * Chip label === canonical ICD-11 title (what gets stored), with the code shown
 * on the chip so it matches the card that appears after add. Free-text (uncoded)
 * adds remain allowed via the ICD autocomplete.
 */

export interface PmhIcdShortcut {
  /** Stable chip key. */
  id: string;
  /** Canonical ICD-11 title — chip label and stored `condition`. */
  title: string;
  /** ICD-11 MMS stem code. */
  code: string;
}

/**
 * Common OPD chronic conditions — codes verified against diagnosis_catalog
 * (migration 162 curated seed + 163 full MMS import).
 */
export const PMH_ICD_SHORTCUTS: readonly PmhIcdShortcut[] = [
  {
    id: "htn",
    title: "Essential hypertension",
    code: "BA00",
  },
  {
    id: "dm",
    title: "Type 2 diabetes mellitus",
    code: "5A11",
  },
  {
    id: "asthma",
    title: "Asthma",
    code: "CA23",
  },
  {
    id: "ckd",
    title: "Chronic kidney disease",
    code: "GB61",
  },
  {
    id: "thyroid",
    title: "Hypothyroidism",
    code: "5A00",
  },
  {
    id: "cad",
    title: "Coronary atherosclerosis",
    code: "BA52",
  },
  {
    id: "dyslipidemia",
    title: "Hyperlipoproteinaemia",
    code: "5C80",
  },
] as const;

export function normalizeConditionKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Duplicate when the same ICD code already exists, or (for uncoded adds) when
 * the normalized label already exists. Active rows only — caller filters archive.
 */
export function isDuplicateCondition(
  existing: ReadonlyArray<{ condition: string; code?: string | null }>,
  label: string,
  code?: string | null,
): boolean {
  return findMatchingCondition(existing, label, code) != null;
}

/**
 * Find an existing condition that matches by ICD code (preferred) or normalized
 * label. Used to soft-link visit diagnoses ↔ known conditions without blocking
 * either list (ASMT-D6 reconcile).
 */
export function findMatchingCondition<
  T extends { condition: string; code?: string | null },
>(
  existing: ReadonlyArray<T>,
  label: string,
  code?: string | null,
): T | null {
  const trimmedCode = code?.trim() || null;
  if (trimmedCode) {
    const byCode = existing.find((c) => (c.code?.trim() || null) === trimmedCode);
    if (byCode) return byCode;
  }
  const key = normalizeConditionKey(label);
  if (!key) return null;
  return existing.find((c) => normalizeConditionKey(c.condition) === key) ?? null;
}
