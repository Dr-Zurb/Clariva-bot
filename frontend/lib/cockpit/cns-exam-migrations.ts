/**
 * Migrate legacy CNS / Neuro chip findingIds into structured card entries.
 *
 * Mirrors `abd-exam-migrations.ts`. Legacy free-text chips collapse onto their
 * structured equivalents; duplicate findingIds are merged so the structured card
 * owns a single entry.
 */

import type { ExamFindingEntry } from "@/types/prescription";

const LEGACY_CHIP_FINDING_ID: Record<string, string> = {
  power_sensory_loss: "weakness",
  power_loss: "weakness",
};

export function migrateCnsFindingEntry(entry: ExamFindingEntry): ExamFindingEntry {
  const targetId = LEGACY_CHIP_FINDING_ID[entry.findingId];
  if (targetId) {
    return { findingId: targetId, attributes: entry.attributes ?? {} };
  }
  return entry;
}

/** Merge migrated rows when findingIds collapse to the same target. */
export function normalizeCnsFindingEntries(entries: ExamFindingEntry[]): ExamFindingEntry[] {
  const out: ExamFindingEntry[] = [];
  for (const raw of entries) {
    const migrated = migrateCnsFindingEntry(raw);
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
