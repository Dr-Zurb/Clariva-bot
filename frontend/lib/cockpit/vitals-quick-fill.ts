/**
 * Common reading chips for fast vitals entry (vitals-section).
 *
 * Canonical-unit values only — display conversion happens at the UI edge.
 */

import type { RxFormFields } from "@/components/cockpit/rx/RxFormContext";
import { createEmptyBpReading } from "@/lib/cockpit/bp-readings";
import { createEmptyGlucoseReading, glucosePrimaryReadingEmpty } from "@/lib/cockpit/glucose-readings";
import { evaluateRange } from "@/lib/cockpit/vitals-derive";
import type { RangeContext, VitalKey } from "@/lib/cockpit/vitals-schema";
import { resolveVital, type VitalUnit } from "@/lib/cockpit/vitals-schema";
import { vitalFieldShortLabel } from "@/lib/cockpit/vitals-group-layout";

export interface BpQuickFillPair {
  label: string;
  systolic: number;
  diastolic: number;
}

/** Common adult BP pairs — shown beside the primary reading when empty. */
export const BP_QUICK_FILL_PAIRS: readonly BpQuickFillPair[] = [
  { label: "110/70", systolic: 110, diastolic: 70 },
  { label: "120/80", systolic: 120, diastolic: 80 },
  { label: "130/80", systolic: 130, diastolic: 80 },
  { label: "140/90", systolic: 140, diastolic: 90 },
] as const;

/** Vitals with inline quick-fill chips and WNL bulk fill support. */
export const QUICK_FILL_VITAL_KEYS = [
  "vitalsHr",
  "vitalsRr",
  "vitalsTempC",
  "vitalsSpo2",
] as const satisfies readonly VitalKey[];

export type QuickFillVitalKey = (typeof QUICK_FILL_VITAL_KEYS)[number];

/** Curated canonical quick-fill values per vital (adult clinic defaults). */
const QUICK_FILL_CANONICAL: Record<QuickFillVitalKey, readonly number[]> = {
  vitalsHr: [72, 80, 88],
  vitalsRr: [16, 18, 20],
  vitalsTempC: [36.8, 37.0, 37.5],
  vitalsSpo2: [98, 99, 100],
};

export interface VitalQuickFillOption {
  label: string;
  canonicalValue: number;
}

export interface WnlVitalFill {
  key: VitalKey;
  canonicalValue: number;
  summaryLine: string;
}

export interface WnlBpFill {
  systolic: number;
  diastolic: number;
  summaryLine: string;
}

export interface WnlGlucoseFill {
  valueMgDl: number;
  summaryLine: string;
}

export interface WnlFillPlan {
  vitals: WnlVitalFill[];
  bp: WnlBpFill | null;
  glucose: WnlGlucoseFill | null;
}

function roundForUnit(value: number, precision: number): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function formatVitalSummaryLine(key: VitalKey, canonicalValue: number): string {
  const def = resolveVital(key);
  const unit = def.displayUnits[0]!;
  const display = roundForUnit(unit.fromCanonical(canonicalValue), unit.precision);
  return `${vitalFieldShortLabel(key)}: ${display} ${unit.unit}`;
}

/** Pick a representative in-range value for bulk WNL fill (prefers middle chip). */
export function resolveTypicalNormalCanonical(
  key: QuickFillVitalKey,
  ctx: RangeContext = {},
): number | null {
  const values = QUICK_FILL_CANONICAL[key];
  const def = resolveVital(key);
  const inBand = values.filter((value) => {
    if (value < def.hardMin || value > def.hardMax) return false;
    const flag = evaluateRange(key, value, ctx);
    return flag === "normal" || flag === null;
  });
  const pool = inBand.length > 0 ? inBand : values.filter((v) => v >= def.hardMin && v <= def.hardMax);
  if (pool.length === 0) return null;
  return pool[Math.floor(pool.length / 2)] ?? pool[0] ?? null;
}

export function resolveTypicalNormalBp(): BpQuickFillPair {
  return (
    BP_QUICK_FILL_PAIRS.find((pair) => pair.label === "120/80") ?? BP_QUICK_FILL_PAIRS[0]!
  );
}

export function resolveTypicalNormalGlucoseMgDl(ctx: RangeContext = {}): number | null {
  const values = [90, 110, 140] as const;
  const key = "vitalsGlucoseMgDl" as const;
  const def = resolveVital(key);
  const inBand = values.filter((value) => {
    const flag = evaluateRange(key, value, ctx);
    return flag === "normal" || flag === null;
  });
  const pool = inBand.length > 0 ? inBand : [...values];
  return pool[Math.floor(pool.length / 2)] ?? pool[0] ?? null;
}

export function buildWnlFillPlan(params: {
  fields: Pick<
    RxFormFields,
    | QuickFillVitalKey
    | "vitalsBpReadings"
    | "vitalsBpSystolic"
    | "vitalsBpDiastolic"
    | "vitalsGlucoseReadings"
    | "vitalsGlucoseMgDl"
  >;
  visibleNumericKeys: ReadonlySet<VitalKey>;
  showBp: boolean;
  showGlucose: boolean;
  ctx?: RangeContext;
}): WnlFillPlan {
  const ctx = params.ctx ?? {};
  const vitals: WnlVitalFill[] = [];

  for (const key of QUICK_FILL_VITAL_KEYS) {
    if (!params.visibleNumericKeys.has(key)) continue;
    const current = params.fields[key];
    if (current != null) continue;
    const canonicalValue = resolveTypicalNormalCanonical(key, ctx);
    if (canonicalValue == null) continue;
    vitals.push({
      key,
      canonicalValue,
      summaryLine: formatVitalSummaryLine(key, canonicalValue),
    });
  }

  let bp: WnlBpFill | null = null;
  if (params.showBp) {
    const primary = params.fields.vitalsBpReadings[0];
    const primaryEmpty = bpPrimaryReadingEmpty(primary?.systolic, primary?.diastolic);
    const legacyEmpty = bpPrimaryReadingEmpty(
      params.fields.vitalsBpSystolic,
      params.fields.vitalsBpDiastolic,
    );
    if (primaryEmpty && legacyEmpty) {
      const pair = resolveTypicalNormalBp();
      bp = {
        systolic: pair.systolic,
        diastolic: pair.diastolic,
        summaryLine: `Blood pressure: ${pair.label} mmHg`,
      };
    }
  }

  let glucose: WnlGlucoseFill | null = null;
  if (params.showGlucose) {
    const primary = params.fields.vitalsGlucoseReadings[0];
    const primaryEmpty = glucosePrimaryReadingEmpty(primary?.valueMgDl);
    const legacyEmpty = glucosePrimaryReadingEmpty(params.fields.vitalsGlucoseMgDl);
    if (primaryEmpty && legacyEmpty) {
      const valueMgDl = resolveTypicalNormalGlucoseMgDl(ctx);
      if (valueMgDl != null) {
        glucose = {
          valueMgDl,
          summaryLine: formatVitalSummaryLine("vitalsGlucoseMgDl", valueMgDl),
        };
      }
    }
  }

  return { vitals, bp, glucose };
}

export function wnlFillPlanHasTargets(plan: WnlFillPlan): boolean {
  return plan.vitals.length > 0 || plan.bp != null || plan.glucose != null;
}

export function applyWnlFillPlan(
  setField: <K extends keyof RxFormFields>(key: K, value: RxFormFields[K]) => void,
  fields: Pick<RxFormFields, "vitalsBpReadings" | "vitalsGlucoseReadings">,
  plan: WnlFillPlan,
): void {
  for (const { key, canonicalValue } of plan.vitals) {
    setField(key, canonicalValue as RxFormFields[typeof key]);
  }
  if (plan.bp) {
    const readings = [...fields.vitalsBpReadings];
    const primary = readings[0] ?? createEmptyBpReading();
    readings[0] = {
      ...primary,
      systolic: plan.bp.systolic,
      diastolic: plan.bp.diastolic,
    };
    setField("vitalsBpReadings", readings);
  }
  if (plan.glucose) {
    const readings = [...fields.vitalsGlucoseReadings];
    const primary = readings[0] ?? createEmptyGlucoseReading();
    readings[0] = {
      ...primary,
      valueMgDl: plan.glucose.valueMgDl,
    };
    setField("vitalsGlucoseReadings", readings);
  }
}

/** Resolve display labels + canonical values for a vital's quick-fill chips. */
export function resolveVitalQuickFillOptions(
  key: VitalKey,
  activeUnit: VitalUnit,
  _ctx: RangeContext = {},
): VitalQuickFillOption[] {
  const values = QUICK_FILL_CANONICAL[key as QuickFillVitalKey];
  if (!values?.length) return [];

  const def = resolveVital(key);
  return values
    .filter((canonical) => canonical >= def.hardMin && canonical <= def.hardMax)
    .map((canonical) => {
      const display = roundForUnit(activeUnit.fromCanonical(canonical), activeUnit.precision);
      return { label: String(display), canonicalValue: canonical };
    });
}

export function bpPrimaryReadingEmpty(
  systolic: number | null | undefined,
  diastolic: number | null | undefined,
): boolean {
  return systolic == null && diastolic == null;
}
