/**
 * Per-vital free-text notes stored in `prescriptions.vitals_json.vitalNotes`.
 *
 * BP / glucose reading notes live on their reading rows; this map covers scalar
 * vitals (column + json-backed) and cluster menu keys (e.g. pupils cluster).
 */

import { isCustomVitalId } from "@/lib/cockpit/vitals-custom";
import { VITAL_ORDER, type VitalKey } from "@/lib/cockpit/vitals-schema";
import type { VitalsJson } from "@/types/prescription";

export const VITAL_NOTE_MAX_LEN = 200;

const VALID_VITAL_KEYS = new Set<string>(VITAL_ORDER);

export type VitalNotesMap = Record<string, string | null>;

export function normalizeVitalNoteText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, VITAL_NOTE_MAX_LEN);
}

function isAllowedNoteKey(key: string): boolean {
  return VALID_VITAL_KEYS.has(key) || isCustomVitalId(key);
}

/** Sanitize `vitals_json.vitalNotes` from a payload. */
export function normalizeVitalNotes(raw: unknown): VitalNotesMap {
  if (!raw || typeof raw !== "object") return {};
  const out: VitalNotesMap = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!isAllowedNoteKey(key)) continue;
    const note = normalizeVitalNoteText(value);
    if (note) out[key] = note;
  }
  return out;
}

export function hydrateVitalNotesFromPrescription(
  json: VitalsJson | null | undefined,
): VitalNotesMap {
  return normalizeVitalNotes(json?.vitalNotes);
}

/** Persist only non-empty notes. */
export function serializeVitalNotesForVitalsJson(
  notes: VitalNotesMap | null | undefined,
): Record<string, string> | undefined {
  if (!notes) return undefined;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(notes)) {
    if (!isAllowedNoteKey(key)) continue;
    const note = normalizeVitalNoteText(value);
    if (note) out[key] = note;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function formatVitalLineWithNote(baseLine: string, note: string | null | undefined): string {
  const trimmed = normalizeVitalNoteText(note);
  return trimmed ? `${baseLine} — ${trimmed}` : baseLine;
}
