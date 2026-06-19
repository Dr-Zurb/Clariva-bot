/**
 * Vitals 2.0 registry (objective-tab · obj-06).
 *
 * Pure data module — no React, no network, no side effects. The Vitals analog
 * of `exam-schema.ts`: one `VitalDefinition` per measured numeric vital,
 * carrying its canonical unit, display units (+ conversion), input step, and an
 * advisory range band (age/sex-aware where it matters).
 *
 * Scope: the 7 shipped vitals (migration 103) + obj-05's extended numeric set
 * (migration 151). The two categorical qualifiers `vitalsBpPosture` /
 * `vitalsBpLimb` are NOT in this registry — they are plain selects rendered
 * directly in the grid (obj-07), with no unit/range math.
 *
 * Hard bounds (`hardMin`/`hardMax`) mirror the migration-103/151 CHECK
 * constraints in canonical units. Advisory `range` bands are guidance only and
 * never exceed these hard bounds (asserted in tests). No pediatric percentile
 * curves (P2-D4) — only flat or coarse age/sex-banded advisory ranges.
 *
 * Conversion is delegated to the named converters in `vitals-derive.ts`; this
 * module references them only as function values (hoisted), so the cyclic
 * import with `evaluateRange` is safe.
 */

import {
  cmToIn,
  cToF,
  fToC,
  inToCm,
  kgToLb,
  lbToKg,
  mgDlToMmolL,
  mmolLToMgDl,
} from "./vitals-derive";

/** Canonical (numeric) vital keys — each matches an `RxFormFields` key. */
export type VitalKey =
  | "vitalsBpSystolic"
  | "vitalsBpDiastolic"
  | "vitalsHr"
  | "vitalsRr"
  | "vitalsTempC"
  | "vitalsSpo2"
  | "vitalsWtKg"
  | "vitalsHtCm"
  | "vitalsPainScore"
  | "vitalsGlucoseMgDl"
  | "vitalsGcsTotal"
  | "vitalsHeadCircumferenceCm"
  | "vitalsMuacCm"
  | "vitalsWaistCm";

/** Patient context used to resolve age/sex-aware advisory bands. */
export interface RangeContext {
  ageYears?: number | null;
  sex?: "male" | "female" | null;
}

/** Inclusive advisory band in canonical units. `value < low → low`, `> high → high`. */
export interface RangeBand {
  low: number;
  high: number;
}

/** One selectable display unit for a vital, with conversion to/from canonical. */
export interface VitalUnit {
  /** Symbol shown in the UI, e.g. `°C`, `mmHg`, `mg/dL`. */
  unit: string;
  /** Long label for unit pickers, e.g. `Celsius`. */
  label: string;
  /** Input step in this unit. */
  step: number;
  /** Decimal places to display in this unit. */
  precision: number;
  /** Convert a value entered in this unit INTO the canonical unit. */
  toCanonical: (value: number) => number;
  /** Convert a canonical value INTO this unit for display. */
  fromCanonical: (value: number) => number;
}

/** Full definition of a single numeric vital. */
export interface VitalDefinition {
  key: VitalKey;
  label: string;
  /** Canonical (storage) unit symbol. */
  canonicalUnit: string;
  /** Display units; index 0 is the canonical/default unit. */
  displayUnits: readonly VitalUnit[];
  /** True for vitals only meaningful in pediatrics (head circumference, MUAC). */
  pedsOnly: boolean;
  /** Hard storage minimum in canonical units (mirrors migration CHECK). */
  hardMin: number;
  /** Hard storage maximum in canonical units (mirrors migration CHECK). */
  hardMax: number;
  /** Advisory band resolver; returns null when no flag applies for this vital. */
  range: (ctx: RangeContext) => RangeBand | null;
}

const identity = (value: number): number => value;

/** Build a canonical (no-conversion) display unit. */
function canonicalUnit(
  unit: string,
  label: string,
  step: number,
  precision: number,
): VitalUnit {
  return { unit, label, step, precision, toCanonical: identity, fromCanonical: identity };
}

/** Vitals without an advisory flag (context-dependent or non-clinical to band). */
const NO_BAND = (): RangeBand | null => null;

// ---------------------------------------------------------------------------
// Ordered registry. Array order is the canonical render order (obj-07).
// ---------------------------------------------------------------------------

export const VITALS_REGISTRY: readonly VitalDefinition[] = [
  {
    key: "vitalsBpSystolic",
    label: "BP Systolic",
    canonicalUnit: "mmHg",
    displayUnits: [canonicalUnit("mmHg", "mmHg", 1, 0)],
    pedsOnly: false,
    hardMin: 30,
    hardMax: 300,
    range: ({ ageYears }) => {
      if (ageYears == null || ageYears >= 13) return { low: 90, high: 129 };
      if (ageYears < 1) return { low: 70, high: 100 };
      if (ageYears < 6) return { low: 80, high: 110 };
      return { low: 90, high: 120 };
    },
  },
  {
    key: "vitalsBpDiastolic",
    label: "BP Diastolic",
    canonicalUnit: "mmHg",
    displayUnits: [canonicalUnit("mmHg", "mmHg", 1, 0)],
    pedsOnly: false,
    hardMin: 20,
    hardMax: 200,
    range: ({ ageYears }) => {
      if (ageYears == null || ageYears >= 13) return { low: 60, high: 84 };
      if (ageYears < 1) return { low: 45, high: 65 };
      if (ageYears < 6) return { low: 50, high: 75 };
      return { low: 55, high: 80 };
    },
  },
  {
    key: "vitalsHr",
    label: "Heart Rate",
    canonicalUnit: "bpm",
    displayUnits: [canonicalUnit("bpm", "beats/min", 1, 0)],
    pedsOnly: false,
    hardMin: 20,
    hardMax: 250,
    range: ({ ageYears }) => {
      if (ageYears == null || ageYears >= 12) return { low: 60, high: 100 };
      if (ageYears < 1) return { low: 100, high: 160 };
      if (ageYears < 3) return { low: 90, high: 150 };
      if (ageYears < 6) return { low: 80, high: 140 };
      return { low: 70, high: 120 };
    },
  },
  {
    key: "vitalsRr",
    label: "Respiratory Rate",
    canonicalUnit: "breaths/min",
    displayUnits: [canonicalUnit("breaths/min", "breaths/min", 1, 0)],
    pedsOnly: false,
    hardMin: 0,
    hardMax: 120,
    range: ({ ageYears }) => {
      if (ageYears == null || ageYears >= 12) return { low: 12, high: 20 };
      if (ageYears < 1) return { low: 30, high: 60 };
      if (ageYears < 3) return { low: 24, high: 40 };
      if (ageYears < 6) return { low: 22, high: 34 };
      return { low: 18, high: 30 };
    },
  },
  {
    key: "vitalsTempC",
    label: "Temperature",
    canonicalUnit: "°C",
    displayUnits: [
      canonicalUnit("°C", "Celsius", 0.1, 1),
      { unit: "°F", label: "Fahrenheit", step: 0.1, precision: 1, toCanonical: fToC, fromCanonical: cToF },
    ],
    pedsOnly: false,
    hardMin: 30,
    hardMax: 45,
    range: () => ({ low: 36.1, high: 37.5 }),
  },
  {
    key: "vitalsSpo2",
    label: "SpO₂",
    canonicalUnit: "%",
    displayUnits: [canonicalUnit("%", "percent", 1, 0)],
    pedsOnly: false,
    hardMin: 0,
    hardMax: 100,
    range: () => ({ low: 95, high: 100 }),
  },
  {
    key: "vitalsWtKg",
    label: "Weight",
    canonicalUnit: "kg",
    displayUnits: [
      canonicalUnit("kg", "Kilograms", 0.1, 1),
      { unit: "lb", label: "Pounds", step: 0.1, precision: 1, toCanonical: lbToKg, fromCanonical: kgToLb },
    ],
    pedsOnly: false,
    hardMin: 0.5,
    hardMax: 500,
    range: NO_BAND,
  },
  {
    key: "vitalsHtCm",
    label: "Height",
    canonicalUnit: "cm",
    displayUnits: [
      canonicalUnit("cm", "Centimetres", 0.5, 1),
      { unit: "in", label: "Inches", step: 0.1, precision: 1, toCanonical: inToCm, fromCanonical: cmToIn },
    ],
    pedsOnly: false,
    hardMin: 20,
    hardMax: 250,
    range: NO_BAND,
  },
  {
    key: "vitalsPainScore",
    label: "Pain Score",
    canonicalUnit: "/10",
    displayUnits: [canonicalUnit("/10", "0–10 scale", 1, 0)],
    pedsOnly: false,
    hardMin: 0,
    hardMax: 10,
    range: NO_BAND,
  },
  {
    key: "vitalsGlucoseMgDl",
    label: "Blood Glucose",
    canonicalUnit: "mg/dL",
    displayUnits: [
      canonicalUnit("mg/dL", "mg/dL", 1, 0),
      { unit: "mmol/L", label: "mmol/L", step: 0.1, precision: 1, toCanonical: mmolLToMgDl, fromCanonical: mgDlToMmolL },
    ],
    pedsOnly: false,
    hardMin: 10,
    hardMax: 1500,
    range: () => ({ low: 70, high: 140 }),
  },
  {
    key: "vitalsGcsTotal",
    label: "GCS Total",
    canonicalUnit: "/15",
    displayUnits: [canonicalUnit("/15", "3–15 scale", 1, 0)],
    pedsOnly: false,
    hardMin: 3,
    hardMax: 15,
    // 15 = fully conscious; anything below the band edge flags 'low' (impaired).
    range: () => ({ low: 15, high: 15 }),
  },
  {
    key: "vitalsHeadCircumferenceCm",
    label: "Head Circumference",
    canonicalUnit: "cm",
    displayUnits: [
      canonicalUnit("cm", "Centimetres", 0.1, 1),
      { unit: "in", label: "Inches", step: 0.1, precision: 1, toCanonical: inToCm, fromCanonical: cmToIn },
    ],
    pedsOnly: true,
    hardMin: 10,
    hardMax: 80,
    // No flat band — clinically read against age/sex percentile curves (P2-D4 / P6).
    range: NO_BAND,
  },
  {
    key: "vitalsMuacCm",
    label: "MUAC",
    canonicalUnit: "cm",
    displayUnits: [
      canonicalUnit("cm", "Centimetres", 0.1, 1),
      { unit: "in", label: "Inches", step: 0.1, precision: 1, toCanonical: inToCm, fromCanonical: cmToIn },
    ],
    pedsOnly: true,
    hardMin: 5,
    hardMax: 60,
    // WHO flat advisory cutoff: < 11.5 cm flags malnutrition. No upper flag.
    range: () => ({ low: 11.5, high: 60 }),
  },
  {
    key: "vitalsWaistCm",
    label: "Waist Circumference",
    canonicalUnit: "cm",
    displayUnits: [
      canonicalUnit("cm", "Centimetres", 0.1, 1),
      { unit: "in", label: "Inches", step: 0.1, precision: 1, toCanonical: inToCm, fromCanonical: cmToIn },
    ],
    pedsOnly: false,
    hardMin: 20,
    hardMax: 300,
    // Sex-aware abdominal-obesity cutoff (Asian/Indian): > 90 cm male, > 80 cm
    // female. No low flag — `low` pinned to hardMin so valid values never flag low.
    range: ({ sex }) => ({ low: 20, high: sex === "female" ? 80 : 90 }),
  },
] as const;

/** Canonical render order — single source for the vitals grid (obj-07). */
export const VITAL_ORDER: readonly VitalKey[] = VITALS_REGISTRY.map((v) => v.key);

const BY_KEY = new Map<VitalKey, VitalDefinition>(
  VITALS_REGISTRY.map((v) => [v.key, v]),
);

/** Resolve a vital key to its definition. Throws on an unknown key (programmer error). */
export function resolveVital(key: VitalKey): VitalDefinition {
  const def = BY_KEY.get(key);
  if (!def) throw new Error(`Unknown vital key: ${key}`);
  return def;
}

/** Return the ordered vitals registry. */
export function listVitals(): readonly VitalDefinition[] {
  return VITALS_REGISTRY;
}
