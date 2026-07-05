/**
 * Multi-reading glucose helpers (vitals-section).
 *
 * Primary reading (index 0) mirrors legacy `vitals_glucose_mg_dl` + visit-level
 * `vitalsGlucoseTiming` / `vitalsGlucoseDevice`. Additional readings persist in
 * `prescriptions.vitals_json.glucoseReadings` when length > 1 or json-only fields.
 */

import {
  resolveCategoricalVital,
  type VitalsGlucoseDevice,
  type VitalsGlucoseTiming,
} from "./categorical-vitals-schema";
import { resolveVital } from "./vitals-schema";
import type { GlucoseContext, GlucoseReading, VitalsJson } from "@/types/prescription";

export const MAX_GLUCOSE_READINGS = 8;
export const GLUCOSE_SEQUENCE_LABEL_MAX_LEN = 24;
export const GLUCOSE_NOTE_MAX_LEN = 200;

export const GLUCOSE_TIMING_OPTIONS = resolveCategoricalVital("vitalsGlucoseTiming").options as readonly {
  value: VitalsGlucoseTiming;
  label: string;
}[];

export const GLUCOSE_DEVICE_OPTIONS = resolveCategoricalVital("vitalsGlucoseDevice").options as readonly {
  value: VitalsGlucoseDevice;
  label: string;
}[];

export const DEFAULT_GLUCOSE_CONTEXT: Readonly<Required<GlucoseContext>> = {
  device: "glucometer",
};

const GLUCOSE_MIN = resolveVital("vitalsGlucoseMgDl").hardMin;
const GLUCOSE_MAX = resolveVital("vitalsGlucoseMgDl").hardMax;

const VALID_TIMINGS = new Set<string>(GLUCOSE_TIMING_OPTIONS.map((o) => o.value));
const VALID_DEVICES = new Set<string>(GLUCOSE_DEVICE_OPTIONS.map((o) => o.value));

export interface GlucoseColumnSnapshot {
  valueMgDl: number | null;
  timing: VitalsGlucoseTiming | null;
  device: VitalsGlucoseDevice | null;
}

export function createEmptyGlucoseReading(): GlucoseReading {
  return {
    valueMgDl: null,
    timing: null,
    device: null,
    sequenceLabel: null,
    note: null,
  };
}

function clampGlucoseValue(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < GLUCOSE_MIN || value > GLUCOSE_MAX) return null;
  return value;
}

function normalizeTiming(value: unknown): VitalsGlucoseTiming | null {
  return typeof value === "string" && VALID_TIMINGS.has(value)
    ? (value as VitalsGlucoseTiming)
    : null;
}

function normalizeDevice(value: unknown): VitalsGlucoseDevice | null {
  return typeof value === "string" && VALID_DEVICES.has(value)
    ? (value as VitalsGlucoseDevice)
    : null;
}

function normalizeSequenceLabel(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, GLUCOSE_SEQUENCE_LABEL_MAX_LEN);
}

function normalizeNote(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, GLUCOSE_NOTE_MAX_LEN);
}

function glucoseRowHasUiData(reading: GlucoseReading): boolean {
  return (
    reading.valueMgDl != null ||
    reading.timing != null ||
    reading.device != null ||
    (reading.sequenceLabel != null && reading.sequenceLabel.length > 0) ||
    (reading.note != null && reading.note.length > 0)
  );
}

/** Sanitize one glucose reading row. */
export function normalizeGlucoseReading(raw: unknown): GlucoseReading | null {
  if (!raw || typeof raw !== "object") return null;
  const source = raw as Record<string, unknown>;
  const valueMgDl = clampGlucoseValue(source.valueMgDl);
  const timing = normalizeTiming(source.timing);
  const device = normalizeDevice(source.device);
  const sequenceLabel = normalizeSequenceLabel(source.sequenceLabel);
  const note = normalizeNote(source.note);
  if (valueMgDl == null && timing == null && device == null && !sequenceLabel && !note) {
    return null;
  }
  return { valueMgDl, timing, device, sequenceLabel, note };
}

export function normalizeGlucoseReadings(readings: unknown): GlucoseReading[] {
  if (!Array.isArray(readings)) return [];
  const out: GlucoseReading[] = [];
  for (const raw of readings) {
    const row = normalizeGlucoseReading(raw);
    if (row) out.push(row);
    if (out.length >= MAX_GLUCOSE_READINGS) break;
  }
  return out;
}

export function normalizeGlucoseContext(raw: unknown): GlucoseContext | null {
  if (!raw || typeof raw !== "object") return null;
  const device = normalizeDevice((raw as Record<string, unknown>).device);
  if (device == null) return null;
  return { device };
}

export function hydrateGlucoseContextFromPrescription(vitalsJson?: VitalsJson | null): GlucoseContext {
  const stored = normalizeGlucoseContext(vitalsJson?.glucoseContext);
  const visitDevice = normalizeDevice(vitalsJson?.vitalsGlucoseDevice);
  return {
    device: stored?.device ?? visitDevice ?? DEFAULT_GLUCOSE_CONTEXT.device,
  };
}

export function glucoseContextEquals(a: GlucoseContext, b: GlucoseContext): boolean {
  return (a.device ?? null) === (b.device ?? null);
}

export function readingHasGlucoseDeviceOverride(reading: GlucoseReading): boolean {
  return reading.device != null;
}

export function resolveEffectiveGlucoseDevice(
  reading: GlucoseReading,
  blockContext: GlucoseContext,
): VitalsGlucoseDevice {
  return reading.device ?? blockContext.device ?? DEFAULT_GLUCOSE_CONTEXT.device;
}

export function serializeGlucoseContextForVitalsJson(
  context: GlucoseContext | null | undefined,
): GlucoseContext | undefined {
  const device = normalizeDevice(context?.device) ?? DEFAULT_GLUCOSE_CONTEXT.device;
  if (device === DEFAULT_GLUCOSE_CONTEXT.device) return undefined;
  return { device };
}

function serializeGlucoseReadingRow(
  reading: GlucoseReading,
  blockContext: GlucoseContext,
): GlucoseReading {
  const out: GlucoseReading = { valueMgDl: reading.valueMgDl };
  if (reading.timing != null) out.timing = reading.timing;
  if (reading.sequenceLabel) out.sequenceLabel = reading.sequenceLabel;
  if (reading.note) out.note = reading.note;
  if (reading.device != null && reading.device !== blockContext.device) {
    out.device = reading.device;
  }
  return out;
}

export function compactGlucoseReadingForJson(reading: GlucoseReading): GlucoseReading {
  const out: GlucoseReading = { valueMgDl: reading.valueMgDl };
  if (reading.timing != null) out.timing = reading.timing;
  if (reading.device != null) out.device = reading.device;
  if (reading.sequenceLabel) out.sequenceLabel = reading.sequenceLabel;
  if (reading.note) out.note = reading.note;
  return out;
}

export function glucoseReadingNeedsJsonPersistence(
  reading: GlucoseReading,
  blockContext: GlucoseContext,
): boolean {
  const serialized = serializeGlucoseReadingRow(reading, blockContext);
  return (
    (serialized.note != null && serialized.note.length > 0) ||
    (serialized.sequenceLabel != null && serialized.sequenceLabel.length > 0) ||
    readingHasGlucoseDeviceOverride(serialized) ||
    (serialized.timing != null && serialized.valueMgDl == null)
  );
}

export function glucoseReadingFromColumns(columns: GlucoseColumnSnapshot): GlucoseReading {
  return {
    valueMgDl: columns.valueMgDl,
    timing: columns.timing,
    device: columns.device,
    sequenceLabel: null,
    note: null,
  };
}

export function hasGlucoseColumnData(columns: GlucoseColumnSnapshot): boolean {
  return columns.valueMgDl != null || columns.timing != null || columns.device != null;
}

export function hydrateGlucoseReadingsFromPrescription(args: {
  columns: GlucoseColumnSnapshot;
  vitalsJson?: VitalsJson | null;
}): GlucoseReading[] {
  const fromJson = normalizeGlucoseReadings(args.vitalsJson?.glucoseReadings);
  if (fromJson.length > 0) {
    const primary = fromJson[0]!;
    return [
      {
        ...primary,
        valueMgDl: args.columns.valueMgDl ?? primary.valueMgDl,
        timing: args.columns.timing ?? primary.timing ?? null,
        device: args.columns.device ?? primary.device ?? null,
      },
      ...fromJson.slice(1),
    ];
  }

  if (hasGlucoseColumnData(args.columns)) {
    return [glucoseReadingFromColumns(args.columns)];
  }

  return [createEmptyGlucoseReading()];
}

export function mirrorPrimaryGlucoseReading(readings: readonly GlucoseReading[]): GlucoseColumnSnapshot {
  const primary = readings[0] ?? createEmptyGlucoseReading();
  return {
    valueMgDl: primary.valueMgDl,
    timing: primary.timing ?? null,
    device: primary.device ?? null,
  };
}

export function glucoseReadingRowHasData(reading: GlucoseReading): boolean {
  return glucoseRowHasUiData(reading);
}

export function glucoseClusterHasData(fields: {
  vitalsGlucoseMgDl: number | null;
  vitalsGlucoseReadings: readonly GlucoseReading[];
}): boolean {
  if (fields.vitalsGlucoseMgDl != null) return true;
  return fields.vitalsGlucoseReadings.some((row) => glucoseRowHasUiData(row));
}

export function resolvePrimaryGlucoseForPayload(fields: {
  vitalsGlucoseReadings: readonly GlucoseReading[];
  vitalsGlucoseMgDl: number | null;
  vitalsGlucoseTiming: VitalsGlucoseTiming | null;
  vitalsGlucoseContext: GlucoseContext;
}): GlucoseColumnSnapshot {
  const primary = fields.vitalsGlucoseReadings[0];
  if (primary && glucoseRowHasUiData(primary)) {
    return mirrorPrimaryGlucoseReading(fields.vitalsGlucoseReadings);
  }
  return {
    valueMgDl: fields.vitalsGlucoseMgDl,
    timing: fields.vitalsGlucoseTiming,
    device: fields.vitalsGlucoseContext.device ?? null,
  };
}

export function serializeGlucoseReadingsForVitalsJson(
  readings: readonly GlucoseReading[],
  blockContext?: GlucoseContext | null,
): GlucoseReading[] | undefined {
  const block = hydrateGlucoseContextFromPrescription({ glucoseContext: blockContext ?? null });
  const normalized = readings
    .filter((row) => glucoseRowHasUiData(row))
    .map((row) => serializeGlucoseReadingRow(row, block));
  if (normalized.length === 0) return undefined;
  if (normalized.length > 1) return normalized;
  const single = normalized[0]!;
  return glucoseReadingNeedsJsonPersistence(single, block) ? [single] : undefined;
}

export function glucoseTimingLabel(value: VitalsGlucoseTiming | null | undefined): string | null {
  if (!value) return null;
  return GLUCOSE_TIMING_OPTIONS.find((o) => o.value === value)?.label ?? null;
}

export function glucoseDeviceLabel(value: VitalsGlucoseDevice | null | undefined): string | null {
  if (!value) return null;
  return GLUCOSE_DEVICE_OPTIONS.find((o) => o.value === value)?.label ?? null;
}

export function formatGlucoseReadingContext(
  reading: GlucoseReading,
  blockContext?: GlucoseContext | null,
): string {
  const parts: string[] = [];
  if (reading.sequenceLabel) parts.push(reading.sequenceLabel);
  const timing = glucoseTimingLabel(reading.timing ?? null);
  if (timing) parts.push(timing);
  const block = hydrateGlucoseContextFromPrescription({ glucoseContext: blockContext ?? null });
  const device = glucoseDeviceLabel(resolveEffectiveGlucoseDevice(reading, block));
  if (device && device !== glucoseDeviceLabel(block.device)) parts.push(device);
  return parts.length > 0 ? ` (${parts.join(", ")})` : "";
}

function formatGlucoseReadingValue(reading: GlucoseReading): string | null {
  if (reading.valueMgDl == null) return null;
  return `${reading.valueMgDl} mg/dL`;
}

function appendGlucoseReadingNote(line: string, reading: GlucoseReading): string {
  return reading.note ? `${line} — ${reading.note}` : line;
}

export function derivePrimaryGlucoseReadingSupplementText(
  readings: readonly GlucoseReading[],
  blockContext?: GlucoseContext | null,
): string {
  const normalized = readings.filter((row) => glucoseRowHasUiData(row));
  if (normalized.length !== 1) return "";
  const reading = normalized[0]!;
  if (!reading.note && reading.timing == null && !reading.sequenceLabel) return "";
  const block = hydrateGlucoseContextFromPrescription({ glucoseContext: blockContext ?? null });
  const value = formatGlucoseReadingValue(reading);
  const base = value
    ? `Blood Glucose${formatGlucoseReadingContext(reading, block)}: ${value}`
    : `Blood Glucose${formatGlucoseReadingContext(reading, block)}`.trim() || "Blood Glucose";
  return reading.note ? `${base} — ${reading.note}` : base;
}

export function deriveExtraGlucoseReadingsText(
  readings: readonly GlucoseReading[],
  blockContext?: GlucoseContext | null,
): string {
  const normalized = readings.filter((row) => glucoseRowHasUiData(row));
  if (normalized.length <= 1) return "";
  const block = hydrateGlucoseContextFromPrescription({ glucoseContext: blockContext ?? null });
  const lines: string[] = [];
  for (const reading of normalized.slice(1)) {
    const value = formatGlucoseReadingValue(reading);
    if (!value) continue;
    lines.push(
      appendGlucoseReadingNote(
        `Blood Glucose${formatGlucoseReadingContext(reading, block)}: ${value}`,
        reading,
      ),
    );
  }
  return lines.join("\n");
}

export function glucosePresetFastingAnd2hPp(): GlucoseReading[] {
  return [
    { ...createEmptyGlucoseReading(), timing: "fasting" },
    { ...createEmptyGlucoseReading(), timing: "post_prandial_2h", sequenceLabel: "2h PP" },
  ];
}

export function glucosePresetOgtt3Point(): GlucoseReading[] {
  return [
    { ...createEmptyGlucoseReading(), timing: "ogtt_0h", sequenceLabel: "Fasting" },
    { ...createEmptyGlucoseReading(), timing: "ogtt_1h", sequenceLabel: "1h" },
    { ...createEmptyGlucoseReading(), timing: "ogtt_2h", sequenceLabel: "2h" },
  ];
}

export function glucosePresetWouldDropReadings(
  current: readonly GlucoseReading[],
  preset: readonly GlucoseReading[],
): boolean {
  for (let index = preset.length; index < current.length; index++) {
    if (glucoseRowHasUiData(current[index]!)) return true;
  }
  return false;
}

function overlayGlucoseReadingOntoPresetTemplate(
  template: GlucoseReading,
  source: GlucoseReading | undefined,
): GlucoseReading {
  if (!source) return { ...createEmptyGlucoseReading(), ...template };
  return {
    ...createEmptyGlucoseReading(),
    ...template,
    valueMgDl: source.valueMgDl,
    note: source.note,
    device: source.device,
  };
}

export function mergeGlucoseReadingsWithPreset(
  current: readonly GlucoseReading[],
  preset: readonly GlucoseReading[],
): GlucoseReading[] {
  return preset
    .map((template, index) => overlayGlucoseReadingOntoPresetTemplate(template, current[index]))
    .slice(0, MAX_GLUCOSE_READINGS);
}

export function glucosePrimaryReadingEmpty(valueMgDl: number | null | undefined): boolean {
  return valueMgDl == null;
}
