/**
 * Whether a vital's optional extras (context, note, provenance) have data.
 * Used to auto-open the per-cell More panel so saved extras stay visible.
 */

import { readingHasContextOverride } from "./bp-readings";
import { readingHasGlucoseDeviceOverride } from "./glucose-readings";
import { hasVitalProvenanceOverride } from "./measurement-context";
import type {
  MeasurementContext,
  VitalProvenanceMap,
} from "./measurement-context";
import { contextKeysForNumericVital } from "./vitals-group-layout";
import type { VitalKey } from "./vitals-schema";
import type { BpReading, GlucoseReading } from "@/types/prescription";

export interface VitalExtrasFieldSlice {
  vitalsNotes: Record<string, string | null | undefined>;
  vitalsProvenanceOverrides: VitalProvenanceMap;
  vitalsMeasurementContext: MeasurementContext;
}

function hasNonEmptyText(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export function numericVitalExtrasHaveData(
  fields: VitalExtrasFieldSlice,
  vitalKey: VitalKey
): boolean {
  const record = fields as VitalExtrasFieldSlice & Record<string, unknown>;
  for (const key of contextKeysForNumericVital(vitalKey)) {
    const value = record[key];
    if (value != null && value !== "") return true;
  }
  if (hasNonEmptyText(fields.vitalsNotes[vitalKey])) return true;
  return hasVitalProvenanceOverride(
    fields.vitalsProvenanceOverrides[vitalKey],
    fields.vitalsMeasurementContext
  );
}

export function customVitalExtrasHaveData(
  fields: VitalExtrasFieldSlice,
  customId: string
): boolean {
  if (hasNonEmptyText(fields.vitalsNotes[customId])) return true;
  return hasVitalProvenanceOverride(
    fields.vitalsProvenanceOverrides[customId],
    fields.vitalsMeasurementContext
  );
}

export function bpReadingExtrasHaveData(reading: BpReading): boolean {
  return (
    reading.posture != null ||
    reading.limb != null ||
    hasNonEmptyText(reading.note) ||
    hasNonEmptyText(reading.sequenceLabel) ||
    readingHasContextOverride(reading)
  );
}

export function glucoseReadingExtrasHaveData(
  reading: GlucoseReading,
  fields: VitalExtrasFieldSlice,
  isPrimary: boolean
): boolean {
  if (reading.timing != null) return true;
  if (hasNonEmptyText(reading.note)) return true;
  if (hasNonEmptyText(reading.sequenceLabel)) return true;
  if (readingHasGlucoseDeviceOverride(reading)) return true;
  if (!isPrimary) return false;
  return hasVitalProvenanceOverride(
    fields.vitalsProvenanceOverrides.vitalsGlucoseMgDl,
    fields.vitalsMeasurementContext
  );
}
