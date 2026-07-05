/**
 * Clinical vital categorization (ACC/AHA 2017 BP, ADA glucose, standard temp/SpO₂/GCS).
 *
 * Advisory only — not a diagnosis. Used for inline icons + tooltips in the Rx form.
 */

import type { VitalsGlucoseTiming } from "@/lib/cockpit/categorical-vitals-schema";
import type { RangeFlag } from "@/lib/cockpit/vitals-derive";
import { resolveVital, type RangeContext, type VitalKey } from "@/lib/cockpit/vitals-schema";

export type VitalCategorySeverity = "normal" | "mild" | "moderate" | "high" | "critical";

export type VitalCategoryDirection = "low" | "high";

export interface VitalCategoryResult {
  severity: VitalCategorySeverity;
  label: string;
  direction: VitalCategoryDirection | null;
  /** Short guideline attribution for tooltip footnote. */
  source?: string;
}

export interface CategorizeContext extends RangeContext {
  glucoseTiming?: VitalsGlucoseTiming | null;
}

const ACC_AHA = "ACC/AHA 2017";
const ADA = "ADA Standards of Care";

function evaluateRangeFlag(
  key: VitalKey,
  value: number | null | undefined,
  ctx: RangeContext = {},
): RangeFlag {
  if (value == null || !Number.isFinite(value)) return null;
  const band = resolveVital(key).range(ctx);
  if (band == null) return null;
  if (value < band.low) return "low";
  if (value > band.high) return "high";
  return "normal";
}

function result(
  severity: VitalCategorySeverity,
  label: string,
  direction: VitalCategoryDirection | null,
  source?: string,
): VitalCategoryResult {
  return { severity, label, direction, source };
}

function isAdult(ctx: RangeContext): boolean {
  return ctx.ageYears == null || ctx.ageYears >= 13;
}

function isFastingGlucoseTiming(timing: VitalsGlucoseTiming | null | undefined): boolean {
  return timing === "fasting" || timing === "pre_meal" || timing === "ogtt_0h";
}

function isPostPrandialGlucoseTiming(timing: VitalsGlucoseTiming | null | undefined): boolean {
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

/** ACC/AHA 2017 pair classifier — higher category wins. */
export function categorizeBpPair(
  systolic: number | null | undefined,
  diastolic: number | null | undefined,
  ctx: RangeContext = {},
): VitalCategoryResult | null {
  if (systolic == null && diastolic == null) return null;
  if (!Number.isFinite(systolic ?? NaN) && !Number.isFinite(diastolic ?? NaN)) return null;

  if (!isAdult(ctx)) {
    return categorizeBpPairPediatric(systolic, diastolic, ctx);
  }

  const sbp = systolic ?? null;
  const dbp = diastolic ?? null;

  if ((sbp != null && sbp > 180) || (dbp != null && dbp > 120)) {
    return result("critical", "Hypertensive crisis", "high", ACC_AHA);
  }
  if ((sbp != null && sbp >= 140) || (dbp != null && dbp >= 90)) {
    return result("high", "Stage 2 hypertension", "high", ACC_AHA);
  }
  if ((sbp != null && sbp >= 130) || (dbp != null && dbp >= 80)) {
    return result("moderate", "Stage 1 hypertension", "high", ACC_AHA);
  }
  if (sbp != null && sbp >= 120 && sbp <= 129 && (dbp == null || dbp < 80)) {
    return result("mild", "Elevated blood pressure", "high", ACC_AHA);
  }
  if ((sbp != null && sbp < 90) || (dbp != null && dbp < 60)) {
    return result("moderate", "Hypotension", "low", ACC_AHA);
  }
  if (sbp != null && dbp != null && sbp < 120 && dbp < 80) {
    return result("normal", "Normal blood pressure", null, ACC_AHA);
  }

  return categorizeFromRangeFlag(
    "Blood pressure",
    evaluateRangeFlag("vitalsBpSystolic", sbp, ctx) ??
      evaluateRangeFlag("vitalsBpDiastolic", dbp, ctx),
    ACC_AHA,
  );
}

function categorizeBpPairPediatric(
  systolic: number | null | undefined,
  diastolic: number | null | undefined,
  ctx: RangeContext,
): VitalCategoryResult | null {
  const sysFlag = evaluateRangeFlag("vitalsBpSystolic", systolic, ctx);
  const diaFlag = evaluateRangeFlag("vitalsBpDiastolic", diastolic, ctx);
  const flag = severityRank(sysFlag) >= severityRank(diaFlag) ? sysFlag : diaFlag;
  return categorizeFromRangeFlag("Blood pressure", flag, "Pediatric reference range");
}

function severityRank(flag: RangeFlag): number {
  if (flag === "high") return 2;
  if (flag === "low") return 2;
  if (flag === "normal") return 1;
  return 0;
}

function categorizeGlucose(
  valueMgDl: number,
  ctx: CategorizeContext,
): VitalCategoryResult {
  if (valueMgDl < 54) {
    return result("critical", "Severe hypoglycemia (Level 2)", "low", ADA);
  }
  if (valueMgDl < 70) {
    return result("moderate", "Hypoglycemia (Level 1)", "low", ADA);
  }

  if (isFastingGlucoseTiming(ctx.glucoseTiming)) {
    if (valueMgDl >= 126) {
      return result("high", "Diabetes range (fasting)", "high", ADA);
    }
    if (valueMgDl >= 100) {
      return result("mild", "Impaired fasting glucose", "high", ADA);
    }
    return result("normal", "Normal fasting glucose", null, ADA);
  }

  if (isPostPrandialGlucoseTiming(ctx.glucoseTiming) || ctx.glucoseTiming == null) {
    if (valueMgDl >= 200) {
      return result("high", "Diabetes range", "high", ADA);
    }
    if (valueMgDl >= 140) {
      return result("mild", "Impaired glucose tolerance", "high", ADA);
    }
    return result("normal", "Normal glucose", null, ADA);
  }

  return result("normal", "Normal glucose", null, ADA);
}

function categorizeTemperature(valueC: number): VitalCategoryResult {
  if (valueC > 41) {
    return result("critical", "Hyperpyrexia", "high", "CDC / SCCM");
  }
  if (valueC >= 39.1) {
    return result("high", "High fever", "high", "CDC / SCCM");
  }
  if (valueC >= 38.1) {
    return result("moderate", "Fever", "high", "CDC / SCCM");
  }
  if (valueC >= 37.5) {
    return result("mild", "Low-grade fever", "high", "CDC / SCCM");
  }
  if (valueC >= 35) {
    return result("normal", "Normal temperature", null, "CDC / SCCM");
  }
  return result("moderate", "Hypothermia", "low", "WHO");
}

function categorizeSpo2(value: number): VitalCategoryResult {
  if (value < 85) {
    return result("critical", "Severe hypoxemia", "low", "Clinical reference");
  }
  if (value < 91) {
    return result("moderate", "Moderate hypoxemia", "low", "Clinical reference");
  }
  if (value < 95) {
    return result("mild", "Mild hypoxemia", "low", "Clinical reference");
  }
  return result("normal", "Normal oxygen saturation", null, "Clinical reference");
}

function categorizeGcsTotal(value: number): VitalCategoryResult {
  if (value <= 8) {
    return result("critical", "Severe impairment (GCS ≤8)", "low", "TBI classification");
  }
  if (value <= 12) {
    return result("moderate", "Moderate impairment (GCS 9–12)", "low", "TBI classification");
  }
  if (value <= 14) {
    return result("mild", "Mild impairment (GCS 13–14)", "low", "TBI classification");
  }
  return result("normal", "Normal (GCS 15)", null, "TBI classification");
}

function categorizeFromRangeFlag(
  vitalLabel: string,
  flag: RangeFlag,
  source?: string,
): VitalCategoryResult | null {
  if (flag == null || flag === "normal") {
    return flag === "normal" ? result("normal", `Normal ${vitalLabel.toLowerCase()}`, null, source) : null;
  }
  if (flag === "low") {
    return result("moderate", `Below normal ${vitalLabel.toLowerCase()}`, "low", source);
  }
  return result("moderate", `Above normal ${vitalLabel.toLowerCase()}`, "high", source);
}

/** Classify a single canonical vital value for inline display. */
export function categorizeVital(
  key: VitalKey,
  value: number | null | undefined,
  ctx: CategorizeContext = {},
): VitalCategoryResult | null {
  if (value == null || !Number.isFinite(value)) return null;

  switch (key) {
    case "vitalsGlucoseMgDl":
      return categorizeGlucose(value, ctx);
    case "vitalsTempC":
      return categorizeTemperature(value);
    case "vitalsSpo2":
      return categorizeSpo2(value);
    case "vitalsGcsTotal":
      return categorizeGcsTotal(value);
    case "vitalsBpSystolic":
    case "vitalsBpDiastolic":
      return categorizeFromRangeFlag(
        key === "vitalsBpSystolic" ? "systolic blood pressure" : "diastolic blood pressure",
        evaluateRangeFlag(key, value, ctx),
        isAdult(ctx) ? ACC_AHA : "Pediatric reference range",
      );
    default:
      return categorizeFromRangeFlag(resolveVital(key).label, evaluateRangeFlag(key, value, ctx));
  }
}

/** Map legacy binary flag to a minimal category (fallback). */
export function rangeFlagToCategory(
  label: string,
  flag: RangeFlag,
): VitalCategoryResult | null {
  return categorizeFromRangeFlag(label, flag);
}

/** Tailwind classes for category severity + direction. */
export function categoryIconClass(category: VitalCategoryResult): string {
  const { severity, direction } = category;
  if (severity === "critical") {
    return direction === "low" ? "text-blue-700" : "text-red-700";
  }
  if (severity === "high") return "text-red-600";
  if (severity === "moderate") {
    return direction === "low" ? "text-blue-600" : "text-orange-600";
  }
  if (severity === "mild") return "text-amber-600";
  return "text-muted-foreground";
}
