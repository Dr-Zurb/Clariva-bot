/**
 * Static reference tables for vital range / classifier help popovers.
 * Advisory only — mirrors thresholds in vital-categories.ts.
 */

import type { VitalsGlucoseTiming } from "@/lib/cockpit/categorical-vitals-schema";
import { resolveVital, type RangeContext, type VitalKey } from "@/lib/cockpit/vitals-schema";

export interface VitalRangeReferenceRow {
  label: string;
  range: string;
}

export const BP_ACC_AHA_ADULT_RANGES: readonly VitalRangeReferenceRow[] = [
  { label: "Normal", range: "<120 and <80 mmHg" },
  { label: "Elevated", range: "120–129 and <80 mmHg" },
  { label: "Stage 1 hypertension", range: "130–139 or 80–89 mmHg" },
  { label: "Stage 2 hypertension", range: "≥140 or ≥90 mmHg" },
  { label: "Hypertensive crisis", range: ">180 or >120 mmHg" },
  { label: "Hypotension", range: "<90 or <60 mmHg" },
];

export const GLUCOSE_HYPOGLYCEMIA_RANGES: readonly VitalRangeReferenceRow[] = [
  { label: "Level 1 hypoglycemia", range: "54–69 mg/dL" },
  { label: "Level 2 (severe)", range: "<54 mg/dL" },
];

export const GLUCOSE_FASTING_RANGES: readonly VitalRangeReferenceRow[] = [
  { label: "Normal fasting", range: "70–99 mg/dL" },
  { label: "Impaired fasting glucose", range: "100–125 mg/dL" },
  { label: "Diabetes range", range: "≥126 mg/dL" },
];

export const GLUCOSE_POST_PRANDIAL_RANGES: readonly VitalRangeReferenceRow[] = [
  { label: "Normal", range: "<140 mg/dL" },
  { label: "Impaired glucose tolerance", range: "140–199 mg/dL" },
  { label: "Diabetes range", range: "≥200 mg/dL" },
];

export const TEMPERATURE_RANGES: readonly VitalRangeReferenceRow[] = [
  { label: "Hypothermia", range: "<35 °C" },
  { label: "Normal", range: "35–37.4 °C" },
  { label: "Low-grade fever", range: "37.5–38.0 °C" },
  { label: "Fever", range: "38.1–39.0 °C" },
  { label: "High fever", range: "39.1–41.0 °C" },
  { label: "Hyperpyrexia", range: ">41 °C" },
];

export const SPO2_RANGES: readonly VitalRangeReferenceRow[] = [
  { label: "Normal", range: "≥95%" },
  { label: "Mild hypoxemia", range: "91–94%" },
  { label: "Moderate hypoxemia", range: "85–90%" },
  { label: "Severe hypoxemia", range: "<85%" },
];

export const GCS_SEVERITY_RANGES: readonly VitalRangeReferenceRow[] = [
  { label: "Normal", range: "15" },
  { label: "Mild impairment", range: "13–14" },
  { label: "Moderate impairment", range: "9–12" },
  { label: "Severe impairment", range: "≤8" },
];

export const ACC_AHA_SOURCE = "ACC/AHA 2017";
export const ADA_SOURCE = "ADA Standards of Care";
export const TEMP_SOURCE = "CDC / SCCM";
export const SPO2_SOURCE = "Clinical reference";
export const GCS_SEVERITY_SOURCE = "TBI classification";

const BLOCK_LEVEL_VITAL_KEYS = new Set<VitalKey>([
  "vitalsBpSystolic",
  "vitalsBpDiastolic",
  "vitalsGlucoseMgDl",
]);

const GCS_COMPONENT_KEYS = new Set<VitalKey>(["vitalsGcsE", "vitalsGcsV", "vitalsGcsM"]);

export type VitalRangeHelpKind = "bp" | "glucose" | VitalKey;

export function isAdultRangeContext(ctx: RangeContext): boolean {
  return ctx.ageYears == null || ctx.ageYears >= 13;
}

/** Whether a grid vital should show the ? range reference (block vitals use kind bp/glucose). */
export function vitalKeyHasRangeReference(key: VitalKey, ctx: RangeContext = {}): boolean {
  if (BLOCK_LEVEL_VITAL_KEYS.has(key) || GCS_COMPONENT_KEYS.has(key)) return false;
  if (key === "vitalsTempC" || key === "vitalsSpo2" || key === "vitalsGcsTotal") return true;
  return resolveVital(key).range(ctx) != null;
}

export function resolveRegistryAdvisoryBand(
  key: VitalKey,
  ctx: RangeContext = {},
): { label: string; unit: string; low: number; high: number } | null {
  const def = resolveVital(key);
  const band = def.range(ctx);
  if (band == null) return null;
  return {
    label: def.label,
    unit: def.canonicalUnit,
    low: band.low,
    high: band.high,
  };
}

export function resolveVitalRangeHelpTitle(kind: VitalRangeHelpKind): string {
  if (kind === "bp") return "Blood pressure reference";
  if (kind === "glucose") return "Blood glucose reference";
  const def = resolveVital(kind);
  return `${def.label} reference`;
}

export function isFastingGlucoseTiming(
  timing: VitalsGlucoseTiming | null | undefined,
): boolean {
  return timing === "fasting" || timing === "pre_meal" || timing === "ogtt_0h";
}

export function isPostPrandialGlucoseTiming(
  timing: VitalsGlucoseTiming | null | undefined,
): boolean {
  return (
    timing === "post_prandial_2h" ||
    timing === "ogtt_2h" ||
    timing === "post_prandial" ||
    timing === "post_meal" ||
    timing === "post_prandial_1h" ||
    timing === "ogtt_1h" ||
    timing === "ogtt_3h" ||
    timing === "random" ||
    timing === "bedtime"
  );
}
