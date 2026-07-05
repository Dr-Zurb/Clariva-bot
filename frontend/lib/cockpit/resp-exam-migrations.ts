/**
 * Migrate legacy Respiratory chip findingIds into structured card entries.
 *
 * Mirrors `cvs-exam-migrations.ts`. Legacy free-text chips ("Crepitations",
 * "Rales") collapse onto their structured equivalents; duplicate findingIds are
 * merged so the structured card owns a single entry.
 */

import type { ExamFindingEntry } from "@/types/prescription";

const LEGACY_CHIP_FINDING_ID: Record<string, string> = {
  crepitations: "crackles",
  crepts: "crackles",
  rales: "crackles",
  rhonchus: "rhonchi",
  wheezing: "wheeze",
  rub: "pleural_rub",
};

export function migrateRespFindingEntry(entry: ExamFindingEntry): ExamFindingEntry {
  const legacyChipId = LEGACY_CHIP_FINDING_ID[entry.findingId];
  if (legacyChipId) {
    return { findingId: legacyChipId, attributes: entry.attributes ?? {} };
  }
  return entry;
}

/** Merge migrated rows when findingIds collapse to the same target. */
export function normalizeRespFindingEntries(entries: ExamFindingEntry[]): ExamFindingEntry[] {
  const out: ExamFindingEntry[] = [];
  for (const raw of entries) {
    const migrated = migrateRespFindingEntry(raw);
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
