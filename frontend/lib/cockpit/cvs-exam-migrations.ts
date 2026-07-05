/**
 * Migrate legacy CVS chip findingIds into structured card entries.
 */

import type { ExamFindingEntry } from "@/types/prescription";

const LEGACY_MURMUR_TIMING: Record<string, string> = {
  systolic_murmur: "Systolic",
  diastolic_murmur: "Diastolic",
  continuous_murmur: "Continuous",
};

const LEGACY_CHIP_FINDING_ID: Record<string, string> = {
  split_s2: "wide_split_s2",
  heave: "parasternal_heave",
};

export function migrateCvsFindingEntry(entry: ExamFindingEntry): ExamFindingEntry {
  const legacyTiming = LEGACY_MURMUR_TIMING[entry.findingId];
  if (legacyTiming) {
    return {
      findingId: "murmur",
      attributes: { ...(entry.attributes ?? {}), timing: legacyTiming },
    };
  }
  if (entry.findingId === "displaced_apex") {
    return {
      findingId: "apex_beat",
      attributes: { position: "Displaced", ...(entry.attributes ?? {}) },
    };
  }
  const legacyChipId = LEGACY_CHIP_FINDING_ID[entry.findingId];
  if (legacyChipId) {
    return { findingId: legacyChipId, attributes: entry.attributes ?? {} };
  }
  if (entry.findingId === "pulse") {
    // Rhythm now lives in Vitals; notes moved to the shared Vitals HR note.
    const attrs = { ...(entry.attributes ?? {}) };
    delete attrs.rhythm;
    delete attrs.notes;
    return { findingId: "pulse", attributes: attrs };
  }
  return entry;
}

function pulseEntryHasDocumentableAttributes(attributes: Record<string, string> | undefined): boolean {
  return Object.values(attributes ?? {}).some((value) => value.trim().length > 0);
}

/** Merge migrated rows when findingIds collapse to the same target. */
export function normalizeCvsFindingEntries(entries: ExamFindingEntry[]): ExamFindingEntry[] {
  const out: ExamFindingEntry[] = [];
  for (const raw of entries) {
    const migrated = migrateCvsFindingEntry(raw);
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
  return out.filter(
    (entry) => entry.findingId !== "pulse" || pulseEntryHasDocumentableAttributes(entry.attributes),
  );
}
