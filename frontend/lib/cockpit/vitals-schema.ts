/**
 * Vitals 3.0 numeric registry (objective-tab · obj-06; vitals-section · vit-01).
 *
 * Pure data module — no React, no network, no side effects. The Vitals analog
 * of `exam-schema.ts`: one `VitalDefinition` per measured numeric vital,
 * carrying its canonical unit, display units (+ conversion), input step, an
 * advisory range band (age/sex-aware where it matters), clinical group, and
 * storage location (`column` vs `vitals_json`).
 *
 * Scope: the 7 shipped vitals (migration 103) + obj-05's extended numeric set
 * (migration 151) + vit-01's full catalog (json-backed vitals). The two
 * categorical qualifiers `vitalsBpPosture` / `vitalsBpLimb` and other
 * non-numeric context fields live in `categorical-vitals-schema.ts` (or as
 * plain column selects for posture/limb — obj-07).
 *
 * Hard bounds (`hardMin`/`hardMax`) mirror the migration-103/151 CHECK
 * constraints in canonical units. Advisory `range` bands are guidance only and
 * never exceed these hard bounds (asserted in tests). No pediatric percentile
 * curves (P2-D4) — only flat or coarse age/sex-banded advisory ranges.
 *
 * Conversion is delegated to the named converters in the dependency-free leaf
 * `vitals-units.ts` (also re-exported by `vitals-derive.ts`). Importing from the
 * leaf keeps this registry free of any runtime import cycle with `vitals-derive`.
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
} from "./vitals-units";

/** Clinical grouping for render and hide/unhide menus (vit-05/07). */
export type VitalGroup =
  | "core"
  | "respiratory"
  | "metabolic"
  | "neuro"
  | "paediatric"
  | "obstetric";

/** Where a vital value is persisted — dedicated column or `vitals_json`. */
export type VitalStorage = "column" | "json";

/** Canonical (numeric) vital keys — column keys match shipped `RxFormFields`. */
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
  | "vitalsWaistCm"
  | "vitalsO2FlowLMin"
  | "vitalsFio2Pct"
  | "vitalsPefrLMin"
  | "vitalsBloodKetonesMmolL"
  | "vitalsHipCm"
  | "vitalsGcsE"
  | "vitalsGcsV"
  | "vitalsGcsM"
  | "vitalsPupilSizeLeftMm"
  | "vitalsPupilSizeRightMm"
  | "vitalsCapillaryRefillS"
  | "vitalsFetalHeartRateBpm"
  | "vitalsFundalHeightCm";

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
  /** Clinical group for render / visibility menus. */
  group: VitalGroup;
  /** Persistence location — column (shipped) or `vitals_json` (vit-02). */
  storage: VitalStorage;
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
    group: "core",
    storage: "column",
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
    group: "core",
    storage: "column",
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
    label: "Pulse Rate (PR)",
    canonicalUnit: "bpm",
    displayUnits: [canonicalUnit("bpm", "beats/min", 1, 0)],
    pedsOnly: false,
    group: "core",
    storage: "column",
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
    label: "Respiratory Rate (RR)",
    canonicalUnit: "breaths/min",
    displayUnits: [canonicalUnit("breaths/min", "breaths/min", 1, 0)],
    pedsOnly: false,
    group: "core",
    storage: "column",
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
    group: "core",
    storage: "column",
    hardMin: 30,
    hardMax: 45,
    range: () => ({ low: 35, high: 37.4 }),
  },
  {
    key: "vitalsSpo2",
    label: "Oxygen Saturation (SpO₂)",
    canonicalUnit: "%",
    displayUnits: [canonicalUnit("%", "percent", 1, 0)],
    pedsOnly: false,
    group: "core",
    storage: "column",
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
    group: "core",
    storage: "column",
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
      {
        unit: "ft/in",
        label: "Feet and inches",
        step: 1,
        precision: 0,
        // Composite UI (`HeightVitalField`) — converters unused for single-field entry.
        toCanonical: identity,
        fromCanonical: identity,
      },
    ],
    pedsOnly: false,
    group: "core",
    storage: "column",
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
    group: "core",
    storage: "column",
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
    group: "core",
    storage: "column",
    hardMin: 10,
    hardMax: 1500,
    range: () => ({ low: 70, high: 99 }),
  },
  {
    key: "vitalsGcsTotal",
    label: "Glasgow Coma Scale (GCS)",
    canonicalUnit: "/15",
    displayUnits: [canonicalUnit("/15", "3–15 scale", 1, 0)],
    pedsOnly: false,
    group: "neuro",
    storage: "column",
    hardMin: 3,
    hardMax: 15,
    // 15 = fully conscious; anything below the band edge flags 'low' (impaired).
    range: () => ({ low: 15, high: 15 }),
  },
  {
    key: "vitalsHeadCircumferenceCm",
    label: "Head Circumference (HC)",
    canonicalUnit: "cm",
    displayUnits: [
      canonicalUnit("cm", "Centimetres", 0.1, 1),
      { unit: "in", label: "Inches", step: 0.1, precision: 1, toCanonical: inToCm, fromCanonical: cmToIn },
    ],
    pedsOnly: true,
    group: "paediatric",
    storage: "column",
    hardMin: 10,
    hardMax: 80,
    // No flat band — clinically read against age/sex percentile curves (P2-D4 / P6).
    range: NO_BAND,
  },
  {
    key: "vitalsMuacCm",
    label: "Mid-Upper Arm Circumference (MUAC)",
    canonicalUnit: "cm",
    displayUnits: [
      canonicalUnit("cm", "Centimetres", 0.1, 1),
      { unit: "in", label: "Inches", step: 0.1, precision: 1, toCanonical: inToCm, fromCanonical: cmToIn },
    ],
    pedsOnly: true,
    group: "paediatric",
    storage: "column",
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
    group: "metabolic",
    storage: "column",
    hardMin: 20,
    hardMax: 300,
    // Sex-aware abdominal-obesity cutoff (Asian/Indian): > 90 cm male, > 80 cm
    // female. No low flag — `low` pinned to hardMin so valid values never flag low.
    range: ({ sex }) => ({ low: 20, high: sex === "female" ? 80 : 90 }),
  },
  // ---------------------------------------------------------------------------
  // Respiratory (vit-01 · storage: json)
  // ---------------------------------------------------------------------------
  {
    key: "vitalsO2FlowLMin",
    label: "Oxygen Flow Rate (O₂)",
    canonicalUnit: "L/min",
    displayUnits: [canonicalUnit("L/min", "litres/min", 0.5, 1)],
    pedsOnly: false,
    group: "respiratory",
    storage: "json",
    hardMin: 0,
    hardMax: 50,
    range: () => ({ low: 0.5, high: 6 }),
  },
  {
    key: "vitalsFio2Pct",
    label: "Fraction of Inspired Oxygen (FiO₂)",
    canonicalUnit: "%",
    displayUnits: [canonicalUnit("%", "percent", 1, 0)],
    pedsOnly: false,
    group: "respiratory",
    storage: "json",
    hardMin: 21,
    hardMax: 100,
    range: () => ({ low: 21, high: 100 }),
  },
  {
    key: "vitalsPefrLMin",
    label: "Peak Expiratory Flow Rate (PEFR)",
    canonicalUnit: "L/min",
    displayUnits: [canonicalUnit("L/min", "litres/min", 10, 0)],
    pedsOnly: false,
    group: "respiratory",
    storage: "json",
    hardMin: 0,
    hardMax: 1000,
    range: ({ ageYears, sex }) => {
      if (ageYears == null || ageYears >= 18) {
        return sex === "female" ? { low: 300, high: 500 } : { low: 400, high: 650 };
      }
      return null;
    },
  },
  // ---------------------------------------------------------------------------
  // Metabolic (vit-01 · storage: json)
  // ---------------------------------------------------------------------------
  {
    key: "vitalsBloodKetonesMmolL",
    label: "Blood Ketones",
    canonicalUnit: "mmol/L",
    displayUnits: [canonicalUnit("mmol/L", "mmol/L", 0.1, 1)],
    pedsOnly: false,
    group: "metabolic",
    storage: "json",
    hardMin: 0,
    hardMax: 20,
    range: () => ({ low: 0, high: 0.6 }),
  },
  {
    key: "vitalsHipCm",
    label: "Hip Circumference",
    canonicalUnit: "cm",
    displayUnits: [
      canonicalUnit("cm", "Centimetres", 0.1, 1),
      { unit: "in", label: "Inches", step: 0.1, precision: 1, toCanonical: inToCm, fromCanonical: cmToIn },
    ],
    pedsOnly: false,
    group: "metabolic",
    storage: "json",
    hardMin: 20,
    hardMax: 300,
    range: NO_BAND,
  },
  // ---------------------------------------------------------------------------
  // Neuro (vit-01 · storage: json)
  // ---------------------------------------------------------------------------
  {
    key: "vitalsGcsE",
    label: "GCS Eye (E)",
    canonicalUnit: "/4",
    displayUnits: [canonicalUnit("/4", "1–4 scale", 1, 0)],
    pedsOnly: false,
    group: "neuro",
    storage: "json",
    hardMin: 1,
    hardMax: 4,
    range: () => ({ low: 4, high: 4 }),
  },
  {
    key: "vitalsGcsV",
    label: "GCS Verbal (V)",
    canonicalUnit: "/5",
    displayUnits: [canonicalUnit("/5", "1–5 scale", 1, 0)],
    pedsOnly: false,
    group: "neuro",
    storage: "json",
    hardMin: 1,
    hardMax: 5,
    range: () => ({ low: 5, high: 5 }),
  },
  {
    key: "vitalsGcsM",
    label: "GCS Motor (M)",
    canonicalUnit: "/6",
    displayUnits: [canonicalUnit("/6", "1–6 scale", 1, 0)],
    pedsOnly: false,
    group: "neuro",
    storage: "json",
    hardMin: 1,
    hardMax: 6,
    range: () => ({ low: 6, high: 6 }),
  },
  {
    key: "vitalsPupilSizeLeftMm",
    label: "Pupil Size (L)",
    canonicalUnit: "mm",
    displayUnits: [canonicalUnit("mm", "millimetres", 0.5, 1)],
    pedsOnly: false,
    group: "neuro",
    storage: "json",
    hardMin: 1,
    hardMax: 15,
    range: () => ({ low: 2, high: 5 }),
  },
  {
    key: "vitalsPupilSizeRightMm",
    label: "Pupil Size (R)",
    canonicalUnit: "mm",
    displayUnits: [canonicalUnit("mm", "millimetres", 0.5, 1)],
    pedsOnly: false,
    group: "neuro",
    storage: "json",
    hardMin: 1,
    hardMax: 15,
    range: () => ({ low: 2, high: 5 }),
  },
  {
    key: "vitalsCapillaryRefillS",
    label: "Capillary Refill",
    canonicalUnit: "s",
    displayUnits: [canonicalUnit("s", "seconds", 0.5, 1)],
    pedsOnly: false,
    group: "neuro",
    storage: "json",
    hardMin: 0,
    hardMax: 30,
    range: () => ({ low: 0, high: 2 }),
  },
  // ---------------------------------------------------------------------------
  // Obstetric (vit-01 · storage: json)
  // ---------------------------------------------------------------------------
  {
    key: "vitalsFetalHeartRateBpm",
    label: "Fetal Heart Rate",
    canonicalUnit: "bpm",
    displayUnits: [canonicalUnit("bpm", "beats/min", 1, 0)],
    pedsOnly: false,
    group: "obstetric",
    storage: "json",
    hardMin: 50,
    hardMax: 250,
    range: () => ({ low: 110, high: 160 }),
  },
  {
    key: "vitalsFundalHeightCm",
    label: "Fundal Height",
    canonicalUnit: "cm",
    displayUnits: [canonicalUnit("cm", "Centimetres", 0.5, 1)],
    pedsOnly: false,
    group: "obstetric",
    storage: "json",
    hardMin: 0,
    hardMax: 50,
    range: NO_BAND,
  },
] as const;

/** Keys persisted in dedicated prescription columns (migrations 103/151). */
export type ColumnVitalKey = Extract<
  (typeof VITALS_REGISTRY)[number],
  { storage: "column" }
>["key"];

/** Canonical render order — single source for the vitals grid (obj-07 / vit-05). */
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

/** Partition numeric vitals by clinical group. */
export function listVitalsByGroup(group: VitalGroup): readonly VitalDefinition[] {
  return VITALS_REGISTRY.filter((v) => v.group === group);
}

/** Partition numeric vitals by storage location. */
export function vitalsByStorage(storage: VitalStorage): readonly VitalDefinition[] {
  return VITALS_REGISTRY.filter((v) => v.storage === storage);
}
