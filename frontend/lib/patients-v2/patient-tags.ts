/**
 * Client-side patient tag helpers (mirrors backend/src/utils/patient-tags.ts).
 */

export const PATIENT_TAG_MAX_LEN = 64;
export const PATIENT_TAGS_MAX = 8;

export type PatientTagOp = "add" | "remove" | "set" | "clear";

export function normalizeTagLabel(raw: string): string | null {
  const trimmed = raw.trim().slice(0, PATIENT_TAG_MAX_LEN);
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeTagList(tags: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const label = normalizeTagLabel(raw);
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(label);
    if (out.length >= PATIENT_TAGS_MAX) break;
  }
  return out;
}

export function coercePatientTags(
  patientTags?: string[] | null,
  patientTag?: string | null,
): string[] {
  if (Array.isArray(patientTags) && patientTags.length > 0) {
    return normalizeTagList(patientTags);
  }
  if (patientTag?.trim()) {
    return normalizeTagList([patientTag]);
  }
  return [];
}

export function patientHasTag(tags: readonly string[], needle: string): boolean {
  const key = needle.trim().toLowerCase();
  if (!key) return false;
  return tags.some((t) => t.toLowerCase() === key);
}

export function applyTagOp(
  current: readonly string[],
  op: PatientTagOp,
  tags: readonly string[],
): string[] {
  const base = normalizeTagList([...current]);
  switch (op) {
    case "clear":
      return [];
    case "set":
      return normalizeTagList([...tags]);
    case "add":
      return normalizeTagList([...base, ...tags]);
    case "remove": {
      const remove = new Set(normalizeTagList([...tags]).map((t) => t.toLowerCase()));
      return base.filter((t) => !remove.has(t.toLowerCase()));
    }
    default: {
      const _exhaustive: never = op;
      return _exhaustive;
    }
  }
}

/**
 * Labels in `tagsToAdd` that are new to `current` but would be dropped by the
 * max-8 cap (silent truncate in normalizeTagList).
 */
export function unappliedAddLabels(
  current: readonly string[],
  tagsToAdd: readonly string[],
): string[] {
  const before = new Set(
    normalizeTagList([...current]).map((t) => t.toLowerCase()),
  );
  const next = new Set(
    applyTagOp(current, "add", tagsToAdd).map((t) => t.toLowerCase()),
  );
  return normalizeTagList([...tagsToAdd]).filter((t) => {
    const key = t.toLowerCase();
    return !before.has(key) && !next.has(key);
  });
}
