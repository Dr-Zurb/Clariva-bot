/**
 * Bundled pediatric growth reference checkpoints (objective-tab · obj-28 · P6-D3).
 *
 * **Config, not PHI** — public percentile checkpoints derived from:
 *   - WHO Child Growth Standards (2006): weight/length/head-circumference-for-age 0–5y
 *   - IAP growth chart practice (India default region) for clinical overlay
 *
 * Version: `who-iap-v1`. Values are tabulated at selected ages (months); the
 * accessor linearly interpolates between checkpoints. No patient data is stored.
 *
 * @see https://www.who.int/tools/child-growth-standards
 */

export const GROWTH_REFERENCE_VERSION = "who-iap-v1" as const;

export const GROWTH_REFERENCE_PROVENANCE = {
  version: GROWTH_REFERENCE_VERSION,
  regionDefault: "India (IAP/WHO clinical practice)",
  sources: [
    "WHO Child Growth Standards (2006) — weight-for-age, length/height-for-age, head circumference-for-age",
    "IAP adapted growth charts for 0–5 years (percentile overlay)",
  ],
  interpolation: "Linear between tabulated age-month checkpoints (0–60 months)",
  phi: false,
} as const;

/** Inclusive percentile checkpoint at a given age. */
export interface GrowthReferenceCheckpoint {
  ageMonths: number;
  p3: number;
  p50: number;
  p97: number;
}

export type GrowthMetricKey = "weight_kg" | "height_cm" | "head_circumference_cm";
export type GrowthSex = "male" | "female";

type GrowthReferenceTable = Record<GrowthMetricKey, Record<GrowthSex, GrowthReferenceCheckpoint[]>>;

/** Tabulated P3/P50/P97 checkpoints — sparse but sourced; interpolated at read time. */
export const GROWTH_REFERENCE: GrowthReferenceTable = {
  weight_kg: {
    male: [
      { ageMonths: 0, p3: 2.5, p50: 3.3, p97: 4.4 },
      { ageMonths: 3, p3: 5.0, p50: 6.4, p97: 8.0 },
      { ageMonths: 6, p3: 6.4, p50: 7.9, p97: 9.8 },
      { ageMonths: 9, p3: 7.3, p50: 8.9, p97: 11.0 },
      { ageMonths: 12, p3: 7.8, p50: 9.6, p97: 11.8 },
      { ageMonths: 18, p3: 8.8, p50: 10.9, p97: 13.5 },
      { ageMonths: 24, p3: 9.8, p50: 12.2, p97: 15.3 },
      { ageMonths: 36, p3: 11.3, p50: 14.3, p97: 18.1 },
      { ageMonths: 48, p3: 12.7, p50: 16.3, p97: 21.0 },
      { ageMonths: 60, p3: 14.1, p50: 18.3, p97: 23.8 },
    ],
    female: [
      { ageMonths: 0, p3: 2.4, p50: 3.2, p97: 4.2 },
      { ageMonths: 3, p3: 4.6, p50: 5.8, p97: 7.5 },
      { ageMonths: 6, p3: 6.0, p50: 7.3, p97: 9.1 },
      { ageMonths: 9, p3: 6.9, p50: 8.4, p97: 10.4 },
      { ageMonths: 12, p3: 7.3, p50: 8.9, p97: 11.2 },
      { ageMonths: 18, p3: 8.3, p50: 10.2, p97: 12.9 },
      { ageMonths: 24, p3: 9.2, p50: 11.5, p97: 14.4 },
      { ageMonths: 36, p3: 10.6, p50: 13.5, p97: 17.2 },
      { ageMonths: 48, p3: 12.0, p50: 15.4, p97: 20.0 },
      { ageMonths: 60, p3: 13.4, p50: 17.4, p97: 22.8 },
    ],
  },
  height_cm: {
    male: [
      { ageMonths: 0, p3: 47.5, p50: 49.9, p97: 52.3 },
      { ageMonths: 3, p3: 58.5, p50: 61.4, p97: 64.3 },
      { ageMonths: 6, p3: 64.5, p50: 67.6, p97: 70.7 },
      { ageMonths: 9, p3: 68.5, p50: 71.8, p97: 75.1 },
      { ageMonths: 12, p3: 72.5, p50: 75.7, p97: 78.9 },
      { ageMonths: 18, p3: 78.5, p50: 82.3, p97: 86.1 },
      { ageMonths: 24, p3: 83.5, p50: 87.1, p97: 90.7 },
      { ageMonths: 36, p3: 89.5, p50: 95.1, p97: 100.7 },
      { ageMonths: 48, p3: 95.5, p50: 102.7, p97: 109.9 },
      { ageMonths: 60, p3: 101.0, p50: 109.4, p97: 117.8 },
    ],
    female: [
      { ageMonths: 0, p3: 46.8, p50: 49.1, p97: 51.4 },
      { ageMonths: 3, p3: 57.2, p50: 59.8, p97: 62.4 },
      { ageMonths: 6, p3: 63.2, p50: 66.1, p97: 69.0 },
      { ageMonths: 9, p3: 67.0, p50: 70.1, p97: 73.2 },
      { ageMonths: 12, p3: 71.0, p50: 74.0, p97: 77.0 },
      { ageMonths: 18, p3: 77.0, p50: 80.7, p97: 84.4 },
      { ageMonths: 24, p3: 82.0, p50: 85.7, p97: 89.4 },
      { ageMonths: 36, p3: 88.5, p50: 94.0, p97: 99.5 },
      { ageMonths: 48, p3: 94.5, p50: 101.6, p97: 108.7 },
      { ageMonths: 60, p3: 100.0, p50: 108.4, p97: 116.8 },
    ],
  },
  head_circumference_cm: {
    male: [
      { ageMonths: 0, p3: 32.6, p50: 34.5, p97: 36.4 },
      { ageMonths: 3, p3: 38.5, p50: 40.5, p97: 42.5 },
      { ageMonths: 6, p3: 41.5, p50: 43.3, p97: 45.1 },
      { ageMonths: 9, p3: 43.0, p50: 44.8, p97: 46.6 },
      { ageMonths: 12, p3: 44.5, p50: 46.1, p97: 47.7 },
      { ageMonths: 18, p3: 45.5, p50: 47.2, p97: 48.9 },
      { ageMonths: 24, p3: 46.0, p50: 47.8, p97: 49.6 },
      { ageMonths: 36, p3: 46.8, p50: 48.8, p97: 50.8 },
      { ageMonths: 48, p3: 47.5, p50: 49.6, p97: 51.7 },
      { ageMonths: 60, p3: 48.0, p50: 50.2, p97: 52.4 },
    ],
    female: [
      { ageMonths: 0, p3: 31.8, p50: 33.9, p97: 36.0 },
      { ageMonths: 3, p3: 37.5, p50: 39.5, p97: 41.5 },
      { ageMonths: 6, p3: 40.5, p50: 42.2, p97: 43.9 },
      { ageMonths: 9, p3: 42.0, p50: 43.8, p97: 45.6 },
      { ageMonths: 12, p3: 43.5, p50: 45.0, p97: 46.5 },
      { ageMonths: 18, p3: 44.5, p50: 46.1, p97: 47.7 },
      { ageMonths: 24, p3: 45.0, p50: 46.6, p97: 48.2 },
      { ageMonths: 36, p3: 45.8, p50: 47.6, p97: 49.4 },
      { ageMonths: 48, p3: 46.5, p50: 48.4, p97: 50.3 },
      { ageMonths: 60, p3: 47.0, p50: 49.0, p97: 51.0 },
    ],
  },
};

/** Maximum age covered by the bundled reference (months). */
export const GROWTH_REFERENCE_MAX_AGE_MONTHS = 60;

export function getGrowthReferenceCheckpoints(
  metric: GrowthMetricKey,
  sex: GrowthSex,
): GrowthReferenceCheckpoint[] {
  return GROWTH_REFERENCE[metric][sex];
}
