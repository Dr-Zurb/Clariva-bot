/**
 * Vitals 2.0 derived calculators (objective-tab · obj-06).
 *
 * Pure, deterministic math layer — no React, no I/O, no `Date.now`. The
 * Vitals analog of `bmi.ts`. Two responsibilities:
 *   1. Unit converters between display and canonical units (round-trip stable).
 *   2. Derived clinical values (MAP, BSA) + the advisory range-flag evaluator.
 *
 * Canonical units are the storage units (migration 103/151): °C, kg, cm,
 * mg/dL, mmHg, bpm, breaths/min, %. Conversion is a *display* concern; storage
 * never sees a non-canonical value (P2-D2).
 *
 * Round-trip stability: every converter pair (e.g. `cToF`/`fToC`) is an exact
 * affine inverse, so `fToC(cToF(x)) === x` to within floating-point epsilon
 * (asserted < 1e-9 in tests; obj-08 close-gate relies on this).
 *
 * The unit converters live in the dependency-free leaf `vitals-units.ts` and
 * are re-exported here for back-compat; `vitals-schema.ts` imports them from
 * the leaf directly, so there is no runtime import cycle between schema and
 * derive. `evaluateRange` imports `resolveVital` from `vitals-schema.ts` — a
 * one-directional, call-time-only reference.
 */

import { resolveVital, type RangeContext, type VitalKey } from "./vitals-schema";

// ---------------------------------------------------------------------------
// 1. Unit converters (re-exported from the leaf `vitals-units.ts`)
// ---------------------------------------------------------------------------

export {
  cToF,
  fToC,
  kgToLb,
  lbToKg,
  cmToIn,
  inToCm,
  cmToFtIn,
  ftInToCm,
  mgDlToMmolL,
  mmolLToMgDl,
} from "./vitals-units";

// ---------------------------------------------------------------------------
// 2. Derived clinical values
// ---------------------------------------------------------------------------

/** Round to a fixed number of decimals (avoids `-0` and float noise). */
function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor + 0;
}

/**
 * Mean arterial pressure = diastolic + (systolic − diastolic) / 3.
 * Null-safe; returns null when either pressure is missing/invalid, or when
 * diastolic exceeds systolic (physiologically impossible — bad input).
 * Rounded to 1 decimal place.
 */
export function computeMap(
  systolic: number | null | undefined,
  diastolic: number | null | undefined,
): number | null {
  if (systolic == null || diastolic == null) return null;
  if (!Number.isFinite(systolic) || !Number.isFinite(diastolic)) return null;
  if (systolic <= 0 || diastolic <= 0) return null;
  if (diastolic > systolic) return null;
  return roundTo(diastolic + (systolic - diastolic) / 3, 1);
}

/**
 * Body surface area via the Mosteller formula: sqrt(height_cm * weight_kg / 3600).
 * Null-safe; returns null when either input is missing/invalid. Rounded to 2
 * decimals (m²).
 */
export function computeBsa(
  heightCm: number | null | undefined,
  weightKg: number | null | undefined,
): number | null {
  if (heightCm == null || weightKg == null) return null;
  if (!Number.isFinite(heightCm) || !Number.isFinite(weightKg)) return null;
  if (heightCm <= 0 || weightKg <= 0) return null;
  return roundTo(Math.sqrt((heightCm * weightKg) / 3600), 2);
}

// ---------------------------------------------------------------------------
// 3. Advisory range-flag evaluator
// ---------------------------------------------------------------------------

/** Result of an advisory range check (null = no band / not assessable). */
export type RangeFlag = "low" | "normal" | "high" | null;

/**
 * Classify a canonical-unit value against the vital's advisory band.
 * Returns null when the value is missing or the vital has no advisory band
 * (e.g. weight, height, pain — context-dependent, no flat flag).
 *
 * Bands are inclusive on both edges: `value < low → 'low'`,
 * `value > high → 'high'`, otherwise `'normal'`.
 */
export function evaluateRange(
  key: VitalKey,
  canonicalValue: number | null | undefined,
  ctx: RangeContext = {},
): RangeFlag {
  if (canonicalValue == null || !Number.isFinite(canonicalValue)) return null;
  const band = resolveVital(key).range(ctx);
  if (band == null) return null;
  if (canonicalValue < band.low) return "low";
  if (canonicalValue > band.high) return "high";
  return "normal";
}

export type {
  CategorizeContext,
  VitalCategoryDirection,
  VitalCategoryResult,
  VitalCategorySeverity,
} from "./vital-categories";
export {
  categorizeBpPair,
  categorizeVital,
  categoryIconClass,
  rangeFlagToCategory,
} from "./vital-categories";
