/**
 * Vitals unit converters — pure, dependency-free leaf module.
 *
 * Extracted from `vitals-derive.ts` so the converters can be shared by both
 * `vitals-schema.ts` (which references them at module-init time inside
 * `VITALS_REGISTRY`) and `vitals-derive.ts` (which re-exports them) without a
 * runtime import cycle between schema and derive.
 *
 * Every converter pair (e.g. `cToF`/`fToC`) is an exact affine inverse, so
 * `fToC(cToF(x)) === x` to within floating-point epsilon (asserted < 1e-9 in
 * tests; obj-08 close-gate relies on this).
 */

/** Pounds per kilogram (international avoirdupois pound, exact). */
const KG_PER_LB = 0.45359237;
/** Centimetres per inch (exact). */
const CM_PER_IN = 2.54;
/** mg/dL per mmol/L for glucose (molar mass of glucose ≈ 180.182). */
const MG_DL_PER_MMOL_L = 18.0182;

/** °C → °F. */
export function cToF(celsius: number): number {
  return (celsius * 9) / 5 + 32;
}

/** °F → °C. */
export function fToC(fahrenheit: number): number {
  return ((fahrenheit - 32) * 5) / 9;
}

/** kg → lb. */
export function kgToLb(kg: number): number {
  return kg / KG_PER_LB;
}

/** lb → kg. */
export function lbToKg(lb: number): number {
  return lb * KG_PER_LB;
}

/** cm → in. */
export function cmToIn(cm: number): number {
  return cm / CM_PER_IN;
}

/** in → cm. */
export function inToCm(inches: number): number {
  return inches * CM_PER_IN;
}

/** Feet + inches parts for height display (inches 0–11). */
export interface FtInParts {
  feet: number;
  inches: number;
}

/** Canonical cm → whole feet and inches (common clinical height format). */
export function cmToFtIn(cm: number): FtInParts {
  const totalIn = cm / CM_PER_IN;
  let feet = Math.floor(totalIn / 12);
  let inches = Math.round(totalIn - feet * 12);
  if (inches === 12) {
    feet += 1;
    inches = 0;
  }
  return { feet, inches };
}

/** Feet and inches → canonical cm. */
export function ftInToCm(feet: number, inches: number): number {
  return (feet * 12 + inches) * CM_PER_IN;
}

/** mg/dL → mmol/L (glucose). */
export function mgDlToMmolL(mgDl: number): number {
  return mgDl / MG_DL_PER_MMOL_L;
}

/** mmol/L → mg/dL (glucose). */
export function mmolLToMgDl(mmolL: number): number {
  return mmolL * MG_DL_PER_MMOL_L;
}
