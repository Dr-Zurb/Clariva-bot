/**
 * Multi-reading BP helpers (vitals-section).
 *
 * Primary reading (index 0) mirrors legacy `vitals_bp_*` columns. Additional
 * readings persist in `prescriptions.vitals_json.bpReadings` only when length > 1
 * (byte-parity with single-reading rows).
 */

import type {
  BpContext,
  BpMeasuredBy,
  BpMethod,
  BpReading,
  BpSetting,
  VitalsBpLimb,
  VitalsBpPosture,
  VitalsJson,
} from "@/types/prescription";
import {
  hydrateMeasurementContextFromPrescription,
  DEFAULT_MEASUREMENT_CONTEXT,
} from "./measurement-context";

export const MAX_BP_READINGS = 10;
export const BP_SEQUENCE_LABEL_MAX_LEN = 24;
export const BP_NOTE_MAX_LEN = 200;

/** Inter-arm systolic difference threshold (mmHg) — flag when exceeded. */
export const INTER_ARM_SYSTOLIC_DELTA_THRESHOLD = 10;

/** Orthostatic hypotension thresholds (mmHg). */
export const ORTHOSTATIC_SYSTOLIC_DROP_THRESHOLD = 20;
export const ORTHOSTATIC_DIASTOLIC_DROP_THRESHOLD = 10;

export const BP_POSTURE_OPTIONS = [
  { value: "sitting", label: "Sitting" },
  { value: "standing", label: "Standing" },
  { value: "supine", label: "Supine" },
] as const satisfies readonly { value: VitalsBpPosture; label: string }[];

export const BP_LIMB_OPTIONS = [
  { value: "left_arm", label: "Left arm" },
  { value: "right_arm", label: "Right arm" },
  { value: "left_leg", label: "Left leg" },
  { value: "right_leg", label: "Right leg" },
] as const satisfies readonly { value: VitalsBpLimb; label: string }[];

export const BP_MEASURED_BY_OPTIONS = [
  { value: "patient", label: "Patient" },
  { value: "caregiver", label: "Caregiver" },
  { value: "nurse", label: "Clinic staff" },
  { value: "physician", label: "Physician" },
  { value: "other", label: "Other" },
] as const satisfies readonly { value: BpMeasuredBy; label: string }[];

export const BP_METHOD_OPTIONS = [
  { value: "auto_upper_arm", label: "Automatic" },
  { value: "manual_auscultatory", label: "Manual auscultatory" },
  { value: "wrist_monitor", label: "Wrist monitor" },
  { value: "wearable", label: "Wearable" },
  { value: "kiosk", label: "Kiosk" },
] as const satisfies readonly { value: BpMethod; label: string }[];

export const BP_SETTING_OPTIONS = [
  { value: "home", label: "Home" },
  { value: "clinic", label: "Clinic" },
  { value: "hospital", label: "Hospital" },
  { value: "pharmacy", label: "Pharmacy" },
  { value: "work", label: "Work" },
] as const satisfies readonly { value: BpSetting; label: string }[];

/** Teleconsult default — not persisted when unchanged (byte-parity). */
export const DEFAULT_BP_CONTEXT: Readonly<Required<BpContext>> = {
  ...DEFAULT_MEASUREMENT_CONTEXT,
  method: "auto_upper_arm",
};

const VALID_POSTURES = new Set<string>(BP_POSTURE_OPTIONS.map((o) => o.value));
const VALID_LIMBS = new Set<string>(BP_LIMB_OPTIONS.map((o) => o.value));
const VALID_MEASURED_BY = new Set<string>(BP_MEASURED_BY_OPTIONS.map((o) => o.value));
const VALID_METHODS = new Set<string>(BP_METHOD_OPTIONS.map((o) => o.value));
const VALID_SETTINGS = new Set<string>(BP_SETTING_OPTIONS.map((o) => o.value));

const SYS_MIN = 30;
const SYS_MAX = 300;
const DIA_MIN = 20;
const DIA_MAX = 200;

export interface BpColumnSnapshot {
  systolic: number | null;
  diastolic: number | null;
  posture: VitalsBpPosture | null;
  limb: VitalsBpLimb | null;
}

export function createEmptyBpReading(): BpReading {
  return {
    systolic: null,
    diastolic: null,
    posture: null,
    limb: null,
    sequenceLabel: null,
    note: null,
  };
}

function clampBpNumber(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < min || value > max) return null;
  return value;
}

function normalizePosture(value: unknown): VitalsBpPosture | null {
  return typeof value === "string" && VALID_POSTURES.has(value)
    ? (value as VitalsBpPosture)
    : null;
}

function normalizeLimb(value: unknown): VitalsBpLimb | null {
  return typeof value === "string" && VALID_LIMBS.has(value) ? (value as VitalsBpLimb) : null;
}

function normalizeMeasuredBy(value: unknown): BpMeasuredBy | null {
  return typeof value === "string" && VALID_MEASURED_BY.has(value)
    ? (value as BpMeasuredBy)
    : null;
}

function normalizeMethod(value: unknown): BpMethod | null {
  return typeof value === "string" && VALID_METHODS.has(value) ? (value as BpMethod) : null;
}

function normalizeSetting(value: unknown): BpSetting | null {
  return typeof value === "string" && VALID_SETTINGS.has(value) ? (value as BpSetting) : null;
}

function normalizeSequenceLabel(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, BP_SEQUENCE_LABEL_MAX_LEN);
}

function normalizeNote(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, BP_NOTE_MAX_LEN);
}

/** Sanitize one BP reading row; null numbers dropped, invalid enums stripped. */
export function normalizeBpReading(raw: unknown): BpReading | null {
  if (!raw || typeof raw !== "object") return null;
  const source = raw as Record<string, unknown>;
  const systolic = clampBpNumber(source.systolic, SYS_MIN, SYS_MAX);
  const diastolic = clampBpNumber(source.diastolic, DIA_MIN, DIA_MAX);
  if (systolic == null && diastolic == null) return null;

  return {
    systolic,
    diastolic,
    posture: normalizePosture(source.posture),
    limb: normalizeLimb(source.limb),
    sequenceLabel: normalizeSequenceLabel(source.sequenceLabel),
    measuredBy: normalizeMeasuredBy(source.measuredBy),
    method: normalizeMethod(source.method),
    setting: normalizeSetting(source.setting),
    note: normalizeNote(source.note),
  };
}

/** Sanitize a BP readings array (drops invalid rows, caps length). */
export function normalizeBpReadings(readings: unknown): BpReading[] {
  if (!Array.isArray(readings)) return [];
  const out: BpReading[] = [];
  for (const raw of readings) {
    const row = normalizeBpReading(raw);
    if (row) out.push(row);
    if (out.length >= MAX_BP_READINGS) break;
  }
  return out;
}

/** Sanitize visit-level BP context; invalid enum values dropped. */
export function normalizeBpContext(raw: unknown): BpContext | null {
  if (!raw || typeof raw !== "object") return null;
  const source = raw as Record<string, unknown>;
  const measuredBy = normalizeMeasuredBy(source.measuredBy);
  const method = normalizeMethod(source.method);
  const setting = normalizeSetting(source.setting);
  if (measuredBy == null && method == null && setting == null) return null;
  return { measuredBy, method, setting };
}

/** Merge stored context with teleconsult defaults for form UI. */
export function hydrateBpContextFromPrescription(vitalsJson?: VitalsJson | null): BpContext {
  const visit = hydrateMeasurementContextFromPrescription(vitalsJson);
  const stored = normalizeBpContext(vitalsJson?.bpContext);
  return {
    measuredBy: stored?.measuredBy ?? visit.measuredBy,
    method: stored?.method ?? DEFAULT_BP_CONTEXT.method,
    setting: stored?.setting ?? visit.setting,
  };
}

/** Resolve effective provenance for a row (row override → block → default). */
export function resolveEffectiveBpProvenance(
  reading: BpReading,
  blockContext: BpContext,
): Required<BpContext> {
  return {
    measuredBy:
      reading.measuredBy ?? blockContext.measuredBy ?? DEFAULT_BP_CONTEXT.measuredBy,
    method: reading.method ?? blockContext.method ?? DEFAULT_BP_CONTEXT.method,
    setting: reading.setting ?? blockContext.setting ?? DEFAULT_BP_CONTEXT.setting,
  };
}

export function bpContextEquals(a: BpContext, b: BpContext): boolean {
  return (
    (a.measuredBy ?? null) === (b.measuredBy ?? null) &&
    (a.method ?? null) === (b.method ?? null) &&
    (a.setting ?? null) === (b.setting ?? null)
  );
}

/** True when a row stores explicit provenance overrides. */
export function readingHasContextOverride(reading: BpReading): boolean {
  return reading.measuredBy != null || reading.method != null || reading.setting != null;
}

/**
 * Persist BP cuff method only when it differs from teleconsult default.
 * Who / where live in `measurementContext` (shared visit provenance).
 */
export function serializeBpContextForVitalsJson(
  context: BpContext | null | undefined,
): BpContext | undefined {
  const stored = normalizeBpContext(context);
  const method = stored?.method ?? DEFAULT_BP_CONTEXT.method;
  if (method == null || method === DEFAULT_BP_CONTEXT.method) return undefined;
  return { method };
}

function serializeBpReadingRow(
  reading: BpReading,
  blockContext: BpContext,
): BpReading {
  const out: BpReading = {
    systolic: reading.systolic,
    diastolic: reading.diastolic,
  };
  if (reading.posture != null) out.posture = reading.posture;
  if (reading.limb != null) out.limb = reading.limb;
  if (reading.sequenceLabel) out.sequenceLabel = reading.sequenceLabel;
  if (reading.note) out.note = reading.note;
  if (reading.measuredBy != null && reading.measuredBy !== blockContext.measuredBy) {
    out.measuredBy = reading.measuredBy;
  }
  if (reading.method != null && reading.method !== blockContext.method) {
    out.method = reading.method;
  }
  if (reading.setting != null && reading.setting !== blockContext.setting) {
    out.setting = reading.setting;
  }
  return out;
}

/** Drop null optional keys before persisting to vitals_json. */
export function compactBpReadingForJson(reading: BpReading): BpReading {
  const out: BpReading = {
    systolic: reading.systolic,
    diastolic: reading.diastolic,
  };
  if (reading.posture != null) out.posture = reading.posture;
  if (reading.limb != null) out.limb = reading.limb;
  if (reading.sequenceLabel) out.sequenceLabel = reading.sequenceLabel;
  if (reading.note) out.note = reading.note;
  if (reading.measuredBy != null) out.measuredBy = reading.measuredBy;
  if (reading.method != null) out.method = reading.method;
  if (reading.setting != null) out.setting = reading.setting;
  return out;
}

/** True when json-only fields on a row require persisting `bpReadings`. */
export function bpReadingNeedsJsonPersistence(
  reading: BpReading,
  blockContext: BpContext,
): boolean {
  const serialized = serializeBpReadingRow(reading, blockContext);
  return (
    (serialized.note != null && serialized.note.length > 0) ||
    (serialized.sequenceLabel != null && serialized.sequenceLabel.length > 0) ||
    readingHasContextOverride(serialized)
  );
}

export function bpReadingFromColumns(columns: BpColumnSnapshot): BpReading {
  return {
    systolic: columns.systolic,
    diastolic: columns.diastolic,
    posture: columns.posture,
    limb: columns.limb,
    sequenceLabel: null,
  };
}

export function hasBpColumnData(columns: BpColumnSnapshot): boolean {
  return (
    columns.systolic != null ||
    columns.diastolic != null ||
    columns.posture != null ||
    columns.limb != null
  );
}

/**
 * Hydrate form readings from persisted columns + optional json array.
 * Always returns at least one row for the BP block UI.
 */
export function hydrateBpReadingsFromPrescription(args: {
  columns: BpColumnSnapshot;
  vitalsJson?: VitalsJson | null;
}): BpReading[] {
  const fromJson = normalizeBpReadings(args.vitalsJson?.bpReadings);
  if (fromJson.length > 0) {
    const primary = fromJson[0]!;
    return [
      {
        ...primary,
        systolic: args.columns.systolic ?? primary.systolic,
        diastolic: args.columns.diastolic ?? primary.diastolic,
        posture: args.columns.posture ?? primary.posture ?? null,
        limb: args.columns.limb ?? primary.limb ?? null,
      },
      ...fromJson.slice(1),
    ];
  }

  if (hasBpColumnData(args.columns)) {
    return [bpReadingFromColumns(args.columns)];
  }

  return [createEmptyBpReading()];
}

/** Primary reading mirrors legacy columns on save. */
export function mirrorPrimaryBpReading(readings: readonly BpReading[]): BpColumnSnapshot {
  const primary = readings[0] ?? createEmptyBpReading();
  return {
    systolic: primary.systolic,
    diastolic: primary.diastolic,
    posture: primary.posture ?? null,
    limb: primary.limb ?? null,
  };
}

function readingRowHasData(reading: BpReading): boolean {
  return (
    reading.systolic != null ||
    reading.diastolic != null ||
    reading.posture != null ||
    reading.limb != null ||
    (reading.sequenceLabel != null && reading.sequenceLabel.length > 0) ||
    (reading.note != null && reading.note.length > 0)
  );
}

/** Whether a row carries clinician-entered data (for preset drop warnings). */
export function bpReadingRowHasData(reading: BpReading): boolean {
  return readingRowHasData(reading);
}

/**
 * Resolve the primary BP snapshot for payload/template export.
 * Prefers `vitalsBpReadings[0]` when populated; falls back to legacy flat columns
 * (templates / direct field writes that bypass the BP block).
 */
export function resolvePrimaryBpForPayload(fields: {
  vitalsBpReadings: readonly BpReading[];
  vitalsBpSystolic: number | null;
  vitalsBpDiastolic: number | null;
  vitalsBpPosture: VitalsBpPosture | null;
  vitalsBpLimb: VitalsBpLimb | null;
}): BpColumnSnapshot {
  const primary = fields.vitalsBpReadings[0];
  if (primary && readingRowHasData(primary)) {
    return mirrorPrimaryBpReading(fields.vitalsBpReadings);
  }
  return {
    systolic: fields.vitalsBpSystolic,
    diastolic: fields.vitalsBpDiastolic,
    posture: fields.vitalsBpPosture,
    limb: fields.vitalsBpLimb,
  };
}

/**
 * Persist multi-reading array in vitals_json when length > 1, or when a single
 * row carries json-only fields (note, label, per-row provenance). Byte-parity:
 * a lone reading with only column-backed fields stays legacy-columns-only.
 */
export function serializeBpReadingsForVitalsJson(
  readings: readonly BpReading[],
  blockContext?: BpContext | null,
): BpReading[] | undefined {
  const block = hydrateBpContextFromPrescription({ bpContext: blockContext ?? null });
  const normalized = normalizeBpReadings(readings).map((row) =>
    serializeBpReadingRow(row, block),
  );
  if (normalized.length === 0) return undefined;
  if (normalized.length > 1) return normalized;
  const single = normalized[0]!;
  return bpReadingNeedsJsonPersistence(single, block) ? [single] : undefined;
}

export function bpPostureLabel(value: VitalsBpPosture | null | undefined): string | null {
  if (!value) return null;
  return BP_POSTURE_OPTIONS.find((o) => o.value === value)?.label ?? null;
}

export function bpLimbLabel(value: VitalsBpLimb | null | undefined): string | null {
  if (!value) return null;
  return BP_LIMB_OPTIONS.find((o) => o.value === value)?.label ?? null;
}

export function bpMeasuredByLabel(value: BpMeasuredBy | null | undefined): string | null {
  if (!value) return null;
  return BP_MEASURED_BY_OPTIONS.find((o) => o.value === value)?.label ?? null;
}

export function bpMethodLabel(value: BpMethod | null | undefined): string | null {
  if (!value) return null;
  return BP_METHOD_OPTIONS.find((o) => o.value === value)?.label ?? null;
}

export function bpSettingLabel(value: BpSetting | null | undefined): string | null {
  if (!value) return null;
  return BP_SETTING_OPTIONS.find((o) => o.value === value)?.label ?? null;
}

/** Human-readable provenance suffix when non-default, e.g. " · Nurse · Clinic". */
export function formatBpProvenanceContext(provenance: Required<BpContext>): string {
  if (bpContextEquals(provenance, DEFAULT_BP_CONTEXT)) return "";
  const parts: string[] = [];
  const by = bpMeasuredByLabel(provenance.measuredBy);
  const method = bpMethodLabel(provenance.method);
  const setting = bpSettingLabel(provenance.setting);
  if (by) parts.push(by);
  if (method) parts.push(method);
  if (setting) parts.push(setting);
  return parts.length > 0 ? ` · ${parts.join(" · ")}` : "";
}

/** Human-readable qualifier suffix, e.g. "(Sitting, Left arm)". */
export function formatBpReadingContext(
  reading: BpReading,
  blockContext?: BpContext | null,
): string {
  const parts: string[] = [];
  if (reading.sequenceLabel) parts.push(reading.sequenceLabel);
  const posture = bpPostureLabel(reading.posture ?? null);
  if (posture) parts.push(posture);
  const limb = bpLimbLabel(reading.limb ?? null);
  if (limb) parts.push(limb);
  const block = hydrateBpContextFromPrescription({ bpContext: blockContext ?? null });
  const provenance = resolveEffectiveBpProvenance(reading, block);
  const provenanceSuffix = formatBpProvenanceContext(provenance);
  if (provenanceSuffix) parts.push(provenanceSuffix.replace(/^ · /, ""));
  return parts.length > 0 ? ` (${parts.join(", ")})` : "";
}

function formatBpReadingValue(reading: BpReading): string | null {
  const sys = reading.systolic;
  const dia = reading.diastolic;
  if (sys == null && dia == null) return null;
  return sys != null && dia != null
    ? `${sys}/${dia} mmHg`
    : sys != null
      ? `${sys} mmHg systolic`
      : `${dia} mmHg diastolic`;
}

function appendBpReadingNote(line: string, reading: BpReading): string {
  return reading.note ? `${line} — ${reading.note}` : line;
}

/** Supplement for a lone primary reading stored in json (e.g. note-only metadata). */
export function derivePrimaryBpReadingSupplementText(
  readings: readonly BpReading[],
  blockContext?: BpContext | null,
): string {
  const normalized = normalizeBpReadings(readings);
  if (normalized.length !== 1) return "";
  const reading = normalized[0]!;
  if (!reading.note) return "";
  const block = hydrateBpContextFromPrescription({ bpContext: blockContext ?? null });
  const value = formatBpReadingValue(reading);
  const base = value
    ? `BP${formatBpReadingContext(reading, block)}: ${value}`
    : `BP${formatBpReadingContext(reading, block)}`.trim() || "BP";
  return `${base} — ${reading.note}`;
}

/** Derive additive text for readings beyond the primary (index ≥ 1). */
export function deriveExtraBpReadingsText(
  readings: readonly BpReading[],
  blockContext?: BpContext | null,
): string {
  const normalized = normalizeBpReadings(readings);
  if (normalized.length <= 1) return "";

  const block = hydrateBpContextFromPrescription({ bpContext: blockContext ?? null });
  const lines: string[] = [];
  for (const reading of normalized.slice(1)) {
    const value = formatBpReadingValue(reading);
    if (!value) continue;
    lines.push(appendBpReadingNote(`BP${formatBpReadingContext(reading, block)}: ${value}`, reading));
  }
  return lines.join("\n");
}

export interface InterArmDeltaResult {
  delta: number;
  leftSystolic: number;
  rightSystolic: number;
  flagged: boolean;
}

/** Compare left vs right arm systolic when both readings exist. */
export function computeInterArmDelta(readings: readonly BpReading[]): InterArmDeltaResult | null {
  const left = readings.find((r) => r.limb === "left_arm" && r.systolic != null);
  const right = readings.find((r) => r.limb === "right_arm" && r.systolic != null);
  if (!left?.systolic || !right?.systolic) return null;
  const delta = Math.abs(left.systolic - right.systolic);
  return {
    delta,
    leftSystolic: left.systolic,
    rightSystolic: right.systolic,
    flagged: delta > INTER_ARM_SYSTOLIC_DELTA_THRESHOLD,
  };
}

export interface OrthostaticDropResult {
  baselinePosture: VitalsBpPosture;
  targetPosture: VitalsBpPosture;
  systolicDrop: number;
  diastolicDrop: number;
  flagged: boolean;
}

/**
 * Flag orthostatic hypotension: supine→standing drop when both exist.
 * Uses the first matching pair in array order.
 */
export function computeOrthostaticDrop(
  readings: readonly BpReading[],
): OrthostaticDropResult | null {
  const supine = readings.find((r) => r.posture === "supine" && r.systolic != null);
  const standing = readings.find((r) => r.posture === "standing" && r.systolic != null);
  if (!supine?.systolic || !standing?.systolic) return null;

  const systolicDrop = supine.systolic - standing.systolic;
  const diastolicDrop = (supine.diastolic ?? 0) - (standing.diastolic ?? 0);
  const flagged =
    systolicDrop >= ORTHOSTATIC_SYSTOLIC_DROP_THRESHOLD ||
    diastolicDrop >= ORTHOSTATIC_DIASTOLIC_DROP_THRESHOLD;

  return {
    baselinePosture: "supine",
    targetPosture: "standing",
    systolicDrop,
    diastolicDrop,
    flagged,
  };
}

export interface AverageBpResult {
  systolic: number;
  diastolic: number;
  count: number;
}

/** Mean of all readings with both sys and dia present. */
export function computeAverageBp(readings: readonly BpReading[]): AverageBpResult | null {
  const complete = readings.filter((r) => r.systolic != null && r.diastolic != null);
  if (complete.length === 0) return null;
  const systolic =
    complete.reduce((sum, r) => sum + (r.systolic as number), 0) / complete.length;
  const diastolic =
    complete.reduce((sum, r) => sum + (r.diastolic as number), 0) / complete.length;
  return {
    systolic: Math.round(systolic),
    diastolic: Math.round(diastolic),
    count: complete.length,
  };
}

/** Preset row seeds for common clinical patterns. */
export function bpPresetBothArms(): BpReading[] {
  return [
    { ...createEmptyBpReading(), posture: "sitting", limb: "left_arm" },
    { ...createEmptyBpReading(), posture: "sitting", limb: "right_arm" },
  ];
}

export function bpPresetOrthostatic(): BpReading[] {
  return [
    { ...createEmptyBpReading(), posture: "supine", sequenceLabel: "Lying" },
    { ...createEmptyBpReading(), posture: "sitting", sequenceLabel: "1 min" },
    { ...createEmptyBpReading(), posture: "standing", sequenceLabel: "3 min" },
  ];
}

/** True when applying a preset would discard data from rows beyond the template length. */
export function bpPresetWouldDropReadings(
  current: readonly BpReading[],
  preset: readonly BpReading[],
): boolean {
  for (let index = preset.length; index < current.length; index++) {
    if (readingRowHasData(current[index]!)) return true;
  }
  return false;
}

/** Carry measured values forward; preset row supplies posture/limb/sequence scaffolding. */
function overlayBpReadingOntoPresetTemplate(
  template: BpReading,
  source: BpReading | undefined,
): BpReading {
  if (!source) return { ...createEmptyBpReading(), ...template };
  return {
    ...createEmptyBpReading(),
    ...template,
    systolic: source.systolic,
    diastolic: source.diastolic,
    note: source.note,
    measuredBy: source.measuredBy,
    method: source.method,
    setting: source.setting,
  };
}

/**
 * Reshape readings to match a clinical preset (exact row count).
 * Preserves systolic/diastolic/note/provenance by index; posture/limb/label from preset.
 */
export function mergeBpReadingsWithPreset(
  current: readonly BpReading[],
  preset: readonly BpReading[],
): BpReading[] {
  const shaped = preset.map((template, index) =>
    overlayBpReadingOntoPresetTemplate(template, current[index]),
  );
  return shaped.slice(0, MAX_BP_READINGS);
}
