/**
 * Visit-level vitals measurement provenance (teleconsult defaults).
 *
 * `measuredBy` + `setting` apply to all vitals unless a vital-specific override
 * exists (e.g. BP row provenance). Stored in `vitals_json.measurementContext`;
 * legacy rows may only have `bpContext` — hydrate merges both.
 */

import type { BpContext, BpMeasuredBy, BpSetting, VitalsJson } from "@/types/prescription";
import type { VitalKey } from "./vitals-schema";
import { VITAL_ORDER } from "./vitals-schema";
import { isCustomVitalId } from "./vitals-custom";

/** Visit-level who / where — shared across vitals (not device-specific). */
export interface MeasurementContext {
  measuredBy?: BpMeasuredBy | null;
  setting?: BpSetting | null;
}

export type RequiredMeasurementContext = Required<MeasurementContext>;

/** Teleconsult factory default — not persisted when unchanged (byte-parity). */
export const DEFAULT_MEASUREMENT_CONTEXT: Readonly<RequiredMeasurementContext> = {
  measuredBy: "patient",
  setting: "home",
};

/** In-clinic visit baseline — persisted when unchanged from teleconsult zero. */
export const IN_CLINIC_MEASUREMENT_CONTEXT: Readonly<RequiredMeasurementContext> = {
  measuredBy: "nurse",
  setting: "clinic",
};

/** Resolve visit-level who/where defaults from appointment modality. */
export function resolveDefaultMeasurementContext(
  consultationType?: string | null,
): RequiredMeasurementContext {
  if (consultationType === "in_clinic") {
    return { ...IN_CLINIC_MEASUREMENT_CONTEXT };
  }
  return { ...DEFAULT_MEASUREMENT_CONTEXT };
}

const VALID_MEASURED_BY = new Set<BpMeasuredBy>([
  "patient",
  "caregiver",
  "nurse",
  "physician",
  "other",
]);
const VALID_SETTINGS = new Set<BpSetting>(["home", "clinic", "hospital", "pharmacy", "work"]);

function normalizeMeasuredBy(value: unknown): BpMeasuredBy | null {
  return typeof value === "string" && VALID_MEASURED_BY.has(value as BpMeasuredBy)
    ? (value as BpMeasuredBy)
    : null;
}

function normalizeSetting(value: unknown): BpSetting | null {
  return typeof value === "string" && VALID_SETTINGS.has(value as BpSetting)
    ? (value as BpSetting)
    : null;
}

/** Sanitize visit-level measurement context. */
export function normalizeMeasurementContext(raw: unknown): MeasurementContext | null {
  if (!raw || typeof raw !== "object") return null;
  const source = raw as Record<string, unknown>;
  const measuredBy = normalizeMeasuredBy(source.measuredBy);
  const setting = normalizeSetting(source.setting);
  if (measuredBy == null && setting == null) return null;
  return { measuredBy, setting };
}

function normalizeBpContextSlice(raw: unknown): MeasurementContext | null {
  if (!raw || typeof raw !== "object") return null;
  const source = raw as Record<string, unknown>;
  const measuredBy = normalizeMeasuredBy(source.measuredBy);
  const setting = normalizeSetting(source.setting);
  if (measuredBy == null && setting == null) return null;
  return { measuredBy, setting };
}

/** Merge `measurementContext` with legacy `bpContext` who/where fields. */
export function hydrateMeasurementContextFromPrescription(
  vitalsJson?: VitalsJson | null,
  consultationType?: string | null,
): RequiredMeasurementContext {
  const fromMeasurement = normalizeMeasurementContext(vitalsJson?.measurementContext);
  const fromBp = normalizeBpContextSlice(vitalsJson?.bpContext);
  const fallback = resolveDefaultMeasurementContext(consultationType);
  return {
    measuredBy:
      fromMeasurement?.measuredBy ?? fromBp?.measuredBy ?? fallback.measuredBy,
    setting: fromMeasurement?.setting ?? fromBp?.setting ?? fallback.setting,
  };
}

export function measurementContextEquals(
  a: MeasurementContext,
  b: MeasurementContext,
): boolean {
  return (
    (a.measuredBy ?? null) === (b.measuredBy ?? null) &&
    (a.setting ?? null) === (b.setting ?? null)
  );
}

/** Persist only when differing from teleconsult default. */
export function serializeMeasurementContextForVitalsJson(
  context: MeasurementContext | null | undefined,
): MeasurementContext | undefined {
  const normalized = hydrateMeasurementContextFromPrescription({
    measurementContext: context ?? null,
  });
  if (measurementContextEquals(normalized, DEFAULT_MEASUREMENT_CONTEXT)) return undefined;
  return normalized;
}

/** Effective who/where for a vital row inheriting visit defaults. */
export function resolveEffectiveMeasurementProvenance(
  visitContext: MeasurementContext,
  rowOverride?: MeasurementContext | null,
): RequiredMeasurementContext {
  return {
    measuredBy:
      rowOverride?.measuredBy ??
      visitContext.measuredBy ??
      DEFAULT_MEASUREMENT_CONTEXT.measuredBy,
    setting:
      rowOverride?.setting ?? visitContext.setting ?? DEFAULT_MEASUREMENT_CONTEXT.setting,
  };
}

/** BP block context: visit who/where + BP-specific method. */
export function mergeBpBlockContext(
  visitContext: MeasurementContext,
  bpContext: BpContext,
): Required<BpContext> {
  const visit = hydrateMeasurementContextFromPrescription({
    measurementContext: visitContext,
  });
  return {
    measuredBy: bpContext.measuredBy ?? visit.measuredBy,
    method: bpContext.method ?? "auto_upper_arm",
    setting: bpContext.setting ?? visit.setting,
  };
}

/** Tier-1 vitals (original teleconsult override set) — kept for docs/tests. */
export const TIER1_PROVENANCE_VITAL_KEYS = [
  "vitalsWtKg",
  "vitalsGlucoseMgDl",
  "vitalsSpo2",
  "vitalsTempC",
] as const satisfies readonly VitalKey[];

/** Numeric vitals rarely patient-self-measured — used for low-confidence cues. */
export const CLINICIAN_ONLY_VITAL_KEYS = [
  "vitalsRr",
  "vitalsGcsTotal",
  "vitalsPupilSizeLeftMm",
  "vitalsPupilSizeRightMm",
  "vitalsCapillaryRefillS",
  "vitalsFetalHeartRateBpm",
  "vitalsFundalHeightCm",
  "vitalsHeadCircumferenceCm",
  "vitalsMuacCm",
] as const satisfies readonly VitalKey[];

/** BP uses per-reading provenance; pain score is captured elsewhere; GCS E/V/M live in the cluster card. */
export const PROVENANCE_OVERRIDE_EXCLUDED_KEYS = [
  "vitalsBpSystolic",
  "vitalsBpDiastolic",
  "vitalsPainScore",
  "vitalsGcsE",
  "vitalsGcsV",
  "vitalsGcsM",
] as const satisfies readonly VitalKey[];

const PROVENANCE_OVERRIDE_EXCLUDED_SET = new Set<string>(PROVENANCE_OVERRIDE_EXCLUDED_KEYS);

/** Every numeric vital in the grid except BP pair / pain score. */
export const PROVENANCE_OVERRIDE_VITAL_KEYS: readonly VitalKey[] = VITAL_ORDER.filter(
  (key) => !PROVENANCE_OVERRIDE_EXCLUDED_SET.has(key),
);

export type Tier1ProvenanceVitalKey = (typeof TIER1_PROVENANCE_VITAL_KEYS)[number];
export type ProvenanceOverrideVitalKey = Exclude<
  VitalKey,
  (typeof PROVENANCE_OVERRIDE_EXCLUDED_KEYS)[number]
>;

const TIER1_PROVENANCE_SET = new Set<string>(TIER1_PROVENANCE_VITAL_KEYS);
const KNOWN_VITAL_KEY_SET = new Set<string>(VITAL_ORDER);

export type VitalProvenanceMap = Partial<Record<string, MeasurementContext>>;

export function isTier1ProvenanceVital(key: VitalKey): key is Tier1ProvenanceVitalKey {
  return TIER1_PROVENANCE_SET.has(key);
}

export function isProvenanceOverrideVital(key: VitalKey): key is ProvenanceOverrideVitalKey {
  return !PROVENANCE_OVERRIDE_EXCLUDED_SET.has(key);
}

function isKnownVitalKey(key: string): key is VitalKey {
  return KNOWN_VITAL_KEY_SET.has(key);
}

/** Registry override keys + doctor-authored custom vital ids. */
function isPersistableProvenanceKey(key: string): boolean {
  if (isCustomVitalId(key)) return true;
  return isKnownVitalKey(key) && isProvenanceOverrideVital(key);
}

/** True when stored override differs from visit who/where. */
export function hasVitalProvenanceOverride(
  override: MeasurementContext | null | undefined,
  visit: MeasurementContext,
): boolean {
  if (!override) return false;
  const visitNorm = hydrateMeasurementContextFromPrescription({
    measurementContext: visit,
  });
  const effective = resolveEffectiveMeasurementProvenance(visitNorm, override);
  return !measurementContextEquals(effective, visitNorm);
}

/** Sanitize per-vital provenance map — drops unknown keys and empty entries. */
export function normalizeVitalProvenance(raw: unknown): VitalProvenanceMap | null {
  if (!raw || typeof raw !== "object") return null;
  const source = raw as Record<string, unknown>;
  const out: VitalProvenanceMap = {};

  for (const [key, value] of Object.entries(source)) {
    if (!isPersistableProvenanceKey(key)) continue;
    const ctx = normalizeMeasurementContext(value);
    if (!ctx) continue;
    out[key] = ctx;
  }

  return Object.keys(out).length > 0 ? out : null;
}

/** Read per-vital overrides from `vitals_json`. */
export function hydrateVitalProvenanceFromPrescription(
  vitalsJson?: VitalsJson | null,
): VitalProvenanceMap {
  return normalizeVitalProvenance(vitalsJson?.vitalProvenance) ?? {};
}

/**
 * Persist only entries that differ from visit who/where (byte-parity).
 * Provenance-override keys only — other keys are dropped on write.
 */
export function serializeVitalProvenanceForVitalsJson(
  visitContext: MeasurementContext | null | undefined,
  overrides: VitalProvenanceMap | null | undefined,
): Record<string, MeasurementContext> | undefined {
  const visit = hydrateMeasurementContextFromPrescription({
    measurementContext: visitContext ?? null,
  });
  const source = overrides ?? {};
  const out: Record<string, MeasurementContext> = {};

  const keysToSerialize = new Set<string>([
    ...PROVENANCE_OVERRIDE_VITAL_KEYS,
    ...Object.keys(source).filter(isCustomVitalId),
  ]);

  for (const key of keysToSerialize) {
    const override = source[key];
    if (!override || !hasVitalProvenanceOverride(override, visit)) continue;
    const effective = resolveEffectiveMeasurementProvenance(visit, override);
    const compact: MeasurementContext = {};
    if (effective.measuredBy !== visit.measuredBy) compact.measuredBy = effective.measuredBy;
    if (effective.setting !== visit.setting) compact.setting = effective.setting;
    if (Object.keys(compact).length > 0) out[key] = compact;
  }

  return Object.keys(out).length > 0 ? out : undefined;
}
