/**
 * Migrate legacy Abdomen chip findingIds into structured card entries.
 *
 * Mirrors `resp-exam-migrations.ts`. Legacy free-text chips collapse onto their
 * structured equivalents; duplicate findingIds are merged so the structured card
 * owns a single entry.
 */

import type { ExamFindingEntry } from "@/types/prescription";

const LEGACY_CHIP_FINDING_ID: Record<string, string> = {
  shifting_dullness: "ascites",
  fluid_thrill: "ascites",
  hepatomegaly_finding: "hepatomegaly",
  splenomegaly_finding: "splenomegaly",
};

const LEGACY_CHIP_ATTRIBUTES: Record<string, Record<string, string>> = {
  shifting_dullness: { signs: "Shifting dullness" },
  fluid_thrill: { signs: "Fluid thrill" },
};

export function migrateAbdFindingEntry(entry: ExamFindingEntry): ExamFindingEntry {
  const targetId = LEGACY_CHIP_FINDING_ID[entry.findingId];
  if (targetId) {
    const seeded = LEGACY_CHIP_ATTRIBUTES[entry.findingId];
    return {
      findingId: targetId,
      attributes: { ...(seeded ?? {}), ...(entry.attributes ?? {}) },
    };
  }
  return entry;
}

/** Merge migrated rows when findingIds collapse to the same target. */
export function normalizeAbdFindingEntries(entries: ExamFindingEntry[]): ExamFindingEntry[] {
  const out: ExamFindingEntry[] = [];
  for (const raw of entries) {
    const migrated = migrateAbdFindingEntry(raw);
    const existingIdx = out.findIndex((e) => e.findingId === migrated.findingId);
    if (existingIdx === -1) {
      out.push(migrated);
      continue;
    }
    const existing = out[existingIdx]!;
    out[existingIdx] = {
      findingId: migrated.findingId,
      attributes: { ...(existing.attributes ?? {}), ...(migrated.attributes ?? {}) },
    };
  }
  return out;
}
